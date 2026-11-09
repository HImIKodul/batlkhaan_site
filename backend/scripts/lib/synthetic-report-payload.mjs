/* Builds a synthetic frozen report payload (no customer data) for the real-provider smoke test. Same construction as the AI regressions. */
import fs from 'node:fs';
import { buildDefinition, calculateRuntimeSnapshot, evidenceFromAnswer } from '../../dist-strategy/engine/index.js';
import { runStrategyPipeline } from '../../dist-strategy/strategy/index.js';
import { buildFrozenReportPayload, deterministicFallbackNarrative, generateValidatedNarrative, reportBindingMaterial } from '../../dist-strategy/report/index.js';
import { safeNarrativeCompanyName } from '../../dist-strategy/report/ai-prompt.js';import { validateNarrativeDraft } from '../../dist-strategy/report/validator.js';
import { sha256Json } from '../../dist-strategy/lib/hash.js';
export async function buildSyntheticPayload(){
const checks=[];const check=(name,pass,detail='')=>{checks.push({name,pass:Boolean(pass),detail:String(detail)});if(!pass)throw new Error(`FAIL ${name}: ${detail}`)};
const file='methodology/MMRI_v3.0.3_QBANK_v3.1.3_STEP6_OF6_ACCEPTED_FINAL.json';
const def=buildDefinition(JSON.parse(fs.readFileSync(file,'utf8')));
function q(cat,cell,path){const x=def.questionByCategoryCellPath.get(`${cat}:${cell}:${path}`);if(!x)throw new Error(`Missing ${cat}:${cell}:${path}`);return x}
function applicable(x){return x.options.find(o=>['APPLICABLE','MOSTLY_APPLICABLE','PARTIAL_APPLICABILITY'].includes(o.state))?.optionIndex ?? x.options[0].optionIndex}
function na(x){return x.options.find(o=>o.state==='N_A_CLAIM')?.optionIndex ?? x.options[0].optionIndex}
function scored(x,high){const rows=x.options.filter(o=>o.state==='SCORED'&&o.score!==null).sort((a,b)=>Number(a.score)-Number(b.score));return rows.length?(high?rows.at(-1):rows[0]).optionIndex:null}
function ev(x,oi){return evidenceFromAnswer({definition:def,question:x,optionIndex:oi,explicitAuthority:1,respondentRoleId:'R01'})}
const selected=def.categories.slice(0,10),set=new Set(selected.map(c=>c.id)),high=new Set(selected.slice(0,5).map(c=>c.id)),evidence=[];
for(const c of def.categories){if(set.has(c.id)){const x=q(c.id,'C01',1);evidence.push(ev(x,applicable(x)))}else for(const p of [1,2,3]){const x=q(c.id,'C01',p);evidence.push(ev(x,na(x)))}}
for(const c of selected)for(const cell of def.cells){if(cell.id==='C01')continue;for(const p of [1,2,3,4]){const x=def.questionByCategoryCellPath.get(`${c.id}:${cell.id}:${p}`);if(!x)continue;const policy=def.runtimePolicy?.questionById.get(x.id);if(policy&&(!policy.scoreEligible||policy.routingState==='INFER_ONLY'))continue;const oi=scored(x,high.has(c.id));if(oi!==null)evidence.push(ev(x,oi))}}
const snapshot=calculateRuntimeSnapshot(def,evidence),strategy=runStrategyPipeline({methodology:def,snapshot,profileAnswers:[{questionId:'P05',optionIndexes:[5]},{questionId:'P20',optionIndexes:[1]}]});
const diagnosisResultHash='diag-step11',strategyHash='strategy-step11',planHash='plan-step11';
const bindingHash=sha256Json(reportBindingMaterial({diagnosisResultHash,strategyHash,planHash,reportContractVersion:def.contracts.report.version,aiContractVersion:def.contracts.aiGeneration.version,findingsPolicyVersion:'MMRI-REPORT-FINDINGS-1.0-FIVE-CATEGORY'}));
let payload=buildFrozenReportPayload({reportId:'RPT-step11-V4',payloadHash:'',traceVersion:'MMRI-TRACE-1.0',versionBundleId:'bundle-step11',versionBundleHash:'bundlehash-step11',sourceSnapshotId:'snapshot-step11',sourceSnapshotHash:'snapshothash-step11',diagnosisResultHash,strategyHash,planHash,bindingHash,generatedAt:'2026-10-25T01:00:00.000Z',assessmentId:'ASS-step11',assessmentMode:'FULL',assessmentStatus:'COMPLETED',routingState:'FULL_COMPLETE',companyName:'Тест компани',methodology:def,snapshot,strategy,purposeLabels:Object.fromEntries([...snapshot.purposes.keys()].map((id,i)=>[id,`Зорилго ${i+1}`]))});
payload={...payload,payloadHash:sha256Json({...payload,payloadHash:''})};
const fallback=deterministicFallbackNarrative(payload);

return payload;
}
