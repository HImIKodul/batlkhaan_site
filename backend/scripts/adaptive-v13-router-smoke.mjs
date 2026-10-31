import fs from 'node:fs';
import {
  buildDefinition,
  calculateRuntimeSnapshot,
  evidenceFromAnswer,
  questionBudgetTarget,
  routeNextQuestion,
  softQuestionCap
} from '../dist-engine/engine/index.js';

const bundle = JSON.parse(fs.readFileSync('methodology/MMRI_v1.0.1_Normalized_Import_Bundle.json','utf8'));
const def = buildDefinition(bundle);
function qid(categoryId, cellId, path) {
  const q = def.questionByCategoryCellPath.get(`${categoryId}:${cellId}:${path}`);
  if (!q) throw new Error(`Missing question ${categoryId}:${cellId}:${path}`);
  return q.id;
}

const checks = [];
function ok(condition, name, detail='') {
  checks.push({name, pass:Boolean(condition), detail});
  if (!condition) throw new Error(`FAIL ${name}: ${detail}`);
}
function answer(qid, optionIndex) {
  const q = def.questionById.get(qid);
  if (!q) throw new Error(`Missing ${qid}`);
  return evidenceFromAnswer({definition:def, question:q, optionIndex, explicitAuthority:.9});
}
function qPolicy(qid, askStage, priority, extras={}) {
  return {
    questionId: qid,
    questionRole: askStage === 'PROFILE_SCREEN' ? 'ROUTING_IMPORTANCE' : askStage === 'PRIMARY_GAP_FILL' ? 'PRIMARY' : askStage,
    scoreEligible: askStage !== 'PROFILE_SCREEN',
    scoringMethod: askStage === 'PROFILE_SCREEN' ? 'CONTEXT_ONLY' : 'NORMALIZED_0_100',
    scoredOptionCount: askStage === 'PROFILE_SCREEN' ? 0 : 4,
    scorePatternCode: askStage === 'PROFILE_SCREEN' ? 'NS' : 'S4',
    directAskAllowed: true,
    routingState: 'DIRECT_ALLOWED',
    askStage,
    selectionPriority: priority,
    isAnchor: false,
    applicabilityGateKey: 'CAPABILITY_RELEVANT',
    triggerRuleId: `TR_${askStage}`,
    confidenceRuleId: askStage === 'PROFILE_SCREEN' ? 'CF_ROUTING' : 'CF_Q1',
    defaultAsk: false,
    stopRuleId: `ST_${askStage}`,
    ...extras
  };
}
const qPolicies = new Map([
  [qid('MS01','C01',1), qPolicy(qid('MS01','C01',1),'PROFILE_SCREEN',10)],
  [qid('MS01','C01',2), qPolicy(qid('MS01','C01',2),'PROFILE_SCREEN',11)],
  [qid('MS01','C01',3), qPolicy(qid('MS01','C01',3),'PROFILE_SCREEN',12)],
  [qid('MS01','C01',4), qPolicy(qid('MS01','C01',4),'PROFILE_SCREEN',13)],
  [qid('MS01','C02',1), qPolicy(qid('MS01','C02',1),'PRIMARY_GAP_FILL',30)],
  [qid('MS01','C02',2), qPolicy(qid('MS01','C02',2),'CONFIRM',40)],
  [qid('MS01','C02',3), qPolicy(qid('MS01','C02',3),'CONFLICT',50)],
  [qid('MS01','C02',4), qPolicy(qid('MS01','C02',4),'FALLBACK',60)],
]);
const cellPolicy = (categoryId, cellId, extra={}) => ({
  categoryId, cellId,
  applicabilityMode:'STANDARD',
  applicabilityGateKey:'CAPABILITY_RELEVANT',
  isAnchorCell:false,
  directAskableQuestions:4,
  maxDirectQuestions:4,
  indirectConfidenceCap:.55,
  primaryConfidenceFloor:.75,
  lockThreshold:.90,
  conflictGapThreshold:25,
  stateModelId:'SM_STANDARD',
  valueRuleId:'VR_DIRECT',
  ...extra
});
def.runtimePolicy = {
  enabled:true,
  questionById:qPolicies,
  cellByCategoryCell:new Map([
    ['MS01:C01',cellPolicy('MS01','C01')],
    ['MS01:C02',cellPolicy('MS01','C02')]
  ]),
  ruleById:new Map(),
  scorePatternByCode:new Map()
};

