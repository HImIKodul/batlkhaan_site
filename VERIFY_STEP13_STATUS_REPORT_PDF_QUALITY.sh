#!/usr/bin/env bash
set -u
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"
python3 - <<'PY'
from pathlib import Path
checks=[]
def check(name, ok):
    ok=bool(ok); checks.append((name,ok)); print(('PASS' if ok else 'FAIL'),name)
report=Path('frontend/src/pages/Report.tsx').read_text(encoding='utf-8')
diag=Path('frontend/src/pages/DiagnosisHub.tsx').read_text(encoding='utf-8')
css=Path('frontend/src/release-r1721-4-step13.css').read_text(encoding='utf-8')
main=Path('frontend/src/main.tsx').read_text(encoding='utf-8')
check('Step13 CSS loaded after Step12', main.rfind('release-r1721-4-step13.css') > main.rfind('release-r1721-4-step12.css'))
check('Diagnosis status enlarged', 'width:clamp(56px,4.25vw,70px)' in css)
check('Diagnosis status uses white icon-first surface', 'background:#fff!important' in css and 'border:3px solid currentColor!important' in css)
check('Diagnosis status icons are larger', 'width:66%!important;height:66%!important' in css)
check('Diagnosis status icon vocabulary updated', all(x in diag for x in ["icon:'lock'","icon:'play'","icon:'trend'","icon:'file'"]))
check('Report status centered over category', 'left:calc(50% - 19px)!important;right:auto!important' in css)
check('Report status surface is restrained', 'background:#f5f7f6!important' in css)
check('Report status icon vocabulary updated', "s==='locked'?'lock':s==='ready'?'play':s==='progress'?'trend':'file'" in report)
check('Last system report page uses two-column plan', 'grid-template-columns:repeat(2,minmax(0,1fr))!important' in css)
check('Odd final plan stage spans full width', 'nth-last-child(1):nth-child(odd)' in css and 'grid-column:1/-1!important' in css)
check('Score improvement receives stronger hierarchy', '.report-improvement--compact::before' in css and 'background:var(--report-accent)!important;color:#fff!important;font-size:21px!important' in css)
check('PDF plan rebalanced two plus three stages', 'm.plan.slice(0,2)' in report and 'm.plan.slice(2)' in report and 'offset+2' in report)
check('PDF waits for fonts before print', 'await document.fonts.ready' in report)
check('PDF waits for two render frames', 'requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))' in report)
check('PDF exact print colors enabled', '-webkit-print-color-adjust:exact!important' in css and 'print-color-adjust:exact!important' in css)
check('PDF stage/action break protection enabled', 'page-break-inside:avoid!important' in css and '.pdf-plan-stage__actions>div' in css)
check('Responsive mobile status sizes retained', '@media(max-width:620px)' in css and 'width:52px!important;height:52px!important' in css)
failed=[name for name,ok in checks if not ok]
print({'status':'FAIL' if failed else 'PASS','checks':len(checks),'failed':failed})
raise SystemExit(1 if failed else 0)
PY
