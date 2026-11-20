#!/usr/bin/env node
/* One-time Gmail authorization for BusinessMRI (run by the OWNER, interactively, on a machine with a browser).
   usage:  GMAIL_CLIENT_ID=... GMAIL_CLIENT_SECRET=... node scripts/gmail-authorize.mjs --out /secure/path/gmail.env
   - OAuth 2.0 "Desktop app" client from Google Cloud Console (Gmail API enabled). The mailbox password is NEVER requested.
   - Scopes: gmail.readonly (read the support inbox) + gmail.send (send mail and replies). Nothing is modified or deleted in Gmail.
   - Loopback redirect on 127.0.0.1 with PKCE and a random state. The refresh token is written to --out (mode 600) and is never printed or logged.
   - Afterwards the script calls Gmail once to show WHICH mailbox was authorised (address only). */
import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
const arg = n => { const i = process.argv.indexOf("--" + n); return i >= 0 ? process.argv[i + 1] : undefined; };
const clientId = process.env.GMAIL_CLIENT_ID, clientSecret = process.env.GMAIL_CLIENT_SECRET, out = arg("out");
if (!clientId || !clientSecret || !out) { console.error("Set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET in the environment and pass --out <file>."); process.exit(2); }
const SCOPES = ["https://www.googleapis.com/auth/gmail.readonly", "https://www.googleapis.com/auth/gmail.send"].join(" ");
const state = crypto.randomBytes(16).toString("hex"), verifier = crypto.randomBytes(48).toString("base64url"), challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://127.0.0.1");
  if (u.pathname !== "/oauth2callback") { res.writeHead(404).end(); return; }
  const done = (code, msg) => { res.writeHead(code, { "content-type": "text/plain; charset=utf-8" }).end(msg); setTimeout(() => process.exit(code === 200 ? 0 : 1), 300); };
  if (u.searchParams.get("state") !== state || !u.searchParams.get("code")) return done(400, "Authorization failed (state/code). Close this tab and run the script again.");
  try {
    const redirect = `http://127.0.0.1:${server.address().port}/oauth2callback`;
    const t = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ code: u.searchParams.get("code"), client_id: clientId, client_secret: clientSecret, redirect_uri: redirect, grant_type: "authorization_code", code_verifier: verifier }) });
    const j = await t.json();
    if (!t.ok || !j.refresh_token) return done(400, "Google did not return a refresh token. Remove the app from https://myaccount.google.com/permissions and run again (the consent screen must appear).");
    const p = await (await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", { headers: { authorization: "Bearer " + j.access_token } })).json();
    if (!p.emailAddress) return done(400, "Could not read the mailbox profile.");
    fs.writeFileSync(out, `GMAIL_CLIENT_ID=${clientId}\nGMAIL_CLIENT_SECRET=${clientSecret}\nGMAIL_REFRESH_TOKEN=${j.refresh_token}\nGMAIL_USER=${p.emailAddress}\n`, { mode: 0o600 });
    fs.chmodSync(out, 0o600);
    console.log(`Authorised mailbox: ${p.emailAddress}\nCredentials written to ${out} (mode 600). Keep that file outside the repository.`);
    done(200, `BusinessMRI is now authorised for ${p.emailAddress}. You can close this tab.`);
  } catch { done(500, "Authorization failed. Nothing was saved."); }
});
server.listen(0, "127.0.0.1", () => {
  const redirect = `http://127.0.0.1:${server.address().port}/oauth2callback`;
  const url = "https://accounts.google.com/o/oauth2/v2/auth?" + new URLSearchParams({ client_id: clientId, redirect_uri: redirect, response_type: "code", scope: SCOPES, access_type: "offline", prompt: "consent", state, code_challenge: challenge, code_challenge_method: "S256" });
  console.log("Open this address in a browser, sign in to the BUSINESS mailbox and approve:\n\n" + url + "\n\nWaiting for Google to redirect back to this machine...");
});
setTimeout(() => { console.error("Timed out after 10 minutes."); process.exit(1); }, 600_000).unref();
