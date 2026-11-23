/* ONE definition of the five domains' customer-facing ORDER and display NAMES. Presentation only: internal ids (API codes, database values, scoring, routing) are unchanged.
   Order everywhere customers or administrators see or select domains: Маркетинг, Мэдээллийн технологи, Санхүү, Хүний нөөц, Үйлдвэрлэл ба үйл ажиллагаа. */
export const DOMAIN_ORDER=['marketing','it','finance','people','operations'] as const;
export type DomainCode=typeof DOMAIN_ORDER[number];
export const DOMAIN_NAME_MN:Record<DomainCode,string>={marketing:'Маркетинг',finance:'Санхүү',people:'Хүний нөөц',it:'Мэдээллийн технологи',operations:'Үйлдвэрлэл ба үйл ажиллагаа'};
/* Homepage hero labels only (the platform brand stays BusinessMRI.mn). */
/* Approved convention: UPPERCASE Mongolian name followed by the English abbreviation in parentheses, identical in every customer-facing label. */
export const DOMAIN_HERO_LABEL:Record<DomainCode,string>={marketing:'МАРКЕТИНГ (MMRI)',it:'МЭДЭЭЛЛИЙН ТЕХНОЛОГИ (ITMRI)',finance:'САНХҮҮ (FINMRI)',people:'ХҮНИЙ НӨӨЦ (HRMRI)',operations:'ҮЙЛДВЭРЛЭЛ БА ҮЙЛ АЖИЛЛАГАА (POMMRI)'};
/** Diagnosis selection cards: the same global format as everywhere ("МАРКЕТИНГ (MMRI)"). */
export const DOMAIN_DIAGNOSIS_LABEL:Record<DomainCode,string>=DOMAIN_HERO_LABEL;
const rank=(id:string)=>{const i=(DOMAIN_ORDER as readonly string[]).indexOf(id);return i<0?DOMAIN_ORDER.length:i};
/** Stable sort into the standard domain order; unknown ids go last in their original order. Never mutates the input. */
export function sortByDomain<T>(rows:readonly T[],id:(row:T)=>string):T[]{return rows.map((r,i)=>[r,i] as const).sort((a,b)=>rank(id(a[0]))-rank(id(b[0]))||a[1]-b[1]).map(x=>x[0])}
export const domainNameMn=(id:string)=>(DOMAIN_NAME_MN as Record<string,string>)[id]??id;
/** Short code shown next to each domain (display only). */
export const DOMAIN_ABBR:Record<DomainCode,string>={marketing:'MMRI',it:'ITMRI',finance:'FINMRI',people:'HRMRI',operations:'POMMRI'};
/** Full customer-facing diagnosis names with the code, used in diagnosis and report sections. */
export const DOMAIN_FULL_NAME:Record<DomainCode,string>={marketing:'Маркетингийн оношилгоо (MMRI)',it:'Мэдээллийн технологийн оношилгоо (ITMRI)',finance:'Санхүүгийн оношилгоо (FINMRI)',people:'Хүний нөөцийн оношилгоо (HRMRI)',operations:'Үйлдвэрлэл ба үйл ажиллагааны оношилгоо (POMMRI)'};
export const domainAbbr=(id:string)=>(DOMAIN_ABBR as Record<string,string>)[id]??'';
export const domainFullName=(id:string)=>(DOMAIN_FULL_NAME as Record<string,string>)[id]??id;
/** "САНХҮҮ (FINMRI)" style label for compact places such as receipts. */
export const domainWithAbbr=(id:string)=>{const a=domainAbbr(id);return a?`${domainNameMn(id).toLocaleUpperCase('mn')} (${a})`:domainNameMn(id)};
