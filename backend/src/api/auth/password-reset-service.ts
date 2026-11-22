import { customerNotifications } from "../notifications/notification-service.js";
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "../../db.js";
import type { ApiConfig } from "../config.js";
import { ApiError } from "../errors.js";
import type { Mailer } from "../mail/mailer.js";
import { hashAuditValue, hashPassword, validatePasswordPolicy } from "./crypto.js";
import type { RequestFingerprint } from "./auth-service.js";

/* PASSWORD RECOVERY
   request : always answers the same way (no account enumeration). Only an ACTIVE, non-erased account gets a token, at most MAX_PER_HOUR per hour.
   token   : 256 random bits, shown once in the e-mail link; only a salted SHA-256 is stored. Short-lived and single use. A new request voids older tokens.
   confirm : claims the token with one compare-and-set UPDATE (parallel confirmations cannot both win), sets the new password, bumps tokenVersion
             (every access token dies), revokes every refresh session and every administrator session. The user must sign in again. */
export const PASSWORD_RESET_MIN_RESPONSE_MS = 350;
const MAX_PER_HOUR = 3;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

const MSG = {
  invalidToken: "Нууц үг сэргээх холбоос хүчингүй эсвэл хугацаа нь дууссан байна. Шинэ холбоос авна уу.",
  weakPassword: "Нууц үг 10-аас 128 тэмдэгт байх ёстой.",
  requestSubject: "BusinessMRI.mn: нууц үг сэргээх холбоос",
  changedSubject: "BusinessMRI.mn: нууц үг солигдлоо"
};

export class PasswordResetService {
  /** Password recovery ONLY. Registration (mailbox ownership) is a separate service with its own code, table purpose, hash namespace, route and page: see email-verification-service.ts. */
  private readonly purpose = "PASSWORD_RESET" as const;
  constructor(private readonly config: ApiConfig, private readonly mailer: Mailer) {}

  hashToken(token: string): string {
    return createHash("sha256").update(`mmri-pwreset:${this.config.auditSalt}:${token}`).digest("hex");
  }

