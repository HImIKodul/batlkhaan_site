import React,{useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import { adminApi,AdminApiError,fmtUb,countdown,type AdminMe } from './adminApi';
import { Page,Empty,Err,Loading,useAsync,adminHref } from './AdminApp';
import { buildReportModel,mnCustomerText,PageOne,PageTwo,PageThree } from '../pages/Report';
import AnnualPlanEditor from './AnnualPlanEditor';
import { businessAreaById,type BusinessAreaId } from '../data/businessEvaluation';
import { useDomainTheme } from '../design/domainTheme';

/* Review page: the administrator edits the customer's REAL report. The three pages are the customer's own components fed with the current draft; clicking a paragraph
   that comes from the approved narrative opens it for editing. Only narrative wording can change (scores, answers, evidence, company and domain come from the frozen payload).
   One editor per report: the server lock is taken on open, renewed every minute and released on leave; another administrator sees the report read-only. */
const norm=(s:string)=>s.replace(/\s+/g,' ').trim();
/* Executive conclusion (S10) length contract, validator V27: 80-160 words counted as trimmed text split on whitespace (same rule as the server). */
const CONC_MIN=80,CONC_MAX=160;const wc=(t:string)=>t.trim()?t.trim().split(/\s+/).length:0;
const describeIssue=(i:{checkId:string;message:string})=>i.checkId==='V27'?`Ерөнхий дүгнэлт ${CONC_MIN}-${CONC_MAX} үгтэй байх ёстой (${/\((\d+)\)/.exec(i.message)?.[1]??'?'} үг).`:i.message;

export default function ReviewReportEditor({id,me}:{id:string;me:AdminMe}){
 const [tick,setTick]=useState(0);const reload=()=>setTick(t=>t+1);
 const view=useAsync(()=>adminApi.get(`/reviews/${id}/report-view`),[id,tick]);
 const meta=useAsync(()=>adminApi.get(`/reviews/${id}`),[id,tick]);
 const [edits,setEdits]=useState<Record<string,string>>({});const [ver,setVer]=useState(0);   // remounts the report after an edit: the browser's own text nodes and React's must never be mixed
 const [busy,setBusy]=useState(false);const [msg,setMsg]=useState<{t:'ok'|'err';m:string}|null>(null);const [lockMsg,setLockMsg]=useState('');const [confirm,setConfirm]=useState(false);const [viewOnly,setViewOnly]=useState(false);
 const [, setClock]=useState(0);useEffect(()=>{const t=window.setInterval(()=>setClock(x=>x+1),5000);return()=>window.clearInterval(t)},[]);
 const wrap=useRef<HTMLDivElement>(null);const can=(p:string)=>me.permissions.includes(p);
 const r=meta.data?.review;const status:string=r?.status??'';const allClaims:any[]=meta.data?.claims??[];const claims:any[]=allClaims.filter(c=>c.editable!==false);
 const editableState=['IN_REVIEW','READY_FOR_APPROVAL','APPROVED'].includes(status)&&can('reports.edit');
 // a freshly arrived report is taken over automatically (no extra button)
 const claimed=useRef(false);
 useEffect(()=>{if(status==='AWAITING_REVIEW'&&can('reports.edit')&&!claimed.current){claimed.current=true;void adminApi.post(`/reviews/${id}/claim`).then(reload).catch(e=>setMsg({t:'err',m:(e as Error).message}))}},[status]);
 // one editor per report: lock on open, renew every minute, release on leave. Another administrator sees the report read-only (no silent overwriting).
 useEffect(()=>{if(!editableState)return;let live=true;const take=async()=>{try{await adminApi.post(`/reviews/${id}/lock`,{});if(live){setViewOnly(false);setLockMsg('')}}catch(e){const x=e as AdminApiError;if(live){setViewOnly(true);setLockMsg(x.message)}}};void take();const t=window.setInterval(()=>void take(),60_000);
  return()=>{live=false;window.clearInterval(t);void adminApi.post(`/reviews/${id}/unlock`,{}).catch(()=>undefined)}},[id,editableState]);
 const area=useMemo(()=>businessAreaById((view.data?.domainCode??'marketing') as BusinessAreaId),[view.data?.domainCode]);
 useDomainTheme(area.id);
 const narrative=useMemo(()=>{const n=view.data?.report?.narrative;if(!n)return null;const c=JSON.parse(JSON.stringify(n));for(const s of c.sections)for(const cl of s.claims)if(edits[cl.reportClaimId]!==undefined)cl.textMn=edits[cl.reportClaimId];return c},[view.data,edits]);
 const model=useMemo(()=>view.data&&narrative?buildReportModel(area,view.data.companyName,undefined,view.data.results,view.data.report.payload,{...view.data.report,narrative}):null,[view.data,narrative,area]);
 const claimText=(c:any)=>edits[c.claimId]??c.text;
 const canEdit=editableState&&!viewOnly;
 // ---- DIRECT editing: every paragraph of the real report that comes from the approved narrative becomes editable text right where it is shown.
 useLayoutEffect(()=>{const root=wrap.current;if(!root||!model)return;
  type Entry={cid:string;key:string;prefix:string};const entries:Entry[]=[];
  for(const c of claims){const full=claimText(c);const tr=mnCustomerText(full);const pm=/^[^.]{3,140}\.\s+/.exec(tr);
   entries.push({cid:c.claimId,key:norm(full),prefix:''},{cid:c.claimId,key:norm(tr),prefix:''});
   /* strengths / weaknesses are shown WITHOUT their leading "Title. " (the title is a separate fixed line): the visible text maps to the rest of the claim and the title is put back on save */
   if(pm&&tr.length-pm[0].length>=8)entries.push({cid:c.claimId,key:norm(tr.slice(pm[0].length)),prefix:pm[0]})}
  const exact=new Map(entries.map(e=>[e.key,e]));
  const find=(t:string)=>{const e=exact.get(t);if(e)return e;if(t.length<60)return undefined;const head=t.slice(0,48);return entries.find(x=>x.key.length>=60&&x.key.startsWith(head)&&Math.abs(x.key.length-t.length)/x.key.length<0.15)};
  root.querySelectorAll<HTMLElement>('[data-claim]').forEach(e=>{e.removeAttribute('data-claim');e.removeAttribute('data-prefix');e.removeAttribute('data-orig');e.removeAttribute('contenteditable');e.classList.remove('ad-edit','ad-dirty')});
  root.querySelectorAll<HTMLElement>('p,span,h4,li,div,strong,small,blockquote').forEach(el=>{const t=norm(el.textContent||'');if(t.length<8)return;const hit=find(t);if(!hit)return;if(Array.from(el.children).some(ch=>norm(ch.textContent||'')===t))return;if(el.closest('[data-claim]'))return;
   el.dataset.claim=hit.cid;el.dataset.prefix=hit.prefix;el.dataset.orig=t;el.classList.add('ad-edit');if(canEdit){el.setAttribute('contenteditable','plaintext-only');el.spellcheck=true}if(edits[hit.cid]!==undefined)el.classList.add('ad-dirty')})});
 const onBlur=(e:React.FocusEvent)=>{const el=(e.target as HTMLElement).closest?.('[data-claim]') as HTMLElement|null;if(!el||!canEdit)return;const cid=el.dataset.claim!;const now=norm(el.innerText||'');if(!now){el.innerText=el.dataset.orig||'';return}if(now===el.dataset.orig)return;{setEdits(p=>({...p,[cid]:(el.dataset.prefix||'')+now}));setVer(v=>v+1)}};
 const onKeyDown=(e:React.KeyboardEvent)=>{if(e.key==='Enter'&&(e.target as HTMLElement).closest?.('[data-claim]'))e.preventDefault()};
 const dirty=Object.keys(edits).length;
 const run=async(fn:()=>Promise<any>,ok:(o:any)=>string)=>{setBusy(true);setMsg(null);try{const o=await fn();setMsg({t:'ok',m:ok(o)});setEdits({});setVer(v=>v+1);reload();return o}catch(e){const x=e as AdminApiError;setMsg({t:'err',m:x.status===500?'Үйлдэл амжилтгүй боллоо. Тайлан хэрэглэгчид нээгдээгүй. Дахин оролдоно уу.':x.message});if(x.status===409)reload()}finally{setBusy(false);setConfirm(false)}};
 const saveDraft=async()=>adminApi.put(`/reviews/${id}/draft`,{baseRevision:meta.data.revision,reason:'Шууд засвар',edits:Object.entries(edits).map(([claimId,text])=>({claimId,text}))});
 /* ХАДГАЛАХ: private draft only. Nothing is published, regenerated or restarted; the countdown is untouched. */
 const save=()=>run(async()=>dirty?saveDraft():{revision:meta.data.revision},o=>o?.validation&&o.validation.state!=='PASS'?`Хадгаллаа. Анхааруулга: ${(o.validation.issues||[]).slice(0,2).map((i:any)=>describeIssue(i)).join(' ')}`:'Хадгалагдлаа. Тайлан хэрэглэгчид харагдахгүй.');
 /* ИЛГЭЭХ: saves the latest edits, then publishes that exact reviewed version (the server does it in one guarded step). */
 const release=()=>run(async()=>{let rev=meta.data.revision;if(dirty){const o=await saveDraft();rev=o.revision}return adminApi.post(`/reviews/${id}/approve`,{baseRevision:rev})},()=>'Тайлан хэрэглэгчид илгээгдлээ.');
 if((view.loading&&!view.data)||(meta.loading&&!meta.data))return <Page title="Тайлан"><Loading/></Page>;
 if(view.error||meta.error||!view.data||!meta.data||!model)return <Page title="Тайлан"><Err text={view.error||meta.error||'Тайлан ачаалж чадсангүй.'} retry={reload}/><p><a className="adm-btn" href={adminHref('reports')}>Буцах</a></p></Page>;
 const published=status==='PUBLISHED';
 const left=r?.deadlineAt?new Date(r.deadlineAt).getTime()-Date.now():0;
 return <div className="ad-review">
  <div className="ad-bar" role="toolbar" aria-label="Тайлангийн үйлдэл">
   <a className="adm-btn" href={adminHref(published?'done':'reports')}>Буцах</a>
   <div className="ad-bar__title"><b>{view.data.companyName}</b><small>{area.name}{r?.deadlineAt&&!published?<> · үлдсэн хугацаа <b className={left<0?'cn-left is-over':'cn-left'}>{countdown(left)}</b></>:''}{r?.submittedAt?` · илгээсэн ${fmtUb(r.submittedAt)}`:''}</small></div>
   {canEdit&&<button type="button" className="adm-btn adm-btn--primary adm-btn--big" disabled={busy} onClick={()=>void save()}>ХАДГАЛАХ</button>}
   {canEdit&&can('reports.approve')&&<button type="button" className="adm-btn adm-btn--primary adm-btn--big adm-btn--release" disabled={busy} onClick={()=>setConfirm(true)}>ИЛГЭЭХ</button>}
  </div>
  {viewOnly&&<div className="adm-note ad-lock" role="status">{lockMsg||'Энэ тайланг өөр админ засаж байна. Зөвхөн харах горим.'}</div>}
  {msg&&<div className={msg.t==='ok'?'adm-note adm-note--ok':'adm-error'} role={msg.t==='ok'?'status':'alert'}>{msg.m}</div>}
  {published&&<div className="adm-note" role="status">Тайлан хэрэглэгчид илгээгдсэн. Засахын тулд ДУУССАН ТАЙЛАН хэсгээс буцаана уу.</div>}
  {canEdit&&<p className="adm-note ad-hint">Тайлангийн текст дээр шууд дарж засна. Засвараа ХАДГАЛАХ товчоор хадгална.{dirty>0?` (Хадгалаагүй засвар: ${dirty})`:''}</p>}
  <div className="ad-body"><div ref={wrap} className={`ad-report report-v3${canEdit?' is-editable':''}`} onBlur={onBlur} onKeyDown={onKeyDown}><main key={ver} className="report-three-pages report-screen-only"><PageOne m={model}/><PageTwo m={model}/><PageThree m={model} reviewer/></main></div></div>
  {canEdit&&<section className="ad-plan-wrap" aria-label="12 сарын төлөвлөгөө"><AnnualPlanEditor id={id} canEdit={canEdit&&dirty===0} onSaved={m=>{setMsg({t:'ok',m});reload()}} onClose={()=>undefined}/>{dirty>0&&<p className="adm-note">Төлөвлөгөөг засахаас өмнө текстийн засвараа ХАДГАЛАХ товчоор хадгална уу.</p>}</section>}
  {confirm&&<div className="adm-modal" role="dialog" aria-modal="true" aria-labelledby="rel-title"><div className="adm-modal__box adm-confirm"><h2 id="rel-title">Тайланг илгээх үү?</h2><p>Таны засварласан тайлан хэрэглэгчид одоо нээгдэж, PDF татах боломжтой болно. Тайланг дараа нь ДУУССАН ТАЙЛАН хэсгээс буцааж болно.</p>
   <div className="adm-modal__row"><button type="button" className="adm-btn" onClick={()=>setConfirm(false)} disabled={busy}>Болих</button><button type="button" className="adm-btn adm-btn--primary" disabled={busy} onClick={()=>void release()}>{busy?'Илгээж байна…':'ИЛГЭЭХ'}</button></div></div></div>}
 </div>;
}
