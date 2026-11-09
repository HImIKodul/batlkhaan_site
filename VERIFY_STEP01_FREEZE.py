#!/usr/bin/env python3
from pathlib import Path
import hashlib,json,re,sys
root=Path(__file__).resolve().parent
manifest=json.loads((root/'STEP01_FROZEN_BASELINE.json').read_text(encoding='utf-8'))
errors=[]
for rel,expected in manifest['fullFileHashes'].items():
    p=root/rel
    if not p.exists():
        errors.append(f'MISSING frozen file: {rel}')
        continue
    got=hashlib.sha256(p.read_bytes()).hexdigest()
    if got!=expected: errors.append(f'CHANGED frozen file: {rel}')
report=(root/'frontend/src/pages/Report.tsx').read_text(encoding='utf-8')
css=(root/'frontend/src/release-r1721.css').read_text(encoding='utf-8')
def fn(name,next_name=None):
    try: start=report.index(f'function {name}')
    except ValueError:
        errors.append(f'MISSING plan function: {name}'); return ''
    if next_name:
        try: end=report.index(f'function {next_name}',start+1)
        except ValueError:
            errors.append(f'MISSING next function after {name}: {next_name}'); return ''
    else:
        m=re.search(r'\n(?:function |export default function )',report[start+1:]); end=(start+1+m.start()+1) if m else len(report)
    return report[start:end].strip()
frags={
 'phaseBounds':fn('phaseBounds','stageDateRange'),
 'stageDateRange':fn('stageDateRange','demoModel'),
 'PlanActionCopy':fn('PlanActionCopy','PlanCard'),
 'PlanCard':fn('PlanCard','PageThree'),
 'PrintPlanStage':fn('PrintPlanStage','PrintPlanPage'),
 'PrintPlanPage':fn('PrintPlanPage','PrintReport'),
}
selectors=(
 '.report-roadmap-human','.report-roadmap-card--natural','.report-roadmap-card__time',
 '.report-roadmap-card__work','.report-plan-action-copy','.report-plan-action-copy__check',
 '.print-plan-grid','.print-plan-stage--natural','.print-plan-stage__time','.print-plan-stage__work','.print-remeasure'
)
selected=[]
for line in css.splitlines():
    s=line.strip()
    if any(s.startswith(x) for x in selectors): selected.append(s)
frags['plan_css_core']='\n'.join(selected)
for name,expected in manifest['planFragmentHashes'].items():
    got=hashlib.sha256(frags.get(name,'').encode()).hexdigest()
    if got!=expected: errors.append(f'CHANGED frozen 365-plan fragment: {name}')
if errors:
    print('STEP 01 FREEZE: FAIL')
    for e in errors: print(' -',e)
    sys.exit(1)
print(f"STEP 01 FREEZE: PASS ({len(manifest['fullFileHashes'])} frozen files + {len(manifest['planFragmentHashes'])} plan fragments)")
