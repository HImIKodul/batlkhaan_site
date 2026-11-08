import fs from 'node:fs';
import { buildDefinition, calculateRuntimeSnapshot, evidenceFromAnswer } from '../dist-engine/engine/index.js';

const BUNDLES=[
  ['marketing','methodology/MMRI_v3.0.3_QBANK_v3.1.3_STEP6_OF6_ACCEPTED_FINAL.json','3.0.3'],
  ['it','methodology/businessmri-v2.6-runtime-bundles/MMRI_ISMRI_Methodology_4.3.7_BUSINESSMRI_V2.json','4.3.7'],
  ['finance','methodology/businessmri-v2.6-runtime-bundles/MMRI_FINMRI_Methodology_4.2.7_BUSINESSMRI_V2.json','4.2.7'],
  ['people','methodology/businessmri-v2.6-runtime-bundles/MMRI_HRMRI_Methodology_4.1.7_BUSINESSMRI_V2.json','4.1.7'],
  ['operations','methodology/businessmri-v2.6-runtime-bundles/MMRI_OPMRI_Methodology_4.4.7_BUSINESSMRI_V2.json','4.4.7']
];

const checks=[];
const close=(a,b,t=1e-7)=>a!==null&&Number.isFinite(Number(a))&&Math.abs(Number(a)-Number(b))<=t;
function check(name,pass,detail=''){checks.push({name,pass:Boolean(pass),detail:String(detail)});if(!pass)throw new Error(`FAIL ${name}: ${detail}`)}
function question(def,cat,cell,path){const q=def.questionByCategoryCellPath.get(`${cat}:${cell}:${path}`);if(!q)throw new Error(`Missing ${cat}:${cell}:${path}`);return q}
function positiveApplicability(q){return q.options.find(o=>['APPLICABLE','MOSTLY_APPLICABLE','PARTIAL_APPLICABILITY'].includes(o.state))?.optionIndex ?? q.options.find(o=>o.optionIndex===1&&!['N_A_CLAIM','DNK'].includes(o.state))?.optionIndex ?? q.options[0].optionIndex}
function naOption(q){const o=q.options.find(x=>x.state==='N_A_CLAIM');if(!o)throw new Error(`Missing N/A on ${q.id}`);return o.optionIndex}
function scoredOption(q,high){const rows=q.options.filter(o=>o.state==='SCORED'&&o.score!==null).slice().sort((a,b)=>Number(a.score)-Number(b.score));if(!rows.length)return null;return (high?rows.at(-1):rows[0]).optionIndex}
function evidence(def,q,optionIndex){return evidenceFromAnswer({definition:def,question:q,optionIndex,explicitAuthority:1,respondentRoleId:'R01'})}
function selectThreeCategories(def){const out=[];const seen=new Set();for(const c of def.categories){if(seen.has(c.module))continue;seen.add(c.module);out.push(c);if(out.length===3)break;}if(out.length!==3)throw new Error(`${def.domainCode}: fewer than three modules`);return out}
function scenario(def,pattern){
  const selected=selectThreeCategories(def); const selectedIds=new Set(selected.map(c=>c.id)); const ev=[]; let scoredAnswerCount=0;
  for(const c of def.categories){
    if(selectedIds.has(c.id)){
      const q=question(def,c.id,'C01',1);ev.push(evidence(def,q,positiveApplicability(q)));
    }else{
      for(const path of [1,2,3]){const q=question(def,c.id,'C01',path);ev.push(evidence(def,q,naOption(q)));}
    }
  }
  selected.forEach((c,index)=>{
    const high=pattern==='high'?true:pattern==='low'?false:index!==1;
    for(const cell of def.cells){
      if(cell.id==='C01')continue;
      for(const path of [1,2,3,4]){
        const q=def.questionByCategoryCellPath.get(`${c.id}:${cell.id}:${path}`); if(!q)continue;
        const policy=def.runtimePolicy?.questionById.get(q.id);
        if(policy&&(!policy.scoreEligible||policy.routingState==='INFER_ONLY'))continue;
        const oi=scoredOption(q,high); if(oi===null)continue;
        ev.push(evidence(def,q,oi)); scoredAnswerCount++;
      }
    }
  });
  const snapshot=calculateRuntimeSnapshot(def,ev);
  return {selected,snapshot,evidenceCount:ev.length,scoredAnswerCount};
}
function moduleForCategory(def,c){return def.modules.find(m=>m.id===c.module)??null}

