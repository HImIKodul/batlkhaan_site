/* Customer wording for the findings, the five priorities and a dated 12-month plan, built from the SAME frozen diagnosis (presentation only). Scores, findings, priorities, order, owners and targets are read, never changed.
   The block is frozen inside NEW report payloads; payloads without it (every earlier report) render exactly as before. */
import type { MethodologyDefinition, RuntimeSnapshot } from "../../engine/types.js";
import type { StrategyResult } from "../../strategy/types.js";
import type { FrozenReportPayload } from "../types.js";
import { MARKETING_GUIDE } from "./marketing.js";
import { DIMENSION_GUIDE } from "./dimensions.js";
import { PRACTICE_KINDS, PRACTICE_MAP } from "./practices.js";

export const REPORT_GUIDANCE_VERSION = "MMRI-REPORT-GUIDANCE-1.0" as const;
export interface PriorityGuidance { recommendationId: string; /** the diagnosis could not judge it: clarify first */ evidence: boolean; capabilityMn: string; dimensionMn: string; whyMn: string; doMn: string; deliverableMn: string; checkMn: string; goalMn: string; steps: { startMn: string; runMn: string; embedMn: string } }
export interface ReportGuidance { version: typeof REPORT_GUIDANCE_VERSION; findings: Record<string, string>; priorities: PriorityGuidance[]; affects: Array<{ first: string; then: string }>; targetNoteMn: string | null }

export interface Practice { start: string; run: string; embed: string; deliverable: string; check: string }
const row = (cells: string[]): Practice => ({ start: cells[0], run: cells[1], embed: cells[2], deliverable: cells[3], check: cells[4] });
const table = (text: string) => new Map(text.trim().split("\n").map(l => { const [id, ...c] = l.split("|"); return [id, row(c)] as const; }));
const MARKETING = table(MARKETING_GUIDE), DIMENSIONS = table(DIMENSION_GUIDE);
const KINDS = (() => { const lines = PRACTICE_KINDS.trim().split("\n"), out = new Map<string, Practice[]>(); for (let i = 0; i + 2 < lines.length; i += 3) out.set(lines[i], [row(lines[i + 1].split("|")), row(lines[i + 2].split("|"))]); return out; })();
/** Practice kind of a non-marketing capability ("FINMRI-C20"); unknown ids get the general kind. */
export function practiceKind(categoryId: string): string { const m = /^([A-Z]+MRI)-C(\d{2})$/.exec(categoryId); return (m && PRACTICE_MAP[m[1]]?.[Number(m[2]) - 1]) || "X"; }
/** Case endings depend on the last vowel of a name, so the ending goes on the word "чиглэл". Without a name the text speaks of "энэ чиглэл". */
const ENDING: Record<string, string> = { "-ын": " чиглэлийн", "-ыг": " чиглэлийг", "-аар": " чиглэлээр", "-д": " чиглэлд" };
export const named = (t: string, c: string | null) => t.replace(/«\{c\}»(-ын|-ыг|-аар|-д)?/gu, (_m, e) => `${c ? `«${c}»` : "энэ"}${ENDING[e] ?? " чиглэл"}`);

/** Picks wording for one priority. A capability that is not done at all (C02) gets its own practice; every other finding gets the guide of its DIMENSION, because that is what the diagnosis found weak.
    A dimension that is already used falls back to the capability's practice, so no two priorities of one report share a text. */
