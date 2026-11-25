import { describe, it, expect } from "vitest";
import { GuidePicker, buildReportGuidance, coverageText, named, plainRole, practiceKind } from "../src/report/guidance/index.js";
import { MARKETING_GUIDE } from "../src/report/guidance/marketing.js";
import { DIMENSION_GUIDE } from "../src/report/guidance/dimensions.js";
import { PRACTICE_KINDS, PRACTICE_MAP } from "../src/report/guidance/practices.js";
import { CAPABILITY_CONTENT } from "../src/report/guidance/capabilities.js";
import { contradictionMessage } from "../src/report/payload.js";
import { guidanceIssues } from "../src/report/guidance/check.js";
import { deterministicFallbackNarrative } from "../src/report/fallback-renderer.js";
import { validateNarrativeDraft } from "../src/report/validator.js";
import { DIMENSION_CHECK, DIMENSION_LANGUAGE, PLAIN_NAMES, dimensionSays, glossaryIssues, withPlainNames } from "../src/report/guidance/language.js";
import { MARKETING_COVERS } from "../src/report/guidance/marketing-covers.js";
import { validateAnnualPlanDraft } from "../src/report/annual-plan.js";
import { deterministicAnnualPlan } from "../src/report/guidance/year-plan.js";

const rows = (t: string) => t.trim().split("\n").filter(l => l.includes("|")).map(l => l.split("|"));
const priority = (i: number, over: any = {}) => ({ recommendationId: `R${i}`, evidence: false, capabilityMn: `Чадавх ${"абвгд"[i]}`, dimensionMn: "Бодит хэрэгжилт", whyMn: "Шалтгаан", goalMn: "Зорилго", ...(() => { const p = new GuidePicker().pick(["MS09", "MS13", "MS31", "MS40", "MS43"][i], "C02"); return { doMn: `${p.start}.`, deliverableMn: p.deliverable, checkMn: p.check, steps: { startMn: `${p.start}.`, runMn: `${p.run}.`, embedMn: `${p.embed}.` } }; })(), ...over });
const payload = (over: any = {}): any => ({ payloadHash: "h", generatedAt: "2026-11-25T00:00:00.000Z", strengths: [], weaknesses: [], risks: [], displayDictionary: { R02: "Менежер" }, priorityActions: [0, 1, 2, 3, 4].map(i => ({ id: `R${i}`, ownerRoleId: "R02", titleMn: "t", targetCellScore: 60 })), guidance: { version: "x", findings: {}, affects: [], targetNoteMn: "тайлбар", selectionNoteMn: "тайлбар", coverageNoteMn: "тайлбар", priorities: [0, 1, 2, 3, 4].map(i => priority(i)) }, ...over });

