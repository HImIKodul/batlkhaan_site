import React,{useEffect,useMemo,useState} from 'react';
import { adminApi,AdminApiError,fmt,hoursLeft,STATUS_MN,DOMAIN_MN,type AdminMe } from './adminApi';
import { Page,Empty,Err,Loading,Pager,useAsync,adminHref } from './AdminApp';

const EVIDENCE_MN:Record<string,string>={DIRECTLY_MEASURED:'Шууд хэмжсэн',INFERRED:'Дүгнэсэн',INSUFFICIENT_EVIDENCE:'Нотолгоо хангалтгүй',NOT_APPLICABLE:'Хамаарахгүй'};

function Queue({query}:{query:URLSearchParams}){
 const [status,setStatus]=useState(query.get('status')||'');const [domain,setDomain]=useState('');const [q,setQ]=useState('');const [sort,setSort]=useState('deadline');const [page,setPage]=useState(1);const overdue=query.get('overdue')==='1';
 const url=`/reviews?page=${page}&pageSize=15&sort=${sort}${status?`&status=${status}`:''}${domain?`&domain=${domain}`:''}${q?`&q=${encodeURIComponent(q)}`:''}${overdue?'&overdue=1':''}`;
 const {loading,error,data,reload}=useAsync(()=>adminApi.get(url),[url]);
 return <Page title="Тайлангийн хяналт">
  <form className="adm-filters" onSubmit={e=>e.preventDefault()} role="search"><label>Хайх<input type="search" value={q} onChange={e=>{setQ(e.target.value);setPage(1)}} placeholder="Байгууллагын нэр"/></label>
   <label>Төлөв<select value={status} onChange={e=>{setStatus(e.target.value);setPage(1)}}><option value="">Бүгд</option>{Object.entries(STATUS_MN).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
   <label>Чиглэл<select value={domain} onChange={e=>{setDomain(e.target.value);setPage(1)}}><option value="">Бүгд</option>{Object.entries(DOMAIN_MN).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
   <label>Эрэмбэ<select value={sort} onChange={e=>setSort(e.target.value)}><option value="deadline">Хугацаа ойр</option><option value="submitted">Сүүлд илгээсэн</option></select></label>{overdue&&<span className="adm-chip">Хугацаа хэтэрсэн</span>}</form>
  {loading?<Loading/>:error?<Err text={error} retry={reload}/>:data.items.length===0?<Empty text="Шүүлтүүрт тохирох тайлан олдсонгүй."/>:<>
   <table className="adm-table"><thead><tr><th>Байгууллага</th><th>Чиглэл</th><th>Төлөв</th><th>Илгээсэн</th><th>Хугацаа</th><th/></tr></thead><tbody>{data.items.map((r:any)=><tr key={r.id} className={r.overdue?'is-overdue':''}>
    <td data-label="Байгууллага"><a href={adminHref('reports',r.id)}>{r.company||'-'}</a></td><td data-label="Чиглэл">{DOMAIN_MN[r.domain]??r.domain}</td><td data-label="Төлөв"><span className={`adm-status adm-status--${r.status}`}>{STATUS_MN[r.status]??r.status}</span></td><td data-label="Илгээсэн">{fmt(r.submittedAt)}</td>
    <td data-label="Хугацаа">{r.status==='PUBLISHED'?'нийтлэгдсэн':r.overdue?<b className="adm-late">хэтэрсэн</b>:`${hoursLeft(r.deadlineAt)} цаг үлдсэн`}</td><td><a className="adm-btn" href={adminHref('reports',r.id)}>Нээх</a></td></tr>)}</tbody></table>
   <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage}/></>}
 </Page>
}

function Evidence({id}:{id:string}){
 const [cap,setCap]=useState('');const [state,setState]=useState('');const [finding,setFinding]=useState('');const [q,setQ]=useState('');const [open,setOpen]=useState<string|null>(null);
 const {loading,error,data,reload}=useAsync(()=>adminApi.get(`/reviews/${id}/evidence?${new URLSearchParams({...(cap?{capability:cap}:{}),...(state?{state}:{}),...(finding?{finding}:{}),...(q?{q}:{})})}`),[id,cap,state,finding,q]);
 const [all,setAll]=useState<any[]>([]);useEffect(()=>{if(data&&!cap&&!state&&!finding&&!q)setAll(data.capabilities)},[data,cap,state,finding,q]);
 return <section className="adm-card" aria-label="Оношилгооны нотолгоо"><h2>Оношилгооны нотолгоо</h2><p className="adm-note">Зөвхөн унших. Хариулт болон тооцоолол өөрчлөгдөхгүй.</p>
  <div className="adm-filters adm-filters--stack"><label>Чадавх<select value={cap} onChange={e=>setCap(e.target.value)}><option value="">Бүгд</option>{all.map(c=><option key={c.categoryId} value={c.categoryId}>{c.code} {c.name}</option>)}</select></label>
   <label>Нотолгооны төлөв<select value={state} onChange={e=>setState(e.target.value)}><option value="">Бүгд</option>{Object.entries(EVIDENCE_MN).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
   <label>Дүгнэлт<select value={finding} onChange={e=>setFinding(e.target.value)}><option value="">Бүгд</option><option value="strength">Давуу тал</option><option value="weakness">Сул тал</option></select></label>
   <label>Хайх<input type="search" value={q} onChange={e=>setQ(e.target.value)} placeholder="Чадавхын нэр"/></label></div>
  {loading?<Loading/>:error?<Err text={error} retry={reload}/>:<><p className="adm-note">Аргачлал: {data.methodologyVersion}. {data.capabilities.length} чадавх.</p><ul className="adm-evcaps">{data.capabilities.map((c:any)=>{
   const shown=c.cells.filter((x:any)=>state||x.evidenceState!=='INSUFFICIENT_EVIDENCE'||x.answers.length>0);const isOpen=open===c.categoryId||Boolean(cap);
   return <li key={c.categoryId}><button type="button" className="adm-evcap" aria-expanded={isOpen} onClick={()=>setOpen(isOpen&&!cap?null:c.categoryId)}><b>{c.code} {c.name}</b><span>{c.partialScore===null?'-':Math.round(c.partialScore)} оноо{c.finding?` · ${c.finding==='STRENGTH'?'давуу тал':'сул тал'}${c.findingBasis==='RELATIVE_RANK'?' (харьцангуй эрэмбэ, босго хангаагүй)':' (баталгаажсан)'}`:''}</span><small>нотолгоотой нүд {shown.length} / хамрах хүрээ {c.coverage===null?'-':Math.round(c.coverage*100)+'%'}</small></button>
    {isOpen&&<div className="adm-evcells">{shown.length===0?<Empty text="Энэ чадавхад хэмжсэн нотолгоо алга."/>:shown.map((x:any)=><div key={x.cell} className="adm-evcell"><div className="adm-evcell__head"><b>{x.cell}</b><span className={`adm-status adm-status--${x.evidenceState}`}>{EVIDENCE_MN[x.evidenceState]}</span><small>оноо {x.score===null?'-':Math.round(x.score)} · итгэлцэл {x.confidence===null?'-':x.confidence.toFixed(2)} · шууд хариулт {x.directAnswers}</small></div>
     {x.answers.map((a:any)=><div key={a.questionId} className="adm-evq"><p>{a.question}</p><p><b>Хариулт:</b> {a.answer??`сонголт ${a.optionIndex}`}{a.scoreContribution!==null&&<small> · оноонд оруулах хувь {a.scoreContribution}</small>}{a.answerState&&a.answerState!=='SCORED'&&<small> · {a.answerState}</small>}</p></div>)}</div>)}</div>}</li>})}</ul></>}
 </section>
}

function Editor({id,me}:{id:string;me:AdminMe}){
 const {loading,error,data,reload}=useAsync(()=>adminApi.get(`/reviews/${id}`),[id]);
 const [edits,setEdits]=useState<Record<string,string>>({});const [reason,setReason]=useState('');const [msg,setMsg]=useState<{t:'ok'|'err';m:string}|null>(null);const [busy,setBusy]=useState(false);const [cmp,setCmp]=useState<any>(null);const [aiBusy,setAiBusy]=useState(false);
 useEffect(()=>{setEdits({});setReason('')},[data?.revision]);
 const can=(p:string)=>me.permissions.includes(p);
 const claims:any[]=data?.claims??[];const sections=useMemo(()=>{const m=new Map<string,{title:string;items:any[]}>();for(const c of claims){if(!m.has(c.sectionId))m.set(c.sectionId,{title:c.sectionTitle,items:[]});m.get(c.sectionId)!.items.push(c)}return [...m.entries()]},[claims]);
 if(loading)return <Page title="Тайлангийн хяналт"><Loading/></Page>;if(error||!data)return <Page title="Тайлангийн хяналт"><Err text={error||'Олдсонгүй'} retry={reload}/></Page>;
 const r=data.review;const dirty=Object.entries(edits).filter(([k,v])=>claims.find(c=>c.claimId===k)?.text!==v);const editable=['IN_REVIEW','READY_FOR_APPROVAL','APPROVED'].includes(r.status)&&can('reports.edit');
 const run=async(fn:()=>Promise<unknown>,ok:string)=>{setBusy(true);setMsg(null);try{await fn();setMsg({t:'ok',m:ok});reload()}catch(e){const x=e as AdminApiError;setMsg({t:'err',m:x.status===409?`${x.message} Хуудсыг шинэчилж байна.`:x.message});if(x.status===409)reload()}finally{setBusy(false)}};
 const save=()=>run(()=>adminApi.put(`/reviews/${id}/draft`,{baseRevision:data.revision,reason,edits:dirty.map(([claimId,text])=>({claimId,text}))}),'Хувилбар хадгалагдлаа.');
 const compare=async(n:number)=>{try{const old=await adminApi.get(`/reviews/${id}/revisions/${n}`);setCmp({n,claims:old.claims})}catch(e){setMsg({t:'err',m:(e as Error).message})}};
 const suggest=async(claimIds?:string[])=>{setAiBusy(true);setMsg(null);try{const o=await adminApi.post(`/reviews/${id}/ai/suggest`,{claimIds});setMsg({t:'ok',m:o.created?`${o.created} санал үүслээ (${o.source==='MOCK'?'mock горим: дүрэмд суурилсан':'AI'}).`:'Санал болгох засвар олдсонгүй.'});reload()}catch(e){setMsg({t:'err',m:(e as Error).message})}finally{setAiBusy(false)}};
 const status=STATUS_MN[r.status]??r.status;
 return <Page title={`${data.company?.name??'Байгууллага'} · ${DOMAIN_MN[r.domainCode]??r.domainCode}`} actions={<a className="adm-btn" href={adminHref('reports')}>Жагсаалт руу</a>}>
  <div className="adm-editor">
   <aside className="adm-col adm-col--left"><section className="adm-card"><h2>Байгууллага</h2><dl className="adm-dl"><dt>Нэр</dt><dd>{data.company?.name}</dd><dt>Салбар</dt><dd>{data.company?.industry||'-'}</dd><dt>Ажилтан</dt><dd>{data.company?.employeeCount??'-'}</dd><dt>Нийт оноо</dt><dd>{data.assessment?.score===null||data.assessment?.score===undefined?'-':Math.round(Number(data.assessment.score))}</dd><dt>Хамрах хүрээ</dt><dd>{data.assessment?.coverage==null?'-':Math.round(Number(data.assessment.coverage)*100)+'%'}</dd><dt>Аргачлал</dt><dd>{data.assessment?.methodologyVersion}</dd><dt>Илгээсэн</dt><dd>{fmt(r.submittedAt)}</dd></dl></section>
    <Evidence id={id}/></aside>
   <section className="adm-col adm-col--center" aria-label="Тайлангийн төсөл">
    {msg&&<div className={msg.t==='ok'?'adm-note adm-note--ok':'adm-error'} role={msg.t==='ok'?'status':'alert'}>{msg.m}</div>}
    {!editable&&<div className="adm-note" role="status">{r.status==='AWAITING_REVIEW'?'Засахын өмнө хяналтыг авна уу.':r.status==='PUBLISHED'?'Нийтлэгдсэн тайланг энд засахгүй.':'Энэ төлөвт засах боломжгүй.'}</div>}
    {sections.map(([sid,sec])=><section key={sid} className="adm-card"><h2>{sec.title}</h2>{sec.items.map((c:any)=>{const val=edits[c.claimId]??c.text;const sg=data.suggestions.filter((x:any)=>x.claimId===c.claimId);return <div key={c.claimId} className="adm-claim"><label htmlFor={`c-${c.claimId}`}>{c.claimId}</label>
     <textarea id={`c-${c.claimId}`} value={val} rows={Math.min(8,Math.max(2,Math.ceil(val.length/90)))} readOnly={!editable} onChange={e=>setEdits({...edits,[c.claimId]:e.target.value})}/>
     {editable&&<button type="button" className="adm-link" disabled={aiBusy} onClick={()=>void suggest([c.claimId])}>AI санал авах</button>}
     {sg.map((s:any)=><div key={s.id} className="adm-sugg" role="group" aria-label="AI санал"><div><small>Эх текст</small><p>{s.original}</p></div><div><small>Санал болгосон</small><p>{s.suggested}</p></div><p><b>Шалтгаан:</b> {s.reason}</p><p><small>Нотолгоо: {(s.evidence??[]).map((e:any)=>e.ref).join(', ')||'-'} · Анхааруулга: {s.warning}</small></p>
      <div className="adm-sugg__row"><button type="button" className="adm-btn adm-btn--primary" disabled={busy} onClick={()=>void run(()=>adminApi.post(`/reviews/${id}/ai/suggestions/${s.id}/apply`,{baseRevision:data.revision}),'Санал хэрэглэгдлээ.')}>Саналыг хэрэглэх</button><button type="button" className="adm-btn" disabled={busy} onClick={()=>void run(()=>adminApi.post(`/reviews/${id}/ai/suggestions/${s.id}/reject`),'Санал татгалзагдлаа.')}>Татгалзах</button><button type="button" className="adm-btn" disabled={aiBusy} onClick={()=>void suggest([c.claimId])}>Дахин боловсруулах</button></div></div>)}</div>})}</section>)}
   </section>
   <aside className="adm-col adm-col--right"><section className="adm-card"><h2>Төлөв</h2><p><span className={`adm-status adm-status--${r.status}`}>{status}</span></p><dl className="adm-dl"><dt>Хугацаа</dt><dd>{r.status==='PUBLISHED'?'нийтлэгдсэн':hoursLeft(r.deadlineAt)<0?<b className="adm-late">хэтэрсэн ({Math.abs(hoursLeft(r.deadlineAt))} цаг)</b>:`${hoursLeft(r.deadlineAt)} цаг үлдсэн`}</dd><dt>Хувилбар</dt><dd>{data.revision}</dd><dt>AI</dt><dd>{data.aiMode==='MOCK'?'mock горим':'тохируулсан, засварт баталгаажаагүй'}</dd></dl>
    {r.lastError&&<div className="adm-error">{r.lastError}</div>}
    {data.validation&&<div className={`adm-valid adm-valid--${data.validation.state}`}><b>{data.validation.state==='PASS'?'Баталгаажуулалт тэнцсэн':data.validation.state==='REPAIR_REQUIRED'?'Засвар шаардлагатай':'Нийтлэх боломжгүй'}</b>{data.validation.issues.slice(0,6).map((i:any,k:number)=><p key={k}><small>{i.checkId}: {i.message}</small></p>)}</div>}
    <div className="adm-actions">
     {r.status==='AWAITING_REVIEW'&&can('reports.edit')&&<button type="button" className="adm-btn adm-btn--primary" disabled={busy} onClick={()=>void run(()=>adminApi.post(`/reviews/${id}/claim`),'Хяналтыг авлаа.')}>Хяналтыг авах</button>}
     {r.status==='GENERATION_FAILED'&&can('reports.edit')&&<button type="button" className="adm-btn" disabled={busy} onClick={()=>void run(()=>adminApi.post(`/reviews/${id}/regenerate-draft`),'Төсөл дахин үүсгэж байна.')}>Төсөл дахин үүсгэх</button>}
     {editable&&<><label className="adm-reason">Засварын шалтгаан<input value={reason} onChange={e=>setReason(e.target.value)} placeholder="Яагаад засав?" maxLength={500}/></label>
      <button type="button" className="adm-btn adm-btn--primary" disabled={busy||dirty.length===0||reason.trim().length<3} onClick={()=>void save()}>Хадгалах{dirty.length?` (${dirty.length})`:''}</button></>}
     {r.status==='IN_REVIEW'&&can('reports.edit')&&<button type="button" className="adm-btn" disabled={busy||dirty.length>0} onClick={()=>void run(()=>adminApi.post(`/reviews/${id}/ready`),'Батлахад бэлэн боллоо.')}>Батлахад бэлэн болгох</button>}
     {(r.status==='READY_FOR_APPROVAL'||r.status==='APPROVED')&&can('reports.edit')&&<button type="button" className="adm-btn" disabled={busy} onClick={()=>void run(()=>adminApi.post(`/reviews/${id}/return`),'Дахин хяналтад буцаалаа.')}>Дахин хянуулах</button>}
     {r.status==='READY_FOR_APPROVAL'&&can('reports.approve')&&<button type="button" className="adm-btn adm-btn--primary" disabled={busy} onClick={()=>void run(()=>adminApi.post(`/reviews/${id}/approve`,{baseRevision:data.revision}),'Тайлан батлагдлаа.')}>Батлах</button>}
     {r.status==='APPROVED'&&can('reports.publish')&&<button type="button" className="adm-btn adm-btn--primary" disabled={busy} onClick={()=>void run(()=>adminApi.post(`/reviews/${id}/publish`),'Тайлан нийтлэгдлээ. Хэрэглэгч харах боломжтой боллоо.')}>Нийтлэх</button>}
     {editable&&dirty.length>0&&<button type="button" className="adm-link" onClick={()=>setEdits({})}>Хадгалаагүй өөрчлөлтийг болих</button>}
     {editable&&<button type="button" className="adm-btn" disabled={aiBusy} onClick={()=>void suggest()}>AI санал авах (бүх хэсэг)</button>}
    </div></section>
    <section className="adm-card"><h2>Хувилбарын түүх</h2><ul className="adm-revs">{data.revisions.map((v:any)=><li key={v.revision}><b>#{v.revision}</b> {v.source==='GENERATED'?'автомат төсөл':v.source==='AI_APPLIED'?'AI санал':v.source==='RESTORED'?'сэргээсэн':'гар засвар'}<small>{fmt(v.createdAt)}{v.reason?` · ${v.reason}`:''}</small>{v.revision!==data.revision&&<button type="button" className="adm-link" onClick={()=>void compare(v.revision)}>Өмнөх хувилбартай харьцуулах</button>}{editable&&v.revision!==data.revision&&<button type="button" className="adm-link" disabled={busy} onClick={()=>void run(()=>adminApi.post(`/reviews/${id}/restore`,{baseRevision:data.revision,revision:v.revision}),`Хувилбар ${v.revision}-г сэргээлээ.`)}>Сэргээх</button>}</li>)}</ul>
     {cmp&&<div className="adm-cmp" role="region" aria-label={`Хувилбар ${cmp.n}-тай харьцуулалт`}><b>Хувилбар {cmp.n} ба одоогийн ялгаа</b>{(()=>{const diffs=claims.filter(c=>cmp.claims.find((o:any)=>o.claimId===c.claimId)?.text!==c.text);return diffs.length===0?<Empty text="Ялгаа алга."/>:diffs.map(c=><div key={c.claimId}><small>{c.claimId}</small><p className="adm-del">{cmp.claims.find((o:any)=>o.claimId===c.claimId)?.text}</p><p className="adm-ins">{c.text}</p></div>)})()}<button type="button" className="adm-link" onClick={()=>setCmp(null)}>Хаах</button></div>}</section></aside>
  </div>
 </Page>
}

export default function AdminReports({id,query,me}:{id:string;query:URLSearchParams;me:AdminMe}){return id?<Editor id={id} me={me}/>:<Queue query={query}/>}
