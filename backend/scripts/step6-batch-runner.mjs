import fs from 'node:fs';
import path from 'node:path';
import { makeScenario } from './step6-synthetic-lib.mjs';
const all={
 small_owner:{id:'small_owner',label:'Small hands-on owner',mode:'QUICK',relevantCount:12,target:70,authority:.90,roleId:'R01'},
 large_company:{id:'large_company',label:'Large broad company',mode:'QUICK',relevantCount:30,target:70,authority:.90,roleId:'R02'},
 na_heavy:{id:'na_heavy',label:'N/A-heavy valid scope',mode:'QUICK',relevantCount:12,target:70,authority:.95,naRate:.80},
 multi_respondent:{id:'multi_respondent',label:'Coherent multi-respondent',mode:'QUICK',relevantCount:12,target:70,authority:.90,multiRespondent:true},
 dnk_heavy:{id:'dnk_heavy',label:'DNK-heavy evidence',mode:'FULL',relevantCount:3,target:70,authority:.95,dnkRate:.65,maxSteps:1200},
 low_authority:{id:'low_authority',label:'Low-authority high claims',mode:'FULL',relevantCount:3,target:90,authority:.40,maxSteps:1200},
 contradictory:{id:'contradictory',label:'Record-check contradictions',mode:'FULL',relevantCount:3,target:90,authority:.95,conflictRate:.70,maxSteps:1200},
 all_dnk:{id:'all_dnk',label:'All DNK after scope',mode:'FULL',relevantCount:1,target:70,authority:.95,allDnk:true,maxSteps:500},
 strong90:{id:'strong_company',label:'Highly mature company',mode:'QUICK',relevantCount:12,target:90,authority:.95},
 sweep0:{id:'sweep_0',label:'Sweep 0',mode:'QUICK',relevantCount:3,target:0,authority:.95},
 sweep10:{id:'sweep_10',label:'Sweep 10',mode:'QUICK',relevantCount:3,target:10,authority:.95},
 sweep20:{id:'sweep_20',label:'Sweep 20',mode:'QUICK',relevantCount:3,target:20,authority:.95},
 sweep30:{id:'sweep_30',label:'Sweep 30',mode:'QUICK',relevantCount:3,target:30,authority:.95},
 sweep40:{id:'sweep_40',label:'Sweep 40',mode:'QUICK',relevantCount:3,target:40,authority:.95},
 sweep50:{id:'sweep_50',label:'Sweep 50',mode:'QUICK',relevantCount:3,target:50,authority:.95},
 sweep60:{id:'sweep_60',label:'Sweep 60',mode:'QUICK',relevantCount:3,target:60,authority:.95},
 sweep70:{id:'sweep_70',label:'Sweep 70',mode:'QUICK',relevantCount:3,target:70,authority:.95},
 sweep80:{id:'sweep_80',label:'Sweep 80',mode:'QUICK',relevantCount:3,target:80,authority:.95},
 sweep90:{id:'sweep_90',label:'Sweep 90',mode:'QUICK',relevantCount:3,target:90,authority:.95},
 sweep100:{id:'sweep_100',label:'Sweep 100',mode:'QUICK',relevantCount:3,target:100,authority:.95}
};
const ids=process.argv.slice(2);if(!ids.length)throw new Error('provide ids');
const results=[];for(const id of ids){if(!all[id])throw new Error(`unknown ${id}`);const r=makeScenario(all[id]);results.push(r);console.log(JSON.stringify({id:r.id,state:r.terminalState,q:r.diagnosticQuestions,score:r.overall.partialScore,official:r.overall.officialScore,coverage:r.overall.coverage,review:r.quality.reviewRequiredCells,hard:r.quality.hardContradictionCells,dnk:r.quality.dnkAnswers,na:r.quality.naAnswers,roles:r.quality.roles}));}
const out=path.resolve(process.cwd(),`../STEP06_BATCH_${ids.join('_')}.json`);fs.writeFileSync(out,JSON.stringify(results,null,2)+'\n');
