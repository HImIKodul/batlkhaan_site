# BusinessMRI.mn — production deployment runbook

Sequence: **Preflight → Backup → Install → Configure → Migrate → Start → Validate → Switch traffic → Monitor → Rollback if required.**
This package has NOT been deployed anywhere. Each step is marked **[VERIFIED]** (executed in the staging rehearsal on Linux with synthetic data), **[NOT TESTED ON WINDOWS]** (command is the Windows equivalent of a verified step) or **[OWNER]** (needs a decision/credential).

## 0. Facts to confirm on the real server first  [OWNER]
Evidence in the project records (public headers, Nov 2026) says the live site runs on **Windows Server + IIS/ARR** with a Node API on 127.0.0.1:4000 and PostgreSQL on the same host. This was **not verified on the server**. Run `ops/windows/Diagnose-Production.ps1` and confirm: OS edition (Standard *Evaluation* expires), Node version, PostgreSQL version, how the API is currently supervised, free disk, firewall rules. If the server is Linux, use `deploy/assets/linux/*` instead of the IIS/NSSM files.

## 1. Prerequisites on the server
| Item | Requirement | Status |
|---|---|---|
| Node.js | **22.16.x** (the package declares `engines.node = 22.16.x`; the rehearsal ran 22.23.2 with an EBADENGINE warning only) | pin 22.16.x, rehearsal used a newer 22 |
| PostgreSQL | 16 (rehearsal used 16.x) with `ssl=on`, `listen_addresses='127.0.0.1'` | VERIFIED on Linux |
| Python 3 + packages | `pip install -r deploy/assets/requirements-pdf.txt` (reportlab 4.3.1, pillow 11.1.0, chardet 5.2.0), preferably in a venv; set `MMRI_PDF_PYTHON_PATH` | VERIFIED (venv) |
| Fonts | bundled in `backend/pdf_renderer/fonts` (Noto Sans, OFL); no system fonts needed | VERIFIED |
| Hunspell | executable on PATH or `MMRI_HUNSPELL_BIN`; dictionary bundled in `backend/resources/hunspell` (LPPL 1.3 notice included). Without it the AI-scan reports "not available" | Linux VERIFIED; Windows build of hunspell NOT TESTED |
| IIS | URL Rewrite + ARR, WebDAV module removed (`deploy/assets/iis/web.config`) | NOT TESTED ON WINDOWS |
| Service wrapper | NSSM (`deploy/assets/windows/Install-Service.ps1`) | NOT TESTED ON WINDOWS |
| Internet access during install | registry.npmjs.org, binaries.prisma.sh, pypi.org (Prisma downloads its query engine for the **server's** platform; the package does not ship a Windows engine) | VERIFIED on Linux |

## 2. Preflight (read-only)
1. `df -h` / `Get-PSDrive`: keep > 20 % free.
2. Unzip the package into a NEW folder, e.g. `C:\MMRI\releases\1.0.0-rc2\`. Verify the archive: `certutil -hashfile <zip> SHA256` equals the `.zip.sha256` file; then in the folder `SHA256SUMS.txt` must match (PowerShell: `Get-FileHash`; Linux: `sha256sum -c SHA256SUMS.txt`) **[VERIFIED: 0 mismatches of 317 files]**.
3. Database state, run as the DB owner against the production DB (read-only):
   `select count(*) from _prisma_migrations;` (record the number; 39 after the migration of this release) and
   `select status, count(*) from report_reviews group by 1;`
   **Known data issue:** the development `mmri` database holds 3 legacy reviews in `APPROVED` with `approvedRevision IS NULL` (approved on 2026-11-05, before approval binding existed). They can never publish, and the API logs `review_publish_retry_failed` for each at every maintenance cycle. Check the production DB for the same pattern: `select id from report_reviews where status='APPROVED' and ("approvedRevision" is null or "approvedNarrativeHash" is null);` Resolve each with an administrator (re-open and approve again, or return for correction) **before** go-live. **[OWNER]**
4. Confirm the owner has decided the items in section 12.

## 3. Backup (before anything changes)  [VERIFIED logic, Windows script NOT TESTED]
- Database: `ops/backup-postgres.sh` (Linux/Git-Bash) or `deploy/assets/windows/Backup-Postgres.ps1`: custom-format dump, `pg_restore --list` verification, SHA-256 sidecar.
- Report files: `ops/backup-report-storage.sh` (the folder in `MMRI_REPORT_STORAGE_DIR`; published PDFs are immutable evidence).
- Application: keep the previous release folder untouched (rollback = repoint, see section 9).
- **Restore test** into a scratch database before proceeding: `pg_restore -d <scratch> --no-owner <dump>` and compare table counts. **[VERIFIED: restore drill matched exactly]**
- Off-machine copy: a backup that stays on the server's disk does not survive hardware failure. See section 11 **[OWNER]**.

## 4. Install  [VERIFIED on Linux]
```
cd <release>\backend
npm ci --omit=dev
npx prisma generate            # generates the client + engine for THIS server's OS
python -m venv C:\MMRI\venv ; C:\MMRI\venv\Scripts\pip install -r ..\deploy\assets\requirements-pdf.txt
```
No compile step is needed: `backend/dist` is prebuilt (`npm run build:prod` = `prisma generate && tsc`, confirmed to match package.json). The frontend is prebuilt in `frontend/dist` with `.env.production` only. Do **not** copy a development `.env` into the frontend build.

## 5. Configure  [VERIFIED settings, Windows file ACLs NOT TESTED]
1. PostgreSQL: create two roles. **Owner/migration role** (used only for `prisma migrate deploy`) and **runtime role** `mmri_runtime` (no superuser/createdb/createrole):
   ```
   revoke all on database mmri from public; grant connect on database mmri to mmri_runtime;
   grant usage on schema public to mmri_runtime;
   grant select,insert,update,delete on all tables in schema public to mmri_runtime;
   grant usage,select on all sequences in schema public to mmri_runtime;
   alter default privileges for role <owner> in schema public grant select,insert,update,delete on tables to mmri_runtime;
   alter default privileges for role <owner> in schema public grant usage,select on sequences to mmri_runtime;
   ```
   **[VERIFIED: the packaged API ran the complete journey with exactly these runtime privileges]**
2. TLS on the same machine. The production guard rejects the literals `localhost`/`127.0.0.1`/`::1` and requires `sslaccept=strict`. Do **not** disable it. Add a hosts entry `127.0.0.1 db.businessmri.internal`, give PostgreSQL a server certificate whose SAN contains that name (private CA, file `pg-ca.crt`), and use:
   `DATABASE_URL=postgresql://mmri_runtime:<pw>@db.businessmri.internal:5432/mmri?schema=public&sslmode=require&sslaccept=strict&sslcert=<URL-encoded path to pg-ca.crt>`
   **Important (verified): `sslmode=verify-full` alone does NOT verify the certificate in Prisma 6.15; only `sslaccept=strict` does.** The configuration guard and `ops/preflight.mjs` now enforce this.
   Rehearsal used `127.0.0.2` (a loopback address not on the guard's literal list) as a stand-in for the hosts-file name; the mechanics (TLS, strict verification, least-privilege role) were identical.
3. Copy `deploy/assets/backend.env.production.example` to `backend\.env`, fill every `<...>`, restrict file permissions to the service account + Administrators. `API_HOST=127.0.0.1` is mandatory. `MIGRATION_DATABASE_URL` must **not** be in this file (the API refuses to start if it is).
4. Billing: `MMRI_BILLING_ENFORCEMENT=true`; provider `qpay` or `manual` (mock is rejected). **Paid commercial launch is BLOCKED until live QPay is verified** (or the owner explicitly chooses manual-confirmation mode / administrator-grant pilot).
5. **Notifications are OFF by default**: set `MMRI_CUSTOMER_NOTIFICATIONS=on` and `MMRI_CUSTOMER_EMAILS=on` (both in the template). The staging rehearsal first ran without them and produced zero customer notifications.
6. Mail: Gmail OAuth is a **hard dependency for customer registration** (verification e-mail) and password recovery. Without a working mail provider no new customer can register. See `deploy/GMAIL_SETUP_AND_LIVE_TEST_PLAN.md` if present, otherwise `backend/scripts/gmail-authorize.mjs`.

## 6. Migrate  [VERIFIED on a copy of the primary database]
In an operator shell only (never in the service environment):
```
set MIGRATION_DATABASE_URL=postgresql://<owner>:<pw>@db.businessmri.internal:5432/mmri?schema=public&sslmode=require&sslaccept=strict&sslcert=<path>
set DATABASE_URL=%MIGRATION_DATABASE_URL%
npx prisma migrate status
npx prisma migrate deploy
```
Rehearsal result: 31 → 35 migrations applied (`customer_notifications`, `mail_dispatch_marks`, `support_mail_inbox`, `review_edit_lock`); all counts identical afterwards (users, companies, assessments, invoices, entitlements, reviews, audit events); a second run reports "No pending migrations"; fingerprint `427f371e…758da` equals `deploy/MIGRATION_CHAIN_SHA256.txt`. The four migrations are additive (no DROP/RENAME/NOT NULL on existing columns), so the **previous** backend can still run on the migrated schema. Order: migrate first, then switch the code.

## 6b. Fresh installation only (EMPTY database)  [VERIFIED in the RC5 rehearsal from the extracted package]
Skip this section when upgrading the existing `mmri` database (it already holds the methodologies). For a new, empty database, after `prisma migrate deploy` and still in the operator shell:
```
set DATABASE_URL=%MIGRATION_DATABASE_URL%
set MMRI_ENVIRONMENT=production
set MMRI_PROVISION_FIVE_DOMAINS_OK=YES
set MMRI_PROVISION_ACTIVATE=YES
set MMRI_PRODUCTION_PROMOTION_OK=YES
node ops\provision-methodologies.mjs
```
It imports Marketing 3.0.3 and the four domain bundles shipped in `backend\methodology`, verifies structure, activates them and verifies ACTIVE. Nothing outside the package is read. Re-running is a no-op. Then continue with the first administrator (section 7).

## 6c. Gmail (support@businessmri.mn) and registration verification  [VERIFIED against real Gmail on the QA stack]
- Registration sends a **6-digit code** (10 minutes, single use, 60 s resend cooldown, 5 codes/hour, 5 wrong guesses) entered on `#/verify-email`. Password recovery is separate (link to `#/reset-password`). No migration is needed for this.
- One-time authorisation on a machine with a browser (OAuth client type "Desktop app", Gmail API enabled, scopes gmail.send + gmail.readonly): `set GMAIL_CLIENT_ID=... & set GMAIL_CLIENT_SECRET=... & node backend\scripts\gmail-authorize.mjs --out <file>` and sign in as support@businessmri.mn. The file holds `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`, `GMAIL_USER`.
- Put those four values in the service `.env` only (never in the repository or this package; Windows: remove inherited ACLs, grant the service account + Administrators). Set `MMRI_MAIL_PROVIDER=gmail`, `MMRI_SUPPORT_MAIL_PROVIDER=gmail`, `MMRI_CUSTOMER_NOTIFICATIONS=on`, `MMRI_CUSTOMER_EMAILS=on`, `MMRI_PUBLIC_APP_URL=https://businessmri.mn`, `MMRI_ADMIN_ALERT_EMAILS=<admin addresses>`. Do **not** set `MMRI_MAIL_RECIPIENT_ALLOWLIST` in production.
- Test once with the owner's own address (register, code, reset), then open the admin support inbox. A revoked/expired grant shows "Gmail authorisation expired"; a quota burst is reported separately as a temporary limit.

## 7. Start and validate  [VERIFIED on Linux; NSSM NOT TESTED]
1. First administrator (once): `node dist\admin-cli.js bootstrap --email <owner email> --role SUPER_ADMIN --password-stdin` (secret for the authenticator is shown once; status `PENDING_MFA` until the first login). Do **not** copy QA administrators into production.
2. Service: `deploy\assets\windows\Install-Service.ps1`, then `nssm start MMRI-API`. It runs `node dist\api\server.js` (compiled; no tsx, no dev flags). Graceful stop (SIGINT/SIGTERM) drains requests (5 s drain, 45 s force timeout) **[VERIFIED]**.
3. Health: `curl http://127.0.0.1:4000/live` → live; `/ready` → ready with `database: ok`; `/health`; `/metrics` needs `METRICS_TOKEN`. `MMRI_BASE_URL=http://127.0.0.1:4000 node ops\smoke-test.mjs` **[VERIFIED]**. `/live`, `/health`, `/ready`, `/metrics` must NOT be reachable through the public site (the IIS rule returns 404) **[VERIFIED with the staging proxy]**.
4. Smoke through the site (authorised account only; do not create real customer data): `GET /` serves the new asset hash; `GET /api/v1/auth/me` → 401; `PUT /api/v1/companies/x/profile-answers` unauthenticated → **401, not 405** (WebDAV removed); administrator MFA login; open the report queue.

## 8. Switch traffic and monitor  [OWNER executes; not done in this session]
Point the IIS site physical path at `<release>\frontend\dist` (atomic switch; keep the old path as rollback). Watch for 24 h: `/ready`, API error rate, report queue age (24 h target), failed mail marks, disk and memory (initial API RSS ≈ 2.3 GB, see the final report), backup success, certificate expiry (Let's Encrypt via win-acme; alert 14 days before).

## 9. Rollback
- Code/frontend only: repoint IIS to the previous `dist`, stop the service, start the previous release folder. Safe because the schema change is additive.
- Data: only if a migration or data change must be undone and the owner approves: stop API, `pg_restore` the section-3 dump into a **new** database, repoint `DATABASE_URL`, start the previous release. Never restore over the live database in place.

## 10. Failure recovery verified in the rehearsal
See the final report: SIGTERM drain + restart, hard kill (SIGKILL) + restart, and PostgreSQL stop/start with the API recovering by itself.

## 11. Backups and disaster recovery  [OWNER]
Nightly `pg_dump` (script above) + report-storage copy, 14-day local retention, **encrypted copy off the machine** (second physical disk is not enough; use another machine/NAS/provider). Estimate: the full development database is ≈ 2.2 GB on disk and ≈ 160 MB as a compressed dump; reports ≈ 8 MB per 100 published PDFs at ≈ 45 KB each. Monthly restore drill. Alert when a backup is missing or older than 26 h.

## 12. Owner decisions that gate go-live
1. Payment mode: live QPay (needs merchant credentials and a controlled test) / manual confirmation / administrator-grant pilot.
2. Gmail OAuth authorisation of the existing mailbox (and whether it is Google Workspace or consumer Gmail: restricted-scope verification differs).
3. OpenAI billing/credits, and whether AI narrative is **required** (`MMRI_AI_REPORT_REQUIRED=true` blocks reports while the provider is down).
4. Diagnostic-confidence policy (B3/B4/B5), see the decision sheet.
5. Twelve-month plan wording editing (`PLAN_EDITING_PROPOSAL.md`).
6. Production database arrangement (loopback + verified TLS as above) and off-machine backup target.
7. Handling of the legacy `APPROVED`-without-binding reviews found in the development database (check production first).
