# NONMEM cross-check — structural model and POSTHOC estimates

**Date:** 20 September 2026 · **NONMEM:** 7.6.0 (gfortran, ADVAN4 TRANS4, FOCE, `MAXEVAL=0`) ·
**App:** mpa-tdm v1.0.1 sources after the METHODS_AUDIT_V101 changes.

**Question.** Does the app give posthoc (empirical-Bayes) estimates similar to NONMEM's — and, for the outcomes
that matter (AUC and Ctrough), are the app's reported values within 5 % of NONMEM's?

**Bottom line for AUC₁₂ and Ctrough.** Against **NONMEM's Bayesian posterior** (same model, same patients,
population parameters frozen; part C) the app's reported posterior medians agree within 5 % for **all 100 MMF
patients** (largest difference 4.3 % AUC, 4.1 % Ctrough) and for **all 42 EC-MPS 3-sample patients whose fit the
app's own convergence check accepts** (largest 2.1 % / 4.3 %). The 8 EC-MPS fits the app flags "sampling not
converged" include every disagreement (3 patients). Against **NONMEM's EBE** (the posthoc point estimate; part B2)
the displayed values differ by more than 5 % in many patients — a posterior median is not a mode, and neither is
closer to the truth. So: no relevant difference between like-for-like posterior quantities; a large, expected
difference between a posterior median and a point estimate.

**Posthoc (parts A and B).**

**Answer in one paragraph.** The **structural model is identical to NONMEM's** (max relative difference
4.7 × 10⁻⁹ over 2 160 predictions, extreme etas included). Where the individual objective has **one
minimum**, the app's MAP and NONMEM's EBE are the same to optimiser tolerance (median max|Δη| ≈ 10⁻⁷).
They differ in two situations, both understood: (1) **the objective has more than one local minimum**
(sparse data, absorption/lag ambiguity) — each tool descends to the nearest one; the app usually, not
always, reaches the lower; (2) **EC-MPS subgroup assignment** — the app's MAP uses the joint mode, NONMEM's
`MIXEST` behaves closer to a marginal criterion. The subgroup probabilities the app *shows* come from
MCMC and agree with NONMEM's assignment in 88 % (ec-lss) / 100 % (ec-trough, uninformative).
The AUC and probabilities the app reports come from the MCMC posterior, not from the MAP, so none of this
changes them; it affects the displayed individual predictions and residuals.

## 1. Method

The two tools are given the *same model definition* (typed from Table III of de Winter 2008, which was also
checked against `src/model.js`; the ω² reading is the shipped √ω² one). So this checks the **implementation**
(equations, steady state, lag, mixture, objective, optimiser), not the paper or the ω² convention.

**A — structural.** 60 subjects per formulation, etas supplied as data (columns E1–E7, no estimation), both
tools predict concentration at 17–19 times after the last dose at steady state. MMF: one dose per 12 h.
EC-MPS: 24 h-periodic pattern (evening dose `SS=1, II=24`, morning dose `SS=2`), clock-dependent lag,
morning-lag subgroup given per subject. Etas include one-at-a-time ±1.5 ω excursions, η_V2 = +5, ka near α
(η_KA = −1.4) and ka = ×55, plus random draws (η_V2 down to −12).

**B — POSTHOC.** 4 designs × 50 subjects (mmf-lss 0.33/1/3 h, mmf-trough 12 h, ec-lss 1.5/2/4 h,
ec-trough 12 h); truth drawn from the prior, log-normal noise σ = 0.39. NONMEM: all THETA/OMEGA/SIGMA fixed,
`$EST METHOD=1 MAXEVAL=0` (EBEs only; EC-MPS with `$MIX`, `MIXEST`). The app: the shipped `runFit`, taking
`fit.map` (joint MAP over η and subgroup). Compared: etas, the app's objective evaluated at *both*
solutions, IPRED at the samples, AUC₀₋₁₂ (NONMEM: trapezoid of its own predictions on a 0.05 h grid).

## 2. Results

### A. Structural model

| formulation | subjects × times | max relative difference | mean |
|---|---|---|---|
| MMF | 60 × 17 = 1 020 | 4.7e-9 | 9.8e-10 |
| EC-MPS | 60 × 19 = 1 140 | 4.6e-9 | 8.9e-10 |

4.7 × 10⁻⁹ is the resolution of the 9-digit table output; with the default 5-digit output the figure was
4.7 × 10⁻⁵, which is only rounding.

### B. POSTHOC estimates

| design (n = 50) | identical solution¹ | median max\|Δη\| | differ |
|---|---|---|---|
| mmf-lss | 47 (94 %) | 5e-7 | 3 — NONMEM in a local minimum 2, both above the best optimum 1 |
| mmf-trough | 47 (94 %) | 9e-8 | 3 — app up to 0.009 objective units short (Δη ≤ 0.04) |
| ec-lss | 25 (50 %) | 3e-5 | 25 — different subgroup 17, NONMEM local-only 4, both above best 4 |
| ec-trough | 50 (100 %) | 3e-7 | 0 |

