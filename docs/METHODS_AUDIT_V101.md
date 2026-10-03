# Independent methods audit — MPA TDM v1.0.1

**Date:** 20 September 2026
**Subject:** `mpa-tdm` v1.0.1 (de Winter 2008 integrated), as found on disk.
**Mandate:** are the methods correct, does the app return correct information, is it fast
enough — reviewed as a pharmacometrician, a JS/HTML engineer and a statistician.
**Method:** line-level reading of `src/*` and `docs/*`, plus **independent numerical
re-derivation**: a second implementation of the same model and the same objective
function, written from the published equations rather than from this code, used as the
reference against which the app's engine, its Monte Carlo output and its runtime were
measured. Every quantitative claim below is reproducible; the probes are in Appendix B.

**This document is the filled-in answer to the mandate in `docs/VERIFICATION_TEAM.md`,
whose verdict table is still `pending` for all five reviewers.**

---

## Resolution status (added 20 September 2026, app version 1.1.0)

**The text below is the audit as written against v1.0.1 and is left unchanged.** This section records what
became of each finding. Every fix was made test-first: the new assertion was shown failing against the old
code (or a sabotaged fix) before it was trusted. The suite grew from 56 to 104 tests; `tools/verify_model.mjs`
passes. Evidence for the numerical claims is in `docs/CALIBRATION_RESULTS.md` and `docs/NONMEM_CROSSCHECK.md`.

| ID | Status | Outcome |
|---|---|---|
| **F1** | **Fixed** | Default budget 8 × 100 000 iterations, 32 000 kept draws. On 8 synthetic patients × 2 seeds: R̂ < 1.01 on 16/16, \|ΔP(window)\| vs the independent reference mean 0.3 / max 0.8 pp (the old 8 × 300 budget on the new engine: 6.5 / 42.9 pp), seed-to-seed max 0.8 pp. Pinned by `tools/reference_posterior.mjs` and a test. A full fit takes ≈0.5 s in the browser. |
| **F2** | **Fixed** | Hastings term added; two exact-answer tests (audit probe B1 and an informative-likelihood case). Membership on trough-only data now returns the prior (51/32/17 %), not its square. |
| **F3** | **Fixed** | Full-schedule history shorter than 5 typical terminal half-lives (≈199 h) raises the "not steady state" badge and a report note; the single-dose flag is kept. |
| **F4** | **Fixed** | The report is built from a snapshot taken with the forecast and carries an "inputs changed" stamp if the screen changed afterwards (verified in the browser). |
| **F5, F6** | **Fixed** | ±2 SD band is multiplicative for the log error model; shrinkage bars show every eta. Tests run on the shipped spec. |
| **F7** | **Fixed, with one change to the recommendation** | Split-R̂ and bulk ESS from per-chain draws; warning badge and report note. The bar (R̂ < 1.01, ESS ≥ 400) is applied to the **printed quantities (AUC₁₂ and trough)**, not every eta: in the calibration population up to half of the fits failed on V2 / TLAG_EVE while the AUC matched the independent reference to 0.4 pp. Slowly mixing etas are listed as information. |
| **F8** | **Re-framed, then documented** | The paper tested ciclosporin as a clearance covariate and found no significant effect (pp. 835–836); the real caveat is that 100 % of MMF and 72 % of EC-MPS patients were on it, so MMF exposure without it (e.g. tacrolimus) is not informed. Model-card entry added. |
| **F9** | **Fixed** | Closed-form propagation (RK45 kept as the cross-check oracle, agreement < 1e-6), exact steady state, analytic AUC. Node: 49-point profile ×86, likelihood evaluation ×1290, full fit 109 s → 0.1 s. |
| **F10** | **Fixed** | Report prints dosing-input mode and recency preset. (LLOQ and error multiplier were later removed by owner decision R4.) |
| **F11** | **Done** | All 8 cells re-run at n = 100 on the converged engine, exact steady-state truth. All inside 85–95 %; widths within −4 %…+9 % of v1.0.1; intervals invariant to chains / iterations. One residual: 85–95 % of EC-MPS fits meet the convergence bar (subgroup mixing). |
| **F12** | **Fixed (as listed)** | Window bounds and LLOQ (LLOQ later removed). `pt-wt`, `pt-age`, `ss-interval` also carry step grids and were not on the audit's list. |
| **F13** | **Fixed** | README corrected; Crossref confirms *Lupus Sci Med* 2024;11(1):e001093. |
| **F14** | **Recorded, not decided** | `VERIFICATION_TEAM.md` states the gate was neither satisfied nor waived and that this audit is not independent human review. Verdict cells stay `pending`. |
| **F15** | **Fixed** | 7.6 % at 10 doses, 6.2 % at 11, corrected in three documents and locked by tests. |
| **F16** | **Fixed** | `SS_N_DOSES`, `runFit`'s `reuse`, `tlagV`, `pediatricWarn` removed. |
| **F17** | **Documented** | Model-card note: a history is one formulation. The UI has one selector, so there is nothing to block at entry. |
| **F18** | **Fixed** | Residual colours in σ units (green ≤ 1.5σ, amber ≤ 2.5σ). |
| **F19** | **Not implemented — measured and rejected** | A 170 h terminal-half-life cap was built and tested. It **widened** the ω² convention gap (trough-only interval width 11 → 19 %, P(window) 3.6 → 6.0 pp) and shifted ordinary 3-sample results by 4.2 pp on average (max 8.9), because it removes ≈39 % of the shipped prior but ≈22 % of the exact-log-normal one. Reverted. The manuscript reports IIV only as percentages (Table III) and gives V2's IIV a bootstrap range of 171–293 500 %, so the wide V2 prior is the paper's. Prior kept; the convention and its sparse-data effect are stated in the model card. |
| **F20** | **Fixed** | Exact steady state: no-sample forecast reads 46.7 mg·h/L (was 37.0), P(window) 59 % (was 49 %). Only in steady-state mode; a typed short history is covered by F3. |
| **F21** | **Fixed** | The closed form has no integration failures at any ka. |
| **F22** | **Not implemented** | Fits take ≈0.5 s; the progress bar no longer matters. Not verified in a browser. |
| **F23** | **Fixed** | Separate chart grid; the AUC/trough grid is untouched (test). The audit's worst case (evening-ending EC-MPS) verified in the browser. |
| **S4, S5** | **Not needed** | Explorer is instant; a worker is unnecessary at 0.5 s. |
| **R1** | **Done (owner: remove completely)** | Assay field removed; old session keys ignored. |
| **R2** | **Done** | IV route removed; imported IV doses coerced to oral. |
| **R3** | **Done** | With F23. |
| **R4** | **Done — option (a), owner decision** | LLOQ, error multiplier and the per-sample "< LLOQ" box removed; **M3 censoring removed from the engine**. `runFit` refuses a censored sample; old session files import with a message naming how many were left out. This retires audit item OK6. |

**Audit conclusions that held.** OK1–OK5 (objective function, ODE accuracy, AUC grid, golden anchors, AUC₁₂
normalisation) were re-confirmed independently by the NONMEM cross-check: the structural model reproduces NONMEM
7.6 to 5 × 10⁻⁹ (2 160 predictions, extreme etas included). OK8 (the app never recommends a dose) is unchanged.

**Found while doing the work, not in the audit.**
1. The calibration tool built its *truth* from a 31-dose reconstruction plus trapezoid, biased for slow-V2
   patients; corrected to the exact steady-state integral.
2. NONMEM comparison (`docs/NONMEM_CROSSCHECK.md`): the app's MAP, like NONMEM's POSTHOC, is a single-start
   optimum and can sit in a local minimum with sparse data; in EC-MPS the app's MAP picks the subgroup by joint
   objective, NONMEM's `MIXEST` closer to a marginal criterion. The reported outcomes are not affected: against
   NONMEM's Bayesian posterior the app's AUC₁₂ and Ctrough medians agree within 5 % for all 100 MMF patients and
   for all 42 EC-MPS 3-sample patients whose fit the app's own convergence check accepts; the three that
   disagree are among the eight it flags. (A first EC-MPS comparison that misread NONMEM's `$MIX` output was
   invalid and was discarded; the report says how.)
3. EC-MPS sampling: 5–15 % of fits still miss the convergence bar (slow mixing of the discrete subgroup);
   doubling iterations does not fix it.

### Addendum (2 October 2026, app version 1.2.1) — ST4: "shrinkage" was information gained

**Defect.** `B.shrinkageOf` (and so `fit.shrink`) returned 1 − Var(posterior)/ω², the share of the prior variance
the samples *removed*. Everything that consumed it for MPA read it as shrinkage (Var/ω², high = the data did not
move the estimate): the diagnostics bars were red (> 60 %) for well-informed parameters and empty for uninformed
ones, and the results note "the AUC interval largely reflects population variability" (trigger: CL value > 80 %,
`docs/IMPLEMENTATION_PLAN_DEWINTER_2008.md` ST4/UX4) fired for data-rich fits and never for sparse ones. The audit
did not list it; it surfaced when tacrolimus was added, whose code was written for the information reading.

**Fix: redefine the quantity, keep the wording.** The labels, the colour bands (≥ 60 % red, ≥ 30 % amber) and the 80 %
trigger were all *written* for shrinkage, so only the number was wrong. `shrinkageOf` now returns Var(post)/ω²
clamped to [0, 1]; the MPA bars show it; `DG.shrinkageNote(fit)` (new, `src/diagnostics.js`) holds the trigger so it
can be tested. The 80 % threshold is the planned one: nothing in `docs/` or the owner's decisions objects to it, so it
is unchanged. Tacrolimus is unchanged in behaviour — it keeps its information-gained bars and its `< 0.3` note, now
written `1 − fit.shrink[CL] < 0.3` (identical values, since 1 − clamp(v/ω²) = clamp(1 − v/ω²)).

**Measured** (MMF 1000 mg q12h steady state, seed 5, 4 × 8000 iterations; CL; "old" is what the app showed in
v1.2.0 and earlier, "new" is shrinkage; ratio = AUC 95th/5th percentile):

| Fit | old value (info) | **new (shrinkage)** | AUC p95/p5 | note, old → new |
|---|---|---|---|---|
| population forecast (no samples) | 0.00 | **1.00** | 3.62 | no → **yes** |
| trough only (1.5 / 3.0 / 6 mg/L) | 0.50 / 0.61 / 0.58 | **0.50 / 0.39 / 0.42** | 2.45 / 2.24 / 2.24 | no → no |
| 2 samples (1 h, 3 h) | 0.40 | **0.60** | 2.81 | no → no |
| 3-point LSS (0.33, 1, 3 h) | 0.35 | **0.65** | 2.83 | no → no |
| 4 samples (LSS + trough) | 0.73 | **0.27** | 1.94 | no → no |
| 6 samples (0.33–6 h) | 0.75 | **0.25** | 1.89 | no (an owner-measured 6-sample fit read 0.85 → yes) → no |
| EC-MPS: population / trough / 3-point | 0.00 / 0.27 / 0.63 | **1.00 / 0.73 / 0.37** | 3.94 / 2.88 / 2.72 | no → yes / no / no |

