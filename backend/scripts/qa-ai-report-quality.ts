/* AI report quality + integration harness (bounded, synthetic data only).
   Runs the REAL configured provider (OpenAI Responses API through createNarrativeProviderFromEnv) on frozen report payloads that were produced by isolated QA runs
   (synthetic companies, no customer data), and compares it with the deterministic fallback. Hard call budget; credentials are read from the server environment file
   but only the three AI variables are used and nothing secret is printed or stored. Never touches a database.
   Usage: MMRI_AI_QA_MAX_CALLS=12 MMRI_AI_QA_CASES=it_strong,finance_weak tsx scripts/qa-ai-report-quality.ts <matrix-dir> <out-dir> */
import fs from "node:fs";
import path from "node:path";
import { createNarrativeProviderFromEnv } from "../src/api/ai-report-provider.js";
import { generateValidatedNarrative, type NarrativeProvider } from "../src/report/coordinator.js";
import { validateNarrativeDraft } from "../src/report/validator.js";
import { checkPdfLayoutBudget } from "../src/report/pdf-budget.js";
import { renderDraftPages } from "../src/report/draft-preview.js";
import type { FrozenReportPayload, NarrativeDraft, NarrativeProviderResult } from "../src/report/types.js";

const [matrixDir, outDir] = process.argv.slice(2);
if (!matrixDir || !outDir) throw new Error("usage: <matrix-dir> <out-dir>");
// Only the three AI variables are taken from the server environment file; everything else in it (database URL, secrets) is ignored.
const envFile = path.resolve(process.cwd(), ".env");
if (fs.existsSync(envFile)) for (const line of fs.readFileSync(envFile, "utf8").split("\n")) {
  const m = /^(OPENAI_API_KEY|MMRI_AI_REPORT_MODEL|MMRI_AI_REPORT_ENDPOINT)=(.*)$/.exec(line.trim());
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}
process.env.MMRI_AI_REPORT_PROVIDER = "openai"; process.env.MMRI_AI_REPORT_REQUIRED = "false";
const provider = createNarrativeProviderFromEnv("integration");
if (!provider) throw new Error("AI provider is not configured in this environment (OPENAI_API_KEY / MMRI_AI_REPORT_MODEL missing)");

const MAX_CALLS = Number(process.env.MMRI_AI_QA_MAX_CALLS ?? 12);
const CASES = (process.env.MMRI_AI_QA_CASES ?? "finance_weak,it_strong,people_mixed,operations_uncertain,marketing_mixed,finance_uncertain").split(",");
let httpCalls = 0, inTokens = 0, outTokens = 0;

/** Counts every HTTP attempt and token the provider reports; refuses to go over the budget. */
const metered: NarrativeProvider = {
  metadata: provider.metadata,
  async generate(p) { if (httpCalls >= MAX_CALLS) throw new Error("AI QA call budget exhausted"); return track(await provider.generate(p)); },
  repair: provider.repair ? async (p, d, v) => { if (httpCalls >= MAX_CALLS) throw new Error("AI QA call budget exhausted"); return track(await provider.repair!(p, d, v)); } : undefined
};
function track(r: NarrativeDraft | NarrativeProviderResult) {
  const t = (r as NarrativeProviderResult).telemetry; httpCalls += t?.httpAttempts ?? 1; inTokens += t?.usage?.inputTokens ?? 0; outTokens += t?.usage?.outputTokens ?? 0; return r;
}

