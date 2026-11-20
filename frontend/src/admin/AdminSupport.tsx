import React,{useState} from 'react';
import { adminApi,AdminApiError,fmt,type AdminMe } from './adminApi';
import { Page,Empty,Err,Loading,Pager,useAsync,adminHref } from './AdminApp';
import { Badge } from './AdminUi';
import AdminData from './AdminData';

/* "Дэмжлэг": one inbox for customer questions. Tab 1 = e-mails received on the business mailbox (Gmail), tab 2 = requests customers sent from inside the app.
   E-mail text is shown as plain text only (never as HTML). A reply goes to the sender of the conversation; nothing in Gmail is changed or deleted. */
function MailThread({id}:{id:string}){
 const {loading,error,data,reload}=useAsync(()=>adminApi.get(`/support-mail/${id}`),[id]);
 const [text,setText]=useState('');const [busy,setBusy]=useState(false);const [msg,setMsg]=useState<{t:'ok'|'err';m:string}|null>(null);
 if(loading&&!data)return <Page title="Имэйл"><Loading/></Page>;if(error||!data)return <Page title="Имэйл"><Err text={error} retry={reload}/></Page>;
 const t=data.thread,handled=t.status==='HANDLED';
 const run=async(fn:()=>Promise<unknown>,ok:string)=>{setBusy(true);setMsg(null);try{await fn();setMsg({t:'ok',m:ok});reload()}catch(e){setMsg({t:'err',m:(e as AdminApiError).message})}finally{setBusy(false)}};
 return <Page title={t.subject} actions={<a className="adm-btn" href={adminHref('support')}>‹ Дэмжлэг</a>}>
  {msg&&<div className={msg.t==='ok'?'adm-note adm-note--ok':'adm-error'} role={msg.t==='ok'?'status':'alert'}>{msg.m}</div>}
  <div className="adm-grid2"><section className="adm-card"><h2>Илгээгч</h2><dl className="adm-dl"><dt>Имэйл</dt><dd>{t.fromAddress}</dd>{t.fromName&&<><dt>Нэр</dt><dd>{t.fromName}</dd></>}<dt>Төлөв</dt><dd>{handled?<Badge tone="ok">Шийдвэрлэсэн</Badge>:<Badge tone="warn">Нээлттэй</Badge>}</dd></dl>
   {data.customer?<p className="adm-note">Бүртгэлтэй хэрэглэгч: <a className="adm-link" href={adminHref('users',data.customer.id)}>{data.customer.name||data.customer.email}</a>{data.customer.companies.length>0&&<> · {data.customer.companies.map((c:any)=><a key={c.id} className="adm-link" href={adminHref('companies',c.id)}>{c.name}</a>).reduce((a:any,b:any)=>[a,', ',b])}</>}</p>:<p className="adm-note">Энэ имэйл бүртгэлтэй хэрэглэгчтэй таарсангүй.</p>}
   <div className="adm-actions__row"><button type="button" className="adm-btn" disabled={busy} onClick={()=>void run(()=>adminApi.post(`/support-mail/${id}/handled`,{handled:!handled}),handled?'Дахин нээлээ.':'Шийдвэрлэсэн гэж тэмдэглэлээ.')}>{handled?'Дахин нээх':'Шийдвэрлэсэн гэж тэмдэглэх'}</button></div></section>
   <section className="adm-card"><h2>Хариу бичих</h2><label className="adm-field">Хариу (илгээгч рүү очно)<textarea rows={6} maxLength={5000} value={text} onChange={e=>setText(e.target.value)}/></label>
    <button type="button" className="adm-btn adm-btn--primary" disabled={busy||text.trim().length<2} onClick={()=>void run(async()=>{await adminApi.post(`/support-mail/${id}/reply`,{text});setText('')},'Хариу илгээгдлээ.')}>{busy?'Илгээж байна…':'Хариу илгээх'}</button></section></div>
  <section className="adm-card"><h2>Харилцан яриа</h2><ol className="adm-thread">{data.messages.map((m:any)=><li key={m.id} className={m.direction==='OUTBOUND'?'is-out':'is-in'}><header><b>{m.direction==='OUTBOUND'?'BusinessMRI':m.fromAddress}</b><small>{fmt(m.sentAt)}{m.attachments>0?` · ${m.attachments} хавсралт (харуулаагүй)`:''}</small></header><pre className="adm-mailtext">{m.bodyText}</pre></li>)}</ol></section>
 </Page>;
}

