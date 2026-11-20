/* "AI шалгах": findings for the three-page report. Layers, each labelled with its real status:
   1. LOCAL rules (always run): duplicates, terminology, wrong domain name, certainty on thin evidence, contradictions, plan completeness, awkward length.
   2. HUNSPELL mn_MN spelling (supplementary, spelling only).
   3. AI (only when MMRI_AI_SCAN_PROVIDER=openai and the provider answers): proposals only. If it is off or unavailable the result says so; a check is never reported as passed unless it ran.
   Nothing here edits text, scores or evidence; every finding is a proposal the administrator accepts or rejects. */
import { spellcheckText } from "../../services/spellcheck.js";

export interface ScanClaim { claimId: string; sectionId: string; text: string; }
export interface ScanFinding { id: string; claimId: string | null; layer: "LOCAL" | "SPELLING" | "AI"; kind: string; severity: "info" | "warn" | "high"; message: string; original?: string; suggestion?: string; }
export interface ScanContext { domainCode: string; companyName: string; coverage: number | null; strengths: string[]; weaknesses: string[]; expectedPriorities: number; }
export interface ScanResult { findings: ScanFinding[]; layers: { local: "RAN"; spelling: "RAN" | "UNAVAILABLE"; ai: "RAN" | "UNAVAILABLE" | "NOT_ENABLED"; aiDetail: string | null; spellingDetail: string | null }; checkedClaims: number; checkedWords: number; }

const DOMAIN_WORDS: Record<string, string[]> = { marketing: ["маркетинг"], it: ["мэдээллийн технологи"], finance: ["санхүү"], people: ["хүний нөөц"], operations: ["үйлдвэрлэл"] };
const CERTAIN = /(бүрэн нотлогдсон|эргэлзээгүй|баттай|100\s?%|ямар ч асуудалгүй|төгс|тодорхой нотолсон)/i;
let aiDownUntil = 0, aiLastDetail: string | null = null;
let n = 0; const fid = () => `f${++n}`;

