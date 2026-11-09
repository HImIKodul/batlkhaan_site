import React from 'react';
import { go } from './AppShell';
import { session } from '../api/client';

/**
 * Homepage hero (reference 02): ONE composition, a stack of five translucent glass slabs, one per business area. Each slab is tinted and lit
 * by its category colour and carries the area name. Free of any result figure or control (decorative; the accessible name lists the five areas).
 * Each slab is a real button: hover lights its edge and glow and lets the other slabs recede; click goes to the diagnosis hub (or sign-in) with that category opened.
 * Motion: one slow float of the stack and a soft glow breathing per slab (opacity), CSS only; no pointer-driven movement, hover never touches the page theme.
 */
const AREAS=[
 {id:'marketing',label:'Маркетинг'},
 {id:'it',label:'Мэдээллийн технологи'},
 {id:'finance',label:'Санхүү'},
 {id:'people',label:'Хүний нөөц'},
 {id:'operations',label:'Үйлдвэрлэл ба үйл ажиллагаа'},
] as const;

export default function HeroCrystal(){
 return <div className="hx" role="group" aria-label="MMRI оношилгооны таван чиглэл">
  <div className="hx__scene">
   <div className="hx__stack">
    <i className="hx__floor"/>
    {AREAS.map((a,i)=><button type="button" key={a.id} className="hx__slab" aria-label={`${a.label} - оношилгоо`} onClick={()=>{sessionStorage.setItem('business:heroArea',a.id);go(session.accessToken?'analysis':'login')}} style={{'--i':i,'--c':`var(--mmri-domain-${a.id})`} as React.CSSProperties}><span className="hx__dot"/><span className="hx__name">{a.label}</span></button>)}
   </div>
  </div>
 </div>;
}
