import fs from 'node:fs';
import { buildDefinition, evidenceFromAnswer, calculateRuntimeSnapshot, routeNextQuestion, calculateProfileRelevance } from '../dist-engine/engine/index.js';

const bundle = JSON.parse(fs.readFileSync('methodology/MMRI_v3.0.4_QBANK_v3.1.4_FINAL_61440_REPAIRED.json','utf8'));
const def = buildDefinition(bundle);
function qid(categoryId, cellId, path) {
  const q = def.questionByCategoryCellPath.get(`${categoryId}:${cellId}:${path}`);
  if (!q) throw new Error(`Missing question ${categoryId}:${cellId}:${path}`);
  return q.id;
}
let passed = 0;
const checks = [];
function ok(cond, name, detail='') {
  checks.push({name, pass:!!cond, detail});
  if (!cond) throw new Error(`FAIL ${name}: ${detail}`);
  passed++;
}
function answer(qid, optionIndex, authority=.9) {
  const q = def.questionById.get(qid);
  if (!q) throw new Error(`missing ${qid}`);
  return evidenceFromAnswer({definition:def, question:q, optionIndex, explicitAuthority:authority});
}

ok(def.categories.length === 64, 'definition has 64 categories');
ok(def.cells.length === 48, 'definition has 48 cells');
ok(def.questions.length === 12288, 'definition has 12,288 questions');
ok(def.secondaryEdges.length === 160, 'definition has 160 unique secondary cell edges');

// Direct finalization: three consistent independent paths.
let evidence = [
  answer(qid('MS01','C02',1),4),
  answer(qid('MS01','C02',3),4),
  answer(qid('MS01','C02',2),4)
];
let snap = calculateRuntimeSnapshot(def,evidence);
let c = snap.cells.get('MS01:C02');
ok(c.status === 'DIRECT_FINAL','three consistent C02 paths finalize',JSON.stringify(c));
ok(c.directScore === 100,'direct score is arithmetic mean');
ok(c.directConfidence >= .8,'direct confidence crosses .80',String(c.directConfidence));

// Hard contradiction caps confidence and blocks final.
evidence = [
  answer(qid('MS01','C02',1),1),
  answer(qid('MS01','C02',3),4),
  answer(qid('MS01','C02',2),4)
];
snap = calculateRuntimeSnapshot(def,evidence);
c = snap.cells.get('MS01:C02');
ok(c.hasHardContradiction,'same-cell >=50 range triggers hard contradiction');
ok(c.directConfidence <= .65 + 1e-12,'hard contradiction caps confidence at .65',String(c.directConfidence));
ok(c.status !== 'DIRECT_FINAL','hard contradiction blocks direct final');
ok(snap.contradictions.some(x => x.ruleId === 'H01' && x.categoryId === 'MS01'),'H01 finding emitted');

// Conditional N/A confirmation with three distinct paths.
evidence = [
  answer(qid('MS01','C24',1),6),
  answer(qid('MS01','C24',3),6),
  answer(qid('MS01','C24',2),6)
];
snap = calculateRuntimeSnapshot(def,evidence);
c = snap.cells.get('MS01:C24');
ok(c.status === 'NOT_APPLICABLE','C24 three N/A claims confirm N/A',JSON.stringify(c));
ok(c.naClaimCount === 3,'N/A claim count retained');
ok(c.naClaimConfidence >= .8,'N/A confidence crosses threshold',String(c.naClaimConfidence));

// Derived provisional from direct source; it can never finalize.
evidence = [
  answer(qid('MS01','C03',1),5),
  answer(qid('MS01','C03',3),5),
  answer(qid('MS01','C03',2),5)
];
snap = calculateRuntimeSnapshot(def,evidence);
const source = snap.cells.get('MS01:C03');
const target = snap.cells.get('MS01:C04');
ok(source.status === 'DIRECT_FINAL','source cell is direct final');
ok(target.status === 'DERIVED_PROVISIONAL','secondary target is derived provisional',JSON.stringify(target));
ok(target.derivedScore === 100,'derived score follows source at 100',String(target.derivedScore));
ok(target.derivedConfidence <= .45 + 1e-12,'derived confidence capped at .45',String(target.derivedConfidence));

