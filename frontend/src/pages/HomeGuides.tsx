import React,{useEffect,useState} from 'react';
import { MapPinned,Wrench,Flag } from 'lucide-react';
import { Icon } from '../components/Icon';
import { type BusinessAreaId } from '../data/businessEvaluation';

const areaOrder:BusinessAreaId[]=['marketing','it','finance','people','operations'];

/* ---------- Guide 1: BusinessMRI.mn гэж юу вэ? ---------- */
/* 320 = 5 domains x 64 capabilities and 61,440 = 5 x 12,288 questions are the validated frozen-bank counts; 192-280 is the adaptive
   QUICK range enforced by the backend (soft minimum 192, hard maximum 280). */
const metrics:{value:string;label:string}[]=[
 {value:'5',label:'чиглэл'},
 {value:'320',label:'үнэлэх чадвар'},
 {value:'61,440',label:'асуултын сан'},
 {value:'192–280',label:'сонгогдох асуулт'},
 {value:'12',label:'сарын хөгжлийн төлөвлөгөө'},
];
const stageIcons=[MapPinned,Wrench,Flag];
const stages:{title:string;text:string}[]=[
 {title:'Бид хаана байна вэ?',text:'Бизнесийн өнөөгийн чадавхыг оношилно.'},
 {title:'Юуг сайжруулах вэ?',text:'Асуудал, шалтгаан, боломжийг тодорхойлно.'},
 {title:'Цаашид юуг хийх вэ?',text:'Стратегийн зорилго, 12 сарын төлөвлөгөөг гаргана.'},
];

const pagedQuery='(max-width:820px),(max-height:780px)';
export function AboutGuide(){
 const paged=useMedia(pagedQuery);const [page,setPage]=useState(0);
 const showMetrics=!paged||page===0,showFlow=!paged||page===1;
 return <div className="mmri-guide2__about" data-paged={paged||undefined}>
  {showMetrics&&<ul className="mmri-guide2__metrics" aria-label="Платформын үзүүлэлтүүд">
   {metrics.map(m=><li key={m.value} className="mmri-guide2__card mmri-guide2__metric"><strong>{m.value}</strong><span>{m.label}</span></li>)}
  </ul>}
  {showFlow&&<ol className="mmri-guide2__flow" aria-label="Гурван үе шат">
   {stages.map((s,i)=>{const SI=stageIcons[i];return <li key={s.title} className="mmri-guide2__stage is-right">
    <span className="mmri-guide2__node" aria-hidden="true"><SI size={40} strokeWidth={1.7}/><b>{i+1}</b></span>
    <div className="mmri-guide2__card mmri-guide2__stage-card"><small className="mmri-guide2__stage-step">Алхам {i+1}</small><strong>{s.title}</strong><p>{s.text}</p></div>
   </li>})}
  </ol>}
  {paged&&<div className="mmri-guide2__pager" role="group" aria-label="Хуудас">
   <button type="button" className="mmri-guide2__nav-btn" disabled={page===0} onClick={()=>setPage(0)}><Icon name="back" size={18}/>Өмнөх</button>
   <span className="mmri-guide2__counter" role="status" aria-live="polite">{page+1}<em> / 2</em></span>
   <button type="button" className="mmri-guide2__nav-btn is-primary" disabled={page===1} onClick={()=>setPage(1)}>Дараах<Icon name="arrow" size={18}/></button>
  </div>}
 </div>;
}

