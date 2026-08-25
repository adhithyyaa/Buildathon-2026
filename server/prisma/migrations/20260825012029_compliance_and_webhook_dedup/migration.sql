-- RBI TAT compliance: a failed-but-DEBITED payment tag (awaiting T+1 auto-reversal; never re-nudge).
ALTER TYPE "ReasonTag" ADD VALUE IF NOT EXISTS 'debited_pending_reversal';

-- Webhook idempotency ledger: de-dup on x-razorpay-event-id (24h retries, no ordering guarantee).
CREATE TABLE "ProcessedWebhook" (
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProcessedWebhook_pkey" PRIMARY KEY ("eventId")
);
CREATE INDEX "ProcessedWebhook_createdAt_idx" ON "ProcessedWebhook"("createdAt");
