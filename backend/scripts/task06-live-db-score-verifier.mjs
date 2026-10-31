import { prisma } from '../dist/db.js';
import { MethodologyDefinitionCache } from '../dist/services/methodology-cache.js';
import { calculateRuntimeSnapshot } from '../dist/engine/calculation.js';
import { evidenceFromAnswer } from '../dist/engine/evidence.js';
import { allDomainMethodologyTargets } from '../dist/domain-methodology.js';

const close=(a,b,t=0.001)=>{
  if(a===null||a===undefined||b===null||b===undefined)return (a??null)===(b??null);
  return Math.abs(Number(a)-Number(b))<=t;
};
const fail=(m)=>{throw new Error(m)};
const requireTrue=(c,m)=>{if(!c)fail(m)};
const cache=new MethodologyDefinitionCache(prisma);

function question(def,cat,cell,path){const q=def.questionByCategoryCellPath.get(`${cat}:${cell}:${path}`);if(!q)fail(`Missing ${cat}:${cell}:${path}`);return q}
function positiveApplicability(q){return q.options.find(o=>['APPLICABLE','MOSTLY_APPLICABLE','PARTIAL_APPLICABILITY'].includes(o.state))?.optionIndex ?? q.options.find(o=>o.optionIndex===1&&!['N_A_CLAIM','DNK'].includes(o.state))?.optionIndex ?? q.options[0].optionIndex}
function naOption(q){const o=q.options.find(x=>x.state==='N_A_CLAIM');if(!o)fail(`Missing N/A on ${q.id}`);return o.optionIndex}
function scoredOption(q,high){const rows=q.options.filter(o=>o.state==='SCORED'&&o.score!==null).slice().sort((a,b)=>Number(a.score)-Number(b.score));if(!rows.length)return null;return (high?rows.at(-1):rows[0]).optionIndex}
function ev(def,q,optionIndex){return evidenceFromAnswer({definition:def,question:q,optionIndex,explicitAuthority:1,respondentRoleId:'R01'})}
function selectedCategories(def){const out=[];const seen=new Set();for(const c of def.categories){if(seen.has(c.module))continue;seen.add(c.module);out.push(c);if(out.length===3)break;}return out}
function synthetic(def,pattern){
  const selected=selectedCategories(def);requireTrue(selected.length===3,`${def.domainCode}: fewer than 3 modules`);const ids=new Set(selected.map(c=>c.id));const evidence=[];
  for(const c of def.categories){if(ids.has(c.id)){const q=question(def,c.id,'C01',1);evidence.push(ev(def,q,positiveApplicability(q)));}else{for(const p of [1,2,3]){const q=question(def,c.id,'C01',p);evidence.push(ev(def,q,naOption(q)));}}}
  selected.forEach((c,i)=>{const high=pattern==='high'?true:pattern==='low'?false:i!==1;for(const cell of def.cells){if(cell.id==='C01')continue;for(const p of [1,2,3,4]){const q=def.questionByCategoryCellPath.get(`${c.id}:${cell.id}:${p}`);if(!q)continue;const policy=def.runtimePolicy?.questionById.get(q.id);if(policy&&(!policy.scoreEligible||policy.routingState==='INFER_ONLY'))continue;const oi=scoredOption(q,high);if(oi!==null)evidence.push(ev(def,q,oi));}}});
  return {selected,snapshot:calculateRuntimeSnapshot(def,evidence)};
}
function externalFromDbQuestion(def,event){if(event.questionExternalId&&def.questionById.has(event.questionExternalId))return event.questionExternalId;const prefix=`${def.version}:`;return String(event.questionId).startsWith(prefix)?String(event.questionId).slice(prefix.length):String(event.questionId)}
async function reconstructEvidence(assessment,def){
  const events=await prisma.answerEvent.findMany({where:{assessmentId:assessment.id},orderBy:{eventSequence:'asc'}});
  if(events.length){const latest=new Map();for(const e of events)latest.set(e.questionId,e);const out=[];for(const e of [...latest.values()].sort((a,b)=>a.eventSequence-b.eventSequence)){if(e.optionIndex===null)continue;const external=externalFromDbQuestion(def,e);const q=def.questionById.get(external);if(!q)fail(`${assessment.id}: unknown event question ${external}`);out.push(evidenceFromAnswer({definition:def,question:q,optionIndex:e.optionIndex,explicitAuthority:Number(e.authority??0.75)}));}return out;}
  const answers=await prisma.answer.findMany({where:{assessmentId:assessment.id,active:true},include:{question:true}});const out=[];for(const a of answers){if(a.optionIndex===null)continue;const q=def.questionById.get(a.question.externalId);if(!q)fail(`${assessment.id}: unknown answer question ${a.question.externalId}`);out.push(evidenceFromAnswer({definition:def,question:q,optionIndex:a.optionIndex,explicitAuthority:Number(a.authority??0.75)}));}return out;
}

