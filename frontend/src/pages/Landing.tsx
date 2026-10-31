import React,{useEffect,useMemo,useRef,useState} from 'react';
import { AppShell,go } from '../components/AppShell';
import { Icon } from '../components/Icon';
import { useAmbientEnvironment } from '../design/environment';
import { api,session } from '../api/client';
import { displayScore,isTerminal } from '../api/types';
import { businessAreas,type BusinessAreaId } from '../data/businessEvaluation';
import { areaReportPalette } from '../data/reportExperience';
import { isTestBusiness,REPORT_AREA_KEY,TEST_PROGRESS_PREFIX,testQuestionSets } from '../data/experience';

type GuideId='about'|'diagnosis'|'result'|'payment';
type Guide={id:GuideId;title:string;short:string;kicker:string;intro:string;icon:string};
const guides:Guide[]=[
 {id:'about',title:'BusinessMMRI.mn гэж юу вэ?',short:'BusinessMMRI.mn гэж юу вэ?',kicker:'СИСТЕМИЙН ТУХАЙ',intro:'Бизнесийн таван чиглэлийг тус тусад нь үнэлж, хаана хүчтэй, хаана сайжруулах шаардлагатайг тодорхойлоод дараагийн хийх ажлыг нэг тайланд гаргана.',icon:'radar'},
 {id:'diagnosis',title:'Оношилгоо яаж хийлгэх вэ?',short:'Оношилгоо яаж хийлгэх вэ?',kicker:'ХЭРХЭН АЖИЛЛАХ ВЭ?',intro:'Бүртгүүлэхээс эхлээд тайлангаа авах хүртэлх алхмыг товч, ойлгомжтой харуулна.',icon:'route'},
 {id:'result',title:'Оношилгооны үр дүн юу вэ?',short:'Оношилгооны үр дүн юу вэ?',kicker:'ТАЙЛАНД ЮУ БАЙХ ВЭ?',intro:'Зөвхөн оноо биш. Таны хүчтэй ба сайжруулах шаардлагатай чадавх, нэн тэргүүний 5 ажил, дараагийн 12 сарын төлөвлөгөөг нэг дор харуулна.',icon:'report'},
 {id:'payment',title:'Төлбөр хэрхэн төлөх вэ мөн хэрхэн бүртгүүлэх вэ?',short:'Төлбөр хэрхэн төлөх вэ мөн хэрхэн бүртгүүлэх вэ?',kicker:'БҮРТГЭЛ · ТӨЛБӨР',intro:'Бүртгэлээ үүсгэж, сонгосон чиглэлийн төлбөрөө QPay-аар төлөөд оношилгоогоо шууд эхлүүлнэ.',icon:'wallet'},
];

// One unified treatment for all four guides (no per-card rainbow); the page tint comes from the ambient environment.
const guideTone={a:'#EAF6FF',b:'#8CCBFF'};
// Every guide switches the whole environment to the SAME cobalt `guide` mode (not per-guide colours).
const tileOrder:BusinessAreaId[]=['marketing','it','finance','people','operations'];
const guideColors:Record<GuideId,{a:string;b:string}>={about:guideTone,diagnosis:guideTone,result:guideTone,payment:guideTone};
const guideStyle=(id:GuideId)=>({'--domain-primary':guideColors[id].a,'--domain-secondary':guideColors[id].b,'--glyph-a':guideColors[id].a,'--glyph-b':guideColors[id].b} as React.CSSProperties);
function GuideTileNo({n}:{n:number}){
 return <span className="mmri-home2__guide-no" aria-hidden="true">{String(n).padStart(2,'0')}</span>;
}

function StepArrow(){return <span className="mmri-guide2__arrow" aria-hidden="true"><Icon name="arrow" size={22}/></span>}

function AboutGuide(){
 const stats=[['5','удирдлагын чиглэл'],['320','удирдлагын чадавх'],['25,000+','боломжит асуултын сан'],['250–350','нөхцөлд сонгогдох асуулт'],['12 сар','хэрэгжилтийн төлөвлөгөө']];
 return <div className="mmri-guide2__about">
  <div className="mmri-guide2__stats">{stats.map(([n,l])=><article key={l}><strong>{n}</strong><span>{l}</span></article>)}</div>
  <div className="mmri-guide2__feature-list">
   <article><span><Icon name="language" size={22}/></span><div><strong>Монгол бизнесийн хэрэглээнд нийцсэн</strong><p>Асуулт, тайлбар, зөвлөмж, төлөвлөгөөг бизнесийн хэрэглээнд ойлгомжтой Монгол хэлээр хүргэнэ.</p></div></article>
   <article><span><Icon name="target" size={22}/></span><div><strong>Зөвхөн ерөнхий оноогоор хязгаарлахгүй</strong><p>Таван чиглэл бүрийн 64 чадавхаас аль нь сайн, аль нь эхэлж сайжруулах шаардлагатайг ялгаж харуулна.</p></div></article>
   <article><span><Icon name="route" size={22}/></span><div><strong>Үр дүнгээс шууд хийх ажил руу шилжинэ</strong><p>Тайлан нь нэн тэргүүний 5 ажил, бодит хугацаатай 12 сарын төлөвлөгөө, ахицаа шалгах цэгүүдтэй байна.</p></div></article>
  </div>
 </div>;
}

