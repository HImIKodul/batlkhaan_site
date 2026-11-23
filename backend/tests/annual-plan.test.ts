import {describe,it,expect} from 'vitest';
import {planPeriodLabelMn,normaliseStageSchedule,buildPlanInput,planWindowDays,validateAnnualPlanDraft,materializeAnnualPlan,generateAnnualPlan,estimatePlanLines,planStartDate,addDays,PLAN_LINE_BUDGET,planJsonSchema,type AnnualPlanProvider} from '../src/report/annual-plan.js';
const act=(i:number,band='P2')=>({id:`REC-${i}`,findingId:`ROOT-${i}`,categoryId:`CAT${i}`,cellId:'C02',type:'EXECUTION',titleMn:`Ажил ${i}`,objectiveMn:'Зорилго',actionMn:`Үйлдэл ${i}`,deliverableMn:'Гарц',kpiMn:'Хэмжүүр',ownerRoleId:'R01',sponsorRoleId:'R01',currentCellScore:40,targetCellScore:75,priorityBand:band});
const payload:any={payloadHash:'h'.repeat(64),generatedAt:'2026-12-31T10:00:00.000Z',companyName:'Тест ХХК',overall:{score:60,confidence:.9,coverage:.9,band:'Дунд'},strengths:[],weaknesses:[],
 rootFindings:[{id:'ROOT-1',categoryId:'CAT1',downstreamCategoryIds:['CAT2']}],priorityActions:[act(1,'P1'),act(2),act(3)],evidenceActions:[],risks:[],requiredWarnings:[],displayDictionary:{R01:'Захирал'}};
const {input,refToRecommendationId}=buildPlanInput(payload,'Маркетинг');
const act2=(t:string,ids:string[])=>({textMn:t,recommendationIds:ids});
const good=()=>({schemaVersion:'MMRI-ANNUAL-PLAN-DRAFT-1.0',stages:[
 {id:'E1',headingMn:'Суурь мэдээллийг баталгаажуулах',startDay:0,durationDays:45,dependsOnStageIds:[],dependencyNoteMn:null,actions:[act2('Эхлээд одоогийн байдлыг бичгээр тодорхойлж хариуцагчаа нэрлэнэ.',['F1'])]},
 {id:'E2',headingMn:'Тогтолцоог ажиллуулж эхлэх',startDay:45,durationDays:120,dependsOnStageIds:['E1'],dependencyNoteMn:'Энэ шатны шийдвэр өмнөх шатны үр дүнд тулгуурлана.',actions:[act2('Тогтсон журмыг өдөр тутмын ажилд нэвтрүүлж явцыг сар бүр дүгнэнэ.',['F2'])]},
 {id:'E3',headingMn:'Хэрэгжилтийг бататгах',startDay:165,durationDays:200,dependsOnStageIds:['E2'],dependencyNoteMn:null,actions:[act2('Үр дүнг удирдлагын хурлаар хянаж, шаардлагатай засвар хийнэ.',['F3'])]}]});
