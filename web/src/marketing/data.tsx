import { useEffect, useState } from 'react';
import { api } from '../lib/api';

/**
 * Marketing content + the live-proof hook. Every headline number on the public site can read from the
 * live Recovery Lab, so the pitch and the dashboard never disagree; until the lab has a resolved
 * control arm it falls back to a clearly-labelled illustrative set (never a stale number as live).
 */

export const NAV = [
  { label: 'Home', to: '/' },
  { label: 'Features', to: '/features' },
  { label: 'About', to: '/about' },
] as const;

export interface LiveProof {
  live: boolean;
  liftPct: number;
  incrementalPaise: number;
  treatPct: number;
  controlPct: number;
  significant: boolean;
  recoveredPaise: number;
  recoveredCount: number;
  totalCases: number;
}

export const ILLUSTRATIVE: LiveProof = {
  live: false,
  liftPct: 40.2,
  incrementalPaise: 31377300,
  treatPct: 59,
  controlPct: 19,
  significant: true,
  recoveredPaise: 35847000,
  recoveredCount: 65,
  totalCases: 121,
};

export function useLiveProof(): LiveProof {
  const [proof, setProof] = useState<LiveProof>(ILLUSTRATIVE);
  useEffect(() => {
    Promise.all([api.lab(), api.metrics()])
      .then(([lab, m]) => {
        const o = lab.overall;
        if (lab.totalResolved > 0 && o.control.cases > 0) {
          setProof({
            live: true,
            liftPct: o.liftPct,
            incrementalPaise: o.incrementalPaise,
            treatPct: Math.round(o.treatment.recoveryRatePct ?? 0),
            controlPct: Math.round(o.control.recoveryRatePct ?? 0),
            significant: o.significant,
            recoveredPaise: m.recoveredPaise,
            recoveredCount: m.recoveredCount,
            totalCases: m.totalCases,
          });
        }
      })
      .catch(() => {});
  }, []);
  return proof;
}

/** Payment rails Overwatch works across — shown as a neutral capability strip, not customer logos. */
export const RAILS = ['Razorpay', 'UPI', 'Visa', 'Mastercard', 'RuPay', 'Netbanking', 'NPCI'] as const;

/** The three-step spine of the product (Finvora's Connect/Understand/Plan → Detect/Decide/Prove). */
export const STEPS = [
  {
    key: 'detect',
    icon: 'signal',
    tab: 'Detect',
    title: 'Detect every failed payment as it happens',
    body: 'Failed captures and abandoned checkouts stream in from Razorpay, get de-duplicated, and are scored for risk and urgency — deterministically, before any model runs. Nothing slips through, and nothing is counted twice.',
    points: ['Signed webhook ingestion, exactly-once', 'Per-reason risk + urgency scoring', 'Live failure-spike (outage) detection'],
  },
  {
    key: 'decide',
    icon: 'model',
    tab: 'Decide',
    title: 'Decide the safest recovery move',
    body: 'A calibrated model ranks the next-best action by expected value — smart retry, a fresh payment link, a reminder, or a bounded incentive. Then a deterministic policy engine approves, blocks, or escalates it inside hard guardrails.',
    points: ['CatBoost recovery + action scoring', 'Retry caps, quiet hours, opt-out, RBI/AFA rules', 'ML proposes; code disposes — no model moves money'],
  },
  {
    key: 'prove',
    icon: 'lab',
    tab: 'Prove',
    title: 'Prove the incremental rupees',
    body: 'A randomised control holdout runs continuously, so the Recovery Lab reports the rupees you recovered over doing nothing — with a 95% confidence interval, sliced per reason — and auto-suppresses any reason that can’t beat the control.',
    points: ['20% no-action control arm', 'Treatment-minus-control lift, 95% CI', 'Tamper-evident, hash-chained audit ledger'],
  },
] as const;

export const FEATURES = [
  { icon: 'bolt', title: 'ML decisioning', body: 'CatBoost scores every case — calibrated recovery probability, the next-best action, and per-action odds — benchmarked against XGBoost and a baseline, stated honestly.' },
  { icon: 'shield', title: 'Bounded policy engine', body: 'ML proposes; a deterministic policy disposes. Retry caps, quiet hours, opt-out, AFA & RBI-TAT rules — enforced in code. No model ever touches money.' },
  { icon: 'lab', title: 'Recovery Lab', body: 'A 20% no-action control holdout measures the incremental rupees over doing nothing — with a 95% CI, sliced per reason. The number nobody else publishes.' },
  { icon: 'link', title: 'Signed webhooks', body: 'HMAC-verified deliveries and exactly-once recovery on the money path. A payment is only ever booked recovered on a real, signed capture.' },
  { icon: 'signal', title: 'Anomaly detection', body: 'Isolation-forest failure-spike detection flags a live bank or UPI outage and defers retries before they add to the storm.' },
  { icon: 'audit', title: 'Tamper-evident ledger', body: 'Every state transition is SHA-256 hash-chained and append-only at the database — so every recovery is provable, replayable, and impossible to quietly rewrite.' },
] as const;

