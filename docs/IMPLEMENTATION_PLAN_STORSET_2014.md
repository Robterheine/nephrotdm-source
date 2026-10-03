# Plan — adding tacrolimus (adults) to the app: Størset 2014

**Status:** EXECUTED on 2 Oct 2026 as NephroTDM 1.2.0/1.2.1 — see §11 (execution log). Two points stay open:
the day cut-off in D2 and the consensus PDF for D6 (no window ships by default).
**Team session:** pharmacometrician × clinical pharmacologist × nephrologist × senior UX designer ×
senior HTML programmer. As with `IMPLEMENTATION_PLAN_DEWINTER_2008.md`, these are roles played in
one AI-assisted session, **not independent human review** (see `VERIFICATION_TEAM.md`, F14).
**Goal (owner's request):** predict tacrolimus **AUC and C<sub>trough</sub>** for adults, same
methodology as MPA: published population model → MAP + MCMC posterior → exposure with uncertainty
→ window probabilities → dose explorer that shows consequences and never advises.
**Inputs read:** the article (Br J Clin Pharmacol 2014;78:509–523), Figure S1, Figure S2,
Appendix S1 (Equations S1–S2 extracted from the Word file), `src/model.js`, `src/bayes.js`,
`src/ui.js`, `index.html`, the de Winter analysis/plan/verification documents.

---

## 0. Summary and decisions

**Verdict: implementable.** Every structural number is published. The plasma PK is linear, so the
closed-form engine carries over; whole blood is an algebraic transform of plasma. What is new
relative to de Winter is (1) six covariates, two of them time-varying, (2) a correlated Ω,
(3) between-occasion variability (BOV), (4) a second target (the trough is a real target here,
unlike MPA), and (5) different units.

**Decided by the owner (2 Oct 2026)**

| # | Decision | Outcome |
|---|---|---|
| D1 | Where does tacrolimus live? | **Same app, drug switch.** Proposed new name **NephroTDM** (to confirm). It fits both models (renal-transplant populations) and the MPA indications already in the background table (lupus nephritis, nephrotic syndrome). A web search on 2 Oct 2026 found no existing product of that name. A rename touches: page title and h1, report header, About, README, output file name in `build.mjs`, the published repository/URL. The session key `app:'mpa-tdm'` and the autosave key stay, so existing session files keep importing |
| D2 | First-day bioavailability effect (2.68×, "F<sub>day2</sub>") | **Ignored. No transplant-date field; the app assumes TDM takes place some days after transplantation.** The cut-off is open — see the measurement below |
| D3 | Which exposure is reported? | **The steady-state AUC<sub>0–12</sub> and trough on the current regimen — the same reference as for MPA** (PM6) |
| D4 | CYP3A5 genotype unknown | **Assume non-expresser; use the genotype when it is known.** No mixture. The report prints "CYP3A5 unknown — non-expresser assumed" |
| D5 | Assay | **LC-MS/MS, and immunoassay where the source allows it.** That is one immunoassay: Abbott CMIA (Architect), through the conversion the model itself was built with (PM18). Other immunoassays have no conversion in the source and are not offered |
| D6 | Default windows | **From the IATDMCT consensus (Brunet 2019).** The paper is behind a paywall and could not be read in this session; the values below are provisional until the PDF is in hand |
| D7 | Haematocrit correction | **Report both: the actual value and the value corrected to a haematocrit of 0.35** (PM17). The request named the AUC; the plan applies the same correction to the trough, since it is the same transform — say so if only the AUC is wanted |
| D8 | Haematocrit unit | **L/L.** A value of 10–65 is rejected with a message, never silently divided by 100 |

**D2 — the cut-off needs a second look.** The owner's rule is "more than 3 days after
transplantation". Measured on the typical patient (3 mg q12h from the day of transplantation,
prednisolone 20 mg, haematocrit 0.33), with the three readings of the window the paper allows:

| Day after transplantation | 3 | 4 | 5 | 7 | 10 | 14 |
|---|---|---|---|---|---|---|
| Trough as % of steady state (constant dose, no first-day effect) | 67 | 76 | 83 | 92 | 97 | 99 |
| True trough above the model's prediction when the effect is ignored — window = day 0 | +34 % | +21 % | +14 % | +6 % | +2 % | +0.5 % |
| — window = day 1 | +47 % | +29 % | +19 % | +9 % | +3 % | +0.8 % |
| — window = day 0 and day 1 | +80 % | +50 % | +33 % | +15 % | +5 % | +1.3 % |

A trough that is 20–50 % higher than the model expects is read as low clearance, so on day 4 the
steady-state AUC would be overestimated by a similar amount. Two half-lives of 49 h are not enough
to wash the effect out. **Recommendation: keep "ignored", but state the scope as from two weeks
after transplantation** (effect ≤ 1.3 %, and a constant dose has reached 99 % of steady state, so
steady-state mode is valid too). Between day 4 and day 14 the app would still run, with a model-card
caveat that early results are biased upward. Owner to confirm 3 or 14.

