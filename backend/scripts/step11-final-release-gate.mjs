import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const backend=path.resolve(here,'..');
const project=path.resolve(backend,'..');
const e2e=JSON.parse(fs.readFileSync(path.join(backend,'methodology','STEP11_FINAL_E2E_PROFILES.json'),'utf8'));
const checks=[];const check=(name,ok,detail='')=>checks.push({name,status:ok?'PASS':'FAIL',detail});
check('representative source-mode E2E suite',e2e.failed===0,`${e2e.passed}/${e2e.totalChecks}`);
check('v13 runtime policy source loader',e2e.checks.some(x=>x.name==='v13 definition loads complete runtime policy'&&x.pass),'12,288 questions / 3,072 cells');
check('normal burden window',e2e.profiles.filter(x=>x.relevantCapabilities<=25).every(x=>x.questions>=180&&x.questions<=280),JSON.stringify(e2e.profiles.map(x=>[x.profile,x.questions])));
check('confirmation/locking exercised',e2e.profiles.every(x=>(x.stageCounts.CONFIRM??0)>0&&(x.stateCounts.LOCKED??0)>0),'');
check('diagnosis-plan-report hash chain',e2e.profiles.every(x=>[x.diagnosisHash,x.strategyHash,x.planHash,x.bindingHash,x.payloadHash,x.narrativeHash].every(v=>typeof v==='string'&&v.length===64)),'');
check('deterministic report validates',e2e.profiles.every(x=>x.narrativeValidation==='PASS'),'');
const fullCoverage=e2e.profiles.every(x=>x.relevantKnownCells===x.relevantApplicableCells);
check('full applicable-cell coverage at target burden',fullCoverage,e2e.profiles.map(x=>`${x.profile}:${x.relevantKnownCells}/${x.relevantApplicableCells} (${(100*x.relevantCoverage).toFixed(1)}%)`).join('; '));
const env={postgresClient:!!process.env.DATABASE_URL,liveAiConfigured:!!process.env.OPENAI_API_KEY};
const engineeringPass=checks.filter(x=>x.name!=='full applicable-cell coverage at target burden').every(x=>x.status==='PASS');
const productionGo=engineeringPass&&fullCoverage&&env.postgresClient;
const result={
 suite:'MMRI Step 11 final end-to-end release gate',version:'3.24.0',
 engineeringSourceE2E:engineeringPass?'PASS':'FAIL',
 productionRollout:productionGo?'GO':'HOLD',
 blockingReasons:[
  ...(!fullCoverage?['180–280/314 routed questions do not fill all applicable v13 cells; representative relevant-scope coverage is ~26–30%.']:[]),
  ...(!env.postgresClient?['Connected PostgreSQL migration/import/HTTP E2E was not executed in this sandbox.']:[])
 ],
 nonBlockingNotes:[...(!env.liveAiConfigured?['Live external AI provider was not executed; deterministic validated report fallback is available.']:[])],
 profiles:e2e.profiles.map(x=>({profile:x.profile,relevantCapabilities:x.relevantCapabilities,questions:x.questions,target:x.target,locked:x.stateCounts.LOCKED??0,validated:x.stateCounts.VALIDATED??0,relevantKnownCells:x.relevantKnownCells,relevantApplicableCells:x.relevantApplicableCells,relevantCoverage:x.relevantCoverage,overallCoverage:x.coverage,priorityActions:x.priorityActions,milestones:x.milestones})),
 checks
};
fs.writeFileSync(path.join(project,'STEP_11_OF_11_FINAL_ACCEPTANCE_v3.24.json'),JSON.stringify(result,null,2)+'\n');
fs.writeFileSync(path.join(backend,'methodology','STEP11_FINAL_RELEASE_GATE.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
if(!engineeringPass)process.exit(1);
