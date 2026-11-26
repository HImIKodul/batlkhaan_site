/* QPay Merchant V2 end to end against a LOCAL fake provider that follows the published V2 behaviour (timestamp expiry, Basic sign-in, refresh, 401 on a revoked token, payment/check, payment detail, POST callback).
   Real HTTP API + real database (disposable clone). No request leaves the machine, no real payment exists. usage: API_PORT=4497 FAKE_PORT=4499 with the clone environment. */
import http from "node:http"; import { spawn } from "node:child_process"; import crypto from "node:crypto";
const db = decodeURIComponent(new URL(process.env.DATABASE_URL!).pathname.slice(1)); if (!/^mmri_qa_acc2_/.test(db)) throw new Error("REFUSED " + db);
const API_PORT = Number(process.env.API_PORT ?? 4497), FAKE = Number(process.env.FAKE_PORT ?? 4499);
const B = `http://127.0.0.1:${API_PORT}/api/v1`; process.env.API = B;
let fail = 0; const ok = (n: string, c: unknown, d: unknown = "") => { if (!c) fail++; console.log(`${c ? "PASS" : "FAIL"} ${n}${c ? "" : " " + JSON.stringify(d).slice(0, 400)}`); };
const st = { tokens: 0, refresh: 0, valid: "", invoices: new Map<string, any>(), paid: new Map<string, any[]>(), checks: 0, cancelled: new Set<string>(), down: false, wrongObject: false, bodies: [] as any[] };
const fake = http.createServer((q, r) => { let s = ""; q.on("data", d => s += d); q.on("end", () => {
  const J = (c: number, b: any) => { r.writeHead(c, { "content-type": "application/json" }); r.end(JSON.stringify(b)); }; const u = q.url ?? "", auth = String(q.headers.authorization ?? "");
  if (st.down) return J(503, {});
  if (u === "/v2/auth/token") { if (auth !== "Basic " + Buffer.from("qa-client:qa-secret").toString("base64")) return J(401, { message: "NO_CREDENTIALS" }); st.tokens++; st.valid = "t" + crypto.randomUUID(); return J(200, { access_token: st.valid, expires_in: Math.floor(Date.now() / 1000) + 86400, refresh_token: "r", refresh_expires_in: Math.floor(Date.now() / 1000) + 172800 }); }
  if (u === "/v2/auth/refresh") { st.refresh++; st.valid = "t" + crypto.randomUUID(); return J(200, { access_token: st.valid, expires_in: Math.floor(Date.now() / 1000) + 86400 }); }
  if (auth !== "Bearer " + st.valid) return J(401, { message: "UNAUTHORIZED" });
  const b = s ? JSON.parse(s) : {};
  if (u === "/v2/invoice") { st.bodies.push(b); if (/[^\p{L}\p{N} .]/u.test(b.invoice_description) || /[^A-Za-z0-9]/.test(b.sender_invoice_no)) return J(400, { message: "INVALID_CHARACTER" }); const id = crypto.randomUUID(); st.invoices.set(id, b); return J(200, { invoice_id: id, qr_text: "0002010102" + id, qr_image: "", qPay_shortUrl: "https://s.qpay.mn/" + id.slice(0, 8), urls: [{ name: "Khan bank", description: "Хаан банк", link: "khanbank://q?qPay_QRcode=" + id }] }); }
  if (q.method === "DELETE" && u.startsWith("/v2/invoice/")) { st.cancelled.add(u.split("/").pop()!); return J(200, {}); }
  if (u === "/v2/payment/check") { st.checks++; const rows = st.paid.get(b.object_id) ?? []; return J(200, { count: rows.length, paid_amount: rows.reduce((n, x) => n + Number(x.payment_amount), 0), rows }); }
  if (u.startsWith("/v2/payment/")) { const id = u.split("/").pop(); for (const [inv, rows] of st.paid) for (const x of rows) if (String(x.payment_id) === id) return J(200, { ...x, object_type: "INVOICE", object_id: st.wrongObject ? crypto.randomUUID() : inv }); return J(404, {}); }
  J(404, {});
}); }); await new Promise<void>(r => fake.listen(FAKE, "127.0.0.1", r));
const env = { ...process.env, PORT: String(API_PORT), MMRI_BILLING_PROVIDER: "qpay", QPAY_BASE_URL: `http://127.0.0.1:${FAKE}`, QPAY_CLIENT_ID: "qa-client", QPAY_CLIENT_SECRET: "qa-secret", QPAY_INVOICE_CODE: "QA_CODE", MMRI_BILLING_CALLBACK_BASE_URL: `http://127.0.0.1:${API_PORT}`, MMRI_AI_REPORT_PROVIDER: "disabled", MMRI_AI_REPORT_REQUIRED: "false", MMRI_AI_ANNUAL_PLAN: "off" };
let log = ""; const api = spawn(process.execPath, ["node_modules/tsx/dist/cli.mjs", "src/api/server.ts"], { env: env as any, stdio: ["ignore", "pipe", "pipe"] }); api.stdout.on("data", d => log += d); api.stderr.on("data", d => log += d);
process.on("exit", () => api.kill("SIGKILL"));
for (let i = 0; i < 60; i++) { try { if ((await fetch(`http://127.0.0.1:${API_PORT}/ready`)).ok) break; } catch { } await new Promise(r => setTimeout(r, 500)); }
const { customer, sql } = await import("./lib/admin-qa.mjs" as any); const { http: call } = await import("./lib/qa-journey.mjs" as any);
const mk = async (l: string) => { const c = await customer(l); const co = (await call(B, "POST", "/companies", { tok: c.tok, body: { name: "QPay " + l } })).d.id; return { ...c, co }; };
const inv = (c: any, domainCode: string, planCode = "DIAGNOSTIC") => call(B, "POST", `/companies/${c.co}/billing/invoices`, { tok: c.tok, body: { planCode, domainCode } });
const pay = (pid: string, amount = "300000.00", id: any = Date.now() + Math.floor(Math.random() * 1e6)) => { st.paid.set(pid, [{ payment_id: id, payment_status: "PAID", payment_amount: amount, payment_currency: "MNT" }]); return id; };
const pidOf = (id: string) => sql(`select "providerInvoiceId" from billing_invoices where id='${id}'`);
const cb = (id: string, m = "POST") => { const local = st.bodies.find(b => b.callback_url.includes(id)); return fetch(local.callback_url, { method: m }); };
const ents = (c: any) => Number(sql(`select count(*) from company_entitlements where "companyId"='${c.co}' and status='ACTIVE'`));
try {
  const a = await mk("qa"), r = await inv(a, "finance"); const I = r.d;
  ok("invoice with dynamic QR, short address and bank deep link", r.s === 201 && I.provider === "QPAY" && I.status === "PENDING" && I.qrText?.startsWith("0002") && I.deeplinks[0]?.link.startsWith("khanbank://") && I.expiresAt, r);
  const b0 = st.bodies.at(-1); ok("exact 300000, no partial/exceed, plain text, callback on our host", b0.amount === 300000 && b0.allow_partial === false && b0.allow_exceed === false && /Санхүү/.test(b0.invoice_description) && b0.callback_url.startsWith(`http://127.0.0.1:${API_PORT}/`), b0);
  const par = await Promise.all(Array.from({ length: 6 }, () => inv(a, "finance"))); ok("parallel purchase clicks reuse one invoice", new Set(par.map(x => x.d?.id)).size === 1 && st.bodies.length === 1, st.bodies.length);
  ok("callback before payment opens nothing", (await cb(I.id)).status === 200 && ents(a) === 0);
  ok("forged callback token refused", (await fetch(`${B}/billing/qpay/callback/${I.id}?token=forged`, { method: "POST" })).status === 403);
  const P = pidOf(I.id); pay(P, "299999.00"); await cb(I.id); ok("underpayment opens nothing", ents(a) === 0);
  pay(P); st.wrongObject = true; const wo = await cb(I.id); ok("payment bound to another invoice refused", wo.status === 502 && ents(a) === 0, wo.status); st.wrongObject = false;
  st.valid = "revoked"; const t0 = st.tokens; const many = await Promise.all(Array.from({ length: 8 }, () => cb(I.id))); ok("revoked token recovers; 8 parallel callbacks grant exactly one right", many.every(x => x.status === 200) && ents(a) === 1 && st.tokens - t0 >= 1 && st.tokens - t0 <= 8, [many.map(x => x.status), ents(a), st.tokens - t0]);
  ok("callback reply is SUCCESS", (await (await cb(I.id)).text()) === "SUCCESS"); ok("GET callback works too", (await cb(I.id, "GET")).status === 200 && ents(a) === 1);
  ok("right is for the paid domain only", sql(`select "domainCode" from company_entitlements where "companyId"='${a.co}'`) === "finance");
  ok("second purchase of a paid domain refused", (await inv(a, "finance")).s === 409);
  ok("retake refused before a finished diagnosis", (await inv(a, "finance", "RETAKE")).s === 409);
  const other = await mk("qb"); ok("another company cannot read or reconcile the invoice", [403, 404].includes((await call(B, "GET", `/billing/invoices/${I.id}`, { tok: other.tok })).s) && [403, 404].includes((await call(B, "POST", `/billing/invoices/${I.id}/reconcile`, { tok: other.tok })).s));
  const reuse = (await inv(other, "it")).d; st.paid.set(pidOf(reuse.id), st.paid.get(P)!.map(x => ({ ...x }))); st.paid.delete(P); await cb(reuse.id); ok("one bank transaction cannot pay two invoices", ents(other) === 0);
  // lost callback: the sweep confirms it (age the row so it is due)
  const c = await mk("qc"), L = (await inv(c, "people")).d; pay(pidOf(L.id)); sql(`update billing_invoices set "createdAt"=now()-interval '20 minutes' where id='${L.id}'`);
  const { BillingService } = await import("../src/billing/billing-service.js"); const { loadApiConfig } = await import("../src/api/config.js") as any;
  Object.assign(process.env, env); const svc = new BillingService(loadApiConfig()); const sw = await Promise.all([svc.sweepPendingPayments(), svc.sweepPendingPayments()]);
  ok("lost callback recovered by the sweep, exactly once", ents(c) === 1 && sw[0].activated + sw[1].activated === 1, sw); const again = await svc.sweepPendingPayments(); ok("sweep does not poll again immediately", again.checked === 0, again);
  // provider down
  const d = await mk("qd"); st.down = true; const dn = await inv(d, "marketing"); st.down = false; ok("provider outage gives a clear retryable error", dn.s === 502, dn); ok("retry after outage works", (await inv(d, "marketing")).s === 201);
  // late payment after local cancel
  const M = (await call(B, "GET", `/companies/${d.co}/billing/invoices`, { tok: d.tok })).d.invoices.find((x: any) => x.status === "PENDING"); await call(B, "DELETE", `/billing/invoices/${M.id}`, { tok: d.tok }); ok("cancel reaches the provider", st.cancelled.has(pidOf(M.id)));
  pay(pidOf(M.id)); await cb(M.id); ok("money paid after a cancel is honoured once", ents(d) === 1);
  // expiry: an expired code is replaced by a new one
  const e = await mk("qe"), E1 = (await inv(e, "it")).d; sql(`update billing_invoices set "createdAt"=now()-interval '45 minutes' where id='${E1.id}'`); const E2 = (await inv(e, "it")).d; ok("expired code is cancelled and replaced", E2.id !== E1.id && st.cancelled.has(pidOf(E1.id)));
  ok("payment mail/notification queued for the confirmed payment", Number(sql(`select count(*) from customer_notifications where "companyId"='${a.co}' and type='PAYMENT_CONFIRMED'`)) >= 1);
  // immediate access, to exactly the purchased diagnosis: no administrator step between the provider confirmation and the start
  const f1 = await mk("qf"), F = (await inv(f1, "operations")).d;
  const pq = (await call(B, "GET", "/methodology/current/profile-questions", { tok: f1.tok })).d;
  await call(B, "PUT", `/companies/${f1.co}/profile-answers`, { tok: f1.tok, body: { profileAnswers: pq.map((q: any) => ({ questionId: q.id, optionIndexes: [Number(q.options[0].optionIndex)] })), basicInfoAnswers: Array.from({ length: 20 }, (_, i) => ({ questionId: `B${String(i + 1).padStart(2, "0")}`, optionIndexes: [1] })) } });
  const start = (domainCode: string) => call(B, "POST", `/companies/${f1.co}/assessments`, { tok: f1.tok, body: { domainCode } });
  const unpaid = await start("operations"); ok("before payment the diagnosis cannot start", unpaid.s === 402, unpaid);
  pay(pidOf(F.id)); await cb(F.id);
  for (const other of ["marketing", "it", "finance", "people"]) { const x = await start(other); ok(`payment for operations does not open ${other}`, x.s === 402, x); }
  const opened = await start("operations"); ok("the purchased diagnosis starts immediately after the callback", opened.s === 201, opened);
  ok("the right is used exactly once", Number(sql(`select count(*) from company_entitlements where "companyId"='${f1.co}' and "assessmentsUsed"=1 and "domainCode"='operations'`)) === 1 && Number(sql(`select count(*) from assessments where "companyId"='${f1.co}'`)) === 1);
  // OLD MANUAL INVOICE UNDER QPAY (production switched from MANUAL to QPAY with manual invoices possibly still open)
  const { provision, freshAdminTotp, call: acall } = await import("./lib/admin-qa.mjs" as any);
  const LC = await mk("ql"), uid = sql(`select id from users limit 1`).trim(), mid = crypto.randomUUID();
  sql(`insert into billing_invoices (id,"companyId","createdByUserId","planCode","amountMnt",provider,"senderInvoiceNo","callbackTokenHash",status,"domainCode","updatedAt") values ('${mid}','${LC.co}','${uid}','DIAGNOSTIC',300000,'MANUAL','MMRILEGACY${Date.now()}','legacyhash','CREATED','marketing',now())`);
  const nBodies = st.bodies.length, rows = (c: any) => Number(sql(`select count(*) from billing_invoices where "companyId"='${c.co}'`));
  const L1 = await inv(LC, "marketing"); ok("LEG-1 an old MANUAL invoice is not handed back as the QPay purchase", L1.s === 409 && L1.e?.code === "OTHER_PROVIDER_INVOICE_OPEN" && !L1.d?.qrText, L1);
  const Lp = await Promise.all(Array.from({ length: 4 }, () => inv(LC, "marketing"))); ok("LEG-2 repeated clicks create no QPay invoice and no duplicate row", Lp.every(x => x.s === 409) && rows(LC) === 1 && st.bodies.length === nBodies, { rows: rows(LC), bodies: st.bodies.length - nBodies });
  ok("LEG-3 the old invoice is left untouched (not cancelled)", sql(`select status from billing_invoices where id='${mid}'`).trim() === "CREATED" && ents(LC) === 0);
  const Lf = await inv(LC, "finance"); ok("LEG-4 another diagnosis still gets its own QPay invoice", Lf.s === 201 && Lf.d.provider === "QPAY" && rows(LC) === 2, Lf);
  const sup = provision("SUPER_ADMIN", "legacy"); const LG = await acall("POST", "/admin/auth/login", { body: { email: sup.email, password: sup.password, totpCode: await freshAdminTotp(sup) } }); const atok = LG.d?.token; ok("LEG-5 administrator signs in", LG.s === 200 && !!atok, LG.s);
  await acall("POST", "/admin/auth/reauth", { tok: atok, body: { password: sup.password, totpCode: await freshAdminTotp(sup) } });
  const mc = (id: string, body: any) => acall("POST", `/admin/billing/invoices/${id}/manual-confirm`, { tok: atok, body: { reason: "bank statement checked in QA", ...body } });
  const w = await mc(mid, { paymentReference: "BANK-QA-1", amountMnt: 299999 }); ok("LEG-6 wrong amount is refused and opens nothing", w.s === 409 && ents(LC) === 0 && sql(`select status from billing_invoices where id='${mid}'`).trim() === "CREATED", w);
  const q = await mc(Lf.d.id, { paymentReference: "BANK-QA-2", amountMnt: 300000 }); ok("LEG-7 a QPay invoice cannot be confirmed by hand", q.s === 409 && q.e?.code === "PAYMENT_PROVIDER_MISMATCH" && ents(LC) === 0, q);
  const g = await mc(mid, { paymentReference: "BANK-QA-1", amountMnt: 300000 }); ok("LEG-8 a paid MANUAL invoice is confirmed while the system is in QPAY mode", g.s === 200 && sql(`select status from billing_invoices where id='${mid}'`).trim() === "PAID", g);
  ok("LEG-9 exactly the purchased diagnosis becomes available, once", ents(LC) === 1 && Number(sql(`select count(*) from company_entitlements where "companyId"='${LC.co}' and status='ACTIVE' and "domainCode"='marketing'`)) === 1);
  const g2 = await mc(mid, { paymentReference: "BANK-QA-1", amountMnt: 300000 }); ok("LEG-10 confirming again is idempotent (no second entitlement)", g2.s === 200 && ents(LC) === 1, g2);
  const sL = (d: string) => call(B, "POST", `/companies/${LC.co}/assessments`, { tok: LC.tok, body: { domainCode: d } });
  const lm = await sL("finance"); ok("LEG-11 the unpaid finance QPay invoice opens nothing", lm.s === 402, lm);
  ok("no secret or token in the server log", !/qa-secret|Bearer t|Basic cWE/.test(log)); ok("few sign-ins for the whole run", st.tokens <= 12, st.tokens);
} catch (x: any) { ok("no exception", false, String(x?.stack ?? x)); }
console.log(fail ? `RESULT FAIL ${fail}` : "RESULT PASS"); api.kill("SIGKILL"); fake.close(); process.exit(fail ? 1 : 0);
