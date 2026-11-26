import React,{lazy,Suspense,useCallback,useEffect,useMemo,useRef,useState} from 'react';
import { PasswordInput } from '../components/PasswordInput';
import { actionMn,targetMn, adminApi,adminSession,fmt,setReauthHandler,setUnauthorizedHandler,AdminApiError,STATUS_MN,type AdminMe } from './adminApi';
import { usePrismBody } from '../design/prismPage';
import { useDomainTheme } from '../design/domainTheme';
import './admin.css';

const AdminReports=lazy(()=>import('./AdminReports'));
const AdminSupport=lazy(()=>import('./AdminSupport'));
const AdminData=lazy(()=>import('./AdminData'));
const AdminAccounts=lazy(()=>import('./AdminAccounts'));
const AdminCompanies=lazy(()=>import('./AdminCompanies'));
const AdminAccess=lazy(()=>import('./AdminAccess'));

export const isAdminHash=(h:string)=>/^#\/admin(\/|$|\?)/.test(h);
const parse=(hash:string)=>{const [path,query='']=hash.replace(/^#\/admin\/?/,'').split('?');const parts=path.split('/').filter(Boolean);return {section:parts[0]||'',id:parts[1]||'',query:new URLSearchParams(query)}};
export const adminHref=(...p:string[])=>'#/admin'+(p.length?'/'+p.join('/'):'');

export function Page({title,children,actions}:{title:string;children:React.ReactNode;actions?:React.ReactNode}){return <section className="adm-page"><header className="adm-page__head"><h1 tabIndex={-1} data-route-heading>{title}</h1>{actions&&<div className="adm-page__actions">{actions}</div>}</header>{children}</section>}
export function Empty({text}:{text:string}){return <div className="adm-empty" role="status">{text}</div>}
export function Err({text,retry}:{text:string;retry?:()=>void}){return <div className="adm-error" role="alert"><span>{text}</span>{retry&&<button type="button" className="adm-btn" onClick={retry}>Дахин оролдох</button>}</div>}
export function Loading(){return <div className="adm-loading" role="status" aria-live="polite"><span className="adm-spinner" aria-hidden="true"/>Ачаалж байна</div>}
export function Pager({page,pageSize,total,onPage}:{page:number;pageSize:number;total:number;onPage:(p:number)=>void}){const pages=Math.max(1,Math.ceil(total/pageSize));return <nav className="adm-pager" aria-label="Хуудаслалт"><button type="button" className="adm-btn" disabled={page<=1} onClick={()=>onPage(page-1)}>Өмнөх</button><span>{page} / {pages} ({total})</span><button type="button" className="adm-btn" disabled={page>=pages} onClick={()=>onPage(page+1)}>Дараах</button></nav>}
export function useAsync<T>(fn:()=>Promise<T>,deps:unknown[]){const [state,set]=useState<{loading:boolean;error:string;data:T|null}>({loading:true,error:'',data:null});const run=useCallback(()=>{set(s=>({...s,loading:true,error:''}));fn().then(data=>set({loading:false,error:'',data}),e=>set({loading:false,error:(e as Error).message||'Алдаа гарлаа',data:null}))},deps);// eslint-disable-line react-hooks/exhaustive-deps
 useEffect(()=>{run()},[run]);return {...state,reload:run}}

const EMAIL_CODE_UI=import.meta.env.VITE_ADMIN_EMAIL_CODE==='on';   // build-time opt-in; off by default (authenticator-app code only)

function ReauthModal({onDone,onCancel}:{onDone:(ok:boolean)=>void;onCancel:()=>void}){
 const [pw,setPw]=useState('');const [code,setCode]=useState('');const [err,setErr]=useState('');const [busy,setBusy]=useState(false);const [byMail,setByMail]=useState(false);const first=useRef<HTMLInputElement>(null);
 useEffect(()=>{first.current?.focus()},[]);
 const cancelRef=useRef(onCancel);cancelRef.current=onCancel;
 useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();cancelRef.current()}};document.addEventListener('keydown',key);return()=>document.removeEventListener('keydown',key)},[]);
 const submit=async(e:React.FormEvent)=>{e.preventDefault();setBusy(true);setErr('');try{await adminApi.reauth(pw,code.replace(/\s/g,''),byMail?code.replace(/\s/g,''):undefined);onDone(true)}catch(x){setErr((x as Error).message)}finally{setBusy(false)}};
 return <div className="adm-modal" role="dialog" aria-modal="true" aria-labelledby="reauth-title"><form className="adm-modal__box" onSubmit={submit}><h2 id="reauth-title">Дахин баталгаажуулах</h2><p>Энэ үйлдэл нууц үг ба MFA кодоор дахин баталгаажуулахыг шаардана.</p>
  <label>Нууц үг<PasswordInput ref={first} autoComplete="current-password" value={pw} onChange={e=>setPw(e.target.value)} required/></label>
  <label>{byMail?'Имэйлээр ирсэн код (6 орон)':'MFA код (6 орон)'}<input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" value={code} onChange={e=>setCode(e.target.value)} required/></label>
  {EMAIL_CODE_UI&&<button type="button" className="adm-btn" disabled={busy} onClick={async()=>{setBusy(true);setErr('');try{await adminApi.sendReauthCode();setByMail(true)}catch(x){setErr((x as AdminApiError).status===429?'Түр хүлээгээд дахин оролдоно уу.':'Код илгээж чадсангүй. Authenticator кодоо ашиглана уу.')}finally{setBusy(false)}}}>Имэйлээр код авах</button>}
  {err&&<div className="adm-error" role="alert">{err}</div>}<div className="adm-modal__row"><button type="button" className="adm-btn" onClick={onCancel}>Цуцлах</button><button type="submit" className="adm-btn adm-btn--primary" disabled={busy||pw.length<8||code.replace(/\s/g,'').length!==6}>Баталгаажуулах</button></div></form></div>
}

