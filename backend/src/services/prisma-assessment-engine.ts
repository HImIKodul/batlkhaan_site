import { prisma } from "../db.js";
import { Prisma } from "@prisma/client";
import { MethodologyDefinitionCache } from "./methodology-cache.js";
import { authorityFactorWithMetadata, type RespondentAuthorityMetadata } from "../engine/authority.js";
import { calculateRuntimeSnapshot } from "../engine/calculation.js";
import { evidenceFromAnswer } from "../engine/evidence.js";
import { routeNextQuestion } from "../engine/routing.js";
import type { AssessmentMode, DirectEvidence, MethodologyDefinition, ProfileAnswer, RankedQuestion, RoutingDecision, RuntimeSnapshot } from "../engine/types.js";
import { categoryId, diagnosticCellId, methodologyId, moduleId, purposeId, questionId } from "../lib/ids.js";
import { badRequest, conflict } from "../api/errors.js";
import { assertRevision, assertWriterLease, leaseExpiry, requireWriterId, sha256Canonical, type AnswerWriteGuard, type PersistenceWriteGuard } from "./persistence-integrity.js";
import {
  TARGET_METHODOLOGY_VERSION,
} from "../methodology-target.js";
import { methodologyTargetForDomain, normalizeDomainCode, type DomainCode } from "../domain-methodology.js";
import { enqueueReviewInTx } from "./report-review-policy.js";
import { ACTIVE_ASSESSMENT_STATUSES, RESULT_TERMINAL_ASSESSMENT_STATUSES, canMutateRespondents, isResultTerminalAssessmentStatus } from "./assessment-lifecycle.js";

export class PrismaAssessmentEngine {
  private readonly cache = new MethodologyDefinitionCache(prisma);

  async createAssessment(companyId: string, methodologyVersion?: string, createdByUserId?: string, entitlementId?: string | null, rawDomainCode: DomainCode | string = "marketing") {
    const domainCode=normalizeDomainCode(rawDomainCode); const target=methodologyTargetForDomain(domainCode); const requestedVersion=methodologyVersion?.trim();
    if(requestedVersion&&requestedVersion!==target.methodologyVersion)throw new Error(`New ${domainCode} assessments must use methodology ${target.methodologyVersion}; requested ${requestedVersion}`);
    const version=await prisma.methodologyVersion.findUnique({where:{version:target.methodologyVersion}}); if(!version||version.status!=="ACTIVE")throw new Error(`Methodology ${target.methodologyVersion} for ${domainCode} is not ACTIVE`); if(version.domainCode!==domainCode)throw new Error(`Methodology ${target.methodologyVersion} domain mismatch`); if(version.bundleSha256!==target.bundleSha256)throw new Error(`ACTIVE ${domainCode} methodology bundle SHA mismatch`);
    return prisma.$transaction(async(tx:any)=>{
      const active=await tx.assessment.findFirst({where:{companyId,domainCode,status:{in:[...ACTIVE_ASSESSMENT_STATUSES] as any}},select:{id:true,status:true}});
      if(active)throw conflict(`Another ${domainCode} assessment is already active: ${active.id} (${active.status})`);
      const previous=await tx.assessment.findFirst({where:{companyId,domainCode,status:{in:[...RESULT_TERMINAL_ASSESSMENT_STATUSES] as any}},orderBy:[{completedAt:"desc"},{createdAt:"desc"}],select:{id:true,parentAssessmentId:true}});
      let entitlementPlan:string|null=null;
      if(entitlementId){
        const entitlement=await tx.companyEntitlement.findUnique({where:{id:entitlementId},select:{id:true,companyId:true,domainCode:true,planCode:true,status:true,assessmentsUsed:true,assessmentLimit:true}});
        if(!entitlement)throw conflict(`Assessment entitlement ${entitlementId} not found`);
        if(entitlement.companyId!==companyId||entitlement.domainCode!==domainCode)throw conflict("Assessment entitlement does not belong to this company/domain");
        if(entitlement.status!=="CONSUMED"||entitlement.assessmentsUsed<1)throw conflict("Assessment entitlement must be claimed before assessment creation");
        const linkedAssessmentCount=await tx.assessment.count({where:{entitlementId:entitlement.id}});
        if(entitlement.assessmentLimit!==null&&linkedAssessmentCount>=entitlement.assessmentLimit)throw conflict("Assessment entitlement has already reached its assessment limit");
        entitlementPlan=entitlement.planCode;
        if(previous&&entitlement.planCode!=="RETAKE")throw conflict("Completed diagnosis requires a RETAKE entitlement");
        if(!previous&&entitlement.planCode!=="DIAGNOSTIC")throw conflict("First diagnosis requires a DIAGNOSTIC entitlement");
      }
      const previousAssessmentId=previous?.id??null;
      const parentAssessmentId=previous?(previous.parentAssessmentId??previous.id):null;
      const assessment=await tx.assessment.create({data:{companyId,domainCode,methodologyVersionId:version.id,mode:"QUICK",status:"PROFILE_PENDING",routingState:"PROFILE_PENDING",createdByUserId:createdByUserId??null,entitlementId:entitlementId??null,previousAssessmentId,parentAssessmentId}});
      await tx.auditEvent.create({data:{assessmentId:assessment.id,eventType:"ASSESSMENT_CREATED",entityType:"Assessment",entityId:assessment.id,payload:{domainCode,methodologyVersion:target.methodologyVersion,questionBankVersion:target.questionBankVersion,methodologyBundleSha256:version.bundleSha256,engineKind:target.engineKind,entitlementPlan,previousAssessmentId,parentAssessmentId,retakeSequence:previousAssessmentId?"RETAKE":"INITIAL"}}});
      return assessment;
    },{maxWait:10000,timeout:30000});
  }

  /**
   * MMRI-28: apply the exact assessment-start profile rules (validateProfile) at save time. Reads only the
   * profile contract (not the 12k-question bank). The profile config is identical for every domain's methodology.
   * Throws ApiError 400 with the underlying reason.
   */
  async validateProfileAnswersForSave(answers: ProfileAnswer[]): Promise<void> {
    const target = methodologyTargetForDomain("marketing");
    let version = await prisma.methodologyVersion.findUnique({ where: { version: target.methodologyVersion } });
    if (!version || version.status !== "ACTIVE") version = await prisma.methodologyVersion.findFirst({ where: { status: "ACTIVE" } });
    if (!version) throw conflict("No ACTIVE methodology is available to validate the profile");
    const contract = await prisma.methodologyContract.findFirst({ where: { methodologyVersionId: version.id, sourceName: "MMRI_FINAL_Company_Profile_Config.json" } });
    const questions = ((contract?.definition as any)?.profileQuestions ?? []) as any[];
    if (!questions.length) throw conflict("Profile question contract is missing for the active methodology");
    try { validateProfileAgainstQuestions(questions, answers); }
    catch (error: any) { throw badRequest("Суурь мэдээллийн хариулт буруу байна.", { reason: String(error?.message ?? error) }); }
  }

  async addRespondent(assessmentId: string, roleExternalId: string, displayName?: string, authorityMetadata?: RespondentAuthorityMetadata) {
    const assessment = await prisma.assessment.findUnique({ where: { id: assessmentId } });
    if (!assessment) throw new Error(`Assessment ${assessmentId} not found`);
    if (!canMutateRespondents(assessment.status)) throw conflict(`Respondents cannot be changed from status ${assessment.status}`);
    const role = await prisma.respondentRole.findFirst({ where: { methodologyVersionId: assessment.methodologyVersionId, externalId: roleExternalId } });
    if (!role) throw new Error(`Role ${roleExternalId} not found for assessment methodology`);
    return prisma.assessmentRespondent.create({ data: { assessmentId, roleId: role.id, displayName, authorityMetadata: authorityMetadata ? (JSON.parse(JSON.stringify(authorityMetadata)) as Prisma.InputJsonValue) : undefined } });
  }

  async startAssessment(assessmentId: string, mode: AssessmentMode, profileAnswers: ProfileAnswer[], writerLeaseIdInput: string) {
    const writerLeaseId = requireWriterId(writerLeaseIdInput);
    return prisma.$transaction(async (tx: any) => {
      const assessment = await tx.assessment.findUnique({ where: { id: assessmentId } });
      if (!assessment) throw new Error(`Assessment ${assessmentId} not found`);
      if (assessment.status !== 'PROFILE_PENDING') throw conflict(`Assessment cannot start from status ${assessment.status}`);
      if (assessment.startedAt || assessment.completedAt || assessment.pausedAt || assessment.currentQuestionIssueId || assessment.activeWriterLeaseId || assessment.writerLeaseExpiresAt) {
        throw conflict("PROFILE_PENDING assessment contains lifecycle state that must be repaired before start");
      }
      const staleIssueCount = await tx.assessmentAskedQuestion.count({ where: { assessmentId, status: "ISSUED" } });
      if (staleIssueCount !== 0) throw conflict("PROFILE_PENDING assessment cannot contain an issued question");
      const definition = await this.cache.get(assessment.methodologyVersionId);
      validateProfile(definition, profileAnswers);
      const now = new Date();
      // MMRI-20: conditional update so two concurrent starts cannot both claim the lease / double-increment revisions.
      const startClaim = await tx.assessment.updateMany({
        where: { id: assessmentId, status: "PROFILE_PENDING", activeWriterLeaseId: null, assessmentRevision: assessment.assessmentRevision },
        data: {
          mode,
          status: "IN_PROGRESS",
          routingState: mode === "QUICK" ? "CORE_ROUTING" : "FULL_RUNNING",
          profile: { answers: profileAnswers },
          profileRevision: { increment: 1 },
          assessmentRevision: { increment: 1 },
          routingRevision: { increment: 1 },
          activeWriterLeaseId: writerLeaseId,
          writerLeaseExpiresAt: leaseExpiry(now),
          startedAt: assessment.startedAt ?? now
        }
      });
      if (startClaim.count !== 1) throw conflict("Assessment was started by another request");
      await tx.auditEvent.create({ data: { assessmentId, eventType: "PROFILE_UPDATED", entityType: "Assessment", entityId: assessmentId, payload: { profileAnswers, persistenceContract: "PERSIST-v1.0-STEP11" } } });
      await tx.auditEvent.create({ data: { assessmentId, eventType: "WRITER_LEASE_ACQUIRED", entityType: "Assessment", entityId: assessmentId, payload: { writerLeaseId, expiresAt: leaseExpiry(now).toISOString() } } });
      const snapshot = calculateRuntimeSnapshot(definition, []);
      const decision = routeNextQuestion(definition, { mode, snapshot, evidence: [], askedQuestionIds: new Set(), profileAnswers, diagnosticQuestionCount: 0 });
      if (isResultRoutingState(decision.state)) {
        if (decision.nextQuestion) throw new Error(`Terminal routing state ${decision.state} unexpectedly returned a next question`);
        await finalizeTerminalWithoutOpenQuestion(tx, { ...assessment, mode, status: "IN_PROGRESS", profile: { answers: profileAnswers }, assessmentRevision: assessment.assessmentRevision + 1, routingRevision: assessment.routingRevision + 1, eventSequence: assessment.eventSequence, startedAt: assessment.startedAt ?? now }, definition, snapshot, decision, true);
      } else if (decision.nextQuestion) {
        await issueQuestion(tx, assessmentId, definition, decision.nextQuestion, 1);
        await tx.assessment.update({ where: { id: assessmentId }, data: { routingState: decision.state } });
      } else {
        throw new Error(`Non-terminal routing state ${decision.state} did not return a next question`);
      }
      return decision;
    }, { maxWait: 10000, timeout: 30000 });
  }

