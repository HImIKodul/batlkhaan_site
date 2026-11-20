import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { buildReportPdfSource, generatorVersionFor, MMRI_PDF_GENERATOR_VERSION, B4_PLACEHOLDER_TEXT, readB4Rule } from "../src/report/pdf-artifact.js";
import { POLICY_FLAGS_OFF, type PolicyFlags } from "../src/engine/policy-flags.js";
import { buildDefinition, evidenceFromAnswer } from "../src/engine/index.js";
import { calculateBusinessMriRuntimeSnapshot } from "../src/engine/businessmri-runtime.js";
import { buildEvidenceDisclosure } from "../src/diagnosis/evidence-disclosure.js";

const fx = (n: string) => JSON.parse(fs.readFileSync(path.resolve(__dirname, "fixtures/phase027", n + ".payload.json"), "utf8"));
const B4: PolicyFlags = { ...POLICY_FLAGS_OFF, b4: true, b7: true };

describe("B4 placeholders in the REAL PDF source builder (flag-gated)", () => {
  it("flags OFF: source equals the unflagged builder output, 5/5 findings as before, generator identity unchanged", () => {
    for (const n of ["finance_weak", "finance_strong", "finance_na_gaming", "people_uncertain"]) {
      const f = fx(n);
      const a = buildReportPdfSource(f.payload, f.narrative), b = buildReportPdfSource(f.payload, f.narrative, POLICY_FLAGS_OFF);
      expect(b).toEqual(a);
      expect(a.strengths.every((x: any) => !x.placeholder) && a.weaknesses.every((x: any) => !x.placeholder)).toBe(true);
    }
    expect(generatorVersionFor(POLICY_FLAGS_OFF)).toBe(MMRI_PDF_GENERATOR_VERSION);
  });
  it("B4 alone is refused: it requires B7 so an existing historical PDF cannot be overwritten", () => {
    const f = fx("finance_weak");
    expect(() => buildReportPdfSource(f.payload, f.narrative, { ...POLICY_FLAGS_OFF, b4: true })).toThrow(/require B7/);
  });
  it("B4 ON keeps exactly 5 + 5 positions; verified = existing contract eligibility only (never RELATIVE_RANK); placeholders carry no score and never invented text", () => {
    for (const n of ["finance_weak", "finance_strong", "finance_na_gaming", "people_uncertain"]) {
      const f = fx(n), s = buildReportPdfSource(f.payload, f.narrative, B4);
      expect(s.strengths).toHaveLength(5); expect(s.weaknesses).toHaveLength(5);
      for (const [list, text, src] of [[s.strengths, B4_PLACEHOLDER_TEXT.strength, f.payload.strengths], [s.weaknesses, B4_PLACEHOLDER_TEXT.weakness, f.payload.weaknesses]] as const) {
        const verified = list.filter((x: any) => !x.placeholder);
        const validatedInPayload = src.filter((x: any) => x.basis !== "RELATIVE_RANK").length;
        expect(verified.length).toBe(Math.min(5, validatedInPayload));
        expect(verified.every((x: any) => x.basis !== "RELATIVE_RANK" && typeof x.score === "number")).toBe(true);
        const ph = list.filter((x: any) => x.placeholder);
        expect(ph.every((x: any) => x.score === null && x.nameMn === text && x.narrativeMn === "")).toBe(true);
        expect(list.slice(0, verified.length).every((x: any) => !x.placeholder)).toBe(true); // verified first
      }
    }
  });
  it("a weak V2 quick estimate has 0 contract-verified findings => all ten positions are placeholders (the honest consequence of the existing eligibility contract)", () => {
    const f = fx("finance_weak"), s = buildReportPdfSource(f.payload, f.narrative, B4);
    expect(f.payload.strengths.filter((x: any) => x.basis !== "RELATIVE_RANK")).toHaveLength(0);
    expect(s.strengths.every((x: any) => x.placeholder)).toBe(true);
    expect(s.weaknesses.every((x: any) => x.placeholder)).toBe(true);
  });
  it("B4 generator identity differs from the approved generator", () => {
    expect(generatorVersionFor(B4)).not.toBe(MMRI_PDF_GENERATOR_VERSION);
    expect(generatorVersionFor(B4)).toContain("B4-PROPOSAL");
  });
  it("B3 lines are added to the PDF source only when the flag is ON and the payload carries the disclosure", () => {
    const f = fx("finance_weak");
    const off = buildReportPdfSource(f.payload, f.narrative, POLICY_FLAGS_OFF);
    const withDisc = { ...f.payload, evidenceDisclosure: { warningsMn: ["TEST-LINE"] } };
    expect(buildReportPdfSource(withDisc as any, f.narrative, POLICY_FLAGS_OFF).warnings).toEqual(off.warnings);
    expect(buildReportPdfSource(withDisc as any, f.narrative, { ...POLICY_FLAGS_OFF, b3: true }).warnings).toEqual([...off.warnings, "TEST-LINE"]);
  });
});