const check=(d:any)=>validateAnnualPlanDraft(d,input,refToRecommendationId).issues.map(i=>i.checkId);
describe('12-month plan validation',()=>{
 it('accepts a coordinated, traceable, covered plan',()=>expect(check(good())).toEqual([]));
 it('input uses opaque references and carries dependency hints from the root-cause graph',()=>{expect(Object.keys(refToRecommendationId)).toEqual(['F1','F2','F3']);expect(input.dependencyHints).toEqual([{first:'F1',then:'F2'}])});
 it('dates are computed in code, across a year boundary and a leap year',()=>{
  const plan=materializeAnnualPlan(good().stages as any,payload,{kind:'TEST_DOUBLE',model:'t'});
  expect(plan.startDate).toBe('2026-12-31');expect(plan.stages[0].dateLabel).toBe('2026 оны 12-р сарын 31 - 2027 оны 2-р сарын 13');expect(plan.stages[2].endDate).toBe('2027-12-30');
  expect(addDays(planStartDate('2028-02-28T00:00:00Z'),1).toISOString().slice(0,10)).toBe('2028-02-29');expect(addDays(planStartDate('2028-02-28T00:00:00Z'),366).toISOString().slice(0,10)).toBe('2029-02-28');
 });
 it('rejects invented numbers (budgets, percentages, targets)',()=>{const d=good();d.stages[1].actions[0].textMn='Зардлыг 25 хувиар бууруулж 5 саяын төсөвт багтаана.';expect(check(d)).toContain('INVENTED_NUMBER')});
 it('rejects English words and internal codes in customer text',()=>{const d=good();d.stages[0].actions[0].textMn='KPI хэмжүүрийг F1 дээр тулгуурлан тогтооно.';expect(check(d)).toContain('LANGUAGE')});
 it('rejects robotic labels and repeated label frames',()=>{const d=good();for(const s of d.stages)s.actions[0].textMn='Гарах үр дүн: ажлыг хийж дуусгана уу.';expect(check(d)).toContain('ROBOTIC_PHRASE')});
 it('rejects the same activity repeated in several stages with only a few words changed',()=>{const d:any=good();const t='Төлөгдөөгүй авлагыг хугацаагаар нь ангилж сар бүр удирдлагын хурал дээр хяналтад авч сануулах дараалал тогтооно.';d.stages[0].actions[0].textMn=t;d.stages[2].actions[0].textMn=t.replace('сар бүр','долоо хоног бүр');expect(check(d)).toContain('DUPLICATE_ACTION');});
 it('a genuinely evolved follow-up activity is not flagged as a duplicate',()=>{expect(check(good())).not.toContain('DUPLICATE_ACTION')});
 it('date policy: twelve calendar months, leap years and anniversaries',()=>{
  const w=(d:string)=>planWindowDays(planStartDate(d+'T00:00:00Z'));
  expect(w('2026-11-20')).toBe(365);expect(w('2027-03-01')).toBe(366);expect(w('2027-11-20')).toBe(366);expect(w('2028-03-01')).toBe(365);expect(w('2028-02-29')).toBe(365);expect(w('2027-02-28')).toBe(365);expect(w('2027-02-27')).toBe(365);expect(w('2026-12-31')).toBe(365);
  const start=planStartDate('2027-03-01T00:00:00Z');const last=addDays(start,w('2027-03-01')-1);expect(last.toISOString().slice(0,10)).toBe('2028-02-29');   // day before the anniversary (2028-03-01)
  const s2=planStartDate('2026-11-20T00:00:00Z');expect(addDays(s2,w('2026-11-20')-1).toISOString().slice(0,10)).toBe('2027-11-19');
 });
 it('a stage running past the calendar window is rejected, one reaching the last day is accepted',()=>{
  const d:any=good();d.stages[2].durationDays=365-165+5;expect(check(d)).toContain('STAGE_DATES');});
 it('data minimisation: the provider input carries no company name, ids or contact data',()=>{const j=JSON.stringify(input);expect(j).not.toContain('Тест ХХК');expect(j).not.toMatch(/companyName|@|assessmentId|userId|companyId|payloadHash/)});
 it('requires every finding to be covered',()=>{const d=good();d.stages[2].actions[0].recommendationIds=['F2'];expect(check(d)).toContain('COVERAGE')});
 it('requires sequencing that respects dependencies (root before downstream)',()=>{const d:any=good();d.stages[0].actions[0].recommendationIds=['F2'];d.stages[1].actions[0].recommendationIds=['F1'];expect(check(d)).toContain('SEQUENCE')});
 it('rejects dependencies on later stages, unknown references and stages outside the window',()=>{const d:any=good();d.stages[0].dependsOnStageIds=['E3'];d.stages[2].durationDays=300;d.stages[1].actions[0].recommendationIds=['F9'];const c=check(d);expect(c).toContain('DEPENDENCY');expect(c).toContain('STAGE_DATES');expect(c).toContain('UNKNOWN_REFERENCE')});
 it('rejects plans that do not reach the end of the year and plans with too few stages',()=>{const d:any=good();d.stages[2].durationDays=100;expect(check(d)).toContain('YEAR_COVERAGE');expect(check({...good(),stages:good().stages.slice(0,2)})).toContain('STAGE_COUNT')});
 it('rejects plans too long for one page instead of truncating them',()=>{const d:any=good();for(const s of d.stages)s.actions=Array.from({length:5},()=>act2('Бодит мэдээллийг цуглуулж, шийдвэр гаргах хүмүүстэй хуваалцан дараагийн алхмыг хамтдаа тохиролцоно. '.repeat(4).trim(),['F1','F2','F3']));expect(estimatePlanLines(d.stages)).toBeGreaterThan(PLAN_LINE_BUDGET);expect(check(d)).toContain('TOO_LONG')});
 it('strict JSON schema has every property required and no extra keys',()=>{const s:any=planJsonSchema();expect(s.additionalProperties).toBe(false);const st=s.properties.stages.items;expect(st.required.sort()).toEqual(Object.keys(st.properties).sort());expect(st.properties.actions.items.required.sort()).toEqual(Object.keys(st.properties.actions.items.properties).sort())});
});
describe('generateAnnualPlan boundary',()=>{
 const prov=(drafts:any[]):AnnualPlanProvider=>{let i=0;return {generate:async()=>({draft:drafts[i++],provider:{kind:'TEST_DOUBLE',model:'t'}}),repair:async()=>({draft:drafts[i++],provider:{kind:'TEST_DOUBLE',model:'t'}})}};
 it('without a provider the plan is UNAVAILABLE and nothing is invented',async()=>{expect((await generateAnnualPlan(payload,'Маркетинг',undefined)).state).toBe('UNAVAILABLE')});
 it('a valid draft becomes READY with computed dates',async()=>{const p:any=await generateAnnualPlan(payload,'Маркетинг',prov([good()]));expect(p.state).toBe('READY');expect(p.stages.length).toBe(3);expect(p.provider.kind).toBe('TEST_DOUBLE')});
 it('bounded repairs are allowed, then the plan is rejected rather than shipped',async()=>{const bad:any=good();bad.stages[1].actions[0].textMn='Plan with english words';expect((await generateAnnualPlan(payload,'Маркетинг',prov([bad,good()]))).state).toBe('READY');const r:any=await generateAnnualPlan(payload,'Маркетинг',prov([bad,bad,bad]));expect(r.state).toBe('UNAVAILABLE');expect(r.reason).toContain('LANGUAGE')});
 it('a page-fit failure triggers one repair and otherwise rejects (never truncates)',async()=>{let calls=0;const fits=async()=>{calls++;return false};const r:any=await generateAnnualPlan(payload,'Маркетинг',prov([good(),good()]),{fits});expect(r.state).toBe('UNAVAILABLE');expect(calls).toBe(2)});
 it('a provider failure is reported as UNAVAILABLE with a reason',async()=>{const p:AnnualPlanProvider={generate:async()=>{throw new Error('HTTP 429 [insufficient_quota]')}};const r:any=await generateAnnualPlan(payload,'Маркетинг',p);expect(r.state).toBe('UNAVAILABLE');expect(r.reason).toContain('insufficient_quota')});
});