const targets=allDomainMethodologyTargets();
const syntheticResults=[];
for(const target of targets){
  const row=await prisma.methodologyVersion.findUnique({where:{version:target.methodologyVersion}});
  requireTrue(Boolean(row),`${target.domainCode}: methodology ${target.methodologyVersion} absent`);
  requireTrue(row.status==='ACTIVE',`${target.domainCode}: methodology not ACTIVE`);
  requireTrue(row.domainCode===target.domainCode,`${target.domainCode}: DB domain mismatch ${row.domainCode}`);
  requireTrue(row.bundleSha256===target.bundleSha256,`${target.domainCode}: bundle SHA mismatch`);
  const def=await cache.get(row.id);
  const low=synthetic(def,'low'),mixed=synthetic(def,'mixed'),high=synthetic(def,'high');
  requireTrue(close(low.snapshot.overall.officialScore,0),`${target.domainCode}: DB projection low score ${low.snapshot.overall.officialScore}`);
  requireTrue(close(high.snapshot.overall.officialScore,100),`${target.domainCode}: DB projection high score ${high.snapshot.overall.officialScore}`);
  requireTrue(Number(low.snapshot.overall.officialScore)<Number(mixed.snapshot.overall.officialScore)&&Number(mixed.snapshot.overall.officialScore)<Number(high.snapshot.overall.officialScore),`${target.domainCode}: DB projection ordering failed`);
  const modules=mixed.selected.map(c=>def.modules.find(m=>m.id===c.module));const scores=[100,0,100];const den=modules.reduce((s,m)=>s+Number(m?.weightPct??0),0);const expected=modules.reduce((s,m,i)=>s+scores[i]*Number(m?.weightPct??0),0)/den;
  requireTrue(close(mixed.snapshot.overall.officialScore,expected),`${target.domainCode}: DB projection mixed ${mixed.snapshot.overall.officialScore} expected ${expected}`);
  syntheticResults.push({domain:target.domainCode,version:def.version,low:low.snapshot.overall.officialScore,mixed:mixed.snapshot.overall.officialScore,high:high.snapshot.overall.officialScore});
}

const assessments=await prisma.assessment.findMany({where:{status:{notIn:['PROFILE_PENDING','CANCELLED']},OR:[{eventSequence:{gt:0}},{answers:{some:{active:true}}}]},include:{methodologyVersion:true},orderBy:{updatedAt:'asc'}});
const persisted=[];
for(const a of assessments){
  const def=await cache.get(a.methodologyVersionId);const evidence=await reconstructEvidence(a,def);const snap=calculateRuntimeSnapshot(def,evidence);
  requireTrue(close(a.overallPartialScore,snap.overall.partialScore),`${a.id}: persisted partial ${a.overallPartialScore} != ${snap.overall.partialScore}`);
  requireTrue(close(a.overallOfficialScore,snap.overall.officialScore),`${a.id}: persisted official ${a.overallOfficialScore} != ${snap.overall.officialScore}`);
  requireTrue(close(a.overallConfidence,snap.overall.confidence),`${a.id}: persisted confidence ${a.overallConfidence} != ${snap.overall.confidence}`);
  requireTrue(close(a.coverage,snap.overall.coverage),`${a.id}: persisted coverage ${a.coverage} != ${snap.overall.coverage}`);

  const [catRows,catDefs,moduleRows]=await Promise.all([
    prisma.categoryResult.findMany({where:{assessmentId:a.id}}),
    prisma.category.findMany({where:{methodologyVersionId:a.methodologyVersionId}}),
    prisma.moduleResult.findMany({where:{assessmentId:a.id}})
  ]);
  if(catRows.length){requireTrue(catRows.length===def.categories.length,`${a.id}: category result count ${catRows.length}/${def.categories.length}`);const extByDb=new Map(catDefs.map(c=>[c.id,c.externalId]));for(const row of catRows){const ext=extByDb.get(row.categoryId);const x=ext?snap.categories.get(ext):null;requireTrue(Boolean(x),`${a.id}: category result cannot map ${row.categoryId}`);requireTrue(close(row.partialScore,x.partialScore),`${a.id}/${ext}: category partial mismatch`);requireTrue(close(row.officialScore,x.officialScore),`${a.id}/${ext}: category official mismatch`);requireTrue(close(row.coverage,x.coverage),`${a.id}/${ext}: category coverage mismatch`);}}
  if(moduleRows.length){requireTrue(moduleRows.length===def.modules.length,`${a.id}: module result count ${moduleRows.length}/${def.modules.length}`);for(const row of moduleRows){const x=snap.modules.get(row.moduleId);requireTrue(Boolean(x),`${a.id}: module result cannot map ${row.moduleId}`);requireTrue(close(row.partialScore,x.partialScore),`${a.id}/${row.moduleId}: module partial mismatch`);requireTrue(close(row.officialScore,x.officialScore),`${a.id}/${row.moduleId}: module official mismatch`);requireTrue(close(row.coverage,x.coverage),`${a.id}/${row.moduleId}: module coverage mismatch`);}}
  persisted.push({assessmentId:a.id,domain:a.domainCode,status:a.status,evidence:evidence.length,partial:snap.overall.partialScore,official:snap.overall.officialScore,coverage:snap.overall.coverage});
}

console.log(JSON.stringify({status:'PASS',activeDomainProjections:syntheticResults,persistedAssessmentsChecked:persisted.length,persisted},null,2));
await prisma.$disconnect();
