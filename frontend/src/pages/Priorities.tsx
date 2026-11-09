import React,{useEffect,useMemo,useState} from 'react';
import { AppShell,PageContainer,go } from '../components/AppShell';
import { Button,SectionHeader } from '../components/UI';
import { EmptyState,ErrorState,LoadingState } from '../components/ApiState';
import { Reveal } from '../components/Motion';
import { DemoNotice } from '../components/DemoNotice';
import { api,resolveBoundAssessmentId,session } from '../api/client';
import type { ActionPlanPayload,AssessmentSummary,Recommendation,RecommendationsPayload,ResultsPayload,PlanMilestone } from '../api/types';
import { isTerminal } from '../api/types';
import { mnText } from '../content/mongolian';

const bandLabel:Record<string,string>={P1:'Нэн тэргүүн',P2:'Өндөр ач холбогдол',P3:'Дунд ач холбогдол',P4:'Хяналтын түвшин'};
const effortLabel=(v:number)=>v<=1?'Бага':v===2?'Бага–дунд':v===3?'Дунд':v===4?'Өндөр':'Маш өндөр';
const scoreText=(v:number|null)=>v==null?'-':String(Math.round(v));
const roleLabel:Record<string,string>={
 R01:'Гүйцэтгэх удирдлага / эзэмшигч',
 R02:'Маркетингийн захирал / менежер',
 R03:'Маркетингийн мэргэжилтэн / зохицуулагч',
 R04:'Борлуулалтын захирал / менежер',
 R05:'Брэнд, харилцаа, агуулга хариуцсан ажилтан',
 R06:'Цахим маркетинг хариуцсан ажилтан',
 R07:'Харилцагчийн удирдлага, туршлага хариуцсан ажилтан',
 R08:'Бүтээгдэхүүн / үйлчилгээ хариуцсан менежер',
 R09:'Өгөгдөл, шинжилгээ, маркетингийн технологи хариуцсан ажилтан',
 R10:'Санхүү, үйл ажиллагаа, төлөвлөлт хариуцсан менежер',
 R11:'Гадаад зөвлөх, үйлчилгээ үзүүлэгч, түнш',
};

type PlanState='NOT_INCLUDED'|'NOT_STARTED'|'IN_PROGRESS'|'DONE'|'BLOCKED';
const planStateLabel:Record<PlanState,string>={NOT_INCLUDED:'Төлөвлөгөөнд ороогүй',NOT_STARTED:'Эхлээгүй',IN_PROGRESS:'Хэрэгжиж байна',DONE:'Дууссан',BLOCKED:'Саатсан'};
const planStateFrom=(milestones:PlanMilestone[],inPlan:boolean):PlanState=>{
 if(!inPlan)return 'NOT_INCLUDED';
 if(!milestones.length)return 'NOT_STARTED';
 if(milestones.some(m=>m.status==='BLOCKED'))return 'BLOCKED';
 if(milestones.every(m=>m.status==='DONE'||m.status==='SKIPPED'))return 'DONE';
 if(milestones.some(m=>m.status==='IN_PROGRESS'||m.status==='DONE'))return 'IN_PROGRESS';
 return 'NOT_STARTED';
};

