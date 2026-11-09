/* (setup copied from qa-ai-mock-grounding-regression.mjs) AI grounding and failure handling with MOCK providers only (no network, no cost). Run after `npm run strategy:typecheck`.
   Proves: a grounded draft passes; invented numbers, malformed output, provider failure and prompt injection in the company name all end in the
   deterministic fallback; the AI can never change scores or priorities. The real provider is NOT exercised here (see ai-real-provider-smoke.mjs). */
import fs from 'node:fs';
import { buildDefinition, calculateRuntimeSnapshot, evidenceFromAnswer } from '../dist-strategy/engine/index.js';
import { runStrategyPipeline } from '../dist-strategy/strategy/index.js';
import { buildFrozenReportPayload, deterministicFallbackNarrative, generateValidatedNarrative, reportBindingMaterial } from '../dist-strategy/report/index.js';
import { safeNarrativeCompanyName } from '../dist-strategy/report/ai-prompt.js';import { validateNarrativeDraft } from '../dist-strategy/report/validator.js';
import { sha256Json } from '../dist-strategy/lib/hash.js';
const checks=[];const check=(name,pass,detail='')=>{checks.push({name,pass:Boolean(pass),detail:String(detail)});if(!pass)throw new Error(`FAIL ${name}: ${detail}`)};
const file='methodology/MMRI_v3.0.3_QBANK_v3.1.3_STEP6_OF6_ACCEPTED_FINAL.json';
const def=buildDefinition(JSON.parse(fs.readFileSync(file,'utf8')));
function q(cat,cell,path){const x=def.questionByCategoryCellPath.get(`${cat}:${cell}:${path}`);if(!x)throw new Error(`Missing ${cat}:${cell}:${path}`);return x}
function applicable(x){return x.options.find(o=>['APPLICABLE','MOSTLY_APPLICABLE','PARTIAL_APPLICABILITY'].includes(o.state))?.optionIndex ?? x.options[0].optionIndex}
function na(x){return x.options.find(o=>o.state==='N_A_CLAIM')?.optionIndex ?? x.options[0].optionIndex}
function scored(x,high){const rows=x.options.filter(o=>o.state==='SCORED'&&o.score!==null).sort((a,b)=>Number(a.score)-Number(b.score));return rows.length?(high?rows.at(-1):rows[0]).optionIndex:null}
function ev(x,oi){return evidenceFromAnswer({definition:def,question:x,optionIndex:oi,explicitAuthority:1,respondentRoleId:'R01'})}
const selected=def.categories.slice(0,10),set=new Set(selected.map(c=>c.id)),high=new Set(selected.slice(0,5).map(c=>c.id)),evidence=[];
for(const c of def.categories){if(set.has(c.id)){const x=q(c.id,'C01',1);evidence.push(ev(x,applicable(x)))}else for(const p of [1,2,3]){const x=q(c.id,'C01',p);evidence.push(ev(x,na(x)))}}
for(const c of selected)for(const cell of def.cells){if(cell.id==='C01')continue;for(const p of [1,2,3,4]){const x=def.questionByCategoryCellPath.get(`${c.id}:${cell.id}:${p}`);if(!x)continue;const policy=def.runtimePolicy?.questionById.get(x.id);if(policy&&(!policy.scoreEligible||policy.routingState==='INFER_ONLY'))continue;const oi=scored(x,high.has(c.id));if(oi!==null)evidence.push(ev(x,oi))}}
const snapshot=calculateRuntimeSnapshot(def,evidence),strategy=runStrategyPipeline({methodology:def,snapshot,profileAnswers:[{questionId:'P05',optionIndexes:[5]},{questionId:'P20',optionIndexes:[1]}]});
const diagnosisResultHash='diag-step11',strategyHash='strategy-step11',planHash='plan-step11';
const bindingHash=sha256Json(reportBindingMaterial({diagnosisResultHash,strategyHash,planHash,reportContractVersion:def.contracts.report.version,aiContractVersion:def.contracts.aiGeneration.version,findingsPolicyVersion:'MMRI-REPORT-FINDINGS-1.0-FIVE-CATEGORY'}));
let payload=buildFrozenReportPayload({reportId:'RPT-step11-V4',payloadHash:'',traceVersion:'MMRI-TRACE-1.0',versionBundleId:'bundle-step11',versionBundleHash:'bundlehash-step11',sourceSnapshotId:'snapshot-step11',sourceSnapshotHash:'snapshothash-step11',diagnosisResultHash,strategyHash,planHash,bindingHash,generatedAt:'2026-10-25T01:00:00.000Z',assessmentId:'ASS-step11',assessmentMode:'FULL',assessmentStatus:'COMPLETED',routingState:'FULL_COMPLETE',companyName:'Тест компани',methodology:def,snapshot,strategy,purposeLabels:Object.fromEntries([...snapshot.purposes.keys()].map((id,i)=>[id,`Зорилго ${i+1}`]))});
payload={...payload,payloadHash:sha256Json({...payload,payloadHash:''})};
const fallback=deterministicFallbackNarrative(payload);

