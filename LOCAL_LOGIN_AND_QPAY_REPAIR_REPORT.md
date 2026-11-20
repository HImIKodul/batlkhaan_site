# Local login & QPay repair report (2026-11-13)

## 1. Source files changed (this task)
- `backend/src/billing/billing-service.ts` line 319: `tx.$queryRaw` -> `tx.$executeRaw` for the payment-transaction advisory lock.

## 2. Root cause
`pg_advisory_xact_lock()` returns `void`. `$queryRaw` tries to deserialize the result column and fails with P2010 "Failed to deserialize column of type 'void'". Every other advisory-lock call site in `src/` (app.ts:433, billing-service.ts:394, account-routes.ts:143/168, admin-service.ts:64) already uses `$executeRaw`; line 319 was the only offender. No other `$queryRaw` calls exist in `backend/src`.
Lock key, sorted ordering, transaction scope, serializable isolation, retry and unique constraints are unchanged.

## 3. Before / after
- Before: `real-qpay-contention` failed (H07-1, H07-2 and others hit P2010).
- After: all 17 checks PASS (H07-1..H07-10, M01-1..M01-5): paid-vs-cancel race, six parallel confirmations -> one entitlement, cross-invoice transaction reuse refused (PAYMENT_ALREADY_USED), overlapping sets -> one winner with no partial ledger, under-payment rejected, provider outage -> 502 unchanged, consumed/refunded entitlements preserved.

## 4. Commands
- `python3 ops/acceptance/host.py preflight` / `contracts` (run dir `CODEX_PROGRESS/03-executed-acceptance/host-20261113120118/`; runner is hard-pinned to `mmri_codexfix_release_20261110`).
  Note: a fresh run dir lacks the `database` stage marker, so `database-complete.json` and `qa-after-migration.json` were copied from `host-20261113115054/` (same QA DB, unchanged). Row counts were still compared against live QA.
- `prisma migrate diff --from-url <main> --to-schema-datamodel` (read-only).
- `pg_restore` of `mmri_before_migration31_20261113_114838.dump` into `mmri_acceptance_restore_20261113120216` (new disposable DB), then `prisma migrate deploy` on that copy only.

## 5. Real PostgreSQL results
- real-auth-postgres PASS; real-qpay-contention PASS; single-company-preserved (QA counts unchanged) PASS; prisma-generate PASS.

## 6. Login 500 root cause (P2022)
Schema diff of main `mmri` vs `schema.prisma` is exactly migration 31, nothing else: `users.emailVerificationRequired`, `users.emailVerifiedAt`, `password_reset_tokens.purpose`, table `billing_payment_transactions`. The RefreshSession P2022 is explained too: `refreshSession.findUnique({include:{user:true}})` (auth-service.ts:60) selects the missing User columns.

## 7. Backup / restore evidence
- Backup sha256 `da67fe26...ceeb84` (161,220,920 bytes).
- Full restore into disposable DB: no errors; exact row counts identical across all 81 public tables vs live `mmri` (users 322, companies 137, billing_invoices 192, assessments 151, report_artifacts 92, admin_accounts 129, diagnostic_cells 52224); constraint list and index list identical.
- Rehearsal of migration 31 on the restored copy: applied cleanly, 31 migrations, no schema drift, ledger backfill = 163 rows (= 163 paid invoices with a payment id; 0 duplicate payment ids, 0 `qpay-set-` rows), users 322 / invoices 192 unchanged.

## 8. Main DB migration status
NOT APPLIED. `mmri` untouched (read-only queries only).

## 9. Local login / browser verification
NOT RUN (requires migration 31 on `mmri`).

## 10. Decisions needed
Authorize applying `20261110040000_email_ownership_payment_ledger` to `mmri`.

Disposable DB `mmri_acceptance_restore_20261113120216` was left in place (nothing deleted).

| Item | Status |
|---|---|
| QPay advisory-lock repair | PASS |
| real-qpay-contention | PASS |
| real-auth-postgres | PASS |
| Combined contracts | PASS |
| Backup restore of main dump | PASS |
| Migration 31 rehearsal on restored copy | PASS |
| Main DB migration | NOT RUN (awaiting authorization) |
| Login end-to-end / browser | NOT RUN |

---
# Addendum: main DB migration + login verification (authorized)

## Migration on `mmri` (local dev DB)
- Reconfirmed: DB `mmri`, backup sha256 `da67fe26...`, counts unchanged since rehearsal, exactly one pending migration.
- `prisma migrate deploy` applied only `20261110040000_email_ownership_payment_ledger`. `migrate status`: 31/31 applied, up to date. `migrate diff` vs schema.prisma: no drift. `prisma generate` re-run.
- Preserved: companies 137, billing_invoices 192, company_entitlements 160, assessments 151, report_artifacts 92, admin_accounts 129 (all identical); users 322 (+1 synthetic QA account = 323). New ledger table backfilled with 163 rows.
- Existing users got `emailVerificationRequired=false` (default), so existing customers log in with their existing passwords; no account was modified.

## Backend restart
Only the `npm run api:dev` tree for this project (old pids 5942/5977/5978/6011) was stopped and restarted. Env overrides passed on the command line (no `.env` change): `ALLOWED_ORIGINS` including `http://localhost:5176`, `MMRI_PUBLIC_APP_URL=http://localhost:5176`. Mail = mock (dev default), outbox at `backend/.mock-mailbox/outbox.jsonl`. Vite (5176) was not touched.

## Real HTTP tests (through the 5176 proxy), synthetic account
PASS: register (202); login blocked until verified (401); verification mail in mock mailbox; verify + set password; verification token single-use; wrong password 401; login 200 with HttpOnly, SameSite=Strict, Path=/api/v1/auth cookie; /auth/me; refresh rotates; replay after 10 s grace -> 401 and token family revoked; logout 204; refresh after logout 401; password-reset request (202, same response for unknown address); reset confirm; old password rejected; new password login.
Note: replaying an old refresh token within the 10 s grace window returns 200 by design (second-tab tolerance); my first test expected 401 and was the stale expectation, not a bug.
Existing real account: wrong password -> 401 (no 500). Backend log: 0 responses with 5xx, 0 P2022.

## Not verified
- Session expiry (not waited out), disabled-account restriction (covered by code path and unverified-account block only), and a visual browser walkthrough of the login UI (no browser driven; only HTTP through the frontend proxy).
- Existing customers' real passwords are unknown to me, so a successful real-customer login was not exercised.
