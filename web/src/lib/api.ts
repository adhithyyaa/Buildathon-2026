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
  ml: {
    decisions: number;
    mlServed: number;
    fallbackCount: number;
    mlServedRatePct: number | null;
    avgLatencyMs: number | null;
  };
  byState: Record<string, number>;
  byReason: Record<string, number>;
  byAction: Record<string, number>;
  funnel: Funnel;
  reasons: ReasonBreakdownRow[];
}

export interface FunnelStage {
  count: number;
  paise: number;
}

export interface Funnel {
  detected: FunnelStage;
  decided: FunnelStage;
  attempted: FunnelStage;
  inRecovery: FunnelStage;
  recovered: FunnelStage;
  lost: FunnelStage;
  controlHeld: FunnelStage;
}

export interface ReasonBreakdownRow {
  reason: string;
  cases: number;
  atRiskPaise: number;
  recoveredCases: number;
  recoveredPaise: number;
  faultOwner: 'customer' | 'bank' | 'business' | 'other';
  path: 'auto_retry' | 'fresh_link' | 'do_not_touch';
}

export interface ImpactPoint {
  t: string;
  actualPaise: number;
  baselinePaise: number;
}

export interface ImpactEvent {
  t: string;
  type: 'incident' | 'model';
  label: string;
}

export interface ImpactSeries {
  series: ImpactPoint[];
  events: ImpactEvent[];
  controlRatePct: number | null;
  incrementalPaise: number;
  resolvedCases: number;
}

export interface IncidentStatus {
  active: { reason: string; lastAt: string; score: number; count: number }[];
  windowMinutes: number;
  recent: { reason: string | null; score: number; at: string }[];
}

export interface ReasonFactor {
  feature: string;
  label: string;
  category: string;
  value: string | number | null;
  impact: number;
  direction: 'increases' | 'decreases';
  weight: number;
}

export interface CaseExplanation {
  available: boolean;
  action?: string;
  recovery_probability?: number;
  base_rate?: number;
  factors: ReasonFactor[];
}

export interface ChainVerdict {
  valid: boolean;
  total: number;
  verified: number;
  brokenAt: string | null;
}

export interface UpliftRanking {
  auuc_model: number;
  auuc_optimal: number;
  auuc_random: number;
  qini_coefficient: number;
  uplift_at_30pct: number;
}

export interface ExploreReport {
  version: string;
  method: string;
  cases: number;
  value_per_case_inr: Record<string, number>;
  ts_pct_of_oracle_final: number;
  convergence: { n: number; ts_pct_of_oracle: number }[];
  learned_best_action_accuracy: { correct: number; total: number };
  note: string;
}

export type DriftStatus = 'stable' | 'watch' | 'shift';

export interface ModelHealth {
  cases: number;
  overallStatus: DriftStatus;
  features: { feature: string; psi: number; status: DriftStatus }[];
  scoreDistribution: { bins: number[]; mean: number; count: number };
  latency: { count: number; avgMs: number; p50Ms: number; p95Ms: number; maxMs: number };
}

