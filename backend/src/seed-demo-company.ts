import "dotenv/config";
import { randomUUID } from "node:crypto";
import { prisma } from "./db.js";
import { hashPassword } from "./api/auth/crypto.js";
import { PrismaAssessmentEngine } from "./services/prisma-assessment-engine.js";
import { PrismaStrategyReportService } from "./services/prisma-strategy-report-service.js";
import { MethodologyDefinitionCache } from "./services/methodology-cache.js";
import { evidenceFromAnswer } from "./engine/evidence.js";
import { diagnosticCellId, questionId } from "./lib/ids.js";
import type { MethodologyDefinition, ProfileAnswer, QuestionDef } from "./engine/types.js";
import { TARGET_METHODOLOGY_VERSION, TARGET_QUESTION_BANK_VERSION } from "./methodology-target.js";

const DEMO_EMAIL = "demo@mmri.mn";
const DEMO_PASSWORD = process.env.MMRI_DEMO_PASSWORD?.trim() || "Demo2026!!";
if (process.env.NODE_ENV === "production" && process.env.MMRI_ALLOW_DEMO_SEED !== "YES") {
  console.error("REFUSING: the demo company has a known password and must not be seeded into a production database.");
  process.exit(2);
}
const DEMO_COMPANY_NAME = "Өрнөх Маркет ХХК";
const DEMO_TAG = "MMRI_DEMO_COMPANY_V2_FAST";
const DEMO_QUESTION_BANK_VERSION = TARGET_QUESTION_BANK_VERSION;
const DEMO_AUTHORITY = 0.95;

const runs = [
  {
    key: "2025-12-15",
    completedAt: new Date("2025-12-15T10:00:00+08:00"),
    moduleTargets: [46, 50, 54, 52, 48, 57, 55, 43]
  },
  {
    key: "2026-03-15",
    completedAt: new Date("2026-03-15T10:00:00+08:00"),
    moduleTargets: [58, 61, 63, 64, 56, 66, 63, 53]
  },
  {
    key: "2026-09-08",
    completedAt: new Date("2026-09-08T10:00:00+08:00"),
    moduleTargets: [90, 80, 90, 80, 90, 80, 80, 80]
  }
];

function profileAnswers(def: MethodologyDefinition): ProfileAnswer[] {
  const qs = def.contracts.companyProfile.profileQuestions ?? [];
  return qs.map((q: any) => {
    const optionCount = Array.isArray(q.options) ? q.options.length : 0;
    const preferred = optionCount >= 3 ? 2 : 1;
    return { questionId: q.id, optionIndexes: [preferred] };
  });
}

function optionByState(q: QuestionDef, state: string): number | null {
  return q.options.find(o => o.state === state)?.optionIndex ?? null;
}

function scoredOptions(q: QuestionDef) {
  return q.options.filter(o => o.state === "SCORED" && o.score !== null);
}

function closestScoredOption(q: QuestionDef, target: number): number {
  const rows = scoredOptions(q);
  if (rows.length) {
    return [...rows].sort((a, b) => Math.abs(Number(a.score) - target) - Math.abs(Number(b.score) - target) || a.optionIndex - b.optionIndex)[0].optionIndex;
  }
  const contextual = q.options.filter(o => !["DNK", "N_A_CLAIM", "UNAVAILABLE"].includes(o.state));
  return (contextual[Math.floor(Math.max(0, contextual.length - 1) / 2)] ?? q.options[0]).optionIndex;
}

function answerStatus(state: string): "ANSWERED" | "DNK" | "N_A_CLAIM" | "UNAVAILABLE" {
  if (state === "DNK") return "DNK";
  if (state === "N_A_CLAIM") return "N_A_CLAIM";
  if (state === "UNAVAILABLE") return "UNAVAILABLE";
  return "ANSWERED";
}

