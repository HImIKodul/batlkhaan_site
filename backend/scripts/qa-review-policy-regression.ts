/* H01 policy core: the review record is created atomically with terminal completion, fails closed, and never hides historical reports.
   DB-level test on the isolated test database only (refuses otherwise). Creates and removes only its own review row.
   Usage: . scratch/testenv; npx tsx scripts/qa-review-policy-regression.ts */
import { prisma } from "../src/db.js";
import { derivedContentWithheld, enqueueReviewInTx, reportReviewRequired } from "../src/services/report-review-policy.js";

if (!/mmri_codexfix/.test(process.env.DATABASE_URL ?? "")) { console.error("Refusing to run: DATABASE_URL is not the isolated test database"); process.exit(2); }
let fail = 0; const rec = (n: string, ok: boolean, d = "") => { if (!ok) fail++; console.log((ok ? "PASS " : "FAIL ") + n + (d ? " | " + d : "")); };
const rows: any[] = await prisma.$queryRaw`select a.id, a."completedAt" from assessments a left join report_reviews r on r."assessmentId" = a.id
  where r.id is null and a."completedAt" is not null and a."completedAt" < (select min("submittedAt") from report_reviews) order by a."completedAt" asc limit 1`;
if (!rows.length) throw new Error("test database has no historical completed assessment without a review");
const hist = { id: rows[0].id as string, completedAt: rows[0].completedAt as Date };
const reviewRows = (id: string) => prisma.reportReview.count({ where: { assessmentId: id } });
let created: string | null = null;
try {
  rec("H01-P0 the rollout flag is read from the same environment variable the API config uses", reportReviewRequired() === (process.env.MMRI_REPORT_REVIEW_REQUIRED === "true"));
  // historical report stays readable
  const h0 = await derivedContentWithheld(prisma, hist);
  rec("H01-P1 a historical completed assessment without a review (finished before the workflow began) is NOT withheld", h0.withheld === false && h0.missingReview === false);
  // atomic with the surrounding transaction
  let threw = false;
  try { await prisma.$transaction(async tx => { await enqueueReviewInTx(tx, hist.id); throw new Error("simulated failure after the review insert"); }); } catch { threw = true; }
  rec("H01-P2 if the completion transaction fails after the review insert, the review is rolled back too (no orphan, no half state)", threw && (await reviewRows(hist.id)) === 0);
  // commit path + idempotency
  const r1: any = await prisma.$transaction(tx => enqueueReviewInTx(tx, hist.id));
  const r2: any = await prisma.$transaction(tx => enqueueReviewInTx(tx, hist.id));
  created = r1?.id ?? null;
  const notifs = await prisma.adminNotification.count({ where: { dedupeKey: `NEW_ASSESSMENT:${created}` } });
  rec("H01-P3 enqueue is idempotent: one SUBMITTED review with a 48 hour deadline and one notification, however many times it runs", !!r1 && r2?.id === r1.id && (await reviewRows(hist.id)) === 1 && r1.status === "SUBMITTED" && notifs === 1 && Math.round((r1.deadlineAt.getTime() - r1.submittedAt.getTime()) / 3_600_000) === 48);
  const w = await derivedContentWithheld(prisma, hist);
  rec("H01-P4 with an unpublished review the derived content is withheld", w.withheld === true && w.missingReview === false);
  await prisma.reportReview.update({ where: { id: created! }, data: { status: "PUBLISHED" } });
  const w2 = await derivedContentWithheld(prisma, hist);
  rec("H01-P5 once the review is PUBLISHED the content is available again", w2.withheld === false);
  // flag off => no record, no blocking
  const prev = process.env.MMRI_REPORT_REVIEW_REQUIRED; process.env.MMRI_REPORT_REVIEW_REQUIRED = "false";
  const other: any[] = await prisma.$queryRaw`select a.id from assessments a left join report_reviews r on r."assessmentId" = a.id where r.id is null and a."completedAt" is not null and a.id <> ${hist.id} limit 1`;
  const off = await prisma.$transaction(tx => enqueueReviewInTx(tx, other[0].id));
  rec("H01-P6 with the rollout flag off nothing is enqueued (existing behaviour is preserved)", off === null && (await reviewRows(other[0].id)) === 0);
  process.env.MMRI_REPORT_REVIEW_REQUIRED = prev;
  // fail closed: finished after the workflow began but has no review
  await prisma.reportReview.delete({ where: { id: created! } }); await prisma.adminNotification.deleteMany({ where: { dedupeKey: `NEW_ASSESSMENT:${created}` } }); created = null;
  process.env.MMRI_REPORT_REVIEW_ENFORCED_SINCE = new Date(hist.completedAt.getTime() - 86_400_000).toISOString();
  const closed = await derivedContentWithheld(prisma, hist);
  rec("H01-P7 an assessment finished after the workflow began but with NO review is withheld and flagged for backfill (fail closed)", closed.withheld === true && closed.missingReview === true);
  process.env.MMRI_REPORT_REVIEW_ENFORCED_SINCE = "";
  const open = await derivedContentWithheld(prisma, { id: hist.id, completedAt: null });
  rec("H01-P8 an assessment that has not finished (no completion time) is never treated as a bypass", open.withheld === false);
} finally {
  if (created) { await prisma.reportReview.deleteMany({ where: { id: created } }); await prisma.adminNotification.deleteMany({ where: { dedupeKey: `NEW_ASSESSMENT:${created}` } }); }
  await prisma.$disconnect();
}
console.log(fail ? `FAILED ${fail}` : "ALL PASS"); process.exit(fail ? 1 : 0);