export interface UpliftReport {
  version: string;
  method: string;
  dataset: { observational_train: number; randomised_train: number; test: number; split: string; synthetic: boolean };
  best_treatment_ranking: { s_learner: UpliftRanking; t_learner: UpliftRanking };
  primary_learner: 's_learner' | 't_learner';
  per_action: Record<string, { s_learner: { uplift_mae: number; qini_coefficient: number }; t_learner: { uplift_mae: number; qini_coefficient: number }; true_mean_uplift: number }>;
  calibration: { ece: number; brier: number; roc_auc: number };
  policy_value_incremental_inr: Record<string, number>;
  policy_value_note: string;
  off_policy?: {
    target_policy: string;
    dr_value_inr_per_case: number;
    dr_ci95_inr: [number, number];
    ips_value_inr_per_case: number;
    ground_truth_inr_per_case: number;
    logging_policy_inr_per_case: number;
    dr_error_vs_truth_pct: number | null;
    match_rate: number;
  };
  uncertainty?: {
    method: string;
    mean_se: number;
    pct_confident_positive: number;
    mean_uplift: number;
  };
  train_seconds: number;
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
  outcome: { status: string; recoveredAmount: number; notes: string | null } | null;
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

export interface Prediction {
  id: string;
  source: string;
  model: string;
  modelVersion: string | null;
  recoveryProbability: number;
  actionClass: string;
  actionConfidence: number | null;
  escalationProbability: number | null;
  anomalyScore: number | null;
  reasonTag: string | null;
  perAction: Record<string, number> | null;
  latencyMs: number | null;
  createdAt: string;
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
  predictions: Prediction[];
  decisions: Decision[];
  actions: ActionRec[];
  auditLogs: AuditLog[];
}

export interface HealthInfo {
  ok: boolean;
  integrations: {
    razorpay: boolean;
    ai: boolean;
    aiProvider?: 'anthropic' | 'openai-compatible' | 'none';
    ml?: boolean;
    mlVersion?: string | null;
  };
}

export interface MlMetrics {
  version: string;
  dataset: { rows: number; train: number; test: number; recovered_rate: number };
  recovery: Record<string, { roc_auc: number; f1: number; brier: number } | any> & {
    primary: string;
    calibration_curve: Array<{ bin_mid: number; predicted: number; observed: number; count: number }>;
    auc_ci: Record<string, [number, number]>;
    catboost_vs_logreg: { diff_median: number; ci: [number, number]; significant: boolean };
    primary_rationale: string;
  };
  action: {
    catboost: { accuracy: number; f1_macro: number };
    xgboost: { accuracy: number; f1_macro: number };
    logistic_regression: { accuracy: number; f1_macro: number };
    top_features: Array<{ feature: string; importance: number }>;
    agreement_with_ev_argmax: number;
    classes: string[];
  };
  escalation: { catboost_calibrated: { roc_auc: number; brier: number } };
  anomaly: { window: { incident_detection_rate: number; flagged: number; windows: number } };
}

export interface ArmStat {
  cases: number;
  recovered: number;
  atRiskPaise: number;
  recoveredPaise: number;
  recoveryRatePct: number | null;
}
export interface LiftBlock {
  treatment: ArmStat;
  control: ArmStat;
  liftPct: number;
  incrementalPaise: number;
  liftCi95Pct: [number, number];
  significant: boolean;
}
export interface LabReport {
  overall: LiftBlock;
  byReason: Array<LiftBlock & { reason: string }>;
  suppressionCandidates: string[];
  totalResolved: number;
}

export interface RoundtripCapture {
  orderId: string;
  paymentId: string;
  amount: number;
  currency: string;
  status: string;
  method: string;
  captured: boolean;
  capturedAt: number | null;
  recoveredCase: { id: string; merchant: string; recoveredAt: string | null } | null;
}

// Operator token for the guarded write endpoints (pause, demo, run/approve/reject). Stored locally
// and sent as `Authorization: Bearer <t>`, matching the server's requireToken middleware. When the
// server has no RECOUP_ADMIN_TOKEN set (local dev) the endpoints are open and this is simply ignored.
const ADMIN_TOKEN_KEY = 'recoup_admin_token';
export function getAdminToken(): string {
  try {
    return localStorage.getItem(ADMIN_TOKEN_KEY) ?? '';
  } catch {
    return '';
  }
}
export function setAdminToken(token: string): void {
  try {
    if (token) localStorage.setItem(ADMIN_TOKEN_KEY, token);
    else localStorage.removeItem(ADMIN_TOKEN_KEY);
  } catch {
    /* storage unavailable — ignore */
  }
}

async function get<T>(url: string): Promise<T> {
  // Some reads (the case queue + detail) are guarded operator-only; send the token when one is set.
  const headers: Record<string, string> = {};
  const token = getAdminToken();
  if (token) headers['authorization'] = `Bearer ${token}`;
  const r = await fetch(url, { headers });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json() as Promise<T>;
}

async function post<T>(url: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  const token = getAdminToken();
  if (token) headers['authorization'] = `Bearer ${token}`;
  const r = await fetch(url, {
    method: 'POST',
    headers,
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
  caseDetail: (id: string) => get<{ case: CaseDetail; auditIntegrity: ChainVerdict }>(`/api/cases/${id}`),
  caseReasonCodes: (id: string) => get<CaseExplanation>(`/api/cases/${id}/explain`),
  runCase: (id: string) => post(`/api/cases/${id}/run`),
  approveCase: (id: string) => post(`/api/cases/${id}/approve`),
  rejectCase: (id: string) => post(`/api/cases/${id}/reject`),
  killSwitch: () => get<{ paused: boolean; reason: string | null; since: string | null }>('/api/admin/status'),
  pause: (reason?: string) => post<{ paused: boolean }>('/api/admin/pause', { reason }),
  resume: () => post<{ paused: boolean }>('/api/admin/resume'),
  seed: (count?: number) => post<{ total: number; created: number; deduped: number }>('/api/demo/seed', { count }),
  process: () => post<{ processed: number }>('/api/demo/process'),
  tick: () => post<{ recovered: number; reQueued: number; expired: number }>('/api/demo/tick?fastForward=true'),
  reset: () => post('/api/demo/reset'),
  lab: () => get<LabReport>('/api/lab'),
  labResolve: () => post<{ resolved: number; recovered: number; expired: number }>('/api/lab/resolve'),
  impact: () => get<ImpactSeries>('/api/lab/impact'),
  incidents: () => get<IncidentStatus>('/api/incidents'),
  spike: (reason?: 'upi_collect_timeout' | 'bank_downtime') =>
    post<{ created: number; deduped: number; anomaly: boolean; reasons: string[] }>('/api/demo/spike', { reason }),
  mlMetrics: () => get<MlMetrics>('/api/ml/metrics'),
  mlUplift: () => get<UpliftReport>('/api/ml/uplift'),
  modelHealth: () => get<ModelHealth>('/api/ml/monitor'),
  mlExplore: () => get<ExploreReport>('/api/ml/explore'),
  explainCase: (id: string) => post<{ text: string; source: string; llmConfigured: boolean }>(`/api/ai/cases/${id}/explain`),
  draftMessage: (id: string) => post<{ subject: string; body: string; source: string }>(`/api/ai/cases/${id}/draft-message`),
  summarizeCase: (id: string) => post<{ text: string; source: string }>(`/api/ai/cases/${id}/summarize`),
  evidence: () => get<{ captures: RoundtripCapture[] }>('/api/evidence/roundtrip'),
};
