/* AI spend guard. ISOLATED API + disposable DB, started with MMRI_AI_REPORT_PROVIDER=openai, MMRI_AI_REPORT_REQUIRED=true, MMRI_REPORT_REVIEW_REQUIRED=false,
   MMRI_AI_REPORT_ENDPOINT=http://127.0.0.1:4398/v1/responses, a FAKE key and MMRI_AI_PRICE_INPUT_USD_PER_M=1, MMRI_AI_PRICE_OUTPUT_USD_PER_M=5.
   This script serves the fake endpoint (nothing leaves the machine) and proves: one generation per completion, token/cost recorded, and that opening,
   refreshing and downloading a report (JSON and PDF) never starts another provider call, whether the first generation succeeded or failed. */
import http from 'node:http';import {execFileSync} from 'node:child_process';
const R=new URL('./lib/',import.meta.url).pathname;const {customer,B}=await import(R+'admin-qa.mjs');const {http:api,journey}=await import(R+'qa-journey.mjs');
const {deterministicFallbackNarrative}=await import(new URL('../dist-strategy/report/index.js',import.meta.url));
const DB=process.env.PGDATABASE;const q=s=>execFileSync('docker',['exec',process.env.MMRI_QA_PG_CONTAINER||'mmri-v3-local-postgres-1','psql','-U',process.env.MMRI_QA_PG_USER||'mmri','-d',DB,'-At','-c',s],{encoding:'utf8',maxBuffer:128<<20}).trim();
let pass=0,fail=0;const rec=(n,ok,d='')=>{ok?pass++:fail++;console.log((ok?'PASS ':'FAIL ')+n+(d?' | '+d:''))};
let mode='ok',hits=0;
const fake=http.createServer(async(rq,rs)=>{let b='';for await(const c of rq)b+=c;hits++;
  if(mode==='fail'){rs.writeHead(429,{'content-type':'application/json'});return rs.end(JSON.stringify({error:{message:'synthetic',type:'insufficient_quota',code:'organization_spend_limit_exceeded'}}))}
  const m=/"assessmentId":"([^"]+)"/.exec(JSON.parse(b).input);const payload=JSON.parse(q(`select payload::text from report_snapshots where "assessmentId"='${m[1]}' limit 1`));
  rs.writeHead(200,{'content-type':'application/json','x-request-id':'req_fake_'+hits});rs.end(JSON.stringify({status:'completed',output_text:JSON.stringify(deterministicFallbackNarrative(payload)),usage:{input_tokens:30000,output_tokens:4000}}))}).listen(4398,'127.0.0.1');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function scenario(label){const cu=await customer('guard'+label);const co=(await api(B,'POST','/companies',{tok:cu.tok,body:{name:'AI guard '+label}})).d.id;const j=await journey(B,cu.tok,co,'marketing');
  for(let i=0;i<40;i++){await sleep(1500);if(Number(q(`select count(*) from report_snapshots where "assessmentId"='${j.a}' and ("generationState" in ('PASS','AI_FALLBACK_USED','GENERATION_BLOCKED'))`))>0&&hits>0)break}
  await sleep(1500);return {cu,a:j.a}}
// A: provider succeeds
mode='ok';hits=0;const A=await scenario('ok');
const afterGen=hits;rec('GUARD-01 exactly one provider call for the completed diagnosis',afterGen===1,`calls=${afterGen}`);
const stA=q(`select "generationState" from report_snapshots where "assessmentId"='${A.a}' limit 1`);rec('GUARD-02 report stored from the AI narrative (no fallback)',stA==='PASS',stA);
const ev=q(`select payload::text from audit_events where "assessmentId"='${A.a}' and "eventType"::text='REPORT_GENERATED' order by "createdAt" desc limit 1`);const pj=JSON.parse(ev||'{}');
rec('GUARD-03 token usage, trigger, model and estimated cost are recorded per report',pj.usage?.inputTokens===30000&&pj.usage?.outputTokens===4000&&pj.trigger==='COMPLETION'&&pj.estimatedCostUsd===0.05&&!!pj.modelIdentifier,JSON.stringify({u:pj.usage,t:pj.trigger,c:pj.estimatedCostUsd,m:pj.modelIdentifier}));
const codes=[];for(let i=0;i<5;i++)codes.push((await api(B,'GET',`/assessments/${A.a}/report`,{tok:A.cu.tok})).s);
const md=await fetch(B+`/assessments/${A.a}/report/pdf/metadata`,{headers:{authorization:'Bearer '+A.cu.tok}});const pdf=await fetch(B+`/assessments/${A.a}/report/pdf`,{headers:{authorization:'Bearer '+A.cu.tok}});await pdf.arrayBuffer();
rec('GUARD-04 opening/refreshing the report 5x, PDF metadata and PDF download return the stored report',codes.every(c=>c===200)&&md.status===200&&pdf.status===200,`${codes} md=${md.status} pdf=${pdf.status}`);
rec('GUARD-05 none of those requests called the provider again',hits===afterGen,`calls=${hits}`);
// B: provider fails (spend limit)
mode='fail';hits=0;const Bn=await scenario('fail');const afterFail=hits;
rec('GUARD-06 a failed generation calls the provider once (no retry storm)',afterFail===1,`calls=${afterFail}`);
const vs=[];for(let i=0;i<3;i++){const r=await api(B,'GET',`/assessments/${Bn.a}/report`,{tok:Bn.cu.tok});vs.push(r.s+':'+(r.e?.code||''))}
rec('GUARD-07 viewing a blocked report is refused with REPORT_REGENERATION_REQUIRES_AUTHORIZATION',vs.every(v=>v==='409:REPORT_REGENERATION_REQUIRES_AUTHORIZATION'),vs.join(' '));
const pr=await fetch(B+`/assessments/${Bn.a}/report/pdf`,{headers:{authorization:'Bearer '+Bn.cu.tok}});await pr.arrayBuffer();
rec('GUARD-08 no further provider call from the views or the PDF download of the blocked report',hits===afterFail,`calls=${hits} pdf=${pr.status}`);
const fev=q(`select payload::text from audit_events where "assessmentId"='${Bn.a}' and "eventType"::text='REPORT_GENERATION_FAILED' order by "createdAt" desc limit 1`);const fj=JSON.parse(fev||'{}');
rec('GUARD-09 the failure is audited with its trigger',fj.trigger==='COMPLETION'&&/required but unavailable/.test(fj.error||''),JSON.stringify({t:fj.trigger}));
fake.close();console.log(`RESULT pass=${pass} fail=${fail}`);process.exit(fail?1:0);
