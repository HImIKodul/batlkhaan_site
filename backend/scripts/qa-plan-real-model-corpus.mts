/* Reads REAL model plans saved by an earlier authorised session (another prompt, synthetic diagnoses), converts them to the current draft shape and runs the current validator.
   Purpose: calibrate the text rules on genuine model Mongolian without any paid call. It does not measure the current prompt. usage: tsx scripts/qa-plan-real-model-corpus.mts <dir>... */
import fs from 'node:fs';import path from 'node:path';import {validateAnnualPlanDraft,type PlanInput} from '../src/report/annual-plan.js';
const caps=JSON.parse(fs.readFileSync(new URL('../tests/fixtures/plan-real-model-capabilities.json',import.meta.url),'utf8'));
const NAME:Record<string,string>={};for(const rows of Object.values(caps) as any[])for(const c of rows)NAME[c.id]=c.name;
const DOMAIN:Record<string,string>={fin:'Санхүү',mkt:'Маркетинг',it:'Мэдээллийн технологи',hr:'Хүний нөөц',ops:'Үйлдвэрлэл ба үйл ажиллагаа'};
const verbose=process.env.VERBOSE==='1';let n=0,clean=0;const tally:Record<string,number>={};
for(const dir of process.argv.slice(2))for(const f of fs.readdirSync(dir).filter(x=>/^(fin|mkt|it|hr|ops)-\d\.json$/.test(x)).sort()){
 const prog=JSON.parse(fs.readFileSync(path.join(dir,f),'utf8')).programme;if(!prog)continue;n++;
 const cat=(r:string)=>/^[WRA]:/.test(r)?r.replace(/^[WRA]:(?:FND-|REC-)?/,''):'';
 const ids:string[]=[];for(const s of prog.stages)for(const a of s.actions)for(const r of a.evidenceRefs){const c=cat(r);if(c&&!ids.includes(c))ids.push(c)}
 const input={domainNameMn:DOMAIN[f.split('-')[0]],windowDays:365,findings:ids.map((c,i)=>({ref:`F${i+1}`,capabilityMn:NAME[c]??'',dimensionMn:'',kind:'EXECUTION'})),evidenceChecks:[],dependencyHints:[],strengths:[]} as unknown as PlanInput;
 const map=Object.fromEntries(input.findings.map(x=>[x.ref,x.ref]));const day=(m:number)=>Math.round(m*365/12);
 const stages=prog.stages.map((s:any,i:number)=>({id:`E${i+1}`,headingMn:s.titleMn,startDay:day(s.startMonth-1),durationDays:day(s.endMonth)-day(s.startMonth-1),dependsOnStageIds:[],dependencyNoteMn:null,actions:s.actions.map((a:any)=>{const r=[...new Set(a.evidenceRefs.map(cat).filter(Boolean).map((c:string)=>`F${ids.indexOf(c)+1}`))];return {textMn:a.textMn,recommendationIds:r.length?r:['F1']}})}));
 const issues=validateAnnualPlanDraft({schemaVersion:'MMRI-ANNUAL-PLAN-DRAFT-1.0',stages},input,map).issues.filter(x=>!['ACTION_COUNT'].includes(x.checkId));
 if(!issues.length)clean++;for(const c of new Set(issues.map(x=>x.checkId)))tally[c]=(tally[c]??0)+1;
 console.log(`${path.basename(dir)}/${f}: ${issues.length?[...new Set(issues.map(x=>x.checkId))].join(', '):'clean'}`);if(verbose)for(const x of issues)console.log('   ',x.checkId,x.message);
}
console.log(JSON.stringify({plans:n,clean,tally}));