// ---- Phase 1 regression: MMRI-02 (claim-bound numbers) and MMRI-03 (disjoint strengths/weaknesses) ----
const results=[];const rec=(n,ok,d='')=>{results.push({n,ok:!!ok});console.log((ok?'PASS ':'FAIL ')+n+(d?' | '+d:''))};
const clone=x=>JSON.parse(JSON.stringify(x));
const fmt=v=>Number(v).toFixed(1);
const overallScore=payload.overall.score;
const ovTokens=new Set();for(const x of [overallScore,payload.overall.confidence,payload.overall.coverage]){if(x==null)continue;for(const m of [x,x*100]){ovTokens.add(fmt(m));ovTokens.add(String(Math.round(m)));ovTokens.add(String(m))}}
const wkText=JSON.stringify(payload.weaknesses[0])+JSON.stringify(payload.requiredWarnings);
const cands=[...payload.strengths.map(s=>s.score),...payload.purposes.map(p=>p.score)].filter(x=>x!=null).map(x=>fmt(x));
const other=cands.find(t=>!ovTokens.has(t)&&!ovTokens.has(String(Math.round(Number(t))))&&!wkText.includes(String(Math.round(Number(t))))&&!wkText.includes(t));
rec('P2-0 setup: a strength score distinct from the overall score exists',Boolean(other),`overall=${overallScore} other=${other}`);
// MMRI-02a: the overall score slot carries another capability's score (a number that IS somewhere in the payload)
let d=clone(fallback);
const s01=d.sections.find(s=>s.id==='S01');s01.claims[0].textMn+=` Нийт оноо ${other}.`;
let v=validateNarrativeDraft(payload,d);
rec('P2-1 overall score replaced by another capability score is blocked (V02)',v.state==='GENERATION_BLOCKED'&&v.issues.some(i=>i.checkId==='V02'),`state ${v.state}`);
// MMRI-02b: a weakness claim quotes a strength score
d=clone(fallback);const s05=d.sections.find(s=>s.id==='S05');s05.claims[0].textMn+=` Оноо ${other}.`;
v=validateNarrativeDraft(payload,d);
rec('P2-2 weakness claim quoting a different capability score is blocked',v.state==='GENERATION_BLOCKED'&&v.issues.some(i=>i.checkId==='V02'),`state ${v.state}`);
// MMRI-02c: the same number is accepted where it belongs (own overall score, own strength score)
d=clone(fallback);d.sections.find(s=>s.id==='S01').claims[0].textMn+=` Нийт оноо ${fmt(overallScore)}.`;
d.sections.find(s=>s.id==='S04').claims[0].textMn+=` Оноо ${fmt(payload.strengths[0].score)}.`;
v=validateNarrativeDraft(payload,d);
rec('P2-3 correct own numbers still validate',v.state==='PASS',`state ${v.state} ${JSON.stringify(v.issues).slice(0,200)}`);
rec('P2-4 untouched deterministic fallback validates',validateNarrativeDraft(payload,fallback).state==='PASS');

