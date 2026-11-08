import fs from 'node:fs';
import {
  buildDefinition,
  calculateRuntimeSnapshot,
  evidenceFromAnswer
} from '../dist-engine/engine/index.js';

const bundles = [
  ['marketing','methodology/MMRI_v3.0.3_QBANK_v3.1.3_STEP6_OF6_ACCEPTED_FINAL.json'],
  ['it','methodology/businessmri-v2.5-runtime-bundles/MMRI_ISMRI_Methodology_4.3.5_BUSINESSMRI_V2.json'],
  ['finance','methodology/businessmri-v2.5-runtime-bundles/MMRI_FINMRI_Methodology_4.2.5_BUSINESSMRI_V2.json'],
  ['people','methodology/businessmri-v2.5-runtime-bundles/MMRI_HRMRI_Methodology_4.1.5_BUSINESSMRI_V2.json'],
  ['operations','methodology/businessmri-v2.5-runtime-bundles/MMRI_OPMRI_Methodology_4.4.5_BUSINESSMRI_V2.json']
];

const checks=[];
const check=(name,pass,detail='')=>{checks.push({name,pass:Boolean(pass),detail:String(detail)});if(!pass)throw new Error(`FAIL ${name}: ${detail}`)};
const expectThrow=(name,fn,fragment)=>{let message='';try{fn()}catch(error){message=String(error?.message??error)}check(name,message.includes(fragment),message||'did not throw')};

function scoreQuestion(def){
  const q=def.questions.find(question=>{
    const policy=def.runtimePolicy?.questionById.get(question.id);
    const scores=question.options.filter(option=>option.state==='SCORED'&&option.score!==null).map(option=>Number(option.score));
    return (policy?.scoreEligible ?? scores.length>0) && scores.includes(0) && scores.includes(100);
  });
  if(!q) throw new Error(`${def.domainCode}: no 0-100 score question`);
  return q;
}
function optionAt(q,value){const o=q.options.find(option=>option.state==='SCORED'&&Number(option.score)===value);if(!o)throw new Error(`${q.id}: missing score ${value}`);return o.optionIndex;}
function fingerprint(snapshot){
  return JSON.stringify({
    overall:snapshot.overall,
    cells:[...snapshot.cells.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([key,value])=>[key,{status:value.status,directScore:value.directScore,effectiveScore:value.effectiveScore,directConfidence:value.directConfidence,effectiveConfidence:value.effectiveConfidence,locked:value.locked??null}]),
    categories:[...snapshot.categories.entries()].sort(([a],[b])=>a.localeCompare(b)),
    modules:[...snapshot.modules.entries()].sort(([a],[b])=>a.localeCompare(b))
  });
}

for(const [domain,file] of bundles){
  const def=buildDefinition(JSON.parse(fs.readFileSync(file,'utf8')));
  const q=scoreQuestion(def);
  const low=evidenceFromAnswer({definition:def,question:q,optionIndex:optionAt(q,0),explicitAuthority:1});
  const high=evidenceFromAnswer({definition:def,question:q,optionIndex:optionAt(q,100),explicitAuthority:1});

  const lowSnapshot=calculateRuntimeSnapshot(def,[low]);
  const highSnapshot=calculateRuntimeSnapshot(def,[high]);
  const lowCell=lowSnapshot.cells.get(`${q.categoryId}:${q.cellId}`);
  const highCell=highSnapshot.cells.get(`${q.categoryId}:${q.cellId}`);
  check(`${domain} low canonical answer reaches cell score 0`,lowCell?.directScore===0,lowCell?.directScore);
  check(`${domain} replacement high canonical answer reaches cell score 100`,highCell?.directScore===100,highCell?.directScore);
  check(`${domain} answer replacement recalculates rather than accumulating`,lowCell?.directAnswerCount===1&&highCell?.directAnswerCount===1,`${lowCell?.directAnswerCount}/${highCell?.directAnswerCount}`);

  const q2=def.questions.find(question=>question.id!==q.id && question.options.some(option=>option.state==='SCORED'&&option.score!==null));
  if(!q2) throw new Error(`${domain}: no second scored question`);
  const q2option=q2.options.find(option=>option.state==='SCORED'&&option.score!==null);
  const second=evidenceFromAnswer({definition:def,question:q2,optionIndex:q2option.optionIndex,explicitAuthority:.9});
  const ordered=calculateRuntimeSnapshot(def,[low,second]);
  const reversed=calculateRuntimeSnapshot(def,[second,low]);
  check(`${domain} scoring is input-order deterministic`,fingerprint(ordered)===fingerprint(reversed));

  expectThrow(`${domain} duplicate effective question evidence rejected`,()=>calculateRuntimeSnapshot(def,[low,low]),'Duplicate effective evidence');
  expectThrow(`${domain} tampered category rejected`,()=>calculateRuntimeSnapshot(def,[{...low,categoryId:'TAMPERED'}]),'category mismatch');
  expectThrow(`${domain} tampered cell rejected`,()=>calculateRuntimeSnapshot(def,[{...low,cellId:'TAMPERED'}]),'cell mismatch');
  expectThrow(`${domain} tampered score rejected`,()=>calculateRuntimeSnapshot(def,[{...low,score:50}]),'score mismatch');
  expectThrow(`${domain} tampered reliability rejected`,()=>calculateRuntimeSnapshot(def,[{...low,reliability:Math.max(0,low.reliability-.123)}]),'reliability is not canonical');

  const highAuthority=evidenceFromAnswer({definition:def,question:q,optionIndex:optionAt(q,100),explicitAuthority:5});
  const lowAuthority=evidenceFromAnswer({definition:def,question:q,optionIndex:optionAt(q,100),explicitAuthority:-3});
  check(`${domain} explicit authority clamps to 1`,highAuthority.authority===1,highAuthority.authority);
  check(`${domain} explicit authority clamps to 0`,lowAuthority.authority===0,lowAuthority.authority);
}

console.log(JSON.stringify({status:'PASS',domains:bundles.length,checksPassed:checks.length,checksTotal:checks.length,checks},null,2));
