import React,{useEffect,useState} from 'react';
import { AppShell,PageContainer,go } from '../components/AppShell';
import { Button,Field,Select,StatusBadge } from '../components/UI';
import { EmptyState,ErrorState,LoadingState } from '../components/ApiState';
import { Icon } from '../components/Icon';
import { api,session } from '../api/client';
import type { BillingStatus,Company } from '../api/types';
import { formatDate } from '../api/types';
import { businessAreas,businessAreaById,type BusinessAreaId } from '../data/businessEvaluation';
import { areaReportPalette } from '../data/reportExperience';
import { isTestBusiness } from '../data/experience';
import AccountData from './AccountData';

const paymentLabel=(code:string)=>code==='RETAKE'?'Дахин оношилгоо':'Анхны оношилгоо';
const areaForInvoice=(invoiceId:string,index:number,test:boolean)=>{const saved=localStorage.getItem(`mmri.invoiceArea.${invoiceId}`) as BusinessAreaId|null;if(saved&&businessAreas.some(a=>a.id===saved))return businessAreaById(saved);if(test)return businessAreas[index%businessAreas.length];return null};
const statusLabel:Record<string,string>={CREATED:'Үүсгэсэн',PENDING:'Хүлээгдэж байна',PAID:'Төлөгдсөн',CANCELLED:'Цуцлагдсан',FAILED:'Амжилтгүй',REFUNDED:'Буцаагдсан'};
const statusTone=(s:string)=>s==='PAID'?'success':s==='PENDING'?'warning':s==='FAILED'?'danger':'neutral';
function section(){const q=window.location.hash.split('?')[1]||'';return new URLSearchParams(q).get('section')||'technical'}

