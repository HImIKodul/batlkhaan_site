import type { CellSnapshot, DirectEvidence, MethodologyDefinition, RuntimeSnapshot } from "./types.js";
import { canConfirmNa, canDirectFinalize, derivedConfidence, directConfidence } from "./confidence.js";
import { evaluateContradictions } from "./contradictions.js";
import { mapKey, mean } from "./utils.js";
import { calculateAggregateSnapshots } from "./scoring.js";
import { calculateAdaptiveV13RuntimeSnapshot } from "./adaptive-cell-state.js";
import { calculateBusinessMriRuntimeSnapshot } from "./businessmri-runtime.js";
import { assertEvidenceIntegrity, assertRuntimeSnapshotIntegrity } from "./integrity.js";

export function calculateRuntimeSnapshot(definition: MethodologyDefinition, evidence: DirectEvidence[]): RuntimeSnapshot {
  // Scoring is fail-closed: only canonical, one-effective-answer-per-question
  // evidence is accepted by the calculation boundary. This protects the frozen
  // methodology from duplicate/tampered persistence or integration payloads.
  assertEvidenceIntegrity(definition, evidence);

  let snapshot: RuntimeSnapshot;
  if (definition.engineKind === "BUSINESSMRI_V2") {
    snapshot = calculateBusinessMriRuntimeSnapshot(definition, evidence);
  } else {
    const runtime = definition.runtimePolicy;
    const completeV13Policy = Boolean(
      runtime?.enabled
      && runtime.questionById.size === definition.questions.length
      && runtime.cellByCategoryCell.size === definition.categories.length * definition.cells.length
    );
    snapshot = completeV13Policy
      ? calculateAdaptiveV13RuntimeSnapshot(definition, evidence)
      : calculateLegacyRuntimeSnapshot(definition, evidence);
  }

  assertRuntimeSnapshotIntegrity(definition, snapshot);
  return snapshot;
}

function calculateLegacyRuntimeSnapshot(definition: MethodologyDefinition, evidence: DirectEvidence[]): RuntimeSnapshot {
  const cells = new Map<string, CellSnapshot>();
  const evidenceByCell = new Map<string, DirectEvidence[]>();
  for (const e of evidence) {
    const key = mapKey(e.categoryId, e.cellId);
    const list = evidenceByCell.get(key) ?? [];
    list.push(e);
    evidenceByCell.set(key, list);
  }

  // Phase 1: direct state only.
  for (const category of definition.categories) {
    for (const cell of definition.cells) {
      const key = mapKey(category.id, cell.id);
      const direct = (evidenceByCell.get(key) ?? []).slice().sort((a,b) => a.path - b.path);
      cells.set(key, calculateDirectCell(definition, category.id, cell.id, direct));
    }
  }

  // Phase 2: hard/tension rules based only on direct evidence/state.
  let allFindings = [] as ReturnType<typeof evaluateContradictions>;
  for (const category of definition.categories) {
    allFindings.push(...evaluateContradictions(definition, category.id, cells));
  }
  applyFindings(definition, cells, allFindings);

  // Phase 3: derived values from non-conflicted direct source cells only.
  for (const category of definition.categories) {
    for (const cell of definition.cells) {
      const key = mapKey(category.id, cell.id);
      const current = cells.get(key)!;
      if (current.status === "NOT_APPLICABLE" || current.directScore !== null || cell.id === "C01") continue;
      const incoming = definition.incomingEdgesByTarget.get(cell.id) ?? [];
      const contributions = [] as CellSnapshot["derivedContributions"];
      for (const edge of incoming) {
        const source = cells.get(mapKey(category.id, edge.sourceCellId));
        if (!source || source.directScore === null || source.hasHardContradiction || source.status === "NOT_APPLICABLE") continue;
        const strength = edge.coefficient * source.directConfidence;
        if (strength <= 0) continue;
        contributions.push({
          sourceCellId: edge.sourceCellId,
          targetCellId: cell.id,
          sourceValue: source.directScore,
          sourceDirectConfidence: source.directConfidence,
          coefficient: edge.coefficient,
          weightedStrength: strength
        });
      }
      if (contributions.length === 0) continue;
      const denom = contributions.reduce((s,c) => s + c.weightedStrength, 0);
      const dScore = denom > 0 ? contributions.reduce((s,c) => s + c.sourceValue * c.weightedStrength, 0) / denom : null;
      const dConfidence = derivedConfidence(definition.contracts, contributions.map(c => c.weightedStrength));
      current.derivedContributions = contributions;
      current.derivedScore = dScore;
      current.derivedConfidence = dConfidence;
      current.effectiveScore = dScore;
      current.effectiveConfidence = dConfidence;
      current.status = current.exhausted ? "REVIEW_REQUIRED" : "DERIVED_PROVISIONAL";
    }
  }

  // Findings are intentionally preserved from the direct-evidence evaluation.
  // Scope contradictions (for example H02) may reopen an N/A state; re-evaluating
  // against the mutated state would incorrectly erase the original contradiction.
  const aggregate = calculateAggregateSnapshots(definition, cells);
  return { cells, contradictions: allFindings, ...aggregate };
}

