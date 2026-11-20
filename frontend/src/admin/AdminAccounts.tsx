import React,{useState} from 'react';
import { adminApi,fmt,DOMAIN_MN,actionMn,type AdminMe } from './adminApi';
import { sortByDomain } from '../data/domainOrder';
import { Page,Empty,Err,Loading,Pager,useAsync,adminHref } from './AdminApp';
import { Badge,ConfirmDialog,ROLE_MN,USER_STATUS_MN,SIGNIN_MN } from './AdminUi';

/* "Хэрэглэгчид": find a person, see who they are, deactivate/reactivate them, correct their e-mail. Every button calls a real server route
   (backend/src/api/admin/account-routes.ts); the server checks permission, a fresh re-authentication, writes the audit trail and revokes sessions. */

function UserDetail({id}:{id:string}){
 const {loading,error,data,reload}=useAsync(()=>adminApi.get(`/users/${id}`),[id]);
 const [dlg,setDlg]=useState<''|'status'|'email'>('');const [newEmail,setNewEmail]=useState('');const [confirm,setConfirm]=useState('');const [msg,setMsg]=useState('');
 if(loading&&!data)return <Page title="Хэрэглэгч"><Loading/></Page>;if(error||!data)return <Page title="Хэрэглэгч"><Err text={error} retry={reload}/></Page>;
 const u=data.user;const locked=!!u.erased||!!u.adminRole;const active=u.status==='ACTIVE';
 const done=(t:string)=>{setDlg('');setMsg(t);setNewEmail('');setConfirm('');reload()};
 return <Page title={u.erased?'Устгагдсан бүртгэл':(u.displayName||u.email||'Хэрэглэгч')} actions={<a className="adm-btn" href={adminHref('users')}>‹ Хэрэглэгчид</a>}>
  {msg&&<div className="adm-note adm-note--ok" role="status">{msg}</div>}
  <section className="adm-card"><dl className="adm-dl"><dt>Имэйл</dt><dd>{u.email??'-'}</dd><dt>Имэйл баталгаажуулалт</dt><dd>{u.emailVerifiedAt?"Баталгаажсан":u.emailVerificationRequired?"Хүлээгдэж байна":"Өмнөх бүртгэл"}</dd><dt>Төлөв</dt><dd><Badge tone={active?'ok':'bad'}>{USER_STATUS_MN[u.status]??u.status}</Badge>{u.erased&&<> <Badge tone="mute">Устгагдсан</Badge></>}{u.adminRole&&<> <Badge tone="warn">Админ</Badge></>}</dd>
   <dt>Бүртгүүлсэн</dt><dd>{fmt(u.createdAt)}</dd><dt>Сүүлд нэвтэрсэн</dt><dd>{u.lastLoginAt?fmt(u.lastLoginAt):'Нэвтэрч байгаагүй'}</dd></dl>
   {locked?<p className="adm-note">{u.erased?'Бүртгэл хэрэглэгчийн хүсэлтээр устгагдсан тул өөрчлөх боломжгүй.':'Админ бүртгэлийг «Бусад» → «Тохиргоо» хэсгээс удирдана.'}</p>
    :<div className="adm-actions__row"><button type="button" className={`adm-btn ${active?'adm-btn--danger':'adm-btn--primary'}`} onClick={()=>setDlg('status')}>{active?'Идэвхгүй болгох':'Идэвхжүүлэх'}</button><button type="button" className="adm-btn" onClick={()=>setDlg('email')}>Имэйл солих</button></div>}</section>
  <section className="adm-card"><h2>Компани</h2>{data.companies.length===0?<Empty text="Энэ хэрэглэгч ямар ч компанид хамаарахгүй."/>:<ul className="adm-list">{data.companies.map((c:any)=><li key={c.id}><a className="adm-link" href={adminHref('companies',c.id)}>{c.name??'(устгагдсан)'}</a> <small>{ROLE_MN[c.role]??c.role}</small> · <a className="adm-link" href={adminHref('access')+`?company=${c.id}`}>Оношилгооны эрх</a></li>)}</ul>}</section>
  <details className="adm-card adm-fold"><summary><h2>Түүх</h2></summary>
   {data.adminHistory.length===0?<Empty text="Админы өөрчлөлт хийгдээгүй байна."/>:<ul className="adm-activity">{data.adminHistory.map((h:any,i:number)=><li key={i}><span>{fmt(h.createdAt)}</span> {actionMn(h.action)}{h.outcome==='SUCCESS'?'':' (амжилтгүй)'}{h.metadata?.reason?` · ${h.metadata.reason}`:''}</li>)}</ul>}
   {data.recentSignIns.length>0&&<><h3>Сүүлийн нэвтрэлт</h3><ul className="adm-activity">{data.recentSignIns.map((h:any,i:number)=><li key={i}><span>{fmt(h.createdAt)}</span> {SIGNIN_MN[h.eventType]??'Үйлдэл'}</li>)}</ul></>}</details>
  {dlg==='status'&&<ConfirmDialog title={active?'Энэ хэрэглэгчийг идэвхгүй болгох уу?':'Энэ хэрэглэгчийг идэвхжүүлэх үү?'} confirmLabel={active?'Идэвхгүй болгох':'Идэвхжүүлэх'} danger={active} onCancel={()=>setDlg('')}
   onConfirm={async reason=>{const r=await adminApi.post(`/users/${id}/status`,{status:active?'DISABLED':'ACTIVE',reason});done(r.status==='DISABLED'?'Хэрэглэгч идэвхгүй боллоо.':'Хэрэглэгч идэвхжлээ.')}}>
   {active?<ul><li>Хэрэглэгч системд нэвтрэх боломжгүй болно.</li><li>Нэвтэрсэн бүх төхөөрөмжөөс гарна.</li><li>Мэдээлэл, төлбөр, тайлан <b>устахгүй</b>.</li><li>Дараа нь дахин идэвхжүүлж болно.</li></ul>:<ul><li>Хэрэглэгч дахин нэвтэрч чадна.</li></ul>}</ConfirmDialog>}
  {dlg==='email'&&<ConfirmDialog title="Имэйл хаяг солих" confirmLabel="Имэйл солих" canSubmit={!!newEmail&&newEmail===confirm} onCancel={()=>setDlg('')}
   extra={<><label>Шинэ имэйл<input type="email" value={newEmail} onChange={e=>setNewEmail(e.target.value)} autoComplete="off" required/></label><label>Шинэ имэйлийг давтах<input type="email" value={confirm} onChange={e=>setConfirm(e.target.value)} autoComplete="off" required/></label></>}
   onConfirm={async reason=>{await adminApi.post(`/users/${id}/email`,{newEmail,confirmNewEmail:confirm,reason});done('Имэйл солигдлоо. Хэрэглэгч нэвтрэх хуудаснаас шинэ имэйлээ баталгаажуулж, нууц үгээ тогтооно.')}}>
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
   <div className="adm-scroll"><table className="adm-table adm-table--wide"><thead><tr><th>Хэрэглэгч</th><th>Компани</th><th>Төлөв</th><th>Оношилгооны эрх</th><th>Оношилгоо</th><th>Төлбөр</th><th>Тайлан</th><th>Бүртгүүлсэн</th></tr></thead><tbody>{data.items.map((u:any)=><tr key={u.id}>
    <td data-label="Хэрэглэгч"><a className="adm-link" href={adminHref('users',u.id)}>{u.erased?'(устгагдсан)':u.email}</a>{u.displayName&&<small className="adm-sub">{u.displayName}</small>}{u.adminRole&&<> <Badge tone="warn">Админ</Badge></>}</td>
    <td data-label="Компани">{(u.companyNames??[]).length?(u.companyNames as string[]).join(', '):<span className="adm-sub">-</span>}</td>
    <td data-label="Төлөв"><Badge tone={u.status==='ACTIVE'?'ok':'bad'}>{USER_STATUS_MN[u.status]??u.status}</Badge>{u.emailVerificationRequired&&!u.emailVerifiedAt&&<small className="adm-sub">Имэйл баталгаажаагүй</small>}</td>
    <td data-label="Оношилгооны эрх">{(u.domains??[]).length?sortByDomain(u.domains as any[],d=>d.domain).map(d=><Badge key={d.domain} tone={d.origin==='ADMIN_GRANT'?'warn':'ok'}>{(DOMAIN_MN as any)[d.domain]??d.domain}{d.origin==='ADMIN_GRANT'?' · олгосон':''}</Badge>):<Badge tone="mute">Эрхгүй</Badge>}</td>
    <td data-label="Оношилгоо">{u.diagnoses?.inProgress?<Badge tone="warn">{u.diagnoses.inProgress} явагдаж буй</Badge>:null}{u.diagnoses?.completed?<Badge tone="ok">{u.diagnoses.completed} дууссан</Badge>:null}{!u.diagnoses?.inProgress&&!u.diagnoses?.completed&&<span className="adm-sub">-</span>}</td>
    <td data-label="Төлбөр">{u.payments?.paid?<Badge tone="ok">Төлөгдсөн {u.payments.paid}</Badge>:null}{u.payments?.pending?<Badge tone="warn">Хүлээгдэж буй {u.payments.pending}</Badge>:null}{u.payments?.failed?<Badge tone="bad">Амжилтгүй {u.payments.failed}</Badge>:null}{!u.payments?.paid&&!u.payments?.pending&&!u.payments?.failed&&<span className="adm-sub">-</span>}</td>
    <td data-label="Тайлан">{u.reports?.pending?<Badge tone="warn">Хянагдаж буй {u.reports.pending}</Badge>:null}{u.reports?.published?<Badge tone="ok">Илгээсэн {u.reports.published}</Badge>:null}{!u.reports?.pending&&!u.reports?.published&&<span className="adm-sub">-</span>}</td>
    <td data-label="Бүртгүүлсэн">{fmt(u.createdAt)}</td></tr>)}</tbody></table></div>
   <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage}/></>}
 </Page>;
}
