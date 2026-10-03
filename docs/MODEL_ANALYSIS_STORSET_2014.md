# Model analysis — Størset et al. 2014 (tacrolimus, adult kidney transplantation)

**Source:** Størset E, Holford N, Hennig S, Bergmann TK, Bergan S, Bremer S, Åsberg A, Midtvedt K, Staatz CE.
*Improved prediction of tacrolimus concentrations early after kidney transplantation using theory-based
pharmacokinetic modelling.* Br J Clin Pharmacol 2014;78(3):509–523. doi:10.1111/bcp.12361. Read in full,
including Table 2, Equations 1–9, Figures S1–S2 and Appendix S1.
**Companion papers read:** Størset 2014 Eur J Clin Pharmacol 70:65–77 (doi:10.1007/s00228-013-1584-7, full text —
assay regression, occasion definition, haematocrit time course). **Not read:** Brunet 2019 (paywalled) and the
Staatz 2015 letter (no abstract available).
Plan: `IMPLEMENTATION_PLAN_STORSET_2014.md`. Code: `src/tacrolimus.js`. This document is the transcription record
(the tacrolimus counterpart of `MODEL_ANALYSIS_DEWINTER_2008.md`).

## A. Transcription (Table 2 + Equation 3) → code

| Quantity | Paper | Code (`src/tacrolimus.js`) | Checked by |
|---|---|---|---|
| CL<sub>p</sub>/F (FFM 60 kg, HCT 45 %, non-expresser) | 811 L/h (Table 2 footnote) | `C.CL` | V1, V2 |
| V1/V2 | 6290·FFM/60 · 32100·FFM/60 L | `C.V1`, `C.V2` | V1 |
| Q | 1200·(FFM/60)^0.75 L/h | `C.Q` | V1 |
| ka, tlag | 1.01 /h, 0.41 h (no variability) | `C.KA`, `C.TLAG` | V1, V9 |
| F | [1 − 0.67·Pred/(35 + Pred)] · 0.82 (expresser) · 2.68 (day 2: **not modelled**) | `predEffect`, `fBase` | V5 |
| CYP3A5 expresser on CL | ×1.30 | `C.CYP_CL` | V5 |
| Red-cell binding | C<sub>wb</sub> = C<sub>p</sub>(1 + Hct·418/(C<sub>p</sub> + 3.8)) | `toObs` | V3 |
| BSV CV % | CL 40, V1 54, Q 63 (F<sub>day2</sub> 57: not used); corr CL–V1 0.43, CL–Q 0.62 | `omega()` | V10 |
| BOV CV % | F 23, ka 120 | `C.CV_KF`, `C.CV_KKA` | V10 |
| Residual | proportional 14.9 % | `SIGMA.PROP = 0.149²` | engine tests |
| FFM | Janmahasatian 2005 (weight, height, sex) | `ffmOf` | V4 |
| Assay | LC = 0.80·CMIA + 0.19 µg/L (Eq. 1) | `ASSAY.cmia` | V20 |

The whole-blood values printed in the paper follow from the plasma ones: ÷ (1 + 0.45·418/3.8 = 50.5) gives
CL 16.06 (paper 16.1), V1 124.6 (125), Q 23.8 (23.8), V2 636 (636); CL at haematocrit 0.33 = 21.7 (21.7). Figure S1
(plasma 0.30 µg/L → 14.06 / 10.39 / 6.42 µg/L at 0.45 / 0.33 / 0.20) is reproduced to 0.01. Appendix S1 Equation S1
(CL<sub>wb,HCT45</sub>/F) equals the app's apparent clearance to 0.5 % (rounding of 16.1). **Equation S2 (a dose from a
target) is deliberately not implemented** (golden rule 6).

## B. Scrutiny findings (what the implementation had to decide)

**S1 — ω² convention.** CVs are read as ω = CV (the √ω² convention of the MPA model). Only BOV-ka differs
materially (1.44 vs 0.89 exact log-normal); measured in the calibration arm A.
**S2 — V1–Q correlation is not published** (Table 2 gives CL–V1 and CL–Q only). Taken as 0.43·0.62 = 0.27; arm B
fits a truth with 0. Author query.
**S3 — the first-day effect is ignored (owner decision).** It is defined three ways in the paper ("first day",
"F<sub>day2</sub>", "day 0 and day 1" in Figure 4). Measured on the typical patient (3 mg q12h from transplantation,
prednisolone 20 mg, haematocrit 0.33), the trough a model *without* the effect under-reads by +34 / +21 / +14 / +6 / +2 / +0.5 %
on days 3 / 4 / 5 / 7 / 10 / 14 (window = day 0), and by +80 / +50 / +33 / +15 / +5 / +1.3 % (window = days 0–1). The scope text states
"some days after transplantation… biased upward in the first week or two"; the cut-off the owner wants (3 days or 14)
is **still open**.
**S4 — whole blood is not proportional to dose.** The binding term saturates: at haematocrit 0.33, a whole-blood
concentration of 10 µg/L is 7 % below the linear prediction, 20 µg/L 14 %, 30 µg/L 20 %. At 3 mg q12h the steady-state
AUC is 6.5 % lower than a linearised model gives; doubling the dose gives less than double the whole-blood AUC.
**S5 — plasma AUC is exact, whole-blood AUC is numerical.** Plasma AUC = F·D/CL (the invariant tested in V6); the
whole-blood AUC is integrated on a 4-points-per-hour grid (error 0.03 %, V8).
**S6 — what one sampling day can and cannot fix.** With ω²(CL) = 0.16 and ω²(κF) = 0.053 the steady-state AUC after one
perfectly measured day has a posterior SD of 0.20 on the log scale (×/÷ 1.39, 5–95 %); two days 0.15 (×/÷ 1.28), three
0.13, five 0.10. This is a property of the model and the reason the app shows wide intervals from a single day.
**S7 — haematocrit-corrected value.** Model-based (same plasma curve, haematocrit set to 0.35). The paper's bedside
formula (value × reference/haematocrit) differs from it by +2.0 % at 0.20 and −0.8 % at 0.50 for a reference of 0.35.
No target exists for a corrected value.
**S8 — assay scale.** One laboratory, 43 pairs, 3.6–14.4 µg/L CMIA; the line is extrapolated for peak samples and the
AUC. The ratio is not constant (0.86 at 3 µg/L, 0.82 at 10, 0.81 at 20).
**S9 — occasion definition.** The earlier Oslo model defined an occasion as one visit (profiles) or the period between
dose changes (routine troughs); the 2014 paper does not restate it. The app uses a calendar day. Author query.
**S10 — occasion effects need a layout rule.** One κF per sampled day is cheap; one κka per sampled day is not, and a
12-hour trough barely senses ka. κka is therefore given only to days with a sample within 4 h after a dose
(calibration, first run: with κka on every sampled day 16 % of five-day-trough fits narrowly missed R̂ < 1.01).
**S11 — scope of validity.** Adult kidney recipients, 23–71 years, FFM 35–80 kg, haematocrit about 0.25–0.43,
prednisolone 5–36 mg/day, Prograf twice daily, LC-MS/MS-equivalent concentrations. **The AUC was never evaluated
externally** in the source study (its external evaluation: troughs, first three weeks, median prediction error −1.2 %,
90 % interval −38 to +47 %). Age (F +1.4 %/year above 45) was found and deliberately left out by the authors.

## C. Not in the model — stated in the model card
Renal and liver function, age, CYP3A inhibitors and inducers, food, adherence, prolonged-release products, children,
other organs, the first-day effect, a genotype mixture (unknown = non-expresser; owner decision D4).
