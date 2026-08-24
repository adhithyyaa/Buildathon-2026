-- CreateTable
CREATE TABLE "Prediction" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "modelVersion" TEXT,
    "recoveryProbability" DOUBLE PRECISION NOT NULL,
    "actionClass" "ActionType" NOT NULL,
    "calibratedConfidence" DOUBLE PRECISION,
    "escalationProbability" DOUBLE PRECISION,
    "anomalyScore" DOUBLE PRECISION,
    "reasonTag" "ReasonTag",
    "perAction" JSONB,
    "latencyMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Prediction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModelRun" (
    "id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "metrics" JSONB NOT NULL,
    "loadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModelRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnomalyFlag" (
    "id" TEXT NOT NULL,
    "windowKey" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "reason" TEXT,
    "contributors" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnomalyFlag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Prediction_caseId_idx" ON "Prediction"("caseId");

-- CreateIndex
CREATE UNIQUE INDEX "ModelRun_version_key" ON "ModelRun"("version");

-- CreateIndex
CREATE INDEX "AnomalyFlag_createdAt_idx" ON "AnomalyFlag"("createdAt");

-- AddForeignKey
ALTER TABLE "Prediction" ADD CONSTRAINT "Prediction_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
