import React, {memo} from 'react';
import type {RouteName} from './AppShell';
import {DOMAIN_IDS} from '../design/domainTheme';

/** The same static optical field is refracted by the page rim and clear panels.
 * CSS owns the shared registration; no route animation or per-frame SVG filters. */
/* One persistent scene: the crystal-shard image, six colour scenes cross-faded over it by opacity (never mounted/unmounted), three soft light shapes and a drifting
   field of translucent shards and lines. Each piece has its own speed, scale, path and phase (hand-picked, deterministic): looks random, loops forever, transform/opacity only. */
type Geo={k:'shard'|'line';x:number;y:number;w:number;p:number;r0:number;r1:number;dx:number;dy:number;t:number;d:number;o0:number;o1:number};
const CLIP=['polygon(8% 0,100% 22%,78% 100%,0 72%)','polygon(0 18%,62% 0,100% 64%,30% 100%)','polygon(22% 0,100% 12%,86% 88%,0 100%)','polygon(0 0,86% 14%,100% 100%,18% 80%)','polygon(50% 0,100% 58%,34% 100%,0 40%)'];
const GEO:Geo[]=[
 {k:'shard',x:4,y:12,w:30,p:0,r0:-8,r1:5,dx:4,dy:3,t:61,d:-11,o0:.18,o1:.34},
 {k:'shard',x:62,y:4,w:38,p:1,r0:6,r1:-6,dx:-5,dy:4,t:79,d:-37,o0:.14,o1:.3},
 {k:'shard',x:34,y:52,w:26,p:2,r0:-14,r1:-4,dx:5,dy:-4,t:47,d:-22,o0:.2,o1:.38},
 {k:'shard',x:76,y:50,w:34,p:3,r0:10,r1:20,dx:-4,dy:-5,t:93,d:-58,o0:.14,o1:.3},
 {k:'shard',x:8,y:62,w:22,p:4,r0:0,r1:-12,dx:3,dy:5,t:37,d:-6,o0:.22,o1:.4},
 {k:'shard',x:48,y:8,w:18,p:2,r0:22,r1:12,dx:-3,dy:3,t:53,d:-29,o0:.2,o1:.36},
 {k:'line',x:-6,y:18,w:74,p:0,r0:-24,r1:-19,dx:5,dy:3,t:53,d:-9,o0:.35,o1:.8},
 {k:'line',x:30,y:44,w:62,p:0,r0:-31,r1:-36,dx:-6,dy:4,t:71,d:-33,o0:.3,o1:.75},
 {k:'line',x:8,y:78,w:80,p:0,r0:-17,r1:-12,dx:7,dy:-3,t:61,d:-21,o0:.4,o1:.85},
 {k:'line',x:46,y:-4,w:50,p:0,r0:58,r1:63,dx:-4,dy:6,t:83,d:-47,o0:.3,o1:.7},
 {k:'line',x:62,y:68,w:56,p:0,r0:-42,r1:-37,dx:5,dy:-5,t:67,d:-14,o0:.35,o1:.8},
];
export const GlassStage=memo(function GlassStage({route}:{route:RouteName}){
 return <div className="crystal-stage" data-route={route} aria-hidden="true">
  {DOMAIN_IDS.map(d=><i key={d} className="crystal-stage__wash" data-d={d}/>)}
  <i className="crystal-stage__obj is-field"/><i className="crystal-stage__obj is-plate"/><i className="crystal-stage__obj is-streak"/>
  {GEO.map((g,i)=><i key={i} className={`crystal-stage__geo is-${g.k}`} style={{left:`${g.x}%`,top:`${g.y}%`,width:g.k==='shard'?`${g.w}vmin`:`${g.w}vw`,height:g.k==='shard'?`${g.w*.8}vmin`:undefined,clipPath:g.k==='shard'?CLIP[g.p]:undefined,'--r0':`${g.r0}deg`,'--r1':`${g.r1}deg`,'--dx':`${g.dx}vw`,'--dy':`${g.dy}vh`,'--t':`${g.t}s`,'--d':`${g.d}s`,'--o0':g.o0,'--o1':g.o1} as React.CSSProperties}/>)}
 </div>;
});
