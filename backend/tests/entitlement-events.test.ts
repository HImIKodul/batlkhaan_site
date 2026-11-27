import { describe, expect, it } from "vitest";
import { entitlementSeq, notifyEntitlementChange, waitForEntitlementChange } from "../src/api/account/entitlement-events.js";

describe("event-driven entitlement synchronisation", () => {
  it("wakes a waiting page as soon as the company's access changes", async () => {
    const since = entitlementSeq("c-wake"); const t0 = Date.now();
    const p = waitForEntitlementChange("c-wake", since, 5000);
    setTimeout(() => notifyEntitlementChange("c-wake"), 30);
    const r = await p; expect(r.changed).toBe(true); expect(r.seq).toBe(since + 1); expect(Date.now() - t0).toBeLessThan(1000);
  });
  it("answers at once when the page's counter is already behind (e.g. after an API restart)", async () => {
    notifyEntitlementChange("c-behind"); const r = await waitForEntitlementChange("c-behind", 0, 5000); expect(r).toEqual({ seq: 1, changed: true });
    expect((await waitForEntitlementChange("c-restart", 7, 5000)).changed).toBe(true);
  });
  it("times out without a change and never wakes for another company", async () => {
    const p = waitForEntitlementChange("c-quiet", entitlementSeq("c-quiet"), 120); notifyEntitlementChange("c-other");
    expect(await p).toEqual({ seq: 0, changed: false });
  });
  it("a closed connection releases its waiter", async () => {
    let closed = false; const p = waitForEntitlementChange("c-closed", 0, 10_000, () => closed); setTimeout(() => { closed = true; }, 50);
    expect((await p).changed).toBe(false);
  });
});