**D6 — provisional values.** Trough: **4–12 µg/L** (the consensus is reported to add "preferably
above 7" for the first period on basiliximab + MPA + steroids). This comes from secondary citation
and recollection, not from the consensus text, and may not be shipped until checked against the
PDF, with the quote, the patient subgroup and the grade recorded in a source analysis. AUC: the
abstract says AUC is "proposed as the best TDM option early after transplantation, at the time of
immunosuppression minimization, for special populations, and specific clinical situations"; whether
the text gives a graded AUC<sub>0–12</sub> range is unknown. If it does not, the AUC window ships
empty ("not set") and the AUC is shown with its interval but without probabilities.

**Not yet answered — the plan proceeds on the recommendation unless the owner objects**

| # | Decision | Recommendation |
|---|---|---|
| D9 | ω² convention | √ω², as for de Winter, with a measured robustness arm. Only BOV-ka (120 %) differs materially (1.44 vs 0.89) |
| D10 | Unpublished V1–Q correlation | 0.27 (= 0.43 × 0.62), arm with 0; author query |

---

## 1. The model as published (transcription to be verified line by line in Stage 0)

Table 2 footnote + Equation 3. Hours, litres, µg/L — hours-native, golden rule 3 untouched.

```
CLp/F = 811 L/h × (FFM/60)^0.75 × 1.30 [CYP3A5 expresser]
V1p/F = 6290 L  × (FFM/60)
Qp/F  = 1200 L/h × (FFM/60)^0.75
V2p/F = 32100 L × (FFM/60)
ka = 1.01 /h      tlag = 0.41 h (no variability)
F  = [1 − 0.67·Pred/(35 + Pred)] × 0.82 [CYP3A5 expresser] × 2.68 [first day post-transplant]
Cwb = Cp + fHCT · Cp · 418/(3.8 + Cp)          Bmax 418 µg/L erythrocytes, KD 3.8 µg/L (Jusko 1995)
FFM: Janmahasatian 2005 (weight, height, sex)   Pred = oral prednisolone, mg/day
BSV (CV%): CL 40 · V1 54 · Q 63 · Fday2 57      corr CL–V1 0.43, CL–Q 0.62     none on ka, V2, tlag
BOV (CV%): F 23 · ka 120                        Residual: proportional 14.9 % on whole blood
Estimation: NONMEM FOCE-I. 242 patients, 3100 concentrations (26 % full profiles, 41 % 4–5-point
profiles, 33 % troughs); median 20 days post-transplant (4 days – 15 years).
```

**Shared numbers** (FFM 60 kg, non-expresser; computed in this session with an independent script,
to be re-derived in Stage 0):

```
k10 0.12893 /h   k12 0.19078 /h   k21 0.037383 /h
α 0.34305 /h (t½ 2.02 h)   β 0.014051 /h (t½β 49.3 h)   absorption t½ 0.686 h
Whole blood : plasma ratio in the linear limit, 1 + fHCT·418/3.8:
  HCT 0.45 → 50.5 → CLwb 16.06, V1 124.6, Q 23.76, V2 636     (paper prints 16.1 / 125 / 23.8 / 636)
  HCT 0.33 → 37.3 → CLwb 21.74                                 (paper prints 21.7)
Figure S1: Cp 0.30 µg/L → Cwb 14.06 (HCT 0.45), 10.39 (0.33), 6.42 (0.20)   (matches the figure)
Binding non-linearity at HCT 0.33: ratio is 3.4 % below linear at 5 µg/L, 6.9 % at 10,
  13.7 % at 20, 20.5 % at 30 — not ignorable at peak
Prednisolone effect on F: 0 mg 1.000 · 5 mg 0.916 · 10 mg 0.851 · 20 mg 0.756 · 30 mg 0.691
FFM: man 80 kg / 175 cm → 60.2 kg; woman 70 kg / 165 cm → 43.1 kg
Steady-state anchors, 3 mg q12h:
  pred 20 mg, HCT 0.33: AUCp 2.7979 (= F·D/CL exactly) · AUCwb 98.0 µg·h/L · C0 5.45 · Cmax 12.2 at 2.0 h
     (the linearised model would give 104.4 — 6.5 % high)
  pred 5 mg, HCT 0.40: AUCwb 141.4 · C0 7.90;   same, expresser: 91.5 · 4.51
Trapezoid error of AUCwb at 4 points/h: 0.03 %
BOV-F 23 %: P(0.8 < e^κ < 1.25) = 66.8 %          (paper: 65 %)
ω² (√ω² convention): CL 0.1600, V1 0.2916, Q 0.3969, Fday2 0.3249, κF 0.0529, κka 1.44
   cov(CL,V1) 0.0929, cov(CL,Q) 0.1562; Ω positive definite for ρ(V1,Q) = 0 and = 0.27
```

---

## 2. Pharmacometrician

**PM1 — the engine's closed form still applies.** Disposition is driven by plasma concentration and
is linear two-compartment with first-order absorption and lag: exactly `cfModel`/`simulateClosed`.
Whole blood is a pointwise transform of C<sub>p</sub> (Equation 3). No ODE is needed; RK45 stays
the oracle.

**PM2 — per-dose F and per-dose ka keep superposition exact.** Prednisolone dose, CYP3A5 and
κ<sub>F</sub> all multiply the dose amount; κ<sub>ka</sub> gives each dose its
own ka (its own `W`, `R[0]`). Each dose remains an independent linear response.

**PM3 — AUC<sub>wb</sub> has no closed form.** ∫C<sub>wb</sub> dt is integrated numerically on the
closed-form C<sub>p</sub> curve. The existing `needCurves` path does this already; error 0.03 % at
the current grid. Plasma AUC keeps its exact mass balance (F·D/CL<sub>p</sub>) and becomes the
invariant test. Whole-blood exposure is slightly less than dose-proportional; the explorer shows
that by simulation and no text may call it proportional.

**PM4 — correlated Ω.** The engine is diagonal-only (`omegaQuadVec`, `priorDraws` build a diagonal).
Needed: Ω⁻¹ quadratic form and Cholesky draws for a 3×3 block. ρ(V1,Q) is unpublished (D10).

**PM5 — ω² convention.** Same ambiguity as de Winter S1, far smaller in effect: only BOV-ka moves
(D9). Robustness arm, author query.

**PM6 — the reported quantity is the steady-state exposure (owner decision D3).** AUC<sub>0–12</sub>
and trough at steady state on the current regimen, on a typical day (κ = 0), at the most recent
haematocrit and prednisolone dose. It is computed from the exact periodic solution with the
posterior of the patient-level parameters (CL, V1, Q), in both input modes. The dose explorer
reports the same quantity at the candidate dose. This is the MPA contract unchanged, so one results
grammar serves both drugs. Three consequences:
- **κ is estimated but not reported.** Each sampled occasion still gets its own κ<sub>F</sub> and
  κ<sub>ka</sub> in the fit; without them one unusual day would be booked entirely as the patient's
  clearance.
- **One sampling day cannot fix the steady-state AUC better than about ×/÷ 1.39 (5–95 %),** however
  many samples it contains: that day's deviation is split 75 : 25 between patient (ω² 0.16) and
  day (0.053), and the split itself is uncertain (posterior SD of log AUC 0.20). Two sampled days
  give ×/÷ 1.28, three 1.23, five 1.18. This is a property of the model, not of the app, and the
  user will see it as wide intervals and modest window probabilities. It belongs in Getting
  started as the reason to combine sampling days.
- **A single day's exposure scatters around the reported value** with a CV of about 23 %; the
  reported value is the median day (the arithmetic mean over days is 2.7 % higher). One fixed
  legend sentence says so.

**PM7 — κ on unsampled occasions.** v1 estimates κ<sub>F</sub>/κ<sub>ka</sub> only for occasions
that have a sample and sets the rest to 0 in the likelihood. That is what NONMEM POSTHOC does and
how the paper's external evaluation worked, but it ignores carry-over variance from the preceding
doses. A calibration arm (truth with BOV on every occasion) measures the coverage cost; if coverage
leaves 85–95 %, the preceding occasions get sampled κ<sub>F</sub> too.

**PM8 — the first-day effect is ignored (owner decision D2).** The paper defines its window three
ways: "first day after transplantation" (Results), "F<sub>day2</sub>" (Table 2), and "day 0 and
day 1" (Figure 4 legend); it has 57 % BSV and no mechanistic explanation. Leaving it out is clean
from about two weeks after transplantation and biased before that (table in §0).

**PM9 — time-varying covariates.** Haematocrit belongs to each *sample* (observation transform) and
to the reported exposure (the most recent value, stated next to the result). Prednisolone dose
belongs to each *dose*. FFM and genotype are fixed per patient. Steady-state mode assumes all of
them constant.

**PM10 — unknown genotype is treated as non-expresser (owner decision D4).** The combined effect of
expression on CL/F is 1.30/0.82 = 1.59, about 1.15 SD of η<sub>CL</sub>. For an unrecognised
expresser, a forecast without samples overpredicts exposure by that factor; once samples exist,
η<sub>CL</sub> absorbs most of it. With 5–15 % expressers in a European population this is the
simple and defensible default; the model card states it and notes that the proportion is much
higher in some other ancestries.

**PM11 — residual error.** Proportional on the natural scale: the existing `SIGMA.ADD/PROP` path
with PROP = 0.149² = 0.0222, ADD = 0. Check the 1e-6 variance floor on the µg/L scale.

**PM12 — hard lag.** tlag 0.41 h has no variability, so a sample before ~25 min sees none of the
new dose and one just after sees a step. Sampling guidance should avoid the first ~45 min; the
design evaluation in the calibration confirms or corrects this.

**PM13 — sampler dimension is the main statistical risk.** η = [CL, V1, Q] + 2 per sampled occasion.
One AUC day → 5; fourteen daily troughs → 31. The random-walk proposal is the unscaled Laplace
covariance and was tuned on 6–7 dimensions. Remedy ladder, each step measured against R̂ < 1.01
and ESS ≥ 400 on the printed quantities: (1) 2.38²/d proposal scaling; (2) κ<sub>ka</sub> only for
occasions with a sample ≤ 4 h after the dose; (3) block updates. The MPA history (65–75 % coverage
found by calibration, not by inspection) says this must be measured before the UI is built.

**PM14 — ka occasion semantics.** NONMEM applies an occasion's ka to whatever is in the depot;
the app's superposition gives each dose its own ka. They differ when ka is low (the 5th percentile
of the κ<sub>ka</sub> prior is 0.14 /h: 20 % of a dose still unabsorbed at 12 h). The ODE oracle
quantifies the difference; the choice is documented.

