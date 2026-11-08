export type AssessmentMode='QUICK'|'FULL';
export type AssessmentStatus='PROFILE_PENDING'|'IN_PROGRESS'|'PAUSED'|'COMPLETED'|'COMPLETED_WITH_REVIEW'|'EXHAUSTED'|string;
export type MilestoneStatus='NOT_STARTED'|'IN_PROGRESS'|'DONE'|'BLOCKED'|'SKIPPED';
export type HorizonId='H0'|'H1'|'H2'|'H3'|'H4';
export type DomainCode='it'|'marketing'|'finance'|'people'|'operations';

export interface User { id:string; email:string; displayName?:string|null; status?:string; }
export interface AuthResponse { user:User; accessToken:string; accessTokenExpiresIn?:number; }
export interface Company { id:string; name:string; industry?:string|null; businessModel?:string|null; employeeCount?:number|null; companyAgeYears?:number|null; marketType?:string|null; country?:string|null; profile?:{assessmentProfileAnswers?:ProfileAnswerInput[];basicInfoAnswersV2?:ProfileAnswerInput[];[key:string]:unknown}|null; role?:string; createdAt?:string; updatedAt?:string; }
export interface ProfileQuestionOption { optionIndex:number; labelMn:string; score?:number|null; state?:string|null; }
export interface ProfileQuestion { id:string; textMn:string; type:'SINGLE_SELECT'|'MULTI_SELECT'|string; options:ProfileQuestionOption[]; }
export interface ProfileAnswerInput { questionId:string; optionIndexes:number[]; }
export interface RespondentRole { id:string; code:string; labelMn:string; scopeMn?:string; }
export interface PublicQuestion { id:string; contextMn?:string|null; textMn:string; options:ProfileQuestionOption[]; }
export interface RoutingPayload { state:string; stopReason?:string; nextQuestion:PublicQuestion|null; questionIssueId?:string|null; assessmentRevision:number; routingRevision:number; eventSequence:number; saveStatus?:'SAVED'|'SAVING'|'ERROR'|string; draft?:{questionIssueId:string;questionId:string;draft:{optionIndex?:number|null}|Record<string,unknown>;draftRevision:number;serverAckAt:string}|null; }
export interface AssessmentSummary {
  /** false while a mandatory review has not published: scores are withheld and no report-ready notice may be shown */
  reportAvailable?:boolean; reviewStatus?:string|null;
  id:string; companyId:string; companyName?:string; domainCode:DomainCode; methodologyVersion:string; mode:AssessmentMode|null; status:AssessmentStatus; routingState?:string|null;
  answeredQuestions?:number; askedQuestions?:number; assessmentRevision:number; routingRevision:number; eventSequence:number; currentQuestionIssueId?:string|null;
  overall:{partialScore:number|null;officialScore:number|null;isOfficial:boolean;coverage:number|null};
  startedAt?:string|null;completedAt?:string|null;createdAt:string;updatedAt:string;
}