**What the numbers say about the threshold.** 80 % separates "no samples at all" from every fit that has a sample;
it fires for the population forecast only. CL shrinkage is not a tight proxy for interval width (the 3-point LSS has
CL shrinkage 0.65 yet a wider AUC interval than a trough-only fit at 0.4–0.5, because the AUC then depends on the
other parameters too), so no CL threshold between 0.65 and 1 would catch a sparse-but-sampled fit without also
catching a good LSS. A trigger that tracks the *interval* (width relative to the population forecast's) would be the
more faithful one, at the cost of carrying a reference width into every fit; it was not built — owner's call.

**Tests** (`tests/run_all.js`, "ST4"): all five shown red against the v1.2.0 code (the fifth is a structural guard
for the tacrolimus side), then green; additionally sabotaged four ways (engine back to
information; bars not flipped; trigger inverted; trigger 0.5) and each went red on the intended test.

---

## 0. Bottom line

**Is this the ideal app?** No — but the gap is narrower, and in a different place, than a
reviewer would expect. The *deterministic* half of this app — the model, the
parameterisation, the ODE solver, the dose stoichiometry, the AUC contract — is correct to
six decimal places against an independent implementation. The *stochastic* half — the part
that turns that model into the number a clinician reads — is the weak link, and it is weak
in a way the existing test suite and the calibration record structurally cannot see.

| The three questions | Verdict |
|---|---|
| **Does the Bayesian method correspond to de Winter et al. 2008?** | **The structural model does; the probability model and the posterior do not (yet).** The compartmental model, parameters, formulation covariate, lag-time mixture, dose conversion and log-residual likelihood are faithful — an independent closed-form reimplementation reproduces the app's objective function to 6 decimal places (**OK1**). Against that: the membership sampler targets the *squared* prior (**F2**, undocumented defect); the ω² convention chosen for the IIV generates a prior containing physiologically impossible patients (**F19**); and the MCMC does not converge, so the printed interval is not the posterior of the stated model (**F1**). |
| **Does the app return correct information?** | **The individual point estimate usually; the uncertainty and several displayed numbers, no.** Sound: the AUC₁₂ contract, window probabilities, M3 censoring, the no-dose-advice rule. Not sound: P(within window) carries a mean absolute error of **8 pp** and a maximum of **28 pp** against the true posterior (**F1**); the population-forecast mode reports a median **20 % below the model's own typical value** (**F20**); a short dose history is silently reported as steady state, up to −26 % (**F3**); the printed report can combine a stale fit with edited inputs (**F4**); two diagnostics panels are silently broken for the shipped model (**F5**, **F6**). |
| **Is it fast enough?** | **No — and it does not need to be slow.** 44 s per fit, of which **99.9 % is inside the ODE solver** and two thirds is the MCMC. The model is *linear*, so that solver is unnecessary: closed-form propagation agrees to 3×10⁻⁵ % and is **109× faster** for profiles and **1530× faster** for likelihood evaluations; an exact steady-state formula removes the 31-dose history entirely (**×5582**) and fixes F20 as a side effect. A converged 2 000 000-iteration posterior took **8 seconds** this way — 800× the app's sampling budget in a fifth of its runtime. **§4** works through the measures, measured. The runtime is not a comfort issue: it is precisely what forces the sampling budget that causes F1, so the speed fix and the correctness fix are the same fix. |

**Fitness for practice:** not yet, and the blocker is F1 — not because the app is careless,
but because a tool that prints "P(within window) = 65 %" must produce the same number
twice, and must produce the right one. The good news is that F1, F19 and F9 are one piece
of work with a clear design, and once it lands, this becomes a genuinely strong tool with
an unusually good evidence trail behind it.

---

## 1. What I verified as correct

Not assumed — each re-derived independently and measured.

| ID | Verified | Evidence |
|---|---|---|
| **OK1** | **The objective function is exactly the de Winter model.** A closed-form 2-compartment solution with first-order absorption + lag, written from the published equations, reproduces the app's OFV at an arbitrary η. | app (ODE) `4.288998` vs reference (closed form) `4.289000`; the residue is the constant `Σ ln σ²` term, which cannot affect the posterior. |
| **OK2** | **The ODE solver is accurate.** No stiffness failure despite the 100× rate spread (ka 4.1 vs k21 0.042 /h) that `S8` flags. | max relative concentration error vs the exact solution **2.8×10⁻⁵ %** across 4 parameter sets including extreme etas. |
| **OK3** | **The AUC trapezoid grid is adequate.** 48 intervals per 12 h. | error vs the exact integral **≤ 0.13 %** (MMF), **≤ 0.05 %** (EC-MPS) — inside the claimed 0.2 % budget. At 24 intervals it would be 1.6 %, so the choice is load-bearing and correct. |
| **OK4** | **Mass-balance golden anchors hold.** | MMF 739 mg MPA → 46.08 vs analytic 46.19 (−0.2 %); EC-MPS morning 45.25 / evening 39.08, sum 84.3 = 2 × 674/16 ✓. |
| **OK5** | **The AUC₁₂ normalisation is exactly what it claims.** ×12/x per draw is positive-linear, so quantiles and window probabilities map exactly. | code review + test `AUC12 normalization: quantile-exact per draw`. |
| **OK6** | **M3 censoring is right**, on the log scale, and `runFit` *refuses* a `< LLOQ` sample with no LLOQ value rather than silently fitting a zero. This is the most commonly botched thing in TDM software and it is handled correctly and tested. | `makeOfv`; audit tests S1/C1. |
| **OK7** | **Dose stoichiometry** ×0.739 / ×0.936 at one conversion point, both units carried into report and session. | `toMpaMg`, test V7. |
| **OK8** | **The "never recommends a dose" rule holds** across engine, UI copy, explorer and report. No titration logic exists anywhere in the code. | full read of `src/ui.js`, `doseScan`. |
| **OK9** | **Offline / dependency-free / escaping.** No external resources of any kind; `esc()` on every user-input path into `innerHTML`; session JSON round-trips; the build is deterministic and the artifact matches its sources. | `grep` for external URLs (none); rebuild diff = build stamp only. |
| **OK10** | 56/56 tests pass (40 s); `tools/verify_model.mjs` strict passes. | `npm test`. |

The documentation standard here — `MODEL_ANALYSIS`, `IMPLEMENTATION_PLAN`,
`CALIBRATION_RESULTS`, the S1–S12 scrutiny trail — is better than most published
pharmacometric software. Several findings below were *found using* that documentation.

---

## 2. Findings summary

Severity = consequence if it reaches a patient. Priority = order of work.
**P1 = before any use in practice · P2 = next release · P3 = backlog.**

| ID | Area | Finding | Severity | Priority |
|---|---|---|---|---|
| **F1** | Statistics | MCMC not converged: P(within window) errs by 8 pp on average, 28 pp worst case, and moves ±8 pp with the RNG seed alone | **Critical** | **P1** |
| **F19** | Pharmacometrics | The √ω² convention makes a prior containing impossible patients (15 % with terminal t½ > 1 year); not AUC-benign for sparse data | **High** | **P1** |
| **F20** | Clinical | Population-forecast mode reports a median 20 % below the model's own typical value (37.0 vs 46.2 mg·h/L) | **High** | **P1** |
| **F2** | Statistics | The mixture-membership sampler targets the **squared** prior (missing Hastings correction) | **High** | **P1** |
| **F3** | Clinical | A short dose history in "Full schedule" mode is reported as steady state, unwarned; −26 % at 2 days | **High** | **P1** |
| **F4** | Engineering | The printed report can mix a stale fit with edited inputs, with no stale marker | **High** | **P1** |
| **F9** | Performance | 44 s per fit; the model is linear, so a closed form is 109–1530× faster and removes the budget that causes F1 | **High** | **P1** |
| **F5** | Engineering | The ±2 SD band in the goodness-of-fit plot is NaN for the shipped error model; the legend promises a band that never draws | Medium | P2 |
| **F6** | Engineering | Shrinkage bars for all lag-time etas always read "–" (`omegaVars` called without the formulation) | Medium | P2 |
| **F7** | Statistics | No convergence diagnostic: 8 chains run but no R̂; ESS computed on the pooled chain and optimistic; nothing warns the user | Medium | P2 |
| **F8** | Pharmacometrics | The model card omits that the source population was ~100 % ciclosporin co-treated — the largest unmodelled effect on MPA exposure | Medium | P2 |
| **F10** | Traceability | LLOQ, error multiplier and recency weighting are not printed in the report although About states they are | Medium | P2 |
| **F11** | Statistics | Coverage was recovered by a configuration change that widens intervals, not by better sampling; the record must be re-run | Medium | P2 |
| **F21** | Engineering | 1.3 % of prior draws fail ODE integration (high ka); failures are silent — `Infinity` in the fit, dropped from the AUC summary | Medium | P2 |
| **F23** | Clinical UX | The chart's x-axis is locked to [0, τ] after the anchor, so samples outside that window are silently not drawn — for an evening-ending EC-MPS schedule **all** samples vanish | Medium | P2 |
| **F18** | Clinical UX | Residual colour thresholds (30 %/60 %) not derived from σ = 0.39; ~12 % of ordinary samples are flagged red | Low–Med | P2 |
| **F22** | Engineering | Progress updates yield with `await Promise.resolve()` (a microtask), which does not let a browser repaint — the progress bar is likely frozen for the whole fit | Low–Med | P2 |
| **F12** | Engineering | Rule 7c violations: `step` grids on the window bounds and LLOQ | Low | P3 |
| **F13** | Documentation | README and app cite different journals for the lupus nephritis reference | Low | P3 |
| **F14** | Process | `docs/VERIFICATION_TEAM.md` verdict table entirely `pending`; v1.0.1 shipped without it | Low | P3 |
| **F15** | Documentation | The recorded SS deficit at n = 10 (4.4 %) is optimistic; measured −7.6 % | Low | P3 |
| **F16** | Engineering | Dead code: `SS_N_DOSES`, `runFit`'s `reuse` path, `tlagV`, `pediatricWarn` | Low | P3 |
| **F17** | Clinical | Mixed MMF↔EC-MPS histories are neither supported nor blocked | Low | P3 |

---

## 3. Findings in detail

### F1 — Critical — The reported posterior is Monte Carlo noise, not the posterior

**What.** The shipped configuration is 8 chains × 300 iterations, 40 % burn-in, pooled →
1440 draws (`src/bayes.js`: `nChains = 8`, `totalIters = 2000`, per-chain floor 300). Seven
of the eight chains start at *disperse prior draws* and get **120 burn-in iterations** at
~24 % acceptance — about 29 accepted moves — before their output is treated as posterior.
They have not arrived anywhere. Reported ESS was 37–116 per eta.

**Evidence 1 — the answer depends on the seed.** Same patient, same data, same code; only
`input.seed` changed:

| seed | AUC₁₂ median | 5–95 % | P(within 30–60) | P(> 60) |
|---|---|---|---|---|
| 1000 | 56.0 | 38.3 – 77.1 | 57 % | 43 % |
| 1137 | 50.8 | 28.3 – 73.9 | 65 % | 28 % |
| 1274 | 53.9 | 28.9 – 74.7 | 63 % | 31 % |
| 1411 | 54.1 | 35.7 – 78.2 | 62 % | 36 % |
| 1548 | 53.1 | 29.2 – 75.2 | 64 % | 31 % |
| 1685 | 52.2 | 32.2 – 81.2 | 63 % | 35 % |

P(above the upper bound) ranges **28 %–43 %** on identical data; the lower bound of the
reported interval ranges 28.3–38.3 mg·h/L — one of those is inside the therapeutic window
and one is well below it.

**Evidence 2 — the answer depends on the budget, and the app's own sampler converges to
the reference when given enough of it.** Same patient, same seed, `mcmcIters` varied,
against the independent reference chain of Evidence 3:

| configuration | engine | median | 5–95 % | wall |
|---|---|---|---|---|
| 8 × 300 **(shipped)** | app (ODE) | 50.5 | 29.8 – 71.0 | 44 s |
| 8 × 1000 | app (ODE) | 53.7 | 35.4 – 74.6 | 101 s |
| 8 × 10 000 | app (ODE) | 54.0 | 32.8 – 76.6 | 1 870 s |
| 1 × 200 000, MAP start, no pooling | app (ODE) | **54.1** | **31.2 – 77.0** | 4 018 s |
| **independent reference**, 4 × 500 000 | closed form | **53.7** | **32.7 – 77.3** | **8 s** |

This is the cleanest statement of the finding: **the engine is right and the budget is
wrong.** Three independent routes to the same answer — the app's multi-chain sampler at 40×
budget, a single long MAP-started chain in the app's own ODE engine with the pooling scheme
switched off entirely, and a separately written closed-form implementation — agree within
Monte Carlo error. Only the shipped configuration disagrees. That also rules out the
multi-chain pooling design itself as the culprit: pooling is a reasonable scheme starved of
iterations, not a wrong one.

The last two rows are also F9 in miniature: the same posterior, to the same precision, in
**8 seconds instead of 67 minutes**, because one of them is not solving an ODE.

**Evidence 3 — against a gold standard.** Using the closed-form likelihood (OK1, F9) the
*same model, same objective* was run for 2 000 000 iterations (8 s); three independent
replicates, including 12-chain disperse-start variants, agree to ±0.2 mg·h/L on the median
and ±0.5 pp on P(window). Eight synthetic MMF patients, 1000 mg BID, 3-point LSS
(0.33/1/3 h), window 30–60:

| pt | true AUC₁₂ | app median [5–95 %] | app P(in) | reference median [5–95 %] | ref P(in) | ΔP |
|---|---|---|---|---|---|---|
| 0 | 38.3 | 29.3 [19.1, 42.6] | 47 % | 29.0 [18.3, 43.6] | 45 % | +2 pp |
| 1 | 52.6 | 52.9 [33.4, 82.8] | 64 % | 54.3 [33.4, 83.9] | 62 % | +2 pp |
| 2 | 84.7 | 62.4 [37.9, 108.3] | 43 % | 55.3 [35.2, 91.9] | 59 % | **−16 pp** |
| 3 | 25.2 | 20.5 [10.9, 48.3] | 30 % | 18.9 [12.9, 27.7] | **2 %** | **+28 pp** |
| 4 | 48.6 | 43.1 [26.6, 86.1] | 68 % | 44.0 [27.8, 71.4] | 77 % | −9 pp |
| 5 | 49.1 | 35.7 [24.5, 59.2] | 69 % | 35.0 [21.1, 53.0] | 69 % | 0 pp |
| 6 | 30.7 | 28.9 [18.9, 43.5] | 43 % | 29.8 [19.2, 45.6] | 49 % | −6 pp |
| 7 | 40.7 | 42.9 [28.1, 74.1] | 80 % | 43.3 [27.8, 64.9] | 82 % | −2 pp |

**mean |ΔP(within window)| = 8.1 pp, maximum 28 pp.**

**Patient 3 is the clinically dangerous case and worth reading closely.** True AUC₁₂ 25.2 —
an under-exposed patient. The true posterior is tight and unambiguous: [12.9, 27.7],
P(within window) **2 %**. The app reports [10.9, 48.3] and P(within window) **30 %**. Its
upper bound is 74 % too high. The reference was re-verified for this patient with 12
disperse-start chains under two independent seeds (median 19.0/19.1, P(in) 2.4 %/2.8 %) —
it is the app that is wrong, not the reference.

The mechanism is specific: this patient's data are *informative*, so the posterior sits far
from the prior; the seven prior-started chains spend their 120 burn-in iterations still in
transit and then contribute prior-like draws to the pool. **The more informative the
samples, the worse the over-dispersion** — the opposite of the behaviour a TDM tool needs.
(F19 makes this worse: the prior those chains start from contains impossible patients.)

**Why it matters more than the numbers suggest.** Because the seed is hard-coded
(`seed: 20250907` in `buildRunInput`), the app is *reproducible* — the same case always
shows the same 30 %. Reproducible and accurate are not the same thing, and here the app
looks like the former while being neither. Nothing in the test suite compares the sampler's
output to anything external, so nothing can catch it.

**Fix.** Not a patch to the sampler's logic — the Metropolis kernel is correct (symmetric
proposal, correct log acceptance ratio, Laplace-scaled full covariance, whose scale is
near-optimal at this dimension: observed acceptance 23.7 % against the 23.4 % asymptotic
optimum). The problem is purely budget. F9 removes the constraint: 10⁵ iterations per chain
becomes sub-second. Then raise the budget until R̂ < 1.01 and ESS > 400 (F7), and re-run the
calibration (F11).

