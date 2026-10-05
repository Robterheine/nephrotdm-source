# Verification record: pediatric MPA and pediatric tacrolimus

Written by the coder as a **record of what was run**, not as a verdict. Gates G1-G6 are signed by the pharmacometrician, the statistician,
the UI designer and the clinical pharmacologist (`HANDOFF_PEDIATRIC.md` §3); their findings go in the verdict table below when they exist.

## Verdict table

| Gate | Seat | Scope | Verdict |
|---|---|---|---|
| G1 | Pharmacometrician | structure, tacrolimus engine vs NONMEM | **pass with comments** (own NONMEM streams: 4.7e-9 over 596 predictions; `REVIEW_PEDIATRIC_PHARMACOMETRICIAN.md`) |
| G1 | Pharmacometrician | structure, MPA engine vs NONMEM | **pass with comments** (own NONMEM streams: 4.7e-9 over 356 predictions) |
| G2 | Pharmacometrician | MAP vs NONMEM POSTHOC | **pass with comments** (tacrolimus 24/24 to 4.5e-7; MPA 21/24 to 1e-7, the other 3 differ through the variance floor at albumin 5) |
| L3 | Pharmacometrician | posterior vs NONMEM BAYES | **pass with comments** (medians within 5 % alone judged insufficient; on quantiles, P(in window) and KS: tacrolimus 24/24, MPA 21/24, the 3 are the variance floor) |
| G3 | Statistician | calibration | pending |
| G4 | Statistician | benchmark replication | pending |
| G5 | UI designer | interface | **pass with comments** (nothing existing changed; two required label/text changes, done; `REVIEW_PEDIATRIC_UI_DESIGNER.md`) |
| G6 | Clinical pharmacologist | texts and scope | **pass with comments, conditional on R1-R8** (done, not re-reviewed; `REVIEW_PEDIATRIC_CLINICAL_PHARMACOLOGIST.md`) |

## Builder's sabotage record, `tests/test_pediatric.js` (README rule 7b)

Each line: the change made to `src/tacped.js` (or the texts), the tests that turned red; the file was restored and the suite re-run green each time.

| Sabotage | Red |
|---|---|
| Erlang exponent 3 to 4 in the closed form | E1 E3 E4 I1 I2 I5 G1 (and G1-NONMEM, X1) |
| Erlang polynomial term dropped in `hconv` | E2 E3 |
| hepatic plasma flow without (1 - Ht) | T1 E1 E2 E3 E4 I2 G1 |
| suspension relative F ignored in histories | E2 |
| suspension relative F ignored at steady state | E1 I1 I2 I5 G1 F3 |
| steady state: polynomial part of earlier doses dropped | E1 E3 E4 I1 I2 I3 I5 G1 F3 |
| steady state: degenerate branch (KA near a pole) disabled | E1 E3 |
| reference haematocrit 0.38 instead of 0.35 | spec I2 I3 G1 F1 |
| liver volume exponent 1 instead of 0.9 | T1 E1 E2 E3 E4 I2 G1 |
| suspension KA 18 set to 2.83 | T1 E1 E2 I2 G1 |
| clearance weight exponent 1 instead of 0.75 | T1 E1 E2 E3 E4 I2 G1 |
| trapezoid on the app grid instead of Simpson | I2 G1 |
| percentage haematocrit accepted | S1 S3 |
| CLINT 987 to 990, QH 90 to 91, F 0.46 to 0.5 | G1-NONMEM (with others) |
| text: em-dash and "start with 2 mg" added; "recommends a dose"; "not validated"; changed worked-example number; changed evaluation number | X3 X3 X3 X1 X2 |
| `verify_model`: wrong residual form, missing hook, reversed trough window, a set with both trough and AUC | `verify_model` red (the reversed-window case exposed a `false !== null` bug in the check itself, fixed) |

## Builder's sabotage record, MPA (`src/mpaped.js`, `src/texts_mpaped.js`)

