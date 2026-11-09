import fs from 'node:fs';
import { buildDefinition } from '../dist-strategy/engine/definition.js';
import { buildActionPlan, calculatePlanProgress, currentHorizonFromDates } from '../dist-strategy/strategy/index.js';

const bundlePath=new URL('../methodology/MMRI_v3.0.3_QBANK_v3.1.3_STEP6_OF6_ACCEPTED_FINAL.json',import.meta.url);
const bundle=JSON.parse(fs.readFileSync(bundlePath,'utf8'));
const methodology=buildDefinition(bundle);
const rc=methodology.contracts.recommendation;
const ap=methodology.contracts.actionPlan;
const ivByCell=new Map((rc.composition.cellInterventions??[]).map(x=>[x.cell,x]));
const categoryObjective=new Map((rc.composition.categoryObjectives??[]).map(x=>[x.category,x]));

const results=[];
function check(name,ok,detail=''){results.push({name,status:ok?'PASS':'FAIL',detail});if(!ok)console.error('FAIL',name,detail)}
function rec({id,categoryId='MS01',cellId='C03',type='EXECUTION',priority=90,band='P1',findingId,effort,ownerRoleId}={}){
  const iv=ivByCell.get(cellId)??{code:type,title:type,action:`${type} action`,deliverable:`${type} deliverable`,kpi:`${type} KPI`,effortLevel:1};
  const obj=categoryObjective.get(categoryId)??{objective:`${categoryId} objective`,defaultOwner:'R02',sponsor:'R01'};
  return {
    id:id??`REC-${type}-${categoryId}-${cellId}-${iv.code}`,
    findingId:findingId??`F-${categoryId}-${cellId}`,
    type,categoryId,cellId,interventionCode:type==='EXECUTION'||type==='LOCAL_IMPROVEMENT'?String(iv.code):type,
    titleMn:type==='EXECUTION'||type==='LOCAL_IMPROVEMENT'?String(iv.title):`${type} — ${categoryId}`,
    objectiveMn:String(obj.objective),actionMn:type==='EXECUTION'||type==='LOCAL_IMPROVEMENT'?String(iv.action):`${type} evidence action for ${categoryId}`,
    deliverableMn:type==='EXECUTION'||type==='LOCAL_IMPROVEMENT'?String(iv.deliverable):`${type} evidence pack`,
    kpiMn:type==='EXECUTION'||type==='LOCAL_IMPROVEMENT'?String(iv.kpi):`${type} evidence KPI`,
    ownerRoleId:ownerRoleId??String(obj.defaultOwner),sponsorRoleId:String(obj.sponsor),currentCellScore:30,targetCellScore:type==='EXECUTION'?60:null,targetIsPrediction:false,
    effortLevel:effort??Number(iv.effortLevel??1),priority,priorityBand:band,components:{rootStrength:.8,severity:.8,categoryImportance:.8,purposeEmphasis:.8,evidence:.9,feasibility:.8},
    sourceTraceIds:[`root:${findingId??`F-${categoryId}-${cellId}`}`,`recommendation:${id??'auto'}`],affectedScopes:[{findingId:findingId??`F-${categoryId}-${cellId}`,categoryId,cellId}],causalInterpretation:'DIAGNOSTIC_HYPOTHESIS_NOT_CAUSAL'
  };
}
function result(capacityLevel,executionActions=[],evidenceActions=[]){return {version:'MMRI-RECOMMENDATION-1.0',capacityLevel,selectedPurposeId:null,candidates:[...executionActions,...evidenceActions],executionActions,evidenceActions,suppressed:[]}}
function startOf(plan,id){const ms=plan.milestones.filter(m=>m.recommendationId===id&&m.horizon!=='DEFERRED_BEYOND_V1');const order=['H0','H1','H2','H3','H4'];return ms.length?ms.map(m=>m.horizon).sort((a,b)=>order.indexOf(a)-order.indexOf(b))[0]:null}
function reqCounts(plan){const out={H0:0,H1:0,H2:0,H3:0,H4:0};for(const m of plan.milestones)if(m.requirement==='Required'&&m.horizon in out)out[m.horizon]++;return out}