function MailInbox(){
 const [q,setQ]=useState('');const [applied,setApplied]=useState('');const [unanswered,setUnanswered]=useState(false);const [status,setStatus]=useState('');const [page,setPage]=useState(1);const [syncMsg,setSyncMsg]=useState('');const [syncing,setSyncing]=useState(false);
 const {loading,error,data,reload}=useAsync(()=>adminApi.get(`/support-mail?page=${page}&pageSize=20${applied?`&q=${encodeURIComponent(applied)}`:''}${unanswered?'&unanswered=1':''}${status?`&status=${status}`:''}`),[page,applied,unanswered,status]);
 const st=data?.status;
 const sync=async()=>{setSyncing(true);setSyncMsg('');try{const r=await adminApi.post('/support-mail/sync',{});setSyncMsg(r.error?r.error:r.skipped?r.skipped:`Шинэ имэйл: ${r.imported}`);reload()}catch(e){setSyncMsg((e as Error).message)}finally{setSyncing(false)}};
 return <>
  <div className="adm-note" role="status">{st?.connected?<>Имэйл холбогдсон{st.mailbox?`: ${st.mailbox}`:' (туршилтын горим)'}. Сүүлд шинэчилсэн: {fmt(st.lastSyncAt)}. {st.lastResult?.error&&<b className="adm-late">{st.lastResult.error}</b>}</>:'Дэмжлэгийн имэйл одоогоор холбогдоогүй байна. Эзэмшигч Gmail-ийг нэг удаа зөвшөөрсний дараа энд имэйлүүд харагдана.'} {st?.connected&&<button type="button" className="adm-link" disabled={syncing} onClick={()=>void sync()}>{syncing?'Шинэчилж байна…':'Шинэчлэх'}</button>} {syncMsg&&<span>{syncMsg}</span>}</div>
  <form className="adm-filters" onSubmit={e=>{e.preventDefault();setPage(1);setApplied(q.trim())}} role="search"><label>Хайх<input value={q} onChange={e=>setQ(e.target.value)} maxLength={80} placeholder="Имэйл, гарчиг, текст"/></label><label>Төлөв<select value={status} onChange={e=>{setStatus(e.target.value);setPage(1)}}><option value="">Бүгд</option><option value="OPEN">Нээлттэй</option><option value="HANDLED">Шийдвэрлэсэн</option></select></label><label className="adm-check"><input type="checkbox" checked={unanswered} onChange={e=>{setUnanswered(e.target.checked);setPage(1)}}/> Зөвхөн хариулаагүй</label><button type="submit" className="adm-btn">Хайх</button></form>
  {loading&&!data?<Loading/>:error?<Err text={error} retry={reload}/>:!data||data.items.length===0?<Empty text="Имэйл олдсонгүй."/>:<>
   <table className="adm-table"><thead><tr><th>Илгээгч</th><th>Гарчиг</th><th>Сүүлийн мессеж</th><th>Төлөв</th></tr></thead><tbody>{data.items.map((t:any)=><tr key={t.id} className={t.unanswered?'is-unanswered':''}>
    <td data-label="Илгээгч"><a className="adm-link" href={adminHref('support')+`?thread=${t.id}`}>{t.fromName||t.fromAddress}</a>{t.fromName&&<small className="adm-sub">{t.fromAddress}</small>}</td>
    <td data-label="Гарчиг"><b>{t.subject}</b><small className="adm-sub">{String(t.preview||'').replace(/\s+/g,' ').slice(0,110)}</small></td><td data-label="Сүүлийн мессеж">{fmt(t.lastMessageAt)}<small className="adm-sub">{t.messages} мессеж</small></td>
    <td data-label="Төлөв">{t.status==='HANDLED'?<Badge tone="ok">Шийдвэрлэсэн</Badge>:t.unanswered?<Badge tone="warn">Хариулаагүй</Badge>:<Badge tone="mute">Хариулсан</Badge>}</td></tr>)}</tbody></table>
   <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage}/></>}
 </>;
}

export default function AdminSupport({id,query,me}:{id:string;query:URLSearchParams;me:AdminMe}){
 const thread=query.get('thread');const tab=query.get('tab')==='app'||id?'app':'mail';
 if(thread)return <MailThread id={thread}/>;
 return <Page title="Дэмжлэг"><div className="adm-tabs" role="tablist"><a role="tab" aria-selected={tab==='mail'} className={tab==='mail'?'is-active':''} href={adminHref('support')}>Имэйл</a><a role="tab" aria-selected={tab==='app'} className={tab==='app'?'is-active':''} href={adminHref('support')+'?tab=app'}>Апп-аас ирсэн хүсэлт</a></div>
  {tab==='mail'?<MailInbox/>:<AdminData section="support" id={id} query={query} me={me}/>}</Page>;
}
