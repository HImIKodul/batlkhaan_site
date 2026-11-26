import type { IncomingMessage } from "node:http";
import { prisma } from "../../db.js";
import type { ApiConfig } from "../config.js";
import { ApiError, badRequest, notFound } from "../errors.js";
import type { Router, RouteContext } from "../http/router.js";
import type { MemoryRateLimiter } from "../http/rate-limit.js";
import { json, ok } from "../http/respond.js";
import { AdminService, type AdminPrincipal, type Permission } from "./admin-service.js";
import { OPEN_STATUSES, REVIEW_HOURS, ReviewService } from "./review-service.js";
import { hashAuditValue } from "../auth/crypto.js";
import { registerAccountRoutes } from "./account-routes.js";
import { scanReport } from "./review-scan.js";
import type { SupportMailService } from "../mail/support-mail-service.js";

export interface AdminDeps {
  router: Router; config: ApiConfig; admin: AdminService; reviews: ReviewService; supportMail: SupportMailService; queriesResults: (assessmentId: string) => Promise<any>; billing: { reconcileInvoice(id: string): Promise<any>; confirmManualPayment(id: string, reference: unknown, amount: unknown): Promise<any>; recordConfirmedRefund(id: string, reference: unknown, reason: unknown): Promise<any> }; ipLimiter: MemoryRateLimiter; loginLimiter: MemoryRateLimiter;
  readJson: (req: IncomingMessage, limit: number) => Promise<any>; clientIp: (req: IncomingMessage) => string; fingerprint: (req: IncomingMessage) => { ip?: string; userAgent?: string };
}
const A = "/api/v1/admin";
const pageOf = (q: URLSearchParams) => { const page = Math.max(1, Number(q.get("page") ?? 1) || 1); const pageSize = Math.min(50, Math.max(5, Number(q.get("pageSize") ?? 20) || 20)); return { page, pageSize, skip: (page - 1) * pageSize }; };
const DISPUTE_STATUSES = ["OPEN", "UNDER_REVIEW", "MORE_INFORMATION_REQUIRED", "APPROVED", "REJECTED", "RESOLVED"];
const clean = (v: unknown, max: number) => String(v ?? "").replace(/\s*[—―]\s*/g, " - ").trim().slice(0, max);

