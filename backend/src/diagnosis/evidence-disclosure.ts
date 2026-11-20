/**
 * Phase 2.7 — B3 presentation model (flag-gated; absent from results when the flag is OFF).
 * It DESCRIBES what the engine observed. It does not change any score, does not decide that a result is "sufficient", and does not
 * present the heuristic confidence as a probability. Criteria for calling a result OFFICIAL are NOT invented here: the only
 * "official" notion used is the engine's existing rule (officialScore exists only when every applicable weighted cell is valued).
 */
import type { MethodologyDefinition, RuntimeSnapshot } from "../engine/types.js";
import { directConfidence } from "../engine/confidence.js";
import { cellWeightPct } from "../engine/utils.js";

export type ProposedResultStatus = "PROVISIONAL" | "REVIEW_REQUIRED" | "OFFICIAL_UNDER_EXISTING_RULE";

export interface EvidenceDisclosure {
  model: "MMRI-EVIDENCE-DISCLOSURE-PROPOSAL-1";
  approved: false;
  observedScore: { value: number | null; kind: "partial" | "official" };
  resultStatus: { value: ProposedResultStatus; labelMn: string; officialCriteria: "EXISTING_ENGINE_RULE_ALL_APPLICABLE_CELLS_VALUED_NOT_REAPPROVED" };
  coverage: {
    weightedCellCoverage: number | null;
    applicableCapabilities: number;
    capabilitiesWithScoredEvidence: number;
    capabilityCoverageShare: number | null;
    valuedCells: number;
    applicableCells: number;
    unvaluedCellsWithEvidence: number;
  };
  evidenceSufficiency: { state: "CRITERIA_NOT_APPROVED"; note: string; observed: { meanValuedCellsPerApplicableCapability: number | null; minValuedCellsInAnyApplicableCapability: number | null } };
  contested: { cellCount: number; capabilityIds: string[]; ruleIds: string[] };
  exclusions: { excludedCapabilityCount: number; excludedWeightPct: number; excludedCapabilityIds: string[]; unresolvedApplicabilityConflicts: number; conflictCapabilityIds: string[] };
  confidence: {
    kind: "EVIDENCE_SUFFICIENCY_HEURISTIC";
    calibrated: false;
    isProbability: false;
    runtimeValue: number | null;
    contractFaithfulCoverageWeightedValue: number | null;
    noteMn: string;
  };
  warningsMn: string[];
}

const NOTE_MN = "Итгэлцлийн үзүүлэлт нь нотолгооны хангалттай байдлын эвристик бөгөөд тохируулагдаагүй. Энэ нь оноо зөв байх магадлал биш.";

