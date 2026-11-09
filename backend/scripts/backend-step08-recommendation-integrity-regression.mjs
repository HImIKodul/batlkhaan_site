import fs from 'node:fs';
import { buildDefinition, calculateRuntimeSnapshot, evidenceFromAnswer } from '../dist-strategy/engine/index.js';
import { runStrategyPipeline } from '../dist-strategy/strategy/index.js';
import { buildFrozenReportPayload } from '../dist-strategy/report/payload.js';

const BUNDLES=[
 ['marketing','methodology/MMRI_v3.0.3_QBANK_v3.1.3_STEP6_OF6_ACCEPTED_FINAL.json'],
 ['it','methodology/businessmri-v2.5-runtime-bundles/MMRI_ISMRI_Methodology_4.3.5_BUSINESSMRI_V2.json'],
 ['finance','methodology/businessmri-v2.5-runtime-bundles/MMRI_FINMRI_Methodology_4.2.5_BUSINESSMRI_V2.json'],
 ['people','methodology/businessmri-v2.5-runtime-bundles/MMRI_HRMRI_Methodology_4.1.5_BUSINESSMRI_V2.json'],
 ['operations','methodology/businessmri-v2.5-runtime-bundles/MMRI_OPMRI_Methodology_4.4.5_BUSINESSMRI_V2.json']
];
const checks=[]; const check=(name,pass,detail='')=>{checks.push({name,pass:Boolean(pass),detail:String(detail)});if(!pass)throw new Error(`FAIL ${name}: ${detail}`)};
const setEq=(a,b)=>a.size===b.size&&[...a].every(x=>b.has(x));
function q(def,cat,cell,path){const x=def.questionByCategoryCellPath.get(`${cat}:${cell}:${path}`);if(!x)throw new Error(`Missing ${cat}:${cell}:${path}`);return x}
function applicable(x){return x.options.find(o=>['APPLICABLE','MOSTLY_APPLICABLE','PARTIAL_APPLICABILITY'].includes(o.state))?.optionIndex ?? x.options.find(o=>o.optionIndex===1&&!['N_A_CLAIM','DNK'].includes(o.state))?.optionIndex ?? x.options[0].optionIndex}
function na(x){const o=x.options.find(v=>v.state==='N_A_CLAIM');if(!o)throw new Error(`Missing N/A ${x.id}`);return o.optionIndex}
function scored(x,high){const rows=x.options.filter(o=>o.state==='SCORED'&&o.score!==null).slice().sort((a,b)=>Number(a.score)-Number(b.score));return rows.length?(high?rows.at(-1):rows[0]).optionIndex:null}
function ev(def,question,optionIndex){return evidenceFromAnswer({definition:def,question,optionIndex,explicitAuthority:1,respondentRoleId:'R01'})}
function scenario(def,{reverse=false,capacity=5}={}){
 const selected=def.categories.slice(0,10);const selectedIds=new Set(selected.map(c=>c.id));const high=new Set((reverse?selected.slice(5):selected.slice(0,5)).map(c=>c.id));const low=new Set((reverse?selected.slice(0,5):selected.slice(5)).map(c=>c.id));const evidence=[];
 for(const c of def.categories){if(selectedIds.has(c.id)){const x=q(def,c.id,'C01',1);evidence.push(ev(def,x,applicable(x)))}else for(const path of [1,2,3]){const x=q(def,c.id,'C01',path);evidence.push(ev(def,x,na(x)))}}
 for(const c of selected){for(const cell of def.cells){if(cell.id==='C01')continue;for(const path of [1,2,3,4]){const x=def.questionByCategoryCellPath.get(`${c.id}:${cell.id}:${path}`);if(!x)continue;const policy=def.runtimePolicy?.questionById.get(x.id);if(policy&&(!policy.scoreEligible||policy.routingState==='INFER_ONLY'))continue;const oi=scored(x,high.has(c.id));if(oi!==null)evidence.push(ev(def,x,oi));}}}
 const snapshot=calculateRuntimeSnapshot(def,evidence);const profileAnswers=[{questionId:'P05',optionIndexes:[capacity]},{questionId:'P20',optionIndexes:[1]}];const strategy=runStrategyPipeline({methodology:def,snapshot,profileAnswers});const purposeLabels={P1:'Зорилго 1',P2:'Зорилго 2',P3:'Зорилго 3',P4:'Зорилго 4',P5:'Зорилго 5'};
 const payload=buildFrozenReportPayload({reportId:`RPT-${def.domainCode}-${reverse?'B':'A'}-${capacity}`,payloadHash:'step8',diagnosisResultHash:'diag-step8',strategyHash:'strategy-step8',planHash:'plan-step8',bindingHash:'binding-step8',generatedAt:'2026-10-24T00:00:00.000Z',assessmentId:`ASS-${def.domainCode}-${reverse?'B':'A'}-${capacity}`,assessmentMode:'FULL',assessmentStatus:'COMPLETED',routingState:'COMPLETE',companyName:'Бодит компани',methodology:def,snapshot,strategy,purposeLabels});
 return {selected,high,low,snapshot,strategy,payload};
}
const forbiddenEnglish=[/Validation note/i,/Evidence pack/i,/Resolved evidence record/i];
const summaries=[];
for(const [domain,file] of BUNDLES){
 const def=buildDefinition(JSON.parse(fs.readFileSync(file,'utf8'))); const a=scenario(def,{capacity:5}), repeat=scenario(def,{capacity:5}), lowCap=scenario(def,{capacity:1}), rev=scenario(def,{reverse:true,capacity:5});
 const reportActions=[...a.payload.priorityActions,...a.payload.evidenceActions]; const reportIds=new Set(reportActions.map(x=>x.id)); const planIds=new Set(a.strategy.actionPlan.includedRecommendationIds); const milestoneIds=new Set(a.strategy.actionPlan.milestones.map(x=>x.recommendationId));
 check(`${domain} critical actions max five`,a.payload.priorityActions.length<=5,a.payload.priorityActions.length);
 check(`${domain} separate evidence max two`,a.payload.evidenceActions.length<=2,a.payload.evidenceActions.length);
 check(`${domain} report action ids unique`,reportIds.size===reportActions.length,reportActions.map(x=>x.id).join(','));
 check(`${domain} critical/evidence sections do not overlap`,a.payload.priorityActions.every(x=>!a.payload.evidenceActions.some(y=>y.id===x.id)));
 check(`${domain} report action set equals plan selection`,setEq(reportIds,planIds),`report=${[...reportIds].join(',')} plan=${[...planIds].join(',')}`);
 check(`${domain} every report action has plan milestone`,[...reportIds].every(id=>milestoneIds.has(id)),[...reportIds].filter(id=>!milestoneIds.has(id)).join(','));
 check(`${domain} every action carries exact recommendation trace`,reportActions.every(x=>x.sourceTraceIds.includes(`recommendation:${x.id}`)));
 check(`${domain} every action carries exact root trace`,reportActions.every(x=>x.sourceTraceIds.includes(`root:${x.findingId}`)));
 check(`${domain} every action has affected scope`,reportActions.every(x=>x.affectedScopes?.length>0));
 check(`${domain} action priorities bounded`,reportActions.every(x=>Number.isFinite(x.priority)&&x.priority>=0&&x.priority<=100));
 check(`${domain} actions grounded in weak-side categories`,a.payload.priorityActions.every(x=>(x.affectedScopes??[{categoryId:x.categoryId}]).every(s=>a.low.has(s.categoryId))),a.payload.priorityActions.flatMap(x=>x.affectedScopes??[]).map(x=>x.categoryId).join(','));
 check(`${domain} action selection deterministic`,JSON.stringify(a.payload.priorityActions.map(x=>x.id))===JSON.stringify(repeat.payload.priorityActions.map(x=>x.id)));
 check(`${domain} evidence selection deterministic`,JSON.stringify(a.payload.evidenceActions.map(x=>x.id))===JSON.stringify(repeat.payload.evidenceActions.map(x=>x.id)));
 check(`${domain} low capacity does not hide critical actions`,JSON.stringify(a.payload.priorityActions.map(x=>x.id))===JSON.stringify(lowCap.payload.priorityActions.map(x=>x.id)),`${a.payload.priorityActions.length}/${lowCap.payload.priorityActions.length}`);
 check(`${domain} all customer action fields populated`,reportActions.every(x=>[x.titleMn,x.actionMn,x.deliverableMn,x.kpiMn,x.ownerRoleId].every(v=>String(v??'').trim().length>0)));
 check(`${domain} action text avoids legacy English fallbacks`,reportActions.every(x=>forbiddenEnglish.every(rx=>!rx.test(`${x.titleMn} ${x.actionMn} ${x.deliverableMn} ${x.kpiMn}`))));
 check(`${domain} reverse evidence changes critical grounding`,a.payload.priorityActions.length===0||rev.payload.priorityActions.length===0||a.payload.priorityActions.some(x=>!rev.payload.priorityActions.some(y=>y.id===x.id)));
 summaries.push({domain,critical:a.payload.priorityActions.map(x=>x.id),evidence:a.payload.evidenceActions.map(x=>x.id),plan:a.strategy.actionPlan.includedRecommendationIds});
}
console.log(JSON.stringify({status:'PASS',domains:BUNDLES.length,checksPassed:checks.length,checksTotal:checks.length,summaries},null,2));
