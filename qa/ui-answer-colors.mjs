/* Rendered-pixel regression for questionnaire answer colours. For one domain (DOMAIN=it|marketing|finance|people|operations) it walks the real questionnaire in the browser,
   and for every question measures the rendered colour of each answer card (screenshot -> canvas pixels) at rest, hover and selected.
   Needs API :4000 and the preview build :4173. PW=<playwright-core path> OUT=<dir for screenshots and json>. */
const MMRI_API_GUARD=(v)=>{if(process.env.MMRI_QA_ALLOW_SHARED!=='YES'&&(!process.env.API||/(localhost|127\.0\.0\.1):4000(\/|$)/.test(v)))throw new Error('qa: set API=<isolated api base> explicitly; refusing the shared service on :4000 (opt in with MMRI_QA_ALLOW_SHARED=YES)');return v};
import {createRequire} from 'module';const require=createRequire(import.meta.url);const {chromium}=require(process.env.PW);import fs from 'fs';import crypto from 'crypto';import path from 'path';
const DOMAIN=process.env.DOMAIN||'people',MAXQ=Number(process.env.MAXQ||70),OUT=process.env.OUT||'/tmp';fs.mkdirSync(OUT,{recursive:true});
const BASE=process.env.BASE||'http://127.0.0.1:4173/',API=MMRI_API_GUARD(process.env.API||'http://localhost:4000/api/v1'),W=crypto.randomUUID();const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const res=[];const t=(id,n,ok,d='')=>{res.push({id,n,ok:!!ok,d});console.log((ok?'PASS ':'FAIL ')+id+' '+n+(d?' | '+String(d).slice(0,260):''))};
const api=async(m,p,tok,b)=>{const r=await fetch(API+p,{method:m,headers:{'content-type':'application/json','x-mmri-writer-id':W,...(tok?{authorization:'Bearer '+tok}:{})},body:b===undefined?undefined:JSON.stringify(b)});const j=await r.json().catch(()=>null);return {s:r.status,d:j?.data}};
const email=`ac.${DOMAIN}.${Date.now()}@mmri.test`,pw=crypto.randomBytes(12).toString('base64url')+'Aa1!';const tok=(await api('POST','/auth/register',null,{email,password:pw,displayName:'AC'})).d.accessToken;const co=(await api('POST','/companies',tok,{name:'Answer colour QA ХХК'})).d.id;
const pq=(await api('GET','/methodology/current/profile-questions',tok)).d;const prof=pq.slice(0,20).map(q=>({questionId:q.id,optionIndexes:[q.options[0].optionIndex]}));
await api('PUT',`/companies/${co}/profile-answers`,tok,{profileAnswers:prof,basicInfoAnswers:Array.from({length:20},(_,i)=>({questionId:'B'+String(i+1).padStart(2,'0'),optionIndexes:[1]}))});
const inv=(await api('POST',`/companies/${co}/billing/invoices`,tok,{planCode:'DIAGNOSTIC',domainCode:DOMAIN})).d;await api('POST',`/billing/invoices/${inv.id}/mock-pay`,tok);
const a=(await api('POST',`/companies/${co}/assessments`,tok,{domainCode:DOMAIN})).d.id;await api('POST',`/assessments/${a}/start`,tok,{mode:'QUICK',profileAnswers:prof});
const b=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});const ctx=await b.newContext({viewport:{width:Number(process.env.VW||1280),height:Number(process.env.VH||1500)}});
await ctx.route('**/api/**',r=>r.continue({headers:{...r.request().headers(),origin:process.env.ORIGIN||'http://localhost:5173'}}));
await ctx.addInitScript(([w,c,aid])=>{try{sessionStorage.setItem('mmri.writerId',w);localStorage.setItem('mmri.companyId',c);localStorage.setItem('mmri.assessmentId.'+c,aid)}catch{}},[W,co,a]);
// Applicability screens come first (one per capability). Keep a few for the browser, answer the rest through the API (same endpoint the UI uses).
let route=(await api('GET',`/assessments/${a}/next-question`,tok)).d;
for(let i=0;i<400&&route?.nextQuestion;i++){const q=route.nextQuestion;const scored=q.options.filter(o=>o.state==='SCORED').length;if(scored>=2&&i>=4)break;
 const o=q.options.find(o=>!['DNK','N_A_CLAIM'].includes(o.state))||q.options[0];
 const r=await api('POST',`/assessments/${a}/answers`,tok,{questionId:q.id,optionIndex:o.optionIndex,questionIssueId:route.questionIssueId||q.questionIssueId,expectedAssessmentRevision:route.assessmentRevision,clientRequestId:crypto.randomUUID()});
 route=(await api('GET',`/assessments/${a}/next-question`,tok)).d}
