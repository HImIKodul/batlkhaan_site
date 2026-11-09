import fs from 'node:fs';
import path from 'node:path';
import {
  buildDefinition, calculateRuntimeSnapshot, evidenceFromAnswer,
  directConfidence, authorityFactor, authorityFactorWithMetadata, reliabilityForPath
} from '../dist-engine/engine/index.js';

const bundlePath=path.resolve(process.cwd(),'methodology/MMRI_v3.0.3_QBANK_v3.1.3_STEP6_OF6_ACCEPTED_FINAL.json');
const bundle=JSON.parse(fs.readFileSync(bundlePath,'utf8'));
const definition=buildDefinition(bundle);
const checks=[]; const scenarios={};
const check=(name,pass,detail='')=>checks.push({name,pass:Boolean(pass),detail});
const approx=(a,b,t=0.002)=>Math.abs(Number(a)-Number(b))<=t;
const q=(category,cell,path)=>definition.questionByCategoryCellPath.get(`${category}:${cell}:${path}`);
function highOption(question){const x=question.options.filter(o=>o.state==='SCORED'&&o.score!==null).sort((a,b)=>Number(b.score)-Number(a.score))[0];if(!x)throw new Error(`No scored option ${question.id}`);return x.optionIndex;}
function lowOption(question){const x=question.options.filter(o=>o.state==='SCORED'&&o.score!==null).sort((a,b)=>Number(a.score)-Number(b.score))[0];if(!x)throw new Error(`No scored option ${question.id}`);return x.optionIndex;}
function stateOption(question,state){const x=question.options.find(o=>o.state===state);if(!x)throw new Error(`No ${state} ${question.id}`);return x.optionIndex;}
function ev(category,cell,path,kind='high',authority=.95){const question=q(category,cell,path);const optionIndex=kind==='high'?highOption(question):kind==='low'?lowOption(question):stateOption(question,kind);return evidenceFromAnswer({definition,question,optionIndex,explicitAuthority:authority});}
function cellSnap(category,cell,evidence){return calculateRuntimeSnapshot(definition,evidence).cells.get(`${category}:${cell}`);}

// Numeric confidence behavior.
const r1=reliabilityForPath(definition.contracts,1,.95), r2=reliabilityForPath(definition.contracts,2,.95), r3=reliabilityForPath(definition.contracts,3,.95), r4=reliabilityForPath(definition.contracts,4,.95);
const c1=directConfidence(definition.contracts,{reliabilities:[r1],sourceKinds:['SELF_REPORT'],directCount:1});
const c2=directConfidence(definition.contracts,{reliabilities:[r1,r2],sourceKinds:['SELF_REPORT','RECENT_CASE'],directCount:2});
const c3=directConfidence(definition.contracts,{reliabilities:[r1,r2,r3],sourceKinds:['SELF_REPORT','RECENT_CASE','RECORD_CHECK'],directCount:3});
const c4=directConfidence(definition.contracts,{reliabilities:[r1,r2,r3,r4],sourceKinds:['SELF_REPORT','RECENT_CASE','RECORD_CHECK','ADDITIONAL_CHECK'],directCount:4});
scenarios.numeric={r1,r2,r3,r4,c1,c2,c3,c4};
check('path1_reliability_authority_095',approx(r1,.418,.0005),r1);
check('path2_reliability_authority_095',approx(r2,.4235,.0005),r2);
check('path3_reliability_authority_095',approx(r3,.5096,.0005),r3);
check('one_answer_confidence_about_0418',approx(c1,.418,.001),c1);
check('one_answer_below_lock',c1<.8,c1);
check('two_answer_confidence_about_0664',approx(c2,.6645,.003),c2);
check('two_answers_below_lock',c2<.8,c2);
check('three_answer_confidence_above_080',c3>=.8,c3);
check('three_answer_confidence_about_0835',approx(c3,.8355,.004),c3);
check('four_answer_confidence_above_three',c4>c3,`${c3}->${c4}`);

// Ordinary coherent finalization.
const one=cellSnap('MS01','C10',[ev('MS01','C10',1)]);
const two=cellSnap('MS01','C10',[ev('MS01','C10',1),ev('MS01','C10',2)]);
const three=cellSnap('MS01','C10',[ev('MS01','C10',1),ev('MS01','C10',2),ev('MS01','C10',3)]);
scenarios.ordinary={one:{status:one.status,confidence:one.directConfidence},two:{status:two.status,confidence:two.directConfidence},three:{status:three.status,confidence:three.directConfidence,lockReason:three.lockReason}};
check('ordinary_one_not_locked',one.locked!==true,one.status);
check('ordinary_two_not_locked',two.locked!==true,two.status);
check('ordinary_three_locked',three.locked===true,three.status);
check('ordinary_three_direct_final',three.status==='DIRECT_FINAL',three.status);
check('ordinary_lock_reason_three',three.lockReason==='THREE_DIRECT_CONFIDENCE_GATED',three.lockReason);

