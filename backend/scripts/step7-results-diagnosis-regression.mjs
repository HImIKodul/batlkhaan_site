import fs from 'node:fs';
import path from 'node:path';
import { buildDefinition } from '../dist-strategy/engine/definition.js';
import { calculateAggregateSnapshots } from '../dist-strategy/engine/scoring.js';
import { runStrategyPipeline } from '../dist-strategy/strategy/index.js';
import { buildDiagnosisResultV13 } from '../dist-strategy/diagnosis/index.js';
import { buildFrozenReportPayload } from '../dist-strategy/report/payload.js';
import { deterministicFallbackNarrative } from '../dist-strategy/report/fallback-renderer.js';
import { validateNarrativeDraft } from '../dist-strategy/report/validator.js';

const bundlePath=path.resolve(process.cwd(),'methodology/MMRI_v3.0.3_QBANK_v3.1.3_STEP6_OF6_ACCEPTED_FINAL.json');
const bundle=JSON.parse(fs.readFileSync(bundlePath,'utf8'));
const def=buildDefinition(bundle);
const labels={P1:'Ашиг',P2:'Орлого',P3:'Брэндийн үнэ цэнэ',P4:'Хэрэглэгчийн тоо',P5:'Зах зээлийн эзлэх хувь'};
const checks=[];
const check=(name,pass,detail='')=>checks.push({name,pass:Boolean(pass),detail:String(detail??'')});

function cellSnapshot(categoryId,cellId,{score=85,conf=.9,status='DIRECT_FINAL',confidenceState='LOCKED',hard=false}={}){
  const hasScore=score!==null;
  return {categoryId,cellId,status,directScore:hasScore?score:null,directConfidence:hasScore?conf:0,derivedScore:null,derivedConfidence:0,effectiveScore:hasScore?score:null,effectiveConfidence:hasScore?conf:0,directAnswerCount:hasScore?3:0,independentSourceKinds:hasScore?3:0,maxAcceptedAuthority:hasScore?.95:0,naClaimCount:0,naClaimConfidence:0,applicabilityRelevance:1,hasHardContradiction:hard,hasSameCellVariance:false,hasSecondaryTension:false,hardContradictionRuleIds:hard?['H-TEST']:[],tensionRuleIds:[],directEvidence:[],derivedContributions:[],exhausted:false,confidenceState,locked:confidenceState==='LOCKED',lockReason:confidenceState==='LOCKED'?'TEST':null,scoreDispersion:0,clusterSize:hasScore?3:0,evidenceCount:hasScore?3:0};
}
function buildScenario({kind}){
  const cells=new Map();
  for(const category of def.categories){
    for(const cell of def.cells){
      const key=`${category.id}:${cell.id}`;
      if(cell.id==='C01'){ cells.set(key,cellSnapshot(category.id,cell.id,{score:null,conf:0,status:'GATHERING',confidenceState:'UNASSESSED'})); continue; }
      if(cell.id==='C42'){ cells.set(key,cellSnapshot(category.id,cell.id,{score:null,conf:0,status:'DIRECT_PROVISIONAL',confidenceState:'ESTIMATED'})); continue; }
      if(kind==='quick') cells.set(key,cellSnapshot(category.id,cell.id,{score:55,conf:.28,status:'DIRECT_PROVISIONAL',confidenceState:'ESTIMATED'}));
      else cells.set(key,cellSnapshot(category.id,cell.id,{score:88,conf:.9,status:'DIRECT_FINAL',confidenceState:'LOCKED'}));
    }
  }
  // One stable weak point for all scenarios.
  const weakKey='MS01:C03';
  if(kind==='quick') cells.set(weakKey,cellSnapshot('MS01','C03',{score:25,conf:.28,status:'DIRECT_PROVISIONAL',confidenceState:'ESTIMATED'}));
  else cells.set(weakKey,cellSnapshot('MS01','C03',{score:25,conf:.9,status:'DIRECT_FINAL',confidenceState:'LOCKED'}));
  const contradictions=[];
  if(kind==='review'){
    const reviewKey='MS02:C41';
    cells.set(reviewKey,cellSnapshot('MS02','C41',{score:40,conf:.72,status:'REVIEW_REQUIRED',confidenceState:'VALIDATED',hard:true}));
    contradictions.push({ruleId:'H-TEST',type:'HARD',flag:'TEST',categoryId:'MS02',affectedCellIds:['C41'],reason:'synthetic review conflict'});
  }
  if(kind==='partial') cells.set('MS03:C18',cellSnapshot('MS03','C18',{score:null,conf:0,status:'UNRESOLVED',confidenceState:'UNKNOWN'}));
  const agg=calculateAggregateSnapshots(def,cells);
  const snapshot={cells,contradictions,...agg};
  const strategy=runStrategyPipeline({methodology:def,snapshot,profileAnswers:[{questionId:'P20',optionIndexes:[2]}]});
  return {snapshot,strategy};
}
function diagnose(kind,mode,status,routingState){
  const {snapshot,strategy}=buildScenario({kind});
  const result=buildDiagnosisResultV13({assessmentId:`ASS-${kind}`,companyId:'CO-1',companyName:'Synthetic Co',methodologyBundleSha256:'bundle-sha',runtimeSnapshotHash:`snap-${kind}`,generatedAt:'2026-09-11T04:30:00.000Z',assessmentMode:mode,assessmentStatus:status,routingState,methodology:def,snapshot,strategy,purposeLabels:labels});
  const report=buildFrozenReportPayload({reportId:`RPT-${kind}`,payloadHash:`hash-${kind}`,diagnosisResultHash:`diag-${kind}`,strategyHash:`strategy-${kind}`,planHash:`plan-${kind}`,bindingHash:`binding-${kind}`,generatedAt:'2026-09-11T04:30:00.000Z',assessmentId:`ASS-${kind}`,assessmentMode:mode,assessmentStatus:status,routingState,companyName:'Synthetic Co',methodology:def,snapshot,strategy,purposeLabels:labels});
  const draft=deterministicFallbackNarrative(report);
  const validation=validateNarrativeDraft(report,draft);
  return {result,report,draft,validation,snapshot,strategy};
}

