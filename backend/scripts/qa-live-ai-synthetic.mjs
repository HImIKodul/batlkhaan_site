/* BOUNDED LIVE AI CHECK on SYNTHETIC payloads only (D1). Run it ONLY through qa-live-ai-synthetic.sh, which gives this process
   a minimal environment (model + key, no DATABASE_URL) and Node's permission model (no read of backend/.env or any other path,
   write only to the output directory). Isolation is asserted here BEFORE the first network request:
     - no database/PG variables, no child processes (permission model), `.env` unreadable;
     - payload files contain a synthetic company name and no e-mail address;
     - fetch is restricted to api.openai.com and capped by request count and by an estimated-cost guard (conservative prices, x2 of list).
   Calls are sequential; maxRetries 0; at most one repair call per payload (coordinator behaviour). Output: one JSON per domain for human review. */
import fs from 'node:fs';import path from 'node:path';
const [payloadDir,outDir]=process.argv.slice(2);
const MAX_REQUESTS=Number(process.env.LIVE_MAX_REQUESTS||8),COST_CAP_USD=Number(process.env.LIVE_COST_CAP_USD||0.5);
const IN_PER_M=1.5,OUT_PER_M=7.5; // USD per million tokens: 1.5x the third-party list price ($1 in / $5 out) the earlier live test used; the price itself is NOT confirmed by OpenAI
const SPENT_BEFORE=Number(process.env.LIVE_SPENT_BEFORE_USD||0),EXPECT=Number(process.env.LIVE_EXPECT_FILES||5);
const fail=m=>{console.error('REFUSED: '+m);process.exit(2)};
if(process.env.MMRI_AI_LIVE_SYNTHETIC_APPROVED!=='YES_USD_0_50_CAP')fail('set MMRI_AI_LIVE_SYNTHETIC_APPROVED=YES_USD_0_50_CAP (owner approval D1). No request was made.');
for(const k of Object.keys(process.env))if(/^(DATABASE_URL|MIGRATION_DATABASE_URL|PG[A-Z]*|POSTGRES.*)$/.test(k))fail('database variable present in the environment: '+k);
if(!process.permission)fail('Node permission model is not active');
if(process.permission.has('child_process'))fail('child processes are permitted');
for(const p of ['/home/kirby/MMRI_MASTER_2026-11-06/01_ACTIVE_SOURCE/MMRI_STEP10_FINAL_WORKING/backend/.env','/etc/passwd','/var/run/postgresql'])if(process.permission.has('fs.read',p))fail('permission model allows reading '+p);
try{fs.readFileSync('/home/kirby/MMRI_MASTER_2026-11-06/01_ACTIVE_SOURCE/MMRI_STEP10_FINAL_WORKING/backend/.env');fail('backend/.env was readable')}catch(e){if(e.code!=='ERR_ACCESS_DENIED')fail('unexpected error probing .env: '+e.code)}
const key=(process.env.OPENAI_API_KEY||'').trim(),model=(process.env.MMRI_AI_REPORT_MODEL||'').trim();
if(!key||!model)fail('OPENAI_API_KEY and MMRI_AI_REPORT_MODEL are required in the minimal environment');
const files=fs.readdirSync(payloadDir).filter(f=>f.endsWith('.json')).sort();
if(files.length!==EXPECT)fail(`expected ${EXPECT} payload files, found ${files.length}`);
const payloads=files.map(f=>{const p=JSON.parse(fs.readFileSync(path.join(payloadDir,f),'utf8'));const s=JSON.stringify(p);
  if(!/(QA|E2E|Synthetic|тест|Тест|test)/i.test(String(p.companyName)))fail(`${f}: company name does not look synthetic`);
  if(/[\w.+-]+@[\w-]+\.[\w.]+/.test(s))fail(`${f}: payload contains an e-mail address`);
  return {file:f,payload:p}});