const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(String(e).slice(0,100)));
await p.goto(BASE+'#/login');await p.reload();await sleep(800);await p.locator('.mmri-tabs button',{hasText:'Нэвтрэх'}).first().click().catch(()=>{});await p.fill('input[type=email]',email);await p.fill('input[type=password]',pw);await p.click('button[type=submit]');await sleep(2500);
await p.goto(BASE+'#/questions');await sleep(2500);
const cards=()=>p.locator('.mmri-questionnaire__answers .mmri-radio-card');
/* mean rendered colour of the card body (screenshot decoded in the page), skipping the left bar and the right-hand mark */
async function pixels(i){await cards().nth(i).scrollIntoViewIfNeeded();const box=await cards().nth(i).boundingBox();if(!box)return null;const buf=await p.screenshot({clip:{x:box.x+30,y:box.y+8,width:Math.max(20,box.width*0.5),height:Math.max(10,box.height-16)}});
 return p.evaluate(async b64=>{const img=new Image();img.src='data:image/png;base64,'+b64;await img.decode();const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const x=c.getContext('2d');x.drawImage(img,0,0);const d=x.getImageData(0,0,c.width,c.height).data;let r=0,g=0,bb=0,n=0;for(let k=0;k<d.length;k+=4*7){r+=d[k];g+=d[k+1];bb+=d[k+2];n++}return [r/n,g/n,bb/n]},buf.toString('base64'))}
