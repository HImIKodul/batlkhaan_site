import { annotationCount, annotationsOf, normalizeAnnotations } from "../../report/annotations.js";
import { renderDraftPages } from "../../report/draft-preview.js";
import { customerNotifications } from "../notifications/notification-service.js";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { prisma } from "../../db.js";
import type { ApiConfig } from "../config.js";
import { ApiError } from "../errors.js";
import { derivedContentWithheld, enqueueReviewInTx, REVIEW_HOURS as POLICY_REVIEW_HOURS } from "../../services/report-review-policy.js";
import { sha256Json } from "../../lib/hash.js";
import { validateNarrativeDraft } from "../../report/validator.js";
import { checkPdfLayoutBudget } from "../../report/pdf-budget.js";
import type { NarrativeDraft } from "../../report/types.js";
import type { PrismaStrategyReportService } from "../../services/prisma-strategy-report-service.js";

/* REPORT REVIEW WORKFLOW (24 h review TARGET, never auto-approved, no release hold: approval publishes at once).
   SUBMITTED -> GENERATING_DRAFT -> AWAITING_REVIEW -> IN_REVIEW <-> READY_FOR_APPROVAL -> APPROVED -> PUBLISHING -> PUBLISHED   (GENERATION_FAILED can retry)
   Only the narrative text layer is editable. Answers, scores, methodology, snapshots, question ids and the frozen payload are never touched.
   Every edit is an append-only revision (database trigger). Publication writes the approved revision into the report snapshot narrative with a fresh
   hash, regenerates the PDF from that same content and refuses to publish unless the PDF has exactly three pages. */
export const REVIEW_HOURS = POLICY_REVIEW_HOURS;
/** Narrative sections whose text the customer report and the PDF actually print (src/report/pdf-artifact.ts reads S04, S05, S06 and S10; the web report reads the same four). Only these are editable.
    S01 (assessment facts), S02 (score/confidence statement and required warnings), S03 (purpose scores), S07/S08/S09 (evidence/roadmap measures, required risk disclosures) are calculated values or
    mandatory disclosures and are never rendered from narrative text, so editing them could only change stored text, never the report. */
/** Plain-language (Mongolian) reason for a failed approval; the executive-conclusion length rule (V27, 80-160 words) is by far the most common one and is spelled out with the current count. */
export function validationMessageMn(issues: { checkId: string; message: string }[]): string {
  const v27 = issues.find(i => i.checkId === "V27");
  if (v27) { const n = /\((\d+)\)/.exec(v27.message)?.[1]; return `Ерөнхий дүгнэлт 80-160 үгтэй байх ёстой${n ? ` (одоо ${n} үг)` : ""}. Үгээ сольж эсвэл богиносгож, дахин хадгална уу.`; }
  return "Тайлан баталгаажуулалтыг бүрэн давах хүртэл батлах боломжгүй (засвар шаардлагатай).";
}
/** Executive conclusion length contract (validator V27), counted exactly like the validator: trimmed text split on whitespace. */
export const CONCLUSION_WORDS = { min: 80, max: 160 } as const;
export const conclusionWordCount = (t: string) => (t.trim() ? t.trim().split(/\s+/).length : 0);
export const EDITABLE_SECTIONS: ReadonlySet<string> = new Set(["S04", "S05", "S06", "S10"]);
export type ReviewStatus = "SUBMITTED" | "GENERATING_DRAFT" | "AWAITING_REVIEW" | "IN_REVIEW" | "READY_FOR_APPROVAL" | "APPROVED" | "PUBLISHING" | "PUBLISHED" | "GENERATION_FAILED";
export const OPEN_STATUSES: ReviewStatus[] = ["SUBMITTED", "GENERATING_DRAFT", "AWAITING_REVIEW", "IN_REVIEW", "READY_FOR_APPROVAL", "GENERATION_FAILED"];
const TRANSITIONS: Record<string, ReviewStatus[]> = {
  SUBMITTED: ["GENERATING_DRAFT"], GENERATING_DRAFT: ["AWAITING_REVIEW", "GENERATION_FAILED"], GENERATION_FAILED: ["GENERATING_DRAFT"],
  AWAITING_REVIEW: ["IN_REVIEW"], IN_REVIEW: ["READY_FOR_APPROVAL"], READY_FOR_APPROVAL: ["IN_REVIEW", "APPROVED"], APPROVED: ["PUBLISHING", "IN_REVIEW"], PUBLISHING: ["PUBLISHED", "APPROVED"], PUBLISHED: []
};
export const CUSTOMER_PENDING_MESSAGE = "Таны тайлан хянагдаж байна. Администратор баталгаажуулсны дараа тайланг харах боломжтой болно.";
const FORBIDDEN = /хүчтэй тал|анхаарах тал/i;
const noDash = (t: string) => t.replace(/\s*[—―]\s*/g, " - ");
const nums = (t: string) => new Set((t.match(/\d+(?:[.,]\d+)?/g) ?? []).map(x => x.replace(",", ".")));

export class ReviewService {
  constructor(private readonly config: ApiConfig, private readonly reports: PrismaStrategyReportService) {}
  /** Set by the API: runs after every maintenance pass (lifecycle e-mail dispatch). Failures never fail maintenance. */
  afterMaintenance?: () => Promise<void>;

  // ---------- notifications (deduplicated by key) ----------
  async notify(type: string, dedupeKey: string, target: { type: string; id: string }, title: string, body: string, severity = "INFO") {
    try { await prisma.adminNotification.create({ data: { type, dedupeKey, targetType: target.type, targetId: target.id, title, body, severity } }); return true; }
    catch (e: any) { if (e?.code === "P2002") return false; throw e; }
  }

  // ---------- creation, hooked into assessment completion ----------
  /** Idempotent: one review per assessment (unique key). Called synchronously from the completion route when the rollout flag is on. */
  async createForAssessment(assessmentId: string) {
    return prisma.$transaction(tx => enqueueReviewInTx(tx, assessmentId, true));
  }

  async setStatus(id: string, from: ReviewStatus[], to: ReviewStatus, data: Record<string, unknown> = {}) {
    const r = await prisma.reportReview.updateMany({ where: { id, status: { in: from } }, data: { status: to, version: { increment: 1 }, ...data } });
    return r.count === 1;
  }

