# BusinessMRI.mn critical acceptance runbook

The final acceptance report is the authority for observed results. These instructions are prepared for a host that can access the preserved isolated PostgreSQL database and launch Chromium. They have not been executed end to end in the restricted continuation session.

## Database and mail precautions

Use **only** `mmri_codexfix_release_20261110`, the existing isolated company and its synthetic owner. Keep every development/historical database. Never run reset, force-reset, database deletion, or a shared-server test override. Supply the isolated DATABASE_URL through the existing local secret store; do not write its value into progress logs. `PGDATABASE` and `DATABASE_URL` must name the same isolated database when using admin CLI tests.

The new migration is `20261110040000_email_ownership_payment_ledger`. It is additive; all 30 prior migrations are unchanged. Apply it only to the isolated database during local acceptance using the normal migration deploy command. A migration-chain fingerprint proves source integrity, not successful migration execution. This session did not apply it.

Start an isolated API and frontend with explicit loopback ports other than shared `4000`, and with `MMRI_MAIL_PROVIDER=mock`, an explicit private `MMRI_MOCK_MAIL_DIR`, mock billing for ordinary journeys and a scripted fake QPay provider for payment tests. Never use real provider credentials in mocked tests. Match the frontend Origin in the API configuration. Do not restart or migrate shared services.

## Bounded critical checks

From `backend`, use the repository Node/npm versions and installed dependencies:

```bash
npm run test:critical
```

This runs service and route contracts with mocked database transactions and fake provider delivery, one worker. It must never be reported as PostgreSQL or browser verification.

For real PostgreSQL contracts, first explicitly set the isolated `DATABASE_URL`, then:

```bash
MMRI_CRITICAL_DB_TESTS=YES npm run qa:critical:auth
MMRI_CRITICAL_DB_TESTS=YES npm run qa:critical:billing
```

Run them sequentially. The auth suite uses at most three concurrent operations, creates only a temporary synthetic user/admin session, and cleans up only that invocation's records. It checks the existing company count stays unchanged. The billing suite uses the existing isolated company, fake provider responses, and removes only its generated invoices, entitlements and transaction ledger rows. Neither suite calls Resend or QPay.

Then run the prepared recovery HTTP suite, session lifecycle suite, authorization matrix and admin suites against the explicit isolated API, database and mock mailbox. Shared fixture creation uses the actual public sequence: register (202, no session), read the local ownership mail, confirm ownership, log in. There is no verification bypass. Only newly public accounts are pending; old accounts keep their legacy behavior. Test fixtures remain unverified until the real confirmation path succeeds.

`qa/ui-auth-register.mjs` and `qa/ui-onboarding-save.mjs` now complete ownership through the actual browser form using only the local mock mailbox. `qa/ui-admin.mjs` covers the fuller admin workflow and requires its review fixture. Use only new test admins; cleanup is scoped to the accounts provisioned by the invocation. Their CLI provisioning refuses mismatched API/database targets.

## Bounded browser validation

`qa/ui-final-bounded.mjs` uses one Chromium process, sequential 390px/1280px contexts, a 90-second total limit, screenshots, horizontal overflow checks, branded titles and axe WCAG checks. Each completed result is saved immediately. It reads existing synthetic customer/admin credentials from private JSON files when supplied; missing credentials produce explicit NOT RUN items. It does not create companies, payments or assessments. Login/logout sessions are expected mutations. Supply explicit `BASE`, `PW`, `OUT`, and optional credential-file paths; never put credentials in the command itself. Repeat only incomplete or affected states after a failure.

Full screen-reader, touch-device, cross-browser and visual acceptance remain separate. Neither a build nor an axe result alone proves accessibility.

## Historical payment sets

Every paid transaction is now bound to one invoice in `billing_payment_transactions`, including after refund. Old single payment references are backfilled by the migration. Old `qpay-set-*` references cannot be reversed into their constituent IDs from a hash. Until all historical settled combined sets have ledger entries, new QPay activation fails closed with `PAYMENT_LEDGER_RECONCILIATION_REQUIRED`.

On an authorized provider-connected environment, reconcile each affected PAID/REFUNDED invoice through the existing protected reconciliation endpoint. The service checks the actual provider result and exact historical reference; it fills the ledger without granting or reviving entitlements. A refunded provider record that no longer exposes original paid transactions, changed transaction sets, inconsistent totals or provider failures require authenticated provider records and operator investigation. Do not invent ledger rows, clear historical references, relax replay constraints, or treat a provider aggregate as transaction evidence. No real-provider reconciliation was done in this session.

## External acceptance

Resend requires authorized credentials, a verified sender and inbox/delivery/bounce checks. QPay requires authorized sandbox credentials and real callback/reconciliation checks. Production backup/restore, least-privilege access, TLS/proxy, alerts and connected release gates remain required. No push or deployment is authorized by this runbook.

## Execution follow-up

Use `LOCAL_ACCEPTANCE_COMMANDS.md` in this directory for the guarded normal-terminal identity/backup/restore/migration and service-test sequence. It retains the designated single-company QA database and creates only new QA-derived flow clones for fixture-heavy tests. The current environment still denies Docker/localhost sockets and Chromium; no database migration or live service test has been verified here. Root `DATABASE_FINAL_VERIFICATION.md` and `REMAINING_BLOCKERS.md` contain current limits. The exact runtime remains pinned; do not loosen engine requirements or enable broad/full access to make tests green.