const hue=([r,g,b])=>{r/=255;g/=255;b/=255;const mx=Math.max(r,g,b),mn=Math.min(r,g,b),d=mx-mn;if(!d)return 0;let h=mx===r?((g-b)/d)%6:mx===g?(b-r)/d+2:(r-g)/d+4;h*=60;return h<0?h+360:h};
const sat=([r,g,b])=>{const mx=Math.max(r,g,b),mn=Math.min(r,g,b);return mx?(mx-mn)/mx:0};const away=([r,g,b])=>255*3-(r+g+b); // how far from pure white
const fam=h=>h<18||h>340?'red':h<42?'orange':h<58?'yellow':h<110?'yellow-green':'green';
const seenShapes=new Set(),shots=new Set();let questions=0,whiteCards=0,restFail=[],hoverFail=[],selFail=[],neutralFail=[],hueFail=[],letterFail=0,saveBtn=0,orderFail=[];
const seenKeys=new Set();let stale=false;const nonSpecial=o=>!['DNK','N_A_CLAIM'].includes(o.state);
for(let q=0;q<420;q++){
 // peek at the next question; only the first question of each answer shape is driven through the browser, the rest are answered through the API
 const nx=(await api('GET',`/assessments/${a}/next-question`,tok)).d;const nqq=nx?.nextQuestion;if(!nqq)break;
 const ns=nqq.options.filter(nonSpecial);const key=`${ns.length}${ns.every(o=>o.state==='SCORED')?'s':ns.every(o=>o.state==='UNAVAILABLE')?'u':'m'}-${nqq.options.length-ns.length}`;
 if(seenKeys.has(key)||seenKeys.size>=MAXQ){const o=ns[0]||nqq.options[0];await api('POST',`/assessments/${a}/answers`,tok,{questionId:nqq.id,optionIndex:o.optionIndex,questionIssueId:nx.questionIssueId||nqq.questionIssueId,expectedAssessmentRevision:nx.assessmentRevision,clientRequestId:crypto.randomUUID()});stale=true;if(seenKeys.size>=MAXQ)break;continue}
 seenKeys.add(key);if(stale){await p.goto(BASE+'#/questions');await p.reload();await sleep(2500);stale=false}
 const info=await p.evaluate(()=>[...document.querySelectorAll('.mmri-questionnaire__answers .mmri-radio-card')].map(l=>({neutral:l.classList.contains('is-neutral-tone'),special:!!l.closest('.mmri-questionnaire__special'),color:l.style.getPropertyValue('--answer-color'),hasPrefix:!!l.querySelector('.mmri-radio-card__prefix')})));
 if(!info.length){await sleep(1000);continue}
 questions++;const graded=info.filter(x=>!x.special&&!x.neutral&&x.color).length,neutralMain=info.filter(x=>!x.special&&x.neutral).length,special=info.filter(x=>x.special).length;
 const shape=`g${graded}-n${neutralMain}-s${special}`;
 if(info.some(x=>x.hasPrefix))letterFail++;
 saveBtn+=(await p.locator('.mmri-questionnaire button',{hasText:/^Хадгалах$|Дахин хадгалах/}).count());
 const rest=[];for(let i=0;i<info.length;i++)rest.push(await pixels(i));
 // rest state
 const gradedIdx=info.map((x,i)=>(!x.special&&!x.neutral&&x.color)?i:-1).filter(i=>i>=0);
 rest.forEach((px,i)=>{if(!px)return;if(away(px)<30){whiteCards++;restFail.push(`q${q}#${i} away ${Math.round(away(px))} ${shape}`)}
  if(info[i].neutral||info[i].special){if(sat(px)>0.12)neutralFail.push(`q${q}#${i} sat ${sat(px).toFixed(2)}`)}
  else if(info[i].color){const rgb=info[i].color.match(/\d+/g).map(Number);const dh=Math.abs(hue(px)-hue(rgb));if(Math.min(dh,360-dh)>14)hueFail.push(`q${q}#${i} rendered ${Math.round(hue(px))} expected ${Math.round(hue(rgb))}`)}});
 // best to worst order on screen: the first graded card must not be redder than the last when 3+ graded and the scale is best first or worst first, so only check the spread exists
 if(gradedIdx.length>=2){const hs=gradedIdx.map(i=>hue(rest[i]));if(Math.max(...hs)-Math.min(...hs)<20)orderFail.push(`q${q} ${shape} hue spread ${Math.round(Math.max(...hs)-Math.min(...hs))}`)}
 // hover then selected on the first graded card, else the first card
 const target=gradedIdx.length?gradedIdx[gradedIdx.length>1?1:0]:0;
 await cards().nth(target).hover();await sleep(350);const hv=await pixels(target);
 if(hv&&rest[target]&&away(hv)<=away(rest[target])+3)hoverFail.push(`q${q} hover not stronger (${Math.round(away(rest[target]))} -> ${Math.round(away(hv))})`);
 const doShot=!shots.has(shape)&&(shape.startsWith('g5')||shape.startsWith('g4')||shape.startsWith('g3')||shape.startsWith('g2')||shape.startsWith('g0'));
 if(doShot){const box=await p.locator('.mmri-questionnaire').first().boundingBox();const clip={x:Math.max(0,box.x),y:Math.max(0,box.y),width:Math.min(box.width,1200),height:Math.min(box.height,900)};
  await p.screenshot({path:path.join(OUT,`${DOMAIN}-${shape}-1-hover.png`),clip});}
 await cards().nth(target).click();await p.mouse.move(2,2);await sleep(450);const sl=await pixels(target);
 if(sl&&rest[target]&&away(sl)<=away(rest[target])+10&&!info[target].special)selFail.push(`q${q} selected not stronger (${Math.round(away(rest[target]))} -> ${Math.round(away(sl))})`);
 if(doShot){shots.add(shape);const box=await p.locator('.mmri-questionnaire').first().boundingBox();const clip={x:Math.max(0,box.x),y:Math.max(0,box.y),width:Math.min(box.width,1200),height:Math.min(box.height,900)};await p.screenshot({path:path.join(OUT,`${DOMAIN}-${shape}-2-selected.png`),clip});
  await cards().nth(target).locator('input').evaluate(e=>e.blur());}
 seenShapes.add(shape);
 await p.getByRole('button',{name:/Үргэлжлүүлэх/}).click().catch(()=>{});await sleep(1100);
}
t('C01',`${questions} questions rendered in ${DOMAIN}; answer shapes: ${[...seenShapes].join(' ')}`,questions>=2,[...seenShapes].join(' ')+' keys '+[...seenKeys].join(' '));
t('C02','rest state: no answer card renders white (every card is visibly tinted)',restFail.length===0,restFail.slice(0,4).join(' ; '));
t('C03','rendered hue of each graded card matches its semantic tone (red/orange/yellow/yellow-green/green)',hueFail.length===0,hueFail.slice(0,4).join(' ; '));
t('C04','graded scales render a real colour spread from worst to best',orderFail.length===0,orderFail.slice(0,4).join(' ; '));
t('C05','unknown, uncertain and not applicable cards render neutral gray',neutralFail.length===0,neutralFail.slice(0,4).join(' ; '));
t('C06','hover renders a stronger tint than rest',hoverFail.length===0,hoverFail.slice(0,4).join(' ; '));
t('C07','selected renders a stronger tint than rest',selFail.length===0,selFail.slice(0,4).join(' ; '));
t('C08','no standalone letter label (A, B, C) on any card',letterFail===0,String(letterFail));
t('C09','no Save or Save-again button in the questionnaire',saveBtn===0,String(saveBtn));
t('C10','no uncaught page errors',errs.length===0,errs.join(';'));
fs.writeFileSync(path.join(OUT,`ui-answer-colors-${DOMAIN}.json`),JSON.stringify({domain:DOMAIN,shapes:[...seenShapes],res},null,1));console.log(DOMAIN,res.filter(r=>r.ok).length+'/'+res.length);await b.close();
