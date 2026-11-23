/* 15 REAL diagnosis profiles (5 domains x 3) through: frozen report payload (real engine output, read-only from an isolated QA database) -> plan input with real capability and dimension
   names -> planner (default: the deterministic TEST DOUBLE, NOT an AI) -> validator -> deterministic scheduling -> real PDF renderer. It tests input construction, validation, scheduling,
   coverage of the year and the three-page contract. It does NOT test the quality of a real model's Mongolian. Needs DATABASE_URL of an isolated clone.
   usage: DATABASE_URL=... npx tsx scripts/qa-plan-profiles.mts <outDir> <ownerEmail> <journeyAssessmentsJson> */
import fs from 'node:fs';import path from 'node:path';import {execFileSync} from 'node:child_process';
import {prisma} from '../src/db.js';import {generateAnnualPlan,validateAnnualPlanDraft,buildPlanInput,type PlanCatalog} from '../src/report/annual-plan.js';import {buildReportPdfSource} from '../src/report/pdf-artifact.js';import {sim} from './lib/annual-plan-sim.mts';
const {deterministicFallbackNarrative}=await import(new URL('../dist-strategy/report/index.js',import.meta.url).href);
const [OUT,OWNER,JOURNEYS]=process.argv.slice(2);fs.mkdirSync(OUT,{recursive:true});
const db=decodeURIComponent(new URL(process.env.DATABASE_URL!).pathname.slice(1));if(!/qa/.test(db)||db==='mmri')throw new Error('REFUSED: isolated QA clone only');
const NAMES:Record<string,string>={marketing:'Маркетинг',it:'Мэдээллийн технологи',finance:'Санхүү',people:'Хүний нөөц',operations:'Үйлдвэрлэл ба үйл ажиллагаа'};
const PY='python3',RENDERER=path.resolve('pdf_renderer/render_report_pdf.py');
const pages=(f:string)=>Number(/Pages:\s+(\d+)/.exec(execFileSync('pdfinfo',[f],{encoding:'utf8'}))![1]);
const ptxt=(f:string,a:number,b:number)=>execFileSync('pdftotext',['-f',String(a),'-l',String(b),'-layout',f,'-'],{encoding:'utf8'});
const render=(src:any,domain:string,out:string)=>{const i=out+'.json';fs.writeFileSync(i,JSON.stringify({...src,render:{domainCode:domain}}));execFileSync(PY,[RENDERER,'--input',i,'--output',out],{stdio:['ignore','ignore','pipe']});fs.unlinkSync(i)};
const words=(t:string)=>new Set(t.toLowerCase().replace(/[^\p{L}\s]/gu,' ').split(/\s+/).filter(w=>w.length>3));
const ids:Array<{id:string;label:string}>=[];
const owner=await prisma.user.findUniqueOrThrow({where:{email:OWNER},select:{memberships:{select:{companyId:true}}}});
const own=await prisma.assessment.findMany({where:{companyId:owner.memberships[0].companyId,status:'COMPLETED'},orderBy:[{domainCode:'asc'},{createdAt:'asc'}],select:{id:true,domainCode:true,previousAssessmentId:true}});
for(const a of own)ids.push({id:a.id,label:`${a.domainCode}-${a.previousAssessmentId?'retake':'first'}`});
for(const [d,v] of Object.entries(JSON.parse(fs.readFileSync(JOURNEYS,'utf8')) as Record<string,any>))ids.push({id:v.assessmentId,label:`${d}-journey`});
const results:any[]=[];let n=0;
for(const {id,label} of ids.sort((a,b)=>a.label.localeCompare(b.label))){
 n++;const asm=await prisma.assessment.findUniqueOrThrow({where:{id},select:{domainCode:true,methodologyVersionId:true}});const domain=String(asm.domainCode);
 const snap=await prisma.reportSnapshot.findFirstOrThrow({where:{assessmentId:id},select:{payload:true}});const payload:any=snap.payload;
 const [cats,cells]=await Promise.all([prisma.category.findMany({where:{methodologyVersionId:asm.methodologyVersionId},select:{externalId:true,nameMn:true}}),prisma.cellTemplate.findMany({where:{methodologyVersionId:asm.methodologyVersionId},select:{externalId:true,nameMn:true,groupMn:true}})]);
 const catalog:PlanCatalog={categories:Object.fromEntries(cats.map(c=>[c.externalId,c.nameMn])),cells:Object.fromEntries(cells.map(c=>[c.externalId,{nameMn:c.nameMn,groupMn:c.groupMn??null}]))};
 const plan:any=await generateAnnualPlan(payload,NAMES[domain],sim as any,{extras:{catalog}});const again:any=await generateAnnualPlan(payload,NAMES[domain],sim as any,{extras:{catalog}});
 const row:any={n,label,domain,generatedAt:String(payload.generatedAt).slice(0,10),score:payload.overall?.score,priorityTypes:[...new Set(payload.priorityActions.map((a:any)=>a.type))],state:plan.state};
 const base=path.join(OUT,`${String(n).padStart(2,'0')}-${label}`);
 if(plan.state!=='READY'){row.reason=plan.reason;results.push(row);continue}
 const {input}=buildPlanInput(payload,NAMES[domain],{catalog});
 row.deterministic=JSON.stringify(plan)===JSON.stringify(again);row.period=plan.periodLabel;row.stages=plan.stages.length;row.actionsPerStage=plan.stages.map((s:any)=>s.actions.length);
 const ds=plan.stages.map((s:any)=>[s.startDay,s.endDay]);row.firstStartDay=ds[0][0];row.lastEndDay=Math.max(...ds.map((d:number[])=>d[1]));
 let reach=-1,gap=0,overlaps=0;for(const [s,e] of ds){if(s>reach+1)gap++;if(s<=reach)overlaps++;reach=Math.max(reach,e)}row.gaps=gap;row.overlaps=overlaps;row.coversWholeYear=gap===0&&row.firstStartDay===0&&row.lastEndDay===(new Date(plan.endDate).getTime()-new Date(plan.startDate).getTime())/86400000;
 row.chronological=plan.stages.every((s:any)=>s.startDate<=s.endDate)&&plan.stages.every((s:any,i:number)=>i===0||s.startDate>=plan.stages[i-1].startDate);
 const refs=new Set(plan.stages.flatMap((s:any)=>s.actions.flatMap((a:any)=>a.recommendationIds)));row.findingsCovered=input.findings.every(f=>refs.has(f.ref));
 const acts:string[]=plan.stages.flatMap((s:any)=>s.actions.map((a:any)=>a.textMn));let mx=0;for(let i=0;i<acts.length;i++)for(let j=i+1;j<acts.length;j++){const a=words(acts[i]),b=words(acts[j]);mx=Math.max(mx,[...a].filter(w=>b.has(w)).length/Math.max(1,Math.min(a.size,b.size)))}row.maxActionSimilarity=+mx.toFixed(2);
 row.evidenceActionShare=+(acts.filter(t=>/нотолго|баримт бичиг|баримт бүрдүү|мэдээлэл цуглуул|дутуу байгаа/i.test(t)).length/acts.length).toFixed(2);
 row.capabilitiesNamed=input.findings.filter(f=>acts.some(t=>t.includes(f.capabilityMn))).length+'/'+input.findings.length;row.noLatin=!/[A-Za-z]/.test(acts.join(' ').replace(/BusinessMRI\.mn/g,''));
 row.validatorIssues=validateAnnualPlanDraft({schemaVersion:'MMRI-ANNUAL-PLAN-DRAFT-1.0',stages:plan.stages.map((s:any)=>({id:s.id,headingMn:s.headingMn,startDay:s.startDay,durationDays:s.endDay-s.startDay+1,dependsOnStageIds:s.dependsOnStageIds,dependencyNoteMn:s.dependencyNoteMn,actions:s.actions}))},input,Object.fromEntries(input.findings.map(f=>[f.ref,f.ref]).concat(input.evidenceChecks.map(v=>[v.ref,v.ref])))).issues.map(i=>i.checkId);
 const narrative=deterministicFallbackNarrative(payload);const before=buildReportPdfSource(payload,narrative),after=buildReportPdfSource(payload,{...narrative,annualPlan:plan});
 try{render(before,domain,base+'-template-roadmap.pdf');render(after,domain,base+'-with-plan.pdf')}catch(e:any){row.renderError=String(e?.stderr??e).slice(0,200);row.state='RENDER_FAILED';results.push(row);continue}
 row.pagesTemplate=pages(base+'-template-roadmap.pdf');row.pagesPlan=pages(base+'-with-plan.pdf');row.page12Identical=ptxt(base+'-template-roadmap.pdf',1,2)===ptxt(base+'-with-plan.pdf',1,2);
 const p3=ptxt(base+'-with-plan.pdf',3,3).replace(/\s+/g,' ');row.pdfHasEveryStage=plan.stages.every((s:any)=>p3.includes(s.dateLabel)&&p3.includes(s.headingMn.split(' ').slice(0,2).join(' ')));
 const bb=execFileSync('pdftotext',['-f','3','-l','3','-bbox',base+'-with-plan.pdf','-'],{encoding:'utf8'});const hs:number[]=[];for(const m of bb.matchAll(/yMin="([\d.]+)" xMax="[\d.]+" yMax="([\d.]+)"/g))hs.push(+m[2]-+m[1]);hs.sort((a,b)=>a-b);row.medianWordHeightPt=+(hs[Math.floor(hs.length/2)]??0).toFixed(1);
 fs.writeFileSync(base+'-plan.json',JSON.stringify(plan,null,1));fs.writeFileSync(base+'-plan.txt',plan.stages.map((s:any)=>`${s.dateLabel} | ${s.headingMn}${s.dependencyNoteMn?'\n  ('+s.dependencyNoteMn+')':''}\n`+s.actions.map((a:any)=>'  - '+a.textMn).join('\n')).join('\n\n'));
 results.push(row);
}
const ok=results.filter(r=>r.state==='READY');
const summary={profiles:results.length,ready:ok.length,deterministic:ok.every(r=>r.deterministic),wholeYear:ok.every(r=>r.coversWholeYear&&r.gaps===0),chronological:ok.every(r=>r.chronological),findingsCovered:ok.every(r=>r.findingsCovered),noIssues:ok.every(r=>!r.validatorIssues.length),threePages:ok.every(r=>r.pagesPlan===3&&r.pagesTemplate===3),pages12Identical:ok.every(r=>r.page12Identical),everyStageInPdf:ok.every(r=>r.pdfHasEveryStage),noLatin:ok.every(r=>r.noLatin),maxSimilarity:Math.max(...ok.map(r=>r.maxActionSimilarity)),maxEvidenceShare:Math.max(...ok.map(r=>r.evidenceActionShare)),stageCounts:[...new Set(ok.map(r=>r.stages))].sort(),shapes:[...new Set(ok.map(r=>r.stages+':'+r.actionsPerStage.join('')))].length,minWordHeightPt:Math.min(...ok.map(r=>r.medianWordHeightPt))};
fs.writeFileSync(path.join(OUT,'profiles-results.json'),JSON.stringify({summary,results},null,1));console.log(JSON.stringify(summary));for(const r of results)console.log(JSON.stringify({n:r.n,label:r.label,score:r.score,types:r.priorityTypes.join('/'),state:r.state,reason:r.reason,stages:r.stages,apS:r.actionsPerStage?.join(''),gaps:r.gaps,year:r.coversWholeYear,sim:r.maxActionSimilarity,ev:r.evidenceActionShare,named:r.capabilitiesNamed,pg:r.pagesPlan,h:r.medianWordHeightPt}));
await prisma.$disconnect();