function DiagnosisGuide(){
 const steps=[
  ['Байгууллагаа бүртгүүлнэ','Үндсэн мэдээллээ оруулаад 20 суурь асуултад нэг удаа хариулна.','building'],
  ['Оношлуулах чиглэлээ сонгоно','Мэдээллийн технологи, Маркетинг, Санхүү, Хүний нөөц, Үйлдвэрлэл ба үйл ажиллагаанаас нэгийг сонгоно.','grid'],
  ['Төлбөрөө төлж эрхээ нээнэ','Сонгосон чиглэлийн төлбөр баталгаажмагц тухайн оношилгоо нээгдэнэ.','wallet'],
  ['Асуултад нэг нэгээр нь хариулна','Асуултууд байгууллагын нөхцөл, өмнөх хариултад нийцэн үргэлжилж, явц автоматаар хадгалагдана.','question'],
  ['Тайлангаа авна','Оношилгоо дуусмагц нэн тэргүүний 5 ажил, 12 сарын төлөвлөгөөтэй тайлангаа авна.','file'],
 ];
 return <div className="mmri-guide2__timeline">{steps.map((step,index)=><React.Fragment key={step[0]}>
  <article className="mmri-guide2__timeline-step">
   <b>{String(index+1).padStart(2,'0')}</b>
   <span className="mmri-guide2__step-icon"><Icon name={step[2]} size={22}/></span>
   <div><strong>{step[0]}</strong><p>{step[1]}</p></div>
  </article>
  {index<steps.length-1&&<StepArrow/>}
 </React.Fragment>)}</div>;
}

function ResultGuide(){
 const items=[
  ['chart','Ерөнхий оноо ба 5 гол зорилгын төлөв','Тухайн чиглэлийн өнөөгийн байдлыг нэг хараад ойлгоно.'],
  ['check','Хамгийн хүчтэй 5 чадавх','Чадавх бүрийн утгыг товч тайлбартай нь харна.'],
  ['alert','Эхэлж сайжруулах 5 чадавх','Сайжруулалтаа хаанаас эхлэхийг хамгийн сул 5 чадавхаар тодорхойлно.'],
  ['bolt','Нэн тэргүүний 5 ажил','Сайжруулах шаардлагатай хэсэг бүр дээр эхэлж хийх ажлыг тодорхой өгнө.'],
  ['calendar','12 сарын хэрэгжүүлэх төлөвлөгөө','Хэзээ юу хийх, хэн хариуцах, ахицыг юугаар хэмжихийг харуулна.'],
  ['download','PDF тайлан','Тайлангаа бүрэн агуулгатай, хэвлэхэд тохирсон PDF файлаар авна.'],
 ];
 return <div className="mmri-guide2__results">{items.map(item=><article key={item[1]}><span><Icon name={item[0]} size={23}/></span><div><strong>{item[1]}</strong><p>{item[2]}</p></div></article>)}</div>;
}