function targetForQuestion(def: MethodologyDefinition, q: QuestionDef, moduleTargets: number[]) {
  const category = def.categories.find(c => c.id === q.categoryId);
  const moduleIndex = Math.max(0, def.modules.findIndex(m => m.id === category?.module));
  return moduleTargets[moduleIndex] ?? 60;
}

/**
 * Fast demo history: exactly three synthetic answers per capability/category:
 * 1 applicability gate + 2 scored answers from independent question paths.
 * 64 × 3 = 192 answers per diagnosis, matching the normal QUICK burden while
 * avoiding hundreds of expensive interactive materialization transactions.
 */
function buildDemoSelections(def: MethodologyDefinition, moduleTargets: number[]) {
  const out: Array<{ q: QuestionDef; optionIndex: number }> = [];
  for (const category of def.categories) {
    const gate = def.questionByCategoryCellPath.get(`${category.id}:C01:1`);
    if (!gate) throw new Error(`Демо seed: ${category.id}:C01:1 асуулт олдсонгүй`);
    out.push({ q: gate, optionIndex: optionByState(gate, "APPLICABLE") ?? closestScoredOption(gate, 100) });

    let pair: [QuestionDef, QuestionDef] | null = null;
    for (const cell of def.cells) {
      if (cell.id === "C01" || cell.id === "C42") continue;
      const q1 = def.questionByCategoryCellPath.get(`${category.id}:${cell.id}:1`);
      const q2 = def.questionByCategoryCellPath.get(`${category.id}:${cell.id}:2`);
      if (q1 && q2 && scoredOptions(q1).length && scoredOptions(q2).length) {
        pair = [q1, q2];
        break;
      }
    }
    if (!pair) throw new Error(`Демо seed: ${category.id}-д 2 оноотой замтай хэмжих асуулт олдсонгүй`);
    for (const q of pair) out.push({ q, optionIndex: closestScoredOption(q, targetForQuestion(def, q, moduleTargets)) });
  }
  if (out.length !== def.categories.length * 3) throw new Error(`Демо seed: хүлээгдсэн ${def.categories.length * 3}, бодит ${out.length}`);
  return out;
}

async function ensureDemoIdentity() {
  const pepper = process.env.PASSWORD_PEPPER?.trim();
  if (!pepper) throw new Error("PASSWORD_PEPPER is required before seeding demo data");
  const passwordHash = await hashPassword(DEMO_PASSWORD, pepper);
  const user = await prisma.user.upsert({
    where: { email: DEMO_EMAIL },
    create: { email: DEMO_EMAIL, displayName: "Демо хэрэглэгч", passwordHash, status: "ACTIVE" },
    update: { displayName: "Демо хэрэглэгч", passwordHash, status: "ACTIVE", tokenVersion: { increment: 1 } }
  });

  let company = await prisma.company.findFirst({ where: { profile: { path: ["demo"], equals: true } as any } });
  if (!company) {
    company = await prisma.company.create({
      data: {
        name: DEMO_COMPANY_NAME,
        industry: "Жижиглэн худалдаа ба цахим худалдаа",
        businessModel: "Хэрэглэгчид шууд борлуулдаг · Онлайн болон салбар дэлгүүрийн хосолсон худалдаа",
        employeeCount: 52,
        companyAgeYears: 6.5,
        marketType: "Монголын хотын хэрэглэгчийн зах зээл",
        country: "Монгол",
        profile: {
          demo: true,
          demoTag: DEMO_TAG,
          descriptionMn: "Улаанбаатар хотод онлайн болон салбар дэлгүүрээр өргөн хэрэглээний бараа борлуулдаг дунд хэмжээний жишээ компани.",
          primaryCustomerMn: "25–45 насны хотын идэвхтэй худалдан авагчид",
          channelsMn: ["Вэб дэлгүүр", "Facebook", "Instagram", "Салбар дэлгүүр", "Утасны захиалга"],
          demoPurposeMn: "Гурван тусдаа маркетингийн оношилгооны ахиц, үр дүн, төлөвлөгөө, тайланг турших зориулалттай өгөгдөл."
        }
      }
    });
  }
  await prisma.companyMembership.upsert({
    where: { companyId_userId: { companyId: company.id, userId: user.id } },
    create: { companyId: company.id, userId: user.id, role: "OWNER" },
    update: { role: "OWNER" }
  });
  return { user, company };
}

