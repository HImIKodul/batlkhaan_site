import React from 'react';

/**
 * Homepage hero (reference 02): ONE composition, a stack of five translucent glass slabs, one per business area. Each slab is tinted and lit
 * by its category colour and carries the area name. Free of any result figure or control (decorative; the accessible name lists the five areas).
 * Motion: a single slow float of the whole stack and a soft glow breathing per slab (opacity), CSS only. No pointer-driven movement; hover only
 * strengthens the hovered slab's edge and never touches the page theme.
 */
const AREAS=[
 {id:'marketing',label:'Маркетинг'},
 {id:'it',label:'Мэдээллийн технологи'},
 {id:'finance',label:'Санхүү'},
 {id:'people',label:'Хүний нөөц'},
 {id:'operations',label:'Үйлдвэрлэл ба үйл ажиллагаа'},
] as const;

export default function HeroCrystal(){
 return <div className="hx" role="img" aria-label={`MMRI оношилгооны таван чиглэл нэг тайланд нэгдэнэ: ${AREAS.map(a=>a.label).join(', ')}`}>
  <div className="hx__scene" aria-hidden="true">
   <div className="hx__stack">
    <i className="hx__floor"/>
    {AREAS.map((a,i)=><div key={a.id} className="hx__slab" style={{'--i':i,'--c':`var(--mmri-domain-${a.id})`} as React.CSSProperties}><span className="hx__dot"/><span className="hx__name">{a.label}</span></div>)}
   </div>
  </div>
 </div>;
}
