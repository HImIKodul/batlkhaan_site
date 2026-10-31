import type {
  CategorySnapshot,
  CellSnapshot,
  MethodologyDefinition,
  ModuleSnapshot,
  OverallSnapshot,
  PurposeSnapshot,
  OutcomePrioritySnapshot,
  CategoryOutcomePrioritySnapshot
} from "./types.js";
import { cellWeightPct, clamp, mapKey, weightedMean } from "./utils.js";

export interface AggregateSnapshots {
  categories: Map<string, CategorySnapshot>;
  modules: Map<string, ModuleSnapshot>;
  overall: OverallSnapshot;
  purposes: Map<string, PurposeSnapshot>;
  outcomePriorities: Map<string, OutcomePrioritySnapshot>;
  categoryOutcomePriorities: Map<string, CategoryOutcomePrioritySnapshot>;
}

/**
 * v13 has an explicit hierarchy:
 * diagnostic cells -> 64 weighted capabilities -> 8 weighted marketing modules
 * -> Overall Marketing. The five business purposes are a separate impact view.
 *
 * Legacy methodology keeps its historical overall calculation so existing
 * assessments remain reproducible.
 */
export function calculateAggregateSnapshots(
  definition: MethodologyDefinition,
  cells: Map<string, CellSnapshot>
): AggregateSnapshots {
  return definition.runtimePolicy?.enabled
    ? calculateHierarchicalV13Aggregates(definition, cells)
    : calculateLegacyAggregates(definition, cells);
}

function calculateHierarchicalV13Aggregates(
  definition: MethodologyDefinition,
  cells: Map<string, CellSnapshot>
): AggregateSnapshots {
  const categories = calculateV13Categories(definition, cells);
  const modules = calculateModules(definition, categories);
  applyCategoryContributionLineage(definition, categories);
  const overall = calculateHierarchicalOverall(definition, categories, modules);
  applyModuleContributionLineage(definition, modules, overall);
  const purposes = calculatePurposes(definition, categories, true);
  const { outcomePriorities, categoryOutcomePriorities } = calculateOutcomePriorities(definition, categories, purposes);
  return { categories, modules, overall, purposes, outcomePriorities, categoryOutcomePriorities };
}

function calculateV13Categories(
  definition: MethodologyDefinition,
  cells: Map<string, CellSnapshot>
): Map<string, CategorySnapshot> {
  const categories = new Map<string, CategorySnapshot>();

  for (const category of definition.categories) {
    const c01 = cells.get(mapKey(category.id, "C01"))!;
    const confirmedNotApplicable = c01.status === "NOT_APPLICABLE" && !c01.hasHardContradiction;
    if (confirmedNotApplicable) {
      categories.set(category.id, emptyCategory(category, true));
      continue;
    }

    const applicable = definition.cells
      .filter(c => c.id !== "C01" && isMaturityScoredCell(definition, category.id, c.id))
      .map(c => ({ def: c, state: cells.get(mapKey(category.id, c.id))!, weight: cellWeightPct(definition, category.id, c.id, c.weightPct) }))
      .filter(x => x.state.status !== "NOT_APPLICABLE" && x.weight > 0);
    const available = applicable.filter(x => x.state.effectiveScore !== null);
    const denominator = applicable.reduce((sum, x) => sum + x.weight, 0);
    const availableWeight = available.reduce((sum, x) => sum + x.weight, 0);
    const partialScore = availableWeight === 0 ? null : weightedMean(available.map(x => ({ value: x.state.effectiveScore as number, weight: x.weight })));
    const coverage = denominator === 0 ? null : availableWeight / denominator;
    const confidence = availableWeight === 0 ? null : weightedMean(available.map(x => ({ value: x.state.effectiveConfidence, weight: x.weight })));
    const allHaveValue = applicable.length > 0 && available.length === applicable.length;
    const officialScore = allHaveValue ? weightedMean(applicable.map(x => ({ value: x.state.effectiveScore as number, weight: x.weight }))) : null;

    categories.set(category.id, {
      categoryId: category.id,
      moduleId: category.module,
      confirmedNotApplicable: false,
      partialScore: scoreOut(partialScore),
      officialScore: scoreOut(officialScore),
      confidence: unitOut(confidence),
      coverage: unitOut(coverage),
      applicableCellCount: applicable.length,
      finalizedCellCount: applicable.filter(x => x.state.status === "DIRECT_FINAL").length,
      unresolvedCellCount: applicable.filter(x => x.state.effectiveScore === null).length,
      reviewRequiredCellCount: applicable.filter(x => x.state.status === "REVIEW_REQUIRED" || x.state.hasHardContradiction).length,
      baseWeightPct: category.weightPct,
      effectiveModuleWeightPct: null,
      partialContributionToModule: null,
      officialContributionToModule: null
    });
  }
  return categories;
}

