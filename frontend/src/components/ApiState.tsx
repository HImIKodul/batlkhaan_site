import React from 'react';
import { Button } from './UI';
import { Icon } from './Icon';
import { LoadingFact } from './LoadingFact';

type BaseStateProps={title?:string;description?:string;className?:string};

type StateKind='loading'|'empty'|'error'|'coming'|'offline';

function StateShell({kind,title,description,icon,action,busy=false,className=''}:{kind:StateKind;title:string;description?:string;icon:React.ReactNode;action?:React.ReactNode;busy?:boolean;className?:string}){
 const role=kind==='error'?'alert':'status';
 return <section className={`mmri-api-state mmri-api-state--${kind} ${className}`.trim()} data-mmri-state={kind} role={role} aria-live={kind==='error'?'assertive':'polite'} aria-atomic="true" aria-busy={busy||undefined}>
  <span className="mmri-api-state__visual" aria-hidden="true">{icon}</span>
  <div className="mmri-api-state__copy"><h3>{title}</h3>{description&&<p>{description}</p>}</div>
  {action&&<div className="mmri-api-state__action">{action}</div>}
 </section>;
}

export type SkeletonVariant='generic'|'dashboard'|'form'|'payment'|'questionnaire'|'report'|'hub'|'history'|'billing'|'profile'|'home';

function SkeletonLine({className=''}:{className?:string}){return <span className={`mmri-skeleton__line ${className}`.trim()} aria-hidden="true"/>}
function SkeletonCard({className='',children}:{className?:string;children?:React.ReactNode}){return <div className={`mmri-skeleton__card ${className}`.trim()} aria-hidden="true">{children}</div>}

/* Report loading state: the same elements and class names as the populated report (PageOne/PageTwo/PageThree in pages/Report.tsx), so the existing report
   grid/typography lays it out; every piece of content is a shimmering placeholder (static headings keep their real width but are transparent). */
