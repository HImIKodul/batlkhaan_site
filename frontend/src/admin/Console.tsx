import React,{useEffect,useMemo,useState} from 'react';
import { adminApi,adminSession,countdown,fmtUb,fmtUbDate,AdminApiError } from './adminApi';
import { Page,Empty,Err,Loading,useAsync,adminHref } from './AdminApp';
import { PasswordInput } from '../components/PasswordInput';
import { areaReportPalette } from '../data/reportExperience';
import type { BusinessAreaId } from '../data/businessEvaluation';

/* The two consoles. Sadmin: ADMIN SHIT / PAYMENTS / DATA. Admin: ХЯНАХ ТАЙЛАН / ДУУССАН ТАЙЛАН. Every list is a plain numbered table; all decisions are made by the server. */
const DOMAIN_SHORT:Record<string,string>={marketing:'МАРКЕТИНГ (MKT)',it:'МЭДЭЭЛЛИЙН ТЕХНОЛОГИ (IT)',finance:'САНХҮҮ (FIN)',people:'ХҮНИЙ НӨӨЦ (HR)',operations:'ҮЙЛДВЭРЛЭЛ & ҮЙЛ АЖИЛЛАГАА (OPS)'};
const color=(d:string)=>(areaReportPalette as any)[d]?.accent??'#5b6b82';
export const DomainChip=({code,label}:{code:string;label?:string})=><span className="cn-chip" style={{'--c':color(code)} as React.CSSProperties}>{label??DOMAIN_SHORT[code]??code}</span>;
export const RoleChip=({role}:{role:string})=><span className={`cn-role cn-role--${role}`}>{role}</span>;
const PAY_MN:Record<string,string>={PAID:'Төлөгдсөн',PENDING:'Хүлээгдэж байна',CREATED:'Үүсгэсэн',FAILED:'Амжилтгүй',CANCELLED:'Цуцлагдсан',REFUNDED:'Буцаагдсан'};
const msg=(e:unknown)=>(e as Error)?.message||'Үйлдэл амжилтгүй боллоо.';
const low=(v:string)=>v.toLocaleLowerCase('mn-MN');
const DOMAINS=['marketing','it','finance','people','operations'];
/** Download an Excel file from an authorised admin endpoint (the Bearer token never appears in a URL). */
async function downloadFile(path:string,filename:string){
 const r=await fetch(`${(import.meta.env.VITE_API_BASE_URL??'/api/v1').replace(/\/$/,'')}/admin${path}`,{headers:{Authorization:`Bearer ${adminSession.token}`}});
 if(!r.ok)throw new Error('Excel файл үүсгэж чадсангүй.');
 const url=URL.createObjectURL(await r.blob());const a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();window.setTimeout(()=>URL.revokeObjectURL(url),2000);
}
export const countsChanged=()=>window.dispatchEvent(new Event('adm-counts'));
/** Company search + category filter shared by ХЯНАХ ТАЙЛАН and ДУУССАН ТАЙЛАН. */
function ReportFilters({q,setQ,dom,setDom}:{q:string;setQ:(v:string)=>void;dom:string;setDom:(v:string)=>void}){
 return <div className="cn-filters"><input className="cn-search" type="search" placeholder="Компанийн нэрээр хайх" aria-label="Компанийн нэрээр хайх" value={q} onChange={e=>setQ(e.target.value)}/>
  <select className="cn-select" aria-label="Чиглэл" value={dom} onChange={e=>setDom(e.target.value)} style={dom?{'--c':color(dom)} as React.CSSProperties:undefined}><option value="">Бүх чиглэл</option>{DOMAINS.map(d=><option key={d} value={d}>{DOMAIN_SHORT[d]}</option>)}</select></div>;
}
const matchReport=(r:any,q:string,dom:string)=>(!dom||r.domain===dom)&&(!q.trim()||low(r.company).includes(low(q.trim())));

function Modal({title,children,onClose}:{title:string;children:React.ReactNode;onClose:()=>void}){
 useEffect(()=>{const k=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose()};document.addEventListener('keydown',k);return()=>document.removeEventListener('keydown',k)},[onClose]);
 return <div className="adm-modal" role="dialog" aria-modal="true" aria-label={title}><div className="adm-modal__box"><h2>{title}</h2>{children}</div></div>;
}

