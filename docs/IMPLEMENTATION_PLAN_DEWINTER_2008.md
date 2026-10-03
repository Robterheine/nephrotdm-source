# Implementation & numerical-validation plan — de Winter 2008 in the MPA TDM app

**Team session:** senior pharmacometrician × JavaScript coder × HTML coder.
**Inputs:** `docs/MODEL_ANALYSIS_DEWINTER_2008.md` (paper analysis + scrutiny S1–S11), the
current engine (`src/model.js`, `src/bayes.js`), the current UI (`src/ui.js`, `index.html`).
**Product:** a build order in which every engine capability lands with a test that can go
red, and a two-layer validation matrix separating *implementation* validity (code = paper)
from *model* validity (model = reality). Ships as **v1.0.0**.

Shared numbers (typical parameters, computed and cross-checked):

```
k10 = CL/V1 = 0.40 /h    k12 = Q/V1 = 0.55 /h    k21 = Q/V2 = 0.04247 /h
λβ = 0.017423 /h  →  t½β = 39.8 h        (drives S2: ssNDoses)
absorption t½:  MMF ln2/4.1 = 0.169 h    EC-MPS ln2/3.0 = 0.231 h
                 (paper prints 0.17 / 0.23 h — an exact published cross-check of ka)
SS fraction reached, q12h:  n=10 → 87.6% (12.4% low) · n=25 → 99.46% · n=30 → 99.81%
Golden AUC₁₂ (mass balance, Dose_MPA/CL):
  MMF 1000 mg  → 739 mg MPA → 46.19 mg·h/L
  EC-MPS 720 mg → 674 mg MPA → 42.12 mg·h/L   (≈10% apart — expected, S11)
IV bolus 100 mg MPA → AUC₀₋∞ = 100/16 = 6.250 mg·h/L (absorption-free anchor)
```

---

## Part 1 — JavaScript coder: engine changes

**E1. Spec-driven eta map (scrutiny S5).** `indivParams()` becomes table-driven from
`spec.ETA`: `{ names: [...], map: { CL:0, V1:1, Q:2, V2:3, KA:4, TLAG:5, ... } }` — each
named parameter gets `THETA·exp(η)`; positions come from the spec, not from hard-coded
indices. The stub (2 etas) keeps working via its own map. `omegaVars` follows the same
table. This is the prerequisite for everything else.

**E2. tlag in the event loop (C1).** A per-dose lag is computed at event-build time and
the depot event is scheduled at `d.t + tlag(d)`:
```
tlag(d) = form==MMF   ? TLAG_MMF · exp(η_tlagM)
        : morning(d)  ? MIX_m · exp(η_tlagMorn)          // m = membership indicator
                      ? TLAG_EVE  · exp(η_tlagEve)
morning(d) = dose clock hour ∈ [06:00, 18:00)            (S7, documented choice)
```

**E3. Mixture membership as a Bayesian parameter (C2).**
- *Joint MAP:* for m ∈ {1,2,3}, minimize `OFV(η, m) − 2·ln p_m` (p = 0.51/0.32/0.17 →
  −2ln = 1.34/2.26/3.54); keep the best (η, m). The prior term makes subgroup 3 need
  ΔOFV > 2.2 to beat subgroup 1 — the correct Bayesian comparison, not a likelihood-only pick.
- *MCMC:* state = (η, m). η-moves as today (Laplace proposal at the best membership);
  membership move proposes m′ from the prior and accepts with the likelihood ratio
  (Metropolis-within-Gibbs). Draws stay plain η-vectors; membership rides in a parallel
  `fit.mixChain` array (less invasive than changing the draw shape; `doseScan` reuses both).

**E4. Formulation covariate + dose conversion (C3, S11).** Subject-level formulation from
the covariate panel; one commented function `toMpaMg(amt, form)` = `amt × 0.739 | × 0.936`
applied at dose ingestion only. ka, the tlag structure and the tlag-η layout switch on it.
Mixed-formulation histories are impossible by construction (subject-level select) — honest
to the source data, where every patient was on one formulation.

