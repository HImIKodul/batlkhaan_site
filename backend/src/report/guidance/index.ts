/* Customer wording for the findings, the five priorities and a dated 12-month plan, built from the SAME frozen diagnosis (presentation only). Scores, findings, priorities, order, owners and targets are read, never changed.
   The block is frozen inside NEW report payloads; payloads without it (every earlier report) render exactly as before. */
import type { MethodologyDefinition, RuntimeSnapshot } from "../../engine/types.js";
import type { StrategyResult } from "../../strategy/types.js";
import type { FrozenReportPayload } from "../types.js";
import { MARKETING_GUIDE } from "./marketing.js";
import { DIMENSION_GUIDE } from "./dimensions.js";
import { PRACTICE_KINDS, PRACTICE_MAP } from "./practices.js";
import { CAPABILITY_CONTENT } from "./capabilities.js";
import { MARKETING_COVERS } from "./marketing-covers.js";
import { DIMENSION_LANGUAGE, dimensionSays, displayNames } from "./language.js";

export const REPORT_GUIDANCE_VERSION = "MMRI-REPORT-GUIDANCE-1.1" as const;
export interface PriorityGuidance { recommendationId: string; /** the diagnosis could not judge it: clarify first */ evidence: boolean; capabilityMn: string; dimensionMn: string; /** short plain label of the dimension; empty for "is it done at all" */ labelMn?: string; whyMn: string; doMn: string; deliverableMn: string; checkMn: string; goalMn: string; steps: { startMn: string; runMn: string; embedMn: string }; /** what exists after the first step and after the work is put into use */ outputs?: { startMn: string; runMn: string } }
export interface ReportGuidance { version: typeof REPORT_GUIDANCE_VERSION; findings: Record<string, string>; priorities: PriorityGuidance[]; affects: Array<{ first: string; then: string }>; targetNoteMn: string | null;
  /** Why these five and not simply the five lowest scores. */ selectionNoteMn: string | null;
  /** Share of all criteria that this diagnosis could judge, and what the confidence figure means. */ coverageNoteMn: string | null;
  /** canonical capability name -> plain name shown to the customer (new reports only) */ names?: Record<string, string> }

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
  private usedDimensions = new Set<string>(); private secondUse = new Set<string>(); private usedOwn = new Set<string>(); private usedKinds = new Map<string, number>(); private overflow = 0;
  own(categoryId: string): Practice {
    const m = MARKETING.get(categoryId); if (m && !this.usedOwn.has(categoryId)) { this.usedOwn.add(categoryId); return m; }
    if (!m) { const kind = practiceKind(categoryId), n = this.usedKinds.get(kind) ?? 0; this.usedKinds.set(kind, n + 1); const pool = KINDS.get(kind)!; if (n < pool.length) return pool[n]; }
    const spare = [...KINDS.get("X")!, ...KINDS.get("G")!]; return spare[this.overflow++ % spare.length];
  }
  pick(categoryId: string, cellId: string): Practice {
    const d = DIMENSIONS.get(cellId); if (d && !this.usedDimensions.has(cellId)) { this.usedDimensions.add(cellId); return d; }
    /* The same weak side of a second capability: the next step of the SAME side (never advice about something else), verified by the capability's own document and question. */
    if (d && !this.secondUse.has(cellId)) { this.secondUse.add(cellId); const o = this.own(categoryId); return { start: d.run, run: d.embed, embed: o.embed, deliverable: o.deliverable, check: o.check }; }
    return this.own(categoryId);
  }
}
/* How a finding that could not be judged is clarified; a different way each time, so two of them do not read the same. */
const REVIEWS: Array<(d: string) => string> = [
  d => `Хариуцсан хүмүүс «${d}» талаар хамт ярилцаж, дутуу зүйлээ нэг хуудсанд бичнэ`,
  d => `Ажил гүйцэтгэдэг хүмүүсээс «${d}» талаар тус тусад нь асууж, хариултуудыг нь харьцуулна`,
  d => `Сүүлд хийсэн нэг ажлыг эхнээс нь дуустал нягталж, «${d}» талаар ямар асуудал гарсныг тэмдэглэнэ`,
  d => `Бичгээр тогтоосон журам, өдөр тутмын ажлыг харьцуулж, «${d}» талаарх зөрүүг тэмдэглэнэ`,
  d => `Тайлан, бүртгэлээс цөөн жишээ авч, «${d}» талаар хангалттай эсэхийг дүгнэнэ`
];
const unsure: Array<(d: string) => string> = [d => `Хариулт хангалтгүй тул «${d}» талаар одоогоор дүгнэх боломжгүй. Эхлээд бодит байдлыг тодруулна.`, d => `«${upperFirst(d)}» талаарх хариулт дутуу байна. Зөвлөмж гаргахын өмнө үүнийг тодруулна.`, d => `Одоогийн хариултаар «${d}» ямар түвшинд байгааг тогтоох боломжгүй тул эхлээд шалгана.`, d => `«${upperFirst(d)}» талаар хангалттай хариулт аваагүй. Сул эсэхийг шалгасны дараа арга хэмжээгээ сонгоно.`, d => `«${upperFirst(d)}» талаар дүгнэлт хийхэд мэдээлэл дутуу тул эхний алхам нь тодруулга байна.`];
const trimEnd = (t: string) => String(t ?? "").trim().replace(/[.?!…]+$/, "");
/** Role labels of the methodology carry a few English words; the customer reads Mongolian. */
export const plainRole = (t: string) => t.replace(/CRM\s*\/\s*/g, "").replace(/retention/gi, "хэрэглэгч хадгалалт").replace(/капиталын/g, "хөрөнгийн").replace(/процессын/g, "үйл явцын").replace(/аналитик/g, "шинжилгээ").replace(/\bAI\b/g, "хиймэл оюун").replace(/\bIT\b/g, "мэдээллийн технологийн").replace(/\s*\/\s*(?=менежер|ахлах|захирал|мэдээллийн технологийн менежер)/gu, " эсвэл ").replace(/\s*\/\s*/g, ", ").replace(/^./u, c => c.toLocaleUpperCase("mn-MN"));
const lowerFirst = (t: string) => t ? t[0].toLocaleLowerCase("mn-MN") + t.slice(1) : t;
const upperFirst = (t: string) => t ? t[0].toLocaleUpperCase("mn-MN") + t.slice(1) : t;

