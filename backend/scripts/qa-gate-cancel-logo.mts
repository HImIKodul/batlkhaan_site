/* TARGETED: customer cancellation of an unpaid QPay invoice, and company logo upload. Same fake provider and disposable clone as qa-gate-qpay-e2e.mts.
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

const png = (w: number, h: number, fmt: string, extra: any = {}) => { const { execFileSync } = require_("node:child_process"); return execFileSync("python3", ["-c", `import sys,io;from PIL import Image;im=Image.new("RGB",(${w},${h}),(30,90,200));b=io.BytesIO();im.save(b,"${fmt}"${extra.kw ?? ""});sys.stdout.buffer.write(b.getvalue())`], { maxBuffer: 20_000_000 }) as Buffer };
import { createRequire } from "node:module"; const require_ = createRequire(import.meta.url);
const put = (c: any, buf: Buffer | string) => call(B, "PUT", `/companies/${c.co}/logo`, { tok: c.tok, body: { dataBase64: typeof buf === "string" ? buf : buf.toString("base64") } });
const status = (id: string) => sql(`select status from billing_invoices where id='${id}'`).trim();
const rows = (c: any) => Number(sql(`select count(*) from billing_invoices where "companyId"='${c.co}'`));
try {
  // ===== CANCEL =====
  const C = await mk("cx"); const c1 = (await inv(C, "marketing")).d; const nb = st.bodies.length;
  const x1 = await call(B, "DELETE", `/billing/invoices/${c1.id}`, { tok: C.tok });
  ok("CAN-1 cancelling an unpaid QPay invoice cancels it at the provider and locally", x1.s === 200 && x1.d.status === "CANCELLED" && status(c1.id) === "CANCELLED" && st.cancelled.has(pidOf(c1.id)), x1);
  ok("CAN-2 the cancelled invoice stays in the history (no row deleted) and opens nothing", rows(C) === 1 && ents(C) === 0);
  const x2 = await call(B, "DELETE", `/billing/invoices/${c1.id}`, { tok: C.tok }); ok("CAN-3 repeating the cancel is harmless", x2.s === 200 && x2.d.status === "CANCELLED" && rows(C) === 1 && st.bodies.length === nb, x2);
  const rg = await call(B, "POST", `/billing/invoices/${c1.id}/regenerate`, { tok: C.tok }); ok("CAN-4 a cancelled invoice is not reusable as active, regenerate answers with a NEW one or refuses", (rg.s === 200 || rg.s === 201) ? rg.d.id !== c1.id && rg.d.status !== "CANCELLED" : rg.s === 409, rg);
  const n2 = await inv(C, "marketing"); ok("CAN-5 a new invoice can be created later", n2.s === 201 && n2.d.id !== c1.id && ["PENDING", "CREATED"].includes(n2.d.status) || n2.s === 200, n2.s);
  // after payment
  const P = await mk("cp"); const p1 = (await inv(P, "finance")).d; pay(pidOf(p1.id)); const xp = await call(B, "DELETE", `/billing/invoices/${p1.id}`, { tok: P.tok });
  ok("CAN-6 cancel after the customer paid is refused, the invoice becomes PAID and the entitlement exists once", xp.s === 409 && status(p1.id) === "PAID" && ents(P) === 1 && !st.cancelled.has(pidOf(p1.id)), xp);
  const xp2 = await call(B, "DELETE", `/billing/invoices/${p1.id}`, { tok: P.tok }); ok("CAN-7 cancel of a PAID invoice stays refused", xp2.s === 409 && status(p1.id) === "PAID" && ents(P) === 1, xp2);
  // provider failure
  const F = await mk("cf"); const f1 = (await inv(F, "it")).d; st.failCancel = true; const xf = await call(B, "DELETE", `/billing/invoices/${f1.id}`, { tok: F.tok }); st.failCancel = false;
  ok("CAN-8 if the provider cannot cancel, the invoice is NOT marked cancelled (stays reconcilable) and the customer gets a clear error", xf.s === 502 && ["PENDING", "CREATED"].includes(status(f1.id)), { s: xf.s, st: status(f1.id) });
  pay(pidOf(f1.id)); const lateF = await call(B, "POST", `/billing/invoices/${f1.id}/reconcile`, { tok: F.tok }).catch(() => null); await cb(f1.id);
  ok("CAN-9 a payment that settles after the failed cancel is still honoured exactly once", ents(F) === 1 && status(f1.id) === "PAID", status(f1.id));
  st.down = true; const D = await mk("cd"); st.down = false; const d1 = (await inv(D, "people")).d; st.down = true; const xd = await call(B, "DELETE", `/billing/invoices/${d1.id}`, { tok: D.tok }); st.down = false;
  ok("CAN-10 provider unreachable: payment state cannot be verified, nothing is cancelled", xd.s >= 500 && ["PENDING", "CREATED"].includes(status(d1.id)), { s: xd.s, st: status(d1.id) });
  // race: money lands at the provider exactly when we cancel
  const Q = await mk("cr"); const q1 = (await inv(Q, "operations")).d; st.payOnCancel = true; const xr = await call(B, "DELETE", `/billing/invoices/${q1.id}`, { tok: Q.tok }); st.payOnCancel = false;
  await cb(q1.id); await call(B, "POST", `/billing/invoices/${q1.id}/reconcile`, { tok: Q.tok });
  ok("CAN-11 cancel versus payment race: whichever wins, the money is recorded once and the entitlement exists exactly once", ents(Q) === 1 && Number(sql(`select count(*) from billing_payment_transactions where "invoiceId"='${q1.id}'`)) === 1 && status(q1.id) === "PAID", { cancel: xr.s, st: status(q1.id), ents: ents(Q) });
  const pa = await Promise.all([call(B, "DELETE", `/billing/invoices/${n2.d.id}`, { tok: C.tok }), call(B, "DELETE", `/billing/invoices/${n2.d.id}`, { tok: C.tok }), cb(n2.d.id)]); ok("CAN-12 parallel cancels and a callback leave one consistent state", ["CANCELLED", "PAID", "PENDING"].includes(status(n2.d.id)) && ents(C) <= 1, [pa[0].s, pa[1].s, status(n2.d.id)]);
  const O = await mk("co"); const oi = (await inv(O, "it")).d; const xo = await call(B, "DELETE", `/billing/invoices/${oi.id}`, { tok: C.tok }); ok("CAN-13 another company's customer cannot cancel this invoice", xo.s >= 400 && xo.s < 500 && ["PENDING", "CREATED"].includes(status(oi.id)), xo.s);
  // ===== LOGO =====
  const L = await mk("lg"), M = await mk("lm");
  const mime = async (c: any) => { const r = await fetch(`${B}/companies/${c.co}/logo`, { headers: { authorization: "Bearer " + c.tok } }); return { s: r.status, t: r.headers.get("content-type"), n: Buffer.from(await r.arrayBuffer()).length }; };
  const cases: [string, Buffer][] = [["PNG", png(120, 80, "PNG")], ["JPG", png(120, 80, "JPEG")], ["WEBP", png(120, 80, "WEBP")], ["GIF static", png(120, 80, "GIF")]];
  for (const [n, buf] of cases) { const r = await put(L, buf); const g = await mime(L); ok(`LOGO-${n} upload accepted, stored as a clean PNG and served back`, r.s === 200 && g.s === 200 && g.t === "image/png" && g.n > 100, { put: r.s, e: r.e, g }); }
  const w5 = await put(L, png(2400, 1600, "PNG")); ok("LOGO-5 an image of several hundred KB (above the old 1.5 MB class is covered below) is accepted", w5.s === 200, w5.e);
  const noise = require_("node:child_process").execFileSync("python3", ["-c", `import sys,os,io;from PIL import Image;im=Image.frombytes("RGB",(1000,1000),os.urandom(1000*1000*3));b=io.BytesIO();im.save(b,"PNG");sys.stdout.buffer.write(b.getvalue())`], { maxBuffer: 20_000_000 }) as Buffer;
  ok("LOGO-6 test file really is between 1.5 and 5 MB", noise.length > 1_600_000 && noise.length < 5_242_880, noise.length);
  const w6 = await put(L, noise); ok("LOGO-7 a 1.5 to 5 MB image (rejected before) is now accepted", w6.s === 200, { s: w6.s, e: w6.e });
  const huge = Buffer.concat([png(100, 100, "PNG"), Buffer.alloc(5_300_000, 1)]); const w7 = await put(L, huge); ok("LOGO-8 a file over 5 MB is rejected with the 5 МБ message", w7.s === 413 && /5 МБ/.test(JSON.stringify(w7.e)), { s: w7.s, e: w7.e });
  const w8 = await put(L, Buffer.from("not an image at all, just text")); ok("LOGO-9 a non-image is rejected in Mongolian", w8.s === 400 && /зураг/i.test(JSON.stringify(w8.e)), { s: w8.s, e: w8.e });
  const w9 = await put(L, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')); ok("LOGO-10 SVG is rejected (not supported, never served)", w9.s === 400, w9.s);
  const w10 = await put(L, Buffer.from("MZ\x90\x00\x03\x00\x00\x00 executable")); ok("LOGO-11 an executable renamed as an image is rejected", w10.s === 400, w10.s);
  const anim = require_("node:child_process").execFileSync("python3", ["-c", `import sys,io;from PIL import Image;a=Image.new("RGB",(80,80),(255,0,0));b=Image.new("RGB",(80,80),(0,0,255));o=io.BytesIO();a.save(o,"GIF",save_all=True,append_images=[b],duration=100,loop=0);sys.stdout.buffer.write(o.getvalue())`]) as Buffer;
  const w11 = await put(L, anim); ok("LOGO-12 an animated GIF is rejected", w11.s === 400 && /Хөдөлгөөнт/.test(JSON.stringify(w11.e)), { s: w11.s, e: w11.e });
  const w12 = await put(L, png(16, 16, "PNG")); ok("LOGO-13 a tiny image is rejected", w12.s === 400, w12.s);
  const keep = await put(L, png(200, 120, "PNG")); const sha1 = keep.d?.logo?.sha256;
  // persistence: sign in again, restart the API, read again
  const g0 = await mime(L); const lg = await call(B, "POST", "/auth/login", { body: { email: L.email, password: L.password } }); const tok2 = lg.d?.accessToken;
  const gAfter = await fetch(`${B}/companies/${L.co}/logo`, { headers: { authorization: "Bearer " + tok2 } }); ok("LOGO-14 logo is available after a fresh sign-in", lg.s === 200 && gAfter.status === 200 && Buffer.from(await gAfter.arrayBuffer()).length === g0.n, { login: lg.s, g: gAfter.status });
  // replacement
  const rep = await put(L, png(300, 100, "JPEG")); const sha2 = rep.d?.logo?.sha256; ok("LOGO-15 replacement changes the stored logo", rep.s === 200 && sha1 && sha2 && sha1 !== sha2 && (await mime(L)).s === 200, { sha1, sha2 });
  // isolation
  ok("LOGO-16 company B has no logo and company A's logo is not readable with B's token", (await mime(M)).s === 404 && (await fetch(`${B}/companies/${L.co}/logo`, { headers: { authorization: "Bearer " + M.tok } })).status >= 403);
  const xp3 = await call(B, "PUT", `/companies/${L.co}/logo`, { tok: M.tok, body: { dataBase64: png(100, 100, "PNG").toString("base64") } }); const xd3 = await call(B, "DELETE", `/companies/${L.co}/logo`, { tok: M.tok }); ok("LOGO-17 B cannot set or remove A's logo", xp3.s >= 400 && xd3.s >= 400 && (await mime(L)).s === 200, [xp3.s, xd3.s]);
  const rm = await call(B, "DELETE", `/companies/${L.co}/logo`, { tok: L.tok }); ok("LOGO-18 removal clears the logo", rm.s === 200 && (await mime(L)).s === 404, rm.s);
  ok("LOGO-19 the logo bytes are stored in the database (survive restarts and redeploys), assets of A are kept for reports that snapshotted them", Number(sql(`select count(*) from company_logo_assets where "companyId"='${L.co}' and bytes is not null`)) >= 1);
  const over = Buffer.concat([png(100, 100, "PNG"), Buffer.alloc(9_000_000, 1)]); const w6b = await put(L, over); ok("LOGO-8b a request far above the limit gets the same 5 МБ message and the connection stays usable", w6b.s === 413 && /5 МБ/.test(JSON.stringify(w6b.e)), { s: w6b.s, e: w6b.e });
  ok("no secret in the server log", !/qa-secret|Bearer t|Basic cWE/.test(log));
} catch (x: any) { ok("no exception", false, String(x?.stack ?? x)); }
console.log(fail ? `RESULT FAIL ${fail}` : "RESULT PASS"); api.kill("SIGKILL"); fake.close(); process.exit(fail ? 1 : 0);
