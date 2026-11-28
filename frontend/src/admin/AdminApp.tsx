import React,{lazy,Suspense,useCallback,useEffect,useMemo,useRef,useState} from 'react';
import { PasswordInput } from '../components/PasswordInput';
import { adminApi,adminSession,setReauthHandler,setUnauthorizedHandler,AdminApiError,type AdminMe } from './adminApi';
import { usePrismBody } from '../design/prismPage';
import { useDomainTheme } from '../design/domainTheme';
import { RoleChip } from './Console';
import { adminGuard,UNSAVED_MN } from './unsavedGuard';
import './admin.css';

const ReviewReportEditor=lazy(()=>import('./ReviewReportEditor'));
const Console=lazy(()=>import('./ConsoleRoutes'));

export const isAdminHash=(h:string)=>/^#\/admin(\/|$|\?)/.test(h);
const parse=(hash:string)=>{const [path]=hash.replace(/^#\/admin\/?/,'').split('?');const parts=path.split('/').filter(Boolean);return {section:parts[0]||'',id:parts[1]||''}};
export const adminHref=(...p:string[])=>'#/admin'+(p.length?'/'+p.join('/'):'');

export function Page({title,children,actions}:{title:string;children:React.ReactNode;actions?:React.ReactNode}){return <section className="adm-page"><header className="adm-page__head"><h1 tabIndex={-1} data-route-heading>{title}</h1>{actions&&<div className="adm-page__actions">{actions}</div>}</header>{children}</section>}
export function Empty({text}:{text:string}){return <div className="adm-empty" role="status">{text}</div>}
export function Err({text,retry}:{text:string;retry?:()=>void}){return <div className="adm-error" role="alert"><span>{text}</span>{retry&&<button type="button" className="adm-btn" onClick={retry}>Дахин оролдох</button>}</div>}
export function Loading(){return <div className="adm-loading" role="status" aria-live="polite"><span className="adm-spinner" aria-hidden="true"/>Ачаалж байна</div>}
export function Pager({page,pageSize,total,onPage}:{page:number;pageSize:number;total:number;onPage:(p:number)=>void}){const pages=Math.max(1,Math.ceil(total/pageSize));return <nav className="adm-pager" aria-label="Хуудаслалт"><button type="button" className="adm-btn" disabled={page<=1} onClick={()=>onPage(page-1)}>Өмнөх</button><span>{page} / {pages} ({total})</span><button type="button" className="adm-btn" disabled={page>=pages} onClick={()=>onPage(page+1)}>Дараах</button></nav>}
export function useAsync<T>(fn:()=>Promise<T>,deps:unknown[]){const [state,set]=useState<{loading:boolean;error:string;data:T|null}>({loading:true,error:'',data:null});const run=useCallback(()=>{set(s=>({...s,loading:true,error:''}));fn().then(data=>set({loading:false,error:'',data}),e=>set({loading:false,error:(e as Error).message||'Алдаа гарлаа',data:null}))},deps);// eslint-disable-line react-hooks/exhaustive-deps
 useEffect(()=>{run()},[run]);return {...state,reload:run}}


/* Re-confirmation before a sensitive change: the password and a fresh six-digit code mailed to the account's own address. */
function ReauthModal({onDone,onCancel}:{onDone:(ok:boolean)=>void;onCancel:()=>void}){
 const [pw,setPw]=useState('');const [code,setCode]=useState('');const [err,setErr]=useState('');const [busy,setBusy]=useState(false);const [sent,setSent]=useState(false);const first=useRef<HTMLInputElement>(null);
 useEffect(()=>{first.current?.focus()},[]);
 const cancelRef=useRef(onCancel);cancelRef.current=onCancel;
 useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();cancelRef.current()}};document.addEventListener('keydown',key);return()=>document.removeEventListener('keydown',key)},[]);
 const submit=async(e:React.FormEvent)=>{e.preventDefault();setBusy(true);setErr('');try{await adminApi.reauth(pw,code.replace(/\s/g,''));onDone(true)}catch(x){setErr((x as Error).message)}finally{setBusy(false)}};
 return <div className="adm-modal" role="dialog" aria-modal="true" aria-labelledby="reauth-title"><form className="adm-modal__box" onSubmit={submit}><h2 id="reauth-title">Дахин баталгаажуулах</h2><p>Энэ үйлдэл нууц үг болон имэйлээр ирэх кодоор дахин баталгаажуулахыг шаардана.</p>
  <label>Нууц үг<PasswordInput ref={first} autoComplete="current-password" value={pw} onChange={e=>setPw(e.target.value)} required/></label>
  <label>Имэйлээр ирсэн код (6 орон)<input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" value={code} onChange={e=>setCode(e.target.value)} required/></label>
  <button type="button" className="adm-btn" disabled={busy} onClick={async()=>{setBusy(true);setErr('');try{await adminApi.sendReauthCode();setSent(true)}catch(x){setErr((x as AdminApiError).status===429?'Түр хүлээгээд дахин оролдоно уу.':(x as Error).message)}finally{setBusy(false)}}}>{sent?'Код дахин илгээх':'Код илгээх'}</button>
  {err&&<div className="adm-error" role="alert">{err}</div>}<div className="adm-modal__row"><button type="button" className="adm-btn" onClick={onCancel}>Болих</button><button type="submit" className="adm-btn adm-btn--primary" disabled={busy||!pw||code.replace(/\s/g,'').length!==6}>Баталгаажуулах</button></div></form></div>
}

