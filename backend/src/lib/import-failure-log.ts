import { appendFile, lstat, mkdir, rename } from "node:fs/promises";
import path from "node:path";

/** Removes credentials from text that is about to be persisted: connection strings with user:password@, and password= / token= style pairs. */
export function redactSecrets(text: string): string {
  return text
    .replace(/([a-z][a-z0-9+.-]*:\/\/)([^\s:@\/]+):([^\s@\/]*)@/gi, "$1$2:***@")
    .replace(/((?:password|passwd|pwd|secret|token|apikey|api_key)\s*[=:]\s*)("[^"]*"|'[^']*'|[^\s,;&]+)/gi, "$1***");
}

const FAILURE_LOG_MAX_BYTES = 1024 * 1024; // maintenance policy: one rotated generation (.1), so the log never exceeds ~2 MiB

/** The failure log may only live under an allowed base directory (default <cwd>/logs). A configured path outside it, or a symlink target, is refused (and ignored, never fatal). */
export function resolveFailureLogPath(env: Record<string, string | undefined> = process.env, cwd: string = process.cwd()): string {
  const base = path.resolve(env.MMRI_IMPORT_FAILURE_LOG_BASE?.trim() || path.join(cwd, "logs"));
  const requested = env.MMRI_IMPORT_FAILURE_LOG?.trim();
  const file = requested ? path.resolve(base, requested) : path.join(base, "import-failures.jsonl");
  if (file !== base && !file.startsWith(base + path.sep)) throw new Error("failure log path escapes its allowed directory");
  return file;
}

export async function recordImportFailure(f: { runId: string; version: string; bundleSha256: string; stage: string; error: unknown }): Promise<void> {
  const file = resolveFailureLogPath();
  const message = redactSecrets(f.error instanceof Error ? f.error.message : String(f.error));
  const line = JSON.stringify({ at: new Date().toISOString(), runId: f.runId, methodologyVersion: f.version, bundleSha256: f.bundleSha256, stage: f.stage, status: "FAIL", rolledBack: true, error: message.slice(0, 4000) });
  await mkdir(path.dirname(file), { recursive: true });
  const existing = await lstat(file).catch(() => null);
  if (existing?.isSymbolicLink()) throw new Error("failure log is a symbolic link");
  if (existing && existing.size >= FAILURE_LOG_MAX_BYTES) await rename(file, file + ".1");
  await appendFile(file, line + "\n", { mode: 0o600 });
}
