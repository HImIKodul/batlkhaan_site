// Bounded rendering comparison. Deliberately compares layout/material/typography properties;
// native animation semantics are covered separately by ui-css-motion-probe.mjs.
import fs from 'node:fs';
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)(process.env.PW);
const properties=('display position width height min-width max-width min-height max-height top right bottom left margin-top margin-right margin-bottom margin-left padding-top padding-right padding-bottom padding-left gap row-gap column-gap grid-template-columns grid-template-rows grid-auto-flow flex-direction flex-wrap flex-grow flex-shrink flex-basis align-items align-self justify-content justify-items font-family font-size font-weight font-style line-height letter-spacing color text-align text-transform text-decoration white-space overflow overflow-x overflow-y border-top-width border-top-style border-top-color border-radius box-shadow background-color opacity visibility z-index filter backdrop-filter transform outline-width outline-style outline-color outline-offset content').split(' ');
const freeze='*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}';
const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});
const results=[];
try{
 const states=(process.env.STATES||'home,guide-0,guide-1,guide-2,login,privacy,terms,forgot-password').split(',');
 const viewports=(process.env.VIEWPORTS||'desktop:1280x900,mobile:390x844').split(',').map(v=>{const [name,size]=v.split(':');const [width,height]=size.split('x').map(Number);return {name,width,height}});
 let credentials;
 if(process.env.QA_CREDENTIAL_FILE){credentials=Object.fromEntries(fs.readFileSync(process.env.QA_CREDENTIAL_FILE,'utf8').trim().split('\n').map(line=>{const i=line.indexOf('=');return [line.slice(0,i),line.slice(i+1).trim()]}))}
 for(const viewport of viewports){
  const snapshots={};
  for(const side of ['A','B']){
   const context=await browser.newContext({viewport:{width:viewport.width,height:viewport.height},reducedMotion:'reduce'});
   const page=await context.newPage();page.setDefaultTimeout(8000);page.setDefaultNavigationTimeout(12000);
   if(credentials){
    await page.goto(process.env[side]+'#/login');
    await page.fill('input[type=email]',credentials.email);await page.fill('input[type=password]',credentials.password);
    await page.click('button[type=submit]');await page.waitForFunction(()=>!!localStorage.getItem('mmri.userId'));
   }
   snapshots[side]={};
   for(const state of states){
    // A full navigation resets dialog state and any prior transient route state.
    await page.goto(process.env[side]+'#/'+(state==='home'||state.startsWith('guide-')?'':state));
    await page.reload();
    await page.waitForFunction(()=>document.querySelector('#root')?.textContent?.trim().length>30);
    await page.evaluate(async()=>{await document.fonts.ready;if([...document.fonts].some(f=>f.status==='error'))throw new Error('Font failed')});
    if(process.env.EXPECT_SELECTOR)await page.waitForSelector(process.env.EXPECT_SELECTOR);
    await page.addStyleTag({content:freeze});
    if(state.startsWith('guide-')){await page.locator('.mmri-home2__guide').nth(Number(state.slice(6))).click();await page.waitForSelector('[role=dialog]')}
    if(credentials)await page.waitForFunction(()=>!!localStorage.getItem('mmri.userId'));
    snapshots[side][state]=await page.evaluate(properties=>{
     const rows=[];
     for(const el of document.querySelectorAll('body *')){
      for(const pseudo of [null,'::before','::after']){
       const s=getComputedStyle(el,pseudo);if(pseudo&&['none','normal'].includes(s.content))continue;
       rows.push({element:el.tagName+'.'+(typeof el.className==='string'?el.className:''),pseudo,style:Object.fromEntries(properties.map(p=>[p,s.getPropertyValue(p)]))});
      }
     }
     return rows;
    },properties);
   }
   await context.close();
  }
  for(const state of states){
   const a=snapshots.A[state],b=snapshots.B[state];const differences=[];
   if(a.length!==b.length)differences.push({type:'structure',a:a.length,b:b.length});
   for(let i=0;i<Math.min(a.length,b.length);i++){
    if(a[i].element!==b[i].element||a[i].pseudo!==b[i].pseudo){differences.push({type:'element',index:i,a:a[i].element,b:b[i].element});break}
    const changes=properties.filter(p=>a[i].style[p]!==b[i].style[p]).map(property=>({property,a:a[i].style[property],b:b[i].style[property]}));
    if(changes.length)differences.push({index:i,element:a[i].element,pseudo:a[i].pseudo,changes});
   }
   results.push({viewport:viewport.name,state,elements:a.length,properties:properties.length,differences});
   fs.writeFileSync(process.env.OUT,JSON.stringify({results},null,2));
   console.log(`${viewport.name}/${state}: ${a.length} elements, ${differences.length} differences`);
  }
 }
 if(results.some(r=>r.differences.length))process.exitCode=1;
}finally{await browser.close()}
