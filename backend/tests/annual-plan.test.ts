import {describe,it,expect} from 'vitest';
import {buildPlanInput,planWindowDays,validateAnnualPlanDraft,materializeAnnualPlan,generateAnnualPlan,estimatePlanLines,planStartDate,addDays,PLAN_LINE_BUDGET,planJsonSchema,type AnnualPlanProvider} from '../src/report/annual-plan.js';
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
  expect(plan.startDate).toBe('2026-12-31');expect(plan.stages[0].dateLabel).toBe('2026.12.31 - 2027.02.13');expect(plan.stages[2].endDate).toBe('2027-12-30');
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
