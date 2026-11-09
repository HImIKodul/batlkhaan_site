/* H07 + M01: invoice cancellation vs asynchronously confirmed payment, and customer payment reconciliation.
   Uses a scripted FAKE QPay provider: no network, no real payment provider. Refuses to run unless DATABASE_URL points at the isolated test database.
   Creates and removes only its own synthetic invoices. Usage: . scratch/testenv; npx tsx scripts/qa-billing-race-regression.ts */
import { randomUUID } from "node:crypto";
import { prisma } from "../src/db.js";
import { BillingService } from "../src/billing/billing-service.js";

if (!/mmri_codexfix/.test(process.env.DATABASE_URL ?? "")) { console.error("Refusing to run: DATABASE_URL is not the isolated test database"); process.exit(2); }
let fail = 0; const rec = (n: string, ok: boolean, d = "") => { if (!ok) fail++; console.log((ok ? "PASS " : "FAIL ") + n + (d ? " | " + d : "")); };
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

const company = await prisma.company.findFirst({ where: { erasedAt: null }, select: { id: true, memberships: { take: 1, select: { userId: true } } } });
if (!company?.memberships[0]) throw new Error("test database has no company with a member");
const userId = company.memberships[0].userId;
const created: string[] = [];

class FakeQPay {
  readonly name = "QPAY" as const;
  paid = false; paidAmount = 300000; failCheck = false; checkCalls = 0; cancelCalls = 0; cancelDelayMs = 0; payOnCancel = false;
  async createInvoice(): Promise<any> { throw new Error("not used"); }
  async checkInvoicePayment(_id: string, expected: number): Promise<any> {
    this.checkCalls++; if (this.failCheck) throw new Error("provider down");
    return this.paid ? { paid: true, paidAmountMnt: this.paidAmount === 300000 ? expected : this.paidAmount, paymentId: `fakepay_${this.pid}`, raw: { fake: true } } : { paid: false, paidAmountMnt: 0, paymentId: null, raw: { fake: true } };
  }
  pid = randomUUID().replace(/-/g, "");
  async cancelInvoice(): Promise<void> { this.cancelCalls++; if (this.payOnCancel) this.paid = true; if (this.cancelDelayMs) await sleep(this.cancelDelayMs); }
}
const config: any = { billingProvider: "mock", environment: "development" };
function svcWith(fake: any) { const s = new BillingService(config); (s as any).provider = fake; return s; }
async function makeInvoice(provider: "QPAY" | "MOCK", status = "PENDING", domainCode = "marketing") {
  const inv = await prisma.billingInvoice.create({ data: { domainCode, companyId: company!.id, createdByUserId: userId, planCode: "DIAGNOSTIC", amountMnt: 300000, provider, providerInvoiceId: provider === "QPAY" ? `fake_${randomUUID()}` : null, senderInvoiceNo: `RACE-${randomUUID()}`, callbackTokenHash: "0".repeat(64), status: status as any } });
  created.push(inv.id); return inv;
}
const ents = (id: string) => prisma.companyEntitlement.count({ where: { sourceInvoiceId: id } });
const code = (e: any) => e?.code ?? e?.message;

