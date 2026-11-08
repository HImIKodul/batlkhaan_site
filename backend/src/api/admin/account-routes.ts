import { prisma } from "../../db.js";
import { ApiError, badRequest, notFound } from "../errors.js";
import { ok } from "../http/respond.js";
import type { RouteContext } from "../http/router.js";
import type { AdminPrincipal, Permission } from "./admin-service.js";

/* SUPER_ADMIN account management: customer accounts, e-mail, activation, and read-only entitlement origin and history.
   Every route here needs the "accounts.manage" permission (SUPER_ADMIN only, decided on the server from the database role). Every change is a
   "sensitive" route (fresh password + MFA re-authentication within the last 5 minutes), requires a written reason, runs in one transaction, and is
   written to the admin audit trail (actor, target, reason, outcome). Passwords, password hashes, token versions and MFA data are never returned.
   Deliberately NOT implemented (documented blockers, see FINAL_COMPLETION_REPORT):
   - free per-domain access grant / revoke: billing_invoices carries CHECK (amountMnt > 0) and a settlement-fields check, and every entitlement must hang off a PAID
     invoice. A free grant would need either a falsified paid invoice or a schema migration (needs owner approval). Legitimate paths that already exist: customer payment,
     operator manual-confirm (/api/v1/operator/billing/invoices/:id/manual-confirm) and confirmed refunds (revoke the entitlement through the disputes flow).
   - admin-forced account deletion. Erasure stays user-initiated (docs/DATA_LIFECYCLE.md) until a retention/legal policy for
   operator-initiated erasure is decided; deactivation (below) is the safe, reversible alternative. */

const EMAIL_RE = /^[^\s@]{1,64}@[A-Za-z0-9.-]{1,190}\.[A-Za-z]{2,}$/;
type FP = { ip?: string; userAgent?: string };
type H = (ctx: RouteContext, p: AdminPrincipal, fp: FP, body: any) => Promise<void>;
export interface AccountRouteDeps {
  route: (method: string, path: string, permission: Permission | null, handler: H, opts?: { sensitive?: boolean; body?: boolean }) => void;
  audit: (adminId: string, action: string, outcome: "SUCCESS" | "DENIED" | "FAILURE", fp: FP | null, target?: { type?: string; id?: string }, metadata?: Record<string, unknown>) => Promise<unknown>;
  pageOf: (q: URLSearchParams) => { page: number; pageSize: number; skip: number };
}

const reasonOf = (v: unknown) => { const r = String(v ?? "").replace(/\s+/g, " ").trim(); if (r.length < 8) throw badRequest("Шалтгаанаа дор хаяж 8 тэмдэгтээр бичнэ үү."); return r.slice(0, 300); };
const maskEmail = (e: string) => { const [l = "", d = ""] = e.split("@"); return `${l.slice(0, 1)}***@${d}`; };
const safeUser = { id: true, email: true, displayName: true, status: true, lastLoginAt: true, erasedAt: true, createdAt: true } as const;

