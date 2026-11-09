import fs from 'node:fs';
import crypto from 'node:crypto';
import { buildDefinition } from '../dist-strategy/engine/definition.js';
import { runStrategyPipeline, calculatePlanProgress, selectRecommendationActions } from '../dist-strategy/strategy/index.js';
import { buildFrozenReportPayload, deterministicFallbackNarrative, validateNarrativeDraft } from '../dist-strategy/report/index.js';

const bundle=JSON.parse(fs.readFileSync(new URL('../methodology/MMRI_v3.0.3_QBANK_v3.1.3_STEP6_OF6_ACCEPTED_FINAL.json',import.meta.url),'utf8'));
const methodology=buildDefinition(bundle);
const cells=new Map();
const categories=new Map();
const purposes=new Map();
const contradictions=[];

function cellSnapshot(categoryId,cellId,score=75,status='DIRECT_FINAL',conf=.90){
  return {
    categoryId,cellId,status,directScore:score,directConfidence:conf,derivedScore:null,derivedConfidence:0,
    effectiveScore:score,effectiveConfidence:conf,directAnswerCount:3,independentSourceKinds:3,maxAcceptedAuthority:.9,
    naClaimCount:0,naClaimConfidence:0,applicabilityRelevance:1,hasHardContradiction:false,hasSameCellVariance:false,
    hasSecondaryTension:false,hardContradictionRuleIds:[],tensionRuleIds:[],directEvidence:[],derivedContributions:[],exhausted:false
  };
}
for(const c of methodology.categories){
  categories.set(c.id,{categoryId:c.id,confirmedNotApplicable:false,partialScore:75,officialScore:75,confidence:.90,coverage:1,applicableCellCount:47,finalizedCellCount:47,unresolvedCellCount:0,reviewRequiredCellCount:0});
  for(const ct of methodology.cells) cells.set(`${c.id}:${ct.id}`,cellSnapshot(c.id,ct.id,ct.id==='C01'?100:75));
}
// Create a meaningful weak causal chain MS01 -> MS02 and C03 -> C04 -> C05.
categories.set('MS01',{...categories.get('MS01'),partialScore:32,officialScore:32,confidence:.94,coverage:1});
categories.set('MS02',{...categories.get('MS02'),partialScore:38,officialScore:38,confidence:.92,coverage:.98});
categories.set('MS03',{...categories.get('MS03'),partialScore:48,officialScore:48,confidence:.88,coverage:.95});
for(const [id,score] of [['C03',18],['C04',28],['C05',36]]) cells.set(`MS01:${id}`,cellSnapshot('MS01',id,score,'DIRECT_FINAL',.95));
for(const [id,score] of [['C03',30],['C04',39]]) cells.set(`MS02:${id}`,cellSnapshot('MS02',id,score,'DIRECT_FINAL',.91));
// Hard contradiction should force evidence-resolution action.
const contrad=cellSnapshot('MS03','C05',42,'REVIEW_REQUIRED',.82); contrad.hasHardContradiction=true; contrad.hardContradictionRuleIds=['H01']; cells.set('MS03:C05',contrad);
contradictions.push({ruleId:'H01',type:'HARD',flag:'TEST_HARD',categoryId:'MS03',affectedCellIds:['C05'],reason:'Regression fixture'});
// Evidence gap should produce a collect-evidence path.
cells.set('MS04:C07',{...cellSnapshot('MS04','C07',null,'UNRESOLVED',0),directScore:null,effectiveScore:null,directAnswerCount:0,independentSourceKinds:0,exhausted:true});

for(const id of ['P1','P2','P3','P4','P5']) purposes.set(id,{purposeId:id,partialScore:70,officialScore:70,confidence:.88,coverage:.96});
const snapshot={cells,categories,contradictions,overall:{partialScore:68.4,officialScore:68.4,confidence:.89,coverage:.97,applicableCategoryCount:64,completeCategoryCount:64},purposes};
const profileAnswers=[{questionId:'P05',optionIndexes:[3]},{questionId:'P20',optionIndexes:[2]}];
const strategy=runStrategyPipeline({methodology,snapshot,profileAnswers});