function PaymentGuide(){
 const steps=[
  ['Бүртгэлээ үүсгэнэ','Байгууллагын нэр болон үндсэн мэдээллээ оруулна.','user'],
  ['Чиглэлээ сонгоно','Сонгосон чиглэлийн ТӨЛӨХ товчоор төлбөрийн хэсгийг нээнэ.','grid'],
  ['QPay-аар төлнө','300,000₮-ийн QR кодыг банкны апп-аараа уншуулж төлнө.','wallet'],
  ['Эрх нээгдэнэ','Төлбөр баталгаажмагц сонгосон оношилгооны эрх нээгдэнэ.','unlock'],
 ];
 return <div className="mmri-guide2__payment">
  <div className="mmri-guide2__timeline is-payment">{steps.map((step,index)=><React.Fragment key={step[0]}>
   <article className="mmri-guide2__timeline-step">
    <b>{String(index+1).padStart(2,'0')}</b>
    <span className="mmri-guide2__step-icon"><Icon name={step[2]} size={22}/></span>
    <div><strong>{step[0]}</strong><p>{step[1]}</p></div>
   </article>
   {index<steps.length-1&&<StepArrow/>}
  </React.Fragment>)}</div>
  <div className="mmri-guide2__rules"><strong>Мэдэх шаардлагатай зүйлс</strong><ul><li>Нэг төлбөр нь сонгосон нэг чиглэлийн нэг удаагийн оношилгоонд хамаарна.</li><li>Өөр чиглэлээр оношлуулах бол тухайн чиглэлийн төлбөрийг тусад нь төлнө.</li><li>Дахин оношлуулах төлбөр 300,000₮ бөгөөд шинэ тайлан тусдаа үүснэ.</li><li>Төлбөр баталгаажсаны дараа оношилгооны эрх автоматаар нээгдэнэ.</li></ul></div>
 </div>;
}

function GuideBody({id}:{id:GuideId}){if(id==='about')return <AboutGuide/>;if(id==='diagnosis')return <DiagnosisGuide/>;if(id==='result')return <ResultGuide/>;return <PaymentGuide/>}