---

### F19 — High — The ω² convention builds a prior containing impossible patients

**What.** `docs/MODEL_ANALYSIS` §A/S1 correctly identifies that the paper's "IIV (%)" is
ambiguous: CV = √ω²·100 (NONMEM-era shorthand) or the exact log-normal
CV = √(exp(ω²)−1)·100. For CL/Q/V1/tlag the two agree; for **ka (187 %) and V2 (490 %)**
they differ 2–7×. The app chose √ω², i.e. ω_V2 = 4.90, ω_KA = 1.87, documented it, and
recorded it as AUC-benign on the strength of calibration arm A.

**Evidence that the resulting prior is not physiological.** 2000 draws from the prior:

| convention | ω(V2) | V2 p5 / p50 / p95 | terminal t½ p50 / p90 | t½ > 1 week | t½ > 1 year |
|---|---|---|---|---|---|
| **√ω² (shipped)** | 4.90 | 0 / 533 / **1 776 898 L** | 42 h / 27 801 h | **40 %** | **14.9 %** |
| exact log-normal | 1.79 | 24 / 523 / 10 206 L | 43 h / 473 h | 23.6 % | 0.1 % |

MPA's published terminal half-life is ≈ 17 h. Under the shipped prior, **15 % of virtual
patients have an MPA terminal half-life longer than a year** and the 95th percentile of the
peripheral volume is 1.8 million litres. No reading of the source paper intends that.

**Evidence that it is not AUC-benign.** Same patient, same data, only `ETA.iiv` swapped:

| scenario | √ω² (shipped) | exact log-normal |
|---|---|---|
| 3-point LSS | 50.5 [29.8, 71.0], P(in) 70 % | 54.0 [32.4, 71.2], P(in) 71 % |
| trough only | 44.2 [26.6, 84.8] — **width 58.1** — P(in) 72 % | 42.9 [28.9, 67.8] — width 38.9 — P(in) **82 %** |
| no samples | 37.1 [12.8, 79.3], P(in) 49 % | 42.8 [21.1, 79.0], P(in) **61 %** |

The reported interval for a trough-only fit is **49 % wider** under the shipped convention
and P(within window) differs by 10 pp; the population forecast differs by 12 pp. With a
rich LSS the difference is small — which is what arm A measured.

**Why arm A said "benign" and is not wrong.** Arm A generated truth under the exact
convention and fitted with √ω², then measured *coverage* — 92 %, fine. Coverage is
preserved because a wider interval still covers. The question a clinician asks is different:
*what number does the app print?* That number moves by 10–12 pp in exactly the sparse-data
cases where the app is most likely to be used. Coverage-benign ≠ report-benign.