const quick=diagnose('quick','QUICK','COMPLETED','QUICK_COMPLETE');
const official=diagnose('official','FULL','COMPLETED','FULL_COMPLETE');
const review=diagnose('review','FULL','COMPLETED_WITH_REVIEW','FULL_COMPLETE_WITH_REVIEW');
const partial=diagnose('partial','FULL','EXHAUSTED','FULL_EVIDENCE_INCOMPLETE');

check('QUICK metric is estimate',quick.result.metricType==='QUICK_ESTIMATE',quick.result.metricType);
check('QUICK result status estimate',quick.result.resultStatus==='QUICK_ESTIMATE',quick.result.resultStatus);
check('QUICK overall never official',quick.result.overall.isOfficial===false,quick.result.overall.isOfficial);
check('QUICK weak evidence stays provisional',quick.result.evidence.weakCells.length===0&&quick.result.evidence.provisionalWeakCells.length>0,`${quick.result.evidence.weakCells.length}/${quick.result.evidence.provisionalWeakCells.length}`);
check('QUICK warning explicitly non-official',quick.result.quality.warnings.some(x=>x.includes('албан ёсны бүрэн оноо биш')));
check('QUICK warning separates coverage and confidence',quick.result.quality.warnings.some(x=>x.includes('хамралт 100%-д хүрсэн')));
check('QUICK quality flag',quick.result.quality.quickEstimate===true&&quick.result.quality.officialResultAvailable===false);
check('QUICK report metric estimate',quick.report.metricType==='QUICK_ESTIMATE',quick.report.metricType);
check('QUICK fallback validates',quick.validation.state==='PASS',JSON.stringify(quick.validation.issues));

check('clean FULL is official',official.result.metricType==='OFFICIAL_OVERALL_SCORE'&&official.result.resultStatus==='OFFICIAL');
check('clean FULL overall official flag',official.result.overall.isOfficial===true);
check('clean FULL quality official',official.result.quality.officialResultAvailable===true&&!official.result.quality.requiresReview);
check('clean FULL has validated weakness',official.result.evidence.validatedWeakCellCount>0&&official.result.evidence.weakCells.length>0,official.result.evidence.validatedWeakCellCount);
check('clean FULL weak not provisional for locked cell',!official.result.evidence.provisionalWeakCells.some(x=>x.capabilityId==='MS01'&&x.cellId==='C03'));
check('clean FULL five business outcomes',official.result.businessOutcomes.length===5,official.result.businessOutcomes.length);
check('clean FULL outcome guardrail',official.result.outcomeGuardrail.causalFinancialLiftClaimAllowed===false&&official.result.outcomeGuardrail.roiPredictionAllowed===false);
check('clean FULL report official',official.report.metricType==='OFFICIAL_OVERALL_SCORE',official.report.metricType);
check('clean FULL fallback validates',official.validation.state==='PASS',JSON.stringify(official.validation.issues));