async function createDemoPayment(companyId: string, userId: string, date: Date, index: number) {
  const senderInvoiceNo = `DEMO-MMRI-${date.toISOString().slice(0, 10)}-${index}`;
  const invoice = await prisma.billingInvoice.create({
    data: {
      companyId,
      createdByUserId: userId,
      planCode: index > 1 ? "RETAKE" : "DIAGNOSTIC",
      amountMnt: 300000,
      currency: "MNT",
      provider: "MOCK",
      providerInvoiceId: `demo_provider_${date.toISOString().slice(0, 10)}_${index}`,
      providerPaymentId: `demo_payment_${date.toISOString().slice(0, 10)}_${index}`,
      senderInvoiceNo,
      callbackTokenHash: `demo-token-${index}-${randomUUID()}`,
      status: "PAID",
      qrText: `MMRI-DEMO-QPAY:${senderInvoiceNo}:300000`,
      providerMetadata: { mode: "mock", confirmed: true, demo: true, priceMnt: 300000 },
      callbackReceivedAt: date,
      paidAt: date,
      createdAt: date
    }
  });
  return prisma.companyEntitlement.create({
    data: {
      companyId,
      sourceInvoiceId: invoice.id,
      planCode: index > 1 ? "RETAKE" : "DIAGNOSTIC",
      status: "CONSUMED",
      startsAt: date,
      assessmentLimit: 1,
      assessmentsUsed: 1,
      createdAt: date
    }
  });
}

async function ensureDemoInvoice(args: {
  companyId: string;
  userId: string;
  senderInvoiceNo: string;
  status: "CREATED" | "PENDING" | "PAID" | "CANCELLED" | "FAILED";
  createdAt: Date;
  failureReason?: string | null;
}) {
  const providerInvoiceId = `demo_showcase_${args.senderInvoiceNo.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`;
  const existing = await prisma.billingInvoice.findUnique({ where: { senderInvoiceNo: args.senderInvoiceNo } });
  if (existing) return existing;
  return prisma.billingInvoice.create({
    data: {
      companyId: args.companyId,
      createdByUserId: args.userId,
      planCode: "DIAGNOSTIC",
      amountMnt: 300000,
      currency: "MNT",
      provider: "MOCK",
      providerInvoiceId,
      providerPaymentId: args.status === "PAID" ? `${providerInvoiceId}_payment` : null,
      senderInvoiceNo: args.senderInvoiceNo,
      callbackTokenHash: `demo-showcase-${randomUUID()}`,
      status: args.status,
      qrText: `MMRI-DEMO-QPAY:${args.senderInvoiceNo}:300000`,
      providerMetadata: { demo: true, showcase: true, priceMnt: 300000, uiExample: args.status },
      callbackReceivedAt: args.status === "PAID" ? args.createdAt : null,
      paidAt: args.status === "PAID" ? args.createdAt : null,
      failureReason: args.failureReason ?? null,
      createdAt: args.createdAt
    }
  });
}

