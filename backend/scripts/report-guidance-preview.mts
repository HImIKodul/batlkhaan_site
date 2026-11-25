/* READ-ONLY preview of the report wording on an existing QA diagnosis: nothing is stored and the database session refuses writes.
   DATABASE_URL=<mmri_qa_acc2_*> npx tsx scripts/report-guidance-preview.mts <outDir> <assessmentId>...   -> <domain>-<score>.pdf + .json (narrative, plan, checks). No model is called. */
import fs from "node:fs"; import path from "node:path"; import { execFileSync } from "node:child_process";
const url = new URL(process.env.DATABASE_URL!); if (!/^\/mmri_qa_acc2_/.test(url.pathname)) throw new Error("REFUSED: QA database only");
url.searchParams.set("options", "-c default_transaction_read_only=on"); process.env.DATABASE_URL = url.toString();
const { prisma } = await import("../src/db.js"); const { PrismaAssessmentEngine } = await import("../src/services/prisma-assessment-engine.js"); const { PrismaStrategyReportService } = await import("../src/services/prisma-strategy-report-service.js");
const { buildReportGuidance } = await import("../src/report/guidance/index.js"); const { deterministicAnnualPlan } = await import("../src/report/guidance/year-plan.js"); const { deterministicFallbackNarrative } = await import("../src/report/fallback-renderer.js");
const { validateNarrativeDraft } = await import("../src/report/validator.js"); const { buildReportPdfSource } = await import("../src/report/pdf-artifact.js"); const { recomputeFrozenReportPayloadHash, assertFrozenReportIntegrity } = await import("../src/report/integrity.js"); const { withDeterministicClaimIds } = await import("../src/report/coordinator.js"); const { guidanceIssues } = await import("../src/report/guidance/check.js");
const [out, ...ids] = process.argv.slice(2); fs.mkdirSync(out, { recursive: true }); const svc: any = new PrismaStrategyReportService(new PrismaAssessmentEngine());
const ro = await prisma.$queryRawUnsafe<any[]>("show default_transaction_read_only"); if (ro[0].default_transaction_read_only !== "on") throw new Error("session is not read-only");
for (const id of ids) {
  const asm: any = await prisma.assessment.findUniqueOrThrow({ where: { id }, select: { domainCode: true } }); const stored: any = (await prisma.reportSnapshot.findFirstOrThrow({ where: { assessmentId: id } })).payload;
  const ctx: any = await svc.context(id); const strategy: any = (await prisma.strategyPlanSnapshot.findUniqueOrThrow({ where: { assessmentId: id } })).snapshot;
  const risks = stored.risks.map((r: any) => r.id === "RISK-EVIDENCE" ? { ...r, messageMn: "Зарим нарийвчилсан асуултыг энэ удаа асуугаагүй тул холбогдох дүнг урьдчилсан гэж үзнэ." } : r); // as new reports word it
  const payload: any = { ...stored, risks, payloadVersion: "MMRI-REPORT-PAYLOAD-1.3", guidance: buildReportGuidance(ctx.methodology, ctx.snapshot, { rootCause: strategy.rootCause } as any, stored) }; payload.payloadHash = recomputeFrozenReportPayloadHash(payload); assertFrozenReportIntegrity(payload);
  if (process.env.PAYLOAD_OUT) fs.writeFileSync(process.env.PAYLOAD_OUT, JSON.stringify(payload), { mode: 0o600 }); // input of scripts/live-plan-one.mts (one paid report, only with the owner's approval)
  const narrative: any = withDeterministicClaimIds(deterministicFallbackNarrative(payload)); const validation = validateNarrativeDraft(payload, narrative); const plan = deterministicAnnualPlan(payload); if (plan) narrative.annualPlan = plan;
  const source = buildReportPdfSource(payload, narrative); const name = `${asm.domainCode}-${Math.round(payload.overall.score ?? 0)}-${id.slice(-4)}`; const f = path.join(out, name);
  fs.writeFileSync(f + ".json", JSON.stringify({ ...source, render: { domainCode: asm.domainCode, reportDate: payload.generatedAt.slice(0, 10) } }, null, 1));
  let fit = "ok"; try { execFileSync("python3", ["pdf_renderer/render_report_pdf.py", "--input", f + ".json", "--output", f + ".pdf", "--strict"], { stdio: "pipe" }) } catch (e: any) { fit = "STRICT-FAIL " + String(e.stderr).slice(0, 160); execFileSync("python3", ["pdf_renderer/render_report_pdf.py", "--input", f + ".json", "--output", f + ".pdf"], { stdio: "pipe" }) }
  const pages = /Pages:\s+(\d+)/.exec(execFileSync("pdfinfo", [f + ".pdf"], { encoding: "utf8" }))![1];
  console.log(name, "pages", pages, fit, "narrative", validation.state, validation.issues.map((x: any) => x.checkId).join(), "guidance", JSON.stringify(guidanceIssues(payload, plan)));
}
await prisma.$disconnect();
