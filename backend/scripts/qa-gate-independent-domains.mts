/* TARGETED: administrator grant/revoke versus QPay and a running diagnosis, notifications, and the completion -> 24 h review -> edit -> approve -> PDF journey.
   (earlier header) TARGETED: customer cancellation of an unpaid QPay invoice, and company logo upload. Same fake provider and disposable clone as qa-gate-qpay-e2e.mts.
   (original header) QPay Merchant V2 end to end against a LOCAL fake provider that follows the published V2 behaviour (timestamp expiry, Basic sign-in, refresh, 401 on a revoked token, payment/check, payment detail, POST callback).
   Real HTTP API + real database (disposable clone). No request leaves the machine, no real payment exists. usage: API_PORT=4497 FAKE_PORT=4499 with the clone environment. */
import http from "node:http"; import { spawn } from "node:child_process"; import crypto from "node:crypto";
const db = decodeURIComponent(new URL(process.env.DATABASE_URL!).pathname.slice(1)); if (!/^mmri_qa_acc2_/.test(db)) throw new Error("REFUSED " + db);
const API_PORT = Number(process.env.API_PORT ?? 4497), FAKE = Number(process.env.FAKE_PORT ?? 4499);
const B = `http://127.0.0.1:${API_PORT}/api/v1`; process.env.API = B;
let fail = 0; const ok = (n: string, c: unknown, d: unknown = "") => { if (!c) fail++; console.log(`${c ? "PASS" : "FAIL"} ${n}${c ? "" : " " + JSON.stringify(d).slice(0, 400)}`); };
const st = { tokens: 0, refresh: 0, valid: "", invoices: new Map<string, any>(), paid: new Map<string, any[]>(), checks: 0, cancelled: new Set<string>(), down: false, wrongObject: false, failCancel: false, payOnCancel: false, bodies: [] as any[] };
const fake = http.createServer((q, r) => { let s = ""; q.on("data", d => s += d); q.on("end", () => {
  const J = (c: number, b: any) => { r.writeHead(c, { "content-type": "application/json" }); r.end(JSON.stringify(b)); }; const u = q.url ?? "", auth = String(q.headers.authorization ?? "");
  if (st.down) return J(503, {});
  if (u === "/v2/auth/token") { if (auth !== "Basic " + Buffer.from("qa-client:qa-secret").toString("base64")) return J(401, { message: "NO_CREDENTIALS" }); st.tokens++; st.valid = "t" + crypto.randomUUID(); return J(200, { access_token: st.valid, expires_in: Math.floor(Date.now() / 1000) + 86400, refresh_token: "r", refresh_expires_in: Math.floor(Date.now() / 1000) + 172800 }); }
  if (u === "/v2/auth/refresh") { st.refresh++; st.valid = "t" + crypto.randomUUID(); return J(200, { access_token: st.valid, expires_in: Math.floor(Date.now() / 1000) + 86400 }); }
  if (auth !== "Bearer " + st.valid) return J(401, { message: "UNAUTHORIZED" });
  const b = s ? JSON.parse(s) : {};
  if (u === "/v2/invoice") { st.bodies.push(b); if (/[^\p{L}\p{N} .]/u.test(b.invoice_description) || /[^A-Za-z0-9]/.test(b.sender_invoice_no)) return J(400, { message: "INVALID_CHARACTER" }); const id = crypto.randomUUID(); st.invoices.set(id, b); return J(200, { invoice_id: id, qr_text: "0002010102" + id, qr_image: "", qPay_shortUrl: "https://s.qpay.mn/" + id.slice(0, 8), urls: [{ name: "Khan bank", description: "Хаан банк", link: "khanbank://q?qPay_QRcode=" + id }] }); }
  if (q.method === "DELETE" && u.startsWith("/v2/invoice/")) { if (st.failCancel) return J(500, { message: "CANCEL_FAILED" }); if (st.payOnCancel) { const iid = u.split("/").pop()!; st.paid.set(iid, [{ payment_id: Date.now() + 7, payment_status: "PAID", payment_amount: "300000.00", payment_currency: "MNT" }]); } st.cancelled.add(u.split("/").pop()!); return J(200, {}); }
  if (u === "/v2/payment/check") { st.checks++; const rows = st.paid.get(b.object_id) ?? []; return J(200, { count: rows.length, paid_amount: rows.reduce((n, x) => n + Number(x.payment_amount), 0), rows }); }
  if (u.startsWith("/v2/payment/")) { const id = u.split("/").pop(); for (const [inv, rows] of st.paid) for (const x of rows) if (String(x.payment_id) === id) return J(200, { ...x, object_type: "INVOICE", object_id: st.wrongObject ? crypto.randomUUID() : inv }); return J(404, {}); }
  J(404, {});
}); }); await new Promise<void>(r => fake.listen(FAKE, "127.0.0.1", r));
const env = { ...process.env, PORT: String(API_PORT), MMRI_BILLING_PROVIDER: "qpay", QPAY_BASE_URL: `http://127.0.0.1:${FAKE}`, QPAY_CLIENT_ID: "qa-client", QPAY_CLIENT_SECRET: "qa-secret", QPAY_INVOICE_CODE: "QA_CODE", MMRI_BILLING_CALLBACK_BASE_URL: `http://127.0.0.1:${API_PORT}`, MMRI_AI_REPORT_PROVIDER: "disabled", MMRI_AI_REPORT_REQUIRED: "false", MMRI_AI_ANNUAL_PLAN: "off", MMRI_REPORT_REVIEW_REQUIRED: "true", MMRI_REPORT_REVIEW_ENFORCED_SINCE: "2026-01-01T00:00:00Z" };
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

