/* Event-driven entitlement synchronisation (no new infrastructure): an administrator grant/revoke or a confirmed payment bumps a per-company counter and wakes every customer page that is waiting on that company
   (long poll, at most ~25 s per request). A page therefore learns about a change within milliseconds instead of on its next poll. The counter lives in this API process; with several API replicas a
   page may still wait for its slow fallback check (the web app keeps one every 30 s), so correctness never depends on the event. Nothing here carries data: the page re-reads its own entitlements through the normal authorised API. */
const counters = new Map<string, number>();
const waiters = new Map<string, Set<() => void>>();

export function notifyEntitlementChange(companyId: string): void {
  counters.set(companyId, (counters.get(companyId) ?? 0) + 1);
  const set = waiters.get(companyId); if (!set) return;
  for (const wake of [...set]) wake();
}
export const entitlementSeq = (companyId: string) => counters.get(companyId) ?? 0;

/** Resolves with the current counter as soon as it differs from `since` (also immediately if it already does, e.g. after an API restart), or after `timeoutMs` with `changed: false`. */
export function waitForEntitlementChange(companyId: string, since: number, timeoutMs: number, aborted?: () => boolean): Promise<{ seq: number; changed: boolean }> {
  return new Promise(resolve => {
    if (entitlementSeq(companyId) !== since) return resolve({ seq: entitlementSeq(companyId), changed: true });
    const set = waiters.get(companyId) ?? new Set<() => void>(); waiters.set(companyId, set);
    let done = false;
    const finish = (changed: boolean) => { if (done) return; done = true; clearTimeout(timer); clearInterval(probe); set.delete(wake); if (!set.size) waiters.delete(companyId); resolve({ seq: entitlementSeq(companyId), changed }); };
    const wake = () => finish(true);
    const timer = setTimeout(() => finish(false), timeoutMs);
    const probe = setInterval(() => { if (aborted?.()) finish(false); }, 1000);   // a closed connection must not keep a waiter alive
    set.add(wake);
  });
}
