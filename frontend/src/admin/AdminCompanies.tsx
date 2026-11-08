import React,{useState} from 'react';
import { adminApi,fmt,DOMAIN_MN,type AdminMe } from './adminApi';
import { Page,Empty,Err,Loading,Pager,useAsync,adminHref } from './AdminApp';
import { Badge,ConfirmDialog,ROLE_MN } from './AdminUi';

/* "Компаниуд": find a company, see its people and diagnoses, correct its name/industry. Access to diagnosis domains lives in «Оношилгооны эрх». */
const ASSESS_MN:Record<string,string>={COMPLETED:'Дууссан',COMPLETED_WITH_REVIEW:'Дууссан (хянагдсан)',EXHAUSTED:'Дууссан',IN_PROGRESS:'Явагдаж байна',PAUSED:'Түр зогссон',PROFILE_PENDING:'Эхлээгүй',READY_FOR_COMPLETION:'Дуусах шатандаа',PROCESSING:'Боловсруулж байна'};

function CompanyDetail({id}:{id:string}){
 const {loading,error,data,reload}=useAsync(()=>adminApi.get(`/companies/${id}`),[id]);
 const [edit,setEdit]=useState(false);const [name,setName]=useState('');const [industry,setIndustry]=useState('');const [msg,setMsg]=useState('');
 if(loading&&!data)return <Page title="Компани"><Loading/></Page>;if(error||!data)return <Page title="Компани"><Err text={error} retry={reload}/></Page>;
 const c=data.company;const erased=!!c.erasedAt;
 return <Page title={erased?'Устгагдсан компани':c.name} actions={<a className="adm-btn" href={adminHref('companies')}>‹ Компаниуд</a>}>
  {msg&&<div className="adm-note adm-note--ok" role="status">{msg}</div>}
  <section className="adm-card"><dl className="adm-dl"><dt>Нэр</dt><dd>{erased?'-':c.name}</dd><dt>Салбар</dt><dd>{c.industry||'-'}</dd><dt>Бүртгүүлсэн</dt><dd>{fmt(c.createdAt)}</dd></dl>
   {erased?<p className="adm-note">Компани эзэмшигчийн хүсэлтээр устгагдсан тул өөрчлөх боломжгүй.</p>:<div className="adm-actions__row"><button type="button" className="adm-btn" onClick={()=>{setName(c.name);setIndustry(c.industry??'');setEdit(true)}}>Нэр, салбар засах</button><a className="adm-btn adm-btn--primary" href={adminHref('access')+`?company=${id}`}>Оношилгооны эрх харах</a></div>}</section>
  <section className="adm-card"><h2>Хүмүүс</h2>{data.members.length===0?<Empty text="Гишүүн алга."/>:<ul className="adm-list">{data.members.map((m:any,i:number)=><li key={i}>{m.name?`${m.name} · `:''}{m.email} <small>{ROLE_MN[m.role]??m.role}</small></li>)}</ul>}</section>
  <section className="adm-card"><h2>Оношилгоо</h2>{data.assessments.length===0?<Empty text="Оношилгоо хийгдээгүй байна."/>:<table className="adm-table"><thead><tr><th>Чиглэл</th><th>Төлөв</th><th>Оноо</th><th>Дууссан</th></tr></thead><tbody>{data.assessments.map((a:any)=><tr key={a.id}><td data-label="Чиглэл">{(DOMAIN_MN as any)[a.domainCode]??a.domainCode}</td><td data-label="Төлөв"><Badge tone={a.incomplete?'warn':'ok'}>{ASSESS_MN[a.status]??'—'}</Badge></td><td data-label="Оноо">{a.score!=null?Math.round(Number(a.score)):'-'}</td><td data-label="Дууссан">{a.completedAt?fmt(a.completedAt):'-'}</td></tr>)}</tbody></table>}</section>
  {edit&&<ConfirmDialog title="Компанийн мэдээлэл засах" confirmLabel="Хадгалах" canSubmit={name.trim().length>=2} onCancel={()=>setEdit(false)}
   extra={<><label>Компанийн нэр<input value={name} onChange={e=>setName(e.target.value)} maxLength={160} required/></label><label>Салбар<input value={industry} onChange={e=>setIndustry(e.target.value)} maxLength={120}/></label></>}
   onConfirm={async reason=>{await adminApi.post(`/companies/${id}/details`,{name,industry,reason});setEdit(false);setMsg('Мэдээлэл хадгалагдлаа.');reload()}}>
   <ul><li>Зөвхөн нэр, салбар өөрчлөгдөнө.</li><li>Оношилгоо, төлбөр, тайлан хэвээр үлдэнэ.</li></ul></ConfirmDialog>}
 </Page>;
}

export default function AdminCompanies({id}:{id:string;query:URLSearchParams;me:AdminMe}){
 const [q,setQ]=useState('');const [applied,setApplied]=useState('');const [page,setPage]=useState(1);
 const {loading,error,data,reload}=useAsync(()=>id?Promise.resolve(null):adminApi.get(`/companies?page=${page}&pageSize=20${applied?`&q=${encodeURIComponent(applied)}`:''}`),[page,applied,id]);
 if(id)return <CompanyDetail id={id}/>;
 return <Page title="Компаниуд">
  <form className="adm-filters" onSubmit={e=>{e.preventDefault();setPage(1);setApplied(q.trim())}} role="search"><label>Компанийн нэрээр хайх<input value={q} onChange={e=>setQ(e.target.value)} maxLength={100}/></label><button type="submit" className="adm-btn adm-btn--primary">Хайх</button></form>
  {loading?<Loading/>:error?<Err text={error} retry={reload}/>:!data||data.items.length===0?<Empty text="Компани олдсонгүй."/>:<>
   <table className="adm-table"><thead><tr><th>Компани</th><th>Салбар</th><th>Оношилгоо</th><th>Бүртгүүлсэн</th></tr></thead><tbody>{data.items.map((c:any)=><tr key={c.id}><td data-label="Компани"><a className="adm-link" href={adminHref('companies',c.id)}>{c.name}</a></td><td data-label="Салбар">{c.industry||'-'}</td><td data-label="Оношилгоо">{c.assessments}</td><td data-label="Бүртгүүлсэн">{fmt(c.createdAt)}</td></tr>)}</tbody></table>
   <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage}/></>}
 </Page>;
}
