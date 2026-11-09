import React,{useEffect,useMemo,useState} from 'react';
import { AppShell,PageContainer,go } from '../components/AppShell';
import { Button } from '../components/UI';
import { Icon } from '../components/Icon';
import { EmptyState,ErrorState,LoadingState } from '../components/ApiState';
import { DemoNotice } from '../components/DemoNotice';
import { AssessmentInline } from '../components/AssessmentInline';
import { api,resolveBoundAssessmentId,session } from '../api/client';
import type { AssessmentProgress,AssessmentSummary,CategoryResult,DiagnosisStrength,DiagnosisWeakCell,ModuleResult,OutcomePriorityResult,PurposeResult,ResultsPayload,RootFinding } from '../api/types';
import { displayScore,isTerminal,pct01 } from '../api/types';
import { demoModules } from '../data/demo';
import { mnText, rootClassMn } from '../content/mongolian';
import { basicInfoQuestions } from '../data/basicInfoQuestions';
import { businessAreaById,type BusinessAreaId } from '../data/businessEvaluation';
import { isTestBusiness,REPORT_AREA_KEY,TEST_ANSWERS_PREFIX,TEST_AREA_KEY,TEST_PROGRESS_PREFIX,testQuestionSets } from '../data/experience';
import type { TestQuestion } from '../data/domainQuestionSamples';
import { isNeutralAnswer,buildDemoAnswerLayout,answerToneAtQuality } from '../data/answerTone';

const CANONICAL_SCHEMA='MMRI-DIAGNOSIS-RESULT-1.0' as const;
const fmt=(n:number|null|undefined)=>n==null?'-':String(Math.round(n));
const pct=(n:number|null|undefined)=>n==null?'-':`${Math.round(n*100)}%`;
const clamp=(n:number|null|undefined)=>Math.max(0,Math.min(100,n??0));
const band=(n:number|null)=>n==null?'Үнэлгээ бүрдээгүй':n>=80?'Төлөвшсөн':n>=65?'Тогтвортой':n>=50?'Хөгжүүлэх':'Сайжруулах шаардлагатай';
const reliabilityLabel=(n:number|null)=>n==null?'-':n>=80?'Өндөр':n>=65?'Хангалттай':n>=50?'Хязгаарлагдмал':'Нэмэлт мэдээлэл шаардлагатай';
const metricLabel=(d:ResultsPayload|null)=>d?.metricType==='OFFICIAL_OVERALL_SCORE'?'Албан ёсны үнэлгээ':d?.metricType==='REVIEW_REQUIRED_SCORE'?'Нягтлах шаардлагатай урьдчилсан үнэлгээ':d?.metricType==='QUICK_ESTIMATE'?'Урьдчилсан үнэлгээ':'Хэсэгчилсэн үнэлгээ';
const isProvisionalResult=(d:ResultsPayload|null)=>d?.metricType!=='OFFICIAL_OVERALL_SCORE';
const rankCapabilities=(items:CategoryResult[])=>items.filter(c=>displayScore(c)!==null&&!c.confirmedNotApplicable).sort((a,b)=>(displayScore(b)??0)-(displayScore(a)??0));
const capabilitiesOf=(d:ResultsPayload|null)=>d?.capabilities??d?.categories??[];
const outcomesOf=(d:ResultsPayload|null)=>d?.businessOutcomes??d?.purposes??[];
const prioritiesOf=(d:ResultsPayload|null)=>d?.businessOutcomePriorities??d?.outcomePriorities??[];
const scoreStatement=(n:number|null)=>n==null?'Оношилгооны үнэлгээ бүрдээгүй байна.':n>=80?'Тухайн чиглэлийн удирдлагын тогтолцоо өндөр төлөвшилтэй байна. Дараагийн анхаарал нь тогтвортой ахиц, нарийвчилсан сайжруулалт байна.':n>=65?'Тухайн чиглэлийн суурь тогтолцоо ажиллаж байгаа боловч хэд хэдэн сул чадавх нийт гүйцэтгэлийг хязгаарлаж байна.':n>=50?'Тухайн чиглэлийн тогтолцоо хэсэгчлэн ажиллаж байгаа бөгөөд удирдлага, хэмжилт, хэрэгжилтийн жигд байдлыг бэхжүүлэх шаардлагатай байна.':'Тухайн чиглэлийн суурь тогтолцоонд олон сул хэсэг байгаа тул хамгийн өндөр ач холбогдолтой асуудлуудыг дарааллаар бэхжүүлэх шаардлагатай байна.';
const rootCauseLabel=(value:string)=>rootClassMn(value);

