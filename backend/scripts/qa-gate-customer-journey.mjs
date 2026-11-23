/* Customer journey on an ISOLATED stack (run via qa-report-e2e-isolated.sh with the fake model): a brand-new synthetic customer registers, verifies the e-mail through the local mock mailbox,
   enters company information, pays through the MOCK provider, answers a QUICK questionnaire, gets the report and the PDF. Then a RETAKE: access control for the second diagnosis, linkage to the first,
   the first report and PDF stay byte-identical, history is visible, and a second customer and an unauthenticated caller can read none of it. Domains: E2E_DOMAINS (default all five). */
import fs from 'node:fs';import crypto from 'node:crypto';
const R=new URL('./lib/',import.meta.url).pathname;const {customer,B,sql}=await import(R+'admin-qa.mjs');const {http:api,journey}=await import(R+'qa-journey.mjs');
let pass=0,fail=0;const rec=(n,ok,d='')=>{ok?pass++:fail++;console.log((ok?'PASS ':'FAIL ')+n+(d?' | '+d:''))};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const hits=async()=>(await (await fetch('http://127.0.0.1:4398/')).json());
const wait=async a=>{let st='';for(let i=0;i<60;i++){await sleep(2000);st=sql(`select "generationState" from report_snapshots where "assessmentId"='${a}' limit 1`);if(['PASS','AI_FALLBACK_USED','GENERATION_BLOCKED'].includes(st))break}return st};
const pdf=async(a,tok)=>{const r=await fetch(B+`/assessments/${a}/report/pdf`,{headers:{authorization:'Bearer '+tok}});return {s:r.status,b:Buffer.from(await r.arrayBuffer())}};
const intruder=await customer('intruder');
for(const d of (process.env.E2E_DOMAINS||'marketing,it,finance,people,operations').split(',')){
  const cu=await customer('jr'+d);
  rec(`${d}: registration + e-mail verification through the mock mailbox gives a signed-in session`,!!cu.tok);
  const me=await api(B,'GET','/auth/me',{tok:cu.tok});rec(`${d}: profile is readable`,me.s===200&&me.d?.email===cu.email,String(me.s));
  const co=(await api(B,'POST','/companies',{tok:cu.tok,body:{name:'Journey '+d+' ХХК'}})).d.id;
  const noPay=await api(B,'POST',`/companies/${co}/assessments`,{tok:cu.tok,body:{domainCode:d}});
  rec(`${d}: starting a diagnosis without paid access is refused`,noPay.s>=400&&noPay.s<500,String(noPay.s));
  const j1=await journey(B,cu.tok,co,d);const st1=await wait(j1.a);
  rec(`${d}: first diagnosis completed and its report generated`,st1==='PASS',st1);
  const sc1=sql(`select coalesce("overallOfficialScore","overallPartialScore")::text||'|'||status::text||'|'||coalesce("previousAssessmentId",'') from assessments where id='${j1.a}'`);
  const first=await api(B,'GET',`/assessments/${j1.a}/report`,{tok:cu.tok});const h1=first.d?.payload?.payloadHash||first.d?.narrative?.payloadHash;const p1=await pdf(j1.a,cu.tok);
  rec(`${d}: first diagnosis has a score, status COMPLETED and no previous link`,/^[0-9.]+\|COMPLETED\|$/.test(sc1),sc1);
  const dup=await api(B,'POST',`/companies/${co}/assessments`,{tok:cu.tok,body:{domainCode:d}});
  rec(`${d}: a second diagnosis without a RETAKE entitlement is refused`,dup.s>=400&&dup.s<500,String(dup.s));
  const h0=await hits();
  const j2=await journey(B,cu.tok,co,d,'RETAKE');const st2=await wait(j2.a);
  rec(`${d}: retake completed and its report generated`,st2==='PASS',st2);
  const link=sql(`select "previousAssessmentId" from assessments where id='${j2.a}'`);
  rec(`${d}: retake links to the first diagnosis (history)`,link===j1.a,link===j1.a?'linked':link);
  const first2=await api(B,'GET',`/assessments/${j1.a}/report`,{tok:cu.tok});const p1b=await pdf(j1.a,cu.tok);
  rec(`${d}: the first report and its PDF are unchanged after the retake`,(first2.d?.payload?.payloadHash||first2.d?.narrative?.payloadHash)===h1&&sha(p1.b)===sha(p1b.b)&&p1.s===200,`pdf ${sha(p1.b).slice(0,8)}=${sha(p1b.b).slice(0,8)}`);
  const hAfter=await hits();rec(`${d}: viewing the old report after the retake made no model call (new calls only for the retake: ${hAfter.narrative-h0.narrative} narrative)`,hAfter.narrative-h0.narrative===1);
  const lst=await api(B,'GET',`/companies/${co}/assessments`,{tok:cu.tok});const items=lst.d?.items||lst.d||[];const A1=items.find(x=>x.id===j1.a),A2=items.find(x=>x.id===j2.a);
  rec(`${d}: the company history lists both diagnoses, the retake points to the first, both carry their own score`,lst.s===200&&A1&&A2&&A2.previousAssessmentId===j1.a&&A1.previousAssessmentId==null&&A1.overall&&A2.overall,`items=${items.length}`);
  for(const [lab,path] of [['report',`/assessments/${j1.a}/report`],['results',`/assessments/${j1.a}/results`],['pdf',`/assessments/${j1.a}/report/pdf`],['diagnosis',`/assessments/${j1.a}/diagnosis`]]){
    const o=await api(B,'GET',path,{tok:intruder.tok}),n=await fetch(B+path);await n.arrayBuffer();
    rec(`${d}: another customer cannot read ${lab} (${o.s}); no token gets 401 (${n.status})`,[403,404].includes(o.s)&&n.status===401)}
  const ad=await api(B,'GET','/admin/dashboard',{tok:cu.tok});rec(`${d}: a customer token is useless on admin endpoints`,ad.s===401||ad.s===403,String(ad.s));
}
console.log(`RESULT pass=${pass} fail=${fail}`);process.exit(fail?1:0);