  async selectNextQuestion(assessmentId: string): Promise<RoutingDecision> {
    const assessment = await prisma.assessment.findUnique({ where: { id: assessmentId } });
    if (!assessment) throw new Error(`Assessment ${assessmentId} not found`);
    const definition = await this.cache.get(assessment.methodologyVersionId);
    const { evidence, askedQuestionIds, diagnosticQuestionCount, profileAnswers } = await loadRuntimeInputs(prisma, assessmentId, definition, assessment.profile);
    const snapshot = calculateRuntimeSnapshot(definition, evidence);
    return routeNextQuestion(definition, { mode: assessment.mode, snapshot, evidence, askedQuestionIds, profileAnswers, diagnosticQuestionCount });
  }

  async issueNextQuestion(assessmentId: string, writerLeaseIdInput: string): Promise<RoutingDecision> {
    const writerLeaseId = requireWriterId(writerLeaseIdInput);
    const assessmentOutside = await prisma.assessment.findUnique({ where: { id: assessmentId } });
    if (!assessmentOutside) throw new Error(`Assessment ${assessmentId} not found`);
    const definition = await this.cache.get(assessmentOutside.methodologyVersionId);
    return prisma.$transaction(async (tx: any) => {
      const assessment = await tx.assessment.findUnique({ where: { id: assessmentId } });
      if (!assessment) throw new Error(`Assessment ${assessmentId} not found`);
      if (assessment.status !== "IN_PROGRESS") throw conflict(`Assessment is not accepting question requests: ${assessment.status}`);
      assertWriterLease(assessment, writerLeaseId);
      await tx.assessment.update({ where: { id: assessmentId }, data: { writerLeaseExpiresAt: leaseExpiry() } });

      let openIssued = assessment.currentQuestionIssueId
        ? await tx.assessmentAskedQuestion.findUnique({ where: { id: assessment.currentQuestionIssueId } })
        : null;
      if (!openIssued || openIssued.status !== "ISSUED") {
        openIssued = await tx.assessmentAskedQuestion.findFirst({ where: { assessmentId, status: "ISSUED" }, orderBy: { askedOrder: "asc" } });
        if (openIssued && assessment.currentQuestionIssueId !== openIssued.id) {
          await tx.assessment.update({ where: { id: assessmentId }, data: { currentQuestionIssueId: openIssued.id } });
        }
      }
      if (openIssued) {
        const externalId = externalQuestionId(definition.version, openIssued.questionId);
        const openQuestion = definition.questionById.get(externalId);
        if (!openQuestion) throw new Error(`Issued question ${externalId} is missing from methodology cache`);
        return {
          state: assessment.routingState ?? (assessment.mode === "QUICK" ? "CORE_ROUTING" : "FULL_RUNNING"),
          nextQuestion: { question: openQuestion, priority: openIssued.priority === null ? 0 : Number(openIssued.priority), reason: (openIssued.reason ?? { kind: "RESUME_OPEN_QUESTION" }) as any }
        };
      }

      const input = await loadRuntimeInputs(tx, assessmentId, definition, assessment.profile);
      const snapshot = calculateRuntimeSnapshot(definition, input.evidence);
      const decision = routeNextQuestion(definition, { mode: assessment.mode, snapshot, evidence: input.evidence, askedQuestionIds: input.askedQuestionIds, profileAnswers: input.profileAnswers, diagnosticQuestionCount: input.diagnosticQuestionCount });
      if (isResultRoutingState(decision.state)) {
        if (decision.nextQuestion) throw new Error(`Terminal routing state ${decision.state} unexpectedly returned a next question`);
        await finalizeTerminalWithoutOpenQuestion(tx, assessment, definition, snapshot, decision, false);
        return decision;
      }
      if (!decision.nextQuestion) throw new Error(`Non-terminal routing state ${decision.state} did not return a next question`);
      await tx.assessment.update({ where: { id: assessmentId }, data: { routingState: decision.state } });
      if (decision.nextQuestion) {
        const existing = await tx.assessmentAskedQuestion.findUnique({ where: { assessmentId_questionId: { assessmentId, questionId: questionId(definition.version, decision.nextQuestion.question.id) } } });
        if (!existing) {
          const order = await tx.assessmentAskedQuestion.count({ where: { assessmentId } }) + 1;
          await issueQuestion(tx, assessmentId, definition, decision.nextQuestion, order);
        } else if (existing.status === "ISSUED") {
          await tx.assessment.update({ where: { id: assessmentId }, data: { currentQuestionIssueId: existing.id } });
        } else if (existing.status === "CANCELLED") {
          // A question that was cancelled because the respondent moved backward may
          // become the correct adaptive next question again after the correction.
          // Reuse the original issue row (the schema intentionally keeps one issue
          // per assessment/question) while preserving prior AnswerEvents for audit.
          await tx.assessmentAskedQuestion.update({
            where: { id: existing.id },
            data: {
              status: "ISSUED",
              priority: decision.nextQuestion.priority,
              reason: decision.nextQuestion.reason as any,
              askedAt: new Date(),
              answeredAt: null
            }
          });
          await tx.assessment.update({ where: { id: assessmentId }, data: { currentQuestionIssueId: existing.id } });
          await tx.auditEvent.create({
            data: {
              assessmentId,
              eventType: "QUESTION_ISSUED",
              entityType: "AssessmentAskedQuestion",
              entityId: existing.id,
              payload: { questionExternalId: decision.nextQuestion.question.id, reissuedAfterCorrection: true }
            }
          });
        }
      }
      return decision;
    }, { maxWait: 10000, timeout: 30000 });
  }

