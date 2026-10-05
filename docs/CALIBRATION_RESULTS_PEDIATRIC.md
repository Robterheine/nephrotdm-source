# Calibration of record: pediatric MPA (`mpaped`) and pediatric tacrolimus (`tacped`), NephroTDM 1.5.0 candidate

Statistician's seat (hand-off section 7: L4, L4b, sampler behaviour, L5; gates G3 and G4). Written by an independent session that did not build the code and did not read
`VERIFICATION_PEDIATRIC.md` or `NONMEM_CROSSCHECK_PEDIATRIC.md` before the numbers existed. The acceptance numbers are those of the hand-off, fixed before any result; none was moved.
No dose recommendation appears anywhere in this document or in the scripts (the doses in the simulations are a design choice of the simulation only).

## 1. What was done and how

**Code under test:** `src/mpaped.js`, `src/tacped.js`, `src/bayes.js` (`runFit` with the shipped defaults: `spec.mcmcIters` = 800 000 for up to 7 etas (MPA), 400 000 (tacrolimus), 8 chains with per-chain seeds, 32 000 kept draws). Each fit ran in-process, one cell per process, 8 processes at a time; by construction (`chainSeed`) this gives the same draws as the worker pool.

**The simulator is independent of the code under test.** `tools/calibrate_ped_sim.mjs` writes both models as linear state-space systems straight from the NONMEM streams (`mpa_ped_run57.ctl`, `tac_ped_published.ctl`) and solves them with a matrix exponential. For tacrolimus every dose enters the absorption chain of its own formulation (the per-dose formulation of decision D5). Truth for the steady state comes from the same matrices (solve of (I − e^(AT)) x = dose, Simpson integration at 0.005 h). `tools/calibrate_ped_selfcheck.mjs` compares this simulator with the app engines: max relative difference 3e-12 (MPA history with an occasion effect per day), 1e-11 (MPA steady-state trough), 2e-12 (tacrolimus history with per-dose formulation), 1.6e-5 (tacrolimus steady-state AUC, the size of the app's Simpson grid error), plasma AUC identities 1e-8 and 1e-9. So the truth used below is the model the app implements, obtained by a separate route.

**Truth and data.**
- Truth etas are drawn from the prior (MPA: CL 0.139, Vc 2.42, Q 0.337; tacrolimus: KA 0.644, CLINT 0.456, V3 0.692), covariates fixed per cell.
- Proportional residual (MPA σ² 0.223, tacrolimus 0.0374), drawn as Y = C(1 + ε). MPA: ε is redrawn while 1 + ε < 0.05 (the app refuses concentrations ≤ 0; this truncates 1.7 % of the draws; it is a small departure from the model, see section 6).
- MPA: **an occasion effect on F on every calendar day** (variance 0.19; 21 days in the history cells, 40 in the steady-state-mode cells). The fit gives an effect only to days that carry a sample. This is deliberately harder than the fitted model, as in `CALIBRATION_RESULTS_STORSET.md`.
- Tacrolimus has no occasion layer. Doses at 08:00 and 20:00; 21-day typed history (cells "hist") or a steady-state regimen (cells "ss", 30 doses entered; 40 days simulated).
- Quantities scored (L4): the steady-state AUC0-12 and trough of the LAST regimen on a typical day (occasion effects 0). MPA: plasma, mg·h/L and mg/L. Tacrolimus: whole blood, actual (at the haematocrit of the last sample day) and corrected to 0.35, µg·h/L and µg/L. Interval: the 5-95 % interval the app reports. Bias = median over patients of (posterior median / truth − 1).
- **Acceptance (hand-off, unchanged):** coverage 85-95 %; convergence ≥ 98 % (`fit.convergence.ok`: R̂ < 1.01 and ESS ≥ 400 for log AUC and log trough); no cell biased by more than 5 %. n = 100 per cell gives SE of coverage about 3 points (95 % interval about ±6-7). Flags: `*` the 95 % interval of the coverage lies wholly outside 85-95 %; `†` the point estimate is outside but its interval reaches the band.

**Design of the cells** (a full cross product would be 72 MPA and 54 tacrolimus cells; a fractional design covers every level of every factor in 18 and 22 cells).
- MPA, baseline 38 kg, albumin 34, 0/1/2 h, one occasion. Schedule: trough (M01), 0/1/2 (M02), 0/0.5/2 (M03), rich with 8 samples at 0, 0.5, 1, 1.5, 2, 4, 6, 8 h (M04). Second occasion (7 days before, same schedule): trough, 0/1/2, rich (M05-M07). Weight 13 and 75 kg (M08, M09); albumin 25 and 41 (M10, M11). Crossed corners of weight × albumin × schedule × occasions (M12-M16), and steady-state mode with one and two occasions (M17, M18). Each level of weight (13, 38, 75), albumin (25, 34, 41), schedule (4) and occasions (1, 2) appears at least three times.
- Tacrolimus, baseline 25 kg, Ht 0.30, capsule, 0/1/2 h. Schedule: trough, 0/1/2, 0/1/2/4 (T01-T03). Ht 0.22 and 0.45 (T04, T05). Suspension, and a history with a switch capsule→suspension (T06, T07); weight 12 and 60 kg (T08, T09). Crossed corners (T10-T15, including switch suspension→capsule and trough-only designs), steady-state mode, capsule and suspension (T16, T17). Switches happen 9 days before the last dose.
- **Haematocrit changes between samples (item 5):** cells H00-H04 sample on two days (7 days before the last dose and the last day). H00 constant 0.33 (control); H01 0.42 → 0.26 and H02 0.24 → 0.40 change as a step 5 days before the last dose, in the truth's pharmacokinetics (hepatic flow) and in each sample's own Ht; H03, H04 are trough-only versions. H00-H02 share patients and noise draws (paired).

**Seeds** (all fixed, simulation and fit in different families). Simulation: `mulberry32(5550000 + g·100003 + i·7919)` with g the index of the cell (g = 900 for all H cells so that they are paired), i = patient 0-99. Fit: `seed = 9100000 + 31·i`. L5: simulation `7700000 + 1000003·cohort + 7919·patient`, fit `9300000 + 100000·cohort + 31·patient`. Nothing was re-run to change a result. The diagnostic runs of section 4 reuse the same seeds on purpose.

**Run times.** MPA 18 cells × 100 fits: 2 097 s wall time on 8 parallel processes (1.3 s per fit for trough-only to 17 s for 8 samples on two occasions; 7 etas). Tacrolimus 22 cells × 100 fits: 3 206 s (2 s to 17 s per fit). L5 and the red-first runs ran at the same time as other jobs, so their times are not clean. Files: scripts `tools/calibrate_ped*.mjs`, per-patient records `/tmp/claude-501/calibration_ped/` (volatile; the tables below are the durable record).

## 2. L4 calibration, MPA pediatric (G3)

| cell | design | n | AUC cov. | trough cov. | bias AUC (median, 95% CI) | bias trough | converged | R̂ max | ESS min (AUC) | interval ×/÷ (AUC) | s/fit |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| M01 | 38 kg, alb 34, trough, 1 occ | 100 | 88% | 88% | 4.9% (1.7 to 9.8) | 9.8%† | 100% | 1.0005 | 19848 | 2.46 | 2.0 |
| M02 | 38, 34, 0/1/2 h, 1 occ | 100 | 88% | 86% | 5.1% (-3.1 to 9.4)† | 9.0%† | 100% | 1.0007 | 14868 | 2.19 | 4.5 |
| M03 | 38, 34, 0/0.5/2 h, 1 occ | 100 | 91% | 89% | 4.1% (1.1 to 9.1) | 3.8% | 100% | 1.0006 | 17083 | 2.19 | 4.5 |
| M04 | 38, 34, rich (8), 1 occ | 100 | 85% | 83%† | 7.0% (3.4 to 11.3)† | 7.2%† | 100% | 1.0029 | 4146 | 1.84 | 11.2 |
| M05 | 38, 34, trough, 2 occ | 100 | 89% | 89% | 4.8% (0.4 to 9.3) | 3.4% | 100% | 1.0007 | 11781 | 2.20 | 4.4 |
| M06 | 38, 34, 0/1/2 h, 2 occ | 100 | 89% | 87% | 6.1% (0.2 to 9.6)† | 9.7%† | 100% | 1.0009 | 6011 | 1.96 | 9.1 |
| M07 | 38, 34, rich (8), 2 occ | 100 | 90% | 77%† | 2.4% (-1.0 to 9.2) | 5.4%† | 100% | 1.0009 | 8853 | 1.67 | 17.2 |
| M08 | 13 kg, 34, 0/1/2 h, 1 occ | 100 | 89% | 91% | 2.4% (-3.2 to 7.0) | 5.5%† | 100% | 1.0006 | 16331 | 2.19 | 4.4 |
| M09 | 75 kg, 34, 0/1/2 h, 1 occ | 100 | 90% | 92% | 2.6% (-0.8 to 11.2) | 8.3%† | 100% | 1.0007 | 16066 | 2.30 | 4.8 |
| M10 | 38, alb 25, 0/1/2 h, 1 occ | 100 | 89% | 92% | 0.0% (-5.7 to 6.7) | 3.3% | 100% | 1.0008 | 15120 | 2.18 | 5.0 |
| M11 | 38, alb 41, 0/1/2 h, 1 occ | 100 | 87% | 87% | 1.5% (-5.2 to 10.9) | 8.8%† | 100% | 1.0008 | 14181 | 2.28 | 5.0 |
| M12 | 13, 25, trough, 1 occ | 100 | 90% | 91% | -3.1% (-9.6 to 3.7) | -4.6% | 100% | 1.0007 | 19077 | 2.35 | 2.3 |
| M13 | 75, 41, 0/0.5/2 h, 1 occ | 100 | 85% | 83%† | 4.8% (-0.1 to 10.9) | 6.8%† | 100% | 1.0006 | 15854 | 2.29 | 5.1 |
| M14 | 13, 41, rich (8), 2 occ | 100 | 82%† | 78%† | 2.8% (-2.4 to 7.6) | 6.0%† | 99% | 1.0153 | 324 | 1.68 | 11.1 |
| M15 | 75, 25, 0/1/2 h, 2 occ | 100 | 88% | 89% | 7.3% (1.3 to 10.8)† | 11.3%† | 100% | 1.0018 | 6814 | 1.92 | 7.2 |
| M16 | 13, 34, trough, 2 occ | 100 | 89% | 85% | 4.6% (-0.1 to 9.8) | 12.2%† | 100% | 1.0009 | 13485 | 2.14 | 3.7 |
| M17 | 38, 34, 0/1/2 h, 1 occ, steady-state mode | 100 | 90% | 91% | 4.7% (1.7 to 10.6) | 8.7%† | 100% | 1.0007 | 15604 | 2.14 | 1.3 |
| M18 | 38, 34, 0/1/2 h, 2 occ, steady-state mode | 100 | 91% | 87% | 1.5% (-2.3 to 10.3) | 4.7% | 100% | 1.0011 | 10827 | 1.86 | 2.5 |

`*` = the 95% interval of the coverage (±1.96·√(p(1−p)/n)) lies wholly outside 85–95%; `†` = the point estimate is outside the criterion but its interval reaches it. Bias = median over patients of (posterior median / truth − 1). Cells: 18; coverage figures 36, clearly outside the band 0; cells with a point-estimate bias above 5% (AUC or trough) 13; cells with convergence below 98% 0.

**Reading.** All 36 coverage figures are inside 85-95 % or have an interval that reaches it (none is clearly outside, no `*`). AUC coverage 82-91 % (mean 88 %); the trough is covered 77-92 %, lowest in the rich designs (M07 77 %, M14 78 %, M04 and M13 83 %). Convergence 99.94 % (1 fit in 1 800, R̂ 1.015, ESS 324, cell M14). **The bias criterion is not met under this data-generating process:** the posterior median of the AUC is 0-7 % high (4 cells above 5 %: M02, M04, M06, M15), the trough 3-12 % high (13 cells above 5 %). Section 4 shows where this comes from and that it vanishes when the data are generated exactly as the model assumes.

## 3. L4 calibration, tacrolimus pediatric (G3)

| cell | design | n | AUC cov. | trough cov. | AUC corr. cov. | trough corr. cov. | bias AUC (median, 95% CI) | bias trough | converged | R̂ max | ESS min (AUC) | interval ×/÷ (AUC) | s/fit |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| T01 | 25 kg, Ht 0.30, capsule, trough | 100 | 97%† | 97%† | 97%† | 97%† | -5.3% (-7.2 to -1.3)† | 0.5% | 100% | 1.0012 | 11623 | 2.02 | 5.5 |
| T02 | 25, 0.30, capsule, 0/1/2 h | 100 | 88% | 90% | 88% | 90% | -2.1% (-3.5 to 2.1) | 0.3% | 100% | 1.0013 | 9948 | 1.51 | 10.5 |
| T03 | 25, 0.30, capsule, 0/1/2/4 h | 100 | 95% | 95% | 95% | 95% | -0.9% (-3.2 to 2.5) | -0.8% | 100% | 1.0011 | 9117 | 1.41 | 13.1 |
| T04 | 25, Ht 0.22, capsule, 0/1/2 h | 100 | 94% | 90% | 94% | 90% | 0.6% (-1.3 to 4.8) | 4.7% | 100% | 1.0010 | 10835 | 1.53 | 10.5 |
| T05 | 25, Ht 0.45, capsule, 0/1/2 h | 100 | 88% | 89% | 88% | 89% | 1.6% (-1.1 to 4.8) | 1.6% | 100% | 1.0010 | 10818 | 1.51 | 10.5 |
| T06 | 25, 0.30, suspension, 0/1/2 h | 100 | 84%† | 90% | 84%† | 90% | -2.7% (-5.1 to 1.6) | -2.0% | 100% | 1.0012 | 7916 | 1.47 | 10.1 |
| T07 | 25, 0.30, capsule→suspension, 0/1/2 h | 100 | 89% | 91% | 89% | 91% | 2.5% (-0.3 to 4.4) | 2.4% | 100% | 1.0014 | 5412 | 1.47 | 10.4 |
| T08 | 12 kg, 0.30, capsule, 0/1/2 h | 100 | 89% | 88% | 89% | 88% | 0.0% (-4.1 to 2.6) | 0.8% | 100% | 1.0013 | 8868 | 1.53 | 10.6 |
| T09 | 60 kg, 0.30, capsule, 0/1/2 h | 100 | 89% | 90% | 89% | 90% | 1.6% (-2.8 to 5.5) | 3.5% | 100% | 1.0012 | 10746 | 1.51 | 10.0 |
| T10 | 12, 0.22, suspension, trough | 100 | 90% | 94% | 90% | 94% | -3.8% (-8.6 to 1.0) | -1.1% | 100% | 1.0012 | 12308 | 2.28 | 4.1 |
| T11 | 60, 0.45, capsule, 0/1/2/4 h | 100 | 95% | 91% | 95% | 91% | -0.5% (-1.8 to 1.1) | -0.8% | 100% | 1.0010 | 9173 | 1.40 | 12.6 |
| T12 | 12, 0.45, suspension→capsule, 0/1/2/4 h | 100 | 91% | 89% | 91% | 89% | -0.5% (-3.6 to 1.9) | -1.6% | 100% | 1.0011 | 9913 | 1.40 | 12.3 |
| T13 | 60, 0.22, suspension, 0/1/2/4 h | 100 | 95% | 87% | 95% | 87% | -0.0% (-2.6 to 2.1) | 1.4% | 100% | 1.0017 | 4868 | 1.39 | 12.0 |
| T14 | 25, 0.30, suspension, trough | 100 | 87% | 86% | 87% | 86% | 4.1% (-2.7 to 11.2) | 0.9% | 100% | 1.0011 | 8873 | 2.14 | 4.3 |
| T15 | 25, 0.30, capsule→suspension, trough | 100 | 93% | 95% | 93% | 95% | 2.7% (-3.1 to 8.8) | 2.2% | 100% | 1.0014 | 11869 | 2.10 | 4.3 |
| T16 | 25, 0.30, capsule, 0/1/2 h, steady-state mode | 100 | 91% | 93% | 91% | 93% | -0.7% (-2.4 to 3.8) | 4.1% | 100% | 1.0009 | 9924 | 1.52 | 2.0 |
| T17 | 25, 0.30, suspension, 0/1/2 h, steady-state mode | 100 | 90% | 88% | 90% | 88% | -0.6% (-2.9 to 2.1) | -3.0% | 100% | 1.0016 | 4177 | 1.48 | 2.1 |
| H00 | 25, Ht 0.33 constant, capsule, 0/1/2 h on 2 days | 100 | 94% | 93% | 94% | 93% | 0.6% (-1.4 to 2.4) | 0.3% | 100% | 1.0010 | 6537 | 1.35 | 16.6 |
| H01 | 25, Ht 0.42→0.26, capsule, 0/1/2 h on 2 days | 100 | 92% | 88% | 92% | 88% | 1.7% (-0.2 to 4.2) | 3.3% | 100% | 1.0017 | 6503 | 1.35 | 16.5 |
| H02 | 25, Ht 0.24→0.40, capsule, 0/1/2 h on 2 days | 100 | 93% | 91% | 93% | 91% | 0.0% (-2.6 to 1.9) | -3.3% | 100% | 1.0009 | 8790 | 1.35 | 16.5 |
| H03 | 25, Ht 0.42→0.26, suspension, trough on 2 days | 100 | 94% | 86% | 94% | 86% | 1.5% (-1.4 to 5.8) | 4.3% | 100% | 1.0010 | 13929 | 1.95 | 11.4 |
| H04 | 25, Ht 0.24→0.40, capsule, trough on 2 days | 100 | 90% | 88% | 90% | 88% | -4.4% (-7.1 to 0.3) | -4.1% | 100% | 1.0009 | 13754 | 1.78 | 9.4 |

`*` = the 95% interval of the coverage (±1.96·√(p(1−p)/n)) lies wholly outside 85–95%; `†` = the point estimate is outside the criterion but its interval reaches it. Bias = median over patients of (posterior median / truth − 1). Cells: 22; coverage figures 88, clearly outside the band 0; cells with a point-estimate bias above 5% (AUC or trough) 1; cells with convergence below 98% 0.

**Reading.** All 88 coverage figures are inside the band or reach it; point estimates 84-97 %. Trough-only designs on the capsule (T01) are conservative (97 %). Actual and corrected coverage are identical in every cell except by rounding, as expected (same plasma curve, monotone transform). Convergence 100 % in all 2 200 fits. Bias: one cell above 5 % (T01 AUC −5.3 %, interval reaches 0); all others within ±4.7 %. Suspension and the capsule→suspension and suspension→capsule switch cells behave like the capsule cells.

### Haematocrit changing between samples (open question of the hand-off, item 5)

| cell | Ht path | covers AUC / trough (actual) | covers AUC / trough (corrected) | median relative error AUC / trough (actual) | median relative error AUC / trough (corrected) | median |paired difference in relative error| vs H00 (AUC actual) | 90th percentile of that difference |
|---|---|---|---|---|---|---|---|
| H00 | 0.33 constant | 94% / 93% | 94% / 93% | 0.6% / 0.3% | 0.6% / 0.3% | 0.0% | 0.0% |
| H01 | 0.42 to 0.26 | 92% / 88% | 92% / 88% | 1.7% / 3.3% | 1.7% / 3.3% | 1.0% | 2.8% |
| H02 | 0.24 to 0.40 | 93% / 91% | 93% / 91% | 0.0% / -3.3% | 0.0% / -3.3% | 0.8% | 2.2% |

Trough-only versions (two trough days): H03: AUC cov 94%, trough cov 86%, bias AUC 1.5%; H04: AUC cov 90%, trough cov 88%, bias AUC -4.4%; 

Same patients, same noise, only the haematocrit path differs. Coverage with a step change in Ht is 92 % / 93 % for the AUC (control 94 %) and 88 % / 91 % for the trough (control 93 %); the median relative error moves by 0-3 points (control 0.6 / 0.3; changes 1.7 / 3.3 and 0.0 / −3.3). Per patient the AUC estimate differs from the constant-Ht control by a median of about 1 % (90th percentile 2-3 %). Trough-only versions (two trough days, Ht changing): AUC coverage 94 % and 90 %, trough coverage 86 % and 88 %; AUC bias 1.5 % and −4.4 % (the latter is the same size as the trough-only cell without a change, T01, −5.3 %). **The one-haematocrit approximation does not materially affect coverage or bias in these cells.** A step is the worst shape; a gradual change or a change within a day was not simulated, nor were changes larger than 0.16 L/L.

## 4. Why MPA is biased in section 2: diagnostic runs (not part of the acceptance table)

Two cells (M01 trough only, M02 0/1/2 h), the same seeds, changing only the data-generating process. The mean rank is the mean over patients of the share of posterior draws below the true CL eta (0.5 if the posterior is exact).

| data-generating process | cell | n | AUC cov. | trough cov. | bias AUC | bias trough | mean rank of the true CL eta (0.5 expected) |
|---|---|---|---|---|---|---|---|
| as in the table (kappa on every day, sigma² 0.223) | M01 | 100 | 88% | 88% | 4.9% | 9.8% | 0.552 |
| as in the table (kappa on every day, sigma² 0.223) | M02 | 100 | 88% | 86% | 5.1% | 9.0% | 0.533 |
| kappa only on the sampled days and the day before (sigma² 0.223) | M01 | 100 | 89% | 88% | 1.7% | 4.2% | 0.520 |
| kappa only on the sampled days and the day before (sigma² 0.223) | M02 | 100 | 88% | 91% | 2.4% | 6.0% | 0.497 |
| kappa on every day, sigma² 0.05 (fit and simulation) | M01 | 200 | 88% | 84%† | 3.4% | 6.8% | 0.550 |
| kappa only on sampled days, sigma² 0.05 (fully model-consistent) | M01 | 200 | 90% | 90% | -0.6% | 0.3% | 0.492 |
| kappa only on sampled days, sigma² 0.05 (fully model-consistent) | M02 | 200 | 90% | 90% | -0.3% | 3.5% | 0.511 |

With data generated exactly as the model assumes (occasion effects only on the sampled days and the day before, σ² 0.05 so that the truncation of the residual is negligible, 200 patients per cell) the bias is −0.6 / −0.3 % for the AUC, 0.3 / 3.5 % for the trough, coverage 90 % everywhere, mean rank 0.49-0.51. With an occasion effect on every day (the table of section 2) the AUC is 4-5 % high and the mean rank 0.53-0.55. Reason: the fit takes every unsampled day at κ = 0 (its median), while the real mean of e^κ is 1.10, so the data of a patient with an unmodelled history are on average about 4-5 % above the κ = 0 profile. The sampler and the likelihood are therefore calibrated for what they model; the departure is a modelling choice (typical day = median day, unsampled days at zero), and it is the size of the "sampled day versus typical day" difference of L4b. Residual noise truncation (σ² 0.223) explains little of it (σ² 0.05 with κ on every day still gives +3.4 % / +6.8 %).

## 5. L4b: typical day versus sampled day (MPA; decision D3)

The sampled-day AUC is the numerical integral over the 12 h that carry the sample, with that day's occasion effect and the true carry-over from the earlier days (a pre-dose trough alone samples the interval that ends at the trough, i.e. the day assigned to it by the app: the day of the most recent dose before the sample). Tacrolimus has no occasion layer, so there sampled day = typical day and the question does not arise. Beside the headline (typical-day) interval the table shows a hypothetical "line": the posterior of (typical AUC × e^κ of the sampled occasion) built from the same draws.

| cell | design | typical-day interval covers the sampled-day AUC | sampled-day “line” covers it | typical interval width (p95−p5) / sampled-day AUC (median) | line width / sampled-day AUC (median) | median of sampled/typical AUC (true) | SD of log(sampled/typical) (true) | bias of the typical-day median vs sampled day | bias of the line median vs sampled day |
|---|---|---|---|---|---|---|---|---|---|
| M01 | 38 kg, alb 34, trough, 1 occ | 85% | 99%* | 0.97 | 2.27 | 1.06 | 0.26 | -3.2% | -2.9% |
| M02 | 38, 34, 0/1/2 h, 1 occ | 90% | 96%† | 0.83 | 1.41 | 1.05 | 0.19 | -2.1% | -0.9% |
| M03 | 38, 34, 0/0.5/2 h, 1 occ | 86% | 96%† | 0.84 | 1.45 | 1.03 | 0.20 | 0.3% | 2.0% |
| M04 | 38, 34, rich (8), 1 occ | 98%* | 98%* | 0.64 | 1.06 | 1.07 | 0.18 | 2.6% | 1.8% |
| M05 | 38, 34, trough, 2 occ | 80%† | 99%* | 0.83 | 2.00 | 1.04 | 0.22 | -5.2% | -0.5% |
| M06 | 38, 34, 0/1/2 h, 2 occ | 96%† | 98%* | 0.71 | 1.37 | 1.03 | 0.17 | 1.7% | -1.2% |
| M07 | 38, 34, rich (8), 2 occ | 86% | 95% | 0.51 | 0.96 | 1.03 | 0.21 | 0.3% | -6.8% |
| M08 | 13 kg, 34, 0/1/2 h, 1 occ | 92% | 99%* | 0.76 | 1.34 | 1.06 | 0.21 | -4.3% | -1.6% |
| M09 | 75 kg, 34, 0/1/2 h, 1 occ | 94% | 95% | 0.86 | 1.49 | 1.07 | 0.22 | 1.3% | -0.3% |
| M10 | 38, alb 25, 0/1/2 h, 1 occ | 82%† | 97%† | 0.76 | 1.22 | 1.01 | 0.27 | -8.4% | -5.6% |
| M11 | 38, alb 41, 0/1/2 h, 1 occ | 96%† | 96%† | 0.89 | 1.57 | 1.02 | 0.16 | 0.8% | 0.4% |
| M12 | 13, 25, trough, 1 occ | 79%† | 99%* | 0.78 | 1.95 | 1.05 | 0.26 | -9.6% | -12.6% |
| M13 | 75, 41, 0/0.5/2 h, 1 occ | 91% | 96%† | 0.97 | 1.68 | 1.00 | 0.17 | 4.6% | 6.2% |
| M14 | 13, 41, rich (8), 2 occ | 88% | 91% | 0.52 | 1.07 | 1.00 | 0.17 | 0.3% | -2.6% |
| M15 | 75, 25, 0/1/2 h, 2 occ | 82%† | 99%* | 0.66 | 1.18 | 1.05 | 0.26 | -2.5% | -1.4% |
| M16 | 13, 34, trough, 2 occ | 85% | 98%* | 0.80 | 2.06 | 1.07 | 0.23 | 0.2% | -1.8% |
| M17 | 38, 34, 0/1/2 h, 1 occ, steady-state mode | 92% | 99%* | 0.77 | 1.33 | 1.07 | 0.19 | -3.4% | -3.6% |
| M18 | 38, 34, 0/1/2 h, 2 occ, steady-state mode | 79%† | 98%* | 0.61 | 1.36 | 1.05 | 0.16 | -3.4% | 2.9% |

Pooled over 1800 patients: typical-day interval covers the sampled-day AUC in 87.8%; sampled-day line in 97.1%; the typical-day interval covers the TYPICAL-day truth in 88.3%.
Occasion effect of the sampled day: the line quantity is the posterior of (typical AUC × e^κ) with κ the effect of the occasion that carries the sample (the day of the dose for profiles; the previous evening's dose for a pre-dose trough alone, because the app assigns a sample to the day of the most recent dose before it).

**What the numbers say (the decision is the owner's).** (a) The true sampled-day AUC is on average 0-7 % above the typical-day AUC (median ratio 1.00-1.07) and scatters around it with an SD of log 0.16-0.27 (about ×/÷ 1.2-1.3). (b) The existing typical-day interval, built for the typical-day truth, already covers the sampled-day AUC in 87.8 % of the 1 800 patients (cells 79-98 %); it is therefore close to, not far from, the band, because the interval is wide (typical-day interval width is 0.5-1.0 times the sampled-day AUC). The coverage is lowest (79-82 %) for low albumin, trough-only and two-occasion designs. (c) A sampled-day line would cover its target in 97.1 % (over-conservative, 10 of 18 cells at 98-99 %) and is 1.5-2.3 times as wide as the AUC. For the point estimate it is not better: its median bias against the sampled-day truth is −12.6 to +6.2 % (M12 −12.6 %, otherwise within ±7 %); that of the typical-day median is −9.6 to +4.6 %. (d) In L5 the line is the less accurate estimate of the sampled-day AUC (NRMSE 40 % against 26 % for the headline on 0/1/2 h), because the occasion effect of one day is estimated from two or three noisy points. So the data do not make the case that a "sampled day" tile would be more accurate than the typical-day estimate; they do show that the typical-day interval is not a statement about one day with the half-width of the occasion variability added.

## 6. Sampler behaviour

| drug | fits | AUC & trough chains converged (app flag) | η-chains all R̂<1.01 and ESS≥400 | volume η (Vc / V3) R̂≥1.01 or ESS<400 | …of those, AUC flag still ok | worst R̂ of the volume η | min ESS of the volume η | worst R̂ of log AUC | min ESS of log AUC | acceptance (median) |
|---|---|---|---|---|---|---|---|---|---|---|
| MPA pediatric | 1800 | 99.94% | 99.83% | 2 (0.11%) | 2 of 2 | 1.0115 | 610 | 1.0153 | 324 | 0.32 |
| Tacrolimus pediatric | 2200 | 100.00% | 100.00% | 0 (0.00%) | n/a | 1.0052 | 1384 | 1.0017 | 4177 | 0.47 |

**Rank test of the posterior (truth etas are drawn from the prior, so the rank u of the true value among the posterior draws must be uniform if the sampler and the likelihood are right).** u pooled over all cells and patients; tails are the share with u<0.01 and u>0.99 (expected 1% each), and 5/95% (expected 5% each); KS = max distance of the empirical distribution from uniform (5% critical value 1.36/√n).

| drug | η | n | u<0.01 | u>0.99 | u<0.05 | u>0.95 | decile counts (expected n/10) | KS | KS 5% crit. |
|---|---|---|---|---|---|---|---|---|---|
| MPA | CL | 1800 | 0.28% | 1.94% | 3.5% | 8.2% | 134 162 167 148 147 202 176 190 216 258 | 0.080 | 0.032 |
| MPA | Vc | 1800 | 0.78% | 0.94% | 4.5% | 5.6% | 177 188 200 181 173 175 178 171 169 188 | 0.020 | 0.032 |
| MPA | Q | 1800 | 1.06% | 0.89% | 5.8% | 5.1% | 221 194 180 195 149 178 195 154 170 164 | 0.041 | 0.032 |
| MPA | Vc, only fits with posterior variance > 0.9 ω² | 671 | 0.30% | 0.89% | 4.2% | 4.3% | | | |
| MPA | κ of the sampled occasion (truth: that day's own draw; the other days' κ are in the data but not in the fit) | 1400 | 0.64% | 1.00% | 4.8% | 4.8% | | 0.027 | 0.036 |
| Tacrolimus | KA | 2200 | 1.14% | 0.86% | 5.6% | 4.2% | 245 229 228 219 218 193 220 211 231 206 | 0.023 | 0.029 |
| Tacrolimus | CLINT | 2200 | 1.36% | 0.95% | 4.8% | 3.8% | 200 204 244 240 222 226 223 219 226 196 | 0.017 | 0.029 |
| Tacrolimus | V3 | 2200 | 0.91% | 1.09% | 6.1% | 5.3% | 261 236 202 225 208 208 210 212 226 212 | 0.029 | 0.029 |
| Tacrolimus | V3, only fits with posterior variance > 0.9 ω² | 546 | 0.92% | 0.73% | 7.7% | 4.2% | | | |

- **Volume chains.** Vc (ω² 2.42) and V3 (ω² 0.692) mix well at the shipped budget: the volume eta fails R̂ < 1.01 or ESS ≥ 400 in 2 of 1 800 MPA fits (0.11 %; worst R̂ 1.0115, minimum ESS 610) and in none of 2 200 tacrolimus fits. In the 2 fits the AUC flag was still ok. The AUC chain: worst R̂ 1.0153 (the one non-converged fit, M14, ESS 324) for MPA, 1.0017 for tacrolimus. Median acceptance 0.32 (MPA) and 0.47 (tacrolimus).
- **Tails.** Because the truth etas are drawn from the prior, the rank of the truth among the posterior draws is uniform for an exact posterior. Vc: tails 0.78 % / 0.94 % (1 % expected), decile counts flat, KS 0.020 (critical 0.032); the 671 fits in which the data say nothing about Vc (posterior variance > 0.9 ω²) give 0.30 % / 0.89 % at the 1 % tails and 4.2 % / 4.3 % at the 5 % tails: the heavy prior tail is explored, not truncated. V3: tails 0.91 % / 1.09 %, KS 0.029 (critical 0.029, borderline); 5 % tails 6.1 % / 5.3 %, and 7.7 % / 4.2 % in the 546 uninformed fits (SE about 1 point): a slight excess of truths in the low tail of V3, small and not material to the AUC (which does not depend on V3 for tacrolimus plasma). Occasion effect of the sampled day, MPA: uniform (KS 0.027 against 0.036; tails 0.64 % / 1.00 %).
- **Not uniform:** the MPA CL rank (KS 0.080, 8.2 % above 0.95) and Q (KS 0.041); this is the bias of section 4 (the data are generated with unsampled-day occasion effects the fit sets to zero), absent in the model-consistent diagnostic (mean rank 0.49-0.51). Tacrolimus KA, CLINT: uniform (KS 0.023, 0.017).
- The AUC chain converged in every fit where a volume chain was slow (2 of 2).

## 7. Red-first: the checks can fail

Each criterion was made to fail by a deliberate change in the SIMULATION only (not in `src/`), on the informative baseline cell (M02 and T02, and T01, 100 patients each), same seeds.

| sabotage | drug | cell | n | AUC cov. | trough cov. | bias AUC | bias trough | converged |
|---|---|---|---|---|---|---|---|---|
| sabcl13 | mpaped | M02 | 100 | 86% | 81%† | 16.1% | 27.1% | 100% |
| sabcl13 | tacped | T01 | 100 | 96%† | 96%† | -2.1% | 2.5% | 100% |
| sabcl13 | tacped | T02 | 100 | 87% | 88% | -1.0% | 1.5% | 100% |
| sabcl2 | tacped | T01 | 100 | 95% | 95% | 4.3% | 6.1% | 100% |
| sabcl2 | tacped | T02 | 100 | 87% | 88% | 1.1% | 3.2% | 100% |
| sabiters | mpaped | M02 | 100 | 86% | 85% | 6.2% | 11.0% | 0% |
| sabiters | tacped | T02 | 100 | 84%† | 90% | -2.3% | -0.2% | 0% |
| sabom3 | mpaped | M02 | 100 | 76%* | 69%* | 0.4% | 1.9% | 100% |
| sabom3 | tacped | T02 | 100 | 84%† | 85% | -2.8% | -5.6% | 100% |
| sabsig4 | mpaped | M02 | 100 | 70%* | 62%* | 19.3% | 32.0% | 100% |
| sabsig4 | tacped | T02 | 100 | 69%* | 69%* | 0.0% | 2.3% | 100% |

`sabsig4` = residual variance of the data 4 times the model's; `sabom3` = all prior variances 3 times; `sabcl13` / `sabcl2` = true clearance (MPA CL, tacrolimus CLINT) multiplied by 1.3 / 2 relative to the prior median; `sabiters` = the sampler run with 3 000 iterations instead of the default (`--iters=3000`).
- **Coverage** leaves the band for both drugs under a wrong residual variance (MPA 70 % / 62 %, tacrolimus 69 % / 69 %) and, for MPA, under a wrong prior (76 % / 69 %). Tacrolimus with 3 times the prior variance only drops to 84 % / 85 %: with 3-4 samples the individual estimate is dominated by the data (shrinkage of CLINT about 0.03), so this check is insensitive to the prior there; that is a property of the design, not of the check.
- **Convergence** goes to 0 % with 3 000 iterations (both drugs).
- **Bias** goes to 16 % (AUC) and 27 % (trough) for MPA with clearance 1.3 times the prior median and to 19 % / 32 % under a wrong residual variance. For tacrolimus no sabotage tried moved the bias beyond 4.3 % (clearance doubled, trough only), again because the data dominate the estimate. **The 5 % bias criterion was therefore shown able to fail for MPA but not for tacrolimus.**

## 8. L5: replication of the benchmark of Heida 2026 (G4)

**What this is not.** The paper's tables are not at hand. Weights, albumin and haematocrit are drawn from distributions matched to the ranges in the hand-off (MPA weight N(38, 17) clipped to 13-78 kg and albumin N(34, 4.5) clipped to 24-42 g/L; tacrolimus weight lognormal with median 24.7 kg clipped to 9.1-78 kg, Ht N(0.30, 0.04) clipped to 0.22-0.42, suspension in half of the children under 20 kg). The patients are generated from the model that is then fitted; real patients are not. The paper's NRMSE formula is not at hand either: NRMSE here is RMSE / mean(reference), rRMSE (root mean square of the relative errors) is given beside it. Five independent cohorts of 20 (MPA) and 23 (tacrolimus) children, so 100 and 115 patients per schedule; the spread of the NRMSE between cohorts is shown because one cohort of 20 moves by many points. Every schedule subsets the same noisy full profile (11 points, 0 to 12 h). Reference 1 (primary): the true model AUC0-12 of the sampled day. Reference 2: trapezoid of the noisy 11-point profile.

### MPA pediatric

Cohorts: 5 independent cohorts of 20 simulated children (100 patients pooled per schedule). Definitions used (the paper's formulas are not at hand): MPE = mean of (estimate − reference)/reference; NRMSE = RMSE / mean(reference); rRMSE = root mean square of the relative errors; P10/20/30 = share within ±10/20/30% of the reference.

**app headline (typical-day AUC) vs true sampled-day AUC**

| schedule | n | MPE % (95% CI) | NRMSE % (95% CI) | rRMSE % | P10 | P20 | P30 | NRMSE by cohort (min–max) | converged |
|---|---|---|---|---|---|---|---|---|---|
| C0 | 100 | -0.2 (-6.1 to 4.8) | 30.9 (25.2 to 36.0) | 28.7 | 23% | 54% | 70% | 20.9–40.9 | 100.0% |
| 0,1,2 | 100 | -1.2 (-5.9 to 3.7) | 26.3 (20.9 to 31.8) | 24.2 | 34% | 59% | 76% | 18.7–37.7 | 100.0% |
| 0,0.5,2 | 100 | -1.2 (-5.8 to 3.9) | 26.2 (21.2 to 31.8) | 24.0 | 34% | 57% | 77% | 20.1–36.3 | 100.0% |
| 0,1,3 | 100 | -0.9 (-5.0 to 3.8) | 24.3 (19.0 to 30.4) | 22.1 | 42% | 64% | 81% | 17.4–32.4 | 100.0% |
| 0,0.5,1,2 | 100 | -1.6 (-6.0 to 2.7) | 25.8 (20.4 to 30.9) | 23.2 | 35% | 61% | 77% | 19.5–36.5 | 100.0% |
| 0,1,2,4 | 100 | 0.1 (-3.7 to 4.1) | 19.4 (15.9 to 23.5) | 19.3 | 39% | 71% | 89% | 12.5–24.8 | 100.0% |
| 0,2,4,8 | 100 | -0.5 (-4.2 to 3.4) | 19.7 (16.1 to 24.0) | 19.6 | 35% | 73% | 86% | 14.6–25.3 | 100.0% |
| 0-6 h (8) | 100 | -0.5 (-3.5 to 2.2) | 16.3 (13.1 to 19.0) | 14.2 | 51% | 85% | 97% | 7.8–20.3 | 100.0% |

**sampled-day line (typical AUC × e^κ of that day) vs true sampled-day AUC**

| schedule | n | MPE % (95% CI) | NRMSE % (95% CI) | rRMSE % | P10 | P20 | P30 | NRMSE by cohort (min–max) | converged |
|---|---|---|---|---|---|---|---|---|---|
| C0 | 100 | -0.2 (-5.4 to 5.4) | 30.9 (25.9 to 36.2) | 28.7 | 23% | 54% | 70% | 20.9–40.9 | 100.0% |
| 0,1,2 | 100 | -1.7 (-7.3 to 4.2) | 39.9 (30.1 to 47.6) | 28.2 | 22% | 48% | 70% | 26.8–56.9 | 100.0% |
| 0,0.5,2 | 100 | -1.8 (-7.0 to 3.7) | 35.9 (29.0 to 42.5) | 26.9 | 26% | 48% | 70% | 27.0–46.7 | 100.0% |
| 0,1,3 | 100 | -1.3 (-5.6 to 3.4) | 27.3 (20.8 to 33.8) | 23.3 | 35% | 75% | 85% | 22.2–38.1 | 100.0% |
| 0,0.5,1,2 | 100 | -2.8 (-8.2 to 1.8) | 37.4 (28.7 to 44.8) | 26.4 | 24% | 48% | 74% | 27.6–52.4 | 100.0% |
| 0,1,2,4 | 100 | 0.4 (-4.2 to 5.3) | 33.8 (23.2 to 43.0) | 23.7 | 36% | 64% | 81% | 16.3–52.0 | 100.0% |
| 0,2,4,8 | 100 | 1.2 (-3.7 to 5.7) | 36.4 (22.8 to 46.7) | 24.8 | 43% | 64% | 77% | 17.5–53.6 | 100.0% |
| 0-6 h (8) | 100 | -0.2 (-4.5 to 4.2) | 29.7 (22.5 to 36.2) | 21.2 | 36% | 68% | 86% | 16.2–45.7 | 100.0% |

**app headline vs trapezoid of the noisy 11-point profile**

| schedule | n | MPE % (95% CI) | NRMSE % (95% CI) | rRMSE % | P10 | P20 | P30 | NRMSE by cohort (min–max) | converged |
|---|---|---|---|---|---|---|---|---|---|
| C0 | 100 | 1.3 (-5.4 to 8.3) | 34.4 (29.8 to 38.9) | 34.4 | 24% | 44% | 62% | 26.0–39.5 | 100.0% |
| 0,1,2 | 100 | -0.2 (-5.4 to 5.6) | 28.6 (24.3 to 32.6) | 29.0 | 30% | 52% | 74% | 26.2–34.5 | 100.0% |
| 0,0.5,2 | 100 | -0.3 (-6.0 to 4.9) | 28.5 (24.4 to 32.0) | 28.4 | 31% | 51% | 73% | 26.2–33.0 | 100.0% |
| 0,1,3 | 100 | -0.0 (-4.7 to 5.6) | 25.9 (22.4 to 29.3) | 26.7 | 30% | 59% | 78% | 19.0–29.5 | 100.0% |
| 0,0.5,1,2 | 100 | -0.7 (-5.8 to 4.7) | 28.0 (24.2 to 31.9) | 27.7 | 34% | 55% | 75% | 25.1–33.0 | 100.0% |
| 0,1,2,4 | 100 | 0.9 (-3.8 to 5.7) | 22.7 (20.0 to 25.1) | 23.5 | 33% | 62% | 87% | 19.7–23.7 | 100.0% |
| 0,2,4,8 | 100 | 0.2 (-4.2 to 4.8) | 21.7 (19.1 to 24.7) | 23.1 | 38% | 65% | 84% | 17.4–24.7 | 100.0% |
| 0-6 h (8) | 100 | 0.1 (-3.6 to 3.1) | 19.2 (15.5 to 22.8) | 17.8 | 45% | 78% | 90% | 14.5–23.9 | 100.0% |

Published (Heida 2026, the hand-off section 1.3): 3-point (0,1,2 h) MPE 0.1% (−0.3 to 0.6), NRMSE 21.0% (7.1–34.8); trough only MPE 6.6%, NRMSE 32.5%; threshold 25%.

A second run of the same cohorts with the pre-dose sample entered 1.2 minutes after the dose time (so that the app assigns it to the day of the dose, not to the previous day) changed nothing material (3-point headline NRMSE 26.5 % against 26.3 %; line 40.7 % against 39.9 %; `/tmp/claude-501/calibration_ped/final/tables_L5_mpaped_shift.md`).

### Tacrolimus pediatric (actual whole blood; the corrected value is a monotone transform of the same plasma curve and was not scored separately)

Cohorts: 5 independent cohorts of 23 simulated children (115 patients pooled per schedule). Definitions used (the paper's formulas are not at hand): MPE = mean of (estimate − reference)/reference; NRMSE = RMSE / mean(reference); rRMSE = root mean square of the relative errors; P10/20/30 = share within ±10/20/30% of the reference.

**app (actual, whole blood) vs true sampled-day AUC**

| schedule | n | MPE % (95% CI) | NRMSE % (95% CI) | rRMSE % | P10 | P20 | P30 | NRMSE by cohort (min–max) | converged |
|---|---|---|---|---|---|---|---|---|---|
| C0 | 115 | 1.9 (-1.8 to 5.6) | 25.6 (20.0 to 30.1) | 20.5 | 40% | 70% | 84% | 20.3–29.2 | 100.0% |
| 0,1,2 | 115 | -0.3 (-2.6 to 2.1) | 16.3 (12.3 to 20.2) | 12.8 | 60% | 90% | 97% | 11.5–21.1 | 100.0% |
| 0,0.5,2 | 115 | -0.6 (-3.2 to 1.6) | 18.3 (13.7 to 23.0) | 13.1 | 57% | 89% | 97% | 11.7–23.6 | 100.0% |
| 0,1,3 | 115 | 0.4 (-1.6 to 2.3) | 14.7 (10.5 to 19.2) | 11.1 | 64% | 93% | 99% | 8.2–22.0 | 100.0% |
| 0,0.5,1,2 | 115 | -0.4 (-2.6 to 1.8) | 16.8 (12.7 to 20.6) | 12.6 | 59% | 91% | 97% | 12.1–21.8 | 100.0% |
| 0,1,2,4 | 115 | -1.1 (-2.8 to 0.6) | 12.9 (10.6 to 15.2) | 10.2 | 63% | 96% | 100% | 10.7–15.7 | 100.0% |
| 0,2,4,8 | 115 | -1.2 (-3.2 to 0.9) | 13.9 (10.4 to 17.8) | 11.3 | 63% | 95% | 99% | 10.3–18.6 | 100.0% |
| 0-6 h (8) | 115 | -0.8 (-2.2 to 0.6) | 8.8 (6.6 to 10.7) | 7.2 | 86% | 100% | 100% | 6.5–11.7 | 100.0% |

**app vs trapezoid of the noisy 11-point profile**

| schedule | n | MPE % (95% CI) | NRMSE % (95% CI) | rRMSE % | P10 | P20 | P30 | NRMSE by cohort (min–max) | converged |
|---|---|---|---|---|---|---|---|---|---|
| C0 | 115 | 3.3 (-0.9 to 7.2) | 27.4 (22.1 to 32.5) | 21.8 | 26% | 63% | 82% | 21.2–31.0 | 100.0% |
| 0,1,2 | 115 | 0.8 (-1.5 to 3.1) | 17.1 (12.7 to 20.7) | 13.5 | 58% | 87% | 97% | 10.6–21.2 | 100.0% |
| 0,0.5,2 | 115 | 0.6 (-1.8 to 3.3) | 18.8 (13.5 to 23.1) | 13.5 | 57% | 87% | 99% | 12.2–22.0 | 100.0% |
| 0,1,3 | 115 | 1.5 (-0.8 to 3.5) | 15.0 (11.2 to 18.3) | 11.8 | 61% | 91% | 99% | 8.9–19.6 | 100.0% |
| 0,0.5,1,2 | 115 | 0.7 (-1.9 to 3.1) | 17.4 (13.2 to 21.4) | 13.0 | 61% | 86% | 98% | 11.8–21.0 | 100.0% |
| 0,1,2,4 | 115 | -0.0 (-1.9 to 1.9) | 13.2 (10.5 to 15.3) | 10.0 | 65% | 97% | 100% | 10.6–15.6 | 100.0% |
| 0,2,4,8 | 115 | -0.2 (-2.0 to 1.7) | 12.7 (9.0 to 16.6) | 10.2 | 70% | 95% | 99% | 8.8–17.7 | 100.0% |
| 0-6 h (8) | 115 | 0.2 (-0.8 to 1.2) | 8.3 (6.4 to 10.0) | 5.7 | 93% | 100% | 100% | 6.0–11.6 | 100.0% |

Published (Heida 2026, the hand-off section 1.3): 3-point (0,1,2 h) MPE 0.2% (0.03 to 0.4), NRMSE 7.8% (3.0–12.6); trough only MPE 3.7%, NRMSE 22.0%; threshold 25%.

### Comparison with the published figures

| | published (Heida 2026) | this simulation, reference 1 | reference 2 |
|---|---|---|---|
| MPA 0/1/2 h MPE | 0.1 % | −1.2 % (−5.9 to 3.7) | −0.2 % |
| MPA 0/1/2 h NRMSE | 21.0 % (7.1-34.8) | 26.3 % (20.9-31.8); cohorts 18.7-37.7 | 28.6 % |
| MPA trough only MPE / NRMSE | 6.6 % / 32.5 % | −0.2 % / 30.9 % (25.2-36.0) | 1.3 % / 34.4 % |
| Tacrolimus 0/1/2 h MPE | 0.2 % | −0.3 % (−2.6 to 2.1) | 0.8 % |
| Tacrolimus 0/1/2 h NRMSE | 7.8 % (3.0-12.6) | 16.3 % (12.3-20.2); cohorts 11.5-21.1 | 17.1 % |
| Tacrolimus trough only MPE / NRMSE | 3.7 % / 22.0 % | 1.9 % / 25.6 % (20.0-30.1) | 3.3 % / 27.4 % |

- **Bias** is near 0 for both drugs and all schedules (|MPE| ≤ 3 % apart from the trough-only tacrolimus reference-2 value 3.3 %).
- **Ordering of schedules by NRMSE** follows the paper's logic for both drugs: trough alone is the worst, three-point schedules in between, four and more samples better, the 8-sample profile best (MPA 30.9 → 26.3 → 19.4 → 16.3 %; tacrolimus 25.6 → 16.3 → 12.9 → 8.8 %). The 0/1/3 h schedule is the best of the 3-point ones for both drugs in these data.
- **MPA 3-point NRMSE is not shown to be worse than published** (26.3 %, interval 20.9-31.8, includes 21.0; the point estimate is 5 points higher). The trough-only value is on the published one (30.9 against 32.5).
- **Tacrolimus 3-point NRMSE is clearly worse than the published 7.8 %** (16.3 %, interval 12.3-20.2; every cohort 11.5-21.1). The hand-off asks that this be chased. What the data show: (1) the same app, in L4, gives exactly calibrated posteriors (coverage 88-95 %, uniform ranks), so with model-consistent noise the app cannot do better than its own posterior; (2) with a proportional residual of 19.3 % on three samples an individual AUC error of about 12-16 % is what the model implies (the median 5-95 % interval for this design is ×/÷ 1.5, i.e. about 25 % half-width), whereas a population NRMSE of 7.8 % from three samples would need the noise in the paper's evaluation data to be about half the model's σ (or a reference and estimate that share their errors in a way my simulation does not reproduce). I could not settle this without the paper's definitions and tables; it should be put to the authors (the owner is the last author). I do not regard it as an app defect on this evidence, but I did not prove that it is not one.

## 9. What was and was not covered

Covered: the shipped sampler at default budget; the three-level design of section 1; both drugs; history and steady-state modes; capsule, suspension and a switch in either direction; Ht constant and changing as a step; occasion layer (MPA) with 1 or 2 sampled occasions (up to 4 sampled days). Not covered: nephrotic syndrome, ciclosporin, EC-MPS, weights or albumin outside the development range, Ht ≠ 0.22-0.45 (L4) or gradual Ht change, doses at irregular times, BLQ, assay differences (EMIT vs LC-MS), real patients; the corrected tacrolimus value in L5; the worker-pool path (same draws by construction, not re-run); more than 2 sampled occasions with the 10-occasion cap. The MPA residual draw truncates 1.7 % of the errors at −95 %. Real-world prediction of the next occasion (the paper's MPE 15 % MPA / 64 % tacrolimus, 3 months ahead) is not what coverage here measures: **coverage is a statement about the sampled period, not a forecast of future exposure, and for tacrolimus the intervals contain no day-to-day variability by construction.**

## 10. Defects found

None in the app. Observations for the coder or owner (none reproduced as a failure of the code): (1) the app assigns a pre-dose sample to the day of the previous dose, so a 0/1/2 h profile uses two occasion effects (the shift experiment of section 8 shows no accuracy cost); (2) the typical-day AUC is the median-day AUC and is about 4-5 % below what a patient with an unmodelled history shows on average (sections 4, 5); (3) the MPA trough interval is narrower than it should be in rich designs when occasion effects vary on every day (coverage 77-83 % in M04, M07, M13, M14).
