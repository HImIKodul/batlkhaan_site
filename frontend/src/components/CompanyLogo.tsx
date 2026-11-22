import React,{useEffect,useState} from 'react';
import { api,session } from '../api/client';

/* Company logo (optional). The image is fetched through the authenticated API (a plain <img src> cannot send the access token) and shown from an object URL.
   One small cache per company id; changing or removing the logo calls notifyCompanyLogoChanged so every mounted mark refreshes. The company LOGO is the organisation's identity; it is never used
   for the personal account avatar. Without a logo the callers keep their initials fallback. */
const cache=new Map<string,string|null>();const inflight=new Map<string,Promise<string|null>>();const listeners=new Set<()=>void>();
export function notifyCompanyLogoChanged(companyId?:string){if(companyId){const u=cache.get(companyId);if(u)URL.revokeObjectURL(u);cache.delete(companyId)}else{cache.forEach(u=>{if(u)URL.revokeObjectURL(u)});cache.clear()}listeners.forEach(fn=>fn())}
async function load(companyId:string):Promise<string|null>{
 if(cache.has(companyId))return cache.get(companyId)??null;
 let p=inflight.get(companyId);
 if(!p){p=(async()=>{try{const blob=await api.getCompanyLogoBlob(companyId);const url=blob?URL.createObjectURL(blob):null;cache.set(companyId,url);return url}catch{return null}finally{inflight.delete(companyId)}})();inflight.set(companyId,p)}
 return p;
}
export function useCompanyLogo(companyId?:string|null):string|null{
 const [url,setUrl]=useState<string|null>(()=>companyId?cache.get(companyId)??null:null);
 useEffect(()=>{
  if(!companyId||!session.accessToken){setUrl(null);return}
  let live=true;const run=()=>{void load(companyId).then(u=>{if(live)setUrl(u)})};
  run();listeners.add(run);return()=>{live=false;listeners.delete(run)};
 },[companyId]);
 return url;
}
/** Logo image when the company has one, otherwise the given fallback (initials). */
export function CompanyLogoMark({companyId,fallback,className='',alt=''}:{companyId?:string|null;fallback:React.ReactNode;className?:string;alt?:string}){
 const url=useCompanyLogo(companyId);
 return url?<span className={`mmri-company-logo ${className}`.trim()}><img src={url} alt={alt} decoding="async"/></span>:<>{fallback}</>;
}
export function reportLogoUrlHook(assessmentId?:string|null):string|null{
 const [url,setUrl]=useState<string|null>(null);
 useEffect(()=>{if(!assessmentId||!session.accessToken){setUrl(null);return}let live=true;let made:string|null=null;api.getReportLogoBlob(assessmentId).then(b=>{if(!live||!b)return;made=URL.createObjectURL(b);setUrl(made)}).catch(()=>undefined);return()=>{live=false;if(made)URL.revokeObjectURL(made)}},[assessmentId]);
 return url;
}
