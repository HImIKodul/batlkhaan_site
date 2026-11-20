import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { redactSecrets, resolveFailureLogPath, recordImportFailure } from "../src/lib/import-failure-log.js";

describe("importer failure log hardening", () => {
  it("redacts connection-string passwords and password/token pairs", () => {
    expect(redactSecrets("Can't reach postgresql://mmri:S3cr3t!pw@127.0.0.1:55432/db?schema=public")).not.toMatch(/S3cr3t/);
    expect(redactSecrets("postgres://u:p@h/db")).toBe("postgres://u:***@h/db");
    expect(redactSecrets('password=abc123 and token: "xyz" apikey=k1')).not.toMatch(/abc123|xyz|k1/);
    expect(redactSecrets("plain error without secrets")).toBe("plain error without secrets");
  });
  it("confines the log to its base directory (no traversal, no absolute escape)", () => {
    const env = { MMRI_IMPORT_FAILURE_LOG_BASE: "/tmp/p27-base" };
    expect(resolveFailureLogPath(env)).toBe("/tmp/p27-base/import-failures.jsonl");
    expect(resolveFailureLogPath({ ...env, MMRI_IMPORT_FAILURE_LOG: "sub/a.jsonl" })).toBe("/tmp/p27-base/sub/a.jsonl");
    expect(() => resolveFailureLogPath({ ...env, MMRI_IMPORT_FAILURE_LOG: "../escape.jsonl" })).toThrow(/escapes/);
    expect(() => resolveFailureLogPath({ ...env, MMRI_IMPORT_FAILURE_LOG: "/etc/passwd" })).toThrow(/escapes/);
    expect(resolveFailureLogPath({}, "/srv/app")).toBe("/srv/app/logs/import-failures.jsonl");
  });
  it("records redacted JSONL, mode 0600, rotates at the size cap, refuses a symlinked log", async () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), "p27-log-"));
    const old = { ...process.env };
    try {
      process.env.MMRI_IMPORT_FAILURE_LOG_BASE = base;
      await recordImportFailure({ runId: "r1", version: "4.1.7", bundleSha256: "a".repeat(64), stage: "questions", error: new Error("fail at postgresql://u:topsecret@h/db") });
      const f = path.join(base, "import-failures.jsonl");
      const rec = JSON.parse(fs.readFileSync(f, "utf8").trim());
      expect(rec).toMatchObject({ status: "FAIL", rolledBack: true, stage: "questions" });
      expect(JSON.stringify(rec)).not.toMatch(/topsecret/);
      expect(fs.statSync(f).mode & 0o777).toBe(0o600);
      fs.writeFileSync(f, "x".repeat(1024 * 1024 + 1));
      await recordImportFailure({ runId: "r2", version: "4.1.7", bundleSha256: "b".repeat(64), stage: "finalize", error: "again" });
      expect(fs.existsSync(f + ".1")).toBe(true);
      expect(fs.statSync(f).size).toBeLessThan(2000);
      fs.rmSync(f); fs.symlinkSync("/tmp/p27-target-never-written", f);
      await expect(recordImportFailure({ runId: "r3", version: "x", bundleSha256: "c".repeat(64), stage: "s", error: "e" })).rejects.toThrow(/symbolic link/);
      expect(fs.existsSync("/tmp/p27-target-never-written")).toBe(false);
    } finally { process.env = old; fs.rmSync(base, { recursive: true, force: true }); }
  });
});