const SK='mmri-sk';
const sk=(n:number):React.CSSProperties=>({['--n' as string]:n} as React.CSSProperties);
function SkHeader({no,kicker,title,intro}:{no:string;kicker:string;title:string;intro?:string}){return <header><span className={SK}>{no}</span><div><b className={SK}>{kicker}</b><h2 className={SK}>{title}</h2>{intro&&<p className={`report-page-intro ${SK}`}>{intro}</p>}</div></header>}
function SkFindings({title,tone}:{title:string;tone:'positive'|'negative'}){return <section className={`report-finding-column is-${tone}`}><header><span className={SK} style={{width:22,height:22}}/><h3 className={SK}>{title}</h3></header><ol>{[0,1,2,3,4].map(i=><li key={i} className="report-finding-arc"><span className={`report-finding-arc__no ${SK}`}/><div><strong className={SK} style={{width:'62%',...sk(i===2?1:2)}}>{'\u00a0'}</strong><p className={SK} style={sk(3)}>{'\u00a0'}</p></div><b className={SK}>{'\u00a0\u00a0\u00a0'}</b></li>)}</ol></section>}
function SkAction({lines}:{lines:number}){return <div className="report-plan-action-copy"><div className="report-plan-action-copy__head"><span className={SK}>{'\u00a0'}</span><h4 className={SK} style={{width:'55%'}}>{'\u00a0'}</h4></div><p className={SK} style={sk(lines)}>{'\u00a0'}</p><p className={SK} style={{width:'60%'}}>{'\u00a0'}</p><p className={`report-plan-action-copy__check ${SK}`} style={{width:'70%'}}>{'\u00a0'}</p></div>}
export function ReportSkeletonBody(){
 return <main className="report-three-pages report-screen-only report-skeleton" aria-hidden="true">
  <section className="report-three-page page-one report-screen-page">
   <SkHeader no="01" kicker="ОДООГИЙН БАЙДАЛ" title="Үнэлгээний дүн"/>
   <div className="report-score-stage"><div className="report-score"/></div>
   <div className="report-balance-v3"><SkFindings title="5 давуу тал" tone="positive"/><SkFindings title="5 сул тал" tone="negative"/></div>
   <div className="report-summary report-summary--single"><h3 className={SK}>Ерөнхий дүгнэлт</h3><p className={`${SK} report-skeleton__summary`}>{'\u00a0'}</p></div>
  </section>
  <section className="report-three-page page-two report-screen-page">
   <SkHeader no="02" kicker="ТЭРГҮҮЛЭХ 5 АЖИЛ" title="Эхэлж хэрэгжүүлэх 5 ажил" intro="Эдгээр ажлыг 12 сарын төлөвлөгөөнөөс түрүүлж эхлүүлэхээр эрэмбэлсэн."/>
   <div className="report-purpose-priorities report-purpose-priorities--actionable">{[0,1,2,3,4].map(i=><article key={i}><div className={`report-purpose-number ${SK}`}/><div className="report-purpose-copy"><h3 className={SK} style={{width:'48%'}}>{'\u00a0'}</h3><p className={SK} style={sk(3)}>{'\u00a0'}</p></div><div className="report-purpose-projection"><span className="report-purpose-score is-current"><b className={SK}>00</b><small className={SK}>Одоо</small></span><span className="report-purpose-score is-target"><b className={SK}>00</b><small className={SK}>Зорилт</small></span></div></article>)}</div>
  </section>
  <section className="report-three-page page-three report-screen-page">
   <SkHeader no="03" kicker="12 САРЫН ТӨЛӨВЛӨГӨӨ" title="12 сарын хэрэгжилтийн төлөвлөгөө"/>
   <div className="report-roadmap-human">{[0,1,2].map(i=><article key={i} className="report-roadmap-card report-roadmap-card--natural"><div className="report-roadmap-card__time"><span className={`report-status-badge is-open ${SK}`}><span className="report-status-badge__mark"/>Дуусаагүй</span><span className={SK}>2026.00.00 - 2026.00.00</span><h3 className={SK}>{'\u00a0'}</h3><p className={SK} style={sk(i===0?5:4)}>{'\u00a0'}</p></div><div className="report-roadmap-card__work"><SkAction lines={i===0?2:3}/><SkAction lines={i===0?2:3}/></div></article>)}</div>
  </section>
 </main>;
}

