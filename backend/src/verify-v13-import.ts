import { prisma } from "./db.js";
import { methodologyId } from "./lib/ids.js";

const version = process.argv[2] ?? "1.1.0";
const id = methodologyId(version);

const methodology = await prisma.methodologyVersion.findUnique({ where: { id } });
if (!methodology) throw new Error(`Methodology ${version} is not imported.`);

const [
  questions,
  cells,
  questionPolicies,
  cellPolicies,
  rules,
  scorePatterns,
  neverDirect,
  inferOnlyCells,
  anchors,
  scoreEligible,
  nonScoring
] = await Promise.all([
  prisma.question.count({ where: { methodologyVersionId: id } }),
  prisma.diagnosticCell.count({ where: { methodologyVersionId: id } }),
  prisma.questionRuntimePolicy.count({ where: { methodologyVersionId: id } }),
  prisma.cellRuntimePolicy.count({ where: { methodologyVersionId: id } }),
  prisma.runtimeRuleDefinition.count({ where: { methodologyVersionId: id } }),
  prisma.runtimeScorePattern.count({ where: { methodologyVersionId: id } }),
  prisma.questionRuntimePolicy.count({ where: { methodologyVersionId: id, directAskAllowed: false, routingState: "INFER_ONLY" } }),
  prisma.cellRuntimePolicy.count({ where: { methodologyVersionId: id, applicabilityMode: "INFER_ONLY" } }),
  prisma.questionRuntimePolicy.count({ where: { methodologyVersionId: id, isAnchor: true } }),
  prisma.questionRuntimePolicy.count({ where: { methodologyVersionId: id, scoreEligible: true } }),
  prisma.questionRuntimePolicy.count({ where: { methodologyVersionId: id, scoreEligible: false } })
]);

const expected: Record<string, [number, number]> = {
  questions: [questions, 12288],
  cells: [cells, 3072],
  questionPolicies: [questionPolicies, 12288],
  cellPolicies: [cellPolicies, 3072],
  rules: [rules, 46],
  scorePatterns: [scorePatterns, 4],
  neverDirect: [neverDirect, 76],
  inferOnlyCells: [inferOnlyCells, 19],
  anchors: [anchors, 256],
  scoreEligible: [scoreEligible, 11956],
  nonScoring: [nonScoring, 332]
};

const failures = Object.entries(expected).filter(([, [actual, want]]) => actual !== want);
if (failures.length) {
  throw new Error(`v13 import verification failed: ${failures.map(([name,[actual,want]]) => `${name}=${actual}, expected ${want}`).join("; ")}`);
}

const [first, last, patterns] = await Promise.all([
  prisma.question.findFirst({ where: { methodologyVersionId: id }, orderBy: { sourceRow: "asc" }, select: { externalId: true } }),
  prisma.question.findFirst({ where: { methodologyVersionId: id }, orderBy: { sourceRow: "desc" }, select: { externalId: true } }),
  prisma.runtimeScorePattern.findMany({ where: { methodologyVersionId: id }, orderBy: { code: "asc" }, select: { code: true } })
]);
if (first?.externalId !== "MMRI-C01-D01-Q1") throw new Error(`Unexpected first stable question ID: ${first?.externalId}`);
if (last?.externalId !== "MMRI-C64-D48-Q4") throw new Error(`Unexpected last stable question ID: ${last?.externalId}`);
if (patterns.map(p => p.code).join(",") !== "NS,S3,S4,S5") throw new Error(`Unexpected score patterns: ${patterns.map(p => p.code).join(",")}`);

console.log(JSON.stringify({
  status: "PASS",
  methodology: { id: methodology.id, version: methodology.version, status: methodology.status, bundleSha256: methodology.bundleSha256 },
  counts: Object.fromEntries(Object.entries(expected).map(([k,[actual]]) => [k,actual])),
  firstQuestionId: first.externalId,
  lastQuestionId: last.externalId,
  scorePatterns: patterns.map(p => p.code)
}, null, 2));

await prisma.$disconnect();
