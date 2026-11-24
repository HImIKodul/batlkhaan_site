import React,{useState} from 'react';
import { AppShell,PageContainer } from '../components/AppShell';
import { Button,Field,Input } from '../components/UI';
import { Icon } from '../components/Icon';
import { api,session } from '../api/client';
import CompanyMembers from './CompanyMembers';

function saveBlob(file:{blob:Blob;filename:string},fallback:string){const url=URL.createObjectURL(file.blob);const a=document.createElement('a');a.href=url;a.download=file.filename||fallback;a.style.display='none';document.body.appendChild(a);a.click();a.remove();window.setTimeout(()=>URL.revokeObjectURL(url),2000)}

/** Settings > Data and privacy: export, erasure (company content, then account), and the legal drafts. Erasure always asks for the password and an exact typed confirmation. */
export default function AccountData(){
 const companyId=session.companyId;const companyName=session.companyName||'';
 const [busy,setBusy]=useState('');const [companyErased,setCompanyErased]=useState(false);const [msg,setMsg]=useState<{tone:'ok'|'error';text:string}|null>(null);
 const [coName,setCoName]=useState('');const [coPw,setCoPw]=useState('');const [acEmail,setAcEmail]=useState('');const [acPw,setAcPw]=useState('');
 const run=async(key:string,fn:()=>Promise<void>)=>{setBusy(key);setMsg(null);try{await fn()}catch(e:any){setMsg({tone:'error',text:e?.message||'Үйлдэл хийгдсэнгүй. Дахин оролдоно уу.'})}finally{setBusy('')}};
 const exportAccount=()=>run('ea',async()=>{saveBlob(await api.exportAccountData(),'mmri-account-export.json');setMsg({tone:'ok',text:'Бүртгэлийн мэдээлэл татагдлаа.'})});
 const exportCompany=()=>run('ec',async()=>{if(!companyId)return;saveBlob(await api.exportCompanyData(companyId),'mmri-company-export.json');setMsg({tone:'ok',text:'Байгууллагын мэдээлэл татагдлаа.'})});
 const eraseCompany=()=>run('dc',async()=>{if(!companyId)return;const r=await api.eraseCompanyData(companyId,coName,coPw);setCoName('');setCoPw('');setMsg({tone:'ok',text:`Байгууллагын мэдээлэл устгагдлаа (${r.assessmentsRemoved} оношилгоо). Төлбөрийн бүртгэл, аюулгүй байдлын бүртгэл хадгалагдана.`});setCompanyErased(true)});
 const eraseAccount=()=>run('da',async()=>{await api.eraseAccountData(acEmail,acPw);window.location.hash='#/';window.location.reload()});
 return <AppShell route="settings"><PageContainer className="account-data account-manage">
  <header><span><Icon name="user" size={30}/></span><div><h1 data-route-heading tabIndex={-1}>Бүртгэлийн удирдлага</h1></div></header>
  {msg&&<div className={`mmri-support-alert ${msg.tone==='error'?'is-error':''}`} role={msg.tone==='error'?'alert':'status'}>{msg.text}</div>}
  {companyId&&!companyErased&&<CompanyMembers companyId={companyId}/>}
  <section className="account-data__card account-data__danger lg lg--soft"><h2>Бүртгэл устгах</h2>
   <p>Бүртгэл устсаны дараа дахин нэвтрэх боломжгүй. Төлбөрийн бүртгэл хадгалагдана.</p>
   <details className="account-manage__fold"><summary>Бүртгэлээ устгах</summary>
   <form onSubmit={e=>{e.preventDefault();void eraseAccount()}} autoComplete="off">
    <Field label="Имэйл хаягаа бичиж баталгаажуулна уу"><Input type="email" value={acEmail} onChange={e=>setAcEmail(e.target.value)} autoComplete="off"/></Field>
    <Field label="Нууц үг"><Input type="password" value={acPw} onChange={e=>setAcPw(e.target.value)} autoComplete="current-password"/></Field>
    <Button type="submit" variant="danger" loading={busy==='da'} disabled={!!busy||!acEmail.trim()||!acPw}>Бүртгэлээ устгах</Button></form></details>
   {companyErased?<p><a href="#/profile">Шинэ байгууллагын мэдээлэл оруулах</a></p>:companyId&&<details className="account-manage__fold"><summary>Байгууллагын мэдээлэл устгах</summary>
   <p>Бүх оношилгоо, тайлан эргэн сэргэхгүйгээр устна. Зөвхөн эзэмшигч устгана. Өмнө нь мэдээллээ татаж авна уу.</p>
   <form onSubmit={e=>{e.preventDefault();void eraseCompany()}} autoComplete="off">
    <Field label={`Байгууллагын нэрийг яг бичнэ үү: ${companyName}`}><Input value={coName} onChange={e=>setCoName(e.target.value)} autoComplete="off"/></Field>
    <Field label="Нууц үг"><Input type="password" value={coPw} onChange={e=>setCoPw(e.target.value)} autoComplete="current-password"/></Field>
    <Button type="submit" variant="danger" loading={busy==='dc'} disabled={!!busy||!coName.trim()||!coPw}>Байгууллагын мэдээллийг устгах</Button></form></details>}
  </section>
  <nav className="account-manage__links" aria-label="Мэдээллийн эрх"><button type="button" disabled={!!busy} onClick={()=>void exportAccount()}>Миний мэдээллийг татах</button>{companyId&&!companyErased&&<button type="button" disabled={!!busy} onClick={()=>void exportCompany()}>Байгууллагын мэдээллийг татах</button>}<a href="#/privacy">Нууцлалын бодлого</a><a href="#/terms">Үйлчилгээний нөхцөл</a></nav>
 </PageContainer></AppShell>;
}
