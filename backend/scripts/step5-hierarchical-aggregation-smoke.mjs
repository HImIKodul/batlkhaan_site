import fs from 'node:fs';
import {
  buildDefinition,
  calculateAggregateSnapshots,
  validateHierarchicalWeights
} from '../dist-engine/engine/index.js';

const bundle=JSON.parse(fs.readFileSync('methodology/MMRI_v3.0.3_QBANK_v3.1.3_STEP6_OF6_ACCEPTED_FINAL.json','utf8'));
const def=buildDefinition(bundle);
def.runtimePolicy={enabled:true,questionById:new Map(),cellByCategoryCell:new Map(),ruleById:new Map(),scorePatternByCode:new Map()};

const checks=[];
const ok=(condition,name,detail='')=>{checks.push({name,pass:Boolean(condition),detail});if(!condition)throw new Error(`FAIL ${name}: ${detail}`)};
const close=(actual,expected,name,tol=1e-8)=>ok(actual!==null&&Math.abs(actual-expected)<=tol,name,`actual=${actual} expected=${expected}`);

const validation=validateHierarchicalWeights(def.modules,def.categories,def.cells);
ok(def.modules.length===8,'eight marketing modules',String(def.modules.length));
ok(def.categories.length===64,'64 weighted capabilities',String(def.categories.length));
ok(def.cells.length===48,'48 diagnostic cell templates',String(def.cells.length));
close(validation.moduleWeightTotal,100,'module weights total 100');
close(validation.capabilityWeightTotal,100,'capability weights total 100');
close(validation.scoredCellWeightTotal,100,'scored cell weights total 100');

const expectedModuleWeights=[20,15,10,10,15,15,5,10];
def.modules.forEach((m,i)=>close(m.weightPct,expectedModuleWeights[i],`module ${m.code} weight`));
for(const module of def.modules){
  const sum=def.categories.filter(c=>c.module===module.id).reduce((s,c)=>s+c.weightPct,0);
  close(sum,module.weightPct,`capability weights reconcile to ${module.code}`);
}

function baseCell(categoryId,cellId,overrides={}){
  return {
    categoryId,cellId,status:'DIRECT_FINAL',directScore:50,directConfidence:.9,derivedScore:null,derivedConfidence:0,
    effectiveScore:50,effectiveConfidence:.9,directAnswerCount:2,independentSourceKinds:2,maxAcceptedAuthority:.9,
    naClaimCount:0,naClaimConfidence:0,applicabilityRelevance:null,hasHardContradiction:false,hasSameCellVariance:false,
    hasSecondaryTension:false,hardContradictionRuleIds:[],tensionRuleIds:[],directEvidence:[],derivedContributions:[],exhausted:false,
    confidenceState:'LOCKED',locked:true,lockReason:'TEST',scoreDispersion:0,clusterSize:2,evidenceCount:2,...overrides
  };
}
function fullMatrix(scoreForCategory,opts={}){
  const cells=new Map();
  for(const category of def.categories){
    const score=scoreForCategory(category);
    for(const cell of def.cells){
      if(cell.id==='C01'){
        const na=opts.naCategories?.has(category.id);
        cells.set(`${category.id}:${cell.id}`,baseCell(category.id,cell.id,na?{
          status:'NOT_APPLICABLE',directScore:null,effectiveScore:null,directConfidence:0,effectiveConfidence:0,
          confidenceState:'NOT_APPLICABLE',locked:false,lockReason:null
        }:{status:'GATHERING',directScore:null,effectiveScore:null,directConfidence:0,effectiveConfidence:0,confidenceState:'UNASSESSED',locked:false,lockReason:null}));
      }else{
        cells.set(`${category.id}:${cell.id}`,baseCell(category.id,cell.id,{directScore:score,effectiveScore:score}));
      }
    }
  }
  return cells;
}

const categoryScore=new Map(def.categories.map((c,i)=>[c.id,(i*13)%101]));
let cells=fullMatrix(c=>categoryScore.get(c.id));
let agg=calculateAggregateSnapshots(def,cells);
ok(agg.categories.size===64,'64 capability aggregates');
ok(agg.modules.size===8,'8 module aggregates');
ok(agg.purposes.size===5,'five business outcomes remain separate from modules',String(agg.purposes.size));
ok(agg.overall.aggregationVersion==='HIERARCHICAL_V13','v13 hierarchical aggregation marker');
ok(agg.overall.applicableModuleCount===8,'all eight modules applicable');
ok(agg.overall.completeModuleCount===8,'all eight modules complete');

for(const category of def.categories){
  const state=agg.categories.get(category.id);
  close(state.partialScore,categoryScore.get(category.id),`${category.id} partial score`);
  close(state.officialScore,categoryScore.get(category.id),`${category.id} official score`);
  close(state.confidence,.9,`${category.id} confidence`);
  close(state.coverage,1,`${category.id} coverage`);
  ok(state.baseWeightPct===category.weightPct,`${category.id} base importance weight preserved`);
}

for(const module of def.modules){
  const cats=def.categories.filter(c=>c.module===module.id);
  const expected=cats.reduce((s,c)=>s+categoryScore.get(c.id)*c.weightPct,0)/cats.reduce((s,c)=>s+c.weightPct,0);
  const state=agg.modules.get(module.id);
  close(state.partialScore,expected,`${module.code} weighted module score`);
  close(state.officialScore,expected,`${module.code} official module score`);
  close(state.baseWeightPct,module.weightPct,`${module.code} base module weight preserved`);
  const catContribution=cats.reduce((s,c)=>s+(agg.categories.get(c.id).officialContributionToModule??0),0);
  close(catContribution,expected,`${module.code} capability contributions sum to module score`);
}

