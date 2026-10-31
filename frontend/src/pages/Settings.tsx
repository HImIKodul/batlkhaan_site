import React,{useEffect,useState} from 'react';
import { AppShell,PageContainer,go } from '../components/AppShell';
import { Button,StatusBadge } from '../components/UI';
import { EmptyState,ErrorState,LoadingState } from '../components/ApiState';
import { Icon } from '../components/Icon';
import { Glyph } from '../components/Glyphs';
import { api,session } from '../api/client';
import type { BillingStatus } from '../api/types';
import { formatDate } from '../api/types';
import { businessAreas,businessAreaById,type BusinessAreaId } from '../data/businessEvaluation';
import { areaReportPalette } from '../data/reportExperience';
import { isTestBusiness } from '../data/experience';

const paymentLabel=(code:string)=>code==='RETAKE'?'Дахин оношилгоо':'Анхны оношилгоо';
const areaForInvoice=(invoiceId:string,index:number,test:boolean)=>{const saved=localStorage.getItem(`mmri.invoiceArea.${invoiceId}`) as BusinessAreaId|null;if(saved&&businessAreas.some(a=>a.id===saved))return businessAreaById(saved);if(test)return businessAreas[index%businessAreas.length];return null};
const statusLabel:Record<string,string>={CREATED:'Үүсгэсэн',PENDING:'Хүлээгдэж байна',PAID:'Төлөгдсөн',CANCELLED:'Цуцлагдсан',FAILED:'Амжилтгүй'};
const statusTone=(s:string)=>s==='PAID'?'success':s==='PENDING'?'warning':s==='FAILED'?'danger':'neutral';
function section(){const q=window.location.hash.split('?')[1]||'';return new URLSearchParams(q).get('section')||'technical'}
const FONT_KEY='mmri.fontSize';
function readFont(){const v=localStorage.getItem(FONT_KEY);return v==='small'||v==='large'?v:'normal'}
function applyFont(v:string){document.documentElement.dataset.mmriFontSize=v;localStorage.setItem(FONT_KEY,v)}

export default function Settings(){
 const current=section();const [billing,setBilling]=useState<BillingStatus|null>(null);const [loading,setLoading]=useState(current==='payments');const [error,setError]=useState('');const [paymentRetry,setPaymentRetry]=useState(0);
 const [font,setFont]=useState(readFont);const [logoutBusy,setLogoutBusy]=useState(false);
 const chooseFont=(v:string)=>{setFont(v);applyFont(v)};
 useEffect(()=>{if(current!=='payments')return;if(!session.accessToken){go('login');return}if(!session.companyId){setLoading(false);return}let live=true;setLoading(true);setError('');void api.getBillingStatus(session.companyId).then(x=>{if(live)setBilling(x)}).catch((e:any)=>{if(live)setError(e?.message||'Төлбөрийн түүхийг ачаалж чадсангүй.')}).finally(()=>{if(live)setLoading(false)});return()=>{live=false}},[current,paymentRetry]);
 const logout=async()=>{setLogoutBusy(true);try{await api.logout()}finally{setLogoutBusy(false);go('home')}};
 if(current==='payments'){
  if(loading)return <AppShell route="settings"><PageContainer><LoadingState variant="payment" label="Төлбөрийн түүхийг ачаалж байна…"/></PageContainer></AppShell>;
  if(error)return <AppShell route="settings"><PageContainer><ErrorState message={error} onRetry={()=>setPaymentRetry(v=>v+1)}/></PageContainer></AppShell>;
  const rows=billing?.invoices??[];const testHistory=isTestBusiness(session.companyName);return <AppShell route="settings"><PageContainer className="account-payment-history"><header><span><Icon name="receipt" size={34}/></span><div><b>МИНИЙ ХЭСЭГ</b><h1>Төлбөрийн түүх</h1><p>Өмнө хийсэн анхны болон дахин оношилгооны төлбөрүүд.</p></div></header><section>{rows.length?rows.map((x,index)=>{const area=x.domainCode&&businessAreas.some(a=>a.id===x.domainCode)?businessAreaById(x.domainCode):areaForInvoice(x.id,index,testHistory);const palette=area?areaReportPalette[area.id]:null;return <article key={x.id} className="lg" style={{'--domain-primary':palette?.accent,'--domain-secondary':palette?.secondary} as React.CSSProperties}><div className="payment-history-area"><span className="payment-history-icon" aria-hidden="true">{area?<Glyph name={area.id} size={44} light/>:<Icon name="receipt" size={26}/>}</span><strong>{area?.name??'Чиглэл тодорхойгүй'}</strong><span>{paymentLabel(x.planCode)}</span></div><div className="payment-history-date"><small>Огноо</small><b>{formatDate(x.paidAt||x.createdAt)}</b></div><div className="payment-history-amount"><small>Дүн</small><b>{x.amountMnt.toLocaleString('en-US')}₮</b></div><StatusBadge tone={statusTone(x.status) as any}>{statusLabel[x.status]||'Тодорхойгүй'}</StatusBadge></article>}):<EmptyState className="compact account-payment-history__empty-state" title="Одоогоор төлбөрийн бүртгэл алга" description="Төлбөр баталгаажсаны дараа анхны болон дахин оношилгооны төлбөр энд харагдана." action={<Button onClick={()=>go('analysis')}>Оношилгоо руу</Button>}/>}</section></PageContainer></AppShell>
 }
 const account=[['building','Байгууллагын мэдээлэл','Нэр болон суурь мэдээллээ засах','profile'],['receipt','Төлбөрийн түүх','Өмнөх төлбөрүүд болон тэдгээрийн төлөв','payments']] as const;
 return <AppShell route="settings"><PageContainer className="technical-settings"><header><span><Icon name="gear" size={34}/></span><div><b>МИНИЙ ХЭСЭГ</b><h1 data-route-heading tabIndex={-1}>Тохиргоо</h1></div></header>
 <section className="technical-settings__group lg lg--soft"><h2>Үсгийн хэмжээ</h2><p>Унших хэмжээг өөрт тохируулна. Өөрчлөлт шууд хадгалагдана.</p><div className="technical-settings__choices" role="group" aria-label="Үсгийн хэмжээ">{[['small','Жижиг'],['normal','Хэвийн'],['large','Том']].map(([id,label])=><button type="button" key={id} className={font===id?'is-active':''} aria-pressed={font===id} onClick={()=>chooseFont(id)}><span className={`font-preview is-${id}`}>Аа</span><b>{label}</b></button>)}</div></section>
 <section className="technical-settings__account lg lg--soft"><h2>Бүртгэл</h2><ul>{account.map(([icon,title,desc,target])=><li key={target}><a href={target==='payments'?'#/settings?section=payments':'#/profile'}><span><Icon name={icon} size={22}/></span><span><b>{title}</b><small>{desc}</small></span><Icon name="arrow" size={18}/></a></li>)}</ul><Button variant="danger" loading={logoutBusy} onClick={logout}>Системээс гарах</Button></section></PageContainer></AppShell>;
}
