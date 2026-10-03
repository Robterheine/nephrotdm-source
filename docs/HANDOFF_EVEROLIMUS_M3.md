# Hand-off: adding everolimus (Model 3) to NephroTDM

**Status (3 October 2026, later): implemented as 1.4.0** (steps 1 to 7 of §10 are done; see `RELEASE_NOTES_V140.md`; what is left is the human review, the final browser pass by the owner and the decision to publish). The text below is the plan as written at the end of the 1.3.0 session.

Written 3 October 2026 at the end of the 1.3.0 session. Nothing of everolimus is implemented in the app yet. What exists: this plan, a **verified
algorithm prototype** (`tools/evr_prototype/`), and the model's NONMEM code (`tools/nonmem_verify/evr/model3.ctl`). A new session can start from §0
and work through §10 in order.

The brief from the owner: add everolimus, **specifically the "M3" model** (Model 3 of Zwart 2021), follow the IATDMCT everolimus consensus, and show
**both actual and haematocrit-corrected endpoints**. The plan below is written from four seats: HTML/JS coder (fast, responsive), UX designer (plain,
learnable without training), pharmacometrician, clinical pharmacologist. Each seat has its own section; §1 lists the decisions only the owner can take.

**Update 3 October 2026 (last owner answers):** D5 the app also works without a sample (population forecast); D7 LC-MS/MS only; D9 keep the FU eta. **With these, every decision in §1 is closed.**

**Update 3 October 2026 (final owner answers):** use the model exactly as coded (units and structure); the corrected value is Eq. 3 on the same plasma curve (D2); the one-Ht approximation is acceptable (D3); the prednisolone effect is a binary covariate entered by the user in the interface, applying at 20 mg/day or more (NONMEM `STUDY.EQ.4`) and absent below (D6). All decisions D1-D10 are now closed; the author queries are closed.

**Update 3 October 2026 (earlier):** the owner (last author of the model paper) answered the model questions and authorised running NONMEM. Done since the first
version of this file: **the structural NONMEM 7.6 cross-check of M3 is complete and passes** (§9, `tools/nonmem_verify/evr/`, fixtures in `tests/nonmem_evr_struct.*`).
Owner answers: Q5 five equal absorption stages (Erlang-5): correct. Q6 the residual error is everything not covered by the rest of the model, assay and day-to-day variability
included. Q7 M3 is valid for twice-daily use in adult kidney recipients at any time after transplantation. (Both open author queries were answered afterwards, see above.) The binding-unit question (§11) is settled by the NONMEM run (see there).

---

## 0. Read this first (for the next session)

**Repo and rules.** Project folder `mpa-tdm/` (git is not used here). Read `CLAUDE.md` and `README.md` §2 (golden rules) before touching anything.
The ones that bite on this task:
- Never hand-edit `nephrotdm.html`; build with `node build.mjs`. `src/version.js` and `package.json` move together (now 1.3.0; this feature is 1.4.0).
- `npm test` (111 MPA/engine + 60 tacrolimus tests at hand-off) and `node tools/verify_model.mjs` must pass. **Red-first**: every new assertion must be shown to fail on the unfixed code, and a sabotage run must turn the suite red (see any `tests/test_tacrolimus.js` block for the pattern).
- **MPA and tacrolimus numbers must not move**: `tests/mpa_v111_regression.json` (V16) and `tests/tac_v121_regression.json` (V16b) are bit-identity records. Any change to shared code (`bayes.js`, `model.js`, `ui.js`) must leave both green.
- The app never suggests, recommends or optimises a dose or interval. Time is in hours in the engine. Dose in mg in the UI; the engine takes µg (`doseToEngine`).
- New user-facing text: no em-dashes, no filler, no claim stronger than the evidence (the owner uses the humanizer skill on text). Research-use disclaimer stays. **No text anywhere saying a corrected value or target is "not validated"** (owner decision of 3 October; a guard test exists for tacrolimus, extend it).
- No dependencies, offline single file, escape all user text.

**What is already decided (do not reopen):** (owner, 3 October, later in the session) **D1: the corrected value uses haematocrit 0.38; D4: a trough window only (3-8 µg/L with reduced-exposure CNI as default, 6-10 without CNI), no AUC window anywhere, intervals only for the AUC.** The owner is the last author of the model paper and will answer the author queries of §11 directly. Also decided: same app, one more drug in the drug select; model M3 only (M1 and M2 are not in scope); report both actual and
haematocrit-corrected exposure; the dose explorer stays one candidate dose per click (no multi-dose table); no transplant-date field; no interaction field.
Standard (kidney) therapeutic windows ship as editable defaults, listed in a background dialog with "Use" buttons (same pattern as tacrolimus).
A window is judged on the scale shown. Autosave expires after 24 h; Clear session exists.

