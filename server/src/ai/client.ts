import Anthropic from '@anthropic-ai/sdk';
import { env, hasAnthropic } from '../env';

let client: Anthropic | null = null;

/** Lazily-constructed Anthropic client. Callers must guard on `hasAnthropic` first. */
export function getAnthropic(): Anthropic {
  if (!hasAnthropic) throw new Error('ANTHROPIC_API_KEY is not set');
  if (!client) client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  return client;
}
