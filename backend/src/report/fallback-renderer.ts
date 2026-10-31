import type { FrozenReportPayload, NarrativeClaim, NarrativeDraft, NarrativeSection } from "./types.js";
import { safeNarrativeCompanyName } from "./ai-prompt.js";

const pct = (v:number|null):string => v===null ? "тодорхойгүй" : `${(v*100).toFixed(0)}%`;
const score = (v:number|null):string => v===null ? "оноо гараагүй" : `${v.toFixed(1)}`;

function claim(claimType:NarrativeClaim["claimType"], textMn:string, sourceTraceIds:string[], refs:Partial<NarrativeClaim>={}):NarrativeClaim {
  return {claimType,textMn,sourceTraceIds,...refs};
}

function unique<T>(rows:T[]):T[]{return [...new Set(rows)];}
function dictionaryName(payload:FrozenReportPayload,id?:string|null):string|undefined{
  if(!id)return undefined;
  const value=payload.displayDictionary[id];
  return value?.trim()||undefined;
}
function joinMn(items:string[]):string{
  const clean=items.map(x=>x.trim()).filter(Boolean);
  if(clean.length<=1)return clean[0]||"";
  if(clean.length===2)return `${clean[0]} болон ${clean[1]}`;
  return `${clean.slice(0,-1).join(", ")} болон ${clean.at(-1)}`;
}
function sentence(value:string):string{
  const v=String(value||"").trim();
  if(!v)return "";
  return /[.!?…]$/.test(v)?v:`${v}.`;
}
function countWords(value:string):number{return value.trim()?value.trim().split(/\s+/).length:0;}
function classificationText(value:string):string{
  if(value==="PRIMARY_ROOT_CAUSE")return "оношилгоонд суурь шалтгааны түвшинд анхаарах хэсэг";
  if(value==="CONTRIBUTING_CAUSE")return "сул үр дүнд нөлөөлж буй чухал хэсэг";
  if(value==="POSSIBLE_CAUSE")return "нэмэлт нотолгоогоор баталгаажуулах шаардлагатай боломжит шалтгаан";
  if(value==="EVIDENCE_GAP")return "нотолгоог нь эхэлж бүрдүүлэх шаардлагатай хэсэг";
  return "эхэлж бэхжүүлэх шаардлагатай хэсэг";
}
function conclusionText(payload:FrozenReportPayload):{text:string;sources:string[];recommendationId?:string}{
  const strengths=payload.strengths.slice(0,3);
  const weaknesses=payload.weaknesses.slice(0,3);
  const roots=payload.rootFindings.slice(0,2);
  const action=payload.priorityActions[0];
  const strengthNames=strengths.map(x=>x.nameMn).filter(Boolean);
  const weaknessNames=weaknesses.map(x=>x.nameMn).filter(Boolean);
  const overall=payload.overall.score===null?"нийт оноо бүрэн тогтоогдоогүй":`нийт үнэлгээ ${score(payload.overall.score)} оноо`;
  const parts:string[]=[];
  parts.push(`${safeNarrativeCompanyName(payload.companyName)}-ийн энэ удаагийн оношилгоогоор ${overall} гарсан. Үр дүнг нэг тоогоор бус, хүчтэй ба сул чадавхын бодит ялгаатай хамтатган авч үзэх нь зүйтэй.`);
  if(strengthNames.length)parts.push(`${joinMn(strengthNames)} нь одоогийн тогтвортой суурь болж байна. Эдгээрийн ажиллаж буй хяналт, дадлыг сул хэсгийн өөрчлөлтөд түшиц болгон ашиглана.`);
  if(weaknessNames.length)parts.push(`${joinMn(weaknessNames)} нь эхэлж анхаарах чадавхууд байна. Эдгээрийг нотолгоо, хариуцлага, хэмжилттэй нь хамт сайжруулах шаардлагатай.`);
  if(action)parts.push(`Эхний удирдлагын алхам нь “${action.titleMn}”. ${sentence(action.actionMn)} Ахиц нь “${String(action.kpiMn||"холбогдох хэмжүүр").replace(/[.!?…]+$/,'')}” хэмжүүрийн өөрчлөлтөөр баталгаажна.`);
  parts.push(`${payload.remeasurement.labelMn} хийхдээ нийт онооноос гадна дээрх сул чадавхууд тогтвортой сайжирсан эсэх, төлөвлөсөн гарц бодитоор бүрдсэн эсэхийг өмнөх тайлантай харьцуулна.`);
  const text=parts.join(" ");
  const sources=unique([`assessment:${payload.assessmentId}`,...(action?.sourceTraceIds||[]),...strengths.flatMap(x=>x.sourceTraceIds),...weaknesses.flatMap(x=>x.sourceTraceIds),...roots.flatMap(x=>x.sourceTraceIds)]).slice(0,12);
  return {text,sources,...(action?{recommendationId:action.id}:{})};
}

