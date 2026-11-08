/* Regenerates frontend/public/guide-shots/*.jpg for the "Хэрхэн оношилгоо хийлгэх вэ?" walkthrough from the CURRENT UI.
   Isolated stack only (clean-env API on a scrubbed clone + Vite). API/BASE/ORIGIN/PW/OUT env; demo account = the seeded demo company.
   Refuses :4000. Steps: 1-register 2-company 3-domain 4-payment 5-questions 6-report 7-retake, each desktop (d) 1440x900 and mobile (m) 390x844. */
import {createRequire} from 'module';const require=createRequire(import.meta.url);const {chromium}=require(process.env.PW);import crypto from 'crypto';import fs from 'fs';
const API=process.env.API||'',BASE=process.env.BASE||'',ORIGIN=process.env.ORIGIN||'',OUT=process.env.OUT||'.';
if(!API||!BASE||/:4000\b|:4001\b/.test(API))throw new Error('set an isolated API/BASE (never :4000)');
fs.mkdirSync(OUT,{recursive:true});const sleep=ms=>new Promise(r=>setTimeout(r,ms));const W=crypto.randomUUID();
const api=async(m,p,tok,b)=>{const r=await fetch(API+p,{method:m,headers:{'content-type':'application/json','x-mmri-writer-id':W,origin:ORIGIN,...(tok?{authorization:'Bearer '+tok}:{})},body:b===undefined?undefined:JSON.stringify(b)});const j=await r.json().catch(()=>null);return {s:r.status,d:j?.data}};
// fresh synthetic customer per viewport: paid IT diagnosis (step 5)
const makeAcct=async()=>{
const email=`guide.${Date.now()}@mmri.test`,pw=crypto.randomBytes(12).toString('base64url')+'Aa1!';
const tok=(await api('POST','/auth/register',null,{email,password:pw,displayName:'Жишээ хэрэглэгч'})).d.accessToken;const co=(await api('POST','/companies',tok,{name:'Өрнөх Маркет ХХК'})).d.id;
const pq=(await api('GET','/methodology/current/profile-questions',tok)).d;const prof=pq.slice(0,20).map(q=>({questionId:q.id,optionIndexes:[q.options[0].optionIndex]}));
await api('PUT',`/companies/${co}/profile-answers`,tok,{profileAnswers:prof,basicInfoAnswers:Array.from({length:20},(_,i)=>({questionId:'B'+String(i+1).padStart(2,'0'),optionIndexes:[1]}))});
const inv=(await api('POST',`/companies/${co}/billing/invoices`,tok,{planCode:'DIAGNOSTIC',domainCode:'it'})).d;await api('POST',`/billing/invoices/${inv.id}/mock-pay`,tok);
/* paid but NOT started: the browser starts it through the real UI (starting via the API under another writer id would leave a lease that makes the page's resume call answer 409) */
return {email,pw}};
const b=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});
const mkctx=async(kind,h=900)=>{const o=kind==='d'?{viewport:{width:1440,height:h}}:{viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1};const c=await b.newContext(o);await c.route('**/api/**',r=>r.continue({headers:{...r.request().headers(),origin:ORIGIN}}));return c};
const login=async(p,e,pwd)=>{await p.goto(BASE+'#/login');await p.reload();await sleep(900);await p.locator('.mmri-tabs button',{hasText:'Нэвтрэх'}).first().click().catch(()=>{});await p.fill('input[type=email]',e);await p.fill('input[type=password]',pwd);await p.keyboard.press('Enter');await sleep(2600)};
const shot=async(p,name,kind)=>{await sleep(900);await p.screenshot({path:`${OUT}/${name}-${kind}.jpg`,type:'jpeg',quality:88});console.log('saved',name,kind,p.url().split('#')[1])};
for(const kind of ['d','m']){
 // 1 register (logged out)
 {const c=await mkctx(kind);const p=await c.newPage();await p.goto(BASE+'#/login');await p.reload();await sleep(1200);await p.locator('.mmri-tabs button',{hasText:'Бүртгүүлэх'}).first().click();await sleep(700);await shot(p,'1-register',kind);await c.close()}
 // 2,3,4,6,7 demo account (completed Marketing, four unpaid domains)
 {const c=await mkctx(kind);const p=await c.newPage();await login(p,'demo@mmri.mn','Demo2026!!');
  await p.goto(BASE+'#/profile');await sleep(2800);await shot(p,'2-company',kind);
  await p.goto(BASE+'#/analysis');await sleep(3000);await shot(p,'3-domain',kind);
  await p.locator('button,a',{hasText:'ТӨЛӨХ'}).first().click();await sleep(2800);await shot(p,'4-payment',kind);
  await p.goto(BASE+'#/report');await sleep(3500);await shot(p,'6-report',kind);
  await p.goto(BASE+'#/analysis');await sleep(2500);await p.locator('button,a',{hasText:'Дахин оношилгоо'}).first().click();await sleep(2800);await shot(p,'7-retake',kind);await c.close()}
 // 5 questions (fresh account, started assessment)
 {const {email,pw}=await makeAcct();const c=await mkctx(kind,1090);const p=await c.newPage();await login(p,email,pw);await p.goto(BASE+'#/analysis');await sleep(2800);
  await p.locator('button,a',{hasText:'ЭХЛҮҮЛЭХ'}).first().click();await sleep(3500);if(!/questions/.test(p.url()))await p.goto(BASE+'#/questions');await sleep(3000);await shot(p,'5-questions',kind);await c.close()}
}
await b.close();console.log('done');
