import React,{useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import { adminApi,AdminApiError,fmt,type AdminMe } from './adminApi';
import { Page,Empty,Err,Loading,useAsync,adminHref } from './AdminApp';
import { buildReportModel,mnCustomerText,PageOne,PageTwo,PageThree } from '../pages/Report';
import AnnualPlanEditor from './AnnualPlanEditor';
import { Evidence } from './AdminReports';
import { businessAreaById,type BusinessAreaId } from '../data/businessEvaluation';
import { useDomainTheme } from '../design/domainTheme';

/* Review page: the administrator edits the customer's REAL report. The three pages are the customer's own components fed with the current draft; clicking a paragraph
   that comes from the approved narrative opens it for editing. Only narrative wording can change (scores, answers, evidence, company and domain come from the frozen payload).
   One editor per report: the server lock is taken on open, renewed every minute and released on leave; another administrator sees the report read-only. */
const norm=(s:string)=>s.replace(/\s+/g,' ').trim();
/* Executive conclusion (S10) length contract, validator V27: 80-160 words counted as trimmed text split on whitespace (same rule as the server). */
const CONC_MIN=80,CONC_MAX=160;const wc=(t:string)=>t.trim()?t.trim().split(/\s+/).length:0;
const describeIssue=(i:{checkId:string;message:string})=>i.checkId==='V27'?`Ерөнхий дүгнэлт ${CONC_MIN}-${CONC_MAX} үгтэй байх ёстой (${/\((\d+)\)/.exec(i.message)?.[1]??'?'} үг).`:i.message;
type Finding={id:string;claimId:string|null;layer:'LOCAL'|'SPELLING'|'AI';kind:string;severity:'info'|'warn'|'high';message:string;original?:string;suggestion?:string};
type Scan={findings:Finding[];layers:{local:string;spelling:string;ai:string;aiDetail:string|null;spellingDetail:string|null};checkedClaims:number;checkedWords:number};
const LAYER_MN:Record<string,string>={LOCAL:'Дотоод шалгалт',SPELLING:'Үгийн зөв бичлэг',AI:'AI'};
const AI_MN:Record<string,string>={RAN:'ажилласан',NOT_ENABLED:'идэвхжээгүй',UNAVAILABLE:'боломжгүй'};

export default function ReviewReportEditor({id,me}:{id:string;me:AdminMe}){
 const [tick,setTick]=useState(0);const reload=()=>setTick(t=>t+1);
 const view=useAsync(()=>adminApi.get(`/reviews/${id}/report-view`),[id,tick]);
 const meta=useAsync(()=>adminApi.get(`/reviews/${id}`),[id,tick]);
 const [edits,setEdits]=useState<Record<string,string>>({});const [editing,setEditing]=useState<{claimId:string;text:string}|null>(null);
 const [busy,setBusy]=useState(false);const [msg,setMsg]=useState<{t:'ok'|'err';m:string}|null>(null);const [lockMsg,setLockMsg]=useState('');const [confirm,setConfirm]=useState(false);const [checked,setChecked]=useState(false);
 const [scan,setScan]=useState<Scan|null>(null);const [scanBusy,setScanBusy]=useState(false);const [dismissed,setDismissed]=useState<Set<string>>(new Set());const [showScan,setShowScan]=useState(false);const [panel,setPanel]=useState<''|'plan'|'answers'|'reject'>('');const [rejectReason,setRejectReason]=useState('');
 const wrap=useRef<HTMLDivElement>(null);const can=(p:string)=>me.permissions.includes(p);
 const r=meta.data?.review;const status:string=r?.status??'';const allClaims:any[]=meta.data?.claims??[];const claims:any[]=allClaims.filter(c=>c.editable!==false);const fixedCount=allClaims.length-claims.length;
 const editableState=['IN_REVIEW','READY_FOR_APPROVAL','APPROVED'].includes(status)&&can('reports.edit');
 const [viewOnly,setViewOnly]=useState(false);
 // ---- lock: take when the review is in an editable state, renew every minute, release on leave
 useEffect(()=>{if(!editableState)return;let live=true;const take=async()=>{try{await adminApi.post(`/reviews/${id}/lock`,{});if(live){setViewOnly(false);setLockMsg('')}}catch(e){const x=e as AdminApiError;if(live){setViewOnly(true);setLockMsg(x.message)}}};void take();const t=window.setInterval(()=>void take(),60_000);
  return()=>{live=false;window.clearInterval(t);void adminApi.post(`/reviews/${id}/unlock`,{}).catch(()=>undefined)}},[id,editableState]);
 const area=useMemo(()=>businessAreaById((view.data?.domainCode??'marketing') as BusinessAreaId),[view.data?.domainCode]);
 useDomainTheme(area.id);
 const narrative=useMemo(()=>{const n=view.data?.report?.narrative;if(!n)return null;const c=JSON.parse(JSON.stringify(n));for(const s of c.sections)for(const cl of s.claims)if(edits[cl.reportClaimId]!==undefined)cl.textMn=edits[cl.reportClaimId];return c},[view.data,edits]);
 const model=useMemo(()=>view.data&&narrative?buildReportModel(area,view.data.companyName,undefined,view.data.results,view.data.report.payload,{...view.data.report,narrative}):null,[view.data,narrative,area]);
 const claimText=(c:any)=>edits[c.claimId]??c.text;
 // ---- map claim text to the rendered elements of the real report (leaf elements whose text equals the claim text)
 const [unmatched,setUnmatched]=useState<string[]>([]);
 useLayoutEffect(()=>{const root=wrap.current;if(!root||!model)return;const map=new Map<string,string>();for(const c of claims){const t=claimText(c);map.set(norm(t),c.claimId);map.set(norm(mnCustomerText(t)),c.claimId)}
  const hit=new Set<string>();root.querySelectorAll<HTMLElement>('[data-claim]').forEach(e=>{e.removeAttribute('data-claim');e.classList.remove('ad-edit','ad-dirty')});
  root.querySelectorAll<HTMLElement>('p,span,h4,li,div,strong,small,blockquote').forEach(el=>{const t=norm(el.textContent||'');const cid=map.get(t);if(!cid||t.length<8)return;if(Array.from(el.children).some(ch=>norm(ch.textContent||'')===t))return;if(el.closest('[data-claim]'))return;el.dataset.claim=cid;el.classList.add('ad-edit');if(edits[cid]!==undefined)el.classList.add('ad-dirty');hit.add(cid)});
  const um=claims.filter(c=>!hit.has(c.claimId)).map(c=>c.claimId);setUnmatched(prev=>prev.join('|')===um.join('|')?prev:um)});
 const onWrapClick=(e:React.MouseEvent)=>{if(viewOnly||!editableState)return;const el=(e.target as HTMLElement).closest('[data-claim]') as HTMLElement|null;if(!el)return;const cid=el.dataset.claim!;const c=claims.find(x=>x.claimId===cid);if(c){e.preventDefault();setEditing({claimId:cid,text:claimText(c)})}};
 const dirty=Object.keys(edits).length;
 const conclusion=claims.find(c=>c.sectionId==='S10');const concWords=conclusion?wc(claimText(conclusion)):0;const concOk=!conclusion||(concWords>=CONC_MIN&&concWords<=CONC_MAX);
 const run=async(fn:()=>Promise<any>,ok:(o:any)=>string)=>{setBusy(true);setMsg(null);try{const o=await fn();setMsg({t:'ok',m:ok(o)});reload()}catch(e){const x=e as AdminApiError;setMsg({t:'err',m:x.status===500?'Илгээх үед алдаа гарлаа. Тайлан хэрэглэгчид нээгдээгүй. Дахин оролдоно уу.':x.message});if(x.status===409)reload()}finally{setBusy(false);setConfirm(false);setChecked(false)}};
 const save=()=>run(async()=>{const o=await adminApi.put(`/reviews/${id}/draft`,{baseRevision:meta.data.revision,reason:'Шууд засвар',edits:Object.entries(edits).map(([claimId,text])=>({claimId,text}))});setEdits({});return o},o=>o?.validation&&o.validation.state!=='PASS'?`Хадгаллаа. Анхааруулга (батлахаас өмнө засна уу): ${(o.validation.issues||[]).slice(0,3).map(describeIssue).join('; ')}`:'Хадгаллаа.');
 const release=()=>run(()=>adminApi.post(`/reviews/${id}/approve`,{baseRevision:meta.data.revision}),o=>{const d=o.delivery;return o.alreadyPublished?'Тайлан өмнө нь илгээгдсэн байна.':`Тайлан илгээгдлээ. Хэрэглэгч одоо харах боломжтой. Апп дотор мэдэгдэл: ${d?.notifications?'үүссэн':'үүсээгүй'}. Имэйл: ${d?.email==='SENT'?'илгээгдлээ':d?.email==='PENDING'?'дараалалд орлоо':'тохируулагдаагүй тул илгээгдээгүй'}.`});
 const doScan=async()=>{setShowScan(true);setScanBusy(true);try{setScan(await adminApi.post(`/reviews/${id}/scan`,{}));setDismissed(new Set())}catch(e){setMsg({t:'err',m:(e as Error).message})}finally{setScanBusy(false)}};
 const goTo=(claimId:string)=>{const el=wrap.current?.querySelector<HTMLElement>(`[data-claim="${claimId}"]`);if(el){el.scrollIntoView({block:'center',behavior:'smooth'});el.classList.add('ad-flash');window.setTimeout(()=>el.classList.remove('ad-flash'),1600)}else{const c=claims.find(x=>x.claimId===claimId);if(c&&!viewOnly&&editableState)setEditing({claimId,text:claimText(c)})}};
 if((view.loading&&!view.data)||(meta.loading&&!meta.data))return <Page title="Тайлан"><Loading/></Page>;
 if(view.error||meta.error||!view.data||!meta.data||!model)return <Page title="Тайлан"><Err text={view.error||meta.error||'Тайлан ачаалж чадсангүй.'} retry={reload}/>{['GENERATION_FAILED','SUBMITTED'].includes(status)&&can('reports.edit')&&<div className="adm-card"><p>Төсөл автоматаар үүсээгүй байна. Хиймэл оюунгүйгээр эхлүүлж, гараар засаж болно. Нэмэлт төлбөр гарахгүй.</p><button type="button" className="adm-btn adm-btn--primary" disabled={busy} onClick={()=>void run(()=>adminApi.post(`/reviews/${id}/draft-without-ai`),()=>'Төсөл үүслээ.')}>Гараар эхлэх</button></div>}<Evidence id={id}/></Page>;
 const published=status==='PUBLISHED';const awaiting=status==='AWAITING_REVIEW';
 const canEdit=editableState&&!viewOnly;
 return <div className="ad-review">
  <div className="ad-bar" role="toolbar" aria-label="Тайлангийн үйлдэл">
   <a className="adm-btn" href={adminHref('reports')}>Буцах</a>
   <div className="ad-bar__title"><b>{view.data.companyName}</b><small>{area.name} · {published?'Илгээсэн':awaiting?'Шинэ':'Хянаж байна'}{r?.deadlineAt&&!published?` · зорилтот хугацаа ${fmt(r.deadlineAt)}`:''}</small></div>
   {awaiting&&can('reports.edit')&&<button type="button" className="adm-btn adm-btn--primary" disabled={busy} onClick={()=>void run(()=>adminApi.post(`/reviews/${id}/claim`),()=>'Хяналтыг авлаа. Одоо засах боломжтой.')}>Хяналтыг авах</button>}
   <button type="button" className="adm-btn" aria-pressed={panel==='answers'} onClick={()=>setPanel(p=>p==='answers'?'':'answers')}>Хариултууд</button>
   <button type="button" className="adm-btn" aria-pressed={panel==='plan'} onClick={()=>setPanel(p=>p==='plan'?'':'plan')}>12 сарын төлөвлөгөө</button>
   <a className="adm-btn" href={adminHref('reports',id)+'?advanced=1'}>PDF харах</a>
   {editableState&&<button type="button" className="adm-btn" disabled={busy||viewOnly} onClick={()=>setPanel(p=>p==='reject'?'':'reject')}>Батлахгүй</button>}
   {editableState&&<button type="button" className="adm-btn" disabled={scanBusy||viewOnly} onClick={()=>void doScan()}>{scanBusy?'Шалгаж байна…':'AI шалгах'}</button>}
   {editableState&&<button type="button" className="adm-btn" disabled={busy||!dirty||viewOnly} onClick={()=>void save()}>Хадгалах{dirty?` (${dirty})`:''}</button>}
   {editableState&&can('reports.approve')&&<button type="button" className="adm-btn adm-btn--primary adm-btn--release" disabled={busy||dirty>0||viewOnly||!concOk} title={dirty>0?'Эхлээд хадгална уу':!concOk?'Ерөнхий дүгнэлтийн үгийн тоо 80-160 байх ёстой':undefined} onClick={()=>setConfirm(true)}>{busy?'Илгээж байна…':status==='APPROVED'?'Илгээлтийг дуусгах':'Батлах, илгээх'}</button>}
  </div>
  {canEdit&&conclusion&&<p className={`ad-quiet ad-conc${concOk?'':' is-bad'}`} role="status">Ерөнхий дүгнэлт: {concWords} үг (зөвшөөрөгдөх хэмжээ {CONC_MIN}-{CONC_MAX}){concOk?' · хэвийн':' · батлахаас өмнө засна уу'}</p>}
  {viewOnly&&<div className="adm-note ad-lock" role="status">{lockMsg||'Энэ тайланг өөр админ засаж байна. Зөвхөн харах горим.'}</div>}
  {msg&&<div className={msg.t==='ok'?'adm-note adm-note--ok':'adm-error'} role={msg.t==='ok'?'status':'alert'}>{msg.m}</div>}
  {published&&<div className="adm-note" role="status">Тайлан илгээгдсэн ({fmt(r.publishedAt)}). Энд өөрчлөх боломжгүй.</div>}
  {canEdit&&<p className="adm-note ad-hint">Тайлангийн текст дээр дарж шууд засна. Засвар «Хадгалах» дарсны дараа хадгалагдана.</p>}
  {panel==='answers'&&<Evidence id={id}/>}
  {panel==='plan'&&<AnnualPlanEditor id={id} canEdit={canEdit&&dirty===0} onSaved={m=>{setMsg({t:'ok',m});reload()}} onClose={()=>setPanel('')}/>}
  {panel==='plan'&&dirty>0&&<p className="adm-note">Эхлээд текстийн засвараа хадгална уу.</p>}
  {panel==='reject'&&<section className="adm-card" aria-label="Тайланг батлахгүй"><h2>Тайланг батлахгүй</h2><p className="adm-note">Тайлан хэрэглэгчид нээгдэхгүй, засварт үлдэнэ. Шалтгаан бүртгэгдэнэ.</p><label className="adm-reason">Шалтгаан<input value={rejectReason} maxLength={400} onChange={e=>setRejectReason(e.target.value)}/></label><div className="adm-actions"><button type="button" className="adm-btn" onClick={()=>setPanel('')}>Болих</button><button type="button" className="adm-btn adm-btn--primary" disabled={busy||rejectReason.trim().length<5} onClick={()=>void run(()=>adminApi.post(`/reviews/${id}/return`,{reason:rejectReason.trim()}),()=>{setPanel('');setRejectReason('');return 'Шалтгааныг бүртгэлээ. Тайлан засварт үлдлээ.'})}>Бүртгэх</button></div></section>}
  <div className="ad-body">
   <div ref={wrap} className={`ad-report report-v3${canEdit?' is-editable':''}`} onClick={onWrapClick}><main className="report-three-pages report-screen-only"><PageOne m={model}/><PageTwo m={model}/><PageThree m={model} reviewer/></main></div>
   {showScan&&<aside className="ad-scan" aria-label="AI шалгалтын үр дүн"><header><b>AI шалгах</b><button type="button" className="adm-link" onClick={()=>setShowScan(false)}>Хаах</button></header>
    {scanBusy?<Loading/>:scan&&<>
     <ul className="ad-layers"><li>Дотоод шалгалт: <b>{AI_MN[scan.layers.local]}</b> ({scan.checkedClaims} хэсэг)</li><li>Үгийн зөв бичлэг (Hunspell mn_MN): <b>{AI_MN[scan.layers.spelling]}</b>{scan.layers.spellingDetail?` · ${scan.layers.spellingDetail}`:` (${scan.checkedWords} үг)`}</li><li>AI: <b>{AI_MN[scan.layers.ai]}</b>{scan.layers.aiDetail?` · ${scan.layers.aiDetail}`:''}</li></ul>
     <p className="adm-note">Зөв бичлэг нь зөвхөн үгийн шалгалт; дүрэм, утга, найруулгын шалгалт биш. Бүх санал таны зөвшөөрлөөр л хэрэгжинэ.</p>
     {scan.findings.filter(f=>!dismissed.has(f.id)).length===0?<Empty text="Анхаарах зүйл олдсонгүй."/>:<ol>{scan.findings.filter(f=>!dismissed.has(f.id)).map(f=><li key={f.id} className={`ad-find ad-find--${f.severity}`}><div><span className="ad-chip">{LAYER_MN[f.layer]}</span> {f.message}</div>{f.original&&<q>{f.original.slice(0,140)}</q>}
      <div className="ad-find__act">{f.claimId&&<button type="button" className="adm-link" onClick={()=>goTo(f.claimId!)}>Хэсэг рүү очих</button>}{f.suggestion&&f.claimId&&canEdit&&<button type="button" className="adm-btn" onClick={()=>{setEdits(e=>({...e,[f.claimId!]:f.suggestion!}));setDismissed(d=>new Set(d).add(f.id))}}>Хэрэглэх</button>}<button type="button" className="adm-link" onClick={()=>setDismissed(d=>new Set(d).add(f.id))}>Татгалзах</button></div></li>)}</ol>}
    </>}</aside>}
  </div>
  {canEdit&&fixedCount>0&&<p className="ad-quiet ad-fixed">Тайлан дээрх оноо, тооцоолсон утга, заавал оруулах анхааруулга ({fixedCount} мөр) засагдахгүй: тэдгээр нь баталгаажсан хэмжилтээс гардаг.</p>}
  {unmatched.length>0&&<details className="adm-card ad-other" open><summary>Тайлан дээр шууд олдоогүй засах боломжтой текст ({unmatched.length})</summary><p className="adm-note">Дараах тайлбар текстийг энд засна.</p><ul>{unmatched.map(cid=>{const c=claims.find(x=>x.claimId===cid)!;return <li key={cid}><small>{c.sectionTitle}</small><p className={edits[cid]!==undefined?'ad-dirty':''}>{claimText(c)}</p>{canEdit&&<button type="button" className="adm-link" onClick={()=>setEditing({claimId:cid,text:claimText(c)})}>Засах</button>}</li>})}</ul></details>}
  {r&&['READY_FOR_APPROVAL','APPROVED'].includes(status)&&can('reports.edit')&&!viewOnly&&<p className="ad-quiet"><a className="adm-link" href={adminHref('reports',id)+'?advanced=1'}>Дэвшилтэт засвар (хуучин багаж)</a></p>}
  {editing&&<div className="adm-modal" role="dialog" aria-modal="true" aria-labelledby="ed-title"><div className="adm-modal__box ad-edit-box"><h2 id="ed-title">Текст засах</h2><textarea autoFocus rows={8} maxLength={4000} value={editing.text} onChange={e=>setEditing({...editing,text:e.target.value})}/>{(()=>{const c=claims.find(x=>x.claimId===editing.claimId);const isC=c?.sectionId==='S10';const n=wc(editing.text);const ok=!isC||(n>=CONC_MIN&&n<=CONC_MAX);return <small className={ok?'':'ad-conc is-bad'}>{isC?`${n} үг · зөвшөөрөгдөх хэмжээ ${CONC_MIN}-${CONC_MAX}${n>CONC_MAX?` · ${n-CONC_MAX} үгээр илүү (үг сольж эсвэл богиносгоно уу)`:n<CONC_MIN?` · ${CONC_MIN-n} үг дутуу`:' · хэвийн'} · `:''}{editing.text.length}/4000 · Зөвхөн тайлангийн тайлбар текст өөрчлөгдөнө. Оноо, хариулт, нотолгоо өөрчлөгдөхгүй.</small>})()}
   <div className="adm-modal__row"><button type="button" className="adm-btn" onClick={()=>setEditing(null)}>Болих</button><button type="button" className="adm-btn adm-btn--primary" disabled={!editing.text.trim()||(claims.find(x=>x.claimId===editing.claimId)?.sectionId==='S10'&&(wc(editing.text)<CONC_MIN||wc(editing.text)>CONC_MAX))} onClick={()=>{const c=claims.find(x=>x.claimId===editing.claimId);const same=c&&editing.text.trim()===c.text;setEdits(e=>{const n={...e};if(same)delete n[editing.claimId];else n[editing.claimId]=editing.text.trim();return n});setEditing(null)}}>Хэрэглэх</button></div></div></div>}
  {confirm&&<div className="adm-modal" role="dialog" aria-modal="true" aria-labelledby="rel-title"><div className="adm-modal__box adm-confirm"><h2 id="rel-title">Батлах, илгээх үү?</h2>
   <div className="adm-confirm__what"><ul><li>Тайлан <b>одоо шууд</b> хэрэглэгчид нээгдэнэ (хүлээх хугацаа байхгүй).</li><li>Хэрэглэгчид апп дотор мэдэгдэл, имэйл очно.</li><li>Илгээсний дараа энэ хувилбарыг өөрчлөх боломжгүй.</li></ul></div>
   <label className="adm-check"><input type="checkbox" checked={checked} onChange={e=>setChecked(e.target.checked)}/> Би тайланг эцсийн байдлаар шалгасан.</label>
   <div className="adm-modal__row"><button type="button" className="adm-btn" onClick={()=>{setConfirm(false);setChecked(false)}} disabled={busy}>Болих</button><button type="button" className="adm-btn adm-btn--primary" disabled={!checked||busy} onClick={()=>void release()}>{busy?'Илгээж байна…':'Батлах, илгээх'}</button></div></div></div>}
 </div>;
}
