import React,{useState} from 'react';
import { adminApi,fmt,DOMAIN_MN,type AdminMe } from './adminApi';
import { Page,Empty,Err,Loading,useAsync,adminHref } from './AdminApp';
import { Badge,ConfirmDialog } from './AdminUi';

/* "Оношилгооны эрх": for one company, five domains, each either open / used / none. An administrator can GRANT one free diagnosis (no invoice, no revenue,
   a separate origin in the database) or REVOKE an unused administrator grant. Paid access is shown but can never be changed here. */
const DOMAINS=['marketing','it','finance','people','operations'];
const ACTION_MN:Record<string,string>={ADMIN_ENTITLEMENT_GRANTED:'Эрх олгосон',ADMIN_ENTITLEMENT_REVOKED:'Эрх цуцалсан'};

function Picker(){
 const [q,setQ]=useState('');const [applied,setApplied]=useState('');
 const {loading,error,data,reload}=useAsync(()=>adminApi.get(`/companies?page=1&pageSize=10${applied?`&q=${encodeURIComponent(applied)}`:''}`),[applied]);
 return <Page title="Оношилгооны эрх">
  <p className="adm-note">Эхлээд компаниа сонгоно уу.</p>
  <form className="adm-filters" onSubmit={e=>{e.preventDefault();setApplied(q.trim())}} role="search"><label>Компанийн нэрээр хайх<input value={q} onChange={e=>setQ(e.target.value)} maxLength={100}/></label><button type="submit" className="adm-btn adm-btn--primary">Хайх</button></form>
  {loading?<Loading/>:error?<Err text={error} retry={reload}/>:!data||data.items.length===0?<Empty text="Компани олдсонгүй."/>:<ul className="adm-list adm-pick">{data.items.map((c:any)=><li key={c.id}><a className="adm-link" href={adminHref('access')+`?company=${c.id}`}>{c.name}</a> <small>{c.industry||''}</small></li>)}</ul>}
 </Page>;
}

