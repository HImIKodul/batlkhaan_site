import type { EngineContracts, SourceKind } from "./types.js";
import { clamp } from "./utils.js";

export interface RespondentAuthorityMetadata {
  handsOnResponsibilityDeclared?: boolean;
  handsOnCategoryIds?: string[];
  handsOnCellIds?: string[];
}

export function authorityFactor(contracts: EngineContracts, categoryId: string, cellId: string, roleId: string): number {
  const domain = Number(contracts.authority.domainAuthority?.[categoryId]?.[roleId] ?? 0);
  const construct = Number(contracts.authority.constructAuthority?.[cellId]?.[roleId] ?? 0);
  return clamp(Math.min(domain, construct), 0, 1);
}

/**
 * Step 12 cognitive-authority rule carried into runtime:
 * role title alone does not prove knowledge, but an executive owner who explicitly
 * declares hands-on responsibility may receive a bounded authority override for
 * the declared scope. Company size never triggers this automatically.
 */
export function authorityFactorWithMetadata(
  contracts: EngineContracts,
  categoryId: string,
  cellId: string,
  roleId: string,
  metadata?: RespondentAuthorityMetadata | null
): number {
  const base = authorityFactor(contracts, categoryId, cellId, roleId);
  const policy = contracts.authority.handsOnResponsibilityOverride;
  if (!policy?.enabled || roleId !== String(policy.allowedRoleId ?? "R01")) return base;
  if (!metadata?.handsOnResponsibilityDeclared) return base;

  const categories = Array.isArray(metadata.handsOnCategoryIds) ? metadata.handsOnCategoryIds : [];
  const cells = Array.isArray(metadata.handsOnCellIds) ? metadata.handsOnCellIds : [];
  const inCategoryScope = categories.length === 0 || categories.includes(categoryId);
  const inCellScope = cells.length === 0 || cells.includes(cellId);
  if (!inCategoryScope || !inCellScope) return base;

  const cap = clamp(Number(policy.cap ?? 0.90), 0, 1);
  const floor = clamp(Number(policy.declaredHandsOnAuthority ?? 0.90), 0, cap);
  return clamp(Math.max(base, floor), 0, cap);
}

export function reliabilityForPath(contracts: EngineContracts, path: number, authority: number): number {
  const config = contracts.authority.reliabilityAdjustment?.paths?.[String(path)];
  if (!config) throw new Error(`Missing authority reliability configuration for path ${path}`);
  const base = Number(config.baseReliability);
  const sensitivity = Number(config.authoritySensitivity);
  return clamp(base * (1 - sensitivity * (1 - clamp(authority, 0, 1))), 0, 1);
}

export function sourceKindForPath(contracts: EngineContracts, path: number): SourceKind {
  const kind = contracts.routing.pathSelection?.pathSourceKind?.[String(path)];
  if (!kind) throw new Error(`Missing source kind for path ${path}`);
  return kind as SourceKind;
}