export interface AssessmentLifecycleStatus {
  assessmentId:string; domainCode?:DomainCode; methodologyVersion:string; mode:AssessmentMode|null; status:AssessmentStatus; routingState?:string|null; answeredQuestions:number; askedQuestions:number; assessmentRevision:number; routingRevision:number; eventSequence:number; currentQuestion:(PublicQuestion&{questionIssueId?:string})|null;
  lifecycle:{canStart:boolean;canPause:boolean;canResume:boolean;canRequestQuestion:boolean;canAnswer:boolean;canRequestCompletion:boolean;isTerminal:boolean};
  updatedAt?:string;
}
export interface AssessmentProgress { mode:AssessmentMode;status:AssessmentStatus;routingState?:string|null;answeredQuestions:number;askedQuestions:number;quick:{softMinimum:number;hardMaximum:number}|null;diagnosticCoverage:number|null;officialResultAvailable:boolean; }
export interface ScoreSlice { score?:number|null;partialScore:number|null;officialScore:number|null;confidence:number|null;coverage:number|null;band?:string|null;isOfficial:boolean; }
export interface CategoryResult extends ScoreSlice { id:string;nameMn:string;moduleId?:string;moduleCode?:string;moduleNameMn?:string;weightPct:number;effectiveModuleWeightPct?:number|null;contributionToModule?:number|null;confirmedNotApplicable:boolean;applicableCellCount:number;finalizedCellCount:number;unresolvedCellCount:number;reviewRequiredCellCount:number; }
export interface ModuleResult extends ScoreSlice { id:string;nameMn:string;weightPct:number;effectiveOverallWeightPct?:number|null;contribution?:number|null;applicableCategoryCount?:number;finalizedCategoryCount?:number;unresolvedCategoryCount?:number;reviewRequiredCategoryCount?:number;categoryIds:string[]; }
export interface PurposeResult extends ScoreSlice { id:string;nameMn:string; }
export interface OutcomePriorityCategory { categoryId:string;nameMn:string;purposeId:string;relevance:number;baseCategoryWeightPct:number;structuralWeight:number;effectivePurposeWeightPct:number;categoryScore:number;categoryGap:number;confidence:number|null;coverage:number|null;gapContribution:number;confidenceAdjustedGapContribution:number;uncertaintyGapContribution:number;relativePriority:number;rank:number; }
export interface OutcomePriorityResult { id:string;nameMn:string;purposeId:string;score:number|null;officialScore:number|null;confidence:number|null;coverage:number|null;knownGap:number|null;confidenceAdjustedKnownGap:number|null;uncertaintyKnownGap:number|null;rankedCategoryCount:number;topPriorityCategoryIds:string[];calculationVersion:'OUTCOME_PRIORITY_V13';causalLiftClaimAllowed:false;topCategories:OutcomePriorityCategory[];interpretation:'DIAGNOSTIC_PRIORITY_NOT_CAUSAL_LIFT'; }
export interface OutcomeGuardrail { causalFinancialLiftClaimAllowed:false;roiPredictionAllowed:false;meaning:string; }
export interface DiagnosisWeakCell { capabilityId:string;capabilityNameMn:string;moduleId:string;moduleCode:string;moduleNameMn:string;cellId:string;cellNameMn:string;score:number;confidence:number;confidenceState?:string|null;status:string;severity:number;rootClassification?:string|null;rootStrength?:number|null;sourceTraceIds:string[]; }
export interface DiagnosisEvidenceSummary { totalCells:number;applicableCells:number;knownCells:number;unknownCells:number;notApplicableCells:number;lockedCells:number;validatedCells:number;estimatedCells:number;reviewRequiredCells:number;contradictionCells:number;confidenceStateCounts:Record<string,number>;statusCounts:Record<string,number>;weakCellCount:number;validatedWeakCellCount:number;provisionalWeakCellCount:number;weakCells:DiagnosisWeakCell[];provisionalWeakCells:DiagnosisWeakCell[]; }
export interface DiagnosisStrength { capabilityId:string;capabilityNameMn:string;moduleId:string;moduleCode:string;moduleNameMn:string;score:number;confidence:number;coverage:number;sourceTraceIds:string[];basis?:'VALIDATED'|'RELATIVE_RANK'; }
export type DiagnosisWeakness=DiagnosisStrength;
export interface DiagnosisQuality { openContradictions:number;hardContradictions:number;reviewRequiredCells:number;incompleteCoverage:boolean;quickLimitReached:boolean;requiresReview:boolean;officialResultAvailable:boolean;quickEstimate:boolean;warnings:string[]; }
export interface DiagnosisTrace { methodologyVersion:string;methodologyBundleSha256:string;runtimeSnapshotHash:string;generatedAt:string;versions:Record<string,string>; }
export interface ResultsPayload { assessmentId:string;methodologyVersion:string;mode:AssessmentMode;status:AssessmentStatus;routingState?:string|null;overall:ScoreSlice & {applicableCategoryCount:number;completeCategoryCount:number;applicableModuleCount?:number;completeModuleCount?:number;aggregationVersion?:string;score?:number|null;band?:string|null};modules:ModuleResult[];categories:CategoryResult[];purposes:PurposeResult[];outcomePriorities?:OutcomePriorityResult[];outcomeGuardrail?:OutcomeGuardrail;openContradictions:number; schemaVersion?:'MMRI-DIAGNOSIS-RESULT-1.0';resultHash?:string;resultStatus?:string;metricType?:string;generatedAt?:string;methodologyBundleSha256?:string;capabilities?:CategoryResult[];businessOutcomes?:PurposeResult[];businessOutcomePriorities?:OutcomePriorityResult[];evidence?:DiagnosisEvidenceSummary;strengths?:{totalCount:number;items:DiagnosisStrength[]};weaknesses?:{totalCount:number;items:DiagnosisWeakness[]};rootCauses?:{weaknessThreshold:number;totalCount:number;selected:RootFinding[];isProvisional?:boolean;interpretation?:'DIAGNOSTIC_HYPOTHESIS_NOT_CAUSAL'};quality?:DiagnosisQuality;trace?:DiagnosisTrace; }

