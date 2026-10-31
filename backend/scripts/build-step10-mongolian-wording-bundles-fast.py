#!/usr/bin/env python3
import csv, copy, hashlib, json
from pathlib import Path
from collections import defaultdict
ROOT=Path(__file__).resolve().parents[1];M=ROOT/'methodology';I=ROOT/'integration'/'step10'
MASTER=I/'MMRI_STEP09_FINAL_MONGOLIAN_QA_VERIFIED_61440.csv'
OLD_MKT=M/'MMRI_v3.0.0_QBANK_v3.1.0_CELL_REACHABILITY_STEP05.json'
OLD_BANK=M/'domain-question-banks-businessmri-v2.0'; NEW_BANK=M/'domain-question-banks-businessmri-v2.1'
OLD_RT=M/'businessmri-v2-runtime-bundles'; NEW_RT=M/'businessmri-v2.1-runtime-bundles'
NEW_BANK.mkdir(parents=True,exist_ok=True);NEW_RT.mkdir(parents=True,exist_ok=True)
DOM={
'HRMRI':('people','4.1.1','BUSINESSMRI-v2.1-HRMRI','people-businessmri-v2.0-canonical-frozen.json','people-businessmri-v2.1-mongolian-wording.json','MMRI_HRMRI_Methodology_4.1.0_BUSINESSMRI_V2.json','MMRI_HRMRI_Methodology_4.1.1_BUSINESSMRI_V2.json'),
'FINMRI':('finance','4.2.1','BUSINESSMRI-v2.1-FINMRI','finance-businessmri-v2.0-canonical-frozen.json','finance-businessmri-v2.1-mongolian-wording.json','MMRI_FINMRI_Methodology_4.2.0_BUSINESSMRI_V2.json','MMRI_FINMRI_Methodology_4.2.1_BUSINESSMRI_V2.json'),
'ISMRI':('it','4.3.1','BUSINESSMRI-v2.1-ISMRI','it-businessmri-v2.0-canonical-frozen.json','it-businessmri-v2.1-mongolian-wording.json','MMRI_ISMRI_Methodology_4.3.0_BUSINESSMRI_V2.json','MMRI_ISMRI_Methodology_4.3.1_BUSINESSMRI_V2.json'),
'OPMRI':('operations','4.4.1','BUSINESSMRI-v2.1-OPMRI','operations-businessmri-v2.0-canonical-frozen.json','operations-businessmri-v2.1-mongolian-wording.json','MMRI_OPMRI_Methodology_4.4.0_BUSINESSMRI_V2.json','MMRI_OPMRI_Methodology_4.4.1_BUSINESSMRI_V2.json')}
PROFILE={
'Платформ / зуучлалын үйлчилгээ.':'Цахим зуучлалын үйлчилгээ.','Вэбсайт, аппликейшнээр борлуулдаг.':'Цахим хуудас, гар утасны хэрэглээгээр борлуулдаг.','Түнш, борлуулагч, дистрибьютороор борлуулдаг.':'Түнш, борлуулагч, түгээгчээр борлуулдаг.','Цахим худалдааны платформоор борлуулдаг.':'Цахим худалдааны сувгаар борлуулдаг.','Вэбсайт / аппликейшн.':'Цахим хуудас / гар утасны хэрэглээ.','Түнш / агент / борлуулагч.':'Түнш / төлөөлөгч / борлуулагч.','Цахим худалдааны платформ.':'Цахим худалдааны суваг.','Танай вэбсайт эсвэл аппликейшн ямар үүрэгтэй вэ?':'Танай цахим хуудас эсвэл гар утасны хэрэглээ ямар үүрэгтэй вэ?','Маркетинг, борлуулалтын ажилд гаднын түнш, агентлаг, дистрибьютор ашигладаг уу?':'Маркетинг, борлуулалтын ажилд гаднын түнш, агентлаг, түгээгч ашигладаг уу?','Физик болон дижитал сувгийг өргөн хослуулдаг.':'Биечлэн болон цахим сувгийг өргөн хослуулдаг.'}
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def write(p,o):Path(p).write_text(json.dumps(o,ensure_ascii=False,separators=(',',':')),encoding='utf8')
by=defaultdict(dict);cats=defaultdict(dict);dims=defaultdict(dict);groups=defaultdict(dict)
with MASTER.open(encoding='utf-8-sig',newline='') as f:
 for r in csv.DictReader(f):
  by[r['DomainCode']][r['QuestionID']]=r;cats[r['DomainCode']][r['CategoryID']]=(r['CategoryName'],r['DisplayContext']);dims[r['DomainCode']][r['DimensionID']]=r['DimensionName'];groups[r['DomainCode']][r['CategoryID']]=r['GroupName']
