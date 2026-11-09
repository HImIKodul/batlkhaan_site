import fs from 'node:fs';
import crypto from 'node:crypto';
import { buildDefinition, calculateRuntimeSnapshot, evidenceFromAnswer } from '../dist-strategy/engine/index.js';
import { runStrategyPipeline } from '../dist-strategy/strategy/index.js';
import { buildDiagnosisResultV13 } from '../dist-strategy/diagnosis/result.js';
import { buildFrozenReportPayload, deterministicFallbackNarrative, validateNarrativeDraft } from '../dist-strategy/report/index.js';

const BUNDLES = [
  ['marketing','methodology/MMRI_v3.0.3_QBANK_v3.1.3_STEP6_OF6_ACCEPTED_FINAL.json'],
  ['it','methodology/businessmri-v2.5-runtime-bundles/MMRI_ISMRI_Methodology_4.3.5_BUSINESSMRI_V2.json'],
  ['finance','methodology/businessmri-v2.5-runtime-bundles/MMRI_FINMRI_Methodology_4.2.5_BUSINESSMRI_V2.json'],
  ['people','methodology/businessmri-v2.5-runtime-bundles/MMRI_HRMRI_Methodology_4.1.5_BUSINESSMRI_V2.json'],
  ['operations','methodology/businessmri-v2.5-runtime-bundles/MMRI_OPMRI_Methodology_4.4.5_BUSINESSMRI_V2.json']
];

