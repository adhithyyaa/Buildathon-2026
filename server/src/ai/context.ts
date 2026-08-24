import { ReasonTag } from '@prisma/client';

/** The policy limits the AI is told about (so its proposals stay in-bounds). */
export interface PolicyEnvelope {
  maxRetries: number;
  maxDiscountPct: number;
  humanApprovalAmountPaise: number;
  quietHoursStart: number;
  quietHoursEnd: number;
  minPursuitPaise: number;
}

/** Everything the decisioner needs about one at-risk case. */
export interface DecisionContext {
  merchantName: string;
  amountPaise: number;
  currency: string;
  reasonTag: ReasonTag; // deterministic baseline classification
  method?: string | null;
  channel?: string | null;
  retryCount: number;
  ageMinutes: number;
  recoveryPrior: number; // deterministic baseline probability
  recommendedLane: string;
  customer?: {
    name?: string | null;
    priorPayments: number;
    priorConversions: number;
    optedOut: boolean;
  } | null;
  allowedActions: readonly string[];
  policy: PolicyEnvelope;
}
