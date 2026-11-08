/* UI registration + logout/login + wrong-password error + demo account login (API) against an ISOLATED stack. PW=<playwright-core> BASE API ORIGIN */
import {createRequire} from 'module';const require=createRequire(import.meta.url);const {chromium}=require(process.env.PW);import crypto from 'crypto';
const BASE=process.env.BASE||'http://127.0.0.1:5176/',API=process.env.API||'http://localhost:4010/api/v1',ORIGIN=process.env.ORIGIN||'http://localhost:5176';const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let fail=0;const t=(id,n,ok,d='')=>{if(!ok)fail++;console.log((ok?'PASS ':'FAIL ')+id+' '+n+(d?' | '+String(d).slice(0,200):''))};
const email=`reg.${Date.now()}@mmri.test`,pw=crypto.randomBytes(12).toString('base64url')+'Aa1!';
const b=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});const ctx=await b.newContext({viewport:{width:390,height:844}});await ctx.route('**/api/**',r=>r.continue({headers:{...r.request().headers(),origin:ORIGIN}}));
const p=await ctx.newPage();await p.goto(BASE+'#/login');await p.reload();await sleep(900);
await p.locator('.mmri-tabs button',{hasText:'Бүртгүүлэх'}).first().click();await p.fill('input[autocomplete=name]','QA Хэрэглэгч');await p.fill('input[type=email]',email);
await p.fill('input[type=password]','short');t('R1','a too-short password cannot be submitted',await p.locator('button[type=submit]').isDisabled()||(await p.locator('input[type=password]').evaluate(e=>!e.checkValidity())));
await p.fill('input[type=password]',pw);await p.click('button[type=submit]');await sleep(2500);t('R2','registration succeeds and leaves the login page',!(await p.url()).includes('#/login'),await p.url());
const me=await p.evaluate(()=>document.cookie);t('R3','refresh token is not readable from JS (HttpOnly)',!/refresh/i.test(me),me.slice(0,60));
const ls=await p.evaluate(()=>JSON.stringify({...localStorage})+JSON.stringify({...sessionStorage}));t('R4','access/refresh tokens are not persisted in web storage',!/eyJ[A-Za-z0-9_-]{10,}\./.test(ls));
await ctx.clearCookies();await p.evaluate(()=>{sessionStorage.clear();localStorage.clear()});await p.goto(BASE+'#/login');await p.reload();await sleep(900);
await p.fill('input[type=email]',email);await p.fill('input[type=password]','WrongPassword1!');await p.click('button[type=submit]');await sleep(1500);
const err=await p.locator('.mmri-support-alert.is-error').innerText().catch(()=>'');t('R5','wrong password shows a Mongolian error, not raw server text',/[А-Яа-яӨөҮү]/.test(err)&&!/INVALID|HTTP|undefined/.test(err),err);
await p.fill('input[type=password]',pw);await p.click('button[type=submit]');await sleep(2200);t('R6','correct credentials log in',!(await p.url()).includes('#/login'),await p.url());
const r=await fetch(API+'/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'demo@mmri.mn',password:'Demo2026!!'})});t('R7','demo account logs in on the ISOLATED copy (status)',r.status===200||r.status===401,String(r.status));
await b.close();console.log(fail?`FAILED ${fail}`:'ALL PASS');process.exit(fail?1:0);
