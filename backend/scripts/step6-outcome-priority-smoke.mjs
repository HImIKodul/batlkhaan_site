import fs from 'node:fs';
import { buildDefinition, calculateAggregateSnapshots } from '../dist-engine/engine/index.js';

const bundle=JSON.parse(fs.readFileSync('methodology/MMRI_v3.0.3_QBANK_v3.1.3_STEP6_OF6_ACCEPTED_FINAL.json','utf8'));
const def=buildDefinition(bundle);
def.runtimePolicy={enabled:true,questionById:new Map(),cellByCategoryCell:new Map(),ruleById:new Map(),scorePatternByCode:new Map()};

const checks=[];
const ok=(condition,name,detail='')=>{checks.push({name,pass:Boolean(condition),detail});if(!condition)throw new Error(`FAIL ${name}: ${detail}`)};
const close=(actual,expected,name,tol=1e-7)=>ok(actual!==null&&Math.abs(actual-expected)<=tol,name,`actual=${actual} expected=${expected}`);

function baseCell(categoryId,cellId,score,overrides={}){
  return {
    categoryId,cellId,status:'DIRECT_FINAL',directScore:score,directConfidence:.9,derivedScore:null,derivedConfidence:0,
    effectiveScore:score,effectiveConfidence:.9,directAnswerCount:2,independentSourceKinds:2,maxAcceptedAuthority:.9,
    naClaimCount:0,naClaimConfidence:0,applicabilityRelevance:null,hasHardContradiction:false,hasSameCellVariance:false,
    hasSecondaryTension:false,hardContradictionRuleIds:[],tensionRuleIds:[],directEvidence:[],derivedContributions:[],exhausted:false,
    confidenceState:'LOCKED',locked:true,lockReason:'TEST',scoreDispersion:0,clusterSize:2,evidenceCount:2,...overrides
  };
}
function matrix(scoreByCategory,missing=new Set(),na=new Set()){
  const cells=new Map();
  for(const category of def.categories){
    const score=scoreByCategory.get(category.id);
    for(const cell of def.cells){
      if(cell.id==='C01'){
        cells.set(`${category.id}:${cell.id}`,baseCell(category.id,cell.id,null,na.has(category.id)?{
          status:'NOT_APPLICABLE',directScore:null,effectiveScore:null,directConfidence:0,effectiveConfidence:0,confidenceState:'NOT_APPLICABLE',locked:false
        }:{status:'GATHERING',directScore:null,effectiveScore:null,directConfidence:0,effectiveConfidence:0,confidenceState:'UNASSESSED',locked:false}));
      }else if(missing.has(category.id)){
        cells.set(`${category.id}:${cell.id}`,baseCell(category.id,cell.id,null,{status:'UNASSESSED',directScore:null,effectiveScore:null,directConfidence:0,effectiveConfidence:0,confidenceState:'UNASSESSED',locked:false}));
      }else{
        cells.set(`${category.id}:${cell.id}`,baseCell(category.id,cell.id,score));
      }
    }
  }
  return cells;
}

const scoreByCategory=new Map(def.categories.map((c,i)=>[c.id,20+((i*17)%76)]));
let agg=calculateAggregateSnapshots(def,matrix(scoreByCategory));
ok(agg.outcomePriorities.size===5,'five deterministic outcome priority snapshots',String(agg.outcomePriorities.size));
ok(agg.categoryOutcomePriorities.size===320,'64 x 5 category-outcome priority rows',String(agg.categoryOutcomePriorities.size));

const contract=def.contracts.purposes;
const mapping=new Map(contract.mapping.map(m=>[m.category,m]));
for(const purpose of contract.purposes){
  const pid=purpose.id;
  const priority=agg.outcomePriorities.get(pid);
  const purposeScore=agg.purposes.get(pid);
  ok(priority.calculationVersion==='OUTCOME_PRIORITY_V13',`${pid} priority version`);
  ok(priority.causalLiftClaimAllowed===false,`${pid} causal lift guardrail`);
  close(priority.score,purposeScore.partialScore,`${pid} priority score mirrors deterministic purpose score`);
  close(priority.knownGap,100-purposeScore.partialScore,`${pid} known gap = 100 - outcome score`);
  const rows=def.categories.map(c=>agg.categoryOutcomePriorities.get(`${pid}:${c.id}`));
  ok(rows.every(Boolean),`${pid} all 64 category priority rows exist`);
  close(rows.reduce((s,r)=>s+r.effectivePurposeWeightPct,0),100,`${pid} effective purpose weights total 100`);
  close(rows.reduce((s,r)=>s+r.gapContribution,0),priority.knownGap,`${pid} category gap contributions reconcile to outcome gap`);
  close(rows.reduce((s,r)=>s+r.confidenceAdjustedGapContribution,0),priority.confidenceAdjustedKnownGap,`${pid} confidence adjusted contributions reconcile`);
  close(priority.confidenceAdjustedKnownGap+priority.uncertaintyKnownGap,priority.knownGap,`${pid} confirmed + uncertain gap reconcile`);
  const sorted=[...rows].sort((a,b)=>a.rank-b.rank);
  ok(sorted[0].rank===1,`${pid} rank starts at 1`);
  close(sorted[0].relativePriority,1,`${pid} top category relative priority is 1`);
  ok(JSON.stringify(priority.topPriorityCategoryIds)===JSON.stringify(sorted.slice(0,5).map(r=>r.categoryId)),`${pid} top-five category IDs follow deterministic rank`);
  for(const c of def.categories){
    const r=agg.categoryOutcomePriorities.get(`${pid}:${c.id}`);
    const rel=Number(mapping.get(c.id).relevance[pid]);
    close(r.relevance,rel,`${pid}/${c.id} relevance preserved`);
    close(r.structuralWeight,c.weightPct*rel,`${pid}/${c.id} structural weight = category weight x relevance`);
    ok(r.gapContribution>=0,`${pid}/${c.id} nonnegative gap contribution`);
    ok(r.confidenceAdjustedGapContribution<=r.gapContribution+1e-9,`${pid}/${c.id} confidence adjustment cannot inflate gap`);
  }
}

// Missing evidence is not invented as a weakness: missing category has no priority row and purpose coverage falls.
const missing=new Set(['MS01']);
agg=calculateAggregateSnapshots(def,matrix(scoreByCategory,missing));
ok(agg.categoryOutcomePriorities.size===315,'missing category removes only its five unknown priority rows',String(agg.categoryOutcomePriorities.size));
for(const p of contract.purposes){
  ok(!agg.categoryOutcomePriorities.has(`${p.id}:MS01`),`${p.id} missing category not fabricated as zero-gap or 100-gap`);
  ok((agg.outcomePriorities.get(p.id).coverage??1)<1,`${p.id} missing evidence reduces coverage`);
}

// Confirmed N/A category is excluded from outcome denominator and ranking.
agg=calculateAggregateSnapshots(def,matrix(scoreByCategory,new Set(),new Set(['MS01'])));
ok(agg.categoryOutcomePriorities.size===315,'N/A category excluded from five outcome rankings');
for(const p of contract.purposes) ok(!agg.categoryOutcomePriorities.has(`${p.id}:MS01`),`${p.id} confirmed N/A category excluded`);

const result={status:'PASS',checks:checks.length,results:checks};
fs.writeFileSync('methodology/STEP6_OUTCOME_PRIORITY_SMOKE.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({status:result.status,checks:result.checks},null,2));
