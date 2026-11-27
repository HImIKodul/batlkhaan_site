/**
 * LOCAL DEVELOPMENT ONLY. Removes SYNTHETIC test data from the local development database, nothing else. It refuses a non-local database and never touches another database.
 *
 *   MMRI_QA_SEED_LOCAL_DB=127.0.0.1:55432/mmri_dev_clean npx tsx src/qa-cleanup.ts <command> [options]
 *
 *   fixtures --run-tag=<tag>   remove ONE disposable review-fixture run (assessments, reviews, entitlements created by src/qa-review-fixtures.ts) and its stored report files
 *   entitlements --tag=<t>     remove access rows a test created (their grant reason carries the tag)
 *   test-accounts              hard-delete throw-away accounts created by the e2e scripts (e-mail like qa-*@example.test) and empty anonymised tombstones; never a demonstration account
 *   reset-demo --keep=a,b,c    keep ONLY the three named demonstration accounts and the company owned by the demo user; delete every other account, company, assessment, review, invoice and
 *                              notification (the demo company's own diagnoses are deleted too, so it can be re-seeded). Audit trails (append-only) are kept.
 *
 * Append-only review revisions are removed with the same transaction-local switch (`mmri.erasure`) that customer erasure uses. Report files on disk are removed with the same path-safety rule.
 */
import "dotenv/config";
import path from "node:path";
import { rmdir, unlink } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { prisma } from "./db.js";
import { assertLocalDevDatabase } from "./seed-qa-account.js";

