import React,{useEffect} from 'react';
import { go } from './AppShell';
import { session } from '../api/client';
import { DOMAIN_ORDER,DOMAIN_HERO_LABEL } from '../data/domainOrder';

/**
 * Homepage hero: five overlapping rounded translucent glass cards in a diagonal cascade (the approved reference), one per business area, each lit by its category colour.
 * The box-face and shadow elements are kept hidden by CSS (markup unchanged).
 * Click goes to the diagnosis hub (or sign-in) with that category opened. Hover only brightens the plate's own rim: it never touches the page theme, backdrop or layout.
 */
const AREAS=DOMAIN_ORDER.map(id=>({id,label:DOMAIN_HERO_LABEL[id]}));

/* The chosen plate is remembered in memory (10 min; sign-in wipes sessionStorage by design) so login can carry the customer on to that category's dialog in the diagnosis hub. */
export const heroIntent:{area:string;at:number}={area:'',at:0};
export const takeHeroIntent=()=>{const a=Date.now()-heroIntent.at<600000?heroIntent.area:'';heroIntent.area='';return a};
export default function HeroCrystal(){
 useEffect(()=>{if(session.accessToken&&heroIntent.area&&Date.now()-heroIntent.at<600000)go('analysis')},[]);
 return <div className="hx" role="group" aria-label="BusinessMRI.mn оношилгооны таван чиглэл">
  <div className="hx__scene">
   <div className="hx__stack">
    {AREAS.map((a,i)=><div key={a.id} className="hx3" style={{'--i':i,'--c':`var(--mmri-domain-${a.id})`} as React.CSSProperties}>
     <i className="hx3__shadow" aria-hidden="true"/>
     <i className="hx3__face hx3__left" aria-hidden="true"/><i className="hx3__face hx3__right" aria-hidden="true"/><i className="hx3__face hx3__front" aria-hidden="true"/>
     <button type="button" className="hx3__top" aria-label={`${a.label} чиглэлээр оношилгоо эхлүүлэх`} onClick={()=>{heroIntent.area=a.id;heroIntent.at=Date.now();go(session.accessToken?'analysis':'login')}}><i className="hx3__orb" aria-hidden="true"/><span className="hx3__name">{a.label}</span></button>
    </div>)}
   </div>
  </div>
 </div>;
}