describe("guidance tables", () => {
  it("cover all 64 marketing capabilities, all 46 scored dimensions besides C02 and all 64 capabilities of the other four domains", () => {
    expect(rows(MARKETING_GUIDE)).toHaveLength(64); expect(new Set(rows(DIMENSION_GUIDE).map(r => r[0])).size).toBe(46);
    for (const d of ["FINMRI", "HRMRI", "ISMRI", "OPMRI"]) { expect(PRACTICE_MAP[d]).toHaveLength(64); for (const k of PRACTICE_MAP[d]) expect(PRACTICE_KINDS).toContain(`\n${k}\n`); }
    for (const r of [...rows(MARKETING_GUIDE), ...rows(DIMENSION_GUIDE)]) expect(r, r[0]).toHaveLength(6); expect(practiceKind("UNKNOWN")).toBe("X");
  });
  it("contain no figures, Latin words, money or unfinished placeholders, and every step is a finite Mongolian sentence", () => {
    for (const r of [...rows(MARKETING_GUIDE).map(x => x.slice(1)), ...rows(DIMENSION_GUIDE).map(x => x.slice(1)), ...rows(PRACTICE_KINDS)]) {
      for (const t of r) { const plain = t.replace(/\{c\}/g, ""); expect(plain, t).not.toMatch(/[A-Za-z0-9%₮]|төгрөг|хувиар|сая /); expect(named(t, "Х")).not.toMatch(/\{c\}|»-/); }
      for (const t of r.slice(0, 3)) expect(t, t).toMatch(/(?:на|нэ|но|нө)$/);
    }
  });
  it("never gives two priorities of one report the same text, even five times the same dimension", () => {
    for (const cell of ["C02", "C07", "C22"]) for (const ids of [["FINMRI-C20", "FINMRI-C20", "FINMRI-C17", "FINMRI-C18", "FINMRI-C19"], ["MS01", "MS01", "MS02", "MS03", "MS04"]]) { const g = new GuidePicker(); const s = ids.map(i => g.pick(i, cell).start); expect(new Set(s).size, `${cell} ${ids}`).toBe(5); }
  });
  it("speaks about the dimension that was found weak, not only about the capability", () => { expect(new GuidePicker().pick("FINMRI-C20", "C09").start).toMatch(/шийдвэр/); expect(new GuidePicker().pick("MS13", "C20").start).toMatch(/ур чадвар/); });
  it("shows Mongolian role names", () => expect(plainRole("CRM / хэрэглэгчийн туршлага / retention хариуцсан ажилтан")).not.toMatch(/[A-Za-z]/));
});
describe("year plan without a model", () => {
  it("covers the whole year, continues every priority and keeps real work after month six", () => { const p = payload(), plan = deterministicAnnualPlan(p)!; expect(guidanceIssues(p, plan)).toEqual([]); expect(plan.startDate).toBe("2026-11-25"); expect(plan.endDate).toBe("2027-11-24"); expect(plan.stages.filter(s => s.startDay >= 180).flatMap(s => s.actions).length).toBeGreaterThanOrEqual(4); });
  it("starts a priority after the one it depends on", () => { const p = payload(); p.guidance.affects = [{ first: "R4", then: "R0" }]; const plan = deterministicAnnualPlan(p)!; const at = (n: number) => plan.stages.find(s => s.actions.some(a => a.recommendationIds.length === 1 && a.recommendationIds[0] === `F${n}`))!.startDay; expect(at(5)).toBeLessThanOrEqual(at(1)); });
  it("clarifies unjudged findings in the first four months", () => { const p = payload(); for (const i of [3, 4]) p.guidance.priorities[i].evidence = true; const plan = deterministicAnnualPlan(p)!; const first = plan.stages.findIndex(s => s.actions.some(a => a.recommendationIds.includes("F4"))); expect(plan.stages[first].startDay).toBeLessThan(105); });
  it("is not produced for a payload without guidance (every earlier report)", () => expect(deterministicAnnualPlan(payload({ guidance: undefined }))).toBeNull());
});
describe("content checks find the reported defects", () => {
  it("repeated instructions, missing deliverables, unexplained targets and invented figures", () => {
    const p = payload(); p.guidance.priorities[1].doMn = p.guidance.priorities[0].doMn; expect(guidanceIssues(p, null).join()).toContain("REPEATED_ACTION");
    const q = payload(); q.guidance.priorities[2].deliverableMn = ""; q.guidance.priorities[3].doMn += " Борлуулалтыг 20 хувиар өсгөнө."; q.guidance.targetNoteMn = null; const s = guidanceIssues(q, null).join(); expect(s).toContain("MISSING_deliverableMn:3"); expect(s).toContain("FIGURE:4"); expect(s).toContain("TARGET_UNEXPLAINED");
  });
});

