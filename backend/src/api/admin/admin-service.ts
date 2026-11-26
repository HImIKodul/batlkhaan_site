import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import type { Mailer } from "../mail/mailer.js";
import { prisma } from "../../db.js";
import type { ApiConfig } from "../config.js";
import { ApiError } from "../errors.js";
import { hashAuditValue, hashPassword, verifyPassword } from "../auth/crypto.js";
import { decryptSecret, encryptSecret, newTotpSecret, verifyTotp } from "./totp.js";
import type { RequestFingerprint } from "../auth/auth-service.js";

export type AdminRole = "SUPER_ADMIN" | "REPORT_REVIEWER" | "BILLING_REVIEWER";
export type Permission = "reports.read" | "reports.edit" | "reports.approve" | "reports.publish" | "payments.read" | "payments.decide" | "companies.read" | "support.manage" | "notifications.read" | "audit.read" | "admins.manage" | "ops.read" | "accounts.manage";
/* Permissions are decided here on the server from the database role. Nothing the browser sends can widen them. */
export const ROLE_PERMISSIONS: Record<AdminRole, readonly Permission[]> = {
  SUPER_ADMIN: ["reports.read", "reports.edit", "reports.approve", "reports.publish", "payments.read", "payments.decide", "companies.read", "support.manage", "notifications.read", "audit.read", "admins.manage", "ops.read", "accounts.manage"],
  REPORT_REVIEWER: ["reports.read", "reports.edit", "reports.approve", "reports.publish", "companies.read", "support.manage", "notifications.read"],
  BILLING_REVIEWER: ["payments.read", "payments.decide", "companies.read", "support.manage", "notifications.read"]
};
export interface AdminPrincipal { adminId: string; userId: string; email: string; role: AdminRole; sessionId: string; reauthAt: Date | null; permissions: readonly Permission[]; }

const MSG = { codeDelivery: "Баталгаажуулах кодыг илгээж чадсангүй. Түр хүлээгээд дахин оролдоно уу.", codeThrottled: "Код хэт олон удаа хүссэн байна. Нэг минут хүлээгээд дахин оролдоно уу.", badLogin: "Нэвтрэх мэдээлэл буруу байна.", locked: "Хэт олон буруу оролдлого хийсэн тул түр хаагдлаа. Хэсэг хүлээгээд дахин оролдоно уу.", session: "Нэвтрэлтийн хугацаа дууссан байна. Дахин нэвтэрнэ үү.", forbidden: "Энэ үйлдлийг хийх эрх танд байхгүй байна.", reauth: "Энэ үйлдэл нууц үг ба MFA кодоор дахин баталгаажуулахыг шаардана." };
export const REAUTH_WINDOW_MS = 5 * 60_000;
/* E-MAIL CODE (second factor, opt-in per account, OFF by default). Active only when MMRI_ADMIN_EMAIL_OTP=on AND the account's e-mail is listed in MMRI_ADMIN_EMAIL_OTP_ACCOUNTS.
   TOTP keeps working for every account at all times, so enabling this can never lock the owner out; turning TOTP off is a separate, later, deliberate step. */
export const ADMIN_EMAIL_CODE_TTL_MINUTES = 5, ADMIN_EMAIL_CODE_COOLDOWN_SECONDS = 60;
const MAX_EMAIL_CODES_PER_HOUR = 5, MAX_EMAIL_CODE_GUESSES = 5;
export const emailOtpEnabledFor = (email: string): boolean =>
  (process.env.MMRI_ADMIN_EMAIL_OTP ?? "off").trim().toLowerCase() === "on" &&
  (process.env.MMRI_ADMIN_EMAIL_OTP_ACCOUNTS ?? "").split(",").map(x => x.trim().toLowerCase()).filter(Boolean).includes(email.trim().toLowerCase());
const MAX_FAILS = 5, LOCK_MS = 15 * 60_000;
const sha = (t: string) => createHash("sha256").update(`mmri-admin-session:${t}`).digest("hex");

