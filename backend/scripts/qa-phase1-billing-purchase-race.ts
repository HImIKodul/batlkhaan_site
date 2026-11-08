/* MMRI-11: invoice creation vs payment activation. Eligibility must be re-decided under the SAME company/domain lock activation uses.
   FAKE provider, no network. Refuses to run unless DATABASE_URL is the isolated test database. Creates its own throw-away company and removes it.
   Usage: . scratch/testenv; npx tsx scripts/qa-phase1-billing-purchase-race.ts */
import { randomUUID } from "node:crypto";
import { prisma } from "../src/db.js";
import { BillingService } from "../src/billing/billing-service.js";

if (!/mmri_codexfix/.test(process.env.DATABASE_URL ?? "")) { console.error("Refusing to run: DATABASE_URL is not the isolated test database"); process.exit(2); }
let fail = 0; const rec = (n: string, ok: boolean, d = "") => { if (!ok) fail++; console.log((ok ? "PASS " : "FAIL ") + n + (d ? " | " + d : "")); };
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const code = (e: any) => e?.code ?? e?.message;

const user = await prisma.user.findFirst({ where: { status: "ACTIVE" }, select: { id: true } });
if (!user) throw new Error("test database has no user");
const company = await prisma.company.create({ data: { name: "PHASE1-RACE-" + randomUUID().slice(0, 8) } });
const DOMAIN = "marketing";