function Login({onLoggedIn}:{onLoggedIn:()=>void}){
 const [email,setEmail]=useState('');const [pw,setPw]=useState('');const [code,setCode]=useState('');const [err,setErr]=useState('');const [busy,setBusy]=useState(false);const [byMail,setByMail]=useState(false);const [note,setNote]=useState('');
 const sendCode=async()=>{setBusy(true);setErr('');setNote('');try{await adminApi.sendLoginCode(email.trim(),pw);setByMail(true);setNote('Код имэйлд илгээгдлээ. 5 минутын дотор оруулна уу.')}catch(x){const st=(x as AdminApiError).status;setErr(st===429?'Түр хүлээгээд дахин оролдоно уу.':st===503?'Код илгээж чадсангүй. Authenticator кодоо ашиглана уу.':'Нэвтрэх мэдээлэл буруу байна.')}finally{setBusy(false)}};
 const submit=async(e:React.FormEvent)=>{e.preventDefault();setBusy(true);setErr('');try{const c=code.replace(/\s/g,'');const r=await adminApi.login(email.trim(),pw,byMail?'':c,byMail?c:undefined);adminSession.token=r.token;setPw('');setCode('');onLoggedIn()}catch(x){setErr((x as AdminApiError).status===429?'Хэт олон буруу оролдлого. Түр хүлээгээд дахин оролдоно уу.':'Нэвтрэх мэдээлэл буруу байна.')}finally{setBusy(false)}};
 return <main className="adm-login"><form className="adm-login__card" onSubmit={submit}><div className="adm-login__brand">BusinessMRI.mn</div><h1 data-route-heading tabIndex={-1}>Удирдлагын төв</h1><p>Зөвхөн эрх бүхий администраторт.</p>
  <label>Имэйл<input type="email" autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)} required/></label>
  <label>Нууц үг<PasswordInput autoComplete="current-password" value={pw} onChange={e=>setPw(e.target.value)} required/></label>
  <label>{byMail?'Имэйлээр ирсэн код':'MFA код'}<input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" placeholder="000000" value={code} onChange={e=>setCode(e.target.value)} required/></label>
  {EMAIL_CODE_UI&&<button type="button" className="adm-btn" disabled={busy||!email||!pw} onClick={sendCode}>Имэйлээр код авах</button>}{note&&<div className="adm-note" role="status">{note}</div>}
  {err&&<div className="adm-error" role="alert">{err}</div>}<button type="submit" className="adm-btn adm-btn--primary adm-btn--wide" disabled={busy||!email||!pw||code.replace(/\s/g,'').length!==6}>{busy?'Нэвтэрч байна':'Нэвтрэх'}</button></form></main>
}

