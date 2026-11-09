#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"
LOG_DIR="$ROOT/STEP11_AUDIT"
mkdir -p "$LOG_DIR"
SUMMARY="$LOG_DIR/STEP11_GATE_SUMMARY.tsv"
printf 'gate\tstatus\tdetail\n' > "$SUMMARY"
run(){
  local name="$1"; shift
  echo "===== $name ====="
  if "$@" > >(tee "$LOG_DIR/${name}.log") 2>&1; then
    printf '%s\tPASS\t%s\n' "$name" "completed" >> "$SUMMARY"
  else
    printf '%s\tFAIL\t%s\n' "$name" "see ${name}.log" >> "$SUMMARY"
    return 1
  fi
}

run step10_wording bash VERIFY_STEP10_MONGOLIAN_WORDING_INTEGRATION.sh
run engine_typecheck bash -lc 'cd backend && ./node_modules/.bin/tsc -p tsconfig.engine.json'
run strategy_typecheck bash -lc 'cd backend && ./node_modules/.bin/tsc -p tsconfig.strategy.json'
run adaptive_routing bash -lc 'cd backend && node scripts/step2-adaptive-routing-regression.mjs'
run confidence bash -lc 'cd backend && node scripts/step3-confidence-regression.mjs'
run scoring bash -lc 'cd backend && node scripts/step4-scoring-regression.mjs'
run cell_reachability bash -lc 'cd backend && node scripts/step5-cell-reachability-regression.mjs'
run targeted_synthetic bash -lc 'cd backend && node scripts/step11-targeted-synthetic-regression.mjs'
run recommendations bash -lc 'cd backend && node scripts/step8-recommendations-regression.mjs'
run action_plan bash -lc 'cd backend && node scripts/step9-action-plan-regression.mjs'
run persistence_static bash -lc 'cd backend && node scripts/step11-persistence-static-acceptance.mjs'
run persistence_runtime bash -lc 'cd backend && node scripts/step11-persistence-runtime.mjs'
run traceability_static bash -lc 'cd backend && node scripts/step12-traceability-static-acceptance.mjs'
run traceability_runtime bash -lc 'cd backend && node scripts/step12-traceability-runtime.mjs'
run security_static bash -lc 'cd backend && node scripts/step13-security-static-acceptance.mjs'
run security_runtime bash -lc 'cd backend && node scripts/step13-security-runtime.mjs'
run api_static bash -lc 'cd backend && node scripts/api-static-check.mjs'
run billing_retake_static bash -lc 'cd backend && node scripts/step11-billing-retake-static.mjs'
run ui_polish bash VERIFY_UI_POLISH.sh
run css_regression bash VERIFY_STEP09_CSS_REGRESSION.sh

# Step 10 final architecture consolidates the former release-r1721-4-stepXX.css
# layers into canonical component/page CSS. Historical layer-specific verifiers
# are intentionally retired. Current visual contracts are enforced by:
#   VERIFY_UI_POLISH.sh             -> 120/120
#   VERIFY_STEP09_CSS_REGRESSION.sh -> 92/92
run shell_syntax bash -lc "find . -path './backend/node_modules' -prune -o -type f -name '*.sh' -print0 | xargs -0 -n1 bash -n"

# This audit is informational: it detects older customer-facing report/action-plan English that predates the question-bank integration.
echo '===== report_language_audit ====='
(cd backend && node scripts/step11-report-language-audit.mjs) | tee "$LOG_DIR/report_language_audit.log"
REPORT_LANG_STATUS=$(node -e "const j=require('./STEP11_REPORT_LANGUAGE_AUDIT.json');process.stdout.write(j.status)")
printf '%s\t%s\t%s\n' report_language_audit "$REPORT_LANG_STATUS" 'pre-existing report/action-plan language; does not change question/scoring gate' >> "$SUMMARY"

if [[ "${MMRI_STEP11_CONNECTED_GATE:-NO}" != "YES" ]]; then
  printf '%s\tHOLD_NOT_RUN\t%s\n' connected_postgres_browser 'set MMRI_STEP11_CONNECTED_GATE=YES on Linux with Docker/PostgreSQL and installed dependencies' >> "$SUMMARY"
  echo 'SOURCE/RUNTIME-HARNESS REGRESSION: PASS'
  echo 'CONNECTED POSTGRES/FRONTEND BUILD GATE: HOLD_NOT_RUN'
  echo "Summary: $SUMMARY"
  exit 0
fi

run connected_postgres_browser bash backend/scripts/step11-connected-release-gate.sh
echo 'SOURCE + CONNECTED STEP-11 REGRESSION: PASS'
echo "Summary: $SUMMARY"
