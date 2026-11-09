/* Phase 1: MMRI-01 (operator authorization by immutable user id) and MMRI-06 (customer summaries honour the review withholding decision).
   Refuses to run unless DATABASE_URL is the isolated test database. MMRI-06 inserts ONE temporary report_reviews row for an existing completed assessment and removes it.
   Usage: . scratch/testenv; MMRI_REPORT_REVIEW_REQUIRED=true npx tsx scripts/qa-phase1-access-regression.ts */
import { prisma } from "../src/db.js";
import { requireOperator } from "../src/api/auth/access.js";
import { AssessmentQueryService } from "../src/api/services/query-service.js";

if (!/mmri_codexfix/.test(process.env.DATABASE_URL ?? "")) { console.error("Refusing to run: DATABASE_URL is not the isolated test database"); process.exit(2); }
let fail = 0; const rec = (n: string, ok: boolean, d = "") => { if (!ok) fail++; console.log((ok ? "PASS " : "FAIL ") + n + (d ? " | " + d : "")); };
const denies = (fn: () => void) => { try { fn(); return false; } catch { return true; } };

// ---- MMRI-01: an e-mail address (unverified at registration) never grants operator rights in production ----
const emails = new Set(["operator@businessmmri.mn"]); const ids = new Set(["usr_operator_immutable_1"]);
const prod: any = { environment: "production", operatorEmails: emails, operatorUserIds: ids };
const dev: any = { environment: "development", operatorEmails: emails, operatorUserIds: ids };
rec("A1 production: an attacker who registered the operator's e-mail address is denied", denies(() => requireOperator({ userId: "usr_attacker", email: "Operator@BusinessMMRI.mn", tokenVersion: 1 }, prod)));
rec("A2 production: the provisioned immutable user id is allowed", !denies(() => requireOperator({ userId: "usr_operator_immutable_1", email: "anything@example.com", tokenVersion: 1 }, prod)));
rec("A3 production: an empty allowlist denies everyone", denies(() => requireOperator({ userId: "usr_operator_immutable_1", email: "operator@businessmmri.mn", tokenVersion: 1 }, { ...prod, operatorUserIds: new Set() })));
rec("A4 non-production keeps the e-mail convenience (development/test stacks only)", !denies(() => requireOperator({ userId: "u", email: "operator@businessmmri.mn", tokenVersion: 1 }, dev)));

// ---- MMRI-06 ----
const qs = new AssessmentQueryService({} as any, {} as any);
const target = await prisma.assessment.findFirst({ where: { status: { in: ["COMPLETED", "COMPLETED_WITH_REVIEW"] }, overallPartialScore: { not: null }, id: { notIn: (await prisma.reportReview.findMany({ select: { assessmentId: true } })).map(r => r.assessmentId) } }, select: { id: true, companyId: true, domainCode: true, completedAt: true } });
if (!target) throw new Error("no completed assessment without a review in the test database");
const base = { assessmentId: target.id, companyId: target.companyId, domainCode: target.domainCode, submittedAt: new Date(), deadlineAt: new Date(Date.now() + 48 * 3600e3) };
const row = async () => (await qs.listCompanyAssessments(target.companyId) as any[]).find(x => x.id === target.id);
const hasScores = (o: any) => o.partialScore !== null || o.officialScore !== null || o.coverage !== null || o.isOfficial;
try {
  const before = await row(); const detailBefore: any = await qs.getAssessment(target.id);
  rec("S0 no review (historical assessment): scores stay visible", before.reportAvailable === true && hasScores(before.overall) && hasScores(detailBefore.overall));
  await prisma.reportReview.create({ data: { ...base, status: "SUBMITTED" } });
  for (const status of ["SUBMITTED", "IN_REVIEW", "APPROVED"]) {
    await prisma.reportReview.update({ where: { assessmentId: target.id }, data: { status } });
    const list = await row(); const detail: any = await qs.getAssessment(target.id); const st: any = await qs.status(target.id);
    rec(`S1 review ${status}: list, detail and status carry no score and announce no report`, list.reportAvailable === false && !hasScores(list.overall) && detail.reportAvailable === false && !hasScores(detail.overall) && st.lifecycle.reportReady === false && st.lifecycle.canViewResults === false && st.lifecycle.reviewPending === true && st.lifecycle.publishedReportId === null, `list=${JSON.stringify(list.overall)}`);
  }
  await prisma.reportReview.update({ where: { assessmentId: target.id }, data: { status: "PUBLISHED", publishedAt: new Date() } });
  const pub = await row(); const st2: any = await qs.status(target.id);
  rec("S2 PUBLISHED: scores and report availability return", pub.reportAvailable === true && hasScores(pub.overall) && st2.lifecycle.reviewPending === false);
} finally {
  await prisma.reportReview.deleteMany({ where: { assessmentId: target.id } }); await prisma.$disconnect();
}
console.log(fail ? `FAILED ${fail}` : "ALL PASS"); process.exit(fail ? 1 : 0);
