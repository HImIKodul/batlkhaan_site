# BusinessMRI.mn: deployment guide for the deployment engineer

Authoritative sources: `backend/` and `frontend/` in this repository. Build releases ONLY from the packaged archive produced by `ops/build-release-package.sh` (clean `npm ci`, production compile, no development files, SHA-256 manifest). Deploy the archive, not this working tree. Details and every command: **`ops/release-assets/DEPLOYMENT_RUNBOOK.md`** (inside the release archive: `DEPLOYMENT_RUNBOOK.md`), plus `deploy/WINDOWS_SERVER_DEPLOYMENT.md`, `deploy/BACKUP_RESTORE.md`, `deploy/POSTGRES_LEAST_PRIVILEGE.md`.

## Target (to be confirmed on the real server)
Windows Server + IIS (ARR reverse proxy, `ops/release-assets/iis/web.config`) in front of the Node API on `127.0.0.1`; PostgreSQL 16 with TLS; Node 22.16.x / npm 10.9.x; Python 3 venv with `ops/release-assets/requirements-pdf.txt` for the PDF renderer. `/live /health /ready /metrics` must not be reachable through the public site.

## Install (summary)
1. Verify the archive: `sha256sum -c *.zip.sha256`, then `SHA256SUMS.txt` inside it. Run `node ops/preflight.mjs` (read-only checks) and `node ops/scan-secrets.mjs .`.
2. PostgreSQL: owner/migration role (only for migrations) and runtime role `mmri_runtime` (no superuser/createdb/createrole, DML only). URLs need `sslmode=require&sslaccept=strict&sslcert=<CA file>`; the API refuses localhost/127.0.0.1 or non-TLS database hosts in production.
3. `cd backend && npm ci --omit=dev && npx prisma generate`, create `backend/.env` from `ops/release-assets/backend.env.production.example` (all secrets random, 64+ chars, file ACL restricted to the service account).
4. Migrate: `npx prisma migrate deploy` (35 migrations; fingerprint in `deploy/MIGRATION_CHAIN_SHA256.txt`).
5. **Fresh database only:** `node ops/provision-methodologies.mjs` (needs `MMRI_PROVISION_FIVE_DOMAINS_OK=YES`, `MMRI_ENVIRONMENT=production`, `MMRI_PROVISION_ACTIVATE=YES`, `MMRI_PRODUCTION_PROMOTION_OK=YES`). Installs the five domains (61,440 questions). Skip when upgrading the existing database.
6. First administrator: `node dist/admin-cli.js bootstrap --email <owner> --role SUPER_ADMIN --password-stdin`.
7. Service: `ops/release-assets/windows/Install-Service.ps1` (NSSM, runs `node dist/api/server.js`), IIS site serving `frontend/dist` with the ARR rule for `/api/`.
8. Validate: `/ready` shows database ok; `MMRI_BASE_URL=http://127.0.0.1:4000 node ops/smoke-test.mjs`.

## Gmail (support@businessmri.mn)
Runbook section 6c. One-time OAuth consent with `backend/scripts/gmail-authorize.mjs` (Desktop OAuth client, scopes gmail.send + gmail.readonly), then `GMAIL_CLIENT_ID/SECRET/REFRESH_TOKEN/GMAIL_USER` only in the service `.env`; `MMRI_MAIL_PROVIDER=gmail`, `MMRI_SUPPORT_MAIL_PROVIDER=gmail`, `MMRI_CUSTOMER_NOTIFICATIONS=on`, `MMRI_CUSTOMER_EMAILS=on`. Never set `MMRI_MAIL_RECIPIENT_ALLOWLIST` in production. Registration uses a 6-digit code (page `#/verify-email`); password recovery uses a separate link (`#/reset-password`).

## Backups and rollback
Back up before every change: `ops/backup-all.sh` / `ops/release-assets/windows/Backup-Postgres.ps1` (PostgreSQL custom-format dump + report storage; verify with `ops/verify-backup-set.sh`; restore drill documented in `deploy/BACKUP_RESTORE.md`). Rollback: stop the service, `ops/rollback-application.sh` (previous release directory), restore the database dump only if a migration must be undone (migrations here are additive). Keep at least the last two release archives and their checksums off the server.

## Not in this repository (by design)
Credentials, OAuth tokens, API keys, `.env` files, database dumps, report storage, node_modules, build output, QA evidence. Before pushing run `node ops/scan-secrets.mjs .` and `git log -p -S<secret>` for any key that was ever shared.

## Open items before public launch
QPay live merchant credentials and a live-payment test; OpenAI AI scan (credits/decision; the local Hunspell checks work without it); diagnostic-confidence policy decision; plan-editing decision; wording-correction approvals; real-server TLS/firewall/IIS verification; off-machine backups; authorisation-matrix and capacity testing.
