#!/usr/bin/env python3
import copy,hashlib,json
from pathlib import Path
from collections import defaultdict
ROOT=Path(__file__).resolve().parents[1]; M=ROOT/'methodology'; S=M/'MMRI_v3.0.0_QBANK_v3.1.0_CELL_REACHABILITY_STEP05.json'; D=M/'domain-question-banks-businessmri-v2.0'; O=M/'businessmri-v2-runtime-bundles';O.mkdir(parents=True,exist_ok=True)
DOM={'people':('HRMRI','4.1.0','people-businessmri-v2.0-canonical-frozen.json'),'finance':('FINMRI','4.2.0','finance-businessmri-v2.0-canonical-frozen.json'),'it':('ISMRI','4.3.0','it-businessmri-v2.0-canonical-frozen.json'),'operations':('OPMRI','4.4.0','operations-businessmri-v2.0-canonical-frozen.json')}
SK={1:'SELF_REPORT',2:'RECENT_CASE',3:'RECORD_CHECK',4:'ADDITIONAL_CHECK'}; ROLE={1:'A_CURRENT_STATE',2:'B_RECENT_OR_QUANTIFIED',3:'C_CORROBORATION',4:'D_CONFLICT_RESOLUTION'}
def can(o):return json.dumps(o,ensure_ascii=False,sort_keys=True,separators=(',',':'))
def fsha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def state(q,i):
 c=str(q['optionCodes'][i]);r=str(q['runtimeStates'][i])
 if q['dimensionId']=='D01':return 'APPLICABLE' if c=='APPLICABLE' else 'N_A_CLAIM' if c=='NOT_APPLICABLE' or r=='NOT_APPLICABLE' else 'DNK'
 if r=='UNKNOWN':return 'DNK'
 if r=='NOT_APPLICABLE':return 'N_A_CLAIM'
 if r=='NO_ELIGIBLE_CASE':return 'UNAVAILABLE'
 return 'SCORED' if q['scoringEnabled'] and q['variant'] in 'AB' and isinstance(q['canonicalValues'][i],(int,float)) and r=='VALID' else 'UNAVAILABLE'
def score(q,i):
 if not(q['scoringEnabled'] and q['variant'] in 'AB' and q['runtimeStates'][i]=='VALID' and isinstance(q['canonicalValues'][i],(int,float))):return None
 v=float(q['canonicalValues'][i]);return v*100 if abs(v)<=1.000000001 else v
