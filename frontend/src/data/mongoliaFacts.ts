/* Ten verified facts about business and economic activity in Mongolia, shown while pages load.
   Figures were read on 2026-11-04 from the World Bank Open Data API (World Development Indicators, last updated 2026-10-08), the Bank of Mongolia
   home page (mongolbank.mn, policy rate / inflation / reserves, each dated in the fact) and one ADB brief (MSME share). 1212.mn (NSO) was unreachable from this network. Values are rounded to one decimal. "ILO modeled" = ILO modeled estimate. */
export type MongoliaFact={id:string;text:string;figure:string;year:string;source:string;url:string};

export const mongoliaFacts:MongoliaFact[]=[
 {id:'gdp-growth',figure:'5.1%',year:'2024',text:'2024 онд Монголын эдийн засаг 5.1%-иар өссөн нь 2023 оны 7.4%-иас удааширсан үзүүлэлт юм.',source:'Дэлхийн банк, WDI (GDP growth, annual %)',url:'https://data.worldbank.org/indicator/NY.GDP.MKTP.KD.ZG?locations=MN'},
 {id:'exports-gdp',figure:'68.1%',year:'2025',text:'Бараа, үйлчилгээний экспорт 2025 онд ДНБ-ий 68.1%-тай тэнцсэн нь Монголын эдийн засаг гадаад худалдаанаас өндөр хамааралтайг харуулна.',source:'Дэлхийн банк, WDI (Exports of goods and services, % of GDP)',url:'https://data.worldbank.org/indicator/NE.EXP.GNFS.ZS?locations=MN'},
 {id:'fuel-exports',figure:'61.1%',year:'2023',text:'2023 онд бараа экспортын 61.1% нь шатахуун байсан бол 2020 онд энэ нь 30.1% байжээ.',source:'Дэлхийн банк, WDI (Fuel exports, % of merchandise exports)',url:'https://data.worldbank.org/indicator/TX.VAL.FUEL.ZS.UN?locations=MN'},
 {id:'self-employed',figure:'41.2%',year:'2025',text:'Ажил эрхлэгчдийн 41.2% нь өөрөө өөрийгөө ажлаар хангасан буюу хувиараа хөдөлмөр эрхэлдэг (ILO загварчилсан тооцоо).',source:'Дэлхийн банк, WDI (Self-employed, % of total employment)',url:'https://data.worldbank.org/indicator/SL.EMP.SELF.ZS?locations=MN'},
 {id:'new-business',figure:'8.3',year:'2024',text:'2024 онд 15–64 насны 1,000 хүн тутамд 8.3 шинэ компани бүртгэгдсэн нь 2021 оны 6.5-аас өссөн үзүүлэлт юм.',source:'Дэлхийн банк, WDI (New business density per 1,000 people ages 15-64)',url:'https://data.worldbank.org/indicator/IC.BUS.NDNS.ZS?locations=MN'},
 {id:'internet',figure:'85.1%',year:'2024',text:'2024 онд Монголчуудын 85.1% нь интернет ашигласан тул цахим худалдаа, онлайн маркетингийн боломж өргөн байна.',source:'Дэлхийн банк, WDI (Individuals using the Internet, % of population; ITU)',url:'https://data.worldbank.org/indicator/IT.NET.USER.ZS?locations=MN'},
 {id:'msme',figure:'77%',year:'2023',text:'Бичил, жижиг, дунд (БЖД) бизнес нь бүртгэлтэй идэвхтэй аж ахуйн нэгжийн 77%, ажлын байрны ойролцоогоор 70%-ийг бүрдүүлж, ДНБ-ий ойролцоогоор 18%-ийг үйлдвэрлэдэг.',source:'Азийн хөгжлийн банк, ADB Brief No. 266 (2023)',url:'https://www.adb.org/sites/default/files/publication/918036/adb-brief-266-rebuilding-msmes-post-covid19-mongolia.pdf'}, {id:'bom-policy-rate',figure:'12.5%',year:'2026.11.03',text:'Монголбанкны бодлогын хүү 2026 оны 11 дүгээр сарын 3-ны байдлаар 12.5% байна.',source:'Монголбанк, Бодлогын хүү (албан ёсны вэбсайт)',url:'https://www.mongolbank.mn/en/'},
 {id:'bom-inflation',figure:'11.9%',year:'2026.09',text:'2026 оны 9 дүгээр сард инфляци 11.9% байсан бол Монголбанкны зорилтот түвшин 6% юм.',source:'Монголбанк, Инфляци (албан ёсны вэбсайт)',url:'https://www.mongolbank.mn/en/'},
 {id:'bom-reserves',figure:'8,760.8 сая ам.доллар',year:'2026.10',text:'Монгол Улсын гадаад валютын албан нөөц 2026 оны 10 дугаар сард 8,760.8 сая ам.доллар болсон.',source:'Монголбанк, Олон улсын нөөц (албан ёсны вэбсайт)',url:'https://www.mongolbank.mn/en/'},
];

/* Shuffle-bag across the browser session: every fact is shown once before any repeats; the first fact of a new bag never equals the
   last one shown. State lives in sessionStorage so progress carries across loading screens and survives route changes. */
const KEY='mmri.loadingFacts.v1';
type Bag={queue:string[];last:string|null};

export function shuffled<T>(items:T[],random:()=>number=Math.random):T[]{
 const a=items.slice();
 for(let i=a.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}
 return a;
}

export function nextFromBag(bag:Bag,ids:string[],random:()=>number=Math.random):{id:string;bag:Bag}{
 let queue=bag.queue.filter(id=>ids.includes(id));
 if(!queue.length){
  queue=shuffled(ids,random);
  if(ids.length>1&&queue[0]===bag.last){const k=1+Math.floor(random()*(queue.length-1));[queue[0],queue[k]]=[queue[k],queue[0]]}
 }
 const [id,...rest]=queue;
 return {id,bag:{queue:rest,last:id}};
}

function readBag():Bag{
 try{const v=JSON.parse(window.sessionStorage.getItem(KEY)||'null');if(v&&Array.isArray(v.queue))return {queue:v.queue.filter((x:unknown)=>typeof x==='string'),last:typeof v.last==='string'?v.last:null}}catch{/* storage unavailable */}
 return {queue:[],last:null};
}

let memoryBag:Bag|null=null;
export function nextMongoliaFact():MongoliaFact{
 const ids=mongoliaFacts.map(f=>f.id);
 const {id,bag}=nextFromBag(memoryBag??readBag(),ids);
 memoryBag=bag;
 try{window.sessionStorage.setItem(KEY,JSON.stringify(bag))}catch{/* storage unavailable */}
 return mongoliaFacts.find(f=>f.id===id)!;
}