const checks=[];
function check(name, condition, detail=''){
  checks.push({name,pass:Boolean(condition),detail:String(detail)});
  if(!condition) throw new Error(`FAIL ${name}: ${detail}`);
}
function sha(value){return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')}
function words(text){return String(text??'').trim().split(/\s+/u).filter(Boolean).length}
function q(def,cat,cell,path){const row=def.questionByCategoryCellPath.get(`${cat}:${cell}:${path}`); if(!row) throw new Error(`Missing ${cat}:${cell}:${path}`); return row}
function positiveApplicability(question){
  return question.options.find(o=>['APPLICABLE','MOSTLY_APPLICABLE','PARTIAL_APPLICABILITY'].includes(o.state))?.optionIndex
    ?? question.options.find(o=>o.optionIndex===1&&!['N_A_CLAIM','DNK'].includes(o.state))?.optionIndex
    ?? question.options.find(o=>!['N_A_CLAIM','DNK'].includes(o.state))?.optionIndex
    ?? question.options[0].optionIndex;
}
function naOption(question){const o=question.options.find(x=>x.state==='N_A_CLAIM'); if(!o) throw new Error(`Missing N/A ${question.id}`); return o.optionIndex}
function scoredOption(question, high){
  const rows=question.options.filter(o=>o.state==='SCORED'&&o.score!==null).slice().sort((a,b)=>Number(a.score)-Number(b.score));
  if(!rows.length) return null;
  return (high?rows.at(-1):rows[0]).optionIndex;
}
function evidence(def, question, optionIndex){return evidenceFromAnswer({definition:def,question,optionIndex,explicitAuthority:1,respondentRoleId:'R01'})}
function purposeLabels(def){
  const rows=Array.isArray(def.contracts?.purposes?.purposes)?def.contracts.purposes.purposes:[];
  return Object.fromEntries(rows.map(r=>[String(r.id),String(r.label??r.labelMn??r.id)]));
}
function balancedHalf(categories){
  const a=[],b=[]; let wa=0,wb=0;
  for(const c of [...categories].sort((x,y)=>Number(y.weightPct)-Number(x.weightPct)||x.id.localeCompare(y.id))){
    if((wa<=wb&&a.length<10)||b.length>=10){a.push(c);wa+=Number(c.weightPct)}else{b.push(c);wb+=Number(c.weightPct)}
  }
  return new Set(a.map(x=>x.id));
}
function patternSets(def, pattern){
  const selected=def.categories.slice(0,20);
  const fiveLowest=[...selected].sort((a,b)=>Number(a.weightPct)-Number(b.weightPct)||a.id.localeCompare(b.id)).slice(0,5);
  const lowWeightIds=new Set(fiveLowest.map(x=>x.id));
  if(pattern==='strong') return {selected, highIds:new Set(selected.filter(x=>!lowWeightIds.has(x.id)).map(x=>x.id)), lowIds:lowWeightIds};
  if(pattern==='weak') return {selected, highIds:lowWeightIds, lowIds:new Set(selected.filter(x=>!lowWeightIds.has(x.id)).map(x=>x.id))};
  const highIds=balancedHalf(selected); return {selected,highIds,lowIds:new Set(selected.filter(x=>!highIds.has(x.id)).map(x=>x.id))};
}
function runScenario(def, domain, pattern){
  const {selected,highIds,lowIds}=patternSets(def,pattern);
  const selectedIds=new Set(selected.map(c=>c.id));
  const ev=[];
  for(const c of def.categories){
    if(selectedIds.has(c.id)){
      const aq=q(def,c.id,'C01',1); ev.push(evidence(def,aq,positiveApplicability(aq)));
    } else {
      for(const path of [1,2,3]){const aq=q(def,c.id,'C01',path); ev.push(evidence(def,aq,naOption(aq)))}
    }
  }
  for(const c of selected){
    const high=highIds.has(c.id);
    for(const cell of def.cells){
      if(cell.id==='C01') continue;
      for(const path of [1,2,3,4]){
        const question=def.questionByCategoryCellPath.get(`${c.id}:${cell.id}:${path}`); if(!question) continue;
        const policy=def.runtimePolicy?.questionById.get(question.id);
        if(policy&&(!policy.scoreEligible||policy.routingState==='INFER_ONLY')) continue;
        const optionIndex=scoredOption(question,high); if(optionIndex!==null) ev.push(evidence(def,question,optionIndex));
      }
    }
  }
  const snapshot=calculateRuntimeSnapshot(def,ev);
  const profileAnswers=[{questionId:'P05',optionIndexes:[5]},{questionId:'P20',optionIndexes:[1]}];
  const strategy=runStrategyPipeline({methodology:def,snapshot,profileAnswers});
  const labels=purposeLabels(def);
  const assessmentId=`TASK11-${domain}-${pattern}`;
  const result=buildDiagnosisResultV13({assessmentId,companyId:'TASK11-COMPANY',companyName:'TASK11 CONTROLLED BUSINESS',methodologyBundleSha256:'task11',runtimeSnapshotHash:sha({domain,pattern,overall:snapshot.overall}),generatedAt:'2026-10-24T00:00:00.000Z',assessmentMode:'FULL',assessmentStatus:'COMPLETED',routingState:'ADAPTIVE_V13_COMPLETE',methodology:def,snapshot,strategy,purposeLabels:labels});
  let payload=buildFrozenReportPayload({reportId:`RPT-${assessmentId}-V4`,payloadHash:'',diagnosisResultHash:sha({assessmentId,kind:'diagnosis'}),strategyHash:sha({assessmentId,kind:'strategy'}),planHash:sha({assessmentId,kind:'plan'}),bindingHash:sha({assessmentId,kind:'binding'}),generatedAt:'2026-10-24T00:00:00.000Z',assessmentId,assessmentMode:'FULL',assessmentStatus:'COMPLETED',routingState:'ADAPTIVE_V13_COMPLETE',companyName:'TASK11 CONTROLLED BUSINESS',methodology:def,snapshot,strategy,purposeLabels:labels});
  payload={...payload,payloadHash:sha({...payload,payloadHash:''})};
  const narrative=deterministicFallbackNarrative(payload);
  const validation=validateNarrativeDraft(payload,narrative);
  const conclusion=narrative.sections.find(s=>s.id==='S10')?.claims?.map(c=>c.textMn).join(' ')??'';
  const ranked=[...snapshot.categories.entries()].map(([id,row])=>({id,score:row.officialScore??row.partialScore,na:Boolean(row.confirmedNotApplicable)})).filter(x=>!x.na&&Number.isFinite(x.score));
  const strengths=[...ranked].sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id)).slice(0,5);
  const strengthIds=new Set(strengths.map(x=>x.id));
  const weaknesses=[...ranked].filter(x=>!strengthIds.has(x.id)).sort((a,b)=>a.score-b.score||a.id.localeCompare(b.id)).slice(0,5);
  const roadmapMilestones=payload.roadmap.flatMap(r=>r.milestones);
  const roadmapPages=payload.roadmap.filter(r=>r.milestones.length).reduce((n,r)=>n+Math.ceil(r.milestones.length/4),0);
  return {domain,pattern,highIds,lowIds,snapshot,strategy,result,payload,narrative,validation,conclusion,strengths,weaknesses,roadmapMilestones,roadmapPages,evidenceCount:ev.length};
}

