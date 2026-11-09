import React,{useState} from 'react';
import { adminApi,fmt,type AdminMe } from './adminApi';
import { Page,Empty,Err,Loading,Pager,useAsync,adminHref } from './AdminApp';
import { Badge,ConfirmDialog,ROLE_MN,USER_STATUS_MN,SIGNIN_MN } from './AdminUi';

/* "Хэрэглэгчид": find a person, see who they are, deactivate/reactivate them, correct their e-mail. Every button calls a real server route
   (backend/src/api/admin/account-routes.ts); the server checks permission, a fresh re-authentication, writes the audit trail and revokes sessions. */
const ACTION_MN:Record<string,string>={ADMIN_USER_EMAIL_CHANGED:'Имэйл солисон',ADMIN_USER_DEACTIVATED:'Идэвхгүй болгосон',ADMIN_USER_ACTIVATED:'Идэвхжүүлсэн'};

function UserDetail({id}:{id:string}){
 const {loading,error,data,reload}=useAsync(()=>adminApi.get(`/users/${id}`),[id]);
 const [dlg,setDlg]=useState<''|'status'|'email'>('');const [newEmail,setNewEmail]=useState('');const [confirm,setConfirm]=useState('');const [msg,setMsg]=useState('');
 if(loading&&!data)return <Page title="Хэрэглэгч"><Loading/></Page>;if(error||!data)return <Page title="Хэрэглэгч"><Err text={error} retry={reload}/></Page>;
 const u=data.user;const locked=!!u.erased||!!u.adminRole;const active=u.status==='ACTIVE';
 const done=(t:string)=>{setDlg('');setMsg(t);setNewEmail('');setConfirm('');reload()};
 return <Page title={u.erased?'Устгагдсан бүртгэл':(u.displayName||u.email||'Хэрэглэгч')} actions={<a className="adm-btn" href={adminHref('users')}>‹ Хэрэглэгчид</a>}>
  {msg&&<div className="adm-note adm-note--ok" role="status">{msg}</div>}
  <section className="adm-card"><dl className="adm-dl"><dt>Имэйл</dt><dd>{u.email??'-'}</dd><dt>Төлөв</dt><dd><Badge tone={active?'ok':'bad'}>{USER_STATUS_MN[u.status]??u.status}</Badge>{u.erased&&<> <Badge tone="mute">Устгагдсан</Badge></>}{u.adminRole&&<> <Badge tone="warn">Админ</Badge></>}</dd>
   <dt>Бүртгүүлсэн</dt><dd>{fmt(u.createdAt)}</dd><dt>Сүүлд нэвтэрсэн</dt><dd>{u.lastLoginAt?fmt(u.lastLoginAt):'Нэвтэрч байгаагүй'}</dd></dl>
   {locked?<p className="adm-note">{u.erased?'Бүртгэл хэрэглэгчийн хүсэлтээр устгагдсан тул өөрчлөх боломжгүй.':'Админ бүртгэлийг «Бусад» → «Тохиргоо» хэсгээс удирдана.'}</p>
    :<div className="adm-actions__row"><button type="button" className={`adm-btn ${active?'adm-btn--danger':'adm-btn--primary'}`} onClick={()=>setDlg('status')}>{active?'Идэвхгүй болгох':'Идэвхжүүлэх'}</button><button type="button" className="adm-btn" onClick={()=>setDlg('email')}>Имэйл солих</button></div>}</section>
  <section className="adm-card"><h2>Компани</h2>{data.companies.length===0?<Empty text="Энэ хэрэглэгч ямар ч компанид хамаарахгүй."/>:<ul className="adm-list">{data.companies.map((c:any)=><li key={c.id}><a className="adm-link" href={adminHref('companies',c.id)}>{c.name??'(устгагдсан)'}</a> <small>{ROLE_MN[c.role]??c.role}</small> · <a className="adm-link" href={adminHref('access')+`?company=${c.id}`}>Оношилгооны эрх</a></li>)}</ul>}</section>
  <details className="adm-card adm-fold"><summary><h2>Түүх</h2></summary>
   {data.adminHistory.length===0?<Empty text="Админы өөрчлөлт хийгдээгүй байна."/>:<ul className="adm-activity">{data.adminHistory.map((h:any,i:number)=><li key={i}><span>{fmt(h.createdAt)}</span> {ACTION_MN[h.action]??h.action}{h.outcome==='SUCCESS'?'':' (амжилтгүй)'}{h.metadata?.reason?` · ${h.metadata.reason}`:''}</li>)}</ul>}
   {data.recentSignIns.length>0&&<><h3>Сүүлийн нэвтрэлт</h3><ul className="adm-activity">{data.recentSignIns.map((h:any,i:number)=><li key={i}><span>{fmt(h.createdAt)}</span> {SIGNIN_MN[h.eventType]??'Үйлдэл'}</li>)}</ul></>}</details>
  {dlg==='status'&&<ConfirmDialog title={active?'Энэ хэрэглэгчийг идэвхгүй болгох уу?':'Энэ хэрэглэгчийг идэвхжүүлэх үү?'} confirmLabel={active?'Идэвхгүй болгох':'Идэвхжүүлэх'} danger={active} onCancel={()=>setDlg('')}
   onConfirm={async reason=>{const r=await adminApi.post(`/users/${id}/status`,{status:active?'DISABLED':'ACTIVE',reason});done(r.status==='DISABLED'?'Хэрэглэгч идэвхгүй боллоо.':'Хэрэглэгч идэвхжлээ.')}}>
   {active?<ul><li>Хэрэглэгч системд нэвтрэх боломжгүй болно.</li><li>Нэвтэрсэн бүх төхөөрөмжөөс гарна.</li><li>Мэдээлэл, төлбөр, тайлан <b>устахгүй</b>.</li><li>Дараа нь дахин идэвхжүүлж болно.</li></ul>:<ul><li>Хэрэглэгч дахин нэвтэрч чадна.</li></ul>}</ConfirmDialog>}
  {dlg==='email'&&<ConfirmDialog title="Имэйл хаяг солих" confirmLabel="Имэйл солих" canSubmit={!!newEmail&&newEmail===confirm} onCancel={()=>setDlg('')}
   extra={<><label>Шинэ имэйл<input type="email" value={newEmail} onChange={e=>setNewEmail(e.target.value)} autoComplete="off" required/></label><label>Шинэ имэйлийг давтах<input type="email" value={confirm} onChange={e=>setConfirm(e.target.value)} autoComplete="off" required/></label></>}
   onConfirm={async reason=>{await adminApi.post(`/users/${id}/email`,{newEmail,confirmNewEmail:confirm,reason});done('Имэйл солигдлоо. Хэрэглэгч шинэ имэйлээр дахин нэвтэрнэ.')}}>
   <ul><li>Хэрэглэгч шинэ имэйлээр нэвтэрнэ, хуучин имэйл ажиллахгүй.</li><li>Нэвтэрсэн төхөөрөмжүүдээс гарна.</li><li>Шинэ хаяг өөр хэрэглэгчид ашиглагдаагүй байх ёстой.</li><li>Шинэ хаягийн эзэмшлийг системээс баталгаажуулдаггүй тул хэрэглэгчээс бичгээр авсан эсэхээ шалгана уу.</li></ul></ConfirmDialog>}
 </Page>;
}

