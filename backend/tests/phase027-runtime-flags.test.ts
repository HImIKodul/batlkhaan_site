import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { buildDefinition, evidenceFromAnswer } from "../src/engine/index.js";
import { calculateBusinessMriRuntimeSnapshot } from "../src/engine/businessmri-runtime.js";
import { calculateBusinessMriRuntimeSnapshot as baseline } from "./baseline/businessmri-runtime.baseline-phase026.js";
import { POLICY_FLAGS_OFF, readPolicyFlags, type PolicyFlags } from "../src/engine/policy-flags.js";
import { judgeContradiction } from "../src/engine/v2-policy.js";

const dir = path.resolve(__dirname, "../methodology/businessmri-v2.6-runtime-bundles");
const FILES = { finance: "MMRI_FINMRI_Methodology_4.2.7_BUSINESSMRI_V2.json", people: "MMRI_HRMRI_Methodology_4.1.7_BUSINESSMRI_V2.json", it: "MMRI_ISMRI_Methodology_4.3.7_BUSINESSMRI_V2.json", operations: "MMRI_OPMRI_Methodology_4.4.7_BUSINESSMRI_V2.json" } as const;
const ON = (b1: PolicyFlags["b1"], b2 = false): PolicyFlags => ({ ...POLICY_FLAGS_OFF, b1, b2 });
const ser = (s: any) => JSON.stringify({ cells: [...s.cells.entries()], categories: [...s.categories.entries()], modules: [...s.modules.entries()], overall: s.overall, purposes: [...s.purposes.entries()], contradictions: s.contradictions });

describe("flags", () => {
  it("absence of configuration = OFF; a single variable cannot enable; production never enables; unknown values are OFF", () => {
    expect(readPolicyFlags({})).toEqual(POLICY_FLAGS_OFF);
    expect(readPolicyFlags({ MMRI_POLICY_B1_CONTRADICTION: "NUMERIC_50" })).toEqual(POLICY_FLAGS_OFF);
    expect(readPolicyFlags({ MMRI_POLICY_FLAGS_ALLOWED: "ISOLATED_QA", MMRI_POLICY_B1_CONTRADICTION: "numeric_50", MMRI_POLICY_B2_SCORED_CONFLICT: "true" })).toEqual(POLICY_FLAGS_OFF);
    expect(readPolicyFlags({ MMRI_POLICY_FLAGS_ALLOWED: "ISOLATED_QA", MMRI_POLICY_B2_SCORED_CONFLICT: "ON", MMRI_ENVIRONMENT: "production" })).toEqual(POLICY_FLAGS_OFF);
    expect(readPolicyFlags({ MMRI_POLICY_FLAGS_ALLOWED: "ISOLATED_QA", MMRI_POLICY_B2_SCORED_CONFLICT: "ON", NODE_ENV: "production" })).toEqual(POLICY_FLAGS_OFF);
    expect(readPolicyFlags({ MMRI_POLICY_FLAGS_ALLOWED: "ISOLATED_QA", MMRI_POLICY_B1_CONTRADICTION: "ORDINAL_2_LEVELS", MMRI_POLICY_B2_SCORED_CONFLICT: "ON" })).toMatchObject({ b1: "ORDINAL_2_LEVELS", b2: true, b3: false, b4: false, b7: false });
  });
});