function calculateModules(
  definition: MethodologyDefinition,
  categories: Map<string, CategorySnapshot>
): Map<string, ModuleSnapshot> {
  const modules = new Map<string, ModuleSnapshot>();

  for (const module of definition.modules) {
    const rows = definition.categories
      .filter(category => category.module === module.id)
      .map(def => ({ def, state: categories.get(def.id)! }))
      .filter(row => !row.state.confirmedNotApplicable);
    const denominator = rows.reduce((sum, row) => sum + row.def.weightPct, 0);
    const available = rows.filter(row => row.state.partialScore !== null);
    const availableWeight = available.reduce((sum, row) => sum + row.def.weightPct, 0);

    const partialScore = availableWeight === 0
      ? null
      : weightedMean(available.map(row => ({ value: row.state.partialScore as number, weight: row.def.weightPct })));
    const coverage = denominator === 0
      ? null
      : rows.reduce((sum, row) => sum + (row.state.coverage ?? 0) * row.def.weightPct, 0) / denominator;
    const confidenceRows = rows.filter(row => row.state.confidence !== null);
    const confidenceWeight = confidenceRows.reduce((sum, row) => sum + row.def.weightPct, 0);
    const confidence = confidenceWeight === 0
      ? null
      : weightedMean(confidenceRows.map(row => ({ value: row.state.confidence as number, weight: row.def.weightPct })));
    const officialScore = denominator === 0 || !rows.every(row => row.state.officialScore !== null)
      ? null
      : weightedMean(rows.map(row => ({ value: row.state.officialScore as number, weight: row.def.weightPct })));

    modules.set(module.id, {
      moduleId: module.id,
      partialScore: scoreOut(partialScore),
      officialScore: scoreOut(officialScore),
      confidence: unitOut(confidence),
      coverage: unitOut(coverage),
      applicableCategoryCount: rows.length,
      finalizedCategoryCount: rows.filter(row => row.state.officialScore !== null).length,
      unresolvedCategoryCount: rows.filter(row => row.state.partialScore === null).length,
      reviewRequiredCategoryCount: rows.filter(row => row.state.reviewRequiredCellCount > 0).length,
      baseWeightPct: module.weightPct,
      effectiveOverallWeightPct: null,
      partialContribution: null,
      officialContribution: null
    });
  }
  return modules;
}

function applyCategoryContributionLineage(
  definition: MethodologyDefinition,
  categories: Map<string, CategorySnapshot>
): void {
  for (const module of definition.modules) {
    const rows = definition.categories
      .filter(category => category.module === module.id)
      .map(def => ({ def, state: categories.get(def.id)! }))
      .filter(row => !row.state.confirmedNotApplicable);
    const partialRows = rows.filter(row => row.state.partialScore !== null);
    const partialDenominator = partialRows.reduce((sum, row) => sum + row.def.weightPct, 0);
    const officialDenominator = rows.reduce((sum, row) => sum + row.def.weightPct, 0);
    const moduleOfficial = rows.length > 0 && rows.every(row => row.state.officialScore !== null);

    for (const row of rows) {
      if (row.state.partialScore !== null && partialDenominator > 0) {
        row.state.effectiveModuleWeightPct = row.def.weightPct / partialDenominator * 100;
        row.state.partialContributionToModule = row.state.partialScore * row.state.effectiveModuleWeightPct / 100;
      }
      if (moduleOfficial && row.state.officialScore !== null && officialDenominator > 0) {
        const officialWeightPct = row.def.weightPct / officialDenominator * 100;
        row.state.officialContributionToModule = row.state.officialScore * officialWeightPct / 100;
      }
    }
  }
}