async function ensureDemoShowcase(companyId: string, userId: string, assessmentIds: string[]) {
  const readyInvoice = await ensureDemoInvoice({
    companyId,
    userId,
    senderInvoiceNo: "DEMO-SHOWCASE-PAID-READY",
    status: "PAID",
    createdAt: new Date("2026-09-14T10:00:00+08:00")
  });
  const existingReadyEntitlement = await prisma.companyEntitlement.findUnique({ where: { sourceInvoiceId: readyInvoice.id } });
  if (!existingReadyEntitlement) {
    await prisma.companyEntitlement.create({
      data: {
        companyId,
        sourceInvoiceId: readyInvoice.id,
        planCode: "DIAGNOSTIC",
        status: "ACTIVE",
        startsAt: new Date("2026-09-14T10:00:00+08:00"),
        assessmentLimit: 1,
        assessmentsUsed: 0
      }
    });
  }

  await ensureDemoInvoice({ companyId, userId, senderInvoiceNo: "DEMO-SHOWCASE-CREATED", status: "CREATED", createdAt: new Date("2026-09-15T08:30:00+08:00") });
  await ensureDemoInvoice({ companyId, userId, senderInvoiceNo: "DEMO-SHOWCASE-PENDING", status: "PENDING", createdAt: new Date("2026-09-15T08:45:00+08:00") });
  await ensureDemoInvoice({ companyId, userId, senderInvoiceNo: "DEMO-SHOWCASE-FAILED", status: "FAILED", createdAt: new Date("2026-09-13T15:20:00+08:00"), failureReason: "Тест төлбөр банкнаас баталгаажаагүй." });
  await ensureDemoInvoice({ companyId, userId, senderInvoiceNo: "DEMO-SHOWCASE-CANCELLED", status: "CANCELLED", createdAt: new Date("2026-09-12T17:10:00+08:00") });

  const latestAssessmentId = assessmentIds[assessmentIds.length - 1];
  if (latestAssessmentId) {
    const plan = await prisma.actionPlanRecord.findFirst({
      where: { strategyRun: { assessmentId: latestAssessmentId } },
      include: { milestones: { orderBy: [{ phaseIndex: "asc" }, { scheduleScore: "desc" }, { externalId: "asc" }] } }
    });
    if (plan?.milestones.length) {
      const cycle = ["DONE", "IN_PROGRESS", "BLOCKED", "SKIPPED", "NOT_STARTED"] as const;
      const shouldSeedStatuses = plan.milestones.every(m => m.status === "NOT_STARTED");
      const shouldSeedTracking = plan.milestones.every(m => m.metricTargetValue == null && m.metricCurrentValue == null && m.noteMn == null && m.delayReasonMn == null);
      if (shouldSeedStatuses || shouldSeedTracking) {
        const demoNow = new Date("2026-09-17T09:00:00+08:00");
        for (let i = 0; i < plan.milestones.length; i++) {
          const milestone = plan.milestones[i];
          const status = shouldSeedStatuses ? cycle[i % cycle.length] : milestone.status;
          const progressPercent = status === "DONE" ? 100 : status === "IN_PROGRESS" ? 55 : status === "BLOCKED" ? 35 : status === "SKIPPED" ? 20 : 0;
          const metricCurrentValue = status === "DONE" ? 82 : status === "IN_PROGRESS" ? 56 : status === "BLOCKED" ? 42 : status === "SKIPPED" ? 30 : 28;
          await prisma.actionPlanMilestoneRecord.update({where:{id:milestone.id},data:{status,progressPercent,actualStartDate:status!=="NOT_STARTED"?new Date(demoNow.getTime()-(i+4)*86_400_000):null,actualCompletedDate:status==="DONE"?new Date(demoNow.getTime()-(i+1)*86_400_000):null,noteMn:status==="IN_PROGRESS"?"Хариуцагчтай ажлын явцыг долоо хоног бүр шинэчилж байна.":status==="DONE"?"Төлөвлөсөн үр дүнг хүлээн авч, хэмжилтийг бүртгэсэн.":null,delayReasonMn:status==="BLOCKED"?"Холбогдох багийн эх өгөгдөл хугацаандаа ирээгүй.":null,metricCurrentValue,metricTargetValue:80,metricUnitMn:"%"}});
        }
      }
    }
  }
}

async function ensureDemoReadModels(assessmentIds: string[]) {
  const engine = new PrismaAssessmentEngine();
  const reports = new PrismaStrategyReportService(engine);
  for (let i = 0; i < assessmentIds.length; i++) {
    const id = assessmentIds[i];
    await reports.getDiagnosisResult(id);
    await reports.getRecommendations(id);
    await reports.getActionPlan(id);
    await reports.freezeReportPayload(id);
    console.log(`  ${i + 1}-р оношилгооны үр дүн · хэрэгжилт · тайлангийн payload бэлэн.`);
  }
}