  async generateDraft(reviewId: string) {
    const review = await prisma.reportReview.findUnique({ where: { id: reviewId } });
    if (!review || review.status === "PUBLISHED" || review.status === "APPROVED") return;
    // Atomic claim: only one run can move SUBMITTED/GENERATION_FAILED to GENERATING_DRAFT, so duplicate triggers (double completion, restarts) cannot race.
    if (!(await this.setStatus(reviewId, ["SUBMITTED", "GENERATION_FAILED"], "GENERATING_DRAFT", { lastError: null }))) return;
    try {
      const report: any = await this.reports.generateReport(review.assessmentId);
      let narrative = report.narrative as NarrativeDraft;
      if (!narrative?.sections?.length) throw new Error("Draft has no narrative sections");
      // Display rule: no em dash in customer-visible text. Frozen recommendation titles contain them (hash-bound), so the editable draft is normalised
      // (same rule the web report and PDF renderer apply). If validation objects, the original text is kept and the reviewer edits it.
      const cleaned: NarrativeDraft = JSON.parse(JSON.stringify(narrative).replace(/\s*[\u2014\u2015]\s*/g, " - "));
      if (JSON.stringify(cleaned) !== JSON.stringify(narrative) && (await this.validate(review.assessmentId, cleaned)).state !== "GENERATION_BLOCKED") narrative = cleaned;
      await prisma.$transaction(async tx => {
        const existing = await tx.reportReviewRevision.count({ where: { reviewId } });
        if (existing === 0) await tx.reportReviewRevision.create({ data: { reviewId, revision: 1, narrative: narrative as any, source: "GENERATED", reason: "Автоматаар үүссэн анхны төсөл" } });
        else if (existing > 1) throw new Error("unexpected state: revisions already exist");
        await tx.reportReview.update({ where: { id: reviewId }, data: { status: "AWAITING_REVIEW", draftGeneratedAt: new Date(), currentRevision: Math.max(1, existing), version: { increment: 1 } } });
      });
      await this.notify("DRAFT_READY", `DRAFT_READY:${reviewId}`, { type: "REVIEW", id: reviewId }, "Тайлангийн төсөл бэлэн боллоо", "Тайланг хянахад бэлэн байна.");
    } catch (e: any) {
      const msg = String(e?.message ?? e).replace(/sk-[A-Za-z0-9_-]+/g, "[redacted]").replace(/\s+/g, " ").slice(0, 300);
      await prisma.reportReview.update({ where: { id: reviewId }, data: { status: "GENERATION_FAILED", lastError: msg, version: { increment: 1 } } });
      await this.notify("DRAFT_FAILED", `DRAFT_FAILED:${reviewId}:${Date.now() - (Date.now() % 600_000)}`, { type: "REVIEW", id: reviewId }, "Тайлангийн төсөл үүсгэж чадсангүй", "Төсөл үүсгэх үед алдаа гарсан. Дахин оролдоно уу.", "HIGH");
    }
  }

  // ---------- customer view ----------
  async customerState(assessmentId: string) {
    let r = await prisma.reportReview.findUnique({ where: { assessmentId } });
    if (!r) {
      /* REP-03: decide with the SAME policy as assertCustomerMayRead. A post-cutover assessment without a review row is NOT available (it is withheld and its review is repaired); only genuinely
         legacy assessments (completed before review was enforced) stay available. The status endpoint can therefore never say "available" and be followed by a 409 from the content gate. */
      const a = await prisma.assessment.findUnique({ where: { id: assessmentId }, select: { id: true, completedAt: true } });
      const state = a ? await derivedContentWithheld(prisma, a) : { withheld: false, missingReview: false };
      if (!state.withheld) return { reviewRequired: false, state: "LEGACY_AVAILABLE", available: true };
      if (state.missingReview) {
        const created: any = await this.createForAssessment(assessmentId);
        if (created?.status === "SUBMITTED") setImmediate(() => { void this.generateDraft(created.id); });
      }
      r = await prisma.reportReview.findUnique({ where: { assessmentId } });
      if (!r) return { reviewRequired: true, state: "PENDING_REVIEW", available: false, submittedAt: null, estimatedAvailableAt: null, publishedAt: null, message: CUSTOMER_PENDING_MESSAGE, note: "Тайлан баталгаажмагц танд мэдэгдэнэ." };
    }
    const published = r.status === "PUBLISHED";
    return { reviewRequired: true, state: published ? "PUBLISHED" : "PENDING_REVIEW", available: published, submittedAt: r.submittedAt, estimatedAvailableAt: published ? null : r.deadlineAt, publishedAt: r.publishedAt,
      message: published ? "Тайлан бэлэн боллоо." : CUSTOMER_PENDING_MESSAGE, note: published ? null : "Тайлан баталгаажмагц танд мэдэгдэнэ." };
  }
  /** Server-side gate for every customer report/result endpoint. No review row means a legacy report that stays available. */
  async assertCustomerMayRead(assessmentId: string) {
    const a = await prisma.assessment.findUnique({ where: { id: assessmentId }, select: { id: true, completedAt: true } });
    if (!a) return;
    const state = await derivedContentWithheld(prisma, a);
    if (!state.withheld) return;
    // An assessment that finished without a review went through a path that skipped the workflow: fail closed, create the missing review and queue its draft.
    if (state.missingReview) {
      const created: any = await this.createForAssessment(assessmentId);
      if (created?.status === "SUBMITTED") setImmediate(() => { void this.generateDraft(created.id); });
    }
    throw new ApiError(409, "REPORT_PENDING_REVIEW", CUSTOMER_PENDING_MESSAGE);
  }

  // ---------- reading ----------
  async latestRevision(reviewId: string) {
    const rev = await prisma.reportReviewRevision.findFirst({ where: { reviewId }, orderBy: { revision: "desc" } });
    if (!rev) throw new ApiError(409, "NO_DRAFT", "Төсөл хараахан үүсээгүй байна.");
    return rev;
  }
  claimsOf(n: NarrativeDraft) { return n.sections.flatMap(s => s.claims.map(c => ({ sectionId: s.id, sectionTitle: s.titleMn, editable: EDITABLE_SECTIONS.has(s.id), claimId: c.reportClaimId!, claimType: c.claimType, text: c.textMn }))); }
  /** The customer PDF has exactly three A4 pages. Approved wording is never truncated, so wording that cannot fit is refused here with a clear 422
      (save and approve), and publication can therefore never fail on layout for content that was accepted. */
  async assertPdfBudget(assessmentId: string, narrative: NarrativeDraft) {
    const published: any = await this.reports.readPublishedReport(assessmentId);
    const r = await checkPdfLayoutBudget(published.payload, narrative);
    if (!r.fits) throw new ApiError(422, "PDF_LAYOUT_BUDGET", "Нэмсэн тайлбаруудын нийт урт PDF тайлангийн 3 хуудсанд багтахгүй байна. Тайлбаруудыг (ялангуяа давуу, сул талын тайлбар бүрийг ойролцоогоор 100 тэмдэгтээс, тэргүүлэх ажлын тайлбарыг 300 тэмдэгтээс) товчилж дахин хадгална уу.");
  }
  async validate(assessmentId: string, narrative: NarrativeDraft) {
    const published: any = await this.reports.readPublishedReport(assessmentId);
    return validateNarrativeDraft(published.payload, narrative);
  }

