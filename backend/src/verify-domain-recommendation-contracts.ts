import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import type { MethodologyBundle } from "./lib/bundle-types.js";
import { validateBundle, recommendationContractIssues } from "./lib/validate-bundle-core.js";
import { allDomainMethodologyTargets } from "./domain-methodology.js";

/**
 * Static guard for the recommendation layer. For every non-Marketing domain it verifies the bundle that the
 * repository declares as the target (src/domain-methodology.ts):
 *   - the file's SHA-256 equals the declared target hash and the declared version/domain;
 *   - full bundle validation passes (including the recommendation/authority contract integrity checks);
 *   - every one of the 64 domain categories resolves an objective, and every objective x intervention slot
 *     (the pairs a finding can occupy) is resolvable, so the engine can produce candidates;
 *   - no Marketing ids/wording and no foreign-domain ids anywhere in the recommendation/authority contracts.
 * It also runs a negative control: the legacy v2.5 Finance bundle (Marketing objectives) MUST be rejected.
 *
 * Usage: tsx src/verify-domain-recommendation-contracts.ts            (from backend/)
 */
const DIR_BY_DOMAIN: Record<string, string> = {
  finance: "methodology/businessmri-v2.6-runtime-bundles/MMRI_FINMRI_Methodology_4.2.7_BUSINESSMRI_V2.json",
  it: "methodology/businessmri-v2.6-runtime-bundles/MMRI_ISMRI_Methodology_4.3.7_BUSINESSMRI_V2.json",
  people: "methodology/businessmri-v2.6-runtime-bundles/MMRI_HRMRI_Methodology_4.1.7_BUSINESSMRI_V2.json",
  operations: "methodology/businessmri-v2.6-runtime-bundles/MMRI_OPMRI_Methodology_4.4.7_BUSINESSMRI_V2.json"
};
const LEGACY_NEGATIVE_CONTROL = "methodology/businessmri-v2.5-runtime-bundles/MMRI_FINMRI_Methodology_4.2.5_BUSINESSMRI_V2.json";
const REC = "MMRI_FINAL_Recommendation_Engine_Contract.json";

let failures = 0;
const report: Record<string, unknown> = {};
const check = (domain: string, name: string, ok: boolean, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"} [${domain}] ${name}${detail ? " — " + detail : ""}`);
};

for (const target of allDomainMethodologyTargets()) {
  const domain = target.domainCode;
  if (domain === "marketing") continue;
  const path = DIR_BY_DOMAIN[domain];
  const raw = readFileSync(path, "utf8");
  const sha = createHash("sha256").update(raw).digest("hex");
  const bundle = JSON.parse(raw) as MethodologyBundle;

  check(domain, "bundle file SHA-256 equals declared target hash", sha === target.bundleSha256, sha.slice(0, 16));
  check(domain, "bundle version/domain equal declared target", bundle.methodologyVersion === target.methodologyVersion && bundle.domainCode === domain, `${bundle.methodologyVersion}`);
  check(domain, "question-bank version equals declared target", bundle.questionBankVersion === target.questionBankVersion, String(bundle.questionBankVersion));

  const issues = validateBundle(bundle);
  check(domain, "full bundle validation (incl. recommendation/authority contract integrity)", issues.length === 0, issues.slice(0, 3).map(i => i.code).join(","));

  const rec = bundle.contracts[REC];
  const objectives: any[] = rec.composition.categoryObjectives;
  const interventions: any[] = rec.composition.cellInterventions;
  const prefix = { finance: "FINMRI-", it: "ISMRI-", people: "HRMRI-", operations: "OPMRI-" }[domain]!;
  check(domain, "exactly 64 category ids, all in this domain's id space", bundle.categories.length === 64 && bundle.categories.every(c => c.ID.startsWith(prefix)));
  check(domain, "64 objectives, one per category, no duplicates, no orphans", objectives.length === 64 && new Set(objectives.map(o => o.category)).size === 64 && objectives.every(o => bundle.categories.some(c => c.ID === o.category)));
  check(domain, "zero Marketing MSxx ids in the whole recommendation contract", !/\bMS\d{2}\b/.test(JSON.stringify(rec)));
  check(domain, "zero foreign-domain ids in the recommendation contract", !/(?:FINMRI|ISMRI|HRMRI|OPMRI)-C\d\d/.test(JSON.stringify(rec).replace(new RegExp(`${prefix}C\\d\\d`, "g"), "")));
  check(domain, "zero Marketing wording in objectives, interventions and roles", !/аркетинг/i.test(JSON.stringify([objectives, interventions, bundle.contracts["MMRI_FINAL_Respondent_Authority_Contract.json"].roles])));
  const slots = objectives.length * interventions.length; // category x construct slots a finding can occupy
  const resolvable = objectives.filter(o => o.objective && o.defaultOwner && o.sponsor).length * interventions.filter(i => i.action && i.title).length;
  check(domain, "every category x intervention slot resolves to a complete recommendation template", slots === resolvable && slots > 0, `${slots} slots`);
  const prov: any = (bundle as any).recommendationContractRepair;
  check(domain, "provenance: question bank unchanged, authority matrices unchanged", prov?.questionBankContentUnchanged === true && prov?.authorityMatricesUnchanged === true);
  report[domain] = { version: bundle.methodologyVersion, sha256: sha, questionBankVersion: bundle.questionBankVersion, objectives: objectives.length, interventions: interventions.length, slots };
}

// Negative control: the legacy bundle shipped Marketing objectives and must be rejected by the guard.
const legacy = JSON.parse(readFileSync(LEGACY_NEGATIVE_CONTROL, "utf8")) as MethodologyBundle;
const legacyCodes = recommendationContractIssues(legacy).map(i => i.code);
check("negative-control", "legacy v2.5 Finance bundle (Marketing objectives) is rejected", legacyCodes.includes("REC_MARKETING_IDS") && legacyCodes.includes("REC_OBJECTIVE_ORPHAN"), [...new Set(legacyCodes)].join(","));

console.log(JSON.stringify({ status: failures ? "FAIL" : "PASS", failures, report }, null, 2));
process.exit(failures ? 1 : 0);
