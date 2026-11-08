/* Live-API regression for defects found in the 2026-11-05 validation. Needs the API on :4000 with billing provider "mock" (local dev only).
   QA-INVOICE-RACE  : 6 parallel invoice requests for the same company/domain/plan must resolve to ONE open invoice (was 6).
   QA-MALFORMED-URL : malformed percent-encoding in a path must give 400, never 500.
   QA-TRAVERSAL     : encoded traversal in an id segment must give 404/400. Usage: node scripts/qa-live-api-regression.mjs */
const MMRI_API_GUARD=(v)=>{if(process.env.MMRI_QA_ALLOW_SHARED!=='YES'&&(!process.env.API||/(localhost|127\.0\.0\.1):4000(\/|$)/.test(v)))throw new Error('qa: set API=<isolated api base> explicitly; refusing the shared service on :4000 (opt in with MMRI_QA_ALLOW_SHARED=YES)');return v};
import crypto from 'crypto';
const B=MMRI_API_GUARD(process.env.API||'http://localhost:4000');let tok;
const call=async(m,p,b)=>{const r=await fetch(B+p,{method:m,headers:{'content-type':'application/json',...(tok?{authorization:'Bearer '+tok}:{})},body:b===undefined?undefined:JSON.stringify(b)});let j=null;try{j=await r.json()}catch{}return {s:r.status,d:j?.data}};
let fail=0;const rec=(n,ok,d)=>{if(!ok)fail++;console.log((ok?'PASS ':'FAIL ')+n+' | '+d)};
const pw=crypto.randomBytes(14).toString('base64url')+'Aa1!';
tok=(await call('POST','/api/v1/auth/register',{email:`qa.reg.${Date.now()}@mmri.test`,password:pw,displayName:'QA'})).d.accessToken;
const co=(await call('POST','/api/v1/companies',{name:'QA Regression ХХК'})).d.id;
const rs=await Promise.all(Array.from({length:6},()=>call('POST',`/api/v1/companies/${co}/billing/invoices`,{planCode:'DIAGNOSTIC',domainCode:'finance'})));
const ids=new Set(rs.filter(x=>x.s===200||x.s===201).map(x=>x.d?.id));
rec('QA-INVOICE-RACE',ids.size===1&&rs.every(x=>x.s<500),`distinct invoices ${ids.size}, codes ${rs.map(x=>x.s).join(',')}`);
for(const p of ['%E0%A4%A','%','%zz']){const r=await call('GET','/api/v1/assessments/'+p);rec('QA-MALFORMED-URL '+p,r.s===400,`status ${r.s}`)}
for(const p of ['..%2F..%2Fetc%2Fpasswd/report/pdf','%2e%2e%2f%2e%2e%2fetc']){const r=await call('GET','/api/v1/assessments/'+p);rec('QA-TRAVERSAL '+p.slice(0,18),[400,404].includes(r.s),`status ${r.s}`)}
console.log(fail?`FAILED ${fail}`:'ALL PASS');process.exit(fail?1:0);