export class AdminService {
  constructor(private readonly config: ApiConfig, private readonly mailer: Mailer | null = null) {}
  private mfaKey() { return this.config.accessTokenSecret + ":admin-mfa"; }

  async audit(adminId: string | null, action: string, outcome: "SUCCESS" | "DENIED" | "FAILURE", fp: RequestFingerprint | null, target?: { type?: string; id?: string }, metadata?: Record<string, unknown>) {
    // never store passwords, tokens, MFA codes, keys or full report bodies in audit metadata
    const safe = metadata ? JSON.parse(JSON.stringify(metadata, (k, v) => /pass|token|secret|code|key|body|narrative|text/i.test(k) ? undefined : v)) : undefined;
    await prisma.adminAuditEvent.create({ data: { adminId, action, outcome, targetType: target?.type, targetId: target?.id, ipHash: hashAuditValue(fp?.ip, this.config.auditSalt), metadata: safe as any } });
  }

  /** Used by the bootstrap CLI. The TOTP secret is returned ONCE to the caller (printed to the terminal, never logged or stored in clear). */
  async createAdmin(input: { email: string; password: string; role: AdminRole; createdByAdminId?: string }) {
    const email = input.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Valid e-mail is required");
    if (input.password.length < 14 || input.password.length > 128 || !/[a-z]/.test(input.password) || !/[A-Z]/.test(input.password) || !/\d/.test(input.password)) throw new Error("Admin password must be 14-128 characters with upper case, lower case and a digit");
    const existing = await prisma.user.findUnique({ where: { email }, include: { } });
    if (existing) { const a = await prisma.adminAccount.findUnique({ where: { userId: existing.id } }); if (a) throw new Error("This e-mail is already an administrator"); throw new Error("This e-mail is already a customer account; use a dedicated admin e-mail"); }
    const passwordHash = await hashPassword(input.password, this.config.passwordPepper);
    const secret = newTotpSecret();
    const result = await prisma.$transaction(async tx => {
      const user = await tx.user.create({ data: { email, passwordHash, displayName: "Administrator" } });
      const admin = await tx.adminAccount.create({ data: { userId: user.id, role: input.role, status: "PENDING_MFA", mfaSecretEnc: encryptSecret(secret, this.mfaKey()), createdByAdminId: input.createdByAdminId } });
      return { user, admin };
    });
    await this.audit(result.admin.id, "ADMIN_CREATED", "SUCCESS", null, { type: "ADMIN", id: result.admin.id }, { role: input.role, by: input.createdByAdminId ?? "CLI" });
    return { adminId: result.admin.id, email, role: input.role, totpSecret: secret };
  }

  async resetMfa(email: string) {
    const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
    const admin = user ? await prisma.adminAccount.findUnique({ where: { userId: user.id } }) : null;
    if (!admin) throw new Error("Administrator not found");
    const secret = newTotpSecret();
    await prisma.$transaction([prisma.adminAccount.update({ where: { id: admin.id }, data: { mfaSecretEnc: encryptSecret(secret, this.mfaKey()), status: "PENDING_MFA", mfaLastStep: 0, failedLogins: 0, lockedUntil: null } }), prisma.adminSession.updateMany({ where: { adminId: admin.id, revokedAt: null }, data: { revokedAt: new Date() } })]);
    await this.audit(admin.id, "ADMIN_MFA_RESET", "SUCCESS", null, { type: "ADMIN", id: admin.id }, { by: "CLI" });
    return { totpSecret: secret };
  }

