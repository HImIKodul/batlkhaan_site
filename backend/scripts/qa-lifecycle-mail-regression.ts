/* Lifecycle e-mail dispatcher regression. Talks to an ISOLATED database through Prisma and uses a recording fake mailer: nothing is ever sent to a real address.
   Run with: DOTENV_CONFIG_PATH=/dev/null DATABASE_URL=<isolated QA db url> tsx scripts/qa-lifecycle-mail-regression.ts   (refuses `mmri` and any non-QA database name) */
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { prisma } from "../src/db.js";
import { LifecycleMailService, MAX_ATTEMPTS, buildCustomerMail, adminAlertRecipients } from "../src/api/mail/lifecycle-mail.js";
import { createMailer, recipientAllowed } from "../src/api/mail/mailer.js";
import type { Mailer, MailMessage, MailResult } from "../src/api/mail/mailer.js";

const dbName = String((await prisma.$queryRaw<{ n: string }[]>`select current_database() as n`)[0].n);
if (dbName === "mmri" || !/^mmri_.*(qa|test|ws_)/.test(dbName)) throw new Error(`refusing to run against database ${dbName}`);
let pass = 0, fail = 0; const rec = (n: string, ok: boolean, d = "") => { ok ? pass++ : fail++; console.log((ok ? "PASS " : "FAIL ") + n + (d ? " | " + d : "")); };
const tag = "lm" + crypto.randomBytes(4).toString("hex");

class FakeMailer implements Mailer {
  readonly provider: "mock" | "disabled" = "mock"; sent: MailMessage[] = []; failFor = new Set<string>(); failAll = 0;
  async send(m: MailMessage): Promise<MailResult> {
    if (this.failAll > 0) { this.failAll--; throw new Error("boom " + m.to); }
    if (this.failFor.has(m.to)) throw new Error("boom " + m.to);
    this.sent.push(m); return { delivered: true, provider: "mock" };
  }
}
const mailer = new FakeMailer(); const svc = new LifecycleMailService({ publicAppUrl: "https://app.example.test" } as any, mailer);
const env = (k: string, v: string | undefined) => { if (v === undefined) delete process.env[k]; else process.env[k] = v; };
const createdIds: string[] = [];
const marks = () => prisma.mailDispatchMark.findMany({ where: { OR: [{ dedupeKey: { contains: tag } }, { dedupeKey: { in: createdIds.map(i => `CN:${i}`) } }] } });
const pastDue = (key: string) => prisma.mailDispatchMark.update({ where: { dedupeKey: key }, data: { nextAttemptAt: new Date(Date.now() - 1000) } });

// ---------------------------------------------------------------- fixtures (all synthetic, removed at the end)
const mkUser = (label: string, extra: any = {}) => prisma.user.create({ data: { email: `${tag}.${label}@mmri.test`, passwordHash: "x", displayName: label, emailVerifiedAt: new Date(), ...extra } });
const owner = await mkUser("owner"), viewer = await mkUser("viewer"), gone = await mkUser("gone", { status: "DISABLED" }), erased = await mkUser("erased", { erasedAt: new Date() });
const company = await prisma.company.create({ data: { name: `<b>Evil</b>\r\nBcc: attacker@x.test ${tag}` } });
const company2 = await prisma.company.create({ data: { name: "Erased shell", erasedAt: new Date() } });
for (const u of [owner, viewer, gone, erased]) await prisma.companyMembership.create({ data: { companyId: company.id, userId: u.id, role: u === owner ? "OWNER" : "VIEWER" } });
let seq = 0;
const note = async (userId: string, type: string, extra: any = {}) => { const r = await prisma.customerNotification.create({ data: { userId, companyId: company.id, type, title: "t", message: "m", destination: "report", payload: { domainCode: "finance" }, dedupeKey: `${tag}:${type}:${seq++}`, ...extra } }); createdIds.push(r.id); return r; };
const nOwner = { completed: await note(owner.id, "ASSESSMENT_COMPLETED"), review: await note(owner.id, "REPORT_UNDER_REVIEW"), released: await note(owner.id, "REPORT_RELEASED") };
/* payment confirmation is e-mailed since 2026-11-24 (owner request) */ await note(owner.id, "PAYMENT_CONFIRMED"); await note(owner.id, "REPORT_APPROVED"); await note(owner.id, "ACCOUNT_PASSWORD_CHANGED"); // the last two are never e-mailed by this service
const nOld = await note(owner.id, "REPORT_RELEASED", { createdAt: new Date(Date.now() - 60 * 3_600_000) }); // outside the 48 h window
await note(gone.id, "REPORT_RELEASED"); await note(erased.id, "REPORT_RELEASED"); // inactive / erased recipients
const nErasedCompany = await prisma.customerNotification.create({ data: { userId: viewer.id, companyId: company2.id, type: "REPORT_RELEASED", title: "t", message: "m", destination: "report", payload: { domainCode: "it" }, dedupeKey: `${tag}:ec` } }); createdIds.push(nErasedCompany.id);
await prisma.companyMembership.create({ data: { companyId: company2.id, userId: viewer.id, role: "VIEWER" } }).catch(() => undefined);
const mine = () => mailer.sent.filter(m => m.to.includes(tag));