/* Section skeletons: each reuses the destination's real class names so its own layout rules apply; content is a shimmering placeholder (transparent text keeps real widths). */
const blk=(w?:number|string,h?:number|string,n?:number):React.CSSProperties=>({width:w,height:h,...(n?({['--n' as string]:n} as React.CSSProperties):{})});
/* Renders skeleton bodies as DIRECT children of the destination container (so child-combinator layout rules still match); announced once, with the delayed fun fact. */
export function SkeletonHost({label,children}:{label:string;children:React.ReactNode}){return <><span className="mmri-skeleton__sr" role="status" aria-live="polite" aria-busy="true">{label}</span>{children}<LoadingFact/></>}
export function HubSkeletonBody(){
 return <><header className="diagnosis-square-head" aria-hidden="true"><h1 className="diagnosis-square-head__title mmri-sk">Оношилгоо</h1></header>
  <section className="diagnosis-square-grid" aria-hidden="true">{[0,1,2,3,4].map(i=><button key={i} type="button" disabled tabIndex={-1} className="diagnosis-square cat-tile"><span className="cat-tile__foot"><i className="cat-tile__orb mmri-skeleton__orb"/><span className="cat-tile__name"><span className="mmri-sk" style={blk('100%')}>{'\u00a0'}</span></span><i className="cat-tile__orb cat-tile__orb--spacer"/></span></button>)}</section></>;
}
export function QuestionnaireSkeletonBody(){
 return <><header className="mmri-questionnaire__top" aria-hidden="true"><div className="mmri-questionnaire__top-row"><strong className="mmri-questionnaire__count mmri-sk">Асуулт 00 / 000</strong><div className="mmri-questionnaire__session-actions"><span className="mmri-sk" style={blk(112,40)}>{'\u00a0'}</span></div></div><span className="mmri-sk mmri-skel__progress">{'\u00a0'}</span></header>
  <div className="mmri-questionnaire__form" aria-hidden="true"><div className="mmri-questionnaire__question-head"><h1 className="mmri-sk" style={{...blk('72%'),...({['--n' as string]:2} as React.CSSProperties)}}>{'\u00a0'}</h1></div>
  <div className="mmri-questionnaire__answers"><span className="mmri-sk mmri-skel__answers">{'\u00a0'}</span></div>
  <footer className="mmri-questionnaire__actions" style={{justifyContent:'space-between'}}><span className="mmri-sk" style={blk(110,44)}>{'\u00a0'}</span><span className="mmri-sk" style={blk(190,48)}>{'\u00a0'}</span></footer></div></>;
}
export function HistorySkeletonBody(){
 return <><header><span className="mmri-sk" style={blk(64,64)}>{'\u00a0'}</span><div><b className="mmri-sk">МИНИЙ ХЭСЭГ</b><h1 className="mmri-sk">Төлбөрийн түүх</h1><p className="mmri-sk">Өмнөх төлбөрүүд болон тэдгээрийн төлөв</p></div></header>
  <section aria-hidden="true">{[0,1,2,3,4,5].map(i=><article key={i} className="lg"><div className="payment-history-area"><span className="payment-history-icon mmri-sk">{'\u00a0'}</span><strong className="mmri-sk" style={blk('60%')}>{'\u00a0'}</strong><span className="mmri-sk" style={blk('40%')}>{'\u00a0'}</span></div><div className="payment-history-date"><small className="mmri-sk">Огноо</small><b className="mmri-sk" style={blk('80%')}>{'\u00a0'}</b></div><div className="payment-history-amount"><small className="mmri-sk">Дүн</small><b className="mmri-sk" style={blk('80%')}>{'\u00a0'}</b></div><span className="mmri-badge mmri-sk" style={blk(91,35)}>{'\u00a0'}</span></article>)}</section></>;
}
/* Same elements as the loaded payment page (back control, one centred card: kicker, title, price, code box, two lines). */
export function BillingSkeletonBody(){
 return <><span className="billing-domain-back mmri-sk" style={blk(240,44)}>{'\u00a0'}</span>
  <section className="billing-qr" aria-hidden="true"><header className="billing-qr__head"><span className="mmri-sk">ОНОШИЛГОО</span><h1 className="mmri-sk">ЧИГЛЭЛИЙН НЭР</h1><strong className="billing-qr__price mmri-sk">300,000 ₮</strong></header>
   <div className="billing-qr__box mmri-sk">{'\u00a0'}</div><p className="billing-qr__how mmri-sk" style={blk('80%',undefined,2)}>{'\u00a0'}</p><p className="billing-qr__status mmri-sk" style={blk('60%')}>{'\u00a0'}</p></section></>;
}
export function ProfileSkeletonBody(){
 return <><header><span className="profile-avatar mmri-sk">{'\u00a0'}</span><div><b className="mmri-sk">МИНИЙ ХЭСЭГ</b><h1 className="mmri-sk">Байгууллагын мэдээлэл</h1><p className="mmri-sk">Анхны мэдээллээ шалгаж, шаардлагатай бол засна уу.</p><span className="mmri-badge mmri-sk" style={blk(111,35)}>{'\u00a0'}</span></div></header>
  <section className="company-detail-editor__name lg" aria-hidden="true"><div className="business-name-fields"><label className="mmri-field"><span className="mmri-field__label mmri-sk">Байгууллагын нэр</span><span className="mmri-sk" style={blk('100%',48)}>{'\u00a0'}</span></label><div className="business-name-fields__form"><label className="mmri-field"><span className="mmri-field__label mmri-sk">Хэлбэр</span><span className="mmri-sk" style={blk('100%',48)}>{'\u00a0'}</span></label><p className="business-name-fields__preview mmri-sk" style={blk('80%')}>{'\u00a0'}</p></div></div><small className="mmri-sk" style={blk('50%')}>{'\u00a0'}</small></section>
  <section className="company-detail-editor__grid lg" aria-hidden="true">{Array.from({length:20},(_,i)=><label key={i}><span className="mmri-sk" style={blk('86%',41)}>{'\u00a0'}</span><span className="mmri-sk" style={blk('100%',48)}>{'\u00a0'}</span></label>)}</section></>;
}

