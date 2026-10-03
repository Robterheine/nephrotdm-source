# Calibration of record — tacrolimus (Størset 2014), NephroTDM 1.2.x

**What is measured.** Simulation–recovery with the production engine (`B.runFit`), as for MPA (`CALIBRATION_RESULTS.md`):
synthetic patients with *known* random effects are generated from the implemented model, fitted, and the 5–95 % interval of
the **steady-state AUC₀–₁₂ and trough on a typical day (κ = 0)** is checked against the true value. Acceptance: coverage
inside 85–95 % (n = 100 per cell → SE ≈ 3 points, 95 % CI ≈ ±7). Four quantities per cell: AUC and trough, each actual
(haematocrit of the sample) and corrected to 0.35. Tool: `tools/calibrate_storset.mjs`; tables assembled by
`tools/assemble_calibration_storset.mjs` from the per-patient records.

**Truth is harder than the fitted model, on purpose.** Every patient gets a fresh κ on F (CV 23 %) and on ka (CV 120 %) on
**every** day (12 days in the steady-state cells, 22 in the history cells), a draw from the correlated (CL, V1, Q) block, 60 % men,
weights 45–130 kg, prednisolone 5–20 mg/day, haematocrit 0.22–0.48 (mean 0.34), proportional noise 14.9 %. The fit gives κ only to
the days that carry a sample (at most 12), and takes the others at zero.

**Cells.** `ss` = steady-state mode, samples on the last day(s); `hist` = a typed 21-day history. `trough1` one predose trough;
`troughs5` predose troughs on five consecutive days; `profile3` predose + 1 h + 3 h. Arms (on ss-profile3): **A** truth with the
exact log-normal ω² instead of the √ω² reading; **B** truth with ρ(V1,Q) = 0 instead of the assumed 0.27; **C** 15 % CYP3A5 expressers
in the truth, every patient fitted as “unknown” (= non-expresser, owner decision D4).

**Configuration of the record.** All sampled days (≤ 12) carry κF and κka; BFGS MAP; 8 chains pooled, each with its own seed (so the same draws whether the chains run in one thread or on workers); random-walk step scaled by
min(1, 2.38/√d); 800 000 iterations in total for fits of up to 7 etas and 1 600 000 above (`spec.mcmcIters`, 3 200 000 above 15); 32 000 kept draws.
**This is the second full run of the final design.** The first used one random-number stream for all chains. After the speed work (`PERFORMANCE_AUDIT_V121.md`) the study was repeated on the engine as shipped and gave the same picture: coverage 86–92 % in all 36 figures, convergence in 100 % of fits in every cell (98–100 % before per-chain seeds; the five-day cells had 2–3 borderline failures at R̂ 1.012–1.013).

<!-- TABLES START -->

| cell | n | AUC cov. | trough cov. | AUC corr. cov. | trough corr. cov. | median AUC interval (p95/p5) | median trough interval | median \|AUC error\| | converged | s/fit |
|---|---|---|---|---|---|---|---|---|---|---|
| ss-trough1 — steady state · one predose trough | 100 | 86% | 87% | 86% | 87% | ×/÷ 1.77 | ×/÷ 1.79 | 12% | 100% | 1 |
| ss-troughs5 — steady state · predose troughs on 5 days | 100 | 90% | 86% | 90% | 86% | ×/÷ 1.51 | ×/÷ 1.40 | 8% | 100% | 4 |
| ss-profile3 — steady state · predose + 1 h + 3 h | 100 | 90% | 87% | 90% | 87% | ×/÷ 1.57 | ×/÷ 1.73 | 10% | 100% | 1 |
| hist-trough1 — 21-day history · one predose trough | 100 | 92% | 90% | 92% | 90% | ×/÷ 1.78 | ×/÷ 1.80 | 10% | 100% | 2 |
| hist-troughs5 — 21-day history · predose troughs on 5 days | 100 | 91% | 90% | 91% | 90% | ×/÷ 1.52 | ×/÷ 1.40 | 9% | 100% | 7 |
| hist-profile3 — 21-day history · predose + 1 h + 3 h | 100 | 92% | 88% | 92% | 88% | ×/÷ 1.59 | ×/÷ 1.75 | 9% | 100% | 3 |
| ss-profile3-armA — arm A · truth with exact log-normal ω² (ss-profile3) | 100 | 90% | 89% | 90% | 89% | ×/÷ 1.57 | ×/÷ 1.73 | 10% | 100% | 1 |
| ss-profile3-armB — arm B · truth with ρ(V1,Q) = 0 (ss-profile3) | 100 | 91% | 89% | 91% | 89% | ×/÷ 1.57 | ×/÷ 1.73 | 10% | 100% | 1 |
| ss-profile3-armC — arm C · 15 % CYP3A5 expressers in truth, fitted as “unknown” (ss-profile3) | 100 | 88% | 92% | 88% | 92% | ×/÷ 1.58 | ×/÷ 1.74 | 9% | 100% | 1 |

`*` = the 95 % confidence interval of the coverage lies wholly outside 85–95 %; `†` = the point estimate is outside the band but its interval overlaps it. Intervals: ±1.96·√(p(1−p)/n), ≈ ±7 points at n = 100.

