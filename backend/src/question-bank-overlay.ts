import { createHash } from "node:crypto";
import type { DomainCode } from "./domain-methodology.js";
import type { MethodologyBundle } from "./lib/bundle-types.js";

export const QUESTION_BANK_OVERLAY_FORMAT = "MMRI-QBANK-OVERLAY-1" as const;

export interface QuestionBankOverlayCategory {
  categoryId: string;
  nameMn: string;
}

export interface QuestionBankOverlayOption {
  optionIndex: number;
  labelMn: string;
}

export interface QuestionBankOverlayQuestion {
  questionId: string;
  textMn: string;
  options: QuestionBankOverlayOption[];
}

export interface QuestionBankOverlay {
  formatVersion: typeof QUESTION_BANK_OVERLAY_FORMAT;
  domainCode: DomainCode;
  baseMethodologyVersion: string;
  baseBundleSha256: string;
  candidateMethodologyVersion: string;
  candidateQuestionBankVersion: string;
  reviewedAtUtc?: string;
  reviewerNote?: string;
  categories: QuestionBankOverlayCategory[];
  questions: QuestionBankOverlayQuestion[];
}

export interface OverlayValidationIssue {
  code: string;
  message: string;
}

export interface OverlayValidationResult {
  errors: OverlayValidationIssue[];
  warnings: OverlayValidationIssue[];
}

