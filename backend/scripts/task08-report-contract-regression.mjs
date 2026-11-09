import { buildFrozenReportPayload } from '../dist/report/payload.js';
import { deterministicFallbackNarrative } from '../dist/report/fallback-renderer.js';
import { validateNarrativeDraft } from '../dist/report/validator.js';

const checks=[];
function pass(condition,message){if(!condition)throw new Error(message);checks.push(message);console.log(`PASS ${message}`)}
const cats=Array.from({length:10},(_,i)=>({id:`C${i+1}`,nameMn:`Чадавх ${i+1}`,weightPct:10,module:'M1',orderIndex:i+1,baseProfileRelevance:1}));
const methodology={
 version:'TASK08-TEST',categories:cats,modules:[],cells:[],questions:[],questionById:new Map(),questionByCategoryCellPath:new Map(),secondaryEdges:[],incomingEdgesByTarget:new Map(),maxCategoryWeight:10,maxScoredCellWeight:1,
 contracts:{
  scoring:{version:'S1',bands:[{min:0,max:49,label:'Сул'},{min:50,max:79,label:'Дунд'},{min:80,max:100,label:'Сайн'}]},confidence:{version:'C1'},rootCause:{version:'R1'},recommendation:{version:'REC1'},actionPlan:{version:'AP1'},aiGeneration:{version:'AI1'},
  authority:{roles:[{id:'R01',label:'Гүйцэтгэх удирдлага / эзэмшигч'},{id:'R02',label:'Чиглэл хариуцсан удирдлага'}]},
  report:{version:'REP1',strengthEligibility:{minimumScore:80,minimumConfidence:.8,minimumCoverage:.7},limits:{strengths:5,rootFindings:3,executionLocalActions:5,evidenceValidationActions:2,risks:4}},
  naDnk:{},manyToMany:{},contradiction:{},routing:{},profileRelevance:{},companyProfile:{},purposes:{}
 }
};
const categories=new Map(cats.map((c,i)=>[c.id,{categoryId:c.id,moduleId:'M1',confirmedNotApplicable:false,partialScore:i<5?90:35,officialScore:i<5?90:35,confidence:.95,coverage:.95,applicableCellCount:1,finalizedCellCount:1,unresolvedCellCount:0,reviewRequiredCellCount:0,baseWeightPct:10,effectiveModuleWeightPct:10}]));
const purposeLabels=Object.fromEntries(Array.from({length:8},(_,i)=>[`P${i+1}`,`Зорилго ${i+1}`]));
const purposes=new Map(Object.keys(purposeLabels).map((id,i)=>[id,{purposeId:id,partialScore:76-i*3,officialScore:76-i*3,confidence:.9,coverage:.9}]));
const snapshot={overall:{partialScore:65,officialScore:65,confidence:.92,coverage:.91},purposes,categories,cells:new Map(),contradictions:[]};
const roots=[1,2,3].map(n=>({id:`ROOT${n}`,categoryId:`C${5+n}`,cellId:'CELL1',classification:n===1?'PRIMARY_ROOT_CAUSE':'CONTRIBUTING_CAUSE',score:35,confidence:.9,severity:70,sourceTraceIds:[`category:C${5+n}`,`root:ROOT${n}`]}));
const actions=Array.from({length:5},(_,i)=>({id:`REC${i+1}`,findingId:`ROOT${Math.min(i+1,3)}`,type:'EXECUTION',categoryId:`C${6+i}`,cellId:'CELL1',affectedScopes:[{findingId:`ROOT${Math.min(i+1,3)}`,categoryId:`C${6+i}`,cellId:'CELL1'}],interventionCode:'I1',titleMn:`Тэргүүлэх ажил ${i+1}`,objectiveMn:`Зорилго ${i+1}`,actionMn:`Чадавх ${6+i}-ийн бодит хэрэгжилтийг сайжруулах`,deliverableMn:`Баталгаажсан үр дүн ${i+1}`,kpiMn:`Ахицын хэмжүүр ${i+1}`,ownerRoleId:i%2?'R02':'R01',sponsorRoleId:'R01',currentCellScore:35,targetCellScore:70,effortLevel:3,priority:90-i,priorityBand:'P1',components:{},sourceTraceIds:[`category:C${6+i}`,`root:ROOT${Math.min(i+1,3)}`,`recommendation:REC${i+1}`]}));
const horizons=[['H0','Шууд арга хэмжээ',0,14],['H1','30 хоног',15,30],['H2','90 хоног',31,90],['H3','6 сар',91,180],['H4','12 сар',181,365]].map(([id,name,dayStart,dayEnd])=>({id,name,dayStart,dayEnd}));
const milestoneSpecs=[['REC1','H0'],['REC1','H0'],['REC2','H0'],['REC2','H0'],['REC3','H1'],['REC4','H2'],['REC5','H4']];
const milestones=milestoneSpecs.map(([recId,horizon],i)=>{const a=actions.find(x=>x.id===recId);return {id:`MS${i+1}`,recommendationId:a.id,findingId:a.findingId,horizon,phaseIndex:i+1,requirement:'Required',titleMn:a.titleMn,milestoneMn:`${a.titleMn}-ыг хэрэгжүүлж бодит ажиллагаанд нэвтрүүлэх ${i+1}`,deliverableMn:a.deliverableMn,kpiMn:a.kpiMn,ownerRoleId:a.ownerRoleId,priorityBand:'P1',recommendationPriority:a.priority,scheduleScore:a.priority-i/10,sourceTraceIds:[...a.sourceTraceIds,`milestone:MS${i+1}`],status:'NOT_STARTED'};});
const strategy={rootCause:{version:'R1',findings:roots,selectedFindings:roots},recommendations:{version:'REC1',capacityLevel:3,selectedPurposeId:null,candidates:actions,executionActions:actions,evidenceActions:[],suppressed:[]},actionPlan:{version:'AP1',capacityLevel:3,windowDays:365,horizons,includedRecommendationIds:actions.map(x=>x.id),milestones,remeasurementHorizons:['H2']}};
const payload=buildFrozenReportPayload({reportId:'RPT-A-V3',payloadHash:'HASH',diagnosisResultHash:'D',strategyHash:'S',planHash:'P',bindingHash:'B',generatedAt:'2026-10-23T00:00:00Z',assessmentId:'A',assessmentMode:'FULL',assessmentStatus:'COMPLETED',routingState:'ADAPTIVE_V13_COMPLETE',companyName:'Бодит компани',methodology,snapshot,strategy,purposeLabels});
pass(payload.payloadVersion==='MMRI-REPORT-PAYLOAD-1.3','report payload is v1.3');
pass(payload.assessmentId==='A','assessment binding preserved');
pass(payload.purposes.length===8,'all eight methodology purposes preserved');
pass(payload.roadmap.length===5,'all five 365-day horizons preserved');
pass(payload.roadmap.flatMap(r=>r.milestones).length===7,'roadmap milestones are not truncated to three per horizon');
pass(payload.roadmap[0].milestones.length===4,'single-horizon milestone overflow is retained');
pass(payload.roadmap[0].dayStart===0&&payload.roadmap[4].dayEnd===365,'roadmap day bounds preserved');
pass(payload.roadmap[0].milestones[0].deliverableMn.startsWith('Баталгаажсан үр дүн'),'milestone deliverable preserved');
pass(payload.roadmap[0].milestones[0].ownerRoleLabelMn.includes('Гүйцэтгэх'),'responsible role label preserved');
pass(payload.displayDictionary.C6==='Чадавх 6','category dictionary preserved');
pass(payload.displayDictionary.R01.includes('Гүйцэтгэх'),'role dictionary preserved');
const draft=deterministicFallbackNarrative(payload);
const conclusion=draft.sections.find(s=>s.id==='S10')?.claims[0]?.textMn||'';
const wc=conclusion.trim().split(/\s+/).filter(Boolean).length;
pass(wc>=80&&wc<=160,`executive conclusion is 80-160 words (validator V27) (${wc})`);
const validation=validateNarrativeDraft(payload,draft);
pass(validation.state==='PASS',`deterministic real narrative validates (${validation.state})`);
const roadmapClaims=draft.sections.find(s=>s.id==='S08')?.claims||[];
pass(roadmapClaims.length===7,'narrative roadmap covers every frozen milestone');
pass(draft.sections.find(s=>s.id==='S03')?.claims.length===8,'narrative includes the actual purpose count');
console.log(JSON.stringify({status:'PASS',checks:checks.length,conclusionWords:wc,purposes:payload.purposes.length,roadmapMilestones:roadmapClaims.length},null,2));
