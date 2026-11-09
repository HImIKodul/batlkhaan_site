#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"
command -v docker >/dev/null || { echo 'Docker is required.'; exit 2; }
docker info >/dev/null
bash VERIFY_STEP12_FINAL_FREEZE.sh
(cd backend && npm ci && npm run engine:typecheck && npx tsc -p tsconfig.strategy.json)
(cd frontend && npm ci && npm run build)
(cd backend && node scripts/step2-adaptive-routing-regression.mjs && node scripts/step3-confidence-regression.mjs && node scripts/step4-scoring-regression.mjs && node scripts/step5-cell-reachability-regression.mjs && node scripts/step11-targeted-synthetic-regression.mjs && node scripts/step8-recommendations-regression.mjs && node scripts/step9-action-plan-regression.mjs)
(cd backend && bash scripts/step11-connected-release-gate.sh)
echo 'STEP12 CONNECTED RELEASE GATE: PASS'