// Low authority cannot lock.
const lowAuth=cellSnap('MS01','C10',[ev('MS01','C10',1,'high',.40),ev('MS01','C10',2,'high',.40),ev('MS01','C10',3,'high',.40),ev('MS01','C10',4,'high',.40)]);
scenarios.lowAuthority={status:lowAuth.status,confidence:lowAuth.directConfidence,maxAuthority:lowAuth.maxAcceptedAuthority};
check('low_authority_not_locked',lowAuth.locked!==true,lowAuth.status);
check('low_authority_max_below_075',lowAuth.maxAcceptedAuthority<.75,lowAuth.maxAcceptedAuthority);

// Same-cell conflict: Q3 must be in cluster.
const q3Outlier=cellSnap('MS01','C10',[ev('MS01','C10',1,'high'),ev('MS01','C10',2,'high'),ev('MS01','C10',3,'low')]);
const q2Outlier=cellSnap('MS01','C10',[ev('MS01','C10',1,'high'),ev('MS01','C10',2,'low'),ev('MS01','C10',3,'high')]);
const fourResolved=cellSnap('MS01','C10',[ev('MS01','C10',1,'high'),ev('MS01','C10',2,'low'),ev('MS01','C10',3,'high'),ev('MS01','C10',4,'high')]);
scenarios.conflict={q3Outlier:{status:q3Outlier.status,confidence:q3Outlier.directConfidence,rules:q3Outlier.hardContradictionRuleIds},q2Outlier:{status:q2Outlier.status,confidence:q2Outlier.directConfidence,lock:q2Outlier.locked,reason:q2Outlier.lockReason},fourResolved:{status:fourResolved.status,lock:fourResolved.locked,reason:fourResolved.lockReason}};
check('q3_outlier_not_locked',q3Outlier.locked!==true,q3Outlier.status);
check('q3_outlier_review_required',q3Outlier.status==='REVIEW_REQUIRED',q3Outlier.status);
check('q3_outlier_confidence_capped_065',q3Outlier.directConfidence<=.65,q3Outlier.directConfidence);
check('q3_outlier_h01',q3Outlier.hardContradictionRuleIds.includes('H01'),JSON.stringify(q3Outlier.hardContradictionRuleIds));
check('q2_outlier_q3_cluster_can_lock',q2Outlier.locked===true,q2Outlier.status);
check('q2_outlier_verified_reason',q2Outlier.lockReason==='Q3_VERIFIED_2_OF_3_CONFLICT_RESOLUTION',q2Outlier.lockReason);
check('four_answer_verified_cluster_lock',fourResolved.locked===true,fourResolved.status);
check('four_answer_verified_reason',fourResolved.lockReason==='Q3_VERIFIED_3_OF_4_CONFLICT_RESOLUTION',fourResolved.lockReason);

// Critical cells must have scored Q3 in cluster.
const criticalGood=cellSnap('MS01','C02',[ev('MS01','C02',1,'high'),ev('MS01','C02',2,'high'),ev('MS01','C02',3,'high')]);
const criticalQ3Dnk=cellSnap('MS01','C02',[ev('MS01','C02',1,'high'),ev('MS01','C02',2,'high'),ev('MS01','C02',3,'DNK'),ev('MS01','C02',4,'high')]);
const criticalQ3Outlier=cellSnap('MS01','C02',[ev('MS01','C02',1,'high'),ev('MS01','C02',2,'high'),ev('MS01','C02',3,'low'),ev('MS01','C02',4,'high')]);
scenarios.critical={good:{status:criticalGood.status,lock:criticalGood.locked},q3Dnk:{status:criticalQ3Dnk.status,lock:criticalQ3Dnk.locked},q3Outlier:{status:criticalQ3Outlier.status,confidence:criticalQ3Outlier.directConfidence,lock:criticalQ3Outlier.locked}};
check('critical_good_q3_locks',criticalGood.locked===true,criticalGood.status);
check('critical_q3_dnk_cannot_lock',criticalQ3Dnk.locked!==true,criticalQ3Dnk.status);
check('critical_q3_outlier_cannot_lock',criticalQ3Outlier.locked!==true,criticalQ3Outlier.status);
check('critical_q3_outlier_cap',criticalQ3Outlier.directConfidence<=.65,criticalQ3Outlier.directConfidence);
for(const c of ['C41','C43','C44']){
  const snap=cellSnap('MS01',c,[ev('MS01',c,1,'high'),ev('MS01',c,2,'high'),ev('MS01',c,3,'high')]);
  check(`critical_${c}_q3_locks`,snap.locked===true,`${snap.status}:${snap.directConfidence}`);
}

