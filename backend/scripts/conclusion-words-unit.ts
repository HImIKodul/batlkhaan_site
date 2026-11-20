/* Executive-conclusion length contract (80-160 words, validator V27): counting parity and message text. Run: npx tsx scripts/conclusion-words-unit.ts */
import { conclusionWordCount, CONCLUSION_WORDS, validationMessageMn } from "../src/api/admin/review-service.js";
let pass = 0, fail = 0; const t = (n: string, ok: boolean, d = "") => { ok ? pass++ : fail++; console.log((ok ? "PASS " : "FAIL ") + n + (d ? " | " + d : "")); };
const words = (n: number) => Array.from({ length: n }, (_, i) => ["Байгууллагын", "санхүүгийн", "удирдлага", "тогтвортой", "ӨӨӨ", "үүнийг"][i % 6]).join(" ");
t("contract constants are 80 and 160", CONCLUSION_WORDS.min === 80 && CONCLUSION_WORDS.max === 160);
for (const [n, inRange] of [[79, false], [80, true], [120, true], [160, true], [161, false]] as const) t(`${n} Mongolian words -> ${inRange ? "accepted" : "rejected"} range`, conclusionWordCount(words(n)) === n && (n >= 80 && n <= 160) === inRange);
t("leading/trailing blanks, tabs, newlines and NBSP-free separators are counted like the validator", conclusionWordCount("  а\tб\nв   г  ") === 4 && conclusionWordCount("   ") === 0 && conclusionWordCount("") === 0);
t("Cyrillic letters Ө and Ү count as ordinary letters", conclusionWordCount("Өнөөдөр Үнэлгээ Өсөлт") === 3);
t("punctuation attached to a word does not add words", conclusionWordCount("Хэмжүүр: «Нотолгоо», 12 сар.") === 4);
const m = validationMessageMn([{ checkId: "V27", message: "Executive conclusion should stay within 80–160 words (163)." }]);
t("approval error for V27 is plain Mongolian with the current count", /80-160 үгтэй/.test(m) && /163 үг/.test(m) && /дахин хадгална/.test(m), m);
t("other validation failures keep the generic Mongolian message", /засвар шаардлагатай/.test(validationMessageMn([{ checkId: "V13", message: "x" }])));
console.log(`\nRESULT pass=${pass} fail=${fail}`); process.exit(fail ? 1 : 0);
