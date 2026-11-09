import React, {memo} from 'react';
import type {RouteName} from './AppShell';
import {DOMAIN_IDS} from '../design/domainTheme';

/** The same static optical field is refracted by the page rim and clear panels.
 * CSS owns the shared registration; no route animation or per-frame SVG filters. */
/* One persistent scene: six colour scenes (neutral + five categories, cross-faded by opacity, never mounted/unmounted) and ONE geometric system
   (lines, squares, paths) that keeps drifting in every state. Positions/periods are hand-picked so the loops never line up (looks random, is deterministic). */
type Geo={k:'line'|'sq'|'path';x:number;y:number;w:number;h?:number;r0:number;r1:number;dx:number;dy:number;t:number;d:number;o0:number;o1:number};
const GEO:Geo[]=[
 {k:'line',x:-6,y:14,w:74,r0:-24,r1:-19,dx:5,dy:3,t:53,d:-9,o0:.25,o1:.6},
 {k:'line',x:30,y:44,w:62,r0:-31,r1:-36,dx:-6,dy:4,t:71,d:-33,o0:.2,o1:.55},
 {k:'line',x:8,y:78,w:80,r0:-17,r1:-12,dx:7,dy:-3,t:61,d:-21,o0:.3,o1:.65},
 {k:'line',x:46,y:-4,w:50,r0:58,r1:63,dx:-4,dy:6,t:83,d:-47,o0:.2,o1:.5},
 {k:'line',x:62,y:68,w:56,r0:-42,r1:-37,dx:5,dy:-5,t:67,d:-14,o0:.25,o1:.55},
 {k:'sq',x:7,y:20,w:19,r0:-14,r1:-7,dx:3,dy:4,t:47,d:-12,o0:.3,o1:.7},
 {k:'sq',x:72,y:12,w:24,r0:12,r1:19,dx:-4,dy:5,t:59,d:-27,o0:.25,o1:.6},
 {k:'sq',x:40,y:60,w:15,r0:33,r1:26,dx:4,dy:-4,t:43,d:-5,o0:.3,o1:.75},
 {k:'sq',x:84,y:58,w:21,r0:-20,r1:-27,dx:-3,dy:-5,t:73,d:-38,o0:.2,o1:.55},
 {k:'sq',x:20,y:70,w:12,r0:8,r1:17,dx:5,dy:3,t:37,d:-19,o0:.3,o1:.7},
 {k:'path',x:50,y:22,w:34,h:22,r0:-6,r1:2,dx:-3,dy:3,t:79,d:-31,o0:.3,o1:.65},
 {k:'path',x:4,y:46,w:30,h:20,r0:5,r1:-3,dx:4,dy:-3,t:89,d:-55,o0:.25,o1:.6},
];
export const GlassStage=memo(function GlassStage({route}:{route:RouteName}){
 return <div className="crystal-stage" data-route={route} aria-hidden="true">
  {DOMAIN_IDS.map(d=><i key={d} className="crystal-stage__wash" data-d={d}/>)}
  <i className="crystal-stage__obj is-field"/><i className="crystal-stage__obj is-plate"/><i className="crystal-stage__obj is-streak"/>
 </div>;
});
