import React,{useEffect,useState} from 'react';
import { nextMongoliaFact,type MongoliaFact } from '../data/mongoliaFacts';

/* One Mongolia business fact under a loading screen. Appears only after a 2s grace period so quick loads never flash it, then
   shows exactly one fact (never rotates). Decorative for screen readers: the loading status is announced elsewhere. */
const SHOW_AFTER_MS=2000;

export function LoadingFact(){
 const [fact,setFact]=useState<MongoliaFact|null>(null);
 useEffect(()=>{
  const show=window.setTimeout(()=>setFact(nextMongoliaFact()),SHOW_AFTER_MS);
  return()=>window.clearTimeout(show);
 },[]);
 if(!fact)return null;
 return <figure className="mmri-loading-fact" data-fact-id={fact.id} aria-hidden="true" key={fact.id}>
  <figcaption className="mmri-loading-fact__kicker">Та мэдэх үү? · Монголын бизнес</figcaption>
  <blockquote className="mmri-loading-fact__text"><strong>{fact.figure}</strong><span>{fact.text}</span></blockquote>
  <p className="mmri-loading-fact__source">{fact.source}, {fact.year}</p>
 </figure>;
}