def aa(r):return [r[f'Answer{i}'] for i in range(1,8) if r.get(f'Answer{i}')]
def profiles(x):
 z=copy.deepcopy(x)
 for q in z:q['questionMn']=PROFILE.get(q['questionMn'],q['questionMn']);q['optionsMn']=[PROFILE.get(a,a) for a in q['optionsMn']]
 return z
# marketing
old=json.load(OLD_MKT.open(encoding='utf8'));n=copy.deepcopy(old)
for c in n['categories']:c['Category']=cats['MARKETING'][c['ID']][0];c['Module']=groups['MARKETING'][c['ID']]
for c in n['cellTemplates']:c['Diagnostic cell']=dims['MARKETING']['D'+c['ID'][1:]]
for q in n['questions']:
 r=by['MARKETING'][q['questionId']];a=aa(r);assert len(a)==len(q['explicitOptions']);q['textMn']=r['QuestionText'];q['optionsMn']=a
 for i,o in enumerate(q['explicitOptions']):o['labelMn']=a[i]
n['profileQuestions']=profiles(n['profileQuestions']);n['methodologyVersion']='3.0.1';n['questionBankVersion']='3.1.1';n['bundleVersion']='MMRI-v3.0.1-QBANK-v3.1.1-STEP10-MONGOLIAN-WORDING';n['sourceMethodology']='MMRI Marketing v3 scoring/runtime + Step9 Mongolian wording';n['generatedAtUtc']='2026-10-16T12:00:00Z';n['releaseStatus']='CANDIDATE_STEP10_MONGOLIAN_WORDING';n['semanticVersionClass']='PATCH';n.setdefault('validation',{})['step9WordingSHA256']=sha(MASTER)
if n.get('runtimePolicy'):n['runtimePolicy']['baseStructuralMethodologyVersion']='3.0.1'
n.setdefault('sourceManifest',{})['Step09/MMRI_STEP09_FINAL_MONGOLIAN_QA_VERIFIED_61440.csv']={'version':'STEP9-MONGOLIAN-QA','sha256':sha(MASTER),'chunks':1,'size':MASTER.stat().st_size,'role':'STEP9_MONGOLIAN_WORDING_SOURCE'}
mktout=M/'MMRI_v3.0.1_QBANK_v3.1.1_MONGOLIAN_WORDING_STEP10.json';write(mktout,n)
manifest={'version':'MMRI-STEP10-FIVE-DOMAIN-MONGOLIAN-WORDING-v1.0.0','created':'2026-10-16','step9MasterSHA256':sha(MASTER),'status':'CANDIDATE_INTEGRATED_PENDING_STEP11_RUNTIME_REGRESSION','domains':{'marketing':{'methodologyVersion':'3.0.1','questionBankVersion':'3.1.1','file':mktout.name,'sha256':sha(mktout),'questions':12288,'categories':64,'engineKind':'MARKETING_V3'}}}
for mri,(domain,ver,qbv,ob,nb,ort,nrt) in DOM.items():
 b=json.load((OLD_BANK/ob).open(encoding='utf8'));bn=copy.deepcopy(b)
 for c in bn['capabilities']:c['nameMn']=cats[mri][c['id']][0];c['contextMn']=cats[mri][c['id']][1]
 for g in bn['goals']:
  cid=next(c['id'] for c in bn['capabilities'] if c['goalId']==g['id']);g['nameMn']=groups[mri][cid]
 for q in bn['questions']:
  r=by[mri][q['id']];a=aa(r);assert len(a)==len(q['optionCodes']);q['category']=r['CategoryName'];q['moduleName']=r['GroupName'];q['dimension']=r['DimensionName'];q['question']=r['QuestionText'];q['questionContext']=r['DisplayContext'];q['displayPrompt']=r['QuestionText'];q['options']=a;q['sourceStatus']='STEP9_MONGOLIAN_QA_VERIFIED_STEP10_INTEGRATION'
 bn['release']='BUSINESSMRI-4DOMAIN-v2.1-MONGOLIAN-WORDING';bn['status']='CANDIDATE_STEP10_MONGOLIAN_WORDING';bn['frozen']=False;bn['sourceStep']='STEP9_MONGOLIAN_LANGUAGE_QA';bout=NEW_BANK/nb;write(bout,bn)
 rt=json.load((OLD_RT/ort).open(encoding='utf8'));rn=copy.deepcopy(rt)
 for c in rn['categories']:c['Category']=cats[mri][c['ID']][0];c['Module']=groups[mri][c['ID']]
 for c in rn['cellTemplates']:c['Diagnostic cell']=dims[mri]['D'+c['ID'][1:]]
 for q in rn['questions']:
  r=by[mri][q['questionId']];a=aa(r);assert len(a)==len(q['explicitOptions']);q['textMn']=r['QuestionText'];q['optionsMn']=a
  for i,o in enumerate(q['explicitOptions']):o['labelMn']=a[i]
 rn['profileQuestions']=profiles(rn['profileQuestions']);rn['methodologyVersion']=ver;rn['questionBankVersion']=qbv;rn['bundleVersion']=f'MMRI-BUSINESSMRI-{mri}-v2.1-RUNTIME-{ver}';rn['sourceMethodology']=f'{mri} BusinessMRI v2 scoring/runtime + Step9 Mongolian wording';rn['generatedAtUtc']='2026-10-16T12:00:00Z';rn['releaseStatus']='CANDIDATE_STEP10_MONGOLIAN_WORDING';rn['semanticVersionClass']='PATCH';rn.setdefault('validation',{})['step9WordingSHA256']=sha(MASTER)
 if rn.get('runtimePolicy'):rn['runtimePolicy']['baseStructuralMethodologyVersion']=ver
 rn.setdefault('sourceManifest',{})[f'BusinessMRI/{nb}']={'version':'BUSINESSMRI-v2.1-MONGOLIAN-WORDING','sha256':sha(bout),'chunks':1,'size':bout.stat().st_size,'role':'CANONICAL_DOMAIN_BANK'}
 rout=NEW_RT/nrt;write(rout,rn)
 manifest['domains'][domain]={'mri':mri,'methodologyVersion':ver,'questionBankVersion':qbv,'file':rout.name,'sha256':sha(rout),'canonicalBank':bout.name,'canonicalBankSha256':sha(bout),'questions':12288,'categories':64,'cells':3072,'goals':5,'engineKind':'BUSINESSMRI_V2'}
(NEW_RT/'manifest-step10-five-domain-mongolian-wording.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf8')
(NEW_BANK/'manifest-businessmri-v2.1-mongolian-wording.json').write_text(json.dumps({'version':'BUSINESSMRI-v2.1-MONGOLIAN-WORDING','created':'2026-10-16','step9MasterSHA256':sha(MASTER),'domains':{k:v for k,v in manifest['domains'].items() if k!='marketing'}},ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps(manifest,ensure_ascii=False,indent=2))
