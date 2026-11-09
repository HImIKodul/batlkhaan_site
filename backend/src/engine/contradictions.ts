import type { CellSnapshot, ContradictionFinding, DirectEvidence, MethodologyDefinition } from "./types.js";
import { mapKey } from "./utils.js";

export function evaluateContradictions(definition: MethodologyDefinition, categoryId: string, cells: Map<string, CellSnapshot>): ContradictionFinding[] {
  const findings: ContradictionFinding[] = [];
  const byCell = (cellId: string) => cells.get(mapKey(categoryId, cellId));
  const scored = (cellId: string) => byCell(cellId)?.directEvidence.filter(e => e.state === "SCORED" && e.score !== null) ?? [];
  const score = (cellId: string) => byCell(cellId)?.directScore ?? null;

  for (const cell of definition.cells) {
    const cs = byCell(cell.id);
    if (!cs) continue;
    const values = scored(cell.id).map(e => e.score as number);
    if (values.length >= 2 && Math.max(...values) - Math.min(...values) >= Number(definition.contracts.contradiction.sameCell.hardRangePoints ?? 50)) {
      findings.push(hard("H01", "DIRECT_CONTRADICTION", categoryId, [cell.id], "Same-cell direct score range is >=50 points."));
    }
  }

  const c01 = byCell("C01");
  if (c01?.status === "NOT_APPLICABLE") {
    const conflicting = definition.cells.filter(c => c.id !== "C01" && scored(c.id).length > 0).map(c => c.id);
    if (conflicting.length) findings.push(hard("H02", "SCOPE_CONTRADICTION", categoryId, ["C01", ...conflicting], "Category is confirmed N/A but scored evidence exists in the category."));
  }

  for (const cell of definition.cells.filter(c => c.naPolicy === "CONDITIONAL")) {
    const cs = byCell(cell.id);
    const minClaims = Number(definition.contracts.naDnk.naConfirmation.minimumClaims ?? 3);
    const minConfidence = Number(definition.contracts.naDnk.naConfirmation.minimumConfidence ?? 0.8);
    // If enough N/A evidence exists to have confirmed the cell, any scored evidence
    // creates H03 even though the current calculator conservatively reopens N/A.
    if (cs && cs.naClaimCount >= minClaims && cs.naClaimConfidence >= minConfidence && scored(cell.id).length > 0) {
      findings.push(hard("H03", "SCOPE_CONTRADICTION", categoryId, [cell.id], "Cell has confirmable N/A evidence and scored evidence for the same cell."));
    }
  }

  if (hasLabel(scored("C39"), "Зорилтот түвшин тогтоодоггүй") && scored("C41").length > 0) {
    findings.push(hard("H04", "MEASUREMENT_CONTRADICTION", categoryId, ["C39","C41"], "No target level is declared while target-achievement evidence exists."));
  }

  const c44QualityNoBenchmark = scored("C44").some(e => e.scoringProfileCode === "AT-BENCHMARK-QUALITY5" && e.score === 0);
  const c44PositionScored = scored("C44").some(e => e.scoringProfileCode === "AT-BENCHMARK-POSITION5-COND" && e.score !== null);
  if (c44QualityNoBenchmark && c44PositionScored) {
    findings.push(hard("H05", "BENCHMARK_CONTRADICTION", categoryId, ["C44"], "Benchmark quality says no benchmark while a scored benchmark position is supplied."));
  }

  if (score("C02") !== null && score("C15") !== null) {
    if ((score("C02") as number) <= 0 && (score("C15") as number) >= 75) findings.push(hard("H06","IMPLEMENTATION_ADOPTION_CONTRADICTION",categoryId,["C02","C15"],"Implementation is absent while adoption is high."));
    if ((score("C02") as number) >= 75 && (score("C15") as number) <= 0) findings.push(hard("H07","IMPLEMENTATION_ADOPTION_CONTRADICTION",categoryId,["C02","C15"],"Implementation is high while adoption is absent."));
  }

  for (const rule of definition.contracts.contradiction.tensionRules ?? []) {
    const left = score(rule.leftCell);
    const right = score(rule.rightCell);
    if (tensionConditionMatches(rule.condition, left, right, scored(rule.rightCell).length > 0)) {
      findings.push({ ruleId: rule.id, type: "TENSION", flag: rule.flag, categoryId, affectedCellIds: [rule.leftCell, rule.rightCell], reason: rule.reason });
    }
  }

  for (const edge of definition.secondaryEdges) {
    const source = byCell(edge.sourceCellId);
    const target = byCell(edge.targetCellId);
    if (!source || !target || source.directScore === null || target.directScore === null) continue;
    if (source.hasHardContradiction || target.status === "NOT_APPLICABLE") continue;
    const threshold = Number(definition.contracts.manyToMany.tension.triggerAbsoluteDifferencePoints ?? 50);
    if (Math.abs(source.directScore - target.directScore) >= threshold) {
      findings.push({
        ruleId: `SECONDARY:${edge.sourceCellId}:${edge.targetCellId}`,
        type: "SECONDARY_TENSION",
        flag: "SECONDARY_TENSION",
        categoryId,
        affectedCellIds: [edge.sourceCellId, edge.targetCellId],
        reason: `Direct scores differ by >=${threshold} across secondary relation ${edge.relation}.`
      });
    }
  }

  return dedupe(findings);
}

function hard(ruleId: string, flag: string, categoryId: string, affectedCellIds: string[], reason: string): ContradictionFinding {
  return { ruleId, type: "HARD", flag, categoryId, affectedCellIds, reason };
}

function hasLabel(evidence: DirectEvidence[], fragment: string): boolean {
  return evidence.some(e => e.optionLabel.includes(fragment));
}

function tensionConditionMatches(condition: string, left: number | null, right: number | null, rightIsScored: boolean): boolean {
  const m = condition.match(/C\d+\s*(<=|>=)\s*(\d+)\s+AND\s+C\d+\s*(<=|>=)\s*(\d+)/i);
  if (m) {
    if (left === null || right === null) return false;
    return compare(left, m[1], Number(m[2])) && compare(right, m[3], Number(m[4]));
  }
  const scored = condition.match(/C\d+\s*(<=|>=)\s*(\d+)\s+AND\s+C\d+\s+IS_SCORED/i);
  if (scored) {
    if (left === null) return false;
    return compare(left, scored[1], Number(scored[2])) && rightIsScored;
  }
  return false;
}

function compare(value: number, op: string, target: number): boolean {
  return op === "<=" ? value <= target : value >= target;
}

function dedupe(findings: ContradictionFinding[]): ContradictionFinding[] {
  const seen = new Set<string>();
  return findings.filter(f => {
    const key = `${f.ruleId}:${f.categoryId}:${[...f.affectedCellIds].sort().join(",")}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
