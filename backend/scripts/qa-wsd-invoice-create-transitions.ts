/* WS-D MMRI-22: provider invoice creation transitions must be compare-and-set. FAKE provider with injected delay/failure; no network.
   S1 cancel while provider creation is outstanding must stay CANCELLED (and the remote invoice must not be stranded);
   S2 remote creation succeeds but local persistence fails: remote id must not be lost / remote must be cancelled;
   S3 a stranded remote invoice later paid is still honoured by reconcile; S4 normal creation unchanged; S5 provider failure -> FAILED.
   Usage: DATABASE_URL=<mmri_ws_d url> npx tsx scripts/qa-wsd-invoice-create-transitions.ts */
import { rec, prisma, randomUUID, fail } from "./qa-wsd-lib.js";
import { BillingService } from "../src/billing/billing-service.js";
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const user = await prisma.user.findFirstOrThrow({ where: { status: "ACTIVE" }, select: { id: true } });
const company = await prisma.company.create({ data: { name: "WSD-TRANS-" + randomUUID().slice(0, 8) } });
class FakeQPay {
  readonly name = "QPAY" as const; delayMs = 0; failCreate = false; paid = false; pid = randomUUID().replace(/-/g, ""); cancelled: string[] = []; made: string[] = [];
  async createInvoice(): Promise<any> { if (this.delayMs) await sleep(this.delayMs); if (this.failCreate) throw new Error("provider create down"); const id = `fake_${randomUUID()}`; this.made.push(id); return { providerInvoiceId: id, qrText: "qr", qrImage: null, shortUrl: null, deeplinks: [], raw: {} }; }
  async checkInvoicePayment(_id: string, expected: number): Promise<any> { return this.paid ? { paid: true, paidAmountMnt: expected, paymentId: `fakepay_${this.pid}`, raw: {} } : { paid: false, paidAmountMnt: 0, paymentId: null, raw: {} }; }
  async cancelInvoice(id: string): Promise<void> { this.cancelled.push(id); }
}
const config: any = { billingProvider: "mock", environment: "development", billingEnforcement: true, diagnosticPriceMnt: 300000, retakePriceMnt: 300000, billingCallbackBaseUrl: "http://localhost:4020" };
const svc = (f: any) => { const s = new BillingService(config); (s as any).provider = f; return s; };
const reset = async () => { await prisma.companyEntitlement.deleteMany({ where: { companyId: company.id } }); await prisma.billingInvoice.deleteMany({ where: { companyId: company.id } }); };
const latest = () => prisma.billingInvoice.findFirstOrThrow({ where: { companyId: company.id }, orderBy: { createdAt: "desc" } });
try {
  { // S1
    const f = new FakeQPay(); f.delayMs = 500; const s = svc(f);
    const creating = s.createInvoice(company.id, user.id, "DIAGNOSTIC", "marketing").then((x: any) => "ok:" + x.status, (e: any) => e?.code ?? e?.message);
    await sleep(150); const open = await latest();
    const cancelled: any = await s.cancelInvoice(open.id).catch((e: any) => ({ err: e.code }));
    const out = await creating; await sleep(100); const row = await latest();
    rec("S1a cancel while provider creation is outstanding stays CANCELLED (not reversed to PENDING)", cancelled.status === "CANCELLED" && row.status === "CANCELLED", `cancel=${cancelled.status ?? cancelled.err} createOutcome=${out} final=${row.status}`);
    rec("S1b the remote invoice created meanwhile is cancelled at the provider or kept for reconcile", f.made.length === 1 && (f.cancelled.includes(f.made[0]) || row.providerInvoiceId === f.made[0]), `made=${f.made.length} cancelled=${f.cancelled.length} stored=${row.providerInvoiceId}`);
    rec("S1c the create caller is not told it has a usable open invoice", !String(out).startsWith("ok:PENDING"), String(out));
  }
  await reset();
  { // S2
    const f = new FakeQPay(); const s = svc(f);
    const orig = prisma.billingInvoice.updateMany.bind(prisma.billingInvoice); let sabotage = 2;
    (prisma.billingInvoice as any).updateMany = (args: any) => { if (sabotage > 0 && args?.data?.status === "PENDING") { sabotage--; return Promise.reject(new Error("injected persistence failure")); } return orig(args); };
    const origU = prisma.billingInvoice.update.bind(prisma.billingInvoice); let sabU = 1;
    (prisma.billingInvoice as any).update = (args: any) => { if (sabU > 0 && args?.data?.status === "PENDING") { sabU--; return Promise.reject(new Error("injected persistence failure")); } return origU(args); };
    let out = ""; try { await s.createInvoice(company.id, user.id, "DIAGNOSTIC", "marketing"); out = "ok"; } catch (e: any) { out = e?.code ?? e?.message; }
    (prisma.billingInvoice as any).updateMany = orig; (prisma.billingInvoice as any).update = origU;
    const row = await latest();
    rec("S2a persistence failure after remote creation: customer gets a retryable error", out === "PAYMENT_PROVIDER_ERROR", out);
    rec("S2b the remote invoice is not stranded (cancelled remotely, or its id stored for reconcile)", f.made.length === 1 && (f.cancelled.includes(f.made[0]) || row.providerInvoiceId === f.made[0]), `made=${f.made.length} cancelled=${f.cancelled.length} stored=${row.providerInvoiceId} status=${row.status}`);
    rec("S2c local row is not left as an open invoice that can never be paid", row.status !== "CREATED" || row.providerInvoiceId !== null, `status=${row.status}`);
    // S3: even if the provider cancel failed, a later payment on the stranded remote must be honoured via reconcile
    const stranded = await prisma.billingInvoice.update({ where: { id: row.id }, data: { providerInvoiceId: f.made[0], status: "FAILED" } });
    f.paid = true; const r: any = await s.reconcileInvoice(stranded.id).catch((e: any) => ({ err: e.code }));
    rec("S3 a stranded (FAILED, remote id known) provider invoice that is later paid is reconciled to PAID", r.status === "PAID", r.status ?? r.err);
  }
  await reset();
  { // S4 normal
    const f = new FakeQPay(); const s = svc(f); const r: any = await s.createInvoice(company.id, user.id, "DIAGNOSTIC", "marketing");
    rec("S4 normal creation still PENDING with provider id", r.status === "PENDING" && f.made.length === 1);
  }
  await reset();
  { // S5
    const f = new FakeQPay(); f.failCreate = true; const s = svc(f);
    const out = await s.createInvoice(company.id, user.id, "DIAGNOSTIC", "marketing").then(() => "ok", (e: any) => e.code); const row = await latest();
    rec("S5 provider creation failure -> FAILED and 502", out === "PAYMENT_PROVIDER_ERROR" && row.status === "FAILED", `${out} ${row.status}`);
  }
} finally { await reset(); await prisma.company.delete({ where: { id: company.id } }).catch(() => {}); await prisma.$disconnect(); }
console.log(fail ? `\n${fail} FAILED` : "\nALL PASSED"); process.exit(fail ? 1 : 0);
