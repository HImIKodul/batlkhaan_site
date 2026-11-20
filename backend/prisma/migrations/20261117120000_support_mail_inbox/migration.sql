-- Support mailbox import (Gmail). Additive only: two new tables, no change to existing tables.
-- Messages are stored as PLAIN TEXT (HTML is stripped before import); attachments are counted, never stored.
CREATE TABLE "support_mail_threads" (
    "id" TEXT NOT NULL,
    "gmailThreadId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "fromAddress" TEXT NOT NULL,
    "fromName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "userId" TEXT,
    "lastMessageAt" TIMESTAMP(3) NOT NULL,
    "lastInboundAt" TIMESTAMP(3),
    "lastOutboundAt" TIMESTAMP(3),
    "handledAt" TIMESTAMP(3),
    "handledByAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "support_mail_threads_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "support_mail_threads_status_check" CHECK ("status" IN ('OPEN','HANDLED')),
    CONSTRAINT "support_mail_threads_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "support_mail_threads_gmailThreadId_key" ON "support_mail_threads"("gmailThreadId");
CREATE INDEX "support_mail_threads_status_lastMessageAt_idx" ON "support_mail_threads"("status", "lastMessageAt");

CREATE TABLE "support_mail_messages" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "gmailMessageId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "fromAddress" TEXT NOT NULL,
    "toAddress" TEXT,
    "subject" TEXT,
    "bodyText" TEXT NOT NULL,
    "rfcMessageId" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL,
    "attachments" INTEGER NOT NULL DEFAULT 0,
    "adminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "support_mail_messages_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "support_mail_messages_direction_check" CHECK ("direction" IN ('INBOUND','OUTBOUND')),
    CONSTRAINT "support_mail_messages_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "support_mail_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "support_mail_messages_gmailMessageId_key" ON "support_mail_messages"("gmailMessageId");
CREATE INDEX "support_mail_messages_threadId_sentAt_idx" ON "support_mail_messages"("threadId", "sentAt");
