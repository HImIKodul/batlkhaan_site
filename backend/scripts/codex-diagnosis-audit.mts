// Offline QA. Frozen report fixture adapted from backend-step15-full-synthetic-e2e.mjs. Run from backend with tsx.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { buildDefinition, calculateRuntimeSnapshot, evidenceFromAnswer } from '../src/engine/index.js';
import { runStrategyPipeline, buildFrozenStrategyPlan, strategyHashMaterial, planHashMaterial } from '../src/strategy/index.js';
import { buildDiagnosisResultV13 } from '../src/diagnosis/index.js';
import {
  buildFrozenReportPayload,
  deterministicFallbackNarrative,
  validateNarrativeDraft,
  reportBindingMaterial,
  buildReportPdfSource,
  reportPdfSourceHash,
  assertPdfBuffer,
  sha256Buffer
} from '../src/report/index.js';
import { sha256Json } from '../src/lib/hash.js';
import { routeNextQuestion } from '../src/engine/routing.js';
import { deterministicAnnualPlan } from '../src/report/guidance/year-plan.js';
import { methodologyTargetForDomain } from '../src/domain-methodology.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const runFile = promisify(execFile);

const BUNDLES=[
  ['marketing','methodology/MMRI_v3.0.3_QBANK_v3.1.3_STEP6_OF6_ACCEPTED_FINAL.json'],
  ['it','methodology/businessmri-v2.6-runtime-bundles/MMRI_ISMRI_Methodology_4.3.7_BUSINESSMRI_V2.json'],
  ['finance','methodology/businessmri-v2.6-runtime-bundles/MMRI_FINMRI_Methodology_4.2.7_BUSINESSMRI_V2.json'],
  ['people','methodology/businessmri-v2.6-runtime-bundles/MMRI_HRMRI_Methodology_4.1.7_BUSINESSMRI_V2.json'],
  ['operations','methodology/businessmri-v2.6-runtime-bundles/MMRI_OPMRI_Methodology_4.4.7_BUSINESSMRI_V2.json']
];
const FIXED_TIME='2026-10-25T03:00:00.000Z';
const checks=[];
const check=(name,pass,detail='')=>{checks.push({name,pass:Boolean(pass),detail:String(detail??'')});if(!pass)throw new Error(`FAIL ${name}: ${detail}`)};
const hashFile=(p)=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
function q(def,cat,cell,pathNo){const x=def.questionByCategoryCellPath.get(`${cat}:${cell}:${pathNo}`);if(!x)throw new Error(`Missing ${cat}:${cell}:${pathNo}`);return x;}
function applicable(x){return x.options.find(o=>['APPLICABLE','MOSTLY_APPLICABLE','PARTIAL_APPLICABILITY'].includes(o.state))?.optionIndex ?? x.options.find(o=>!['N_A_CLAIM','DNK','UNAVAILABLE'].includes(o.state))?.optionIndex ?? x.options[0].optionIndex;}
function na(x){const o=x.options.find(v=>v.state==='N_A_CLAIM');if(!o)throw new Error(`Missing N/A ${x.id}`);return o.optionIndex;}
function scored(x,high){const rows=x.options.filter(o=>o.state==='SCORED'&&o.score!==null).slice().sort((a,b)=>Number(a.score)-Number(b.score));return rows.length?(high?rows.at(-1):rows[0]).optionIndex:null;}
function ev(def,question,optionIndex){return evidenceFromAnswer({definition:def,question,optionIndex,explicitAuthority:1,respondentRoleId:'R01'});}
function profileAnswers(){return Array.from({length:20},(_,i)=>({questionId:`P${String(i+1).padStart(2,'0')}`,optionIndexes:[i===4?5:i===19?1:2]}));}
function purposeLabels(snapshot){return Object.fromEntries([...snapshot.purposes.keys()].map((id,i)=>[id,`Зорилго ${i+1}`]));}
function buildEvidence(def,reverse=false){
  const selected=def.categories.slice(0,12),selectedIds=new Set(selected.map(c=>c.id));
  const high=new Set((reverse?selected.slice(6):selected.slice(0,6)).map(c=>c.id));
  const evidence=[],answerRecords=[];
  for(const c of def.categories){
    if(selectedIds.has(c.id)){
      const x=q(def,c.id,'C01',1),oi=applicable(x);evidence.push(ev(def,x,oi));answerRecords.push({questionId:x.id,optionIndex:oi});
    }else{
      for(const p of [1,2,3]){const x=q(def,c.id,'C01',p),oi=na(x);evidence.push(ev(def,x,oi));answerRecords.push({questionId:x.id,optionIndex:oi});}
    }
  }
  for(const c of selected)for(const cell of def.cells){
    if(cell.id==='C01')continue;
    for(const p of [1,2,3,4]){
      const x=def.questionByCategoryCellPath.get(`${c.id}:${cell.id}:${p}`);if(!x)continue;
      const policy=def.runtimePolicy?.questionById.get(x.id);if(policy&&(!policy.scoreEligible||policy.routingState==='INFER_ONLY'))continue;
      const oi=scored(x,high.has(c.id));if(oi===null)continue;
      evidence.push(ev(def,x,oi));answerRecords.push({questionId:x.id,optionIndex:oi});
    }
  }
  return {evidence,answerRecords,high,selectedIds};
}
function finalizedScenario(domain,file,reverse=false){
  const raw=fs.readFileSync(file),bundle=JSON.parse(raw.toString('utf8')),def=buildDefinition(bundle),bundleSha=crypto.createHash('sha256').update(raw).digest('hex');
  const {evidence,answerRecords}=buildEvidence(def,reverse),snapshot=calculateRuntimeSnapshot(def,evidence),pAnswers=profileAnswers();
  const strategy=runStrategyPipeline({methodology:def,snapshot,profileAnswers:pAnswers});
  const assessmentId=`ASS-SYN-${domain}-${reverse?'B':'A'}`;
  const companyId=`COMP-SYN-${domain}`;
  const companyName=`Синтетик ${domain} ХХК`;
  const snapshotHash=sha256Json({answers:answerRecords,overall:snapshot.overall});
  let diagnosis=buildDiagnosisResultV13({assessmentId,companyId,companyName,methodologyBundleSha256:bundleSha,runtimeSnapshotHash:snapshotHash,generatedAt:FIXED_TIME,assessmentMode:'FULL',assessmentStatus:'COMPLETED',routingState:'FULL_COMPLETE',methodology:def,snapshot,strategy,purposeLabels:purposeLabels(snapshot)});
  diagnosis={...diagnosis,resultHash:sha256Json({...diagnosis,resultHash:''})};
  const strategyHash=sha256Json(strategyHashMaterial(diagnosis.resultHash,strategy));
  const planHash=sha256Json(planHashMaterial(diagnosis.resultHash,strategy.actionPlan));
  const frozenPlan=buildFrozenStrategyPlan({assessmentId,methodologyVersion:def.version,methodologyBundleSha256:bundleSha,runtimeSnapshotHash:snapshotHash,diagnosisResultHash:diagnosis.resultHash,generatedAt:FIXED_TIME,strategyHash,planHash,strategy});
  const bindingHash=sha256Json(reportBindingMaterial({diagnosisResultHash:diagnosis.resultHash,strategyHash,planHash,reportContractVersion:def.contracts.report.version,aiContractVersion:def.contracts.aiGeneration.version,findingsPolicyVersion:'MMRI-REPORT-FINDINGS-1.0-FIVE-CATEGORY'}));
  let payload=buildFrozenReportPayload({reportId:`RPT-${assessmentId}-V4`,payloadHash:'',traceVersion:'MMRI-TRACE-1.0',versionBundleId:`synthetic-${domain}`,versionBundleHash:bundleSha,sourceSnapshotId:`SNAP-${assessmentId}`,sourceSnapshotHash:snapshotHash,diagnosisResultHash:diagnosis.resultHash,strategyHash,planHash,bindingHash,generatedAt:FIXED_TIME,assessmentId,assessmentMode:'FULL',assessmentStatus:'COMPLETED',routingState:'FULL_COMPLETE',companyName,methodology:def,snapshot,strategy,purposeLabels:purposeLabels(snapshot)});
  payload={...payload,payloadHash:sha256Json({...payload,payloadHash:''})};
  const narrative=deterministicFallbackNarrative(payload),validation=validateNarrativeDraft(payload,narrative),pdfSource=buildReportPdfSource(payload,narrative);
  return {domain,reverse,def,answerRecords,evidence,snapshot,diagnosis,strategy,frozenPlan,payload,narrative,validation,pdfSource,bundleSha,snapshotHash,strategyHash,planHash,bindingHash};
}
async function renderPdf(source,out){
  const dir=path.dirname(out);fs.mkdirSync(dir,{recursive:true});const input=path.join(dir,'pdf-source.json');fs.writeFileSync(input,JSON.stringify(source),'utf8');
  await new Promise((resolve,reject)=>{const py=process.env.MMRI_PDF_PYTHON_PATH||'python3',renderer=path.resolve('pdf_renderer/render_report_pdf.py'),p=spawn(py,[renderer,'--input',input,'--output',out],{stdio:['ignore','pipe','pipe']});let err='';p.stderr.on('data',d=>err+=String(d));p.on('error',reject);p.on('exit',c=>c===0?resolve():reject(new Error(`renderer ${c}: ${err}`)));});
  const buf=fs.readFileSync(out);assertPdfBuffer(buf);return {bytes:buf.length,hash:sha256Buffer(buf),sourceHash:reportPdfSourceHash(source)};
}


