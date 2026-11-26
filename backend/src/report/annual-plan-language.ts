/* Text rules for the 12-month plan (pure functions, no model, no database). They judge the WORDING of a draft; schedule, references and coverage stay in annual-plan.ts.
   Thresholds were calibrated on 30 saved real-model drafts (scripts/qa-plan-real-model-corpus.mts). They approximate naturalness; they do not replace a native reader. */
export interface LanguageIssue { checkId: string; message: string }
interface TextStage { id: string; startDay: number; durationDays: number; headingMn: string; dependencyNoteMn: string | null; actions: Array<{ textMn: string }> }

const quote = (t: string) => `"${t.length > 90 ? `${t.slice(0, 87)}...` : t}"`;
const lettersOnly = (t: string) => t.toLowerCase().replace(/[^\p{L}\s]/gu, " ").split(/\s+/).filter(Boolean);
export const planSentences = (t: string): string[] => String(t).split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean);
/** Mongolian adds case endings to the stem, so comparisons use the first five letters. */
export const planStems = (t: string): Set<string> => new Set(lettersOnly(t).filter(w => w.length >= 5).map(w => w.slice(0, 5)));
/** Stems that occur in almost any business sentence and therefore say nothing about a particular capability. */
export const COMMON_STEMS = new Set(["чадва", "чадам", "удирд", "тогто", "хэрэг", "байдл", "байда", "мэдээ", "хянах", "хянал", "эсэхи", "эсэхд", "ажлын", "ажлыг", "ажилд", "тухай", "хамаа", "шийдв", "хүрэл", "сайжр", "бэхжү", "төлөв", "зорил", "үнэлг", "үнэлэ", "үндэс", "байгу", "компа", "бүрий", "тодор", "холбо", "хооро", "чиглэ", "асууд", "систе", "хөгжү"]);

/** The plan describes what the company does ("тогтооно"); bare commands ("тогтоо") read as orders to the owner and mixing both reads as machine text. */
const FINITE = /(?:на|нэ|но|нө|юм|ёстой|хэрэгтэй|шаардлагатай|боломжтой|зүйтэй|чухал|мөн|биш|бий|вэ|гүй|тай|тэй|той|даг|дэг|дог|дөг|сан|сэн|сон|сөн|лаа|лээ|лоо|лөө|жээ|чээ)$/;
const endsFinite = (s: string) => { const w = lettersOnly(s); return !w.length || FINITE.test(w[w.length - 1]); };

const L = "(?<!\\p{L})";
const NUMERAL = "(?:нэг|хоёр|гурав|гурван|дөрөв|дөрвөн|тав|таван|зургаан|долоон|найман|есөн|арав|арван|хорин|хорь|гучин|дөчин|тавин|жаран|далан|наян|ерэн|зуун)";
const UNSUPPORTED: Array<[RegExp, string]> = [
  [new RegExp(`${L}${NUMERAL}\\s+(?:хув|төгрөг|сая|тэрбум)`, "iu"), "an amount or percentage written in words"],
  [/\d\s*(?:%|хув|₮|төгрөг|сая|тэрбум)|(?:₮|\$)\s*\d|%/iu, "an amount or percentage"],
  [new RegExp(`${L}(?:хоёр|гурван|дөрвөн|таван|зургаан|долоон|найман|есөн|арван)\\s+(?:ажилтан|ажилтны|мэргэжилт|инженер|менежер)`, "iu"), "a number of staff"],
  [new RegExp(`${L}(?:шинээр|нэмж|нэмэлт|шинэ)\\s+(?:\\p{L}+\\s+)?(?:ажилтан|мэргэжилтэн|менежер|орон тоо)`, "iu"), "new staff or positions"],
  [/баталгаатай (?:өс|нэмэгд|сайжир|буур)|заавал (?:өснө|нэмэгдэнэ|сайжирна)/iu, "a promised result"],
];
/** Ceremonial compliance wording that the owner rejected; the same thoughts can be said plainly. */
const CEREMONIAL: RegExp[] = [/нотолгооны зам/iu, /хүчинтэй шууд нотолгоо/iu, /нотолгоог? бүрдүүл/iu, /нотолгоо бүрд/iu, /ажлыг хэрэгжүүлэх ажлыг/iu, /удирдлагыг сайжруулах ажлыг/iu, /(?:Хариуцах|Ажлын хэмжүүр|Төлөв|Хариуцагч|Хэмжүүр)\s*:/u, /сул гэж (?:үнэлэгд|дүгнэгд)/iu];

