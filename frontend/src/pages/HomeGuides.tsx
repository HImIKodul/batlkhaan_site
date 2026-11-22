import React,{useEffect,useState} from 'react';
import { Icon } from '../components/Icon';
import { type BusinessAreaId } from '../data/businessEvaluation';
import { DOMAIN_ORDER,DOMAIN_NAME_MN,DOMAIN_ABBR,domainWithAbbr } from '../data/domainOrder';


/* ---------- Guide 1: BusinessMRI.mn гэж юу вэ? ---------- */
/* ONE static page: no tabs, slides, animation or controls. The figures below are the owner-approved guide copy (see CLAUDE_PROGRESS.md for how they relate to the validated bank counts). */
/* DRAFT PUBLIC FIGURES awaiting owner approval (5 / 320 / 75,000+ / 200-280): they differ from the verified bank (61,440 questions; 192-280 selected per diagnosis). Wording is kept as requested; counts and selection rules are NOT changed to match. */
const aboutStages:{title:string;text:string}[]=[
 {title:'БИД ХААНА БАЙНА?',text:'Бизнесийн өнөөгийн байдлыг оношилно.'},
 {title:'БИД ЮУГ САЙЖРУУЛАХ ВЭ?',text:'Асуудал, шалтгаан, сайжруулах боломжийг тодорхойлно.'},
 {title:'БИД ЦААШИД ЮУГ ХИЙХ ВЭ?',text:'Стратегийн зорилго, 12 сарын төлөвлөгөө гарна.'},
];
export function AboutGuide(){
 return <div className="mmri-about2">
  <div className="mmri-about2__cols">
   <div className="mmri-about2__cards">
    <div className="mmri-about2__card"><strong><b className="mmri-about2__num">5</b> үндсэн чиглэл</strong><div className="mmri-about2__chips">{DOMAIN_ORDER.map(id=><i key={id} style={{'--c':`var(--mmri-domain-${id})`} as React.CSSProperties}>{DOMAIN_ABBR[id]}</i>)}</div></div>
    <div className="mmri-about2__card"><strong>Компанийн <b className="mmri-about2__num">320</b> чадавхыг үнэлнэ</strong></div>
    <div className="mmri-about2__card"><strong>Оношилгооны <b className="mmri-about2__num">75,000+</b> асуултын сан</strong></div>
    <div className="mmri-about2__card"><strong>Компанийн онцлогоос шалтгаалан <b className="mmri-about2__num">200–280</b> асуулт сонгогдоно</strong></div>
    <div className="mmri-about2__card mmri-about2__card--wide"><strong>5 чиглэл бүр дээр <b className="mmri-about2__num">12</b> сарын төлөвлөгөө гарна</strong></div>
   </div>
   <ol className="mmri-about2__flow" aria-label="Оношилгооноос төлөвлөгөө хүртэлх гурван үе шат">
    {aboutStages.map((st,i)=><li key={st.title} className="mmri-about2__step">
     <div className="mmri-about2__card"><strong>{st.title}</strong><span>{st.text}</span></div>
     {i<aboutStages.length-1&&<span className="mmri-about2__arrow" aria-hidden="true"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 4v15M6 13l6 6 6-6"/></svg></span>}
    </li>)}
   </ol>
  </div>
  <p className="mmri-about2__slogan">“Монголын бизнесийн онцлогт нийцсэн, Оношилгооноос төлөвлөгөө рүү”</p>
 </div>;
}

/* ---------- Guide 2: Оношилгооны үр дүн ---------- */
/* Illustrative wording only: describes what each report section covers. It contains no scores, findings or customer results. */
type ReportKey='rating'|'strength'|'weakness'|'problem'|'top5'|'plan';
type AreaCol={id:BusinessAreaId;name:string;cells:Record<ReportKey,string>};
/* Exact approved wording of the result-section table (descriptive only: no scores, findings or customer results). Column order and names come from data/domainOrder.ts. */
const AREA_WORDS:Record<string,[rating:string,problem:string,plan:string]>={
 marketing:['Маркетингийн үнэлгээ','Маркетингийн асуудал','12 сарын маркетингийн төлөвлөгөө'],
 finance:['Санхүүгийн үнэлгээ','Санхүүгийн асуудал','12 сарын санхүүгийн төлөвлөгөө'],
 people:['Хүний нөөцийн үнэлгээ','Хүний нөөцийн асуудал','12 сарын хүний нөөцийн төлөвлөгөө'],
 it:['Мэдээллийн технологийн үнэлгээ','Мэдээллийн технологийн асуудал','12 сарын мэдээллийн технологийн төлөвлөгөө'],
 operations:['Үйл ажиллагааны үнэлгээ','Үйл ажиллагааны асуудал','12 сарын үйл ажиллагааны төлөвлөгөө']};
const reportColumns:AreaCol[]=DOMAIN_ORDER.map(id=>({id,name:domainWithAbbr(id),cells:{rating:AREA_WORDS[id][0],strength:'Хүчтэй 5 чадавх',weakness:'5 чиглэл',problem:AREA_WORDS[id][1],top5:'5 ажил',plan:AREA_WORDS[id][2]}}));
const reportRows:{key:ReportKey;label:string}[]=[
 {key:'rating',label:'Ерөнхий үнэлгээ'},
 {key:'strength',label:'Давуу тал'},
 {key:'weakness',label:'Сайжруулах чиглэл'},
 {key:'problem',label:'Гол асуудал'},
 {key:'top5',label:'Тэргүүлэх ажил'},
 {key:'plan',label:'Хөгжлийн төлөвлөгөө'},
];

function ReportMatrix(){
 return <div className="mmri-g2p-grid" role="group" aria-label="Таван чиглэлийн тайлангийн хэсгүүд">
  {reportColumns.map(c=><section key={c.id} className="mmri-g2p" data-area={c.id} style={{'--c':`var(--mmri-domain-${c.id})`} as React.CSSProperties}>
   <h3 className="mmri-g2p__head"><span className="mmri-g2p__dot" aria-hidden="true"/>{c.name}</h3>
   <dl className="mmri-g2p__rows">
    {reportRows.map(r=><div key={r.key} className="mmri-g2p__row"><dt>{r.label}</dt><dd>{c.cells[r.key]}</dd></div>)}
   </dl>
  </section>)}
 </div>;
}

/* Compact view (narrow or short viewports): the same content, one area at a time. Tabs choose the area; the sections of the chosen area are split into pages on
   phones so every panel fits the popup without an inner scrollbar. */
const pagedQuery='(max-width:820px),(max-height:780px)';
const compactQuery='(max-width:1000px),(max-height:740px)';
const narrowQuery='(max-width:700px),(max-height:680px)';
function useMedia(q:string){
 const get=()=>typeof window!=='undefined'&&typeof window.matchMedia==='function'&&window.matchMedia(q).matches;
 const [m,setM]=useState(get);
 useEffect(()=>{if(typeof window.matchMedia!=='function')return;const mq=window.matchMedia(q);const f=()=>setM(mq.matches);f();mq.addEventListener('change',f);return()=>mq.removeEventListener('change',f)},[q]);
 return m;
}
const phonePages:ReportKey[][]=[['rating','strength'],['weakness','problem'],['top5'],['plan']];
function ReportCompact(){
 const [area,setArea]=useState(0);const [page,setPage]=useState(0);
 const narrow=useMedia(narrowQuery);const col=reportColumns[area];
 const keys=narrow?phonePages[page]:reportRows.map(r=>r.key);
 const pages=narrow?phonePages.length:1;
 const tabRefs=React.useRef<(HTMLButtonElement|null)[]>([]);
 const onKey=(e:React.KeyboardEvent)=>{const d=e.key==='ArrowRight'?1:e.key==='ArrowLeft'?-1:0;if(!d)return;e.preventDefault();const n=(area+d+reportColumns.length)%reportColumns.length;setArea(n);setPage(0);tabRefs.current[n]?.focus()};
 return <div className="mmri-guide2__compact" data-area={col.id}>
  <div className="mmri-guide2__tabs" role="tablist" aria-label="Таван чиглэл" onKeyDown={onKey}>
   {reportColumns.map((c,i)=><button key={c.id} ref={el=>{tabRefs.current[i]=el}} type="button" role="tab" id={`rg-tab-${c.id}`} aria-selected={i===area} aria-controls="rg-panel" tabIndex={i===area?0:-1} data-area={c.id} className={`mmri-guide2__tab${i===area?' is-active':''}`} onClick={()=>{setArea(i);setPage(0)}}><i className="mmri-domain__mark" aria-hidden="true"/><span>{c.name}</span></button>)}
  </div>
  <div id="rg-panel" role="tabpanel" aria-labelledby={`rg-tab-${col.id}`} className="mmri-guide2__dpanel">
   {keys.map(k=>{const row=reportRows.find(r=>r.key===k)!;return <section key={k} className={`mmri-guide2__dsec is-${k}`}>
    <h3>{row.label}</h3>
    <p>{col.cells[k]}</p>
   </section>})}
  </div>
  {narrow&&<div className="mmri-guide2__pager" role="group" aria-label="Хуудас">
   <button type="button" className="mmri-guide2__nav-btn" disabled={page===0} onClick={()=>setPage(page-1)}><Icon name="back" size={18}/>Өмнөх</button>
   <span className="mmri-guide2__counter" role="status" aria-live="polite">{page+1}<em> / {pages}</em></span>
   <button type="button" className="mmri-guide2__nav-btn is-primary" disabled={page===pages-1} onClick={()=>setPage(page+1)}>Дараах<Icon name="arrow" size={18}/></button>
  </div>}
 </div>;
}

export function ReportGuide(){
 const compact=useMedia(compactQuery);
 return <div className="mmri-guide2__report">
  <p className="mmri-guide2__example" role="note"><span className="mmri-guide2__tag">ЖИШЭЭ</span>Доорх агуулга нь тайлангийн бүтцийг харуулсан жишээ тайлбар юм. Бодит байгууллагын оноо, оношилгооны дүн биш бөгөөд бодит үр дүн таны хариултаас хамаарна.</p>
  {compact?<ReportCompact/>:<ReportMatrix/>}
  <p className="mmri-guide2__pdf-note"><Icon name="download" size={18}/>Оношилгооны чиглэл бүрийн үр дүнг тусдаа PDF тайлангаар авах боломжтой.</p>
 </div>;
}

/* ---------- Guide 3: Хэрхэн оношилгоо хийлгэх вэ? ---------- */
/* Screenshots are real captures of the running app (public/guide-shots, -d desktop 1440x900, -m mobile 390x844) taken with the
   sanitized local QA company: no e-mail, password, token or personal data is visible. */
type WalkStep={deliver?:boolean;title:string;text:string;shot:string;alt:string;note?:string;extra?:boolean;noShot?:boolean;desktopOnly?:boolean};
const walkSteps:WalkStep[]=[
 {title:'Бүртгүүлэх',shot:'1-register',alt:'Нэвтрэх хуудасны «Бүртгүүлэх» таб: нэр, имэйл, нууц үгийн талбарууд',
  text:'«Бүртгүүлэх» табыг сонгож нэр, имэйл, нууц үгээ оруулна. Имэйлээр ирсэн 6 оронтой кодыг «Имэйл баталгаажуулах» хуудсанд бичиж бүртгэлээ идэвхжүүлээд нэвтэрнэ.'},
 {title:'Байгууллагын мэдээллээ оруулах',shot:'2-company',alt:'Байгууллагын мэдээлэл хуудас: байгууллагын нэр, хэлбэр, 20 суурь асуулт',
  text:'«Байгууллагын мэдээлэл» хэсэгт байгууллагын нэрээ бичиж, 20 асуултад хариулна. Бүгдийг бөглөсний дараа оношилгоо эхлэх боломжтой болно.'},
 {title:'Чиглэлээ сонгож төлбөр төлөх',shot:'3-payment',alt:'Төлбөрийн QR: чиглэлийн нэр, 300,000₮ ба QR код',
  text:'«Оношилгоо» хэсгээс чиглэлээ сонгоход төлбөрийн QR шууд нээгдэнэ. Банкны аппаараа уншуулж 300,000₮ төлнө. Төлбөр баталгаажмагц оношилгоо автоматаар эхэлнэ.',
  note:'Зураг жишээ зориулалттай: байгууллагын нэр, QR код нь жишээ бөгөөд бодит төлбөрийн мэдээлэл биш.'},
 {title:'Асуултад хариулах',shot:'4-questions',alt:'Асуултын хуудас: хариултын сонголтууд, «Буцах» ба «Үргэлжлүүлэх» товчнууд',
  text:'Асуулт бүрт нэг хариулт сонгоод «Үргэлжлүүлэх» товчийг дарна. Мэдэхгүй асуултад «Мэдэхгүй» гэж хариулж болно. Хариулт автоматаар хадгалагдах тул дараа үргэлжлүүлэх боломжтой.'},
 {deliver:true,title:'Тайлангаа авах',shot:'5-report',alt:'Тайлангийн хуудас: нийт үнэлгээ, давуу ба сул тал, PDF татах товч',
  text:'Сүүлийн асуултад хариулж оношилгоогоо илгээсний дараа тайлан шинжээчийн хяналтад орно. Хяналтын явцад тайланд нэвтрэх боломжгүй бөгөөд баталгаажсан тайлан бэлэн болмогц танд мэдэгдэл ирнэ. Бэлэн болсон тайланд нийт үнэлгээ, 5 давуу тал, 5 сул тал, 5 тэргүүлэх ажил, 12 сарын төлөвлөгөө гарах бөгөөд «PDF татах» товчоор өөрийн компьютерт хадгална.'},
];

function shotSrc(name:string,kind:'d'|'m'){return `${import.meta.env.BASE_URL}guide-shots/${name}-${kind}.jpg`}

const GuideReportExample=React.lazy(()=>import('../components/GuideReportExample'));

export function HowToGuide(){
 const [index,setIndex]=useState(0);
 const [example,setExample]=useState(false);
 const last=walkSteps.length-1;
 const step=walkSteps[index];
 const go=(i:number)=>setIndex(Math.max(0,Math.min(last,i)));
 useEffect(()=>{walkSteps.forEach(s=>{(['d','m'] as const).forEach(k=>{const img=new Image();img.src=shotSrc(s.shot,k)})})},[]);
 /* The popup is modal, so the arrow keys drive the walkthrough wherever focus sits inside it (including the heading focused on open). */
 const indexRef=React.useRef(index);indexRef.current=index;
 useEffect(()=>{
  const onKey=(e:KeyboardEvent)=>{
   const t=e.target as HTMLElement;
   if(t.closest('input,textarea,select,[role=region]'))return;
   const i=indexRef.current;
   const vertical=!!t.closest('[data-walk-nav]');
   if(e.key==='ArrowRight'||(vertical&&e.key==='ArrowDown')){e.preventDefault();go(i+1)}
   else if(e.key==='ArrowLeft'||(vertical&&e.key==='ArrowUp')){e.preventDefault();go(i-1)}
   else if(e.key==='Home'){e.preventDefault();go(0)}
   else if(e.key==='End'){e.preventDefault();go(last)}
  };
  document.addEventListener('keydown',onKey);
  return()=>document.removeEventListener('keydown',onKey);
 },[]);
 const total=walkSteps.length;
 const compact=useMedia(pagedQuery);
 return <div className="mmri-guide2__howto" data-compact={compact||undefined}>
  <section className="mmri-guide2__walk" data-example={example||undefined} aria-roledescription="Алхам алхмаар заавар" aria-label="Оношилгоо хийлгэх алхмууд">
   <ol className="mmri-guide2__track" data-walk-nav aria-label="Алхмууд">
    {walkSteps.map((s,i)=><li key={s.title} className={`mmri-guide2__track-item${i===index?' is-active':''}${i<index?' is-done':''}`}>
     <button type="button" className="mmri-guide2__track-btn" aria-current={i===index?'step':undefined} aria-expanded={i===index} aria-label={`Алхам ${i+1}: ${s.title}`} onClick={()=>go(i)}>
      <span className="mmri-guide2__track-dot" aria-hidden="true">{i<index?<Icon name="check" size={16}/>:i+1}</span>
      <span className="mmri-guide2__track-text" aria-hidden="true"><span className="mmri-guide2__track-name">Алхам {i+1}</span><span className="mmri-guide2__track-label"><span>{s.title}</span></span></span>
     </button>
    </li>)}
   </ol>
   <button type="button" className="mmri-guide2__example-btn" aria-expanded={example} aria-controls="mmri-guide2-example" onClick={()=>setExample(v=>!v)}><Icon name="report" size={20}/><span>{example?'Алхмууд руу буцах':'ТАЙЛАНГИЙН ЖИШЭЭ ҮЗЭХ'}</span><i aria-hidden="true"><Icon name="arrow" size={18}/></i></button>
   {example?<div className="mmri-guide2__walk-main mmri-guide2__example" id="mmri-guide2-example"><React.Suspense fallback={<p className="mmri-guide2__example-loading">Жишээ тайланг бэлдэж байна…</p>}><GuideReportExample/></React.Suspense></div>:
   <div className="mmri-guide2__walk-main">
    <div className="mmri-guide2__walk-head"><span className="mmri-guide2__counter" aria-hidden="true">Алхам {index+1}<em> / {total}</em></span><div className="mmri-guide2__progress" aria-hidden="true"><i style={{width:`${((index+1)/total)*100}%`}}/></div>
     <div className="mmri-guide2__walk-controls">
      <button type="button" className="mmri-guide2__nav-btn" onClick={()=>go(index-1)} disabled={index===0}><Icon name="back" size={18}/>Өмнөх</button>
      <span className="mmri-guide2__counter-sr" role="status" aria-live="polite">Алхам {index+1} / {total}: {step.title}</span>
      <button type="button" className="mmri-guide2__nav-btn is-primary" onClick={()=>go(index+1)} disabled={index===last}>Дараах<Icon name="arrow" size={18}/></button>
     </div>
    </div>
    
    <div className="mmri-guide2__walk-body" key={index}>
     <div className="mmri-guide2__card mmri-guide2__walk-copy"><p>{step.text}</p>{step.note&&<small>{step.note}</small>}</div>
     {step.deliver&&<div className="mmri-guide2__deliver" role="note" aria-label="Тайлан хүргэгдэх хугацаа">
      <div className="mmri-guide2__deliver-item"><span className="mmri-guide2__deliver-bell" aria-hidden="true">●</span><div><strong>Тайлан хянагдаж байна</strong><p>Таны оношилгоо илгээгдлээ. Тайлан шинжээчийн хяналтад орлоо. Баталгаажсан тайлан бэлэн болмогц танд мэдэгдэнэ.</p></div></div>
      <ol className="mmri-guide2__deliver-flow" aria-label="Тайлан бэлэн болох дараалал"><li>Оношилгоо илгээгдэнэ</li><li>Шинжээч хянана</li><li>Мэдэгдэл ирнэ</li><li>Тайлан нээгдэнэ</li></ol>
      <small>Жишээ мэдэгдэл. Мэдэгдлийг толгой хэсгийн хонхоор харна. Хяналтын хугацаа тайлан бүрд өөр байж болно.</small>
     </div>}
     {!step.noShot&&<figure className="mmri-guide2__devices" style={{'--arw':1.6} as React.CSSProperties}>
      {<div className="mmri-guide2__browser"><div className="mmri-guide2__browser-bar" aria-hidden="true"><i/><i/><i/><span>businessmri.mn</span></div><img src={shotSrc(step.shot,'d')} alt={step.alt} width={1440} height={900} decoding="async"/></div>}
      {<div className="mmri-guide2__phone"><img src={shotSrc(step.shot,'m')} alt={`${step.alt} (гар утасны харагдац)`} width={390} height={844} decoding="async"/></div>}
     </figure>}
    </div>
   </div>}
   {<aside className="mmri-guide2__notice" aria-labelledby="mmri-guide2-notice-title"><strong id="mmri-guide2-notice-title">Санамж</strong>
    <p>Төлбөр нь зөвхөн сонгосон чиглэлийн оношилгоонд хамаарна. Өөр чиглэл сонгох эсвэл дахин оношилгоо хийх бүрд 300,000 төгрөгийн төлбөр төлж, шинэ тайлан үүсэхийг анхаарна уу.</p></aside>}
  </section>
 </div>;
}
