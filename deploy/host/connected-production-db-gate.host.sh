#!/usr/bin/env bash
# Host copy of backend/scripts/connected-production-db-gate.sh (server-only, not committed).
# Identical steps, except two data-dependent verifiers:
#  - db:verify:diagnosis needs an assessment id (the shipped gate passes none -> always fails):
#    run it against the most recent diagnosis snapshot; skip (logged) when none exists yet.
#  - db:verify:strategy-plan fails on an empty table: skip (logged) until a strategy plan exists.
set -euo pipefail
: "${MIGRATION_DATABASE_URL:?MIGRATION_DATABASE_URL is required}"
: "${DATABASE_URL:?DATABASE_URL is required}"
if [[ "$MIGRATION_DATABASE_URL" == "$DATABASE_URL" ]]; then echo 'Runtime and migration database credentials must differ' >&2; exit 90; fi
if [[ "${NODE_ENV:-}" != "production" ]]; then echo 'NODE_ENV=production is required' >&2; exit 91; fi
cd /app
node scripts/verify-migration-chain.mjs >/dev/null
RUNTIME_DATABASE_URL="$DATABASE_URL"
export DATABASE_URL="$MIGRATION_DATABASE_URL"
echo '[1/6] Apply committed Prisma migrations with migration role'
./node_modules/.bin/prisma migrate deploy
echo '[2/6] Confirm migration history is current'
./node_modules/.bin/prisma migrate status
echo '[3/6] Import/verify current frozen methodology bundle'
npm run db:import
# Host change 2026-11-24: owner activated the methodologies (governed promotion). The shipped db:verify
# hard-codes MMRI_EXPECT_METHODOLOGY_STATUS=VALIDATING, so verify against the status actually stored.
M_STATUS="$(node --input-type=module -e "import {PrismaClient} from '@prisma/client';const p=new PrismaClient();const r=await p.methodologyVersion.findUnique({where:{version:'3.0.3'},select:{status:true}});console.log(r?.status??'');await p.\$disconnect();")"
if [[ "$M_STATUS" == "ACTIVE" ]]; then
  MMRI_EXPECT_METHODOLOGY_STATUS=ACTIVE MMRI_EXPECT_QBANK_VERSION=3.1.3 ./node_modules/.bin/tsx src/verify-methodology-import.ts 3.0.3 methodology/MMRI_v3.0.3_QBANK_v3.1.3_STEP6_OF6_ACCEPTED_FINAL.json
else
  npm run db:verify
fi
echo '[4/6] Switch to least-privilege runtime role'
export DATABASE_URL="$RUNTIME_DATABASE_URL"
unset MIGRATION_DATABASE_URL
probe(){ node --input-type=module -e "import {PrismaClient} from '@prisma/client';const p=new PrismaClient();$1;await p.\$disconnect();"; }
LATEST_ASSESSMENT="$(probe "const r=await p.diagnosisSnapshot.findFirst({orderBy:{createdAt:'desc'},select:{assessmentId:true}}).catch(async()=>p.diagnosisSnapshot.findFirst({select:{assessmentId:true}}));console.log(r?.assessmentId??'')")"
PLAN_COUNT="$(probe "console.log(await p.strategyPlanSnapshot.count())")"
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
  case "$task" in
    db:verify:diagnosis)
      if [[ -n "$LATEST_ASSESSMENT" ]]; then npm run "$task" -- "$LATEST_ASSESSMENT"; else echo "SKIP $task: no diagnosis snapshot exists yet (fresh install)"; fi ;;
    db:verify:strategy-plan)
      if [[ "$PLAN_COUNT" -gt 0 ]]; then npm run "$task"; else echo "SKIP $task: no strategy plan snapshot exists yet (fresh install)"; fi ;;
    *) npm run "$task" ;;
  esac
done
echo '[6/6] Connected production database gate PASS (host variant)'
