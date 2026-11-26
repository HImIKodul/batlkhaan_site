# Administrator e-mail code (second factor) and Gmail repair

Status: implemented, **off by default**, tested on an isolated database with the mock mailbox only (21/21). **No real e-mail has been delivered** by this code.
Authenticator (TOTP) is unchanged and remains valid for every administrator; nothing here removes it.

## What it does
Password first. For an account listed in `MMRI_ADMIN_EMAIL_OTP_ACCOUNTS` (with `MMRI_ADMIN_EMAIL_OTP=on`) a login without an authenticator code mails a random 6-digit code to that
administrator's own account address (for the owner: the support mailbox). Single use, 5 minutes, 5 guesses per code, 60 s between codes, 5 codes per hour, only a salted hash is stored,
the code is never in a response, log or audit row, the mail is sent only after the password is correct, a failure counts toward the existing account lock, and every login creates a new session token.
Sensitive actions can be re-authorised the same way (`POST /admin/auth/email-code`, then `/admin/auth/reauth` with `emailCode`).
The screen shows the "Имэйлээр код авах" button only when the frontend is built with `VITE_ADMIN_EMAIL_CODE=on`.

## Order of operations (nothing before the previous step is proven)
1. **Repair Gmail sending** (below). Prove it: `node scripts/gmail-check.mjs --send-test-to <an inbox you can read>` and read the message.
2. Apply migration `20261126120000_admin_email_challenges` (additive: one new table). Confirm the runtime DB role can use it: `SELECT 1 FROM admin_email_challenges LIMIT 1;` as the runtime role.
   If it answers "permission denied", the default privileges from `deploy/POSTGRES_LEAST_PRIVILEGE.md` are missing: grant SELECT, INSERT, UPDATE, DELETE on the table to the runtime role.
3. The administrator account whose address is the owner support mailbox must exist (create it with the existing admin CLI; do not delete the current administrator yet).
4. Set `MMRI_ADMIN_EMAIL_OTP=on`, `MMRI_ADMIN_EMAIL_OTP_ACCOUNTS=<the owner support mailbox>`, restart the API, build the frontend with `VITE_ADMIN_EMAIL_CODE=on`.
5. Sign in with the e-mail code in one browser **while a second browser stays signed in with TOTP**. Try a re-authentication. Only then consider retiring the old administrator.
Recovery: remove the account from `MMRI_ADMIN_EMAIL_OTP_ACCOUNTS` (or set the flag off) and restart: the authenticator works again. Mail failure never blocks the TOTP path.

## Gmail `invalid_grant`
`invalid_grant` is Google refusing the stored refresh token. It could not be reproduced here (no Gmail credentials exist on the development machine). Run `scripts/gmail-check.mjs` on the server: it names the cause. Likely causes:
the OAuth consent screen is in *Testing* (refresh tokens die after 7 days; make the app **Internal** in the Workspace project or publish it), the token was revoked (password change, access removed), a client id/secret mismatch,
or Workspace API controls block the app. Fix = run `scripts/gmail-authorize.mjs` signed in as the owner support mailbox, store the new `GMAIL_REFRESH_TOKEN` in the service `.env`, restart.
