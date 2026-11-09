import fs from 'node:fs';
import {
  buildDefinition,
  calculateRuntimeSnapshot,
  evidenceFromAnswer
} from '../dist-engine/engine/index.js';

const bundle=JSON.parse(fs.readFileSync('methodology/MMRI_v3.0.3_QBANK_v3.1.3_STEP6_OF6_ACCEPTED_FINAL.json','utf8'));
const def=buildDefinition(bundle);

const qPolicies=new Map();
for(const q of def.questions){
  const isRouting=q.cellId==='C01';
  qPolicies.set(q.id,{
    questionId:q.id,
    questionRole:isRouting ? ['ROUTING_IMPORTANCE','ROUTING_RISK','ROUTING_RESOURCE','ROUTING_RECENCY'][q.path-1] : ['PRIMARY','CONFIRM','CONFLICT','FALLBACK'][q.path-1],
    scoreEligible:!isRouting,
    scoringMethod:isRouting?'CONTEXT_ONLY':'NORMALIZED_0_100',
    scoredOptionCount:isRouting?0:q.options.filter(o=>o.score!==null).length,
    scorePatternCode:isRouting?'NS':'TEST',
    directAskAllowed:true,
    routingState:'DIRECT_ALLOWED',
    askStage:isRouting?'PROFILE_SCREEN':['PRIMARY_GAP_FILL','CONFIRM','CONFLICT','FALLBACK'][q.path-1],
    selectionPriority:isRouting?9+q.path:20+q.path*10,
    isAnchor:false,
    applicabilityGateKey:'CAPABILITY_RELEVANT',
    triggerRuleId:'TEST',confidenceRuleId:'TEST',defaultAsk:false,stopRuleId:'TEST'
  });
}
const cellPolicies=new Map();
for(const category of def.categories){
  for(const cell of def.cells){
    cellPolicies.set(`${category.id}:${cell.id}`,{
      categoryId:category.id,cellId:cell.id,
      applicabilityMode:['C24','C25','C26','C31','C35','C43','C45','C46'].includes(cell.id)?'CONDITIONAL':'STANDARD',
      applicabilityGateKey:'CAPABILITY_RELEVANT',isAnchorCell:false,directAskableQuestions:4,maxDirectQuestions:4,
      indirectConfidenceCap:.55,primaryConfidenceFloor:.75,lockThreshold:.90,conflictGapThreshold:25,
      stateModelId:'SM_STANDARD',valueRuleId:'VR_DIRECT'
    });
  }
}
def.runtimePolicy={enabled:true,questionById:qPolicies,cellByCategoryCell:cellPolicies,ruleById:new Map(),scorePatternByCode:new Map()};

const checks=[];
const ok=(condition,name,detail='')=>{checks.push({name,pass:Boolean(condition),detail});if(!condition)throw new Error(`FAIL ${name}: ${detail}`)};
const ev=(qid,opt)=>{
  const q=def.questionById.get(qid); if(!q)throw new Error(`Missing ${qid}`);
  return evidenceFromAnswer({definition:def,question:q,optionIndex:opt,explicitAuthority:.9});
};
const cell=(snapshot,c='MS01',d='C02')=>snapshot.cells.get(`${c}:${d}`);

let snapshot=calculateRuntimeSnapshot(def,[]);
ok(snapshot.cells.size===3072,'full 3,072-cell matrix recalculated',String(snapshot.cells.size));
ok(cell(snapshot).confidenceState==='UNASSESSED','unanswered cell is UNASSESSED',cell(snapshot).confidenceState);

snapshot=calculateRuntimeSnapshot(def,[ev('Q-MS01-C02-1',2)]);
ok(cell(snapshot).confidenceState==='VALIDATED','one PRIMARY => VALIDATED',cell(snapshot).confidenceState);
ok(Math.abs(cell(snapshot).effectiveConfidence-.75)<1e-9,'one PRIMARY confidence floor .75',String(cell(snapshot).effectiveConfidence));
ok(cell(snapshot).locked===false,'one PRIMARY is not locked');

snapshot=calculateRuntimeSnapshot(def,[ev('Q-MS01-C02-1',2),ev('Q-MS01-C02-2',2)]);
ok(cell(snapshot).confidenceState==='LOCKED','consistent PRIMARY+CONFIRM => LOCKED',cell(snapshot).confidenceState);
ok(Math.abs(cell(snapshot).effectiveConfidence-.90)<1e-9,'locked confidence .90',String(cell(snapshot).effectiveConfidence));
ok(cell(snapshot).lockReason==='PRIMARY_CONFIRM_WITHIN_THRESHOLD','confirmation lock reason',cell(snapshot).lockReason);

