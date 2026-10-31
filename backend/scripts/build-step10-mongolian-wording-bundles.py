#!/usr/bin/env python3
import csv, copy, hashlib, json, re
from pathlib import Path
from collections import defaultdict

ROOT=Path(__file__).resolve().parents[1]
M=ROOT/'methodology'
INTEGRATION=ROOT/'integration'/'step10'
MASTER=INTEGRATION/'MMRI_STEP09_FINAL_MONGOLIAN_QA_VERIFIED_61440.csv'
OLD_MKT=M/'MMRI_v3.0.0_QBANK_v3.1.0_CELL_REACHABILITY_STEP05.json'
OLD_BANK_DIR=M/'domain-question-banks-businessmri-v2.0'
NEW_BANK_DIR=M/'domain-question-banks-businessmri-v2.1'
OLD_RT_DIR=M/'businessmri-v2-runtime-bundles'
NEW_RT_DIR=M/'businessmri-v2.1-runtime-bundles'
NEW_BANK_DIR.mkdir(parents=True,exist_ok=True)
NEW_RT_DIR.mkdir(parents=True,exist_ok=True)

VERSIONS={
 'MARKETING':('marketing','3.0.1','3.1.1',None,None),
 'HRMRI':('people','4.1.1','BUSINESSMRI-v2.1-HRMRI','people-businessmri-v2.0-canonical-frozen.json','MMRI_HRMRI_Methodology_4.1.0_BUSINESSMRI_V2.json'),
 'FINMRI':('finance','4.2.1','BUSINESSMRI-v2.1-FINMRI','finance-businessmri-v2.0-canonical-frozen.json','MMRI_FINMRI_Methodology_4.2.0_BUSINESSMRI_V2.json'),
 'ISMRI':('it','4.3.1','BUSINESSMRI-v2.1-ISMRI','it-businessmri-v2.0-canonical-frozen.json','MMRI_ISMRI_Methodology_4.3.0_BUSINESSMRI_V2.json'),
 'OPMRI':('operations','4.4.1','BUSINESSMRI-v2.1-OPMRI','operations-businessmri-v2.0-canonical-frozen.json','MMRI_OPMRI_Methodology_4.4.0_BUSINESSMRI_V2.json'),
}
NEW_BANK_NAMES={
 'HRMRI':'people-businessmri-v2.1-mongolian-wording.json',
 'FINMRI':'finance-businessmri-v2.1-mongolian-wording.json',
 'ISMRI':'it-businessmri-v2.1-mongolian-wording.json',
 'OPMRI':'operations-businessmri-v2.1-mongolian-wording.json',
}
NEW_RT_NAMES={
 'HRMRI':'MMRI_HRMRI_Methodology_4.1.1_BUSINESSMRI_V2.json',
 'FINMRI':'MMRI_FINMRI_Methodology_4.2.1_BUSINESSMRI_V2.json',
 'ISMRI':'MMRI_ISMRI_Methodology_4.3.1_BUSINESSMRI_V2.json',
 'OPMRI':'MMRI_OPMRI_Methodology_4.4.1_BUSINESSMRI_V2.json',
}
MKT_NEW_NAME='MMRI_v3.0.1_QBANK_v3.1.1_MONGOLIAN_WORDING_STEP10.json'

PROFILE_REPLACEMENTS={
 'Платформ / зуучлалын үйлчилгээ.':'Цахим зуучлалын үйлчилгээ.',
 'Вэбсайт, аппликейшнээр борлуулдаг.':'Цахим хуудас, гар утасны хэрэглээгээр борлуулдаг.',
 'Түнш, борлуулагч, дистрибьютороор борлуулдаг.':'Түнш, борлуулагч, түгээгчээр борлуулдаг.',
 'Цахим худалдааны платформоор борлуулдаг.':'Цахим худалдааны сувгаар борлуулдаг.',
 'Вэбсайт / аппликейшн.':'Цахим хуудас / гар утасны хэрэглээ.',
 'Түнш / агент / борлуулагч.':'Түнш / төлөөлөгч / борлуулагч.',
 'Цахим худалдааны платформ.':'Цахим худалдааны суваг.',
 'Танай вэбсайт эсвэл аппликейшн ямар үүрэгтэй вэ?':'Танай цахим хуудас эсвэл гар утасны хэрэглээ ямар үүрэгтэй вэ?',
 'Маркетинг, борлуулалтын ажилд гаднын түнш, агентлаг, дистрибьютор ашигладаг уу?':'Маркетинг, борлуулалтын ажилд гаднын түнш, агентлаг, түгээгч ашигладаг уу?',
 'Физик болон дижитал сувгийг өргөн хослуулдаг.':'Биечлэн болон цахим сувгийг өргөн хослуулдаг.',
}

