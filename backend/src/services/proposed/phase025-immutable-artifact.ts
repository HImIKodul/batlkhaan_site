/**
 * PHASE 2.5 — PROPOSED immutable PDF artifact policy (B7). ISOLATED: report-pdf-artifact-service.ts does not import this.
 *
 * Root cause of the current overwrite (report-pdf-artifact-service.ts renderAndStore): the storage key is
 * `<snapshotId>-<sourceHash16>.pdf` — it does not contain the generator version, so a newer generator writes the SAME path
 * (rename over the old file) and the single (reportSnapshotId, kind) row is upserted in place. The old bytes are lost.
 */
import { createHash } from "node:crypto";
import { mkdir, writeFile, readFile, access } from "node:fs/promises";
import path from "node:path";

export interface ArtifactIdentity {
  assessmentId: string;
  reportSnapshotId: string;
  sourceHash: string;      // frozen-report hash (unchanged by regeneration)
  generatorVersion: string;
  contentHash: string;     // sha256 of the PDF bytes
}

const safe = (s: string) => { if (!/^[A-Za-z0-9._-]+$/.test(s)) throw new Error(`unsafe path segment: ${s}`); return s; };

/** Content- and generator-addressed key: two different PDFs can never share a key; identical bytes always do. */
export function immutableStorageKey(a: ArtifactIdentity): string {
  return path.posix.join("pdf", safe(a.assessmentId), `${safe(a.reportSnapshotId)}-${a.sourceHash.slice(0, 16)}-${safe(a.generatorVersion)}-${a.contentHash.slice(0, 16)}.pdf`);
}

export type RegenerationPlan =
  | { action: "SERVE_EXISTING" }
  | { action: "STORE_NEW_VERSION"; supersedes: string; reason: "NEWER_GENERATOR" | "SOURCE_CHANGED" | "FORCED" }
  | { action: "STORE_FIRST" };

/** A download never regenerates by itself; regeneration is an explicit operation that appends a version. */
export function planRegeneration(existing: { storageKey: string; sourceHash: string; generatorVersion: string } | null,
  want: { sourceHash: string; generatorVersion: string }, opts: { force?: boolean; allowGeneratorUpgrade?: boolean } = {}): RegenerationPlan {
  if (!existing) return { action: "STORE_FIRST" };
  if (existing.sourceHash !== want.sourceHash) return { action: "STORE_NEW_VERSION", supersedes: existing.storageKey, reason: "SOURCE_CHANGED" };
  if (opts.force) return { action: "STORE_NEW_VERSION", supersedes: existing.storageKey, reason: "FORCED" };
  if (existing.generatorVersion !== want.generatorVersion && opts.allowGeneratorUpgrade) return { action: "STORE_NEW_VERSION", supersedes: existing.storageKey, reason: "NEWER_GENERATOR" };
  return { action: "SERVE_EXISTING" };
}

/** Write-once: refuses to overwrite an existing key with different bytes. */
export async function writeOnce(root: string, key: string, bytes: Buffer): Promise<"CREATED" | "IDENTICAL_EXISTS"> {
  const abs = path.join(root, key);
  try { await access(abs); } catch { await mkdir(path.dirname(abs), { recursive: true }); await writeFile(abs, bytes, { flag: "wx", mode: 0o600 }); return "CREATED"; }
  const prior = await readFile(abs);
  if (createHash("sha256").update(prior).digest("hex") !== createHash("sha256").update(bytes).digest("hex")) throw new Error("IMMUTABLE_ARTIFACT_CONFLICT");
  return "IDENTICAL_EXISTS";
}