console.log(JSON.stringify({isolation:'verified',files,model,maxRequests:MAX_REQUESTS,costCapUsd:COST_CAP_USD}));
let requests=0,spent=SPENT_BEFORE;const realFetch=globalThis.fetch,log=[];
globalThis.fetch=async(url,init)=>{
  const u=new URL(String(url));if(u.protocol!=='https:'||u.hostname!=='api.openai.com')throw new Error('GUARD: host not allowed '+u.hostname);
  const body=String(init?.body??'');const worst=(body.length/2)*IN_PER_M/1e6+8000*OUT_PER_M/1e6;
  if(requests>=MAX_REQUESTS)throw new Error('GUARD: request cap reached');
  if(spent+worst>COST_CAP_USD)throw new Error(`GUARD: worst-case cost ${(spent+worst).toFixed(3)} would exceed cap`);
  requests++;const r=await realFetch(url,init);
  let usage=null;try{const j=await r.clone().json();usage=j?.usage||null;if(!r.ok)log.push({status:r.status,code:j?.error?.code||j?.error?.type||null})}catch{if(!r.ok)log.push({status:r.status,code:null})}
  const cost=usage?((usage.input_tokens||0)*IN_PER_M+(usage.output_tokens||0)*OUT_PER_M)/1e6:worst;spent+=cost;
  log.push({n:requests,status:r.status,inTok:usage?.input_tokens??null,outTok:usage?.output_tokens??null,estCostUsd:Number(cost.toFixed(4))});return r};
const {OpenAiNarrativeProvider}=await import('../dist-strategy/report/openai-narrative-provider.js');
const {generateValidatedNarrative}=await import('../dist-strategy/report/index.js');
const provider=new OpenAiNarrativeProvider({apiKey:key,model,endpoint:'https://api.openai.com/v1/responses',timeoutMs:90_000,maxRetries:0,totalTimeoutMs:100_000,maxOutputTokens:8_000});
fs.mkdirSync(outDir,{recursive:true});const summary=[];
for(const {file,payload} of payloads){
  const t=Date.now();let res;try{res=await generateValidatedNarrative(payload,provider)}catch(e){res={state:'ERROR',providerError:String(e.message).slice(0,300),validation:{issues:[]}}}
  const text=res.narrative?res.narrative.sections.flatMap(s=>s.claims.map(c=>c.textMn)).join('\n'):'';const cyr=(text.match(/[Ѐ-ӿ]/g)||[]).length,lat=(text.match(/[A-Za-z]/g)||[]).length;
  const concl=res.narrative?.sections?.find(s=>s.id==='S10')?.claims?.[0]?.textMn||'';
  const row={file,company:payload.companyName,state:res.state,validation:res.validation?.state,issues:(res.validation?.issues||[]).slice(0,5).map(i=>i.checkId),providerError:res.providerError??null,httpAttempts:res.providerHttpAttempts??null,requestIds:res.providerRequestIds??[],ms:Date.now()-t,conclusionWords:concl.trim()?concl.trim().split(/\s+/).length:0,cyrillic:cyr,latin:lat,usedFallback:res.state!=='PASS'};
  summary.push(row);console.log(JSON.stringify(row));
  fs.writeFileSync(path.join(outDir,file.replace(/\.json$/,'')+'.narrative.json'),JSON.stringify({row,narrative:res.narrative},null,1));
  if(res.state!=='PASS'&&/GUARD|insufficient_quota|rate_limit|authentication|invalid_api_key/i.test(String(res.providerError)+JSON.stringify(log.slice(-2))))break}
const out={at:new Date().toISOString(),requests,estimatedCostUsd:Number(spent.toFixed(4)),capUsd:COST_CAP_USD,allPass:summary.length===EXPECT&&summary.every(r=>r.state==='PASS'),summary,httpLog:log};
fs.writeFileSync(path.join(outDir,'live-ai-synthetic-result.json'),JSON.stringify(out,null,1));console.log(JSON.stringify({requests,estimatedCostUsd:out.estimatedCostUsd,allPass:out.allPass}));process.exit(out.allPass?0:1);
