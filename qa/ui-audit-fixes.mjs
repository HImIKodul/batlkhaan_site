/* Browser checks for the 2026-11-06 source-audit repairs (A3 login field readability, A4 payment code, A7 demo button).
   Needs an isolated API (default :4010) and the Vite dev server on :5176.  PW=<playwright-core path> JSQR=<jsqr dir> OUT=<dir>.
   NOTE: real browser autofill cannot be triggered headlessly; the autofill rule is verified by selector/specificity only (see AUTOFILL-* rows). */
import {createRequire} from 'module';const require=createRequire(import.meta.url);const {chromium}=require(process.env.PW);const jsQR=require(process.env.JSQR+'/node_modules/jsqr');const {PNG}=require(process.env.JSQR+'/node_modules/pngjs');
import fs from 'fs';import crypto from 'crypto';import path from 'path';
const OUT=process.env.OUT||'/tmp',BASE=process.env.BASE||'http://127.0.0.1:5176/',API=process.env.API||'http://localhost:4010/api/v1',ORIGIN=process.env.ORIGIN||'http://localhost:5176';fs.mkdirSync(OUT,{recursive:true});
const W=crypto.randomUUID(),sleep=ms=>new Promise(r=>setTimeout(r,ms));const res=[];const t=(id,n,ok,d='')=>{res.push({id,n,ok:!!ok,d});console.log((ok?'PASS ':'FAIL ')+id+' '+n+(d?' | '+String(d).slice(0,240):''))};
const api=async(m,p,tok,b)=>{const r=await fetch(API+p,{method:m,headers:{'content-type':'application/json','x-mmri-writer-id':W,...(tok?{authorization:'Bearer '+tok}:{})},body:b===undefined?undefined:JSON.stringify(b)});const j=await r.json().catch(()=>null);return {s:r.status,d:j?.data}};
const email=`audit.${Date.now()}@mmri.test`,pw=crypto.randomBytes(12).toString('base64url')+'Aa1!';
const tok=(await api('POST','/auth/register',null,{email,password:pw,displayName:'Audit'})).d.accessToken;const co=(await api('POST','/companies',tok,{name:'Audit QA ХХК'})).d.id;
const pq=(await api('GET','/methodology/current/profile-questions',tok)).d;const prof=pq.slice(0,20).map(q=>({questionId:q.id,optionIndexes:[q.options[0].optionIndex]}));
await api('PUT',`/companies/${co}/profile-answers`,tok,{profileAnswers:prof,basicInfoAnswers:Array.from({length:20},(_,i)=>({questionId:'B'+String(i+1).padStart(2,'0'),optionIndexes:[1]}))});
const b=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});
for(const [vn,vp] of [['desktop',{width:1280,height:900}],['mobile',{width:390,height:844}]]){
 const ctx=await b.newContext({viewport:vp});await ctx.route('**/api/**',r=>r.continue({headers:{...r.request().headers(),origin:ORIGIN}}));
 const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(String(e).slice(0,100)));
 await p.goto(BASE+'#/login');await p.reload();await sleep(900);
 t(`A7-${vn}`,'no demo-credential button on the login page (dev server, flag unset)',(await p.locator('.auth__demo').count())===0&&!(await p.content()).includes('Demo2026'));
 // A3: computed style of the login inputs + the autofill rule that the browser would apply
 await p.fill('input[type=email]',email);await p.fill('input[type=password]',pw);
 const cs=await p.evaluate(()=>{const i=document.querySelector('input[type=email]');const c=getComputedStyle(i);return {color:c.color,bg:c.backgroundColor}});
 t(`A3-${vn}-text`,'login input text is dark on a white field',cs.bg==='rgb(255, 255, 255)'&&((c)=>{const f=v=>{v/=255;return v<=.03928?v/12.92:((v+.055)/1.055)**2.4};const L=.2126*f(c[0])+.7152*f(c[1])+.0722*f(c[2]);return (1.05)/(L+.05)>=7})((cs.color.match(/\d+/g)||[0,0,0]).map(Number))/* intent: dark ink on white, contrast >= 7:1 (the exact ink colour changed with the sapphire design) */,JSON.stringify(cs));
 const rule=await p.evaluate(()=>{const out=[];for(const sh of document.styleSheets){let rules;try{rules=sh.cssRules}catch{continue}for(const r of rules){if(r.selectorText&&r.selectorText.includes('-webkit-autofill'))out.push(r.selectorText.split(',')[0]+' => fill:'+r.style.getPropertyValue('-webkit-text-fill-color')+' shadow:'+r.style.getPropertyValue('box-shadow'))}}return out});
 t(`AUTOFILL-${vn}`,'every autofill rule paints dark text on a white inset (no white-on-white, no navy remnant)',rule.some(x=>/fill:var\(--wp-ink/.test(x))&&rule.every(x=>/#fff|255/.test(x))&&!rule.some(x=>/60,\s*70,\s*200/.test(x)),rule.join(' ; '));
 await p.screenshot({path:path.join(OUT,`login-${vn}.png`)});
 await p.click('button[type=submit]');await sleep(2500);
 // A4: billing page, mock provider
 await p.evaluate(()=>{sessionStorage.setItem('business:billingArea','it');sessionStorage.setItem('business:billingMode','first')});await p.goto(BASE+'#/billing');await sleep(1800);
 const mk=p.getByRole('button',{name:/Төлбөрийн код үүсгэх/});if(await mk.count())await mk.click();await sleep(2000);
 t(`A4-mock-${vn}`,'mock invoice shows an explicit non-payable state, no pseudo QR',(await p.locator('.billing-domain-qr__unavailable').count())===1&&(await p.locator('.billing-domain-qr__placeholder').count())===0);
 await p.screenshot({path:path.join(OUT,`billing-mock-${vn}.png`)});
 // A4: provider-like invoice with a real qrText -> real scannable QR
 const QR='00020101021229370016A000000677010111021300000000000005204599953034965406300005802MN5909MMRI TEST6011Ulaanbaatar6304ABCD';
 const inv={id:'11111111-1111-4111-8111-111111111111',companyId:co,domainCode:'it',planCode:'DIAGNOSTIC',amountMnt:300000,currency:'MNT',provider:'QPAY',status:'PENDING',senderInvoiceNo:'X',qrText:QR,qrImage:null,shortUrl:null,deeplinks:[],createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),testMode:false,manualMode:false};
 await p.route(/\/billing\/invoices\/[^/?]+(\?.*)?$/,r=>{const id=r.request().url().match(/invoices\/([^/?]+)/)[1];return r.request().method()==='GET'?r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({data:{...inv,id}})}):r.continue()});
 await p.goto(BASE+'#/analysis');await sleep(800);await p.goto(BASE+'#/billing');await sleep(1800);
 await sleep(2500);await p.screenshot({path:path.join(OUT,`billing-after-route-${vn}.png`)});
 const svg=p.locator('.billing-domain-qr svg');const has=(await svg.count())===1;t(`A4-qr-${vn}`,'provider qrText renders a QR svg',has);
 if(has){await svg.evaluate(e=>e.scrollIntoView({block:'center'}));await sleep(300);const buf=await svg.screenshot({path:path.join(OUT,`billing-qr-${vn}.png`)});const png=PNG.sync.read(buf);const code=jsQR(new Uint8ClampedArray(png.data),png.width,png.height);t(`A4-decode-${vn}`,'the rendered QR decodes back to the exact provider payload',code&&code.data===QR,code?code.data.slice(0,60):'not decodable')}
 t(`ERR-${vn}`,'no uncaught page errors',errs.length===0,errs.join(';'));await ctx.close();
}
fs.writeFileSync(path.join(OUT,'ui-audit-fixes.json'),JSON.stringify(res,null,1));console.log(res.filter(r=>r.ok).length+'/'+res.length);await b.close();
