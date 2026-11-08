import React,{useState} from 'react';
import { adminApi,fmt,DOMAIN_MN,type AdminMe } from './adminApi';
import { Page,Empty,Err,Loading,Pager,useAsync,adminHref } from './AdminApp';

/* SUPER_ADMIN account management. Every control here calls a real server route (backend/src/api/admin/account-routes.ts); the server decides permission,
   requires a fresh re-authentication for changes, validates, writes the audit trail and returns predictable errors. Nothing is simulated.
   Not offered because the backend cannot do it safely: free per-domain access grant/revoke (every entitlement must come from a paid invoice) and
   admin-forced account deletion (user-initiated erasure only). The page says so instead of showing dead buttons. */

const USER_STATUS_MN:Record<string,string>={ACTIVE:'Идэвхтэй',DISABLED:'Идэвхгүй'};
const ENT_STATUS_MN:Record<string,string>={ACTIVE:'Идэвхтэй',CONSUMED:'Ашиглагдсан',EXPIRED:'Дууссан',REVOKED:'Цуцлагдсан'};
const ORIGIN_MN=(o:string)=>o==='PAID_MOCK'?'Туршилтын төлбөр (MOCK)':o.startsWith('PAID_')?'Төлбөртэй (баталгаажсан)':o==='ADMIN_GRANT'?'Админ олгосон':o.replace(/_/g,' ');
const ACTION_MN:Record<string,string>={ADMIN_USER_EMAIL_CHANGED:'Имэйл солисон',ADMIN_USER_DEACTIVATED:'Идэвхгүй болгосон',ADMIN_USER_ACTIVATED:'Идэвхжүүлсэн'};
const tone=(kind:'user'|'ent'|'origin',v:string)=>kind==='user'?(v==='ACTIVE'?'ok':'bad'):kind==='ent'?(v==='ACTIVE'?'ok':v==='REVOKED'?'bad':'mute'):(v==='PAID_MOCK'?'warn':v.startsWith('PAID_')?'ok':'warn');
const Badge=({kind,value,label}:{kind:'user'|'ent'|'origin';value:string;label:string})=><span className={`adm-badge adm-badge--${tone(kind,value)}`}>{label}</span>;
const mnt=(n:number)=>`${Number(n).toLocaleString('en-US')}₮`;

function Entitlements({companyId,name}:{companyId:string;name:string|null}){
 const {loading,error,data,reload}=useAsync(()=>adminApi.get(`/companies/${companyId}/entitlements`),[companyId]);
 return <section className="adm-card adm-acc__ents"><h3>{name??'Байгууллага'} · оношилгооны эрхүүд</h3>
  {loading?<Loading/>:error?<Err text={error} retry={reload}/>:data.entitlements.length===0?<Empty text="Эрх олгогдоогүй байна."/>:
   <table className="adm-table"><thead><tr><th>Чиглэл</th><th>Төлөв</th><th>Үүсэл</th><th>Ашигласан</th><th>Нэхэмжлэх</th></tr></thead><tbody>{data.entitlements.map((e:any)=><tr key={e.id}>
    <td data-label="Чиглэл">{(DOMAIN_MN as any)[e.domainCode]??e.domainCode}</td>
    <td data-label="Төлөв"><Badge kind="ent" value={e.status} label={ENT_STATUS_MN[e.status]??e.status}/></td>
    <td data-label="Үүсэл"><Badge kind="origin" value={e.origin} label={ORIGIN_MN(e.origin)}/></td>
    <td data-label="Ашигласан">{e.assessmentsUsed}{e.assessmentLimit!=null?` / ${e.assessmentLimit}`:''}</td>
    <td data-label="Нэхэмжлэх">{e.invoice?`${mnt(e.invoice.amountMnt)} · ${e.invoice.provider} · ${e.invoice.paidAt?fmt(e.invoice.paidAt):'-'}`:'-'}</td></tr>)}</tbody></table>}
  {data?.history?.length>0&&<details className="adm-fold"><summary>Эрхийн түүх ({data.history.length})</summary><ul className="adm-activity">{data.history.map((h:any,i:number)=><li key={i}><span>{fmt(h.createdAt)}</span> {h.action} · {h.outcome}</li>)}</ul></details>}
  <p className="adm-note">Эрхийг зөвхөн баталгаажсан төлбөрөөр олгоно. Төлбөргүй эрх олгох эсвэл цуцлах үйлдэл серверт байхгүй (нэхэмжлэх бүр 0₮-өөс их, төлөгдсөн байх хатуу шалгалттай). Буцаалтыг «Төлбөрийн хяналт» хэсгээс шийднэ.</p>
 </section>;
}