export function registerAdminRoutes(d: AdminDeps) {
  const { router, config, admin, reviews, supportMail, queriesResults } = d;
  type H = (ctx: RouteContext, p: AdminPrincipal, fp: { ip?: string; userAgent?: string }, body: any) => Promise<void>;
  const route = (method: string, path: string, permission: Permission | null, handler: H, opts: { sensitive?: boolean; body?: boolean } = {}) => router.add(method, A + path, async ctx => {
    const fp = d.fingerprint(ctx.req); d.ipLimiter.check(`admin:api:${fp.ip}`);
    const p = await admin.authenticate(ctx.req.headers.authorization);
    if (permission) await admin.requirePermission(p, permission, fp, { sensitive: opts.sensitive });
    const body = method === "GET" || opts.body === false ? {} : await d.readJson(ctx.req, config.requestBodyLimitBytes);
    // Persist authorization before any mutation. If audit storage is unavailable no
    // mutation runs; a failed completion audit still leaves the durable intent.
    const mutation=method!=="GET";
    if(mutation)await admin.audit(p.adminId,"ADMIN_MUTATION_AUTHORIZED","SUCCESS",fp,{type:"ROUTE",id:ctx.params.id??path},{method,path});
    try{await handler(ctx, p, fp, body)}catch(error){
      if(mutation)await admin.audit(p.adminId,"ADMIN_MUTATION_FAILED","FAILURE",fp,{type:"ROUTE",id:ctx.params.id??path},{method,path});
      throw error;
    }
    if(mutation)await admin.audit(p.adminId,"ADMIN_MUTATION_COMPLETED","SUCCESS",fp,{type:"ROUTE",id:ctx.params.id??path},{method,path});
  }, false);
  const aud = (p: AdminPrincipal, fp: any, action: string, type: string, id: string, meta?: Record<string, unknown>) => admin.audit(p.adminId, action, "SUCCESS", fp, { type, id }, meta);

  // ----- authentication -----
  router.add("POST", A + "/auth/login", async ctx => {
    const fp = d.fingerprint(ctx.req); d.loginLimiter.check(`admin:login:ip:${fp.ip}`); const body = await d.readJson(ctx.req, config.requestBodyLimitBytes);
    d.loginLimiter.check(`admin:login:acct:${hashAuditValue(String(body.email ?? "").toLowerCase(), config.auditSalt)}`);
    ok(ctx.res, await admin.login(body, fp));
  }, false);
  route("POST", "/auth/logout", null, async (c, p, fp) => { await admin.logout(p, fp); ok(c.res, { loggedOut: true }); }, { body: false });
  route("POST", "/auth/reauth", null, async (c, p, fp, b) => { d.loginLimiter.check(`admin:reauth:${p.adminId}`); await admin.reauth(p, b, fp); ok(c.res, { reauthenticatedForMinutes: 5 }); });
  route("GET", "/auth/me", null, async (c, p) => {
    const unread = await prisma.adminNotification.count({ where: { reads: { none: { adminId: p.adminId } } } });
    ok(c.res, { id: p.adminId, email: p.email, role: p.role, permissions: p.permissions, unreadNotifications: unread, reauthValid: !!p.reauthAt && Date.now() - p.reauthAt.getTime() < 300_000 });
  });

  // ----- dashboard (all numbers come from the database) -----
  route("GET", "/dashboard", "notifications.read", async (c, p) => {
    const now = new Date(); const can = (x: Permission) => p.permissions.includes(x);
    const data: any = {};
    if (can("reports.read")) {
      const g = await prisma.reportReview.groupBy({ by: ["status"], _count: { _all: true } }); const n = (s: string) => g.find(x => x.status === s)?._count._all ?? 0;
      data.reports = { toReview: n("AWAITING_REVIEW") + n("SUBMITTED") + n("GENERATING_DRAFT"), inReview: n("IN_REVIEW"), readyForApproval: n("READY_FOR_APPROVAL") + n("APPROVED"), generationFailed: n("GENERATION_FAILED"),
        overdue: await prisma.reportReview.count({ where: { status: { in: OPEN_STATUSES as any }, deadlineAt: { lt: now } } }), published: n("PUBLISHED") };
    }
    if (can("payments.read")) data.payments = { openRequests: await prisma.paymentDispute.count({ where: { status: { in: ["OPEN", "UNDER_REVIEW", "MORE_INFORMATION_REQUIRED"] } } }) };
    const mailCounts = await supportMail.openCount().catch(() => ({ open: 0, unanswered: 0 }));
    data.support = { open: await prisma.supportCase.count({ where: { status: { in: ["OPEN", "IN_PROGRESS", "WAITING_CUSTOMER"] } } }), mailOpen: mailCounts.open, mailUnanswered: mailCounts.unanswered, mailConnected: supportMail.status().connected };
    if (can("companies.read") || can("accounts.manage")) {
      const [users, companies, active, pending, done, inProgress] = await Promise.all([
        prisma.user.count({ where: { erasedAt: null } }), prisma.company.count({ where: { erasedAt: null } }), prisma.user.count({ where: { erasedAt: null, status: "ACTIVE" } }),
        prisma.user.count({ where: { erasedAt: null, emailVerificationRequired: true, emailVerifiedAt: null } }),
        prisma.assessment.count({ where: { status: { in: ["COMPLETED", "COMPLETED_WITH_REVIEW"] } } }), prisma.assessment.count({ where: { status: { in: ["IN_PROGRESS", "PAUSED", "READY_FOR_COMPLETION", "PROCESSING", "PROFILE_PENDING"] } } })]);
      data.business = { customers: users, companies, activeAccounts: active, pendingAccounts: pending, completedDiagnoses: done, diagnosesInProgress: inProgress };
    }
    if (can("payments.read")) { const [paid, pendingInv] = await Promise.all([prisma.billingInvoice.count({ where: { status: "PAID" } }), prisma.billingInvoice.count({ where: { status: { in: ["CREATED", "PENDING"] } } })]); data.payments = { ...(data.payments ?? {}), paidInvoices: paid, pendingInvoices: pendingInv }; }
    const recent = await prisma.adminAuditEvent.findMany({ where: { action: { notIn: ["ADMIN_LOGIN", "ADMIN_REAUTH", "ADMIN_LOGOUT", "PERMISSION_DENIED"] } }, orderBy: { createdAt: "desc" }, take: 8, select: { action: true, targetType: true, targetId: true, outcome: true, createdAt: true } });
    data.recentActivity = recent; data.generatedAt = now; ok(c.res, data);
  });

  // ----- report reviews -----
  route("GET", "/reviews", "reports.read", async (c) => {
    const q = c.query; const { page, pageSize, skip } = pageOf(q); const where: any = {};
    if (q.get("status")) where.status = q.get("status"); if (q.get("domain")) where.domainCode = q.get("domain");
    if (q.get("returned") === "1") { where.status = "IN_REVIEW"; where.remindersSent = { path: ["returnedAt"], string_starts_with: "2" }; }
    if (q.get("overdue") === "1") { where.status = { in: OPEN_STATUSES }; where.deadlineAt = { lt: new Date() }; }
    if (q.get("q")) { const cs = await prisma.company.findMany({ where: { name: { contains: String(q.get("q")), mode: "insensitive" } }, select: { id: true }, take: 200 }); where.OR = [{ companyId: { in: cs.map(x => x.id) } }, { id: { startsWith: String(q.get("q")) } }, { assessmentId: { startsWith: String(q.get("q")) } }]; }
    const sort = q.get("sort") === "submitted" ? { submittedAt: "desc" as const } : { deadlineAt: "asc" as const };
    const [total, rows] = await Promise.all([prisma.reportReview.count({ where }), prisma.reportReview.findMany({ where, orderBy: sort, skip, take: pageSize })]);
    const companies = await prisma.company.findMany({ where: { id: { in: rows.map(r => r.companyId) } }, select: { id: true, name: true } }); const cm = new Map(companies.map(x => [x.id, x.name]));
    ok(c.res, { page, pageSize, total, items: rows.map(r => ({ id: r.id, assessmentId: r.assessmentId, companyId: r.companyId, company: cm.get(r.companyId) ?? "", domain: r.domainCode, status: r.status, submittedAt: r.submittedAt, deadlineAt: r.deadlineAt, approvedAt: r.approvedAt, returned: r.status === "IN_REVIEW" && Boolean((r.remindersSent as any)?.returnedAt), overdue: OPEN_STATUSES.includes(r.status as any) && r.deadlineAt < new Date(), assignedAdminId: r.assignedAdminId, revision: r.currentRevision, publishedAt: r.publishedAt })) });
  });
  route("GET", "/reviews/:id", "reports.read", async (c, p, fp) => {
    const r: any = await prisma.reportReview.findUnique({ where: { id: c.params.id } }); if (!r) throw notFound("Хяналтын даалгавар олдсонгүй.");
    const [company, rev, revisions, suggestions, a] = await Promise.all([prisma.company.findUnique({ where: { id: r.companyId }, select: { id: true, name: true, industry: true, employeeCount: true, country: true, marketType: true } }), reviews.latestRevision(r.id).catch(() => null),
      prisma.reportReviewRevision.findMany({ where: { reviewId: r.id }, orderBy: { revision: "desc" }, select: { revision: true, source: true, reason: true, changedClaims: true, createdByAdminId: true, createdAt: true } }),
      prisma.reportReviewSuggestion.findMany({ where: { reviewId: r.id, status: "PROPOSED" }, orderBy: { createdAt: "desc" } }),
      prisma.assessment.findUnique({ where: { id: r.assessmentId }, select: { overallOfficialScore: true, overallPartialScore: true, coverage: true, completedAt: true, status: true, methodologyVersion: { select: { version: true } } } })]);
    const validation = rev ? await reviews.validate(r.assessmentId, rev.narrative as any).catch(() => null) : null;
    await aud(p, fp, "REPORT_REVIEW_VIEWED", "REVIEW", r.id);
    ok(c.res, { review: r, lock: await reviews.lockInfo(r.id, p.adminId), company, assessment: a ? { score: a.overallOfficialScore ?? a.overallPartialScore, coverage: a.coverage, completedAt: a.completedAt, methodologyVersion: a.methodologyVersion.version } : null, claims: rev ? reviews.claimsOf(rev.narrative as any) : [], revision: rev?.revision ?? 0, revisions, suggestions, validation, aiMode: (process.env.MMRI_AI_REPORT_PROVIDER ?? "disabled").toLowerCase() === "openai" ? "PROVIDER_CONFIGURED_NOT_APPROVED_FOR_ASSIST" : "MOCK" });
  });
  route("GET", "/reviews/:id/revisions/:n", "reports.read", async (c) => { const rev = await prisma.reportReviewRevision.findUnique({ where: { reviewId_revision: { reviewId: c.params.id, revision: Number(c.params.n) } } }); if (!rev) throw notFound("Хувилбар олдсонгүй."); ok(c.res, { revision: rev.revision, source: rev.source, reason: rev.reason, createdAt: rev.createdAt, claims: reviews.claimsOf(rev.narrative as any) }); });
  route("GET", "/reviews/:id/evidence", "reports.read", async (c, p, fp) => { await aud(p, fp, "EVIDENCE_VIEWED", "REVIEW", c.params.id); ok(c.res, await reviews.evidence(c.params.id, { categoryId: c.query.get("capability") ?? undefined, state: c.query.get("state") ?? undefined, finding: c.query.get("finding") ?? undefined, q: c.query.get("q") ?? undefined })); });
  route("POST", "/reviews/:id/lock", "reports.edit", async (c, p) => { ok(c.res, await reviews.acquireLock(c.params.id, p.adminId)); }, { body: false });
  route("POST", "/reviews/:id/unlock", "reports.edit", async (c, p) => { await reviews.releaseLock(c.params.id, p.adminId); ok(c.res, { released: true }); }, { body: false });
  route("GET", "/reviews/:id/report-view", "reports.read", async (c, p) => { const v = await reviews.reportView(c.params.id, { results: id => queriesResults(id) }); ok(c.res, { ...v, lock: await reviews.lockInfo(c.params.id, p.adminId) }); });
  route("POST", "/reviews/:id/scan", "reports.edit", async (c) => {
    const rev = await reviews.latestRevision(c.params.id); const claims = reviews.claimsOf(rev.narrative as any).map(x => ({ claimId: x.claimId, sectionId: x.sectionId, text: x.text }));
    const res = await scanReport(claims, await reviews.scanContext(c.params.id));
    // Findings on calculated / mandatory-disclosure claims stay visible (they are real observations) but carry no text proposal: those claims are not editable.
    const editable = new Map(reviews.claimsOf(rev.narrative as any).map(x => [x.claimId, x.editable]));
    for (const f of res.findings) if (f.claimId && editable.get(f.claimId) === false) { delete (f as any).suggestion; f.message += " (Тооцоолсон эсвэл заавал оруулах хэсэг: энд засахгүй.)"; }
    ok(c.res, { revision: rev.revision, ...res });
  }, { body: false });
  route("POST", "/reviews/:id/claim", "reports.edit", async (c, p, fp) => { await reviews.claim(c.params.id, p.adminId, p.role); await aud(p, fp, "REVIEW_CLAIMED", "REVIEW", c.params.id); ok(c.res, { claimed: true }); }, { body: false });
  route("PUT", "/reviews/:id/draft", "reports.edit", async (c, p, fp, b) => { const out = await reviews.saveEdits(c.params.id, p.adminId, p.role, Number(b.baseRevision), Array.isArray(b.edits) ? b.edits.slice(0, 60) : [], clean(b.reason, 500)); await aud(p, fp, "REPORT_EDITED", "REVIEW", c.params.id, { revision: out.revision, changed: out.changedClaims.length }); ok(c.res, out); });
  route("POST", "/reviews/:id/restore", "reports.edit", async (c, p, fp, b) => { const out = await reviews.restore(c.params.id, p.adminId, p.role, Number(b.baseRevision), Number(b.revision)); await aud(p, fp, "REPORT_RESTORED", "REVIEW", c.params.id, { from: b.revision, revision: out.revision }); ok(c.res, out); });
  // ----- visual editor: annotations on the three PDF pages (saved as ordinary append-only revisions) -----
  route("GET", "/reviews/:id/editor", "reports.read", async (c) => { ok(c.res, await reviews.editorState(c.params.id)); });
  route("GET", "/reviews/:id/editor/revisions/:n/annotations", "reports.read", async (c) => { ok(c.res, await reviews.annotationsOfRevision(c.params.id, Number(c.params.n))); });
  route("GET", "/reviews/:id/editor/page/:n", "reports.read", async (c) => {
    const n = Number(c.params.n); if (!Number.isInteger(n) || n < 1 || n > 3) throw new ApiError(400, "BAD_REQUEST", "Хуудасны дугаар 1-3 байх ёстой.");
    const rawRev = c.query.get("revision"); const revision = rawRev === null ? undefined : Number(rawRev); if (revision !== undefined && (!Number.isInteger(revision) || revision < 1)) throw new ApiError(400, "BAD_REQUEST", "Хувилбар буруу байна.");
    const pages = await reviews.previewPages(c.params.id, { annotated: c.query.get("annotated") === "1", revision });
    c.res.writeHead(200, { "content-type": "image/png", "content-length": pages[n - 1].length, "cache-control": "no-store" }); c.res.end(pages[n - 1]);
  });
  route("POST", "/reviews/:id/editor/preview", "reports.edit", async (c, p, fp, b) => {
    d.ipLimiter.check(`admin:editor-preview:${p.adminId}`);
    const pages = await reviews.previewPages(c.params.id, { annotated: true, annotations: b.annotations ?? { version: 1, items: [] } });
    ok(c.res, { pages: pages.map(x => "data:image/png;base64," + x.toString("base64")) });
  });
  route("PUT", "/reviews/:id/annotations", "reports.edit", async (c, p, fp, b) => {
    const out = await reviews.saveAnnotations(c.params.id, p.adminId, p.role, Number(b.baseRevision), b.annotations, clean(b.reason, 500));
    await aud(p, fp, "REPORT_ANNOTATED", "REVIEW", c.params.id, { revision: out.revision, annotations: out.annotationCount }); ok(c.res, out);
  });
  route("POST", "/reviews/:id/ready", "reports.edit", async (c, p, fp) => { await reviews.markReady(c.params.id, p.adminId, p.role); await aud(p, fp, "REVIEW_MARKED_READY", "REVIEW", c.params.id); ok(c.res, { status: "READY_FOR_APPROVAL" }); }, { body: false });
  route("POST", "/reviews/:id/return", "reports.edit", async (c, p, fp, b) => { const reason = clean(b.reason, 400); if (reason.length < 5) throw badRequest("Батлаагүй шалтгаанаа бичнэ үү."); await reviews.returnToReview(c.params.id, p.adminId, p.role, reason); await aud(p, fp, "REVIEW_RETURNED", "REVIEW", c.params.id, { reason }); ok(c.res, { status: "IN_REVIEW" }); });
  route("POST", "/reviews/:id/regenerate-draft", "reports.edit", async (c, p, fp) => { const r = await prisma.reportReview.findUnique({ where: { id: c.params.id } }); if (!r || r.status !== "GENERATION_FAILED") throw new ApiError(409, "INVALID_STATE", "Зөвхөн амжилтгүй болсон төсөл дахин үүснэ."); void reviews.generateDraft(r.id, "ADMIN", p.adminId); await aud(p, fp, "DRAFT_REGENERATION_STARTED", "REVIEW", r.id); ok(c.res, { started: true }); }, { body: false });
  // 12-month plan: read and correct by hand (never calls a model)
  route("GET", "/reviews/:id/annual-plan", "reports.read", async (c) => ok(c.res, await reviews.annualPlanState(c.params.id)));
  route("PUT", "/reviews/:id/annual-plan", "reports.edit", async (c, p, fp, b) => { const out = await reviews.saveAnnualPlan(c.params.id, p.adminId, p.role, Number(b.baseRevision), b.plan, clean(b.reason, 400)); await aud(p, fp, "ANNUAL_PLAN_EDITED", "REVIEW", c.params.id, out); ok(c.res, out); });
  // A failed or unwanted AI draft can be started by hand: deterministic working text, free of charge, still behind review and approval.
  route("POST", "/reviews/:id/draft-without-ai", "reports.edit", async (c, p, fp) => { const r = await prisma.reportReview.findUnique({ where: { id: c.params.id } }); if (!r || !["GENERATION_FAILED", "SUBMITTED"].includes(r.status)) throw new ApiError(409, "INVALID_STATE", "Төсөл аль хэдийн үүссэн байна."); await reviews.generateDraft(r.id, "ADMIN", p.adminId, true); await aud(p, fp, "DRAFT_STARTED_WITHOUT_AI", "REVIEW", r.id); const now = await prisma.reportReview.findUnique({ where: { id: r.id }, select: { status: true } }); ok(c.res, { status: now?.status }); }, { body: false });
  /* Spends money on the AI provider, so: publish permission, recent password + MFA, a written reason and an explicit confirmation. */
  route("POST", "/reviews/:id/annual-plan", "reports.publish", async (c, p, fp, b) => {
    const reason = clean(b.reason, 300); if (reason.length < 5) throw badRequest("Шалтгаан шаардлагатай."); if (b.confirmSpend !== true) throw badRequest("Төлбөртэй боловсруулалтыг баталгаажуулна уу.");
    await aud(p, fp, "ANNUAL_PLAN_RECOVERY_REQUESTED", "REVIEW", c.params.id, { reason });
    const out = await reviews.recoverAnnualPlan(c.params.id, p.adminId, p.role, reason);
    await aud(p, fp, "ANNUAL_PLAN_RECOVERED", "REVIEW", c.params.id, out); ok(c.res, out);
  }, { sensitive: true });
  route("POST", "/reviews/:id/approve", "reports.approve", async (c, p, fp, b) => { const out = await reviews.approveAndRelease(c.params.id, p.adminId, p.role, Number(b.baseRevision)); if (out.approvedNow) await aud(p, fp, "REPORT_APPROVED", "REVIEW", c.params.id, { revision: b.baseRevision }); if (!out.alreadyPublished) await aud(p, fp, "REPORT_PUBLISHED", "REVIEW", c.params.id, { publishedRevision: out.publishedRevision }); // Send the release e-mail now instead of waiting for the next maintenance pass, then report the real delivery state (never claim more than happened).
    if (!out.alreadyPublished) await reviews.afterMaintenance?.().catch(() => undefined);
    const rv: any = await prisma.reportReview.findUnique({ where: { id: c.params.id }, select: { assessmentId: true } });
    const notes = rv ? await prisma.customerNotification.findMany({ where: { type: "REPORT_RELEASED", payload: { path: ["assessmentId"], equals: rv.assessmentId } }, select: { id: true } }) : [];
    const mailed = notes.length ? await prisma.mailDispatchMark.count({ where: { dedupeKey: { in: notes.map(n => `CN:${n.id}`) }, sentAt: { not: null } } }) : 0;
    ok(c.res, { ...out, delivery: { notifications: notes.length, email: config.mailProvider === "disabled" || (process.env.MMRI_CUSTOMER_EMAILS ?? "off").toLowerCase() !== "on" ? "NOT_CONFIGURED" : mailed > 0 ? "SENT" : "PENDING", mailProvider: config.mailProvider } }); }, { sensitive: true });
  route("POST", "/reviews/:id/publish", "reports.publish", async (c, p, fp) => { const out = await reviews.publish(c.params.id, p.adminId); await aud(p, fp, "REPORT_PUBLISHED", "REVIEW", c.params.id, out); ok(c.res, { status: "PUBLISHED", ...out }); }, { sensitive: true, body: false });
  route("POST", "/reviews/:id/ai/suggest", "reports.edit", async (c, p, fp, b) => { d.ipLimiter.check(`admin:ai:${p.adminId}`); const out = await reviews.suggest(c.params.id, p.adminId, Array.isArray(b.claimIds) ? b.claimIds.slice(0, 20) : undefined); await aud(p, fp, "AI_SUGGESTIONS_REQUESTED", "REVIEW", c.params.id, { source: out.source, created: out.created }); ok(c.res, out); });
  route("POST", "/reviews/:id/ai/suggestions/:sid/apply", "reports.edit", async (c, p, fp, b) => { const out = await reviews.decideSuggestion(c.params.id, c.params.sid, p.adminId, p.role, "apply", b.baseRevision === undefined ? undefined : Number(b.baseRevision)); await aud(p, fp, "AI_SUGGESTION_APPLIED", "REVIEW", c.params.id, { suggestion: c.params.sid }); ok(c.res, out); });
  route("POST", "/reviews/:id/ai/suggestions/:sid/reject", "reports.edit", async (c, p, fp) => { const out = await reviews.decideSuggestion(c.params.id, c.params.sid, p.adminId, p.role, "reject"); await aud(p, fp, "AI_SUGGESTION_REJECTED", "REVIEW", c.params.id, { suggestion: c.params.sid }); ok(c.res, out); }, { body: false });

  // ----- companies -----
  route("GET", "/companies", "companies.read", async (c) => {
    const { page, pageSize, skip } = pageOf(c.query); const q = c.query.get("q");
    // A customer is found by company name or by a member's e-mail.
    const where: any = { erasedAt: null, ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { memberships: { some: { user: { email: { contains: q, mode: "insensitive" } } } } }] } : {}) };
    const [total, rows] = await Promise.all([prisma.company.count({ where }), prisma.company.findMany({ where, orderBy: { createdAt: "desc" }, skip, take: pageSize, select: { id: true, name: true, industry: true, createdAt: true, _count: { select: { assessments: true } },
      memberships: { orderBy: { createdAt: "asc" }, take: 3, select: { user: { select: { email: true } } } }, entitlements: { where: { status: "ACTIVE" }, select: { domainCode: true, origin: true } } } })]);
    ok(c.res, { page, pageSize, total, items: rows.map((r: any) => ({ id: r.id, name: r.name, industry: r.industry, createdAt: r.createdAt, assessments: r._count.assessments, customers: r.memberships.map((m: any) => m.user.email), access: r.entitlements.map((e: any) => ({ domain: e.domainCode, origin: e.origin })) })) });
  });
  route("GET", "/companies/:id", "companies.read", async (c, p, fp) => {
    const co = await prisma.company.findUnique({ where: { id: c.params.id }, select: { id: true, name: true, industry: true, businessModel: true, employeeCount: true, companyAgeYears: true, marketType: true, country: true, createdAt: true, erasedAt: true } }); if (!co) throw notFound("Байгууллага олдсонгүй.");
    const [members, assessments, reviewRows, ents] = await Promise.all([prisma.companyMembership.findMany({ where: { companyId: co.id }, select: { role: true, user: { select: { email: true, displayName: true } } } }),
      prisma.assessment.findMany({ where: { companyId: co.id }, orderBy: { createdAt: "desc" }, select: { id: true, domainCode: true, status: true, overallOfficialScore: true, overallPartialScore: true, startedAt: true, completedAt: true } }),
      prisma.reportReview.findMany({ where: { companyId: co.id }, select: { id: true, assessmentId: true, status: true, deadlineAt: true } }), prisma.companyEntitlement.findMany({ where: { companyId: co.id }, select: { domainCode: true, planCode: true, status: true, assessmentsUsed: true, assessmentLimit: true } })]);
    const rv = new Map(reviewRows.map(x => [x.assessmentId, x]));
    await aud(p, fp, "COMPANY_VIEWED", "COMPANY", co.id);
    ok(c.res, { company: co, members: members.map(m => ({ role: m.role, email: m.user.email, name: m.user.displayName })), entitlements: ents, assessments: (assessments as any[]).map((a: any) => ({ ...a, score: a.overallOfficialScore ?? a.overallPartialScore, review: rv.get(a.id) ?? null, incomplete: !["COMPLETED", "COMPLETED_WITH_REVIEW", "EXHAUSTED"].includes(a.status) })) });
  });

  // ----- payments and disputes (admins can never mark an invoice paid or execute a refund) -----
  route("GET", "/payments", "payments.read", async (c) => {
    const { page, pageSize, skip } = pageOf(c.query); const where: any = {}; if (c.query.get("status")) where.status = c.query.get("status"); if (c.query.get("domain")) where.domainCode = c.query.get("domain");
    const [total, rows] = await Promise.all([prisma.billingInvoice.count({ where }), prisma.billingInvoice.findMany({ where, orderBy: { createdAt: "desc" }, skip, take: pageSize, select: { id: true, companyId: true, domainCode: true, planCode: true, amountMnt: true, currency: true, provider: true, status: true, paidAt: true, createdAt: true, providerPaymentId: true, refundedAt: true, lastVerifiedAt: true, callbackReceivedAt: true, failureReason: true } })]);
    const cos = await prisma.company.findMany({ where: { id: { in: rows.map(r => r.companyId) } }, select: { id: true, name: true } }); const cm = new Map(cos.map(x => [x.id, x.name]));
    const disputes = await prisma.paymentDispute.findMany({ where: { invoiceId: { in: rows.map(r => r.id) } }, select: { invoiceId: true, id: true, status: true } }); const dm = new Map(disputes.map(x => [x.invoiceId, x]));
    const dup: any[] = await prisma.$queryRaw`select "companyId","domainCode","planCode",count(*)::int n from billing_invoices where status='PAID' group by 1,2,3 having count(*)>1`;
    const dupKeys = new Set(dup.map(x => `${x.companyId}|${x.domainCode}|${x.planCode}`));
    ok(c.res, { page, pageSize, total, items: rows.map(r => ({ ...r, company: cm.get(r.companyId) ?? "", dispute: dm.get(r.id) ?? null, duplicatePaymentAlert: r.status === "PAID" && dupKeys.has(`${r.companyId}|${r.domainCode}|${r.planCode}`) })) });
  });
  route("GET", "/disputes", "payments.read", async (c) => {
    const { page, pageSize, skip } = pageOf(c.query); const where: any = c.query.get("status") ? { status: c.query.get("status") } : {};
    const [total, rows] = await Promise.all([prisma.paymentDispute.count({ where }), prisma.paymentDispute.findMany({ where, orderBy: { createdAt: "desc" }, skip, take: pageSize })]);
    ok(c.res, { page, pageSize, total, items: rows });
  });
  route("GET", "/disputes/:id", "payments.read", async (c, p, fp) => {
    const dsp = await prisma.paymentDispute.findUnique({ where: { id: c.params.id }, include: { events: { orderBy: { createdAt: "asc" } } } }); if (!dsp) throw notFound("Маргаан олдсонгүй.");
    const inv = await prisma.billingInvoice.findUnique({ where: { id: dsp.invoiceId }, select: { id: true, amountMnt: true, currency: true, status: true, provider: true, providerPaymentId: true, paidAt: true, refundedAt: true, domainCode: true, planCode: true, createdAt: true } });
    await aud(p, fp, "DISPUTE_VIEWED", "DISPUTE", dsp.id); ok(c.res, { dispute: dsp, invoice: inv, refundExecution: "DISABLED: бодит буцаалт төлбөрийн үйлчилгээ холбогдох хүртэл ажиллахгүй" });
  });
  route("POST", "/disputes/:id/events", "payments.decide", async (c, p, fp, b) => {
    const kind = ["NOTE", "INFO_REQUEST"].includes(b.kind) ? b.kind : "NOTE"; const body = clean(b.body, 2000); if (body.length < 2) throw badRequest("Тайлбар хоосон байна.");
    const ev = await prisma.paymentDisputeEvent.create({ data: { disputeId: c.params.id, adminId: p.adminId, kind, body } });
    if (kind === "INFO_REQUEST") await prisma.paymentDispute.update({ where: { id: c.params.id }, data: { status: "MORE_INFORMATION_REQUIRED", version: { increment: 1 } } });
    await aud(p, fp, "DISPUTE_" + kind, "DISPUTE", c.params.id); ok(c.res, ev);
  });
  /* SEC-01: manual money actions are administrator operations. They need the payments.decide permission (SUPER_ADMIN / BILLING_REVIEWER), a RECENT password+MFA reauthentication (sensitive), a written reason, and the route wrapper
     persists the intent BEFORE the mutation and the outcome after it. A customer session never reaches these. */
  route("POST", "/billing/invoices/:id/manual-confirm", "payments.decide", async (c, p, fp, b) => {
    const reason = clean(b.reason, 500); if (reason.length < 5) throw badRequest("Баталгаажуулах шалтгаан шаардлагатай.");
    const inv = await d.billing.confirmManualPayment(c.params.id, b.paymentReference, b.amountMnt);
    await aud(p, fp, "ADMIN_MANUAL_PAYMENT_CONFIRMED", "INVOICE", c.params.id, { reason, paymentReference: clean(b.paymentReference, 200), amountMnt: Number(b.amountMnt ?? 0) });
    ok(c.res, inv);
  }, { sensitive: true });
  /* Asks QPay again about one invoice. It cannot mark anything paid by itself: the invoice and entitlement change only when QPay confirms the exact payment (same path as the callback). */
  route("POST", "/billing/invoices/:id/reconcile", "payments.decide", async (c, p, fp) => {
    const before = await prisma.billingInvoice.findUnique({ where: { id: c.params.id }, select: { status: true } }); if (!before) throw notFound("Нэхэмжлэх олдсонгүй.");
    const inv = await d.billing.reconcileInvoice(c.params.id);
    await aud(p, fp, "ADMIN_PAYMENT_RECONCILED", "INVOICE", c.params.id, { before: before.status, after: inv.status });
    ok(c.res, { status: inv.status, changed: inv.status !== before.status, lastVerifiedAt: inv.lastVerifiedAt });
  });
  route("POST", "/billing/invoices/:id/refund-confirm", "payments.decide", async (c, p, fp, b) => {
    const reason = clean(b.reason, 500); if (reason.length < 5) throw badRequest("Буцаалтын шалтгаан шаардлагатай.");
    const inv = await d.billing.recordConfirmedRefund(c.params.id, b.refundReference, reason);
    await aud(p, fp, "ADMIN_REFUND_CONFIRMED", "INVOICE", c.params.id, { reason, refundReference: clean(b.refundReference, 200) });
    ok(c.res, inv);
  }, { sensitive: true });
  route("POST", "/disputes/:id/status", "payments.decide", async (c, p, fp, b) => {
    const status = String(b.status); if (!DISPUTE_STATUSES.includes(status)) throw badRequest("Төлөв буруу байна.");
    const decisive = ["APPROVED", "REJECTED", "RESOLVED"].includes(status);
    if (decisive && (!p.reauthAt || Date.now() - p.reauthAt.getTime() > 300_000)) throw new ApiError(401, "ADMIN_REAUTH_REQUIRED", "Энэ үйлдэл нууц үг ба MFA кодоор дахин баталгаажуулахыг шаардана.");
    const note = clean(b.note, 2000); if (decisive && note.length < 3) throw badRequest("Шийдвэрийн тайлбар шаардлагатай.");
    const u = await prisma.paymentDispute.updateMany({ where: { id: c.params.id, version: Number(b.version) }, data: { status, version: { increment: 1 }, assignedAdminId: p.adminId, ...(status === "RESOLVED" || status === "REJECTED" ? { resolution: note } : {}) } });
    if (u.count !== 1) throw new ApiError(409, "VERSION_CONFLICT", "Маргаан өөр хүнээр өөрчлөгдсөн байна. Шинэчилнэ үү.");
    await prisma.paymentDisputeEvent.create({ data: { disputeId: c.params.id, adminId: p.adminId, kind: decisive ? "DECISION" : "STATUS", body: `${status}${note ? ": " + note : ""}` } });
    await aud(p, fp, "DISPUTE_STATUS_" + status, "DISPUTE", c.params.id); ok(c.res, { status });
  });
  route("POST", "/disputes/:id/refund-approval", "payments.decide", async (c, p, fp, b) => {
    const dsp = await prisma.paymentDispute.findUnique({ where: { id: c.params.id } }); if (!dsp) throw notFound("Маргаан олдсонгүй."); if (dsp.status !== "APPROVED") throw new ApiError(409, "INVALID_STATE", "Буцаалтыг зөвхөн зөвшөөрсөн маргаанд батална.");
    await prisma.paymentDispute.update({ where: { id: dsp.id }, data: { refundApprovedAt: new Date(), version: { increment: 1 } } });
    await prisma.paymentDisputeEvent.create({ data: { disputeId: dsp.id, adminId: p.adminId, kind: "DECISION", body: "Буцаалт зөвшөөрөгдсөн. Буцаалт гүйцэтгэгдээгүй: төлбөрийн үйлчилгээгээр баталгаажаагүй." } });
    await aud(p, fp, "REFUND_APPROVED_NOT_EXECUTED", "DISPUTE", dsp.id); ok(c.res, { refundApproved: true, refundExecuted: false, note: "Буцаалт гүйцэтгэгдсэнийг төлбөрийн үйлчилгээ эсвэл банкны тулгалтаар баталгаажуулах хүртэл гүйцэтгэгдсэн гэж үзэхгүй." });
  }, { sensitive: true });

  // ----- notifications -----
  route("GET", "/notifications", "notifications.read", async (c, p) => {
    const { page, pageSize, skip } = pageOf(c.query); const where: any = {}; if (c.query.get("type")) where.type = c.query.get("type"); if (c.query.get("unread") === "1") where.reads = { none: { adminId: p.adminId } };
    const [total, rows, unread] = await Promise.all([prisma.adminNotification.count({ where }), prisma.adminNotification.findMany({ where, orderBy: { createdAt: "desc" }, skip, take: pageSize, include: { reads: { where: { adminId: p.adminId }, select: { readAt: true } } } }), prisma.adminNotification.count({ where: { reads: { none: { adminId: p.adminId } } } })]);
    ok(c.res, { page, pageSize, total, unread, items: rows.map(n => ({ id: n.id, type: n.type, severity: n.severity, title: n.title, body: n.body, targetType: n.targetType, targetId: n.targetId, createdAt: n.createdAt, read: n.reads.length > 0 })) });
  });
  route("POST", "/notifications/:id/read", "notifications.read", async (c, p) => { await prisma.adminNotificationRead.upsert({ where: { adminId_notificationId: { adminId: p.adminId, notificationId: c.params.id } }, create: { adminId: p.adminId, notificationId: c.params.id }, update: {} }); ok(c.res, { read: true }); }, { body: false });
  route("POST", "/notifications/read-all", "notifications.read", async (c, p) => { const ids = await prisma.adminNotification.findMany({ where: { reads: { none: { adminId: p.adminId } } }, select: { id: true } }); await prisma.adminNotificationRead.createMany({ data: ids.map(x => ({ adminId: p.adminId, notificationId: x.id })), skipDuplicates: true }); ok(c.res, { marked: ids.length }); }, { body: false });

  // ----- support mailbox (Gmail / mock): conversations imported from the business mailbox -----
  route("GET", "/support-mail/status", "support.manage", async (c) => { ok(c.res, supportMail.status()); });
  route("POST", "/support-mail/sync", "support.manage", async (c, p, fp) => { const r = await supportMail.sync(true); await aud(p, fp, "SUPPORT_MAIL_SYNC", "SUPPORT_MAIL", "sync", { imported: r.imported }); ok(c.res, r); }, { body: false });
  route("GET", "/support-mail", "support.manage", async (c) => { const { page, pageSize } = pageOf(c.query); await supportMail.sync(false); const out = await supportMail.list({ status: c.query.get("status") ?? undefined, search: (c.query.get("q") ?? "").trim() || undefined, unanswered: c.query.get("unanswered") === "1", page, pageSize }); ok(c.res, { page, pageSize, ...out, status: supportMail.status() }); });
  route("GET", "/support-mail/:id", "support.manage", async (c) => { ok(c.res, await supportMail.get(c.params.id)); });
  route("POST", "/support-mail/:id/reply", "support.manage", async (c, p, fp, b) => { const r = await supportMail.reply(c.params.id, p.adminId, String(b.text ?? "")); await aud(p, fp, "SUPPORT_MAIL_REPLY", "SUPPORT_MAIL", c.params.id); ok(c.res, r); });
  route("POST", "/support-mail/:id/handled", "support.manage", async (c, p, fp, b) => { await supportMail.setHandled(c.params.id, p.adminId, b.handled !== false); await aud(p, fp, b.handled === false ? "SUPPORT_MAIL_REOPENED" : "SUPPORT_MAIL_HANDLED", "SUPPORT_MAIL", c.params.id); ok(c.res, { handled: b.handled !== false }); });
  // ----- support cases -----
  route("GET", "/support", "support.manage", async (c) => { const { page, pageSize, skip } = pageOf(c.query); const where: any = {}; if (c.query.get("status")) where.status = c.query.get("status"); const [total, rows] = await Promise.all([prisma.supportCase.count({ where }), prisma.supportCase.findMany({ where, orderBy: { createdAt: "desc" }, skip, take: pageSize })]); ok(c.res, { page, pageSize, total, items: rows }); });
  route("GET", "/support/:id", "support.manage", async (c) => { const s = await prisma.supportCase.findUnique({ where: { id: c.params.id }, include: { events: { orderBy: { createdAt: "asc" } } } }); if (!s) throw notFound("Хүсэлт олдсонгүй."); ok(c.res, s); });
  route("POST", "/support/:id/events", "support.manage", async (c, p, fp, b) => { const body = clean(b.body, 2000); if (body.length < 2) throw badRequest("Тэмдэглэл хоосон байна."); const ev = await prisma.supportCaseEvent.create({ data: { caseId: c.params.id, adminId: p.adminId, kind: "NOTE", body } }); await aud(p, fp, "SUPPORT_NOTE", "SUPPORT", c.params.id); ok(c.res, ev); });
  route("POST", "/support/:id", "support.manage", async (c, p, fp, b) => {
    const data: any = {}; if (["OPEN", "IN_PROGRESS", "WAITING_CUSTOMER", "RESOLVED", "CLOSED"].includes(b.status)) data.status = b.status; if (["LOW", "NORMAL", "HIGH", "URGENT"].includes(b.priority)) data.priority = b.priority; if (b.assignToMe) data.assignedAdminId = p.adminId;
    const s = await prisma.supportCase.update({ where: { id: c.params.id }, data }); await prisma.supportCaseEvent.create({ data: { caseId: s.id, adminId: p.adminId, kind: data.status === "RESOLVED" ? "RESOLUTION" : "STATUS", body: clean(b.note ?? JSON.stringify(data), 1000) } }); await aud(p, fp, "SUPPORT_UPDATED", "SUPPORT", s.id); ok(c.res, s);
  });

  // ----- operations, audit, settings, admin accounts -----
  route("GET", "/ops", "ops.read", async (c) => {
    const [g, failed, published] = await Promise.all([prisma.reportReview.groupBy({ by: ["status"], _count: { _all: true } }), prisma.reportReview.count({ where: { status: "GENERATION_FAILED" } }), prisma.reportReview.findMany({ where: { status: "PUBLISHED", publishedAt: { not: null } }, orderBy: { publishedAt: "desc" }, take: 50, select: { submittedAt: true, publishedAt: true } })]);
    const hours = published.map(x => (x.publishedAt!.getTime() - x.submittedAt.getTime()) / 3_600_000); const avg = hours.length ? hours.reduce((a, b) => a + b, 0) / hours.length : null;
    let db = "ok"; try { await prisma.$queryRaw`select 1`; } catch { db = "down"; }
    ok(c.res, { database: db, queue: Object.fromEntries(g.map(x => [x.status, x._count._all])), generationFailed: failed, averageReviewHours: avg === null ? null : Math.round(avg * 10) / 10, sampleSize: hours.length, aiProvider: (process.env.MMRI_AI_REPORT_PROVIDER ?? "disabled").toLowerCase(), emailDelivery: config.mailProvider==="resend"?"RESEND_CONFIGURED_NOT_VERIFIED":config.mailProvider==="mock"?"MOCK_LOCAL_ONLY":"DISABLED" });
  });
  route("GET", "/audit", "audit.read", async (c) => { const { page, pageSize, skip } = pageOf(c.query); const where: any = c.query.get("action") ? { action: { contains: c.query.get("action") } } : {}; const [total, rows] = await Promise.all([prisma.adminAuditEvent.count({ where }), prisma.adminAuditEvent.findMany({ where, orderBy: { createdAt: "desc" }, skip, take: pageSize })]); ok(c.res, { page, pageSize, total, items: rows }); });
  route("GET", "/settings", "admins.manage", async (c) => {
    const admins = await prisma.adminAccount.findMany({ orderBy: { createdAt: "asc" } }); const users = await prisma.user.findMany({ where: { id: { in: admins.map(a => a.userId) } }, select: { id: true, email: true } }); const um = new Map(users.map(u => [u.id, u.email]));
    ok(c.res, { admins: admins.map(a => ({ id: a.id, email: um.get(a.userId), role: a.role, status: a.status, createdAt: a.createdAt })), reportReviewRequired: config.reportReviewRequired, reviewHours: REVIEW_HOURS, aiProvider: (process.env.MMRI_AI_REPORT_PROVIDER ?? "disabled").toLowerCase(), aiKeyConfigured: Boolean((process.env.OPENAI_API_KEY ?? "").trim()), emailDelivery: config.mailProvider==="resend"?"RESEND_CONFIGURED_NOT_VERIFIED":config.mailProvider==="mock"?"MOCK_LOCAL_ONLY":"DISABLED", adminProvisioning: "CLI only: npm run admin:bootstrap" });
  });
  route("POST", "/admins/:id/disable", "admins.manage", async (c, p, fp) => {
    const a = await admin.disableAdmin(c.params.id, p.adminId, { enforceNotSelf: true });
    await aud(p, fp, "ADMIN_DISABLED", "ADMIN", a.id); ok(c.res, { disabled: true });
  }, { sensitive: true, body: false });
  route("POST", "/admins/:id/role", "admins.manage", async (c, p, fp, b) => {
    if (!["SUPER_ADMIN", "REPORT_REVIEWER", "BILLING_REVIEWER"].includes(b.role)) throw badRequest("Эрхийн төрөл буруу байна.");
    const a = await admin.changeRole(c.params.id, b.role, p.adminId, { enforceNotSelf: true });
    await aud(p, fp, "ADMIN_ROLE_CHANGED", "ADMIN", a.id, { to: b.role }); ok(c.res, { role: b.role });
  }, { sensitive: true });
  registerAccountRoutes({ route, audit: (id, action, outcome, fp, target, meta) => admin.audit(id, action, outcome, fp as any, target, meta), pageOf, pilotGrant: config.pilotGrant });
  route("POST", "/maintenance/run", "admins.manage", async (c, p, fp) => { const out = await reviews.maintenance(); await aud(p, fp, "MAINTENANCE_RUN", "SYSTEM", "reviews", out); ok(c.res, out); }, { sensitive: true, body: false });
}
void json;
