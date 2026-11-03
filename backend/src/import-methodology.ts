import { readFile } from "node:fs/promises";
import { prisma } from "./db.js";
import type { MethodologyBundle } from "./lib/bundle-types.js";
import { validateBundle } from "./lib/validate-bundle-core.js";
import { sha256Json, sha256Text } from "./lib/hash.js";
import { methodologyId, moduleId, categoryId, cellTemplateId, diagnosticCellId, questionId, profileQuestionId, roleId, purposeId } from "./lib/ids.js";
import { scoringForQuestion } from "./lib/question-scoring.js";
import {
  TARGET_METHODOLOGY_BUNDLE_SHA256,
  TARGET_METHODOLOGY_VERSION,
  TARGET_QUESTION_BANK_VERSION
} from "./methodology-target.js";

const bundlePath = process.argv[2];
if (!bundlePath) throw new Error("Usage: tsx src/import-methodology.ts <bundle.json>");

const raw = await readFile(bundlePath, "utf8");
const bundle = JSON.parse(raw) as MethodologyBundle;
const issues = validateBundle(bundle);
if (issues.length) throw new Error(`Bundle invalid:\n${issues.map(i => `${i.code}: ${i.message}`).join("\n")}`);

const version = bundle.methodologyVersion?.trim()
  || bundle.sourceMethodology.match(/v(\d+\.\d+\.\d+)/)?.[1]
  || bundle.bundleVersion.replace(/^.*?(\d+\.\d+\.\d+).*$/, "$1");
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`Could not derive methodology version from bundle metadata.`);

const expectedVersion = process.env.MMRI_EXPECT_METHODOLOGY_VERSION?.trim();
if (expectedVersion && version !== expectedVersion) {
  throw new Error(`Methodology import target mismatch: bundle=${version}, expected=${expectedVersion}`);
}
if (process.env.MMRI_IMPORT_TARGET_ONLY === "YES") {
  if (version !== TARGET_METHODOLOGY_VERSION) {
    throw new Error(`Refusing non-target methodology import: bundle=${version}, target=${TARGET_METHODOLOGY_VERSION}`);
  }
  const questionBankVersion = bundle.questionBankVersion?.trim();
  if (questionBankVersion !== TARGET_QUESTION_BANK_VERSION) {
    throw new Error(`Refusing wrong question bank: bundle=${questionBankVersion ?? "MISSING"}, target=${TARGET_QUESTION_BANK_VERSION}`);
  }
  const actualBundleSha256 = sha256Text(raw);
  if (actualBundleSha256 !== TARGET_METHODOLOGY_BUNDLE_SHA256) {
    throw new Error(`Refusing target bundle SHA mismatch: bundle=${actualBundleSha256}, target=${TARGET_METHODOLOGY_BUNDLE_SHA256}`);
  }
}

const integrationActivate = process.env.MMRI_INTEGRATION_ACTIVATE_CANDIDATE === "YES";
if (integrationActivate) {
  if (process.env.MMRI_INTEGRATION_RESET_OK !== "YES") throw new Error("Integration activation requires MMRI_INTEGRATION_RESET_OK=YES.");
  if ((process.env.MMRI_ENVIRONMENT ?? "").toLowerCase() !== "integration") throw new Error("Integration activation requires MMRI_ENVIRONMENT=integration.");
  if ((process.env.NODE_ENV ?? "").toLowerCase() === "production") throw new Error("Integration activation is forbidden in NODE_ENV=production.");
  if (version !== TARGET_METHODOLOGY_VERSION) throw new Error(`Integration activation only permits target methodology ${TARGET_METHODOLOGY_VERSION}.`);
}

const vId = methodologyId(version);
const bundleSha256 = sha256Text(raw);
const activeMethodology = await prisma.methodologyVersion.findFirst({ where: { status: "ACTIVE" }, select: { id: true, version: true } });
const autoActivateBaseline = !activeMethodology && version === "1.0.1";
if (integrationActivate && activeMethodology && activeMethodology.version !== version) {
  throw new Error(`Disposable integration DB already has ACTIVE methodology ${activeMethodology.version}; reset it before activating ${version}.`);
}

