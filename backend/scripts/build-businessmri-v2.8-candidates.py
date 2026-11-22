#!/usr/bin/env python3
"""Builds the 4.x.8 CANDIDATE bundles from the ACTIVE 4.x.7 bundles + the canonical frozen bank + an explicit overlay. READ-ONLY on every existing file.
Output: backend/methodology/businessmri-v2.7-runtime-bundles-CANDIDATE/ (never activated by this script; releaseStatus says so).
Applied (mechanical, canonical-supported): DM-A1 conditional N/A policy for the context-only cells, DM-A2 state NO_ELIGIBLE_CASE for the no-case answers, DM-L9 mid-sentence capital letter.
NOT applied (blocked, listed in overlay-blocked.json): DM-A3 (C26/C31), all wording/answer-fit changes DM-L1..L8,L10, any scoring/path/C41 decision."""
import json,hashlib,copy,re,sys,os,collections,datetime
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];M=ROOT/'methodology';SRC=M/'businessmri-v2.6-runtime-bundles';OUT=M/'businessmri-v2.7-runtime-bundles-CANDIDATE';CAN=M/'domain-question-banks-businessmri-v2.0'
DOM={'finance':('FINMRI','4.2.7','4.2.8'),'people':('HRMRI','4.1.7','4.1.8'),'it':('ISMRI','4.3.7','4.3.8'),'operations':('OPMRI','4.4.7','4.4.8')}
A1_CELLS=['C24','C25','C35','C43','C44','C45','C46']       # canonical naAllowed=YES, context-only, weight 0 (C26/C31 blocked: DM-A3)
can=lambda o:json.dumps(o,ensure_ascii=False,sort_keys=True,separators=(',',':'))
sha=lambda b:hashlib.sha256(b).hexdigest()
def lower_first(text,word):
    toks=text.split(' ')
    for i in range(1,len(toks)):
        t=toks[i];core=t.rstrip(',')
        if core==word and not toks[i-1].endswith(('.','?','!',':')):
            toks[i]=core[0].lower()+core[1:]+t[len(core):];return ' '.join(toks),True
    return text,False
def main():
    OUT.mkdir(exist_ok=True);manifest={};log={}
    for dom,(mri,old,new) in DOM.items():
        src=SRC/f'MMRI_{mri}_Methodology_{old}_BUSINESSMRI_V2.json';raw=src.read_bytes();b=json.loads(raw)
        canon={q['id']:q for q in json.load(open(CAN/f'{dom}-businessmri-v2.0-canonical-frozen.json',encoding='utf8'))['questions']}
        stats=collections.Counter();c=copy.deepcopy(b)
        # DM-A1: conditional N/A policy (uniform per cell, as definition.ts requires)
        for inst in c['cellInstances']:
            if inst['cellId'] in A1_CELLS and inst['naPolicy']=='DISALLOWED':inst['naPolicy']='CONDITIONAL';stats['A1 cell instances set CONDITIONAL']+=1
        # DM-A2: NO_ELIGIBLE_CASE state where the canonical design says so (index aligned, verified)
        for q in c['questions']:
            cq=canon[q['questionId']]
            for i,rs in enumerate(cq['runtimeStates']):
                if rs=='NO_ELIGIBLE_CASE':
                    e=q['explicitOptions'][i]
                    if e['state']!='N_A_CLAIM' or e['score'] is not None:raise SystemExit(f"alignment check failed {q['questionId']} option {i+1}")
                    e['state']='NO_ELIGIBLE_CASE';stats['A2 options re-stated NO_ELIGIBLE_CASE']+=1
        # DM-L9: orthography (capitalised capability word in mid-sentence); every distinct word was reviewed: ordinary common words, no acronym/proper noun
        ex=json.load(open(M/'candidate-overlays'/'dm-l9-orthography.json'))
        byid={q['questionId']:q for q in c['questions']}
        for qid,w in ex.get(dom,[]):
            q=byid[qid];t,ok=lower_first(q['textMn'],w)
            if ok:q['textMn']=t;stats['L9 questions orthography corrected']+=1
            else:stats['L9 NOT applied (token not found)']+=1
        # versioning / provenance
        c['methodologyVersion']=new;c['questionBankVersion']=f'BUSINESSMRI-v2.6-{mri}';c['bundleVersion']=f'MMRI-BUSINESSMRI-{mri}-v2.7-RUNTIME-{new}'
        c['releaseStatus']='CANDIDATE_BLOCKED_PENDING_APPROVAL';c['semanticVersionClass']='CANDIDATE'
        c['candidate']={'supersedes':old,'supersedesBundleSha256':sha(raw),'generator':'scripts/build-businessmri-v2.8-candidates.py',
          'applied':['DM-A1','DM-A2','DM-L9'],'blocked':['DM-A3','DM-B2','DM-B3','DM-C1','DM-C2','DM-C3','DM-L1','DM-L2','DM-L3','DM-L4','DM-L5','DM-L6','DM-L7','DM-L8','DM-L10','DM-A4'],
          'contextOnlyCellIds':['C01','C41','C42','C44'],'activationAllowed':False,'requires':['methodology-owner approval DM-A1/A2','Mongolian language specialist sign-off DM-L9 and all wording','historical replay pass','regression pass']}
        nd=c['contracts']['MMRI_FINAL_NA_DNK_Contract.json'];nd['version']='MMRI-NA-DNK-3.1.0-CANDIDATE'
        nd['states']['NO_ELIGIBLE_CASE']={'score':None,'equalsNA':False,'countsAsAnswered':True,'isNaClaim':False,'note':'no case occurred in the period; neither points nor deduction; not a claim that the capability is irrelevant'}
        nd['naAllowed']['conditionalCells']=sorted(set(nd['naAllowed']['conditionalCells'])|set(A1_CELLS))
        c['sourceManifest']['MMRI_FINAL_NA_DNK_Contract.json']['sha256']=sha(can(nd).encode());c['sourceManifest']['MMRI_FINAL_NA_DNK_Contract.json']['version']=nd['version']
        outp=OUT/f'MMRI_{mri}_Methodology_{new}_BUSINESSMRI_V2_CANDIDATE.json';data=json.dumps(c,ensure_ascii=False,separators=(',',':')).encode('utf8');outp.write_bytes(data)
        manifest[dom]={'file':outp.name,'sha256':sha(data),'supersedes':f'{src.name}','supersedesSha256':sha(raw),'methodologyVersion':new,'changes':dict(stats)};log[dom]=dict(stats)
    (OUT/'manifest-candidate.json').write_text(json.dumps({'status':'CANDIDATE_BLOCKED','activationAllowed':False,'generated':datetime.datetime.now(datetime.timezone.utc).isoformat(),'domains':manifest},ensure_ascii=False,indent=1),encoding='utf8')
    print(json.dumps(log,ensure_ascii=False,indent=1))
if __name__=='__main__':main()