describe("plan start date follows the Mongolian calendar day", () => {
  it("rolls an evening UTC instant to the next Ulaanbaatar day and keeps date-only values", async () => {
    const { planStartDate } = await import("../src/report/annual-plan.js");
    expect(planStartDate("2026-11-22T17:30:00.000Z").toISOString().slice(0, 10)).toBe("2026-11-23");
    expect(planStartDate("2026-11-22T15:59:00.000Z").toISOString().slice(0, 10)).toBe("2026-11-22");
    expect(planStartDate("2026-11-22").toISOString().slice(0, 10)).toBe("2026-11-22");
  });
});

describe("repeated catalogue sentences and punctuation tidy", () => {
  it("flags the same long sentence in two stages and tidies doubled full stops", async () => {
    const { validateAnnualPlanDraft, tidyPlanText } = await import("../src/report/annual-plan.js");
    expect(tidyPlanText(" Бодит алхам хийнэ.. Дараа нь шалгана ,. ")).toBe("Бодит алхам хийнэ. Дараа нь шалгана.");
    expect(tidyPlanText("Үнэлэх боломжтой болгох., дараа нь тооцно.")).toBe("Үнэлэх боломжтой болгох, дараа нь тооцно.");
    const s = "Дутуу байгаа шууд нотолгоог асуулт бүртгэл эсвэл бодит эх сурвалжаас нөхөж тухайн асуудлыг найдвартай үнэлэх боломжтой болгох.";
    const draft: any = { schemaVersion: "MMRI-ANNUAL-PLAN-DRAFT-1.0", stages: [
      { id: "E1", headingMn: "Суурь шийдвэр ба эхний тогтолцоо", startDay: 0, durationDays: 100, dependsOnStageIds: [], dependencyNoteMn: null, actions: [{ textMn: s, recommendationIds: ["F1"] }] },
      { id: "E2", headingMn: "Хэмжилтээр баталгаажуулах үе", startDay: 100, durationDays: 100, dependsOnStageIds: ["E1"], dependencyNoteMn: null, actions: [{ textMn: s, recommendationIds: ["F2"] }] }] };
    const r = validateAnnualPlanDraft(draft, { domainNameMn: "Маркетинг", findings: [], strengths: [], evidenceChecks: [], dependencyHints: [], windowDays: 365 } as any, {});
    expect(r.issues.some(i => i.checkId === "REPEATED_SENTENCE")).toBe(true);
  });
});