¹ max|Δη| < 0.01 and same subgroup. Over all subjects of a design, IPRED at the samples agrees to a median
relative difference of 4e-9 (mmf-trough, ec-trough), 3e-8 (mmf-lss) and 9e-6 (ec-lss).

**Why they differ** (each difference was re-optimised from 28 starting points per subgroup on the shared
objective and the winner's stationarity checked):

1. *Two local minima of one objective.* Example mmf-lss ID 50: gradient 10⁻⁷ at NONMEM's η and 10⁻⁶ at the
   app's, objective −1.68 vs −1.93, and it rises to −0.55 on the straight line between them (the solutions
   differ chiefly in η_KA, +1.17 vs −2.73). NONMEM's POSTHOC descends from η = 0 into the nearest minimum;
   the app's multi-restart routine found the lower one. `SIGL=14` (maximum EBE precision) changes nothing —
   this is not a tolerance effect.
2. *Both tools share a local minimum.* In ec-trough and mmf-lss many subjects have identical app/NONMEM
   solutions that are **not** the best optimum (up to 16.5 objective units higher). Verified real, not numerical:
   for ec-trough ID 80 the better mode (V2 = 5.8 L, f = 0.73 vs 17.3) was given to NONMEM's structural
   model and reproduced the app's prediction (0.0336378619 vs 0.0336378619 mg/L). A patient with a very low
   trough can be explained by a small peripheral volume or by other combinations; a start at η = 0 finds one.
3. *The app can also be the one trapped* (ec-lss ID 26: f = 9.9 with 0.75 reachable; ID 43: −0.73 vs −2.35).
   The app was above its own-subgroup optimum in 15/50 ec-lss subjects, NONMEM in 22/50.
4. *Subgroup assignment (EC-MPS).* Each solution sits at the optimum of its own subgroup; they disagree on
   which subgroup. The app picks the lowest **joint** objective (which already includes −2 ln p_m). A marginal
   criterion adds the Laplace volume term ln det ∇²f. Against that criterion NONMEM agrees in 80 % of ec-lss
   subjects and the app's joint-mode choice in 60 %. But the subgroup **probabilities the app displays** come
   from the MCMC posterior: its posterior mode agrees with NONMEM's `MIXEST` in 44/50 (88 %) ec-lss and 50/50
   ec-trough (there the data are uninformative and both return the prior mode, so that agreement is weak
   evidence).

### B2. Reported outcomes against NONMEM's EBE-based outcomes

Same 200 patients. NONMEM's AUC₁₂ (trapezoid of its EBE predictions) and Ctrough (its EBE prediction at 12 h),
against the app's **displayed** values (posterior medians) and against the app's **MAP-based** values (like for like).
Numbers are patients (of 50) beyond ±5 %, and the median relative difference.

| design | AUC: displayed vs EBE | AUC: MAP vs EBE | Ctrough: displayed vs EBE | Ctrough: MAP vs EBE |
|---|---|---|---|---|
| mmf-lss | 29 (5 %) | 2 (0 %) | 43 (15 %) | 1 (0 %) |
| mmf-trough | 20 (1 %) | 0 (0 %) | 19 (3 %) | 0 (0 %) |
| ec-lss | 45 (12 %) | 21 (0.1 %) | 45 (36 %) | 20 (0 %) |
| ec-trough | 29 (7 %) | 0 (0 %) | 44 (7 %) | 0 (0 %) |

Like for like the two agree (the EC-MPS 3-sample residue is the subgroup rule and local minima of part B). The
displayed-vs-EBE differences are estimator differences. Against the **known true values** of these simulated
patients the median error of AUC₁₂ is 15 / 18 / 23 / 25 % for NONMEM's EBE and 12 / 17 / 20 / 24 % for the app's
posterior median (mmf-lss / mmf-trough / ec-lss / ec-trough); for Ctrough 34 / 17 / 36 / 23 % and 21 / 18 / 37 / 25 %.
Only 4–26 % of patients are within 5 % of the truth for either tool, and the disagreement between them is smaller than
each one's own error. That is the price of one to three samples and this much between-patient variability.

### C. Bayesian posterior: the app's reported outcomes against NONMEM

NONMEM `$EST METHOD=BAYES BIONLY=1 BAYES_PHI_STORE=1` keeps the population parameters fixed and samples each
patient's etas; every retained sample's AUC₁₂ and Ctrough are computed with the app's model code (legitimate:
part A). The app: the shipped `runFit` at its default budget. Criterion, fixed before looking: share of patients whose
posterior-median AUC₁₂ and Ctrough agree within ±5 %.

