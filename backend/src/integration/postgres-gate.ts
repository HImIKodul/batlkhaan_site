import { readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { prisma } from "../db.js";
import { PrismaAssessmentEngine } from "../services/prisma-assessment-engine.js";
import { PrismaStrategyReportService } from "../services/prisma-strategy-report-service.js";
import { resolve } from "node:path";
import {
  TARGET_METHODOLOGY_BUNDLE,
  TARGET_METHODOLOGY_BUNDLE_SHA256,
  TARGET_METHODOLOGY_VERSION,
  TARGET_QUESTION_BANK_VERSION
} from "../methodology-target.js";

const TERMINAL_ROUTING = new Set([
  "QUICK_COMPLETE",
  "QUICK_LIMIT_REACHED",
  "FULL_COMPLETE",
  "FULL_COMPLETE_WITH_REVIEW",
  "FULL_EVIDENCE_INCOMPLETE",
  "NO_APPLICABLE_SCOPE"
]);

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`POSTGRES GATE FAILED: ${message}`);
}

function lowestScoredOption(question: any): number {
  const scored = (question.options ?? [])
    .filter((o: any) => o.score !== null && o.score !== undefined && !["DNK", "N_A_CLAIM", "UNAVAILABLE"].includes(o.state))
    .sort((a: any, b: any) => Number(a.score) - Number(b.score) || a.optionIndex - b.optionIndex);
  return scored[0]?.optionIndex ?? question.options?.[0]?.optionIndex ?? 1;
}

