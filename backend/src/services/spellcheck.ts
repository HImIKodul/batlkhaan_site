/* Supplementary Mongolian spelling check with the system Hunspell `mn_MN` dictionary (installed by the owner; never reinstalled here).
   It checks SPELLING of single words only. It does not judge grammar, meaning or style, and it never rewrites text: every result is a proposal the administrator may accept.
   Conservative on purpose: only Cyrillic words of 3+ letters are looked up; numbers, Latin words, abbreviations and capitalised proper names are skipped; at most 40 distinct words are reported. */
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";

export interface SpellIssue { word: string; suggestions: string[]; }
export interface SpellResult { available: boolean; checked: number; issues: SpellIssue[]; reason?: string; }
const DICT = (process.env.MMRI_HUNSPELL_DICT ?? "mn_MN").replace(/[^A-Za-z_]/g, "");
const WORD = /[А-Яа-яӨөҮүЁё]{3,}/gu;
/* Modern business vocabulary and accepted orthographic variants that the Hunspell dictionary does not contain (verified against the 61,440 protected questions: these words
   are used consistently). Matching words are never reported, so the checker does not push the dictionary's unrelated suggestions (e.g. «эрсдэл» -> «эрстэл»). */
const ACCEPTED_STEMS = ["эрсдэл", "эрсдл", "брэнд", "түвшин", "түвшн", "програм", "вэбсайт", "вэб", "апп", "админ", "инноваци", "сегментчл", "интернэт", "мобайл", "кьюпэй", "чадавх", "харагдац", "зөрүү", "демо", "хэш", "рүү", "бүрт", "цэнийн"];
const accepted = (w: string) => { const l = w.toLowerCase(); return ACCEPTED_STEMS.some(st => l.startsWith(st)); };

/* Dictionary location: MMRI_HUNSPELL_DIR, else the copy bundled with the release (resources/hunspell, LPPL 1.3 notice alongside), else the Debian system path.
   The hunspell executable itself is a server prerequisite: MMRI_HUNSPELL_BIN (default "hunspell" on PATH). Without either, the scan reports the check as unavailable. */
const BUNDLED_DIR = path.resolve(process.cwd(), "resources", "hunspell");
const DICT_DIR = process.env.MMRI_HUNSPELL_DIR?.trim() || (fs.existsSync(path.join(BUNDLED_DIR, `${DICT}.dic`)) ? BUNDLED_DIR : "/usr/share/hunspell");
const HUNSPELL_BIN = process.env.MMRI_HUNSPELL_BIN?.trim() || "hunspell";

export function dictionaryPresent(): boolean { return fs.existsSync(path.join(DICT_DIR, `${DICT}.dic`)) && fs.existsSync(path.join(DICT_DIR, `${DICT}.aff`)); }

export async function spellcheckText(texts: string[]): Promise<SpellResult> {
  if (!dictionaryPresent()) return { available: false, checked: 0, issues: [], reason: "mn_MN толь бичиг олдсонгүй" };
  const words = new Set<string>();
  for (const t of texts) for (const m of t.matchAll(WORD)) {
    const w = m[0], i = m.index ?? 0;
    const atSentenceStart = i === 0 || /[.!?]\s*$/.test(t.slice(Math.max(0, i - 3), i));
    // Capitalised words in mid-sentence are treated as names (companies, people, places) and not flagged.
    if (/^[А-ЯӨҮЁ]/u.test(w) && !atSentenceStart) continue;
    if (!accepted(w)) words.add(w);
  }
  const list = [...words].slice(0, 600);
  if (!list.length) return { available: true, checked: 0, issues: [] };
  const out = await new Promise<string | null>(resolve => {
    let buf = ""; let done = false;
    const p = spawn(HUNSPELL_BIN, ["-d", path.join(DICT_DIR, DICT), "-a"], { stdio: ["pipe", "pipe", "ignore"] });
    const timer = setTimeout(() => { if (!done) { done = true; p.kill(); resolve(null); } }, 6000);
    p.stdout.on("data", d => { buf += d.toString("utf8"); });
    p.on("error", () => { if (!done) { done = true; clearTimeout(timer); resolve(null); } });
    p.on("close", () => { if (!done) { done = true; clearTimeout(timer); resolve(buf); } });
    // One word per line; hunspell -a answers one line per input line (words never start with a command character because they are Cyrillic letters only).
    p.stdin.end(list.join("\n") + "\n");
  });
  if (out === null) return { available: false, checked: 0, issues: [], reason: "Hunspell ажиллаагүй" };
  const issues: SpellIssue[] = [];
  for (const line of out.split("\n")) {
    const m = /^[&#]\s+(\S+)\s+(?:\d+\s+)?(?:\d+)?:?\s*(.*)$/u.exec(line);
    if (!m) continue;
    issues.push({ word: m[1], suggestions: line.startsWith("&") ? m[2].split(",").map(s => s.trim()).filter(Boolean).slice(0, 4) : [] });
    if (issues.length >= 40) break;
  }
  return { available: true, checked: list.length, issues };
}
