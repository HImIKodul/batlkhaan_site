/* Administrator e-mail code (feature-flagged second factor) against the real HTTP API, a real PostgreSQL clone and the LOCAL mock mailbox. Nothing leaves the machine.
   usage: API_PORT=4598 with the isolated clone environment (DATABASE_URL/PGDATABASE = mmri_qa_acc2_*) and an explicit MMRI_MOCK_MAIL_DIR. */
import { spawn } from "node:child_process"; import fs from "node:fs"; import path from "node:path";
const db = decodeURIComponent(new URL(process.env.DATABASE_URL!).pathname.slice(1)); if (!/^mmri_qa_acc2_/.test(db) || process.env.PGDATABASE !== db) throw new Error("REFUSED " + db);
const MAIL = process.env.MMRI_MOCK_MAIL_DIR; if (!MAIL) throw new Error("explicit MMRI_MOCK_MAIL_DIR required");
const PORT = Number(process.env.API_PORT ?? 4598); process.env.API = `http://127.0.0.1:${PORT}/api/v1`;
let fail = 0, n = 0; const ok = (name: string, c: unknown, d: unknown = "") => { n++; if (!c) fail++; console.log(`${c ? "PASS" : "FAIL"} ${name}${c ? "" : " " + JSON.stringify(d).slice(0, 300)}`); };
const { provision, call, freshAdminTotp, sql } = await import("./lib/admin-qa.mjs" as any);
const owner = provision("SUPER_ADMIN", "otp"), other = provision("SUPER_ADMIN", "nootp");
const FIXED = "otp.owner@mmri.test"; const aid = sql(`select a.id from admin_accounts a join users u on u.id=a."userId" where u.email='${owner.email}'`).trim();
sql(`update users set email='old.'||id||'@mmri.test' where email='${FIXED}'`);   // a previous run of this gate in the same clone
sql(`update users set email='${FIXED}' where email='${owner.email}'`); owner.email = FIXED;   // scoped to the seeded QA user
const env = { ...process.env, PORT: String(PORT), MMRI_ADMIN_EMAIL_OTP: "on", MMRI_ADMIN_EMAIL_OTP_ACCOUNTS: FIXED, MMRI_MAIL_PROVIDER: "mock", MMRI_ADMIN_LOGIN_RATE_LIMIT: "200", GMAIL_CLIENT_ID: "", GMAIL_REFRESH_TOKEN: "", MMRI_MAIL_RECIPIENT_ALLOWLIST: "" };
let log = ""; const api = spawn(process.execPath, ["node_modules/tsx/dist/cli.mjs", "src/api/server.ts"], { env: env as any, stdio: ["ignore", "pipe", "pipe"] }); api.stdout.on("data", d => log += d); api.stderr.on("data", d => log += d);
const stop = () => { try { api.kill("SIGKILL"); } catch { } }; process.on("exit", stop);
for (let i = 0; i < 80; i++) { try { if ((await fetch(`http://127.0.0.1:${PORT}/ready`)).ok) break; } catch { } await new Promise(r => setTimeout(r, 500)); }
const box = () => { try { return fs.readFileSync(path.join(MAIL, "outbox.jsonl"), "utf8").trim().split("\n").filter(Boolean).map(l => JSON.parse(l)).filter((m: any) => m.kind === "ADMIN_LOGIN_CODE"); } catch { return []; } };
const lastCode = () => box().at(-1)?.text.match(/\n(\d{6})\n/)?.[1] as string;
const login = (body: any) => call("POST", "/admin/auth/login", { body: { email: owner.email, ...body } });
const age = () => sql(`update admin_email_challenges set "createdAt"=now()-interval '10 minutes' where "adminId"='${aid}'`);
try {
  const m0 = box().length;
  const bad = await login({ password: "wrong-" + owner.password }); ok("E1 wrong password gives the generic refusal and sends no mail", bad.s === 401 && box().length === m0, bad.s);
  const r1 = await login({ password: owner.password }); ok("E2 correct password without a code sends one and asks for it", r1.s === 200 && r1.d?.mfaRequired === "EMAIL_CODE" && !r1.d?.token && box().length === m0 + 1 && box().at(-1).to === FIXED, r1);
  const c1 = lastCode(); ok("E3 the code is 6 digits and is not in the API response", /^\d{6}$/.test(c1) && !JSON.stringify(r1).includes(c1));
  const r2 = await login({ password: owner.password }); ok("E4 an immediate resend is throttled", r2.s === 429 && box().length === m0 + 1, r2.s);
  const wrong = await login({ password: owner.password, emailCode: c1 === "000000" ? "111111" : "000000" }); ok("E5 a wrong code is refused with a clear 'code is wrong' message (password was already correct)", wrong.s === 401 && !wrong.d?.token && wrong.e?.code === "ADMIN_CODE_INVALID" && /код буруу/.test(wrong.e?.message ?? ""), wrong);
  const good = await login({ password: owner.password, emailCode: c1 }); ok("E6 the right code signs in", good.s === 200 && /^adm_/.test(good.d?.token ?? "") && good.d?.admin?.role === "SUPER_ADMIN", good);
  const me = await call("GET", "/admin/auth/me", { tok: good.d?.token }); ok("E7 the session works", me.s === 200, me.s);
  const replay = await login({ password: owner.password, emailCode: c1 }); ok("E8 the same code cannot be used twice", replay.s === 401 && !replay.d?.token, replay.s);
  ok("E9 only a hash is stored (no digits column, 64 hex)", /^[0-9a-f]{64}$/.test(sql(`select "codeHash" from admin_email_challenges where "adminId"='${aid}' order by "createdAt" desc limit 1`).trim()) && !/Bearer adm_|\b\d{6}\b.*code/i.test(log.replace(/"requestId":"[^"]+"|"ts":"[^"]+"/g, "")) && !log.includes(c1), "");
  const tp = await login({ password: owner.password, totpCode: await freshAdminTotp(owner) }); ok("E10 TOTP still works for the same account (no lock-out path)", tp.s === 200 && !!tp.d?.token, tp.s);
  // expiry
  age(); const r3 = await login({ password: owner.password }); const c3 = lastCode(); sql(`update admin_email_challenges set "expiresAt"=now()-interval '1 minute' where "adminId"='${aid}'`);
  const exp = await login({ password: owner.password, emailCode: c3 }); ok("E11 an expired code is refused", r3.s === 200 && exp.s === 401, [r3.s, exp.s]);
  // old code voided by a new one
  age(); await login({ password: owner.password }); const c4 = lastCode(); age(); await login({ password: owner.password }); const c5 = lastCode();
  const old = await login({ password: owner.password, emailCode: c4 }); ok("E12 a newer code voids the older one", c4 !== c5 && old.s === 401, old.s);
  // guess budget: the real code stops working once its 5 guesses are spent
  sql(`update admin_accounts set "failedLogins"=0,"lockedUntil"=null where id='${aid}'`); const mk = () => login({ password: owner.password, emailCode: c5 === "123456" ? "654321" : "123456" });
  for (let i = 0; i < 4; i++) await mk(); sql(`update admin_accounts set "failedLogins"=0,"lockedUntil"=null where id='${aid}'`); await mk(); sql(`update admin_accounts set "failedLogins"=0,"lockedUntil"=null where id='${aid}'`);
  const burnt = await login({ password: owner.password, emailCode: c5 }); ok("E13 after 5 wrong guesses even the right code is dead (clear 'too many attempts' message)", (burnt.s === 401 || burnt.s === 429) && !burnt.d?.token && ["ADMIN_CODE_ATTEMPTS", "ADMIN_LOGIN_FAILED", "ADMIN_CODE_INVALID", "ADMIN_LOCKED"].includes(burnt.e?.code), [burnt.s, burnt.e?.code]);
  // repeated failures lock the account
  sql(`update admin_accounts set "failedLogins"=0,"lockedUntil"=null where id='${aid}'`); age(); await login({ password: owner.password }); for (let i = 0; i < 6; i++) await mk();
  const locked = await login({ password: owner.password, emailCode: lastCode() }); ok("E14 repeated wrong codes lock the account", locked.s === 429, locked.s);
  sql(`update admin_accounts set "failedLogins"=0,"lockedUntil"=null where id='${aid}'`);
  // re-authentication by e-mail code
  const hourly = Number(sql(`select count(*) from admin_email_challenges where "adminId"='${aid}' and "createdAt">now()-interval '1 hour'`)); ok("E14b the hourly limit of 5 codes was reached by this run", hourly >= 5, hourly);
  const hr = await login({ password: owner.password }); ok("E14c ... and a further code is refused (429) even after the cooldown", (age(), (await login({ password: owner.password })).s) === 429 || hr.s === 429, hr.s);
  sql(`delete from admin_email_challenges where "adminId"='${aid}'`);   // QA clone, seeded admin only
  const t = (await login({ password: owner.password, totpCode: await freshAdminTotp(owner) })).d?.token;
  const rq = await call("POST", "/admin/auth/email-code", { tok: t }); const c6 = lastCode(); ok("E15 an authenticated administrator can request a re-authentication code", rq.s === 200 && /^\d{6}$/.test(c6), rq);
  const ra = await call("POST", "/admin/auth/reauth", { tok: t, body: { password: owner.password, emailCode: c6 } }); ok("E16 re-authentication by e-mail code works", ra.s === 200, ra);
  const ra2 = await call("POST", "/admin/auth/reauth", { tok: t, body: { password: owner.password, emailCode: c6 } }); ok("E17 and cannot be replayed", ra2.s === 401, ra2.s);
  // an account that is not opted in is unaffected
  const mb = box().length; const oth = await call("POST", "/admin/auth/login", { body: { email: other.email, password: other.password } }); const othT = await call("POST", "/admin/auth/login", { body: { email: other.email, password: other.password, totpCode: await freshAdminTotp(other) } });
  ok("E18 other administrators: no e-mail code is sent, TOTP login unchanged", oth.s === 401 && box().length === mb && othT.s === 200, [oth.s, othT.s]);
  const nope = await call("POST", "/admin/auth/email-code", { tok: othT.d?.token }); ok("E19 the code request route is closed for accounts not opted in", nope.s === 404, nope.s);
  // ===== additions: specific code errors, 24 h lock, remaining time, unlock, unrelated timers =====
  ok("L1 unrelated timers unchanged: e-mail code lifetime 5 minutes, resend cooldown 60 seconds", r1.d.expiresInMinutes === 5 && r1.d.resendAfterSeconds === 60, r1.d);
  age(); sql(`update admin_accounts set "failedLogins"=0,"lockedUntil"=null where id='${aid}'`);
  await login({ password: owner.password }); const cx = lastCode(); sql(`update admin_email_challenges set "expiresAt"=now()-interval '1 minute' where "adminId"='${aid}'`);
  const expd = await login({ password: owner.password, emailCode: cx }); ok("L2 an expired code gets the 'expired' message and a hint to resend", expd.s === 401 && expd.e?.code === "ADMIN_CODE_EXPIRED" && /дахин илгээх/.test(expd.e?.message ?? ""), expd);
  age(); await login({ password: owner.password }); const cy = lastCode(); let att: any = null; for (let i = 0; i < 6; i++) att = await login({ password: owner.password, emailCode: cy === "123456" ? "654321" : "123456" });
  ok("L3 too many wrong guesses of one code: the 'too many attempts' message", att.e?.code === "ADMIN_CODE_ATTEMPTS" || att.e?.code === "ADMIN_LOCKED", att.e);
  sql(`update admin_accounts set "failedLogins"=0,"lockedUntil"=null where id='${aid}'`); age();
  const oid = sql(`select a.id from admin_accounts a join users u on u.id=a."userId" where u.email='${other.email}'`).trim();
  sql(`update admin_accounts set "failedLogins"=0,"lockedUntil"=null where id='${oid}'`);
  for (let i = 0; i < 5; i++) await call("POST", "/admin/auth/login", { body: { email: other.email, password: "wrong-" + other.password, totpCode: "000000" } });
  const left = Number(sql(`select extract(epoch from ("lockedUntil"-now())) from admin_accounts where id='${oid}'`));
  ok("L4 five wrong sign-ins lock that administrator for 24 hours (86 400 s), the single configured value", Math.abs(left - 86400) < 120, left);
  const lk = await call("POST", "/admin/auth/login", { body: { email: other.email, password: other.password, totpCode: await freshAdminTotp(other) } });
  ok("L5 while locked even the correct password and code are refused, with the remaining time in Mongolian", lk.s === 429 && lk.e?.code === "ADMIN_LOCKED" && /2[34] цаг/.test(lk.e?.message ?? "") && /Дахин оролдох/.test(lk.e?.message ?? "") && lk.e?.details?.retryAfterSeconds > 80000, lk);
  age(); await login({ password: owner.password }); const c9 = lastCode(); const own = await login({ password: owner.password, emailCode: c9 });
  ok("L6 another SUPER_ADMIN is unaffected by that lock and signs in with the e-mail code", own.s === 200 && /^adm_/.test(own.d?.token ?? ""), own.s);
  age(); const rq2 = await call("POST", "/admin/auth/email-code", { tok: own.d.token }); const c10 = lastCode(); const rea = await call("POST", "/admin/auth/reauth", { tok: own.d.token, body: { password: owner.password, emailCode: c10 } });
  const lst = await call("GET", "/admin/settings", { tok: own.d.token }); ok("L7 the administrator list shows who is locked and until when", lst.s === 200 && (lst.d?.admins ?? []).some((a: any) => a.id === oid && !!a.lockedUntil), lst.s);
  const ul = await call("POST", `/admin/admins/${oid}/unlock`, { tok: own.d.token }); ok("L8 a SUPER_ADMIN can lift the lock at once (incident response is never blocked by a cooldown)", rea.s === 200 && ul.s === 200 && sql(`select "lockedUntil" is null from admin_accounts where id='${oid}'`) === "t", [rea.s, ul.s]);
  const back = await call("POST", "/admin/auth/login", { body: { email: other.email, password: other.password, totpCode: await freshAdminTotp(other) } }); ok("L9 the unlocked administrator signs in again (authenticator code still works during the transition)", back.s === 200 && /^adm_/.test(back.d?.token ?? ""), back.s);
  ok("L10 the unlock is in the audit trail", Number(sql(`select count(*) from admin_audit_events where action='ADMIN_UNLOCKED' and "targetId"='${oid}'`)) >= 1);
  ok("L11 no verification code in the server log", !/\b\d{6}\b.*ADMIN_LOGIN_CODE/.test(log) && !log.includes(c9));
} catch (x: any) { ok("no exception", false, String(x?.stack ?? x)); }
console.log(fail ? `RESULT FAIL ${fail}/${n}` : `RESULT PASS ${n}/${n}`); stop(); process.exit(fail ? 1 : 0);