export const INTEGRATIONS = [
  { icon: 'link', name: 'Razorpay', body: 'Orders, payment links and Checkout — Overwatch reads failures and books recoveries through the API you already run.', link: 'Money path' },
  { icon: 'transfer', name: 'UPI · NPCI', body: 'Collect and intent flows, with retry timing tuned to NPCI’s rules and cooling-off windows.', link: 'Rail rules' },
  { icon: 'receipt', name: 'Cards', body: 'Visa, Mastercard & RuPay declines, retried within additional-factor-auth and network limits.', link: 'Retry policy' },
  { icon: 'signal', name: 'Netbanking', body: 'Bank downtime windows are detected and routed around automatically, then resumed when they clear.', link: 'Outage defer' },
  { icon: 'shield', name: 'Signed webhooks', body: 'HMAC-verified deliveries and exactly-once recovery on every capture — secrets never touch the client.', link: 'Security' },
  { icon: 'mail', name: 'Slack & email', body: 'Failure-spike alerts and a daily recovery digest, delivered where your team already works.', link: 'Alerts' },
] as const;

/** Proof-wall cards — the honest analog of a testimonial grid: real system facts + design principles,
 *  attributed to the part of Overwatch that guarantees them (never to fabricated customers). */
export const PRINCIPLES = [
  { initials: 'RL', who: 'Recovery Lab', quote: 'We report the lift over a live control holdout with a 95% CI — the incremental rupees, never gross recoveries.' },
  { initials: 'PE', who: 'Policy Engine', quote: 'ML proposes, deterministic code disposes. Retry caps, quiet hours and RBI limits are enforced in code — no model moves money.' },
  { initials: 'AL', who: 'Audit Ledger', quote: 'Every state transition is SHA-256 hash-chained and append-only. A recovery you cannot quietly rewrite.' },
  { initials: 'AW', who: 'Anomaly Watch', quote: 'Retries defer the moment a bank or UPI spike is detected, and resume automatically when it clears.' },
] as const;

export const FAQS = [
  {
    q: 'What does Overwatch do?',
    a: 'Overwatch is an AI recovery layer that sits under Razorpay. It detects failed payments and abandoned checkouts, picks the safest recovery move — a smart retry, a fresh payment link, a reminder, or a bounded incentive — executes it through allow-listed actions, and proves the incremental revenue it brought back against a live control holdout.',
  },
  {
    q: 'How is it different from a simple retry rule?',
    a: 'A static retry toggle fires blindly and annoys customers. Overwatch scores every case with a calibrated model, chooses the next-best action by expected value, and only acts inside a deterministic policy engine — retry caps, quiet hours, opt-out and RBI/AFA limits. ML proposes; code disposes.',
  },
  {
    q: 'Does the AI ever move money on its own?',
    a: 'No. The model only ranks options. Every action passes the bounded policy engine before anything executes, and a payment is booked “recovered” only on a real, HMAC-signed Razorpay webhook — exactly once, never on the model’s own say-so.',
  },
  {
    q: 'How do you prove the recovery is real and not luck?',
    a: 'A randomised 20% no-action control arm runs continuously. We report treatment-minus-control lift with a 95% bootstrap confidence interval, sliced per failure reason — the incremental rupees over doing nothing, not gross recoveries. Any reason that can’t beat the control is auto-suppressed.',
  },
  {
    q: 'Which payment rails does it work with?',
    a: 'Everything Razorpay supports — UPI (collect and intent), cards (Visa, Mastercard, RuPay), netbanking, and wallets. Recovery moves and retry timing are chosen per rail and per failure reason, within each network’s rules.',
  },
  {
    q: 'Is my payment data secure and auditable?',
    a: 'Every state transition is SHA-256 hash-chained and append-only at the database, so recoveries are provable, replayable, and impossible to quietly rewrite. Webhooks are HMAC-verified and secrets never reach the browser.',
  },
  {
    q: 'How does it stay compliant with RBI and NPCI rules?',
    a: 'Retry caps, cooling-off windows, additional-factor-authentication thresholds, quiet hours and customer opt-out are enforced as code in the policy engine — and independently checked by red-team oracles that share no branch with the policy they audit.',
  },
  {
    q: 'What happens during a bank or UPI outage?',
    a: 'An isolation-forest detector flags a live failure spike and Overwatch defers retries for the affected reason, so it doesn’t add to the storm — then resumes automatically once the spike clears.',
  },
  {
    q: 'How long does setup take?',
    a: 'Point a Razorpay webhook at Overwatch and drop in your keys. It runs in test mode with no card required, so you can seed cases and watch the pipeline recover them in minutes.',
  },
  {
    q: 'Has the model been validated outside your own data?',
    a: 'Yes. The same uplift + doubly-robust estimator recovers the ground-truth ATE of a real public randomised trial — the Hillstrom experiment, 64,000 customers — within 1.9%, and the uplift ranking holds on that real data too.',
  },
] as const;

export const FOOTER_COLS = [
  { title: 'Product', links: [
    { label: 'Features', to: '/features' },
    { label: 'Live demo', to: '/app' },
    { label: 'Recovery Lab', to: '/app/lab' },
    { label: 'Rigor & proof', to: '/app/rigor' },
  ] },
  { title: 'Company', links: [
    { label: 'About', to: '/about' },
    { label: 'The method', to: '/app/rigor' },
    { label: 'Compliance', to: '/app/compliance' },
    { label: 'Evidence', to: '/app/evidence' },
  ] },
  { title: 'Get started', links: [
    { label: 'Sign in', to: '/login' },
    { label: 'Create account', to: '/login' },
    { label: 'Open dashboard', to: '/app' },
  ] },
] as const;
