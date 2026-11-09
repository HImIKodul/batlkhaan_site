/* Browser interaction audit (hover stability, hit-testing, focus visibility, overflow, touch targets, console/network errors).
   Needs a running dev/preview server and the local QA account (backend/.qa-credentials.local); it never writes data.
   Usage: PW=/path/to/node_modules/playwright-core node scripts/ui-interaction-audit.mjs <chromium|firefox|webkit> <width> <height> [touch]
   Output: JSON on stdout. Exit code 1 when a hard defect is found. */
import fs from 'fs';
import path from 'path';
import {createRequire} from 'module';
const require=createRequire(import.meta.url);
const {chromium,firefox,webkit}=require(process.env.PW||'playwright-core');
const [engine='chromium',W='1366',H='768',touchArg]=process.argv.slice(2);
const width=+W,height=+H,touch=touchArg==='touch'||width<=820;
const BASE=process.env.MMRI_URL||'http://localhost:5173/';
const cred=fs.readFileSync(path.resolve(process.cwd(),'../backend/.qa-credentials.local'),'utf8');
const EMAIL=cred.match(/email=(.*)/)[1].trim(),PASS=cred.match(/password=(.*)/)[1].trim();
const browserType={chromium,firefox,webkit}[engine];
const launch={chromium:{executablePath:process.env.CHROME||'/usr/bin/google-chrome',args:['--no-sandbox']},firefox:{},webkit:{}}[engine];
const browser=await browserType.launch(launch);
const ctx=await browser.newContext({viewport:{width,height},hasTouch:touch,isMobile:engine!=='firefox'&&touch,deviceScaleFactor:1});
const page=await ctx.newPage();
const issues=[],notes=[],matrix=[];
const net=[],cons=[];
page.on('console',m=>{if(m.type()==='error')cons.push(m.text().slice(0,160))});
page.on('pageerror',e=>cons.push('pageerror: '+String(e).slice(0,160)));
page.on('requestfailed',r=>net.push(`FAILED ${r.method()} ${r.url().replace(BASE,'/')} ${r.failure()?.errorText||''}`));
page.on('response',r=>{if(r.status()>=400)net.push(`${r.status()} ${r.request().method()} ${r.url().replace(BASE,'/')}`)});

const SEL='button,a[href],input:not([type=hidden]),select,textarea,summary,[role=button],[role=tab],[role=menuitem],[role=option],[tabindex]:not([tabindex="-1"])';
const snapshot=()=>page.evaluate(sel=>{
 const modal=document.querySelector('[role=dialog][aria-modal=true]');
 const out=[];
 document.querySelectorAll('[data-ia]').forEach(e=>e.removeAttribute('data-ia'));
 document.querySelectorAll(sel).forEach((el,i)=>{
  if(modal&&!modal.contains(el))return;
  if(el.closest('[inert],[hidden]'))return;
  const cs=getComputedStyle(el);if(cs.visibility==='hidden'||cs.display==='none'||+cs.opacity===0)return;
  const r=el.getBoundingClientRect();if(r.width<1||r.height<1)return;
  if(el.closest('.mmri-visually-hidden,.mmri-skip-link')&&!el.matches(':focus'))return;
  el.setAttribute('data-ia',String(i));
  const label=(el.getAttribute('aria-label')||el.innerText||el.value||el.placeholder||el.name||'').trim().replace(/\s+/g,' ').slice(0,34);
  out.push({i,tag:el.tagName.toLowerCase(),cls:(el.className&&el.className.baseVal===undefined?el.className:'').toString().split(' ')[0].slice(0,34),label,x:r.x,y:r.y,w:r.width,h:r.height,disabled:el.disabled===true||el.getAttribute('aria-disabled')==='true'});
 });
 return out;
},SEL);
const rectsOf=()=>page.evaluate(()=>{const o={};document.querySelectorAll('[data-ia]').forEach(e=>{const r=e.getBoundingClientRect();o[e.getAttribute('data-ia')]=[r.x,r.y,r.width,r.height]});return o});
const name=c=>`${c.tag}${c.cls?'.'+c.cls:''}${c.label?' «'+c.label+'»':''}`;
const sleep=ms=>page.waitForTimeout(ms);

