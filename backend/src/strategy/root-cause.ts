import type { CategorySnapshot, CellSnapshot, MethodologyDefinition, RuntimeSnapshot } from "../engine/types.js";
import type { FindingRole, RootCauseResult, RootClassification, RootFinding } from "./types.js";

const clamp = (v: number, lo = 0, hi = 1): number => Math.min(hi, Math.max(lo, v));
const aggregate = (supports: number[]): number => supports.length ? 1 - supports.reduce((p, s) => p * (1 - clamp(s)), 1) : 0;

interface NodeMetric {
  value: number | null;
  severity: number;
  evidence: number;
}

function categoryMetric(c: CategorySnapshot | undefined, weaknessThreshold: number): NodeMetric {
  if (!c || c.confirmedNotApplicable) return { value: null, severity: 0, evidence: 0 };
  const value = c.officialScore ?? c.partialScore;
  if (value === null) return { value: null, severity: 0, evidence: 0 };
  const severity = clamp((weaknessThreshold - value) / weaknessThreshold);
  const confidence = c.confidence ?? 0;
  const coverage = c.coverage ?? 0;
  const evidence = clamp(confidence / 0.8) * coverage;
  return { value, severity, evidence };
}

function cellMetric(cell: CellSnapshot | undefined, weaknessThreshold: number, statusFactors: Record<string, number | null>): NodeMetric {
  if (!cell || cell.status === "NOT_APPLICABLE") return { value: null, severity: 0, evidence: 0 };
  const value = cell.effectiveScore;
  if (value === null) return { value: null, severity: 0, evidence: 0 };
  const severity = clamp((weaknessThreshold - value) / weaknessThreshold);
  const factor = statusFactors[cell.status] ?? 0;
  const evidence = factor === null ? 0 : clamp(cell.effectiveConfidence / 0.8) * Number(factor);
  return { value, severity, evidence };
}

function rootBand(score: number): RootClassification {
  if (score >= 55) return "PRIMARY_ROOT_CAUSE";
  if (score >= 35) return "CONTRIBUTING_CAUSE";
  if (score >= 20) return "POSSIBLE_CAUSE";
  return "WEAKNESS_ONLY";
}

function strongerClass(a: { score: number; basis: "CATEGORY" | "CELL" }, b: { score: number; basis: "CATEGORY" | "CELL" }): { score: number; basis: "CATEGORY" | "CELL" } {
  return a.score >= b.score ? a : b;
}

function roleFor(classification: RootClassification, incoming: number, outgoing: number): FindingRole {
  if (classification === "EVIDENCE_GAP") return "EVIDENCE_GAP";
  if (classification === "LIKELY_SYMPTOM") return "SYMPTOM";
  if (classification === "ISOLATED_WEAKNESS") return "ISOLATED";
  if (incoming >= 0.35 && outgoing >= 35) return "INTERMEDIATE";
  return "ROOT";
}

