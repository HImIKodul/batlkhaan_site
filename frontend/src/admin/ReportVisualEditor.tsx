import React,{useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {adminApi,adminSession,fmt,type AdminApiError} from './adminApi';

/* Visual editor for the three-page customer PDF. Annotations are an overlay in PAGE units (0..1 of the A4 width/height, origin top-left),
   never screen pixels, so the same annotation lands on the same spot in any window size, in the server preview and in the final PDF.
   Page images come from the server (the real renderer); this component only draws and edits the overlay. Saving creates one append-only revision. */

export type AnnType='text'|'highlight'|'rect'|'arrow'|'pen';
export type AnnColor='red'|'orange'|'green'|'blue'|'ink'|'yellow';
export interface Ann{id:string;page:1|2|3;type:AnnType;color:AnnColor;x:number;y:number;w:number;h:number;points?:[number,number][];text?:string;fontSize?:number;strokeWidth?:number}
type Tool='select'|AnnType;

const PW=595.2756,PH=841.8898; // A4 in points = the SVG user space (1 unit = 1 pt, identical to the PDF)
export const COLORS:Record<AnnColor,string>={red:'#D64545',orange:'#E8913A',green:'#2E9E6B',blue:'#2F6FDE',ink:'#1F2937',yellow:'#F5C518'};
const COLOR_MN:Record<AnnColor,string>={red:'Улаан',orange:'Улбар шар',green:'Ногоон',blue:'Цэнхэр',ink:'Хар',yellow:'Шар'};
const TOOLS:[Tool,string][]=[['select','Сонгох'],['text','Текст'],['pen','Харандаа'],['highlight','Тодруулах'],['rect','Тэгш өнцөгт'],['arrow','Сум']];
const MIN=0.004,MAX_ANN=120,MAX_POINTS=400;
const clamp01=(n:number)=>Math.min(1,Math.max(0,n));
const r5=(n:number)=>Math.round(n*1e5)/1e5;
const newId=()=>'a'+Array.from(crypto.getRandomValues(new Uint8Array(10)),b=>b.toString(36).padStart(2,'0')).join('').slice(0,18);
const bboxOf=(pts:[number,number][])=>{const xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]);const x=Math.min(...xs),y=Math.min(...ys);return {x:r5(x),y:r5(y),w:r5(Math.max(...xs)-x),h:r5(Math.max(...ys)-y)}};

async function fetchPng(path:string):Promise<string>{
 const base=(import.meta.env.VITE_API_BASE_URL??'/api/v1').replace(/\/$/,'')+'/admin';
 const r=await fetch(base+path,{headers:adminSession.token?{Authorization:`Bearer ${adminSession.token}`}:{},credentials:'omit'});
 if(!r.ok)throw new Error('Хуудасны зургийг ачаалж чадсангүй.');
 return URL.createObjectURL(await r.blob());
}

/** Translate a whole annotation by (dx,dy) page units, keeping it inside the page. */
function moved(a:Ann,dx:number,dy:number):Ann{
 const bx=Math.min(Math.max(dx,-a.x),1-(a.x+a.w)),by=Math.min(Math.max(dy,-a.y),1-(a.y+a.h));
 if(a.points)return {...a,...bboxOf(a.points.map(([x,y])=>[x+bx,y+by] as [number,number]))  ,points:a.points.map(([x,y])=>[r5(x+bx),r5(y+by)] as [number,number])};
 return {...a,x:r5(a.x+bx),y:r5(a.y+by)};
}