/* Home skeleton: the real home layout classes (copy column, five stacked plates, three guide pills). */
export function HomeSkeletonBody(){
 return <div className="mmri-home2 mmri-skel mmri-home-skel" aria-hidden="true"><main className="mmri-home2__stage"><section className="mmri-home2__hero"><div className="mmri-home2__copy"><h1 className="mmri-home-skel__title"><span className="mmri-sk">{'\u00a0'}</span><span className="mmri-sk">{'\u00a0'}</span><span className="mmri-sk">{'\u00a0'}</span></h1><span className="mmri-sk mmri-home-skel__cta">{'\u00a0'}</span></div>
  <div className="mmri-home2__art"><div className="hx"><div className="hx__scene"><div className="hx__stack">{[0,1,2,3,4].map(i=><div key={i} className="hx3" style={{['--i' as string]:i} as React.CSSProperties}><span className="mmri-sk mmri-home-skel__card"/></div>)}</div></div></div></div></section>
  <nav className="mmri-home2__guides">{[0,1,2].map(i=><span key={i} className="mmri-sk mmri-home-skel__pill">{'\u00a0'}</span>)}</nav></main></div>;
}
export function SkeletonScreen({label='Өгөгдлийг бэлтгэж байна...',description,variant='generic',className=''}:{label?:string;description?:string;variant?:SkeletonVariant;className?:string}){
 const accessible=[label,description].filter(Boolean).join('. ');
 const head=<div className="mmri-skeleton__head" aria-hidden="true"><div><SkeletonLine className="is-kicker"/><SkeletonLine className="is-title"/><SkeletonLine className="is-subtitle"/></div><span className="mmri-skeleton__head-action"/></div>;
 let body:React.ReactNode;
 if(variant==='home')body=<HomeSkeletonBody/>;
 else if(variant==='hub')body=<HubSkeletonBody/>;
 else if(variant==='history')body=<HistorySkeletonBody/>;
 else if(variant==='billing')body=<BillingSkeletonBody/>;
 else if(variant==='profile')body=<ProfileSkeletonBody/>;
 else if(variant==='questionnaire')body=<QuestionnaireSkeletonBody/>;
 else if(variant==='report')body=<ReportSkeletonBody/>;
 else if(variant==='payment')body=<><div className="mmri-skeleton__payment-grid" aria-hidden="true"><SkeletonCard className="mmri-skeleton__payment-main"><SkeletonLine className="is-title"/><SkeletonLine className="is-medium"/><SkeletonLine className="is-short"/><span className="mmri-skeleton__button"/></SkeletonCard><SkeletonCard className="mmri-skeleton__qr-card"><span className="mmri-skeleton__qr"/><SkeletonLine className="is-small"/></SkeletonCard></div></>;
 else if(variant==='form')body=<><SkeletonCard className="mmri-skeleton__form-card" aria-hidden="true"><SkeletonLine className="is-title"/>{Array.from({length:6},(_,i)=><div className="mmri-skeleton__field" key={i}><SkeletonLine className="is-small"/><span/></div>)}<div className="mmri-skeleton__actions"><span/><span/></div></SkeletonCard></>;
 else if(variant==='dashboard')body=<><div className="mmri-skeleton__tile-grid" aria-hidden="true">{Array.from({length:5},(_,i)=><SkeletonCard key={i} className="mmri-skeleton__tile"><span className="mmri-skeleton__icon"/><SkeletonLine className="is-medium"/><SkeletonLine className="is-small"/></SkeletonCard>)}</div><div className="mmri-skeleton__content-grid" aria-hidden="true"><SkeletonCard><SkeletonLine className="is-title"/><SkeletonLine className="is-wide"/><SkeletonLine className="is-medium"/></SkeletonCard><SkeletonCard><SkeletonLine className="is-title"/><SkeletonLine className="is-wide"/><SkeletonLine className="is-short"/></SkeletonCard></div></>;
 else body=<><div className="mmri-skeleton__tile-grid mmri-skeleton__tile-grid--three" aria-hidden="true">{Array.from({length:3},(_,i)=><SkeletonCard key={i} className="mmri-skeleton__tile"><span className="mmri-skeleton__icon"/><SkeletonLine className="is-medium"/><SkeletonLine className="is-small"/></SkeletonCard>)}</div><SkeletonCard className="mmri-skeleton__wide-card" aria-hidden="true"><SkeletonLine className="is-title"/><SkeletonLine className="is-wide"/><SkeletonLine className="is-medium"/><SkeletonLine className="is-short"/></SkeletonCard></>;
 return <section className={`mmri-skeleton mmri-skeleton--${variant} mmri-skel ${variant==='questionnaire'?'mmri-questionnaire ':''}${className}`.trim()} data-skeleton-variant={variant} role="status" aria-live="polite" aria-atomic="true" aria-busy="true"><span className="mmri-skeleton__sr">{accessible}</span>{['questionnaire','report','hub','history','billing','profile','home'].includes(variant)?null:head}{body}<LoadingFact/></section>;
}