async function preloadDemoAnswers(args: {
  assessmentId: string;
  respondentId: string;
  def: MethodologyDefinition;
  moduleTargets: number[];
  startedAt: Date;
}) {
  const selections = buildDemoSelections(args.def, args.moduleTargets);
  const askedRows: any[] = [];
  const answerRows: any[] = [];
  const signalRows: any[] = [];
  const eventRows: any[] = [];

  selections.forEach(({ q, optionIndex }, idx) => {
    const option = q.options.find(o => o.optionIndex === optionIndex);
    if (!option) throw new Error(`Демо seed: ${q.id} сонголт ${optionIndex} олдсонгүй`);
    const evidence = evidenceFromAnswer({ definition: args.def, question: q, optionIndex, respondentRoleId: "R01", explicitAuthority: DEMO_AUTHORITY });
    const issueId = `demo-issue-${args.assessmentId}-${idx + 1}`;
    const answerId = `demo-answer-${args.assessmentId}-${idx + 1}`;
    const eventId = `demo-event-${args.assessmentId}-${idx + 1}`;
    const dbQuestionId = questionId(args.def.version, q.id);
    const when = new Date(args.startedAt.getTime() + idx * 15000);
    const rawValue = { optionIndex, labelMn: option.labelMn, state: option.state, score: option.score };

    askedRows.push({
      id: issueId,
      assessmentId: args.assessmentId,
      questionId: dbQuestionId,
      askedOrder: idx + 1,
      priority: null,
      reason: { kind: "DEMO_FAST_SEED", order: idx + 1 },
      status: "ANSWERED",
      askedAt: when,
      answeredAt: when
    });
    answerRows.push({
      id: answerId,
      assessmentId: args.assessmentId,
      respondentId: args.respondentId,
      questionId: dbQuestionId,
      optionIndex,
      rawValue,
      status: answerStatus(option.state),
      authority: DEMO_AUTHORITY,
      revision: 1,
      active: true,
      createdAt: when,
      updatedAt: when
    });
    signalRows.push({
      assessmentId: args.assessmentId,
      answerId,
      cellId: diagnosticCellId(args.def.version, q.categoryId, q.cellId),
      signalKind: "PRIMARY",
      sourceKind: q.sourceKind,
      coefficient: 1,
      score: option.score,
      reliability: evidence.reliability,
      state: option.state,
      active: true,
      createdAt: when
    });
    if (option.state === "SCORED" && option.score !== null) {
      for (const target of q.secondaryTargets) {
        signalRows.push({
          assessmentId: args.assessmentId,
          answerId,
          cellId: diagnosticCellId(args.def.version, q.categoryId, target.targetCellId),
          signalKind: "SECONDARY",
          sourceKind: q.sourceKind,
          coefficient: target.coefficient,
          score: option.score,
          reliability: evidence.reliability * target.coefficient,
          state: `SECONDARY:${target.relation}`,
          active: true,
          createdAt: when
        });
      }
    }
    eventRows.push({
      id: eventId,
      assessmentId: args.assessmentId,
      questionIssueId: issueId,
      questionId: dbQuestionId,
      answerId,
      respondentId: args.respondentId,
      clientRequestId: `demo-fast-${args.assessmentId}-${idx + 1}`,
      eventSequence: idx + 1,
      optionIndex,
      answerState: option.state,
      rawValue,
      authority: DEMO_AUTHORITY,
      effectiveReliability: evidence.reliability,
      methodologyVersion: args.def.version,
      questionBankVersion: DEMO_QUESTION_BANK_VERSION,
      acknowledgement: { accepted: true, answerId, assessmentRevision: idx + 1, routingRevision: idx + 1, eventSequence: idx + 1, demoFastSeed: true },
      questionExternalId: q.id,
      primaryCategoryExternalId: q.categoryId,
      primaryCellExternalId: q.cellId,
      questionPath: q.path,
      sourceKindSnapshot: q.sourceKind,
      normalizedScore: option.score,
      createdAt: when
    });
  });

  await prisma.$transaction(async tx => {
    await tx.assessmentAskedQuestion.createMany({ data: askedRows });
    await tx.answer.createMany({ data: answerRows });
    if (signalRows.length) await tx.evidenceSignal.createMany({ data: signalRows });
    await tx.answerEvent.createMany({ data: eventRows });
    await tx.auditEvent.create({ data: { assessmentId: args.assessmentId, eventType: "ANSWER_EVENT_APPENDED", entityType: "DemoFastSeed", entityId: args.assessmentId, payload: { demoFastSeed: true, answerEvents: eventRows.length } } });
  }, { maxWait: 10000, timeout: 30000 });

  return selections.length;
}

