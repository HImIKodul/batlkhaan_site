import { readFileSync } from "node:fs"; import { gunzipSync } from "node:zlib"; import { describe, expect, it } from "vitest";
import { analyzeRootCauses } from "../src/strategy/root-cause.js"; import { buildRecommendations, selectRecommendationActions } from "../src/strategy/recommendations.js"; import { isAbsenceLabel, reportedAbsence } from "../src/strategy/reported-absence.js";
import { planAnswersOverview, planEvidenceLine } from "../src/report/annual-plan.js";
/* Two real QUICK diagnoses (synthetic company, 280 mixed answers each): frozen runtime snapshots and contracts. */
const load = (d: string) => { const f = JSON.parse(gunzipSync(readFileSync(new URL(`./fixtures/reported-absence/${d}.json.gz`, import.meta.url))).toString("utf8")); const snapshot: any = { cells: new Map(f.snap.cells.map((c: any) => [`${c.categoryId}:${c.cellId}`, c])), categories: new Map(f.snap.categories.map((c: any) => [c.categoryId, c])), categoryOutcomePriorities: new Map(f.snap.categoryOutcomePriorities) };
  const m: any = { categories: f.categories, cells: f.cells, maxCategoryWeight: f.maxCategoryWeight, contracts: f.contracts, questions: f.questions }; const root = analyzeRootCauses(m, snapshot); return { f, m, snapshot, root, run: (o?: any) => buildRecommendations(m, snapshot, root, f.profile, o) }; };