describe("independent review 2026-11-25", () => {
  const ids = ["FINMRI-C17", "HRMRI-C17", "ISMRI-C17", "OPMRI-C17"];
  const m = (o: any = {}): any => ({ categories: ids.map(id => ({ id, nameMn: `Нэр ${id.slice(0, 2) === "FI" ? "санхүү" : id.slice(0, 2) === "HR" ? "сургалт" : id.slice(0, 2) === "IS" ? "систем" : "хүчин чадал"}` })), cells: [{ id: "C09", nameMn: "Шийдвэр гаргах эрх тодорхой эсэх" }], questions: [], contracts: { recommendation: { composition: { categoryObjectives: [] } } }, ...o });
  const snap = (o: any = {}): any => ({ cells: new Map(), contradictions: [], overall: { coverage: 0.027, confidence: 1 }, ...o });
  const action = (id: string): any => ({ id: `R-${id}`, findingId: "f", categoryId: id, cellId: "C09", type: "LOCAL_IMPROVEMENT", titleMn: "t", objectiveMn: "o", targetCellScore: 60, components: { severity: 0.9, purposeEmphasis: 0.8, feasibility: 0.2 } });
  const build = (parts: any, strategy: any = { rootCause: { findings: [] }, recommendations: { candidates: [] } }, s = snap()) => buildReportGuidance(m(), s, strategy, { strengths: [], weaknesses: [], priorityActions: [], ...parts });
  it("has its own scope, step and evidence for all 256 non-marketing capabilities, none shared", () => { expect(CAPABILITY_CONTENT.size).toBe(256); expect(new Set([...CAPABILITY_CONTENT.values()].map(c => c.step)).size).toBe(256); expect(new Set([...CAPABILITY_CONTENT.values()].map(c => c.evidence)).size).toBe(256); for (const c of CAPABILITY_CONTENT.values()) { expect(c.step).toMatch(/(?:на|нэ|но|нө)$/); expect(c.covers + c.step + c.evidence).not.toMatch(/[A-Za-z0-9%]/); } });
  it("the same weak dimension gives different work for an operating margin, a training design, a BI platform and capacity use", () => { const all = ids.map(id => build({ priorityActions: [action(id)] }).priorities[0]); expect(new Set(all.map(x => x.doMn)).size).toBe(4); expect(new Set(all.map(x => x.deliverableMn)).size).toBe(4); expect(new Set(all.map(x => x.steps.runMn)).size).toBe(4); expect(all[2].doMn).toMatch(/агуулах/); expect(all[0].doMn).toMatch(/Тогтмол зардал/i); });
  it("never calls a good or merely unasked capability weak", () => { const g = build({ weaknesses: [{ id: "W", categoryId: ids[3], nameMn: "Х", score: 100, needsEvidence: true }] }); expect(g.findings.W).toContain("Сул гэж тогтоогоогүй"); const p = payload(); p.weaknesses = [{ id: "W", score: 100, categoryId: "x" }]; expect(guidanceIssues(p, null).join()).toContain("INVENTED_WEAKNESS"); });
  it("explains why a low score is not among the five, and by which parts of the accepted ranking a priority was chosen", () => { const g = build({ priorityActions: [action(ids[0])], weaknesses: [{ id: "A", categoryId: ids[1], nameMn: "Эхний", score: 0 }, { id: "B", categoryId: ids[2], nameMn: "Хоёр дахь", score: 0 }] }, { rootCause: { findings: [] }, recommendations: { candidates: [{ categoryId: ids[1], type: "LOCAL_IMPROVEMENT" }, { categoryId: ids[2], type: "COLLECT_EVIDENCE" }] } }); expect(g.selectionNoteMn).toContain("«Эхний» бага оноотой ч"); expect(g.selectionNoteMn).toContain("«Хоёр дахь» ажлын талаар зөвлөмж өгөхийн өмнө"); expect(g.priorities[0].whyMn).toContain("Дутагдал нь их"); });
  it("says what coverage and confidence mean", () => { expect(coverageText(0.027)).toBe("2.7"); expect(coverageText(0.406)).toBe("41"); expect(coverageText(null)).toBeNull(); expect(build({ priorityActions: [action(ids[0])] }).coverageNoteMn).toMatch(/2\.7%.*сул гэж үзээгүй.*хариулсан хэсэгт/); });
  it("flags a finding whose answers contradict and words the warning by topic", () => { const g = build({ strengths: [{ id: "S", categoryId: ids[0] }] }, undefined, snap({ contradictions: [{ type: "HARD", categoryId: ids[0], affectedCellIds: ["C02"] }] })); expect(g.findings.S).toContain("зөрсөн"); expect(contradictionMessage(["А", "Б", "В", "Г"])).toBe("4 сэдвийн хариултууд хоорондоо эрс зөрсөн («А», «Б», «В» болон бусад). Эдгээрийн дүнг дахин шалгаж баталгаажуулна."); });
});

