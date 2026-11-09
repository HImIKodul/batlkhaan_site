import type { DirectEvidence, MethodologyDefinition, RuntimeSnapshot } from "./types.js";
import { reliabilityForPath } from "./authority.js";

const EPS = 1e-8;

export function assertEvidenceIntegrity(definition: MethodologyDefinition, evidence: DirectEvidence[]): void {
  const seenQuestionIds = new Set<string>();
  for (const item of evidence) {
    if (seenQuestionIds.has(item.questionId)) {
      throw new Error(`Duplicate effective evidence for question ${item.questionId}`);
    }
    seenQuestionIds.add(item.questionId);

    const question = definition.questionById.get(item.questionId);
    if (!question) throw new Error(`Evidence references unknown question ${item.questionId}`);
    if (item.categoryId !== question.categoryId) throw new Error(`Evidence category mismatch for ${item.questionId}`);
    if (item.cellId !== question.cellId) throw new Error(`Evidence cell mismatch for ${item.questionId}`);
    if (item.path !== question.path) throw new Error(`Evidence path mismatch for ${item.questionId}`);
    if (item.sourceKind !== question.sourceKind) throw new Error(`Evidence source-kind mismatch for ${item.questionId}`);
    if (item.scoringProfileCode !== question.scoringProfileCode) throw new Error(`Evidence scoring-profile mismatch for ${item.questionId}`);

    const option = question.options.find(row => row.optionIndex === item.optionIndex);
    if (!option) throw new Error(`Evidence option ${item.optionIndex} is invalid for ${item.questionId}`);
    if (item.state !== option.state) throw new Error(`Evidence state mismatch for ${item.questionId}`);
    if (!sameNullableNumber(item.score, option.score)) throw new Error(`Evidence score mismatch for ${item.questionId}`);
    if (item.optionLabel !== option.labelMn) throw new Error(`Evidence option-label mismatch for ${item.questionId}`);

    assertUnit(item.authority, `Evidence authority ${item.questionId}`);
    assertUnit(item.reliability, `Evidence reliability ${item.questionId}`);
    const expectedReliability = reliabilityForPath(definition.contracts, question.path, item.authority);
    if (!close(item.reliability, expectedReliability)) {
      throw new Error(`Evidence reliability is not canonical for ${item.questionId}`);
    }
  }
}