// Contract basics.
check('contract version',ap.version==='MMRI-ACTION-PLAN-1.0',ap.version);
check('365 day window',ap.planWindow.days===365,String(ap.planWindow.days));
check('five exact horizons',JSON.stringify(ap.planWindow.horizons.map(h=>[h.id,h.dayStart,h.dayEnd]))===JSON.stringify([['H0',0,14],['H1',15,30],['H2',31,90],['H3',91,180],['H4',181,365]]));
check('remeasurement H2/H3/H4',JSON.stringify(ap.remeasurement)===JSON.stringify(['H2','H3','H4']));
check('horizon day 0 is H0',currentHorizonFromDates(new Date('2026-01-01T00:00:00Z'),new Date('2026-01-01T00:00:00Z'))==='H0');
check('horizon day 14 is H0',currentHorizonFromDates(new Date('2026-01-01T00:00:00Z'),new Date('2026-01-15T00:00:00Z'))==='H0');
check('horizon day 15 is H1',currentHorizonFromDates(new Date('2026-01-01T00:00:00Z'),new Date('2026-01-16T00:00:00Z'))==='H1');
check('horizon day 30 is H1',currentHorizonFromDates(new Date('2026-01-01T00:00:00Z'),new Date('2026-01-31T00:00:00Z'))==='H1');
check('horizon day 31 is H2',currentHorizonFromDates(new Date('2026-01-01T00:00:00Z'),new Date('2026-02-01T00:00:00Z'))==='H2');
check('horizon day 91 is H3',currentHorizonFromDates(new Date('2026-01-01T00:00:00Z'),new Date('2026-04-02T00:00:00Z'))==='H3');
check('horizon day 181 is H4',currentHorizonFromDates(new Date('2026-01-01T00:00:00Z'),new Date('2026-07-01T00:00:00Z'))==='H4');

// Defensive caps independent of upstream recommendation engine.
const exec7=['C03','C04','C05','C06','C07','C08','C09'].map((c,i)=>rec({id:`E${i+1}`,categoryId:`MS${String(i+1).padStart(2,'0')}`,cellId:c,priority:95-i,band:'P1'}));
const ev3=[0,1,2].map(i=>rec({id:`V${i+1}`,categoryId:`MS${String(i+10).padStart(2,'0')}`,cellId:'C03',type:'COLLECT_EVIDENCE',priority:100-i,band:'P1'}));
const capped=buildActionPlan(methodology,result(5,exec7,ev3));
const included=new Set(capped.includedRecommendationIds);
check('execution hard cap <=5',[...included].filter(x=>x.startsWith('E')).length===5,JSON.stringify([...included]));
check('evidence hard cap <=2',[...included].filter(x=>x.startsWith('V')).length===2,JSON.stringify([...included]));

// Capacity must be active-required-work capacity, not only start capacity.
const capExec=rec({id:'CAP-EXEC',categoryId:'MS20',cellId:'C10',priority:80,band:'P1',effort:2});
const capEvidence=[rec({id:'CAP-EV1',categoryId:'MS20',cellId:'C11',type:'RESOLVE_EVIDENCE',priority:99,band:'P1'}),rec({id:'CAP-EV2',categoryId:'MS21',cellId:'C11',type:'COLLECT_EVIDENCE',priority:98,band:'P1'})];
const capPlan=buildActionPlan(methodology,result(1,[capExec],capEvidence));
const capCounts=reqCounts(capPlan);
check('capacity level 1 active required work never exceeds 1',Object.values(capCounts).every(x=>x<=1),JSON.stringify(capCounts));
check('capacity plan keeps urgent evidence actions',capPlan.includedRecommendationIds.includes('CAP-EV1')&&capPlan.includedRecommendationIds.includes('CAP-EV2'));

// Same-finding evidence must precede execution.
const sameEvidence=rec({id:'SAME-EV',categoryId:'MS22',cellId:'C03',type:'VALIDATE_CAUSE',priority:95,band:'P1',findingId:'F-SAME'});
const sameExec=rec({id:'SAME-EX',categoryId:'MS22',cellId:'C03',type:'EXECUTION',priority:90,band:'P1',findingId:'F-SAME'});
const samePlan=buildActionPlan(methodology,result(2,[sameExec],[sameEvidence]));
const order=['H0','H1','H2','H3','H4'];
check('same-finding evidence starts before execution',order.indexOf(startOf(samePlan,'SAME-EV'))<order.indexOf(startOf(samePlan,'SAME-EX')),`${startOf(samePlan,'SAME-EV')} -> ${startOf(samePlan,'SAME-EX')}`);

// Category dependency MS01 -> MS02: upstream may not start later than dependent.
const upstream=rec({id:'UP',categoryId:'MS01',cellId:'C03',priority:55,band:'P3'});
const downstream=rec({id:'DOWN',categoryId:'MS02',cellId:'C03',priority:95,band:'P1'});
const depPlan=buildActionPlan(methodology,result(3,[upstream,downstream],[]));
check('category prerequisite does not start after dependent',order.indexOf(startOf(depPlan,'UP'))<=order.indexOf(startOf(depPlan,'DOWN')),`${startOf(depPlan,'UP')} / ${startOf(depPlan,'DOWN')}`);