function calculateDirectCell(definition: MethodologyDefinition, categoryId: string, cellId: string, directEvidence: DirectEvidence[]): CellSnapshot {
  const cellDef = definition.cells.find(c => c.id === cellId)!;
  const scored = directEvidence.filter(e => e.state === "SCORED" && e.score !== null);
  const naClaims = directEvidence.filter(e => e.state === "N_A_CLAIM");
  const applicability = directEvidence.filter(e => ["PARTIAL_APPLICABILITY","MOSTLY_APPLICABLE","APPLICABLE"].includes(e.state));
  const exhausted = new Set(directEvidence.map(e => e.path)).size >= 4;

  const scoredValues = scored.map(e => e.score as number);
  const directScore = mean(scoredValues);
  const directKinds = definition.contracts.confidence.independencePolicy?.sourceDiversityBonusDisabled
    ? (scored.length > 0 ? 1 : 0)
    : new Set(scored.map(e => e.sourceKind)).size;
  const maxAuthority = scored.length ? Math.max(...scored.map(e => e.authority)) : 0;
  const range = scoredValues.length >= 2 ? Math.max(...scoredValues) - Math.min(...scoredValues) : 0;
  const localHard = range >= Number(definition.contracts.contradiction.sameCell.hardRangePoints ?? 50);
  const variance = range >= Number(definition.contracts.contradiction.sameCell.varianceRangePoints ?? 25) && !localHard;
  const dConfidence = directConfidence(definition.contracts, {
    reliabilities: scored.map(e => e.reliability),
    sourceKinds: scored.map(e => e.sourceKind),
    directCount: scored.length,
    hardContradiction: localHard
  });

  const naKinds = definition.contracts.confidence.independencePolicy?.sourceDiversityBonusDisabled
    ? (naClaims.length > 0 ? 1 : 0)
    : new Set(naClaims.map(e => e.sourceKind)).size;
  const naConfidence = directConfidence(definition.contracts, {
    reliabilities: naClaims.map(e => e.reliability),
    sourceKinds: naClaims.map(e => e.sourceKind),
    directCount: naClaims.length,
    hardContradiction: false
  });
  const naConfirmed = cellDef.naPolicy !== "DISALLOWED" && canConfirmNa(definition.contracts, {
    claimCount: naClaims.length,
    sourceKindCount: naKinds,
    claimConfidence: naConfidence,
    hasScoredConflict: scored.length > 0
  });

  let applicabilityRelevance: number | null = null;
  let appConfidence = 0;
  let appCount = 0;
  let appKinds = 0;
  let appMaxAuthority = 0;
  if (cellId === "C01" && applicability.length) {
    const relevance = definition.contracts.scoring.routingRelevance["AT-APPLICABILITY-4"];
    applicabilityRelevance = mean(applicability.map(e => Number(relevance[String(e.optionIndex)])));
    appCount = applicability.length;
    appKinds = definition.contracts.confidence.independencePolicy?.sourceDiversityBonusDisabled
      ? (applicability.length > 0 ? 1 : 0)
      : new Set(applicability.map(e => e.sourceKind)).size;
    appMaxAuthority = Math.max(...applicability.map(e => e.authority));
    appConfidence = directConfidence(definition.contracts, {
      reliabilities: applicability.map(e => e.reliability),
      sourceKinds: applicability.map(e => e.sourceKind),
      directCount: applicability.length,
      hardContradiction: false
    });
  }

  let status: CellSnapshot["status"] = "UNASSESSED";
  let effectiveScore: number | null = directScore;
  let effectiveConfidence = dConfidence;

  if (naConfirmed) {
    status = "NOT_APPLICABLE";
    effectiveScore = null;
    effectiveConfidence = naConfidence;
  } else if (cellId === "C01") {
    effectiveScore = null;
    effectiveConfidence = appConfidence;
    if (appCount > 0) {
      const final = canDirectFinalize(definition.contracts, {
        directCount: appCount,
        sourceKindCount: appKinds,
        confidence: appConfidence,
        hasValue: applicabilityRelevance !== null,
        hasHardContradiction: false,
        maxAcceptedAuthority: appMaxAuthority
      });
      status = final ? "DIRECT_FINAL" : exhausted ? "REVIEW_REQUIRED" : "GATHERING";
    } else if (directEvidence.length > 0) {
      status = exhausted ? "UNRESOLVED" : "GATHERING";
    }
  } else if (directScore !== null) {
    const final = canDirectFinalize(definition.contracts, {
      directCount: scored.length,
      sourceKindCount: directKinds,
      confidence: dConfidence,
      hasValue: true,
      hasHardContradiction: localHard,
      maxAcceptedAuthority: maxAuthority
    });
    status = final ? "DIRECT_FINAL" : exhausted ? "REVIEW_REQUIRED" : "DIRECT_PROVISIONAL";
  } else if (directEvidence.length > 0) {
    status = exhausted ? "UNRESOLVED" : "GATHERING";
  }

  return {
    categoryId,
    cellId,
    status,
    directScore,
    directConfidence: dConfidence,
    derivedScore: null,
    derivedConfidence: 0,
    effectiveScore,
    effectiveConfidence,
    directAnswerCount: cellId === "C01" ? appCount : scored.length,
    independentSourceKinds: cellId === "C01" ? appKinds : directKinds,
    maxAcceptedAuthority: cellId === "C01" ? appMaxAuthority : maxAuthority,
    naClaimCount: naClaims.length,
    naClaimConfidence: naConfidence,
    applicabilityRelevance,
    hasHardContradiction: localHard,
    hasSameCellVariance: variance,
    hasSecondaryTension: false,
    hardContradictionRuleIds: localHard ? ["H01"] : [],
    tensionRuleIds: [],
    directEvidence,
    derivedContributions: [],
    exhausted
  };
}

