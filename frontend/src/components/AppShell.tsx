import { usePrismBody } from '../design/prismPage';
import { asGlassDomain,useGlassSelected } from '../design/glassTheme';
import { useDomainTheme } from '../design/domainTheme';
import React, { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';
import { api, session } from '../api/client';
import { isTerminal } from '../api/types';
import { businessAreaById,type BusinessAreaId } from '../data/businessEvaluation';
import { REPORT_AREA_KEY,isTestBusiness } from '../data/experience';
import { DOMAIN_IDS } from '../design/domainTheme';

export type RouteName='home'|'login'|'billing'|'analysis'|'profile'|'assessment'|'results'|'priorities'|'report'|'settings'|'states'|'forgot'|'reset'|'privacy'|'terms';

const analysisRoutes=new Set<RouteName>(['analysis','assessment','results','priorities']);
const primaryNav:[RouteName,string][]=[['home','Нүүр'],['analysis','Оношилгоо'],['report','Тайлан']];

const domainThemeRoutes=new Set<RouteName>(['billing','assessment','results','priorities','report']);
const domainThemeIds=new Set<BusinessAreaId>(['it','marketing','finance','people','operations']);
function shellDomainForRoute(route:RouteName):BusinessAreaId|null{
 if(!domainThemeRoutes.has(route))return null;
 let raw='';
 if(route==='billing')raw=sessionStorage.getItem('business:billingArea')||'';
 else if(route==='assessment')raw=sessionStorage.getItem('business:testArea')||sessionStorage.getItem(REPORT_AREA_KEY)||'';
 else raw=sessionStorage.getItem(REPORT_AREA_KEY)||'';
 return domainThemeIds.has(raw as BusinessAreaId)?raw as BusinessAreaId:null;
}

export function routeHref(route:RouteName){
 if(route==='home')return '#/';
 if(route==='login')return '#/login';
 if(route==='report')return '#/report';
 if(route==='billing')return '#/billing';
 if(route==='assessment')return '#/questions';
 if(route==='results')return '#/results';
 if(route==='forgot')return '#/forgot-password';
 if(route==='reset')return '#/reset-password';
 if(route==='privacy')return '#/privacy';
 if(route==='terms')return '#/terms';
 const view:Partial<Record<RouteName,string>>={
  analysis:'diagnosis',profile:'company',priorities:'priorities',settings:'account',states:'states'
 };
 const v=view[route]??'diagnosis';
 return v==='diagnosis'?'#/analysis':`#/analysis?view=${v}`;
}

export function go(route:RouteName){window.location.hash=routeHref(route).slice(1)}

function mainActive(route:RouteName,target:RouteName){
 if(target==='home')return route==='home';
 if(target==='analysis')return analysisRoutes.has(route);
 if(target==='report')return route==='report';
 return false;
}

function initials(name:string){
 const cleaned=(name||'Байгууллага').trim();
 const letters=cleaned.split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]?.toUpperCase()).join('');
 return letters||'Б';
}

function navIcon(route:RouteName){
 if(route==='home')return 'home';
 if(route==='analysis')return 'chart';
 return 'file';
}

type ShellNotice={id:string;kind:'payment'|'report';title:string;detail:string;time:string;areaId?:BusinessAreaId};
function sameNotices(a:ShellNotice[],b:ShellNotice[]){
 if(a.length!==b.length)return false;
 return a.every((row,index)=>{const next=b[index];return !!next&&row.id===next.id&&row.kind===next.kind&&row.title===next.title&&row.detail===next.detail&&row.time===next.time&&row.areaId===next.areaId});
}
function noticeTime(value?:string|null){const d=value?new Date(value):new Date();if(Number.isNaN(d.getTime()))return '';const p=(n:number)=>String(n).padStart(2,'0');return `${d.getFullYear()}.${p(d.getMonth()+1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`}

/* The backend exposes no notification API: notices are derived from billing + assessments. Read/dismissed state is therefore
   a per-browser preference (localStorage), keyed by company, and only hides/marks items locally. */
