import fs from 'node:fs';
import {
  buildDefinition,
  calculateRuntimeSnapshot,
  evidenceFromAnswer,
  routeNextQuestion,
  rankAdaptiveV13Questions
} from '../dist-strategy/engine/index.js';

const bundle = JSON.parse(fs.readFileSync('methodology/MMRI_v3.0.0_FINAL_CANDIDATE.json', 'utf8'));
const def = buildDefinition(bundle);
const checks = [];
const check = (name, pass, detail='') => {
  checks.push({name, pass: Boolean(pass), detail});
  if (!pass) console.error('FAIL', name, detail);
};

const gates = new Map(def.categories.map((c,i)=>[`${c.id}:CAPABILITY_RELEVANT`, i===0 ? 'TRUE' : 'FALSE']));
const q = id => {
  const item = def.questionById.get(id);
  if (!item) throw new Error(`Missing question ${id}`);
  return item;
};
const scoredIndex = (question, mode='mid') => {
  const opts = question.options.filter(o=>o.score!==null && o.state==='SCORED');
  if (!opts.length) throw new Error(`No scored option for ${question.id}`);
  if (mode==='low') return opts[0].optionIndex;
  if (mode==='high') return opts[opts.length-1].optionIndex;
  return opts[Math.floor((opts.length-1)/2)].optionIndex;
};
const dnkIndex = question => {
  const o = question.options.find(x=>x.state==='DNK');
  if (!o) throw new Error(`No DNK option for ${question.id}`);
  return o.optionIndex;
};
const ev = (questionId, optionIndex, authority=.9) => evidenceFromAnswer({
  definition:def, question:q(questionId), optionIndex, explicitAuthority:authority
});
const stateFor = (evidence, cellId='C02') => calculateRuntimeSnapshot(def,evidence).cells.get(`MS01:${cellId}`);
const inputFor = (evidence, asked) => {
  const snapshot = calculateRuntimeSnapshot(def,evidence);
  return {mode:'QUICK', snapshot, evidence, askedQuestionIds:new Set(asked), profileAnswers:[], diagnosticQuestionCount:evidence.length, relevantCapabilityCount:1, applicabilityByGate:gates};
};
const satisfyCritical = (cellId) => {
  const d = Number(cellId.slice(1));
  const q1=`MMRI-C01-D${String(d).padStart(2,'0')}-Q1`;
  const q2=`MMRI-C01-D${String(d).padStart(2,'0')}-Q2`;
  return [ev(q1,scoredIndex(q(q1))),ev(q2,scoredIndex(q(q2)))];
};

const criticalCfg=bundle.contracts['MMRI_FINAL_Adaptive_Routing_Contract.json'].quick.criticalDirectConfidence;
check('critical cells are C02/C16/C41', JSON.stringify(criticalCfg.cells)==='["C02","C16","C41"]', JSON.stringify(criticalCfg.cells));
check('screening gate requires >=2 direct answers', Number(criticalCfg.minimumDirectAnswers)===2, String(criticalCfg.minimumDirectAnswers));
check('screening gate confidence floor is 0.60', Number(criticalCfg.confidenceFloor)===0.60, String(criticalCfg.confidenceFloor));

// 1) A derived estimate must not suppress C02 Q1.
{
  const c16q1=q('MMRI-C01-D16-Q1');
  const evidence=[ev(c16q1.id,scoredIndex(c16q1))];
  const input=inputFor(evidence,[c16q1.id]);
  const c02=input.snapshot.cells.get('MS01:C02');
  check('C16 evidence produces a derived C02 estimate for the test', c02?.effectiveScore!==null && c02?.directAnswerCount===0, JSON.stringify({effectiveScore:c02?.effectiveScore,direct:c02?.directAnswerCount}));
  const ranked=rankAdaptiveV13Questions(def,input);
  const pos=ranked.findIndex(x=>x.question.id==='MMRI-C01-D02-Q1');
  const firstNonCritical=ranked.findIndex(x=>!['C02','C16','C41'].includes(x.question.cellId));
  check('derived-only C02 still has Q1 eligible', pos>=0, `position=${pos}`);
  check('derived-only C02 Q1 is prioritized before noncritical work', pos>=0 && (firstNonCritical<0 || pos<firstNonCritical), `C02=${pos}, noncritical=${firstNonCritical}`);
}

// Pre-satisfy C16/C41 so C02 is the only critical repair in the following tests.
const otherCritical=[...satisfyCritical('C16'),...satisfyCritical('C41')];
const otherAsked=otherCritical.map(x=>x.questionId);

// 2) Q1 DNK must route to Q2, not stop on an indirect estimate.
{
  const q1=q('MMRI-C01-D02-Q1');
  const evidence=[...otherCritical,ev(q1.id,dnkIndex(q1))];
  const asked=[...otherAsked,q1.id];
  const decision=routeNextQuestion(def,inputFor(evidence,asked));
  check('C02 Q1 DNK triggers C02 Q2', decision.nextQuestion?.question.id==='MMRI-C01-D02-Q2', decision.nextQuestion?.question.id??decision.stopReason??'none');
}