const existing = await prisma.methodologyVersion.findUnique({ where: { version } });
if (existing) {
  if (existing.bundleSha256 !== bundleSha256) {
    throw new Error(`Methodology ${version} already exists with a different bundle hash. Refusing mutable re-import.`);
  }
  if (existing.status === "ACTIVE") {
    console.log(`Methodology ${version} already imported with identical SHA-256 and is ACTIVE. No-op.`);
    await prisma.$disconnect();
    process.exit(0);
  }

  const assessmentCount = await prisma.assessment.count({ where: { methodologyVersionId: existing.id } });
  if (assessmentCount > 0) {
    throw new Error(`Incomplete methodology ${version} is already referenced by ${assessmentCount} assessment(s); refusing cleanup.`);
  }
  console.warn(`Removing incomplete ${existing.status} import for methodology ${version} before retry.`);
  await prisma.methodologyVersion.delete({ where: { id: existing.id } });
}

const moduleOrder: string[] = [];
for (const c of bundle.categories) if (!moduleOrder.includes(c.Module)) moduleOrder.push(c.Module);
const moduleCodeByName = new Map(moduleOrder.map((name, i) => [name, `M${String(i+1).padStart(2,"0")}`]));

const roleContract = bundle.contracts["MMRI_FINAL_Respondent_Authority_Contract.json"];
const purposeContract = bundle.contracts["MMRI_FINAL_Five_Purpose_Mapping.json"];
const rootContract = bundle.contracts["MMRI_FINAL_Root_Cause_Dependency_Contract.json"];
const scoringContract = bundle.contracts["MMRI_FINAL_Scoring_Contract.json"];
const conditionalCellIds = new Set(["C24","C25","C26","C35","C43","C45","C46"]);
if (bundle.runtimePolicy) conditionalCellIds.add("C31");

const counts = {
  modules: moduleOrder.length,
  categories: bundle.categories.length,
  cellTemplates: bundle.cellTemplates.length,
  diagnosticCells: bundle.cellInstances.length,
  questions: bundle.questions.length,
  questionOptions: bundle.questions.reduce((n,q) => n + q.optionsMn.length, 0),
  secondaryTargets: bundle.questions.reduce((n,q) => n + q.secondaryTargets.length, 0),
  authorityRoutes: roleContract.routing.length,
  categoryDependencies: rootContract.categoryGraph.edges.length,
  cellDependencyInstances: rootContract.cellGraph.edges.length * bundle.categories.length,
  contracts: Object.keys(bundle.contracts).length,
  runtimeQuestionPolicies: bundle.runtimePolicy?.questionPolicies.length ?? 0,
  runtimeCellPolicies: bundle.runtimePolicy?.cellPolicies.length ?? 0,
  runtimeRules: bundle.runtimePolicy?.rules.length ?? 0,
  runtimeScorePatterns: bundle.runtimePolicy?.scorePatterns.length ?? 0
};

const runId = `import:${version}:${bundleSha256.slice(0,16)}`;

