import { prisma } from "../../db.js";
import { ApiError, badRequest, notFound } from "../errors.js";
import { ok } from "../http/respond.js";
import type { RouteContext } from "../http/router.js";
import type { AdminPrincipal, Permission } from "./admin-service.js";
import { customerNotifications } from "../notifications/notification-service.js";

/* SUPER_ADMIN account management: customer accounts, e-mail, activation, and read-only entitlement origin and history.
   Every route here needs the "accounts.manage" permission (SUPER_ADMIN only, decided on the server from the database role). Every change is a
   "sensitive" route (fresh password + MFA re-authentication within the last 5 minutes), requires a written reason, runs in one transaction, and is
   written to the admin audit trail (actor, target, reason, outcome). Passwords, password hashes, token versions and MFA data are never returned.
   Domain access: an administrator grant is a first-class entitlement (origin ADMIN_GRANT, migration 20261108100000): it has NO invoice, so it can never appear as
   a payment or revenue; the database requires the granting admin and a written reason. Paid entitlements are never touched here (refunds use the disputes flow).
   Deliberately NOT implemented:
   - admin-forced account deletion. Erasure stays user-initiated (docs/DATA_LIFECYCLE.md) until a retention/legal policy for
   operator-initiated erasure is decided; deactivation (below) is the safe, reversible alternative. */

export const DOMAIN_CODES = ["marketing", "it", "finance", "people", "operations"] as const;
const ACTIVE_ASSESSMENT = ["PROFILE_PENDING", "IN_PROGRESS", "PAUSED", "READY_FOR_COMPLETION", "PROCESSING"];
const EMAIL_RE = /^[^\s@]{1,64}@[A-Za-z0-9.-]{1,190}\.[A-Za-z]{2,}$/;
type FP = { ip?: string; userAgent?: string };
type H = (ctx: RouteContext, p: AdminPrincipal, fp: FP, body: any) => Promise<void>;
export interface AccountRouteDeps {
  route: (method: string, path: string, permission: Permission | null, handler: H, opts?: { sensitive?: boolean; body?: boolean }) => void;
  audit: (adminId: string, action: string, outcome: "SUCCESS" | "DENIED" | "FAILURE", fp: FP | null, target?: { type?: string; id?: string }, metadata?: Record<string, unknown>) => Promise<unknown>;
  pageOf: (q: URLSearchParams) => { page: number; pageSize: number; skip: number };
  /** Controlled pilot (MMRI_BILLING_PROVIDER=grant): grants need a written authorisation reference and stop at the pilot expiry. */
  pilotGrant?: { authorizedBy: string; expiresAt: Date } | null;
  /** Verified cancellation flow of the billing service (asks the provider about payment first, never cancels a paid invoice). Used after a grant to retire a waiting QPay code. */
  cancelProviderInvoice?: (invoiceId: string) => Promise<unknown>;
}

const reasonOf = (v: unknown) => { const r = String(v ?? "").replace(/\s+/g, " ").trim(); if (r.length < 8) throw badRequest("Шалтгаанаа дор хаяж 8 тэмдэгтээр бичнэ үү."); return r.slice(0, 300); };
/** The description of a grant/revoke is OPTIONAL. The database still requires a reason of 8+ characters for administrator decisions, so a blank description is stored as a fixed internal default; the customer only ever sees the standard message plus the administrator\'s own words, if any. */
const noteOf = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, 300);
const DEFAULT_GRANT_REASON = "Администраторын шийдвэрээр эрх олгов";
const DEFAULT_REVOKE_REASON = "Администраторын шийдвэрээр эрх цуцлав";
const maskEmail = (e: string) => { const [l = "", d = ""] = e.split("@"); return `${l.slice(0, 1)}***@${d}`; };
const safeUser = { id: true, email: true, displayName: true, status: true, lastLoginAt: true, erasedAt: true, createdAt: true, emailVerificationRequired: true, emailVerifiedAt: true } as const;

