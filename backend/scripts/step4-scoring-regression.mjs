import fs from 'node:fs';
import {
  buildDefinition,
  calculateRuntimeSnapshot,
  calculateAggregateSnapshots,
  evidenceFromAnswer,
  validateHierarchicalWeights
} from '../dist-engine/engine/index.js';

const bundle=JSON.parse(fs.readFileSync('methodology/MMRI_v3.0.3_QBANK_v3.1.3_STEP6_OF6_ACCEPTED_FINAL.json','utf8'));
const def=buildDefinition(bundle);
const checks=[];
const check=(name,pass,detail='')=>{checks.push({name,pass:Boolean(pass),detail}); if(!pass) throw new Error(`FAIL ${name}: ${detail}`)};
const close=(name,a,b,tol=1e-4)=>check(name,a!==null&&Math.abs(a-b)<=tol,`actual=${a} expected=${b}`);
const inRange=(v,min,max)=>v===null||(Number.isFinite(v)&&v>=min-1e-9&&v<=max+1e-9);

const validation=validateHierarchicalWeights(def.modules,def.categories,def.cells);
close('module weight total 100',validation.moduleWeightTotal,100);
close('category weight total 100',validation.capabilityWeightTotal,100);
close('structural cell weight total 100',validation.scoredCellWeightTotal,100);

function q(categoryId,cellId,path){
  const out=def.questionByCategoryCellPath.get(`${categoryId}:${cellId}:${path}`);
  if(!out) throw new Error(`missing question ${categoryId}:${cellId}:${path}`);
  return out;
}
function ev(categoryId,cellId,path,optionIndex,authority=.9){
  return evidenceFromAnswer({definition:def,question:q(categoryId,cellId,path),optionIndex,explicitAuthority:authority});
}
function cell(snapshot,categoryId,cellId){return snapshot.cells.get(`${categoryId}:${cellId}`)}

// Ordinary coherent scoring: score is arithmetic mean, not median.
let snap=calculateRuntimeSnapshot(def,[ev('MS01','C03',1,2),ev('MS01','C03',2,3),ev('MS01','C03',3,3)]);
let c=cell(snap,'MS01','C03');
close('ordinary direct score arithmetic mean',c.directScore,(25+50+50)/3);
close('ordinary effective score arithmetic mean',c.effectiveScore,(25+50+50)/3);
check('ordinary score locked with sufficient evidence',c.status==='DIRECT_FINAL',c.status);
check('ordinary cell score stays full precision',Math.abs(c.directScore-41.666666666666664)<1e-10,String(c.directScore));

// Verified outlier resolution: Q3-backed coherent cluster determines the locked score.
snap=calculateRuntimeSnapshot(def,[ev('MS01','C03',1,1),ev('MS01','C03',2,5),ev('MS01','C03',3,5)]);
c=cell(snap,'MS01','C03');
close('q3 verified outlier uses verified cluster mean',c.directScore,100);
check('q3 verified outlier locks',c.status==='DIRECT_FINAL',`${c.status}/${c.lockReason}`);

// Critical verification contradiction: Q1/Q2 cannot overrule Q3; provisional score still averages all evidence.
snap=calculateRuntimeSnapshot(def,[ev('MS01','C41',1,6),ev('MS01','C41',2,6),ev('MS01','C41',3,1)]);
c=cell(snap,'MS01','C41');
close('critical q3 conflict provisional mean',c.directScore,(100+100+0)/3);
check('critical q3 conflict review required',c.status==='REVIEW_REQUIRED',c.status);
check('critical q3 conflict not locked',c.locked===false,String(c.locked));
check('critical q3 conflict confidence capped',c.effectiveConfidence<=.65+1e-9,String(c.effectiveConfidence));

// Critical verification supports high cluster: verified cluster may resolve the self-report outlier.
snap=calculateRuntimeSnapshot(def,[ev('MS01','C41',1,1),ev('MS01','C41',2,6),ev('MS01','C41',3,6)]);
c=cell(snap,'MS01','C41');
close('critical q3 verified cluster score',c.directScore,100);
check('critical q3 verified cluster locks',c.status==='DIRECT_FINAL',`${c.status}/${c.lockReason}`);

// D42 is context only and never creates maturity score.
snap=calculateRuntimeSnapshot(def,[ev('MS01','C42',1,3),ev('MS01','C42',2,3),ev('MS01','C42',3,3),ev('MS01','C42',4,3)]);
c=cell(snap,'MS01','C42');
check('d42 direct score null',c.directScore===null,String(c.directScore));
check('d42 effective score null',c.effectiveScore===null,String(c.effectiveScore));

