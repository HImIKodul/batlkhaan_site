import path from "node:path";
import { unlink } from "node:fs/promises";
import { Prisma } from "@prisma/client";
import { prisma } from "../../db.js";
import type { ApiConfig } from "../config.js";
import { ApiError, forbidden, notFound } from "../errors.js";
import { hashAuditValue, hashPassword, verifyPassword } from "../auth/crypto.js";
import type { RequestFingerprint } from "../auth/auth-service.js";
import { requireCompanyRole } from "../auth/access.js";
import { derivedContentWithheld } from "../../services/report-review-policy.js";
import { randomBytes } from "node:crypto";

/* DATA LIFECYCLE: export and erasure. Rules (see docs/DATA_LIFECYCLE.md):
   export : the signed-in user's own data, or one company's data for its OWNER. Explicit field lists, so hashes, tokens, QR payloads and
            provider metadata are never exported.
   erase  : removes CUSTOMER CONTENT (answers, results, reports, plans, report files, memberships) and anonymises the company/user record.
            Payment invoices, entitlements and audit events are RETAINED (their retention period is an owner/legal decision that has not been made;
            this code does not invent one). Needs the password, an exact typed confirmation and the OWNER role. One database transaction. */
export const ERASED_COMPANY_NAME = "Устгасан байгууллага";
export const EXPORT_SCHEMA = "MMRI-EXPORT-1";
const MSG = {
  badPassword: "Нууц үг буруу байна.",
  badConfirmName: "Баталгаажуулах нэр байгууллагын нэртэй яг таарахгүй байна.",
  badConfirmEmail: "Баталгаажуулах имэйл таны бүртгэлтэй яг таарахгүй байна.",
  alreadyErased: "Энэ байгууллагын мэдээлэл өмнө нь устгагдсан байна.",
  pilot: "Энэ байгууллага судалгааны (pilot) хөтөлбөрт холбогдсон тул өөрөө устгах боломжгүй. Бидэнтэй холбогдоно уу.",
  soleOwner: "Та дараах байгууллагын цорын ганц эзэмшигч байна. Эхлээд байгууллагынхаа мэдээллийг устгах эсвэл өөр эзэмшигч томилно уу."
};

function storageRoot() { return path.resolve(process.env.MMRI_REPORT_STORAGE_DIR || process.env.REPORT_STORAGE_DIR || path.join(process.cwd(), "report-storage")); }
async function removeStoredFile(key: string): Promise<boolean> {
  if (path.isAbsolute(key) || key.includes("\\")) return false;
  const root = storageRoot(); const abs = path.resolve(root, key);
  if (abs === root || !abs.startsWith(root + path.sep)) return false;
  try { await unlink(abs); return true; } catch { return false; }
}

export class DataLifecycleService {
  constructor(private readonly config: ApiConfig) {}

