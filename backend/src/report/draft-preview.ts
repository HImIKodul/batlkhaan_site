import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile, readFile, access } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { FrozenReportPayload, NarrativeDraft } from "./types.js";
import { buildReportPdfSource } from "./pdf-artifact.js";

const run = promisify(execFile);
const PAGES = 3;

/** Editor preview. Renders a candidate narrative (including its annotations) with the REAL renderer, entirely in a temporary directory:
    nothing is stored, no artifact row is created or replaced, and no stored PDF is touched. Returns one PNG per page of the exactly-three-page PDF. */
export async function renderDraftPages(payload: FrozenReportPayload, narrative: NarrativeDraft, domainCode: string | null, dpi = 110): Promise<Buffer[]> {
  const source = buildReportPdfSource(payload, narrative);
  const renderer = path.resolve(process.env.MMRI_PDF_RENDERER_SCRIPT || path.join(process.cwd(), "pdf_renderer", "render_report_pdf.py"));
  await access(renderer);
  const python = String(process.env.MMRI_PDF_PYTHON_PATH || "python3").trim() || "python3";
  const env = { PATH: process.env.PATH || "/usr/bin:/bin", HOME: process.env.HOME || "/tmp", LANG: process.env.LANG || "C.UTF-8", LC_ALL: process.env.LC_ALL || process.env.LANG || "C.UTF-8", PYTHONIOENCODING: "utf-8" };
  const dir = await mkdtemp(path.join(os.tmpdir(), "mmri-editor-preview-"));
  try {
    const input = path.join(dir, "source.json"), pdf = path.join(dir, "out.pdf");
    await writeFile(input, JSON.stringify({ ...source, render: { domainCode } }), { mode: 0o600 });
    await run(python, [renderer, "--input", input, "--output", pdf], { timeout: 60_000, env });
    const info = (await run("pdfinfo", [pdf], { timeout: 15_000, env })).stdout;
    const pages = Number(/Pages:\s+(\d+)/.exec(info)?.[1] ?? 0);
    if (pages !== PAGES) throw new Error(`Preview PDF has ${pages} pages, expected ${PAGES}`);
    await run("pdftoppm", ["-png", "-r", String(dpi), pdf, path.join(dir, "p")], { timeout: 60_000, env });
    const out: Buffer[] = [];
    for (let i = 1; i <= PAGES; i++) out.push(await readFile(path.join(dir, `p-${i}.png`)));
    return out;
  } finally { await rm(dir, { recursive: true, force: true }).catch(() => undefined); }
}
