import React,{useEffect} from 'react';
import { go } from './AppShell';
import { session } from '../api/client';

/**
 * Homepage hero (reference 02): ONE composition (hand sketch 02): a fanned deck of five thick, angled, overlapping translucent glass plates, one per business area. Each slab is tinted and lit
 * by its category colour and carries the area name. Free of any result figure or control (decorative; the accessible name lists the five areas).
 * Each slab is a real button: hover lights its edge and glow and lets the other slabs recede; click goes to the diagnosis hub (or sign-in) with that category opened.
 * Motion: one slow float of the stack and a soft glow breathing per slab (opacity), CSS only; no pointer-driven movement, hover never touches the page theme.
 */
/* r (deg) and jx/jy (cqw) are small hand-tuned per-plate offsets so the deck reads as an irregular fan, not one repeated step; the step and plate size come from CSS per breakpoint */
const AREAS=[
 {id:'marketing',label:'Маркетинг',r:-9,jx:0,jy:0},
 {id:'it',label:'Мэдээллийн технологи',r:-5,jx:1.2,jy:-.4},
 {id:'finance',label:'Санхүү',r:-1,jx:-.6,jy:.6},
 {id:'people',label:'Хүний нөөц',r:4,jx:1,jy:-.2},
 {id:'operations',label:'Үйлдвэрлэл ба үйл ажиллагаа',r:8,jx:-.4,jy:.4},
] as const;

/* The chosen plate is remembered in memory (10 min; sign-in wipes sessionStorage by design) so login can carry the customer on to that category's dialog in the diagnosis hub. */
export const heroIntent:{area:string;at:number}={area:'',at:0};
export const takeHeroIntent=()=>{const a=Date.now()-heroIntent.at<600000?heroIntent.area:'';heroIntent.area='';return a};
export default function HeroCrystal(){
 useEffect(()=>{if(session.accessToken&&heroIntent.area&&Date.now()-heroIntent.at<600000)go('analysis')},[]);
 return <div className="hx" role="group" aria-label="MMRI оношилгооны таван чиглэл">
  <div className="hx__scene">
   <div className="hx__stack">
    <i className="hx__floor"/>
    {AREAS.map((a,i)=><button type="button" key={a.id} className="hx__slab" aria-label={`${a.label} - оношилгоо`} onClick={()=>{heroIntent.area=a.id;heroIntent.at=Date.now();go(session.accessToken?'analysis':'login')}} style={{'--i':i,'--r':a.r,'--jx':a.jx,'--jy':a.jy,'--c':`var(--mmri-domain-${a.id})`} as React.CSSProperties}><span className="hx__dot"/><span className="hx__name">{a.label}</span></button>)}
   </div>
  </div>
 </div>;
}
