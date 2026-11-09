import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawn} from 'node:child_process';
import { buildReportPdfSource, reportPdfSourceHash, assertPdfBuffer, sha256Buffer, MMRI_PDF_GENERATOR_VERSION } from '../dist-strategy/report/pdf-artifact.js';
import { sha256Json } from '../dist-strategy/lib/hash.js';
const checks=[];const check=(name,pass,detail='')=>{checks.push({name,pass:Boolean(pass),detail:String(detail)});if(!pass)throw new Error(`FAIL ${name}: ${detail}`)};
const H=x=>x.repeat(64);
const strengths=Array.from({length:5},(_,i)=>({id:`STR-C${i+1}`,categoryId:`C${i+1}`,nameMn:`Хүчтэй чадавх ${i+1}`,score:90-i,confidence:.9,coverage:.95,sourceTraceIds:[`category:C${i+1}`,`strength:STR-C${i+1}`]}));
const weaknesses=Array.from({length:5},(_,i)=>({id:`WEAK-W${i+1}`,categoryId:`W${i+1}`,nameMn:`Сул чадавх ${i+1}`,score:35+i,confidence:.9,coverage:.95,severity:.4,sourceTraceIds:[`category:W${i+1}`,`weakness:WEAK-W${i+1}`]}));
const actions=Array.from({length:5},(_,i)=>({id:`REC-${i+1}`,findingId:`ROOT-${i+1}`,categoryId:`W${i+1}`,cellId:'C02',type:'EXECUTION',interventionCode:`INT-${i+1}`,titleMn:`Нэн тэргүүний ажил ${i+1}`,objectiveMn:'Зорилго',actionMn:`Хийх ажил ${i+1}`,deliverableMn:`Гарц ${i+1}`,kpiMn:`Хэмжүүр ${i+1}`,ownerRoleId:'R01',sponsorRoleId:'R01',currentCellScore:40,targetCellScore:75,effort:1,impact:1,urgency:1,evidenceReadiness:1,dependencyReadiness:1,priority:90-i,components:{},sourceTraceIds:[`recommendation:REC-${i+1}`,`root:ROOT-${i+1}`]}));
let payload={payloadVersion:'MMRI-REPORT-PAYLOAD-1.3',payloadHash:'',diagnosisResultHash:H('d'),strategyHash:H('s'),planHash:H('p'),bindingHash:H('b'),reportId:'RPT-ASS-test-V4',reportContractVersion:'1.0',findingsPolicyVersion:'MMRI-REPORT-FINDINGS-1.0-FIVE-CATEGORY',traceVersion:'MMRI-TRACE-1.0',versionBundleId:'bundle-1',versionBundleHash:H('v'),sourceSnapshotId:'snap-1',sourceSnapshotHash:H('n'),assessmentId:'ASS-test',assessmentMode:'FULL',assessmentStatus:'COMPLETED',routingState:'FULL_COMPLETE',generatedAt:'2026-10-25T00:00:00.000Z',companyName:'Бодит компани ХХК',methodologyVersion:'3.0.4',metricType:'OFFICIAL_OVERALL_SCORE',overall:{score:67,confidence:.91,coverage:.94,band:'Дунд түвшин'},purposes:[],strengths,weaknesses,rootFindings:[],priorityActions:actions,evidenceActions:[],roadmap:[{horizon:'H0',nameMn:'Эхний 14 хоног',dayStart:0,dayEnd:14,milestones:actions.slice(0,2).map((a,i)=>({milestoneId:`MS-${i+1}`,recommendationId:a.id,titleMn:a.titleMn,milestoneMn:`Үе шат ${i+1}`,deliverableMn:a.deliverableMn,ownerRoleId:'R01',ownerRoleLabelMn:'Хариуцсан удирдлага',kpiMn:a.kpiMn,sourceTraceIds:[`milestone:MS-${i+1}`,`recommendation:${a.id}`]}))}],risks:[],remeasurement:{horizon:'H2',labelMn:'Дахин хэмжилт'},requiredWarnings:[],displayDictionary:{R01:'Хариуцсан удирдлага'},traceIndex:{},versions:{methodology:'3.0.4',scoring:'1',confidence:'1',rootCause:'1',recommendation:'1',actionPlan:'1',report:'1',aiGeneration:'1'}};
payload.payloadHash=sha256Json({...payload,payloadHash:''});
const narrative={schemaVersion:'MMRI-NARRATIVE-DRAFT-1.0',payloadHash:payload.payloadHash,sections:[{id:'S04',titleMn:'Давуу тал',claims:strengths.map((s,i)=>({reportClaimId:`S4-${i}`,claimType:'STRENGTH',textMn:`${s.nameMn} тогтвортой байна.`,sourceTraceIds:s.sourceTraceIds}))},{id:'S05',titleMn:'Сул тал',claims:weaknesses.map((w,i)=>({reportClaimId:`S5-${i}`,claimType:'WEAKNESS',textMn:`${w.nameMn} бэхжүүлэх шаардлагатай.`,sourceTraceIds:w.sourceTraceIds}))},{id:'S06',titleMn:'Ажил',claims:actions.map((a,i)=>({reportClaimId:`S6-${i}`,claimType:'RECOMMENDATION',textMn:`${a.titleMn}. ${a.actionMn}.`,sourceTraceIds:a.sourceTraceIds,recommendationId:a.id}))},{id:'S10',titleMn:'Ерөнхий дүгнэлт',claims:[{reportClaimId:'S10-1',claimType:'RECOMMENDATION',textMn:'Байгууллагын үндсэн ажиллагаа тогтвортой боловч хэмжилт, хариуцлага, хэрэгжилтийн сахилга батыг бэхжүүлэх шаардлагатай байна.',sourceTraceIds:['assessment:ASS-test'],recommendationId:'REC-1'}]}]};
const source=buildReportPdfSource(payload,narrative),source2=buildReportPdfSource(structuredClone(payload),structuredClone(narrative));check('canonical source deterministic',reportPdfSourceHash(source)===reportPdfSourceHash(source2));check('source carries payload hash',source.payloadHash===payload.payloadHash);check('source carries narrative hash',source.narrativeHash===sha256Json(narrative));check('source has five strengths/weaknesses/actions',source.strengths.length===5&&source.weaknesses.length===5&&source.criticalActions.length===5);check('source has roadmap lineage',source.roadmap.flatMap(r=>r.milestones).every(m=>m.milestoneId&&m.recommendationId));const changed={...source,conclusionMn:source.conclusionMn+' Өөр.'};check('source hash changes when narrative changes',reportPdfSourceHash(changed)!==reportPdfSourceHash(source));
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'mmri-pdf-'));
const pageCount=buf=>(buf.toString('latin1').match(/\/Type\s*\/Page\b/g)||[]).length;
async function run(domain,out){
  const input=path.join(tmp,`${domain}.json`);
  fs.writeFileSync(input,JSON.stringify({...source,render:{domainCode:domain}}),'utf8');
  await new Promise((resolve,reject)=>{const py=process.env.MMRI_PDF_PYTHON_PATH||'python3',renderer=path.resolve('pdf_renderer/render_report_pdf.py'),p=spawn(py,[renderer,'--input',input,'--output',out],{stdio:['ignore','pipe','pipe']});let err='';p.stderr.on('data',d=>err+=String(d));p.on('error',reject);p.on('exit',c=>c===0?resolve():reject(new Error(`renderer ${c}: ${err}`)))})
}
const domains=['marketing','it','finance','people','operations'];
const rendered=[];
for(const domain of domains){
  const a=path.join(tmp,`${domain}-a.pdf`),b=path.join(tmp,`${domain}-b.pdf`);
  await run(domain,a);await run(domain,b);
  const ba=fs.readFileSync(a),bb=fs.readFileSync(b);assertPdfBuffer(ba);assertPdfBuffer(bb);
  check(`${domain} PDF deterministic`,sha256Buffer(ba)===sha256Buffer(bb),`${sha256Buffer(ba)} ${sha256Buffer(bb)}`);
  check(`${domain} PDF exactly three pages`,pageCount(ba)===3,pageCount(ba));
  check(`${domain} PDF reasonable size`,ba.length>10000,ba.length);
  rendered.push({domain,path:a,hash:sha256Buffer(ba),bytes:ba.length,pages:pageCount(ba)});
}
check('ReportLab generator version',MMRI_PDF_GENERATOR_VERSION==='MMRI-PDF-1.5-BUSINESS-REPORT');
check('five domain render accents affect binary',new Set(rendered.map(x=>x.hash)).size===5,rendered.map(x=>x.hash).join(' '));
const sample=path.resolve('../STEP12_BACKEND_SAMPLE_REPORT.pdf');fs.copyFileSync(rendered[0].path,sample);
fs.rmSync(tmp,{recursive:true,force:true});
console.log(JSON.stringify({status:'PASS',checksPassed:checks.length,checksTotal:checks.length,samplePdf:sample,sampleBytes:rendered[0].bytes,sourceHash:reportPdfSourceHash(source),contentHash:rendered[0].hash,domains:rendered.map(({domain,hash,bytes,pages})=>({domain,hash,bytes,pages}))},null,2));
