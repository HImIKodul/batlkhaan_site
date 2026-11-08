#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
python3 - "$ROOT" <<'PY'
from pathlib import Path
import sys,re
root=Path(sys.argv[1])
report=(root/'frontend/src/pages/Report.tsx').read_text(encoding='utf-8')
main=(root/'frontend/src/main.tsx').read_text(encoding='utf-8')
css=(root/'frontend/src/release-r1721-4-step06.css').read_text(encoding='utf-8')
errors=[]
checks=[
 ('Step06 CSS loaded',"import './release-r1721-4-step06.css';" in main),
 ('Step06 CSS last',main.rfind("release-r1721-4-step06.css")>main.rfind("release-r1721-4-step05.css")),
 ('PDF icon enlarged','<Icon name="download" size={31}/>' in report),
 ('domain icons enlarged','<Icon name={a.icon} size={40}/>' in report),
 ('PDF right aligned','right:0!important' in css and 'left:auto!important' in css),
 ('PDF hover fixed','report-top-download:hover' in css and 'transform:translateY(-50%)!important' in css),
 ('domain keyframe disabled','report-domain-switcher--v20 button.is-active' in css and 'animation:none!important' in css),
 ('simple report fade','r1721Step06ReportFade' in css and 'scaleY' not in css),
 ('chronological live sort',"sort((a,b)=>new Date(a.completedAt||a.updatedAt).getTime()-new Date(b.completedAt||b.updatedAt).getTime())" in report),
 ('chronological demo sort',"sort((a,b)=>new Date(a.date).getTime()-new Date(b.date).getTime())" in report),
 ('purpose projection numeric','report-purpose-score__tip' in report and '<small>/100</small>' in report),
 ('old visible purpose labels removed','<small>Одоо</small>' not in report and '<small>Зорилтот түвшин</small>' not in report),
 ('overall target tooltip','report-improvement__tip' in report),
 ('overall long text moved out of layout','<b>12 сарын ажлуудыг дарааллаар хэрэгжүүлсний дараах зорилтот түвшин</b>' not in report),
 ('white system tooltips','background:#fff!important' in css and 'report-purpose-score__tip' in css),
 ('responsive controls','@media(max-width:760px)' in css and '@media(max-width:480px)' in css),
]
for name,ok in checks:
    if not ok: errors.append(name)
if errors:
    print('STEP 06 REPORT CONTROLS: FAIL')
    for e in errors: print(' -',e)
    raise SystemExit(1)
print('STEP 06 REPORT CONTROLS: PASS')
PY
