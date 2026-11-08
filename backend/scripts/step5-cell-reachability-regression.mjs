import fs from 'node:fs';
import {
  buildDefinition, calculateRuntimeSnapshot, evidenceFromAnswer,
  rankAdaptiveV13Questions, routeNextQuestion
} from '../dist-engine/engine/index.js';
const bundle=JSON.parse(fs.readFileSync('methodology/MMRI_v3.0.3_QBANK_v3.1.3_STEP6_OF6_ACCEPTED_FINAL.json','utf8'));
const def=buildDefinition(bundle);
const checks=[], failures=[];
const check=(name,pass,detail='')=>{const r={name,pass:Boolean(pass),detail:String(detail??'')};checks.push(r);if(!r.pass)failures.push(r);};
const q=(cat,cid,p)=>{const x=def.questionByCategoryCellPath.get(`${cat}:${cid}:${p}`);if(!x)throw new Error(`missing ${cat}:${cid}:${p}`);return x;};
const rp=q=>def.runtimePolicy.questionById.get(q.id);
const cp=(cat,cid)=>def.runtimePolicy.cellByCategoryCell.get(`${cat}:${cid}`);
const optState=(qq,s)=>{const x=qq.options.find(o=>o.state===s);if(!x)throw new Error(`missing ${s} ${qq.id}`);return x.optionIndex;};
const maxOpt=qq=>{const a=qq.options.filter(o=>o.score!==null).sort((a,b)=>b.score-a.score);if(!a.length)throw new Error(`no scored ${qq.id}`);return a[0].optionIndex;};
const ctxOpt=qq=>{const x=qq.options.find(o=>!['DNK','UNAVAILABLE'].includes(o.state));if(!x)throw new Error(`no context ${qq.id}`);return x.optionIndex;};
const ev=(cat,cid,p,oi,auth=.9)=>evidenceFromAnswer({definition:def,question:q(cat,cid,p),optionIndex:oi,explicitAuthority:auth});
const state=(snap,cat,cid)=>snap.cells.get(`${cat}:${cid}`);
const routeInput=(evidence,mode='FULL',gates=new Map())=>({mode,evidence,askedQuestionIds:new Set(evidence.map(e=>e.questionId)),snapshot:calculateRuntimeSnapshot(def,evidence),profileAnswers:[],applicabilityByGate:gates});

check('64 categories',def.categories.length===64,def.categories.length);
check('48 dimensions',def.cells.length===48,def.cells.length);
check('3072 cell instances',def.categories.length*def.cells.length===3072);
check('12288 questions',def.questions.length===12288,def.questions.length);

const mtm=bundle.contracts['MMRI_FINAL_Many_to_Many_Mapping.json'];
const d45Edges=mtm.edges.filter(e=>e.targetCell==='C45');
check('D45 has exactly governed C11/C31/C47 incoming edges',d45Edges.length===3&&['C11','C31','C47'].every(s=>d45Edges.some(e=>e.sourceCell===s)),JSON.stringify(d45Edges));
check('derived evidence cannot finalize',bundle.contracts['MMRI_FINAL_Confidence_Contract.json'].derived.canFinalize===false,String(bundle.contracts['MMRI_FINAL_Confidence_Contract.json'].derived.canFinalize));