async function main() {
  const startedAt = new Date();
  const checks: Array<{ name: string; status: "PASS"; detail?: unknown }> = [];
  const pass = (name: string, detail?: unknown) => checks.push({ name, status: "PASS", detail });

  const methodology = await prisma.methodologyVersion.findUnique({ where: { version: TARGET_METHODOLOGY_VERSION } });
  assert(methodology?.status === "ACTIVE", `methodology ${TARGET_METHODOLOGY_VERSION} must be ACTIVE in the disposable integration DB before runtime flow`);
  assert(methodology.bundleSha256 === TARGET_METHODOLOGY_BUNDLE_SHA256, `ACTIVE methodology bundle hash is not the Step-1 frozen-QBank target`);
  pass("methodology_active", methodology.id);
  pass("frozen_qbank_bundle_hash_bound", methodology.bundleSha256);

  const bundleRaw = await readFile(resolve(process.cwd(), TARGET_METHODOLOGY_BUNDLE), "utf8");
  const bundle = JSON.parse(bundleRaw);
  assert(bundle.questionBankVersion === TARGET_QUESTION_BANK_VERSION, `runtime bundle questionBankVersion=${bundle.questionBankVersion}, expected ${TARGET_QUESTION_BANK_VERSION}`);
  pass("frozen_qbank_version_bound", bundle.questionBankVersion);
  const profileConfig = bundle.contracts["MMRI_FINAL_Company_Profile_Config.json"];
  const profileAnswers = profileConfig.profileQuestions.map((q: any) => {
    if (q.inputType === "MULTI_SELECT") {
      return { questionId: q.id, optionIndexes: q.options.length >= 2 ? [1, 2] : [1] };
    }
    // Prefer broad/middle choices so the integration company keeps wide diagnostic scope.
    return { questionId: q.id, optionIndexes: [Math.min(3, q.options.length)] };
  });

  const user = await prisma.user.create({
    data: {
      email: `postgres-gate-${Date.now()}@example.invalid`,
      displayName: "PostgreSQL Integration Gate",
      passwordHash: "integration-only-not-a-login-secret"
    }
  });
  const company = await prisma.company.create({
    data: {
      name: `MMRI PostgreSQL Gate ${Date.now()}`,
      industry: "Integration Testing",
      businessModel: "Hybrid",
      employeeCount: 120,
      country: "MN",
      profile: { integrationGate: true }
    }
  });
  await prisma.companyMembership.create({ data: { companyId: company.id, userId: user.id, role: "OWNER" } });
  pass("user_company_membership_fk");

  const assessmentEngine = new PrismaAssessmentEngine();
  const assessment = await assessmentEngine.createAssessment(company.id, TARGET_METHODOLOGY_VERSION, user.id);
  const respondent = await assessmentEngine.addRespondent(assessment.id, "R02", "Integration Marketing Leader");
  pass("assessment_created", assessment.id);
  pass("respondent_role_fk", respondent.id);

  const writerLeaseId = `postgres-gate:${randomUUID()}`;
  let decision: any = await assessmentEngine.startAssessment(assessment.id, "QUICK", profileAnswers, writerLeaseId);
  assert(decision.nextQuestion, "QUICK start must issue a first diagnostic question");

  // Repeated next-question reads must be idempotent and return the same still-open question.
  const firstId = decision.nextQuestion.question.id;
  const resume1: any = await assessmentEngine.issueNextQuestion(assessment.id, writerLeaseId);
  const resume2: any = await assessmentEngine.issueNextQuestion(assessment.id, writerLeaseId);
  assert(resume1.nextQuestion?.question.id === firstId, "first resume must return already-issued unanswered question");
  assert(resume2.nextQuestion?.question.id === firstId, "second resume must remain idempotent");
  const askedAfterRepeatedRead = await prisma.assessmentAskedQuestion.count({ where: { assessmentId: assessment.id } });
  assert(askedAfterRepeatedRead === 1, `repeated next-question calls created ${askedAfterRepeatedRead} issued rows instead of 1`);
  pass("save_resume_next_question_idempotent", firstId);

  let answered = 0;
  let lastRouting = decision.state;
  while (decision.nextQuestion && !TERMINAL_ROUTING.has(decision.state)) {
    const q = decision.nextQuestion.question;
    const optionIndex = lowestScoredOption(q);
    const writeState = await prisma.assessment.findUnique({
      where: { id: assessment.id },
      select: { assessmentRevision: true, currentQuestionIssueId: true }
    });
    assert(writeState?.currentQuestionIssueId, `missing current question issue before answer ${answered + 1}`);
    const result: any = await assessmentEngine.submitAnswer(assessment.id, q.id, optionIndex, respondent.id, {
      writerLeaseId,
      clientRequestId: `postgres-gate:${randomUUID()}`,
      questionIssueId: writeState.currentQuestionIssueId,
      expectedAssessmentRevision: writeState.assessmentRevision
    });
    answered += 1;
    decision = result.routing;
    lastRouting = decision.state;

    assert(answered <= 280, `QUICK flow exceeded hard maximum: ${answered}`);

    // Probe refresh/save-resume behavior at several points without advancing routing.
    if (decision.nextQuestion && [10, 50, 100, 150].includes(answered)) {
      const before = await prisma.assessmentAskedQuestion.count({ where: { assessmentId: assessment.id } });
      const a: any = await assessmentEngine.issueNextQuestion(assessment.id, writerLeaseId);
      const b: any = await assessmentEngine.issueNextQuestion(assessment.id, writerLeaseId);
      const after = await prisma.assessmentAskedQuestion.count({ where: { assessmentId: assessment.id } });
      assert(a.nextQuestion?.question.id === decision.nextQuestion.question.id, `resume mismatch after answer ${answered}`);
      assert(b.nextQuestion?.question.id === decision.nextQuestion.question.id, `second resume mismatch after answer ${answered}`);
      assert(before === after, `resume duplicated issued question after answer ${answered}`);
    }
  }

  assert(TERMINAL_ROUTING.has(lastRouting), `QUICK assessment did not reach terminal routing state; got ${lastRouting}`);
  assert(answered >= 1 && answered <= 280, `invalid QUICK diagnostic count ${answered}`);
  pass("quick_terminal_routing", { answered, state: lastRouting });

  const terminal = await prisma.assessment.findUnique({ where: { id: assessment.id } });
  assert(terminal && ["COMPLETED", "COMPLETED_WITH_REVIEW", "EXHAUSTED"].includes(terminal.status), `terminal DB assessment status invalid: ${terminal?.status}`);
  assert(terminal.overallPartialScore !== null, "terminal QUICK assessment must persist a partial score");
  assert(terminal.overallOfficialScore === null, "QUICK assessment must not persist an official overall score");
  pass("quick_partial_official_separation", {
    partial: terminal.overallPartialScore?.toString(),
    official: terminal.overallOfficialScore
  });

  const [answerCount, evidenceCount, askedCount, cellStateCount, categoryResultCount, purposeResultCount, auditCount] = await Promise.all([
    prisma.answer.count({ where: { assessmentId: assessment.id, active: true } }),
    prisma.evidenceSignal.count({ where: { assessmentId: assessment.id, active: true } }),
    prisma.assessmentAskedQuestion.count({ where: { assessmentId: assessment.id } }),
    prisma.assessmentCellState.count({ where: { assessmentId: assessment.id } }),
    prisma.categoryResult.count({ where: { assessmentId: assessment.id } }),
    prisma.purposeResult.count({ where: { assessmentId: assessment.id } }),
    prisma.auditEvent.count({ where: { assessmentId: assessment.id } })
  ]);
  assert(answerCount === answered, `active answer count ${answerCount} != routed answer count ${answered}`);
  assert(askedCount === answered, `terminal asked question count ${askedCount} != answered count ${answered}`);
  assert(evidenceCount >= answerCount, "evidence lineage must contain at least one signal per answer");
  assert(cellStateCount > 0, "cell states were not persisted");
  assert(categoryResultCount > 0, "category results were not persisted");
  assert(purposeResultCount === 5, `expected 5 purpose results, got ${purposeResultCount}`);
  assert(auditCount > answerCount, "audit trail is unexpectedly sparse");
  pass("transactional_persistence_counts", { answerCount, evidenceCount, askedCount, cellStateCount, categoryResultCount, purposeResultCount, auditCount });

  // Foreign-key enforcement should reject a runtime row referencing a missing assessment.
  let fkRejected = false;
  try {
    await prisma.auditEvent.create({
      data: { assessmentId: "missing-assessment-id", eventType: "PROFILE_UPDATED", entityType: "IntegrationGate" }
    });
  } catch {
    fkRejected = true;
  }
  assert(fkRejected, "PostgreSQL foreign-key violation was not rejected");
  pass("postgres_fk_enforced");

  // Transaction rollback must leave no partial company behind.
  const rollbackName = `ROLLBACK-${Date.now()}`;
  try {
    await prisma.$transaction(async (tx: any) => {
      await tx.company.create({ data: { name: rollbackName } });
      throw new Error("intentional rollback probe");
    });
  } catch {
    // expected
  }
  const rolledBack = await prisma.company.findFirst({ where: { name: rollbackName } });
  assert(!rolledBack, "PostgreSQL transaction rollback probe left a company row behind");
  pass("postgres_transaction_rollback");

  const strategyService = new PrismaStrategyReportService(assessmentEngine);
  const strategy: any = await strategyService.generateStrategy(assessment.id);
  const recommendationCount = strategy.strategy.recommendations.executionActions.length + strategy.strategy.recommendations.evidenceActions.length;
  assert(recommendationCount <= 7, `selected recommendations exceed locked cap: ${recommendationCount}`);
  pass("strategy_persisted", {
    selectedRootFindings: strategy.strategy.rootCause.selectedFindings.length,
    selectedRecommendations: recommendationCount,
    milestones: strategy.strategy.actionPlan.milestones.length
  });

  const report: any = await strategyService.generateReport(assessment.id);
  assert(report.payload?.payloadHash, "frozen report payload hash missing");
  assert(report.narrative, "deterministic report narrative missing");
  const reportRows = await prisma.reportSnapshot.count({ where: { assessmentId: assessment.id } });
  assert(reportRows === 1, `expected exactly one frozen report snapshot, got ${reportRows}`);
  pass("report_frozen_and_generated", { generationState: report.generationState, payloadHash: report.payload.payloadHash });

  // Import immutability probe: active methodology has a stable bundle hash and active assessments.
  const assessmentRefs = await prisma.assessment.count({ where: { methodologyVersionId: methodology.id } });
  assert(assessmentRefs >= 1, "methodology assessment reference missing");
  pass("methodology_referenced_and_immutable", { bundleSha256: methodology.bundleSha256, assessmentRefs });

  const finishedAt = new Date();
  const output = {
    version: "MMRI-POSTGRES-GATE-2.0",
    methodologyVersion: TARGET_METHODOLOGY_VERSION,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    database: "PostgreSQL via Prisma",
    result: "PASS",
    checks,
    assessment: {
      id: assessment.id,
      mode: "QUICK",
      diagnosticAnswers: answered,
      routingState: lastRouting,
      status: terminal.status,
      partialScore: terminal.overallPartialScore?.toString() ?? null,
      officialScore: null
    }
  };
  await writeFile(new URL("../../methodology/POSTGRES_INTEGRATION_GATE.json", import.meta.url), JSON.stringify(output, null, 2) + "\n");
  console.log(JSON.stringify(output, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