export class GuidePicker {
  private usedDimensions = new Set<string>(); private usedOwn = new Set<string>(); private usedKinds = new Map<string, number>(); private overflow = 0;
  private own(categoryId: string): Practice {
    const m = MARKETING.get(categoryId); if (m && !this.usedOwn.has(categoryId)) { this.usedOwn.add(categoryId); return m; }
    if (!m) { const kind = practiceKind(categoryId), n = this.usedKinds.get(kind) ?? 0; this.usedKinds.set(kind, n + 1); const pool = KINDS.get(kind)!; if (n < pool.length) return pool[n]; }
    const spare = [...KINDS.get("X")!, ...KINDS.get("G")!]; return spare[this.overflow++ % spare.length];
  }
  pick(categoryId: string, cellId: string): Practice {
    const d = DIMENSIONS.get(cellId); if (d && !this.usedDimensions.has(cellId)) { this.usedDimensions.add(cellId); return d; }
    return this.own(categoryId);
  }
}
/* How a finding that could not be judged is clarified; a different way each time, so two of them do not read the same. */
const REVIEWS: Array<(c: string, d: string) => string> = [
  (c, d) => `Хариуцсан хүмүүс «${c}» чиглэлийн «${d}» талыг хамт нягталж, дутууг нэг хуудсанд бичнэ`,
  (c, d) => `«${c}» чиглэлд ажилладаг хүмүүсээс «${d}» талыг тус тусад нь асууж, хариулт нь зөрж байгаа эсэхийг харна`,
  (c, d) => `Сүүлийн нэг бодит ажлыг эхнээс нь дагаж, «${c}» чиглэлд «${d}» хаана алдагддагийг шалгана`,
  (c, d) => `Удирдлага «${c}» чиглэлийн бичигдсэн дүрэм ба өдөр тутмын үйлдлийг зэрэгцүүлж, «${d}» талын зөрүүг тэмдэглэнэ`,
  (c, d) => `«${c}» чиглэлийн тайлан, бүртгэлээс «${d}» талыг харуулах жишээ түүвэрлэж, хангалттай эсэхийг дүгнэнэ`
];
const trimEnd = (t: string) => String(t ?? "").trim().replace(/[.?!…]+$/, "");
/** Role labels of the methodology carry a few English words; the customer reads Mongolian. */
export const plainRole = (t: string) => t.replace(/CRM\s*\/\s*/g, "").replace(/retention/gi, "хэрэглэгч хадгалалт").replace(/\bAI\b/g, "хиймэл оюун").replace(/\bIT\b/g, "мэдээллийн технологийн");
const lowerFirst = (t: string) => t ? t[0].toLocaleLowerCase("mn-MN") + t.slice(1) : t;
const upperFirst = (t: string) => t ? t[0].toLocaleUpperCase("mn-MN") + t.slice(1) : t;

/** The company's own clearest answers about one capability, best or worst first: "Бодит хэрэгжилт: «Бараг хийдэггүй»". One answer per dimension. */
export function clearestAnswers(methodology: MethodologyDefinition, snapshot: RuntimeSnapshot, categoryId: string, best: boolean, limit: number, cellId?: string) {
  const rows: Array<{ cell: string; answer: string; score: number; question: string }> = [];
  for (const [key, c] of snapshot.cells) {
    if (!key.startsWith(`${categoryId}:`) || (cellId && c.cellId !== cellId)) continue;
    const ev = (c.directEvidence ?? []).filter(e => e.state === "SCORED" && typeof e.score === "number").sort((a, b) => best ? b.score! - a.score! : a.score! - b.score!)[0];
    if (ev && (best ? ev.score! >= 60 : ev.score! < 60)) rows.push({ cell: methodology.cells.find(x => x.id === c.cellId)?.nameMn ?? "", answer: trimEnd(ev.optionLabel), score: ev.score!, question: trimEnd(methodology.questions.find(q => q.id === ev.questionId)?.textMn ?? "") });
  }
  return rows.filter(r => r.cell).sort((a, b) => (best ? b.score - a.score : a.score - b.score) || Number(/\d/.test(a.answer)) - Number(/\d/.test(b.answer)) || a.cell.localeCompare(b.cell)).slice(0, limit);
}

