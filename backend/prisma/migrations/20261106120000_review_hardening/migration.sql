-- Review hardening (additive, no data change).
-- 1. Approval binding: publication must use exactly the revision and narrative hash that were approved.
ALTER TABLE "report_reviews" ADD COLUMN IF NOT EXISTS "approvedRevision" INTEGER;
ALTER TABLE "report_reviews" ADD COLUMN IF NOT EXISTS "approvedNarrativeHash" TEXT;

-- 2. Revisions stay append-only (UPDATE always refused). DELETE is refused too, except inside a customer data erasure
--    transaction that sets mmri.erasure = 'on' (set_config(..., true) is transaction-local). admin_audit_events keep the
--    strict trigger and are never deletable.
CREATE OR REPLACE FUNCTION mmri_revision_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('mmri.erasure', true) = 'on' THEN RETURN OLD; END IF;
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = '23514';
END; $$;
DROP TRIGGER IF EXISTS "report_review_revisions_append_only" ON "report_review_revisions";
CREATE TRIGGER "report_review_revisions_append_only" BEFORE UPDATE OR DELETE ON "report_review_revisions" FOR EACH ROW EXECUTE FUNCTION mmri_revision_guard();

-- 3. PUBLISHING is the exclusive state held while an approved report is being published (edits, returns and a second publisher are refused while it holds).
ALTER TABLE "report_reviews" DROP CONSTRAINT IF EXISTS "report_reviews_status_check";
ALTER TABLE "report_reviews" ADD CONSTRAINT "report_reviews_status_check" CHECK (status = ANY (ARRAY['SUBMITTED','GENERATING_DRAFT','AWAITING_REVIEW','IN_REVIEW','READY_FOR_APPROVAL','APPROVED','PUBLISHING','PUBLISHED','GENERATION_FAILED']));

-- 4. Company erasure deletes assessments, which cascade through these foreign keys. Without an index each deleted parent row scanned the whole child table
--    (recommendations is a 300k+ row table): erasing one full assessment took minutes and exceeded the transaction timeout. Additive indexes, no data change.
--    On a very large production table prefer building them with CREATE INDEX CONCURRENTLY outside a migration transaction first (IF NOT EXISTS makes this file a no-op afterwards).
CREATE INDEX IF NOT EXISTS "recommendations_rootFindingId_idx" ON "recommendations"("rootFindingId");
CREATE INDEX IF NOT EXISTS "action_plan_milestones_recommendationId_idx" ON "action_plan_milestones"("recommendationId");
CREATE INDEX IF NOT EXISTS "answers_respondentId_idx" ON "answers"("respondentId");
