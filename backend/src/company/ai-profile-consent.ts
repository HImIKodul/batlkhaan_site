import { prisma } from "../db.js";
/* Consent of a company for sending FIVE general business-profile answers (what it offers, to whom, how it sells, its stage and area: option labels only, see PLAN_CONTEXT_PROFILE_IDS) to the external AI provider
   when a 12-month plan is generated. Default = NOT given. The record is an append-only audit event (who, when, which wording version); the newest event decides, so withdrawal is immediate for every later generation.
   Wording version changes when the disclosed scope changes: consent given to an older wording does not count. */
export const AI_PROFILE_CONSENT_VERSION = "AI-PROFILE-1";
const GRANTED = "AI_PROFILE_CONSENT_GRANTED", WITHDRAWN = "AI_PROFILE_CONSENT_WITHDRAWN";
export interface AiProfileConsent { granted: boolean; version: string; changedAt: string | null }
export async function readAiProfileConsent(companyId: string): Promise<AiProfileConsent> {
  const row = await prisma.authAuditEvent.findFirst({ where: { eventType: { in: [GRANTED, WITHDRAWN] }, metadata: { path: ["companyId"], equals: companyId } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { eventType: true, createdAt: true, metadata: true } });
  return { granted: row?.eventType === GRANTED && (row.metadata as any)?.version === AI_PROFILE_CONSENT_VERSION, version: AI_PROFILE_CONSENT_VERSION, changedAt: row?.createdAt.toISOString() ?? null };
}
export async function writeAiProfileConsent(companyId: string, userId: string, granted: boolean): Promise<AiProfileConsent> {
  if ((await readAiProfileConsent(companyId)).granted !== granted) await prisma.authAuditEvent.create({ data: { userId, eventType: granted ? GRANTED : WITHDRAWN, metadata: { companyId, version: AI_PROFILE_CONSENT_VERSION } } });
  return readAiProfileConsent(companyId);
}
