// Validates strengths/weaknesses selection (threshold-qualified first, then true relative rank) for low/medium/high/mixed evidence.
// Run after: npx tsc -p tsconfig.strategy.json
import fs from 'node:fs';
import { buildDefinition } from '../dist-strategy/engine/definition.js';
import { calculateAggregateSnapshots } from '../dist-strategy/engine/scoring.js';
import { runStrategyPipeline } from '../dist-strategy/strategy/index.js';
import { buildDiagnosisResultV13 } from '../dist-strategy/diagnosis/index.js';
import { buildFrozenReportPayload } from '../dist-strategy/report/payload.js';

const def=buildDefinition(JSON.parse(fs.readFileSync('methodology/MMRI_v3.0.3_QBANK_v3.1.3_STEP6_OF6_ACCEPTED_FINAL.json','utf8')));
const labels={P1:'Ашиг',P2:'Орлого',P3:'Брэндийн үнэ цэнэ',P4:'Хэрэглэгчийн тоо',P5:'Зах зээлийн эзлэх хувь'};
let failures=0,total=0;
const check=(name,ok,detail='')=>{total++;if(!ok){failures++;console.log(`FAIL ${name} ${detail}`)}};
const cell=(categoryId,cellId,score,conf,state)=>({categoryId,cellId,status:cellId==='C01'?'GATHERING':'DIRECT_FINAL',directScore:score,directConfidence:conf,derivedScore:null,derivedConfidence:0,effectiveScore:score,effectiveConfidence:conf,directAnswerCount:2,independentSourceKinds:2,maxAcceptedAuthority:.9,naClaimCount:0,naClaimConfidence:0,hasHardContradiction:false,hardContradictionRuleIds:[],confidenceState:state,evidenceSourceKinds:['ANSWER'],contributionIds:[],lastEvidenceAt:null});
// pattern -> (categoryIndex)=>{score,conf}
const patterns={
  low:i=>({score:30+((i*7)%50),conf:.3}),
  medium:i=>({score:25+((i*11)%70),conf:.6}),
  high:i=>({score:20+((i*13)%80),conf:.95}),
  mixed:i=>i<3?{score:98,conf:.95}:i>=60?{score:15,conf:.95}:{score:35+((i*9)%55),conf:.3},
  ties:i=>({score:i%2?100:60,conf:.3})
};
for(const [name,fn] of Object.entries(patterns)){
  const cells=new Map();
  def.categories.forEach((c,i)=>{const {score,conf}=fn(i);for(const ce of def.cells){cells.set(`${c.id}:${ce.id}`,ce.id==='C01'?cell(c.id,ce.id,null,0,'UNASSESSED'):cell(c.id,ce.id,score,conf,conf>=.8?'LOCKED':'ESTIMATED'))}});
  const agg=calculateAggregateSnapshots(def,cells);
  const snapshot={cells,contradictions:[],...agg};
  const strategy=runStrategyPipeline({methodology:def,snapshot,profileAnswers:[{questionId:'P20',optionIndexes:[2]}]});
  const common={assessmentId:'A',assessmentMode:'QUICK',assessmentStatus:'COMPLETED',routingState:'QUICK_LIMIT_REACHED',generatedAt:'2026-10-27T00:00:00Z',methodology:def,snapshot,strategy,purposeLabels:labels};
  const result=buildDiagnosisResultV13({...common,companyId:'C',companyName:'T',methodologyBundleSha256:'b',runtimeSnapshotHash:'s'});
  const payload=buildFrozenReportPayload({...common,reportId:'R',payloadHash:'H',diagnosisResultHash:'D',strategyHash:'S',planHash:'P',bindingHash:'B',companyName:'T'});
  const caps=new Map(result.capabilities.map(c=>[c.id,c]));
  const rs=result.strengths.items.slice(0,5),rw=result.weaknesses.items.slice(0,5);
  const ps=payload.strengths,pw=payload.weaknesses;
  const tag=`[${name}]`;
  check(`${tag} overall preserved (partial)`,result.overall.partialScore===snapshot.overall.partialScore,`${result.overall.partialScore} vs ${snapshot.overall.partialScore}`);
  check(`${tag} payload overall equals result overall`,payload.overall.score===result.overall.score,`${payload.overall.score} vs ${result.overall.score}`);
  check(`${tag} 5 strengths / 5 weaknesses (result)`,rs.length===5&&rw.length===5,`${rs.length}/${rw.length}`);
  check(`${tag} 5 strengths / 5 weaknesses (payload)`,ps.length===5&&pw.length===5,`${ps.length}/${pw.length}`);
  for(const [label,list,idOf,nameOf] of [['result strengths',rs,x=>x.capabilityId,x=>x.capabilityNameMn],['result weaknesses',rw,x=>x.capabilityId,x=>x.capabilityNameMn],['payload strengths',ps,x=>x.categoryId,x=>x.nameMn],['payload weaknesses',pw,x=>x.categoryId,x=>x.nameMn]]){
    check(`${tag} ${label}: real capabilities, real scores`,list.every(x=>caps.has(idOf(x))&&caps.get(idOf(x)).nameMn===nameOf(x)&&caps.get(idOf(x)).score===x.score));
    check(`${tag} ${label}: no duplicate id/name`,new Set(list.map(idOf)).size===list.length&&new Set(list.map(nameOf)).size===list.length);
  }
  const ids=l=>new Set(l.map(x=>x.capabilityId??x.categoryId));
  check(`${tag} result: no capability in both lists`,![...ids(rs)].some(i=>ids(rw).has(i)));
  check(`${tag} payload: no capability in both lists`,![...ids(ps)].some(i=>ids(pw).has(i)));
  // result and payload agree
  check(`${tag} result vs payload strengths identical (ids, order)`,JSON.stringify(rs.map(x=>x.capabilityId))===JSON.stringify(ps.map(x=>x.categoryId)));
  check(`${tag} result vs payload weaknesses identical (ids, order)`,JSON.stringify(rw.map(x=>x.capabilityId))===JSON.stringify(pw.map(x=>x.categoryId)));
  // qualified vs relative
  const q=x=>x.score>=80&&x.confidence>=.8&&x.coverage>=.7;
  check(`${tag} VALIDATED strengths meet thresholds, RELATIVE ones do not`,rs.every(x=>x.basis==='VALIDATED'?q(x):x.basis==='RELATIVE_RANK'&&!q(x)));
  check(`${tag} validated strengths come first`,rs.findIndex(x=>x.basis==='RELATIVE_RANK')===-1||rs.slice(rs.findIndex(x=>x.basis==='RELATIVE_RANK')).every(x=>x.basis==='RELATIVE_RANK'));
  // true highest / lowest
  const scored=[...caps.values()].filter(c=>c.score!==null&&!c.confirmedNotApplicable);
  const relS=rs.filter(x=>x.basis==='RELATIVE_RANK'),relW=rw.filter(x=>x.basis==='RELATIVE_RANK');
  const chosenS=new Set(rs.map(x=>x.capabilityId));
  const unusedForS=scored.filter(c=>!chosenS.has(c.id));
  check(`${tag} relative strengths are the true highest remaining scores`,relS.every(x=>unusedForS.every(c=>c.score<=x.score)));
  const chosenAll=new Set([...rs,...rw].map(x=>x.capabilityId));
  const unusedForW=scored.filter(c=>!chosenAll.has(c.id));
  check(`${tag} relative weaknesses are the true lowest remaining scores`,relW.every(x=>unusedForW.every(c=>c.score>=x.score)));
  if(name==='low'){check(`[low] all fallback`,relS.length===5&&relW.length===5);const top5=scored.map(c=>c.score).sort((a,b)=>b-a).slice(0,5).join();check('[low] strengths = true top-5 scores',rs.map(x=>x.score).join()===top5,`${rs.map(x=>x.score)} vs ${top5}`);const bot5=scored.map(c=>c.score).sort((a,b)=>a-b).slice(0,5).join();check('[low] weaknesses = true bottom-5 scores',rw.map(x=>x.score).join()===bot5,`${rw.map(x=>x.score)} vs ${bot5}`)}
  if(name==='high')check('[high] all validated',rs.every(x=>x.basis==='VALIDATED')&&rw.every(x=>x.basis==='VALIDATED'),JSON.stringify(rs.map(x=>x.basis)));
  if(name==='mixed')check('[mixed] mix of validated + relative',rs.some(x=>x.basis==='VALIDATED')&&rs.some(x=>x.basis==='RELATIVE_RANK'));
  console.log(`${tag} strengths ${rs.map(x=>`${x.capabilityId}:${Math.round(x.score)}${x.basis==='VALIDATED'?'v':'r'}`).join(' ')} | weaknesses ${rw.map(x=>`${x.capabilityId}:${Math.round(x.score)}${x.basis==='VALIDATED'?'v':'r'}`).join(' ')}`);
}
console.log(failures?`FAILED ${failures}/${total}`:`PASSED ${total}/${total}`);
process.exit(failures?1:0);
