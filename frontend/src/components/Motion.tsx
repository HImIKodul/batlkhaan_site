import React from 'react';

/**
 * Step 17 motion policy:
 * - Content is never hidden waiting for an intersection/reveal animation.
 * - Executive numbers render immediately; no count-up/gamification.
 * - All functional transition timing/easing lives in motion.css and design tokens.
 * - Reduced-motion users receive immediate state changes except essential loading rotation.
 */
export function Reveal({children,className='',as='div'}:{children:React.ReactNode;className?:string;delay?:number;as?:'div'|'section'|'article'}){
  return React.createElement(as,{className:`reveal is-visible ${className}`.trim()},children);
}

export function AnimatedNumber({value,decimals=0,className=''}:{value:number|null|undefined;duration?:number;decimals?:number;className?:string}){
  if(value==null)return <span className={className}>-</span>;
  return <span className={className}>{value.toFixed(decimals)}</span>;
}

export function MotionCheck({active}:{active:boolean}){
  return <span className={`motion-check ${active?'is-active':''}`} aria-hidden="true">{active?'✓':''}</span>;
}