const results=[];
function check(name,ok,detail=''){ results.push({name,status:ok?'PASS':'FAIL',detail}); if(!ok) console.error('FAIL',name,detail); }
check('root contract version',strategy.rootCause.version==='MMRI-ROOT-CAUSE-1.0',strategy.rootCause.version);
check('root findings generated',strategy.rootCause.findings.length>0,String(strategy.rootCause.findings.length));
check('MS01 C03 has causal support',strategy.rootCause.findings.some(f=>f.categoryId==='MS01'&&f.cellId==='C03'&&f.cellRootScore>0),'');
check('root selection <= contract max',strategy.rootCause.selectedFindings.length<=5,String(strategy.rootCause.selectedFindings.length));
check('recommendation contract version',strategy.recommendations.version==='MMRI-RECOMMENDATION-1.0',strategy.recommendations.version);
check('execution action cap <=5',strategy.recommendations.executionActions.length<=5,String(strategy.recommendations.executionActions.length));
const reportActionSelection=selectRecommendationActions(strategy.recommendations,5,2);
check('report evidence action cap <=2',reportActionSelection.evidenceActions.length<=2,String(reportActionSelection.evidenceActions.length));
check('report critical action cap <=5',reportActionSelection.criticalActions.length<=5,String(reportActionSelection.criticalActions.length));
check('selected purpose is P2',strategy.recommendations.selectedPurposeId==='P2',String(strategy.recommendations.selectedPurposeId));
check('capacity uses P05 option',strategy.recommendations.capacityLevel===3,String(strategy.recommendations.capacityLevel));
check('all priorities bounded',strategy.recommendations.candidates.every(r=>r.priority>=0&&r.priority<=100),'');
check('all execution actions are contract templates',strategy.recommendations.executionActions.every(r=>methodology.contracts.recommendation.composition.cellInterventions.some(x=>x.cell===r.cellId&&x.code===r.interventionCode)),'');
check('hard contradiction yields resolution candidate',strategy.recommendations.candidates.some(r=>r.categoryId==='MS03'&&r.cellId==='C05'&&r.type==='RESOLVE_EVIDENCE'),'');
check('evidence gap yields collection candidate',strategy.recommendations.candidates.some(r=>r.categoryId==='MS04'&&r.cellId==='C07'&&r.type==='COLLECT_EVIDENCE'),'');
check('action plan contract version',strategy.actionPlan.version==='MMRI-ACTION-PLAN-1.0',strategy.actionPlan.version);
check('action plan 365 days',strategy.actionPlan.windowDays===365,String(strategy.actionPlan.windowDays));
check('action plan has five horizons',strategy.actionPlan.horizons.length===5,String(strategy.actionPlan.horizons.length));
check('milestone IDs unique',new Set(strategy.actionPlan.milestones.map(m=>m.id)).size===strategy.actionPlan.milestones.length,'');
check('required milestone plans exist',strategy.actionPlan.milestones.some(m=>m.requirement==='Required'),'');
check('remeasurement starts H2',strategy.actionPlan.remeasurementHorizons[0]==='H2',String(strategy.actionPlan.remeasurementHorizons[0]));
const progress=calculatePlanProgress(strategy.actionPlan,'H2');
check('plan progress bounded',progress.planProgress>=0&&progress.planProgress<=1,String(progress.planProgress));