/** The company's own clearest answers about one capability, best or worst first: "Бодит хэрэгжилт: «Бараг хийдэггүй»". One answer per dimension. */
export function clearestAnswers(methodology: MethodologyDefinition, snapshot: RuntimeSnapshot, categoryId: string, best: boolean, limit: number, cellId?: string) {
  const rows: Array<{ cellId: string; cell: string; answer: string; score: number; question: string }> = [];
  for (const [key, c] of snapshot.cells) {
    if (!key.startsWith(`${categoryId}:`) || (cellId && c.cellId !== cellId)) continue;
    const ev = (c.directEvidence ?? []).filter(e => e.state === "SCORED" && typeof e.score === "number").sort((a, b) => best ? b.score! - a.score! : a.score! - b.score!)[0];
    if (ev && (best ? ev.score! >= 60 : ev.score! < 60)) rows.push({ cellId: c.cellId, cell: methodology.cells.find(x => x.id === c.cellId)?.nameMn ?? "", answer: trimEnd(ev.optionLabel), score: ev.score!, question: trimEnd(methodology.questions.find(q => q.id === ev.questionId)?.textMn ?? "") });
  }
  return rows.filter(r => r.cell).sort((a, b) => (best ? b.score - a.score : a.score - b.score) || Number(/\d/.test(a.answer)) - Number(/\d/.test(b.answer)) || a.cell.localeCompare(b.cell)).slice(0, limit);
}

