import React,{useState} from 'react';
import { PasswordInput } from '../components/PasswordInput';
import { AppShell,PageContainer } from '../components/AppShell';
import { Button,Dialog,Field } from '../components/UI';
import { Icon } from '../components/Icon';
import { api,session } from '../api/client';

function saveBlob(file:{blob:Blob;filename:string},fallback:string){const url=URL.createObjectURL(file.blob);const a=document.createElement('a');a.href=url;a.download=file.filename||fallback;a.style.display='none';document.body.appendChild(a);a.click();a.remove();window.setTimeout(()=>URL.revokeObjectURL(url),2000)}

/** Settings > Account management: Excel export and the two irreversible erasures. Erasure is never one click: a dialog states the consequences and asks for the password again
    (server-side re-authentication, verified together with the signed-in session and, for the company, the OWNER role). No e-mail or password fields are shown on the page itself. */
export default function AccountData(){
 const companyId=session.companyId;const companyName=session.companyName||'';
 const [busy,setBusy]=useState('');const [companyErased,setCompanyErased]=useState(false);const [msg,setMsg]=useState<{tone:'ok'|'error';text:string}|null>(null);
 const [dialog,setDialog]=useState<null|'company'|'account'>(null);const [pw,setPw]=useState('');const [dialogError,setDialogError]=useState('');
 const run=async(key:string,fn:()=>Promise<void>)=>{setBusy(key);setMsg(null);try{await fn()}catch(e:any){setMsg({tone:'error',text:e?.message||'Үйлдэл хийгдсэнгүй. Дахин оролдоно уу.'})}finally{setBusy('')}};
 const exportExcel=()=>run('ex',async()=>{if(!companyId)return;saveBlob(await api.exportCompanyWorkbook(companyId),'businessmri-data.xlsx');setMsg({tone:'ok',text:'Excel файл татагдлаа.'})});
 const close=()=>{setDialog(null);setPw('');setDialogError('')};
 const confirmErase=async()=>{
  setDialogError('');setBusy('erase');
  try{
   if(dialog==='company'){if(!companyId)return;const r=await api.eraseCompanyData(companyId,companyName,pw);close();setMsg({tone:'ok',text:`Байгууллагын мэдээлэл устгагдлаа (${r.assessmentsRemoved} оношилгоо). Төлбөрийн бүртгэл, аюулгүй байдлын бүртгэл хадгалагдана.`});setCompanyErased(true)}
   else if(dialog==='account'){const me=await api.me();await api.eraseAccountData(me.email,pw);window.location.hash='#/';window.location.reload()}
  }catch(e:any){setDialogError(e?.message||'Үйлдэл хийгдсэнгүй. Дахин оролдоно уу.')}finally{setBusy('')}
 };
 const isCompany=dialog==='company';
 return <AppShell route="settings"><PageContainer className="account-data account-manage">
  <header><span><Icon name="user" size={30}/></span><div><h1 data-route-heading tabIndex={-1}>Бүртгэлийн удирдлага</h1></div></header>
  {msg&&<div className={`mmri-support-alert ${msg.tone==='error'?'is-error':''}`} role={msg.tone==='error'?'alert':'status'}>{msg.text}</div>}
  {companyId&&!companyErased&&<section className="account-data__card lg lg--soft" aria-labelledby="export-data"><h2 id="export-data">Өгөгдлөө татах</h2>
   <p>Байгууллагын мэдээлэл, оношилгоо, хариулт, төлбөр, эрхийн мэдээллийг Excel (.xlsx) файлаар татна. Нууц үг болон нэвтрэлтийн нууц мэдээлэл багтахгүй.</p>
   <p><Button type="button" variant="secondary" className="account-manage__export" loading={busy==='ex'} disabled={!!busy} onClick={()=>void exportExcel()}>Excel файл татах</Button></p>
  </section>}
  <section className="account-data__card account-data__danger lg lg--soft" aria-labelledby="del-data"><h2 id="del-data">Өгөгдөл устгах</h2>
   {companyErased?<p><a href="#/profile">Шинэ байгууллагын мэдээлэл оруулах</a></p>:companyId?<>
   <p><b>Устах зүйл:</b> байгууллагын бүх оношилгоо, хариулт, үр дүн, тайлан, төлөвлөгөө, лого болон гишүүдийн холбоос.</p>
   <p><b>Хуулийн дагуу хадгалагдах зүйл:</b> төлбөрийн бүртгэл, эрхийн түүх, аюулгүй байдлын бүртгэл.</p>
   <p className="account-data__warn" role="note"><b>Анхааруулга:</b> энэ үйлдлийг буцаах боломжгүй. Зөвхөн байгууллагын эзэмшигч устгана. Устгахаасаа өмнө Excel файлаа татаж авна уу.</p>
   <Button type="button" variant="danger" disabled={!!busy} onClick={()=>{setDialog('company');setPw('');setDialogError('')}}>Байгууллагын өгөгдлийг устгах</Button></>:<p>Устгах байгууллагын өгөгдөл алга.</p>}
  </section>
  <section className="account-data__card account-data__danger lg lg--soft" aria-labelledby="del-account"><h2 id="del-account">Бүртгэл устгах</h2>
   <p><b>Устах зүйл:</b> нэвтрэх эрх, имэйл хаяг болон байгууллагад гишүүнээр холбогдсон мэдээлэл. Нэвтэрсэн бүх төхөөрөмж гарна.</p>
   <p><b>Хадгалагдах зүйл:</b> таны үүсгэсэн төлбөрийн бүртгэл, аюулгүй байдлын бүртгэл.</p>
   <p className="account-data__warn" role="note"><b>Анхааруулга:</b> бүртгэл устсаны дараа дахин нэвтрэх, сэргээх боломжгүй. Байгууллагын цорын ганц эзэмшигч бол эхлээд байгууллагын өгөгдлөө устгана уу.</p>
   <Button type="button" variant="danger" disabled={!!busy} onClick={()=>{setDialog('account');setPw('');setDialogError('')}}>Бүртгэлээ устгах</Button>
  </section>
  <Dialog className="account-erase-dialog" open={dialog!==null} onOpenChange={o=>{if(!o&&busy!=='erase')close()}} title={isCompany?'Байгууллагын өгөгдлийг устгах уу?':'Бүртгэлээ устгах уу?'}
   description={isCompany?`«${companyName}» байгууллагын бүх оношилгоо, тайлан, төлөвлөгөө устна. Буцаах боломжгүй.`:'Таны бүртгэл бүрмөсөн хаагдана. Буцаах боломжгүй.'}
   footer={<><Button variant="secondary" disabled={busy==='erase'} onClick={close}>Цуцлах</Button><Button variant="danger" loading={busy==='erase'} disabled={!pw||busy==='erase'} onClick={()=>void confirmErase()}>{isCompany?'Тийм, өгөгдлийг устгах':'Тийм, бүртгэлээ устгах'}</Button></>}>
   <form onSubmit={e=>{e.preventDefault();if(pw&&!busy)void confirmErase()}} autoComplete="off">
    <Field label="Баталгаажуулахын тулд нууц үгээ оруулна уу"><PasswordInput className="mmri-input" value={pw} onChange={e=>{setPw(e.target.value);setDialogError('')}} autoComplete="current-password" autoFocus/></Field>
    {dialogError&&<div className="mmri-support-alert is-error" role="alert">{dialogError}</div>}
   </form>
  </Dialog>
 </PageContainer></AppShell>;
}
