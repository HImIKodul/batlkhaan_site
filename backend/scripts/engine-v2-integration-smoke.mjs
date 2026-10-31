import fs from 'node:fs';
import { buildDefinition, calculateRuntimeSnapshot, evidenceFromAnswer, routeNextQuestion, questionBudgetTarget, softQuestionCap } from '../dist-engine/engine/index.js';
const bundle=JSON.parse(fs.readFileSync('methodology/MMRI_v2.0.0_RECOVERY_CANDIDATE.json','utf8'));
const def=buildDefinition(bundle);
const checks=[]; const ok=(cond,name,detail='')=>{checks.push({name,pass:Boolean(cond),detail}); if(!cond) throw new Error(`FAIL ${name}: ${detail}`)};
const q=(cat,cell,path)=>{const x=def.questionByCategoryCellPath.get(`${cat}:${cell}:${path}`); if(!x) throw new Error(`missing ${cat}:${cell}:${path}`); return x};
const ans=(cat,cell,path,opt)=>evidenceFromAnswer({definition:def,question:q(cat,cell,path),optionIndex:opt,explicitAuthority:.9});
ok(def.version==='2.0.0','v2 semantic version loaded',def.version);
ok(def.questions.length===12288,'12,288 questions',String(def.questions.length));
ok(def.secondaryEdges.length===165,'165 v2 M2M edges',String(def.secondaryEdges.length));
ok(def.runtimePolicy?.questionById.size===12288,'12,288 runtime question policies',String(def.runtimePolicy?.questionById.size));
ok(def.runtimePolicy?.cellByCategoryCell.size===3072,'3,072 runtime cell policies',String(def.runtimePolicy?.cellByCategoryCell.size));
// D01 is routing-only but a substantive answer resolves capability applicability.
let evidence=[ans('MS01','C01',1,4)]; let snap=calculateRuntimeSnapshot(def,evidence); let c=snap.cells.get('MS01:C01');
ok(c?.applicabilityRelevance===1,'D01 substantive answer resolves applicability',JSON.stringify(c));
ok(c?.directScore===null,'D01 never creates maturity score',String(c?.directScore));
// Consistent PRIMARY+CONFIRM locks a scored cell.
evidence=[ans('MS01','C02',1,4),ans('MS01','C02',2,4)]; snap=calculateRuntimeSnapshot(def,evidence); c=snap.cells.get('MS01:C02');
ok(c?.status==='DIRECT_FINAL'&&c?.locked===true,'consistent primary+confirm locks cell',JSON.stringify(c));
// Frozen H01 contract: >=50 point range must not be overridden by 2-of-3 clustering.
evidence=[ans('MS01','C02',1,1),ans('MS01','C02',2,4),ans('MS01','C02',3,4)]; snap=calculateRuntimeSnapshot(def,evidence); c=snap.cells.get('MS01:C02');
ok(c?.hasHardContradiction===true,'hard same-cell contradiction detected',JSON.stringify(c));
ok(c?.status!=='DIRECT_FINAL'&&c?.locked!==true,'hard contradiction blocks finalization',JSON.stringify(c));
ok((c?.effectiveConfidence??1)<=0.65+1e-12,'hard contradiction confidence capped at 0.65',String(c?.effectiveConfidence));
// M2M evidence remains estimated and capped, never direct-final.
const edge=def.secondaryEdges.find(e=>e.sourceCellId==='C04') ?? def.secondaryEdges[0];
evidence=[ans('MS01',edge.sourceCellId,1,5),ans('MS01',edge.sourceCellId,2,5)]; snap=calculateRuntimeSnapshot(def,evidence); const t=snap.cells.get(`MS01:${edge.targetCellId}`);
ok(t?.effectiveScore!==null,'secondary evidence creates effective estimate',JSON.stringify(t));
ok(t?.confidenceState==='ESTIMATED'&&t?.status==='DERIVED_PROVISIONAL','secondary evidence stays estimated',JSON.stringify(t));
const tp=def.runtimePolicy.cellByCategoryCell.get(`MS01:${edge.targetCellId}`); ok((t?.effectiveConfidence??1)<=(tp?.indirectConfidenceCap??0)+1e-12,'indirect confidence cap respected',String(t?.effectiveConfidence));
// Router against full v2 runtime policy only returns direct-askable questions and respects budgets.
const gates=new Map(def.categories.map((cat,i)=>[`${cat.id}:CAPABILITY_RELEVANT`,i<12?'TRUE':'FALSE'])); snap=calculateRuntimeSnapshot(def,[]);
const dec=routeNextQuestion(def,{mode:'QUICK',snapshot:snap,evidence:[],askedQuestionIds:new Set(),diagnosticQuestionCount:0,relevantCapabilityCount:12,applicabilityByGate:gates});
ok(dec.state==='ADAPTIVE_V13_RUNNING'&&Boolean(dec.nextQuestion),'full v2 router produces eligible question',dec.state);
const pol=def.runtimePolicy.questionById.get(dec.nextQuestion.question.id); ok(pol?.directAskAllowed===true&&pol?.routingState!=='INFER_ONLY','routed question is directly askable',JSON.stringify(pol));
ok(questionBudgetTarget(12)===180&&questionBudgetTarget(25)===280&&questionBudgetTarget(30)===314,'reference budgets preserved');
ok(softQuestionCap(25)===280&&softQuestionCap(30)===334,'soft caps preserved');
console.log(JSON.stringify({status:'PASS',checks:checks.length,results:checks},null,2));