const arg = (name: string) => process.argv.find(a => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
const storageRoot = () => path.resolve(process.env.MMRI_REPORT_STORAGE_DIR || process.env.REPORT_STORAGE_DIR || path.join(process.cwd(), "report-storage"));
async function removeStoredFile(key: string): Promise<boolean> {
  if (path.isAbsolute(key) || key.includes("\\")) return false;
  const root = storageRoot(); const abs = path.resolve(root, key);
  if (abs === root || !abs.startsWith(root + path.sep)) return false;
  try { await unlink(abs); await rmdir(path.dirname(abs)).catch(() => undefined); return true; } catch { return false; }   // rmdir only succeeds on an EMPTY folder
}

/** Deletes the given assessments with their reviews (append-only revisions included) inside `tx`; returns the stored-file keys to unlink after the commit. */
async function purgeAssessments(tx: any, assessmentIds: string[]): Promise<string[]> {
  if (!assessmentIds.length) return [];
  const artifacts = await tx.reportArtifact.findMany({ where: { reportSnapshot: { assessmentId: { in: assessmentIds } } }, select: { storageKey: true } });
  const reviews = await tx.reportReview.findMany({ where: { assessmentId: { in: assessmentIds } }, select: { id: true } });
  if (reviews.length) {
    const ids = reviews.map((r: any) => r.id);
    await tx.$queryRaw`SELECT set_config('mmri.erasure', 'on', true)`;
    await tx.adminNotification.deleteMany({ where: { targetType: "REVIEW", targetId: { in: ids } } });
    await tx.reportReviewSuggestion.deleteMany({ where: { reviewId: { in: ids } } });
    await tx.reportReviewRevision.deleteMany({ where: { reviewId: { in: ids } } });
    await tx.reportReview.deleteMany({ where: { id: { in: ids } } });
  }
  await tx.assessment.deleteMany({ where: { id: { in: assessmentIds } } });   // answers, results, snapshots, reports and plans cascade
  return artifacts.map((a: any) => a.storageKey);
}
/** Removes a company's money-side rows in the order the foreign keys require (entitlements, payment transactions, invoices). Synthetic data only: the local mock provider moved no money. */
async function purgeBilling(tx: any, companyId: string) {
  const invoices = await tx.billingInvoice.findMany({ where: { companyId }, select: { id: true } });
  await tx.companyEntitlement.deleteMany({ where: { companyId } });
  if (invoices.length) await tx.billingPaymentTransaction.deleteMany({ where: { invoiceId: { in: invoices.map((i: any) => i.id) } } });
  await tx.billingInvoice.deleteMany({ where: { companyId } });
}
const unlinkAll = async (keys: string[]) => { let n = 0; for (const k of keys) if (await removeStoredFile(k)) n++; return n; };
const OPTS = { maxWait: 10_000, timeout: 600_000 };

/** Removes ONE disposable fixture run: its own company (named "QA fixture <tag>"), with every assessment, review, entitlement and stored report file in it. Nothing else is touched. */
export async function purgeFixtureRun(tag: string) {
  if (!/^fx[a-z0-9]+$/.test(tag)) throw new Error("run tag must look like fx...");
  const companies = await prisma.company.findMany({ where: { name: `QA fixture ${tag}` }, select: { id: true } });
  let assessments = 0, files = 0;
  for (const c of companies) {
    const keys = await prisma.$transaction(async tx => {
      const ids = (await tx.assessment.findMany({ where: { companyId: c.id }, select: { id: true } })).map(a => a.id); assessments += ids.length;
      const k = await purgeAssessments(tx, ids); await purgeBilling(tx, c.id); await tx.company.delete({ where: { id: c.id } }); return k;
    }, OPTS);
    files += await unlinkAll(keys);
  }
  return { companies: companies.length, assessments, files };
}
async function fixtures() {
  const tag = arg("run-tag"); if (!tag) throw new Error("--run-tag=fx... is required");
  console.log(`fixtures ${tag}: ` + JSON.stringify(await purgeFixtureRun(tag)));
}

async function entitlements() {
  const tag = arg("tag"); if (!tag || tag.length < 6) throw new Error("--tag=<test tag> (6+ characters) is required");
  const r = await prisma.companyEntitlement.deleteMany({ where: { grantReason: { contains: tag }, assessments: { none: {} } } });
  console.log(`entitlements removed for ${tag}: ${r.count}`);
}

async function testAccounts() {
  const KEEP = (arg("keep") ?? "dev.admin@mmri.test,dev.reviewer@mmri.test,dev.customer@mmri.test").split(",").map(x => x.trim().toLowerCase());
  const users = await prisma.user.findMany({ where: { OR: [{ email: { startsWith: "qa-", endsWith: "@example.test" } }, { email: { startsWith: "erased+" } }] }, select: { id: true, email: true } });
  let removed = 0, kept = 0;
  for (const u of users.filter(x => !KEEP.includes(x.email))) {
    try {
      await prisma.$transaction(async tx => {
        const companies = await tx.companyMembership.findMany({ where: { userId: u.id }, select: { companyId: true } });
        for (const c of companies) { const keys = await purgeAssessments(tx, (await tx.assessment.findMany({ where: { companyId: c.companyId }, select: { id: true } })).map(a => a.id)); await unlinkAll(keys); await purgeBilling(tx, c.companyId); await tx.company.delete({ where: { id: c.companyId } }); }
        await tx.adminAccount.deleteMany({ where: { userId: u.id } });
        await tx.user.delete({ where: { id: u.id } });
      }, OPTS); removed++;
    } catch { kept++; }   // still referenced (e.g. a retained payment): stays as an anonymised tombstone
  }
  console.log(`test accounts removed: ${removed}, kept (still referenced): ${kept}`);
}

async function resetDemo() {
  const KEEP = (arg("keep") ?? "").split(",").map(x => x.trim().toLowerCase()).filter(Boolean);
  if (KEEP.length !== 3) throw new Error("--keep=<sadmin>,<admin>,<user> (exactly three e-mails) is required");
  const keepUsers = await prisma.user.findMany({ where: { email: { in: KEEP } }, select: { id: true, email: true, adminAccount: { select: { id: true, role: true } } } });
  if (keepUsers.length !== 3) throw new Error(`Expected 3 existing accounts, found ${keepUsers.length}`);
  const demoUser = keepUsers.find(u => !u.adminAccount); if (!demoUser) throw new Error("No customer (User) among the kept accounts");
  const demoCompany = await prisma.companyMembership.findFirst({ where: { userId: demoUser.id, role: "OWNER" }, select: { companyId: true } });
  if (!demoCompany) throw new Error("The demo user owns no company");
  const keysAll: string[] = [];
  const before = { users: await prisma.user.count(), companies: await prisma.company.count(), assessments: await prisma.assessment.count() };
  await prisma.$transaction(async tx => {
    // 1. every company except the demo company disappears completely (assessments, reviews, invoices, entitlements, memberships)
    const others = await tx.company.findMany({ where: { id: { not: demoCompany.companyId } }, select: { id: true } });
    for (const c of others) {
      keysAll.push(...await purgeAssessments(tx, (await tx.assessment.findMany({ where: { companyId: c.id }, select: { id: true } })).map(a => a.id)));
      await purgeBilling(tx, c.id);
      await tx.company.delete({ where: { id: c.id } });
    }
    // 2. the demo company keeps its profile but loses its diagnoses, invoices and entitlements so that it can be re-seeded
    keysAll.push(...await purgeAssessments(tx, (await tx.assessment.findMany({ where: { companyId: demoCompany.companyId }, select: { id: true } })).map(a => a.id)));
    await purgeBilling(tx, demoCompany.companyId);
    // 3. session-like and notification noise of the tests
    await tx.adminNotification.deleteMany({}); await tx.customerNotification.deleteMany({});
    await tx.adminEmailChallenge.deleteMany({}); await tx.adminSession.deleteMany({}); await tx.refreshSession.deleteMany({}); await tx.trustedDevice.deleteMany({}); await tx.passwordResetToken.deleteMany({});
    await tx.adminAccount.updateMany({ where: { userId: { in: keepUsers.map(u => u.id) } }, data: { failedLogins: 0, lockedUntil: null } });
  }, OPTS);
  console.log(`report files removed: ${await unlinkAll(keysAll)}`);
  // 4. every other account (one transaction each: a retained reference keeps that one account as an anonymised tombstone)
  const others = await prisma.user.findMany({ where: { id: { notIn: keepUsers.map(u => u.id) } }, select: { id: true, email: true } });
  let removed = 0; const kept: string[] = [];
  for (const u of others) {
    try { await prisma.$transaction(async tx => { await tx.adminAccount.deleteMany({ where: { userId: u.id } }); await tx.user.delete({ where: { id: u.id } }); }); removed++; }
    catch (e) { kept.push(u.email); }
  }
  const after = { users: await prisma.user.count(), companies: await prisma.company.count(), assessments: await prisma.assessment.count() };
  console.log(JSON.stringify({ before, after, accountsRemoved: removed, accountsKept: keepUsers.map(u => u.email), tombstonesKept: kept.length }));
}

async function main() {
  assertLocalDevDatabase();
  const cmd = process.argv[2];
  if (cmd === "fixtures") await fixtures();
  else if (cmd === "entitlements") await entitlements();
  else if (cmd === "test-accounts") await testAccounts();
  else if (cmd === "reset-demo") await resetDemo();
  else throw new Error("Commands: fixtures --run-tag=fx..., entitlements --tag=..., test-accounts, reset-demo --keep=a,b,c");
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(e => { console.error("cleanup failed:", e instanceof Error ? e.message : e); process.exitCode = 1; }).finally(async () => { await prisma.$disconnect(); });
