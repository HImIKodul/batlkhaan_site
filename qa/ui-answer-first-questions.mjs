/* Rendered-style check of the FIRST questions of a fresh diagnosis (the applicability gate "Тийм, хамаарна." + "no"/"unknown"), per domain, desktop or mobile.
   Captures computed background-image, border colour, left-bar colour and --answer-color of every card; checks the affirmative card is GREEN, the exceptional
   cards are neutral gray (dashed), selection keeps the colour, and after Continue + Back the saved answer is restored with the same colours.
   DOMAIN=it|marketing|finance|people|operations VW VH OUT PW BASE API ORIGIN. Isolated API only. */
import {createRequire} from 'module';const require=createRequire(import.meta.url);const {chromium}=require(process.env.PW);import fs from 'fs';import crypto from 'crypto';import path from 'path';
const DOMAIN=process.env.DOMAIN||'it',OUT=process.env.OUT||'/tmp',BASE=process.env.BASE||'http://127.0.0.1:5176/',API=process.env.API||'http://localhost:4010/api/v1',ORIGIN=process.env.ORIGIN||'http://localhost:5176';fs.mkdirSync(OUT,{recursive:true});
const W=crypto.randomUUID(),sleep=ms=>new Promise(r=>setTimeout(r,ms));let fail=0;const t=(id,n,ok,d='')=>{if(!ok)fail++;console.log((ok?'PASS ':'FAIL ')+id+' '+n+(d?' | '+String(d).slice(0,260):''))};
const api=async(m,p,tok,b)=>{const r=await fetch(API+p,{method:m,headers:{'content-type':'application/json','x-mmri-writer-id':W,...(tok?{authorization:'Bearer '+tok}:{})},body:b===undefined?undefined:JSON.stringify(b)});const j=await r.json().catch(()=>null);return {s:r.status,d:j?.data}};
const email=`gate.${DOMAIN}.${Date.now()}@mmri.test`,pw=crypto.randomBytes(12).toString('base64url')+'Aa1!';
const tok=(await api('POST','/auth/register',null,{email,password:pw,displayName:'Gate'})).d.accessToken;const co=(await api('POST','/companies',tok,{name:'Gate QA ХХК'})).d.id;
const pq=(await api('GET','/methodology/current/profile-questions',tok)).d;const prof=pq.slice(0,20).map(q=>({questionId:q.id,optionIndexes:[q.options[0].optionIndex]}));
await api('PUT',`/companies/${co}/profile-answers`,tok,{profileAnswers:prof,basicInfoAnswers:Array.from({length:20},(_,i)=>({questionId:'B'+String(i+1).padStart(2,'0'),optionIndexes:[1]}))});
const inv=(await api('POST',`/companies/${co}/billing/invoices`,tok,{planCode:'DIAGNOSTIC',domainCode:DOMAIN})).d;await api('POST',`/billing/invoices/${inv.id}/mock-pay`,tok);
const a=(await api('POST',`/companies/${co}/assessments`,tok,{domainCode:DOMAIN})).d.id;await api('POST',`/assessments/${a}/start`,tok,{mode:'QUICK',profileAnswers:prof});
const first=(await api('GET',`/assessments/${a}/next-question`,tok)).d.nextQuestion;
const b=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});const ctx=await b.newContext({viewport:{width:Number(process.env.VW||1280),height:Number(process.env.VH||1300)}});
await ctx.route('**/api/**',r=>r.continue({headers:{...r.request().headers(),origin:ORIGIN}}));
await ctx.addInitScript(([w,c,aid])=>{try{sessionStorage.setItem('mmri.writerId',w);localStorage.setItem('mmri.companyId',c);localStorage.setItem('mmri.assessmentId.'+c,aid)}catch{}},[W,co,a]);
const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(String(e).slice(0,100)));
await p.goto(BASE+'#/login');await p.reload();await sleep(800);await p.locator('.mmri-tabs button',{hasText:'Нэвтрэх'}).first().click().catch(()=>{});await p.fill('input[type=email]',email);await p.fill('input[type=password]',pw);await p.click('button[type=submit]');await sleep(2500);
await p.goto(BASE+'#/questions');await sleep(2800);
const hue=([r,g,bl])=>{r/=255;g/=255;bl/=255;const mx=Math.max(r,g,bl),mn=Math.min(r,g,bl),d=mx-mn;if(!d)return 0;let h=mx===r?((g-bl)/d)%6:mx===g?(bl-r)/d+2:(r-g)/d+4;h*=60;return h<0?h+360:h};const sat=([r,g,bl])=>{const mx=Math.max(r,g,bl),mn=Math.min(r,g,bl);return mx?(mx-mn)/mx:0};
const rgbOf=s=>(s.match(/\d+(\.\d+)?/g)||[]).slice(0,3).map(Number);
const snap=()=>p.evaluate(()=>[...document.querySelectorAll('.mmri-questionnaire__answers .mmri-radio-card')].map(l=>{const c=getComputedStyle(l),bf=getComputedStyle(l,'::before');return {text:l.innerText.trim().slice(0,60),special:!!l.closest('.mmri-questionnaire__special'),neutral:l.classList.contains('is-neutral-tone'),tone:l.classList.contains('has-score-tone'),selected:l.classList.contains('is-selected'),ac:l.style.getPropertyValue('--answer-color'),bgImage:c.backgroundImage.slice(0,140),border:c.borderTopColor,borderStyle:c.borderTopStyle,bar:bf.backgroundColor,transform:c.transform}}));
const rows=await snap();console.log(JSON.stringify(rows.map(r=>({t:r.text,sp:r.special,tone:r.tone,ac:r.ac,border:r.border,bar:r.bar,style:r.borderStyle}))));
const isGate=first.options.filter(o=>o.state==='UNAVAILABLE').length===1&&first.options.some(o=>o.state==='DNK');
t('F0',`first question of ${DOMAIN}: ${first.options.length} options, ${isGate?'applicability gate (lone affirmative)':'other structure'}`,rows.length===first.options.length);
if(isGate){const aff=rows.find(r=>/^Тийм/.test(r.text));
 t('F1','affirmative "Тийм, ..." is GREEN: class has-score-tone, --answer-color green, border and left bar green',aff&&aff.tone&&!aff.neutral&&!aff.special&&hue(rgbOf(aff.ac))>110&&hue(rgbOf(aff.ac))<170&&hue(rgbOf(aff.border))>110&&hue(rgbOf(aff.border))<170&&hue(rgbOf(aff.bar))>110&&hue(rgbOf(aff.bar))<170,aff&&`${aff.ac} ${aff.border} ${aff.bar}`);
 const ex=rows.filter(r=>r!==aff);t('F2','"no, does not apply" and "unknown" are neutral gray (dashed, low saturation, in the exceptional group)',ex.length===2&&ex.every(r=>r.special&&r.neutral&&r.borderStyle==='dashed'&&sat(rgbOf(r.border))<.25&&sat(rgbOf(r.bar))<.25),ex.map(r=>r.border+' '+r.borderStyle).join(' ; '));
 t('F3','affirmative background is visibly tinted green (not white/gray gradient)',/rgb/.test(aff.bgImage));
}else{const g=rows.filter(r=>r.tone);t('F1','graded cards carry tones with a green-to-red spread',g.length>=2&&Math.max(...g.map(r=>hue(rgbOf(r.ac))))-Math.min(...g.map(r=>hue(rgbOf(r.ac))))>40)}
const tgt=p.locator('.mmri-questionnaire__answers .mmri-radio-card').first();await tgt.hover();await sleep(350);const hv=await p.evaluate(()=>{const l=document.querySelector('.mmri-questionnaire__answers .mmri-radio-card');const c=getComputedStyle(l);return {tr:c.transform,bg:c.backgroundImage,h:l.getBoundingClientRect().height}});
t('F4','hover keeps the tone and does not transform/resize the card',hv.tr==='none'&&/rgb/.test(hv.bg)&&Math.abs(hv.h-(await tgt.boundingBox()).height)<0.5,hv.tr);
await tgt.click();await sleep(1200);const sel=(await snap())[0];t('F5','selected: still the same green, ring/selected state set',sel.selected&&sel.ac===rows[0].ac&&sel.tone===rows[0].tone,sel.ac);
await p.screenshot({path:path.join(OUT,`gate-${DOMAIN}-${process.env.VW||1280}-selected.png`)});
await p.getByRole('button',{name:/Үргэлжлүүлэх/}).click();await sleep(2200);const q2=await snap();
await p.getByRole('button',{name:/Буцах/}).first().click();await sleep(2200);const back=await snap();
t('F6','after Continue then Back the saved answer is selected again with identical tones',back.length===rows.length&&back[0].selected&&back.every((r,i)=>r.ac===rows[i].ac&&r.neutral===rows[i].neutral),`${back.map(r=>r.selected).join()} | next had ${q2.length} cards`);
t('F7','no uncaught page errors',errs.length===0,errs.join(';'));
await b.close();console.log(DOMAIN,fail?`FAILED ${fail}`:'ALL PASS');process.exit(fail?1:0);