const NAV:[string,string,string][]=[['','Хяналтын самбар','reports.read|payments.read|notifications.read'],['reports','Тайлангийн хяналт','reports.read'],['users','Хэрэглэгчид','accounts.manage'],['companies','Байгууллагууд','companies.read'],['payments','Төлбөрүүд','payments.read'],['support','Дэмжлэг','support.manage'],['notifications','Мэдэгдэл','notifications.read'],['settings','Тохиргоо','admins.manage']];

/* SUPER_ADMIN sees four plain sections; the specialist tools (report review, support, notifications, administrators) stay available under «Бусад». */
const STUDIO_STAGES:[string,string][]=[['','Бүх тайлан'],['AWAITING_REVIEW','Шинэ'],['IN_REVIEW','Хянаж байна'],['READY_FOR_APPROVAL','Батлахад бэлэн'],['overdue','Хугацаа хэтэрсэн'],['returned','Засварт буцаасан'],['PUBLISHED','Илгээсэн']];
const SUPER_NAV:[string,string,string][]=[['users','Хэрэглэгчид','Хэрэглэгч хайх, идэвхгүй болгох, имэйл засах'],['companies','Компаниуд','Компанийн мэдээлэл, хүмүүс, оношилгоо'],['access','Оношилгооны эрх','Чиглэл бүрийн оношилгооны эрх олгох, цуцлах'],['payments','Төлбөрүүд','Төлбөр, нэхэмжлэх, буцаалтын хүсэлт']];
const MORE_NAV:[string,string,string][]=[['reports','Тайлан хянах','reports.read'],['support','Дэмжлэг','support.manage'],['notifications','Мэдэгдэл','notifications.read'],['settings','Тохиргоо','admins.manage']];
function SuperHome({me}:{me:AdminMe}){return <Dashboard me={me} intro={<p className="adm-note">Энд зөвхөн хяналт ба удирдлага байна: хэрэглэгч, компани, оношилгооны эрх, төлбөр, дэмжлэг. Тайлан засах, батлах, илгээх ажил тусдаа «Тайлан хянах студи» хэсэгт хийгдэнэ.</p>}/>}