function route(def, mode, count, style) {
  const relevant = new Set(def.categories.slice(0,count).map(c=>c.id));
  const evidence = [], asked = new Set(), seen = [];
  let irrelevant = 0, repeats = 0, unexplained = 0;
  for (let i=0;i<=def.questions.length;i++) {
    const snapshot = calculateRuntimeSnapshot(def,evidence);
    const input = {mode,snapshot,evidence,askedQuestionIds:asked,profileAnswers:profileAnswers(),diagnosticQuestionCount:evidence.length};
    const result = routeNextQuestion(def,input);
    const q = result.nextQuestion?.question;
    if (!q) return {mode,count,style,questions:seen.length,screens:evidence.filter(e=>e.cellId==='C01').length,irrelevant,repeats,unexplained,state:result.state,stop:result.stopReason,score:snapshot.overall.partialScore,official:snapshot.overall.officialScore,coverage:snapshot.overall.coverage,first:seen.slice(0,4),sequence:sha256Json(seen)};
    if (asked.has(q.id)) { repeats++; throw Error('Repeated question '+q.id); }
    if (q.cellId!=='C01'&&!relevant.has(q.categoryId)) irrelevant++;
    if (!result.nextQuestion.reason) unexplained++;
    seen.push(q.id);asked.add(q.id);
    const option = q.cellId==='C01' ? (relevant.has(q.categoryId)?applicable(q):na(q)) : style==='unknown' ? (q.options.find(o=>o.state==='DNK')?.optionIndex??scored(q,false)??applicable(q)) : (scored(q,style==='high')??applicable(q));
    evidence.push(ev(def,q,option));
  }
  throw Error('Question bank exhausted without terminal state');
}

