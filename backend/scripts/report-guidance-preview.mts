/* READ-ONLY preview of the report wording on an existing QA diagnosis: nothing is stored and the database session refuses writes.
   DATABASE_URL=<mmri_qa_acc2_*> npx tsx scripts/report-guidance-preview.mts <outDir> <assessmentId>...   -> <domain>-<score>.pdf + .json (narrative, plan, checks). No model is called. */
import fs from "node:fs"; import path from "node:path"; import { execFileSync } from "node:child_process";
const url = new URL(process.env.DATABASE_URL!); if (!/^\/mmri_qa_acc2_/.test(url.pathname)) throw new Error("REFUSED: QA database only");
url.searchParams.set("options", "-c default_transaction_read_only=on"); process.env.DATABASE_URL = url.toString();
const { prisma } = await import("../src/db.js"); const { PrismaAssessmentEngine } = await import("../src/services/prisma-assessment-engine.js"); const { PrismaStrategyReportService } = await import("../src/services/prisma-strategy-report-service.js");
const { buildReportGuidance } = await import("../src/report/guidance/index.js"); const { deterministicAnnualPlan } = await import("../src/report/guidance/year-plan.js"); const { deterministicFallbackNarrative } = await import("../src/report/fallback-renderer.js");
const { validateNarrativeDraft } = await import("../src/report/validator.js"); const { buildReportPdfSource } = await import("../src/report/pdf-artifact.js"); const { recomputeFrozenReportPayloadHash, assertFrozenReportIntegrity } = await import("../src/report/integrity.js"); const { withDeterministicClaimIds } = await import("../src/report/coordinator.js"); const { guidanceIssues } = await import("../src/report/guidance/check.js");
const { contradictionMessage } = await import("../src/report/payload.js"); const [out, ...ids] = process.argv.slice(2); fs.mkdirSync(out, { recursive: true }); const svc: any = new PrismaStrategyReportService(new PrismaAssessmentEngine());
const ro = await prisma.$queryRawUnsafe<any[]>("show default_transaction_read_only"); if (ro[0].default_transaction_read_only !== "on") throw new Error("session is not read-only");
for (const id of ids) {
  const asm: any = await prisma.assessment.findUniqueOrThrow({ where: { id }, select: { domainCode: true } }); const stored: any = (await prisma.reportSnapshot.findFirstOrThrow({ where: { assessmentId: id } })).payload;
  const ctx: any = await svc.context(id); const strategy: any = (await prisma.strategyPlanSnapshot.findUniqueOrThrow({ where: { assessmentId: id } })).snapshot;
  /* what a NEW report of this diagnosis would freeze: the list flag, the risk wording and the guidance */
  const threshold = Number(ctx.methodology.contracts.rootCause?.weaknessThreshold ?? 60), hard = ctx.snapshot.contradictions.filter((c: any) => c.type === "HARD");
  const risks = stored.risks.map((r: any) => r.id === "RISK-EVIDENCE" ? { ...r, messageMn: "Зарим нарийвчилсан асуултыг энэ удаа асуугаагүй тул холбогдох дүнг урьдчилсан гэж үзнэ." } : r.id === "RISK-CONTRADICTION" ? { ...r, messageMn: contradictionMessage([...new Set(hard.map((c: any) => c.categoryId))].map((x: any) => ctx.methodology.categories.find((c: any) => c.id === x)?.nameMn ?? x)) } : r.id === "RISK-REVIEW" ? { ...r, messageMn: r.messageMn.replace(/ нүд нягтлах шаардлагатай төлөвтэй байна/, " асуулгын хэсгийг нягтлах шаардлагатай") } : r);
  const weaknesses = stored.weaknesses.map((w: any) => w.score >= threshold ? { ...w, needsEvidence: true } : w), base = { ...stored, risks, weaknesses };
  let payload: any = { ...base, payloadVersion: "MMRI-REPORT-PAYLOAD-1.3", guidance: buildReportGuidance(ctx.methodology, ctx.snapshot, strategy, base) };
  let suffix = "";
  if (process.env.PERSONA) { /* a realistic mixed company built IN MEMORY: the same questions, plausible answers per capability, the real scoring and strategy engines; nothing is stored */
    let seed = Number(process.env.PERSONA) * 7919 + id.length; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    const level = new Map(ctx.methodology.categories.map((c: any) => [c.id, 15 + 75 * rnd()])), ev: any[] = [];
    for (const [, cell] of ctx.snapshot.cells as Map<string, any>) for (const e of cell.directEvidence ?? []) {
      const q: any = ctx.methodology.questionById.get(e.questionId), scored = (q?.options ?? []).filter((o: any) => typeof o.score === "number"); if (typeof e.score !== "number" || !scored.length) { ev.push(e); continue; }
      if (rnd() < 0.07) continue; /* not answered */ const want = Math.max(0, Math.min(100, level.get(e.categoryId)! + (rnd() - 0.5) * 44));
      const o = scored.reduce((m: any, x: any) => Math.abs(x.score - want) < Math.abs(m.score - want) ? x : m); ev.push({ ...e, score: o.score, state: o.state ?? "SCORED", optionIndex: o.optionIndex, optionLabel: o.labelMn ?? o.label });
    }
    const { calculateRuntimeSnapshot } = await import("../src/engine/calculation.js"); const { runStrategyPipeline } = await import("../src/strategy/index.js"); const { buildFrozenReportPayload } = await import("../src/report/payload.js"); const { recomputeFrozenReportBindingHash } = await import("../src/report/integrity.js");
    const snapshot = calculateRuntimeSnapshot(ctx.methodology, ev), st = runStrategyPipeline({ methodology: ctx.methodology, snapshot, profileAnswers: ctx.profileAnswers }); const labels = Object.fromEntries(stored.purposes.map((p: any) => [p.id, p.nameMn]));
    payload = JSON.parse(JSON.stringify(buildFrozenReportPayload({ ...stored, reportId: process.env.PREVIEW_COMPANY ? "EXAMPLE" : stored.reportId, payloadHash: "", companyName: process.env.PREVIEW_COMPANY ?? "Сэлэнгэ Холдинг ХХК", methodology: ctx.methodology, snapshot, strategy: st, purposeLabels: labels } as any))); payload.bindingHash = recomputeFrozenReportBindingHash(payload); suffix = "-mixed";
  }
  payload.payloadHash = recomputeFrozenReportPayloadHash(payload); assertFrozenReportIntegrity(payload);
  if (process.env.PAYLOAD_OUT) fs.writeFileSync(process.env.PAYLOAD_OUT, JSON.stringify(payload), { mode: 0o600 }); // input of scripts/live-plan-one.mts (one paid report, only with the owner's approval)
  const narrative: any = withDeterministicClaimIds(deterministicFallbackNarrative(payload)); const validation = validateNarrativeDraft(payload, narrative); const plan = deterministicAnnualPlan(payload); if (plan) narrative.annualPlan = plan;
  if (process.env.SAMPLE_OUT) { /* the synthetic example of guide 3: only what the report page reads */
    const keep = (o: any, ks: string[]) => Object.fromEntries(ks.filter(k => o[k] !== undefined).map(k => [k, o[k]]));
    fs.writeFileSync(process.env.SAMPLE_OUT, JSON.stringify({ payload: { ...keep(payload, ["companyName", "generatedAt", "overall", "guidance", "requiredWarnings"]), assessmentId: "EXAMPLE", reportId: "EXAMPLE", payloadHash: "EXAMPLE", displayDictionary: {}, roadmap: [], strengths: payload.strengths.map((x: any) => keep(x, ["id", "categoryId", "nameMn", "score", "basis"])), weaknesses: payload.weaknesses.map((x: any) => keep(x, ["id", "categoryId", "nameMn", "score", "basis", "needsEvidence"])), priorityActions: payload.priorityActions.map((x: any) => keep(x, ["id", "categoryId", "titleMn", "objectiveMn", "actionMn", "deliverableMn", "kpiMn", "statedMn", "currentCellScore", "targetCellScore"])) },
      narrative: { sections: narrative.sections.filter((x: any) => ["S04", "S05", "S06", "S10"].includes(x.id)).map((x: any) => ({ id: x.id, titleMn: x.titleMn, claims: x.claims.map((c: any) => keep(c, ["claimType", "textMn", "sourceTraceIds", "recommendationId"])) })), annualPlan: { ...plan, sourcePayloadHash: "EXAMPLE" } } }));
  }
  const source = buildReportPdfSource(payload, narrative); const name = `${asm.domainCode}-${Math.round(payload.overall.score ?? 0)}-${id.slice(-4)}${suffix}`; const f = path.join(out, name);
  fs.writeFileSync(f + ".json", JSON.stringify({ ...source, render: { domainCode: asm.domainCode, reportDate: payload.generatedAt.slice(0, 10) } }, null, 1));
  let fit = "ok"; try { execFileSync("python3", ["pdf_renderer/render_report_pdf.py", "--input", f + ".json", "--output", f + ".pdf", "--strict"], { stdio: "pipe" }) } catch (e: any) { fit = "STRICT-FAIL " + String(e.stderr).slice(0, 160); execFileSync("python3", ["pdf_renderer/render_report_pdf.py", "--input", f + ".json", "--output", f + ".pdf"], { stdio: "pipe" }) }
  const pages = /Pages:\s+(\d+)/.exec(execFileSync("pdfinfo", [f + ".pdf"], { encoding: "utf8" }))![1];
  console.log(name, "pages", pages, fit, "narrative", validation.state, validation.issues.map((x: any) => x.checkId).join(), "guidance", JSON.stringify(guidanceIssues(payload, plan)));
}
await prisma.$disconnect();
