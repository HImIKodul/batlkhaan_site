import { afterEach, describe, expect, it, vi } from "vitest";
import { QPayMerchantV2Adapter, qpayExpiryMs, qpayPlainText, safeDeeplink } from "../src/billing/qpay-client.js";

const config: any = { qpayClientId: "cid", qpayClientSecret: "s3cret", qpayInvoiceCode: "CODE", qpayBaseUrl: "https://merchant.example", qpayRequestTimeoutMs: 5000 };
const INV = { senderInvoiceNo: "MMRI1", receiverCode: "c1", description: "BusinessMRI.mn · it — Анхны оношилгоо", amountMnt: 300000, callbackUrl: "https://businessmri.mn/api/v1/billing/qpay/callback/x?token=t" };
type Call = { path: string; init: any };
function fake(handler: (path: string, init: any, n: number) => { status?: number; body: any }) {
  const calls: Call[] = [];
  vi.stubGlobal("fetch", async (url: any, init: any) => { const path = String(url).replace("https://merchant.example", ""); calls.push({ path, init }); const r = handler(path, init, calls.filter(c => c.path === path).length); return new Response(JSON.stringify(r.body), { status: r.status ?? 200 }); });
  return calls;
}
const epoch = (plusSeconds: number) => Math.floor(Date.now() / 1000) + plusSeconds;
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("QPay Merchant V2 token lifetime", () => {
  it("reads expires_in as a Unix timestamp", () => {
    const now = 1_790_000_000_000;
    expect(qpayExpiryMs(1_790_086_400, now)).toBe(now + 86_400_000);
    expect(qpayExpiryMs(3600, now)).toBe(now + 3_600_000);
    expect(qpayExpiryMs(undefined, now)).toBe(now + 3_600_000);
    expect(qpayExpiryMs(9_999_999_999, now)).toBeLessThanOrEqual(now + 7 * 86_400_000);
  });
  it("reuses a valid token and renews it with the refresh token once it expired", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const calls = fake(path => path.endsWith("/auth/token") ? { body: { access_token: "a1", expires_in: epoch(3600), refresh_token: "r1", refresh_expires_in: epoch(86400) } }
      : path.endsWith("/auth/refresh") ? { body: { access_token: "a2", expires_in: epoch(3600) } } : { body: { count: 0, rows: [] } });
    const q = new QPayMerchantV2Adapter(config);
    await q.checkInvoicePayment("i", 300000); await q.checkInvoicePayment("i", 300000);
    expect(calls.filter(c => c.path.endsWith("/auth/token")).length).toBe(1);
    vi.setSystemTime(Date.now() + 2 * 3600_000);
    await q.checkInvoicePayment("i", 300000);
    expect(calls.filter(c => c.path.endsWith("/auth/token")).length).toBe(1);
    expect(calls.find(c => c.path.endsWith("/auth/refresh"))!.init.headers.authorization).toBe("Bearer r1");
    expect(calls.at(-1)!.init.headers.authorization).toBe("Bearer a2");
  });
  it("signs in fully when the refresh is refused", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const calls = fake((path, _i, n) => path.endsWith("/auth/token") ? { body: { access_token: `a${n}`, expires_in: epoch(3600), refresh_token: "r1", refresh_expires_in: epoch(86400) } } : path.endsWith("/auth/refresh") ? { status: 401, body: {} } : { body: { count: 0, rows: [] } });
    const q = new QPayMerchantV2Adapter(config);
    await q.checkInvoicePayment("i", 1); vi.setSystemTime(Date.now() + 2 * 3600_000); await q.checkInvoicePayment("i", 1);
    expect(calls.at(-1)!.init.headers.authorization).toBe("Bearer a2");
  });
  it.each([401, 403])("re-authenticates and retries exactly once after %i", async status => {
    const calls = fake((path, _i, n) => path.endsWith("/auth/token") ? { body: { access_token: `a${n}`, expires_in: epoch(3600) } } : n === 1 ? { status, body: {} } : { body: { count: 0, rows: [] } });
    const q = new QPayMerchantV2Adapter(config);
    expect((await q.checkInvoicePayment("i", 1)).paid).toBe(false);
    expect(calls.filter(c => c.path === "/v2/payment/check").map(c => c.init.headers.authorization)).toEqual(["Bearer a1", "Bearer a2"]);
  });
  it("stops after one retry and never leaks the secret", async () => {
    const calls = fake(path => path.endsWith("/auth/token") ? { body: { access_token: "a", expires_in: epoch(3600) } } : { status: 401, body: { message: "s3cret" } });
    const err: any = await new QPayMerchantV2Adapter(config).createInvoice(INV).catch(e => e);
    expect(calls.filter(c => c.path === "/v2/invoice").length).toBe(2);
    expect(String(err.message)).not.toContain("s3cret");
  });
});