let evidence=[];
let snapshot=calculateRuntimeSnapshot(def,evidence);
let decision=routeNextQuestion(def,{mode:'QUICK',snapshot,evidence,askedQuestionIds:new Set(),diagnosticQuestionCount:0,relevantCapabilityCount:12});
ok(decision.state === 'ADAPTIVE_V13_RUNNING','v13 policy activates automatically',decision.state);
ok(decision.nextQuestion?.question.id === qid('MS01','C01',1),'unresolved relevance asks D01/profile screen first',decision.nextQuestion?.question.id);

evidence=[answer(qid('MS01','C01',1),4)];
snapshot=calculateRuntimeSnapshot(def,evidence);
decision=routeNextQuestion(def,{mode:'QUICK',snapshot,evidence,askedQuestionIds:new Set([qid('MS01','C01',1)]),diagnosticQuestionCount:1,relevantCapabilityCount:12});
ok(decision.nextQuestion?.question.id === qid('MS01','C02',1),'resolved capability advances to PRIMARY',decision.nextQuestion?.question.id);

evidence=[answer(qid('MS01','C01',1),4),answer(qid('MS01','C02',1),4)];
snapshot=calculateRuntimeSnapshot(def,evidence);
decision=routeNextQuestion(def,{mode:'QUICK',snapshot,evidence,askedQuestionIds:new Set(evidence.map(x=>x.questionId)),diagnosticQuestionCount:2,relevantCapabilityCount:12});
ok(decision.nextQuestion?.question.id === qid('MS01','C02',2),'one direct score routes to CONFIRM',decision.nextQuestion?.question.id);

evidence=[answer(qid('MS01','C01',1),4),answer(qid('MS01','C02',1),1),answer(qid('MS01','C02',2),4)];
snapshot=calculateRuntimeSnapshot(def,evidence);
decision=routeNextQuestion(def,{mode:'QUICK',snapshot,evidence,askedQuestionIds:new Set(evidence.map(x=>x.questionId)),diagnosticQuestionCount:3,relevantCapabilityCount:12});
ok(decision.nextQuestion?.question.id === qid('MS01','C02',3),'contradictory direct evidence routes to CONFLICT',decision.nextQuestion?.question.id);

qPolicies.set(qid('MS01','C02',3),{...qPolicies.get(qid('MS01','C02',3)),directAskAllowed:false,routingState:'INFER_ONLY',askStage:'NEVER_DIRECT'});
decision=routeNextQuestion(def,{mode:'QUICK',snapshot,evidence,askedQuestionIds:new Set(evidence.map(x=>x.questionId)),diagnosticQuestionCount:3,relevantCapabilityCount:12});
ok(decision.nextQuestion?.question.id !== qid('MS01','C02',3),'INFER_ONLY / directAskAllowed=false is never routed',decision.nextQuestion?.question.id);

ok(questionBudgetTarget(12)===180,'12-capability budget is 180');
ok(questionBudgetTarget(20)===244,'20-capability budget is 244');
ok(questionBudgetTarget(25)===280,'25-capability budget is 280');
ok(questionBudgetTarget(30)===314,'30-capability budget is 314');
ok(softQuestionCap(12)===216,'12-capability soft cap reserves bounded confidence-repair headroom');
ok(softQuestionCap(25)===355,'25-capability soft cap reserves bounded confidence-repair headroom');
ok(softQuestionCap(30)===404,'30-capability soft cap reserves bounded confidence-repair headroom');

console.log(JSON.stringify({status:'PASS',checks:checks.length,results:checks},null,2));