async function seedAssessment(args: {
  index: number;
  companyId: string;
  userId: string;
  entitlementId: string;
  def: MethodologyDefinition;
  moduleTargets: number[];
  completedAt: Date;
  previousAssessmentId?: string | null;
  rootAssessmentId?: string | null;
}) {
  const engine = new PrismaAssessmentEngine();
  const reports = new PrismaStrategyReportService(engine);
  const assessment = await engine.createAssessment(args.companyId, TARGET_METHODOLOGY_VERSION, args.userId, args.entitlementId);
  const respondent = await engine.addRespondent(assessment.id, "R01", "Демо компанийн захирал", {
    handsOnResponsibilityDeclared: true,
    handsOnCategoryIds: [],
    handsOnCellIds: []
  });
  const startedAt = new Date(args.completedAt.getTime() - 75 * 60 * 1000);
  const profile = profileAnswers(args.def);
  await prisma.assessment.update({
    where: { id: assessment.id },
    data: {
      mode: "QUICK",
      status: "IN_PROGRESS",
      routingState: "ADAPTIVE_V13_RUNNING",
      profile: { answers: profile, demoSeed: DEMO_TAG, demoRun: runs[args.index - 1]?.key, fastSeed: true } as any,
      profileRevision: 1,
      startedAt,
      createdAt: startedAt,
      previousAssessmentId: args.previousAssessmentId ?? null,
      parentAssessmentId: args.rootAssessmentId ?? null
    }
  });

  const answerCount = await preloadDemoAnswers({ assessmentId: assessment.id, respondentId: respondent.id, def: args.def, moduleTargets: args.moduleTargets, startedAt });
  console.log(`  ${args.index}-р оношилгоо: ${answerCount} демо хариултыг багцаар бэлтгэлээ.`);
  await engine.materializeDemoTerminalAssessment(assessment.id, args.completedAt);

  // Freeze the diagnosis + 365-day strategy once so Home/Results/Plan load fast.
  // The heavy executive-report publication trace is generated lazily only when
  // the user actually opens that diagnosis report; it must not block local startup.
  await reports.getDiagnosisResult(assessment.id);
  await reports.getActionPlan(assessment.id);
  await reports.freezeReportPayload(assessment.id);

  const scoreRow = await prisma.assessment.findUnique({ where: { id: assessment.id } });
  console.log(`  ${args.index}-р оношилгоо бэлэн: ${Number(scoreRow?.overallOfficialScore ?? scoreRow?.overallPartialScore ?? 0).toFixed(1)} оноо · ${answerCount} асуулт`);
  return assessment.id;
}