describe("QPay invoice request", () => {
  it("sends one exact price and plain text only, keeps bank links unchanged and drops executable ones", async () => {
    const calls = fake(path => path.endsWith("/auth/token") ? { body: { access_token: "a", expires_in: epoch(3600) } }
      : { body: { invoice_id: "inv", qr_text: "qr", qr_image: "img", qPay_shortUrl: "https://s.qpay.mn/x", urls: [{ name: "Khan bank", description: "Хаан банк", link: "khanbank://q?qPay_QRcode=000201%20A" }, { name: "x", link: "javascript:alert(1)" }, { name: "y", link: "data:text/html,1" }] } });
    const r = await new QPayMerchantV2Adapter(config).createInvoice(INV);
    const sent = JSON.parse(calls.find(c => c.path === "/v2/invoice")!.init.body);
    expect(sent).toMatchObject({ invoice_code: "CODE", amount: 300000, allow_partial: false, allow_exceed: false, allow_subscribe: false, sender_invoice_no: "MMRI1" });
    expect(sent.invoice_description).toBe("BusinessMRI.mn it Анхны оношилгоо");
    expect(r.deeplinks.map(d => d.link)).toEqual(["khanbank://q?qPay_QRcode=000201%20A"]);
  });
  it("refuses an over-long callback address", async () => {
    fake(() => ({ body: { access_token: "a", expires_in: epoch(3600) } }));
    await expect(new QPayMerchantV2Adapter(config).createInvoice({ ...INV, callbackUrl: "https://x.mn/" + "a".repeat(260) })).rejects.toThrow(/callback/);
  });
  it("helpers", () => { expect(qpayPlainText("a·b—c/д", 10)).toBe("a b c д"); expect(safeDeeplink("JavaScript://x")).toBe(false); expect(safeDeeplink("intent://pay")).toBe(true); });
});

describe("QPay payment verification", () => {
  const paid = { count: 1, rows: [{ payment_id: 493622150113497, payment_status: "PAID", payment_amount: "300000.00", payment_currency: "MNT" }] };
  const run = (detail: any, status = 200, rows: any = paid) => { fake(path => path.endsWith("/auth/token") ? { body: { access_token: "a", expires_in: epoch(3600) } } : path === "/v2/payment/check" ? { body: rows } : { status, body: detail }); return new QPayMerchantV2Adapter(config).checkInvoicePayment("inv-1", 300000); };
  const good = { payment_id: "493622150113497", payment_status: "PAID", payment_amount: "300000.00", payment_currency: "MNT", object_type: "INVOICE", object_id: "inv-1" };
  it("accepts a confirmed payment of this invoice (numeric id, decimal string amount)", async () => { const r = await run(good); expect(r.paid).toBe(true); expect(r.transactions).toEqual([{ id: "493622150113497", amountMnt: 300000 }]); });
  it("refuses a payment that belongs to another invoice", async () => { await expect(run({ ...good, object_id: "inv-2" })).rejects.toThrow(/different invoice/); await expect(run(good, 200, { count: 1, rows: [{ ...paid.rows[0], object_id: "inv-2" }] })).rejects.toThrow(/different invoice/); });
  it("refuses unsettled, foreign-currency or different-amount detail", async () => {
    await expect(run({ ...good, payment_status: "REFUNDED" })).rejects.toThrow(/settled/);
    await expect(run({ ...good, payment_currency: "USD" })).rejects.toThrow(/currency/);
    await expect(run({ ...good, payment_amount: "1.00" })).rejects.toThrow(/differs/);
  });
  it("relies on payment/check when the detail endpoint is unavailable", async () => { expect((await run({}, 500)).paid).toBe(true); });
  it("a partial payment is not paid", async () => { expect((await run(good, 200, { count: 1, rows: [{ ...paid.rows[0], payment_amount: "299999.00" }] })).paid).toBe(false); });
});
