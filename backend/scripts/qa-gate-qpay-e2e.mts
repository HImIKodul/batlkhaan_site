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
const BANKREF = "BANK-QA-" + crypto.randomUUID().slice(0, 8);
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
  const w = await mc(mid, { paymentReference: BANKREF, amountMnt: 299999 }); ok("LEG-6 wrong amount is refused and opens nothing", w.s === 409 && ents(LC) === 0 && sql(`select status from billing_invoices where id='${mid}'`).trim() === "CREATED", w);
  const q = await mc(Lf.d.id, { paymentReference: "BANK-QA-2", amountMnt: 300000 }); ok("LEG-7 a QPay invoice cannot be confirmed by hand", q.s === 409 && q.e?.code === "PAYMENT_PROVIDER_MISMATCH" && ents(LC) === 0, q);
  const g = await mc(mid, { paymentReference: BANKREF, amountMnt: 300000 }); ok("LEG-8 a paid MANUAL invoice is confirmed while the system is in QPAY mode", g.s === 200 && sql(`select status from billing_invoices where id='${mid}'`).trim() === "PAID", g);
  ok("LEG-9 exactly the purchased diagnosis becomes available, once", ents(LC) === 1 && Number(sql(`select count(*) from company_entitlements where "companyId"='${LC.co}' and status='ACTIVE' and "domainCode"='marketing'`)) === 1);
  const g2 = await mc(mid, { paymentReference: BANKREF, amountMnt: 300000 }); ok("LEG-10 confirming again is idempotent (no second entitlement)", g2.s === 200 && ents(LC) === 1, g2);
  const sL = (d: string) => call(B, "POST", `/companies/${LC.co}/assessments`, { tok: LC.tok, body: { domainCode: d } });
  const lm = await sL("finance"); ok("LEG-11 the unpaid finance QPay invoice opens nothing", lm.s === 402, lm);
  // ===== FINAL RELEASE: ten-minute lifetime, fresh QR on reload, payment records, all five categories, answer integrity, settings boundaries =====
  const backdate = (id: string, sec: number) => sql(`update billing_invoices set "createdAt"=now()-interval '${sec} seconds' where id='${id}'`);
  const R = await mk("qr"); const R1 = (await inv(R, "marketing")).d;
  const life = (Date.parse(R1.expiresAt) - Date.parse(R1.serverTime)) / 1000; ok("TTL-1 a new QPay invoice lives exactly 10 minutes (server clock)", life > 595 && life <= 600, life);
  const rowsOf = (c: any) => Number(sql(`select count(*) from billing_invoices where "companyId"='${c.co}'`));
  const dbl = await call(B, "POST", `/billing/invoices/${R1.id}/regenerate`, { tok: R.tok }); ok("RGN-1 a double click within seconds returns the same code (no second invoice)", dbl.s === 200 && dbl.d.id === R1.id && rowsOf(R) === 1, dbl);
  backdate(R1.id, 60); const nb = st.bodies.length;
  const g1 = await call(B, "POST", `/billing/invoices/${R1.id}/regenerate`, { tok: R.tok }); const G1 = g1.d;
  ok("RGN-2 reload issues a NEW invoice: new id, reference, provider invoice and QR payload", (g1.s === 201 || g1.s === 200) && G1.id !== R1.id && G1.senderInvoiceNo !== R1.senderInvoiceNo && G1.qrText !== R1.qrText && pidOf(G1.id) !== pidOf(R1.id) && st.bodies.length === nb + 1, g1.s);
  ok("RGN-3 the old invoice is cancelled at the provider and kept in the history", sql(`select status from billing_invoices where id='${R1.id}'`).trim() === "CANCELLED" && st.cancelled.has(pidOf(R1.id)) && rowsOf(R) === 2);
  ok("RGN-4 the new code has a fresh 10 minute lifetime", (Date.parse(G1.expiresAt) - Date.parse(G1.serverTime)) / 1000 > 595);
  const fagain = await call(B, "POST", `/billing/invoices/${R1.id}/regenerate`, { tok: R.tok }); ok("RGN-5 a second tab holding the old invoice gets the CURRENT one, not another new one", fagain.d?.id === G1.id && rowsOf(R) === 2, fagain);
  backdate(G1.id, 60); const fpar = await Promise.all(Array.from({ length: 5 }, () => call(B, "POST", `/billing/invoices/${G1.id}/regenerate`, { tok: R.tok })));
  const openN = Number(sql(`select count(*) from billing_invoices where "companyId"='${R.co}' and "domainCode"='marketing' and status in ('CREATED','PENDING')`));
  ok("RGN-6 five parallel reloads leave exactly ONE open invoice", openN === 1 && fpar.every((x: any) => x.s === 200 || x.s === 201) && new Set(fpar.map((x: any) => x.d.id)).size === 1, { openN, ids: fpar.map((x: any) => x.d?.id) });
  const cur = fpar[0].d; backdate(cur.id, 60); pay(pidOf(cur.id)); const paidRg = await call(B, "POST", `/billing/invoices/${cur.id}/regenerate`, { tok: R.tok });
  ok("RGN-7 reload of an already PAID invoice shows PAID, never cancels it and opens the entitlement", paidRg.d?.status === "PAID" && !st.cancelled.has(pidOf(cur.id)) && ents(R) === 1, paidRg);
  const Dn = await mk("qdn"); const D1 = (await inv(Dn, "finance")).d; backdate(D1.id, 60); st.down = true; const rgDown = await call(B, "POST", `/billing/invoices/${D1.id}/regenerate`, { tok: Dn.tok }); st.down = false;
  ok("RGN-8 if the provider cannot be asked, no competing invoice is created", rgDown.s >= 500 && rowsOf(Dn) === 1 && sql(`select status from billing_invoices where id='${D1.id}'`).trim() !== "PAID", { s: rgDown.s, rows: rowsOf(Dn) });
  const Rl = await mk("qrl"); let last = (await inv(Rl, "it")).d, limited = 0; for (let i = 0; i < 12; i++) { backdate(last.id, 60); const x = await call(B, "POST", `/billing/invoices/${last.id}/regenerate`, { tok: Rl.tok }); if (x.s === 429) { limited++; break } last = x.d }
  ok("RGN-9 reloads are rate-limited on the server", limited === 1, rowsOf(Rl));
  // payment records
  const Pr = await mk("qpr"), P1 = (await inv(Pr, "people")).d, pid = pidOf(P1.id); const payId = pay(pid); await cb(P1.id); await cb(P1.id); await cb(P1.id, "GET");
  const rec = sql(`select "companyId"||'|'||"domainCode"||'|'||"planCode"||'|'||"amountMnt"||'|'||currency||'|'||status||'|'||(case when "paidAt" is not null then 'paid' else 'nopaid' end)||'|'||(case when "providerInvoiceId" is not null then 'pi' else 'nopi' end)||'|'||(case when "createdByUserId" is not null then 'u' else 'nou' end) from billing_invoices where id='${P1.id}'`).trim();
  ok("PAY-1 the invoice row stores company, category, plan, amount, currency, status, paid time, provider invoice id and customer", rec === `${Pr.co}|people|DIAGNOSTIC|300000|MNT|PAID|paid|pi|u`, rec);
  ok("PAY-2 one provider payment row with the provider payment id and amount; repeated callbacks add none", Number(sql(`select count(*) from billing_payment_transactions where "invoiceId"='${P1.id}' and "transactionId"='${payId}' and "amountMnt"=300000`)) === 1 && Number(sql(`select count(*) from billing_payment_transactions where "invoiceId"='${P1.id}'`)) === 1);
  ok("PAY-3 exactly one entitlement, linked to the paid invoice", Number(sql(`select count(*) from company_entitlements where "sourceInvoiceId"='${P1.id}'`)) === 1 && ents(Pr) === 1);
  ok("PAY-4 the provider invoice carries the unique reference (sender_invoice_no) in its description", st.bodies.some(b => b.sender_invoice_no === P1.senderInvoiceNo && String(b.invoice_description).includes(P1.senderInvoiceNo)));
  ok("PAY-5 payment references are unique across all invoices", sql(`select count(*) from (select "senderInvoiceNo" from billing_invoices group by 1 having count(*)>1) x`).trim() === "0");
  // all five categories
  const CAT: [string, string][] = [["marketing", "Маркетинг"], ["it", "Мэдээллийн технологи"], ["finance", "Санхүү"], ["people", "Хүний нөөц"], ["operations", "Үйлдвэрлэл"]];
  const pqq = (await call(B, "GET", "/methodology/current/profile-questions", { tok: R.tok })).d;
  for (const [dom, label] of CAT) {
    const c = await mk("c5" + dom), iv = await inv(c, dom); const I5 = iv.d;
    await call(B, "PUT", `/companies/${c.co}/profile-answers`, { tok: c.tok, body: { profileAnswers: pqq.map((q: any) => ({ questionId: q.id, optionIndexes: [Number(q.options[0].optionIndex)] })), basicInfoAnswers: Array.from({ length: 20 }, (_, i) => ({ questionId: `B${String(i + 1).padStart(2, "0")}`, optionIndexes: [1] })) } });
    const before = await call(B, "POST", `/companies/${c.co}/assessments`, { tok: c.tok, body: { domainCode: dom } });
    pay(pidOf(I5.id)); await cb(I5.id);
    const after = await call(B, "POST", `/companies/${c.co}/assessments`, { tok: c.tok, body: { domainCode: dom } });
    const wr = "w-" + dom; const hdr = { "x-mmri-writer-id": wr };
    const sres = after.s === 201 ? await call(B, "POST", `/assessments/${after.d.id}/start`, { tok: c.tok, h: hdr, body: { mode: "QUICK", profileAnswers: pqq.map((q: any) => ({ questionId: q.id, optionIndexes: [Number(q.options[0].optionIndex)] })) } }) : null;
    const q0 = sres?.d?.nextQuestion; let ans: any = null; if (q0) ans = await call(B, "POST", `/assessments/${after.d.id}/answers`, { tok: c.tok, h: hdr, body: { questionId: q0.id, optionIndex: q0.options[0].optionIndex, questionIssueId: sres.d.questionIssueId, expectedAssessmentRevision: sres.d.assessmentRevision, clientRequestId: crypto.randomUUID() } });
    const invRow = sql(`select "domainCode"||'|'||provider||'|'||status from billing_invoices where id='${I5.id}'`).trim(); const descr = st.bodies.find(b => b.sender_invoice_no === I5.senderInvoiceNo)?.invoice_description ?? "";
    ok(`CAT-${dom} QPay invoice for exactly this category (${label} in the provider description), locked before payment, starts and saves an answer after`, I5.provider === "QPAY" && invRow === `${dom}|QPAY|PAID` && String(descr).includes(label) && before.s === 402 && after.s === 201 && ans?.s === 200, { dom, inv: iv.s, invRow, before: before.s, after: after.s, start: sres?.s, ans: ans?.s });
    if (dom === "marketing" && ans?.s === 200) {   // concurrent answers on one diagnosis
      const r2 = ans.d.routing; const q1 = r2?.nextQuestion; if (q1) {
        const mkAns = (opt: number, w: string) => call(B, "POST", `/assessments/${after.d.id}/answers`, { tok: c.tok, h: { "x-mmri-writer-id": w }, body: { questionId: q1.id, optionIndex: opt, questionIssueId: r2.questionIssueId, expectedAssessmentRevision: r2.assessmentRevision, clientRequestId: crypto.randomUUID() } });
        const res3 = await Promise.all([mkAns(q1.options[0].optionIndex, wr), mkAns(q1.options[Math.min(1, q1.options.length - 1)].optionIndex, wr), mkAns(q1.options[0].optionIndex, "w-other-browser")]);
        const okN = res3.filter((x: any) => x.s === 200).length;
        ok("ANS-1 three simultaneous answers to the same question and revision: at most one is accepted", okN <= 1, res3.map((x: any) => x.s));
        const stale = await call(B, "POST", `/assessments/${after.d.id}/answers`, { tok: c.tok, h: hdr, body: { questionId: q0.id, optionIndex: q0.options[0].optionIndex, questionIssueId: sres.d.questionIssueId, expectedAssessmentRevision: sres.d.assessmentRevision, clientRequestId: crypto.randomUUID() } });
        ok("ANS-2 an older browser tab replaying an old question and revision is refused", stale.s >= 400 && stale.s < 500, stale.s);
      }
    }
  }
  // customer settings boundaries
  const cu = await mk("qset");
  const m1 = await call(B, "GET", `/companies/${cu.co}/members`, { tok: cu.tok }), m2 = await call(B, "POST", `/companies/${cu.co}/members`, { tok: cu.tok, body: { email: "x@mmri.test", role: "ADMIN" } });
  ok("SET-1 organisation-member list and invitation routes are closed for customers (404), not just hidden", m1.s === 404 && m2.s === 404, [m1.s, m2.s]);
  const e1 = await call(B, "POST", `/companies/${cu.co}/erase`, { tok: cu.tok, body: { confirmName: "wrong name", password: cu.password } }); const e2 = await call(B, "POST", `/companies/${cu.co}/erase`, { tok: cu.tok, body: { confirmName: "QPay qset", password: "wrong-password-x" } });
  const e3 = await call(B, "POST", "/account/erase", { tok: cu.tok, body: { confirmEmail: "other@mmri.test", password: cu.password } });
  ok("SET-2 deleting data or the account needs the exact name/email AND the password; a wrong value deletes nothing", [e1, e2, e3].every((x: any) => x.s >= 400 && x.s < 500) && sql(`select status from users where id='${cu.id}'`).trim() === "ACTIVE", [e1.s, e2.s, e3.s]);
  const outsider = await customer("out"); const e4 = await call(B, "POST", `/companies/${cu.co}/erase`, { tok: outsider.tok, body: { confirmName: "QPay qset", password: outsider.password } });
  ok("SET-3 another customer cannot erase this company", e4.s >= 400 && e4.s < 500, e4.s);
  const mid2 = crypto.randomUUID(); sql(`insert into billing_invoices (id,"companyId","createdByUserId","planCode","amountMnt",provider,"senderInvoiceNo","callbackTokenHash",status,"domainCode","updatedAt") values ('${mid2}','${cu.co}','${uid}','DIAGNOSTIC',300000,'MANUAL','MMRILEGACY${Date.now()}b','legacyhash','CREATED','it',now())`);
  const cm = await call(B, "DELETE", `/billing/invoices/${mid2}`, { tok: cu.tok }); ok("LEG-12 a customer cannot cancel an old MANUAL invoice (it may be paid at the bank)", cm.s === 409 && sql(`select status from billing_invoices where id='${mid2}'`).trim() === "CREATED", cm);
  const rm = await call(B, "POST", `/billing/invoices/${mid2}/regenerate`, { tok: cu.tok }); ok("LEG-13 reload on an old MANUAL invoice is refused and nothing is created", rm.s === 409 && rowsOf(cu) === 1, rm);
  ok("no secret or token in the server log", !/qa-secret|Bearer t|Basic cWE/.test(log)); ok("few sign-ins for the whole run", st.tokens <= 12, st.tokens);
} catch (x: any) { ok("no exception", false, String(x?.stack ?? x)); }
console.log(fail ? `RESULT FAIL ${fail}` : "RESULT PASS"); api.kill("SIGKILL"); fake.close(); process.exit(fail ? 1 : 0);
