import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { normalizeDomainCode } from "./domain-methodology.js";
import type { MethodologyBundle } from "./lib/bundle-types.js";
import { createQuestionBankOverlayTemplate } from "./question-bank-overlay.js";

const [basePath, candidateMethodologyVersion, candidateQuestionBankVersion, outputPath] = process.argv.slice(2);
if (!basePath || !candidateMethodologyVersion || !candidateQuestionBankVersion || !outputPath) {
  throw new Error("Usage: tsx src/export-question-bank-overlay-template.ts <base-bundle.json> <candidate-methodology-version> <candidate-qbank-version> <output.json>");
}
const raw = await readFile(basePath, "utf8");
const bundle = JSON.parse(raw) as MethodologyBundle;
const domain = normalizeDomainCode(bundle.domainCode ?? "marketing");
const baseSha = createHash("sha256").update(raw, "utf8").digest("hex");
const overlay = createQuestionBankOverlayTemplate(bundle, domain, baseSha, candidateMethodologyVersion, candidateQuestionBankVersion);
await writeFile(outputPath, `${JSON.stringify(overlay, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ status: "PASS", domain, outputPath, categories: overlay.categories.length, questions: overlay.questions.length }, null, 2));
