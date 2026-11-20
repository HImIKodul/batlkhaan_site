import React,{useEffect,useState} from 'react';
import { Icon } from '../components/Icon';
import { type BusinessAreaId } from '../data/businessEvaluation';
import { DOMAIN_ORDER,domainWithAbbr } from '../data/domainOrder';


/* ---------- Guide 1: BusinessMRI.mn гэж юу вэ? ---------- */
/* ONE static page: no tabs, slides, animation or controls. The figures below are the owner-approved guide copy (see CLAUDE_PROGRESS.md for how they relate to the validated bank counts). */
const aboutStages:{title:string;text:string}[]=[
 {title:'БИД ХААНА БАЙНА?',text:'Бизнесийн өнөөгийн байдлыг оношилно.'},
 {title:'БИД ЮУГ САЙЖРУУЛАХ ВЭ?',text:'Асуудал, шалтгаан, сайжруулах боломжийг тодорхойлно.'},
 {title:'БИД ЦААШИД ЮУ ХИЙХ ВЭ?',text:'Хэрэгжүүлэх ажлуудыг тодорхойлно.'},
 {title:'12 САРЫН ТӨЛӨВЛӨГӨӨ',text:'Стратегийн зорилго, хэрэгжүүлэх ажлууд, хөгжлийн төлөвлөгөө.'},
];
const AboutStat=({value,label,wide}:{value:string;label:string;wide?:boolean})=><div className={`mmri-guide2__card mmri-about1__stat${wide?' mmri-about1__stat--wide':''}`}><strong>{value}</strong><span>{label}</span></div>;
export function AboutGuide(){
 return <div className="mmri-about1">
  <div className="mmri-about1__cols">
   <div className="mmri-about1__left">
    <div className="mmri-about1__row"><AboutStat value="5" label="Үндсэн чиглэл"/><AboutStat value="320" label="Чадварыг үнэлнэ"/></div>
    <AboutStat wide value="12 сар" label="Хөгжлийн төлөвлөгөө"/>
    <div className="mmri-about1__row"><AboutStat value="75,000+" label="Оношилгооны асуулт"/><AboutStat value="200–280" label="Нэг чиглэлд сонгогдох асуулт"/></div>
    <div className="mmri-guide2__card mmri-about1__result"><strong>Таны авах үр дүн</strong><p>Оношилгооны тайлан, давуу болон сул тал, сайжруулах чиглэл, 12 сарын хэрэгжүүлэх төлөвлөгөө.</p></div>
   </div>
   <ol className="mmri-about1__flow" aria-label="Оношилгооноос төлөвлөгөө хүртэлх дөрвөн үе шат">
    {aboutStages.map((st,i)=><li key={st.title} className="mmri-about1__step">
     <div className="mmri-guide2__card mmri-about1__step-card"><strong>{st.title}</strong><p>{st.text}</p></div>
     {i<aboutStages.length-1&&<span className="mmri-about1__arrow" aria-hidden="true"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 4v15M6 13l6 6 6-6"/></svg></span>}
    </li>)}
   </ol>
  </div>
  <div className="mmri-about1__slogans"><p>“Монголын бизнесийн оюунлаг шийдэл”</p><p>“Оношилгооноос төлөвлөгөө рүү”</p></div>
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
 people:['ХН-ийн үнэлгээ','ХН-ийн асуудал','12 сарын ХН-ийн төлөвлөгөө'],
 it:['МТ-ийн үнэлгээ','МТ-ийн асуудал','12 сарын МТ-ийн төлөвлөгөө'],
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
 return <>
  <p className="mmri-guide2__hint" aria-hidden="true">← Таван чиглэлийг харахын тулд хэвтээ гүйлгэнэ үү →</p>
  <div className="mmri-guide2__table-wrap"><div className="mmri-guide2__table-scroll" role="region" aria-label="Таван чиглэлийн тайлангийн жишээ харьцуулалт, хэвтээ гүйлгэж болно" tabIndex={0}>
   <table className="mmri-guide2__table">
    <caption className="mmri-visually-hidden">Таван чиглэлийн оношилгооны тайланд харагдах хэсгүүдийн жишээ</caption>
    <thead><tr>
     <th scope="col" className="mmri-guide2__corner">Үр дүнгийн хэсэг</th>
     {reportColumns.map(c=><th scope="col" key={c.id} data-area={c.id}><span className="mmri-guide2__area"><i className="mmri-domain__mark" aria-hidden="true"/>{c.name}</span></th>)}
    </tr></thead>
    <tbody>{reportRows.map(r=><tr key={r.key}>
     <th scope="row">{r.label}</th>
     {reportColumns.map(c=><td key={c.id} data-area={c.id} data-label={c.name}>
      {c.cells[r.key]}
     </td>)}
    </tr>)}</tbody>
   </table>
  </div></div>
 </>;
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
type WalkStep={title:string;text:string;shot:string;alt:string;note?:string;extra?:boolean;noShot?:boolean;desktopOnly?:boolean};
const walkSteps:WalkStep[]=[
 {title:'Нүүр хуудаснаас эхлэх',shot:'0-home',alt:'Нүүр хуудас: таван чиглэлийн хавтан ба «ОНОШИЛГОО ЭХЛҮҮЛЭХ» товч',
  text:'Нүүр хуудсанд BusinessMRI-ийн таван чиглэлийн хавтан харагдана. «ОНОШИЛГОО ЭХЛҮҮЛЭХ» товчийг дарж нэвтэрнэ эсвэл бүртгүүлнэ.'},
 {title:'Бүртгэл үүсгэх',shot:'1-register',alt:'Нэвтрэх хуудасны «Бүртгүүлэх» таб: нэр, имэйл, нууц үгийн талбарууд',
  text:'Нэвтрэх хуудсан дээрх «Бүртгүүлэх» табыг сонгоно. Нэр, имэйл хаяг болон дор хаяж 10 тэмдэгттэй нууц үгээ оруулаад бүртгэлээ үүсгэнэ. Имэйлээ баталгаажуулсны дараа нэвтэрнэ.'},
 {title:'Байгууллагын мэдээллээ оруулах',shot:'2-company',alt:'Байгууллагын мэдээлэл хуудас: байгууллагын нэр, хэлбэр, 20 суурь асуулт',
  text:'«Байгууллагын мэдээлэл» хэсэгт байгууллагын нэр, хэлбэрээ бичиж, 20 суурь асуултад хариулна. Бүгдийг бөглөсний дараа «20/20 · Бүрэн» гэж харагдана; төлбөр хийхээс өмнө энэ алхам дуусах ёстой.'},
 {title:'Оношилгооны чиглэл сонгох',shot:'3-domain',alt:'Оношилгоо хуудас: таван чиглэлийн карт',
  text:'Дээд цэсний «Оношилгоо» хэсгээс таван чиглэлийн аль нэгийг сонгоно: Маркетинг, Мэдээллийн технологи, Санхүү, Хүний нөөц, Үйлдвэрлэл үйл ажиллагаа. Чиглэл бүр тусдаа оношилгоо, тусдаа тайлантай.',
  note:'Карт дээр зөвхөн чиглэлийн нэр бичигдсэн. Дарахад төлбөр, асуулт эсвэл тайлан руу шууд орно.'},
 {title:'Төлбөр төлөх',shot:'4-payment',alt:'Төлбөрийн хуудас: 300,000₮ ба төлбөрийн самбар',
  text:'Төлбөрийн хуудас нээгдмэгц төлбөрийн самбар шууд харагдана. Банкны аппаараа кодыг уншуулан 300,000₮ төлнө. Төлбөр орсон даруйд систем өөрөө шалгаж, оношилгооны эрхийг нээнэ.',
  note:'Зураг туршилтын орчноос авсан тул бодит QPay кодын оронд туршилтын самбар харагдаж байна.'},
 {title:'Асуултад хариулах',shot:'5-questions',alt:'Асуултын хуудас: хариултын сонголтууд, «Буцах» ба «Үргэлжлүүлэх» товчнууд',
  text:'Эрх нээгдсэний дараа оношилгоо эхэлнэ. Асуулт бүрт нэг хариулт сонгоход «Үргэлжлүүлэх» товч идэвхжинэ; өмнөх асуулт руу «Буцах» товчоор очино. Нийт 200–280 асуулт бөгөөд явц автоматаар хадгалагдана.',
  note:'Зурагт аппын асуултын хэсгийн жишээ асуулт харагдаж байна.'},
 {title:'Тайлан хянагдаж байна',shot:'6-review',alt:'Тайлангийн хуудас: «Таны тайлан хянагдаж байна» мэдээлэл',
  text:'Оношилгоо дуусмагц тайлан шинжээчийн хяналтад орно. Хянах зорилтот хугацаа 24 цаг. Шинжээч баталгаажуулмагц тайлан тэр даруй нээгдэж, апп дотор мэдэгдэл (мөн имэйл) ирнэ. Баталгаажих хүртэл «Таны тайлан хянагдаж байна» гэж харагдана.'},
 {title:'Тайлангаа харах',shot:'7-report',alt:'Тайлангийн хуудас: нийт үнэлгээ, давуу ба сул тал, PDF татах товч',
  text:'Мэдэгдэл ирсний дараа «Тайлан» хэсэгт нийт үнэлгээ, 5 давуу тал, 5 сул тал, тэргүүлэх ажлууд, 12 сарын төлөвлөгөө гарна.'},
 {title:'PDF татах',shot:'8-pdf',alt:'«PDF тайлан татах уу?» цонх: файлын нэр, «Татах» товч',
  text:'Тайлангийн дээд талын «PDF татах» товчийг дарахад баталгаажуулах цонх гарч, файлын нэр (байгууллага, чиглэл, огноо) харагдана. «Татах» товчоор 3 хуудас PDF тайлангаа авна.'},
 {title:'Дахин оношилгоо хийх',shot:'9-retake',noShot:true,extra:true,alt:'Дахин оношилгооны төлбөрийн хуудас: «Өмнөх тайлан хэвээр үлдэнэ»',
  text:'Тухайн чиглэлээ дахин оношлуулахдаа тайлангийн «+ Дахин оношилгоо» товчийг дарна. Шинээр төлбөр төлж, шинэ тайлан үүснэ; өмнөх тайлан хэвээр хадгалагдана.'},
];

function shotSrc(name:string,kind:'d'|'m'){return `${import.meta.env.BASE_URL}guide-shots/${name}-${kind}.jpg`}

export function HowToGuide(){
 const [index,setIndex]=useState(0);
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
  <section className="mmri-guide2__walk" aria-roledescription="Алхам алхмаар заавар" aria-label="Оношилгоо хийлгэх алхмууд">
   <ol className="mmri-guide2__track" data-walk-nav aria-label="Алхмууд">
    {walkSteps.map((s,i)=><li key={s.title} className={`mmri-guide2__track-item${i===index?' is-active':''}${i<index?' is-done':''}`}>
     <button type="button" className="mmri-guide2__track-btn" aria-current={i===index?'step':undefined} aria-expanded={i===index} aria-label={`Алхам ${i+1}: ${s.title}`} onClick={()=>go(i)}>
      <span className="mmri-guide2__track-dot" aria-hidden="true">{i<index?<Icon name="check" size={16}/>:i+1}</span>
      <span className="mmri-guide2__track-text" aria-hidden="true"><span className="mmri-guide2__track-name">Алхам {i+1}</span><span className="mmri-guide2__track-label"><span>{s.title}</span></span></span>
     </button>
    </li>)}
   </ol>
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
     {!step.noShot&&<figure className="mmri-guide2__devices" style={{'--arw':1.6} as React.CSSProperties}>
      {<div className="mmri-guide2__browser"><div className="mmri-guide2__browser-bar" aria-hidden="true"><i/><i/><i/><span>businessmri.mn</span></div><img src={shotSrc(step.shot,'d')} alt={step.alt} width={1440} height={900} decoding="async"/></div>}
      {<div className="mmri-guide2__phone"><img src={shotSrc(step.shot,'m')} alt={`${step.alt} (гар утасны харагдац)`} width={390} height={844} decoding="async"/></div>}
     </figure>}
    </div>
   </div>
   {<aside className="mmri-guide2__notice" aria-labelledby="mmri-guide2-notice-title"><strong id="mmri-guide2-notice-title">Санамж</strong>
    <p>Төлбөр нь зөвхөн сонгосон чиглэлийн оношилгоонд хамаарна. Өөр чиглэл сонгох эсвэл дахин оношилгоо хийх бүрд 300,000 төгрөгийн төлбөр төлж, шинэ тайлан үүсэхийг анхаарна уу.</p></aside>}
  </section>
 </div>;
}
