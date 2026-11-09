import React,{useEffect,useRef,useState} from 'react';
import { createPortal } from 'react-dom';
import { AppShell,go } from '../components/AppShell';
import { Icon } from '../components/Icon';
import { usePrismPage } from '../design/prismPage';
import HeroCrystal from '../components/HeroCrystal';
import { session } from '../api/client';
import { AboutGuide,ReportGuide,HowToGuide } from './HomeGuides';
import { setDomainTheme } from '../design/domainTheme';

type GuideId='about'|'report'|'howto';
type Guide={id:GuideId;title:string;short:string;intro:React.ReactNode};
const guides:Guide[]=[
 {id:'about',title:'BusinessMRI.mn гэж юу вэ?',short:'BusinessMRI.mn гэж юу вэ?',intro:<>BusinessMRI.mn нь байгууллагын маркетинг, санхүү, хүний нөөц, мэдээллийн технологи, үйлдвэрлэл үйл ажиллагааны 5 үндсэн чиглэлээр <strong>ОНОШИЛГОО</strong> хийж, давуу тал, тулгарч буй асуудал, сайжруулах боломжийг тодорхойлон, цаашид хэрэгжүүлэх хөгжлийн <strong>ТӨЛӨВЛӨГӨӨ</strong> боловсруулдаг нэгдсэн платформ юм.</>},
 {id:'report',title:'Оношилгооны үр дүн',short:'Оношилгооны тайлангаар юу харах вэ?',intro:'Танай бизнесийн сонгосон чиглэлийн өнөөгийн нөхцөл байдлыг тодорхойлж, цаашдын төлөвлөгөөг гаргана.'},
 {id:'howto',title:'Бүртгүүлэх, төлбөр төлөх заавар',short:'Хэрхэн оношилгоо хийлгэх вэ?',intro:'Бүртгүүлэхээс эхлээд тайлангаа харах хүртэлх алхмыг сайтын жинхэнэ дэлгэцийн зургаар алхам алхмаар үзнэ үү.'},
];

function GuideTileNo({n}:{n:number}){
 return <span className="mmri-home2__guide-no" aria-hidden="true">{String(n).padStart(2,'0')}</span>;
}

function GuideBody({id}:{id:GuideId}){if(id==='about')return <AboutGuide/>;if(id==='report')return <ReportGuide/>;return <HowToGuide/>}

export default function Landing(){
 const loggedIn=!!session.accessToken;
 const [open,setOpen]=useState<GuideId|null>(null);
 const [closing,setClosing]=useState(false);
 usePrismPage();
 const stageRef=useRef<HTMLElement|null>(null);
 const guidePanelRef=useRef<HTMLDivElement|null>(null);
 const guideTitleRef=useRef<HTMLHeadingElement|null>(null);
 const guideTriggerRef=useRef<HTMLButtonElement|null>(null);
 useEffect(()=>{
  if(window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  const move=(e:PointerEvent)=>{const t=(e.target as Element|null)?.closest<HTMLElement>('[data-sheen]');if(!t)return;const r=t.getBoundingClientRect();t.style.setProperty('--mx',`${e.clientX-r.left}px`);t.style.setProperty('--my',`${e.clientY-r.top}px`)};
  document.addEventListener('pointermove',move,{passive:true});
  return()=>document.removeEventListener('pointermove',move);
 },[]);
 useEffect(()=>{
  if(!open)return;
  const stage=stageRef.current;
  stage?.setAttribute('inert','');
  document.body.classList.add('mmri-modal-open');
  requestAnimationFrame(()=>guideTitleRef.current?.focus());
  const trigger=guideTriggerRef.current,panelEl=guidePanelRef.current;if(trigger&&panelEl){const t=trigger.getBoundingClientRect(),p=panelEl.getBoundingClientRect();panelEl.style.transformOrigin=`${t.left+t.width/2-p.left}px ${t.top+t.height/2-p.top}px`}
  const onKey=(e:KeyboardEvent)=>{
   if(e.key==='Escape'){e.preventDefault();requestClose.current();return}
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
 const requestClose=useRef(()=>{});
 requestClose.current=()=>{
  if(closing)return;
  if(window.matchMedia('(prefers-reduced-motion: reduce)').matches){setOpen(null);return}
  setClosing(true);window.setTimeout(()=>{setOpen(null);setClosing(false)},240);
 };
 /* an open guide moves the page atmosphere quietly to its own tint (never on hover) */
 useEffect(()=>{setDomainTheme(open?({about:'it',report:'people',howto:'operations'} as const)[open]:null);return()=>setDomainTheme(null)},[open]);
 const guide=guides.find(g=>g.id===open);
 const startDiagnosis=()=>go(loggedIn?'analysis':'login');
 return <AppShell route="home"><div className="mmri-home2">
  <main ref={stageRef} className="mmri-home2__stage">
   <section className="mmri-home2__hero" aria-labelledby="mmri-home2-title">
    <div className="mmri-home2__copy">
     <h1 id="mmri-home2-title" data-route-heading tabIndex={-1}><span>Бизнесийнхээ бодит дүр зургийг хар.</span> <em>Дараагийн 12 сарынхаа зөв алхмыг тодорхойл.</em></h1>
     <button type="button" className="mmri-home2__start" data-sheen onClick={startDiagnosis}><span className="mmri-shell-glint mmri-btn-glint" aria-hidden="true"><i/></span><span>ОНОШИЛГОО ЭХЛҮҮЛЭХ</span><i className="mmri-home2__start-chip"><Icon name="arrow" size={18}/></i></button>
    </div>
    <div className="mmri-home2__art"><HeroCrystal/></div>
   </section>

   <nav className="mmri-home2__guides" aria-label="BUSINESSMMRI гарын авлага">
    {guides.map((g,gi)=><button type="button" key={g.id} className={`mmri-home2__guide is-${g.id}`} onClick={e=>{guideTriggerRef.current=e.currentTarget;setClosing(false);setOpen(g.id)}} aria-haspopup="dialog" aria-expanded={open===g.id} aria-controls={open===g.id?'mmri-guide2-dialog':undefined}>
     <span className="mmri-shell-glint" aria-hidden="true" style={{'--gi':gi} as React.CSSProperties}><i/></span><GuideTileNo n={gi+1}/><span className="mmri-home2__guide-title">{g.short}</span><i className="mmri-home2__guide-chip"><Icon name="arrow" size={17}/></i>
    </button>)}
   </nav>
  </main>

  {guide&&createPortal(<div id="mmri-guide2-dialog" className={`mmri-guide2${closing?' is-closing':''}`} role="dialog" aria-modal="true" aria-labelledby="mmri-guide2-title" onMouseDown={e=>{if(e.target===e.currentTarget)requestClose.current()}}>
   <div ref={guidePanelRef} className="mmri-guide2__panel" data-guide={guide.id}>
    <button type="button" className="mmri-guide2__close" aria-label="Гарын авлагыг хаах" onClick={()=>requestClose.current()}><Icon name="close" size={25}/></button>
    <div className="mmri-guide2__scroll" tabIndex={0} role="region" aria-labelledby="mmri-guide2-title"><header className="mmri-guide2__header"><h2 ref={guideTitleRef} tabIndex={-1} id="mmri-guide2-title">{guide.title}</h2><p>{guide.intro}</p></header>
    <div className="mmri-guide2__body"><GuideBody id={guide.id}/></div></div>
   </div>
  </div>,document.body)}
 </div></AppShell>;
}