try {
  await prisma.methodologyVersion.create({
    data: {
      id: vId,
      domainCode: bundle.domainCode ?? "marketing",
      version,
      bundleVersion: bundle.bundleVersion,
      sourceMethodology: bundle.sourceMethodology,
      bundleSha256,
      status: "VALIDATING",
      // questionBankVersion is persisted here (no dedicated column) so snapshots can pin the bank of THIS version.
      validation: { ...(bundle.validation as any), questionBankVersion: bundle.questionBankVersion ?? null } as any,
      generatedAtUtc: bundle.generatedAtUtc ? new Date(bundle.generatedAtUtc) : null
    }
  });
  await prisma.importRun.create({ data: { id: runId, methodologyVersionId: vId, bundleSha256, status: "RUNNING" } });

  await prisma.module.createMany({ data: moduleOrder.map((name, i) => {
    const code = moduleCodeByName.get(name)!;
    const category = bundle.categories.find(c => c.Module === name)!;
    return { id: moduleId(version, code), methodologyVersionId: vId, code, nameMn: name, weightPct: category["Module weight %"], orderIndex: i+1 };
  }) });

  await prisma.category.createMany({ data: bundle.categories.map((c, i) => {
    const mCode = moduleCodeByName.get(c.Module)!;
    return { id: categoryId(version,c.ID), methodologyVersionId: vId, moduleId: moduleId(version,mCode), externalId: c.ID, nameMn: c.Category, moduleWeightPct: c["Module weight %"], categoryWeightPct: c["Category weight %"], orderIndex: i+1 };
  }) });

  await prisma.cellTemplate.createMany({ data: bundle.cellTemplates.map((c, i) => ({
    id: cellTemplateId(version,c.ID), methodologyVersionId: vId, externalId: c.ID, nameMn: c["Diagnostic cell"], groupMn: c.Group, roleMn: c.Role,
    weightPct: c["Weight %"], naPolicy: c.ID === "C01" ? "CATEGORY_GATE" : conditionalCellIds.has(c.ID) ? "CONDITIONAL" : "DISALLOWED",
    sourceNaEligibility: c["N/A eligible"], orderIndex: i+1
  })) });

  await prisma.diagnosticCell.createMany({ data: bundle.cellInstances.map(c => ({
    id: diagnosticCellId(version,c.categoryId,c.cellId), methodologyVersionId: vId, categoryId: categoryId(version,c.categoryId), cellTemplateId: cellTemplateId(version,c.cellId),
    externalId: c.cellInstanceId, weightPctOverride: c.weightPctOverride ?? null, directQuestionCount: c.directQuestionCount, independentSourceKinds: c.independentSourceKinds,
    minThreePathConfidenceAtAuthority075: c.minimumThreePathConfidenceAtAuthority075, preferredRoleCode: c.preferredRole, preferredAuthority: c.preferredAuthority, coverageStatus: c.coverageStatus
  })) });

  for (const role of roleContract.roles) {
    await prisma.respondentRole.create({ data: { id: roleId(version,role.id), methodologyVersionId: vId, externalId: role.id, code: role.code, labelMn: role.label, scopeMn: role.scope } });
  }

  for (const p of purposeContract.purposes) {
    await prisma.purposeDefinition.create({ data: { id: purposeId(version,p.id), methodologyVersionId: vId, externalId: p.id, code: p.code, labelMn: p.label, orderIndex: Number(p.id.replace("P","")) } });
  }

  await prisma.scoringProfile.createMany({ data: Object.entries(scoringContract.profiles).map(([code, definition]) => ({ id: `${version}:SCORING:${code}`, methodologyVersionId: vId, code, definition: definition as any })) });

  await prisma.methodologyContract.createMany({ data: Object.entries(bundle.contracts).map(([sourceName, definition]) => ({
    id: `${version}:CONTRACT:${sha256Text(sourceName).slice(0,20)}`, methodologyVersionId: vId, sourceName, contractVersion: String((definition as any).version ?? "UNKNOWN"), sha256: bundle.sourceManifest[sourceName]?.sha256 ?? null, definition: definition as any
  })) });

  await prisma.sourceManifestEntry.createMany({ data: Object.entries(bundle.sourceManifest).map(([sourceName, m]) => ({
    id: `${version}:MANIFEST:${sha256Text(sourceName).slice(0,20)}`, methodologyVersionId: vId, sourceName, sourceVersion: m.version, sha256: m.sha256, chunkCount: Number(m.chunks), sizeValue: Number(m.size), role: m.role
  })) });

  for (const chunk of chunked(bundle.questions, 500)) {
    await prisma.question.createMany({ data: chunk.map(q => {
      const scored = q.explicitOptions ?? scoringForQuestion(q.cellId,q.optionsMn);
      const profileCodes = q.scoringProfileCode ? [q.scoringProfileCode] : [...new Set((scored as any[]).map(x => x.scoringProfileCode))];
      if (profileCodes.length !== 1 || !profileCodes[0]) throw new Error(`Could not resolve a single scoring profile for ${q.questionId}`);
      return {
        id: questionId(version,q.questionId), methodologyVersionId: vId, categoryId: categoryId(version,q.categoryId), primaryCellId: diagnosticCellId(version,q.categoryId,q.cellId),
        externalId: q.questionId, sourceRow: q.sourceRow, path: q.path, sourceKind: q.sourceKind, textMn: q.textMn, primaryCoefficient: q.primaryCoefficient,
        scoringProfileCode: profileCodes[0], optionSetHash: sha256Json(q.optionsMn)
      };
    }) });
  }

  for (const chunk of chunked(bundle.questions, 250)) {
    const optionRows = chunk.flatMap(q => {
      const scored = q.explicitOptions ?? scoringForQuestion(q.cellId,q.optionsMn);
      return q.optionsMn.map((labelMn, i) => ({ id: `${questionId(version,q.questionId)}:O${i+1}`, questionId: questionId(version,q.questionId), optionIndex: i+1, labelMn, score: scored[i].score, state: scored[i].state }));
    });
    await prisma.questionOption.createMany({ data: optionRows });

    const secondaryRows = chunk.flatMap(q => q.secondaryTargets.map((t, i) => ({
      id: `${questionId(version,q.questionId)}:S${i+1}`, questionId: questionId(version,q.questionId), targetCellId: diagnosticCellId(version,q.categoryId,t.targetCell), coefficient: t.coefficient, relationCode: t.relation
    })));
    if (secondaryRows.length) await prisma.questionSecondaryTarget.createMany({ data: secondaryRows });
  }

  for (const [i, pq] of bundle.profileQuestions.entries()) {
    const pId = profileQuestionId(version,pq.id);
    await prisma.profileQuestion.create({ data: { id: pId, methodologyVersionId: vId, externalId: pq.id, textMn: pq.questionMn, questionType: pq.type ?? null, orderIndex: i+1 } });
    if (pq.optionsMn.length) await prisma.profileQuestionOption.createMany({ data: pq.optionsMn.map((labelMn, idx) => ({ id: `${pId}:O${idx+1}`, profileQuestionId: pId, optionIndex: idx+1, labelMn })) });
  }

  await prisma.authorityRouting.createMany({ data: roleContract.routing.map((r: any) => ({
    id: `${version}:AUTH:${r.category}:${r.cell}`, diagnosticCellId: diagnosticCellId(version,r.category,r.cell), preferredRoleId: roleId(version,r.preferredRole), preferredAuthority: Number(r.preferredAuthority),
    backupRoles: { roles: String(r.backupRoles).split(",").map((s:string)=>s.trim()).filter(Boolean), authority: String(r.backupAuthority) }
  })) });

  const purposeByCategory = new Map(purposeContract.mapping.map((m: any) => [m.category,m]));
  const cpRows: any[] = [];
  for (const c of bundle.categories) {
    const mapping: any = purposeByCategory.get(c.ID);
    for (const p of purposeContract.purposes) cpRows.push({
      id: `${version}:CP:${c.ID}:${p.id}`, categoryId: categoryId(version,c.ID), purposeId: purposeId(version,p.id), coefficient: Number(mapping.relevance[p.id]), rationale: mapping.rationale ?? null
    });
  }
  await prisma.categoryPurposeMapping.createMany({ data: cpRows });

  await prisma.categoryDependency.createMany({ data: rootContract.categoryGraph.edges.map((e:any) => ({
    id: `${version}:CATDEP:${e.id}`, methodologyVersionId: vId, externalId: e.id, prerequisiteCategoryId: categoryId(version,e.prerequisite), dependentCategoryId: categoryId(version,e.dependent), strength: Number(e.strength), dependencyType: e.type, rationale: e.rationale
  })) });

  const cellDepRows: any[] = [];
  for (const c of bundle.categories) {
    for (const e of rootContract.cellGraph.edges) {
      cellDepRows.push({ id: `${version}:CELLDEP:${c.ID}:${e.id}`, methodologyVersionId: vId, externalId: e.id, prerequisiteCellId: diagnosticCellId(version,c.ID,e.prerequisite), dependentCellId: diagnosticCellId(version,c.ID,e.dependent), strength: Number(e.strength), dependencyType: e.type, rationale: e.rationale });
    }
  }
  for (const chunk of chunked(cellDepRows, 500)) await prisma.cellDependency.createMany({ data: chunk });

  if (bundle.runtimePolicy) {
    const runtime = bundle.runtimePolicy;

    await prisma.runtimeScorePattern.createMany({ data: runtime.scorePatterns.map(p => ({
      id: `${version}:RSP:${p.code}`,
      methodologyVersionId: vId,
      code: p.code,
      scoreEligible: p.scoreEligible,
      scoredOptionCount: p.scoredOptionCount,
      optionScores: p.optionScores as any
    })) });

    for (const chunk of chunked(runtime.rules, 100)) {
      await prisma.runtimeRuleDefinition.createMany({ data: chunk.map(r => ({
        id: `${version}:RR:${r.ruleId}`,
        methodologyVersionId: vId,
        ruleId: r.ruleId,
        ruleType: r.ruleType,
        definition: r.definition as any
      })) });
    }

    for (const chunk of chunked(runtime.questionPolicies, 500)) {
      await prisma.questionRuntimePolicy.createMany({ data: chunk.map(p => ({
        id: `${version}:QRP:${p.questionId}`,
        methodologyVersionId: vId,
        questionId: questionId(version,p.questionId),
        questionRole: p.questionRole,
        scoreEligible: p.scoreEligible,
        scoringMethod: p.scoringMethod,
        scoredOptionCount: p.scoredOptionCount,
        scorePatternCode: p.scorePatternCode,
        directAskAllowed: p.directAskAllowed,
        routingState: p.routingState,
        askStage: p.askStage,
        selectionPriority: p.selectionPriority,
        isAnchor: p.isAnchor,
        applicabilityGateKey: p.applicabilityGateKey,
        triggerRuleId: p.triggerRuleId,
        confidenceRuleId: p.confidenceRuleId,
        defaultAsk: p.defaultAsk,
        stopRuleId: p.stopRuleId
      })) });
    }

    for (const chunk of chunked(runtime.cellPolicies, 500)) {
      await prisma.cellRuntimePolicy.createMany({ data: chunk.map(p => {
        const [categoryExternalId, cellExternalId] = p.cellExternalId.split(":");
        if (!categoryExternalId || !cellExternalId) throw new Error(`Invalid runtime cell external ID ${p.cellExternalId}`);
        return {
          id: `${version}:CRP:${categoryExternalId}:${cellExternalId}`,
          methodologyVersionId: vId,
          diagnosticCellId: diagnosticCellId(version,categoryExternalId,cellExternalId),
          applicabilityMode: p.applicabilityMode,
          applicabilityGateKey: p.applicabilityGateKey,
          isAnchorCell: p.isAnchorCell,
          directAskableQuestions: p.directAskableQuestions,
          maxDirectQuestions: p.maxDirectQuestions,
          indirectConfidenceCap: p.indirectConfidenceCap,
          primaryConfidenceFloor: p.primaryConfidenceFloor,
          lockThreshold: p.lockThreshold,
          conflictGapThreshold: p.conflictGapThreshold,
          stateModelId: p.stateModelId,
          valueRuleId: p.valueRuleId
        };
      }) });
    }
  }

  if (autoActivateBaseline || integrationActivate) {
    await prisma.methodologyVersion.update({ where: { id: vId }, data: { status: "ACTIVE", activatedAt: new Date() } });
  }
  await prisma.importRun.update({ where: { id: runId }, data: { status: "PASS", finishedAt: new Date(), counts } });
  if (integrationActivate) console.log(`Imported MMRI methodology ${version} and activated it ONLY for the disposable integration database.`);
  else if (autoActivateBaseline) console.log(`Imported baseline MMRI methodology ${version} successfully and activated it.`);
  else console.log(`Imported immutable candidate MMRI methodology ${version} successfully in VALIDATING state. Governed production activation remains required.`);
  console.log(counts);
} catch (error) {
  await prisma.importRun.updateMany({ where: { id: runId }, data: { status: "FAIL", finishedAt: new Date(), errorMessage: error instanceof Error ? error.stack ?? error.message : String(error) } }).catch(() => undefined);
  throw error;
} finally {
  await prisma.$disconnect();
}

function chunked<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size));
  return result;
}
