/* CSS refactor proof: visits the SAME pages on two frontends (A = original CSS from `git archive HEAD`, B = modified working tree), at several viewports, with animations
   frozen and reduced motion, and compares the computed style of EVERY element and its ::before/::after property by property, in memory (only differences are kept).
   Env: PW=<playwright-core>  A=http://127.0.0.1:5311/  B=http://127.0.0.1:5310/  EMAIL/PASSWORD (seeded QA owner)  VIEWPORTS="name:WxH,..."  ONLY=<regex on page key>  OUT=<json of differences>
   Both frontends must proxy to the SAME isolated API/database. Exit code 1 on any difference. */
import fs from 'fs';import {createHash} from 'node:crypto';import {createRequire} from 'module';const require=createRequire(import.meta.url);const {chromium}=require(process.env.PW);
const A=process.env.A,B=process.env.B,sleep=ms=>new Promise(r=>setTimeout(r,ms));const ONLY=process.env.ONLY?new RegExp(process.env.ONLY):null;
const VPS=(process.env.VIEWPORTS||'desktop:1280x900,mobile:390x844').split(',').map(x=>{const [n,d]=x.split(':');const [w,h]=d.split('x');return [n,{width:+w,height:+h}]});
const FREEZE='*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}';
const b=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});
const verifiedAssets=new Set();
async function verifyAssets(xs){for(const x of xs)for(const record of x)for(const value of Object.values(record.s))for(const match of value.matchAll(/url\(["']?(https?:[^"')]+)["']?\)/g)){const url=new URL(match[1]);if(![new URL(A).origin,new URL(B).origin].includes(url.origin))continue;const suffix=url.pathname+url.search;if(verifiedAssets.has(suffix))continue;const bodies=[];for(const base of [A,B]){const response=await fetch(new URL(suffix,base),{signal:AbortSignal.timeout(5000)});if(!response.ok)throw new Error(`Asset fetch failed: ${suffix} (${response.status})`);bodies.push(createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex'))}if(bodies[0]!==bodies[1])throw new Error(`Baseline asset differs: ${suffix}`);verifiedAssets.add(suffix)}}
const normalize=value=>value.replaceAll(new URL(A).origin,'<TEST_ORIGIN>').replaceAll(new URL(B).origin,'<TEST_ORIGIN>');
const diffs=[];let pages=0,elements=0,props=0;
const save=()=>fs.writeFileSync(process.env.OUT||'/tmp/css-compare.json',JSON.stringify({pages,elements,props,verifiedAssets:[...verifiedAssets],diffs},null,1));
b.on('disconnected',save);
async function snap(p){await p.waitForFunction(()=>document.querySelector('#root')?.textContent?.trim().length>30,{timeout:10000});await p.evaluate(async()=>{await document.fonts.ready;if([...document.fonts].some(f=>f.status==='error'))throw new Error('Font loading failed')});await sleep(150);
  return p.evaluate(()=>{const out=[];let idx=0;for(const el of document.querySelectorAll('body *')){const id=el.tagName.toLowerCase()+'.'+(typeof el.className==='string'?el.className.split(/\s+/).filter(Boolean).slice(0,3).join('.'):'')+'#'+(idx++);
    const grab=cs=>{const s={};for(let i=0;i<cs.length;i++)s[cs[i]]=cs.getPropertyValue(cs[i]);return s};out.push({id,s:grab(getComputedStyle(el))});
    for(const [nm,ps] of [['b',getComputedStyle(el,'::before')],['a',getComputedStyle(el,'::after')]]){if(ps.content&&ps.content!=='none'&&ps.content!=='normal')out.push({id:id+'::'+nm,s:grab(ps)})}}return out})}
function compare(key,x,y){pages++;if(x.length!==y.length){diffs.push({key,type:'element-count',a:x.length,b:y.length});return}
  for(let i=0;i<x.length;i++){elements++;if(x[i].id!==y[i].id){diffs.push({key,type:'structure',i,a:x[i].id,b:y[i].id});return}
    const d=[];for(const p of new Set([...Object.keys(x[i].s),...Object.keys(y[i].s)])){props++;if(normalize(x[i].s[p]??'')!==normalize(y[i].s[p]??''))d.push(`${p}: ${x[i].s[p]} -> ${y[i].s[p]}`)}
    if(d.length)diffs.push({key,type:'style',el:x[i].id,changes:d,n:d.length})}}
async function mk(vp,base){const ctx=await b.newContext({viewport:vp,reducedMotion:'reduce'});const p=await ctx.newPage();p.setDefaultTimeout(10000);p.setDefaultNavigationTimeout(15000);
  await p.addInitScript(css=>{const s=document.createElement('style');s.textContent=css;document.documentElement.appendChild(s);new MutationObserver(()=>{if(!s.isConnected)document.documentElement.appendChild(s)}).observe(document.documentElement,{childList:true})},FREEZE);return{ctx,p,base}}
for(const [label,vp] of VPS){
  const pa=await mk(vp,A),pb=await mk(vp,B);
  const both=async(key,fn)=>{if(ONLY&&!ONLY.test(label+':'+key))return;const xs=[];for(const q of [pa,pb]){if(await q.p.locator('[role=dialog]').count()){await q.p.keyboard.press('Escape');await q.p.locator('[role=dialog]').waitFor({state:'hidden'})}await fn(q);xs.push(await snap(q.p))}await verifyAssets(xs);compare(`${label}:${key}`,xs[0],xs[1]);save();console.log(`${label}:${key}: ${diffs.length} cumulative differences`)};
  await both('home',async q=>{await q.p.goto(q.base+'#/');await sleep(1500)});
  if(await pa.p.locator('.mmri-home2__guide').count()===0){await pa.p.goto(pa.base+'#/');await pa.p.waitForSelector('.mmri-home2__guide')}
  const n=await pa.p.locator('.mmri-home2__guide').count();
  for(let i=0;i<n;i++)await both(`home-guide-${i}`,async q=>{await q.p.goto(q.base+'#/');await sleep(900);await q.p.locator('.mmri-home2__guide').nth(i).click();await sleep(900)});
  for(const r of ['login','privacy','terms','forgot-password'])await both(r,async q=>{await q.p.goto(q.base+'#/'+r);await sleep(900)});
  if(process.env.EMAIL){for(const q of [pa,pb]){await q.p.goto(q.base+'#/login');await sleep(900);await q.p.fill('input[type=email]',process.env.EMAIL);await q.p.fill('input[type=password]',process.env.PASSWORD);await q.p.click('button[type=submit]');await q.p.waitForFunction(()=>!!localStorage.getItem('mmri.userId'));await sleep(300)}
    for(const r of ['analysis','company','priorities','plan','report','results','billing','settings','assessment','analysis?view=states'])await both('auth-'+r,async q=>{await q.p.goto(q.base+'#/'+r);await sleep(2200)})}
  await pa.ctx.close();await pb.ctx.close();console.log(`viewport ${label}: cumulative pages ${pages}, elements ${elements}, differences ${diffs.length}`)}
await b.close();fs.writeFileSync(process.env.OUT||'/tmp/css-compare.json',JSON.stringify({pages,elements,props,verifiedAssets:[...verifiedAssets],diffs},null,1));
console.log(diffs.length?`DIFFERENT: ${diffs.length} (see OUT)`:`IDENTICAL: ${pages} page states, ${elements} elements, ${props} computed properties compared`);
for(const d of diffs.slice(0,25))console.log(' ',d.key,d.type,d.el||'',(d.changes||[]).slice(0,3).join(' | '));process.exit(diffs.length?1:0);