**Recommendation** (not "switch conventions" — that is the authors' call):
1. Keep `docs/AUTHOR_QUERY.md` in flight; this finding strengthens the case for sending it.
2. Meanwhile, **bound the prior to physiology**: reject or truncate draws whose terminal
   half-life exceeds a defensible maximum (say 10× the published 17 h). This is a smaller
   assumption than either convention and it removes the impossible tail that drives F20.
3. State the sparse-data sensitivity in the model card, next to the existing ω² note. The
   current wording ("AUC-benign") is only true for rich sampling and should say so.

---

### F20 — High — The population forecast is 20 % below the model's own typical value

**What.** Run the app with a standard regimen and no samples — the first sanity check any
pharmacometrician performs:

```
APP population forecast, MMF 1000 mg BID, no samples:
  AUC12 median 37.0   5–95% [12.8, 79.3]   P(within 30–60) 49%
  model typical value (mass balance 739/16)  = 46.19
  app's own deterministic typical patient    = 46.07   <-- the engine is fine
```

The engine computes the typical patient correctly (46.07). The *population forecast* the
user sees is 37.0 — **−20 %**, and it drags P(within window) down to 49 %. This is a
systematic bias, not Monte Carlo noise: at 4000 prior draws the median over four seeds is
36.6 / 35.7 / 36.2 / 36.2.

**Cause** (a direct consequence of F19). Draws with an enormous V2 have k21 = Q/V2 near
zero and never approach steady state within the reconstructed history, so their AUC over
the window is far below their true steady-state value. Deepening the reconstruction barely
helps, because for those draws no finite history reaches steady state:

| SS reconstruction depth | 30 (shipped) | 60 | 120 | 200 | 400 |
|---|---|---|---|---|---|
| population median AUC₁₂ | 36.6 | 38.6 | 40.5 | 40.8 | 41.9 |

**Note on S2.** `ssNDoses = 30` was derived from the *typical* terminal t½ ≈ 40 h and is
correct for the typical patient — the golden anchors prove that. What was not checked is
that the same depth is applied to every posterior/prior draw, including draws for which it
is nowhere near sufficient. For a draw at η_V2 = +5 the 30-dose reconstruction reads
**−55.6 %** against mass balance; at 400 doses it is still −32.6 %.

**Fix — and it is the same work as the speed fix.** The *exact* steady state of a linear
model under periodic dosing is available in closed form (§4, measure S2): it needs no dose
history at all, and it is right for every draw regardless of half-life. Measured on the
same pathological draw: exact SS = 46.1875, i.e. exactly `dose_MPA / CL`, against the
reconstruction's 20.51. Deepening the reconstruction does not fix this; replacing it does.
Bounding the prior (F19) remains worth doing for interval width and plausibility, but it is
no longer needed to fix F20.

**Until then**, the population-forecast mode is the app's least reliable output while
looking like its simplest, and the "Population forecast — no measurements entered" badge
does not hint at it.

---

### F2 — High — The mixture-membership sampler targets the squared prior

**What.** `runMCMCMix` proposes a new EC-MPS absorption subgroup from the prior
(`drawMixIdx(mixPrior, rng)`) but accepts it with the **full posterior ratio**:

```js
if (isFinite(f2) && Math.log(rng() + 1e-300) < -0.5 * (f2 - fx)) { ... }
```

Because `ofv` already contains the `−2 ln p_m` prior term *and* the proposal density is
also `p_m`, the Hastings ratio `q(m)/q(m′)` is missing. The comment above the block
("Hastings ratio 1 because the target carries the same prior") states the reasoning exactly
inverted: carrying the prior in the target is *why* the correction is needed. The chain's
stationary distribution is `∝ p_m² L_m`.

**Evidence.** An objective whose likelihood is identical for every subgroup, so the exact
posterior over membership *is* the prior. 400 000 iterations:

```
sampled P(m)                : 0.6646  0.2627  0.0726
true prior (= exact answer) : 0.5100  0.3200  0.1700
prior² renormalised         : 0.6645  0.2616  0.0738   <-- matches to 3 decimals
```

**Impact.** The "Absorption-delay group (EC-MPS)" bars in the fit-diagnostics modal are
wrong — subgroup 1 inflated from 51 % to 66 % when the data are uninformative, which for
trough-only EC-MPS is most of the time. This is exactly the panel added so "the clinician
understands the fitted absorption curve" (S4). The effect on the headline AUC is small:
prior-weighted 45.09 vs squared-prior-weighted 45.17 mg·h/L, **0.17 %** — confirming S3's
"AUC-benign" claim for the point estimate. It also means the `membership hit / P̄(true)`
columns in `docs/CALIBRATION_RESULTS.md` measure a biased estimator.

**Fix — one line, verified.**

```js
var logr = -0.5 * (f2 - fx) + Math.log(mixPrior[m]) - Math.log(mixPrior[m2]);
if (isFinite(f2) && Math.log(rng() + 1e-300) < logr) { m = m2; fx = f2; switches++; }
```

Measured with the same probe: `0.5108  0.3174  0.1718` against a true `0.51 / 0.32 / 0.17`. ✓

**Red-first test to add** (rule 7b — this one genuinely goes red): run `runMCMCMix` with a
likelihood constant in `m` and assert the sampled frequencies match the prior within Monte
Carlo error. Against current code it fails by 15 percentage points.

---

### F3 — High — A short dose history is silently reported as steady state

**What.** In "Full schedule" mode the user types the doses they know about. `runFit` warns
only when **exactly one** dose is entered (`warnSingleDose: doses.length === 1`). Every
other history is presented as a steady-state AUC₀–12h — including two or three days of
typed doses, which is the most natural thing for a clinician to enter and which, for a drug
with a 40 h terminal half-life, is nowhere near steady state.

**Evidence.** MMF 1000 mg BID, typical parameters, true steady-state AUC₁₂ = 46.19 mg·h/L:

| doses typed | history | reported AUC₁₂ | error | app warns? |
|---|---|---|---|---|
| 1 | 12 h | 23.41 | −49.3 % | **yes** |
| 2 | 1 day | 27.70 | −40.0 % | no |
| 4 | 2 days | 33.99 | **−26.4 %** | no |
| 6 | 3 days | 38.14 | −17.4 % | no |
| 10 | 5 days | 42.67 | −7.6 % | no |
| 20 | 10 days | 45.70 | −1.1 % | no |
| 30 | 15 days | 46.07 | −0.2 % | no |

A patient truly at 46 mg·h/L, entered with two days of history, reads **34 mg·h/L** — just
above the lower bound, with a high P(below 30). That is a dose-increase conversation caused
entirely by data entry.

**Why it slipped through.** "Steady state" mode is safe — `ssToDoses()` correctly builds
`spec.ssNDoses = 30` doses. The S2 analysis and the V12 golden test are about the *engine's*
SS depth, and both are right. The gap is that the *user* can supply a shorter history
through the other input mode, and nothing checks it.

**Fix.** Compare the entered history span against the terminal half-life and warn whenever
`t_last − t_first < 5 × t½,term` (≈ 8 days): reuse the existing "not steady state" badge and
report note rather than adding a surface. This makes the single-dose guard a special case
of a general one.

---

### F4 — High — The printed report can mix a stale fit with edited inputs

**What.** `renderReport()` reads the *AUC block* from `state.lastRun`, but reads the patient
ID, weight, assay, formulation, **dosing schedule** (`effectiveDoses()`), **measurements**
(`state.obs`) and **therapeutic window** (`windowBounds()`) live from the DOM. Between a fit
and a print the user can change any of them. The on-screen `staleBanner` is a `.no-print`
element and is not reproduced in the report.

**Consequence.** A signed, printed clinical document can show a dose schedule, sample set
and therapeutic window that are not the ones the printed AUC and probabilities were computed
from, with no marker anywhere on the page. This breaks golden rule 7 on the one artefact
that leaves the building.

**Fix.** `state.lastRunInputs` already holds exactly the right snapshot and is already
maintained. Render the report from it; if `state.lastRun` is null or stale, either refuse to
print the findings section or stamp it "inputs changed since this forecast — re-run before
signing".

---

### F9 — High — The runtime is self-inflicted: the model is linear

**Measured**, 2000 evaluations, 31-dose history:

| operation | adaptive RK45 (shipped) | closed form | speed-up |
|---|---|---|---|
| full profile, 49 output times | 3.96 ms | 0.036 ms | **×109** |
| likelihood evaluation, 3 sample times | 3.82 ms | 0.0025 ms | **×1530** |

Agreement: max relative concentration difference **2.8×10⁻⁵ %**. The AUC can also be
integrated in closed form, removing the residual 0.13 % trapezoid error (OK3).

The ×1530 figure is the important one: the ODE must integrate the entire 360-hour history
no matter how few output points are requested, so every MCMC iteration pays for the whole
dosing history. The closed form pays per (dose × output time). MCMC is *all* likelihood
evaluations.

**Consequence.** A full fit is 44 s today. With the closed form the same fit is well under a
second, and the 2 000 000-iteration reference posterior in F1 took **8 seconds**. The budget
that causes F1 exists only because of the solver choice.

**Implementation notes** (from actually writing it):

- Standard 2-compartment first-order-absorption solution superposed over doses, with the
  per-dose lag handled exactly as `oralLag` does now — the event loop stays, only the
  propagation changes.
- **Guard the degenerate cases.** The solution divides by `(α − ka)`, `(β − ka)`, `(α − β)`.
  At typical values α ≈ 0.975 /h, and ka = 4.1·exp(η_KA) with ω_KA = 1.87, so η_KA ≈ −1.4
  puts ka exactly on α. Use the confluent limit (or nudge by 1e-6) when `|ka − α| < ε`. This
  will occur in real posterior draws, not just in theory.
- Keep the RK45 path behind a flag as the cross-check oracle and add a test asserting the
  two agree to 1e-6 across a parameter sweep — a permanent, can-go-red guard on the fast path.
- The app's only route is oral (`adminRoutes: ['oral']`), so no infusion closed form is needed.

**On the bedside question** (`VERIFICATION_TEAM.md` R4 Q2): 44 s with a progress bar is
tolerable once. It is not tolerable when the clinician wants to try three candidate doses in
the explorer, and it is not tolerable as the reason the statistics are wrong.

---

### F5 — Medium — The goodness-of-fit ±2 SD band is NaN for the shipped model

**What.** `src/diagnostics.js:53`:

```js
var sd = Math.sqrt(SIG.ADD + SIG.PROP * v * v);
```

The de Winter spec is `SIGMA: { LOG: 0.39 }` — there is no `ADD` and no `PROP`. Every band
value is `NaN`. `chart.js` guards NaN properly (no broken SVG), so the band simply never
draws, while the legend entry "±2 SD" and the caption "The shaded band is the ±2 SD
measurement-noise range implied by the assay error model" both remain.

**Evidence.** `gofChart(fit, spec).bands[0].lo` → `[NaN × 21]`.

**Why the tests miss it.** The diagnostics test builds its fit under `installStubSpec()`,
whose SIGMA *is* `{ADD, PROP}`. The test exercises a code path that no longer exists in
production and cannot go red for the shipped model — the one structural counter-example to
rule 7b in the suite.

**Fix.** Branch on the error model: for `SIGMA.LOG` the ±2 SD envelope is `v·exp(±2σ)` —
multiplicative and visibly asymmetric, which is the honest picture for a 39 % log-scale
error. Add a production-spec assertion that the band is finite.

---

### F6 — Medium — Lag-time shrinkage bars always read "–"

`panelHtml` computes prior variances with `root.ECU.model.omegaVars(fit.drug)` — **without
the formulation argument**. `omegaVars` then returns only the five shared etas
(CL, Q, V1, V2, KA) while the table has six (MMF) or seven (EC-MPS) rows, so every tlag row
gets `pri = undefined` → `NaN` → "–".

**Evidence.** Rendered panel: `93% | 98% | 99% | 100% | 100% | –`. For EC-MPS both
`TLAG_MORN` and `TLAG_EVE` are blank.

`runFit` already computes `fit.shrink` correctly *with* the formulation; the panel recomputes
it from scratch with the wrong prior. **Fix:** `M.omegaVars(fit.drug, fit.form)`, or just use
`fit.shrink`.

---

### F7 — Medium — No convergence diagnostic, though 8 chains exist

1. **No R̂.** Eight chains are run and immediately concatenated. Between- vs within-chain
   variance — the standard, nearly free diagnostic, and the one that would have made F1
   visible on day one — is never computed.
2. **ESS is optimistic.** `essOf` takes the lag-1 autocorrelation of the **pooled** draw
   array. Concatenating chains sitting in different regions inflates the variance while the
   lag-1 covariance stays within-chain, lowering ρ and *raising* the ESS estimate.
3. **Nothing warns the user.** The modal prints "effective sample size (CL) 53" with no
   threshold and no colour. Acceptance rate gets a "healthy range roughly 25–70 %"
   annotation; ESS, the one that matters here, gets none.

**Fix.** Keep per-chain draws; compute split-R̂ and bulk-ESS; refuse to print probabilities
to the percent when ESS < 400.

---

### F8 — Medium — The ciclosporin context is missing from the model card

The de Winter 2008 population was **100 % of MMF patients and 72 % of EC-MPS patients
co-treated with ciclosporin** (`docs/MODEL_ANALYSIS` §A). Ciclosporin inhibits MRP2-mediated
biliary secretion of MPAG, suppressing enterohepatic recirculation and substantially lowering
MPA exposure at a given dose; tacrolimus and belatacept do not. The model card's
`assumptions` list has seven entries — maintenance phase, diagonal Ω, ω² convention, evening
tlag, EC-MPS periodicity, no EHC compartment, FO estimation — and **none mentions
co-medication**.

Most contemporary kidney recipients are on tacrolimus, where the same MMF dose yields
materially higher MPA exposure than in this model's population, so the prior is systematically
mis-centred for them. This is a larger effect than several approximations the app documents
carefully, and it compounds the "no EHC compartment" assumption already listed.

**Fix.** One entry in `spec.assumptions` and one line in About. The 30–60 window's own
evidence base is also largely CsA-era and deserves the same note.

---

### F10 — Medium — Advanced fitting settings are not printed in the report

About states, of the recency weighting: *"they are a clinical judgement about how much to
trust older measurements, made explicit and printed in the report."* They are not.
`renderReport()` prints patient/assay/formulation, doses, measurements, window, findings,
advice and signature — LLOQ, error multiplier and recency preset appear nowhere. All three
change the likelihood and therefore every number on the page. (They *are* in the exported
session JSON, so reproducibility survives; this is a report-completeness gap and a claim the
About text should not make until it is true.)

---

### F11 — Medium — The calibration is empirical, cell-specific, and was tuned

`docs/CALIBRATION_V101_SAMPLER_STUDY.md` is admirably honest about the mechanism: the 4-chain
pool "under-represents the prior tails", so the default was raised to 8 chains and mmf-trough
coverage went 80 % → 90 % **at unchanged total budget**, with mean interval width rising
40.3 → 47.1 (+17 %). Coverage improved because the intervals got wider, not because the
posterior got more accurate — and that two same-budget configurations give materially
different intervals *is itself* the proof of F1.

This does not make the record worthless: 85–92 % empirical coverage across eight cells at
n = 100 is real evidence, and coverage is what a clinician ultimately cares about. Two
consequences follow:

1. The "5–95 % posterior interval" the app prints is not the Bayesian posterior interval of
   the stated model. An independent MAP-Bayesian implementation (NONMEM, Monolix, Tucuxi)
   given the same model and data will not reproduce it. For a tool whose stated standard is
   that every number be traceable and verifiable, that is the real cost.
2. Calibration demonstrated on morning-ending, 1- and 3-sample, near-typical-dose cells
   cannot be assumed to transfer to other designs, and nothing at run time checks whether
   *this* fit behaved.

**Action:** after F1/F9/F19, re-run the eight-cell record. Expect intervals to change; if
coverage then sits in 85–95 % with a converged sampler, the evidence will be worth far more
than it is today.

---

### F18 — Low–Medium — Residual colour thresholds are not derived from the model's σ

The diagnostics table colours relative deviation green ≤ 30 %, amber 30–60 %, red > 60 %, and
tells the clinician red "flags a sample the model does not explain". With the model's own
σ = 0.39 on the log scale, a perfectly ordinary sample exceeds ±60 % about **12 %** of the
time and ±30 % about **31 %** of the time. Roughly one sample in eight is painted red for
behaving exactly as the model says it should. Express the thresholds in units of σ (e.g.
amber > 1.5 σ, red > 2.5 σ — here ±80 % / ±170 %) so the colour means what the caption says.

---

### F21 — Medium — Silent ODE integration failures

**What.** `integrate()` gives up when the step size collapses. For high absorption rates it
does exactly that:

| η_KA | ka (1/h) | integration |
|---|---|---|
| 0 | 4.1 | ok |
| 4.0 | 223.9 | ok |
| **5.0** | **608.5** | **failed → concentrations all 0** |
| 6.0 | 1654.1 | failed |

With ω_KA = 1.87, **1.3 % of prior draws fail** (2000-draw sample). Two silent consequences:

1. In the fit, `sim.failed` → `makeOfv` returns `Infinity` → the proposal is always
   rejected. The sampler therefore sees a hard wall in parameter space that is a *numerical*
   artefact, not a probability statement.
2. In `simulateDraws`, a failed draw becomes `null` → `NaN` → silently filtered out by
   `statsOfChain`. The AUC summary is computed over an unreported subset of the draws.

Neither path counts or reports the failures; `runFit` returns no failure tally. (The `fails`
column in `docs/CALIBRATION_RESULTS.md` counts whole-fit failures, not per-draw ones.)

**Fix.** The closed form (§4) is exact at any ka and removes the failure mode entirely.
Until then, at minimum count failed draws and surface the count in the diagnostics modal.

---

### F23 — Medium — Samples outside the AUC window are silently not drawn

**What.** `renderChart` plots on an axis of `x = t − aucT0` with `xMin: 0` and
`xMax = grid[last]` (= τ). `chart.js` skips any point with `x < xMin || x > xMax`
(lines 110/124). So a measurement outside the reported AUC window is not clipped or
flagged — it simply does not appear, while the "measurement" legend entry remains.

**Reachable, and worst exactly where the app's own sampling advice sends you.** For an
EC-MPS schedule ending on the evening dose, S12 auto-anchoring moves the window back to the
morning dose — and the recommended EC-MPS samples (1.5 / 2 / 4 h after the dose given) then
all land beyond τ:

```
anchor shifted to the morning dose? true
plot window: x in [0, 12.0] h after the anchor
  sample 1: x = 13.50 h  -> NOT DRAWN
  sample 2: x = 14.00 h  -> NOT DRAWN
  sample 3: x = 16.00 h  -> NOT DRAWN
```

The clinician sees a posterior curve with **no measurements on it at all**, having just
entered three, with nothing saying why. The same happens on the negative side for a
pre-dose sample entered slightly before the anchoring dose.

**Fix.** Free the axis: `xMin = min(0, min sample x)`, `xMax = max(τ, max sample x)`, and
extend the plotted curve/band to cover it. See §7 R3 for the implementation trap — the grid
that draws the chart must not be the grid that integrates the AUC.

---

### F22 — Low–Medium — The progress bar probably never repaints

`simulateDraws`, `runMCMC` and `runMCMCMix` all yield with:

```js
if (onProgress(d / draws.length)) await Promise.resolve();
```

`await Promise.resolve()` schedules a **microtask**. Browsers drain the entire microtask
queue before rendering, so this yields to nothing that can repaint — `bar.style.width` is
updated but the frame is never painted until the whole async chain unwinds. The likely
user-visible behaviour is a progress bar that sits at its initial value for the full 44 s
and then completes, which is worse than no progress bar.

To actually yield to the renderer the continuation must go through a **macrotask**
(`setTimeout(…, 0)` or a `MessageChannel`), or the computation must move to a Web Worker
(§4, measure S5) where the main thread stays free by construction.

**Flagged, not confirmed:** this follows from browser event-loop semantics and a reading of
the code; everything in this audit was run under Node, so it needs 30 seconds of
verification in a browser before being actioned.

---

### F12 – F17 — Low

- **F12 (rule 7c).** `pt-winlo`/`pt-winhi` carry `step="0.1"` and `pt-lloq` `step="0.01"`,
  against the project's own rule "never put a step grid on a clinical number field". These
  inputs sit outside a `<form>`, so the practical effect is limited to `:invalid` styling
  rather than blocked entry — but an LLOQ of 0.025 mg/L is a real assay value and the rule
  exists for a reason. `dose-amt` and `obs-val` correctly use `step="any"`.
- **F13.** README §7 cites the lupus nephritis meta-analysis as *Ther Adv Drug Saf*
  2024;11:e001093; the app cites *Lupus Sci Med* 2024;11:e001093 with a DOI. They cannot both
  be right; the app's looks correct. Reconcile — golden rule 7.
- **F14.** `docs/VERIFICATION_TEAM.md` charters five reviewers and an "overall release
  verdict: pending — require zero blocking findings". All five rows are still `pending`, yet
  v1.0.1 shipped. Either fill the table (this document answers R1/R2/R3/R5 and part of R4) or
  record that the gate was waived.
- **F15.** README/S2 records the steady-state deficit at n = 10 as 4.4 %. Measured: −7.6 % at
  n = 10, −6.2 % at n = 11 (the value the V12 test actually uses). The conclusion (n = 30) is
  unaffected; the recorded figure should be corrected.
- **F16.** Dead code to remove or annotate: `SS_N_DOSES = 10` (`ui.js:64`, unreachable — the
  spec always provides 30); `runFit`'s `reuse` parameter (never passed by the UI); `tlagV`
  (`diagnostics.js`, assigned, never read); `pediatricWarn: wt < 25` (weight is not collected
  for this model, so it is computed from the 70 kg default and can never fire meaningfully).
- **F17.** A patient switched MMF → EC-MPS has their whole history converted with the
  currently selected formulation's factor and absorption model. `S5` flagged this ("support
  per-dose formulation with shared subject etas, and document *or block* mixed histories");
  neither was done. Blocking is the one-line option.

---

## 4. How the app can be sped up

All figures measured on this codebase, single-threaded Node, 10-core darwin host.

### 4.1 Where the 44 seconds actually goes

A fit was instrumented by wrapping `M.simulate` and attributing each call to its phase
(the instrumented run is slower in absolute terms — read the proportions):

| phase | simulate calls | share of wall time | output times/call | doses/call |
|---|---|---|---|---|
| 1 · prior predictive | 1 000 | 12.3 % | 49 | 31 |
| 2 · MAP + Laplace | 1 130 | 1.2 % | 3 | 31 |
| 3 · **MCMC** | 2 406 | **64.9 %** | 3 | 31 |
| 4 · posterior predictive | 1 441 | 21.5 % | 49 | 31 |
| **ODE integration, total** | **5 977** | **99.9 %** | | |
| everything else (sorting, stats, JS overhead) | | 0.1 % | | |

**There is nothing to micro-optimise.** 99.9 % of the fit is inside the ODE solver, and
two thirds of that is the MCMC asking for concentrations at *three* time points while the
integrator grinds through 31 doses and 360 hours of history to get there. Every
optimisation below attacks that one fact.

A second driver hides in the same table: cost per call is not constant. At typical
parameters a 3-point likelihood evaluation costs 2.6 ms; averaged over prior draws it costs
**9.8 ms**, with a worst single draw of **666 ms**. The culprit is ka (ω_KA = 1.87): at
η_KA = +3, ka = 82 /h and the adaptive step control collapses. So the app is slowest exactly
where F19's prior is least plausible.

### 4.2 The measures, measured

| # | Measure | Measured gain | Effort | Risk |
|---|---|---|---|---|
| **S1** | **Closed-form propagation** instead of RK45 | **×109** profiles, **×1530** likelihood evals | ~150 lines | low — needs a degeneracy guard |
| **S2** | **Exact steady state** by geometric superposition (no dose history) | **×5582** on SS likelihood evals | ~40 lines on top of S1 | low |
| **S3** | **Analytic AUC** instead of the 49-point trapezoid | removes the 0.13 % grid error; drops 49 evaluations to 1 | ~20 lines | none |
| **S4** | **Dose linearity** in the explorer: scale, don't re-simulate | ×N for an N-candidate scan | ~10 lines | low — guard if a future spec adds `VMAX` |
| **S5** | **Web Worker** | no throughput gain; frees the UI thread | ~40 lines | low |
| **S6** | **Bound the prior** (F19) | ~×3.8 on average call cost, removes 666 ms outliers | see F19 | model decision |

**S1 — closed-form propagation.** The model is linear: 2-compartment, first-order
absorption, first-order elimination, `VMAX = 0`. Superposition of the analytic single-dose
solution is exact, and it agrees with the RK45 path to **2.8×10⁻⁵ %**. The ×1530 figure on
likelihood evaluations is the one that matters: the ODE must integrate the whole history no
matter how few output points are requested, while the closed form costs
O(doses × output times). MCMC is *all* likelihood evaluations. Formula in Appendix B2.

**S2 — exact steady state.** For periodic dosing the infinite superposition is a geometric
series, so steady state needs **no dose history at all**:

```
C_ss(t) = Σ_doses-in-period Σ_r (A·ka·w_r / V1) · e^(−r·Δ) / (1 − e^(−r·T))
```

where `T` is the dosing period (12 h for MMF; **24 h for EC-MPS**, whose morning and evening
lags make the pattern 24-hour-periodic — S12), and `Δ` is the time since that dose's most
recent occurrence. Verified against every golden anchor, and it hits them *more* exactly
than the shipped reconstruction:

| quantity | exact SS | 30-dose reconstruction | golden / invariant |
|---|---|---|---|
| MMF 739 mg MPA q12h | **46.1875** | 46.0743 | 46.1875 (= dose/CL) |
| EC-MPS morning window | **45.2683** | 45.2470 | 45.26 |
| EC-MPS evening window | **38.9817** | 39.0951 | 38.95 |
| EC-MPS 24 h sum | **84.2500** | 84.34 | 84.25 (exact invariant) |

It also **fixes F20**, because it is correct for every draw regardless of half-life
(pathological draw η_V2 = +5: exact 46.1875 vs 20.51 reconstructed). And it removes 31 dose
terms from every evaluation — hence ×5582 rather than S1's ×1530.

*Applicability:* S2 covers "Steady state" input mode and the dose explorer, which is where
the SS assumption is already being made. "Full schedule" mode keeps per-dose superposition
(S1) — correctly, since F3 is about that mode not being at steady state.

**S3 — analytic AUC.** With S1/S2 in place the window integral is a sum of exponential
integrals (Appendix B2), so the 49-point grid disappears along with its 0.13 % error. The
chart still needs a grid; the *number* does not.

**S4 — dose linearity.** `C(t; k·dose) = k · C(t; dose)` holds exactly for this model —
verified to **1.2×10⁻⁵ %** over k ∈ {0.5, 1.5, 2, 3}. `doseScan` currently re-simulates every
posterior draw for every candidate amount. One simulation per (draw × interval) suffices;
the candidates are a multiply. The trough scales identically; only the window probabilities
need recomputing, which is arithmetic on an existing chain. An N-candidate scan becomes
N-independent.

**S5 — Web Worker.** Throughput-neutral but it fixes F22 properly and keeps the UI alive.
Worth doing *after* S1–S4, when there may be little left to move: if a fit drops under a
second, a worker may be unnecessary.

**S6 — bound the prior.** Not primarily a speed measure, but the average call cost is 3.8×
the typical-patient cost because of implausible draws, and the 666 ms outliers come from the
same place. F19's fix pays for itself twice.

### 4.3 What this adds up to

Current budget is 5 977 propagations per fit. With S1 + S2 those cost roughly
2 440 × 0.008 ms (49-point predictive curves) + 3 536 × 0.0005 ms (3-point likelihoods)
≈ **20 ms of propagation**, against 44 s today.

The honest end-to-end estimate comes from something already measured rather than from that
arithmetic: the closed-form reference chain in F1 ran **2 000 000 iterations in 8 s**
including all bookkeeping — and that used full per-dose superposition, *without* S2. So:

- the *current* sampling budget (2 400 iterations) becomes imperceptible;
- a **converged** budget (10⁵–10⁶ iterations, enough for R̂ < 1.01 and ESS > 400) lands at
  roughly **0.2–1 s**;
- the dose explorer becomes instant (S4).

**This is why the speed question and the correctness question are the same question.** The
sampling budget was not chosen statistically; it was chosen to keep the fit under a minute.
Remove the reason for that constraint and F1 dissolves — the app can afford a posterior that
is actually the posterior, and still be 40× faster than it is now.

### 4.4 Suggested sequencing

1. **S1** behind a flag, with an RK45 cross-check test over a parameter sweep (tolerance
   1e-6). Keep the ODE path as the permanent oracle — it is good code and it is what makes
   the fast path trustworthy.
2. **S2 + S3**, validated against the existing golden anchors, which get *tighter*, not
   looser. Re-point the V4/V12 tests at the exact values.
3. **Raise the MCMC budget** until the F1 convergence criteria are met. Measure, do not guess.
4. **S4** in the explorer; **S5/F22** if the UI still needs it.

Throughout, `tests/golden.json` is the safety net: every measure above was checked against
it before being recommended, and none of them moves a golden value by more than the
reconstruction error they remove.

---

## 5. What I did not audit

Stated so the next reviewer knows where the holes are:

- **Browser behaviour.** Everything was exercised under Node. Print/`@media print` fidelity,
  modal focus handling, keyboard accessibility and mobile layout were read but not run.
  Runtime figures are Node on this machine; a browser will be in the same class, not identical.
- **The source paper itself.** The implementation was audited against
  `docs/MODEL_ANALYSIS_DEWINTER_2008.md`, a careful secondary record — I did not have the
  paper. Every parameter traced consistently through spec → tests → model card, but if the
  analysis document mis-transcribed a number this audit would not catch it.
  **Recommend one human check of `src/model.js:34-70` against the paper's Table III** — and
  note that F19 gives an independent, physiological reason to re-read the IIV row for V2.
- **The 30–60 window's evidence base**, beyond confirming the citation and that the app
  treats the window as editable clinical input.
- **Security beyond the escaping/offline check** — no threat model, no CSP review (a
  `file://` single-page app with no network is a small surface).
- **Coverage re-simulation.** F11 recommends re-running the calibration; I did not re-run it.

---

## 6. Recommended order of work

**Stage 1 — make the numbers real (P1).** One coherent piece of work, and the speed work
*is* the correctness work: S1/S2 (§4) remove the runtime constraint that forced the sampling
budget behind F1, and S2 fixes F20 outright.

1. **F9 / S1** — closed-form propagation behind a flag, with an RK45 cross-check test.
   → *verify:* max relative difference < 1e-6 across a parameter sweep; fit < 2 s.
   → *also resolves* **F21** (no integration failures at any ka).
2. **S2 + S3** — exact steady state and analytic AUC.
   → *verify:* MMF SS AUC₁₂ = 46.1875 and the EC-MPS 24 h sum = 84.2500 to 4 decimals;
   **F20** resolves — the no-samples median lands within 2 % of 46.19 for MMF 1000 mg BID.
3. **F1 + F7** — raise the budget until converged; add split-R̂ and bulk-ESS.
   → *verify:* R̂ < 1.01, ESS > 400; two seeds agree on P(window) within 1 pp; the result
   matches the long reference chain within Monte Carlo error; **patient 3 of the F1 table
   reports P(within window) ≈ 2 %, not 30 %.**
4. **F2** — Hastings correction, with the prior-recovery test that goes red first.
   → *verify:* membership frequencies = prior under a flat likelihood (probe B1).
5. **F19** — bound the prior to physiology (terminal t½ cap); send the author query.
   → *verify:* < 1 % of prior draws with t½ > 10 × 17 h; trough-only interval width and the
   sparse-data P(window) stop depending on the ω² convention. (No longer load-bearing for
   F20 once S2 lands, but it still governs interval width — and it removes the 666 ms
   outlier draws, S6.)
6. **F11** — re-run the eight-cell calibration of record on the converged engine.
   → *verify:* coverage 85–95 % per cell with intervals that no longer move with configuration.

**Stage 2 — make the outputs honest (P1/P2).**

7. **F3** — steady-state adequacy check on the entered history.
   → *verify:* the −26 % case in the F3 table raises the badge and the report note.
8. **F4** — render the report from `state.lastRunInputs`.
   → *verify:* edit a dose after a fit, print, and confirm the report refuses or is stamped stale.
9. **F5, F6** — fix both diagnostics panels, with production-spec assertions.
   → *verify:* band values finite; no "–" in the shrinkage column for either formulation.
10. **F8, F10, F18** — ciclosporin caveat; settings block in the report; σ-based residual thresholds.
11. **S4** — dose linearity in the explorer; **S5 / F22** only if the UI still needs it after S1–S3.

**Stage 3 — backlog (P3).** F12–F17, plus filling in `VERIFICATION_TEAM.md`.

**One process note.** F5 is the instructive failure: a test that exercised the stub spec,
where production uses a different error model, could never go red for the shipped app. Rule
7b is about new assertions; the sharper version is *every assertion must be able to fail
**against the configuration that ships***. A cheap systemic guard: one end-to-end test that
runs a real de Winter fit and asserts every rendered diagnostic surface is free of `NaN`,
`undefined` and `–`. A second: one test that pins a fit's output against a long reference
chain, so F1 cannot silently return.

---

## 7. Owner-requested changes (v1.1 scope)

**These are scope decisions from the app's owner, recorded here so they travel with the
audit — they are not audit findings.** For each: what it touches, and the couplings a
implementer must handle. Where a request interacts with something the audit found, that is
noted; where a request is ambiguous in a way that changes the work materially, both
readings are given rather than one being chosen silently.

### R1 — Assay method is not a covariate: remove it from the Patient & covariates card

**Correct as stated.** The de Winter model's only covariate is formulation; `pt-assay` never
reaches the engine. It is recorded metadata, not a model input.

**Touches:** `index.html:117-126` (the `<select>`); `src/ui.js` — `buildRunInput()`:320
(`assay:`), `sessionObj()`:794, `applySession()`:816, `renderReport()`:921 (the Assay row),
and the id list at :1007.

**Couplings to handle:**

1. **Remove all five references together, or persistence breaks silently.** `sessionObj()`
   reads `$('pt-assay').value`; with the element gone that is a `TypeError` on `null`. It is
   called from `scheduleAutosave()`, whose `try/catch` swallows the error — so **autosave
   would stop working with no message at all**. `applySession()` has the same problem, and
   its `catch` reports a generic "Import failed", so **every previously exported session
   file would become unimportable**, not just lose its assay field.
2. **Make `applySession` tolerant of legacy keys** (ignore `o.assay` rather than assume the
   element exists). Old session files in the wild will still carry it.
3. **The copy has to move with the field.** About and "MPA TDM background" both instruct the
   user to *"Record the assay method — models are assay-specific"*, and the model card's
   `spec.assay` string says to compensate with the error multiplier (which R4 also removes).
   Both statements become unactionable once the inputs are gone.

**One tradeoff to be aware of, then it is your call:** the field was serving traceability —
which assay produced these concentrations — on the printed report, not model selection. If
the concern is that its presence *implies* it changes the fit, an alternative is to keep it
as a report annotation outside the covariate card. If the concern is screen clutter,
removal is clean. Either way the covariate card then contains exactly one field
(formulation), which is what the model actually uses and matches the standing rule "all
covariates in the model appear in the interface, and only those".

### R2 — Remove the IV option from the dosing card

**Correct, and it is a correctness fix rather than a simplification.** The spec already
declares `adminRoutes: ['oral']`. The de Winter parameters are CL/F, Q/F, V1/F, V2/F with
bioavailability folded in and absorption described by ka + tlag — feeding an IV dose through
them would apply an oral-bioavailability-scaled clearance to a route that bypasses it. IV
mycophenolate mofetil is a real product, so the option is not merely unused, it is wrong.

**Touches:** `index.html:160-165` (the `dose-route` select, `oral` / `iv`); `src/ui.js:1028`
(`var route = $('dose-route').value`) → hard-code `'oral'`.

**Two cautions:**

1. **Do not touch the `iv-*` ids in card 4.** `iv-amt`, `iv-interval`, `iv-run`, `iv-out`,
   `iv-status`, `ivAmtLbl` are the **dose explorer** ("intervention"), not intravenous
   anything. A search-and-delete on "iv" removes the explorer.
2. **Legacy sessions may carry `route: 'iv'`.** `applySession` filters doses only on
   `isFinite(d.t) && d.amt > 0`, so an imported IV dose would silently be fitted as IV with
   no UI showing it. Coerce non-oral routes to oral on import, or reject the file.

Leave the `iv` / `bolus` / infusion branches in `simulate()` alone — they are generic engine
code, pre-existing, and not made dead by this change (CLAUDE.md §4.3).

### R3 — Allow negative times in the plot after fitting

**This fixes a real defect, logged above as F23** — and the same change should free the
*upper* bound too, since the evening-anchored EC-MPS case pushes samples past τ rather than
below zero.

**Touches:** `src/ui.js` `renderChart()` — `xMin: 0` → `Math.min(0, …)` over the sample
x-positions, and `xMax` → `Math.max(τ, …)`. `chart.js` needs no change: its scale function
is plain arithmetic and already handles a negative `xMin` (note `cfg.xMin || 0` is safe here
because `0 || 0 === 0`).

**The trap, and it is a serious one.** `runFit` builds a single `outTimes` grid and uses it
for **three** different jobs:

```js
aucs[d]    = aucOfCurve(postMat[d], intervalHours, outTimes);  // the AUC integral
troughs[d] = postMat[d][lastIdx];                              // assumes last point == t0+tau
chartBand  = bandOfMatrix(postMat, outTimes.length);           // the plot
```

Widening `outTimes` so the band covers negative times would therefore **silently corrupt
both the AUC and the trough** — the AUC would integrate over the wider span, and
`lastIdx` would no longer be `t0 + τ`. Keep a separate `chartTimes` grid for the plot and
leave `outTimes` exactly as it is, or integrate the AUC over an explicit sub-range.

The golden tests (V4, V12, V16) would catch the AUC half of that mistake; nothing currently
guards the trough, so **add an assertion that `trough == C(aucT0 + τ)` before making this
change** — red-first, per rule 7b.

Cost: one extra predictive grid per draw. Negligible today and free after §4 S1.

### R4 — Remove LLOQ and the assay error multiplier from the dosing card

Both live in the `<details id="assayOptions">` fold, "Assay settings (LLOQ, error
multiplier)", at `index.html:205-225`.

