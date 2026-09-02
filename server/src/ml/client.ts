import { env } from '../env';
import { logger } from '../lib/logger';
import { toMessage } from '../lib/errors';

/** The ML service's /predict response (see ml/src/serve.py). */
export interface MlPrediction {
  recovery_probability: number;
  action_class: string;
  action_confidence: number;
  escalation_probability: number;
  anomaly_score: number;
  reason_tag: string;
  per_action_recovery: Record<string, number>;
  expected_value: Record<string, number>;
  ev_action: string;
  head_action: string;
  model: { recovery: string; action: string; escalation: string; version: string };
}

async function post<T>(path: string, body: unknown): Promise<T | null> {
  try {
    const res = await fetch(`${env.ML_SERVICE_URL}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(env.ML_TIMEOUT_MS),
    });
    if (!res.ok) {
      logger.warn('ml.error', { path, status: res.status });
      return null;
    }
    return (await res.json()) as T;
  } catch (err) {
    logger.warn('ml.unreachable', { path, error: toMessage(err) });
    return null;
  }
}

// Predict-request coalescing. /process fans out over a whole at-risk batch, and each ML call pays a
// fixed per-request overhead (network hop + framework + model dispatch) that dwarfs the actual compute
// — so N cases cost ~N×120ms serialized on the single ML replica. Instead, concurrent mlPredict() calls
// are collected within a tiny window and sent as ONE /predict/batch round-trip, amortizing that overhead
// across the batch. Transparent to callers: mlPredict keeps the same signature and per-case semantics,
// and any failure still resolves to null so the caller falls back to deterministic scoring.
interface PendingPredict {
  features: Record<string, unknown>;
  resolve: (v: MlPrediction | null) => void;
}
const PREDICT_BATCH_WINDOW_MS = 15;
const PREDICT_BATCH_MAX = 64;
let predictQueue: PendingPredict[] = [];
let predictTimer: ReturnType<typeof setTimeout> | null = null;

function flushPredict(): void {
  if (predictTimer) {
    clearTimeout(predictTimer);
    predictTimer = null;
  }
  const batch = predictQueue;
  predictQueue = [];
  if (batch.length === 0) return;
  // A lone call keeps the plain /predict path (lowest latency for one-off predictions).
  if (batch.length === 1) {
    post<MlPrediction>('/predict', batch[0]!.features)
      .then((r) => batch[0]!.resolve(r))
      .catch(() => batch[0]!.resolve(null));
    return;
  }
  post<{ predictions: (MlPrediction | null)[] }>('/predict/batch', { items: batch.map((b) => b.features) })
    .then((res) => {
      const preds = res?.predictions ?? [];
      batch.forEach((b, i) => b.resolve(preds[i] ?? null));
    })
    .catch(() => batch.forEach((b) => b.resolve(null)));
}

/** Predict for one case. Returns null if the ML service is unreachable → caller falls back.
 *  Concurrent calls are coalesced into one /predict/batch round-trip (see note above). */
export function mlPredict(features: Record<string, unknown>): Promise<MlPrediction | null> {
  return new Promise((resolve) => {
    predictQueue.push({ features, resolve });
    if (predictQueue.length >= PREDICT_BATCH_MAX) flushPredict();
    else if (!predictTimer) predictTimer = setTimeout(flushPredict, PREDICT_BATCH_WINDOW_MS);
  });
}

/**
 * Explicitly score a whole list of cases in as few round-trips as possible — the /process hot path.
 * Splits into chunks (the ML service loops per item; a huge single POST would risk the timeout) and
 * preserves input order. A failed chunk yields nulls for its slice so those cases fall back to
 * deterministic scoring, exactly like a per-case miss. This is what turns ~N serial ML calls (each
 * paying the replica's per-request overhead) into a handful of batched ones.
 */
const PREDICT_BATCH_CHUNK = 60;
export async function mlPredictBatch(featuresList: Array<Record<string, unknown>>): Promise<Array<MlPrediction | null>> {
  const out: Array<MlPrediction | null> = [];
  for (let i = 0; i < featuresList.length; i += PREDICT_BATCH_CHUNK) {
    const chunk = featuresList.slice(i, i + PREDICT_BATCH_CHUNK);
    const res = await post<{ predictions: Array<MlPrediction | null> }>('/predict/batch', { items: chunk });
    const preds = res?.predictions ?? [];
    for (let j = 0; j < chunk.length; j++) out.push(preds[j] ?? null);
  }
  return out;
}

export interface ReasonFactor {
  feature: string;
  label: string;
  category: string;
  value: string | number | null;
  impact: number;
  direction: 'increases' | 'decreases';
  weight: number;
}

export interface ExplainResult {
  available: boolean;
  action?: string;
  recovery_probability?: number;
  base_rate?: number;
  factors: ReasonFactor[];
}

/** Per-case SHAP reason codes for the recovery decision (explanatory; null if ML is unreachable). */
export function mlExplain(features: Record<string, unknown>, action?: string | null): Promise<ExplainResult | null> {
  return post<ExplainResult>('/explain', action ? { ...features, action } : features);
}

export interface WindowAnomaly {
  anomaly: boolean;
  score: number;
  contributors: Array<{ reason: string; count: number; baseline: number; z: number }>;
}

export function mlAnomalyWindow(counts: Record<string, number>): Promise<WindowAnomaly | null> {
  return post<WindowAnomaly>('/anomaly/window', { counts });
}

export async function mlHealth(): Promise<{ ok: boolean; version: string | null }> {
  try {
    const res = await fetch(`${env.ML_SERVICE_URL}/health`, { signal: AbortSignal.timeout(1500) });
    if (!res.ok) return { ok: false, version: null };
    const j = (await res.json()) as { ok: boolean; version: string | null };
    return { ok: Boolean(j.ok), version: j.version ?? null };
  } catch {
    return { ok: false, version: null };
  }
}

export async function mlMetrics(): Promise<unknown | null> {
  try {
    const res = await fetch(`${env.ML_SERVICE_URL}/metrics`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
