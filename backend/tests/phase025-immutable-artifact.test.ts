import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { describe, it, expect } from "vitest";
import { immutableStorageKey, planRegeneration, writeOnce } from "../src/services/proposed/phase025-immutable-artifact.js";

const h = (b: Buffer) => createHash("sha256").update(b).digest("hex");
const id = (gen: string, bytes: Buffer) => ({ assessmentId: "A1", reportSnapshotId: "S1", sourceHash: "a".repeat(64), generatorVersion: gen, contentHash: h(bytes) });

describe("Phase 2.5 proposed immutable PDF artifacts (B7)", () => {
  const v1 = Buffer.from("%PDF-1.4 generator-1.5 bytes"), v2 = Buffer.from("%PDF-1.4 generator-1.6 bytes");
  it("a newer generator yields a DIFFERENT key, so the original path is never reused", () => {
    expect(immutableStorageKey(id("MMRI-PDF-1.5", v1))).not.toBe(immutableStorageKey(id("MMRI-PDF-1.6", v2)));
  });
  it("original bytes stay unchanged when a newer version is stored; repeated downloads/writes do not mutate", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "p25-art-"));
    try {
      const k1 = immutableStorageKey(id("MMRI-PDF-1.5", v1)), k2 = immutableStorageKey(id("MMRI-PDF-1.6", v2));
      expect(await writeOnce(root, k1, v1)).toBe("CREATED");
      const before = h(fs.readFileSync(path.join(root, k1)));
      expect(await writeOnce(root, k2, v2)).toBe("CREATED");
      expect(await writeOnce(root, k1, v1)).toBe("IDENTICAL_EXISTS"); // repeated store
      expect(h(fs.readFileSync(path.join(root, k1)))).toBe(before);
      await expect(writeOnce(root, k1, v2)).rejects.toThrow("IMMUTABLE_ARTIFACT_CONFLICT");
      expect(h(fs.readFileSync(path.join(root, k1)))).toBe(before);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });
  it("a plain download of a historical report never regenerates; upgrade is explicit and appends a version", () => {
    const ex = { storageKey: "k1", sourceHash: "s", generatorVersion: "MMRI-PDF-1.5" };
    expect(planRegeneration(ex, { sourceHash: "s", generatorVersion: "MMRI-PDF-1.6" })).toEqual({ action: "SERVE_EXISTING" });
    expect(planRegeneration(ex, { sourceHash: "s", generatorVersion: "MMRI-PDF-1.6" }, { allowGeneratorUpgrade: true })).toEqual({ action: "STORE_NEW_VERSION", supersedes: "k1", reason: "NEWER_GENERATOR" });
    expect(planRegeneration(null, { sourceHash: "s", generatorVersion: "g" })).toEqual({ action: "STORE_FIRST" });
  });
  it("rejects path traversal in identity segments", () => {
    expect(() => immutableStorageKey({ ...id("g", v1), assessmentId: "../x" })).toThrow();
  });
});