function CompanyAccess({companyId}:{companyId:string}){
 const {loading,error,data,reload}=useAsync(()=>adminApi.get(`/companies/${companyId}/entitlements`),[companyId]);
 const [dlg,setDlg]=useState<{kind:'grant'|'revoke';domain:string;entId?:string}|null>(null);const [msg,setMsg]=useState('');
 if(loading&&!data)return <Page title="Оношилгооны эрх"><Loading/></Page>;if(error||!data)return <Page title="Оношилгооны эрх"><Err text={error} retry={reload}/></Page>;
 const ents:any[]=data.entitlements;const running:string[]=data.runningDomains;const cname=data.company.name??'(устгагдсан)';
 const stateOf=(d:string)=>{const open=ents.find(e=>e.domainCode===d&&e.status==='ACTIVE');if(open)return {kind:'open' as const,ent:open};if(running.includes(d))return {kind:'running' as const};return {kind:'none' as const}};
 const dn=(d:string)=>(DOMAIN_MN as any)[d]??d;
 return <Page title="Оношилгооны эрх" actions={<a className="adm-btn" href={adminHref('access')}>Өөр компани сонгох</a>}>
  <section className="adm-card"><h2>{cname}</h2><p className="adm-note">Чиглэл бүрийн оношилгоог эхлүүлэх эрх. Эрх олгоход төлбөр үүсэхгүй, орлого болохгүй.</p></section>
  {msg&&<div className="adm-note adm-note--ok" role="status">{msg}</div>}
  {data.company.erased?<Empty text="Устгагдсан компанид эрх олгохгүй."/>:<div className="adm-domains">{DOMAINS.map(d=>{const st=stateOf(d);const e=(st as any).ent;return <section key={d} className="adm-card adm-domain" data-area={d}>
   <h3><i className="mmri-domain__mark" aria-hidden="true"/>{dn(d)}</h3>
   {st.kind==='open'?<><Badge tone="ok">Эрх нээлттэй</Badge><p>{e.origin==='ADMIN_GRANT'?<>Админ олгосон{e.grantedBy?` (${e.grantedBy})`:''}. Шалтгаан: {e.grantReason}</>:'Төлбөр төлөгдсөн эрх.'}</p>
     {e.revocable?<button type="button" className="adm-btn adm-btn--danger" onClick={()=>setDlg({kind:'revoke',domain:d,entId:e.id})}>Эрх цуцлах</button>:<p className="adm-sub">{e.origin==='ADMIN_GRANT'?'Ашиглагдсан тул цуцлах боломжгүй.':'Төлбөртэй эрхийг энд цуцлахгүй.'}</p>}</>
    :st.kind==='running'?<><Badge tone="warn">Оношилгоо явагдаж байна</Badge><p>Дуустал шинэ эрх олгохгүй.</p></>
    :<><Badge tone="mute">Эрх байхгүй</Badge><p>Энэ чиглэлд эхлүүлэх эрх одоогоор алга.</p><button type="button" className="adm-btn adm-btn--primary" onClick={()=>setDlg({kind:'grant',domain:d})}>Эрх олгох</button></>}
  </section>})}</div>}
  <details className="adm-card adm-fold"><summary><h2>Түүх</h2></summary>{data.history.length===0&&ents.length===0?<Empty text="Түүх алга."/>:<ul className="adm-activity">
   {ents.map((e:any)=><li key={e.id}><span>{fmt(e.createdAt)}</span> {dn(e.domainCode)} · {e.origin==='ADMIN_GRANT'?'админ олгосон':'төлбөртэй'} · {e.status==='ACTIVE'?'нээлттэй':e.status==='CONSUMED'?'ашиглагдсан':e.status==='REVOKED'?'цуцлагдсан':'дууссан'}{e.revokeReason?` · ${e.revokeReason}`:''}</li>)}
   {data.history.map((h:any,i:number)=><li key={'h'+i}><span>{fmt(h.createdAt)}</span> {ACTION_MN[h.action]??h.action}{h.outcome==='SUCCESS'?'':' (амжилтгүй)'}{h.metadata?.reason?` · ${h.metadata.reason}`:''}</li>)}</ul>}</details>
  {dlg?.kind==='grant'&&<ConfirmDialog title={`«${dn(dlg.domain)}» чиглэлийн эрх олгох уу?`} confirmLabel="Эрх олгох" onCancel={()=>setDlg(null)}
   onConfirm={async reason=>{await adminApi.post(`/companies/${companyId}/entitlements/grant`,{domainCode:dlg.domain,reason});setDlg(null);setMsg(`«${dn(dlg.domain)}» чиглэлийн нэг удаагийн эрх олгогдлоо.`);reload()}}>
   <ul><li><b>{cname}</b> компани энэ чиглэлийн оношилгоог нэг удаа шууд эхлүүлж чадна.</li><li>Төлбөрийн бичилт үүсэхгүй, орлого болохгүй.</li><li>Хэн, яагаад олгосон нь хадгалагдана.</li></ul></ConfirmDialog>}
  {dlg?.kind==='revoke'&&<ConfirmDialog title={`«${dn(dlg.domain)}» чиглэлийн эрхийг цуцлах уу?`} confirmLabel="Эрх цуцлах" danger onCancel={()=>setDlg(null)}
   onConfirm={async reason=>{await adminApi.post(`/entitlements/${dlg.entId}/revoke`,{reason});setDlg(null);setMsg(`«${dn(dlg.domain)}» чиглэлийн эрх цуцлагдлаа.`);reload()}}>
   <ul><li>Зөвхөн ашиглагдаагүй, админ олгосон эрх цуцлагдана.</li><li>Эхэлсэн оношилгоо, төлбөр, тайланд нөлөөлөхгүй.</li></ul></ConfirmDialog>}
 </Page>;
}

export default function AdminAccess({query}:{id:string;query:URLSearchParams;me:AdminMe}){
 const company=query.get('company');return company?<CompanyAccess companyId={company}/>:<Picker/>;
}
