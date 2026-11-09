import fs from 'node:fs';
import {
  buildDefinition,
  calculateRuntimeSnapshot,
  calculateAggregateSnapshots,
  evidenceFromAnswer
} from '../dist-engine/engine/index.js';

const bundleFiles = [
  'methodology/MMRI_v3.0.3_QBANK_v3.1.3_STEP6_OF6_ACCEPTED_FINAL.json',
  'methodology/businessmri-v2.5-runtime-bundles/MMRI_ISMRI_Methodology_4.3.5_BUSINESSMRI_V2.json',
  'methodology/businessmri-v2.5-runtime-bundles/MMRI_FINMRI_Methodology_4.2.5_BUSINESSMRI_V2.json',
  'methodology/businessmri-v2.5-runtime-bundles/MMRI_HRMRI_Methodology_4.1.5_BUSINESSMRI_V2.json',
  'methodology/businessmri-v2.5-runtime-bundles/MMRI_OPMRI_Methodology_4.4.5_BUSINESSMRI_V2.json'
];

const checks=[];
function check(name, pass, detail=''){
  checks.push({name,pass:Boolean(pass),detail});
  if(!pass) throw new Error(`FAIL ${name}: ${detail}`);
}
function close(name,a,b,tol=1e-6){check(name,a!==null&&Number.isFinite(a)&&Math.abs(a-b)<=tol,`actual=${a} expected=${b}`)}

function question(def, categoryId, cellId, path){
  const q=def.questionByCategoryCellPath.get(`${categoryId}:${cellId}:${path}`);
  if(!q) throw new Error(`Missing question ${categoryId}:${cellId}:${path}`);
  return q;
}
function optionIndexByState(q,state){
  const o=q.options.find(x=>x.state===state);
  if(!o) throw new Error(`Missing ${state} option on ${q.id}`);
  return o.optionIndex;
}
function positiveApplicabilityOption(q){
  const o=q.options.find(x=>['APPLICABLE','MOSTLY_APPLICABLE','PARTIAL_APPLICABILITY'].includes(x.state))
    ?? q.options.find(x=>x.optionIndex===1&&!['N_A_CLAIM','DNK'].includes(x.state));
  if(!o) throw new Error(`Missing positive applicability option on ${q.id}`);
  return o.optionIndex;
}
function scoredOption(q){
  const o=q.options.find(x=>x.state==='SCORED'&&x.score!==null);
  if(!o) throw new Error(`Missing scored option on ${q.id}`);
  return o.optionIndex;
}
function ev(def,q,optionIndex){
  return evidenceFromAnswer({definition:def,question:q,optionIndex,explicitAuthority:1});
}
function cell(snap,cat,cellId){return snap.cells.get(`${cat}:${cellId}`)}

function isMaturityScored(def,cat,cellId){
  if(cellId==='C01') return false;
  for(let path=1;path<=4;path++){
    const q=def.questionByCategoryCellPath.get(`${cat}:${cellId}:${path}`);
    if(q?.options.some(o=>o.score!==null)) return true;
  }
  return false;
}
function baseCell(categoryId,cellId,overrides={}){
  return {
    categoryId,cellId,status:'DIRECT_FINAL',directScore:50,directConfidence:.9,derivedScore:null,derivedConfidence:0,
    effectiveScore:50,effectiveConfidence:.9,directAnswerCount:3,independentSourceKinds:1,maxAcceptedAuthority:1,
    naClaimCount:0,naClaimConfidence:0,applicabilityRelevance:null,hasHardContradiction:false,hasSameCellVariance:false,
    hasSecondaryTension:false,hardContradictionRuleIds:[],tensionRuleIds:[],directEvidence:[],derivedContributions:[],
    exhausted:false,confidenceState:'LOCKED',locked:true,lockReason:'TASK05_TEST',scoreDispersion:0,clusterSize:3,evidenceCount:3,
    ...overrides
  };
}
function matrix(def,{categoryScores=new Map(),naCategories=new Set(),naCells=new Set(),missingCells=new Set()}={}){
  const cells=new Map();
  for(const cat of def.categories){
    const score=categoryScores.get(cat.id)??50;
    for(const cd of def.cells){
      const key=`${cat.id}:${cd.id}`;
      if(cd.id==='C01'){
        const na=naCategories.has(cat.id);
        cells.set(key,baseCell(cat.id,cd.id,na?{
          status:'NOT_APPLICABLE',directScore:null,effectiveScore:null,directConfidence:0,effectiveConfidence:.9,
          confidenceState:'NOT_APPLICABLE',locked:true,applicabilityRelevance:0
        }:{
          status:'DIRECT_FINAL',directScore:null,effectiveScore:null,directConfidence:1,effectiveConfidence:1,
          confidenceState:'LOCKED',locked:true,applicabilityRelevance:1
        }));
      } else if(naCells.has(key)){
        cells.set(key,baseCell(cat.id,cd.id,{status:'NOT_APPLICABLE',directScore:null,effectiveScore:null,directConfidence:0,effectiveConfidence:.9,confidenceState:'NOT_APPLICABLE',locked:true}));
      } else if(missingCells.has(key)){
        cells.set(key,baseCell(cat.id,cd.id,{status:'GATHERING',directScore:null,effectiveScore:null,directConfidence:0,effectiveConfidence:0,confidenceState:'UNKNOWN',locked:false}));
      } else {
        cells.set(key,baseCell(cat.id,cd.id,{directScore:score,effectiveScore:score}));
      }
    }
  }
  return cells;
}

