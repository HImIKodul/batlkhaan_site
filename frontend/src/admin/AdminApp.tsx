import React,{lazy,Suspense,useCallback,useEffect,useMemo,useRef,useState} from 'react';
import { adminApi,adminSession,fmt,setReauthHandler,setUnauthorizedHandler,AdminApiError,STATUS_MN,type AdminMe } from './adminApi';
import { usePrismBody } from '../design/prismPage';
import { useDomainTheme } from '../design/domainTheme';
import './admin.css';

const AdminReports=lazy(()=>import('./AdminReports'));
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

function ReauthModal({onDone,onCancel}:{onDone:(ok:boolean)=>void;onCancel:()=>void}){
 const [pw,setPw]=useState('');const [code,setCode]=useState('');const [err,setErr]=useState('');const [busy,setBusy]=useState(false);const first=useRef<HTMLInputElement>(null);
 useEffect(()=>{first.current?.focus()},[]);
 const submit=async(e:React.FormEvent)=>{e.preventDefault();setBusy(true);setErr('');try{await adminApi.reauth(pw,code.replace(/\s/g,''));onDone(true)}catch(x){setErr((x as Error).message)}finally{setBusy(false)}};
 return <div className="adm-modal" role="dialog" aria-modal="true" aria-labelledby="reauth-title"><form className="adm-modal__box" onSubmit={submit}><h2 id="reauth-title">Дахин баталгаажуулах</h2><p>Энэ үйлдэл нууц үг ба MFA кодоор дахин баталгаажуулахыг шаардана.</p>
  <label>Нууц үг<input ref={first} type="password" autoComplete="current-password" value={pw} onChange={e=>setPw(e.target.value)} required/></label>
  <label>MFA код (6 орон)<input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" value={code} onChange={e=>setCode(e.target.value)} required/></label>
  {err&&<div className="adm-error" role="alert">{err}</div>}<div className="adm-modal__row"><button type="button" className="adm-btn" onClick={onCancel}>Цуцлах</button><button type="submit" className="adm-btn adm-btn--primary" disabled={busy||pw.length<8||code.replace(/\s/g,'').length!==6}>Баталгаажуулах</button></div></form></div>
}

function Login({onLoggedIn}:{onLoggedIn:()=>void}){
 const [email,setEmail]=useState('');const [pw,setPw]=useState('');const [code,setCode]=useState('');const [err,setErr]=useState('');const [busy,setBusy]=useState(false);
 const submit=async(e:React.FormEvent)=>{e.preventDefault();setBusy(true);setErr('');try{const r=await adminApi.login(email.trim(),pw,code.replace(/\s/g,''));adminSession.token=r.token;setPw('');setCode('');onLoggedIn()}catch(x){setErr((x as AdminApiError).status===429?'Хэт олон буруу оролдлого. Түр хүлээгээд дахин оролдоно уу.':'Нэвтрэх мэдээлэл буруу байна.')}finally{setBusy(false)}};
 return <main className="adm-login"><form className="adm-login__card" onSubmit={submit}><div className="adm-login__brand">BUSINESSMRI.MN</div><h1 data-route-heading tabIndex={-1}>Удирдлагын төв</h1><p>Зөвхөн эрх бүхий администраторт.</p>
  <label>Имэйл<input type="email" autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)} required/></label>
  <label>Нууц үг<input type="password" autoComplete="current-password" value={pw} onChange={e=>setPw(e.target.value)} required/></label>
  <label>MFA код<input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" placeholder="000000" value={code} onChange={e=>setCode(e.target.value)} required/></label>
  {err&&<div className="adm-error" role="alert">{err}</div>}<button type="submit" className="adm-btn adm-btn--primary adm-btn--wide" disabled={busy||!email||!pw||code.replace(/\s/g,'').length!==6}>{busy?'Нэвтэрч байна':'Нэвтрэх'}</button></form></main>
}

const NAV:[string,string,string][]=[['','Хяналтын самбар','reports.read|payments.read|notifications.read'],['reports','Тайлангийн хяналт','reports.read'],['users','Хэрэглэгчид','accounts.manage'],['companies','Байгууллагууд','companies.read'],['payments','Төлбөрүүд','payments.read'],['support','Тусламж','support.manage'],['notifications','Мэдэгдэл','notifications.read'],['settings','Тохиргоо','admins.manage']];