function calculateHierarchicalOverall(
  definition: MethodologyDefinition,
  categories: Map<string, CategorySnapshot>,
  modules: Map<string, ModuleSnapshot>
): OverallSnapshot {
  const applicableModules = definition.modules
    .map(def => ({ def, state: modules.get(def.id)! }))
    .filter(row => row.state.applicableCategoryCount > 0);
  const partialModules = applicableModules.filter(row => row.state.partialScore !== null);
  const partialWeight = partialModules.reduce((sum, row) => sum + row.def.weightPct, 0);
  const applicableWeight = applicableModules.reduce((sum, row) => sum + row.def.weightPct, 0);
  const confidenceModules = applicableModules.filter(row => row.state.confidence !== null);
  const confidenceWeight = confidenceModules.reduce((sum, row) => sum + row.def.weightPct, 0);

  const partialScore = partialWeight === 0
    ? null
    : weightedMean(partialModules.map(row => ({ value: row.state.partialScore as number, weight: row.def.weightPct })));
  const officialScore = applicableWeight === 0 || !applicableModules.every(row => row.state.officialScore !== null)
    ? null
    : weightedMean(applicableModules.map(row => ({ value: row.state.officialScore as number, weight: row.def.weightPct })));
  const confidence = confidenceWeight === 0
    ? null
    : weightedMean(confidenceModules.map(row => ({ value: row.state.confidence as number, weight: row.def.weightPct })));
  const coverage = applicableWeight === 0
    ? null
    : applicableModules.reduce((sum, row) => sum + (row.state.coverage ?? 0) * row.def.weightPct, 0) / applicableWeight;
  const applicableCategories = [...categories.values()].filter(category => !category.confirmedNotApplicable);

  return {
    partialScore: scoreOut(partialScore),
    officialScore: scoreOut(officialScore),
    confidence: unitOut(confidence),
    coverage: unitOut(coverage),
    applicableCategoryCount: applicableCategories.length,
    completeCategoryCount: applicableCategories.filter(category => category.officialScore !== null).length,
    applicableModuleCount: applicableModules.length,
    completeModuleCount: applicableModules.filter(module => module.state.officialScore !== null).length,
    aggregationVersion: "HIERARCHICAL_V13"
  };
}

function applyModuleContributionLineage(
  definition: MethodologyDefinition,
  modules: Map<string, ModuleSnapshot>,
  overall: OverallSnapshot
): void {
  const applicable = definition.modules
    .map(def => ({ def, state: modules.get(def.id)! }))
    .filter(row => row.state.applicableCategoryCount > 0);
  const partialRows = applicable.filter(row => row.state.partialScore !== null);
  const partialDenominator = partialRows.reduce((sum, row) => sum + row.def.weightPct, 0);
  const officialDenominator = applicable.reduce((sum, row) => sum + row.def.weightPct, 0);

  for (const row of partialRows) {
    row.state.effectiveOverallWeightPct = partialDenominator === 0 ? null : row.def.weightPct / partialDenominator * 100;
    row.state.partialContribution = row.state.effectiveOverallWeightPct === null
      ? null
      : (row.state.partialScore as number) * row.state.effectiveOverallWeightPct / 100;
  }
  if (overall.officialScore !== null && officialDenominator > 0) {
    for (const row of applicable) {
      const weightPct = row.def.weightPct / officialDenominator * 100;
      row.state.officialContribution = (row.state.officialScore as number) * weightPct / 100;
    }
  }
}

