import React from 'react';

/**
 * Homepage hero illustration: three overlapping optical-glass sheets = the three MMRI deliverables
 * (diagnosis report -> five strengths / five weaknesses -> 12-month plan), front to back.
 * Purely decorative and data-free: no result figure, no finding, no date, no completed/assigned state is ever shown
 * (neutral pentagon, skeleton rows, twelve equal divisions). Material, lighting and motion live in pages/landing.css (.rgp*);
 * The figure is completely static: no pointer tracking, no hover state, no 3D context (flat plane with one fixed tilt), so nothing can shimmer or change on hover.
 * Below it sits a floor (light pool, contact shadow) and a flipped, fading reflection of the front sheet inside the tilted stack so it reads as floating above a surface.
 * It is the ONLY hero figure: the former ring-and-icons graphic was removed, its navigation lives in the hero button, the main nav and the Diagnosis page.
 */
const DOMAIN_VARS=['--mmri-domain-marketing','--mmri-domain-it','--mmri-domain-finance','--mmri-domain-people','--mmri-domain-operations'];
const CX=50,CY=53,R=33;
const vertex=(i:number,r:number)=>{const a=i*72*Math.PI/180;return [CX+r*Math.sin(a),CY-r*Math.cos(a)] as const};
const ring=(k:number)=>Array.from({length:5},(_,i)=>vertex(i,R*k).map(n=>n.toFixed(1)).join(',')).join(' ');

export default function ReportGlassPreview(){
 return <div className="rgp" role="img" aria-label="MMRI тайлан: оношилгооны тайлан, 5 давуу тал ба 5 сул тал, 12 сарын төлөвлөгөө">
  <div className="rgp__floor" aria-hidden="true"><i className="is-pool"/></div>
  <div className="rgp__stack" aria-hidden="true">
   <div className="rgp__mirror"/>
   <div className="rgp__sheet is-plan">
    <span className="rgp__label">12 сарын төлөвлөгөө</span>
    <div className="rgp__timeline">{Array.from({length:12},(_,i)=><i key={i}/>)}</div>
    <div className="rgp__rows"><b/><b/></div>
   </div>
   <div className="rgp__sheet is-balance">
    <div className="rgp__cols">
     <div className="is-pos"><span className="rgp__label">5 давуу тал</span>{Array.from({length:5},(_,i)=><b key={i}/>)}</div>
     <div className="is-neg"><span className="rgp__label">5 сул тал</span>{Array.from({length:5},(_,i)=><b key={i}/>)}</div>
    </div>
   </div>
   <div className="rgp__sheet is-report">
    <span className="rgp__title">Бизнесийн оношилгооны тайлан</span>
    <svg className="rgp__gauge" viewBox="0 0 100 100" focusable="false">
     {[1,.66,.33].map(k=><polygon key={k} points={ring(k)} className={k===1?'is-outer':''}/>)}
     {Array.from({length:5},(_,i)=>{const [x,y]=vertex(i,R);return <line key={i} x1={CX} y1={CY} x2={x.toFixed(1)} y2={y.toFixed(1)}/>})}
     {Array.from({length:5},(_,i)=>{const [x,y]=vertex(i,R);return <circle key={i} cx={x.toFixed(1)} cy={y.toFixed(1)} r="3.4" style={{fill:`var(${DOMAIN_VARS[i]})`}}/>})}
    </svg>
    <div className="rgp__rows"><b/><b/></div>
   </div>
  </div>
 </div>;
}
