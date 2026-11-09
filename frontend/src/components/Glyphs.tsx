import React,{useId} from 'react';

/**
 * MMRI liquid-glass glyph family (64×64 grid).
 * One construction for every glyph: a translucent glass layer behind, a solid
 * gradient layer in front (colours come from --glyph-a / --glyph-b), white
 * round-capped detail lines and a specular highlight. Stroke 3, corner radius 6.
 */
type GlyphProps={size?:number;className?:string};

function gearPath(cx:number,cy:number,ro:number,ri:number,teeth:number){
  const pts:string[]=[];const step=Math.PI*2/teeth;
  for(let i=0;i<teeth;i++){
    const a=i*step-Math.PI/2;
    const p=(r:number,o:number)=>`${(cx+Math.cos(a+o)*r).toFixed(2)} ${(cy+Math.sin(a+o)*r).toFixed(2)}`;
    pts.push(`${i?'L':'M'}${p(ri,-step*.32)}L${p(ro,-step*.17)}L${p(ro,step*.17)}L${p(ri,step*.32)}`);
  }
  return pts.join('')+'Z';
}
const GEAR=gearPath(32,32,25,19,8);

const shapes:Record<string,(g:{f:string})=>React.ReactNode>={
  /* Domains */
  marketing:({f})=><>
    <path className="gl-back" d="M42 20c6 3.5 6 20.5 0 24"/>
    <path className="gl-back" d="M49 13c11 7.5 11 30.5 0 38"/>
    <rect className="gl-front" x="16" y="34" width="10" height="16" rx="4" fill={f}/>
    <path className="gl-front" d="M12 26 36 13v38L12 38Z" fill={f}/>
    <path className="gl-line" d="M20 28.5 31 22.5"/>
  </>,
  it:({f})=><>
    <rect className="gl-back" x="9" y="9" width="46" height="46" rx="12"/>
    <path className="gl-line gl-dim" d="M22 3v6M32 3v6M42 3v6M22 55v6M32 55v6M42 55v6M3 22h6M3 32h6M3 42h6M55 22h6M55 32h6M55 42h6"/>
    <rect className="gl-front" x="19" y="19" width="26" height="26" rx="7" fill={f}/>
    <path className="gl-line" d="M27 32h10M32 27v10"/>
  </>,
  finance:({f})=><>
    <path className="gl-back" d="M12 43v7c0 3.6 8.9 6.5 20 6.5S52 53.600 52 50v-7"/>
    <path className="gl-back" d="M12 43c0-3.600 8.900-6.500 20-6.500S52 39.400 52 43s-8.900 6.500-20 6.500S12 46.600 12 43Z"/>
    <path className="gl-front" d="M14 28v7c0 3.300 8.100 6 18 6s18-2.700 18-6v-7Z" fill={f}/>
    <ellipse className="gl-front" cx="32" cy="28" rx="18" ry="6.500" fill={f}/>
    <path className="gl-line" d="M32 5v10M27 10l5-5 5 5"/>
    <path className="gl-line gl-dim" d="M26 28h12"/>
  </>,
  people:({f})=><>
    <circle className="gl-back" cx="12.500" cy="29" r="6"/>
    <path className="gl-back" d="M3 51c0-8 4-12.500 9.500-12.500 2.700 0 4.900 1 6.500 3"/>
    <circle className="gl-back" cx="51.500" cy="29" r="6"/>
    <path className="gl-back" d="M61 51c0-8-4-12.500-9.500-12.500-2.700 0-4.900 1-6.500 3"/>
    <circle className="gl-front" cx="32" cy="22" r="9.500" fill={f}/>
    <path className="gl-front" d="M14 55c0-11 7-18 18-18s18 7 18 18Z" fill={f}/>
  </>,
  operations:({f})=><>
    <path className="gl-front" d={GEAR} fill={f}/>
    <circle className="gl-back gl-hole" cx="32" cy="32" r="9.500"/>
    <path className="gl-line" d="M26.500 32.500l4 4 7.500-8.500"/>
  </>,
  /* Homepage guides */
  about:({f})=><>
    <path className="gl-back" d="M32 6 57 24.500 47.500 54h-31L7 24.500Z"/>
    <path className="gl-front" d="M32 17 46 27.500 40.500 44h-17L18 27.500Z" fill={f}/>
    <path className="gl-line gl-dim" d="M32 6v11M57 24.500 46 27.500M47.500 54l-7-10M16.500 54l7-10M7 24.500l11 3"/>
    <circle className="gl-dot" cx="32" cy="32" r="3.500"/>
  </>,
  diagnosis:({f})=><>
    <rect className="gl-back" x="8" y="6" width="48" height="52" rx="13"/>
    <circle className="gl-front" cx="22" cy="20" r="5.600" fill={f}/>
    <path className="gl-line" d="m19.300 20 2 2 3.500-4"/>
    <path className="gl-line gl-dim" d="M34 20h14"/>
    <circle className="gl-back" cx="22" cy="33" r="5.600"/>
    <path className="gl-line gl-dim" d="M34 33h14"/>
    <circle className="gl-back" cx="22" cy="46" r="5.600"/>
    <path className="gl-line gl-dim" d="M34 46h9"/>
  </>,
  result:({f})=><>
    <path className="gl-back" d="M14 6h27l13 13v33a6 6 0 0 1-6 6H14a6 6 0 0 1-6-6V12a6 6 0 0 1 6-6Z" transform="translate(1 0)"/>
    <path className="gl-line gl-dim" d="M42 7v10a3 3 0 0 0 3 3h9"/>
    <rect className="gl-front" x="17" y="38" width="8" height="12" rx="3" fill={f}/>
    <rect className="gl-front" x="28" y="30" width="8" height="20" rx="3" fill={f}/>
    <rect className="gl-front" x="39" y="22" width="8" height="28" rx="3" fill={f}/>
  </>,
  payment:({f})=><>
    <rect className="gl-back" x="4" y="13" width="56" height="38" rx="13"/>
    <path className="gl-line gl-dim" d="M4 26h56"/>
    <rect className="gl-front" x="12" y="33" width="17" height="11" rx="4.500" fill={f}/>
    <path className="gl-line" d="M41 34.500a6 6 0 0 1 0 9M47 31a11 11 0 0 1 0 16"/>
  </>,
  /* Status */
  locked:({f})=><>
    <path className="gl-back" d="M21 29v-7a11 11 0 0 1 22 0v7"/>
    <rect className="gl-front" x="12" y="28" width="40" height="29" rx="9" fill={f}/>
    <path className="gl-line" d="M32 38v8"/>
  </>,
  ready:({f})=><>
    <circle className="gl-front" cx="32" cy="32" r="25" fill={f}/>
    <path className="gl-line" d="M26 21.500v21l17-10.500Z" style={{fill:'rgba(255,255,255,.92)'}}/>
  </>,
  progress:({f})=><>
    <circle className="gl-back" cx="32" cy="32" r="24"/>
    <path className="gl-front" d="M32 32V8a24 24 0 0 1 22.800 31.600Z" fill={f}/>
    <circle className="gl-dot" cx="32" cy="32" r="4"/>
  </>,
  report:({f})=><>
    <circle className="gl-front" cx="32" cy="32" r="25" fill={f}/>
    <path className="gl-line" d="m20 33 8.500 8.500L44.500 23"/>
  </>,
};

