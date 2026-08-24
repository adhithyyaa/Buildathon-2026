import { env, hasOpenAI, hasAnthropic } from '../env';
import { toMessage } from '../lib/errors';
import { logger } from '../lib/logger';

/** The LLM is now used ONLY for text: explanations, message drafts, escalation summaries. */
export const hasLLM = hasOpenAI || hasAnthropic;

export async function llmText(system: string, user: string, maxTokens = 300): Promise<string | null> {
  if (hasOpenAI) return openaiText(system, user, maxTokens);
  if (hasAnthropic) return anthropicText(system, user, maxTokens);
  return null;
}

async function openaiText(system: string, user: string, maxTokens: number): Promise<string | null> {
  try {
    const res = await fetch(`${env.OPENAI_BASE_URL!.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(env.OPENAI_API_KEY ? { authorization: `Bearer ${env.OPENAI_API_KEY}` } : {}) },
      body: JSON.stringify({
        model: env.OPENAI_MODEL,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        temperature: 0.4,
        max_tokens: maxTokens,
      }),
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) {
      logger.warn('llm.error', { status: res.status });
      return null;
    }
    const data: any = await res.json();
    const text = String(data?.choices?.[0]?.message?.content ?? '').trim();
    return text || null;
  } catch (err) {
    logger.warn('llm.unreachable', { error: toMessage(err) });
    return null;
  }
}

async function anthropicText(system: string, user: string, maxTokens: number): Promise<string | null> {
  try {
    const { getAnthropic } = await import('./client');
    const res = await getAnthropic().messages.create({
      model: env.AI_MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: user }],
    });
    const block = res.content.find((b) => b.type === 'text');
    return block && 'text' in block ? String(block.text).trim() || null : null;
  } catch (err) {
    logger.warn('llm.unreachable', { error: toMessage(err) });
    return null;
  }
}
