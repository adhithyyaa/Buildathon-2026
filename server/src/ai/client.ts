import Anthropic from '@anthropic-ai/sdk';
import { env, hasAI } from '../env';

let client: Anthropic | null = null;

/** Lazily-constructed Anthropic client. Callers must guard on `hasAI` first. */
export function getAnthropic(): Anthropic {
  if (!hasAI) throw new Error('ANTHROPIC_API_KEY is not set');
  if (!client) client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  return client;
}