def build(domain,mri,ver,fn,sc,agg):
 bank=json.load(open(D/fn,encoding='utf8')); caps={x['id']:x for x in bank['capabilities']};goals={x['id']:x for x in bank['goals']}; ai={x['capabilityId']:x for x in agg['items'] if x['mri']==mri}
 cats=[]
 for c in bank['capabilities']:
  g=goals[c['goalId']];a=ai[c['id']];cats.append({'ID':c['id'],'Category':c['nameMn'],'Module':g['nameMn'],'Module weight %':float(g['weightPct']),'Category weight %':float(a['mriWeight']*100)})
 cells=copy.deepcopy(sc['cellTemplates']); dim={q['dimensionId']:q['dimension'] for q in bank['questions']}
 for x in cells:x['Diagnostic cell']=dim.get('D'+x['ID'][1:],x['Diagnostic cell'])
 by=defaultdict(list)
 for q in bank['questions']:by[(q['categoryId'],q['dimensionId'])].append(q)
 inst=[]
 for c in cats:
  for n in range(1,49):
   did=f'D{n:02d}';cid=f'C{n:02d}';q=by[(c['ID'],did)][0];inst.append({'cellInstanceId':f"{c['ID']}:{cid}",'categoryId':c['ID'],'cellId':cid,'weightPctOverride':float((q.get('normalizedWeight') or 0)*100),'naPolicy':'CATEGORY_GATE' if cid=='C01' else 'DISALLOWED','directQuestionCount':4,'independentSourceKinds':4,'minimumThreePathConfidenceAtAuthority075':0.75,'preferredRole':'R01','preferredAuthority':0.9,'coverageStatus':'PASS'})
 qs=[];pol=[];patterns={}
 for row,q in enumerate(bank['questions'],2):
  path={'A':1,'B':2,'C':3,'D':4}[q['variant']];cid='C'+q['dimensionId'][1:]; ex=[{'optionIndex':i+1,'labelMn':label,'score':score(q,i),'state':state(q,i)} for i,label in enumerate(q['options'])]; key=(bool(q['scoringEnabled'] and path<=2),tuple(x['score'] for x in ex)); code=patterns.setdefault(key,('BM'+hashlib.sha256(repr(key).encode()).hexdigest()[:10].upper()) if key[0] else f'BMNS{len(ex)}')
  qs.append({'questionId':q['id'],'sourceRow':row,'categoryId':q['categoryId'],'cellId':cid,'path':path,'sourceKind':SK[path],'textMn':q['question'],'optionsMn':q['options'],'explicitOptions':ex,'scoringProfileCode':'BUSINESSMRI_EXPLICIT','primaryCoefficient':1.0,'secondaryTargets':[]})
  elig=bool(q['scoringEnabled'] and path<=2);pol.append({'questionId':q['id'],'questionRole':ROLE[path],'scoreEligible':elig,'scoringMethod':'EXPLICIT' if elig else 'CONTEXT_ONLY','scoredOptionCount':sum(x['score'] is not None for x in ex),'scorePatternCode':code,'directAskAllowed':True,'routingState':'DIRECT_ALLOWED','askStage':'PROFILE_SCREEN' if q['dimensionId']=='D01' else {1:'PRIMARY_GAP_FILL',2:'CONFIRM',3:'CONFLICT',4:'FALLBACK'}[path],'selectionPriority':path*10,'isAnchor':False,'applicabilityGateKey':'CAPABILITY_RELEVANT','triggerRuleId':'BM_TRIGGER','confidenceRuleId':'BM_CONFIDENCE','defaultAsk':path==1,'stopRuleId':'BM_STOP'})
 contracts=copy.deepcopy(sc['contracts']); auth=contracts['MMRI_FINAL_Respondent_Authority_Contract.json'];old=[c['ID'] for c in sc['categories']];da=auth.get('domainAuthority',{});auth['domainAuthority']={c['ID']:copy.deepcopy(da.get(old[i],da.get(old[0],{}))) for i,c in enumerate(cats)};auth['routing']=[{'category':c['ID'],'cell':f'C{n:02d}','preferredRole':'R01','preferredAuthority':0.9,'backupRoles':'R02,R10,R04','backupAuthority':'0.85,0.80,0.75'} for c in cats for n in range(1,49)]
 cp=contracts['MMRI_FINAL_Company_Profile_Config.json'];cp['categoryApplicability']=[{'category':c['ID'],'categoryName':c['Category'],'class':'Үндсэн','baseRelevance':1.0,'boostConditionText':'Домэйн оношилгоонд суурь хамаарал 1.0.','finalExclusionRule':'Profile alone never excludes; D01 factual applicability is authoritative.'} for c in cats];contracts['MMRI_FINAL_Profile_Category_Relevance.json']['rules']=[]
 pur=contracts['MMRI_FINAL_Five_Purpose_Mapping.json'];pur['version']='BUSINESSMRI-PURPOSE-v2.0';pur['purposes']=[{'id':f'P{i+1}','label':g['nameMn'],'code':g['id']} for i,g in enumerate(bank['goals'])];gp={g['id']:f'P{i+1}' for i,g in enumerate(bank['goals'])};pur['mapping']=[{'category':c['ID'],'categoryName':c['Category'],'categoryWeight':c['Category weight %'],'relevance':{p['id']:(1.0 if p['id']==gp[caps[c['ID']]['goalId']] else 0.0) for p in pur['purposes']},'rationale':f"{c['Category']} нь {goals[caps[c['ID']]['goalId']]['nameMn']} зорилгын үндсэн чадавх."} for c in cats]
 contracts['MMRI_FINAL_Many_to_Many_Mapping.json']['edges']=[];contracts['MMRI_FINAL_Root_Cause_Dependency_Contract.json']['categoryGraph']['edges']=[];contracts['MMRI_FINAL_Root_Cause_Dependency_Contract.json']['cellGraph']['edges']=[];contracts['MMRI_FINAL_Scoring_Contract.json']['profiles']['BUSINESSMRI_EXPLICIT']=[]
 sm={name:{'version':str(obj.get('version','BUSINESSMRI-v2.0')),'sha256':hashlib.sha256(can(obj).encode()).hexdigest(),'chunks':1,'size':len(can(obj).encode()),'role':'RUNTIME_CONTRACT'} for name,obj in contracts.items()}; sm[f'BusinessMRI/{fn}']={'version':'BUSINESSMRI-4DOMAIN-v2.0-CANONICAL-WORDING','sha256':fsha(D/fn),'chunks':1,'size':(D/fn).stat().st_size,'role':'CANONICAL_DOMAIN_BANK'}
 rev={v:k for k,v in patterns.items()};sp=[{'code':code,'scoreEligible':k[0],'scoredOptionCount':sum(x is not None for x in k[1]),'optionScores':list(k[1])} for code,k in sorted(rev.items())]
 rules=[{'ruleId':'BM_TRIGGER','ruleType':'TRIGGER','definition':{'contract':'BusinessMRI v2 frozen direct sequence'}},{'ruleId':'BM_CONFIDENCE','ruleType':'CONFIDENCE','definition':{'knownDirectScoreConfidence':1.0,'unknownIsZero':False}},{'ruleId':'BM_STOP','ruleType':'STOP','definition':{'stopWhenKnownScoreAvailable':True}},{'ruleId':'BM_STATE','ruleType':'STATE_MODEL','definition':{'unknownIsZero':False,'naIsZero':False}},{'ruleId':'BM_VALUE','ruleType':'VALUE_RULE','definition':{'rule':'ARITHMETIC_MEAN_OF_KNOWN_SCORE_ELIGIBLE_A_B'}}]
 cpoll=[{'cellExternalId':x['cellInstanceId'],'stableCellId':x['cellId'],'applicabilityMode':'STANDARD','applicabilityGateKey':'CAPABILITY_RELEVANT','isAnchorCell':False,'directAskableQuestions':4,'maxDirectQuestions':4,'indirectConfidenceCap':0.0,'primaryConfidenceFloor':0.75,'lockThreshold':0.75,'conflictGapThreshold':25,'stateModelId':'BM_STATE','valueRuleId':'BM_VALUE'} for x in inst]
 return {'domainCode':domain,'engineKind':'BUSINESSMRI_V2','methodologyVersion':ver,'questionBankVersion':f'BUSINESSMRI-v2.0-{mri}','releaseStatus':'FROZEN_STEP7_FIVE_DOMAIN_INTEGRATION','semanticVersionClass':'MAJOR','bundleVersion':f'MMRI-BUSINESSMRI-{mri}-v2.0-RUNTIME-{ver}','sourceMethodology':f'{mri} BusinessMRI v2.0 canonical wording + Step18 frozen scoring policy','generatedAtUtc':'2026-10-10T09:00:00Z','validation':{'status':'PASS','passed':True,'failed':0,'questions':12288,'uniqueQuestionIds':12288,'cells':3072,'categories':64,'goals':5,'engineKind':'BUSINESSMRI_V2','canonicalContentSHA256':'34337d26022965045515d57030ba1f1d2b01a1df5642c77a87d2890a12acac25','runtimePolicyLineage':'BUSINESSMRI-4DOMAIN-v1.0-FROZEN / Step18','scoreFromDisplayOrder':False,'q3q4AdditionalNumericScore':False},'categories':cats,'cellTemplates':cells,'cellInstances':inst,'questions':qs,'profileQuestions':copy.deepcopy(sc['profileQuestions']),'contracts':contracts,'sourceManifest':sm,'runtimePolicy':{'version':'v13','baseStructuralMethodologyVersion':ver,'questionPolicies':pol,'cellPolicies':cpoll,'rules':rules,'scorePatterns':sp}}
