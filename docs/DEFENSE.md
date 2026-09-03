# Overwatch — Panel Defense Playbook

How to defend the build under questioning. Every answer here is backed by something running in the
repo — a panel, a test, or an artifact. Lead with the one-liner, then go as deep as the room wants.

> **The thesis, in one sentence:** *ML decides, a deterministic policy disposes, and a live control
> arm proves the incremental rupees — so every number on screen is measured, not asserted.*

If you only say one more thing: **"Most recovery tools tell you they recovered ₹X. We're the only one
that proves it's ₹X *more than would have happened anyway*, and can't quietly rewrite that number."**

---

## The 30-second open

*"In India a failed payment is usually mechanical — a UPI timeout, a bank blip, a momentary decline —
not a change of heart, so it's recoverable. Overwatch catches it, the ML picks the safest recovery move
and how likely it is to work, a deterministic policy engine bounds it against RBI/NPCI rules, and an
allow-listed executor acts. Then — the part nobody else does — we measure the incremental rupees
against a live 20% control holdout, and prove the whole money path with a signed Razorpay webhook and
a tamper-evident, append-only ledger. Where nothing slips through."*

---

## Judged on the four criteria

Answer each in one breath, then open the proof.

- **Problem taste — did you pick something that matters?** Yes, and reframed it: in India a failed payment
  is *mechanical and recoverable*, and the un-published gap isn't retrying — it's **measuring** whether a
  retry actually recovered anything *over doing nothing*, and **governing** it under RBI/NPCI. We built the
  measurement + governance layer that plugs under Razorpay, not another retry toggle. *Incremental ₹, not gross.*

- **Build quality — does it run, is it structured, would you trust it?** Real money path (exactly-once under
  concurrency, proven by a test), 80 tests incl. property-based invariants, a tamper-evident **+ DB-enforced
  append-only** ledger, `reproduce.sh` + CI, clean commit history. It runs from a clone; the numbers are
  pinned to their source artifacts so you can trust them by construction, not by our say-so.

- **AI judgment — right tool in the right place, and where you chose *not* to use one?** The architecture is
  the judgment: calibrated **ML** decides (a tabular problem gets tabular ML, not an LLM), a **deterministic
  policy** disposes, an **allow-listed executor** acts, and the **LLM only explains/drafts — behind a
  fact-checker, never touching money.** The whole money path is deliberately AI-free.

- **Failure recovery — what broke, and what you did?** Five real incidents in
  [`POSTMORTEM.md`](../POSTMORTEM.md), each with the committed regression that pins the fix (headline: a
  99.5% model that had *learned nothing* → an honest ~70% after we found the label leakage). And a step
  beyond: **failure-prevention** guards (artifact-locked numbers, confidence bands, A/A) that make shipping
  a false headline number *structurally impossible* — the failure the strongest rivals had to catch by hand.

---

## The hard questions

**"What broke, and what did you do about it?"**
Read the [`POSTMORTEM.md`](../POSTMORTEM.md) — it's five incidents, not a highlight reel. The one that
matters: our first "clean" run scored **99.5%** on the action head and **0.999** on escalation. Those aren't
good numbers, they're a *smell* — an adversarial eval panel called it a tautology, and it was: the label was
a closed-form function of the features (leakage by construction). We injected irreducible noise between the
world mechanism and the label; the model dropped to a defensible **~70%** (84% agreement with EV-optimal),
and we now flag any return above ~0.95 as a *regression to the tautology*. "A 70% number we can defend beats
a 99.5% number we can't." The others (CatBoost calibration clone, a process-kill that hit the DB, the ledger
that flagged itself, the capture we refused to fake) each ship with the committed test/rule that stops the
recurrence — and the honest-numbers failure is made impossible by CI, not just documented.



**"Isn't this just an LLM wrapper?"**
No. The decision is a **CatBoost ensemble** (benchmarked vs XGBoost + a logistic baseline) over a shared
21-feature schema, producing calibrated recovery probability, chosen action, per-action odds, escalation
risk, and anomaly score. On top sits a **causal uplift engine** (S/T/X-learners, selected by Qini). The
**LLM only explains** a decision in plain English after the fact — it never decides or moves money. See
`/app/model`.

