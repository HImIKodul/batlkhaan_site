# BusinessMRI.mn database final verification

**Status: BLOCKED. No current database identities, restorable backup, migration execution or PostgreSQL test PASS is claimed.**

This continuation did not execute a SQL statement or database migration. Docker connection attempts failed before reaching the daemon, and Internet/loopback sockets returned `EPERM`. The previous checkpoint's single-company QA dataset is retained by taking no database-mutating action here; its current row counts cannot be independently confirmed in this environment.

| Target | Allowed scope | Current evidence |
|---|---|---|
| `mmri` and any production/main database | Read-only identity/count inspection only; never migrate, reset, clean or restore over it | Current inspection BLOCKED; older checkpoint counts are historical evidence only |
| `mmri_codexfix_release_20261110` | The fixed isolated QA target, after identity and backup validation | Current identity/backup/migration/tests BLOCKED |
| `mmri_acceptance_restore_<timestamp>` | Newly created restore-proof database; refuse if it already exists | Prepared; NOT CREATED in this session |
| `mmri_acceptance_flow_<timestamp>` | Newly created QA-derived workflow clone, for disposable synthetic fixtures | Prepared; NOT CREATED in this session |

## Actual commands executed

```bash
python3 ops/acceptance/diagnose.py
python3 ops/acceptance/host.py preflight
python3 ops/acceptance/host.py self-test-guards
```

The diagnostic records `NoNewPrivs=1`, seccomp filtering and `EPERM` for Docker/localhost socket access. Preflight stopped at `docker version --format '{{.Server.Version}}'`. It never reached the SQL identity/count queries. Runner target guards passed, including rejecting remote/wrong-user/wrong-port URLs and stripping query parameters that could redirect the endpoint/schema. Both real-DB suites also rejected a remote URL with the correct-looking QA database name before querying it. These are **safety checks, not real database acceptance**.

Evidence: [environment-current.json](CODEX_PROGRESS/03-executed-acceptance/environment-current.json), [host results](CODEX_PROGRESS/03-executed-acceptance/host/host-results.json), [remote refusal results](CODEX_PROGRESS/03-executed-acceptance/remote-refusal-results.txt).

## Guarded normal-terminal execution

Follow [LOCAL_ACCEPTANCE_COMMANDS.md](docs/engineering/LOCAL_ACCEPTANCE_COMMANDS.md). With its explicit evidence/runtime variables set:

```bash
python3 ops/acceptance/host.py preflight
python3 ops/acceptance/host.py database
python3 ops/acceptance/host.py contracts
```

The database stage is fail-closed:

1. Confirm known local container/port, actual current database/user/server identity, one QA company, and the designated synthetic owner/membership. Record main/QA counts read-only. Wrong identities stop execution.
2. Dump **QA only** with `pg_dump -Fc --no-owner --no-acl`. Keep it privately and record SHA-256. Do not overwrite an earlier dump.
3. Restore into a newly created named disposable database with `pg_restore --exit-on-error`. Check every public-table row count, FK orphan census, validated constraints, usable indexes and enabled triggers. A dump listing or the older mocked backup suite alone is insufficient.
4. Only after successful restore proof, allow `prisma migrate deploy` with a forced QA URL/public schema. Refuse unexpected pending/applied migration sets. The only allowed new migration is `20261110040000_email_ownership_payment_ledger`.
5. Verify migration status, Prisma drift, FK/constraint/index/trigger integrity and preserved application-table row counts. The expected new migration-history row is distinguished from application data changes.
6. Run real PostgreSQL auth/token/session and QPay synthetic-transaction contention/refund/entitlement contracts sequentially; compare final QA counts to the post-migration baseline. Keep its existing company.

The runner never contains a DROP DATABASE operation or an automatic main/production migration. Restored/flow clones are recorded and retained. It starts/stops only its own loopback services; occupied ports cause refusal. A failed migration is not automatically rolled back or hidden; retain evidence and the proven restored backup for an explicit recovery decision.

## Pending verification ledger

| Check | Status | Dependency / owner action |
|---|---|---|
| Current database identities and counts | BLOCKED | Run read-only host preflight |
| Current restorable QA backup | BLOCKED | Complete dump → new restore → integrity/count comparison |
| Migration 31 on QA only | BLOCKED | Identity and restore proof must pass first |
| Drift/FK/constraints/indexes/triggers | BLOCKED | Run post-migration database stage |
| Real token claims/caps/expiry and session revocation | BLOCKED | Run contracts against QA after migration |
| Real concurrent refresh, expiry and authorization matrix | BLOCKED | Run workflow HTTP tests on an owned QA clone |
| Actual synthetic QPay transaction contention/refund/entitlement integrity | BLOCKED | Run contracts; external QPay is not required for this local database proof |
| Production-style runtime least-privilege drill | NOT RUN | Local development owner credentials are not proof of production least privilege. Use a separately authorized QA runtime-role setup; do not change production or existing development role grants automatically |
| Main historical records/payment history preservation | No mutations performed; live counts unverified | No cleanup/migration against main is authorized |

The auth contract harness now tags its own audit fingerprint and removes its null-user negative-test audit rows as well as its created user's rows; PostgreSQL verification of that repair remains pending. Fresh-domain cleanup also removes only its generated payment-ledger rows before invoices, respecting migration 31's restrictive FK. Neither repair justifies declaring a live database test passed.
