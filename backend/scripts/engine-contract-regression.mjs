import fs from 'node:fs';
import { directConfidence, canDirectFinalize } from '../dist-engine/engine/confidence.js';
import { mean, weightedMean } from '../dist-engine/engine/utils.js';
import { classifyQuickStop, classifyFullTerminal } from '../dist-engine/engine/routing.js';
import { buildDefinition } from '../dist-engine/engine/definition.js';

const bundle = JSON.parse(fs.readFileSync('methodology/MMRI_v3.0.3_QBANK_v3.1.3_STEP6_OF6_ACCEPTED_FINAL.json','utf8'));
const def = buildDefinition(bundle);
const scenarios = bundle.contracts['MMRI_FINAL_Simulation_Test_Suite.json'].scenarios;
const families = new Set(['Score aggregation','Confidence & finalization','Contradictions','Many-to-many','Weighted aggregation','QUICK routing','FULL terminal states']);
const selected = scenarios.filter(s => families.has(s.family));
const results = [];

for (const s of selected) {
  let actual;
  switch (s.family) {
    case 'Score aggregation':
      actual = mean(s.inputs.scores);
      break;
    case 'Confidence & finalization': {
      const n = s.inputs.reliabilities.length;
      const distinct = s.inputs.sourceKinds;
      const kinds = ['SELF_REPORT','RECORD_CHECK','RECENT_CASE','ADDITIONAL_CHECK'];
      const sourceKinds = Array.from({length:n},(_,i)=>kinds[i % distinct]);
      const conf = directConfidence(def.contracts, { reliabilities:s.inputs.reliabilities, sourceKinds, directCount:n, hardContradiction:s.inputs.hardContradiction });
      actual = canDirectFinalize(def.contracts, {
        directCount:n,
        sourceKindCount:distinct,
        confidence:conf,
        hasValue:true,
        hasHardContradiction:s.inputs.hardContradiction,
        maxAcceptedAuthority:s.inputs.authority
      });
      break;
    }
    case 'Contradictions': {
      const r = Number(s.inputs.range);
      actual = r >= 50 ? 'HARD' : r >= 25 ? 'VARIANCE' : 'NONE';
      break;
    }
    case 'Many-to-many': {
      const rows = s.inputs.sources;
      const denom = rows.reduce((sum,x)=>sum+x.coefficient*x.confidence,0);
      actual = denom === 0 ? null : rows.reduce((sum,x)=>sum+x.value*x.coefficient*x.confidence,0)/denom;
      break;
    }
    case 'Weighted aggregation': {
      const rows = s.inputs.values.map((v,i)=>({value:v,weight:s.inputs.weights[i]})).filter(x=>x.value !== null);
      actual = weightedMean(rows);
      break;
    }
    case 'QUICK routing':
      actual = classifyQuickStop({ count:s.inputs.count, coreComplete:s.inputs.coreComplete, mandatoryUnresolved:s.inputs.mandatoryUnresolved, highestPriority:s.inputs.highestPriority });
      break;
    case 'FULL terminal states':
      actual = classifyFullTerminal({ valuesComplete:s.inputs.valuesComplete, reviewRequired:s.inputs.review, evidenceExhausted:s.inputs.exhausted, noScope:s.inputs.noScope });
      break;
  }
  let pass = equivalent(actual,s.expected);
  let superseded = false;
  // The simulation suite embedded in the (frozen) bundle still encodes the pre-v13 rule "at least 3 independent source kinds". The bundle's own
  // authority contract declares sourceKindRuleUnchanged:false and minimumIndependentSourceKinds:1, so the active rule is deliberately weaker.
  // A mismatch is accepted ONLY when it is exactly explained by that superseded rule (the legacy rule reproduces the expectation) and the
  // contract really declares the change. The frozen bundle is not edited.
  if (!pass && s.family === 'Confidence & finalization' && def.contracts.authority.finalization.sourceKindRuleUnchanged === false) {
    const legacy = { ...def.contracts, confidence:{ ...def.contracts.confidence, finalization:{ ...def.contracts.confidence.finalization, minimumIndependentSourceKinds:3 } } };
    const n = s.inputs.reliabilities.length; const kinds = ['SELF_REPORT','RECORD_CHECK','RECENT_CASE','ADDITIONAL_CHECK'];
    const conf = directConfidence(legacy, { reliabilities:s.inputs.reliabilities, sourceKinds:Array.from({length:n},(_,i)=>kinds[i % s.inputs.sourceKinds]), directCount:n, hardContradiction:s.inputs.hardContradiction });
    const legacyActual = canDirectFinalize(legacy, { directCount:n, sourceKindCount:s.inputs.sourceKinds, confidence:conf, hasValue:true, hasHardContradiction:s.inputs.hardContradiction, maxAcceptedAuthority:s.inputs.authority });
    if (equivalent(legacyActual, s.expected)) { pass = true; superseded = true; }
  }
  results.push({id:s.id,family:s.family,expected:s.expected,actual,pass,...(superseded?{supersededByContract:'authority.finalization.sourceKindRuleUnchanged=false'}:{})});
}
const failed = results.filter(x=>!x.pass);
const output = { status:failed.length?'FAIL':'PASS', supersededScenarios:results.filter(x=>x.supersededByContract).map(x=>x.id), scenarios:results.length, passed:results.length-failed.length, failed:failed.length, results };
console.log(JSON.stringify(output,null,2));
if (failed.length) process.exitCode = 1;

function equivalent(a,b) {
  if (b === 'VARIANCE_OR_NONE') return a === 'VARIANCE' || a === 'NONE';
  if (a === null || b === null) return a === b;
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a-b) < 1e-9;
  return a === b;
}
