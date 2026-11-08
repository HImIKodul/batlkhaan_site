#!/usr/bin/env python3
import json,hashlib,re
from pathlib import Path
B=Path(__file__).resolve().parents[2]; M=B/'methodology'
pairs=[
('marketing',M/'MMRI_v3.0.1_QBANK_v3.1.1_MONGOLIAN_WORDING_STEP10.json',M/'MMRI_v3.0.2_QBANK_v3.1.2_FINAL_MONGOLIAN_STEP12.json','3.0.2','3.1.2'),
('people',M/'businessmri-v2.1-runtime-bundles/MMRI_HRMRI_Methodology_4.1.1_BUSINESSMRI_V2.json',M/'businessmri-v2.2-runtime-bundles/MMRI_HRMRI_Methodology_4.1.2_BUSINESSMRI_V2.json','4.1.2','BUSINESSMRI-v2.2-HRMRI'),
('finance',M/'businessmri-v2.1-runtime-bundles/MMRI_FINMRI_Methodology_4.2.1_BUSINESSMRI_V2.json',M/'businessmri-v2.2-runtime-bundles/MMRI_FINMRI_Methodology_4.2.2_BUSINESSMRI_V2.json','4.2.2','BUSINESSMRI-v2.2-FINMRI'),
('it',M/'businessmri-v2.1-runtime-bundles/MMRI_ISMRI_Methodology_4.3.1_BUSINESSMRI_V2.json',M/'businessmri-v2.2-runtime-bundles/MMRI_ISMRI_Methodology_4.3.2_BUSINESSMRI_V2.json','4.3.2','BUSINESSMRI-v2.2-ISMRI'),
('operations',M/'businessmri-v2.1-runtime-bundles/MMRI_OPMRI_Methodology_4.4.1_BUSINESSMRI_V2.json',M/'businessmri-v2.2-runtime-bundles/MMRI_OPMRI_Methodology_4.4.2_BUSINESSMRI_V2.json','4.4.2','BUSINESSMRI-v2.2-OPMRI')]
expected_old={'marketing':'36d27cde2471caa2bd06b7ef8b0c6ec80fa92cb19f432299c29fd3f131fb214b','people':'b90989292ffcbbf12274075cef9a7a7da57680c1e9dba10b383ad9c9904e1d7d','finance':'9bbdac9ba864f5462bedf9786b1b04588e4b4584c3aeec820e91c555bdd11401','it':'d191122294420d97489d1a89293cc5d15a4d01e6735b6309f01f0d89d0215197','operations':'77c46336f4fe7070c2d4e0392efcbdd216052a02c8572a4679abba7782240681'}
def sh(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def canon(x):return hashlib.sha256(json.dumps(x,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()).hexdigest()
rows=[]
for dom,oldp,newp,ver,qbv in pairs:
    assert oldp.exists() and newp.exists()
    assert sh(oldp)==expected_old[dom],(dom,'rollback hash drift',sh(oldp))
    o=json.load(open(oldp,encoding='utf-8')); n=json.load(open(newp,encoding='utf-8'))
    assert n['methodologyVersion']==ver and n['questionBankVersion']==qbv
    for field in ['categories','cellTemplates','cellInstances','questions','profileQuestions','runtimePolicy']:
        assert canon(o[field])==canon(n[field]),(dom,field,'semantic drift')
    assert len(n['questions'])==12288
    rows.append({'domain':dom,'oldSha256':sh(oldp),'newSha256':sh(newp),'methodologyVersion':ver,'questionBankVersion':qbv,'questions':len(n['questions']),'runtimeSemanticDrift':0})
out=B/'integration/step12/MMRI_STEP12_FINAL_INTEGRATION_VERIFICATION.json'
json.dump({'status':'PASS','domains':rows,'totalQuestions':sum(x['questions'] for x in rows),'rollbackFilesByteIdentical':True,'scoringRoutingRuntimePolicyChanged':False},open(out,'w',encoding='utf-8'),indent=2)
print(json.dumps(json.load(open(out)),indent=2))
