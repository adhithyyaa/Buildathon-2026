-- Recovery Lab holdout arm on each case (treatment gets ML+policy; control gets no action).
ALTER TABLE "Case" ADD COLUMN "arm" TEXT NOT NULL DEFAULT 'treatment';

-- Durable settings (e.g. the kill switch) shared across the API and the worker process.
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);
