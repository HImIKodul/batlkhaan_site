/* WS-E MMRI-43: a failed provider call must still report attempts, retries, request ids and final status. No network: global fetch is replaced.
   Run after `npm run strategy:typecheck`. */
import { buildSyntheticPayload } from './lib/synthetic-report-payload.mjs';
import { generateValidatedNarrative, OpenAiNarrativeProvider } from '../dist-strategy/report/index.js';
const payload=await buildSyntheticPayload();
let fail=0;const rec=(n,ok,d='')=>{if(!ok)fail++;console.log((ok?'PASS ':'FAIL ')+n+(d?' | '+d:''))};
const realFetch=globalThis.fetch;let calls=0;
const respond=(status,rid)=>new Response(JSON.stringify({error:{message:'upstream busy',code:'server_error'}}),{status,headers:{'content-type':'application/json','x-request-id':rid}});
try{
 globalThis.fetch=async()=>{calls++;return respond(calls===1?503:500,`req-${calls}`)};
 const provider=new OpenAiNarrativeProvider({apiKey:'sk-test-not-real',model:'test-model',maxRetries:1,retryBaseDelayMs:1,retryMaxDelayMs:5,timeoutMs:2000,totalTimeoutMs:10000});
 const r=await generateValidatedNarrative(payload,provider);
 rec('T43-01 provider failure ends in the deterministic fallback',r.state==='AI_FALLBACK_USED'&&Boolean(r.providerError),String(r.providerError).slice(0,80));
 rec('T43-02 the failed calls are counted (2 HTTP attempts for 1 retry)',r.providerHttpAttempts===2&&calls===2,`audit=${r.providerHttpAttempts} actual=${calls}`);
 rec('T43-03 retry count and request ids of the failed calls are kept',r.providerRetryCount===1&&r.providerRequestIds.join(',')==='req-1,req-2',`retries=${r.providerRetryCount} ids=${r.providerRequestIds.join(',')}`);
 // custom provider that throws an error carrying telemetry
 const custom={metadata:{provider:'CUSTOM',modelIdentifier:'fake',modelConfig:{},promptVersion:'x'},async generate(){const e=new Error('boom');e.telemetry={httpAttempts:3,retryCount:2,requestIds:['a','b'],finalHttpStatus:503,durationMs:5};throw e}};
 const r2=await generateValidatedNarrative(payload,custom);
 rec('T43-04 any provider error carrying telemetry is absorbed',r2.providerHttpAttempts===3&&r2.providerRetryCount===2&&r2.providerRequestIds.length===2,JSON.stringify([r2.providerHttpAttempts,r2.providerRetryCount,r2.providerRequestIds]));
 const plain={metadata:custom.metadata,async generate(){throw new Error('plain')}};const r3=await generateValidatedNarrative(payload,plain);
 rec('T43-05 an error without telemetry still falls back and records zero HTTP attempts',r3.state==='AI_FALLBACK_USED'&&r3.providerHttpAttempts===0);
}finally{globalThis.fetch=realFetch}
console.log(fail?`FAILED ${fail}`:'ALL PASS');process.exit(fail?1:0);
