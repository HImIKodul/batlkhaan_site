/* Dated 12-month plan built from the frozen guidance, without any model. Used when an administrator starts a draft by hand (no AI); it stays behind the review gate and can be edited there.
   Every priority is started, put into use and embedded in different parts of the year, so months 6-12 carry real work; the order respects the diagnosis' own dependencies. */
import type { FrozenReportPayload } from "../types.js";
import { plainRole, type PriorityGuidance } from "./index.js";
import { materializeAnnualPlan, planStartDate, planWindowDays, type AnnualPlanReady, type PlanStageDraft } from "../annual-plan.js";

type Item = { n: number; g: PriorityGuidance; owner: string };
/** Keeps the priority order and moves a priority behind one it depends on (stable; a cycle leaves the order unchanged). */
export function orderedPriorities(payload: FrozenReportPayload): Item[] {
  const g = payload.guidance!; const items = payload.priorityActions.slice(0, 5).flatMap((a, i) => { const x = g.priorities.find(p => p.recommendationId === a.id); return x ? [{ n: i + 1, g: x, owner: plainRole(payload.displayDictionary[a.ownerRoleId] ?? "") }] : []; });
  const out: Item[] = [], left = [...items];
  while (left.length) { const i = left.findIndex(x => !g.affects.some(d => d.then === x.g.recommendationId && left.some(y => y.g.recommendationId === d.first))); out.push(...left.splice(i < 0 ? 0 : i, 1)); }
  return out;
}
export function deterministicAnnualPlan(payload: FrozenReportPayload): AnnualPlanReady | null {
  if (!payload.guidance?.priorities.length) return null;
  const p = orderedPriorities(payload), W = planWindowDays(planStartDate(payload.generatedAt));
  const act = (i: number, k: "startMn" | "runMn" | "embedMn") => p[i] ? [{ textMn: k === "startMn" ? `${p[i].n}-р ажил «${p[i].g.capabilityMn}»: ${p[i].g.steps[k]}${p[i].owner ? ` Хариуцах: ${p[i].owner}.` : ""}` : `${p[i].n}-р ажил: ${p[i].g.steps[k]}`, recommendationIds: [`F${p[i].n}`] }] : [];
  const gate = (...idx: number[]) => { const x = idx.filter(i => p[i]); return x.length ? `Шалгах цэг: ${x.map(i => `${p[i].n}-р ажил: ${p[i].g.deliverableMn}`).join("; ")}.` : null; };
  /* Findings that must be clarified first are clarified together early in the year, so their work can follow on the result. */
  const clarify = p.map((x, i) => ({ x, i })).filter(y => y.x.g.evidence && y.i >= 2);
  const clarifying = clarify.length ? [{ textMn: `${clarify.map(y => `${y.x.n}-р ажил «${y.x.g.capabilityMn}»`).join(", ")}: хариуцсан хүмүүс одоогийн байдлыг хамт нягталж, дутуу эсэхийг дүгнэнэ.`, recommendationIds: clarify.map(y => `F${y.x.n}`) }] : [];
  const begin = (i: number) => p[i]?.g.evidence && i >= 2 ? act(i, "runMn") : act(i, "startMn"), next = (i: number) => p[i]?.g.evidence && i >= 2 ? act(i, "embedMn") : act(i, "runMn");
  const all = p.map(x => `F${x.n}`);
  const stage = (id: string, headingMn: string, startDay: number, durationDays: number, dependsOnStageIds: string[], dependencyNoteMn: string | null, actions: PlanStageDraft["actions"]): PlanStageDraft => ({ id, headingMn, startDay, durationDays, dependsOnStageIds, dependencyNoteMn, actions });
  const stages = [
    stage("E1", "Эхлэл: бодит байдлаа тодруулж, эхний ажлуудаа эхлүүлэх", 0, 45, [], gate(0, 1), [...act(0, "startMn"), ...act(1, "startMn")]),
    stage("E2", "Эхний өөрчлөлтийг туршиж, дараагийн ажлыг бэлтгэх", 45, 60, ["E1"], gate(2), [...act(0, "runMn"), ...(p[2]?.g.evidence ? [] : act(2, "startMn")), ...clarifying]),
    stage("E3", "Туршилтыг өргөжүүлж, шинэ чиглэл нэмэх", 105, 75, ["E2"], gate(3), [...act(1, "runMn"), ...act(2, "runMn"), ...begin(3)]),
    stage("E4", "Үр дүнтэй аргыг тогтмол ажил болгох", 180, 90, ["E3"], gate(4), [...act(0, "embedMn"), ...next(3), ...begin(4)]),
    stage("E5", "Бататгах, дахин үнэлэх, дараагийн жилээ төлөвлөх", 270, W - 270, ["E4"], null, [...next(4), ...act(1, "embedMn"), ...act(2, "embedMn"), ...(p[3]?.g.evidence ? [] : act(3, "embedMn")),
      { textMn: `Жилийн дүгнэлт: ажил бүрийг хуудас хоёрт заасан шалгуураар дүгнэж, дахин оношилгоогоор ахицаа баталгаажуулна. ${p[4] && !p[4].g.evidence ? `${p[4].n}-р ажлыг дараагийн жилд үргэлжлүүлэх эсэхийг шийднэ: ${p[4].g.steps.embedMn[0].toLocaleLowerCase("mn-MN")}${p[4].g.steps.embedMn.slice(1)}` : ""}`.trim(), recommendationIds: all }])
  ].filter(s => s.actions.length);
  return materializeAnnualPlan(stages, payload, { kind: "DETERMINISTIC", model: "guidance" });
}