let gates=0,contexts=0,infer=0,direct=0,conditional=0;
const inferCats=[];
const reps=new Map();
for(const cat of def.categories){
 for(const cd of def.cells){
  const pol=cp(cat.id,cd.id); const qs=[1,2,3,4].map(p=>q(cat.id,cd.id,p));
  if(cd.id==='C01'){
    gates++;
    check(`gate ${cat.id} four direct paths`,pol.maxDirectQuestions===4&&qs.every(x=>rp(x).directAskAllowed),`${pol.maxDirectQuestions}`);
    continue;
  }
  if(cd.id==='C42'){
    contexts++;
    check(`context ${cat.id}:C42 non-scoring askable`,qs.every(x=>rp(x).directAskAllowed&&!rp(x).scoreEligible),'');
    continue;
  }
  if(pol.applicabilityMode==='INFER_ONLY'){
    infer++; inferCats.push(cat.id);
    check(`infer ${cat.id}:C45 no direct ask`,pol.maxDirectQuestions===0&&qs.every(x=>!rp(x).directAskAllowed),`${pol.maxDirectQuestions}`);
    continue;
  }
  direct++;
  const scored=qs.filter(x=>rp(x).scoreEligible&&rp(x).directAskAllowed);
  check(`direct ${cat.id}:${cd.id} >=3 scored paths`,scored.length>=3,String(scored.length));
  if(['C02','C41','C43','C44'].includes(cd.id)) check(`critical ${cat.id}:${cd.id} Q3 record`,rp(q(cat.id,cd.id,3)).scoreEligible&&q(cat.id,cd.id,3).sourceKind==='RECORD_CHECK','');
  if(pol.applicabilityMode==='CONDITIONAL'){
    conditional++;
    check(`conditional ${cat.id}:${cd.id} all paths N/A+DNK`,qs.every(qq=>qq.options.some(o=>o.state==='N_A_CLAIM')&&qq.options.some(o=>o.state==='DNK')),'');
  }
  if(!reps.has(cd.id)) reps.set(cd.id,cat.id);
 }
}
check('64 category gates',gates===64,gates);
check('64 context cells',contexts===64,contexts);
check('33 infer-only cells',infer===33,infer);
check('2911 direct maturity cells',direct===2911,direct);
check('328 conditional direct cells',conditional===328,conditional);

// Dynamic representative for every maturity dimension that is directly measurable.
let repFinal=0;
for(const [cid,cat] of reps){
  if(cid==='C42') continue;
  const scored=[1,2,3,4].filter(p=>rp(q(cat,cid,p)).scoreEligible);
  const e=scored.slice(0,3).map(p=>ev(cat,cid,p,maxOpt(q(cat,cid,p))));
  const st=state(calculateRuntimeSnapshot(def,e),cat,cid);
  const ok=st.status==='DIRECT_FINAL'&&st.locked===true&&st.effectiveScore!==null&&st.effectiveConfidence>=.8;
  check(`dimension representative ${cid} can final`,ok,JSON.stringify({cat,status:st.status,score:st.effectiveScore,conf:st.effectiveConfidence}));
  if(ok) repFinal++;
}
check('all directly measured dimension representatives finalize',repFinal===reps.size,`${repFinal}/${reps.size}`);

// C01 exclusion/relevance behavior.
{
 const cat='MS01';
 const low=p=>ev(cat,'C01',p,optState(q(cat,'C01',p),'N_A_CLAIM'));
 let e=[low(1)], input=routeInput(e), st=state(input.snapshot,cat,'C01');
 check('C01 one low not excluded',st.status!=='NOT_APPLICABLE',st.status);
 check('C01 one low keeps relevance unresolved',st.applicabilityRelevance===null,String(st.applicabilityRelevance));
 check('C01 Q2 reachable',rankAdaptiveV13Questions(def,input).some(x=>x.question.id===q(cat,'C01',2).id),'');
 e=[low(1),low(2)]; input=routeInput(e); st=state(input.snapshot,cat,'C01');
 check('C01 two low not excluded',st.status!=='NOT_APPLICABLE',st.status);
 check('C01 Q3 reachable',rankAdaptiveV13Questions(def,input).some(x=>x.question.id===q(cat,'C01',3).id),'');
 e=[low(1),low(2),low(3)]; input=routeInput(e); st=state(input.snapshot,cat,'C01');
 check('C01 three low excludes',st.status==='NOT_APPLICABLE',JSON.stringify({status:st.status,conf:st.naClaimConfidence}));
 check('C01 three-low confidence >=.8',st.naClaimConfidence>=.8,String(st.naClaimConfidence));
 e=[low(1),low(2),ev(cat,'C01',3,optState(q(cat,'C01',3),'APPLICABLE'))]; input=routeInput(e); st=state(input.snapshot,cat,'C01');
 check('C01 positive evidence blocks exclusion',st.status!=='NOT_APPLICABLE',st.status);
 check('C01 positive evidence makes downstream reachable',rankAdaptiveV13Questions(def,input).some(x=>x.question.categoryId===cat&&x.question.cellId!=='C01'),'');
 const dnk=[1,2,3,4].map(p=>ev(cat,'C01',p,optState(q(cat,'C01',p),'DNK'))); st=state(calculateRuntimeSnapshot(def,dnk),cat,'C01');
 check('C01 all DNK unresolved',st.status==='UNRESOLVED'&&st.exhausted,JSON.stringify({status:st.status,exhausted:st.exhausted}));
}