/* SUPER_ADMIN sees four plain sections; the specialist tools (report review, support, notifications, administrators) stay available under «Бусад». */
const SUPER_NAV:[string,string,string][]=[['users','Хэрэглэгчид','Хэрэглэгч хайх, идэвхгүй болгох, имэйл засах'],['companies','Компаниуд','Компанийн мэдээлэл, хүмүүс, оношилгоо'],['access','Оношилгооны эрх','Чиглэл бүрийн оношилгооны эрх олгох, цуцлах'],['payments','Төлбөрүүд','Төлбөр, нэхэмжлэх, буцаалтын хүсэлт']];
const MORE_NAV:[string,string,string][]=[['reports','Тайлан хянах','reports.read'],['support','Тусламж','support.manage'],['notifications','Мэдэгдэл','notifications.read'],['settings','Тохиргоо','admins.manage']];
function SuperHome(){return <Page title="Удирдлагын төв"><p className="adm-note">Юу хийх вэ? Доорх дөрвөөс сонгоно уу.</p><div className="adm-home">{SUPER_NAV.map(([k,t,d])=><a key={k} className="adm-home__card" href={adminHref(k)}><b>{t}</b><span>{d}</span></a>)}</div></Page>}

function Dashboard({me}:{me:AdminMe}){
 const {loading,error,data,reload}=useAsync(()=>adminApi.get('/dashboard'),[]);
 if(loading)return <Page title="Хяналтын самбар"><Loading/></Page>;if(error||!data)return <Page title="Хяналтын самбар"><Err text={error} retry={reload}/></Page>;
 const r=data.reports,p=data.payments;
 const Tile=({label,value,href,tone}:{label:string;value:number;href:string;tone?:string})=><a className={`adm-tile${tone?` adm-tile--${tone}`:''}`} href={href}><span>{label}</span><b>{value}</b></a>;
 return <Page title="Хяналтын самбар" actions={<button type="button" className="adm-btn" onClick={reload}>Шинэчлэх</button>}>
  <div className="adm-tiles">
   {r&&<><Tile label="Хянах тайлан" value={r.toReview} href={adminHref('reports')+'?status=AWAITING_REVIEW'} tone="blue"/><Tile label="Хянаж байгаа" value={r.inReview} href={adminHref('reports')+'?status=IN_REVIEW'}/><Tile label="Батлахад бэлэн" value={r.readyForApproval} href={adminHref('reports')+'?status=READY_FOR_APPROVAL'} tone="green"/><Tile label="Хугацаа хэтэрсэн" value={r.overdue} href={adminHref('reports')+'?overdue=1'} tone={r.overdue?'red':undefined}/>{r.generationFailed>0&&<Tile label="Төсөл үүсгэхэд алдаа" value={r.generationFailed} href={adminHref('reports')+'?status=GENERATION_FAILED'} tone="red"/>}</>}
   {p&&<Tile label="Төлбөрийн хүсэлт" value={p.openRequests} href={adminHref('payments')+'?tab=disputes'} tone={p.openRequests?'amber':undefined}/>}
   <Tile label="Тусламжийн хүсэлт" value={data.support.open} href={adminHref('support')}/>
  </div>
  {r&&r.toReview+r.inReview+r.readyForApproval===0&&<Empty text="Одоогоор хянах тайлан алга."/>}
  <section className="adm-card"><h2>Сүүлийн үйл ажиллагаа</h2>{data.recentActivity.length===0?<Empty text="Үйл ажиллагаа бүртгэгдээгүй байна."/>:<ul className="adm-activity">{data.recentActivity.map((a:any,i:number)=><li key={i}><span>{a.action.replace(/_/g,' ').toLowerCase()}</span><small>{fmt(a.createdAt)} · {a.outcome==='SUCCESS'?'амжилттай':'татгалзсан'}</small></li>)}</ul>}</section>
  <p className="adm-note">Тоонууд өгөгдлийн сангаас бодитоор тооцогдсон. Шинэчилсэн: {fmt(data.generatedAt)}{me.role!=='SUPER_ADMIN'?` · Таны эрх: ${me.role}`:''}</p>
 </Page>
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
  <section className="adm-card"><h2>Системийн төлөв</h2>{ops.data?<dl className="adm-dl"><dt>Өгөгдлийн сан</dt><dd>{ops.data.database==='ok'?'хэвийн':'алдаатай'}</dd><dt>Тайлангийн дараалал</dt><dd>{Object.entries(ops.data.queue).map(([k,v])=>`${STATUS_MN[k]??k}: ${v}`).join(', ')||'хоосон'}</dd><dt>Төсөл үүсгэхэд алдаатай</dt><dd>{ops.data.generationFailed}</dd><dt>Дундаж хяналтын хугацаа</dt><dd>{ops.data.averageReviewHours===null?'мэдээлэл алга':`${ops.data.averageReviewHours} цаг (${ops.data.sampleSize} тайлан)`}</dd><dt>AI үйлчилгээ</dt><dd>{ops.data.aiProvider==='openai'?'тохируулсан (засварын туслах баталгаажаагүй)':'унтраастай (mock горим)'}</dd><dt>Имэйл илгээлт</dt><dd>боломжгүй (тохируулаагүй)</dd></dl>:ops.loading?<Loading/>:<Err text={ops.error} retry={ops.reload}/>}</section>
  <section className="adm-card"><h2>Администраторууд</h2>{s.data?<><table className="adm-table"><thead><tr><th>Имэйл</th><th>Эрх</th><th>Төлөв</th><th/></tr></thead><tbody>{s.data.admins.map((a:any)=><tr key={a.id}><td data-label="Имэйл">{a.email}</td><td data-label="Эрх">{a.role}</td><td data-label="Төлөв">{a.status}</td><td>{a.id!==me.id&&a.status!=='DISABLED'&&<button type="button" className="adm-btn" onClick={()=>void act(()=>adminApi.post(`/admins/${a.id}/disable`),'Админ хаагдлаа.')}>Хаах</button>}</td></tr>)}</tbody></table>
   <p className="adm-note">Шинэ админ нэмэх: серверийн терминалаас <code>npm run admin:bootstrap</code>. Нийтэд нээлттэй бүртгэл байхгүй. Report reviewer: {s.data.reportReviewRequired?'48 цагийн хяналт идэвхтэй':'48 цагийн хяналт унтраастай (MMRI_REPORT_REVIEW_REQUIRED)'}.</p></>:s.loading?<Loading/>:<Err text={s.error} retry={s.reload}/>}</section>
  <details className="adm-card adm-fold"><summary><h2>Үйл ажиллагааны бүртгэл</h2></summary>{au.data?<><table className="adm-table"><thead><tr><th>Цаг</th><th>Үйлдэл</th><th>Объект</th><th>Үр дүн</th></tr></thead><tbody>{au.data.items.map((a:any)=><tr key={a.id}><td data-label="Цаг">{fmt(a.createdAt)}</td><td data-label="Үйлдэл">{a.action}</td><td data-label="Объект">{a.targetType?`${a.targetType} ${String(a.targetId??'').slice(0,10)}`:'-'}</td><td data-label="Үр дүн">{a.outcome}</td></tr>)}</tbody></table><Pager page={au.data.page} pageSize={au.data.pageSize} total={au.data.total} onPage={setAp}/></>:au.loading?<Loading/>:<Err text={au.error} retry={au.reload}/>}</details>
 </Page>
}

