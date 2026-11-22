/* MMRI_AI_REPORT_REQUIRED=true fails closed. ISOLATED API + disposable DB, started with MMRI_AI_REPORT_PROVIDER=openai, MMRI_AI_REPORT_REQUIRED=true,
   MMRI_AI_REPORT_MAX_RETRIES=0, MMRI_AI_REPORT_ENDPOINT=http://127.0.0.1:4398/v1/responses and a FAKE key. This script serves that fake endpoint (always HTTP 429),
   so no request ever leaves the machine. Proves a completed diagnosis is never published from the deterministic fallback. */
import http from 'node:http';
const R=new URL('./lib/',import.meta.url).pathname;const {customer,B,sql}=await import(R+'admin-qa.mjs');const {http:api,journey}=await import(R+'qa-journey.mjs');
let pass=0,fail=0;const rec=(n,ok,d='')=>{ok?pass++:fail++;console.log((ok?'PASS ':'FAIL ')+n+(d?' | '+d:''))};
let hits=0;const fake=http.createServer((q,r)=>{q.resume();hits++;r.writeHead(429,{'content-type':'application/json'});r.end(JSON.stringify({error:{message:'synthetic limit',type:'insufficient_quota',code:'organization_spend_limit_exceeded'}}))}).listen(4398,'127.0.0.1');
const cu=await customer('aireq');const co=(await api(B,'POST','/companies',{tok:cu.tok,body:{name:'Required AI QA ХХК'}})).d.id;
const j=await journey(B,cu.tok,co,'marketing');await new Promise(x=>setTimeout(x,15000));
const row=sql(`select "generationState"||'|'||(narrative is null)||'|'||("publishedAt" is not null)||'|'||coalesce(left("providerError",80),'') from report_snapshots where "assessmentId"='${j.a}'`);
rec('REQ-01 provider was asked and refused (HTTP 429) exactly once, no retry storm',hits===1,`hits=${hits}`);
rec('REQ-02 snapshot is GENERATION_BLOCKED with no narrative and not published',/^GENERATION_BLOCKED\|true\|false\|AI narrative is required but unavailable/.test(row),row.slice(0,110));
rec('REQ-03 no PDF artifact exists for the assessment',Number(sql(`select count(*) from report_artifacts ra join report_snapshots rs on rs.id=ra."reportSnapshotId" where rs."assessmentId"='${j.a}'`))===0);
rec('REQ-04 failure is audited and no REPORT_GENERATION_FALLBACK was written',Number(sql(`select count(*) from audit_events where "assessmentId"='${j.a}' and "eventType"::text='REPORT_GENERATION_FAILED'`))>=1&&Number(sql(`select count(*) from audit_events where "assessmentId"='${j.a}' and "eventType"::text='REPORT_GENERATION_FALLBACK'`))===0);
const rep=await api(B,'GET',`/assessments/${j.a}/report`,{tok:cu.tok});
rec('REQ-05 the customer receives no report content while generation is blocked',rep.s!==200||!rep.d?.narrative,`${rep.s} ${rep.e?.code??''}`);
fake.close();console.log(`RESULT pass=${pass} fail=${fail}`);process.exit(fail?1:0);