def sha_bytes(b:bytes): return hashlib.sha256(b).hexdigest()
def sha_file(p:Path): return sha_bytes(p.read_bytes())
def compact(obj): return json.dumps(obj,ensure_ascii=False,separators=(',',':'))
def stable(obj):
    return json.dumps(obj,ensure_ascii=False,sort_keys=True,separators=(',',':'))
def stable_sha(obj): return sha_bytes(stable(obj).encode())

def write_json(p:Path,obj): p.write_text(compact(obj),encoding='utf-8')

def load_master():
    bydom=defaultdict(dict); categories=defaultdict(dict); groups=defaultdict(dict); dimensions=defaultdict(dict)
    with MASTER.open(encoding='utf-8-sig',newline='') as f:
        for r in csv.DictReader(f):
            bydom[r['DomainCode']][r['QuestionID']]=r
            categories[r['DomainCode']][r['CategoryID']]=(r['CategoryName'],r['DisplayContext'])
            groups[r['DomainCode']][r['GroupName']]=r['GroupName']
            dimensions[r['DomainCode']][r['DimensionID']]=r['DimensionName']
    return bydom,categories,dimensions

BYDOM,CATS,DIMS=load_master()
assert all(len(BYDOM[d])==12288 for d in VERSIONS)
assert all(len(CATS[d])==64 for d in VERSIONS)

def answer_list(row): return [row[f'Answer{i}'] for i in range(1,8) if row.get(f'Answer{i}')]

def replace_visible_strings(obj,repls):
    if isinstance(obj,str):
        out=obj
        # Longer strings first to avoid partial clobbering.
        for a,b in sorted(repls.items(),key=lambda kv:len(kv[0]),reverse=True):
            if a and a!=b: out=out.replace(a,b)
        return out
    if isinstance(obj,list): return [replace_visible_strings(x,repls) for x in obj]
    if isinstance(obj,dict): return {k:replace_visible_strings(v,repls) for k,v in obj.items()}
    return obj

def patch_profiles(profile):
    out=copy.deepcopy(profile)
    for q in out:
        q['questionMn']=PROFILE_REPLACEMENTS.get(q['questionMn'],q['questionMn'])
        q['optionsMn']=[PROFILE_REPLACEMENTS.get(x,x) for x in q['optionsMn']]
    return out

def patch_source_manifest(bundle,extra_name,extra_version,extra_sha,extra_size):
    # Contracts may contain localized labels; refresh their manifest hashes.
    sm=bundle.get('sourceManifest',{})
    for name,obj in bundle.get('contracts',{}).items():
        if name in sm:
            sm[name]['sha256']=stable_sha(obj)
            sm[name]['size']=len(stable(obj).encode())
    sm[extra_name]={'version':extra_version,'sha256':extra_sha,'chunks':1,'size':extra_size,'role':'STEP9_MONGOLIAN_WORDING_SOURCE'}
    bundle['sourceManifest']=sm