type NoticeState={read:string[];dismissed:string[]};
const noticeStateKey=()=>`mmri.notices.${session.companyId||'anon'}`;
function loadNoticeState():NoticeState{
 try{const v=JSON.parse(localStorage.getItem(noticeStateKey())||'null');if(v&&Array.isArray(v.read)&&Array.isArray(v.dismissed))return {read:v.read.slice(-200),dismissed:v.dismissed.slice(-200)}}catch{/* unavailable storage */}
 return {read:[],dismissed:[]};
}
function saveNoticeState(state:NoticeState){try{localStorage.setItem(noticeStateKey(),JSON.stringify(state))}catch{/* unavailable storage */}}

function MenuLink({route,icon,children,onNavigate}:{route:RouteName;icon:string;children:React.ReactNode;onNavigate:()=>void}){
 return <a role="menuitem" href={routeHref(route)} onClick={onNavigate}><Icon name={icon} size={17}/><span>{children}</span></a>;
}

export function ShellHeader({route}:{route:RouteName}){
 const [mobileOpen,setMobileOpen]=useState(false);
 const [accountOpen,setAccountOpen]=useState(false);
 const [noticeOpen,setNoticeOpen]=useState(false);
 const [notices,setNotices]=useState<ShellNotice[]>([]);
 const [noticesReady,setNoticesReady]=useState(false);
 const [noticeState,setNoticeState]=useState<NoticeState>(()=>loadNoticeState());
 const updateNoticeState=(fn:(s:NoticeState)=>NoticeState)=>setNoticeState(cur=>{const next=fn(cur);saveNoticeState(next);return next});

 const visibleNotices=notices.filter(n=>!noticeState.dismissed.includes(n.id));
 const unreadCount=visibleNotices.filter(n=>!noticeState.read.includes(n.id)).length;
 const renderNotice=(item:ShellNotice)=>{const unread=!noticeState.read.includes(item.id);return <div key={item.id} className={`mmri-notification-item${unread?' is-unread':' is-read'}`}>
        <a href={item.kind==='report'?'#/report':'#/analysis'} onClick={()=>{if(item.kind==='report'&&item.areaId)sessionStorage.setItem(REPORT_AREA_KEY,item.areaId);updateNoticeState(s=>({...s,read:Array.from(new Set([...s.read,item.id]))}));setNoticeOpen(false)}}><span className={`mmri-notification-icon is-${item.kind}`}><Icon name={item.kind==='report'?'file':'check'} size={18}/></span><div><em className="mmri-notification-kind">{item.kind==='report'?'Тайлан':'Төлбөр'}</em><strong>{item.title}{unread&&<i className="mmri-notification-dot"><span className="mmri-visually-hidden"> (уншаагүй)</span></i>}</strong><p>{item.detail}</p><small><Icon name="clock" size={13}/>{item.time}</small></div></a>
        <div className="mmri-notification-item__actions">{unread&&<button type="button" aria-label={`${item.title} - уншсан болгох`} onClick={()=>updateNoticeState(s=>({...s,read:Array.from(new Set([...s.read,item.id]))}))}>Уншсан</button>}<button type="button" aria-label={`${item.title} - арилгах`} onClick={()=>updateNoticeState(s=>({...s,dismissed:Array.from(new Set([...s.dismissed,item.id]))}))}><Icon name="close" size={16}/></button></div>
       </div>};
 const [logoutBusy,setLogoutBusy]=useState(false);
 const [companyName,setCompanyName]=useState(()=>session.companyName||'');
 const headerRef=useRef<HTMLElement|null>(null);
 const accountRef=useRef<HTMLDivElement|null>(null);
 const notificationRef=useRef<HTMLDivElement|null>(null);
 const accountButtonRef=useRef<HTMLButtonElement|null>(null);
 const notificationButtonRef=useRef<HTMLButtonElement|null>(null);
 const notificationPanelRef=useRef<HTMLDivElement|null>(null);
 const publicMenuButtonRef=useRef<HTMLButtonElement|null>(null);
 const loggedIn=!!session.accessToken;

 useEffect(()=>{
  const closeOutside=(event:MouseEvent)=>{
   const target=event.target as Node;
   if(headerRef.current&&!headerRef.current.contains(target))setMobileOpen(false);
   if(accountRef.current&&!accountRef.current.contains(target))setAccountOpen(false);
   if(notificationRef.current&&!notificationRef.current.contains(target))setNoticeOpen(false);
  };
  const closeOnFocusOutside=(event:FocusEvent)=>{
   const target=event.target as Node;
   if(accountRef.current&&!accountRef.current.contains(target))setAccountOpen(false);
   if(notificationRef.current&&!notificationRef.current.contains(target))setNoticeOpen(false);
  };
  const closeOnEscape=(event:KeyboardEvent)=>{
   if(event.key!=='Escape')return;
   if(noticeOpen){setNoticeOpen(false);notificationButtonRef.current?.focus();return}
   if(accountOpen){setAccountOpen(false);accountButtonRef.current?.focus();return}
   if(mobileOpen){setMobileOpen(false);publicMenuButtonRef.current?.focus();}
  };
  document.addEventListener('mousedown',closeOutside);
  document.addEventListener('keydown',closeOnEscape);
  document.addEventListener('focusin',closeOnFocusOutside);
  return()=>{document.removeEventListener('mousedown',closeOutside);document.removeEventListener('keydown',closeOnEscape);document.removeEventListener('focusin',closeOnFocusOutside)};
 },[accountOpen,mobileOpen,noticeOpen]);

 useEffect(()=>{
  if(!loggedIn||companyName)return;
  let live=true;
  /* MMRI-08: the shell never silently adopts the first company; with several memberships and no explicit choice it shows no company name. */
  void api.resolveActiveCompany().then(({company})=>{
   if(!live||!company)return;
   setCompanyName(company.name);
  }).catch(()=>{});
  return()=>{live=false};
 },[loggedIn,companyName]);


 useEffect(()=>{
  if(!noticeOpen)return;
  requestAnimationFrame(()=>notificationPanelRef.current?.focus());
 },[noticeOpen]);

 const displayCompany=companyName||session.companyName||'Таны байгууллага';
 useEffect(()=>{
  if(!loggedIn)return;
  let live=true;
  let timer:number|null=null;
  const publish=(rows:ShellNotice[])=>{
   if(!live)return;
   setNotices(current=>sameNotices(current,rows)?current:rows);
   setNoticeState(loadNoticeState());
   setNoticesReady(true);
  };
  const run=async()=>{
   if(!live||document.visibilityState==='hidden'||navigator.onLine===false)return;
   if(isTestBusiness(displayCompany)){
    publish([
     {id:'demo-report',kind:'report',title:'Тайлан бэлэн болсон',detail:'Үйлдвэрлэл ба үйл ажиллагааны менежментийн тайланг үзэх боломжтой.',time:'Өнөөдөр · 07:45',areaId:'operations'},
     {id:'demo-paid',kind:'payment',title:'Төлбөр баталгаажсан',detail:'Маркетингийн менежментийн оношилгооны эрх нээгдсэн.',time:'Өнөөдөр · 07:41',areaId:'marketing'},
    ]);return;
   }
   const companyId=session.companyId;if(!companyId){if(live)setNoticesReady(true);return;}
   try{
    const [billing,assessments]=await Promise.all([api.getBillingStatus(companyId),api.listAssessments(companyId)]);
    const rows:ShellNotice[]=[];
    for(const invoice of billing.invoices.filter(x=>x.status==='PAID').slice(0,2))rows.push({id:`pay-${invoice.id}`,kind:'payment',title:'Төлбөр баталгаажсан',detail:'Оношилгооны төлбөр амжилттай баталгаажсан.',time:noticeTime(invoice.paidAt||invoice.updatedAt)});
    for(const assessment of assessments.filter(x=>isTerminal(x.status)&&x.reportAvailable!==false).sort((a,b)=>new Date(b.completedAt||b.updatedAt).getTime()-new Date(a.completedAt||a.updatedAt).getTime()).slice(0,3)){
     const stored=(assessment.domainCode||localStorage.getItem(`mmri.assessmentArea.${assessment.id}`)||'marketing') as BusinessAreaId;const area=businessAreaById(stored);
     rows.push({id:`report-${assessment.id}`,kind:'report',title:'Тайлан бэлэн болсон',detail:`${area.name} чиглэлийн тайланг үзэх боломжтой.`,time:noticeTime(assessment.completedAt||assessment.updatedAt),areaId:area.id});
    }
    publish(rows.slice(0,5));
   }catch{if(live){setNoticesReady(true)}}
  };
  const schedule=()=>{if(timer!==null)window.clearInterval(timer);timer=window.setInterval(()=>void run(),30000)};
  const resume=()=>{if(document.visibilityState==='visible'&&navigator.onLine!==false)void run()};
  void run();schedule();
  document.addEventListener('visibilitychange',resume);
  window.addEventListener('online',resume);
  return()=>{live=false;if(timer!==null)window.clearInterval(timer);document.removeEventListener('visibilitychange',resume);window.removeEventListener('online',resume)};
 },[loggedIn,displayCompany]);
 const closeMenus=()=>{setMobileOpen(false);setAccountOpen(false);setNoticeOpen(false)};
 const logout=async()=>{
  if(logoutBusy)return;
  setLogoutBusy(true);
  try{await api.logout()}catch{/* api.logout clears the local session in finally */}
  finally{setLogoutBusy(false);closeMenus();go('home')}
 };

 const openAccountFromKeyboard=(event:React.KeyboardEvent<HTMLButtonElement>)=>{
  if(!['ArrowDown','Enter',' '].includes(event.key))return;
  event.preventDefault();
  setAccountOpen(true);
  requestAnimationFrame(()=>accountRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus());
 };
 const handleMenuKeys=(event:React.KeyboardEvent<HTMLDivElement>)=>{
  const items=Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])')) as HTMLElement[];
  if(!items.length)return;
  const current=items.indexOf(document.activeElement as HTMLElement);
  if(event.key==='ArrowDown'){
   event.preventDefault();items[(current+1+items.length)%items.length].focus();
  }else if(event.key==='ArrowUp'){
   event.preventDefault();items[(current-1+items.length)%items.length].focus();
  }else if(event.key==='Home'){
   event.preventDefault();items[0].focus();
  }else if(event.key==='End'){
   event.preventDefault();items[items.length-1].focus();
  }else if(event.key==='Escape'){
   event.preventDefault();setAccountOpen(false);accountButtonRef.current?.focus();
  }
 };

 return <header className={`mmri-shell-header ${loggedIn?'is-authenticated':'is-public'}`} ref={headerRef}>
  <div className="mmri-shell-inner">
   <span className="mmri-shell-glint" aria-hidden="true"><i/></span>
   <a className="mmri-brand" href="#/" onClick={closeMenus} aria-label="BUSINESSMRI.MN - Нүүр">
    <span className="mmri-brand-mark" aria-hidden="true"><Icon name="logo" size={22}/></span>
    <span className="mmri-brand-copy">
     <strong>BUSINESSMRI.MN</strong>
    </span>
   </a>

   <nav className="mmri-primary-nav" aria-label="Үндсэн цэс">
    {primaryNav.map(([target,label])=>{
     const active=mainActive(route,target);
     return <a key={target} href={routeHref(target)} aria-current={active?'page':undefined} className={active?'is-active':''} onClick={closeMenus}><Icon name={navIcon(target)} size={17}/><span>{label}</span></a>;
    })}
   </nav>

   <div className="mmri-shell-actions">
    {loggedIn?<>
     <div className="mmri-notifications" ref={notificationRef}>
      <button type="button" ref={notificationButtonRef} className="mmri-notification-trigger" aria-haspopup="dialog" aria-expanded={noticeOpen} aria-controls="mmri-notification-panel" aria-label={`Мэдэгдэл${unreadCount?` - ${unreadCount} шинэ`:''}`} onClick={()=>{setNoticeOpen(v=>!v);setAccountOpen(false)}}><Icon name="bell" size={30}/>{unreadCount>0&&<span>{unreadCount>9?'9+':unreadCount}</span>}</button>
      {noticeOpen&&<div ref={notificationPanelRef} id="mmri-notification-panel" className="mmri-notification-panel" role="dialog" aria-labelledby="mmri-notification-title" tabIndex={-1} aria-busy={!noticesReady||undefined}>
       <header><span className="mmri-notification-badge" aria-hidden="true"><Icon name="bell" size={22}/></span><div><strong id="mmri-notification-title">Мэдэгдэл</strong><small>{!noticesReady?'Шалгаж байна…':visibleNotices.length?`${unreadCount} уншаагүй · ${visibleNotices.length} нийт`:'Шинэ мэдээлэл алга'}</small></div><button type="button" className="mmri-notification-close" aria-label="Мэдэгдлийг хаах" onClick={()=>{setNoticeOpen(false);notificationButtonRef.current?.focus()}}><Icon name="close" size={18}/></button></header>
       {visibleNotices.length>0&&<div className="mmri-notification-tools"><button type="button" disabled={unreadCount===0} onClick={()=>updateNoticeState(s=>({...s,read:Array.from(new Set([...s.read,...visibleNotices.map(n=>n.id)]))}))}>Бүгдийг уншсан болгох</button><button type="button" onClick={()=>updateNoticeState(s=>({...s,dismissed:Array.from(new Set([...s.dismissed,...visibleNotices.map(n=>n.id)]))}))}>Бүгдийг арилгах</button></div>}
       <div className="mmri-notification-list">{!noticesReady?<div className="mmri-notification-loading" role="status" aria-live="polite" aria-atomic="true"><span className="mmri-visually-hidden">Мэдэгдлийг шалгаж байна.</span>{[0,1,2].map(i=><span key={i} className="mmri-notification-loading__row" aria-hidden="true"><i/><b/><em/></span>)}</div>:visibleNotices.length?(()=>{const fresh=visibleNotices.filter(n=>!noticeState.read.includes(n.id));const older=visibleNotices.filter(n=>noticeState.read.includes(n.id));return <>{fresh.length>0&&<section className="mmri-notification-group" aria-label="Шинэ"><h3>Шинэ</h3>{fresh.map(renderNotice)}</section>}{older.length>0&&<section className="mmri-notification-group" aria-label="Өмнөх"><h3>Өмнөх</h3>{older.map(renderNotice)}</section>}</>})():<div className="mmri-notification-empty"><span aria-hidden="true"><i/><Icon name="bell" size={26}/></span><strong>Шинэ мэдэгдэл алга</strong><p>Төлбөр баталгаажих, оношилгоо дуусах, тайлан бэлэн болох үед энд харагдана.</p></div>}</div></div>}
     </div>
     <div className="mmri-account" ref={accountRef}>
      <button type="button" ref={accountButtonRef} className="mmri-account-trigger" aria-label="Миний хэсэг" aria-haspopup="menu" aria-controls="mmri-account-menu" aria-expanded={accountOpen} onKeyDown={openAccountFromKeyboard} onClick={()=>setAccountOpen((value:boolean)=>!value)}>
       <span className="mmri-account-avatar" aria-hidden="true"><Icon name="user" size={28}/></span>
      </button>
      {accountOpen&&<div id="mmri-account-menu" className="mmri-account-menu" role="menu" aria-label="Бүртгэлийн цэс" onKeyDown={handleMenuKeys}>
       <div className="mmri-account-context">
        <span className="mmri-account-context-mark" aria-hidden="true">{initials(displayCompany)}</span>
        <div><small>Байгууллага</small><strong>{displayCompany}</strong></div>
       </div>
       <a role="menuitem" href="#/settings?section=payments" onClick={closeMenus}><Icon name="receipt" size={19}/><span>Төлбөрийн түүх</span></a>
       <MenuLink route="profile" icon="building" onNavigate={closeMenus}>Байгууллагын мэдээлэл</MenuLink>
       <a role="menuitem" href="#/settings?section=technical" onClick={closeMenus}><Icon name="gear" size={19}/><span>Тохиргоо</span></a>
       <div className="mmri-account-divider" aria-hidden="true"/>
       <button type="button" role="menuitem" className="mmri-account-logout" disabled={logoutBusy} onClick={()=>void logout()}><Icon name="logout" size={19}/><span>{logoutBusy?'Гарч байна…':'Системээс гарах'}</span></button>
      </div>}
     </div></>:<>
      <a className="mmri-shell-login" href="#/login" onClick={closeMenus}>Нэвтрэх</a>
      <a className="mmri-shell-primary" href="#/login" onClick={closeMenus}><span className="mmri-shell-glint mmri-btn-glint" aria-hidden="true"><i/></span>Оношилгоо эхлүүлэх</a>
      <button type="button" ref={publicMenuButtonRef} className="mmri-public-menu-trigger" onClick={()=>setMobileOpen((value:boolean)=>!value)} aria-label="Үндсэн цэс" aria-controls="mmri-public-mobile-menu" aria-expanded={mobileOpen}><Icon name={mobileOpen?'close':'menu'} size={20}/></button>
     </>}
   </div>
  </div>

  {!loggedIn&&mobileOpen&&<div id="mmri-public-mobile-menu" className="mmri-public-mobile-menu">
   <nav aria-label="Мобайл үндсэн цэс">
    {primaryNav.map(([target,label])=>{
     const active=mainActive(route,target);
     return <a key={target} href={routeHref(target)} aria-current={active?'page':undefined} className={active?'is-active':''} onClick={closeMenus}>{label}</a>;
    })}
   </nav>
   <div className="mmri-public-mobile-actions">
    <a href="#/login" onClick={closeMenus}>Нэвтрэх</a>
    <a className="is-primary" href="#/login" onClick={closeMenus}>Оношилгоо эхлүүлэх</a>
   </div>
  </div>}
 </header>;
}

