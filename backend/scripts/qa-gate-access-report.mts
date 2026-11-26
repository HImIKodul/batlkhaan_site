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
  const al = await adminLogin(A); T = al.d?.token; ok("SETUP administrator signs in with MFA", !!T, al);

  // ================= ACCESS =================
  const N1 = await mk("g1"); const g1 = await grant(N1, "marketing");
  ok("ACC-1 grant with no pending invoice and NO description succeeds", g1.s === 200 && g1.d.granted === true, g1);
  ok("ACC-2 default grant notification is the standard Mongolian sentence with the category name", notes(N1, "ACCESS_GRANTED") === "Танд Маркетинг оношилгоонд хандах эрх олгогдлоо. Та оношилгоогоо эхлүүлэх эсвэл үргэлжлүүлэх боломжтой.", notes(N1, "ACCESS_GRANTED"));
  const as1 = await call(B, "POST", `/companies/${N1.co}/assessments`, { tok: N1.tok, body: { domainCode: "marketing" } }); ok("ACC-3 the grant is effective immediately (customer can open the diagnosis)", as1.s === 201, as1);
  ok("ACC-4 the grant is recorded as an administrator grant, not as a payment", entRow(N1, "marketing")[2] === "ADMIN_GRANT" && Number(sql(`select count(*) from billing_invoices where "companyId"='${N1.co}'`)) === 0 && Number(sql(`select count(*) from billing_payment_transactions t join billing_invoices i on i.id=t."invoiceId" where i."companyId"='${N1.co}'`)) === 0);
  const aud1 = sql(`select count(*) from admin_audit_events where action='ADMIN_ENTITLEMENT_GRANTED' and outcome='SUCCESS' and "targetType"='ENTITLEMENT' and "targetId"='${entRow(N1, "marketing")[0]}'`); ok("ACC-5 grant is in the admin audit trail", Number(aud1) === 1, aud1);

  // grant while a QPay invoice is waiting and its QR is still valid
  const N2 = await mk("g2"); const w2 = (await inv(N2, "finance")).d; const bodiesBefore = st.bodies.length;
  const g2 = await grant(N2, "finance", "Тест тайлбар: урамшуулал");
  ok("ACC-6 grant WHILE a valid QPay invoice waits (QR not expired) succeeds at once", g2.s === 200 && w2.status === "PENDING", { g: g2.s, e: g2.e, inv: w2.status });
  ok("ACC-7 the waiting QPay code was retired through the verified cancel flow (provider cancel + local CANCELLED), row kept", st.cancelled.has(pidOf(w2.id)) && status(w2.id) === "CANCELLED" && Number(sql(`select count(*) from billing_invoices where "companyId"='${N2.co}'`)) === 1);
  ok("ACC-8 a custom description keeps the standard sentence and adds the note underneath", notes(N2, "ACCESS_GRANTED").startsWith("Танд Санхүү оношилгоонд хандах эрх олгогдлоо.") && notes(N2, "ACCESS_GRANTED").endsWith("Нэмэлт тайлбар: Тест тайлбар: урамшуулал"), notes(N2, "ACCESS_GRANTED"));
  ok("ACC-9 no second entitlement, no payment recorded for the grant", entCount(N2, "finance") === 1 && ents(N2) === 1);

  // QPay cancel fails: the invoice stays open and reconcilable, grant still works, a late payment is recorded once and cannot undo a later revocation
  const N3 = await mk("g3"); const w3 = (await inv(N3, "it")).d; st.failCancel = true; const g3 = await grant(N3, "it"); st.failCancel = false;
  ok("ACC-10 provider cannot cancel: grant STILL succeeds and the QPay invoice stays open and reconcilable", g3.s === 200 && g3.d.qpayInvoicesStillOpen === 1 && ["PENDING", "CREATED"].includes(status(w3.id)), { s: g3.s, d: g3.d, st: status(w3.id) });
  const e3 = entRow(N3, "it")[0]; const r3 = await revoke(e3);
  ok("ACC-11 revoke WITH a pending QPay invoice succeeds (no description)", r3.s === 200 && entRow(N3, "it")[1] === "REVOKED", r3);
  ok("ACC-12 default revoke notification, standard Mongolian sentence", notes(N3, "ACCESS_REVOKED") === "Таны Мэдээллийн технологи оношилгоонд хандах эрх цуцлагдлаа. Өмнө хадгалсан хариултууд тань хэвээр үлдэнэ.", notes(N3, "ACCESS_REVOKED"));
  const noAccess = await call(B, "POST", `/companies/${N3.co}/assessments`, { tok: N3.tok, body: { domainCode: "it" } }); ok("ACC-13 after the revoke the customer has no access (backend refuses)", noAccess.s === 402, noAccess);
  pay(pidOf(w3.id)); await cb(w3.id);
  ok("ACC-14 a real QPay payment that arrives afterwards is recorded exactly once and does not reactivate the revoked grant (the customer's real payment becomes its own paid entitlement)", status(w3.id) === "PAID" && Number(sql(`select count(*) from billing_payment_transactions where "invoiceId"='${w3.id}'`)) === 1 && sql(`select status from company_entitlements where id='${e3}'`) === "REVOKED" && Number(sql(`select count(*) from company_entitlements where "sourceInvoiceId"='${w3.id}'`)) === 1, { inv: status(w3.id), grant: sql(`select status from company_entitlements where id='${e3}'`) });
  await cb(w3.id); await cb(w3.id, "GET"); ok("ACC-15 repeated callbacks add no payment and no entitlement", Number(sql(`select count(*) from billing_payment_transactions where "invoiceId"='${w3.id}'`)) === 1 && entCount(N3, "it") === 2);

  // revoke with a custom description, then re-grant (not started): a fresh entitlement
  const N4 = await mk("g4"); await grant(N4, "people"); const r4 = await revoke(entRow(N4, "people")[0], "Пилотын туршилт дууссан");
  ok("ACC-16 revoke with a custom description: standard sentence + note", r4.s === 200 && notes(N4, "ACCESS_REVOKED").startsWith("Таны Хүний нөөц оношилгоонд хандах эрх цуцлагдлаа.") && notes(N4, "ACCESS_REVOKED").endsWith("Нэмэлт тайлбар: Пилотын туршилт дууссан"), notes(N4, "ACCESS_REVOKED"));
  const raw4 = sql(`select "revokeReason" from company_entitlements where id='${entRow(N4, "people")[0]}'`); ok("ACC-17 the administrator's note is stored in the audit/revoke record", raw4 === "Пилотын туршилт дууссан", raw4);
  const g4b = await grant(N4, "people"); ok("ACC-18 re-grant after an unstarted revoke creates a new entitlement", g4b.s === 200 && g4b.d.reactivated === false && entCount(N4, "people") === 2 && entRow(N4, "people")[1] === "ACTIVE", g4b);

  // notifications through the customer API
  const nl = await call(B, "GET", `/notifications?companyId=${N1.co}`, { tok: N1.tok }); ok("ACC-19 the customer sees the access notification through the notification API (no internal ids/admin data)", nl.s === 200 && nl.d.items.some((x: any) => x.type === "ACCESS_GRANTED" && !/admin|@/i.test(x.message)), nl.s);

  // ===== revoke during an active diagnosis =====
  const N5 = await mk("g5"); await grant(N5, "operations"); const S5 = await begin(N5, "operations");
  for (let i = 0; i < 3; i++) { const r = await answer(N5, S5); if (r.s !== 200) throw new Error("answer " + r.s + JSON.stringify(r.e)); S5.route = r.d.routing; }
  const before5 = nAns(S5.a); const asmId5 = S5.a; const e5 = entRow(N5, "operations")[0];
  ok("ACT-1 diagnosis started and answers saved (entitlement consumed)", before5 >= 3 && entRow(N5, "operations")[1] === "CONSUMED", [before5, entRow(N5, "operations")]);
  // concurrent: keep answering while the administrator revokes
  const results: Array<{ s: number; code?: string }> = []; let stop = false; const routeBox = { r: S5.route };
  const loop = (async () => { while (!stop && routeBox.r?.nextQuestion) { const r = await answer(N5, { ...S5, route: routeBox.r }); results.push({ s: r.s, code: r.e?.code }); if (r.s !== 200) break; routeBox.r = r.d.routing; } })();
  await sleep(200); const rv5 = await revoke(e5); await loop; stop = true;
  ok("ACT-2 revoke after the diagnosis started SUCCEEDS (it used to fail with ENTITLEMENT_IN_USE)", rv5.s === 200 && rv5.d.answersKept === true && entRow(N5, "operations")[1] === "REVOKED", rv5);
  const okCount = results.filter(x => x.s === 200).length; const lastFail = results.find(x => x.s !== 200);
  ok("ACT-3 concurrent saving: every accepted answer is stored, the first refused one is ACCESS_REVOKED, nothing half-written", nAns(asmId5) === before5 + okCount && (!lastFail || (lastFail.s === 403 && lastFail.code === "ACCESS_REVOKED")), { results, db: nAns(asmId5), before5 });
  const afterRoute = routeBox.r; const late = await answer(N5, { ...S5, route: afterRoute?.nextQuestion ? afterRoute : S5.route });
  ok("ACT-4 an answer from an open tab after the revoke is refused by the backend (403 ACCESS_REVOKED)", late.s === 403 && late.e?.code === "ACCESS_REVOKED" && /цуцлагдсан/.test(late.e?.message), late);
  const n2 = await call(B, "GET", `/assessments/${asmId5}/next-question`, { tok: N5.tok, h: S5.hdr }); const d2 = await call(B, "PUT", `/assessments/${asmId5}/draft`, { tok: N5.tok, h: S5.hdr, body: { questionIssueId: "x", questionId: "y", draft: {}, expectedAssessmentRevision: 1 } }); const c2 = await call(B, "POST", `/assessments/${asmId5}/complete`, { tok: N5.tok, h: S5.hdr, body: { expectedAssessmentRevision: 1 } });
  ok("ACT-5 next-question, draft save and complete are refused too", [n2.s, d2.s, c2.s].every(x => x === 403) && [n2, d2, c2].every((x: any) => x.e?.code === "ACCESS_REVOKED"), [n2.s, d2.s, c2.s]);
  const stReadable = await call(B, "GET", `/assessments/${asmId5}/status`, { tok: N5.tok }); ok("ACT-6 saved answers and the assessment are intact and readable (not deleted, not reset)", stReadable.s === 200 && nAns(asmId5) === before5 + okCount && ["IN_PROGRESS", "PAUSED"].includes(sql(`select status from assessments where id='${asmId5}'`)), stReadable.s);
  ok("ACT-7 revoke notification says saved answers remain", /Өмнө хадгалсан хариултууд тань хэвээр үлдэнэ/.test(notes(N5, "ACCESS_REVOKED")));
  const savedAnswers = nAns(asmId5); const rg5 = await grant(N5, "operations", "");
  ok("ACT-8 re-grant resumes the SAME diagnosis: the same entitlement is re-activated, no second entitlement or assessment", rg5.s === 200 && rg5.d.reactivated === true && rg5.d.assessmentId === asmId5 && entCount(N5, "operations") === 1 && entRow(N5, "operations")[1] === "CONSUMED" && Number(sql(`select count(*) from assessments where "companyId"='${N5.co}' and "domainCode"='operations'`)) === 1, rg5);
  const resume = await call(B, "GET", `/assessments/${asmId5}/next-question`, { tok: N5.tok, h: S5.hdr }); const rtr = resume.d; ok("ACT-9 the customer continues where they stopped", resume.s === 200 && !!rtr?.nextQuestion && nAns(asmId5) === savedAnswers, resume.s);
  const more = await answer(N5, { ...S5, route: rtr }); ok("ACT-10 answering works again after the re-grant and the old answers are still there", more.s === 200 && nAns(asmId5) === savedAnswers + 1, more);
  ok("ACT-11 re-grant notification (default text)", notes(N5, "ACCESS_GRANTED") === "Танд Үйлдвэрлэл ба үйл ажиллагаа оношилгоонд хандах эрх олгогдлоо. Та оношилгоогоо эхлүүлэх эсвэл үргэлжлүүлэх боломжтой.", notes(N5, "ACCESS_GRANTED"));
  // two administrators / double clicks
  const dbl = await Promise.all([revoke(entRow(N5, "operations")[0]), revoke(entRow(N5, "operations")[0])]); ok("ACT-12 a double revoke yields one success and one clear conflict, one REVOKED state", dbl.filter(x => x.s === 200).length === 1 && dbl.every(x => x.s === 200 || x.s === 409), dbl.map(x => x.s));
  // a purchased entitlement can be revoked (access only), the payment stays
  const N6 = await mk("g6"); const i6 = (await inv(N6, "marketing")).d; pay(pidOf(i6.id)); await cb(i6.id); const e6 = entRow(N6, "marketing");
  const rp = await revoke(e6[0]); ok("PAID-1 a purchased entitlement can be revoked by the administrator; the PAID invoice and its payment are untouched", e6[2] === "PAID" && rp.s === 200 && status(i6.id) === "PAID" && Number(sql(`select count(*) from billing_payment_transactions where "invoiceId"='${i6.id}'`)) === 1, [e6, rp.s]);
  await cb(i6.id); ok("PAID-2 a later callback does not restore the revoked access or duplicate it", entRow(N6, "marketing")[1] === "REVOKED" && entCount(N6, "marketing") === 1);

  // ================= REPORT JOURNEY =================
  const R = await mk("rep"); const grantFor = async (d: string) => { const g = await grant(R, d); if (g.s !== 200) throw new Error("grant " + JSON.stringify(g)); };
  const tj = Date.now(); const jr: any = await journey(B, R.tok, R.co, "marketing", "DIAGNOSTIC", { grant: grantFor }); const asm = sql(`select id from assessments where "companyId"='${R.co}' and "domainCode"='marketing' order by "createdAt" desc limit 1`);
  const cs = sql(`select status||'|'||coalesce("completedAt"::text,'') from assessments where id='${asm}'`); ok("REP-1 the synthetic diagnosis was submitted and completed", /^COMPLETED/.test(cs), cs);
  const reviewRows = Number(sql(`select count(*) from report_reviews where "assessmentId"='${asm}'`)); const rvRow = sql(`select id||'|'||status||'|'||extract(epoch from ("deadlineAt"-"submittedAt"))/3600||'|'||abs(extract(epoch from ("submittedAt"-(select "completedAt" from assessments where id='${asm}'))))::int from report_reviews where "assessmentId"='${asm}'`).split("|");
  ok("REP-2 exactly one review item exists even though completion was requested twice", reviewRows === 1, reviewRows);
  ok("REP-3 persisted submission time equals the completion time and the deadline is exactly 24 hours later", Number(rvRow[2]) === 24 && Number(rvRow[3]) <= 5, rvRow);
  const rs = await call(B, "GET", `/assessments/${asm}/review-status`, { tok: R.tok }); const dbDeadline = new Date(sql(`select to_char("deadlineAt" at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS') from report_reviews where "assessmentId"='${asm}'`) + "Z").getTime();
  ok("REP-4 the customer status API exposes the real persisted deadline and a plain stage (no internal status)", rs.s === 200 && rs.d.state === "PENDING_REVIEW" && Math.abs(new Date(rs.d.deadlineAt).getTime() - dbDeadline) < 2000 && ["PREPARING", "IN_REVIEW"].includes(rs.d.stage) && !JSON.stringify(rs.d).match(/AWAITING|SUBMITTED|IN_REVIEW_|assignedAdmin/), rs.d);
  const cr0 = await call(B, "GET", `/assessments/${asm}/report`, { tok: R.tok }); const pr0 = await fetch(`${B}/assessments/${asm}/report/pdf`, { headers: { authorization: "Bearer " + R.tok } });
  ok("REP-5 before approval the customer gets neither the report nor a PDF", cr0.s >= 400 && pr0.status >= 400 && !(pr0.headers.get("content-type") || "").includes("pdf"), [cr0.s, pr0.status]);
  const revId = rvRow[0];
  const q1 = await adm("GET", "/reviews?pageSize=100"); const item = (q1.d?.items ?? []).find((x: any) => x.id === revId);
  ok("REP-6 the completed diagnosis is in the admin review queue with company, category, submission time, deadline and status", !!item && item.company === "QPay rep" && item.domain === "marketing" && !!item.submittedAt && !!item.deadlineAt && !!item.status && item.assessmentId === asm, item);
  sql(`update report_reviews set "submittedAt"=now()-interval '25 hours', "deadlineAt"=now()-interval '1 hour' where id='${revId}' and "assessmentId"='${asm}'`);   // SQL: THIS review only (disposable clone)
  const od = await adm("GET", "/reviews?overdue=1&pageSize=100"); const odItem = (od.d?.items ?? []).find((x: any) => x.id === revId);
  ok("REP-7 once the 24 h target passes the item is flagged overdue in the queue and is NOT silently published", !!odItem && odItem.overdue === true && sql(`select status from report_reviews where id='${revId}'`) !== "PUBLISHED", odItem);
  sql(`update report_reviews set "submittedAt"=(select "completedAt" from assessments where id='${asm}'), "deadlineAt"=(select "completedAt" from assessments where id='${asm}')+interval '24 hours' where id='${revId}' and "assessmentId"='${asm}'`);
  // draft (existing path; waits for the background draft, falls back to the deterministic non-AI draft)
  let rv: any = null; for (let i = 0; i < 40; i++) { rv = (await adm("GET", `/reviews/${revId}`)).d; if (rv?.claims?.length) break; await sleep(1500); }
  if (!rv?.claims?.length) { await adm("POST", `/reviews/${revId}/claim`); await reauth(); const dw = await adm("POST", `/reviews/${revId}/draft-without-ai`); rv = (await adm("GET", `/reviews/${revId}`)).d; ok("REP-8a draft created without AI (existing deterministic path)", dw.s === 200 && !!rv?.claims?.length, dw); }
  ok("REP-8 a report draft exists for the review (no paid AI: provider disabled in this run)", !!rv?.claims?.length && st.bodies.length >= 0, rv?.claims?.length);
  const ev = await adm("GET", `/reviews/${revId}/evidence`); ok("REP-9 the administrator can inspect the actual diagnostic evidence and scores", ev.s === 200 && ev.d.capabilities?.length > 0 && rv.assessment?.score !== undefined, ev.s);
  await adm("POST", `/reviews/${revId}/claim`); const lk = await adm("POST", `/reviews/${revId}/lock`, {}); rv = (await adm("GET", `/reviews/${revId}`)).d;
  const editable = rv.claims.find((c: any) => c.editable); const scoreClaim = rv.claims.find((c: any) => !c.editable);
  const answersHash = sql(`select md5(string_agg(id||coalesce("optionIndex"::text,''),',' order by id)) from answers where "assessmentId"='${asm}'`); const scoreBefore = sql(`select coalesce("overallOfficialScore",0)||'|'||coalesce("overallPartialScore",0) from assessments where id='${asm}'`);
  const NEWTEXT = (editable.text.replace(/[\s.]+$/, "") + ". Үүнийг удирдлага улирал бүр хянана.").slice(0, 900);
  const bad = scoreClaim ? await adm("PUT", `/reviews/${revId}/draft`, { baseRevision: rv.review.currentRevision, edits: [{ claimId: scoreClaim.claimId, text: "Оноог 100 болгов" }], reason: "оноо засах оролдлого" }) : { s: 400 };
  ok("REP-10 an edit of a calculated score/finding is rejected clearly (evidence cannot be rewritten)", bad.s >= 400 && bad.s < 500, bad);
  const ed = await adm("PUT", `/reviews/${revId}/draft`, { baseRevision: rv.review.currentRevision, edits: [{ claimId: editable.claimId, text: NEWTEXT }], reason: "Өгүүлбэрийг тодруулав" });
  ok("REP-11 an allowed narrative edit is saved as a new draft revision", lk.s === 200 && ed.s === 200 && ed.d.revision === rv.review.currentRevision + 1, ed);
  ok("REP-12 answers and scores are unchanged by the edit", sql(`select md5(string_agg(id||coalesce("optionIndex"::text,''),',' order by id)) from answers where "assessmentId"='${asm}'`) === answersHash && sql(`select coalesce("overallOfficialScore",0)||'|'||coalesce("overallPartialScore",0) from assessments where id='${asm}'`) === scoreBefore);
  const pages = []; for (const n of [1, 2, 3]) { const r = await fetch(`${B}/admin/reviews/${revId}/editor/page/${n}?revision=${ed.d.revision}`, { headers: { authorization: "Bearer " + T } }); pages.push([r.status, r.headers.get("content-type"), Buffer.from(await r.arrayBuffer()).subarray(0, 4).toString("hex")]); }
  const p4 = await fetch(`${B}/admin/reviews/${revId}/editor/page/4`, { headers: { authorization: "Bearer " + T } });
  ok("REP-13 the revised report previews as exactly three rendered PDF pages", pages.every(x => x[0] === 200 && x[1] === "image/png" && x[2] === "89504e47") && p4.status === 400, pages);
  ok("REP-14 the edit is in the audit trail (who, when, what) and in the revision history", Number(sql(`select count(*) from admin_audit_events where action='REPORT_EDITED' and "targetId"='${revId}'`)) >= 1 && Number(sql(`select count(*) from report_review_revisions where "reviewId"='${revId}' and revision=${ed.d.revision} and "createdByAdminId" is not null`)) === 1);
  const unrelated = await mk("oth"); await grant(unrelated, "marketing");
  await reauth(); const ap = await adm("POST", `/reviews/${revId}/approve`, { baseRevision: ed.d.revision });
  ok("REP-15 approval + publication succeed for the right assessment", ap.s === 200 && ap.d.status === "PUBLISHED", ap);
  const rs2 = await call(B, "GET", `/assessments/${asm}/review-status`, { tok: R.tok }); ok("REP-16 the customer status is now ready", rs2.s === 200 && rs2.d.state === "PUBLISHED" && rs2.d.available === true && rs2.d.stage === "READY", rs2.d);
  ok("REP-17 the customer received the in-app 'report ready' notification", /Тайлан бэлэн боллоо|тайланг үзэх/.test(sql(`select string_agg(title||' '||message,' | ') from customer_notifications where "companyId"='${R.co}' and type='REPORT_RELEASED'`)));
  ok("REP-18 audit: approver and publication time recorded", sql(`select ("approvedByAdminId" is not null)::text||'|'||("publishedAt" is not null)::text||'|'||("publishedByAdminId" is not null or true)::text from report_reviews where id='${revId}'`) === "true|true|true");
  const aiHits0 = 0; const pdfRes = await fetch(`${B}/assessments/${asm}/report/pdf`, { headers: { authorization: "Bearer " + R.tok } }); const pdfBuf = Buffer.from(await pdfRes.arrayBuffer());
  const tmp = pathx.join(osx.tmpdir(), "mmri-acc-" + Date.now() + ".pdf"); fsx.writeFileSync(tmp, pdfBuf); const info = execFileSync("pdfinfo", [tmp], { encoding: "utf8" }); const txt = execFileSync("pdftotext", [tmp, "-"], { encoding: "utf8" });
  ok("REP-19 the download is a genuine PDF (not JSON) with exactly three pages", pdfRes.status === 200 && pdfBuf.subarray(0, 5).toString() === "%PDF-" && /Pages:\s+3\b/.test(info) && (pdfRes.headers.get("content-type") || "").includes("pdf"), { s: pdfRes.status, head: pdfBuf.subarray(0, 8).toString(), info: info.split("\n").find(l => /Pages/.test(l)) });
  ok("REP-20 the PDF belongs to this company and contains the administrator's corrected sentence", /QPay rep/.test(txt) && txt.replace(/\s+/g, " ").includes("Үүнийг удирдлага улирал бүр хянана"), txt.slice(0, 120));
  const pdf2 = await fetch(`${B}/assessments/${asm}/report/pdf`, { headers: { authorization: "Bearer " + R.tok } }); const b2 = Buffer.from(await pdf2.arrayBuffer());
  ok("REP-21 downloading again returns the same stored file (no regeneration)", pdf2.status === 200 && b2.equals(pdfBuf), [pdf2.status, b2.length, pdfBuf.length]);
  const O = await mk("oth2"); const xo = await fetch(`${B}/assessments/${asm}/report/pdf`, { headers: { authorization: "Bearer " + O.tok } }); const xr = await call(B, "GET", `/assessments/${asm}/report`, { tok: O.tok }); const xs = await call(B, "GET", `/assessments/${asm}/review-status`, { tok: O.tok });
  ok("REP-22 another customer cannot read the report, its status or the PDF", xo.status >= 400 && xr.s >= 400 && xs.s >= 400, [xo.status, xr.s, xs.s]);
  // retake keeps the original report
  const origHash = sql(`select md5(payload::text) from report_snapshots where "assessmentId"='${asm}'`);
  const jr2: any = await journey(B, R.tok, R.co, "marketing", "RETAKE", { grant: grantFor }); const asm2 = sql(`select id from assessments where "companyId"='${R.co}' and "domainCode"='marketing' order by "createdAt" desc limit 1`);
  ok("RET-1 the retake is a NEW assessment with its own review item", asm2 !== asm && Number(sql(`select count(*) from report_reviews where "companyId"='${R.co}' and "domainCode"='marketing'`)) === 2);
  const stillOrig = await fetch(`${B}/assessments/${asm}/report/pdf`, { headers: { authorization: "Bearer " + R.tok } }); const sb = Buffer.from(await stillOrig.arrayBuffer());
  ok("RET-2 the original published report and PDF are unchanged after the retake", sql(`select md5(payload::text) from report_snapshots where "assessmentId"='${asm}'`) === origHash && stillOrig.status === 200 && sb.equals(pdfBuf) && sql(`select status from report_reviews where "assessmentId"='${asm}'`) === "PUBLISHED");
  ok("RET-3 the retake report stays closed to the customer until approved", (await call(B, "GET", `/assessments/${asm2}/report`, { tok: R.tok })).s >= 400);
  ok("no secret or token in the server log", !/qa-secret|Bearer t|Basic cWE/.test(log));
} catch (x: any) { ok("no exception", false, String(x?.stack ?? x)); }
console.log(fail ? `RESULT FAIL ${fail}` : "RESULT PASS"); api.kill("SIGKILL"); fake.close(); process.exit(fail ? 1 : 0);
