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

export type SkeletonVariant='generic'|'dashboard'|'form'|'payment'|'questionnaire'|'report';

function SkeletonLine({className=''}:{className?:string}){return <span className={`mmri-skeleton__line ${className}`.trim()} aria-hidden="true"/>}
function SkeletonCard({className='',children}:{className?:string;children?:React.ReactNode}){return <div className={`mmri-skeleton__card ${className}`.trim()} aria-hidden="true">{children}</div>}

export function SkeletonScreen({label='Өгөгдлийг бэлтгэж байна...',description,variant='generic',className=''}:{label?:string;description?:string;variant?:SkeletonVariant;className?:string}){
 const accessible=[label,description].filter(Boolean).join('. ');
 const head=<div className="mmri-skeleton__head" aria-hidden="true"><div><SkeletonLine className="is-kicker"/><SkeletonLine className="is-title"/><SkeletonLine className="is-subtitle"/></div><span className="mmri-skeleton__head-action"/></div>;
 let body:React.ReactNode;
 if(variant==='questionnaire')body=<><div className="mmri-skeleton__question-meta" aria-hidden="true"><SkeletonLine className="is-small"/><span className="mmri-skeleton__progress"/></div><SkeletonCard className="mmri-skeleton__question"><SkeletonLine className="is-kicker"/><SkeletonLine className="is-question"/><SkeletonLine className="is-question-short"/><div className="mmri-skeleton__answers">{Array.from({length:5},(_,i)=><span key={i} className="mmri-skeleton__answer"/>)}</div><div className="mmri-skeleton__actions"><span/><span/></div></SkeletonCard></>;
 else if(variant==='report')body=<div className="mmri-skeleton__report-stack" aria-hidden="true">{Array.from({length:3},(_,i)=><SkeletonCard key={i} className="mmri-skeleton__report-page"><div className="mmri-skeleton__report-top"><div><SkeletonLine className="is-kicker"/><SkeletonLine className="is-title"/></div><span className="mmri-skeleton__score"/></div><div className="mmri-skeleton__report-grid"><span/><span/></div><SkeletonLine className="is-wide"/><SkeletonLine className="is-medium"/><div className="mmri-skeleton__report-bars"><span/><span/><span/><span/><span/></div></SkeletonCard>)}</div>;
 else if(variant==='payment')body=<><div className="mmri-skeleton__payment-grid" aria-hidden="true"><SkeletonCard className="mmri-skeleton__payment-main"><SkeletonLine className="is-title"/><SkeletonLine className="is-medium"/><SkeletonLine className="is-short"/><span className="mmri-skeleton__button"/></SkeletonCard><SkeletonCard className="mmri-skeleton__qr-card"><span className="mmri-skeleton__qr"/><SkeletonLine className="is-small"/></SkeletonCard></div></>;
 else if(variant==='form')body=<><SkeletonCard className="mmri-skeleton__form-card" aria-hidden="true"><SkeletonLine className="is-title"/>{Array.from({length:6},(_,i)=><div className="mmri-skeleton__field" key={i}><SkeletonLine className="is-small"/><span/></div>)}<div className="mmri-skeleton__actions"><span/><span/></div></SkeletonCard></>;
 else if(variant==='dashboard')body=<><div className="mmri-skeleton__tile-grid" aria-hidden="true">{Array.from({length:5},(_,i)=><SkeletonCard key={i} className="mmri-skeleton__tile"><span className="mmri-skeleton__icon"/><SkeletonLine className="is-medium"/><SkeletonLine className="is-small"/></SkeletonCard>)}</div><div className="mmri-skeleton__content-grid" aria-hidden="true"><SkeletonCard><SkeletonLine className="is-title"/><SkeletonLine className="is-wide"/><SkeletonLine className="is-medium"/></SkeletonCard><SkeletonCard><SkeletonLine className="is-title"/><SkeletonLine className="is-wide"/><SkeletonLine className="is-short"/></SkeletonCard></div></>;
 else body=<><div className="mmri-skeleton__tile-grid mmri-skeleton__tile-grid--three" aria-hidden="true">{Array.from({length:3},(_,i)=><SkeletonCard key={i} className="mmri-skeleton__tile"><span className="mmri-skeleton__icon"/><SkeletonLine className="is-medium"/><SkeletonLine className="is-small"/></SkeletonCard>)}</div><SkeletonCard className="mmri-skeleton__wide-card" aria-hidden="true"><SkeletonLine className="is-title"/><SkeletonLine className="is-wide"/><SkeletonLine className="is-medium"/><SkeletonLine className="is-short"/></SkeletonCard></>;
 return <section className={`mmri-skeleton mmri-skeleton--${variant} ${className}`.trim()} data-skeleton-variant={variant} role="status" aria-live="polite" aria-atomic="true" aria-busy="true"><span className="mmri-skeleton__sr">{accessible}</span>{variant!=='questionnaire'&&variant!=='report'?head:null}{body}<LoadingFact/></section>;
}

export function LoadingState({label='Өгөгдлийг боловсруулж байна...',description='Шаардлагатай мэдээллийг бэлтгэж байна.',className='',variant='generic'}:{label?:string;description?:string;className?:string;variant?:SkeletonVariant}){
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
export function OfflineState({onRetry,title='Сүлжээний холболт тасарсан',description='Систем баталгаажуулаагүй өөрчлөлтийг хадгалагдсан гэж үзэхгүй. Холболтоо сэргээсний дараа дахин оролдоно уу.',className=''}:{onRetry?:()=>void;title?:string;description?:string;className?:string}){
 return <StateShell kind="offline" title={title} description={description} className={className} icon={<Icon name="offline" size={22}/>} action={onRetry?<Button variant="secondary" onClick={onRetry}>Холболтыг дахин шалгах</Button>:undefined}/>;
}
