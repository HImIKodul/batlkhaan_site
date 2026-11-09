# MMRI Production Release / Rollback Runbook — Backend Step 19

## Release rule
A source-level PASS is not a production GO. Production traffic may be promoted only after the connected gate passes against the real PostgreSQL instance, persistent report storage, immutable container images, and deployed API/web services.

## Required deployment order
1. Prepare `deploy/.env.production` from the example. Keep all real secrets outside Git.
2. Build/push API, migration, and web images and record immutable `@sha256:<64-hex>` digests.
3. Run `bash ops/release-gate.sh` from the source tree. This verifies secrets scanning, lockfiles, migration-chain integrity, Steps 17–19 security/operations gates, and API routing.
4. Run `node ops/preflight.mjs` with the exact production environment. Any placeholder secret, mutable image, insecure origin/database, disabled billing, invalid AI/QPay configuration, unsafe report storage, or unsafe shutdown timing is a stop condition.
5. Take one coordinated PostgreSQL + report-storage backup set with `bash ops/backup-all.sh`, then verify it with `bash ops/verify-backup-set.sh <set>`.
6. Run the one-shot migration/integrity container. It applies only committed migrations, verifies methodology/import state, then checks the least-privilege runtime role.
7. Start the API only. `/live` must be 200 and `/ready` must become 200 before the web service starts.
8. Start the web service only after API readiness is healthy.
9. Run `node ops/smoke-test.mjs` and `node ops/stability-check.mjs`. The observed release SHA must match `RELEASE_SHA`.
10. Write the immutable release manifest with `node ops/create-release-manifest.mjs` and preserve it with the release evidence.
11. Promote public traffic only after connected gates, backup evidence, readiness stability, and smoke tests are PASS.

For the guarded automated sequence use:

```bash
MMRI_DEPLOY_PRODUCTION=YES bash ops/deploy-production.sh
```

The script refuses to run without the explicit confirmation flag.

## Startup / readiness contract
- `GET /live`: process liveness only; no database dependency.
- `GET /ready`: traffic readiness. It requires the process to be accepting traffic, PostgreSQL to respond within `READINESS_DB_TIMEOUT_MS`, and persistent report storage to be readable/writable.
- `GET /health`: compatibility health with release/instance/lifecycle metadata.
- `GET /metrics`: protected by `METRICS_TOKEN`.
- The API container healthcheck uses `/ready`; the web container starts only after the API is healthy.

## Graceful shutdown
1. On SIGTERM/SIGINT the API first enters draining state.
2. `/ready` immediately returns 503.
3. New customer/API requests receive `SERVICE_DRAINING` while operational endpoints remain available.
4. The process waits `SHUTDOWN_DRAIN_MS` (default 5 seconds) for the load balancer to remove the instance.
5. HTTP accept/idle connections are closed while already-running requests may finish.
6. Prisma disconnect is attempted before process exit.
7. `SHUTDOWN_FORCE_TIMEOUT_MS` (default 45 seconds) is the hard upper bound; remaining connections are force-closed only after that bound.
8. Docker gives the API 50 seconds of stop grace, longer than the application hard timeout.

## Monitoring minimums
Alert on:
- `/ready` failure for more than 2 minutes;
- 5xx responses >2% for 5 minutes;
- p95 API latency >1.5 seconds for 10 minutes;
- repeated authentication/rate-limit spikes;
- PostgreSQL connection saturation;
- process restart loop;
- backup or report-storage backup failure/missing expected backup;
- persistent storage unavailable;
- sustained `mmri_accepting_traffic 0` outside a deployment window.

Logs are structured JSON and include request ID, method, path without query string, status, duration, release SHA, and instance ID. Never log answers, request bodies, tokens, cookies, QPay/OpenAI secrets, or report narrative content.

## Rollback
Application rollback uses previous immutable API/web image digests only. Database migrations are **not automatically reversed**.

Before rollback:
1. Confirm the current database schema is backward-compatible with the previous API/web build.
2. Take and verify a fresh coordinated backup set.
3. Set `PREVIOUS_MMRI_API_IMAGE` and `PREVIOUS_MMRI_WEB_IMAGE` to immutable digests.
4. Explicitly confirm both rollback guards:

```bash
MMRI_ROLLBACK_APPLICATION=YES \
MMRI_ROLLBACK_SCHEMA_COMPATIBLE=YES \
PREVIOUS_MMRI_API_IMAGE='registry/api@sha256:...' \
PREVIOUS_MMRI_WEB_IMAGE='registry/web@sha256:...' \
bash ops/rollback-application.sh
```

If schema compatibility is not proven, stop and use the release-specific database recovery plan instead of blindly rolling the application back.

## Stop conditions
Do not promote if any of the following is true:
- source release gate fails;
- connected database gate fails;
- migration chain fingerprint differs;
- backup set cannot be verified;
- initial real restore drill has not been completed;
- API readiness is unstable;
- smoke/stability tests fail or show the wrong release SHA;
- runtime PostgreSQL role has admin/DDL privileges or lacks required DML/sequence privileges;
- report storage is not persistent/read-write;
- production uses mock billing or disabled billing enforcement;
- OpenAI/QPay/database/application secrets are missing, placeholders, or exposed;
- image references are mutable;
- customer web exposes `/metrics` directly;
- rollback path for a non-backward-compatible schema change is unresolved.

## Connected final gate
In the real production-like environment only:

```bash
MMRI_CONNECTED_RELEASE_GATE=YES bash ops/final-release-gate.sh
```

A source-only environment must not be reported as production GO.
