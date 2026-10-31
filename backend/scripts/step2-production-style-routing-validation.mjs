import fs from 'node:fs';
import {buildDefinition,calculateRuntimeSnapshot,evidenceFromAnswer,routeNextQuestion,questionBudgetTarget,softQuestionCap} from '../dist-engine/engine/index.js';
const bundle=JSON.parse(fs.readFileSync('methodology/MMRI_v3.0.0_FINAL_CANDIDATE.json','utf8'));
const def=buildDefinition(bundle);
const cases=[12,25,30]; const results=[]; const checks=[];
const check=(name,pass,detail)=>checks.push({name,pass:Boolean(pass),detail});
for(const intended of cases){
  const evidence=[]; const asked=new Set(); let snapshot=calculateRuntimeSnapshot(def,evidence); let decision=null; let guard=0;
  while(guard++<800){
    decision=routeNextQuestion(def,{mode:'QUICK',snapshot,evidence,askedQuestionIds:asked,profileAnswers:[],diagnosticQuestionCount:evidence.length});
    if(!decision.nextQuestion) break;
    const q=decision.nextQuestion.question; asked.add(q.id);
    let optionIndex;
    if(q.cellId==='C01'){
      const ci=def.categories.findIndex(c=>c.id===q.categoryId);
      optionIndex=ci<intended?4:1;
    }else{
      const scored=q.options.filter(o=>o.state==='SCORED'&&o.score!==null);
      optionIndex=scored.length?scored[Math.min(scored.length-1,Math.floor(scored.length*.7))].optionIndex:(q.options.find(o=>o.state!=='DNK'&&o.state!=='N_A_CLAIM'&&o.state!=='UNAVAILABLE')?.optionIndex??1);
    }
    evidence.push(evidenceFromAnswer({definition:def,question:q,optionIndex,explicitAuthority:.9}));
    snapshot=calculateRuntimeSnapshot(def,evidence);
  }
  const routingScreens=evidence.filter(e=>e.cellId==='C01').length;
  const diagnosticQuestions=evidence.length-routingScreens;
  const relevant=def.categories.slice(0,intended); let applicable=0,known=0,criticalOk=0,criticalTotal=0;
  for(const c of relevant){
    for(const cell of def.cells){ if(cell.id==='C01')continue; const s=snapshot.cells.get(`${c.id}:${cell.id}`); if(!s||s.status==='NOT_APPLICABLE')continue; applicable++; if(s.effectiveScore!==null)known++; }
    for(const cid of ['C02','C16','C41']){ criticalTotal++; const s=snapshot.cells.get(`${c.id}:${cid}`); if(s && s.directAnswerCount>=2 && s.directConfidence>=.60 && !s.hasHardContradiction)criticalOk++; }
  }
  const outOfScope=def.categories.slice(intended); const falselyExcluded=outOfScope.filter(c=>snapshot.categories.get(c.id)?.confirmedNotApplicable).map(c=>c.id);
  const row={intendedRelevantCapabilities:intended,totalQuestions:evidence.length,routingScreens,diagnosticQuestions,target:questionBudgetTarget(intended),diagnosticSoftCap:softQuestionCap(intended),stopState:decision?.state,stopReason:decision?.stopReason,relevantKnown:known,relevantApplicable:applicable,relevantCoverage:applicable?known/applicable:1,criticalOk,criticalTotal,falselyConfirmedNotApplicable:falselyExcluded};
  results.push(row);
  check(`${intended}: all 64 routing screens resolved`,routingScreens===64,String(routingScreens));
  check(`${intended}: diagnostic budget bounded`,diagnosticQuestions<=softQuestionCap(intended),`${diagnosticQuestions}/${softQuestionCap(intended)}`);
  check(`${intended}: complete not cap`,decision?.state==='ADAPTIVE_V13_COMPLETE',String(decision?.state));
  check(`${intended}: 100% relevant effective-value coverage`,Math.abs(row.relevantCoverage-1)<1e-12,`${known}/${applicable}`);
  check(`${intended}: critical direct-confidence gate`,criticalOk===criticalTotal,`${criticalOk}/${criticalTotal}`);
  check(`${intended}: routing FALSE does not fake final N/A`,falselyExcluded.length===0,JSON.stringify(falselyExcluded));
}
const out={suite:'MMRI v3 production-style routing without synthetic applicability gate',status:checks.every(x=>x.pass)?'PASS':'FAIL',totalChecks:checks.length,passed:checks.filter(x=>x.pass).length,failed:checks.filter(x=>!x.pass).length,results,checks};
fs.writeFileSync('methodology/STEP2_PRODUCTION_STYLE_ROUTING_VALIDATION.json',JSON.stringify(out,null,2)+'\n');
console.log(JSON.stringify(out,null,2)); if(out.failed)process.exit(1);