function Dashboard({me,intro}:{me:AdminMe;intro?:React.ReactNode}){
 const {loading,error,data,reload}=useAsync(()=>adminApi.get('/dashboard'),[]);
 if(loading)return <Page title="Хяналтын самбар"><Loading/></Page>;if(error||!data)return <Page title="Хяналтын самбар"><Err text={error} retry={reload}/></Page>;
 const r=data.reports,p=data.payments;
 const Tile=({label,value,href,tone}:{label:string;value:number;href:string;tone?:string})=><a className={`adm-tile${tone?` adm-tile--${tone}`:''}`} href={href}><span>{label}</span><b>{value}</b></a>;
 return <Page title={intro?'Удирдлагын төв':'Хяналтын самбар'} actions={<button type="button" className="adm-btn" onClick={reload}>Шинэчлэх</button>}>
  {intro}
  {data.business&&<><h2 className="adm-h2">Бизнесийн байдал</h2><div className="adm-tiles">
   <Tile label="Нийт хэрэглэгч" value={data.business.customers} href={adminHref('users')}/><Tile label="Нийт компани" value={data.business.companies} href={adminHref('companies')}/><Tile label="Идэвхтэй бүртгэл" value={data.business.activeAccounts} href={adminHref('users')} tone="green"/><Tile label="Баталгаажаагүй бүртгэл" value={data.business.pendingAccounts} href={adminHref('users')} tone={data.business.pendingAccounts?'amber':undefined}/>
   <Tile label="Дууссан оношилгоо" value={data.business.completedDiagnoses} href={adminHref('companies')}/><Tile label="Явагдаж буй оношилгоо" value={data.business.diagnosesInProgress} href={adminHref('companies')} tone="blue"/>
  </div></>}
  {p&&<><h2 className="adm-h2">Төлбөр</h2><div className="adm-tiles">{p.paidInvoices!==undefined&&<Tile label="Төлөгдсөн нэхэмжлэх" value={p.paidInvoices} href={adminHref('payments')} tone="green"/>}{p.pendingInvoices!==undefined&&<Tile label="Төлбөр хүлээгдэж буй" value={p.pendingInvoices} href={adminHref('payments')} tone={p.pendingInvoices?'amber':undefined}/>}<Tile label="Төлбөрийн хүсэлт" value={p.openRequests} href={adminHref('payments')+'?tab=disputes'} tone={p.openRequests?'amber':undefined}/></div></>}
  {r&&<><h2 className="adm-h2">Тайлан хянах</h2><div className="adm-tiles">
   <Tile label="Хянахыг хүлээж буй" value={r.toReview+r.inReview+r.readyForApproval} href={adminHref('reports')} tone="blue"/><Tile label="Хугацаа хэтэрсэн" value={r.overdue} href={adminHref('reports')+'?overdue=1'} tone={r.overdue?'red':undefined}/>{r.generationFailed>0&&<Tile label="Төсөл үүсгэхэд алдаа" value={r.generationFailed} href={adminHref('reports')+'?status=GENERATION_FAILED'} tone="red"/>}
  </div></>}
  <h2 className="adm-h2">Дэмжлэг</h2><div className="adm-tiles"><Tile label="Хариулаагүй имэйл" value={data.support.mailUnanswered??0} href={adminHref('support')} tone={data.support.mailUnanswered?'amber':undefined}/><Tile label="Апп-аас ирсэн хүсэлт" value={data.support.open} href={adminHref('support')+'?tab=app'}/></div>
  {me.permissions.includes('reports.read')&&<p><a className="adm-btn adm-btn--primary" href={adminHref('reports')}>Тайлан хянах студи рүү очих</a></p>}
  <section className="adm-card"><h2>Сүүлийн үйл ажиллагаа</h2>{data.recentActivity.length===0?<Empty text="Үйл ажиллагаа бүртгэгдээгүй байна."/>:<ul className="adm-activity">{data.recentActivity.map((a:any,i:number)=><li key={i}><span>{actionMn(a.action)}</span><small>{fmt(a.createdAt)} · {a.outcome==='SUCCESS'?'амжилттай':'татгалзсан'}</small></li>)}</ul>}</section>
  <p className="adm-note">Тоонууд өгөгдлийн сангаас бодитоор тооцогдсон. Шинэчилсэн: {fmt(data.generatedAt)}{me.role!=='SUPER_ADMIN'?` · Таны эрх: ${me.role}`:''}</p>
 </Page>
}

