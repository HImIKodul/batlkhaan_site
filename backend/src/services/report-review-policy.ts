/* Mandatory report review, enforced inside the same database transaction that makes an assessment terminal.
   Every terminal write path calls enqueueReviewInTx, so no endpoint can finish an assessment without its review record.
   A failure here throws and rolls the completion back (fail closed). */
export const REVIEW_HOURS = 48;

export function reportReviewRequired(): boolean {
  const raw = process.env.MMRI_REPORT_REVIEW_REQUIRED;
  return raw !== undefined && (raw.toLowerCase() === "true" || raw === "1");
}

export async function enqueueReviewInTx(tx: any, assessmentId: string, force = false) {
  if (!force && !reportReviewRequired()) return null;
  const existing = await tx.reportReview.findUnique({ where: { assessmentId } });
  if (existing) return existing;
  const a = await tx.assessment.findUnique({ where: { id: assessmentId }, select: { companyId: true, domainCode: true, completedAt: true } });
  if (!a) throw new Error(`Cannot create report review: assessment ${assessmentId} not found`);
  const submittedAt = a.completedAt ?? new Date();
  const review = await tx.reportReview.create({ data: { assessmentId, companyId: a.companyId, domainCode: a.domainCode, status: "SUBMITTED", submittedAt, deadlineAt: new Date(submittedAt.getTime() + REVIEW_HOURS * 3_600_000) } });
  const company = await tx.company.findUnique({ where: { id: a.companyId }, select: { name: true } });
  await tx.adminNotification.createMany({ skipDuplicates: true, data: [{ type: "NEW_ASSESSMENT", dedupeKey: `NEW_ASSESSMENT:${review.id}`, targetType: "REVIEW", targetId: review.id, title: "Шинэ оношилгоо ирлээ", body: `${company?.name ?? "Байгууллага"} (${a.domainCode}) оношилгоогоо илгээлээ. Хянах хугацаа: ${REVIEW_HOURS} цаг.`, severity: "INFO" }] });
  return review;
}

/** One decision for every customer-facing path (read gate, export): is this assessment's derived content (scores, findings, plans, report text) withheld pending review?
    - a review exists and is not PUBLISHED: withheld.
    - no review row: historical assessments (finished before the workflow began) stay readable; one finished after it began without a review bypassed it: withheld (fail closed). */
export async function derivedContentWithheld(db: any, assessment: { id: string; completedAt: Date | null }): Promise<{ withheld: boolean; missingReview: boolean }> {
  const review = await db.reportReview.findUnique({ where: { assessmentId: assessment.id }, select: { status: true } });
  if (review) return { withheld: review.status !== "PUBLISHED", missingReview: false };
  if (!reportReviewRequired() || !assessment.completedAt) return { withheld: false, missingReview: false };
  const sinceRaw = process.env.MMRI_REPORT_REVIEW_ENFORCED_SINCE;
  const since = sinceRaw ? new Date(sinceRaw) : null;
  const first = since && !Number.isNaN(since.getTime()) ? { submittedAt: since } : await db.reportReview.findFirst({ orderBy: { submittedAt: "asc" }, select: { submittedAt: true } });
  if (!first || assessment.completedAt < first.submittedAt) return { withheld: false, missingReview: false };
  return { withheld: true, missingReview: true };
}