/* ---------- Guide 2: Оношилгооны үр дүн ---------- */
/* Illustrative wording only: describes what each report section covers. It contains no scores, findings or customer results. */
type AreaCol={id:BusinessAreaId;name:string;cells:{rating:string;strength:string;weakness:string;problem:string;top5:string[];plan:[string,string][]}};
const reportColumns:AreaCol[]=[
 {id:'marketing',name:'Маркетинг',cells:{
  rating:'Зах зээл, үйлчлүүлэгч, брэнд, борлуулалтын чадавхын нэгдсэн оноо ба түвшин.',
  strength:'Тогтвортой үйлчлүүлэгчийн суурь, ойлгомжтой үнэ цэнийн санал.',
  weakness:'Маркетингийн үр дүнг тогтмол хэмжиж, дүгнэдэггүй.',
  problem:'Сувгийн зардал ба борлуулалтын өсөлтийн хоорондын холбоо тодорхойгүй.',
  top5:['Зорилтот сегментээ нарийвчлах','Борлуулалтын сувгийн үр дүнг хэмжих','Брэндийн мессежийг нэг мөр болгох','Давтан худалдан авалтыг нэмэгдүүлэх','Сарын маркетингийн тайлан гаргах'],
  plan:[['1–3 сар','суурь үзүүлэлт тогтоох'],['4–9 сар','сувгийн туршилт, оновчлол'],['10–12 сар','үр дүнг бататгаж дараа жилийн төлөвлөгөө гаргах']]}},
 {id:'it',name:'Мэдээллийн технологи',cells:{
  rating:'Систем, мэдээллийн аюулгүй байдал, автоматжуулалтын чадавхын нэгдсэн оноо ба түвшин.',
  strength:'Өдөр тутмын үйл ажиллагаанд шаардлагатай үндсэн программууд ашиглагддаг.',
  weakness:'Мэдээллийн нөөцлөлт, хандалтын эрхийн дүрэм тогтмол шалгагддаггүй.',
  problem:'Хэлтэс бүр тусдаа системтэй тул мэдээлэл давхардаж, тайлан удаан гардаг.',
  top5:['Мэдээллийн нөөцлөлтийг тогтмолжуулах','Хандалтын эрхийг шинэчлэх','Системүүдийг нэгтгэх','Давтагддаг ажлыг автоматжуулах','Ажилтны аюулгүй байдлын сургалт'],
  plan:[['1–3 сар','эрсдэлийн үнэлгээ, нөөцлөлт'],['4–9 сар','системийн нэгтгэл, автоматжуулалт'],['10–12 сар','хяналт, дараагийн жилийн хөрөнгө оруулалт']]}},
 {id:'finance',name:'Санхүү',cells:{
  rating:'Төсөв, мөнгөн гүйлгээ, ашигт ажиллагааны хяналтын чадавхын нэгдсэн оноо ба түвшин.',
  strength:'Орлого, зарлагын бүртгэл тогтмол хөтлөгддөг.',
  weakness:'Мөнгөн гүйлгээний урьдчилсан төлөвлөлт хязгаарлагдмал.',
  problem:'Төсөв ба гүйцэтгэлийн зөрүүг хугацаанд нь шинжилдэггүй.',
  top5:['Сарын мөнгөн гүйлгээний төлөвлөгөө','Төсөв ба гүйцэтгэлийн харьцуулалт','Авлагын хугацааг богиносгох','Бүтээгдэхүүн бүрийн ашгийг тооцох','Санхүүгийн үндсэн үзүүлэлтийн самбар'],
  plan:[['1–3 сар','төсвийн суурь загвар'],['4–9 сар','мөнгөн гүйлгээний хяналт, авлагын удирдлага'],['10–12 сар','ашигт ажиллагааны дүн шинжилгээ']]}},
 {id:'people',name:'Хүний нөөц',cells:{
  rating:'Ажилтны сонгон шалгаруулалт, хөгжил, урамшуулал, соёлын чадавхын нэгдсэн оноо ба түвшин.',
  strength:'Багийн гишүүд байгууллагын зорилгыг ойлгож, хамтран ажилладаг.',
  weakness:'Ажлын байрны тодорхойлолт, гүйцэтгэлийн үнэлгээ албан ёсны хэлбэргүй.',
  problem:'Гол ажилтнуудын гарц өндөр, орлон гүйцэтгэх хүн бэлтгэгдээгүй.',
  top5:['Ажлын байрны тодорхойлолт шинэчлэх','Гүйцэтгэлийн үнэлгээ нэвтрүүлэх','Шинэ ажилтны дадлагажуулалт','Гол албан тушаалын залгамж халаа','Ажилтны сэтгэл ханамжийн судалгаа'],
  plan:[['1–3 сар','бүтэц, үүрэг хариуцлага тодорхойлох'],['4–9 сар','үнэлгээ, сургалт нэвтрүүлэх'],['10–12 сар','үр дүнг эргэн харж ахиулах']]}},
 {id:'operations',name:'Үйлдвэрлэл ба үйл ажиллагаа',cells:{
  rating:'Процесс, чанар, нийлүүлэлт, хүчин чадлын чадавхын нэгдсэн оноо ба түвшин.',
  strength:'Гол үйл ажиллагааны дараалал тогтсон, нийлүүлэгчийн сүлжээтэй.',
  weakness:'Чанарын шалгалт, алдааны бүртгэл системчилсэн бус.',
  problem:'Нөөцийн хөдөлгөөн, хүргэлтийн хугацаа тогтворгүй тул захиалга хоцорно.',
  top5:['Үндсэн процессыг бичгээр тогтоох','Чанарын шалгалтын жагсаалт','Нөөцийн түвшний хяналт','Нийлүүлэгчийн үнэлгээ','Захиалгын хугацааг хэмжих'],
  plan:[['1–3 сар','процессын зураглал'],['4–9 сар','чанар, нөөцийн хяналтын горим'],['10–12 сар','хүчин чадлын тооцоо, өргөжүүлэх төлөвлөгөө']]}},
];
const reportRows:{key:'rating'|'strength'|'weakness'|'problem'|'top5'|'plan';label:string}[]=[
 {key:'rating',label:'Үнэлгээ'},
 {key:'strength',label:'Давуу тал'},
 {key:'weakness',label:'Сул тал'},
 {key:'problem',label:'Асуудал'},
 {key:'top5',label:'Тэргүүлэх 5 ажил'},
 {key:'plan',label:'Төлөвлөгөө'},
];

