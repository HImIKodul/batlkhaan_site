#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:=postgresql://mmri:mmri@localhost:5432/mmri?schema=public}"
export DATABASE_URL
export MMRI_TARGET_METHODOLOGY_VERSION="${MMRI_TARGET_METHODOLOGY_VERSION:-3.0.0}"
export MMRI_TARGET_METHODOLOGY_BUNDLE="${MMRI_TARGET_METHODOLOGY_BUNDLE:-methodology/MMRI_v3.0.3_QBANK_v3.1.3_STEP6_OF6_ACCEPTED_FINAL.json}"

if [[ "${MMRI_INTEGRATION_RESET_OK:-}" != "YES" ]]; then
  echo "Refusing destructive PostgreSQL integration reset." >&2
  echo "Run only against a disposable integration DB and set MMRI_INTEGRATION_RESET_OK=YES." >&2
  exit 2
fi
if [[ "${MMRI_ENVIRONMENT:-}" != "integration" ]]; then
  echo "Refusing candidate activation outside MMRI_ENVIRONMENT=integration." >&2
  exit 2
fi
if [[ "${NODE_ENV:-development}" == "production" ]]; then
  echo "Refusing disposable integration activation in NODE_ENV=production." >&2
  exit 2
fi

printf '%s\n' "[1/8] Prisma client generation"
npx prisma generate

printf '%s\n' "[2/8] Reset disposable integration DB and apply COMMITTED migration history"
npx prisma migrate reset --force --skip-seed

printf '%s\n' "[3/8] Verify Prisma migration status"
npx prisma migrate status

printf '%s\n' "[4/8] Validate methodology v3.0.0 bundle"
npm run validate:bundle

printf '%s\n' "[5/8] Import + disposable-only activate methodology v3.0.0"
MMRI_EXPECT_METHODOLOGY_VERSION=3.0.0 MMRI_IMPORT_TARGET_ONLY=YES MMRI_INTEGRATION_ACTIVATE_CANDIDATE=YES \
  npx tsx src/import-methodology.ts "$MMRI_TARGET_METHODOLOGY_BUNDLE"

printf '%s\n' "[6/8] Verify imported relational counts against the v3.0.0 bundle"
MMRI_EXPECT_METHODOLOGY_STATUS=ACTIVE npx tsx src/verify-methodology-import.ts 3.0.0 "$MMRI_TARGET_METHODOLOGY_BUNDLE"

printf '%s\n' "[7/8] Execute live PostgreSQL transactional assessment/strategy/report gate on v3.0.0"
npx tsx src/integration/postgres-gate.ts

printf '%s\n' "[8/8] Re-run deterministic source regression"
npm run release:verify

printf '%s\n' "POSTGRESQL + PRISMA v3.0.0 DISPOSABLE INTEGRATION GATE: PASS"
