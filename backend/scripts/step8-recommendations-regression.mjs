import fs from 'node:fs';
import path from 'node:path';
import { buildDefinition } from '../dist-strategy/engine/definition.js';
import { buildRecommendations } from '../dist-strategy/strategy/recommendations.js';
import { runStrategyPipeline } from '../dist-strategy/strategy/index.js';

const bundlePath=path.resolve(process.cwd(),'methodology/MMRI_v3.0.3_QBANK_v3.1.3_STEP6_OF6_ACCEPTED_FINAL.json');
const def=buildDefinition(JSON.parse(fs.readFileSync(bundlePath,'utf8')));
const results=[];
const check=(name,ok,detail='')=>{results.push({name,status:ok?'PASS':'FAIL',detail:String(detail??'')}); if(!ok)console.error('FAIL',name,detail)};

function cell(categoryId,cellId,{score=30,conf=.92,status='DIRECT_FINAL',hard=false}={}){
 return {categoryId,cellId,status,directScore:score,directConfidence:conf,derivedScore:null,derivedConfidence:0,effectiveScore:score,effectiveConfidence:conf,directAnswerCount:3,independentSourceKinds:3,maxAcceptedAuthority:.9,naClaimCount:0,naClaimConfidence:0,applicabilityRelevance:1,hasHardContradiction:hard,hasSameCellVariance:false,hasSecondaryTension:false,hardContradictionRuleIds:hard?['H-TEST']:[],tensionRuleIds:[],directEvidence:[],derivedContributions:[],exhausted:status==='UNRESOLVED'};
}
function baseSnapshot(defaultScore=75){
 const cells=new Map(),categories=new Map(),purposes=new Map();
 for(const c of def.categories){categories.set(c.id,{categoryId:c.id,confirmedNotApplicable:false,partialScore:defaultScore,officialScore:defaultScore,confidence:.92,coverage:1,applicableCellCount:47,finalizedCellCount:47,unresolvedCellCount:0,reviewRequiredCellCount:0});for(const ct of def.cells)cells.set(`${c.id}:${ct.id}`,cell(c.id,ct.id,{score:ct.id==='C01'?100:defaultScore,status:ct.id==='C42'?'DIRECT_PROVISIONAL':'DIRECT_FINAL'}));}
 for(const p of ['P1','P2','P3','P4','P5'])purposes.set(p,{purposeId:p,partialScore:defaultScore,officialScore:defaultScore,confidence:.92,coverage:1});
 return {cells,categories,contradictions:[],overall:{partialScore:defaultScore,officialScore:defaultScore,confidence:.92,coverage:1,applicableCategoryCount:64,completeCategoryCount:64},purposes,categoryOutcomePriorities:new Map()};
}
function finding(categoryId,cellId,{classification='PRIMARY_ROOT_CAUSE',value=30,evidence=.9,rootStrength=.8,cellSeverity=.5,categorySeverity=.5}={}){
 return {id:`RF-${categoryId}-${cellId}`,categoryId,cellId,categoryValue:value,cellValue:value,categorySeverity,cellSeverity,categoryEvidenceFactor:evidence,cellEvidenceFactor:evidence,categoryRootScore:80,cellRootScore:80,rootStrength,incomingCauseSupport:.1,classification,role:classification==='ISOLATED_WEAKNESS'?'ISOLATED':'ROOT',classificationBasis:'CELL',downstreamCategoryIds:[],downstreamCellIds:[],sourceTraceIds:[`category:${categoryId}`,`cell:${categoryId}:${cellId}`,`root:RF-${categoryId}-${cellId}`]};
}
function rootResult(findings){return {version:def.contracts.rootCause.version,weaknessThreshold:60,findings,selectedFindings:findings.slice(0,5)}}
function profile(cap=3,purpose=6){return [{questionId:'P05',optionIndexes:[cap]},{questionId:'P20',optionIndexes:[purpose]}]}

// Structural/content contract checks.
const recContract=def.contracts.recommendation;
const interventions=recContract.composition.cellInterventions;
const objectives=recContract.composition.categoryObjectives;
check('64 category objectives',objectives.length===64,objectives.length);
check('47 intervention templates; C01 gate excluded',interventions.length===47&&!interventions.some(x=>x.cell==='C01'),interventions.length);
for(const field of ['title','action','deliverable','kpi'])check(`all interventions have ${field}`,interventions.every(x=>String(x[field]??'').trim().length>0));
for(const field of ['title','action','deliverable','kpi'])check(`intervention ${field} values unique`,new Set(interventions.map(x=>String(x[field]).trim().toLowerCase())).size===interventions.length);
check('no KPI equals deliverable',interventions.every(x=>String(x.kpi).trim().toLowerCase()!==String(x.deliverable).trim().toLowerCase()));

