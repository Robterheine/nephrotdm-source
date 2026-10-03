# Release notes — MPA TDM 1.1.x

## 1.1.1 — 21 September 2026: phone layout

A screenshot from an iPhone showed the page wider than the screen (header narrower than the page, the four-step
guide and its "dismiss" link running off the right edge, everything shrunk). Cause: the stylesheet had no phone
rules at all — an unwrappable step guide (≈515 px), fixed-width fields, a recency menu as wide as its longest option,
and a 960 px chart — so iOS Safari widened the layout and scaled it down. Fixed:
- one phone breakpoint (≤ 640 px): single-column form, fields fill their card, 40 px touch targets, and **16 px form
  text** (iOS zooms into any focused field below 16 px); iOS text inflation switched off;
- the step guide wraps at every width; selects can no longer outgrow their container;
- the charts use their compact phone layout (they were a 960-unit SVG scaled to a third, axis text ≈4 px; now ≈14 px)
  and redraw when the phone is rotated.

Measured in an emulated phone (375 px, and again at 320 and 430): the layout viewport was widened to 514 px before and
is exactly the screen width now, at every stage (empty page, filled dose and sample tables, results with the chart, and
all five dialogs). At 1100 px nothing changed. No result, calculation or session format changed.

## 1.1.0 — 20 September 2026

Supersedes 1.0.1. Published at https://robterheine.github.io/mpatdm/ (retired in 1.4.0; the app now lives at https://robterheine.github.io/nephrotdm/). Research use only, as before. The methods audit (`docs/METHODS_AUDIT_V101.md`, with a
resolution status for every finding) drove most of this release. Every change was made test-first; the suite went
from 56 to 104 tests.

## What changes for the person using it

**Results are more trustworthy and appear at once**
- A forecast takes about half a second (it took ~45 s). The sampler now runs long enough to converge: the
  window probability no longer moves by several points between runs of the same case.
- With **no measurements**, the population forecast is centred on the typical value (46.7 mg·h/L for MMF
  1000 mg BID; it read 37 before) in "Steady state" mode.
- A **"sampling not converged"** badge (and a note in the report) appears when the sampler's convergence
  check on AUC₁₂ or the trough fails; the diagnostics dialog shows R̂, effective sample size and the Monte Carlo
  error of P(within window). About 5–15 % of EC-MPS fits can still show it.
- The EC-MPS absorption-subgroup bars no longer inflate the most likely subgroup (the sampler used to target the squared prior).

**Warnings that were missing**
- A typed dosing history shorter than about 8 days (five terminal half-lives) is flagged "not steady state";
  a 2-day history could read about a quarter low without any warning.
- Samples outside the reported AUC window (all of them, for an evening-ending EC-MPS schedule) are now drawn.

**The printed report**
- It is built from the inputs the forecast was run with, with an "inputs changed on screen" stamp if they were
  edited afterwards (before, edited doses or window could sit beside an old AUC).
- It prints the dosing-input mode and recency setting.

**Diagnostics dialog**
- Goodness-of-fit ±2 SD band now draws; lag-time shrinkage bars read a value; residual colours are in units of
  σ, so about one ordinary sample in a hundred (not one in eight) turns red.

**Inputs removed (owner decisions)**
- **Assay method**, **assay LLOQ**, **error multiplier**, the per-sample **"< LLOQ" box** and the **IV route**.
  The model has no assay covariate and its parameters are oral (CL/F …).
- **Censored samples are no longer supported.** Omit a below-quantification result; do not enter zero or the
  LLOQ (a zero biases the AUC by about −27 %). The engine refuses a censored sample rather than guessing.

## Compatibility

- **Session files from 1.0.x import.** Old `assay`, `lloq` and `errMult` keys are ignored, IV doses become oral,
  and any censored samples are left out with a message saying how many.
- Numbers for the same patient can differ from 1.0.1 by more than rounding: the posterior is now converged and
  steady state is exact. Do not compare a 1.0.1 report with a 1.1.0 re-run to the last digit.

## Under the hood

- Closed-form propagation replaces the ODE solver for the oral two-compartment model (agreement with the
  retained RK45 oracle < 1e-6); exact periodic steady state; analytic AUC.
- Convergence diagnostics (split-R̂, bulk ESS) computed from per-chain draws; the M3 censored likelihood and the
  error multiplier are gone from the engine; dead code removed.

## Validation record

| Evidence | Result |
|---|---|
| Independent reference sampler (`tools/reference_posterior.mjs`), 8 synthetic patients × 2 seeds | \|ΔP(window)\| mean 0.3 pp, max 0.8 pp; seed-to-seed max 0.8 pp |
| Calibration, 8 cells × 100 synthetic patients (`docs/CALIBRATION_RESULTS.md`) | all inside 85–95 % coverage, intervals unchanged in width, invariant to sampler settings |
| NONMEM 7.6 structural model (`docs/NONMEM_CROSSCHECK.md`) | agrees to 5 × 10⁻⁹ over 2 160 predictions |
| NONMEM POSTHOC vs the app's MAP | identical where the solution is unique; differences are local minima and the EC-MPS subgroup rule |
| NONMEM Bayesian posterior vs the app's reported AUC₁₂ / Ctrough (5 % criterion) | MMF: 100/100 patients within 5 % (max 4.3 % / 4.1 %). EC-MPS 3-sample: 42/42 fits the app accepts as converged within 5 % (max 2.1 % / 4.3 %); the 3 disagreeing patients are among the 8 the app flags "not converged" |
| App's displayed values vs NONMEM's EBE-based values | differ by > 5 % in many patients (posterior median ≠ mode); neither is closer to the truth (median error 12–24 % vs 15–25 %) |
| Paper Table III vs `src/model.js` | every model-4 value matches |

## Known limitations

- Prior: the paper reports IIV as percentages only; the app reads them as ω = CV/100. Stated in the model card;
  a wide V2 prior (ω = 4.9) is the paper's. Sparse-data intervals depend on this reading by roughly 10 %.
- The model population was ciclosporin-treated (100 % of MMF patients); tacrolimus exposure is not informed.
- The MAP shown in the diagnostics dialog is a single-start optimum and can be a local minimum with sparse
  data (NONMEM's POSTHOC behaves the same). Reported AUC, trough and probabilities come from the posterior and
  are not affected.
- 5–15 % of EC-MPS fits do not pass the convergence check (slow mixing of the absorption subgroup); the app says so.
- The verification gate in `docs/VERIFICATION_TEAM.md` has not been signed by independent human reviewers.
