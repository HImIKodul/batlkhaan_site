#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT/backend"
: "${DATABASE_URL:?DATABASE_URL is required for the connected Step-11 gate}"
command -v docker >/dev/null || { echo 'Docker is required for connected Step-11 certification.' >&2; exit 70; }
export MMRI_ENVIRONMENT="${MMRI_ENVIRONMENT:-integration}"

echo '[connected 1/8] dependencies/schema'
npm run db:generate
npx prisma migrate deploy

echo '[connected 2/8] Marketing 3.0.2 / QBANK 3.1.2 import + validating verification'
npm run validate:bundle
npm run db:import
npm run db:verify

echo '[connected 3/8] HR/Finance/IT/Operations candidate imports'
bash scripts/import-five-domain-candidates.sh

echo '[connected 4/8] five-domain promotion'
MMRI_FIVE_DOMAIN_PROMOTION_OK=YES MMRI_ENVIRONMENT="$MMRI_ENVIRONMENT" npx tsx src/promote-five-domain-methodologies.ts

echo '[connected 5/8] active five-domain verification'
npx tsx src/verify-five-domain-live.ts

echo '[connected 6/8] persistence/trace/report DB verifiers'
npx tsx src/verify-step11-persistence.ts
npx tsx src/verify-step12-traceability.ts
npx tsx src/verify-diagnosis-result.ts
npx tsx src/verify-strategy-plan-binding.ts
npx tsx src/verify-ai-report-binding.ts

echo '[connected 7/8] demo/report surfaces'
npx tsx src/seed-demo-company.ts
npx tsx src/verify-demo-surfaces.ts

echo '[connected 8/8] production builds'
npm run build:prod
cd "$ROOT/frontend"
npm run build

echo 'CONNECTED STEP-11 RUNTIME: PASS'
echo 'Live QPay merchant callback and real bank settlement remain external-provider acceptance, not simulated by this gate.'
