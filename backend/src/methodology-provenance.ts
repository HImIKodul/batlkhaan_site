import { allDomainMethodologyTargets } from "./domain-methodology.js";

/**
 * Question-bank version belonging to one methodology version. Resolution order:
 *   1. the value persisted with the methodology version at import (methodology_versions.validation.questionBankVersion);
 *   2. the repository's declared release table, for exactly that domain AND methodology version;
 *   3. otherwise undefined (callers refuse to stamp an unpinned provenance value).
 * It never falls back to a global/Marketing target.
 */
export function resolveQuestionBankVersion(input: { domainCode?: string | null; version: string; validation?: unknown }): string | undefined {
  const stored = (input.validation as { questionBankVersion?: unknown } | null | undefined)?.questionBankVersion;
  if (typeof stored === "string" && stored.trim()) return stored.trim();
  const domain = input.domainCode ?? "marketing";
  return allDomainMethodologyTargets().find(t => t.domainCode === domain && t.methodologyVersion === input.version)?.questionBankVersion;
}