export default function AdminApp(){
 useDomainTheme(null); // administration stays on the neutral sapphire theme
 usePrismBody();
 const [hash,setHash]=useState(window.location.hash);const [me,setMe]=useState<AdminMe|null>(null);const [state,setState]=useState<'loading'|'out'|'in'>(adminSession.token?'loading':'out');const [unread,setUnread]=useState(0);const [reauth,setReauth]=useState<null|((ok:boolean)=>void)>(null);const [menu,setMenu]=useState(false);
 useEffect(()=>{const h=()=>{setHash(window.location.hash);setMenu(false);window.scrollTo(0,0)};window.addEventListener('hashchange',h);return()=>window.removeEventListener('hashchange',h)},[]);
 const load=useCallback(async()=>{if(!adminSession.token){setState('out');return}try{const m=await adminApi.me();setMe(m);setUnread(m.unreadNotifications);setState('in')}catch{adminSession.token=null;setState('out')}},[]);
 useEffect(()=>{void load()},[load]);
 useEffect(()=>{setUnauthorizedHandler(()=>{setMe(null);setState('out');if(!/#\/admin\/login/.test(window.location.hash))window.location.hash=adminHref('login')});setReauthHandler(()=>new Promise<boolean>(resolve=>setReauth(()=>(ok:boolean)=>{setReauth(null);resolve(ok)})));return()=>{setUnauthorizedHandler(null);setReauthHandler(null)}},[]);
 useEffect(()=>{if(state!=='in')return;const t=window.setInterval(()=>{adminApi.me().then(m=>setUnread(m.unreadNotifications)).catch(()=>undefined)},30000);return()=>window.clearInterval(t)},[state]);
 const route=useMemo(()=>parse(hash),[hash]);
 useEffect(()=>{document.title='Удирдлагын төв · MMRI'},[]);
 if(state==='loading')return <main className="adm-login"><Loading/></main>;
 if(state==='out'||!me){if(route.section!=='login'&&hash!==adminHref('login')){window.location.hash=adminHref('login')}return <Login onLoggedIn={()=>{window.location.hash=adminHref();void load()}}/>}
 if(route.section==='login'){window.location.hash=adminHref();return null}
 const can=(perm:string)=>perm.split('|').some(p=>me.permissions.includes(p));
 const isSuper=can('accounts.manage');
 const items=isSuper?SUPER_NAV.map(([k,l])=>[k,l,''] as [string,string,string]):NAV.filter(([,,perm])=>can(perm));
 const more=isSuper?MORE_NAV.filter(([,,perm])=>can(perm)):[];
 const logout=async()=>{try{await adminApi.logout()}catch{/* session may already be gone */}adminSession.token=null;setMe(null);setState('out');window.location.hash=adminHref('login')};
 const active=route.section;
 let body:React.ReactNode;
 if(active==='')body=isSuper?<SuperHome/>:<Dashboard me={me}/>;else if(active==='reports'&&can('reports.read'))body=<Suspense fallback={<Loading/>}><AdminReports id={route.id} query={route.query} me={me}/></Suspense>;
 else if(active==='users'&&isSuper)body=<Suspense fallback={<Loading/>}><AdminAccounts id={route.id} query={route.query} me={me}/></Suspense>;
 else if(active==='companies'&&isSuper)body=<Suspense fallback={<Loading/>}><AdminCompanies id={route.id} query={route.query} me={me}/></Suspense>;
 else if(active==='access'&&isSuper)body=<Suspense fallback={<Loading/>}><AdminAccess id={route.id} query={route.query} me={me}/></Suspense>;
 else if(['companies','payments','support'].includes(active))body=<Suspense fallback={<Loading/>}><AdminData section={active} id={route.id} query={route.query} me={me}/></Suspense>;
 else if(active==='notifications')body=<Notifications/>;else if(active==='settings'&&can('admins.manage'))body=<Settings me={me}/>;else body=<Page title="Хандах эрхгүй"><Empty text="Энэ хэсэгт хандах эрх танд байхгүй байна."/></Page>;
 return <div className="adm-shell">
  <a className="adm-skip" href="#adm-main" onClick={e=>{e.preventDefault();document.getElementById('adm-main')?.focus()}}>Үндсэн агуулга руу шилжих</a>
  <header className="adm-top"><button type="button" className="adm-burger" aria-label="Цэс" aria-expanded={menu} onClick={()=>setMenu(!menu)}>☰</button><a className="adm-brand" href={adminHref()}>MMRI <b>Удирдлага</b></a><div className="adm-top__right"><a className="adm-bell" href={adminHref('notifications')} aria-label={`Мэдэгдэл${unread?`, уншаагүй ${unread}`:''}`}>🔔{unread>0&&<span className="adm-bell__n">{unread>99?'99+':unread}</span>}</a><span className="adm-who" title={me.email}>{me.email}<small>{me.role}</small></span><button type="button" className="adm-btn" onClick={()=>void logout()}>Гарах</button></div></header>
  <nav className={`adm-nav${menu?' is-open':''}`} aria-label="Үндсэн цэс">{isSuper?<>{items.map(([k,label])=><a key={k} href={adminHref(k)} className={active===k?'is-active':''} aria-current={active===k?'page':undefined}>{label}</a>)}{more.length>0&&<details className="adm-more" open={more.some(([k])=>k===active)||undefined}><summary>Бусад</summary>{more.map(([k,label])=><a key={k} href={adminHref(k)} className={`is-secondary${active===k?' is-active':''}`} aria-current={active===k?'page':undefined}>{label}</a>)}</details>}</>:items.map(([k,label])=>{const secondary=k==='notifications'||k==='settings';return <React.Fragment key={k}>{k==='notifications'&&<span className="adm-nav__sep" role="separator"/>}<a href={adminHref(k)} className={`${active===k?'is-active':''}${secondary?' is-secondary':''}`.trim()} aria-current={active===k?'page':undefined}>{label}</a></React.Fragment>})}</nav>
  <main id="adm-main" className="adm-main" tabIndex={-1}>{body}</main>
  {reauth&&<ReauthModal onDone={reauth} onCancel={()=>reauth(false)}/>}
 </div>
}
