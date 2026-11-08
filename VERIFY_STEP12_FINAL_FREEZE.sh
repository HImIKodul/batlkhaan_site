#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"
python3 backend/integration/step12/VERIFY_STEP12_FINAL_INTEGRATION.py
(cd backend && node scripts/step12-customer-language-audit.mjs)
bash VERIFY_STEP08_RESPONSIVE_GLOBAL.sh >/dev/null
bash VERIFY_STEP11_RESPONSIVE_REPORT_PDF_INTERACTION.sh >/dev/null
bash VERIFY_STEP14_HOME_REPORT_PDF_POLISH.sh >/dev/null
bash VERIFY_STEP15_HOME_RADAR_GEOMETRY.sh >/dev/null
find . -path './backend/node_modules' -prune -o -type f -name '*.sh' -print0 | xargs -0 -n1 bash -n
python3 - <<'PY'
from pathlib import Path
required=['START_LOCAL.sh','STOP_LOCAL.sh','README_LINUX.md','backend/package.json','frontend/package.json','backend/methodology/MMRI_v3.0.2_QBANK_v3.1.2_FINAL_MONGOLIAN_STEP12.json']
miss=[x for x in required if not Path(x).exists()]
assert not miss,miss
print('STEP12 STATIC/SOURCE FREEZE: PASS')
PY