export function registerAccountRoutes(d: AccountRouteDeps) {
  const { route, audit, pageOf } = d;
  const fail = async (p: AdminPrincipal, fp: FP, action: string, type: string, id: string, e: unknown, reason?: string) => {
    await audit(p.adminId, action, "FAILURE", fp, { type, id }, { reason, code: e instanceof ApiError ? e.code : "ERROR" }).catch(() => undefined);
    throw e;
  };
  const originOf = (inv: { provider: string; amountMnt: number; status: string; providerMetadata: unknown } | null) => {
    if (!inv) return "UNKNOWN";
    if ((inv.providerMetadata as any)?.adminGrant === true) return "ADMIN_GRANT";
    return inv.status === "PAID" && inv.amountMnt > 0 ? `PAID_${inv.provider}` : `${inv.provider}_${inv.status}`;
  };

  // ----- customer accounts: list / search / inspect -----
  route("GET", "/users", "accounts.manage", async (c) => {
    const { page, pageSize, skip } = pageOf(c.query); const q = (c.query.get("q") ?? "").trim().slice(0, 100); const status = c.query.get("status");
    if (status && !["ACTIVE", "DISABLED"].includes(status)) throw badRequest("Төлөв буруу байна.");
    const where: any = { ...(status ? { status } : {}), ...(q ? { OR: [{ email: { contains: q, mode: "insensitive" } }, { displayName: { contains: q, mode: "insensitive" } }] } : {}) };
    const [total, rows] = await Promise.all([prisma.user.count({ where }), prisma.user.findMany({ where, orderBy: { createdAt: "desc" }, skip, take: pageSize, select: { ...safeUser, adminAccount: { select: { role: true } }, _count: { select: { memberships: true } } } })]);
    ok(c.res, { page, pageSize, total, items: rows.map(u => ({ id: u.id, email: u.erasedAt ? null : u.email, displayName: u.erasedAt ? null : u.displayName, status: u.status, createdAt: u.createdAt, lastLoginAt: u.lastLoginAt, erased: !!u.erasedAt, adminRole: u.adminAccount?.role ?? null, companies: u._count.memberships })) });
  }, { sensitive: false });

  route("GET", "/users/:id", "accounts.manage", async (c) => {
    const u = await prisma.user.findUnique({ where: { id: c.params.id }, select: { ...safeUser, adminAccount: { select: { role: true, status: true } }, memberships: { select: { role: true, company: { select: { id: true, name: true, erasedAt: true } } } } } });
    if (!u) throw notFound("Хэрэглэгч олдсонгүй.");
    const [sessions, authEvents, adminEvents] = await Promise.all([
      prisma.refreshSession.count({ where: { userId: u.id, revokedAt: null, expiresAt: { gt: new Date() } } }),
      prisma.authAuditEvent.findMany({ where: { userId: u.id }, orderBy: { createdAt: "desc" }, take: 10, select: { eventType: true, createdAt: true } }),
      prisma.adminAuditEvent.findMany({ where: { targetType: "USER", targetId: u.id }, orderBy: { createdAt: "desc" }, take: 20, select: { action: true, outcome: true, createdAt: true, metadata: true } })]);
    ok(c.res, { user: { id: u.id, email: u.erasedAt ? null : u.email, displayName: u.erasedAt ? null : u.displayName, status: u.status, createdAt: u.createdAt, lastLoginAt: u.lastLoginAt, erased: !!u.erasedAt, adminRole: u.adminAccount?.role ?? null },
      companies: u.memberships.map(m => ({ id: m.company.id, name: m.company.erasedAt ? null : m.company.name, role: m.role })), activeSessions: sessions, recentSignIns: authEvents, adminHistory: adminEvents });
  }, { sensitive: false });

  // ----- e-mail change -----
  route("POST", "/users/:id/email", "accounts.manage", async (c, p, fp, b) => {
    const id = c.params.id; let reason: string | undefined;
    try {
      reason = reasonOf(b.reason);
      const next = String(b.newEmail ?? "").trim().toLowerCase();
      if (!EMAIL_RE.test(next) || next.length > 254) throw badRequest("Имэйл хаяг буруу байна.");
      if (String(b.confirmNewEmail ?? "").trim().toLowerCase() !== next) throw badRequest("Имэйл хаягийг баталгаажуулах талбар таарахгүй байна.");
      const out = await prisma.$transaction(async tx => {
        const u = await tx.user.findUnique({ where: { id }, select: { id: true, email: true, erasedAt: true, adminAccount: { select: { id: true } } } });
        if (!u) throw notFound("Хэрэглэгч олдсонгүй.");
        if (u.erasedAt) throw new ApiError(409, "ACCOUNT_ERASED", "Устгагдсан бүртгэлийн имэйлийг солих боломжгүй.");
        if (u.adminAccount) throw new ApiError(409, "ADMIN_ACCOUNT_PROTECTED", "Админ бүртгэлийн имэйлийг энэ цэсээр солихгүй.");
        if (u.email.toLowerCase() === next) throw new ApiError(409, "EMAIL_UNCHANGED", "Шинэ имэйл одоогийнхтой ижил байна.");
        const taken = await tx.user.findFirst({ where: { id: { not: id }, email: { equals: next, mode: "insensitive" } }, select: { id: true } });
        if (taken) throw new ApiError(409, "EMAIL_TAKEN", "Энэ имэйл хаяг өөр бүртгэлд ашиглагдаж байна.");
        await tx.user.update({ where: { id }, data: { email: next, tokenVersion: { increment: 1 } } });
        const revoked = await tx.refreshSession.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
        return { from: u.email, sessionsRevoked: revoked.count };
      });
      await audit(p.adminId, "ADMIN_USER_EMAIL_CHANGED", "SUCCESS", fp, { type: "USER", id }, { reason, from: maskEmail(out.from), to: maskEmail(next), sessionsRevoked: out.sessionsRevoked });
      ok(c.res, { changed: true, email: next, sessionsRevoked: out.sessionsRevoked, note: "Хэрэглэгч шинэ имэйлээр дахин нэвтэрнэ. Шинэ хаягийн эзэмшлийг имэйлээр баталгаажуулах холболт одоогоор байхгүй." });
    } catch (e: any) {
      if (e?.code === "P2002") return fail(p, fp, "ADMIN_USER_EMAIL_CHANGED", "USER", id, new ApiError(409, "EMAIL_TAKEN", "Энэ имэйл хаяг өөр бүртгэлд ашиглагдаж байна."), reason);
      return fail(p, fp, "ADMIN_USER_EMAIL_CHANGED", "USER", id, e, reason);
    }
  }, { sensitive: true });

  // ----- activation / deactivation -----
  route("POST", "/users/:id/status", "accounts.manage", async (c, p, fp, b) => {
    const id = c.params.id; let reason: string | undefined; const action = b?.status === "DISABLED" ? "ADMIN_USER_DEACTIVATED" : "ADMIN_USER_ACTIVATED";
    try {
      reason = reasonOf(b.reason);
      if (!["ACTIVE", "DISABLED"].includes(b.status)) throw badRequest("Төлөв буруу байна.");
      const out = await prisma.$transaction(async tx => {
        const u = await tx.user.findUnique({ where: { id }, select: { id: true, status: true, erasedAt: true, adminAccount: { select: { id: true } } } });
        if (!u) throw notFound("Хэрэглэгч олдсонгүй.");
        if (u.erasedAt) throw new ApiError(409, "ACCOUNT_ERASED", "Устгагдсан бүртгэлийн төлөвийг өөрчлөх боломжгүй.");
        if (u.adminAccount) throw new ApiError(409, "ADMIN_ACCOUNT_PROTECTED", "Админ бүртгэлийг «Админууд» цэсээр удирдана.");
        if (u.id === p.userId) throw new ApiError(409, "SELF_ACTION", "Өөрийн бүртгэлийг энэ цэсээр өөрчлөхгүй.");
        if (u.status === b.status) return { changed: false, sessionsRevoked: 0 };
        await tx.user.update({ where: { id }, data: { status: b.status, ...(b.status === "DISABLED" ? { tokenVersion: { increment: 1 } } : {}) } });
        const revoked = b.status === "DISABLED" ? await tx.refreshSession.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } }) : { count: 0 };
        return { changed: true, sessionsRevoked: revoked.count };
      });
      await audit(p.adminId, action, "SUCCESS", fp, { type: "USER", id }, { reason, to: b.status, changed: out.changed, sessionsRevoked: out.sessionsRevoked });
      ok(c.res, { status: b.status, ...out });
    } catch (e) { return fail(p, fp, action, "USER", id, e, reason); }
  }, { sensitive: true });

  // ----- entitlements: origin, history, grant, revoke -----
  route("GET", "/companies/:id/entitlements", "accounts.manage", async (c) => {
    const co = await prisma.company.findUnique({ where: { id: c.params.id }, select: { id: true, name: true, erasedAt: true } });
    if (!co) throw notFound("Байгууллага олдсонгүй.");
    const ents = await prisma.companyEntitlement.findMany({ where: { companyId: co.id }, orderBy: { createdAt: "desc" }, select: { id: true, domainCode: true, planCode: true, status: true, startsAt: true, endsAt: true, assessmentLimit: true, assessmentsUsed: true, createdAt: true,
      sourceInvoice: { select: { id: true, provider: true, status: true, amountMnt: true, paidAt: true, refundedAt: true, providerMetadata: true } }, _count: { select: { assessments: true } } } });
    const ids = ents.map(e => e.id);
    const history = await prisma.adminAuditEvent.findMany({ where: { OR: [{ targetType: "ENTITLEMENT", targetId: { in: ids } }, { targetType: "COMPANY", targetId: co.id, action: { startsWith: "ADMIN_ENTITLEMENT" } }] }, orderBy: { createdAt: "desc" }, take: 30, select: { action: true, outcome: true, targetType: true, targetId: true, createdAt: true, metadata: true } });
    ok(c.res, { company: { id: co.id, name: co.erasedAt ? null : co.name }, entitlements: ents.map(e => ({ id: e.id, domainCode: e.domainCode, planCode: e.planCode, status: e.status, startsAt: e.startsAt, endsAt: e.endsAt, assessmentLimit: e.assessmentLimit, assessmentsUsed: e.assessmentsUsed, assessments: e._count.assessments, createdAt: e.createdAt,
      origin: originOf(e.sourceInvoice), invoice: e.sourceInvoice ? { id: e.sourceInvoice.id, provider: e.sourceInvoice.provider, status: e.sourceInvoice.status, amountMnt: e.sourceInvoice.amountMnt, paidAt: e.sourceInvoice.paidAt, refundedAt: e.sourceInvoice.refundedAt } : null,
      revocable: e.status === "ACTIVE" && e.assessmentsUsed === 0 && e._count.assessments === 0 && (e.sourceInvoice?.providerMetadata as any)?.adminGrant === true })), history });
  }, { sensitive: false });
}
