import React,{useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import { adminApi,AdminApiError,fmtUb,countdown,type AdminMe } from './adminApi';
import { Page,Empty,Err,Loading,useAsync,adminHref } from './AdminApp';
import { adminGuard } from './unsavedGuard';
import { countsChanged } from './Console';
import { buildReportModel,mnCustomerText,PageOne,PageTwo,PageThree } from '../pages/Report';
import { businessAreaById,type BusinessAreaId } from '../data/businessEvaluation';
import { useDomainTheme } from '../design/domainTheme';

/* Review page: the administrator edits the customer's REAL report. The three pages are the customer's own components fed with the current draft; clicking a paragraph
   that comes from the approved narrative opens it for editing. Only narrative wording can change (scores, answers, evidence, company and domain come from the frozen payload).
   One editor per report: the server lock is taken on open, renewed every minute and released on leave; another administrator sees the report read-only. */
const norm=(s:string)=>s.replace(/\s+/g,' ').trim();
/* Executive conclusion (S10) length contract, validator V27: 80-160 words counted as trimmed text split on whitespace (same rule as the server). */
const CONC_MIN=80,CONC_MAX=160;const wc=(t:string)=>t.trim()?t.trim().split(/\s+/).length:0;
const describeIssue=(i:{checkId:string;message:string})=>i.checkId==='V27'?`Ерөнхий дүгнэлт ${CONC_MIN}-${CONC_MAX} үгтэй байх ёстой (${/\((\d+)\)/.exec(i.message)?.[1]??'?'} үг).`:i.message;

/** "2026 оны 9-р сарын 8 - 10-р сарын 22" -> start day and length relative to the plan's start date (the server validates the result with the existing plan rules). */
function parseRange(text:string,startDate:string):{startDay:number;durationDays:number}|null{
 const re=/(?:(\d{4})\s*оны\s*)?(\d{1,2})\s*-р\s*сарын\s*(\d{1,2})/g;const m=[...text.matchAll(re)];if(m.length<2)return null;
 const start=Date.parse(`${startDate}T00:00:00Z`);if(!Number.isFinite(start))return null;const y0=new Date(start).getUTCFullYear();
 const a=Date.UTC(m[0][1]?Number(m[0][1]):y0,Number(m[0][2])-1,Number(m[0][3]));let y1=m[1][1]?Number(m[1][1]):new Date(a).getUTCFullYear();let b=Date.UTC(y1,Number(m[1][2])-1,Number(m[1][3]));if(!m[1][1]&&b<a)b=Date.UTC(y1+1,Number(m[1][2])-1,Number(m[1][3]));
 const startDay=Math.round((a-start)/86400000),durationDays=Math.round((b-a)/86400000)+1;return startDay>=0&&durationDays>=1?{startDay,durationDays}:null}
export default function ReviewReportEditor({id,me}:{id:string;me:AdminMe}){
 const [tick,setTick]=useState(0);const reload=()=>setTick(t=>t+1);
 const view=useAsync(()=>adminApi.get(`/reviews/${id}/report-view`),[id,tick]);
 const meta=useAsync(()=>adminApi.get(`/reviews/${id}`),[id,tick]);
 const [edits,setEdits]=useState<Record<string,string>>({});const plan=useAsync(()=>adminApi.get(`/reviews/${id}/annual-plan`),[id,tick]);const [planEdits,setPlanEdits]=useState<Record<string,string>>({});const [ver,setVer]=useState(0);   // remounts the report after an edit: the browser's own text nodes and React's must never be mixed
 const [busy,setBusy]=useState(false);const [msg,setMsg]=useState<{t:'ok'|'err';m:string}|null>(null);const [lockMsg,setLockMsg]=useState('');const [confirm,setConfirm]=useState(false);const [viewOnly,setViewOnly]=useState(false);
 const [, setClock]=useState(0);useEffect(()=>{const t=window.setInterval(()=>setClock(x=>x+1),5000);return()=>window.clearInterval(t)},[]);
 const wrap=useRef<HTMLDivElement>(null);const busyRef=useRef(false);
 /* Edit history of this open report (undo / redo): snapshots of the unsaved overlay maps; it starts again after a successful save. Undo and redo only change what is on screen, never the server. */
 const hist=useRef<{past:{e:Record<string,string>;p:Record<string,string>}[];future:{e:Record<string,string>;p:Record<string,string>}[]}>({past:[],future:[]});const [,setHistTick]=useState(0);
 const now=useRef({edits:{} as Record<string,string>,plan:{} as Record<string,string>});
 const can=(p:string)=>me.permissions.includes(p);
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
 const narrative=useMemo(()=>{const n=view.data?.report?.narrative;if(!n)return null;const c=JSON.parse(JSON.stringify(n));for(const s of c.sections)for(const cl of s.claims)if(edits[cl.reportClaimId]!==undefined)cl.textMn=edits[cl.reportClaimId];
  /* unsaved wording typed straight into the 12-month plan stays visible until it is saved */
  for(const [k,v] of Object.entries(planEdits)){const [i,f]=k.split(':');const st=c.annualPlan?.stages?.[Number(i)];if(!st)continue;
   if(f==='heading')st.headingMn=v;else if(f==='note')st.dependencyNoteMn=v;else if(f==='date')st.dateLabel=v;else if(/^a\d+$/.test(f)){const a=st.actions?.[Number(f.slice(1))];if(a)a.textMn=v}else if(st.guide)st.guide[f]=v}
  return c},[view.data,edits,planEdits]);
 const model=useMemo(()=>view.data&&narrative?buildReportModel(area,view.data.companyName,undefined,view.data.results,view.data.report.payload,{...view.data.report,narrative}):null,[view.data,narrative,area]);
 const claimText=(c:any)=>edits[c.claimId]??c.text;
 const canEdit=editableState&&!viewOnly;
 // ---- DIRECT editing: every paragraph of the real report that comes from the approved narrative becomes editable text right where it is shown.
 useLayoutEffect(()=>{const root=wrap.current;if(!root||!model)return;
  type Entry={cid:string;key:string;prefix:string};const entries:Entry[]=[];
  for(const c of claims){const full=claimText(c);const tr=mnCustomerText(full);const pm=/^[^.]{3,140}\.\s+/.exec(tr);
   entries.push({cid:c.claimId,key:norm(full),prefix:''},{cid:c.claimId,key:norm(tr),prefix:''});
   /* strengths / weaknesses are shown WITHOUT their leading "Title. " (the title is a separate fixed line): the visible text maps to the rest of the claim and the title is put back on save */
   /* the title put back on save is the RAW one: the displayed title may have been renamed by mnCustomerText, and the validator requires the canonical capability name inside the stored claim */
   const rawPm=/^[^.]{3,140}\.\s+/.exec(full);
   if(pm&&tr.length-pm[0].length>=8)entries.push({cid:c.claimId,key:norm(tr.slice(pm[0].length)),prefix:rawPm?rawPm[0]:pm[0]})}
  const exact=new Map(entries.map(e=>[e.key,e]));
  const find=(t:string)=>{const e=exact.get(t);if(e)return e;if(t.length<60)return undefined;const head=t.slice(0,48);return entries.find(x=>x.key.length>=60&&x.key.startsWith(head)&&Math.abs(x.key.length-t.length)/x.key.length<0.15)};
  root.querySelectorAll<HTMLElement>('[data-claim]').forEach(e=>{e.removeAttribute('data-claim');e.removeAttribute('data-prefix');e.removeAttribute('data-orig');e.removeAttribute('contenteditable');e.classList.remove('ad-edit','ad-dirty')});
  root.querySelectorAll<HTMLElement>('p,span,h4,li,div,strong,small,blockquote').forEach(el=>{const t=norm(el.textContent||'');if(t.length<8)return;const hit=find(t);if(!hit)return;if(Array.from(el.children).some(ch=>norm(ch.textContent||'')===t))return;if(el.closest('[data-claim]')||el.closest('[data-pf]')||el.querySelector('[data-pf]'))return;
   el.dataset.claim=hit.cid;el.dataset.prefix=hit.prefix;el.dataset.orig=t;el.classList.add('ad-edit');if(canEdit){el.setAttribute('contenteditable','plaintext-only');el.spellcheck=true}if(edits[hit.cid]!==undefined)el.classList.add('ad-dirty')});
  /* the 12-month plan: every wording and the dates are editable right where the customer sees them */
  const planOk=(plan.data?.plan?.stages?.length??0)>0;
  root.querySelectorAll<HTMLElement>('[data-pf]').forEach(el=>{el.removeAttribute('contenteditable');el.classList.remove('ad-edit','ad-dirty');if(!planOk)return;const key=el.dataset.pf!;el.dataset.orig=norm(el.textContent||'');el.classList.add('ad-edit');if(canEdit){el.setAttribute('contenteditable','plaintext-only');el.spellcheck=true}if(planEdits[key]!==undefined)el.classList.add('ad-dirty')})});
 const onBlur=(e:React.FocusEvent)=>{
  const pf=(e.target as HTMLElement).closest?.('[data-pf]') as HTMLElement|null;
  if(pf&&canEdit){const key=pf.dataset.pf!;const now=norm(pf.innerText||'');if(!now){pf.innerText=pf.dataset.orig||'';return}if(now===pf.dataset.orig)return;
   if(key.endsWith(':date')&&!parseRange(now,plan.data?.startDate)){setMsg({t:'err',m:'Огноог «2026 оны 9-р сарын 8 - 10-р сарын 22» хэлбэрээр бичнэ үү.'});pf.innerText=pf.dataset.orig||'';return}
   remember();setPlanEdits(p=>({...p,[key]:now}));setVer(v=>v+1);return}
  const el=(e.target as HTMLElement).closest?.('[data-claim]') as HTMLElement|null;if(!el||!canEdit)return;const cid=el.dataset.claim!;const now=norm(el.innerText||'');if(!now){el.innerText=el.dataset.orig||'';return}if(now===el.dataset.orig)return;{remember();setEdits(p=>({...p,[cid]:(el.dataset.prefix||'')+now}));setVer(v=>v+1)}};
 const onKeyDown=(e:React.KeyboardEvent)=>{if(e.key==='Enter'&&(e.target as HTMLElement).closest?.('[data-claim]'))e.preventDefault()};
 const dirty=Object.keys(edits).length+Object.keys(planEdits).length;
 now.current={edits,plan:planEdits};
 useEffect(()=>{adminGuard.dirty=dirty>0;return()=>{adminGuard.dirty=false}},[dirty]);   // the shell warns before leaving while this is true
 const remember=()=>{hist.current.past.push({e:now.current.edits,p:now.current.plan});if(hist.current.past.length>200)hist.current.past.shift();hist.current.future=[];setHistTick(t=>t+1)};
 const undo=()=>{const h=hist.current;const x=h.past.pop();if(!x)return;h.future.push({e:now.current.edits,p:now.current.plan});setEdits(x.e);setPlanEdits(x.p);setVer(v=>v+1);setHistTick(t=>t+1)};
 const redo=()=>{const h=hist.current;const x=h.future.pop();if(!x)return;h.past.push({e:now.current.edits,p:now.current.plan});setEdits(x.e);setPlanEdits(x.p);setVer(v=>v+1);setHistTick(t=>t+1)};
 const CONFLICT_MN='Өөр админ энэ тайланг өөрчилсөн байна. Таны засвар хадгалагдаагүй, дэлгэц дээр хэвээр байна. Нөгөө админы өөрчлөлтийг дарж бичихгүйн тулд засвараа өөр газар хадгалаад хуудсыг шинэчлээд дахин засна уу.';
 /* One request at a time (busyRef): a double click or Ctrl+S during a save can never send it twice. A conflict keeps the local edits on screen and never reloads over them. */
 const run=async(fn:()=>Promise<any>,ok:(o:any)=>string|{t:'ok'|'err';m:string})=>{if(busyRef.current)return;busyRef.current=true;setBusy(true);setMsg(null);try{const o=await fn();const r=ok(o);setMsg(typeof r==='string'?{t:'ok',m:r}:r);setEdits({});setPlanEdits({});hist.current={past:[],future:[]};setVer(v=>v+1);reload();countsChanged();return o}catch(e){const x=e as AdminApiError;setMsg({t:'err',m:x.status===409?CONFLICT_MN:x.status===500?'Үйлдэл амжилтгүй боллоо. Тайлан хэрэглэгчид нээгдээгүй. Дахин оролдоно уу.':x.message})}finally{busyRef.current=false;setBusy(false);setConfirm(false)}};
 /* Plan wording first (existing validated plan endpoint: same dates, gaps and 3-page-fit rules), then the report text; each save creates its own append-only revision. */
 const savePlan=async(baseRevision:number)=>{const base=plan.data;const stages:any[]=JSON.parse(JSON.stringify(base.plan.stages));
  for(const [k,v] of Object.entries(planEdits)){const [i,f]=k.split(':');const st=stages[Number(i)];if(!st)continue;
   if(f==='heading')st.headingMn=v;else if(f==='note')st.dependencyNoteMn=v;else if(f==='date'){const r=parseRange(v,base.startDate);if(r){st.startDay=r.startDay;st.durationDays=r.durationDays}}
   else if(/^a\d+$/.test(f)){const a=st.actions?.[Number(f.slice(1))];if(a)a.textMn=v}else st.guide={goalMn:'',resultMn:'',doneMn:'',ownerMn:'',...st.guide,[f]:v}}
  return adminApi.put(`/reviews/${id}/annual-plan`,{baseRevision,reason:'Шууд засвар',plan:{stages:stages.map(({guide,headingMn,startDay,durationDays,dependencyNoteMn,actions}:any)=>({guide,headingMn,startDay,durationDays,dependencyNoteMn,actions}))}})};
 const saveAll=async()=>{let rev:number=meta.data.revision;let out:any={revision:rev};
  if(Object.keys(planEdits).length){out=await savePlan(rev);rev=out.revision}
  if(Object.keys(edits).length)out=await adminApi.put(`/reviews/${id}/draft`,{baseRevision:rev,reason:'Шууд засвар',edits:Object.entries(edits).map(([claimId,text])=>({claimId,text}))});
  return out};
 /* ХАДГАЛАХ: private draft only. Nothing is published, regenerated or restarted; the countdown is untouched. */
 const save=()=>run(async()=>dirty?saveAll():{revision:meta.data.revision},o=>o?.validation&&o.validation.state!=='PASS'?{t:'err' as const,m:`Өөрчлөлт хадгалагдсан боловч тайланд засах зүйл байна: ${(o.validation.issues||[]).slice(0,2).map((i:any)=>describeIssue(i)).join(' ')}`}:'Амжилттай хадгаллаа.');
 /* ИЛГЭЭХ: saves the latest edits, then publishes that exact reviewed version (the server does it in one guarded step). */
 const release=()=>run(async()=>{let rev=meta.data.revision;if(dirty){const o=await saveAll();rev=o.revision}return adminApi.post(`/reviews/${id}/approve`,{baseRevision:rev})},()=>'Тайлан хэрэглэгчид илгээгдлээ.');
 const fnRef=useRef({save:()=>{},undo:()=>{},redo:()=>{},canEdit:false});fnRef.current={save:()=>void save(),undo,redo,canEdit};
 /* Ctrl/Cmd+S = ХАДГАЛАХ (never publishes), Ctrl/Cmd+Z = undo, Ctrl+Shift+Z / Ctrl+Y = redo. Only active while this report editor is open. */
 useEffect(()=>{const k=(e:KeyboardEvent)=>{if(!(e.ctrlKey||e.metaKey))return;const key=e.key.toLowerCase();
  if(key==='s'){e.preventDefault();if(fnRef.current.canEdit&&!busyRef.current)fnRef.current.save();return}
  if(key==='z'&&!e.shiftKey){const el=document.activeElement as HTMLElement|null;if(el?.isContentEditable&&el.dataset.orig!==undefined&&norm(el.innerText||'')!==el.dataset.orig){e.preventDefault();el.innerText=el.dataset.orig;return}e.preventDefault();fnRef.current.undo();return}
  if((key==='z'&&e.shiftKey)||key==='y'){e.preventDefault();fnRef.current.redo()}};
  document.addEventListener('keydown',k);return()=>document.removeEventListener('keydown',k)},[]);
 if((view.loading&&!view.data)||(meta.loading&&!meta.data))return <Page title="Тайлан"><Loading/></Page>;
 if(view.error||meta.error||!view.data||!meta.data||!model)return <Page title="Тайлан"><Err text={view.error||meta.error||'Тайлан ачаалж чадсангүй.'} retry={reload}/><p><a className="adm-btn" href={adminHref('reports')}>Буцах</a></p></Page>;
 const published=status==='PUBLISHED';
 const left=r?.deadlineAt?new Date(r.deadlineAt).getTime()-Date.now():0;
 return <div className="ad-review">
  <div className="ad-bar" role="toolbar" aria-label="Тайлангийн үйлдэл">
   <a className="adm-btn" href={adminHref(published?'done':'reports')}>Буцах</a>
   <div className="ad-bar__title"><b>{view.data.companyName}</b><small>{area.name}{r?.deadlineAt&&!published?<> · үлдсэн хугацаа <b className={left<0?'cn-left is-over':'cn-left'}>{countdown(left)}</b></>:''}{r?.submittedAt?` · илгээсэн ${fmtUb(r.submittedAt)}`:''}</small></div>
   {canEdit&&<span className="ad-undo"><button type="button" className="adm-btn adm-btn--sm" aria-label="Буцаах (Ctrl+Z)" title="Буцаах (Ctrl+Z)" disabled={busy||hist.current.past.length===0} onClick={undo}>↶</button><button type="button" className="adm-btn adm-btn--sm" aria-label="Дахин хийх (Ctrl+Shift+Z)" title="Дахин хийх (Ctrl+Shift+Z)" disabled={busy||hist.current.future.length===0} onClick={redo}>↷</button></span>}
   {canEdit&&<button type="button" className="adm-btn adm-btn--primary adm-btn--big" disabled={busy} onClick={()=>void save()}>ХАДГАЛАХ</button>}
   {canEdit&&can('reports.approve')&&<button type="button" className="adm-btn adm-btn--primary adm-btn--big adm-btn--release" disabled={busy} onClick={()=>setConfirm(true)}>ИЛГЭЭХ</button>}
  </div>
  {viewOnly&&<div className="adm-note ad-lock" role="status">{lockMsg||'Энэ тайланг өөр админ засаж байна. Зөвхөн харах горим.'}</div>}
  {msg&&<div className={msg.t==='ok'?'adm-note adm-note--ok':'adm-error'} role={msg.t==='ok'?'status':'alert'}>{msg.m}</div>}
  {published&&<div className="adm-note" role="status">Тайлан хэрэглэгчид илгээгдсэн. Засахын тулд ДУУССАН ТАЙЛАН хэсгээс буцаана уу.</div>}
  {canEdit&&<p className="adm-note ad-hint">Тайлангийн текст дээр шууд дарж засна. Засвараа ХАДГАЛАХ товчоор хадгална.{dirty>0?` (Хадгалаагүй засвар: ${dirty})`:''}</p>}
  <div className="ad-body"><div ref={wrap} className={`ad-report report-v3${canEdit?' is-editable':''}`} onBlur={onBlur} onKeyDown={onKeyDown}><main key={ver} className="report-three-pages report-screen-only"><PageOne m={model}/><PageTwo m={model}/><PageThree m={model} reviewer/></main></div></div>
  {confirm&&<div className="adm-modal" role="dialog" aria-modal="true" aria-labelledby="rel-title"><div className="adm-modal__box adm-confirm"><h2 id="rel-title">Тайланг хэрэглэгчид илгээх үү?</h2>
   <div className="adm-modal__row"><button type="button" className="adm-btn" onClick={()=>setConfirm(false)} disabled={busy}>БОЛИХ</button><button type="button" className="adm-btn adm-btn--primary" disabled={busy} onClick={()=>void release()}>{busy?'Илгээж байна…':'ИЛГЭЭХ'}</button></div></div></div>}
 </div>;
}