// ================= ADMIN SHIT =================
export function AdminShit({id,meEmail}:{id:string;meEmail:string}){
 if(id)return <AccountDetail id={id} meEmail={meEmail}/>;
 return <AccountList/>;
}
function AccountList(){
 const [q,setQ]=useState('');const [term,setTerm]=useState('');const [tick,setTick]=useState(0);const [adding,setAdding]=useState(false);const [role,setRole]=useState('');
 useEffect(()=>{const t=window.setTimeout(()=>setTerm(q.trim()),250);return()=>window.clearTimeout(t)},[q]);
 const {loading,error,data,reload}=useAsync(()=>adminApi.get(`/console/accounts?q=${encodeURIComponent(term)}`),[term,tick]);
 return <Page title="ADMIN SHIT" actions={<button type="button" className="adm-btn adm-btn--primary adm-btn--big" onClick={()=>setAdding(true)}>НЭМЭХ</button>}>
  <div className="cn-filters"><input className="cn-search" type="search" placeholder="Имэйл эсвэл компанийн нэрээр хайх" aria-label="Хайх" value={q} onChange={e=>setQ(e.target.value)}/>
   <div className="cn-seg" role="group" aria-label="Эрхээр шүүх">{[['','Бүгд'],['User','User'],['Admin','Admin'],['Sadmin','Sadmin']].map(([v,l])=><button key={v} type="button" className={`cn-seg__b${role===v?' is-on':''}${v?` cn-seg__b--${v}`:''}`} aria-pressed={role===v} onClick={()=>setRole(v)}>{l}</button>)}</div></div>
  {loading&&!data?<Loading/>:error?<Err text={error} retry={reload}/>:!data||data.items.filter((r:any)=>!role||r.role===role).length===0?<Empty text="Бүртгэл олдсонгүй."/>:
   <div className="adm-tablewrap"><table className="adm-table cn-table"><thead><tr><th className="cn-n">№</th><th>Имэйл</th><th>Эрх</th></tr></thead><tbody>{data.items.filter((r:any)=>!role||r.role===role).map((r:any,i:number)=><tr key={r.id} className="cn-row" tabIndex={0} onClick={()=>{window.location.hash=adminHref('accounts',r.id)}} onKeyDown={e=>{if(e.key==='Enter')window.location.hash=adminHref('accounts',r.id)}}><td className="cn-n">{i+1}</td><td data-label="Имэйл">{r.email}</td><td data-label="Эрх"><RoleChip role={r.role}/></td></tr>)}</tbody></table></div>}
  {adding&&<AddAccount onClose={()=>setAdding(false)} onDone={()=>{setAdding(false);setTick(t=>t+1)}}/>}
 </Page>;
}
function AddAccount({onClose,onDone}:{onClose:()=>void;onDone:()=>void}){
 const [email,setEmail]=useState('');const [pw,setPw]=useState('');const [role,setRole]=useState('User');const [err,setErr]=useState('');const [busy,setBusy]=useState(false);
 const submit=async(e:React.FormEvent)=>{e.preventDefault();setBusy(true);setErr('');try{await adminApi.post('/console/accounts',{email:email.trim(),password:pw,role});onDone()}catch(x){setErr(msg(x))}finally{setBusy(false)}};
 return <Modal title="Шинэ бүртгэл нэмэх" onClose={onClose}><form onSubmit={submit} className="cn-form">
  <label>Имэйл<input type="email" value={email} onChange={e=>setEmail(e.target.value)} autoComplete="off" required/></label>
  <label>Нууц үг (10-аас дээш тэмдэгт)<PasswordInput value={pw} onChange={e=>setPw(e.target.value)} autoComplete="new-password" required/></label>
  <label>Эрх<select value={role} onChange={e=>setRole(e.target.value)}><option value="User">User</option><option value="Admin">Admin</option><option value="Sadmin">Sadmin</option></select></label>
  <p className="adm-note">Имэйл автоматаар баталгаажихгүй. Эхний нэвтрэлтэд имэйлээр код очино.</p>
  {err&&<div className="adm-error" role="alert">{err}</div>}
  <div className="adm-modal__row"><button type="button" className="adm-btn" onClick={onClose}>Болих</button><button type="submit" className="adm-btn adm-btn--primary" disabled={busy||!email||pw.length<10}>{busy?'Нэмж байна…':'Нэмэх'}</button></div></form></Modal>;
}
function AccountDetail({id,meEmail}:{id:string;meEmail:string}){
 const [tick,setTick]=useState(0);const [msgS,setMsgS]=useState<{t:'ok'|'err';m:string}|null>(null);const [dlg,setDlg]=useState<''|'pw'|'del'|'sessions'>('');const [pw,setPw]=useState('');const [conf,setConf]=useState('');const [busy,setBusy]=useState('');const [ask,setAsk]=useState<null|{kind:'grant'|'revoke';company:any;d:any}>(null);
 const lock=React.useRef(false);   // one request at a time: a double click can never send an operation twice
 const {loading,error,data,reload}=useAsync(()=>adminApi.get(`/console/accounts/${id}`),[id,tick]);
 const act=async(key:string,fn:()=>Promise<any>,ok:string|((o:any)=>string))=>{if(lock.current)return;lock.current=true;setBusy(key);setMsgS(null);try{const o=await fn();setMsgS({t:'ok',m:typeof ok==='function'?ok(o):ok});setTick(t=>t+1)}catch(e){setMsgS({t:'err',m:msg(e)})}finally{lock.current=false;setBusy('')}};
 if(loading&&!data)return <Page title="Бүртгэл"><Loading/></Page>;if(error||!data)return <Page title="Бүртгэл"><Err text={error||'Олдсонгүй'} retry={reload}/></Page>;
 const abbr=(code:string)=>({marketing:'MKT',it:'IT',finance:'FIN',people:'HR',operations:'OPS'} as any)[code];
 return <Page title="Бүртгэл" actions={<a className="adm-btn" href={adminHref('accounts')}>Буцах</a>}>
  <dl className="adm-dl cn-dl"><dt>Имэйл</dt><dd>{data.email}</dd><dt>Эрх</dt><dd><RoleChip role={data.role}/></dd><dt>Бүртгүүлсэн огноо</dt><dd>{fmtUbDate(data.createdAt)}</dd><dt>Сүүлд амжилттай нэвтэрсэн</dt><dd>{data.lastLoginAt?fmtUb(data.lastLoginAt):'Нэвтэрч байгаагүй'}</dd></dl>
  {msgS&&<div className={msgS.t==='ok'?'adm-note adm-note--ok':'adm-error'} role={msgS.t==='ok'?'status':'alert'}>{msgS.m}</div>}
  <div className="cn-actions"><button type="button" className="adm-btn" onClick={()=>{setDlg('pw');setPw('')}}>Нууц үг солих</button><button type="button" className="adm-btn" onClick={()=>setDlg('sessions')}>Бүх төхөөрөмжөөс гаргах</button><button type="button" className="adm-btn adm-btn--danger" onClick={()=>{setDlg('del');setConf('')}}>Бүртгэл устгах</button></div>
  {data.role==='User'&&<section className="adm-card"><h2>Оношилгооны эрх</h2>
   {data.companies.length===0?<Empty text="Энэ хэрэглэгч байгууллага бүртгээгүй байна."/>:data.companies.map((c:any)=><div key={c.id} className="cn-company"><h3>{c.name}</h3><ul className="cn-access">{c.domains.map((d:any)=><li key={d.code} className={d.access?'is-on':'is-off'}><DomainChip code={d.code} label={d.label.replace(/ БА /,' & ')+` (${abbr(d.code)})`}/><b className="cn-state">{d.access?'Эрхтэй':'Эрхгүй'}</b>
    {d.access?<button type="button" className="adm-btn" disabled={!!busy} onClick={()=>setAsk({kind:'revoke',company:c,d})}>Эрх цуцлах</button>
     :<button type="button" className="adm-btn adm-btn--primary" disabled={!!busy} onClick={()=>setAsk({kind:'grant',company:c,d})}>Эрх олгох</button>}</li>)}</ul></div>)}
  </section>}
  {ask&&<Modal title={ask.kind==='grant'?'Оношилгооны эрх олгох уу?':'Оношилгооны эрх цуцлах уу?'} onClose={()=>setAsk(null)}><p>«{data.email}» хэрэглэгчийн «{ask.company.name}» байгууллагад <b>{DOMAIN_SHORT[ask.d.code]}</b> чиглэлийн эрхийг {ask.kind==='grant'?'олгоно. Хэрэглэгч шууд оношилгоо эхлүүлж болно.':'цуцална. Хадгалсан хариулт, тайлан, төлбөрийн бүртгэл хэвээр үлдэнэ.'}</p>
   <div className="adm-modal__row"><button type="button" className="adm-btn" onClick={()=>setAsk(null)}>Болих</button><button type="button" className="adm-btn adm-btn--primary" disabled={!!busy} onClick={()=>{const q=ask;setAsk(null);void act(q.d.code,()=>q.kind==='grant'?adminApi.post(`/companies/${q.company.id}/entitlements/grant`,{domainCode:q.d.code}):adminApi.post(`/entitlements/${q.d.entitlementId}/revoke`,{}),q.kind==='grant'?'Эрх олгогдлоо.':'Эрх цуцлагдлаа.')}}>{ask.kind==='grant'?'Эрх олгох':'Эрх цуцлах'}</button></div></Modal>}
  {dlg==='pw'&&<Modal title="Нууц үг солих уу?" onClose={()=>setDlg('')}><form className="cn-form" onSubmit={e=>{e.preventDefault();void act('pw',()=>adminApi.post(`/console/accounts/${id}/password`,{password:pw}),'Нууц үг солигдлоо. Бүх нэвтрэлт хаагдсан.').then(()=>setDlg(''))}}>
   <p>«{data.email}» бүртгэлийн нууц үгийг шинээр тогтооно. Энэ бүртгэлийн бүх нэвтрэлт болон хадгалсан төхөөрөмж хаагдана.</p>
   <label>Шинэ нууц үг (10-аас дээш тэмдэгт)<PasswordInput value={pw} onChange={e=>setPw(e.target.value)} autoComplete="new-password" required/></label>
   <div className="adm-modal__row"><button type="button" className="adm-btn" onClick={()=>setDlg('')}>Болих</button><button type="submit" className="adm-btn adm-btn--primary" disabled={pw.length<10||!!busy}>Нууц үг солих</button></div></form></Modal>}
  {dlg==='sessions'&&<Modal title="Бүх төхөөрөмжөөс гаргах уу?" onClose={()=>setDlg('')}><p>«{data.email}» бүртгэл бүх төхөөрөмж дээрх нэвтрэлтээсээ гарна, хадгалсан төхөөрөмжүүд хүчингүй болно. Дахин нэвтрэхэд имэйл, нууц үг болон имэйлээр ирэх код хэрэгтэй. Нууц үг, эрх, өгөгдөл өөрчлөгдөхгүй.{data.email.toLowerCase()===meEmail.toLowerCase()?' Энэ таны өөрийн бүртгэл тул та мөн гарна.':''}</p>
   <div className="adm-modal__row"><button type="button" className="adm-btn" onClick={()=>setDlg('')}>Болих</button><button type="button" className="adm-btn adm-btn--primary" disabled={!!busy} onClick={()=>{setDlg('');void act('sessions',async()=>{const o=await adminApi.post(`/console/accounts/${id}/revoke-sessions`,{});if(o.self){adminSession.token=null;window.location.hash=adminHref('login');window.location.reload()}return o},o=>`Гаргалаа: ${o.sessions} нэвтрэлт, ${o.devices} хадгалсан төхөөрөмж хүчингүй боллоо.`)}}>Гаргах</button></div></Modal>}
  {dlg==='del'&&<Modal title="Бүртгэл устгах уу?" onClose={()=>setDlg('')}><form className="cn-form" onSubmit={e=>{e.preventDefault();if(lock.current)return;lock.current=true;void (async()=>{setBusy('del');try{await adminApi.post(`/console/accounts/${id}/delete`,{confirmEmail:conf});window.location.hash=adminHref('accounts')}catch(x){setMsgS({t:'err',m:msg(x)});setDlg('')}finally{lock.current=false;setBusy('')}})()}}>
   <p>«{data.email}» бүртгэл бүрмөсөн хаагдана. Буцаах боломжгүй. Төлбөрийн бүртгэл, оношилгоо, тайлан хэвээр хадгалагдана. Сүүлчийн Sadmin-ийг устгах боломжгүй.</p>
   <label>Баталгаажуулахын тулд имэйлийг бичнэ үү<input value={conf} onChange={e=>setConf(e.target.value)} autoComplete="off"/></label>
   <div className="adm-modal__row"><button type="button" className="adm-btn" onClick={()=>setDlg('')}>Болих</button><button type="submit" className="adm-btn adm-btn--danger" disabled={conf.trim().toLowerCase()!==data.email||!!busy}>Устгах</button></div></form></Modal>}
 </Page>;
}