**PM15 — scope of validity** (model card): adult kidney recipients; age 23–71; FFM 35–80 kg;
haematocrit 0.25–0.43; prednisolone 5–36 mg/day; Prograf twice daily; LC-MS/MS-equivalent
concentrations; mostly the first three months. External evaluation: 72 patients, troughs only,
first three weeks (median prediction error −1.2 %, 90 % interval −38 to +47 %). **AUC prediction
was never externally evaluated in this paper**, and the authors state that trough-only estimates
shrink to the population mean. Age (F +1.4 %/year above 45) was found and deliberately left out.

**PM16 — Appendix S1 is a dosing equation.** Equation S1 is used once, as a transcription test.
Equation S2 (dose from a target) is never implemented or quoted (golden rule 6).

**PM17 — haematocrit-corrected exposure (owner decision D7).** Definition: the whole-blood
concentration this patient would show, with the same plasma concentration, at a haematocrit of
0.35 — the observation transform evaluated at 0.35 instead of at the patient's value. Both the
actual and the corrected steady-state AUC and trough come from the same posterior plasma curves,
so the correction costs one extra evaluation and adds no parameters.
- The paper's bedside formula is proportional (C × reference/haematocrit, with 0.45 as reference).
  At a reference of 0.35 it differs from the model-based value by +2.0 % at a haematocrit of 0.20,
  +1.1 % at 0.25, 0 at 0.35 and −0.8 % at 0.50 (it ignores the unbound-plus-plasma term). The app
  uses the model-based value; the proportional formula explains it in the help text and is a test.
- Worked example (typical patient, 3 mg q12h, same plasma curve): actual AUC 75.0 at 0.25, 98.0 at
  0.33, 118.2 at 0.40, 132.7 at 0.45; corrected AUC 103.8 in every case. Trough 4.17 / 5.45 / 6.57 /
  7.38; corrected 5.77.
