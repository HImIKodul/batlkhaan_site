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

/* REPORT REVIEW WORKFLOW (48 elapsed hours, never auto-approved).
   SUBMITTED -> GENERATING_DRAFT -> AWAITING_REVIEW -> IN_REVIEW <-> READY_FOR_APPROVAL -> APPROVED -> PUBLISHING -> PUBLISHED   (GENERATION_FAILED can retry)
   Only the narrative text layer is editable. Answers, scores, methodology, snapshots, question ids and the frozen payload are never touched.
   Every edit is an append-only revision (database trigger). Publication writes the approved revision into the report snapshot narrative with a fresh
   hash, regenerates the PDF from that same content and refuses to publish unless the PDF has exactly three pages. */
export const REVIEW_HOURS = POLICY_REVIEW_HOURS;
export type ReviewStatus = "SUBMITTED" | "GENERATING_DRAFT" | "AWAITING_REVIEW" | "IN_REVIEW" | "READY_FOR_APPROVAL" | "APPROVED" | "PUBLISHING" | "PUBLISHED" | "GENERATION_FAILED";
export const OPEN_STATUSES: ReviewStatus[] = ["SUBMITTED", "GENERATING_DRAFT", "AWAITING_REVIEW", "IN_REVIEW", "READY_FOR_APPROVAL", "GENERATION_FAILED"];
const TRANSITIONS: Record<string, ReviewStatus[]> = {
  SUBMITTED: ["GENERATING_DRAFT"], GENERATING_DRAFT: ["AWAITING_REVIEW", "GENERATION_FAILED"], GENERATION_FAILED: ["GENERATING_DRAFT"],
  AWAITING_REVIEW: ["IN_REVIEW"], IN_REVIEW: ["READY_FOR_APPROVAL"], READY_FOR_APPROVAL: ["IN_REVIEW", "APPROVED"], APPROVED: ["PUBLISHING", "IN_REVIEW"], PUBLISHING: ["PUBLISHED", "APPROVED"], PUBLISHED: []
};
export const CUSTOMER_PENDING_MESSAGE = "Таны оношилгооны хариултыг хүлээн авлаа. Тайланг боловсруулж, хянаж байна. Тайлан ойролцоогоор 48 цагийн дотор бэлэн болох бөгөөд баталгаажмагц танд мэдэгдэнэ.";
const FORBIDDEN = /хүчтэй тал|анхаарах тал/i;
const noDash = (t: string) => t.replace(/\s*[—―]\s*/g, " - ");
const nums = (t: string) => new Set((t.match(/\d+(?:[.,]\d+)?/g) ?? []).map(x => x.replace(",", ".")));