async function main() {
  const { user, company } = await ensureDemoIdentity();
  const methodology = await prisma.methodologyVersion.findUnique({ where: { version: TARGET_METHODOLOGY_VERSION } });
  if (!methodology || methodology.status !== "ACTIVE") throw new Error(`MMRI methodology v${TARGET_METHODOLOGY_VERSION} must be ACTIVE before demo seed`);
  const cache = new MethodologyDefinitionCache(prisma);
  const def = await cache.get(methodology.id);
  const companyRow = await prisma.company.findUnique({ where: { id: company.id } });
  const currentCompanyProfile = companyRow?.profile && typeof companyRow.profile === "object" && !Array.isArray(companyRow.profile) ? companyRow.profile as Record<string, unknown> : {};
  await prisma.company.update({
    where: { id: company.id },
    data: { profile: { ...currentCompanyProfile, demo: true, demoTag: DEMO_TAG, assessmentProfileAnswers: profileAnswers(def), profileAnswersUpdatedAt: new Date().toISOString() } as any }
  });

  const existing = await prisma.assessment.findMany({ where: { companyId: company.id }, orderBy: { completedAt: "asc" } });
  const demoAssessments = existing.filter(x => (x.profile as any)?.demoSeed === DEMO_TAG);
  const completeFastDemo = demoAssessments.length === 3 && demoAssessments.every(x => x.status === "COMPLETED");
  if (completeFastDemo) {
    const ids = demoAssessments.map(x => x.id);
    await ensureDemoReadModels(ids);
    await ensureDemoShowcase(company.id, user.id, ids);
    console.log("Демо компанийн 3 тусдаа оношилгоо бэлэн. Нэмэлт төлөвийн жишээнүүдийг шинэчиллээ.");
    console.log("Демо төлөв: төлөгдсөн/эхлүүлэхэд бэлэн эрх + төлбөрийн түүхийн төлөвүүд + хэрэгжилтийн 5 төлөв.");
    console.log(`Имэйл: ${DEMO_EMAIL}`);
    console.log(`Нууц үг: ${DEMO_PASSWORD}`);
    return;
  }

  if (demoAssessments.length) {
    console.log("Хуучин/дутуу демо оношилгоонуудыг цэвэрлэж, хурдан seed-ээр дахин үүсгэнэ...");
    await prisma.assessment.deleteMany({ where: { id: { in: demoAssessments.map(x => x.id) } } });
    const demoInvoices = await prisma.billingInvoice.findMany({
      where: { companyId: company.id, OR: [{ senderInvoiceNo: { startsWith: "DEMO-MMRI-" } }, { senderInvoiceNo: { startsWith: "DEMO-SHOWCASE-" } }] },
      select: { id: true }
    });
    if (demoInvoices.length) {
      await prisma.companyEntitlement.deleteMany({ where: { sourceInvoiceId: { in: demoInvoices.map(x => x.id) } } });
      await prisma.billingInvoice.deleteMany({ where: { id: { in: demoInvoices.map(x => x.id) } } });
    }
  }

  console.log("Өрнөх Маркет ХХК · 3 тусдаа оношилгоог хурдан demo seed-ээр үүсгэж байна...");
  let previous: string | null = null;
  let root: string | null = null;
  const ids: string[] = [];
  for (let i = 0; i < runs.length; i++) {
    const run = runs[i];
    const entitlement = await createDemoPayment(company.id, user.id, run.completedAt, i + 1);
    const id = await seedAssessment({
      index: i + 1,
      companyId: company.id,
      userId: user.id,
      entitlementId: entitlement.id,
      def,
      moduleTargets: run.moduleTargets,
      completedAt: run.completedAt,
      previousAssessmentId: previous,
      rootAssessmentId: root
    });
    if (!root) root = id;
    previous = id;
    ids.push(id);
  }

  await ensureDemoShowcase(company.id, user.id, ids);

  console.log("\nДемо өгөгдөл бэлэн.");
  console.log(`Компани: ${DEMO_COMPANY_NAME}`);
  console.log(`Имэйл: ${DEMO_EMAIL}`);
  console.log(`Нууц үг: ${DEMO_PASSWORD}`);
  console.log(`Тусдаа оношилгооны тоо: ${ids.length}`);
}

main().catch(err => {
  console.error("Демо өгөгдөл үүсгэхэд алдаа гарлаа:", err);
  process.exitCode = 1;
}).finally(async () => {
  await prisma.$disconnect();
});
