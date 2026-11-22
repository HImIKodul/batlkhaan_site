#!/usr/bin/env python3
"""Proves that each 4.x.8 CANDIDATE differs from its active 4.x.7 bundle ONLY by the approved-for-candidate changes (DM-A1, DM-A2, DM-L9). Read-only. Exit 1 on any other difference."""
import json,sys,collections,re
from pathlib import Path
M=Path(__file__).resolve().parents[1]/'methodology';A=M/'businessmri-v2.6-runtime-bundles';C=M/'businessmri-v2.7-runtime-bundles-CANDIDATE'
DOM={'finance':('FINMRI','4.2.7','4.2.8'),'people':('HRMRI','4.1.7','4.1.8'),'it':('ISMRI','4.3.7','4.3.8'),'operations':('OPMRI','4.4.7','4.4.8')}
A1={'C24','C25','C35','C43','C44','C45','C46'};bad=0
for dom,(mri,o,n) in DOM.items():
    a=json.load(open(A/f'MMRI_{mri}_Methodology_{o}_BUSINESSMRI_V2.json',encoding='utf8'));c=json.load(open(C/f'MMRI_{mri}_Methodology_{n}_BUSINESSMRI_V2_CANDIDATE.json',encoding='utf8'));d=collections.Counter();viol=[]
    ignored={'methodologyVersion','questionBankVersion','bundleVersion','releaseStatus','semanticVersionClass','candidate'}
    for k in set(a)|set(c):
        if k in ignored or k in('questions','cellInstances','contracts','sourceManifest'):continue
        if a.get(k)!=c.get(k):viol.append('top-level '+k)
    # questions
    if [q['questionId'] for q in a['questions']]!=[q['questionId'] for q in c['questions']]:viol.append('question id list/order changed')
    for qa,qc in zip(a['questions'],c['questions']):
        for k in qa:
            if k in('textMn','explicitOptions'):continue
            if qa[k]!=qc[k]:viol.append(f"{qa['questionId']} field {k}")
        if qa['textMn']!=qc['textMn']:
            same=qa['textMn'].lower()==qc['textMn'].lower() and len([1 for x,y in zip(qa['textMn'],qc['textMn']) if x!=y])==1
            d['text: only one letter lower-cased']+=1 if same else 0
            if not same:viol.append(f"{qa['questionId']} text changed beyond one letter")
        if len(qa['explicitOptions'])!=len(qc['explicitOptions']):viol.append(f"{qa['questionId']} option count")
        for ea,ec in zip(qa['explicitOptions'],qc['explicitOptions']):
            for k in ea:
                if ea[k]!=ec[k]:
                    if k=='state' and ea[k]=='N_A_CLAIM' and ec[k]=='NO_ELIGIBLE_CASE' and ea['score'] is None:d['state N_A_CLAIM->NO_ELIGIBLE_CASE']+=1
                    else:viol.append(f"{qa['questionId']} option {ea['optionIndex']} {k}")
    for ia,ic in zip(a['cellInstances'],c['cellInstances']):
        for k in ia:
            if ia[k]!=ic[k]:
                if k=='naPolicy' and ia['cellId'] in A1 and ia[k]=='DISALLOWED' and ic[k]=='CONDITIONAL':d['naPolicy DISALLOWED->CONDITIONAL']+=1
                else:viol.append(f"cell {ia['cellInstanceId']} {k}")
    for k in set(a['contracts'])|set(c['contracts']):
        if a['contracts'].get(k)!=c['contracts'].get(k):
            if k=='MMRI_FINAL_NA_DNK_Contract.json':d['contract NA/DNK extended']+=1
            else:viol.append('contract '+k)
    for k in set(a['sourceManifest'])|set(c['sourceManifest']):
        if a['sourceManifest'].get(k)!=c['sourceManifest'].get(k) and k!='MMRI_FINAL_NA_DNK_Contract.json':viol.append('sourceManifest '+k)
    print(dom,dict(d),'VIOLATIONS' if viol else 'OK',viol[:5]);bad+=bool(viol)
sys.exit(1 if bad else 0)
