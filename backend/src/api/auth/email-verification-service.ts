import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { prisma } from "../../db.js";
import type { ApiConfig } from "../config.js";
import { ApiError } from "../errors.js";
import type { Mailer } from "../mail/mailer.js";
import { customerNotifications } from "../notifications/notification-service.js";
import { hashAuditValue } from "./crypto.js";
import type { RequestFingerprint } from "./auth-service.js";

/* REGISTRATION E-MAIL VERIFICATION (mailbox ownership). Completely separate from password recovery:
   - a 6-digit one-time CODE typed on a dedicated page (#/verify-email), never a link and never a password form;
   - stored in password_reset_tokens with its OWN purpose (EMAIL_VERIFICATION_CODE) and its own hash namespace that includes the user id, so a code can never match a
     password-reset token (43-char link token, purpose PASSWORD_RESET) and a reset token can never verify an e-mail;
   - the code only sets emailVerifiedAt. It cannot change a password or touch any session;
   - 10 minute lifetime, single use (compare-and-set claim), a new code voids older ones, 60 s resend cooldown, at most 5 codes per hour, at most 5 wrong guesses per code
     (counted in the persistent audit log, so it holds across API instances), plus the route-level IP/account rate limits;
   - every failure (unknown address, already verified, wrong, expired, used, too many attempts) gives the SAME answer, so the endpoint never reveals which addresses exist. */
/* The existing CHECK constraint on password_reset_tokens.purpose allows only PASSWORD_RESET and EMAIL_VERIFICATION, so no migration is needed. Old link tokens of this purpose are 43-char hashes in another namespace and can never match a code. */
export const EMAIL_CODE_PURPOSE = "EMAIL_VERIFICATION";
export const EMAIL_CODE_TTL_MINUTES = 10;
export const EMAIL_CODE_COOLDOWN_SECONDS = 60;
const MAX_CODES_PER_HOUR = 5;
const MAX_WRONG_GUESSES = 5;
const CODE_PATTERN = /^\d{6}$/;

const MSG = {
  invalid: "Код буруу эсвэл хугацаа нь дууссан байна. Шинэ код авна уу.",
  subject: "BusinessMRI.mn: имэйл баталгаажуулах код"
};

export class EmailVerificationService {
  constructor(private readonly config: ApiConfig, private readonly mailer: Mailer) {}

  /** Namespace and user id are part of the hash: the same digits for two users, or a password-reset token, never collide. */
  hashCode(userId: string, code: string): string {
    return createHash("sha256").update(`mmri-email-code:${this.config.auditSalt}:${userId}:${code}`).digest("hex");
  }

