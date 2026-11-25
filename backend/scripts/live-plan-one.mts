/* ONE real-model 12-month plan, for reading by a person. Two separate steps so the key never meets a database:
   1) prepare (offline): DATABASE_URL=<disposable clone> npx tsx scripts/live-plan-one.mts prepare <assessmentId> <dir>
   2) run (PAID, needs the owner's approval): env -i PATH="$PATH" MMRI_LIVE_PLAN_APPROVED=YES_ONE_REQUEST OPENAI_API_KEY=... MODEL=... PRICE_IN_USD_PER_M=... PRICE_OUT_USD_PER_M=... CAP_USD=0.10 npx tsx scripts/live-plan-one.mts run <dir>
      exactly one generation request, no repair, no retry, output capped at 8,000 tokens; refused when the worst case is above CAP_USD or a result already exists in <dir>. */
import fs from "node:fs"; import path from "node:path";
const [mode, a, b] = process.argv.slice(2);
if (mode === "prepare") {
  const db = decodeURIComponent(new URL(process.env.DATABASE_URL!).pathname.slice(1)); if (!/^mmri_qa_acc2_/.test(db)) throw new Error("REFUSED " + db);
  const { prisma } = await import("../src/db.js"); const { PrismaAssessmentEngine } = await import("../src/services/prisma-assessment-engine.js"); const { PrismaStrategyReportService } = await import("../src/services/prisma-strategy-report-service.js");
  const { buildPlanInput, planSystemInstructions, planUserInput, PLAN_DOMAIN_NAME_MN } = await import("../src/report/annual-plan.js");
  const svc: any = new PrismaStrategyReportService(new PrismaAssessmentEngine()); const payload = await svc.freezeReportPayload(a); const asm = await prisma.assessment.findUniqueOrThrow({ where: { id: a }, select: { domainCode: true } });
  const extras = { evidenceFromAnswers: await svc.planEvidence(a, payload), catalog: await svc.planCatalog(a), companyCharacteristics: await svc.planCompanyContext(a), answersOverview: await svc.planOverview(a, payload), rootFindings: await svc.planRootFindings(a) };
  const domain = PLAN_DOMAIN_NAME_MN[String(asm.domainCode)]; const { input } = buildPlanInput(payload, domain, extras); const chars = planSystemInstructions().length + planUserInput(input).length;
  const raw = JSON.stringify(input); const leaks = [payload.companyName, payload.assessmentId, "@"].filter(x => x && raw.includes(x));
  fs.mkdirSync(b, { recursive: true, mode: 0o700 }); fs.writeFileSync(path.join(b, "case.json"), JSON.stringify({ payload, extras, domain, domainCode: asm.domainCode }), { mode: 0o600 }); fs.writeFileSync(path.join(b, "what-would-be-sent.json"), JSON.stringify(input, null, 1), { mode: 0o600 });
  console.log(JSON.stringify({ domain, chars, answersIncluded: extras.evidenceFromAnswers.length, profileAnswers: extras.companyCharacteristics.length, companyNameOrIdInInput: leaks })); await prisma.$disconnect();
} else if (mode === "run") {
  if (process.env.MMRI_LIVE_PLAN_APPROVED !== "YES_ONE_REQUEST" && process.env.MMRI_LIVE_PLAN_APPROVED !== "YES_ONE_REPORT") throw new Error("NOT APPROVED: paid request refused"); if (process.env.DATABASE_URL) throw new Error("REFUSED: run without a database");
  const { generateAnnualPlan, buildPlanInput, planSystemInstructions, planUserInput, OpenAiAnnualPlanProvider } = await import("../src/report/annual-plan.js");
  const num = (k: string) => { const n = Number(process.env[k]); if (!(n > 0)) throw new Error(k + " required"); return n; }; const pi = num("PRICE_IN_USD_PER_M"), po = num("PRICE_OUT_USD_PER_M"), cap = num("CAP_USD");
  const { payload, extras, domain } = JSON.parse(fs.readFileSync(path.join(a, "case.json"), "utf8")); const out = path.join(a, "result.json"); if (fs.existsSync(out)) throw new Error("REFUSED: this case already has a result");
  const { input } = buildPlanInput(payload, domain, extras); const worst = (planSystemInstructions().length + planUserInput(input).length) / 1e6 * pi + 8000 / 1e6 * po; if (worst > cap) throw new Error(`REFUSED: worst case ${worst.toFixed(3)} USD is above the cap`);
  const real = new OpenAiAnnualPlanProvider({ apiKey: process.env.OPENAI_API_KEY!, model: process.env.MODEL!, timeoutMs: 120_000, maxOutputTokens: 8000 }); let used = 0, draft: unknown = null; const calls: any[] = [];
  const once: any = { generate: async (i: any, s: string) => { if (used++) throw new Error("request limit"); const r = await real.generate(i, s); draft = r.draft; return r; } };
  const plan: any = await generateAnnualPlan(payload, domain, once, { extras, onCall: c => calls.push(c) }); const u = calls[0]?.usage;
  const rec = { model: process.env.MODEL, requests: used, usage: u ?? null, costUsd: u ? (u.inputTokens * pi + u.outputTokens * po) / 1e6 : null, checks: calls, plan, draft };
  fs.writeFileSync(out, JSON.stringify(rec, null, 1), { mode: 0o600 }); console.log(JSON.stringify({ state: plan.state, reason: plan.reason ?? null, requests: used, usage: u ?? null, costUsd: rec.costUsd, issues: calls[0]?.issues })); 
} else if (mode === "narrative") {
  /* SECOND single request (the report text: summary, strengths, weaknesses, priorities) under the SAME cap: what the plan already cost is subtracted. PAID, needs the owner's approval. */
  if (process.env.MMRI_LIVE_PLAN_APPROVED !== "YES_ONE_REPORT") throw new Error("NOT APPROVED: paid request refused"); if (process.env.DATABASE_URL) throw new Error("REFUSED: run without a database");
  const { aiSystemInstructions, aiGenerationInput } = await import("../src/report/ai-prompt.js"); const { OpenAiNarrativeProvider } = await import("../src/report/openai-narrative-provider.js"); const { withDeterministicClaimIds } = await import("../src/report/coordinator.js"); const { validateNarrativeDraft } = await import("../src/report/validator.js");
  const num = (k: string) => { const n = Number(process.env[k]); if (!(n > 0)) throw new Error(k + " required"); return n; }; const pi = num("PRICE_IN_USD_PER_M"), po = num("PRICE_OUT_USD_PER_M"), cap = Math.min(num("CAP_USD"), 0.15);
  const { payload, extras, domain } = JSON.parse(fs.readFileSync(path.join(a, "case.json"), "utf8")); const { buildPlanInput, planSystemInstructions, planUserInput } = await import("../src/report/annual-plan.js"); const first = JSON.parse(fs.readFileSync(path.join(a, "result.json"), "utf8")); const out = path.join(a, "narrative.json"); if (fs.existsSync(out)) throw new Error("REFUSED: already ran");
  if (!(first.costUsd > 0)) throw new Error("REFUSED: cost of the first request unknown"); /* tokens per character measured by the first request, plus 30 percent */ const planChars = planSystemInstructions().length + planUserInput(buildPlanInput(payload, domain, extras).input).length; const inTok = Math.ceil((aiSystemInstructions().length + aiGenerationInput(payload).length) * Math.min(1, first.usage.inputTokens / planChars) * 1.3); const left = cap - first.costUsd - inTok / 1e6 * pi; const maxOut = Math.min(8000, Math.floor(left / po * 1e6)); if (maxOut < 3000) throw new Error(`REFUSED: only ${maxOut} output tokens fit under the cap`);
  const p = new OpenAiNarrativeProvider({ apiKey: process.env.OPENAI_API_KEY!, model: process.env.MODEL!, timeoutMs: 120_000, totalTimeoutMs: 125_000, maxOutputTokens: maxOut, maxRetries: 0 });
  fs.writeFileSync(out, JSON.stringify({ state: "STARTED" }), { mode: 0o600 });
  const r = await p.generate(payload); const draft = withDeterministicClaimIds(r.draft); const validation: any = validateNarrativeDraft(payload, draft); const u = (r.telemetry as any)?.usage; const cost = u ? (u.inputTokens * pi + u.outputTokens * po) / 1e6 : null;
  fs.writeFileSync(out, JSON.stringify({ model: process.env.MODEL, usage: u ?? null, costUsd: cost, validation, draft }, null, 1), { mode: 0o600 }); console.log(JSON.stringify({ status: validation.status, usage: u ?? null, costUsd: cost, totalUsd: cost === null ? null : cost + first.costUsd, maxOut }));
} else if (mode === "estimate") {
  /* offline: characters (upper bound of tokens) of both requests */
  const { aiSystemInstructions, aiGenerationInput } = await import("../src/report/ai-prompt.js"); const { buildPlanInput, planSystemInstructions, planUserInput } = await import("../src/report/annual-plan.js");
  const { payload, extras, domain } = JSON.parse(fs.readFileSync(path.join(a, "case.json"), "utf8")); const plan = planSystemInstructions().length + planUserInput(buildPlanInput(payload, domain, extras).input).length, nar = aiSystemInstructions().length + aiGenerationInput(payload).length; console.log(JSON.stringify({ planChars: plan, narrativeChars: nar }));
} else if (mode === "render") {
  /* offline: the plan of result.json in the real three-page PDF (deterministic narrative), no key, no database */
  const { buildReportPdfSource } = await import("../src/report/pdf-artifact.js"); const { deterministicFallbackNarrative } = await import("../src/report/fallback-renderer.js"); const { execFileSync } = await import("node:child_process"); const { planStartDate } = await import("../src/report/annual-plan.js");
  const { payload, domainCode } = JSON.parse(fs.readFileSync(path.join(a, "case.json"), "utf8")); const { plan } = JSON.parse(fs.readFileSync(path.join(a, "result.json"), "utf8")); const nf = path.join(a, "narrative.json"); const nd = fs.existsSync(nf) ? JSON.parse(fs.readFileSync(nf, "utf8")).draft : null; if (plan.state !== "READY") throw new Error("no accepted plan to render");
  fs.writeFileSync(path.join(a, "source.json"), JSON.stringify({ ...buildReportPdfSource(payload, { ...(nd ?? deterministicFallbackNarrative(payload)), annualPlan: plan } as any), render: { domainCode, reportDate: planStartDate(payload.generatedAt).toISOString().slice(0, 10) } }));
  execFileSync("python3", ["pdf_renderer/render_report_pdf.py", "--input", path.join(a, "source.json"), "--output", path.join(a, "report.pdf")]); console.log(execFileSync("pdfinfo", [path.join(a, "report.pdf")], { encoding: "utf8" }).match(/Pages:\s+\d+/)![0]);
} else throw new Error("prepare | run | render");