// N/A and DNK semantics.
const dnk=cellSnap('MS01','C24',[ev('MS01','C24',1,'DNK'),ev('MS01','C24',2,'DNK'),ev('MS01','C24',3,'DNK'),ev('MS01','C24',4,'DNK')]);
const na1=cellSnap('MS01','C24',[ev('MS01','C24',1,'N_A_CLAIM')]);
const na3=cellSnap('MS01','C24',[ev('MS01','C24',1,'N_A_CLAIM'),ev('MS01','C24',2,'N_A_CLAIM'),ev('MS01','C24',3,'N_A_CLAIM')]);
const naConflict=cellSnap('MS01','C24',[ev('MS01','C24',1,'N_A_CLAIM'),ev('MS01','C24',2,'N_A_CLAIM'),ev('MS01','C24',3,'N_A_CLAIM'),ev('MS01','C24',4,'high')]);
scenarios.naDnk={dnk:{status:dnk.status,confidence:dnk.directConfidence},na1:{status:na1.status,naConfidence:na1.naClaimConfidence},na3:{status:na3.status,naConfidence:na3.naClaimConfidence},conflict:{status:naConflict.status,naConfidence:naConflict.naClaimConfidence,rules:naConflict.hardContradictionRuleIds}};
check('all_dnk_no_score',dnk.directScore===null,String(dnk.directScore));
check('all_dnk_no_confidence',dnk.directConfidence===0,dnk.directConfidence);
check('one_na_not_confirmed',na1.status!=='NOT_APPLICABLE',na1.status);
check('one_na_confidence_not_one',na1.naClaimConfidence<1,na1.naClaimConfidence);
check('three_na_confirmed',na3.status==='NOT_APPLICABLE',na3.status);
check('three_na_confidence_ge_080',na3.naClaimConfidence>=.8,na3.naClaimConfidence);
check('na_scored_conflict_review',naConflict.status==='REVIEW_REQUIRED',naConflict.status);
check('na_scored_conflict_rule',naConflict.hardContradictionRuleIds.includes('V13_NA_SCORE_CONFLICT'),JSON.stringify(naConflict.hardContradictionRuleIds));
check('na_scored_confidence_not_constant_one',naConflict.naClaimConfidence<1,naConflict.naClaimConfidence);

// Authority metadata override.
const baseOwner=authorityFactor(definition.contracts,'MS01','C25','R01');
const undeclared=authorityFactorWithMetadata(definition.contracts,'MS01','C25','R01',{});
const declared=authorityFactorWithMetadata(definition.contracts,'MS01','C25','R01',{handsOnResponsibilityDeclared:true});
const scopedOut=authorityFactorWithMetadata(definition.contracts,'MS01','C25','R01',{handsOnResponsibilityDeclared:true,handsOnCategoryIds:['MS02']});
const externalBase=authorityFactor(definition.contracts,'MS01','C25','R11');
const externalDeclared=authorityFactorWithMetadata(definition.contracts,'MS01','C25','R11',{handsOnResponsibilityDeclared:true});
scenarios.authority={baseOwner,undeclared,declared,scopedOut,externalBase,externalDeclared};
check('owner_base_low_example',baseOwner<.75,baseOwner);
check('undeclared_no_override',undeclared===baseOwner,`${undeclared}/${baseOwner}`);
check('declared_owner_override_090',approx(declared,.9,.0001),declared);
check('owner_override_cap_090',declared<=.9,declared);
check('scoped_out_no_override',scopedOut===baseOwner,`${scopedOut}/${baseOwner}`);
check('external_partner_no_override',externalDeclared===externalBase,`${externalDeclared}/${externalBase}`);

// Same respondent path labels do not produce a source-diversity bonus.
const noBonus=directConfidence(definition.contracts,{reliabilities:[.4,.4,.4],sourceKinds:['SELF_REPORT','RECENT_CASE','RECORD_CHECK'],directCount:3});
const sameKinds=directConfidence(definition.contracts,{reliabilities:[.4,.4,.4],sourceKinds:['SELF_REPORT','SELF_REPORT','SELF_REPORT'],directCount:3});
check('source_kind_diversity_no_bonus',approx(noBonus,sameKinds,.0000001),`${noBonus}/${sameKinds}`);

const failures=checks.filter(x=>!x.pass);
const report={schema:'mmri.step03_of15.confidence.regression.v1',status:failures.length?'FAIL':'PASS',checksPassed:checks.length-failures.length,checksTotal:checks.length,failures,scenarios,checks};
fs.writeFileSync(path.resolve(process.cwd(),'../STEP03_CONFIDENCE_REGRESSION.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,checksPassed:report.checksPassed,checksTotal:report.checksTotal,failures,scenarios},null,2));
if(failures.length)process.exit(1);
