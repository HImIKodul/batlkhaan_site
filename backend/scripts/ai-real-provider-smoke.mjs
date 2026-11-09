/* REAL AI PROVIDER SMOKE TEST. DO NOT RUN WITHOUT APPROVAL: it makes ONE paid call to the configured provider (plus at most one repair call).
   It refuses to run unless MMRI_AI_SMOKE_APPROVED=YES_PAID_CALL_APPROVED is set. It never prints the API key. Nothing is written to the database.
   Prepare : cd backend && npm run strategy:typecheck
   Run     : set -a; . ./.env; set +a; MMRI_AI_SMOKE_APPROVED=YES_PAID_CALL_APPROVED node scripts/ai-real-provider-smoke.mjs
   Input   : a synthetic frozen report payload built by the same helper the regressions use (no customer data, no e-mail, no account data).
   Checks  : the model id is accepted; the answer parses into the narrative schema; the validator passes (grounded, five strengths/weaknesses, no invented numbers);
             latency and request ids are recorded; the deterministic fallback is NOT used.
   Result  : exit 0 only when a REAL model answer passed validation. Record the output in the release evidence; until then real AI stays "NOT VERIFIED". */
import fs from 'node:fs';
const approved=process.env.MMRI_AI_SMOKE_APPROVED==='YES_PAID_CALL_APPROVED';
const key=(process.env.OPENAI_API_KEY??'').trim(),model=(process.env.MMRI_AI_REPORT_MODEL??'').trim(),endpoint=(process.env.MMRI_AI_REPORT_ENDPOINT??'https://api.openai.com/v1/responses').trim();
console.log(JSON.stringify({plan:'one paid generation call (maxRetries 0), at most one paid repair call',endpoint,model:model||'(unset)',apiKeyPresent:Boolean(key),approved},null,0));
if(!approved){console.log('REFUSED: set MMRI_AI_SMOKE_APPROVED=YES_PAID_CALL_APPROVED to authorize the paid call. No network request was made.');process.exit(2)}
if(!key||!model){console.error('OPENAI_API_KEY and MMRI_AI_REPORT_MODEL are required.');process.exit(3)}
const {OpenAiNarrativeProvider}=await import('../dist-strategy/report/openai-narrative-provider.js');
const {generateValidatedNarrative}=await import('../dist-strategy/report/index.js');
const {buildSyntheticPayload}=await import('./lib/synthetic-report-payload.mjs');
const payload=await buildSyntheticPayload();
const provider=new OpenAiNarrativeProvider({apiKey:key,model,endpoint,timeoutMs:60_000,maxRetries:0,totalTimeoutMs:90_000,maxOutputTokens:8_000});
const t0=Date.now();const r=await generateValidatedNarrative(payload,provider);const ms=Date.now()-t0;
const out={state:r.state,validation:r.validation.state,issues:r.validation.issues?.slice(0,5).map(i=>i.checkId),providerAttempts:r.providerAttempts,providerHttpAttempts:r.providerHttpAttempts,requestIds:r.providerRequestIds,latencyMs:ms,providerError:r.providerError??null,modelIdentifier:provider.metadata.modelIdentifier};
console.log(JSON.stringify(out,null,1));fs.mkdirSync('../.ai-smoke',{recursive:true});fs.writeFileSync('../.ai-smoke/last-run.json',JSON.stringify({at:new Date().toISOString(),...out},null,1));
process.exit(r.state==='PASS'?0:1);
