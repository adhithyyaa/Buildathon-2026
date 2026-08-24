import { env } from '../env';
import { logger } from '../lib/logger';
import { toMessage } from '../lib/errors';

/** The ML service's /predict response (see ml/src/serve.py). */
export interface MlPrediction {
  recovery_probability: number;
  action_class: string;
  calibrated_confidence: number;
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

/** Predict for one case. Returns null if the ML service is unreachable → caller falls back. */
export function mlPredict(features: Record<string, unknown>): Promise<MlPrediction | null> {
  return post<MlPrediction>('/predict', features);
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