describe("B4 finding rule: default = existing contract eligibility; SCORE_BAND needs explicit owner numbers", () => {
  it("rule parsing: default CONTRACT; SCORE_BAND without explicit numbers throws (no invented defaults); unknown mode throws", () => {
    expect(readB4Rule({})).toEqual({ mode: "CONTRACT" });
    expect(() => readB4Rule({ MMRI_B4_FINDING_RULE: "SCORE_BAND" })).toThrow(/explicit numeric MMRI_B4_STRENGTH_MIN_SCORE/);
    expect(() => readB4Rule({ MMRI_B4_FINDING_RULE: "SCORE_BAND", MMRI_B4_STRENGTH_MIN_SCORE: "80", MMRI_B4_WEAKNESS_MAX_SCORE: "60" })).toThrow(/MMRI_B4_MIN_CAPABILITY_COVERAGE/);
    expect(() => readB4Rule({ MMRI_B4_FINDING_RULE: "bogus" })).toThrow();
    expect(readB4Rule({ MMRI_B4_FINDING_RULE: "SCORE_BAND", MMRI_B4_STRENGTH_MIN_SCORE: "80", MMRI_B4_WEAKNESS_MAX_SCORE: "60", MMRI_B4_MIN_CAPABILITY_COVERAGE: "0.05" })).toEqual({ mode: "SCORE_BAND", strengthMinScore: 80, weaknessMaxScore: 60, minCapabilityCoverage: 0.05 });
  });
  it("SCORE_BAND (test numbers only): uniformly strong => 5 verified strengths + 5 weakness placeholders; uniformly weak => 5 verified weaknesses + 5 strength placeholders; never a 100-score 'weakness'", () => {
    const env = { MMRI_POLICY_FLAGS_ALLOWED: "ISOLATED_QA", MMRI_B4_FINDING_RULE: "SCORE_BAND", MMRI_B4_STRENGTH_MIN_SCORE: "80", MMRI_B4_WEAKNESS_MAX_SCORE: "60", MMRI_B4_MIN_CAPABILITY_COVERAGE: "0.05" };
    const saved = { ...process.env }; Object.assign(process.env, env);
    try {
      const strong = buildReportPdfSource(fx("finance_strong").payload, fx("finance_strong").narrative, B4);
      expect(strong.strengths.filter((x: any) => !x.placeholder)).toHaveLength(5);
      expect(strong.weaknesses.every((x: any) => x.placeholder)).toBe(true);
      const weak = buildReportPdfSource(fx("finance_weak").payload, fx("finance_weak").narrative, B4);
      expect(weak.weaknesses.filter((x: any) => !x.placeholder)).toHaveLength(5);
      expect(weak.weaknesses.every((x: any) => x.placeholder || (x.score as number) <= 60)).toBe(true);
      expect(weak.strengths.every((x: any) => x.placeholder)).toBe(true);
      const unc = buildReportPdfSource(fx("people_uncertain").payload, fx("people_uncertain").narrative, B4);
      expect(unc.strengths.concat(unc.weaknesses).filter((x: any) => !x.placeholder).every((x: any) => typeof x.score === "number")).toBe(true);
    } finally { for (const k of Object.keys(env)) delete (process.env as any)[k]; Object.assign(process.env, saved); }
  });
});

