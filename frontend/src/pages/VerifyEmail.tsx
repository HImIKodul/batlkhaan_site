import React,{useEffect,useState} from 'react';
import { PageContainer,go,routeHref } from '../components/AppShell';
import { Button,Card,Field,Input } from '../components/UI';
import { api,ApiError } from '../api/client';
import { usePrismPage } from '../design/prismPage';
import { useGlassSelected } from '../design/glassTheme';

/** Registration e-mail verification: the customer types the 6-digit code from the e-mail. This page has nothing to do with password recovery (#/reset-password). */
const EMAIL_KEY='mmri.verifyEmail',SENT_KEY='mmri.verifyEmailSentAt',COOLDOWN_SECONDS=60;
const read=(k:string)=>{try{return sessionStorage.getItem(k)||''}catch{return ''}};
const write=(k:string,v:string)=>{try{sessionStorage.setItem(k,v)}catch{/* private mode: the page still works, the cooldown just restarts */}};
/** Sign-up values kept IN MEMORY ONLY (never in browser storage) so "change e-mail" returns to the form without retyping the password. */
export const pendingRegistration:{current:{email:string;password:string}|null}={current:null};
export function rememberVerificationEmail(email:string){write(EMAIL_KEY,email);write(SENT_KEY,String(Date.now()))}
const remaining=()=>{const t=Number(read(SENT_KEY));return Number.isFinite(t)&&t>0?Math.max(0,COOLDOWN_SECONDS-Math.floor((Date.now()-t)/1000)):0};
export default function VerifyEmail(){
 usePrismPage();useGlassSelected(null);
 const [email,setEmail]=useState(read(EMAIL_KEY));const fromSignup=read(EMAIL_KEY).length>0;const [code,setCode]=useState('');
 const [busy,setBusy]=useState(false);const [resending,setResending]=useState(false);const [done,setDone]=useState(false);
 const [error,setError]=useState(()=>{try{if(sessionStorage.getItem('mmri.verifyDeliveryFailed')){sessionStorage.removeItem('mmri.verifyDeliveryFailed');return 'Баталгаажуулах кодыг имэйлээр илгээж чадсангүй. Түр хүлээгээд «Код дахин авах» товчийг дарна уу.'}}catch{/* ignore */}return ''});const [notice,setNotice]=useState('');const [wait,setWait]=useState(remaining());
 useEffect(()=>{if(wait<=0)return;const t=window.setTimeout(()=>setWait(remaining()),1000);return()=>window.clearTimeout(t)},[wait]);
 const emailOk=/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());const codeOk=/^\d{6}$/.test(code);
 const submit=async()=>{if(!emailOk){setError('Зөв имэйл хаяг оруулна уу.');return}if(!codeOk){setError('6 оронтой кодыг оруулна уу.');return}
  setError('');setNotice('');setBusy(true);
  try{await api.confirmEmailVerification(email.trim(),code);write(SENT_KEY,'');pendingRegistration.current=null;write(EMAIL_KEY,'');try{sessionStorage.setItem('mmri.loginNotice','Имэйл баталгаажлаа. Имэйл болон нууц үгээрээ нэвтэрнэ үү.')}catch{/* ignore */}setDone(true);window.setTimeout(()=>go('login'),2200)}
  catch(e:any){setCode('');setError(e?.status===429?'Хэт олон оролдлого. Түр хүлээгээд дахин оролдоно уу.':'Код буруу эсвэл хугацаа нь дууссан байна. Шинэ код авна уу.')}finally{setBusy(false)}};
 const resend=async()=>{if(!emailOk){setError('Зөв имэйл хаяг оруулна уу.');return}setError('');setNotice('');setResending(true);
  try{const r=await api.requestEmailVerification(email.trim());if(r.delivery==='FAILED'){setError(r.message);return}rememberVerificationEmail(email.trim());setWait(COOLDOWN_SECONDS);setCode('');setNotice(r.message)}
  catch(e:any){setError(e?.status===429?'Хэт олон хүсэлт. Түр хүлээгээд дахин оролдоно уу.':'Хүсэлт амжилтгүй. Дараа дахин оролдоно уу.')}finally{setResending(false)}};
 return <div className="auth">
  <a className="auth__brand" href={routeHref('home')} aria-label="BusinessMRI.mn - Нүүр">BusinessMRI.mn</a>
  <PageContainer className="auth__layout auth__layout--single">
   <Card className="auth__card mmri-glass mmri-glass--strong" tone="focal">
    <h1 className="auth__card-title" tabIndex={-1} data-route-heading>Имэйл баталгаажуулах</h1>
    {done?<div className="auth__done" role="status"><p><b>Имэйл баталгаажлаа.</b></p><p>Бүртгэлээ идэвхжүүллээ. Нэвтрэх хуудас руу шилжиж байна — бүртгүүлэхдээ оруулсан имэйл, нууц үгээрээ нэвтэрнэ үү.</p><a className="mmri-button mmri-button--primary" href={routeHref('login')}>Нэвтрэх</a></div>
    :<form className="auth__form" onSubmit={e=>{e.preventDefault();void submit()}}>
     <p className="auth__hint">Имэйл рүү илгээсэн 6 оронтой кодыг оруулна уу. Код 10 минут хүчинтэй, зөвхөн нэг удаа ажиллана.</p>
     {fromSignup?<div className="auth__email-locked"><span><small>Код илгээсэн имэйл</small><b>{email.trim()}</b></span><button type="button" className="auth__forgot" onClick={()=>{try{sessionStorage.setItem('mmri.authMode','register')}catch{/* ignore */}go('login')}}>Имэйл солих</button></div>
      :<Field label="Имэйл"><Input type="email" autoComplete="email" inputMode="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="name@company.mn" required/></Field>}
     <Field label="Баталгаажуулах код"><Input className="auth__code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={6} value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,'').slice(0,6))} placeholder="000000" aria-label="6 оронтой баталгаажуулах код" required autoFocus/></Field>
     {notice&&<div role="status"><p>{notice}</p></div>}
     {error&&<div className="mmri-support-alert is-error" role="alert">{error}</div>}
     <Button type="submit" fullWidth loading={busy} disabled={busy||!codeOk||!emailOk}>Баталгаажуулах</Button>
     <Button type="button" variant="secondary" fullWidth loading={resending} disabled={resending||busy||wait>0||!emailOk} onClick={()=>void resend()}>{wait>0?`Код дахин авах (${wait} сек)`:'Код дахин авах'}</Button>
     <a className="auth__forgot" href={routeHref('login')}>Нэвтрэх хуудас руу буцах</a>
    </form>}
   </Card>
  </PageContainer>
 </div>;
}
