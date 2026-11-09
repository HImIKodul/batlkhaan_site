/* Official legal-entity forms of Mongolia.
   Source: "Хуулийн этгээдийн хэлбэрийн индекс" (Legal entity form index), appendix 11 to order А/55 of the General Authority for
   State Registration, published on legalinfo.mn: https://legalinfo.mn/mn/detail?lawId=16147365756521 (read 2026-11-04, 31 rows).
   `code` is the official index code and is the identity of a form (several forms share one abbreviation, e.g. ХХК = 11, 24, 50, 51, 52).
   The UI shows the abbreviation only; `nameMn` and `aliases` exist for search; English words are search aliases, never separate forms. */
export type LegalForm={code:string;abbr:string;nameMn:string;note?:string;aliases?:string[]};

export const legalForms:LegalForm[]=[
 {code:'07',abbr:'ХК',nameMn:'Хувьцаат компани',note:'нээлттэй',aliases:['нээлттэй хк','public joint stock','plc']},
 {code:'08',abbr:'ХК',nameMn:'Хувьцаат компани',note:'хаалттай',aliases:['хаалттай хк','private joint stock']},
 {code:'09',abbr:'ХХКХМБ',nameMn:'Хязгаарлагдмал хариуцлагатай компани',note:'сонин, сэтгүүл, радио, телевиз'},
 {code:'11',abbr:'ХХК',nameMn:'Хязгаарлагдмал хариуцлагатай компани',aliases:['llc','ltd','limited liability','co., ltd']},
 {code:'12',abbr:'ХК',nameMn:'Хувьцаат компани',note:'төрийн, орон нутгийн өмчийн оролцоотой',aliases:['jsc','joint stock','joint-stock']},
 {code:'13',abbr:'ААТҮГ',nameMn:'Аж ахуйн тооцоотой үйлдвэрийн газар',note:'төрийн өмчит',aliases:['state-owned enterprise']},
 {code:'14',abbr:'ААТҮГ',nameMn:'Аж ахуйн тооцоотой үйлдвэрийн газар',note:'орон нутгийн өмчит'},
 {code:'15',abbr:'ББСБ',nameMn:'Хязгаарлагдмал хариуцлагатай компани',note:'банк бус санхүүгийн байгууллага',aliases:['non-bank financial']},
 {code:'16',abbr:'Банк',nameMn:'Хязгаарлагдмал хариуцлагатай компани',note:'банкны үйл ажиллагаа',aliases:['bank']},
 {code:'17',abbr:'Даатгал',nameMn:'Хязгаарлагдмал хариуцлагатай компани',note:'даатгалын үйл ажиллагаа',aliases:['insurance']},
 {code:'18',abbr:'Аудит',nameMn:'Хязгаарлагдмал хариуцлагатай компани',note:'аудит, татварын зөвлөх',aliases:['audit']},
 {code:'19',abbr:'ГХО',nameMn:'Хязгаарлагдмал хариуцлагатай компани',note:'гадаадын хөрөнгө оруулалттай',aliases:['foreign investment']},
 {code:'20',abbr:'ББН',nameMn:'Нөхөрлөл',note:'бүх гишүүн бүрэн хариуцлагатай',aliases:['partnership','general partnership']},
 {code:'21',abbr:'ЗБН',nameMn:'Нөхөрлөл',note:'зарим гишүүн бүрэн хариуцлагатай',aliases:['partnership']},
 {code:'22',abbr:'ХХН',nameMn:'Нөхөрлөл',note:'хязгаарлагдмал хариуцлагатай',aliases:['limited partnership','llp','lp']},
 {code:'23',abbr:'ГХОХХН',nameMn:'Нөхөрлөл',note:'гадаадын хөрөнгө оруулалттай, хязгаарлагдмал хариуцлагатай'},
 {code:'24',abbr:'ХХК',nameMn:'Хязгаарлагдмал хариуцлагатай компани',note:'төрийн, орон нутгийн өмчийн оролцоотой',aliases:['llc']},
 {code:'26',abbr:'БСБ',nameMn:'Хязгаарлагдмал хариуцлагатай компани',note:'боловсрол, сургалтын байгууллага',aliases:['education']},
 {code:'28',abbr:'Өмгөөллийн',nameMn:'Хязгаарлагдмал хариуцлагатай компани',note:'өмгөөллийн үйл ажиллагаа',aliases:['law firm','advocacy']},
 {code:'30',abbr:'Хоршоо',nameMn:'Хоршоо',note:'анхан шатны',aliases:['cooperative']},
 {code:'31',abbr:'ХЗХ',nameMn:'Хоршоо',note:'хадгаламж, зээлийн',aliases:['savings and credit','cooperative']},
 {code:'32',abbr:'Хоршоо',nameMn:'Хоршоо',note:'дундын',aliases:['cooperative','union of cooperatives']},
 {code:'50',abbr:'ХХК',nameMn:'Хязгаарлагдмал хариуцлагатай компани',note:'Алтанбулаг чөлөөт бүс',aliases:['free zone','altanbulag']},
 {code:'51',abbr:'ХХК',nameMn:'Хязгаарлагдмал хариуцлагатай компани',note:'Замын-Үүд чөлөөт бүс',aliases:['free zone','zamyn-uud']},
 {code:'52',abbr:'ХХК',nameMn:'Хязгаарлагдмал хариуцлагатай компани',note:'Цагааннуур чөлөөт бүс',aliases:['free zone','tsagaannuur']},
 {code:'68',abbr:'УТҮГ',nameMn:'Улсын төсөвт үйлдвэрийн газар'},
 {code:'69',abbr:'ТБАГ',nameMn:'Төрийн байгууллага, албан газар',aliases:['government agency']},
 {code:'71',abbr:'НҮТББ',nameMn:'Холбоо',note:'нийгэмд үйлчилдэг төрийн бус байгууллага',aliases:['ngo','non-governmental','association']},
 {code:'72',abbr:'ГҮТББ',nameMn:'Холбоо',note:'гишүүддээ үйлчилдэг төрийн бус байгууллага',aliases:['ngo','association','membership']},
 {code:'74',abbr:'ҮЭБ',nameMn:'Холбоо',note:'үйлдвэрчний эвлэлийн холбоо',aliases:['trade union']},
 {code:'78',abbr:'ҮЭБ',nameMn:'Холбоо',note:'үйлдвэрчний эвлэлийн хороо',aliases:['trade union']},
];

