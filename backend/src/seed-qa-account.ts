/**
 * LOCAL DEVELOPMENT QA ACCOUNT. Seeds one company with completed diagnoses, history/retakes, plans, reports and payment states for ALL five domains,
 * through the same engine, scoring, report-freeze and billing records the real app uses (no auth or authorization shortcut).
 * Refuses to run in production or against a non-local database. The password is never stored in source: it comes from MMRI_QA_PASSWORD or is
 * generated, and is written only to backend/.qa-credentials.local (git-ignored, mode 600).
 * Run: npm run qa:seed
 */
import "dotenv/config";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { writeFileSync, readFileSync, chmodSync } from "node:fs";
import { prisma } from "./db.js";
import { hashPassword } from "./api/auth/crypto.js";
import { PrismaAssessmentEngine } from "./services/prisma-assessment-engine.js";
import { PrismaStrategyReportService } from "./services/prisma-strategy-report-service.js";
import { MethodologyDefinitionCache } from "./services/methodology-cache.js";
import { evidenceFromAnswer } from "./engine/evidence.js";
import { diagnosticCellId, questionId } from "./lib/ids.js";
import type { MethodologyDefinition, ProfileAnswer, QuestionDef } from "./engine/types.js";
import { allDomainMethodologyTargets } from "./domain-methodology.js";

const QA_EMAIL = process.env.MMRI_QA_EMAIL?.trim() || "qa.local@mmri.test";
const QA_DISPLAY_NAME = "QA хэрэглэгч (локал)";
const QA_COMPANY_NAME = "QA Локал Компани ХХК";
const QA_TAG = "MMRI_QA_LOCAL_V1";
const DEMO_AUTHORITY = 0.95;
const CREDENTIALS_FILE = new URL("../.qa-credentials.local", import.meta.url);

/**
 * Two independent keys must both be satisfied before anything is written:
 *  1. NODE_ENV is not production and DATABASE_URL points at a loopback host;
 *  2. the developer has typed the exact database target (host:port/name) into MMRI_QA_SEED_LOCAL_DB.
 * Key 2 exists because a loopback address can also be an SSH/port-forward tunnel to a remote database, which no host check can
 * detect. The seed never prints the connection string or credentials.
 */
function assertLocalDevDatabase() {
  let u: URL;
  try { u = new URL(process.env.DATABASE_URL ?? ""); } catch { throw new Error("QA seed refused: DATABASE_URL is missing or invalid."); }
  const target = `${u.hostname}:${u.port || "5432"}${u.pathname}`;
  const envName = `${process.env.NODE_ENV ?? ""}|${process.env.MMRI_ENV ?? ""}|${process.env.APP_ENV ?? ""}`.toLowerCase();
  if (/prod/.test(envName)) throw new Error("QA seed refused: this process is configured as production.");
  if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(u.hostname)) throw new Error(`QA seed refused: ${u.hostname} is not a loopback host.`);
  if (process.env.MMRI_QA_SEED_LOCAL_DB !== target) {
    throw new Error(`QA seed refused: confirm this is YOUR local development database (not a tunnel to a shared or remote one) by running with MMRI_QA_SEED_LOCAL_DB=${target}`);
  }
}

/**
 * Controlled QA inputs per module (index = module order in the methodology). They are chosen only to make the SAME scoring /
 * root-cause / recommendation pipeline legitimately produce weak capabilities: a first diagnosis with several clearly weak
 * modules, then a retake that improves some of them and leaves others weak. Nothing here writes actions or plans directly.
 */
