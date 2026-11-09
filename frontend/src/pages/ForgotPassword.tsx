import React,{useState} from 'react';
import { PageContainer,routeHref } from '../components/AppShell';
import { Button,Card,Field,Input } from '../components/UI';
import { api } from '../api/client';
import { usePrismPage } from '../design/prismPage';
import { useGlassSelected } from '../design/glassTheme';

/** Step 1 of password recovery. The answer is always the same message, whether or not the address has an account. */
export default function ForgotPassword(){
 usePrismPage();useGlassSelected(null);
 const [email,setEmail]=useState('');const [busy,setBusy]=useState(false);const [sent,setSent]=useState(false);const [error,setError]=useState('');
 const emailOk=/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
 const submit=async()=>{if(!emailOk){setError('Зөв имэйл хаяг оруулна уу.');return}setError('');setBusy(true);try{await api.requestPasswordReset(email.trim());setSent(true)}catch(e:any){setError(e?.status===429?'Хэт олон хүсэлт илгээлээ. Түр хүлээгээд дахин оролдоно уу.':'Хүсэлт илгээж чадсангүй. Дахин оролдоно уу.')}finally{setBusy(false)}};
 return <div className="auth">
  <a className="auth__brand" href={routeHref('home')} aria-label="BUSINESSMRI.MN - Нүүр">BUSINESSMRI.MN</a>
  <PageContainer className="auth__layout auth__layout--single">
   <Card className="auth__card mmri-glass mmri-glass--strong" tone="focal">
    <h1 className="auth__card-title" tabIndex={-1} data-route-heading>Нууц үг сэргээх</h1>
    {sent?<div className="auth__done" role="status">
      <p><b>Хүсэлт хүлээн авлаа.</b></p>
      <p>Хэрэв {email.trim()} хаягаар бүртгэл байвал нууц үг сэргээх холбоосыг илгээлээ. Холбоос 30 минутын дотор, зөвхөн нэг удаа ажиллана. Имэйл ирэхгүй бол спам хавтсаа шалгана уу.</p>
      <a className="auth__back" href="#/login">Нэвтрэх хуудас руу буцах</a>
     </div>
    :<form className="auth__form" onSubmit={e=>{e.preventDefault();void submit()}}>
     <p className="auth__lead">Бүртгэлтэй имэйл хаягаа оруулбал нууц үг сэргээх холбоос илгээнэ.</p>
     <Field label="Имэйл"><Input type="email" autoComplete="email" inputMode="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="name@company.mn" required autoFocus/></Field>
     {error&&<div className="mmri-support-alert is-error" role="alert">{error}</div>}
     <Button type="submit" fullWidth loading={busy} disabled={busy||!emailOk}>Холбоос илгээх</Button>
     <a className="auth__back" href="#/login">Нэвтрэх хуудас руу буцах</a>
    </form>}
   </Card>
  </PageContainer>
 </div>;
}