**MMF** (6 000 samples per patient after 2 000 burn-in; NONMEM's AUC chain: median ESS 4 429, minimum 893, R̂ ≤ 1.006):

| design | AUC₁₂ within 5 % | largest | Ctrough within 5 % | largest |
|---|---|---|---|---|
| mmf-lss | 50/50 | 1.3 % | 50/50 | 4.1 % |
| mmf-trough | 50/50 | 4.3 % | 50/50 | 2.0 % |

AUC 5th/95th percentile within 5 % for 98–100 % of patients; P(within window) differs by 0.4–0.5 pp at the median,
3.6 pp at most. The Ctrough 5th percentile (an extreme tail of a very skewed distribution) agrees within 5 % for only
24/50 mmf-lss patients; the median does.

**EC-MPS.** Here NONMEM's BAYES with `$MIX` does not give a list of posterior samples: it writes four rows per
subject and iteration (`SUBPOP` 0–3) with a `PMIX` weight. **A first comparison that treated those rows as samples was
wrong and is not used**: it suggested large disagreement (13/50 within 5 %), which disappeared when the subgroup was
handled differently. Its own mean `PMIX` is not the marginal subgroup probability either — it differs from the exact
importance-sampling value by a median of 23 pp. The unambiguous design (50 EC-MPS 3-sample patients):

* within-subgroup posterior: NONMEM BAYES run three times with the subgroup fixed (data column, no `$MIX`),
  1 500 burn-in + 5 000 iterations each;
* subgroup probabilities: NONMEM IMP (`EONLY=1`, 4 000 samples) per fixed subgroup; its individual −2 log-likelihood
  gives P(m | data) ∝ p_m·exp(−OBJ_m/2);
* mixture posterior: the three sample sets pooled with those weights.

| app fits | n | AUC₁₂ within 5 % | largest | Ctrough within 5 % | largest | P(window) largest \|Δ\| |
|---|---|---|---|---|---|---|
| converged (app's own check) | 42 | 42 | 2.1 % | 42 | 4.3 % | 2.2 pp |
| flagged "not converged" | 8 | 6 | 9.6 % | 6 | 94 % | 11.1 pp |
| all | 50 | 48 | 9.6 % | 48 | 94 % | 11.1 pp |

Subgroup probabilities, app vs exact: modal subgroup agrees 49/50; largest per-patient difference median 0.9 pp,
90th percentile 4.6 pp, maximum 23.9 pp (all three patients over 10 pp are in the flagged group). The
trough-only design cannot separate the subgroups (posterior ≈ prior for both tools) and was **not** repeated with
this method, so EC-MPS trough-only outcomes have no valid NONMEM Bayesian comparison in this study.

**Reading.** The three patients that disagree (IDs 4, 26, 31) are all ones on which the app printed its own
"sampling not converged" badge — the diagnostic added in v1.1.0 does what it is for. The wide Ctrough difference
(94 %) is ID 4: app median 1.06 mg/L against NONMEM 0.55 mg/L, a patient the app flagged as not converged.

## 3. What it means for the app

* **Reported results are unaffected.** AUC₁₂, its interval and the window probabilities come from the MCMC
  posterior (8 chains from disperse starts). The MAP is used for the "individual predicted" values, the
  residual table and the goodness-of-fit plot, and as chain 0's start and the source of the proposal covariance
  (shrinkage is computed from the MCMC draws, not the MAP).
* **The MAP is not guaranteed to be the global mode** — true of NONMEM's POSTHOC too. With sparse data,
  compare individual predictions with care. A cheap improvement (not made here, since it changes displayed
  values): run the MAP from a handful of starts (zero plus a few prior draws) and keep the lowest objective;
  and choose the EC-MPS MAP subgroup by the marginal (Laplace) criterion, or use the MCMC modal subgroup.
* NONMEM users get the same behaviour unless they supply several initial etas.

## 4. Limits

* One NONMEM version/compiler; ADVAN4 is analytical, so no ODE solver was compared.
* Synthetic patients from the model itself: this tests the implementation, not fit to real data.
* Parameters and the ω² reading are shared by construction; an error in the paper's Table III or in the
  √ω² interpretation would not be found here.
* The Bayesian comparison (part C) freezes the population parameters, as does the app; it says nothing about
  population-parameter uncertainty. The EC-MPS subgroup weights come from NONMEM's importance sampling
  (Monte Carlo error of a few tenths of −2LL); EC-MPS trough-only patients were not repeated with the
  fixed-subgroup method, and one NONMEM run (one seed) was made per patient.
* NONMEM's individual OFV was not compared: under FOCE it includes a determinant term the app's MAP
  objective does not; the app's objective was instead evaluated at both solutions.

## 5. Reproduce

```bash
tools/nonmem_verify/run.sh [workdir]           # parts A and B (about 20 s); NMFE=/path/to/nmfe76 overrides the default
tools/nonmem_verify/run_bayes.sh <workdir>     # part C (about 30 min): NONMEM BAYES / IMP, then the comparison
node tools/nonmem_verify/export_golden.mjs <workdir>   # refresh tests/nonmem_golden.json
```

`npm test` includes two tests against `tests/nonmem_golden.json` (20 structural cases, 11 posthoc cases
where the solution is unique); they fail if the structural model, the residual σ or the EC-MPS lag change.