| Sabotage | Red |
|---|---|
| Erlang exponent 2 to 3; polynomial (1 + x) dropped | ME2 ME3 ME4 MG-NONMEM |
| albumin exponent -2.49 to -2.5; normaliser 34 to 35; albumin factor dropped | M1 ME1 ME2 MI2 MG-NONMEM (and MI3, ME4, MF4) |
| 0.739 MMF-to-MPA factor applied to the dose | M-spec MI3 |
| steady state: transit part of the earlier doses dropped; degenerate branch disabled | ME1 ME3 ME4 MG-NONMEM; ME4 |
| KTR weight exponent sign; clearance weight exponent 0.75 to 1; peripheral volume scaled like clearance | M1 ME1 ME2 ME4 MI2 MG-NONMEM |
| delta dose contributes the whole dose | ME3 |
| occasion cap 10 to 12; occasion variance 0.19 to 0.2 | M-spec MS3; M-spec |
| residues of the two poles swapped | ME1 ME2 ME4 MI1 MI2 MG-NONMEM MF2 |
| AUC not dose/CL | MI1 MI3 |
| EC-MPS accepted; albumin lower limit 5 to 3 | MS2 MF5; MS1 |
| text: em-dash and "start with 500 mg"; "recommends a dose"; "not validated"; changed example number; changed evaluation number; scope sentence changed; unit rule changed; ciclosporin sentence changed | XM3 XM3 XM3 XM1 XM2 XM2 XM2 XM2 |
| `verify_model`: default window 30-70, `bloodCorrection` removed, log-scale residual, covariate id changed | `verify_model` red each time |

## Builder's browser record, step 5 (wiring into the page; 5 October 2026)

Built page `nephrotdm.html` (still version 1.4.0) served locally and driven in the built-in browser; the published 1.4.0 page was served beside it for comparison.

| Check | Result |
|---|---|
| Console errors on load | none |
| Five cards in the owner's order; hidden select has the same five options | yes (`test_refresh.js`, and read in the page) |
| Pediatric tacrolimus: weight 3-200 kg, haematocrit the only generated field, formulation column and per-dose select, formulation select on the steady-state regimen, no window preselected, "Use this window" for all six sets | yes; a dose without formulation is refused with a message; a run with a dose or regimen without formulation is blocked and names it |
| Pediatric MPA: weight and albumin fields, no haematocrit, no trough window, no formulation row, window 30-60 default, dose labelled "mg MMF" | yes; albumin 3.4 refused with the g/dL hint; weight 10 kg and albumin 20 g/L give the visible warning, not a refusal |
| Forecast, explorer, chart, diagnostics for both new drugs | run; workers used (8); explorer 750 mg MMF gives AUC 73.3 (hand table 73.40) |
| Window judged on the corrected value for pediatric tacrolimus (tile, report, summary hint) | yes after a fix found in this pass (the first build judged the measured value; `U1` pins it, adult tacrolimus unchanged) |
| Session export and re-import, tacrolimus pediatric (per-dose forms, regimen form, haematocrit) | identical round trip; an old-format session for an existing drug still loads; doses without formulations block the run |
| **Existing drugs against the published 1.4.0 page** (MPA MMF steady state, MPA EC-MPS full history, tacrolimus, everolimus; seeded fits) | **identical** tile text, advisory notes, report text, chart size and diagnostics (hashes equal) |
| One-page report, 16 configurations (both new drugs, both modes, with and without samples, with and without window) | content 1025-1097 px of the 1103 limit |
| `audit_fields` at 320, 375, 768, 1100, 1280, 1920 px, five drugs, both modes, page and report dialog (120 audits) | **zero offenders** after the fix below |
| Dialogs (Getting started, Background, About) for all five drugs | no `undefined`, `NaN` or broken markup; the About list shows all five models |

**Findings from the browser pass**

1. **Pre-existing, fixed:** the report dialog's two placeholders (`rp-prepared`, `rp-advice`) clipped at 320 px in the published 1.4.0 page too (so 1.4.0 did not meet the hand-off's "report dialog" audit). Shortened to "e.g. J. Researcher, pharmacologist" and "e.g. Repeat the AUC after a change."
2. **Card names at 320 px:** the hand-off's guard "card names at most one line at 320 px" cannot hold with the owner's names. "Mycophenolic acid (adult kidney)" already wraps to two lines in 1.4.0; "Mycophenolic acid (pediatric kidney)" does the same. At 375 px every name is one line. The tacrolimus sub-line was shortened ("AUC and trough · Schijvens 2020"; the refit is named in About, the Background and the model card) so every sub-line is one line at 320 px. **Owner or designer decision:** accept two-line MPA names, or shorten them.
3. **Fold position, 1280 x 800:** five cards (381 px against 224 px) move the first weight input of a drug that takes weight from y = 603 (adult tacrolimus, 1.4.0) to y = 760 (pediatric tacrolimus), i.e. to the edge of the fold; on a 375 x 812 phone the weight field was already at the fold in 1.4.0 (803) and is now at 960. Nothing is clipped or unreachable. The hand-off allows a two-column card grid if the designer finds it necessary; in the 398 px left column that makes three-line names, so it was not done. **Designer decision.**
4. **Page size:** 520 KB (published 1.4.0) to 601 KB, +81 KB against the hand-off's estimate of 25-30 KB: the four new source files are about 77 KB, comment-heavy by the project's habit. Not minified (the project ships readable source). **Owner decision** whether that matters.

