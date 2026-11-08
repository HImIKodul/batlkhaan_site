/* Browser login/session/refresh/logout with the DEV browser origins (5174) and rejection of an unknown origin. Isolated API only.
   The Vite page runs on BASE; the Origin header sent to the API is set per run (ORIGINS) to the real dev origins. PW BASE API */
import {createRequire} from 'module';const require=createRequire(import.meta.url);const {chromium}=require(process.env.PW);import crypto from 'crypto';
const BASE=process.env.BASE||'http://127.0.0.1:5176/',API=process.env.API||'http://localhost:4012/api/v1';const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let fail=0;const t=(id,n,ok,d='')=>{if(!ok)fail++;console.log((ok?'PASS ':'FAIL ')+id+' '+n+(d?' | '+String(d).slice(0,160):''))};
const reg=await fetch(API+'/auth/register',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:`dev.${Date.now()}@mmri.test`,password:'Tmp-'+crypto.randomBytes(8).toString('hex')+'Aa1!',displayName:'Dev'})});
const b=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});
for(const origin of ['http://127.0.0.1:5174','http://localhost:5174']){
 const email=`dev.${Date.now()}.${Math.floor(Math.random()*1e6)}@mmri.test`,pw='Tmp-'+crypto.randomBytes(8).toString('hex')+'Aa1!';
 await fetch(API+'/auth/register',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email,password:pw,displayName:'Dev'})});
 const ctx=await b.newContext({viewport:{width:1280,height:800}});const codes=[];await ctx.route('**/api/**',r=>r.continue({headers:{...r.request().headers(),origin}}));
 const p=await ctx.newPage();p.on('response',r=>{if(/\/auth\/(login|refresh|logout)/.test(r.url()))codes.push(r.url().split('/auth/')[1]+':'+r.status())});
 await p.goto(BASE+'#/login');await p.reload();await sleep(900);await p.fill('input[type=email]',email);await p.fill('input[type=password]',pw);await p.click('button[type=submit]');await sleep(2500);
 t(`L1 ${origin}`,'browser login succeeds (login 200, leaves login page)',codes.includes('login:200')&&!p.url().includes('#/login'),codes.join(' '));
 codes.length=0;await p.reload();await sleep(2500);t(`L2 ${origin}`,'session persists after reload via refresh cookie (refresh 200, not on login page)',codes.some(c=>c==='refresh:200')&&!p.url().includes('#/login'),codes.join(' '));
 codes.length=0;await p.locator('.mmri-account-trigger').first().click().catch(()=>{});await sleep(400);await p.locator('.mmri-account-logout').first().click().catch(()=>{});await sleep(2000);
 t(`L3 ${origin}`,'logout succeeds and returns to a signed-out state',codes.some(c=>c.startsWith('logout:2'))&&/#\/(login|$)|#\/?$/.test(p.url()+'#'),codes.join(' ')+' '+p.url());
 codes.length=0;await p.goto(BASE+'#/analysis');await p.reload();await sleep(2200);t(`L4 ${origin}`,'after logout a reload cannot refresh (refresh 401, login page)',codes.some(c=>c==='refresh:401')&&p.url().includes('#/login'),codes.join(' ')+' '+p.url());
 await ctx.close();
}
const bad=await fetch(API+'/auth/login',{method:'POST',headers:{'content-type':'application/json',origin:'http://evil.example'},body:'{"email":"a@b.co","password":"x"}'});t('L5','unknown origin is rejected with 403',bad.status===403,String(bad.status));
const bad2=await fetch(API+'/auth/refresh',{method:'POST',headers:{origin:'http://localhost:5199'}});t('L6','unlisted dev port is rejected with 403',bad2.status===403,String(bad2.status));
await b.close();console.log(fail?`FAILED ${fail}`:'ALL PASS');process.exit(fail?1:0);
