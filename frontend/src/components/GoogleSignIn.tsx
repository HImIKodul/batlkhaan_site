import React,{useEffect,useRef,useState} from 'react';
import { api } from '../api/client';

/* Google Identity Services ("Sign in with Google"). The official Google-rendered button is used; the ID token goes to the server, which verifies it.
   The button appears ONLY when the server reports a configured Google client id (MMRI_GOOGLE_CLIENT_ID); without it nothing is rendered and no Google script is loaded.
   No OAuth secret exists in the browser, and only the basic sign-in scopes (identity + e-mail) are used: no Gmail or other API access. */
type GoogleId={initialize:(c:{client_id:string;callback:(r:{credential?:string})=>void;ux_mode?:string;auto_select?:boolean})=>void;renderButton:(el:HTMLElement,o:Record<string,unknown>)=>void};
declare global{interface Window{google?:{accounts:{id:GoogleId}}}}
const SRC='https://accounts.google.com/gsi/client';
let loading:Promise<void>|null=null;
function loadScript():Promise<void>{
 if(window.google?.accounts?.id)return Promise.resolve();
 if(loading)return loading;
 loading=new Promise<void>((resolve,reject)=>{const s=document.createElement('script');s.src=SRC;s.async=true;s.defer=true;s.onload=()=>resolve();s.onerror=()=>{loading=null;reject(new Error('gsi'))};document.head.appendChild(s)});
 return loading;
}
let cachedClientId:string|null|undefined;

export default function GoogleSignIn({onCredential,disabled}:{onCredential:(credential:string)=>void;disabled?:boolean}){
 const slot=useRef<HTMLDivElement|null>(null);const cb=useRef(onCredential);cb.current=onCredential;
 const [clientId,setClientId]=useState<string|null>(cachedClientId??null);const [failed,setFailed]=useState(false);
 useEffect(()=>{let live=true;if(cachedClientId!==undefined){setClientId(cachedClientId);return}void api.getAuthConfig().then(c=>{cachedClientId=c.googleClientId||null;if(live)setClientId(cachedClientId)}).catch(()=>{cachedClientId=null});return()=>{live=false}},[]);
 useEffect(()=>{
  if(!clientId||!slot.current)return;let live=true;
  void loadScript().then(()=>{
   if(!live||!slot.current||!window.google)return;
   window.google.accounts.id.initialize({client_id:clientId,callback:r=>{if(r.credential)cb.current(r.credential)},auto_select:false});
   slot.current.innerHTML='';
   window.google.accounts.id.renderButton(slot.current,{type:'standard',theme:'outline',size:'large',text:'continue_with',shape:'rectangular',logo_alignment:'left',locale:'mn',width:Math.min(360,Math.max(220,slot.current.clientWidth||320))});
  }).catch(()=>{if(live)setFailed(true)});
  return()=>{live=false};
 },[clientId]);
 if(!clientId)return null;
 return <div className="auth__google" aria-label="Google-ээр үргэлжлүүлэх">
  <p className="auth__or"><span>эсвэл</span></p>
  <div ref={slot} className="auth__google-slot" style={disabled?{pointerEvents:'none',opacity:.6}:undefined}/>
  {failed&&<p className="auth__step-note" role="status">Google-ийн товчийг ачаалж чадсангүй. Имэйл, нууц үгээрээ үргэлжлүүлнэ үү.</p>}
 </div>;
}