**The error multiplier is a clean removal.** `buildRunInput()` then passes `errMult: 1`,
which `makeOfv` already treats as a no-op. Only the copy needs to follow: `spec.assay`
("…use the error multiplier for your local assay") and the About paragraph that explains it.

**LLOQ is not a clean removal — it is load-bearing, and this needs a decision.** The
per-sample **"< LLOQ" checkbox** (`obs-lloq`, `index.html:200`) lives in the *sample entry
row*, not in the fold. Both `validateRun()` and `runFit()` refuse to proceed when any sample
is flagged `< LLOQ` and no LLOQ value is set:

> *"A sample is marked '< LLOQ' but no LLOQ value is set. Enter the assay's lower limit of
> quantification (Advanced fitting options) or untick the sample."*

Delete the input and that becomes unsatisfiable: **any censored sample makes the app refuse
to run, with an error pointing at a field that no longer exists.** Two readings:

- **(a) Remove the inputs *and* the per-sample "< LLOQ" checkbox** — drops M3 censoring
  entirely. Simplest UI. The cost is real: M3 is **OK6** in this audit, one of the things the
  app gets conspicuously right, and without it a user with a below-LLOQ result must type
  *some* number, which is precisely the ~−27 % AUC bias the guard was built to prevent
  (audit defect S1/C1, fixed in v0.2.4).
