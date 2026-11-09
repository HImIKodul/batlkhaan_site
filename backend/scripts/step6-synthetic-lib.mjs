import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { buildDefinition, calculateRuntimeSnapshot, routeNextQuestion, evidenceFromAnswer } from '../dist-engine/engine/index.js';

const bundlePath=path.resolve(process.cwd(),'methodology/MMRI_v3.0.3_QBANK_v3.1.3_STEP6_OF6_ACCEPTED_FINAL.json');
const bundle=JSON.parse(fs.readFileSync(bundlePath,'utf8'));
const def=buildDefinition(bundle);
const outPath=path.resolve(process.cwd(),'../STEP06_SYNTHETIC_COMPANY_SIMULATIONS.json');
const csvPath=path.resolve(process.cwd(),'../STEP06_SYNTHETIC_COMPANY_SUMMARY.csv');
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
const ih=s=>parseInt(sha(s).slice(0,8),16)>>>0;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));

function q(cat,cid,p){const x=def.questionByCategoryCellPath.get(`${cat}:${cid}:${p}`);if(!x)throw new Error(`missing ${cat}:${cid}:${p}`);return x;}
function optionByState(qq,state){const o=qq.options.find(x=>x.state===state);if(!o)throw new Error(`No ${state} for ${qq.id}`);return o.optionIndex;}
function scoredOptions(qq){return qq.options.filter(o=>o.score!==null&&o.state==='SCORED');}
function closestOption(qq,target){const rows=scoredOptions(qq);if(rows.length)return rows.slice().sort((a,b)=>Math.abs(a.score-target)-Math.abs(b.score-target)||a.optionIndex-b.optionIndex)[0].optionIndex;return contextOption(qq);}
function oppositeOption(qq,target){const rows=scoredOptions(qq);if(rows.length)return rows.slice().sort((a,b)=>Math.abs(b.score-target)-Math.abs(a.score-target)||a.optionIndex-b.optionIndex)[0].optionIndex;return contextOption(qq);}
function contextOption(qq){const rows=qq.options.filter(o=>!['DNK','N_A_CLAIM','UNAVAILABLE'].includes(o.state));if(!rows.length)return qq.options[0].optionIndex;return rows[Math.floor((rows.length-1)/2)].optionIndex;}

function d01Evidence(relevantCount,authority=.95){
  const out=[];
  for(const [idx,c] of def.categories.entries()){
    if(idx<relevantCount){
      const qq=q(c.id,'C01',1);
      out.push(evidenceFromAnswer({definition:def,question:qq,optionIndex:optionByState(qq,'APPLICABLE'),explicitAuthority:authority,respondentRoleId:'R01'}));
    } else {
      for(const p of [1,2,3]){
        const qq=q(c.id,'C01',p);
        out.push(evidenceFromAnswer({definition:def,question:qq,optionIndex:optionByState(qq,'N_A_CLAIM'),explicitAuthority:authority,respondentRoleId:'R01'}));
      }
    }
  }
  return out;
}