function Shape({a,selected,onDown}:{a:Ann;selected:boolean;onDown?:(e:React.PointerEvent)=>void}){
 const col=COLORS[a.color],sw=a.strokeWidth??1.5,px=(v:number)=>v*PW,py=(v:number)=>v*PH;
 const common={onPointerDown:onDown,style:{cursor:onDown?'move':'default'} as React.CSSProperties,'data-ann':a.id};
 let body:React.ReactNode=null;
 if(a.type==='highlight')body=<rect x={px(a.x)} y={py(a.y)} width={px(a.w)} height={py(a.h)} fill={col} fillOpacity={0.35}/>;
 else if(a.type==='rect')body=<rect x={px(a.x)} y={py(a.y)} width={px(a.w)} height={py(a.h)} rx={1.2} fill="none" stroke={col} strokeWidth={sw}/>;
 else if(a.type==='pen'&&a.points)body=<polyline points={a.points.map(([x,y])=>`${px(x)},${py(y)}`).join(' ')} fill="none" stroke={col} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"/>;
 else if(a.type==='arrow'&&a.points){
  const [ax,ay]=[px(a.points[0][0]),py(a.points[0][1])],[bx,by]=[px(a.points[1][0]),py(a.points[1][1])];
  const dx=bx-ax,dy=by-ay,len=Math.hypot(dx,dy)||1,ux=dx/len,uy=dy/len,head=Math.min(Math.max(sw*4,6),len*0.6);
  body=<g><line x1={ax} y1={ay} x2={bx-ux*head*0.7} y2={by-uy*head*0.7} stroke={col} strokeWidth={sw} strokeLinecap="round"/><polygon fill={col} points={`${bx},${by} ${bx-ux*head+uy*head*0.45},${by-uy*head-ux*head*0.45} ${bx-ux*head-uy*head*0.45},${by-uy*head+ux*head*0.45}`}/></g>;
 }else if(a.type==='text'){
  const fs=a.fontSize??9;
  body=<g><rect x={px(a.x)} y={py(a.y)} width={px(a.w)} height={py(a.h)} rx={1.6} fill="#FFFDF4" fillOpacity={0.94} stroke={col} strokeWidth={0.8}/>
   <foreignObject x={px(a.x)+3} y={py(a.y)+3} width={Math.max(px(a.w)-6,1)} height={Math.max(py(a.h)-6,1)}><div style={{fontSize:fs,lineHeight:1.25,color:'#1F2937',overflow:'hidden',height:'100%',whiteSpace:'pre-wrap',wordBreak:'break-word',fontFamily:'"Noto Sans",system-ui,sans-serif'}}>{a.text}</div></foreignObject></g>;
 }
 return <g {...common}>{body}{selected&&<rect x={px(a.x)-2} y={py(a.y)-2} width={px(a.w)+4} height={py(a.h)+4} fill="none" stroke="#1F5BE0" strokeWidth={0.9} strokeDasharray="4 3" pointerEvents="none"/>}</g>;
}

type Drag=
 |{kind:'draw';tool:AnnType;x0:number;y0:number;pts:[number,number][];cur:{x:number;y:number}}
 |{kind:'move';id:string;x0:number;y0:number;orig:Ann}
 |{kind:'resize';id:string;corner:'nw'|'ne'|'sw'|'se';orig:Ann}
 |{kind:'end';id:string;idx:0|1;orig:Ann};

