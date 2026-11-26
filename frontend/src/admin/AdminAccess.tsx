import React,{useState} from 'react';
import { adminApi,fmt,DOMAIN_MN,actionMn,type AdminMe } from './adminApi';
import { DOMAIN_ORDER,sortByDomain } from '../data/domainOrder';
import { Page,Empty,Err,Loading,useAsync,adminHref } from './AdminApp';
import { Badge,ConfirmDialog,ROLE_MN } from './AdminUi';

/* "Оношилгооны эрх": for one company, five domains, each either open / used / none. An administrator can GRANT one free diagnosis (no invoice, no revenue,
   a separate origin in the database) or REVOKE an unused administrator grant. Paid access is shown but can never be changed here. */
const DOMAINS:readonly string[]=DOMAIN_ORDER;

function Picker(){
 const [q,setQ]=useState('');const [applied,setApplied]=useState('');
 const {loading,error,data,reload}=useAsync(()=>adminApi.get(`/companies?page=1&pageSize=10${applied?`&q=${encodeURIComponent(applied)}`:''}`),[applied]);
 return <Page title="Оношилгооны эрх">
  <p className="adm-note">Харилцагчийн оношилгооны эрхийг эндээс удирдана. Админы эрх энд олгогдохгүй. Эхлээд компаниа сонгоно уу.</p>
  <form className="adm-filters" onSubmit={e=>{e.preventDefault();setApplied(q.trim())}} role="search"><label>Компанийн нэр эсвэл харилцагчийн имэйл<input value={q} onChange={e=>setQ(e.target.value)} maxLength={100}/></label><button type="submit" className="adm-btn adm-btn--primary">Хайх</button></form>
  {loading?<Loading/>:error?<Err text={error} retry={reload}/>:!data||data.items.length===0?<Empty text="Компани олдсонгүй."/>:<ul className="adm-list adm-pick">{data.items.map((c:any)=><li key={c.id}><a className="adm-link" href={adminHref('access')+`?company=${c.id}`}>{c.name}</a> <small>{(c.customers??[]).join(', ')||'Харилцагч алга'}</small>
   <span className="adm-pick__access">{(c.access??[]).length?sortByDomain(c.access as any[],a=>a.domain).map(a=><Badge key={a.domain+a.origin} tone={a.origin==='ADMIN_GRANT'?'warn':'ok'}>{(DOMAIN_MN as any)[a.domain]??a.domain} · {a.origin==='ADMIN_GRANT'?'олгосон':'төлбөртэй'}</Badge>):<Badge tone="mute">Нээлттэй эрхгүй</Badge>}</span></li>)}</ul>}
 </Page>;
}