export function checkPlanLanguage(stages: TextStage[], windowDays: number, names: string[]): LanguageIssue[] {
  const issues: LanguageIssue[] = []; const bad = (checkId: string, message: string) => issues.push({ checkId, message });
  const acts = stages.flatMap(s => (s.actions ?? []).map(a => ({ stage: s, text: String(a?.textMn ?? "") })));
  const all = acts.flatMap(a => planSentences(a.text).map(text => ({ stage: a.stage, text })));

  for (const s of stages) for (const t of [s.headingMn, s.dependencyNoteMn ?? "", ...(s.actions ?? []).map(a => a?.textMn ?? "")]) {
    for (const [rx, what] of UNSUPPORTED) if (rx.test(String(t))) bad("UNSUPPORTED_CLAIM", `${s.id} states ${what} that the diagnosis does not contain: ${quote(String(t))}`);
  }
  let ceremonial = 0; for (const { text } of all) if (CEREMONIAL.some(rx => rx.test(text))) ceremonial++;
  for (const { stage, text } of all) if (/нотолгооны зам|хүчинтэй шууд нотолгоо|нотолгоог? бүрдүүл|(?:Хариуцах|Ажлын хэмжүүр|Төлөв|Хариуцагч|Хэмжүүр)\s*:/iu.test(text)) bad("ROBOTIC_PHRASE", `Compliance wording in ${stage.id}, say it plainly: ${quote(text)}`);
  if (ceremonial >= 3) bad("ROBOTIC_PHRASE", `${ceremonial} sentences restate the diagnosis or use compliance wording; say what the company does instead`);

  /* The plan is read as flowing text: no label-and-colon headings, no colon before a list. Clock times such as 10:30 are not colons in this sense. */
  for (const s of stages) for (const t of [s.headingMn, s.dependencyNoteMn ?? "", ...(s.actions ?? []).map(a => a?.textMn ?? "")]) if (/(?<!\d)[:：]|[:：](?!\d)/u.test(String(t))) bad("COLON", `${s.id} uses a colon, write a full sentence instead: ${quote(String(t))}`);

  const orders = all.filter(x => !endsFinite(x.text));
  if (orders.length >= 2 && orders.length > all.length * 0.15) bad("VERB_FORM", `${orders.length} of ${all.length} sentences end in a bare command or an unfinished form; write what the company does ("тогтооно", "харьцуулна"), for example the sentence ending "...${orders[0].text.slice(-60)}"`);

  /* One opening word, or one three-word phrase, carried through the plan is the clearest sign of template text. Capability names are excluded: naming them is required. */
  const openers = new Map<string, number>(); for (const { text } of all) { const w = lettersOnly(text)[0]; if (w) openers.set(w, (openers.get(w) ?? 0) + 1); }
  for (const [w, n] of openers) if (n >= 4 && n > all.length * 0.22) bad("FORMULAIC", `${n} of ${all.length} sentences begin with "${w}"; vary the sentence openings`);
  const named = names.map(n => lettersOnly(n).join(" "));
  const phrases = new Map<string, Set<number>>();
  acts.forEach((a, i) => { const w = lettersOnly(a.text); for (let k = 0; k + 3 <= w.length; k++) { const g = w.slice(k, k + 3).join(" "); if (named.some(n => n.includes(g))) continue; if (!phrases.has(g)) phrases.set(g, new Set()); phrases.get(g)!.add(i); } });
  const worn = [...phrases].filter(([, set]) => set.size >= 4 && set.size > acts.length * 0.35).sort((a, b) => b[1].size - a[1].size)[0];
  if (worn) bad("FORMULAIC", `"${worn[0]}" is used in ${worn[1].size} of ${acts.length} actions; say it once and write each action differently`);

  /* The same recommendation under another title: after removing the capability names, what is left of two actions is nearly the same. */
  const nameStems = new Set(names.flatMap(n => [...planStems(n)]));
  const core = acts.map(a => new Set([...planStems(a.text)].filter(x => !nameStems.has(x))));
  for (let i = 0; i < core.length; i++) for (let j = i + 1; j < core.length; j++) {
    const small = Math.min(core[i].size, core[j].size); if (small < 5) continue;
    const inter = [...core[i]].filter(x => core[j].has(x)).length;
    if (inter / (core[i].size + core[j].size - inter) >= 0.6) bad("SAME_ADVICE", `Actions in ${acts[i].stage.id} and ${acts[j].stage.id} give the same advice under different names; merge them or make each specific: ${quote(acts[j].text)}`);
  }

  for (const s of stages) for (const a of s.actions ?? []) {
    const t = String(a?.textMn ?? "");
    if (s.startDay > 31 && /эхний (?:сард|долоо хоног)/iu.test(t)) bad("TIME_REFERENCE", `${s.id} starts later but speaks of the first month or week: ${quote(t)}`);
    if (s.startDay + s.durationDays < windowDays - 60 && /жилийн (?:эцэст|эцсээр|төгсгөлд)/iu.test(t)) bad("TIME_REFERENCE", `${s.id} ends long before the end of the year but speaks of the end of the year: ${quote(t)}`);
  }
  return issues;
}