/* ---- root-cause repair: capability-grounded input, coverage of the whole year, no document-collection plans ---- */
const catalog={categories:{CAT1:'Маркетингийн стратеги боловсруулах чадвар',CAT2:'Зорилтот зах зээлийн сонголт',CAT3:'Кампанит ажлын удирдлага'},cells:{C02:{nameMn:'Хэрэглэгч, зах зээлийн хэрэгцээнд нийцэх байдал',groupMn:'Засаглал ба чиглэл'}}};
const rich=buildPlanInput(payload,'Маркетинг',{catalog});
const checkRich=(d:any)=>validateAnnualPlanDraft(d,rich.input,rich.refToRecommendationId).issues.map(i=>i.checkId);
const goodRich=()=>({schemaVersion:'MMRI-ANNUAL-PLAN-DRAFT-1.0',stages:[
 {id:'E1',headingMn:'Зах зээлд тулгуурласан стратегийн чиглэл',startDay:0,durationDays:60,dependsOnStageIds:[],dependencyNoteMn:null,actions:[act2('Маркетингийн стратеги боловсруулах чадварыг сайжруулахын тулд хэрэглэгчдийн хэрэгцээг зах зээл дээр шалгаж, стратегийн чиглэлээ шинэчилнэ.',['F1'])]},
 {id:'E2',headingMn:'Зорилтот зах зээлээ тодорхой болгох',startDay:50,durationDays:140,dependsOnStageIds:['E1'],dependencyNoteMn:null,actions:[act2('Зорилтот зах зээлийн сонголтыг хэрэглэгчийн хэрэгцээнд нийцүүлэн сонгох бичгийн журам гарган, хоёр сегментэд туршина.',['F2'])]},
 {id:'E3',headingMn:'Кампанит ажлын хэрэгжилтийг тогтворжуулах',startDay:190,durationDays:175,dependsOnStageIds:['E2'],dependencyNoteMn:null,actions:[act2('Кампанит ажлын удирдлагыг туршлагад тулгуурлан тогтмол хяналтад оруулж, үр дүнгээр нь дараагийн жилийн төлөвлөгөөг баталгаажуулна.',['F3'])]}]});
