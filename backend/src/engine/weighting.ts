import type { CategoryDef, CellDef, ModuleDef } from "./types.js";

// PostgreSQL persists these imported weights as DECIMAL(8,4).  The frozen
// methodology bundles sum to exactly 100 before persistence, but independent
// 4-decimal rounding can introduce at most 0.00005 per stored term.
const FLOAT_EPSILON = 1e-9;
const DECIMAL_4_MAX_ROUNDING_PER_TERM = 0.00005;

export interface WeightModelValidation {
  moduleWeightTotal: number;
  capabilityWeightTotal: number;
  scoredCellWeightTotal: number;
  moduleCapabilityTotals: Record<string, number>;
}

export function validateHierarchicalWeights(
  modules: ModuleDef[],
  categories: CategoryDef[],
  cells: CellDef[]
): WeightModelValidation {
  if (![5,8].includes(modules.length)) throw new Error(`Expected 5 BusinessMRI goals or 8 Marketing modules, received ${modules.length}`);
  if (categories.length !== 64) throw new Error(`Expected 64 capabilities, received ${categories.length}`);
  if (cells.length !== 48) throw new Error(`Expected 48 diagnostic cell templates, received ${cells.length}`);

  const moduleWeightTotal = sum(modules.map(m => m.weightPct));
  const capabilityWeightTotal = sum(categories.map(c => c.weightPct));
  const scoredCellWeightTotal = sum(cells.filter(c => c.id !== "C01").map(c => c.weightPct));

  assertStoredDecimalSumClose(moduleWeightTotal, 100, modules.length, "module weights must total 100%");
  assertStoredDecimalSumClose(capabilityWeightTotal, 100, categories.length, "64 capability weights must total 100%");
  const scoredCells = cells.filter(c => c.id !== "C01");
  assertStoredDecimalSumClose(scoredCellWeightTotal, 100, scoredCells.length, "scored diagnostic-cell weights must total 100%");

  const moduleIds = new Set(modules.map(m => m.id));
  const moduleCapabilityTotals: Record<string, number> = {};
  for (const module of modules) {
    const rows = categories.filter(c => c.module === module.id);
    if (!rows.length) throw new Error(`Module ${module.code} has no capabilities`);
    const total = sum(rows.map(c => c.weightPct));
    moduleCapabilityTotals[module.id] = total;
    assertStoredDecimalSumClose(total, module.weightPct, rows.length, `capability weights in module ${module.code} must equal module weight`);
  }
  for (const category of categories) {
    if (!moduleIds.has(category.module)) throw new Error(`Capability ${category.id} references unknown module ${category.module}`);
    if (!(category.weightPct > 0)) throw new Error(`Capability ${category.id} must have positive importance weight`);
  }

  return { moduleWeightTotal, capabilityWeightTotal, scoredCellWeightTotal, moduleCapabilityTotals };
}

function assertStoredDecimalSumClose(actual: number, expected: number, termCount: number, message: string): void {
  // Each source term is exact in the frozen methodology bundle, but the DB
  // stores it at scale=4.  Accept only the worst-case cumulative storage
  // rounding envelope; this is not a general scoring tolerance.
  const tolerance = Math.max(FLOAT_EPSILON, termCount * DECIMAL_4_MAX_ROUNDING_PER_TERM + FLOAT_EPSILON);
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${message}: expected ${expected}, received ${actual}, tolerance ${tolerance}`);
  }
}

function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}
