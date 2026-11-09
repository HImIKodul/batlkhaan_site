// Regression for the diagnosis resultHash reproducibility defect: the JSON write path truncates 17-digit doubles.
// Unit checks always run. The DB round trip runs only against an isolated DB named by MMRI_TEST_DB (never `mmri`) and always rolls back.
import { classifyResultHash, isJsonNumberNormalized, normalizeJsonNumbers, sha256Json } from "../src/lib/hash.js";

const fail: string[] = [];
const ok = (name: string, pass: boolean) => { console.log(`${pass ? "PASS" : "FAIL"} ${name}`); if (!pass) fail.push(name); };

const raw = { a: 0.1 + 0.2, b: 1 / 3, c: 123456.78901234567, d: 42, e: [0.15000000000000002, { f: 2 / 3 }], g: null, h: "x" };
const n = normalizeJsonNumbers(raw);
ok("integers and non-numbers untouched", n.d === 42 && n.g === null && n.h === "x");
ok("17-digit double rounded to 15 digits", n.a === 0.3);
ok("normalization idempotent", sha256Json(normalizeJsonNumbers(n)) === sha256Json(n));
ok("normalized value detected as normalized", isJsonNumberNormalized(n) && !isJsonNumberNormalized(raw));
ok("input not mutated", raw.a === 0.1 + 0.2);

// Version-aware classification (never rewrites anything)
const fresh: Record<string, unknown> = normalizeJsonNumbers({ score: 0.1 + 0.2, parts: [1 / 3, 2 / 3], resultHash: "" });
const freshHash = sha256Json({ ...fresh, resultHash: "" });
ok("fresh normalized snapshot classifies REPRODUCIBLE", classifyResultHash({ ...fresh, resultHash: freshHash }, freshHash) === "REPRODUCIBLE");
const legacyStored: Record<string, unknown> = { score: 0.3333333333333333, resultHash: "" }; // 16-digit value as truncated by the old write path
const legacyHash = sha256Json({ score: 1 / 3 + 1e-17 + 0.3333333333333335 - 0.3333333333333333 + 0.00000000000000028, resultHash: "" });
ok("legacy float-truncated snapshot classifies LEGACY_FLOAT_TRUNCATED", classifyResultHash({ ...legacyStored, resultHash: legacyHash }, legacyHash) === "LEGACY_FLOAT_TRUNCATED");
ok("tampered normalized snapshot classifies MISMATCH_ON_NORMALIZED", classifyResultHash({ ...fresh, score: 0.31, resultHash: freshHash }, freshHash) === "MISMATCH_ON_NORMALIZED");

const dbName = process.env.MMRI_TEST_DB;
if (dbName) {
  if (dbName === "mmri") throw new Error("refusing to run against the operational database");
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL!.replace(/\/[^/?]+\?/, `/${dbName}?`) } } });
  const row = await prisma.diagnosisSnapshot.findFirst();
  if (row) {
    const sample = normalizeJsonNumbers({ v: Array.from({ length: 5000 }, (_, i) => Math.sin(i + 1) * 1e3 / 3) });
    let back: unknown;
    try {
      await prisma.$transaction(async (tx: any) => {
        await tx.diagnosisSnapshot.update({ where: { id: row.id }, data: { result: sample } });
        back = (await tx.diagnosisSnapshot.findUnique({ where: { id: row.id } })).result;
        throw new Error("ROLLBACK");
      });
    } catch (e: any) { if (e.message !== "ROLLBACK") throw e; }
    ok("normalized JSON survives PostgreSQL round trip with identical hash", sha256Json(back) === sha256Json(sample));
  } else console.log("SKIP db round trip: no snapshot rows in", dbName);
  await prisma.$disconnect();
} else console.log("NOT TESTED db round trip (set MMRI_TEST_DB to an isolated clone)");
process.exit(fail.length ? 1 : 0);