function ResultHeader({overall,coverage,confidence,statusText,answered,contradictions,result}:{overall:number|null;coverage:number|null;confidence:number|null;statusText:string;answered?:number;contradictions?:number;result:ResultsPayload|null}){
 return <section className="result-document-head">
  <div className="result-score-block"><span>{metricLabel(result)}</span><div><strong>{fmt(overall)}</strong></div><p>{result?.overall.band||band(overall)}</p></div>
  <dl className="result-meta">
   <div><dt>Мэдээллийн хамралт</dt><dd>{coverage==null?'-':`${coverage}%`}</dd></div>
   <div><dt>Үнэлгээний найдвартай байдал</dt><dd>{reliabilityLabel(confidence)}</dd></div>
   <div><dt>Оношилгооны төлөв</dt><dd>{statusText}</dd></div>
   <div><dt>Бүртгэгдсэн хариулт</dt><dd>{answered??'-'}</dd></div>
  </dl>
  {contradictions? <p className="result-review-note"><strong>{contradictions}</strong> зөрүүтэй нотолгоо нягтруулах шаардлагатай.</p>:null}
 </section>
}

function ExecutiveSummary({overall,data}:{overall:number|null;data:ResultsPayload|null}){
 const strongest=data?.strengths?.items?.[0];
 const weakest=data?.weaknesses?.items?.[0];
 const provisional=isProvisionalResult(data);
 const label=(x:DiagnosisStrength|undefined,validated:string,relative:string)=>x?.basis==='RELATIVE_RANK'?relative:validated;
 return <section className="result-executive-summary">
  <div className="result-section-label">Удирдлагын дүгнэлт</div>
  <h2>{provisional?`Урьдчилсан тайлбар: ${scoreStatement(overall)}`:scoreStatement(overall)}</h2>
  <div className="result-summary-facts">
   <p><span>{label(strongest,'Баталгаажсан давуу тал','Хамгийн өндөр оноотой чадавх (урьдчилсан)')}</span><strong>{strongest?.capabilityNameMn??'-'}</strong><small>{strongest?fmt(strongest.score):'-'}</small></p>
   <p><span>{label(weakest,'Баталгаажсан сул тал','Хамгийн бага оноотой чадавх (урьдчилсан)')}</span><strong>{weakest?.capabilityNameMn??'-'}</strong><small>{weakest?fmt(weakest.score):'-'}</small></p>
  </div>
 </section>
}

const PRELIM_NOTE='Урьдчилсан гэж тэмдэглэсэн чадавхыг одоогийн хариултын бодит оноогоор эрэмбэлсэн бөгөөд нэмэлт нотолгоо бүрдэх тусам баталгаажна.';
function CapabilityFindings({title,items,empty,kind}:{title:string;items:DiagnosisStrength[];empty:string;kind:'strength'|'weakness'}){
 const visible=items.slice(0,5);
 return <section className={`result-ranked result-ranked--${kind}`}>
  <header><h3>{title}</h3><small>{visible.length?`${visible.length} чадавх`:'Мэдээлэлгүй'}</small></header>
  <div>{visible.length?visible.map((x,i)=><div className={`result-ranked-row ${x.basis==='RELATIVE_RANK'?'is-provisional':''}`} key={x.capabilityId}><span>{String(i+1).padStart(2,'0')}</span><strong>{x.capabilityNameMn}{x.basis==='RELATIVE_RANK'&&<em className="result-prelim-tag">Урьдчилсан</em>}</strong><em>{fmt(x.score)}</em></div>):<p className="result-empty">{empty}</p>}</div>
  {visible.some(x=>x.basis==='RELATIVE_RANK')&&<p className="result-prelim-note">{PRELIM_NOTE}</p>}
 </section>
}

function EvidenceQuality({data}:{data:ResultsPayload}){
 const e=data.evidence; const q=data.quality;
 if(!e&&!q)return null;
 const metrics=e?[
  ['Мэдээлэлтэй үзүүлэлт',e.knownCells,`/${e.applicableCells}`],['Түгжигдсэн',e.lockedCells,''],['Баталгаажсан',e.validatedCells,''],['Тооцоолсон',e.estimatedCells,''],
  ['Мэдээлэлгүй',e.unknownCells,''],['Хамаарахгүй',e.notApplicableCells,''],['Нягтлах',e.reviewRequiredCells,''],['Зөрчил',e.contradictionCells,'']
 ]:[];
 return <section className="result-evidence">
  <header><div><div className="result-section-label">Нотолгооны чанар</div><h2>Онооноос тусдаа найдвартай байдал ба мэдээллийн хамралт</h2></div><p>Мэдээллийн бүрэн байдал, баталгаажуулалтын төлөвийг оноотой хольж тайлбарлахгүй.</p></header>
  {metrics.length?<div className="result-evidence-grid">{metrics.map(([label,value,suffix])=><div key={String(label)}><span>{label}</span><strong>{String(value)}{suffix}</strong></div>)}</div>:null}
  {q?.warnings?.length?<div className="result-quality-warnings" role="note"><strong>Нягтлах тэмдэглэл</strong><ul>{q.warnings.map((w,i)=><li key={i}>{w}</li>)}</ul></div>:null}
 </section>
}

