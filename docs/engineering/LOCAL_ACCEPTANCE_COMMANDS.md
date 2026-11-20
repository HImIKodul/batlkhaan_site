# BusinessMRI.mn guarded Linux-terminal acceptance

These commands are prepared for the owner's normal Linux terminal. They are **not** successful service-test evidence. This Codex session cannot connect to Docker/Internet sockets or launch a working browser. The runner records actual exit statuses, commands, timestamps and evidence as it executes; it stops at failed prerequisites.

The runner only permits the fixed local PostgreSQL endpoint `127.0.0.1`/`localhost:55432`, user `mmri`, container `mmri-v3-local-postgres-1`. It derives the designated QA URL from the local backend configuration **and replaces its database name with `mmri_codexfix_release_20261110`**. It never runs migration/deletion against `mmri`, and never deletes any database. No root/sudo, Docker permission changes, security-policy disabling or production access is needed. Use an account that already has legitimate access to the local container; do not make the Docker socket world-writable.

## Select runtime and evidence directory

```bash
cd /home/kirby/MMRI_MASTER_2026-11-06/01_ACTIVE_SOURCE/MMRI_STEP10_FINAL_WORKING
export BUSINESSMRI_ACCEPTANCE_RUN_DIR="$PWD/CODEX_PROGRESS/03-executed-acceptance/host-$(date +%Y%m%d%H%M%S)"
export BUSINESSMRI_NODE="$HOME/.nvm/versions/node/v22.23.2/bin/node"
python3 ops/acceptance/host.py preflight
```

`preflight` is read-only for databases. It confirms the known container mapping, enumerates database identities, records table counts for QA/main, and requires exactly one existing QA company and the designated synthetic owner/membership. A mismatch stops the runner; do not rename a real database to bypass it. A failure to find the local URL should be resolved using the existing private configuration, not by placing secrets in commands or reports.

For exact runtime compatibility, use the existing nvm installation in the normal terminal. Install/select only the repository-pinned runtime; these commands require normal public registry/download access:

```bash
. "$HOME/.nvm/nvm.sh"
nvm install 22.16.0
nvm use 22.16.0
npm install --global npm@10.9.2
export BUSINESSMRI_NODE="$(command -v node)"
python3 ops/acceptance/host.py exact-runtime
```

The exact-runtime stage refuses to claim compatibility under another version. Under the correct versions it copies Git-visible current source to a new evidence-local clean tree, runs `npm ci` and builds backend/frontend there. It does not replace the working application's dependencies or restart existing services. It does not disable `engine-strict` or ignore install scripts.

## Backup before any migration, then real database tests

```bash
python3 ops/acceptance/host.py database
python3 ops/acceptance/host.py contracts
```

`database` repeats the identity checks, creates a private custom-format QA dump, hashes it, restores it into a **new** `mmri_acceptance_restore_<timestamp>` database and compares every public-table row count plus FK orphans, constraints, indexes and triggers. Only after that proof does it permit migration 31 on the designated QA database. Unknown pending migrations, existing restore names, count differences or restore failures stop it. Drift/status and post-migration integrity/count checks follow. `_prisma_migrations` is expected to gain its one history row; existing application tables must retain their counts. There is no automatic rollback or destructive reset. A restored backup database is retained for recovery; the original QA dump is never overwritten.

`contracts` regenerates the Prisma client and executes the real PostgreSQL auth/token/session and fake-provider QPay contention/refund/entitlement suites. The auth test cleans only its generated user/admin/session/audits; billing removes only its generated invoices, entitlements and ledger rows. Final public-table counts must match the post-migration baseline. The existing QA company is retained. External QPay/Resend requests are not made.

## HTTP, browser, five-domain/PDF and performance checks

Run these **sequentially**, not in parallel:

```bash
python3 ops/acceptance/host.py workflows
python3 ops/acceptance/host.py domains
python3 ops/acceptance/host.py browser
python3 ops/acceptance/host.py performance
python3 ops/acceptance/host.py source
```

Fixture-heavy stages create a new `mmri_acceptance_flow_<timestamp>` restore **from QA**, never from the main database. Those disposable flow clones may contain many generated test companies; the designated QA database stays single-company. Flow clone identities are recorded and retained, not silently dropped. Browser stage reuses the completed workflow clone and its pending synthetic review fixture. Do not provide IDs from main development data.

The runner starts only its own loopback API/frontend at ports `4391`/`5391`; session tests also own `4392`/`4393`. An occupied port causes refusal, not termination of another service. It stops only processes it started. Provider credentials are blanked and mock mail/billing plus disabled AI are forced. Auth secrets remain server-side; generated browser credentials, mailbox tokens, dumps and reports live under ignored mode-700 `private/` directories. No shared `:4000` API is used.

- `workflows`: recovery HTTP, concurrent refresh/replay/logout, 60-second access-token expiry and default rate-limit instance, full route/tenant matrix, account/admin permissions, admin reset/session revocation, approval/publication/audit and retake preservation. Each suite gets fresh rate buckets. Existing test assertions remain; expected registration status is now 202 pending. A 65-second expiry wait is intentional, not a load test.
- `domains`: five sequential complete diagnosis/report journeys. Each downloads the actual API PDF and verifies its byte/source hashes, filename, exactly three pages, all-page branding/metadata and overall score against frozen results. Requires `pdfinfo`, `pdftotext` and the existing ReportLab/fonts. It no longer treats an obsolete PDF model as binary verification.
- `browser`: actual mock-mailbox verification UI, login, onboarding/save/reload, admin workflow/audits, recovery/account administration, first-question answer/save/back checks for every domain at 390px/1280px, and 90-second Chromium/Firefox/WebKit page/axe runs. Chromium sandbox remains enabled. No security fallback is attempted if browser sandboxing is unsupported. Existing Playwright/axe path defaults to `~/MMRI_TOOLS/pw/node_modules/playwright-core`; set `PW` to another already-installed path if needed.
- `performance`: exactly two concurrent synthetic journeys (`it`, `finance`), at most 420 answers each and a 240-second outer budget, with resource sampling. It operates only on an owned flow clone. This is bounded smoke performance, not production capacity certification.
- `source`: the complete source release gate, including operations runtime listener/stability tests. It forces connected production execution off. Run connected production checks only under a separate explicit authorization.

Each subprocess has a fixed timeout and is stopped with its owned process group if it exceeds the budget. A timeout is not PASS. Unsupported sockets/browsers are BLOCKED; assertions that fail on a usable host are FAIL. The runner itself is syntax/guard checked but its service stages could not be validated end to end in this restricted session; review actual evidence and repair demonstrated failures rather than assuming these commands will all pass.

## Results and remaining manual work

Read `$BUSINESSMRI_ACCEPTANCE_RUN_DIR/host-results.json` and the corresponding logs. A stage or child PASS is only its stated scope. In particular, automated axe runs do not complete real-device/touch or screen-reader acceptance, and a fresh backend diagnosis does not prove all browser interactions. The source acceptance matrix remains BLOCKED until these artifacts are reviewed. No automatic report promotion occurs.

For a current advisory check on a network-enabled host, run from each project with the exact runtime selected:

```bash
(cd backend && npm audit --json --audit-level=high)
(cd frontend && npm audit --json --audit-level=high)
```

Do not treat an offline/cached or registry-error response as a clean audit. Provider checklists are in `docs/engineering/EXTERNAL_ACCEPTANCE_CHECKLIST.md`. Do not push or deploy after these commands; no such action is authorized.