def build_marketing():
    old=json.load(OLD_MKT.open(encoding='utf-8'))
    new=copy.deepcopy(old)
    old_cat={c['ID']:c['Category'] for c in old['categories']}
    old_module={c['Module']:c['Module'] for c in old['categories']}
    repl={}
    # Categories/modules from Step-9 master.
    group_by_cat={}
    for r in BYDOM['MARKETING'].values(): group_by_cat.setdefault(r['CategoryID'],r['GroupName'])
    for c in new['categories']:
        cid=c['ID']; newcat=CATS['MARKETING'][cid][0]; newmod=group_by_cat[cid]
        repl[c['Category']]=newcat; repl[c['Module']]=newmod
        c['Category']=newcat; c['Module']=newmod
    for cell in new['cellTemplates']:
        did='D'+cell['ID'][1:]
        if did in DIMS['MARKETING']: cell['Diagnostic cell']=DIMS['MARKETING'][did]
    qmap=BYDOM['MARKETING']
    for q in new['questions']:
        r=qmap[q['questionId']]; aa=answer_list(r)
        assert len(aa)==len(q['optionsMn'])==len(q['explicitOptions'])
        q['textMn']=r['QuestionText']; q['optionsMn']=aa
        for i,o in enumerate(q['explicitOptions']): o['labelMn']=aa[i]
    new['profileQuestions']=patch_profiles(new['profileQuestions'])
    # Localize exact category/module mentions inside contracts, without touching codes/IDs.
    new['contracts']=replace_visible_strings(new['contracts'],repl)
    new['domainCode']='marketing'; new['engineKind']='MARKETING_V3'
    new['methodologyVersion']='3.0.1'; new['questionBankVersion']='3.1.1'
    new['bundleVersion']='MMRI-v3.0.1-QBANK-v3.1.1-STEP10-MONGOLIAN-WORDING'
    new['sourceMethodology']='MMRI Marketing v3.0 scoring/runtime + auditor-approved Step9 Mongolian wording'
    new['generatedAtUtc']='2026-10-16T12:00:00Z'
    new['releaseStatus']='CANDIDATE_STEP10_MONGOLIAN_WORDING'
    new['semanticVersionClass']='PATCH'
    new.setdefault('validation',{})['step9WordingSHA256']=sha_file(MASTER)
    new['validation']['questions']=12288; new['validation']['uniqueQuestionIds']=12288
    if new.get('runtimePolicy'): new['runtimePolicy']['baseStructuralMethodologyVersion']='3.0.1'
    patch_source_manifest(new,'Step09/MMRI_STEP09_FINAL_MONGOLIAN_QA_VERIFIED_61440.csv','STEP9-MONGOLIAN-QA',sha_file(MASTER),MASTER.stat().st_size)
    out=M/MKT_NEW_NAME; write_json(out,new)
    return out,new