  /** Registration and "resend": always silent about whether the address exists. */
  async requestCode(emailRaw: unknown, fp: RequestFingerprint): Promise<void> {
    const email = String(emailRaw ?? "").trim().toLowerCase();
    const emailHash = hashAuditValue(email, this.config.auditSalt);
    const user = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254 ? await prisma.user.findUnique({ where: { email } }) : null;
    if (!user || user.status !== "ACTIVE" || user.erasedAt || !user.emailVerificationRequired || user.emailVerifiedAt) {
      await this.audit(null, "EMAIL_CODE_REQUESTED_NO_ACCOUNT", fp, { emailHash });
      return;
    }
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const now = new Date();
    const issued = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${user.id} FOR UPDATE`;
      const current = await tx.user.findUnique({ where: { id: user.id } });
      if (!current || current.email !== email || current.status !== "ACTIVE" || current.erasedAt || !current.emailVerificationRequired || current.emailVerifiedAt) return null;
      const recent = await tx.passwordResetToken.count({ where: { userId: user.id, purpose: EMAIL_CODE_PURPOSE, createdAt: { gt: new Date(now.getTime() - 3_600_000) } } });
      const latest = await tx.passwordResetToken.findFirst({ where: { userId: user.id, purpose: EMAIL_CODE_PURPOSE }, orderBy: { createdAt: "desc" } });
      if (recent >= MAX_CODES_PER_HOUR || (latest && now.getTime() - latest.createdAt.getTime() < EMAIL_CODE_COOLDOWN_SECONDS * 1000)) return null;
      await tx.passwordResetToken.updateMany({ where: { userId: user.id, purpose: EMAIL_CODE_PURPOSE, usedAt: null }, data: { usedAt: now } });
      const row = await tx.passwordResetToken.create({ data: {
        userId: user.id, purpose: EMAIL_CODE_PURPOSE, tokenHash: this.hashCode(user.id, code),
        expiresAt: new Date(now.getTime() + EMAIL_CODE_TTL_MINUTES * 60_000),
        requestIpHash: hashAuditValue(fp.ip, this.config.auditSalt)
      } });
      return { id: row.id };
    });
    if (!issued) { await this.audit(user.id, "EMAIL_CODE_REQUEST_THROTTLED", fp); return; }
    let result;
    try {
      result = await this.mailer.send({
        to: user.email,
        kind: "EMAIL_VERIFICATION",
        subject: MSG.subject,
        text: `Сайн байна уу.\n\nТаны BusinessMRI.mn бүртгэлийг баталгаажуулах код:\n\n${code}\n\nКод ${EMAIL_CODE_TTL_MINUTES} минутын дотор, зөвхөн нэг удаа ажиллана. Кодыг BusinessMRI.mn сайтын «Имэйл баталгаажуулах» хуудсанд оруулна уу. Энэ код нууц үг солихад ашиглагдахгүй.\nХэрэв та бүртгүүлээгүй бол энэ имэйлийг үл тоомсорлоно уу. Кодыг хэнд ч дамжуулж болохгүй.`
      });
    } catch {
      // MAIL-01: a code that never left the building must not consume the cooldown or the hourly budget, or a transient outage locks the user out of retrying.
      await prisma.passwordResetToken.deleteMany({ where: { id: issued.id } }).catch(() => undefined);
      await this.audit(user.id, "EMAIL_CODE_DELIVERY_FAILED", fp, { provider: this.mailer.provider });
      throw new Error("Mail delivery request failed");
    }
    if (!result.delivered) await prisma.passwordResetToken.deleteMany({ where: { id: issued.id } }).catch(() => undefined);
    await this.audit(user.id, result.delivered ? "EMAIL_CODE_REQUESTED" : "EMAIL_CODE_REQUESTED_NOT_DELIVERED", fp, { provider: result.provider });
  }

  /** Verifies the code and marks the mailbox as owned. Changes nothing else. */
  async verifyCode(emailRaw: unknown, codeRaw: unknown, fp: RequestFingerprint): Promise<void> {
    const email = String(emailRaw ?? "").trim().toLowerCase();
    const code = String(codeRaw ?? "").replace(/\s+/g, "");
    const reject = async (userId: string | null): Promise<never> => { await this.audit(userId, "EMAIL_CODE_REJECTED", fp); throw new ApiError(400, "INVALID_VERIFICATION_CODE", MSG.invalid); };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || !CODE_PATTERN.test(code)) return reject(null);
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || user.status !== "ACTIVE" || user.erasedAt || !user.emailVerificationRequired || user.emailVerifiedAt) return reject(null);
    /* SEC-02: the whole decision (read the live code, count earlier wrong guesses, compare, record a wrong guess, consume on success) runs in ONE transaction that holds the user row lock. Parallel guesses are therefore
       serialised per account: each one sees every earlier rejection, so the failed-attempt cap holds across workers. A wrong guess is audited INSIDE the transaction and committed (the rejection is thrown afterwards). */
    const outcome = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${user.id} FOR UPDATE`;
      const now = new Date();
      const current = await tx.user.findUnique({ where: { id: user.id } });
      if (!current || current.status !== "ACTIVE" || current.erasedAt || !current.emailVerificationRequired || current.emailVerifiedAt) return "REJECT" as const;
      const row = await tx.passwordResetToken.findFirst({ where: { userId: user.id, purpose: EMAIL_CODE_PURPOSE, usedAt: null, expiresAt: { gt: now } }, orderBy: { createdAt: "desc" } });
      if (!row) { await this.audit(user.id, "EMAIL_CODE_REJECTED", fp, undefined, tx); return "REJECT" as const; }
      const wrong = await tx.authAuditEvent.count({ where: { userId: user.id, eventType: "EMAIL_CODE_REJECTED", createdAt: { gt: row.createdAt } } });
      if (wrong >= MAX_WRONG_GUESSES) {
        await tx.passwordResetToken.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: now } });
        await this.audit(user.id, "EMAIL_CODE_REJECTED", fp, undefined, tx);
        return "REJECT" as const;
      }
      const a = Buffer.from(row.tokenHash, "hex"), b = Buffer.from(this.hashCode(user.id, code), "hex");
      if (a.length !== b.length || !timingSafeEqual(a, b)) { await this.audit(user.id, "EMAIL_CODE_REJECTED", fp, undefined, tx); return "REJECT" as const; }
      const claimed = await tx.passwordResetToken.updateMany({ where: { id: row.id, usedAt: null, expiresAt: { gt: now } }, data: { usedAt: now } });
      if (claimed.count !== 1) return "REJECT" as const;
      await tx.user.update({ where: { id: user.id }, data: { emailVerifiedAt: now } });
      await tx.passwordResetToken.updateMany({ where: { userId: user.id, purpose: EMAIL_CODE_PURPOSE, usedAt: null }, data: { usedAt: now } });
      await this.audit(user.id, "EMAIL_CODE_VERIFIED", fp, undefined, tx);
      return "OK" as const;
    }, { maxWait: 10_000, timeout: 15_000 });
    if (outcome !== "OK") throw new ApiError(400, "INVALID_VERIFICATION_CODE", MSG.invalid);
    await customerNotifications.emailVerified(user.id);
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