  // ---------- editing (append-only revisions, optimistic concurrency) ----------
  private assertCanEdit(review: any, adminId: string, role: string) {
    void adminId; void role; // who may edit is decided by the edit lock (assertLockHeld), not by assignment
    if (!["IN_REVIEW", "READY_FOR_APPROVAL", "APPROVED"].includes(review.status)) throw new ApiError(409, "INVALID_STATE", "Энэ төлөвт тайланг засах боломжгүй. Эхлээд хяналтыг авна уу.");
  }
  async claim(reviewId: string, adminId: string, role: string) {
    void role;
    const r = await prisma.reportReview.findUnique({ where: { id: reviewId } });
    if (!r) throw new ApiError(404, "NOT_FOUND", "Хяналтын даалгавар олдсонгүй.");
    if (r.status === "AWAITING_REVIEW") { if (!(await this.setStatus(reviewId, ["AWAITING_REVIEW"], "IN_REVIEW", { assignedAdminId: adminId }))) throw new ApiError(409, "CONFLICT", "Өөр хянагч аль хэдийн авсан байна."); }
    else if (r.status !== "IN_REVIEW" && r.status !== "READY_FOR_APPROVAL") throw new ApiError(409, "INVALID_STATE", "Энэ төлөвт хяналтыг авах боломжгүй.");
    await this.acquireLock(reviewId, adminId);
    await prisma.reportReview.updateMany({ where: { id: reviewId, status: { in: ["IN_REVIEW", "READY_FOR_APPROVAL"] } }, data: { assignedAdminId: adminId } });
    await this.notify("REVIEW_ASSIGNED", `REVIEW_ASSIGNED:${reviewId}:${adminId}`, { type: "REVIEW", id: reviewId }, "Хяналт хуваарилагдлаа", "Тайлангийн хяналтыг хянагч авлаа.");
  }
  // ---------- edit lock: one editor per report, server-authoritative, expires without heartbeat ----------
  static readonly LOCK_MINUTES = 5;
  /** Take or renew the lock. Succeeds when the lock is free, expired or already ours; otherwise 409 LOCKED_BY_OTHER. Different reports never block each other. */
  async acquireLock(reviewId: string, adminId: string) {
    const n = await prisma.$executeRaw`UPDATE report_reviews SET "lockedByAdminId" = ${adminId}, "lockExpiresAt" = now() + make_interval(mins => ${ReviewService.LOCK_MINUTES}::int)
      WHERE id = ${reviewId} AND status IN ('IN_REVIEW','READY_FOR_APPROVAL','APPROVED') AND ("lockedByAdminId" IS NULL OR "lockedByAdminId" = ${adminId} OR "lockExpiresAt" IS NULL OR "lockExpiresAt" < now())`;
    if (n !== 1) {
      const li = await this.lockInfo(reviewId, adminId);
      if (li.active && !li.heldByMe) throw new ApiError(409, "LOCKED_BY_OTHER", `Энэ тайланг одоо ${li.holderEmail ?? "өөр админ"} засаж байна. Та зөвхөн харах боломжтой.`, { holderEmail: li.holderEmail, expiresAt: li.expiresAt });
      throw new ApiError(409, "INVALID_STATE", "Энэ төлөвт тайланг засах боломжгүй. Эхлээд хяналтыг авна уу.");
    }
    return this.lockInfo(reviewId, adminId);
  }
  async releaseLock(reviewId: string, adminId: string) { await prisma.$executeRaw`UPDATE report_reviews SET "lockedByAdminId" = NULL, "lockExpiresAt" = NULL WHERE id = ${reviewId} AND "lockedByAdminId" = ${adminId}`; }
  async lockInfo(reviewId: string, adminId: string): Promise<{ active: boolean; heldByMe: boolean; holderEmail: string | null; expiresAt: string | null }> {
    const r = (await prisma.$queryRaw<any[]>`SELECT l."lockedByAdminId" AS holder, l."lockExpiresAt" AS exp, (l."lockExpiresAt" > now()) AS live FROM report_reviews l WHERE l.id = ${reviewId}`)[0];
    if (!r || !r.holder || !r.live) return { active: false, heldByMe: false, holderEmail: null, expiresAt: null };
    const holder = await prisma.adminAccount.findUnique({ where: { id: r.holder }, select: { userId: true } }); const u = holder ? await prisma.user.findUnique({ where: { id: holder.userId }, select: { email: true } }) : null;
    return { active: true, heldByMe: r.holder === adminId, holderEmail: u?.email ?? null, expiresAt: r.exp ? new Date(r.exp).toISOString() : null };
  }
  /** Every write path calls this: the caller must hold an unexpired lock. A stale tab whose lock lapsed (or was taken) is refused before anything is written. */
  async assertLockHeld(reviewId: string, adminId: string) {
    const li = await this.lockInfo(reviewId, adminId);
    if (li.active && li.heldByMe) return;
    if (li.active) throw new ApiError(409, "LOCKED_BY_OTHER", `Энэ тайланг одоо ${li.holderEmail ?? "өөр админ"} засаж байна. Та зөвхөн харах боломжтой.`, { holderEmail: li.holderEmail });
    throw new ApiError(409, "LOCK_EXPIRED", "Засварын түгжээ дууссан байна. Хуудсыг шинэчилж дахин авна уу.");
  }
  async saveEdits(reviewId: string, adminId: string, role: string, baseRevision: number, edits: { claimId: string; text: string }[], reason: string, source: "MANUAL" | "AI_APPLIED" | "RESTORED" = "MANUAL", replaceNarrative?: NarrativeDraft) {
    if (!Number.isInteger(baseRevision)) throw new ApiError(400, "BAD_REQUEST", "baseRevision шаардлагатай.");
    if (!reason || reason.trim().length < 3 || reason.length > 500) throw new ApiError(400, "REASON_REQUIRED", "Засварын шалтгааныг 3-500 тэмдэгтээр бичнэ үү.");
    const review: any = await prisma.reportReview.findUnique({ where: { id: reviewId } });
    if (!review) throw new ApiError(404, "NOT_FOUND", "Хяналтын даалгавар олдсонгүй.");
    this.assertCanEdit(review, adminId, role); await this.assertLockHeld(reviewId, adminId);
    if (review.currentRevision !== baseRevision) throw new ApiError(409, "REVISION_CONFLICT", "Өөр хувилбар хадгалагдсан байна. Хуудсыг шинэчилж өөрчлөлтөө дахин шалгана уу.", { currentRevision: review.currentRevision });
    const latest = await this.latestRevision(reviewId);
    const narrative: NarrativeDraft = replaceNarrative ?? JSON.parse(JSON.stringify(latest.narrative));
    const changed: string[] = [];
    if (!replaceNarrative) for (const e of edits) {
      const text = noDash(String(e.text ?? "")).trim();
      if (!text || text.length > 4000) throw new ApiError(400, "BAD_TEXT", "Текст хоосон эсвэл хэт урт байна (дээд тал нь 4000 тэмдэгт).");
      let found = false;
      for (const s of narrative.sections) for (const c of s.claims) if (c.reportClaimId === e.claimId) { if (!EDITABLE_SECTIONS.has(s.id)) throw new ApiError(400, "CLAIM_NOT_EDITABLE", "Энэ мөр тооцоолсон утга эсвэл заавал оруулах мэдээлэл тул засагдахгүй. Тайланд харагддаг тайлбар текстийг л засна."); found = true; if (c.textMn !== text) { c.textMn = text; changed.push(e.claimId); } }
      if (!found) throw new ApiError(400, "UNKNOWN_CLAIM", "Засах боломжгүй эсвэл олдохгүй мөр байна.");
    }
    if (!replaceNarrative && changed.length === 0) throw new ApiError(400, "NO_CHANGE", "Өөрчлөлт илрээгүй.");
    await this.assertPdfBudget(review.assessmentId, narrative);
    const next = baseRevision + 1;
    try {
      await prisma.$transaction(async tx => {
        const upd = await tx.reportReview.updateMany({ where: { id: reviewId, currentRevision: baseRevision, status: { in: ["IN_REVIEW", "READY_FOR_APPROVAL", "APPROVED"] } }, data: { currentRevision: next, status: "IN_REVIEW", approvedAt: null, approvedByAdminId: null, approvedRevision: null, approvedNarrativeHash: null, assignedAdminId: review.assignedAdminId ?? adminId, version: { increment: 1 } } });
        if (upd.count !== 1) throw new ApiError(409, "REVISION_CONFLICT", "Өөр хувилбар хадгалагдсан байна.");
        await tx.reportReviewRevision.create({ data: { reviewId, revision: next, narrative: narrative as any, source, reason: reason.trim(), changedClaims: changed as any, createdByAdminId: adminId } });
      });
    } catch (e: any) { if (e?.code === "P2002") throw new ApiError(409, "REVISION_CONFLICT", "Өөр хувилбар хадгалагдсан байна."); throw e; }
    return { revision: next, changedClaims: changed, validation: await this.validate(review.assessmentId, narrative) };
  }
  async markReady(reviewId: string, adminId: string, role: string) {
    const r: any = await prisma.reportReview.findUnique({ where: { id: reviewId } }); if (!r) throw new ApiError(404, "NOT_FOUND", "Олдсонгүй.");
    this.assertCanEdit(r, adminId, role); await this.assertLockHeld(reviewId, adminId);
    if (!(await this.setStatus(reviewId, ["IN_REVIEW"], "READY_FOR_APPROVAL", { remindersSent: Object.fromEntries(Object.entries((r.remindersSent ?? {}) as Record<string, unknown>).filter(([k]) => k !== "returnedAt")) }))) throw new ApiError(409, "INVALID_STATE", "Энэ төлөвөөс батлахад бэлэн болгох боломжгүй.");
  }
  async returnToReview(reviewId: string, adminId: string, role: string) {
    const r: any = await prisma.reportReview.findUnique({ where: { id: reviewId } }); if (!r) throw new ApiError(404, "NOT_FOUND", "Олдсонгүй.");
    await this.assertLockHeld(reviewId, adminId);
    if (!(await this.setStatus(reviewId, ["READY_FOR_APPROVAL", "APPROVED"], "IN_REVIEW", { approvedAt: null, approvedByAdminId: null, approvedRevision: null, approvedNarrativeHash: null, remindersSent: { ...(r.remindersSent ?? {}), returnedAt: new Date().toISOString() } }))) throw new ApiError(409, "INVALID_STATE", "Энэ төлөвөөс буцаах боломжгүй.");
    void adminId; void role;
  }
  // ---------- visual editor (annotations on the three PDF pages) ----------
  /** Saved annotations are one more append-only revision (same concurrency, state and ownership rules as a text edit); an approved revision falls back to IN_REVIEW and needs a new approval. */
  async saveAnnotations(reviewId: string, adminId: string, role: string, baseRevision: number, raw: unknown, reason: string) {
    if (!Number.isInteger(baseRevision)) throw new ApiError(400, "BAD_REQUEST", "baseRevision шаардлагатай.");
    const set = normalizeAnnotations(raw);
    const latest = await this.latestRevision(reviewId);
    if (latest.revision !== baseRevision) throw new ApiError(409, "REVISION_CONFLICT", "Өөр хувилбар хадгалагдсан байна. Хуудсыг шинэчилж өөрчлөлтөө дахин шалгана уу.", { currentRevision: latest.revision });
    const narrative: any = JSON.parse(JSON.stringify(latest.narrative));
    if (sha256Json(set) === sha256Json(annotationsOf(narrative))) throw new ApiError(400, "NO_CHANGE", "Өөрчлөлт илрээгүй.");
    if (set.items.length) narrative.visualAnnotations = set; else delete narrative.visualAnnotations;
    const out = await this.saveEdits(reviewId, adminId, role, baseRevision, [], reason, "MANUAL", narrative as NarrativeDraft);
    return { ...out, annotationCount: set.items.length };
  }