describe("language of new reports", () => {
  const plan = () => { const p = payload(); p.guidance.version = "MMRI-REPORT-GUIDANCE-1.1"; return deterministicAnnualPlan(p)!; };
  it("says what an answer means and never quotes the questionnaire or its ids", () => { for (const [id, d] of DIMENSION_LANGUAGE) for (const s of [0, 45, 90]) { const t = dimensionSays(id, s); expect(t).toMatch(/[а-яөү]\.$/u); expect(glossaryIssues(t)).toEqual([]); expect(new Set([d.good, d.mid, d.low]).size).toBe(3); } expect(DIMENSION_LANGUAGE.size).toBe(47); });
  it("keeps known literal translations out of every text table", () => { for (const t of [MARKETING_GUIDE, DIMENSION_GUIDE, PRACTICE_KINDS]) for (const r of rows(t)) for (const c of r) expect(glossaryIssues(c), c).toEqual([]); for (const c of CAPABILITY_CONTENT.values()) for (const x of Object.values(c)) expect(glossaryIssues(x as string), x as string).toEqual([]); expect(MARKETING_COVERS.size).toBe(64); for (const n of PLAIN_NAMES.values()) expect(glossaryIssues(n)).toEqual([]); });
  it("finds them in a sentence, but not in a canonical name that must be kept", () => { expect(glossaryIssues("Кампанит ажлын товч даалгавар")).toHaveLength(2); expect(glossaryIssues("3-р ажил: үргэлжлүүлнэ")).toHaveLength(1); expect(glossaryIssues("Кампанит ажил, суваг талаар", ["Кампанит ажил, суваг"])).toEqual([]); });
  it("replaces canonical names once, longest first, and changes nothing without frozen names", () => { expect(withPlainNames("«А нэр Б» ба «А нэр»", { "А нэр": "х", "А нэр Б": "А нэр хэл" })).toBe("«А нэр хэл» ба «х»"); expect(withPlainNames("А нэр", undefined)).toBe("А нэр"); });
  it("gives every stage its goal, result, check and role and never numbers the actions", () => { for (const s of plan().stages) { expect(Object.values(s.guide!).every(x => x.length > 5)).toBe(true); for (const a of s.actions) expect(a.textMn).not.toMatch(/\d-р ажил/u); } });
  it("a model plan of a new report without the stage guide, or with such wording, is refused", () => {
    const base: any = { findings: [], evidenceChecks: [], sharedInterventions: [], dependencyHints: [], strengths: [], windowDays: 365, domainNameMn: "Маркетинг", stageGuideRequired: true }, draft = (g: any) => ({ schemaVersion: "MMRI-ANNUAL-PLAN-DRAFT-1.0", stages: [{ id: "E1", headingMn: "Эхний шийдвэр гаргах", startDay: 0, durationDays: 365, dependsOnStageIds: [], dependencyNoteMn: null, ...g, actions: [{ textMn: "Удирдлага хэрэглэгчийн хариуг хамт ярилцаж шийднэ.", recommendationIds: ["F1"] }] }] });
    expect(validateAnnualPlanDraft(draft({}), base, { F1: "R" }).issues.map(i => i.checkId)).toContain("STAGE_GUIDE");
    const ok = { guide: { goalMn: "Шийдвэрээ гаргах", resultMn: "Бичсэн шийдвэр", doneMn: "Шийдвэр гарсан эсэх", ownerMn: "Маркетингийн захирал" } };
    expect(validateAnnualPlanDraft(draft(ok), base, { F1: "R" }).issues.map(i => i.checkId)).not.toContain("STAGE_GUIDE");
    expect(validateAnnualPlanDraft(draft({ guide: { ...ok.guide, resultMn: "Кампанит ажлын тайлан" } }), base, { F1: "R" }).issues.map(i => i.checkId)).toContain("TERMINOLOGY");
  });
});

