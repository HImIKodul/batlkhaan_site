import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import os from "node:os";
import { describe, it, expect } from "vitest";
import { normalizeAnnotations, annotationsOf, MAX_ANNOTATIONS } from "../src/report/annotations.js";
import { buildReportPdfSource, reportPdfSourceHash } from "../src/report/pdf-artifact.js";
import { renderDraftPages } from "../src/report/draft-preview.js";

const fx = (n: string) => JSON.parse(fs.readFileSync(path.resolve(__dirname, "fixtures/phase027", n + ".payload.json"), "utf8"));
const box = (over: any = {}) => ({ id: "ann_" + Math.random().toString(36).slice(2, 10), page: 1, type: "highlight", color: "yellow", x: 0.1, y: 0.2, w: 0.3, h: 0.05, ...over });

describe("annotation schema (strict, canonical, page-relative)", () => {
  it("accepts every tool and canonicalises numbers; unknown keys are dropped", () => {
    const set = normalizeAnnotations({ items: [
      box({ type: "text", text: "  Шалгах — хугацаа  ", fontSize: 10, evil: "x" }),
      box({ type: "rect", color: "red", strokeWidth: 2 }),
      box({ type: "arrow", points: [[0.1, 0.1], [0.4, 0.3]], strokeWidth: 2 }),
      box({ type: "pen", points: [[0.1, 0.1], [0.12, 0.13], [0.2, 0.2]] }),
      box({ type: "highlight" })
    ] });
    expect(set.version).toBe(1); expect(set.items).toHaveLength(5);
    expect(set.items[0].text).toBe("Шалгах - хугацаа"); // long dash replaced, trimmed (same rule as report text)
    expect((set.items[0] as any).evil).toBeUndefined();
    const arrow = set.items[2]; expect([arrow.x, arrow.y, arrow.w, arrow.h]).toEqual([0.1, 0.1, 0.3, 0.2]); // bounding box derived from the points
  });
  it("rejects out-of-page, tiny, duplicate, oversized and malformed input instead of clamping it", () => {
    const bad = (x: any) => expect(() => normalizeAnnotations(x)).toThrow();
    bad([box({ x: 0.9, w: 0.3 })]); bad([box({ w: 0.0001 })]); bad([box({ page: 4 })]); bad([box({ page: 0 })]); bad([box({ type: "script" })]); bad([box({ color: "pink" })]);
    bad([box({ x: -0.2 })]); bad([box({ y: NaN })]); bad([box({ x: true })]); bad([box({ type: "text", text: "   " })]); bad([box({ type: "text", text: "x".repeat(501) })]);
    bad([box({ type: "text", text: "a", fontSize: 40 })]); bad([box({ type: "arrow", points: [[0.1, 0.1]] })]); bad([box({ type: "arrow", points: [[0.1, 0.1], [0.1, 0.1]] })]);
    bad([box({ type: "pen", points: Array.from({ length: 401 }, () => [0.1, 0.1]) })]); bad([box({ type: "rect", strokeWidth: 9 })]);
    const a = box({ id: "same_id_1" }); bad([a, { ...a }]); bad("nope"); bad({ items: "x" });
    bad(Array.from({ length: MAX_ANNOTATIONS + 1 }, (_, i) => box({ id: "id_" + String(i).padStart(4, "0") })));
  });
  it("empty / absent input is the empty set", () => {
    expect(normalizeAnnotations(null).items).toEqual([]); expect(normalizeAnnotations([]).items).toEqual([]); expect(annotationsOf({}).items).toEqual([]);
  });
});

describe("PDF source identity", () => {
  it("a narrative without annotations produces a source with NO annotations key: historical source hashes cannot change", () => {
    for (const n of ["finance_weak", "finance_strong", "people_uncertain"]) {
      const f = fx(n);
      const s = buildReportPdfSource(f.payload, f.narrative);
      expect("annotations" in s).toBe(false);
      // The service removes the key when the set is empty, but even an explicit empty set must never add an `annotations` block to the source.
      const empty = buildReportPdfSource(f.payload, { ...f.narrative, visualAnnotations: { version: 1, items: [] } });
      expect("annotations" in empty).toBe(false);
      expect(reportPdfSourceHash(s)).toBe(reportPdfSourceHash(buildReportPdfSource(f.payload, f.narrative)));
    }
  });
  it("annotations change the source hash and are carried verbatim", () => {
    const f = fx("finance_weak"), set = normalizeAnnotations([box({ type: "text", text: "Тест", w: 0.3, h: 0.06 })]);
    const s = buildReportPdfSource(f.payload, { ...f.narrative, visualAnnotations: set });
    expect(s.annotations).toEqual(set);
    expect(reportPdfSourceHash(s)).not.toBe(reportPdfSourceHash(buildReportPdfSource(f.payload, f.narrative)));
  });
});

