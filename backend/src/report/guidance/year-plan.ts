/* Dated 12-month plan built from the frozen guidance, without any model. Used when an administrator starts a draft by hand (no AI); it stays behind the review gate and can be edited there.
   Every priority is started, put into use and embedded in different parts of the year, so months 6-12 carry real work; the order respects the diagnosis' own dependencies. */
import type { FrozenReportPayload } from "../types.js";
import { plainRole, type PriorityGuidance } from "./index.js";
import { STAGE_GOALS, withPlainNames } from "./language.js";
import { materializeAnnualPlan, planStartDate, planWindowDays, type AnnualPlanReady, type PlanStageDraft, type PlanStageGuide } from "../annual-plan.js";

/* The heading of a stage is its goal, in the language of the domain (language.ts). */
const goalsFor = (categoryId: string | undefined) => STAGE_GOALS[String(categoryId ?? "").split("-")[0]] ?? STAGE_GOALS.MARKETING;
type Item = { n: number; g: PriorityGuidance; owner: string };
/** Keeps the priority order and moves a priority behind one it depends on (stable; a cycle leaves the order unchanged). */
export function orderedPriorities(payload: FrozenReportPayload): Item[] {
  const g = payload.guidance!; const items = payload.priorityActions.slice(0, 5).flatMap((a, i) => { const x = g.priorities.find(p => p.recommendationId === a.id); return x ? [{ n: i + 1, g: x, owner: plainRole(payload.displayDictionary[a.ownerRoleId] ?? "") }] : []; });
  const out: Item[] = [], left = [...items];
  while (left.length) { const i = left.findIndex(x => !g.affects.some(d => d.then === x.g.recommendationId && left.some(y => y.g.recommendationId === d.first))); out.push(...left.splice(i < 0 ? 0 : i, 1)); }
  return out;
}
/** Height in points of a plan on page 3 at the smallest readable size (8.3), measured against the real renderer (24 reports: never below the real height). Characters per line: body 100, the rows with role, result and check 106. */
export function planHeight(stages: Array<{ headingMn: string; guide?: PlanStageGuide; actions: Array<{ textMn: string }> }>): number {
  return stages.reduce((h, s) => h + 12 + 12.2 * Math.ceil((s.headingMn.length + 9) / 84) + s.actions.reduce((n, a) => n + 11.2 * Math.ceil((a.textMn.length + 2) / 100) + 1, 0) + (s.guide ? 10.4 * Math.ceil((s.guide.ownerMn.length + s.guide.resultMn.length + s.guide.doneMn.length + 46) / 106) + 1 : 0) + 8.5, 0);
}
/** The plan in full; when it is longer than one page holds, it drops only what page 2 already says for the same work: first what the work covers, then the second sentence of the later priorities, last of all the second sentence of every step. */
export function deterministicAnnualPlan(payload: FrozenReportPayload): AnnualPlanReady | null {
  let plan: AnnualPlanReady | null = null;
  for (const detail of [3, 2, 1, 0]) { plan = buildPlan(payload, detail); if (!plan || planHeight(plan.stages) <= PAGE_HEIGHT) break; }
  return plan;
}
const PAGE_HEIGHT = 680; // the page holds about 660; the estimate was 22 to 77 above the real height in every measured report
function buildPlan(payload: FrozenReportPayload, detail: number): AnnualPlanReady | null {
  if (!payload.guidance?.priorities.length) return null;
  const named = payload.guidance.names, p = orderedPriorities(payload), W = planWindowDays(planStartDate(payload.generatedAt));
  const trim = (t: string, i: number) => { const x = detail < 3 ? t.replace(/ Ингэхдээ [^.]*\./u, "") : t; return detail < 1 || (detail < 2 && i >= 2) ? x.split(/(?<=\.)\s/u)[0] : x; };
  /* An action is introduced by the plain name of its work (the same name as on page 2), never by a number; a capability that has two priorities also names its side. */
  const twice = (i: number) => p.some((y, j) => j !== i && y.g.capabilityMn === p[i].g.capabilityMn);
  const name = (i: number) => `${withPlainNames(p[i].g.capabilityMn, named)}${twice(i) && p[i].g.labelMn ? ` (${p[i].g.labelMn})` : ""}`;
  const act = (i: number, k: "startMn" | "runMn" | "embedMn") => p[i] ? [{ textMn: `${name(i)}: ${trim(p[i].g.steps[k], i)}`, recommendationIds: [`F${p[i].n}`] }] : [];
  const short = (t: string) => t.split(/;|, дараа нь /u)[0];
  /* Documents named once, in the stage whose work creates them. */
  const told = new Set<string>();
  const results = (...want: Array<[number, "startMn" | "runMn"]>) => { const rows = want.filter(([i]) => p[i]).map(([i, k]) => { const o = p[i].g.outputs?.[k] ?? short(p[i].g.deliverableMn); return o === "Одоогийн байдлын дүгнэлт" ? `одоогийн байдлын дүгнэлт («${withPlainNames(p[i].g.capabilityMn, named)}»)` : o; }).filter(o => !told.has(o) && told.add(o)); return rows.map((o, k) => (k ? o[0].toLocaleLowerCase("mn-MN") : o[0].toLocaleUpperCase("mn-MN")) + o.slice(1)).join(", ") || "Туршилтын дүн, дараагийн шийдвэр"; };
  const check = (...idx: number[]) => [...new Set(idx.filter(i => p[i]).map(i => p[i].g.checkMn.replace(/[.\s]+$/u, "")))].map((c, k) => k ? c[0].toLocaleLowerCase("mn-MN") + c.slice(1) : c).join(", ");
  const owners = (...idx: number[]) => [...new Set(idx.filter(i => p[i]).map(i => p[i].owner).filter(Boolean))].map((r, k) => k ? r[0].toLocaleLowerCase("mn-MN") + r.slice(1) : r).join(" болон ") || "Хариуцах хүнийг томилно";
  const goals = goalsFor(payload.priorityActions[0]?.categoryId), H = goals;
  /* Findings that must be clarified first are clarified together early in the year, so their work can follow on the result. */
  const clarify = p.map((x, i) => ({ x, i })).filter(y => y.x.g.evidence && y.i >= 2);
  const clarifying = clarify.length ? [{ textMn: `${clarify.map(y => `«${name(y.i)}»`).join(", ")}: хариуцсан хүмүүс одоогийн байдлыг хамт нягталж, дутуу эсэхийг дүгнэнэ.`, recommendationIds: clarify.map(y => `F${y.x.n}`) }] : [];
  const begin = (i: number) => p[i]?.g.evidence && i >= 2 ? act(i, "runMn") : act(i, "startMn"), next = (i: number) => p[i]?.g.evidence && i >= 2 ? act(i, "embedMn") : act(i, "runMn");
  const all = p.map(x => `F${x.n}`);
  const stage = (id: string, headingMn: string, startDay: number, durationDays: number, dependsOnStageIds: string[], guide: PlanStageGuide, actions: PlanStageDraft["actions"]): PlanStageDraft => ({ id, headingMn, startDay, durationDays, dependsOnStageIds, dependencyNoteMn: null, guide, actions });
  const g = (k: number, resultMn: string, doneMn: string, ownerMn: string): PlanStageGuide => ({ goalMn: goals[k], resultMn, doneMn, ownerMn });
  const stages = [
    stage("E1", H[0], 0, 45, [], g(0, results([0, "startMn"], [1, "startMn"]), "Баримтуудыг бичгээр гаргаж, удирдлага дараагийн алхмыг зөвшөөрсөн эсэх", owners(0, 1)), [...act(0, "startMn"), ...act(1, "startMn")]),
    stage("E2", H[1], 45, 60, ["E1"], g(1, results([0, "runMn"], ...(p[2] ? [[2, "startMn"] as [number, "startMn"]] : []), ...clarify.filter(y => y.i > 2).slice(0, 1).map(y => [y.i, "startMn"] as [number, "startMn"])), check(0), owners(0, 2)), [...act(0, "runMn"), ...(p[2]?.g.evidence ? [] : act(2, "startMn")), ...clarifying]),
    stage("E3", H[2], 105, 75, ["E2"], g(2, results([1, "runMn"], [2, "runMn"], [3, p[3]?.g.evidence ? "runMn" : "startMn"]), check(1), owners(1, 3)), [...act(1, "runMn"), ...act(2, "runMn"), ...begin(3)]),
    stage("E4", H[3], 180, 90, ["E3"], g(3, results([3, "runMn"], [4, p[4]?.g.evidence ? "runMn" : "startMn"]), p[2] ? check(2, 3) : check(0), owners(3, 4)), [...act(0, "embedMn"), ...next(3), ...begin(4)]),
    stage("E5", H[4], 270, W - 270, ["E4"], g(4, "Жилийн үр дүнгийн дүгнэлт, дараагийн жилийн ажлын жагсаалт", `${p[4] ? `${check(4)}, ` : ""}дахин оношилгооны дүн өмнөхөөс сайжирсан эсэх`, "Дээрх ажлуудыг хариуцсан хүмүүс"), [...act(1, "embedMn"), ...act(2, "embedMn"), ...(p[3]?.g.evidence ? [] : act(3, "embedMn")), ...next(4),
      { textMn: `Жилийн дүгнэлт: ажил бүрийн үр дүнг хоёрдугаар хуудсанд заасан шалгах аргаар үнэлж, дахин оношилгоо хийнэ.${p[4] && !p[4].g.evidence ? ` «${name(4)}» ажлыг дараагийн жил үргэлжлүүлэх эсэхийг шийднэ.` : ""}`, recommendationIds: all }])
  ].filter(s => s.actions.length);
  return materializeAnnualPlan(stages, payload, { kind: "DETERMINISTIC", model: "guidance" });
}
