/* Behaviour of the supplementary Hunspell mn_MN spelling check on normal Mongolian business text (needs the system dictionary). Run: npx tsx scripts/hunspell-spellcheck-unit.ts */
import { spellcheckText, dictionaryPresent } from "../src/services/spellcheck.js";
let pass = 0, fail = 0; const t = (n: string, ok: boolean, d = "") => { ok ? pass++ : fail++; console.log((ok ? "PASS " : "FAIL ") + n + (d ? " | " + d : "")); };
async function main() {
  t("dictionary mn_MN present", dictionaryPresent());
  const clean = await spellcheckText([
    "Таны байгууллагын санхүүгийн удирдлага тогтвортой байгаа боловч мөнгөн урсгалын төлөвлөгөө сул байна.",
    "Харилцагчийн төлбөрийн нөхцөлийг шинэчилнэ. Албан тушаалтны үүрэг хариуцлага тодорхойгүй байна.",
    "Системийн нөөцлөлт, цахим аюулгүй байдлын бодлого баталсан боловч хэрэгжилтийн хяналт сул.",
    "Эрсдэлийг бууруулах түвшин хангалтгүй тул брэндийн стратегийг сайжруулна. Монгол сургууль."]);
  t("normal business text: no false positives (incl. accepted terms эрсдэл, түвшин, брэнд)", clean.available && clean.issues.length === 0 && clean.checked > 25, JSON.stringify(clean.issues));
  const typo = await spellcheckText(["Борлуулалтын сувгийн ашигт ажиллагааг сайжруулах шаардлагтай. Алдаатайүг үг орсон."]);
  t("typos are reported with suggestions (proposals only)", typo.issues.some(i => i.word.toLowerCase() === "алдаатайүг") && typo.issues.some(i => i.word === "шаардлагтай") && typo.issues.every(i => Array.isArray(i.suggestions)), JSON.stringify(typo.issues.map(i => i.word)));
  const names = await spellcheckText(["Манай компани Энхбаяр ХХК-тай хамтран Дархан хотод ажиллаж байна."]);
  t("capitalised names inside a sentence are not flagged", names.issues.length === 0, JSON.stringify(names.issues));
  const latin = await spellcheckText(["KPI болон ERP систем 2026 онд 100% нэвтэрнэ."]);
  t("numbers, Latin words and symbols are ignored", latin.available && !latin.issues.some(i => /[A-Za-z0-9]/.test(i.word)));
  const empty = await spellcheckText(["", "12345 ..."]);
  t("empty input is a clean no-op", empty.available && empty.checked === 0 && empty.issues.length === 0);
  console.log(`\nRESULT pass=${pass} fail=${fail}`); process.exit(fail ? 1 : 0);
}
void main();
