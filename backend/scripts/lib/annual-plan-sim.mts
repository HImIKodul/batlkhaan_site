/* SIMULATED MODEL v2 (a deterministic TEST DOUBLE, NOT an AI). It plays the role the real model is instructed to play (prompt MMRI-ANNUAL-PLAN-PROMPT-2.0) so that input
   construction, validation, scheduling, rendering and caching can be tested offline without paid calls. It writes from capabilityMn + the fix type (interventionCode),
   merges findings that share a fix type, varies stage count and action count with the findings, and keeps information-gap wording to one short action.
   Its Mongolian is a drafted test wording; it says NOTHING about the language quality of a real model. */
import type {AnnualPlanProvider,PlanInput} from '../../src/report/annual-plan.js';
const HOW:Record<string,string>={
 IMPLEMENT:'{c} чиглэлд төлөвлөсөн ажлууд бодитоор хэрэгжиж байгааг сар бүр удирдлагын богино уулзалтаар дүгнэж, саатсан ажил бүрт хариуцагч, шинэ хугацаа тогтооно.',
 CLARIFY_OBJECTIVE:'{c} чиглэлийн зорилгыг хэн ч ижил ойлгохоор нэг хоёр өгүүлбэрээр дахин бичиж, юугаар нь амжилттай гэж үзэхээ удирдлагын багтай тохиролцоно.',
 ALIGN_STRATEGY:'{c} чиглэлийн ажлуудыг компанийн ерөнхий стратегитай зэрэгцүүлэн харж, стратегид нэмэр болохгүй ажлыг зогсоох эсвэл өөрчлөх шийдвэр гаргана.',
 GROUND_IN_MARKET:'{c} чиглэлийн томоохон шийдвэр бүрийг гаргахын өмнө хэрэглэгчдийн санал, борлуулалтын баг болон зах зээлийн мэдээллээс нэг өгүүлбэрийн үндэслэл гаргадаг журам тогтооно.',
 EXPAND_COVERAGE:'{c} чиглэлийн ажлыг одоо хамрагдаагүй хэрэглэгч, нэгж, бүтээгдэхүүнд шат дараатайгаар өргөжүүлэх төлөвлөгөө гаргаж, эхлээд нэг хэсэгт туршина.',
 ASSIGN_OWNER:'{c} чиглэлд нэг хариуцагчийг нэрээр нь томилж, шийдвэр гаргах эрх, тайлагнах давтамжийг нь бичгээр зарлана.',
 SECURE_SPONSORSHIP:'{c} чиглэлийн өөрчлөлтийг удирдлагын түвшинд бодитоор дэмжихийн тулд захирал цаг, нөөц гаргаж, ахицыг улирал бүр өөрөө хянана.',
 DEFINE_DECISION_RIGHTS:'{c} чиглэлд хэн ямар шийдвэрийг гаргадаг, хэн зөвлөдөг, хэн зөвшөөрдөгийг нэг хуудас хүснэгтээр тодорхойлж, холбогдох хүмүүстэй танилцуулна.',
 CLARIFY_ROLES:'{c} чиглэлийн ажил нэг хүнээс нөгөөд шилжих цэг бүрт хэн юуг хүлээлгэж өгөхийг тодорхойлж, алдаатай шилжилтийг багийн уулзалтаар дахин авч үзнэ.',
 IMPROVE_COORDINATION:'{c} чиглэлд хамтран ажилладаг нэгжүүд долоо хоног тутам богино уулзалтаар нийтлэг ажлаа тулгаж, давхардсан болон орхигдсон ажлыг арилгана.',
 SET_GOVERNANCE_CADENCE:'{c} чиглэлийн ахицыг хэзээ, хэн хянан хэлэлцэхийг шийдвэрийн хэмнэлд тохируулан хуваарьлаж, уулзалт бүрийн дараа шийдвэр, хариуцагчаа тэмдэглэнэ.',
 DEFINE_PROCESS:'{c} чиглэлийн гол ажлын алхмуудыг хэн ямар эхлэл, үр дүнтэй хийдгийг зурагт буулгаж, онцгой тохиолдлыг оруулан богино ажлын зааварт тусгана.',
 DOCUMENT_STANDARD:'{c} чиглэлд одоо ашиглаж буй заавар, стандартыг нэг дор нэгтгэж, хоорондоо зөрсөн хэсгийг засан, ажилтан бүрт нээлттэй байлгана.',
 DRIVE_ADOPTION:'{c} чиглэлд нэвтрүүлсэн журам, хэрэгслийг ажилтнууд бодитоор хэрэглэж байгааг ажиглаж, хэрэглээгүй шалтгааныг нь сонсоод багт сургалт, дэмжлэг үзүүлнэ.',
 STABILIZE_EXECUTION:'{c} чиглэлийн гүйцэтгэл ямар үед хэлбэлздэгийг сүүлийн ажлуудаас тодруулж, гол шалтгаан бүрт урьдчилан сэргийлэх нэг энгийн дүрэм гаргана.',
 OPTIMIZE_CADENCE:'{c} чиглэлийн давтан хийдэг ажлуудын давтамжийг бодит хэрэгцээтэй харьцуулж, илүүц уулзалт, тайланг цөөлөөд хэрэгтэй хяналтыг тогтмолжуулна.',
 REDUCE_CYCLE_TIME:'{c} чиглэлийн нэг ажил эхлэхээс дуустал хаана хамгийн удаан саатдагийг тодруулж, хамгийн их саатал үүсгэж буй нэг алхмыг эхлээд хялбарчилна.',
 BALANCE_CAPACITY:'{c} чиглэлд ажилтан, цаг, хэрэгслийн ачаалал хаана хэтэрч, хаана дутаж буйг тодруулж, ажлыг дахин хуваарилах эсвэл тэргүүлэх бус ажлыг хойшлуулна.',
 BUILD_SKILL:'{c} чиглэлийн ажилд дутагдаж буй ур чадварыг нэрлэж, багийн дотроос сургах эсвэл гаднаас туслуулахын аль нь үр дүнтэйг шийдээд нэг ур чадварыг эхэлж хөгжүүлнэ.',
 PROTECT_KNOWLEDGE:'{c} чиглэлийн чухал мэдлэг нэг хүнд л хадгалагдаж буй хэсгийг тодруулж, бичгээр тэмдэглээд хоёр дахь хүнд зааж өгөх хуваарь гаргана.',
 SECURE_RESOURCES:'{c} чиглэлийн ажил зогсохгүй байхад хамгийн наад захын хүн хүч, төсөв, хэрэгслийг тодорхойлж, түүнийг хамгаалсан нөөцийн шийдвэр гаргана.',
 REALLOCATE_RESOURCES:'{c} чиглэлд нөөцийг бага үр дүнтэй ажлаас илүү үр дүнтэй ажилд шилжүүлэх жагсаалт гаргаж, нэг ажлаас эхлэн нөөцийг дахин хуваарилна.',
 STRENGTHEN_CONTROL:'{c} чиглэлийн эрсдэлтэй цэгүүдийг хэн яаж хянахыг тогтоож, шаардлага зөрчигдөхөд юу хийхээ нэг хуудас журмаар баталж, улирал бүр шалгана.',
 CLOSE_TECH_GAP:'{c} чиглэлийн ажлыг хамгийн их удаашруулж буй технологийн саадыг нэрлэж, түүнийг арилгах хамгийн энгийн хувилбарыг сонгон туршина.',
 AUTOMATE_RESPONSIBLY:'{c} чиглэлийн давтагддаг гар ажлаас нэгийг сонгон автоматжуулж, үр дүнг ажилтнуудаар шалгуулсны дараа бусад ажилд өргөжүүлэх эсэхээ шийднэ.',
 IMPROVE_DATA_ACCESS:'{c} чиглэлд шийдвэр гаргагчдад хэрэгтэй мэдээллийг хаанаас, хэн, хэдий хугацаанд авч болохыг тодорхой болгож, хамгийн их хүлээлгэдэг мэдээллийн хандалтыг түрүүлж хөнгөвчилнө.',
 IMPROVE_COMPLETENESS:'{c} чиглэлийн бүртгэлд хамгийн их орхигддог талбарыг тодруулж, бөглөх хүнд нь заавал бөглөх шаардлага, сануулга тогтооно.',
 IMPROVE_DATA_QUALITY:'{c} чиглэлийн гол үзүүлэлтүүдийн тоог эх үүсвэртэй нь жилд хоёр удаа тулгаж, зөрүү гарсан бол засах хүн, хугацааг тогтооно.',
 IMPROVE_FRESHNESS:'{c} чиглэлийн шийдвэрт ашигладаг тоо мэдээ хэр хугацаанд шинэчлэгддэгийг шалгаж, хуучирсан тоогоор шийдвэр гаргахаас сэргийлэх шинэчлэлтийн хуваарь батална.',
 INTEGRATE_DATA:'{c} чиглэлд ашиглаж буй тусдаа бүртгэл, хүснэгтүүдийн хамгийн их зөрдөг хоёрыг холбож, нэг эх үүсвэрийг үндсэн гэж тогтооно.',
 BUILD_ANALYTICS:'{c} чиглэлийн нэг чухал асуултыг сонгож, одоо байгаа тоо мэдээгээр хариулах энгийн шинжилгээг сар бүр гаргадаг болно.',
 DISTRIBUTE_INSIGHT:'{c} чиглэлийн шинжилгээний дүгнэлтийг шийдвэр гаргагчдад ойлгомжтой нэг хуудсаар тогтмол цагт хүргэж, хүлээн авагч бүрээс санал авна.',
 USE_INSIGHT:'{c} чиглэлийн дүгнэлт бүр дээр ямар шийдвэр өөрчилсөн, эсвэл яагаад өөрчлөөгүйг тэмдэглэж, дүгнэлт шийдвэрт нөлөөлж буй эсэхийг улирал бүр харна.',
 DISCIPLINE_EXPERIMENT:'{c} чиглэлд шинэ санааг бүх нэгжид нэвтрүүлэхээс өмнө жижиг хэмжээнд, урьдчилан тохирсон шалгуурын дагуу туршиж, үр дүнгээр нь шийднэ.',
 CLOSE_LEARNING_LOOP:'{c} чиглэлийн ажил дуусах бүрт юу сайн, юу алдаатай болсныг богино хэлэлцүүлгээр гаргаж, нэг сургамжийг дараагийн ажлын журамд оруулна.',
 DEFINE_KPI:'{c} чиглэлийн амжилтыг хэмжих хоёр гурван гол үзүүлэлтийг сонгож, тус бүрийг хэн яаж тооцохыг бичгээр тодорхойлно.',
 ESTABLISH_BASELINE:'{c} чиглэлийн сонгосон үзүүлэлтүүдийн одоогийн түвшинг нэг удаа тооцож тогтоон, цаашдын ахицыг түүнтэй харьцуулдаг болно.',
 SET_TARGET:'{c} чиглэлийн үзүүлэлт бүрт одоогийн түвшинд тулгуурласан хэрэгжихүйц зорилтыг удирдлагын багтай хэлэлцэж тогтооно.',
 SET_MEASUREMENT_CADENCE:'{c} чиглэлийн үзүүлэлтийг хэр олон удаа хэмжихийг шийдвэрийн хэмнэлд тааруулж, хэмжилтийн хуваарьт хариуцагч томилно.',
 IMPROVE_EFFECTIVENESS:'{c} чиглэлийн хамгийн их хөрөнгө, цаг зарцуулдаг ажлын бодит үр дүнг харж, үр дүн муутай ажлыг өөрчлөх эсвэл зогсоох шийдвэр гаргана.',
 TRACK_TREND:'{c} чиглэлийн гол үзүүлэлтийн хандлагыг улирал бүр графикаар харж, тогтвортой муудаж буй бол шалтгааныг нь ажлын хэсэгт хэлэлцүүлнэ.',
 STRENGTHEN_ATTRIBUTION:'{c} чиглэлийн нэг ажлын үр нөлөөг бусад нөлөөллөөс ялган харахын тулд оролцсон ба оролцоогүй хэсгийг харьцуулах энгийн туршилт хийнэ.',
 ESTABLISH_BENCHMARK:'{c} чиглэлийн үзүүлэлтээ ижил төстэй байгууллагын ил мэдээлэлтэй харьцуулж, ойролцоо жишиг олдохгүй бол үүнийг тайландаа ил бичнэ.',
 INTEGRATE_JOURNEY:'{c} чиглэлийн ажил нэгж хоорондоо хэрхэн дамждагийг хэрэглэгчийн замаар нь харж, хамгийн их тасалддаг цэгт нэг холбогч шийдэл гаргана.',
 MANAGE_PARTNER:'{c} чиглэлд хамтран ажилладаг гол түнш бүрээс хүлээх үр дүнг бичиж, тэдний гүйцэтгэлийг улирал бүр хамтдаа хэлэлцэнэ.',
 DESIGN_FOR_SCALE:'{c} чиглэлийн сайн ажилладаг нэг аргыг бусад нэгжид давтан хэрэглэж болохоор ерөнхий дүрэм, загвар болгон тогтооно.',
 BUILD_ADAPTABILITY:'{c} чиглэлд зах зээл, шаардлага өөрчлөгдөхөд ажлаа хэрхэн хурдан тохируулахаа урьдчилан тохирсон богино журамд тусгана.'
};
const FALLBACK='{c} чиглэлд хамгийн сул байгаа талыг ажлын хэсэгтэй нэрлэж, нэг жижиг засварыг туршаад үр дүнгээр нь үргэлжлүүлэх эсэхээ шийднэ.';
const band=(b:string)=>({P1:0,P2:1,P3:2,P4:3} as Record<string,number>)[b]??3;
const q=(names:string[])=>names.map(n=>`«${n}»`).join(' болон ');
const EV_KIND=/EVIDENCE|VALIDATE_CAUSE/;
const HEADS=['Эхний ажлууд','Тогтолцоог ажилд оруулах','Туршсан зүйлээ өргөжүүлэх','Тогтворжуулж, хэмжин дүгнэх','Үр дүнг бэхжүүлж дараагийн алхмаа сонгох'];
export const sim:AnnualPlanProvider={async generate(input:PlanInput){
 const F=input.findings;const win=input.windowDays;const seed=F.reduce((a,f)=>a+(f.currentScore??0),0)+input.domainNameMn.length;
 const actF=F.filter(f=>!EV_KIND.test(f.kind));const evF=F.filter(f=>EV_KIND.test(f.kind));
 const order=[...actF].sort((a,b)=>{const da=input.dependencyHints.filter(h=>h.then===a.ref).length,db=input.dependencyHints.filter(h=>h.then===b.ref).length;return da-db||band(a.priorityBand)-band(b.priorityBand)||a.ref.localeCompare(b.ref)});
 /* one initiative per fix type: findings of different capabilities that call for the same fix are merged */
 const groups:Array<{code:string;refs:string[];caps:string[];group:string}>=[];
 for(const f of order){const g=groups.find(x=>x.code===f.interventionCode);if(g){g.refs.push(f.ref);if(!g.caps.includes(f.capabilityMn))g.caps.push(f.capabilityMn)}else groups.push({code:f.interventionCode,refs:[f.ref],caps:[f.capabilityMn],group:f.dimensionGroupMn||''})}
 const evCaps=[...new Set(evF.map(f=>f.capabilityMn).filter(Boolean))];const gapCaps=[...new Set(input.evidenceChecks.map(v=>v.capabilityMn).filter(Boolean))].filter(c=>!evCaps.includes(c));
 const bodyCount=Math.max(2,Math.min(5,Math.ceil(groups.length/1.4)+(evF.length?1:0)+(seed%2)));
 const per=Math.max(1,Math.ceil(groups.length/Math.max(1,bodyCount-(evF.length?1:0))));
 const stages:any[]=[];let start=0;const firstLen=45+(seed%3)*15;const nBody=bodyCount;let restLen=Math.floor((win-firstLen)/Math.max(1,nBody-1));
 const chunks:any[][]=[];for(let i=0;i<groups.length;i+=per)chunks.push(groups.slice(i,i+per));
 if(evF.length){ /* evidence-type findings: pairs of capabilities, each reviewed in its own way, then a conditional decision about the same pair (one blanket action for everything is rejected by the validator) */
  const pairs:any[][]=[];for(let i=0;i<evF.length;i+=2)pairs.push(evF.slice(i,i+2));const caps=(p:any[])=>q([...new Set(p.map(f=>f.capabilityMn).filter(Boolean))]);const refs=(p:any[])=>p.map(f=>f.ref);
  const REVIEW=['{c} чиглэлийн сүүлийн шийдвэрүүдийг хариуцсан хүмүүстэй эргэн ярилцаж, аль нь бодит ажилд хэрэгжсэнийг ялгана.','{c} талаар захиалагч, үйлчлүүлэгчдээс товч санал асууж, дотоод багийн төсөөлөлтэй зэрэгцүүлнэ.','Нэг төлөөлөх ажлыг сонгож {c} хаана саатдагийг эхнээс нь төгсгөл хүртэл дагаж ажиглана.'];
  const DECIDE=['Ярилцлагаар зөрүү илэрвэл {c} чиглэлд хамгийн түрүүнд өөрчлөх дүрмээ сонгож туршина; зөрүүгүй бол одоогийн журмаа хэвээр үлдээнэ.','Санал асуулгын дүн таамаглалыг үгүйсгэвэл {c} хүрээний дараагийн алхмыг шинэчилж, дэмжвэл өргөжүүлэх бэлтгэлээ эхлүүлнэ.','Ажиглалтаар давтагдах саад гарвал {c} дээр ажиллах дарааллаа цэгцэлж, эс бөгөөс жил бүр ижил аргаар нягталдаг дадал болгоно.'];
  chunks.unshift(pairs.map((p,i)=>({review:true,text:REVIEW[i%3].replace('{c}',caps(p)),refs:refs(p)})));
  pairs.slice(0,2).forEach((p,i)=>chunks.push([{decision:true,text:DECIDE[i%3].replace('{c}',caps(p)),refs:refs(p)}]));if(pairs[2])chunks[chunks.length-1].push({decision:true,text:DECIDE[2].replace('{c}',caps(pairs[2])),refs:refs(pairs[2])});
 }
 if(chunks.length>nBody)restLen=Math.floor((win-30-firstLen)/Math.max(1,Math.min(5,chunks.length)-1));
 for(let s2=0;s2<chunks.length&&s2<5;s2++){
  const chunk=chunks[s2];const dur=s2===0?firstLen:Math.floor(restLen*(s2===chunks.length-1?0.9:1));
  const g0:any=chunk[0];const grp=g0.group?`: ${String(g0.group).toLowerCase()}`:'';
  const heading=s2===0?`${HEADS[0]}${grp}`:s2===1?`${HEADS[1]}${grp}`:HEADS[Math.min(s2,HEADS.length-1)];
  const actions=chunk.map((g:any)=>g.review||g.decision?{textMn:g.text,recommendationIds:g.refs}:{textMn:(HOW[g.code]??FALLBACK).replace('{c}',q(g.caps)),recommendationIds:g.refs});
  if(s2===0&&gapCaps.length)actions.push({textMn:`${q(gapCaps.slice(0,3))} чиглэлд одоогийн байдлыг үнэлэхэд мэдээлэл дутуу байгаа тул эхний сард ажлын хэсэг хуралдаж, юуг тодруулах шаардлагатайг нэг хуудсаар тэмдэглэнэ.`,recommendationIds:input.evidenceChecks.map(v=>v.ref)});
  const prev=stages.length?stages[stages.length-1].id:null;
  stages.push({id:`E${stages.length+1}`,headingMn:heading,startDay:start,durationDays:Math.max(21,dur),dependsOnStageIds:prev?[prev]:[],dependencyNoteMn:prev&&s2%2===1?'Энэ шатны шийдвэр өмнөх шатанд туршсан зүйлийн үр дүнд тулгуурлана.':null,actions:actions.slice(0,5)});
  start+=Math.max(21,dur)-(s2>=1&&(seed%2)?14:0);
 }
 if(stages.length<2)stages.push({id:`E${stages.length+1}`,headingMn:'Шийдвэр гаргах ба тогтворжуулах',startDay:start,durationDays:Math.max(21,Math.floor((win-start)/2)),dependsOnStageIds:[stages[0].id],dependencyNoteMn:'Энэ шатны шийдвэр өмнөх шатны ажлын үр дүнд тулгуурлана.',actions:[{textMn:`${q([...new Set(F.map(f=>f.capabilityMn).filter(Boolean))].slice(0,3))} чиглэлд эхний шатанд хийсэн өөрчлөлтийн үр дүнг багтай хамт харж, хэрэгжиж байгааг үргэлжлүүлж, хэрэгжээгүйг шалтгаантай нь засна.`,recommendationIds:F.map(f=>f.ref).slice(0,3)}]});
 start=stages.reduce((m,s3)=>Math.max(m,s3.startDay+s3.durationDays),0)-(stages.length>2&&seed%2?14:0);
 const allCaps=[...new Set(F.map(f=>f.capabilityMn).filter(Boolean))];const prev=stages[stages.length-1].id;
 stages.push({id:`E${stages.length+1}`,headingMn:'Жилийн дүгнэлт, дараагийн жилийн чиглэл',startDay:Math.min(start,win-30),durationDays:win-Math.min(start,win-30),dependsOnStageIds:[prev],dependencyNoteMn:'Сүүлийн шатны шийдвэр жилийн турш хийсэн ажлын бодит үр дүнд тулгуурлана.',
  actions:[{textMn:`${q(allCaps.slice(0,3))} зэрэг чиглэлд хийсэн ажлыг жилийн төгсгөлд удирдлагын хурлаар дүгнэж, үр дүн гарсан арга хэмжээг тогтмол ажил болгож, үр дүнгүй нь шалтгааныг тодруулан дараагийн жилийн чиглэлээ шийднэ.`,recommendationIds:F.map(f=>f.ref).slice(0,3)}]});
 return {draft:{schemaVersion:'MMRI-ANNUAL-PLAN-DRAFT-1.0',stages},provider:{kind:'TEST_DOUBLE' as const,model:'simulated-model-v2'}}}};
