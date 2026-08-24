// Types mirror the server JSON responses (dates arrive as ISO strings).

export interface Metrics {
  totalCases: number;
  grossAtRiskPaise: number;
  recoveredCount: number;
  recoveredPaise: number;
  recoveryRatePct: number;
  activeCount: number;
  escalatedCount: number;
  expiredCount: number;
  blockedActionCount: number;
  actionSuccessRatePct: number | null;
  avgTimeToRecoveryMin: number | null;
  impact: {
    recoveredPaise: number;
    inProgressPaise: number;
    lostPaise: number;
  };
  ai: {
    decisions: number;
    validCount: number;
    jsonValidityRatePct: number | null;
    fallbackCount: number;
    avgLatencyMs: number | null;
  };
  byState: Record<string, number>;
  byReason: Record<string, number>;
  byAction: Record<string, number>;
}

export interface CaseRow {
  id: string;
  state: string;
  riskScore: number;
  urgencyScore: number;
  reasonTag: string | null;
  recoveryProbability: number | null;
  recommendedLane: string | null;
  assignedAction: string | null;
  amount: number;
  currency: string;
  attempts: number;
  createdAt: string;
  blockedReason: string | null;
  merchant: { name: string };
  customer: { name: string | null; email: string | null; optedOut: boolean } | null;
  outcome: { status: string; recoveredAmount: number } | null;
  event: { method: string | null; failureReason: string | null; channel: string | null; eventType: string; createdAt: string };
}

export interface Decision {
  id: string;
  model: string;
  kind: string;
  rawOutput: any;
  action: string | null;
  confidence: number | null;
  channel: string | null;
  reason: string | null;
  requiresHumanApproval: boolean;
  suggestedRetryAt: string | null;
  incentivePct: number;
  valid: boolean;
  usedFallback: boolean;
  latencyMs: number | null;
  createdAt: string;
}

export interface ActionRec {
  id: string;
  actionType: string;
  channel: string;
  status: string;
  policyPassed: boolean;
  policyNotes: string | null;
  payload: any;
  paymentLinkId: string | null;
  paymentLinkUrl: string | null;
  messageContent: string | null;
  incentivePct: number;
  scheduledFor: string | null;
  deliveryStatus: string | null;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  step: string;
  actor: string;
  beforeState: string | null;
  afterState: string | null;
  details: any;
  createdAt: string;
}

export interface Outcome {
  id: string;
  status: string;
  recoveredAmount: number;
  recoveredAt: string | null;
  recoveryMinutes: number | null;
  notes: string | null;
}

export interface CaseDetail {
  id: string;
  state: string;
  riskScore: number;
  urgencyScore: number;
  reasonTag: string | null;
  recoveryProbability: number | null;
  recommendedLane: string | null;
  assignedAction: string | null;
  amount: number;
  currency: string;
  attempts: number;
  nextRetryAt: string | null;
  expiresAt: string | null;
  blockedReason: string | null;
  createdAt: string;
  merchant: { name: string };
  customer: {
    name: string | null;
    email: string | null;
    phone: string | null;
    optedOut: boolean;
    priorPayments: number;
    priorConversions: number;
  } | null;
  event: {
    eventType: string;
    method: string | null;
    failureReason: string | null;
    failureCode: string | null;
    channel: string | null;
    amount: number;
    createdAt: string;
  };
  outcome: Outcome | null;
  decisions: Decision[];
  actions: ActionRec[];
  auditLogs: AuditLog[];
}

export interface HealthInfo {
  ok: boolean;
  integrations: { razorpay: boolean; ai: boolean; aiProvider?: 'anthropic' | 'openai-compatible' | 'none' };
}

async function get<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json() as Promise<T>;
}

async function post<T>(url: string, body?: unknown): Promise<T> {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json() as Promise<T>;
}

export const api = {
  health: () => get<HealthInfo>('/health'),
  metrics: () => get<Metrics>('/api/metrics'),
  cases: (params: { state?: string; limit?: number } = {}) => {
    const q = new URLSearchParams();
    if (params.state) q.set('state', params.state);
    if (params.limit) q.set('limit', String(params.limit));
    return get<{ cases: CaseRow[] }>(`/api/cases?${q.toString()}`);
  },
  caseDetail: (id: string) => get<{ case: CaseDetail }>(`/api/cases/${id}`),
  runCase: (id: string) => post(`/api/cases/${id}/run`),
  approveCase: (id: string) => post(`/api/cases/${id}/approve`),
  seed: (count?: number) => post<{ total: number; created: number; deduped: number }>('/api/demo/seed', { count }),
  process: () => post<{ processed: number }>('/api/demo/process'),
  tick: () => post<{ recovered: number; reQueued: number; expired: number }>('/api/demo/tick?fastForward=true'),
  reset: () => post('/api/demo/reset'),
};