const workspace = process.env.AUDIT_ARTIFACTS || fs.mkdtempSync(path.join(os.tmpdir(),'mmri-codex-audit-'));
console.log('ARTIFACTS',workspace);
for (const [domain,file] of BUNDLES) {
  if (process.env.AUDIT_DOMAIN && process.env.AUDIT_DOMAIN !== domain) continue;
  const a=finalizedScenario(domain,file,false),b=finalizedScenario(domain,file,true);
  const target=methodologyTargetForDomain(domain);
  console.log('BANK',JSON.stringify({domain,version:a.def.version,hash:a.bundleSha,match:a.bundleSha===target.bundleSha256,total:a.def.questions.length,unique:new Set(a.def.questions.map(q=>q.id)).size,capabilities:a.def.categories.length}));
  if (process.env.AUDIT_PART !== 'report') {
  const cases = process.env.AUDIT_PART === 'routing' ? (process.env.COUNTS||'20').split(',').flatMap(c=>[['QUICK',Number(c),'low'],['QUICK',Number(c),'high']]) : [['QUICK',8,'low'],['QUICK',20,'low'],['QUICK',20,'high'],['QUICK',20,'unknown'],['FULL',8,'low']];
  for (const params of cases) {
    try { console.log('ROUTE',domain,JSON.stringify(route(a.def,...params))); }
    catch (error) { console.log('ROUTE ERROR',domain,params,String(error)); }
  }
  const baseline=route(a.def,'QUICK',20,'low');
  console.log('REPLAY',domain,JSON.stringify(baseline)===JSON.stringify(route(a.def,'QUICK',20,'low')));
  }
  if (process.env.AUDIT_PART === 'routing') continue;
  for (const sample of [a,b]) {
    const {payload,narrative,validation}=sample;
    const plan=deterministicAnnualPlan(payload);
    const source=buildReportPdfSource(payload,plan?{...narrative,annualPlan:plan}:narrative);
    const dir=path.join(workspace,domain,sample.reverse?'B':'A');
    const pdf=path.join(dir,'report.pdf');
    try {
      if (!fs.existsSync(pdf)) await renderPdf({...source,render:{domainCode:domain}},pdf);
      const pageText=await Promise.all([1,2,3].map(async i=>(await runFile('pdftotext',['-raw','-f',String(i),'-l',String(i),pdf,'-'])).stdout));
      const {stdout:info}=await runFile('pdfinfo',[pdf]);
      fs.writeFileSync(path.join(dir,'pages.txt'),pageText.join('\n'));
      const plain=s=>s.replace(/\s+/gu,' ').trim();
      console.log('REPORT',JSON.stringify({domain,reverse:sample.reverse,score:payload.overall.score,coverage:payload.overall.coverage,metric:payload.metricType,strengths:payload.strengths.map(x=>x.categoryId),weaknesses:payload.weaknesses.map(x=>x.categoryId),priorities:payload.priorityActions.map(x=>[x.categoryId,x.cellId,x.type,x.actionMn]),warnings:payload.requiredWarnings,validation:validation.state,issues:validation.issues.map(x=>x.checkId),pages:Number(info.match(/Pages:\s+(\d+)/)?.[1]),scoreInPdf:pageText[0].split('\n').some(row=>row.trim()===String(payload.overall.score)),prioritiesInPdf:source.criticalActions.map(x=>plain(pageText[1]).includes(plain(x.guide?.headingMn??x.titleMn))),datesInPdf:source.annualPlan?.stages.every(s=>plain(pageText[2]).includes(plain(s.dateLabel))),planColon: /[:：]/u.test(pageText[2]),planStages:plan?.stages.length,first:plan?.stages[0],last:plan?.stages.at(-1)?.endDate}));
    } catch(error) { console.log('REPORT ERROR',domain,sample.reverse,String(error).split('\n').filter((line,i,all)=>i===0||i===all.length-2).join(' | ')); }
  }
}