export interface RootFinding { id:string;categoryId:string;cellId:string;categoryValue:number|null;cellValue:number|null;categorySeverity:number;cellSeverity:number;rootStrength:number;classification:string;role:string;sourceTraceIds:string[]; }
export interface DiagnosisPayload { version:string;weaknessThreshold:number;findings:RootFinding[];selectedFindings:RootFinding[];diagnosisResultHash?:string;strategyHash?:string; }
export interface Recommendation { id:string;findingId:string;type:string;categoryId:string;cellId:string;titleMn:string;objectiveMn:string;actionMn:string;deliverableMn:string;kpiMn:string;ownerRoleId:string;sponsorRoleId:string;currentCellScore:number|null;targetCellScore:number|null;effortLevel:number;priority:number;priorityBand:string;sourceTraceIds:string[];affectedScopes?:Array<{findingId:string;categoryId:string;cellId:string}>;causalInterpretation?:'DIAGNOSTIC_HYPOTHESIS_NOT_CAUSAL';suppressedReason?:string; }
export interface RecommendationsPayload { schemaVersion:'MMRI-STRATEGY-PLAN-1.0';diagnosisResultHash:string;strategyHash:string;planHash:string;version:string;capacityLevel:number;selectedPurposeId:string|null;candidates:Recommendation[];executionActions:Recommendation[];evidenceActions:Recommendation[];suppressed:Recommendation[]; }
export interface MilestoneTracking { progressPercent:number;plannedStartDate?:string|null;plannedEndDate?:string|null;actualStartDate?:string|null;actualCompletedDate?:string|null;noteMn?:string|null;delayReasonMn?:string|null;metricCurrentValue?:number|null;metricTargetValue?:number|null;metricUnitMn?:string|null;updatedAt?:string|null; }
export interface MilestoneTrackingPatch { status?:MilestoneStatus;progressPercent?:number;plannedStartDate?:string|null;plannedEndDate?:string|null;actualStartDate?:string|null;actualCompletedDate?:string|null;noteMn?:string|null;delayReasonMn?:string|null;metricCurrentValue?:number|null;metricTargetValue?:number|null;metricUnitMn?:string|null; }
export interface PlanMilestone { id:string;recommendationId:string;findingId:string;horizon:HorizonId|'DEFERRED_BEYOND_V1';phaseIndex:number;requirement:string;titleMn:string;milestoneMn:string;deliverableMn:string;kpiMn:string;ownerRoleId:string;priorityBand:string;recommendationPriority:number;scheduleScore:number;sourceTraceIds:string[];status:MilestoneStatus;tracking?:MilestoneTracking; }
export interface ActionPlan { version:string;capacityLevel:number;windowDays:number;horizons:Array<{id:HorizonId;name:string;dayStart:number;dayEnd:number}>;includedRecommendationIds:string[];milestones:PlanMilestone[];remeasurementHorizons:HorizonId[]; }
export interface PlanProgress { actionProgress:Record<string,number>;planProgress:number;trackingProgress?:number;health:'ON_TRACK'|'AT_RISK'|'OFF_TRACK';overdueMilestones?:string[];overdueCriticalMilestones:string[];blockedCriticalMilestones:string[];skippedCriticalMilestones:string[]; }
export interface ActionPlanPayload { schemaVersion:'MMRI-STRATEGY-PLAN-1.0';diagnosisResultHash:string;strategyHash:string;planHash:string;planStartDate?:string;currentHorizon?:HorizonId;plan:ActionPlan;progress:PlanProgress; }