export function AppShell({route,children}:{route:RouteName;children:React.ReactNode;assessmentMode?:boolean}){
 usePrismBody();
 const [online,setOnline]=useState(()=>typeof navigator==='undefined'?true:navigator.onLine!==false);
 const loggedIn=!!session.accessToken;
 const domainId=loggedIn?shellDomainForRoute(route):null;
 useGlassSelected(asGlassDomain(domainId));
 useDomainTheme(domainId);
 useEffect(()=>{
  const on=()=>setOnline(true),off=()=>setOnline(false);
  window.addEventListener('online',on);window.addEventListener('offline',off);
  return()=>{window.removeEventListener('online',on);window.removeEventListener('offline',off)};
 },[]);
 if(route==='login')return <>{children}</>;

 return <div className={`app-shell mmri-shell ${loggedIn?'is-authenticated':'is-public'} ${domainId?'has-domain-theme':''}`} data-mmri-domain={domainId||undefined} data-route={route}>
  <span className="mmri-shell-rims" aria-hidden="true">{['neutral',...DOMAIN_IDS].map(d=><i key={d} data-d={d}/>)}</span>
  <a className="mmri-skip-link" href="#main-content">Үндсэн агуулга руу шилжих</a>
  <ShellHeader route={route}/>
  {!online&&<div className="mmri-offline-banner" role="status"><Icon name="offline" size={18}/><div><b>Сүлжээний холболт тасарсан</b><span>Баталгаажаагүй өөрчлөлтийг хадгалагдсан гэж үзэхгүй.</span></div></div>}
  <main id="main-content" className="mmri-shell-main" tabIndex={-1}>{children}</main>
  <footer className="mmri-legal-footer" aria-label="Хууль зүйн холбоосууд"><span>© BusinessMRI.mn</span><nav aria-label="Хууль зүй"><a href="#/privacy">Нууцлалын бодлого</a><a href="#/terms">Үйлчилгээний нөхцөл</a></nav><small>Хуулийн хяналт хүлээгдэж буй төсөл</small></footer>
  {loggedIn&&<nav className="mmri-bottom-nav" aria-label="Мобайл үндсэн цэс">
   {primaryNav.map(([target,label])=>{
    const active=mainActive(route,target);
    return <a key={target} href={routeHref(target)} aria-current={active?'page':undefined} className={active?'is-active':''}><Icon name={navIcon(target)} size={19}/><span>{label}</span></a>;
   })}
  </nav>}
 </div>;
}

export function PageContainer({children,className='',...props}:React.HTMLAttributes<HTMLDivElement>){return <div {...props} className={`page-container ${className}`}>{children}</div>}
