import type { MethodologyBundle } from "./bundle-types.js";

export type ValidationIssue = { code: string; message: string };

export function validateBundle(bundle: MethodologyBundle): ValidationIssue[] {
  const errors: ValidationIssue[] = [];
  const require = (ok: boolean, code: string, message: string) => { if (!ok) errors.push({ code, message }); };

  require(bundle.validation?.status === "PASS", "BUNDLE_NOT_PASS", "Bundle validation status must be PASS.");
  require(bundle.categories.length === 64, "CATEGORY_COUNT", `Expected 64 categories, got ${bundle.categories.length}.`);
  require(bundle.cellTemplates.length === 48, "CELL_TEMPLATE_COUNT", `Expected 48 cell templates, got ${bundle.cellTemplates.length}.`);
  require(bundle.cellInstances.length === 3072, "CELL_INSTANCE_COUNT", `Expected 3072 diagnostic cells, got ${bundle.cellInstances.length}.`);
  require(bundle.questions.length === 12288, "QUESTION_COUNT", `Expected 12288 questions, got ${bundle.questions.length}.`);
  require(bundle.profileQuestions.length === 20, "PROFILE_COUNT", `Expected 20 profile questions, got ${bundle.profileQuestions.length}.`);
  require(new Set(bundle.questions.map(q => q.questionId)).size === 12288, "QUESTION_IDS", "Question IDs are not unique.");

  const pairPaths = new Map<string, number[]>();
  for (const q of bundle.questions) {
    const key = `${q.categoryId}:${q.cellId}`;
    const paths = pairPaths.get(key) ?? [];
    paths.push(q.path);
    pairPaths.set(key, paths);
  }
  require(pairPaths.size === 3072, "PAIR_COUNT", `Expected 3072 category-cell pairs, got ${pairPaths.size}.`);
  const malformedPairs = [...pairPaths.entries()].filter(([, paths]) => paths.sort((a,b) => a-b).join(",") !== "1,2,3,4");
  require(malformedPairs.length === 0, "FOUR_PATHS", `${malformedPairs.length} category-cell pairs do not have paths 1,2,3,4.`);

  const conditional = new Set(["C24","C25","C26","C35","C43","C45","C46"]);
  if (bundle.runtimePolicy) conditional.add("C31");
  for (const c of bundle.cellTemplates) {
    const expected = c.ID === "C01" ? "Тийм" : conditional.has(c.ID) ? "Нөхцөлт" : "Үгүй";
    require(c["N/A eligible"] === expected, "NA_POLICY", `${c.ID} has N/A metadata '${c["N/A eligible"]}', expected '${expected}'.`);
  }

  if (bundle.runtimePolicy) {
    const runtime = bundle.runtimePolicy;
    require(runtime.version === "v13", "RUNTIME_VERSION", `Expected runtime policy v13, got '${runtime.version}'.`);
    require(runtime.questionPolicies.length === 12288, "RUNTIME_QUESTION_POLICY_COUNT", `Expected 12288 question policies, got ${runtime.questionPolicies.length}.`);
    require(runtime.cellPolicies.length === 3072, "RUNTIME_CELL_POLICY_COUNT", `Expected 3072 cell policies, got ${runtime.cellPolicies.length}.`);
    require(runtime.rules.length > 0, "RUNTIME_RULE_COUNT", "Runtime rule dictionary is empty.");
    require(runtime.scorePatterns.length > 0, "RUNTIME_SCORE_PATTERN_COUNT", "Runtime score patterns are empty.");

    const questionIds = new Set(bundle.questions.map(q => q.questionId));
    const policyQuestionIds = runtime.questionPolicies.map(p => p.questionId);
    require(new Set(policyQuestionIds).size === 12288, "RUNTIME_QUESTION_POLICY_IDS", "Runtime question policy IDs are not unique.");
    require(policyQuestionIds.every(id => questionIds.has(id)), "RUNTIME_QUESTION_POLICY_FK", "Runtime question policy references a question outside the bundle.");

    const cellExternalIds = new Set(bundle.cellInstances.map(c => c.cellInstanceId));
    const runtimeCellIds = runtime.cellPolicies.map(c => c.cellExternalId);
    require(new Set(runtimeCellIds).size === 3072, "RUNTIME_CELL_POLICY_IDS", "Runtime cell policy IDs are not unique.");
    require(runtimeCellIds.every(id => cellExternalIds.has(id)), "RUNTIME_CELL_POLICY_FK", "Runtime cell policy references a diagnostic cell outside the bundle.");

    const patternCodes = new Set(runtime.scorePatterns.map(p => p.code));
    require(patternCodes.size === runtime.scorePatterns.length, "RUNTIME_SCORE_PATTERN_IDS", "Runtime score pattern codes are not unique.");
    require(runtime.questionPolicies.every(p => patternCodes.has(p.scorePatternCode)), "RUNTIME_SCORE_PATTERN_FK", "A question policy references an unknown score pattern.");

    const ruleIds = new Set(runtime.rules.map(r => r.ruleId));
    require(ruleIds.size === runtime.rules.length, "RUNTIME_RULE_IDS", "Runtime rule IDs are not unique.");
    require(runtime.questionPolicies.every(p => ruleIds.has(p.triggerRuleId) && ruleIds.has(p.confidenceRuleId) && ruleIds.has(p.stopRuleId)), "RUNTIME_RULE_FK", "A question policy references an unknown trigger/confidence/stop rule.");
    require(runtime.cellPolicies.every(p => ruleIds.has(p.stateModelId) && ruleIds.has(p.valueRuleId)), "RUNTIME_CELL_RULE_FK", "A cell policy references an unknown state/value rule.");

    const explicit = bundle.questions.filter(q => q.explicitOptions);
    require(explicit.length === 12288, "RUNTIME_EXPLICIT_OPTIONS", `Expected explicit option metadata for all 12288 questions, got ${explicit.length}.`);
    for (const q of explicit) {
      require(q.explicitOptions!.length === q.optionsMn.length, "RUNTIME_OPTION_LENGTH", `${q.questionId} explicit option count does not match optionsMn.`);
      require(q.explicitOptions!.every((o, i) => o.optionIndex === i + 1 && o.labelMn === q.optionsMn[i]), "RUNTIME_OPTION_ALIGNMENT", `${q.questionId} explicit options are not index/label aligned.`);
    }
  }

  return errors;
}