**"Your data is synthetic — why should we believe any metric?"**
Three defenses, in order. (1) The synthetic world exposes its own ground-truth mechanism, so uplift is
scored against **known truth** (Qini ≈ 0.93, ECE ≈ 0.008). (2) The *same* uplift + doubly-robust
machinery is re-run on a **real public RCT** (Hillstrom, 64,000 randomised) and recovers the trial's
ground-truth ATE to within **1.9%** — external validity, not just our world. (3) A frozen model still
ranks an **independently designed** second world at ~0.68 AUC. We label synthetic data as synthetic
everywhere; the flywheel replaces it with real outcomes over time. See `/app/model` → external validity.

**"How do you know the lift is real and not an artifact of your own estimator?"**
The lift estimator is **A/A-tested**: on two statistically identical arms it reads ~0 with a CI spanning
zero (`lab.aa.test.ts`). Then the lift itself is measured against a **randomised 20% control holdout**
(Recovery Lab, with a 95% CI), and independently the deployed policy's value is estimated from the log
alone via **IPS + doubly-robust OPE**, validated within ~6% of ground truth. Three independent roads to
the same number, not one hopeful gross figure.

**"Where's the network intelligence competitors show?"**
Deliberately not faked. Cross-merchant network signals are only trustworthy with real cross-merchant
traffic, which a hackathon build doesn't have — shipping a *simulated* one would betray the entire
"every number is measured" thesis you just watched us defend. The data model is ready for it; what we
built instead is the measurement, causal, and governance layer that makes network intelligence *safe*
the day it has real data. We'd rather have the un-fakeable foundation than a demo prop.

**"Can the AI do something harmful — over-retry, spam, over-discount, message a wrong amount?"**
No path to. A deterministic **policy engine** enforces RBI harmonised-TAT (no re-debit of a
failed-but-debited payment), the NPCI retry cap, the AFA ceiling on high-value auto-debits, consent/DND,
quiet hours, and a discount cap — and an **allow-listed executor** can only perform sanctioned actions.
You can *attack* these live in the **red-team console** (`/app/compliance`): every attack is defended,
and judged by **independent regulatory oracles** — separate code from the policy, so a silent guardrail
regression is caught even when the policy would pass itself. Separately, an **outbound-message
fact-checker** validates every amount/discount/reference against ground truth before send; a hallucinated
figure blocks the send and escalates to a human.

**"Can the audit trail be tampered or quietly rewritten?"**
It's **SHA-256 hash-chained** (any edit, reorder, deletion, or insertion breaks the chain — and the
verifier classifies *how* it broke) **and append-only enforced by Postgres itself** — a trigger rejects
any UPDATE/DELETE on a ledger row. We prove both live on `/app/evidence`: we attack a real chain on
clones and show every tamper caught, then attempt an UPDATE and a DELETE on a real row inside a
rolled-back transaction and show the database refuse both. Not even the app can rewrite history.

**"Doesn't Razorpay already do recovery? Why aren't you redundant?"**
Razorpay's Optimizer / Intelligent Retry Engine are merchant-configured, static rules. Overwatch **plugs
under** them as the measurement + governance layer they don't publish: holdout-measured incremental ₹,
causal uplift per action, PSI drift monitoring, tamper-evident audit, and India policy-as-code. We don't
compete with the rails — we make the recovery on them **provable and safe**.

**"What's the ROI / where's the money?"**
On `/app` → business case. Grounded in our measured ~40pp incremental lift (with its 95% CI) and our
real per-attempt cost model (₹3–6 for automated moves), a mid-market merchant (₹2 Cr GMV/mo, 12% fail
rate) nets **tens of lakhs a month at ~20×+ ROI even at the conservative lower bound of the confidence
interval**. Action cost is single-digit rupees against hundreds-to-thousands per recovered ticket, so the
economics aren't close.

**"What's the moat — can't someone copy this?"**
The un-fakeable assets: **real replayable Razorpay captures**, a **real-RCT-validated** causal engine,
**independent** compliance oracles, and a **DB-enforced** integrity layer. A competitor can copy a
feature; copying the *rigor posture* — every claim backed by an adversarial check that would catch us —
is the hard part. See `/app/rigor`: 15 independent checks, in one place.

---

## What a tough panel actually asked — and the answers