const norm=(v:string)=>v.toLocaleLowerCase('mn-MN').replace(/[.\s,/()-]+/g,'');
const dupCount=(abbr:string)=>legalForms.filter(f=>f.abbr===abbr).length;
/** True when several official forms share this abbreviation, so a list row must also show the short note and index code. */
export const isAmbiguousAbbr=(abbr:string)=>dupCount(abbr)>1;

export const legalFormByCode=(code:string)=>legalForms.find(f=>f.code===code);

/** Resolves an official index code first, then an abbreviation (first official form with it, e.g. ХХК -> 11). */
export function findLegalForm(value:string){
 const v=(value||'').trim();
 if(!v)return undefined;
 return legalFormByCode(v)??legalForms.find(f=>norm(f.abbr)===norm(v));
}

/** Search by abbreviation, full Mongolian name, note, index code or English alias. Abbreviation matches come first. */
export function searchLegalForms(query:string){
 const q=query.trim().toLocaleLowerCase('mn-MN');
 if(!q)return legalForms;
 const qn=norm(q);
 const words=(t:string)=>t.toLocaleLowerCase('mn-MN').split(/[\s,.()/-]+/).filter(Boolean);
 const rank=(f:LegalForm)=>{
  if(norm(f.abbr)===qn)return 0;
  if(norm(f.abbr).startsWith(qn)||f.code===q)return 1;
  const hay=[f.nameMn,f.note??'',...(f.aliases??[])];
  if(hay.some(t=>words(t).some(w=>w.startsWith(q))||norm(t).includes(qn)))return 2;
  return 9;
 };
 return legalForms.map(f=>[f,rank(f)] as const).filter(([,r])=>r<9).sort((a,b)=>a[1]-b[1]).map(([f])=>f);
}

const bySuffixLength=[...legalForms].sort((a,b)=>b.abbr.length-a.abbr.length);
const endsWithWord=(text:string,abbr:string)=>{
 const t=text.toLocaleLowerCase('mn-MN'),a=abbr.toLocaleLowerCase('mn-MN');
 return t.length>a.length&&t.endsWith(a)&&/[\s,]/.test(t[t.length-a.length-1]);
};
const STORE='mmri.legalForm.';
export const rememberLegalForm=(companyId:string|null|undefined,code:string)=>{try{if(companyId&&code)localStorage.setItem(STORE+companyId,code)}catch{/* storage unavailable */}};

/** Splits a stored company name such as "Өрнөх Маркет ХХК" into name and form. When several official forms share the suffix, the code
    remembered for this company wins; otherwise the first official form with that abbreviation is used. */
export function splitBusinessName(full:string,companyId?:string|null){
 const text=(full||'').trim();
 for(const f of bySuffixLength){
  if(!endsWithWord(text,f.abbr))continue;
  let code=findLegalForm(f.abbr)!.code;
  try{const saved=companyId?localStorage.getItem(STORE+companyId):null;if(saved&&legalFormByCode(saved)?.abbr===f.abbr)code=saved}catch{/* storage unavailable */}
  return{name:text.slice(0,text.length-f.abbr.length).replace(/[\s,]+$/,''),form:code};
 }
 return{name:text,form:''};
}

/** Appends the selected abbreviation exactly once: a name that already ends with it is returned unchanged. */
export function joinBusinessName(name:string,form:string){
 const n=name.trim();
 const abbr=findLegalForm(form)?.abbr??form.trim();
 if(!abbr)return n;
 if(!n)return abbr;
 return endsWithWord(n,abbr)||n.toLocaleLowerCase('mn-MN')===abbr.toLocaleLowerCase('mn-MN')?n:`${n} ${abbr}`;
}
