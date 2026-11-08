#!/usr/bin/env bash
# Focused regression gate for the Codex audit repairs. Runs ONLY against an isolated test database (never "mmri").
# Create one first (read-only copy of the live data):
#   docker exec mmri-v3-local-postgres-1 psql -U mmri -d postgres -c 'CREATE DATABASE mmri_codexfix'
#   docker exec mmri-v3-local-postgres-1 pg_dump -U mmri -d mmri --no-owner | docker exec -i mmri-v3-local-postgres-1 psql -U mmri -d mmri_codexfix -q
# Usage: MMRI_TEST_DB=mmri_codexfix ./scripts/run-codex-repair-gate.sh      (about 15 minutes; starts and stops its own API on $TEST_API_PORT, default 4002)
set -uo pipefail
DB="${MMRI_TEST_DB:?set MMRI_TEST_DB to the isolated test database name}"
case "$DB" in mmri|postgres|template0|template1) echo "REFUSING: $DB is not an isolated test database"; exit 2;; esac
[[ "$DB" == *test* || "$DB" == *codexfix* ]] || { echo "REFUSING: test database name must contain 'test' or 'codexfix'"; exit 2; }
cd "$(dirname "${BASH_SOURCE[0]}")/.."
PORT="${TEST_API_PORT:-4002}"; TMP="$(mktemp -d)"; mkdir -p "$TMP/rs" "$TMP/mail"
BASE_URL="$(sed -n 's/^DATABASE_URL=//p' .env | head -1 | sed 's/^"//; s/"$//')"
export DATABASE_URL="$(sed -E "s#/[A-Za-z0-9_]+\?#/$DB?#" <<<"$BASE_URL")"; export PGDATABASE="$DB"
grep -q "/$DB?" <<<"$DATABASE_URL" || { echo "could not point DATABASE_URL at $DB"; exit 2; }
export PORT MMRI_REPORT_REVIEW_REQUIRED=true MMRI_AI_REPORT_PROVIDER=disabled OPENAI_API_KEY="" MMRI_BILLING_PROVIDER=mock MMRI_REPORT_STORAGE_DIR="$TMP/rs" MMRI_MOCK_MAIL_DIR="$TMP/mail"
export ALLOWED_ORIGINS="http://127.0.0.1:5176,http://localhost:5176,http://localhost:5173" RELEASE_SHA="gate-$(date +%s)" INSTANCE_ID="repair-gate" API="http://localhost:$PORT/api/v1"
RESULTS=(); run() { local name="$1"; shift; local out="$TMP/$name.log"; if "$@" > "$out" 2>&1; then RESULTS+=("PASS  $name"); else RESULTS+=("FAIL  $name   (log: $out)"); fi; }
stop_api() { local p; for p in $(ss -ltnp 2>/dev/null | grep ":$PORT " | grep -o "pid=[0-9]*" | cut -d= -f2); do kill "$p" 2>/dev/null; done; for _ in $(seq 1 30); do ss -ltn 2>/dev/null | grep -q ":$PORT " || return 0; sleep 1; done; echo "port $PORT still busy"; return 1; }
# A fresh API process per suite also resets the in-memory rate limiters, so suites cannot starve each other.
start_api() { stop_api || return 1; (npx tsx src/api/server.ts > "$TMP/api.log" 2>&1 < /dev/null &); for _ in $(seq 1 40); do sleep 1; curl -s -o /dev/null "http://127.0.0.1:$PORT/health" && return 0; done; echo "API did not start"; return 1; }
trap 'stop_api' EXIT
npx prisma migrate deploy > "$TMP/migrate.log" 2>&1 || { echo "migrate deploy failed (see $TMP/migrate.log)"; exit 1; }
run backend-tsc            npx tsc --noEmit -p .
run frontend-tsc           bash -c 'cd ../frontend && npx tsc --noEmit -p .'
run static-guards          node scripts/qa-codex-static-regression.mjs
run migration-chain        node scripts/verify-migration-chain.mjs
run billing-race+reconcile npx tsx scripts/qa-billing-race-regression.ts
run review-policy          npx tsx scripts/qa-review-policy-regression.ts
run phase1-purchase-race   npx tsx scripts/qa-phase1-billing-purchase-race.ts
run phase1-access          env MMRI_REPORT_REVIEW_REQUIRED=true npx tsx scripts/qa-phase1-access-regression.ts
run phase1-report          bash -c 'npm run strategy:typecheck >/dev/null && node scripts/qa-phase1-report-regression.mjs && node scripts/qa-ai-mock-grounding-regression.mjs'
run step17-production      node scripts/backend-step17-production-security-regression.mjs
start_api || exit 1
run admin-api              node scripts/qa-admin-regression.mjs
start_api; export API_ROOT="http://localhost:$PORT"
run password-recovery      env API="$API_ROOT" node scripts/qa-password-recovery-regression.mjs
start_api
run admin-reset-sessions   node scripts/qa-admin-reset-sessions-regression.mjs
start_api
run data-lifecycle         node scripts/qa-data-lifecycle-regression.mjs
start_api
run codex-findings-e2e     node scripts/qa-codex-findings-regression.mjs people
start_api
run admin-review-e2e       node scripts/qa-admin-review-e2e.mjs it
echo; printf '%s\n' "${RESULTS[@]}"; echo "logs: $TMP"
printf '%s\n' "${RESULTS[@]}" | grep -q '^FAIL' && exit 1 || exit 0