class FakeQPay {
  readonly name = "QPAY" as const;
  paid = false; pid = randomUUID().replace(/-/g, ""); created = 0;
  async createInvoice(): Promise<any> { this.created++; return { providerInvoiceId: `fake_${randomUUID()}`, qrText: "qr", qrImage: null, shortUrl: null, deeplinks: [], raw: {} }; }
  async checkInvoicePayment(_id: string, expected: number): Promise<any> { return this.paid ? { paid: true, paidAmountMnt: expected, paymentId: `fakepay_${this.pid}`, raw: {} } : { paid: false, paidAmountMnt: 0, paymentId: null, raw: {} }; }
  async cancelInvoice(): Promise<void> {}
}
const config: any = { billingProvider: "mock", environment: "development", billingEnforcement: true, diagnosticPriceMnt: 300000, retakePriceMnt: 300000, billingCallbackBaseUrl: "http://localhost:4020" };
const svc = (f: any) => { const s = new BillingService(config); (s as any).provider = f; return s; };
const counts = async () => ({
  invoices: await prisma.billingInvoice.count({ where: { companyId: company.id, domainCode: DOMAIN, planCode: "DIAGNOSTIC" } }),
  open: await prisma.billingInvoice.count({ where: { companyId: company.id, domainCode: DOMAIN, planCode: "DIAGNOSTIC", status: { in: ["CREATED", "PENDING"] } } }),
  paid: await prisma.billingInvoice.count({ where: { companyId: company.id, domainCode: DOMAIN, planCode: "DIAGNOSTIC", status: "PAID" } }),
  ents: await prisma.companyEntitlement.count({ where: { companyId: company.id, domainCode: DOMAIN } }),
});
const reset = async () => { await prisma.companyEntitlement.deleteMany({ where: { companyId: company.id } }); await prisma.billingInvoice.deleteMany({ where: { companyId: company.id } }); };
const lockKey = `mmri-purchase:${company.id}:${DOMAIN}`;
/** hold the purchase lock in a transaction, run `during` inside it (what a concurrent payment activation commits), then release */
async function holdLock(during: () => Promise<void>, ms = 400) {
  let release!: () => void; const gate = new Promise<void>(r => (release = r));
  const held = prisma.$transaction(async (tx: any) => { await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`; await during.call(null); await gate; }, { timeout: 30000, maxWait: 10000 });
  await sleep(ms);
  return { release, done: held };
}

try {
  // R1: the exact interleaving of the finding. The create request passed its pre-lock checks; an existing invoice is paid (entitlement created) before it takes the lock.
  { const f = new FakeQPay(); const s = svc(f);
    const first: any = await s.createInvoice(company.id, user.id, "DIAGNOSTIC", DOMAIN);
    const h = await holdLock(async () => {});                         // the lock is taken first, so the create below passes its pre-checks and then waits
    const pending = s.createInvoice(company.id, user.id, "DIAGNOSTIC", DOMAIN).then((x: any) => "created:" + x.id, (e: any) => code(e));
    await sleep(500);                                                 // create is now blocked on the lock, past its stale pre-check
    await prisma.billingInvoice.update({ where: { id: first.id }, data: { status: "PAID", paidAt: new Date(), providerPaymentId: "p_" + randomUUID() } });
    await prisma.companyEntitlement.create({ data: { companyId: company.id, domainCode: DOMAIN, sourceInvoiceId: first.id, planCode: "DIAGNOSTIC", status: "ACTIVE", startsAt: new Date(), assessmentLimit: 1, assessmentsUsed: 0 } });
    h.release(); await h.done; const out = await pending; const c = await counts();
    rec("R1 an invoice paid after the create's pre-check does not let a second initial-purchase invoice be created", out === "ENTITLEMENT_ALREADY_ACTIVE" && c.invoices === 1 && c.open === 0 && c.ents === 1, `${out} ${JSON.stringify(c)}`); }
  await reset();

  // R2: payment activation waits for the shared lock (it is serialised with creation, not run beside it)
  { const f = new FakeQPay(); const s = svc(f);
    const inv: any = await s.createInvoice(company.id, user.id, "DIAGNOSTIC", DOMAIN); f.paid = true;
    const h = await holdLock(async () => {}); let finished = false;
    const act = s.reconcileInvoice(inv.id).then((x: any) => { finished = true; return x.status; }, (e: any) => { finished = true; return code(e); });
    await sleep(700); const whileHeld = finished; h.release(); await h.done; const out = await act; const c = await counts();
    rec("R2 payment activation is serialised with invoice creation on the same company/domain lock", whileHeld === false && out === "PAID" && c.paid === 1 && c.ents === 1, `finishedWhileHeld=${whileHeld} ${out} ${JSON.stringify(c)}`); }
  await reset();

  // R3: randomised race, create vs activate, many rounds: never two initial-purchase invoices once one is paid, never two entitlements
  { let bad = 0, rounds = 12;
    for (let i = 0; i < rounds; i++) {
      const f = new FakeQPay(); const s = svc(f);
      const inv: any = await s.createInvoice(company.id, user.id, "DIAGNOSTIC", DOMAIN); f.paid = true;
      await Promise.all([
        s.reconcileInvoice(inv.id).catch(() => {}),
        ...Array.from({ length: 3 }, (_, k) => sleep(k * 15).then(() => s.createInvoice(company.id, user.id, "DIAGNOSTIC", DOMAIN)).catch(() => {})),
      ]);
      const c = await counts();
      if (c.paid > 1 || c.ents > 1 || (c.paid === 1 && c.open > 0) || c.invoices > 1) bad++;
      await reset();
    }
    rec(`R3 ${rounds} randomised create-vs-activate races leave one invoice, at most one entitlement, no open invoice next to a paid one`, bad === 0, `violations=${bad}`); }

  // R4: ordinary behaviour is unchanged
  { const f = new FakeQPay(); const s = svc(f);
    const a: any = await s.createInvoice(company.id, user.id, "DIAGNOSTIC", DOMAIN); const b: any = await s.createInvoice(company.id, user.id, "DIAGNOSTIC", DOMAIN);
    rec("R4 repeated create while unpaid returns the same open invoice (idempotent)", a.id === b.id && (await counts()).invoices === 1);
    const r = await s.createInvoice(company.id, user.id, "RETAKE", DOMAIN).then(() => "created", (e: any) => code(e));
    rec("R5 a retake cannot be purchased before a first diagnosis is completed", r === "RETAKE_NOT_AVAILABLE", r); }
} finally {
  await reset(); await prisma.company.delete({ where: { id: company.id } }).catch(() => {}); await prisma.$disconnect();
}
console.log(fail ? `FAILED ${fail}` : "ALL PASS"); process.exit(fail ? 1 : 0);