  async exportAccount(userId: string, fp: RequestFingerprint) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, displayName: true, status: true, createdAt: true, lastLoginAt: true } });
    if (!user) throw notFound("Account not found");
    const [memberships, invoices, events] = await Promise.all([
      prisma.companyMembership.findMany({ where: { userId }, select: { role: true, createdAt: true, company: { select: { id: true, name: true } } } }),
      prisma.billingInvoice.findMany({ where: { createdByUserId: userId }, orderBy: { createdAt: "asc" }, select: { id: true, companyId: true, domainCode: true, planCode: true, amountMnt: true, currency: true, status: true, createdAt: true, paidAt: true } }),
      prisma.authAuditEvent.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 500, select: { eventType: true, createdAt: true } })
    ]);
    await this.audit(userId, "DATA_EXPORT_ACCOUNT", fp);
    return { schema: EXPORT_SCHEMA, scope: "ACCOUNT", exportedAt: new Date().toISOString(), account: user,
      companies: memberships.map(m => ({ companyId: m.company.id, companyName: m.company.name, role: m.role, memberSince: m.createdAt })),
      paymentsCreatedByYou: invoices, securityEvents: events,
      note: "Company diagnosis data is exported per company by its owner." };
  }

  async exportCompany(userId: string, companyId: string, fp: RequestFingerprint) {
    await requireCompanyRole(userId, companyId, ["OWNER"] as any);
    const company = await prisma.company.findUnique({ where: { id: companyId }, select: { id: true, name: true, industry: true, businessModel: true, employeeCount: true, companyAgeYears: true, marketType: true, country: true, profile: true, createdAt: true, erasedAt: true } });
    if (!company || company.erasedAt) throw notFound("Company not found");
    const [members, assessments, invoices, entitlements] = await Promise.all([
      prisma.companyMembership.findMany({ where: { companyId }, select: { role: true, createdAt: true, user: { select: { email: true, displayName: true } } } }),
      prisma.assessment.findMany({ where: { companyId }, orderBy: { createdAt: "asc" }, select: {
        id: true, domainCode: true, mode: true, status: true, startedAt: true, completedAt: true, createdAt: true,
        methodologyVersion: { select: { version: true } },
        answers: { where: { active: true }, orderBy: { createdAt: "asc" }, select: { questionId: true, optionIndex: true, status: true, authority: true, createdAt: true } },
      } }),
      prisma.billingInvoice.findMany({ where: { companyId }, orderBy: { createdAt: "asc" }, select: { id: true, domainCode: true, planCode: true, amountMnt: true, currency: true, provider: true, status: true, createdAt: true, paidAt: true, refundedAt: true } }),
      prisma.companyEntitlement.findMany({ where: { companyId }, orderBy: { createdAt: "asc" }, select: { id: true, domainCode: true, planCode: true, status: true, startsAt: true, endsAt: true, assessmentLimit: true, assessmentsUsed: true } })
    ]);
    // Derived content (scores, diagnosis, plan, report text) follows the same publication rule as the customer report endpoints: an owner cannot use the export to read
    // a report that is still pending administrator review. Their own submitted answers and account data are always exported.
    const derivedById = new Map<string, any>(); const withheldIds = new Set<string>();
    for (const a of assessments as any[]) {
      if ((await derivedContentWithheld(prisma, a)).withheld) { withheldIds.add(a.id); continue; }
      derivedById.set(a.id, await prisma.assessment.findUnique({ where: { id: a.id }, select: {
        overallPartialScore: true, overallOfficialScore: true, overallConfidence: true, coverage: true,
        diagnosisSnapshots: { orderBy: { generatedAt: "desc" }, take: 1, select: { generatedAt: true, resultHash: true, result: true } },
        strategyPlanSnapshot: { select: { generatedAt: true, planHash: true, snapshot: true } },
        reportSnapshots: { orderBy: { generatedAt: "desc" }, take: 1, select: { generatedAt: true, payloadHash: true, payload: true, narrative: true } }
      } }));
    }
    await this.audit(userId, "DATA_EXPORT_COMPANY", fp, { companyId, assessments: assessments.length });
    return { schema: EXPORT_SCHEMA, scope: "COMPANY", exportedAt: new Date().toISOString(), company,
      members: members.map(m => ({ role: m.role, email: m.user.email, displayName: m.user.displayName, since: m.createdAt })),
      assessments: assessments.map((a: any) => ({ ...a, ...(derivedById.get(a.id) ?? {}), derivedContent: withheldIds.has(a.id) ? "WITHHELD_PENDING_REVIEW" : "INCLUDED", methodologyVersion: a.methodologyVersion?.version ?? null })),
      payments: invoices, entitlements,
      note: "Question text is identified by questionId. Hashes, payment provider secrets and QR payloads are not exported. Scores and report content of an assessment still under review are withheld until it is published." };
  }

  async eraseCompany(userId: string, companyId: string, input: { confirmName?: unknown; password?: unknown }, fp: RequestFingerprint) {
    await requireCompanyRole(userId, companyId, ["OWNER"] as any);
    const company = await prisma.company.findUnique({ where: { id: companyId }, select: { id: true, name: true, erasedAt: true } });
    if (!company) throw notFound("Company not found");
    if (company.erasedAt) throw new ApiError(409, "ALREADY_ERASED", MSG.alreadyErased);
    await this.requirePassword(userId, input.password, fp);
    if (String(input.confirmName ?? "").trim() !== company.name.trim()) throw new ApiError(400, "CONFIRMATION_MISMATCH", MSG.badConfirmName);
    const pilots = await prisma.pilotEnrollment.count({ where: { companyId } });
    if (pilots > 0) throw new ApiError(409, "PILOT_LINKED", MSG.pilot);

    const result = await prisma.$transaction(async tx => {
      const assessmentIds = (await tx.assessment.findMany({ where: { companyId }, select: { id: true } })).map(a => a.id);
      const links = assessmentIds.length ? await tx.pilotAssessmentLink.count({ where: { assessmentId: { in: assessmentIds } } }) : 0;
      if (links > 0) throw new ApiError(409, "PILOT_LINKED", MSG.pilot);
      const artifacts = assessmentIds.length ? await tx.reportArtifact.findMany({ where: { reportSnapshot: { assessmentId: { in: assessmentIds } } }, select: { storageKey: true } }) : [];
      // Report review records reference assessments (ON DELETE RESTRICT) and hold customer narrative text in append-only revisions.
      // Inside this transaction only, the revision trigger allows DELETE (mmri.erasure is transaction-local). Content is removed; a content-free evidence event per review
      // is written to the append-only admin audit log first. How long such evidence must be kept is an owner/legal decision (docs/DATA_LIFECYCLE.md); nothing here sets a period.
      const reviews = assessmentIds.length ? await tx.reportReview.findMany({ where: { assessmentId: { in: assessmentIds } }, select: { id: true, domainCode: true, status: true, submittedAt: true, publishedAt: true, currentRevision: true } }) : [];
      let reviewsRemoved = 0;
      if (reviews.length) {
        const reviewIds = reviews.map(r => r.id);
        await tx.$queryRaw`SELECT set_config('mmri.erasure', 'on', true)`;
        await tx.adminAuditEvent.createMany({ data: reviews.map(r => ({ adminId: null, action: "REVIEW_ERASED_WITH_COMPANY", targetType: "REVIEW", targetId: r.id, outcome: "SUCCESS", metadata: { companyId, domainCode: r.domainCode, statusAtErasure: r.status, revisions: r.currentRevision, submittedAt: r.submittedAt, publishedAt: r.publishedAt } as any })) });
        await tx.reportReviewSuggestion.deleteMany({ where: { reviewId: { in: reviewIds } } });
        await tx.reportReviewRevision.deleteMany({ where: { reviewId: { in: reviewIds } } });
        await tx.adminNotification.updateMany({ where: { targetType: "REVIEW", targetId: { in: reviewIds } }, data: { body: "Байгууллагын мэдээлэл устгагдсан." } });
        reviewsRemoved = (await tx.reportReview.deleteMany({ where: { id: { in: reviewIds } } })).count;
      }
      const removed = await tx.assessment.deleteMany({ where: { companyId } });          // answers, results, snapshots, reports, plans cascade
      // Mark the company erased FIRST: the last-owner database guard only lets an erased company drop its final OWNER membership.
      await tx.company.update({ where: { id: companyId }, data: { name: ERASED_COMPANY_NAME, industry: null, businessModel: null, employeeCount: null, companyAgeYears: null, marketType: null, country: null, profile: Prisma.DbNull, erasedAt: new Date() } });
      const memberships = await tx.companyMembership.deleteMany({ where: { companyId } });
      await tx.authAuditEvent.create({ data: { userId, eventType: "COMPANY_ERASED", ipHash: hashAuditValue(fp.ip, this.config.auditSalt), userAgentHash: hashAuditValue(fp.userAgent, this.config.auditSalt), metadata: { companyId, assessmentsRemoved: removed.count, membershipsRemoved: memberships.count, reportFiles: artifacts.length, reviewsRemoved } as any } });
      return { assessmentsRemoved: removed.count, membershipsRemoved: memberships.count, storageKeys: artifacts.map(a => a.storageKey) };
    }, { maxWait: 10_000, timeout: 120_000 });   // a full assessment cascades through many result tables; the 5 s interactive default is far too short
    let filesRemoved = 0; for (const key of result.storageKeys) if (await removeStoredFile(key)) filesRemoved++;
    return { erased: true, assessmentsRemoved: result.assessmentsRemoved, reportFilesRemoved: filesRemoved, retained: ["payment invoices", "entitlements", "security audit events", "content-free review audit events"] };
  }

  async eraseAccount(userId: string, input: { confirmEmail?: unknown; password?: unknown }, fp: RequestFingerprint) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.erasedAt) throw notFound("Account not found");
    await this.requirePassword(userId, input.password, fp);
    if (String(input.confirmEmail ?? "").trim().toLowerCase() !== user.email) throw new ApiError(400, "CONFIRMATION_MISMATCH", MSG.badConfirmEmail);
    const owned = await prisma.companyMembership.findMany({ where: { userId, role: "OWNER" }, select: { companyId: true, company: { select: { name: true, erasedAt: true } } } });
    const sole: { companyId: string; name: string }[] = [];
    for (const m of owned) {
      if (m.company.erasedAt) continue;
      const others = await prisma.companyMembership.count({ where: { companyId: m.companyId, role: "OWNER", userId: { not: userId } } });
      if (others === 0) sole.push({ companyId: m.companyId, name: m.company.name });
    }
    if (sole.length) throw new ApiError(409, "SOLE_OWNER", MSG.soleOwner, { companies: sole });
    const passwordHash = await hashPassword(randomBytes(24).toString("base64url"), this.config.passwordPepper);
    const now = new Date();
    await prisma.$transaction(async tx => {
      const memberships = await tx.companyMembership.deleteMany({ where: { userId } });
      await tx.refreshSession.deleteMany({ where: { userId } });
      await tx.passwordResetToken.deleteMany({ where: { userId } });
      await tx.user.update({ where: { id: userId }, data: { email: `erased+${userId}@erased.invalid`, displayName: null, passwordHash, status: "DISABLED", tokenVersion: { increment: 1 }, erasedAt: now } });
      await tx.authAuditEvent.create({ data: { userId, eventType: "ACCOUNT_ERASED", ipHash: hashAuditValue(fp.ip, this.config.auditSalt), userAgentHash: hashAuditValue(fp.userAgent, this.config.auditSalt), metadata: { membershipsRemoved: memberships.count } as any } });
    });
    return { erased: true, retained: ["payment invoices created by this account", "security audit events"] };
  }

  private async requirePassword(userId: string, password: unknown, fp: RequestFingerprint) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true } });
    const valid = user ? await verifyPassword(String(password ?? ""), user.passwordHash, this.config.passwordPepper).catch(() => false) : false;
    if (!valid) {
      await this.audit(userId, "ERASE_PASSWORD_REJECTED", fp);
      throw new ApiError(403, "PASSWORD_INCORRECT", MSG.badPassword);
    }
  }

  private audit(userId: string, eventType: string, fp: RequestFingerprint, metadata?: unknown) {
    return prisma.authAuditEvent.create({ data: { userId, eventType, ipHash: hashAuditValue(fp.ip, this.config.auditSalt), userAgentHash: hashAuditValue(fp.userAgent, this.config.auditSalt), metadata: metadata as any } });
  }
}
void forbidden;
