import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, access } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { prisma } from "../db.js";
import { ApiError, badRequest, notFound } from "../api/errors.js";

/* COMPANY LOGO. Optional, one current logo per company.
   Intake is validated and re-encoded on the SERVER by pdf_renderer/process_logo.py (Pillow): the real format is decided by decoding, not by file name or the client's content type;
   only PNG/JPEG/WebP/GIF (a GIF must be a single static frame), size and pixel limits, no animation; the stored bytes are a fresh PNG (<= 512 px) with every metadata block dropped.
   Rows are immutable assets keyed by (companyId, sha256). Replacing or removing the logo moves/clears Company.logoAssetId only, so reports that snapshotted an asset keep it.
   Nothing here accepts a URL or file path from the client. */
export const MAX_LOGO_BYTES = 5 * 1024 * 1024; // 5 МБ, the same number in the browser (CompanyLogoEditor) and in pdf_renderer/process_logo.py
export const LOGO_REQUEST_LIMIT_BYTES = 7_200_000; // base64 of MAX_LOGO_BYTES (6.99 MB) plus JSON framing
const REJECT_MESSAGES: Record<string, string> = {
  EMPTY: "Зураг хоосон байна.",
  TOO_LARGE: "Зургийн хэмжээ 5 МБ-аас хэтэрсэн байна. Жижиг файл сонгоно уу.",
  UNSUPPORTED_FORMAT: "Зөвхөн PNG, JPG, JPEG, WebP эсвэл GIF зураг оруулна уу.",
  TOO_MANY_PIXELS: "Зургийн нягтрал хэт өндөр байна.",
  TOO_SMALL: "Зураг хэт жижиг байна (хамгийн багадаа 32×32 пиксел).",
  DIMENSIONS_TOO_LARGE: "Зураг хэт том байна (нэг тал нь 4096 пикселээс хэтрэхгүй).",
  ANIMATED: "Хөдөлгөөнт зургийг зөвшөөрөхгүй.",
  NOT_A_VALID_IMAGE: "Файл зөв зураг биш байна."
};

export interface LogoMeta { sha256: string; width: number; height: number; byteSize: number; mimeType: string; updatedAt: string }
export interface LogoSnapshot { assetId: string; sha256: string; width: number; height: number }

function decodeBase64Strict(value: unknown): Buffer {
  if (typeof value !== "string" || !value) throw badRequest("Зургийн өгөгдөл байхгүй байна.");
  const raw = value.replace(/^data:[^;,]{1,64};base64,/i, "");
  if (raw.length > Math.ceil(MAX_LOGO_BYTES / 3) * 4 + 8) throw new ApiError(413, "LOGO_TOO_LARGE", REJECT_MESSAGES.TOO_LARGE);
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(raw) || raw.length % 4 !== 0) throw new ApiError(400, "LOGO_INVALID", REJECT_MESSAGES.NOT_A_VALID_IMAGE);
  return Buffer.from(raw, "base64");
}

/** Runs the Pillow processor on untrusted bytes. Throws ApiError(400 LOGO_INVALID / 413 LOGO_TOO_LARGE) with a customer-safe Mongolian message. */
export async function processLogoBytes(input: Buffer): Promise<{ png: Buffer; width: number; height: number; sha256: string; byteSize: number }> {
  if (input.length > MAX_LOGO_BYTES) throw new ApiError(413, "LOGO_TOO_LARGE", REJECT_MESSAGES.TOO_LARGE);
  const script = path.resolve(process.env.MMRI_LOGO_PROCESSOR_SCRIPT || path.join(process.cwd(), "pdf_renderer", "process_logo.py"));
  await access(script);
  const python = String(process.env.MMRI_PDF_PYTHON_PATH || "python3").trim() || "python3";
  const dir = await mkdtemp(path.join(os.tmpdir(), "mmri-logo-"));
  try {
    const out = path.join(dir, "logo.png");
    const result = await new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
      const child = spawn(python, [script, "--output", out], { stdio: ["pipe", "pipe", "pipe"], env: { PATH: process.env.PATH || "/usr/bin:/bin", HOME: process.env.HOME || "/tmp", LANG: "C.UTF-8", LC_ALL: "C.UTF-8" } });
      let stdout = "", stderr = "";
      const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("logo processor timeout")); }, 15_000);
      child.stdout.on("data", d => { stdout += d; if (stdout.length > 4096) child.kill("SIGKILL"); });
      child.stderr.on("data", d => { stderr += d; if (stderr.length > 4096) child.kill("SIGKILL"); });
      child.on("error", e => { clearTimeout(timer); reject(e); });
      child.on("close", code => { clearTimeout(timer); resolve({ code, stdout, stderr }); });
      child.stdin.on("error", () => undefined);
      child.stdin.end(input);
    });
    if (result.code === 2) {
      const reason = result.stderr.trim().split(/\s+/)[0] || "NOT_A_VALID_IMAGE";
      throw new ApiError(reason === "TOO_LARGE" ? 413 : 400, reason === "TOO_LARGE" ? "LOGO_TOO_LARGE" : "LOGO_INVALID", REJECT_MESSAGES[reason] ?? REJECT_MESSAGES.NOT_A_VALID_IMAGE);
    }
    if (result.code !== 0) throw new Error(`logo processor failed (${result.code})`);
    const meta = JSON.parse(result.stdout);
    const png = await readFile(out);
    if (png.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a" || png.length !== meta.byteSize) throw new Error("logo processor output mismatch");
    return { png, width: Number(meta.width), height: Number(meta.height), sha256: String(meta.sha256), byteSize: png.length };
  } finally { await rm(dir, { recursive: true, force: true }).catch(() => undefined); }
}