// Partial score exists; official score remains null until every applicable scored cell has a value.
const cat = snap.categories.get('MS01');
ok(cat.partialScore !== null,'partial category score exists');
ok(cat.officialScore === null,'official category score blocked by incomplete cells');
ok(snap.overall.officialScore === null,'official overall score blocked by incomplete categories');

// QUICK starts with deterministic C01 path1.
evidence = [];
snap = calculateRuntimeSnapshot(def,evidence);
let decision = routeNextQuestion(def,{mode:'QUICK',snapshot:snap,evidence,askedQuestionIds:new Set(),diagnosticQuestionCount:0});
ok(decision.nextQuestion?.question.id === qid('MS01','C01',1),'QUICK first question is MS01/C01/path1',decision.nextQuestion?.question.id);

// After ordinary applicability answer, C02 path1 is next.
evidence = [answer(qid('MS01','C01',1),4)];
snap = calculateRuntimeSnapshot(def,evidence);
decision = routeNextQuestion(def,{mode:'QUICK',snapshot:snap,evidence,askedQuestionIds:new Set([qid('MS01','C01',1)]),diagnosticQuestionCount:1});
ok(decision.nextQuestion?.question.id === qid('MS01','C02',1),'QUICK normal core continues to C02/path1',decision.nextQuestion?.question.id);

// N/A or DNK at C01 routes to path3, not C02.
evidence = [answer(qid('MS01','C01',1),1)];
snap = calculateRuntimeSnapshot(def,evidence);
decision = routeNextQuestion(def,{mode:'QUICK',snapshot:snap,evidence,askedQuestionIds:new Set([qid('MS01','C01',1)]),diagnosticQuestionCount:1});
ok(decision.nextQuestion?.question.id === qid('MS01','C01',3),'C01 N/A claim routes to path3 confirmation',decision.nextQuestion?.question.id);


// Category scope contradiction reopens a confirmed C01 N/A gate.
evidence = [
  answer(qid('MS01','C01',1),1),
  answer(qid('MS01','C01',3),1),
  answer(qid('MS01','C01',2),1),
  answer(qid('MS01','C02',1),4)
];
snap = calculateRuntimeSnapshot(def,evidence);
ok(snap.contradictions.some(x => x.ruleId === 'H02'),'H02 emitted for category N/A plus scored evidence');
ok(snap.cells.get('MS01:C01').status !== 'NOT_APPLICABLE','H02 reopens C01 applicability');
ok(snap.categories.get('MS01').confirmedNotApplicable === false,'category remains active after H02');

// Conditional cell N/A plus scored evidence becomes H03 and review-required when exhausted.
evidence = [
  answer(qid('MS01','C24',1),6),
  answer(qid('MS01','C24',3),6),
  answer(qid('MS01','C24',2),6),
  answer(qid('MS01','C24',4),5)
];
snap = calculateRuntimeSnapshot(def,evidence);
ok(snap.contradictions.some(x => x.ruleId === 'H03'),'H03 emitted for confirmable N/A plus scored evidence');
ok(snap.cells.get('MS01:C24').status === 'REVIEW_REQUIRED','exhausted H03 cell is review-required',snap.cells.get('MS01:C24').status);

// Cross-cell semantic contradiction C39/C41.
evidence = [answer(qid('MS01','C39',1),1), answer(qid('MS01','C41',1),4)];
snap = calculateRuntimeSnapshot(def,evidence);
ok(snap.contradictions.some(x => x.ruleId === 'H04'),'H04 target-definition contradiction emitted');

// Benchmark quality/position semantic contradiction within C44.
evidence = [answer(qid('MS01','C44',1),1), answer(qid('MS01','C44',2),4)];
snap = calculateRuntimeSnapshot(def,evidence);
ok(snap.contradictions.some(x => x.ruleId === 'H05'),'H05 benchmark contradiction emitted');

// Profile relevance follows locked clamp and rules.
const base = calculateProfileRelevance(def,[]);
const modified = calculateProfileRelevance(def,[{questionId:'P01',optionIndexes:[2]}]);
ok((base.get('MS40') ?? 0) <= (modified.get('MS40') ?? 0),'profile rule can boost MS40 relevance',`${base.get('MS40')} -> ${modified.get('MS40')}`);
ok([...modified.values()].every(v => v >= .35 && v <= 1),'profile relevance remains clamped .35..1');

console.log(JSON.stringify({status:'PASS',checks:passed,results:checks},null,2));