**Source files (on the owner's Desktop, not in the repo; do not copy the PDFs in):**
- `EVero/ (owner's local copy)/40262_2020_Article_925.pdf`: Zwart TC, Moes DJAR, van der Boog PJM, van Erp NP, de Fijter JW, Guchelaar HJ, Keizer RJ, ter Heine R. *Model-informed precision dosing of everolimus: external validation in adult renal transplant recipients.* Clin Pharmacokinet 2021;60:191-203. doi 10.1007/s40262-020-00925-8.
- `EVero/ (owner's local copy)/40262_2020_925_MOESM5_ESM.pdf`: its NONMEM code for Models 1, 2 and 3 (M3 copied to `tools/nonmem_verify/evr/model3.ctl`).
- `(owner's local copy) everolimus-personalized-therapy-second-consensus-report-by.pdf`: Masuda S, Lemaitre F, Barten MJ, et al. *Everolimus personalized therapy: second consensus report by IATDMCT.* Ther Drug Monit 2025;47(1):4-31.
- Text extracts for quick searching: `pdftotext -layout <file> out.txt` (poppler is installed). The paper that first described the mechanistic model (Model 1) is ref. 12 of Zwart; the parameters of M3 are only in the ESM code, which is complete.

---

## 1. Decisions needed from the owner (with a recommendation each)

The user's name matches the last author of the model paper. If that is the same person, items marked **[author]** can be answered directly without a query.

| # | Decision | Recommendation |
|---|---|---|
| D1 **(decided: 0.38)** | **Reference haematocrit for the corrected value.** The paper normalises to **0.38** (mean of renal and cancer patients, Eq. 3); the tacrolimus part of the app uses 0.35. | Use **0.38** for everolimus (the source's own definition; `HCT_REF` is a per-drug constant, so the two drugs can differ). The UI must name the number per drug. |
| D2 **(decided: Eq. 3)** | **What "corrected" means in the PK.** The corrected value is the whole-blood concentration recomputed at Ht 0.38 from the same plasma concentration (Eq. 3 of the paper; this is also what tacrolimus does), not a re-run of the whole model at Ht 0.38. | Owner confirmed this is the intended definition. |
| D3 **(decided: approximation accepted)** | **Haematocrit in the PK. (Measured, see §9: NONMEM applies the Ht of the record at the END of each interval; the one-Ht approximation costs mean 1.0 %, max 6.2 % on earlier-sample predictions when Ht moves by up to 0.12; the reported steady-state exposures are exact at the latest Ht.)** In M3 Ht is also a PK covariate (hepatic plasma flow). The app can hold one Ht for the PK path (patient field / latest sample) and use each sample's own Ht only for the blood transform. NONMEM's record-wise Ht would need time-varying parameters, which the superposition engine cannot do. | One Ht for the PK path (latest sample's), per-sample Ht for the transform. Accept the approximation (numbers in §9). An exact alternative exists if ever needed: propagate the 8-state system piecewise with the Ht of each interval's end record (slow matrix exponential; only for history mode). |
| D4 **(decided: trough window only)** | **Trough and AUC windows.** The consensus gives a trough window (3-8 µg/L with reduced CNI; 6-10 without CNI) and **no AUC target** (it says the PK is linear and C0 reflects the AUC). | Ship trough sets: "with reduced-exposure CNI 3-8" (default) and "without CNI 6-10". **Ship no AUC window** (intervals only); say so plainly in the dialog. If an AUC window is wanted it must be labelled as the owner's choice (the paper's centre used point targets of AUC0-12 100 µg·h/L with tacrolimus and 120 without, C0 6 and 7 µg/L; these are not windows). |
| D5 **(decided: the app also works without a sample)** | **Fits without samples.** The paper shows the a priori prediction is poor: C0 MAPE about 32 %, AUC0-12 **over-predicted by about 43 %** (M3, Table 2 "initial"). | Owner decision: a population forecast with no measurement is allowed, as for MPA and tacrolimus. Keep the existing "Population forecast, no measurements entered" status badge, and put the paper's a priori accuracy in the About text (it is the honest claim). Do not block the run. |
| D6 **(decided)** | **Prednisolone covariate.** M3 has one binary effect: "high-dose prednisolone" (NONMEM flag `STUDY.EQ.4`) multiplies intrinsic clearance by 1.44 (exposure about 30 % lower). | **The user enters it in the interface as a required two-option choice** ("Prednisolone: less than 20 mg/day, or none" / "20 mg/day or more"); the effect applies at ≥ 20 mg/day and there is no effect below 20 mg/day (owner decision). Constant per patient (the current dose), not per dose. A choice, not a free number, so the threshold cannot be mistyped; no default selected. |
| D7 **(decided)** | **Assay.** The consensus (assay recommendations, pp. 13-14): LC-MS/MS preferred; LC-MS/MS, QMS, ECLIA and ACMIA results are **not interchangeable**; no conversion exists. | LC-MS/MS only. No assay field with choices; one fixed line "Concentrations must come from an LC-MS/MS assay". |
| D8 | **Scope of the dosing interval.** The model was built on twice-daily transplant and once-daily cancer data; validated in twice-daily renal recipients. | Accept 10-14 h (same as tacrolimus), say "twice-daily everolimus in adult kidney transplant recipients". Once-daily and cancer refused with the reason. |
| D9 **(decided: keep)** | **FU random effect.** M3 has a tiny IIV on the unbound fraction (variance 0.0009, fixed). | Keep it (3 etas: CLINT, V3, FU) so the NONMEM identity check is exact; cost is negligible. |
| D10 **(answered by the owner: residual error covers everything the model does not, assay and day-to-day variability included)** | **Within-subject variability.** M3 removes inter-occasion variability on absorption (IOV fixed to 0); the paper says real variability is about 50 % in the first 6 months and about 20 % later, and that it is absorbed in the larger residual error. | No occasion layer. State plainly what the intervals do and do not include (§3.7, §8). |

---

## 2. Facts from the sources (all to be re-checked against the PDFs by whoever implements)

**Model paper (Zwart 2021).**
- Data: model built on rich PK of 126 patients (renal prophylaxis, thyroid and breast cancer); external cohort 173 adult renal recipients, 4123 concentrations (2933 troughs, 322 AUC0-12 profiles), Leiden 2014-2019, LC-MS/MS, LLOQ 0.5 and ULOQ 50 µg/L. Cohort: Ht mean 0.361 (0.213-0.537), dose mean 1.55 mg twice daily (0.5-5.0), 72.8 % on tacrolimus, 54.3 % of prednisolone users at ≥ 20 mg/day. (Table 1, p. 195.)
- Model 1 = mechanistic (liver compartment, 4 transit compartments, allometric scaling to fat-free mass, saturable red-cell binding, IIV on CLINT, V3, FU; IOV on mean absorption time). **Model 2** = Model 1 without allometry. **Model 3** = Model 2 without the IOV on absorption time. M3 therefore needs **no weight, height, sex or age**.
- Whole-blood link (Eqs. 1-3, pp. 193-194): Crb = Bmax·Cp/(Kd+Cp) + Kns·Cp; Cwb = Ht·Crb + (1−Ht)·Cp; corrected: Cwb,corr = 0.38·Crb + 0.62·Cp. About 75 % of everolimus sits in erythrocytes at therapeutic concentrations.
- Fit-for-purpose results for **Model 3** (Table 2, p. 198), predicting a *future* value from a prior one: C0 ≤ 6 months MPPE +13.5 %, MAPE 30.1 %; C0 > 6 months +6.3 % and 26.2 %; AUC0-12 ≤ 6 months −6.75 % and 11.1 %; > 6 months +0.08 % and 12.3 %. A priori (no sample): C0 MPPE +5.4 %, MAPE 32.3 %; AUC0-12 MPPE **+42.7 %**, MAPE 52.7 % (n = 45). Models 1 to 3 performed alike.
- Haematocrit normalisation (Model 1): mean ΔC0 +4.0 % (range −34 to +53 %), ΔAUC +2.9 %; at the 5th percentile of Ht (0.28) ΔC0 +31 %, at the 95th (0.47) −21 %; |Δ| > 20 % in 13.6 % (C0) and 14.3 % (AUC) of occasions.

**Consensus (Masuda 2025).**
- Kidney recommendations (p. 16): target trough **3-8 ng/mL when combined with a CNI**; with low-dose ciclosporin keep ciclosporin low (interaction); EVR plus reduced CNI is similar in efficacy to MPA plus standard CNI; more discontinuations on EVR. Table 1 (p. 10): renal, with reduced CNI 3-8; **without CNI 6-10**; t½ about 28 h; AUC24 40-120 (dose-normalised, descriptive, **not a target**).
- "The PK is linear, and the trough shows a good relationship with the AUC"; metabolites need no monitoring (p. 9). Ciclosporin inhibits EVR metabolism by about 50 %; tacrolimus concentration does not influence EVR exposure; CYP3A/P-gp inhibitors and inducers matter (p. 9).
- Assay recommendations (pp. 13-14): see D7. LLOQ close to 1 ng/mL, imprecision ≤ 10 %.
- Population-PK and MIPD section (p. 10-11): the semi-mechanistic liver/transit model with haematocrit normalisation is the cited example; haematocrit and size are the usual covariates.
- ng/mL = µg/L, ng·h/mL = µg·h/L (same note as for tacrolimus).

---

## 3. Pharmacometrician: the model, exactly

### 3.1 Parameters of M3 (ESM code, verbatim values)

| Item | Value | Notes |
|---|---|---|
| Mean absorption time MAT | 0.549 h | Erlang with 5 equal stages: KA = 5/MAT = 9.107 /h. In the code: dose compartment plus 4 transit compartments, then the liver. No IOV in M3 (OMEGA fixed 0). |
| CLINT (intrinsic clearance) | 322 L/h, ω² 0.118 | Multiplied by **1.44** when "high-dose prednisolone". |
| V3 (central plasma volume) | 266 L, ω² 0.401 | |
| Q | 79.5 L/h | |
| V4 (peripheral) | 519 L | no IIV |
| FU (unbound fraction) | 0.27, ω² 0.0009 (fixed) | |
| QH (hepatic blood flow) | 90 L/h | QHP = QH·(1−Ht) (plasma flow) |
| VL (liver volume) | 1.55 L (fixed) | |
| Binding | Bmax 0.96425, Kd 0.09195, Kns 0.15336 | The code labels them "mg/L", dose and concentrations being in mg and mg/L: **Bmax 964.25 µg/L erythrocytes, Kd 91.95 µg/L plasma, Kns dimensionless**. |
| Residual error | **log-scale additive**, σ² 0.0957 (SD 0.309) | `Y = LOG(IPRED) + ERR(1)`. The engine already has `SIGMA.LOG` (used by MPA). |
| Ω | diagonal: CLINT, V3, FU | no correlations |
| Covariates | Ht (time-varying), high-dose prednisolone flag | nothing else |

Structure (all linear): dose → A1 → A5 → A6 → A7 → A8 (each rate KA) → liver A2 ⇄ central A3 ⇄ peripheral A4; elimination from the liver only.
EH = CLINT·FU/(QHP + CLINT·FU); CLH = EH·QHP; K20 = CLH/VL; K23 = QHP·(1−EH)/VL; K32 = QHP/V3; K34 = Q/V3; K43 = Q/V4. Cp = A3/V3.
Models 1 and 2 are in the same file for context (do not implement).

### 3.2 Two exact identities (use them as test oracles)

1. **Steady-state plasma AUC over the interval = Dose / (CLINT·FU)** (the dose enters the liver, so oral clearance does not depend on flow or Ht). Verified numerically to 2·10⁻⁹. It means the AUC depends on CLINT and FU only; **V3 shapes the trough and Cmax but not the plasma AUC**.
2. Plasma exposure is independent of Ht in the AUC; the **actual whole-blood AUC scales with Ht through the blood transform**, and the **corrected AUC is almost Ht-invariant** (79.27, 79.29, 79.30 µg·h/L for Ht 0.30, 0.38, 0.45, same patient; the tiny drift is the Ht effect on distribution).

### 3.3 Closed-form solution (verified; this is what makes the app fast)

A matrix-exponential implementation costs about 300 µs per call (8×8) and would make a fit take minutes. The closed form below costs **about 0.4 µs per steady-state concentration including parameter build and the cubic roots**, and agrees with the matrix exponential to **2.5·10⁻¹¹ (single dose), 5·10⁻¹¹ (steady-state trough)** over Ht 0.25-0.50, three eta sets (including large ones), both prednisolone states. Code: `tools/evr_prototype/evr_closed.js` (functions `poles`, `hconv`, `cpSingle`, `cpSS`); reference model and RK4 oracle: `tools/evr_prototype/evr_proto.js`.

1. **Disposition poles.** The 3×3 system (liver, central, peripheral) has characteristic polynomial D(s) = (s+a)((s+b)(s+c) − K43·K34) − K32·K23·(s+c) with a = K20+K23, b = K32+K34, c = K43. Its three roots are real, negative, distinct (compartmental system); solve the cubic by the trigonometric method. For a unit amount entering the liver the plasma concentration is Cp(t) = Σ rᵢ·e^(−λᵢt), with rᵢ = K23·(pᵢ + c) / (D′(pᵢ)·V3), pᵢ = −λᵢ.
2. **Erlang-5 input.** Convolving with the Erlang(5, k) density gives, per pole, h(λ,t) = (k/(k−λ))⁵ · [e^(−λt) − e^(−kt)·Σ_{j<5} ((k−λ)t)ʲ/j!]. **Numerics:** when |(k−λ)t| < 1.5 the bracket cancels; use the equivalent tail form e^(−kt)·Σ_{j≥5} xʲ/j! (x = (k−λ)t). The tail form is also required to avoid overflow when λ > k (the fast liver pole is about 36 /h against k = 9.1 /h; the first version of the prototype returned NaN at t = 48 h until this was fixed). Guard: if the cubic has no three real roots (should not happen) fall back to the slow matrix exponential or refuse the fit.
3. **Concentration after several doses** = sum of single-dose responses (history mode).
4. **Exact steady state** for equal doses every τ: the exponential terms sum geometrically, f·rᵢ·e^(−λᵢt)/(1−e^(−λᵢτ)); the Erlang polynomial term decays as e^(−kt) with kτ ≈ 109, so only the current dose contributes. No "30 prior doses" loop is needed (tacrolimus uses `ssNDoses: 30`).
5. Whole-blood concentration = Ht·(Bmax·Cp/(Kd+Cp) + Kns·Cp) + (1−Ht)·Cp at each sample's own Ht (nonlinear in Cp, so it is applied after the plasma curve, as `toObs` does for tacrolimus).

### 3.4 Exposure endpoints (what the app reports)

Steady state of the current regimen, per posterior draw: the **trough** (concentration at t = τ) and the **AUC0-τ normalised to 12 h**, each as
- **actual**: whole blood at the patient's haematocrit (that of the latest sample; patient field if none), and
- **corrected**: whole blood at Ht 0.38 from the same plasma curve (Eq. 3).

The whole-blood AUC needs the time integral of the nonlinear transform: trapezoid on a grid. A grid step of **0.25 h gives 1.6·10⁻⁵ relative error** (0.5 h: 1.3·10⁻³; 0.1 h: 1.3·10⁻⁷; 0.05 h: 8·10⁻¹⁰), because the curve is periodic; 49 points per draw is enough. Plasma AUC is analytic (§3.2) and can be used as an internal consistency check.

### 3.5 Reference numbers (matrix-exponential oracle, 1.5 mg twice daily, steady state, typical patient)

| Prednisolone | Ht | plasma trough µg/L | whole-blood trough actual | trough at Ht 0.38 | AUC0-12 actual | AUC0-12 at Ht 0.38 | plasma AUC | trough corrected/actual |
|---|---|---|---|---|---|---|---|---|
| < 20 mg | 0.25 | 0.9236 | 3.1253 | 4.2702 | 58.050 | 79.264 | 17.2533 | 1.3663 |
| < 20 mg | 0.33 | 0.9482 | 3.9313 | 4.3833 | 71.118 | 79.279 | 17.2533 | 1.1150 |
| < 20 mg | 0.38 | 0.9654 | 4.4620 | 4.4620 | 79.289 | 79.289 | 17.2533 | 1.0000 |
| < 20 mg | 0.45 | 0.9922 | 5.2465 | 4.5847 | 90.733 | 79.303 | 17.2533 | 0.8739 |
| < 20 mg | 0.50 | 1.0136 | 5.8412 | 4.6826 | 98.911 | 79.313 | 17.2533 | 0.8016 |
| ≥ 20 mg | 0.38 | 0.6372 | 2.9540 | 2.9540 | 55.292 | 55.292 | 11.9814 | 1.0000 |

Check: the typical trough of 4.5 µg/L at 1.5 mg twice daily matches the cohort's mean C0 of 5.1 µg/L. The prednisolone effect is large (exposure −30 %), so the field must be required and visible. These numbers are not yet cross-checked against NONMEM (§9); until then they validate the algorithm, not the transcription of the model.

### 3.6 Estimation settings

- Etas: CLINT, V3, FU (3 dimensions, diagonal Ω, prior variances 0.118, 0.401, 0.0009). With trough-only data CLINT (hence the AUC) is informed, V3 is not: expect high shrinkage on V3; the "information gained" display should show it honestly.
- Likelihood: `SIGMA.LOG = sqrt(0.0957)`; `makeOfv` already handles log error together with a `toObs` transform (both exist in `src/bayes.js`); check the diagnostics residual legend for the log case.
- MCMC: random walk Metropolis scale min(1, 2.38/√d) as now; 3 dimensions and a very cheap likelihood: start at 400 000 iterations (tacrolimus uses 800 000 for ≤ 7 etas) and let the calibration (§9) decide; per-chain seeds so the worker pool applies (`perChainSeeds: true`). The convergence bar (R̂ < 1.01, ESS ≥ 400) stays.
- The dose explorer (`doseScan`) works unchanged through `custom.exposure`; PK is linear in dose, so the AUC scales exactly with dose and the trough almost exactly (only the weak saturation of binding).

### 3.7 What the intervals contain

M3 has **no occasion (day-to-day) effect**; the larger residual error (SD 0.31 on the log scale, against 0.18 in Model 1) takes its place. Reported steady-state values are therefore the patient's typical level with parameter uncertainty only. A future single measurement will scatter around it by more than the interval shows (the paper's own accuracy for a future value: trough MAPE about 26-30 %, AUC about 11-13 %, §2). State this in the text with those numbers, not with a made-up factor.

---

## 4. HTML/JS coder: how to build it (fast, responsive, no regressions)

### 4.1 Shape of the change

New spec `src/everolimus.js` (registered as `M.drugs.evr`, same pattern as the `SPEC` and `SPEC.custom` blocks at the end of `src/tacrolimus.js`), new texts file `src/texts_evr.js` (or generalise `texts_tac.js`), small generalisations in `ui.js`, `bayes.js`, `diagnostics.js`, `parallel.js`, `build.mjs`, `index.html`, `tools/verify_model.mjs`. Do not copy-paste the whole of `tacrolimus.js`; reuse by importing shared helpers only if it does not touch tacrolimus numbers (V16b), otherwise duplicate the few small functions.

### 4.2 Hooks the engine expects from `spec.custom` (from tacrolimus; implement all)

`constants`, `etaNames` (['CLINT','V3','FU']), `omega` (diagonal), `indivParams(wt, age, renal, extra, eta, drug, form, mix)`, `simulate(doses, times, p, {ss})` (closed form of §3.3, incl. exact steady state), `prepare({extra, wt, doses, obs, steadyState})` (returns `extra` with `nOcc: 0`, converted observations, `hctReport`), `exposure(draws, ctx)` (trough and AUC per draw, actual and corrected, trapezoid on `ctx.grid`), `reportExtra`, `normExtra` (range checks, errors in plain words), `toObs(cpPlasmaModel, hct)` (blood transform), `fromModel`/`fromModelAuc`/`toModel` (identity: LC-MS/MS only), `doseToEngine` (mg → µg, ×1000), `constants.HCT_REF = 0.38`.
Spec fields to set (see `SPEC` in `tacrolimus.js`): `id:'evr'`, `label`, `article`, `backgroundLabel:'Everolimus background'`, `units:{conc:'µg/L',auc:'µg·h/L',dose:'mg',concAlt:'ng/mL'}`, `windowOptional:true`, `perChainSeeds:true`, `mcmcScale`, `mcmcIters(dim)`, `SIGMA:{LOG:0.3094}` (not `PROP`), `requiresWt:false` and `covariateWeight:false` (no weight; see how MPA hides it), `wtMin/wtMax` unused, `ssIntervalDefault:12`, `intervalRange:{min:10,max:14,text:'twice-daily everolimus (about 12 h between doses)'}`, `dose:{min:0.25,max:5,...}` (cohort range 0.5-5.0, smallest tablet 0.25 mg), `obsValMin:0.5, obsValMax:60` (assay range of the source, LLOQ 0.5, ULOQ 50), covariates (§7), `windowDefaultLo/Hi:null` and `troughDefault*:null` (the engine never applies a hidden window), `windowStandard`, `windowSets`, `assumptions[]`, `info`, `samplePeak`, `windowHint`.
`SPEC.custom` assembly and `M.drugs.evr = SPEC` at the end, exactly like tacrolimus.

### 4.3 Generalisations that are required (found by reading the code)

1. **`isTac()` in `ui.js` means "this drug has custom hooks"** (`!!(s && s.custom)`), used at 14 places. Everolimus would silently get tacrolimus behaviour (weight field forced, CYP3A5, assay choice, CMIA text, "tacrolimus" dose labels, `ECU.tacText`). Replace by per-drug flags on the spec (for example `spec.ui = {troughWindow:true, hctPerSample:true, weight:false, predMode:'flag', assayChoice:false}`) and a text registry `ECU.drugTexts[id]` instead of `ECU.tacText`. Keep the tacrolimus output byte-identical (a test that renders both drugs' key strings before and after is cheap insurance).
2. **Tacrolimus literals in shared strings:** "corrected to haematocrit 0.35" appears in `src/texts_tac.js`, `HELP_TAC`, `DRUG_TEXT.tac` and the spec's `assumptions`; for everolimus build the sentence from `spec.custom.constants.HCT_REF`. `ui.js` line about `M.spec('tac').custom.assays.cmia` is tac-only (assay text); `tacDoseNote`, 'Dose (mg tacrolimus)'.
3. **`src/parallel.js`:** `SOURCES = ['src/version.js','src/model.js','src/tacrolimus.js','src/bayes.js']` builds the worker from the page's own inlined scripts. **Add `src/everolimus.js`** (and keep the order: model.js before drug files, bayes.js last) or the workers will not know the drug and the fit silently falls back to one thread. `build.mjs` `FILES` needs the new files too. There is a test that the pool really runs (`parallel: eight chains on a pool...`); add the everolimus equivalent.
4. **`tools/verify_model.mjs`:** the tacrolimus block (search for `tac.windowOptional`) checks hook presence, units, `SIGMA.PROP > 0`, covariates, `windowOptional`; add an everolimus block (`SIGMA.LOG > 0`, etaNames length 3, windowSets well-formed, `HCT_REF` 0.38).
5. **`bayes.js` `runFit` custom branch** uses `custom.prepare`, `custom.exposure`, `custom.fromModel/AuC`, `custom.constants.HCT_REF`, `extra.nOcc`; it should work unchanged. Check `fit.nOccasions` (0) and the tacrolimus-only "more sampled days than the cap" note (`nSampledDays`) do not mis-fire (`nSampledDays` undefined → no note).
6. **Fits without samples are allowed (D5).** The engine and `validateRun` must accept a run with no concentration for this drug (population forecast: etas at 0, intervals from the prior). Check that the population-forecast path (`hasObs: false`, prior-only draws, status badge, "information gained" display) works with 3 etas and the log-error model, and add a test.
7. `inputProblems(spec, input, userDoses, ssMode)` already reads `spec.obsValMin/Max`, `spec.dose`, `spec.intervalRange` and covariate ranges: fill them in, no code change expected.
8. **Session files:** export/import carry `drug` and `extras`; add the new covariate ids; old files must still import (tested for MPA and tacrolimus; extend).
9. Drug select (`index.html`): add `<option value="evr">Everolimus (adult kidney)</option>`; keep names short (the select is narrow on phones). The drug switch already resets windows and applies `windowStandard`.

### 4.4 Performance budget and responsiveness

- Likelihood cost target ≤ 1 µs per sample per dose (measured 0.4 µs for the steady-state closed form including parameter build). Avoid allocating objects in `indivParams`/`simulate` (use positional etas and cached name lists as in the tacrolimus optimisation; `Object.assign` copies were 71 % of tacrolimus fit time before the fix).
- Expected fit time: a three-sample steady-state fit well under 1 s in one thread (3 etas); worker pool brings little for such fits (start-up 0.1-0.2 s); keep the 10 s watchdog and in-process fallback as they are.
- The posterior-predictive step (32 000 draws × 49 grid points × cubic roots) is the main cost: compute the poles once per draw and reuse them for the whole grid (one `cpSS` call per grid point costs a few exponentials). Estimated 1-2 s; measure it.
- Cancel button, progress repaint (MessageChannel yield), hidden-tab behaviour: already generic; do not bypass `prog()` in new loops.
- No new dependencies; keep the single-file build below about 350 KB.

### 4.5 Tests to write (red-first), in a new `tests/test_everolimus.js` registered in `package.json` `test`

Use the structure of `tests/test_tacrolimus.js` (harness, `fitCase`, sabotage records). Minimum set:
1. spec registered, units, citation, `SIGMA.LOG`, no hidden window default, windowSets well-formed.
2. Closed form vs matrix exponential vs RK4 (copy the oracles from `tools/evr_prototype`) at the §3.5 grid, rel. error ≤ 1e-8; plasma AUC = Dose/(CLINT·FU) within 1e-6.
3. Algorithm guards: small-x tail form (t = 0.005 h), λ > k overflow case (t = 48 h, 200 h), three-real-roots guard.
4. Blood transform and Eq. 3: corrected = same plasma at Ht 0.38; corrected AUC nearly Ht-invariant; corrected/actual trough ratios from §3.5.
5. Ht invariance end to end: samples generated from one plasma curve at Ht 0.25 and 0.45 give the same corrected exposure within Monte Carlo tolerance (tacrolimus test V19 is the template).
6. Prednisolone choice: "20 mg/day or more" multiplies CLINT by 1.44, "less than 20 mg/day" does not; exposure ratio 1/1.44; the choice is required (no default); a run without it is refused with a plain message.
7. `inputProblems`: dose, concentration, interval (once daily refused), Ht as percentage refused, missing prednisolone choice refused; a run with no sample is accepted (population forecast, D5).
8. Fit recovers known truth (simulation-recovery quick version) and is deterministic with a seed; regression record `tests/evr_regression.json` written by a `tools/record_evr_regression.mjs` like `record_tac_regression.mjs`.
9. Worker pool equals in-process draws for everolimus; fallback tests.
10. Copy tests: texts name the right drug, carry no MPA/tacrolimus wording, no dose advice, no "not validated" caveat, no em-dash, `HCT_REF` appears in the corrected-value sentences.
11. V16 and V16b still pass (already in the suites).
Sabotage list to run after the tests are green (each must turn the suite red): wrong Ht reference, QHP without (1−Ht), prednisolone factor, KA formula (5/MAT vs 1/MAT), missing FU eta, steady-state geometric term, grid transform applied to the wrong draw, windows applied to the wrong chain.

---

## 5. UX designer: plain, direct, learnable without training

**Principle:** the second and third drug should feel like the first. Everything a clinician must type is a number they already have on the lab and prescription; nothing is jargon.

**Card 1 (Patient & covariates) for everolimus shows only four things:**
1. Drug (select).
2. **Haematocrit (L/L)**, with the hint "e.g. 0.38, not 38". It is required; it also fills each new sample's haematocrit (as for tacrolimus).
3. **Prednisolone**, a required choice with two options: "Less than 20 mg/day, or none" and "20 mg/day or more" (no preselected option, so the choice is deliberate). A quiet line under it explains: "At 20 mg/day or more this model assumes about 30 % lower exposure for the same dose."
4. A fixed line, not a field: "Concentrations must come from an LC-MS/MS assay." (D7). No weight, height, sex, age, genotype or assay choice; do not show fields that are not used (the weight field is already hidden for MPA).

**Dosing and samples card:** same as tacrolimus: Full schedule or Steady state; dose in mg per administration; interval defaults to 12 h; sample time offsets; per-sample haematocrit. Trough plus a sample 1-3 h after dose is the best design; say it in one sentence under the table (the paper's profiles were troughs and 1-6 h samples). **No "avoid the first 45 minutes" note** (that was tacrolimus's lag time; M3 has none).

**Results (identical layout to tacrolimus, so users learn it once):** two rows, AUC and trough. Each shows the value as measured (large) and a quieter line "corrected to haematocrit 0.38", with the 5-95 % interval and, if a window is set, the probability in/above/below the window for **both** lines. Section note, one sentence: "Haematocrit changes what a blood sample reads. The corrected value shows the same drug in plasma as it would read at a standard haematocrit of 0.38." No caveat about validation (owner decision). Status line in plain words ("Fitted to this patient's 2 samples").

**Windows:** the card shows the trough window prefilled with the standard (3-8 µg/L), the AUC window empty with its hint "No AUC target is given in the consensus; add one if your protocol has it". The Everolimus background dialog lists the two trough sets (with CNI 3-8, without CNI 6-10), each with a "Use this window" button, same blocks as tacrolimus. **The user has to know whether the patient is on a CNI**: the dialog title says it ("Pick the set that matches the patient's co-medication"); the app does not guess.

**Required-input behaviour:** the run button explains what is missing in one sentence (for example "Choose the prednisolone dose group."). Messages name the unit and the fix, like the tacrolimus ones (`inputProblems`).

**Copy rules:** short sentences; the drug name wherever a number could be confused ("mg everolimus"); no em-dashes; the same few words for the same thing everywhere (trough, AUC, window, corrected); the no-advice sentence only in the four places where it matters (explorer result, report, About, Getting started). New texts need entries in the per-drug registry: background, getting started (at most six steps), About sections, chart note, how-to list, help tooltips, report.

**Responsive:** reuse the existing blocks (`.winset` for window sets); nothing new wider than the phone card; test at 375 and 320 px and in the narrow pane (the window grid for tacrolimus needed horizontal scroll at about 300 px; everolimus has no grid).

---

## 6. Clinical pharmacologist: scope, safety, usefulness

**Indication and scope (say it on screen):** adult kidney transplant recipients on **twice-daily** everolimus, with reduced-exposure CNI (trough window 3-8 µg/L) or without CNI (6-10 µg/L). Not covered: cancer and TSC indications (different, higher trough targets of 12-20 µg/L in the consensus table), children, liver/heart/lung, once-daily dosing.

**Why two endpoints:** haematocrit is highly variable after transplantation and with anaemia on everolimus; in the paper the haematocrit-corrected trough or AUC differed from the measured one by more than 20 % in about one occasion in seven, up to +31 % at low and −21 % at high haematocrit. Reporting both lets the clinician see when haematocrit, not clearance, explains a reading. The corrected trough at Ht 0.25 reads 37 % higher than the measured one, at Ht 0.50 20 % lower (§3.5).

**What the model needs and what is missing:** needs a measured concentration with its haematocrit, the prednisolone choice (below or at/above 20 mg/day), the regimen. Missing from the model: ciclosporin co-medication (inhibits everolimus metabolism by about 50 %), other CYP3A and P-gp inhibitors or inducers, liver function, food, adherence, time after transplantation (no first-days effect modelled; accuracy was reported for ≤ 6 and > 6 months separately). **Interactions are not asked for in the app** (owner decision); the About text says what the model leaves out.

**Expected accuracy (put these numbers in About, they are the honest claim):** predicting a *future* trough from a previous sample: bias +13.5 % and imprecision 30 % in the first 6 months, +6.3 % and 26 % later; predicting the AUC: −7 % and 11 % early, +0.1 % and 12 % later; about 70 % of troughs within ±30 %. A prediction without any sample is allowed (D5) but is far less accurate (AUC over-predicted by about 43 %, trough MAPE about 32 %): the About text states those numbers, and the results of a no-sample run carry the existing "Population forecast, no measurements entered" badge.

**Use at the bedside:** the trough remains the consensus's TDM metric (the PK is linear and C0 tracks the AUC); the AUC is a model-based extra, useful when haematocrit is far from usual or when a trough looks off. There is no AUC target in the consensus, so AUC probabilities appear only if the user sets a window. The dose explorer shows the steady state of one candidate dose (linear PK: the AUC scales with dose, the trough nearly so); it never recommends.

**Sampling guidance for the About/Background text:** trough just before the dose, optionally plus one sample 1-3 h after; the model uses whole-blood EDTA LC-MS/MS values; immunoassays are not interchangeable (consensus), enter LC-MS/MS values only; enter the exact times and the haematocrit of the same day.

**Safety checks the app should run (add to `inputProblems`):** interval outside 10-14 h; dose outside 0.25-5 mg per administration; concentration outside 0.5-60 µg/L (below the quantification limit: leave it out); haematocrit as a percentage; haematocrit outside 0.10-0.65 L/L; a sample after the latest dose in steady-state mode; a missing prednisolone choice (a missing sample is not an error, D5).

---

## 7. Covariate list and extras (for `normExtra` and the form generator)

| id | type | range | required | used for |
|---|---|---|---|---|
| `hct` | number, L/L | 0.10-0.65 | yes | PK (hepatic plasma flow) and default for each sample |
| `predHigh` | choice (`'low'` / `'high'`) | none | yes, no default | `'high'` → CLINT ×1.44 (NONMEM `STUDY.EQ.4`) |
| `assay` | fixed (LC-MS/MS) | none | no field | constant `'lcms'` so shared code keeps working |

Per-sample `hct` goes with each observation (transform only). No `wt`, `ht`, `sex`, `cyp3a5`. Check how the form generator in `ui.js` (`renderDrugAndCovariates`, `extraCovariates`, `M.covariateFields`) builds fields from `spec.covariates` so no weight is forced (search `ui.js` for `wtField`: today it forces the weight field for every drug with custom hooks).

---

## 8. Window sets to ship (from the consensus; no AUC)

| id | label | trough | AUC | grade/basis |
|---|---|---|---|---|
| `evr-cni` (standard) | Adult kidney, with reduced-exposure CNI | 3-8 µg/L | none | consensus kidney recommendation 1 (p. 16), Table 1 |
| `evr-nocni` | Adult kidney, without CNI | 6-10 µg/L | none | Table 1 (refs 103-105 of the consensus) |

Default behaviour as for tacrolimus: `windowStandard` fills the trough fields when the drug is chosen; the AUC fields stay empty; both are editable; a cleared window means intervals without probabilities. The background dialog says that the consensus gives no AUC target and that the corrected value uses the same windows. Add the source analysis file `docs/SOURCE_ANALYSIS_EVR_CONSENSUS_ZWART.md` (paraphrase, page references, no long quotes) in the style of `SOURCE_ANALYSIS_BRUNET_2019.md`.

---

## 9. Verification plan (the part that makes it trustworthy)

1. **Oracle tests** (§4.5): matrix exponential and RK4, plasma AUC identity.
   **Structural NONMEM 7.6 check: DONE (3 October 2026).** `tools/nonmem_verify/evr/run_evr.sh` (needs `~/nm76/run/nmfe76`, runs in a few seconds). Control stream `struct_evr.mod` is `model3.ctl` with the etas supplied as data and the virtual AUC compartments dropped; data and app-side predictions come from `make_evr.js` (uses the verified closed form), comparison in `compare_evr.js`. Result:
   - Steady state (SS=1, II=12; 24 subjects, 312 predictions) and 7-day histories with a dose change (16 subjects, 272 predictions), constant Ht 0.22-0.52, prednisolone flag on and off, etas from 0 to ±1.5 SD: **closed form vs NONMEM, whole blood and plasma, max relative difference 4.5·10⁻⁹ to 4.8·10⁻⁹** (same level as tacrolimus's 4.7·10⁻⁹). This also fixes the units: NONMEM (mg, mg/L) and the app (µg, µg/L, constants ×1000) are the same model.
   - **Time-varying Ht (12 subjects, Ht moving by 0.03-0.12 between days):** NONMEM matches exact piecewise propagation **using the Ht of the record at the END of each interval** (3.7·10⁻⁹); using the start record's Ht is off by up to 2 %. The app's one-Ht approximation (PK at the latest sample's Ht, each sample's own Ht for the blood transform) differs from NONMEM in the predicted sample concentrations by mean 1.0 %, max 6.2 % overall: ΔHt 0.03 gives max 0.9 %, ΔHt 0.05 max 2.7 %, ΔHt 0.08-0.12 max 2.7-6.2 % (mean 0.7-1.9 %). The reported steady-state exposures use the latest Ht and are not affected; the approximation only touches how earlier samples are predicted during the fit. Small beside a residual SD of 31 %.
   - **Finding about the published control stream:** `COMP=(TRAN)` is declared four times with the same name in the ESM code; **NMTRAN 7.6 refuses it (error 52)**. The check renames them `TRAN1`-`TRAN4`. Worth correcting if the supplement is ever updated.
   - Fixtures for a future app test (same pattern as the tacrolimus one): `tests/nonmem_evr_struct.csv` and `tests/nonmem_evr_struct.tab` (IPRED and CPL in mg/L, multiply by 1000 for the app's units).
2. **NONMEM 7.6 cross-check** like the tacrolimus one (`tools/nonmem_verify/tac/` is the template: structure check on about 40 simulated subjects, then POSTHOC against the app's MAP). Control stream is `tools/nonmem_verify/evr/model3.ctl` (verbatim from the ESM; it ends with `MAXEVAL=0 ... POSTHOC` so it evaluates fixed parameters). Lessons learned there: dataset records must be in time order, a pre-dose observation goes before a same-time dose, `PRED` is a reserved NONMEM name, covariates (HT, STUDY flag) must be on each record; convert units consistently (the code works in mg and mg/L; the app in µg and µg/L). The structural part is done (below). Still to do: the POSTHOC comparison (the app's MAP against NONMEM's empirical Bayes estimates on simulated patients, as for tacrolimus), once the engine exists.
3. **Calibration (simulation-recovery):** `tools/calibrate_storset.mjs` is the template (9 cells × 100 patients, coverage of the true steady-state AUC and trough, actual and corrected, convergence). Simulate with the **log-normal residual** (not proportional), cells covering trough only, trough + 1-3 h, and Ht low/normal/high. Acceptance as before: coverage 85-95 %, convergence ≥ 98 %. Record results in `docs/CALIBRATION_RESULTS_EVR.md`.
4. **Regression records** `tests/evr_regression.json` after the numbers are final; V16 and V16b untouched.
5. **Browser pass** in the visible pane: full session (steady state), history mode, windows, explorer, report, export/import, drug switch, cancel, phone width, narrow pane. Hidden panes run fits several times slower; time only with the pane visible.
6. **Human review** is still the open item for the whole app (`VERIFICATION_TEAM.md`); add an everolimus addendum.

---

## 10. Implementation sequence (each step ends with `npm test` and `verify_model` green)

1. Copy `tools/evr_prototype/*` ideas into `src/everolimus.js` (`indivParams`, `simulate`, `exposure`, `toObs`, `prepare`, `normExtra`); write tests 1-4 of §4.5 first (red), then implement (green).
2. Spec fields, `verify_model` block, `build.mjs` FILES, `parallel.js` SOURCES; engine run from Node with a fixture patient (`fitCase`-style); regression record.
3. Generalise `isTac()` and the text registry in `ui.js`; prove tacrolimus output is unchanged (string/DOM snapshot test) and V16/V16b green.
4. Everolimus texts and window sets; copy tests; dialog and drug switch in the browser.
5. NONMEM cross-check files and run; fix what it finds.
6. Calibration run (in the background, about half an hour); update the iteration budget if needed.
7. Docs: release notes (1.4.0), README (test counts, open items), source analysis, calibration results, performance numbers, memory notes; bump version in both places; rebuild.
8. Final browser pass; summary to the owner; **do not publish** without the owner's go-ahead (the repo and live page still carry 1.1.1).

---

## 11. Risks and open questions

- **Unit reading of the binding constants:** settled. The code is dimensionally consistent in mg and mg/L (Bmax 0.96425 mg/L = 964 µg/L); NONMEM and the app agree to 5·10⁻⁹ with the ×1000 conversion, and the typical trough of 4.5 µg/L at 1.5 mg twice daily matches the cohort mean of 5.1. The only remaining possibility would be data in other units than the code assumes, which the paper's concentrations rule out.
- **What `STUDY.EQ.4` means** for the prednisolone effect (D6). If it is a study artefact, the field should be removed or relabelled.
- **Time-varying Ht** (D3) and **definition of the corrected AUC** (D2): small effects, but they decide whether the NONMEM identity is exact.
- **Intervals understate single-day scatter** (no occasion effect): handled by text (§3.7), not by the model.
- **First-fit quality with one trough:** V3 is not identified by a trough; the AUC (CLINT·FU) is. The "information gained" display must not claim more.
- The ESM code in the PDF text extract lost a line in Model 1 (a stray `ENDIF`); M3 is clean apart from the duplicate compartment names (§9). Compare `model3.ctl` with the PDF once by eye.
- Performance of the posterior-predictive step is estimated, not measured.

**Author queries: all closed by the owner (the last author).** Corrected AUC and trough: Eq. 3 on the same plasma curve (D2). Prednisolone: binary, high at 20 mg/day or more (NONMEM `STUDY.EQ.4`), no effect below, entered in the interface (D6). Absorption structure (Erlang-5), residual error (everything the model does not cover, assay and day-to-day variability included) and scope (twice-daily adult kidney recipients at any time after transplantation) were confirmed earlier. The model is used exactly as coded.

---

## 12. Appendix: files created for this hand-off

- `docs/HANDOFF_EVEROLIMUS_M3.md` (this file).
- `tools/evr_prototype/evr_proto.js`: reference implementation (8-state matrix exponential, RK4 oracle, blood transform, steady-state exposure). `node tools/evr_prototype/evr_proto.js` prints the §3.5 style numbers.
- `tools/evr_prototype/evr_closed.js`: the verified closed form. `node tools/evr_prototype/evr_closed.js` prints the worst relative error (2.3e-9, dominated by the trapezoid in the AUC identity) and the timing.
- `tools/nonmem_verify/evr/model3.ctl`: Model 3 control stream from the ESM, verbatim (does not run as printed, see §9).
- `tools/nonmem_verify/evr/{struct_evr.mod, make_evr.js, compare_evr.js, run_evr.sh}`: the structural NONMEM check (run it with `bash tools/nonmem_verify/evr/run_evr.sh`).
- `tests/nonmem_evr_struct.csv`, `tests/nonmem_evr_struct.tab`: its dataset and NONMEM output, kept as fixtures.
- Nothing in `src/`, `index.html` or the version changed; `tests/` only gained the two fixture files (no test uses them yet).
