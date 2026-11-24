/* Owner decisions of 2026-11-24 on a DISPOSABLE clone: (2) profile answers need consent, (3) historical PDFs are immutable across generator versions, (4) a missing plan is recovered only once, by authorisation, with the old version archived.
   Needs: clone DATABASE_URL, own MMRI_REPORT_STORAGE_DIR, local fake model (MMRI_AI_REPORT_ENDPOINT on 127.0.0.1). */
import fs from "node:fs"; import path from "node:path"; import { createHash } from "node:crypto";
const db = decodeURIComponent(new URL(process.env.DATABASE_URL!).pathname.slice(1));
if (!/^mmri_qa_acc2_/.test(db)) throw new Error("REFUSED " + db);
if (!/^http:\/\/127\.0\.0\.1:/.test(process.env.MMRI_AI_REPORT_ENDPOINT ?? "")) throw new Error("REFUSED: local fake model only");
const { prisma } = await import("../src/db.js");
const { PrismaAssessmentEngine } = await import("../src/services/prisma-assessment-engine.js");
const { PrismaStrategyReportService } = await import("../src/services/prisma-strategy-report-service.js");
const { createAnnualPlanProviderFromEnv } = await import("../src/api/ai-report-provider.js");
const { MMRI_PDF_GENERATOR_VERSION } = await import("../src/report/pdf-artifact.js");
const { readAiProfileConsent, writeAiProfileConsent } = await import("../src/company/ai-profile-consent.js");
let fail = 0; const ok = (n: string, c: unknown, d: unknown = "") => { if (!c) fail++; console.log(`${c ? "PASS" : "FAIL"} ${n} ${c ? "" : JSON.stringify(d)}`); };
const sha = (f: string) => createHash("sha256").update(fs.readFileSync(f)).digest("hex");
const code = async (p: Promise<any>) => { try { await p; return "OK"; } catch (e: any) { return e.code ?? e.message; } };
const provider = createAnnualPlanProviderFromEnv("development")!; let calls = 0;
const counted = { generate: async (...a: any[]) => { calls++; return (provider as any).generate(...a); }, repair: async (...a: any[]) => { calls++; return (provider as any).repair(...a); } } as any;
const engine = new PrismaAssessmentEngine(); const svc: any = new PrismaStrategyReportService(engine, undefined, counted);
const snaps = await prisma.reportSnapshot.findMany({ where: { publishedAt: { not: null }, generationState: { in: ["PASS", "AI_FALLBACK_USED"] } }, orderBy: { publishedAt: "asc" } });
const S = snaps.filter((s: any) => !(s.narrative as any)?.annualPlan)[0] as any; if (!S) throw new Error("no published report without a plan in the clone");
const A = S.assessmentId, root = path.resolve(process.env.MMRI_REPORT_STORAGE_DIR!);
// make it a genuine current file, then label it as made by the earlier generator
process.env.MMRI_PDF_ALLOW_GENERATOR_UPGRADE = "YES"; let art = await svc.getOrCreateReportPdf(A); delete process.env.MMRI_PDF_ALLOW_GENERATOR_UPGRADE;
ok("new reports carry the new generator version", art.generatorVersion === MMRI_PDF_GENERATOR_VERSION && art.storageKey.includes("1_7"), art);
await prisma.reportArtifact.update({ where: { reportSnapshotId_kind: { reportSnapshotId: S.id, kind: "PDF" } } as any, data: { generatorVersion: "MMRI-PDF-1.6-BUSINESSMRI-BRAND", sourceHash: "0".repeat(64) } });
const before = sha(art.absolutePath);
const served = await svc.getOrCreateReportPdf(A), forced = await svc.getOrCreateReportPdf(A, true);
ok("historical PDF served byte-identical, also when forced and when the source schema changed", served.contentHash === before && forced.contentHash === before && served.generatorVersion.includes("1.6") && sha(art.absolutePath) === before);
fs.renameSync(art.absolutePath, art.absolutePath + ".lost");
ok("a lost historical PDF is reported, not re-drawn", (await code(svc.getOrCreateReportPdf(A))) === "LEGACY_PDF_UNAVAILABLE" && (await code(svc.getOrCreateReportPdf(A, true))) === "LEGACY_PDF_UNAVAILABLE");
process.env.MMRI_PDF_ALLOW_GENERATOR_UPGRADE = "YES"; const up = await svc.getOrCreateReportPdf(A); delete process.env.MMRI_PDF_ALLOW_GENERATOR_UPGRADE;
ok("operator decision creates a new version", up.generatorVersion === MMRI_PDF_GENERATOR_VERSION);
if (fs.existsSync(art.absolutePath + ".lost")) fs.unlinkSync(art.absolutePath + ".lost");
// consent
const asm = await prisma.assessment.findUniqueOrThrow({ where: { id: A }, select: { companyId: true } }); const owner = await prisma.companyMembership.findFirstOrThrow({ where: { companyId: asm.companyId, role: "OWNER" } });
ok("consent defaults to not given and nothing is sent", !(await readAiProfileConsent(asm.companyId)).granted && (await svc.planCompanyContext(A)).length === 0);
await writeAiProfileConsent(asm.companyId, owner.userId, true); const ctx = await svc.planCompanyContext(A);
ok("after consent at most five profile answers are used", ctx.length <= 5 && (await readAiProfileConsent(asm.companyId)).granted, ctx);
await writeAiProfileConsent(asm.companyId, owner.userId, false);
ok("withdrawal is immediate", (await svc.planCompanyContext(A)).length === 0);
// missing plan
const oldHash = (await svc.getOrCreateReportPdf(A)).contentHash;
const [r1, r2] = await Promise.allSettled([svc.recoverPublishedPlan(A, "gate-admin", "gate test"), svc.recoverPublishedPlan(A, "gate-admin", "gate test")]);
ok("parallel recovery: exactly one runs", [r1, r2].filter(r => r.status === "fulfilled").length === 1, [r1, r2]);
const paid = calls; ok("at most 1 generation + 2 repairs", paid >= 1 && paid <= 3, paid);
const now = await svc.readPublishedReport(A); ok("plan stored and bound to this payload", now.narrative.annualPlan?.state === "READY" && now.narrative.annualPlan.sourcePayloadHash === now.payload.payloadHash);
ok("a stored plan is never generated again", (await code(svc.recoverPublishedPlan(A, "gate-admin", "again"))) === "PLAN_ALREADY_EXISTS" && calls === paid);
await svc.getOrCreateReportPdf(A); await svc.generateReport(A, { trigger: "VIEW" }); ok("viewing and downloading makes no model call", calls === paid);
const arch = fs.readdirSync(path.join(root, "archive", A)); ok("earlier PDF and text archived unchanged", arch.some(f => f.endsWith(".pdf") && sha(path.join(root, "archive", A, f)) === oldHash) && arch.some(f => f.endsWith(".json")), arch);
const ev = await prisma.auditEvent.count({ where: { assessmentId: A, payload: { path: ["operation"], equals: "ANNUAL_PLAN_RECOVERY" } } }); ok("start, result and version change audited", ev >= 3, ev);
const off = new PrismaStrategyReportService(engine) as any; ok("without a provider recovery is refused", (await code(off.generateMissingPlan(A, { sections: [] }, "x", "y"))) === "PLAN_PROVIDER_DISABLED");
console.log(fail ? `RESULT FAIL ${fail}` : "RESULT PASS"); await prisma.$disconnect(); process.exit(fail ? 1 : 0);
