# Release notes: NephroTDM 1.5.0 (5 October 2026)

**1.5.0 adds pediatric mycophenolic acid and pediatric tacrolimus** for children with a kidney transplant: the MPA model of Heida et al. (Eur J Clin Pharmacol
2024;80:1761-1771) and the tacrolimus model of Schijvens et al. (Clin Pharmacokinet 2020;59:1483-1491) as refitted with weight and haematocrit only in Heida
et al. (Clin Pharmacokinet 2026, doi:10.1007/s40262-026-01708-3). The three existing drugs are unchanged: in the browser their results, report text, chart and
diagnostics are identical to the published 1.4.0 page, and the bit-identity records V16, V16b and the everolimus record are green. **Not published**: the
repository and the live page still carry 1.4.0. Research use only, as before. Plan and decisions: `HANDOFF_PEDIATRIC.md`; evidence: see the table below.

## What changes for the person using it

**Five cards, in this order:** mycophenolic acid (adult kidney), **mycophenolic acid (pediatric kidney)**, tacrolimus (adult kidney), **tacrolimus (pediatric
kidney)**, everolimus (adult kidney).

**Pediatric MPA.**
- Fields: weight (kg) and albumin (g/L), both required. No haematocrit, no formulation row, no age field. Doses are entered as **mg of MMF** (no conversion is
  applied; the model contains it). EC-MPS is refused with the reason.
- Reports the steady-state **AUC0-12h** with a 5-95 % interval and, for information, the trough. The window starts at 30-60 mg·h/L (IATDMCT consensus). For
  nephrotic syndrome the Background says how to enter "above 50".
- Each sampled calendar day gets its own bioavailability effect (up to 10 days), as in the model.
- Refused: weight outside 3-200 kg, albumin outside 5-50 g/L (a value like 3.4 gets the g/dL hint). **Warned, not refused**: weight outside 12.9-79.9 kg and
  albumin outside 24-42 g/L (the range the model was built on).

**Pediatric tacrolimus.**
- Fields: weight (kg) and haematocrit (L/L; a percentage is refused with the L/L message; 0.10-0.70). **The formulation (capsule or suspension) is chosen on
  every dose row** and for the steady-state regimen; a switch is entered on the dose where it happened. A dose or regimen without a formulation blocks the run and
  names it.
