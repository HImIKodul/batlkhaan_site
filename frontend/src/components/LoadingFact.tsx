import React,{useEffect,useState} from 'react';
import { nextMongoliaFact,type MongoliaFact } from '../data/mongoliaFacts';

/* Mongolia business facts under a loading screen. The first one appears after a 2s grace period so quick loads never flash it, and each fact then stays for 9 s (enough to read it);
   if loading goes on, the next fact replaces it in place (no blank card in between). The component disappears when the loading screen ends: nothing here delays a finished request.
   Decorative for screen readers: the loading status is announced elsewhere. */
const SHOW_AFTER_MS=2000;
export const FACT_DISPLAY_MS=9000;

export function LoadingFact(){
 const [fact,setFact]=useState<MongoliaFact|null>(null);
 useEffect(()=>{
  let rotate:number|undefined;
  const show=window.setTimeout(()=>{setFact(nextMongoliaFact());rotate=window.setInterval(()=>setFact(nextMongoliaFact()),FACT_DISPLAY_MS)},SHOW_AFTER_MS);
  return()=>{window.clearTimeout(show);if(rotate!==undefined)window.clearInterval(rotate)};
 },[]);
 if(!fact)return null;
 return <figure className="mmri-loading-fact" data-fact-id={fact.id} aria-hidden="true">
  <figcaption className="mmri-loading-fact__kicker">Та мэдэх үү? · Монголын бизнес</figcaption>
  <div className="mmri-loading-fact__swap" key={fact.id}>
  <blockquote className="mmri-loading-fact__text"><strong>{fact.figure}</strong><span>{fact.text}</span></blockquote>
  <p className="mmri-loading-fact__source">{fact.source}, {fact.year}</p>
  </div>
 </figure>;
}