A four-judge dry run (ML rigor · product · engineering · business) scored the live build **8/10** and
pressed on exactly these. Say them *before* the panel does — pre-empting an objection reads as maturity.

**"Your causal numbers come from a world you built — you're grading your own homework."**
Yes, and every artifact is stamped `"synthetic": true`. What survives the objection: (1) the *same*
uplift + doubly-robust machinery is re-run on the real **Hillstrom 64,000-customer RCT** and recovers the
trial's ground-truth ATE within **1.9%** — the plumbing is validated on data we did not generate;
(2) the live **Recovery Lab** is a real randomised holdout on the running system — that lift is measured,
not simulated; (3) the **A/A test** proves the estimator reads ~0 on identical arms. What we do *not*
claim: that the uplift *ranking* transfers to a real merchant book. That is the first thing a pilot
measures — it's on the roadmap, not in the README as a number.

**"The control arm is small — that CI is wide."**
It's 20% of every batch by design (n≈60–80 on a 300–400-case demo). We show the *whole* CI and print
"not yet significant" when it isn't; the estimator is A/A-tested (it reads ~0 on identical arms), so a narrow interval isn't an
estimator artifact. Volume tightens it — a mid-market merchant feeds it thousands of cases a month. We would
rather show a wide honest interval than a narrow fabricated one.

**"Your incremental ₹ is bigger than gross recovered — that's a bug."**
Two different quantities, and the dashboard labels them: **Projected incremental ₹** applies the
measured lift *rate* to the at-risk ₹ book (a projection); **Total Recovered** and the impact chart
count only cash actually banked. The Lab's own incremental (lift × treatment book) is always ≤ gross.

**"Show me the real money on the live site, not in a local replay."**
`npm run replay:roundtrip` against the hosted API links each real capture to a live case that flips to
`recovered` through the signed webhook — the Evidence page then shows the linked case. The captures are
₹1 on purpose: real order, real 3DS checkout, real capture, no theatre.

**"85 tests? Others cite hundreds."**
Count is a vanity metric. Ours are property-based where it matters — each policy invariant is fuzzed
over thousands of generated inputs — plus exactly-once under concurrent redelivery, the A/A null test,
tamper detection, and two honesty guards that fail CI if any headline number drifts from its artifact.
We optimised for what the tests *prove*.

## Beating the field (if asked to compare)

- **vs the causal/OPE-heavy entry:** we match the econml-style S/T/X + DR-OPE **and** run the real money
  path (signed webhooks, exactly-once, real captures) they simulate, plus DB-enforced append-only.
- **vs the breadth/network-intelligence entry:** we match the production polish and add calibration,
  Qini, conformal coverage, and a real control holdout they don't have — and we don't fake the network.
- **vs the scorecard/security entry:** we have their DB-role isolation intent (append-only) and message
  validator, but ours is real ML with measured lift, not a heuristic scorecard.

---

## Known limitations (say these first — it reads as maturity)

- **Training data is a synthetic world model**, labelled throughout; the flywheel is built to replace it
  with real outcomes. (Mitigated today by the real-RCT external-validity check.)
- **Single-tenant operator console** — reads are token-guarded; per-merchant identity + cross-merchant
  network intelligence are the documented next step.
- **In-process retry scheduler** (single-flight DB lease); a durable queue (Temporal) is the production
  upgrade. Contextual Thompson-sampling exploration is a simulation of online learning, not yet wired
  into the live decision path.
- **CatBoost's AUC edge over the baseline is small** — it earns its place on calibration + native
  categoricals + the uplift/governance layer, which we state rather than overclaim.

---

## If the demo is running short (cut to these three)

1. **Overview** — measured-impact chart + business-case ROI (the money story, measured not modelled).
2. **Compliance** — attack a guardrail live; independent oracles defend it.
3. **Evidence** — the real Razorpay capture + the append-only ledger refusing an edit live.

Everything else (`/app/rigor`, model card, conformal, cross-world transfer) is depth you open only if
the room asks for it.

---

*Companion docs: [`DEMO.md`](./DEMO.md) · [`ARCHITECTURE.md`](./ARCHITECTURE.md) ·
[`DECISIONS.md`](./DECISIONS.md) · [`ROADMAP.md`](./ROADMAP.md).*
