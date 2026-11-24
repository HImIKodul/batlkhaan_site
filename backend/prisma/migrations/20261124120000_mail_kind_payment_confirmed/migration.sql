-- Additive: the lifecycle mail dispatcher may also claim the payment confirmation mail. No data changes; every existing row stays valid.
-- Rollback (only when no PAYMENT_CONFIRMED row exists): drop the constraint and add it again with the previous four values.
ALTER TABLE "mail_dispatch_marks" DROP CONSTRAINT "mail_dispatch_marks_kind_check";
ALTER TABLE "mail_dispatch_marks" ADD CONSTRAINT "mail_dispatch_marks_kind_check" CHECK ("kind" IN ('ASSESSMENT_COMPLETED','REPORT_UNDER_REVIEW','REPORT_RELEASED','ADMIN_REVIEW_ALERT','PAYMENT_CONFIRMED'));
