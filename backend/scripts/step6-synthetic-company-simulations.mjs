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

const scenarios=[
 {id:'extreme_low',label:'Extreme low maturity',mode:'QUICK',relevantCount:12,target:0,authority:.95},
 {id:'weak_company',label:'Weak company',mode:'QUICK',relevantCount:12,target:25,authority:.95},
 {id:'average_company',label:'Average company',mode:'QUICK',relevantCount:12,target:55,authority:.95},
 {id:'coherent_70',label:'Coherent 70 baseline',mode:'QUICK',relevantCount:12,target:70,authority:.90},
 {id:'strong_company',label:'Highly mature company',mode:'QUICK',relevantCount:12,target:85,authority:.95},
 {id:'extreme_high',label:'Extreme high maturity',mode:'QUICK',relevantCount:12,target:100,authority:.95},
 {id:'small_owner',label:'Small hands-on owner',mode:'QUICK',relevantCount:12,target:70,authority:.90,roleId:'R01'},
 {id:'large_company',label:'Large broad company',mode:'QUICK',relevantCount:30,target:70,authority:.90,roleId:'R02'},
 {id:'na_heavy',label:'N/A-heavy valid scope',mode:'QUICK',relevantCount:12,target:70,authority:.95,naRate:.80},
 {id:'multi_respondent',label:'Coherent multi-respondent',mode:'QUICK',relevantCount:12,target:70,authority:.90,multiRespondent:true},
 {id:'dnk_heavy',label:'DNK-heavy evidence',mode:'FULL',relevantCount:3,target:70,authority:.95,dnkRate:.65,maxSteps:1200},
 {id:'low_authority',label:'Low-authority high claims',mode:'FULL',relevantCount:3,target:90,authority:.40,maxSteps:1200},
 {id:'contradictory',label:'Record-check contradictions',mode:'FULL',relevantCount:3,target:90,authority:.95,conflictRate:.70,maxSteps:1200},
 {id:'all_dnk',label:'All DNK after scope',mode:'FULL',relevantCount:1,target:70,authority:.95,allDnk:true,maxSteps:500}
];

const results=[];
for(const cfg of scenarios){
  const r=makeScenario(cfg);results.push(r);console.log(`${r.id}: ${r.terminalState} q=${r.diagnosticQuestions} score=${r.overall.partialScore} official=${r.overall.officialScore} cov=${r.overall.coverage} review=${r.quality.reviewRequiredCells}`);
}
const byId=new Map(results.map(r=>[r.id,r]));
const checks=[];
const check=(name,pass,detail='')=>checks.push({name,pass:Boolean(pass),detail:String(detail??'')});
const score=id=>Number(byId.get(id).overall.partialScore);
const cov=id=>Number(byId.get(id).overall.coverage);
const official=id=>byId.get(id).overall.officialScore;
for(const r of results){
 check(`${r.id} no duplicate questions`,r.quality.duplicateQuestions===0,r.quality.duplicateQuestions);
 check(`${r.id} no infer-only direct questions`,r.quality.inferOnlyAsked===0,r.quality.inferOnlyAsked);
 check(`${r.id} partial score bounded`,r.overall.partialScore===null||(r.overall.partialScore>=0&&r.overall.partialScore<=100),r.overall.partialScore);
 check(`${r.id} official score bounded`,r.overall.officialScore===null||(r.overall.officialScore>=0&&r.overall.officialScore<=100),r.overall.officialScore);
}
check('maturity ordering extreme_low < weak < average < strong < extreme_high',score('extreme_low')<score('weak_company')&&score('weak_company')<score('average_company')&&score('average_company')<score('strong_company')&&score('strong_company')<score('extreme_high'),`${score('extreme_low')},${score('weak_company')},${score('average_company')},${score('strong_company')},${score('extreme_high')}`);
check('extreme low is exactly 0',Math.abs(score('extreme_low'))<1e-9,score('extreme_low'));
check('extreme high is exactly 100',Math.abs(score('extreme_high')-100)<1e-9,score('extreme_high'));
check('weak company diagnosed below 40',score('weak_company')<40,score('weak_company'));
check('average company remains mid-band',score('average_company')>=40&&score('average_company')<=70,score('average_company'));
check('strong company diagnosed >=80',score('strong_company')>=80,score('strong_company'));
check('normal QUICK scenarios complete',['extreme_low','weak_company','average_company','coherent_70','strong_company','extreme_high','small_owner','large_company','na_heavy','multi_respondent'].every(id=>byId.get(id).terminalState==='QUICK_COMPLETE'),results.filter(r=>r.mode==='QUICK').map(r=>`${r.id}:${r.terminalState}`).join(','));
check('small/large same maturity no material score bias',Math.abs(score('small_owner')-score('large_company'))<=3,`${score('small_owner')} vs ${score('large_company')}`);
check('small owner and coherent baseline align',Math.abs(score('small_owner')-score('coherent_70'))<=1,`${score('small_owner')} vs ${score('coherent_70')}`);
check('multi-respondent does not inflate score',Math.abs(score('multi_respondent')-score('coherent_70'))<=1,`${score('multi_respondent')} vs ${score('coherent_70')}`);
check('multi-respondent uses several roles',byId.get('multi_respondent').quality.roles.length>=3,byId.get('multi_respondent').quality.roles.join(','));
check('N/A-heavy does not collapse score',Math.abs(score('na_heavy')-score('coherent_70'))<=5,`${score('na_heavy')} vs ${score('coherent_70')}`);
check('N/A-heavy actually exercised N/A',byId.get('na_heavy').quality.naAnswers>20,byId.get('na_heavy').quality.naAnswers);
check('DNK-heavy actually exercised DNK',byId.get('dnk_heavy').quality.dnkAnswers>20,byId.get('dnk_heavy').quality.dnkAnswers);
check('DNK-heavy is not falsely official',official('dnk_heavy')===null,official('dnk_heavy'));
check('DNK-heavy coverage lower than coherent normal',cov('dnk_heavy')<cov('coherent_70'),`${cov('dnk_heavy')} vs ${cov('coherent_70')}`);
check('all-DNK not falsely official',official('all_dnk')===null,official('all_dnk'));
check('all-DNK has no fabricated score',byId.get('all_dnk').overall.partialScore===null||byId.get('all_dnk').overall.coverage===0,JSON.stringify(byId.get('all_dnk').overall));
check('low-authority high claims not official',official('low_authority')===null,official('low_authority'));
check('low-authority triggers review',byId.get('low_authority').quality.reviewRequiredCells>0,byId.get('low_authority').quality.reviewRequiredCells);
check('low-authority partial remains high without becoming official',score('low_authority')>=80,score('low_authority'));
check('contradictions trigger review',byId.get('contradictory').quality.reviewRequiredCells>0,byId.get('contradictory').quality.reviewRequiredCells);
check('contradictions create hard contradiction cells',byId.get('contradictory').quality.hardContradictionCells>0,byId.get('contradictory').quality.hardContradictionCells);
check('contradictory evidence not falsely official',official('contradictory')===null,official('contradictory'));