const purposeLabels={P1:'Ашиг',P2:'Орлого',P3:'Брэндийн үнэ цэнэ',P4:'Хэрэглэгч',P5:'Зах зээлийн эзлэх хувь'};
const fullStrategyHash='strategy-hash', fullPlanHash='plan-hash', fullBindingHash='binding-hash';
let payload=buildFrozenReportPayload({reportId:'RPT-TEST',payloadHash:'PENDING',diagnosisResultHash:'diag-hash',strategyHash:fullStrategyHash,planHash:fullPlanHash,bindingHash:fullBindingHash,generatedAt:'2026-09-08T01:00:00.000Z',assessmentId:'ASS-TEST',assessmentMode:'FULL',assessmentStatus:'COMPLETED',routingState:'FULL_COMPLETE',companyName:'Regression Co',methodology,snapshot,strategy,purposeLabels});
const canonical=JSON.stringify({...payload,payloadHash:''});
const hash=crypto.createHash('sha256').update(canonical).digest('hex');
payload={...payload,payloadHash:hash};
check('report contract version',payload.reportContractVersion==='MMRI-REPORT-1.0',payload.reportContractVersion);
check('FULL complete uses official metric',payload.metricType==='OFFICIAL_OVERALL_SCORE',payload.metricType);
check('exactly five purposes',payload.purposes.length===5,String(payload.purposes.length));
// Accepted report contract (MMRI_DESIGN_SYSTEM_HANDOFF.md, REPORT_CATEGORY_FINDING_LIMIT=5 in src/report/payload.ts): exactly five strengths and
// five weaknesses, topped up from real capability scores (basis RELATIVE_RANK) when too few meet the evidence thresholds. The older "<=3" cap was superseded.
check('exactly five strengths (accepted contract)',payload.strengths.length===5,String(payload.strengths.length));
check('exactly five weaknesses (accepted contract)',payload.weaknesses.length===5,String(payload.weaknesses.length));
check('strengths and weaknesses never share a capability',payload.strengths.every(a=>!payload.weaknesses.some(b=>b.categoryId===a.categoryId)),'');
check('every strength and weakness is traceable',[...payload.strengths,...payload.weaknesses].every(x=>Array.isArray(x.sourceTraceIds)&&x.sourceTraceIds.length>0),'');
check('every strength/weakness capability has a real score',[...payload.strengths,...payload.weaknesses].every(x=>typeof x.score==='number'&&x.score>=0&&x.score<=100),'');
check('narrative strength/weakness sections carry exactly five claims',(()=>{const d=deterministicFallbackNarrative(payload);return d.sections.find(x=>x.id==='S04')?.claims.length===5&&d.sections.find(x=>x.id==='S05')?.claims.length===5})(),'');
check('root report cap <=3',payload.rootFindings.length<=3,String(payload.rootFindings.length));
check('roadmap has five horizon rows',payload.roadmap.length===5,String(payload.roadmap.length));
check('report trace index populated',Object.keys(payload.traceIndex).length>0,String(Object.keys(payload.traceIndex).length));
const draft=deterministicFallbackNarrative(payload);
const validation=validateNarrativeDraft(payload,draft);
check('deterministic fallback validates',validation.state==='PASS',JSON.stringify(validation.issues));

const quickStrategyHash='strategy-qhash', quickPlanHash='plan-qhash', quickBindingHash='binding-qhash';
const quickPayload=buildFrozenReportPayload({reportId:'RPT-Q',payloadHash:'qhash',diagnosisResultHash:'diag-qhash',strategyHash:quickStrategyHash,planHash:quickPlanHash,bindingHash:quickBindingHash,generatedAt:'2026-09-08T01:00:00.000Z',assessmentId:'ASS-Q',assessmentMode:'QUICK',assessmentStatus:'COMPLETED',routingState:'QUICK_COMPLETE',companyName:'Quick Co',methodology,snapshot:{...snapshot,overall:{...snapshot.overall,officialScore:null}},strategy,purposeLabels});
check('QUICK uses estimate label',quickPayload.metricType==='QUICK_ESTIMATE',quickPayload.metricType);
check('QUICK warning required',quickPayload.requiredWarnings.some(w=>/түргэвчилсэн үнэлгээ/i.test(w)),'');
const badDraft=deterministicFallbackNarrative({...quickPayload,payloadHash:'qhash'}); badDraft.sections.find(s=>s.id==='S02').claims[0].textMn+=' Албан ёсны final score.';
const badValidation=validateNarrativeDraft({...quickPayload,payloadHash:'qhash'},badDraft);
check('QUICK official mislabel is blocked',badValidation.state==='GENERATION_BLOCKED',JSON.stringify(badValidation.issues));

const summary={suite:'MMRI strategy/report contract regression',version:'1.3.0',total:results.length,passed:results.filter(x=>x.status==='PASS').length,failed:results.filter(x=>x.status==='FAIL').length,results};
fs.writeFileSync(new URL('../methodology/STRATEGY_REPORT_REGRESSION.json',import.meta.url),JSON.stringify(summary,null,2));
console.log(JSON.stringify({total:summary.total,passed:summary.passed,failed:summary.failed,rootFindings:strategy.rootCause.findings.length,candidates:strategy.recommendations.candidates.length,milestones:strategy.actionPlan.milestones.length,reportValidation:validation.state},null,2));
if(summary.failed) process.exit(1);
