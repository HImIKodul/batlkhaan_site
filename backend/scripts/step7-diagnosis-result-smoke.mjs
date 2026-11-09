import fs from 'node:fs';
import crypto from 'node:crypto';
import { buildDefinition } from '../dist-strategy/engine/definition.js';
import { calculateAggregateSnapshots } from '../dist-strategy/engine/scoring.js';
import { runStrategyPipeline } from '../dist-strategy/strategy/index.js';
import { buildDiagnosisResultV13 } from '../dist-strategy/diagnosis/index.js';

const bundle=JSON.parse(fs.readFileSync('methodology/MMRI_v3.0.3_QBANK_v3.1.3_STEP6_OF6_ACCEPTED_FINAL.json','utf8'));
const def=buildDefinition(bundle);
const checks=[];
const check=(name,pass,detail='')=>{checks.push({name,pass:Boolean(pass),detail});if(!pass)throw new Error(`FAIL ${name}: ${detail}`)};
function cellSnapshot(categoryId,cellId,score=75,status='DIRECT_FINAL',conf=.9,confidenceState='LOCKED'){
  return {categoryId,cellId,status,directScore:score,directConfidence:conf,derivedScore:null,derivedConfidence:0,effectiveScore:score,effectiveConfidence:conf,directAnswerCount:2,independentSourceKinds:2,maxAcceptedAuthority:.9,naClaimCount:0,naClaimConfidence:0,applicabilityRelevance:1,hasHardContradiction:false,hasSameCellVariance:false,hasSecondaryTension:false,hardContradictionRuleIds:[],tensionRuleIds:[],directEvidence:[],derivedContributions:[],exhausted:false,confidenceState,locked:confidenceState==='LOCKED',lockReason:confidenceState==='LOCKED'?'TEST':null,scoreDispersion:0,clusterSize:2,evidenceCount:2};
}
const cells=new Map();
const scoreByCategory=new Map(def.categories.map((c,i)=>[c.id,45+((i*13)%50)]));
for(const category of def.categories){
  for(const cell of def.cells){
    if(cell.id==='C01') cells.set(`${category.id}:${cell.id}`,cellSnapshot(category.id,cell.id,null,'GATHERING',0,'UNASSESSED'));
    else cells.set(`${category.id}:${cell.id}`,cellSnapshot(category.id,cell.id,scoreByCategory.get(category.id)));
  }
}
// Force explicit weak/review/unknown/N-A cases.
for(const [cid,cellId,score] of [['MS01','C03',18],['MS01','C04',28],['MS02','C05',35]]) cells.set(`${cid}:${cellId}`,cellSnapshot(cid,cellId,score));
const review=cellSnapshot('MS03','C05',42,'REVIEW_REQUIRED',.75,'VALIDATED');review.hasHardContradiction=true;review.hardContradictionRuleIds=['H01'];cells.set('MS03:C05',review);
cells.set('MS04:C07',cellSnapshot('MS04','C07',null,'UNRESOLVED',0,'UNKNOWN'));
cells.set('MS05:C24',cellSnapshot('MS05','C24',null,'NOT_APPLICABLE',0,'NOT_APPLICABLE'));
const agg=calculateAggregateSnapshots(def,cells);
const contradictions=[{ruleId:'H01',type:'HARD',flag:'TEST',categoryId:'MS03',affectedCellIds:['C05'],reason:'fixture'}];
const snapshot={cells,contradictions,...agg};
const strategy=runStrategyPipeline({methodology:def,snapshot,profileAnswers:[{questionId:'P20',optionIndexes:[2]}]});
const labels={P1:'Ашиг',P2:'Орлого',P3:'Брэндийн үнэ цэнэ',P4:'Хэрэглэгчийн тоо',P5:'Зах зээлийн эзлэх хувь'};
let result=buildDiagnosisResultV13({assessmentId:'ASS-STEP7',companyId:'CO-1',companyName:'Step7 Co',methodologyBundleSha256:'bundle-sha',runtimeSnapshotHash:'snapshot-sha',generatedAt:'2026-09-09T04:20:00.000Z',assessmentMode:'FULL',assessmentStatus:'COMPLETED',routingState:'FULL_COMPLETE',methodology:def,snapshot,strategy,purposeLabels:labels});
const hash=crypto.createHash('sha256').update(JSON.stringify({...result,resultHash:''})).digest('hex'); result={...result,resultHash:hash};
check('schema version',result.schemaVersion==='MMRI-DIAGNOSIS-RESULT-1.0');
check('result hash populated',result.resultHash.length===64,result.resultHash);
check('assessment identity',result.assessmentId==='ASS-STEP7');
check('methodology hash carried',result.methodologyBundleSha256==='bundle-sha');
check('runtime snapshot hash carried',result.trace.runtimeSnapshotHash==='snapshot-sha');
check('incomplete FULL result is partial terminal',result.metricType==='PARTIAL_TERMINAL',result.metricType);
check('exactly 8 modules',result.modules.length===8,String(result.modules.length));
check('exactly 64 capabilities',result.capabilities.length===64,String(result.capabilities.length));
check('exactly 3072 cells summarized',result.evidence.totalCells===3072,String(result.evidence.totalCells));
check('five business outcomes',result.businessOutcomes.length===5,String(result.businessOutcomes.length));
check('five business priority objects',result.businessOutcomePriorities.length===5,String(result.businessOutcomePriorities.length));
check('weak cell count available',result.evidence.weakCellCount>0,String(result.evidence.weakCellCount));
check('weak display bounded to 20',result.evidence.weakCells.length<=20,String(result.evidence.weakCells.length));
check('weak cells below threshold',result.evidence.weakCells.every(x=>x.score<strategy.rootCause.weaknessThreshold));
check('review-required surfaced',result.evidence.reviewRequiredCells>=1,String(result.evidence.reviewRequiredCells));
check('contradiction surfaced',result.quality.hardContradictions===1,String(result.quality.hardContradictions));
check('N/A surfaced separately',result.evidence.notApplicableCells>=1,String(result.evidence.notApplicableCells));
check('unknown surfaced separately',result.evidence.unknownCells>=1,String(result.evidence.unknownCells));
check('root causes selected',Array.isArray(result.rootCauses.selected));
check('validated strengths are evidence-qualified; others are flagged relative-rank',result.strengths.items.every(x=>x.basis==='VALIDATED'?(x.score>=80&&x.confidence>=.8&&x.coverage>=.7):x.basis==='RELATIVE_RANK'));
check('strength display bounded',result.strengths.items.length<=20,String(result.strengths.items.length));
check('compat categories alias',result.categories===result.capabilities);
check('compat purposes alias',result.purposes===result.businessOutcomes);
check('compat outcome alias',result.outcomePriorities===result.businessOutcomePriorities);
check('open contradictions alias',result.openContradictions===result.quality.openContradictions);
check('causal lift forbidden',result.outcomeGuardrail.causalFinancialLiftClaimAllowed===false);
check('ROI prediction forbidden',result.outcomeGuardrail.roiPredictionAllowed===false);
check('aggregation lineage retained',result.trace.versions.aggregation===snapshot.overall.aggregationVersion);
check('outcome version retained',result.trace.versions.outcomePriority==='OUTCOME_PRIORITY_V13');
check('AI generation cannot alter source hash',result.trace.methodologyBundleSha256===result.methodologyBundleSha256);
const summary={suite:'MMRI Step 7 canonical diagnosis result',total:checks.length,passed:checks.filter(x=>x.pass).length,failed:checks.filter(x=>!x.pass).length,checks};
fs.writeFileSync('methodology/STEP7_DIAGNOSIS_RESULT_SMOKE.json',JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify({total:summary.total,passed:summary.passed,failed:summary.failed,modules:result.modules.length,capabilities:result.capabilities.length,cells:result.evidence.totalCells},null,2));
if(summary.failed)process.exit(1);