check('review result not official metric',review.result.metricType==='REVIEW_REQUIRED_SCORE',review.result.metricType);
check('review result status explicit',review.result.resultStatus==='REVIEW_REQUIRED',review.result.resultStatus);
check('review overall isOfficial false',review.result.overall.isOfficial===false,review.result.overall.isOfficial);
check('review keeps numeric score',review.result.overall.score!==null,review.result.overall.score);
check('review quality requires review',review.result.quality.requiresReview===true&&review.result.quality.officialResultAvailable===false);
check('review warning forbids official interpretation',review.result.quality.warnings.some(x=>x.includes('баталгаажсан эцсийн үр дүн гэж ангилахгүй')));
check('review hard contradiction surfaced',review.result.quality.hardContradictions===1,review.result.quality.hardContradictions);
check('review conflicted weak is provisional',review.result.evidence.provisionalWeakCells.some(x=>x.capabilityId==='MS02'&&x.cellId==='C41'));
check('review conflicted weak not validated',!review.result.evidence.weakCells.some(x=>x.capabilityId==='MS02'&&x.cellId==='C41'));
check('review category excluded from strengths',!review.result.strengths.items.some(x=>x.capabilityId==='MS02'));
check('review report metric explicit',review.report.metricType==='REVIEW_REQUIRED_SCORE',review.report.metricType);
check('review report warning required',review.report.requiredWarnings.some(x=>x.includes('нягтлах шаардлагатай төлөвтэй')));
check('review fallback validates',review.validation.state==='PASS',JSON.stringify(review.validation.issues));
check('review fallback never calls official',!review.draft.sections.flatMap(s=>s.claims).some(c=>/Албан ёсны нийт оноо/.test(c.textMn)));

check('partial exhausted stays partial terminal',partial.result.metricType==='PARTIAL_TERMINAL'&&partial.result.resultStatus==='PARTIAL_TERMINAL');
check('partial not official',partial.result.overall.isOfficial===false&&partial.result.quality.officialResultAvailable===false);
check('partial incomplete coverage warning',partial.result.quality.incompleteCoverage===true&&partial.result.quality.warnings.some(x=>x.includes('хамрах хүрээ 100%-д хүрээгүй')));
check('partial report has no official metric',partial.report.metricType==='NONE',partial.report.metricType);
check('partial fallback validates',partial.validation.state==='PASS',JSON.stringify(partial.validation.issues));

for(const [name,x] of [['quick',quick],['official',official],['review',review],['partial',partial]]){
  check(`${name} five outcomes`,x.result.businessOutcomes.length===5,x.result.businessOutcomes.length);
  check(`${name} root causes are hypotheses not causal lift`,x.result.outcomeGuardrail.causalFinancialLiftClaimAllowed===false);
  check(`${name} score bounded`,x.result.overall.score===null||(x.result.overall.score>=0&&x.result.overall.score<=100),x.result.overall.score);
  check(`${name} coverage bounded`,x.result.overall.coverage===null||(x.result.overall.coverage>=0&&x.result.overall.coverage<=1),x.result.overall.coverage);
  check(`${name} confidence bounded`,x.result.overall.confidence===null||(x.result.overall.confidence>=0&&x.result.overall.confidence<=1),x.result.overall.confidence);
}

const failed=checks.filter(x=>!x.pass);
const summary={schema:'mmri.step07_of15.results_diagnosis.v1',status:failed.length?'FAIL':'PASS',checksPassed:checks.length-failed.length,checksTotal:checks.length,failures:failed,scenarios:{quick:{metricType:quick.result.metricType,resultStatus:quick.result.resultStatus,score:quick.result.overall.score,confidence:quick.result.overall.confidence,validatedWeak:quick.result.evidence.validatedWeakCellCount,provisionalWeak:quick.result.evidence.provisionalWeakCellCount},official:{metricType:official.result.metricType,resultStatus:official.result.resultStatus,score:official.result.overall.score,confidence:official.result.overall.confidence,validatedWeak:official.result.evidence.validatedWeakCellCount,provisionalWeak:official.result.evidence.provisionalWeakCellCount},review:{metricType:review.result.metricType,resultStatus:review.result.resultStatus,score:review.result.overall.score,confidence:review.result.overall.confidence,reviewRequired:review.result.quality.reviewRequiredCells,hardContradictions:review.result.quality.hardContradictions},partial:{metricType:partial.result.metricType,resultStatus:partial.result.resultStatus,score:partial.result.overall.score,coverage:partial.result.overall.coverage}},checks};
fs.writeFileSync('STEP07_RESULTS_DIAGNOSIS_REGRESSION.json',JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify({status:summary.status,passed:summary.checksPassed,total:summary.checksTotal,failures:summary.failures,scenarios:summary.scenarios},null,2));
if(failed.length)process.exit(1);
