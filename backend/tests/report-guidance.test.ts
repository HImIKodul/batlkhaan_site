import { describe, it, expect } from "vitest";
import { GuidePicker, buildReportGuidance, coverageText, named, plainRole, practiceKind } from "../src/report/guidance/index.js";
import { MARKETING_GUIDE } from "../src/report/guidance/marketing.js";
import { DIMENSION_GUIDE } from "../src/report/guidance/dimensions.js";
import { PRACTICE_KINDS, PRACTICE_MAP } from "../src/report/guidance/practices.js";
import { CAPABILITY_CONTENT } from "../src/report/guidance/capabilities.js";
import { contradictionMessage } from "../src/report/payload.js";
import { guidanceIssues } from "../src/report/guidance/check.js";
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
  it("explains why a low score is not among the five, and by which parts of the accepted ranking a priority was chosen", () => { const g = build({ priorityActions: [action(ids[0])], weaknesses: [{ id: "A", categoryId: ids[1], nameMn: "Эхний", score: 0 }, { id: "B", categoryId: ids[2], nameMn: "Хоёр дахь", score: 0 }] }, { rootCause: { findings: [] }, recommendations: { candidates: [{ categoryId: ids[1], type: "LOCAL_IMPROVEMENT" }, { categoryId: ids[2], type: "COLLECT_EVIDENCE" }] } }); expect(g.selectionNoteMn).toContain("«Эхний» бага оноотой ч"); expect(g.selectionNoteMn).toContain("«Хоёр дахь» чиглэлд ажил санал болгохын өмнө"); expect(g.priorities[0].whyMn).toContain("дутагдал их"); });
  it("says what coverage and confidence mean", () => { expect(coverageText(0.027)).toBe("2.7"); expect(coverageText(0.406)).toBe("41"); expect(coverageText(null)).toBeNull(); expect(build({ priorityActions: [action(ids[0])] }).coverageNoteMn).toMatch(/2\.7%.*сул гэж үзээгүй.*хариулсан хэсэгт/); });
  it("flags a finding whose answers contradict and words the warning by topic", () => { const g = build({ strengths: [{ id: "S", categoryId: ids[0] }] }, undefined, snap({ contradictions: [{ type: "HARD", categoryId: ids[0], affectedCellIds: ["C02"] }] })); expect(g.findings.S).toContain("зөрсөн"); expect(contradictionMessage(["А", "Б", "В", "Г"])).toBe("4 сэдвийн хариултууд хоорондоо эрс зөрсөн («А», «Б», «В» болон бусад). Эдгээрийн дүнг дахин шалгаж баталгаажуулна."); });
});
