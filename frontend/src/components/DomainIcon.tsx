import { Megaphone,Cpu,Landmark,UsersRound,Factory,type LucideIcon } from 'lucide-react';

/** One semantic pictogram per business area (decorative: the visible area name always sits next to it). */
const ICONS:Record<string,LucideIcon>={marketing:Megaphone,it:Cpu,finance:Landmark,people:UsersRound,operations:Factory};

export function DomainIcon({id,size=22}:{id:string;size?:number}){
 const I=ICONS[id];
 return I?<I size={size} strokeWidth={1.9} aria-hidden="true" focusable="false"/>:null;
}