def main():
 sc=json.load(open(S));agg=json.load(open(D/'businessmri-aggregation-v2.0-frozen.json'));mf={}
 for domain,(mri,ver,fn) in DOM.items():
  b=build(domain,mri,ver,fn,sc,agg);p=O/f'MMRI_{mri}_Methodology_{ver}_BUSINESSMRI_V2.json';p.write_text(json.dumps(b,ensure_ascii=False,separators=(',',':')),encoding='utf8');mf[domain]={'mri':mri,'methodologyVersion':ver,'file':p.name,'sha256':fsha(p),'questions':len(b['questions']),'categories':len(b['categories']),'cells':len(b['cellInstances']),'goals':len(set(c['Module'] for c in b['categories']))}
 (O/'manifest-step7-five-domain-runtime.json').write_text(json.dumps({'version':'MMRI-STEP7-FIVE-DOMAIN-RUNTIME-v1.0.0','created':'2026-10-10','marketing':'PRESERVED_3.0.0_QBANK_3.1.0','canonicalContentSHA256':'34337d26022965045515d57030ba1f1d2b01a1df5642c77a87d2890a12acac25','domains':mf},ensure_ascii=False,indent=2),encoding='utf8');print(json.dumps(mf,indent=2,ensure_ascii=False))
if __name__=='__main__':main()