function sha256Text(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj).sort().map(k => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function sha256Canonical(value: unknown): string {
  return sha256Text(canonicalJson(value));
}

function cleanText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[\t\r\n]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function hasForbiddenControl(value: string): boolean {
  return /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(value);
}

function latinWords(value: string): string[] {
  return value.match(/[A-Za-z][A-Za-z0-9._/+%-]*/g) ?? [];
}

function deriveBaseMethodologyVersion(bundle: MethodologyBundle): string {
  return bundle.methodologyVersion?.trim()
    || bundle.sourceMethodology.match(/v(\d+\.\d+\.\d+)/)?.[1]
    || bundle.bundleVersion.replace(/^.*?(\d+\.\d+\.\d+).*$/, "$1");
}

export function structuralFingerprint(bundle: MethodologyBundle): string {
  return sha256Canonical({
    domainCode: bundle.domainCode ?? "marketing",
    engineKind: bundle.engineKind ?? "MARKETING_V3",
    categories: bundle.categories.map(c => ({
      ID: c.ID,
      Module: c.Module,
      moduleWeightPct: c["Module weight %"],
      categoryWeightPct: c["Category weight %"]
    })),
    cellTemplates: bundle.cellTemplates,
    cellInstances: bundle.cellInstances,
    questions: bundle.questions.map(q => ({
      questionId: q.questionId,
      sourceRow: q.sourceRow,
      categoryId: q.categoryId,
      cellId: q.cellId,
      path: q.path,
      sourceKind: q.sourceKind,
      optionCount: q.optionsMn.length,
      explicitOptions: q.explicitOptions?.map(o => ({
        optionIndex: o.optionIndex,
        score: o.score,
        state: o.state
      })) ?? null,
      scoringProfileCode: q.scoringProfileCode ?? null,
      primaryCoefficient: q.primaryCoefficient,
      secondaryTargets: q.secondaryTargets
    })),
    profileQuestions: bundle.profileQuestions.map(q => ({ id: q.id, type: q.type ?? null, optionCount: q.optionsMn.length })),
    contracts: bundle.contracts,
    runtimePolicy: bundle.runtimePolicy ?? null
  });
}

export function wordingFingerprint(bundle: MethodologyBundle): string {
  return sha256Canonical({
    categories: bundle.categories.map(c => ({ id: c.ID, nameMn: c.Category })),
    questions: bundle.questions.map(q => ({
      id: q.questionId,
      textMn: q.textMn,
      optionsMn: q.optionsMn
    }))
  });
}

export function createQuestionBankOverlayTemplate(
  bundle: MethodologyBundle,
  domainCode: DomainCode,
  baseBundleSha256: string,
  candidateMethodologyVersion: string,
  candidateQuestionBankVersion: string
): QuestionBankOverlay {
  return {
    formatVersion: QUESTION_BANK_OVERLAY_FORMAT,
    domainCode,
    baseMethodologyVersion: deriveBaseMethodologyVersion(bundle),
    baseBundleSha256,
    candidateMethodologyVersion,
    candidateQuestionBankVersion,
    categories: bundle.categories.map(c => ({ categoryId: c.ID, nameMn: c.Category })),
    questions: bundle.questions.map(q => ({
      questionId: q.questionId,
      textMn: q.textMn,
      options: q.optionsMn.map((labelMn, i) => ({ optionIndex: i + 1, labelMn }))
    }))
  };
}

export function validateQuestionBankOverlay(
  base: MethodologyBundle,
  overlay: QuestionBankOverlay,
  expectedDomain: DomainCode,
  actualBaseBundleSha256: string,
  options: { strictMongolian?: boolean } = {}
): OverlayValidationResult {
  const errors: OverlayValidationIssue[] = [];
  const warnings: OverlayValidationIssue[] = [];
  const err = (code: string, message: string) => errors.push({ code, message });
  const warn = (code: string, message: string) => warnings.push({ code, message });

  if (overlay.formatVersion !== QUESTION_BANK_OVERLAY_FORMAT) err("FORMAT_VERSION", `Expected ${QUESTION_BANK_OVERLAY_FORMAT}.`);
  if (overlay.domainCode !== expectedDomain) err("DOMAIN", `Overlay domain ${overlay.domainCode} does not match ${expectedDomain}.`);
  const baseVersion = deriveBaseMethodologyVersion(base);
  if (overlay.baseMethodologyVersion !== baseVersion) err("BASE_VERSION", `Overlay base ${overlay.baseMethodologyVersion} does not match ${baseVersion}.`);
  if (overlay.baseBundleSha256 !== actualBaseBundleSha256) err("BASE_SHA", "Overlay base bundle SHA-256 does not match the selected base bundle.");
  if (!/^\d+\.\d+\.\d+$/.test(overlay.candidateMethodologyVersion)) err("CANDIDATE_VERSION", "Candidate methodology version must be semantic x.y.z.");
  if (!overlay.candidateQuestionBankVersion?.trim()) err("QBANK_VERSION", "Candidate question-bank version is required.");
  if (overlay.candidateMethodologyVersion === baseVersion) err("IMMUTABLE_VERSION", "Wording changes must use a new methodology version; immutable base versions cannot be overwritten.");

  if (!Array.isArray(overlay.categories) || overlay.categories.length !== base.categories.length) {
    err("CATEGORY_COUNT", `Expected exactly ${base.categories.length} categories.`);
  }
  const categoryMap = new Map<string, QuestionBankOverlayCategory>();
  for (const c of overlay.categories ?? []) {
    const id = cleanText(c.categoryId);
    if (!id) { err("CATEGORY_ID_EMPTY", "Category ID cannot be empty."); continue; }
    if (categoryMap.has(id)) err("CATEGORY_DUPLICATE", `Duplicate category ID ${id}.`);
    categoryMap.set(id, { categoryId: id, nameMn: cleanText(c.nameMn) });
  }
  for (const baseCategory of base.categories) {
    const c = categoryMap.get(baseCategory.ID);
    if (!c) { err("CATEGORY_MISSING", `Missing category ${baseCategory.ID}.`); continue; }
    if (!c.nameMn) err("CATEGORY_NAME_EMPTY", `${baseCategory.ID} has an empty category name.`);
    if (hasForbiddenControl(c.nameMn)) err("CATEGORY_CONTROL", `${baseCategory.ID} contains forbidden control characters.`);
    const latin = latinWords(c.nameMn);
    if (latin.length) {
      const message = `${baseCategory.ID} category name contains Latin token(s): ${latin.slice(0, 5).join(", ")}`;
      options.strictMongolian ? err("CATEGORY_LATIN", message) : warn("CATEGORY_LATIN", message);
    }
  }
  for (const id of categoryMap.keys()) if (!base.categories.some(c => c.ID === id)) err("CATEGORY_UNKNOWN", `Unknown category ID ${id}.`);

  if (!Array.isArray(overlay.questions) || overlay.questions.length !== base.questions.length) {
    err("QUESTION_COUNT", `Expected exactly ${base.questions.length} questions.`);
  }
  const questionMap = new Map<string, QuestionBankOverlayQuestion>();
  for (const q of overlay.questions ?? []) {
    const id = cleanText(q.questionId);
    if (!id) { err("QUESTION_ID_EMPTY", "Question ID cannot be empty."); continue; }
    if (questionMap.has(id)) err("QUESTION_DUPLICATE", `Duplicate question ID ${id}.`);
    questionMap.set(id, {
      questionId: id,
      textMn: cleanText(q.textMn),
      options: (q.options ?? []).map(o => ({ optionIndex: Number(o.optionIndex), labelMn: cleanText(o.labelMn) }))
    });
  }

  for (const baseQuestion of base.questions) {
    const q = questionMap.get(baseQuestion.questionId);
    if (!q) { err("QUESTION_MISSING", `Missing question ${baseQuestion.questionId}.`); continue; }
    if (!q.textMn) err("QUESTION_TEXT_EMPTY", `${baseQuestion.questionId} has empty wording.`);
    if (q.textMn.includes("—")) err("QUESTION_EM_DASH", `${baseQuestion.questionId} contains an em dash.`);
    if (hasForbiddenControl(q.textMn)) err("QUESTION_CONTROL", `${baseQuestion.questionId} contains forbidden control characters.`);
    if (/\b(?:TODO|TBD|LOREM|PLACEHOLDER)\b/i.test(q.textMn)) err("QUESTION_PLACEHOLDER", `${baseQuestion.questionId} contains placeholder wording.`);
    const qLatin = latinWords(q.textMn);
    if (qLatin.length) {
      const message = `${baseQuestion.questionId} contains Latin token(s): ${qLatin.slice(0, 5).join(", ")}`;
      options.strictMongolian ? err("QUESTION_LATIN", message) : warn("QUESTION_LATIN", message);
    }

    if (q.options.length !== baseQuestion.optionsMn.length) {
      err("OPTION_COUNT", `${baseQuestion.questionId} expected ${baseQuestion.optionsMn.length} options, got ${q.options.length}.`);
      continue;
    }
    const seenOptionIndexes = new Set<number>();
    for (let i = 0; i < q.options.length; i++) {
      const option = q.options[i]!;
      const expectedIndex = i + 1;
      if (!Number.isInteger(option.optionIndex) || option.optionIndex !== expectedIndex) {
        err("OPTION_INDEX", `${baseQuestion.questionId} option ${i + 1} must have optionIndex=${expectedIndex}.`);
      }
      if (seenOptionIndexes.has(option.optionIndex)) err("OPTION_INDEX_DUPLICATE", `${baseQuestion.questionId} duplicates optionIndex ${option.optionIndex}.`);
      seenOptionIndexes.add(option.optionIndex);
      if (!option.labelMn) err("OPTION_EMPTY", `${baseQuestion.questionId} option ${expectedIndex} is empty.`);
      if (option.labelMn.includes("—")) err("OPTION_EM_DASH", `${baseQuestion.questionId} option ${expectedIndex} contains an em dash.`);
      if (hasForbiddenControl(option.labelMn)) err("OPTION_CONTROL", `${baseQuestion.questionId} option ${expectedIndex} contains forbidden control characters.`);
      if (/\b(?:TODO|TBD|LOREM|PLACEHOLDER)\b/i.test(option.labelMn)) err("OPTION_PLACEHOLDER", `${baseQuestion.questionId} option ${expectedIndex} contains placeholder wording.`);
      const oLatin = latinWords(option.labelMn);
      if (oLatin.length) {
        const message = `${baseQuestion.questionId} option ${expectedIndex} contains Latin token(s): ${oLatin.slice(0, 5).join(", ")}`;
        options.strictMongolian ? err("OPTION_LATIN", message) : warn("OPTION_LATIN", message);
      }
    }
  }
  for (const id of questionMap.keys()) if (!base.questions.some(q => q.questionId === id)) err("QUESTION_UNKNOWN", `Unknown question ID ${id}.`);

  return { errors, warnings };
}

export function applyQuestionBankOverlay(base: MethodologyBundle, overlay: QuestionBankOverlay): MethodologyBundle {
  const categoryMap = new Map(overlay.categories.map(c => [cleanText(c.categoryId), cleanText(c.nameMn)]));
  const questionMap = new Map(overlay.questions.map(q => [cleanText(q.questionId), {
    textMn: cleanText(q.textMn),
    options: q.options.map(o => ({ optionIndex: Number(o.optionIndex), labelMn: cleanText(o.labelMn) }))
  }]));

  const next: MethodologyBundle = structuredClone(base);
  next.domainCode = overlay.domainCode;
  next.methodologyVersion = overlay.candidateMethodologyVersion;
  next.questionBankVersion = overlay.candidateQuestionBankVersion;
  next.releaseStatus = "HUMAN_REVIEW_CANDIDATE";
  next.semanticVersionClass = "WORDING_ONLY";
  next.bundleVersion = `${base.bundleVersion}+human-review`;
  next.generatedAtUtc = new Date().toISOString();
  next.validation = {
    ...(base.validation ?? {}),
    status: "PASS",
    humanReviewOverlay: {
      formatVersion: overlay.formatVersion,
      baseMethodologyVersion: overlay.baseMethodologyVersion,
      baseBundleSha256: overlay.baseBundleSha256,
      candidateQuestionBankVersion: overlay.candidateQuestionBankVersion,
      reviewedAtUtc: overlay.reviewedAtUtc ?? null,
      reviewerNote: overlay.reviewerNote ?? null
    }
  };

  next.categories = next.categories.map(c => ({ ...c, Category: categoryMap.get(c.ID) ?? c.Category }));
  next.questions = next.questions.map(q => {
    const change = questionMap.get(q.questionId);
    if (!change) return q;
    const optionsMn = change.options.map(o => o.labelMn);
    const explicitOptions = q.explicitOptions?.map((o, i) => ({
      ...o,
      labelMn: optionsMn[i] ?? o.labelMn
    }));
    return { ...q, textMn: change.textMn, optionsMn, explicitOptions };
  });

  const overlaySha256 = sha256Canonical(overlay);
  next.sourceManifest = {
    ...next.sourceManifest,
    "MMRI_HUMAN_REVIEW_OVERLAY.json": {
      version: overlay.candidateQuestionBankVersion,
      sha256: overlaySha256,
      chunks: overlay.questions.length + overlay.categories.length,
      size: overlay.questions.length,
      role: "HUMAN_REVIEW_WORDING_OVERLAY"
    }
  };
  return next;
}