// Deterministic monotonic sweep across 11 target maturity levels.
const sweep=[];
for(let target=0;target<=100;target+=10){const r=makeScenario({id:`sweep_${target}`,label:`Sweep ${target}`,mode:'QUICK',relevantCount:3,target,authority:.95});sweep.push({target,score:r.overall.partialScore,coverage:r.overall.coverage,state:r.terminalState,questions:r.diagnosticQuestions});}
let monotonic=true;for(let i=1;i<sweep.length;i++)if(Number(sweep[i].score)+1e-9<Number(sweep[i-1].score))monotonic=false;
check('0-100 maturity sweep is monotonic',monotonic,JSON.stringify(sweep));
check('maturity sweep endpoints exact',sweep[0].score===0&&sweep.at(-1).score===100,`${sweep[0].score}/${sweep.at(-1).score}`);

const failures=checks.filter(x=>!x.pass);
const report={schema:'mmri.step06_of15.synthetic_company_simulations.v1',status:failures.length?'FAIL':'PASS',checksPassed:checks.length-failures.length,checksTotal:checks.length,failures,scenarioCount:results.length,sweep,results,checks};
fs.writeFileSync(outPath,JSON.stringify(report,null,2)+'\n');
const cols=['id','label','mode','relevantCount','terminalState','diagnosticQuestions','totalQuestions','partialScore','officialScore','confidence','coverage','weakCells','strongCells','reviewRequiredCells','hardContradictionCells','dnkAnswers','naAnswers','roles'];
const esc=v=>{const s=String(v??'');return /[",\n]/.test(s)?`"${s.replaceAll('"','""')}"`:s};
const lines=[cols.join(',')];for(const r of results)lines.push([r.id,r.label,r.mode,r.relevantCount,r.terminalState,r.diagnosticQuestions,r.totalQuestions,r.overall.partialScore,r.overall.officialScore,r.overall.confidence,r.overall.coverage,r.quality.weakCells,r.quality.strongCells,r.quality.reviewRequiredCells,r.quality.hardContradictionCells,r.quality.dnkAnswers,r.quality.naAnswers,r.quality.roles.join('|')].map(esc).join(','));fs.writeFileSync(csvPath,lines.join('\n')+'\n');
console.log(JSON.stringify({status:report.status,checksPassed:report.checksPassed,checksTotal:report.checksTotal,failures:report.failures,summary:results.map(r=>({id:r.id,state:r.terminalState,q:r.diagnosticQuestions,score:r.overall.partialScore,official:r.overall.officialScore,coverage:r.overall.coverage,review:r.quality.reviewRequiredCells,hard:r.quality.hardContradictionCells,dnk:r.quality.dnkAnswers,na:r.quality.naAnswers}))},null,2));
if(failures.length)process.exit(1);
