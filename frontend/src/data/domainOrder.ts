/* ONE definition of the five domains' customer-facing ORDER and display NAMES. Presentation only: internal ids (API codes, database values, scoring, routing) are unchanged.
   Order everywhere customers or administrators see or select domains: Маркетинг, Санхүү, Хүний нөөц, Мэдээллийн технологи, Үйлдвэрлэл, үйл ажиллагаа. */
export const DOMAIN_ORDER=['marketing','finance','people','it','operations'] as const;
export type DomainCode=typeof DOMAIN_ORDER[number];
export const DOMAIN_NAME_MN:Record<DomainCode,string>={marketing:'Маркетинг',finance:'Санхүү',people:'Хүний нөөц',it:'Мэдээллийн технологи',operations:'Үйлдвэрлэл, үйл ажиллагаа'};
/* Homepage hero labels only (the platform brand stays BusinessMRI.mn). */
export const DOMAIN_HERO_LABEL:Record<DomainCode,string>={marketing:'Маркетинг (MMRI)',finance:'Санхүү (FINMRI)',people:'Хүний нөөц (HRMRI)',it:'Мэдээллийн технологи (ITMRI)',operations:'Үйлдвэрлэл, үйл ажиллагаа (POMMRI)'};
const rank=(id:string)=>{const i=(DOMAIN_ORDER as readonly string[]).indexOf(id);return i<0?DOMAIN_ORDER.length:i};
/** Stable sort into the standard domain order; unknown ids go last in their original order. Never mutates the input. */
export function sortByDomain<T>(rows:readonly T[],id:(row:T)=>string):T[]{return rows.map((r,i)=>[r,i] as const).sort((a,b)=>rank(id(a[0]))-rank(id(b[0]))||a[1]-b[1]).map(x=>x[0])}
export const domainNameMn=(id:string)=>(DOMAIN_NAME_MN as Record<string,string>)[id]??id;
/** Short code shown next to each domain (display only). */
export const DOMAIN_ABBR:Record<DomainCode,string>={marketing:'MMRI',finance:'FINMRI',people:'HRMRI',it:'ITMRI',operations:'POMMRI'};
/** Full customer-facing diagnosis names with the code, used in diagnosis and report sections. */
export const DOMAIN_FULL_NAME:Record<DomainCode,string>={marketing:'Маркетингийн оношилгоо (MMRI)',finance:'Санхүүгийн оношилгоо (FINMRI)',people:'Хүний нөөцийн оношилгоо (HRMRI)',it:'Мэдээллийн технологийн оношилгоо (ITMRI)',operations:'Үйлдвэрлэл, үйл ажиллагааны оношилгоо (POMMRI)'};
export const domainAbbr=(id:string)=>(DOMAIN_ABBR as Record<string,string>)[id]??'';
export const domainFullName=(id:string)=>(DOMAIN_FULL_NAME as Record<string,string>)[id]??id;
/** "Санхүү (FINMRI)" style label for compact places such as receipts. */
export const domainWithAbbr=(id:string)=>{const a=domainAbbr(id);return a?`${domainNameMn(id)} (${a})`:domainNameMn(id)};