export default function AdminAccounts({id}:{id:string;query:URLSearchParams;me:AdminMe}){
 const [q,setQ]=useState('');const [applied,setApplied]=useState('');const [page,setPage]=useState(1);
 const {loading,error,data,reload}=useAsync(()=>id?Promise.resolve(null):adminApi.get(`/users?page=${page}&pageSize=20${applied?`&q=${encodeURIComponent(applied)}`:''}`),[page,applied,id]);
 if(id)return <UserDetail id={id}/>;
 return <Page title="Хэрэглэгчид">
  <form className="adm-filters" onSubmit={e=>{e.preventDefault();setPage(1);setApplied(q.trim())}} role="search"><label>Имэйл эсвэл нэрээр хайх<input value={q} onChange={e=>setQ(e.target.value)} maxLength={100} placeholder="Жишээ: bat@company.mn"/></label><button type="submit" className="adm-btn adm-btn--primary">Хайх</button></form>
  {loading?<Loading/>:error?<Err text={error} retry={reload}/>:!data||data.items.length===0?<Empty text="Хэрэглэгч олдсонгүй."/>:<>
   <table className="adm-table"><thead><tr><th>Хэрэглэгч</th><th>Төлөв</th><th>Компани</th></tr></thead><tbody>{data.items.map((u:any)=><tr key={u.id}>
    <td data-label="Хэрэглэгч"><a className="adm-link" href={adminHref('users',u.id)}>{u.erased?'(устгагдсан)':u.email}</a>{u.displayName&&<small className="adm-sub">{u.displayName}</small>}{u.adminRole&&<> <Badge tone="warn">Админ</Badge></>}</td>
    <td data-label="Төлөв"><Badge tone={u.status==='ACTIVE'?'ok':'bad'}>{USER_STATUS_MN[u.status]??u.status}</Badge></td><td data-label="Компани">{u.companies}</td></tr>)}</tbody></table>
   <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage}/></>}
 </Page>;
}