export function registerAccountRoutes(d: AccountRouteDeps) {
  const { route, audit, pageOf } = d;
  const fail = async (p: AdminPrincipal, fp: FP, action: string, type: string, id: string, e: unknown, reason?: string) => {
    await audit(p.adminId, action, "FAILURE", fp, { type, id }, { reason, code: e instanceof ApiError ? e.code : "ERROR" }).catch(() => undefined);
    throw e;
  };
  const originOf = (e: { origin: string }, inv: { provider: string; amountMnt: number; status: string } | null) => {
    if (e.origin === "ADMIN_GRANT") return "ADMIN_GRANT";
    if (!inv) return "UNKNOWN";
    return inv.status === "PAID" && inv.amountMnt > 0 ? `PAID_${inv.provider}` : `${inv.provider}_${inv.status}`;
  };

  // ----- customer accounts: list / search / inspect -----
  route("GET", "/users", "accounts.manage", async (c) => {
    const { page, pageSize, skip } = pageOf(c.query); const q = (c.query.get("q") ?? "").trim().slice(0, 100); const status = c.query.get("status");
    if (status && !["ACTIVE", "DISABLED"].includes(status)) throw badRequest("Төлөв буруу байна.");
    const where: any = { ...(status ? { status } : {}), ...(q ? { OR: [{ email: { contains: q, mode: "insensitive" } }, { displayName: { contains: q, mode: "insensitive" } }] } : {}) };
    const [total, rows] = await Promise.all([prisma.user.count({ where }), prisma.user.findMany({ where, orderBy: { createdAt: "desc" }, skip, take: pageSize, select: { ...safeUser, adminAccount: { select: { role: true } }, _count: { select: { memberships: true } } } })]);
    // One batched read for the whole page (no per-row queries): companies, domain access, diagnosis progress, payment and report status.
    const ids = rows.map(u => u.id);
    const mem = await prisma.companyMembership.findMany({ where: { userId: { in: ids } }, select: { userId: true, companyId: true, company: { select: { name: true, erasedAt: true } } } });
    const cids = [...new Set(mem.map(m => m.companyId))];
    const [ents, asm, inv, rev] = cids.length ? await Promise.all([
      prisma.companyEntitlement.findMany({ where: { companyId: { in: cids }, status: "ACTIVE" }, select: { companyId: true, domainCode: true, origin: true } }),
      prisma.assessment.groupBy({ by: ["companyId", "status"], where: { companyId: { in: cids } }, _count: { _all: true } }),
      prisma.billingInvoice.groupBy({ by: ["companyId", "status"], where: { companyId: { in: cids } }, _count: { _all: true } }),
      prisma.reportReview.groupBy({ by: ["companyId", "status"], where: { companyId: { in: cids } }, _count: { _all: true } })]) : [[], [], [], []];
    const forUser = (uid: string) => {
      const mine = mem.filter(m => m.userId === uid), mc = new Set(mine.map(m => m.companyId));
      const domains = new Map<string, string>(); for (const e of ents as any[]) if (mc.has(e.companyId) && (!domains.has(e.domainCode) || e.origin === "PAID")) domains.set(e.domainCode, e.origin);
      const cnt = (list: any[], pred: (st: string) => boolean) => list.filter(x => mc.has(x.companyId) && pred(x.status)).reduce((n, x) => n + x._count._all, 0);
      return { companyNames: mine.filter(m => !m.company.erasedAt).map(m => m.company.name).slice(0, 3),
        domains: [...domains].map(([domain, origin]) => ({ domain, origin })),
        diagnoses: { inProgress: cnt(asm as any[], st => ["IN_PROGRESS", "PAUSED", "READY_FOR_COMPLETION", "PROCESSING", "PROFILE_PENDING"].includes(st)), completed: cnt(asm as any[], st => ["COMPLETED", "COMPLETED_WITH_REVIEW"].includes(st)) },
        payments: { paid: cnt(inv as any[], st => st === "PAID"), pending: cnt(inv as any[], st => ["CREATED", "PENDING"].includes(st)), failed: cnt(inv as any[], st => ["FAILED", "CANCELLED"].includes(st)) },
        reports: { pending: cnt(rev as any[], st => st !== "PUBLISHED"), published: cnt(rev as any[], st => st === "PUBLISHED") } };
    };
    ok(c.res, { page, pageSize, total, items: rows.map(u => ({ ...forUser(u.id), id: u.id, email: u.erasedAt ? null : u.email, displayName: u.erasedAt ? null : u.displayName, status: u.status, createdAt: u.createdAt, lastLoginAt: u.lastLoginAt, emailVerificationRequired: u.emailVerificationRequired, emailVerifiedAt: u.emailVerifiedAt, erased: !!u.erasedAt, adminRole: u.adminAccount?.role ?? null, companies: u._count.memberships })) });
  }, { sensitive: false });

  route("GET", "/users/:id", "accounts.manage", async (c) => {
    const u = await prisma.user.findUnique({ where: { id: c.params.id }, select: { ...safeUser, adminAccount: { select: { role: true, status: true } }, memberships: { select: { role: true, company: { select: { id: true, name: true, erasedAt: true } } } } } });
    if (!u) throw notFound("Хэрэглэгч олдсонгүй.");
    const [sessions, authEvents, adminEvents] = await Promise.all([
      prisma.refreshSession.count({ where: { userId: u.id, revokedAt: null, expiresAt: { gt: new Date() } } }),
      prisma.authAuditEvent.findMany({ where: { userId: u.id }, orderBy: { createdAt: "desc" }, take: 10, select: { eventType: true, createdAt: true } }),
      prisma.adminAuditEvent.findMany({ where: { targetType: "USER", targetId: u.id }, orderBy: { createdAt: "desc" }, take: 20, select: { action: true, outcome: true, createdAt: true, metadata: true } })]);
    ok(c.res, { user: { id: u.id, email: u.erasedAt ? null : u.email, displayName: u.erasedAt ? null : u.displayName, status: u.status, createdAt: u.createdAt, lastLoginAt: u.lastLoginAt, emailVerificationRequired: u.emailVerificationRequired, emailVerifiedAt: u.emailVerifiedAt, erased: !!u.erasedAt, adminRole: u.adminAccount?.role ?? null },
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
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${id} FOR UPDATE`;
        const u = await tx.user.findUnique({ where: { id }, select: { id: true, email: true, erasedAt: true, adminAccount: { select: { id: true } } } });
        if (!u) throw notFound("Хэрэглэгч олдсонгүй.");
        if (u.erasedAt) throw new ApiError(409, "ACCOUNT_ERASED", "Устгагдсан бүртгэлийн имэйлийг солих боломжгүй.");
        if (u.adminAccount) throw new ApiError(409, "ADMIN_ACCOUNT_PROTECTED", "Админ бүртгэлийн имэйлийг энэ цэсээр солихгүй.");
        if (u.email.toLowerCase() === next) throw new ApiError(409, "EMAIL_UNCHANGED", "Шинэ имэйл одоогийнхтой ижил байна.");
        const taken = await tx.user.findFirst({ where: { id: { not: id }, email: { equals: next, mode: "insensitive" } }, select: { id: true } });
        if (taken) throw new ApiError(409, "EMAIL_TAKEN", "Энэ имэйл хаяг өөр бүртгэлд ашиглагдаж байна.");
        await tx.user.update({ where: { id }, data: { email: next, tokenVersion: { increment: 1 }, emailVerificationRequired: true, emailVerifiedAt: null } });
        const revoked = await tx.refreshSession.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
        await tx.passwordResetToken.updateMany({where:{userId:id,usedAt:null},data:{usedAt:new Date()}});
        return { from: u.email, sessionsRevoked: revoked.count };
      });
      await audit(p.adminId, "ADMIN_USER_EMAIL_CHANGED", "SUCCESS", fp, { type: "USER", id }, { reason, from: maskEmail(out.from), to: maskEmail(next), sessionsRevoked: out.sessionsRevoked });
      ok(c.res, { changed: true, email: next, sessionsRevoked: out.sessionsRevoked, note: "Хэрэглэгч нэвтрэх хуудаснаас шинэ имэйлдээ баталгаажуулах холбоос авч, нууц үгээ тогтоосны дараа нэвтэрнэ." });
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
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${id} FOR UPDATE`;
        const u = await tx.user.findUnique({ where: { id }, select: { id: true, status: true, erasedAt: true, adminAccount: { select: { id: true } } } });
        if (!u) throw notFound("Хэрэглэгч олдсонгүй.");
        if (u.erasedAt) throw new ApiError(409, "ACCOUNT_ERASED", "Устгагдсан бүртгэлийн төлөвийг өөрчлөх боломжгүй.");
        if (u.adminAccount) throw new ApiError(409, "ADMIN_ACCOUNT_PROTECTED", "Админ бүртгэлийг «Админууд» цэсээр удирдана.");
        if (u.id === p.userId) throw new ApiError(409, "SELF_ACTION", "Өөрийн бүртгэлийг энэ цэсээр өөрчлөхгүй.");
        if (u.status === b.status) return { changed: false, sessionsRevoked: 0 };
        await tx.user.update({ where: { id }, data: { status: b.status, ...(b.status === "DISABLED" ? { tokenVersion: { increment: 1 } } : {}) } });
        const revoked = b.status === "DISABLED" ? await tx.refreshSession.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } }) : { count: 0 };
        if(b.status==="DISABLED")await tx.passwordResetToken.updateMany({where:{userId:id,usedAt:null},data:{usedAt:new Date()}});
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
    const ents = await prisma.companyEntitlement.findMany({ where: { companyId: co.id }, orderBy: { createdAt: "desc" }, select: { id: true, domainCode: true, planCode: true, status: true, origin: true, startsAt: true, endsAt: true, assessmentLimit: true, assessmentsUsed: true, createdAt: true, grantReason: true, revokeReason: true, revokedAt: true,
      grantedByAdmin: { select: { user: { select: { email: true } } } }, revokedByAdmin: { select: { user: { select: { email: true } } } },
      sourceInvoice: { select: { id: true, provider: true, status: true, amountMnt: true, paidAt: true, refundedAt: true } }, _count: { select: { assessments: true } } } });
    const ids = ents.map(e => e.id);
    const [history, running, openInvoices, members] = await Promise.all([
      prisma.adminAuditEvent.findMany({ where: { OR: [{ targetType: "ENTITLEMENT", targetId: { in: ids } }, { targetType: "COMPANY", targetId: co.id, action: { startsWith: "ADMIN_ENTITLEMENT" } }] }, orderBy: { createdAt: "desc" }, take: 30, select: { action: true, outcome: true, targetType: true, targetId: true, createdAt: true, metadata: true } }),
      prisma.assessment.findMany({ where: { companyId: co.id, status: { in: ACTIVE_ASSESSMENT as any } }, select: { domainCode: true } }),
      prisma.billingInvoice.findMany({ where: { companyId: co.id, status: { in: ["CREATED", "PENDING"] } }, orderBy: { createdAt: "asc" }, select: { id: true, domainCode: true, provider: true, status: true, amountMnt: true, createdAt: true } }),
      co.erasedAt ? Promise.resolve([]) : prisma.companyMembership.findMany({ where: { companyId: co.id }, orderBy: { createdAt: "asc" }, select: { role: true, user: { select: { email: true } } } })]);
    ok(c.res, { company: { id: co.id, name: co.erasedAt ? null : co.name, erased: !!co.erasedAt }, customers: (members as { role: string; user: { email: string } }[]).map(m => ({ email: m.user.email, role: m.role })), openInvoices, pilotAuthorizationRequired: !!d.pilotGrant, runningDomains: running.map(r => r.domainCode), entitlements: ents.map(e => ({ id: e.id, domainCode: e.domainCode, planCode: e.planCode, status: e.status, startsAt: e.startsAt, endsAt: e.endsAt, assessmentLimit: e.assessmentLimit, assessmentsUsed: e.assessmentsUsed, assessments: e._count.assessments, createdAt: e.createdAt,
      origin: originOf(e, e.sourceInvoice), grantReason: e.grantReason, grantedBy: e.grantedByAdmin?.user.email ?? null, revokedBy: e.revokedByAdmin?.user.email ?? null, revokeReason: e.revokeReason, revokedAt: e.revokedAt,
      invoice: e.sourceInvoice ? { id: e.sourceInvoice.id, provider: e.sourceInvoice.provider, status: e.sourceInvoice.status, amountMnt: e.sourceInvoice.amountMnt, paidAt: e.sourceInvoice.paidAt, refundedAt: e.sourceInvoice.refundedAt } : null,
      revocable: e.status === "ACTIVE" || e.status === "CONSUMED" })), history });
  }, { sensitive: false });

  route("POST", "/companies/:id/entitlements/grant", "accounts.manage", async (c, p, fp, b) => {
    const id = c.params.id; let reason: string | undefined;
    try {
      const note = noteOf(b.reason ?? b.note); reason = note.length >= 8 ? note : DEFAULT_GRANT_REASON;
      let authorizationRef: string | undefined;
      if (d.pilotGrant) {
        if (Date.now() >= d.pilotGrant.expiresAt.getTime()) throw new ApiError(409, "PILOT_EXPIRED", "Пилотын хугацаа дууссан тул эрх олгохгүй.");
        authorizationRef = String(b.authorizationRef ?? "").replace(/\s+/g, " ").trim();
        if (authorizationRef.length < 4 || authorizationRef.length > 120) throw badRequest("Пилотын зөвшөөрлийн лавлагааг (4-120 тэмдэгт) заавал бичнэ.");
        reason = `${reason} [auth:${authorizationRef}]`;
      }
      const domain = String(b.domainCode ?? "");
      if (!(DOMAIN_CODES as readonly string[]).includes(domain)) throw badRequest("Оношилгооны чиглэл буруу байна.");
      const cancelInvoiceIds: string[] = Array.isArray(b.cancelInvoiceIds) ? b.cancelInvoiceIds.filter((x: unknown): x is string => typeof x === "string").slice(0, 20) : [];
      const at = new Date();
      const out = await prisma.$transaction(async tx => {
        // same lock key as the customer purchase path (billing-service lockPurchase): a grant and a payment for one company+domain can never interleave
        await tx.$executeRaw`select pg_advisory_xact_lock(hashtext(${`mmri-purchase:${id}:${domain}`}))`;
        const co = await tx.company.findUnique({ where: { id }, select: { id: true, erasedAt: true } });
        if (!co) throw notFound("Байгууллага олдсонгүй.");
        if (co.erasedAt) throw new ApiError(409, "COMPANY_ERASED", "Устгагдсан байгууллагад эрх олгохгүй.");
        // A waiting invoice (QPay or manual) does NOT block an administrator decision: it stays untouched here and reconcilable (a payment that still arrives is recorded once by the normal path).
        const running = await tx.assessment.findFirst({ where: { companyId: id, domainCode: domain, status: { in: ACTIVE_ASSESSMENT as any } }, orderBy: { createdAt: "desc" }, select: { id: true, entitlementId: true, entitlement: { select: { id: true, status: true, origin: true, assessmentLimit: true, planCode: true } } } });
        if (running) {
          // A diagnosis that was started and then revoked is RESUMED by re-activating its own entitlement: no second entitlement, no second assessment, saved answers stay.
          if (running.entitlement?.status === "REVOKED") {
            const r = await tx.companyEntitlement.updateMany({ where: { id: running.entitlement.id, status: "REVOKED" }, data: { status: "CONSUMED", endsAt: null, revokedAt: null, revokedByAdminId: null, revokeReason: null } });
            if (r.count !== 1) throw new ApiError(409, "ENTITLEMENT_CHANGED", "Эрх өөрчлөгдсөн байна. Хуудсыг шинэчлээд дахин оролдоно уу.");
            return { entitlementId: running.entitlement.id, plan: running.entitlement.planCode, reactivated: true, assessmentId: running.id, cancelledInvoiceIds: [] as string[] };
          }
          throw new ApiError(409, "ASSESSMENT_ALREADY_ACTIVE", "Энэ чиглэлийн оношилгоо эхэлсэн бөгөөд эрх нь идэвхтэй байна.");
        }
        if (await tx.companyEntitlement.findFirst({ where: { companyId: id, domainCode: domain, status: "ACTIVE" }, select: { id: true } })) throw new ApiError(409, "ENTITLEMENT_EXISTS", "Энэ чиглэлд ашиглагдаагүй идэвхтэй эрх аль хэдийн байна.");
        let cancelled: string[] = [];
        if (cancelInvoiceIds.length) {   // optional: the administrator names MANUAL invoices that they checked against the bank statement
          const r = await tx.billingInvoice.updateMany({ where: { id: { in: cancelInvoiceIds }, companyId: id, domainCode: domain, provider: "MANUAL", status: { in: ["CREATED", "PENDING"] } }, data: { status: "CANCELLED" } });
          cancelled = r.count ? cancelInvoiceIds : [];
        }
        const prior = await tx.assessment.findFirst({ where: { companyId: id, domainCode: domain, status: { in: ["COMPLETED", "COMPLETED_WITH_REVIEW", "EXHAUSTED"] as any } }, select: { id: true } });
        const plan = prior ? "RETAKE" : "DIAGNOSTIC";
        const ent = await tx.companyEntitlement.create({ data: { companyId: id, domainCode: domain, origin: "ADMIN_GRANT", planCode: plan, status: "ACTIVE", assessmentLimit: 1, assessmentsUsed: 0, grantedByAdminId: p.adminId, grantReason: reason } });
        return { entitlementId: ent.id, plan, reactivated: false, assessmentId: null as string | null, cancelledInvoiceIds: cancelled };
      });
      // After the decision is saved: retire a waiting QPay code through the verified cancellation flow. If the provider says it was paid, the normal payment path records it once; if it cannot be cancelled it stays open and reconcilable.
      const retired: string[] = [], kept: string[] = [];
      if (d.cancelProviderInvoice) {
        const waiting = await prisma.billingInvoice.findMany({ where: { companyId: id, domainCode: domain, provider: "QPAY", status: { in: ["CREATED", "PENDING"] } }, select: { id: true } });
        for (const w of waiting) { try { await d.cancelProviderInvoice(w.id); retired.push(w.id); } catch { kept.push(w.id); } }
      }
      await audit(p.adminId, "ADMIN_ENTITLEMENT_GRANTED", "SUCCESS", fp, { type: "ENTITLEMENT", id: out.entitlementId }, { reason, note: note || null, companyId: id, domainCode: domain, plan: out.plan, origin: "ADMIN_GRANT", reactivated: out.reactivated, assessmentId: out.assessmentId, cancelledInvoiceIds: out.cancelledInvoiceIds, qpayInvoicesRetired: retired, qpayInvoicesStillOpen: kept, ...(d.pilotGrant ? { pilot: true, authorizationRef, pilotAuthorizedBy: d.pilotGrant.authorizedBy, pilotExpiresAt: d.pilotGrant.expiresAt.toISOString() } : {}) });
      await audit(p.adminId, "ADMIN_ENTITLEMENT_GRANTED", "SUCCESS", fp, { type: "COMPANY", id }, { entitlementId: out.entitlementId, domainCode: domain });
      await customerNotifications.accessChanged("GRANTED", id, domain, out.entitlementId, note || null, at).catch(() => undefined);
      ok(c.res, { granted: true, ...out, domainCode: domain, qpayInvoicesStillOpen: kept.length });
    } catch (e) { return fail(p, fp, "ADMIN_ENTITLEMENT_GRANTED", "COMPANY", id, e, reason); }
  }, { sensitive: true });

  /* REVOKE. Works for any administrator grant and for a purchased entitlement alike, while it is unused (ACTIVE) or while its diagnosis is still running (CONSUMED + unfinished assessment).
     Only the ACCESS changes: the payment/invoice, the saved answers and any completed report are never touched, and a later QPay callback cannot re-activate a revoked entitlement
     (activatePaidInvoice upserts by source invoice with an empty update). Re-granting re-activates the same entitlement and the customer resumes where they stopped. */
  route("POST", "/entitlements/:id/revoke", "accounts.manage", async (c, p, fp, b) => {
    const id = c.params.id; let reason: string | undefined;
    try {
      const note = noteOf(b.reason ?? b.note); reason = note.length >= 8 ? note : DEFAULT_REVOKE_REASON;
      const at = new Date();
      const out = await prisma.$transaction(async tx => {
        const probe = await tx.companyEntitlement.findUnique({ where: { id }, select: { companyId: true, domainCode: true } });
        if (!probe) throw notFound("Эрх олдсонгүй.");
        await tx.$executeRaw`select pg_advisory_xact_lock(hashtext(${`mmri-purchase:${probe.companyId}:${probe.domainCode}`}))`;
        const e = await tx.companyEntitlement.findUnique({ where: { id }, select: { id: true, companyId: true, domainCode: true, status: true, origin: true, assessments: { select: { id: true, status: true } } } });
        if (!e) throw notFound("Эрх олдсонгүй.");
        if (e.status === "REVOKED") throw new ApiError(409, "ENTITLEMENT_NOT_ACTIVE", "Энэ эрх аль хэдийн цуцлагдсан байна.");
        const running = e.assessments.filter(a => ACTIVE_ASSESSMENT.includes(a.status as string));
        const finished = e.assessments.filter(a => !ACTIVE_ASSESSMENT.includes(a.status as string));
        if (e.status === "ACTIVE" || (e.status === "CONSUMED" && running.length)) { /* revocable */ }
        else if (e.status === "CONSUMED" && finished.length) throw new ApiError(409, "DIAGNOSIS_FINISHED", "Оношилгоо дууссан тул эрхийг цуцлах шаардлагагүй. Дууссан тайлан хэвээр хадгалагдана.");
        else throw new ApiError(409, "ENTITLEMENT_NOT_ACTIVE", "Зөвхөн идэвхтэй эрхийг цуцална.");
        const r = await tx.companyEntitlement.updateMany({ where: { id, status: { in: ["ACTIVE", "CONSUMED"] } }, data: { status: "REVOKED", endsAt: at, revokedAt: at, revokedByAdminId: p.adminId, revokeReason: reason } });
        if (r.count !== 1) throw new ApiError(409, "ENTITLEMENT_NOT_ACTIVE", "Эрх өөрчлөгдсөн байна. Дахин шалгана уу.");
        return { companyId: e.companyId, domainCode: e.domainCode, origin: e.origin, runningAssessmentIds: running.map(a => a.id) };
      });
      await audit(p.adminId, "ADMIN_ENTITLEMENT_REVOKED", "SUCCESS", fp, { type: "ENTITLEMENT", id }, { reason, note: note || null, ...out });
      await audit(p.adminId, "ADMIN_ENTITLEMENT_REVOKED", "SUCCESS", fp, { type: "COMPANY", id: out.companyId }, { entitlementId: id, domainCode: out.domainCode });
      await customerNotifications.accessChanged("REVOKED", out.companyId, out.domainCode, id, note || null, at).catch(() => undefined);
      ok(c.res, { revoked: true, answersKept: true, runningAssessments: out.runningAssessmentIds.length });
    } catch (e) { return fail(p, fp, "ADMIN_ENTITLEMENT_REVOKED", "ENTITLEMENT", id, e, reason); }
  }, { sensitive: true });

  route("POST", "/companies/:id/details", "accounts.manage", async (c, p, fp, b) => {
    const id = c.params.id; let reason: string | undefined;
    try {
      reason = reasonOf(b.reason);
      const name = b.name === undefined ? undefined : String(b.name).replace(/\s+/g, " ").trim();
      const industry = b.industry === undefined ? undefined : String(b.industry).replace(/\s+/g, " ").trim().slice(0, 120);
      if (name === undefined && industry === undefined) throw badRequest("Өөрчлөх мэдээллээ оруулна уу.");
      if (name !== undefined && (name.length < 2 || name.length > 160)) throw badRequest("Байгууллагын нэр 2-160 тэмдэгт байх ёстой.");
      const before = await prisma.$transaction(async tx => {
        const co = await tx.company.findUnique({ where: { id }, select: { id: true, name: true, industry: true, erasedAt: true } });
        if (!co) throw notFound("Байгууллага олдсонгүй.");
        if (co.erasedAt) throw new ApiError(409, "COMPANY_ERASED", "Устгагдсан байгууллагын мэдээллийг өөрчлөхгүй.");
        await tx.company.update({ where: { id }, data: { ...(name !== undefined ? { name } : {}), ...(industry !== undefined ? { industry: industry || null } : {}) } });
        return co;
      });
      await audit(p.adminId, "ADMIN_COMPANY_UPDATED", "SUCCESS", fp, { type: "COMPANY", id }, { reason, nameChanged: name !== undefined && name !== before.name, industryChanged: industry !== undefined && (industry || null) !== before.industry });
      ok(c.res, { updated: true });
    } catch (e) { return fail(p, fp, "ADMIN_COMPANY_UPDATED", "COMPANY", id, e, reason); }
  }, { sensitive: true });
}