/** One-decimal share below ten percent, whole above ("2.7", "41"); the same digits the validator grounds. */
export const coverageText = (v: number | null | undefined): string | null => typeof v === "number" ? (v * 100 < 9.95 ? (v * 100).toFixed(1) : String(Math.round(v * 100))) : null;
const REASONS: Array<[string, string]> = [["severity", "Дутагдал нь их тул түрүүлж засах хэрэгтэй."], ["rootStrength", "Энэ дутагдал бусад ажилд нөлөөлдөг тул эрт засах нь зүйтэй."], ["purposeEmphasis", "Танай бизнесийн зорилгод хүрэхэд чухал ажил."], ["categoryImportance", "Энэ ажил нийт үнэлгээнд их нөлөөтэй."], ["feasibility", "Харьцангуй хялбар эхлүүлэх боломжтой."]];
/** The components of the accepted priority formula that weighed most for this priority (read, never recomputed). */
/* One sentence per priority; a sentence already used in this report gives way to the next true one, so the five reasons do not read as a formula. */
const reasonsOf = (components: any, spent: Map<string, number>): string => { const all = REASONS.map(([k, t]) => ({ t, v: Number(components?.[k] ?? 0) })).filter(x => x.v >= 0.6).sort((a, b) => b.v - a.v); const pick = [...all].sort((a, b) => (spent.get(a.t) ?? 0) - (spent.get(b.t) ?? 0) || b.v - a.v)[0]; if (pick) spent.set(pick.t, (spent.get(pick.t) ?? 0) + 1); return pick && (spent.get(pick.t) ?? 0) <= 1 ? pick.t : ""; };