export interface ReportPurpose { id:string;nameMn:string;score:number|null;confidence:number|null;coverage:number|null;band:string|null; }
export interface ReportStrength { id:string;categoryId:string;nameMn:string;score:number;confidence:number;coverage:number;sourceTraceIds:string[];basis?:'VALIDATED'|'RELATIVE_RANK'; }
export interface ReportRoadmapRow { horizon:HorizonId;nameMn:string;dayStart?:number;dayEnd?:number;milestones:Array<{milestoneId:string;recommendationId:string;titleMn:string;milestoneMn:string;deliverableMn?:string;ownerRoleId:string;ownerRoleLabelMn?:string;kpiMn:string;sourceTraceIds:string[]}>; }
export interface FrozenReportPayload { payloadVersion:string;payloadHash:string;diagnosisResultHash:string;strategyHash:string;planHash:string;bindingHash:string;reportId:string;reportContractVersion:string;assessmentId:string;assessmentMode:AssessmentMode;assessmentStatus:string;routingState?:string|null;generatedAt:string;companyName:string;methodologyVersion:string;metricType:string;overall:{score:number|null;confidence:number|null;coverage:number|null;band:string|null};purposes:ReportPurpose[];strengths:ReportStrength[];weaknesses?:ReportStrength[];rootFindings:RootFinding[];priorityActions:Recommendation[];evidenceActions:Recommendation[];roadmap:ReportRoadmapRow[];risks:Array<{id:string;type:string;messageMn:string;sourceTraceIds:string[]}>;remeasurement:{horizon:HorizonId;labelMn:string};requiredWarnings:string[];displayDictionary:Record<string,string>; }
export interface NarrativeDraft { schemaVersion:string;payloadHash:string;sections:Array<{id:string;titleMn:string;claims:Array<{claimType:string;textMn:string;sourceTraceIds:string[];rootFindingId?:string|null;recommendationId?:string|null;milestoneId?:string|null}>}>; }
export interface ReportResponse { payload:FrozenReportPayload;narrative:NarrativeDraft;validation:{state:string;issues:Array<{checkId:string;severity:string;message:string}>;wordCount:number};generationState:string;aiAudit?:{provider?:string;modelIdentifier?:string|null;promptVersion?:string|null;validatorVersion?:string|null;generationAttemptCount?:number;narrativeHash?:string|null;providerError?:string|null}; }

export function displayScore(x:{officialScore?:number|null;partialScore?:number|null}|undefined|null):number|null{
  if(!x)return null; return x.officialScore ?? x.partialScore ?? null;
}
export function pct01(v:number|null|undefined):number|null{return v==null?null:Math.round(v*100);}
export function isTerminal(status:string|undefined|null){return !!status&&['COMPLETED','COMPLETED_WITH_REVIEW','EXHAUSTED'].includes(status);}
export function formatDate(value:string|null|undefined){if(!value)return '-';const d=new Date(value);if(Number.isNaN(d.getTime()))return '-';const p=(n:number)=>String(n).padStart(2,'0');return `${d.getFullYear()}.${p(d.getMonth()+1)}.${p(d.getDate())}`}


export type BillingPlanCode='DIAGNOSTIC'|'RETAKE';
export type BillingProvider='QPAY'|'MOCK'|'MANUAL';
export type BillingInvoiceStatus='CREATED'|'PENDING'|'PAID'|'CANCELLED'|'FAILED'|'REFUNDED';
export interface BillingCatalogPlan { code:BillingPlanCode;name:string;billingLabel:string;description:string;amountMnt:number|null;currency:'MNT'|string;available:boolean;provider:BillingProvider;testMode:boolean;manualMode:boolean; }
export interface BillingDeeplink { name?:string;description?:string;logo?:string;link:string; }
export interface BillingHistoryItem { id:string;companyId:string;domainCode:DomainCode;planCode:BillingPlanCode;amountMnt:number;currency:string;provider:BillingProvider;status:BillingInvoiceStatus;senderInvoiceNo:string;paidAt?:string|null;refundedAt?:string|null;lastVerifiedAt?:string|null;createdAt:string;updatedAt:string;testMode:boolean;manualMode:boolean; }
export interface BillingInvoice extends BillingHistoryItem { qrText?:string|null;qrImage?:string|null;shortUrl?:string|null;deeplinks:BillingDeeplink[];callbackReceivedAt?:string|null;refundReason?:string|null; }
export interface CompanyEntitlement { id:string;domainCode:DomainCode;planCode:BillingPlanCode;status:'ACTIVE'|'CONSUMED'|'EXPIRED'|'REVOKED'|string;startsAt:string;endsAt?:string|null;assessmentLimit?:number|null;assessmentsUsed:number; }
export interface BillingStatus { enforcement:boolean;entitlements:CompanyEntitlement[];invoices:BillingHistoryItem[];summary:{totalPaidMnt:number;paidCount:number;pendingCount:number}; }
