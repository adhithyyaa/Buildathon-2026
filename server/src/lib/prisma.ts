import { PrismaClient } from '@prisma/client';

/**
 * Build the datasource URL with an explicit Prisma connection-pool size. The demo controls fan out
 * many DB operations at once (bounded-concurrency seed/process/tick), and the database is typically
 * cross-region (Supabase in another region), so throughput is round-trip-bound. Prisma's default pool
 * (num_cpus*2+1) is tiny on a 0.25-vCPU container and would serialize that fan-out; a larger pool lets
 * the overlapping round-trips actually run in parallel. `connection_limit`/`pool_timeout` are Prisma
 * client-side params (they configure Prisma's own pool, not Postgres), so appending them is safe.
 */
function datasourceUrl(): string | undefined {
  const raw = process.env.DATABASE_URL;
  if (!raw) return undefined;
  try {
    const u = new URL(raw);
    // Kept well under half the Supabase pooler size (30) so a rolling deploy — where the old and new
    // revisions run at once — never exhausts the pool and fails the new revision's boot-time migrate.
    if (!u.searchParams.has('connection_limit')) u.searchParams.set('connection_limit', '12');
    if (!u.searchParams.has('pool_timeout')) u.searchParams.set('pool_timeout', '30');
    return u.toString();
  } catch {
    return raw; // non-URL (shouldn't happen) — leave it to Prisma to validate
  }
}

const url = datasourceUrl();

/** Single shared Prisma client for the process. */
export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  ...(url ? { datasources: { db: { url } } } : {}),
});
