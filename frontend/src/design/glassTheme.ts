import { useEffect,useLayoutEffect } from 'react';

/* Category theme for the glass stage. ONE module-level state; its only output is <html data-glass="domain"> (absent = default blue).
   The stage never re-renders for a theme change: CSS crossfades the opacity of pre-built coloured light layers.
   Precedence: hovered domain > selected domain of the current screen > default blue. */
export type GlassDomain='marketing'|'it'|'finance'|'people'|'operations';
const domains:GlassDomain[]=['marketing','it','finance','people','operations'];
let hovered:GlassDomain|null=null;
let selected:GlassDomain|null=null;
let clearTimer=0;

function apply(){
 const root=document.documentElement;
 const next=hovered??selected;
 const cur=root.dataset.glass??null;
 if(next===cur)return;                       // idempotent: no attribute write, no style recalculation
 if(next)root.dataset.glass=next;else delete root.dataset.glass;
}
export const asGlassDomain=(v:string|null|undefined):GlassDomain|null=>domains.includes(v as GlassDomain)?v as GlassDomain:null;

/** Hover preview. Leaving is debounced (180 ms, longer than the React state-to-effect hop in the card grid) so crossing the gap between two hit areas, or between a segment and its chip, never flashes the default. */
export function setGlassHover(d:GlassDomain|null){
 window.clearTimeout(clearTimer);
 if(d){hovered=d;apply();return}
 clearTimer=window.setTimeout(()=>{hovered=null;apply()},180);
}
export function setGlassSelected(d:GlassDomain|null){selected=d;apply()}

/** Selected domain of the current screen (null = no category context). Layout effect: applied before paint, so no frame of the wrong colour. */
export function useGlassSelected(d:GlassDomain|null){
 useLayoutEffect(()=>{setGlassSelected(d)},[d]);
}

/** Hover source for card grids. Clears itself on unmount so navigation never leaves a stuck preview. */
export function useGlassHover(d:GlassDomain|null){
 useEffect(()=>{setGlassHover(d)},[d]);
 useEffect(()=>()=>setGlassHover(null),[]);
}

/** First paint after a refresh: derive the selected domain from the hash route and sessionStorage, so the right light is on from frame one. */
export function initGlassFromSession(){
 try{
  const route=(window.location.hash.replace(/^#\/?/,'').split('?')[0]||'home');
  const key=route==='billing'?'business:billingArea':['results','priorities','report','questions','assessment'].includes(route)?'business:reportArea':'';
  const d=key?asGlassDomain(sessionStorage.getItem(key)):null;
  if(d){selected=d;apply()}
 }catch{/* storage unavailable */}
 const root=document.documentElement;
 const lowPower=((navigator as {hardwareConcurrency?:number}).hardwareConcurrency??8)<=2||((navigator as {deviceMemory?:number}).deviceMemory??8)<=2;
 if(lowPower)root.dataset.glassLite='';
 document.addEventListener('visibilitychange',()=>{if(document.hidden)root.dataset.glassPaused='';else delete root.dataset.glassPaused});
}
