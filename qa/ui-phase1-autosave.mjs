/* (setup copied from ui-questionnaire-autosave.mjs) Phase 1 / MMRI-04 browser regression. Original header: questionnaire: automatic saving, no Save buttons, rapid changes, failure and retry, refresh restore, answer colours, no code-like text.
   Needs API :4000 and the preview build on :4173 (PW=<path to playwright-core>). Creates a throw-away customer, company, paid diagnosis and assessment. */
const MMRI_API_GUARD=(v)=>{if(process.env.MMRI_QA_ALLOW_SHARED!=='YES'&&(!process.env.API||/(localhost|127\.0\.0\.1):4000(\/|$)/.test(v)))throw new Error('qa: set API=<isolated api base> explicitly; refusing the shared service on :4000 (opt in with MMRI_QA_ALLOW_SHARED=YES)');return v};
import {createRequire} from 'module';const require=createRequire(import.meta.url);const {chromium}=require(process.env.PW);import fs from 'fs';import crypto from 'crypto';import path from 'path';
const BASE=process.env.BASE||'http://127.0.0.1:4173/';const API=MMRI_API_GUARD(process.env.API||'http://localhost:4000/api/v1');const sleep=ms=>new Promise(r=>setTimeout(r,ms));const res=[];const t=(id,n,ok,d='')=>{res.push({id,n,ok:!!ok,d});console.log((ok?'PASS ':'FAIL ')+id+' '+n+(d?' | '+d:''))};
const W=crypto.randomUUID();const api=async(m,p,tok,b)=>{const r=await fetch(API+p,{method:m,headers:{'content-type':'application/json','x-mmri-writer-id':W,...(tok?{authorization:'Bearer '+tok}:{})},body:b===undefined?undefined:JSON.stringify(b)});const j=await r.json().catch(()=>null);return {s:r.status,d:j?.data}};
const email=`qs.${Date.now()}@mmri.test`,pw=crypto.randomBytes(12).toString('base64url')+'Aa1!';const tok=(await api('POST','/auth/register',null,{email,password:pw,displayName:'QS'})).d.accessToken;const co=(await api('POST','/companies',tok,{name:'Questionnaire QA ХХК'})).d.id;
const pq=(await api('GET','/methodology/current/profile-questions',tok)).d;const prof=pq.slice(0,20).map(q=>({questionId:q.id,optionIndexes:[q.options[0].optionIndex]}));
await api('PUT',`/companies/${co}/profile-answers`,tok,{profileAnswers:prof,basicInfoAnswers:Array.from({length:20},(_,i)=>({questionId:'B'+String(i+1).padStart(2,'0'),optionIndexes:[1]}))});
const inv=(await api('POST',`/companies/${co}/billing/invoices`,tok,{planCode:'DIAGNOSTIC',domainCode:'people'})).d;await api('POST',`/billing/invoices/${inv.id}/mock-pay`,tok);
const a=(await api('POST',`/companies/${co}/assessments`,tok,{domainCode:'people'})).d.id;let route=(await api('POST',`/assessments/${a}/start`,tok,{mode:'QUICK',profileAnswers:prof})).d;
// advance (through the API) past the applicability screens to the first question that has five graded answers
for(let i=0;i<140&&route?.nextQuestion;i++){const q=route.nextQuestion;const graded=q.options.filter(o=>!['DNK','N_A_CLAIM'].includes(o.state));if(graded.length===5&&q.options.every(o=>o.state==='SCORED'||['DNK','N_A_CLAIM'].includes(o.state)))break;
 const r=await api('POST',`/assessments/${a}/answers`,tok,{questionId:q.id,optionIndex:graded[0].optionIndex,questionIssueId:route.questionIssueId||q.questionIssueId,expectedAssessmentRevision:route.assessmentRevision,clientRequestId:crypto.randomUUID()});route=r.d?.routing||r.d}
const b=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});
const ctx=await b.newContext({viewport:{width:1440,height:900}});await ctx.route('**/api/**',r=>r.continue({headers:{...r.request().headers(),origin:process.env.ORIGIN||'http://localhost:5173'}}));
await ctx.addInitScript(([w,c,aid])=>{try{sessionStorage.setItem('mmri.writerId',w);localStorage.setItem('mmri.companyId',c);localStorage.setItem('mmri.assessmentId.'+c,aid)}catch{}},[W,co,a]);
const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(String(e).slice(0,100)));
await p.goto(BASE+'#/login');await p.reload();await sleep(800);await p.locator('.mmri-tabs button',{hasText:'Нэвтрэх'}).first().click().catch(()=>{});await p.fill('input[type=email]',email);await p.fill('input[type=password]',pw);await p.click('button[type=submit]');await sleep(2500);
await p.goto(BASE+'#/questions');await sleep(2500);
const labels=()=>p.locator('.mmri-questionnaire__answers .mmri-radio-card');

const ORIGIN=process.env.ORIGIN||'http://localhost:5173';
const draft=async()=>{const nq=(await api('GET',`/assessments/${a}/next-question`,tok)).d;const d=nq?.draft?.draft;return d&&Number.isInteger(d.optionIndex)?d.optionIndex:null};
const checked=async()=>p.locator('.mmri-questionnaire__answers input:checked').first().getAttribute('value').catch(()=>null);
let putCount=0,delayFirst=true,blockPut=false;
await ctx.route('**/assessments/*/draft',async r=>{
  if(r.request().method()!=='PUT')return r.continue({headers:{...r.request().headers(),origin:ORIGIN}});
  putCount++;
  if(blockPut)return r.abort();
  if(delayFirst&&putCount===1){await sleep(450);}
  return r.continue({headers:{...r.request().headers(),origin:ORIGIN}});
});
// MMRI-04 scenario 1: choose A, A's save is in flight, choose B; A's acknowledgement arrives BEFORE B's debounce fires
await labels().nth(0).click();
await sleep(700);           // debounce (650 ms) fired: PUT for A is now held for 450 ms
await labels().nth(1).click();
const wantB=await checked();
await sleep(3500);
const server1=await draft();
t('R1','A acknowledged before B is saved: the server ends with B (B is not dropped)',String(server1)===wantB&&server1!==null,`server ${server1} ui ${wantB}`);
t('R2','the UI keeps B selected and shows no error',(await checked())===wantB&&(await p.locator('.mmri-save-status--error').count())===0,`ui ${await checked()}`);
await p.reload();await sleep(2500);
t('R3','after reload the recovered answer is B, not A',(await checked())===wantB,`ui ${await checked()}`);
// MMRI-04 scenario 2: clearing while saves cannot reach the server, then a reload
delayFirst=false;
const beforeClear=await draft();
t('R4','precondition: the server holds a saved answer',beforeClear!==null,String(beforeClear));
blockPut=true;
await p.locator('.mmri-questionnaire__clear').click();
await sleep(500);
t('R5','the selection is cleared in the UI',(await checked())===null);
await p.reload();await sleep(2500);
t('R6','after reload (clearing not yet on the server) the cleared state is restored, the old answer is NOT resurrected',(await checked())===null,`ui ${await checked()} server ${await draft()}`);
blockPut=false;
await p.evaluate(()=>window.dispatchEvent(new Event('online')));
await sleep(3500);
t('R7','once the connection returns the clearing reaches the server',(await draft())===null,`server ${await draft()}`);
t('R8','no page errors',errs.length===0,errs.join('|'));
await b.close();
const bad=res.filter(r=>!r.ok);console.log(bad.length?`FAILED ${bad.length}/${res.length}`:`ALL PASS ${res.length}`);process.exit(bad.length?1:0);
