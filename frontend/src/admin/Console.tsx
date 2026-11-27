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

function Modal({title,children,onClose}:{title:string;children:React.ReactNode;onClose:()=>void}){
 useEffect(()=>{const k=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose()};document.addEventListener('keydown',k);return()=>document.removeEventListener('keydown',k)},[onClose]);
 return <div className="adm-modal" role="dialog" aria-modal="true" aria-label={title}><div className="adm-modal__box"><h2>{title}</h2>{children}</div></div>;
}

// ================= ADMIN SHIT =================
export function AdminShit({id}:{id:string}){
 if(id)return <AccountDetail id={id}/>;
 return <AccountList/>;
}
function AccountList(){
 const [q,setQ]=useState('');const [term,setTerm]=useState('');const [tick,setTick]=useState(0);const [adding,setAdding]=useState(false);
 useEffect(()=>{const t=window.setTimeout(()=>setTerm(q.trim()),250);return()=>window.clearTimeout(t)},[q]);
 const {loading,error,data,reload}=useAsync(()=>adminApi.get(`/console/accounts?q=${encodeURIComponent(term)}`),[term,tick]);
 return <Page title="ADMIN SHIT" actions={<button type="button" className="adm-btn adm-btn--primary adm-btn--big" onClick={()=>setAdding(true)}>НЭМЭХ</button>}>
  <input className="cn-search" type="search" placeholder="Имэйл эсвэл компанийн нэрээр хайх" aria-label="Хайх" value={q} onChange={e=>setQ(e.target.value)}/>
  {loading&&!data?<Loading/>:error?<Err text={error} retry={reload}/>:!data||data.items.length===0?<Empty text="Бүртгэл олдсонгүй."/>:
   <div className="adm-tablewrap"><table className="adm-table cn-table"><thead><tr><th className="cn-n">№</th><th>Имэйл</th><th>Эрх</th></tr></thead><tbody>{data.items.map((r:any)=><tr key={r.id} className="cn-row" tabIndex={0} onClick={()=>{window.location.hash=adminHref('accounts',r.id)}} onKeyDown={e=>{if(e.key==='Enter')window.location.hash=adminHref('accounts',r.id)}}><td className="cn-n">{r.n}</td><td data-label="Имэйл">{r.email}</td><td data-label="Эрх"><RoleChip role={r.role}/></td></tr>)}</tbody></table></div>}
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
function AccountDetail({id}:{id:string}){
 const [tick,setTick]=useState(0);const [msgS,setMsgS]=useState<{t:'ok'|'err';m:string}|null>(null);const [dlg,setDlg]=useState<''|'pw'|'del'>('');const [pw,setPw]=useState('');const [conf,setConf]=useState('');const [busy,setBusy]=useState('');
 const {loading,error,data,reload}=useAsync(()=>adminApi.get(`/console/accounts/${id}`),[id,tick]);
 const act=async(key:string,fn:()=>Promise<unknown>,ok:string)=>{setBusy(key);setMsgS(null);try{await fn();setMsgS({t:'ok',m:ok});setTick(t=>t+1)}catch(e){setMsgS({t:'err',m:msg(e)})}finally{setBusy('')}};
 if(loading&&!data)return <Page title="Бүртгэл"><Loading/></Page>;if(error||!data)return <Page title="Бүртгэл"><Err text={error||'Олдсонгүй'} retry={reload}/></Page>;
 return <Page title="Бүртгэл" actions={<a className="adm-btn" href={adminHref('accounts')}>Буцах</a>}>
  <dl className="adm-dl cn-dl"><dt>Имэйл</dt><dd>{data.email}</dd><dt>Эрх</dt><dd><RoleChip role={data.role}/></dd><dt>Бүртгүүлсэн огноо</dt><dd>{fmtUbDate(data.createdAt)}</dd></dl>
  {msgS&&<div className={msgS.t==='ok'?'adm-note adm-note--ok':'adm-error'} role={msgS.t==='ok'?'status':'alert'}>{msgS.m}</div>}
  <div className="cn-actions"><button type="button" className="adm-btn" onClick={()=>{setDlg('pw');setPw('')}}>Нууц үг солих</button><button type="button" className="adm-btn adm-btn--danger" onClick={()=>{setDlg('del');setConf('')}}>Бүртгэл устгах</button></div>
  {data.role==='User'&&<section className="adm-card"><h2>Оношилгооны эрх</h2>
   {data.companies.length===0?<Empty text="Энэ хэрэглэгч байгууллага бүртгээгүй байна."/>:data.companies.map((c:any)=><div key={c.id} className="cn-company"><h3>{c.name}</h3><ul className="cn-access">{c.domains.map((d:any)=><li key={d.code} className={d.access?'is-on':'is-off'}><DomainChip code={d.code} label={d.label.replace(/ БА /,' & ')+` (${({marketing:'MKT',it:'IT',finance:'FIN',people:'HR',operations:'OPS'} as any)[d.code]})`}/><b className="cn-state">{d.access?'Эрхтэй':'Эрхгүй'}</b>
    {d.access?<button type="button" className="adm-btn" disabled={!!busy} onClick={()=>void act(d.code,()=>adminApi.post(`/entitlements/${d.entitlementId}/revoke`,{}),'Эрх цуцлагдлаа.')}>Эрх цуцлах</button>
     :<button type="button" className="adm-btn adm-btn--primary" disabled={!!busy} onClick={()=>void act(d.code,()=>adminApi.post(`/companies/${c.id}/entitlements/grant`,{domainCode:d.code}),'Эрх олгогдлоо.')}>Эрх олгох</button>}</li>)}</ul></div>)}
  </section>}
  {dlg==='pw'&&<Modal title="Нууц үг солих" onClose={()=>setDlg('')}><form className="cn-form" onSubmit={e=>{e.preventDefault();void act('pw',()=>adminApi.post(`/console/accounts/${id}/password`,{password:pw}),'Нууц үг солигдлоо. Бүх нэвтрэлт хаагдсан.').then(()=>setDlg(''))}}>
   <label>Шинэ нууц үг (10-аас дээш тэмдэгт)<PasswordInput value={pw} onChange={e=>setPw(e.target.value)} autoComplete="new-password" required/></label><p className="adm-note">Энэ бүртгэлийн бүх нэвтрэлт болон хадгалсан төхөөрөмж хаагдана.</p>
   <div className="adm-modal__row"><button type="button" className="adm-btn" onClick={()=>setDlg('')}>Болих</button><button type="submit" className="adm-btn adm-btn--primary" disabled={pw.length<10||!!busy}>Солих</button></div></form></Modal>}
  {dlg==='del'&&<Modal title="Бүртгэл устгах уу?" onClose={()=>setDlg('')}><form className="cn-form" onSubmit={e=>{e.preventDefault();void (async()=>{setBusy('del');try{await adminApi.post(`/console/accounts/${id}/delete`,{confirmEmail:conf});window.location.hash=adminHref('accounts')}catch(x){setMsgS({t:'err',m:msg(x)});setDlg('')}finally{setBusy('')}})()}}>
   <p>«{data.email}» бүртгэл бүрмөсөн хаагдана. Буцаах боломжгүй. Төлбөрийн бүртгэл, оношилгоо, тайлан хэвээр хадгалагдана. Сүүлчийн Sadmin-ийг устгах боломжгүй.</p>
   <label>Баталгаажуулахын тулд имэйлийг бичнэ үү<input value={conf} onChange={e=>setConf(e.target.value)} autoComplete="off"/></label>
   <div className="adm-modal__row"><button type="button" className="adm-btn" onClick={()=>setDlg('')}>Болих</button><button type="submit" className="adm-btn adm-btn--danger" disabled={conf.trim().toLowerCase()!==data.email||!!busy}>Устгах</button></div></form></Modal>}
 </Page>;
}

// ================= PAYMENTS =================
export function Payments(){
 const {loading,error,data,reload}=useAsync(()=>adminApi.get('/console/payments'),[]);
 return <Page title="PAYMENTS">{loading&&!data?<Loading/>:error?<Err text={error} retry={reload}/>:!data||data.items.length===0?<Empty text="Төлбөр бүртгэгдээгүй байна."/>:
  <div className="adm-tablewrap"><table className="adm-table cn-table"><thead><tr><th className="cn-n">№</th><th>Компани</th><th>Оношилгооны чиглэл</th><th>Төлөв</th><th>Огноо</th></tr></thead><tbody>{data.items.map((r:any)=><tr key={r.id}><td className="cn-n">{r.n}</td><td data-label="Компани">{r.company}</td><td data-label="Оношилгооны чиглэл"><DomainChip code={r.domain}/></td><td data-label="Төлөв"><span className={`cn-pay cn-pay--${r.status}`}>{PAY_MN[r.status]??r.status}</span></td><td data-label="Огноо">{fmtUb(r.date)}</td></tr>)}</tbody></table></div>}</Page>;
}

// ================= DATA =================
export function DataSection({id}:{id:string}){return id?<BusinessDetail id={id}/>:<BusinessList/>}
function BusinessList(){
 const {loading,error,data,reload}=useAsync(()=>adminApi.get('/console/businesses'),[]);
 return <Page title="DATA">{loading&&!data?<Loading/>:error?<Err text={error} retry={reload}/>:!data||data.items.length===0?<Empty text="Бүртгэлтэй бизнес алга."/>:
  <div className="adm-tablewrap"><table className="adm-table cn-table"><thead><tr><th className="cn-n">№</th><th>Компанийн нэр</th><th>Имэйл</th></tr></thead><tbody>{data.items.map((r:any)=><tr key={r.id} className="cn-row" tabIndex={0} onClick={()=>{window.location.hash=adminHref('data',r.id)}} onKeyDown={e=>{if(e.key==='Enter')window.location.hash=adminHref('data',r.id)}}><td className="cn-n">{r.n}</td><td data-label="Компанийн нэр">{r.name}</td><td data-label="Имэйл">{r.email||'-'}</td></tr>)}</tbody></table></div>}</Page>;
}
async function downloadXlsx(id:string){
 const r=await fetch(`${(import.meta.env.VITE_API_BASE_URL??'/api/v1').replace(/\/$/,'')}/admin/console/businesses/${id}/export.xlsx`,{headers:{Authorization:`Bearer ${adminSession.token}`}});
 if(!r.ok)throw new Error('Excel файл үүсгэж чадсангүй.');
 const url=URL.createObjectURL(await r.blob());const a=document.createElement('a');a.href=url;a.download='businessmri-business.xlsx';document.body.appendChild(a);a.click();a.remove();window.setTimeout(()=>URL.revokeObjectURL(url),2000);
}
function BusinessDetail({id}:{id:string}){
 const {loading,error,data,reload}=useAsync(()=>adminApi.get(`/console/businesses/${id}`),[id]);const [open,setOpen]=useState<string>('basic');const [m,setM]=useState('');const [busy,setBusy]=useState(false);
 if(loading&&!data)return <Page title="Бизнес"><Loading/></Page>;if(error||!data)return <Page title="Бизнес"><Err text={error||'Олдсонгүй'} retry={reload}/></Page>;
 const c=data.company;const rows:[string,any][]=[['Компанийн нэр',c.name],['Имэйл',c.email||'-'],['Салбар',c.industry],['Бизнесийн загвар',c.businessModel],['Ажилтны тоо',c.employeeCount],['Үйл ажиллагааны нас (жил)',c.companyAgeYears],['Зах зээл',c.marketType],['Улс',c.country],['Бүртгүүлсэн огноо',fmtUbDate(c.createdAt)]];
 return <Page title={c.name} actions={<><a className="adm-btn" href={adminHref('data')}>Буцах</a><button type="button" className="adm-btn adm-btn--primary adm-btn--big" disabled={busy} onClick={async()=>{setBusy(true);setM('');try{await downloadXlsx(id)}catch(e){setM(msg(e))}finally{setBusy(false)}}}>{busy?'Бэлтгэж байна…':'Excel татах'}</button></>}>
  {m&&<div className="adm-error" role="alert">{m}</div>}
  <section className="adm-card cn-sec"><button type="button" className="cn-sec__head" aria-expanded={open==='basic'} onClick={()=>setOpen(open==='basic'?'':'basic')}>Компанийн үндсэн мэдээлэл</button>{open==='basic'&&<dl className="adm-dl cn-dl">{rows.filter(([,v])=>v!==null&&v!==undefined&&v!=='').map(([k,v])=><React.Fragment key={k}><dt>{k}</dt><dd>{String(v)}</dd></React.Fragment>)}</dl>}</section>
  {data.diagnoses.length===0&&<Empty text="Хадгалагдсан оношилгоо алга."/>}
  {data.diagnoses.map((g:any)=><section key={g.id} className="adm-card cn-sec"><button type="button" className="cn-sec__head" aria-expanded={open===g.id} onClick={()=>setOpen(open===g.id?'':g.id)}><span className="cn-chip" style={{'--c':color(g.domain)} as React.CSSProperties}>{g.label}</span><small>{g.origin}</small></button>
   {open===g.id&&(g.answers.length===0?<Empty text="Хариулт хадгалагдаагүй байна."/>:<div className="adm-tablewrap"><table className="adm-table cn-table"><thead><tr><th className="cn-n">№</th><th>Асуулт</th><th>Хариулт</th></tr></thead><tbody>{g.answers.map((a:any)=><tr key={a.n}><td className="cn-n">{a.n}</td><td data-label="Асуулт">{a.question}</td><td data-label="Хариулт">{a.answer}</td></tr>)}</tbody></table></div>)}</section>)}
 </Page>;
}

// ================= ХЯНАХ ТАЙЛАН / ДУУССАН ТАЙЛАН =================
function useServerClock(serverNow?:string){const offset=useMemo(()=>serverNow?new Date(serverNow).getTime()-Date.now():0,[serverNow]);const [,setT]=useState(0);useEffect(()=>{const t=window.setInterval(()=>setT(x=>x+1),5000);return()=>window.clearInterval(t)},[]);return ()=>Date.now()+offset}
export function ReviewQueue(){
 const {loading,error,data,reload}=useAsync(()=>adminApi.get('/console/review-queue'),[]);const now=useServerClock(data?.now);
 useEffect(()=>{const t=window.setInterval(reload,60000);return()=>window.clearInterval(t)},[reload]);
 return <Page title="ХЯНАХ ТАЙЛАН">{loading&&!data?<Loading/>:error?<Err text={error} retry={reload}/>:!data||data.items.length===0?<Empty text="Хянах тайлан алга."/>:
  <div className="adm-tablewrap"><table className="adm-table cn-table"><thead><tr><th className="cn-n">№</th><th>Компани</th><th>Оношилгооны чиглэл</th><th>Илгээсэн огноо</th><th>Үлдсэн хугацаа</th></tr></thead><tbody>{data.items.map((r:any,i:number)=>{const left=new Date(r.deadlineAt).getTime()-now();return <tr key={r.id} className={`cn-row${r.ready?'':' is-wait'}`} tabIndex={0} onClick={()=>{if(r.ready)window.location.hash=adminHref('review',r.id)}} onKeyDown={e=>{if(e.key==='Enter'&&r.ready)window.location.hash=adminHref('review',r.id)}}><td className="cn-n">{i+1}</td><td data-label="Компани">{r.company}</td><td data-label="Оношилгооны чиглэл"><DomainChip code={r.domain}/>{!r.ready&&<small className="cn-wait"> бэлтгэж байна</small>}</td><td data-label="Илгээсэн огноо">{fmtUb(r.submittedAt)}</td><td data-label="Үлдсэн хугацаа"><b className={`cn-left${left<0?' is-over':left<3600000?' is-soon':''}`}>{countdown(left)}</b></td></tr>})}</tbody></table></div>}</Page>;
}
export function DoneReports(){
 const [tick,setTick]=useState(0);const [busy,setBusy]=useState('');const [err,setErr]=useState('');const [ask,setAsk]=useState<any>(null);
 const {loading,error,data,reload}=useAsync(()=>adminApi.get('/console/done-reports'),[tick]);
 const recall=async()=>{if(!ask)return;setBusy(ask.id);setErr('');try{await adminApi.post(`/console/reviews/${ask.id}/recall`,{});setAsk(null);setTick(t=>t+1)}catch(e){setErr(msg(e));setAsk(null)}finally{setBusy('')}};
 return <Page title="ДУУССАН ТАЙЛАН">{err&&<div className="adm-error" role="alert">{err}</div>}{loading&&!data?<Loading/>:error?<Err text={error} retry={reload}/>:!data||data.items.length===0?<Empty text="Илгээсэн тайлан алга."/>:
  <div className="adm-tablewrap"><table className="adm-table cn-table"><thead><tr><th className="cn-n">№</th><th>Компани</th><th>Оношилгооны чиглэл</th><th>Илгээсэн огноо</th><th/></tr></thead><tbody>{data.items.map((r:any,i:number)=><tr key={r.id}><td className="cn-n">{i+1}</td><td data-label="Компани">{r.company}</td><td data-label="Оношилгооны чиглэл"><DomainChip code={r.domain}/></td><td data-label="Илгээсэн огноо">{fmtUb(r.publishedAt)}</td><td><button type="button" className="adm-btn" disabled={!!busy} onClick={()=>setAsk(r)}>БУЦААХ</button></td></tr>)}</tbody></table></div>}
  {ask&&<Modal title="Тайланг буцаах уу?" onClose={()=>setAsk(null)}><p>«{ask.company}» компанийн тайлан хэрэглэгчид харагдахаа болино. Тайлан устахгүй, ХЯНАХ ТАЙЛАН руу буцаж, засаад дахин илгээж болно. Хэрэглэгчид мэдэгдэл очихгүй.</p><div className="adm-modal__row"><button type="button" className="adm-btn" onClick={()=>setAsk(null)}>Болих</button><button type="button" className="adm-btn adm-btn--primary" disabled={!!busy} onClick={()=>void recall()}>БУЦААХ</button></div></Modal>}</Page>;
}
export type {AdminApiError};