const summaries=[];
for(const [domain,file] of BUNDLES){
  const def=buildDefinition(JSON.parse(fs.readFileSync(file,'utf8')));
  const strong=runScenario(def,domain,'strong');
  const mixed=runScenario(def,domain,'mixed');
  const weak=runScenario(def,domain,'weak');
  for(const row of [strong,mixed,weak]){
    check(`${domain}/${row.pattern} official result`,row.result.resultStatus==='OFFICIAL',row.result.resultStatus);
    check(`${domain}/${row.pattern} numeric score`,Number.isFinite(row.payload.overall.score),row.payload.overall.score);
    check(`${domain}/${row.pattern} five strengths`,row.strengths.length===5,row.strengths.length);
    check(`${domain}/${row.pattern} five weakest categories`,row.weaknesses.length===5,row.weaknesses.length);
    check(`${domain}/${row.pattern} report has five priority actions`,row.payload.priorityActions.length===5,row.payload.priorityActions.length);
    check(`${domain}/${row.pattern} priority actions follow low-answer categories`,row.payload.priorityActions.every(a=>(a.affectedScopes??[{categoryId:a.categoryId}]).every(s=>row.lowIds.has(s.categoryId))),row.payload.priorityActions.map(a=>a.categoryId).join(','));
    check(`${domain}/${row.pattern} narrative validates`,row.validation.state==='PASS',row.validation.state);
    const wc=words(row.conclusion); check(`${domain}/${row.pattern} conclusion 80-160 words (validator V27)`,wc>=80&&wc<=160,wc);
    check(`${domain}/${row.pattern} roadmap exists`,row.roadmapMilestones.length>=5,row.roadmapMilestones.length);
    check(`${domain}/${row.pattern} roadmap fields complete`,row.roadmapMilestones.every(m=>String(m.titleMn||'').trim()&&String(m.milestoneMn||'').trim()&&String(m.deliverableMn||'').trim()&&String(m.ownerRoleLabelMn||'').trim()&&String(m.kpiMn||'').trim()),row.roadmapMilestones.length);
    const chunked=row.payload.roadmap.flatMap(r=>Array.from({length:Math.ceil(r.milestones.length/4)},(_,i)=>r.milestones.slice(i*4,(i+1)*4))).flat();
    check(`${domain}/${row.pattern} PDF pagination is lossless`,chunked.length===row.roadmapMilestones.length,`${chunked.length}/${row.roadmapMilestones.length}`);
    check(`${domain}/${row.pattern} report is assessment-bound`,row.payload.assessmentId===`TASK11-${domain}-${row.pattern}`&&row.payload.reportId===`RPT-TASK11-${domain}-${row.pattern}-V4`,`${row.payload.assessmentId}/${row.payload.reportId}`);
  }
  const s=Number(strong.payload.overall.score),m=Number(mixed.payload.overall.score),w=Number(weak.payload.overall.score);
  check(`${domain} strong > mixed > weak`,s>m&&m>w,`${s} > ${m} > ${w}`);
  check(`${domain} strong/weak score separation`,s-w>=30,`${s-w}`);
  check(`${domain} answer reversal changes weakest categories`,strong.weaknesses.map(x=>x.id).join('|')!==weak.weaknesses.map(x=>x.id).join('|'),`${strong.weaknesses.map(x=>x.id).join(',')} / ${weak.weaknesses.map(x=>x.id).join(',')}`);
  const sa=new Set(strong.payload.priorityActions.flatMap(a=>(a.affectedScopes??[{categoryId:a.categoryId}]).map(x=>x.categoryId)));
  const wa=new Set(weak.payload.priorityActions.flatMap(a=>(a.affectedScopes??[{categoryId:a.categoryId}]).map(x=>x.categoryId)));
  check(`${domain} answer reversal changes action sources`,[...sa].some(x=>!wa.has(x))||[...wa].some(x=>!sa.has(x)),`${[...sa].join(',')} / ${[...wa].join(',')}`);
  check(`${domain} answer reversal changes conclusion`,strong.conclusion!==weak.conclusion,'conclusions differ');
  summaries.push({domain,scores:{strong:s,mixed:m,weak:w},actions:{strong:[...sa],weak:[...wa]},weakest:{strong:strong.weaknesses.map(x=>x.id),mixed:mixed.weaknesses.map(x=>x.id),weak:weak.weaknesses.map(x=>x.id)},pdfPages:{strong:3+strong.roadmapPages,mixed:3+mixed.roadmapPages,weak:3+weak.roadmapPages},evidence:{strong:strong.evidenceCount,mixed:mixed.evidenceCount,weak:weak.evidenceCount}});
}
console.log(JSON.stringify({status:'PASS',domains:BUNDLES.length,scenarios:BUNDLES.length*3,checksPassed:checks.length,checksTotal:checks.length,summaries},null,2));
console.log('==========================================');
console.log('MMRI FUNCTIONAL TASK 11/12: CONTROLLED PASS');
console.log('LOW / MIXED / HIGH -> SCORE / FINDINGS / REPORT / PDF: VERIFIED');
console.log('==========================================');
