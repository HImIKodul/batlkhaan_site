/* Checks for the defects the owner found by reading: repeated explanations, identical instructions, missing deliverables, unexplained targets, late-year emptiness, wrong dates, invented figures. Pure; used by tests and the preview. */
import type { FrozenReportPayload } from "../types.js";
import type { AnnualPlanReady } from "../annual-plan.js";
const norm = (t: string) => new Set(t.toLowerCase().replace(/«[^»]*»/gu, " ").replace(/[^\p{L}\s]/gu, " ").split(/\s+/).filter(w => w.length > 3));
const similar = (a: string, b: string) => { const x = norm(a), y = norm(b); const i = [...x].filter(w => y.has(w)).length; return x.size && y.size ? i / Math.min(x.size, y.size) : 0; };
const FIGURE = /\d\s*(?:%|хув|₮|төгрөг|сая|тэрбум|ажилтан)|(?:хувиар|сая төгрөг)/iu;
export function guidanceIssues(payload: FrozenReportPayload, plan: AnnualPlanReady | null): string[] {
  const g = payload.guidance, out: string[] = []; if (!g) return ["NO_GUIDANCE"];
  const pairs = (rows: string[], code: string, limit: number) => { for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) if (similar(rows[i], rows[j]) >= limit) out.push(`${code}:${i + 1},${j + 1}`); };
  pairs(payload.strengths.map(s => g.findings[s.id] ?? ""), "REPEATED_STRENGTH", 0.85); pairs(payload.weaknesses.map(s => g.findings[s.id] ?? ""), "REPEATED_WEAKNESS", 0.85);
  pairs(g.priorities.map(p => p.doMn), "REPEATED_ACTION", 0.55); pairs(g.priorities.map(p => p.deliverableMn), "REPEATED_DELIVERABLE", 0.9); pairs(g.priorities.map(p => p.checkMn), "REPEATED_CHECK", 0.9);
  for (const [i, p] of g.priorities.entries()) { for (const k of ["whyMn", "doMn", "deliverableMn", "checkMn"] as const) if (!p[k]?.trim()) out.push(`MISSING_${k}:${i + 1}`); if (FIGURE.test([p.doMn, p.deliverableMn, p.checkMn].join(" "))) out.push(`FIGURE:${i + 1}`); if (/\{c\}|undefined|  /.test(JSON.stringify(p))) out.push(`TEMPLATE:${i + 1}`); }
  for (const w of payload.weaknesses) if (w.score >= 60 && !w.needsEvidence) out.push(`INVENTED_WEAKNESS:${w.id}`);
  if (/хуудсын/u.test(JSON.stringify(g))) out.push("LANGUAGE:хуудсын"); if (/ноцтой зөрчил/u.test(payload.risks.map(r => r.messageMn).join(" "))) out.push("UNQUALIFIED_WARNING");
  if (g.priorities.length && g.selectionNoteMn === null && payload.weaknesses.some(w => !w.needsEvidence && !payload.priorityActions.some(a => a.categoryId === w.categoryId))) out.push("SELECTION_UNEXPLAINED");
  if (payload.priorityActions.some(a => typeof a.targetCellScore === "number") && !g.targetNoteMn) out.push("TARGET_UNEXPLAINED");
  if (plan) {
    const acts = plan.stages.flatMap(s => s.actions.map(a => ({ s, a })));
    const late = acts.filter(x => x.s.startDay >= 180); if (late.length < 4) out.push("LATE_YEAR_THIN");
    if (plan.stages[0].startDay !== 0 || Math.max(...plan.stages.map(s => s.endDay)) < 363) out.push("YEAR_COVERAGE");
    for (let i = 1; i < plan.stages.length; i++) if (plan.stages[i].startDay > plan.stages[i - 1].endDay + 1) out.push("GAP");
    for (const [i] of payload.priorityActions.entries()) if (acts.filter(x => x.a.recommendationIds.includes(`F${i + 1}`)).length < 2) out.push(`PRIORITY_NOT_CONTINUED:${i + 1}`);
    for (const d of g.affects) { const first = payload.priorityActions.findIndex(a => a.id === d.first) + 1, then = payload.priorityActions.findIndex(a => a.id === d.then) + 1; const at = (n: number) => acts.find(x => x.a.recommendationIds.includes(`F${n}`))?.s.startDay ?? 0; if (!g.affects.some(y => y.first === d.then && y.then === d.first) && at(first) > at(then)) out.push(`ORDER:${first}->${then}`); }
    if (FIGURE.test(acts.map(x => x.a.textMn).join(" "))) out.push("PLAN_FIGURE"); pairs(acts.filter(x => x.a.recommendationIds.length === 1).map(x => x.a.textMn), "REPEATED_PLAN_ACTION", 0.75);
  }
  return out;
}