def build_nonmarketing(mri):
    domain,ver,qbank,old_bank_name,old_rt_name=VERSIONS[mri]
    oldbank=json.load((OLD_BANK_DIR/old_bank_name).open(encoding='utf-8'))
    newbank=copy.deepcopy(oldbank)
    # Build old->new visible string mapping before mutation.
    repl={}
    group_by_cat={}
    for r in BYDOM[mri].values(): group_by_cat.setdefault(r['CategoryID'],r['GroupName'])
    for c in oldbank['capabilities']:
        repl[c['nameMn']]=CATS[mri][c['id']][0]
        repl[c.get('contextMn','')]=CATS[mri][c['id']][1]
    for g in oldbank['goals']:
        # group name from any category in this goal
        cat=next(c for c in oldbank['capabilities'] if c['goalId']==g['id'])
        repl[g['nameMn']]=group_by_cat[cat['id']]
    for c in newbank['capabilities']:
        c['nameMn']=CATS[mri][c['id']][0]; c['contextMn']=CATS[mri][c['id']][1]
    for g in newbank['goals']:
        cat=next(c for c in newbank['capabilities'] if c['goalId']==g['id'])
        g['nameMn']=group_by_cat[cat['id']]
    qmap=BYDOM[mri]
    for q in newbank['questions']:
        r=qmap[q['id']]; aa=answer_list(r)
        assert len(aa)==len(q['options'])==len(q['optionCodes'])==len(q['canonicalValues'])==len(q['runtimeStates'])
        q['category']=r['CategoryName']; q['moduleName']=r['GroupName']; q['dimension']=r['DimensionName']
        q['question']=r['QuestionText']; q['questionContext']=r['DisplayContext']; q['displayPrompt']=r['QuestionText']; q['options']=aa
        q['sourceStatus']='STEP9_MONGOLIAN_QA_VERIFIED_STEP10_INTEGRATION'
    newbank['release']='BUSINESSMRI-4DOMAIN-v2.1-MONGOLIAN-WORDING'
    newbank['status']='CANDIDATE_STEP10_MONGOLIAN_WORDING'
    newbank['frozen']=False
    newbank['sourceStep']='STEP9_MONGOLIAN_LANGUAGE_QA'
    bank_out=NEW_BANK_DIR/NEW_BANK_NAMES[mri]; write_json(bank_out,newbank)

    oldrt=json.load((OLD_RT_DIR/old_rt_name).open(encoding='utf-8'))
    newrt=copy.deepcopy(oldrt)
    # Categories/modules.
    for c in newrt['categories']:
        c['Category']=CATS[mri][c['ID']][0]; c['Module']=group_by_cat[c['ID']]
    for cell in newrt['cellTemplates']:
        did='D'+cell['ID'][1:]
        if did in DIMS[mri]: cell['Diagnostic cell']=DIMS[mri][did]
    for q in newrt['questions']:
        r=qmap[q['questionId']]; aa=answer_list(r)
        assert len(aa)==len(q['optionsMn'])==len(q['explicitOptions'])
        q['textMn']=r['QuestionText']; q['optionsMn']=aa
        for i,o in enumerate(q['explicitOptions']): o['labelMn']=aa[i]
    newrt['profileQuestions']=patch_profiles(newrt['profileQuestions'])
    newrt['contracts']=replace_visible_strings(newrt['contracts'],repl)
    newrt['methodologyVersion']=ver; newrt['questionBankVersion']=qbank
    newrt['bundleVersion']=f'MMRI-BUSINESSMRI-{mri}-v2.1-RUNTIME-{ver}'
    newrt['sourceMethodology']=f'{mri} BusinessMRI v2 scoring/runtime + Step9 Mongolian wording'
    newrt['generatedAtUtc']='2026-10-16T12:00:00Z'
    newrt['releaseStatus']='CANDIDATE_STEP10_MONGOLIAN_WORDING'; newrt['semanticVersionClass']='PATCH'
    newrt.setdefault('validation',{})['step9WordingSHA256']=sha_file(MASTER)
    newrt['validation']['questions']=12288; newrt['validation']['uniqueQuestionIds']=12288
    if newrt.get('runtimePolicy'): newrt['runtimePolicy']['baseStructuralMethodologyVersion']=ver
    patch_source_manifest(newrt,f'BusinessMRI/{NEW_BANK_NAMES[mri]}','BUSINESSMRI-v2.1-MONGOLIAN-WORDING',sha_file(bank_out),bank_out.stat().st_size)
    rt_out=NEW_RT_DIR/NEW_RT_NAMES[mri]; write_json(rt_out,newrt)
    return bank_out,newbank,rt_out,newrt

def semantic_fingerprint_bank(bank):
    # Text labels intentionally excluded; this fingerprint proves score/state/routing data is unchanged.
    return stable_sha({
      'questions':[{
        'id':q['id'],'categoryId':q['categoryId'],'cellId':q['cellId'],'dimensionId':q['dimensionId'],'variant':q['variant'],
        'role':q['role'],'stage':q['stage'],'questionType':q['questionType'],'answerShape':q['answerShape'],
        'optionCodes':q['optionCodes'],'canonicalValues':q['canonicalValues'],'runtimeStates':q['runtimeStates'],
        'naAllowed':q['naAllowed'],'answerDirection':q['answerDirection'],'applicability':q['applicability'],
        'weightTier':q['weightTier'],'normalizedWeight':q['normalizedWeight'],'scoringEnabled':q['scoringEnabled'],
        'periodMode':q['periodMode'],'evidencePath':q['evidencePath'],'directEligible':q['directEligible'],
        'primaryValueTarget':q['primaryValueTarget'],'secondaryTargets':q['secondaryTargets'],'privacyClass':q['privacyClass']
      } for q in bank['questions']],
      'goals':[{k:v for k,v in g.items() if k!='nameMn'} for g in bank['goals']],
      'capabilities':[{k:v for k,v in c.items() if k not in ('nameMn','contextMn')} for c in bank['capabilities']]
    })

