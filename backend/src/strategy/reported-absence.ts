import type { CellSnapshot } from "../engine/types.js";

/**
 * CONFIRMED ABSENCE vs MISSING EVIDENCE (owner decision 2026-11-24).
 *
 * A cell may have too little evidence for a score-based judgement and still hold an explicit statement of the company that a practice is not done. Asking such a company to "collect evidence" is wrong: what is
 * missing is the practice, not the information. This function recognises only that case. It reads answers; it never changes a score, a confidence, a status, a root class or an evidence threshold.
 *
 * All of these must hold:
 *  1. the cell was answered DIRECTLY (a derived or unassessed cell is missing evidence);
 *  2. no contradiction or review is open on it;
 *  3. at least one SELF_REPORT answer (how the company generally works; one recent case proves nothing general) is the BOTTOM rung (score 0, state SCORED) and its wording says the practice is not done;
 *  4. every other scored answer of the cell is below `otherScoresBelow` (the methodology's own localImprovement.cellValueBelow), so mixed answers stay open.
 * "Unclear", "not verified", lacking resources, outcomes, shares and quality descriptions are NOT statements of absence, whatever their score.
 */
export const REPORTED_ABSENCE_POLICY_VERSION = "MMRI-REPORTED-ABSENCE-1.0" as const;
/** Negated verb at the end of the answer: "... хийдэггүй", "... тогтоогоогүй", or "байхгүй". */
const NOT_DONE = /(?:^|[\s,])(?:байхгүй|байдаггүй|[а-яёөү]+(?:даг|дэг|дог|дөг)гүй|[а-яёөү]+(?:аагүй|ээгүй|оогүй|өөгүй))\.?$/iu;
/** No established routine: "Тогтсон хяналтгүй", "Тогтсон хянан хэлэлцэх давтамжгүй". */
const NO_ROUTINE = /^тогтсон\s.+гүй\.?$/iu;
/** Not a practice: unclear, unverified, cannot / lacks / does not reach / does not match / not finished, and things that happen to the company. */
const NOT_A_PRACTICE = /тодорхойгүй|тодорхой\s+бус|баталгаажаагүй|баталгаатай|ойлгомжгүй|мэддэггүй|чад(?:даг|аа)гүй|хүрэлц|хүр(?:дэг|ээ)гүй|нийц(?:дэг|ээ)гүй|уялдаагүй|олд(?:дог|оо)гүй|очдоггүй|дуусгаагүй|дуус(?:даг|аа)гүй|багас|буур|тасар|шинэчлэгдээгүй|хамардаггүй|хадгалж/iu;

export function isAbsenceLabel(label: string): boolean {
  const t = String(label ?? "").replace(/\s+/g, " ").trim();
  return (NOT_DONE.test(t) || NO_ROUTINE.test(t)) && !NOT_A_PRACTICE.test(t);
}

/** Ids of the answers that state the absence, or null when the cell is not a confirmed absence. */
export function reportedAbsence(cell: CellSnapshot | undefined, otherScoresBelow: number): string[] | null {
  if (!cell || (cell.status !== "DIRECT_PROVISIONAL" && cell.status !== "DIRECT_FINAL")) return null;
  if (cell.hasHardContradiction || cell.hasSameCellVariance || cell.hasSecondaryTension) return null;
  const scored = (cell.directEvidence ?? []).filter(e => e.state === "SCORED" && typeof e.score === "number");
  const stated = scored.filter(e => e.sourceKind === "SELF_REPORT" && e.score === 0 && isAbsenceLabel(e.optionLabel));
  if (!stated.length || scored.some(e => (e.score as number) >= otherScoresBelow)) return null;
  return stated.map(e => e.questionId);
}
