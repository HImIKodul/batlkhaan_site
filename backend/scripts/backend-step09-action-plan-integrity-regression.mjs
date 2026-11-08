import fs from 'node:fs';
import { buildDefinition, calculateRuntimeSnapshot, evidenceFromAnswer } from '../dist-strategy/engine/index.js';
import { runStrategyPipeline, assertActionPlanIntegrity, immutableActionPlan, buildFrozenStrategyPlan, rehydrateActionPlan } from '../dist-strategy/strategy/index.js';

const BUNDLES=[
 ['marketing','methodology/MMRI_v3.0.3_QBANK_v3.1.3_STEP6_OF6_ACCEPTED_FINAL.json'],
 ['it','methodology/businessmri-v2.5-runtime-bundles/MMRI_ISMRI_Methodology_4.3.5_BUSINESSMRI_V2.json'],
 ['finance','methodology/businessmri-v2.5-runtime-bundles/MMRI_FINMRI_Methodology_4.2.5_BUSINESSMRI_V2.json'],
 ['people','methodology/businessmri-v2.5-runtime-bundles/MMRI_HRMRI_Methodology_4.1.5_BUSINESSMRI_V2.json'],
 ['operations','methodology/businessmri-v2.5-runtime-bundles/MMRI_OPMRI_Methodology_4.4.5_BUSINESSMRI_V2.json']
];
const order=['H0','H1','H2','H3','H4'];
const checks=[]; const check=(name,pass,detail='')=>{checks.push({name,pass:Boolean(pass),detail:String(detail)});if(!pass)throw new Error(`FAIL ${name}: ${detail}`)};
function q(def,cat,cell,path){const x=def.questionByCategoryCellPath.get(`${cat}:${cell}:${path}`);if(!x)throw new Error(`Missing ${cat}:${cell}:${path}`);return x}
function applicable(x){return x.options.find(o=>['APPLICABLE','MOSTLY_APPLICABLE','PARTIAL_APPLICABILITY'].includes(o.state))?.optionIndex ?? x.options.find(o=>o.optionIndex===1&&!['N_A_CLAIM','DNK'].includes(o.state))?.optionIndex ?? x.options[0].optionIndex}
function na(x){const o=x.options.find(v=>v.state==='N_A_CLAIM');if(!o)throw new Error(`Missing N/A ${x.id}`);return o.optionIndex}
function scored(x,high){const rows=x.options.filter(o=>o.state==='SCORED'&&o.score!==null).slice().sort((a,b)=>Number(a.score)-Number(b.score));return rows.length?(high?rows.at(-1):rows[0]).optionIndex:null}
function ev(def,question,optionIndex){return evidenceFromAnswer({definition:def,question,optionIndex,explicitAuthority:1,respondentRoleId:'R01'})}
function scenario(def,{reverse=false,capacity=5}={}){
 const selected=def.categories.slice(0,10);const selectedIds=new Set(selected.map(c=>c.id));const high=new Set((reverse?selected.slice(5):selected.slice(0,5)).map(c=>c.id));const evidence=[];
 for(const c of def.categories){if(selectedIds.has(c.id)){const x=q(def,c.id,'C01',1);evidence.push(ev(def,x,applicable(x)))}else for(const path of [1,2,3]){const x=q(def,c.id,'C01',path);evidence.push(ev(def,x,na(x)))}}
 for(const c of selected){for(const cell of def.cells){if(cell.id==='C01')continue;for(const path of [1,2,3,4]){const x=def.questionByCategoryCellPath.get(`${c.id}:${cell.id}:${path}`);if(!x)continue;const policy=def.runtimePolicy?.questionById.get(x.id);if(policy&&(!policy.scoreEligible||policy.routingState==='INFER_ONLY'))continue;const oi=scored(x,high.has(c.id));if(oi!==null)evidence.push(ev(def,x,oi));}}}
 const snapshot=calculateRuntimeSnapshot(def,evidence);const profileAnswers=[{questionId:'P05',optionIndexes:[capacity]},{questionId:'P20',optionIndexes:[1]}];return runStrategyPipeline({methodology:def,snapshot,profileAnswers});
}
function start(plan,id){const hs=plan.milestones.filter(m=>m.recommendationId===id).map(m=>m.horizon);if(!hs.length)return null;return hs.sort((a,b)=>(a==='DEFERRED_BEYOND_V1'?99:order.indexOf(a))-(b==='DEFERRED_BEYOND_V1'?99:order.indexOf(b)))[0]}
function activeRequired(plan,h){return new Set(plan.milestones.filter(m=>m.requirement==='Required'&&m.horizon===h).map(m=>m.recommendationId))}
const summaries=[];
for(const [domain,file] of BUNDLES){
 const def=buildDefinition(JSON.parse(fs.readFileSync(file,'utf8')));const a=scenario(def,{capacity:5}), repeat=scenario(def,{capacity:5}), low=scenario(def,{capacity:1});const plan=a.actionPlan, lowPlan=low.actionPlan;
 const selected=new Set(plan.includedRecommendationIds);const roleIds=new Set((def.contracts.authority.roles??[]).map(r=>String(r.id)));
 check(`${domain} 365-day window`,plan.windowDays===365,plan.windowDays);
 check(`${domain} exact horizon coverage`,JSON.stringify(plan.horizons.map(h=>[h.id,h.dayStart,h.dayEnd]))===JSON.stringify([['H0',0,14],['H1',15,30],['H2',31,90],['H3',91,180],['H4',181,365]]));
 check(`${domain} remeasurement ordered`,JSON.stringify(plan.remeasurementHorizons)===JSON.stringify(['H2','H3','H4']),plan.remeasurementHorizons.join(','));
 check(`${domain} selected ids unique`,selected.size===plan.includedRecommendationIds.length);
 check(`${domain} dependency ids unique`,new Set(plan.dependencies.map(d=>d.id)).size===plan.dependencies.length);
 check(`${domain} dependencies reference selected actions`,plan.dependencies.every(d=>selected.has(d.upstreamRecommendationId)&&selected.has(d.downstreamRecommendationId)&&d.upstreamRecommendationId!==d.downstreamRecommendationId));
 check(`${domain} dependency timing valid`,plan.dependencies.every(d=>{const u=start(plan,d.upstreamRecommendationId),v=start(plan,d.downstreamRecommendationId);if(v==='DEFERRED_BEYOND_V1')return true;if(u==='DEFERRED_BEYOND_V1'||!u||!v)return false;return d.kind==='SAME_FINDING_EVIDENCE'?order.indexOf(u)<order.indexOf(v):order.indexOf(u)<=order.indexOf(v)}));
 check(`${domain} milestone ids unique`,new Set(plan.milestones.map(m=>m.id)).size===plan.milestones.length);
 check(`${domain} every selected action has milestone`,plan.includedRecommendationIds.every(id=>plan.milestones.some(m=>m.recommendationId===id)));
 check(`${domain} milestone customer fields complete`,plan.milestones.every(m=>[m.titleMn,m.milestoneMn,m.deliverableMn,m.kpiMn,m.ownerRoleId].every(v=>String(v??'').trim().length>0)));
 check(`${domain} milestone owners canonical`,plan.milestones.every(m=>roleIds.has(m.ownerRoleId)),[...new Set(plan.milestones.filter(m=>!roleIds.has(m.ownerRoleId)).map(m=>m.ownerRoleId))].join(','));
 const recById=new Map(a.recommendations.candidates.map(r=>[r.id,r]));
 check(`${domain} owner assignment preserves recommendation owner`,plan.milestones.every(m=>m.ownerRoleId===recById.get(m.recommendationId)?.ownerRoleId));
 check(`${domain} KPI preserves recommendation KPI`,plan.milestones.every(m=>m.kpiMn===recById.get(m.recommendationId)?.kpiMn));
 check(`${domain} milestone traces complete`,plan.milestones.every(m=>m.sourceTraceIds.includes(`milestone:${m.id}`)));
 check(`${domain} milestone initial state`,plan.milestones.every(m=>m.status==='NOT_STARTED'));
 let phaseOk=true;for(const id of selected){const rows=plan.milestones.filter(m=>m.recommendationId===id).sort((x,y)=>x.phaseIndex-y.phaseIndex);let last=-1,deferred=false;rows.forEach((m,i)=>{if(m.phaseIndex!==i+1)phaseOk=false;if(m.horizon==='DEFERRED_BEYOND_V1'){deferred=true;return}if(deferred||order.indexOf(m.horizon)<last)phaseOk=false;last=order.indexOf(m.horizon)})}
 check(`${domain} phases contiguous and nondecreasing`,phaseOk);
 const cap=def.contracts.actionPlan.capacity[String(plan.capacityLevel)]??def.contracts.actionPlan.capacity['3'];let capOk=true;for(const h of order){const ids=activeRequired(plan,h);const recs=a.recommendations.candidates.filter(r=>ids.has(r.id));if(recs.length>Number(cap.maxActiveActions)||recs.filter(r=>r.effortLevel>=4).length>Number(cap.maxHighEffortActive))capOk=false}
 check(`${domain} normal capacity respected`,capOk);
 const lowCap=def.contracts.actionPlan.capacity[String(lowPlan.capacityLevel)]??def.contracts.actionPlan.capacity['3'];let lowCapOk=true;for(const h of order){const ids=activeRequired(lowPlan,h);const recs=low.recommendations.candidates.filter(r=>ids.has(r.id));if(recs.length>Number(lowCap.maxActiveActions)||recs.filter(r=>r.effortLevel>=4).length>Number(lowCap.maxHighEffortActive))lowCapOk=false}
 check(`${domain} capacity-1 respected`,lowCapOk);
 check(`${domain} capacity-1 retains in-window work`,lowPlan.milestones.some(m=>m.requirement==='Required'&&m.horizon!=='DEFERRED_BEYOND_V1'));
 check(`${domain} plan deterministic`,JSON.stringify(immutableActionPlan(plan))===JSON.stringify(immutableActionPlan(repeat.actionPlan)));
 const frozen=buildFrozenStrategyPlan({assessmentId:`ASS-${domain}`,methodologyVersion:def.version,methodologyBundleSha256:'bundle-step9',runtimeSnapshotHash:'runtime-step9',diagnosisResultHash:`diag-${domain}`,generatedAt:'2026-10-24T00:00:00.000Z',strategyHash:`strategy-${domain}`,planHash:`plan-${domain}`,strategy:a});
 const rehydrated=rehydrateActionPlan(frozen,new Map());
 check(`${domain} frozen plan preserves dependencies`,JSON.stringify(rehydrated.dependencies)===JSON.stringify(plan.dependencies));
 assertActionPlanIntegrity(def,a.recommendations,plan);check(`${domain} explicit integrity validator passes`,true);
 const broken=structuredClone(plan); if(broken.milestones.length){broken.milestones[0].kpiMn='';let rejected=false;try{assertActionPlanIntegrity(def,a.recommendations,broken)}catch{rejected=true}check(`${domain} empty KPI rejected`,rejected)}
 summaries.push({domain,actions:plan.includedRecommendationIds.length,dependencies:plan.dependencies.length,milestones:plan.milestones.length,lowCapacityInWindow:lowPlan.milestones.filter(m=>m.horizon!=='DEFERRED_BEYOND_V1').length});
}
console.log(JSON.stringify({status:'PASS',domains:BUNDLES.length,checksPassed:checks.length,checksTotal:checks.length,summaries},null,2));
