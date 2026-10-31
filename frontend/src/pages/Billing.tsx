import React,{useEffect,useMemo,useRef,useState} from 'react';
import { AppShell,PageContainer,go } from '../components/AppShell';
import { useAmbientEnvironment } from '../design/environment';
import { Button,StatusBadge } from '../components/UI';
import { ErrorState,LoadingState } from '../components/ApiState';
import { Icon } from '../components/Icon';
import { Glyph } from '../components/Glyphs';
import { api,session } from '../api/client';
import type { BillingCatalogPlan,BillingInvoice,BillingInvoiceStatus,BillingPlanCode,BillingStatus } from '../api/types';
import { businessAreaById,type BusinessAreaId } from '../data/businessEvaluation';
import { areaReportPalette } from '../data/reportExperience';

const money=(n:number)=>`${new Intl.NumberFormat('mn-MN').format(n)} ₮`;
const imageSource=(value:string|null|undefined)=>!value?null:value.startsWith('data:')?value:`data:image/png;base64,${value}`;
const openStatuses=new Set<BillingInvoiceStatus>(['CREATED','PENDING']);
const labels:Record<BillingInvoiceStatus,string>={CREATED:'Код бэлтгэж байна',PENDING:'Төлбөр хүлээж байна',PAID:'Төлбөр баталгаажсан',CANCELLED:'Цуцлагдсан',FAILED:'Амжилтгүй'};
const tones:Record<BillingInvoiceStatus,'neutral'|'warning'|'success'|'danger'>={CREATED:'neutral',PENDING:'warning',PAID:'success',CANCELLED:'neutral',FAILED:'danger'};
function PlaceholderCode({seed}:{seed:string}){const cells=Array.from({length:441},(_,i)=>{let h=2166136261;for(const c of `${seed}:${i}`){h^=c.charCodeAt(0);h=Math.imul(h,16777619)}return(h>>>0)%3===0});const finder=(x:number,y:number)=><><rect x={x} y={y} width="7" height="7" fill="currentColor"/><rect x={x+1} y={y+1} width="5" height="5" fill="#fff"/><rect x={x+2} y={y+2} width="3" height="3" fill="currentColor"/></>;return <svg className="billing-domain-qr__placeholder" viewBox="0 0 21 21" role="img" aria-label="Төлбөрийн код"><rect width="21" height="21" fill="#fff"/>{cells.map((on,i)=>{const x=i%21,y=Math.floor(i/21),zone=(x<8&&y<8)||(x>12&&y<8)||(x<8&&y>12);return on&&!zone?<rect key={i} x={x} y={y} width="1" height="1" fill="currentColor"/>:null})}{finder(0,0)}{finder(14,0)}{finder(0,14)}</svg>}