function applyFindings(definition: MethodologyDefinition, cells: Map<string, CellSnapshot>, findings: ReturnType<typeof evaluateContradictions>): void {
  for (const finding of findings) {
    for (const cellId of finding.affectedCellIds) {
      const cell = cells.get(mapKey(finding.categoryId, cellId));
      if (!cell) continue;
      if (finding.type === "HARD") {
        cell.hasHardContradiction = true;
        if (!cell.hardContradictionRuleIds.includes(finding.ruleId)) cell.hardContradictionRuleIds.push(finding.ruleId);
        cell.directConfidence = Math.min(cell.directConfidence, Number(definition.contracts.contradiction.effects.hard.confidenceCap ?? 0.65));
        if (cell.directScore !== null) {
          cell.effectiveScore = cell.directScore;
          cell.effectiveConfidence = cell.directConfidence;
        }
        if (cell.status === "NOT_APPLICABLE") {
          // Scope contradiction reopens the gate/cell rather than discarding later scored evidence.
          cell.status = cell.exhausted ? "REVIEW_REQUIRED" : "GATHERING";
          cell.effectiveConfidence = Math.min(cell.naClaimConfidence, Number(definition.contracts.contradiction.effects.hard.confidenceCap ?? 0.65));
        } else if (cell.status === "DIRECT_FINAL") {
          cell.status = cell.exhausted ? "REVIEW_REQUIRED" : "DIRECT_PROVISIONAL";
        } else if (cell.exhausted && cell.effectiveScore !== null) {
          cell.status = "REVIEW_REQUIRED";
        }
      } else {
        cell.hasSecondaryTension = true;
        if (!cell.tensionRuleIds.includes(finding.ruleId)) cell.tensionRuleIds.push(finding.ruleId);
      }
    }
  }
}