// Dynamic conditional tests by each conditional dimension representative.
const conditionalDims=[...new Set(def.categories.flatMap(cat=>def.cells.filter(cd=>cp(cat.id,cd.id).applicabilityMode==='CONDITIONAL').map(cd=>cd.id)))];
for(const cid of conditionalDims){
 const cat=def.categories.find(c=>cp(c.id,cid).applicabilityMode==='CONDITIONAL').id;
 const capGate=new Map([[`${cat}:CAPABILITY_RELEVANT`,'TRUE']]);
 const na=p=>ev(cat,cid,p,optState(q(cat,cid,p),'N_A_CLAIM'));
 let e=[na(1)], input=routeInput(e,'FULL',capGate);
 check(`${cid} N/A Q2 reachable`,rankAdaptiveV13Questions(def,input).some(x=>x.question.id===q(cat,cid,2).id),'');
 e=[na(1),na(2)]; input=routeInput(e,'FULL',capGate);
 check(`${cid} N/A Q3 reachable`,rankAdaptiveV13Questions(def,input).some(x=>x.question.id===q(cat,cid,3).id),'');
 e=[na(1),na(2),na(3)]; let st=state(calculateRuntimeSnapshot(def,e),cat,cid);
 check(`${cid} three N/A confirms`,st.status==='NOT_APPLICABLE'&&st.naClaimConfidence>=.8,JSON.stringify({status:st.status,conf:st.naClaimConfidence}));
 let d=[]; let chain=true;
 for(let p=1;p<=4;p++){
   if(p>1){ input=routeInput(d,'FULL',capGate); if(!rankAdaptiveV13Questions(def,input).some(x=>x.question.id===q(cat,cid,p).id)) chain=false; }
   d.push(ev(cat,cid,p,optState(q(cat,cid,p),'DNK')));
 }
 st=state(calculateRuntimeSnapshot(def,d),cat,cid);
 check(`${cid} DNK four-path recovery`,chain&&st.status==='UNRESOLVED'&&st.exhausted&&st.effectiveScore===null,JSON.stringify({chain,status:st.status,exhausted:st.exhausted}));
}

// All 33 infer-only cell instances dynamically derive from C11/C31/C47.
let inferOk=0;
for(const cat of inferCats){
 const e=[];
 for(const src of ['C11','C31','C47']) for(const p of [1,2,3]) e.push(ev(cat,src,p,maxOpt(q(cat,src,p))));
 const st=state(calculateRuntimeSnapshot(def,e),cat,'C45');
 const ok=st.status==='DERIVED_PROVISIONAL'&&st.confidenceState==='ESTIMATED'&&st.effectiveScore!==null&&st.effectiveConfidence>0&&st.effectiveConfidence<=.45+1e-9&&st.derivedContributions.length===3;
 check(`infer ${cat}:C45 derives`,ok,JSON.stringify({status:st.status,score:st.effectiveScore,conf:st.effectiveConfidence,sources:st.derivedContributions.map(x=>x.sourceCellId)}));
 if(ok) inferOk++;
}
check('all infer-only instances derive',inferOk===33,`${inferOk}/33`);

