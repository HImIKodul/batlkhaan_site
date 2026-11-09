import React,{useState} from 'react';
import { PageContainer,go,routeHref } from '../components/AppShell';
import { Button,Card,Field,Input,Tabs } from '../components/UI';
import { ApiError,api,session } from '../api/client';
import { billingPlans,formatMnt,selectedPlanStorageKey,type BillingPlanId } from '../billing/plans';
import { usePrismPage } from '../design/prismPage';
import { useGlassSelected } from '../design/glassTheme';

export default function Login(){
 usePrismPage();
 useGlassSelected(null);
 const selectedPlanId=(sessionStorage.getItem(selectedPlanStorageKey)||'') as BillingPlanId;
 const selectedPlan=billingPlans.find(x=>x.id===selectedPlanId);
 const [mode,setMode]=useState<'login'|'register'>('login');
 const [email,setEmail]=useState('');const [password,setPassword]=useState('');const [name,setName]=useState('');const [busy,setBusy]=useState(false);const [error,setError]=useState('');
 const emailOk=/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
 const passwordOk=mode==='login'?password.length>0:password.length>=10;
 const canSubmit=!busy&&emailOk&&passwordOk;
 const friendlyError=(message:string)=>{const m=message.toLowerCase();if(m.includes('invalid email or password'))return 'Имэйл эсвэл нууц үг буруу байна.';if(m.includes('already exists'))return 'Энэ имэйлээр бүртгэл аль хэдийн үүссэн байна.';if(m.includes('10')&&m.includes('128'))return 'Нууц үг хамгийн багадаа 10 тэмдэгт байна.';if(m.includes('valid email'))return 'Зөв имэйл хаяг оруулна уу.';return message||'Үйлдлийг гүйцэтгэж чадсангүй.'};
 const destinationAfterLogin=async()=>{
  /* MMRI-08: never silently pick the first company; several companies and no remembered choice send the user to the company selector in settings. */
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
 const submit=async()=>{
  if(!canSubmit){setError(!emailOk?'Зөв имэйл хаяг оруулна уу.':mode==='register'?'Нууц үг хамгийн багадаа 10 тэмдэгт байна.':'Нууц үгээ оруулна уу.');return}
  setError('');setBusy(true);
  // Stage 1: authentication. Only failures here may be reported as login/registration errors.
  try{if(mode==='login')await api.login({email:email.trim(),password});else await api.register({email:email.trim(),password,displayName:name.trim()||undefined})}
  catch(e:any){setError(e instanceof ApiError&&e.code==='CORS_ORIGIN_DENIED'?'Энэ хаяг серверт зөвшөөрөгдөөгүй байна. Системийн админтай холбогдоно уу.':friendlyError(e?.message||''));setBusy(false);return}
  // Stage 2: the session is valid. A data-loading failure must not look like a credentials error; the destination page loads its own data and reports its own errors.
  let destination:'profile'|'billing'|'home'|'settings'='home';
  try{destination=await destinationAfterLogin()}catch(e){console.warn('Post-login data loading failed',e)}
  setBusy(false);go(destination);
 };
 return <div className="auth">
  <a className="auth__brand" href={routeHref('home')} aria-label="BUSINESSMRI.MN - Нүүр">BUSINESSMRI.MN</a>
  <PageContainer className="auth__layout">
   <section className="auth__message">
    <h1 tabIndex={-1} data-route-heading>Бизнесээ бүхэлд нь оношлуул.<br/><em>Дараагийн 12 сарынхаа замыг тодорхой болго.</em></h1>
    <ul className="auth__proof" aria-label="Оношилгооноос авах гол үр дүн"><li><b>5</b><span>бизнесийн чиглэл</span></li><li><b>5 + 5</b><span>давуу ба сул тал</span></li><li><b>12 сар</b><span>хэрэгжилтийн төлөвлөгөө</span></li></ul>
   </section>
   <Card className="auth__card mmri-glass mmri-glass--strong" tone="focal">
    <Tabs label="Нэвтрэх хэлбэр" panelId="mmri-auth-panel" value={mode} onValueChange={value=>{setMode(value as 'login'|'register');setError('')}} items={[{value:'login',label:'Нэвтрэх'},{value:'register',label:'Бүртгүүлэх'}]}/>
    <form id="mmri-auth-panel" className="auth__form" key={mode} role="tabpanel" aria-labelledby={`mmri-auth-panel-tab-${mode}`} onSubmit={e=>{e.preventDefault();void submit()}}>
     {mode==='register'&&<Field label="Нэр"><Input value={name} onChange={e=>setName(e.target.value)} placeholder="Таны нэр" autoComplete="name"/></Field>}
     <Field label="Имэйл"><Input type="email" autoComplete="email" inputMode="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="name@company.mn" required/></Field>
     <Field label="Нууц үг"><Input type="password" autoComplete={mode==='login'?'current-password':'new-password'} value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••••" minLength={mode==='register'?10:undefined} required/>{mode==='register'&&<small className="auth__hint">Хамгийн багадаа 10 тэмдэгт.</small>}</Field>
     {error&&<div className="mmri-support-alert is-error" role="alert">{error}</div>}
     <Button type="submit" fullWidth loading={busy} disabled={!canSubmit}>{mode==='login'?'Нэвтрэх':'Бүртгэл үүсгэх'}</Button>
     {mode==='login'&&<a className="auth__forgot" href="#/forgot-password">Нууц үгээ мартсан уу?</a>}
     {mode==='login'&&<p className="auth__legal"><a href="#/privacy" target="_blank" rel="noopener">Нууцлалын бодлого</a> · <a href="#/terms" target="_blank" rel="noopener">Үйлчилгээний нөхцөл</a> <small>(Хуулийн хяналт хүлээгдэж буй төсөл)</small></p>}
     {mode==='register'&&<p className="auth__legal">Бүртгүүлэхийн өмнө <a href="#/terms" target="_blank" rel="noopener">Үйлчилгээний нөхцөл</a> болон <a href="#/privacy" target="_blank" rel="noopener">Нууцлалын бодлого</a>-той танилцана уу. <small>(Хуулийн хяналт хүлээгдэж буй төсөл)</small></p>}
     {import.meta.env.DEV&&import.meta.env.VITE_MMRI_SHOW_DEMO_LOGIN==='true'&&mode==='login'&&<button className="auth__demo" type="button" onClick={()=>{setEmail('demo@mmri.mn');setPassword('Demo2026!!')}}>Тест бүртгэл бөглөх</button>}
     {selectedPlan&&<div className="auth__plan" role="status"><span>{selectedPlan.name}</span><b>{formatMnt(selectedPlan.priceMnt)}</b></div>}
    </form>
   </Card>
  </PageContainer>
 </div>;
}