describe("B3 evidence disclosure over the real V2 snapshot", () => {
  const dir = path.resolve(__dirname, "../methodology/businessmri-v2.6-runtime-bundles");
  const def = buildDefinition(JSON.parse(fs.readFileSync(path.join(dir, "MMRI_FINMRI_Methodology_4.2.7_BUSINESSMRI_V2.json"), "utf8")));
  const cats = def.categories.map(c => c.id), cells = def.cells.filter(c => c.id !== "C01" && c.weightPct > 0).map(c => c.id);
  const q = (c: string, cell: string, p: number) => def.questionByCategoryCellPath.get(`${c}:${cell}:${p}`)!;
  const best = (qq: any) => { const s = qq.options.filter((o: any) => typeof o.score === "number").sort((a: any, b: any) => b.score - a.score); return s[0]?.optionIndex; };
  const ev = (qq: any, i: number) => evidenceFromAnswer({ definition: def, question: qq, optionIndex: i, explicitAuthority: 0.9 });
  const all = (subset: (i: number) => boolean) => cats.flatMap((c, i) => !subset(i) ? [] : [ev(q(c, "C01", 1), 1), ...cells.map(cell => q(c, cell, 1)).filter(x => x && best(x)).map(x => ev(x, best(x)))]);
  const sparse = (n: number) => cats.flatMap(c => [ev(q(c, "C01", 1), 1), ...cells.slice(0, n).map(cell => q(c, cell, 1)).filter(x => x && best(x)).map(x => ev(x, best(x)))]);
  it("a normal-depth run (2-3 valued cells per capability) is PROVISIONAL, not official; coverage and heuristic confidence are disclosed; contract-faithful value << runtime 1.0", () => {
    const snap = calculateBusinessMriRuntimeSnapshot(def, sparse(2), POLICY_FLAGS_OFF);
    const d = buildEvidenceDisclosure(def, snap);
    expect(d.approved).toBe(false);
    expect(d.resultStatus.value).toBe("PROVISIONAL");
    expect(d.resultStatus.labelMn).toBe("Урьдчилсан үнэлгээ");
    expect(d.confidence).toMatchObject({ kind: "EVIDENCE_SUFFICIENCY_HEURISTIC", calibrated: false, isProbability: false });
    expect(d.confidence.runtimeValue).toBe(1);
    expect(d.confidence.contractFaithfulCoverageWeightedValue!).toBeLessThan(0.1);
    expect(d.evidenceSufficiency.state).toBe("CRITERIA_NOT_APPROVED");
    expect(d.coverage.capabilityCoverageShare).toBe(1);
    expect(d.coverage.weightedCellCoverage!).toBeLessThan(0.2);
    expect(d.warningsMn.length).toBeGreaterThan(0);
    // The provisional sentence must state the engine's real figures, not a generic claim.
    const provisional = d.warningsMn.find(w => w.startsWith("Оноо нь хариулсан үзүүлэлтүүд дээр суурилсан урьдчилсан үнэлгээ"))!;
    expect(provisional).toContain(`${(Math.round(d.coverage.weightedCellCoverage! * 1000) / 10)}%`);
    expect(provisional).toContain(`нийт ${d.coverage.applicableCells} үзүүлэлтийн ${d.coverage.valuedCells} нь үнэлэгдсэн`);
    expect(provisional).toContain("жинлэсэн хамралт");
    expect(provisional).toContain(`${d.coverage.capabilitiesWithScoredEvidence}/${d.coverage.applicableCapabilities} чадавхид`);
  });
  it("every weighted cell valued => OFFICIAL only under the EXISTING engine rule (no new criteria invented); heuristic confidence still not a probability", () => {
    const d = buildEvidenceDisclosure(def, calculateBusinessMriRuntimeSnapshot(def, all(() => true), POLICY_FLAGS_OFF));
    expect(d.resultStatus.value).toBe("OFFICIAL_UNDER_EXISTING_RULE");
    expect(d.resultStatus.officialCriteria).toBe("EXISTING_ENGINE_RULE_ALL_APPLICABLE_CELLS_VALUED_NOT_REAPPROVED");
    expect(d.confidence.isProbability).toBe(false);
    expect(d.confidence.contractFaithfulCoverageWeightedValue!).toBeLessThan(0.5);
  });
  it("partial / high-uncertainty run: low capability coverage is disclosed, score is unchanged, no withholding", () => {
    const snap = calculateBusinessMriRuntimeSnapshot(def, all(i => i < 10), POLICY_FLAGS_OFF);
    const d = buildEvidenceDisclosure(def, snap);
    expect(d.coverage.capabilitiesWithScoredEvidence).toBe(10);
    expect(d.coverage.capabilityCoverageShare!).toBeCloseTo(10 / 64, 6);
    expect(d.observedScore.value).toBe(snap.overall.partialScore);
    expect(d.resultStatus.value).toBe("PROVISIONAL");
  });
  it("contradictory and N/A-conflict evidence => REVIEW_REQUIRED with counts; exclusions disclosed with weight", () => {
    const on: PolicyFlags = { ...POLICY_FLAGS_OFF, b1: "NUMERIC_50", b2: true };
    const worst = (qq: any) => { const s = qq.options.filter((o: any) => typeof o.score === "number").sort((a: any, b: any) => a.score - b.score); return s[0]?.optionIndex; };
    const e: any[] = [];
    cats.forEach((c, i) => { e.push(ev(q(c, "C01", 1), 1)); for (const cell of cells) { const q1 = q(c, cell, 1), q2 = q(c, cell, 2); if (q1 && q2 && best(q1) && worst(q2)) { e.push(ev(q1, best(q1))); e.push(ev(q2, worst(q2))); break; } } });
    const d = buildEvidenceDisclosure(def, calculateBusinessMriRuntimeSnapshot(def, e, on));
    expect(d.resultStatus.value).toBe("REVIEW_REQUIRED");
    expect(d.contested.cellCount).toBe(64);
    expect(d.contested.ruleIds).toEqual(["H01"]);
  });
});
