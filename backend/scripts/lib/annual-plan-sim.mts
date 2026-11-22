/* SIMULATED MODEL (a deterministic TEST DOUBLE, NOT an AI). Used only by tests and the local fake model endpoint. */
import type {AnnualPlanProvider,PlanInput} from '../../src/report/annual-plan.js';
/* ---- SIMULATED MODEL (test double): groups findings into a variable number of stages following dependency hints; wording varies by frame ---- */
const FR=[(t:string,a:string,m:string)=>`${t}: ${a}. Ингэснээр ${m} байдал нэг мөр харагдана.`,(t:string,a:string,m:string)=>`${a}. Явц ${m} зүйлээр хэмжигдэж, удирдлага дараагийн шийдвэрээ үүн дээр үндэслэнэ.`,(t:string,a:string,m:string)=>`Эхлээд ${a.charAt(0).toLowerCase()+a.slice(1)}, дараа нь ${m} зүйлд тулгуурлан үр дүнг дүгнэнэ.`];
const HEADS=['Суурь шийдвэр ба эхний тогтолцоо','Тогтолцоог ажиллуулж эхлэх','Хэмжилтээр баталгаажуулах үе','Дараагийн чухал алхмууд','Багийн чадавхыг бэхжүүлэх','Хэрэгжилтийг бататгах'];
export const sim:AnnualPlanProvider={async generate(input:PlanInput){
 const F=input.findings;const ev=input.evidenceChecks;const hints=input.dependencyHints;const seed=input.weaknesses.reduce((a,w)=>a+(w.score??0),0)+input.domainNameMn.length;
 const order=[...F].sort((a,b)=>{const ha=hints.filter(h=>h.then===a.ref).length,hb=hints.filter(h=>h.then===b.ref).length;return ha-hb||a.priorityBand.localeCompare(b.priorityBand)});
 const size=ev.length?2:hints.length?(seed%2?2:1):(seed%3===0?3:1);const groups:typeof F[]=[];for(let i=0;i<order.length;i+=size)groups.push(order.slice(i,i+size));
 const stages:any[]=[];let day=0,id=1;
 if(ev.length){stages.push({id:`E${id++}`,headingMn:'Мэдээллийг баталгаажуулж суурийг тогтоох',startDay:0,durationDays:42,dependsOnStageIds:[],dependencyNoteMn:null,actions:ev.map(e=>({textMn:`${e.titleMn}: ${e.actionMn}. Үр дүнгээр дараагийн шатны шийдвэр батлагдана.`,recommendationIds:[e.ref]}))});day=42}
 const remaining=330-day;groups.forEach((g,gi)=>{const prev=stages.length?stages[stages.length-1].id:null;const dur=Math.max(28,Math.round(remaining*(g.length+0.6)/(order.length+0.6*groups.length)));
  stages.push({id:`E${id++}`,headingMn:HEADS[(gi+(ev.length?1:0))%HEADS.length],startDay:day,durationDays:dur,dependsOnStageIds:prev?[prev]:[],dependencyNoteMn:prev&&gi%2===1?'Энэ шатны шийдвэр өмнөх шатны үр дүнд тулгуурлана.':null,
   actions:g.map((f,k)=>({textMn:FR[(gi+k+seed)%3](f.titleMn,f.actionMn,f.measureMn.toLowerCase()),recommendationIds:[f.ref]}))});day+=dur});
 const prev=stages[stages.length-1].id;stages.push({id:`E${id++}`,headingMn:'Жилийн дүгнэлт ба дахин хэмжилт',startDay:day,durationDays:365-day,dependsOnStageIds:[prev],dependencyNoteMn:null,actions:[{textMn:'Жилийн туршид хийсэн ажлын үр дүнг удирдлагын хурлаар дүгнэж, шаардлагатай бол дараагийн жилийн чиглэлийг шинэчилнэ.',recommendationIds:[F[0].ref]}]});
 return {draft:{schemaVersion:'MMRI-ANNUAL-PLAN-DRAFT-1.0',stages},provider:{kind:'TEST_DOUBLE' as const,model:'simulated-model-v1'}}}};