  async submitAnswer(assessmentId: string, questionExternalId: string, optionIndex: number, respondentId: string | undefined, guard: AnswerWriteGuard) {
    const writerLeaseId = requireWriterId(guard.writerLeaseId);
    const clientRequestId = guard.clientRequestId?.trim();
    const questionIssueId = guard.questionIssueId?.trim();
    if (!clientRequestId || clientRequestId.length > 160) throw conflict("clientRequestId is required");
    if (!questionIssueId || questionIssueId.length > 160) throw conflict("questionIssueId is required");

    const assessmentOutside = await prisma.assessment.findUnique({ where: { id: assessmentId } });
    if (!assessmentOutside) throw new Error(`Assessment ${assessmentId} not found`);
    const definition = await this.cache.get(assessmentOutside.methodologyVersionId);
    const question = definition.questionById.get(questionExternalId);
    if (!question) throw conflict(`Question ${questionExternalId} does not belong to locked methodology ${definition.version}`);
    const option = question.options.find(o => o.optionIndex === optionIndex);
    if (!option) throw conflict(`Invalid option ${optionIndex} for ${questionExternalId}`);
    const expectedDbQuestionId = questionId(definition.version, questionExternalId);

    return prisma.$transaction(async (tx: any) => {
      const duplicate = await tx.answerEvent.findUnique({ where: { assessmentId_clientRequestId: { assessmentId, clientRequestId } } });
      if (duplicate) {
        const samePayload = duplicate.questionIssueId === questionIssueId
          && duplicate.questionId === expectedDbQuestionId
          && duplicate.optionIndex === optionIndex
          && (duplicate.respondentId ?? null) === (respondentId ?? null);
        if (!samePayload) throw conflict("clientRequestId has already been used for a different answer payload");
        if (!duplicate.acknowledgement) throw conflict("Previous answer request exists without a persisted acknowledgement");
        return duplicate.acknowledgement as any;
      }

      const assessment = await tx.assessment.findUnique({ where: { id: assessmentId } });
      if (!assessment) throw new Error(`Assessment ${assessmentId} not found`);
      if (assessment.status !== "IN_PROGRESS") throw conflict(`Assessment is not accepting answers: ${assessment.status}`);
      assertRevision(assessment.assessmentRevision, guard.expectedAssessmentRevision);
      assertWriterLease(assessment, writerLeaseId);

      // TASK12_WRITE_LAYER_QUICK_HARD_MAX
      // The customer-facing QUICK progress contract counts active accepted answers.
      // Enforce the exact same ceiling at the write boundary so a stale/open issue
      // can never make answer 281 persist, even if adaptive evidence accounting
      // differs because of corrections or routing internals.
      const configuredQuickHardMaximum = Number(definition.contracts.companyProfile?.routingLocks?.quickMaxQuestions ?? 280);
      const quickHardMaximum = Number.isFinite(configuredQuickHardMaximum) && configuredQuickHardMaximum > 0
        ? Math.floor(configuredQuickHardMaximum)
        : 280;
      const activeAnswerCountBeforeWrite = assessment.mode === "QUICK"
        ? await tx.answer.count({ where: { assessmentId, active: true } })
        : 0;
      if (assessment.mode === "QUICK" && activeAnswerCountBeforeWrite >= quickHardMaximum) {
        throw conflict(`QUICK hard maximum ${quickHardMaximum} has already been reached`);
      }

      const issue = await tx.assessmentAskedQuestion.findUnique({ where: { id: questionIssueId } });
      const dbQuestionId = expectedDbQuestionId;
      if (!issue || issue.assessmentId !== assessmentId || issue.questionId !== dbQuestionId || issue.status !== "ISSUED") {
        throw conflict("Submitted question issue is not the current unanswered issue");
      }
      if (assessment.currentQuestionIssueId !== issue.id) throw conflict("Submitted question issue does not match currentQuestionIssueId");

      const alreadyAccepted = await tx.answer.findFirst({ where: { assessmentId, questionId: dbQuestionId, active: true } });
      if (alreadyAccepted) throw conflict(`Question ${questionExternalId} already has an accepted answer`);
      const priorRevision = await tx.answer.findFirst({ where: { assessmentId, questionId: dbQuestionId }, orderBy: { revision: "desc" } });
      const nextAnswerRevision = Number(priorRevision?.revision ?? 0) + 1;

      let roleExternalId: string | undefined;
      let authorityMetadata: RespondentAuthorityMetadata | undefined;
      if (respondentId) {
        const respondent = await tx.assessmentRespondent.findUnique({ where: { id: respondentId }, include: { role: true } });
        if (!respondent || respondent.assessmentId !== assessmentId) throw conflict(`Respondent ${respondentId} is not part of assessment`);
        roleExternalId = respondent.role.externalId;
        authorityMetadata = (respondent.authorityMetadata ?? undefined) as RespondentAuthorityMetadata | undefined;
      }
      const authority = roleExternalId
        ? authorityFactorWithMetadata(definition.contracts, question.categoryId, question.cellId, roleExternalId, authorityMetadata)
        : 0.75;
      const evidence = evidenceFromAnswer({ definition, question, optionIndex, respondentRoleId: roleExternalId, explicitAuthority: authority });
      const priorInputs = await loadRuntimeInputs(tx, assessmentId, definition, assessment.profile);
      const evidenceWithCurrent = [...priorInputs.evidence, evidence];
      const snapshot = calculateRuntimeSnapshot(definition, evidenceWithCurrent);
      let decision = routeNextQuestion(definition, { mode: assessment.mode, snapshot, evidence: evidenceWithCurrent, askedQuestionIds: priorInputs.askedQuestionIds, profileAnswers: priorInputs.profileAnswers, diagnosticQuestionCount: priorInputs.diagnosticQuestionCount + 1 });
      // The write count is the authoritative product/API count. Answer 280 is
      // accepted and frozen into the result, but no question 281 may be issued.
      if (assessment.mode === "QUICK" && activeAnswerCountBeforeWrite + 1 >= quickHardMaximum) {
        decision = {
          state: "QUICK_LIMIT_REACHED",
          nextQuestion: null,
          stopReason: `ADAPTIVE_V13_QUICK_HARD_MAXIMUM:${quickHardMaximum}`
        };
      }
      const nextStatus = assessmentStatusForRouting(decision.state);
      const terminal = isResultRoutingState(decision.state);
      if (terminal && decision.nextQuestion) throw new Error(`Terminal routing state ${decision.state} unexpectedly returned a next question`);
      const newAssessmentRevision = assessment.assessmentRevision + 1;
      const newRoutingRevision = assessment.routingRevision + 1;
      const answerEventSequence = assessment.eventSequence + 1;

      const status = answerStatus(option.state);
      const answer = await tx.answer.create({
        data: { assessmentId, respondentId: respondentId ?? null, questionId: dbQuestionId, optionIndex, rawValue: { optionIndex, labelMn: option.labelMn, state: option.state, score: option.score }, status, authority, revision: nextAnswerRevision, active: true }
      });
      await tx.evidenceSignal.create({
        data: { assessmentId, answerId: answer.id, cellId: diagnosticCellId(definition.version, question.categoryId, question.cellId), signalKind: "PRIMARY", sourceKind: question.sourceKind, coefficient: 1, score: option.score, reliability: evidence.reliability, state: option.state }
      });
      if (option.state === "SCORED" && option.score !== null && question.secondaryTargets.length) {
        await tx.evidenceSignal.createMany({
          data: question.secondaryTargets.map(target => ({ assessmentId, answerId: answer.id, cellId: diagnosticCellId(definition.version, question.categoryId, target.targetCellId), signalKind: "SECONDARY", sourceKind: question.sourceKind, coefficient: target.coefficient, score: option.score, reliability: evidence.reliability * target.coefficient, state: `SECONDARY:${target.relation}` }))
        });
      }

      // The idempotent ACK is known before persistence side effects below, so AnswerEvent
      // is written once and never mutated after creation.
      const acknowledgement = jsonSafe({ accepted: true, answerId: answer.id, assessmentRevision: newAssessmentRevision, routingRevision: newRoutingRevision, eventSequence: answerEventSequence, routing: decision });
      const answerEvent = await tx.answerEvent.create({
        data: {
          assessmentId, questionIssueId: issue.id, questionId: dbQuestionId, answerId: answer.id, respondentId: respondentId ?? null, clientRequestId, eventSequence: answerEventSequence, optionIndex, answerState: option.state, rawValue: { optionIndex, labelMn: option.labelMn, state: option.state, score: option.score }, authority, effectiveReliability: evidence.reliability, methodologyVersion: definition.version, questionBankVersion: requireQuestionBankVersion(definition), acknowledgement,
          questionExternalId, primaryCategoryExternalId: question.categoryId, primaryCellExternalId: question.cellId, questionPath: question.path, sourceKindSnapshot: question.sourceKind, normalizedScore: option.score
        }
      });
      await tx.auditEvent.create({ data: { assessmentId, eventType: "ANSWER_EVENT_APPENDED", entityType: "AnswerEvent", entityId: answerEvent.id, payload: { questionExternalId, questionIssueId: issue.id, clientRequestId, eventSequence: answerEventSequence } } });

      const cellPersistence = await persistLiveCellMatrix(tx, assessmentId, definition, snapshot, [question.categoryId]);
      await persistAllCategories(tx, assessmentId, definition, snapshot);
      await persistAllModules(tx, assessmentId, definition, snapshot);
      await reconcileContradictions(tx, assessmentId, definition, question.categoryId, snapshot);
      await persistPurposes(tx, assessmentId, definition, snapshot);
      await persistCategoryOutcomePriorities(tx, assessmentId, definition, snapshot);

      await tx.assessmentAskedQuestion.update({ where: { id: issue.id }, data: { status: "ANSWERED", answeredAt: new Date() } });
      await tx.responseDraft.deleteMany({ where: terminal ? { assessmentId } : { assessmentId, questionIssueId: issue.id } });
      await tx.assessment.update({
        where: { id: assessmentId },
        data: {
          status: nextStatus, routingState: decision.state, overallPartialScore: snapshot.overall.partialScore, overallOfficialScore: snapshot.overall.officialScore, overallConfidence: snapshot.overall.confidence, coverage: snapshot.overall.coverage, aggregationVersion: snapshot.overall.aggregationVersion, completedAt: terminal ? new Date() : null,
          assessmentRevision: { increment: 1 }, routingRevision: { increment: 1 }, eventSequence: { increment: 1 }, lastMaterializedAnswerEventSequence: answerEventSequence, currentQuestionIssueId: null, writerLeaseExpiresAt: terminal ? null : leaseExpiry(), activeWriterLeaseId: terminal ? null : writerLeaseId,
          ...(terminal ? { pausedAt: null, resumeState: Prisma.DbNull } : {})
        }
      });

      if (decision.nextQuestion) {
        const order = await tx.assessmentAskedQuestion.count({ where: { assessmentId } }) + 1;
        await issueQuestion(tx, assessmentId, definition, decision.nextQuestion, order);
      }

      if (terminal) {
        const snapshotPayload = terminalSnapshotPayload(assessmentId, assessment.mode, nextStatus, decision.state, definition, newAssessmentRevision, answerEventSequence, snapshot);
        const payloadHash = sha256Canonical(snapshotPayload);
        await tx.assessmentStateSnapshot.create({ data: { assessmentId, kind: assessment.mode === "QUICK" ? "QUICK_RESULT" : "FULL_RESULT", assessmentRevision: newAssessmentRevision, eventSequence: answerEventSequence, payloadHash, payload: snapshotPayload, versionBundleId: assessment.methodologyVersionId, versionBundleHash: requireBundleSha256(definition), traceVersion: "MMRI-TRACE-1.0" } });
        await tx.auditEvent.create({ data: { assessmentId, eventType: "STATE_SNAPSHOT_FROZEN", entityType: "AssessmentStateSnapshot", entityId: payloadHash, payload: { payloadHash, kind: assessment.mode === "QUICK" ? "QUICK_RESULT" : "FULL_RESULT" } } });
        await tx.auditEvent.create({ data: { assessmentId, eventType: "ASSESSMENT_COMPLETED", entityType: "Assessment", entityId: assessmentId, payload: { routingState: decision.state, overall: snapshot.overall } } });
        await enqueueReviewInTx(tx, assessmentId);
      }
      await tx.auditEvent.create({ data: { assessmentId, eventType: "ANSWER_CREATED", entityType: "Answer", entityId: answer.id, payload: { questionExternalId, optionIndex, authority, clientRequestId } } });
      await tx.auditEvent.create({ data: { assessmentId, eventType: "EVIDENCE_CREATED", entityType: "Answer", entityId: answer.id, payload: { primaryCell: question.cellId, secondaryTargetCount: question.secondaryTargets.length } } });
      return { ...acknowledgement, overall: snapshot.overall, category: snapshot.categories.get(question.categoryId), modules: Object.fromEntries(snapshot.modules), purposes: Object.fromEntries(snapshot.purposes), outcomePriorities: Object.fromEntries(snapshot.outcomePriorities), cellPersistence } as any;
    }, { maxWait: 10000, timeout: 30000 });
  }

