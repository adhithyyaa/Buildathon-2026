import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { env, hasAnthropic, hasOpenAI } from '../env';
import { toMessage } from '../lib/errors';
import { logger } from '../lib/logger';
import { getAnthropic } from './client';
import { RecoveryPlanSchema, type RecoveryPlan } from './schemas';
import { fallbackPlan } from './fallback';
import { SYSTEM, SHAPE_HINT, buildUserPrompt } from './prompt';
import type { DecisionContext } from './context';

export type FallbackReason = 'ai_disabled' | 'ai_error' | 'ai_invalid' | null;

export interface PlanResult {
  plan: RecoveryPlan;
  source: 'ai' | 'fallback';
  valid: boolean; // did the LLM return schema-valid output?
  usedFallback: boolean;
  fallbackReason: FallbackReason;
  model: string;
  latencyMs: number;
  raw: unknown; // usage / error detail for the audit trail
}

function fallbackResult(
  ctx: DecisionContext,
  reason: FallbackReason,
  model: string,
  latencyMs: number,
  raw: unknown,
): PlanResult {
  if (reason === 'ai_error' || reason === 'ai_invalid') {
    logger.warn('ai.fallback', { reason, model, raw });
  }
  return { plan: fallbackPlan(ctx), source: 'fallback', valid: false, usedFallback: true, fallbackReason: reason, model, latencyMs, raw };
}

function aiResult(plan: RecoveryPlan, model: string, latencyMs: number, raw: unknown): PlanResult {
  return { plan, source: 'ai', valid: true, usedFallback: false, fallbackReason: null, model, latencyMs, raw };
}

/**
 * Ask an LLM for a recovery plan, always returning a usable plan. Routing:
 *   OpenAI-compatible provider (if configured) → Anthropic (if configured) → deterministic fallback.
 * The caller records `valid` / `usedFallback` so we can report JSON-validity rate.
 */
export async function proposeRecoveryPlan(ctx: DecisionContext): Promise<PlanResult> {
  if (hasOpenAI) return proposeViaOpenAI(ctx);
  if (hasAnthropic) return proposeViaAnthropic(ctx);
  return fallbackResult(ctx, 'ai_disabled', 'deterministic-fallback', 0, { note: 'no LLM configured' });
}

// ---------- Anthropic (structured output) ----------

async function proposeViaAnthropic(ctx: DecisionContext): Promise<PlanResult> {
  const started = Date.now();
  try {
    const res = await getAnthropic().messages.parse({
      model: env.AI_MODEL,
      max_tokens: 2048,
      system: SYSTEM,
      messages: [{ role: 'user', content: buildUserPrompt(ctx) }],
      output_config: { effort: 'low', format: zodOutputFormat(RecoveryPlanSchema) },
    });
    const latencyMs = Date.now() - started;
    const plan = res.parsed_output;
    if (!plan || !ctx.allowedActions.includes(plan.decision.action)) {
      return fallbackResult(ctx, 'ai_invalid', env.AI_MODEL, latencyMs, {
        note: plan ? 'action not allowed' : 'schema validation failed',
        usage: res.usage ?? null,
      });
    }
    return aiResult(plan, env.AI_MODEL, latencyMs, { usage: res.usage ?? null, stop_reason: res.stop_reason });
  } catch (err) {
    return fallbackResult(ctx, 'ai_error', env.AI_MODEL, Date.now() - started, { error: toMessage(err) });
  }
}

// ---------- OpenAI-compatible (Groq / Gemini / OpenRouter / Ollama / OpenAI) ----------

async function proposeViaOpenAI(ctx: DecisionContext): Promise<PlanResult> {
  const started = Date.now();
  const model = env.OPENAI_MODEL as string;
  const url = `${env.OPENAI_BASE_URL!.replace(/\/+$/, '')}/chat/completions`;
  const messages = [
    { role: 'system', content: `${SYSTEM}\n\n${SHAPE_HINT}` },
    { role: 'user', content: buildUserPrompt(ctx) },
  ];

  const call = (useResponseFormat: boolean) =>
    fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(env.OPENAI_API_KEY ? { authorization: `Bearer ${env.OPENAI_API_KEY}` } : {}),
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.2,
        max_tokens: 1200,
        ...(useResponseFormat ? { response_format: { type: 'json_object' } } : {}),
      }),
    });

  let useRF = true;
  const MAX_RETRIES = 4;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    let res: Response;
    try {
      res = await call(useRF);
    } catch (err) {
      return fallbackResult(ctx, 'ai_error', model, Date.now() - started, { error: toMessage(err) });
    }

    // Free-tier tokens-per-minute limits: honor the "try again in Ns" hint and retry.
    if (res.status === 429 && attempt < MAX_RETRIES) {
      await sleep(retryDelayMs(res, await res.text()));
      continue;
    }

    if (!res.ok) {
      // Some providers reject response_format — drop it once and retry.
      if (useRF && res.status === 400) {
        useRF = false;
        continue;
      }
      const body = await res.text();
      return fallbackResult(ctx, 'ai_error', model, Date.now() - started, { error: `${res.status} ${body.slice(0, 400)}` });
    }

    const data: any = await res.json();
    const content: string = data?.choices?.[0]?.message?.content ?? '';
    let parsed: unknown;
    try {
      parsed = JSON.parse(extractJson(content));
    } catch {
      return fallbackResult(ctx, 'ai_invalid', model, Date.now() - started, { note: 'non-JSON content', sample: content.slice(0, 200) });
    }

    const check = RecoveryPlanSchema.safeParse(parsed);
    if (!check.success || !ctx.allowedActions.includes(check.data.decision.action)) {
      return fallbackResult(ctx, 'ai_invalid', model, Date.now() - started, {
        note: check.success ? 'action not allowed' : 'schema validation failed',
        issues: check.success ? undefined : check.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
        output: parsed,
      });
    }
    return aiResult(check.data, model, Date.now() - started, { usage: data?.usage ?? null });
  }

  return fallbackResult(ctx, 'ai_error', model, Date.now() - started, { error: 'rate-limited: retries exhausted' });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, Math.min(Math.max(ms, 0), 8000)));
}

function retryDelayMs(res: Response, body: string): number {
  const hdr = res.headers.get('retry-after');
  if (hdr && !Number.isNaN(Number(hdr))) return Number(hdr) * 1000 + 250;
  const m = body.match(/try again in ([\d.]+)\s*s/i);
  if (m && m[1]) return Math.ceil(parseFloat(m[1]) * 1000) + 300;
  return 2000;
}

/** Pull the JSON object out of a model response that may wrap it in prose or ``` fences. */
function extractJson(s: string): string {
  let t = s.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence && fence[1]) t = fence[1].trim();
  const first = t.indexOf('{');
  const last = t.lastIndexOf('}');
  if (first >= 0 && last > first) t = t.slice(first, last + 1);
  return t;
}
