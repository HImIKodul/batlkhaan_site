#!/usr/bin/env bash
set -u
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"
python3 - <<'PY2'
from pathlib import Path
checks=[]
def check(name,ok):
    checks.append((name,bool(ok))); print(('PASS' if ok else 'FAIL'),name)
report=Path('frontend/src/pages/Report.tsx').read_text(encoding='utf-8')
diag=Path('frontend/src/pages/DiagnosisHub.tsx').read_text(encoding='utf-8')
css=Path('frontend/src/release-r1721-4-step12.css').read_text(encoding='utf-8')
main=Path('frontend/src/main.tsx').read_text(encoding='utf-8')
check('Step12 CSS loaded after Step11', main.rfind('release-r1721-4-step12.css') > main.rfind('release-r1721-4-step11.css'))
check('Diagnosis status overlaps card corner', 'top:clamp(-14px' in css and 'right:clamp(-14px' in css)
check('Diagnosis status size scales with tile', 'width:clamp(40px,3.1vw,50px)' in css)
check('Report status overlaps selector corner', 'top:clamp(-10px' in css and 'right:clamp(-10px' in css)
check('Report status scales to smaller selector', 'width:clamp(29px,2.15vw,36px)' in css)
check('Status colors updated', all(x in css for x in ['#56616a','#2f6fed','#d78b17','#11865b']))
check('Status icons updated in diagnosis', all(x in diag for x in ["icon:'lock'","icon:'play'","icon:'trend'","icon:'file'"]))
check('Status icons updated in report', "s==='locked'?'lock':s==='ready'?'play':s==='progress'?'trend':'file'" in report)
check('Homepage hover remains background-free', '.business-radar--icons .business-radar__category-tip{' in css and 'background:transparent!important' in css)
check('Homepage hover uses category color', 'color:var(--domain-accent)!important' in css)
check('Homepage hover gains refined accent line', '.business-radar--icons .business-radar__category-tip::after' in css)
check('PDF expanded to five professional pages', 'total=5' in report and 'function PrintPageFive' in report and '<PrintPageFive m={m}/>' in report)
check('PDF includes overall score and conclusion', 'НИЙТ ҮНЭЛГЭЭ' in report and 'Ерөнхий дүгнэлт' in report and '{m.conclusion}' in report)
check('PDF includes all five strengths', 'm.positives.map' in report and '5 давуу тал' in report)
check('PDF includes all five weaknesses', 'm.flaws.map' in report and '5 сул тал' in report)
check('PDF includes all five critical actions', 'm.purposes.map' in report and 'Нэн тэргүүний 5 ажил' in report)
check('PDF includes overall improvement score movement', 'pdf-target-strip--plan' in report and '{m.score}' in report and '{m.target}' in report)
check('PDF includes every roadmap stage', 'm.plan.slice(0,2)' in report and 'm.plan.slice(2)' in report)
check('PDF includes every roadmap action', 'stage.actions.map' in report)
check('PDF includes roadmap result wording', 'mnCustomerText(a.result)' in report)
check('PDF includes roadmap measurement wording', 'mnCustomerText(a.measure)' in report)
check('PDF plan pages have anti-clipping layout', 'break-inside:avoid!important' in css and '.pdf-plan-stage__actions' in css)
check('Responsive ornament rules retained', '@media(max-width:620px)' in css)
failed=[n for n,ok in checks if not ok]
print({'status':'FAIL' if failed else 'PASS','checks':len(checks),'failed':failed})
raise SystemExit(1 if failed else 0)
PY2
