import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { buildDefinition, evidenceFromAnswer } from "../src/engine/index.js";
import { calculateBusinessMriRuntimeSnapshot } from "../src/engine/businessmri-runtime.js";
import { runStrategyPipeline } from "../src/strategy/index.js";
import { buildDiagnosisResultV13 } from "../src/diagnosis/result.js";
import { buildFrozenReportPayload } from "../src/report/payload.js";
import { POLICY_FLAGS_OFF, readPolicyFlags } from "../src/engine/policy-flags.js";
import { sha256Json } from "../src/lib/hash.js";

const dir = path.resolve(__dirname, "../methodology/businessmri-v2.6-runtime-bundles");
const def = buildDefinition(JSON.parse(fs.readFileSync(path.join(dir, "MMRI_FINMRI_Methodology_4.2.7_BUSINESSMRI_V2.json"), "utf8")));
const cats = def.categories.map(c => c.id), cells = def.cells.filter(c => c.id !== "C01" && c.weightPct > 0).map(c => c.id);
const q = (c: string, cell: string, p: number) => def.questionByCategoryCellPath.get(`${c}:${cell}:${p}`)!;
const pickBy = (qq: any, best: boolean) => { const s = qq.options.filter((o: any) => typeof o.score === "number").sort((a: any, b: any) => a.score - b.score); return s.length ? s[best ? s.length - 1 : 0].optionIndex : null; };
const ev = (qq: any, i: number) => evidenceFromAnswer({ definition: def, question: qq, optionIndex: i, explicitAuthority: 0.9 });
// every capability: gate applies, one cell answered best on path 1 and worst on path 2 (a contradiction), more cells best on path 1
const evidence: any[] = [];
for (const c of cats) { evidence.push(ev(q(c, "C01", 1), 1)); let done = false; for (const cell of cells) { const a = q(c, cell, 1), b = q(c, cell, 2); if (a && pickBy(a, true) !== null) { evidence.push(ev(a, pickBy(a, true))); if (!done && b && pickBy(b, false) !== null) { evidence.push(ev(b, pickBy(b, false))); done = true; } } } }

const labels = Object.fromEntries(["P1", "P2", "P3", "P4", "P5"].map(p => [p, p]));
function run(flags: ReturnType<typeof readPolicyFlags>) {
  const snapshot = calculateBusinessMriRuntimeSnapshot(def, evidence, flags);
  const strategy = runStrategyPipeline({ methodology: def, snapshot });
  const base = { assessmentId: "A-TEST", companyId: "C-TEST", companyName: "Synthetic", methodologyBundleSha256: "0".repeat(64), runtimeSnapshotHash: "1".repeat(64), generatedAt: "2026-01-01T00:00:00.000Z", assessmentMode: "QUICK" as const, assessmentStatus: "COMPLETED", routingState: "QUICK_LIMIT_REACHED", methodology: def, snapshot, strategy, purposeLabels: labels };
  const result = buildDiagnosisResultV13({ ...base, policyFlags: flags });
  const payload = buildFrozenReportPayload({ reportId: "R", payloadHash: "", traceVersion: "T", diagnosisResultHash: sha256Json(result), strategyHash: "2".repeat(64), planHash: "3".repeat(64), bindingHash: "4".repeat(64), generatedAt: base.generatedAt, assessmentId: "A-TEST", assessmentMode: "QUICK", assessmentStatus: "COMPLETED", routingState: "QUICK_LIMIT_REACHED", companyName: "Synthetic", methodology: def, snapshot, strategy, purposeLabels: labels, policyFlags: flags } as any);
  return { snapshot, result, payload };
}

describe("result serialization and report payload carry the policy outcomes (real builders)", () => {
  it("flags OFF: no policy keys anywhere; contradiction invisible exactly as today", () => {
    const { result, payload } = run(POLICY_FLAGS_OFF);
    expect(result).not.toHaveProperty("evidenceDisclosure");
    expect(payload).not.toHaveProperty("evidenceDisclosure");
    expect(result.quality.hardContradictions).toBe(0);
    expect(result.evidence.contradictionCells).toBe(0);
  });
  it("B1 (numeric) ON: quality.hardContradictions / contradictionCells / reviewRequiredCells are populated; warnings mention them; score unchanged", () => {
    const off = run(POLICY_FLAGS_OFF), on = run({ ...POLICY_FLAGS_OFF, b1: "NUMERIC_50" });
    expect(on.result.quality.hardContradictions).toBeGreaterThan(30);
    expect(on.result.evidence.contradictionCells).toBe(on.result.quality.hardContradictions);
    expect(on.result.evidence.reviewRequiredCells).toBeGreaterThan(0);
    expect(on.result.quality.warnings.some((w: string) => /зөрчил/.test(w))).toBe(true);
    expect(on.result.overall.score).toBe(off.result.overall.score);
    expect(on.result.overall.confidence!).toBeLessThan(off.result.overall.confidence!);
  });
  it("B3 ON: disclosure present in result AND report payload, flagged unapproved and uncalibrated; resultHash covers it; OFF result hash is unaffected by the existence of the feature", () => {
    const flags = { ...POLICY_FLAGS_OFF, b1: "NUMERIC_50" as const, b3: true };
    const on = run(flags), off = run(POLICY_FLAGS_OFF);
    for (const d of [on.result.evidenceDisclosure!, (on.payload as any).evidenceDisclosure]) {
      expect(d.approved).toBe(false); expect(d.confidence.isProbability).toBe(false); expect(d.resultStatus.value).toBe("REVIEW_REQUIRED"); expect(d.contested.cellCount).toBeGreaterThan(30);
    }
    expect(sha256Json(on.result)).not.toBe(sha256Json(off.result));
    expect(Object.keys(off.result).includes("evidenceDisclosure")).toBe(false);
  });
});
