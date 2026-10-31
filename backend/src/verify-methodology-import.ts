import { readFile } from "node:fs/promises";
import { prisma } from "./db.js";
import type { MethodologyBundle } from "./lib/bundle-types.js";
import { methodologyId } from "./lib/ids.js";
import { sha256Text } from "./lib/hash.js";
import {
  TARGET_METHODOLOGY_BUNDLE,
  TARGET_METHODOLOGY_BUNDLE_SHA256,
  TARGET_METHODOLOGY_VERSION,
  TARGET_QUESTION_BANK_VERSION
} from "./methodology-target.js";

const version = process.argv[2] ?? TARGET_METHODOLOGY_VERSION;
const bundlePath = process.argv[3] ?? TARGET_METHODOLOGY_BUNDLE;
const expectedStatus = (process.env.MMRI_EXPECT_METHODOLOGY_STATUS ?? "VALIDATING").trim();
const raw = await readFile(bundlePath, "utf8");
const bundle = JSON.parse(raw) as MethodologyBundle;
const declaredVersion = bundle.methodologyVersion?.trim() || bundle.sourceMethodology.match(/v(\d+\.\d+\.\d+)/)?.[1];
if (declaredVersion !== version) throw new Error(`Verifier version mismatch: bundle=${declaredVersion}, requested=${version}`);
if (bundle.questionBankVersion?.trim() !== TARGET_QUESTION_BANK_VERSION) throw new Error(`Verifier question-bank mismatch: bundle=${bundle.questionBankVersion ?? "MISSING"}, target=${TARGET_QUESTION_BANK_VERSION}`);
if (sha256Text(raw) !== TARGET_METHODOLOGY_BUNDLE_SHA256) throw new Error(`Verifier target-bundle SHA mismatch.`);

const id = methodologyId(version);
const methodology = await prisma.methodologyVersion.findUnique({ where: { id } });
if (!methodology) throw new Error(`Methodology ${version} is not imported.`);
if (methodology.bundleSha256 !== sha256Text(raw)) throw new Error(`Methodology ${version} bundle SHA-256 does not match the frozen file.`);
if (methodology.status !== expectedStatus) throw new Error(`Methodology ${version} status=${methodology.status}, expected=${expectedStatus}`);

const roleContract = bundle.contracts["MMRI_FINAL_Respondent_Authority_Contract.json"];
const purposeContract = bundle.contracts["MMRI_FINAL_Five_Purpose_Mapping.json"];
const rootContract = bundle.contracts["MMRI_FINAL_Root_Cause_Dependency_Contract.json"];
const runtime = bundle.runtimePolicy;
const expected = {
  modules: new Set(bundle.categories.map(c => c.Module)).size,
  categories: bundle.categories.length,
  cellTemplates: bundle.cellTemplates.length,
  diagnosticCells: bundle.cellInstances.length,
  questions: bundle.questions.length,
  questionOptions: bundle.questions.reduce((n,q)=>n+q.optionsMn.length,0),
  secondaryTargets: bundle.questions.reduce((n,q)=>n+q.secondaryTargets.length,0),
  respondentRoles: roleContract.roles.length,
  authorityRoutes: roleContract.routing.length,
  purposes: purposeContract.purposes.length,
  categoryPurposeMappings: bundle.categories.length * purposeContract.purposes.length,
  categoryDependencies: rootContract.categoryGraph.edges.length,
  cellDependencies: rootContract.cellGraph.edges.length * bundle.categories.length,
  contracts: Object.keys(bundle.contracts).length,
  profileQuestions: bundle.profileQuestions.length,
  questionPolicies: runtime?.questionPolicies.length ?? 0,
  cellPolicies: runtime?.cellPolicies.length ?? 0,
  runtimeRules: runtime?.rules.length ?? 0,
  scorePatterns: runtime?.scorePatterns.length ?? 0
};

const actual = {
  modules: await prisma.module.count({where:{methodologyVersionId:id}}),
  categories: await prisma.category.count({where:{methodologyVersionId:id}}),
  cellTemplates: await prisma.cellTemplate.count({where:{methodologyVersionId:id}}),
  diagnosticCells: await prisma.diagnosticCell.count({where:{methodologyVersionId:id}}),
  questions: await prisma.question.count({where:{methodologyVersionId:id}}),
  questionOptions: await prisma.questionOption.count({where:{question:{methodologyVersionId:id}}}),
  secondaryTargets: await prisma.questionSecondaryTarget.count({where:{question:{methodologyVersionId:id}}}),
  respondentRoles: await prisma.respondentRole.count({where:{methodologyVersionId:id}}),
  authorityRoutes: await prisma.authorityRouting.count({where:{diagnosticCell:{methodologyVersionId:id}}}),
  purposes: await prisma.purposeDefinition.count({where:{methodologyVersionId:id}}),
  categoryPurposeMappings: await prisma.categoryPurposeMapping.count({where:{category:{methodologyVersionId:id}}}),
  categoryDependencies: await prisma.categoryDependency.count({where:{methodologyVersionId:id}}),
  cellDependencies: await prisma.cellDependency.count({where:{methodologyVersionId:id}}),
  contracts: await prisma.methodologyContract.count({where:{methodologyVersionId:id}}),
  profileQuestions: await prisma.profileQuestion.count({where:{methodologyVersionId:id}}),
  questionPolicies: await prisma.questionRuntimePolicy.count({where:{methodologyVersionId:id}}),
  cellPolicies: await prisma.cellRuntimePolicy.count({where:{methodologyVersionId:id}}),
  runtimeRules: await prisma.runtimeRuleDefinition.count({where:{methodologyVersionId:id}}),
  scorePatterns: await prisma.runtimeScorePattern.count({where:{methodologyVersionId:id}})
};

const failures = Object.entries(expected).filter(([k,want]) => actual[k as keyof typeof actual] !== want);
if (failures.length) throw new Error(`Import verification failed: ${failures.map(([k,w])=>`${k}=${actual[k as keyof typeof actual]}, expected ${w}`).join("; ")}`);

const [first,last,run] = await Promise.all([
  prisma.question.findFirst({where:{methodologyVersionId:id},orderBy:{sourceRow:"asc"},select:{externalId:true,textMn:true}}),
  prisma.question.findFirst({where:{methodologyVersionId:id},orderBy:{sourceRow:"desc"},select:{externalId:true,textMn:true}}),
  prisma.importRun.findFirst({where:{methodologyVersionId:id,bundleSha256:methodology.bundleSha256,status:"PASS"},orderBy:{finishedAt:"desc"}})
]);
if (first?.externalId !== "MMRI-C01-D01-Q1") throw new Error(`Unexpected first question ID ${first?.externalId}`);
if (last?.externalId !== "MMRI-C64-D48-Q4") throw new Error(`Unexpected last question ID ${last?.externalId}`);
if (!run) throw new Error(`No PASS import run found for ${version} / frozen bundle hash.`);

console.log(JSON.stringify({status:"PASS",methodology:{id,version,status:methodology.status,bundleSha256:methodology.bundleSha256},counts:actual,firstQuestion:first,lastQuestion:last,importRunId:run.id},null,2));
await prisma.$disconnect();