function OutcomeView({outcomes,priorities,provisional}:{outcomes:PurposeResult[];priorities:OutcomePriorityResult[];provisional:boolean}){
 const byId=new Map(priorities.map(x=>[x.id,x]));
 if(!outcomes.length&&!priorities.length)return null;
 return <section className="result-outcomes">
  <header><div><div className="result-section-label">Бизнесийн 5 үр дүн</div><h2>{provisional?'Урьдчилсан бизнесийн чиглэл':'Оношилгооны бизнесийн чиглэл'}</h2></div><p>Энэ нь оношилгооны эрэмбэ бөгөөд ашиг, орлогын өсөлтийг шууд урьдчилан таамагласан санхүүгийн загвар биш.</p></header>
  <div className="result-outcome-table">
   <div className="result-outcome-head"><span>Үр дүн</span><span>Оноо</span><span>Хамралт</span><span>Тэргүүлэх дэд чиглэл</span></div>
   {outcomes.map(o=>{const p=byId.get(o.id);const top=p?.topCategories?.[0];const s=displayScore(o);return <div className="result-outcome-row" key={o.id}>
    <strong>{o.nameMn}</strong><span>{fmt(s)}</span><span>{pct(o.coverage)}</span><span>{top?.nameMn??'-'}</span>
   </div>})}
  </div>
 </section>
}

function ModuleComparison({modules,overall,selected,onSelect,areaName}:{modules:ModuleResult[];overall:number|null;selected:number;onSelect:(i:number)=>void;areaName:string}){
 return <section className="result-modules">
  <header><div><div className="result-section-label">{modules.length} үндсэн бүрэлдэхүүн</div><h2>{areaName}: бүрэлдэхүүний харьцуулалт</h2></div><p>Бүх бүрэлдэхүүнийг ижил хэмжүүрээр харуулсан. Мөр сонгож тухайн хэсгийн дэд чиглэлийн дэлгэрэнгүйг үзнэ.</p></header>
  <div className="result-module-table" role="group" aria-label={`${areaName} чиглэлийн ${modules.length} бүрэлдэхүүний үнэлгээ`}>
   <div className="result-module-header" aria-hidden="true"><span>Бүрэлдэхүүн</span><span>Харьцуулалт</span><span>Оноо</span><span>Нийтээс</span></div>
   {modules.map((m,i)=>{const score=displayScore(m);const delta=score==null||overall==null?null:Math.round(score-overall);return <button type="button" key={m.id} className={selected===i?'active':''} aria-pressed={selected===i} aria-label={`${m.nameMn}. Оноо ${fmt(score)}${delta==null?'':`. Нийт онооноос ${delta===0?'ижил':`${Math.abs(delta)} оноогоор ${delta>0?'өндөр':'бага'}`}`}.`} onClick={()=>onSelect(i)}>
    <span className="result-module-name"><small>{String(i+1).padStart(2,'0')}</small><strong>{m.nameMn}</strong></span>
    <span className="result-module-track" aria-hidden="true"><i style={{width:`${clamp(score)}%`}}/></span>
    <strong className="result-module-score">{fmt(score)}</strong>
    <span className={`result-module-delta ${delta!=null&&delta<0?'negative':delta!=null&&delta>0?'positive':''}`}>{delta==null?'-':delta===0?'0':`${delta>0?'+':''}${delta}`}</span>
   </button>})}
  </div>
 </section>
}

function RootCauseList({items,capabilities,provisional}:{items:RootFinding[];capabilities:CategoryResult[];provisional:boolean}){
 const byId=new Map(capabilities.map(c=>[c.id,c]));
 return <section><div className="result-section-label">Суурь шалтгааны таамаглал</div>{items.length?<><h3>{provisional?'Урьдчилсан шалтгааны таамаглал':'Нотолгоогоор дэмжигдсэн хүчин зүйлс'}</h3><ol>{items.map(f=><li key={f.id}><strong>{byId.get(f.categoryId)?.nameMn??f.categoryId}</strong><span>{rootCauseLabel(f.classification)}</span></li>)}</ol><p>{provisional?'Эдгээр нь нэмэлт нотолгоо эсвэл нягтлал шаардах оношилгооны таамаглал бөгөөд батлагдсан шууд шалтгаан биш.':'Эдгээр нь батлагдсан шууд шалтгаан биш; мэдээллээр дэмжигдсэн оношилгооны таамаглал юм.'}</p></>:<><h3>Таамаглал тодроогүй</h3><p>Хангалттай дэмжигдсэн суурь шалтгааны таамаглал одоогоор алга.</p></>}</section>
}

