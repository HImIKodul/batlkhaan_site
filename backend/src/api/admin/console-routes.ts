import { randomBytes } from "node:crypto";
import { prisma } from "../../db.js";
import type { ApiConfig } from "../config.js";
import { ApiError, badRequest, notFound } from "../errors.js";
import { hashPassword, validatePasswordPolicy } from "../auth/crypto.js";
import { buildXlsx, type XlsxSheet } from "../account/xlsx.js";
import type { RouteContext } from "../http/router.js";
import type { AdminPrincipal, AdminService, Permission } from "./admin-service.js";
import type { ReviewService } from "./review-service.js";
import { DOMAIN_CODES } from "./account-routes.js";

/* The two administration consoles (Sadmin: ADMIN SHIT / PAYMENTS / DATA; Admin: ХЯНАХ ТАЙЛАН / ДУУССАН ТАЙЛАН).
   Account roles shown to people are exactly Sadmin, Admin and User. Underneath, Sadmin = SUPER_ADMIN and Admin = every other administrator role.
   Every route is authorised on the server from the database role (the permission names below), never from anything the browser sends.
   Read models only reuse stored facts: payments are real billing invoices (an administrator grant has no invoice and can never appear here), answers are the stored
   question id + chosen option joined to the question bank at read time (question text is not copied per customer). Nothing here calls the paid AI service. */
type FP = { ip?: string; userAgent?: string };
type H = (ctx: RouteContext, p: AdminPrincipal, fp: FP, body: any) => Promise<void>;
export interface ConsoleDeps {
  route: (method: string, path: string, permission: Permission | null, handler: H, opts?: { sensitive?: boolean; body?: boolean }) => void;
  audit: (adminId: string, action: string, outcome: "SUCCESS" | "DENIED" | "FAILURE", fp: FP | null, target?: { type?: string; id?: string }, metadata?: Record<string, unknown>) => Promise<unknown>;
  config: ApiConfig; admin: AdminService; reviews: ReviewService;
  respond: (res: RouteContext["res"], data: unknown) => void;
}

export const DOMAIN_LABEL: Record<string, string> = { marketing: "МАРКЕТИНГ", it: "МЭДЭЭЛЛИЙН ТЕХНОЛОГИ", finance: "САНХҮҮ", people: "ХҮНИЙ НӨӨЦ", operations: "ҮЙЛДВЭРЛЭЛ БА ҮЙЛ АЖИЛЛАГАА" };
const TZ = "Asia/Ulaanbaatar";
const parts = (d: Date) => Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d).map(x => [x.type, x.value]));
/** 2026.11.27 in Ulaanbaatar time. */
export const dotDate = (d: Date) => { const p = parts(d); return `${p.year}.${p.month}.${p.day}`; };
const ROLE_OF = (admin: { role: string } | null | undefined) => (admin ? (admin.role === "SUPER_ADMIN" ? "Sadmin" : "Admin") : "User");
const EMAIL_RE = /^[^\s@]{1,64}@[A-Za-z0-9.-]{1,190}\.[A-Za-z]{2,}$/;

