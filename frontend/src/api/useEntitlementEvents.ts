import { useEffect,useRef } from 'react';
import { api,session } from './client';

/** Calls `onChange` the moment this company's access changes (administrator grant/revoke or confirmed payment): one long poll per open page, no timer polling. A 30 s safety check covers an API restart or several API replicas. */
export function useEntitlementEvents(onChange:()=>void,deps:unknown[]=[]){
 const cb=useRef(onChange);cb.current=onChange;
 useEffect(()=>{
  if(!session.accessToken)return;let live=true;let seq:number|null=null;
  const loop=async()=>{
   while(live){
    const cid=session.companyId;
    if(!cid||document.visibilityState==='hidden'){await new Promise(r=>window.setTimeout(r,3000));continue}
    try{const r=await api.waitEntitlementChange(cid,seq??0);if(!live)return;if(seq===null){seq=r.seq;continue}if(r.changed){seq=r.seq;cb.current()}}
    catch{await new Promise(r=>window.setTimeout(r,5000))}
   }
  };
  cb.current();   // first look right away (the page's baseline)
  void loop();
  const safety=window.setInterval(()=>{if(document.visibilityState==='visible')cb.current()},30_000);
  const onVisible=()=>{if(document.visibilityState==='visible')cb.current()};document.addEventListener('visibilitychange',onVisible);
  return()=>{live=false;window.clearInterval(safety);document.removeEventListener('visibilitychange',onVisible)};
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },deps);
}