describe("editorial review 2026-11-26: phrases and meaning", () => {
  const MAL = /»\s+талаар|сааттаг|саатдаг тохиролц|сонгосон шалгуурын хүснэгт/iu;
  const cats = ["ISMRI-C22", "ISMRI-C20", "FINMRI-C20", "HRMRI-C13", "OPMRI-C02", "OPMRI-C03"];
  const meth: any = { categories: cats.map(id => ({ id, nameMn: `Нэр ${id}` })), cells: [{ id: "C02", nameMn: "Бодит хэрэгжилт" }, { id: "C07", nameMn: "Эцсийн хариуцагч тодорхой эсэх" }, { id: "C16", nameMn: "Тогтвортой байдал" }], questions: [], contracts: {} };
  const act = (id: string, cellId: string, type = "COLLECT_EVIDENCE"): any => ({ id: `R-${id}-${cellId}`, findingId: "f", categoryId: id, cellId, type, titleMn: "t", objectiveMn: "o", components: {} });
  const make = (priorityActions: any[], coverage = 0.5) => buildReportGuidance(meth, { cells: new Map(), contradictions: [], overall: { coverage, confidence: 1 } } as any, { rootCause: { findings: [] }, recommendations: { candidates: [] } } as any, { strengths: [], weaknesses: [], priorityActions });
  it("no malformed phrase in any table or generated text", () => {
    for (const x of [MARKETING_GUIDE, DIMENSION_GUIDE, PRACTICE_KINDS, ...[...CAPABILITY_CONTENT.values()].flatMap(c => Object.values(c) as string[])]) expect(x).not.toMatch(MAL);
    for (const cell of DIMENSION_CHECK.keys()) { const g = make(cats.slice(0, 5).map(c => act(c, cell))); expect(JSON.stringify(g.priorities)).not.toMatch(MAL); }
  });
  it("cause analysis is about causes, not about sorting reports", () => { const p = make([act("ISMRI-C22", "C02", "EXECUTION")]).priorities[0]; for (const s of [p.doMn, p.steps.runMn]) { expect(s).toMatch(/шалтгаан/u); expect(s).not.toMatch(/хэрэглэгддэггүй тайлан/u); } expect(p.steps.startMn).toMatch(/шалтгаан/u); expect(p.deliverableMn).toMatch(/Шалтгааны шинжилгээ/u); expect(p.checkMn).toMatch(/Шалтгааны шинжилгээ/u); });
  it("every capability that is not done is answered with its own work, step and document", () => { for (const [id, c] of CAPABILITY_CONTENT) { const m2 = { ...meth, categories: [{ id, nameMn: "Нэр" }] }, p = buildReportGuidance(m2, { cells: new Map(), contradictions: [], overall: { coverage: 0.5 } } as any, { rootCause: { findings: [] }, recommendations: {} } as any, { strengths: [], weaknesses: [], priorityActions: [act(id, "C02", "EXECUTION")] }).priorities[0]; const has = (t: string, w: string) => t.toLocaleLowerCase("mn-MN").includes(w.toLocaleLowerCase("mn-MN")); expect(has(p.doMn, c.step), id).toBe(true); expect(has(p.doMn, c.covers.split(", ")[0]), id).toBe(true); expect(has(p.deliverableMn, c.evidence), id).toBe(true); expect(has(p.checkMn, c.evidence), id).toBe(true); } });
  it("the same unjudged side keeps the uncertainty and says what to check for each capability", () => { const g = make(cats.slice(0, 5).map(c => act(c, "C07"))).priorities; for (const [i, p] of g.entries()) { const c = CAPABILITY_CONTENT.get(cats[i])!; expect(p.whyMn).not.toMatch(/сул байна/u); expect(p.doMn).toContain("хэн хариуцаж байгааг"); expect(p.doMn).toContain("Хэрэв дутуу нь тогтоогдвол"); expect(p.doMn).toContain(c.covers); expect(p.checkMn.toLocaleLowerCase("mn-MN")).toContain(c.covers.toLocaleLowerCase("mn-MN")); expect(p.checkMn).toContain("хариуцах хүн тодорхой"); } for (const k of ["doMn", "whyMn", "checkMn"] as const) expect(new Set(g.map(p => p[k])).size).toBe(5); });
  it("a check verifies the side that was found weak, with the document of the work", () => { const p = make([act("FINMRI-C20", "C16", "EXECUTION")]).priorities[0]; expect(p.checkMn).toContain(CAPABILITY_CONTENT.get("FINMRI-C20")!.evidence); expect(p.checkMn).toContain(DIMENSION_CHECK.get("C16")!.done); });
  it("has a question, a decision and a check for every dimension, as complete clauses", () => { expect(DIMENSION_CHECK.size).toBe(47); for (const [id, d] of DIMENSION_CHECK) { expect(DIMENSION_LANGUAGE.has(id)).toBe(true); expect(d.ask, d.ask).toMatch(/(?:г|йг|ийг|ыг)$/u); expect(d.decide, d.decide).toMatch(/,$/u); expect(d.done, d.done).toMatch(/эсэх$/u); } });
  it("a result from a small part of the criteria is marked partial and the plan checks are never empty", () => { expect(make([act("OPMRI-C02", "C07")], 0.08).partial).toBe(true); expect(make([act("OPMRI-C02", "C07")], 0.41).partial).toBeUndefined(); });
  it("the conclusion of such a result cannot read as a rating of the business, and a model text without that sentence is sent back", () => {
    const g = make(cats.slice(0, 3).map(c => act(c, "C07")), 0.08); const p: any = { ...payload(), assessmentId: "a", companyName: "Тест ХХК", overall: { score: 100, coverage: 0.08, confidence: 1, band: "Тэргүүлэгч" }, purposes: [], evidenceActions: [], rootFindings: [], roadmap: [], requiredWarnings: [], traceIndex: {}, remeasurement: { labelMn: "Дахин" }, guidance: g, priorityActions: cats.slice(0, 3).map(c => ({ ...act(c, "C07"), sourceTraceIds: [] })) };
    const text = deterministicFallbackNarrative(p).sections.find(s => s.id === "S10")!.claims[0].textMn; expect(text).toContain("бүрэн үнэлгээ биш"); expect(text.indexOf("бүрэн үнэлгээ биш")).toBeLessThan(220); expect(text).not.toMatch(/оноо авлаа|давуу талдаа/u);
    const bad: any = { schemaVersion: "MMRI-NARRATIVE-DRAFT-1.0", payloadHash: p.payloadHash, sections: [{ id: "S10", titleMn: "х", claims: [{ claimType: "CONFIDENCE_STATEMENT", textMn: "Компани тэргүүлж байна.", sourceTraceIds: [] }] }] }; expect(validateNarrativeDraft(p, bad).issues.map(i => i.checkId)).toContain("V41");
  });
});