try {
  // B1 cancel while the provider already holds a payment
  { const f = new FakeQPay(); f.paid = true; const s = svcWith(f); const inv = await makeInvoice("QPAY");
    const r = await s.cancelInvoice(inv.id).then(() => "no-error", (e: any) => code(e)); const now = await prisma.billingInvoice.findUnique({ where: { id: inv.id } });
    rec("H07-1 cancelling an invoice the provider reports as paid is refused and the payment is activated", r === "PAID_INVOICE_CANNOT_BE_CANCELLED" && now?.status === "PAID" && (await ents(inv.id)) === 1 && f.cancelCalls === 0, `${r} ${now?.status} ents=${await ents(inv.id)} cancelCalls=${f.cancelCalls}`); }

  // B2 the payment lands while the cancellation is in flight (provider cancel is slow, reconcile confirms meanwhile)
  { const f = new FakeQPay(); f.cancelDelayMs = 400; f.payOnCancel = false; const s = svcWith(f); const inv = await makeInvoice("QPAY");
    const cancelP = s.cancelInvoice(inv.id).then(() => "cancelled", (e: any) => code(e));
    await sleep(120); f.paid = true;                         // customer pays at the bank while provider.cancelInvoice is still running
    const recP = s.reconcileInvoice(inv.id).then((x: any) => x.status, (e: any) => code(e));
    const [c, r] = await Promise.all([cancelP, recP]); const now = await prisma.billingInvoice.findUnique({ where: { id: inv.id } });
    rec("H07-2 payment confirmed during a cancellation wins: invoice PAID (never overwritten with CANCELLED), exactly one entitlement", now?.status === "PAID" && (await ents(inv.id)) === 1 && c === "PAID_INVOICE_CANNOT_BE_CANCELLED" && r === "PAID", `cancel=${c} reconcile=${r} final=${now?.status} ents=${await ents(inv.id)}`); }

  // B3 payment confirmed AFTER a local cancel is reconciled, not lost
  { const f = new FakeQPay(); const s = svcWith(f); const inv = await makeInvoice("QPAY");
    await s.cancelInvoice(inv.id); const mid = await prisma.billingInvoice.findUnique({ where: { id: inv.id } });
    f.paid = true; const out: any = await s.reconcileInvoice(inv.id); const now = await prisma.billingInvoice.findUnique({ where: { id: inv.id } });
    rec("H07-3 a provider-verified payment arriving after a cancel is reconciled to PAID with one entitlement and the provider payment id", mid?.status === "CANCELLED" && out.status === "PAID" && now?.status === "PAID" && !!now.providerPaymentId && (await ents(inv.id)) === 1); }

  // B4 duplicate confirmations (callbacks/reconciles in parallel)
  { const f = new FakeQPay(); f.paid = true; const s = svcWith(f); const inv = await makeInvoice("QPAY");
    const res = await Promise.all(Array.from({ length: 6 }, () => s.reconcileInvoice(inv.id).then((x: any) => x.status, (e: any) => code(e))));
    rec("H07-4 six parallel confirmations of one payment create exactly one entitlement and a single PAID transition", (await ents(inv.id)) === 1 && (await prisma.billingInvoice.findUnique({ where: { id: inv.id } }))?.status === "PAID" && res.every(x => x === "PAID" || x === "PAYMENT_STATE_CHANGED"), res.join(",")); }

  // B5 plain cancel of an unpaid invoice
  { const f = new FakeQPay(); const s = svcWith(f); const inv = await makeInvoice("QPAY");
    const a: any = await s.cancelInvoice(inv.id); const b: any = await s.cancelInvoice(inv.id);
    rec("H07-5 cancelling an unpaid invoice works once at the provider and is idempotent locally", a.status === "CANCELLED" && b.status === "CANCELLED" && f.cancelCalls === 1 && (await ents(inv.id)) === 0); }

  // B6 same payment id cannot activate a second invoice
  { const f = new FakeQPay(); f.paid = true; const s = svcWith(f); const i1 = await makeInvoice("QPAY", "PENDING", "finance"), i2 = await makeInvoice("QPAY", "PENDING", "it");
    await s.reconcileInvoice(i1.id); const r2 = await s.reconcileInvoice(i2.id).then(() => "no-error", (e: any) => code(e));
    rec("H07-6 one provider payment id cannot activate two invoices (ledger integrity)", r2 === "PAYMENT_ALREADY_USED" && (await prisma.billingInvoice.findUnique({ where: { id: i2.id } }))?.status === "PENDING" && (await ents(i2.id)) === 0, String(r2)); }

  // M01 reconciliation rules
  { const f = new FakeQPay(); const s = svcWith(f); const inv = await makeInvoice("QPAY");
    const out: any = await s.reconcileInvoice(inv.id); const st = (await prisma.billingInvoice.findUnique({ where: { id: inv.id } }))!;
    rec("M01-1 reconcile asks the provider and does NOT mark an unpaid invoice paid", out.status !== "PAID" && st.status === "PENDING" && f.checkCalls === 1 && st.lastVerifiedAt !== null && (await ents(inv.id)) === 0, `${out.status} calls=${f.checkCalls}`);
    f.paid = true; const out2: any = await s.reconcileInvoice(inv.id);
    rec("M01-2 once the provider confirms, reconcile marks it PAID and grants the entitlement", out2.status === "PAID" && (await ents(inv.id)) === 1); }
  { const f = new FakeQPay(); f.failCheck = true; const s = svcWith(f); const inv = await makeInvoice("QPAY");
    const r = await s.reconcileInvoice(inv.id).then(() => "no-error", (e: any) => code(e));
    rec("M01-3 a provider outage returns a clear 502 and leaves the invoice unchanged (never paid)", r === "PAYMENT_VERIFICATION_ERROR" && (await prisma.billingInvoice.findUnique({ where: { id: inv.id } }))?.status === "PENDING", String(r)); }
  { const f = new FakeQPay(); f.paid = true; f.paidAmount = 1000; const s = svcWith(f); const inv = await makeInvoice("QPAY");
    const r = await s.reconcileInvoice(inv.id).then(() => "no-error", (e: any) => code(e));
    rec("M01-4 an under-paid provider amount is rejected and the invoice stays unpaid", r === "PARTIAL_PAYMENT" && (await prisma.billingInvoice.findUnique({ where: { id: inv.id } }))?.status === "PENDING" && (await ents(inv.id)) === 0, String(r)); }
  { const s = svcWith(new FakeQPay()); const inv = await makeInvoice("MOCK", "CREATED");
    const r = await s.reconcileInvoice(inv.id).then(() => "no-error", (e: any) => code(e));
    rec("M01-5 a mock/manual invoice cannot be reconciled automatically (clear 409, still unpaid)", r === "AUTOMATIC_RECONCILIATION_UNAVAILABLE" && (await prisma.billingInvoice.findUnique({ where: { id: inv.id } }))?.status === "CREATED", String(r)); }
} finally {
  await prisma.companyEntitlement.deleteMany({ where: { sourceInvoiceId: { in: created } } });
  await prisma.billingInvoice.deleteMany({ where: { id: { in: created } } });
  await prisma.$disconnect();
}
console.log(fail ? `FAILED ${fail}` : "ALL PASS"); process.exit(fail ? 1 : 0);
