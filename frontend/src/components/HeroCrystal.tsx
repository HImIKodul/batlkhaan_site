import React,{useEffect,useLayoutEffect,useRef} from 'react';
import { Megaphone,Cpu,Landmark,UsersRound,Factory } from 'lucide-react';
import { Icon } from './Icon';
import { setDomainTheme } from '../design/domainTheme';

/**
 * Homepage hero (reference 02): three staggered prismatic plates on the left, and on the right a separate, nearly transparent glass window
 * holding a five-vertex emblem (one vertex per business area). Decorative and data-free: shows no result figure, no finding, no navigation.
 * The window is a REAL clear opening: the page sheet (`.mmri-shell::before`) is masked with a rounded hole exactly over the window
 * (CSS var --hx-hole, rebuilt on resize), so the sharp stage light shows through instead of the sheet's frosted fill.
 * Motion: slow independent plate drift (CSS), small pointer tilt via rAF + CSS vars (mouse only, capped, reset on leave, off for reduced motion).
 */
const AREAS=[
 {id:'marketing',Icon:Megaphone,label:'Маркетинг'},
 {id:'it',Icon:Cpu,label:'Мэдээллийн технологи'},
 {id:'finance',Icon:Landmark,label:'Санхүү'},
 {id:'people',Icon:UsersRound,label:'Хүний нөөц'},
 {id:'operations',Icon:Factory,label:'Үйлдвэрлэл ба үйл ажиллагаа'},
] as const;
const MAX_TILT=9;

function holeMask(w:number,h:number,x:number,y:number,ww:number,wh:number,r:number){
 const d=`M0 0H${w}V${h}H0Z M${x+r} ${y}H${x+ww-r}A${r} ${r} 0 0 1 ${x+ww} ${y+r}V${y+wh-r}A${r} ${r} 0 0 1 ${x+ww-r} ${y+wh}H${x+r}A${r} ${r} 0 0 1 ${x} ${y+wh-r}V${y+r}A${r} ${r} 0 0 1 ${x+r} ${y}Z`;
 return `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}' viewBox='0 0 ${w} ${h}'><path fill-rule='evenodd' d='${d}'/></svg>`)}")`;
}

export default function HeroCrystal(){
 const root=useRef<HTMLDivElement>(null);
 const slot=useRef<HTMLDivElement>(null);

 /* clear window: punch the sheet */
 useLayoutEffect(()=>{
  const shell=document.querySelector<HTMLElement>('.mmri-shell');const el=slot.current;if(!shell||!el)return;
  const apply=()=>{
   const sheet=getComputedStyle(shell,'::before');
   const sl=parseFloat(sheet.left),st=parseFloat(sheet.top),sw=parseFloat(sheet.width),sh=parseFloat(sheet.height);
   if(![sl,st,sw,sh].every(Number.isFinite)||sw<=0||sh<=0){shell.classList.remove('has-hx-hole');return}
   const s=shell.getBoundingClientRect(),w=el.getBoundingClientRect();
   const r=Math.min(w.width,w.height)*.12;
   shell.style.setProperty('--hx-hole',holeMask(Math.round(sw),Math.round(sh),Math.round(w.left-s.left-sl),Math.round(w.top-s.top-st),Math.round(w.width),Math.round(w.height),Math.round(r)));
   shell.classList.add('has-hx-hole');
  };
  apply();
  const ro=new ResizeObserver(apply);ro.observe(el);ro.observe(shell);
  window.addEventListener('resize',apply);
  document.fonts?.ready.then(apply).catch(()=>{});
  return()=>{ro.disconnect();window.removeEventListener('resize',apply);shell.classList.remove('has-hx-hole');shell.style.removeProperty('--hx-hole')};
 },[]);

 /* pointer tilt (mouse only, rAF-damped, capped) + face hover: the face under the pointer sets the page's category atmosphere */
 const label=useRef<HTMLSpanElement>(null);
 useEffect(()=>{
  const el=root.current;if(!el)return;
  if(window.matchMedia('(prefers-reduced-motion: reduce)').matches||!window.matchMedia('(hover:hover) and (pointer:fine)').matches)return;
  let tx=0,ty=0,cx=0,cy=0,raf=0,hot=-1;
  const tick=()=>{cx+=(tx-cx)*.1;cy+=(ty-cy)*.1;el.style.setProperty('--tx',cx.toFixed(2));el.style.setProperty('--ty',cy.toFixed(2));raf=(Math.abs(tx-cx)>.01||Math.abs(ty-cy)>.01)?requestAnimationFrame(tick):0};
  const kick=()=>{if(!raf)raf=requestAnimationFrame(tick)};
  const setHot=(i:number)=>{if(i===hot)return;hot=i;if(i<0){el.removeAttribute('data-hot');setDomainTheme(null);if(label.current)label.current.textContent=''}else{el.dataset.hot=String(i);setDomainTheme(AREAS[i].id);if(label.current)label.current.textContent=AREAS[i].label}};
  const move=(e:PointerEvent)=>{
   const r=el.getBoundingClientRect();
   tx=Math.max(-1,Math.min(1,((e.clientX-r.left)/r.width-.5)*2))*MAX_TILT;ty=Math.max(-1,Math.min(1,((e.clientY-r.top)/r.height-.5)*2))*MAX_TILT;kick();
   const f=(e.target as Element|null)?.closest<HTMLElement>('.hx__face');setHot(f?Number(f.dataset.i):-1);
  };
  const leave=()=>{tx=0;ty=0;kick();setHot(-1)};
  el.addEventListener('pointermove',move,{passive:true});el.addEventListener('pointerleave',leave);
  return()=>{el.removeEventListener('pointermove',move);el.removeEventListener('pointerleave',leave);cancelAnimationFrame(raf);setDomainTheme(null)};
 },[]);

 return <div ref={root} className="hx" role="img" aria-label={`MMRI оношилгооны таван чиглэл (${AREAS.map(a=>a.label).join(', ')}) нэг тайланд нэгдэнэ`}>
  <div className="hx__plates" aria-hidden="true">
   {[3,2,1].map(n=><div key={n} className={`hx__plate is-${n}`}><b/><b/><b/></div>)}
  </div>
  <div ref={slot} className="hx__slot" aria-hidden="true">
   <div className="hx__window">
    <div className="hx__scene">
     <div className="hx__floor"/>
     <div className="hx__prism">
      <i className="hx__cap is-bottom"/>
      {AREAS.map((a,i)=>{const I=a.Icon;return <div key={a.id} className="hx__face" data-i={i} style={{'--i':i,'--c':`var(--mmri-domain-${a.id})`} as React.CSSProperties}><span className="hx__face-icon"><I size="100%" strokeWidth={1.9}/></span></div>})}
      <i className="hx__cap is-top"><Icon name="logo" size={30}/></i>
     </div>
    </div>
    <span ref={label} className="hx__label"/>
   </div>
  </div>
 </div>;
}