  async editorState(reviewId: string) {
    const review: any = await prisma.reportReview.findUnique({ where: { id: reviewId }, select: { id: true, status: true, currentRevision: true, assignedAdminId: true, approvedRevision: true, domainCode: true } });
    if (!review) throw new ApiError(404, "NOT_FOUND", "Хяналтын даалгавар олдсонгүй.");
    const revisions = await prisma.reportReviewRevision.findMany({ where: { reviewId }, orderBy: { revision: "desc" }, select: { revision: true, source: true, reason: true, createdAt: true, createdByAdminId: true, narrative: true } });
    const latest = revisions[0];
    if (!latest) throw new ApiError(409, "NO_DRAFT", "Төсөл хараахан үүсээгүй байна.");
    return {
      review, revision: latest.revision, pages: 3, annotations: annotationsOf(latest.narrative),
      history: revisions.map(r => ({ revision: r.revision, source: r.source, reason: r.reason, createdAt: r.createdAt, createdByAdminId: r.createdByAdminId, annotationCount: annotationCount(r.narrative) }))
    };
  }

  async annotationsOfRevision(reviewId: string, revision: number) {
    const rev = await prisma.reportReviewRevision.findUnique({ where: { reviewId_revision: { reviewId, revision } } });
    if (!rev) throw new ApiError(404, "NOT_FOUND", "Хувилбар олдсонгүй.");
    return { revision, annotations: annotationsOf(rev.narrative) };
  }

  private previewCache = new Map<string, Buffer[]>();
  /** PNG pages of a candidate rendering. `annotations` undefined: the saved revision as stored (with or without its annotations per `annotated`); defined: preview of an UNSAVED set on top of the latest revision. */
  async previewPages(reviewId: string, opts: { annotated: boolean; revision?: number; annotations?: unknown }): Promise<Buffer[]> {
    const review: any = await prisma.reportReview.findUnique({ where: { id: reviewId }, select: { assessmentId: true, domainCode: true } });
    if (!review) throw new ApiError(404, "NOT_FOUND", "Хяналтын даалгавар олдсонгүй.");
    const rev = opts.revision === undefined ? await this.latestRevision(reviewId) : await prisma.reportReviewRevision.findUnique({ where: { reviewId_revision: { reviewId, revision: opts.revision } } });
    if (!rev) throw new ApiError(404, "NOT_FOUND", "Хувилбар олдсонгүй.");
    const narrative: any = JSON.parse(JSON.stringify(rev.narrative));
    if (opts.annotations !== undefined) { const set = normalizeAnnotations(opts.annotations); if (set.items.length) narrative.visualAnnotations = set; else delete narrative.visualAnnotations; }
    else if (!opts.annotated) delete narrative.visualAnnotations;
    const key = sha256Json({ narrative, domain: review.domainCode });
    const hit = this.previewCache.get(key); if (hit) return hit;
    const published: any = await this.reports.readPublishedReport(review.assessmentId);
    const pages = await renderDraftPages(published.payload, narrative as NarrativeDraft, review.domainCode);
    this.previewCache.set(key, pages); if (this.previewCache.size > 8) this.previewCache.delete(this.previewCache.keys().next().value as string);
    return pages;
  }

