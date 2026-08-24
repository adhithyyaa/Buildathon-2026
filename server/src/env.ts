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

  ANTHROPIC_API_KEY: z.string().optional(),
  AI_MODEL: z.string().default('claude-opus-5'),

  POLICY_MAX_RETRIES: z.coerce.number().default(3),
  POLICY_MAX_DISCOUNT_PCT: z.coerce.number().default(10),
  POLICY_HUMAN_APPROVAL_AMOUNT_PAISE: z.coerce.number().default(2_500_000),
  POLICY_QUIET_HOURS_START: z.coerce.number().default(21),
  POLICY_QUIET_HOURS_END: z.coerce.number().default(8),
  // Below this amount it isn't economical to spend gateway/outreach cost chasing recovery.
  POLICY_MIN_PURSUIT_PAISE: z.coerce.number().default(10_000),
});

export const env = EnvSchema.parse(process.env);
export const isProd = env.NODE_ENV === 'production';

/** True only when real Razorpay test-mode keys are configured. */
export const hasRazorpay = Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET);
/** True only when an Anthropic key is configured (otherwise AI layer uses deterministic fallback). */
export const hasAI = Boolean(env.ANTHROPIC_API_KEY);