describe.each(Object.entries(FILES))("actual V2 runtime — %s", (_d, file) => {
  const def = buildDefinition(JSON.parse(fs.readFileSync(path.join(dir, file), "utf8")));
  const cats = def.categories.map(c => c.id);
  const cells = def.cells.filter(c => c.id !== "C01" && c.weightPct > 0).map(c => c.id);
  const q = (c: string, cell: string, p: number) => def.questionByCategoryCellPath.get(`${c}:${cell}:${p}`)!;
  const scoredOpts = (qq: any) => qq.options.filter((o: any) => typeof o.score === "number").sort((a: any, b: any) => a.score - b.score);
  const pick = (qq: any, target: number) => scoredOpts(qq).reduce((b: any, o: any) => (b === null || Math.abs(o.score - target) < Math.abs(b.score - target) ? o : b), null);
  const ev = (qq: any, i: number) => evidenceFromAnswer({ definition: def, question: qq, optionIndex: i, explicitAuthority: 0.9 });
  const build = (o: { gate?: (c: string) => "YES" | "NA" | "DNK"; cell?: (c: string, cell: string, p: number) => number | null }) => {
    const e: any[] = [];
    for (const c of cats) {
      const g = o.gate?.(c) ?? "YES";
      for (let p = 1; p <= 4; p++) {
        const qq = q(c, "C01", p); if (!qq) continue;
        const o1 = g === "NA" ? qq.options.find((x: any) => x.state === "N_A_CLAIM") : g === "DNK" ? qq.options.find((x: any) => x.state === "DNK") : (p === 1 ? qq.options.find((x: any) => x.optionIndex === 1) : null);
        if (o1) e.push(ev(qq, o1.optionIndex));
      }
      for (const cell of cells) for (const p of [1, 2]) {
        const t = o.cell ? o.cell(c, cell, p) : (p === 1 ? 100 : null); const qq = q(c, cell, p);
        if (t === null || !qq) continue; const x = pick(qq, t); if (x) e.push(ev(qq, x.optionIndex));
      }
    }
    return e;
  };
  const W = new Set(cats.slice(0, 14));
  const fixtures: Record<string, any[]> = {
    allBest: build({}), allWorst: build({ cell: (c, cell, p) => (p === 1 ? 0 : null) }),
    mixed: build({ cell: (c, cell, p) => (p === 1 ? (cats.indexOf(c) % 2 ? 100 : 25) : null) }),
    contradictory100v0: build({ cell: (c, cell, p) => (p === 1 ? 100 : 0) }),
    adjacent3level: build({ cell: (c, cell, p) => (p === 1 ? 100 : 50) }),
    partial: build({ cell: (c, cell, p) => (p === 1 && cats.indexOf(c) < 10 ? 100 : null), gate: c => (cats.indexOf(c) < 10 ? "YES" : "DNK") }),
    naNoEvidence: build({ gate: c => (W.has(c) ? "NA" : "YES"), cell: (c, cell, p) => (W.has(c) ? null : p === 1 ? 100 : null) }),
    naWeakEvidence: build({ gate: c => (W.has(c) ? "NA" : "YES"), cell: (c, cell, p) => (W.has(c) ? (p === 1 ? 0 : null) : p === 1 ? 100 : null) }),
    dnkGate: build({ gate: c => (W.has(c) ? "DNK" : "YES") })
  };

  it("flags OFF (explicit and by absent configuration) == frozen Phase 2.6 runtime, for every fixture", () => {
    for (const [name, e] of Object.entries(fixtures)) {
      const base = ser(baseline(def, e));
      expect(ser(calculateBusinessMriRuntimeSnapshot(def, e, POLICY_FLAGS_OFF)), name).toBe(base);
      expect(ser(calculateBusinessMriRuntimeSnapshot(def, e)), name + " (env default)").toBe(base);
      expect(ser(calculateBusinessMriRuntimeSnapshot(def, [...e].reverse(), POLICY_FLAGS_OFF)), name + " reversed").toBe(base);
    }
  });
  it("B1 NUMERIC_50 flags 100-vs-0 cells in the ACTUAL runtime; exposes REVIEW_REQUIRED + HARD findings; keeps mean; caps confidence", () => {
    const e = fixtures.contradictory100v0, off = calculateBusinessMriRuntimeSnapshot(def, e, POLICY_FLAGS_OFF), on = calculateBusinessMriRuntimeSnapshot(def, e, ON("NUMERIC_50"));
    expect(off.contradictions).toHaveLength(0);
    expect(on.contradictions.length).toBeGreaterThan(1000);
    expect(on.contradictions.every(c => c.type === "HARD" && c.ruleId === "H01")).toBe(true);
    const flagged = [...on.cells.values()].filter(c => c.hasHardContradiction);
    expect(flagged.length).toBe(on.contradictions.length);
    for (const c of flagged.slice(0, 50)) { expect(c.status).toBe("REVIEW_REQUIRED"); expect(c.locked).toBe(false); expect(c.effectiveConfidence).toBeLessThanOrEqual(0.65); expect(c.effectiveScore).toBe(off.cells.get(`${c.categoryId}:${c.cellId}`)!.effectiveScore); }
    expect(on.overall.partialScore).toBeCloseTo(off.overall.partialScore!, 9);
    expect(on.overall.confidence!).toBeLessThan(off.overall.confidence!);
    expect([...on.categories.values()].some(c => c.reviewRequiredCellCount > 0)).toBe(true);
  });
  it("B1 variants differ exactly on adjacent 3-level cells: NUMERIC_50 flags 100-vs-50, ORDINAL_2_LEVELS does not (5-level 100-vs-50 is 2 levels => both flag)", () => {
    const e = fixtures.adjacent3level;
    const n = calculateBusinessMriRuntimeSnapshot(def, e, ON("NUMERIC_50")), o = calculateBusinessMriRuntimeSnapshot(def, e, ON("ORDINAL_2_LEVELS"));
    const nf = [...n.cells.values()].filter(c => c.hasHardContradiction), of = [...o.cells.values()].filter(c => c.hasHardContradiction);
    expect(of.length).toBeLessThan(nf.length);
    const oSet = new Set(of.map(c => `${c.categoryId}:${c.cellId}`));
    for (const c of nf) {
      const qs = c.directEvidence.filter(x => x.state === "SCORED").map(x => (def.questionById.get(x.questionId)!.options.filter(y => typeof y.score === "number").length));
      const threeLevel = qs.some(k => k === 3);
      expect(oSet.has(`${c.categoryId}:${c.cellId}`)).toBe(!threeLevel); // 3-level adjacent pairs are not 2 levels apart; 5-level pairs 100/50 are
    }
    expect(of.length).toBeGreaterThan(0);
  });
  it("B1 is answer-order independent and equal scores / spread 25 never flag", () => {
    for (const mode of ["NUMERIC_50", "ORDINAL_2_LEVELS"] as const) {
      const e = fixtures.contradictory100v0;
      expect(ser(calculateBusinessMriRuntimeSnapshot(def, [...e].reverse(), ON(mode)))).toBe(ser(calculateBusinessMriRuntimeSnapshot(def, e, ON(mode))));
      expect(calculateBusinessMriRuntimeSnapshot(def, fixtures.allBest, ON(mode)).contradictions).toHaveLength(0);
    }
  });
  it("B2: N/A + scored evidence is not excluded and is flagged; N/A without scored evidence stays excluded; DNK never excludes; partial/mixed unaffected", () => {
    const f = ON("OFF", true);
    const off = calculateBusinessMriRuntimeSnapshot(def, fixtures.naWeakEvidence, POLICY_FLAGS_OFF), on = calculateBusinessMriRuntimeSnapshot(def, fixtures.naWeakEvidence, f);
    expect([...off.categories.values()].filter(c => c.confirmedNotApplicable)).toHaveLength(14);
    expect([...on.categories.values()].filter(c => c.confirmedNotApplicable)).toHaveLength(0);
    expect(on.contradictions.filter(c => c.ruleId === "H02")).toHaveLength(14);
    expect(on.overall.partialScore!).toBeLessThan(off.overall.partialScore! - 5);
    const clean = calculateBusinessMriRuntimeSnapshot(def, fixtures.naNoEvidence, f);
    expect([...clean.categories.values()].filter(c => c.confirmedNotApplicable)).toHaveLength(14);
    expect(clean.contradictions).toHaveLength(0);
    expect(ser(clean)).toBe(ser(calculateBusinessMriRuntimeSnapshot(def, fixtures.naNoEvidence, POLICY_FLAGS_OFF)));
    for (const k of ["allBest", "mixed", "partial", "dnkGate"]) expect(ser(calculateBusinessMriRuntimeSnapshot(def, fixtures[k], f)), k).toBe(ser(baseline(def, fixtures[k])));
    expect(ser(calculateBusinessMriRuntimeSnapshot(def, [...fixtures.naWeakEvidence].reverse(), f))).toBe(ser(on));
  });
});