/* The bell is a small panel, not a page: the latest alerts (new report, overdue, payment request) with one click to the item. */
function BellMenu({unread,onChanged}:{unread:number;onChanged:()=>void}){
 const [open,setOpen]=useState(false);const box=React.useRef<HTMLDivElement>(null);
 const {loading,error,data,reload}=useAsync(()=>open?adminApi.get('/notifications?page=1&pageSize=8'):Promise.resolve(null),[open]);
 useEffect(()=>{if(!open)return;const off=(e:MouseEvent)=>{if(box.current&&!box.current.contains(e.target as Node))setOpen(false)};const key=(e:KeyboardEvent)=>{if(e.key==='Escape')setOpen(false)};document.addEventListener('mousedown',off);document.addEventListener('keydown',key);return()=>{document.removeEventListener('mousedown',off);document.removeEventListener('keydown',key)}},[open]);
 const go=async(n:any)=>{if(!n.read)await adminApi.post(`/notifications/${n.id}/read`).catch(()=>undefined);setOpen(false);onChanged();window.location.hash=n.targetType==='REVIEW'?adminHref('reports',n.targetId):n.targetType==='DISPUTE'?adminHref('payments')+'?tab=disputes':n.targetType==='SUPPORT'?adminHref('support'):adminHref()};
 return <div className="adm-bellbox" ref={box}><button type="button" className="adm-bell" aria-haspopup="dialog" aria-expanded={open} aria-label={`Мэдэгдэл${unread?`, уншаагүй ${unread}`:''}`} onClick={()=>setOpen(o=>!o)}>🔔{unread>0&&<span className="adm-bell__n">{unread>99?'99+':unread}</span>}</button>
  {open&&<div className="adm-bellpanel" role="dialog" aria-label="Мэдэгдэл"><header><b>Мэдэгдэл</b><button type="button" className="adm-link" onClick={async()=>{await adminApi.post('/notifications/read-all').catch(()=>undefined);onChanged();reload()}}>Бүгдийг уншсан болгох</button></header>
   {loading?<Loading/>:error?<Err text={error} retry={reload}/>:!data||data.items.length===0?<Empty text="Мэдэгдэл алга."/>:<ul>{data.items.map((n:any)=><li key={n.id} className={n.read?'':'is-unread'}><button type="button" onClick={()=>void go(n)}><b>{n.title}</b><span>{n.body}</span><small>{fmt(n.createdAt)}</small></button></li>)}</ul>}</div>}
 </div>
}

function Notifications(){
 const [page,setPage]=useState(1);const [unread,setUnread]=useState(false);const [type,setType]=useState('');
 const {loading,error,data,reload}=useAsync(()=>adminApi.get(`/notifications?page=${page}&pageSize=20${unread?'&unread=1':''}${type?`&type=${type}`:''}`),[page,unread,type]);
 const open=async(n:any)=>{if(!n.read)await adminApi.post(`/notifications/${n.id}/read`).catch(()=>undefined);window.location.hash=n.targetType==='REVIEW'?adminHref('reports',n.targetId):n.targetType==='DISPUTE'?adminHref('payments')+'?tab=disputes':n.targetType==='SUPPORT'?adminHref('support',n.targetId):adminHref('notifications');reload()};
 return <Page title="Мэдэгдэл" actions={<button type="button" className="adm-btn" onClick={async()=>{await adminApi.post('/notifications/read-all');reload()}}>Бүгдийг уншсан болгох</button>}>
  <div className="adm-filters"><label><input type="checkbox" checked={unread} onChange={e=>{setUnread(e.target.checked);setPage(1)}}/> Зөвхөн уншаагүй</label>
   <label>Төрөл<select value={type} onChange={e=>{setType(e.target.value);setPage(1)}}><option value="">Бүгд</option>{['NEW_ASSESSMENT','DRAFT_READY','DRAFT_FAILED','REVIEW_ASSIGNED','DEADLINE_APPROACHING','REVIEW_OVERDUE','REPORT_APPROVED','REPORT_PUBLISHED','PAYMENT_DISPUTE','SUSPICIOUS_PAYMENT','SYSTEM_WARNING'].map(t=><option key={t} value={t}>{t}</option>)}</select></label></div>
  {loading?<Loading/>:error?<Err text={error} retry={reload}/>:data.items.length===0?<Empty text="Мэдэгдэл алга."/>:<><ul className="adm-notes">{data.items.map((n:any)=><li key={n.id} className={n.read?'':'is-unread'}><button type="button" onClick={()=>void open(n)}><span className={`adm-sev adm-sev--${n.severity}`}>{n.severity}</span><b>{n.title}</b><span>{n.body}</span><small>{fmt(n.createdAt)}</small></button></li>)}</ul><Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage}/></>}
  <p className="adm-note">Имэйл мэдэгдэл тохируулагдаагүй: мэдэгдэл зөвхөн энэ самбарт харагдана.</p>
 </Page>
}

