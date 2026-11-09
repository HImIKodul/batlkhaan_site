#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
python3 - "$ROOT" <<'PY'
from pathlib import Path
import sys,re
root=Path(sys.argv[1])
errors=[]
prompt=(root/'backend/src/report/ai-prompt.ts').read_text(encoding='utf-8')
fallback=(root/'backend/src/report/fallback-renderer.ts').read_text(encoding='utf-8')
validator=(root/'backend/src/report/validator.ts').read_text(encoding='utf-8')
coord=(root/'backend/src/report/coordinator.ts').read_text(encoding='utf-8')
service=(root/'backend/src/services/prisma-strategy-report-service.ts').read_text(encoding='utf-8')
report=(root/'frontend/src/pages/Report.tsx').read_text(encoding='utf-8')
main=(root/'frontend/src/main.tsx').read_text(encoding='utf-8')
css=(root/'frontend/src/release-r1721-4-step05.css').read_text(encoding='utf-8')
required=[
 ('prompt version','MMRI-AI-REPORT-PROMPT-1.5' in prompt),
 ('single S10 prompt','return exactly ONE claim' in prompt),
 ('AI action guidance','For S06' in prompt and 'practical management guidance' in prompt),
 ('single conclusion validator','V26' in validator and 'claims.length!==1' in validator),
 ('conclusion length validator','V27' in validator and '120–240' in validator),
 ('foreign-term repair','V28' in validator),
 ('validator version','MMRI-NARRATIVE-VALIDATOR-1.3-CONCLUSION' in validator),
 ('fallback conclusion','function conclusionText(' in fallback and 'titleMn:"Ерөнхий дүгнэлт"' in fallback),
 ('no fallback internal IDs','${r.categoryId}/${r.cellId}' not in fallback),
 ('no fallback Deliverable','Deliverable:' not in fallback),
 ('no fallback KPI label','KPI:' not in fallback),
 ('coordinator current prompt metadata','promptVersion:MMRI_AI_REPORT_PROMPT_VERSION' in coord),
 ('stale contract regeneration','contractCurrent' in service and 'shouldUpgradeFallback' in service),
 ('current validator persistence','validatorVersion:MMRI_NARRATIVE_VALIDATOR_VERSION' in service),
 ('frontend conclusion field','conclusion:string' in report),
 ('frontend S10 consumer',"find(s=>s.id==='S10')" in report),
 ('single screen conclusion','<p>{m.conclusion}</p>' in report),
 ('old summary helper removed','function summaryText(' not in report),
 ('Step05 CSS loaded last',"import './release-r1721-4-step05.css';" in main and main.rfind("release-r1721-4-step05.css")>main.rfind("release-r1721-4-step02.css")),
 ('conclusion no clipping','max-height:none!important' in css and 'word-break:normal!important' in css),
]
for name,ok in required:
    if not ok: errors.append(name)
# There must remain only one visible summary heading in the screen component and one in print.
if report.count('<h3>Ерөнхий дүгнэлт</h3>')!=2:
    errors.append('expected exactly one screen + one print conclusion heading')
if errors:
    print('STEP 05 AI REPORT: FAIL')
    for e in errors: print(' -',e)
    raise SystemExit(1)
print('STEP 05 AI REPORT: PASS')
PY