  async rewindPreviousAnswer(assessmentId: string, guard: PersistenceWriteGuard) {
    const writerLeaseId = requireWriterId(guard.writerLeaseId);
    const outside = await prisma.assessment.findUnique({ where: { id: assessmentId } });
    if (!outside) throw new Error(`Assessment ${assessmentId} not found`);
    const definition = await this.cache.get(outside.methodologyVersionId);

    return prisma.$transaction(async (tx: any) => {
      const assessment = await tx.assessment.findUnique({ where: { id: assessmentId } });
      if (!assessment) throw new Error(`Assessment ${assessmentId} not found`);
      if (assessment.status !== "IN_PROGRESS") throw conflict(`Assessment cannot go back from status ${assessment.status}`);
      assertRevision(assessment.assessmentRevision, guard.expectedAssessmentRevision);
      assertWriterLease(assessment, writerLeaseId);

      const activeAnswers = await tx.answer.findMany({ where: { assessmentId, active: true }, select: { id: true } });
      const activeIds = new Set(activeAnswers.map((x: any) => x.id));
      const events = await tx.answerEvent.findMany({ where: { assessmentId }, orderBy: { eventSequence: "desc" } });
      const previousEvent = events.find((e: any) => e.optionIndex !== null && activeIds.has(e.answerId));
      if (!previousEvent) throw conflict("Өмнөх хариулт байхгүй байна.");

      const previousAnswer = await tx.answer.findUnique({ where: { id: previousEvent.answerId } });
      if (!previousAnswer || !previousAnswer.active) throw conflict("Өмнөх идэвхтэй хариулт олдсонгүй.");
      const previousIssue = await tx.assessmentAskedQuestion.findUnique({ where: { id: previousEvent.questionIssueId } });
      if (!previousIssue || previousIssue.assessmentId !== assessmentId) throw conflict("Өмнөх асуултын бүртгэл олдсонгүй.");

      if (assessment.currentQuestionIssueId && assessment.currentQuestionIssueId !== previousIssue.id) {
        const currentIssue = await tx.assessmentAskedQuestion.findUnique({ where: { id: assessment.currentQuestionIssueId } });
        if (currentIssue?.status === "ISSUED") {
          await tx.assessmentAskedQuestion.update({ where: { id: currentIssue.id }, data: { status: "CANCELLED" } });
        }
      }

      await tx.answer.update({ where: { id: previousAnswer.id }, data: { active: false } });
      await tx.evidenceSignal.updateMany({ where: { answerId: previousAnswer.id, active: true }, data: { active: false } });

      const nextEventSequence = assessment.eventSequence + 1;
      const externalId = previousEvent.questionExternalId ?? externalQuestionId(definition.version, previousEvent.questionId);
      const question = definition.questionById.get(externalId);
      if (!question) throw new Error(`Cannot reopen unknown question ${externalId}`);
      const retractionAck = jsonSafe({ retracted: true, answerId: previousAnswer.id, questionId: externalId, assessmentRevision: assessment.assessmentRevision + 1, eventSequence: nextEventSequence });
      const retraction = await tx.answerEvent.create({
        data: {
          assessmentId,
          questionIssueId: previousIssue.id,
          questionId: previousEvent.questionId,
          answerId: previousAnswer.id,
          respondentId: previousEvent.respondentId,
          clientRequestId: `retract:${nextEventSequence}:${previousAnswer.id}`,
          eventSequence: nextEventSequence,
          optionIndex: null,
          answerState: "RETRACTED",
          rawValue: { previousOptionIndex: previousEvent.optionIndex, previousAnswerState: previousEvent.answerState },
          authority: previousEvent.authority,
          effectiveReliability: previousEvent.effectiveReliability,
          methodologyVersion: definition.version,
          questionBankVersion: requireQuestionBankVersion(definition),
          acknowledgement: retractionAck,
          questionExternalId: externalId,
          primaryCategoryExternalId: question.categoryId,
          primaryCellExternalId: question.cellId,
          questionPath: question.path,
          sourceKindSnapshot: question.sourceKind,
          normalizedScore: null
        }
      });

      await tx.assessmentAskedQuestion.update({ where: { id: previousIssue.id }, data: { status: "ISSUED", answeredAt: null, askedAt: new Date(), reason: { kind: "USER_BACK_CORRECTION" } } });
      await tx.responseDraft.upsert({
        where: { assessmentId },
        create: { assessmentId, questionIssueId: previousIssue.id, questionId: previousEvent.questionId, draft: { optionIndex: previousEvent.optionIndex }, draftRevision: 1, serverAckAt: new Date() },
        update: { questionIssueId: previousIssue.id, questionId: previousEvent.questionId, draft: { optionIndex: previousEvent.optionIndex }, draftRevision: { increment: 1 }, serverAckAt: new Date() }
      });

      const inputs = await loadRuntimeInputs(tx, assessmentId, definition, assessment.profile);
      const snapshot = calculateRuntimeSnapshot(definition, inputs.evidence);
      const cellPersistence = await persistLiveCellMatrix(tx, assessmentId, definition, snapshot, [question.categoryId]);
      await persistAllCategories(tx, assessmentId, definition, snapshot);
      await persistAllModules(tx, assessmentId, definition, snapshot);
      await reconcileContradictions(tx, assessmentId, definition, question.categoryId, snapshot);
      await persistPurposes(tx, assessmentId, definition, snapshot);
      await persistCategoryOutcomePriorities(tx, assessmentId, definition, snapshot);

      await tx.assessment.update({
        where: { id: assessmentId },
        data: {
          status: "IN_PROGRESS",
          currentQuestionIssueId: previousIssue.id,
          overallPartialScore: snapshot.overall.partialScore,
          overallOfficialScore: null,
          overallConfidence: snapshot.overall.confidence,
          coverage: snapshot.overall.coverage,
          assessmentRevision: { increment: 1 },
          routingRevision: { increment: 1 },
          eventSequence: { increment: 1 },
          lastMaterializedAnswerEventSequence: nextEventSequence,
          writerLeaseExpiresAt: leaseExpiry(),
          activeWriterLeaseId: writerLeaseId,
          completedAt: null
        }
      });
      await tx.auditEvent.create({ data: { assessmentId, eventType: "ANSWER_UPDATED", entityType: "Answer", entityId: previousAnswer.id, payload: { action: "REOPENED_FOR_CORRECTION", questionExternalId: externalId, previousOptionIndex: previousEvent.optionIndex, answerRevision: previousAnswer.revision } } });
      await tx.auditEvent.create({ data: { assessmentId, eventType: "EVIDENCE_RETRACTED", entityType: "AnswerEvent", entityId: retraction.id, payload: { questionExternalId: externalId, previousAnswerId: previousAnswer.id, eventSequence: nextEventSequence } } });

      return { reopened: true, questionId: externalId, previousOptionIndex: previousEvent.optionIndex, assessmentRevision: assessment.assessmentRevision + 1, eventSequence: nextEventSequence, cellPersistence };
    }, { maxWait: 10000, timeout: 30000 });
  }

  async pauseAssessment(assessmentId: string, guard: PersistenceWriteGuard) {
    const writerLeaseId = requireWriterId(guard.writerLeaseId);
    return prisma.$transaction(async (tx: any) => {
      const a = await tx.assessment.findUnique({ where: { id: assessmentId } });
      if (!a) throw new Error(`Assessment ${assessmentId} not found`);
      if (a.status !== "IN_PROGRESS") throw conflict("Only an in-progress assessment can be paused");
      assertRevision(a.assessmentRevision, guard.expectedAssessmentRevision);
      assertWriterLease(a, writerLeaseId);
      const nextRevision = a.assessmentRevision + 1;
      await tx.assessment.update({ where: { id: a.id }, data: { status: "PAUSED", resumeState: { routingState: a.routingState, currentQuestionIssueId: a.currentQuestionIssueId }, pausedAt: new Date(), assessmentRevision: { increment: 1 }, eventSequence: { increment: 1 }, activeWriterLeaseId: null, writerLeaseExpiresAt: null } });
      await tx.auditEvent.create({ data: { assessmentId: a.id, eventType: "ASSESSMENT_PAUSED", entityType: "Assessment", entityId: a.id, payload: { assessmentRevision: nextRevision } } });
      return { status: "PAUSED", assessmentRevision: nextRevision };
    });
  }

  async resumeAssessment(assessmentId: string, guard: PersistenceWriteGuard) {
    const writerLeaseId = requireWriterId(guard.writerLeaseId);
    return prisma.$transaction(async (tx: any) => {
      const a = await tx.assessment.findUnique({ where: { id: assessmentId } });
      if (!a) throw new Error(`Assessment ${assessmentId} not found`);
      if (!["PAUSED","IN_PROGRESS"].includes(a.status)) throw conflict(`Assessment cannot resume from status ${a.status}`);
      assertRevision(a.assessmentRevision, guard.expectedAssessmentRevision);
      const now = new Date();
      if (a.status === "IN_PROGRESS" && a.activeWriterLeaseId && a.activeWriterLeaseId !== writerLeaseId && a.writerLeaseExpiresAt && a.writerLeaseExpiresAt.getTime() > now.getTime()) {
        throw conflict("Assessment is currently being edited by another active writer");
      }
      const resume = (a.resumeState ?? {}) as any;
      let resumeQuestionIssueId = resume.currentQuestionIssueId ?? a.currentQuestionIssueId ?? null;
      if (resumeQuestionIssueId) {
        const issue = await tx.assessmentAskedQuestion.findUnique({ where: { id: String(resumeQuestionIssueId) } });
        if (!issue || issue.assessmentId !== assessmentId || issue.status !== "ISSUED") {
          const open = await tx.assessmentAskedQuestion.findFirst({ where: { assessmentId, status: "ISSUED" }, orderBy: { askedOrder: "asc" } });
          resumeQuestionIssueId = open?.id ?? null;
        }
      }
      const nextRevision = a.status === "PAUSED" ? a.assessmentRevision + 1 : a.assessmentRevision;
      // MMRI-20: compare-and-swap on the exact state we validated above, so two concurrent resumes/claims cannot both win the writer lease.
      const claimed = await tx.assessment.updateMany({ where: { id: a.id, status: a.status, assessmentRevision: a.assessmentRevision, activeWriterLeaseId: a.activeWriterLeaseId ?? null, writerLeaseExpiresAt: a.writerLeaseExpiresAt ?? null }, data: { status: "IN_PROGRESS", routingState: resume.routingState ?? a.routingState, currentQuestionIssueId: resumeQuestionIssueId, resumeState: Prisma.DbNull, pausedAt: null, completedAt: null, activeWriterLeaseId: writerLeaseId, writerLeaseExpiresAt: leaseExpiry(now), ...(a.status === "PAUSED" ? { assessmentRevision: { increment: 1 }, eventSequence: { increment: 1 } } : {}) } });
      if (claimed.count !== 1) throw conflict("Assessment was changed or claimed by another writer; reload and retry");
      await tx.auditEvent.create({ data: { assessmentId: a.id, eventType: a.status === "PAUSED" ? "ASSESSMENT_RESUMED" : "WRITER_LEASE_RENEWED", entityType: "Assessment", entityId: a.id, payload: { writerLeaseId, assessmentRevision: nextRevision, expiresAt: leaseExpiry(now).toISOString() } } });
      return { status: "IN_PROGRESS", assessmentRevision: nextRevision };
    });
  }