export function LoadingState({label='Түр хүлээнэ үү...',description='Шаардлагатай мэдээллийг бэлтгэж байна.',className='',variant='generic'}:{label?:string;description?:string;className?:string;variant?:SkeletonVariant}){
 return <SkeletonScreen label={label} description={description} variant={variant} className={className}/>;
}
export function ErrorState({message,onRetry,title='Алдаа гарлаа',className=''}:{message:string;onRetry?:()=>void;title?:string;className?:string}){
 return <StateShell kind="error" title={title} description={message} className={className} icon={<Icon name="alert" size={22}/>} action={onRetry?<Button variant="secondary" onClick={onRetry}>Дахин оролдох</Button>:undefined}/>;
}
export function EmptyState({title='Одоогоор оношилгоо байхгүй байна',description='Оношилгоо эхлүүлж, бизнесийн өнөөгийн байдлаа тодорхойлоорой.',action,className=''}:{title?:string;description?:string;action?:React.ReactNode;className?:string}){
 return <StateShell kind="empty" title={title} description={description} className={className} icon={<Icon name="file" size={22}/>} action={action}/>;
}
export function ComingSoonState({title='Тун удахгүй',description='Энэ боломж одоогоор нээгдээгүй байна.',className=''}:BaseStateProps){
 return <StateShell kind="coming" title={title} description={description} className={className} icon={<Icon name="lock" size={22}/>}/>;
}
export function OfflineState({onRetry,title='Сүлжээний холболт тасарсан',description='Өөрчлөлт хадгалагдсан эсэх нь баталгаажаагүй байна. Холболтоо шалгаад дахин оролдоно уу.',className=''}:{onRetry?:()=>void;title?:string;description?:string;className?:string}){
 return <StateShell kind="offline" title={title} description={description} className={className} icon={<Icon name="offline" size={22}/>} action={onRetry?<Button variant="secondary" onClick={onRetry}>Холболтыг дахин шалгах</Button>:undefined}/>;
}
