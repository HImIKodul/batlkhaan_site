import React,{useState} from 'react';
import { PasswordInput } from '../components/PasswordInput';
import { AppShell,PageContainer } from '../components/AppShell';
import { Button,Field } from '../components/UI';
import { Icon } from '../components/Icon';
import { api } from '../api/client';

/** Settings > Нууц үг солих. The server needs the CURRENT password, applies the same 10-128 character rule as sign-up, ends every other session and keeps this one signed in. */
export default function PasswordChange(){
 const [current,setCurrent]=useState('');const [next,setNext]=useState('');const [again,setAgain]=useState('');
 const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [done,setDone]=useState(false);
 const lengthOk=next.length>=10&&next.length<=128;const matchOk=next.length>0&&next===again;
 const submit=async()=>{
  if(!current){setError('Одоогийн нууц үгээ оруулна уу.');return}
  if(!lengthOk){setError('Шинэ нууц үг хамгийн багадаа 10 тэмдэгт байна.');return}
  if(!matchOk){setError('Шинэ нууц үг хоёр талбарт ижил байх ёстой.');return}
  setBusy(true);setError('');setDone(false);
  try{await api.changePassword(current,next);setCurrent('');setNext('');setAgain('');setDone(true)}
  catch(e:any){setError(e?.message||'Нууц үгийг солиж чадсангүй. Дахин оролдоно уу.')}finally{setBusy(false)}
 };
 return <AppShell route="settings"><PageContainer className="account-data account-manage">
  <header><span><Icon name="user" size={30}/></span><div><h1 data-route-heading tabIndex={-1}>Нууц үг солих</h1></div></header>
  <section className="account-data__card lg lg--soft" aria-labelledby="pw-change">
   <h2 id="pw-change">Шинэ нууц үг тогтоох</h2>
   <p>Аюулгүй байдлын үүднээс одоогийн нууц үгээ баталгаажуулна. Нууц үг солигдсоны дараа бусад төхөөрөмж дээрх нэвтрэлт хаагдана.</p>
   <form onSubmit={e=>{e.preventDefault();void submit()}} className="account-data__form" noValidate>
    <Field label="Одоогийн нууц үг"><PasswordInput className="mmri-input" value={current} onChange={e=>{setCurrent(e.target.value);setError('');setDone(false)}} autoComplete="current-password" maxLength={128}/></Field>
    <Field label="Шинэ нууц үг" help="Хамгийн багадаа 10 тэмдэгт."><PasswordInput className="mmri-input" value={next} onChange={e=>{setNext(e.target.value);setError('');setDone(false)}} autoComplete="new-password" maxLength={128}/></Field>
    <Field label="Шинэ нууц үг давтах" error={again&&next!==again?'Нууц үг хоёр талбарт ижил байх ёстой.':undefined}><PasswordInput className="mmri-input" value={again} onChange={e=>{setAgain(e.target.value);setError('');setDone(false)}} autoComplete="new-password" maxLength={128}/></Field>
    {error&&<div className="mmri-support-alert is-error" role="alert">{error}</div>}
    {done&&<div className="mmri-support-alert" role="status">Нууц үг амжилттай солигдлоо.</div>}
    <Button type="submit" loading={busy} disabled={busy||!current||!lengthOk||!matchOk}>Нууц үг солих</Button>
   </form>
  </section>
 </PageContainer></AppShell>;
}
