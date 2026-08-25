-- Rename Prediction.calibratedConfidence -> actionConfidence.
-- The value stored here is the action head's uncalibrated softmax, NOT a calibrated
-- probability; the calibrated number lives in recoveryProbability. Renamed so the
-- column name matches what it holds (a code-reading reviewer would catch the mismatch).
ALTER TABLE "Prediction" RENAME COLUMN "calibratedConfidence" TO "actionConfidence";