const SCENARIOS: Record<string, { first: number[]; retake: number[] }> = {
  marketing: { first: [30, 35, 62, 28, 70, 33, 66, 58], retake: [33, 31, 78, 29, 82, 55, 74, 64] },
  it: { first: [28, 35, 62, 30, 70], retake: [38, 36, 78, 32, 85] },
  finance: { first: [32, 26, 66, 58, 34], retake: [40, 52, 80, 70, 36] },
  people: { first: [58, 30, 28, 66, 36], retake: [72, 34, 52, 80, 46] },
  operations: { first: [26, 60, 34, 32, 68], retake: [37, 74, 50, 44, 82] }
};
const runDates = [new Date("2026-03-15T10:00:00+08:00"), new Date("2026-09-08T10:00:00+08:00")];
// Bump when the answer-selection logic below changes; combined with each domain's scenario into a per-domain fingerprint so only
// the domains whose fixture actually changed are rebuilt on the next run.
const SELECTION_LOGIC_VERSION = "rotating-cell/v2-unconditional";
const domainFingerprint = (domain: string) => createHash("sha256").update(JSON.stringify([SCENARIOS[domain], domain === "marketing" ? "triple-v2" : "pair", SELECTION_LOGIC_VERSION])).digest("hex").slice(0, 12);

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
function buildDemoSelections(def: MethodologyDefinition, moduleTargets: number[], perCell: number) {
  // BusinessMRI v2 domains score a cell from its scored answers (2 are enough; perCell=2). The marketing v3 engine only finalizes a cell after the
  // methodology's minimum of 3 direct answers (confidence contract: minimumDirectAnswers=3), so a marketing QA cell needs perCell=3. 1 gate + 3 = 4 answers per
  // category = 256, still inside the adaptive QUICK range (192-280).
  const out: Array<{ q: QuestionDef; optionIndex: number }> = [];
  def.categories.forEach((category, categoryIndex) => {
    const gate = def.questionByCategoryCellPath.get(`${category.id}:C01:1`);
    if (!gate) throw new Error(`QA seed: ${category.id}:C01:1 question not found`);
    out.push({ q: gate, optionIndex: optionByState(gate, "APPLICABLE") ?? closestScoredOption(gate, 100) });

    // Measure a different capability cell in different categories (deterministic rotation) so the plan can legitimately
    // contain several distinct interventions instead of one template repeated 64 times.
    const eligible: QuestionDef[][] = [];
    for (const cell of def.cells) {
      // C01 is the applicability gate (answered separately above). CONDITIONAL cells (C24..C46 subset) need their own applicability resolution
      // and are flagged REVIEW_REQUIRED by the engine when answered in isolation, so QA fixtures measure only unconditional cells.
      if (cell.id === "C01" || cell.id === "C42" || cell.naPolicy !== "DISALLOWED") continue;
      const qs = Array.from({ length: perCell }, (_, i) => def.questionByCategoryCellPath.get(`${category.id}:${cell.id}:${i + 1}`));
      if (qs.every(q => q && scoredOptions(q).length)) eligible.push(qs as QuestionDef[]);
    }
    if (!eligible.length) throw new Error(`QA seed: no cell with enough scored questions in ${category.id}`);
    const pair = eligible[(categoryIndex * 7 + 3) % eligible.length];
    for (const q of pair) out.push({ q, optionIndex: closestScoredOption(q, targetForQuestion(def, q, moduleTargets)) });
  });
  if (out.length !== def.categories.length * (1 + perCell)) throw new Error(`QA seed: expected ${def.categories.length * (1 + perCell)} answers, got ${out.length}`);
  return out;
}