// D44 Q4 cannot alter the Q1-Q3 maturity score.
const d44base=[ev('MS01','C44',1,2),ev('MS01','C44',2,3),ev('MS01','C44',3,3)];
const d44a=calculateRuntimeSnapshot(def,d44base);
const d44b=calculateRuntimeSnapshot(def,[...d44base,ev('MS01','C44',4,5)]);
close('d44 context q4 does not change score',cell(d44b,'MS01','C44').effectiveScore,cell(d44a,'MS01','C44').effectiveScore);
check('d44 q4 context score remains based on three scored answers',cell(d44b,'MS01','C44').directAnswerCount===3,String(cell(d44b,'MS01','C44').directAnswerCount));

function baseCell(categoryId,cellId,overrides={}){
  return {categoryId,cellId,status:'DIRECT_FINAL',directScore:50,directConfidence:.9,derivedScore:null,derivedConfidence:0,effectiveScore:50,effectiveConfidence:.9,directAnswerCount:3,independentSourceKinds:1,maxAcceptedAuthority:.9,naClaimCount:0,naClaimConfidence:0,applicabilityRelevance:null,hasHardContradiction:false,hasSameCellVariance:false,hasSecondaryTension:false,hardContradictionRuleIds:[],tensionRuleIds:[],directEvidence:[],derivedContributions:[],exhausted:false,confidenceState:'LOCKED',locked:true,lockReason:'TEST',scoreDispersion:0,clusterSize:3,evidenceCount:3,...overrides};
}
function matrix({score=50,categoryScores=new Map(),naCategories=new Set(),naCells=new Set(),missingCells=new Set(),d45InferScore=null}={}){
  const cells=new Map();
  for(const cat of def.categories){
    const catScore=categoryScores.has(cat.id)?categoryScores.get(cat.id):score;
    for(const cd of def.cells){
      const key=`${cat.id}:${cd.id}`;
      if(cd.id==='C01'){
        const na=naCategories.has(cat.id);
        cells.set(key,baseCell(cat.id,cd.id,na?{status:'NOT_APPLICABLE',directScore:null,effectiveScore:null,directConfidence:0,effectiveConfidence:0,confidenceState:'NOT_APPLICABLE',locked:false}:{status:'GATHERING',directScore:null,effectiveScore:null,directConfidence:0,effectiveConfidence:0,confidenceState:'UNASSESSED',locked:false}));
      } else if(cd.id==='C42'){
        cells.set(key,baseCell(cat.id,cd.id,{status:'GATHERING',directScore:null,effectiveScore:null,directConfidence:0,effectiveConfidence:0,confidenceState:'UNASSESSED',locked:false}));
      } else if(naCells.has(key)){
        cells.set(key,baseCell(cat.id,cd.id,{status:'NOT_APPLICABLE',directScore:null,effectiveScore:null,directConfidence:0,effectiveConfidence:.9,confidenceState:'NOT_APPLICABLE',locked:false}));
      } else if(missingCells.has(key)){
        cells.set(key,baseCell(cat.id,cd.id,{status:'UNASSESSED',directScore:null,effectiveScore:null,directConfidence:0,effectiveConfidence:0,confidenceState:'UNASSESSED',locked:false}));
      } else if(cd.id==='C45' && d45InferScore!==null && ['MS12','MS13','MS14','MS15','MS25','MS26','MS29','MS33','MS34','MS35','MS37','MS38','MS46','MS64'].includes(cat.id)){
        cells.set(key,baseCell(cat.id,cd.id,{status:'DERIVED_PROVISIONAL',directScore:null,directConfidence:0,derivedScore:d45InferScore,derivedConfidence:.45,effectiveScore:d45InferScore,effectiveConfidence:.45,confidenceState:'ESTIMATED',locked:false}));
      } else {
        cells.set(key,baseCell(cat.id,cd.id,{directScore:catScore,effectiveScore:catScore}));
      }
    }
  }
  return cells;
}

// Context-only D42 excluded from maturity denominator; all-50 matrix stays exactly 50.
let agg=calculateAggregateSnapshots(def,matrix({score:50}));
for(const cat of def.categories){
  close(`${cat.id} all50 category score`,agg.categories.get(cat.id).officialScore,50);
  check(`${cat.id} maturity cell count 46`,agg.categories.get(cat.id).applicableCellCount===46,String(agg.categories.get(cat.id).applicableCellCount));
}
close('all50 overall exact 50',agg.overall.officialScore,50);
check('all50 overall within range',inRange(agg.overall.officialScore,0,100),String(agg.overall.officialScore));