export default function Landing(){
 const loggedIn=!!session.accessToken;
 const [open,setOpen]=useState<GuideId|null>(null);
 const [previewArea,setPreviewArea]=useState<BusinessAreaId|null>(null);
 useAmbientEnvironment(open?'guide':previewArea);
 const [scores,setScores]=useState<Partial<Record<BusinessAreaId,number|null>>|undefined>(undefined);
 const stageRef=useRef<HTMLElement|null>(null);
 const guidePanelRef=useRef<HTMLDivElement|null>(null);
 const guideTitleRef=useRef<HTMLHeadingElement|null>(null);
 const guideTriggerRef=useRef<HTMLButtonElement|null>(null);
 useEffect(()=>{document.body.classList.add('mmri-home2-active');return()=>document.body.classList.remove('mmri-home2-active')},[]);
 useEffect(()=>{
  if(!open)return;
  const stage=stageRef.current;
  stage?.setAttribute('inert','');
  document.body.classList.add('mmri-modal-open');
  requestAnimationFrame(()=>guideTitleRef.current?.focus());
  const onKey=(e:KeyboardEvent)=>{
   if(e.key==='Escape'){e.preventDefault();setOpen(null);return}
   if(e.key!=='Tab')return;
   const panel=guidePanelRef.current;if(!panel)return;
   const items=Array.from(panel.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'));
   if(!items.length){e.preventDefault();guideTitleRef.current?.focus();return}
   const first=items[0],last=items[items.length-1];
   if(document.activeElement===guideTitleRef.current){e.preventDefault();(e.shiftKey?last:first).focus()}
   else if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}
   else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}
  };
  document.addEventListener('keydown',onKey);
  return()=>{stage?.removeAttribute('inert');document.body.classList.remove('mmri-modal-open');document.removeEventListener('keydown',onKey);requestAnimationFrame(()=>guideTriggerRef.current?.focus())};
 },[open]);
 useEffect(()=>{if(!loggedIn)return;let live=true;void (async()=>{try{let companyId=session.companyId;let name=session.companyName||'';if(!companyId){const companies=await api.listCompanies();const c=companies[0];if(!c)return;companyId=c.id;name=c.name;session.companyId=c.id;session.companyName=c.name}if(!live)return;if(isTestBusiness(name)){const completed=new Set<BusinessAreaId>(['marketing','operations']);const testScores:Partial<Record<BusinessAreaId,number|null>>={};for(const area of businessAreas){const progress=Number(sessionStorage.getItem(`${TEST_PROGRESS_PREFIX}${area.id}`)||0);const total=testQuestionSets[area.id]?.length||1;if(completed.has(area.id)||progress>=total)testScores[area.id]=area.demoScore}setScores(testScores);return}const rows=await api.listAssessments(companyId);const done=rows.filter(r=>isTerminal(r.status)).sort((a,b)=>new Date(b.completedAt||b.updatedAt).getTime()-new Date(a.completedAt||a.updatedAt).getTime());if(!done.length){setScores({});return}const latestByArea=new Map<BusinessAreaId,(typeof done)[number]>();for(const row of done){const storedArea=localStorage.getItem(`mmri.assessmentArea.${row.id}`) as BusinessAreaId|null;const backendArea=row.domainCode as BusinessAreaId;const areaId:BusinessAreaId=businessAreas.some(a=>a.id===backendArea)?backendArea:storedArea&&businessAreas.some(a=>a.id===storedArea)?storedArea:'marketing';if(!latestByArea.has(areaId))latestByArea.set(areaId,row)}const next:Partial<Record<BusinessAreaId,number|null>>={};await Promise.all([...latestByArea.entries()].map(async([areaId,row])=>{try{const result=await api.getResults(row.id);const value=displayScore(result.overall);if(value!=null)next[areaId]=value}catch{}}));if(live)setScores(next)}catch{if(live)setScores({})}})();return()=>{live=false}},[loggedIn]);
 const guide=guides.find(g=>g.id===open);
 const homeScores=useMemo(()=>scores??{},[scores]);
 const startDiagnosis=()=>go(loggedIn?'analysis':'login');
 return <AppShell route="home"><div className="mmri-home2">
  <main ref={stageRef} className="mmri-home2__stage">
   <div className="mmri-home2__hero-grid">
    <section className="mmri-home2__message" aria-labelledby="mmri-home2-title">
     <div className="mmri-home2__message-inner">
      <h1 id="mmri-home2-title" data-route-heading tabIndex={-1}><span>Бизнесийнхээ бодит дүр зургийг хар.</span> <em>Дараагийн 12 сарынхаа зөв алхмыг тодорхойл.</em></h1>
      <button type="button" className="mmri-home2__start" onClick={startDiagnosis}><span>ОНОШИЛГОО ЭХЛҮҮЛЭХ</span><Icon name="arrow" size={21}/></button>
     </div>
    </section>

    <section className="mmri-home2__tiles" aria-label="Бизнесийн таван чиглэл">
     {tileOrder.map(id=>{const area=businessAreas.find(x=>x.id===id)!;const palette=areaReportPalette[id];const score=homeScores?.[id];const has=typeof score==='number';
      return <button type="button" key={id} className="mmri-cat-tile cat-tile" data-area={id} style={{'--domain-primary':palette.accent,'--domain-secondary':palette.secondary,'--domain-deep':palette.deep} as React.CSSProperties}
       onMouseEnter={()=>setPreviewArea(id)} onMouseLeave={()=>setPreviewArea(null)} onFocus={()=>setPreviewArea(id)} onBlur={()=>setPreviewArea(null)}
       onClick={()=>{if(has){sessionStorage.setItem(REPORT_AREA_KEY,id);go('report')}else{sessionStorage.setItem('business:billingArea',id);sessionStorage.setItem('business:billingMode','first');go('billing')}}}
       aria-label={has?`${area.name} — оноо ${Math.round(Number(score))}`:area.name}>
        <span className={`cat-tile__value${has?'':' is-empty'}`} aria-hidden="true">{has&&<><b>{Math.round(Number(score))}</b><small>оноо</small></>}</span>
        <span className="cat-tile__label">{area.name}</span>
      </button>})}
    </section>
   </div>

   <nav className="mmri-home2__guides" aria-label="BUSINESSMMRI гарын авлага">
    {guides.map((g,gi)=><button type="button" key={g.id} className={`mmri-home2__guide glass-clear is-${g.id}`} style={guideStyle(g.id)} onClick={e=>{guideTriggerRef.current=e.currentTarget;setOpen(g.id)}} aria-haspopup="dialog" aria-expanded={open===g.id} aria-controls={open===g.id?'mmri-guide2-dialog':undefined} aria-label={g.title}>
      <GuideTileNo n={gi+1}/><span className="mmri-home2__guide-title">{g.short}</span>
    </button>)}
   </nav>
  </main>

  {guide&&<div id="mmri-guide2-dialog" className="mmri-guide2" role="dialog" aria-modal="true" aria-labelledby="mmri-guide2-title" onMouseDown={e=>{if(e.target===e.currentTarget)setOpen(null)}}>
   <div ref={guidePanelRef} className="mmri-guide2__panel glass-regular" data-guide={guide.id} style={guideStyle(guide.id)}>
    <button type="button" className="mmri-guide2__close" aria-label="Гарын авлагыг хаах" onClick={()=>setOpen(null)}><Icon name="close" size={25}/></button>
    <header className="mmri-guide2__header"><span>{guide.kicker}</span><h2 ref={guideTitleRef} tabIndex={-1} id="mmri-guide2-title">{guide.title}</h2><p>{guide.intro}</p></header>
    <div className="mmri-guide2__body"><GuideBody id={guide.id}/></div>
   </div>
  </div>}
 </div></AppShell>;
}