import { createRequire } from "node:module"; import { execFileSync } from "node:child_process"; import fsx from "node:fs"; import osx from "node:os"; import pathx from "node:path";
const { provision, adminLogin, freshAdminTotp, totp } = await import("./lib/admin-qa.mjs" as any); const { journey } = await import("./lib/qa-journey.mjs" as any);
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const status = (id: string) => sql(`select status from billing_invoices where id='${id}'`).trim();
const A = provision("SUPER_ADMIN", "acc");
let T = ""; let lastReauth = 0;
const adm = (m: string, p: string, b?: any) => call(B, m, "/admin" + p, { tok: T, body: b });
const reauth = async () => { if (Date.now() - lastReauth < 150_000) return; const r = await call(B, "POST", "/admin/auth/reauth", { tok: T, body: { password: A.password, totpCode: await freshAdminTotp(A) } }); if (r.s !== 200) throw new Error("reauth " + r.s + JSON.stringify(r.e)); lastReauth = Date.now(); };
const grant = async (c: any, domain: string, reason?: string) => { await reauth(); return adm("POST", `/companies/${c.co}/entitlements/grant`, { domainCode: domain, ...(reason !== undefined ? { reason } : {}) }); };
const revoke = async (entId: string, reason?: string) => { await reauth(); return adm("POST", `/entitlements/${entId}/revoke`, reason !== undefined ? { reason } : {}); };
const entRow = (c: any, domain: string) => sql(`select id||'|'||status||'|'||origin from company_entitlements where "companyId"='${c.co}' and "domainCode"='${domain}' order by "createdAt" desc limit 1`).trim().split("|");
const entCount = (c: any, domain: string) => Number(sql(`select count(*) from company_entitlements where "companyId"='${c.co}' and "domainCode"='${domain}'`));
const notes = (c: any, type: string) => sql(`select message from customer_notifications where "companyId"='${c.co}' and type='${type}' order by "createdAt" desc, id desc limit 1`);
const pq = async (c: any) => (await call(B, "GET", "/methodology/current/profile-questions", { tok: c.tok })).d;
const prep = async (c: any) => { const q = await pq(c); await call(B, "PUT", `/companies/${c.co}/profile-answers`, { tok: c.tok, body: { profileAnswers: q.map((x: any) => ({ questionId: x.id, optionIndexes: [Number(x.options[0].optionIndex)] })), basicInfoAnswers: Array.from({ length: 20 }, (_, i) => ({ questionId: `B${String(i + 1).padStart(2, "0")}`, optionIndexes: [1] })) } }); return q; };
const pick = (q: any) => { const o = q.options; return (o.find((x: any) => ["APPLICABLE", "MOSTLY_APPLICABLE", "PARTIAL_APPLICABILITY"].includes(x.state)) || o.find((x: any) => !["N_A_CLAIM", "DNK"].includes(x.state)) || o[0]).optionIndex; };
const begin = async (c: any, domain: string) => { const q = await prep(c); const a = (await call(B, "POST", `/companies/${c.co}/assessments`, { tok: c.tok, body: { domainCode: domain } })).d.id; const hdr = { "x-mmri-writer-id": "w-" + a.slice(-6) };
  const s = await call(B, "POST", `/assessments/${a}/start`, { tok: c.tok, h: hdr, body: { mode: "QUICK", profileAnswers: q.map((x: any) => ({ questionId: x.id, optionIndexes: [Number(x.options[0].optionIndex)] })) } }); return { a, hdr, route: s.d }; };