function Settings({me}:{me:AdminMe}){
 const s=useAsync(()=>adminApi.get('/settings'),[]);const ops=useAsync(()=>adminApi.get('/ops'),[]);const [ap,setAp]=useState(1);const au=useAsync(()=>adminApi.get(`/audit?page=${ap}&pageSize=15`),[ap]);const [msg,setMsg]=useState('');
 const act=async(fn:()=>Promise<unknown>,ok:string)=>{setMsg('');try{await fn();setMsg(ok);s.reload()}catch(e){setMsg((e as Error).message)}};
 return <Page title="Тохиргоо">
  {msg&&<div className="adm-note" role="status">{msg}</div>}
  <section className="adm-card"><h2>Системийн төлөв</h2>{ops.data?<dl className="adm-dl"><dt>Өгөгдлийн сан</dt><dd>{ops.data.database==='ok'?'хэвийн':'алдаатай'}</dd><dt>Тайлангийн дараалал</dt><dd>{Object.entries(ops.data.queue).map(([k,v])=>`${STATUS_MN[k]??k}: ${v}`).join(', ')||'хоосон'}</dd><dt>Төсөл үүсгэхэд алдаатай</dt><dd>{ops.data.generationFailed}</dd><dt>Дундаж хяналтын хугацаа</dt><dd>{ops.data.averageReviewHours===null?'мэдээлэл алга':`${ops.data.averageReviewHours} цаг (${ops.data.sampleSize} тайлан)`}</dd><dt>AI үйлчилгээ</dt><dd>{ops.data.aiProvider==='openai'?'тохируулсан (засварын туслах баталгаажаагүй)':'идэвхгүй (mock горим)'}</dd><dt>Бүртгэл ба сэргээх имэйл</dt><dd>{ops.data.emailDelivery==='RESEND_CONFIGURED_NOT_VERIFIED'?'Resend тохируулсан · бодит хүргэлт баталгаажаагүй':ops.data.emailDelivery==='MOCK_LOCAL_ONLY'?'Зөвхөн дотоод тестийн шуудан':'Идэвхгүй'}</dd></dl>:ops.loading?<Loading/>:<Err text={ops.error} retry={ops.reload}/>}</section>
  <section className="adm-card"><h2>Администраторууд</h2>{s.data?<><table className="adm-table"><thead><tr><th>Имэйл</th><th>Эрх</th><th>Төлөв</th><th/></tr></thead><tbody>{s.data.admins.map((a:any)=><tr key={a.id}><td data-label="Имэйл">{a.email}</td><td data-label="Эрх">{a.role}</td><td data-label="Төлөв">{a.status}</td><td>{a.id!==me.id&&a.status!=='DISABLED'&&<button type="button" className="adm-btn" onClick={()=>void act(()=>adminApi.post(`/admins/${a.id}/disable`),'Админ хаагдлаа.')}>Хаах</button>}</td></tr>)}</tbody></table>
   <p className="adm-note">Шинэ админ нэмэх: серверийн терминалаас <code>npm run admin:bootstrap</code>. Нийтэд нээлттэй бүртгэл байхгүй. Report reviewer: {s.data.reportReviewRequired?'48 цагийн хяналт идэвхтэй':'48 цагийн хяналт унтраастай (MMRI_REPORT_REVIEW_REQUIRED)'}.</p></>:s.loading?<Loading/>:<Err text={s.error} retry={s.reload}/>}</section>
  <details className="adm-card adm-fold"><summary><h2>Үйл ажиллагааны бүртгэл</h2></summary>{au.data?<><table className="adm-table"><thead><tr><th>Цаг</th><th>Үйлдэл</th><th>Объект</th><th>Үр дүн</th></tr></thead><tbody>{au.data.items.map((a:any)=><tr key={a.id}><td data-label="Цаг">{fmt(a.createdAt)}</td><td data-label="Үйлдэл">{actionMn(a.action)}</td><td data-label="Объект">{a.targetType?`${targetMn(a.targetType)} ${String(a.targetId??'').slice(0,10)}`:'-'}</td><td data-label="Үр дүн">{a.outcome}</td></tr>)}</tbody></table><Pager page={au.data.page} pageSize={au.data.pageSize} total={au.data.total} onPage={setAp}/></>:au.loading?<Loading/>:<Err text={au.error} retry={au.reload}/>}</details>
 </Page>
}

