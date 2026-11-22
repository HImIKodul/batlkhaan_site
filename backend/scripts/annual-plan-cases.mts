/* 15 synthetic diagnosis cases (5 domains x 3 substantially different profiles) through: plan input -> SIMULATED model (a deterministic TEST DOUBLE, NOT an AI) ->
   validator -> deterministic dates -> real PDF renderer. It proves validation, sequencing rules, date arithmetic, fit and page-1/2 invariance. It does NOT prove
   the quality of real AI output. Usage: npx tsx scripts/annual-plan-cases.mts <outDir> */
import fs from 'node:fs';import path from 'node:path';import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {generateAnnualPlan,buildPlanInput,validateAnnualPlanDraft,materializeAnnualPlan,estimatePlanLines,PLAN_LINE_BUDGET,type AnnualPlanProvider,type PlanInput} from '../src/report/annual-plan.js';
import {buildReportPdfSource} from '../src/report/pdf-artifact.js';
const OUT=process.argv[2]||'/tmp/annual-plan-cases';fs.mkdirSync(OUT,{recursive:true});
const PY=process.env.MMRI_PDF_PYTHON_PATH||'python3';const RENDERER=path.resolve('pdf_renderer/render_report_pdf.py');
const sha=(x:any)=>createHash('sha256').update(JSON.stringify(x)).digest('hex');const H=(c:string)=>c.repeat(64);
type F=[weak:string,title:string,action:string,deliver:string,measure:string];
const LIB:Record<string,{name:string;strengths:string[];f:F[]}>={
 marketing:{name:'Маркетинг',strengths:['Тогтвортой үйлчлүүлэгчийн суурь','Ойлгомжтой үнэ цэнийн санал','Гар утасны харилцаа сайн','Борлуулалтын баг идэвхтэй','Брэндийн нэр танигдсан','Үйлчлүүлэгчийн санал хүлээн авдаг'],f:[
  ['Зорилтот зах зээлийн сегмент','Зорилтот сегментээ тодорхойлох','Худалдан авагчдыг хэрэгцээгээр нь бүлэглэж, гол сегментээ сонгох','Сегментийн товч тодорхойлолт','Сегмент бүрийн худалдан авалтын хувь'],
  ['Борлуулалтын сувгийн үр дүн','Сувгийн үр дүнг тогтмол хэмжих','Борлуулалтын суваг бүрийн зардал ба орлогыг сар бүр харьцуулах','Сувгийн харьцуулсан тайлан','Суваг бүрийн нэг худалдан авагчид ногдох зардал'],
  ['Брэндийн мессежийн нэгдмэл байдал','Брэндийн мессежийг нэгтгэх','Бүх сувгаар дамжих үндсэн мессеж, үнэ цэнийн саналыг нэг мөр болгох','Брэндийн мессежийн гарын авлага','Мессежийг зөв ойлгосон худалдан авагчдын хувь'],
  ['Давтан худалдан авалт','Давтан худалдан авалтыг нэмэгдүүлэх','Одоогийн худалдан авагчидтай тогтмол харилцаж, давтан худалдан авалтын санал боловсруулах','Харилцагчийн урамшууллын төлөвлөгөө','Давтан худалдан авагчдын эзлэх хувь'],
  ['Маркетингийн төлөвлөгөө ба төсөв','Маркетингийн жилийн төлөвлөгөө гаргах','Жилийн зорилго, үйл ажиллагаа, хариуцагчийг нэг баримтад нэгтгэх','Маркетингийн жилийн төлөвлөгөө','Төлөвлөгөөний биелэлт'],
  ['Үйлчлүүлэгчийн санал, гомдол','Санал, гомдлыг системтэй авах','Санал гомдол бүртгэх нэг журам тогтоож, сар бүр дүгнэх','Санал гомдлын бүртгэл','Шийдвэрлэсэн саналын хувь'],
  ['Өрсөлдөгчийн мэдээлэл','Өрсөлдөгчөө тогтмол судлах','Гол өрсөлдөгчдийн үнэ, үйлчилгээ, сувгийг улирал бүр жишиж үзэх','Өрсөлдөгчийн жишилтийн тайлан','Жишилтэд хамрагдсан өрсөлдөгчийн тоо'],
  ['Борлуулалтын багийн ур чадвар','Борлуулалтын багийг сургах','Борлуулалтын багийн сул талд тохирсон богино сургалт зохион байгуулах','Сургалтын төлөвлөгөө','Сургалтын дараах борлуулалтын өөрчлөлт']]},
 finance:{name:'Санхүү',strengths:['Орлого зарлагын бүртгэл тогтмол','Татварын тайлан хугацаандаа','Банкны харилцаа тогтвортой','Үндсэн зардлын хяналт','Нягтлан бодогч туршлагатай','Нөөцийн хөрөнгө байдаг'],f:[
  ['Мөнгөн гүйлгээний төлөвлөлт','Мөнгөн гүйлгээний төлөвлөгөө гаргах','Ирэх саруудын орлого, зарлагыг урьдчилан тооцох сар бүрийн төлөвлөгөө бий болгох','Сарын мөнгөн гүйлгээний төлөвлөгөө','Төлөвлөсөн ба бодит гүйлгээний зөрүү'],
  ['Төсөв ба гүйцэтгэл','Төсвийг гүйцэтгэлтэй тулгах','Төсвийн мөр бүрийг бодит зардалтай сар бүр харьцуулж зөрүүг тайлбарлах','Төсвийн гүйцэтгэлийн тайлан','Зөрүү гарсан мөрийн тоо'],
  ['Авлага, өглөгийн удирдлага','Авлагын хугацааг богиносгох','Төлөгдөөгүй авлагыг хугацаагаар нь ангилж, сануулах дараалал тогтоох','Авлагын ангиллын тайлан','Хугацаа хэтэрсэн авлагын хэмжээ'],
  ['Бүтээгдэхүүний ашигт ажиллагаа','Бүтээгдэхүүн бүрийн ашгийг тооцох','Бүтээгдэхүүн, үйлчилгээ тус бүрийн өртөг ба ашгийг тусад нь тооцох','Ашигт ажиллагааны тооцоо','Ашигтай бүтээгдэхүүний эзлэх хувь'],
  ['Санхүүгийн үзүүлэлтийн хяналт','Санхүүгийн гол үзүүлэлтийн самбар','Удирдлага сар бүр хардаг дөрөв таван үзүүлэлтийг нэг хуудсанд нэгтгэх','Санхүүгийн үзүүлэлтийн самбар','Самбар шинэчлэгдсэн сарын тоо'],
  ['Зардлын хяналт','Зардлын хяналтыг сайжруулах','Зардлыг төрлөөр нь ангилж, зөвшөөрлийн дүрэм тогтоох','Зардлын хяналтын журам','Зөвшөөрөлгүй зардлын тоо'],
  ['Санхүүжилтийн эх үүсвэр','Санхүүжилтийн хувилбарыг судлах','Богино, урт хугацааны санхүүжилтийн боломжийг харьцуулан хураангуй гаргах','Санхүүжилтийн хувилбарын харьцуулалт','Харьцуулсан хувилбарын тоо'],
  ['Санхүүгийн эрсдэлийн менежмент','Санхүүгийн эрсдэлийг бүртгэх','Валют, зээл, үнийн өөрчлөлтийн эрсдэлийг жагсааж хариу арга хэмжээ тодорхойлох','Эрсдэлийн бүртгэл','Хяналтад орсон эрсдэлийн тоо']]},
 people:{name:'Хүний нөөц',strengths:['Багийн гишүүд зорилгоо ойлгодог','Ажилтны хоорондын хамтын ажиллагаа','Удирдлагад нээлттэй харилцаа','Ажилтны тогтвор сайн','Шинэ санааг дэмждэг','Ажлын орчин эмх цэгцтэй'],f:[
  ['Ажлын байрны тодорхойлолт','Ажлын байрны тодорхойлолт шинэчлэх','Албан тушаал бүрийн үүрэг, хариуцлага, шаардлагыг бичгээр тодорхойлох','Ажлын байрны тодорхойлолтууд','Шинэчлэгдсэн ажлын байрны хувь'],
  ['Гүйцэтгэлийн үнэлгээ','Гүйцэтгэлийн үнэлгээ нэвтрүүлэх','Ажилтан бүрийн зорилго, үнэлгээний нэг энгийн загвар бий болгож хагас жил тутам үнэлэх','Гүйцэтгэлийн үнэлгээний загвар','Үнэлгээнд хамрагдсан ажилтны хувь'],
  ['Шинэ ажилтны дадлагажуулалт','Шинэ ажилтныг дадлагажуулах','Шинэ ажилтны эхний саруудад чиглэсэн дадлагажуулалтын хөтөлбөр боловсруулах','Дадлагажуулалтын хөтөлбөр','Дадлагажуулалтыг амжилттай дуусгасан хүний хувь'],
  ['Гол албан тушаалын залгамж халаа','Залгамж халааны төлөвлөгөө гаргах','Гол албан тушаал бүрт орлон гүйцэтгэх боломжит хүнийг тодорхойлж бэлтгэх','Залгамж халааны төлөвлөгөө','Орлон гүйцэтгэгчтэй албан тушаалын тоо'],
  ['Ажилтны сэтгэл ханамж','Ажилтны сэтгэл ханамжийг судлах','Ажилтнуудаас нэргүй санал асуулга авч үр дүнг хамт олонтой хуваалцах','Сэтгэл ханамжийн судалгааны тайлан','Асуулгад оролцсон ажилтны хувь'],
  ['Сургалт хөгжүүлэлт','Сургалтын жилийн төлөвлөгөө гаргах','Ажилтан бүрийн хөгжлийн хэрэгцээг тодорхойлж сургалтын төлөвлөгөө гаргах','Сургалтын жилийн төлөвлөгөө','Төлөвлөгөөний дагуу хийсэн сургалтын тоо'],
  ['Урамшуулал, цалингийн тогтолцоо','Урамшууллын тогтолцоог тодорхой болгох','Цалин, нэмэгдэл, урамшууллын зарчмыг бичгээр тогтоож ажилтанд танилцуулах','Урамшууллын журам','Журамд танилцсан ажилтны хувь'],
  ['Ажилтны гарц','Ажилтны гарцын шалтгааныг тогтоох','Ажлаас гарсан хүмүүстэй ярилцлага хийж гол шалтгааныг бүртгэх','Гарцын шалтгааны дүгнэлт','Нэг жилд гарсан ажилтны хувь']]},
 it:{name:'Мэдээллийн технологи',strengths:['Өдөр тутмын программууд ашиглагддаг','Интернет холболт найдвартай','Компьютерийн парк шинэхэн','Ажилтнууд цахим хэрэгсэлд дассан','Цахим шуудангийн нэгдсэн систем','Мэдээллийн ажилтантай'],f:[
  ['Мэдээллийн нөөцлөлт','Мэдээллийн нөөцлөлтийг тогтмолжуулах','Чухал мэдээллийг өдөр, долоо хоног тутам нөөцөлж сэргээх шалгалт хийх','Нөөцлөлтийн журам','Амжилттай сэргээсэн шалгалтын тоо'],
  ['Хандалтын эрхийн удирдлага','Хандалтын эрхийг шинэчлэх','Ажилтан бүрийн системийн эрхийг албан тушаалтай нь тулгаж, илүүдлийг хасах','Хандалтын эрхийн жагсаалт','Илүү эрхтэй хэрэглэгчийн тоо'],
  ['Системүүдийн нэгдэл','Тусдаа системүүдийг нэгтгэх','Давхардсан мэдээлэл хадгалдаг системүүдийг жагсааж нэгтгэх дараалал тогтоох','Системийн нэгтгэлийн төлөвлөгөө','Давхардсан мэдээллийн хэмжээ'],
  ['Давтагддаг ажлын автоматжуулалт','Давтагддаг ажлыг автоматжуулах','Хамгийн их цаг авдаг гурван давтагддаг ажлыг сонгон автоматжуулах','Автоматжуулсан ажлын жагсаалт','Хэмнэсэн ажлын цаг'],
  ['Аюулгүй байдлын сургалт','Ажилтны аюулгүй байдлын мэдлэгийг дээшлүүлэх','Нууц үг, хуурамч имэйлээс сэргийлэх богино сургалт зохион байгуулах','Сургалтын материал','Сургалтад хамрагдсан ажилтны хувь'],
  ['Мэдээллийн эрсдэлийн хяналт','Мэдээллийн эрсдэлийг үнэлэх','Чухал систем бүрийн эмзэг талыг жагсаан арилгах дарааллыг тогтоох','Эрсдэлийн үнэлгээний тайлан','Арилгасан эмзэг талын тоо'],
  ['Техник хангамжийн хяналт','Техник хангамжийн бүртгэл хөтлөх','Компьютер, сүлжээний төхөөрөмж бүрийн насжилт, байдлыг бүртгэх','Техник хангамжийн бүртгэл','Бүртгэгдсэн төхөөрөмжийн хувь'],
  ['Мэдээллийн технологийн төлөвлөгөө','Мэдээллийн технологийн жилийн төлөвлөгөө','Бизнесийн зорилгод нийцсэн технологийн хөрөнгө оруулалтыг дараалалд оруулах','Технологийн жилийн төлөвлөгөө','Төлөвлөгөөний биелэлт']]},
 operations:{name:'Үйлдвэрлэл, үйл ажиллагаа',strengths:['Гол үйл ажиллагааны дараалал тогтсон','Нийлүүлэгчийн сүлжээтэй','Туршлагатай ажилтнууд','Тоног төхөөрөмж ажиллагаатай','Захиалгыг хугацаанд нь авдаг','Ажлын байрны аюулгүй байдал'],f:[
  ['Үндсэн процессын бичиг баримт','Үндсэн процессыг бичгээр тогтоох','Захиалга авахаас хүргэх хүртэлх үндсэн алхмуудыг зураглаж хариуцагчийг нэрлэх','Процессын зураглал','Бичигдсэн процессын тоо'],
  ['Чанарын хяналт','Чанарын шалгалтын жагсаалт гаргах','Бүтээгдэхүүн бүрийн гарцын шалгалтын жагсаалт боловсруулж мөрдөх','Чанарын шалгалтын жагсаалт','Буцаагдсан бүтээгдэхүүний хувь'],
  ['Нөөцийн хяналт','Нөөцийн түвшнийг хянах','Гол түүхий эд, бараа бүрийн доод нөөцийн хэмжээг тогтоож тогтмол тооллого хийх','Нөөцийн хяналтын журам','Нөөц дууссан тохиолдлын тоо'],
  ['Нийлүүлэгчийн үнэлгээ','Нийлүүлэгчдийг үнэлэх','Нийлүүлэгч бүрийн хугацаа, чанар, үнийг жилд хоёр удаа үнэлэх','Нийлүүлэгчийн үнэлгээний хуудас','Үнэлэгдсэн нийлүүлэгчийн хувь'],
  ['Захиалгын биелэлтийн хугацаа','Захиалгын хугацааг хэмжих','Захиалга бүрийн хүлээн авсан ба хүргэсэн хугацааг бүртгэж хоцролтын шалтгааныг дүгнэх','Захиалгын хугацааны тайлан','Хугацаандаа биелсэн захиалгын хувь'],
  ['Хүчин чадлын төлөвлөлт','Хүчин чадлаа тооцох','Тоног төхөөрөмж, ажиллах хүчний боломжит хүчин чадлыг улирлаар тооцох','Хүчин чадлын тооцоо','Ашиглагдаж буй хүчин чадлын хувь'],
  ['Алдааны бүртгэл','Алдааны бүртгэл хөтлөх','Үйл ажиллагааны алдаа, гаргасан шалтгааныг нэг бүртгэлд хураах','Алдааны бүртгэл','Давтагдсан алдааны тоо'],
  ['Тоног төхөөрөмжийн засвар','Урьдчилсан засвар үйлчилгээ нэвтрүүлэх','Гол тоног төхөөрөмж бүрийн засвар үйлчилгээний хуваарь тогтоох','Засвар үйлчилгээний хуваарь','Төлөвлөөгүй зогсолтын тоо']]}};