function ReportMatrix(){
 return <>
  <p className="mmri-guide2__hint" aria-hidden="true">← Таван чиглэлийг харахын тулд хэвтээ гүйлгэнэ үү →</p>
  <div className="mmri-guide2__table-wrap"><div className="mmri-guide2__table-scroll" role="region" aria-label="Таван чиглэлийн тайлангийн жишээ харьцуулалт, хэвтээ гүйлгэж болно" tabIndex={0}>
   <table className="mmri-guide2__table">
    <caption className="mmri-visually-hidden">Таван чиглэлийн оношилгооны тайланд харагдах хэсгүүдийн жишээ</caption>
    <thead><tr>
     <th scope="col" className="mmri-guide2__corner"><span className="mmri-visually-hidden">Тайлангийн хэсэг</span></th>
     {reportColumns.map(c=><th scope="col" key={c.id} data-area={c.id}><span className="mmri-guide2__area"><i className="mmri-domain__mark" aria-hidden="true"/>{c.name}</span></th>)}
    </tr></thead>
    <tbody>{reportRows.map(r=><tr key={r.key}>
     <th scope="row">{r.label}</th>
     {reportColumns.map(c=><td key={c.id} data-area={c.id} data-label={c.name}>
      {r.key==='top5'?<ol>{c.cells.top5.map(t=><li key={t}>{t}</li>)}</ol>
       :r.key==='plan'?<ul className="mmri-guide2__plan">{c.cells.plan.map(([range,text])=><li key={range}><b>{range}:</b> {text}</li>)}</ul>
       :c.cells[r.key]}
     </td>)}
    </tr>)}</tbody>
   </table>
  </div></div>
 </>;
}

/* Compact view (narrow or short viewports): the same content, one area at a time. Tabs choose the area; the sections of the chosen area are split into pages on
   phones so every panel fits the popup without an inner scrollbar. */