snapshot=calculateRuntimeSnapshot(def,[ev('Q-MS01-C02-1',1),ev('Q-MS01-C02-2',4)]);
ok(cell(snapshot).confidenceState==='VALIDATED','conflicting pair remains VALIDATED',cell(snapshot).confidenceState);
ok(cell(snapshot).status==='REVIEW_REQUIRED','conflicting pair requires review',cell(snapshot).status);
ok(cell(snapshot).hasSameCellVariance===true,'>25 score gap raises variance');
ok(cell(snapshot).locked===false,'conflicting pair is not falsely locked');

snapshot=calculateRuntimeSnapshot(def,[ev('Q-MS01-C02-1',1),ev('Q-MS01-C02-2',4),ev('Q-MS01-C02-3',1)]);
ok(cell(snapshot).confidenceState==='LOCKED','Q3 2-of-3 cluster locks',cell(snapshot).confidenceState);
ok(cell(snapshot).lockReason==='Q3_2_OF_3_CLUSTER','Q3 cluster lock reason',cell(snapshot).lockReason);
ok(cell(snapshot).effectiveScore===0,'Q3 robust median selects cluster center',String(cell(snapshot).effectiveScore));

snapshot=calculateRuntimeSnapshot(def,[ev('Q-MS01-C02-1',1),ev('Q-MS01-C02-2',4),ev('Q-MS01-C02-3',3),ev('Q-MS01-C02-4',4)]);
ok(cell(snapshot).confidenceState==='LOCKED','Q4 3-of-4 cluster locks',cell(snapshot).confidenceState);
ok(cell(snapshot).lockReason==='Q4_3_OF_4_CLUSTER','Q4 cluster lock reason',cell(snapshot).lockReason);

snapshot=calculateRuntimeSnapshot(def,[ev('Q-MS01-C02-1',1),ev('Q-MS01-C02-2',1),ev('Q-MS01-C02-3',4),ev('Q-MS01-C02-4',4)]);
ok(cell(snapshot).confidenceState==='VALIDATED','unresolved Q4 remains VALIDATED',cell(snapshot).confidenceState);
ok(cell(snapshot).status==='REVIEW_REQUIRED','unresolved Q4 remains review-required',cell(snapshot).status);
ok(cell(snapshot).locked===false,'unresolved Q4 never falsely locks');

const dnk=def.questionById.get('Q-MS01-C02-1').options.at(-1).optionIndex;
snapshot=calculateRuntimeSnapshot(def,[ev('Q-MS01-C02-1',dnk)]);
ok(cell(snapshot).confidenceState==='UNKNOWN','DNK produces UNKNOWN state',cell(snapshot).confidenceState);
ok(cell(snapshot).effectiveScore===null,'DNK never becomes zero');

const condQ=def.questionById.get('Q-MS01-C24-1');
const na=condQ.options.find(o=>o.state==='N_A_CLAIM');
if(na){
  snapshot=calculateRuntimeSnapshot(def,[ev(condQ.id,na.optionIndex)]);
  ok(cell(snapshot,'MS01','C24').confidenceState==='NOT_APPLICABLE','conditional N/A becomes NOT_APPLICABLE',cell(snapshot,'MS01','C24').confidenceState);
  ok(cell(snapshot,'MS01','C24').effectiveScore===null,'N/A never scores zero');
}

snapshot=calculateRuntimeSnapshot(def,[ev('Q-MS01-C01-1',4)]);
ok(cell(snapshot,'MS01','C01').effectiveScore===null,'D01 never contributes maturity score');
ok(cell(snapshot,'MS01','C01').effectiveConfidence===0,'D01 never raises maturity confidence');
ok(cell(snapshot,'MS01','C01').applicabilityRelevance!==null,'D01 substantive answer resolves routing relevance');

const edge=def.secondaryEdges.find(e=>e.sourceCellId!=='C01'&&e.targetCellId!=='C01');
if(edge){
  const q=def.questionByCategoryCellPath.get(`MS01:${edge.sourceCellId}:1`);
  const scoredOpt=q?.options.find(o=>o.score!==null);
  if(q&&scoredOpt){
    snapshot=calculateRuntimeSnapshot(def,[ev(q.id,scoredOpt.optionIndex)]);
    const target=cell(snapshot,'MS01',edge.targetCellId);
    if(target.directScore===null && target.derivedScore!==null){
      ok(target.confidenceState==='ESTIMATED','indirect-only cell is ESTIMATED',target.confidenceState);
      ok(target.effectiveConfidence<=.55+1e-9,'indirect confidence is capped at .55',String(target.effectiveConfidence));
    }
  }
}

const result={status:'PASS',checks:checks.length,results:checks};
fs.writeFileSync('methodology/STEP4_LIVE_CELL_SMOKE.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
