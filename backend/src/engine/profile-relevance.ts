import type { MethodologyDefinition, ProfileAnswer } from "./types.js";
import { clamp } from "./utils.js";

export function calculateProfileRelevance(definition: MethodologyDefinition, answers: ProfileAnswer[] = []): Map<string, number> {
  const contract = definition.contracts.profileRelevance;
  const answerMap = new Map(answers.map(a => [a.questionId, a.optionIndexes]));
  const result = new Map<string, number>();
  const selectedByQuestionCategory = new Map<string, number>();

  for (const rule of contract.rules ?? []) {
    const selected = answerMap.get(rule.questionId);
    if (!selected || selected.length === 0) continue;
    if (!ruleMatches(rule, selected)) continue;
    const key = `${rule.questionId}:${rule.category}`;
    const modifier = Number(rule.modifier);
    const current = selectedByQuestionCategory.get(key);
    if (current === undefined || Math.abs(modifier) > Math.abs(current) || (Math.abs(modifier) === Math.abs(current) && modifier > current)) {
      selectedByQuestionCategory.set(key, modifier);
    }
  }

  for (const cat of definition.categories) {
    let pos = 0;
    let neg = 0;
    for (const [key, modifier] of selectedByQuestionCategory) {
      if (!key.endsWith(`:${cat.id}`)) continue;
      if (modifier >= 0) pos += modifier; else neg += modifier;
    }
    pos = Math.min(Number(contract.modifierAggregation.positiveCap ?? 0.30), Math.max(0, pos));
    neg = Math.max(Number(contract.modifierAggregation.negativeCap ?? -0.25), Math.min(0, neg));
    const floor = Number(contract.modifierAggregation.floor ?? 0.35);
    const ceiling = Number(contract.modifierAggregation.ceiling ?? 1.0);
    result.set(cat.id, clamp(cat.baseProfileRelevance + pos + neg, floor, ceiling));
  }
  return result;
}

function ruleMatches(rule: any, selected: number[]): boolean {
  const values = (rule.values ?? []).map(Number);
  switch (rule.conditionType) {
    case "OPTION_INDEX":
      return selected.some((v: number) => values.includes(v));
    case "MULTI_ANY":
    case "MULTI_CONTAINS":
      return selected.some((v: number) => values.includes(v));
    case "MULTI_ALL":
      return values.every((v: number) => selected.includes(v));
    case "MULTI_NONE_OF":
      return values.every((v: number) => !selected.includes(v));
    default:
      return false;
  }
}