## Independence note

The first and last author of all four source papers is also the owner of this app; independence of the review rests on the separate seats of
§3, not on authorship. The NONMEM streams are the authors' own (verbatim, see `tools/nonmem_verify/ped/`); the oracle is not.


## Statistician's findings (independent seat)

Seat: statistician (hand-off section 3; gates G3 calibration and G4 benchmark). The seat did not build the code and produced its numbers before reading the other sections of this file. Full tables, design, seeds, run times and the list of what was not covered: `docs/CALIBRATION_RESULTS_PEDIATRIC.md`. Scripts: `tools/calibrate_ped*.mjs` (the simulator is independent of `src/`: matrix-exponential state-space systems from the NONMEM streams, agreeing with the app engines to 3e-12). Acceptance numbers are those of hand-off section 7, unchanged.

| Gate | Drug | Verdict | Numbers behind it |
|---|---|---|---|
| G3 calibration, coverage | MPA pediatric | pass with comments | 18 cells × 100 patients, shipped sampler. All 36 figures inside 85-95 % or with an interval that reaches it; AUC 82-91 % (mean 88 %), trough 77-92 %, lowest in rich designs (M07 77 %, M14 78 %, M04 and M13 83 %). |
| G3 calibration, convergence | MPA pediatric | pass | 99.94 % (1 of 1 800 fits, R̂ 1.015, ESS 324). Vc chain slow in 2 fits, AUC chain fine in both. |
| G3 calibration, bias | MPA pediatric | **criterion not met** under the pre-registered data-generating process; explained | Median AUC bias 0 to +7 % (4 cells above 5 %), trough 3-12 % (13 cells above 5 %). With data generated exactly as the model assumes (occasion effect only on sampled days, 200 patients per cell) bias −0.6 / −0.3 % AUC, coverage 90 %, mean rank 0.49-0.51: sampler and likelihood are calibrated. The bias comes from the unsampled days (taken at κ = 0, while the mean of e^κ is 1.10) and is a property of the model's "typical day". Not tuned away. |
| G3 calibration, coverage | Tacrolimus pediatric | pass | 22 cells × 100, 88 figures, none clearly outside; point estimates 84-97 % (trough-only capsule T01 97 %). Actual and corrected identical. |
| G3 calibration, convergence | Tacrolimus pediatric | pass | 100 % of 2 200 fits; V3 and AUC chains fine (worst R̂ 1.005 / 1.002, min ESS 1 384 / 4 177). |
| G3 calibration, bias | Tacrolimus pediatric | pass | One cell above 5 % (T01 AUC −5.3 %, interval reaches 0); others within ±4.7 %. |
| G3, haematocrit change between samples | Tacrolimus pediatric | pass; the one-Ht approximation is not material here | H01 (0.42 → 0.26), H02 (0.24 → 0.40) step changes against constant-Ht control H00: AUC coverage 92 % / 93 % vs 94 %, trough 88 % / 91 % vs 93 %, bias ≤ 3.3 % in magnitude, paired per-patient difference in AUC estimate median about 1 %. Only step changes of up to 0.16 L/L were tried. |
| G3, sampler tails | Both | pass with a comment | Rank test with truth drawn from the prior: Vc tails 0.78 / 0.94 % (1 % expected), V3 0.91 / 1.09 %; Vc and V3 explored in the 671 / 546 patients for which the data are uninformative; V3 KS exactly at its 5 % critical value (low 5 % tail 6.1 %, 7.7 % in uninformative fits; not material to the AUC). MPA CL and Q ranks are skewed only under the harsher data-generating process (see bias row). |
| G3, red-first | Both | shown for coverage and convergence (both drugs) and bias (MPA); not for bias in tacrolimus | Wrong residual variance: coverage 70 % / 62 % (MPA), 69 % / 69 % (tacrolimus). Wrong prior (3 × variance): MPA 76 % / 69 %, tacrolimus only 84 % / 85 % (data-dominated). 3 000 iterations: convergence 0 % (both). MPA clearance 1.3 × prior: bias 16 % / 27 %. No sabotage moved the tacrolimus bias beyond 4.3 %. |
| L4b (decision D3, not a gate) | MPA | numbers only | True sampled-day AUC is 0-7 % above the typical-day AUC with SD of log 0.16-0.27. The existing typical-day interval covers the sampled-day AUC in 87.8 % of 1 800 patients (cells 79-98 %), 1.5-2.3 × narrower than the hypothetical sampled-day line, which covers 97.1 % and is not a better point estimate (L5 NRMSE 40 % vs 26 % for 0/1/2 h). Tacrolimus: no occasion layer, sampled day = typical day. |
| G4 benchmark | MPA pediatric | pass with comments | 5 cohorts × 20 simulated children, reference = true same-day AUC. 0/1/2 h: MPE −1.2 %, NRMSE 26.3 % (20.9-31.8) vs published 0.1 % / 21.0 %; trough only 30.9 % vs 32.5 %. Bias near 0, ordering of schedules as in the paper (30.9 → 26.3 → 19.4 → 16.3 %). Not shown worse than published (interval contains it), but the point estimate is 5 points higher. Paper tables not at hand; simulated patients are model-consistent. |
| G4 benchmark | Tacrolimus pediatric | **fail as pre-registered (NRMSE), not attributed to an app defect** | 5 cohorts × 23. 0/1/2 h: MPE −0.3 %, NRMSE 16.3 % (12.3-20.2; cohorts 11.5-21.1) vs published 0.2 % / 7.8 %: clearly worse. Trough only 25.6 % vs 22.0 % (within). Bias near 0, ordering as in the paper (25.6 → 16.3 → 12.9 → 8.8 %). With the model's own σ of 19.3 % and three samples, an error near 12-16 % is what the (calibrated) posterior implies; 7.8 % would need about half that noise in the evaluation data or error structure my simulation does not reproduce. To put to the authors; unresolved. |

