import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { buildDefinition, calculateRuntimeSnapshot, evidenceFromAnswer } from "../src/engine/index.js";
import {
  evaluateProposedCell, buildApplicabilityDisclosure, decideExclusion, weightedScore, assessEvidence,
  FROZEN_CONTRADICTION_POLICY, type ScoredAnswer
} from "../src/engine/proposed/phase025-policy.js";

const dir = path.resolve(__dirname, "../methodology/businessmri-v2.6-runtime-bundles");
const FILES: Record<string, string> = {
  finance: "MMRI_FINMRI_Methodology_4.2.7_BUSINESSMRI_V2.json",
  people: "MMRI_HRMRI_Methodology_4.1.7_BUSINESSMRI_V2.json",
  it: "MMRI_ISMRI_Methodology_4.3.7_BUSINESSMRI_V2.json",
  operations: "MMRI_OPMRI_Methodology_4.4.7_BUSINESSMRI_V2.json"
};
const defs = Object.fromEntries(Object.entries(FILES).map(([k, f]) => [k, buildDefinition(JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")))]));
const ans = (path: number, score: number): ScoredAnswer => ({ questionId: `q${path}`, path, score, reliability: 0.44 });

describe.each(Object.keys(FILES))("Phase 2.5 proposed policy — %s contracts", domain => {
  const contracts = defs[domain].contracts;

  it("B1: 100 vs 0 is a hard contradiction, capped at 0.65, review-required, never locked", () => {
    const c = evaluateProposedCell([ans(1, 100), ans(2, 0)], contracts);
    expect(c.hardContradiction).toBe(true);
    expect(c.status).toBe("REVIEW_REQUIRED");
    expect(c.confidence).toBeLessThanOrEqual(0.65);
    expect(c.locked).toBe(false);
    expect(c.score).toBe(50);              // contract: autoChangeScore=false
    expect(c.evidenceTrace).toHaveLength(2); // contract: autoDeleteEvidence=false
  });

  it("B1: 100 vs 75 is NOT a hard contradiction (spread 25) but is soft variance at the 25-point line", () => {
    const c = evaluateProposedCell([ans(1, 100), ans(2, 75)], contracts);
    expect(c.hardContradiction).toBe(false);
    expect(c.softVariance).toBe(true);
    expect(c.status).toBe("DIRECT_PROVISIONAL");
  });

  it("B1: boundary is inclusive and deterministic (spread 50 hard, 49.99 not)", () => {
    expect(evaluateProposedCell([ans(1, 75), ans(2, 25)], contracts).hardContradiction).toBe(true);
    expect(evaluateProposedCell([ans(1, 74.99), ans(2, 25)], contracts).hardContradiction).toBe(false);
  });

  it("B1: equal scores and a single answer are never contradictory", () => {
    expect(evaluateProposedCell([ans(1, 0), ans(2, 0)], contracts).hardContradiction).toBe(false);
    expect(evaluateProposedCell([ans(1, 100)], contracts).hardContradiction).toBe(false);
    expect(evaluateProposedCell([], contracts).status).toBe("UNASSESSED");
  });

  it("B1/B3: answer order does not change the result", () => {
    const a = evaluateProposedCell([ans(1, 100), ans(2, 0)], contracts);
    const b = evaluateProposedCell([ans(2, 0), ans(1, 100)], contracts);
    expect(b).toEqual(a);
  });

  it("B3: confidence follows the frozen caps and is not 1.0 for one or two answers", () => {
    const one = evaluateProposedCell([ans(1, 100)], contracts).confidence;
    const two = evaluateProposedCell([ans(1, 100), ans(2, 100)], contracts).confidence;
    expect(one).toBeLessThan(1);
    expect(two).toBeGreaterThan(one);
    expect(two).toBeLessThanOrEqual(0.79 + 1e-9);
  });

  it("B3: an unresolved contradiction can never receive maximum confidence even with strong reliabilities", () => {
    const c = evaluateProposedCell([{ ...ans(1, 100), reliability: 0.99 }, { ...ans(2, 0), reliability: 0.99 }], contracts);
    expect(c.confidence).toBeLessThanOrEqual(0.65);
  });

  it("CURRENT production behaviour is unchanged: V2 runtime still averages 100 vs 0 as DIRECT_FINAL / confidence 1 (policy not wired)", () => {
    const def = defs[domain];
    const cat = def.categories[0].id;
    const cell = def.cells.find(c => c.id !== "C01" && c.weightPct > 0)!.id;
    const pick = (p: number, best: boolean) => {
      const q = def.questionByCategoryCellPath.get(`${cat}:${cell}:${p}`)!;
      const scored = q.options.filter(o => typeof o.score === "number").sort((a, b) => (a.score as number) - (b.score as number));
      return scored[best ? scored.length - 1 : 0].optionIndex;
    };
    const evidence = [
      evidenceFromAnswer({ definition: def, question: def.questionByCategoryCellPath.get(`${cat}:${cell}:1`)!, optionIndex: pick(1, true), explicitAuthority: 0.9 }),
      evidenceFromAnswer({ definition: def, question: def.questionByCategoryCellPath.get(`${cat}:${cell}:2`)!, optionIndex: pick(2, false), explicitAuthority: 0.9 })
    ];
    const snap = calculateRuntimeSnapshot(def, evidence);
    const c = snap.cells.get(`${cat}:${cell}`)!;
    expect(c.status).toBe("DIRECT_FINAL");
    expect(c.effectiveConfidence).toBe(1);
    expect(c.hasHardContradiction).toBe(false);
    // ...and the same two answers through the proposal:
    const proposed = evaluateProposedCell(evidence.map((e, i) => ({ questionId: e.questionId, path: e.path, score: e.score as number, reliability: e.reliability })), def.contracts);
    expect(proposed.hardContradiction).toBe(true);
    expect(proposed.confidence).toBeLessThanOrEqual(0.65);
  });
});

describe("B2 proposed applicability scored-conflict protection", () => {
  const cap = (id: string, w: number, claims: boolean, scored: number, mean: number | null = null) =>
    ({ capabilityId: id, weightPct: w, gateExclusionConfirmedByClaims: claims, scoredAnswerCount: scored, scoredMean: mean });

  it("excludes a capability with N/A claims and no scored evidence", () => {
    expect(decideExclusion(cap("a", 1.5, true, 0))).toBe("EXCLUDED");
  });
  it("does not exclude when scored evidence conflicts; flags it for review", () => {
    expect(decideExclusion(cap("a", 1.5, true, 3, 0))).toBe("EXCLUSION_CONFLICT_REVIEW");
  });
  it("missing / partial / no N/A claims stay applicable", () => {
    expect(decideExclusion(cap("a", 1.5, false, 0))).toBe("APPLICABLE");
    expect(decideExclusion(cap("a", 1.5, false, 5))).toBe("APPLICABLE");
  });
  it("decision is idempotent over repeated identical evidence", () => {
    const x = cap("a", 1.5, true, 0);
    expect(decideExclusion(x)).toBe(decideExclusion({ ...x }));
  });
  it("disclosure reports counts, excluded weight and conflicts", () => {
    const caps = Array.from({ length: 64 }, (_, i) => cap(`C${i}`, 100 / 64, i < 14, i < 14 && i % 2 === 0 ? 2 : 0, 0));
    const d = buildApplicabilityDisclosure(caps);
    expect(d.excludedCount + d.conflictCount).toBe(14);
    expect(d.conflictCount).toBe(7);
    expect(d.excludedCount).toBe(7);
    expect(d.totalWeightPct).toBeCloseTo(100, 6);
    expect(d.excludedWeightPct).toBeCloseTo(7 * 100 / 64, 6);
    expect(d.excludedShareOfWeight).toBeCloseTo(7 / 64, 6);
  });
  it("exclusion-vs-manipulation: the na_gaming pattern scores 100 today; with scored evidence honoured it does not", () => {
    // 14 weak (score 0) capabilities declared N/A *and* answered; 50 best.
    const mk = (honour: boolean) => weightedScore(Array.from({ length: 64 }, (_, i) => {
      const weak = i < 14;
      const decision = weak ? (honour ? decideExclusion(cap(`c${i}`, 1, true, 3, 0)) : "EXCLUDED" as const) : "APPLICABLE" as const;
      return { weightPct: 1, score: weak ? 0 : 100, decision };
    }));
    expect(mk(false)).toBe(100);               // current behaviour
    expect(mk(true)).toBeCloseTo((50 / 64) * 100, 6); // 78.1 — matches the Phase 2 honest_weak 77-80 range
  });
});

describe("B3 proposed evidence & headline model", () => {
  const T = { minCapabilityCoverage: 0.5, withholdBelowCapabilityCoverage: 0.15 };
  const base = { totalCapabilities: 64, capabilitiesWithScoredEvidence: 64, excludedCapabilities: 0, totalCells: 3072, scoredCells: 150, answered: 280, dnkAnswers: 0, hardContradictionCells: 0, officialScoreAvailable: false, meanScoredCellConfidence: 0.6 };

  it("never returns confidence 1.0 merely because a score exists", () => {
    const a = assessEvidence(base, T);
    expect(a.confidence).toBeLessThan(1);
    expect(a.headline).toBe("PRELIMINARY");
  });
  it("withholds the headline when almost no capability has evidence", () => {
    expect(assessEvidence({ ...base, capabilitiesWithScoredEvidence: 5, scoredCells: 6 }, T).headline).toBe("WITHHELD");
  });
  it("flags majority-unknown assessments", () => {
    expect(assessEvidence({ ...base, dnkAnswers: 200 }, T).reasons).toContain("MAJORITY_UNKNOWN_ANSWERS");
  });
  it("contradiction caps confidence at 0.65 and forbids OFFICIAL", () => {
    const a = assessEvidence({ ...base, officialScoreAvailable: true, hardContradictionCells: 2, meanScoredCellConfidence: 0.95 }, T);
    expect(a.confidence).toBeLessThanOrEqual(0.65);
    expect(a.headline).not.toBe("OFFICIAL");
  });
  it("N/A-heavy assessment: coverage is measured over applicable capabilities only", () => {
    const a = assessEvidence({ ...base, excludedCapabilities: 32, capabilitiesWithScoredEvidence: 32 }, T);
    expect(a.capabilityCoverage).toBe(1);
    expect(a.reasons).toContain("CAPABILITIES_EXCLUDED_AS_NOT_APPLICABLE");
  });
  it("official + uncontested + full coverage is the only HIGH-confidence path", () => {
    const a = assessEvidence({ ...base, officialScoreAvailable: true, meanScoredCellConfidence: 0.95, scoredCells: 3072 }, T);
    expect(a.headline).toBe("OFFICIAL");
    expect(a.confidenceBand).toBe("HIGH");
  });
  it("frozen policy constants match the contract text", () => {
    expect(FROZEN_CONTRADICTION_POLICY).toEqual({ hardRangePoints: 50, hardConfidenceCap: 0.65, varianceRangePoints: 25 });
  });
});