// ---------------------------------------------------------------- ML-01/02 default off, disabled provider
env("MMRI_CUSTOMER_EMAILS", undefined); env("MMRI_ADMIN_ALERT_EMAILS", undefined);
const off = await svc.dispatchPending();
rec("ML-01 with the flags unset nothing is sent and no claim is created", off.skipped !== null && mine().length === 0 && (await marks()).length === 0, off.skipped ?? "");
env("MMRI_CUSTOMER_EMAILS", "on");
const dis = new LifecycleMailService({ publicAppUrl: "https://app.example.test" } as any, Object.assign(new FakeMailer(), { provider: "disabled" as const }));
const disRes = await dis.dispatchPending();
rec("ML-02 a disabled mail provider sends nothing and creates no claims (callers never claim delivery)", disRes.skipped === "mail provider disabled" && (await marks()).length === 0);

// ---------------------------------------------------------------- ML-03/04/05 exactly once
const first = await svc.dispatchPending();
const kinds = mine().filter(m => m.to === owner.email).map(m => m.kind).sort();
rec("ML-03 only the four lifecycle types (incl. payment) are e-mailed, to the right eligible recipients, once each (the pass also sent other recent notifications present in this QA database)", kinds.join() === "ASSESSMENT_COMPLETED,PAYMENT_CONFIRMED,REPORT_RELEASED,REPORT_UNDER_REVIEW" && !mine().some(m => [gone.email, erased.email].includes(m.to)), `${first.customer} total sent this pass; own: ${kinds.join()}`);
rec("ML-04 outside the 48 h window, to inactive / erased users, and for an erased company: no e-mail", !(await marks()).some(m => m.dedupeKey === `CN:${nOld.id}` || m.dedupeKey === `CN:${nErasedCompany.id}`) && mine().length === 4);
const again = await svc.dispatchPending();
rec("ML-05 a second pass sends nothing (exactly once)", again.customer === 0 && mine().length === 4);
const row = (await marks()).find(m => m.dedupeKey === `CN:${nOwner.completed.id}`)!;
rec("ML-06 the claim records the time the provider accepted the message", Boolean(row.sentAt) && row.attempts === 0 && row.lastError === null);

// ---------------------------------------------------------------- ML-07 concurrency
const late = await note(viewer.id, "REPORT_RELEASED");
const racers = await Promise.all([1, 2, 3, 4, 5].map(() => svc.dispatchPending()));
rec("ML-08 five dispatchers racing on the same pending message send it exactly once", mine().filter(m => m.to === viewer.email).length === 1 && racers.reduce((s, r) => s + r.customer, 0) === 1, `sent ${racers.map(r => r.customer).join("/")}`);