const view = (a: { sha256: string; width: number; height: number; byteSize: number; mimeType: string; createdAt: Date }): LogoMeta => ({ sha256: a.sha256, width: a.width, height: a.height, byteSize: a.byteSize, mimeType: a.mimeType, updatedAt: a.createdAt.toISOString() });

export class CompanyLogoService {
  async current(companyId: string): Promise<LogoMeta | null> {
    const c = await prisma.company.findUnique({ where: { id: companyId }, select: { logoAsset: { select: { companyId: true, sha256: true, width: true, height: true, byteSize: true, mimeType: true, createdAt: true } } } });
    return c?.logoAsset && c.logoAsset.companyId === companyId ? view(c.logoAsset) : null;   // never serve an asset owned by another company
  }
  /** Validates, re-encodes and stores; the caller has already authorised the company role. */
  async set(companyId: string, userId: string, input: { dataBase64?: unknown }): Promise<LogoMeta> {
    const company = await prisma.company.findUnique({ where: { id: companyId }, select: { id: true, erasedAt: true } });
    if (!company || company.erasedAt) throw notFound("Company not found");
    const processed = await processLogoBytes(decodeBase64Strict(input.dataBase64));
    const asset = await prisma.$transaction(async (tx: any) => {
      const row = await tx.companyLogoAsset.upsert({
        where: { companyId_sha256: { companyId, sha256: processed.sha256 } }, update: {},
        create: { companyId, sha256: processed.sha256, mimeType: "image/png", width: processed.width, height: processed.height, byteSize: processed.byteSize, bytes: processed.png, createdByUserId: userId }
      });
      await tx.company.update({ where: { id: companyId }, data: { logoAssetId: row.id } });
      return row;
    });
    return view(asset);
  }
  async remove(companyId: string): Promise<void> {
    await prisma.company.update({ where: { id: companyId }, data: { logoAssetId: null } });
  }
  /** Bytes of the company's CURRENT logo (membership already checked by the caller). */
  async currentBytes(companyId: string): Promise<{ bytes: Buffer; sha256: string; mimeType: string } | null> {
    const c = await prisma.company.findUnique({ where: { id: companyId }, select: { logoAsset: { select: { companyId: true, bytes: true, sha256: true, mimeType: true } } } });
    return c?.logoAsset && c.logoAsset.companyId === companyId ? { bytes: Buffer.from(c.logoAsset.bytes), sha256: c.logoAsset.sha256, mimeType: c.logoAsset.mimeType } : null;
  }
  /** Bytes of a specific asset, ONLY if it belongs to the given company (report snapshots). */
  async assetBytes(companyId: string, assetId: string): Promise<{ bytes: Buffer; sha256: string; mimeType: string } | null> {
    const a = await prisma.companyLogoAsset.findFirst({ where: { id: assetId, companyId }, select: { bytes: true, sha256: true, mimeType: true } });
    return a ? { bytes: Buffer.from(a.bytes), sha256: a.sha256, mimeType: a.mimeType } : null;
  }
  /** What a newly generated report freezes: the current logo (or null). */
  async snapshot(companyId: string): Promise<LogoSnapshot | null> {
    const c = await prisma.company.findUnique({ where: { id: companyId }, select: { logoAsset: { select: { id: true, companyId: true, sha256: true, width: true, height: true } } } });
    return c?.logoAsset && c.logoAsset.companyId === companyId ? { assetId: c.logoAsset.id, sha256: c.logoAsset.sha256, width: c.logoAsset.width, height: c.logoAsset.height } : null;
  }
  async purge(companyId: string, tx: any = prisma): Promise<number> {
    await tx.company.update({ where: { id: companyId }, data: { logoAssetId: null } });
    return (await tx.companyLogoAsset.deleteMany({ where: { companyId } })).count;
  }
}
export const companyLogos = new CompanyLogoService();
