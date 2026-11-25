import React from 'react';
import { domainCode,domainNameMn } from '../data/domainOrder';

/** One category mark everywhere: the short code (MMRI, ITMRI, FINMRI, HRMRI, OPMRI) in a box of the category colour. Colour is never the only identifier.
    Dark ink on the bright category colour keeps the code readable (contrast checked >= 4.5:1). Decorative beside a visible category name; pass `standalone` when it is the only label. */
export default function DomainBadge({id,standalone=false,className=''}:{id:string;standalone?:boolean;className?:string}){
 const code=domainCode(id);if(!code)return null;
 return <span className={`domain-badge ${className}`.trim()} data-area={id} style={{'--c':`var(--mmri-domain-${id})`} as React.CSSProperties} {...(standalone?{role:'img','aria-label':domainNameMn(id)}:{'aria-hidden':true})}>{code}</span>;
}
