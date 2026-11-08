import React,{useEffect,useLayoutEffect,useRef} from 'react';
import { Megaphone,Cpu,Landmark,UsersRound,Factory } from 'lucide-react';
import { Icon } from './Icon';
import { RimSheen } from './RimSheen';

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
const CX=50,CY=52,R=35;
const vertex=(i:number,r:number)=>{const a=i*72*Math.PI/180;return [CX+r*Math.sin(a),CY-r*Math.cos(a)] as const};
const ring=(k:number)=>Array.from({length:5},(_,i)=>vertex(i,R*k).map(n=>n.toFixed(1)).join(',')).join(' ');
const MAX_TILT=4;

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

 /* pointer tilt (mouse only, rAF-damped, capped) */
 useEffect(()=>{
  const el=root.current;if(!el)return;
  if(window.matchMedia('(prefers-reduced-motion: reduce)').matches||!window.matchMedia('(hover:hover) and (pointer:fine)').matches)return;
  let tx=0,ty=0,cx=0,cy=0,raf=0;
  const tick=()=>{cx+=(tx-cx)*.12;cy+=(ty-cy)*.12;el.style.setProperty('--tx',cx.toFixed(2));el.style.setProperty('--ty',cy.toFixed(2));raf=(Math.abs(tx-cx)>.01||Math.abs(ty-cy)>.01)?requestAnimationFrame(tick):0};
  const kick=()=>{if(!raf)raf=requestAnimationFrame(tick)};
  const move=(e:PointerEvent)=>{const r=el.getBoundingClientRect();tx=Math.max(-1,Math.min(1,((e.clientX-r.left)/r.width-.5)*2))*MAX_TILT;ty=Math.max(-1,Math.min(1,((e.clientY-r.top)/r.height-.5)*2))*MAX_TILT;kick()};
  const leave=()=>{tx=0;ty=0;kick()};
  el.addEventListener('pointermove',move,{passive:true});el.addEventListener('pointerleave',leave);
  return()=>{el.removeEventListener('pointermove',move);el.removeEventListener('pointerleave',leave);cancelAnimationFrame(raf)};
 },[]);

 return <div ref={root} className="hx" role="img" aria-label={`MMRI оношилгооны таван чиглэл: ${AREAS.map(a=>a.label).join(', ')}`}>
  <div className="hx__plates" aria-hidden="true">
   {[3,2,1].map(n=><div key={n} className={`hx__plate is-${n}`}><RimSheen/><b/><b/><b/></div>)}
  </div>
  <div ref={slot} className="hx__slot" aria-hidden="true">
   <div className="hx__window">
    <RimSheen/>
    <svg className="hx__pent" viewBox="0 0 100 100" focusable="false">
     <defs><linearGradient id="hx-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#9ff3ff"/><stop offset=".55" stopColor="#4f9dff"/><stop offset="1" stopColor="#a780ff"/></linearGradient></defs>
     {[1,.72,.44].map((k,i)=><polygon key={k} points={ring(k)} className={i===0?'is-outer':''}/>)}
     {AREAS.map((_,i)=>{const [x,y]=vertex(i,R);return <line key={i} x1={CX} y1={CY} x2={x.toFixed(1)} y2={y.toFixed(1)}/>})}
    </svg>
    {AREAS.map((a,i)=>{const [x,y]=vertex(i,R);const I=a.Icon;return <i key={a.id} className="hx__node" style={{left:`${x}%`,top:`${y}%`,'--c':`var(--mmri-domain-${a.id})`} as React.CSSProperties}><I size="100%" strokeWidth={1.9}/></i>})}
    <span className="hx__core"><Icon name="logo" size={30}/></span>
   </div>
  </div>
 </div>;
}