**E5. Log-scale residual likelihood (C4, S10).** `SIGMA.LOG` mode in `makeOfv`:
`(ln obs − ln pred)²/σ² + ln σ²`, M3 censoring as `log Φ((ln LLOQ − ln pred)/σ)`;
guard `pred ≤ 0 → Infinity`. Error multiplier scales σ.

**E6. ssNDoses → 30 (S2).** Spec value; also used by the SS-mode history builder.
Cost check: OFV simulations span the history once (≈30 events + obs times, RK rtol 1e-6) —
measured during groundwork, budgeted in the error table below.

**E7. Numerics (S8).** Keep adaptive RK, rtol 1e-6; the golden tests double as the
stiffness check (ka 4.1 vs k21 0.042 /h, ~100× spread). No pre-emptive tuning.

**E8. Diagnostics extension (S4).** `panelHtml` gains a membership block: posterior
P(subgroup | data) per subgroup for EC-MPS fits; tlag-η rows per the active class.

**E9. Spec fill (from §A of the analysis doc).** THETA/ETA/OMEGA (√ω² convention, S1),
SIGMA.LOG σ 0.39, EXPO → 0 (no allometry), covariate list = [formulation], window source
unchanged, `pending: false`, model-card text (scope S6, conventions, caveats).

## Part 2 — HTML coder: interface changes

