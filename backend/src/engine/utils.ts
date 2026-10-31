export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function weightedMean(rows: Array<{ value: number; weight: number }>): number | null {
  const denominator = rows.reduce((sum, row) => sum + row.weight, 0);
  if (denominator === 0) return null;
  return rows.reduce((sum, row) => sum + row.value * row.weight, 0) / denominator;
}

export function product(values: number[]): number {
  return values.reduce((p, v) => p * v, 1);
}

export function mapKey(categoryId: string, cellId: string): string {
  return `${categoryId}:${cellId}`;
}

export function questionKey(categoryId: string, cellId: string, path: number): string {
  return `${categoryId}:${cellId}:${path}`;
}

export function cellWeightPct(definition: import("./types.js").MethodologyDefinition, categoryId: string, cellId: string, fallback: number): number {
  return definition.cellWeightByCategoryCell?.get(`${categoryId}:${cellId}`) ?? fallback;
}
