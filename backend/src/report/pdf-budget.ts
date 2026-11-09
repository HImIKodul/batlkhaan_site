import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile, access } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { FrozenReportPayload, NarrativeDraft } from "./types.js";
import { buildReportPdfSource } from "./pdf-artifact.js";

const run = promisify(execFile);

/** Approval-time guarantee for the exactly-three-page contract: renders the candidate narrative with the real renderer in --strict mode
    (approved text is never shortened or omitted; exit 3 means it does not fit). Never throws for "does not fit". */
export async function checkPdfLayoutBudget(payload: FrozenReportPayload, narrative: NarrativeDraft): Promise<{ fits: boolean; detail: string }> {
  const source = buildReportPdfSource(payload, narrative);
  const renderer = path.resolve(process.env.MMRI_PDF_RENDERER_SCRIPT || path.join(process.cwd(), "pdf_renderer", "render_report_pdf.py"));
  await access(renderer);
  const python = String(process.env.MMRI_PDF_PYTHON_PATH || "python3").trim() || "python3";
  const dir = await mkdtemp(path.join(os.tmpdir(), "mmri-pdf-budget-"));
  try {
    const input = path.join(dir, "source.json");
    await writeFile(input, JSON.stringify({ ...source, render: { domainCode: null } }), { mode: 0o600 });
    await run(python, [renderer, "--input", input, "--output", path.join(dir, "out.pdf"), "--strict"], { timeout: 60_000, env: { PATH: process.env.PATH || "/usr/bin:/bin", HOME: process.env.HOME || "/tmp", LANG: "C.UTF-8", LC_ALL: "C.UTF-8" } });
    return { fits: true, detail: "ok" };
  } catch (e: any) {
    if (e?.code === 3) return { fits: false, detail: String(e.stderr ?? "").trim().slice(0, 200) };
    throw e;
  } finally { await rm(dir, { recursive: true, force: true }).catch(() => undefined); }
}