async function auditScene(scene){
 const rec={scene,controls:0,overflowX:0,hoverShift:[],hoverLayoutShift:[],hitBlocked:[],hoverStuck:[],lowHoverContrast:[],smallTargets:[],noFocusRing:[],offscreenFocus:[],clipped:[]};
 rec.overflowX=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
 let ctrls=await snapshot();rec.controls=ctrls.length;
 // clipped text: elements whose content overflows their box without a scroll container
 rec.clipped=await page.evaluate(()=>{const o=[];document.querySelectorAll('button,a[href],h1,h2,h3,label,td,th').forEach(e=>{const cs=getComputedStyle(e);if(cs.display==='none'||cs.visibility==='hidden')return;if(e.closest('[inert]'))return;const r=e.getBoundingClientRect();if(!r.width)return;if((cs.overflow==='hidden'||cs.overflowX==='hidden')&&cs.textOverflow!=='ellipsis'&&e.scrollWidth>e.clientWidth+2&&e.clientWidth>0&&!e.closest('svg'))o.push((e.tagName+'.'+String(e.className).split(' ')[0]+' «'+(e.innerText||'').trim().slice(0,24)+'»'))});return o.slice(0,6)});
 // touch target sizes
 for(const c of ctrls){const m=Math.min(c.w,c.h);if(!c.disabled&&m<24&&!(c.tag==='input'&&c.w<30))rec.smallTargets.push(name(c)+` ${Math.round(c.w)}x${Math.round(c.h)}`)}
 // keyboard focus visibility
 await page.evaluate(()=>{document.activeElement?.blur?.();window.scrollTo(0,0)});
 const tabs=Math.min(ctrls.length+2,45);const seen=new Set();
 for(let t=0;t<tabs;t++){
  await page.keyboard.press('Tab');await sleep(90);
  const f=await page.evaluate(()=>{const e=document.activeElement;if(!e||e===document.body)return null;const cs=getComputedStyle(e);const r=e.getBoundingClientRect();const ring=cs.outlineStyle!=='none'&&parseFloat(cs.outlineWidth)>0;const inner=e.closest('label,.mmri-radio-card,.mmri-choice-select')&&getComputedStyle(e.closest('label,.mmri-radio-card,.mmri-choice-select')).boxShadow!=='none';return{k:e.tagName+'.'+String(e.className).split(' ')[0]+' «'+(e.innerText||e.getAttribute('aria-label')||e.name||'').trim().slice(0,28)+'»',ring,shadow:cs.boxShadow!=='none',inner:!!inner,vis:r.bottom>0&&r.top<innerHeight&&r.right>0&&r.left<innerWidth,dlg:!!document.querySelector('[role=dialog][aria-modal=true]')}});
  if(!f||seen.has(f.k))continue;seen.add(f.k);
  if(!f.ring&&!f.shadow&&!f.inner)rec.noFocusRing.push(f.k);
  if(!f.vis)rec.offscreenFocus.push(f.k);
 }
 await page.evaluate(()=>{document.activeElement?.blur?.();window.scrollTo(0,0)});
 await sleep(120);
 if(touch)return rec;
 // hover stability on a sample of controls
 ctrls=await snapshot();
 const sample=ctrls.filter(c=>!c.disabled).filter((c,i,a)=>a.length<=26||i%Math.ceil(a.length/26)===0);
 for(const c of sample){
  await page.evaluate(i=>document.querySelector(`[data-ia="${i}"]`)?.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'}),c.i);await sleep(220);
  const before=await rectsOf();const b=before[c.i];if(!b)continue;
  if(b[1]<0||b[1]+b[3]>height||b[0]<0||b[0]+b[2]>width)continue;
  const cx=b[0]+b[2]/2,cy=b[1]+b[3]/2;
  await page.mouse.move(cx,cy);await sleep(330);
  const after=await rectsOf();const a=after[c.i];
  if(a){const d=Math.max(Math.abs(a[0]-b[0]),Math.abs(a[1]-b[1]),Math.abs(a[2]-b[2]),Math.abs(a[3]-b[3]));if(d>0.6)rec.hoverShift.push(`${name(c)} moved ${d.toFixed(1)}px`);}
  for(const k of Object.keys(before)){if(+k===c.i||!after[k])continue;const d=Math.max(Math.abs(after[k][0]-before[k][0]),Math.abs(after[k][1]-before[k][1]));if(d>0.6){rec.hoverLayoutShift.push(`${name(c)} shifts control #${k} by ${d.toFixed(1)}px`);break}}
  const hit=await page.evaluate(([i,x,y])=>{const e=document.querySelector(`[data-ia="${i}"]`);const t=document.elementFromPoint(x,y);return !!(e&&t&&(e===t||e.contains(t)||t.contains(e)||t.closest('label')===e.closest('label')&&e.closest('label')))},[c.i,cx,cy]);
  if(!hit)rec.hitBlocked.push(name(c));
  const con=await page.evaluate(i=>{const e=document.querySelector(`[data-ia="${i}"]`);if(!e||!(e.innerText||'').trim())return null;const p=s=>{const m=s.match(/[\d.]+/g);return m?m.map(Number):[0,0,0,1]};const lum=c=>{const f=v=>{v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4)};return .2126*f(c[0])+.7152*f(c[1])+.0722*f(c[2])};let n=e,bg=null,grad=false;while(n){const cs=getComputedStyle(n);const c=p(cs.backgroundColor);if(cs.backgroundImage!=='none'&&n===e)grad=true;if((c[3]??1)>=.6){bg=c;break}n=n.parentElement}bg=bg||[255,255,255];const fg=p(getComputedStyle(e).color);const L1=lum(fg),L2=lum(bg);const r=(Math.max(L1,L2)+.05)/(Math.min(L1,L2)+.05);return{r:+r.toFixed(2),grad}},c.i);
  if(con&&con.r<3&&!con.grad)rec.lowHoverContrast.push(`${name(c)} ${con.r}:1`);
  await page.mouse.move(2,height-2);await sleep(380);
  const gone=await page.evaluate(i=>{const e=document.querySelector(`[data-ia="${i}"]`);return !e||!e.matches(':hover')},c.i);
  const back=(await rectsOf())[c.i];
  if(!gone)rec.hoverStuck.push(name(c));
  else if(back&&Math.max(Math.abs(back[0]-b[0]),Math.abs(back[1]-b[1]))>0.6)rec.hoverStuck.push(name(c)+' (did not return to rest position)');
 }
 return rec;
}

