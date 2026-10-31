import fs from 'node:fs';
import { makeScenario } from './step6-synthetic-lib.mjs';
const cases=[
 {id:'weak',label:'Weak',mode:'QUICK',relevantCount:1,target:0,authority:.95,maxSteps:180},
 {id:'mid',label:'Mid',mode:'QUICK',relevantCount:1,target:50,authority:.95,maxSteps:180},
 {id:'strong',label:'Strong',mode:'QUICK',relevantCount:1,target:100,authority:.95,maxSteps:180},
 {id:'na_heavy',label:'NA heavy',mode:'QUICK',relevantCount:1,target:70,authority:.95,naRate:.8,maxSteps:180},
 {id:'all_dnk',label:'All DNK',mode:'FULL',relevantCount:1,target:70,authority:.95,allDnk:true,maxSteps:500},
 {id:'contradictory',label:'Contradictory',mode:'FULL',relevantCount:1,target:90,authority:.95,conflictRate:.7,maxSteps:500},
 {id:'low_authority',label:'Low authority',mode:'FULL',relevantCount:1,target:90,authority:.4,maxSteps:500},
];
const results=cases.map(makeScenario); const by=new Map(results.map(x=>[x.id,x]));
const checks=[]; const check=(name,pass,detail='')=>checks.push({name,pass:Boolean(pass),detail:String(detail??'')});
for(const r of results){check(`${r.id}: no duplicates`,r.quality.duplicateQuestions===0,r.quality.duplicateQuestions);check(`${r.id}: no infer-only direct`,r.quality.inferOnlyAsked===0,r.quality.inferOnlyAsked);}
check('weak=0',Math.abs(by.get('weak').overall.partialScore??999)<1e-9,by.get('weak').overall.partialScore);
check('mid around 50',(by.get('mid').overall.partialScore??0)>=40&&(by.get('mid').overall.partialScore??100)<=60,by.get('mid').overall.partialScore);
check('strong=100',Math.abs((by.get('strong').overall.partialScore??0)-100)<1e-9,by.get('strong').overall.partialScore);
check('ordering',by.get('weak').overall.partialScore<by.get('mid').overall.partialScore&&by.get('mid').overall.partialScore<by.get('strong').overall.partialScore);
check('NA exercised',by.get('na_heavy').quality.naAnswers>0,by.get('na_heavy').quality.naAnswers);
check('NA does not become zero',(by.get('na_heavy').overall.partialScore??0)>40,by.get('na_heavy').overall.partialScore);
check('DNK exercised',by.get('all_dnk').quality.dnkAnswers>0,by.get('all_dnk').quality.dnkAnswers);
check('DNK not official',by.get('all_dnk').overall.officialScore===null,by.get('all_dnk').overall.officialScore);
check('contradiction requires review',by.get('contradictory').quality.reviewRequiredCells>0,by.get('contradictory').quality.reviewRequiredCells);
check('contradiction hard finding',by.get('contradictory').quality.hardContradictionCells>0,by.get('contradictory').quality.hardContradictionCells);
check('contradiction terminal requires review',by.get('contradictory').terminalState==='FULL_COMPLETE_WITH_REVIEW',by.get('contradictory').terminalState);
check('low authority requires review',by.get('low_authority').quality.reviewRequiredCells>0,by.get('low_authority').quality.reviewRequiredCells);
check('low authority terminal requires review',by.get('low_authority').terminalState==='FULL_COMPLETE_WITH_REVIEW',by.get('low_authority').terminalState);
const failed=checks.filter(x=>!x.pass); const report={status:failed.length?'FAIL':'PASS',checksPassed:checks.length-failed.length,checksTotal:checks.length,failed,results};
fs.writeFileSync('../STEP11_TARGETED_SYNTHETIC_REGRESSION.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,checksPassed:report.checksPassed,checksTotal:report.checksTotal,failed,summary:results.map(r=>({id:r.id,state:r.terminalState,score:r.overall.partialScore,official:r.overall.officialScore,coverage:r.overall.coverage,review:r.quality.reviewRequiredCells,hard:r.quality.hardContradictionCells,dnk:r.quality.dnkAnswers,na:r.quality.naAnswers,q:r.diagnosticQuestions}))},null,2));
if(failed.length)process.exit(1);
