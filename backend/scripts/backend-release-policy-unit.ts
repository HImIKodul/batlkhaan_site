/* Unit regression for the report-release policy (owner decision 2026-11): approval releases at once; 24 h is a review TARGET, not a hold.
   Pure module checks, no database. Run: npx tsx scripts/backend-release-policy-unit.ts */
import assert from "node:assert/strict";
import * as policy from "../src/services/report-review-policy.js";
let n = 0; const ok = (name: string, fn: () => void) => { fn(); n++; console.log("PASS " + name); };
ok("the minimum-release-hold API is gone (no earliestReleaseAt / reportMinReleaseHours exports)", () => { assert.equal("earliestReleaseAt" in policy, false); assert.equal("reportMinReleaseHours" in policy, false); });
ok("review target defaults to 24 hours", () => { assert.equal(policy.REVIEW_HOURS, 24); });
ok("the legacy MMRI_REPORT_MIN_RELEASE_HOURS variable has no effect on the module", () => { process.env.MMRI_REPORT_MIN_RELEASE_HOURS = "24"; assert.equal(policy.REVIEW_HOURS, 24); delete process.env.MMRI_REPORT_MIN_RELEASE_HOURS; });
console.log(`${n}/3 passed`);