export default function ReportVisualEditor({reviewId,revision,canEdit,onSaved}:{reviewId:string;revision:number;canEdit:boolean;onSaved:(message?:{t:'ok'|'err';m:string})=>void}){
 const [loaded,setLoaded]=useState<null|{revision:number;items:Ann[];history:{revision:number;source:string;reason:string|null;createdAt:string;annotationCount:number}[]}>(null);
 const [err,setErr]=useState('');const [msg,setMsg]=useState<{t:'ok'|'err';m:string}|null>(null);
 const [items,setItemsState]=useState<Ann[]>([]);const [saved,setSaved]=useState('[]');
 /* Gesture handlers must see the latest state even when pointer events arrive faster than React re-renders, so the working copy and the drag live in refs too. */
 const itemsRef=useRef<Ann[]>([]);const dragRef=useRef<Drag|null>(null);
 const textStep=useRef<string|null>(null);
 const setItems=(next:Ann[])=>{itemsRef.current=next;setItemsState(next)};
 const [past,setPast]=useState<Ann[][]>([]);const [future,setFuture]=useState<Ann[][]>([]);
 const [page,setPage]=useState<1|2|3>(1);const [tool,setTool]=useState<Tool>('select');const [color,setColor]=useState<AnnColor>('red');
 const [stroke,setStroke]=useState(1.5);const [fontSize,setFontSize]=useState(9);const [sel,setSel]=useState<string|null>(null);
 const [reason,setReason]=useState('');const [busy,setBusy]=useState(false);
 const [bg,setBg]=useState<Record<number,string>>({});const [preview,setPreview]=useState<string[]|null>(null);const [previewBusy,setPreviewBusy]=useState(false);
 const [drag,setDragState]=useState<Drag|null>(null);
 const setDrag=(d:Drag|null)=>{dragRef.current=d;setDragState(d)};
 const svgRef=useRef<SVGSVGElement|null>(null);const urls=useRef<string[]>([]);

 // ---- load the saved state of the latest revision whenever the review moves to a new revision
 useEffect(()=>{let live=true;setErr('');
  adminApi.get(`/reviews/${reviewId}/editor`).then(d=>{if(!live)return;const its=(d.annotations?.items??[]) as Ann[];setLoaded({revision:d.revision,items:its,history:d.history});setItems(its);setSaved(JSON.stringify(its));setPast([]);setFuture([]);setSel(null);setPreview(null)}).catch(e=>live&&setErr((e as Error).message));
  return()=>{live=false}},[reviewId,revision]);
 // ---- page background images (annotation-free, from the real renderer) for this revision
 useEffect(()=>{let live=true;const rev=loaded?.revision;if(!rev)return;
  setBg({});for(let n=1;n<=3;n++)fetchPng(`/reviews/${reviewId}/editor/page/${n}?annotated=0&revision=${rev}`).then(u=>{urls.current.push(u);if(live)setBg(b=>({...b,[n]:u}))}).catch(e=>live&&setErr((e as Error).message));
  return()=>{live=false}},[reviewId,loaded?.revision]);
 useEffect(()=>()=>{urls.current.forEach(u=>URL.revokeObjectURL(u));urls.current=[]},[]);

 const dirty=JSON.stringify(items)!==saved;
 const commit=(next:Ann[])=>{const cur=itemsRef.current;setPast(p=>[...p.slice(-99),cur]);setFuture([]);setItems(next);setPreview(null)};
 const undo=()=>{if(!past.length)return;const cur=itemsRef.current;setFuture(f=>[cur,...f]);setItems(past[past.length-1]);setPast(past.slice(0,-1));setPreview(null)};
 const redo=()=>{if(!future.length)return;const cur=itemsRef.current;setPast(p=>[...p,cur]);setItems(future[0]);setFuture(future.slice(1));setPreview(null)};
 const remove=()=>{if(!sel)return;commit(itemsRef.current.filter(a=>a.id!==sel));setSel(null)};
 const selected=items.find(a=>a.id===sel)||null;
 const pageItems=items.filter(a=>a.page===page);

 useEffect(()=>{const key=(e:KeyboardEvent)=>{
   const t=e.target as HTMLElement|null;if(t&&/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))return;
   if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();e.shiftKey?redo():undo()}
   else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'){e.preventDefault();redo()}
   else if((e.key==='Delete'||e.key==='Backspace')&&sel&&canEdit){e.preventDefault();remove()}
   else if(e.key==='Escape')setSel(null)};
  document.addEventListener('keydown',key);return()=>document.removeEventListener('keydown',key)});

 // ---- pointer helpers: client -> page units through the SVG's own transform (independent of window size)
 const toPage=(e:{clientX:number;clientY:number})=>{const svg=svgRef.current!;const pt=svg.createSVGPoint();pt.x=e.clientX;pt.y=e.clientY;const p=pt.matrixTransform(svg.getScreenCTM()!.inverse());return {x:clamp01(p.x/PW),y:clamp01(p.y/PH)}};
 const onSvgDown=(e:React.PointerEvent)=>{
  if(!canEdit||preview)return;(e.currentTarget as Element).setPointerCapture?.(e.pointerId);const p=toPage(e);
  if(tool==='select'){setSel(null);return}
  if(itemsRef.current.length>=MAX_ANN){setMsg({t:'err',m:`Дээд тал нь ${MAX_ANN} тэмдэглэгээ оруулна.`});return}
  setDrag({kind:'draw',tool,x0:p.x,y0:p.y,pts:[[p.x,p.y]],cur:p});
 };
 const startMove=(a:Ann)=>(e:React.PointerEvent)=>{if(!canEdit||preview||tool!=='select')return;e.stopPropagation();(svgRef.current as Element).setPointerCapture?.(e.pointerId);setSel(a.id);const p=toPage(e);setDrag({kind:'move',id:a.id,x0:p.x,y0:p.y,orig:a})};
 const startResize=(a:Ann,corner:'nw'|'ne'|'sw'|'se')=>(e:React.PointerEvent)=>{e.stopPropagation();(svgRef.current as Element).setPointerCapture?.(e.pointerId);setDrag({kind:'resize',id:a.id,corner,orig:a})};
 const startEnd=(a:Ann,idx:0|1)=>(e:React.PointerEvent)=>{e.stopPropagation();(svgRef.current as Element).setPointerCapture?.(e.pointerId);setDrag({kind:'end',id:a.id,idx,orig:a})};
 const replace=(id:string,next:Ann)=>setItems(itemsRef.current.map(a=>a.id===id?next:a));
 const onSvgMove=(e:React.PointerEvent)=>{
  const drag=dragRef.current;if(!drag)return;const p=toPage(e);
  if(drag.kind==='draw'){
   if(drag.tool==='pen'){const last=drag.pts[drag.pts.length-1];if(Math.hypot(p.x-last[0],(p.y-last[1])*PH/PW)>0.003)setDrag({...drag,pts:[...drag.pts,[p.x,p.y]].slice(-MAX_POINTS*3) as [number,number][],cur:p});else setDrag({...drag,cur:p})}
   else setDrag({...drag,cur:p});
  }else if(drag.kind==='move'){replace(drag.id,moved(drag.orig,p.x-drag.x0,p.y-drag.y0))}
  else if(drag.kind==='resize'){
   const o=drag.orig;let x1=o.x,y1=o.y,x2=o.x+o.w,y2=o.y+o.h;
   if(drag.corner.includes('w'))x1=Math.min(p.x,x2-MIN);else x2=Math.max(p.x,x1+MIN);
   if(drag.corner.includes('n'))y1=Math.min(p.y,y2-MIN);else y2=Math.max(p.y,y1+MIN);
   replace(drag.id,{...o,x:r5(x1),y:r5(y1),w:r5(x2-x1),h:r5(y2-y1)});
  }else if(drag.kind==='end'){
   const pts=drag.orig.points!.map((q,i)=>i===drag.idx?[p.x,p.y] as [number,number]:q);replace(drag.id,{...drag.orig,points:pts.map(([x,y])=>[r5(x),r5(y)] as [number,number]),...bboxOf(pts)});
  }
 };
 const onSvgUp=()=>{
  const d=dragRef.current;if(!d)return;setDrag(null);const items=itemsRef.current;
  if(d.kind==='draw'){
   const base={id:newId(),page,color,x:0,y:0,w:0,h:0};
   if(d.tool==='pen'){let pts=d.pts;if(pts.length>MAX_POINTS){const k=Math.ceil(pts.length/MAX_POINTS);pts=pts.filter((_,i)=>i%k===0||i===pts.length-1)}
    if(pts.length<2)return;const q=pts.map(([x,y])=>[r5(x),r5(y)] as [number,number]);const a:Ann={...base,type:'pen',points:q,strokeWidth:stroke,...bboxOf(q)};commit([...items,a]);setSel(a.id)}
   else if(d.tool==='arrow'){const q:[number,number][]=[[r5(d.x0),r5(d.y0)],[r5(d.cur.x),r5(d.cur.y)]];const bb=bboxOf(q);if(bb.w<MIN&&bb.h<MIN)return;const a:Ann={...base,type:'arrow',points:q,strokeWidth:stroke,...bb};commit([...items,a]);setSel(a.id)}
   else{const x=Math.min(d.x0,d.cur.x),y=Math.min(d.y0,d.cur.y),w=Math.abs(d.cur.x-d.x0),h=Math.abs(d.cur.y-d.y0);
    if(w<MIN||h<MIN)return;const a:Ann={...base,type:d.tool,x:r5(x),y:r5(y),w:r5(w),h:r5(h),...(d.tool==='text'?{text:'Тэмдэглэл',fontSize}:{}),...(d.tool==='rect'?{strokeWidth:stroke}:{})};commit([...items,a]);setSel(a.id);if(d.tool==='text')setTool('select')}
  }else{ // move / resize / end: the live edits were applied to `items`; record one undo step for the whole gesture
   const before=d.orig,after=items.find(a=>a.id===d.id);if(after&&JSON.stringify(after)!==JSON.stringify(before)){setPast(p=>[...p.slice(-99),items.map(a=>a.id===d.id?before:a)]);setFuture([]);setPreview(null)}
  }
 };
 const edit=(patch:Partial<Ann>)=>{if(!selected)return;commit(itemsRef.current.map(a=>a.id===selected.id?{...a,...patch}:a))};

 const save=async()=>{
  if(!loaded)return;setBusy(true);setMsg(null);
  try{const out=await adminApi.put(`/reviews/${reviewId}/annotations`,{baseRevision:loaded.revision,reason,annotations:{version:1,items}});setReason('');/* the parent reloads the review (which remounts this editor), so the confirmation is handed to the parent, which keeps it */onSaved({t:'ok',m:`Хувилбар #${out.revision} хадгалагдлаа (${out.annotationCount} тэмдэглэгээ). Батлах бол дахин «Батлахад бэлэн» болгоно.`})}
  catch(e){const x=e as AdminApiError;const m={t:'err' as const,m:x.status===409?`${x.message} Хуудсыг шинэчилж байна.`:x.message};if(x.status===409)onSaved(m);else setMsg(m)}
  finally{setBusy(false)}};
 const runPreview=async()=>{setPreviewBusy(true);setMsg(null);try{const o=await adminApi.post(`/reviews/${reviewId}/editor/preview`,{annotations:{version:1,items}});setPreview(o.pages)}catch(e){setMsg({t:'err',m:(e as Error).message})}finally{setPreviewBusy(false)}};
 const loadRevision=async(n:number)=>{try{const o=await adminApi.get(`/reviews/${reviewId}/editor/revisions/${n}/annotations`);commit(o.annotations.items);setSel(null);setMsg({t:'ok',m:`Хувилбар #${n}-ийн тэмдэглэгээг ачааллаа. Хадгалаагүй байна.`})}catch(e){setMsg({t:'err',m:(e as Error).message})}};

 const draft=drag?.kind==='draw'?drag:null;
 const draftShape=useMemo(()=>{if(!draft)return null;const d=draft;const a:Ann={id:'draft',page,color,x:Math.min(d.x0,d.cur.x),y:Math.min(d.y0,d.cur.y),w:Math.abs(d.cur.x-d.x0),h:Math.abs(d.cur.y-d.y0),type:d.tool,strokeWidth:stroke,fontSize,text:'',...(d.tool==='pen'?{points:d.pts}:d.tool==='arrow'?{points:[[d.x0,d.y0],[d.cur.x,d.cur.y]] as [number,number][]}:{})};return a},[draft,page,color,stroke,fontSize]);
 if(err)return <div className="adm-error" role="alert">{err}</div>;
 if(!loaded)return <p className="adm-note" role="status">Ачаалж байна…</p>;

 const handles=selected&&selected.type!=='pen'&&selected.type!=='arrow'?([['nw',selected.x,selected.y],['ne',selected.x+selected.w,selected.y],['sw',selected.x,selected.y+selected.h],['se',selected.x+selected.w,selected.y+selected.h]] as const):[];
 return <section className="adm-card ve" aria-label="Дүрслэн засварлагч">
  <h2>Тайлангийн хуудсыг дүрслэн засах</h2>
  <p className="adm-note">Тэмдэглэгээ нь тайлангийн 3 хуудасны дээр давхарлагдана; оноо, хариулт, үндсэн текстийг өөрчлөхгүй. Хадгалахад шинэ хувилбар үүснэ, батлагдсан байсан бол дахин батлах шаардлагатай.</p>
  {msg&&<div className={msg.t==='ok'?'adm-note adm-note--ok':'adm-error'} role={msg.t==='ok'?'status':'alert'}>{msg.m}</div>}
  <div className="ve-bar" role="toolbar" aria-label="Багажууд">
   <div className="ve-group" role="group" aria-label="Хуудас">{([1,2,3] as const).map(n=><button key={n} type="button" className={`adm-btn${page===n?' adm-btn--primary':''}`} aria-pressed={page===n} onClick={()=>{setPage(n);setSel(null)}}>Хуудас {n}</button>)}</div>
   {canEdit&&<div className="ve-group" role="group" aria-label="Багаж">{TOOLS.map(([t,l])=><button key={t} type="button" className={`adm-btn${tool===t?' adm-btn--primary':''}`} aria-pressed={tool===t} onClick={()=>setTool(t)}>{l}</button>)}</div>}
   {canEdit&&<div className="ve-group" role="group" aria-label="Өнгө">{(Object.keys(COLORS) as AnnColor[]).map(c=><button key={c} type="button" className={`ve-swatch${(selected?.color??color)===c?' is-on':''}`} style={{background:COLORS[c]}} aria-label={COLOR_MN[c]} aria-pressed={(selected?.color??color)===c} onClick={()=>selected?edit({color:c}):setColor(c)}/>)}</div>}
   {canEdit&&<label className="ve-field">Зураасны зузаан<select value={selected?.strokeWidth??stroke} onChange={e=>selected?.strokeWidth!==undefined?edit({strokeWidth:Number(e.target.value)}):setStroke(Number(e.target.value))}>{[1,1.5,2,3,4,6].map(v=><option key={v} value={v}>{v}</option>)}</select></label>}
   {canEdit&&<label className="ve-field">Үсгийн хэмжээ<select value={selected?.fontSize??fontSize} onChange={e=>selected?.type==='text'?edit({fontSize:Number(e.target.value)}):setFontSize(Number(e.target.value))}>{[7,8,9,10,12,14,18].map(v=><option key={v} value={v}>{v}</option>)}</select></label>}
   {canEdit&&<div className="ve-group"><button type="button" className="adm-btn" disabled={!past.length} onClick={undo}>Буцаах</button><button type="button" className="adm-btn" disabled={!future.length} onClick={redo}>Дахин хийх</button><button type="button" className="adm-btn adm-btn--danger" disabled={!sel} onClick={remove}>Устгах</button></div>}
  </div>
  <div className="ve-stage" data-page={page}>
   {preview?<img className="ve-page" src={preview[page-1]} alt={`Урьдчилан харах: хуудас ${page}`}/>:bg[page]?<img className="ve-page" src={bg[page]} alt={`Тайлангийн хуудас ${page}`} draggable={false}/>:<div className="ve-page ve-page--loading" role="status">Хуудсыг боловсруулж байна…</div>}
   {!preview&&<svg ref={svgRef} className="ve-overlay" viewBox={`0 0 ${PW} ${PH}`} onPointerDown={onSvgDown} onPointerMove={onSvgMove} onPointerUp={onSvgUp} onPointerCancel={onSvgUp} style={{cursor:canEdit&&tool!=='select'?'crosshair':'default',touchAction:'none'}} data-testid="ve-overlay">
    {pageItems.map(a=><Shape key={a.id} a={a} selected={a.id===sel} onDown={startMove(a)}/>)}
    {draftShape&&<Shape a={draftShape} selected={false}/>}
    {canEdit&&selected&&selected.page===page&&handles.map(([c,x,y])=><rect key={c} className="ve-handle" x={x*PW-4} y={y*PH-4} width={8} height={8} onPointerDown={startResize(selected,c)}/>)}
    {canEdit&&selected&&selected.page===page&&selected.type==='arrow'&&selected.points&&selected.points.map((q,i)=><circle key={i} className="ve-handle" cx={q[0]*PW} cy={q[1]*PH} r={5} onPointerDown={startEnd(selected,i as 0|1)}/>)}
   </svg>}
  </div>
  {preview&&<p className="adm-note" role="status">Энэ нь хадгалаагүй өөрчлөлтийг оролцуулсан, жинхэнэ PDF-ийн боловсруулагчаар гаргасан урьдчилсан харагдац.</p>}
  {canEdit&&selected&&selected.type==='text'&&<label className="ve-text">Тэмдэглэлийн текст (дээд тал нь 500 тэмдэгт)<textarea rows={3} maxLength={500} value={selected.text??''} onBlur={()=>{textStep.current=null}} onChange={e=>{if(textStep.current!==selected.id){const cur=itemsRef.current;setPast(p=>[...p.slice(-99),cur]);setFuture([]);textStep.current=selected.id}/* one undo step per editing session of a note, recorded at the first real change */replace(selected.id,{...selected,text:e.target.value});setPreview(null)}}/></label>}
  <div className="ve-actions">
   <button type="button" className="adm-btn" disabled={previewBusy} onClick={()=>void(preview?setPreview(null):runPreview())}>{preview?'Засварлах руу буцах':previewBusy?'Боловсруулж байна…':'Урьдчилан харах'}</button>
   {canEdit&&<><label className="adm-reason">Засварын шалтгаан<input value={reason} onChange={e=>setReason(e.target.value)} placeholder="Яагаад тэмдэглэв?" maxLength={500}/></label>
    <button type="button" className="adm-btn adm-btn--primary" disabled={busy||!dirty||reason.trim().length<3} onClick={()=>void save()}>Хадгалах{dirty?' *':''}</button></>}
   {dirty&&<small className="adm-note">Хадгалаагүй өөрчлөлт байна.</small>}
  </div>
  <h3>Тэмдэглэгээний хувилбарууд</h3>
  <ul className="adm-revs">{loaded.history.map(h=><li key={h.revision}><b>#{h.revision}</b> {h.source==='GENERATED'?'автомат төсөл':h.source==='AI_APPLIED'?'AI санал':h.source==='RESTORED'?'сэргээсэн':'гар засвар'} · {h.annotationCount} тэмдэглэгээ<small>{fmt(h.createdAt)}{h.reason?` · ${h.reason}`:''}</small>{canEdit&&h.revision!==loaded.revision&&<button type="button" className="adm-link" onClick={()=>void loadRevision(h.revision)}>Энэ хувилбарын тэмдэглэгээг ачаалах</button>}</li>)}</ul>
 </section>;
}