describe('plan input is grounded in the diagnosed capability',()=>{
 it('every finding carries its capability and dimension name and the template wording is only a hint',()=>{
  expect(rich.input.findings[0].capabilityMn).toBe('Маркетингийн стратеги боловсруулах чадвар');expect(rich.input.findings[0].dimensionMn).toContain('Хэрэглэгч');
  expect(rich.input.findings[0]).toHaveProperty('methodHintMn');expect(rich.input.findings[0]).not.toHaveProperty('titleMn');
 });
 it('findings that need the same kind of fix are offered as one shared initiative',()=>{
  const p2:any={...payload,priorityActions:[{...act(1),interventionCode:'ESTABLISH_BASELINE'},{...act(2),interventionCode:'ESTABLISH_BASELINE'},{...act(3),interventionCode:'DEFINE_PROCESS'}]};
  expect(buildPlanInput(p2,'Маркетинг',{catalog}).input.sharedInterventions).toEqual([{interventionCode:'ESTABLISH_BASELINE',methodHintMn:'Ажил 1',refs:['F1','F2']}]);
 });
 it('accepts a grounded, whole-year plan',()=>expect(checkRich(goodRich())).toEqual([]));
 it('rejects actions that are not about the diagnosed capability',()=>{const d=goodRich();for(const s of d.stages)s.actions[0].textMn='Ажилтнуудтай уулзалт зохион байгуулж, санал бодлыг сонсоод дараагийн алхмаа шийднэ.';expect(checkRich(d)).toContain('NOT_GROUNDED')});
 it('rejects a plan made of evidence and document collection',()=>{const d=goodRich();for(const s of d.stages)s.actions[0].textMn='Маркетингийн стратеги боловсруулах чадварт хамаарах нотолгоог цуглуулж баримт бичгийг бэлтгэнэ.';expect(checkRich(d)).toContain('EVIDENCE_OVERUSE')});
 it('rejects the generic intervention titles as plan text',()=>{const d=goodRich();d.stages[0].actions[0].textMn='Хяналтын давтамжийг тохируулах ажлыг маркетингийн стратеги боловсруулах чадварт хийнэ.';expect(checkRich(d)).toContain('ROBOTIC_PHRASE')});
});
describe('the whole twelve months are accounted for (regression for the 76-day hole)',()=>{
 it('rejects a plan with an unexplained gap, a late start or an early end',()=>{
  const gap=goodRich();gap.stages[1].startDay=100;gap.stages[1].durationDays=90;expect(checkRich(gap)).toContain('SCHEDULE_GAP');
  const late=goodRich();late.stages[0].startDay=30;late.stages[0].durationDays=30;expect(checkRich(late)).toContain('YEAR_START');
  const early=goodRich();early.stages[2].durationDays=60;expect(checkRich(early)).toContain('YEAR_COVERAGE');
 });
 it('closes small gaps and runs the last stage to the last day of the window (365 and 366 day windows, leap year)',()=>{
  for(const [gen,win] of [['2026-09-08T02:00:00Z',365],['2027-03-01T02:00:00Z',366],['2028-02-29T02:00:00Z',365],['2026-12-31T20:00:00Z',365]] as const){
   const draft:any=[{id:'E1',headingMn:'a',startDay:0,durationDays:14,dependsOnStageIds:[],dependencyNoteMn:null,actions:[]},{id:'E2',headingMn:'b',startDay:20,durationDays:70,dependsOnStageIds:[],dependencyNoteMn:null,actions:[]},{id:'E3',headingMn:'c',startDay:100,durationDays:200,dependsOnStageIds:[],dependencyNoteMn:null,actions:[]}];
   const s=normaliseStageSchedule(draft,win);expect(s[0].startDay).toBe(0);
   const ends=s.map(x=>x.startDay+x.durationDays-1);expect(Math.max(...ends)).toBe(win-1);
   for(let i=1;i<s.length;i++)expect(s[i].startDay).toBeLessThanOrEqual(Math.max(...s.slice(0,i).map(x=>x.startDay+x.durationDays))); // no uncovered day
  }
 });
 it('keeps legitimate overlaps and never reorders or shortens real work',()=>{
  const d:any=[{id:'E1',headingMn:'a',startDay:0,durationDays:90,dependsOnStageIds:[],dependencyNoteMn:null,actions:[]},{id:'E2',headingMn:'b',startDay:60,durationDays:305,dependsOnStageIds:[],dependencyNoteMn:null,actions:[]}];
  const s=normaliseStageSchedule(d,365);expect(s[0].durationDays).toBe(90);expect(s[1].startDay).toBe(60);expect(s[1].startDay+s[1].durationDays-1).toBe(364);
 });
 it('the materialised plan for the saved Marketing report period (2026-09-08) is contiguous and ends on 2027-09-07',()=>{
  const p:any={...payload,generatedAt:'2026-09-08T02:00:00.000Z'};
  const plan=materializeAnnualPlan(goodRich().stages as any,p,{kind:'TEST_DOUBLE',model:'t'});
  expect(plan.startDate).toBe('2026-09-08');expect(plan.endDate).toBe('2027-09-07');
  for(let i=1;i<plan.stages.length;i++)expect(plan.stages[i].startDate<=addDays(new Date(plan.stages[i-1].endDate+'T00:00:00Z'),1).toISOString().slice(0,10)).toBe(true);
 });
 it('uses the Mongolian calendar day around midnight UTC+8',()=>{expect(planStartDate('2026-12-31T16:30:00.000Z').toISOString().slice(0,10)).toBe('2027-01-01');expect(planStartDate('2026-12-31T15:59:00.000Z').toISOString().slice(0,10)).toBe('2026-12-31')});
});
describe('natural single-line period labels',()=>{
 const L=(a:string,b:string)=>planPeriodLabelMn(new Date(a+'T00:00:00Z'),new Date(b+'T00:00:00Z'));
 it('whole months, partial months and year crossings',()=>{
  expect(L('2027-01-01','2027-03-31')).toBe('2027 оны 1-3-р сар');expect(L('2027-02-01','2027-02-28')).toBe('2027 оны 2-р сар');
  expect(L('2026-09-08','2026-12-07')).toBe('2026 оны 9-р сарын 8 - 12-р сарын 7');expect(L('2026-12-08','2027-03-07')).toBe('2026 оны 12-р сарын 8 - 2027 оны 3-р сарын 7');
  expect(L('2028-02-29','2028-05-28')).toBe('2028 оны 2-р сарын 29 - 5-р сарын 28');expect(L('2027-01-31','2027-02-27')).toBe('2027 оны 1-р сарын 31 - 2-р сарын 27');
 });
});

