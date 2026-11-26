#!/usr/bin/env node
/* Gmail sender diagnostic for BusinessMRI.mn (run by the OWNER / server operator, read-only by default).
   usage:  node scripts/gmail-check.mjs [--send-test-to someone@example.com]
   Reads GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN, GMAIL_USER from the environment (load the service .env first). Nothing is printed except
   the verdict: tokens, secrets and message bodies are never shown. Step 3 sends ONE short test message and only when --send-test-to is given. */
const need = ["GMAIL_CLIENT_ID", "GMAIL_CLIENT_SECRET", "GMAIL_REFRESH_TOKEN", "GMAIL_USER"];
const missing = need.filter(k => !(process.env[k] ?? "").trim());
if (missing.length) { console.log("FAIL missing settings: " + missing.join(", ")); process.exit(2); }
const arg = n => { const i = process.argv.indexOf("--" + n); return i >= 0 ? process.argv[i + 1] : undefined; };
const user = process.env.GMAIL_USER.trim().toLowerCase();
const tr = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, redirect: "error", signal: AbortSignal.timeout(10000),
  body: new URLSearchParams({ client_id: process.env.GMAIL_CLIENT_ID, client_secret: process.env.GMAIL_CLIENT_SECRET, refresh_token: process.env.GMAIL_REFRESH_TOKEN, grant_type: "refresh_token" }).toString() }).catch(() => null);
if (!tr) { console.log("FAIL 1/3 token endpoint unreachable (network, proxy or firewall on this server)"); process.exit(3); }
const tj = await tr.json().catch(() => ({}));
if (!tr.ok) {
  const e = String(tj.error ?? "unknown");
  console.log(`FAIL 1/3 Google refused the refresh token: ${e}${tj.error_description ? " (" + String(tj.error_description).replace(/[^\w .,:'-]/g, "").slice(0, 80) + ")" : ""}`);
  if (e === "invalid_grant") console.log("  Causes, in order of likelihood:\n  a) the Google Cloud OAuth consent screen is in 'Testing' status: refresh tokens then expire after 7 days -> set the app to 'Internal' (Workspace) or publish it, then re-authorize;\n  b) the token was revoked (the account's password was changed, access removed at myaccount.google.com/permissions, or an admin reset sign-in cookies);\n  c) the token was issued by a DIFFERENT OAuth client than GMAIL_CLIENT_ID/SECRET;\n  d) more than 100 refresh tokens were issued for this client+account (oldest are invalidated);\n  e) the Workspace admin restricted third-party API access (Admin console > Security > API controls).\n  Fix: run scripts/gmail-authorize.mjs as support@businessmri.mn, store the new token in the service .env, restart the API.");
  if (e === "invalid_client") console.log("  GMAIL_CLIENT_ID/GMAIL_CLIENT_SECRET do not match a client in Google Cloud (wrong project, deleted client or secret reset).");
  process.exit(4);
}
console.log("PASS 1/3 refresh token accepted");
const at = tj.access_token;
const pr = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", { headers: { authorization: "Bearer " + at }, redirect: "error", signal: AbortSignal.timeout(10000) }).catch(() => null);
if (pr?.ok) { const pj = await pr.json().catch(() => ({})); const who = String(pj.emailAddress ?? "").toLowerCase(); console.log(who === user ? `PASS 2/3 authorised mailbox is ${who}` : `FAIL 2/3 authorised mailbox is ${who || "unknown"}, but GMAIL_USER is ${user} (mail would be sent as the wrong sender)`); if (who !== user) process.exit(5); }
else console.log(`WARN 2/3 could not read the mailbox profile (HTTP ${pr?.status ?? "n/a"}); the token may carry only gmail.send. Sending can still work.`);
const to = arg("send-test-to");
if (!to) { console.log("SKIP 3/3 no test message sent (add --send-test-to <address> to send one)"); process.exit(0); }
if (!/^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(to)) { console.log("FAIL 3/3 invalid recipient"); process.exit(6); }
const raw = Buffer.from(`From: BusinessMRI.mn <${user}>\r\nTo: ${to}\r\nSubject: =?UTF-8?B?${Buffer.from("BusinessMRI.mn: имэйл шалгалт").toString("base64")}?=\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\nEnэ бол BusinessMRI.mn-ийн имэйл илгээлтийн автомат шалгалт. Хариу өгөх шаардлагагүй.\r\n`.replace("Enэ", "Энэ")).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const sr = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", { method: "POST", headers: { authorization: "Bearer " + at, "content-type": "application/json" }, body: JSON.stringify({ raw }), redirect: "error", signal: AbortSignal.timeout(10000) }).catch(() => null);
console.log(sr?.ok ? "PASS 3/3 Gmail accepted the test message (check the inbox: acceptance is not proof of arrival)" : `FAIL 3/3 send refused (HTTP ${sr?.status ?? "n/a"})`); process.exit(sr?.ok ? 0 : 7);
