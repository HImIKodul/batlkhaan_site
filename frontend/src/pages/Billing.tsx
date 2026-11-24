import React,{useEffect,useMemo,useRef,useState} from 'react';
import { domainNameMn } from '../data/domainOrder';
import DomainBadge from '../components/DomainBadge';
import qrcode from 'qrcode-generator';
import { AppShell,PageContainer,go } from '../components/AppShell';
import { useAmbientEnvironment } from '../design/environment';
import { Button,StatusBadge } from '../components/UI';
import { ErrorState,LoadingState,SkeletonHost,BillingSkeletonBody } from '../components/ApiState';
import { Icon } from '../components/Icon';
import { ApiError,api,session } from '../api/client';
import type { BillingCatalogPlan,BillingInvoice,BillingInvoiceStatus,BillingPlanCode,BillingStatus } from '../api/types';
import { businessAreaById,type BusinessAreaId } from '../data/businessEvaluation';
import { heroIntent } from '../components/HeroCrystal';
import { REPORT_AREA_KEY } from '../data/experience';
import { areaReportPalette } from '../data/reportExperience';
import { isTestBusiness } from '../data/experience';

const money=(n:number)=>`${new Intl.NumberFormat('mn-MN').format(n)} ₮`;
const imageSource=(value:string|null|undefined)=>!value?null:value.startsWith('data:')?value:`data:image/png;base64,${value}`;
const openStatuses=new Set<BillingInvoiceStatus>(['CREATED','PENDING']);
const labels:Record<BillingInvoiceStatus,string>={CREATED:'Код бэлтгэж байна',PENDING:'Төлбөр хүлээж байна',PAID:'Төлбөр баталгаажсан',CANCELLED:'Цуцлагдсан',FAILED:'Амжилтгүй',REFUNDED:'Буцаагдсан'};
const tones:Record<BillingInvoiceStatus,'neutral'|'warning'|'success'|'danger'>={CREATED:'neutral',PENDING:'warning',PAID:'success',CANCELLED:'neutral',FAILED:'danger',REFUNDED:'neutral'};
/** The text a customer may scan to pay: only a provider payload (QPay / manual operator code). The mock payload is not a payable code. */
export function payableQrText(invoice:Pick<BillingInvoice,'provider'|'qrText'>):string|null{
 const text=(invoice.qrText||'').trim();
 return invoice.provider==='MOCK'||!text||text.length>1500?null:text;
}
/** A real, standards-compliant QR code of `text` (error correction M, 4 module quiet zone, black on white for reliable scanning). */
function QrCode({text,label}:{text:string;label:string}){
 let n=0,d='';
 try{const qr=qrcode(0,'M');qr.addData(text,'Byte');qr.make();n=qr.getModuleCount();for(let y=0;y<n;y++)for(let x=0;x<n;x++)if(qr.isDark(y,x))d+=`M${x+4} ${y+4}h1v1h-1z`}catch{return null}
 return <svg className="billing-domain-qr__placeholder" viewBox={`0 0 ${n+8} ${n+8}`} role="img" aria-label={label} shapeRendering="crispEdges"><rect width={n+8} height={n+8} fill="#fff"/><path d={d} fill="#000"/></svg>;
}
function NoPayableCode({invoice}:{invoice:BillingInvoice}){
 const links=[invoice.shortUrl,...invoice.deeplinks.map(x=>x.link)].filter((u):u is string=>!!u&&/^https:\/\//i.test(u)).slice(0,4);
 return <div className="billing-domain-qr__unavailable" role="status"><b>{invoice.provider==='MOCK'?'Туршилтын горим':'Төлбөрийн код бэлэн биш'}</b><span>{invoice.provider==='MOCK'?'Энэ нь бодит төлбөрийн код биш. Доорх туршилтын товчоор төлбөрийг баталгаажуулна.':invoice.provider==='MANUAL'?'Төлбөрийн код тохируулагдаагүй байна. Оператортой холбогдож төлбөрийн заавар авна уу.':'Банкнаас төлбөрийн код ирсэнгүй. Дахин оролдох эсвэл тусламжид хандана уу.'}</span>{links.map(u=><a key={u} href={u} target="_blank" rel="noopener noreferrer">Төлбөр хийх холбоос</a>)}</div>;
}

/** Same rule as the server: any app scheme except those a browser could execute. Links are used exactly as the provider sent them. */
const payLink=(u:string)=>/^[a-z][a-z0-9+.-]{1,40}:\/\//i.test(u)&&!/^(javascript|data|vbscript|file|blob|about):/i.test(u);
/** Bank apps that open this exact invoice. Custom app schemes only work on a phone, so the list is shown on touch devices; the short address works everywhere. */
function BankLinks({invoice}:{invoice:BillingInvoice}){
 const links=invoice.deeplinks.filter(x=>x.link&&payLink(x.link));const short=invoice.shortUrl&&/^https:\/\//i.test(invoice.shortUrl)?invoice.shortUrl:'';
 if(!links.length&&!short)return null;
 return <div className="billing-qr__banks">{links.length>0&&<><h2>Банкны аппаар төлөх</h2><ul>{links.map((x,i)=><li key={`${x.link}-${i}`}><a href={x.link} rel="noopener noreferrer">{x.logo&&/^https:\/\//i.test(x.logo)&&<img src={x.logo} alt="" width={36} height={36} loading="lazy" referrerPolicy="no-referrer" onError={e=>{e.currentTarget.style.display='none'}}/>}<span>{x.description||x.name||'Банкны апп'}</span></a></li>)}</ul></>}{short&&<a className="billing-qr__short" href={short} target="_blank" rel="noopener noreferrer">Төлбөрийн холбоос нээх</a>}</div>;
}
/** Remaining validity of a provider code (server time limit). */
function useSecondsLeft(expiresAt?:string|null){
 const read=()=>expiresAt?Math.max(0,Math.floor((new Date(expiresAt).getTime()-Date.now())/1000)):null;const [left,setLeft]=useState<number|null>(read);
 useEffect(()=>{setLeft(read());if(!expiresAt)return;const t=window.setInterval(()=>setLeft(read()),1000);return()=>window.clearInterval(t)},[expiresAt]);
 return left;
}

export default function Billing(){
 const requestedArea=((sessionStorage.getItem('business:billingArea')||'marketing') as BusinessAreaId);const area=businessAreaById(requestedArea);const areaId=area.id;useAmbientEnvironment(areaId);const mode=sessionStorage.getItem('business:billingMode')==='retake'?'retake':'first';const code:BillingPlanCode=mode==='retake'?'RETAKE':'DIAGNOSTIC';const palette=areaReportPalette[area.id];
 const [plans,setPlans]=useState<BillingCatalogPlan[]>([]);const [status,setStatus]=useState<BillingStatus|null>(null);const [invoice,setInvoice]=useState<BillingInvoice|null>(null);const [loading,setLoading]=useState(true);const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [showSuccess,setShowSuccess]=useState(false);const successActionRef=useRef<HTMLButtonElement|null>(null);const successDialogRef=useRef<HTMLDivElement|null>(null);const successRestoreRef=useRef<HTMLElement|null>(null);
 const autoCreateRef=useRef('');const left=useSecondsLeft(invoice&&openStatuses.has(invoice.status)?invoice.expiresAt:null);const expired=left===0;
 const plan=useMemo(()=>plans.find(p=>p.code===code)??null,[plans,code]);const amount=plan?.amountMnt??300000;
 const refresh=async()=>{if(!session.companyId)return null;const s=await api.getBillingStatus(session.companyId);setStatus(s);return s};
 const openSuccess=()=>{const active=document.activeElement;successRestoreRef.current=active instanceof HTMLElement?active:null;setShowSuccess(true)};
 /* MMRI-27: an open invoice can become FAILED/CANCELLED while this page is open (recovery, cancel in another tab). Drop the dead code so the existing "create code" start view returns. */
 const deadInvoice=(latest:BillingInvoice)=>{if(latest.status!=='FAILED'&&latest.status!=='CANCELLED')return false;setInvoice(null);setError('Төлбөрийн код хүчингүй болсон. Шинэ төлбөрийн код үүсгэнэ үү.');return true};
 const readInvoice=async(current:BillingInvoice)=>{const latest=await api.getBillingInvoice(current.id);if(deadInvoice(latest)){await refresh();return latest}setInvoice(latest);if(latest.status==='PAID'){sessionStorage.setItem(`business:paid.${areaId}`,mode);openSuccess()}await refresh();return latest};
 /* Already bought or finished: never ask for money again, open the right place instead. */
 const alreadyOwned=(e:any)=>{const c=String(e?.code??'');if(c==='ENTITLEMENT_ALREADY_ACTIVE'||c==='ASSESSMENT_ALREADY_ACTIVE'){heroIntent.area=areaId;heroIntent.at=Date.now();go('analysis');return true}if(c==='RETAKE_REQUIRED'){sessionStorage.setItem(REPORT_AREA_KEY,areaId);go('report');return true}return false};
 const load=async()=>{if(!session.accessToken){go('login');return}if(!session.companyId){go('profile');return}setLoading(true);setError('');try{const company=await api.getCompany(session.companyId);const done=new Set(((company.profile?.assessmentProfileAnswers??[]) as {questionId:string;optionIndexes?:number[]}[]).filter(x=>/^P(?:0[1-9]|1\d|20)$/.test(x.questionId)&&(x.optionIndexes?.length??0)>0).map(x=>x.questionId));if(done.size!==20&&!isTestBusiness(company.name)){go('profile');return}const [p,s]=await Promise.all([api.getBillingPlans(),api.getBillingStatus(session.companyId)]);setPlans(p);setStatus(s);const existing=s.invoices.find(x=>x.domainCode===areaId&&x.planCode===code&&openStatuses.has(x.status));if(existing){const full=await api.getBillingInvoice(existing.id);setInvoice(full);if(full.status==='PAID')openSuccess()}else{/* No extra step: the payment panel (QR or QA mock button) is shown immediately. One invoice per page visit even under StrictMode double effects. */const key=`${areaId}.${code}`;if(autoCreateRef.current!==key){autoCreateRef.current=key;const i=await api.createBillingInvoice(session.companyId,code,areaId);setInvoice(i);localStorage.setItem(`mmri.invoiceArea.${i.id}`,areaId);
  await refresh()}}}catch(e:any){autoCreateRef.current='';if(!alreadyOwned(e))setError(e?.message||'Төлбөрийн мэдээллийг ачаалж чадсангүй.')}finally{setLoading(false)}};
 useEffect(()=>{void load()},[areaId,code]);
 const create=async()=>{if(!session.companyId||busy)return;setBusy(true);setError('');try{const i=await api.createBillingInvoice(session.companyId,code,areaId);setInvoice(i);localStorage.setItem(`mmri.invoiceArea.${i.id}`,areaId);
  await refresh()}catch(e:any){if(!alreadyOwned(e))setError(e?.message||'Төлбөрийн код үүсгэж чадсангүй.')}finally{setBusy(false)}};
 const check=async()=>{if(!invoice||busy)return;setBusy(true);setError('');try{
  // Ask the server to verify with the payment provider; the cached status alone could lag behind a real payment. Invoices the provider cannot check (mock/manual) fall back to a plain status read.
  let latest:BillingInvoice;
  try{latest=await api.reconcileBillingInvoice(invoice.id)}
  catch(e:any){if(e instanceof ApiError&&e.status===409&&['AUTOMATIC_RECONCILIATION_UNAVAILABLE','INVOICE_NOT_RECONCILABLE'].includes(e.code??''))latest=await api.getBillingInvoice(invoice.id);else if(e instanceof ApiError&&e.status===429)throw new Error('Хэт олон шалгалт хийлээ. Нэг минут хүлээгээд дахин шалгана уу.');else throw e}
  if(deadInvoice(latest)){await refresh();return}
  setInvoice(latest);if(latest.status==='PAID'){sessionStorage.setItem(`business:paid.${areaId}`,mode);openSuccess()}await refresh();
 }catch(e:any){setError(e?.message||'Төлбөрийг баталгаажуулж чадсангүй.')}finally{setBusy(false)}};
 /* QA/test only: the server accepts this route only outside production and only for MOCK invoices; the entitlement it creates then opens the diagnosis through the same effect as a real payment. */
 const demoPay=async()=>{if(!invoice||busy)return;setBusy(true);setError('');try{const i=await api.mockPayBillingInvoice(invoice.id);setInvoice(i);setDemoSent(true);await refresh()}catch(e:any){setError(e?.message||'Туршилтын төлбөр баталгаажсангүй.')}finally{setBusy(false)}};
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
  if(!invoice||!openStatuses.has(invoice.status)||expired)return;
  let active=true;
  let running=false;
  const poll=async()=>{
   if(!active||running||document.visibilityState==='hidden'||navigator.onLine===false)return;
   running=true;
   try{await readInvoice(invoice)}catch{/* manual check remains available; background polling is best-effort */}
   finally{running=false}
  };
  const resume=()=>{if(document.visibilityState==='visible'&&navigator.onLine!==false)void poll()};
  const t=window.setInterval(()=>void poll(),5000);
  document.addEventListener('visibilitychange',resume);
  window.addEventListener('online',resume);
  return()=>{active=false;window.clearInterval(t);document.removeEventListener('visibilitychange',resume);window.removeEventListener('online',resume)};
 },[invoice?.id,invoice?.status,expired]);
 /* The moment a code ends: one last server check, so a payment made in the final seconds is found before a new code is offered. */
 useEffect(()=>{if(!expired||!invoice||invoice.provider!=='QPAY')return;let live=true;api.reconcileBillingInvoice(invoice.id).then(latest=>{if(!live)return;if(latest.status==='PAID'){setInvoice(latest);void refresh()}}).catch(()=>undefined);return()=>{live=false}},[expired,invoice?.id]);
/* QR view opens immediately: create the invoice as soon as the page is ready (no button). */
 useEffect(()=>{if(loading||invoice||busy||error||!plan||!session.companyId)return;const key=`${areaId}:${code}`;if(autoCreateRef.current===key)return;autoCreateRef.current=key;void create()},[loading,plan,invoice,busy,error,areaId,code]);
 /* Access is granted by the payment provider confirmation or by an authorised administrator: poll the entitlement, then close this view and open the diagnosis. */
 useEffect(()=>{if(loading||!session.companyId||expired||invoice)return;const t=window.setInterval(()=>{if(document.visibilityState==='visible')void refresh().catch(()=>undefined)},10_000);return()=>window.clearInterval(t)},[loading,areaId,expired,invoice?.id]);
 /* DEMO provider only (testing UX, no server call): an example QR validity countdown and an example payment action that never counts as a payment. */
 const [demoSent,setDemoSent]=useState(false);
 useEffect(()=>{const ent=status?.entitlements?.find(e=>e.domainCode===areaId&&e.status==='ACTIVE'&&e.planCode===code);if(!ent)return;sessionStorage.setItem(`business:paid.${areaId}`,mode);heroIntent.area=areaId;heroIntent.at=Date.now();go('analysis')},[status,areaId,code]);
 if(loading)return <AppShell route="billing"><PageContainer className="billing-domain-page mmri-skel"><SkeletonHost label="Төлбөрийг бэлтгэж байна…"><BillingSkeletonBody/></SkeletonHost></PageContainer></AppShell>;
 if(error&&!status)return <AppShell route="billing"><PageContainer><ErrorState message={error} onRetry={load}/></PageContainer></AppShell>;
 const noCode=!invoice&&!!error&&!busy;const demo=invoice?.provider==='MOCK';const codeImage=imageSource(invoice?.qrImage);const codeText=invoice?payableQrText(invoice):null;
 return <AppShell route="billing"><PageContainer className="billing-domain-page billing-domain-page--qr">
  <button type="button" className="billing-domain-back" onClick={()=>{window.location.hash='#/analysis'}}><span className="billing-domain-back__icon"><Icon name="back" size={20}/></span><span>Оношилгоо руу буцах</span></button>
  <section className="billing-qr" data-area={areaId} style={{'--c':`var(--mmri-domain-${areaId})`} as React.CSSProperties} aria-labelledby="billing-qr-title">
   <header className="billing-qr__head"><span>{mode==='retake'?'ДАХИН ОНОШИЛГОО':'ОНОШИЛГОО'}</span><h1 id="billing-qr-title"><DomainBadge id={area.id}/> <span>{domainNameMn(area.id)}</span></h1><strong className="billing-qr__price">{money(amount)}</strong></header>
   {error&&<div className="billing-domain-error" role="alert" aria-live="assertive"><Icon name="alert" size={18}/>{error}</div>}
   {noCode?<Button variant="secondary" onClick={()=>void create()}>Дахин оролдох</Button>:<div className="billing-qr__box">
    {expired?<div className="billing-qr__wait is-expired" role="status"><span>QR кодын хугацаа дууссан</span><Button loading={busy} onClick={()=>void create()}>QR код шинэчлэх</Button></div>:!invoice?<div className="billing-qr__wait" role="status"><i aria-hidden="true"/><span>QR код бэлтгэж байна…</span></div>
     :demo?<div className="billing-qr__demo-box"><QrCode text={`BUSINESSMRI-DEMO-QR NOT-A-PAYMENT ${areaId}`} label="Туршилтын DEMO QR, төлбөр биш"/><b className="billing-qr__demo-badge">DEMO · ТӨЛБӨР БИШ</b></div>
     :codeText?<QrCode text={codeText} label={`${area.name} оношилгооны төлбөрийн QR`}/>
     :codeImage?<img src={codeImage} alt={`${area.name} оношилгооны төлбөрийн QR`} width={260} height={260}/>
     :<NoPayableCode invoice={invoice}/>}
   </div>}
   {demo&&<div className="billing-qr__test" role="group" aria-label="Тест төлбөрийн жишээ">
    <button type="button" className="billing-qr__test-btn" onClick={demoPay} disabled={busy||demoSent||expired}>{busy?'Баталгаажуулж байна…':demoSent?'Тест төлбөр баталгаажлаа':'Тест төлбөр хийх'}</button>
   </div>}
   {demo&&<p className="billing-qr__demo-note" role="note">Туршилтын QR. Уншуулах шаардлагагүй. «Тест төлбөр хийх» товч дарахад оношилгоо нээгдэнэ.</p>}
   {invoice&&left!==null&&!expired&&<p className="billing-qr__expiry">{<>QR код хүчинтэй хугацаа: <b>{String(Math.floor(left/60)).padStart(2,'0')}:{String(left%60).padStart(2,'0')}</b></>}</p>}
   {!demo&&invoice&&!expired&&<BankLinks invoice={invoice}/>}
   {invoice&&!expired&&!demo&&<p className="billing-qr__how">Банкны аппаараа QR кодыг уншуулж төлнө. Төлбөр баталгаажмагц оношилгоо нээгдэнэ.</p>}
   <p className={`billing-qr__status${invoice&&!expired?' is-waiting':''}`} role="status" aria-live="polite">{invoice&&!expired?(demo&&demoSent?'Тест төлбөр баталгаажлаа. Оношилгоо нээгдэж байна…':'Төлбөр хүлээж байна…'):''}</p>
   {invoice&&!demo&&!expired&&<Button variant="secondary" loading={busy} onClick={check}>Төлбөр шалгах</Button>}
  </section>
 </PageContainer></AppShell>;
}
