import React,{useState} from 'react';
import { PasswordInput } from '../components/PasswordInput';
import { PageContainer,go,routeHref } from '../components/AppShell';
import { Button,Card,Field,Input } from '../components/UI';
import { BusinessNameFields } from '../components/BusinessNameFields';
import FactCard from '../components/FactCard';
import { COMPANY_DRAFT_EMAIL_KEY,COMPANY_DRAFT_KEY,findLegalForm,joinBusinessName,rememberLegalForm,splitBusinessName } from '../data/legalForms';
import { ApiError,api,session } from '../api/client';
import { billingPlans,formatMnt,selectedPlanStorageKey,type BillingPlanId } from '../billing/plans';
import { usePrismPage } from '../design/prismPage';
import { useGlassSelected } from '../design/glassTheme';
import { rememberVerificationEmail } from './VerifyEmail';

export default function Login(){
 usePrismPage();
 useGlassSelected(null);
 const selectedPlanId=(sessionStorage.getItem(selectedPlanStorageKey)||'') as BillingPlanId;
 const selectedPlan=billingPlans.find(x=>x.id===selectedPlanId);
 const [notice,setNotice]=useState(()=>{try{const n=sessionStorage.getItem('mmri.loginNotice')||'';if(n)sessionStorage.removeItem('mmri.loginNotice');return n}catch{return ''}});
 const [mode,setMode]=useState<'login'|'register'>('login');
 const [email,setEmail]=useState('');const [password,setPassword]=useState('');const [confirm,setConfirm]=useState('');const [bizName,setBizName]=useState('');const [bizForm,setBizForm]=useState('');const [busy,setBusy]=useState(false);const [error,setError]=useState('');
 const emailOk=/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
 /* Sign-up shows ONLY the e-mail first; the password, the repeated password and the company appear once the e-mail is valid. */
 const detailsOpen=mode==='register'&&emailOk;
 const passwordOk=mode==='login'?password.length>0:password.length>=10;
 const matchOk=mode==='login'||(password.length>0&&password===confirm);
 const companyOk=mode==='login'||(bizName.trim().length>0&&!!findLegalForm(bizForm));
 const canSubmit=!busy&&emailOk&&passwordOk&&matchOk&&companyOk;
 const friendlyError=(message:string)=>{const m=message.toLowerCase();if(m.includes('invalid email or password'))return 'Имэйл эсвэл нууц үг буруу байна.';if(m.includes('already exists'))return 'Энэ имэйлээр бүртгэл аль хэдийн үүссэн байна.';if(m.includes('10')&&m.includes('128'))return 'Нууц үг хамгийн багадаа 10 тэмдэгт байна.';if(m.includes('valid email'))return 'Зөв имэйл хаяг оруулна уу.';return message||'Үйлдэл хийгдсэнгүй.'};
 /* api.login() wipes the private browser state (mmri.* keys), so the sign-up draft is read BEFORE it and handed over. */
 const readCompanyDraft=()=>{try{const draft=localStorage.getItem(COMPANY_DRAFT_KEY)||'';const owner=localStorage.getItem(COMPANY_DRAFT_EMAIL_KEY)||'';return draft&&owner===email.trim().toLowerCase()?draft:''}catch{return ''}};
 const destinationAfterLogin=async(draft:string)=>{
  /* MMRI-08: never silently pick the first company; several companies and no remembered choice send the user to the company selector in settings. */
  const {companies,company,needsChoice}=await api.resolveActiveCompany();
  if(!companies.length){
   /* The company typed at sign-up (same browser, same e-mail) becomes the company now; nothing is asked twice. */
   try{if(draft){const sp=splitBusinessName(draft,null);const lf=findLegalForm(sp.form);if(sp.name&&lf){const c=await api.createCompany({name:draft});rememberLegalForm(c.id,lf.code)}}}catch(e){console.warn('Company from sign-up draft failed',e)}
   return 'profile' as const;
  }
  if(needsChoice||!company)return 'settings' as const;
  if(selectedPlan)return 'billing' as const;
  const assessments=await api.listAssessments(company.id);
  const resumable=assessments.find(a=>['IN_PROGRESS','PAUSED','PROFILE_PENDING'].includes(a.status));
  const latest=resumable??assessments[0];
  if(latest){session.assessmentId=latest.id;localStorage.setItem(`mmri.assessmentArea.${latest.id}`,latest.domainCode);sessionStorage.removeItem('business:testQuestionArea');sessionStorage.setItem('business:reportArea',latest.domainCode)}
  return latest?.status==='PROFILE_PENDING'?'profile' as const:latest?'home' as const:'profile' as const;
 };
 const submit=async()=>{
  if(!canSubmit){setError(!emailOk?'Зөв имэйл хаяг оруулна уу.':!passwordOk?(mode==='register'?'Нууц үг хамгийн багадаа 10 тэмдэгт байна.':'Нууц үгээ оруулна уу.'):!matchOk?'Нууц үг хоёр талбарт ижил байх ёстой.':'Байгууллагын нэр болон хэлбэрээ сонгоно уу.');return}
  setError('');setBusy(true);const signupDraft=mode==='login'?readCompanyDraft():'';
  // Stage 1: authentication. Only failures here may be reported as login/registration errors.
  try{if(mode==='login')await api.login({email:email.trim(),password});else {const r=await api.register({email:email.trim(),password});try{localStorage.setItem(COMPANY_DRAFT_KEY,joinBusinessName(bizName.trim(),bizForm));localStorage.setItem(COMPANY_DRAFT_EMAIL_KEY,email.trim().toLowerCase())}catch{/* private mode: the company is asked again after sign-in */}rememberVerificationEmail(email.trim());if(r.delivery==='FAILED')sessionStorage.setItem('mmri.verifyDeliveryFailed','1');setPassword('');setConfirm('');setBusy(false);go('verify');return}}
  catch(e:any){setError(e instanceof ApiError&&e.code==='CORS_ORIGIN_DENIED'?'Энэ хаягаар хандах эрхгүй байна. Админтай холбогдоно уу.':friendlyError(e?.message||''));setBusy(false);return}
  // Stage 2: the session is valid. A data-loading failure must not look like a credentials error; the destination page loads its own data and reports its own errors.
  let destination:'profile'|'billing'|'home'|'settings'='home';
  try{destination=await destinationAfterLogin(signupDraft)}catch(e){console.warn('Post-login data loading failed',e)}
  setBusy(false);go(destination);
 };
 return <div className="auth">
  <a className="auth__brand" href={routeHref('home')} aria-label="BusinessMRI.mn - Нүүр">BusinessMRI.mn</a>
  <PageContainer className="auth__layout">
   <section className="auth__message" aria-label="Сонирхолтой баримт"><FactCard/></section>
   <Card className="auth__card mmri-glass mmri-glass--strong" tone="focal">
    <h2 className="auth__card-title">{mode==='login'?'Нэвтрэх':'Бүртгүүлэх'}</h2>
    <form id="mmri-auth-panel" className="auth__form" key={mode} onSubmit={e=>{e.preventDefault();void submit()}}>
     {mode==='register'&&detailsOpen?<div className="auth__email-locked"><span>{email.trim()}</span><button type="button" className="auth__forgot" onClick={()=>{setEmail('');setPassword('');setConfirm('')}}>Өөр имэйл</button></div>
      :<Field label="Имэйл"><Input type="email" autoComplete="email" inputMode="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="name@company.mn" required autoFocus={mode==='register'}/></Field>}
     {mode==='register'&&!detailsOpen&&<p className="auth__step-note">Имэйл хаягаа оруулбал үргэлжлүүлэх талбарууд гарч ирнэ.</p>}
     {(mode==='login'||detailsOpen)&&<Field label="Нууц үг"><PasswordInput className="mmri-input" autoComplete={mode==='login'?'current-password':'new-password'} value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••••" minLength={mode==='register'?10:undefined} maxLength={128} required autoFocus={detailsOpen}/></Field>}
     {detailsOpen&&<Field label="Нууц үг давтах" error={confirm&&password!==confirm?'Нууц үг хоёр талбарт ижил байх ёстой.':undefined}><PasswordInput className="mmri-input" autoComplete="new-password" value={confirm} onChange={e=>setConfirm(e.target.value)} placeholder="••••••••••" maxLength={128} required/></Field>}
     {detailsOpen&&<BusinessNameFields name={bizName} form={bizForm} onNameChange={v=>{setBizName(v);setError('')}} onFormChange={v=>{setBizForm(v);setError('')}}/>}
     {notice&&<div role="status"><p>{notice}</p></div>}
     {error&&<div className="mmri-support-alert is-error" role="alert">{error}</div>}
     {(mode==='login'||detailsOpen)&&<Button type="submit" fullWidth loading={busy} disabled={!canSubmit}>{mode==='login'?'Нэвтрэх':'Баталгаажуулах код илгээх'}</Button>}
     {mode==='login'&&<a className="auth__forgot" href="#/forgot-password">Нууц үгээ мартсан уу?</a>}
     {mode==='login'?<p className="auth__switch">Бүртгэлгүй юу? <button type="button" onClick={()=>{setMode('register');setError('');setNotice('')}}>Бүртгүүлэх</button></p>
      :<p className="auth__switch">Бүртгэлтэй юу? <button type="button" onClick={()=>{setMode('login');setError('');setNotice('')}}>Нэвтрэх</button></p>}
     <p className="auth__legal">{mode==='login'?<><a href="#/privacy" target="_blank" rel="noopener">Нууцлалын бодлого</a> · <a href="#/terms" target="_blank" rel="noopener">Үйлчилгээний нөхцөл</a></>:<>Бүртгүүлэхийн өмнө <a href="#/terms" target="_blank" rel="noopener">Үйлчилгээний нөхцөл</a> болон <a href="#/privacy" target="_blank" rel="noopener">Нууцлалын бодлого</a>-той танилцана уу.</>}</p>
     {import.meta.env.DEV&&import.meta.env.VITE_MMRI_SHOW_DEMO_LOGIN==='true'&&mode==='login'&&<button className="auth__demo" type="button" onClick={()=>{setEmail('demo@mmri.mn');setPassword('Demo2026!!')}}>Тест бүртгэл бөглөх</button>}
     {selectedPlan&&<div className="auth__plan" role="status"><span>{selectedPlan.name}</span><b>{formatMnt(selectedPlan.priceMnt)}</b></div>}
    </form>
   </Card>
  </PageContainer>
 </div>;
}