- **(b) Remove them from this card but keep the capability** — e.g. reveal a small LLOQ
  input *next to the checkbox*, only when it is ticked.

**Recommendation: (b).** It achieves the stated goal — nothing extra on the card by default
— while keeping the censoring correct, and it puts the number where it is needed at the
moment it is needed. But this is a product call; (a) is implementable and honest provided
the "< LLOQ" checkbox goes with it and the About/Getting-started copy stops promising
censored-sample handling.

**Also touches:** `buildRunInput()`:310, `sessionObj()`:795, `applySession()`:818-819, the
id list at :1007, the `lloq` / `errmult` entries in the `HELP` map, and — if route (a) is
chosen — tests `AUDIT: censored sample without LLOQ value refuses to fit` and
`AUDIT: same censored sample with LLOQ value fits via M3 and differs from omission`.

**Not in scope of this request:** the *recency weighting* select sits in a different fold
("Advanced fitting options", `index.html:253-265`) and is left in place. Flagging it because
F10 notes the About text promises it is printed in the report and it is not — that is an
open item either way.

### Interaction with the audit's own priorities

None of R1–R4 conflicts with Stage 1 (§6). R3 shares code with F23 and should be done as one
change. R1 and R4 both delete persisted fields, so they are best landed together, once, with
a single pass over `sessionObj` / `applySession` and one legacy-tolerance test — rather than
breaking session import twice.

