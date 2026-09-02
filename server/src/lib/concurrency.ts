/**
 * Run `fn` over `items` with at most `limit` in flight at once, preserving input order in the result.
 * Used to parallelize the demo's per-row DB work — sequential `await`s are dominated by round-trip
 * latency when the database is in another region, and bounded concurrency overlaps them safely.
 */
export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i]!, i);
    }
  }
  const n = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: n }, () => worker()));
  return results;
}
