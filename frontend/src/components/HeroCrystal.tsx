import React,{useEffect} from 'react';
import { go } from './AppShell';
import { session } from '../api/client';

/**
 * Homepage hero (reference 02): ONE composition (hand sketch 02): a fanned deck of five thick, angled, overlapping translucent glass plates, one per business area. Each slab is tinted and lit
 * by its category colour and carries the area name. Free of any result figure or control (decorative; the accessible name lists the five areas).
 * Each slab is a real button: hover lights its edge and glow and lets the other slabs recede; click goes to the diagnosis hub (or sign-in) with that category opened.
 * Motion: one slow float of the stack and a soft glow breathing per slab (opacity), CSS only; no pointer-driven movement, hover never touches the page theme.
 */
/* x/y in cqw (top-left of the unrotated plate) and r in degrees: hand-tuned per plate so the deck reads as an irregular fan, not a repeated step */
const AREAS=[
 {id:'marketing',label:'Маркетинг',x:4,y:2,r:-13},
 {id:'it',label:'Мэдээллийн технологи',x:20,y:14,r:-8},
 {id:'finance',label:'Санхүү',x:37,y:26,r:-2},
 {id:'people',label:'Хүний нөөц',x:46,y:41,r:5},
 {id:'operations',label:'Үйлдвэрлэл ба үйл ажиллагаа',x:55,y:56,r:11},
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
    {AREAS.map((a,i)=><button type="button" key={a.id} className="hx__slab" aria-label={`${a.label} - оношилгоо`} onClick={()=>{heroIntent.area=a.id;heroIntent.at=Date.now();go(session.accessToken?'analysis':'login')}} style={{'--i':i,'--x':a.x,'--y':a.y,'--r':a.r,'--c':`var(--mmri-domain-${a.id})`} as React.CSSProperties}><span className="hx__dot"/><span className="hx__name">{a.label}</span></button>)}
   </div>
  </div>
 </div>;
}