function UserDetail({id}:{id:string}){
 const {loading,error,data,reload}=useAsync(()=>adminApi.get(`/users/${id}`),[id]);
 const [newEmail,setNewEmail]=useState('');const [confirm,setConfirm]=useState('');const [reasonE,setReasonE]=useState('');const [reasonS,setReasonS]=useState('');
 const [msg,setMsg]=useState<{ok:boolean;text:string}|null>(null);const [busy,setBusy]=useState(false);
 const run=async(fn:()=>Promise<any>,okText:(r:any)=>string,after?:()=>void)=>{setBusy(true);setMsg(null);try{const r=await fn();setMsg({ok:true,text:okText(r)});after?.();reload()}catch(e){setMsg({ok:false,text:(e as Error).message})}finally{setBusy(false)}};
 if(loading&&!data)return <Page title="Хэрэглэгч"><Loading/></Page>;if(error||!data)return <Page title="Хэрэглэгч"><Err text={error} retry={reload}/></Page>;
 const u=data.user;const locked=!!u.erased||!!u.adminRole;
 return <Page title={u.erased?'Устгагдсан бүртгэл':(u.email??'Хэрэглэгч')} actions={<a className="adm-btn" href={adminHref('users')}>‹ Жагсаалт</a>}>
  <section className="adm-card"><dl className="adm-dl"><dt>Төлөв</dt><dd><Badge kind="user" value={u.status} label={USER_STATUS_MN[u.status]??u.status}/>{u.erased&&<> <span className="adm-badge adm-badge--mute">Устгагдсан</span></>}{u.adminRole&&<> <span className="adm-badge adm-badge--warn">Админ · {u.adminRole}</span></>}</dd>
   <dt>Нэр</dt><dd>{u.displayName??'-'}</dd><dt>Бүртгүүлсэн</dt><dd>{fmt(u.createdAt)}</dd><dt>Сүүлд нэвтэрсэн</dt><dd>{fmt(u.lastLoginAt)}</dd><dt>Идэвхтэй сесс</dt><dd>{data.activeSessions}</dd></dl></section>
  {msg&&<div className={msg.ok?'adm-note adm-note--ok':'adm-error'} role={msg.ok?'status':'alert'}>{msg.text}</div>}
  {locked?<section className="adm-card"><p className="adm-note">{u.erased?'Бүртгэл хэрэглэгчийн хүсэлтээр устгагдсан тул өөрчлөх боломжгүй.':'Админ бүртгэлийг «Тохиргоо» → «Администраторууд» хэсгээс удирдана.'}</p></section>:<>
   <section className="adm-card"><h3>Идэвхжилт</h3><p className="adm-note">Идэвхгүй болгоход хэрэглэгч нэвтрэх боломжгүй болж, бүх сесс таслагдана. Мэдээлэл, төлбөр, тайлан хэвээр хадгалагдана.</p>
    <form className="adm-actions__row" onSubmit={e=>{e.preventDefault();void run(()=>adminApi.post(`/users/${id}/status`,{status:u.status==='ACTIVE'?'DISABLED':'ACTIVE',reason:reasonS}),r=>r.changed?(r.status==='DISABLED'?`Идэвхгүй болголоо. ${r.sessionsRevoked} сесс таслагдлаа.`:'Идэвхжүүллээ.'):'Өөрчлөлт шаардлагагүй.',()=>setReasonS(''))}}>
     <label>Шалтгаан (аудитад бүртгэгдэнэ)<input value={reasonS} onChange={e=>setReasonS(e.target.value)} minLength={8} maxLength={300} required/></label>
     <button type="submit" className={`adm-btn ${u.status==='ACTIVE'?'adm-btn--danger':'adm-btn--primary'}`} disabled={busy||reasonS.trim().length<8}>{u.status==='ACTIVE'?'Идэвхгүй болгох':'Идэвхжүүлэх'}</button></form></section>
   <section className="adm-card"><h3>Имэйл солих</h3><p className="adm-note">Шинэ хаяг өөр бүртгэлд ашиглагдаагүй байх ёстой. Солигдсоны дараа хэрэглэгч шинэ имэйлээр дахин нэвтэрнэ. Шинэ хаягийн эзэмшлийг имэйлээр баталгаажуулах холболт одоогоор байхгүй, тиймээс хаягийг хэрэглэгчээс бичгээр авсан эсэхээ шалгана уу.</p>
    <form className="adm-filters adm-filters--stack" onSubmit={e=>{e.preventDefault();void run(()=>adminApi.post(`/users/${id}/email`,{newEmail,confirmNewEmail:confirm,reason:reasonE}),r=>`Имэйл солигдлоо. ${r.sessionsRevoked} сесс таслагдлаа.`,()=>{setNewEmail('');setConfirm('');setReasonE('')})}}>
     <label>Шинэ имэйл<input type="email" value={newEmail} onChange={e=>setNewEmail(e.target.value)} autoComplete="off" required/></label>
     <label>Шинэ имэйлийг давтах<input type="email" value={confirm} onChange={e=>setConfirm(e.target.value)} autoComplete="off" required/></label>
     <label className="adm-filters__wide">Шалтгаан (аудитад бүртгэгдэнэ)<input value={reasonE} onChange={e=>setReasonE(e.target.value)} minLength={8} maxLength={300} required/></label>
     <button type="submit" className="adm-btn adm-btn--primary" disabled={busy||!newEmail||newEmail!==confirm||reasonE.trim().length<8}>Имэйл солих</button></form></section></>}
  {data.companies.map((c:any)=><Entitlements key={c.id} companyId={c.id} name={c.name}/>)}
  {data.companies.length===0&&<section className="adm-card"><Empty text="Энэ хэрэглэгч байгууллагад хамаарахгүй."/></section>}
  <section className="adm-card"><h3>Админы үйлдлийн түүх</h3>{data.adminHistory.length===0?<Empty text="Түүх алга."/>:<ul className="adm-activity">{data.adminHistory.map((h:any,i:number)=><li key={i}><span>{fmt(h.createdAt)}</span> {ACTION_MN[h.action]??h.action} · {h.outcome==='SUCCESS'?'амжилттай':'амжилтгүй'}{h.metadata?.reason?` · ${h.metadata.reason}`:''}</li>)}</ul>}</section>
  <section className="adm-card"><h3>Сүүлийн нэвтрэлтүүд</h3>{data.recentSignIns.length===0?<Empty text="Бүртгэл алга."/>:<ul className="adm-activity">{data.recentSignIns.map((h:any,i:number)=><li key={i}><span>{fmt(h.createdAt)}</span> {h.eventType}</li>)}</ul>}</section>
 </Page>;
}

