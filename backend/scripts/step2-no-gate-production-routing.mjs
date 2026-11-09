import fs from 'node:fs';
import {buildDefinition,calculateRuntimeSnapshot,evidenceFromAnswer,routeNextQuestion} from '../dist-engine/engine/index.js';
const bundle=JSON.parse(fs.readFileSync('methodology/MMRI_v3.0.0_FINAL_CANDIDATE.json','utf8'));
const def=buildDefinition(bundle);
const intended=12;
const evidence=[]; const asked=new Set();
let snapshot=calculateRuntimeSnapshot(def,evidence); let decision; let guard=0;
while(guard++<500){
  decision=routeNextQuestion(def,{mode:'QUICK',snapshot,evidence,askedQuestionIds:asked,profileAnswers:[],diagnosticQuestionCount:evidence.length});
  if(!decision.nextQuestion) break;
  const q=decision.nextQuestion.question; asked.add(q.id);
  let optionIndex;
  if(q.cellId==='C01'){
    const catIndex=def.categories.findIndex(c=>c.id===q.categoryId);
    optionIndex=catIndex<intended?4:1;
  } else {
    const scored=q.options.filter(o=>o.state==='SCORED' && o.score!==null);
    optionIndex=scored.length?scored[Math.floor((scored.length-1)*0.75)].optionIndex:(q.options.find(o=>o.state!=='DNK'&&o.state!=='N_A_CLAIM'&&o.state!=='UNAVAILABLE')?.optionIndex??1);
  }
  evidence.push(evidenceFromAnswer({definition:def,question:q,optionIndex,explicitAuthority:.9}));
  snapshot=calculateRuntimeSnapshot(def,evidence);
}
const d01=evidence.filter(e=>e.cellId==='C01').length;
const trueCats=def.categories.filter(c=>{const s=snapshot.cells.get(`${c.id}:C01`);return s?.applicabilityRelevance!==null && s.applicabilityRelevance>0.2;}).length;
const relevant=def.categories.slice(0,intended);
let applicable=0,known=0; let criticalOk=0,criticalTotal=0;
for(const c of relevant){for(const cell of def.cells){if(cell.id==='C01')continue; const s=snapshot.cells.get(`${c.id}:${cell.id}`); if(!s||s.status==='NOT_APPLICABLE')continue; applicable++; if(s.effectiveScore!==null)known++;}
 for(const cellId of ['C02','C16','C41']){criticalTotal++;const s=snapshot.cells.get(`${c.id}:${cellId}`); if(s && s.directAnswerCount>=2 && s.directConfidence>=.60 && !s.hasHardContradiction)criticalOk++;}
}
console.log(JSON.stringify({questions:evidence.length,d01Questions:d01,resolvedRelevant:trueCats,stopState:decision?.state,stopReason:decision?.stopReason,relevantCoverage:applicable?known/applicable:0,relevantKnown:known,relevantApplicable:applicable,criticalOk,criticalTotal},null,2));