/* Sign-in, the same for every role: 1) e-mail + password, 2) the six-digit code mailed to the account (skipped on a trusted device), 3) access. */
function Login({onLoggedIn}:{onLoggedIn:()=>void}){
 const [email,setEmail]=useState('');const [pw,setPw]=useState('');const [code,setCode]=useState('');const [stage,setStage]=useState<'start'|'email'>('start');const [trust,setTrust]=useState(true);const [wait,setWait]=useState(0);const [minutes,setMinutes]=useState(5);
 const [err,setErr]=useState('');const [note,setNote]=useState('');const [busy,setBusy]=useState(false);
 useEffect(()=>{if(wait<=0)return;const t=window.setTimeout(()=>setWait(w=>Math.max(0,w-1)),1000);return()=>window.clearTimeout(t)},[wait]);
 const finish=(r:{token?:string})=>{if(r.token){adminSession.token=r.token;setPw('');setCode('');onLoggedIn()}};
 const asked=(r:{resendAfterSeconds?:number;expiresInMinutes?:number},msg:string)=>{setStage('email');setCode('');setWait(r.resendAfterSeconds||60);if(r.expiresInMinutes)setMinutes(r.expiresInMinutes);setNote(msg)};
 const submit=async(e:React.FormEvent)=>{e.preventDefault();setBusy(true);setErr('');setNote('');
  try{const r=await adminApi.login(stage==='email'?{email:email.trim(),password:pw,emailCode:code.replace(/\s/g,''),trustDevice:trust}:{email:email.trim(),password:pw,trustDevice:trust});
   if(r.mfaRequired==='EMAIL_CODE')asked(r,'Имэйл рүү 6 оронтой код илгээлээ.');else finish(r)}
  catch(x){setErr((x as AdminApiError).message);if(stage==='email')setCode('')}finally{setBusy(false)}};
 const resend=async()=>{setBusy(true);setErr('');try{const r=await adminApi.login({email:email.trim(),password:pw});if(r.mfaRequired==='EMAIL_CODE')asked(r,'Шинэ код илгээлээ.');else finish(r)}catch(x){setErr((x as Error).message)}finally{setBusy(false)}};
 return <main className="adm-login"><form className="adm-login__card" onSubmit={submit}><div className="adm-login__brand">BusinessMRI.mn</div><h1 data-route-heading tabIndex={-1}>Удирдлагын төв</h1><p>Зөвхөн эрх бүхий ажилтан нэвтэрнэ.</p>
  <label>Имэйл<input type="email" autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)} readOnly={stage==='email'} required/></label>
  {stage==='start'&&<label>Нууц үг<PasswordInput autoComplete="current-password" value={pw} onChange={e=>setPw(e.target.value)} required/></label>}
  {stage==='email'&&<><p className="adm-note">Имэйл рүү илгээсэн 6 оронтой кодыг оруулна уу. Код {minutes} минут хүчинтэй, зөвхөн нэг удаа ажиллана.</p><label>Имэйлийн код<input inputMode="numeric" autoComplete="one-time-code" maxLength={7} placeholder="000000" value={code} onChange={e=>setCode(e.target.value)} autoFocus required/></label></>}
  <label className="adm-check"><input type="checkbox" checked={trust} onChange={e=>setTrust(e.target.checked)}/> Энэ төхөөрөмжийг 30 хоног хадгалах</label>
  {note&&<div className="adm-note" role="status">{note}</div>}{err&&<div className="adm-error" role="alert">{err}</div>}
  <button type="submit" className="adm-btn adm-btn--primary adm-btn--wide" disabled={busy||!email||!pw||(stage==='email'&&code.replace(/\s/g,'').length!==6)}>{busy?'Түр хүлээнэ үү':stage==='email'?'Баталгаажуулах':'Үргэлжлүүлэх'}</button>
  {stage==='email'&&<><button type="button" className="adm-btn adm-btn--wide" disabled={busy||wait>0} onClick={()=>void resend()}>{wait>0?`Код дахин авах (${wait} сек)`:'Код дахин авах'}</button><button type="button" className="adm-link" onClick={()=>{setStage('start');setCode('');setErr('');setNote('')}}>Буцах</button></>}
 </form></main>
}