- Reports steady-state **AUC0-12h and trough, as measured and corrected to haematocrit 0.35** (the relationship in the model's own control stream). **No window is
  preselected** (time since transplantation is not an input): the Background offers the four AUC sets (0-6 weeks 180-270, 6 weeks-6 months 100-250, 6-12 months 100-190,
  more than 12 months 80-150 µg·h/L) and two trough sets (10-20 first 2 months, 5-10 later), each with a "Use this window" button. **The window is judged on the
  corrected value**, because the targets are taken to refer to haematocrit 0.35 (Heida 2026 normalised AUCs to 0.35 before comparing, following Schijvens 2019); the measured value is shown beside it, and the tile, the chips and the printout say which value the window is compared with and which window set was used.
- Refused: weight outside 3-200 kg, haematocrit outside 0.10-0.70. Warned (not refused): weight outside 9.1-78 kg and **haematocrit outside 0.15-0.60** (owner's range).

**Both:** the estimate describes the patient **on the day of the samples** (said on screen, in the explorer note, in the report and in About; the 2026 evaluation
could not predict the AUC about three months later). The dose explorer shows a candidate dose at steady state, assuming the sampled day continues, and never
recommends one. The report, session export/import and the diagnostics dialog work for both drugs. No starting-dose scheme and no mg/m2 helper (owner decisions).

**Also changed:** two placeholders in the report dialog that clipped at 320 px (a problem already present in 1.4.0) are shorter. The UI-text snapshot of MPA and
tacrolimus was re-recorded for the version number only (two one-character changes, diff read).

## The models, in short

- **MPA:** two equal absorption stages (transit rate 1.48 /h at 70 kg), a two-compartment disposition, all scaled to weight (clearance and Q by ^0.75, volumes by
  weight/70, transit rate by ^-0.25), clearance by (albumin/34)^-2.49. Variability on clearance, central volume and Q, and between occasions on bioavailability
  (variance 0.19). Proportional residual, variance 0.223. The values are the article's (Table 2); the structure is that of the authors' run 57 (the ESM text was a
  partial rename of it).
- **Tacrolimus:** three equal absorption stages, a liver compartment with flow-limited extraction (plasma flow 90 (1 - Ht) per hour at 70 kg), a two-compartment
  plasma disposition, red-cell binding (Bmax 418, Kd 3.8 µg/L). Capsule KA 2.83 /h, suspension 18 /h with 0.46 times the bioavailability. Variability on KA, intrinsic
  clearance and V3; proportional residual, variance 0.0374; no occasion layer.
- **Closed form** for both (no ODE solver); the steady-state sum over earlier doses is exact, including the Erlang tail of slow absorbers and a fallback near a
  pole. Tacrolimus integrates the AUC with a Simpson rule on a graded grid (the app's 0.25 h trapezoid read the suspension AUC up to 1 % low).

## Evidence

| Check | Result |
|---|---|
| Closed forms vs an independent matrix exponential (`tests/test_pediatric.js`) | 1e-9 relative, typical and +-1.5 SD etas; also with KA within 1e-6 (relative) of a disposition pole |
| NONMEM 7.6 structure (MPA 516 and tacrolimus 754 stored predictions) | 1e-6 or better (NONMEM vs oracle 4-5e-9) |
| NONMEM POSTHOC vs the app's MAP (30 + 30 patients, proportional noise, 1-4 sampled days) | median max abs d eta 4e-8, worst 1e-6; reported AUC within 3e-5 % |
| NONMEM BAYES vs the app's posterior (30 + 30 patients, 6 000 samples each) | 100 % within 5 % (median 0.3 %, worst 3.1 %), sampler converged 60/60 |
| Calibration by simulation-recovery, independent seat (18 MPA and 22 tacrolimus cells of 100 patients) | tacrolimus: no coverage figure clearly outside 85-95 %, convergence 100 %; MPA: 82-91 % AUC, 77-92 % trough, convergence 99.94 %; MPA bias above 5 % under a harsher data process, explained (below) |
| Benchmark replication of the 2026 paper (simulated, 20 MPA and 23 tacrolimus children) | MPA 3-point NRMSE 26.3 % (paper 21.0 %, interval contains it); **tacrolimus 3-point 16.3 % against 7.8 %: open, not attributed to a defect** |
| Regression records | `tests/mpaped_regression.json`, `tests/tacped_regression.json` (fixed-seed fits and dose scans, bit-identical), plus V16, V16b and everolimus unchanged |
| Browser | existing drugs identical to 1.4.0; 120 field audits at 320-1920 px with zero offenders; 16 report configurations on one A4 page (<= 1097 of 1103 px) |
| Sabotage | every new assertion shown to turn red (lists in `VERIFICATION_PEDIATRIC.md`) |

Tests at release: 111 + 60 + 39 + 64 + 9 + 16 (`npm test`), `node tools/verify_model.mjs` OK.

## Review round (5 October 2026)

Three independent seats reviewed the build, each given the artefacts and the questions of its own gate and not the builder's conclusions (`REVIEW_PEDIATRIC_PHARMACOMETRICIAN.md`,
`REVIEW_PEDIATRIC_UI_DESIGNER.md`, `REVIEW_PEDIATRIC_CLINICAL_PHARMACOLOGIST.md`). Verdicts: **G1, G2, L3 pass with comments; G5 pass with comments; G6 pass with comments (conditional)**; no blocker.
Changed in response (wording, labels and warnings; no model result moved, the regression records and the UI snapshot are unchanged):

- Tacrolimus window sources no longer say the targets are "defined" at haematocrit 0.35 (the sources do not say so); they are taken to refer to it, following Heida 2026 and Schijvens 2019. The
  window is judged on the corrected value as before, and the tile (subtitle "as measured (haematocrit x)", "compared with the window"), the chips, the printout and the saved session now say which value
  and **which window set** (each set's label carries "after transplant"; typed bounds read "your own bounds").
- Accuracy sentences carry their qualifiers (the authors' 25 % limit; the reference is the full-profile AUC from the same model in the development children; MPA P30). The MPA texts say
  the reported AUC is the **typical day** (scatter of a single day about x/÷ 1.2-1.3 as one SD, 1.3-1.6 for the middle 90 %); the printout no longer calls it the sampled day. The unsupported "6 h" claim and the
  institution name are gone; ciclosporin and "mg MMF, not mg MPA" are in the dose note; "research use only" is under the drug cards; ages and early post-transplant timing are in the scope sentences;
  CYP3A5 is in the not-in-model list; the nephrotic-syndrome paragraph cites the source wording and the model's limit.
- Weight, albumin and haematocrit warnings say what they mean (the typical MPA AUC is about eight times lower at albumin 15 than at 34 g/L); beyond the refusal limits only the refusal speaks.
- Small: placeholders for albumin and haematocrit, weight step 0.1, the warning line next to the fields, "pediatric" in the report title, the latest sample is the latest by time, the toast says when an AUC
  set cleared the trough window (and the reverse), shorter report citations.
- Hand-off corrections the pharmacometrician found: the Vc interval of Table 2 is 109.65-18 819.64 % (not 15-18 820 %); the Table 2 CVs of Q, the occasion effect and the residual follow the listing's variances
  (0.339, 0.193, 0.224), not the ESM values the code uses (effect at most 1.6 %); Heida 2026 gives n = 29, the 2024 paper 30. The "article values" are used consistently everywhere.
- Conventions stated, not changed: unsampled dosing days carry an occasion effect of zero (a NONMEM stream with a free effect on every dosing day changes the individual AUC by a median of 1.2 %, 90th
  percentile 3.8 %, max 15 %; an author query on the occasion coding); the one-haematocrit approximation costs a mean of 3.5 % (95th percentile 20 %, max 31 %) in earlier samples when the haematocrit
  differs by more than about 0.05 between samples (said in the assumptions).
- Not re-reviewed: the seats have not seen the changed strings.

## Reading the evidence honestly

- **MPA typical day.** The reported AUC is the model's typical (median) day. In simulations with the model itself, the true AUC of a single day scattered around it by
  a factor of about 1.2-1.3 and lay on average 0 to 7 % above it; when the simulated children had an occasion effect on every day (more than the model gives the
  fit), the AUC read 4-5 % high and the trough intervals under-covered in rich designs (77-83 %). With data generated as the model assumes, bias is -0.6 / -0.3 % and
  coverage 90 %. The text states the scatter; the decision not to add a "sampled-day" line (D3) stands on these numbers (such a line covers 97 % but is 1.5-2.3 times as
  wide and a worse point estimate).
- **Tacrolimus 3-point NRMSE.** 16.3 % simulated against 7.8 % published. The posterior is calibrated, and with a 19.3 % residual and three samples, 12-16 % is what the
  model implies; 7.8 % would need about half that noise in the paper's evaluation data. The paper's tables and its NRMSE definition were not at hand. Action: ask the
  authors.
- **Haematocrit that changes between samples.** The PK path holds the latest sample's Ht. Against NONMEM this costs a mean of 2.2 % (max 12.5 %) in earlier whole-blood
  predictions; in the calibration cells with Ht changes (step changes up to 0.16 L/L) the estimates differ from the constant-Ht control by a median of about 1 % and
  coverage stays 88-94 %. Not material in these tests; gradual changes were not tried.

## Not covered, on purpose

Nephrotic syndrome, ciclosporin co-medication, EC-MPS, enterohepatic recirculation (MPA); height and age (tacrolimus refit without height); values outside the
development data (warned), assay differences (MPA built on EMIT, tacrolimus on LC-MS/MS), below-quantification results (omitted, never entered as 0), and real
patients: every check above uses simulated, model-consistent patients or the authors' own NONMEM code.

## Open items

- Verdicts of the pharmacometrician (G1, G2, L3), the UI designer (G5) and the clinical pharmacologist (G6) are pending; the builder's evidence is in
  `VERIFICATION_PEDIATRIC.md`, `NONMEM_CROSSCHECK_PEDIATRIC.md` and `CALIBRATION_RESULTS_PEDIATRIC.md`. The texts are a first draft after one humanizer-style pass.
- The Brunet 2019 trough ranges (10-20 and 5-10 µg/L) are quoted "as cited in Heida 2026" and still to be checked against the paper by the owner; Schijvens 2020 (the
  tacrolimus model's origin) was not in the source folder, so its data ranges are not shown.
- A real print/PDF check of the A4 report with the owner (open since 1.4.0). Content height of the pediatric reports: 1049-1119 px; one configuration (pediatric tacrolimus, no samples, an AUC window and a trough window both set) is 16 px over the 1103 px safety margin and still inside the 1123 px page.
- **Multi-start MAP** (pharmacometrician, defect D2): the MAP search starts from eta = 0 and can end in a worse mode (tacrolimus with haematocrit-inconsistent data; MPA in 5 of 200 model-consistent fits, the AUC mostly unaffected). Not changed: it touches the shared MAP path and needs its own bit-identity check on the existing drugs; a candidate for 1.5.1.
- **Variance floor** (`max(variance, 1e-6)` in `bayes.js`, shared with every drug; not in NONMEM's FOCE-I): matters only for predictions below 2.1 mg/L (MPA) or 5 ng/L (tacrolimus), in practice albumin near the 5 g/L refusal limit. **Owner decision: no action.**
- Owner decisions of the review round: haematocrit warning outside 0.15-0.60; no mg/kg check (text only); the app's own simulation figures stay out of the app text; the button stays "Run forecast" and the shared label "Candidate maintenance dose" is unchanged; "Radboudumc" removed from the local-guideline source line.
- Card names "Mycophenolic acid (adult kidney)" and "(pediatric kidney)" wrap to two lines at 320 px (adult already did in 1.4.0); five cards move the first weight input
  from y = 603 to 760 at 1280 x 800; the built page grew from 520 KB to 601 KB (the hand-off estimated 25-30 KB). Owner and designer decisions.
- The human review of the whole app (`VERIFICATION_TEAM.md`) is still open.
