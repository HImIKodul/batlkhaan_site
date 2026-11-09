import type { DirectEvidence, MethodologyDefinition, QuestionDef } from "./types.js";
import { authorityFactor, reliabilityForPath } from "./authority.js";
import { clamp } from "./utils.js";

export function evidenceFromAnswer(args: {
  definition: MethodologyDefinition;
  question: QuestionDef;
  optionIndex: number;
  respondentRoleId?: string;
  explicitAuthority?: number;
}): DirectEvidence {
  const { definition, question, optionIndex } = args;
  const option = question.options.find(o => o.optionIndex === optionIndex);
  if (!option) throw new Error(`Invalid option ${optionIndex} for ${question.id}`);

  const authority = clamp(args.explicitAuthority !== undefined
    ? args.explicitAuthority
    : args.respondentRoleId
      ? authorityFactor(definition.contracts, question.categoryId, question.cellId, args.respondentRoleId)
      : 0.75, 0, 1);

  return {
    questionId: question.id,
    categoryId: question.categoryId,
    cellId: question.cellId,
    path: question.path,
    sourceKind: question.sourceKind,
    score: option.score,
    state: option.state,
    optionIndex,
    optionLabel: option.labelMn,
    scoringProfileCode: question.scoringProfileCode,
    authority,
    reliability: reliabilityForPath(definition.contracts, question.path, authority),
    respondentRoleId: args.respondentRoleId
  };
}