**U1. Covariate panel = one model-driven select** (the formulation covariate): MMF / EC-MPS.
The existing informational `pt-form` field is promoted to this role; weight is **hidden**
(spec declares no wt covariate — collect only what the model uses), with "absolute mg
dosing, no weight effect" in the model card.
**U2. Dose entry labels follow the formulation** — "Dose (mg MMF)" / "Dose (mg EC-MPS)";
dose table and explorer show the product dose with the MPA-equivalent as a sub-value;
session JSON and report record both units (S11 discipline).
**U3. Explorer**: candidate dose in product mg, converted identically; interval select
unchanged (12/24 h); AUC₁₂ contract already built (v0.5.0).
**U4. Pending → ready**: pending banner retires into a model card; Run/Explore enable;
`verify_model.mjs --pending` flips to strict passing.
**U5. About / model card**: parameters with IIV, structure diagram-in-words, scope
(maintenance-phase, 4–257 months — early post-transplant is extrapolation), ω² convention,
diagonal-Ω approximation, mixed-assay caveat + error multiplier, FO provenance, 6-h EHC
limitation, citation.
**U6. Getting-started / background texts**: sampling guidance gains the de Winter nuance —
for EC-MPS, sparse LSS is expected to be unreliable (paper's own conclusion); more samples
spread over the interval are better there.
**U7. No new dependencies, single-file, print-safe** — all existing golden rules apply.

## Part 3 — Pharmacometrician: the validation matrix

### Layer 1 — implementation validity (does the code equal the paper?)

| # | Check | Type | Tolerance | Catches |
|---|---|---|---|---|
| V1 | Micro-constants: k10 0.40, k12 0.55, k21 0.04247; λβ 0.017423 → t½β 39.8 h | exact | 1e-3 rel | parameterization errors (CL/Q/V1/V2 → micro-constant wiring) |
| V2 | Absorption t½ 0.169 / 0.231 h | exact | 1e-3 rel | ka wiring + **direct cross-check against the paper's printed 0.17/0.23 h** |
| V3 | IV bolus 100 mg MPA → AUC₀₋∞ = 6.250 | exact | ±1% | elimination + integration, absorption excluded |
| V4 | SS golden anchors: MMF 1000 → 46.19; EC-MPS 720 → 42.12 (AUC₁₂, typical params) | exact + budget | **±2%** | dose conversion, CL, SS depth (S2), AUC₁₂ pipeline — the three silent-breakers |
| V5 | S3 invariant: SS AUC₁₂ identical across the 3 mixture subgroups (and across ka ÷ 2) | invariant | ±1% | proves mass-balance robustness; any tlag/ka leak into AUC |
| V6 | tlag mechanics: C(t+τ−ε) ≈ 0, C(t+τ+δ) > 0; no tlag for IV | exact | 1e-6 / bool | event-loop lag scheduling |
| V7 | Dose conversion: 1000→739, 720→674; both units in session JSON | exact | 1e-9 | E4 |
| V8 | Membership prior: 10 000 draws → 51/32/17% | MC | ±2% abs | E3 prior wiring |
| V9 | Likelihood correctness: synthetic data generated with known (η, m, σ=0.39) → OFV(η*, m*) < OFV(perturbed) for ≥95% of perturbations; joint-MAP recovers η within tolerance | exact-ish | stated | E1+E3+E5 jointly — the Bayesian machinery on the new model |
| V10 | Simulation–recovery calibration (see Part 7 for the protocol): **n = 100** synthetic patients with known η, membership and residual noise; **two sampling designs** (trough-only and 3-point LSS); per design: AUC₁₂ 5–95% coverage in 85–95% (binomial SE ≈ 3% at n=100); membership posterior-mode accuracy ≥ 51% baseline on the LSS arm; membership switch rate > 0 (chain actually explores); **two robustness arms** — (a) both ω² conventions (S1 sensitivity, measured not assumed), (b) correlated-Ω truth fitted with diagonal Ω (the approximation, measured) | statistical | stated | end-to-end honesty of the posterior, incl. the mixture; turns S1 and the diagonal-Ω approximation from documented choices into measured ones |
| V11 | Determinism: seeded runs bit-identical | exact | 0 | RNG plumbing |
| V12 | Grid/SS budget: n=30 SS fraction 99.81%; trapezoid error ≤ 0.6% on the 24-interval grid (reprise of the v0.2 grid study on the real model) | measured | stated | closes the V4 error budget |
| V13 | Population sanity vs published post hoc summaries: simulated EC-MPS morning tlag distribution covers [0.9, 5.5]; simulated C0 medians land within a loose factor (~±50%) of the paper's post hoc medians (EC-MPS 2.6, MMF 1.5–1.6 mg/L) — post hoc ≠ simulation, so approximate by design | approximate | factor | Ω + mixture + tlag end-to-end realism |
| V14 | `tools/verify_model.mjs` strict passes (completeness, positivity, smoke sim) | gate | bool | spec integrity |

**Error budget for V4 (why ±2%):** SS depth (n=30) 0.19% + trapezoid ≤0.6% + RK <0.01% ≈
0.8% worst case → ±2% is conservative but still tight enough to fail on any real breach
(a 12% SS-depth regression, a wrong conversion factor, or a CL typo all blow through it).

### Layer 2 — model validity (does the model equal reality?)

- **Inherited, internal only:** bootstrap (1000, reported) + VPC — on pooled maintenance
  renal-transplant data; no external validation set exists for this model. This is stated
  verbatim in `MODEL_VALIDATION.md` and the model card — the app does not inherit more
  certainty than the paper earned (consensus: LSS/MAP methods must be validated per
  indication, externally).
- **Per-patient adequacy tools (already built):** fit diagnostics — residuals vs ±2 SD
  band, shrinkage, and now membership posteriors (E8) — let the clinician see when the
  model does *not* explain their patient.
- **Known limitations carried in the card:** maintenance-phase scope (S6), 6-h EHC
  overprediction, FO provenance, mixed assay basis.
- **Future (out of scope for v1.0.0):** an external-check mode comparing app-estimated
  AUC₁₂ against locally measured full-profile AUCs — the natural next validation step
  once the user has local data.

## Part 4 — Build order (each step: red-first test → implement → green → build)

*Designer and statistician items land at their natural steps: UX1–UX8 and E8/ST4 render
at step 8 (UI phase); the ST1–ST3/ST6 protocol governs step 7; UX8's one-time notice and
UX6's warn-tier hint ship with the UI pass. Nothing extends past v1.0.0.*

1. **E1 eta map** → V1 goes red first (stub gains Q/V2 etas; micro-constant test).
2. **E2 tlag events** → V6 (stub spec gains a tlag; exact zero-before-lag test).
3. **E4 formulation + conversion** → V7 (stub gains two forms with distinct ka/tlag/conv).
4. **E5 SIGMA.LOG** → V9-lite (synthetic log-error data; OFV ordering test).
5. **E3 mixture** → V8 + V5 (stub gains a 3-way tlag mixture; prior-frequency and
   mass-balance-invariance tests).
6. **E6 ssNDoses 30** → V12 on the stub (slow-peripheral stub variant).
7. **V10 recovery study** on the fully-extended stub engine (the big one — run the full
   Part-7 protocol: n=100, two designs, two robustness arms; record coverage, membership
   recovery, switch rates, and the S1/Ω-approximation sensitivities **before** the real
   model exists, so expectations are calibrated and any machinery flaw is found on the
   stub, not on de Winter).
8. **E9 spec fill (de Winter)** + **U1–U6** → V1–V5, V13, V14 on the real numbers;
   golden.json populated with V3/V4 anchors; un-pend; README/About/model card.
9. **Preview e2e** (real spec): synthetic patient, fit, diagnostics with membership,
   explorer at 12/24 h, report, print — then v1.0.0.

## Part 5 — Team decisions (recorded, with rationale)

- **Subject-level formulation, not per-dose** — matches the source data (no patient
  switched formulation); makes mixed histories impossible rather than mis-modeled.
- **Membership rides in a parallel array** (`mixChain`), draws stay η-vectors — every
  existing consumer (doseScan, diagnostics, subsample) keeps its shape.
- **√ω² convention** (S1) with the exact-log-normal column documented and an author-query
  note; AUC-benign per S3.
- **Weight hidden, not disabled** — the covariate panel shows exactly what the model uses.
- **V13 is deliberately loose** — post hoc estimates are data-shrunk, pure simulation is
  not; order-of-magnitude agreement is the honest claim.
- **No analytic SS seeding in v1.0.0** — 30 doses is sufficient (0.19%) and keeps the
  event-loop code path single; analytic seeding noted as an optimization if E6's cost
  profile demands it.

---

## Part 6 — UI designer: presentation of the new model capabilities

All within the existing design system (`docs/DESIGN_PLAN.md` tokens; no new patterns, AA
contrast, print-safe).

**UX1. Model identity chip.** After un-pending, every result must be attributable to its
model variant: a quiet badge next to the fit status — `de Winter 2008 · MMF` or
`· EC-MPS` (the `.badge.info` treatment) — clickable to the model card. A reader of a
printed report or screenshot should never wonder which model produced the numbers.

**UX2. The one-field covariate panel must not look broken.** A panel with a single select
(where weight used to be) reads as a bug unless labeled. Design: the formulation select
sits with a short permanent legend-note — "This model uses no patient covariates besides
formulation; dosing is absolute mg (no weight effect)" — so emptiness is *stated*, not
implied. This is the honest inverse of the covariate-rich companion model.

**UX3. Membership probabilities (pairs with E8/S4).** Three horizontal mini-bars reusing
the shrink-bar visual language (same track/fill/pct classes), the MAP subgroup ticked,
with the legend: "absorption-delay group (EC-MPS); probabilities, not a classification".
Informational framing only — never a badge that says "patient is subgroup 2".

**UX4. Wide-interval composure (pairs with ST4).** EC-MPS fits will often show wide 5–95%
intervals (huge ka/V2 IIV + mixture). The hero must still read confidently: keep the
interval typography calm, and when the statistician's shrinkage trigger fires (ST4),
show a one-line `.legend-note` under the grid — "interval largely reflects population
variability — add samples across the dosing interval to individualize" — an action hint,
not an alarm; never warn-styling (the number is not wrong, the data are sparse).

**UX5. Model card layout (U5's design spec).** About → model card on the modal system:
small-caps section headers (existing `h3` pattern); parameter table (`about-tbl`) with
THETA / IIV columns and bootstrap CI in a muted sub-column; a visually distinct
"Scope & caveats" block using the `.note` treatment (maintenance-phase S6, ω²
convention S1, diagonal Ω, mixed assay, FO provenance, 6-h EHC limitation); citation
in `.src`. Nothing invented — the design system already has every piece.

**UX6. EC-MPS sampling caution gets warn-tier styling.** The LSS hint upgrades for
EC-MPS to `.note.warn`-level presentation at the sample-entry card (the paper's own
conclusion: sparse LSS is expected to be unreliable for EC-MPS) — while MMF keeps the
plain hint. Different visual weight for different evidence.

**UX7. Accessibility.** Membership bars carry aria-labels with the percentages; the
model-identity chip is a real button with an accessible name; the parameter table uses
`th scope`; all new text ≥ 4.5:1 (the v0.3.1 contrast sweep discipline).

**UX8. State transition.** Users who knew the pending app: on first run of v1.0.0 the
former pending notice is replaced by a one-time `.note` — "Model integrated: de Winter
2008 (renal transplant, maintenance). See About for scope and caveats." — dismissible,
never repeating (localStorage flag). The interface tells the story of its own change.

## Part 7 — Statistician: inference-layer requirements

**ST1. Coverage protocol for V10 (replaces the n=24 draft).** At n=24 a coverage
estimate has SE ≈ 6% — too coarse to calibrate anything. n = 100 synthetic patients
(seed-fixed) gives SE ≈ 3%; two sampling designs (trough-only, 3-point LSS) because
coverage is design-dependent by construction: trough-only intervals *should* be wider
(more prior) and still cover ~90%. Acceptance per arm: coverage ∈ [85%, 95%].

**ST2. Turn S1 and the diagonal-Ω approximation into measurements, not assumptions.**
V10 gains two robustness arms: (a) generate truth under both ω² conventions — if AUC
coverage and interval width are materially unchanged, S1 is AUC-benign *empirically*
(S3 predicts it; now it is shown); (b) generate truth with a plausible correlated Ω
(e.g. ρ(CL,V1) ≈ 0.5) and fit with the diagonal Ω the app will actually use — coverage
holding means the approximation is validated *for the app's purpose*. If either arm
fails, the author query (full Ω) escalates from nice-to-have to blocking.

**ST3. MCMC mixing on the new posterior geometry.** Six-to-seven etas with ω² up to 24
(V2) plus a discrete membership is a harder posterior than the mAb engine's. Surface
per-chain ESS alongside acceptance in the diagnostics modal (display, not block); flag
(non-blocking badge) if ESS < 200. Membership switch rate is the discrete-move mixing
diagnostic — assert > 0 in V10 (a chain that never switches membership has not explored,
and its "posterior" is really one subgroup's conditional).

**ST4. Shrinkage-triggered honesty note (pairs with UX4).** Define the trigger
statistically: posterior shrinkage > 80% on CL (the AUC-driving parameter) → the results
grid shows the informational note. On ka/V2/tlag, high shrinkage is *expected* with
sparse data and needs no alarm — the shrinkage bars in diagnostics already tell that
story. The note fires only when it changes what the AUC number means.

*(v1.2.1: the engine returned information gained, 1 − Var/ω², under the name "shrinkage", so this trigger was inverted. Fixed — `fit.shrink` is now Var/ω² and the 80% threshold is unchanged; see the ST4 addendum in `docs/METHODS_AUDIT_V101.md`.)*

**ST5. Mixture posterior treatment.** No label-switching risk (subgroups are fixed,
ordered, prior-weighted — not a random-effects mixture). Report membership as
probabilities; the AUC chain **marginalizes** over membership (each draw carries its m —
already E3); never report a "hard" subgroup assignment anywhere (UX3 wording).

**ST6. Membership chain initialization.** Starting every chain at the best-MAP
membership risks mode-trapping. Fix: initialize membership chains across subgroups
(e.g. split burn-in thirds, one per subgroup) or guarantee membership proposals are
frequent; V10's switch-rate assertion polices it.

**ST7. Error-model semantics carry over exactly.** On the log scale, per-observation
σᵢ = σ·errMult·recencyMultᵢ is clean multiplication; the M3 censoring term's monotone
transform preserves its meaning. No re-derivation needed — stated so nobody "fixes" it.

**ST8. Interval interpretation stays 5–95%.** Established contract, verified by V10's
coverage arms; no new interval types. The recovery study is the evidence.

**ST9. V13 stays deliberately loose.** Population-summary comparisons against the
paper's *post hoc* estimates use factor-level tolerances (post hoc estimates are
data-shrunk; simulations are not). Order-statistic reasoning for min/max ranges, not
normal approximations. The honest claim is order-of-magnitude realism.

---

## Part 8 — Execution log (v1.0.0, what actually happened)

Executed in the plan's order. Discoveries and corrections made *by* the validation suite:

- **S12 discovered (new scrutiny finding).** The V4 golden anchors exposed that EC-MPS
  absorption is 24h-periodic (evening dose absorbs at clock ≈ 05:00): morning-anchored
  AUC₀–12 ≈ 45.3, evening-anchored ≈ 39.0, 24h sum = 84.2 ≈ 2×674/16 (closes to 0.06%).
  The engine was right; the test's single-window expectation was wrong. Anchors split
  into MMF per-window mass balance + EC-MPS 24h invariant + golden-recorded windows;
  the caveat ships in the model card and docs.
- **S2 corrected by measurement.** The SS deficit is 7.6% at 10 doses and 6.2% at 11 doses (10 intervals, the case V12 tests) — corrected in the v1.0.1 audit F15; the 4.4% first recorded here was not reproducible (not the ~12% single-dose-tail
  estimate — the slow phase carries ~60% of the AUC); still far outside ±2%, so ssNDoses 30
  stands. The analysis doc's S2 text now carries the measured number.
- **AUC grid density raised** to 4 points/hour (48 per 12 h window): the sharp EC-MPS
  absorption onset left ~1.2% trapezoid error at 24 points; ~0.15% at 48.
- **V3 rewritten** to the analytic bi-exponential check (0.2%) after the original design
  fell into the pre-dose-at-dose-instant semantics + coarse-grid trap.
- **Red-capability demonstrated**: THETA.CL sabotaged 16→18 → 5 tests red from four
  independent directions (spec, micro-constants, both anchors, analytic IV) → restored →
  53/53 green.
- **e2e caught a real bug** the unit tests could not (no DOM): `runDisabledReason()` demanded
  body weight unconditionally — with the weight field hidden for this model, Run could
  never enable. Fixed (`requiresWt` honored).
- **Chart hardened**: band/series paths can never be emitted empty or starting with L
  (a transient console error seen between fits during e2e).
- **MCMC default iterations 4000 → 2000** — aligning the shipped config with the validated
  configuration (the calibration studies 2000); browser runtime 63 → 39 s (MMF, 4-point
  LSS, 6 etas).
- **Pending-gate tests preserved** via in-test spec mutation (try/finally): the gate
  machinery stays guarded while the drug ships ready.
- **e2e of record** (real model, browser): MMF 1000 mg q12h + 4-point LSS → AUC 39–42
  [27–63] mg·h/L, P(in 30–60) 77–82%, trough ~1.0 mg/L; EC-MPS 720 mg + 4-point LSS →
  AUC 42.7 [28.5–67.2], P 79%, membership posterior 99/0/0 (subgroup 1 correctly
  identified from an early peak); model chip, membership bars, ESS, shrinkage, dual-unit
  report, print flow — all verified live; console clean.
- **Calibration of record**: `tools/calibrate_dewinter.mjs` under launchd (survives host
  restarts; incremental per-cell persistence to /tmp/calib_cells*.jsonl) → results land in
  `docs/CALIBRATION_RESULTS.md`.
- **THE calibration's own finding — and fix (the study did exactly what it exists for).**
  The first full run (as-shipped sampler: single MAP-started chain, mcmcIters 2000) measured
  **systematic undercoverage: 65–75% across cells** (acceptance 85–95%), ESS ≈ 28–42 —
  intervals too narrow because the sticky chain never left the MAP neighbourhood.
  Diagnosis ladder, each step measured: full-covariance Laplace proposal (the v0.2.4-audit
  note “diagonal-only, not fixed”) → mmf-lss 60% — NOT the cause; 20 000-iteration
  ground-truth on 3 patients → widths unchanged, all covered → the posterior is honest,
  the short chain under-explores. **Fix: multi-chain pooling at the same total budget** —
  4 chains (1 MAP-start + 3 disperse prior starts, random mixture membership), pooled
  draws. mmf-lss recovered to **85%±8** (width 26.8 → 33.1, |ΔAUC| 9.1 → 7.9). The fix
  ships in v1.0.0; a test locks the 4-chain default; the full 8-cell calibration of record
  was re-run on the fixed engine.
- **Ops notes**: launchd `submit` jobs respawn after completion (logs must append, labels
  removed on completion); 5-way concurrent module loads through the OneDrive file provider
  fail with EAGAIN → the study runs from a /tmp copy of the code.

Open after v1.0.0: author queries (full Ω covariance, ω² convention), the S12
auto-anchoring decision (candidate v1.1), further runtime work (worker thread, analytic
SS seeding), P3-2 in-table editing.

## Part 9 — v1.0.1 execution log

1. **S12 shipped as v1.0.1** (not v1.1): `M.aucAnchor` anchors the reported AUC window
   at the most recent morning dose for evening-ending EC-MPS schedules — the fit and
   OFV are untouched (absolute times), only the derived window moves. runFit/doseScan
   carry `aucT0`/`aucAnchorShifted`; hero sub-line, advisory note, report, explorer and
   diagnostics all state the anchoring when shifted; the model-card caveat now says the
   app does it automatically. Tests V15/V16 (helper unit behavior + scan-level golden
   ~45.26 through an evening-ending schedule + runFit grid contract); sabotage-verified
   red (3 failing assertions with the anchor disabled).
2. **A suspicion refuted by reading, not by running:** the tool's schedules end on a
   morning dose (tEnd 368), so the v1.0.0 record's EC cells had **no** window mismatch —
   the trough undercoverage was genuine sampler behavior, not an S12 artifact.
3. **The paired sampler study** (docs/CALIBRATION_V101_SAMPLER_STUDY.md): chains 4 → 8
   default; mmf-trough 80% → 90% at unchanged budget class (8 × 300 = 2400 iters via
   the per-chain floor); EC-trough unchanged at 85% on the paired 20 with a wider,
   more honest interval; iters=4000 also recovered but at double MCMC cost — rejected.
   The locking test now asserts 8 chains. Also surfaced: the v1.0.0 ec-trough 75% (n=40)
   splits 85%/65% between its first and second 20 patients — cell heterogeneity, one
   more reason for the n=100 record.
4. **Calibration tooling fixed en route:** the `--tag=` parser appended `main` to every
   tag (the cause of the earlier `maina` filename quirk — `replace('--tag=', 'main')`
   instead of a proper default); the new `--chains/--iters/--n` knobs initially
   `parseInt`-ed the unstripped flag (silently null) — both fixed and knob-verified;
   launchd jobs run at cwd `/` (the submitted shell must `cd` into the project);
   `pgrep -c` does not exist on macOS.
5. **The n=100 record** ran on the final v1.0.1 engine (8 parallel launchd jobs, one
   per cell, ~3.5 h under external CPU contention) and is assembled in
   `docs/CALIBRATION_RESULTS.md`: **6 of 8 cells pass** — both v1.0.0 CHECK baselines
   recovered (ec-trough 75%±6.8 → **85%±3.6**; mmf-trough 80%±8.9 → **86%±3.5**) and
   the previously ambiguous mmf-lss-armA landed at **92%±2.7**; baselines ec-lss 86%,
   mmf-lss 88%, armA pair 92%/92%. The only remaining CHECKs are the **arm-B pair
   (84%/83%)** — the diagonal-Ω-vs-correlated-truth approximation, now measured at
   ~3–5 coverage points; documented in the model card and the subject of the author
   query. This retires the v1.0.0 cell-size compromise and answers verification-team
   question R2-2 by removal.
   *(Superseded 20 Sep 2026: the F11 re-run on the converged engine — exact steady-state
   truth, default sampler budget — has all 8 cells inside 85–95 % with arm B at 90 %/90 %, so
   the "~3–5 coverage points" attributed to the diagonal Ω is not reproduced. See
   `docs/CALIBRATION_RESULTS.md`; the record above is kept as `docs/CALIBRATION_RESULTS_V101.md`.)*
6. **Author query drafted** (docs/AUTHOR_QUERY.md): full Ω, ω² convention, control
   stream, plus the two secondary questions (clock boundary, post hoc estimates).
7. The 8-way concurrent module loading from the OneDrive checkout did **not** hit the
   earlier EAGAIN failure this time — noted, not relied upon: the record runs from the
   repo, but any future failure should fall back to the /tmp-copy procedure.
