/* Plain-Mongolian display terms for customer-facing labels (capability names, topics, report wording).
   DISPLAY ONLY: diagnostic ids, scores, weights, question text and all source data are never touched.
   Exact replacements run first (owner-requested wording), then the general rule «засаглал» (governance) -> «удирдлага». */
const EXACT:Array<[string,string]>=[
 ['Үүлэн үйлчилгээ ба программын үйлчилгээний багцын засаглал','Үүлэн болон программын үйлчилгээний удирдлага'],
 ['Бага кодтой эсвэл кодгүй хөгжүүлэлт','Код бичихгүйгээр эсвэл бага кодоор программ бүтээх'],
];
const GOVERNANCE:Array<[RegExp,string]>=[
 [/засаглалаас/g,'удирдлагаас'],[/засаглалтай/g,'удирдлагатай'],[/засаглалын/g,'удирдлагын'],[/засаглалыг/g,'удирдлагыг'],[/засаглалд/g,'удирдлагад'],[/засаглал/g,'удирдлага'],
 [/Засаглалаас/g,'Удирдлагаас'],[/Засаглалын/g,'Удирдлагын'],[/Засаглал/g,'Удирдлага'],
];
export function plainMn(value:string):string{let s=String(value??'');for(const [a,b] of EXACT)s=s.split(a).join(b);for(const [r,b] of GOVERNANCE)s=s.replace(r,b);return s}

/** Applies plainMn to every string of a customer-facing API payload (display copy only; numbers, ids and hashes are not strings that match, and the payload sent back to the server is never this copy). */
export function plainDeep<T>(v:T):T{if(typeof v==='string')return plainMn(v) as unknown as T;if(Array.isArray(v))return v.map(plainDeep) as unknown as T;if(v&&typeof v==='object'){const o:Record<string,unknown>={};for(const k of Object.keys(v as object))o[k]=plainDeep((v as Record<string,unknown>)[k]);return o as T}return v}
