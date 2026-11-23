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
 it('one repair is allowed, then the plan is rejected rather than shipped',async()=>{const bad:any=good();bad.stages[1].actions[0].textMn='Plan with english words';expect((await generateAnnualPlan(payload,'Маркетинг',prov([bad,good()]))).state).toBe('READY');const r:any=await generateAnnualPlan(payload,'Маркетинг',prov([bad,bad]));expect(r.state).toBe('UNAVAILABLE');expect(r.reason).toContain('LANGUAGE')});
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
    const r = validateAnnualPlanDraft(draft, { findings: [], evidenceChecks: [], dependencyHints: [], windowDays: 365 } as any, {});
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