function ModuleDetail({module,capabilities,data}:{module:ModuleResult;capabilities:CategoryResult[];data:ResultsPayload}){
 const ranked=rankCapabilities(capabilities); const top=ranked.slice(0,3); const gaps=[...ranked].reverse().slice(0,3);
 const ids=new Set(capabilities.map(c=>c.id));
 const causes=(data.rootCauses?.selected??[]).filter(f=>ids.has(f.categoryId)).slice(0,3);
 const validatedWeak=(data.evidence?.weakCells??[]).filter(c=>c.moduleId===module.id).slice(0,3);
 const provisionalWeak=(data.evidence?.provisionalWeakCells??[]).filter(c=>c.moduleId===module.id).slice(0,3);
 const weak=validatedWeak.length?validatedWeak:provisionalWeak; const weakValidated=validatedWeak.length>0;
 const score=displayScore(module);
 return <section className="result-detail">
  <header><div><div className="result-section-label">Бүрэлдэхүүний дэлгэрэнгүй</div><h2>{module.nameMn}</h2><p>{capabilities.length} дэд чиглэл · мэдээллийн хамралт {pct(module.coverage)} · найдвартай байдал {pct(module.confidence)}</p></div><div className="result-detail-score"><strong>{fmt(score)}</strong><span>{module.band||band(score)}</span></div></header>
  <div className="result-detail-findings"><CapabilityRank title="Харьцангуй өндөр дэд чиглэл" items={top}/><CapabilityRank title="Харьцангуй сул дэд чиглэл" items={gaps}/></div>
  <div className="result-advisory">
   <RootCauseList items={causes} capabilities={capabilities} provisional={isProvisionalResult(data)}/>
   <section><div className="result-section-label">Анхаарах хэсэг</div>{weak.length?<><h3>{weakValidated?'Баталгаажсан сул хэмжээсүүд':'Урьдчилсан сул дохио'}</h3><ol>{weak.map(x=><li key={x.cellId}>{mnText(x.capabilityNameMn)} · {mnText(x.cellNameMn)} ({fmt(x.score)})</li>)}</ol><button type="button" className="result-text-action" onClick={()=>go('priorities')}>Тэргүүлэх асуудалд нээх →</button></>:<><h3>Сул нүд бүрдээгүй</h3><p>Энэ бүрэлдэхүүнд сул үзүүлэлтийн босго давсан хэсэг алга.</p></>}</section>
  </div>
  <details className="result-category-disclosure"><summary>Энэ бүрэлдэхүүний дэд чиглэл <small>{capabilities.length} дэд чиглэл</small></summary><div>{capabilities.map(c=>{const s=displayScore(c);return <div key={c.id}><span>{c.nameMn}</span><i aria-hidden="true"><em style={{width:`${clamp(s)}%`}}/></i><strong>{fmt(s)}</strong></div>})}</div></details>
 </section>
}

function CapabilityRank({title,items}:{title:string;items:CategoryResult[]}){
 return <section className="result-ranked"><header><h3>{title}</h3><small>Дэд чиглэлийн оноо</small></header><div>{items.length?items.map((c,i)=><div className="result-ranked-row" key={c.id}><span>{String(i+1).padStart(2,'0')}</span><strong>{mnText(c.nameMn)}</strong><em>{fmt(displayScore(c))}</em></div>):<p className="result-empty">Хангалттай мэдээлэл алга.</p>}</div></section>
}

