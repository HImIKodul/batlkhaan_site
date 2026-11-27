import React,{useEffect,useState} from 'react';
import { PasswordInput } from '../components/PasswordInput';
import { PageContainer,go,routeHref } from '../components/AppShell';
import { Button,Card,Field,Input } from '../components/UI';
import GoogleSignIn from '../components/GoogleSignIn';
import FactCard from '../components/FactCard';
import { ApiError,api,session } from '../api/client';
import { billingPlans,formatMnt,selectedPlanStorageKey,type BillingPlanId } from '../billing/plans';
import { usePrismPage } from '../design/prismPage';
import { useGlassSelected } from '../design/glassTheme';
import { rememberVerificationEmail,pendingRegistration } from './VerifyEmail';

export default function Login(){
 usePrismPage();
 useGlassSelected(null);
 const selectedPlanId=(sessionStorage.getItem(selectedPlanStorageKey)||'') as BillingPlanId;
 const selectedPlan=billingPlans.find(x=>x.id===selectedPlanId);
 const [notice,setNotice]=useState(()=>{try{const n=sessionStorage.getItem('mmri.loginNotice')||'';if(n)sessionStorage.removeItem('mmri.loginNotice');return n}catch{return ''}});
 /* "Change e-mail" on the verification screen returns here in sign-up mode with the typed values kept (in memory only, never in browser storage). */
 const [mode,setMode]=useState<'login'|'register'>(()=>{try{if(sessionStorage.getItem('mmri.authMode')==='register'){sessionStorage.removeItem('mmri.authMode');return 'register'}}catch{/* ignore */}return 'login'});
 const [email,setEmail]=useState(()=>mode==='register'&&pendingRegistration.current?pendingRegistration.current.email:'');
 const [password,setPassword]=useState(()=>mode==='register'&&pendingRegistration.current?pendingRegistration.current.password:'');
 const [confirm,setConfirm]=useState(()=>mode==='register'&&pendingRegistration.current?pendingRegistration.current.password:'');
 const [busy,setBusy]=useState(false);const [error,setError]=useState('');
 /* Sign-in on a device that is not trusted: step 2 asks for the six-digit code that was e-mailed. */
 const [step,setStep]=useState<'password'|'code'>('password');const [code,setCode]=useState('');const [trust,setTrust]=useState(true);const [wait,setWait]=useState(0);
 useEffect(()=>{if(wait<=0)return;const t=window.setTimeout(()=>setWait(w=>Math.max(0,w-1)),1000);return()=>window.clearTimeout(t)},[wait]);
 const emailOk=/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
 const passwordOk=mode==='login'?password.length>0:password.length>=10&&password.length<=128;
 const matchOk=mode==='login'||(password.length>0&&password===confirm);
 const canSubmit=!busy&&emailOk&&passwordOk&&matchOk;
 const friendlyError=(message:string)=>{const m=message.toLowerCase();if(m.includes('invalid email or password'))return 'Имэйл эсвэл нууц үг буруу байна.';if(m.includes('already exists'))return 'Энэ имэйлээр бүртгэл аль хэдийн үүссэн байна.';if(m.includes('10')&&m.includes('128'))return 'Нууц үг хамгийн багадаа 10 тэмдэгт байна.';if(m.includes('valid email'))return 'Зөв имэйл хаяг оруулна уу.';return message||'Үйлдэл хийгдсэнгүй.'};
 /* After sign-in: no company yet (new account) -> company onboarding; several companies and no remembered choice -> selector; otherwise the usual destination. */
 const destinationAfterLogin=async()=>{
  const {companies,company,needsChoice}=await api.resolveActiveCompany();
  if(!companies.length)return 'profile' as const;
  if(needsChoice||!company)return 'settings' as const;
  if(selectedPlan)return 'billing' as const;
  const assessments=await api.listAssessments(company.id);
  const resumable=assessments.find(a=>['IN_PROGRESS','PAUSED','PROFILE_PENDING'].includes(a.status));
  const latest=resumable??assessments[0];
  if(latest){session.assessmentId=latest.id;localStorage.setItem(`mmri.assessmentArea.${latest.id}`,latest.domainCode);sessionStorage.removeItem('business:testQuestionArea');sessionStorage.setItem('business:reportArea',latest.domainCode)}
  return latest?.status==='PROFILE_PENDING'?'profile' as const:latest?'home' as const:'profile' as const;
 };
 const finishSignIn=async()=>{
  // The session is valid. A data-loading failure must not look like a credentials error; the destination page loads its own data and reports its own errors.
  let destination:'profile'|'billing'|'home'|'settings'='home';
  try{destination=await destinationAfterLogin()}catch(e){console.warn('Post-login data loading failed',e)}
  setBusy(false);go(destination);
 };
 const submit=async()=>{
  if(!canSubmit){setError(!emailOk?'Зөв имэйл хаяг оруулна уу.':!passwordOk?(mode==='register'?'Нууц үг хамгийн багадаа 10 тэмдэгт байна.':'Нууц үгээ оруулна уу.'):'Нууц үг хоёр талбарт ижил байх ёстой.');return}
  setError('');setBusy(true);
  try{
   if(mode==='login'){const r=await api.login({email:email.trim(),password});if('verificationRequired' in r){setStep('code');setCode('');setWait(r.resendAfterSeconds||60);setBusy(false);setNotice(r.codeSent?'Имэйл рүү 6 оронтой код илгээлээ.':'Саяхан код илгээсэн байна. Имэйлээ шалгана уу.');return}}
   else{const r=await api.register({email:email.trim(),password});pendingRegistration.current={email:email.trim(),password};rememberVerificationEmail(email.trim());if(r.delivery==='FAILED')sessionStorage.setItem('mmri.verifyDeliveryFailed','1');setPassword('');setConfirm('');setBusy(false);go('verify');return}
  }catch(e:any){setError(e instanceof ApiError&&e.code==='CORS_ORIGIN_DENIED'?'Энэ хаягаар хандах эрхгүй байна. Админтай холбогдоно уу.':friendlyError(e?.message||''));setBusy(false);return}
  await finishSignIn();
 };
 const submitCode=async()=>{if(!/^\d{6}$/.test(code)){setError('6 оронтой кодыг оруулна уу.');return}setError('');setBusy(true);try{await api.verifyLogin({email:email.trim(),password,code,trustDevice:trust})}catch(e:any){setCode('');setError(e instanceof ApiError&&e.status===429?'Хэт олон оролдлого. Түр хүлээгээд дахин оролдоно уу.':'Код буруу эсвэл хугацаа нь дууссан байна. Шинэ код авна уу.');setBusy(false);return}setNotice('');await finishSignIn()};
 const resendCode=async()=>{setError('');setBusy(true);try{const r:any=await api.login({email:email.trim(),password});if(r.verificationRequired){setWait(r.resendAfterSeconds||60);setNotice(r.codeSent?'Шинэ код илгээлээ.':'Саяхан код илгээсэн байна. Имэйлээ шалгана уу.')}}catch(e:any){setError(e?.message||'Код илгээж чадсангүй.')}finally{setBusy(false)}};
 const onGoogle=async(credential:string)=>{setError('');setBusy(true);try{await api.googleLogin(credential)}catch(e:any){setError(e?.message||'Google-ээр нэвтэрч чадсангүй.');setBusy(false);return}await finishSignIn()};
 const switchMode=(m:'login'|'register')=>{setMode(m);setError('');setNotice('');setPassword('');setConfirm('')};
 return <div className="auth">
  <a className="auth__brand" href={routeHref('home')} aria-label="BusinessMRI.mn - Нүүр">BusinessMRI.mn</a>
  <PageContainer className="auth__layout">
   <section className="auth__message" aria-label="Сонирхолтой баримт"><FactCard/></section>
   <Card className="auth__card mmri-glass mmri-glass--strong" tone="focal">
    <h2 className="auth__card-title">{step==='code'?'Имэйл баталгаажуулах':mode==='login'?'Нэвтрэх':'Бүртгүүлэх'}</h2>
    {step==='code'?<form className="auth__form" onSubmit={e=>{e.preventDefault();void submitCode()}} noValidate>
     <p className="auth__hint">Имэйл рүү илгээсэн 6 оронтой кодыг оруулна уу. Код 10 минут хүчинтэй, зөвхөн нэг удаа ажиллана.</p>
     <div className="auth__email-locked"><span><small>Код илгээсэн имэйл</small><b>{email.trim()}</b></span></div>
     <Field label="Баталгаажуулах код"><Input className="auth__code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={6} value={code} onChange={e=>{setCode(e.target.value.replace(/\D/g,'').slice(0,6));setError('')}} placeholder="000000" aria-label="6 оронтой баталгаажуулах код" required autoFocus/></Field>
     <label className="auth__trust"><input type="checkbox" checked={trust} onChange={e=>setTrust(e.target.checked)}/> Энэ төхөөрөмжийг 30 хоног хадгалах</label>
     {notice&&<div role="status"><p>{notice}</p></div>}
     {error&&<div className="mmri-support-alert is-error" role="alert">{error}</div>}
     <Button type="submit" fullWidth loading={busy} disabled={busy||code.length!==6}>Баталгаажуулах</Button>
     <Button type="button" variant="secondary" fullWidth disabled={busy||wait>0} onClick={()=>void resendCode()}>{wait>0?`Код дахин авах (${wait} сек)`:'Код дахин авах'}</Button>
     <button type="button" className="auth__forgot" onClick={()=>{setStep('password');setCode('');setError('');setNotice('');setPassword('')}}>Буцах</button>
    </form>:
    <form id="mmri-auth-panel" className="auth__form" key={mode} onSubmit={e=>{e.preventDefault();void submit()}} noValidate>
     <Field label="Имэйл"><Input type="email" name="email" autoComplete={mode==='login'?'username':'email'} inputMode="email" value={email} onChange={e=>{setEmail(e.target.value);setError('')}} placeholder="name@company.mn" required autoFocus/></Field>
     <Field label="Нууц үг" help={mode==='register'?'Хамгийн багадаа 10 тэмдэгт.':undefined}><PasswordInput className="mmri-input" name="password" autoComplete={mode==='login'?'current-password':'new-password'} value={password} onChange={e=>{setPassword(e.target.value);setError('')}} placeholder="••••••••••" maxLength={128} required/></Field>
     {mode==='register'&&<Field label="Нууц үг давтах" error={confirm&&password!==confirm?'Нууц үг хоёр талбарт ижил байх ёстой.':undefined}><PasswordInput className="mmri-input" name="confirm-password" autoComplete="new-password" value={confirm} onChange={e=>{setConfirm(e.target.value);setError('')}} placeholder="••••••••••" maxLength={128} required/></Field>}
     {notice&&<div role="status"><p>{notice}</p></div>}
     {error&&<div className="mmri-support-alert is-error" role="alert">{error}</div>}
     <Button type="submit" fullWidth loading={busy} disabled={!canSubmit}>{mode==='login'?'Нэвтрэх':'Үргэлжлүүлэх'}</Button>
     {mode==='login'&&<a className="auth__forgot" href="#/forgot-password">Нууц үгээ мартсан уу?</a>}
     <GoogleSignIn onCredential={onGoogle} disabled={busy}/>
     {mode==='login'?<p className="auth__switch">Бүртгэлгүй юу? <button type="button" onClick={()=>switchMode('register')}>Бүртгүүлэх</button></p>
      :<p className="auth__switch">Бүртгэлтэй юу? <button type="button" onClick={()=>switchMode('login')}>Нэвтрэх</button></p>}
     <p className="auth__legal">{mode==='login'?<><a href="#/privacy" target="_blank" rel="noopener">Нууцлалын бодлого</a> · <a href="#/terms" target="_blank" rel="noopener">Үйлчилгээний нөхцөл</a></>:<>Бүртгүүлэхийн өмнө <a href="#/terms" target="_blank" rel="noopener">Үйлчилгээний нөхцөл</a> болон <a href="#/privacy" target="_blank" rel="noopener">Нууцлалын бодлого</a>-той танилцана уу.</>}</p>
     {import.meta.env.DEV&&import.meta.env.VITE_MMRI_SHOW_DEMO_LOGIN==='true'&&mode==='login'&&<button className="auth__demo" type="button" onClick={()=>{setEmail('demo@mmri.mn');setPassword('Demo2026!!')}}>Тест бүртгэл бөглөх</button>}
     {selectedPlan&&<div className="auth__plan" role="status"><span>{selectedPlan.name}</span><b>{formatMnt(selectedPlan.priceMnt)}</b></div>}
    </form>}
   </Card>
  </PageContainer>
 </div>;
}