export function analyzeRootCauses(methodology: MethodologyDefinition, snapshot: RuntimeSnapshot): RootCauseResult {
  const contract = methodology.contracts.rootCause;
  if (!contract) throw new Error("Missing root-cause contract in methodology definition");
  const rc = contract.rootCause;
  const weaknessThreshold = Number(rc.weaknessThreshold ?? 60);
  const statusFactors: Record<string, number | null> = contract.statusFactors ?? {};

  const categoryMetrics = new Map<string, NodeMetric>();
  for (const c of methodology.categories) categoryMetrics.set(c.id, categoryMetric(snapshot.categories.get(c.id), weaknessThreshold));

  const categoryOutgoing = new Map<string, any[]>();
  const categoryIncoming = new Map<string, any[]>();
  for (const edge of contract.categoryGraph.edges ?? []) {
    (categoryOutgoing.get(edge.prerequisite) ?? categoryOutgoing.set(edge.prerequisite, []).get(edge.prerequisite)!).push(edge);
    (categoryIncoming.get(edge.dependent) ?? categoryIncoming.set(edge.dependent, []).get(edge.dependent)!).push(edge);
  }

  const categoryRoot = new Map<string, number>();
  const categoryIncomingSupport = new Map<string, number>();
  const weakDownstreamCategories = new Map<string, string[]>();
  for (const category of methodology.categories) {
    const u = categoryMetrics.get(category.id)!;
    const supports: number[] = [];
    const deps: string[] = [];
    for (const edge of categoryOutgoing.get(category.id) ?? []) {
      const d = categoryMetrics.get(edge.dependent);
      if (!d || u.value === null || d.value === null || u.severity <= 0 || d.severity <= 0) continue;
      supports.push(u.severity * d.severity * Number(edge.strength) * Math.min(u.evidence, d.evidence));
      deps.push(edge.dependent);
    }
    const agg = aggregate(supports);
    const score = 100 * agg * (0.80 + 0.20 * Math.min(1, deps.length / 3));
    categoryRoot.set(category.id, clamp(score, 0, 100));
    weakDownstreamCategories.set(category.id, [...new Set(deps)]);

    const incomingSupports: number[] = [];
    for (const edge of categoryIncoming.get(category.id) ?? []) {
      const p = categoryMetrics.get(edge.prerequisite);
      if (!p || p.value === null || u.value === null || p.severity <= 0 || u.severity <= 0) continue;
      incomingSupports.push(p.severity * u.severity * Number(edge.strength) * Math.min(p.evidence, u.evidence));
    }
    categoryIncomingSupport.set(category.id, aggregate(incomingSupports));
  }

  const cellOutgoing = new Map<string, any[]>();
  const cellIncoming = new Map<string, any[]>();
  for (const edge of contract.cellGraph.edges ?? []) {
    (cellOutgoing.get(edge.prerequisite) ?? cellOutgoing.set(edge.prerequisite, []).get(edge.prerequisite)!).push(edge);
    (cellIncoming.get(edge.dependent) ?? cellIncoming.set(edge.dependent, []).get(edge.dependent)!).push(edge);
  }

  const findings: RootFinding[] = [];
  for (const category of methodology.categories) {
    const catMetric = categoryMetrics.get(category.id)!;
    const catRoot = categoryRoot.get(category.id) ?? 0;
    const catIncoming = categoryIncomingSupport.get(category.id) ?? 0;

    const localMetrics = new Map<string, NodeMetric>();
    for (const cellDef of methodology.cells) {
      localMetrics.set(cellDef.id, cellMetric(snapshot.cells.get(`${category.id}:${cellDef.id}`), weaknessThreshold, statusFactors));
    }

    const localRoot = new Map<string, number>();
    const localIncoming = new Map<string, number>();
    const localDownstream = new Map<string, string[]>();
    for (const cellDef of methodology.cells) {
      const u = localMetrics.get(cellDef.id)!;
      const supports: number[] = [];
      const deps: string[] = [];
      for (const edge of cellOutgoing.get(cellDef.id) ?? []) {
        const d = localMetrics.get(edge.dependent);
        if (!d || u.value === null || d.value === null || u.severity <= 0 || d.severity <= 0) continue;
        supports.push(u.severity * d.severity * Number(edge.strength) * Math.min(u.evidence, d.evidence));
        deps.push(edge.dependent);
      }
      const agg = aggregate(supports);
      const score = 100 * agg * (0.80 + 0.20 * Math.min(1, deps.length / 4));
      localRoot.set(cellDef.id, clamp(score, 0, 100));
      localDownstream.set(cellDef.id, [...new Set(deps)]);

      const incomingSupports: number[] = [];
      for (const edge of cellIncoming.get(cellDef.id) ?? []) {
        const p = localMetrics.get(edge.prerequisite);
        if (!p || p.value === null || u.value === null || p.severity <= 0 || u.severity <= 0) continue;
        incomingSupports.push(p.severity * u.severity * Number(edge.strength) * Math.min(p.evidence, u.evidence));
      }
      localIncoming.set(cellDef.id, aggregate(incomingSupports));
    }

    for (const cellDef of methodology.cells) {
      if (cellDef.id === "C01") continue;
      const cell = snapshot.cells.get(`${category.id}:${cellDef.id}`);
      const cm = localMetrics.get(cellDef.id)!;
      if (!cell || cell.status === "NOT_APPLICABLE") continue;
      const evidenceGap = cm.value === null || cm.evidence < 0.35;
      if (!evidenceGap && cm.severity <= 0) continue;

      const cellRootScore = localRoot.get(cellDef.id) ?? 0;
      const incoming = Math.max(catIncoming, localIncoming.get(cellDef.id) ?? 0);
      const strongest = strongerClass({ score: catRoot, basis: "CATEGORY" }, { score: cellRootScore, basis: "CELL" });
      let classification: RootClassification;
      let basis: RootFinding["classificationBasis"];

      if (evidenceGap) {
        classification = "EVIDENCE_GAP";
        basis = "EVIDENCE";
      } else if (incoming >= 0.35 && strongest.score < 20) {
        classification = "LIKELY_SYMPTOM";
        basis = "POSITION";
      } else if (incoming < 0.20 && strongest.score < 20) {
        classification = "ISOLATED_WEAKNESS";
        basis = "POSITION";
      } else {
        classification = rootBand(strongest.score);
        basis = strongest.basis;
      }

      const rootStrength = 0.60 * (catRoot / 100) + 0.40 * (cellRootScore / 100);
      const findingId = `RF-${category.id}-${cellDef.id}`;
      const sourceTraceIds = [
        `category:${category.id}`,
        `cell:${category.id}:${cellDef.id}`,
        `root:${findingId}`
      ];
      if (cell.hasHardContradiction) sourceTraceIds.push(`contradiction:${category.id}:${cellDef.id}`);

      findings.push({
        id: findingId,
        categoryId: category.id,
        cellId: cellDef.id,
        categoryValue: catMetric.value,
        cellValue: cm.value,
        categorySeverity: catMetric.severity,
        cellSeverity: cm.severity,
        categoryEvidenceFactor: catMetric.evidence,
        cellEvidenceFactor: cm.evidence,
        categoryRootScore: catRoot,
        cellRootScore,
        rootStrength,
        incomingCauseSupport: incoming,
        classification,
        role: roleFor(classification, incoming, strongest.score),
        classificationBasis: basis,
        downstreamCategoryIds: weakDownstreamCategories.get(category.id) ?? [],
        downstreamCellIds: localDownstream.get(cellDef.id) ?? [],
        sourceTraceIds
      });
    }
  }

  const rank = (f: RootFinding): number => {
    const classWeight: Record<RootClassification, number> = {
      PRIMARY_ROOT_CAUSE: 6,
      CONTRIBUTING_CAUSE: 5,
      POSSIBLE_CAUSE: 4,
      EVIDENCE_GAP: 3,
      ISOLATED_WEAKNESS: 2,
      WEAKNESS_ONLY: 1,
      LIKELY_SYMPTOM: 0
    };
    return classWeight[f.classification] * 1000 + f.rootStrength * 100 + f.cellSeverity * 10 + f.categorySeverity;
  };
  findings.sort((a, b) => rank(b) - rank(a) || a.categoryId.localeCompare(b.categoryId) || a.cellId.localeCompare(b.cellId));

  const displayLimit = Number(rc.maxDisplayedRootFindings ?? 5);
  const selectedFindings = findings
    .filter(f => f.classification !== "LIKELY_SYMPTOM" && f.classification !== "WEAKNESS_ONLY")
    .slice(0, displayLimit);

  return { version: contract.version, weaknessThreshold, findings, selectedFindings };
}