// Evidence-state precedence: do not execute disputed/unresolved evidence.
{
 const snap=baseSnapshot(); snap.cells.set('MS01:C03',cell('MS01','C03',{score:25,conf:.9,status:'REVIEW_REQUIRED',hard:true}));
 const f=finding('MS01','C03'); const r=buildRecommendations(def,snap,rootResult([f]),profile());
 check('hard contradiction yields RESOLVE_EVIDENCE',r.candidates.some(x=>x.type==='RESOLVE_EVIDENCE'));
 check('hard contradiction blocks execution for same finding',!r.candidates.some(x=>x.findingId===f.id&&(x.type==='EXECUTION'||x.type==='LOCAL_IMPROVEMENT')));
}
{
 const snap=baseSnapshot(); snap.cells.set('MS01:C03',cell('MS01','C03',{score:null,conf:0,status:'UNRESOLVED'})); snap.cells.get('MS01:C03').effectiveScore=null;snap.cells.get('MS01:C03').directScore=null;
 const f=finding('MS01','C03',{classification:'EVIDENCE_GAP',value:null,evidence:0,rootStrength:0}); f.cellValue=null; const r=buildRecommendations(def,snap,rootResult([f]),profile());
 check('unresolved gap yields COLLECT_EVIDENCE',r.candidates.some(x=>x.type==='COLLECT_EVIDENCE'));
 check('unresolved gap blocks execution',!r.candidates.some(x=>x.type==='EXECUTION'||x.type==='LOCAL_IMPROVEMENT'));
}
{
 const snap=baseSnapshot(); const f=finding('MS01','C03',{classification:'POSSIBLE_CAUSE',rootStrength:.25}); const r=buildRecommendations(def,snap,rootResult([f]),profile());
 check('possible cause yields validation not execution',r.candidates.length===1&&r.candidates[0].type==='VALIDATE_CAUSE',r.candidates.map(x=>x.type).join(','));
}
{
 const snap=baseSnapshot(); const f=finding('MS01','C37',{classification:'ISOLATED_WEAKNESS',value:20,rootStrength:.05}); snap.cells.set('MS01:C37',cell('MS01','C37',{score:20,conf:.92})); const r=buildRecommendations(def,snap,rootResult([f]),profile());
 check('isolated reliable weakness yields local improvement',r.candidates.some(x=>x.type==='LOCAL_IMPROVEMENT'));
}

// Duplicate-theme consolidation using C37 across many categories.
{
 const snap=baseSnapshot(74); const fs=[];
 for(const c of def.categories.slice(0,12)){snap.cells.set(`${c.id}:C37`,cell(c.id,'C37',{score:20,conf:.92}));fs.push(finding(c.id,'C37',{classification:'ISOLATED_WEAKNESS',value:20,rootStrength:.1}));}
 const r=buildRecommendations(def,snap,rootResult(fs),profile(5));
 const kpis=r.executionActions.filter(x=>x.interventionCode==='DEFINE_KPI');
 check('same intervention appears only once in visible execution list',kpis.length===1,kpis.length);
 check('consolidated recommendation preserves multiple scopes',kpis[0]?.affectedScopes.length===12,kpis[0]?.affectedScopes.length);
 check('consolidated source traces preserve all root findings',fs.every(f=>kpis[0]?.sourceTraceIds.includes(`root:${f.id}`)));
 check('no duplicate interventionCode in execution actions',new Set(r.executionActions.map(x=>x.interventionCode)).size===r.executionActions.length);
}

// Capacity changes feasibility/scheduling, but must not hide the five grounded critical actions.
{
 const snap=baseSnapshot(30); const rr=runStrategyPipeline({methodology:def,snapshot:snap,profileAnswers:profile(1)}).recommendations;
 const r3=runStrategyPipeline({methodology:def,snapshot:snap,profileAnswers:profile(3)}).recommendations;
 const r5=runStrategyPipeline({methodology:def,snapshot:snap,profileAnswers:profile(5)}).recommendations;
 check('all capacity levels keep customer-visible execution list within five', [rr,r3,r5].every(r=>r.executionActions.length<=5),`${rr.executionActions.length}/${r3.executionActions.length}/${r5.executionActions.length}`);
 check('low capacity does not hide grounded critical actions',rr.executionActions.length===r5.executionActions.length,`${rr.executionActions.length}/${r5.executionActions.length}`);
 check('capacity levels derived from P05',rr.capacityLevel===1&&r3.capacityLevel===3&&r5.capacityLevel===5,`${rr.capacityLevel}/${r3.capacityLevel}/${r5.capacityLevel}`);
}

