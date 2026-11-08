import fs from 'node:fs';
import path from 'node:path';
import { buildDefinition, calculateRuntimeSnapshot, routeNextQuestion, evidenceFromAnswer } from '../dist-engine/engine/index.js';
const bundle=JSON.parse(fs.readFileSync(path.resolve(process.cwd(),'methodology/MMRI_v3.0.3_QBANK_v3.1.3_STEP6_OF6_ACCEPTED_FINAL.json'),'utf8'));
const definition=buildDefinition(bundle);
const evidence=[]; const askedQuestionIds=new Set(); const selected=[];
const applicabilityByGate=new Map();
for(const [i,c] of definition.categories.entries()) applicabilityByGate.set(`${c.id}:CAPABILITY_RELEVANT`, i===0?'TRUE':'FALSE');
function choose(q){
  const scored=q.options.filter(o=>o.score!==null && !['DNK','N_A_CLAIM','UNAVAILABLE'].includes(o.state));
  if(scored.length) return scored.sort((a,b)=>Number(b.score)-Number(a.score))[0].optionIndex;
  return q.options.find(o=>!['DNK','N_A_CLAIM','UNAVAILABLE'].includes(o.state))?.optionIndex ?? 1;
}
for(let i=0;i<16;i++){
  const snapshot=calculateRuntimeSnapshot(definition,evidence);
  const d=routeNextQuestion(definition,{mode:'QUICK',snapshot,evidence,askedQuestionIds,profileAnswers:[],diagnosticQuestionCount:evidence.length,applicabilityByGate,relevantCapabilityCount:1});
  if(!d.nextQuestion) break;
  const q=d.nextQuestion.question; const p=definition.runtimePolicy?.questionById.get(q.id);
  if(!p?.directAskAllowed || p.routingState==='INFER_ONLY') throw new Error(`Illegal direct selection ${q.id}`);
  if(selected.includes(q.id)) throw new Error(`Repeated question ${q.id}`);
  selected.push(q.id); askedQuestionIds.add(q.id);
  evidence.push(evidenceFromAnswer({definition,question:q,optionIndex:choose(q),explicitAuthority:0.9}));
}
const result={status:'PASS',methodologyVersion:definition.version,questionBankVersion:bundle.questionBankVersion,questionsExercised:selected.length,uniqueSelected:new Set(selected).size,inferOnlySelected:0,firstQuestions:selected};
console.log(JSON.stringify(result,null,2));
fs.writeFileSync(path.resolve(process.cwd(),'../STEP01_QBANK_ENGINE_COMPILED_SMOKE.json'),JSON.stringify(result,null,2)+'\n');
