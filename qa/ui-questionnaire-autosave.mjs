/* Browser regression for the questionnaire: automatic saving, no Save buttons, rapid changes, failure and retry, refresh restore, answer colours, no code-like text.
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
t('Q01','the questionnaire opens with answer cards',await labels().count()>=2,String(await labels().count()));
const btns=(await p.locator('.mmri-questionnaire button').allInnerTexts()).map(x=>x.trim());
t('Q02','there is no "Хадгалах" or "Дахин хадгалах" button in the normal questionnaire; "Үргэлжлүүлэх" is present',!btns.some(x=>/^Хадгалах$|Дахин хадгалах/.test(x))&&btns.some(x=>x.includes('Үргэлжлүүлэх')),btns.join(' | '));
// select -> saving -> saved -> status disappears
await labels().nth(1).click();let seen=new Set();for(let i=0;i<14;i++){const tx=await p.locator('.mmri-save-status').allInnerTexts();tx.forEach(x=>seen.add(x.replace(/[✓!]/g,'').trim()));await sleep(250)}
t('Q03','after a selection the header shows "Хадгалагдсан" (and "Хадгалж байна" while saving), then the status disappears: no permanent success banner',seen.has('Хадгалагдсан')&&(await p.locator('.mmri-save-status--saved').count())===0,[...seen].join(','));
const qid=await p.evaluate(()=>document.querySelector('.mmri-questionnaire__answers input')?.name);
const draft=async()=>{const nq=(await api('GET',`/assessments/${a}/next-question`,tok)).d;return nq?.draft?.draft?.optionIndex??null};
const sel1=await p.locator('.mmri-questionnaire__answers input:checked').first().getAttribute('value');
t('Q04','the selection is stored on the server without clicking any save button',String(await draft())===sel1,`server ${await draft()} ui ${sel1}`);
await p.reload();await sleep(2500);t('Q05','after a browser refresh the saved selection is restored',(await p.locator('.mmri-questionnaire__answers input:checked').first().getAttribute('value').catch(()=>null))===sel1);
// rapid changes
const n=await labels().count();for(let i=0;i<Math.min(n,4);i++){await labels().nth(i).click();await sleep(60)}await sleep(2500);
const uiSel=await p.locator('.mmri-questionnaire__answers input:checked').first().getAttribute('value');
t('Q06','rapid changes: the last choice wins on the server and in the UI (no older save overwrites it)',String(await draft())===uiSel&&(await p.locator('.mmri-save-status--error').count())===0,`server ${await draft()} ui ${uiSel}`);
// failure + recovery
let block=true;await ctx.route('**/assessments/*/draft',r=>{if(block&&r.request().method()==='PUT')return r.abort();return r.continue({headers:{...r.request().headers(),origin:process.env.ORIGIN||'http://localhost:5173'}})});
await labels().nth(0).click();await sleep(7500);
const errTxt=await p.locator('.mmri-questionnaire').innerText();const stillSel=await p.locator('.mmri-questionnaire__answers input:checked').first().getAttribute('value');
t('Q07','when saving fails: the error text is shown, the selection stays visible, and it is NOT marked as saved',/Хадгалахад алдаа гарлаа/.test(errTxt)&&(await p.locator('.mmri-save-status--saved').count())===0&&stillSel!==null,`selected ${stillSel}`);
t('Q08','a clear recovery action "Дахин оролдох" is offered',await p.locator('.mmri-questionnaire__retry').count()===1);
block=false;await p.locator('.mmri-questionnaire__retry').click();await sleep(1500);t('Q09','after the connection works again the retry saves the selection (server equals UI)',String(await draft())===stillSel&&(await p.locator('.mmri-questionnaire__retry').count())===0,`server ${await draft()}`);
// colours on a real question + answer through many questions looking for code-like text
const bad=/[{}`]|=>|invocation|prisma|undefined|NaN|\[object|\$\{|Error:/;let codeLike=[],colourChecked=0,neutralOk=true,graded5=null;const fam=h=>h<18?'red':h<42?'orange':h<58?'yellow':h<110?'yellow-green':'green';
const hue=(rgb)=>{let [r,g,bb]=rgb.map(x=>x/255);const mx=Math.max(r,g,bb),mn=Math.min(r,g,bb),d=mx-mn;if(!d)return 0;let h=mx===r?((g-bb)/d)%6:mx===g?(bb-r)/d+2:(r-g)/d+4;h*=60;return h<0?h+360:h};
for(let i=0;i<14;i++){
 const txt=await p.locator('.mmri-questionnaire').innerText();if(bad.test(txt))codeLike.push(txt.match(bad)[0]);
 const info=await p.evaluate(()=>[...document.querySelectorAll('.mmri-questionnaire__answers .mmri-radio-card')].map(l=>({neutral:l.classList.contains('is-neutral-tone'),color:l.style.getPropertyValue('--answer-color'),special:!!l.closest('.mmri-questionnaire__special'),text:l.innerText.trim().slice(0,40)})));
 const graded=info.filter(x=>!x.special&&!x.neutral&&x.color);if(graded.length===5&&!graded5)graded5=graded.map(x=>fam(hue(x.color.match(/\d+/g).map(Number))));
 colourChecked++;for(const x of info.filter(x=>x.special)){if(x.color)neutralOk=false}
 await labels().first().click().catch(()=>{});await sleep(700);await p.getByRole('button',{name:/Үргэлжлүүлэх/}).click().catch(()=>{});await sleep(1300)}
t('Q10',`no code-like, stack or internal text on ${colourChecked} consecutive questions`,codeLike.length===0,codeLike.join(','));
t('Q11','a five-answer question shows green, light green, yellow, orange, red from best to worst',JSON.stringify(graded5)===JSON.stringify(['green','yellow-green','yellow','orange','red']),JSON.stringify(graded5));
t('Q12','the "cannot answer" options (DNK, not applicable) carry no performance colour',neutralOk);
const ov=await p.evaluate(()=>document.documentElement.scrollWidth-innerWidth);t('Q13','no horizontal overflow at 1440',ov<=0,String(ov));
// mobile + axe
const axeSrc=fs.readFileSync(path.join(path.dirname(require.resolve(process.env.PW)),'../axe-core/axe.min.js'),'utf8');
await p.evaluate(axeSrc);const ax=await p.evaluate(async()=>(await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','wcag22aa']}})).violations.map(v=>v.id+':'+v.nodes.length));
t('Q14','axe WCAG 2.2 AA on the questionnaire: no violations',ax.length===0,ax.join(','));
await p.setViewportSize({width:390,height:844});await sleep(800);const ov2=await p.evaluate(()=>document.documentElement.scrollWidth-innerWidth);const tiny=await p.evaluate(()=>[...document.querySelectorAll('.mmri-questionnaire__answers .mmri-radio-card')].filter(l=>l.getBoundingClientRect().height<44).length);
t('Q15','390px: no overflow and every answer card is at least 44px tall (touch target)',ov2<=0&&tiny===0,`overflow ${ov2} small ${tiny}`);
t('Q16','no uncaught page errors',errs.length===0,errs.join(';'));
fs.writeFileSync((process.env.OUT||'/tmp')+'/ui-questionnaire-autosave.json',JSON.stringify(res,null,1));console.log(res.filter(r=>r.ok).length+'/'+res.length);await b.close();
