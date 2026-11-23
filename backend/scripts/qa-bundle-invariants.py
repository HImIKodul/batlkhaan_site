#!/usr/bin/env python3
"""WP1 of the methodology implementation plan: structural invariants of the four BusinessMRI domain bundles (read-only).
usage: qa-bundle-invariants.py <bundle-dir> [--strict]
Invariants that must ALWAYS hold fail the run (exit 1). Properties that are documented owner decisions (DM-xx) are only counted and listed as KNOWN, so
the output records today's violations on the active 4.x.7 bundles and proves they disappear (or not) in a candidate. Nothing is written."""
import json,sys,glob,collections,os
d=sys.argv[1];strict='--strict' in sys.argv
ALWAYS=('ID_UNIQUE','FOUR_PATHS_PER_CELL','OPTION_INDEX_CONTIGUOUS','DNK_LAST','SCORE_RANGE','NO_DUPLICATE_LABELS','STATE_VOCABULARY')
VOCAB={'SCORED','UNAVAILABLE','N_A_CLAIM','DNK','NO_ELIGIBLE_CASE'}
NOCASE_CELLS={'C06','C15','C16','C18','C28','C41'}
tot=collections.Counter();per={}
for f in sorted(glob.glob(os.path.join(d,'MMRI_*.json'))):
    b=json.load(open(f));name=f"{b['domainCode']} {b['methodologyVersion']}";c=collections.Counter();per[name]=c
    qs=b['questions'];ids=[q['questionId'] for q in qs];c['questions']=len(qs)
    c['ID_UNIQUE']=len(ids)-len(set(ids))
    paths=collections.defaultdict(set)
    pol={(ci['categoryId'],ci['cellId']):ci['naPolicy'] for ci in b['cellInstances']}
    byCell=collections.defaultdict(set)
    for ci in b['cellInstances']:byCell[ci['cellId']].add(ci['naPolicy'])
    for q in qs:
        paths[(q['categoryId'],q['cellId'])].add(q['path'])
        o=q['explicitOptions'];idx=[x['optionIndex'] for x in o]
        if idx!=list(range(1,len(o)+1)):c['OPTION_INDEX_CONTIGUOUS']+=1
        if not o or o[-1].get('state')!='DNK':c['DNK_LAST']+=1
        labels=[x['labelMn'] for x in o]
        if len(set(labels))!=len(labels) or any(not l.strip() for l in labels):c['NO_DUPLICATE_LABELS']+=1
        for x in o:
            s=x.get('score');st=x.get('state')
            if s is not None and not(0<=s<=100):c['SCORE_RANGE']+=1
            if st not in VOCAB:c['STATE_VOCABULARY']+=1
        hasNA=any(x.get('state')=='N_A_CLAIM' for x in o)
        if hasNA and pol.get((q['categoryId'],q['cellId']))=='DISALLOWED':c['KNOWN DM-A1/A3: N/A answer offered but cell policy DISALLOWED (questions)']+=1
        if q['cellId'] in NOCASE_CELLS and any(x.get('state')=='N_A_CLAIM' for x in o):c['KNOWN DM-A2: "no eligible case" dimension (C06,C15,C16,C18,C28,C41) encodes it as N_A_CLAIM (questions)']+=1
    c['FOUR_PATHS_PER_CELL']=sum(1 for v in paths.values() if v!={1,2,3,4})
    c['KNOWN DM-C3: cells whose N/A policy differs between capabilities (cellIds)']=sum(1 for v in byCell.values() if len(v)>1)
    for k in c:tot[k]+=c[k]
keys=[k for k in tot if k!='questions'];fail=False
print(f"bundle-dir: {d}\n{'invariant':95}"+''.join(f'{n:>14}' for n in per))
for k in ['questions']+sorted(keys,key=lambda k:(k.startswith('KNOWN'),k)):
    row=''.join(f'{per[n][k]:>14}' for n in per);print(f'{k[:93]:95}{row}')
    if k in ALWAYS and tot[k]:fail=True
print('RESULT:', 'FAIL (a mandatory invariant is violated)' if fail else 'PASS (mandatory invariants hold; KNOWN rows are documented owner decisions)')
sys.exit(1 if fail else 0)
