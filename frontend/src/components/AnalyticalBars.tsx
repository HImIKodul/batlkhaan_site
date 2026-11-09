import React from 'react';

export type AnalyticalBarItem={
 id:string;
 label:string;
 context?:string;
 value:number|null;
};

type Props={
 items:AnalyticalBarItem[];
 referenceValue?:number|null;
 title:string;
 description:string;
 maxItems?:number;
 emptyTitle?:string;
 emptyDescription?:string;
};

function clampScore(value:number){return Math.min(100,Math.max(0,value))}

export function AnalyticalBars({items,referenceValue,title,description,maxItems=12,emptyTitle='Харьцуулах бодит оноо алга',emptyDescription='Ангиллын бодит оноо бүрдэх үед харьцуулалт энд харагдана.'}:Props){
 const normalized=items.slice(0,maxItems).map(item=>({...item,value:typeof item.value==='number'&&Number.isFinite(item.value)?clampScore(item.value):null}));
 const valid=normalized.filter(item=>item.value!=null);
 const reference=typeof referenceValue==='number'&&Number.isFinite(referenceValue)?clampScore(referenceValue):null;
 if(!valid.length)return <div className="mmri-viz-empty" role="status"><strong>{emptyTitle}</strong><p>{emptyDescription}</p></div>;
 return <section className="mmri-viz-bars" aria-label={title}>
  <header className="mmri-viz-bars__head"><div><span>0–100 ҮНЭЛГЭЭ</span><strong>{title}</strong></div><p>{description}</p></header>
  <div className="mmri-viz-bars__scale" aria-hidden="true"><span>0</span><span>25</span><span>50</span><span>75</span><span>100</span></div>
  <div className="mmri-viz-bars__list" role="list">
   {normalized.map((item,index)=>{
    const value=item.value;
    return <div className={`mmri-viz-bars__row ${value==null?'is-missing':''}`} key={item.id} role="listitem" title={`${item.label}: ${value==null?'үнэлгээ байхгүй':`${Math.round(value)}`}`}>
     <div className="mmri-viz-bars__label"><span>{String(index+1).padStart(2,'0')}</span><div><strong>{item.label}</strong>{item.context&&<small>{item.context}</small>}</div></div>
     <div className="mmri-viz-bars__plot" aria-hidden="true"><div className="mmri-viz-bars__track"><span className="mmri-viz-bars__fill" style={{width:`${value??0}%`}}/>{reference!=null&&<i className="mmri-viz-bars__reference" style={{left:`${reference}%`}}/>}</div></div>
     <div className="mmri-viz-bars__value"><strong>{value==null?'-':Math.round(value)}</strong></div>
    </div>;
   })}
  </div>
  {reference!=null&&<div className="mmri-viz-bars__reference-note"><span aria-hidden="true"/><p>Нарийн босоо тэмдэг нь сонгосон тайлангийн ерөнхий Маркетингийн оноо <strong>{Math.round(reference)}</strong>-г заана.</p></div>}
 </section>;
}