export function buildReportGuidance(m: MethodologyDefinition, snapshot: RuntimeSnapshot, strategy: StrategyResult, parts: Pick<FrozenReportPayload, "strengths" | "weaknesses" | "priorityActions">): ReportGuidance {
  const cat = new Map(m.categories.map(c => [c.id, c.nameMn] as const)), cell = new Map(m.cells.map(c => [c.id, c.nameMn] as const));
  const objectives = new Map<string, string>(((m.contracts as any).recommendation?.composition?.categoryObjectives ?? []).map((o: any) => [String(o.category), String(o.objective ?? "")]));
  const findings: Record<string, string> = {};
  const note = (categoryId: string, best: boolean) => {
    const lines = clearestAnswers(m, snapshot, categoryId, best, 1).map(r => `${r.cell}: «${r.answer}»`), goal = trimEnd(objectives.get(categoryId) ?? "");
    /* The capability's own meaning comes first (it differs for every capability); the company's answer follows. */
    return [goal ? `${upperFirst(goal)}.` : "", lines.length ? `${lines[0]}.` : best ? "Холбогдох чиглэлийн хариултаас тооцсон дүн." : "Шууд хариулт цөөн тул бодит байдлыг тодруулна."].filter(Boolean).join(" ");
  };
  for (const s of parts.strengths) findings[s.id] = note(s.categoryId, true);
  for (const w of parts.weaknesses) findings[w.id] = note(w.categoryId, false);
  const picker = new GuidePicker(), roots = new Map(strategy.rootCause.findings.map(f => [f.id, f] as const)), affects: ReportGuidance["affects"] = []; let reviews = -1; const top = parts.priorityActions.slice(0, 5);
  const priorities = top.map(a => {
    const capabilityMn = cat.get(a.categoryId) ?? a.titleMn, dimensionMn = cell.get(a.cellId) ?? "", evidence = a.type !== "EXECUTION" && a.type !== "LOCAL_IMPROVEMENT";
    const raw = picker.pick(a.categoryId, a.cellId), full = (t: string) => trimEnd(named(t, capabilityMn)), brief = (t: string) => trimEnd(named(t, null));
    const down = ((roots.get(a.findingId) as any)?.downstreamCategoryIds ?? []) as string[];
    const helps = top.filter(b => b.id !== a.id && b.categoryId !== a.categoryId && down.includes(b.categoryId));
    for (const b of helps) if (!affects.some(x => x.first === b.id && x.then === a.id)) affects.push({ first: a.id, then: b.id });
    /* Only an answer about THIS dimension may be quoted as the reason. */
    const said = clearestAnswers(m, snapshot, a.categoryId, false, 1, a.cellId)[0];
    const why = [evidence ? `«${dimensionMn}» талаар хариулт дутуу тул дүгнэхийн өмнө тодруулна.` : a.statedMn ? a.statedMn : said ? (said.question && said.question.length <= 230 ? `«${said.question}» гэсэн асуултад «${said.answer}» гэж хариулсан.` : `Таны хариулт: «${said.answer}».`) : `«${dimensionMn}» тал бусад хариултаас сул гарсан.`,
      parts.weaknesses.some(w => w.categoryId === a.categoryId) ? "Сул талын жагсаалтад багтсан." : "", helps.length ? `«${cat.get(helps[0].categoryId)}» ажилд тус болно.` : ""].filter(Boolean).join(" ");
    const review = evidence ? REVIEWS[++reviews % REVIEWS.length](capabilityMn, lowerFirst(dimensionMn)) : "";
    return { recommendationId: a.id, evidence, capabilityMn, dimensionMn, whyMn: why, doMn: evidence ? `${review}. Дутуу нь батлагдвал: ${lowerFirst(full(raw.start))}.` : `${full(raw.start)}.`, deliverableMn: evidence ? `Одоогийн байдлын дүгнэлт; дараа нь ${lowerFirst(raw.deliverable)}` : raw.deliverable, checkMn: raw.check,
      goalMn: upperFirst(trimEnd(objectives.get(a.categoryId) || a.objectiveMn)),
      steps: { startMn: evidence ? `${review}.` : `${upperFirst(brief(raw.start))}.`, runMn: evidence ? `Дутуу нь батлагдвал ${lowerFirst(brief(raw.start))}.` : `${upperFirst(brief(raw.run))}.`, embedMn: `${upperFirst(brief(evidence ? raw.run : raw.embed))}.` } };
  });
  return { version: REPORT_GUIDANCE_VERSION, findings, priorities, affects, targetNoteMn: top.some(a => typeof a.targetCellScore === "number") ? "Одоо ба Зорилт нь тухайн ажлын оношилгооны оноо. Зорилтыг аргачлалын дүрмээр тогтооно: одоогийн оноонд 25-ыг нэмж, 60-аас 75-ын хооронд авна. Энэ нь дахин оношилгоонд хүрэх түвшин бөгөөд орлого, борлуулалтын амлалт биш." : null };
}