/* ---- second independent repair: wording rules, real grounding, questionnaire answers, version binding, bounded repairs ---- */
import fs from 'node:fs';
import {planEvidenceLine,planForPayload,MAX_PLAN_REPAIRS,planSystemInstructions} from '../src/report/annual-plan.js';
import {checkPlanLanguage} from '../src/report/annual-plan-language.js';
import {plainMn} from '../src/report/plain-terms.js';
const lang=(texts:string[],opt?:{starts?:number[];names?:string[]})=>checkPlanLanguage(texts.map((t,i)=>({id:`E${i+1}`,startDay:opt?.starts?.[i]??i*40,durationDays:40,headingMn:'Гарчиг',dependencyNoteMn:null,actions:[{textMn:t}]})),365,opt?.names??[]).map(i=>i.checkId);
describe('wording rules of the plan',()=>{
 it('a diagnostic score or a date digit does not license an invented number',()=>{
  const p:any={...payload,overall:{score:25}};const b=buildPlanInput({...p,priorityActions:p.priorityActions.map((x:any)=>({...x,currentCellScore:25}))},'Маркетинг',{catalog});
  for(const t of ['Хэрэглэгчийн хэрэгцээг судалж стратегийн чанарыг 25 оноогоор нэмэгдүүлнэ.','Маркетингийн стратегийг 12 дахь долоо хоногт шинэчилж хэрэглэгчид танилцуулна.']){const d=goodRich();d.stages[0].actions[0].textMn=t;expect(validateAnnualPlanDraft(d,b.input,b.refToRecommendationId).issues.map(i=>i.checkId)).toContain('INVENTED_NUMBER')}
 });
 it('rejects amounts, percentages, staff counts and promised results written in words',()=>{
  for(const t of ['Борлуулалтыг хорин хувиар өсгөнө.','Энэ ажилд арван сая төгрөг зарцуулна.','Гурван мэргэжилтэн томилж ажиллуулна.','Шинээр ажилтан авч энэ ажлыг хариуцуулна.','Ингэснээр борлуулалт заавал өснө.'])expect(lang([t]),t).toContain('UNSUPPORTED_CLAIM');
  expect(lang(['Нэг хүн энэ ажлыг ахалж, долоо хоног бүр явцыг тайлагнана.'])).toEqual([]);
 });
 it('rejects bare commands, accepts the descriptive form',()=>{
  expect(lang(['Хэрэглэгчийн бүлгийг хооронд нь харьцуул.','Сонгосон чиглэлээ удирдлагатай ярилц.','Үр дүнг тэмдэглэнэ.'])).toContain('VERB_FORM');
  expect(lang(['Хэрэглэгчийн бүлгийг хооронд нь харьцуулна.','Сонгосон чиглэлээ удирдлагатай ярилцаж батална.'])).toEqual([]);
 });
 it('rejects the same advice under another capability name',()=>{
  const t=(c:string)=>`${c} чиглэлийн ажлын дарааллыг хамтран зурж, давхардсан алхмыг хасаад шинэчилсэн зааврыг багийн гишүүдэд танилцуулж туршина.`;
  expect(lang([t('Кампанит ажлын удирдлага'),t('Үнэ тогтоох бодлого')],{names:['Кампанит ажлын удирдлага','Үнэ тогтоох бодлого']})).toContain('SAME_ADVICE');
 });
 it('flags one formula carried through the plan',()=>{expect(lang(['Захиалгыг ангилна. Ингэснээр саатлыг олно.','Үнийг хянана. Ингэснээр алдагдлыг мэднэ.','Гэрээг шалгана. Ингэснээр эрсдэлийг харна.','Нөөцийг тоолно. Ингэснээр дутлыг илрүүлнэ.'])).toContain('FORMULAIC')});
 it('time words must agree with the schedule',()=>{expect(lang(['Эхний сард багийн гишүүд хэрэглэгчидтэй ярилцана.'],{starts:[120]})).toContain('TIME_REFERENCE');expect(lang(['Жилийн эцэст хийсэн ажлаа дүгнэнэ.'],{starts:[0]})).toContain('TIME_REFERENCE')});
 it('compliance wording is rejected',()=>{expect(lang(['Шаардлагатай нотолгоог бүрдүүлж хадгална.'])).toContain('ROBOTIC_PHRASE')});
});
describe('grounding cannot be satisfied by the domain name or by a reference list',()=>{
 it('the domain word alone does not ground an action',()=>{const d=goodRich();for(const s of d.stages)s.actions[0].textMn='Маркетингийн багийн уулзалтыг тогтмолжуулж дараагийн алхмаа хамтран шийднэ.';expect(checkRich(d)).toContain('NOT_GROUNDED')});
 it('a finding that is cited but never discussed is reported',()=>{const d:any=goodRich();d.stages[2].actions[0]={textMn:'Зорилтот зах зээлийн сонголтыг хэрэглэгчийн хэрэгцээнд нийцүүлэн дахин тулгаж, дараагийн жилийн чиглэлээ шийднэ.',recommendationIds:['F3','F2']};expect(checkRich(d)).toContain('FINDING_NOT_DISCUSSED')});
 it('a capability named only with everyday words is still recognised when it is named',()=>{
  const cat={...catalog,categories:{...catalog.categories,CAT3:'Маркетингийн зорилго ба чиглэл'}};const b=buildPlanInput(payload,'Маркетинг',{catalog:cat});const run=(t:string)=>{const d:any=goodRich();d.stages[2].actions[0]={textMn:t,recommendationIds:['F3']};return validateAnnualPlanDraft(d,b.input,b.refToRecommendationId).issues.map(i=>i.checkId)};
  expect(run('Маркетингийн зорилго, чиглэлээ удирдлагын багтай дахин ярилцаж, дараагийн жилийн сонголтоо шийднэ.')).not.toContain('FINDING_NOT_DISCUSSED');
  expect(run('Маркетингийн багийн уулзалтыг тогтмолжуулж, дараагийн алхмаа хамтран шийднэ.')).toContain('FINDING_NOT_DISCUSSED');
 });
 it('a stage cannot depend on results of work that has barely started',()=>{const d=goodRich();d.stages[1].startDay=10;d.stages[1].durationDays=180;expect(checkRich(d)).toContain('DEPENDENCY')});
 it('early work stretched over the whole year is reported',()=>{const d:any=goodRich();d.stages[1].startDay=40;d.stages[2].startDay=100;d.stages[2].durationDays=265;d.stages[1].durationDays=100;d.stages[2].dependsOnStageIds=[];expect(checkRich(d)).toContain('LATE_YEAR')});
});
describe('questionnaire answers reach the planner',()=>{
 const row=(cellId:string,score:number|null,answer:string|null,status='ANSWERED')=>({status,cellId,questionMn:`Асуулт ${answer}`,answerMn:answer,score});
 it('answers about the weak dimension come first, then the weakest others; unknown answers are only counted',()=>{
  const l=planEvidenceLine('F1','C05',[row('C01',80,'а'),row('C02',10,'б'),row('C05',60,'в'),row('C03',null,null,'DNK'),row('C05',20,'г'),row('C04',40,'д')]);
  expect(l.examplesMn.map(x=>x.split('-> ')[1])).toEqual(['г','в','б','д']);expect([l.answered,l.unknown]).toEqual([5,1]);
 });
 it('root role and affected capabilities are part of the input',()=>{
  const p:any={...payload,rootFindings:[{id:'ROOT-1',categoryId:'CAT1',classification:'PRIMARY_ROOT_CAUSE',downstreamCategoryIds:['CAT2','CAT1']}]};
  const f=buildPlanInput(p,'Маркетинг',{catalog}).input.findings[0];expect(f.rootRole).toBe('PRIMARY_ROOT_CAUSE');expect(f.affectsMn).toEqual(['Зорилтот зах зээлийн сонголт']);
 });
 it('the full root-cause graph gives the dependencies of the priorities (the payload keeps only three root findings); reciprocal pairs are dropped',()=>{
  const p:any={...payload,rootFindings:[{id:'OTHER',categoryId:'CAT9',downstreamCategoryIds:[]}]};expect(buildPlanInput(p,'Маркетинг',{catalog}).input.dependencyHints).toEqual([]);
  const rootFindings=[{id:'ROOT-1',categoryId:'CAT1',downstreamCategoryIds:['CAT2','CAT3']},{id:'ROOT-2',categoryId:'CAT2',downstreamCategoryIds:['CAT1','CAT3']}];
  expect(buildPlanInput(p,'Маркетинг',{catalog,rootFindings}).input.dependencyHints).toEqual([{first:'F1',then:'F2'},{first:'F1',then:'F3'},{first:'F2',then:'F3'}]);
 });
 it('order is binding for confirmed causes and advisory for findings the diagnosis calls isolated',()=>{
  const run=(c:string)=>{const b=buildPlanInput({...payload,rootFindings:[{id:'ROOT-1',categoryId:'CAT1',classification:c,downstreamCategoryIds:['CAT2']}]} as any,'Маркетинг');const d:any=good();d.stages[0].actions[0].recommendationIds=['F2'];d.stages[1].actions[0].recommendationIds=['F1'];return validateAnnualPlanDraft(d,b.input,b.refToRecommendationId).issues.map(i=>i.checkId)};
  expect(run('PRIMARY_ROOT_CAUSE')).toContain('SEQUENCE');expect(run('ISOLATED_WEAKNESS')).toContain('SEQUENCE_HINT');expect(run('ISOLATED_WEAKNESS')).not.toContain('SEQUENCE');
 });
 it('the plan input uses the Ulaanbaatar calendar day',()=>expect(buildPlanInput({...payload,generatedAt:'2026-12-31T20:00:00Z'},'Маркетинг').input.reportDate).toBe('2027-01-01'));
 it('the prompt asks for answers, verb form and no scores',()=>{const s=planSystemInstructions();for(const k of ['evidenceFromAnswers','тогтооно','rootRole'])expect(s).toContain(k)});
});
describe('bounded repairs and version binding',()=>{
 const provider=(drafts:any[])=>{const calls={n:0};const next=async()=>{const d=drafts[Math.min(calls.n,drafts.length-1)];calls.n++;return {draft:d,usage:{inputTokens:10,outputTokens:5},provider:{kind:'TEST_DOUBLE' as const,model:'t'}}};return {calls,p:{generate:next,repair:next} as AnnualPlanProvider}};
 it('never makes more than one generation and the allowed repairs, and reports each call',async()=>{const bad:any=goodRich();bad.stages[0].actions[0].textMn='English plan text that must be rejected';const {calls,p}=provider([bad]);const log:any[]=[];const r=await generateAnnualPlan(payload,'Маркетинг',p,{extras:{catalog},onCall:c=>log.push(c)});expect(r.state).toBe('UNAVAILABLE');expect(calls.n).toBe(1+MAX_PLAN_REPAIRS);expect(log.length).toBe(calls.n);expect(log[0].usage).toEqual({inputTokens:10,outputTokens:5})});
 it('a style finding costs at most one repair and does not discard a valid plan',async()=>{const soft:any=goodRich();soft.stages[1].startDay=40;soft.stages[1].durationDays=70;soft.stages[2].startDay=105;soft.stages[2].durationDays=260;expect(checkRich(soft)).toEqual(['LATE_YEAR']);const {calls,p}=provider([soft]);const r=await generateAnnualPlan(payload,'Маркетинг',p,{extras:{catalog}});expect(r.state).toBe('READY');expect(calls.n).toBe(2)});
 it('malformed model output never becomes a plan',async()=>{for(const d of [null,'текст',{},{schemaVersion:'MMRI-ANNUAL-PLAN-DRAFT-1.0',stages:[]},{schemaVersion:'MMRI-ANNUAL-PLAN-DRAFT-1.0',stages:[{id:'E1'}]},{schemaVersion:'MMRI-ANNUAL-PLAN-DRAFT-1.0',stages:[null]}])expect((await generateAnnualPlan(payload,'Маркетинг',provider([d]).p)).state).toBe('UNAVAILABLE')});
 it('a plan generated for another payload is not used',()=>{const plan=materializeAnnualPlan(good().stages as any,payload,{kind:'TEST_DOUBLE',model:'t'});expect(planForPayload(plan,payload.payloadHash)).toBe(plan);expect(planForPayload(plan,'x'.repeat(64))).toBeNull();expect(planForPayload(undefined,'x')).toBeNull()});
 it('stored plan text already uses the plain terms the web page shows, so web and PDF read the same',()=>{
  const st:any=good().stages;st[0].headingMn='Капитал хуваарилалтын засаглал';const plan=materializeAnnualPlan(st,payload,{kind:'TEST_DOUBLE',model:'t'});expect(plan.stages[0].headingMn).toBe('Хөрөнгийн хуваарилалт, зарцуулалтын удирдлага');
  const web=fs.readFileSync(new URL('../../frontend/src/data/plainTerms.ts',import.meta.url),'utf8');const own=fs.readFileSync(new URL('../src/report/plain-terms.ts',import.meta.url),'utf8');
  for(const m of own.matchAll(/\["([^"]+)", "([^"]+)"\]/g))expect(web).toContain(`['${m[1]}','${m[2]}']`);
  expect(plainMn(plainMn('засаглалын'))).toBe('удирдлагын');
 });
});