const words = (s: string) => (s.match(/[\p{L}\p{N}]+/gu) ?? []).length;
const flat = (n: NarrativeDraft) => n.sections.flatMap(s => s.claims.map(c => ({ s: s.id, t: c.textMn })));
function metrics(payload: FrozenReportPayload, n: NarrativeDraft) {
  const claims = flat(n), text = claims.map(c => c.t).join(" ");
  const letters = (text.match(/\p{L}/gu) ?? []), cyr = letters.filter(ch => /[Ѐ-ӿ]/.test(ch)).length;
  const sentences = text.split(/(?<=[.!?])\s+/).map(x => x.trim().toLowerCase()).filter(x => x.length > 20);
  const dupSentences = sentences.length - new Set(sentences).size;
  const conclusion = claims.find(c => c.s === "S10")?.t ?? claims.find(c => c.s === "S01")?.t ?? "";
  const nums = new Set((text.match(/\b\d+(?:[.,]\d+)?\b/g) ?? []).map(x => x.replace(",", ".")));
  const scoreMentions = [...nums].filter(x => x === String(Math.round(payload.overall.score ?? -1)));
  return { sections: n.sections.length, claims: claims.length, totalWords: words(text), conclusionWords: words(conclusion), cyrillicShare: letters.length ? +(cyr / letters.length).toFixed(3) : 0, duplicateSentences: dupSentences, overallScoreMentioned: scoreMentions.length > 0, distinctNumbers: nums.size };
}

fs.mkdirSync(outDir, { recursive: true });
const summary: any[] = [];
for (const name of CASES) {
  const [domain, profile] = name.split("_");
  const file = path.join(matrixDir, `${domain}_${profile}_base.json`);
  if (!fs.existsSync(file)) { console.log(JSON.stringify({ case: name, skipped: "no fixture" })); continue; }
  const payload: FrozenReportPayload = JSON.parse(fs.readFileSync(file, "utf8")).report.payload;
  if (!/^P27-/.test(payload.companyName) && !/BUSINESS$/.test(payload.companyName)) throw new Error("refusing: payload does not look synthetic");
  const row: any = { case: name, domain, profile, score: payload.overall.score, band: payload.overall.band, coverage: payload.overall.coverage };
  // deterministic baseline
  const t0 = Date.now(); const det = await generateValidatedNarrative(payload, undefined); row.deterministic = { state: det.state, validation: det.validation.state, ms: Date.now() - t0, ...metrics(payload, det.narrative) };
  // real provider
  const before = { calls: httpCalls, i: inTokens, o: outTokens }; const t1 = Date.now();
  if (httpCalls >= MAX_CALLS) { row.ai = { skipped: "call budget exhausted" }; summary.push(row); continue; }
  const ai = await generateValidatedNarrative(payload, metered);
  const independent = validateNarrativeDraft(payload, ai.narrative);
  row.ai = {
    state: ai.state, validation: independent.state, issues: independent.issues.map(i => `${i.checkId}:${i.severity}`), providerAttempts: ai.providerAttempts, httpAttempts: ai.providerHttpAttempts, retries: ai.providerRetryCount,
    providerError: ai.providerError, model: ai.providerMetadata.modelIdentifier, ms: Date.now() - t1, callsUsed: httpCalls - before.calls, inputTokens: inTokens - before.i, outputTokens: outTokens - before.o, requestIds: ai.providerRequestIds,
    ...(ai.state === "PASS" ? metrics(payload, ai.narrative) : {})
  };
  // layout: the AI wording must still fit the exactly-three-page contract, and render
  if (ai.state === "PASS") {
    try { row.ai.pdfFits = (await checkPdfLayoutBudget(payload, ai.narrative)).fits; row.ai.pdfPages = (await renderDraftPages(payload, ai.narrative, domain)).length; } catch (e: any) { row.ai.pdfError = String(e.message).slice(0, 160); }
  }
  // the AI may never change scores / evidence: the payload hash it was bound to is the one validated
  row.ai.boundToPayload = ai.narrative.payloadHash === payload.payloadHash;
  fs.writeFileSync(path.join(outDir, `${name}.json`), JSON.stringify({ meta: row, aiNarrative: ai.state === "PASS" ? flat(ai.narrative) : null, deterministicNarrative: flat(det.narrative) }, null, 1));
  summary.push(row); console.log(JSON.stringify(row));
}
const totals = { httpCalls, inputTokens: inTokens, outputTokens: outTokens, budget: MAX_CALLS };
fs.writeFileSync(path.join(outDir, "summary.json"), JSON.stringify({ totals, cases: summary }, null, 1));
console.log("TOTALS " + JSON.stringify(totals));
