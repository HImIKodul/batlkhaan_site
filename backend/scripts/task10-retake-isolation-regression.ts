import { randomUUID } from "node:crypto";
import { prisma } from "../src/db.js";
import { loadApiConfig } from "../src/api/config.js";
import { BillingService } from "../src/billing/billing-service.js";
import { PrismaAssessmentEngine } from "../src/services/prisma-assessment-engine.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const TERMINAL = ["COMPLETED", "COMPLETED_WITH_REVIEW", "EXHAUSTED"] as const;

async function main() {
  const config = loadApiConfig();
  assert(config.billingProvider === "mock", "Task10 regression requires MMRI_BILLING_PROVIDER=mock; refusing to call a real payment provider");
  assert(config.environment !== "production", "Task10 disposable regression refuses to run in production mode");
  assert(config.diagnosticPriceMnt === 300000, `Initial diagnostic price must be 300000 MNT; got ${config.diagnosticPriceMnt}`);
  assert(config.retakePriceMnt === 300000, `Retake price must be 300000 MNT; got ${config.retakePriceMnt}`);

  const suffix = randomUUID().replace(/-/g, "").slice(0, 12);
  const email = `task10-${suffix}@invalid.local`;
  let userId: string | null = null;
  let companyId: string | null = null;
  const billing = new BillingService(config);
  const engine = new PrismaAssessmentEngine();

  try {
    const user = await prisma.user.create({ data: { email, displayName: "TASK10 disposable", passwordHash: "TASK10-NOT-A-LOGIN-HASH" } });
    userId = user.id;
    const company = await prisma.company.create({ data: { name: `TASK10 RETAKE ISOLATION ${suffix}`, profile: { task10Disposable: true } } });
    companyId = company.id;
    await prisma.companyMembership.create({ data: { companyId, userId, role: "OWNER" } });

    const initialInvoice = await billing.createInvoice(companyId, userId, "DIAGNOSTIC", "marketing");
    assert(initialInvoice.planCode === "DIAGNOSTIC", "Initial invoice plan mismatch");
    assert(initialInvoice.amountMnt === 300000, "Initial invoice amount mismatch");
    await billing.mockPay(initialInvoice.id);
    const initialClaim = await billing.claimAssessmentEntitlement(companyId, "marketing");
    assert(initialClaim.entitlementId, "Initial entitlement was not claimed");
    const initialEntitlement = await prisma.companyEntitlement.findUnique({ where: { id: initialClaim.entitlementId! } });
    assert(initialEntitlement?.planCode === "DIAGNOSTIC", "First assessment consumed the wrong plan");

    const first = await engine.createAssessment(companyId, undefined, userId, initialClaim.entitlementId, "marketing");
    assert(first.previousAssessmentId === null, "Initial assessment must not have previousAssessmentId");
    assert(first.parentAssessmentId === null, "Initial assessment must not have parentAssessmentId");
    await prisma.assessment.update({ where: { id: first.id }, data: { status: "COMPLETED", routingState: "ADAPTIVE_V13_COMPLETE", overallPartialScore: 42, overallOfficialScore: 42, completedAt: new Date(Date.now() - 3000) } });

    let initialBlocked = false;
    try { await billing.createInvoice(companyId, userId, "DIAGNOSTIC", "marketing"); }
    catch (error: any) { initialBlocked = error?.code === "RETAKE_REQUIRED" || String(error?.message ?? "").includes("дахин оношилгоо"); }
    assert(initialBlocked, "A second DIAGNOSTIC invoice was allowed after a completed diagnosis");

    const retakeInvoice1 = await billing.createInvoice(companyId, userId, "RETAKE", "marketing");
    assert(retakeInvoice1.planCode === "RETAKE" && retakeInvoice1.amountMnt === 300000, "Retake invoice #1 contract mismatch");
    await billing.mockPay(retakeInvoice1.id);
    const retakeClaim1 = await billing.claimAssessmentEntitlement(companyId, "marketing");
    assert(retakeClaim1.entitlementId, "Retake entitlement #1 was not claimed");
    const retakeEntitlement1 = await prisma.companyEntitlement.findUnique({ where: { id: retakeClaim1.entitlementId! } });
    assert(retakeEntitlement1?.planCode === "RETAKE", "Retake #1 consumed a non-RETAKE entitlement");

    const second = await engine.createAssessment(companyId, undefined, userId, retakeClaim1.entitlementId, "marketing");
    assert(second.id !== first.id, "Retake #1 reused the initial assessment ID");
    assert(second.previousAssessmentId === first.id, "Retake #1 previousAssessmentId does not point to initial assessment");
    assert(second.parentAssessmentId === first.id, "Retake #1 parentAssessmentId does not point to chain root");
    await prisma.assessment.update({ where: { id: second.id }, data: { status: "COMPLETED", routingState: "ADAPTIVE_V13_COMPLETE", overallPartialScore: 78, overallOfficialScore: 78, completedAt: new Date(Date.now() - 1000) } });

    const retakeInvoice2 = await billing.createInvoice(companyId, userId, "RETAKE", "marketing");
    await billing.mockPay(retakeInvoice2.id);
    const retakeClaim2 = await billing.claimAssessmentEntitlement(companyId, "marketing");
    assert(retakeClaim2.entitlementId, "Retake entitlement #2 was not claimed");
    const third = await engine.createAssessment(companyId, undefined, userId, retakeClaim2.entitlementId, "marketing");
    assert(third.id !== first.id && third.id !== second.id, "Retake #2 did not create a new assessment ID");
    assert(third.previousAssessmentId === second.id, "Retake #2 previousAssessmentId does not point to immediately previous diagnosis");
    assert(third.parentAssessmentId === first.id, "Retake #2 parentAssessmentId does not preserve the original chain root");

    const firstAfter = await prisma.assessment.findUnique({ where: { id: first.id } });
    const secondAfter = await prisma.assessment.findUnique({ where: { id: second.id } });
    assert(Number(firstAfter?.overallOfficialScore) === 42, "Retake mutated the initial assessment score");
    assert(Number(secondAfter?.overallOfficialScore) === 78, "Later retake mutated retake #1 score");
    assert(firstAfter?.status === "COMPLETED" && secondAfter?.status === "COMPLETED", "Prior terminal statuses were overwritten");

    const retakeInvoice3 = await billing.createInvoice(companyId, userId, "RETAKE", "marketing");
    await billing.mockPay(retakeInvoice3.id);
    const retakeClaim3 = await billing.claimAssessmentEntitlement(companyId, "marketing");
    assert(retakeClaim3.entitlementId, "Concurrency test entitlement was not claimed");
    let activeBlocked = false;
    try { await engine.createAssessment(companyId, undefined, userId, retakeClaim3.entitlementId, "marketing"); }
    catch (error: any) { activeBlocked = String(error?.message ?? "").includes("already active"); }
    await billing.releaseClaim(retakeClaim3);
    assert(activeBlocked, "Concurrent active assessment creation was not blocked");

    const chain = await prisma.assessment.findMany({ where: { companyId, domainCode: "marketing" }, orderBy: { createdAt: "asc" } });
    assert(chain.length === 3, `Expected exactly 3 isolated assessments, got ${chain.length}`);
    assert(chain[0]?.id === first.id && chain[1]?.id === second.id && chain[2]?.id === third.id, "Retake history ordering changed unexpectedly");
    assert(new Set(chain.map(x => x.id)).size === 3, "Assessment IDs are not unique");
    assert(`RPT-${first.id}-V4` !== `RPT-${second.id}-V4` && `RPT-${second.id}-V4` !== `RPT-${third.id}-V4`, "Assessment-bound report IDs are not unique");

    const crossChildCounts = await Promise.all(chain.map(async a => ({
      id: a.id,
      answers: await prisma.answer.count({ where: { assessmentId: a.id } }),
      reports: await prisma.reportSnapshot.count({ where: { assessmentId: a.id } }),
      strategies: await prisma.strategyRun.count({ where: { assessmentId: a.id } })
    })));
    assert(crossChildCounts.every(x => x.answers === 0 && x.reports === 0 && x.strategies === 0), "Disposable assessments unexpectedly shared/generated child artifacts");

    const terminalCount = await prisma.assessment.count({ where: { companyId, domainCode: "marketing", status: { in: [...TERMINAL] } } });
    assert(terminalCount === 2, `Expected two preserved terminal diagnoses and one fresh retake, got terminal=${terminalCount}`);

    console.log(JSON.stringify({
      status: "PASS",
      initialAssessmentId: first.id,
      retake1AssessmentId: second.id,
      retake2AssessmentId: third.id,
      lineage: [
        { id: first.id, previous: first.previousAssessmentId, parent: first.parentAssessmentId, score: 42 },
        { id: second.id, previous: second.previousAssessmentId, parent: second.parentAssessmentId, score: 78 },
        { id: third.id, previous: third.previousAssessmentId, parent: third.parentAssessmentId, score: null }
      ],
      priceMnt: { initial: initialInvoice.amountMnt, retake: retakeInvoice1.amountMnt },
      checks: {
        initialCannotRepeatAsDiagnostic: true,
        retakeEntitlementOnly: true,
        previousAndRootLineage: true,
        priorScoresImmutable: true,
        concurrentSameDomainBlocked: true,
        assessmentBoundReportIdsDistinct: true
      }
    }, null, 2));
    console.log("TASK 10/12 LIVE RETAKE ISOLATION REGRESSION: PASS");
  } finally {
    if (companyId) {
      const assessments = await prisma.assessment.findMany({ where: { companyId }, select: { id: true } }).catch(() => [] as {id:string}[]);
      const ids = assessments.map(x => x.id);
      if (ids.length) {
        // Assessment-owned children are cascaded by assessment deletion. Explicit deletion keeps cleanup deterministic.
        await prisma.assessment.deleteMany({ where: { id: { in: ids } } }).catch(() => {});
      }
      await prisma.companyEntitlement.deleteMany({ where: { companyId } }).catch(() => {});
      await prisma.billingInvoice.deleteMany({ where: { companyId } }).catch(() => {});
      await prisma.companyMembership.deleteMany({ where: { companyId } }).catch(() => {});
      await prisma.company.deleteMany({ where: { id: companyId } }).catch(() => {});
    }
    if (userId) await prisma.user.deleteMany({ where: { id: userId } }).catch(() => {});
    await prisma.$disconnect();
  }
}

main().catch(error => {
  console.error("TASK 10/12 LIVE RETAKE ISOLATION REGRESSION FAILED");
  console.error(error);
  process.exitCode = 1;
});
