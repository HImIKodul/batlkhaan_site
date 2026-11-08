#!/usr/bin/env bash
set -u
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"
python3 - <<'PY'
from pathlib import Path
checks=[]
def check(name, ok):
    checks.append((name, bool(ok)))
    print(('PASS' if ok else 'FAIL'), name)
landing=Path('frontend/src/pages/Landing.tsx').read_text()
radar=Path('frontend/src/components/BusinessRadar.tsx').read_text()
report=Path('frontend/src/pages/Report.tsx').read_text()
css=Path('frontend/src/release-r1721-4-step09.css').read_text()
main=Path('frontend/src/main.tsx').read_text()
check('home top-right result counter removed', 'home-radar-status' not in landing)
check('radar hover secondary payment text removed', 'Төлбөр ба оношилгоо' not in radar)
check('radar average rendered without /100', 'business-radar__average-value' in radar and '`${avg}/100`' not in radar)
check('radar hover is name-only/category-colored', 'background:transparent!important' in css and '.business-radar__category-tip strong' in css and 'color:var(--domain-accent)!important' in css)
check('radar icons enlarged', 'width:46px!important;height:46px!important' in css)
check('diagnosis status anchored top-right square', 'diagnosis-status-icon' in css)
check('diagnosis states use distinct status colors', all(x in css for x in ['.diagnosis-status-icon.is-locked','.diagnosis-status-icon.is-ready','.diagnosis-status-icon.is-progress','.diagnosis-status-icon.is-report']))
check('report improvement is full-width horizontal', 'grid-template-columns:minmax(130px,.7fr) minmax(300px,3fr) minmax(130px,.7fr)' in css)
check('all report screen pages use domain accent', '.report-screen-page{' in css and 'border-top:5px solid var(--report-accent)' in css)
check('PDF download control has no animation/movement', '.report-top-download,.report-top-download:hover' in css and 'animation:none!important' in css and 'transition:none!important' in css)
check('professional PDF remains separately composed (Step11 may add dedicated roadmap page)', 'pdf-professional-report' in report and report.count('<PrintPageOne m={m}/>')==1 and report.count('<PrintPageTwo m={m}/>')==1 and report.count('<PrintPageThree m={m}/>')==1)
check('PDF hides application category selector', '.report-domain-switcher' in css and 'display:none!important' in css)
check('report selector exposes locked/ready/progress/report states', 'report-domain-switcher__state' in report and all(x in report for x in ["'locked'","'ready'","'progress'","'report'"]))
check('locked report state navigates to payment', "go('billing')" in report and "ТӨЛБӨР ТӨЛӨХ" in report)
check('progress report state can continue questionnaire', 'continueArea' in report and "go('assessment')" in report and 'АСУУЛТАА ҮРГЭЛЖЛҮҮЛЭХ' in report)
check('Step09 CSS loaded after Step08', main.rstrip().find("import './release-r1721-4-step09.css';") > main.rstrip().find("import './release-r1721-4-step08.css';"))
failed=[n for n,ok in checks if not ok]
print({'status':'FAIL' if failed else 'PASS','checks':len(checks),'failed':failed})
raise SystemExit(1 if failed else 0)
PY
