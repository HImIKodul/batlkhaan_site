import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { createHash } from "node:crypto";
import { normalizeDomainCode } from "./domain-methodology.js";
import type { MethodologyBundle } from "./lib/bundle-types.js";
import { validateBundle } from "./lib/validate-bundle-core.js";
import {
  applyQuestionBankOverlay,
  structuralFingerprint,
  validateQuestionBankOverlay,
  wordingFingerprint,
  type QuestionBankOverlay
} from "./question-bank-overlay.js";

const [basePath, overlayPath, outputPath] = process.argv.slice(2);
if (!basePath || !overlayPath || !outputPath) {
  throw new Error("Usage: tsx src/prepare-question-bank-overlay.ts <base-bundle.json> <overlay.json> <candidate-bundle.json>");
}

const [baseRaw, overlayRaw] = await Promise.all([readFile(basePath, "utf8"), readFile(overlayPath, "utf8")]);
const base = JSON.parse(baseRaw) as MethodologyBundle;
const overlay = JSON.parse(overlayRaw) as QuestionBankOverlay;
const domain = normalizeDomainCode(overlay.domainCode ?? base.domainCode ?? "marketing");
const baseSha = createHash("sha256").update(baseRaw, "utf8").digest("hex");
const strictMongolian = process.env.MMRI_QBANK_MONGOLIAN_ONLY === "YES";
const result = validateQuestionBankOverlay(base, overlay, domain, baseSha, { strictMongolian });
if (result.warnings.length) console.warn(result.warnings.map(x => `WARN ${x.code}: ${x.message}`).join("\n"));
if (result.errors.length) throw new Error(`Question-bank overlay rejected:\n${result.errors.map(x => `${x.code}: ${x.message}`).join("\n")}`);

const beforeStructure = structuralFingerprint(base);
const candidate = applyQuestionBankOverlay(base, overlay);
const afterStructure = structuralFingerprint(candidate);
if (beforeStructure !== afterStructure) throw new Error("STRUCTURAL_DRIFT: wording overlay changed protected scoring/routing/mapping structure.");

const bundleIssues = validateBundle(candidate);
if (bundleIssues.length) throw new Error(`Candidate bundle invalid:\n${bundleIssues.map(i => `${i.code}: ${i.message}`).join("\n")}`);

const candidateText = `${JSON.stringify(candidate, null, 2)}\n`;
const candidateSha = createHash("sha256").update(candidateText, "utf8").digest("hex");
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, candidateText, "utf8");
await writeFile(`${outputPath}.manifest.json`, `${JSON.stringify({
  status: "PASS",
  domainCode: domain,
  baseBundleSha256: baseSha,
  baseStructuralFingerprint: beforeStructure,
  candidateStructuralFingerprint: afterStructure,
  baseWordingFingerprint: wordingFingerprint(base),
  candidateWordingFingerprint: wordingFingerprint(candidate),
  candidateMethodologyVersion: overlay.candidateMethodologyVersion,
  candidateQuestionBankVersion: overlay.candidateQuestionBankVersion,
  candidateBundleSha256: candidateSha,
  categoryCount: candidate.categories.length,
  questionCount: candidate.questions.length,
  optionCount: candidate.questions.reduce((n, q) => n + q.optionsMn.length, 0),
  strictMongolian,
  warningCount: result.warnings.length,
  warnings: result.warnings
}, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ status: "PASS", outputPath, candidateBundleSha256: candidateSha, warningCount: result.warnings.length }, null, 2));
