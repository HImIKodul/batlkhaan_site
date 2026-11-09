import fs from "node:fs";
import path from "node:path";
import { buildDefinition, calculateRuntimeSnapshot, evidenceFromAnswer, routeNextQuestion } from "../dist-engine/engine/index.js";

const bundlePath=path.resolve(process.cwd(),"methodology/MMRI_v3.0.3_QBANK_v3.1.3_STEP6_OF6_ACCEPTED_FINAL.json");
if(!fs.existsSync(bundlePath)) throw new Error(`Marketing methodology bundle missing: ${bundlePath}`);
const definition=buildDefinition(JSON.parse(fs.readFileSync(bundlePath,"utf8")));
const hardMaximum=Number(definition.contracts?.companyProfile?.routingLocks?.quickMaxQuestions ?? 280);
if(!Number.isFinite(hardMaximum) || hardMaximum!==280) throw new Error(`Expected numeric QUICK quickMaxQuestions=280, got ${String(hardMaximum)}`);

function goodOption(q,state){
  const exact=q.options.find(o=>o.state===state); if(exact)return exact.optionIndex;
  const scored=q.options.filter(o=>o.score!==null&&!['DNK','N_A_CLAIM','UNAVAILABLE'].includes(String(o.state||''))).sort((a,b)=>Number(b.score)-Number(a.score));
  if(scored.length)return scored[0].optionIndex;
  return (q.options.find(o=>!['DNK','N_A_CLAIM','UNAVAILABLE'].includes(String(o.state||'')))??q.options[0]).optionIndex;
}

const evidence=[];
const asked=new Set();
for(const category of definition.categories){
  const q=definition.questionByCategoryCellPath.get(`${category.id}:C01:1`);
  if(!q)throw new Error(`Missing ${category.id}:C01:1`);
  const optionIndex=goodOption(q,'APPLICABLE');
  evidence.push(evidenceFromAnswer({definition,question:q,optionIndex,explicitAuthority:0.95}));
  asked.add(q.id);
}

let snapshot=calculateRuntimeSnapshot(definition,evidence);
let terminal=null;
let steps=0;
while(steps<400){
  const decision=routeNextQuestion(definition,{
    mode:'QUICK', snapshot, evidence, askedQuestionIds:asked, profileAnswers:[],
    diagnosticQuestionCount:evidence.filter(e=>e.cellId!=='C01').length,
    relevantCapabilityCount:definition.categories.length
  });
  if(!decision.nextQuestion){terminal=decision;break;}
  if(evidence.length>=hardMaximum)throw new Error(`Router issued question ${evidence.length+1} after QUICK hard maximum ${hardMaximum}`);
  const q=decision.nextQuestion.question;
  if(asked.has(q.id))throw new Error(`Duplicate question issued: ${q.id}`);
  asked.add(q.id);
  evidence.push(evidenceFromAnswer({definition,question:q,optionIndex:goodOption(q),explicitAuthority:0.95}));
  snapshot=calculateRuntimeSnapshot(definition,evidence);
  steps++;
}
if(!terminal)throw new Error(`QUICK routing did not terminate within regression safety loop; answers=${evidence.length}`);
if(evidence.length>hardMaximum)throw new Error(`QUICK answered ${evidence.length}, exceeds ${hardMaximum}`);
if(evidence.length===hardMaximum && terminal.state!=="QUICK_LIMIT_REACHED")throw new Error(`At hard maximum expected QUICK_LIMIT_REACHED, got ${terminal.state}`);
if(!["QUICK_COMPLETE","QUICK_LIMIT_REACHED","NO_APPLICABLE_SCOPE","FULL_EVIDENCE_INCOMPLETE"].includes(terminal.state))throw new Error(`Unexpected QUICK terminal state ${terminal.state}`);
console.log(JSON.stringify({status:"PASS",hardMaximum,answeredQuestions:evidence.length,diagnosticQuestions:evidence.filter(e=>e.cellId!=="C01").length,terminalState:terminal.state,stopReason:terminal.stopReason,uniqueQuestions:asked.size},null,2));
