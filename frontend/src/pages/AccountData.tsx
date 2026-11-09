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
 const run=async(key:string,fn:()=>Promise<void>)=>{setBusy(key);setMsg(null);try{await fn()}catch(e:any){setMsg({tone:'error',text:e?.message||'Үйлдлийг гүйцэтгэж чадсангүй. Дахин оролдоно уу.'})}finally{setBusy('')}};
 const exportAccount=()=>run('ea',async()=>{saveBlob(await api.exportAccountData(),'mmri-account-export.json');setMsg({tone:'ok',text:'Бүртгэлийн мэдээлэл татагдлаа.'})});
 const exportCompany=()=>run('ec',async()=>{if(!companyId)return;saveBlob(await api.exportCompanyData(companyId),'mmri-company-export.json');setMsg({tone:'ok',text:'Байгууллагын мэдээлэл татагдлаа.'})});
 const eraseCompany=()=>run('dc',async()=>{if(!companyId)return;const r=await api.eraseCompanyData(companyId,coName,coPw);setCoName('');setCoPw('');setMsg({tone:'ok',text:`Байгууллагын мэдээлэл устгагдлаа (${r.assessmentsRemoved} оношилгоо). Төлбөрийн бүртгэл, аюулгүй байдлын бүртгэл хадгалагдана.`});setCompanyErased(true)});
 const eraseAccount=()=>run('da',async()=>{await api.eraseAccountData(acEmail,acPw);window.location.hash='#/';window.location.reload()});
 return <AppShell route="settings"><PageContainer className="account-data">
  <header><span><Icon name="shield" size={34}/></span><div><b>МИНИЙ ХЭСЭГ</b><h1 data-route-heading tabIndex={-1}>Өгөгдөл ба нууцлал</h1><p>Мэдээллээ татах, устгах, нууцлалын нөхцөлтэй танилцах.</p></div></header>
  {msg&&<div className={`mmri-support-alert ${msg.tone==='error'?'is-error':''}`} role={msg.tone==='error'?'alert':'status'}>{msg.text}</div>}
  <section className="account-data__card lg lg--soft"><h2>Хууль зүйн баримт</h2>
   <p>Эдгээр нь системийн бодит ажиллагаанд үндэслэсэн төсөл бөгөөд хуулийн хяналт хүлээгдэж байна.</p>
   <ul className="account-data__links"><li><a href="#/privacy">Нууцлалын бодлого (төсөл)</a></li><li><a href="#/terms">Үйлчилгээний нөхцөл (төсөл)</a></li></ul></section>
  <section className="account-data__card lg lg--soft"><h2>Мэдээлэл татах</h2>
   <p>JSON файлаар татна. Нууц үгийн хэш, нэвтрэлтийн токен, төлбөрийн QR мэдээлэл багтахгүй.</p>
   <div className="account-data__actions"><Button variant="secondary" loading={busy==='ea'} disabled={!!busy} onClick={()=>void exportAccount()}>Бүртгэлийн мэдээлэл татах</Button>
   <Button variant="secondary" loading={busy==='ec'} disabled={!!busy||!companyId||companyErased} onClick={()=>void exportCompany()}>Байгууллагын мэдээлэл татах</Button></div>
   {!companyId&&<small>Байгууллага үүсгээгүй байна.</small>}</section>
  {companyId&&!companyErased&&<CompanyMembers companyId={companyId}/>}
  <section className="account-data__card account-data__danger lg lg--soft"><h2>Байгууллагын мэдээлэл устгах</h2>
   <p>Оношилгооны бүх хариулт, үр дүн, тайлан, төлөвлөгөө, тайлангийн файл <b>эргэн сэргэхгүйгээр</b> устна. Төлбөрийн бүртгэл болон аюулгүй байдлын бүртгэл хадгалагдана. Зөвхөн байгууллагын эзэмшигч устгана. Устгахын өмнө мэдээллээ татаж авахыг зөвлөж байна.</p>
   {companyErased?<p><a href="#/profile">Шинэ байгууллагын мэдээлэл оруулах</a></p>:companyId?<form onSubmit={e=>{e.preventDefault();void eraseCompany()}} autoComplete="off">
    <Field label={`Баталгаажуулахын тулд байгууллагын нэрийг яг ижлээр бичнэ үү: ${companyName}`}><Input value={coName} onChange={e=>setCoName(e.target.value)} autoComplete="off"/></Field>
    <Field label="Нууц үг"><Input type="password" value={coPw} onChange={e=>setCoPw(e.target.value)} autoComplete="current-password"/></Field>
    <Button type="submit" variant="danger" loading={busy==='dc'} disabled={!!busy||!coName.trim()||!coPw}>Байгууллагын мэдээллийг устгах</Button></form>:<small>Устгах байгууллага алга.</small>}</section>
  <section className="account-data__card account-data__danger lg lg--soft"><h2>Бүртгэл устгах</h2>
   <p>Имэйл, нэр нэргүйжүүлэгдэж, дахин нэвтрэх боломжгүй болно. Хэрэв та байгууллагын цорын ганц эзэмшигч бол эхлээд байгууллагынхаа мэдээллийг устгах эсвэл өөр эзэмшигч томилох шаардлагатай. Таны үүсгэсэн төлбөрийн бүртгэл хадгалагдана.</p>
   <form onSubmit={e=>{e.preventDefault();void eraseAccount()}} autoComplete="off">
    <Field label="Баталгаажуулахын тулд имэйл хаягаа бичнэ үү"><Input type="email" value={acEmail} onChange={e=>setAcEmail(e.target.value)} autoComplete="off"/></Field>
    <Field label="Нууц үг"><Input type="password" value={acPw} onChange={e=>setAcPw(e.target.value)} autoComplete="current-password"/></Field>
    <Button type="submit" variant="danger" loading={busy==='da'} disabled={!!busy||!acEmail.trim()||!acPw}>Бүртгэлээ устгах</Button></form></section>
 </PageContainer></AppShell>;
}
