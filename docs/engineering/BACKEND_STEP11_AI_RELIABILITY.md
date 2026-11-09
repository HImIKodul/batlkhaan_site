# Backend completion 11/20 — OpenAI generation reliability

Date: 2026-10-25

## Scope

This step hardens only the backend AI execution layer. It does not redesign the frontend, change the deterministic MMRI scoring methodology, import the final human-reviewed question bank, or connect live QPay.

## Completed

- OpenAI Responses API provider remains server-side only (`store:false`).
- Production AI provider/model defaults are preconfigured in `backend/.env.example`.
- The real `OPENAI_API_KEY` is intentionally absent and must be inserted only in the server environment later.
- Added bounded per-attempt timeout and total generation timeout.
- Added bounded retries for transient network/server/rate-limit failures.
- `Retry-After` is honored and never shortened by local retry logic.
- Billing/quota/spend-limit 429 failures do not retry and waste credit.
- Added exponential backoff with jitter.
- Added provider telemetry: HTTP attempts, retry count, provider request IDs, final status and duration.
- Controlled narrative repair remains bounded; invalid output falls back to deterministic validated narrative.
- Added same-process generation coalescing.
- Added database generation lease to prevent duplicate generation across multiple backend instances.
- Added stale-lease recovery and lease renewal before expensive trace freezing.
- Added fallback retry cooldown so a fallback report does not repeatedly burn API credit.
- Failed regeneration preserves the last valid published report when one already exists.
- Added generation-start, fallback and failure audit events.
- First report snapshot freeze is now race-safe/idempotent with database upsert.
- Added database counters/telemetry/lease/retry fields and integrity constraints.
- Added connected-database verifier for the Step-11 migration.
- API maps cross-instance generation contention to `409 REPORT_GENERATION_IN_PROGRESS` rather than duplicating work.
- Updated legacy strategy/report acceptance tests to the current five-critical-action/evidence-action and Mongolian QUICK-warning contracts.

## Production environment defaults

The project is prepared for these server-side variables:

```env
MMRI_AI_REPORT_PROVIDER="openai"
MMRI_AI_REPORT_REQUIRED=true
MMRI_AI_REPORT_MODEL="gpt-6.1-sol"
MMRI_AI_REPORT_ENDPOINT="https://api.openai.com/v1/responses"
MMRI_AI_REPORT_TIMEOUT_MS=45000
MMRI_AI_REPORT_TOTAL_TIMEOUT_MS=75000
MMRI_AI_REPORT_MAX_RETRIES=2
MMRI_AI_REPORT_RETRY_BASE_DELAY_MS=500
MMRI_AI_REPORT_RETRY_MAX_DELAY_MS=10000
MMRI_AI_REPORT_MAX_OUTPUT_TOKENS=8000
MMRI_AI_REPORT_RETRY_COOLDOWN_MS=300000
MMRI_AI_REPORT_GENERATION_LEASE_MS=300000
OPENAI_API_KEY=""
```

The secret API key is not included in this archive.

## Verification completed

- Step 11 AI reliability static: 22/22 PASS
- Step 11 AI reliability runtime simulation: 7/7 PASS
- Step 10 AI boundary static: 26/26 PASS
- Step 10 five-domain AI boundary: 60/60 PASS
- OpenAI/report binding smoke: 17/17 PASS
- AI report acceptance: 59/59 PASS
- Strategy/report contract: 32/32 PASS
- Controlled five-domain behavior: 205/205 PASS
- Persistence static: 58/58 PASS
- Persistence runtime: 30/30 PASS
- Traceability static: 49/49 PASS
- Traceability runtime: 30/30 PASS
- Security/RBAC static: 54/54 PASS
- Security runtime: 38/38 PASS
- API static: PASS (69 routes)
- Changed TypeScript syntax/transpile check: PASS

## Deferred connected checks

This sandbox has no connected production PostgreSQL instance and intentionally does not contain the user's real OpenAI secret. Therefore the following are prepared but not falsely claimed as live-tested here:

1. Apply the Step-11 Prisma/PostgreSQL migration on the connected MMRI database.
2. Run `npm run db:verify:backend-ai-reliability` against that database.
3. Insert the real `OPENAI_API_KEY` into the backend/DigitalOcean secret environment.
4. Run one live provider-backed diagnosis/report generation and verify provider request IDs/cost/latency.

These connected checks belong to the later environment/deployment verification phase.
