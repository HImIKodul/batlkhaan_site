/* WS-A regression: MMRI-17 (transient refresh failures must not clear local work) and MMRI-16 (cross-tab serialisation).
   Bundles frontend/src/api/client.ts with the frontend's esbuild and drives it in Chrome with a mocked /api/v1/auth/refresh.
   Env: CLIENT (path to client.ts, default the active source), PW (playwright-core path). No backend needed.
   Usage: node scripts/qa-wsa-refresh-client.mjs */
import {createRequire} from 'node:module';import {execFileSync} from 'node:child_process';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';
const require=createRequire(import.meta.url);const {chromium}=require(process.env.PW||'/home/kirby/MMRI_TOOLS/pw/node_modules/playwright-core');
const root=path.resolve(new URL('../..',import.meta.url).pathname);const fe=path.join(root,'frontend');
const CLIENT=process.env.CLIENT||path.join(fe,'src/api/client.ts');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'wsa-'));const entry=path.join(tmp,'entry.ts');const out=path.join(tmp,'bundle.js');
fs.writeFileSync(entry,`import * as c from ${JSON.stringify(CLIENT)};(window as any).MMRI=c;`);
execFileSync(path.join(fe,'node_modules/.bin/esbuild'),[entry,'--bundle','--format=iife','--outfile='+out,'--define:import.meta.env.VITE_API_BASE_URL="/api/v1"','--define:import.meta.env.VITE_MMRI_METHODOLOGY_VERSION="3.0.0"','--define:import.meta.env.MODE="test"','--define:import.meta.env.DEV=false','--define:import.meta.env.PROD=true','--log-level=error'],{cwd:fe});
const js=fs.readFileSync(out,'utf8');
let fail=0;const rec=(n,ok,d='')=>{if(!ok)fail++;console.log((ok?'PASS ':'FAIL ')+n+(d?' | '+d:''))};
const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});
const ORIGIN='http://127.0.0.1:4211';
async function openTab(ctx,refreshHandler){const p=await ctx.newPage();
  await p.route(ORIGIN+'/**',async r=>{const u=new URL(r.request().url());if(u.pathname==='/api/v1/auth/refresh')return refreshHandler(r);return r.fulfill({status:200,contentType:'text/html',body:'<!doctype html><title>t</title>'})});
  await p.goto(ORIGIN+'/');await p.addScriptTag({content:js});return p}
const seed=p=>p.evaluate(()=>{localStorage.setItem('mmri.userId','u1');localStorage.setItem('mmri.companyId','c1');localStorage.setItem('mmri.companyName','Test');localStorage.setItem('mmri.assessmentId.c1','a1');localStorage.setItem('mmri.assessmentDraft.c1','{"q1":"draft"}')});
const state=p=>p.evaluate(()=>({draft:localStorage.getItem('mmri.assessmentDraft.c1'),company:localStorage.getItem('mmri.companyId'),user:localStorage.getItem('mmri.userId')}));
const cases=[
 ['HTTP 503',r=>r.fulfill({status:503,contentType:'application/json',body:'{"error":{"message":"down"}}'}),true],
 ['HTTP 500',r=>r.fulfill({status:500,contentType:'application/json',body:'{}'}),true],
 ['HTTP 429',r=>r.fulfill({status:429,contentType:'application/json',headers:{'retry-after':'1'},body:'{}'}),true],
 ['network error',r=>r.abort('connectionrefused'),true],
 ['HTTP 401',r=>r.fulfill({status:401,contentType:'application/json',body:'{"error":{"message":"Refresh session invalid"}}'}),false],
 ['HTTP 403',r=>r.fulfill({status:403,contentType:'application/json',body:'{}'}),false]];
for(const [name,h,keep] of cases){const ctx=await browser.newContext();const p=await openTab(ctx,h);await seed(p);
  const ok=await p.evaluate(()=>window.MMRI.restoreSession());const s=await state(p);
  rec(`17 ${name}: restoreSession returns false`,ok===false);
  rec(`17 ${name}: local work ${keep?'is kept':'is cleared (definitive rejection)'}`,keep?(s.draft!==null&&s.company==='c1'):(s.draft===null&&s.company===null),JSON.stringify(s));
  await ctx.close()}
{const ctx=await browser.newContext();const p=await openTab(ctx,r=>r.fulfill({status:200,contentType:'application/json',body:'{"data":{"user":{"id":"u1"},"accessToken":"tok123"}}'}));await seed(p);
 const ok=await p.evaluate(()=>window.MMRI.restoreSession());const s=await state(p);const tok=await p.evaluate(()=>window.MMRI.session.accessToken);
 rec('17 success: token restored and local work kept',ok===true&&tok==='tok123'&&s.draft!==null);await ctx.close()}
{// recover after a transient failure: next call succeeds
 const ctx=await browser.newContext();let n=0;const p=await openTab(ctx,r=>{n++;return n===1?r.fulfill({status:503,body:'{}'}):r.fulfill({status:200,contentType:'application/json',body:'{"data":{"user":{"id":"u1"},"accessToken":"tok2"}}'})});await seed(p);
 const a=await p.evaluate(()=>window.MMRI.restoreSession());const b=await p.evaluate(()=>window.MMRI.restoreSession());const s=await state(p);
 rec('17 retry after 503 succeeds and keeps drafts',a===false&&b===true&&s.draft!==null,`a=${a} b=${b}`);await ctx.close()}
{// 16: two tabs in one context must not have refresh requests in flight at the same time
 const ctx=await browser.newContext();let inflight=0,max=0,total=0;
 const h=async r=>{inflight++;total++;max=Math.max(max,inflight);await new Promise(x=>setTimeout(x,400));inflight--;r.fulfill({status:200,contentType:'application/json',body:'{"data":{"user":{"id":"u1"},"accessToken":"t"}}'})};
 const p1=await openTab(ctx,h);const p2=await openTab(ctx,h);
 await Promise.all([p1.evaluate(()=>window.MMRI.restoreSession()),p2.evaluate(()=>window.MMRI.restoreSession())]);
 rec('16 two tabs refresh one after the other (never simultaneously)',max===1&&total===2,`max in flight ${max}, total ${total}`);await ctx.close()}
await browser.close();fs.rmSync(tmp,{recursive:true,force:true});
console.log(fail?`\n${fail} FAILED`:'\nALL PASSED');process.exit(fail?1:0);