function calculatePurposes(
  definition: MethodologyDefinition,
  categories: Map<string, CategorySnapshot>,
  availableOnly: boolean
): Map<string, PurposeSnapshot> {
  const purposes = new Map<string, PurposeSnapshot>();
  const pContract = definition.contracts.purposes;
  const mappingByCategory = new Map<string, any>((pContract.mapping ?? []).map((m: any) => [m.category, m]));
  const applicableCategories = definition.categories
    .map(def => ({ def, state: categories.get(def.id)! }))
    .filter(row => !row.state.confirmedNotApplicable);

  for (const purpose of pContract.purposes ?? []) {
    const rows = applicableCategories
      .map(row => {
        const relevance = Number(mappingByCategory.get(row.def.id)?.relevance?.[purpose.id] ?? 0);
        return { ...row, weight: row.def.weightPct * relevance };
      })
      .filter(row => row.weight > 0);
    const denominator = rows.reduce((sum, row) => sum + row.weight, 0);
    const partialRows = availableOnly ? rows.filter(row => row.state.partialScore !== null) : rows;
    const partialDenominator = partialRows.reduce((sum, row) => sum + row.weight, 0);
    const partialScore = partialDenominator === 0
      ? null
      : availableOnly
        ? weightedMean(partialRows.map(row => ({ value: row.state.partialScore as number, weight: row.weight })))
        : rows.reduce((sum, row) => sum + (row.state.partialScore ?? 0) * row.weight, 0) / denominator;
    const officialScore = denominator === 0 || !rows.every(row => row.state.officialScore !== null)
      ? null
      : weightedMean(rows.map(row => ({ value: row.state.officialScore as number, weight: row.weight })));
    const confidenceRows = availableOnly ? rows.filter(row => row.state.confidence !== null) : rows;
    const confidenceDenominator = confidenceRows.reduce((sum, row) => sum + row.weight, 0);
    const confidence = confidenceDenominator === 0
      ? null
      : availableOnly
        ? weightedMean(confidenceRows.map(row => ({ value: row.state.confidence as number, weight: row.weight })))
        : rows.reduce((sum, row) => sum + (row.state.confidence ?? 0) * row.weight, 0) / denominator;
    const coverage = denominator === 0
      ? null
      : rows.reduce((sum, row) => sum + (row.state.coverage ?? 0) * row.weight, 0) / denominator;
    purposes.set(purpose.id, { purposeId: purpose.id, partialScore: scoreOut(partialScore), officialScore: scoreOut(officialScore), confidence: unitOut(confidence), coverage: unitOut(coverage) });
  }
  return purposes;
}

function calculateOutcomePriorities(
  definition: MethodologyDefinition,
  categories: Map<string, CategorySnapshot>,
  purposes: Map<string, PurposeSnapshot>
): {
  outcomePriorities: Map<string, OutcomePrioritySnapshot>;
  categoryOutcomePriorities: Map<string, CategoryOutcomePrioritySnapshot>;
} {
  const outcomePriorities = new Map<string, OutcomePrioritySnapshot>();
  const categoryOutcomePriorities = new Map<string, CategoryOutcomePrioritySnapshot>();
  const purposeContract = definition.contracts.purposes;
  const mappingByCategory = new Map<string, any>((purposeContract.mapping ?? []).map((m: any) => [m.category, m]));

  for (const purpose of purposeContract.purposes ?? []) {
    const purposeId = String(purpose.id);
    const purposeState = purposes.get(purposeId);
    const rows = definition.categories
      .map(def => ({
        def,
        state: categories.get(def.id)!,
        relevance: Number(mappingByCategory.get(def.id)?.relevance?.[purposeId] ?? 0)
      }))
      .filter(row => !row.state.confirmedNotApplicable && row.relevance > 0 && row.state.partialScore !== null);

    const structuralDenominator = rows.reduce((sum, row) => sum + row.def.weightPct * row.relevance, 0);
    const preliminary = rows.map(row => {
      const structuralWeight = row.def.weightPct * row.relevance;
      const effectivePurposeWeightPct = pctOut(structuralDenominator === 0 ? 0 : structuralWeight / structuralDenominator * 100) as number;
      const categoryScore = row.state.partialScore as number;
      const categoryGap = scoreOut(Math.max(0, 100 - categoryScore)) as number;
      const gapContribution = scoreOut(categoryGap * effectivePurposeWeightPct / 100) as number;
      const evidenceQuality = Math.max(0, Math.min(1, (row.state.confidence ?? 0) * (row.state.coverage ?? 0)));
      const confidenceAdjustedGapContribution = scoreOut(gapContribution * evidenceQuality) as number;
      const uncertaintyGapContribution = scoreOut(Math.max(0, gapContribution - confidenceAdjustedGapContribution)) as number;
      return {
        purposeId, categoryId: row.def.id, relevance: row.relevance, baseCategoryWeightPct: row.def.weightPct,
        structuralWeight, effectivePurposeWeightPct, categoryScore, categoryGap, confidence: row.state.confidence, coverage: row.state.coverage,
        gapContribution, confidenceAdjustedGapContribution, uncertaintyGapContribution
      };
    });

    const ranked = preliminary
      .sort((a, b) => b.gapContribution - a.gapContribution || b.confidenceAdjustedGapContribution - a.confidenceAdjustedGapContribution || a.categoryId.localeCompare(b.categoryId));
    const maxGapContribution = ranked[0]?.gapContribution ?? 0;
    ranked.forEach((row, index) => {
      categoryOutcomePriorities.set(`${purposeId}:${row.categoryId}`, {
        ...row,
        relativePriority: maxGapContribution <= 0 ? 0 : unitOut(row.gapContribution / maxGapContribution) as number,
        rank: index + 1
      });
    });

    const knownGap = purposeState?.partialScore === null || purposeState?.partialScore === undefined
      ? null
      : scoreOut(Math.max(0, 100 - purposeState.partialScore));
    const confidenceAdjustedKnownGap = ranked.length === 0 ? null : scoreOut(ranked.reduce((sum, row) => sum + row.confidenceAdjustedGapContribution, 0));
    const uncertaintyKnownGap = knownGap === null || confidenceAdjustedKnownGap === null ? null : scoreOut(Math.max(0, knownGap - confidenceAdjustedKnownGap));
    outcomePriorities.set(purposeId, {
      purposeId,
      score: purposeState?.partialScore ?? null,
      officialScore: purposeState?.officialScore ?? null,
      confidence: purposeState?.confidence ?? null,
      coverage: purposeState?.coverage ?? null,
      knownGap,
      confidenceAdjustedKnownGap,
      uncertaintyKnownGap,
      rankedCategoryCount: ranked.length,
      topPriorityCategoryIds: ranked.slice(0, 5).map(row => row.categoryId),
      calculationVersion: "OUTCOME_PRIORITY_V13",
      causalLiftClaimAllowed: false
    });
  }

  return { outcomePriorities, categoryOutcomePriorities };
}