describe("judgeContradiction unequal scales (rule is explicit and deterministic)", () => {
  const defs = buildDefinition(JSON.parse(fs.readFileSync(path.join(dir, FILES.finance), "utf8")));
  // find one 3-level and one 5-level scored question
  const qs = defs.questions.filter(x => x.path <= 2 && x.cellId !== "C01");
  const lv = (x: any) => new Set(x.options.map((o: any) => o.score).filter((s: any) => typeof s === "number")).size;
  const q3 = qs.find(x => lv(x) === 3)!, q5 = qs.find(x => lv(x) === 5)!;
  const mk = (qq: any, score: number) => ({ questionId: qq.id, score, state: "SCORED", path: qq.path } as any);
  it("3-level worst vs 5-level best = 2 levels on the coarser scale => hard; 3-level worst vs 5-level 75 => 1.5 => not hard", () => {
    expect(judgeContradiction(defs, [mk(q3, 0), mk(q5, 100)], "ORDINAL_2_LEVELS").hard).toBe(true);
    expect(judgeContradiction(defs, [mk(q3, 0), mk(q5, 75)], "ORDINAL_2_LEVELS").hard).toBe(false);
    expect(judgeContradiction(defs, [mk(q3, 0), mk(q5, 75)], "ORDINAL_2_LEVELS").levelGap).toBeCloseTo(1.5, 9);
    expect(judgeContradiction(defs, [mk(q5, 100), mk(q3, 0)], "ORDINAL_2_LEVELS")).toEqual(judgeContradiction(defs, [mk(q3, 0), mk(q5, 100)], "ORDINAL_2_LEVELS"));
  });
});