function TerminalResults({assessment,progress,data,selected,setSelected}:{assessment:AssessmentSummary;progress:AssessmentProgress|null;data:ResultsPayload;selected:number;setSelected:(n:number)=>void}){
 const overall=displayScore(data.overall); const coverage=pct01(data.overall.coverage); const confidence=pct01(data.overall.confidence);
 const capabilities=capabilitiesOf(data); const strengths=data.strengths?.items??[]; const weaknesses=data.weaknesses?.items??[];
 const module=data.modules[selected]??null; const moduleCapabilities=module?capabilities.filter(c=>c.moduleId?c.moduleId===module.id:module.categoryIds.includes(c.id)):[];
 const outcomes=outcomesOf(data); const priorities=prioritiesOf(data); const area=businessAreaById(assessment.domainCode); const provisional=isProvisionalResult(data);
 const statusText=data.resultStatus==='REVIEW_REQUIRED'?'Дууссан · нягтлах шаардлагатай':assessment.status==='EXHAUSTED'?'Дууссан · боломжит мэдээлэл дууссан':data.resultStatus==='OFFICIAL'?'Дууссан · албан ёсны':data.resultStatus==='QUICK_ESTIMATE'?'Дууссан · урьдчилсан':'Дууссан';
 const intro=provisional?'Одоогийн хариултад тулгуурласан урьдчилсан үр дүнг шийдвэр гаргахад ойлгомжтой дарааллаар харуулна.':'Оношилгооны баталгаажсан үр дүнг удирдлагын шийдвэрийн дарааллаар харуулна.';
 return <>
  <header className="result-page-title"><div><span>{area.name}</span><h1>Оношилгооны үр дүн</h1><p>{intro}</p></div><div><Button variant="secondary" onClick={()=>go('report')}>Тайлан нээх</Button><Button onClick={()=>go('priorities')}>Тэргүүлэх асуудал</Button></div></header>
  {provisional&&<aside className="result-provisional-banner" role="note"><strong>Урьдчилсан үр дүн</strong><span>Нэмэлт нотолгоо бүрдэхэд зөвхөн “Урьдчилсан” тэмдэгтэй чадавхын байрлал өөрчлөгдөж болно.</span></aside>}
  <ResultHeader overall={overall} coverage={coverage} confidence={confidence} statusText={statusText} answered={progress?.answeredQuestions} contradictions={data.quality?.openContradictions??data.openContradictions} result={data}/>
  <ExecutiveSummary overall={overall} data={data}/>
  <section className="result-findings-grid"><CapabilityFindings kind="strength" title="5 давуу тал" items={strengths} empty="Давуу талын мэдээлэл бүрдээгүй байна."/><CapabilityFindings kind="weakness" title="5 сул тал" items={weaknesses} empty="Сул талын мэдээлэл бүрдээгүй байна."/></section>
  <EvidenceQuality data={data}/>
  <OutcomeView outcomes={outcomes} priorities={priorities} provisional={provisional}/>
  {data.modules?.length?<ModuleComparison modules={data.modules} overall={overall} selected={selected} onSelect={setSelected} areaName={area.name}/>:<p className="result-empty">Бүрэлдэхүүний үнэлгээ бүрдээгүй байна.</p>}
  {module?<ModuleDetail module={module} capabilities={moduleCapabilities} data={data}/>:null}
  <section className="result-decision"><div><div className="result-section-label">Дараагийн шийдвэр</div><h2>Оношилгооны үр дүнг хэрэгжүүлэх дараалал болгоно.</h2><p>Тэргүүлэх асуудлын хэсэг нь энэ үр дүнд тулгуурлан зөвлөмж болон 12 сарын төлөвлөгөө рүү шилжинэ.</p></div><Button onClick={()=>go('priorities')}>Тэргүүлэх асуудал руу</Button></section>
 </>;
}