export default function AdminApp(){
 useDomainTheme(null);usePrismBody(true);
 const [hash,setHash]=useState(window.location.hash);const [me,setMe]=useState<AdminMe|null>(null);const [state,setState]=useState<'loading'|'out'|'in'>(adminSession.token?'loading':'out');const [reauth,setReauth]=useState<null|((ok:boolean)=>void)>(null);
 useEffect(()=>{const set=()=>{const t=document.querySelector('.adm-top') as HTMLElement|null;const sticky=t&&['sticky','fixed'].includes(getComputedStyle(t).position);document.documentElement.style.setProperty('--adm-top-h',`${sticky?Math.ceil(t!.getBoundingClientRect().height)+8:0}px`)   /* the report bar sits under the first header only while that header stays on screen */};set();window.addEventListener('resize',set);const o=typeof ResizeObserver!=='undefined'?new ResizeObserver(set):null;const t=document.querySelector('.adm-top');if(t&&o)o.observe(t);return()=>{window.removeEventListener('resize',set);o?.disconnect()}},[state,hash]);
 const prevHash=useRef(window.location.hash);
 useEffect(()=>{const h=()=>{if(window.location.hash===prevHash.current)return;if(adminGuard.dirty&&isAdminHash(prevHash.current)&&!window.confirm(UNSAVED_MN)){window.location.hash=prevHash.current;return}adminGuard.dirty=false;prevHash.current=window.location.hash;setHash(window.location.hash);window.scrollTo(0,0)};window.addEventListener('hashchange',h);return()=>window.removeEventListener('hashchange',h)},[]);
 const load=useCallback(async()=>{if(!adminSession.token){setState('out');return}try{setMe(await adminApi.me());setState('in')}catch{adminSession.token=null;setState('out')}},[]);
 useEffect(()=>{void load()},[load]);
 useEffect(()=>{setUnauthorizedHandler(()=>{setMe(null);setState('out');if(!/#\/admin\/login/.test(window.location.hash))window.location.hash=adminHref('login')});setReauthHandler(()=>new Promise<boolean>(resolve=>setReauth(()=>(ok:boolean)=>{setReauth(null);resolve(ok)})));return()=>{setUnauthorizedHandler(null);setReauthHandler(null)}},[]);
 const route=useMemo(()=>parse(hash),[hash]);
 /* Section totals shown beside the two Admin section names: always the real totals (search and filters never change them), refreshed on every route change, after publish / save / recall and every 30 s. */
 const [counts,setCounts]=useState<{review:number;done:number}|null>(null);
 const isAdminOnly=state==='in'&&!!me&&me.role!=='SUPER_ADMIN';
 useEffect(()=>{if(!isAdminOnly)return;let live=true;const load=()=>{void adminApi.get('/console/report-counts').then((c:any)=>{if(live)setCounts(c)}).catch(()=>undefined)};load();window.addEventListener('adm-counts',load);const t=window.setInterval(load,30000);return()=>{live=false;window.removeEventListener('adm-counts',load);window.clearInterval(t)}},[isAdminOnly,hash]);
 /* Unsaved report changes: a click on any admin link, the browser's back/forward and closing or refreshing the page ask first. */
 useEffect(()=>{
  const click=(e:MouseEvent)=>{if(!adminGuard.dirty)return;const a=(e.target as HTMLElement).closest?.('a[href^="#/admin"]') as HTMLAnchorElement|null;if(a&&!window.confirm(UNSAVED_MN)){e.preventDefault();e.stopPropagation()}else if(a)adminGuard.dirty=false};
  const before=(e:BeforeUnloadEvent)=>{if(adminGuard.dirty){e.preventDefault();e.returnValue=UNSAVED_MN;return UNSAVED_MN}};
  document.addEventListener('click',click,true);window.addEventListener('beforeunload',before);
  return()=>{document.removeEventListener('click',click,true);window.removeEventListener('beforeunload',before)}},[]);
 useEffect(()=>{document.title='Удирдлагын төв · BusinessMRI.mn'},[]);
 if(state==='loading')return <main className="adm-login"><Loading/></main>;
 if(state==='out'||!me){if(route.section!=='login')window.location.hash=adminHref('login');return <Login onLoggedIn={()=>{window.location.hash=adminHref();void load()}}/>}
 const sadmin=me.role==='SUPER_ADMIN';
 const nav:[string,string][]=sadmin?[['accounts','ADMIN SHIT'],['payments','PAYMENTS'],['data','DATA']]:[['reports','ХЯНАХ ТАЙЛАН'],['done','ДУУССАН ТАЙЛАН']];
 const home=nav[0][0];
 const section=route.section==='login'||route.section===''?home:route.section;
 const review=!sadmin&&section==='review';
 const logout=async()=>{try{await adminApi.logout()}catch{/* already gone */}adminSession.token=null;setMe(null);setState('out');window.location.hash=adminHref('login')};
 if(route.section==='login'||route.section===''){window.location.hash=adminHref(home);return null}
 const allowed=nav.some(([k])=>k===section)||review;
 return <div className="adm-shell cn-shell">
  <header className="adm-top"><a className="adm-brand" href={adminHref(home)}>BusinessMRI.mn</a><nav className="adm-nav cn-nav" aria-label="Удирдлага">{nav.map(([k,l])=><a key={k} href={adminHref(k)} aria-current={section===k||(k==='reports'&&review)?'page':undefined} className={section===k||(k==='reports'&&review)?'is-active':''}>{l}{!sadmin&&counts?` (${k==='reports'?counts.review:counts.done})`:''}</a>)}</nav><div className="adm-top__right"><RoleChip role={sadmin?'Sadmin':'Admin'}/><button type="button" className="adm-btn" onClick={()=>void logout()}>Гарах</button></div></header>
  <main id="adm-main" className="adm-main" tabIndex={-1}><Suspense fallback={<Loading/>}>{!allowed?<Page title="Хандах эрхгүй"><Empty text="Энэ хэсэгт хандах эрх танд байхгүй."/></Page>:review?<ReviewReportEditor id={route.id} me={me}/>:<Console section={section} id={route.id} meEmail={me.email}/>}</Suspense></main>
  {reauth&&<ReauthModal onDone={reauth} onCancel={()=>reauth(false)}/>}
 </div>
}
