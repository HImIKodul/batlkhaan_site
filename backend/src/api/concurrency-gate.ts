import { ApiError } from "./errors.js";

/**
 * Bounded FIFO gate for CPU-heavy engine work (adaptive routing, scoring, completion).
 * One Node event loop cannot run these in parallel, so unbounded fan-out only multiplies in-flight memory and
 * stretches every customer's latency. Excess work waits in a queue; if the queue is full or the wait is too long
 * the caller gets a retryable 503 instead of piling up further.
 */
export class ConcurrencyGate {
  private active = 0;
  private readonly waiters: Array<{ release: () => void; timer: NodeJS.Timeout }> = [];

  constructor(
    private readonly limit: number,
    private readonly maxQueue: number,
    private readonly maxWaitMs: number
  ) {}

  get stats() { return { active: this.active, queued: this.waiters.length, limit: this.limit }; }

  async run<T>(work: () => Promise<T>): Promise<T> {
    await this.acquire();
    try { return await work(); } finally { this.release(); }
  }

  private acquire(): Promise<void> {
    if (this.active < this.limit) { this.active++; return Promise.resolve(); }
    if (this.waiters.length >= this.maxQueue) return Promise.reject(this.busy());
    return new Promise<void>((resolve, reject) => {
      const entry = {
        release: () => { clearTimeout(entry.timer); resolve(); },
        timer: setTimeout(() => {
          const index = this.waiters.indexOf(entry);
          if (index >= 0) this.waiters.splice(index, 1);
          reject(this.busy());
        }, this.maxWaitMs)
      };
      this.waiters.push(entry);
    });
  }

  private release(): void {
    const next = this.waiters.shift();
    if (next) next.release(); // the slot passes straight to the next waiter
    else this.active--;
  }

  private busy(): ApiError {
    return new ApiError(503, "SERVER_BUSY", "Server is busy, please retry shortly", { retryAfterSeconds: 3 });
  }
}
