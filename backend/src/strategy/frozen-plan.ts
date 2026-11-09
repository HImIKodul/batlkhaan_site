import type { ActionPlan, PlanMilestone, RecommendationResult, RootCauseResult, StrategyResult } from "./types.js";

export const STRATEGY_PLAN_SCHEMA_VERSION = "MMRI-STRATEGY-PLAN-1.0" as const;

export interface ImmutablePlanMilestone extends Omit<PlanMilestone, "status"> {}

export interface ImmutableActionPlan extends Omit<ActionPlan, "milestones"> {
  milestones: ImmutablePlanMilestone[];
}

export interface FrozenStrategyPlanSnapshot {
  schemaVersion: typeof STRATEGY_PLAN_SCHEMA_VERSION;
  assessmentId: string;
  methodologyVersion: string;
  methodologyBundleSha256: string;
  runtimeSnapshotHash: string;
  diagnosisResultHash: string;
  generatedAt: string;
  strategyHash: string;
  planHash: string;
  rootCause: RootCauseResult;
  recommendations: RecommendationResult;
  actionPlan: ImmutableActionPlan;
  guardrail: {
    diagnosisBindingRequired: true;
    planDefinitionImmutable: true;
    milestoneProgressMutable: true;
    causalFinancialLiftClaimAllowed: false;
    roiPredictionAllowed: false;
  };
}

export function immutableActionPlan(plan: ActionPlan): ImmutableActionPlan {
  return {
    version: plan.version,
    capacityLevel: plan.capacityLevel,
    windowDays: plan.windowDays,
    horizons: plan.horizons.map(h => ({ ...h })),
    includedRecommendationIds: [...plan.includedRecommendationIds],
    dependencies: (plan.dependencies ?? []).map(d => ({ ...d, sourceTraceIds: [...d.sourceTraceIds] })),
    milestones: plan.milestones.map(({ status: _status, ...m }) => ({ ...m, sourceTraceIds: [...m.sourceTraceIds] })),
    remeasurementHorizons: [...plan.remeasurementHorizons]
  };
}

export function strategyHashMaterial(diagnosisResultHash: string, strategy: StrategyResult): unknown {
  return {
    diagnosisResultHash,
    rootCause: strategy.rootCause,
    recommendations: strategy.recommendations,
    actionPlan: immutableActionPlan(strategy.actionPlan)
  };
}

export function planHashMaterial(diagnosisResultHash: string, plan: ActionPlan): unknown {
  return {
    diagnosisResultHash,
    actionPlan: immutableActionPlan(plan)
  };
}

export function buildFrozenStrategyPlan(input: {
  assessmentId: string;
  methodologyVersion: string;
  methodologyBundleSha256: string;
  runtimeSnapshotHash: string;
  diagnosisResultHash: string;
  generatedAt: string;
  strategyHash: string;
  planHash: string;
  strategy: StrategyResult;
}): FrozenStrategyPlanSnapshot {
  if (!input.diagnosisResultHash) throw new Error("Frozen strategic priorities require diagnosisResultHash");
  if (!input.strategyHash || !input.planHash) throw new Error("Frozen strategic priorities require strategyHash and planHash");
  return {
    schemaVersion: STRATEGY_PLAN_SCHEMA_VERSION,
    assessmentId: input.assessmentId,
    methodologyVersion: input.methodologyVersion,
    methodologyBundleSha256: input.methodologyBundleSha256,
    runtimeSnapshotHash: input.runtimeSnapshotHash,
    diagnosisResultHash: input.diagnosisResultHash,
    generatedAt: input.generatedAt,
    strategyHash: input.strategyHash,
    planHash: input.planHash,
    rootCause: input.strategy.rootCause,
    recommendations: input.strategy.recommendations,
    actionPlan: immutableActionPlan(input.strategy.actionPlan),
    guardrail: {
      diagnosisBindingRequired: true,
      planDefinitionImmutable: true,
      milestoneProgressMutable: true,
      causalFinancialLiftClaimAllowed: false,
      roiPredictionAllowed: false
    }
  };
}

export function rehydrateActionPlan(snapshot: FrozenStrategyPlanSnapshot, statusByMilestoneId: Map<string, PlanMilestone["status"]>): ActionPlan {
  return {
    ...snapshot.actionPlan,
    horizons: snapshot.actionPlan.horizons.map(h => ({ ...h })),
    includedRecommendationIds: [...snapshot.actionPlan.includedRecommendationIds],
    dependencies: (snapshot.actionPlan.dependencies ?? []).map(d => ({ ...d, sourceTraceIds: [...d.sourceTraceIds] })),
    milestones: snapshot.actionPlan.milestones.map(m => ({
      ...m,
      sourceTraceIds: [...m.sourceTraceIds],
      status: statusByMilestoneId.get(m.id) ?? "NOT_STARTED"
    })),
    remeasurementHorizons: [...snapshot.actionPlan.remeasurementHorizons]
  };
}
