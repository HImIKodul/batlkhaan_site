import fs from 'node:fs';
import { buildDefinition, calculateRuntimeSnapshot, evidenceFromAnswer } from '../dist-strategy/engine/index.js';
import { runStrategyPipeline } from '../dist-strategy/strategy/index.js';
import { buildDiagnosisResultV13 } from '../dist-strategy/diagnosis/result.js';
import { buildFrozenReportPayload } from '../dist-strategy/report/payload.js';
import { deterministicFallbackNarrative } from '../dist-strategy/report/fallback-renderer.js';
import { validateNarrativeDraft } from '../dist-strategy/report/validator.js';

const BUNDLES=[
 ['marketing','methodology/MMRI_v3.0.3_QBANK_v3.1.3_STEP6_OF6_ACCEPTED_FINAL.json'],
 ['it','methodology/businessmri-v2.5-runtime-bundles/MMRI_ISMRI_Methodology_4.3.5_BUSINESSMRI_V2.json'],
 ['finance','methodology/businessmri-v2.5-runtime-bundles/MMRI_FINMRI_Methodology_4.2.5_BUSINESSMRI_V2.json'],
 ['people','methodology/businessmri-v2.5-runtime-bundles/MMRI_HRMRI_Methodology_4.1.5_BUSINESSMRI_V2.json'],
 ['operations','methodology/businessmri-v2.5-runtime-bundles/MMRI_OPMRI_Methodology_4.4.5_BUSINESSMRI_V2.json']
];
const checks=[];const check=(name,pass,detail='')=>{checks.push({name,pass:Boolean(pass),detail:String(detail)});if(!pass)throw new Error(`FAIL ${name}: ${detail}`)};
function q(def,cat,cell,path){const x=def.questionByCategoryCellPath.get(`${cat}:${cell}:${path}`);if(!x)throw new Error(`Missing ${cat}:${cell}:${path}`);return x}
function applicable(x){return x.options.find(o=>['APPLICABLE','MOSTLY_APPLICABLE','PARTIAL_APPLICABILITY'].includes(o.state))?.optionIndex ?? x.options.find(o=>o.optionIndex===1&&!['N_A_CLAIM','DNK'].includes(o.state))?.optionIndex ?? x.options[0].optionIndex}
function na(x){const o=x.options.find(v=>v.state==='N_A_CLAIM');if(!o)throw new Error(`Missing N/A ${x.id}`);return o.optionIndex}
function scored(x,high){const rows=x.options.filter(o=>o.state==='SCORED'&&o.score!==null).slice().sort((a,b)=>Number(a.score)-Number(b.score));return rows.length?(high?rows.at(-1):rows[0]).optionIndex:null}
function ev(def,question,optionIndex){return evidenceFromAnswer({definition:def,question,optionIndex,explicitAuthority:1,respondentRoleId:'R01'})}
function scenario(def,reverse=false){
 const selected=def.categories.slice(0,10);const selectedIds=new Set(selected.map(c=>c.id));const high=new Set((reverse?selected.slice(5):selected.slice(0,5)).map(c=>c.id));const low=new Set((reverse?selected.slice(0,5):selected.slice(5)).map(c=>c.id));const evidence=[];
 for(const c of def.categories){if(selectedIds.has(c.id)){const x=q(def,c.id,'C01',1);evidence.push(ev(def,x,applicable(x)))}else for(const path of [1,2,3]){const x=q(def,c.id,'C01',path);evidence.push(ev(def,x,na(x)))}}
 for(const c of selected){for(const cell of def.cells){if(cell.id==='C01')continue;for(const path of [1,2,3,4]){const x=def.questionByCategoryCellPath.get(`${c.id}:${cell.id}:${path}`);if(!x)continue;const policy=def.runtimePolicy?.questionById.get(x.id);if(policy&&(!policy.scoreEligible||policy.routingState==='INFER_ONLY'))continue;const oi=scored(x,high.has(c.id));if(oi!==null)evidence.push(ev(def,x,oi));}}}
 const snapshot=calculateRuntimeSnapshot(def,evidence);const strategy=runStrategyPipeline({methodology:def,snapshot,profileAnswers:[{questionId:'P05',optionIndexes:[5]},{questionId:'P20',optionIndexes:[1]}]});const purposeLabels={P1:'Зорилго 1',P2:'Зорилго 2',P3:'Зорилго 3',P4:'Зорилго 4',P5:'Зорилго 5'};
 const result=buildDiagnosisResultV13({assessmentId:`ASS-${def.domainCode}-${reverse?'B':'A'}`,companyId:'COMP-1',companyName:'Бодит компани',methodologyBundleSha256:'step7',runtimeSnapshotHash:'step7',generatedAt:'2026-10-24T00:00:00.000Z',assessmentMode:'FULL',assessmentStatus:'COMPLETED',routingState:'COMPLETE',methodology:def,snapshot,strategy,purposeLabels});
 const payload=buildFrozenReportPayload({reportId:`RPT-${def.domainCode}-${reverse?'B':'A'}`,payloadHash:'step7',diagnosisResultHash:'diag-step7',strategyHash:'strategy-step7',planHash:'plan-step7',bindingHash:'binding-step7',generatedAt:'2026-10-24T00:00:00.000Z',assessmentId:result.assessmentId,assessmentMode:'FULL',assessmentStatus:'COMPLETED',routingState:'COMPLETE',companyName:'Бодит компани',methodology:def,snapshot,strategy,purposeLabels});
 const draft=deterministicFallbackNarrative(payload);const validation=validateNarrativeDraft(payload,draft);return {selected,high,low,result,payload,draft,validation};
}
const summaries=[];
for(const [domain,file] of BUNDLES){const def=buildDefinition(JSON.parse(fs.readFileSync(file,'utf8')));const a=scenario(def,false),b=scenario(def,true);const names=new Map(def.categories.map(c=>[c.id,c.nameMn]));
 check(`${domain} exactly 64 categories`,a.result.capabilities.length===64,a.result.capabilities.length);
 check(`${domain} unique 64 category ids`,new Set(a.result.capabilities.map(x=>x.id)).size===64);
 check(`${domain} five canonical strengths`,a.payload.strengths.length===5,a.payload.strengths.length);
 check(`${domain} five canonical weaknesses`,a.payload.weaknesses.length===5,a.payload.weaknesses.length);
 check(`${domain} strengths from high categories`,a.payload.strengths.every(x=>a.high.has(x.categoryId)),a.payload.strengths.map(x=>x.categoryId).join(','));
 check(`${domain} weaknesses from low categories`,a.payload.weaknesses.every(x=>a.low.has(x.categoryId)),a.payload.weaknesses.map(x=>x.categoryId).join(','));
 check(`${domain} strength names exact`,a.payload.strengths.every(x=>x.nameMn===names.get(x.categoryId)));
 check(`${domain} weakness names exact`,a.payload.weaknesses.every(x=>x.nameMn===names.get(x.categoryId)));
 check(`${domain} no strength weakness overlap`,a.payload.strengths.every(s=>!a.payload.weaknesses.some(w=>w.categoryId===s.categoryId)));
 check(`${domain} weaknesses sorted weakest first`,a.payload.weaknesses.every((x,i,arr)=>i===0||arr[i-1].score<=x.score));
 check(`${domain} weakness trace frozen`,a.payload.weaknesses.every(w=>w.sourceTraceIds.includes(`category:${w.categoryId}`)&&w.sourceTraceIds.includes(`weakness:${w.id}`)&&Boolean(a.payload.traceIndex[`weakness:${w.id}`])));
 check(`${domain} root findings stay separate`,a.payload.rootFindings.every(r=>a.low.has(r.categoryId)));
 check(`${domain} critical actions stay low-side grounded`,a.payload.priorityActions.every(x=>(x.affectedScopes??[{categoryId:x.categoryId}]).every(s=>a.low.has(s.categoryId))));
 const s4=a.draft.sections.find(s=>s.id==='S04'),s5=a.draft.sections.find(s=>s.id==='S05');
 check(`${domain} fallback has five strength claims`,s4?.claims.length===5,s4?.claims.length);
 check(`${domain} fallback has five weakness claims`,s5?.claims.length===5,s5?.claims.length);
 check(`${domain} fallback strengths authoritative order`,s4?.claims.every((c,i)=>c.claimType==='STRENGTH'&&c.textMn.includes(a.payload.strengths[i].nameMn)&&c.sourceTraceIds.includes(`strength:${a.payload.strengths[i].id}`)));
 check(`${domain} fallback weaknesses authoritative order`,s5?.claims.every((c,i)=>c.claimType==='WEAKNESS'&&c.textMn.includes(a.payload.weaknesses[i].nameMn)&&c.sourceTraceIds.includes(`weakness:${a.payload.weaknesses[i].id}`)));
 check(`${domain} fallback validates`,a.validation.state==='PASS',JSON.stringify(a.validation.issues));
 check(`${domain} reversing evidence changes strengths`,a.payload.strengths.every(x=>!b.payload.strengths.some(y=>y.categoryId===x.categoryId)));
 check(`${domain} reversing evidence changes weaknesses`,a.payload.weaknesses.every(x=>!b.payload.weaknesses.some(y=>y.categoryId===x.categoryId)));
 summaries.push({domain,strengths:a.payload.strengths.map(x=>x.categoryId),weaknesses:a.payload.weaknesses.map(x=>x.categoryId),roots:a.payload.rootFindings.map(x=>x.categoryId),actions:a.payload.priorityActions.map(x=>x.categoryId)});
}
console.log(JSON.stringify({status:'PASS',domains:BUNDLES.length,checksPassed:checks.length,checksTotal:checks.length,summaries},null,2));