const PROFILES=[
 {id:'A',label:'суурь тогтолцоо дутуу',pick:[0,1,2,3,4],scores:[22,28,31,36,40],chain:[] as number[][],cover:.94,evidence:0,date:'2026-11-20T00:00:00.000Z'},
 {id:'B',label:'хэрэгсэлтэй, удирдлага сул',pick:[2,3,5,6,7],scores:[41,45,48,52,55],chain:[[0,1],[1,2]],cover:.9,evidence:0,date:'2027-03-01T00:00:00.000Z'},
 {id:'C',label:'мэдээлэл дутмал, тодорхойгүй хариулт их',pick:[1,4,5,6,0],scores:[33,38,44,47,50],chain:[[0,2]],cover:.52,evidence:2,date:'2028-02-29T00:00:00.000Z'}];
function makePayload(domain:string,pr:typeof PROFILES[number],caseNo:number){
 const L=LIB[domain];const sel=pr.pick.map((i,k)=>({f:L.f[i],score:pr.scores[k],k}));
 const strengths=L.strengths.slice(0,5).map((n,i)=>({id:`STR-${i+1}`,categoryId:`S${i+1}`,nameMn:n,score:88-i*2,confidence:.9,coverage:.95,sourceTraceIds:[`category:S${i+1}`,`strength:STR-${i+1}`]}));
 const weaknesses=sel.map(({f,score},i)=>({id:`WEAK-${i+1}`,categoryId:`W${i+1}`,nameMn:f[0],score,confidence:.9,coverage:pr.cover,severity:.4,sourceTraceIds:[`category:W${i+1}`,`weakness:WEAK-${i+1}`]}));
 const mk=(i:number,type:string)=>({id:`${type==='EXECUTION'?'REC':'EVD'}-${i+1}`,findingId:`ROOT-${i+1}`,categoryId:`W${i+1}`,cellId:'C02',type,interventionCode:`INT-${i+1}`,titleMn:sel[i]?.f[1]??'Мэдээлэл баталгаажуулах',objectiveMn:'Зорилго',actionMn:sel[i]?.f[2]??'Мэдээлэл баталгаажуулах',deliverableMn:sel[i]?.f[3]??'Баталгаажсан мэдээлэл',kpiMn:sel[i]?.f[4]??'Баталгаажуулсан хариултын тоо',ownerRoleId:'R01',sponsorRoleId:'R01',currentCellScore:sel[i]?.score??40,targetCellScore:75,effort:1,impact:1,urgency:1,evidenceReadiness:1,dependencyReadiness:1,priorityBand:i<2?'P1':'P2',priority:90-i,components:{},sourceTraceIds:[`recommendation:${type}-${i+1}`,`root:ROOT-${i+1}`]});
 const actions=sel.map((_,i)=>mk(i,'EXECUTION'));
 const evidence=Array.from({length:pr.evidence},(_,i)=>({...mk(i,'COLLECT_EVIDENCE'),id:`EVD-${i+1}`,titleMn:i===0?'Тодорхойгүй хариултуудыг баталгаажуулах':'Дутуу мэдээллийг нөхөх',actionMn:i===0?'Мэдэхгүй гэж хариулсан асуултуудын бодит мэдээллийг эзэмшигчээс нь авах':'Тайлан, бүртгэлээс дутуу мэдээллийг цуглуулах'}));
 const rootFindings=pr.chain.map(([a,b])=>({id:`ROOT-${a+1}`,categoryId:`W${a+1}`,downstreamCategoryIds:[`W${b+1}`]}));
 let payload:any={payloadVersion:'MMRI-REPORT-PAYLOAD-1.3',payloadHash:'',diagnosisResultHash:H('d'),strategyHash:H('s'),planHash:H('p'),bindingHash:H('b'),reportId:`RPT-ASS-case${caseNo}-V4`,reportContractVersion:'1.0',findingsPolicyVersion:'MMRI-REPORT-FINDINGS-1.0-FIVE-CATEGORY',traceVersion:'MMRI-TRACE-1.0',versionBundleId:'bundle-1',versionBundleHash:H('v'),sourceSnapshotId:'snap-1',sourceSnapshotHash:H('n'),assessmentId:`ASS-case${caseNo}`,assessmentMode:'FULL',assessmentStatus:'COMPLETED',routingState:'FULL_COMPLETE',generatedAt:pr.date,companyName:`${L.name} кейс ${caseNo} ХХК`,methodologyVersion:'3.0.4',metricType:'OFFICIAL_OVERALL_SCORE',overall:{score:Math.round(pr.scores.reduce((a,b)=>a+b,0)/5+18),confidence:pr.cover>.8?.9:.55,coverage:pr.cover,band:'Дунд түвшин'},purposes:[],strengths,weaknesses,rootFindings:[],priorityActions:actions,evidenceActions:evidence,roadmap:[{horizon:'H0',nameMn:'Эхний 14 хоног',dayStart:0,dayEnd:14,milestones:actions.slice(0,2).map((a,i)=>({milestoneId:`MS-${i+1}`,recommendationId:a.id,titleMn:a.titleMn,milestoneMn:`Эхний алхам ${i+1}`,deliverableMn:a.deliverableMn,ownerRoleId:'R01',ownerRoleLabelMn:'Хариуцсан удирдлага',kpiMn:a.kpiMn,sourceTraceIds:[`milestone:MS-${i+1}`,`recommendation:${a.id}`]}))}],risks:[],remeasurement:{horizon:'H2',labelMn:'Дахин хэмжилт'},requiredWarnings:[],displayDictionary:{R01:'Хариуцсан удирдлага'},traceIndex:{},versions:{methodology:'3.0.4',scoring:'1',confidence:'1',rootCause:'1',recommendation:'1',actionPlan:'1',report:'1',aiGeneration:'1'}};
 payload.payloadHash=sha({...payload,payloadHash:''});
 const narrative:any={schemaVersion:'MMRI-NARRATIVE-DRAFT-1.0',payloadHash:payload.payloadHash,sections:[{id:'S04',titleMn:'Давуу тал',claims:strengths.map((s,i)=>({reportClaimId:`S4-${i}`,claimType:'STRENGTH',textMn:`${s.nameMn} нь тогтвортой байна.`,sourceTraceIds:s.sourceTraceIds}))},{id:'S05',titleMn:'Сул тал',claims:weaknesses.map((w,i)=>({reportClaimId:`S5-${i}`,claimType:'WEAKNESS',textMn:`${w.nameMn} бэхжүүлэх шаардлагатай.`,sourceTraceIds:w.sourceTraceIds}))},{id:'S06',titleMn:'Ажил',claims:actions.map((a,i)=>({reportClaimId:`S6-${i}`,claimType:'RECOMMENDATION',textMn:`${a.titleMn}. ${a.actionMn}.`,sourceTraceIds:a.sourceTraceIds,recommendationId:a.id}))},{id:'S10',titleMn:'Ерөнхий дүгнэлт',claims:[{reportClaimId:'S10-1',claimType:'RECOMMENDATION',textMn:'Байгууллагын үндсэн ажиллагаа тогтвортой боловч хэмжилт, хариуцлага, хэрэгжилтийн сахилга батыг бэхжүүлэх шаардлагатай байна.',sourceTraceIds:['assessment:ASS-case'],recommendationId:'REC-1'}]}]};
 return {payload,narrative,planPayload:{...payload,rootFindings}};
}
import {sim} from './lib/annual-plan-sim.mts';
import {createAnnualPlanProviderFromEnv} from '../src/api/ai-report-provider.js';
/* PROVIDER SELECTION. Default: the deterministic TEST DOUBLE (not an AI). MMRI_PLAN_PROVIDER=live uses the REAL model and is CHARGEABLE (one call per case, plus at most one repair call): it refuses to run unless
   MMRI_ALLOW_CHARGEABLE_AI=YES is set by the owner, and prints the maximum number of calls first. Live results are labelled provider.kind=OPENAI and must be reviewed by a human; schema-valid is not the same as good advice. */