export function deterministicFallbackNarrative(payload: FrozenReportPayload): NarrativeDraft {
  const sections: NarrativeSection[] = [];
  sections.push({id:"S01",titleMn:"Үнэлгээний мэдээлэл",claims:[claim("DESCRIPTIVE_SCORE",`${safeNarrativeCompanyName(payload.companyName)} — ${payload.assessmentMode} үнэлгээ; төлөв: ${payload.assessmentStatus}; аргачлал: ${payload.methodologyVersion}.`,[`assessment:${payload.assessmentId}`]) ]});

  const metricLabel = payload.metricType === "QUICK_ESTIMATE" ? "Түргэвчилсэн үнэлгээний тооцоолол" : payload.metricType === "OFFICIAL_OVERALL_SCORE" ? "Албан ёсны нийт оноо" : payload.metricType === "REVIEW_REQUIRED_SCORE" ? "Нягтлах шаардлагатай урьдчилсан оноо" : "Нийт оноо";
  const execText = `${metricLabel}: ${score(payload.overall.score)}${payload.overall.band?` (${payload.overall.band})`:""}. Итгэлцэл ${pct(payload.overall.confidence)}, хамрах хүрээ ${pct(payload.overall.coverage)}.`;
  const execClaims=[claim("DESCRIPTIVE_SCORE",execText,[`assessment:${payload.assessmentId}`]),...payload.requiredWarnings.map(w=>claim("RISK",w,[`assessment:${payload.assessmentId}`]))];
  sections.push({id:"S02",titleMn:"Ерөнхий онош",claims:execClaims});

  sections.push({id:"S03",titleMn:"Үндсэн зорилгын зураглал",claims:payload.purposes.map(p=>claim("DESCRIPTIVE_SCORE",`${p.nameMn}: ${score(p.score)}, итгэлцэл ${pct(p.confidence)}, хамрах хүрээ ${pct(p.coverage)}.`,[payload.traceIndex[`purpose:${p.id}`] ? `purpose:${p.id}` : `assessment:${payload.assessmentId}`]))});

  if (payload.strengths.length) sections.push({id:"S04",titleMn:"Гол давуу тал",claims:payload.strengths.slice(0,5).map(s=>claim("STRENGTH",`${s.nameMn} нь энэ удаагийн үнэлгээнд харьцангуй тогтвортой илэрсэн чадавх байна.`,s.sourceTraceIds))});

  if (payload.weaknesses.length) sections.push({id:"S05",titleMn:"Гол сул тал",claims:payload.weaknesses.slice(0,5).map(w=>claim("WEAKNESS",`${w.nameMn} нь энэ удаагийн үнэлгээнд эхэлж бэхжүүлэх шаардлагатай чадавх байна.`,w.sourceTraceIds))});

  if (payload.priorityActions.length) sections.push({id:"S06",titleMn:"Тэргүүлэх арга хэмжээ",claims:payload.priorityActions.slice(0,5).map(a=>claim("RECOMMENDATION",`${a.titleMn}. ${sentence(a.actionMn)} Ажил дуусахад ${String(a.deliverableMn||"тодорхой үр дүн").replace(/[.!?…]+$/,'')} бүрдсэн байна. Ахиц нь “${String(a.kpiMn||"холбогдох хэмжүүр").replace(/[.!?…]+$/,'')}” хэмжүүрийн өөрчлөлтөөр шалгагдана.`,a.sourceTraceIds,{recommendationId:a.id}))});
  if (payload.evidenceActions.length) sections.push({id:"S07",titleMn:"Нотолгоо ба баталгаажуулалт",claims:payload.evidenceActions.slice(0,2).map(a=>claim("RECOMMENDATION",`${a.titleMn}. ${sentence(a.actionMn)}`,a.sourceTraceIds,{recommendationId:a.id}))});

  if (payload.roadmap.some(r=>r.milestones.length)) sections.push({id:"S08",titleMn:"365 хоногийн замын зураг",claims:payload.roadmap.flatMap(r=>r.milestones.map(m=>claim("ROADMAP",`${r.nameMn}: ${m.titleMn}. Хэмжүүр: ${m.kpiMn}.`,m.sourceTraceIds,{recommendationId:m.recommendationId,milestoneId:m.milestoneId})))});
  if (payload.risks.length) sections.push({id:"S09",titleMn:"Эрсдэл ба шийдэгдээгүй нотолгоо",claims:payload.risks.slice(0,4).map(r=>claim("RISK",r.messageMn,r.sourceTraceIds))});

  const closing=conclusionText(payload);
  sections.push({id:"S10",titleMn:"Ерөнхий дүгнэлт",claims:[claim(closing.recommendationId?"RECOMMENDATION":"CONFIDENCE_STATEMENT",closing.text,closing.sources,closing.recommendationId?{recommendationId:closing.recommendationId}:{})]});
  const finalized = sections.map(section => ({...section, claims: section.claims.map((c,index)=>({...c,reportClaimId:`RCLM-${section.id}-${String(index+1).padStart(3,"0")}`}))}));
  return {schemaVersion:"MMRI-NARRATIVE-DRAFT-1.0",payloadHash:payload.payloadHash,sections:finalized};
}
