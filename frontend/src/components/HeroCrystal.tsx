import React,{useEffect,useLayoutEffect,useRef} from 'react';
import { Icon } from './Icon';

/**
 * Homepage hero (reference 02), two calm figures, both decorative and free of any result figure or control:
 *  A) a stack of three glass slabs in isometric 3D (the report: diagnosis -> strengths/weaknesses -> plan), floating slowly;
 *  B) inside the clear window, a radar that holds the five business areas (rings, five axes, a slow sweep, area names).
 * The window is a REAL clear opening: the page sheet (`.mmri-shell::before`) is masked with a rounded hole exactly over it (CSS var --hx-hole, rebuilt on resize).
 * Motion: slow breathing / sweep (CSS transform only) and a very small pointer parallax (max 2.5 px, damped in rAF, mouse only, reset on leave). Hover never changes colours or the page.
 */
const AREAS=['Маркетинг','Мэдээллийн технологи','Санхүү','Хүний нөөц','Үйлдвэрлэл ба үйл ажиллагаа'] as const;
const SHORT=['Маркетинг','МТ','Санхүү','Хүний нөөц','Үйлдвэрлэл'] as const;
const KEYS=['marketing','it','finance','people','operations'] as const;
const CX=50,CY=52,R=34;
const vertex=(i:number,r:number)=>{const a=i*72*Math.PI/180;return [CX+r*Math.sin(a),CY-r*Math.cos(a)] as const};
const ring=(k:number)=>Array.from({length:5},(_,i)=>vertex(i,R*k).map(n=>n.toFixed(1)).join(',')).join(' ');

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

 /* tiny, damped parallax (mouse only) */
 useEffect(()=>{
  const el=root.current;if(!el)return;
  if(window.matchMedia('(prefers-reduced-motion: reduce)').matches||!window.matchMedia('(hover:hover) and (pointer:fine)').matches)return;
  let tx=0,ty=0,cx=0,cy=0,raf=0;
  const tick=()=>{cx+=(tx-cx)*.08;cy+=(ty-cy)*.08;el.style.setProperty('--tx',cx.toFixed(3));el.style.setProperty('--ty',cy.toFixed(3));raf=(Math.abs(tx-cx)>.005||Math.abs(ty-cy)>.005)?requestAnimationFrame(tick):0};
  const kick=()=>{if(!raf)raf=requestAnimationFrame(tick)};
  const move=(e:PointerEvent)=>{const r=el.getBoundingClientRect();tx=Math.max(-1,Math.min(1,((e.clientX-r.left)/r.width-.5)*2));ty=Math.max(-1,Math.min(1,((e.clientY-r.top)/r.height-.5)*2));kick()};
  const leave=()=>{tx=0;ty=0;kick()};
  el.addEventListener('pointermove',move,{passive:true});el.addEventListener('pointerleave',leave);
  return()=>{el.removeEventListener('pointermove',move);el.removeEventListener('pointerleave',leave);cancelAnimationFrame(raf)};
 },[]);

 return <div ref={root} className="hx" role="img" aria-label={`MMRI оношилгооны таван чиглэл: ${AREAS.join(', ')}. Таван чиглэлийн үр дүн нэг тайланд нэгдэнэ`}>
  <div className="hx__stackwrap" aria-hidden="true">
   <div className="hx__stack">
    <i className="hx__slab is-1"/><i className="hx__slab is-2"/><i className="hx__slab is-3"><b/><b/><b/></i>
    <i className="hx__shadow"/>
   </div>
  </div>
  <div ref={slot} className="hx__slot" aria-hidden="true">
   <div className="hx__window">
    <svg className="hx__radar" viewBox="0 0 100 100" focusable="false">
     <defs>
      <radialGradient id="hx-fill" cx="50%" cy="52%" r="55%"><stop offset="0" stopColor="#bff4ff" stopOpacity=".85"/><stop offset="1" stopColor="#6aa8ff" stopOpacity=".35"/></radialGradient>
      <linearGradient id="hx-sweep" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#fff" stopOpacity="0"/><stop offset="1" stopColor="#bff4ff" stopOpacity=".55"/></linearGradient>
     </defs>
     {[1,.75,.5,.25].map((k,i)=><polygon key={k} points={ring(k)} className={i===0?'is-outer':'is-ring'}/>)}
     {KEYS.map((_,i)=>{const [x,y]=vertex(i,R);return <line key={i} x1={CX} y1={CY} x2={x.toFixed(1)} y2={y.toFixed(1)}/>})}
     <polygon className="is-shape" points={ring(.62)}/>
     <g className="hx__sweep"><path d={`M${CX} ${CY}L${CX} ${CY-R-2}A${R+2} ${R+2} 0 0 1 ${(CX+(R+2)*Math.sin(.9)).toFixed(1)} ${(CY-(R+2)*Math.cos(.9)).toFixed(1)}Z`} fill="url(#hx-sweep)"/></g>
     {KEYS.map((k,i)=>{const [x,y]=vertex(i,R);return <circle key={k} cx={x.toFixed(1)} cy={y.toFixed(1)} r="3.1" style={{fill:`var(--mmri-domain-${k})`}}/>})}
     <circle cx={CX} cy={CY} r="2.4" className="is-core"/>
    </svg>
    {KEYS.map((k,i)=>{const [x,y]=vertex(i,R+10.5);return <span key={k} className="hx__lab" style={{left:`${x}%`,top:`${y}%`}}>{SHORT[i]}</span>})}
    <span className="hx__logo"><Icon name="logo" size={20}/></span>
   </div>
  </div>
 </div>;
}