- Why 0.35 and not the paper's 0.45: recipients sit near 0.35 (the Oslo cohort rose from 0.30 at
  transplantation to an asymptote of 0.37; the model cohort's mean was 0.33), so the corrected
  value stays on the scale of the measurements behind customary targets. Corrected to 0.45 the
  same patient reads 28 % higher.
- The app shows the corrected value with its interval and its probabilities against the same user-set
  window as the actual value. (3 October 2026, owner decision: no caveat text about validation anywhere
  in the app; an earlier version said "no target has been validated for a corrected value".)
- The reference (0.35) is a constant in the spec, not a user setting.

**PM18 — immunoassay input (owner decision D5).** The source gives exactly one conversion:
C<sub>LC-MS/MS</sub> = 0.80 × C<sub>immunoassay</sub> + 0.19 µg/L (Equation 1), which the authors
applied to the Oslo data before fitting. It comes from 43 paired samples measured during an assay
transition in the Oslo laboratory (CMIA 3.6–14.4 µg/L, LC-MS/MS 2.7–13.0 µg/L, r² 0.94; Størset
2014, Eur J Clin Pharmacol). So:
- **Offered:** LC-MS/MS, and Abbott CMIA (Architect). An entered CMIA value is converted once, at
  sample ingestion; the engine works in LC-MS/MS equivalents throughout.
- **Not offered:** other immunoassays (no conversion in the source; their bias differs) and MEIA
  (obsolete). The Stage 0 source analysis checks whether the consensus gives anything usable for
  them; if not, the option list stays at two.
- **Scale of the results.** With CMIA selected, everything on screen — samples, chart, AUC, trough,
  window probabilities — is back-converted to the CMIA scale, so the numbers match the laboratory's
  and the window the clinician already uses. The transform is affine and increasing, so quantiles
  and probabilities map exactly (AUC<sub>CMIA</sub> = (AUC<sub>LC</sub> − 0.19·τ)/0.80). The unit
  label carries the scale. Alternative, if preferred: always report LC-MS/MS equivalents — then a
  window set on CMIA values must be lowered by the user (CMIA 5–10 ≙ 4.2–8.2).
- **Caveats for the model card:** one laboratory, 43 pairs; valid for 3.6–14.4 µg/L on CMIA, so
  peak samples and the AUC rely on extrapolating the line; 0.19 is a constant, so the ratio is
  not: 0.86 at 3 µg/L, 0.82 at 10, 0.81 at 20.
- Precedent: MPA has no assay field (R1) because de Winter gives no assay information. The field
  is therefore declared per drug in the spec and stays absent for MPA.

**PM19 — what an occasion is.** The earlier Oslo model defined an occasion as one hospital visit
for profile data and as the period between two dose changes for routine troughs. The 2014 paper
does not restate it. The app treats each sampling day as an occasion, which matches the first
definition; under the second, the 23 % would describe variation between dose periods rather than
between days. Author query; it changes the wording of the day-to-day sentence (PM6), not the
arithmetic.

---

## 3. Clinical pharmacologist

**CP1 — units.** Dose mg; concentration µg/L (= ng/mL); AUC µg·h/L. One conversion point
(mg → µg) at dose ingestion, the tacrolimus counterpart of `toMpaMg`.

**CP2 — the trough is a target here.** "Trough for information only — no target" is MPA wording and
must not leak into tacrolimus screens. Two windows: AUC<sub>0–12</sub> and trough, both clinical
input, both with lower and upper bound, source shown.

**CP3 — where the defaults come from** (D6: the IATDMCT consensus, Brunet 2019). It gives graded
trough targets per patient subgroup and proposes AUC as the best option early after
transplantation, at minimisation and in special situations. Stage 0 writes a source analysis with
quotes (as `SOURCE_ANALYSIS_IATDMCT_2021.md` did for MPA); the provisional values are in §0. The
consensus targets differ by subgroup and period, so the default is one row of a table and the
background dialog shows the rest, as for MPA. For orientation only, the paper's centres targeted
troughs of 3–7 µg/L (Oslo) and 7–8 µg/L (Brisbane), up to 12 at high risk.

**CP4 — a mistimed trough is still usable.** A "trough" drawn 10.5 h or 13 h after the dose is
entered with its real times; the model predicts C(12 h). This is a real gain over reading C0 at
face value and belongs in Getting started.

**CP5 — assay** (D5, PM18). LC-MS/MS or Abbott CMIA. The assay is asked once per session, next to
the samples, and has no default: the user must choose, because a wrong guess shifts every result
by about 20 %. A laboratory using any other immunoassay is told that the model has no conversion
for it. CMIA is reported not to be affected by haematocrit, so the haematocrit correction and the
assay conversion do not interact.

**CP6 — steroid input.** Oral prednisolone-equivalent mg/day (prednisone mg for mg). Intravenous
methylprednisolone pulses were tested as a covariate and not retained; they are not an input.
Zero is allowed (steroid-free protocol) but extrapolates the Emax curve to its origin.

**CP7 — what the model cannot see.** CYP3A/P-gp inhibitors and inducers (azoles, macrolides,
diltiazem, rifampicin, ritonavir), diarrhoea, food, missed doses. A stable interaction is absorbed
by η<sub>CL</sub>; one that starts or stops inside the entered history breaks the constant-parameter
assumption. Text only — no input fields for effects the model does not have.

**CP8 — formulation.** Immediate-release, twice daily (Prograf in both cohorts; bioequivalent
generics assumed). Prolonged-release tablets and capsules, granules, intravenous and sublingual
use are out of scope.

**CP9 — below-LLOQ samples** stay refused, as in v1.1.

---

## 4. Nephrologist

