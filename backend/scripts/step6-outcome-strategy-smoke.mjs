import fs from 'node:fs';
import { buildDefinition, calculateAggregateSnapshots } from '../dist-engine/engine/index.js';
import { buildRecommendations } from '../dist-strategy/strategy/recommendations.js';

const bundle=JSON.parse(fs.readFileSync('methodology/MMRI_v3.0.3_QBANK_v3.1.3_STEP6_OF6_ACCEPTED_FINAL.json','utf8'));
const def=buildDefinition(bundle);
def.runtimePolicy={enabled:true,questionById:new Map(),cellByCategoryCell:new Map(),ruleById:new Map(),scorePatternByCode:new Map()};
const checks=[];
const ok=(condition,name,detail='')=>{checks.push({name,pass:Boolean(condition),detail});if(!condition)throw new Error(`FAIL ${name}: ${detail}`)};
const close=(a,b,name,tol=1e-8)=>ok(typeof a==='number'&&Math.abs(a-b)<=tol,name,`actual=${a} expected=${b}`);

const cells=new Map();
for(const c of def.categories){
  const score=c.id==='MS01'?20:c.id==='MS02'?45:80;
  for(const cell of def.cells){
    const gate=cell.id==='C01';
    cells.set(`${c.id}:${cell.id}`,{
      categoryId:c.id,cellId:cell.id,status:gate?'GATHERING':'DIRECT_FINAL',directScore:gate?null:score,directConfidence:gate?0:.9,
      derivedScore:null,derivedConfidence:0,effectiveScore:gate?null:score,effectiveConfidence:gate?0:.9,directAnswerCount:gate?0:2,
      independentSourceKinds:2,maxAcceptedAuthority:.9,naClaimCount:0,naClaimConfidence:0,applicabilityRelevance:null,
      hasHardContradiction:false,hasSameCellVariance:false,hasSecondaryTension:false,hardContradictionRuleIds:[],tensionRuleIds:[],directEvidence:[],
      derivedContributions:[],exhausted:false,confidenceState:gate?'UNASSESSED':'LOCKED',locked:!gate,lockReason:null,scoreDispersion:0,clusterSize:2,evidenceCount:2
    });
  }
}
const agg=calculateAggregateSnapshots(def,cells);
const snapshot={cells,contradictions:[],...agg};
const finding={
  id:'F1',categoryId:'MS01',cellId:'C02',categoryValue:20,cellValue:20,categorySeverity:.8,cellSeverity:.8,
  categoryEvidenceFactor:.9,cellEvidenceFactor:.9,categoryRootScore:.9,cellRootScore:.9,rootStrength:.9,incomingCauseSupport:0,
  classification:'PRIMARY_ROOT_CAUSE',role:'ROOT',classificationBasis:'CELL',downstreamCategoryIds:[],downstreamCellIds:[],sourceTraceIds:['test:step6']
};
const root={version:'TEST',weaknessThreshold:60,findings:[finding],selectedFindings:[finding]};

for(let p=1;p<=5;p++){
  const pid=`P${p}`;
  const result=buildRecommendations(def,snapshot,root,[{questionId:'P05',optionIndexes:[3]},{questionId:'P20',optionIndexes:[p]}]);
  ok(result.selectedPurposeId===pid,`${pid} selected purpose preserved`);
  ok(result.candidates.length>0,`${pid} recommendation candidate exists`);
  const expected=snapshot.categoryOutcomePriorities.get(`${pid}:MS01`).relativePriority;
  close(result.candidates[0].components.purposeEmphasis,expected,`${pid} recommendation uses diagnostic outcome priority`);
}

const noSelection=buildRecommendations(def,snapshot,root,[{questionId:'P05',optionIndexes:[3]}]);
const expectedAverage=['P1','P2','P3','P4','P5'].map(pid=>snapshot.categoryOutcomePriorities.get(`${pid}:MS01`).relativePriority).reduce((a,b)=>a+b,0)/5;
close(noSelection.candidates[0].components.purposeEmphasis,expectedAverage,'no selected outcome uses mean deterministic priority');

const result={status:'PASS',checks:checks.length,results:checks};
fs.writeFileSync('methodology/STEP6_OUTCOME_STRATEGY_SMOKE.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({status:result.status,checks:result.checks},null,2));