// Consolidated scope dependency: dependency should consider affectedScopes, not only primary category.
const mergedUp={...rec({id:'MUP',categoryId:'MS40',cellId:'C03',priority:55,band:'P3'}),affectedScopes:[{findingId:'F1',categoryId:'MS01',cellId:'C03'},{findingId:'F2',categoryId:'MS40',cellId:'C03'}]};
const mergedDown=rec({id:'MDOWN',categoryId:'MS02',cellId:'C03',priority:95,band:'P1'});
const mergedPlan=buildActionPlan(methodology,result(3,[mergedUp,mergedDown],[]));
check('dependency uses merged affected scopes',order.indexOf(startOf(mergedPlan,'MUP'))<=order.indexOf(startOf(mergedPlan,'MDOWN')),`${startOf(mergedPlan,'MUP')} / ${startOf(mergedPlan,'MDOWN')}`);

// Plan content must be recommendation-specific, not five identical generic phase sentences.
const textRec1=rec({id:'TXT1',categoryId:'MS30',cellId:'C07',priority:90,band:'P1'});
const textRec2=rec({id:'TXT2',categoryId:'MS31',cellId:'C08',priority:85,band:'P1'});
const textPlan=buildActionPlan(methodology,result(3,[textRec1,textRec2],[]));
const tx1=textPlan.milestones.find(m=>m.recommendationId==='TXT1');
const tx2=textPlan.milestones.find(m=>m.recommendationId==='TXT2');
check('execution milestone includes source action text',tx1?.milestoneMn.includes(textRec1.actionMn)===true,tx1?.milestoneMn??'');
check('different interventions have different milestone details',tx1?.milestoneMn!==tx2?.milestoneMn,`${tx1?.milestoneMn} || ${tx2?.milestoneMn}`);
check('milestone KPI trace preserved',textPlan.milestones.filter(m=>m.recommendationId==='TXT1').every(m=>m.kpiMn===textRec1.kpiMn));
check('milestone owner trace preserved',textPlan.milestones.filter(m=>m.recommendationId==='TXT1').every(m=>m.ownerRoleId===textRec1.ownerRoleId));
check('milestone source trace includes milestone id',textPlan.milestones.every(m=>m.sourceTraceIds.includes(`milestone:${m.id}`)));

// Progress semantics: monitor excluded, skipped critical is a risk, overdue based on actual horizon input.
const progressPlan=structuredClone(textPlan);
for(const m of progressPlan.milestones){if(m.requirement==='Required')m.status='DONE';else m.status='NOT_STARTED'}
let pg=calculatePlanProgress(progressPlan,'H4');
check('monitor milestones excluded from plan progress',Math.abs(pg.planProgress-1)<1e-12,String(pg.planProgress));
const critical=progressPlan.milestones.find(m=>m.requirement==='Required'&&(m.priorityBand==='P1'||m.priorityBand==='P2'));
if(critical)critical.status='SKIPPED';
pg=calculatePlanProgress(progressPlan,'H4');
check('skipped critical milestone is reported',critical?pg.skippedCriticalMilestones.includes(critical.id):false,JSON.stringify(pg.skippedCriticalMilestones));
check('skipped critical milestone degrades health',pg.health!=='ON_TRACK',pg.health);
if(critical)critical.status='NOT_STARTED';
pg=calculatePlanProgress(progressPlan,'H4');
check('unfinished earlier critical milestone becomes overdue',critical?pg.overdueCriticalMilestones.includes(critical.id):false,JSON.stringify(pg.overdueCriticalMilestones));

// All 47 intervention templates generate traceable, content-specific five-phase plans.
const interventionAudit=[];
for(const iv of rc.composition.cellInterventions??[]){
  const r=rec({id:`CAT-${iv.cell}`,categoryId:'MS50',cellId:iv.cell,priority:80,band:'P2',effort:Number(iv.effortLevel??1)});
  const p=buildActionPlan(methodology,result(3,[r],[]));
  const ms=p.milestones.filter(m=>m.recommendationId===r.id);
  const ok=ms.length===5&&ms.every(m=>m.milestoneMn.includes(r.actionMn)&&m.deliverableMn===r.deliverableMn&&m.kpiMn===r.kpiMn&&m.ownerRoleId===r.ownerRoleId);
  interventionAudit.push({cellId:iv.cell,interventionCode:iv.code,effort:Number(iv.effortLevel??1),milestones:ms.length,contentSpecific:ok});
}
check('all 47 interventions generate five phase rows',interventionAudit.length===47&&interventionAudit.every(x=>x.milestones===5),JSON.stringify(interventionAudit.filter(x=>x.milestones!==5).slice(0,3)));
check('all 47 intervention plans are action/KPI/deliverable specific',interventionAudit.every(x=>x.contentSpecific),JSON.stringify(interventionAudit.filter(x=>!x.contentSpecific).slice(0,3)));

