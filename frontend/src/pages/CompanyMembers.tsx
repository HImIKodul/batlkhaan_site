import React,{useCallback,useEffect,useState} from 'react';
import { Button,Dialog,Field,Input,Select,StatusBadge,Table } from '../components/UI';
import { api } from '../api/client';

type Role='OWNER'|'ADMIN'|'ASSESSOR'|'CONSULTANT'|'VIEWER';
type Member=Awaited<ReturnType<typeof api.listCompanyMembers>>[number];
const ROLES:Array<[Role,string]>=[['OWNER','Эзэмшигч'],['ADMIN','Админ'],['ASSESSOR','Үнэлгээ хийгч'],['CONSULTANT','Зөвлөх'],['VIEWER','Харагч']];
const roleLabel=(r:string)=>ROLES.find(x=>x[0]===r)?.[1]??r;

/** Company members: list, add an existing account by e-mail, change role, remove. Visible to OWNER/ADMIN only (the API answers 403 to everyone else). Every rule (owner-only OWNER grants, last-owner guard) is enforced server-side; this UI only surfaces the result. */
export default function CompanyMembers({companyId}:{companyId:string}){
 const [rows,setRows]=useState<Member[]|null>(null);const [allowed,setAllowed]=useState(true);const [busy,setBusy]=useState('');
 const [msg,setMsg]=useState<{tone:'ok'|'error';text:string}|null>(null);const [email,setEmail]=useState('');const [role,setRole]=useState<Role>('VIEWER');const [removing,setRemoving]=useState<Member|null>(null);
 const load=useCallback(async()=>{try{setRows(await api.listCompanyMembers(companyId));setAllowed(true)}catch(e:any){if(e?.status===403||/permission/i.test(e?.message||''))setAllowed(false);else setMsg({tone:'error',text:e?.message||'Гишүүдийн жагсаалтыг уншиж чадсангүй.'})}},[companyId]);
 useEffect(()=>{void load()},[load]);
 const run=async(key:string,ok:string,fn:()=>Promise<unknown>)=>{setBusy(key);setMsg(null);try{await fn();await load();setMsg({tone:'ok',text:ok})}catch(e:any){setMsg({tone:'error',text:e?.message||'Үйлдлийг гүйцэтгэж чадсангүй. Дахин оролдоно уу.'})}finally{setBusy('')}};
 if(!allowed)return null;
 return <section className="account-data__card lg lg--soft"><h2>Байгууллагын гишүүд</h2>
  <p>Зөвхөн системд бүртгэлтэй хэрэглэгчийг имэйлээр нэмнэ. Эзэмшигчийн эрхийг зөвхөн эзэмшигч олгоно; сүүлчийн эзэмшигчийг хасах боломжгүй.</p>
  {msg&&<div className={`mmri-support-alert ${msg.tone==='error'?'is-error':''}`} role={msg.tone==='error'?'alert':'status'}>{msg.text}</div>}
  {rows&&<Table caption="Гишүүд"><thead><tr><th>Имэйл</th><th>Эрх</th><th><span className="mmri-visually-hidden">Үйлдэл</span></th></tr></thead><tbody>
   {rows.map(m=><tr key={m.userId}><td>{m.displayName?`${m.displayName} · `:''}{m.email}{m.isSelf&&<> <StatusBadge>Та</StatusBadge></>}</td>
    <td><Select aria-label={`${m.email} · эрх`} value={m.role} disabled={!!busy||m.isSelf} onChange={e=>void run(`r${m.userId}`,'Эрх шинэчлэгдлээ.',()=>api.addCompanyMember(companyId,{email:m.email,role:e.target.value as Role}))}>{ROLES.map(([v,l])=><option key={v} value={v}>{l}</option>)}</Select></td>
    <td><Button variant="secondary" disabled={!!busy} onClick={()=>setRemoving(m)}>{m.isSelf?'Гарах':'Хасах'}</Button></td></tr>)}</tbody></Table>}
  <form className="account-data__actions" onSubmit={e=>{e.preventDefault();void run('add','Гишүүн нэмэгдлээ.',async()=>{await api.addCompanyMember(companyId,{email:email.trim(),role});setEmail('')})}} autoComplete="off">
   <Field label="Имэйл"><Input type="email" value={email} onChange={e=>setEmail(e.target.value)} autoComplete="off"/></Field>
   <Field label="Эрх"><Select value={role} onChange={e=>setRole(e.target.value as Role)}>{ROLES.map(([v,l])=><option key={v} value={v}>{l}</option>)}</Select></Field>
   <Button type="submit" loading={busy==='add'} disabled={!!busy||!email.trim()}>Гишүүн нэмэх</Button></form>
  <Dialog open={!!removing} onOpenChange={o=>{if(!o)setRemoving(null)}} title={removing?.isSelf?'Байгууллагаас гарах уу?':'Гишүүнийг хасах уу?'} description={removing?`${removing.email} (${roleLabel(removing.role)}) байгууллагын мэдээлэлд хандах эрхээ алдана.`:''}
   footer={<><Button variant="secondary" onClick={()=>setRemoving(null)}>Болих</Button><Button variant="danger" loading={busy.startsWith('x')} onClick={()=>{const m=removing;if(!m)return;setRemoving(null);void run(`x${m.userId}`,'Гишүүн хасагдлаа.',()=>api.removeCompanyMember(companyId,m.userId))}}>Баталгаажуулах</Button></>}><span/></Dialog>
 </section>;
}