**N1 — three moments of use.** (a) The first weeks: frequent troughs, falling then rising
haematocrit, steroid taper — where the model was built and externally evaluated, needs
full-schedule mode with per-sample haematocrit. With D2 the very first days are outside the app's
scope; how many is the open cut-off. (b) Clinic: one trough on a stable dose — steady-state mode.
(c) AUC day: when trough and clinical picture disagree, or at minimisation — often the same blood
draws as the MPA AUC.

**N2 — the formulation limit will be hit immediately.** Many adult recipients are on a once-daily
prolonged-release product. The limit must be visible where the dose is entered, not only in About.
Ref. 9 of the paper (Woillard 2011, Prograf + Advagraf) is the obvious candidate for a later model.

**N3 — haematocrit moves fast early on** (anaemia, transfusion, ESA). It must sit on the sample
row. The same whole-blood trough means more unbound drug at a haematocrit of 0.25 than at 0.40;
the corrected value (D7) makes that visible: an anaemic patient with a trough of 4.2 µg/L at 0.25
reads 5.8 µg/L corrected. I would look at the corrected value first in the early weeks and after
transfusion or ESA changes.

**N4 — day-to-day variability is familiar.** Clinicians know intra-patient variability of
tacrolimus as a risk marker in its own right. Use that wording; never "BOV".

**N5 — things I would look for and not find.** Renal function (not a covariate — say so), liver
function, age, ethnicity, C/D ratio. One line in the model card each; no fields.

**N6 — the report** must be pasteable into a letter: AUC, trough, the two windows, inputs
(including FFM as derived, haematocrit per sample, prednisolone dose, genotype), model line,
caveats. No sentence that reads as advice.

**N7 — the previous evening.** A morning trough is the tail of the evening dose. Steady-state mode
must ask for the time of the last dose before the sample explicitly. The model has no morning/
evening difference; say so.

**N8 — population limits** to state plainly: adults, kidney only (multi-organ recipients were
excluded from the external evaluation), Norwegian and Australian cohorts.

---

## 5. Senior UX designer

**UX0 — the name.** "NephroTDM" (D1) with the drug shown beside it, e.g. "NephroTDM — tacrolimus".
The title no longer names a drug or "AUC0–12h"; the drug control does.

**UX1 — the drug is the first decision.** A two-option control at the top of card 1. Every result,
chart title and report carries a model chip (`Størset 2014 · tacrolimus`) as today's
`de Winter 2008 · MMF`.

**UX2 — one session, one drug (v1).** Switching drug with doses or samples entered asks for
confirmation and clears them; the patient code stays. A combined tacrolimus + MPA sampling day is
a later item.

**UX3 — the patient card grows from one field to six; keep it light (rule 9).** Three quiet groups:
*Body size* (sex, weight, height → read-only "fat-free mass 60.2 kg"); *Genotype* (expresser /
non-expresser / unknown); *Steroid* (prednisolone mg/day). Windows stay in their fold, now with two
rows. Showing the derived FFM tells the user what the model actually uses.

**UX4 — assay above the sample table,** one required choice with no default (LC-MS/MS / Abbott
CMIA), and a plain line for everyone else: "other immunoassays are not supported by this model".
**Haematocrit on the sample row** in L/L, prefilled with the previous value, required. In
full-schedule mode a "steroid dose changed in this period" switch reveals a prednisolone column on
the dose table; otherwise one value applies to all doses.

**UX5 — results grammar** (D3). The MPA cards, twice: a row for steady-state AUC<sub>0–12</sub> and
a row for steady-state trough, each with its 5–95 % interval, its window and P(in window),
P(below), P(above). Each row has a second, quieter line of the same shape: "corrected to
haematocrit 0.35: value (interval) · P(in window)". Two rows of cards, not four: the corrected
value is a companion to the actual one, never a separate headline. When the patient's haematocrit
is 0.35 the second line says "same as above". One fixed legend line under the grid: "Steady-state
values on a typical day at haematocrit 0.33; a single day varies around them by about 23 %." An
explanation, not a warning. The chart shows actual whole blood only, so the curve passes through
the entered samples.

**UX6 — unknown genotype** is a visible state, not a blank: the select reads "unknown —
non-expresser assumed", and the report repeats it.

**UX7 — out-of-range covariates** (PM15 ranges) get a calm legend note, never a block. Blocks are
for impossible values only.

**UX8 — formulation note at dose entry** (N2): "Immediate-release tacrolimus, twice daily.
Prolonged-release products are not covered by this model."

**UX9 — units next to every number,** from the spec. µg/L to one decimal, AUC to the integer. With
CMIA selected the unit label carries the scale ("µg/L, CMIA scale") on results, chart axis and
report, so a screenshot cannot be read on the wrong scale.

**UX10 — phone.** The sample table gains a column; it must stack below 640 px (the 1.1.1 rules).
Measured at 320/375/430 px as in 1.1.1.

**UX11 — per-drug texts.** Background, Getting started, help popovers and the window fold are
selected by drug. The explorer hides the 24-h interval for tacrolimus.

---

## 6. Senior HTML programmer

**Coupling inventory (what is MPA-specific today):**
`M.toMpaMg` reads `DRUGS.mpa` (model.js:218; ui.js:322, 539, 923) · `installStubSpec` mutates
`DRUGS.mpa` · unit literals `mg/L` and `mg·h/L` in ~25 places in ui.js, index.html and
diagnostics.js · "no trough target" strings · `aboutHtml` hard-codes the parameter rows ·
`tools/verify_model.mjs` and `calibrate_dewinter.mjs` hard-code `'mpa'` · page title, h1, button
labels · `pt-wt` has a step grid (rule 7c open item — weight becomes clinically live, so it goes).

**Engine changes**

