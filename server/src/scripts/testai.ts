/** One-off: call the AI decisioner directly and print the real error/plan. */
import { ReasonTag } from '@prisma/client';
import { env, hasAI } from '../env';
import { proposeRecoveryPlan } from '../ai/decide';
import { policyEnvelope, ALLOWED_ACTIONS } from '../pipeline/runCase';

async function main() {
  const key = env.ANTHROPIC_API_KEY ?? '';
  console.log('hasAI:', hasAI);
  console.log('model:', env.AI_MODEL);
  console.log('key length:', key.length, '| starts sk-ant:', key.startsWith('sk-ant'), '| leading space:', key !== key.trimStart(), '| trailing space:', key !== key.trimEnd());

  const r = await proposeRecoveryPlan({
    merchantName: 'UrbanKart',
    amountPaise: 149900,
    currency: 'INR',
    reasonTag: ReasonTag.card_declined,
    method: 'card',
    channel: 'checkout',
    retryCount: 0,
    ageMinutes: 30,
    recoveryPrior: 0.4,
    recommendedLane: 'fresh_link',
    customer: { name: 'Aarav Sharma', priorPayments: 5, priorConversions: 3, optedOut: false },
    allowedActions: ALLOWED_ACTIONS,
    policy: policyEnvelope(),
  });

  console.log('\nsource:', r.source, '| valid:', r.valid, '| fallbackReason:', r.fallbackReason, '| latencyMs:', r.latencyMs);
  console.log('raw:', JSON.stringify(r.raw, null, 2));
  if (r.source === 'ai') console.log('plan:', JSON.stringify(r.plan, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('THREW:', e);
    process.exit(1);
  });
