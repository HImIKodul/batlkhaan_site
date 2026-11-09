// WS-C MMRI-21: a rejected methodology load must not stay cached. Run: npx tsx scripts/qa-wsc-methodology-cache.ts
import { MethodologyDefinitionCache } from "../src/services/methodology-cache.js";
import assert from "node:assert/strict";
let calls = 0;
const db: any = {
  methodologyVersion: { findUnique: async () => { calls++; if (calls === 1) throw new Error("transient db error"); return null; } },
  module: { findMany: async () => [] }, category: { findMany: async () => [] }, cellTemplate: { findMany: async () => [] },
  diagnosticCell: { findMany: async () => [] }, question: { findMany: async () => [] }, methodologyContract: { findMany: async () => [] },
  questionRuntimePolicy: { findMany: async () => [] }, cellRuntimePolicy: { findMany: async () => [] },
  runtimeRuleDefinition: { findMany: async () => [] }, runtimeScorePattern: { findMany: async () => [] }
};
const cache = new MethodologyDefinitionCache(db);
await assert.rejects(cache.get("m1"), /transient db error/);
await new Promise(r => setImmediate(r)); // let eviction run
await assert.rejects(cache.get("m1"), /not found/, "second call must retry the load (got stale rejection)");
assert.equal(calls, 2, "load must have been retried exactly once");
// a successful/ongoing entry is cached: same promise returned twice
const p1 = cache.get("m2"); const p2 = cache.get("m2"); assert.equal(p1, p2); await p1.catch(() => {});
console.log("methodology-cache: rejection evicted, retry reloads, in-flight promise shared: OK");