// ---------------------------------------------------------------- ML-09 failure, back-off, retry, exhaustion
const flaky = await note(viewer.id, "ASSESSMENT_COMPLETED"); const key = `CN:${flaky.id}`;
mailer.failAll = 1; const f1 = await svc.dispatchPending(); const m1 = (await marks()).find(m => m.dedupeKey === key)!;
rec("ML-09 a provider failure leaves the message unsent, counts the attempt, stores only a fixed error text (no address, no body) and backs off", f1.failed === 1 && !m1.sentAt && m1.attempts === 1 && m1.lastError === "mail provider request failed" && m1.nextAttemptAt.getTime() > Date.now() + 5 * 60_000);
const backoff = await svc.dispatchPending();
rec("ML-10 within the back-off window it is not retried", backoff.customer === 0 && backoff.failed === 0);
await pastDue(key); const retry = await svc.dispatchPending();
rec("ML-11 once due it is retried and sent exactly once", retry.customer === 1 && (await marks()).find(m => m.dedupeKey === key)!.sentAt !== null);
const doomed = await note(viewer.id, "REPORT_UNDER_REVIEW"); const dkey = `CN:${doomed.id}`;
for (let i = 0; i < MAX_ATTEMPTS + 2; i++) { mailer.failAll = 1; await svc.dispatchPending(); const mk = (await marks()).find(m => m.dedupeKey === dkey); if (mk) await pastDue(dkey); }
const mkDoomed = (await marks()).find(m => m.dedupeKey === dkey)!; const before = mine().length; await svc.dispatchPending();
rec(`ML-12 after ${MAX_ATTEMPTS} failed attempts the message is abandoned (never an endless retry loop)`, mkDoomed.attempts === MAX_ATTEMPTS && !mkDoomed.sentAt && mine().length === before, `attempts ${mkDoomed.attempts}`);

// ---------------------------------------------------------------- ML-13 template safety
const mail = mine().find(m => m.kind === "REPORT_RELEASED" && m.to === owner.email)!;
rec("ML-13 the company name cannot inject headers or lines (single line), the subject carries no customer data, links use the configured public URL", !/Bcc:/.test(mail.subject) && !/[\r\n]Bcc:/.test(mail.text) && !mail.subject.includes(tag) && mail.text.includes("https://app.example.test/#/report") && mail.subject === "BusinessMRI.mn: тайлан бэлэн боллоо");
const injected = buildCustomerMail("REPORT_RELEASED", { company: "A\r\nSubject: spoof\u0000", domainLabel: "Санхүү", appUrl: "https://x.test//" })!;
rec("ML-14 control characters are stripped from interpolated values and the base URL has no double slash", !/[\r\u0000]/.test(injected.text.split("Тайланг үзэх")[0]) && injected.text.includes("https://x.test/#/report") && buildCustomerMail("REPORT_APPROVED", { company: "c", domainLabel: "d", appUrl: "https://x.test" }) === null);