// 3) One scored answer after a DNK is still insufficient; Q3 must be asked.
{
  const q1=q('MMRI-C01-D02-Q1'), q2=q('MMRI-C01-D02-Q2');
  const evidence=[...otherCritical,ev(q1.id,dnkIndex(q1)),ev(q2.id,scoredIndex(q2))];
  const asked=[...otherAsked,q1.id,q2.id];
  const s=stateFor(evidence);
  const decision=routeNextQuestion(def,inputFor(evidence,asked));
  check('one scored C02 answer remains below screening gate', s.directAnswerCount===1 && s.directConfidence<0.60, JSON.stringify({count:s.directAnswerCount,confidence:s.directConfidence}));
  check('low-confidence C02 routes to Q3', decision.nextQuestion?.question.id==='MMRI-C01-D02-Q3', decision.nextQuestion?.question.id??decision.stopReason??'none');
}

// 4) Two coherent scored answers clear the screening gate; Q3 is not forced.
{
  const q1=q('MMRI-C01-D02-Q1'), q2=q('MMRI-C01-D02-Q2');
  const evidence=[...otherCritical,ev(q1.id,scoredIndex(q1)),ev(q2.id,scoredIndex(q2))];
  const asked=[...otherAsked,q1.id,q2.id];
  const s=stateFor(evidence);
  const ranked=rankAdaptiveV13Questions(def,inputFor(evidence,asked));
  check('two coherent C02 answers meet screening direct confidence', s.directAnswerCount>=2 && s.directConfidence>=0.60 && !s.hasHardContradiction, JSON.stringify({count:s.directAnswerCount,confidence:s.directConfidence,hard:s.hasHardContradiction}));
  check('C02 Q3 is not asked when screening gate is satisfied', !ranked.some(x=>x.question.id==='MMRI-C01-D02-Q3'), 'Q3 should be absent');
}

// 5) A hard contradiction must promote Q3 even though two direct answers exist.
{
  const q1=q('MMRI-C01-D02-Q1'), q2=q('MMRI-C01-D02-Q2');
  const evidence=[...otherCritical,ev(q1.id,scoredIndex(q1,'low')),ev(q2.id,scoredIndex(q2,'high'))];
  const asked=[...otherAsked,q1.id,q2.id];
  const s=stateFor(evidence);
  const decision=routeNextQuestion(def,inputFor(evidence,asked));
  check('opposite C02 answers create hard contradiction', s.hasHardContradiction===true, JSON.stringify({dispersion:s.scoreDispersion,hard:s.hasHardContradiction,confidence:s.directConfidence}));
  check('hard contradiction triggers C02 Q3', decision.nextQuestion?.question.id==='MMRI-C01-D02-Q3', decision.nextQuestion?.question.id??decision.stopReason??'none');
}

// 6) Four DNK paths exhaust the critical cell and leave it unresolved instead of inventing a score.
{
  const ids=[1,2,3,4].map(i=>`MMRI-C01-D02-Q${i}`);
  const evidence=[...otherCritical,...ids.map(id=>ev(id,dnkIndex(q(id))))];
  const asked=[...otherAsked,...ids];
  const s=stateFor(evidence);
  const ranked=rankAdaptiveV13Questions(def,inputFor(evidence,asked));
  check('four C02 DNKs create no direct score', s.directScore===null && s.directAnswerCount===0, JSON.stringify({directScore:s.directScore,effectiveScore:s.effectiveScore,count:s.directAnswerCount,status:s.status}));
  check('four C02 DNKs may retain only capped derived estimate', s.exhausted && s.status==='DERIVED_PROVISIONAL' && s.confidenceState==='ESTIMATED' && s.effectiveConfidence<=Number(def.contracts.confidence.derived.cap??0.45), JSON.stringify({exhausted:s.exhausted,status:s.status,confidenceState:s.confidenceState,effectiveConfidence:s.effectiveConfidence}));
  check('exhausted C02 has no fifth direct question', !ranked.some(x=>x.question.cellId==='C02'), ranked.filter(x=>x.question.cellId==='C02').map(x=>x.question.id).join(','));
}

const result={suite:'MMRI Step 1/3 adaptive-confidence targeted acceptance',methodologyVersion:def.version,total:checks.length,passed:checks.filter(x=>x.pass).length,failed:checks.filter(x=>!x.pass).length,checks};
fs.writeFileSync('methodology/STEP1_OF_3_ADAPTIVE_CONFIDENCE_ACCEPTANCE.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({status:result.failed?'FAIL':'PASS',passed:result.passed,failed:result.failed},null,2));
if(result.failed) process.exit(1);