async function createDemoPayment(companyId: string, userId: string, date: Date, index: number, tag: string) {
  const senderInvoiceNo = `QA-LOCAL-${tag}-${date.toISOString().slice(0, 10)}-${index}`;
  const invoice = await prisma.billingInvoice.create({
    data: {
      companyId,
      domainCode: tag,
      createdByUserId: userId,
      planCode: index > 1 ? "RETAKE" : "DIAGNOSTIC",
      amountMnt: 300000,
      currency: "MNT",
      provider: "MOCK",
      providerInvoiceId: `qa_provider_${tag}_${date.toISOString().slice(0, 10)}_${index}`,
      providerPaymentId: `qa_payment_${tag}_${date.toISOString().slice(0, 10)}_${index}`,
      senderInvoiceNo,
      callbackTokenHash: `qa-token-${index}-${randomUUID()}`,
      status: "PAID",
      qrText: `MMRI-QA-LOCAL-QPAY:${senderInvoiceNo}:300000`,
      providerMetadata: { mode: "mock", confirmed: true, demo: true, priceMnt: 300000 },
      callbackReceivedAt: date,
      paidAt: date,
      createdAt: date
    }
  });
  return prisma.companyEntitlement.create({
    data: {
      companyId,
      domainCode: tag,
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
  const providerInvoiceId = `qa_showcase_${args.senderInvoiceNo.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`;
  const existing = await prisma.billingInvoice.findUnique({ where: { senderInvoiceNo: args.senderInvoiceNo } });
  if (existing) return existing;
  return prisma.billingInvoice.create({
    data: {
      companyId: args.companyId,
      domainCode: "people",
      createdByUserId: args.userId,
      planCode: "DIAGNOSTIC",
      amountMnt: 300000,
      currency: "MNT",
      provider: "MOCK",
      providerInvoiceId,
      providerPaymentId: args.status === "PAID" ? `${providerInvoiceId}_payment` : null,
      senderInvoiceNo: args.senderInvoiceNo,
      callbackTokenHash: `qa-showcase-${randomUUID()}`,
      status: args.status,
      qrText: `MMRI-QA-LOCAL-QPAY:${args.senderInvoiceNo}:300000`,
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
    senderInvoiceNo: "QA-LOCAL-SHOWCASE-PAID-READY",
    status: "PAID",
    createdAt: new Date("2026-09-14T10:00:00+08:00")
  });
  const existingReadyEntitlement = await prisma.companyEntitlement.findUnique({ where: { sourceInvoiceId: readyInvoice.id } });
  if (!existingReadyEntitlement) {
    await prisma.companyEntitlement.create({
      data: {
        companyId,
        domainCode: "people",
        sourceInvoiceId: readyInvoice.id,
        planCode: "DIAGNOSTIC",
        status: "ACTIVE",
        startsAt: new Date("2026-09-14T10:00:00+08:00"),
        assessmentLimit: 1,
        assessmentsUsed: 0
      }
    });
  }

  await ensureDemoInvoice({ companyId, userId, senderInvoiceNo: "QA-LOCAL-SHOWCASE-CREATED", status: "CREATED", createdAt: new Date("2026-09-15T08:30:00+08:00") });
  await ensureDemoInvoice({ companyId, userId, senderInvoiceNo: "QA-LOCAL-SHOWCASE-PENDING", status: "PENDING", createdAt: new Date("2026-09-15T08:45:00+08:00") });
  await ensureDemoInvoice({ companyId, userId, senderInvoiceNo: "QA-LOCAL-SHOWCASE-FAILED", status: "FAILED", createdAt: new Date("2026-09-13T15:20:00+08:00"), failureReason: "Тест төлбөр банкнаас баталгаажаагүй." });
  await ensureDemoInvoice({ companyId, userId, senderInvoiceNo: "QA-LOCAL-SHOWCASE-CANCELLED", status: "CANCELLED", createdAt: new Date("2026-09-12T17:10:00+08:00") });

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

async function preloadDemoAnswers(args: {
  assessmentId: string;
  respondentId: string;
  def: MethodologyDefinition;
  moduleTargets: number[];
  startedAt: Date;
  qbVersion: string;
  perCell: number;
}) {
  const selections = buildDemoSelections(args.def, args.moduleTargets, args.perCell);
  const askedRows: any[] = [];
  const answerRows: any[] = [];
  const signalRows: any[] = [];
  const eventRows: any[] = [];

  selections.forEach(({ q, optionIndex }, idx) => {
    const option = q.options.find(o => o.optionIndex === optionIndex);
    if (!option) throw new Error(`QA seed: ${q.id} сонголт ${optionIndex} олдсонгүй`);
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
      questionBankVersion: args.qbVersion,
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


async function ensureQaIdentity(password: string) {
  const pepper = process.env.PASSWORD_PEPPER?.trim();
  if (!pepper) throw new Error("PASSWORD_PEPPER is required before seeding QA data");
  // The seed may only ever create/refresh a reserved QA identity; it must never be able to reset a real person's password.
  if (!/^[a-z0-9._+-]+@mmri\.test$/i.test(QA_EMAIL)) throw new Error("QA seed refused: the QA email must be on the reserved @mmri.test domain.");
  const existing = await prisma.user.findUnique({ where: { email: QA_EMAIL }, select: { displayName: true } });
  if (existing && existing.displayName !== QA_DISPLAY_NAME) throw new Error("QA seed refused: that email already belongs to a non-QA account.");
  // Re-running with the saved password must not rotate credentials or bump tokenVersion (which would log the tester out).
  const passwordUnchanged = Boolean(existing) && !process.env.MMRI_QA_PASSWORD?.trim() && readSavedPassword() === password;
  const passwordHash = await hashPassword(password, pepper);
  const user = passwordUnchanged ? await prisma.user.findUniqueOrThrow({ where: { email: QA_EMAIL } }) : await prisma.user.upsert({
    where: { email: QA_EMAIL },
    create: { email: QA_EMAIL, displayName: QA_DISPLAY_NAME, passwordHash, status: "ACTIVE" },
    update: { displayName: QA_DISPLAY_NAME, passwordHash, status: "ACTIVE", tokenVersion: { increment: 1 } }
  });
  let company = await prisma.company.findFirst({ where: { profile: { path: ["qaLocal"], equals: true } as any } });
  if (!company) {
    company = await prisma.company.create({
      data: {
        name: QA_COMPANY_NAME, industry: "Жижиглэн худалдаа ба үйлчилгээ", businessModel: "Хэрэглэгчид шууд борлуулдаг · Онлайн болон салбар дэлгүүр",
        employeeCount: 52, companyAgeYears: 6.5, marketType: "Монголын хотын хэрэглэгчийн зах зээл", country: "Монгол",
        profile: { qaLocal: true, qaTag: QA_TAG, descriptionMn: "Зөвхөн локал QA-д зориулсан синтетик компани." }
      }
    });
  }
  await prisma.companyMembership.upsert({
    where: { companyId_userId: { companyId: company.id, userId: user.id } },
    create: { companyId: company.id, userId: user.id, role: "OWNER" }, update: { role: "OWNER" }
  });
  return { user, company };
}

async function seedAssessment(args: { domain: string; methodologyVersion: string; qbVersion: string; index: number; companyId: string; userId: string; entitlementId: string; def: MethodologyDefinition; moduleTargets: number[]; completedAt: Date; previousAssessmentId?: string | null; rootAssessmentId?: string | null; }) {
  const engine = new PrismaAssessmentEngine();
  const reports = new PrismaStrategyReportService(engine);
  const assessment = await engine.createAssessment(args.companyId, args.methodologyVersion, args.userId, args.entitlementId, args.domain);
  const respondent = await engine.addRespondent(assessment.id, "R01", "QA компанийн захирал", { handsOnResponsibilityDeclared: true, handsOnCategoryIds: [], handsOnCellIds: [] });
  const startedAt = new Date(args.completedAt.getTime() - 75 * 60 * 1000);
  await prisma.assessment.update({
    where: { id: assessment.id },
    data: { mode: "QUICK", status: "IN_PROGRESS", routingState: "ADAPTIVE_V13_RUNNING", profile: { answers: profileAnswers(args.def), qaSeed: QA_TAG, domain: args.domain, fastSeed: true } as any, profileRevision: 1, startedAt, createdAt: startedAt, previousAssessmentId: args.previousAssessmentId ?? null, parentAssessmentId: args.rootAssessmentId ?? null }
  });
  const n = await preloadDemoAnswers({ assessmentId: assessment.id, respondentId: respondent.id, def: args.def, moduleTargets: args.moduleTargets, startedAt, qbVersion: args.qbVersion, perCell: args.domain === "marketing" ? 3 : 2 });
  await engine.materializeDemoTerminalAssessment(assessment.id, args.completedAt);
  await reports.getDiagnosisResult(assessment.id);
  await reports.getActionPlan(assessment.id);
  await reports.freezeReportPayload(assessment.id);
  const row = await prisma.assessment.findUnique({ where: { id: assessment.id } });
  console.log(`  ${args.domain} #${args.index}: ${Number(row?.overallOfficialScore ?? row?.overallPartialScore ?? 0).toFixed(1)} оноо · ${n} асуулт`);
  return assessment.id;
}

/** Every destructive step below is scoped to ONE company; this proves that company is the dedicated QA company and nothing else. */
async function assertDedicatedQaCompany(companyId: string, userId: string) {
  const company = await prisma.company.findUnique({ where: { id: companyId }, include: { memberships: true } });
  const profile = company?.profile as Record<string, unknown> | null;
  if (!company || profile?.qaLocal !== true || profile?.qaTag !== QA_TAG || company.name !== QA_COMPANY_NAME || company.memberships.length === 0 || company.memberships.some(m => m.userId !== userId)) {
    throw new Error("QA seed refused: the target company is not the dedicated QA company (flag, tag, name and sole member must all match).");
  }
}

/** Removes ONLY the QA fixture (every row is filtered by the QA company id and, for billing, the QA-LOCAL- invoice prefix). */
async function resetQaFixture(companyId: string, userId: string) {
  await assertDedicatedQaCompany(companyId, userId);
  const invoices = await prisma.billingInvoice.findMany({ where: { companyId, senderInvoiceNo: { startsWith: "QA-LOCAL-" } }, select: { id: true } });
  await prisma.assessment.deleteMany({ where: { companyId } });
  if (invoices.length) {
    await prisma.companyEntitlement.deleteMany({ where: { companyId, sourceInvoiceId: { in: invoices.map(x => x.id) } } });
    await prisma.billingInvoice.deleteMany({ where: { companyId, id: { in: invoices.map(x => x.id) } } });
  }
}

function readSavedPassword(): string | null {
  try { return /^password=(.+)$/m.exec(readFileSync(CREDENTIALS_FILE, "utf8"))?.[1] ?? null; } catch { return null; }
}

async function main() {
  assertLocalDevDatabase();
  // Idempotent: the saved password is reused, so re-running never rotates it or invalidates the tester's session.
  const password = process.env.MMRI_QA_PASSWORD?.trim() || readSavedPassword() || randomBytes(15).toString("base64url");
  const { user, company } = await ensureQaIdentity(password);
  await assertDedicatedQaCompany(company.id, user.id);
  const cache = new MethodologyDefinitionCache(prisma);
  const row = await prisma.company.findUnique({ where: { id: company.id } });
  const cur = row?.profile && typeof row.profile === "object" && !Array.isArray(row.profile) ? row.profile as Record<string, unknown> : {};
  const forceReset = process.argv.includes("--reset");
  if (forceReset) {
    console.log("  --reset: removing every QA diagnosis (slow: cascaded deletes)");
    await resetQaFixture(company.id, user.id);
  }
  const stored: Record<string, string> = forceReset ? {} : ((cur.qaDomainFixtures as Record<string, string> | undefined) ?? {});
  const mk = await prisma.methodologyVersion.findFirst({ where: { domainCode: "marketing", status: "ACTIVE" } });
  const writeProfile = (fx: Record<string, string>) => prisma.company.update({ where: { id: company.id }, data: { profile: { ...cur, qaLocal: true, qaTag: QA_TAG, qaDomainFixtures: fx, ...(mk ? { assessmentProfileAnswers: profileAnswersCache, profileAnswersUpdatedAt: new Date().toISOString() } : {}) } as any } });
  const profileAnswersCache = mk ? profileAnswers(await cache.get(mk.id)) : [];
  await writeProfile(stored);

  const done = new Map<string, number>();
  for (const a of await prisma.assessment.findMany({ where: { companyId: company.id, status: "COMPLETED" }, select: { domainCode: true } })) done.set(String(a.domainCode), (done.get(String(a.domainCode)) ?? 0) + 1);
  const latestIds: string[] = [];
  for (const target of allDomainMethodologyTargets()) {
    const methodology = await prisma.methodologyVersion.findUnique({ where: { version: target.methodologyVersion } });
    if (!methodology || methodology.status !== "ACTIVE") { console.warn(`  ${target.domainCode}: methodology ${target.methodologyVersion} is not ACTIVE, skipped`); continue; }
    if ((done.get(target.domainCode) ?? 0) >= 2 && stored[target.domainCode] === domainFingerprint(target.domainCode)) { console.log(`  ${target.domainCode}: already seeded (fixture ${stored[target.domainCode]})`); continue; }
    // a partially written domain (interrupted run): clear that domain's QA rows only, then rebuild it
    await prisma.assessment.deleteMany({ where: { companyId: company.id, domainCode: target.domainCode } });
    const stale = await prisma.billingInvoice.findMany({ where: { companyId: company.id, senderInvoiceNo: { startsWith: `QA-LOCAL-${target.domainCode}-` } }, select: { id: true } });
    if (stale.length) {
      await prisma.companyEntitlement.deleteMany({ where: { companyId: company.id, sourceInvoiceId: { in: stale.map(x => x.id) } } });
      await prisma.billingInvoice.deleteMany({ where: { companyId: company.id, id: { in: stale.map(x => x.id) } } });
    }
    const def = await cache.get(methodology.id);
    const scenario = SCENARIOS[target.domainCode];
    if (!scenario || scenario.first.length !== def.modules.length) throw new Error(`QA scenario for ${target.domainCode} must have ${def.modules.length} module targets`);
    let previous: string | null = null, root: string | null = null;
    for (let i = 0; i < 2; i++) {
      const ent = await createDemoPayment(company.id, user.id, runDates[i], i + 1, target.domainCode);
      const id = await seedAssessment({ domain: target.domainCode, methodologyVersion: target.methodologyVersion, qbVersion: target.questionBankVersion, index: i + 1, companyId: company.id, userId: user.id, entitlementId: ent.id, def, moduleTargets: i === 0 ? scenario.first : scenario.retake, completedAt: runDates[i], previousAssessmentId: previous, rootAssessmentId: root });
      if (!root) root = id;
      previous = id;
    }
    latestIds.push(previous!);
    stored[target.domainCode] = domainFingerprint(target.domainCode);
    await writeProfile(stored);
  }
  if (latestIds.length) await ensureDemoShowcase(company.id, user.id, latestIds);
  writeFileSync(CREDENTIALS_FILE, `email=${QA_EMAIL}\npassword=${password}\n`, { mode: 0o600 });
  try { chmodSync(CREDENTIALS_FILE, 0o600); } catch { /* best effort */ }
  console.log("\nQA account ready (local only). Credentials are in backend/.qa-credentials.local (git-ignored).");
}

main().catch(err => { console.error("QA seed failed:", err instanceof Error ? err.message : err); process.exitCode = 1; }).finally(async () => { await prisma.$disconnect(); });