const compactQuery='(max-width:1000px),(max-height:740px)';
const narrowQuery='(max-width:700px),(max-height:680px)';
function useMedia(q:string){
 const get=()=>typeof window!=='undefined'&&typeof window.matchMedia==='function'&&window.matchMedia(q).matches;
 const [m,setM]=useState(get);
 useEffect(()=>{if(typeof window.matchMedia!=='function')return;const mq=window.matchMedia(q);const f=()=>setM(mq.matches);f();mq.addEventListener('change',f);return()=>mq.removeEventListener('change',f)},[q]);
 return m;
}
const phonePages:('rating'|'strength'|'weakness'|'problem'|'top5'|'plan')[][]=[['rating','strength'],['weakness','problem'],['top5'],['plan']];
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
    {k==='top5'?<ol>{col.cells.top5.map(t=><li key={t}>{t}</li>)}</ol>
     :k==='plan'?<ul className="mmri-guide2__plan">{col.cells.plan.map(([range,text])=><li key={range}><b>{range}:</b> {text}</li>)}</ul>
     :<p>{col.cells[k]}</p>}
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
 {title:'Бүртгэл үүсгэх',shot:'1-register',alt:'Нэвтрэх хуудасны «Бүртгүүлэх» таб: нэр, имэйл, нууц үгийн талбарууд',
  text:'Нэвтрэх хуудсан дээрх «Бүртгүүлэх» табыг сонгоно. Нэр, имэйл хаяг болон дор хаяж 10 тэмдэгттэй нууц үгээ оруулаад «Бүртгэл үүсгэх» товчийг дарна.'},
 {title:'Байгууллагын мэдээллээ оруулах',shot:'2-company',desktopOnly:true,alt:'Байгууллагын мэдээлэл хуудас: байгууллагын нэр, хэлбэр, 20 суурь асуулт',
  text:'«Байгууллагын мэдээлэл» хэсэгт байгууллагын нэр, хэлбэрээ бичиж, 20 суурь асуултад хариулна. Бүгдийг бөглөсний дараа «20/20 · Бүрэн» гэж харагдана; төлбөр хийхээс өмнө энэ алхам дуусах ёстой.'},
 {title:'Оношилгооны чиглэл сонгох',shot:'3-domain',alt:'Оношилгоо хуудас: таван чиглэлийн карт',
  text:'Дээд цэсний «Оношилгоо» хэсгээс таван чиглэлийн аль нэгийг сонгоно: Мэдээллийн технологи, Маркетинг, Санхүү, Хүний нөөц, Үйлдвэрлэл ба үйл ажиллагаа. Чиглэл бүр тусдаа оношилгоо, тусдаа тайлантай.',
  note:'Зураг дээр оношилгоо хийгдсэн туршилтын байгууллага харагдаж байна. Шинэ хэрэглэгчид карт бүр дээр «ТӨЛӨХ · 300,000₮» товч гарна.'},
 {title:'Төлбөр төлөх',shot:'4-payment',desktopOnly:true,alt:'Төлбөрийн хуудас: 300,000₮, «Төлбөрийн код үүсгэх» товч',
  text:'«Төлбөрийн код үүсгэх» товчийг дарж гарсан QPay кодыг банкны аппаараа уншуулан 300,000₮ төлнө. Төлбөр орсон даруйд систем өөрөө шалгаж, оношилгооны эрхийг нээнэ.'},
 {title:'Асуултад хариулах',shot:'5-questions',alt:'Асуултын хуудас: хариултын сонголтууд, «Буцах» ба «Үргэлжлүүлэх» товчнууд',
  text:'Эрх нээгдсэний дараа «ЭХЛҮҮЛЭХ» товч идэвхжинэ. Асуулт бүрт нэг хариулт сонгоод «Үргэлжлүүлэх» товчийг дарна; өмнөх асуулт руу «Буцах», сонголтоо болиулахдаа «Сонголтыг буцаах» товчийг ашиглана. Нийт 192–280 асуулт бөгөөд явц автоматаар хадгалагдана.',
  note:'Зурагт аппын асуултын хэсгийн жишээ асуулт харагдаж байна.'},
 {title:'Үр дүн, тайлангаа харах',shot:'6-report',desktopOnly:true,alt:'Тайлангийн хуудас: нийт үнэлгээ, давуу ба сул тал, PDF татах товч',
  text:'Асуулт дуусмагц «Тайлан» хэсэгт нийт үнэлгээ, давуу болон сул тал, тэргүүлэх ажлууд, 12 сарын төлөвлөгөө гарна. «PDF татах» товчоор тайлангаа татаж авна.'},
 {title:'Дахин оношилгоо хийх',shot:'7-retake',noShot:true,extra:true,alt:'Дахин оношилгооны төлбөрийн хуудас: «Өмнөх тайлан хэвээр үлдэнэ»',
  text:'Өөр чиглэл сонгох эсвэл тухайн чиглэлээ дахин оношлуулахдаа карт дээрх «Дахин оношилгоо · 300,000₮» эсвэл тайлангийн «+ Дахин оношилгоо» товчийг дарна. Шинээр төлбөр төлж, шинэ тайлан үүснэ; өмнөх тайлан хэвээр хадгалагдана.'},
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
     {!step.noShot&&<figure className="mmri-guide2__devices" style={{'--arw':step.shot==='5-questions'?1.32:1.6} as React.CSSProperties}>
      {!compact&&<div className="mmri-guide2__browser"><div className="mmri-guide2__browser-bar" aria-hidden="true"><i/><i/><i/><span>businessmri.mn</span></div><img src={shotSrc(step.shot,'d')} alt={step.alt} width={1440} height={step.shot==='5-questions'?1090:900} decoding="async"/></div>}
      {(!step.desktopOnly||compact)&&<div className="mmri-guide2__phone"><img src={shotSrc(step.shot,'m')} alt={`${step.alt} (гар утасны харагдац)`} width={390} height={844} decoding="async"/></div>}
     </figure>}
    </div>
   </div>
   {<aside className="mmri-guide2__notice" aria-labelledby="mmri-guide2-notice-title"><strong id="mmri-guide2-notice-title">Санамж</strong>
    <p>Төлбөр нь зөвхөн сонгосон чиглэлийн оношилгоонд хамаарна. Өөр чиглэл сонгох эсвэл дахин оношилгоо хийх бүрд 300,000 төгрөгийн төлбөр төлж, шинэ тайлан үүсэхийг анхаарна уу.</p></aside>}
  </section>
 </div>;
}