Cells scored: 9; coverage figures: 36, of which 0 are clearly outside the band.

<!-- TABLES END -->

## Reading the table

- **All 36 coverage figures (9 cells × AUC/trough × actual/corrected) lie inside 85–95 %** (86–92 %); none is even marginal in the sense of
  the † flag. Convergence passed in 100 % of fits in every cell.
- **The corrected values calibrate exactly like the actual ones** — in every cell their coverage is identical or within a point. That is
  expected (they are the same plasma curve through a different haematocrit) and means the correction adds no calibration risk of its own.
- **The three arms are in band** on the ss-profile3 design: an exact log-normal ω² in the truth (A: 90 % / 89 %), no V1–Q correlation (B: 91 % / 89 %),
  and 15 % unrecognised CYP3A5 expressers (C: 88 % / 92 %). The √ω² reading, the assumed 0.27 correlation and "unknown = non-expresser"
  therefore do not, at this sample size (±7 points), move the coverage out of band. Arm C's AUC median error is 9 % (the others 10 %), so the data
  correct most of an unrecognised expresser's clearance once samples exist; for a forecast with no samples the 1.59-fold exposure difference
  stays (the population forecast, tested in `CYP3A5: an expresser has a lower exposure`).
- **The width tells the story of the sampling design.** AUC interval (5–95 %, ×/÷): one trough 1.76–1.78, predose + 1 h + 3 h 1.57–1.59, troughs
  on five days 1.51–1.52; the population forecast (no samples) is about 3.4. A second sampled day buys more than extra samples on the same day
  (model property, `MODEL_ANALYSIS_STORSET_2014.md` S6).
- **What this does not show.** The truth is generated from the same model the app fits, with its own assumptions, so this calibrates the
  *inference* (sampler, MAP, occasion layout, assay and haematocrit handling), not the model's validity in a real patient; the AUC was never
  externally evaluated in the source study. n = 100 per cell gives ±7 points, so small miscalibrations (a few points) would not show.
- **Cost.** Median seconds per fit in this run (nine jobs at once on ten cores, one thread each): 1–3 for up to three sampled days, 4–7 for five days. A twelve-day design (27 parameters) is not in the grid; it was timed separately (about 26 s in one thread on a quiet machine, R̂ 1.007, ESS 916).


## The layout experiment (tried, measured, reverted)

The first full run (all sampled days carry κF and κka, 800 000 iterations throughout) left 16 % of the five-day-trough fits
(13 etas) just short of R̂ < 1.01 (R̂ 1.010–1.024, ESS mostly > 500; their coverage was not worse). The plan's remedy list
(PM13) offered dropping κka from days with no sample soon after a dose, since a 12-hour trough looks insensitive to ka. It was implemented
(κka only for days with a sample ≤ 4 h after a dose), the whole study was re-run, and **every one of the nine cells got worse**:

| cell | all days κka: n · AUC cov. · trough cov. · trough interval | κka only if sample ≤ 4 h: n · AUC cov. · trough cov. · trough interval |
|---|---|---|
| ss-trough1 | 100 · 86 % · 87 % · ×/÷ 1.78 | 100 · 83 % · 85 % · ×/÷ 1.69 |
| ss-troughs5 | 45 · 98 % · 93 % · ×/÷ 1.40 | 100 · 88 % · **79 %** · ×/÷ 1.35 |
| ss-profile3 | 98 · 90 % · 87 % · ×/÷ 1.72 | 100 · 86 % · 86 % · ×/÷ 1.63 |
| hist-trough1 | 100 · 92 % · 89 % · ×/÷ 1.80 | 100 · 91 % · 86 % · ×/÷ 1.70 |
| hist-troughs5 | 37 · 95 % · 89 % · ×/÷ 1.40 | 78 · 86 % · 82 % · ×/÷ 1.36 |
| hist-profile3 | 70 · 90 % · 87 % · ×/÷ 1.75 | 99 · 90 % · 86 % · ×/÷ 1.67 |
| arm A | 98 · 90 % · 89 % · ×/÷ 1.73 | 100 · 87 % · 86 % · ×/÷ 1.63 |
| arm B | 97 · 91 % · 89 % · ×/÷ 1.72 | 100 · 85 % · 86 % · ×/÷ 1.62 |
| arm C | 98 · 88 % · 92 % · ×/÷ 1.74 | 100 · 85 % · 87 % · ×/÷ 1.63 |

(The all-days column is the first run, so the troughs5 and hist-profile3 rows have n < 100 because those jobs were stopped when the
layout change was decided.) Intervals ~5 % narrower and coverage 2–5 points lower in every cell, trough coverage down to
79–82 % in the five-day designs: with κka at a 120 % CV, a slow absorber (κka ≈ −2) still has drug in the gut at 12 h, so a trough
does sense it, and removing the parameter makes the fit overconfident. **Reverted.** Convergence is bought with iterations instead.
The raw records of both runs were in `/tmp/tac_layoutA` and `/tmp/tac_layoutB` (volatile); this table is the durable record.
This is the second time in this project that an efficiency change was tried, measured against the calibration, and rejected
(the first: the MPA half-life cap, `mpa-omega-prior-kept-as-is`).
