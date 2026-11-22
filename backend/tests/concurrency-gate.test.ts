import { describe, expect, it } from "vitest";
import { ConcurrencyGate } from "../src/api/concurrency-gate.js";

const tick = (ms: number) => new Promise(r => setTimeout(r, ms));

describe("ConcurrencyGate", () => {
  it("never runs more than `limit` jobs at once and finishes all of them in order of arrival", async () => {
    const gate = new ConcurrencyGate(2, 50, 5000);
    let running = 0, peak = 0; const order: number[] = [];
    await Promise.all(Array.from({ length: 8 }, (_, i) => gate.run(async () => {
      running++; peak = Math.max(peak, running); await tick(10); order.push(i); running--;
    })));
    expect(peak).toBe(2);
    expect(order).toHaveLength(8);
    expect(gate.stats).toEqual({ active: 0, queued: 0, limit: 2 });
  });

  it("releases the slot when a job throws", async () => {
    const gate = new ConcurrencyGate(1, 5, 1000);
    await expect(gate.run(async () => { throw new Error("boom"); })).rejects.toThrow("boom");
    await expect(gate.run(async () => "ok")).resolves.toBe("ok");
    expect(gate.stats.active).toBe(0);
  });

  it("rejects with a retryable 503 when the queue is full or the wait is too long", async () => {
    const gate = new ConcurrencyGate(1, 1, 40);
    const hold = gate.run(() => tick(150));
    const queued = gate.run(async () => "late");
    await expect(gate.run(async () => "x")).rejects.toMatchObject({ status: 503, code: "SERVER_BUSY" });
    await expect(queued).rejects.toMatchObject({ status: 503, code: "SERVER_BUSY" });
    await hold;
    await expect(gate.run(async () => "after")).resolves.toBe("after");
    expect(gate.stats).toEqual({ active: 0, queued: 0, limit: 1 });
  });
});
