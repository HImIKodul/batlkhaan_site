import facts from './businessFacts.json';

/* The 100 interesting facts of the login page (data/businessFacts.json is BusinessMRI_100_facts.json as delivered; its sources were NOT all independently rechecked, so nothing here is presented as externally verified).
   Shuffle without replacement: every fact is shown once before any fact repeats; when the deck is empty a new shuffled cycle starts and its first fact is never the one just shown.
   The position in the cycle survives a page refresh (localStorage). Pure functions below are tested by frontend/scripts/test-fact-deck.mts. */
export type BusinessFact={id:number;category:string;text:string};
export const businessFacts=facts as BusinessFact[];
export const FACT_IDS=businessFacts.map(f=>f.id);
const KEY='mmri.factDeck.v1';
export type DeckState={queue:number[];current:number|null};

export function shuffle<T>(items:readonly T[],random:()=>number=Math.random):T[]{
 const a=items.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a;
}
/** A fresh shuffled cycle of all ids; its first element differs from `avoid` (the fact shown last). */
export function newCycle(ids:readonly number[],avoid:number|null,random:()=>number=Math.random):number[]{
 const q=shuffle(ids,random);
 if(avoid!==null&&q.length>1&&q[0]===avoid){const j=1+Math.floor(random()*(q.length-1));[q[0],q[j]]=[q[j],q[0]]}
 return q;
}
/** Moves to the next fact. */
export function advance(state:DeckState|null,ids:readonly number[],random:()=>number=Math.random):DeckState{
 const valid=new Set(ids);
 let queue=(state?.queue??[]).filter(x=>valid.has(x));const current=state&&state.current!==null&&valid.has(state.current)?state.current:null;
 if(!queue.length)queue=newCycle(ids,current,random);
 const [next,...rest]=queue;return {queue:rest,current:next};
}
const read=():DeckState|null=>{try{const v=JSON.parse(localStorage.getItem(KEY)||'null');return v&&Array.isArray(v.queue)?{queue:v.queue.map(Number),current:v.current==null?null:Number(v.current)}:null}catch{return null}};
const write=(s:DeckState)=>{try{localStorage.setItem(KEY,JSON.stringify(s))}catch{/* private mode: the deck still works for this visit */}};
/** The fact to show now: the one shown before a refresh, or the first of a new cycle. */
export function currentFact():BusinessFact{
 let s=read();if(!s||s.current===null||!FACT_IDS.includes(s.current)){s=advance(s,FACT_IDS);write(s)}
 return businessFacts.find(f=>f.id===s!.current)!;
}
export function nextFact():BusinessFact{const s=advance(read(),FACT_IDS);write(s);return businessFacts.find(f=>f.id===s.current)!}