// Owner selection: preserve category accountability unless another internal role is materially better suited.
{
 const snap=baseSnapshot(); const f=finding('MS25','C07'); snap.cells.set('MS25:C07',cell('MS25','C07',{score:20,conf:.92})); const r=buildRecommendations(def,snap,rootResult([f]),profile(3)); const a=r.candidates[0];
 check('construct-aware owner overrides clear mismatch',a.ownerRoleId==='R02',a.ownerRoleId);
 check('external partner is never auto-selected as owner',r.candidates.every(x=>x.ownerRoleId!=='R11'));
 check('category sponsor preserved',a.sponsorRoleId==='R02',a.sponsorRoleId);
}
{
 const snap=baseSnapshot(); const f=finding('MS01','C03'); snap.cells.set('MS01:C03',cell('MS01','C03',{score:20,conf:.92})); const r=buildRecommendations(def,snap,rootResult([f]),profile(3));
 check('default owner preserved when already well suited',r.candidates[0]?.ownerRoleId==='R02',r.candidates[0]?.ownerRoleId);
}

// Recommendation content/trace/causality invariants.
{
 const snap=baseSnapshot(30); const r=runStrategyPipeline({methodology:def,snapshot:snap,profileAnswers:profile(5,2)}).recommendations;
 check('selected purpose uses P20',r.selectedPurposeId==='P2',r.selectedPurposeId);
 check('all candidate priorities bounded',r.candidates.every(x=>x.priority>=0&&x.priority<=100));
 check('all priority bands valid',r.candidates.every(x=>['P1','P2','P3','P4'].includes(x.priorityBand)));
 check('all recommendations carry causal guardrail',r.candidates.every(x=>x.causalInterpretation==='DIAGNOSTIC_HYPOTHESIS_NOT_CAUSAL'));
 check('all recommendations carry affected scope',r.candidates.every(x=>x.affectedScopes?.length>=1));
 check('all recommendations preserve recommendation trace',r.candidates.every(x=>x.sourceTraceIds.includes(`recommendation:${x.id}`)));
 check('execution targets are not predictions',r.executionActions.every(x=>x.targetIsPrediction===false));
 check('execution target scores bounded 60..75',r.executionActions.every(x=>x.targetCellScore!==null&&x.targetCellScore>=60&&x.targetCellScore<=75));
 check('evidence actions have null target',r.evidenceActions.every(x=>x.targetCellScore===null));
 check('execution KPIs non-empty',r.executionActions.every(x=>x.kpiMn.trim().length>0));
 check('visible evidence action titles are distinct',new Set(r.evidenceActions.map(x=>x.titleMn)).size===r.evidenceActions.length);
 const forbidden=['REVIEW_REQUIRED','hard contradiction','resolver','evidence path','Validation note','Evidence pack'];
 check('visible evidence wording avoids internal jargon',r.evidenceActions.every(x=>forbidden.every(t=>!(x.titleMn+' '+x.actionMn+' '+x.deliverableMn+' '+x.kpiMn).includes(t))),r.evidenceActions.map(x=>x.actionMn).join(' | '));
}

// Direct dependency ordering when priority difference is small.
{
 const snap=baseSnapshot();
 for(const cid of ['C03','C04'])snap.cells.set(`MS01:${cid}`,cell('MS01',cid,{score:20,conf:.92}));
 const fs=[finding('MS01','C03',{rootStrength:.8}),finding('MS01','C04',{rootStrength:.8})];
 const r=buildRecommendations(def,snap,rootResult(fs),profile(5));
 const i3=r.executionActions.findIndex(x=>x.cellId==='C03'),i4=r.executionActions.findIndex(x=>x.cellId==='C04');
 check('dependency-aware ordering keeps upstream C03 before C04 when both visible',i3>=0&&i4>=0&&i3<i4,`${i3}/${i4}`);
}

// Not-applicable cells produce no action.
{
 const snap=baseSnapshot(); snap.cells.set('MS01:C03',cell('MS01','C03',{score:20,status:'NOT_APPLICABLE'})); const f=finding('MS01','C03'); const r=buildRecommendations(def,snap,rootResult([f]),profile());
 check('NOT_APPLICABLE cell produces no recommendation',r.candidates.length===0,r.candidates.length);
}

const summary={suite:'MMRI Step 8 recommendations regression',version:'1.0.0',total:results.length,passed:results.filter(x=>x.status==='PASS').length,failed:results.filter(x=>x.status==='FAIL').length,results};
fs.writeFileSync(path.resolve(process.cwd(),'../STEP08_RECOMMENDATIONS_REGRESSION.json'),JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify({total:summary.total,passed:summary.passed,failed:summary.failed},null,2));
if(summary.failed)process.exit(1);