export class ReviewService {
  constructor(private readonly config: ApiConfig, private readonly reports: PrismaStrategyReportService) {}

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
    const r = await prisma.reportReview.findUnique({ where: { assessmentId } });
    if (!r) return { reviewRequired: false, state: "LEGACY_AVAILABLE", available: true };
    const published = r.status === "PUBLISHED";
    return { reviewRequired: true, state: published ? "PUBLISHED" : "PENDING_REVIEW", available: published, submittedAt: r.submittedAt, estimatedAvailableAt: published ? null : r.deadlineAt, publishedAt: r.publishedAt,
      message: published ? "Тайлан бэлэн боллоо." : CUSTOMER_PENDING_MESSAGE, note: published ? null : "Энэ нь тооцоолсон хугацаа бөгөөд баталгаа биш. Тайлан баталгаажмагц мэдэгдэнэ." };
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
  claimsOf(n: NarrativeDraft) { return n.sections.flatMap(s => s.claims.map(c => ({ sectionId: s.id, sectionTitle: s.titleMn, claimId: c.reportClaimId!, claimType: c.claimType, text: c.textMn }))); }
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
    if (!["IN_REVIEW", "READY_FOR_APPROVAL", "APPROVED"].includes(review.status)) throw new ApiError(409, "INVALID_STATE", "Энэ төлөвт тайланг засах боломжгүй. Эхлээд хяналтыг авна уу.");
    if (review.assignedAdminId && review.assignedAdminId !== adminId && role !== "SUPER_ADMIN") throw new ApiError(409, "ASSIGNED_TO_OTHER", "Энэ тайланг өөр хянагч хянаж байна.");
  }
  async claim(reviewId: string, adminId: string, role: string) {
    const r = await prisma.reportReview.findUnique({ where: { id: reviewId } });
    if (!r) throw new ApiError(404, "NOT_FOUND", "Хяналтын даалгавар олдсонгүй.");
    if (r.status === "AWAITING_REVIEW") { if (!(await this.setStatus(reviewId, ["AWAITING_REVIEW"], "IN_REVIEW", { assignedAdminId: adminId }))) throw new ApiError(409, "CONFLICT", "Өөр хянагч аль хэдийн авсан байна."); }
    else if (r.status === "IN_REVIEW" || r.status === "READY_FOR_APPROVAL") { if (r.assignedAdminId && r.assignedAdminId !== adminId && role !== "SUPER_ADMIN") throw new ApiError(409, "ASSIGNED_TO_OTHER", "Энэ тайланг өөр хянагч хянаж байна."); await prisma.reportReview.update({ where: { id: reviewId }, data: { assignedAdminId: adminId, version: { increment: 1 } } }); }
    else throw new ApiError(409, "INVALID_STATE", "Энэ төлөвт хяналтыг авах боломжгүй.");
    await this.notify("REVIEW_ASSIGNED", `REVIEW_ASSIGNED:${reviewId}:${adminId}`, { type: "REVIEW", id: reviewId }, "Хяналт хуваарилагдлаа", "Тайлангийн хяналтыг хянагч авлаа.");
  }
  async saveEdits(reviewId: string, adminId: string, role: string, baseRevision: number, edits: { claimId: string; text: string }[], reason: string, source: "MANUAL" | "AI_APPLIED" | "RESTORED" = "MANUAL", replaceNarrative?: NarrativeDraft) {
    if (!Number.isInteger(baseRevision)) throw new ApiError(400, "BAD_REQUEST", "baseRevision шаардлагатай.");
    if (!reason || reason.trim().length < 3 || reason.length > 500) throw new ApiError(400, "REASON_REQUIRED", "Засварын шалтгааныг 3-500 тэмдэгтээр бичнэ үү.");
    const review: any = await prisma.reportReview.findUnique({ where: { id: reviewId } });
    if (!review) throw new ApiError(404, "NOT_FOUND", "Хяналтын даалгавар олдсонгүй.");
    this.assertCanEdit(review, adminId, role);
    if (review.currentRevision !== baseRevision) throw new ApiError(409, "REVISION_CONFLICT", "Өөр хувилбар хадгалагдсан байна. Хуудсыг шинэчилж өөрчлөлтөө дахин шалгана уу.", { currentRevision: review.currentRevision });
    const latest = await this.latestRevision(reviewId);
    const narrative: NarrativeDraft = replaceNarrative ?? JSON.parse(JSON.stringify(latest.narrative));
    const changed: string[] = [];
    if (!replaceNarrative) for (const e of edits) {
      const text = noDash(String(e.text ?? "")).trim();
      if (!text || text.length > 4000) throw new ApiError(400, "BAD_TEXT", "Текст хоосон эсвэл хэт урт байна (дээд тал нь 4000 тэмдэгт).");
      let found = false;
      for (const s of narrative.sections) for (const c of s.claims) if (c.reportClaimId === e.claimId) { found = true; if (c.textMn !== text) { c.textMn = text; changed.push(e.claimId); } }
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
    this.assertCanEdit(r, adminId, role);
    if (!(await this.setStatus(reviewId, ["IN_REVIEW"], "READY_FOR_APPROVAL"))) throw new ApiError(409, "INVALID_STATE", "Энэ төлөвөөс батлахад бэлэн болгох боломжгүй.");
  }
  async returnToReview(reviewId: string, adminId: string, role: string) {
    const r: any = await prisma.reportReview.findUnique({ where: { id: reviewId } }); if (!r) throw new ApiError(404, "NOT_FOUND", "Олдсонгүй.");
    if (!(await this.setStatus(reviewId, ["READY_FOR_APPROVAL", "APPROVED"], "IN_REVIEW", { approvedAt: null, approvedByAdminId: null, approvedRevision: null, approvedNarrativeHash: null }))) throw new ApiError(409, "INVALID_STATE", "Энэ төлөвөөс буцаах боломжгүй.");
    void adminId; void role;
  }
  async restore(reviewId: string, adminId: string, role: string, baseRevision: number, revision: number) {
    const rev = await prisma.reportReviewRevision.findUnique({ where: { reviewId_revision: { reviewId, revision } } });
    if (!rev) throw new ApiError(404, "NOT_FOUND", "Хувилбар олдсонгүй.");
    return this.saveEdits(reviewId, adminId, role, baseRevision, [], `Хувилбар ${revision}-г сэргээв`, "RESTORED", rev.narrative as any);
  }

  // ---------- approval and publication ----------
  async approve(reviewId: string, adminId: string, baseRevision: number) {
    const r: any = await prisma.reportReview.findUnique({ where: { id: reviewId } }); if (!r) throw new ApiError(404, "NOT_FOUND", "Олдсонгүй.");
    if (r.status !== "READY_FOR_APPROVAL") throw new ApiError(409, "INVALID_STATE", "Зөвхөн \"Батлахад бэлэн\" төлөвтэй тайланг батална.");
    if (r.currentRevision !== baseRevision) throw new ApiError(409, "REVISION_CONFLICT", "Хувилбар өөрчлөгдсөн байна. Хуудсыг шинэчилнэ үү.", { currentRevision: r.currentRevision });
    const rev = await this.latestRevision(reviewId);
    if (rev.revision !== baseRevision) throw new ApiError(409, "REVISION_CONFLICT", "Хувилбар өөрчлөгдсөн байна. Хуудсыг шинэчилнэ үү.", { currentRevision: rev.revision });
    // Publishable = exactly the state the customer report page accepts (validation.state === "PASS"). REPAIR_REQUIRED would be approved here and then refused to the customer.
    const v = await this.validate(r.assessmentId, rev.narrative as any);
    if (v.state !== "PASS") throw new ApiError(422, v.state === "GENERATION_BLOCKED" ? "VALIDATION_BLOCKED" : "VALIDATION_NOT_PUBLISHABLE", v.state === "GENERATION_BLOCKED" ? "Тайлан баталгаажуулалтад тэнцсэнгүй (тооцоолсон баримтаас зөрсөн агуулга)." : "Тайлан баталгаажуулалтыг бүрэн давах хүртэл батлах боломжгүй (засвар шаардлагатай).", { state: v.state, issues: v.issues.slice(0, 8) });
    await this.assertPdfBudget(r.assessmentId, rev.narrative as any);
    const flat = JSON.stringify(rev.narrative);
    if (FORBIDDEN.test(flat) || /[—―]/.test(flat)) throw new ApiError(422, "TERMINOLOGY", "Тайланд хориглосон нэр томьёо эсвэл урт зураас үлдсэн байна.");
    // The approval records the exact revision and narrative hash; publication refuses anything else.
    const ok = await prisma.reportReview.updateMany({ where: { id: reviewId, status: "READY_FOR_APPROVAL", currentRevision: baseRevision }, data: { status: "APPROVED", approvedAt: new Date(), approvedByAdminId: adminId, approvedRevision: rev.revision, approvedNarrativeHash: sha256Json(rev.narrative), version: { increment: 1 } } });
    if (ok.count !== 1) throw new ApiError(409, "CONFLICT", "Зэрэгцээ өөрчлөлт илэрлээ.");
    await this.notify("REPORT_APPROVED", `REPORT_APPROVED:${reviewId}:${baseRevision}`, { type: "REVIEW", id: reviewId }, "Тайлан батлагдлаа", "Тайлан батлагдсан, нийтлэхэд бэлэн.");
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
    const before = { narrative: snap.narrative, narrativeHash: snap.narrativeHash, validation: snap.validation };
    await prisma.reportSnapshot.update({ where: { id: snap.id }, data: { narrative: narrative as any, narrativeHash: approvedHash, validation: v as any } });
    try {
      const artifact: any = await this.reports.getOrCreateReportPdf(r.assessmentId, true);
      const pages = Number(/Pages:\s+(\d+)/.exec(execFileSync("pdfinfo", [artifact.absolutePath], { encoding: "utf8" }))?.[1] ?? 0);
      if (pages !== 3) throw new Error(`PDF has ${pages} pages, expected exactly 3`);
      const web: any = await this.reports.readPublishedReport(r.assessmentId); // proves web report hash consistency
      if (sha256Json(web.narrative) !== approvedHash) throw new Error("Published web report differs from the approved narrative");
      const done = await prisma.reportReview.updateMany({ where: { id: reviewId, status: "PUBLISHING", currentRevision: r.approvedRevision, approvedNarrativeHash: approvedHash }, data: { status: "PUBLISHED", publishedAt: new Date(), publishedByAdminId: adminId, publishedRevision: rev.revision, lastError: null, version: { increment: 1 } } });
      if (done.count !== 1) throw new Error("Review changed during publication");
    } catch (e: any) {
      await prisma.reportSnapshot.update({ where: { id: snap.id }, data: { narrative: before.narrative as any, narrativeHash: before.narrativeHash, validation: before.validation as any } });
      try { await this.reports.getOrCreateReportPdf(r.assessmentId, true); } catch { /* previous artifact is regenerated lazily */ }
      await this.abortPublish(reviewId, String(e?.message ?? e));
      throw new ApiError(500, "PUBLISH_FAILED", "Нийтлэх үед алдаа гарлаа. Өөрчлөлт буцаагдлаа, тайлан нийтлэгдээгүй.");
    }
    await this.notify("REPORT_PUBLISHED", `REPORT_PUBLISHED:${reviewId}`, { type: "REVIEW", id: reviewId }, "Тайлан нийтлэгдлээ", "Тайлан хэрэглэгчид нээлттэй боллоо. (Имэйл илгээлт тохируулагдаагүй: хэрэглэгчид системд мэдэгдэнэ.)");
    return { publishedRevision: rev.revision };
  }

  // ---------- 24/36/44 hour reminders, 48 hour overdue, stuck drafts (idempotent) ----------
  async maintenance(now = new Date()) {
    const out = { reminders: 0, overdue: 0, retried: 0 };
    // A publication that died mid-way (crash/restart) is released back to APPROVED; publishing again is idempotent and re-checks the approval binding.
    await prisma.reportReview.updateMany({ where: { status: "PUBLISHING", updatedAt: { lt: new Date(now.getTime() - 10 * 60_000) } }, data: { status: "APPROVED" } });
    // A draft job that has been running for over 10 minutes is considered dead (crash/restart): release it, then retry.
    await prisma.reportReview.updateMany({ where: { status: "GENERATING_DRAFT", updatedAt: { lt: new Date(now.getTime() - 10 * 60_000) } }, data: { status: "SUBMITTED" } });
    const stuck = await prisma.reportReview.findMany({ where: { status: "SUBMITTED", updatedAt: { lt: new Date(now.getTime() - 2 * 60_000) } }, select: { id: true } });
    for (const s of stuck) { void this.generateDraft(s.id); out.retried++; }
    const open = await prisma.reportReview.findMany({ where: { status: { in: OPEN_STATUSES as any } } });
    for (const r of open) {
      const hours = (now.getTime() - r.submittedAt.getTime()) / 3_600_000;
      for (const h of [24, 36, 44]) if (hours >= h && hours < REVIEW_HOURS && (await this.notify("DEADLINE_APPROACHING", `REMIND${h}:${r.id}`, { type: "REVIEW", id: r.id }, `Хянах хугацаа дөхөж байна (${h} цаг)`, `Тайлан илгээгдсэнээс хойш ${h} цаг өнгөрлөө. Хугацаа: ${REVIEW_HOURS} цаг.`, h >= 44 ? "HIGH" : "WARN"))) out.reminders++;
      if (hours >= REVIEW_HOURS && (await this.notify("REVIEW_OVERDUE", `OVERDUE48:${r.id}`, { type: "REVIEW", id: r.id }, "Хянах хугацаа хэтэрлээ", `Тайлан ${REVIEW_HOURS} цагаас илүү хянагдаагүй байна. Автоматаар батлагдахгүй.`, "CRITICAL"))) out.overdue++;
    }
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
    const rev = await this.latestRevision(reviewId); const claims = this.claimsOf(rev.narrative as any).filter(c => !claimIds || claimIds.includes(c.claimId)).slice(0, 20);
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