// ================= PAYMENTS =================
const AMT=(n:number)=>`${Number(n).toLocaleString('en-US')}₮`;
export function Payments(){
 const [f,setF]=useState({q:'',domain:'',status:'',from:'',to:''});const [term,setTerm]=useState('');const [open,setOpen]=useState('');const [busy,setBusy]=useState(false);const [m,setM]=useState('');
 useEffect(()=>{const t=window.setTimeout(()=>setTerm(f.q.trim()),250);return()=>window.clearTimeout(t)},[f.q]);
 const qs=new URLSearchParams(Object.entries({q:term,domain:f.domain,status:f.status,from:f.from,to:f.to}).filter(([,v])=>v)).toString();
 const {loading,error,data,reload}=useAsync(()=>adminApi.get(`/console/payments${qs?`?${qs}`:''}`),[qs]);
 const any=!!(f.q||f.domain||f.status||f.from||f.to);const set=(k:string,v:string)=>setF(x=>({...x,[k]:v}));
 return <Page title="PAYMENTS" actions={<button type="button" className="adm-btn adm-btn--primary adm-btn--big" disabled={busy} onClick={async()=>{setBusy(true);setM('');try{await downloadFile(`/console/payments/export.xlsx${qs?`?${qs}`:''}`,'businessmri-payments.xlsx')}catch(e){setM(msg(e))}finally{setBusy(false)}}}>{busy?'Бэлтгэж байна…':'Excel татах'}</button>}>
  <div className="cn-filters cn-filters--pay"><input className="cn-search" type="search" placeholder="Компанийн нэрээр хайх" aria-label="Компанийн нэрээр хайх" value={f.q} onChange={e=>set('q',e.target.value)}/>
   <select className="cn-select" aria-label="Чиглэл" value={f.domain} onChange={e=>set('domain',e.target.value)} style={f.domain?{'--c':color(f.domain)} as React.CSSProperties:undefined}><option value="">Бүх чиглэл</option>{DOMAINS.map(d=><option key={d} value={d}>{DOMAIN_SHORT[d]}</option>)}</select>
   <select className="cn-select" aria-label="Төлөв" value={f.status} onChange={e=>set('status',e.target.value)}><option value="">Бүх төлөв</option>{Object.entries(PAY_MN).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select>
   <label className="cn-date">Эхлэх<input type="date" value={f.from} max={f.to||undefined} onChange={e=>set('from',e.target.value)}/></label><label className="cn-date">Дуусах<input type="date" value={f.to} min={f.from||undefined} onChange={e=>set('to',e.target.value)}/></label>
   {any&&<button type="button" className="adm-btn" onClick={()=>setF({q:'',domain:'',status:'',from:'',to:''})}>Цэвэрлэх</button>}</div>
  {m&&<div className="adm-error" role="alert">{m}</div>}
  {loading&&!data?<Loading/>:error?<Err text={error} retry={reload}/>:!data||data.items.length===0?<Empty text={any?'Хайлтад тохирох төлбөр олдсонгүй.':'Төлбөр бүртгэгдээгүй байна.'}/>:
  <div className="adm-tablewrap"><table className="adm-table cn-table"><thead><tr><th className="cn-n">№</th><th>Компани</th><th>Оношилгооны чиглэл</th><th>Төлөв</th><th>Огноо</th></tr></thead><tbody>{data.items.map((r:any)=><tr key={r.id} className="cn-row" tabIndex={0} onClick={()=>setOpen(r.id)} onKeyDown={e=>{if(e.key==='Enter')setOpen(r.id)}}><td className="cn-n">{r.n}</td><td data-label="Компани">{r.company}</td><td data-label="Оношилгооны чиглэл"><DomainChip code={r.domain}/></td><td data-label="Төлөв"><span className={`cn-pay cn-pay--${r.status}`}>{PAY_MN[r.status]??r.status}</span></td><td data-label="Огноо">{fmtUb(r.date)}</td></tr>)}</tbody></table></div>}
  {open&&<PaymentDetail id={open} onClose={()=>setOpen('')}/>}</Page>;
}
function PaymentDetail({id,onClose}:{id:string;onClose:()=>void}){
 const {loading,error,data}=useAsync(()=>adminApi.get(`/console/payments/${id}`),[id]);
 return <Modal title="Төлбөрийн дэлгэрэнгүй" onClose={onClose}>{loading?<Loading/>:error||!data?<div className="adm-error" role="alert">{error||'Олдсонгүй'}</div>:<dl className="adm-dl cn-dl">
  <dt>Компани</dt><dd>{data.company}</dd><dt>Компанийн имэйл</dt><dd>{data.companyEmail||'-'}</dd><dt>Оношилгооны чиглэл</dt><dd><DomainChip code={data.domain}/></dd><dt>Төрөл</dt><dd>{data.plan}</dd><dt>Дүн</dt><dd>{AMT(data.amountMnt)}</dd>
  <dt>Төлөв</dt><dd><span className={`cn-pay cn-pay--${data.status}`}>{PAY_MN[data.status]??data.status}</span></dd><dt>Нэхэмжлэлийн дугаар</dt><dd>{data.invoiceNo}</dd>{data.transactionRef&&<><dt>Гүйлгээний дугаар</dt><dd>{data.transactionRef}</dd></>}
  <dt>Нэхэмжлэл үүсгэсэн</dt><dd>{fmtUb(data.createdAt)}</dd>{data.paidAt&&<><dt>Төлбөр баталгаажсан</dt><dd>{fmtUb(data.paidAt)}</dd></>}
  {data.cancelled&&<><dt>Тайлбар</dt><dd>Нэхэмжлэл цуцлагдсан.</dd></>}{data.failureReason&&<><dt>Амжилтгүй болсон шалтгаан</dt><dd>{data.failureReason}</dd></>}
  {data.refund&&<><dt>Буцаалт</dt><dd>{[data.refund.at&&fmtUb(data.refund.at),data.refund.reference,data.refund.reason].filter(Boolean).join(' · ')||'Буцаагдсан'}</dd></>}</dl>}
  <div className="adm-modal__row"><button type="button" className="adm-btn" onClick={onClose}>Хаах</button></div></Modal>;
}

// ================= DATA =================
export function DataSection({id}:{id:string}){return id?<BusinessDetail id={id}/>:<BusinessList/>}
function BusinessList(){
 const {loading,error,data,reload}=useAsync(()=>adminApi.get('/console/businesses'),[]);const [q,setQ]=useState('');
 const items:any[]=(data?.items??[]).filter((r:any)=>!q.trim()||low(r.name).includes(low(q.trim()))||low(r.email||'').includes(low(q.trim())));
 return <Page title="DATA"><input className="cn-search" type="search" placeholder="Компанийн нэр эсвэл имэйлээр хайх" aria-label="Хайх" value={q} onChange={e=>setQ(e.target.value)}/>{loading&&!data?<Loading/>:error?<Err text={error} retry={reload}/>:!data||items.length===0?<Empty text={q.trim()?'Хайлтад тохирох бизнес олдсонгүй.':'Бүртгэлтэй бизнес алга.'}/>:
  <div className="adm-tablewrap"><table className="adm-table cn-table"><thead><tr><th className="cn-n">№</th><th>Компанийн нэр</th><th>Имэйл</th></tr></thead><tbody>{items.map((r:any,i:number)=><tr key={r.id} className="cn-row" tabIndex={0} onClick={()=>{window.location.hash=adminHref('data',r.id)}} onKeyDown={e=>{if(e.key==='Enter')window.location.hash=adminHref('data',r.id)}}><td className="cn-n">{i+1}</td><td data-label="Компанийн нэр">{r.name}</td><td data-label="Имэйл">{r.email||'-'}</td></tr>)}</tbody></table></div>}</Page>;
}
function BusinessDetail({id}:{id:string}){
 const {loading,error,data,reload}=useAsync(()=>adminApi.get(`/console/businesses/${id}`),[id]);const [open,setOpen]=useState<string>('basic');const [m,setM]=useState('');const [busy,setBusy]=useState(false);const [dl,setDl]=useState('');
 if(loading&&!data)return <Page title="Бизнес"><Loading/></Page>;if(error||!data)return <Page title="Бизнес"><Err text={error||'Олдсонгүй'} retry={reload}/></Page>;
 const c=data.company;const rows:[string,any][]=[['Компанийн нэр',c.name],['Имэйл',c.email||'-'],['Салбар',c.industry],['Бизнесийн загвар',c.businessModel],['Ажилтны тоо',c.employeeCount],['Үйл ажиллагааны нас (жил)',c.companyAgeYears],['Зах зээл',c.marketType],['Улс',c.country],['Бүртгүүлсэн огноо',fmtUbDate(c.createdAt)]];
 return <Page title={c.name} actions={<><a className="adm-btn" href={adminHref('data')}>Буцах</a><button type="button" className="adm-btn adm-btn--primary adm-btn--big" disabled={busy} onClick={async()=>{setBusy(true);setM('');try{await downloadFile(`/console/businesses/${id}/export.xlsx`,'businessmri-business.xlsx')}catch(e){setM(msg(e))}finally{setBusy(false)}}}>{busy?'Бэлтгэж байна…':'Excel татах'}</button></>}>
  {m&&<div className="adm-error" role="alert">{m}</div>}
  <section className="adm-card cn-sec"><button type="button" className="cn-sec__head" aria-expanded={open==='basic'} onClick={()=>setOpen(open==='basic'?'':'basic')}>Компанийн үндсэн мэдээлэл</button>{open==='basic'&&<dl className="adm-dl cn-dl">{rows.filter(([,v])=>v!==null&&v!==undefined&&v!=='').map(([k,v])=><React.Fragment key={k}><dt>{k}</dt><dd>{String(v)}</dd></React.Fragment>)}</dl>}</section>
  {data.diagnoses.length===0&&<Empty text="Хадгалагдсан оношилгоо алга."/>}
  {data.diagnoses.map((g:any)=><section key={g.id} className="adm-card cn-sec"><div className="cn-sec__row"><button type="button" className="cn-sec__head" aria-expanded={open===g.id} onClick={()=>setOpen(open===g.id?'':g.id)}><span className="cn-chip" style={{'--c':color(g.domain)} as React.CSSProperties}>{g.label}</span><small>{g.origin}</small></button><button type="button" className="adm-btn" disabled={dl===g.id} onClick={async()=>{setDl(g.id);setM('');try{await downloadFile(`/console/businesses/${id}/diagnoses/${g.id}/export.xlsx`,'businessmri-diagnosis.xlsx')}catch(e){setM(msg(e))}finally{setDl('')}}}>Excel</button></div>
   {open===g.id&&(g.answers.length===0?<Empty text="Хариулт хадгалагдаагүй байна."/>:<div className="adm-tablewrap"><table className="adm-table cn-table"><thead><tr><th className="cn-n">№</th><th>Асуулт</th><th>Хариулт</th></tr></thead><tbody>{g.answers.map((a:any)=><tr key={a.n}><td className="cn-n">{a.n}</td><td data-label="Асуулт">{a.question}</td><td data-label="Хариулт">{a.answer}</td></tr>)}</tbody></table></div>)}</section>)}
 </Page>;
}

// ================= ХЯНАХ ТАЙЛАН / ДУУССАН ТАЙЛАН =================
function useServerClock(serverNow?:string){const offset=useMemo(()=>serverNow?new Date(serverNow).getTime()-Date.now():0,[serverNow]);const [,setT]=useState(0);useEffect(()=>{const t=window.setInterval(()=>setT(x=>x+1),5000);return()=>window.clearInterval(t)},[]);return ()=>Date.now()+offset}
export function ReviewQueue(){
 const {loading,error,data,reload}=useAsync(()=>adminApi.get('/console/review-queue'),[]);const now=useServerClock(data?.now);const [q,setQ]=useState('');const [dom,setDom]=useState('');
 const items:any[]=(data?.items??[]).filter((r:any)=>matchReport(r,q,dom));
 useEffect(()=>{const t=window.setInterval(reload,60000);return()=>window.clearInterval(t)},[reload]);
 return <Page title="ХЯНАХ ТАЙЛАН"><ReportFilters q={q} setQ={setQ} dom={dom} setDom={setDom}/>{loading&&!data?<Loading/>:error?<Err text={error} retry={reload}/>:!data||data.items.length===0?<Empty text="Хянах тайлан алга."/>:items.length===0?<Empty text="Хайлтад тохирох тайлан олдсонгүй."/>:
  <div className="adm-tablewrap"><table className="adm-table cn-table"><thead><tr><th className="cn-n">№</th><th>Компани</th><th>Оношилгооны чиглэл</th><th>Илгээсэн огноо</th><th>Үлдсэн хугацаа</th></tr></thead><tbody>{items.map((r:any,i:number)=>{const left=new Date(r.deadlineAt).getTime()-now();return <tr key={r.id} className={`cn-row${r.ready?'':' is-wait'}`} tabIndex={0} onClick={()=>{if(r.ready)window.location.hash=adminHref('review',r.id)}} onKeyDown={e=>{if(e.key==='Enter'&&r.ready)window.location.hash=adminHref('review',r.id)}}><td className="cn-n">{i+1}</td><td data-label="Компани">{r.company}</td><td data-label="Оношилгооны чиглэл"><DomainChip code={r.domain}/>{!r.ready&&<small className="cn-wait"> бэлтгэж байна</small>}</td><td data-label="Илгээсэн огноо">{fmtUb(r.submittedAt)}</td><td data-label="Үлдсэн хугацаа"><b className={`cn-left${left<0?' is-over':left<3600000?' is-soon':''}`}>{countdown(left)}</b></td></tr>})}</tbody></table></div>}</Page>;
}
export function DoneReports(){
 const [tick,setTick]=useState(0);const [busy,setBusy]=useState('');const [err,setErr]=useState('');const [ask,setAsk]=useState<any>(null);
 const {loading,error,data,reload}=useAsync(()=>adminApi.get('/console/done-reports'),[tick]);const [q,setQ]=useState('');const [dom,setDom]=useState('');const items:any[]=(data?.items??[]).filter((r:any)=>matchReport(r,q,dom));
 const recall=async()=>{if(!ask)return;setBusy(ask.id);setErr('');try{await adminApi.post(`/console/reviews/${ask.id}/recall`,{});setAsk(null);setTick(t=>t+1);countsChanged()}catch(e){setErr(msg(e));setAsk(null)}finally{setBusy('')}};
 return <Page title="ДУУССАН ТАЙЛАН"><ReportFilters q={q} setQ={setQ} dom={dom} setDom={setDom}/>{err&&<div className="adm-error" role="alert">{err}</div>}{loading&&!data?<Loading/>:error?<Err text={error} retry={reload}/>:!data||data.items.length===0?<Empty text="Илгээсэн тайлан алга."/>:items.length===0?<Empty text="Хайлтад тохирох тайлан олдсонгүй."/>:
  <div className="adm-tablewrap"><table className="adm-table cn-table"><thead><tr><th className="cn-n">№</th><th>Компани</th><th>Оношилгооны чиглэл</th><th>Илгээсэн огноо</th><th/></tr></thead><tbody>{items.map((r:any,i:number)=><tr key={r.id}><td className="cn-n">{i+1}</td><td data-label="Компани">{r.company}</td><td data-label="Оношилгооны чиглэл"><DomainChip code={r.domain}/></td><td data-label="Илгээсэн огноо">{fmtUb(r.publishedAt)}</td><td><button type="button" className="adm-btn" disabled={!!busy} onClick={()=>setAsk(r)}>БУЦААХ</button></td></tr>)}</tbody></table></div>}
  {ask&&<Modal title="Тайланг буцаах уу?" onClose={()=>setAsk(null)}><p>«{ask.company}» компанийн тайлан хэрэглэгчид харагдахаа болино. Тайлан устахгүй, ХЯНАХ ТАЙЛАН руу буцаж, засаад дахин илгээж болно. Хэрэглэгчид мэдэгдэл очихгүй.</p><div className="adm-modal__row"><button type="button" className="adm-btn" onClick={()=>setAsk(null)}>Болих</button><button type="button" className="adm-btn adm-btn--primary" disabled={!!busy} onClick={()=>void recall()}>БУЦААХ</button></div></Modal>}</Page>;
}
export type {AdminApiError};
