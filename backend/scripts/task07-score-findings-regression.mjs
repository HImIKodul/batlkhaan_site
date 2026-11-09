import fs from 'node:fs';
import { buildDefinition, calculateRuntimeSnapshot, evidenceFromAnswer } from '../dist-strategy/engine/index.js';
import { runStrategyPipeline } from '../dist-strategy/strategy/index.js';
import { buildDiagnosisResultV13 } from '../dist-strategy/diagnosis/result.js';
import { buildFrozenReportPayload } from '../dist-strategy/report/payload.js';

const BUNDLES=[
 ['marketing','methodology/MMRI_v3.0.3_QBANK_v3.1.3_STEP6_OF6_ACCEPTED_FINAL.json'],
 ['it','methodology/businessmri-v2.5-runtime-bundles/MMRI_ISMRI_Methodology_4.3.5_BUSINESSMRI_V2.json'],
 ['finance','methodology/businessmri-v2.5-runtime-bundles/MMRI_FINMRI_Methodology_4.2.5_BUSINESSMRI_V2.json'],
 ['people','methodology/businessmri-v2.5-runtime-bundles/MMRI_HRMRI_Methodology_4.1.5_BUSINESSMRI_V2.json'],
 ['operations','methodology/businessmri-v2.5-runtime-bundles/MMRI_OPMRI_Methodology_4.4.5_BUSINESSMRI_V2.json']
];
const checks=[];
function check(name,pass,detail=''){checks.push({name,pass:Boolean(pass),detail:String(detail)});if(!pass)throw new Error(`FAIL ${name}: ${detail}`)}
function question(def,cat,cell,path){const q=def.questionByCategoryCellPath.get(`${cat}:${cell}:${path}`);if(!q)throw new Error(`Missing ${cat}:${cell}:${path}`);return q}
function positiveApplicability(q){return q.options.find(o=>['APPLICABLE','MOSTLY_APPLICABLE','PARTIAL_APPLICABILITY'].includes(o.state))?.optionIndex ?? q.options.find(o=>o.optionIndex===1&&!['N_A_CLAIM','DNK'].includes(o.state))?.optionIndex ?? q.options[0].optionIndex}
function naOption(q){const o=q.options.find(x=>x.state==='N_A_CLAIM');if(!o)throw new Error(`Missing N/A ${q.id}`);return o.optionIndex}
function scoreOption(q,high){const rows=q.options.filter(o=>o.state==='SCORED'&&o.score!==null).slice().sort((a,b)=>Number(a.score)-Number(b.score));return rows.length?(high?rows.at(-1):rows[0]).optionIndex:null}
function ev(def,q,optionIndex){return evidenceFromAnswer({definition:def,question:q,optionIndex,explicitAuthority:1,respondentRoleId:'R01'})}
function scenario(def,reverse=false){
 const selected=def.categories.slice(0,10); const selectedIds=new Set(selected.map(c=>c.id)); const highIds=new Set((reverse?selected.slice(5):selected.slice(0,5)).map(c=>c.id)); const lowIds=new Set((reverse?selected.slice(0,5):selected.slice(5)).map(c=>c.id)); const evidence=[];
 for(const c of def.categories){
  if(selectedIds.has(c.id)){const q=question(def,c.id,'C01',1);evidence.push(ev(def,q,positiveApplicability(q)));}
  else for(const path of [1,2,3]){const q=question(def,c.id,'C01',path);evidence.push(ev(def,q,naOption(q)));}
 }
 for(const c of selected){const high=highIds.has(c.id);for(const cell of def.cells){if(cell.id==='C01')continue;for(const path of [1,2,3,4]){const q=def.questionByCategoryCellPath.get(`${c.id}:${cell.id}:${path}`);if(!q)continue;const policy=def.runtimePolicy?.questionById.get(q.id);if(policy&&(!policy.scoreEligible||policy.routingState==='INFER_ONLY'))continue;const oi=scoreOption(q,high);if(oi!==null)evidence.push(ev(def,q,oi));}}}
 const snapshot=calculateRuntimeSnapshot(def,evidence);
 const strategy=runStrategyPipeline({methodology:def,snapshot,profileAnswers:[{questionId:'P05',optionIndexes:[5]},{questionId:'P20',optionIndexes:[1]}]});
 const purposeLabels={P1:'Зорилго 1',P2:'Зорилго 2',P3:'Зорилго 3',P4:'Зорилго 4',P5:'Зорилго 5'};
 const result=buildDiagnosisResultV13({assessmentId:`ASS-${def.domainCode}-${reverse?'B':'A'}`,companyId:'COMP-1',companyName:'Бодит компани',methodologyBundleSha256:'task07',runtimeSnapshotHash:'task07',generatedAt:'2026-10-23T00:00:00.000Z',assessmentMode:'FULL',assessmentStatus:'COMPLETED',routingState:'ADAPTIVE_V13_COMPLETE',methodology:def,snapshot,strategy,purposeLabels});
 const payload=buildFrozenReportPayload({reportId:`RPT-${def.domainCode}-${reverse?'B':'A'}`,payloadHash:'task07',diagnosisResultHash:'diag-task07',strategyHash:'strategy-task07',planHash:'plan-task07',bindingHash:'binding-task07',generatedAt:'2026-10-23T00:00:00.000Z',assessmentId:result.assessmentId,assessmentMode:'FULL',assessmentStatus:'COMPLETED',routingState:'ADAPTIVE_V13_COMPLETE',companyName:'Бодит компани',methodology:def,snapshot,strategy,purposeLabels});
 return {selected,highIds,lowIds,snapshot,strategy,result,payload};
}
const summaries=[];
for(const [domain,file] of BUNDLES){
 const def=buildDefinition(JSON.parse(fs.readFileSync(file,'utf8'))); const a=scenario(def,false); const b=scenario(def,true);
 check(`${domain} official result`,a.result.resultStatus==='OFFICIAL',a.result.resultStatus);
 check(`${domain} five controlled strengths`,a.result.strengths.items.length>=5,a.result.strengths.items.length);
 check(`${domain} strengths originate only from high-score categories`,a.result.strengths.items.slice(0,5).every(x=>a.highIds.has(x.capabilityId)),a.result.strengths.items.slice(0,5).map(x=>x.capabilityId).join(','));
 check(`${domain} validated weak cells originate only from low-score categories`,a.result.evidence.weakCells.length>0&&a.result.evidence.weakCells.every(x=>a.lowIds.has(x.capabilityId)),a.result.evidence.weakCells.slice(0,5).map(x=>x.capabilityId).join(','));
 check(`${domain} selected root findings exist`,a.result.rootCauses.selected.length>0,a.result.rootCauses.selected.length);
 check(`${domain} selected roots originate only from low-score categories`,a.result.rootCauses.selected.every(x=>a.lowIds.has(x.categoryId)),a.result.rootCauses.selected.map(x=>x.categoryId).join(','));
 check(`${domain} execution priorities exist`,a.strategy.recommendations.executionActions.length>0,a.strategy.recommendations.executionActions.length);
 check(`${domain} execution priorities originate only from low-score findings`,a.strategy.recommendations.executionActions.every(x=>(x.affectedScopes??[{categoryId:x.categoryId}]).every(s=>a.lowIds.has(s.categoryId))),a.strategy.recommendations.executionActions.map(x=>x.categoryId).join(','));
 check(`${domain} report strengths stay tied to high scores`,a.payload.strengths.every(x=>a.highIds.has(x.categoryId)),a.payload.strengths.map(x=>x.categoryId).join(','));
 check(`${domain} report roots stay tied to low scores`,a.payload.rootFindings.every(x=>a.lowIds.has(x.categoryId)),a.payload.rootFindings.map(x=>x.categoryId).join(','));
 check(`${domain} report actions stay tied to low-score findings`,a.payload.priorityActions.every(x=>(x.affectedScopes??[{categoryId:x.categoryId}]).every(s=>a.lowIds.has(s.categoryId))),a.payload.priorityActions.map(x=>x.categoryId).join(','));
 const rootsA=new Set(a.result.rootCauses.selected.map(x=>x.categoryId)); const rootsB=new Set(b.result.rootCauses.selected.map(x=>x.categoryId));
 check(`${domain} reversing answers reverses root-finding side`,[...rootsA].every(id=>!rootsB.has(id)),`${[...rootsA].join(',')} / ${[...rootsB].join(',')}`);
 const actionsA=new Set(a.strategy.recommendations.executionActions.flatMap(x=>(x.affectedScopes??[{categoryId:x.categoryId}]).map(s=>s.categoryId))); const actionsB=new Set(b.strategy.recommendations.executionActions.flatMap(x=>(x.affectedScopes??[{categoryId:x.categoryId}]).map(s=>s.categoryId)));
 check(`${domain} reversing answers changes priority-action source`,[...actionsA].every(id=>!actionsB.has(id)),`${[...actionsA].join(',')} / ${[...actionsB].join(',')}`);
 summaries.push({domain,strengths:a.result.strengths.items.slice(0,5).map(x=>x.capabilityId),roots:[...rootsA],actions:[...actionsA],reversedRoots:[...rootsB],reversedActions:[...actionsB]});
}
console.log(JSON.stringify({status:'PASS',domains:BUNDLES.length,checksPassed:checks.length,checksTotal:checks.length,summaries},null,2));