---

## 8. Front-end performance review of the §4 plan

*Reviewed with a web-performance hat on: the question is not only "how few FLOPs" but
"how soon does the clinician see a trustworthy number, and does the page stay alive while
they wait". Every measure below is exactness-preserving — none of them trades accuracy for
speed. The ones that would are listed at the end, under things not to do.*

### 8.1 Verdict on the plan

**The plan targets the right thing** — 99.9 % of the fit is inside the solver, so replacing
it dominates everything else, and it is right to refuse micro-optimisation before that
lands.

**But it stops one layer short in three places.** First, it treats "closed form" as a single
step when *how* it is written changes the answer by 60×. Second, it assumes the profile
stays the same shape afterwards; it does not — costs that are invisible at 44 s become the
bottleneck at 100 ms. Third, it treats responsiveness as an afterthought (S5, "only if the
UI still needs it") when the current yielding is broken (F22) and the fix is independent of
throughput.

### 8.2 How the closed form is written matters more than that it is written

Same maths, same output, four implementations — 49-point predictive profile, MMF q12h:

| implementation | per call | vs shipped |
|---|---|---|
| shipped RK45 ODE | 2789 µs | ×1 |
| closed form, idiomatic (`map` / `reduce` / closures) | 31.6 µs | ×88 |
| closed form, allocation-free indexed loops, `Float64Array` out | 22.6 µs | **×124** |
| exact SS (S2) + **exponential recurrence** on the uniform grid | **0.36 µs** | **×7776** |

Three things to take from this:

1. **Idiomatic → tight is a free 40 %.** The hot path should have no `map`/`reduce`/`filter`,
   no closures, no array literals, and should write into a preallocated `Float64Array`.
   The existing ODE code is a good illustration of what to avoid: `dopriStep` allocates
   `k[7]`, a `yy` per stage and a `y5` per step, and `rhs` builds `[dC, dP].concat(deps)` —
   roughly ten short-lived arrays per RK step, millions per fit. Do not carry that style
   into the replacement.
2. **The exponential recurrence is the big one, and it is exact.** On a uniform grid,
   `e^(−r(t+Δt)) = e^(−r·t)·e^(−r·Δt)`, so the whole 49-point curve costs *three* `exp()`
   calls per dose-rate pair plus multiplies, instead of three per grid point. Verified
   against direct evaluation: **max relative difference 2.5×10⁻¹³ %** — float drift, nothing
   more. Combined with S2 (one dose term instead of 31) this is where ×7776 comes from.
3. **`Math.exp` is then the only hot instruction left**, which is the right place to stop.

### 8.3 After S1/S2 the bottleneck moves — plan for the *next* profile

Once propagation costs ~0.4 µs, work that was 0.1 % of the fit becomes the dominant term.
Measured on the real shape of the problem (1440 draws × 49 time points):

| post-S1/S2 cost | current approach | better | gain |
|---|---|---|---|
| posterior band percentiles | full `sort()` per time point — **16.6 ms** | 3× quickselect per time point — **2.3 ms** | ×7, identical values |

`bandOfMatrix` → `statsOfChain` sorts 1440 elements 49 times to read three quantiles from
each. Quickselect returns the *same* numbers without ordering the rest. At today's 44 s that
is noise; at a 100 ms fit it is a sixth of the budget.

Also worth separating once propagation is free: **draws for the picture vs draws for the
numbers.** The band is a visual — 200 draws render indistinguishably from 1440. The AUC
statistics and window probabilities should keep every draw. Decoupling them cuts the
predictive phase ~7× with no effect on any reported number.

### 8.4 Responsiveness is a separate axis from throughput

**Fix the yielding properly (F22).** `await Promise.resolve()` is a microtask: the browser
drains the whole queue before painting, so nothing repaints. The two correct options:

- `MessageChannel` — post to a port and resume in its `onmessage`. A true macrotask with
  **no clamping**.
- `setTimeout(…, 0)` — also a macrotask, but after five nested timers browsers clamp to
  4 ms. Yielding every 64 draws over 1440 draws = 22 yields ≈ 90 ms of pure waiting, which
  on a 100 ms fit doubles the runtime. **Do not use `setTimeout` for this.**
- `scheduler.yield()` where available (Chromium), with a `MessageChannel` fallback.

**On the Web Worker (S5) — one constraint the plan should know before committing.** The
deliverable must run from `file://` with no external files (golden rule 2), so a worker can
only be created from a `Blob` URL. **Chromium blocks blob-URL workers from `file://`
origins** (opaque origin); Firefox and Safari have historically differed. So the worker path
needs verifying on the actual target browsers before it is designed in — and if it fails,
chunked `MessageChannel` scheduling on the main thread is the fallback that always works.
Given the projected sub-second fit, that fallback is probably sufficient: a worker earns its
keep at 44 s, much less at 0.3 s.

**Wire up cancellation while you are there.** `onProgress`'s return value is already checked
(`if (onProgress(f)) await …`) but only to decide whether to yield. Returning `false` to mean
*abort* costs almost nothing and turns Run into Run/Cancel — the single biggest perceived-
performance win available today, before any of the maths changes.

### 8.5 Perceived performance: show the answer before it is finished

The profile says the MAP is **1.2 %** of the fit. So the point estimate is essentially free
and the interval is the expensive part. Render progressively:

1. MAP fit → show the AUC point estimate and the fitted curve (sub-second even *today*).
2. Posterior → fill in the 5–95 % band and the window probabilities.
3. Prior predictive band → last, or lazily when the user toggles it on.

The prior band is 12.3 % of the fit and is **decoration on the chart** — it currently runs
*first*, delaying everything the clinician actually wants. Moving it last is a one-line
reorder that makes the app feel twice as fast without touching a single number. Cut it to
200 draws while you are there.

And once a fit is sub-second, **delete the progress bar**. A determinate bar that completes
before the eye registers it reads as a flicker; a brief spinner (or nothing) is better. If a
bar survives for the slowest cases, animate `transform: scaleX()` rather than `style.width` —
width triggers layout on every update, transform stays on the compositor.

### 8.6 One coupling the plan must not miss: seeds before parallelism

All eight chains currently draw from **one shared `mulberry32` stream**, advanced
sequentially. That is fine today and it is why results are reproducible — but it makes the
chains impossible to parallelise without changing every number the app has ever produced.
If there is any prospect of running chains in workers, **give each chain its own
deterministically derived seed** (`seed + chainIndex·C`) as part of the F1 budget work, not
after. Doing it later means re-running the calibration of record twice.

With per-chain seeds, 8 chains across 4–8 workers is near-linear and still bit-reproducible.

### 8.7 What "without compromising quality" rules out

These would all make the app faster and should be rejected:

- **Loosening `rtol`** on the ODE. Irrelevant once the closed form lands, and the wrong
  lever regardless — the solver is accurate (OK2), it is being asked the wrong question.
- **Cutting MCMC draws.** This is what caused F1. The budget goes *up*, not down.
- **Coarsening the AUC grid.** 24 intervals costs 1.6 % (OK3). S3 removes the grid entirely
  instead.
- **Caching fits across patients or reusing a previous posterior as a starting point.**
  Reproducibility and independence of each patient's result are worth more than the time.
- **Approximating the posterior with the Laplace/normal approximation** instead of sampling.
  Tempting — it is nearly free — but the AUC is a non-linear functional of η and the
  posterior is visibly skewed (see the 5–95 % intervals in F1, which are not symmetric about
  the median). This would quietly reintroduce an F1-class error.
- **`Math.exp` approximations.** No. It is one instruction and the recurrence already
  removes 98 % of the calls.

### 8.8 Suggested performance budget (regression gates)

Worth pinning as tests once Stage 1 lands, so speed cannot silently regress:

| gate | target |
|---|---|
| single propagation, 49-point SS profile | < 2 µs |
| full fit, converged budget (≥ 10⁵ iterations) | < 1 s |
| longest main-thread block | < 50 ms |
| dose-explorer candidate (after S4) | < 10 ms |
| closed form vs RK45 agreement | max rel. diff < 1e-6 |

**Measure them in a browser, not in Node.** Every figure in this document is V8 under Node.
Chrome shares the engine, but Safari (JSC) and Firefox (SpiderMonkey) differ meaningfully on
allocation and `Math.exp` throughput, and this app is opened from a file on whatever machine
a hospital happens to provide. A 20-line self-benchmark behind a query flag would make this
checkable on the actual target hardware in ten seconds.

---

## Appendix A — Reproduction environment

Node ≥ 16, no dependencies. `npm test` → 56/56 in 40 s. `node tools/verify_model.mjs` → OK.
`node build.mjs` → deterministic apart from the build-stamp comment. Runtimes measured on a
10-core darwin 25.6.0 host, single-threaded Node.

## Appendix B — Probes

**B1 — Mixture sampler stationary distribution (F2).** Self-contained; ~2 s.

```js
require('./src/version.js'); require('./src/model.js'); require('./src/bayes.js');
var B = globalThis.ECU.bayes;
var prior = [0.51, 0.32, 0.17];
var pen = prior.map(function (p) { return -2 * Math.log(p); });
// likelihood identical for every subgroup => the exact posterior over m IS the prior
function ofv(x, m) { return x[0] * x[0] + pen[m || 0]; }
B.runMCMCMix(ofv, prior, [0], 0, [[1]], { iters: 400000, maxKeep: 400000 },
             B.mulberry32(12345), null).then(function (r) {
  var c = [0, 0, 0]; r.mixChain.forEach(function (m) { c[m]++; });
  console.log(c.map(function (x) { return (x / r.mixChain.length).toFixed(4); }).join('  '));
});
// shipped:  0.6646  0.2627  0.0726   (= prior^2 renormalised)
// expected: 0.5100  0.3200  0.1700
```

**B2 — Closed-form reference (OK1, F1, F9).** Single-dose solution superposed over the dose
history, `lag` taken from the same `oralLag` logic:

```
k10 = CL/V1 ;  b = k10 + k12 + k21 ;  c = k10·k21
α, β = (b ± √(b² − 4c)) / 2
C(t) = Σ_doses (A·ka/V1) · [ (k21−ka)/((α−ka)(β−ka))·e^(−ka·Δ)
                           + (k21−α)/((ka−α)(β−α))·e^(−α·Δ)
                           + (k21−β)/((ka−β)(α−β))·e^(−β·Δ) ] ,   Δ = t − (t_dose + lag)
AUC[t0,t1] = Σ_doses Σ_r (A·ka/V1)·w_r·(e^(−r(a−t_s)) − e^(−r(t1−t_s)))/r ,   a = max(t0, t_s)
```

Validate against `ECU.bayes.makeOfv(...)` at an arbitrary η — the two must agree up to the
constant `Σ ln σ²` (measured 4.288998 vs 4.289000). Then use it as the MCMC kernel for a
10⁵–10⁶-iteration reference chain, and check the reference itself with disperse starts under
two seeds before trusting any discrepancy (this is what cleared patient 3).

**B3 — Seed stability (F1).** Call `runFit` with identical input and varied `seed`; tabulate
`auc.median`, `auc.p5`, `auc.p95`, `auc.pInWindow`. Any spread beyond the last printed digit
is Monte Carlo error being presented as a clinical probability.

**B4 — Steady-state adequacy (F3).** `ssHistory` with n ∈ {1,2,4,6,10,20,30} at fixed typical
parameters; compare `aucFromConc` over `[tEnd, tEnd+12]` against `dose_MPA / CL`.

**B2b — Exact steady state (§4 measure S2).** For periodic dosing with period `T` and dose
events `(t_j, A_j)` inside one period (absorption start = dose time + lag), the infinite
superposition collapses to a geometric series:

```
C_ss(t)   = Σ_j Σ_r (A_j·ka·w_r / V1) · e^(−r·Δ_j) / (1 − e^(−r·T)) ,  Δ_j = (t − t_j) mod T

AUC[t0,t0+τ] = Σ_j Σ_r (A_j·ka·w_r / V1) · (e^(−r·a) − e^(−r·(a+ℓ))) / (r·(1 − e^(−r·T)))
               summed over the sub-segments of the window, a = elapsed age of dose j, ℓ = segment length
```

with `r, w_r` the three rate/coefficient pairs of B2. `T` = 12 h for MMF (one dose per
period) and **24 h for EC-MPS** (two doses per period — the morning/evening lags make the
absorption pattern 24-hour-periodic, S12). Validate against `tests/golden.json`: this
reproduces 46.1875, 45.2683, 38.9817 and the exact 84.2500 invariant, and it is correct for
any V2 — which is what makes it the fix for F20 as well as a ×5582 speed-up.

**B5 — Prior plausibility (F19, F20).** Draw 2000 η from `omegaVars`, compute
`t½,term = ln2 / β` per draw, and tabulate the fraction above 1 week and 1 year. Repeat with
`ETA.iiv` set to the exact log-normal values `ln(1 + CV²)`. Then run `runFit` with `obs: []`
and compare the population median against `dose_MPA / CL`.
