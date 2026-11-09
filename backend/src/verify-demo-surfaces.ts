import "dotenv/config";
import { prisma } from "./db.js";
import { PrismaAssessmentEngine } from "./services/prisma-assessment-engine.js";
import { PrismaStrategyReportService } from "./services/prisma-strategy-report-service.js";

const DEMO_TAG = "MMRI_DEMO_COMPANY_V2_FAST";

async function main() {
  const company = await prisma.company.findFirst({ where: { profile: { path: ["demo"], equals: true } as any } });
  if (!company) throw new Error("Демо компани олдсонгүй");

  const assessments = await prisma.assessment.findMany({
    where: { companyId: company.id },
    orderBy: [{ completedAt: "asc" }, { createdAt: "asc" }]
  });
  const demo = assessments.filter(x => (x.profile as any)?.demoSeed === DEMO_TAG && ["COMPLETED", "COMPLETED_WITH_REVIEW", "EXHAUSTED"].includes(x.status));
  if (demo.length !== 3) throw new Error(`3 дууссан демо оношилгоо хүлээгдсэн, бодит: ${demo.length}`);

  const engine = new PrismaAssessmentEngine();
  const reports = new PrismaStrategyReportService(engine);

  for (let i = 0; i < demo.length; i++) {
    const a = demo[i];
    const diagnosis = await reports.getDiagnosisResult(a.id);
    const recommendations = await reports.getRecommendations(a.id);
    const plan = await reports.getActionPlan(a.id);
    const report = await reports.freezeReportPayload(a.id);

    if (!diagnosis.resultHash) throw new Error(`${i + 1}-р оношилгооны resultHash алга`);
    if (recommendations.diagnosisResultHash !== diagnosis.resultHash) throw new Error(`${i + 1}-р оношилгооны зөвлөмжийн binding зөрсөн`);
    if (plan.diagnosisResultHash !== diagnosis.resultHash) throw new Error(`${i + 1}-р оношилгооны хэрэгжилтийн binding зөрсөн`);
    if (report.diagnosisResultHash !== diagnosis.resultHash) throw new Error(`${i + 1}-р оношилгооны тайлангийн binding зөрсөн`);
    if (!plan.plan?.milestones?.length) throw new Error(`${i + 1}-р оношилгооны 365 хоногийн төлөвлөгөө хоосон`);
    if (!report.priorityActions || !report.roadmap) throw new Error(`${i + 1}-р оношилгооны тайлангийн payload дутуу`);

    console.log(`✓ ${i + 1}-р оношилгоо: үр дүн + зөвлөмж + хэрэгжилт + тайлан OK`);
  }

  console.log("✓ Демо 3 оношилгооны хэрэглэгчийн бүх үндсэн дэлгэцийн өгөгдөл бэлэн.");
}

main().catch(err => {
  console.error("Демо дэлгэцийн runtime шалгалт амжилтгүй:", err);
  process.exitCode = 1;
}).finally(async () => {
  await prisma.$disconnect();
});