export function buildReportGuidance(m: MethodologyDefinition, snapshot: RuntimeSnapshot, strategy: StrategyResult, parts: Pick<FrozenReportPayload, "strengths" | "weaknesses" | "priorityActions">): ReportGuidance {
  const cat = new Map(m.categories.map(c => [c.id, c.nameMn] as const)), cell = new Map(m.cells.map(c => [c.id, c.nameMn] as const));
  const objectives = new Map<string, string>(((m.contracts as any).recommendation?.composition?.categoryObjectives ?? []).map((o: any) => [String(o.category), String(o.objective ?? "")]));
  const findings: Record<string, string> = {}, conflicted = new Set(snapshot.contradictions.filter(c => c.type === "HARD").map(c => c.categoryId));
  const coversOf = (id: string) => CAPABILITY_CONTENT.get(id)?.covers ?? MARKETING_COVERS.get(id) ?? "";
  const meaning = (id: string) => { const c = coversOf(id); return c ? `Хамрах зүйл: ${c}.` : objectives.get(id) ? `${upperFirst(trimEnd(objectives.get(id)!))}.` : ""; };
  const note = (categoryId: string, kind: "good" | "weak" | "unproven") => {
    const a = clearestAnswers(m, snapshot, categoryId, kind !== "weak", 1)[0], answer = a ? upperFirst(dimensionSays(a.cellId, a.score).replace(/^Энэ ажил(д)? /u, "")) || `${a.cell}: «${a.answer}».` : "";
    const tail = kind === "unproven" ? "Сул гэж тогтоогоогүй, нэмж тодруулна." : answer || (kind === "good" ? "Дүнг холбогдох хариултаас тооцсон." : "Шууд хариулт цөөн тул бодит байдлыг нэмж тодруулна.");
    return [meaning(categoryId), kind === "unproven" ? answer : "", tail, conflicted.has(categoryId) ? "Зарим хариулт хоорондоо зөрсөн тул дүнг дахин шалгана." : ""].filter(Boolean).join(" ");
  };
  for (const x of parts.strengths) findings[x.id] = note(x.categoryId, "good");
  for (const x of parts.weaknesses) findings[x.id] = note(x.categoryId, x.needsEvidence ? "unproven" : "weak");
  const picker = new GuidePicker(), roots = new Map(strategy.rootCause.findings.map(f => [f.id, f] as const)), affects: ReportGuidance["affects"] = [], used = new Set<string>(), spent = new Map<string, number>(); const sides = new Map<string, string>(); let unsureAt = -1; let reviews = -1; const top = parts.priorityActions.slice(0, 5);
  const priorities = top.map(a => {
    const capabilityMn = cat.get(a.categoryId) ?? a.titleMn, dimensionMn = cell.get(a.cellId) ?? "", evidence = a.type !== "EXECUTION" && a.type !== "LOCAL_IMPROVEMENT";
    const earlier = evidence && a.cellId !== "C02" ? sides.get(a.cellId) : undefined, dim = DIMENSIONS.get(a.cellId); if (!sides.has(a.cellId)) sides.set(a.cellId, capabilityMn);
    const first = !used.has(a.categoryId); used.add(a.categoryId);
    const content = first ? CAPABILITY_CONTENT.get(a.categoryId) : undefined, marketing = MARKETING.get(a.categoryId), own = marketing && first && a.cellId !== "C02" ? marketing : undefined;
    const label = DIMENSION_LANGUAGE.get(a.cellId)?.label ?? lowerFirst(dimensionMn), ownStep = content?.step ?? own?.start ?? "";
    /* Several works whose same side must be clarified: after the first, each one decides that side and goes on with its own concrete step, so the advice neither repeats nor speaks about something else. */
    const raw = earlier && dim ? (ownStep ? { ...picker.own(a.categoryId), start: `«${label}» талаар шийдвэрээ гаргаад, ${lowerFirst(trimEnd(ownStep))}` } : { start: `«${earlier}» ажилд авсан арга хэмжээг энд мөн хэрэгжүүлнэ`, run: dim.embed, embed: dim.embed, deliverable: dim.deliverable, check: dim.check }) : picker.pick(a.categoryId, a.cellId), full = (t: string) => upperFirst(trimEnd(named(t, null))), brief = (t: string) => upperFirst(trimEnd(named(t, null)));
    /* The second priority of one capability (another dimension of it) must not repeat the capability's own step. */
    const step = content?.step ?? own?.start ?? "", covers = first ? coversOf(a.categoryId) : "", proof = content?.evidence ?? own?.deliverable ?? "";
    const down = ((roots.get(a.findingId) as any)?.downstreamCategoryIds ?? []) as string[];
    const helps = top.filter(b => b.id !== a.id && b.categoryId !== a.categoryId && down.includes(b.categoryId));
    for (const b of helps) if (!affects.some(x => x.first === b.id && x.then === a.id)) affects.push({ first: a.id, then: b.id });
    /* Only an answer about THIS dimension may be quoted as the reason. */
    const said = clearestAnswers(m, snapshot, a.categoryId, false, 1, a.cellId)[0], reasons = evidence ? "" : reasonsOf(a.components, spent);
    const why = [evidence ? unsure[++unsureAt % unsure.length](label) : said && dimensionSays(a.cellId, said.score) ? `Оношилгооны хариултаас харахад ${lowerFirst(dimensionSays(a.cellId, said.score))}` : a.statedMn ? `Оношилгооны хариултаас харахад ${lowerFirst(dimensionSays(a.cellId, 0) || "энэ ажил хэрэгждэггүй.")}` : `Холбогдох хариултуудаас харахад «${label}» бусад хэсгээс сул байна.`,
      reasons, helps.length ? `Мөн «${cat.get(helps[0].categoryId)}» ажилд тус болно.` : ""].filter(Boolean).join(" ");
    const review = evidence ? REVIEWS[++reviews % REVIEWS.length](label) : "";
    const about = covers ? ` Ингэхдээ ${covers} зэргийг хамруулна.` : "", join = (...t: string[]) => t.filter(Boolean).map(x => `${upperFirst(trimEnd(x))}.`).join(" ");
    return { recommendationId: a.id, evidence, capabilityMn, dimensionMn, labelMn: a.cellId === "C02" ? "" : label, whyMn: why,
      doMn: evidence ? `${review}.${about} Хэрэв дутуу нь тогтоогдвол ${lowerFirst(trimEnd(a.cellId === "C02" && step ? step : named(raw.start, null)))}.` : `${full(raw.start)}.${about}${step ? ` ${upperFirst(trimEnd(step))}.` : ""}`,
      deliverableMn: evidence ? `Одоогийн байдлын дүгнэлт, дараа нь ${lowerFirst(raw.deliverable)}` : proof && proof !== raw.deliverable ? `${raw.deliverable} болон ${lowerFirst(proof)}` : raw.deliverable, outputs: evidence ? { startMn: "Одоогийн байдлын дүгнэлт", runMn: raw.deliverable } : { startMn: raw.deliverable, runMn: proof || raw.deliverable }, checkMn: raw.check,
      goalMn: upperFirst(trimEnd(objectives.get(a.categoryId) || a.objectiveMn)),
      steps: { startMn: evidence ? `${review}.` : `${brief(raw.start)}.${about}`,
        runMn: evidence ? `Хэрэв дутуу нь тогтоогдвол ${lowerFirst(trimEnd(a.cellId === "C02" && step ? step : named(raw.start, null)))}.` : join(step, brief(raw.run)),
        embedMn: evidence ? join(brief(raw.run)) : `${brief(raw.embed)}.` } };
  });
  /* Low scores that did not become one of the five priorities, and why, from the accepted ranking itself. */
  const chosen = new Set(top.map(a => a.categoryId)), candidates: any[] = (strategy.recommendations as any)?.candidates ?? [];
  const left = parts.weaknesses.filter(w => !w.needsEvidence && !chosen.has(w.categoryId)).slice(0, 4);
  const actionable = (id: string) => candidates.some(c => c.categoryId === id && (c.type === "EXECUTION" || c.type === "LOCAL_IMPROVEMENT"));
  const names = (rows: typeof left) => rows.slice(0, 2).map(w => `«${w.nameMn}»`).join(", ");
  const later = left.filter(w => actionable(w.categoryId)), unclear = left.filter(w => !actionable(w.categoryId));
  const selectionNoteMn = candidates.length && top.length ? [top.every(a => a.type !== "EXECUTION" && a.type !== "LOCAL_IMPROVEMENT") ? "Өгсөн хариултаар шууд засах сул тал тогтоогдоогүй тул эхлээд доорх таван ажлыг тодруулна." : "Энэ таван ажлыг зөвхөн оноогоор сонгоогүй. Дутагдлын хэмжээ, бусад ажилд үзүүлэх нөлөө, бизнесийн зорилгод ач холбогдолтой эсэх, эхлүүлэх боломжийг хамтад нь харгалзсан.",
    later.length ? `${names(later)} бага оноотой ч энэ эрэмбээр эхний тавд багтаагүй.` : "", unclear.length ? `${names(unclear)} ажлын талаар зөвлөмж өгөхийн өмнө хариултыг нэмж тодруулах шаардлагатай.` : ""].filter(Boolean).join(" ") : null;
  const share = coverageText(snapshot.overall.coverage);
  const shown = new Set([...parts.strengths, ...parts.weaknesses, ...parts.priorityActions].map(x => x.categoryId).concat(priorities.length ? top.flatMap(a => ((roots.get(a.findingId) as any)?.downstreamCategoryIds ?? []) as string[]) : []));
  const plain = displayNames(m.categories.map(c => ({ id: c.id, nameMn: c.nameMn })), shown);
  return { version: REPORT_GUIDANCE_VERSION, ...(Object.keys(plain).length ? { names: plain } : {}), findings, priorities, affects, selectionNoteMn,
    coverageNoteMn: share ? `Үнэлсэн хэсэг гэдэг нь нийт шалгуураас таны хариултаар үнэлж чадсан хувь (${share}%). Үлдсэн шалгуурыг сул гэж үзээгүй. Итгэлцлийн тоо зөвхөн хариулсан хэсэгт хамаарна.` : null,
    targetNoteMn: top.some(a => typeof a.targetCellScore === "number") ? "Одоо ба зорилт нь оношилгооны оноо. Зорилтыг одоогийн оноонд 25-ыг нэмж, 60-аас багагүй, 75-аас ихгүй байхаар тогтоосон. Энэ нь дараагийн оношилгоонд хүрэх түвшин бөгөөд орлого, борлуулалт өснө гэсэн амлалт биш." : null };
}