// D45 infer-only values must stay in maturity scoring, not disappear because direct questions are NS.
agg=calculateAggregateSnapshots(def,matrix({score:50,d45InferScore:100}));
const inferCat=agg.categories.get('MS12');
const expectedInfer=(50*(97.5-2.6)+100*2.6)/97.5;
close('infer-only d45 contributes to category score',inferCat.partialScore,expectedInfer);
check('infer-only d45 included in applicable count',inferCat.applicableCellCount===46,String(inferCat.applicableCellCount));

// Dimension weights matter: the 5% effectiveness cell must move the category more than a 1.2% cadence cell.
const base50=matrix({score:50});
const c41High=new Map(base50);
c41High.set('MS01:C41',baseCell('MS01','C41',{directScore:100,effectiveScore:100}));
const c12High=new Map(base50);
c12High.set('MS01:C12',baseCell('MS01','C12',{directScore:100,effectiveScore:100}));
const aggBase=calculateAggregateSnapshots(def,base50);
const aggC41=calculateAggregateSnapshots(def,c41High);
const aggC12=calculateAggregateSnapshots(def,c12High);
const deltaC41=aggC41.categories.get('MS01').officialScore-aggBase.categories.get('MS01').officialScore;
const deltaC12=aggC12.categories.get('MS01').officialScore-aggBase.categories.get('MS01').officialScore;
check('high-weight c41 moves category more than c12',deltaC41>deltaC12,`C41=${deltaC41} C12=${deltaC12}`);
close('c41 weighted delta',deltaC41,50*5/97.5);
close('c12 weighted delta',deltaC12,50*1.2/97.5);

// Even if a synthetic state accidentally carries a D42 numeric value, context-only D42 cannot move maturity score.
const d42Synthetic=new Map(base50);
d42Synthetic.set('MS01:C42',baseCell('MS01','C42',{directScore:100,effectiveScore:100}));
const aggD42Synthetic=calculateAggregateSnapshots(def,d42Synthetic);
close('d42 synthetic numeric value cannot affect category maturity',aggD42Synthetic.categories.get('MS01').officialScore,aggBase.categories.get('MS01').officialScore);

// Missing evidence is not zero and withholds official score.
agg=calculateAggregateSnapshots(def,matrix({score:50,missingCells:new Set(['MS01:C02'])}));
close('missing cell partial score not zeroed',agg.categories.get('MS01').partialScore,50);
check('missing cell lowers coverage',agg.categories.get('MS01').coverage<1&&agg.categories.get('MS01').coverage>0,String(agg.categories.get('MS01').coverage));
check('missing cell withholds category official',agg.categories.get('MS01').officialScore===null,String(agg.categories.get('MS01').officialScore));
check('missing category withholds overall official',agg.overall.officialScore===null,String(agg.overall.officialScore));

// Confirmed cell N/A removes its weight from denominator and does not lower score.
agg=calculateAggregateSnapshots(def,matrix({score:50,naCells:new Set(['MS01:C24'])}));
close('confirmed cell na does not lower score',agg.categories.get('MS01').officialScore,50);
check('confirmed cell na reduces applicable count',agg.categories.get('MS01').applicableCellCount===45,String(agg.categories.get('MS01').applicableCellCount));
close('confirmed cell na coverage full over applicable denominator',agg.categories.get('MS01').coverage,1);

// Confirmed category N/A redistributes inside its module; whole-module N/A renormalizes remaining top-level module weights.
const catScores=new Map(def.categories.map((cat,i)=>[cat.id,(i*17)%101]));
agg=calculateAggregateSnapshots(def,matrix({categoryScores:catScores,naCategories:new Set(['MS01'])}));
check('category na removed',agg.categories.get('MS01').confirmedNotApplicable===true);
const firstModule=def.modules[0];
const rows=def.categories.filter(x=>x.module===firstModule.id&&x.id!=='MS01');
const expectedM=rows.reduce((s,x)=>s+catScores.get(x.id)*x.weightPct,0)/rows.reduce((s,x)=>s+x.weightPct,0);
close('category na reweights within module',agg.modules.get(firstModule.id).officialScore,expectedM);
const lastModule=def.modules.at(-1);
const naLast=new Set(def.categories.filter(c=>c.module===lastModule.id).map(c=>c.id));
agg=calculateAggregateSnapshots(def,matrix({categoryScores:catScores,naCategories:naLast}));
check('whole module na leaves 7 applicable modules',agg.overall.applicableModuleCount===7,String(agg.overall.applicableModuleCount));
const rem=def.modules.filter(m=>m.id!==lastModule.id);
const remWeight=rem.reduce((s,m)=>s+m.weightPct,0);
const expectedOverall=rem.reduce((s,m)=>s+agg.modules.get(m.id).officialScore*m.weightPct,0)/remWeight;
close('whole module na renormalizes module weights',agg.overall.officialScore,expectedOverall);

