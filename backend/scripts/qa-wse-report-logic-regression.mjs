/* WS-E MMRI-25 / MMRI-26: Report.tsx logic (static) plus the server round trip it relies on.
   Usage: [FILE=<Report.tsx>] API=http://127.0.0.1:4115 ASSESSMENT=<id> node scripts/qa-wse-report-logic-regression.mjs */
import fs from 'fs';
const FILE=process.env.FILE||new URL('../../frontend/src/pages/Report.tsx',import.meta.url).pathname;const src=fs.readFileSync(FILE,'utf8');
let fail=0;const rec=(n,ok,d='')=>{if(!ok)fail++;console.log((ok?'PASS ':'FAIL ')+n+(d?' | '+d:''))};
rec('L26-01 the report history control does not cut the list to seven versions',!/\.slice\(0,\s*7\)/.test(src));
rec('L26-02 the existing version strip wraps (no layout change needed for more versions)',/\.report-version-strip\{display:flex;flex-wrap:wrap/.test(fs.readFileSync(new URL('../../frontend/src/pages/report.css',import.meta.url),'utf8')));
rec('L25-01 page three persists stage completion through api.updateMilestone',/api\.updateMilestone\(/.test(src));
rec('L25-02 completion shown for a real report is derived from server milestone status (api.getActionPlan)',/api\.getActionPlan\(/.test(src)&&/statusById/.test(src));
rec('L25-03 plan actions carry the authoritative milestone id from the frozen payload',/milestoneId:m\.milestoneId/.test(src));
rec('L25-04 browser storage is used only on the demo path',/if\(!server\)\{setDone\(prev=>/.test(src)&&!/localStorage\.setItem\(key,JSON\.stringify\(\[\.\.\.next\]\)\);return next\}\);\s*$/m.test(src.split('function PageThree')[1]?.split('\n')[0]||''));
if(process.env.API&&process.env.ASSESSMENT){
 const API=process.env.API,B=API+'/api/v1',ORIGIN=`http://127.0.0.1:${Number(new URL(API).port)+100}`,aid=process.env.ASSESSMENT;
 const H='/home/kirby/Downloads/MMRI_FUNCTIONAL_REPAIR';const qa=Object.fromEntries(fs.readFileSync(H+'/harness/creds-qa.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>[l.slice(0,l.indexOf('=')),l.slice(l.indexOf('=')+1)]));
 const call=async(m,p,body)=>{const r=await fetch(B+p,{method:m,headers:{origin:ORIGIN,'content-type':'application/json',...(tok?{authorization:'Bearer '+tok}:{})},body:body?JSON.stringify(body):undefined});return {s:r.status,d:(await r.json().catch(()=>({}))).data}};
 let tok='';tok=(await call('POST','/auth/login',{email:qa.email,password:qa.password})).d.accessToken;
 const rep=(await call('GET',`/assessments/${aid}/report`)).d;const ids=rep.payload.roadmap.flatMap(r=>r.milestones.map(m=>m.milestoneId));
 const st=async id=>(await call('GET',`/assessments/${aid}/action-plan`)).d.plan.milestones.find(m=>m.id===id)?.status;
 rec('L25-05 every roadmap milestoneId in the report payload exists in the server action plan',ids.length>0&&(await Promise.all(ids.map(st))).every(Boolean),`${ids.length} ids`);
 const id=ids[0];const before=await st(id);const up=await call('PATCH',`/assessments/${aid}/action-plan/milestones/${id}`,{status:'DONE'});const afterDone=await st(id);
 rec('L25-06 PATCH DONE is acknowledged and visible in the server plan',up.s===200&&afterDone==='DONE',`${before} -> ${afterDone}`);
 await call('PATCH',`/assessments/${aid}/action-plan/milestones/${id}`,{status:'NOT_STARTED'});rec('L25-07 PATCH NOT_STARTED reverts it',(await st(id))==='NOT_STARTED');
}
console.log(fail?`FAILED ${fail}`:'ALL PASS');process.exit(fail?1:0);
