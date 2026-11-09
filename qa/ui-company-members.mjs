/* Browser check of Settings > Data: company member management (add by e-mail, change role, remove, last-owner guard, non-admin hidden).
   Isolated API only: API=http://127.0.0.1:4111/api/v1 BASE=http://127.0.0.1:4211/ ORIGIN=http://127.0.0.1:4211 PW=<playwright-core path> OUT=<dir>. Refuses :4000. */
import {createRequire} from 'module';const require=createRequire(import.meta.url);const {chromium}=require(process.env.PW);import crypto from 'crypto';
const API=process.env.API||'',BASE=process.env.BASE||'',ORIGIN=process.env.ORIGIN||'',OUT=process.env.OUT||'.';
if(!API||!BASE||/:4000\b|:4001\b/.test(API))throw new Error('set an isolated API/BASE (never :4000)');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));let fail=0;const t=(n,ok,d='')=>{if(!ok)fail++;console.log((ok?'PASS ':'FAIL ')+n+(d?' | '+String(d).slice(0,200):''))};
const api=async(m,p,tok,b)=>{const r=await fetch(API+p,{method:m,headers:{'content-type':'application/json','x-mmri-writer-id':crypto.randomUUID(),origin:ORIGIN,...(tok?{authorization:'Bearer '+tok}:{})},body:b===undefined?undefined:JSON.stringify(b)});let d=null;try{d=(await r.json())?.data}catch{}return {s:r.status,d}};
const mk=async(tag)=>{const email=`mem.${tag}.${Date.now()}@mmri.test`,pw=crypto.randomBytes(12).toString('base64url')+'Aa1!';const r=await api('POST','/auth/register',null,{email,password:pw,displayName:'Member '+tag});return {email,pw,tok:r.d.accessToken}};
const A=await mk('own'),B=await mk('vie');const co=(await api('POST','/companies',A.tok,{name:'Members QA ХХК'})).d.id;
const b=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});
for(const [label,vw,vh] of [['desktop',1280,900],['mobile',390,844]]){
 const ctx=await b.newContext({viewport:{width:vw,height:vh}});await ctx.route('**/api/**',r=>r.continue({headers:{...r.request().headers(),origin:ORIGIN}}));
 await ctx.addInitScript(([c])=>{try{localStorage.setItem('mmri.companyId',c)}catch{}},[co]);const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(String(e).slice(0,100)));
 await p.goto(BASE+'#/login');await p.reload();await sleep(800);await p.locator('.mmri-tabs button',{hasText:'Нэвтрэх'}).first().click().catch(()=>{});await p.fill('input[type=email]',A.email);await p.fill('input[type=password]',A.pw);await p.keyboard.press('Enter');await sleep(1800);
 await p.goto(BASE+'#/settings?section=data');await sleep(1800);
 const sec=p.locator('section',{hasText:'Байгууллагын гишүүд'}).first();
 t(label+' members section visible to owner',await sec.isVisible().catch(()=>false));
 if(label==='desktop'){
  await sec.locator('input[type=email]').fill(B.email);await sec.getByRole('button',{name:'Гишүүн нэмэх'}).click();await sleep(1500);
  t('added member appears in list',(await sec.innerText()).includes(B.email));
  const l=await api('GET',`/companies/${co}/members`,A.tok);t('API shows VIEWER role',l.d.some(m=>m.email===B.email&&m.role==='VIEWER'));
  await sec.getByLabel(`${B.email} — эрх`).selectOption('ASSESSOR');await sleep(1500);
  t('role change persisted ASSESSOR',(await api('GET',`/companies/${co}/members`,A.tok)).d.some(m=>m.email===B.email&&m.role==='ASSESSOR'));
  t('owner self row role select disabled',await sec.getByLabel(`${A.email} — эрх`).isDisabled());
  await sec.locator('tr',{hasText:A.email}).getByRole('button').click();await sleep(500);await p.getByRole('button',{name:'Баталгаажуулах'}).click();await sleep(1500);
  t('last owner cannot leave (error shown, still member)',(await api('GET',`/companies/${co}/members`,A.tok)).d.some(m=>m.email===A.email&&m.role==='OWNER')&&await p.locator('[role=alert]').first().isVisible().catch(()=>false));
 }
 await p.screenshot({path:`${OUT}/members-${label}.png`,fullPage:true});
 const sw=await p.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1);t(label+' no horizontal overflow',sw);
 t(label+' no page errors',errs.length===0,errs.join(';'));await ctx.close();
}
{const ctx=await b.newContext({viewport:{width:1280,height:900}});await ctx.route('**/api/**',r=>r.continue({headers:{...r.request().headers(),origin:ORIGIN}}));await ctx.addInitScript(([c])=>{try{localStorage.setItem('mmri.companyId',c)}catch{}},[co]);const p=await ctx.newPage();
 await p.goto(BASE+'#/login');await p.reload();await sleep(800);await p.locator('.mmri-tabs button',{hasText:'Нэвтрэх'}).first().click().catch(()=>{});await p.fill('input[type=email]',B.email);await p.fill('input[type=password]',B.pw);await p.keyboard.press('Enter');await sleep(1800);await p.goto(BASE+'#/settings?section=data');await sleep(1800);
 t('non-admin (ASSESSOR) does not see members section',!(await p.locator('section',{hasText:'Байгууллагын гишүүд'}).first().isVisible().catch(()=>false)));await ctx.close();}
await b.close();console.log(fail?`FAILED ${fail}`:'ALL PASS');process.exit(fail?1:0);
