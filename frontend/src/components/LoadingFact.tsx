import React,{useEffect,useState} from 'react';
import { nextMongoliaFact,type MongoliaFact } from '../data/mongoliaFacts';

/* One Mongolia business fact under a loading screen. Appears after a short grace period so quick loads never flash it, and swaps
   to the next fact (shuffle-bag, no repeats) only if the wait is long. Decorative for screen readers: the loading status is announced elsewhere. */
const SHOW_AFTER_MS=600;
const SWAP_EVERY_MS=9000;

export function LoadingFact(){
 const [fact,setFact]=useState<MongoliaFact|null>(null);
 useEffect(()=>{
  let swap=0;
  const show=window.setTimeout(()=>{
   setFact(nextMongoliaFact());
   swap=window.setInterval(()=>setFact(nextMongoliaFact()),SWAP_EVERY_MS);
  },SHOW_AFTER_MS);
  return()=>{window.clearTimeout(show);window.clearInterval(swap)};
 },[]);
 if(!fact)return null;
 return <figure className="mmri-loading-fact" data-fact-id={fact.id} aria-hidden="true" key={fact.id}>
  <figcaption className="mmri-loading-fact__kicker">Та мэдэх үү? · Монголын бизнес</figcaption>
  <blockquote className="mmri-loading-fact__text"><strong>{fact.figure}</strong><span>{fact.text}</span></blockquote>
  <p className="mmri-loading-fact__source">{fact.source}, {fact.year}</p>
 </figure>;
}