async function login(){
 await page.goto(BASE+'#/login');await page.reload();await sleep(900);
 await page.locator('[role=tablist] button,.mmri-tabs button',{hasText:'Нэвтрэх'}).first().click().catch(()=>{});
 await page.fill('input[type=email]',EMAIL);await page.fill('input[type=password]',PASS);
 await page.click('button[type=submit]');await sleep(2200);
 if(!(await page.locator('.mmri-account-trigger').count()))throw new Error('login failed: account menu not present');
}
const go=async h=>{await page.goto(BASE+h);await sleep(1700)};
const results=[];
const run=async(scene,setup)=>{try{if(setup)await setup();await sleep(500);results.push(await auditScene(scene))}catch(e){results.push({scene,error:String(e).slice(0,200)})}};

// logged-out scenes
await go('#/');
await run('home (logged out)');
for(const [gi,g] of ['guide: about','guide: report','guide: how-to'].entries()){
 await run(g,async()=>{await go('#/');await page.locator('.mmri-home2__guide').nth(gi).click();await sleep(800)});
 await page.keyboard.press('Escape');await sleep(500);
}
await run('login tab',async()=>{await go('#/login')});
await run('register tab',async()=>{await go('#/login');await page.locator('button',{hasText:'Бүртгүүлэх'}).first().click()});
await login();
await run('home (signed in)',()=>go('#/'));
await run('notifications panel',async()=>{await go('#/analysis');await page.locator('.mmri-notification-trigger').first().click();await sleep(500)});
await page.keyboard.press('Escape');
await run('account menu',async()=>{await go('#/analysis');await page.locator('.mmri-account-trigger').first().click();await sleep(500)});
await page.keyboard.press('Escape');
await run('diagnosis hub',()=>go('#/analysis'));
await run('company profile',()=>go('#/profile'));
await run('billing (first diagnosis)',()=>go('#/billing'));
await run('results',()=>go('#/results'));
await run('priorities',()=>go('#/priorities'));
await run('report',()=>go('#/report'));
await run('settings',()=>go('#/settings'));
await run('question component (states)',()=>go('#/states'));
await run('payment history',async()=>{await go('#/settings');const t=page.locator('button,a',{hasText:/Төлбөрийн түүх/}).first();if(await t.count())await t.click()});
await browser.close();
const hard=results.filter(r=>r.error||r.overflowX>1||r.hoverShift?.length||r.hoverLayoutShift?.length||r.hitBlocked?.length||r.hoverStuck?.length||r.noFocusRing?.length||r.offscreenFocus?.length);
console.log(JSON.stringify({engine,viewport:`${width}x${height}`,touch,results,console:[...new Set(cons)],network:[...new Set(net)]},null,1));
process.exit(hard.length?1:0);
