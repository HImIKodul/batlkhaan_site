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


/* F-ROADMAP regression: an evidence-poor assessment must still get a meaningful 12-month plan. Evidence/validation actions are scheduled inside H0-H4
   (never chained behind root-cause executions), free capacity is used, capacity limits still hold (the plan validator runs inside buildActionPlan),
   and the result is deterministic. Uses the production methodology 3.0.3. */
const H=['H0','H1','H2','H3','H4'];
const scheduled=(plan)=>plan.milestones.filter(m=>H.includes(m.horizon));
const mk=(n,type,band,pri,cell='C03',cat)=>rec({id:`REC-${type}-${cat??'MS0'+n}-${cell}-X${n}`,categoryId:cat??'MS0'+n,cellId:cell,type,band,priority:pri,findingId:'F-'+n});
const rc2=methodology.contracts.rootCause;const edges=rc2.categoryGraph?.edges??[];
check('root-cause category graph has edges (scenario is meaningful)',edges.length>0,String(edges.length));
const e0=edges[0];const cats=[e0.prerequisite,e0.dependent,...[...new Set(edges.flatMap(e=>[e.prerequisite,e.dependent]))].filter(c=>c!==e0.prerequisite&&c!==e0.dependent).slice(0,3)];
// S1: five evidence actions, capacity 2, categories that sit on real graph edges
const ev=cats.map((c,i)=>mk(i+1,'COLLECT_EVIDENCE',i<2?'P2':'P3',80-i,'C13',c));
for(const cap of [1,2,3]){const plan=buildActionPlan(methodology,result(cap,[],ev));const s=scheduled(plan);
 check(`S1 capacity ${cap}: every evidence action is scheduled inside H0-H4 (not deferred)`,ev.every(r=>plan.milestones.some(m=>m.recommendationId===r.id&&H.includes(m.horizon))),`${s.length} scheduled`);
 check(`S1 capacity ${cap}: plan is meaningful (>=3 scheduled milestones)`,s.length>=Math.min(3,ev.length),String(s.length))}
// S2: Marketing-like mix at capacity 2: five P3/P4 executions + two evidence actions
const ex=[1,2,3,4,5].map(n=>mk(n,'EXECUTION',n<3?'P3':'P4',60-n,'C0'+(n+2)));
const plan2=buildActionPlan(methodology,result(2,ex,[mk(6,'COLLECT_EVIDENCE','P3',50),mk(7,'VALIDATE_CAUSE','P3',49)]));
check('S2: both evidence/validation actions scheduled',[6,7].every(n=>plan2.milestones.some(m=>/MS0[67]/.test(m.recommendationId)&&H.includes(m.horizon)&&m.recommendationId.includes('MS0'+n))));
check('S2: at least 5 milestones scheduled inside the window',scheduled(plan2).length>=5,String(scheduled(plan2).length));
check('S2: highest-priority executions still receive slots',ex.slice(0,2).every(r=>plan2.milestones.some(m=>m.recommendationId===r.id&&H.includes(m.horizon))));
// capacity is never exceeded per horizon (re-check independently of the internal validator)
for(const plan of [plan2,buildActionPlan(methodology,result(2,[],ev))]){const cap=methodology.contracts.actionPlan.capacity[String(plan.capacityLevel)];
 for(const h of H){const ids=new Set(plan.milestones.filter(m=>m.requirement==='Required'&&m.horizon===h).map(m=>m.recommendationId));check(`capacity respected in ${h} (${ids.size}<=${cap.maxActiveActions})`,ids.size<=cap.maxActiveActions)}}
// S4: a low-priority P4 evidence action whose contract start (H2) is crowded out by two P3 executions while H0-H1 are empty must use the free early horizons
const ex4=[1,2].map(n=>mk(n,'EXECUTION','P3',60-n,'C0'+(n+2)));
const lowEv=mk(9,'COLLECT_EVIDENCE','P4',20,'C13','MS09');
const plan4=buildActionPlan(methodology,result(2,ex4,[lowEv]));
const evM=plan4.milestones.find(m=>m.recommendationId===lowEv.id);
check('S4: crowded-out evidence action is scheduled inside H0-H4 (compaction)',!!evM&&H.includes(evM.horizon),evM?.horizon);
check('S4: it uses an earlier free horizon than the crowded contract start',!!evM&&H.indexOf(evM.horizon)<2,evM?.horizon);
check('S4: both executions keep their slots',ex4.every(r=>plan4.milestones.some(m=>m.recommendationId===r.id&&H.includes(m.horizon))));
// S5: People/Operations-like company at capacity 1 (one action at a time): three P3 local improvements + two P4 evidence actions.
// Before the fix the first 30 days were empty (evidence in H2/H3, one execution phase in H4 => 3 milestones).
const li=[1,2,3].map(n=>mk(n,'LOCAL_IMPROVEMENT','P3',55,'C0'+(n+2)));
const ev5=[mk(8,'COLLECT_EVIDENCE','P4',47,'C13','MS08'),mk(9,'COLLECT_EVIDENCE','P4',47,'C13','MS09')];
const plan5=buildActionPlan(methodology,result(1,li,ev5));
check('S5: at least 5 milestones scheduled inside the window',scheduled(plan5).length>=5,String(scheduled(plan5).length));
check('S5: the first 30 days (H0-H1) are not empty',plan5.milestones.some(m=>['H0','H1'].includes(m.horizon)));
check('S5: both evidence actions start in H0-H1',ev5.every(r=>{const m=plan5.milestones.find(x=>x.recommendationId===r.id);return m&&['H0','H1'].includes(m.horizon)}));
check('S5: one local improvement runs through at least two required phases',li.some(r=>plan5.milestones.filter(m=>m.recommendationId===r.id&&m.requirement==='Required'&&H.includes(m.horizon)).length>=2));
for(const h of H){const ids=new Set(plan5.milestones.filter(m=>m.requirement==='Required'&&m.horizon===h).map(m=>m.recommendationId));check(`S5: capacity 1 respected in ${h}`,ids.size<=1,String(ids.size))}
// S6 (discriminating): capacity 1, one P3 local improvement + one P4 evidence action, both contract-start H2. The overflow rule alone pushes the improvement
// later and leaves H0-H1 empty; the compaction pass must put the evidence in H0 and let the improvement run H2-H4.
const li6=mk(1,'LOCAL_IMPROVEMENT','P3',55,'C03');const ev6=mk(9,'COLLECT_EVIDENCE','P4',47,'C13','MS09');
const plan6=buildActionPlan(methodology,result(1,[li6],[ev6]));
const evH=plan6.milestones.find(m=>m.recommendationId===ev6.id)?.horizon;
const liReq=plan6.milestones.filter(m=>m.recommendationId===li6.id&&m.requirement==='Required'&&H.includes(m.horizon)).map(m=>m.horizon);
check('S6: evidence action starts in H0 (first two weeks are used)',evH==='H0',evH);
check('S6: the improvement keeps its contract start (H2) and runs three required phases H2-H4',JSON.stringify(liReq)===JSON.stringify(['H2','H3','H4']),liReq.join(','));
// determinism
check('deterministic: identical input -> identical plan',JSON.stringify(buildActionPlan(methodology,result(2,ex,[mk(6,'COLLECT_EVIDENCE','P3',50)])))===JSON.stringify(buildActionPlan(methodology,result(2,ex,[mk(6,'COLLECT_EVIDENCE','P3',50)]))));
const failed=results.filter(r=>r.status==='FAIL');console.log(JSON.stringify({status:failed.length?'FAIL':'PASS',passed:results.length-failed.length,failed:failed.length},null,1));process.exit(failed.length?1:0);
