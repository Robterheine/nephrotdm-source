# Calibration of record: everolimus (Zwart 2021 Model 3), NephroTDM 1.4.0

**What is measured.** Simulation–recovery with the production engine (`B.runFit`), as for MPA and tacrolimus: synthetic patients with *known* random effects are generated from the
implemented model, fitted, and the 5–95 % interval of the **steady-state AUC₀–₁₂ and trough of the current regimen** is checked against the true value. Acceptance: coverage inside
85–95 % (n = 100 per cell, so the standard error is about 3 points and the 95 % interval about ±7). Four quantities per cell: AUC and trough, each actual (the patient's haematocrit)
and corrected to 0.38. Tool: `tools/calibrate_evr.mjs`; tables assembled by `tools/assemble_calibration_evr.mjs` from the per-patient records.

**What this does and does not show.** Model 3 has no occasion (day-to-day) effect and the truth is drawn from the same model with the same residual error, so a correct engine, sampler and
exposure summary should cover at the nominal 90 %. This checks the implementation. It says nothing about how well the model describes real patients; that is the paper's external validation
(Table 2), quoted in About: a future trough has a mean absolute error of about 26–30 %, a future AUC about 11–13 %, and a forecast without any sample over-predicts the AUC by about 43 %.

**Truth.** CLINT, V3 and FU drawn from the prior (variances 0.118, 0.401, 0.0009), prednisolone group 50/50, dose 1, 1.5 or 2 mg twice daily, haematocrit constant per patient, log-normal
residual SD 0.309 on the whole-blood concentration.

**Cells.** `ss` = steady-state mode; `hist` = a typed 21-day history (42 doses). `trough1` one predose trough; `profile2` predose plus one sample 2 h after the dose. Haematocrit: normal
(0.36 ± 0.05, clipped to 0.20–0.55), low (0.26) or high (0.46). Twelve cells in all.

**Configuration of the record.** BFGS MAP; 8 chains pooled, each with its own seed; random-walk step scaled by min(1, 2.38/√d); 400 000 iterations in total (`spec.mcmcIters`), 32 000 kept
draws; run in Node, in one thread per process (the browser uses the worker pool).

<!-- TABLES START -->

| cell | n | AUC cov. | trough cov. | AUC corr. cov. | trough corr. cov. | median AUC interval (p95/p5) | median trough interval | median \|AUC error\| | converged | s/fit |
|---|---|---|---|---|---|---|---|---|---|---|
| ss-trough1 — steady state · one predose trough, Ht normal (0.36 ± 0.05) | 100 | 89% | 90% | 89% | 90% | ×/÷ 2.06 | ×/÷ 2.24 | 17% | 100% | 0.5 |
| ss-trough1 — steady state · one predose trough, Ht low (0.26) | 100 | 88% | 90% | 88% | 90% | ×/÷ 2.04 | ×/÷ 2.26 | 17% | 100% | 0.5 |
| ss-trough1 — steady state · one predose trough, Ht high (0.46) | 100 | 89% | 91% | 89% | 91% | ×/÷ 2.07 | ×/÷ 2.22 | 17% | 100% | 0.5 |
| ss-profile2 — steady state · predose + 2 h, Ht normal (0.36 ± 0.05) | 100 | 87% | 89% | 87% | 89% | ×/÷ 1.82 | ×/÷ 2.07 | 13% | 100% | 0.5 |
| ss-profile2 — steady state · predose + 2 h, Ht low (0.26) | 100 | 87% | 89% | 87% | 89% | ×/÷ 1.82 | ×/÷ 2.11 | 13% | 100% | 0.6 |
| ss-profile2 — steady state · predose + 2 h, Ht high (0.46) | 100 | 87% | 89% | 87% | 89% | ×/÷ 1.82 | ×/÷ 2.06 | 13% | 100% | 0.6 |
| hist-trough1 — 21-day history · one predose trough, Ht normal (0.36 ± 0.05) | 100 | 88% | 90% | 88% | 90% | ×/÷ 2.06 | ×/÷ 2.24 | 17% | 100% | 2.0 |
| hist-trough1 — 21-day history · one predose trough, Ht low (0.26) | 100 | 87% | 90% | 87% | 90% | ×/÷ 2.04 | ×/÷ 2.26 | 17% | 100% | 1.9 |
| hist-trough1 — 21-day history · one predose trough, Ht high (0.46) | 100 | 89% | 91% | 89% | 91% | ×/÷ 2.07 | ×/÷ 2.22 | 17% | 100% | 2.0 |
| hist-profile2 — 21-day history · predose + 2 h, Ht normal (0.36 ± 0.05) | 100 | 87% | 89% | 87% | 89% | ×/÷ 1.82 | ×/÷ 2.07 | 13% | 100% | 3.2 |
| hist-profile2 — 21-day history · predose + 2 h, Ht low (0.26) | 100 | 87% | 89% | 87% | 89% | ×/÷ 1.81 | ×/÷ 2.09 | 13% | 100% | 2.6 |
| hist-profile2 — 21-day history · predose + 2 h, Ht high (0.46) | 100 | 87% | 89% | 87% | 89% | ×/÷ 1.82 | ×/÷ 2.04 | 13% | 100% | 2.6 |

`*` = the 95 % confidence interval of the coverage lies wholly outside 85–95 %; `†` = the point estimate is outside the band but its interval overlaps it. Intervals: ±1.96·√(p(1−p)/n), about ±7 points at n = 100.

Cells scored: 12; fits: 1200; coverage figures: 48, of which 0 are clearly outside the band. Converged (R̂ < 1.01, ESS ≥ 400): 1200/1200; worst R̂ 1.0009; smallest ESS 15264.

<!-- TABLES END -->

## Reading the table

- Coverage is inside the 85–95 % band in all 48 figures (87–91 %), and the actual and corrected figures are identical, as they should be (the same plasma curve read at two haematocrits). The AUC figures sit at 87–89 %, a little below the nominal 90 % in every cell; that is within the standard error (about 3 points) and the same direction in all twelve cells, so it is noted here and not explained away.
- Intervals are wide with a single trough (about ×/÷ 2 for the AUC and the trough): a trough informs the clearance (and so the AUC through Dose/(CLINT·FU)) but not the volume, and the interval says so.
  A second sample 2 h after the dose narrows the AUC interval to about ×/÷ 1.8.
- Haematocrit (low, normal, high) changes neither coverage nor interval width, which is what the Eq. 3 correction and the Ht-dependent hepatic flow should give.
- The sampler is far past its convergence bar (see the line under the table); `mcmcIters` could be lowered if speed ever matters, since a fit takes about 0.5 s (steady state) to 3 s (history) in one thread in Node.
