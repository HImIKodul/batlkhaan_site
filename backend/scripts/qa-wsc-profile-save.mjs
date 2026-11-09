// WS-C MMRI-28: profile save must reject what assessment start rejects. Targets private clone only (company of creds-qa.local).
// usage: API=http://127.0.0.1:4113 node scripts/qa-wsc-profile-save.mjs
import { readFileSync } from "node:fs";
const API = process.env.API ?? "http://127.0.0.1:4113";
const H = "/home/kirby/Downloads/MMRI_FUNCTIONAL_REPAIR/harness";
const creds = Object.fromEntries(readFileSync(`${H}/creds-qa.local`, "utf8").split("\n").filter(Boolean).map(l => l.split(/=(.*)/s).slice(0, 2)));
const call = async (method, path, body, tok) => { const r = await fetch(API + "/api/v1" + path, { method, headers: { "content-type": "application/json", origin: "http://127.0.0.1:4213", ...(tok ? { authorization: `Bearer ${tok}` } : {}) }, body: body ? JSON.stringify(body) : undefined }); return { s: r.status, d: await r.json().catch(() => ({})) }; };
const l = await call("POST", "/auth/login", { email: creds.email, password: creds.password }); const tok = l.d.data.accessToken;
const cs = (await call("GET", "/companies", null, tok)).d.data; const cid = cs?.[0]?.id;
const qs = (await call("GET", "/methodology/current/profile-questions", null, tok)).d; const list = qs.data;
if (!cid || list?.length !== 20) throw new Error("setup failed " + cid + " " + list?.length);
const valid = list.map(q => ({ questionId: q.id, optionIndexes: [1] }));
const multi = list.find(q => q.id === "P08"); const single = list.find(q => q.id === "P01");
const mut = (fn) => { const a = valid.map(x => ({ ...x, optionIndexes: [...x.optionIndexes] })); fn(a); return a; };
const cases = {
  "unknown question id": mut(a => { a[0].questionId = "ZZ99"; }),
  "option index too high": mut(a => { a[1].optionIndexes = [999]; }),
  "single-select with two options": single && mut(a => { const i = a.findIndex(x => x.questionId === single.id); a[i].optionIndexes = [1, 2]; }),
  "duplicate question replaces another": mut(a => { a[2].questionId = a[3].questionId; }),
};
let fail = 0;
for (const [name, rows] of Object.entries(cases)) { if (!rows) continue; const r = await call("PUT", `/companies/${cid}/profile-answers`, { profileAnswers: rows }, tok); const ok = r.s === 400; if (!ok) fail++; console.log(`${ok ? "PASS" : "FAIL"} ${name}: HTTP ${r.s} ${JSON.stringify(r.d.error ?? "").slice(0, 160)}`); }
const good = await call("PUT", `/companies/${cid}/profile-answers`, { profileAnswers: valid }, tok); const gok = good.s === 200; if (!gok) fail++; console.log(`${gok ? "PASS" : "FAIL"} valid profile saves: HTTP ${good.s}`);
if (multi) { const m = mut(a => { const i = a.findIndex(x => x.questionId === multi.id); a[i].optionIndexes = [1, 2]; }); const r = await call("PUT", `/companies/${cid}/profile-answers`, { profileAnswers: m }, tok); const ok = r.s === 200; if (!ok) fail++; console.log(`${ok ? "PASS" : "FAIL"} multi-select with two options saves: HTTP ${r.s}`); }
const back = await call("PUT", `/companies/${cid}/profile-answers`, { profileAnswers: valid }, tok);
process.exit(fail ? 1 : 0);
