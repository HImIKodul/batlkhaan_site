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

  errors.push(...recommendationContractIssues(bundle));
  return errors;
}

const REC_CONTRACT = "MMRI_FINAL_Recommendation_Engine_Contract.json";
const AUTH_CONTRACT = "MMRI_FINAL_Respondent_Authority_Contract.json";
/** Category-id prefix of each non-Marketing domain; Marketing categories are MSxx. */
const DOMAIN_ID_PREFIX: Record<string, string> = { finance: "FINMRI-", it: "ISMRI-", people: "HRMRI-", operations: "OPMRI-" };

/**
 * Recommendation/authority contract integrity. A recommendation resolves its objective through
 * categoryObjectives[category]; a contract copied from another domain silently yields zero
 * recommendations. Imports and bundle validation must therefore fail on any of these.
 */
export function recommendationContractIssues(bundle: MethodologyBundle): ValidationIssue[] {
  const errors: ValidationIssue[] = [];
  const fail = (code: string, message: string) => errors.push({ code, message });
  const domain = bundle.domainCode ?? "marketing";
  const rec = bundle.contracts?.[REC_CONTRACT];
  const objectives: any[] = rec?.composition?.categoryObjectives;
  if (!Array.isArray(objectives)) { fail("REC_OBJECTIVES_MISSING", "Recommendation contract has no composition.categoryObjectives."); return errors; }

  const categoryIds = new Set(bundle.categories.map(c => c.ID));
  const ids = objectives.map(o => String(o?.category ?? ""));
  if (objectives.length !== 64) fail("REC_OBJECTIVE_COUNT", `Expected 64 category objectives, got ${objectives.length}.`);
  if (new Set(ids).size !== ids.length) fail("REC_OBJECTIVE_DUPLICATE", `Duplicate objective category ids: ${ids.filter((x, i) => ids.indexOf(x) !== i).slice(0, 5).join(", ")}.`);
  const orphans = ids.filter(id => !categoryIds.has(id));
  if (orphans.length) fail("REC_OBJECTIVE_ORPHAN", `${orphans.length} objective(s) reference no category of this bundle (e.g. ${orphans.slice(0, 5).join(", ")}).`);
  const missing = [...categoryIds].filter(id => !ids.includes(id));
  if (missing.length) fail("REC_OBJECTIVE_MISSING_CATEGORY", `${missing.length} categor(ies) have no objective (e.g. ${missing.slice(0, 5).join(", ")}).`);

  const roleIds = new Set<string>((bundle.contracts?.[AUTH_CONTRACT]?.roles ?? []).map((r: any) => String(r.id)));
  const nameById = new Map(bundle.categories.map(c => [c.ID, c.Category]));
  for (const o of objectives) {
    if (domain !== "marketing" && nameById.has(o.category) && o.name !== nameById.get(o.category)) fail("REC_OBJECTIVE_NAME", `${o.category}: objective name does not equal the category name.`);
    if (!String(o.objective ?? "").trim()) fail("REC_OBJECTIVE_EMPTY", `${o.category}: empty objective text.`);
    if (!roleIds.has(String(o.defaultOwner)) || !roleIds.has(String(o.sponsor))) fail("REC_OBJECTIVE_ROLE", `${o.category}: owner/sponsor is not a role of this bundle's authority contract.`);
  }
  const cellIds = new Set(bundle.cellTemplates.map((c: any) => c.ID));
  for (const iv of rec.composition.cellInterventions ?? []) {
    if (!cellIds.has(iv.cell)) fail("REC_INTERVENTION_CELL", `Intervention ${iv.code} targets unknown cell ${iv.cell}.`);
  }

  if (domain !== "marketing") {
    const prefix = DOMAIN_ID_PREFIX[domain];
    const marketingIds = ids.filter(id => /^MS\d+$/.test(id));
    if (marketingIds.length) fail("REC_MARKETING_IDS", `Non-Marketing (${domain}) recommendation contract contains ${marketingIds.length} Marketing ids (${marketingIds.slice(0, 3).join(", ")}...).`);
    const foreign = ids.filter(id => !id.startsWith(prefix));
    if (foreign.length) fail("REC_FOREIGN_IDS", `${domain} contract has ${foreign.length} id(s) outside ${prefix}* (e.g. ${foreign.slice(0, 3).join(", ")}).`);
    const text = JSON.stringify([objectives, rec.composition.cellInterventions]);
    if (/аркетинг/i.test(text)) fail("REC_MARKETING_TEXT", `${domain} recommendation contract contains Marketing wording.`);
    const roles: any[] = bundle.contracts?.[AUTH_CONTRACT]?.roles ?? [];
    if (roles.some(r => /аркетинг|MARKETING/i.test(`${r.label} ${r.code} ${r.scope}`))) fail("AUTH_MARKETING_ROLES", `${domain} authority contract has Marketing role definitions.`);
  }
  return errors;
}