// Capacity bands 1..5 must respect active required/high-effort constraints even with two urgent evidence actions.
for(const level of [1,2,3,4,5]){
  const c=ap.capacity[String(level)];
  const execCount=Math.min(5,Number(c.maxIncludedActions));
  const cells=['C39','C40','C41','C43','C47'];
  const ex=Array.from({length:execCount},(_,i)=>rec({id:`L${level}-E${i}`,categoryId:`MS${String(30+i).padStart(2,'0')}`,cellId:cells[i],priority:90-i,band:'P1',effort:i<2?5:4}));
  const ev=[rec({id:`L${level}-V1`,categoryId:'MS60',cellId:'C03',type:'RESOLVE_EVIDENCE',priority:99,band:'P1'}),rec({id:`L${level}-V2`,categoryId:'MS61',cellId:'C04',type:'COLLECT_EVIDENCE',priority:98,band:'P1'})];
  const p=buildActionPlan(methodology,result(level,ex,ev));
  let maxActiveSeen=0,maxHighSeen=0;
  for(const h of order){
    const activeIds=new Set(p.milestones.filter(m=>m.horizon===h&&m.requirement==='Required').map(m=>m.recommendationId));
    const active=[...ex,...ev].filter(r=>activeIds.has(r.id));
    maxActiveSeen=Math.max(maxActiveSeen,active.length);
    maxHighSeen=Math.max(maxHighSeen,active.filter(r=>r.effortLevel>=4).length);
  }
  check(`capacity ${level} active required <= contract`,maxActiveSeen<=Number(c.maxActiveActions),`${maxActiveSeen}/${c.maxActiveActions}`);
  check(`capacity ${level} high-effort active <= contract`,maxHighSeen<=Number(c.maxHighEffortActive),`${maxHighSeen}/${c.maxHighEffortActive}`);
}

// Plan structure/traceability.
check('milestone ids unique',new Set(capped.milestones.map(m=>m.id)).size===capped.milestones.length);
check('every non-deferred milestone has valid horizon',capped.milestones.every(m=>m.horizon==='DEFERRED_BEYOND_V1'||order.includes(m.horizon)));
check('every milestone has deliverable',capped.milestones.every(m=>String(m.deliverableMn??'').trim().length>0));
check('every milestone has KPI',capped.milestones.every(m=>String(m.kpiMn??'').trim().length>0));
check('every milestone has owner',capped.milestones.every(m=>String(m.ownerRoleId??'').trim().length>0));
check('all included recommendation IDs represented',capped.includedRecommendationIds.every(id=>capped.milestones.some(m=>m.recommendationId===id)),JSON.stringify(capped.includedRecommendationIds));

const csvEscape=v=>`"${String(v??'').replaceAll('"','""')}"`;
const auditCsv=['cellId,interventionCode,effort,milestones,contentSpecific',...interventionAudit.map(x=>[x.cellId,x.interventionCode,x.effort,x.milestones,x.contentSpecific].map(csvEscape).join(','))].join('\n');
fs.writeFileSync(new URL('../../../STEP09_47_INTERVENTION_RUNTIME_AUDIT.csv',import.meta.url),auditCsv+'\n');

const summary={suite:'MMRI Step 9/15 365-day action-plan regression',version:'1.0',total:results.length,passed:results.filter(x=>x.status==='PASS').length,failed:results.filter(x=>x.status==='FAIL').length,results};
fs.writeFileSync(new URL('../methodology/STEP09_ACTION_PLAN_REGRESSION.json',import.meta.url),JSON.stringify(summary,null,2));
console.log(JSON.stringify({total:summary.total,passed:summary.passed,failed:summary.failed,capCounts,dependency:[startOf(depPlan,'UP'),startOf(depPlan,'DOWN')],sameFinding:[startOf(samePlan,'SAME-EV'),startOf(samePlan,'SAME-EX')]},null,2));
if(summary.failed)process.exit(1);