export function buildEvidenceDisclosure(methodology: MethodologyDefinition, snapshot: RuntimeSnapshot): EvidenceDisclosure {
  const cats = [...snapshot.categories.values()];
  const applicable = cats.filter(c => !c.confirmedNotApplicable);
  const withScored = applicable.filter(c => c.finalizedCellCount > 0 || c.reviewRequiredCellCount > 0 || ((c.coverage ?? 0) > 0));
  const cells = [...snapshot.cells.values()];
  const contestedCells = cells.filter(c => c.hasHardContradiction && c.cellId !== "C01");
  const conflictGates = cells.filter(c => c.cellId === "C01" && c.hasHardContradiction);
  const excluded = cats.filter(c => c.confirmedNotApplicable);
  const catDef = new Map(methodology.categories.map(c => [c.id, c]));
  const valuedPerCap = applicable.map(c => c.applicableCellCount - c.unresolvedCellCount);

  // Frozen confidence formula (approximation: weighted non-gate cells only): cell confidence from the contract (path reliabilities, direct-count caps, contradiction cap),
  // category = sum(w*cellConf) / sum(w over ALL applicable weighted cells) with unresolved cells counting 0, then module/overall weights; N/A capabilities drop out.
  const modWeight = new Map(methodology.modules.map(m => [m.id, m.weightPct]));
  const catConfidence = new Map<string, number>();
  for (const c of applicable) {
    let num = 0, den = 0;
    for (const cd of methodology.cells) {
      if (cd.id === "C01") continue;
      const cell = snapshot.cells.get(`${c.categoryId}:${cd.id}`);
      const w = cellWeightPct(methodology, c.categoryId, cd.id, cd.weightPct);
      if (!cell || w <= 0 || cell.status === "NOT_APPLICABLE") continue;
      den += w;
      if (cell.effectiveScore === null) continue;
      const scored = cell.directEvidence.filter(e => e.state === "SCORED" && e.score !== null);
      if (scored.length === 0) continue;
      num += w * directConfidence(methodology.contracts, { reliabilities: scored.map(e => e.reliability), sourceKinds: scored.map(e => e.sourceKind), directCount: scored.length, hardContradiction: cell.hasHardContradiction });
    }
    catConfidence.set(c.categoryId, den > 0 ? num / den : 0);
  }
  const byModule = new Map<string, typeof applicable>();
  for (const c of applicable) { const m = catDef.get(c.categoryId)!.module; byModule.set(m, [...(byModule.get(m) ?? []), c]); }
  const totalModule = [...byModule.keys()].reduce((s, m) => s + (modWeight.get(m) ?? 0), 0);
  let contractConf: number | null = null;
  if (totalModule > 0) {
    contractConf = 0;
    for (const [m, list] of byModule) {
      const wsum = list.reduce((s, c) => s + catDef.get(c.categoryId)!.weightPct, 0);
      const part = list.reduce((s, c) => s + catDef.get(c.categoryId)!.weightPct * (catConfidence.get(c.categoryId) ?? 0), 0);
      contractConf += ((modWeight.get(m) ?? 0) / totalModule) * (wsum > 0 ? part / wsum : 0);
    }
    contractConf = Math.round(contractConf * 1e6) / 1e6;
  }

  const hard = contestedCells.length > 0 || conflictGates.length > 0;
  const official = snapshot.overall.officialScore !== null;
  const status: ProposedResultStatus = hard ? "REVIEW_REQUIRED" : official ? "OFFICIAL_UNDER_EXISTING_RULE" : "PROVISIONAL";
  const labelMn = status === "REVIEW_REQUIRED" ? "Нягтлах шаардлагатай үнэлгээ" : status === "PROVISIONAL" ? "Урьдчилсан үнэлгээ" : "Албан ёсны үнэлгээ (одоогийн дүрмээр)";
  const warningsMn: string[] = [];
  const pctText = (v: number | null) => (v === null ? "-" : `${(Math.round(v * 1000) / 10).toString()}%`);
  const valuedCells = valuedPerCap.reduce((a, b) => a + b, 0), applicableCells = applicable.reduce((a, c) => a + c.applicableCellCount, 0);
  // The sentence carries the engine's real figures so a reader of the PDF/Results sees how much of the model the score rests on.
  if (status === "PROVISIONAL") warningsMn.push(`Оноо нь хариулсан үзүүлэлтүүд дээр суурилсан урьдчилсан үнэлгээ: нийт ${applicableCells} үзүүлэлтийн ${valuedCells} нь үнэлэгдсэн (жинлэсэн хамралт ${pctText(snapshot.overall.coverage)}); ${withScored.length}/${applicable.length} чадавхид нотолгоо бүртгэгдсэн.`);
  if (contestedCells.length) warningsMn.push(`${contestedCells.length} үзүүлэлтийн хариултууд зөрчилдсөн тул нягтлах шаардлагатай.`);
  if (conflictGates.length) warningsMn.push(`${conflictGates.length} чадавхийн «хамаарахгүй» хариулт нь үнэлэгдсэн хариулттай зөрчилдсөн тул оноонд хасагдаагүй.`);
  if (excluded.length) warningsMn.push(`${excluded.length} чадавхи «хамаарахгүй» гэж тооцогдсон тул оноонд ороогүй.`);
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  return {
    model: "MMRI-EVIDENCE-DISCLOSURE-PROPOSAL-1", approved: false,
    observedScore: { value: official ? snapshot.overall.officialScore : snapshot.overall.partialScore, kind: official ? "official" : "partial" },
    resultStatus: { value: status, labelMn, officialCriteria: "EXISTING_ENGINE_RULE_ALL_APPLICABLE_CELLS_VALUED_NOT_REAPPROVED" },
    coverage: {
      weightedCellCoverage: snapshot.overall.coverage, applicableCapabilities: applicable.length, capabilitiesWithScoredEvidence: withScored.length,
      capabilityCoverageShare: applicable.length ? withScored.length / applicable.length : null,
      valuedCells: sum(valuedPerCap), applicableCells: sum(applicable.map(c => c.applicableCellCount)),
      unvaluedCellsWithEvidence: cells.filter(c => c.cellId !== "C01" && c.status !== "NOT_APPLICABLE" && c.effectiveScore === null && (c.evidenceCount ?? 0) > 0).length
    },
    evidenceSufficiency: { state: "CRITERIA_NOT_APPROVED", note: "Sufficiency criteria are an owner decision; only observations are reported.",
      observed: { meanValuedCellsPerApplicableCapability: applicable.length ? sum(valuedPerCap) / applicable.length : null, minValuedCellsInAnyApplicableCapability: valuedPerCap.length ? Math.min(...valuedPerCap) : null } },
    contested: { cellCount: contestedCells.length, capabilityIds: [...new Set(contestedCells.map(c => c.categoryId))].sort(), ruleIds: [...new Set(contestedCells.flatMap(c => c.hardContradictionRuleIds))].sort() },
    exclusions: { excludedCapabilityCount: excluded.length, excludedWeightPct: Math.round(sum(excluded.map(c => c.baseWeightPct)) * 1e4) / 1e4, excludedCapabilityIds: excluded.map(c => c.categoryId).sort(),
      unresolvedApplicabilityConflicts: conflictGates.length, conflictCapabilityIds: conflictGates.map(c => c.categoryId).sort() },
    confidence: { kind: "EVIDENCE_SUFFICIENCY_HEURISTIC", calibrated: false, isProbability: false, runtimeValue: snapshot.overall.confidence, contractFaithfulCoverageWeightedValue: contractConf, noteMn: NOTE_MN },
    warningsMn
  };
}