  async restore(reviewId: string, adminId: string, role: string, baseRevision: number, revision: number) {
    const rev = await prisma.reportReviewRevision.findUnique({ where: { reviewId_revision: { reviewId, revision } } });
    if (!rev) throw new ApiError(404, "NOT_FOUND", "Хувилбар олдсонгүй.");
    return this.saveEdits(reviewId, adminId, role, baseRevision, [], `Хувилбар ${revision}-г сэргээв`, "RESTORED", rev.narrative as any);
  }

  // ---------- approval and publication ----------
  /** Step 1 of the single "Батлах, илгээх" action: validate and record the approval (exact revision + narrative hash). Never called directly by a route. */
  private async approveOnly(reviewId: string, adminId: string, baseRevision: number) {
    const r: any = await prisma.reportReview.findUnique({ where: { id: reviewId } }); if (!r) throw new ApiError(404, "NOT_FOUND", "Олдсонгүй.");
    if (r.status !== "READY_FOR_APPROVAL") throw new ApiError(409, "INVALID_STATE", "Зөвхөн \"Батлахад бэлэн\" төлөвтэй тайланг батална.");
    if (r.currentRevision !== baseRevision) throw new ApiError(409, "REVISION_CONFLICT", "Хувилбар өөрчлөгдсөн байна. Хуудсыг шинэчилнэ үү.", { currentRevision: r.currentRevision });
    const rev = await this.latestRevision(reviewId);
    if (rev.revision !== baseRevision) throw new ApiError(409, "REVISION_CONFLICT", "Хувилбар өөрчлөгдсөн байна. Хуудсыг шинэчилнэ үү.", { currentRevision: rev.revision });
    // Publishable = exactly the state the customer report page accepts (validation.state === "PASS"). REPAIR_REQUIRED would be approved here and then refused to the customer.
    const v = await this.validate(r.assessmentId, rev.narrative as any);
    if (v.state !== "PASS") throw new ApiError(422, v.state === "GENERATION_BLOCKED" ? "VALIDATION_BLOCKED" : "VALIDATION_NOT_PUBLISHABLE", v.state === "GENERATION_BLOCKED" ? "Тайлан баталгаажуулалтад тэнцсэнгүй (тооцоолсон баримтаас зөрсөн агуулга)." : validationMessageMn(v.issues), { state: v.state, issues: v.issues.slice(0, 8) });
    await this.assertPdfBudget(r.assessmentId, rev.narrative as any);
    const flat = JSON.stringify(rev.narrative);
    if (FORBIDDEN.test(flat) || /[—―]/.test(flat)) throw new ApiError(422, "TERMINOLOGY", "Тайланд хориглосон нэр томьёо эсвэл урт зураас үлдсэн байна.");
    // The approval records the exact revision and narrative hash; publication refuses anything else.
    const ok = await prisma.reportReview.updateMany({ where: { id: reviewId, status: "READY_FOR_APPROVAL", currentRevision: baseRevision }, data: { status: "APPROVED", approvedAt: new Date(), approvedByAdminId: adminId, approvedRevision: rev.revision, approvedNarrativeHash: sha256Json(rev.narrative), version: { increment: 1 } } });
    if (ok.count !== 1) throw new ApiError(409, "CONFLICT", "Зэрэгцээ өөрчлөлт илэрлээ.");
    await this.notify("REPORT_APPROVED", `REPORT_APPROVED:${reviewId}:${baseRevision}`, { type: "REVIEW", id: reviewId }, "Тайлан батлагдлаа", "Тайлан батлагдсан, нийтлэхэд бэлэн.");
  }
  /** Everything the customer report page needs, built from the CURRENT DRAFT (latest revision) instead of the published text: same renderer, same payload, same results. */
  async reportView(reviewId: string, queries: { results: (id: string) => Promise<any> }) {
    const r: any = await prisma.reportReview.findUnique({ where: { id: reviewId } }); if (!r) throw new ApiError(404, "NOT_FOUND", "Олдсонгүй.");
    const published: any = await this.reports.readPublishedReport(r.assessmentId); const rev = await this.latestRevision(reviewId);
    const validation = await this.validate(r.assessmentId, rev.narrative as any);
    const company = await prisma.company.findUnique({ where: { id: r.companyId }, select: { name: true } });
    return { report: { ...published, narrative: rev.narrative, validation: { state: validation.state, issues: validation.issues, wordCount: (validation as any).wordCount ?? 0 } }, results: await queries.results(r.assessmentId), companyName: company?.name ?? "", assessmentId: r.assessmentId, domainCode: r.domainCode, revision: rev.revision, status: r.status };
  }
  /** Context for the scan: names of strengths/weaknesses, evidence coverage, expected number of priorities. */
  async scanContext(reviewId: string) {
    const r: any = await prisma.reportReview.findUnique({ where: { id: reviewId } }); if (!r) throw new ApiError(404, "NOT_FOUND", "Олдсонгүй.");
    const published: any = await this.reports.readPublishedReport(r.assessmentId); const p = published?.payload ?? {};
    const a = await prisma.assessment.findUnique({ where: { id: r.assessmentId }, select: { coverage: true } }); const company = await prisma.company.findUnique({ where: { id: r.companyId }, select: { name: true } });
    const names = (rows: any[]) => (rows ?? []).map((x: any) => String(x.nameMn ?? x.name ?? "")).filter(Boolean);
    return { domainCode: r.domainCode, companyName: company?.name ?? "", coverage: a?.coverage == null ? null : Number(a.coverage), strengths: names(p.strengths), weaknesses: names(p.weaknesses), expectedPriorities: Array.isArray(p.priorities) ? Math.min(5, p.priorities.length) : 0 };
  }
  /** The one administrator action: approve and release. Idempotent and retry-safe: a repeated call after success changes nothing and sends nothing; a call after a failed
      publication (review left APPROVED) just finishes the publication. Concurrent callers are serialised by the guarded status updates. */
  async approveAndRelease(reviewId: string, adminId: string, role: string, baseRevision: number): Promise<{ status: "PUBLISHED"; alreadyPublished: boolean; publishedRevision: number | null; approvedNow: boolean }> {
    const r: any = await prisma.reportReview.findUnique({ where: { id: reviewId } }); if (!r) throw new ApiError(404, "NOT_FOUND", "Олдсонгүй.");
    if (r.status === "PUBLISHED") return { status: "PUBLISHED", alreadyPublished: true, publishedRevision: r.publishedRevision ?? null, approvedNow: false };
    if (r.status === "PUBLISHING") throw new ApiError(409, "PUBLISH_IN_PROGRESS", "Зэрэгцээ нийтлэлт явагдаж байна.");
    await this.assertLockHeld(reviewId, adminId); // only the administrator who holds the report may approve it
    let approvedNow = false;
    // One click is enough: a report still IN_REVIEW is moved to "ready" first (same ownership rule as the ready step), then approved.
    if (r.status === "IN_REVIEW") { this.assertCanEdit(r, adminId, role); await this.markReady(reviewId, adminId, role); r.status = "READY_FOR_APPROVAL"; r.currentRevision = (await prisma.reportReview.findUnique({ where: { id: reviewId }, select: { currentRevision: true } }))!.currentRevision; }
    if (r.status === "READY_FOR_APPROVAL") { await this.approveOnly(reviewId, adminId, baseRevision); approvedNow = true; }
    else if (r.status !== "APPROVED") throw new ApiError(409, "INVALID_STATE", "Зөвхөн \"Батлахад бэлэн\" төлөвтэй тайланг батлан илгээнэ.");
    const out = await this.publish(reviewId, adminId);
    await this.releaseLock(reviewId, adminId);
    return { status: "PUBLISHED", alreadyPublished: false, publishedRevision: out.publishedRevision, approvedNow };
  }
  /** PUBLISHING is an exclusive state: while it holds, edits, returns and a second publisher are all refused by guarded updates. */
  private async abortPublish(reviewId: string, reason: string) {
    await prisma.reportReview.updateMany({ where: { id: reviewId, status: "PUBLISHING" }, data: { status: "APPROVED", lastError: reason.slice(0, 300), version: { increment: 1 } } });
  }
  async publish(reviewId: string, adminId: string) {
    const r: any = await prisma.reportReview.findUnique({ where: { id: reviewId } }); if (!r) throw new ApiError(404, "NOT_FOUND", "Олдсонгүй.");
    if (r.status === "PUBLISHED") throw new ApiError(409, "ALREADY_PUBLISHED", "Аль хэдийн нийтлэгдсэн байна.");
    if (r.status === "PUBLISHING") throw new ApiError(409, "PUBLISH_IN_PROGRESS", "Зэрэгцээ нийтлэлт явагдаж байна.");
    if (r.status !== "APPROVED" || r.approvedRevision == null || !r.approvedNarrativeHash) throw new ApiError(409, "INVALID_STATE", "Зөвхөн батлагдсан тайланг нийтэлнэ.");
    const claimed = await prisma.reportReview.updateMany({ where: { id: reviewId, status: "APPROVED", currentRevision: r.approvedRevision, approvedRevision: r.approvedRevision, approvedNarrativeHash: r.approvedNarrativeHash }, data: { status: "PUBLISHING", version: { increment: 1 } } });
    if (claimed.count !== 1) throw new ApiError(409, "CONFLICT", "Зэрэгцээ нийтлэлт эсвэл засвар илэрлээ.");
    const approvedHash: string = r.approvedNarrativeHash;
    let rev: any;
    try {
      rev = await prisma.reportReviewRevision.findUnique({ where: { reviewId_revision: { reviewId, revision: r.approvedRevision } } });
      if (!rev || sha256Json(rev.narrative) !== approvedHash) throw new ApiError(409, "APPROVAL_MISMATCH", "Батлагдсан хувилбар болон нийтлэх агуулга таарахгүй байна.");
    } catch (e: any) { await this.abortPublish(reviewId, String(e?.message ?? e)); throw e; }
    const narrative = rev.narrative as unknown as NarrativeDraft;
    const snap = await prisma.reportSnapshot.findFirst({ where: { assessmentId: r.assessmentId, publishedAt: { not: null } }, orderBy: { publishedAt: "desc" } });
    if (!snap) { await this.abortPublish(reviewId, "NO_SNAPSHOT"); throw new ApiError(409, "NO_SNAPSHOT", "Тайлангийн суурь хувилбар олдсонгүй."); }
    const v = await this.validate(r.assessmentId, narrative);
    if (v.state !== "PASS") { await this.abortPublish(reviewId, `validation ${v.state}`); throw new ApiError(422, "VALIDATION_NOT_PUBLISHABLE", "Тайлан баталгаажуулалтыг бүрэн давахгүй тул нийтлэх боломжгүй.", { state: v.state, issues: v.issues.slice(0, 8) }); }
    /* REP-02: stage -> verify -> atomic commit. The candidate PDF is rendered and checked (3 pages) BEFORE any database change; the snapshot, the artifact row and the review status then change in ONE transaction.
       If anything fails the previously published snapshot/artifact pair is exactly as it was (nothing to compensate), and the review returns to APPROVED for a retry. */
    let staged: any;
    try { staged = await this.reports.stagePublication(r.assessmentId, narrative); }
    catch (e: any) { await this.abortPublish(reviewId, String(e?.message ?? e)); throw new ApiError(500, "PUBLISH_FAILED", "Нийтлэх үед алдаа гарлаа. Өмнөх нийтлэгдсэн тайлан хэвээр үлдлээ, тайлан нийтлэгдээгүй."); }
    try {
      await this.reports.commitPublication(staged, { narrative, narrativeHash: approvedHash, validation: v }, async (tx: any) => {
        const done = await tx.reportReview.updateMany({ where: { id: reviewId, status: "PUBLISHING", currentRevision: r.approvedRevision, approvedNarrativeHash: approvedHash }, data: { status: "PUBLISHED", publishedAt: new Date(), publishedByAdminId: adminId, publishedRevision: rev.revision, lastError: null, version: { increment: 1 } } });
        if (done.count !== 1) throw new Error("Review changed during publication");
      });
    } catch (e: any) {
      await this.reports.discardStaged(staged).catch(() => undefined);
      await this.abortPublish(reviewId, String(e?.message ?? e));
      throw new ApiError(500, "PUBLISH_FAILED", "Нийтлэх үед алдаа гарлаа. Өмнөх нийтлэгдсэн тайлан хэвээр үлдлээ, тайлан нийтлэгдээгүй.");
    }
    await this.notify("REPORT_PUBLISHED", `REPORT_PUBLISHED:${reviewId}`, { type: "REVIEW", id: reviewId }, "Тайлан нийтлэгдлээ", "Тайлан хэрэглэгчид нээлттэй боллоо. (Имэйл илгээлт тохируулагдаагүй: хэрэглэгчид системд мэдэгдэнэ.)");
    await customerNotifications.reportReleased(r.companyId, r.assessmentId, r.domainCode);
    return { publishedRevision: rev.revision };
  }

