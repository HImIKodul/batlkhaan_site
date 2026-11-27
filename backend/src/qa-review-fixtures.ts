/**
 * LOCAL DEVELOPMENT ONLY. Disposable fixtures for the report-review lifecycle tests: for each requested domain it creates ONE new completed assessment in the dedicated QA company
 * (same engine, scoring and report freeze as the QA seed; an administrator-grant entitlement, so no invoice or payment is invented) and a review row that is due in `--hours-ago` hours
 * (default 2) after submission. It never touches an existing record, never calls the AI service, and refuses a non-local database.
 * Run: MMRI_QA_SEED_LOCAL_DB=127.0.0.1:55432/mmri_dev_clean npx tsx src/qa-review-fixtures.ts [--domains=marketing,it,finance,people,operations] [--hours-ago=2]
 * Output: one JSON line  {"runTag":"...","fixtures":{"finance":{"assessmentId":"...","reviewId":"..."},...}}
 */
import "dotenv/config";
import { randomBytes } from "node:crypto";
import { prisma } from "./db.js";
import { MethodologyDefinitionCache } from "./services/methodology-cache.js";
import { allDomainMethodologyTargets } from "./domain-methodology.js";
import { assertLocalDevDatabase, seedAssessment, SCENARIOS } from "./seed-qa-account.js";

const arg = (name: string, d: string) => process.argv.find(a => a.startsWith(`--${name}=`))?.split("=")[1] ?? d;

async function main() {
  assertLocalDevDatabase();
  const domains = arg("domains", "marketing,it,finance,people,operations").split(",").map(x => x.trim()).filter(Boolean);
  const hoursAgo = Number(arg("hours-ago", "2"));
  const user = await prisma.user.findUnique({ where: { email: "qa.local@mmri.test" }, select: { id: true } });
  const membership = user ? await prisma.companyMembership.findFirst({ where: { userId: user.id, role: "OWNER" }, select: { companyId: true, company: { select: { name: true } } } }) : null;
  if (!user || !membership || !membership.company.name.startsWith("QA")) throw new Error("The dedicated QA company was not found (run the QA seed first).");
  const admin = await prisma.adminAccount.findFirst({ where: { role: "SUPER_ADMIN", status: "ACTIVE" }, select: { id: true } });
  if (!admin) throw new Error("An active administrator is needed as the grantor of the fixture entitlements.");
  const cache = new MethodologyDefinitionCache(prisma);
  const runTag = `fx${Date.now().toString(36)}${randomBytes(2).toString("hex")}`;
  const fixtures: Record<string, { assessmentId: string; reviewId: string }> = {};
  for (const domain of domains) {
    const target = allDomainMethodologyTargets().find(t => t.domainCode === domain);
    const scenario = SCENARIOS[domain];
    if (!target || !scenario) throw new Error(`Unknown domain ${domain}`);
    const methodology = await prisma.methodologyVersion.findUnique({ where: { version: target.methodologyVersion } });
    if (!methodology || methodology.status !== "ACTIVE") throw new Error(`Methodology for ${domain} is not ACTIVE`);
    const def = await cache.get(methodology.id);
    const ent = await prisma.companyEntitlement.create({ data: { companyId: membership.companyId, domainCode: domain, origin: "ADMIN_GRANT", planCode: "RETAKE", status: "CONSUMED", assessmentLimit: 1, assessmentsUsed: 1, startsAt: new Date(Date.now() - hoursAgo * 3_600_000 - 3_600_000), grantedByAdminId: admin.id, grantReason: `QA review fixture ${runTag}` } });
    const submittedAt = new Date(Date.now() - hoursAgo * 3_600_000);
    const assessmentId = await seedAssessment({ domain, methodologyVersion: target.methodologyVersion, qbVersion: target.questionBankVersion, index: 99, companyId: membership.companyId, userId: user.id, entitlementId: ent.id, def, moduleTargets: scenario.first, completedAt: submittedAt, previousAssessmentId: null, rootAssessmentId: null });
    const review = await prisma.reportReview.create({ data: { id: `${runTag}_${domain}`, assessmentId, companyId: membership.companyId, domainCode: domain, status: "SUBMITTED", submittedAt, deadlineAt: new Date(submittedAt.getTime() + 24 * 3_600_000), version: 0, currentRevision: 0, remindersSent: {} } });
    fixtures[domain] = { assessmentId, reviewId: review.id };
  }
  console.log("FIXTURES " + JSON.stringify({ runTag, fixtures }));
}
main().catch(e => { console.error("fixture failed:", e instanceof Error ? e.message : e); process.exitCode = 1; }).finally(async () => { await prisma.$disconnect(); });