export function registerConsoleRoutes(d: ConsoleDeps) {
  const { route, audit, respond } = d; const C = "/console";

  /** The most recent COMPLETED sign-in only: a customer's last_login (set when a session is issued) or an administrator's audited ADMIN_LOGIN SUCCESS. Failed attempts, code requests and token refreshes never count. */
  const lastSuccessfulSignIn = async (userId: string, userLast: Date | null, adminId: string | null) => {
    const a = adminId ? await prisma.adminAuditEvent.findFirst({ where: { adminId, action: "ADMIN_LOGIN", outcome: "SUCCESS" }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }) : null;
    const c = [userLast, a?.createdAt ?? null].filter((x): x is Date => !!x); return c.length ? new Date(Math.max(...c.map(x => x.getTime()))) : null;
  };

  // ---------------- ADMIN SHIT: accounts ----------------
  route("GET", `${C}/accounts`, "accounts.manage", async (c) => {
    const q = (c.query.get("q") ?? "").trim().slice(0, 100);
    const where: any = { erasedAt: null, ...(q ? { OR: [{ email: { contains: q, mode: "insensitive" } }, { memberships: { some: { company: { name: { contains: q, mode: "insensitive" } } } } }] } : {}) };
    const rows = await prisma.user.findMany({ where, orderBy: { createdAt: "asc" }, take: 2000, select: { id: true, email: true, createdAt: true, adminAccount: { select: { role: true, status: true } } } });
    respond(c.res, { items: rows.filter(u => !(u.adminAccount?.status === "DISABLED")).map((u, i) => ({ n: i + 1, id: u.id, email: u.email, role: ROLE_OF(u.adminAccount) })) });
  });

  route("POST", `${C}/accounts`, "accounts.manage", async (c, p, fp, b) => {
    const email = String(b.email ?? "").trim().toLowerCase(); const role = String(b.role ?? "");
    if (!EMAIL_RE.test(email)) throw badRequest("Зөв имэйл хаяг оруулна уу.");
    if (!["User", "Admin", "Sadmin"].includes(role)) throw badRequest("Эрх буруу байна.");
    try { validatePasswordPolicy(String(b.password ?? "")); } catch { throw badRequest("Нууц үг 10-аас 128 тэмдэгт байх ёстой."); }
    if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) throw new ApiError(409, "EMAIL_EXISTS", "Энэ имэйлээр бүртгэл аль хэдийн байна.");
    const passwordHash = await hashPassword(String(b.password), d.config.passwordPepper);
    // NOT verified: the first sign-in sends a code to this address and nothing protected opens until it is entered.
    const user = await prisma.$transaction(async tx => {
      const u = await tx.user.create({ data: { email, passwordHash, emailVerificationRequired: true } });
      if (role !== "User") await tx.adminAccount.create({ data: { userId: u.id, role: role === "Sadmin" ? "SUPER_ADMIN" : "REPORT_REVIEWER", createdByAdminId: p.adminId } });
      return u;
    });
    await audit(p.adminId, "CONSOLE_ACCOUNT_CREATED", "SUCCESS", fp, { type: "USER", id: user.id }, { role });
    respond(c.res, { id: user.id, email, role });
  }, { sensitive: true });

  route("GET", `${C}/accounts/:id`, "accounts.manage", async (c) => {
    const u = await prisma.user.findUnique({ where: { id: c.params.id }, select: { id: true, email: true, createdAt: true, erasedAt: true, lastLoginAt: true, adminAccount: { select: { id: true, role: true } },
      memberships: { select: { companyId: true, role: true, company: { select: { id: true, name: true, erasedAt: true } } } } } });
    if (!u || u.erasedAt) throw notFound("Бүртгэл олдсонгүй.");
    const role = ROLE_OF(u.adminAccount);
    let companies: any[] = [];
    if (role === "User") {
      const own = u.memberships.filter(m => !m.company.erasedAt);
      const ents = own.length ? await prisma.companyEntitlement.findMany({ where: { companyId: { in: own.map(m => m.companyId) } }, orderBy: { createdAt: "desc" }, select: { id: true, companyId: true, domainCode: true, status: true } }) : [];
      // Access = an unused (ACTIVE) entitlement, or a used one whose diagnosis is still unfinished. A completed diagnosis has consumed its entitlement: that is NOT access (a retake needs a new grant or payment).
      const running = ents.length ? new Set((await prisma.assessment.findMany({ where: { entitlementId: { in: ents.map(e => e.id) }, status: { in: ["PROFILE_PENDING", "IN_PROGRESS", "PAUSED", "READY_FOR_COMPLETION", "PROCESSING"] as any } }, select: { entitlementId: true } })).map(a => a.entitlementId)) : new Set<string | null>();
      const waiting = own.length ? await prisma.billingInvoice.findMany({ where: { companyId: { in: own.map(m => m.companyId) }, status: { in: ["CREATED", "PENDING"] } }, select: { companyId: true, domainCode: true } }) : [];
      companies = own.map(m => ({ id: m.company.id, name: m.company.name, domains: DOMAIN_CODES.map(code => {
        const held = ents.find(e => e.companyId === m.companyId && e.domainCode === code && (e.status === "ACTIVE" || (e.status === "CONSUMED" && running.has(e.id))));
        return { code, label: DOMAIN_LABEL[code], access: !!held, entitlementId: held?.id ?? null, waitingInvoice: waiting.some(w => w.companyId === m.companyId && w.domainCode === code) };
      }) }));
    }
    respond(c.res, { id: u.id, email: u.email, role, createdAt: u.createdAt, lastLoginAt: await lastSuccessfulSignIn(u.id, u.lastLoginAt, u.adminAccount?.id ?? null), companies });
  });

  route("POST", `${C}/accounts/:id/password`, "accounts.manage", async (c, p, fp, b) => {
    try { validatePasswordPolicy(String(b.password ?? "")); } catch { throw badRequest("Нууц үг 10-аас 128 тэмдэгт байх ёстой."); }
    const passwordHash = await hashPassword(String(b.password), d.config.passwordPepper);
    await prisma.$transaction(async tx => {
      const u = await tx.user.findUnique({ where: { id: c.params.id }, select: { id: true, erasedAt: true, adminAccount: { select: { id: true } } } });
      if (!u || u.erasedAt) throw notFound("Бүртгэл олдсонгүй.");
      await tx.user.update({ where: { id: u.id }, data: { passwordHash, tokenVersion: { increment: 1 } } });
      await tx.refreshSession.updateMany({ where: { userId: u.id, revokedAt: null }, data: { revokedAt: new Date() } });
      await tx.trustedDevice.updateMany({ where: { userId: u.id, revokedAt: null }, data: { revokedAt: new Date() } });
      if (u.adminAccount) await tx.adminSession.updateMany({ where: { adminId: u.adminAccount.id, revokedAt: null }, data: { revokedAt: new Date() } });
    });
    await audit(p.adminId, "CONSOLE_PASSWORD_CHANGED", "SUCCESS", fp, { type: "USER", id: c.params.id });
    respond(c.res, { changed: true });
  }, { sensitive: true });

  /** "Бүх төхөөрөмжөөс гаргах": ends every session and every trusted device of ONE account (any role). Password, permissions, access and data are untouched; the next sign-in needs e-mail + password + e-mail code. */
  route("POST", `${C}/accounts/:id/revoke-sessions`, "accounts.manage", async (c, p, fp) => {
    const out = await prisma.$transaction(async tx => {
      const u = await tx.user.findUnique({ where: { id: c.params.id }, select: { id: true, erasedAt: true, adminAccount: { select: { id: true } } } });
      if (!u || u.erasedAt) throw notFound("Бүртгэл олдсонгүй.");
      const now = new Date();
      const r = await tx.refreshSession.updateMany({ where: { userId: u.id, revokedAt: null }, data: { revokedAt: now } });
      const t = await tx.trustedDevice.updateMany({ where: { userId: u.id, revokedAt: null }, data: { revokedAt: now } });
      const a = u.adminAccount ? await tx.adminSession.updateMany({ where: { adminId: u.adminAccount.id, revokedAt: null }, data: { revokedAt: now } }) : { count: 0 };
      await tx.user.update({ where: { id: u.id }, data: { tokenVersion: { increment: 1 } } });   // access tokens already issued stop working
      return { sessions: r.count + a.count, devices: t.count, self: u.id === p.userId };
    });
    await audit(p.adminId, "CONSOLE_SESSIONS_REVOKED", "SUCCESS", fp, { type: "USER", id: c.params.id }, { sessions: out.sessions, devices: out.devices });
    respond(c.res, out);
  }, { sensitive: true, body: false });

  route("POST", `${C}/accounts/:id/delete`, "accounts.manage", async (c, p, fp, b) => {
    const u = await prisma.user.findUnique({ where: { id: c.params.id }, select: { id: true, email: true, erasedAt: true, adminAccount: { select: { id: true, role: true } } } });
    if (!u || u.erasedAt) throw notFound("Бүртгэл олдсонгүй.");
    if (String(b.confirmEmail ?? "").trim().toLowerCase() !== u.email) throw new ApiError(400, "CONFIRMATION_MISMATCH", "Баталгаажуулах имэйл таарахгүй байна.");
    if (u.id === p.userId) throw new ApiError(409, "SELF", "Өөрийн бүртгэлийг энд устгах боломжгүй.");
    // Safeguard against losing all administrative access: the existing atomic guard refuses to remove the last active Sadmin.
    if (u.adminAccount) await d.admin.disableAdmin(u.adminAccount.id, p.adminId);
    const passwordHash = await hashPassword(randomBytes(24).toString("base64url"), d.config.passwordPepper);
    await prisma.$transaction(async tx => {
      await tx.user.update({ where: { id: u.id }, data: { email: `erased+${u.id}@erased.invalid`, displayName: null, passwordHash, status: "DISABLED", tokenVersion: { increment: 1 }, erasedAt: new Date() } });
      await tx.refreshSession.updateMany({ where: { userId: u.id, revokedAt: null }, data: { revokedAt: new Date() } });
      await tx.trustedDevice.updateMany({ where: { userId: u.id, revokedAt: null }, data: { revokedAt: new Date() } });
      await tx.passwordResetToken.deleteMany({ where: { userId: u.id } });
    });
    // Payments, invoices, answers, reports and company records are NOT touched: only the person's sign-in identity is removed.
    await audit(p.adminId, "CONSOLE_ACCOUNT_DELETED", "SUCCESS", fp, { type: "USER", id: u.id }, { role: ROLE_OF(u.adminAccount) });
    respond(c.res, { deleted: true });
  }, { sensitive: true });

  // ---------------- PAYMENTS ----------------
  const PAY_MN: Record<string, string> = { PAID: "Төлөгдсөн", PENDING: "Хүлээгдэж байна", CREATED: "Үүсгэсэн", FAILED: "Амжилтгүй", CANCELLED: "Цуцлагдсан", REFUNDED: "Буцаагдсан" };
  const PLAN_MN: Record<string, string> = { DIAGNOSTIC: "Анхны оношилгоо", RETAKE: "Дахин оношилгоо" };
  const lower = (v: string) => v.toLocaleLowerCase("mn-MN");
  const ubDay = (d: string, end = false) => { const t = new Date(`${d}T00:00:00+08:00`); return Number.isNaN(t.getTime()) ? null : new Date(t.getTime() + (end ? 86_400_000 : 0)); };
  /** ONE filtered read model for the table AND the Excel export, so the file always matches what the screen shows. Filters: q (company name), domain, status, from/to (Ulaanbaatar days, inclusive). */
  const paymentRows = async (qs: URLSearchParams) => {
    const domain = qs.get("domain") ?? "", status = qs.get("status") ?? "", q = lower((qs.get("q") ?? "").trim().slice(0, 100));
    if (domain && !(DOMAIN_CODES as readonly string[]).includes(domain)) throw badRequest("Чиглэл буруу байна.");
    if (status && !(status in PAY_MN)) throw badRequest("Төлөв буруу байна.");
    const from = qs.get("from") ? ubDay(String(qs.get("from"))) : null, to = qs.get("to") ? ubDay(String(qs.get("to")), true) : null;
    const rows = await prisma.billingInvoice.findMany({ where: { ...(domain ? { domainCode: domain } : {}), ...(status ? { status: status as any } : {}) }, orderBy: { createdAt: "desc" }, take: 3000,
      select: { id: true, senderInvoiceNo: true, domainCode: true, planCode: true, amountMnt: true, status: true, paidAt: true, createdAt: true, providerPaymentId: true, refundedAt: true, refundReference: true, refundReason: true, failureReason: true,
        company: { select: { name: true, erasedAt: true, memberships: { where: { role: "OWNER" }, take: 1, select: { user: { select: { email: true, erasedAt: true } } } } } }, paymentTransactions: { orderBy: { createdAt: "asc" }, take: 1, select: { transactionId: true } } } });
    return rows.map(r => ({ ...r, companyName: r.company.erasedAt ? "Устгасан байгууллага" : r.company.name, companyEmail: r.company.memberships[0] && !r.company.memberships[0].user.erasedAt ? r.company.memberships[0].user.email : "", date: r.paidAt ?? r.createdAt }))
      .filter(r => (!q || lower(r.companyName).includes(q)) && (!from || r.date >= from) && (!to || r.date < to));
  };
  route("GET", `${C}/payments`, "payments.read", async (c) => {
    const rows = await paymentRows(c.query);
    respond(c.res, { items: rows.map((r, i) => ({ n: i + 1, id: r.id, company: r.companyName, domain: r.domainCode, domainLabel: DOMAIN_LABEL[r.domainCode] ?? r.domainCode, status: r.status, date: r.date })) });
  });
  /** Excel formula-injection guard for text a customer could have typed (company names, e-mails, references): a leading = + - @ or control character is neutralised with an apostrophe. */
  const safe = (v: unknown) => { const t = String(v ?? ""); return /^[=+\-@\t\r]/.test(t) ? `'${t}` : t; };
  const ub = (d: Date | null | undefined) => (d ? new Date(d.getTime() + 8 * 3_600_000) : null);   // spreadsheet dates carry no zone: shift to Ulaanbaatar wall-clock time
  route("GET", `${C}/payments/export.xlsx`, "payments.read", async (c, p, fp) => {
    const rows = await paymentRows(c.query);
    const book = buildXlsx([{ name: "Төлбөр", columns: [{ header: "№", width: 6 }, { header: "Компани", width: 34 }, { header: "Компанийн имэйл", width: 32 }, { header: "Оношилгооны чиглэл", width: 30 }, { header: "Төрөл", width: 18 }, { header: "Дүн (₮)", width: 12 }, { header: "Төлөв", width: 18 },
      { header: "Нэхэмжлэлийн дугаар", width: 30 }, { header: "Гүйлгээний дугаар", width: 30 }, { header: "Үүсгэсэн огноо", width: 18 }, { header: "Төлсөн огноо", width: 18 }, { header: "Тайлбар", width: 40 }],
      rows: rows.map((r, i) => [i + 1, safe(r.companyName), safe(r.companyEmail), DOMAIN_LABEL[r.domainCode] ?? r.domainCode, PLAN_MN[r.planCode] ?? r.planCode, r.amountMnt, PAY_MN[r.status] ?? r.status, safe(r.senderInvoiceNo), safe(r.paymentTransactions[0]?.transactionId ?? r.providerPaymentId ?? ""), ub(r.createdAt), ub(r.paidAt),
        safe(r.status === "REFUNDED" ? `Буцаалт: ${r.refundReason ?? ""}` : r.status === "FAILED" ? r.failureReason ?? "" : "")]) }]);
    await audit(p.adminId, "CONSOLE_PAYMENTS_EXPORTED", "SUCCESS", fp, { type: "PAYMENTS", id: "export" }, { rows: rows.length });
    c.res.writeHead(200, { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "content-length": book.length, "content-disposition": "attachment; filename=\"businessmri-payments.xlsx\"", "cache-control": "no-store" });
    c.res.end(book);
  }, { body: false });
  route("GET", `${C}/payments/:id`, "payments.read", async (c) => {
    const r = (await paymentRows(new URLSearchParams())).find(x => x.id === c.params.id);
    if (!r) throw notFound("Төлбөр олдсонгүй.");
    respond(c.res, { id: r.id, company: r.companyName, companyEmail: r.companyEmail, domain: r.domainCode, domainLabel: DOMAIN_LABEL[r.domainCode] ?? r.domainCode, plan: PLAN_MN[r.planCode] ?? r.planCode, amountMnt: r.amountMnt, status: r.status,
      invoiceNo: r.senderInvoiceNo, transactionRef: r.paymentTransactions[0]?.transactionId ?? r.providerPaymentId ?? null, createdAt: r.createdAt, paidAt: r.paidAt,
      cancelled: r.status === "CANCELLED", refund: r.status === "REFUNDED" || r.refundedAt ? { at: r.refundedAt, reference: r.refundReference, reason: r.refundReason } : null, failureReason: r.status === "FAILED" ? r.failureReason : null });
  });

  // ---------------- DATA ----------------
  route("GET", `${C}/businesses`, "companies.read", async (c) => {
    const rows = await prisma.company.findMany({ where: { erasedAt: null }, orderBy: { createdAt: "asc" }, take: 3000, select: { id: true, name: true, memberships: { where: { role: "OWNER" }, orderBy: { createdAt: "asc" }, take: 1, select: { user: { select: { email: true, erasedAt: true } } } } } });
    respond(c.res, { items: rows.map((r, i) => ({ n: i + 1, id: r.id, name: r.name, email: r.memberships[0] && !r.memberships[0].user.erasedAt ? r.memberships[0].user.email : "" })) });
  });

  const businessData = async (id: string) => {
    const co = await prisma.company.findUnique({ where: { id }, select: { id: true, name: true, industry: true, businessModel: true, employeeCount: true, companyAgeYears: true, marketType: true, country: true, createdAt: true, erasedAt: true,
      memberships: { where: { role: "OWNER" }, take: 1, select: { user: { select: { email: true, erasedAt: true } } } } } });
    if (!co || co.erasedAt) throw notFound("Байгууллага олдсонгүй.");
    const assessments = await prisma.assessment.findMany({ where: { companyId: id }, orderBy: { createdAt: "asc" }, select: { id: true, domainCode: true, status: true, createdAt: true, startedAt: true, completedAt: true, entitlement: { select: { origin: true } } } });
    const diagnoses = [];
    for (const a of assessments) {
      const answers = await prisma.answer.findMany({ where: { assessmentId: a.id, active: true }, orderBy: { createdAt: "asc" }, select: { optionIndex: true, rawValue: true, status: true, createdAt: true, question: { select: { textMn: true, externalId: true, options: { select: { optionIndex: true, labelMn: true } } } } } });
      if (!answers.length && !["COMPLETED", "COMPLETED_WITH_REVIEW"].includes(a.status)) continue;   // nothing saved yet: no empty record
      const when = a.completedAt ?? a.startedAt ?? a.createdAt;
      diagnoses.push({ id: a.id, domain: a.domainCode, label: `${DOMAIN_LABEL[a.domainCode] ?? a.domainCode} (${dotDate(when)})`, origin: a.entitlement?.origin === "ADMIN_GRANT" ? "Эрх олгосон" : "Худалдан авсан",
        answers: answers.map((x, i) => ({ n: i + 1, question: x.question.textMn, answer: x.optionIndex != null ? (x.question.options.find(o => o.optionIndex === x.optionIndex)?.labelMn ?? `№${x.optionIndex}`) : x.status === "DNK" ? "Мэдэхгүй" : x.status === "N_A_CLAIM" ? "Хамааралгүй" : x.status === "UNAVAILABLE" ? "Мэдээлэл байхгүй" : typeof x.rawValue === "string" ? x.rawValue : "", date: x.createdAt })) });
    }
    const email = co.memberships[0] && !co.memberships[0].user.erasedAt ? co.memberships[0].user.email : "";
    return { company: { id: co.id, name: co.name, email, industry: co.industry, businessModel: co.businessModel, employeeCount: co.employeeCount, companyAgeYears: co.companyAgeYears == null ? null : Number(co.companyAgeYears), marketType: co.marketType, country: co.country, createdAt: co.createdAt }, diagnoses };
  };
  route("GET", `${C}/businesses/:id`, "companies.read", async (c) => { respond(c.res, await businessData(c.params.id)); });
  route("GET", `${C}/businesses/:id/export.xlsx`, "companies.read", async (c, p, fp) => {
    const data = await businessData(c.params.id);
    const co = data.company; const sheets: XlsxSheet[] = [{ name: "Компанийн мэдээлэл", columns: [{ header: "Талбар", width: 30 }, { header: "Утга", width: 50 }], rows: [
      ["Байгууллагын нэр", co.name], ["Имэйл", co.email], ["Салбар", co.industry ?? ""], ["Бизнесийн загвар", co.businessModel ?? ""], ["Ажилтны тоо", co.employeeCount], ["Үйл ажиллагааны нас (жил)", co.companyAgeYears], ["Зах зээл", co.marketType ?? ""], ["Улс", co.country ?? ""], ["Бүртгэсэн огноо", co.createdAt]] }];
    for (const g of data.diagnoses) sheets.push({ name: g.label.replace(/[()]/g, ""), columns: [{ header: "№", width: 6 }, { header: "Асуулт", width: 70 }, { header: "Хариулт", width: 50 }, { header: "Огноо", width: 18 }], rows: g.answers.map(a => [a.n, a.question, a.answer, a.date]) });
    const book = buildXlsx(sheets);
    await audit(p.adminId, "CONSOLE_BUSINESS_EXPORTED", "SUCCESS", fp, { type: "COMPANY", id: co.id });
    c.res.writeHead(200, { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "content-length": book.length, "content-disposition": "attachment; filename=\"businessmri-business.xlsx\"", "cache-control": "no-store" });
    c.res.end(book);
  }, { body: false });

  route("GET", `${C}/businesses/:id/diagnoses/:aid/export.xlsx`, "companies.read", async (c, p, fp) => {
    const a = await prisma.assessment.findFirst({ where: { id: c.params.aid, companyId: c.params.id }, select: { id: true, domainCode: true, status: true, mode: true, createdAt: true, startedAt: true, completedAt: true, previousAssessmentId: true, methodologyVersion: { select: { version: true } },
      company: { select: { name: true, industry: true, businessModel: true, employeeCount: true, companyAgeYears: true, marketType: true, country: true, erasedAt: true, memberships: { where: { role: "OWNER" }, take: 1, select: { user: { select: { email: true, erasedAt: true } } } } } } } });
    if (!a || a.company.erasedAt) throw notFound("Оношилгоо олдсонгүй.");   // an assessment of ANOTHER company can never be exported through this company's URL
    const answers = await prisma.answer.findMany({ where: { assessmentId: a.id, active: true }, orderBy: { createdAt: "asc" }, select: { optionIndex: true, rawValue: true, status: true, createdAt: true, question: { select: { textMn: true, options: { select: { optionIndex: true, labelMn: true } } } } } });
    const prior = await prisma.assessment.count({ where: { companyId: c.params.id, domainCode: a.domainCode, createdAt: { lt: a.createdAt }, status: { in: ["COMPLETED", "COMPLETED_WITH_REVIEW", "EXHAUSTED"] as any } } });
    const when = a.completedAt ?? a.startedAt ?? a.createdAt; const co = a.company; const owner = co.memberships[0] && !co.memberships[0].user.erasedAt ? co.memberships[0].user.email : "";
    const ST: Record<string, string> = { COMPLETED: "Дууссан", COMPLETED_WITH_REVIEW: "Дууссан", IN_PROGRESS: "Явагдаж байна", PAUSED: "Түр зогссон", PROFILE_PENDING: "Эхлээгүй", EXHAUSTED: "Асуулт дууссан", CANCELLED: "Цуцлагдсан" };
    const label = `${DOMAIN_LABEL[a.domainCode] ?? a.domainCode} (${dotDate(when)})`;
    const book = buildXlsx([
      { name: "Оношилгоо", columns: [{ header: "Талбар", width: 30 }, { header: "Утга", width: 56 }], rows: [["Байгууллага", safe(co.name)], ["Имэйл", safe(owner)], ["Салбар", co.industry ?? ""], ["Бизнесийн загвар", co.businessModel ?? ""], ["Ажилтны тоо", co.employeeCount], ["Зах зээл", co.marketType ?? ""], ["Улс", co.country ?? ""],
        ["Оношилгооны чиглэл", DOMAIN_LABEL[a.domainCode] ?? a.domainCode], ["Оношилгооны огноо", ub(when)], ["Төрөл", prior > 0 ? `Дахин оношилгоо (${prior + 1}-р)` : "Анхны оношилгоо"], ["Төлөв", ST[a.status] ?? a.status], ["Асуултын сангийн хувилбар", a.methodologyVersion.version], ["Хариулсан асуултын тоо", answers.length]] },
      { name: "Хариултууд", columns: [{ header: "№", width: 6 }, { header: "Асуулт", width: 80 }, { header: "Сонгосон хариултын дугаар", width: 16 }, { header: "Хариулт", width: 56 }, { header: "Огноо", width: 18 }],
        rows: answers.map((x, i) => [i + 1, x.question.textMn, x.optionIndex, x.optionIndex != null ? (x.question.options.find(o => o.optionIndex === x.optionIndex)?.labelMn ?? "") : x.status === "DNK" ? "Мэдэхгүй" : x.status === "N_A_CLAIM" ? "Хамааралгүй" : x.status === "UNAVAILABLE" ? "Мэдээлэл байхгүй" : typeof x.rawValue === "string" ? x.rawValue : "", ub(x.createdAt)]) }]);
    await audit(p.adminId, "CONSOLE_DIAGNOSIS_EXPORTED", "SUCCESS", fp, { type: "ASSESSMENT", id: a.id }, { label });
    c.res.writeHead(200, { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "content-length": book.length, "content-disposition": "attachment; filename=\"businessmri-diagnosis.xlsx\"", "cache-control": "no-store" });
    c.res.end(book);
  }, { body: false });

  // ---------------- Admin: ХЯНАХ ТАЙЛАН / ДУУССАН ТАЙЛАН ----------------
  const reviewRows = async (statuses: string[], order: "deadline" | "published") => {
    const rows = await prisma.reportReview.findMany({ where: { status: { in: statuses } }, orderBy: order === "deadline" ? { deadlineAt: "asc" } : { publishedAt: "desc" }, take: 2000 });
    const cs = await prisma.company.findMany({ where: { id: { in: [...new Set(rows.map(r => r.companyId))] } }, select: { id: true, name: true } }); const nm = new Map(cs.map(x => [x.id, x.name]));
    return rows.map((r, i) => ({ n: i + 1, id: r.id, company: nm.get(r.companyId) ?? "", domain: r.domainCode, domainLabel: DOMAIN_LABEL[r.domainCode] ?? r.domainCode, submittedAt: r.submittedAt, deadlineAt: r.deadlineAt, publishedAt: r.publishedAt, ready: !["SUBMITTED", "GENERATING_DRAFT", "GENERATION_FAILED"].includes(r.status) }));
  };
  route("GET", `${C}/review-queue`, "reports.read", async (c) => { respond(c.res, { now: new Date(), items: await reviewRows(["AWAITING_REVIEW", "IN_REVIEW", "READY_FOR_APPROVAL", "APPROVED", "PUBLISHING", "SUBMITTED", "GENERATING_DRAFT", "GENERATION_FAILED"], "deadline") }); });
  route("GET", `${C}/done-reports`, "reports.read", async (c) => { respond(c.res, { items: await reviewRows(["PUBLISHED"], "published") }); });
  route("GET", `${C}/report-counts`, "reports.read", async (c) => {   // the section totals shown beside the two Admin section names (never affected by search or filters)
    const [review, done] = await Promise.all([prisma.reportReview.count({ where: { status: { in: ["AWAITING_REVIEW", "IN_REVIEW", "READY_FOR_APPROVAL", "APPROVED", "PUBLISHING", "SUBMITTED", "GENERATING_DRAFT", "GENERATION_FAILED"] } } }), prisma.reportReview.count({ where: { status: "PUBLISHED" } })]);
    respond(c.res, { review, done });
  });
  route("POST", `${C}/reviews/:id/recall`, "reports.publish", async (c, p, fp) => {
    await d.reviews.recall(c.params.id);
    await audit(p.adminId, "REPORT_RECALLED", "SUCCESS", fp, { type: "REVIEW", id: c.params.id });
    respond(c.res, { status: "IN_REVIEW" });
  }, { body: false });
}
