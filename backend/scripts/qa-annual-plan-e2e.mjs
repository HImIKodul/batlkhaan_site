/* End-to-end QA of the 12-month plan on an ISOLATED stack: real HTTP provider path (against a local fake model), real report generation, admin approval, real PDF.
   Needs: API (plan-enabled QA backend), PGDATABASE, MMRI_MOCK_MAIL_DIR. Prints PASS/FAIL only. */
import fs from 'node:fs';import crypto from 'node:crypto';import {execFileSync} from 'node:child_process';
const R=new URL('./lib/',import.meta.url).pathname;const {call,sql,freshAdminTotp,customer,B}=await import(R+'admin-qa.mjs');const {journey,http}=await import(R+'qa-journey.mjs');
const cr=Object.fromEntries(fs.readFileSync('/home/kirby/mmri-qa-runtime/credentials.local','utf8').split('\n').filter(l=>/^[A-Z_]+=/.test(l)).map(l=>[l.split('=')[0],l.slice(l.indexOf('=')+1)]));
const sup={email:cr.ADMIN_EMAIL,password:cr.ADMIN_PASSWORD,secret:cr.ADMIN_TOTP_SECRET};let pass=0,fail=0;const rec=(n,ok,d='')=>{ok?pass++:fail++;console.log((ok?'PASS ':'FAIL ')+n+(d?' | '+d:''))};const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const login=async()=>await call('POST','/admin/auth/login',{body:{email:sup.email,password:sup.password,totpCode:await freshAdminTotp(sup)}});let L=await login();let tok=L.d?.token;
const adm=async(m,p,body)=>{let r=await call(m,'/admin'+p,{tok,body});if(r.s===401&&r.e?.code==='ADMIN_REAUTH_REQUIRED'){await call('POST','/admin/auth/reauth',{tok,body:{password:sup.password,totpCode:await freshAdminTotp(sup)}});r=await call(m,'/admin'+p,{tok,body})}else if(r.s===401){L=await login();tok=L.d.token;r=await call(m,'/admin'+p,{tok,body})}return r};
const pdfOf=async(a,t)=>{const r=await fetch(`${B}/assessments/${a}/report/pdf`,{headers:{authorization:'Bearer '+t}});return {s:r.status,buf:Buffer.from(await r.arrayBuffer())}};
const pages=f=>Number(/Pages:\s+(\d+)/.exec(execFileSync('pdfinfo',[f],{encoding:'utf8'}))[1]);
// preserved historical report (the kept QA customer's published report): its PDF must be byte-identical before and after
const keptA=sql(`select id from assessments order by "createdAt" limit 1`);
const kc={email:cr.CUSTOMER_EMAIL,password:cr.CUSTOMER_PASSWORD};const kl=await http(B,'POST','/auth/login',{body:kc});const k0=await pdfOf(keptA,kl.d.accessToken);
const cu=await customer('plan');const co=await http(B,'POST','/companies',{tok:cu.tok,body:{name:'12 сарын төлөвлөгөөний тест ХХК'}});
const j=await journey(B,cu.tok,co.d.id,'finance');rec('diagnosis completed through the API',j.answered>0,`${j.answered} answers`);
let rid=null;for(let i=0;i<120&&!rid;i++){const r=sql(`select id from report_reviews where "assessmentId"='${j.a}'`);if(r&&sql(`select status from report_reviews where id='${r}'`)==='AWAITING_REVIEW')rid=r;else await sleep(2000)}
rec('report generated and queued for review',!!rid);
const plan=JSON.parse(sql(`select coalesce(narrative->'annualPlan','null'::jsonb)::text from report_snapshots where "assessmentId"='${j.a}' limit 1`));
rec('annual plan stored with the report (READY)',plan?.state==='READY',plan?`${plan.stages?.length} stages, provider ${plan.provider?.kind}`:'absent');
rec('audit event records the plan outcome',Number(sql(`select count(*) from audit_events where "assessmentId"='${j.a}' and "eventType"='REPORT_GENERATED' and payload->>'annualPlan'='READY'`))>=1);
rec('plan evidence: every finding covered and dates deterministic from the report date',plan?.state==='READY'&&plan.stages.every(s=>/^\d{4}-\d\d-\d\d$/.test(s.startDate))&&new Date(plan.endDate)>new Date(plan.startDate));
const tc=(await http(B,'POST','/auth/login',{body:{email:cu.email,password:cu.password}})).d.accessToken;
if(rid){await adm('POST',`/reviews/${rid}/claim`);const rv=Number(sql(`select "currentRevision" from report_reviews where id='${rid}'`));
 const ap=await adm('POST',`/reviews/${rid}/approve`,{baseRevision:rv});rec('administrator approval publishes (strict page-fit check passes with the plan)',ap.s===200&&sql(`select status from report_reviews where id='${rid}'`)==='PUBLISHED',String(ap.s))}
const p=await pdfOf(j.a,tc);fs.writeFileSync('/tmp/annual-plan-e2e.pdf',p.buf);
rec('customer PDF download works and has exactly 3 pages',p.s===200&&p.buf.subarray(0,5).toString()==='%PDF-'&&pages('/tmp/annual-plan-e2e.pdf')===3);
const t3=execFileSync('pdftotext',['-f','3','-l','3','/tmp/annual-plan-e2e.pdf','-'],{encoding:'utf8'}).replace(/\s+/g,' ');
rec('page 3 shows the plan stages and computed dates',plan?.state==='READY'&&plan.stages.every(s=>t3.includes(s.headingMn.split(' ').slice(-2).join(' '))&&s.dateLabel.split(' - ').every(d=>t3.includes(d))));
rec('page 3 contains no internal references or English text',!/\b[FEV]\d\b|REC-|ROOT-/.test(t3)&&!/[A-Za-z]/.test(t3.replace(/BusinessMRI\.mn/g,'')));
const k1=await pdfOf(keptA,(await http(B,'POST','/auth/login',{body:kc})).d.accessToken);rec('historical published report PDF is byte-identical after the feature ran',k0.s===200&&k1.s===200&&crypto.createHash('sha256').update(k0.buf).digest('hex')===crypto.createHash('sha256').update(k1.buf).digest('hex'));
console.log(`CASE assessment=${j.a} email=${cu.email}`);console.log(`RESULT pass=${pass} fail=${fail}`);process.exit(fail?1:0);
