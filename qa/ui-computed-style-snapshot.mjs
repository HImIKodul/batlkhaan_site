/* CSS refactor safety net: records the computed style of every element on the key pages (desktop + mobile, animations/transitions frozen,
   reduced motion) so two runs (before/after a CSS edit) can be diffed property by property.
   Usage:  PW=<playwright-core> BASE=http://127.0.0.1:5310/ OUT=/path/snap.json [EMAIL=.. PASSWORD=..] node qa/ui-computed-style-snapshot.mjs
           DIFF_A=a.json DIFF_B=b.json node qa/ui-computed-style-snapshot.mjs    (prints every changed element/property; exit 1 on any difference)
   Isolated stack and synthetic/QA accounts only. */
import fs from 'fs';
if(process.env.DIFF_A){
  const a=JSON.parse(fs.readFileSync(process.env.DIFF_A,'utf8')),b=JSON.parse(fs.readFileSync(process.env.DIFF_B,'utf8'));let n=0,els=0;
  for(const k of new Set([...Object.keys(a),...Object.keys(b)])){
    if(!a[k]||!b[k]){console.log('PAGE-MISSING',k);n++;continue}
    if(a[k].length!==b[k].length){console.log('ELEMENT-COUNT',k,a[k].length,'->',b[k].length);n++}
    for(let i=0;i<Math.min(a[k].length,b[k].length);i++){
      const x=a[k][i],y=b[k][i];if(x.id!==y.id){console.log('STRUCTURE',k,i,x.id,'!=',y.id);n++;break}
      const d=[];for(const p of Object.keys(x.s))if(x.s[p]!==y.s[p])d.push(`${p}: ${x.s[p]} -> ${y.s[p]}`);
      if(d.length){els++;n+=d.length;if(els<=40)console.log(k,x.id,'\n   '+d.slice(0,6).join('\n   '))}
    }
  }
  console.log(n?`DIFFERENT: ${n} property changes on ${els} elements`:'IDENTICAL');process.exit(n?1:0);
}
import {createRequire} from 'module';const require=createRequire(import.meta.url);const {chromium}=require(process.env.PW);
const BASE=process.env.BASE||'http://127.0.0.1:5310/',OUT=process.env.OUT;const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const FREEZE='*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}';
const b=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});
const result={};
async function snap(p,key){
  await p.waitForSelector('#root main, #root h1, #root [data-route-heading]',{timeout:15000}).catch(()=>console.log('WARN no page content for',key));
  await sleep(900);
  result[key]=await p.evaluate(()=>{
    const out=[];const all=document.querySelectorAll('body *');let idx=0;
    for(const el of all){
      const cs=getComputedStyle(el);if(cs.display==='none'&&el.tagName!=='SCRIPT'){}
      const id=el.tagName.toLowerCase()+'.'+(typeof el.className==='string'?el.className.split(/\s+/).filter(Boolean).slice(0,3).join('.'):'')+'#'+(idx++);
      const s={};for(let i=0;i<cs.length;i++){const n=cs[i];s[n]=cs.getPropertyValue(n)}
      out.push({id,s});
      const bef=getComputedStyle(el,'::before'),aft=getComputedStyle(el,'::after');
      for(const [nm,ps] of [['b',bef],['a',aft]]){if(ps.content&&ps.content!=='none'&&ps.content!=='normal'){const t={};for(let i=0;i<ps.length;i++){t[ps[i]]=ps.getPropertyValue(ps[i])}out.push({id:id+'::'+nm,s:t})}}
    }
    return out;
  });
}
for(const [label,vp] of [['desktop',{width:1280,height:900}],['mobile',{width:390,height:844}]]){
  const ctx=await b.newContext({viewport:vp,reducedMotion:'reduce'});const p=await ctx.newPage();
  await p.addInitScript(css=>{const s=document.createElement('style');s.textContent=css;document.documentElement.appendChild(s);new MutationObserver(()=>{if(!s.isConnected)document.documentElement.appendChild(s)}).observe(document.documentElement,{childList:true})},FREEZE);
  await p.goto(BASE+'#/');await sleep(1800);await snap(p,label+':home');
  // every home guide popup
  const guides=await p.locator('.mmri-home2__guide').count();
  for(let i=0;i<guides;i++){await p.locator('.mmri-home2__guide').nth(i).click().catch(()=>{});await sleep(900);await snap(p,`${label}:home-guide-${i}`);await p.keyboard.press('Escape');await sleep(400)}
  for(const r of ['login','privacy','terms','forgot-password']){await p.goto(BASE+'#/'+r);await sleep(1200);await snap(p,`${label}:${r}`)}
  if(process.env.EMAIL){
    await p.goto(BASE+'#/login');await sleep(900);await p.fill('input[type=email]',process.env.EMAIL);await p.fill('input[type=password]',process.env.PASSWORD);await p.click('button[type=submit]');await sleep(3000);
    for(const r of ['analysis','company','priorities','plan','report','results','billing','settings','assessment','analysis?view=states']){await p.goto(BASE+'#/'+r);await sleep(2500);await snap(p,`${label}:auth-${r}`)}
  }
  await ctx.close();
}
await b.close();fs.writeFileSync(OUT,JSON.stringify(result));console.log('snapshot pages:',Object.keys(result).length,'elements:',Object.values(result).reduce((a,x)=>a+x.length,0));
