#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"
MODE="${1:---source-only}"
pass(){ printf 'PASS: %s\n' "$*"; }
fail(){ printf 'STEP 10 FINAL FREEZE FAIL: %s\n' "$*" >&2; exit 1; }

[[ -f CURRENT_RELEASE.txt ]] || fail "CURRENT_RELEASE.txt missing"
[[ "$(cat CURRENT_RELEASE.txt)" == "MMRI_FINAL_20_OF_20_FULL_INTEGRATION_2026-10-26" ]] || fail "core release marker changed unexpectedly"
pass "core 20/20 release marker preserved"
[[ -f CURRENT_REFINEMENT_RELEASE.txt ]] || fail "CURRENT_REFINEMENT_RELEASE.txt missing"
[[ "$(cat CURRENT_REFINEMENT_RELEASE.txt)" == "MMRI_STEP_10_OF_10_FINAL_FREEZE_2026-10-29" ]] || fail "refinement release marker"
pass "10/10 refinement marker"

for req in frontend/src/main.tsx frontend/src/App.tsx backend/src/report/pdf-artifact.ts backend/pdf_renderer/render_report_pdf.py VERIFY_UI_POLISH.sh VERIFY_STEP09_CSS_REGRESSION.sh; do
  [[ -f "$req" ]] || fail "required file missing: $req"
done
pass "required source surfaces present"

if find frontend/src backend/src -type f \( -name '*.bak' -o -name '*~' \) -print -quit | grep -q .; then
  find frontend/src backend/src -type f \( -name '*.bak' -o -name '*~' \) -print >&2
  fail "source backup files remain"
fi
pass "no source backup copies"

if find frontend/src -type f \( -name 'release-*.css' -o -name 'repair-*.css' -o -name 'liquid-*.css' -o -name 'home.css' -o -name 'experience.css' -o -name 'modern.css' -o -name 'motion.css' -o -name 'responsive.css' -o -name 'simplified.css' \) -print -quit | grep -q .; then
  find frontend/src -type f \( -name 'release-*.css' -o -name 'repair-*.css' -o -name 'liquid-*.css' -o -name 'home.css' -o -name 'experience.css' -o -name 'modern.css' -o -name 'motion.css' -o -name 'responsive.css' -o -name 'simplified.css' \) -print >&2
  fail "retired frontend CSS artifacts remain"
fi
pass "retired frontend CSS layers removed"

./VERIFY_UI_POLISH.sh >/tmp/mmri_step10_ui_gate.log
grep -q 'UI POLISH GATE: 122/122 PASS' /tmp/mmri_step10_ui_gate.log || { cat /tmp/mmri_step10_ui_gate.log; fail "UI polish gate"; }
pass "UI polish 122/122"

./VERIFY_FRONTEND_WHITE_PRISM.sh >/tmp/mmri_step10_prism_gate.log || { cat /tmp/mmri_step10_prism_gate.log; fail "White Prism frontend contract"; }
pass "White Prism frontend contract"

./VERIFY_STEP09_CSS_REGRESSION.sh >/tmp/mmri_step10_css_gate.log
grep -q 'STEP 09 CSS REGRESSION GATE: 100/100 PASS' /tmp/mmri_step10_css_gate.log || { cat /tmp/mmri_step10_css_gate.log; fail "CSS regression gate"; }
pass "CSS regression 92/92"

python3 - <<'PY'
from pathlib import Path
import ast, json
for p in Path('backend/pdf_renderer').glob('*.py'):
    ast.parse(p.read_text(encoding='utf-8'), filename=str(p))
for p in [Path('frontend/package.json'),Path('frontend/package-lock.json'),Path('frontend/tsconfig.json'),Path('backend/package.json'),Path('backend/package-lock.json'),Path('backend/tsconfig.json'),Path('backend/tsconfig.engine.json'),Path('backend/tsconfig.strategy.json'),Path('backend/tsconfig.production.json')]:
    json.loads(p.read_text(encoding='utf-8'))
print('PASS: Python renderer + release JSON/config syntax')
PY

SRC_VER="$(grep -o 'MMRI-PDF-[0-9.]*-BUSINESS-REPORT' backend/src/report/pdf-artifact.ts | head -1)"
PY_VER="$(grep -o 'MMRI-PDF-[0-9.]*-BUSINESS-REPORT' backend/pdf_renderer/render_report_pdf.py | head -1)"
[[ "$SRC_VER" == "MMRI-PDF-1.5-BUSINESS-REPORT" && "$PY_VER" == "$SRC_VER" ]] || fail "PDF source/renderer generator version mismatch"
pass "PDF generator 1.5 source/renderer synchronized"

(
  cd backend
  node scripts/backend-step12-report-pdf-static.mjs >/tmp/mmri_step10_pdf_static.log
  node scripts/backend-step10-ai-boundary-static.mjs >/tmp/mmri_step10_ai_boundary.log
  node scripts/backend-step11-ai-reliability-static.mjs >/tmp/mmri_step10_ai_reliability.log
  node scripts/backend-step19-production-operations-static.mjs >/tmp/mmri_step10_ops_static.log
)
grep -q '"status": "PASS"' /tmp/mmri_step10_pdf_static.log || { cat /tmp/mmri_step10_pdf_static.log; fail "PDF static backend gate"; }
grep -q '"failed": 0' /tmp/mmri_step10_ai_boundary.log || { cat /tmp/mmri_step10_ai_boundary.log; fail "AI boundary static gate"; }
grep -q '"status": "PASS"' /tmp/mmri_step10_ai_reliability.log || { cat /tmp/mmri_step10_ai_reliability.log; fail "AI reliability static gate"; }
grep -q '"status": "PASS"' /tmp/mmri_step10_ops_static.log || { cat /tmp/mmri_step10_ops_static.log; fail "operations static gate"; }
pass "backend PDF/AI/operations static gates"

# Shell and JS syntax are dependency-free and catch broken packaging edits.
while IFS= read -r -d '' f; do bash -n "$f"; done < <(find . -path './.git' -prune -o -path './backend/dist' -prune -o -path './backend/dist-engine' -prune -o -path './backend/dist-strategy' -prune -o -path './frontend/dist' -prune -o -type f -name '*.sh' -print0)
pass "shell syntax"
while IFS= read -r -d '' f; do node --check "$f" >/dev/null; done < <(find backend/scripts ops -type f \( -name '*.mjs' -o -name '*.js' \) -print0 2>/dev/null)
pass "Node script syntax"

if [[ "$MODE" == "--post-build" ]]; then
  [[ -f frontend/dist/index.html ]] || fail "frontend production dist missing after build"
  [[ -f backend/dist-strategy/report/pdf-artifact.js ]] || fail "strategy dist missing after build"
  grep -q 'MMRI-PDF-1.5-BUSINESS-REPORT' backend/dist-strategy/report/pdf-artifact.js || fail "compiled PDF generator not synchronized"
  pass "post-build frontend and backend artifacts"
elif [[ "$MODE" != "--source-only" ]]; then
  fail "unknown mode: $MODE"
fi

echo
echo "MMRI STEP 10/10 FINAL FREEZE: PASS ($MODE)"
