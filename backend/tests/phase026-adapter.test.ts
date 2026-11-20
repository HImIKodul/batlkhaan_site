import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { buildDefinition, evidenceFromAnswer, calculateRuntimeSnapshot } from "../src/engine/index.js";
import { runWithPolicies } from "../src/engine/proposed/phase026-adapter.js";

const dir = path.resolve(__dirname, "../methodology/businessmri-v2.6-runtime-bundles");
const FILES = { finance: "MMRI_FINMRI_Methodology_4.2.7_BUSINESSMRI_V2.json", people: "MMRI_HRMRI_Methodology_4.1.7_BUSINESSMRI_V2.json", it: "MMRI_ISMRI_Methodology_4.3.7_BUSINESSMRI_V2.json", operations: "MMRI_OPMRI_Methodology_4.4.7_BUSINESSMRI_V2.json" } as const;

describe.each(Object.entries(FILES))("Phase 2.6 test-only policy adapter — %s", (_dom, file) => {
  const def = buildDefinition(JSON.parse(fs.readFileSync(path.join(dir, file), "utf8")));
  const cat = def.categories[0].id;
  const cells = def.cells.filter(c => c.id !== "C01" && c.weightPct > 0).map(c => c.id);
  const q = (cell: string, p: number) => def.questionByCategoryCellPath.get(`${cat}:${cell}:${p}`)!;
  const opt = (qq: any, best: boolean) => { const s = qq.options.filter((o: any) => typeof o.score === "number").sort((a: any, b: any) => a.score - b.score); return s.length ? s[best ? s.length - 1 : 0].optionIndex : null; };
  const ev = (qq: any, i: number) => evidenceFromAnswer({ definition: def, question: qq, optionIndex: i, explicitAuthority: 0.9 });
  const gate = (kind: "NA" | "YES") => [1, 2, 3, 4].map(p => q("C01", p)).filter(Boolean).map((qq: any) => ev(qq, kind === "NA" ? qq.options.find((o: any) => o.state === "N_A_CLAIM").optionIndex : (qq.options.find((o: any) => o.optionIndex === 1).optionIndex))).slice(0, kind === "NA" ? 4 : 1);
  const scored = (cell: string, best: boolean) => { const qq = q(cell, 1); const i = qq && opt(qq, best); return i ? [ev(qq, i)] : []; };

  it("flags all off = byte-for-byte production snapshot values", () => {
    const e = [...gate("YES"), ...cells.flatMap(c => scored(c, true))];
    const a = runWithPolicies(def, e, {}).snapshot, b = calculateRuntimeSnapshot(def, e);
    expect(a.overall).toEqual(b.overall);
  });
  it("B2: N/A gate + scored evidence in the same capability keeps the capability applicable and flags it", () => {
    const e = [...gate("NA"), ...cells.flatMap(c => scored(c, false))];
    const cur = runWithPolicies(def, e, {}), pro = runWithPolicies(def, e, { b2ScoredConflict: true });
    expect(cur.excludedCategories).toContain(cat);
    expect(pro.excludedCategories).not.toContain(cat);
    expect(pro.exclusionConflictCategories).toEqual([cat]);
  });
  it("B2: N/A gate with no scored evidence is still excluded (legitimate exclusion)", () => {
    const pro = runWithPolicies(def, gate("NA"), { b2ScoredConflict: true });
    expect(pro.excludedCategories).toContain(cat);
    expect(pro.exclusionConflictCategories).toEqual([]);
  });
  it("B1: best vs worst on one cell is flagged, caps overall confidence below 1, keeps the mean score", () => {
    const c0 = cells.find(c => q(c, 1) && q(c, 2) && opt(q(c, 1), true) !== null && opt(q(c, 2), true) !== null)!;
    const e = [ev(q(c0, 1), opt(q(c0, 1), true)!), ev(q(c0, 2), opt(q(c0, 2), false)!)];
    const cur = runWithPolicies(def, e, {}), pro = runWithPolicies(def, e, { b1Contradiction: true, b3Confidence: true });
    expect(cur.hardContradictionCells).toHaveLength(0);
    expect(pro.hardContradictionCells).toEqual([`${cat}:${c0}`]);
    expect(pro.snapshot.cells.get(`${cat}:${c0}`)!.effectiveConfidence).toBeLessThanOrEqual(0.65);
    expect(pro.snapshot.cells.get(`${cat}:${c0}`)!.effectiveScore).toBe(cur.snapshot.cells.get(`${cat}:${c0}`)!.effectiveScore);
  });
});

describe("Phase 2.6 static guards", () => {
  const src = (p: string) => fs.readFileSync(path.resolve(__dirname, "..", p), "utf8");
  it("importer records failures outside the rolled-back transaction, bounded, never masking the original error", () => {
    const s = src("src/import-methodology.ts");
    expect(s).toMatch(/recordImportFailure/);
    expect(s).toMatch(/Promise\.race\(\[/);
    expect(s.indexOf("recordImportFailure({")).toBeGreaterThan(s.indexOf("} catch (error) {"));
    expect(s).toMatch(/throw error;/);
    expect(fs.readFileSync(path.resolve(__dirname, "../src/lib/import-failure-log.ts"), "utf8")).toMatch(/rolledBack: true/);
  });
  it("adapter and proposals are not imported by any runtime file", () => {
    for (const f of ["src/engine/businessmri-runtime.ts", "src/engine/calculation.ts", "src/engine/scoring.ts", "src/services/prisma-assessment-engine.ts", "src/report/payload.ts", "src/strategy/recommendations.ts", "src/services/report-pdf-artifact-service.ts"]) expect(src(f), f).not.toMatch(/from\s+["'][^"']*(phase02[567]|\/proposed\/)/);
  });
});
