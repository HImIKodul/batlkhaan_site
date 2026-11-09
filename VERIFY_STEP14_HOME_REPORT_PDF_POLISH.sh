#!/usr/bin/env bash
set -u
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"
python3 - <<'PY'
from pathlib import Path
checks=[]
def check(name, ok):
    ok=bool(ok); checks.append((name,ok)); print(('PASS' if ok else 'FAIL'),name)
main=Path('frontend/src/main.tsx').read_text(encoding='utf-8')
css=Path('frontend/src/release-r1721-4-step14.css').read_text(encoding='utf-8')
report=Path('frontend/src/pages/Report.tsx').read_text(encoding='utf-8')
palette=Path('frontend/src/data/reportExperience.ts').read_text(encoding='utf-8')
radar=Path('frontend/src/components/BusinessRadar.tsx').read_text(encoding='utf-8')
check('Step14 CSS loaded last', main.rfind('release-r1721-4-step14.css') > main.rfind('release-r1721-4-step13.css'))
check('Report status moved top-right outside', 'top:-14px!important;right:-14px!important;left:auto!important' in css)
check('Report status uses restrained white surface', 'background:#fff!important;border:2px solid #e1e7e4!important' in css)
check('365 improvement arrow removed from source', '<span className="report-improvement__pulse">+{delta}</span><Icon name="arrow"' not in report)
check('365 score endpoints share domain accent', '.report-improvement--compact .report-improvement__score strong' in css and 'color:var(--report-accent)!important' in css)
check('Critical-five score block stretches right edge', 'grid-template-columns:54px minmax(0,1fr) minmax(272px,31%)!important' in css and 'width:100%!important;max-width:none!important;justify-self:stretch!important' in css)
check('Homepage icon is approximately 1.8x Step11 icon', 'width:101px!important;height:101px!important' in css)
check('Homepage hover text enlarged with icon', 'font-size:25px!important' in css)
check('Homepage logged-out average center has five-color ornament', 'business-radar__center:not(.has-score)::before' in css and 'conic-gradient(#FF3D8D' in css)
for name,hexv in [('Marketing','#FF3D8D'),('IT','#00A6FF'),('Finance','#FFD000'),('People','#7C4DFF'),('Operations','#FF6A00')]:
    check(f'{name} bright domain color', hexv in palette)
check('Status colors remain separate from domain palette', all(x in css for x in ['#364152','#0F766E','#9A5A13','#167D4D']))
check('Report hover tooltips force visible overflow', all(x in css for x in ['.report-purpose-score__tip','.report-purpose-score-change__tip','.report-improvement__tip','z-index:100!important']))
check('Average hover tooltip remains above radar', '.business-radar--icons .business-radar__average-tooltip{z-index:90!important' in css)
check('PDF consolidated to four purposeful pages', 'total=4' in report and 'function PrintPageFive' not in report and '<PrintPageFive' not in report)
check('PDF keeps every 365 stage', 'm.plan.map((stage,i)=><PdfPlanStage' in report)
check('PDF keeps every action/result/measure', all(x in report for x in ['stage.actions.map','mnCustomerText(a.result)','mnCustomerText(a.measure)']))
check('PDF page 4 uses compact complete plan grid', '.pdf-plan-full--complete' in css and 'grid-template-columns:repeat(2,minmax(0,1fr))!important' in css and 'last-child{grid-column:1/-1!important}' in css)
check('PDF print hardening retained', 'await document.fonts.ready' in report and 'requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))' in report)
check('Radar still has no hover movement', 'transform:translate(-50%,-50%)!important;transition:none!important' in css)
failed=[name for name,ok in checks if not ok]
print({'status':'FAIL' if failed else 'PASS','checks':len(checks),'failed':failed})
raise SystemExit(1 if failed else 0)
PY
