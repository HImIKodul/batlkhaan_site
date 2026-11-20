// Bounded native-motion check: no injected animation freeze or reduced-motion override.
// PW=<playwright-core> A=<baseline> B=<working> OUT=<directory> node qa/ui-css-motion-probe.mjs
import fs from 'node:fs';
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)(process.env.PW);
const output=process.env.OUT;
if(!output||!process.env.A||!process.env.B)throw new Error('A, B and OUT are required');
fs.mkdirSync(output,{recursive:true});
const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});
const records=[];
try{
 for(const [label,width,height] of [['desktop',1280,900],['mobile',390,844]]){
  for(const [side,base] of [['A',process.env.A],['B',process.env.B]]){
   const context=await browser.newContext({viewport:{width,height},reducedMotion:'no-preference'});
   const page=await context.newPage();page.setDefaultTimeout(8000);
   await page.goto(base+'#/');await page.waitForSelector('.hx__stack');
   await page.evaluate(async()=>{await document.fonts.ready;if([...document.fonts].some(f=>f.status==='error'))throw new Error('Font failed')});
   const collect=async state=>{
    const result=await page.evaluate(()=>{
     const read=(selector,pseudo)=>[...document.querySelectorAll(selector)].map(el=>{
      const s=getComputedStyle(el,pseudo);return {animation:s.animationName,willChange:s.willChange,margin:s.margin,width:s.width,grid:s.gridTemplateColumns};
     });
     return {stack:read('.hx__stack'),slabs:read('.hx__slab','::after'),glints:read('.mmri-home2__guide .mmri-shell-glint i'),cards:read('.mmri-guide2__stage-card'),overflow:document.documentElement.scrollWidth>innerWidth};
    });
    records.push({label,side,state,...result});
   };
   await collect('home');
   await page.screenshot({path:`${output}/${label}-${side}.png`});
   for(let i=0;i<3;i++){
    await page.locator('.mmri-home2__guide').nth(i).click();await page.waitForSelector('[role=dialog]');
    await collect(`guide-${i}`);
    await page.keyboard.press('Escape');await page.locator('[role=dialog]').waitFor({state:'hidden'});
   }
   await context.close();
  }
 }
 const failures=[];
 for(const record of records){
  if(record.overflow)failures.push(`${record.label}/${record.side}/${record.state}: horizontal overflow`);
  if(record.state.startsWith('guide')&&[...record.stack,...record.slabs].some(s=>s.animation!=='none'||s.willChange!=='auto'))failures.push(`${record.label}/${record.side}/${record.state}: background motion not stopped`);
  if(record.glints.some(s=>s.animation!=='none'))failures.push(`${record.label}/${record.side}/${record.state}: guide glint animation active`);
  if(record.side==='B'){
   const baseline=records.find(r=>r.label===record.label&&r.side==='A'&&r.state===record.state);
   if(JSON.stringify({...record,side:'A'})!==JSON.stringify(baseline))failures.push(`${record.label}/${record.state}: native style mismatch`);
  }
 }
 fs.writeFileSync(`${output}/result.json`,JSON.stringify({records,failures},null,2));
 console.log(JSON.stringify({states:records.length,failures}));
 if(failures.length)process.exitCode=1;
}finally{await browser.close()}
