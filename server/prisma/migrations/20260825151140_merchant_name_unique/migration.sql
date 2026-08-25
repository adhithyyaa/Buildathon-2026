-- Make Merchant.name unique so ingest can upsert atomically (no find-or-create race).
CREATE UNIQUE INDEX "Merchant_name_key" ON "Merchant"("name");