Honest-reading items (hand-off section 7, last paragraph): coverage above is a statement about the sampled period under model-consistent simulation. It is not a forecast: the paper's prediction of the next occasion had MPE 15 % (MPA) and 64 % (tacrolimus), and the tacrolimus intervals contain no day-to-day variability by construction. Not covered: nephrotic syndrome, ciclosporin, EC-MPS, values outside the development ranges, gradual Ht changes, BLQ, assay differences, real patients, and the worker-pool path (same draws by construction). Defects found in the code: none reproduced; three observations are listed in section 10 of the calibration document.

## Owner decisions after the statistician's report (5 October 2026)

- **G4 for tacrolimus** (3-point NRMSE 16.3 % in the simulation against 7.8 % published): the owner accepts it as an **open, documented point**, not as a defect of
  the app. Open action: put the NRMSE definition and the evaluation data of Heida 2026 (Tables 4-6) to the authors; until then the result stands as "not
  attributed, unresolved". The model, the engine and the pre-registered criterion are not changed.

## Review round: the three seats and what was done (5 October 2026)

Verdicts above. Each seat worked from the artefacts and its own questions and wrote its own document in `docs/`. Findings and the response, in short (details in `RELEASE_NOTES_V150.md`, "Review round"):

| Seat | Finding | Response |
|---|---|---|
| Clinical pharmacologist | R1 MPA typical-day wording; R2 "defined at 0.35" unsupported; R3 accuracy qualifiers; R4 ciclosporin and unit in the dose note; R5 window set shown on tile, printout and saved state; R6 research use on the main screen; R7 ages, timing, warnings that say what they mean; R8 unsupported "6 h" claim | **done**; guard tests R1-R4 and U5-U8 added |
| Clinical pharmacologist | Ht warning (W15), mg/kg check (W16), own simulation figures (W4d), rename "Run forecast" (W28), shared label (W19c), "Radboudumc" | owner: warn outside 0.15-0.60 (done); no mg/kg check; no own figures in the app text; no rename; label unchanged; "Radboudumc" removed (done) |
| UI designer | D-1 the headline is the measured value while the window is judged on the corrected one; D-2 amber warning beyond the refusal limits | **done** (subtitle, "compared with the window", chips and printout; warnings suppressed beyond the limits) |
| UI designer | placeholders, weight step, warning placement, report title, picker/fold/page size | placeholders, step 0.1, warning in the covariate row and "pediatric" in the title done; the picker is left as is (the designer's recommendation); page size 601-609 KB accepted as noted |
| Pharmacometrician | D1 variance floor; D2 single-start MAP; D3 latest sample by input order; D4 no Ht warning; hand-off numbers; conventions to state | D1: **owner: no action**; D2: not changed (shared MAP path, 1.5.1 candidate); D3 and D4 **done**; hand-off numbers corrected below; conventions stated in the release notes |

New checks after the changes: 64 tests in `tests/test_pediatric.js` (each new assertion sabotaged and shown red, one structural guard added after a sabotage went unnoticed); existing drugs identical to the
published 1.4.0 page in the browser including the printed report; `audit_fields` zero offenders at 320, 375, 768, 1100, 1280 and 1920 px for five drugs, both modes, page and report dialog, with the warning line visible;
16 report configurations measured again: 1049-1119 px, one configuration (pediatric tacrolimus, no samples, AUC and trough windows both set) 16 px over the 1103 px safety margin and inside the 1123 px page.
**Not re-reviewed by the seats.**
