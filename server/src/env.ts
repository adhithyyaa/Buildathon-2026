import 'dotenv/config';
import { z } from 'zod';

/**
 * Fail-fast, typed configuration. Secrets are optional so the server can boot in
 * early dev without keys; the Razorpay / AI modules check for their own keys at use time.
 */
const EnvSchema = z.object({
  NODE_ENV: z.string().default('development'),
  PORT: z.coerce.number().default(8080),
  PUBLIC_BASE_URL: z.string().default('http://localhost:8080'),
  WEB_ORIGIN: z.string().default('http://localhost:5173'),
  CURRENCY: z.string().default('INR'),

  DATABASE_URL: z.string().optional(),

  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),

  // Bearer token guarding operator/destructive endpoints (pause, reset, dispatch, approve…).
  // If unset, those endpoints are OPEN (zero-config demo); set it in production to enforce auth.
  OVERWATCH_ADMIN_TOKEN: z.string().optional(),
  // Escape hatch for a public, test-data demo: when 'true', the operator endpoints fail OPEN even in
  // production (so judges can click the demo controls / view cases without a token). Leave unset for a
  // real deployment — there, an unset OVERWATCH_ADMIN_TOKEN keeps them locked.
  OPEN_OPERATOR_ENDPOINTS: z.string().optional(),
  // Run the retry/expiry scheduler inside the API process (setInterval loop) instead of as a separate
  // `npm run worker`. Lets a single always-on API container advance retries/expiries on its own — no
  // second container — which is how the hosted deployment gets the same automatic progression as local.
  // The tick holds a single-flight DB lease, so enabling it on multiple replicas is still safe.
  RUN_WORKER: z.string().optional(),

  ANTHROPIC_API_KEY: z.string().optional(),
  AI_MODEL: z.string().default('claude-opus-5'),

  // Optional: ANY OpenAI-compatible provider (Groq, Google Gemini, OpenRouter, Ollama, OpenAI).
  // When OPENAI_BASE_URL + OPENAI_MODEL are set, this takes precedence over Anthropic.
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_BASE_URL: z.string().optional(),
  OPENAI_MODEL: z.string().optional(),

  // ML inference service (CatBoost/XGBoost/IsolationForest). Falls back to
  // deterministic scoring if the service is unreachable.
  ML_SERVICE_URL: z.string().default('http://localhost:8899'),
  ML_TIMEOUT_MS: z.coerce.number().default(4000),

  POLICY_MAX_RETRIES: z.coerce.number().default(3),
  POLICY_MAX_DISCOUNT_PCT: z.coerce.number().default(10),
  POLICY_HUMAN_APPROVAL_AMOUNT_PAISE: z.coerce.number().default(2_500_000),
  POLICY_QUIET_HOURS_START: z.coerce.number().default(21),
  POLICY_QUIET_HOURS_END: z.coerce.number().default(8),
  // Below this amount it isn't economical to spend gateway/outreach cost chasing recovery.
  POLICY_MIN_PURSUIT_PAISE: z.coerce.number().default(10_000),
  // NPCI/RBI additional-factor-auth ceiling for an auto-debit retry (₹15,000; higher for
  // MF/insurance/card-bills). Above it, an auto-retry needs a human/AFA step, not a silent retry.
  POLICY_AFA_THRESHOLD_PAISE: z.coerce.number().default(1_500_000),
});

export const env = EnvSchema.parse(process.env);
export const isProd = env.NODE_ENV === 'production';

/** True only when real Razorpay test-mode keys are configured. */
export const hasRazorpay = Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET);

/** Which LLM backend is configured (OpenAI-compatible wins if both are set). */
export const hasAnthropic = Boolean(env.ANTHROPIC_API_KEY);
export const hasOpenAI = Boolean(env.OPENAI_BASE_URL && env.OPENAI_MODEL);
/** True when ANY LLM is configured (otherwise the AI layer uses the deterministic fallback). */
export const hasAI = hasAnthropic || hasOpenAI;
export const aiProvider: 'openai-compatible' | 'anthropic' | 'none' = hasOpenAI
  ? 'openai-compatible'
  : hasAnthropic
    ? 'anthropic'
    : 'none';