  /** Public routes mask errors and pad responses to cover the provider timeout. No plaintext token is stored. */
  async requestReset(emailRaw: unknown, fp: RequestFingerprint): Promise<void> {
    const email = String(emailRaw ?? "").trim().toLowerCase();
    const emailHash = hashAuditValue(email, this.config.auditSalt);
    const user = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254 ? await prisma.user.findUnique({ where: { email } }) : null;
    if (!user || user.status !== "ACTIVE" || user.erasedAt || (user.emailVerificationRequired && !user.emailVerifiedAt)) {
      await this.audit(null, `${this.purpose}_REQUESTED_NO_ACCOUNT`, fp, { emailHash });
      return;
    }
    const token = randomBytes(32).toString("base64url");
    const now = new Date();
    const issued = await prisma.$transaction(async tx => {
      // Serialize request/count/invalidation and confirmation across every API instance.
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${user.id} FOR UPDATE`;
      const current = await tx.user.findUnique({ where: { id: user.id } });
      if (!current || current.email !== email || current.status !== "ACTIVE" || current.erasedAt || (current.emailVerificationRequired && !current.emailVerifiedAt)) return null;
      const recent = await tx.passwordResetToken.count({ where: { userId: user.id, purpose: this.purpose, createdAt: { gt: new Date(now.getTime() - 3_600_000) } } });
      const latest = await tx.passwordResetToken.findFirst({ where: { userId: user.id, purpose: this.purpose }, orderBy: { createdAt: "desc" } });
      if (recent >= MAX_PER_HOUR || (latest && now.getTime() - latest.createdAt.getTime() < 60_000)) return null;
      await tx.passwordResetToken.updateMany({ where: { userId: user.id, purpose: this.purpose, usedAt: null }, data: { usedAt: now } });
      const row = await tx.passwordResetToken.create({ data: {
        userId: user.id, purpose: this.purpose, tokenHash: this.hashToken(token),
        expiresAt: new Date(now.getTime() + this.config.passwordResetTtlMinutes * 60_000),
        requestIpHash: hashAuditValue(fp.ip, this.config.auditSalt)
      } });
      return { id: row.id };
    });
    if (!issued) { await this.audit(user.id, `${this.purpose}_REQUEST_THROTTLED`, fp); return; }
    const link = `${this.config.publicAppUrl}/#/reset-password?token=${token}`;
    let result;
    try{result = await this.mailer.send({
      to: user.email,
      kind: this.purpose,
      subject: MSG.requestSubject,
      text: `Сайн байна уу.\n\nБидэнд таны BusinessMRI.mn бүртгэлийн нууц үгийг сэргээх хүсэлт ирсэн. Шинэ нууц үг тогтоохын тулд доорх холбоос дээр дарна уу:\n\n${link}\n\nХолбоос ${this.config.passwordResetTtlMinutes} минутын дотор, зөвхөн нэг удаа ажиллана.\nХэрэв та энэ хүсэлтийг гаргаагүй бол юу ч хийх шаардлагагүй, таны нууц үг өөрчлөгдөхгүй.\n`
    })}catch{
      await prisma.passwordResetToken.deleteMany({ where: { id: issued.id } }).catch(() => undefined);   // MAIL-01: an undelivered link must not consume the retry budget
      await this.audit(user.id,`${this.purpose}_DELIVERY_FAILED`,fp,{provider:this.mailer.provider});
      throw new Error("Mail delivery request failed");
    }
    await this.audit(user.id, result.delivered ? `${this.purpose}_REQUESTED` : `${this.purpose}_REQUESTED_NOT_DELIVERED`, fp, { provider: result.provider });
  }

  async confirmReset(tokenRaw: unknown, newPassword: unknown, fp: RequestFingerprint): Promise<void> {
    const token = String(tokenRaw ?? "");
    if (!TOKEN_PATTERN.test(token)) throw new ApiError(400, "INVALID_RESET_TOKEN", MSG.invalidToken);
    try { validatePasswordPolicy(String(newPassword ?? "")); } catch { throw new ApiError(400, "WEAK_PASSWORD", MSG.weakPassword); }
    const tokenHash = this.hashToken(token);
    const row = await prisma.passwordResetToken.findUnique({ where: { tokenHash }, include: { user: true } });
    if (!row || row.purpose !== this.purpose || row.usedAt || row.expiresAt <= new Date() || row.user.status !== "ACTIVE" || row.user.erasedAt) {
      await this.audit(row?.userId ?? null, `${this.purpose}_REJECTED`, fp);
      throw new ApiError(400, "INVALID_RESET_TOKEN", MSG.invalidToken);
    }
    const passwordHash = await hashPassword(String(newPassword), this.config.passwordPepper);
    await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${row.userId} FOR UPDATE`;
      const now = new Date();
      const current = await tx.user.findUnique({ where: { id: row.userId } });
      if (!current || current.status !== "ACTIVE" || current.erasedAt) throw new ApiError(400, "INVALID_RESET_TOKEN", MSG.invalidToken);
      const claimed = await tx.passwordResetToken.updateMany({ where: { id: row.id, usedAt: null, expiresAt: { gt: now } }, data: { usedAt: now } });
      if (claimed.count !== 1) throw new ApiError(400, "INVALID_RESET_TOKEN", MSG.invalidToken);
      await tx.user.update({ where: { id: row.userId }, data: { passwordHash, tokenVersion: { increment: 1 } } });
      await tx.refreshSession.updateMany({ where: { userId: row.userId, revokedAt: null }, data: { revokedAt: now } });
      // Administrator sessions are separate opaque tokens that ignore tokenVersion: revoke them in the same transaction so no old admin token outlives the reset. MFA enrolment is untouched.
      const adminAccount = await tx.adminAccount.findUnique({ where: { userId: row.userId }, select: { id: true } });
      if (adminAccount) await tx.adminSession.updateMany({ where: { adminId: adminAccount.id, revokedAt: null }, data: { revokedAt: now } });
      await tx.passwordResetToken.updateMany({ where: { userId: row.userId, usedAt: null }, data: { usedAt: now } });
      await this.audit(row.userId, `${this.purpose}_COMPLETED`, fp, undefined, tx);
    });
    await customerNotifications.passwordChanged(row.userId, row.id);
    await this.mailer.send({
      to: row.user.email,
      kind: "PASSWORD_CHANGED",
      subject: MSG.changedSubject,
      text: "Сайн байна уу.\n\nТаны BusinessMRI.mn бүртгэлийн нууц үг амжилттай солигдлоо. Бүх төхөөрөмжөөс гарсан тул шинэ нууц үгээрээ дахин нэвтэрнэ үү.\nХэрэв та үүнийг хийгээгүй бол яаралтай бидэнтэй холбогдоно уу.\n"
    }).catch(() => undefined);
  }

  private audit(userId: string | null, eventType: string, fp: RequestFingerprint, metadata?: unknown, client: any = prisma) {
    return client.authAuditEvent.create({ data: {
      userId, eventType,
      ipHash: hashAuditValue(fp.ip, this.config.auditSalt),
      userAgentHash: hashAuditValue(fp.userAgent, this.config.auditSalt),
      metadata: metadata as any
    } });
  }
}