  async heartbeatWriterLease(assessmentId: string, writerLeaseIdInput: string) {
    const writerLeaseId = requireWriterId(writerLeaseIdInput);
    return prisma.$transaction(async (tx: any) => {
      const a = await tx.assessment.findUnique({ where: { id: assessmentId } });
      if (!a) throw new Error(`Assessment ${assessmentId} not found`);
      if (a.status !== "IN_PROGRESS") throw conflict(`Writer lease cannot be renewed from ${a.status}`);
      assertWriterLease(a, writerLeaseId);
      const expiresAt = leaseExpiry();
      await tx.assessment.update({ where: { id: assessmentId }, data: { writerLeaseExpiresAt: expiresAt } });
      return { writerLeaseExpiresAt: expiresAt, assessmentRevision: a.assessmentRevision };
    });
  }

  async saveDraft(assessmentId: string, input: { questionIssueId: string; questionId: string; draft: unknown; expectedAssessmentRevision: number; writerLeaseId: string }) {
    const writerLeaseId = requireWriterId(input.writerLeaseId);
    return prisma.$transaction(async (tx: any) => {
      const a = await tx.assessment.findUnique({ where: { id: assessmentId } });
      if (!a) throw new Error(`Assessment ${assessmentId} not found`);
      if (a.status !== "IN_PROGRESS") throw conflict(`Draft cannot be saved from ${a.status}`);
      assertRevision(a.assessmentRevision, input.expectedAssessmentRevision);
      assertWriterLease(a, writerLeaseId);
      const issue = await tx.assessmentAskedQuestion.findUnique({ where: { id: input.questionIssueId } });
      if (!issue || issue.assessmentId !== assessmentId || issue.status !== "ISSUED" || a.currentQuestionIssueId !== issue.id) throw conflict("Draft does not match current issued question");
      const definition = await this.cache.get(a.methodologyVersionId);
      if (issue.questionId !== questionId(definition.version, input.questionId)) throw conflict("Draft question id does not match issue");
      const existing = await tx.responseDraft.findUnique({ where: { assessmentId } });
      const row = existing
        ? await tx.responseDraft.update({ where: { assessmentId }, data: { questionIssueId: issue.id, questionId: issue.questionId, draft: jsonSafe(input.draft), draftRevision: { increment: 1 }, serverAckAt: new Date() } })
        : await tx.responseDraft.create({ data: { assessmentId, questionIssueId: issue.id, questionId: issue.questionId, draft: jsonSafe(input.draft), draftRevision: 1 } });
      await tx.assessment.update({ where: { id: assessmentId }, data: { writerLeaseExpiresAt: leaseExpiry() } });
      await tx.auditEvent.create({ data: { assessmentId, eventType: "DRAFT_SAVED", entityType: "ResponseDraft", entityId: row.id, payload: { questionIssueId: issue.id, draftRevision: row.draftRevision } } });
      return { saved: true, draftRevision: row.draftRevision, serverAckAt: row.serverAckAt, assessmentRevision: a.assessmentRevision };
    });
  }

  async getRuntimeSnapshot(assessmentId: string): Promise<RuntimeSnapshot> {
    const assessment = await prisma.assessment.findUnique({ where: { id: assessmentId } });
    if (!assessment) throw new Error(`Assessment ${assessmentId} not found`);
    const definition = await this.cache.get(assessment.methodologyVersionId);
    const input = await loadRuntimeInputs(prisma, assessmentId, definition, assessment.profile);
    return calculateRuntimeSnapshot(definition, input.evidence);
  }

  async tryComplete(assessmentId: string) {
    const assessment = await prisma.assessment.findUnique({ where: { id: assessmentId } });
    if (!assessment) throw new Error(`Assessment ${assessmentId} not found`);
    const definition = await this.cache.get(assessment.methodologyVersionId);
    const input = await loadRuntimeInputs(prisma, assessmentId, definition, assessment.profile);
    const snapshot = calculateRuntimeSnapshot(definition, input.evidence);
    const decision = routeNextQuestion(definition, { mode: assessment.mode, snapshot, evidence: input.evidence, askedQuestionIds: input.askedQuestionIds, profileAnswers: input.profileAnswers, diagnosticQuestionCount: input.diagnosticQuestionCount });
    return { completed: isResultRoutingState(decision.state), reason: decision.stopReason, routingState: decision.state, overall: snapshot.overall };
  }

  /**
   * Explicit lifecycle finalization used by POST /complete.
   * This is idempotent for terminal assessments and never forces completion
   * while the router still requires another question.
   */
  async completeAssessment(assessmentId: string, guard: PersistenceWriteGuard) {
    const writerLeaseId = requireWriterId(guard.writerLeaseId);
    return prisma.$transaction(async (tx: any) => {
      const assessment = await tx.assessment.findUnique({ where: { id: assessmentId } });
      if (!assessment) throw new Error(`Assessment ${assessmentId} not found`);
      if (isResultTerminalAssessmentStatus(assessment.status)) {
        return { completed: true, reason: "ALREADY_TERMINAL", routingState: assessment.routingState ?? assessment.status, status: assessment.status, assessmentRevision: assessment.assessmentRevision };
      }
      if (assessment.status !== "IN_PROGRESS") {
        return { completed: false, reason: `ASSESSMENT_NOT_IN_PROGRESS:${assessment.status}`, routingState: assessment.routingState ?? assessment.status, status: assessment.status, assessmentRevision: assessment.assessmentRevision };
      }
      assertRevision(assessment.assessmentRevision, guard.expectedAssessmentRevision);
      assertWriterLease(assessment, writerLeaseId);
      const openIssue = await tx.assessmentAskedQuestion.findFirst({ where: { assessmentId, status: "ISSUED" }, select: { id: true } });
      if (openIssue) throw conflict("Assessment cannot complete while an unanswered issued question is still open");

      const definition = await this.cache.get(assessment.methodologyVersionId);
      const input = await loadRuntimeInputs(tx, assessmentId, definition, assessment.profile);
      const snapshot = calculateRuntimeSnapshot(definition, input.evidence);
      const decision = routeNextQuestion(definition, { mode: assessment.mode, snapshot, evidence: input.evidence, askedQuestionIds: input.askedQuestionIds, profileAnswers: input.profileAnswers, diagnosticQuestionCount: input.diagnosticQuestionCount });
      if (!isResultRoutingState(decision.state)) {
        return { completed: false, reason: decision.stopReason ?? "MORE_EVIDENCE_REQUIRED", routingState: decision.state, status: assessment.status, assessmentRevision: assessment.assessmentRevision };
      }

      const nextStatus = assessmentStatusForRouting(decision.state);
      const nextRevision = assessment.assessmentRevision + 1;
      const nextEventSequence = assessment.eventSequence + 1;
      await tx.responseDraft.deleteMany({ where: { assessmentId } });
      await tx.assessment.update({
        where: { id: assessmentId },
        data: { status: nextStatus, routingState: decision.state, overallPartialScore: snapshot.overall.partialScore, overallOfficialScore: snapshot.overall.officialScore, overallConfidence: snapshot.overall.confidence, coverage: snapshot.overall.coverage, aggregationVersion: snapshot.overall.aggregationVersion, completedAt: assessment.completedAt ?? new Date(), pausedAt: null, resumeState: null, assessmentRevision: { increment: 1 }, routingRevision: { increment: 1 }, eventSequence: { increment: 1 }, currentQuestionIssueId: null, activeWriterLeaseId: null, writerLeaseExpiresAt: null }
      });
      const snapshotPayload = terminalSnapshotPayload(assessmentId, assessment.mode, nextStatus, decision.state, definition, nextRevision, nextEventSequence, snapshot);
      const payloadHash = sha256Canonical(snapshotPayload);
      const existingSnapshot = await tx.assessmentStateSnapshot.findFirst({ where: { assessmentId, kind: assessment.mode === "QUICK" ? "QUICK_RESULT" : "FULL_RESULT" }, orderBy: { createdAt: "desc" } });
      if (!existingSnapshot) {
        await tx.assessmentStateSnapshot.create({ data: { assessmentId, kind: assessment.mode === "QUICK" ? "QUICK_RESULT" : "FULL_RESULT", assessmentRevision: nextRevision, eventSequence: nextEventSequence, payloadHash, payload: snapshotPayload, versionBundleId: assessment.methodologyVersionId, versionBundleHash: requireBundleSha256(definition), traceVersion: "MMRI-TRACE-1.0" } });
        await tx.auditEvent.create({ data: { assessmentId, eventType: "STATE_SNAPSHOT_FROZEN", entityType: "AssessmentStateSnapshot", entityId: payloadHash, payload: { payloadHash, explicitCompletionRequest: true } } });
      }
      await tx.auditEvent.create({ data: { assessmentId, eventType: "ASSESSMENT_COMPLETED", entityType: "Assessment", entityId: assessmentId, payload: { routingState: decision.state, explicitCompletionRequest: true, assessmentRevision: nextRevision } } });
      await enqueueReviewInTx(tx, assessmentId);
      return { completed: true, reason: decision.stopReason, routingState: decision.state, status: nextStatus, assessmentRevision: nextRevision };
    }, { maxWait: 10000, timeout: 30000 });
  }

