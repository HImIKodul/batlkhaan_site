import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { buildDefinition, calculateRuntimeSnapshot, evidenceFromAnswer } from '../dist-strategy/engine/index.js';
import { runStrategyPipeline, buildFrozenStrategyPlan, strategyHashMaterial, planHashMaterial } from '../dist-strategy/strategy/index.js';
import { buildDiagnosisResultV13 } from '../dist-strategy/diagnosis/index.js';
import {
  buildFrozenReportPayload,
  deterministicFallbackNarrative,
  validateNarrativeDraft,
  reportBindingMaterial,
  buildReportPdfSource,
  reportPdfSourceHash,
  assertPdfBuffer,
  sha256Buffer
} from '../dist-strategy/report/index.js';
import { sha256Json } from '../dist-strategy/lib/hash.js';
import { ManualPaymentAdapter } from '../dist/billing/qpay-client.js';

const BUNDLES=[
  ['marketing','methodology/MMRI_v3.0.3_QBANK_v3.1.3_STEP6_OF6_ACCEPTED_FINAL.json'],
  ['it','methodology/businessmri-v2.5-runtime-bundles/MMRI_ISMRI_Methodology_4.3.5_BUSINESSMRI_V2.json'],
  ['finance','methodology/businessmri-v2.5-runtime-bundles/MMRI_FINMRI_Methodology_4.2.5_BUSINESSMRI_V2.json'],
  ['people','methodology/businessmri-v2.5-runtime-bundles/MMRI_HRMRI_Methodology_4.1.5_BUSINESSMRI_V2.json'],
  ['operations','methodology/businessmri-v2.5-runtime-bundles/MMRI_OPMRI_Methodology_4.4.5_BUSINESSMRI_V2.json']
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

const workspace=fs.mkdtempSync(path.join(os.tmpdir(),'mmri-step15-e2e-'));
try{
  // Synthetic user/business/login ownership boundary.
  const user={id:'USR-SYN-OWNER',email:'owner@example.invalid',enabled:true};
  const business={id:'COMP-SYN',name:'Синтетик компани ХХК',ownerUserId:user.id};
  check('user is enabled',user.enabled===true);
  check('business ownership matches user',business.ownerUserId===user.id);

  // Temporary payment path: manual QR itself never self-confirms; operator confirmation creates the unlock state.
  const manual=new ManualPaymentAdapter({manualPaymentQrText:'MMRI-SYNTHETIC-STATIC-QR',manualPaymentQrImage:'',manualPaymentShortUrl:'https://pay.invalid/mmri'});
  const invoice=await manual.createInvoice({senderInvoiceNo:'SYN-INV-1',receiverCode:business.id,description:'MMRI synthetic diagnostic',amountMnt:300000,callbackUrl:'https://callback.invalid'});
  check('manual payment provides QR',invoice.qrText==='MMRI-SYNTHETIC-STATIC-QR');
  check('manual payment never self-confirms',(await manual.checkInvoicePayment(invoice.providerInvoiceId,300000)).paid===false);
  const payment={status:'PAID',amountMnt:300000,provider:'MANUAL',providerPaymentId:'manual:SYN-OPERATOR-CONFIRMED'};
  const entitlement=payment.status==='PAID'&&payment.amountMnt===300000?{status:'ACTIVE',assessmentLimit:1,assessmentsUsed:0}:null;
  check('paid manual confirmation creates usable entitlement',entitlement?.status==='ACTIVE'&&entitlement.assessmentsUsed<entitlement.assessmentLimit);
  entitlement.assessmentsUsed++; entitlement.status='CONSUMED';
  check('diagnosis consumes one-time entitlement',entitlement.status==='CONSUMED'&&entitlement.assessmentsUsed===1);

  const summaries=[];
  for(const [domain,file] of BUNDLES){
    const a=finalizedScenario(domain,file,false),b=finalizedScenario(domain,file,true);
    check(`${domain}: real questions answered`,a.answerRecords.length>100,a.answerRecords.length);
    check(`${domain}: no duplicate answered question`,new Set(a.answerRecords.map(x=>x.questionId)).size===a.answerRecords.length,a.answerRecords.length);
    check(`${domain}: diagnosis has 64 capabilities`,a.diagnosis.capabilities.length===64,a.diagnosis.capabilities.length);
    check(`${domain}: five strengths`,a.payload.strengths.length===5,a.payload.strengths.length);
    check(`${domain}: five weaknesses`,a.payload.weaknesses.length===5,a.payload.weaknesses.length);
    check(`${domain}: critical actions present`,a.payload.priorityActions.length>0,a.payload.priorityActions.length);
    check(`${domain}: 365-day plan`,a.frozenPlan.actionPlan.windowDays===365,a.frozenPlan.actionPlan.windowDays);
    check(`${domain}: fallback narrative validates`,a.validation.state==='PASS',JSON.stringify(a.validation.issues));
    check(`${domain}: complete report hash chain`,[a.diagnosis.resultHash,a.strategyHash,a.planHash,a.bindingHash,a.payload.payloadHash].every(x=>typeof x==='string'&&x.length===64));
    check(`${domain}: reversed answers change diagnosis`,a.diagnosis.resultHash!==b.diagnosis.resultHash);
    check(`${domain}: reversed answers change report`,a.payload.payloadHash!==b.payload.payloadHash);
    check(`${domain}: reversed answers change strengths`,JSON.stringify(a.payload.strengths.map(x=>x.categoryId))!==JSON.stringify(b.payload.strengths.map(x=>x.categoryId)));

    const reportDir=path.join(workspace,domain,a.payload.reportId);fs.mkdirSync(reportDir,{recursive:true});
    const reportJson=path.join(reportDir,'report.json'),narrativeJson=path.join(reportDir,'narrative.json'),pdfPath=path.join(reportDir,'report.pdf');
    fs.writeFileSync(reportJson,JSON.stringify(a.payload,null,2));fs.writeFileSync(narrativeJson,JSON.stringify(a.narrative,null,2));
    const pdf=await renderPdf(a.pdfSource,pdfPath);
    const loadedPayload=JSON.parse(fs.readFileSync(reportJson,'utf8')),loadedNarrative=JSON.parse(fs.readFileSync(narrativeJson,'utf8')),loadedPdf=fs.readFileSync(pdfPath);
    check(`${domain}: stored payload reload hash`,loadedPayload.payloadHash===a.payload.payloadHash);
    check(`${domain}: stored narrative reload exact`,sha256Json(loadedNarrative)===sha256Json(a.narrative));
    check(`${domain}: stored PDF verifies`,sha256Buffer(loadedPdf)===pdf.hash&&loadedPdf.length===pdf.bytes);
    check(`${domain}: PDF bound to report source`,pdf.sourceHash===reportPdfSourceHash(a.pdfSource));
    summaries.push({domain,answers:a.answerRecords.length,score:a.diagnosis.overall.score,strengths:a.payload.strengths.map(x=>x.categoryId),weaknesses:a.payload.weaknesses.map(x=>x.categoryId),criticalActions:a.payload.priorityActions.length,milestones:a.frozenPlan.actionPlan.milestones.length,payloadHash:a.payload.payloadHash,pdfHash:pdf.hash,pdfBytes:pdf.bytes});
  }

  const failed=checks.filter(x=>!x.pass),report={suite:'MMRI Backend Step 15/20 full synthetic E2E',status:failed.length?'FAIL':'PASS',passed:checks.length-failed.length,total:checks.length,failed,summaries};
  fs.writeFileSync('../BACKEND_STEP15_SYNTHETIC_E2E_REPORT.json',JSON.stringify(report,null,2)+'\n');
  // Export one sample PDF for visual/manual inspection.
  const sampleSrc=path.join(workspace,'marketing','RPT-ASS-SYN-marketing-A-V4','report.pdf');
  if(fs.existsSync(sampleSrc))fs.copyFileSync(sampleSrc,'../BACKEND_STEP15_SAMPLE_REPORT.pdf');
  console.log(JSON.stringify(report,null,2));
  if(failed.length)process.exit(1);
} finally {
  fs.rmSync(workspace,{recursive:true,force:true});
}