export default function Settings(){
 const current=section();const [billing,setBilling]=useState<BillingStatus|null>(null);const [loading,setLoading]=useState(current==='payments');const [error,setError]=useState('');const [paymentRetry,setPaymentRetry]=useState(0);
 const [logoutBusy,setLogoutBusy]=useState(false);
 /* MMRI-23: totals come from the server for ALL invoices; older history rows are paged in on request instead of being silently cut at 50. */
 const [moreRows,setMoreRows]=useState<BillingStatus['invoices']>([]);const [moreBusy,setMoreBusy]=useState(false);
 /* MMRI-08: explicit active-company choice, shown only when the account belongs to more than one company. */
 const [choice,setChoice]=useState<{companies:Company[];needsChoice:boolean}>({companies:[],needsChoice:false});
 useEffect(()=>{if(current==='payments'||current==='data'||!session.accessToken)return;let live=true;void api.resolveActiveCompany().then(r=>{if(live)setChoice({companies:r.companies,needsChoice:r.needsChoice})}).catch(()=>{});return()=>{live=false}},[current]);
 const chooseCompany=(id:string)=>{const c=choice.companies.find(x=>x.id===id);if(!c)return;api.setActiveCompany(c);setChoice({companies:choice.companies,needsChoice:false});go('analysis')};
 const loadMore=async()=>{if(!session.companyId||!billing||moreBusy)return;setMoreBusy(true);try{const page=await api.listBillingInvoices(session.companyId,billing.invoices.length+moreRows.length,50);setMoreRows(rows=>[...rows,...page.invoices])}catch(e:any){setError(e?.message||'Төлбөрийн түүхийг ачаалж чадсангүй.')}finally{setMoreBusy(false)}};
 useEffect(()=>{if(current!=='payments')return;if(!session.accessToken){go('login');return}if(!session.companyId){setLoading(false);return}let live=true;setLoading(true);setError('');void api.getBillingStatus(session.companyId).then(x=>{if(live)setBilling(x)}).catch((e:any)=>{if(live)setError(e?.message||'Төлбөрийн түүхийг ачаалж чадсангүй.')}).finally(()=>{if(live)setLoading(false)});return()=>{live=false}},[current,paymentRetry]);
 if(current==='data'){if(!session.accessToken){go('login');return null}return <AccountData/>}
 const logout=async()=>{setLogoutBusy(true);try{await api.logout()}finally{setLogoutBusy(false);go('home')}};
 if(current==='payments'){
  if(loading)return <AppShell route="settings"><PageContainer><LoadingState variant="payment" label="Төлбөрийн түүхийг ачаалж байна…"/></PageContainer></AppShell>;
  if(error)return <AppShell route="settings"><PageContainer><ErrorState message={error} onRetry={()=>setPaymentRetry(v=>v+1)}/></PageContainer></AppShell>;
  const rows=[...(billing?.invoices??[]),...moreRows];const history=(billing as (BillingStatus&{history?:{total:number;restricted:boolean}})|null)?.history;const hasMore=!!history&&!history.restricted&&rows.length<history.total;const restricted=!!history?.restricted;const testHistory=isTestBusiness(session.companyName);return <AppShell route="settings"><PageContainer className="account-payment-history"><header><span><Icon name="receipt" size={34}/></span><div><b>МИНИЙ ХЭСЭГ</b><h1>Төлбөрийн түүх</h1><p>Өмнө хийсэн анхны болон дахин оношилгооны төлбөрүүд.</p></div></header><section>{rows.length?rows.map((x,index)=>{const area=x.domainCode&&businessAreas.some(a=>a.id===x.domainCode)?businessAreaById(x.domainCode):areaForInvoice(x.id,index,testHistory);const palette=area?areaReportPalette[area.id]:null;return <article key={x.id} className="lg" style={{'--domain-primary':palette?.accent,'--domain-secondary':palette?.secondary} as React.CSSProperties}><div className="payment-history-area"><span className="payment-history-icon" aria-hidden="true">{area?<i className="payment-history-swatch"/>:<Icon name="receipt" size={26}/>}</span><strong>{area?.name??'Чиглэл тодорхойгүй'}</strong><span>{paymentLabel(x.planCode)}</span></div><div className="payment-history-date"><small>Огноо</small><b>{formatDate(x.paidAt||x.createdAt)}</b></div><div className="payment-history-amount"><small>Дүн</small><b>{x.amountMnt.toLocaleString('en-US')}₮</b></div><StatusBadge tone={statusTone(x.status) as any}>{statusLabel[x.status]||'Тодорхойгүй'}</StatusBadge></article>}):<EmptyState className="compact account-payment-history__empty-state" title="Одоогоор төлбөрийн бүртгэл алга" description={restricted?'Төлбөрийн түүхийг зөвхөн байгууллагын эзэмшигч болон админ харна.':'Төлбөр баталгаажсаны дараа анхны болон дахин оношилгооны төлбөр энд харагдана.'} action={<Button onClick={()=>go('analysis')}>Оношилгоо руу</Button>}/>}{hasMore&&<Button variant="secondary" loading={moreBusy} onClick={loadMore}>Өмнөх төлбөрүүдийг харуулах</Button>}</section></PageContainer></AppShell>
 }
 const account=[['building','Байгууллагын мэдээлэл','Нэр болон суурь мэдээллээ засах','profile'],['receipt','Төлбөрийн түүх','Өмнөх төлбөрүүд болон тэдгээрийн төлөв','payments'],['shield','Өгөгдөл ба нууцлал','Мэдээлэл татах, устгах, нууцлалын бодлого','data']] as const;
 return <AppShell route="settings"><PageContainer className="technical-settings"><header><span><Icon name="gear" size={34}/></span><div><b>МИНИЙ ХЭСЭГ</b><h1 data-route-heading tabIndex={-1}>Тохиргоо</h1></div></header>
 <section className="technical-settings__account lg lg--soft"><h2>Бүртгэл</h2>{choice.companies.length>1&&<Field label="Идэвхтэй байгууллага" htmlFor="active-company" help={choice.needsChoice?'Та олон байгууллагад харьяалагддаг. Үргэлжлүүлэхийн өмнө ажиллах байгууллагаа сонгоно уу.':undefined}><Select id="active-company" value={choice.needsChoice?'':(session.companyId||'')} onChange={e=>chooseCompany(e.target.value)}>{choice.needsChoice&&<option value="">Сонгоно уу</option>}{choice.companies.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>}<ul>{account.map(([icon,title,desc,target])=><li key={target}><a href={target==='payments'?'#/settings?section=payments':target==='data'?'#/settings?section=data':'#/profile'}><span><Icon name={icon} size={22}/></span><span><b>{title}</b><small>{desc}</small></span><Icon name="arrow" size={18}/></a></li>)}</ul><Button variant="danger" loading={logoutBusy} onClick={logout}>Системээс гарах</Button></section></PageContainer></AppShell>;
}