function makeScenario(cfg){
  const evidence=d01Evidence(cfg.relevantCount,cfg.scopeAuthority??.95);
  const asked=new Set(evidence.map(e=>e.questionId));
  const selected=[];
  const roleSet=new Set();
  let snapshot=calculateRuntimeSnapshot(def,evidence);
  let terminal=null;
  const maxSteps=cfg.maxSteps??5000;
  for(let step=0;step<maxSteps;step++){
    const decision=routeNextQuestion(def,{mode:cfg.mode,snapshot,evidence,askedQuestionIds:asked,profileAnswers:[],diagnosticQuestionCount:evidence.filter(e=>e.cellId!=='C01').length,relevantCapabilityCount:cfg.relevantCount});
    terminal=decision;
    if(!decision.nextQuestion) break;
    const qq=decision.nextQuestion.question;
    if(asked.has(qq.id))throw new Error(`${cfg.id}: duplicate ${qq.id}`);
    const policy=def.runtimePolicy.questionById.get(qq.id);
    if(!policy?.directAskAllowed||policy.routingState==='INFER_ONLY')throw new Error(`${cfg.id}: illegal direct ${qq.id}`);
    asked.add(qq.id);selected.push(qq.id);
    const h=ih(`${cfg.id}:${qq.id}`);
    let oi;
    const target=typeof cfg.target==='function'?cfg.target(qq,h):cfg.target;
    const dnk=qq.options.find(o=>o.state==='DNK');
    const na=qq.options.find(o=>o.state==='N_A_CLAIM');
    const dnkHit=dnk&&cfg.dnkRate&&((h%10000)/10000)<cfg.dnkRate;
    const naHit=na&&cfg.naRate&&((h%10000)/10000)<cfg.naRate;
    if(cfg.allDnk&&dnk) oi=dnk.optionIndex;
    else if(dnkHit) oi=dnk.optionIndex;
    else if(naHit) oi=na.optionIndex;
    else if(cfg.conflictRate&&qq.path===3&&scoredOptions(qq).length&&((h%10000)/10000)<cfg.conflictRate) oi=oppositeOption(qq,target);
    else oi=closestOption(qq,target);

    const authority=typeof cfg.authority==='function'?cfg.authority(qq,h):cfg.authority;
    const roleId=cfg.multiRespondent ? ['R01','R02','R05','R06'][qq.path%4] : (cfg.roleId??'R02');
    roleSet.add(roleId);
    evidence.push(evidenceFromAnswer({definition:def,question:qq,optionIndex:oi,explicitAuthority:authority,respondentRoleId:roleId}));
    snapshot=calculateRuntimeSnapshot(def,evidence);
  }
  if(terminal?.nextQuestion) throw new Error(`${cfg.id}: guard exceeded ${maxSteps}`);
  const cells=[...snapshot.cells.values()];
  const maturityCells=cells.filter(c=>!['C01','C42'].includes(c.cellId)&&c.status!=='NOT_APPLICABLE');
  const known=maturityCells.filter(c=>c.effectiveScore!==null);
  const weak=known.filter(c=>c.effectiveScore<60).length;
  const strong=known.filter(c=>c.effectiveScore>=80).length;
  const review=cells.filter(c=>c.status==='REVIEW_REQUIRED').length;
  const hard=cells.filter(c=>c.hasHardContradiction).length;
  const inferAsked=selected.filter(id=>def.runtimePolicy.questionById.get(id)?.routingState==='INFER_ONLY').length;
  const dnkCount=evidence.filter(e=>e.state==='DNK').length;
  const naCount=evidence.filter(e=>e.state==='N_A_CLAIM'&&e.cellId!=='C01').length;
  return {
    id:cfg.id,label:cfg.label,mode:cfg.mode,relevantCount:cfg.relevantCount,target:typeof cfg.target==='number'?cfg.target:null,
    terminalState:terminal?.state??null,stopReason:terminal?.stopReason??null,
    routingQuestions:evidence.filter(e=>e.cellId==='C01').length,diagnosticQuestions:evidence.filter(e=>e.cellId!=='C01').length,totalQuestions:evidence.length,
    overall:{partialScore:snapshot.overall.partialScore,officialScore:snapshot.overall.officialScore,confidence:snapshot.overall.confidence,coverage:snapshot.overall.coverage,applicableCategoryCount:snapshot.overall.applicableCategoryCount,completeCategoryCount:snapshot.overall.completeCategoryCount},
    quality:{knownMaturityCells:known.length,totalMaturityCells:maturityCells.length,weakCells:weak,strongCells:strong,reviewRequiredCells:review,hardContradictionCells:hard,dnkAnswers:dnkCount,naAnswers:naCount,inferOnlyAsked:inferAsked,duplicateQuestions:selected.length-new Set(selected).size,roles:[...roleSet]},
    snapshotSummary:{modules:[...snapshot.modules.values()].map(m=>({moduleId:m.moduleId,partialScore:m.partialScore,officialScore:m.officialScore,confidence:m.confidence,coverage:m.coverage})),purposes:[...snapshot.purposes.values()].map(p=>({purposeId:p.purposeId,partialScore:p.partialScore,officialScore:p.officialScore,confidence:p.confidence,coverage:p.coverage}))}
  };
}


export { makeScenario };
