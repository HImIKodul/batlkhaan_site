/**
 * Phase 2.7 feature flags for UNAPPROVED methodology/report/storage policies (B1, B2, B3, B4, B7).
 *
 * Safety design (absence of configuration = everything OFF):
 *  - a flag is honoured only when BOTH the policy variable has an exact enabling value AND
 *    MMRI_POLICY_FLAGS_ALLOWED=ISOLATED_QA is set (two independent keys; a stray single variable cannot enable anything);
 *  - never honoured when MMRI_ENVIRONMENT or NODE_ENV is "production";
 *  - unknown / differently-cased values are OFF.
 * Nothing here is approved for customers; see the Phase 2.7 audit folder, 15_FINAL_OWNER_APPROVAL_SHEET.md.
 */
export type B1Mode = "OFF" | "NUMERIC_50" | "ORDINAL_2_LEVELS";

export interface PolicyFlags {
  b1: B1Mode;
  b2: boolean;
  b3: boolean;
  b4: boolean;
  b7: boolean;
}

export const POLICY_FLAGS_OFF: PolicyFlags = Object.freeze({ b1: "OFF", b2: false, b3: false, b4: false, b7: false }) as PolicyFlags;

export const POLICY_ENV = {
  allow: "MMRI_POLICY_FLAGS_ALLOWED",
  b1: "MMRI_POLICY_B1_CONTRADICTION",
  b2: "MMRI_POLICY_B2_SCORED_CONFLICT",
  b3: "MMRI_POLICY_B3_EVIDENCE_STATUS",
  b4: "MMRI_POLICY_B4_REPORT_PLACEHOLDERS",
  b7: "MMRI_POLICY_B7_IMMUTABLE_PDF"
} as const;

export function readPolicyFlags(env: Record<string, string | undefined> = process.env): PolicyFlags {
  if (env[POLICY_ENV.allow] !== "ISOLATED_QA") return POLICY_FLAGS_OFF;
  const prod = (env.MMRI_ENVIRONMENT ?? "").toLowerCase() === "production" || (env.NODE_ENV ?? "").toLowerCase() === "production";
  if (prod) return POLICY_FLAGS_OFF;
  const b1 = env[POLICY_ENV.b1];
  return {
    b1: b1 === "NUMERIC_50" || b1 === "ORDINAL_2_LEVELS" ? b1 : "OFF",
    b2: env[POLICY_ENV.b2] === "ON",
    b3: env[POLICY_ENV.b3] === "ON",
    b4: env[POLICY_ENV.b4] === "ON",
    b7: env[POLICY_ENV.b7] === "ON"
  };
}

export function anyPolicyFlagOn(f: PolicyFlags): boolean {
  return f.b1 !== "OFF" || f.b2 || f.b3 || f.b4 || f.b7;
}
