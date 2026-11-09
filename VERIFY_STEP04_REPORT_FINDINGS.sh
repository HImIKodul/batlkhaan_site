#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
python3 - "$ROOT" <<'PY'
from pathlib import Path
import sys,re
root=Path(sys.argv[1])
s=(root/'frontend/src/pages/Report.tsx').read_text(encoding='utf-8')
errors=[]
required=[
 'type RankedCapability=',
 'function capabilityMeaningOnly(',
 'function rankedTieBreak(',
 'function selectFindingEnds(',
 'const {positives,flaws}=selectFindingEnds(scored,area)',
 'const {positives,flaws}=selectFindingEnds(candidates,area)',
 'if(rawScore==null||!Number.isFinite(rawScore))return null',
 'const weaknessPool=unique.length>=10?unique.filter(x=>!strongIds.has(x.id)):unique',
]
for token in required:
    if token not in s: errors.append(f'missing required Step 04 token: {token}')
for forbidden in ['function PurposeScores(', 'report-purpose-score-strip', 'print-purpose-scores']:
    if forbidden in s: errors.append(f'extra five-purpose section still rendered/referenced in Report.tsx: {forbidden}')
# Tie-break order must remain deterministic and priority-aware.
needle='return b.weightPct-a.weightPct||b.evidenceCount-a.evidenceCount||b.purposeMass-a.purposeMass||b.confidence-a.confidence||b.coverage-a.coverage||a.canonicalIndex-b.canonicalIndex||a.id.localeCompare(b.id,\'mn\')'
if needle not in s: errors.append('tie-break order changed or is not deterministic')
# Tooltip should contain meaning only, not duplicate the capability name.
m=re.search(r'function FindingColumn\([\s\S]*?function PrintMeta',s)
if not m:
    errors.append('FindingColumn block not found')
else:
    block=m.group(0)
    if '<p>{x.meaning}</p>' not in block: errors.append('finding tooltip no longer renders meaning-only text')
    tooltip=block.split('className="report-finding-tooltip"',1)[-1]
    if '{x.name}' in tooltip.split('</div></article>',1)[0]: errors.append('finding tooltip repeats capability name')
# Screen and print Page 1 must not render the extra five-purpose strip.
for fn,next_fn in [('PageOne','PageTwo'),('PrintPageOne','PrintPageTwo')]:
    try:
        a=s.index('function '+fn); b=s.index('function '+next_fn,a+1)
        block=s[a:b]
        if 'PurposeScores' in block or 'purpose-score' in block: errors.append(f'{fn} still contains the removed five-purpose strip')
    except ValueError: errors.append(f'{fn} block missing')
# Sanity simulation of documented tie policy.
rows=[
 {'id':'A','score':50,'w':2,'e':3,'m':1,'c':.8,'v':.9,'i':0},
 {'id':'B','score':50,'w':3,'e':1,'m':1,'c':.8,'v':.9,'i':1},
 {'id':'C','score':50,'w':3,'e':4,'m':1,'c':.8,'v':.9,'i':2},
]
def key(r): return (-r['w'],-r['e'],-r['m'],-r['c'],-r['v'],r['i'],r['id'])
if [r['id'] for r in sorted(rows,key=key)]!=['C','B','A']:
    errors.append('tie policy simulation failed')
if errors:
    print('STEP 04 REPORT FINDINGS: FAIL')
    for e in errors: print(' -',e)
    raise SystemExit(1)
print('STEP 04 REPORT FINDINGS: PASS')
PY
