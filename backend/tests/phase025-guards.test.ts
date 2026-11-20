import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";

// STATIC guards (they read source text). They detect accidental removal; they do NOT replace the live concurrency test
// (Phase 2 script p2-questionnaire-api-tests.mjs in ENGINEERING_AUDITS/PHASE_02_*, which needs a running stack).
const src = (p: string) => fs.readFileSync(path.resolve(__dirname, "..", p), "utf8");

describe("Phase 2.5 static guards", () => {
  it("Q-1 fix still present: concurrent-answer unique/serialization failures map to a clean 409, not a masked 500", () => {
    const s = src("src/services/prisma-assessment-engine.ts");
    expect(s).toMatch(/code !== "P2002" && code !== "P2034"/);
    expect(s).toMatch(/throw conflict\("This question was answered by a concurrent request/);
  });
  it("importer runs the whole import inside one transaction and never uses the global client inside it", () => {
    const s = src("src/import-methodology.ts");
    const opener = "await prisma.$transaction(async tx =>";
    const body = s.slice(s.indexOf(opener) + opener.length, s.indexOf("MMRI_IMPORT_TX_TIMEOUT_MS"));
    expect(body.length).toBeGreaterThan(5000);
    expect(body).not.toMatch(/await prisma\./);
    expect(body).toMatch(/await tx\.methodologyVersion\.create/);
    expect(body).toMatch(/await tx\.importRun\.update\(\{ where: \{ id: runId \}, data: \{ status: "PASS"/);
    expect(s).toMatch(/Refusing mutable re-import/);
  });
  it("proposed Phase 2.5 policies are NOT wired into the production runtime", () => {
    for (const f of ["src/engine/businessmri-runtime.ts", "src/engine/calculation.ts", "src/engine/scoring.ts", "src/strategy/recommendations.ts", "src/strategy/action-plan.ts", "src/services/prisma-assessment-engine.ts", "src/report/payload.ts"]) {
      expect(src(f), f).not.toMatch(/phase025|proposed\//);
    }
  });
  it("V2 production behaviour is unchanged: constant scored-conflict flag and flat confidence remain (so the proposal is the only change path)", () => {
    const s = src("src/engine/businessmri-runtime.ts");
    expect(s).toMatch(/hasScoredConflict: false/);
    expect(s).toMatch(/directConfidence: score !== null \? 1 : 0/);
  });
});
