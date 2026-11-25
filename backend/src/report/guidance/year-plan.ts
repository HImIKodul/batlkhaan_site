/* Dated 12-month plan built from the frozen guidance, without any model. Used when an administrator starts a draft by hand (no AI); it stays behind the review gate and can be edited there.
   Every priority is started, put into use and embedded in different parts of the year, so months 6-12 carry real work; the order respects the diagnosis' own dependencies. */
import type { FrozenReportPayload } from "../types.js";
import { plainRole, type PriorityGuidance } from "./index.js";
import { materializeAnnualPlan, planStartDate, planWindowDays, type AnnualPlanReady, type PlanStageDraft } from "../annual-plan.js";

/* Stage headings in the language of each domain (the stages themselves follow the priorities). */
const HEADINGS: Record<string, string[]> = {
  MARKETING: ["Хэрэглэгч, зах зээлийн бодит байдлаа тодруулах", "Эхний санал, аргаа жижиг хүрээнд турших", "Туршсан аргаа хэрэглэгч, суваг руу өргөжүүлэх", "Үр дүнтэй аргаа өдөр тутмын ажил болгох", "Хэрэглэгчийн хариугаар дүгнэж, дараагийн жилээ төлөвлөх"],
  FINMRI: ["Тоо мэдээллээ тулгаж, эхний шийдвэрээ цэгцлэх", "Эхний тооцоо, хяналтыг сарын мөчлөгт турших", "Тооцоог нэгжүүдийн шийдвэрт оруулах", "Хяналтыг төсөв, сарын хаалтын ажил болгох", "Жилийн дүнг тулгаж, дараагийн төсөвт тусгах"],
  HRMRI: ["Ажилтан, менежерийн хариуг сонсож, эхлэх цэгээ тогтоох", "Эхний өөрчлөлтийг нэг багт турших", "Менежерүүдээр дамжуулан бусад багт нэвтрүүлэх", "Шинэ дадлыг гүйцэтгэл, хөгжлийн мөчлөгт оруулах", "Ажилтны хариугаар дүгнэж, дараагийн жилээ төлөвлөх"],
  ISMRI: ["Систем, өгөгдөл, хариуцагчийн байдлыг тодруулах", "Эхний засварыг хязгаарлагдмал орчинд турших", "Туршсан шийдлийг бусад систем, нэгжид нэвтрүүлэх", "Хяналт, дэмжлэгийг өдөр тутмын үйлчилгээ болгох", "Найдвартай байдал, хэрэглээг шалгаж, дараагийн жилээ төлөвлөх"],
  OPMRI: ["Ажлын урсгалыг газар дээр нь ажиглаж, эхлэх цэгээ сонгох", "Эхний засварыг нэг шугам, нэг багт турших", "Үр дүнтэй аргыг бусад ээлж, хэсэгт нэвтрүүлэх", "Стандарт, өдөр тутмын хяналт болгон тогтоох", "Гарц, чанараа дахин шалгаж, дараагийн жилээ төлөвлөх"]
};
const headingsFor = (categoryId: string | undefined) => HEADINGS[String(categoryId ?? "").split("-")[0]] ?? HEADINGS.MARKETING;
type Item = { n: number; g: PriorityGuidance; owner: string };
/** Keeps the priority order and moves a priority behind one it depends on (stable; a cycle leaves the order unchanged). */
export function orderedPriorities(payload: FrozenReportPayload): Item[] {
  const g = payload.guidance!; const items = payload.priorityActions.slice(0, 5).flatMap((a, i) => { const x = g.priorities.find(p => p.recommendationId === a.id); return x ? [{ n: i + 1, g: x, owner: plainRole(payload.displayDictionary[a.ownerRoleId] ?? "") }] : []; });
  const out: Item[] = [], left = [...items];
  while (left.length) { const i = left.findIndex(x => !g.affects.some(d => d.then === x.g.recommendationId && left.some(y => y.g.recommendationId === d.first))); out.push(...left.splice(i < 0 ? 0 : i, 1)); }
  return out;
}
/** The plan in full; when it is longer than one page holds, it drops what page 2 already says for the same numbered work: first the owner, then what the work covers, then the second sentence of a step. */
export function deterministicAnnualPlan(payload: FrozenReportPayload): AnnualPlanReady | null {
  let plan: AnnualPlanReady | null = null;
  for (const detail of [3, 2, 1, 0]) { plan = buildPlan(payload, detail); if (!plan || plan.lineEstimate <= PLAN_LINES) break; }
  return plan;
}
const PLAN_LINES = 45;
function buildPlan(payload: FrozenReportPayload, detail: number): AnnualPlanReady | null {
  if (!payload.guidance?.priorities.length) return null;
  const p = orderedPriorities(payload), W = planWindowDays(planStartDate(payload.generatedAt));
  const trim = (t: string) => { let x = detail < 2 ? t.replace(/ Үүнд: [^.]*\./u, "") : t; if (detail < 1) x = x.split(/(?<=\.)\s/u)[0]; return x; };
  const act = (i: number, k: "startMn" | "runMn" | "embedMn") => p[i] ? [{ textMn: k === "startMn" ? `${p[i].n}-р ажил «${p[i].g.capabilityMn}»: ${trim(p[i].g.steps[k])}${detail > 2 && p[i].owner ? ` Хариуцах: ${p[i].owner}.` : ""}` : `${p[i].n}-р ажил: ${trim(p[i].g.steps[k])}`, recommendationIds: [`F${p[i].n}`] }] : [];
  const short = (t: string) => t.split(/;| болон |, дараа нь /u)[0];
  const gate = (...idx: number[]) => { const x = idx.filter(i => p[i]); return x.length ? `Шалгах цэг: ${x.map(i => `${short(p[i].g.deliverableMn)} (${p[i].n}-р ажил)`).join(", ")}.` : null; };
  /* With clarifications in stage 2 the first work is already delivered, so its own check question is asked instead of naming the same document again. */
  const second = () => { const c = p[0] ? `${p[0].g.checkMn.replace(/[.\s]+$/u, "")} (${p[0].n}-р ажил)` : "", d = gate(2)?.replace(/^Шалгах цэг: |\.$/gu, "") ?? ""; const x = [c, d].filter(Boolean).join(", "); return x ? `Шалгах цэг: ${x}.` : null; };
  /* Findings that must be clarified first are clarified together early in the year, so their work can follow on the result. */
  const clarify = p.map((x, i) => ({ x, i })).filter(y => y.x.g.evidence && y.i >= 2);
  const clarifying = clarify.length ? [{ textMn: `${clarify.map(y => `${y.x.n}-р ажил «${y.x.g.capabilityMn}»`).join(", ")}: хариуцсан хүмүүс одоогийн байдлыг хамт нягталж, дутуу эсэхийг дүгнэнэ.`, recommendationIds: clarify.map(y => `F${y.x.n}`) }] : [];
  const begin = (i: number) => p[i]?.g.evidence && i >= 2 ? act(i, "runMn") : act(i, "startMn"), next = (i: number) => p[i]?.g.evidence && i >= 2 ? act(i, "embedMn") : act(i, "runMn");
  const H = headingsFor(payload.priorityActions[0]?.categoryId);
  const all = p.map(x => `F${x.n}`);
  const stage = (id: string, headingMn: string, startDay: number, durationDays: number, dependsOnStageIds: string[], dependencyNoteMn: string | null, actions: PlanStageDraft["actions"]): PlanStageDraft => ({ id, headingMn, startDay, durationDays, dependsOnStageIds, dependencyNoteMn, actions });
  const stages = [
    stage("E1", H[0], 0, 45, [], gate(0, 1), [...act(0, "startMn"), ...act(1, "startMn")]),
    stage("E2", H[1], 45, 60, ["E1"], clarify.length ? second() : gate(2), [...act(0, "runMn"), ...(p[2]?.g.evidence ? [] : act(2, "startMn")), ...clarifying]),
    stage("E3", H[2], 105, 75, ["E2"], gate(3), [...act(1, "runMn"), ...act(2, "runMn"), ...begin(3)]),
    stage("E4", H[3], 180, 90, ["E3"], gate(4), [...act(0, "embedMn"), ...next(3), ...begin(4)]),
    stage("E5", H[4], 270, W - 270, ["E4"], `Жилийн эцэст харуулах баримт: ${p.slice(0, 3).map(x => `${short(x.g.evidence ? x.g.deliverableMn.replace(/^Одоогийн байдлын дүгнэлт[;,] дараа нь /u, "") : x.g.deliverableMn).toLocaleLowerCase("mn-MN")} (${x.n}-р ажил)`).join(", ")}.`, [...act(1, "embedMn"), ...act(2, "embedMn"), ...(p[3]?.g.evidence ? [] : act(3, "embedMn")), ...next(4),
      { textMn: `Жилийн дүгнэлт: ажил бүрийг хоёрдугаар хуудасны шалгуураар дүгнэж, дахин оношилгоогоор баталгаажуулна. ${p[4] && !p[4].g.evidence ? `${p[4].n}-р ажлыг дараагийн жилд үргэлжлүүлэх эсэхийг шийднэ: ${p[4].g.steps.embedMn[0].toLocaleLowerCase("mn-MN")}${p[4].g.steps.embedMn.slice(1)}` : ""}`.trim(), recommendationIds: all }])
  ].filter(s => s.actions.length);
  return materializeAnnualPlan(stages, payload, { kind: "DETERMINISTIC", model: "guidance" });
}
