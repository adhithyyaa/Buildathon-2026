/**
 * Turn any thrown value into a useful string. External SDKs (Razorpay) throw
 * plain objects, not Error instances, which otherwise serialize to "[object Object]".
 */
export function toMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === 'object') {
    const o = err as Record<string, any>;
    // Razorpay SDK error shape: { statusCode, error: { code, description, ... } }
    if (o.error?.description) return `${o.error.code ?? ''} ${o.error.description}`.trim();
    if (o.statusCode) return `HTTP ${o.statusCode}: ${safeJson(o.error ?? o)}`;
    return safeJson(o);
  }
  return String(err);
}

function safeJson(v: unknown): string {
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}