for(const file of bundleFiles){
  const bundle=JSON.parse(fs.readFileSync(file,'utf8'));
  const def=buildDefinition(bundle);
  const domain=def.domainCode;
  const cat=def.categories[0].id;

  const c01q=[1,2,3,4].map(path=>question(def,cat,'C01',path));
  const naC01=c01q.map(q=>optionIndexByState(q,'N_A_CLAIM'));
  const dnkC01=optionIndexByState(c01q[0],'DNK');
  const yesC01=positiveApplicabilityOption(c01q[0]);

  let snap=calculateRuntimeSnapshot(def,[ev(def,c01q[0],yesC01)]);
  check(`${domain} affirmative applicability is recognized`,cell(snap,cat,'C01').applicabilityRelevance!==null&&cell(snap,cat,'C01').applicabilityRelevance>0.20,JSON.stringify(cell(snap,cat,'C01')));
  check(`${domain} affirmative applicability keeps category`,snap.categories.get(cat).confirmedNotApplicable===false);

  snap=calculateRuntimeSnapshot(def,[ev(def,c01q[0],naC01[0])]);
  check(`${domain} one N/A cannot exclude category`,cell(snap,cat,'C01').status!=='NOT_APPLICABLE',cell(snap,cat,'C01').status);
  check(`${domain} one N/A keeps denominator`,snap.categories.get(cat).confirmedNotApplicable===false);

  snap=calculateRuntimeSnapshot(def,[ev(def,c01q[0],naC01[0]),ev(def,c01q[1],naC01[1]),ev(def,c01q[2],naC01[2])]);
  check(`${domain} three consistent N/A claims confirm category exclusion`,cell(snap,cat,'C01').status==='NOT_APPLICABLE',`${cell(snap,cat,'C01').status}/${cell(snap,cat,'C01').naClaimConfidence}`);
  check(`${domain} confirmed category N/A removes category`,snap.categories.get(cat).confirmedNotApplicable===true);

  snap=calculateRuntimeSnapshot(def,[ev(def,c01q[0],naC01[0]),ev(def,c01q[1],positiveApplicabilityOption(c01q[1]))]);
  check(`${domain} positive applicability overrides N/A exclusion attempt`,cell(snap,cat,'C01').status!=='NOT_APPLICABLE',cell(snap,cat,'C01').status);

  snap=calculateRuntimeSnapshot(def,[ev(def,c01q[0],dnkC01)]);
  check(`${domain} DNK never means N/A`,cell(snap,cat,'C01').status!=='NOT_APPLICABLE',cell(snap,cat,'C01').status);

  const conditional=def.cells.find(cd=>{
    if(cd.id==='C01'||cd.naPolicy!=='CONDITIONAL') return false;
    try{
      return [1,2,3].every(path=>question(def,cat,cd.id,path).options.some(o=>o.state==='N_A_CLAIM'));
    }catch{return false;}
  });

  if(domain==='marketing'){
    check(`${domain} retains frozen conditional N/A cells`,Boolean(conditional));
    const cid=conditional.id;
    const mq=[1,2,3].map(path=>question(def,cat,cid,path));
    const mna=mq.map(q=>optionIndexByState(q,'N_A_CLAIM'));

    snap=calculateRuntimeSnapshot(def,[ev(def,mq[0],mna[0])]);
    check(`${domain} one cell N/A claim keeps cell applicable`,cell(snap,cat,cid).status!=='NOT_APPLICABLE',cell(snap,cat,cid).status);

    snap=calculateRuntimeSnapshot(def,[ev(def,mq[0],mna[0]),ev(def,mq[1],mna[1]),ev(def,mq[2],mna[2])]);
    check(`${domain} three cell N/A claims confirm exclusion`,cell(snap,cat,cid).status==='NOT_APPLICABLE',`${cell(snap,cat,cid).status}/${cell(snap,cat,cid).naClaimConfidence}`);

    const scoreQuestion=mq.find(q=>q.options.some(o=>o.state==='SCORED'&&o.score!==null));
    if(scoreQuestion){
      const scoreIdx=scoredOption(scoreQuestion);
      const otherNa=mq.filter(q=>q.id!==scoreQuestion.id).slice(0,2);
      snap=calculateRuntimeSnapshot(def,[ev(def,scoreQuestion,scoreIdx),...otherNa.map(q=>ev(def,q,optionIndexByState(q,'N_A_CLAIM')))]);
      check(`${domain} scored conflict prevents N/A exclusion`,cell(snap,cat,cid).status!=='NOT_APPLICABLE',cell(snap,cat,cid).status);
    }
  } else {
    check(`${domain} BusinessMRI maturity cells are N/A-disallowed by bundle`,def.cells.filter(cd=>cd.id!=='C01').every(cd=>cd.naPolicy==='DISALLOWED'));
    const candidate=def.cells.find(cd=>{
      if(cd.id==='C01') return false;
      try{return [1,2,3].every(path=>question(def,cat,cd.id,path).options.some(o=>o.state==='N_A_CLAIM'));}catch{return false;}
    });
    check(`${domain} exposes non-scoring N/A answer text without denominator exclusion`,Boolean(candidate));
    const cid=candidate.id;
    const mq=[1,2,3].map(path=>question(def,cat,cid,path));
    snap=calculateRuntimeSnapshot(def,mq.map(q=>ev(def,q,optionIndexByState(q,'N_A_CLAIM'))));
    check(`${domain} disallowed maturity N/A cannot remove cell`,cell(snap,cat,cid).status!=='NOT_APPLICABLE',cell(snap,cat,cid).status);
  }

  const scoredCells=def.cells.filter(cd=>isMaturityScored(def,cat,cd.id));
  const denominatorEligibleNa=scoredCells.find(cd=>cd.naPolicy==='CONDITIONAL');
  const target=denominatorEligibleNa??scoredCells[0];
  const baseline=calculateAggregateSnapshots(def,matrix(def));
  if(denominatorEligibleNa){
    const excluded=calculateAggregateSnapshots(def,matrix(def,{naCells:new Set([`${cat}:${target.id}`])}));
    close(`${domain} confirmed cell N/A does not score as zero`,excluded.categories.get(cat).officialScore,50);
    check(`${domain} confirmed cell N/A reduces denominator count`,excluded.categories.get(cat).applicableCellCount===baseline.categories.get(cat).applicableCellCount-1,`${excluded.categories.get(cat).applicableCellCount}/${baseline.categories.get(cat).applicableCellCount}`);
    close(`${domain} confirmed cell N/A keeps full applicable coverage`,excluded.categories.get(cat).coverage,1);
  } else {
    check(`${domain} has no maturity cell eligible to remove denominator weight`,scoredCells.every(cd=>cd.naPolicy==='DISALLOWED'));
  }

  const missing=calculateAggregateSnapshots(def,matrix(def,{missingCells:new Set([`${cat}:${target.id}`])}));
  close(`${domain} DNK/missing evidence is not zero in partial score`,missing.categories.get(cat).partialScore,50);
  check(`${domain} DNK/missing evidence withholds official score`,missing.categories.get(cat).officialScore===null,String(missing.categories.get(cat).officialScore));
  check(`${domain} DNK/missing evidence lowers coverage`,missing.categories.get(cat).coverage<1&&missing.categories.get(cat).coverage>0,String(missing.categories.get(cat).coverage));

  const categoryScores=new Map(def.categories.map((c,i)=>[c.id,(i*19+7)%101]));
  const categoryExcluded=calculateAggregateSnapshots(def,matrix(def,{categoryScores,naCategories:new Set([cat])}));
  check(`${domain} confirmed category N/A flag reaches aggregation`,categoryExcluded.categories.get(cat).confirmedNotApplicable===true);
  const module=def.modules.find(m=>m.id===def.categories.find(c=>c.id===cat).module);
  const remainingCats=def.categories.filter(c=>c.module===module.id&&c.id!==cat);
  const expectedModule=remainingCats.reduce((sum,c)=>sum+categoryScores.get(c.id)*c.weightPct,0)/remainingCats.reduce((sum,c)=>sum+c.weightPct,0);
  close(`${domain} category N/A renormalizes module denominator`,categoryExcluded.modules.get(module.id).officialScore,expectedModule);

  const lastModule=def.modules.at(-1);
  const naLast=new Set(def.categories.filter(c=>c.module===lastModule.id).map(c=>c.id));
  const moduleExcluded=calculateAggregateSnapshots(def,matrix(def,{categoryScores,naCategories:naLast}));
  check(`${domain} whole-module N/A removes module from top denominator`,moduleExcluded.overall.applicableModuleCount===def.modules.length-1,`${moduleExcluded.overall.applicableModuleCount}/${def.modules.length}`);
  const remainingModules=def.modules.filter(m=>m.id!==lastModule.id);
  const expectedOverall=remainingModules.reduce((sum,m)=>sum+moduleExcluded.modules.get(m.id).officialScore*m.weightPct,0)/remainingModules.reduce((sum,m)=>sum+m.weightPct,0);
  close(`${domain} whole-module N/A renormalizes overall denominator`,moduleExcluded.overall.officialScore,expectedOverall);
}

console.log(JSON.stringify({status:'PASS',domains:bundleFiles.length,checksPassed:checks.length,checksTotal:checks.length},null,2));