export function Glyph({name,size=64,className='',colors,light=false,ink}:GlyphProps&{name:string;colors?:{a:string;b:string};light?:boolean;ink?:string}){
  const gid=useId().replace(/:/g,'');
  const draw=shapes[name]??shapes.about;
  const style=(colors||ink)?({...(colors?{'--glyph-a':colors.a,'--glyph-b':colors.b}:{}),...(ink?{'--glyph-ink':ink}:{})} as React.CSSProperties):undefined;
  return <svg className={`mmri-glyph${light?' is-light':''} ${className}`.trim()} data-glyph={name} width={size} height={size} viewBox="0 0 64 64" style={style} focusable="false" aria-hidden="true">
    <defs>
      <linearGradient id={`g${gid}`} x1="12%" y1="0%" x2="88%" y2="100%"><stop offset="0" stopColor={light?'#FFFFFF':'var(--glyph-a, var(--domain-primary))'}/><stop offset="1" stopColor={light?'#DDE6FF':'var(--glyph-b, var(--domain-secondary))'}/></linearGradient>
    </defs>
    <g className="gl-body">{draw({f:`url(#g${gid})`})}</g>
  </svg>;
}

export type StatusState='locked'|'ready'|'progress'|'report';
const statusTone:Record<StatusState,{disc:string;ring:string}>={
  locked:{disc:'#64748B',ring:'#CBD5E1'},
  ready:{disc:'#1E90FF',ring:'#8FD0FF'},
  progress:{disc:'#F59E0B',ring:'#FFE08A'},
  report:{disc:'#16B873',ring:'#8FF0C2'},
};
const RING=2*Math.PI*18;
/** Ring-style state indicator: solid colour disc, white icon, ring (partial arc shows progress). */
export function StatusRing({state,progress,size=44,className=''}:{state:StatusState;progress?:number;size?:number;className?:string}){
  const t=statusTone[state];
  const pct=state==='progress'?Math.max(6,Math.min(100,progress??0)):100;
  const style={'--sr-disc':t.disc,'--sr-ring':t.ring} as React.CSSProperties;
  return <svg className={`mmri-status-ring ${className}`.trim()} data-state={state} width={size} height={size} viewBox="0 0 44 44" style={style} focusable="false" aria-hidden="true">
    <circle className="sr-track" cx="22" cy="22" r="18"/>
    <circle className="sr-arc" cx="22" cy="22" r="18" strokeDasharray={`${RING*pct/100} ${RING}`}/>
    <circle className="sr-disc" cx="22" cy="22" r="14"/>
    {state==='locked'&&<><rect className="sr-icon" x="15.500" y="21" width="13" height="9.500" rx="3"/><path className="sr-icon" d="M18.500 21v-2.500a3.500 3.500 0 0 1 7 0V21"/></>}
    {state==='ready'&&<path className="sr-fill" d="M19.500 15.500v13l10.500-6.500Z" strokeLinejoin="round"/>}
    {state==='progress'&&<path className="sr-icon" d="M22 15.500V22l4.500 2.800"/>}
    {state==='report'&&<path className="sr-icon" d="m15.500 22.500 4.500 4.500 8.500-9.500"/>}
  </svg>;
}
