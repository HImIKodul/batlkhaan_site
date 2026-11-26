# BusinessMRI.mn — final release notes (account-2 release candidate)

Matching frontend + backend built from ONE commit (see BUILD_INFO.json `gitHead`). It is **not deployed**; nothing here has been run on the production server.

## What changed since the 300d387 package
- Admin customer-access grants and revokes (customer diagnosis entitlements only; administrator roles are never touched), usable dialogs on short screens, open manual invoice cancelled only by naming it.
- Billing: an open invoice of another provider (an old MANUAL invoice after the switch to QPAY) is no longer re-presented or duplicated (409 `OTHER_PROVIDER_INVOICE_OPEN`); an administrator can still confirm a paid MANUAL invoice while in QPAY mode (exact amount + bank reference + audit).
- Admin e-mail verification code, **disabled by default** (`MMRI_ADMIN_EMAIL_OTP=off`), authenticator login unchanged. See `deploy/ADMIN_EMAIL_CODE.md`.
- `backend/scripts/gmail-check.mjs`: read-only Gmail diagnostic.
- Colored QPay QR rendering and the black-and-white fallback are unchanged. The approval list is still empty, so production shows black-and-white codes until each color is approved after real bank-app scans.

## Database migration (one, additive)
`20261126120000_admin_email_challenges` creates the table `admin_email_challenges`. Nothing existing is altered or dropped. Chain digest: `deploy/MIGRATION_CHAIN_SHA256.txt`.
- Apply with the migration role only (`prisma migrate deploy`), after a verified backup. Do not run first-time provisioning again.
- Afterwards, as the runtime role: `SELECT 1 FROM admin_email_challenges LIMIT 1;` must succeed. If it says "permission denied", grant SELECT/INSERT/UPDATE/DELETE on that table to the runtime role (see `POSTGRES_LEAST_PRIVILEGE.md`; the default-privileges statement normally covers it).
- Rollback of the migration (only if the owner approves): `migrations/20261126120000_admin_email_challenges/rollback.sql`.

## Windows deployment (outline; the full procedure is `DEPLOYMENT_RUNBOOK.md` and `deploy/WINDOWS_SERVER_DEPLOYMENT.md`; the PowerShell scripts in `ops/windows` and `deploy/assets/windows` were NOT yet tested on Windows)
1. Read-only inspection first: `ops/windows/Step1-InspectBackupRestore.ps1` / `Diagnose-Production.ps1`. Record the running backend version, the migration table state, disk, memory, PostgreSQL version/settings.
2. Verified backup AND an isolated restore test (new database name, never over the live one).
3. Unzip the package to a NEW release folder next to the current one; keep the current folder untouched.
4. Copy the existing service `.env` into the new backend folder (do not edit billing, mail or credentials). Add only `MMRI_ADMIN_EMAIL_OTP=off`.
5. Migrate (above), start the new backend on the service, check `/ready`, switch the IIS physical path to the new `frontend\dist`.
6. Validate read-only: `GET /api/v1/billing/plans` still reports the intended provider; admin sign-in with the authenticator still works.
Do not switch billing mode, create invoices or enable the e-mail code as part of this deployment.

## Rollback
- Code/frontend: repoint IIS to the previous `frontend\dist`, stop the service, start the previous release folder (the schema change is additive, so the old code runs on the new schema).
- Database (only with owner approval): `pg_restore` the pre-deployment dump into a NEW database and repoint `DATABASE_URL`; never restore over the live database. Or run the migration `rollback.sql` above.
- Config: nothing is changed in `.env` except one new, harmless line.

## Storage, backup and connection limits — what is known and what is not
- **Not inspected:** the Windows server (disk size/free space, RAM, PostgreSQL version and `max_connections`, current database size) has not been inspected, so no production capacity is claimed here.
- Development reference only (not production): the full development database was about 2.2 GB on disk and about 160 MB as a compressed dump; this must be re-measured on the server before sizing disk or retention. The new table holds a handful of short-lived rows.
- Backups: `ops/backup-all.sh` / `Backup-Postgres.ps1` (database + private report storage + migration-chain digest). Nightly, 14-day local retention, and an encrypted copy OFF the machine are required by the runbook; none of this has been verified on production. A backup counts only after an isolated restore test passes.
- Connections: set `connection_limit` in the runtime `DATABASE_URL` below the server's `max_connections` (reference value in `DEDICATED_SERVER_SETUP.md`: `max_connections = 100`, pool e.g. 20). Check the real value with `SHOW max_connections;` and the running service count before choosing a number.
- Migration role vs runtime role must stay separate (least privilege).

## Unresolved production dependencies (none are done)
Live backend version · old MANUAL invoices vs bank records · verified backup + restore · Gmail OAuth (`invalid_grant`) · `support@businessmri.mn` SUPER_ADMIN provisioning and a real e-mail-code login · one real QPay payment with verified entitlement · real Android/iPhone bank-app scans of each colored QR.