const demoPriorities=[
 {id:'d1',category:'Өгөгдөл ба хэмжилт',title:'хэмжих үзүүлэлт удирдлагын циклийг тогтмолжуулах',objective:'Маркетингийн шийдвэрийг нэг стандарт хэмжилтийн циклтэй болгож, удирдлагын шийдвэрийг тогтмол өгөгдөлд тулгуурлуулах.',action:'хэмжих үзүүлэлт бүрт эзэн, эх үүсвэр, давтамж болон сарын хяналтын хурлыг тодорхойлно.',deliverable:'хэмжих үзүүлэлт хяналтын стандарт ба сарын тайлангийн загвар',kpi:'хэмжих үзүүлэлт эзэнтэй үзүүлэлтийн хувь',score:48,target:72,band:'P1',effort:2,owner:'Өгөгдөл, шинжилгээ, маркетингийн технологи хариуцсан ажилтан',planState:'IN_PROGRESS' as PlanState,horizon:'0–30 хоног'},
 {id:'d2',category:'Зах зээл ба хэрэглэгч',title:'Хэрэглэгчийн судалгааг тогтмол болгох',objective:'Зах зээлийн шийдвэрийг шинэчилсэн хэрэглэгчийн ойлголтод тулгуурлуулж, таамаглал дээр гардаг шийдвэрийг бууруулах.',action:'Сар, улирлын судалгааны хуваарь, хэрэглэгчийн бүлэг тус бүрийн ойлголтын бүртгэл, шийдвэрт ашиглах дүрмийг тогтооно.',deliverable:'Судалгааны хуваарь ба хэрэглэгчийн ойлголтын бүртгэл',kpi:'Хэрэглэгчийн ойлголт ашигласан шийдвэрийн хувь',score:52,target:75,band:'P1',effort:3,owner:'Маркетингийн захирал / менежер',planState:'NOT_STARTED' as PlanState,horizon:'15–90 хоног'},
 {id:'d3',category:'Удирдлага ба зорилго',title:'Маркетингийн зорилго ба бизнесийн зорилгыг холбох',objective:'Маркетингийн үйл ажиллагааг орлого, хэрэглэгч, брэндийн зорилготой шууд уялдуулах.',action:'3–5 хэмжигдэх зорилго, эзэн, улирлын хяналтыг нэг хуудсанд баталгаажуулна.',deliverable:'Маркетингийн зорилгын нэг хуудас',kpi:'Бизнесийн зорилготой холбогдсон ажлын хувь',score:57,target:78,band:'P2',effort:2,owner:'Маркетингийн захирал / менежер',planState:'NOT_STARTED' as PlanState,horizon:'0–30 хоног'},
 {id:'d4',category:'Борлуулалтын уялдаа',title:'Маркетинг, борлуулалтын шилжүүлгийн стандартыг шинэчлэх',objective:'Боломжит харилцагчаас борлуулалт хүртэлх алдагдлыг бууруулж, хоёр багийн хариуцлагын заагийг тодорхой болгох.',action:'Боломжит харилцагчийн шалгуур, шилжүүлэх хугацаа, эргэх холбооны мөчлөгийг хамтран тогтооно.',deliverable:'Боломжит харилцагч шилжүүлэх стандарт',kpi:'Боломжит харилцагчийн шат ахисан хувь',score:59,target:76,band:'P2',effort:3,owner:'Борлуулалтын захирал / менежер',planState:'NOT_INCLUDED' as PlanState,horizon:'-'},
 {id:'d5',category:'Брэнд ба байршуулалт',title:'Өрсөлдөөний байршуулалтыг дахин тодорхойлох',objective:'Зорилтот хэрэглэгчийн бүлэг бүрт ялгарах үнэ цэнийг илүү тодорхой болгож, өрсөлдөгчтэй андуурагдах эрсдэлийг бууруулах.',action:'Өрсөлдөгч, үнэ цэнэ, нотолгооны цэгүүдийг нэг байршуулалтын зураглалд шинэчилнэ.',deliverable:'Байршуулалтын зураглал ба гол санааны дараалал',kpi:'Гол санаа санагдах түвшин, сонголтын шалтгааны хамралт',score:61,target:74,band:'P3',effort:2,owner:'Брэнд, харилцаа, агуулга хариуцсан ажилтан',planState:'NOT_INCLUDED' as PlanState,horizon:'-'},
];

type ViewItem={id:string;category:string;title:string;objective:string;action:string;deliverable:string;kpi:string;score:number|null;target:number|null;band:string;effort:number;owner:string;planState:PlanState;horizon:string;scopeCount:number;source:Recommendation|any};