function CompanyAccess({companyId}:{companyId:string}){
 const {loading,error,data,reload}=useAsync(()=>adminApi.get(`/companies/${companyId}/entitlements`),[companyId]);
 const [dlg,setDlg]=useState<{kind:'grant'|'revoke';domain:string;entId?:string}|null>(null);const [msg,setMsg]=useState('');const [noPayment,setNoPayment]=useState(false);const [authRef,setAuthRef]=useState('');
 if(loading&&!data)return <Page title="Оношилгооны эрх"><Loading/></Page>;if(error||!data)return <Page title="Оношилгооны эрх"><Err text={error} retry={reload}/></Page>;
 const ents:any[]=data.entitlements;const running:string[]=data.runningDomains;const cname=data.company.name??'(устгагдсан)';
 const stateOf=(d:string)=>{const open=ents.find(e=>e.domainCode===d&&e.status==='ACTIVE');if(open)return {kind:'open' as const,ent:open};if(running.includes(d)){const latest=ents.find(e=>e.domainCode===d&&(e.status==='CONSUMED'||e.status==='REVOKED'));return {kind:'running' as const,ent:latest}}return {kind:'none' as const}};
 const dn=(d:string)=>(DOMAIN_MN as any)[d]??d;
 /* Open invoices of one category are shown for information only. They never block an administrator decision: a waiting QPay code is retired through the verified cancellation flow after the grant (a payment that still arrives is recorded once), a manual one can be cancelled together with the grant after the bank statement was checked. */
 const openOf=(d:string):any[]=>(data.openInvoices??[]).filter((i:any)=>i.domainCode===d);
  const invLine=(i:any)=>`${i.provider==='MANUAL'?'Гар төлбөр':i.provider} · ${new Intl.NumberFormat('mn-MN').format(i.amountMnt)} ₮ · ${fmt(i.createdAt)}`;
 const openGrant=(d:string)=>{setNoPayment(false);setAuthRef('');setDlg({kind:'grant',domain:d})};
 const toCancel=dlg?.kind==='grant'?openOf(dlg.domain).filter(i=>i.provider==='MANUAL'):[];
 const qpayWaiting=dlg?.kind==='grant'?openOf(dlg.domain).filter(i=>i.provider!=='MANUAL'):[];
 return <Page title="Оношилгооны эрх" actions={<a className="adm-btn" href={adminHref('access')}>Өөр компани сонгох</a>}>
  <section className="adm-card"><h2>{cname}</h2><p className="adm-sub">Харилцагч: {(data.customers??[]).length?(data.customers as any[]).map(m=>`${m.email} (${ROLE_MN[m.role]??m.role})`).join(', '):'алга'}</p><p className="adm-note">Чиглэл бүрийн оношилгоог эхлүүлэх эрх. Эрх олгоход төлбөр үүсэхгүй, орлого болохгүй. Энэ нь админы эрх биш.</p></section>
  {msg&&<div className="adm-note adm-note--ok" role="status">{msg}</div>}
  {data.company.erased?<Empty text="Устгагдсан компанид эрх олгохгүй."/>:<div className="adm-domains">{DOMAINS.map(d=>{const st=stateOf(d);const e=(st as any).ent;return <section key={d} className="adm-card adm-domain" data-area={d}>
   <h3><i className="mmri-domain__mark" aria-hidden="true"/>{dn(d)}</h3>
   {st.kind==='open'?<><Badge tone="ok">Эрх нээлттэй</Badge><p>{e.origin==='ADMIN_GRANT'?<>Админ олгосон{e.grantedBy?` (${e.grantedBy})`:''}. Шалтгаан: {e.grantReason}</>:'Төлбөр төлөгдсөн эрх.'}</p>
     {e.origin!=='ADMIN_GRANT'&&<p className="adm-sub">Харилцагч худалдаж авсан. Цуцалбал зөвхөн хандах эрх хаагдана, төлбөрийн бүртгэл хэвээр хадгалагдана.</p>}{e.revocable&&<button type="button" className="adm-btn adm-btn--danger" onClick={()=>setDlg({kind:'revoke',domain:d,entId:e.id})}>Эрх цуцлах</button>}</>
    :st.kind==='running'?(e&&e.status==='REVOKED'?<><Badge tone="bad">Эрх цуцлагдсан, оношилгоо хагас</Badge><p>Хадгалсан хариултууд хэвээр. Эрх дахин олговол харилцагч үргэлжлүүлнэ.</p><button type="button" className="adm-btn adm-btn--primary" onClick={()=>openGrant(d)}>Эрх дахин олгох</button></>:<><Badge tone="warn">Оношилгоо явагдаж байна</Badge><p>Хариулт хадгалагдсан байж болно. Цуцалбал шинэ хариулт хүлээн авахгүй, хадгалсан хариулт устахгүй.</p>{e&&<button type="button" className="adm-btn adm-btn--danger" onClick={()=>setDlg({kind:'revoke',domain:d,entId:e.id})}>Эрх цуцлах</button>}</>)
    :<><Badge tone="mute">Эрх байхгүй</Badge><p>Энэ чиглэлд эхлүүлэх эрх одоогоор алга.</p>{openOf(d).map(i=><p key={i.id} className="adm-sub">Нээлттэй нэхэмжлэх: {invLine(i)}</p>)}
     <button type="button" className="adm-btn adm-btn--primary" onClick={()=>openGrant(d)}>Эрх олгох</button></>}
  </section>})}</div>}
  <details className="adm-card adm-fold"><summary><h2>Түүх</h2></summary>{data.history.length===0&&ents.length===0?<Empty text="Түүх алга."/>:<ul className="adm-activity">
   {ents.map((e:any)=><li key={e.id}><span>{fmt(e.createdAt)}</span> {dn(e.domainCode)} · {e.origin==='ADMIN_GRANT'?'админ олгосон':'төлбөртэй'} · {e.status==='ACTIVE'?'нээлттэй':e.status==='CONSUMED'?'ашиглагдсан':e.status==='REVOKED'?'цуцлагдсан':'дууссан'}{e.revokeReason?` · ${e.revokeReason}`:''}</li>)}
   {data.history.map((h:any,i:number)=><li key={'h'+i}><span>{fmt(h.createdAt)}</span> {actionMn(h.action)}{h.outcome==='SUCCESS'?'':' (амжилтгүй)'}{h.metadata?.reason?` · ${h.metadata.reason}`:''}</li>)}</ul>}</details>
  {dlg?.kind==='grant'&&<ConfirmDialog title={`«${dn(dlg.domain)}» чиглэлийн эрх олгох уу?`} confirmLabel="Эрх олгох" onCancel={()=>setDlg(null)}
   reasonOptional canSubmit={(!toCancel.length||noPayment)&&(!data.pilotAuthorizationRequired||authRef.trim().length>=4)}
   extra={<>{qpayWaiting.length>0&&<div className="adm-note"><b>QPay төлбөр хүлээгдэж байна:</b>{qpayWaiting.map(i=><div key={i.id}>{invLine(i)}</div>)}<small>Эрх олгоход нөлөөлөхгүй. Систем QR-ийг QPay-ээр шалгаад цуцлахыг оролдоно. Төлөгдсөн бол нэг удаа бүртгэнэ.</small></div>}{toCancel.length>0&&<div className="adm-note"><b>Нээлттэй гар төлбөрийн нэхэмжлэх байна:</b>{toCancel.map(i=><div key={i.id}>{invLine(i)}</div>)}<label className="adm-check"><input type="checkbox" checked={noPayment} onChange={e=>setNoPayment(e.target.checked)}/><span>Банкны хуулгаас төлбөр ороогүйг шалгасан. Энэ нэхэмжлэхийг цуцалж эрх олгоно.</span></label><small>Харилцагч төлсөн бол эрх олгохын оронд «Төлбөрүүд» хэсэгт төлбөрийг баталгаажуулна.</small></div>}
    {data.pilotAuthorizationRequired&&<label>Пилотын зөвшөөрлийн лавлагаа<input value={authRef} onChange={e=>setAuthRef(e.target.value)} maxLength={120} autoComplete="off"/></label>}</>}
   onConfirm={async reason=>{await adminApi.post(`/companies/${companyId}/entitlements/grant`,{domainCode:dlg.domain,reason,...(toCancel.length?{cancelInvoiceIds:toCancel.map(i=>i.id)}:{}),...(data.pilotAuthorizationRequired?{authorizationRef:authRef.trim()}:{})});setDlg(null);setMsg(`«${dn(dlg.domain)}» чиглэлийн эрх олгогдлоо. Харилцагчид мэдэгдэл илгээгдсэн.`);reload()}}>
   <ul><li><b>{cname}</b> компани энэ чиглэлийн оношилгоог нэг удаа шууд эхлүүлж чадна.</li><li>Төлбөрийн бичилт үүсэхгүй, орлого болохгүй.</li><li>Харилцагчид «Оношилгоонд хандах эрх олгогдлоо» мэдэгдэл автоматаар очно.</li><li>Хэн олгосон нь хадгалагдана.</li></ul></ConfirmDialog>}
  {dlg?.kind==='revoke'&&<ConfirmDialog reasonOptional title={`«${dn(dlg.domain)}» чиглэлийн эрхийг цуцлах уу?`} confirmLabel="Эрх цуцлах" danger onCancel={()=>setDlg(null)}
   onConfirm={async reason=>{await adminApi.post(`/entitlements/${dlg.entId}/revoke`,{reason});setDlg(null);setMsg(`«${dn(dlg.domain)}» чиглэлийн эрх цуцлагдлаа. Харилцагчид мэдэгдэл илгээгдсэн.`);reload()}}>
   <ul><li>Хандах эрх даруй хаагдана. Эхэлсэн оношилгооны хадгалсан хариулт, төлбөрийн бүртгэл, дууссан тайлан устахгүй.</li><li>Эрхийг дахин олговол харилцагч хариултаа үргэлжлүүлнэ.</li><li>Харилцагчид мэдэгдэл автоматаар очно.</li></ul></ConfirmDialog>}
 </Page>;
}

export default function AdminAccess({query}:{id:string;query:URLSearchParams;me:AdminMe}){
 const company=query.get('company');return company?<CompanyAccess companyId={company}/>:<Picker/>;
}