| # | Change | Where |
|---|---|---|
| E1 | `spec.units` and a spec-driven dose→engine conversion (MPA ×0.739/×0.936; tacrolimus mg→µg). One conversion point; a test forbids `* 1000` elsewhere, like the `/ 24` rule | model.js, ui.js |
| E2 | Covariate hooks on the spec: typical parameters from covariates (FFM allometry, CYP3A5) and per-dose F (prednisolone, genotype). Covariates ride in the existing `extra` slot — it is already plumbed through `runFit`, `makeOfv`, `simulateDraws`, `doseScan`, so no signature changes | model.js |
| E3 | Ω block: inverse quadratic form + Cholesky draws; shrinkage on marginal variances | bayes.js |
| E4 | Per-dose F and per-dose ka in `simulateClosed`; in steady-state mode the train at κ = 0 plus a correction term for each sampled occasion | model.js |
| E5 | Observation transform (plasma → whole blood, haematocrit per output time); AUC through the curve path; trough = transform at τ. Evaluated twice for the reported values: at the patient's haematocrit and at the spec's reference 0.35 (PM17) | model.js, bayes.js |
| E6 | Occasion bookkeeping (a pre-dose sample belongs to the previous dose's occasion); eta layout = subject etas + κ per sampled occasion | bayes.js |
| E7 | Reported AUC and trough for this drug = exact steady state of the last regimen at κ = 0 (PM6), also in full-schedule mode; MPA output unchanged | bayes.js |
| E8 | Trough window, its three probabilities, convergence check on both printed quantities | bayes.js |
| E9 | Diagnostics: κ rows grouped per occasion | diagnostics.js |
| E10 | Assay declared in the spec with its conversion to the model scale and back. One conversion point at sample ingestion, one at result display; a test forbids the constants 0.80 / 0.19 anywhere else. The session key must not collide with the legacy MPA `assay` keys that import already ignores (R1) | model.js, ui.js |

**UI changes:** drug control and per-drug texts (U1) · covariate panel from `covariateFields`
with sex/height/derived FFM (U2) · assay choice and haematocrit on samples, optional prednisolone
on doses (U3) ·
two-row results, second window (U4) · explorer at 12 h only (U5) · model
card rows from the spec (U6) · report (U7) · session round-trip of the new fields, old files
import unchanged (U8) · all new number fields `step="any"`, validated in JS (rule 7c) · all new
text escaped (rule 8).

**Cost.** Steady-state fit ≈ twice today's 0.5 s. A three-week history (40 doses, 20 samples) at
the current 800 000 iterations is ~10–20 s; the budget is set by the convergence bar, not by habit,
and the progress bar already exists.

**Tooling.** `verify_model.mjs` loops over all drugs · `calibrate_storset.mjs` ·
`reference_posterior.mjs` extended (independent sampler) · `tools/nonmem_verify/tac/` ·
`tests/golden.json` and `tests/nonmem_golden.json` gain tacrolimus sections.

---

## 7. Validation matrix

**Layer 1 — code = paper**

| # | Check | Tolerance |
|---|---|---|
| V1 | Micro-constants, α, β, half-lives (§1) | 1e-3 rel |
| V2 | Published cross-check: plasma parameters ÷ 50.5 = 16.1 / 125 / 23.8 / 636; CLwb 21.7 at HCT 0.33 | print precision |
| V3 | Figure S1: Cp 0.30 → 14.06 / 10.39 / 6.42 | 1e-3 rel |
| V4 | FFM formula, both sexes | 1e-3 rel |
| V5 | Covariate factors; Equation S1 reproduced (transcription test only) | 1e-3 rel |
| V6 | Plasma mass balance at steady state, invariant to ka, tlag, κka | 1e-6 rel |
| V7 | Whole-blood anchors (98.0 / 5.45; 141.4 / 7.90; 91.5 / 4.51) | ±0.5 % |
| V8 | Quadrature error of AUCwb | ≤ 0.1 % |
| V9 | Closed form vs RK45 with per-dose F and ka | 1e-5 rel |
| V10 | Prior draws reproduce ρ 0.43 / 0.62 | ±0.02 |
| V11 | Occasion logic: κF on occasion k scales that dose only; pre-dose sample → previous occasion | exact |
| V12 | One Cp, two haematocrits → two Cwb | exact |
| V13 | Precision floor: a dense, noise-free profile on one occasion gives a posterior SD of log steady-state AUC ≈ 0.20; two occasions ≈ 0.15 (PM6) | ±0.02 |
| V14 | Simulation–recovery calibration, n = 100 per cell: {steady state, three-week history} × {one trough, troughs on several days, profile design}. Truth = the simulated patient's steady-state AUC and trough at κ = 0, actual and corrected to 0.35. Coverage of the 5–95 % interval in 85–95 % for all four. Arms: ω² convention; ρ(V1,Q) 0 vs 0.27; BOV on every occasion (PM7); NONMEM ka semantics (PM14); unrecognised expresser fitted as non-expresser (D4); design evaluation incl. the MPA sampling times + C0 | stated |
| V15 | NONMEM 7.6: structural identity, POSTHOC, BAYES (as `NONMEM_CROSSCHECK.md`) | as MPA |
| V16 | **MPA regression:** all existing tests and both golden files unchanged; fixed-seed MPA fits bit-identical before and after the refactor | 0 |
| V17 | Copy tests: no dose advice in any tacrolimus text; no MPA wording on tacrolimus screens | bool |
| V18 | Haematocrit correction: corrected = actual when the haematocrit is 0.35; anchors 103.8 / 5.77 from the plasma curve that gives 98.0 / 5.45 at 0.33; within 2.5 % of the proportional formula for 0.20–0.50 | exact / ±0.5 % / bound |
| V19 | Haematocrit invariance, end to end: one simulated patient, samples generated at 0.25 and at 0.40, fitted separately → the corrected AUC and trough agree; the actual values differ by the expected ratio | ±2 % |
| V20 | Assay: CMIA 10 → 8.19; round trip is the identity; an LC-MS/MS session is bit-identical with and without the assay code path; the back-converted AUC equals the integral of the back-converted curve; a CMIA value outside 3.6–14.4 raises the range note | exact |

**Layer 2 — model = reality.** Inherited: bootstrap, pcVPC, one external evaluation on troughs in
the first three weeks. Not inherited: any validation of AUC estimation, of maintenance-phase use,
or of other formulations. The model card says exactly this.

---

## 8. Build order (each step: test red first → implement → green → build)

```
0. Documents      MODEL_ANALYSIS_STORSET_2014.md (line-by-line transcription + scrutiny),
                  source analysis of Brunet 2019 (needs the PDF), author query, D2 cut-off confirmed
                  -> verify: every number in §1 traced to a page; both windows traced to a quote
1. Refactor       E1 + the NephroTDM rename + characterization tests, zero behaviour change for MPA
                  -> verify: V16; an exported v1.1.1 session imports unchanged
2. Engine on stub E3, E4, E5, E6, E8, E10 one at a time on an extended stub
                  -> verify: V9–V12, V18, V20 red against the old code, then green
3. Sampler        E7 + PM13 ladder on the stub
                  -> verify: R̂/ESS bar at 5, 15 and 31 dimensions; V13
4. Spec fill      tacrolimus spec, pending:false, E2
                  -> verify: V1–V8; verify_model strict; sabotage CL 811→900, confirm red
5. Calibration    V14, then V15
                  -> verify: all cells in band, or the failing arm is fixed before any UI work
6. UI             U1–U8, UX1–UX11
                  -> verify: end-to-end in the browser, three patients (N1 a/b/c), phone widths, print
7. Release        model card, README, verification charter, release notes, version bump in
                  src/version.js and package.json together, build
```

Step 5 before step 6 is deliberate: the κ layout and the sampling guidance depend on what the
calibration finds.

---

## 9. Out of scope for this plan

Prolonged-release tacrolimus · children · liver, heart, lung recipients · the first days after
transplantation and the first-day bioavailability effect (D2) · a probabilistic treatment of
unknown genotype (D4) · single-day ("what was the AUC on the sampled day") reporting (D3) ·
a validated target for the haematocrit-corrected value · immunoassays other than Abbott CMIA ·
mixing assays within one session · combined tacrolimus + MPA session · any dose suggestion.

## 10. Author queries (draft in Stage 0, next to `AUTHOR_QUERY.md`)

1. The NONMEM control stream. 2. The full Ω, including V1–Q. 3. Whether CV% is √ω² or exact
log-normal. 4. The definition of an occasion in the combined model (PM19). 5. Whether the 2015
correspondence by the same group (Staatz et al.) changes any value — to be read in Stage 0.
6. Whether the assay regression has been repeated on more pairs or a wider range, and which assay
the profile samples above 14 µg/L were measured with. (The first-day window is no longer a query:
D2. For the record, the earlier Oslo paper numbers the day of transplantation as day 1, which
makes "F<sub>day2</sub>" the day after transplantation.)

## References (citations checked in PubMed, 2 Oct 2026)

- Størset E, Holford N, Hennig S, et al. Br J Clin Pharmacol 2014;78(3):509–523. https://doi.org/10.1111/bcp.12361
- Størset E, Holford N, Midtvedt K, et al. Importance of hematocrit for a tacrolimus target concentration strategy. Eur J Clin Pharmacol 2014;70(1):65–77. https://doi.org/10.1007/s00228-013-1584-7 — full text read (PubMed Central): source of the assay regression (43 pairs), the proportional haematocrit formula, the haematocrit time course and the occasion definition
- Staatz CE, Størset E, Bergmann TK, Hennig S, Holford N. Tacrolimus pharmacokinetics after kidney transplantation — influence of changes in haematocrit and steroid dose (letter). Br J Clin Pharmacol 2015;80(6):1475–1476. https://doi.org/10.1111/bcp.12729
- Brunet M, van Gelder T, Åsberg A, et al. Therapeutic Drug Monitoring of Tacrolimus-Personalized Therapy: Second Consensus Report. Ther Drug Monit 2019;41(3):261–307. https://doi.org/10.1097/FTD.0000000000000640
- Janmahasatian S, Duffull SB, Ash S, et al. Quantification of lean bodyweight. Clin Pharmacokinet 2005;44(10):1051–1065. https://doi.org/10.2165/00003088-200544100-00004
- Størset E, Åsberg A, Skauby M, et al. Improved tacrolimus target concentration achievement using computerized dosing in renal transplant recipients. Transplantation 2015;99(10):2158–2166. https://doi.org/10.1097/TP.0000000000000708 — *not* cited as validation of this model: which model the trial software used must be checked first (a non-parametric model from the same centre exists: Åsberg 2013, https://doi.org/10.1111/tri.12194).


---

## 11. Execution log (NephroTDM 1.2.0 / 1.2.1, 2 October 2026)

Run in the plan's order (§8); every engine step went red before green (README rule 7b).

**What was built.** `src/tacrolimus.js` (the whole model behind `spec.custom` hooks, so the MPA code path is untouched) ·
`src/texts_tac.js` · hooks in `model.js` (η layout by data, full Ω, per-drug dose conversion, delegated `indivParams`/`simulate`) and
`bayes.js` (correlated-Ω quadratic form and draws, observation transform, BFGS MAP, sampler step scale, the tacrolimus branch of
`runFit` and `doseScan`, optional windows) · the UI (drug switch, six covariates, per-sample haematocrit and per-dose prednisolone,
two window folds, two-row results with the corrected line, tacrolimus explorer, report, diagnostics, session) · the rename ·
`tests/test_tacrolimus.js` (33 tests) · `tools/calibrate_storset.mjs`, `tools/assemble_calibration_storset.mjs`,
`tools/nonmem_verify/tac/` · docs: `MODEL_ANALYSIS_STORSET_2014.md`, `AUTHOR_QUERY_STORSET.md`, `CALIBRATION_RESULTS_STORSET.md`,
`RELEASE_NOTES_V120.md`.

**Decisions taken during execution** (deviations from, or additions to, the plan):
- **No window ships by default.** The consensus text (Brunet 2019) was paywalled and could not be read, so both windows are empty
  and `verify_model` *forbids* a default until a source analysis with quotes exists. The provisional trough "4–12 µg/L" of §0 is not in the app. (Superseded on 3 October 2026: the consensus was read and the standard window now ships; see SOURCE_ANALYSIS_BRUNET_2019.md.)
- **D2 text.** The scope sentence is "intended for use some days after transplantation… biased upward in the first week or two"; the
  owner's cut-off (3 days vs the 14 recommended) is unresolved and no transplant-date field exists.
- **Rename.** NephroTDM (the owner's suggestion, adopted): page title, header, About, report, README, `package.json` name,
  `build.mjs` → `nephrotdm.html`. The session key `mpa-tdm` is kept so v1.1.1 session files import (tested in the browser).
  The old `mpa-tdm.html` (1.1.1) was left in place and the published repository/URL were not touched.
- **MAP.** BFGS with central-difference gradients (Nelder–Mead is unreliable above ~8 dimensions); agrees with Nelder–Mead on a
  3-eta problem and with NONMEM's POSTHOC (below). Sampler step = min(1, 2.38/√d); iterations 800 000 up to 7 etas, 1 600 000 above.
- **Cap of 12 sampled days** carrying κ (the 12 most recent); the plan's PM13 ladder was otherwise not needed beyond the step scale.
- **Haematocrit-corrected trough** reported alongside the AUC (the owner named only the AUC).
- **Assay scale.** Results, samples, chart axis and report are all shown on the chosen assay scale, with the scale in the unit label.

**What the validation found** (the point of running it):
1. *A harness, not the model:* my first sabotage script read only stdout and reported eight "still green" results; the test harness prints
   `FAIL` to stderr. Fixed; the real run turned seven red and exposed one genuine gap (nothing tested `prepare()`'s steady-state delta
   flag) — test V11b added and shown red.
2. *A real bug caught by the explorer test:* `amounts` used before its declaration in the new `doseScan` branch.
3. *Single-source rule worked:* the immunoassay constants had crept into a report string in `ui.js`; the test that forbids them outside
   `tacrolimus.js` failed, and the text is now derived from the spec.
4. *A clinically dangerous bug caught only in the browser:* after switching MPA → tacrolimus the AUC window still held the MPA default
   30–60 (now labelled µg·h/L). Fixed (`resetWindows`), guarded structurally, verified live.
5. *A pre-existing MPA defect:* `fit.shrink` held information gained (1 − Var/ω²), not shrinkage; the diagnostics bars and the sparse-data note
   read it backwards (population forecast 0.00, six samples 0.85). Found while choosing a tacrolimus threshold; fixed in 1.2.1 by a
   separate task (`METHODS_AUDIT_V101.md`, ST4 addendum); tacrolimus labels and tests it as information gained.
6. *NONMEM taught two things about its own semantics* (neither a defect of the app): `PRED` is a reserved data item; and with a lag time
   NONMEM takes F1 of a lagged dose from the *next* record's PK call. The first cross-check layouts therefore disagreed by up to 40 %;
   after laying the data out as real data would be (covariates carried to the record after each dose, pre-dose observation before a
   same-time dose) the structural model agrees to ~5·10⁻⁹. A per-dose κ on part of a steady-state train cannot be expressed in NONMEM
   the way the app's delta mechanism does it; that equivalence is tested directly (V11: delta = explicit history).
7. *The calibration overruled an efficiency idea* (κka only for days with an early sample): see `CALIBRATION_RESULTS_STORSET.md` —
   all nine cells got worse, so it was reverted and convergence is bought with iterations.

**Evidence of record.** `npm test`: 111 (MPA/engine, incl. 5 added by the ST4 fix) + 33 (tacrolimus); `verify_model.mjs` OK for both drugs.
Sabotage record (each of these turned the suite red): CL 811→900; red-cell KD 3.8→4.2; assay intercept 0.19→0.25; steady-state delta off;
correlation dropped; corrected reference 0.35→0.45; unknown genotype as expresser; prednisolone effect removed; F(expresser) 0.82→0.80;
lag 0.41→0.45; CL–Q correlation 0.62→0.50; proportional error 0.149→0.16 (caught *only* by the NONMEM cross-check); κF CV 0.23→0.30; a window
number or dose advice in the tacrolimus copy; the window reset removed. NONMEM 7.6 (`tools/nonmem_verify/tac/run_tac.sh`): 40 subjects,
560 predictions agree to 4.7·10⁻⁹ (steady state; histories with per-dose prednisolone, per-day κF, κka, expressers, FFM, haematocrit);
30 POSTHOC patients: the app's MAP has the lower-or-equal objective in 30/30, NONMEM's EBE above it by at most 0.029 (−2LL), median |Δη| 0.008.
V16: fixed-seed MPA fits (3 cases + a dose scan) are bit-identical to the v1.1.1 record. Browser (built single file): full tacrolimus
session (steady state, CMIA, windows, explorer, report text, export → clear → import), MPA session, v1.1.1 session import, phone widths
375 and 320 px (page width = screen; tables contained).

**Not done / open.** Windows (consensus PDF) · D2 cut-off · independent human review · author queries not sent · publishing and the
repository/URL rename · deleting `mpa-tdm.html` · a calibration of the twelve-sampled-day design (27 etas; timed and shown to converge on one patient, ≈ 26 s in one thread, but not calibrated).

**Calibration of record (final configuration, n = 100 per cell):** all 36 coverage figures inside 85–95 % (86–92 %), including the three robustness
arms; convergence 100 %. Repeated on the optimised engine (`PERFORMANCE_AUDIT_V121.md`) with the same result. Details and the layout experiment: `CALIBRATION_RESULTS_STORSET.md`.