const results=[];
for(const [domain,file,expectedVersion] of BUNDLES){
  const def=buildDefinition(JSON.parse(fs.readFileSync(file,'utf8')));
  check(`${domain} version`,def.version===expectedVersion,def.version);
  check(`${domain} 64 categories`,def.categories.length===64,def.categories.length);

  const low=scenario(def,'low'); const mixed=scenario(def,'mixed'); const high=scenario(def,'high');
  const lowOverall=low.snapshot.overall; const mixedOverall=mixed.snapshot.overall; const highOverall=high.snapshot.overall;

  check(`${domain} real low answers produce score 0`,close(lowOverall.officialScore,0),lowOverall.officialScore);
  check(`${domain} real high answers produce score 100`,close(highOverall.officialScore,100),highOverall.officialScore);
  check(`${domain} low < mixed < high`,Number(lowOverall.officialScore)<Number(mixedOverall.officialScore)&&Number(mixedOverall.officialScore)<Number(highOverall.officialScore),`${lowOverall.officialScore}/${mixedOverall.officialScore}/${highOverall.officialScore}`);
  check(`${domain} low coverage complete`,close(lowOverall.coverage,1),lowOverall.coverage);
  check(`${domain} mixed coverage complete`,close(mixedOverall.coverage,1),mixedOverall.coverage);
  check(`${domain} high coverage complete`,close(highOverall.coverage,1),highOverall.coverage);
  check(`${domain} exactly 3 applicable categories`,lowOverall.applicableCategoryCount===3&&mixedOverall.applicableCategoryCount===3&&highOverall.applicableCategoryCount===3,`${lowOverall.applicableCategoryCount}/${mixedOverall.applicableCategoryCount}/${highOverall.applicableCategoryCount}`);
  check(`${domain} exactly 3 complete categories`,lowOverall.completeCategoryCount===3&&mixedOverall.completeCategoryCount===3&&highOverall.completeCategoryCount===3,`${lowOverall.completeCategoryCount}/${mixedOverall.completeCategoryCount}/${highOverall.completeCategoryCount}`);
  check(`${domain} real scored answers exercised`,low.scoredAnswerCount>0&&mixed.scoredAnswerCount>0&&high.scoredAnswerCount>0,`${low.scoredAnswerCount}/${mixed.scoredAnswerCount}/${high.scoredAnswerCount}`);

  const targets=[100,0,100];
  for(let i=0;i<mixed.selected.length;i++){
    const cat=mixed.selected[i]; const c=mixed.snapshot.categories.get(cat.id); const module=moduleForCategory(def,cat); const m=module?mixed.snapshot.modules.get(module.id):null;
    check(`${domain} mixed category ${i+1} exact answer-derived score`,close(c?.officialScore,targets[i]),`${cat.id}:${c?.officialScore}`);
    check(`${domain} mixed module ${i+1} follows category score`,close(m?.officialScore,targets[i]),`${module?.id}:${m?.officialScore}`);
  }
  const selectedModules=mixed.selected.map(c=>moduleForCategory(def,c));
  const denominator=selectedModules.reduce((s,m)=>s+Number(m?.weightPct??0),0);
  const expectedMixed=selectedModules.reduce((s,m,i)=>s+targets[i]*Number(m?.weightPct??0),0)/denominator;
  check(`${domain} mixed overall equals independent weighted expectation`,close(mixedOverall.officialScore,expectedMixed),`${mixedOverall.officialScore} vs ${expectedMixed}`);

  const officialContrib=[...mixed.snapshot.modules.values()].map(x=>x.officialContribution).filter(x=>x!==null);
  check(`${domain} module official contributions sum to overall`,close(officialContrib.reduce((a,b)=>a+Number(b),0),Number(mixedOverall.officialScore)),`${officialContrib.reduce((a,b)=>a+Number(b),0)} vs ${mixedOverall.officialScore}`);

  const nonSelected=def.categories.filter(c=>!new Set(mixed.selected.map(x=>x.id)).has(c.id));
  check(`${domain} non-selected categories excluded only by confirmed N/A`,nonSelected.every(c=>mixed.snapshot.categories.get(c.id)?.confirmedNotApplicable===true),nonSelected.filter(c=>mixed.snapshot.categories.get(c.id)?.confirmedNotApplicable!==true).slice(0,3).map(c=>c.id).join(','));

  const sample=mixed.selected.flatMap(c=>def.questions.filter(q=>q.categoryId===c.id&&q.cellId!=='C01')).find(q=>q.options.some(o=>o.state==='SCORED'&&o.score===0)&&q.options.some(o=>o.state==='SCORED'&&o.score===100));
  check(`${domain} sample question has explicit 0-100 answer mapping`,Boolean(sample),sample?.id??'none');
  if(sample){const zero=sample.options.find(o=>o.state==='SCORED'&&o.score===0);const hundred=sample.options.find(o=>o.state==='SCORED'&&o.score===100);check(`${domain} option polarity uses scores not index`,zero?.optionIndex!==hundred?.optionIndex,`${zero?.optionIndex}/${hundred?.optionIndex}`)}

  results.push({domain,version:def.version,low:Number(lowOverall.officialScore),mixed:Number(mixedOverall.officialScore),high:Number(highOverall.officialScore),expectedMixed,scoredAnswers:{low:low.scoredAnswerCount,mixed:mixed.scoredAnswerCount,high:high.scoredAnswerCount},selectedCategories:mixed.selected.map(c=>c.id)});
}

console.log(JSON.stringify({status:'PASS',domains:BUNDLES.length,scenarios:BUNDLES.length*3,checksPassed:checks.length,checksTotal:checks.length,results},null,2));