  // ---------- review-target reminders (50% and 83% of the target), overdue after the target, stuck drafts, failed-publication retry (idempotent) ----------
  async maintenance(now = new Date()) {
    const out = { reminders: 0, overdue: 0, retried: 0, released: 0 };
    // A publication that died mid-way (crash/restart) is released back to APPROVED; publishing again is idempotent and re-checks the approval binding.
    await prisma.reportReview.updateMany({ where: { status: "PUBLISHING", updatedAt: { lt: new Date(now.getTime() - 10 * 60_000) } }, data: { status: "APPROVED" } });
    // A draft job that has been running for over 10 minutes is considered dead (crash/restart): release it, then retry.
    await prisma.reportReview.updateMany({ where: { status: "GENERATING_DRAFT", updatedAt: { lt: new Date(now.getTime() - 10 * 60_000) } }, data: { status: "SUBMITTED" } });
    const stuck = await prisma.reportReview.findMany({ where: { status: "SUBMITTED", updatedAt: { lt: new Date(now.getTime() - 2 * 60_000) } }, select: { id: true } });
    for (const s of stuck) { void this.generateDraft(s.id); out.retried++; }
    // REP-02: staging directories of publications that died before commit are removed (the published pair is never affected by them).
    await this.reports.sweepStaging().catch(() => undefined);
    await this.reports.sweepSuperseded().catch(() => undefined);   // aged, unreferenced artifact files only (7 days)
    // Expired edit locks are cleared (idempotent housekeeping; an expired lock never blocks anyone, this just keeps the data truthful).
    await prisma.$executeRaw`UPDATE report_reviews SET "lockedByAdminId" = NULL, "lockExpiresAt" = NULL WHERE "lockedByAdminId" IS NOT NULL AND "lockExpiresAt" < now()`;
    // Open reviews created under the old 48 h rule get the current target as their deadline (idempotent; only the deadline column of unfinished reviews).
    await prisma.$executeRaw`UPDATE report_reviews SET "deadlineAt" = "submittedAt" + make_interval(hours => ${Math.round(REVIEW_HOURS)}::int) WHERE status NOT IN ('APPROVED','PUBLISHING','PUBLISHED') AND "deadlineAt" <> "submittedAt" + make_interval(hours => ${Math.round(REVIEW_HOURS)}::int)`;
    const open = await prisma.reportReview.findMany({ where: { status: { in: OPEN_STATUSES as any } } });
    for (const r of open) {
      const hours = (now.getTime() - r.submittedAt.getTime()) / 3_600_000;
      for (const h of [Math.round(REVIEW_HOURS / 2), Math.round(REVIEW_HOURS * 5 / 6)]) if (hours >= h && hours < REVIEW_HOURS && (await this.notify("DEADLINE_APPROACHING", `REMIND${h}:${r.id}`, { type: "REVIEW", id: r.id }, `Хянах хугацаа дөхөж байна (${h} цаг)`, `Тайлан илгээгдсэнээс хойш ${h} цаг өнгөрлөө. Хугацаа: ${REVIEW_HOURS} цаг.`, h > REVIEW_HOURS * 0.7 ? "HIGH" : "WARN"))) out.reminders++;
      if (hours >= REVIEW_HOURS && (await this.notify("REVIEW_OVERDUE", `OVERDUE${REVIEW_HOURS}:${r.id}`, { type: "REVIEW", id: r.id }, "Хянах хугацаа хэтэрлээ", `Тайлан ${REVIEW_HOURS} цагаас илүү хянагдаагүй байна. Автоматаар батлагдахгүй.`, "CRITICAL"))) out.overdue++;
    }
    // An approval whose publication failed (PDF/validation hiccup) is finished automatically, at most every 5 minutes. It is never released without an administrator approval on record.
    const stuckApproved = await prisma.reportReview.findMany({ where: { status: "APPROVED", approvedByAdminId: { not: null }, updatedAt: { lt: new Date(now.getTime() - 5 * 60_000) } }, select: { id: true, approvedByAdminId: true } });
    for (const d of stuckApproved) { try { await this.publish(d.id, d.approvedByAdminId!); out.released++; } catch (e: any) { console.error(JSON.stringify({ ts: new Date().toISOString(), level: "error", event: "review_publish_retry_failed", reviewId: d.id, reason: String(e?.message ?? e).slice(0, 160) })); } }
    if (this.afterMaintenance) await this.afterMaintenance().catch(e => console.error(JSON.stringify({ ts: new Date().toISOString(), level: "error", event: "lifecycle_mail_dispatch_failed", reason: String(e?.message ?? e).slice(0, 160) })));
    return out;
  }