const expectedOverall=def.categories.reduce((s,c)=>s+categoryScore.get(c.id)*c.weightPct,0)/100;
close(agg.overall.partialScore,expectedOverall,'overall equals all 64 capability weights when fully applicable');
close(agg.overall.officialScore,expectedOverall,'official overall weighted score');
close([...agg.modules.values()].reduce((s,m)=>s+(m.officialContribution??0),0),expectedOverall,'module contributions sum to overall score');

// Missing evidence must reduce coverage, not be interpreted as a score of zero.
cells=new Map();
for(const category of def.categories){
  for(const cell of def.cells){
    if(cell.id==='C01'){
      cells.set(`${category.id}:${cell.id}`,baseCell(category.id,cell.id,{status:'GATHERING',directScore:null,effectiveScore:null,directConfidence:0,effectiveConfidence:0,confidenceState:'UNASSESSED',locked:false}));
    }else if(category.id==='MS01' && cell.id==='C02'){
      cells.set(`${category.id}:${cell.id}`,baseCell(category.id,cell.id,{directScore:100,effectiveScore:100}));
    }else if(category.id==='MS01'){
      cells.set(`${category.id}:${cell.id}`,baseCell(category.id,cell.id,{status:'UNASSESSED',directScore:null,effectiveScore:null,directConfidence:0,effectiveConfidence:0,confidenceState:'UNASSESSED',locked:false}));
    }else{
      cells.set(`${category.id}:${cell.id}`,baseCell(category.id,cell.id,{directScore:50,effectiveScore:50}));
    }
  }
}
agg=calculateAggregateSnapshots(def,cells);
close(agg.categories.get('MS01').partialScore,100,'unanswered cells are not scored as zero');
ok(agg.categories.get('MS01').coverage>0 && agg.categories.get('MS01').coverage<1,'missing cells reduce coverage');
ok(agg.categories.get('MS01').officialScore===null,'incomplete capability has no official score');
ok(agg.modules.get(def.categories.find(c=>c.id==='MS01').module).officialScore===null,'incomplete capability withholds module official score');
ok(agg.overall.officialScore===null,'incomplete module withholds overall official score');

// A capability N/A redistributes weight only within its module; the module's top-level weight remains intact.
const excluded='MS01';
cells=fullMatrix(c=>categoryScore.get(c.id),{naCategories:new Set([excluded])});
agg=calculateAggregateSnapshots(def,cells);
const firstModule=def.modules[0];
const m1Cats=def.categories.filter(c=>c.module===firstModule.id && c.id!==excluded);
const expectedM1=m1Cats.reduce((s,c)=>s+categoryScore.get(c.id)*c.weightPct,0)/m1Cats.reduce((s,c)=>s+c.weightPct,0);
close(agg.modules.get(firstModule.id).officialScore,expectedM1,'N/A capability weight redistributes inside module');
close(agg.modules.get(firstModule.id).baseWeightPct,20,'module retains its 20% top-level weight');
const expectedHierarchical=def.modules.reduce((sum,m)=>sum+(agg.modules.get(m.id).officialScore??0)*m.weightPct,0)/100;
close(agg.overall.officialScore,expectedHierarchical,'overall follows module hierarchy after capability N/A');
const oldGlobalRenormalized=def.categories.filter(c=>c.id!==excluded).reduce((s,c)=>s+categoryScore.get(c.id)*c.weightPct,0)/def.categories.filter(c=>c.id!==excluded).reduce((s,c)=>s+c.weightPct,0);
ok(Math.abs(expectedHierarchical-oldGlobalRenormalized)>1e-5,'hierarchy differs from old global N/A redistribution',`hierarchical=${expectedHierarchical} old=${oldGlobalRenormalized}`);

// Entire module N/A -> remaining module weights renormalize at overall level.
const lastModule=def.modules.at(-1);
const naLastModule=new Set(def.categories.filter(c=>c.module===lastModule.id).map(c=>c.id));
cells=fullMatrix(c=>categoryScore.get(c.id),{naCategories:naLastModule});
agg=calculateAggregateSnapshots(def,cells);
ok(agg.overall.applicableModuleCount===7,'whole N/A module removed from overall denominator');
const remainingModules=def.modules.filter(m=>m.id!==lastModule.id);
const remainingWeight=remainingModules.reduce((s,m)=>s+m.weightPct,0);
const expectedWithoutModule=remainingModules.reduce((s,m)=>s+(agg.modules.get(m.id).officialScore??0)*m.weightPct,0)/remainingWeight;
close(agg.overall.officialScore,expectedWithoutModule,'remaining module weights renormalize only when whole module N/A');
close(remainingModules.reduce((s,m)=>s+(agg.modules.get(m.id).effectiveOverallWeightPct??0),0),100,'effective module weights total 100 after whole module N/A');

const result={status:'PASS',checks:checks.length,weightValidation:validation,results:checks};
fs.writeFileSync('methodology/STEP5_HIERARCHICAL_AGGREGATION_SMOKE.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
