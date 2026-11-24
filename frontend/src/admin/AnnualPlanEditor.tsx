import React,{useState} from 'react';
import { adminApi,AdminApiError } from './adminApi';
import { Err,Loading,useAsync } from './AdminApp';

/* Reviewer correction of the 12-month plan (no AI call). Dates come from start day + length; the server closes gaps, checks references and the three-page fit, and stores a new revision. */
type Act={textMn:string;recommendationIds:string[]};
type Stage={headingMn:string;startDay:number;durationDays:number;dependencyNoteMn:string|null;actions:Act[]};
const blankStage=(startDay:number,ref:string):Stage=>({headingMn:'',startDay,durationDays:90,dependencyNoteMn:null,actions:[{textMn:'',recommendationIds:ref?[ref]:[]}]});
const dayLabel=(start:string,d:number)=>{const x=new Date(`${start}T00:00:00Z`);x.setUTCDate(x.getUTCDate()+d);return x.toISOString().slice(0,10).replace(/-/g,'.')};
export default function AnnualPlanEditor({id,canEdit,onSaved,onClose}:{id:string;canEdit:boolean;onSaved:(m:string)=>void;onClose:()=>void}){
 const {loading,error,data,reload}=useAsync(()=>adminApi.get(`/reviews/${id}/annual-plan`),[id]);
 const [draft,setDraft]=useState<Stage[]|null>(null);const [reason,setReason]=useState('');const [busy,setBusy]=useState(false);const [issues,setIssues]=useState<string[]>([]);
 if(loading&&!data)return <Loading/>;if(error||!data)return <Err text={error||'Төлөвлөгөөг ачаалж чадсангүй.'} retry={reload}/>;
 const stages:Stage[]=draft??data.plan?.stages??[];const set=(f:(s:Stage[])=>void)=>{const c:Stage[]=JSON.parse(JSON.stringify(stages));f(c);setDraft(c)};
 const firstRef=data.actions[0]?.id??'';
 const start=()=>setDraft([0,90,180,270].map((d,i)=>({...blankStage(d,data.actions[i]?.id??firstRef),durationDays:i===3?data.windowDays-270:90})));
 const save=async()=>{setBusy(true);setIssues([]);try{const o=await adminApi.put(`/reviews/${id}/annual-plan`,{baseRevision:data.revision,reason,plan:{stages:stages.map(({headingMn,startDay,durationDays,dependencyNoteMn,actions})=>({headingMn,startDay,durationDays,dependencyNoteMn,actions}))}});setDraft(null);setReason('');reload();onSaved(`12 сарын төлөвлөгөө хадгалагдлаа. Хамрах хугацаа: ${o.periodLabel}.`)}catch(e){const x=e as AdminApiError&{details?:any};const d=(x as any).details?.issues;setIssues(Array.isArray(d)&&d.length?d.map((i:any)=>i.message):[x.message])}finally{setBusy(false)}};
 return <section className="adm-card ad-plan" aria-label="12 сарын төлөвлөгөө засах"><header className="ad-plan__head"><h2>12 сарын төлөвлөгөө</h2><button type="button" className="adm-link" onClick={onClose}>Хаах</button></header>
  <p className="adm-note">Эхлэх өдөр {dayLabel(data.startDate,0)}. Хугацааг өдрөөр оруулна, хоосон завсрыг систем нөхнө. Энд хиймэл оюун ашиглахгүй.</p>
  {!stages.length&&<p className="adm-note">Энэ тайланд төлөвлөгөө үүсээгүй байна. {canEdit&&<button type="button" className="adm-btn" onClick={start}>Гараар эхлэх</button>}</p>}
  {stages.map((s,i)=><fieldset key={i} className="ad-plan__stage" disabled={!canEdit||busy}><legend>{i+1}-р үе шат · {dayLabel(data.startDate,s.startDay)} - {dayLabel(data.startDate,s.startDay+s.durationDays-1)}</legend>
   <label>Үе шатны нэр<input value={s.headingMn} maxLength={90} onChange={e=>set(c=>{c[i].headingMn=e.target.value})}/></label>
   <div className="ad-plan__row"><label>Эхлэх өдөр<input type="number" min={0} max={data.windowDays-7} value={s.startDay} onChange={e=>set(c=>{c[i].startDay=Number(e.target.value)})}/></label><label>Үргэлжлэх өдөр<input type="number" min={7} max={data.windowDays} value={s.durationDays} onChange={e=>set(c=>{c[i].durationDays=Number(e.target.value)})}/></label></div>
   <label>Өмнөх шаттай холбоо (заавал биш)<input value={s.dependencyNoteMn??''} maxLength={200} onChange={e=>set(c=>{c[i].dependencyNoteMn=e.target.value||null})}/></label>
   {s.actions.map((a,j)=><div key={j} className="ad-plan__action"><label>Ажил {j+1}<textarea rows={3} maxLength={480} value={a.textMn} onChange={e=>set(c=>{c[i].actions[j].textMn=e.target.value})}/></label>
    <details><summary>Холбогдох оношилгооны ажил ({a.recommendationIds.length})</summary>{data.actions.map((r:any)=><label key={r.id} className="adm-check"><input type="checkbox" checked={a.recommendationIds.includes(r.id)} onChange={e=>set(c=>{const l=c[i].actions[j].recommendationIds;c[i].actions[j].recommendationIds=e.target.checked?[...l,r.id]:l.filter(x=>x!==r.id)})}/> {r.titleMn}</label>)}</details>
    {s.actions.length>1&&<button type="button" className="adm-link" onClick={()=>set(c=>{c[i].actions.splice(j,1)})}>Ажлыг хасах</button>}</div>)}
   <div className="adm-actions">{s.actions.length<5&&<button type="button" className="adm-btn" onClick={()=>set(c=>{c[i].actions.push({textMn:'',recommendationIds:firstRef?[firstRef]:[]})})}>Ажил нэмэх</button>}{stages.length>3&&<button type="button" className="adm-btn" onClick={()=>set(c=>{c.splice(i,1)})}>Үе шатыг хасах</button>}</div>
  </fieldset>)}
  {issues.length>0&&<div className="adm-error" role="alert"><ul>{issues.map((m,i)=><li key={i}>{m}</li>)}</ul></div>}
  {canEdit&&stages.length>0&&<div className="ad-plan__foot">{stages.length<8&&<button type="button" className="adm-btn" onClick={()=>set(c=>{c.push(blankStage(Math.min(data.windowDays-30,(c[c.length-1]?.startDay??0)+60),firstRef))})}>Үе шат нэмэх</button>}
   <label className="adm-reason">Засварын шалтгаан<input value={reason} maxLength={400} onChange={e=>setReason(e.target.value)}/></label>
   <button type="button" className="adm-btn adm-btn--primary" disabled={busy||!draft||reason.trim().length<3} onClick={()=>void save()}>{busy?'Шалгаж байна…':'Төлөвлөгөөг хадгалах'}</button></div>}
 </section>;
}