def semantic_fingerprint_bundle(b):
    return stable_sha({
      'categories':[{k:v for k,v in c.items() if k not in ('Category','Module')} for c in b['categories']],
      'cellTemplates':[{k:v for k,v in c.items() if k!='Diagnostic cell'} for c in b['cellTemplates']],
      'cellInstances':b['cellInstances'],
      'questions':[{
        'questionId':q['questionId'],'sourceRow':q['sourceRow'],'categoryId':q['categoryId'],'cellId':q['cellId'],'path':q['path'],
        'sourceKind':q['sourceKind'],'explicitOptions':[{k:v for k,v in o.items() if k!='labelMn'} for o in q['explicitOptions']],
        'scoringProfileCode':q.get('scoringProfileCode'),'primaryCoefficient':q['primaryCoefficient'],'secondaryTargets':q['secondaryTargets']
      } for q in b['questions']],
      'runtimePolicy':({k:v for k,v in (b.get('runtimePolicy') or {}).items() if k!='baseStructuralMethodologyVersion'}),
    })

def main():
    mkt_out,mkt_new=build_marketing()
    manifests={}
    integrity=[]
    oldm=json.load(OLD_MKT.open(encoding='utf-8'))
    # Marketing score/state fingerprint only.
    oldm_fp=stable_sha([[(o.get('score'),o.get('state')) for o in q['explicitOptions']] for q in oldm['questions']])
    newm_fp=stable_sha([[(o.get('score'),o.get('state')) for o in q['explicitOptions']] for q in mkt_new['questions']])
    integrity.append({'domain':'marketing','semanticRuntimePreserved':oldm_fp==newm_fp,'oldFingerprint':oldm_fp,'newFingerprint':newm_fp})
    manifests['marketing']={'methodologyVersion':'3.0.1','questionBankVersion':'3.1.1','file':mkt_out.name,'sha256':sha_file(mkt_out),'questions':len(mkt_new['questions']),'categories':len(mkt_new['categories']),'engineKind':'MARKETING_V3'}
    for mri in ('HRMRI','FINMRI','ISMRI','OPMRI'):
        domain,ver,qbank,old_bank_name,old_rt_name=VERSIONS[mri]
        oldbank=json.load((OLD_BANK_DIR/old_bank_name).open(encoding='utf-8'))
        oldrt=json.load((OLD_RT_DIR/old_rt_name).open(encoding='utf-8'))
        bank_out,newbank,rt_out,newrt=build_nonmarketing(mri)
        b_old=semantic_fingerprint_bank(oldbank); b_new=semantic_fingerprint_bank(newbank)
        r_old=semantic_fingerprint_bundle(oldrt); r_new=semantic_fingerprint_bundle(newrt)
        integrity.append({'domain':domain,'bankSemanticPreserved':b_old==b_new,'runtimeSemanticPreserved':r_old==r_new,'oldBankFingerprint':b_old,'newBankFingerprint':b_new,'oldRuntimeFingerprint':r_old,'newRuntimeFingerprint':r_new})
        manifests[domain]={'mri':mri,'methodologyVersion':ver,'questionBankVersion':qbank,'file':rt_out.name,'sha256':sha_file(rt_out),'canonicalBank':bank_out.name,'canonicalBankSha256':sha_file(bank_out),'questions':len(newrt['questions']),'categories':len(newrt['categories']),'cells':len(newrt['cellInstances']),'goals':len(set(c['Module'] for c in newrt['categories'])),'engineKind':'BUSINESSMRI_V2'}
    assert all(x.get('semanticRuntimePreserved',True) and x.get('bankSemanticPreserved',True) and x.get('runtimeSemanticPreserved',True) for x in integrity)
    mf={'version':'MMRI-STEP10-FIVE-DOMAIN-MONGOLIAN-WORDING-v1.0.0','created':'2026-10-16','step9MasterSHA256':sha_file(MASTER),'status':'CANDIDATE_INTEGRATED_PENDING_STEP11_RUNTIME_REGRESSION','domains':manifests,'semanticIntegrity':integrity}
    (NEW_RT_DIR/'manifest-step10-five-domain-mongolian-wording.json').write_text(json.dumps(mf,ensure_ascii=False,indent=2),encoding='utf-8')
    (NEW_BANK_DIR/'manifest-businessmri-v2.1-mongolian-wording.json').write_text(json.dumps({'version':'BUSINESSMRI-v2.1-MONGOLIAN-WORDING','created':'2026-10-16','step9MasterSHA256':sha_file(MASTER),'domains':{k:v for k,v in manifests.items() if k!='marketing'}},ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(mf,ensure_ascii=False,indent=2))

if __name__=='__main__': main()
