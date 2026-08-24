import { ActionType, CaseState, Channel, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { env, hasRazorpay } from '../env';
import { transition } from './state';
import { logAudit } from './audit';
import { applyDiscountPaise } from '../lib/money';
import { createPaymentLink } from '../integrations/razorpay';
import type { RecoveryPlan } from '../ai/schemas';
import type { PolicyDecision } from './policy';

const RECOVERY_TTL_HOURS = 48;

export interface ExecuteInput {
  caseId: string;
  amountPaise: number;
  currency: string;
  merchantName: string;
  customer?: { name?: string | null; email?: string | null; phone?: string | null } | null;
  plan: RecoveryPlan;
  policy: PolicyDecision;
  now: Date;
}

export interface ExecuteResult {
  actionId: string;
  finalState: CaseState;
  paymentLinkUrl?: string | null;
  simulated: boolean;
}

/**
 * Carries out exactly one policy-approved action (or records an escalation/block).
 * Only the allow-listed ActionTypes can be performed — there is no path for the
 * AI to make the executor do anything else.
 */
export async function execute(input: ExecuteInput): Promise<ExecuteResult> {
  const { caseId, policy } = input;

  if (policy.outcome === 'blocked') {
    return recordTerminalAction(input, 'no_action', 'blocked', 'manual_escalation', 'policy_block');
  }
  if (policy.outcome === 'escalate') {
    return recordTerminalAction(input, 'escalate_to_human', 'succeeded', 'manual_escalation', 'escalated');
  }

  // Approved paths.
  switch (policy.finalAction) {
    case 'smart_retry':
      return dispatchRetry(input);
    case 'send_payment_link':
    case 'offer_incentive':
      return dispatchPaymentLink(input);
    case 'send_reminder':
      return dispatchReminder(input);
    case 'no_action':
      return dispatchNoAction(input);
    case 'escalate_to_human':
      return recordTerminalAction(input, 'escalate_to_human', 'succeeded', 'manual_escalation', 'escalated');
    default:
      return recordTerminalAction(input, 'no_action', 'blocked', 'manual_escalation', 'policy_block');
  }
}

// ---------- action handlers ----------

async function dispatchRetry(input: ExecuteInput): Promise<ExecuteResult> {
  const { caseId, policy, now } = input;
  const scheduledFor = policy.scheduledFor ?? new Date(now.getTime() + 6 * 3_600_000);

  const action = await prisma.action.create({
    data: {
      caseId,
      actionType: 'smart_retry',
      channel: 'none',
      status: 'pending',
      policyPassed: true,
      policyNotes: policy.notes.join(' '),
      scheduledFor,
      payload: { retryDelayHours: input.plan.decision.retry_delay_hours },
    },
  });

  await prisma.case.update({
    where: { id: caseId },
    data: { assignedAction: 'smart_retry', attempts: { increment: 1 }, nextRetryAt: scheduledFor },
  });

  await moveToWaiting(caseId, 'retry_scheduled', {
    action: 'smart_retry',
    scheduledFor: scheduledFor.toISOString(),
    notes: policy.notes,
  });

  return { actionId: action.id, finalState: 'waiting_for_outcome', simulated: false };
}

async function dispatchPaymentLink(input: ExecuteInput): Promise<ExecuteResult> {
  const { caseId, policy, now } = input;
  const isIncentive = policy.finalAction === 'offer_incentive';
  const finalAmount = isIncentive
    ? applyDiscountPaise(input.amountPaise, policy.finalIncentivePct)
    : input.amountPaise;

  const link = await makePaymentLink(input, finalAmount);
  const deferred = Boolean(policy.scheduledFor && policy.scheduledFor.getTime() > now.getTime());
  const expiresAt = new Date(now.getTime() + RECOVERY_TTL_HOURS * 3_600_000);

  const action = await prisma.action.create({
    data: {
      caseId,
      actionType: policy.finalAction,
      channel: policy.finalChannel === 'none' ? 'email' : policy.finalChannel,
      status: 'dispatched',
      policyPassed: true,
      policyNotes: policy.notes.join(' '),
      paymentLinkId: link.id,
      paymentLinkUrl: link.url,
      incentivePct: policy.finalIncentivePct,
      messageContent: composeMessage(input.plan, link.url),
      scheduledFor: policy.scheduledFor,
      deliveryStatus: deferred ? 'scheduled' : 'sent',
      payload: { finalAmountPaise: finalAmount, incentivePct: policy.finalIncentivePct, simulated: link.simulated },
    },
  });

  await prisma.case.update({
    where: { id: caseId },
    data: { assignedAction: policy.finalAction, expiresAt },
  });

  await moveToWaiting(caseId, 'payment_link_sent', {
    action: policy.finalAction,
    channel: action.channel,
    paymentLinkUrl: link.url,
    finalAmountPaise: finalAmount,
    deferred,
    simulated: link.simulated,
    notes: policy.notes,
  });

  return { actionId: action.id, finalState: 'waiting_for_outcome', paymentLinkUrl: link.url, simulated: link.simulated };
}

async function dispatchReminder(input: ExecuteInput): Promise<ExecuteResult> {
  const { caseId, policy, now } = input;
  const deferred = Boolean(policy.scheduledFor && policy.scheduledFor.getTime() > now.getTime());
  const expiresAt = new Date(now.getTime() + RECOVERY_TTL_HOURS * 3_600_000);

  const action = await prisma.action.create({
    data: {
      caseId,
      actionType: 'send_reminder',
      channel: policy.finalChannel === 'none' ? 'email' : policy.finalChannel,
      status: 'dispatched',
      policyPassed: true,
      policyNotes: policy.notes.join(' '),
      messageContent: composeMessage(input.plan, null),
      scheduledFor: policy.scheduledFor,
      deliveryStatus: deferred ? 'scheduled' : 'sent',
      payload: { deferred },
    },
  });

  await prisma.case.update({ where: { id: caseId }, data: { assignedAction: 'send_reminder', expiresAt } });

  await moveToWaiting(caseId, 'reminder_sent', {
    action: 'send_reminder',
    channel: action.channel,
    deferred,
    notes: policy.notes,
  });

  return { actionId: action.id, finalState: 'waiting_for_outcome', simulated: false };
}

async function dispatchNoAction(input: ExecuteInput): Promise<ExecuteResult> {
  const { caseId, policy, now } = input;
  const revisitAt = new Date(now.getTime() + 6 * 3_600_000);

  const action = await prisma.action.create({
    data: {
      caseId,
      actionType: 'no_action',
      channel: 'none',
      status: 'succeeded',
      policyPassed: true,
      policyNotes: policy.notes.join(' '),
      scheduledFor: revisitAt,
      payload: { reason: 'no_action this cycle; will revisit' },
    },
  });

  await prisma.case.update({ where: { id: caseId }, data: { assignedAction: 'no_action', nextRetryAt: revisitAt } });
  await moveToWaiting(caseId, 'no_action', { revisitAt: revisitAt.toISOString(), notes: policy.notes });

  return { actionId: action.id, finalState: 'waiting_for_outcome', simulated: false };
}

async function recordTerminalAction(
  input: ExecuteInput,
  actionType: ActionType,
  status: 'blocked' | 'succeeded',
  finalState: CaseState,
  step: string,
): Promise<ExecuteResult> {
  const action = await prisma.action.create({
    data: {
      caseId: input.caseId,
      actionType,
      channel: 'none',
      status,
      policyPassed: input.policy.outcome !== 'blocked',
      policyNotes: input.policy.notes.join(' '),
      payload: {
        proposedAction: input.plan.decision.action,
        outcome: input.policy.outcome,
        incentivePct: input.policy.finalIncentivePct,
      },
    },
  });

  await prisma.case.update({ where: { id: input.caseId }, data: { assignedAction: actionType, blockedReason: input.policy.outcome === 'blocked' ? input.policy.notes.join(' ') : null } });

  await transition(input.caseId, 'manual_escalation', {
    step,
    actor: 'policy',
    details: { outcome: input.policy.outcome, notes: input.policy.notes, proposedAction: input.plan.decision.action },
  });

  return { actionId: action.id, finalState, simulated: false };
}

// ---------- helpers ----------

async function moveToWaiting(caseId: string, step: string, details: Prisma.InputJsonValue) {
  await transition(caseId, 'action_dispatched', { step, actor: 'executor', details });
  await transition(caseId, 'waiting_for_outcome', { step: 'awaiting_outcome', actor: 'system' });
}

async function makePaymentLink(input: ExecuteInput, finalAmountPaise: number) {
  if (hasRazorpay) {
    const link = await createPaymentLink({
      amountPaise: finalAmountPaise,
      description: `Recovery for ${input.merchantName}`,
      customer: {
        name: input.customer?.name ?? undefined,
        email: input.customer?.email ?? undefined,
        contact: input.customer?.phone ?? undefined,
      },
      referenceId: `case_${input.caseId}`,
      callbackUrl: `${env.PUBLIC_BASE_URL}/api/paid`,
      notes: { caseId: input.caseId },
    });
    return { id: link.id, url: link.shortUrl, simulated: false };
  }
  // Simulated link — the demo "pay" endpoint marks the case recovered.
  return {
    id: `plink_sim_${input.caseId}`,
    url: `${env.PUBLIC_BASE_URL}/api/demo/pay/${input.caseId}`,
    simulated: true,
  };
}

function composeMessage(plan: RecoveryPlan, linkUrl: string | null): string {
  const base = `${plan.message.subject}\n\n${plan.message.body}`;
  return linkUrl ? `${base}\n\nPay here: ${linkUrl}` : base;
}