export default function Billing(){
 const requestedArea=((sessionStorage.getItem('business:billingArea')||'marketing') as BusinessAreaId);const area=businessAreaById(requestedArea);const areaId=area.id;useAmbientEnvironment(areaId);const mode=sessionStorage.getItem('business:billingMode')==='retake'?'retake':'first';const code:BillingPlanCode=mode==='retake'?'RETAKE':'DIAGNOSTIC';const palette=areaReportPalette[area.id];
 const [plans,setPlans]=useState<BillingCatalogPlan[]>([]);const [status,setStatus]=useState<BillingStatus|null>(null);const [invoice,setInvoice]=useState<BillingInvoice|null>(null);const [loading,setLoading]=useState(true);const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [showSuccess,setShowSuccess]=useState(false);const successActionRef=useRef<HTMLButtonElement|null>(null);const successDialogRef=useRef<HTMLDivElement|null>(null);const successRestoreRef=useRef<HTMLElement|null>(null);
 const plan=useMemo(()=>plans.find(p=>p.code===code)??null,[plans,code]);const amount=plan?.amountMnt??300000;
 const refresh=async()=>{if(!session.companyId)return null;const s=await api.getBillingStatus(session.companyId);setStatus(s);return s};
 const openSuccess=()=>{const active=document.activeElement;successRestoreRef.current=active instanceof HTMLElement?active:null;setShowSuccess(true)};
 const readInvoice=async(current:BillingInvoice)=>{const latest=await api.getBillingInvoice(current.id);setInvoice(latest);if(latest.status==='PAID'){sessionStorage.setItem(`business:paid.${areaId}`,mode);openSuccess()}await refresh();return latest};
 const load=async()=>{if(!session.accessToken){go('login');return}if(!session.companyId){go('profile');return}setLoading(true);setError('');try{const [p,s]=await Promise.all([api.getBillingPlans(),api.getBillingStatus(session.companyId)]);setPlans(p);setStatus(s);const existing=s.invoices.find(x=>x.domainCode===areaId&&x.planCode===code&&openStatuses.has(x.status));if(existing){const full=await api.getBillingInvoice(existing.id);setInvoice(full);if(full.status==='PAID')openSuccess()}}catch(e:any){setError(e?.message||'Төлбөрийн мэдээллийг ачаалж чадсангүй.')}finally{setLoading(false)}};
 useEffect(()=>{void load()},[areaId,code]);
 const create=async()=>{if(!session.companyId||busy)return;setBusy(true);setError('');try{const i=await api.createBillingInvoice(session.companyId,code,areaId);setInvoice(i);localStorage.setItem(`mmri.invoiceArea.${i.id}`,areaId);await refresh()}catch(e:any){setError(e?.message||'Төлбөрийн код үүсгэж чадсангүй.')}finally{setBusy(false)}};
 const check=async()=>{if(!invoice||busy)return;setBusy(true);setError('');try{await readInvoice(invoice)}catch(e:any){setError(e?.message||'Төлбөрийг баталгаажуулж чадсангүй.')}finally{setBusy(false)}};
 const mockPay=async()=>{if(!invoice||busy)return;setBusy(true);setError('');try{const i=await api.mockPayBillingInvoice(invoice.id);setInvoice(i);await refresh();sessionStorage.setItem(`business:paid.${areaId}`,mode);openSuccess()}catch(e:any){setError(e?.message||'Туршилтын төлбөр баталгаажсангүй.')}finally{setBusy(false)}};
 useEffect(()=>{
  if(!showSuccess)return;
  document.body.classList.add('mmri-modal-open');
  requestAnimationFrame(()=>successActionRef.current?.focus());
  const onKey=(event:KeyboardEvent)=>{
   if(event.key==='Escape'){event.preventDefault();setShowSuccess(false);return}
   if(event.key!=='Tab')return;
   const panel=successDialogRef.current;if(!panel)return;
   const items=Array.from(panel.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])'));
   if(!items.length){event.preventDefault();return}
   const first=items[0],last=items[items.length-1],active=document.activeElement;
   if(event.shiftKey&&active===first){event.preventDefault();last.focus()}
   else if(!event.shiftKey&&active===last){event.preventDefault();first.focus()}
  };
  document.addEventListener('keydown',onKey);
  return()=>{document.body.classList.remove('mmri-modal-open');document.removeEventListener('keydown',onKey);requestAnimationFrame(()=>{const target=successRestoreRef.current;if(target?.isConnected)target.focus()})};
 },[showSuccess]);
 useEffect(()=>{
  if(!invoice||!openStatuses.has(invoice.status))return;
  let active=true;
  let running=false;
  const poll=async()=>{
   if(!active||running||document.visibilityState==='hidden'||navigator.onLine===false)return;
   running=true;
   try{await readInvoice(invoice)}catch{/* manual check remains available; background polling is best-effort */}
   finally{running=false}
  };
  const resume=()=>{if(document.visibilityState==='visible'&&navigator.onLine!==false)void poll()};
  const t=window.setInterval(()=>void poll(),3000);
  document.addEventListener('visibilitychange',resume);
  window.addEventListener('online',resume);
  return()=>{active=false;window.clearInterval(t);document.removeEventListener('visibilitychange',resume);window.removeEventListener('online',resume)};
 },[invoice?.id,invoice?.status]);
 if(loading)return <AppShell route="billing"><PageContainer><LoadingState variant="payment" label="Төлбөрийг бэлтгэж байна…"/></PageContainer></AppShell>;
 if(error&&!status)return <AppShell route="billing"><PageContainer><ErrorState message={error} onRetry={load}/></PageContainer></AppShell>;
 const paid=invoice?.status==='PAID';const codeImage=imageSource(invoice?.qrImage);
 return <AppShell route="billing"><PageContainer className="billing-domain-page billing-domain-page--compact" style={{'--billing-accent':palette.accent,'--billing-ink':palette.ink} as React.CSSProperties}>
  <button type="button" className="billing-domain-back" onClick={()=>{window.location.hash='#/analysis'}}><span className="billing-domain-back__icon"><Icon name="back" size={20}/></span><span>Оношилгоо руу буцах</span></button>
  <header><div className="billing-domain-icon"><Glyph name={area.id} size={64}/></div><div><span>{mode==='retake'?'ДАХИН ОНОШИЛГОО':'АНХНЫ ОНОШИЛГОО'}</span><h1>{area.name}</h1><p>{mode==='retake'?'Өмнөх тайлан хэвээр үлдэнэ. Шинэ оношилгоо шинэ тайлан болж хадгалагдана.':'Төлбөр зөвхөн энэ чиглэлийн нэг удаагийн оношилгоонд хамаарна.'}</p></div><strong>{money(amount)}</strong></header>
  {error&&<div className="billing-domain-error" role="alert" aria-live="assertive"><Icon name="alert" size={18}/>{error}</div>}
  <section className="billing-domain-flow" aria-label="Төлбөрийн дараалал"><div className={!invoice?'is-current':'is-done'}><b>1</b><span>Код үүсгэх</span></div><div className={invoice&&!paid?'is-current':paid?'is-done':''}><b>2</b><span>Төлбөр хийх</span></div><div className={paid?'is-done':''}><b>3</b><span>Эрх нээх</span></div></section><section className="billing-domain-layout billing-domain-layout--single"><article className="billing-domain-main">
   {!invoice?<div className="billing-domain-start"><Icon name="wallet" size={52}/><h2>{mode==='retake'?'Дахин оношилгооны төлбөр':'Оношилгооны төлбөр'}</h2><p>Төлбөрийн код үүсгээд банкны хэрэглүүрээр уншуулна. Төлбөр ормогц систем өөрөө шалгаж эрхийг нээнэ.</p><Button loading={busy} onClick={create}>Төлбөрийн код үүсгэх</Button></div>:paid?<div className="billing-domain-success"><Icon name="check" size={52}/><h2>Төлбөр баталгаажсан</h2><p>Оношилгоог эхлүүлэхэд бэлэн.</p><Button onClick={()=>go('analysis')}>Оношилгоо руу очих</Button></div>:<div className="billing-payment-console"><div className="billing-domain-qr"><div style={{color:palette.accent}}>{codeImage?<img src={codeImage} alt={`${area.name} чиглэлийн төлбөрийн код`}/>:<PlaceholderCode seed={invoice.id}/>}</div></div><div className="billing-payment-console__copy"><span>ТӨЛӨХ ДҮН</span><h2>{money(invoice.amountMnt)}</h2><StatusBadge tone={tones[invoice.status]}>{labels[invoice.status]}</StatusBadge><p>Банкны гар утасны хэрэглүүрээр кодыг уншуулж төлнө. Энэ дэлгэц нээлттэй үед систем төлбөрийн төлөвийг автоматаар шалгана. Хэрэв шууд нээгдэхгүй бол доорх товчийг дарна.</p><div className="billing-domain-actions"><Button loading={busy} onClick={check}>Төлбөр баталгаажуулах</Button>{invoice.testMode&&openStatuses.has(invoice.status)&&<Button variant="secondary" loading={busy} onClick={mockPay}>Туршилтын төлбөр хийх</Button>}</div></div></div>}
  </article></section>
  {showSuccess&&<div className="billing-success-modal" role="dialog" aria-modal="true" aria-labelledby="billing-success-title" aria-describedby="billing-success-copy"><div ref={successDialogRef}><button type="button" className="billing-success-modal__close" aria-label="Цонх хаах" onClick={()=>setShowSuccess(false)}><Icon name="close" size={20}/></button><span className="billing-success-modal__mark" aria-hidden="true"><Icon name="check" size={44}/></span><h2 id="billing-success-title">Төлбөр амжилттай баталгаажлаа</h2><p id="billing-success-copy">{area.name} чиглэлийн оношилгоо нээгдлээ.</p><Button ref={successActionRef} onClick={()=>{setShowSuccess(false);go('analysis')}}>Оношилгоо эхлүүлэх</Button></div></div>}
 </PageContainer></AppShell>;
}
