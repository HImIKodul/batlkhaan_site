import React,{useMemo,useState} from 'react';
import { PageContainer,routeHref } from '../components/AppShell';
import { Button,Card,Field,Input } from '../components/UI';
import { api,ApiError } from '../api/client';
import { usePrismPage } from '../design/prismPage';
import { useGlassSelected } from '../design/glassTheme';

/** Step 2 of password recovery: the token comes from the e-mail link (#/reset-password?token=...). After success the user must sign in again. */
export default function ResetPassword(){
 usePrismPage();useGlassSelected(null);
 const token=useMemo(()=>new URLSearchParams(window.location.hash.split('?')[1]||'').get('token')||'',[]);
 const [password,setPassword]=useState('');const [again,setAgain]=useState('');const [busy,setBusy]=useState(false);const [done,setDone]=useState(false);const [error,setError]=useState('');
 const tokenShape=/^[A-Za-z0-9_-]{43}$/.test(token);
 const lengthOk=password.length>=10&&password.length<=128;const match=password===again&&again.length>0;
 const submit=async()=>{if(!lengthOk){setError('Нууц үг 10-аас 128 тэмдэгт байх ёстой.');return}if(!match){setError('Нууц үг хоёр талбарт ижил байх ёстой.');return}setError('');setBusy(true);
  try{await api.confirmPasswordReset(token,password);setDone(true);window.history.replaceState(null,'',window.location.pathname+'#/reset-password')}
  catch(e:any){setError(e instanceof ApiError&&e.code==='WEAK_PASSWORD'?'Нууц үг 10-аас 128 тэмдэгт байх ёстой.':e?.status===429?'Хэт олон оролдлого. Түр хүлээгээд дахин оролдоно уу.':'Нууц үг сэргээх холбоос хүчингүй эсвэл хугацаа нь дууссан байна. Шинэ холбоос авна уу.')}finally{setBusy(false)}};
 return <div className="auth">
  <a className="auth__brand" href={routeHref('home')} aria-label="BUSINESSMRI.MN - Нүүр">BUSINESSMRI.MN</a>
  <PageContainer className="auth__layout auth__layout--single">
   <Card className="auth__card mmri-glass mmri-glass--strong" tone="focal">
    <h1 className="auth__card-title" tabIndex={-1} data-route-heading>Шинэ нууц үг тогтоох</h1>
    {done?<div className="auth__done" role="status"><p><b>Нууц үг амжилттай солигдлоо.</b></p><p>Аюулгүй байдлын үүднээс бүх төхөөрөмжөөс гарсан. Шинэ нууц үгээрээ нэвтэрнэ үү.</p><a className="mmri-button mmri-button--primary" href="#/login">Нэвтрэх</a></div>
    :!tokenShape?<div className="auth__done" role="alert"><p><b>Холбоос буруу байна.</b></p><p>Нууц үг сэргээх холбоосыг имэйлээс бүтнээр нь нээнэ үү, эсвэл шинэ холбоос авна уу.</p><a className="mmri-button mmri-button--primary" href="#/forgot-password">Шинэ холбоос авах</a></div>
    :<form className="auth__form" onSubmit={e=>{e.preventDefault();void submit()}}>
     <Field label="Шинэ нууц үг"><Input type="password" autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)} minLength={10} maxLength={128} required autoFocus/><small className="auth__hint">Хамгийн багадаа 10 тэмдэгт.</small></Field>
     <Field label="Шинэ нууц үгээ давтах"><Input type="password" autoComplete="new-password" value={again} onChange={e=>setAgain(e.target.value)} required/></Field>
     {error&&<div className="mmri-support-alert is-error" role="alert">{error}{error.includes('хүчингүй')&&<> <a href="#/forgot-password">Шинэ холбоос авах</a></>}</div>}
     <Button type="submit" fullWidth loading={busy} disabled={busy||!lengthOk||!match}>Нууц үг солих</Button>
    </form>}
   </Card>
  </PageContainer>
 </div>;
}
