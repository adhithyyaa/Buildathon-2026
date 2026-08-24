-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('payment_failed', 'checkout_abandoned', 'subscription_failed');

-- CreateEnum
CREATE TYPE "CaseState" AS ENUM ('new', 'at_risk', 'analyzed', 'action_selected', 'action_dispatched', 'waiting_for_outcome', 'recovered', 'expired', 'manual_escalation');

-- CreateEnum
CREATE TYPE "ReasonTag" AS ENUM ('insufficient_funds', 'card_declined', 'upi_collect_timeout', 'bank_downtime', 'authentication_failed', 'expired_card', 'abandoned', 'unknown');

-- CreateEnum
CREATE TYPE "ActionType" AS ENUM ('smart_retry', 'send_payment_link', 'send_reminder', 'offer_incentive', 'escalate_to_human', 'no_action');

-- CreateEnum
CREATE TYPE "ActionStatus" AS ENUM ('pending', 'dispatched', 'succeeded', 'failed', 'blocked');

-- CreateEnum
CREATE TYPE "Channel" AS ENUM ('email', 'sms', 'whatsapp', 'none');

-- CreateEnum
CREATE TYPE "OutcomeStatus" AS ENUM ('pending', 'recovered', 'unrecovered', 'expired');

-- CreateTable
CREATE TABLE "Merchant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Merchant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "externalId" TEXT,
    "name" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "optedOut" BOOLEAN NOT NULL DEFAULT false,
    "priorPayments" INTEGER NOT NULL DEFAULT 0,
    "priorConversions" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "customerId" TEXT,
    "eventType" "EventType" NOT NULL,
    "externalOrderId" TEXT,
    "externalPaymentId" TEXT,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "method" TEXT,
    "failureReason" TEXT,
    "failureCode" TEXT,
    "channel" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "dedupeKey" TEXT,
    "raw" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Case" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "customerId" TEXT,
    "state" "CaseState" NOT NULL DEFAULT 'new',
    "riskScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "urgencyScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reasonTag" "ReasonTag",
    "recoveryProbability" DOUBLE PRECISION,
    "recommendedLane" TEXT,
    "assignedAction" "ActionType",
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextRetryAt" TIMESTAMP(3),
    "blockedReason" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Case_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Decision" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "rawOutput" JSONB NOT NULL,
    "action" "ActionType",
    "confidence" DOUBLE PRECISION,
    "channel" "Channel",
    "reason" TEXT,
    "requiresHumanApproval" BOOLEAN NOT NULL DEFAULT false,
    "suggestedRetryAt" TIMESTAMP(3),
    "incentivePct" INTEGER NOT NULL DEFAULT 0,
    "valid" BOOLEAN NOT NULL DEFAULT true,
    "usedFallback" BOOLEAN NOT NULL DEFAULT false,
    "latencyMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Decision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Action" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "actionType" "ActionType" NOT NULL,
    "channel" "Channel" NOT NULL DEFAULT 'none',
    "status" "ActionStatus" NOT NULL DEFAULT 'pending',
    "policyPassed" BOOLEAN NOT NULL DEFAULT true,
    "policyNotes" TEXT,
    "payload" JSONB,
    "paymentLinkId" TEXT,
    "paymentLinkUrl" TEXT,
    "messageContent" TEXT,
    "incentivePct" INTEGER NOT NULL DEFAULT 0,
    "scheduledFor" TIMESTAMP(3),
    "deliveryStatus" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Action_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Outcome" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "status" "OutcomeStatus" NOT NULL DEFAULT 'pending',
    "recoveredAmount" INTEGER NOT NULL DEFAULT 0,
    "recoveredAt" TIMESTAMP(3),
    "recoveryMinutes" INTEGER,
    "notes" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Outcome_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "step" TEXT NOT NULL,
    "actor" TEXT NOT NULL DEFAULT 'system',
    "beforeState" TEXT,
    "afterState" TEXT,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Customer_merchantId_idx" ON "Customer"("merchantId");

-- CreateIndex
CREATE UNIQUE INDEX "Event_dedupeKey_key" ON "Event"("dedupeKey");

-- CreateIndex
CREATE INDEX "Event_merchantId_idx" ON "Event"("merchantId");

-- CreateIndex
CREATE INDEX "Event_eventType_idx" ON "Event"("eventType");

-- CreateIndex
CREATE UNIQUE INDEX "Case_eventId_key" ON "Case"("eventId");

-- CreateIndex
CREATE INDEX "Case_state_idx" ON "Case"("state");

-- CreateIndex
CREATE INDEX "Case_merchantId_idx" ON "Case"("merchantId");

-- CreateIndex
CREATE INDEX "Case_nextRetryAt_idx" ON "Case"("nextRetryAt");

-- CreateIndex
CREATE INDEX "Decision_caseId_idx" ON "Decision"("caseId");

-- CreateIndex
CREATE INDEX "Action_caseId_idx" ON "Action"("caseId");

-- CreateIndex
CREATE UNIQUE INDEX "Outcome_caseId_key" ON "Outcome"("caseId");

-- CreateIndex
CREATE INDEX "AuditLog_caseId_idx" ON "AuditLog"("caseId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Case" ADD CONSTRAINT "Case_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Case" ADD CONSTRAINT "Case_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Case" ADD CONSTRAINT "Case_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Decision" ADD CONSTRAINT "Decision_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Action" ADD CONSTRAINT "Action_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Outcome" ADD CONSTRAINT "Outcome_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