export function localFindings(claims: ScanClaim[], ctx: ScanContext): ScanFinding[] {
  const out: ScanFinding[] = [];
  const seen = new Map<string, string>(); const dups = new Map<string, { claimId: string; s: string; count: number }>();
  for (const c of claims) {
    const t = c.text.trim();
    for (const s of t.split(/(?<=[.!?])\s+/).map(x => x.trim()).filter(x => x.length > 25)) {
      const key = s.toLowerCase().replace(/\s+/g, " ");
      const prev = seen.get(key);
      if (prev) { const d = dups.get(key); if (d) d.count++; else dups.set(key, { claimId: c.claimId, s, count: 2 }); }
      seen.set(key, prev ?? c.claimId);
      if (s.split(/\s+/).length > 45) out.push({ id: fid(), claimId: c.claimId, layer: "LOCAL", kind: "long_sentence", severity: "info", message: "Өгүүлбэр хэт урт (45 үгээс их). Хоёр өгүүлбэрт хуваахыг санал болгоно.", original: s });
    }
    const dw = t.match(/\b(\p{L}{2,})\s+\1\b/iu); if (dw) out.push({ id: fid(), claimId: c.claimId, layer: "LOCAL", kind: "repeated_word", severity: "warn", message: `«${dw[1]}» үг дараалан давтагдсан байна.`, original: dw[0], suggestion: t.replace(dw[0], dw[1]) });
    if (/хүчтэй тал|анхаарах тал/i.test(t)) out.push({ id: fid(), claimId: c.claimId, layer: "LOCAL", kind: "terminology", severity: "high", message: "Нэр томьёо: «давуу тал» / «сул тал» гэж нэгдсэн хэрэглээтэй.", suggestion: t.replace(/хүчтэй тал/gi, "давуу тал").replace(/анхаарах тал/gi, "сул тал") });
    if (/\bKPI\b/.test(t)) out.push({ id: fid(), claimId: c.claimId, layer: "LOCAL", kind: "terminology", severity: "info", message: "Англи товчлол: «гүйцэтгэлийн үзүүлэлт» гэж монголоор бичихийг санал болгоно.", suggestion: t.replace(/\bKPI\b/g, "гүйцэтгэлийн үзүүлэлт") });
    if (/[—―]/.test(t)) out.push({ id: fid(), claimId: c.claimId, layer: "LOCAL", kind: "terminology", severity: "warn", message: "Урт зураас ашиглахгүй (хоосон зайтай богино зураас болгоно).", suggestion: t.replace(/\s*[—―]\s*/g, " - ") });
    if (/\s{2,}/.test(t) || /\s[,.;:!?]/.test(t)) out.push({ id: fid(), claimId: c.claimId, layer: "LOCAL", kind: "spacing", severity: "info", message: "Илүү хоосон зай эсвэл тэмдэгтийн өмнөх зай байна.", suggestion: t.replace(/\s{2,}/g, " ").replace(/\s+([,.;:!?])/g, "$1") });
    if (t.length > 20 && !/[.!?…”"»)]$/.test(t)) out.push({ id: fid(), claimId: c.claimId, layer: "LOCAL", kind: "punctuation", severity: "info", message: "Өгүүлбэр цэгээр төгсөөгүй байна." });
    // wrong domain name: another domain's name in this domain's report
    for (const [d, words] of Object.entries(DOMAIN_WORDS)) if (d !== ctx.domainCode && words.some(w => new RegExp(`${w}[а-яөү]*\\s+(чиглэл|менежмент|оношилгоо)`, "i").test(t)))
      out.push({ id: fid(), claimId: c.claimId, layer: "LOCAL", kind: "domain_name", severity: "high", message: "Энэ тайлан өөр чиглэлийн нэр дурдсан байна. Чиглэл зөв эсэхийг шалгана уу.", original: t.slice(0, 120) });
    if (ctx.coverage !== null && ctx.coverage < 0.5 && CERTAIN.test(t)) out.push({ id: fid(), claimId: c.claimId, layer: "LOCAL", kind: "certainty", severity: "high", message: `Нотолгооны хамрах хүрээ бага (${Math.round(ctx.coverage * 100)}%) тул «баттай/бүрэн» гэсэн хэт итгэлтэй үг тохирохгүй.`, original: t.slice(0, 120) });
  }
  for (const d of dups.values()) out.push({ id: fid(), claimId: d.claimId, layer: "LOCAL", kind: "duplicate", severity: "warn", message: `Ижил өгүүлбэр тайланд ${d.count} удаа давтагдсан байна. Давхардлыг багасгахыг санал болгоно.`, original: d.s });
  const both = ctx.strengths.filter(s => ctx.weaknesses.includes(s));
  if (both.length) out.push({ id: fid(), claimId: null, layer: "LOCAL", kind: "contradiction", severity: "high", message: `Нэг чадавх давуу ба сул талд зэрэг орсон байна: ${both.slice(0, 2).join(", ")}.` });
  const priorities = claims.filter(c => c.sectionId === "S06").length;
  if (ctx.expectedPriorities > 0 && priorities < ctx.expectedPriorities) out.push({ id: fid(), claimId: null, layer: "LOCAL", kind: "plan_incomplete", severity: "high", message: `Тэргүүлэх ажлын тайлбар ${priorities}/${ctx.expectedPriorities} байна. Төлөвлөгөөг бүрдүүлнэ үү.` });
  if (ctx.companyName && claims.some(c => /ХХК|ХК/.test(c.text)) && !claims.some(c => c.text.includes(ctx.companyName)) && claims.some(c => /«[^»]{3,40}»\s*(ХХК|ХК)/.test(c.text)))
    out.push({ id: fid(), claimId: null, layer: "LOCAL", kind: "company_name", severity: "high", message: "Тайланд дурдсан байгууллагын нэр бүртгэлтэй нэртэй таарахгүй байж болзошгүй." });
  return out;
}

async function aiFindings(claims: ScanClaim[], ctx: ScanContext): Promise<{ state: "RAN" | "UNAVAILABLE" | "NOT_ENABLED"; detail: string | null; findings: ScanFinding[] }> {
  const provider = (process.env.MMRI_AI_SCAN_PROVIDER ?? "off").trim().toLowerCase(), key = (process.env.OPENAI_API_KEY ?? "").trim(), model = (process.env.MMRI_AI_SCAN_MODEL ?? process.env.MMRI_AI_REPORT_MODEL ?? "").trim();
  if (provider !== "openai") return { state: "NOT_ENABLED", detail: "AI шалгалт идэвхжээгүй (MMRI_AI_SCAN_PROVIDER). Зөвхөн дотоод шалгалт ажиллав.", findings: [] };
  if (!key || !model) return { state: "UNAVAILABLE", detail: "OpenAI түлхүүр эсвэл загвар тохируулагдаагүй.", findings: [] };
  if (Date.now() < aiDownUntil) return { state: "UNAVAILABLE", detail: aiLastDetail ?? "AI түр ажиллахгүй.", findings: [] };
  try {
    const body = { model, input: [{ role: "system", content: "Монгол хэлний редактор. Дараах тайлангийн мөрүүдэд зөвхөн зөв бичих, найруулга, давхардал, зөрчил, нотолгоогүй мэдэгдэл, чиглэл/байгууллагын нэрийн алдааг ол. Оноо, тоо, нотолгоог өөрчлөхгүй. JSON массив буцаа: [{claimId,kind,message,suggestion}]. Санал болгох текст эх агуулгыг хадгалсан байх ёстой." }, { role: "user", content: JSON.stringify({ domain: ctx.domainCode, claims: claims.slice(0, 30).map(c => ({ claimId: c.claimId, text: c.text.slice(0, 700) })) }) }], max_output_tokens: 1800 };
    const r = await fetch((process.env.MMRI_AI_REPORT_ENDPOINT ?? "https://api.openai.com/v1/responses").trim(), { method: "POST", redirect: "error", signal: AbortSignal.timeout(25_000), headers: { authorization: `Bearer ${key}`, "content-type": "application/json" }, body: JSON.stringify(body) });
    if (!r.ok) { aiLastDetail = r.status === 429 ? "AI үйлчилгээ түр ашиглах боломжгүй (хязгаар/төлбөр дууссан, HTTP 429)." : `AI үйлчилгээ алдаа буцаалаа (HTTP ${r.status}).`; aiDownUntil = Date.now() + 10 * 60_000; return { state: "UNAVAILABLE", detail: aiLastDetail, findings: [] }; }
    const j: any = await r.json(); const txt = String(j?.output_text ?? j?.output?.[0]?.content?.[0]?.text ?? "");
    const arr = JSON.parse(txt.slice(txt.indexOf("["), txt.lastIndexOf("]") + 1) || "[]");
    const ids = new Set(claims.map(c => c.claimId)); const nums = (t: string) => new Set(t.match(/\d+(?:[.,]\d+)?/g) ?? []);
    const findings: ScanFinding[] = [];
    for (const a of Array.isArray(arr) ? arr.slice(0, 40) : []) {
      if (!ids.has(String(a.claimId))) continue;
      const orig = claims.find(c => c.claimId === a.claimId)!.text; let sug = typeof a.suggestion === "string" ? a.suggestion.trim() : undefined;
      // a proposal that introduces a number or is wildly longer is dropped: evidence and scores are never changed by wording help
      if (sug && ([...nums(sug)].some(x => !nums(orig).has(x)) || sug.length > orig.length * 1.6 + 60)) sug = undefined;
      findings.push({ id: fid(), claimId: String(a.claimId), layer: "AI", kind: String(a.kind ?? "ai").slice(0, 30), severity: "info", message: String(a.message ?? "").slice(0, 300), original: orig, suggestion: sug });
    }
    return { state: "RAN", detail: null, findings };
  } catch { aiLastDetail = "AI үйлчилгээтэй холбогдож чадсангүй."; aiDownUntil = Date.now() + 2 * 60_000; return { state: "UNAVAILABLE", detail: aiLastDetail, findings: [] }; }
}

export async function scanReport(claims: ScanClaim[], ctx: ScanContext): Promise<ScanResult> {
  const findings = localFindings(claims, ctx);
  const sp = await spellcheckText(claims.map(c => c.text));
  const byWord = new Map<string, ScanClaim>();
  for (const c of claims) for (const w of c.text.match(/[А-Яа-яӨөҮүЁё]{3,}/gu) ?? []) if (!byWord.has(w)) byWord.set(w, c);
  for (const i of sp.issues) { const c = byWord.get(i.word); if (!c) continue;
    findings.push({ id: fid(), claimId: c.claimId, layer: "SPELLING", kind: "spelling", severity: "info", message: `«${i.word}» үг толь бичигт олдсонгүй${i.suggestions.length ? `. Санал: ${i.suggestions.join(", ")}` : ""}.`, original: i.word, suggestion: i.suggestions[0] ? c.text.replace(new RegExp(`(?<![А-Яа-яӨөҮүЁё])${i.word}(?![А-Яа-яӨөҮүЁё])`, "u"), i.suggestions[0]) : undefined }); }
  const ai = await aiFindings(claims, ctx); findings.push(...ai.findings);
  return { findings, layers: { local: "RAN", spelling: sp.available ? "RAN" : "UNAVAILABLE", ai: ai.state, aiDetail: ai.detail, spellingDetail: sp.reason ?? null }, checkedClaims: claims.length, checkedWords: sp.checked };
}
