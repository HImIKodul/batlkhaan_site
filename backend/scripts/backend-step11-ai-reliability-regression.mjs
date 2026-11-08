import fs from 'node:fs';
import { buildDefinition, calculateRuntimeSnapshot, evidenceFromAnswer } from '../dist-strategy/engine/index.js';
import { runStrategyPipeline } from '../dist-strategy/strategy/index.js';
import { buildFrozenReportPayload, deterministicFallbackNarrative, generateValidatedNarrative, reportBindingMaterial } from '../dist-strategy/report/index.js';
import { OpenAiNarrativeProvider } from '../dist-strategy/report/openai-narrative-provider.js';
import { sha256Json } from '../dist-strategy/lib/hash.js';
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
const okBody=()=>JSON.stringify({output_text:JSON.stringify(fallback)});
const originalFetch=globalThis.fetch;
try{
  let calls=0;globalThis.fetch=async()=>{calls++;if(calls===1)return new Response(JSON.stringify({error:{type:'service_unavailable_error',code:'server_is_overloaded',message:'temporary'}}),{status:503,headers:{'retry-after':'0','x-request-id':'req-overload'}});return new Response(okBody(),{status:200,headers:{'x-request-id':'req-success'}})};
  const provider=new OpenAiNarrativeProvider({apiKey:'test',model:'test-model',timeoutMs:1000,maxRetries:2,retryBaseDelayMs:1,retryMaxDelayMs:10,totalTimeoutMs:3000});
  const r=await provider.generate(payload);check('503 overload retries then succeeds',calls===2&&r.telemetry?.httpAttempts===2&&r.telemetry?.retryCount===1,calls);check('provider captures request IDs',r.telemetry?.requestIds.join(',')==='req-overload,req-success',JSON.stringify(r.telemetry));

  calls=0;globalThis.fetch=async()=>{calls++;return new Response(JSON.stringify({error:{type:'insufficient_quota',code:'credit_balance_exhausted',message:'no credits'}}),{status:429,headers:{'retry-after':'0'}})};
  let quotaError='';try{await provider.generate(payload)}catch(e){quotaError=String(e?.message??e)}check('credit exhaustion is not retried',calls===1&&quotaError.includes('credit_balance_exhausted'),quotaError);

  calls=0;globalThis.fetch=async()=>{calls++;if(calls===1)throw new TypeError('network down');return new Response(okBody(),{status:200,headers:{'x-request-id':'req-network-recovered'}})};
  const n=await provider.generate(payload);check('network failure retries then succeeds',calls===2&&n.telemetry?.retryCount===1,calls);

  calls=0;globalThis.fetch=async(_url,{signal}={})=>new Promise((_,reject)=>{calls++;const t=setTimeout(()=>reject(new Error('unexpected')),1000);signal?.addEventListener('abort',()=>{clearTimeout(t);const e=new Error('aborted');e.name='AbortError';reject(e)},{once:true})});
  const timeoutProvider=new OpenAiNarrativeProvider({apiKey:'test',model:'test-model',timeoutMs:10,maxRetries:1,retryBaseDelayMs:1,retryMaxDelayMs:5,totalTimeoutMs:80});
  let timeoutError='';try{await timeoutProvider.generate(payload)}catch(e){timeoutError=String(e?.message??e)}check('timeout is bounded and retried',calls===2&&timeoutError.includes('timed out'),`${calls}:${timeoutError}`);

  const teleProvider={metadata:{provider:'CUSTOM',modelIdentifier:'telemetry-test',modelConfig:{},promptVersion:'test'},async generate(){return {draft:fallback,telemetry:{httpAttempts:3,retryCount:2,requestIds:['a','b'],finalHttpStatus:200,durationMs:10}}}};
  const coordinated=await generateValidatedNarrative(payload,teleProvider);check('coordinator preserves provider telemetry',coordinated.state==='PASS'&&coordinated.providerHttpAttempts===3&&coordinated.providerRetryCount===2&&coordinated.providerRequestIds.length===2,JSON.stringify(coordinated));

  const invalid=structuredClone(fallback);invalid.sections[1].claims[0].textMn+=' 999999 өснө.';
  const invalidProvider={metadata:{provider:'CUSTOM',modelIdentifier:'invalid',modelConfig:{},promptVersion:'test'},async generate(){return invalid}};
  const fall=await generateValidatedNarrative(payload,invalidProvider);check('invalid provider output falls back with reason',fall.state==='AI_FALLBACK_USED'&&Boolean(fall.providerError),fall.providerError);
}finally{globalThis.fetch=originalFetch}
console.log(JSON.stringify({suite:'Backend completion Step 11/20 AI reliability regression',status:'PASS',passed:checks.length,total:checks.length,checks},null,2));