// ---------------------------------------------------------------- ML-15/16 administrator alerts
env("MMRI_ADMIN_ALERT_EMAILS", `a1.${tag}@mmri.test, a2.${tag}@mmri.test ,not-an-address,`);
rec("ML-15 only well-formed administrator addresses are used", adminAlertRecipients().join() === `a1.${tag}@mmri.test,a2.${tag}@mmri.test`);
const an = await prisma.adminNotification.create({ data: { type: "NEW_ASSESSMENT", dedupeKey: `${tag}:NA`, targetType: "REVIEW", targetId: "r1", title: "Шинэ оношилгоо илгээгдлээ", body: "Хянах шаардлагатай." } });
await prisma.adminNotification.create({ data: { type: "REVIEW_ASSIGNED", dedupeKey: `${tag}:RA`, targetType: "REVIEW", targetId: "r1", title: "Хуваарилагдлаа", body: "x" } }); // not an alert type
const rid = (addr: string) => crypto.createHash("sha256").update(addr).digest("hex").slice(0, 12);
const a1Key = `AN:${an.id}:${rid(`a1.${tag}@mmri.test`)}`, a2Key = `AN:${an.id}:${rid(`a2.${tag}@mmri.test`)}`;
const mk = async (k: string) => prisma.mailDispatchMark.findUnique({ where: { dedupeKey: k } });
const sentTo = (addr: string) => mine().filter(m => m.kind === "ADMIN_REVIEW_ALERT" && m.to === addr);
mailer.failFor.add(`a1.${tag}@mmri.test`); const a1 = await svc.dispatchPending();
rec("ML-16 an alert is claimed per recipient: one failing address does not block the other; non-alert admin notifications are never mailed", (await mk(a2Key))?.sentAt != null && (await mk(a1Key))?.sentAt == null && (await mk(a1Key))?.attempts === 1 && a1.failed >= 1 && !(await prisma.mailDispatchMark.findFirst({ where: { dedupeKey: { startsWith: `AN:${(await prisma.adminNotification.findUnique({ where: { dedupeKey: `${tag}:RA` } }))!.id}` } } })));
mailer.failFor.clear(); await pastDue(a1Key); await svc.dispatchPending(); await svc.dispatchPending();
rec("ML-17 the failed recipient is retried later; each recipient receives THIS alert exactly once (further passes add nothing)", (await mk(a1Key))?.sentAt != null && (await mk(a2Key))?.sentAt != null && sentTo(`a1.${tag}@mmri.test`).length >= 1);
const before17 = mine().length; await svc.dispatchPending();
rec("ML-17b a pass after completion sends nothing more", mine().length === before17);

// ---------------------------------------------------------------- ML-18/19 allowlist guard + marks hygiene
rec("ML-18 allowlist rules: empty = open; exact addresses and @domains match case-insensitively; anything else is refused", recipientAllowed("x@y.mn", []) && recipientAllowed("Test@Mmri.TEST", ["@mmri.test"]) && recipientAllowed("qa@y.mn", ["qa@y.mn"]) && !recipientAllowed("real@customer.mn", ["@mmri.test", "qa@y.mn"]) && !recipientAllowed("qa@y.mn.evil.com", ["qa@y.mn"]));
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mail-al-")); env("MMRI_MAIL_RECIPIENT_ALLOWLIST", "@mmri.test");
const guarded = createMailer({ mailProvider: "mock", mockMailDir: dir, mailRequestTimeoutMs: 1000 } as any);
const okR = await guarded.send({ to: `ok.${tag}@mmri.test`, subject: "s", text: "t", kind: "TEST" }), dropped = await guarded.send({ to: "real.customer@example.com", subject: "s", text: "t", kind: "TEST" });
const box = fs.readFileSync(path.join(dir, "outbox.jsonl"), "utf8"); env("MMRI_MAIL_RECIPIENT_ALLOWLIST", undefined); fs.rmSync(dir, { recursive: true, force: true });
rec("ML-19 with the allowlist set, a non-listed recipient is dropped before the provider and reported as not delivered", okR.delivered && !dropped.delivered && box.includes("ok.") && !box.includes("real.customer"));
const markRows = [...await marks(), ...(await prisma.mailDispatchMark.findMany({ where: { dedupeKey: { startsWith: `AN:${an.id}:` } } }))];
rec("ML-20 the claim table holds no addresses, names or message text (administrator recipients are hashed)", markRows.every(m => !/@/.test(JSON.stringify(m)) && !/Evil|Bcc|BusinessMRI/.test(JSON.stringify(m))) && markRows.length >= 8, `${markRows.length} rows`);

// ---------------------------------------------------------------- cleanup
await prisma.mailDispatchMark.deleteMany({ where: { OR: [{ dedupeKey: { in: (await marks()).map(m => m.dedupeKey) } }, { dedupeKey: { startsWith: `AN:${an.id}:` } }] } });
await prisma.adminNotification.deleteMany({ where: { dedupeKey: { startsWith: tag } } });
await prisma.company.deleteMany({ where: { id: { in: [company.id, company2.id] } } });
await prisma.user.deleteMany({ where: { email: { contains: tag } } });
console.log(`SUMMARY pass=${pass} fail=${fail}`);
await prisma.$disconnect(); process.exit(fail ? 1 : 0);