export default function AdminApp(){
 useDomainTheme(null); // administration stays on the neutral sapphire theme
 usePrismBody(true);
 const [hash,setHash]=useState(window.location.hash);const [me,setMe]=useState<AdminMe|null>(null);const [state,setState]=useState<'loading'|'out'|'in'>(adminSession.token?'loading':'out');const [unread,setUnread]=useState(0);const [reauth,setReauth]=useState<null|((ok:boolean)=>void)>(null);const [menu,setMenu]=useState(false);
 useEffect(()=>{const h=()=>{setHash(window.location.hash);setMenu(false);window.scrollTo(0,0)};window.addEventListener('hashchange',h);return()=>window.removeEventListener('hashchange',h)},[]);
 const load=useCallback(async()=>{if(!adminSession.token){setState('out');return}try{const m=await adminApi.me();setMe(m);setUnread(m.unreadNotifications);setState('in')}catch{adminSession.token=null;setState('out')}},[]);
 useEffect(()=>{void load()},[load]);
 useEffect(()=>{setUnauthorizedHandler(()=>{setMe(null);setState('out');if(!/#\/admin\/login/.test(window.location.hash))window.location.hash=adminHref('login')});setReauthHandler(()=>new Promise<boolean>(resolve=>setReauth(()=>(ok:boolean)=>{setReauth(null);resolve(ok)})));return()=>{setUnauthorizedHandler(null);setReauthHandler(null)}},[]);
 useEffect(()=>{if(state!=='in')return;const t=window.setInterval(()=>{adminApi.me().then(m=>setUnread(m.unreadNotifications)).catch(()=>undefined)},30000);return()=>window.clearInterval(t)},[state]);
 const route=useMemo(()=>parse(hash),[hash]);
 useEffect(()=>{document.title='Удирдлагын төв · BusinessMRI.mn'},[]);
 if(state==='loading')return <main className="adm-login"><Loading/></main>;
 if(state==='out'||!me){if(route.section!=='login'&&hash!==adminHref('login')){window.location.hash=adminHref('login')}return <Login onLoggedIn={()=>{window.location.hash=adminHref();void load()}}/>}
 if(route.section==='login'){window.location.hash=adminHref();return null}
 const can=(perm:string)=>perm.split('|').some(p=>me.permissions.includes(p));
 const isSuper=can('accounts.manage');
 const logout=async()=>{try{await adminApi.logout()}catch{/* session may already be gone */}adminSession.token=null;setMe(null);setState('out');window.location.hash=adminHref('login')};
 const active=route.section;
 const studio=active==='reports';
 const controlItems:[string,string][]=isSuper?([['','Хяналтын самбар'],...SUPER_NAV.map(([k,l])=>[k,l] as [string,string]),['support','Дэмжлэг']] as [string,string][]).filter(([k])=>k===''||k==='access'||k==='users'||k==='companies'||k==='payments'||can(({support:'support.manage'} as any)[k])):NAV.filter(([k,,perm])=>!['reports','notifications','settings'].includes(k)&&can(perm)).map(([k,l])=>[k,l] as [string,string]);
 let body:React.ReactNode;
 if(active==='')body=isSuper?<SuperHome me={me}/>:<Dashboard me={me}/>;else if(active==='reports'&&can('reports.read'))body=<Suspense fallback={<Loading/>}><AdminReports id={route.id} query={route.query} me={me}/></Suspense>;
 else if(active==='users'&&isSuper)body=<Suspense fallback={<Loading/>}><AdminAccounts id={route.id} query={route.query} me={me}/></Suspense>;
 else if(active==='companies'&&isSuper)body=<Suspense fallback={<Loading/>}><AdminCompanies id={route.id} query={route.query} me={me}/></Suspense>;
 else if(active==='access'&&isSuper)body=<Suspense fallback={<Loading/>}><AdminAccess id={route.id} query={route.query} me={me}/></Suspense>;
 else if(active==='support'&&can('support.manage'))body=<Suspense fallback={<Loading/>}><AdminSupport id={route.id} query={route.query} me={me}/></Suspense>;
 else if(['companies','payments'].includes(active))body=<Suspense fallback={<Loading/>}><AdminData section={active} id={route.id} query={route.query} me={me}/></Suspense>;
 else if(active==='notifications')body=<Notifications/>;else if(active==='settings'&&can('admins.manage'))body=<Settings me={me}/>;else body=<Page title="Хандах эрхгүй"><Empty text="Энэ хэсэгт хандах эрх танд байхгүй байна."/></Page>;
 return <div className="adm-shell">
  <a className="adm-skip" href="#adm-main" onClick={e=>{e.preventDefault();document.getElementById('adm-main')?.focus()}}>Үндсэн агуулга руу шилжих</a>
  <header className="adm-top"><button type="button" className="adm-burger" aria-label="Цэс" aria-expanded={menu} onClick={()=>setMenu(!menu)}>☰</button><a className="adm-brand" href={adminHref()}>BusinessMRI.mn <b>Удирдлага</b></a><div className="adm-modes" role="tablist" aria-label="Админ хэсэг">{controlItems.length>0&&<a role="tab" aria-selected={!studio} className={`adm-mode${!studio?' is-active':''}`} href={adminHref()}>Удирдлагын төв</a>}{can('reports.read')&&<a role="tab" aria-selected={studio} className={`adm-mode adm-mode--studio${studio?' is-active':''}`} href={adminHref('reports')}>Тайлан хянах студи</a>}</div><div className="adm-top__right"><BellMenu unread={unread} onChanged={()=>void adminApi.me().then(m=>setUnread(m.unreadNotifications)).catch(()=>undefined)}/><span className="adm-who" title={me.email}>{me.email}<small>{me.role}</small></span><button type="button" className="adm-btn" onClick={()=>void logout()}>Гарах</button></div></header>
  <nav className={`adm-nav${menu?' is-open':''}${studio?' adm-nav--studio':''}`} aria-label={studio?'Тайлан хянах студи':'Удирдлагын төв'}>{studio?<>{STUDIO_STAGES.map(([st,label])=>{const q=route.query;const on=st==='overdue'?q.get('overdue')==='1':st==='returned'?q.get('returned')==='1':(q.get('status')||'')===st&&q.get('overdue')!=='1'&&q.get('returned')!=='1';return <a key={st||'all'} href={adminHref('reports')+(st==='overdue'?'?overdue=1':st==='returned'?'?returned=1':st?`?status=${st}`:'')} className={on?'is-active':''} aria-current={on?'page':undefined}>{label}</a>})}</>:controlItems.map(([k,label])=><a key={k} href={adminHref(k)} className={active===k?'is-active':''} aria-current={active===k?'page':undefined}>{label}</a>)}</nav>
  <main id="adm-main" className="adm-main" tabIndex={-1}>{body}</main>
  {reauth&&<ReauthModal onDone={reauth} onCancel={()=>reauth(false)}/>}
 </div>
}
