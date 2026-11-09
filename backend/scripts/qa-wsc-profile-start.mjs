// WS-C MMRI-28 end-to-end: a profile that passes save also starts an assessment; invalid start input returns 4xx not 5xx.
// Needs an ACTIVE RETAKE entitlement for domain finance in the private clone (test setup). usage: node scripts/qa-wsc-profile-start.mjs
import { readFileSync } from "node:fs";
const API = process.env.API ?? "http://127.0.0.1:4113"; const H = "/home/kirby/Downloads/MMRI_FUNCTIONAL_REPAIR/harness";
const creds = Object.fromEntries(readFileSync(`${H}/creds-qa.local`, "utf8").split("\n").filter(Boolean).map(l => l.split(/=(.*)/s).slice(0, 2)));
const call = async (method, path, body, tok, extra = {}) => { const r = await fetch(API + "/api/v1" + path, { method, headers: { "content-type": "application/json", origin: "http://127.0.0.1:4213", ...(tok ? { authorization: `Bearer ${tok}` } : {}), ...extra }, body: body ? JSON.stringify(body) : undefined }); return { s: r.status, d: await r.json().catch(() => ({})) }; };
const tok = (await call("POST", "/auth/login", { email: creds.email, password: creds.password })).d.data.accessToken;
const cid = (await call("GET", "/companies", null, tok)).d.data[0].id;
const company = (await call("GET", `/companies/${cid}`, null, tok)).d.data;
const saved = company.profile.assessmentProfileAnswers;
const a = await call("POST", `/companies/${cid}/assessments`, { domainCode: "finance" }, tok); console.log("create", a.s);
const id = a.d.data.id;
const bad = await call("POST", `/assessments/${id}/start`, { mode: "QUICK", profileAnswers: saved.slice(1) }, tok, { "x-mmri-writer-id": "writer-wsc-start-1" });
console.log("start with incomplete profile -> HTTP", bad.s, JSON.stringify(bad.d.error ?? "").slice(0, 140));
const good = await call("POST", `/assessments/${id}/start`, { mode: "QUICK", profileAnswers: saved }, tok, { "x-mmri-writer-id": "writer-wsc-start-1" });
console.log("start with saved profile -> HTTP", good.s);
process.exit(good.s === 200 && bad.s >= 400 && bad.s < 500 ? 0 : 1);
