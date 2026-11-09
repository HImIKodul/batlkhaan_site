import { prisma } from "./db.js";

const assessmentId = process.argv[2];
if (!assessmentId) throw new Error("Usage: tsx src/verify-live-cell-state.ts <assessmentId>");

const assessment = await prisma.assessment.findUnique({
  where: { id: assessmentId },
  include: { methodologyVersion: true }
});
if (!assessment) throw new Error(`Assessment ${assessmentId} not found`);

const rows = await prisma.assessmentCellState.findMany({ where: { assessmentId } });
if (rows.length !== 3072) throw new Error(`Expected 3,072 persisted cell states, found ${rows.length}`);

const failures: string[] = [];
for (const row of rows as any[]) {
  const confidence = Number(row.confidence ?? 0);
  const score = row.normalizedScore === null ? null : Number(row.normalizedScore);
  if (row.confidenceState === "ESTIMATED" && confidence > 0.550001) failures.push(`${row.cellId}: ESTIMATED confidence ${confidence} > .55`);
  if (row.confidenceState === "VALIDATED" && confidence < 0.749999) failures.push(`${row.cellId}: VALIDATED confidence ${confidence} < .75`);
  if (row.confidenceState === "LOCKED" && confidence < 0.899999) failures.push(`${row.cellId}: LOCKED confidence ${confidence} < .90`);
  if (row.confidenceState === "LOCKED" && !row.lockedAt) failures.push(`${row.cellId}: LOCKED without lockedAt`);
  if (row.confidenceState !== "LOCKED" && row.lockedAt) failures.push(`${row.cellId}: non-LOCKED retains lockedAt`);
  if (row.confidenceState === "NOT_APPLICABLE" && score !== null) failures.push(`${row.cellId}: NOT_APPLICABLE has numeric score`);
  if (row.cellId.endsWith(":C01") && score !== null) failures.push(`${row.cellId}: D01 routing cell has maturity score`);
  if (["1.1.0","2.0.0","3.0.0"].includes(assessment.methodologyVersion.version) && row.calculationVersion !== "ADAPTIVE_V13") failures.push(`${row.cellId}: ${assessment.methodologyVersion.version} row calculationVersion=${row.calculationVersion}`);
}

const counts = rows.reduce((acc: Record<string, number>, row: any) => {
  acc[row.confidenceState] = (acc[row.confidenceState] ?? 0) + 1;
  return acc;
}, {});

if (failures.length) {
  console.error(JSON.stringify({ status: "FAIL", assessmentId, failures: failures.slice(0, 100), failureCount: failures.length }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({ status: "PASS", assessmentId, methodologyVersion: assessment.methodologyVersion.version, cells: rows.length, confidenceStates: counts }, null, 2));
await prisma.$disconnect();