  /**
   * Local/demo-only fast finalization path. It materializes a preloaded set of
   * AnswerEvents in one pass instead of replaying hundreds of answers through
   * the interactive API. Production requests cannot call this path.
   */
  async materializeDemoTerminalAssessment(assessmentId: string, completedAt: Date) {
    if (process.env.NODE_ENV === "production") throw new Error("Demo materialization is disabled in production");
    const assessment = await prisma.assessment.findUnique({ where: { id: assessmentId } });
    if (!assessment) throw new Error(`Assessment ${assessmentId} not found`);
    const definition = await this.cache.get(assessment.methodologyVersionId);
    const input = await loadRuntimeInputs(prisma, assessmentId, definition, assessment.profile);
    const snapshot = calculateRuntimeSnapshot(definition, input.evidence);
    const eventSequence = await prisma.answerEvent.count({ where: { assessmentId } });
    const routingState = "QUICK_LIMIT_REACHED";
    const status = "COMPLETED";
    const assessmentRevision = Math.max(1, eventSequence);

    return prisma.$transaction(async (tx: any) => {
      const cellPersistence = await persistLiveCellMatrix(tx, assessmentId, definition, snapshot);
      await persistAllCategories(tx, assessmentId, definition, snapshot);
      await persistAllModules(tx, assessmentId, definition, snapshot);
      await persistPurposes(tx, assessmentId, definition, snapshot);
      await persistCategoryOutcomePriorities(tx, assessmentId, definition, snapshot);
      for (const categoryId of new Set<string>(snapshot.contradictions.map(c => c.categoryId))) {
        await reconcileContradictions(tx, assessmentId, definition, categoryId, snapshot);
      }

      await tx.assessment.update({
        where: { id: assessmentId },
        data: {
          mode: "QUICK",
          status,
          routingState,
          overallPartialScore: snapshot.overall.partialScore,
          overallOfficialScore: snapshot.overall.officialScore,
          overallConfidence: snapshot.overall.confidence,
          coverage: snapshot.overall.coverage,
          aggregationVersion: snapshot.overall.aggregationVersion,
          completedAt,
          pausedAt: null,
          resumeState: Prisma.DbNull,
          assessmentRevision,
          routingRevision: assessmentRevision,
          eventSequence,
          lastMaterializedAnswerEventSequence: eventSequence,
          currentQuestionIssueId: null,
          activeWriterLeaseId: null,
          writerLeaseExpiresAt: null
        }
      });

      const snapshotPayload = terminalSnapshotPayload(assessmentId, "QUICK", status, routingState, definition, assessmentRevision, eventSequence, snapshot);
      const payloadHash = sha256Canonical(snapshotPayload);
      await tx.assessmentStateSnapshot.deleteMany({ where: { assessmentId, kind: "QUICK_RESULT" } });
      await tx.assessmentStateSnapshot.create({ data: { assessmentId, kind: "QUICK_RESULT", assessmentRevision, eventSequence, payloadHash, payload: snapshotPayload, versionBundleId: assessment.methodologyVersionId, versionBundleHash: requireBundleSha256(definition), traceVersion: "MMRI-TRACE-1.0" } });
      await tx.auditEvent.create({ data: { assessmentId, eventType: "ASSESSMENT_COMPLETED", entityType: "Assessment", entityId: assessmentId, payload: { routingState, demoFastSeed: true, answerEvents: eventSequence, overall: snapshot.overall } } });
      return { snapshot, cellPersistence, eventSequence };
    }, { maxWait: 10000, timeout: 30000 });
  }

}


async function finalizeTerminalWithoutOpenQuestion(
  tx: any,
  assessment: any,
  definition: MethodologyDefinition,
  snapshot: RuntimeSnapshot,
  decision: RoutingDecision,
  initialStart: boolean
) {
  if (!isResultRoutingState(decision.state) || decision.nextQuestion) throw new Error(`Cannot finalize non-terminal routing state ${decision.state}`);
  const openIssue = await tx.assessmentAskedQuestion.findFirst({ where: { assessmentId: assessment.id, status: "ISSUED" }, select: { id: true } });
  if (openIssue) throw conflict("Assessment cannot finalize while an unanswered issued question is still open");

  const nextStatus = assessmentStatusForRouting(decision.state);
  const current = await tx.assessment.findUnique({ where: { id: assessment.id } });
  if (!current) throw new Error(`Assessment ${assessment.id} not found`);
  const nextRevision = current.assessmentRevision + 1;
  const nextEventSequence = current.eventSequence + 1;

  await persistLiveCellMatrix(tx, assessment.id, definition, snapshot);
  await persistAllCategories(tx, assessment.id, definition, snapshot);
  await persistAllModules(tx, assessment.id, definition, snapshot);
  await persistPurposes(tx, assessment.id, definition, snapshot);
  await persistCategoryOutcomePriorities(tx, assessment.id, definition, snapshot);
  for (const categoryId of new Set<string>(snapshot.contradictions.map(c => c.categoryId))) {
    await reconcileContradictions(tx, assessment.id, definition, categoryId, snapshot);
  }
  await tx.responseDraft.deleteMany({ where: { assessmentId: assessment.id } });
  await tx.assessment.update({
    where: { id: assessment.id },
    data: {
      status: nextStatus,
      routingState: decision.state,
      overallPartialScore: snapshot.overall.partialScore,
      overallOfficialScore: snapshot.overall.officialScore,
      overallConfidence: snapshot.overall.confidence,
      coverage: snapshot.overall.coverage,
      aggregationVersion: snapshot.overall.aggregationVersion,
      completedAt: current.completedAt ?? new Date(),
      pausedAt: null,
      resumeState: Prisma.DbNull,
      assessmentRevision: { increment: 1 },
      routingRevision: { increment: 1 },
      eventSequence: { increment: 1 },
      currentQuestionIssueId: null,
      activeWriterLeaseId: null,
      writerLeaseExpiresAt: null
    }
  });

  const snapshotPayload = terminalSnapshotPayload(assessment.id, current.mode, nextStatus, decision.state, definition, nextRevision, nextEventSequence, snapshot);
  const payloadHash = sha256Canonical(snapshotPayload);
  const kind = current.mode === "QUICK" ? "QUICK_RESULT" : "FULL_RESULT";
  const existingSnapshot = await tx.assessmentStateSnapshot.findFirst({ where: { assessmentId: assessment.id, kind }, orderBy: { createdAt: "desc" } });
  if (!existingSnapshot) {
    await tx.assessmentStateSnapshot.create({ data: { assessmentId: assessment.id, kind, assessmentRevision: nextRevision, eventSequence: nextEventSequence, payloadHash, payload: snapshotPayload, versionBundleId: current.methodologyVersionId, versionBundleHash: requireBundleSha256(definition), traceVersion: "MMRI-TRACE-1.0" } });
    await tx.auditEvent.create({ data: { assessmentId: assessment.id, eventType: "STATE_SNAPSHOT_FROZEN", entityType: "AssessmentStateSnapshot", entityId: payloadHash, payload: { payloadHash, kind, lifecycleAutoFinalized: true } } });
  }
  await tx.auditEvent.create({ data: { assessmentId: assessment.id, eventType: "ASSESSMENT_COMPLETED", entityType: "Assessment", entityId: assessment.id, payload: { routingState: decision.state, lifecycleAutoFinalized: true, initialStart, assessmentRevision: nextRevision, overall: snapshot.overall } } });
  await enqueueReviewInTx(tx, assessment.id);
  return { status: nextStatus, assessmentRevision: nextRevision, eventSequence: nextEventSequence };
}

async function loadRuntimeInputs(db: any, assessmentId: string, definition: MethodologyDefinition, profile: any) {
  const [events, legacyAnswers, asked] = await Promise.all([
    db.answerEvent.findMany({ where: { assessmentId }, orderBy: { eventSequence: "asc" } }),
    db.answer.findMany({ where: { assessmentId, active: true }, include: { question: true } }),
    db.assessmentAskedQuestion.findMany({ where: { assessmentId } })
  ]);
  const evidence: DirectEvidence[] = [];
  const acceptedQuestionIds = new Set<string>();
  if (events.length > 0) {
    // R2 correction contract: immutable events are retained, but only the latest
    // event per question is effective. A RETRACTED event has optionIndex=null and
    // therefore removes that question from the live diagnostic snapshot without
    // destroying its prior audit history.
    const latestByQuestion = new Map<string, any>();
    for (const event of events) latestByQuestion.set(event.questionId, event);
    const currentEvents = [...latestByQuestion.values()].sort((a:any,b:any)=>a.eventSequence-b.eventSequence);
    for (const event of currentEvents) {
      if (event.optionIndex === null) continue;
      const externalId = externalQuestionId(definition.version, event.questionId);
      const q = definition.questionById.get(externalId);
      if (!q) throw new Error(`AnswerEvent references unknown question ${externalId}`);
      acceptedQuestionIds.add(externalId);
      evidence.push(evidenceFromAnswer({ definition, question: q, optionIndex: event.optionIndex, explicitAuthority: Number(event.authority ?? 0.75) }));
    }
  } else {
    // Read-only compatibility for assessments created before PERSIST-v1.0-STEP11.
    for (const answer of legacyAnswers) {
      if (answer.optionIndex === null) continue;
      const q = definition.questionById.get(answer.question.externalId);
      if (!q) throw new Error(`Active answer references unknown question ${answer.question.externalId}`);
      acceptedQuestionIds.add(answer.question.externalId);
      evidence.push(evidenceFromAnswer({ definition, question: q, optionIndex: answer.optionIndex, explicitAuthority: Number(answer.authority ?? 0.75) }));
    }
  }
  for (const issue of asked) {
    if (issue.status === "ISSUED") acceptedQuestionIds.add(externalQuestionId(definition.version, issue.questionId));
  }
  const profileAnswers = Array.isArray(profile?.answers) ? profile.answers as ProfileAnswer[] : [];
  return { evidence, askedQuestionIds: acceptedQuestionIds, diagnosticQuestionCount: evidence.length, profileAnswers };
}