const critical = (r: any) => selectRecommendationActions(r).criticalActions;
describe("Marketing: explicit 'not done' answers become concrete priorities", () => {
  const x = load("marketing"), before = x.run({ reportedAbsence: false }), after = x.run();
  it("before: five generic evidence requests, four of them about explicitly answered absences", () => { expect(critical(before).map(r => r.id)).toEqual(x.f.legacyCritical); expect(critical(before).every(r => r.type === "COLLECT_EVIDENCE")).toBe(true); });
  it("after: five distinct capabilities, each quoting the company's own answer", () => {
    const c = critical(after); expect(c.length).toBe(5); expect(new Set(c.map(r => r.categoryId)).size).toBe(5); expect(new Set(c.map(r => r.actionMn)).size).toBe(5);
    for (const r of c) { expect([r.type, r.basis]).toEqual(["LOCAL_IMPROVEMENT", "REPORTED_ABSENCE"]); const cell: any = x.snapshot.cells.get(`${r.categoryId}:${r.cellId}`); const e = cell.directEvidence.find((q: any) => q.questionId === r.absenceQuestionIds![0]); expect(e.score).toBe(0); expect(r.actionMn).toContain(e.optionLabel.replace(/\.$/, "")); expect(r.actionMn).toContain(x.m.questions.find((q: any) => q.id === e.questionId).textMn.replace(/[.?]+$/, "")); expect(r.priority).toBeLessThanOrEqual(55); }
  });
  it("every confirmed absence leaves the evidence list, nothing else does", () => {
    const abs = after.candidates.filter(r => r.basis); expect(abs.length).toBe(10); const key = (r: any) => `${r.categoryId}:${r.cellId}`; const absKeys = new Set(abs.map(key));
    expect(after.candidates.some(r => r.type === "COLLECT_EVIDENCE" && absKeys.has(key(r)))).toBe(false);
    expect(after.candidates.filter(r => !r.basis)).toEqual(before.candidates.filter(r => !absKeys.has(key(r))));
    for (const r of abs) expect((x.snapshot.cells.get(key(r)) as any).directEvidence.length).toBeGreaterThan(0);
  });
});
describe("Finance: unanswered dimensions are still missing evidence", () => {
  const x = load("finance"), before = x.run({ reportedAbsence: false }), after = x.run();
  it("result is unchanged", () => { expect(after).toEqual(before); expect(critical(after).map(r => r.id)).toEqual(x.f.legacyCritical); });
  it("the evidence items have no answer behind them", () => { for (const r of critical(after).filter(r => r.type === "COLLECT_EVIDENCE")) expect((x.snapshot.cells.get(`${r.categoryId}:${r.cellId}`) as any).directEvidence).toEqual([]); });
});
describe("what counts as a statement of absence", () => {
  it.each(["Үгүй, хийдэггүй.", "Бараг хийдэггүй.", "Огт шалгадаггүй.", "Огт байхгүй.", "Автоматжуулах боломжтой ч автоматжуулаагүй.", "Тогтсон хяналтгүй."])("yes: %s", t => expect(isAbsenceLabel(t)).toBe(true));
  it.each(["Тодорхойгүй.", "Үгүй, тодорхой биш.", "Зорьсон үр дүнг зөв хэмждэг нь баталгаажаагүй.", "Хүрэлцдэггүй.", "Огт чаддаггүй.", "Шаардлагатай мэдээлэл олддоггүй.", "0–9%.", "Ажлын чанар их хэлбэлздэг.", "Хэн ч мэддэггүй.", "Үгүй, дуусгаагүй.", "Шаардлага гарах бүрд хийдэг.", ""])("no: %s", t => expect(isAbsenceLabel(t)).toBe(false));
  const ev = (o: any = {}) => ({ questionId: "Q1", sourceKind: "SELF_REPORT", score: 0, state: "SCORED", optionLabel: "Огт хийдэггүй.", ...o }); const cell = (o: any = {}, e: any[] = [ev()]): any => ({ status: "DIRECT_PROVISIONAL", hasHardContradiction: false, hasSameCellVariance: false, hasSecondaryTension: false, directEvidence: e, ...o });
  it("plain case", () => expect(reportedAbsence(cell(), 40)).toEqual(["Q1"]));
  it.each([["derived", cell({ status: "DERIVED_PROVISIONAL" })], ["unassessed", cell({ status: "UNASSESSED" }, [])], ["contradicted", cell({ hasHardContradiction: true })], ["in review", cell({ status: "REVIEW_REQUIRED" })], ["varying answers", cell({ hasSameCellVariance: true })], ["tension with another answer", cell({ hasSecondaryTension: true })], ["one recent case only", cell({}, [ev({ sourceKind: "RECENT_CASE" })])], ["do not know", cell({}, [ev({ state: "DNK", score: null })])], ["not the bottom rung", cell({}, [ev({ score: 25 })])], ["a better answer beside it", cell({}, [ev(), ev({ questionId: "Q2", score: 50 })])], ["no cell", undefined]])("stays an evidence question: %s", (_n, c: any) => expect(reportedAbsence(c, 40)).toBe(null));
});
describe("planner input: every answered capability once", () => {
  it.each(["marketing", "finance"])("%s", d => {
    const x = load(d); const rows = x.f.snap.cells.flatMap((c: any) => c.directEvidence.map((e: any) => ({ status: "ANSWERED", cellId: c.cellId, categoryId: c.categoryId, categoryMn: x.m.categories.find((k: any) => k.id === c.categoryId).nameMn, questionMn: e.questionId, answerMn: e.optionLabel, score: e.score })));
    const o = planAnswersOverview(rows, []); const names = [...o.weakMn, ...o.mixedMn, ...o.goodMn, ...o.unclearMn, ...o.notApplicableMn]; expect(names.length).toBe(new Set(names).size); expect(new Set(names)).toEqual(new Set(rows.map((r: any) => r.categoryMn)));
  });
  it("not applicable is not called unclear", () => { const o = planAnswersOverview([{ status: "N_A_CLAIM", cellId: "", categoryId: "A", categoryMn: "Нэг", questionMn: "q", answerMn: "Хамаарахгүй", score: null }], []); expect([o.notApplicableMn, o.unclearMn]).toEqual([["Нэг"], []]); });
  it("evidence line ignores unscored applicability answers", () => expect(planEvidenceLine("F1", "C02", [{ status: "ANSWERED", cellId: "C01", questionMn: "q", answerMn: "Тийм, хамаарна.", score: null }]).examplesMn).toEqual([]));
});
