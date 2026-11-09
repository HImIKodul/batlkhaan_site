// WS-C MMRI-20: concurrent resume must yield exactly one winner. Targets private clone mmri_ws_c only.
// usage: API=http://127.0.0.1:4113 node scripts/qa-wsc-lease-race.mjs [rounds]
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
const API = process.env.API ?? "http://127.0.0.1:4113";
const H = "/home/kirby/Downloads/MMRI_FUNCTIONAL_REPAIR/harness";
const AID = process.env.ASSESSMENT_ID ?? "cmw6jq4c1005ngaos4kmqag8w";
const creds = Object.fromEntries(readFileSync(`${H}/creds-qa.local`, "utf8").split("\n").filter(Boolean).map(l => l.split(/=(.*)/s).slice(0, 2)));
const sql = q => execFileSync(`${H}/psql.sh`, ["c", "-At", "-c", q], { encoding: "utf8" }).trim();
const call = async (method, path, body, headers = {}) => {
  const r = await fetch(API + "/api/v1" + path, { method, headers: { "content-type": "application/json", origin: "http://127.0.0.1:4213", ...headers }, body: body ? JSON.stringify(body) : undefined });
  return { s: r.status, d: await r.json().catch(() => ({})) };
};
const login = await call("POST", "/auth/login", { email: creds.email, password: creds.password });
const tok = login.d.accessToken ?? login.d.data?.accessToken; if (!tok) throw new Error("login failed " + JSON.stringify(login));
const rounds = Number(process.argv[2] ?? 30);
let bad = 0, both = 0, none = 0;
const EXPIRED = process.env.MODE === "expired"; // claim an IN_PROGRESS assessment whose previous writer lease expired
for (let i = 0; i < rounds; i++) {
  if (EXPIRED) sql(`update assessments set status='IN_PROGRESS',"pausedAt"=null,"resumeState"=null,"activeWriterLeaseId"='old-writer-expired',"writerLeaseExpiresAt"=now()-interval '1 minute',"assessmentRevision"=7 where id='${AID}'`);
  else sql(`update assessments set status='PAUSED',"pausedAt"=now(),"resumeState"=null,"activeWriterLeaseId"=null,"writerLeaseExpiresAt"=null,"assessmentRevision"=7 where id='${AID}'`);
  const mk = w => call("POST", `/assessments/${AID}/resume`, { expectedAssessmentRevision: 7 }, { authorization: `Bearer ${tok}`, "x-mmri-writer-id": w });
  const [a, b] = await Promise.all([mk("writer-aaaaaaaa-" + i), mk("writer-bbbbbbbb-" + i)]);
  const wins = [a, b].filter(x => x.s === 200).length;
  const holder = sql(`select "activeWriterLeaseId" from assessments where id='${AID}'`);
  if (wins === 2) both++; else if (wins === 0) none++;
  if (wins !== 1) { bad++; console.log(`round ${i}: statuses ${a.s}/${b.s} holder=${holder}`); }
}
console.log(`rounds=${rounds} bothWon=${both} noneWon=${none} notExactlyOne=${bad}`);
process.exit(bad ? 1 : 0);