async function persistLiveCellMatrix(db: any, assessmentId: string, definition: MethodologyDefinition, snapshot: RuntimeSnapshot, categoryScope?: string[]) {
  const scope = categoryScope?.length ? new Set(categoryScope) : null;
  const categories = scope ? definition.categories.filter(category => scope.has(category.id)) : definition.categories;
  const dbCellIds = categories.flatMap(category => definition.cells.map(cell => diagnosticCellId(definition.version, category.id, cell.id)));
  const existingRows = dbCellIds.length
    ? await db.assessmentCellState.findMany({ where: { assessmentId, cellId: { in: dbCellIds } } })
    : [];
  const existingByCell = new Map<string, any>(existingRows.map((row: any) => [row.cellId, row]));
  const now = new Date();
  const calculationVersion = definition.runtimePolicy?.enabled ? "ADAPTIVE_V13" : "LEGACY";
  const rows: any[] = [];
  const auditRows: any[] = [];
  let locked = 0;
  let unlocked = 0;
  let changed = 0;

  for (const category of categories) {
    for (const cell of definition.cells) {
      const state = snapshot.cells.get(`${category.id}:${cell.id}`)!;
      const dbCellId = diagnosticCellId(definition.version, category.id, cell.id);
      const current = existingByCell.get(dbCellId);
      const confidenceState = state.confidenceState ?? legacyConfidenceState(state.status);
      const isLocked = confidenceState === "LOCKED";
      const wasLocked = current?.confidenceState === "LOCKED";
      const finalized = state.status === "DIRECT_FINAL" || state.status === "NOT_APPLICABLE";
      const value = {
        directScore: state.directScore,
        directConfidence: state.directConfidence,
        derivedScore: state.derivedScore,
        derivedConfidence: state.derivedConfidence,
        maxAcceptedAuthority: state.maxAcceptedAuthority,
        naClaimCount: state.naClaimCount,
        naClaimConfidence: state.naClaimConfidence,
        applicabilityRelevance: state.applicabilityRelevance,
        hasHardContradiction: state.hasHardContradiction,
        hasSameCellVariance: state.hasSameCellVariance,
        hasSecondaryTension: state.hasSecondaryTension,
        hardContradictionRuleIds: state.hardContradictionRuleIds,
        tensionRuleIds: state.tensionRuleIds,
        derivedContributions: state.derivedContributions,
        confidenceState,
        locked: isLocked,
        lockReason: state.lockReason ?? null,
        scoreDispersion: state.scoreDispersion ?? null,
        clusterSize: state.clusterSize ?? 0,
        evidenceCount: state.evidenceCount ?? state.directEvidence.length
      };
      const data = {
        assessmentId,
        cellId: dbCellId,
        value,
        normalizedScore: state.effectiveScore,
        confidence: state.effectiveConfidence,
        directAnswerCount: state.directAnswerCount,
        independentSourceKinds: state.independentSourceKinds,
        contradictionIndex: state.hasHardContradiction ? 1 : state.hasSecondaryTension ? 0.5 : 0,
        status: state.status,
        confidenceState,
        evidenceCount: state.evidenceCount ?? state.directEvidence.length,
        scoreDispersion: state.scoreDispersion ?? null,
        lockReason: state.lockReason ?? null,
        lockedAt: isLocked ? (wasLocked ? current.lockedAt ?? now : now) : null,
        calculationVersion,
        finalizedAt: finalized ? (current?.finalizedAt ?? now) : null
      };
      rows.push(data);
      const changedRow = !current || !cellStateEquivalent(current, data);
      if (!changedRow) continue;
      changed++;
      if (!wasLocked && isLocked) locked++;
      if (wasLocked && !isLocked) unlocked++;
      if (state.status !== "UNASSESSED") {
        auditRows.push({
          assessmentId,
          eventType: !wasLocked && isLocked ? "CELL_LOCKED" : wasLocked && !isLocked ? "CELL_UNLOCKED" : "CELL_UPDATED",
          entityType: "DiagnosticCell",
          entityId: dbCellId,
          payload: { status: state.status, confidenceState, score: state.effectiveScore, confidence: state.effectiveConfidence, lockReason: state.lockReason ?? null, calculationVersion }
        });
      }
    }
  }

  if (dbCellIds.length) await db.assessmentCellState.deleteMany({ where: { assessmentId, cellId: { in: dbCellIds } } });
  if (rows.length) await db.assessmentCellState.createMany({ data: rows });
  if (auditRows.length) await db.auditEvent.createMany({ data: auditRows });

  return {
    matrixSize: rows.length,
    created: rows.filter(row => !existingByCell.has(row.cellId)).length,
    updated: changed - rows.filter(row => !existingByCell.has(row.cellId)).length,
    locked,
    unlocked,
    calculationVersion
  };
}

async function persistAllCategories(db: any, assessmentId: string, definition: MethodologyDefinition, snapshot: RuntimeSnapshot) {
  const rows = definition.categories.map(category => {
    const cat = snapshot.categories.get(category.id)!;
    return {
      assessmentId,
      categoryId: categoryId(definition.version, category.id),
      partialScore: cat.partialScore,
      officialScore: cat.officialScore,
      confidence: cat.confidence,
      coverage: cat.coverage,
      applicableCells: cat.applicableCellCount,
      finalizedCells: cat.finalizedCellCount,
      effectiveModuleWeightPct: cat.effectiveModuleWeightPct,
      partialContributionToModule: cat.partialContributionToModule,
      officialContributionToModule: cat.officialContributionToModule,
      aggregationVersion: snapshot.overall.aggregationVersion
    };
  });
  await db.categoryResult.deleteMany({ where: { assessmentId } });
  if (rows.length) await db.categoryResult.createMany({ data: rows });
}

async function persistAllModules(db: any, assessmentId: string, definition: MethodologyDefinition, snapshot: RuntimeSnapshot) {
  const rows = definition.modules.map(module => {
    const aggregate = snapshot.modules.get(module.id)!;
    return {
      assessmentId,
      moduleId: moduleId(definition.version, module.code),
      partialScore: aggregate.partialScore,
      officialScore: aggregate.officialScore,
      confidence: aggregate.confidence,
      coverage: aggregate.coverage,
      applicableCategories: aggregate.applicableCategoryCount,
      finalizedCategories: aggregate.finalizedCategoryCount,
      unresolvedCategories: aggregate.unresolvedCategoryCount,
      reviewRequiredCategories: aggregate.reviewRequiredCategoryCount,
      baseWeightPct: aggregate.baseWeightPct,
      effectiveOverallWeightPct: aggregate.effectiveOverallWeightPct,
      partialContribution: aggregate.partialContribution,
      officialContribution: aggregate.officialContribution,
      aggregationVersion: snapshot.overall.aggregationVersion
    };
  });
  await db.moduleResult.deleteMany({ where: { assessmentId } });
  if (rows.length) await db.moduleResult.createMany({ data: rows });
}

function legacyConfidenceState(status: string): "UNASSESSED" | "UNKNOWN" | "ESTIMATED" | "VALIDATED" | "LOCKED" | "NOT_APPLICABLE" {
  if (status === "NOT_APPLICABLE") return "NOT_APPLICABLE";
  if (status === "DIRECT_FINAL") return "LOCKED";
  if (status === "DIRECT_PROVISIONAL" || status === "REVIEW_REQUIRED") return "VALIDATED";
  if (status === "DERIVED_PROVISIONAL") return "ESTIMATED";
  if (status === "UNRESOLVED") return "UNKNOWN";
  return "UNASSESSED";
}

function cellStateEquivalent(current: any, next: any): boolean {
  const numberEqual = (a: any, b: any) => {
    if (a === null || a === undefined || b === null || b === undefined) return (a ?? null) === (b ?? null);
    return Math.abs(Number(a) - Number(b)) < 0.000001;
  };
  return current.status === next.status
    && current.confidenceState === next.confidenceState
    && numberEqual(current.normalizedScore, next.normalizedScore)
    && numberEqual(current.confidence, next.confidence)
    && current.directAnswerCount === next.directAnswerCount
    && current.independentSourceKinds === next.independentSourceKinds
    && numberEqual(current.contradictionIndex, next.contradictionIndex)
    && current.evidenceCount === next.evidenceCount
    && numberEqual(current.scoreDispersion, next.scoreDispersion)
    && (current.lockReason ?? null) === (next.lockReason ?? null)
    && current.calculationVersion === next.calculationVersion
    && JSON.stringify(current.value ?? null) === JSON.stringify(next.value ?? null);
}

async function persistPurposes(db: any, assessmentId: string, definition: MethodologyDefinition, snapshot: RuntimeSnapshot) {
  const rows = [...snapshot.purposes.entries()].map(([pid, p]) => {
    const priority = snapshot.outcomePriorities.get(pid);
    return {
      assessmentId,
      purposeId: purposeId(definition.version,pid),
      partialScore: p.partialScore,
      officialScore: p.officialScore,
      confidence: p.confidence,
      coverage: p.coverage,
      knownGap: priority?.knownGap ?? null,
      confidenceAdjustedKnownGap: priority?.confidenceAdjustedKnownGap ?? null,
      uncertaintyKnownGap: priority?.uncertaintyKnownGap ?? null,
      rankedCategoryCount: priority?.rankedCategoryCount ?? 0,
      topPriorityCategoryIds: priority?.topPriorityCategoryIds ?? [],
      calculationVersion: priority?.calculationVersion ?? "LEGACY"
    };
  });
  await db.purposeResult.deleteMany({ where: { assessmentId } });
  if (rows.length) await db.purposeResult.createMany({ data: rows });
}