  // ---------- AI assistance: proposals only, validated on the server ----------
  validateSuggestion(original: string, suggested: string): string | null {
    if (!suggested.trim() || suggested === original) return "no change";
    if (suggested.length > original.length * 1.6 + 60) return "too long";
    if (FORBIDDEN.test(suggested) || /[—―]/.test(suggested)) return "forbidden wording";
    if (!/[А-Яа-яӨөҮү]/.test(suggested)) return "not Mongolian";
    const o = nums(original); for (const n of nums(suggested)) if (!o.has(n)) return "introduces a number that is not in the original";
    return null;
  }
  mockProposals(text: string): { suggested: string; reason: string; warning: string }[] {
    const out: { suggested: string; reason: string; warning: string }[] = []; let t = text; const reasons: string[] = []; let warning = "NONE";
    const fix = (re: RegExp, to: string, why: string, w = "NONE") => { if (re.test(t)) { t = t.replace(re, to); reasons.push(why); if (w !== "NONE") warning = w; } };
    fix(/хүчтэй тал/gi, "давуу тал", "Нэр томьёо: \"давуу тал\" гэж нэгдсэн хэрэглээтэй.", "TERMINOLOGY");
    fix(/анхаарах тал/gi, "сул тал", "Нэр томьёо: \"сул тал\" гэж нэгдсэн хэрэглээтэй.", "TERMINOLOGY");
    fix(/\s*[—―]\s*/g, " - ", "Урт зураасыг холбоос зураасаар солив.");
    fix(/\s{2,}/g, " ", "Давхар хоосон зайг арилгав.");
    fix(/\s+([,.;:!?])/g, "$1", "Тэмдэгтийн өмнөх илүү зайг арилгав.");
    fix(/\b(\p{L}{2,})\s+\1\b/giu, "$1", "Дараалан давтагдсан үгийг арилгав.");
    fix(/\bKPI\b/g, "хэмжүүр", "Англи нэр томьёог монгол үгээр сольсон.", "TERMINOLOGY");
    if (reasons.length) out.push({ suggested: t.trim(), reason: reasons.join(" "), warning });
    return out;
  }
  async suggest(reviewId: string, adminId: string, claimIds?: string[]) {
    const r: any = await prisma.reportReview.findUnique({ where: { id: reviewId } }); if (!r) throw new ApiError(404, "NOT_FOUND", "Олдсонгүй.");
    if (r.status === "PUBLISHED") throw new ApiError(409, "INVALID_STATE", "Нийтлэгдсэн тайланд санал үүсгэхгүй.");
    const recent = await prisma.reportReviewSuggestion.count({ where: { reviewId, createdAt: { gt: new Date(Date.now() - 3_600_000) } } });
    if (recent >= 120) throw new ApiError(429, "AI_RATE_LIMIT", "Нэг цагийн санал үүсгэх хязгаарт хүрлээ.");
    const rev = await this.latestRevision(reviewId); const claims = this.claimsOf(rev.narrative as any).filter(c => c.editable && (!claimIds || claimIds.includes(c.claimId))).slice(0, 20);
    const provider = (process.env.MMRI_AI_REPORT_PROVIDER ?? "disabled").trim().toLowerCase();
    const source = provider === "openai" && (process.env.OPENAI_API_KEY ?? "").trim() ? "PROVIDER" : "MOCK";
    if (source === "PROVIDER") throw new ApiError(501, "AI_PROVIDER_NOT_APPROVED", "Бодит AI үйлчилгээгээр засвар санал болгох нь баталгаажаагүй (зөвхөн mock горим ажиллана).");
    const created: any[] = [];
    for (const c of claims) {
      await prisma.reportReviewSuggestion.updateMany({ where: { reviewId, claimId: c.claimId, status: "PROPOSED" }, data: { status: "REJECTED", decidedAt: new Date() } });
      for (const p of this.mockProposals(c.text)) {
        const bad = this.validateSuggestion(c.text, p.suggested); if (bad) continue;
        created.push(await prisma.reportReviewSuggestion.create({ data: { reviewId, revision: rev.revision, claimId: c.claimId, original: c.text, suggested: p.suggested, reason: p.reason, evidence: [{ kind: "RULE", ref: "terminology-and-style" }] as any, warning: p.warning, source } }));
      }
    }
    return { source, created: created.length, suggestions: created };
  }
  async decideSuggestion(reviewId: string, suggestionId: string, adminId: string, role: string, action: "apply" | "reject", baseRevision?: number) {
    const s = await prisma.reportReviewSuggestion.findUnique({ where: { id: suggestionId } });
    if (!s || s.reviewId !== reviewId || s.status !== "PROPOSED") throw new ApiError(404, "NOT_FOUND", "Санал олдсонгүй эсвэл шийдэгдсэн байна.");
    if (action === "reject") { await prisma.reportReviewSuggestion.update({ where: { id: s.id }, data: { status: "REJECTED", decidedByAdminId: adminId, decidedAt: new Date() } }); return { status: "REJECTED" }; }
    const rev = await this.latestRevision(reviewId); const current = this.claimsOf(rev.narrative as any).find(c => c.claimId === s.claimId);
    if (!current || current.text !== s.original) throw new ApiError(409, "STALE_SUGGESTION", "Эх текст өөрчлөгдсөн тул санал хуучирсан байна. Дахин боловсруулна уу.");
    const bad = this.validateSuggestion(s.original, s.suggested); if (bad) throw new ApiError(422, "SUGGESTION_REJECTED", "Санал баталгаажуулалтад тэнцсэнгүй.");
    const result = await this.saveEdits(reviewId, adminId, role, baseRevision ?? rev.revision, [{ claimId: s.claimId, text: s.suggested }], `AI санал хэрэглэсэн: ${s.reason}`.slice(0, 480), "AI_APPLIED");
    await prisma.reportReviewSuggestion.update({ where: { id: s.id }, data: { status: "APPLIED", decidedByAdminId: adminId, decidedAt: new Date() } });
    return { status: "APPLIED", ...result };
  }

