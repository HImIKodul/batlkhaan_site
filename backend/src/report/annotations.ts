import { ApiError } from "../api/errors.js";

/**
 * Administrator visual annotations on the three-page customer PDF.
 *
 * Stored inside the narrative revision (`narrative.visualAnnotations`), therefore:
 *  - every saved set is an append-only revision with editor identity, timestamp and reason;
 *  - the approval binds the exact set (the approved narrative hash covers it) and publication refuses anything else;
 *  - the PDF source carries it, so the published PDF and the saved editor state cannot disagree.
 * Coordinates are normalised to the page (0..1 of the A4 width/height, origin top-left), never to a screen size, so the same
 * annotation lands on the same place in any editor window, in the preview and in the final PDF.
 * Annotations are an overlay: they never change a score, an answer, a finding or the layout of the original text.
 */
export const ANNOTATION_COLORS = { red: "#D64545", orange: "#E8913A", green: "#2E9E6B", blue: "#2F6FDE", ink: "#1F2937", yellow: "#F5C518" } as const;
export type AnnotationColor = keyof typeof ANNOTATION_COLORS;
export type AnnotationType = "text" | "highlight" | "rect" | "arrow" | "pen";
export const ANNOTATION_PAGES = [1, 2, 3] as const;
export const MAX_ANNOTATIONS = 120, MAX_ANNOTATION_TEXT = 500, MAX_PEN_POINTS = 400;
const MIN_BOX = 0.004;

export interface VisualAnnotation {
  id: string;
  page: 1 | 2 | 3;
  type: AnnotationType;
  color: AnnotationColor;
  /** Bounding box in page units (0..1). For arrows and pen strokes it is derived from `points`. */
  x: number; y: number; w: number; h: number;
  points?: Array<[number, number]>;
  text?: string;
  fontSize?: number;
  strokeWidth?: number;
}
export interface VisualAnnotationSet { version: 1; items: VisualAnnotation[] }

const bad = (message: string): never => { throw new ApiError(400, "BAD_ANNOTATIONS", message); };
const r5 = (n: number) => Math.round(n * 1e5) / 1e5;
const unit = (v: unknown, what: string) => { const n = Number(v); if (typeof v === "boolean" || v === null || !Number.isFinite(n) || n < -1e-9 || n > 1 + 1e-9) bad(`${what} 0 ба 1-ийн хооронд байх ёстой.`); return r5(Math.min(1, Math.max(0, n))); };
const noDash = (s: string) => s.replace(/\s*[—―]\s*/g, " - ");

/** Strict validation + canonicalisation. Unknown keys are dropped; anything out of range is rejected, never silently clamped (except sub-1e-9 float noise). */
export function normalizeAnnotations(input: unknown): VisualAnnotationSet {
  if (input === null || input === undefined) return { version: 1, items: [] };
  const raw: any = Array.isArray(input) ? input : (input as any)?.items;
  if (!Array.isArray(raw)) return bad("Тэмдэглэгээний жагсаалт буруу байна.");
  if (raw.length > MAX_ANNOTATIONS) bad(`Нэг тайланд дээд тал нь ${MAX_ANNOTATIONS} тэмдэглэгээ оруулна.`);
  const seen = new Set<string>();
  const items: VisualAnnotation[] = raw.map((a: any, index: number): VisualAnnotation => {
    if (!a || typeof a !== "object") return bad(`#${index + 1}: буруу бүтэц.`);
    const id = String(a.id ?? "");
    if (!/^[A-Za-z0-9_-]{6,40}$/.test(id) || seen.has(id)) bad(`#${index + 1}: давхардсан эсвэл буруу id.`);
    seen.add(id);
    const page = Number(a.page);
    if (!ANNOTATION_PAGES.includes(page as any)) bad(`#${index + 1}: хуудас 1-3 байх ёстой.`);
    const type = String(a.type) as AnnotationType;
    if (!["text", "highlight", "rect", "arrow", "pen"].includes(type)) bad(`#${index + 1}: тэмдэглэгээний төрөл буруу.`);
    const color = String(a.color ?? "red") as AnnotationColor;
    if (!(color in ANNOTATION_COLORS)) bad(`#${index + 1}: өнгө буруу.`);
    const out: VisualAnnotation = { id, page: page as 1 | 2 | 3, type, color, x: 0, y: 0, w: 0, h: 0 };
    if (type === "arrow" || type === "pen") {
      const pts: any = a.points;
      const min = 2, max = type === "arrow" ? 2 : MAX_PEN_POINTS;
      if (!Array.isArray(pts) || pts.length < min || pts.length > max) return bad(`#${index + 1}: цэгийн тоо буруу.`);
      out.points = pts.map((p: any) => { if (!Array.isArray(p) || p.length !== 2) bad(`#${index + 1}: цэг буруу.`); return [unit(p[0], "x"), unit(p[1], "y")] as [number, number]; });
      const xs = out.points.map(p => p[0]), ys = out.points.map(p => p[1]);
      out.x = Math.min(...xs); out.y = Math.min(...ys); out.w = r5(Math.max(...xs) - out.x); out.h = r5(Math.max(...ys) - out.y);
      if (type === "arrow" && out.w < MIN_BOX && out.h < MIN_BOX) bad(`#${index + 1}: сум хэт богино.`);
    } else {
      out.x = unit(a.x, "x"); out.y = unit(a.y, "y"); out.w = unit(a.w, "w"); out.h = unit(a.h, "h");
      if (out.w < MIN_BOX || out.h < MIN_BOX) bad(`#${index + 1}: тэмдэглэгээ хэт жижиг.`);
      if (out.x + out.w > 1 + 1e-6 || out.y + out.h > 1 + 1e-6) bad(`#${index + 1}: тэмдэглэгээ хуудсаас хэтэрсэн.`);
    }
    if (type === "text") {
      const text = noDash(String(a.text ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")).trim();
      if (!text) bad(`#${index + 1}: текст хоосон байна.`);
      if (text.length > MAX_ANNOTATION_TEXT) bad(`#${index + 1}: текст ${MAX_ANNOTATION_TEXT} тэмдэгтээс хэтэрсэн.`);
      out.text = text;
      const fs = a.fontSize === undefined ? 9 : Number(a.fontSize);
      if (!Number.isFinite(fs) || fs < 6 || fs > 24) bad(`#${index + 1}: үсгийн хэмжээ 6-24 байх ёстой.`);
      out.fontSize = r5(fs);
    }
    if (type !== "text" && type !== "highlight") {
      const sw = a.strokeWidth === undefined ? 1.5 : Number(a.strokeWidth);
      if (!Number.isFinite(sw) || sw < 0.5 || sw > 6) bad(`#${index + 1}: зураасны зузаан 0.5-6 байх ёстой.`);
      out.strokeWidth = r5(sw);
    }
    return out;
  });
  return { version: 1, items };
}

export const annotationsOf = (narrative: any): VisualAnnotationSet => normalizeAnnotations(narrative?.visualAnnotations ?? null);
export const annotationCount = (narrative: any): number => Array.isArray(narrative?.visualAnnotations?.items) ? narrative.visualAnnotations.items.length : 0;