  /** Serialises every change that can remove an active SUPER_ADMIN (disable, demote) with a transaction-scoped PostgreSQL advisory lock; the "another active SUPER_ADMIN remains" check is re-evaluated INSIDE the lock, so two concurrent changes cannot both pass it. */
  private async withSuperAdminLock<T>(fn: (tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]) => Promise<T>): Promise<T> {
    return prisma.$transaction(async tx => { await tx.$executeRaw`select pg_advisory_xact_lock(hashtext('mmri:admin:super-admin-invariant'))`; return fn(tx); }, { maxWait: 10_000, timeout: 20_000 });
  }

  /** Disables an administrator and revokes its sessions. Refuses to disable the last active SUPER_ADMIN (atomic). */
  async disableAdmin(adminId: string, by: string | null = null, opts: { fp?: RequestFingerprint | null; enforceNotSelf?: boolean } = {}) {
    const result = await this.withSuperAdminLock(async tx => {
      const a = await tx.adminAccount.findUnique({ where: { id: adminId } }); if (!a) throw new ApiError(404, "NOT_FOUND", "Админ олдсонгүй.");
      if (opts.enforceNotSelf && by === a.id) throw new ApiError(409, "SELF", "Өөрийн бүртгэлийг хаах боломжгүй.");
      if (a.role === "SUPER_ADMIN" && a.status !== "DISABLED") { const others = await tx.adminAccount.count({ where: { role: "SUPER_ADMIN", status: "ACTIVE", user:{status:"ACTIVE",erasedAt:null,OR:[{emailVerificationRequired:false},{emailVerifiedAt:{not:null}}]}, id: { not: a.id } } }); if (others === 0) throw new ApiError(409, "LAST_SUPER", "Сүүлчийн SUPER_ADMIN-ийг хаах боломжгүй."); }
      await tx.adminAccount.update({ where: { id: a.id }, data: { status: "DISABLED", disabledAt: new Date() } });
      await tx.adminSession.updateMany({ where: { adminId: a.id, revokedAt: null }, data: { revokedAt: new Date() } });
      return a;
    });
    return result;
  }

  /** Changes an administrator's role and revokes its sessions. Refuses to demote the last active SUPER_ADMIN (atomic). */
  async changeRole(adminId: string, role: AdminRole, by: string | null = null, opts: { enforceNotSelf?: boolean } = {}) {
    return this.withSuperAdminLock(async tx => {
      const a = await tx.adminAccount.findUnique({ where: { id: adminId } }); if (!a) throw new ApiError(404, "NOT_FOUND", "Админ олдсонгүй.");
      if (opts.enforceNotSelf && by === a.id) throw new ApiError(409, "SELF", "Өөрийн эрхийг өөрчлөх боломжгүй.");
      if (a.role === "SUPER_ADMIN" && role !== "SUPER_ADMIN" && a.status !== "DISABLED") { const others = await tx.adminAccount.count({ where: { role: "SUPER_ADMIN", status: "ACTIVE", user:{status:"ACTIVE",erasedAt:null,OR:[{emailVerificationRequired:false},{emailVerifiedAt:{not:null}}]}, id: { not: a.id } } }); if (others === 0) throw new ApiError(409, "LAST_SUPER", "Сүүлчийн SUPER_ADMIN-ийн эрхийг бууруулах боломжгүй."); }
      await tx.adminAccount.update({ where: { id: a.id }, data: { role } });
      await tx.adminSession.updateMany({ where: { adminId: a.id, revokedAt: null }, data: { revokedAt: new Date() } });
      return a;
    });
  }

  async setStatus(email: string, status: "ACTIVE" | "DISABLED", by: string | null = null) {
    const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
    const admin = user ? await prisma.adminAccount.findUnique({ where: { userId: user.id } }) : null;
    if (!admin) throw new Error("Administrator not found");
    if (status === "DISABLED") {
      try { await this.disableAdmin(admin.id, by); } catch (e) { if (e instanceof ApiError && e.code === "LAST_SUPER") throw new Error("The last SUPER_ADMIN cannot be disabled"); throw e; }
    } else {
      await prisma.$transaction([prisma.adminAccount.update({ where: { id: admin.id }, data: { status: "PENDING_MFA", disabledAt: null } }), prisma.adminSession.updateMany({ where: { adminId: admin.id, revokedAt: null }, data: { revokedAt: new Date() } })]);
    }
    await this.audit(admin.id, status === "DISABLED" ? "ADMIN_DISABLED" : "ADMIN_ENABLED", "SUCCESS", null, { type: "ADMIN", id: admin.id }, { by: by ?? "CLI" });
  }

  /** Decrypts the stored MFA secret; returns null (fail closed, same denial as a wrong code) when it is missing or cannot be decrypted. */
  private readSecret(enc: string | null | undefined): { secret: string | null; unreadable: boolean } {
    if (!enc) return { secret: null, unreadable: false };
    try { return { secret: decryptSecret(enc, this.mfaKey()), unreadable: false }; } catch { return { secret: null, unreadable: true }; }
  }
  /** Atomic failure counter (no read-modify-write): increments in the database, then applies the lock when the threshold is reached. */
  private async recordFailure(adminId: string) {
    const u = await prisma.adminAccount.update({ where: { id: adminId }, data: { failedLogins: { increment: 1 } }, select: { failedLogins: true } });
    if (u.failedLogins >= MAX_FAILS) await prisma.adminAccount.update({ where: { id: adminId }, data: { lockedUntil: new Date(Date.now() + LOCK_MS) } });
  }


  /* ---- e-mail code ---- */
  private emailCodeHash(adminId: string, challengeId: string, code: string): string {
    return createHash("sha256").update(`mmri-admin-email-code:${this.config.auditSalt}:${adminId}:${challengeId}:${code}`).digest("hex");
  }
  /** Creates a fresh single-use code (voiding older ones) and mails it to the administrator's own account address. The code is never returned, logged or audited. */
  private async issueEmailCode(adminId: string, email: string, fp: RequestFingerprint): Promise<void> {
    if (!this.mailer || this.mailer.provider === "disabled" || (this.mailer.provider === "mock" && this.config.environment === "production")) throw new ApiError(503, "ADMIN_CODE_DELIVERY_UNAVAILABLE", MSG.codeDelivery);
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0"), now = new Date();
    const id = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM admin_accounts WHERE id = ${adminId} FOR UPDATE`;
      const recent = await tx.adminEmailChallenge.count({ where: { adminId, createdAt: { gt: new Date(now.getTime() - 3_600_000) } } });
      const latest = await tx.adminEmailChallenge.findFirst({ where: { adminId }, orderBy: { createdAt: "desc" } });
      if (recent >= MAX_EMAIL_CODES_PER_HOUR || (latest && now.getTime() - latest.createdAt.getTime() < ADMIN_EMAIL_CODE_COOLDOWN_SECONDS * 1000)) return null;
      await tx.adminEmailChallenge.updateMany({ where: { adminId, usedAt: null }, data: { usedAt: now } });
      const row = await tx.adminEmailChallenge.create({ data: { adminId, codeHash: "pending", expiresAt: new Date(now.getTime() + ADMIN_EMAIL_CODE_TTL_MINUTES * 60_000), ipHash: hashAuditValue(fp.ip, this.config.auditSalt) } });
      await tx.adminEmailChallenge.update({ where: { id: row.id }, data: { codeHash: this.emailCodeHash(adminId, row.id, code) } });
      return row.id;
    });
    if (!id) { await this.audit(adminId, "ADMIN_EMAIL_CODE", "DENIED", fp, undefined, { reason: "throttled" }); throw new ApiError(429, "ADMIN_CODE_THROTTLED", MSG.codeThrottled); }
    let delivered = false;
    try {
      delivered = (await this.mailer.send({ to: email, kind: "ADMIN_LOGIN_CODE", subject: "BusinessMRI.mn: админ нэвтрэх код", text: `Админ нэвтрэх нэг удаагийн код:\n\n${code}\n\nКод ${ADMIN_EMAIL_CODE_TTL_MINUTES} минутын дотор, зөвхөн нэг удаа ажиллана. Хэрэв та нэвтрэх оролдлого хийгээгүй бол энэ захидлыг үл тоож, нууц үгээ солино уу.` })).delivered;
    } catch { delivered = false; }
    if (!delivered) {
      await prisma.adminEmailChallenge.deleteMany({ where: { id } }).catch(() => undefined);
      await this.audit(adminId, "ADMIN_EMAIL_CODE", "FAILURE", fp, undefined, { reason: "delivery" });
      throw new ApiError(503, "ADMIN_CODE_DELIVERY_UNAVAILABLE", MSG.codeDelivery);
    }
    await this.audit(adminId, "ADMIN_EMAIL_CODE", "SUCCESS", fp, undefined, { event: "sent" });
  }
  /** Spends one guess (atomically, at most MAX_EMAIL_CODE_GUESSES per code across all instances), then compares in constant time and consumes the code with a conditional update: a code works exactly once. */
  private async claimEmailCode(adminId: string, codeRaw: unknown): Promise<boolean> {
    const code = String(codeRaw ?? "").replace(/\s/g, ""); const now = new Date();
    const ch = await prisma.adminEmailChallenge.findFirst({ where: { adminId, usedAt: null, expiresAt: { gt: now } }, orderBy: { createdAt: "desc" } });
    if (!ch) return false;
    const spent = await prisma.adminEmailChallenge.updateMany({ where: { id: ch.id, usedAt: null, attempts: { lt: MAX_EMAIL_CODE_GUESSES }, expiresAt: { gt: now } }, data: { attempts: { increment: 1 } } });
    if (spent.count !== 1 || !/^\d{6}$/.test(code)) return false;
    const a = Buffer.from(this.emailCodeHash(adminId, ch.id, code)), b = Buffer.from(ch.codeHash);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
    return (await prisma.adminEmailChallenge.updateMany({ where: { id: ch.id, usedAt: null, expiresAt: { gt: new Date() } }, data: { usedAt: new Date() } })).count === 1;
  }
  /** Authenticated resend for a re-authentication prompt. */
  async requestEmailCode(p: AdminPrincipal, fp: RequestFingerprint) {
    if (!emailOtpEnabledFor(p.email)) throw new ApiError(404, "NOT_FOUND", "Route not found");
    await this.issueEmailCode(p.adminId, p.email, fp);
    return { sent: true, expiresInMinutes: ADMIN_EMAIL_CODE_TTL_MINUTES, resendAfterSeconds: ADMIN_EMAIL_CODE_COOLDOWN_SECONDS };
  }

  async login(input: { email: unknown; password: unknown; totpCode: unknown; emailCode?: unknown }, fp: RequestFingerprint) {
    const email = String(input.email ?? "").trim().toLowerCase();
    const user = await prisma.user.findUnique({ where: { email } });
    const admin = user ? await prisma.adminAccount.findUnique({ where: { userId: user.id } }) : null;
    const dummy = "scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA$" + "A".repeat(86);
    const pwOk = await verifyPassword(String(input.password ?? ""), user?.passwordHash ?? dummy, this.config.passwordPepper).catch(() => false);
    if (admin?.lockedUntil && admin.lockedUntil > new Date()) { await this.audit(admin.id, "ADMIN_LOGIN", "DENIED", fp, undefined, { reason: "locked" }); throw new ApiError(429, "ADMIN_LOCKED", MSG.locked); }
    const { secret, unreadable } = this.readSecret(admin?.mfaSecretEnc);
    const step = secret ? verifyTotp(secret, String(input.totpCode ?? "").replace(/\s/g, "")) : null;
    const replay = step !== null && admin && BigInt(step) <= admin.mfaLastStep;
    const denied = async (reason: string) => {
      if (admin) await this.recordFailure(admin.id);
      await this.audit(admin?.id ?? null, "ADMIN_LOGIN", "FAILURE", fp, undefined, { reason });
      throw new ApiError(401, "ADMIN_LOGIN_FAILED", MSG.badLogin);
    };
    /* E-MAIL CODE PATH: only for opted-in accounts that did not submit a TOTP code. The code is mailed only AFTER the password has been verified (no mail bombing, no account probing). */
    if (admin && user && emailOtpEnabledFor(email) && !String(input.totpCode ?? "").trim()) {
      if (user.status !== "ACTIVE" || user.erasedAt || (user.emailVerificationRequired && !user.emailVerifiedAt) || !pwOk || admin.status === "DISABLED") return denied(!pwOk ? "password" : "disabled");
      if (!String(input.emailCode ?? "").trim()) {
        await this.issueEmailCode(admin.id, user.email, fp);
        return { mfaRequired: "EMAIL_CODE" as const, expiresInMinutes: ADMIN_EMAIL_CODE_TTL_MINUTES, resendAfterSeconds: ADMIN_EMAIL_CODE_COOLDOWN_SECONDS };
      }
      if (!(await this.claimEmailCode(admin.id, input.emailCode))) return denied("email_code");
      const now2 = Date.now(); const token2 = "adm_" + randomBytes(32).toString("base64url");
      const session2 = await prisma.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${user.id} FOR UPDATE`;
        const cu = await tx.user.findUnique({ where: { id: user.id } });
        if (!cu || cu.status !== "ACTIVE" || cu.erasedAt || cu.passwordHash !== user.passwordHash || cu.tokenVersion !== user.tokenVersion) return null;
        const upd = await tx.adminAccount.updateMany({ where: { id: admin.id, status: { not: "DISABLED" }, OR: [{ lockedUntil: null }, { lockedUntil: { lte: new Date() } }] }, data: { failedLogins: 0, lockedUntil: null, status: "ACTIVE" } });
        if (upd.count !== 1) return null;
        return tx.adminSession.create({ data: { adminId: admin.id, tokenHash: sha(token2), expiresAt: new Date(now2 + this.config.adminSessionIdleMinutes * 60_000), absoluteExpiresAt: new Date(now2 + 8 * 3_600_000), reauthAt: new Date(now2), ipHash: hashAuditValue(fp.ip, this.config.auditSalt), userAgentHash: hashAuditValue(fp.userAgent, this.config.auditSalt) } });
      });
      if (!session2) return denied("email_code_state");
      await this.audit(admin.id, "ADMIN_LOGIN", "SUCCESS", fp, undefined, { method: "email_code" });
      return { token: token2, expiresAt: session2.expiresAt, admin: { id: admin.id, email: user.email, role: admin.role as AdminRole, permissions: ROLE_PERMISSIONS[admin.role as AdminRole] } };
    }
    if (!admin || !user || user.status !== "ACTIVE" || user.erasedAt || (user.emailVerificationRequired && !user.emailVerifiedAt) || !pwOk || admin.status === "DISABLED" || step === null || replay) return denied(!admin ? "unknown" : admin.status === "DISABLED" ? "disabled" : !pwOk ? "password" : unreadable ? "mfa_secret_unreadable" : "mfa");
    const token = "adm_" + randomBytes(32).toString("base64url"); const now = Date.now();
    /* Check-and-advance of the TOTP step is ONE conditional UPDATE: of any number of simultaneous requests carrying the same code, exactly one matches "mfaLastStep < step". A concurrent disable is also respected (status must still not be DISABLED). */
    const session = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${user.id} FOR UPDATE`;
      const currentUser = await tx.user.findUnique({where:{id:user.id}});
      if(!currentUser || currentUser.status !== "ACTIVE" || currentUser.erasedAt || currentUser.passwordHash !== user.passwordHash || currentUser.tokenVersion !== user.tokenVersion) return null;
      const adv = await tx.adminAccount.updateMany({ where: { id: admin.id, mfaLastStep: { lt: BigInt(step) }, status: { not: "DISABLED" }, OR:[{lockedUntil:null},{lockedUntil:{lte:new Date()}}] }, data: { failedLogins: 0, lockedUntil: null, mfaLastStep: BigInt(step), status: "ACTIVE" } });
      if (adv.count !== 1) return null;
      return tx.adminSession.create({ data: { adminId: admin.id, tokenHash: sha(token), expiresAt: new Date(now + this.config.adminSessionIdleMinutes * 60_000), absoluteExpiresAt: new Date(now + 8 * 3_600_000), reauthAt: new Date(now), ipHash: hashAuditValue(fp.ip, this.config.auditSalt), userAgentHash: hashAuditValue(fp.userAgent, this.config.auditSalt) } });
    });
    if (!session) return denied("mfa_replay");
    await this.audit(admin.id, "ADMIN_LOGIN", "SUCCESS", fp);
    return { token, expiresAt: session.expiresAt, admin: { id: admin.id, email: user.email, role: admin.role as AdminRole, permissions: ROLE_PERMISSIONS[admin.role as AdminRole] } };
  }

  /** Resolves the bearer token to a principal. Role, status and permissions always come from the database, never from the request. */
  async authenticate(authorization: string | undefined): Promise<AdminPrincipal> {
    const token = /^Bearer (adm_[A-Za-z0-9_-]{20,})$/.exec(authorization ?? "")?.[1];
    if (!token) throw new ApiError(401, "ADMIN_UNAUTHENTICATED", MSG.session);
    const s = await prisma.adminSession.findUnique({ where: { tokenHash: sha(token) }, include: { admin: true } });
    const now = new Date();
    if (!s || s.revokedAt || s.expiresAt <= now || s.absoluteExpiresAt <= now || s.admin.status !== "ACTIVE") throw new ApiError(401, "ADMIN_UNAUTHENTICATED", MSG.session);
    const user = await prisma.user.findUnique({ where: { id: s.admin.userId }, select: { email: true, status: true, erasedAt: true, emailVerificationRequired: true, emailVerifiedAt: true } });
    if (!user || user.status !== "ACTIVE" || user.erasedAt || (user.emailVerificationRequired && !user.emailVerifiedAt)) throw new ApiError(401, "ADMIN_UNAUTHENTICATED", MSG.session);
    if (now.getTime() - s.lastSeenAt.getTime() > 60_000) await prisma.adminSession.update({ where: { id: s.id }, data: { lastSeenAt: now, expiresAt: new Date(Math.min(s.absoluteExpiresAt.getTime(), now.getTime() + this.config.adminSessionIdleMinutes * 60_000)) } });
    const role = s.admin.role as AdminRole;
    return { adminId: s.admin.id, userId: s.admin.userId, email: user.email, role, sessionId: s.id, reauthAt: s.reauthAt, permissions: ROLE_PERMISSIONS[role] ?? [] };
  }

  async requirePermission(p: AdminPrincipal, permission: Permission, fp: RequestFingerprint, opts: { sensitive?: boolean } = {}) {
    if (!p.permissions.includes(permission)) { await this.audit(p.adminId, "PERMISSION_DENIED", "DENIED", fp, undefined, { permission }); throw new ApiError(403, "ADMIN_FORBIDDEN", MSG.forbidden); }
    if (opts.sensitive && (!p.reauthAt || Date.now() - p.reauthAt.getTime() > REAUTH_WINDOW_MS)) { await this.audit(p.adminId,"ADMIN_REAUTH_REQUIRED","DENIED",fp,undefined,{permission}); throw new ApiError(401, "ADMIN_REAUTH_REQUIRED", MSG.reauth); }
  }

  async reauth(p: AdminPrincipal, input: { password: unknown; totpCode: unknown }, fp: RequestFingerprint) {
    const admin = await prisma.adminAccount.findUnique({ where: { id: p.adminId } });
    const user = admin ? await prisma.user.findUnique({ where: { id: admin.userId } }) : null;
    const pwOk = user ? await verifyPassword(String(input.password ?? ""), user.passwordHash, this.config.passwordPepper).catch(() => false) : false;
    const { secret, unreadable } = this.readSecret(admin?.mfaSecretEnc);
    const step = secret ? verifyTotp(secret, String(input.totpCode ?? "").replace(/\s/g, "")) : null;
    const deny = async (reason: string) => {
      if (admin) await this.recordFailure(admin.id);
      await this.audit(p.adminId, "ADMIN_REAUTH", "FAILURE", fp, undefined, { reason });
      throw new ApiError(401, "ADMIN_LOGIN_FAILED", MSG.badLogin);
    };
    if (admin && user && emailOtpEnabledFor(user.email) && String((input as any).emailCode ?? "").trim() && !String(input.totpCode ?? "").trim()) {
      if (admin.status !== "ACTIVE" || (admin.lockedUntil && admin.lockedUntil > new Date()) || user.status !== "ACTIVE" || user.erasedAt || !pwOk) return deny(!pwOk ? "password" : "state");
      if (!(await this.claimEmailCode(admin.id, (input as any).emailCode))) return deny("email_code");
      const sess = await prisma.adminSession.findUnique({ where: { id: p.sessionId } }); const nowR = new Date();
      if (!sess || sess.revokedAt || sess.expiresAt <= nowR || sess.absoluteExpiresAt <= nowR) return deny("session");
      await prisma.adminSession.update({ where: { id: p.sessionId }, data: { reauthAt: nowR } });
      await prisma.adminAccount.update({ where: { id: admin.id }, data: { failedLogins: 0 } });
      await this.audit(p.adminId, "ADMIN_REAUTH", "SUCCESS", fp, undefined, { method: "email_code" });
      return;
    }
    if (!admin || admin.status !== "ACTIVE" || (admin.lockedUntil && admin.lockedUntil > new Date()) || !user || user.status !== "ACTIVE" || user.erasedAt || !pwOk || step === null || BigInt(step) <= admin.mfaLastStep) return deny(!admin ? "unknown" : !pwOk ? "password" : unreadable ? "mfa_secret_unreadable" : "mfa");
    /* atomic check-and-advance (see login) */
    const advanced = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${user!.id} FOR UPDATE`;
      const currentUser=await tx.user.findUnique({where:{id:user!.id}});
      const session=await tx.adminSession.findUnique({where:{id:p.sessionId}});
      const now=new Date();
      if(!currentUser || currentUser.status!=="ACTIVE" || currentUser.erasedAt || currentUser.passwordHash!==user!.passwordHash || currentUser.tokenVersion!==user!.tokenVersion || !session || session.revokedAt || session.expiresAt<=now || session.absoluteExpiresAt<=now) return false;
      const adv = await tx.adminAccount.updateMany({ where: { id: admin.id, mfaLastStep: { lt: BigInt(step) }, status: "ACTIVE", OR:[{lockedUntil:null},{lockedUntil:{lte:new Date()}}] }, data: { mfaLastStep: BigInt(step), failedLogins: 0 } });
      if (adv.count !== 1) return false;
      await tx.adminSession.update({ where: { id: p.sessionId }, data: { reauthAt: new Date() } });
      return true;
    });
    if (!advanced) return deny("mfa_replay");
    await this.audit(p.adminId, "ADMIN_REAUTH", "SUCCESS", fp);
  }

  async logout(p: AdminPrincipal, fp: RequestFingerprint) {
    await prisma.adminSession.update({ where: { id: p.sessionId }, data: { revokedAt: new Date() } });
    await this.audit(p.adminId, "ADMIN_LOGOUT", "SUCCESS", fp);
  }
}