  // ---------- evidence viewer (read only) ----------
  async evidence(reviewId: string, filters: { categoryId?: string; state?: string; finding?: string; q?: string }) {
    const r: any = await prisma.reportReview.findUnique({ where: { id: reviewId } }); if (!r) throw new ApiError(404, "NOT_FOUND", "Олдсонгүй.");
    const assessment = await prisma.assessment.findUnique({ where: { id: r.assessmentId }, include: { methodologyVersion: { select: { version: true } } } });
    const cats: any[] = await prisma.$queryRaw`select c.id "categoryId", c."externalId" ext, c."nameMn" name, cr."partialScore", cr."officialScore", cr.confidence, cr.coverage, cr."applicableCells", cr."finalizedCells"
      from category_results cr join categories c on c.id=cr."categoryId" where cr."assessmentId"=${r.assessmentId} order by c."orderIndex"`;
    const cellRows: any[] = await prisma.$queryRaw`select dc."categoryId", dc."externalId" cell, s.status, s."normalizedScore", s.confidence, s."directAnswerCount", s."evidenceCount", s."confidenceState", s."lockReason", s."contradictionIndex"
      from assessment_cell_states s join diagnostic_cells dc on dc.id=s."cellId" where s."assessmentId"=${r.assessmentId}`;
    const answerRows: any[] = await prisma.$queryRaw`select q."categoryId", dc."externalId" cell, q.id qid, q."textMn" question, q.path, q."sourceKind", a."optionIndex", o."labelMn" answer, o.score, o.state
      from answers a join questions q on q.id=a."questionId" join diagnostic_cells dc on dc.id=q."primaryCellId" left join question_options o on o."questionId"=q.id and o."optionIndex"=a."optionIndex"
      where a."assessmentId"=${r.assessmentId} and a.active=true order by q."categoryId", dc."externalId", q.path`;
    const published: any = await this.reports.readPublishedReport(r.assessmentId).catch(() => null);
    const strengthIds = new Set((published?.payload?.strengths ?? []).map((x: any) => x.categoryId)), weakIds = new Set((published?.payload?.weaknesses ?? []).map((x: any) => x.categoryId));
    // basis: VALIDATED (met the confidence/coverage thresholds) or RELATIVE_RANK (topped up from real capability scores because too few met them, typical for QUICK mode)
    const basisOf = new Map<string, string>([...(published?.payload?.strengths ?? []), ...(published?.payload?.weaknesses ?? [])].map((x: any) => [x.categoryId, String(x.basis ?? "VALIDATED")]));
    const stateOf = (status: string, direct: number) => status === "NOT_APPLICABLE" ? "NOT_APPLICABLE" : /^DIRECT/.test(status) && direct > 0 ? "DIRECTLY_MEASURED" : /^DERIVED/.test(status) ? "INFERRED" : "INSUFFICIENT_EVIDENCE";
    const q = (filters.q ?? "").toLowerCase();
    const capabilities = cats.filter(c => (!filters.categoryId || c.categoryId === filters.categoryId) && (!filters.finding || (filters.finding === "strength" ? strengthIds.has(c.categoryId) : weakIds.has(c.categoryId))) && (!q || String(c.name).toLowerCase().includes(q))).map(c => {
      const cells = cellRows.filter(x => x.categoryId === c.categoryId).map(x => {
        const ev = answerRows.filter(a => a.categoryId === c.categoryId && a.cell === x.cell).map(a => ({ questionId: a.qid, question: a.question, path: a.path, sourceKind: a.sourceKind, optionIndex: a.optionIndex, answer: a.answer, scoreContribution: a.score === null || a.score === undefined ? null : Number(a.score), answerState: a.state }));
        return { cell: x.cell, evidenceState: stateOf(x.status, Number(x.directAnswerCount ?? 0)), methodologyStatus: x.status, score: x.normalizedScore === null ? null : Number(x.normalizedScore), confidence: x.confidence === null ? null : Number(x.confidence), confidenceState: x.confidenceState, directAnswers: Number(x.directAnswerCount ?? 0), contradictionIndex: x.contradictionIndex === null ? null : Number(x.contradictionIndex), lockReason: x.lockReason, answers: ev };
      }).filter(x => !filters.state || x.evidenceState === filters.state);
      return { categoryId: c.categoryId, code: c.ext, name: c.name, partialScore: c.partialScore === null ? null : Number(c.partialScore), officialScore: c.officialScore === null ? null : Number(c.officialScore), confidence: c.confidence === null ? null : Number(c.confidence), coverage: c.coverage === null ? null : Number(c.coverage), applicableCells: c.applicableCells, finalizedCells: c.finalizedCells, finding: strengthIds.has(c.categoryId) ? "STRENGTH" : weakIds.has(c.categoryId) ? "WEAKNESS" : null, findingBasis: basisOf.get(c.categoryId) ?? null, cellsWithEvidenceState: cells.length, cells };
    });
    return { assessmentId: r.assessmentId, domainCode: r.domainCode, methodologyVersion: assessment?.methodologyVersion?.version ?? null, note: "Зөвхөн унших. Хариулт болон тооцоолол өөрчлөгдөхгүй. Үнэлэгдээгүй нүд нь нотолгоо биш бөгөөд энд жагсаагдаагүй.", capabilities };
  }
}
void randomUUID;