function PriorityRegister({items,selected,onSelect,demo=false}:{items:ViewItem[];selected:number;onSelect:(n:number)=>void;demo?:boolean}){
 const item=items[selected]??items[0];if(!item)return null;
 return <div className="priority-register">
  <section className="priority-register-table" aria-label="Тэргүүлэх арга хэмжээний жагсаалт">
   <header className="priority-register-head"><span>№</span><span>Тэргүүлэх арга хэмжээ</span><span>Одоо / зорилт</span><span>Зөвлөмжит хариуцагч</span><span>Ажлын төлөв</span></header>
   {items.slice(0,5).map((x,i)=><button type="button" key={x.id} className={selected===i?'active':''} onClick={()=>onSelect(i)} aria-pressed={selected===i}>
    <span className="priority-register-rank">{String(i+1).padStart(2,'0')}</span>
    <span className="priority-register-title"><small>{x.category} · {bandLabel[x.band]??x.band}</small><strong>{x.title}</strong></span>
    <span className="priority-register-score"><span><small>Одоо</small><b>{scoreText(x.score)}</b></span><span><small>Зорилт</small><b>{scoreText(x.target)}</b></span></span>
    <span className="priority-register-owner">{x.owner}</span>
    <span className={`priority-register-status state-${x.planState.toLowerCase()}`}>{planStateLabel[x.planState]}</span>
   </button>)}
  </section>

  <article className="priority-advisory" key={item.id}>
   <header className="priority-advisory-head">
    <div><span>{String(selected+1).padStart(2,'0')} · {item.category}</span><h2>{item.title}</h2><p>{item.objective}</p></div>
    {demo&&<small>Жишээ өгөгдөл</small>}
   </header>

   <dl className="priority-advisory-facts">
    <div><dt>Ач холбогдол</dt><dd>{bandLabel[item.band]??item.band}</dd></div>
    <div><dt>Одоо / зорилт</dt><dd>Одоо {scoreText(item.score)} · Зорилт {scoreText(item.target)}</dd></div>
    <div><dt>Зөвлөмжит хариуцагч</dt><dd>{item.owner}</dd></div>
    <div><dt>Ажлын төлөв</dt><dd>{planStateLabel[item.planState]}{item.horizon!=='-'?` · ${item.horizon}`:''}</dd></div><div><dt>Хамрах хүрээ</dt><dd>{item.scopeCount>1?`${item.scopeCount} чиглэл`:'1 чиглэл'}</dd></div>
   </dl>

   <section className="priority-advisory-section"><span>Зөвлөмжит арга хэмжээ</span><p>{item.action}</p></section>
   <div className="priority-advisory-outcomes">
    <section><span>Гарах үр дүн</span><p>{item.deliverable}</p></section>
    <section><span>Хэмжих үзүүлэлт</span><p>{item.kpi}</p></section>
    <section><span>Хэрэгжүүлэх ачаалал</span><p>{effortLabel(item.effort)}</p></section>
   </div>

   <footer className="priority-advisory-actions"><Button variant="secondary" onClick={()=>go('results')}>Оношилгооны үр дүн</Button><Button onClick={()=>demo?go('login'):go('report')}>{demo?'Бодит оношилгоо эхлүүлэх':'Нэгдсэн тайлан'}</Button></footer>
  </article>
 </div>
}

function DemoPriorities(){
 const [selected,setSelected]=useState(0);
 return <AppShell route="priorities"><PageContainer className="priorities">
  <DemoNotice title="Тэргүүлэх асуудлын жишээ"/>
  <SectionHeader eyebrow="Тэргүүлэх асуудал" title="Шийдвэр гаргах дараалал" description="Оношилгооноос хамгийн өндөр ач холбогдолтой тав хүртэлх арга хэмжээг нэг дарааллаар харуулна. Доорх нь дэлгэцийн жишээ өгөгдөл." action={<Button onClick={()=>go('login')}>Бодит үнэлгээ эхлүүлэх</Button>}/>
  <Reveal><PriorityRegister items={demoPriorities.map(x=>({...x,scopeCount:1,source:x as any}))} selected={selected} onSelect={setSelected} demo/></Reveal>
  <Reveal delay={70}><section className="priority-evidence"><header><span>Шийдвэрийн өмнөх нягтлал</span><h2>Нэмэлт нотолгоо шаардлагатай зүйл</h2></header><div><strong>Өрсөлдөөний байршуулалтын нотолгоог шинэчлэх</strong><p>Сүүлийн үеийн ялалт, алдагдлын мэдээлэл болон хэрэглэгчийн сонголтын шалтгааныг нягтална.</p><span>Өндөр ач холбогдол</span></div></section></Reveal>
 </PageContainer></AppShell>
}

