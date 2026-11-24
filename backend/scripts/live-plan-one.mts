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
  const extras = { evidenceFromAnswers: await svc.planEvidence(a, payload), catalog: await svc.planCatalog(a), companyCharacteristics: await svc.planCompanyContext(a), rootFindings: await svc.planRootFindings(a) };
  const domain = PLAN_DOMAIN_NAME_MN[String(asm.domainCode)]; const { input } = buildPlanInput(payload, domain, extras); const chars = planSystemInstructions().length + planUserInput(input).length;
  const raw = JSON.stringify(input); const leaks = [payload.companyName, payload.assessmentId, "@"].filter(x => x && raw.includes(x));
  fs.mkdirSync(b, { recursive: true, mode: 0o700 }); fs.writeFileSync(path.join(b, "case.json"), JSON.stringify({ payload, extras, domain }), { mode: 0o600 }); fs.writeFileSync(path.join(b, "what-would-be-sent.json"), JSON.stringify(input, null, 1), { mode: 0o600 });
  console.log(JSON.stringify({ domain, chars, answersIncluded: extras.evidenceFromAnswers.length, profileAnswers: extras.companyCharacteristics.length, companyNameOrIdInInput: leaks })); await prisma.$disconnect();
} else if (mode === "run") {
  if (process.env.MMRI_LIVE_PLAN_APPROVED !== "YES_ONE_REQUEST") throw new Error("NOT APPROVED: paid request refused"); if (process.env.DATABASE_URL) throw new Error("REFUSED: run without a database");
  const { generateAnnualPlan, buildPlanInput, planSystemInstructions, planUserInput, OpenAiAnnualPlanProvider } = await import("../src/report/annual-plan.js");
  const num = (k: string) => { const n = Number(process.env[k]); if (!(n > 0)) throw new Error(k + " required"); return n; }; const pi = num("PRICE_IN_USD_PER_M"), po = num("PRICE_OUT_USD_PER_M"), cap = num("CAP_USD");
  const { payload, extras, domain } = JSON.parse(fs.readFileSync(path.join(a, "case.json"), "utf8")); const out = path.join(a, "result.json"); if (fs.existsSync(out)) throw new Error("REFUSED: this case already has a result");
  const { input } = buildPlanInput(payload, domain, extras); const worst = (planSystemInstructions().length + planUserInput(input).length) / 1e6 * pi + 8000 / 1e6 * po; if (worst > cap) throw new Error(`REFUSED: worst case ${worst.toFixed(3)} USD is above the cap`);
  const real = new OpenAiAnnualPlanProvider({ apiKey: process.env.OPENAI_API_KEY!, model: process.env.MODEL!, timeoutMs: 120_000, maxOutputTokens: 8000 }); let used = 0, draft: unknown = null; const calls: any[] = [];
  const once: any = { generate: async (i: any, s: string) => { if (used++) throw new Error("request limit"); const r = await real.generate(i, s); draft = r.draft; return r; } };
  const plan: any = await generateAnnualPlan(payload, domain, once, { extras, onCall: c => calls.push(c) }); const u = calls[0]?.usage;
  const rec = { model: process.env.MODEL, requests: used, usage: u ?? null, costUsd: u ? (u.inputTokens * pi + u.outputTokens * po) / 1e6 : null, checks: calls, plan, draft };
  fs.writeFileSync(out, JSON.stringify(rec, null, 1), { mode: 0o600 }); console.log(JSON.stringify({ state: plan.state, reason: plan.reason ?? null, requests: used, usage: u ?? null, costUsd: rec.costUsd, issues: calls[0]?.issues })); 
} else throw new Error("prepare | run");