/** Decodes a PNG with the system Python (no extra dependency): returns RGB bytes and size. */
function pixels(png: Buffer): { w: number; h: number; rgb: Buffer } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ann-px-")); const f = path.join(dir, "a.png"); fs.writeFileSync(f, png);
  try {
    const out = execFileSync("python3", ["-c", "import sys;from PIL import Image;im=Image.open(sys.argv[1]).convert('RGB');sys.stdout.buffer.write(im.size[0].to_bytes(4,'big')+im.size[1].to_bytes(4,'big')+im.tobytes())", f], { maxBuffer: 64 * 1024 * 1024 });
    return { w: out.readUInt32BE(0), h: out.readUInt32BE(4), rgb: out.subarray(8) };
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
/** Fraction of pixels that differ inside the page-relative window [x0,x0+w]x[y0,y0+h] / outside of it. */
function diffShare(a: Buffer, b: Buffer, win: { x: number; y: number; w: number; h: number }) {
  const A = pixels(a), B = pixels(b); expect([A.w, A.h]).toEqual([B.w, B.h]);
  let inD = 0, inN = 0, outD = 0, outN = 0;
  for (let y = 0; y < A.h; y++) for (let x = 0; x < A.w; x++) {
    const i = (y * A.w + x) * 3, d = Math.abs(A.rgb[i] - B.rgb[i]) + Math.abs(A.rgb[i + 1] - B.rgb[i + 1]) + Math.abs(A.rgb[i + 2] - B.rgb[i + 2]) > 24;
    const inside = x / A.w >= win.x - 0.004 && x / A.w <= win.x + win.w + 0.004 && y / A.h >= win.y - 0.004 && y / A.h <= win.y + win.h + 0.004;
    if (inside) { inN++; if (d) inD++; } else { outN++; if (d) outD++; }
  }
  return { inside: inD / inN, outside: outD / outN, outCount: outD };
}

describe("renderer: annotations are drawn at their page-relative position and nowhere else (real renderer, 3 pages)", () => {
  it("a highlight on page 2 changes only its own window of page 2; pages 1 and 3 and the text layout are untouched", async () => {
    const f = fx("finance_strong");
    const base = await renderDraftPages(f.payload, f.narrative, "finance");
    const win = { x: 0.15, y: 0.30, w: 0.5, h: 0.04 };
    const set = normalizeAnnotations([box({ page: 2, type: "highlight", color: "red", ...win })]);
    const withHl = await renderDraftPages(f.payload, { ...f.narrative, visualAnnotations: set }, "finance");
    expect(base).toHaveLength(3); expect(withHl).toHaveLength(3);
    const p1 = diffShare(base[0], withHl[0], win), p2 = diffShare(base[1], withHl[1], win), p3 = diffShare(base[2], withHl[2], win);
    expect(p1.inside + p1.outside + p3.inside + p3.outside).toBe(0);
    expect(p2.inside).toBeGreaterThan(0.6); // the window is actually tinted
    expect(p2.outCount).toBe(0); // nothing else moved or changed
  }, 120_000);
  it("text, arrow, pen and rect all render; the page count stays exactly 3 and the original text is intact", async () => {
    const f = fx("finance_strong");
    const set = normalizeAnnotations([
      box({ page: 1, type: "text", text: "Анхаарах: тестийн тэмдэглэл", x: 0.55, y: 0.5, w: 0.35, h: 0.06, color: "blue" }),
      box({ page: 1, type: "arrow", points: [[0.5, 0.52], [0.3, 0.45]], color: "red" }),
      box({ page: 3, type: "pen", points: [[0.2, 0.6], [0.3, 0.62], [0.4, 0.6]], color: "green" }),
      box({ page: 3, type: "rect", x: 0.1, y: 0.7, w: 0.2, h: 0.05, color: "orange" })
    ]);
    const base = await renderDraftPages(f.payload, f.narrative, "finance"), out = await renderDraftPages(f.payload, { ...f.narrative, visualAnnotations: set }, "finance");
    expect(out).toHaveLength(3);
    expect(diffShare(base[0], out[0], { x: 0.28, y: 0.44, w: 0.65, h: 0.13 }).outCount).toBe(0);
    expect(diffShare(base[2], out[2], { x: 0.09, y: 0.59, w: 0.33, h: 0.17 }).outCount).toBe(0);
    expect(diffShare(base[1], out[1], { x: 0, y: 0, w: 0, h: 0 }).outCount).toBe(0);
  }, 120_000);
});