export function assertRuntimeSnapshotIntegrity(definition: MethodologyDefinition, snapshot: RuntimeSnapshot): void {
  const expectedCells = definition.categories.length * definition.cells.length;
  if (snapshot.cells.size !== expectedCells) throw new Error(`Runtime cell count mismatch: ${snapshot.cells.size}/${expectedCells}`);
  if (snapshot.categories.size !== definition.categories.length) throw new Error(`Runtime category count mismatch: ${snapshot.categories.size}/${definition.categories.length}`);
  if (snapshot.modules.size !== definition.modules.length) throw new Error(`Runtime module count mismatch: ${snapshot.modules.size}/${definition.modules.length}`);

  for (const category of definition.categories) {
    const categoryState = snapshot.categories.get(category.id);
    if (!categoryState) throw new Error(`Runtime missing category ${category.id}`);
    if (categoryState.categoryId !== category.id || categoryState.moduleId !== category.module) throw new Error(`Runtime category identity mismatch ${category.id}`);
    assertScoreOrNull(categoryState.partialScore, `Category ${category.id} partial score`);
    assertScoreOrNull(categoryState.officialScore, `Category ${category.id} official score`);
    assertUnitOrNull(categoryState.confidence, `Category ${category.id} confidence`);
    assertUnitOrNull(categoryState.coverage, `Category ${category.id} coverage`);
    assertCount(categoryState.applicableCellCount, `Category ${category.id} applicableCellCount`);
    assertCount(categoryState.finalizedCellCount, `Category ${category.id} finalizedCellCount`);
    assertCount(categoryState.unresolvedCellCount, `Category ${category.id} unresolvedCellCount`);
    assertCount(categoryState.reviewRequiredCellCount, `Category ${category.id} reviewRequiredCellCount`);
    if (categoryState.confirmedNotApplicable) {
      if (categoryState.partialScore !== null || categoryState.officialScore !== null || categoryState.applicableCellCount !== 0) {
        throw new Error(`Confirmed N/A category ${category.id} retains scoring state`);
      }
    }
    if (categoryState.officialScore !== null && categoryState.unresolvedCellCount !== 0) {
      throw new Error(`Official category ${category.id} still has unresolved cells`);
    }

    for (const cell of definition.cells) {
      const key = `${category.id}:${cell.id}`;
      const state = snapshot.cells.get(key);
      if (!state) throw new Error(`Runtime missing cell ${key}`);
      if (state.categoryId !== category.id || state.cellId !== cell.id) throw new Error(`Runtime cell identity mismatch ${key}`);
      assertScoreOrNull(state.directScore, `Cell ${key} direct score`);
      assertScoreOrNull(state.derivedScore, `Cell ${key} derived score`);
      assertScoreOrNull(state.effectiveScore, `Cell ${key} effective score`);
      assertUnit(state.directConfidence, `Cell ${key} direct confidence`);
      assertUnit(state.derivedConfidence, `Cell ${key} derived confidence`);
      assertUnit(state.effectiveConfidence, `Cell ${key} effective confidence`);
      assertUnit(state.naClaimConfidence, `Cell ${key} N/A confidence`);
      assertUnitOrNull(state.applicabilityRelevance, `Cell ${key} applicability relevance`);
      if (state.status === "NOT_APPLICABLE" && state.effectiveScore !== null) throw new Error(`N/A cell ${key} has an effective score`);
      if (state.locked && !["DIRECT_FINAL", "NOT_APPLICABLE"].includes(state.status)) throw new Error(`Locked cell ${key} has non-terminal status ${state.status}`);
    }
  }

  for (const module of definition.modules) {
    const state = snapshot.modules.get(module.id);
    if (!state) throw new Error(`Runtime missing module ${module.id}`);
    assertScoreOrNull(state.partialScore, `Module ${module.id} partial score`);
    assertScoreOrNull(state.officialScore, `Module ${module.id} official score`);
    assertUnitOrNull(state.confidence, `Module ${module.id} confidence`);
    assertUnitOrNull(state.coverage, `Module ${module.id} coverage`);
    assertCount(state.applicableCategoryCount, `Module ${module.id} applicableCategoryCount`);
    assertCount(state.finalizedCategoryCount, `Module ${module.id} finalizedCategoryCount`);
    assertCount(state.unresolvedCategoryCount, `Module ${module.id} unresolvedCategoryCount`);
    assertCount(state.reviewRequiredCategoryCount, `Module ${module.id} reviewRequiredCategoryCount`);

    const categoryRows = definition.categories
      .filter(category => category.module === module.id)
      .map(category => snapshot.categories.get(category.id)!)
      .filter(category => !category.confirmedNotApplicable);
    const partialContributions = categoryRows.map(category => category.partialContributionToModule).filter((value): value is number => value !== null);
    if (state.partialScore !== null && partialContributions.length > 0) {
      assertClose(sum(partialContributions), state.partialScore, `Category partial contributions for module ${module.id}`);
    }
    const officialContributions = categoryRows.map(category => category.officialContributionToModule).filter((value): value is number => value !== null);
    if (state.officialScore !== null) {
      if (officialContributions.length !== categoryRows.length) throw new Error(`Module ${module.id} official contribution lineage is incomplete`);
      assertClose(sum(officialContributions), state.officialScore, `Category official contributions for module ${module.id}`);
    }
  }

  assertScoreOrNull(snapshot.overall.partialScore, "Overall partial score");
  assertScoreOrNull(snapshot.overall.officialScore, "Overall official score");
  assertUnitOrNull(snapshot.overall.confidence, "Overall confidence");
  assertUnitOrNull(snapshot.overall.coverage, "Overall coverage");
  if (snapshot.overall.officialScore !== null) {
    if (snapshot.overall.completeCategoryCount !== snapshot.overall.applicableCategoryCount) throw new Error("Official overall score exists with incomplete categories");
    if (snapshot.overall.completeModuleCount !== snapshot.overall.applicableModuleCount) throw new Error("Official overall score exists with incomplete modules");
  }

  const applicableModules = definition.modules
    .map(module => snapshot.modules.get(module.id)!)
    .filter(module => module.applicableCategoryCount > 0);
  const partialContributions = applicableModules.map(module => module.partialContribution).filter((value): value is number => value !== null);
  if (snapshot.overall.partialScore !== null && partialContributions.length > 0) {
    assertClose(sum(partialContributions), snapshot.overall.partialScore, "Module partial contributions to overall");
  }
  const officialContributions = applicableModules.map(module => module.officialContribution).filter((value): value is number => value !== null);
  if (snapshot.overall.officialScore !== null) {
    if (officialContributions.length !== applicableModules.length) throw new Error("Overall official contribution lineage is incomplete");
    assertClose(sum(officialContributions), snapshot.overall.officialScore, "Module official contributions to overall");
  }

  for (const [purposeId, purpose] of snapshot.purposes) {
    assertScoreOrNull(purpose.partialScore, `Purpose ${purposeId} partial score`);
    assertScoreOrNull(purpose.officialScore, `Purpose ${purposeId} official score`);
    assertUnitOrNull(purpose.confidence, `Purpose ${purposeId} confidence`);
    assertUnitOrNull(purpose.coverage, `Purpose ${purposeId} coverage`);
  }

  for (const [key, priority] of snapshot.categoryOutcomePriorities) {
    assertScore(priority.categoryScore, `Outcome priority ${key} category score`);
    assertScore(priority.categoryGap, `Outcome priority ${key} category gap`);
    assertUnitOrNull(priority.confidence, `Outcome priority ${key} confidence`);
    assertUnitOrNull(priority.coverage, `Outcome priority ${key} coverage`);
    assertUnit(priority.relativePriority, `Outcome priority ${key} relative priority`);
  }
}

function sameNullableNumber(left: number | null, right: number | null): boolean {
  return left === null || right === null ? left === right : close(left, right);
}

function close(left: number, right: number): boolean {
  return Number.isFinite(left) && Number.isFinite(right) && Math.abs(left - right) <= EPS;
}

function assertClose(actual: number, expected: number, label: string): void {
  if (!close(actual, expected)) throw new Error(`${label} mismatch: ${actual} != ${expected}`);
}

function assertScore(value: number, label: string): void {
  if (!Number.isFinite(value) || value < -EPS || value > 100 + EPS) throw new Error(`${label} out of range: ${value}`);
}

function assertScoreOrNull(value: number | null, label: string): void {
  if (value !== null) assertScore(value, label);
}

function assertUnit(value: number, label: string): void {
  if (!Number.isFinite(value) || value < -EPS || value > 1 + EPS) throw new Error(`${label} out of range: ${value}`);
}

function assertUnitOrNull(value: number | null, label: string): void {
  if (value !== null) assertUnit(value, label);
}

function assertCount(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0) throw new Error(`${label} is invalid: ${value}`);
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