const LIVE=(process.env.MMRI_PLAN_PROVIDER??'sim')==='live';
if(LIVE&&process.env.MMRI_ALLOW_CHARGEABLE_AI!=='YES'){console.log('BLOCKED: live AI plans are chargeable. Set MMRI_ALLOW_CHARGEABLE_AI=YES (and MMRI_AI_REPORT_MODEL, OPENAI_API_KEY in the environment) to run. Up to 30 model calls for the 15 cases (set MMRI_PLAN_CASE_FILTER to a regex such as ^finance-A$ to run ONE case, at most 2 calls). Nothing was sent.');process.exit(3)}
if(LIVE){process.env.MMRI_AI_ANNUAL_PLAN='on';console.log('LIVE MODE: up to 30 chargeable model calls (15 cases x generate+repair)')}
/* LIVE-call safety net: at most MMRI_LIVE_MAX_CALLS (default 2) requests to api.openai.com are allowed in this process, and every call's status, model, token usage, latency and raw model output are recorded to <out>/live-usage.json (never headers or keys). */
const liveCalls:any[]=[];
if(LIVE){const realFetch=globalThis.fetch;const MAXC=Math.max(1,Number(process.env.MMRI_LIVE_MAX_CALLS??2));
 globalThis.fetch=(async(input:any,init?:any)=>{const url=String(typeof input==='string'?input:input?.url??input);if(!/api\.openai\.com/.test(url))return realFetch(input,init);
  if(liveCalls.length>=MAXC)throw new Error(`live call budget exhausted (${MAXC} calls)`);
  const t0=Date.now();const entry:any={n:liveCalls.length+1,url:url.replace(/\?.*/,''),requestMaxOutputTokens:undefined};liveCalls.push(entry);
  try{const b=JSON.parse(String(init?.body??'{}'));entry.requestModel=b.model;entry.requestMaxOutputTokens=b.max_output_tokens;entry.requestChars=String(init?.body??'').length;entry.requestBody=b}catch{}
  const res=await realFetch(input,init);entry.status=res.status;entry.ms=Date.now()-t0;
  try{const j=await res.clone().json();entry.responseModel=j.model;entry.usage=j.usage;entry.incomplete=j.incomplete_details;entry.error=j.error?{code:j.error.code,type:j.error.type,message:String(j.error.message).slice(0,200)}:undefined;entry.outputText=(j.output||[]).flatMap((o:any)=>o.content||[]).map((c:any)=>c.text).filter(Boolean).join('')}catch{}
  return res}) as any}