// Context-only C42 representative collects all paths without entering maturity score.
{
 const cat='MS01'; const e=[1,2,3,4].map(p=>ev(cat,'C42',p,ctxOpt(q(cat,'C42',p)))); const st=state(calculateRuntimeSnapshot(def,e),cat,'C42');
 check('C42 context exhausted but non-scoring',st.effectiveScore===null&&st.exhausted===true,JSON.stringify({status:st.status,score:st.effectiveScore,exhausted:st.exhausted}));
}

// Ideal evidence for all 64 categories: all required maturity values reachable, official score and FULL terminal achieved.
const full=[];
for(const cat of def.categories){
 full.push(ev(cat.id,'C01',1,optState(q(cat.id,'C01',1),'APPLICABLE')));
 for(const cd of def.cells){
  const pol=cp(cat.id,cd.id); if(cd.id==='C01'||pol.applicabilityMode==='INFER_ONLY') continue;
  if(cd.id==='C42'){for(const p of [1,2,3,4]) full.push(ev(cat.id,cd.id,p,ctxOpt(q(cat.id,cd.id,p)))); continue;}
  const scored=[1,2,3,4].filter(p=>rp(q(cat.id,cd.id,p)).scoreEligible);
  for(const p of scored.slice(0,3)) full.push(ev(cat.id,cd.id,p,maxOpt(q(cat.id,cd.id,p))));
  if(cd.id==='C44') full.push(ev(cat.id,cd.id,4,ctxOpt(q(cat.id,cd.id,4))));
 }
}
const fullSnap=calculateRuntimeSnapshot(def,full);
let nullMaturity=0,wrongInfer=0;
for(const cat of def.categories) for(const cd of def.cells){
 if(['C01','C42'].includes(cd.id)) continue; const pol=cp(cat.id,cd.id), st=state(fullSnap,cat.id,cd.id); if(st.status==='NOT_APPLICABLE') continue;
 if(st.effectiveScore===null) nullMaturity++; if(pol.applicabilityMode==='INFER_ONLY'&&st.status!=='DERIVED_PROVISIONAL') wrongInfer++;
}
check('ideal matrix has no maturity nulls',nullMaturity===0,nullMaturity);
check('ideal matrix all infer-only derived',wrongInfer===0,wrongInfer);
check('ideal matrix coverage 100%',Math.abs((fullSnap.overall.coverage??0)-1)<1e-12,String(fullSnap.overall.coverage));
check('ideal matrix official score 100',fullSnap.overall.officialScore===100,String(fullSnap.overall.officialScore));
const decision=routeNextQuestion(def,{mode:'FULL',evidence:full,askedQuestionIds:new Set(full.map(e=>e.questionId)),snapshot:fullSnap,profileAnswers:[],applicabilityByGate:new Map()});
check('ideal matrix FULL_COMPLETE',decision.state==='FULL_COMPLETE',JSON.stringify(decision));

// Incorrect finalization guard: low-authority exhausted evidence stays review-required.
{
 const cat='MS01',cid='C03'; const e=[1,2,3,4].map(p=>ev(cat,cid,p,maxOpt(q(cat,cid,p)),.4)); const st=state(calculateRuntimeSnapshot(def,e),cat,cid);
 check('low-authority cannot finalize',st.status==='REVIEW_REQUIRED'&&!st.locked&&st.exhausted,JSON.stringify({status:st.status,locked:st.locked,exhausted:st.exhausted,auth:st.maxAcceptedAuthority}));
}

const result={schema:'mmri.step05_of15.cell_reachability.regression.v2',status:failures.length?'FAIL':'PASS',checksPassed:checks.filter(x=>x.pass).length,checksTotal:checks.length,failures,summary:{gates,contexts,infer,direct,conditional,directDimensionRepresentatives:reps.size,conditionalDimensions:conditionalDims,inferOk,fullEvidenceCount:full.length,fullOverall:fullSnap.overall,fullTerminal:decision.state},checks};
fs.writeFileSync('../STEP05_CELL_REACHABILITY_REGRESSION.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({status:result.status,checksPassed:result.checksPassed,checksTotal:result.checksTotal,failures:failures.slice(0,10),summary:result.summary},null,2));
if(failures.length) process.exit(1);
