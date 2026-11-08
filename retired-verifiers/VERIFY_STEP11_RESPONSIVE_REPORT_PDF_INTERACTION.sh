#!/usr/bin/env bash
set -u
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"
python3 - <<'PY'
from pathlib import Path
checks=[]
def check(name, ok):
    checks.append((name,bool(ok))); print(('PASS' if ok else 'FAIL'), name)
report=Path('frontend/src/pages/Report.tsx').read_text(encoding='utf-8')
radar=Path('frontend/src/components/BusinessRadar.tsx').read_text(encoding='utf-8')
results=Path('frontend/src/pages/Results.tsx').read_text(encoding='utf-8')
priorities=Path('frontend/src/pages/Priorities.tsx').read_text(encoding='utf-8')
css=Path('frontend/src/release-r1721-4-step11.css').read_text(encoding='utf-8')
main=Path('frontend/src/main.tsx').read_text(encoding='utf-8')
check('Step11 CSS loaded after Step10', main.rfind('release-r1721-4-step11.css') > main.rfind('release-r1721-4-step10.css'))
check('PDF has separate fourth 12-month roadmap page', 'function PrintPageFour' in report and '<PrintPageFour m={m}/>' in report and 'page={4}' in report)
check('PDF pagination preserves separated roadmap section', ('total=4' in report) or ('total=5' in report))
check('Homepage icon size increased', '--radar-icon-size:76px!important' in css and 'width:56px!important;height:56px!important' in css)
check('Average score background remains white on hover', '.business-radar--icons .business-radar__center:hover' in css and 'background:#fff!important' in css)
check('Report outer five-category wrapper has no outline', '.report-domain-switcher--v20{' in css and 'border:0!important;outline:0!important' in css)
check('Individual report categories regain outline', 'border:2px solid #dce4df!important' in css and 'border:2px solid var(--domain-accent)!important' in css)
check('Individual report active animation restored', 'animation:r1721DomainOpen .34s var(--r1721-ease) both!important' in css)
check('Report category icons increased', 'report-domain-switcher__icon .icon{width:48px!important;height:48px!important}' in css)
check('Diagnosis status is larger notification square', 'width:46px!important;height:46px!important' in css and 'border-radius:12px!important' in css)
check('Report status is larger notification square', 'width:34px!important;height:34px!important' in css and 'report-domain-switcher__state.is-report{background:#176b4d!important}' in css)
check('Whole roadmap card is tappable completion control', 'report-roadmap-card--tappable' in report and 'role="button"' in report and 'aria-pressed={done}' in report)
check('Old checkbox control removed from report source', 'className="report-plan-complete"' not in report)
check('Completed roadmap card gets green full outline', '.report-roadmap-card--tappable.is-complete' in css and 'border:3px solid #188356!important' in css)
check('Report pages have four-sided colored outline', '.report-screen-page{' in css and 'border:4px solid color-mix' in css)
check('Visible /100 removed from Report', '/100' not in report)
check('Visible /100 removed from Results', '/100' not in results)
check('Visible /100 removed from Priorities', '/ 100' not in priorities and '/100' not in priorities)
check('Homepage radar tooltip no /100 display', '))}/100' not in radar and '))}' in radar)
check('Responsive tablet rule retained', '@media(max-width:900px)' in css)
check('Responsive mobile rule retained', '@media(max-width:620px)' in css)
failed=[name for name,ok in checks if not ok]
print({'status':'FAIL' if failed else 'PASS','checks':len(checks),'failed':failed})
raise SystemExit(1 if failed else 0)
PY