async function persistCategoryOutcomePriorities(db: any, assessmentId: string, definition: MethodologyDefinition, snapshot: RuntimeSnapshot) {
  await db.categoryOutcomePriorityResult.deleteMany({ where: { assessmentId } });
  const rows = [...snapshot.categoryOutcomePriorities.values()].map(row => ({
    id: `${assessmentId}:OUTCOME:${row.purposeId}:${row.categoryId}`,
    assessmentId,
    purposeId: purposeId(definition.version, row.purposeId),
    categoryId: categoryId(definition.version, row.categoryId),
    relevance: row.relevance,
    structuralWeight: row.structuralWeight,
    effectivePurposeWeightPct: row.effectivePurposeWeightPct,
    categoryScore: row.categoryScore,
    categoryGap: row.categoryGap,
    confidence: row.confidence,
    coverage: row.coverage,
    gapContribution: row.gapContribution,
    confidenceAdjustedGapContribution: row.confidenceAdjustedGapContribution,
    uncertaintyGapContribution: row.uncertaintyGapContribution,
    relativePriority: row.relativePriority,
    rank: row.rank,
    calculationVersion: "OUTCOME_PRIORITY_V13"
  }));
  if (rows.length) await db.categoryOutcomePriorityResult.createMany({ data: rows });
}

async function reconcileContradictions(db: any, assessmentId: string, definition: MethodologyDefinition, categoryExternalId: string, snapshot: RuntimeSnapshot) {
  const desired = snapshot.contradictions.filter(c => c.categoryId === categoryExternalId).flatMap(f => f.affectedCellIds.map(cellId => ({ f, cellId })));
  const categoryCellIds = definition.cells.map(c => diagnosticCellId(definition.version,categoryExternalId,c.id));
  const open = await db.contradiction.findMany({ where: { assessmentId, status: "OPEN", cellId: { in: categoryCellIds } } });
  const desiredKeys = new Set(desired.map(x => `${x.f.ruleId}:${x.cellId}`));
  for (const old of open) {
    const externalCell = externalCellId(old.cellId);
    if (!desiredKeys.has(`${old.ruleCode}:${externalCell}`)) {
      await db.contradiction.update({ where: { id: old.id }, data: { status: "RESOLVED", resolvedAt: new Date() } });
      await db.auditEvent.create({ data: { assessmentId, eventType: "CONTRADICTION_RESOLVED", entityType: "Contradiction", entityId: old.id } });
    }
  }
  const openKeys = new Set(open.map((x: any) => `${x.ruleCode}:${externalCellId(x.cellId)}`));
  for (const { f, cellId } of desired) {
    const key = `${f.ruleId}:${cellId}`;
    if (openKeys.has(key)) continue;
    const created = await db.contradiction.create({
      data: {
        assessmentId,
        cellId: diagnosticCellId(definition.version, categoryExternalId, cellId),
        severity: f.type === "HARD" ? "HARD" : "TENSION",
        ruleCode: f.ruleId,
        details: f
      }
    });
    await db.auditEvent.create({ data: { assessmentId, eventType: "CONTRADICTION_FOUND", entityType: "Contradiction", entityId: created.id, payload: f } });
  }
}

async function issueQuestion(db: any, assessmentId: string, definition: MethodologyDefinition, ranked: RankedQuestion, askedOrder: number) {
  const dbQuestionId = questionId(definition.version, ranked.question.id);
  const existingOpen = await db.assessmentAskedQuestion.findFirst({ where: { assessmentId, status: "ISSUED" }, orderBy: { askedOrder: "asc" } });
  if (existingOpen && existingOpen.questionId !== dbQuestionId) throw conflict(`Cannot issue another question while ${existingOpen.id} is still open`);

  const prior = await db.assessmentAskedQuestion.findUnique({ where: { assessmentId_questionId: { assessmentId, questionId: dbQuestionId } } });
  const created = prior
    ? await db.assessmentAskedQuestion.update({ where: { id: prior.id }, data: { priority: Number.isFinite(ranked.priority) ? ranked.priority : null, reason: ranked.reason, status: "ISSUED", askedAt: new Date(), answeredAt: null } })
    : await db.assessmentAskedQuestion.create({ data: { assessmentId, questionId: dbQuestionId, askedOrder, priority: Number.isFinite(ranked.priority) ? ranked.priority : null, reason: ranked.reason, status: "ISSUED" } });
  await db.assessment.update({ where: { id: assessmentId }, data: { currentQuestionIssueId: created.id, routingRevision: { increment: 1 } } });
  await db.auditEvent.create({ data: { assessmentId, eventType: "QUESTION_ASKED", entityType: "QuestionIssue", entityId: created.id, payload: { externalId: ranked.question.id, questionDbId: created.questionId, priority: Number.isFinite(ranked.priority) ? ranked.priority : null, reason: ranked.reason, reissued: Boolean(prior) } } });
  return created;
}

function answerStatus(state: string): "ANSWERED" | "DNK" | "N_A_CLAIM" | "UNAVAILABLE" {
  if (state === "DNK") return "DNK";
  if (state === "N_A_CLAIM") return "N_A_CLAIM";
  if (state === "UNAVAILABLE") return "UNAVAILABLE";
  return "ANSWERED";
}

function assessmentStatusForRouting(state: string): string {
  if (["CORE_ROUTING","ADAPTIVE_TOPUP","FULL_RUNNING","ADAPTIVE_V13_RUNNING"].includes(state)) return "IN_PROGRESS";
  if (state === "FULL_COMPLETE_WITH_REVIEW") return "COMPLETED_WITH_REVIEW";
  if (state === "FULL_EVIDENCE_INCOMPLETE") return "EXHAUSTED";
  if ([
    "QUICK_COMPLETE",
    "QUICK_LIMIT_REACHED",
    "FULL_COMPLETE",
    "NO_APPLICABLE_SCOPE",
    "ADAPTIVE_V13_COMPLETE",
    "ADAPTIVE_V13_LIMIT_REACHED"
  ].includes(state)) return "COMPLETED";
  return "IN_PROGRESS";
}

function isResultRoutingState(state: string): boolean {
  return [
    "QUICK_COMPLETE",
    "QUICK_LIMIT_REACHED",
    "FULL_COMPLETE",
    "FULL_COMPLETE_WITH_REVIEW",
    "FULL_EVIDENCE_INCOMPLETE",
    "NO_APPLICABLE_SCOPE",
    "ADAPTIVE_V13_COMPLETE",
    "ADAPTIVE_V13_LIMIT_REACHED"
  ].includes(state);
}

function jsonSafe<T>(value: T): any {
  return JSON.parse(JSON.stringify(value));
}


/** Snapshot/event provenance pins the question bank of the assessment's own methodology version. */
function requireQuestionBankVersion(definition: MethodologyDefinition): string {
  if (!definition.questionBankVersion) throw new Error(`Methodology ${definition.version} (${definition.domainCode ?? "unknown"}) has no resolvable questionBankVersion; refusing to stamp unpinned provenance.`);
  return definition.questionBankVersion;
}

/** The snapshot pins the exact bundle of the assessment's own methodology version (never a global target hash). */
function requireBundleSha256(definition: MethodologyDefinition): string {
  if (!definition.bundleSha256) throw new Error(`Methodology ${definition.version} (${definition.domainCode ?? "unknown"}) has no bundleSha256; refusing to freeze an unpinned snapshot.`);
  return definition.bundleSha256;
}


function terminalSnapshotPayload(
  assessmentId: string,
  mode: AssessmentMode,
  status: string,
  routingState: string,
  definition: MethodologyDefinition,
  assessmentRevision: number,
  eventSequence: number,
  snapshot: RuntimeSnapshot
): Record<string, unknown> {
  const categories = [...snapshot.categories.entries()].sort(([a],[b]) => a.localeCompare(b)).map(([id, value]) => ({ id, ...jsonSafe(value) }));
  const cells = [...snapshot.cells.entries()].sort(([a],[b]) => a.localeCompare(b)).map(([key, value]) => {
    const [categoryId, cellId] = key.split(":");
    return { categoryId, cellId, status: value.status, effectiveScore: value.effectiveScore, effectiveConfidence: value.effectiveConfidence, directAnswerCount: value.directAnswerCount, independentSourceKinds: value.independentSourceKinds, hasHardContradiction: value.hasHardContradiction, hardContradictionRuleIds: value.hardContradictionRuleIds ?? [] };
  });
  const purposes = [...snapshot.purposes.entries()].sort(([a],[b]) => a.localeCompare(b)).map(([id, value]) => ({ id, ...jsonSafe(value) }));
  return {
    traceVersion: "MMRI-TRACE-1.0", assessmentId, mode, status, routingState, methodologyVersion: definition.version, questionBankVersion: requireQuestionBankVersion(definition),
    versionBundleHash: requireBundleSha256(definition), assessmentRevision, eventSequence, overall: jsonSafe(snapshot.overall), categories, cells, purposes, contradictions: jsonSafe(snapshot.contradictions)
  };
}

function validateProfile(definition: MethodologyDefinition, answers: ProfileAnswer[]): void {
  validateProfileAgainstQuestions(definition.contracts.companyProfile.profileQuestions ?? [], answers);
}

/** Shared rule set used both at assessment start and when a company profile is saved (MMRI-28). */
export function validateProfileAgainstQuestions(questions: any[], answers: ProfileAnswer[]): void {
  const map = new Map(answers.map(a => [a.questionId,a.optionIndexes]));
  for (const q of questions) {
    if (q.required && !map.has(q.id)) throw new Error(`Required profile question ${q.id} is missing`);
    const selected = map.get(q.id) ?? [];
    if (q.inputType === "SINGLE_SELECT" && selected.length !== 1) throw new Error(`${q.id} requires exactly one option`);
    if (q.inputType === "MULTI_SELECT" && selected.length < 1) throw new Error(`${q.id} requires at least one option`);
    if (selected.some((idx: number) => idx < 1 || idx > q.options.length)) throw new Error(`${q.id} contains invalid option index`);
  }
}

function externalQuestionId(version: string, dbId: string): string {
  const prefix = `${version}:`;
  return dbId.startsWith(prefix) ? dbId.slice(prefix.length) : dbId;
}

function externalCellId(dbId: string): string {
  return dbId.split(":").at(-1)!;
}