function PrivatePriorities(){
 const [assessment,setAssessment]=useState<AssessmentSummary|null>(null);const [results,setResults]=useState<ResultsPayload|null>(null);const [recs,setRecs]=useState<RecommendationsPayload|null>(null);const [plan,setPlan]=useState<ActionPlanPayload|null>(null);const [selected,setSelected]=useState(0);const [loading,setLoading]=useState(true);const [error,setError]=useState('');
 const resolveAssessmentId=resolveBoundAssessmentId;
 const load=async()=>{setLoading(true);setError('');try{const id=await resolveAssessmentId();if(!id){go('analysis');return}const a=await api.getAssessment(id);if(session.companyId&&a.companyId!==session.companyId){session.assessmentId=null;go('analysis');return}setAssessment(a);if(!isTerminal(a.status))return;const res=await api.getResults(id);if(res.schemaVersion!=='MMRI-DIAGNOSIS-RESULT-1.0'||!res.resultHash)throw new Error('Оношилгооны баталгаажсан үр дүн олдсонгүй.');const [r,p]=await Promise.all([api.getRecommendations(id),api.getActionPlan(id)]);if(r.schemaVersion!=='MMRI-STRATEGY-PLAN-1.0'||p.schemaVersion!=='MMRI-STRATEGY-PLAN-1.0')throw new Error('Тэргүүлэх асуудал болон төлөвлөгөөний мэдээллийг баталгаажуулж чадсангүй. Дахин ачаална уу.');if(r.diagnosisResultHash!==res.resultHash||p.diagnosisResultHash!==res.resultHash)throw new Error('Тэргүүлэх асуудал болон хэрэгжилтийн төлөвлөгөөний уялдаа алдагдсан байна. Дахин ачаална уу.');if(r.strategyHash!==p.strategyHash||r.planHash!==p.planHash)throw new Error('Тэргүүлэх асуудал болон 12 сарын төлөвлөгөөний хувилбар тохирохгүй байна. Дахин ачаална уу.');setResults(res);setRecs(r);setPlan(p)}catch(e:any){setError(e?.message||'Тэргүүлэх чиглэлийн мэдээллийг ачаалж чадсангүй.')}finally{setLoading(false)}};
 useEffect(()=>{load()},[]);
 const items=useMemo<ViewItem[]>(()=>{if(!recs||!results)return[];const included=new Set(plan?.plan.includedRecommendationIds??[]);return recs.executionActions.slice(0,5).map(r=>{const scopeCats=new Set((r.affectedScopes??[{categoryId:r.categoryId}]).map(s=>s.categoryId));const milestones=(plan?.plan.milestones??[]).filter(m=>m.recommendationId===r.id);const first=milestones[0];const horizon=first?plan?.plan.horizons.find(h=>h.id===first.horizon)?.name??first.horizon:'-';const inPlan=included.has(r.id);return{id:r.id,category:`${results.categories.find(c=>c.id===r.categoryId)?.nameMn??'Чиглэл'}${scopeCats.size>1?` +${scopeCats.size-1} чиглэл`:''}`,title:mnText(r.titleMn,'Тэргүүлэх арга хэмжээ'),objective:mnText(r.objectiveMn,'Зорилго бүрдээгүй'),action:mnText(r.actionMn,'Хэрэгжүүлэх алхам бүрдээгүй'),deliverable:mnText(r.deliverableMn,'Гарах үр дүн бүрдээгүй'),kpi:mnText(r.kpiMn,'Хэмжих үзүүлэлт бүрдээгүй'),score:r.currentCellScore,target:r.targetCellScore,band:r.priorityBand,effort:r.effortLevel,owner:roleLabel[r.ownerRoleId]??'Хариуцагчийг төлөвлөгөөнд баталгаажуулна',planState:planStateFrom(milestones,inPlan),horizon:String(horizon??'-'),scopeCount:scopeCats.size,source:r}})},[recs,results,plan]);
 const selectedRec=items[selected]?.source as Recommendation|undefined;const finding=selectedRec?results?.rootCauses?.selected.find(f=>f.id===selectedRec.findingId):undefined;
 if(loading)return <AppShell route="priorities"><PageContainer><LoadingState variant="dashboard" label="Тэргүүлэх чиглэлүүдийг бэлтгэж байна..."/></PageContainer></AppShell>;
 if(error&&!recs)return <AppShell route="priorities"><PageContainer><ErrorState message={error} onRetry={load}/></PageContainer></AppShell>;
 if(!assessment)return <AppShell route="priorities"><PageContainer><LoadingState variant="dashboard" label="Оношилгооны хэсэг рүү шилжүүлж байна..."/></PageContainer></AppShell>;
 if(!isTerminal(assessment.status))return <AppShell route="priorities"><PageContainer><EmptyState title="Оношилгоо үргэлжилж байна" description="Тэргүүлэх чиглэлүүд эцсийн үнэлгээ бүрдсэний дараа эрэмбэлэгдэнэ." action={<Button onClick={()=>go('assessment')}>Оношилгоогоо үргэлжлүүлэх</Button>}/></PageContainer></AppShell>;
 if(!items.length)return <AppShell route="priorities"><PageContainer><EmptyState title="Тэргүүлэх арга хэмжээ бүрдээгүй байна" description="Оношилгооны өгөгдөлд тулгуурласан хэрэгжүүлэх зөвлөмж одоогоор алга." action={<Button onClick={()=>go('results')}>Оношилгооны үр дүн</Button>}/></PageContainer></AppShell>;
 const evidence=recs?.evidenceActions??[];
 return <AppShell route="priorities"><PageContainer className="priorities">
  <SectionHeader eyebrow="Тэргүүлэх асуудал" title="Шийдвэр гаргах дараалал" description="Тэргүүлэх арга хэмжээ бүр тухайн баталгаажсан оношилгооны үр дүнтэй холбоотой. Оношийг дахин тооцоололгүйгээр хэрэгжүүлэх дарааллыг харуулна." action={<Button variant="secondary" onClick={()=>go('results')}>Оношилгооны үр дүн</Button>}/>
  <Reveal><section className="priority-register-summary"><div><strong>{items.length}</strong><span>тэргүүлэх арга хэмжээ</span></div><div><strong>{items.filter(x=>x.planState!=='NOT_INCLUDED').length}</strong><span>сонгосон арга хэмжээ</span></div><p>Энд зөвхөн шийдвэр гаргахад шаардлагатай эрэмбэлсэн арга хэмжээг харуулна. Үндсэн зөвлөмж, оношилгооны эх өгөгдөл тогтвортой хадгалагдана.</p></section></Reveal>
  <Reveal delay={45}><PriorityRegister items={items} selected={selected} onSelect={setSelected}/></Reveal>
  {finding&&<Reveal delay={75}><section className="priority-hypothesis"><span>Суурь шалтгааны таамаглал</span><h2>Энэ арга хэмжээ нь оношилгоогоор тодорсон суурь хүчин зүйлтэй холбоотой.</h2><p>Энэ нь шууд батлагдсан шалтгаан биш. Оношилгоогоор дэмжигдсэн таамаглал тул хэрэгжүүлэхийн өмнө шаардлагатай мэдээллийг нягтална.</p></section></Reveal>}
  {evidence.length>0&&<Reveal delay={95}><section className="priority-evidence"><header><span>Шийдвэрийн өмнөх нягтлал</span><h2>Нэмэлт нотолгоо шаардлагатай зүйлс</h2><p>Эдгээр нь үндсэн арга хэмжээ биш; нотолгооны цоорхой, зөрүү эсвэл шалтгааны таамаглалыг баталгаажуулах нягтлах ажил юм.</p></header>{evidence.slice(0,3).map(e=><div key={e.id}><strong>{mnText(e.titleMn,'Нягтлах ажил')}</strong><p>{mnText(e.actionMn,'Нягтлах алхам бүрдээгүй')}</p><span>{bandLabel[e.priorityBand]??e.priorityBand}</span></div>)}</section></Reveal>}
  <Reveal delay={115}><section className="priority-handoff"><div><span>Дараагийн алхам</span><h2>Тэргүүлэх асуудлуудаа нэгдсэн тайлан дээр нэг дороос хар.</h2></div><Button onClick={()=>go('report')}>Нэгдсэн тайлан</Button></section></Reveal>
 </PageContainer></AppShell>
}

export default function Priorities(){return session.accessToken?<PrivatePriorities/>:<DemoPriorities/>}