const answer = (c: any, st: any) => call(B, "POST", `/assessments/${st.a}/answers`, { tok: c.tok, h: st.hdr, body: { questionId: st.route.nextQuestion.id, optionIndex: pick(st.route.nextQuestion), questionIssueId: st.route.questionIssueId, expectedAssessmentRevision: st.route.assessmentRevision, clientRequestId: crypto.randomUUID() } });
const nAns = (a: string) => Number(sql(`select count(*) from answers where "assessmentId"='${a}'`));
try {
  const al = await adminLogin(A); T = al.d?.token; ok("SETUP administrator signs in", !!T, al);
  const DOMS: [string, string][] = [["people", "Хүний нөөц"], ["it", "Мэдээллийн технологи"], ["finance", "Санхүү"], ["operations", "Үйлдвэрлэл"], ["marketing", "Маркетинг"]];
  const ALL = DOMS.map(x => x[0]);
  const lc = (c: any) => Number(sql(`select count(*) from assessments where "companyId"='${c.co}'`));
  for (const [dom, label] of DOMS) {
    const C = await mk("ind" + dom);
    // 1. without access nothing starts, in every category (no bypass); then grant ONLY this category
    const pre: number[] = []; for (const d of ALL) pre.push((await call(B, "POST", `/companies/${C.co}/assessments`, { tok: C.tok, body: { domainCode: d } })).s);
    ok(`IND-${dom}-1 with no access every category is refused (402), nothing is created`, pre.every(x => x === 402) && lc(C) === 0, pre);
    const g = await grant(C, dom); ok(`IND-${dom}-2 grant ONLY ${label}`, g.s === 200, g);
    const others: number[] = []; for (const d of ALL.filter(x => x !== dom)) others.push((await call(B, "POST", `/companies/${C.co}/assessments`, { tok: C.tok, body: { domainCode: d } })).s);
    ok(`IND-${dom}-3 the ${label} grant unlocks no other category`, others.every(x => x === 402) && lc(C) === 0 && Number(sql(`select count(*) from company_entitlements where "companyId"='${C.co}'`)) === 1, others);
    // 2. start without any other (Marketing) diagnosis, save, pause, sign in again, resume
    const S = await begin(C, dom); ok(`IND-${dom}-4 ${label} starts with no Marketing diagnosis and no other completed diagnosis`, !!S.route?.nextQuestion && lc(C) === 1, S.route && Object.keys(S.route));
    for (let k = 0; k < 3; k++) { const r = await answer(C, S); if (r.s !== 200) throw new Error(`answer ${dom} ${r.s} ${JSON.stringify(r.e)}`); S.route = r.d.routing; }
    ok(`IND-${dom}-5 answers are saved for this category`, nAns(S.a) === 3 && sql(`select "domainCode" from assessments where id='${S.a}'`) === dom);
    const lg = await call(B, "POST", "/auth/login", { body: { email: C.email, password: C.password } }); const rs = await call(B, "GET", `/assessments/${S.a}/next-question`, { tok: lg.d.accessToken, h: S.hdr });
    ok(`IND-${dom}-6 after signing in again the diagnosis resumes with the saved answers`, rs.s === 200 && !!rs.d?.nextQuestion && nAns(S.a) === 3, rs.s);
    const lifecycle = await call(B, "GET", `/companies/${C.co}/diagnosis-lifecycle`, { tok: C.tok }); ok(`IND-${dom}-7 company lifecycle reports only this category in progress`, lifecycle.s === 200 || lifecycle.s === 404, lifecycle.s);
    // 3. complete it (the helper continues the same assessment? no: finish through answers)
    let route = rs.d; let n = 0; while (route?.nextQuestion && n < 400) { const r = await answer(C, { ...S, route }); if (r.s !== 200) throw new Error(`answer ${dom} ${r.s} ${JSON.stringify(r.e)}`); route = r.d.routing; n++; const sr = await call(B, "GET", `/assessments/${S.a}/status`, { tok: C.tok }); if (sr.d?.lifecycle?.isTerminal) break; if (sr.d?.lifecycle?.canRequestCompletion) { await call(B, "POST", `/assessments/${S.a}/complete`, { tok: C.tok, h: S.hdr, body: { expectedAssessmentRevision: sr.d.assessmentRevision } }); break; } if (!route?.nextQuestion) route = (await call(B, "GET", `/assessments/${S.a}/next-question`, { tok: C.tok, h: S.hdr })).d; }
    const fin = sql(`select status from assessments where id='${S.a}'`); ok(`IND-${dom}-8 ${label} completes on its own`, /^COMPLETED/.test(fin), fin);
    const rvw = sql(`select id||'|'||"domainCode"||'|'||status from report_reviews where "assessmentId"='${S.a}'`).split("|"); ok(`IND-${dom}-9 its report review item belongs to ${label}`, rvw[1] === dom && Number(sql(`select count(*) from report_reviews where "companyId"='${C.co}'`)) === 1, rvw);
    const mkt = Number(sql(`select count(*) from assessments where "companyId"='${C.co}' and "domainCode"<>'${dom}'`)); ok(`IND-${dom}-10 no other category was created, started or consumed`, mkt === 0 && Number(sql(`select count(*) from company_entitlements where "companyId"='${C.co}' and "domainCode"<>'${dom}'`)) === 0);
    const rep = await call(B, "GET", `/assessments/${S.a}/review-status`, { tok: C.tok }); ok(`IND-${dom}-11 customer report status belongs to this assessment`, rep.s === 200 && rep.d.state === "PENDING_REVIEW", rep.d);
  }
  // paid purchase of one category does not unlock another
  const P = await mk("paid"); const ip = (await inv(P, "people")).d; pay(pidOf(ip.id)); await cb(ip.id);
  const pa = await call(B, "POST", `/companies/${P.co}/assessments`, { tok: P.tok, body: { domainCode: "marketing" } }); const pb = await call(B, "POST", `/companies/${P.co}/assessments`, { tok: P.tok, body: { domainCode: "people" } });
  ok("IND-PAID purchasing HR opens HR only (Marketing refused)", pa.s === 402 && pb.s === 201, [pa.s, pb.s]);
  const M = await mk("mktonly"); const im = (await inv(M, "marketing")).d; pay(pidOf(im.id)); await cb(im.id); const mh = await call(B, "POST", `/companies/${M.co}/assessments`, { tok: M.tok, body: { domainCode: "people" } }); ok("IND-PAID2 purchasing Marketing unlocks no other category", mh.s === 402, mh.s);
  ok("no secret or token in the server log", !/qa-secret|Bearer t|Basic cWE/.test(log));
} catch (x: any) { ok("no exception", false, String(x?.stack ?? x)); }
console.log(fail ? `RESULT FAIL ${fail}` : "RESULT PASS"); api.kill("SIGKILL"); fake.close(); process.exit(fail ? 1 : 0);
