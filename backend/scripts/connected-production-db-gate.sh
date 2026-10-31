#!/usr/bin/env bash
set -euo pipefail
: "${MIGRATION_DATABASE_URL:?MIGRATION_DATABASE_URL is required}"
: "${DATABASE_URL:?DATABASE_URL is required}"
if [[ "$MIGRATION_DATABASE_URL" == "$DATABASE_URL" ]]; then echo 'Runtime and migration database credentials must differ' >&2; exit 90; fi
if [[ "${NODE_ENV:-}" != "production" ]]; then echo 'NODE_ENV=production is required' >&2; exit 91; fi
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; BACKEND="$(cd "$HERE/.." && pwd)"
cd "$BACKEND"
node scripts/verify-migration-chain.mjs >/dev/null
RUNTIME_DATABASE_URL="$DATABASE_URL"
export DATABASE_URL="$MIGRATION_DATABASE_URL"
echo '[1/6] Apply committed Prisma migrations with migration role'
./node_modules/.bin/prisma migrate deploy
echo '[2/6] Confirm migration history is current'
./node_modules/.bin/prisma migrate status
echo '[3/6] Import/verify current frozen methodology bundle'
npm run db:import
npm run db:verify
echo '[4/6] Switch to least-privilege runtime role'
export DATABASE_URL="$RUNTIME_DATABASE_URL"
unset MIGRATION_DATABASE_URL
echo '[5/6] Run backend database integrity verifiers'
for task in \
  db:verify:backend-integrity \
  db:verify:backend-auth-tenant \
  db:verify:backend-lifecycle \
  db:verify:backend-answers \
  db:verify:persistence \
  db:verify:traceability \
  db:verify:diagnosis \
  db:verify:strategy-plan \
  db:verify:backend-ai-reliability \
  db:verify:backend-pdf \
  db:verify:backend-payment \
  db:verify:backend-production-security; do
  npm run "$task"
done
echo '[6/6] Connected production database gate PASS'