// Extremes and precision/clamping.
for(const score of [0,100]){
  agg=calculateAggregateSnapshots(def,matrix({score}));
  close(`all${score} overall`,agg.overall.officialScore,score);
  if(score===100) check('all100 overall has no floating overshoot',agg.overall.officialScore===100,String(agg.overall.officialScore));
  for(const state of [...agg.categories.values(),...agg.modules.values()]){
    check(`all${score} score range ${'categoryId' in state?state.categoryId:state.moduleId}`,inRange(state.partialScore,0,100)&&inRange(state.officialScore,0,100));
    check(`all${score} unit range ${'categoryId' in state?state.categoryId:state.moduleId}`,inRange(state.confidence,0,1)&&inRange(state.coverage,0,1));
  }
}

// Purpose scores stay bounded and preserve N/A filtering.
agg=calculateAggregateSnapshots(def,matrix({categoryScores:catScores,naCategories:new Set(['MS01','MS02'])}));
check('five purposes',agg.purposes.size===5,String(agg.purposes.size));
for(const [id,p] of agg.purposes){
  check(`purpose ${id} score range`,inRange(p.partialScore,0,100)&&inRange(p.officialScore,0,100));
  check(`purpose ${id} unit range`,inRange(p.confidence,0,1)&&inRange(p.coverage,0,1));
}
for(const [id,p] of agg.outcomePriorities){
  check(`priority ${id} known gap range`,inRange(p.knownGap,0,100));
  check(`priority ${id} confidence adjusted gap range`,inRange(p.confidenceAdjustedKnownGap,0,100));
  check(`priority ${id} uncertainty gap range`,inRange(p.uncertaintyKnownGap,0,100));
}

// Published aggregate contributions should reconcile within the declared 4dp precision.
for(const module of def.modules){
  const m=agg.modules.get(module.id);
  if(m.partialScore!==null){
    const sum=def.categories.filter(c=>c.module===module.id).reduce((s,c)=>s+(agg.categories.get(c.id).partialContributionToModule??0),0);
    close(`module contribution reconciliation ${module.code}`,sum,m.partialScore,.002);
  }
}
if(agg.overall.partialScore!==null){
  const sum=[...agg.modules.values()].reduce((s,m)=>s+(m.partialContribution??0),0);
  close('overall partial contribution reconciliation',sum,agg.overall.partialScore,.002);
}

// Deterministic randomized stress: no aggregate may escape its legal range.
let seed=31041;
const rnd=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/2**32;};
for(let scenario=0;scenario<25;scenario++){
  const cm=new Map(def.categories.map(c=>[c.id,rnd()*100]));
  const naCats=new Set(def.categories.filter(()=>rnd()<0.08).map(c=>c.id));
  const a=calculateAggregateSnapshots(def,matrix({categoryScores:cm,naCategories:naCats}));
  check(`random ${scenario} overall score range`,inRange(a.overall.partialScore,0,100)&&inRange(a.overall.officialScore,0,100),JSON.stringify(a.overall));
  check(`random ${scenario} overall unit range`,inRange(a.overall.confidence,0,1)&&inRange(a.overall.coverage,0,1),JSON.stringify(a.overall));
  for(const st of a.categories.values()) check(`random ${scenario} category ${st.categoryId} range`,inRange(st.partialScore,0,100)&&inRange(st.officialScore,0,100)&&inRange(st.confidence,0,1)&&inRange(st.coverage,0,1));
  for(const st of a.modules.values()) check(`random ${scenario} module ${st.moduleId} range`,inRange(st.partialScore,0,100)&&inRange(st.officialScore,0,100)&&inRange(st.confidence,0,1)&&inRange(st.coverage,0,1));
}

const result={schema:'mmri.step04_of15.scoring.regression.v1',status:'PASS',checksPassed:checks.length,checksTotal:checks.length,summary:{ordinaryMean:41.6667,q3VerifiedCluster:100,criticalQ3Conflict:66.6667,inferOnlyD45CategoryScore:inferCat.partialScore,all50Overall:50},checks};
fs.writeFileSync('../STEP04_SCORING_REGRESSION.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({status:result.status,checksPassed:result.checksPassed,checksTotal:result.checksTotal,summary:result.summary},null,2));