export default function AdminAccounts({id}:{id:string;query:URLSearchParams;me:AdminMe}){
 const [q,setQ]=useState('');const [applied,setApplied]=useState('');const [status,setStatus]=useState('');const [page,setPage]=useState(1);
 const {loading,error,data,reload}=useAsync(()=>id?Promise.resolve(null):adminApi.get(`/users?page=${page}&pageSize=20${applied?`&q=${encodeURIComponent(applied)}`:''}${status?`&status=${status}`:''}`),[page,applied,status,id]);
 if(id)return <UserDetail id={id}/>;
 return <Page title="Хэрэглэгчид" actions={<button type="button" className="adm-btn" onClick={reload}>Шинэчлэх</button>}>
  <form className="adm-filters" onSubmit={e=>{e.preventDefault();setPage(1);setApplied(q.trim())}} role="search">
   <label>Имэйл эсвэл нэрээр хайх<input value={q} onChange={e=>setQ(e.target.value)} maxLength={100}/></label>
   <label>Төлөв<select value={status} onChange={e=>{setStatus(e.target.value);setPage(1)}}><option value="">Бүгд</option><option value="ACTIVE">Идэвхтэй</option><option value="DISABLED">Идэвхгүй</option></select></label>
   <button type="submit" className="adm-btn adm-btn--primary">Хайх</button></form>
  {loading?<Loading/>:error?<Err text={error} retry={reload}/>:!data||data.items.length===0?<Empty text="Хэрэглэгч олдсонгүй."/>:<>
   <table className="adm-table"><thead><tr><th>Имэйл</th><th>Нэр</th><th>Төлөв</th><th>Байгууллага</th><th>Сүүлд нэвтэрсэн</th></tr></thead><tbody>{data.items.map((u:any)=><tr key={u.id}>
    <td data-label="Имэйл"><a className="adm-link" href={adminHref('users',u.id)}>{u.erased?'(устгагдсан)':u.email}</a>{u.adminRole&&<> <span className="adm-badge adm-badge--warn">Админ</span></>}</td>
    <td data-label="Нэр">{u.displayName??'-'}</td><td data-label="Төлөв"><Badge kind="user" value={u.status} label={USER_STATUS_MN[u.status]??u.status}/></td><td data-label="Байгууллага">{u.companies}</td><td data-label="Сүүлд нэвтэрсэн">{fmt(u.lastLoginAt)}</td></tr>)}</tbody></table>
   <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage}/></>}
 </Page>;
}