if(LIVE)process.on('exit',()=>{try{fs.writeFileSync(path.join(OUT,'live-usage.json'),JSON.stringify({calls:liveCalls},null,1))}catch{}});
const planProvider:any=LIVE?createAnnualPlanProviderFromEnv('development'):sim;
const pageText=(pdf:string,f:number,l:number)=>execFileSync('pdftotext',['-f',String(f),'-l',String(l),'-layout',pdf,'-'],{encoding:'utf8'});
const pages=(pdf:string)=>Number(/Pages:\s+(\d+)/.exec(execFileSync('pdfinfo',[pdf],{encoding:'utf8'}))![1]);
function render(source:any,domain:string,out:string){const inp=out+'.json';fs.writeFileSync(inp,JSON.stringify({...source,render:{domainCode:domain}}));execFileSync(PY,[RENDERER,'--input',inp,'--output',out],{stdio:['ignore','ignore','pipe']});fs.unlinkSync(inp)}
function bboxOk(pdf:string){const x=execFileSync('pdftotext',['-f','3','-l','3','-bbox',pdf,'-'],{encoding:'utf8'});let n=0,minX=1e9,maxX=0,maxY=0;for(const m of x.matchAll(/xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)"/g)){const yMin=+m[2],yMax=+m[4];if(yMin<62||yMin>800)continue;n++;minX=Math.min(minX,+m[1]);maxX=Math.max(maxX,+m[3]);maxY=Math.max(maxY,yMax)}return {ok:n>0&&minX>=38&&maxX<=560&&maxY<=800,words:n,minX:Math.round(minX),maxX:Math.round(maxX),maxY:Math.round(maxY)}}
const results:any[]=[];let caseNo=0;const sizes=new Set<string>();
const CASE_FILTER=process.env.MMRI_PLAN_CASE_FILTER?new RegExp(process.env.MMRI_PLAN_CASE_FILTER):null;   // e.g. ^finance-A$ : run ONE case (live testing under a budget)
for(const domain of Object.keys(LIB))for(const pr of PROFILES){caseNo++;
 if(CASE_FILTER&&!CASE_FILTER.test(`${domain}-${pr.id}`))continue;
 const {payload,narrative,planPayload}=makePayload(domain,pr,caseNo);
 const plan=await generateAnnualPlan(planPayload as any,LIB[domain].name,planProvider);
 const base=path.join(OUT,`case${String(caseNo).padStart(2,'0')}-${domain}-${pr.id}`);
 const row:any={case:caseNo,domain,profile:pr.id,label:pr.label,generatedAt:pr.date,state:plan.state};
 if(plan.state!=='READY'){row.reason=(plan as any).reason;results.push(row);continue}
 row.stages=plan.stages.length;row.actions=plan.stages.map(s=>s.actions.length);row.lineEstimate=plan.lineEstimate;row.period=plan.periodLabel;row.stageDurations=plan.stages.map(s=>s.endDay-s.startDay+1);sizes.add(`${row.stages}:${row.actions.join('')}`);
 const refsCovered=new Set(plan.stages.flatMap(s=>s.actions.flatMap(a=>a.recommendationIds)));row.coverage=planPayload.priorityActions.every((a:any,i:number)=>refsCovered.has(`F${i+1}`));
 const before=buildReportPdfSource(payload,narrative);const after=buildReportPdfSource(payload,{...narrative,annualPlan:plan});
 if(caseNo===1)fs.writeFileSync(base+'-source.json',JSON.stringify({...after,render:{domainCode:domain}}));render(before,domain,base+'-before.pdf');render(after,domain,base+'-after.pdf');
 row.pagesBefore=pages(base+'-before.pdf');row.pagesAfter=pages(base+'-after.pdf');
 row.page12Identical=pageText(base+'-before.pdf',1,2)===pageText(base+'-after.pdf',1,2);
 const p3=execFileSync('pdftotext',['-f','3','-l','3',base+'-after.pdf','-'],{encoding:'utf8'}).replace(/\s+/g,' ');row.page3HasAllStages=plan.stages.every(s=>s.dateLabel.split(' - ').every(d=>p3.includes(d))&&p3.includes(s.headingMn.split(' ').slice(-2).join(' '))&&s.actions.every(a=>p3.includes(a.textMn.split(' ').slice(-2).join(' '))));
 row.noLatinOrCodes=!/[A-Za-z]/.test(p3.replace(/BusinessMRI\.mn/g,''));row.bbox=bboxOk(base+'-after.pdf');
 row.sourceHashChanged=sha(before)!==sha(after);results.push(row);
}
const nums=results.filter(r=>r.state==='READY');
const summary={cases:results.length,ready:nums.length,allThreePages:nums.every(r=>r.pagesAfter===3&&r.pagesBefore===3),allPages12Identical:nums.every(r=>r.page12Identical),allCovered:nums.every(r=>r.coverage),allStagesOnPage:nums.every(r=>r.page3HasAllStages),noLatin:nums.every(r=>r.noLatinOrCodes),allInsideMargins:nums.every(r=>r.bbox.ok),distinctStageActionShapes:sizes.size,stageCounts:[...new Set(nums.map(r=>r.stages))].sort(),maxLineEstimate:Math.max(...nums.map(r=>r.lineEstimate)),lineBudget:PLAN_LINE_BUDGET};
fs.writeFileSync(path.join(OUT,'cases-results.json'),JSON.stringify({summary,results},null,1));
console.log(JSON.stringify(summary));for(const r of results)console.log(JSON.stringify({case:r.case,d:r.domain,p:r.profile,state:r.state,stages:r.stages,actions:r.actions?.join(''),lines:r.lineEstimate,pg:`${r.pagesBefore}->${r.pagesAfter}`,p12:r.page12Identical,all:r.page3HasAllStages,box:r.bbox?.ok,reason:r.reason}));
if(LIVE){fs.writeFileSync(path.join(OUT,'live-usage.json'),JSON.stringify({calls:liveCalls},null,1));console.log('LIVE CALLS',liveCalls.length,JSON.stringify(liveCalls.map(c=>({n:c.n,status:c.status,model:c.responseModel,usage:c.usage,ms:c.ms,err:c.error}))))}
