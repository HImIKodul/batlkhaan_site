import React,{useId} from 'react';

export type TrendPoint={
 id:string;
 label:string;
 shortLabel:string;
 value:number|null;
};

type Props={
 items:TrendPoint[];
 selectedId?:string|null;
 onSelect?:(id:string)=>void;
 title:string;
 description:string;
 emptyTitle?:string;
 emptyDescription?:string;
};

function clampScore(value:number){return Math.min(100,Math.max(0,value))}

export function TrendChart({items,selectedId,onSelect,title,description,emptyTitle='Харьцуулах түүх хангалтгүй',emptyDescription='Хоёроос доошгүй бодит оноотой тайлан бүрдэх үед өөрчлөлтийн шугам харагдана.'}:Props){
 const normalized=items.slice(-8).map(item=>({...item,value:typeof item.value==='number'&&Number.isFinite(item.value)?clampScore(item.value):null}));
 const valid=normalized.filter(item=>item.value!=null);
 if(valid.length<2)return <div className="mmri-viz-empty" role="status"><strong>{emptyTitle}</strong><p>{emptyDescription}</p></div>;
 const uid=useId().replace(/:/g,'');
 const titleId=`mmri-trend-title-${uid}`;
 const descId=`mmri-trend-desc-${uid}`;
 const width=760,height=300,left=58,right=24,top=24,bottom=58;
 const plotW=width-left-right,plotH=height-top-bottom;
 const x=(index:number)=>left+(normalized.length===1?plotW/2:(plotW*index)/(normalized.length-1));
 const y=(value:number)=>top+plotH*(1-value/100);
 const segments:Array<Array<{x:number;y:number;id:string}>>=[];
 let current:Array<{x:number;y:number;id:string}>=[];
 normalized.forEach((item,index)=>{
  if(item.value==null){if(current.length){segments.push(current);current=[]}return}
  current.push({x:x(index),y:y(item.value),id:item.id});
 });
 if(current.length)segments.push(current);
 const levels=[0,25,50,75,100];
 const summary=normalized.map(item=>`${item.label}: ${item.value==null?'оноо байхгүй':`${Math.round(item.value)} оноо`}`).join('. ');
 const handleKey=(event:React.KeyboardEvent<SVGGElement>,id:string)=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();onSelect?.(id)}};
 return <section className="mmri-viz-trend" aria-label={title}>
  <div className="mmri-viz-trend__canvas">
   <svg viewBox={`0 0 ${width} ${height}`} role={onSelect?'group':'img'} aria-labelledby={`${titleId} ${descId}`}>
    <title id={titleId}>{title}</title><desc id={descId}>{description} {summary}</desc>
    {levels.map(level=><g key={level} aria-hidden="true"><line className="mmri-viz-trend__grid" x1={left} y1={y(level)} x2={width-right} y2={y(level)}/><text className="mmri-viz-trend__scale" x={left-10} y={y(level)+4} textAnchor="end">{level}</text></g>)}
    {segments.map((segment,index)=>segment.length>=2?<polyline key={index} className="mmri-viz-trend__line" points={segment.map(p=>`${p.x},${p.y}`).join(' ')}/>:null)}
    {normalized.map((item,index)=>item.value==null?null:<g key={item.id} role={onSelect?'button':undefined} tabIndex={onSelect?0:undefined} className={`mmri-viz-trend__point ${item.id===selectedId?'is-selected':''}`} aria-label={`${item.label}: ${Math.round(item.value)}`} aria-pressed={onSelect?item.id===selectedId:undefined} onClick={()=>onSelect?.(item.id)} onKeyDown={(event:React.KeyboardEvent<SVGGElement>)=>handleKey(event,item.id)}>
     <title>{item.label}: {Math.round(item.value)}</title>
     <circle className="mmri-viz-trend__halo" cx={x(index)} cy={y(item.value)} r={item.id===selectedId?12:0}/>
     <circle className="mmri-viz-trend__dot" cx={x(index)} cy={y(item.value)} r={item.id===selectedId?5.5:4.5}/>
     <text className="mmri-viz-trend__value" x={x(index)} y={y(item.value)-14} textAnchor="middle">{Math.round(item.value)}</text>
     <text className="mmri-viz-trend__label" x={x(index)} y={height-24} textAnchor="middle">{item.shortLabel}</text>
    </g>)}
   </svg>
  </div>
  <div className="mmri-viz-trend__summary"><span>{valid.length}/{normalized.length} тайлан бодит оноотой</span><p>Шугам зөвхөн дараалсан бодит оноонуудыг холбоно. Оноо байхгүй тайлангийн хэсэгт шугам тасарна.</p></div>
 </section>;
}