function DemoResults(){
 const [selected,setSelected]=useState(0);
 const modules:ModuleResult[]=demoModules.map((m,i)=>({id:String(i),nameMn:m.name,partialScore:m.score,officialScore:null,score:m.score,confidence:.86,coverage:.91,isOfficial:false,weightPct:i===0?20:10,categoryIds:[]}));
 const mk=(id:string,nameMn:string,score:number,moduleId='0'):CategoryResult=>({id,nameMn,moduleId,moduleCode:'M1',moduleNameMn:demoModules[0]?.name??'Маркетинг',partialScore:score,officialScore:null,score,confidence:.84,coverage:.9,isOfficial:false,weightPct:1.5,confirmedNotApplicable:false,applicableCellCount:48,finalizedCellCount:43,unresolvedCellCount:5,reviewRequiredCellCount:0});
 const categories=[mk('C1','Брэндийн удирдлага',79),mk('C2','Маркетингийн стратеги',74),mk('C3','Борлуулалтын уялдаа',71),mk('C4','Хэрэглэгчийн судалгаа',63),mk('C5','Өрсөлдөөний байршуулалт',61),mk('C6','Өгөгдөл ба хэмжилт',57)];
 modules[0].categoryIds=categories.map(c=>c.id);
 const outcomes:PurposeResult[]=['Ашиг','Орлого','Брэндийн үнэ цэнэ','Хэрэглэгчийн тоо','Зах зээлийн хувь'].map((nameMn,i)=>({id:`P${i+1}`,nameMn,score:65-i*2,partialScore:65-i*2,officialScore:null,confidence:.82,coverage:.9,isOfficial:false}));
 const data:ResultsPayload={assessmentId:'demo',methodologyVersion:'demo',mode:'QUICK',status:'COMPLETED',schemaVersion:CANONICAL_SCHEMA,resultHash:'demo-result-hash-1234567890',resultStatus:'QUICK_ESTIMATE',metricType:'QUICK_ESTIMATE',generatedAt:new Date().toISOString(),overall:{score:67,partialScore:67,officialScore:null,confidence:.86,coverage:.91,isOfficial:false,applicableCategoryCount:64,completeCategoryCount:58},modules,categories,capabilities:categories,purposes:outcomes,businessOutcomes:outcomes,openContradictions:0,routingState:null,strengths:{totalCount:1,items:[{capabilityId:'C1',capabilityNameMn:'Брэндийн удирдлага',moduleId:'0',moduleCode:'M1',moduleNameMn:demoModules[0]?.name??'',score:79,confidence:.84,coverage:.9,sourceTraceIds:['demo']}]},evidence:{totalCells:3072,applicableCells:2800,knownCells:2550,unknownCells:250,notApplicableCells:272,lockedCells:1400,validatedCells:900,estimatedCells:250,reviewRequiredCells:0,contradictionCells:0,confidenceStateCounts:{LOCKED:1400},statusCounts:{FINALIZED:2550},weakCellCount:1,validatedWeakCellCount:0,provisionalWeakCellCount:1,weakCells:[],provisionalWeakCells:[{capabilityId:'C6',capabilityNameMn:'Өгөгдөл ба хэмжилт',moduleId:'0',moduleCode:'M1',moduleNameMn:demoModules[0]?.name??'',cellId:'D34',cellNameMn:'Шийдвэрт бодит мэдээлэл ашиглах',score:42,confidence:.75,status:'FINALIZED',severity:.3,sourceTraceIds:['demo']}]},quality:{openContradictions:0,hardContradictions:0,reviewRequiredCells:0,incompleteCoverage:true,quickLimitReached:false,requiresReview:false,officialResultAvailable:false,quickEstimate:true,warnings:['Энэ нь урьдчилсан үр дүн бөгөөд нотолгоо бүрэн болоогүй байна.']}};
 const assessment:AssessmentSummary={id:'demo',companyId:'demo',domainCode:'marketing',methodologyVersion:'demo',mode:'QUICK',status:'COMPLETED',assessmentRevision:214,routingRevision:214,eventSequence:214,overall:{partialScore:67,officialScore:null,isOfficial:false,coverage:.91},createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
 const progress:AssessmentProgress={mode:'QUICK',status:'COMPLETED',answeredQuestions:214,askedQuestions:214,quick:{softMinimum:192,hardMaximum:280},diagnosticCoverage:.91,officialResultAvailable:false};
 return <AppShell route="results"><PageContainer className="result-workspace" data-result-domain="marketing"><DemoNotice title="Үр дүнгийн жишээ"/><TerminalResults assessment={assessment} progress={progress} data={data} selected={selected} setSelected={setSelected}/></PageContainer></AppShell>
}


function displaySentence(value:string){const t=value.trim();return t?t[0].toLocaleUpperCase('mn-MN')+t.slice(1):t}

function TestQuestionnaire({areaId}:{areaId:BusinessAreaId}){
 const area=businessAreaById(areaId);const questions=testQuestionSets[areaId];const answerKey=`${TEST_ANSWERS_PREFIX}${areaId}`;
 let initialAnswers:(number|null)[]=[];try{const parsed=JSON.parse(sessionStorage.getItem(answerKey)||'[]');initialAnswers=Array.isArray(parsed)?parsed:[]}catch{initialAnswers=[]}
 const stored=Math.max(0,Math.min(questions.length-1,Number(sessionStorage.getItem(`${TEST_PROGRESS_PREFIX}${areaId}`)||'0')));
 const [answers,setAnswers]=useState<(number|null)[]>(()=>questions.map((_,i)=>typeof initialAnswers[i]==='number'?initialAnswers[i]:null));
 const [index,setIndex]=useState(stored);const [choice,setChoice]=useState<number|null>(()=>typeof initialAnswers[stored]==='number'?initialAnswers[stored]:null);const [done,setDone]=useState(false);
 const expectedTotal=questions.length;const systemPlannedTotal=basicInfoQuestions.length+Object.values(testQuestionSets).reduce((sum,rows)=>sum+rows.length,0);const sessionProgress=Math.round((index/questions.length)*100);const displayedQuestion=index+1;
 const formTargets=useMemo(()=>{const seen=new Set<string>();const rows:Array<{label:string;index:number}>=[];const roleLabel=(role?:string|null)=>{const r=String(role||'').toUpperCase();if(r.includes('APPLICABILITY'))return'Хамаарах нөхцөл';if(r.includes('CONDITIONAL'))return'Нөхцөлт асуулт';if(r.includes('RESULT_CONTEXT'))return'Үр дүнгийн нөхцөл';if(r.includes('VERIFY')||r.includes('CORROBORATE'))return'Нягтлах асуулт';if(r.includes('QUANTIFY')||r.includes('EVIDENCE'))return'Баримтаар нягтлах';if(r.includes('SUPPORT'))return'Нэмэлт баталгаажуулалт';return'Үндсэн үнэлгээ'};questions.forEach((question,i)=>{const hasNeutral=question.options.some((x,j)=>isNeutralAnswer(x,question.states?.[j]));const role=roleLabel(question.role);const key=`${role}-${question.options.length}-${hasNeutral?'neutral':'scored'}`;if(seen.has(key))return;seen.add(key);rows.push({label:`${role} · ${question.options.length} сонголт${hasNeutral?' · саарал тусгай сонголттой':''}`,index:i})});return rows.slice(0,10)},[questions]);
 const jumpTo=(nextIndex:number)=>{const safe=Math.max(0,Math.min(questions.length-1,nextIndex));sessionStorage.setItem(`${TEST_PROGRESS_PREFIX}${areaId}`,String(safe));setIndex(safe);setChoice(answers[safe]??null)};
 const saveChoice=(value:number)=>{setChoice(value);setAnswers(current=>{const next=[...current];next[index]=value;sessionStorage.setItem(answerKey,JSON.stringify(next));return next})};
 const next=()=>{if(choice==null)return;const nextIndex=index+1;if(nextIndex>=questions.length){sessionStorage.setItem(`${TEST_PROGRESS_PREFIX}${areaId}`,String(questions.length));setDone(true);return}sessionStorage.setItem(`${TEST_PROGRESS_PREFIX}${areaId}`,String(nextIndex));setIndex(nextIndex);setChoice(answers[nextIndex]??null)};
 const back=()=>{if(index===0){go('analysis');return}const nextIndex=index-1;sessionStorage.setItem(`${TEST_PROGRESS_PREFIX}${areaId}`,String(nextIndex));setIndex(nextIndex);setChoice(answers[nextIndex]??null)};
 if(done)return <AppShell route="assessment"><PageContainer className="experience-test-question"><section className="experience-test-complete"><div><Icon name={area.icon} size={36}/></div><span>ЖИШЭЭ ОНОШИЛГОО ДУУСЛАА</span><h1>{area.name}</h1><p>Таны сонгосон {questions.length} хариултад үндэслэн жишээ тайланг тооцлоо. Энэ нь интерфэйс ба тайлангийн урсгалыг шалгах зориулалттай; албан ёсны оношилгооны оноог орлохгүй.</p><Button onClick={()=>{sessionStorage.setItem(REPORT_AREA_KEY,areaId);sessionStorage.removeItem(TEST_AREA_KEY);go('report')}}>Хариултад суурилсан тайлан харах <Icon name="arrow" size={17}/></Button></section></PageContainer></AppShell>;
 const q=questions[index];
 return <AppShell route="assessment"><PageContainer className="experience-test-question">
  <header><button type="button" onClick={back}><Icon name="back" size={18}/> Буцах</button><span>{area.name}</span><strong>{sessionProgress}%</strong></header>
  <div className="experience-test-progress"><i style={{width:`${sessionProgress}%`}}/></div><div className="experience-test-progress-copy"><b>Асуулт {displayedQuestion} / {expectedTotal}</b><span>{basicInfoQuestions.length} суурь асуулт болон таван чиглэлийн 64 төлөөлөх асуултыг нийлүүлбэл бүрэн жишээ урсгал нийт {systemPlannedTotal} асуулттай.</span></div><div className="experience-question-form-simulator"><span>Энэ чиглэлд хэрэглэгчид харагдах асуултын төрлүүдийн жишээ</span><div>{formTargets.map(x=><button type="button" key={`${x.label}-${x.index}`} className={x.index===index?'is-active':''} onClick={()=>jumpTo(x.index)}>{x.label}</button>)}</div></div>
  <section><span>ЖИШЭЭ · {q.topic}</span><h1 data-route-heading tabIndex={-1}>{displaySentence(q.text)}</h1><div className="experience-test-options">{(()=>{
   const layout=buildDemoAnswerLayout(q);
   return [...layout.main,...layout.special].map((row,displayIndex)=>{const i=row.option.optionIndex;const t=row.quality===null?null:answerToneAtQuality(row.quality);return <button type="button" key={`${q.id}-${i}`} aria-pressed={choice===i} className={`${choice===i?'is-selected ':''}${t?'has-score-tone':'is-neutral'}`} style={t?({'--answer-color':t.color,'--answer-soft':t.soft} as React.CSSProperties):undefined} onClick={()=>saveChoice(i)}><b>{String.fromCharCode(65+displayIndex)}</b><span>{displaySentence(row.option.labelMn)}</span><i/></button>})
  })()}</div><Button fullWidth disabled={choice==null} onClick={next}>{index===questions.length-1?'Дуусгах':'Дараагийн асуулт'} <Icon name="arrow" size={17}/></Button></section>
  <small>Жишээ горим · чиглэл бүрийн 64 чадавхаас бодит төлөөлөх асуулт ашиглана. Дээрх товчлууруудаар тухайн сан доторх үндсэн, нөхцөлт, нягтлах болон баримтаар шалгах хэлбэрүүд рүү шууд шилжиж туршина.</small>
 </PageContainer></AppShell>;
}

export default function Results(){
 const loggedIn=!!session.accessToken;
 const testArea=(sessionStorage.getItem(TEST_AREA_KEY)||'') as BusinessAreaId;
 const testMode=loggedIn&&isTestBusiness(session.companyName)&&['marketing','it','finance','people','operations'].includes(testArea);
 const [assessment,setAssessment]=useState<AssessmentSummary|null>(null);
 const [progress,setProgress]=useState<AssessmentProgress|null>(null);
 const [data,setData]=useState<ResultsPayload|null>(null);
 const [selected,setSelected]=useState(0);
 const [loading,setLoading]=useState(loggedIn&&!testMode);
 const [error,setError]=useState('');

 const resolveAssessmentId=resolveBoundAssessmentId;
 const refreshSnapshot=async(id:string)=>{
  const [a,p]=await Promise.all([api.getAssessment(id),api.getProgress(id)]);if(session.companyId&&a.companyId!==session.companyId){session.assessmentId=null;throw new Error('Энэ оношилгоо сонгосон байгууллагад хамаарахгүй байна.')}setAssessment(a);setProgress(p);
  if(isTerminal(a.status)){
   const result=await api.getResults(id);
   if(result.schemaVersion!==CANONICAL_SCHEMA)throw new Error('Оношилгооны үр дүнг баталгаажуулж чадсангүй. Дахин ачаална уу.');
   setData(result);
  }else setData(null);
 };
 const load=async()=>{if(!loggedIn||testMode)return;setLoading(true);setError('');try{const id=await resolveAssessmentId();if(!id){setAssessment(null);setData(null);go('analysis');return}await refreshSnapshot(id)}catch(e:any){if(e?.status===404){session.assessmentId=null;go('analysis');return}setError(e?.code==='REPORT_PENDING_REVIEW'?`Тайлан хянагдаж байна. ${e.message}`:(e?.message||'Оношилгооны мэдээллийг ачаалж чадсангүй.'))}finally{setLoading(false)}};
 const refreshQuiet=async()=>{const id=session.assessmentId;if(!id)return;try{await refreshSnapshot(id)}catch{/* question surface owns answer errors */}};
 useEffect(()=>{if(!testMode)void load()},[testMode]);
 useEffect(()=>{if(data&&selected>=data.modules.length)setSelected(0)},[data,selected]);

 if(testMode)return <TestQuestionnaire areaId={testArea}/>;
 if(!loggedIn)return <DemoResults/>;
 if(loading)return <AppShell route="results"><PageContainer><LoadingState variant="dashboard" label="Шинжилгээний орчныг бэлтгэж байна..."/></PageContainer></AppShell>;
 if(error&&!assessment)return <AppShell route="results"><PageContainer><ErrorState message={error} onRetry={load}/></PageContainer></AppShell>;
 if(!assessment)return <AppShell route="results"><PageContainer><LoadingState variant="dashboard" label="Оношилгооны хэсэг рүү шилжүүлж байна..."/></PageContainer></AppShell>;

 const terminal=isTerminal(assessment.status);
 if(terminal&&data)return <AppShell route="results"><PageContainer className="result-workspace" data-result-domain={assessment.domainCode}><TerminalResults assessment={assessment} progress={progress} data={data} selected={selected} setSelected={setSelected}/>{error&&<div className="inline-error" role="alert">{error}</div>}</PageContainer></AppShell>;
 if(terminal&&!data)return <AppShell route="results"><PageContainer><ErrorState message={error||'Каноник оношилгооны үр дүнг ачаалж чадсангүй.'} onRetry={load}/></PageContainer></AppShell>;

 const overall=displayScore(assessment.overall); const coverage=pct01(progress?.diagnosticCoverage); const statusText=assessment.status==='PAUSED'?'Түр зогссон':'Үргэлжилж байна';
 return <AppShell route="results"><PageContainer className="mmri-questionnaire-page">
  <AssessmentInline onCompleted={load} onAnswerAccepted={refreshQuiet}/>
  <details className="mmri-questionnaire-snapshot">
   <summary>Одоогийн урьдчилсан мэдээлэл</summary>
   <div className="mmri-questionnaire-snapshot__metrics"><span><small>Урьдчилсан үнэлгээ</small><strong>{fmt(overall)}</strong></span><span><small>Мэдээллийн хамралт</small><strong>{coverage==null?'-':`${coverage}%`}</strong></span><span><small>Төлөв</small><strong>{statusText}</strong></span></div>
   <p>Эдгээр үзүүлэлт оношилгоо үргэлжлэх явцад өөрчлөгдөж болно. Эцсийн тайлан шаардлагатай нотолгоо бүрдсэний дараа үүснэ.</p>
  </details>
  {error&&<div className="mmri-questionnaire__error" role="alert">{error}</div>}
 </PageContainer></AppShell>;
}
