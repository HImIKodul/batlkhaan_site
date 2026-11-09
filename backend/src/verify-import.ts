import { prisma } from "./db.js";

const version = process.argv[2] ?? "1.0.1";
const methodology = await prisma.methodologyVersion.findUnique({ where: { version } });
if (!methodology) throw new Error(`Methodology ${version} not found.`);

const [modules,categories,templates,cells,questions,options,secondary,roles,authority,purposes,purposeMaps,catDeps,cellDeps,contracts,profile] = await Promise.all([
  prisma.module.count({ where: { methodologyVersionId: methodology.id } }),
  prisma.category.count({ where: { methodologyVersionId: methodology.id } }),
  prisma.cellTemplate.count({ where: { methodologyVersionId: methodology.id } }),
  prisma.diagnosticCell.count({ where: { methodologyVersionId: methodology.id } }),
  prisma.question.count({ where: { methodologyVersionId: methodology.id } }),
  prisma.questionOption.count({ where: { question: { methodologyVersionId: methodology.id } } }),
  prisma.questionSecondaryTarget.count({ where: { question: { methodologyVersionId: methodology.id } } }),
  prisma.respondentRole.count({ where: { methodologyVersionId: methodology.id } }),
  prisma.authorityRouting.count({ where: { diagnosticCell: { methodologyVersionId: methodology.id } } }),
  prisma.purposeDefinition.count({ where: { methodologyVersionId: methodology.id } }),
  prisma.categoryPurposeMapping.count({ where: { category: { methodologyVersionId: methodology.id } } }),
  prisma.categoryDependency.count({ where: { methodologyVersionId: methodology.id } }),
  prisma.cellDependency.count({ where: { methodologyVersionId: methodology.id } }),
  prisma.methodologyContract.count({ where: { methodologyVersionId: methodology.id } }),
  prisma.profileQuestion.count({ where: { methodologyVersionId: methodology.id } })
]);

const expected: Record<string,[number,number]> = {
  modules:[modules,8], categories:[categories,64], cellTemplates:[templates,48], diagnosticCells:[cells,3072], questions:[questions,12288],
  secondaryTargets:[secondary,30720], authorityRoutes:[authority,3072], purposes:[purposes,5], categoryPurposeMappings:[purposeMaps,320],
  categoryDependencies:[catDeps,183], cellDependencies:[cellDeps,142*64], contracts:[contracts,23], profileQuestions:[profile,20]
};

let failed = false;
for (const [name,[actual,wanted]] of Object.entries(expected)) {
  const ok = actual === wanted;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}: ${actual} / ${wanted}`);
  if (!ok) failed = true;
}
console.log(`INFO questionOptions=${options} respondentRoles=${roles} methodologyStatus=${methodology.status}`);
if (methodology.status !== "ACTIVE") failed = true;
await prisma.$disconnect();
if (failed) process.exit(1);