// MMRI-03: quick-style snapshot, nothing reaches the evidence thresholds, many zero-scored capabilities
function payloadFor(mutate){
  const snap={...snapshot,categories:new Map([...snapshot.categories].map(([k,r])=>[k,{...r}]))};
  mutate(snap);
  let p=buildFrozenReportPayload({reportId:'RPT-p1',payloadHash:'',traceVersion:'MMRI-TRACE-1.0',versionBundleId:'b',versionBundleHash:'bh',sourceSnapshotId:'s',sourceSnapshotHash:'sh',diagnosisResultHash,strategyHash,planHash,bindingHash,generatedAt:'2026-10-25T01:00:00.000Z',assessmentId:'ASS-p1',assessmentMode:'FULL',assessmentStatus:'COMPLETED',routingState:'FULL_COMPLETE',companyName:'Тест компани',methodology:def,snapshot:snap,strategy,purposeLabels:Object.fromEntries([...snap.purposes.keys()].map((id,i)=>[id,`Зорилго ${i+1}`]))});
  return {...p,payloadHash:sha256Json({...p,payloadHash:''})};
}
const ids=[...snapshot.categories.keys()];
const disjoint=p=>!p.strengths.some(s=>p.weaknesses.some(w=>w.categoryId===s.categoryId));
const thr=Number(def.contracts.rootCause?.weaknessThreshold??60);
// 3a: no category is confident enough to be validated; a third of them are zero-scored, the rest middling
const p3a=payloadFor(snap=>{ids.forEach((id,i)=>{const r=snap.categories.get(id);if(r&&r.partialScore!=null){r.confidence=0.2;r.coverage=0.2;r.partialScore=i%3===0?0:50+(i%5)*8;r.officialScore=r.partialScore}})});
rec('P3-1 strengths and weaknesses share no capability (low-evidence snapshot)',disjoint(p3a),`strengths ${p3a.strengths.length} weaknesses ${p3a.weaknesses.length}`);
rec('P3-2 no zero-scored capability is presented as a strength',!p3a.strengths.some(s=>s.score<thr),p3a.strengths.map(s=>s.score).join(','));
rec('P3-3 relative-rank strengths are never worded as stable/demonstrated',(()=>{const t=deterministicFallbackNarrative(p3a).sections.filter(s=>s.id==='S04').flatMap(s=>s.claims).map(c=>c.textMn).join(' ');return !/тогтвортой илэрсэн/.test(t)||p3a.strengths.every(s=>s.basis!=='RELATIVE_RANK')})());
rec('P3-4 fallback narrative for that payload validates',validateNarrativeDraft(p3a,deterministicFallbackNarrative(p3a)).state==='PASS',validateNarrativeDraft(p3a,deterministicFallbackNarrative(p3a)).issues.map(i=>i.message).join(';').slice(0,200));
// 3b: every category is zero: there may be NO strength at all (fewer strengths allowed)
const p3b=payloadFor(snap=>{for(const id of ids){const r=snap.categories.get(id);if(r&&r.partialScore!=null){r.partialScore=0;r.officialScore=0;r.confidence=0.9;r.coverage=0.9}}});
rec('P3-5 all-zero snapshot yields no strengths and disjoint sets',p3b.strengths.length===0&&disjoint(p3b),`strengths ${p3b.strengths.length} weaknesses ${p3b.weaknesses.length}`);
rec('P3-7 all-zero snapshot: the same capability is never in both lists',disjoint(p3b));
// 3c: validated weaknesses present (confident, low) plus few eligible others: padded strengths must not borrow them
const p3c=payloadFor(snap=>{ids.forEach((id,i)=>{const r=snap.categories.get(id);if(r&&r.partialScore!=null){const low=i%2===0;r.partialScore=low?5:70;r.officialScore=r.partialScore;r.confidence=low?0.95:0.3;r.coverage=low?0.95:0.3}})});
rec('P3-6 validated weaknesses are not reused as padded strengths',disjoint(p3c)&&p3c.weaknesses.some(w=>w.basis==='VALIDATED'),`strengths ${p3c.strengths.length} weaknesses ${p3c.weaknesses.length}`);
const bad=results.filter(r=>!r.ok);
console.log(bad.length?`FAILED ${bad.length}/${results.length}`:`ALL PASS ${results.length}`);process.exit(bad.length?1:0);