function isMaturityScoredCell(definition: MethodologyDefinition, categoryId: string, cellId: string): boolean {
  if (cellId === "C01") return false;
  // Maturity membership is a property of the diagnostic construct, not whether
  // the current cell is directly askable. INFER_ONLY D45 cells retain numeric
  // scoring semantics and must remain in the maturity denominator when filled
  // from governed derived evidence. Context-only D42 has no numeric options and
  // is therefore excluded.
  for (let path = 1; path <= 4; path++) {
    const question = definition.questionByCategoryCellPath.get(`${categoryId}:${cellId}:${path}`);
    if (!question) continue;
    if (question.options.some(option => option.score !== null)) return true;
  }
  return false;
}

function scoreOut(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  return snapFloatingArtifact(clamp(value, 0, 100));
}

function unitOut(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  return snapFloatingArtifact(clamp(value, 0, 1));
}

function pctOut(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  return snapFloatingArtifact(clamp(value, 0, 100));
}

function snapFloatingArtifact(value: number): number {
  const nearestInteger = Math.round(value);
  return Math.abs(value - nearestInteger) <= 1e-10 ? nearestInteger : value;
}

function calculateLegacyAggregates(
  definition: MethodologyDefinition,
  cells: Map<string, CellSnapshot>
): AggregateSnapshots {
  const categories = new Map<string, CategorySnapshot>();

  for (const category of definition.categories) {
    const c01 = cells.get(mapKey(category.id, "C01"))!;
    const confirmedNotApplicable = c01.status === "NOT_APPLICABLE" && !c01.hasHardContradiction;
    if (confirmedNotApplicable) {
      categories.set(category.id, emptyCategory(category, true));
      continue;
    }
    const applicable = definition.cells
      .filter(c => c.id !== "C01")
      .map(c => ({ def: c, state: cells.get(mapKey(category.id, c.id))! }))
      .filter(x => x.state.status !== "NOT_APPLICABLE");
    const denominator = applicable.reduce((sum, x) => sum + x.def.weightPct, 0);
    const partialNumerator = applicable.reduce((sum, x) => sum + (x.state.effectiveScore === null ? 0 : x.state.effectiveScore * x.def.weightPct), 0);
    const partialScore = denominator === 0 ? null : partialNumerator / denominator;
    const coverageNumerator = applicable.reduce((sum, x) => sum + (x.state.effectiveScore === null ? 0 : x.def.weightPct), 0);
    const coverage = denominator === 0 ? null : coverageNumerator / denominator;
    const confidence = denominator === 0 ? null : applicable.reduce((sum, x) => sum + x.state.effectiveConfidence * x.def.weightPct, 0) / denominator;
    const allHaveValue = applicable.every(x => x.state.effectiveScore !== null);
    const officialScore = allHaveValue
      ? weightedMean(applicable.map(x => ({ value: x.state.effectiveScore as number, weight: x.def.weightPct })))
      : null;
    categories.set(category.id, {
      categoryId: category.id,
      moduleId: category.module,
      confirmedNotApplicable: false,
      partialScore: scoreOut(partialScore),
      officialScore: scoreOut(officialScore),
      confidence: unitOut(confidence),
      coverage: unitOut(coverage),
      applicableCellCount: applicable.length,
      finalizedCellCount: applicable.filter(x => x.state.status === "DIRECT_FINAL").length,
      unresolvedCellCount: applicable.filter(x => x.state.effectiveScore === null).length,
      reviewRequiredCellCount: applicable.filter(x => x.state.status === "REVIEW_REQUIRED" || x.state.hasHardContradiction).length,
      baseWeightPct: category.weightPct,
      effectiveModuleWeightPct: null,
      partialContributionToModule: null,
      officialContributionToModule: null
    });
  }

  const modules = calculateModules(definition, categories);
  applyCategoryContributionLineage(definition, categories);
  const applicableCategories = definition.categories
    .map(def => ({ def, state: categories.get(def.id)! }))
    .filter(row => !row.state.confirmedNotApplicable);
  const categoryDenominator = applicableCategories.reduce((sum, row) => sum + row.def.weightPct, 0);
  const overall: OverallSnapshot = {
    partialScore: categoryDenominator === 0 ? null : applicableCategories.reduce((sum, row) => sum + (row.state.partialScore ?? 0) * row.def.weightPct, 0) / categoryDenominator,
    officialScore: categoryDenominator === 0 || !applicableCategories.every(row => row.state.officialScore !== null)
      ? null
      : weightedMean(applicableCategories.map(row => ({ value: row.state.officialScore as number, weight: row.def.weightPct }))),
    confidence: categoryDenominator === 0 ? null : applicableCategories.reduce((sum, row) => sum + (row.state.confidence ?? 0) * row.def.weightPct, 0) / categoryDenominator,
    coverage: categoryDenominator === 0 ? null : applicableCategories.reduce((sum, row) => sum + (row.state.coverage ?? 0) * row.def.weightPct, 0) / categoryDenominator,
    applicableCategoryCount: applicableCategories.length,
    completeCategoryCount: applicableCategories.filter(row => row.state.officialScore !== null).length,
    applicableModuleCount: [...modules.values()].filter(module => module.applicableCategoryCount > 0).length,
    completeModuleCount: [...modules.values()].filter(module => module.applicableCategoryCount > 0 && module.officialScore !== null).length,
    aggregationVersion: "LEGACY"
  };
  applyModuleContributionLineage(definition, modules, overall);
  const purposes = calculatePurposes(definition, categories, false);
  const { outcomePriorities, categoryOutcomePriorities } = calculateOutcomePriorities(definition, categories, purposes);
  return { categories, modules, overall, purposes, outcomePriorities, categoryOutcomePriorities };
}

function emptyCategory(category: MethodologyDefinition["categories"][number], confirmedNotApplicable: boolean): CategorySnapshot {
  return {
    categoryId: category.id,
    moduleId: category.module,
    confirmedNotApplicable,
    partialScore: null,
    officialScore: null,
    confidence: null,
    coverage: null,
    applicableCellCount: 0,
    finalizedCellCount: 0,
    unresolvedCellCount: 0,
    reviewRequiredCellCount: 0,
    baseWeightPct: category.weightPct,
    effectiveModuleWeightPct: null,
    partialContributionToModule: null,
    officialContributionToModule: null
  };
}
