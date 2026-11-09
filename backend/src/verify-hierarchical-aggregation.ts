import { prisma } from "../src/db.js";

const assessmentId = process.argv[2];
const targetVersion = process.env.MMRI_EXPECT_METHODOLOGY_VERSION ?? "3.0.0";
const assessment = assessmentId
  ? await prisma.assessment.findUnique({ where: { id: assessmentId }, include: { methodologyVersion: true } })
  : await prisma.assessment.findFirst({
      where: { methodologyVersion: { version: targetVersion } },
      orderBy: { updatedAt: "desc" },
      include: { methodologyVersion: true }
    });

if (!assessment) throw new Error(`No ${targetVersion} assessment found for aggregation verification`);

const [modules, categories, moduleResults, categoryResults] = await Promise.all([
  prisma.module.findMany({ where: { methodologyVersionId: assessment.methodologyVersionId }, orderBy: { orderIndex: "asc" } }),
  prisma.category.findMany({ where: { methodologyVersionId: assessment.methodologyVersionId }, orderBy: { orderIndex: "asc" } }),
  prisma.moduleResult.findMany({ where: { assessmentId: assessment.id } }),
  prisma.categoryResult.findMany({ where: { assessmentId: assessment.id } })
]);

const close = (a: number, b: number, tolerance = 0.001) => Math.abs(a - b) <= tolerance;
const requireTrue = (condition: boolean, message: string) => { if (!condition) throw new Error(message); };
const num = (value: any): number | null => value === null || value === undefined ? null : Number(value);

requireTrue(modules.length === 8, `Expected 8 modules, got ${modules.length}`);
requireTrue(categories.length === 64, `Expected 64 categories, got ${categories.length}`);
requireTrue(moduleResults.length === 8, `Expected 8 module results, got ${moduleResults.length}`);
requireTrue(categoryResults.length === 64, `Expected 64 category results, got ${categoryResults.length}`);
requireTrue(assessment.aggregationVersion === "HIERARCHICAL_V13", `Assessment aggregationVersion=${assessment.aggregationVersion}`);
requireTrue(close(modules.reduce((s,m)=>s+Number(m.weightPct),0),100), "Module weights do not total 100");
requireTrue(close(categories.reduce((s,c)=>s+Number(c.categoryWeightPct),0),100), "Capability weights do not total 100");

for (const module of modules) {
  const capabilityWeight = categories.filter(c=>c.moduleId===module.id).reduce((s,c)=>s+Number(c.categoryWeightPct),0);
  requireTrue(close(capabilityWeight, Number(module.weightPct)), `Capability weights do not reconcile for ${module.code}`);
}

for (const result of categoryResults) {
  requireTrue(result.aggregationVersion === "HIERARCHICAL_V13", `Category result ${result.categoryId} has ${result.aggregationVersion}`);
  for (const value of [result.partialScore,result.officialScore]) {
    const n=num(value); if(n!==null) requireTrue(n>=0&&n<=100,`Category score out of range ${result.categoryId}`);
  }
  for (const value of [result.confidence,result.coverage]) {
    const n=num(value); if(n!==null) requireTrue(n>=0&&n<=1,`Category confidence/coverage out of range ${result.categoryId}`);
  }
}
for (const result of moduleResults) {
  requireTrue(result.aggregationVersion === "HIERARCHICAL_V13", `Module result ${result.moduleId} has ${result.aggregationVersion}`);
  for (const value of [result.partialScore,result.officialScore]) {
    const n=num(value); if(n!==null) requireTrue(n>=0&&n<=100,`Module score out of range ${result.moduleId}`);
  }
  for (const value of [result.confidence,result.coverage]) {
    const n=num(value); if(n!==null) requireTrue(n>=0&&n<=1,`Module confidence/coverage out of range ${result.moduleId}`);
  }
}

const partialContributions = moduleResults.map(r=>num(r.partialContribution)).filter((v):v is number=>v!==null);
if (assessment.overallPartialScore !== null && partialContributions.length > 0) {
  requireTrue(close(partialContributions.reduce((a,b)=>a+b,0),Number(assessment.overallPartialScore)),"Module partial contributions do not sum to overall partial score");
}
if (assessment.overallOfficialScore !== null) {
  requireTrue(moduleResults.every(r=>r.officialScore!==null),"Overall official score exists before all applicable modules are official");
  const contributions = moduleResults.map(r=>num(r.officialContribution)).filter((v):v is number=>v!==null);
  requireTrue(close(contributions.reduce((a,b)=>a+b,0),Number(assessment.overallOfficialScore)),"Module official contributions do not sum to overall official score");
}

for (const module of modules) {
  const mr=moduleResults.find(r=>r.moduleId===module.id);
  if(!mr||mr.partialScore===null) continue;
  const cats=categoryResults.filter(r=>categories.find(c=>c.id===r.categoryId)?.moduleId===module.id);
  const contributions=cats.map(r=>num(r.partialContributionToModule)).filter((v):v is number=>v!==null);
  if(contributions.length) requireTrue(close(contributions.reduce((a,b)=>a+b,0),Number(mr.partialScore)),`Capability contributions do not sum to ${module.code}`);
}

console.log(JSON.stringify({
  status:"PASS",
  assessmentId:assessment.id,
  methodologyVersion:assessment.methodologyVersion.version,
  aggregationVersion:assessment.aggregationVersion,
  modules:modules.length,
  categories:categories.length,
  moduleResults:moduleResults.length,
  categoryResults:categoryResults.length,
  overallPartialScore:num(assessment.overallPartialScore),
  overallOfficialScore:num(assessment.overallOfficialScore)
},null,2));

await prisma.$disconnect();
