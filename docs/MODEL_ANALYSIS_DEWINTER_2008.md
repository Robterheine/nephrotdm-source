# Model analysis — de Winter et al. 2008 (the candidate MPA model file)

**Source:** de Winter BCM, van Gelder T, Glander P, Cattaneo D, Tedesco-Silva H, Neumann I,
Hilbrands L, van Hest RM, Pescovitz MD, Budde K, Mathot RAA. *Population Pharmacokinetics of
Mycophenolic Acid: A Comparison between Enteric-Coated Mycophenolate Sodium and Mycophenolate
Mofetil in Renal Transplant Recipients.* Clin Pharmacokinet 2008;47(12):827–838.

**Question assessed:** is this paper fully implementable as the app's MPA population model?
**Verdict: YES** — every number needed is published and bootstrap-validated; four bounded engine
extensions and three documented approximations stand between the paper and the app (§§ C–E).

---

## A. What the paper provides

**Population:** 259 renal transplant recipients (maintenance, 4–257 months post-transplant),
3764 concentrations, 392 PK profiles from 7 published + 2 unpublished studies. Mostly Caucasian;
72% of EC-MPS and 100% of MMF patients ciclosporin-co-treated (matches the 30–60 window's
evidence context, Bergan 2021).

**Structure (final model 4):** two-compartment, first-order absorption **with lag time**,
first-order elimination. Beat zero-order, Weibull, transit compartments and a double absorption
phase. **EHC (bile compartment) was tested and NOT retained** — no gallbladder compartment
needed. Parameters are CL/F, Q/F, V1/F, V2/F (bioavailability not identifiable).

**Final parameter estimates (with bootstrap medians, all in hours/litres — no unit conversion
needed; the app is hours-native):**

| Parameter | Estimate | IIV (CV%) | ω² (√ω² convention) | ω² (exact log-normal) |
|---|---|---|---|---|
| CL/F | 16 L/h | 39% | 0.152 | 0.142 |
| Q/F | 22 L/h | 78% | 0.608 | 0.475 |
| V1/F | 40 L | 100% | 1.00 | 0.693 |
| V2/F | 518 L | 490% | 24.0 | 3.22 |
| ka MMF | 4.1 h⁻¹ | 187% | 3.50 | 1.50 |
| ka EC-MPS | 3.0 h⁻¹ | (shared eta) | | |
| tlag MMF | 0.30 h | 11% | 0.0121 | 0.0120 |
| tlag EC-MPS evening | 9.04 h | 40% | 0.160 | 0.148 |
| tlag EC-MPS morning | **mixture**: 0.95 h (51%) / 1.88 h (32%) / 4.83 h (17%) | 8% within subgroup | 0.0064 | 0.0064 |

**ω² convention — an ambiguity to resolve (scrutiny finding S1).** The paper reports
"interindividual variability (%)" without stating whether CV = √ω²·100 (the NONMEM-era
shorthand) or the exact log-normal CV √(exp(ω²)−1)·100. For CL/Q/V1/tlag the two mappings
nearly coincide; for **ka (187%) and V2 (490%) they differ 2–7×** (ω² 3.50 vs 1.50; 24.0
vs 3.22). Recommendation: implement the √ω² convention (standard practice for this group
and era), document it in the model card, and list it as an author query. It is AUC-benign
(finding S3) *for rich sampling; with sparse data (trough only) it moves the reported interval width
by roughly 10 % and P(within window) by a few points — stated in the model card, see
`docs/METHODS_AUDIT_V101.md` F19*. *(Correction: an earlier draft of this table printed ka ω² as 35.0 — an
arithmetic slip; √ω² convention gives 1.87² = 3.50.)*

**Residual error:** log-transformed concentrations, additive on log scale, σ = 0.39
(≈ 41% proportional on the natural scale).

**Formulation dose conversion (user-confirmed contract):** since the PK parameters are for
MPA, all doses must be converted to **MPA-equivalent mg** — × **0.739** for MMF, × **0.936**
for EC-MPS. Verified against the paper's own Table II ("MPA dose (mg)"): EC-MPS median
674 = 720 × 0.936; MMF median 739 = 1000 × 0.739. ✓

**Dose-unit boundary (how the app must handle it):**
- The clinician enters doses **as prescribed, in product mg** ("MMF 1000 mg", "EC-MPS 720 mg") —
  that is what they know. The dose fields' labels follow the formulation select
  ("Dose (mg MMF)" / "Dose (mg EC-MPS)").
- Conversion to MPA mg happens **once, at dose ingestion** — the single commented
  conversion point, mirroring the hours rule (rule 3: no scattered multipliers anywhere
  else in `src/`).
- The **dose explorer** takes candidate doses in product mg too and converts identically;
  its "Candidate maintenance dose" cell shows the product dose with the MPA-equivalent in
  the sub-line.
- The session JSON and printed report record both (product dose and MPA-equivalent mg) so
  every number is reproducible from the file.

**Validation:** 1000 bootstraps (medians + 2.5–97.5th percentiles reported) + visual predictive
check. The app's `MODEL_VALIDATION` framing should note this is internal validation of pooled
data, not an external validation set.

**Covariates: NONE.** Ciclosporin co-treatment was the only covariate tested (on CL) — not
significant, not included. The covariate-rich model from the same group is van Hest 2006
(ref [30]: renal function, albumin, haemoglobin, CIC predose) — a possible later companion
model, not this one.

## B. Fit with what the app already has (built in v0.2–v0.5)

- **Hours-native engine** — the paper is in hours/L throughout; zero day-conversion (rule 3 untouched).
- **Two-compartment ODEs with ka depot: already implemented** (`simulate()` states y[0] central,
  y[1] peripheral, y[2] depot; oral/IV/bolus/infusion events).
- **N-eta MAP + MCMC with prior in the OFV** — supports the 6 continuous etas (CL, Q, V1, V2, ka, tlag).
- **AUC₁₂ normalization (v0.5.0)** — directly targets the paper's AUC0–12h world; troughs shown
  without target, which the paper's own data supports (C0↔AUC r² = 0.02 EC-MPS, 0.48 MMF).
- **Therapeutic window 30–60 (Bergan)** — the model population is the window's population
  (renal transplant, mostly CIC).
- **Formulation + assay fields already recorded** and printed in the report.
- **Error multiplier + recency weighting** — usable for the pooled-study assay caveat.

## C. Engine extensions required (bounded, none research-grade)

1. **Per-dose lag time (tlag).** The oral event currently enters the depot at dose time
   (`y[2] += amt` at `d.t`). Tlag is a dose-time offset: schedule the depot event at
   `d.t + tlag`. Per-dose tlag is decided at event-build time from formulation + clock hour:
   - MMF: 0.30 h (any time of day — no morning/evening difference found);
   - EC-MPS morning dose (≈06:00–18:00): the patient's mixture subgroup value;
   - EC-MPS evening dose (≈18:00–06:00): 9.04 h.
   The dose datetime already exists in the app, so morning/evening classification is derivable.
2. **Mixture tlag membership as a discrete Bayesian parameter.** The 3 morning-subgroup
   probabilities (0.51/0.32/0.17) are a categorical prior. Implementation: MAP evaluates all 3
   components (per candidate, pick best joint MAP); MCMC adds a Metropolis-within-Gibbs step
   that resamples the membership indicator from its conditional posterior given the data.
   This is the *correct* treatment — collapsing the mixture into one unimodal tlag would
   misrepresent the multimodal absorption that is EC-MPS's defining feature.
3. **Formulation is THE covariate — the select drives the model.** ka and tlag switch on
   the formulation covariate (categorical: MMF reference, EC-MPS effect — Eq. 3, p<0.001);
   doses are converted to MPA mg at ingestion per the dose-unit boundary above (×0.739
   MMF, ×0.936 EC-MPS — one conversion point, product mg in, MPA mg to the engine). The
   existing informational `pt-form` field is promoted to the model-driven covariate select
   in the covariate panel; dose labels/sub-lines follow it and show both units. Time-of-day
   (morning/evening) is a per-dose attribute derived from the dose datetime (S7).
4. **Log-scale residual likelihood (exact error model).** The paper's error is additive on
   ln(C). The current OFV is additive+proportional on the natural scale. Add a `SIGMA.LOG`
   mode: `(ln obs − ln pred)²/σ² + ln v` (and the M3 censoring term becomes
   `log Φ((ln LLOQ − ln pred)/σ)`). Small, exact; the alternative (PROP ≈ 0.171, ADD ≈ 0)
   is a documented approximation that distorts tails at low concentrations.

## D. Documented approximations (the paper does not provide)

1. **Full Ω covariance.** The text states a variance–covariance matrix was estimated, but only
   the marginal IIV% are published — off-diagonal correlations are NOT in the paper. The
   implementation must use a **diagonal Ω** and say so in the model card (or obtain the full Ω
   from the authors / the NONMEM control stream).
2. **Evening-dose tlag (9.04 h) was estimated indirectly** — from pre-dose points before the
   morning absorption started; no post-evening-dose profiles were collected. The paper itself
   flags this. Keep the value, flag the provenance in the model card.
3. **The covariate list is exactly one: formulation (categorical, MMF / EC-MPS).**
   The paper tested formulation as a covariate on every parameter (Eq. 3) and retained it
   on **ka and tlag (and the tlag IIV) only** — no difference in CL, Q, V1, V2. It also
   carries a dose-level timing attribute (morning vs evening, EC-MPS only — derived from
   the dose datetime, S7). Dose conversion (×0.739/×0.936) is *unit stoichiometry*, not a
   covariate effect — same CL applies to both products (S11).
   **Interface consequence** (per the standing rule "all covariates in the model appear in
   the interface"): the model-driven covariate panel contains exactly **one field — the
   formulation select (MMF / EC-MPS)** — which drives ka, the tlag structure, and the dose
   conversion. **Body weight is NOT a covariate here** (no allometric scaling in the source):
   with EXPO → 0 it has no effect, so the weight field is hidden by the model-driven panel —
   collect only what the model uses; note "absolute mg dosing, no weight effect" in the
   model card. Renal function, albumin, etc. are absent from this model (they live in the
   companion van Hest 2006 model) — the panel must not invent them.
4. **Assay basis not stated** — pooled data from 9 studies, bioanalysis not described in this
   paper; σ = 0.39 is large (consistent with pooling + likely immunoassay in some studies).
   Model card must carry "pooled studies, mixed assay basis — use the error multiplier for
   your local assay" (IATDMCT: models are assay-specific).

## E. Residual risks / numerical notes

- **Extreme ω²** on V2 (24) and ka (35) — enormous uncertainty, honest in the published model.
  With sparse LSS data these parameters will be prior-dominated (high shrinkage — the app's
  diagnostics will show exactly this, which is informative, not a defect).
- VPC shows a small systematic overprediction at 6 h (likely EHC not captured) — worth stating
  in the model card as a known limitation.
- The model was built with NONMEM's **first-order (FO)** method (FOCE did not minimize). For
  MAP-Bayesian individualization this is a provenance note, not a blocker.

## F. What the paper contributes beyond the PK model

- Its conclusion is the app's thesis: **for EC-MPS, limited sampling strategies are expected to
  be unreliable** (unpredictable absorption; C0↔AUC r² = 0.02) and **full AUC0–12h estimation —
  i.e. model-based Bayesian — is the way to TDM**. The app is built exactly for this.
- Confirms the no-trough-target design with data for both formulations.
- The 30–60 window's population is this model's population.

## G. Ingestion checklist (when the user says "go")

1. Fill the MPA spec: THETA (CL 16, Q 22, V1 40, V2 518, ka per formulation, tlag per
   formulation/time/mixture, dose conversion factors), ETA names (CL, Q, V1, V2, ka, tlag —
   layout per S5), OMEGA diagonal from IIV% (√ω² convention, S1), SIGMA (LOG mode, σ 0.39),
   EXPO → 0 (no allometry — model as published), **covariate list → [formulation
   (categorical MMF/EC-MPS)] — weight NOT a covariate: hide it; the panel is exactly one
   model-driven select**, morning/evening + mixture machinery, **ssNDoses → 30 (S2)**.
2. Engine: C1–C4 above **plus the spec-driven eta map (S5)**; MCMC gains the discrete
   membership step; diagnostics gain P(membership | data) (S4).
3. Tests: golden values from a deterministic simulation of the published typical parameters —
   and the dose conversion gives two clinically meaningful anchors (typical CL = 16 L/h,
   AUC = MPA dose / CL at steady state):
   - **MMF 1000 mg q12h** → 739 mg MPA → AUC₁₂ ≈ 739/16 ≈ **46.2 mg·h/L** (mid-window)
   - **EC-MPS 720 mg q12h** → 674 mg MPA → AUC₁₂ ≈ 674/16 ≈ **42.1 mg·h/L** (mid-window)
   Both land mid-window — the paper's own demonstration that the labeled regimens are
   exposure-equivalent, which the app must reproduce. These anchors also *detect* S2
   (with ssNDoses = 10 they read ~12% low). Red-first per rule 7b.
4. `node tools/verify_model.mjs` strict must pass; window stays 30–60 (Bergan) with the CIC
   context note; model card must state the maintenance-phase scope (S6), the ω² convention
   (S1), the diagonal-Ω approximation, and the mixed-assay caveat; version 1.0.0 candidate.

---

## H. Senior pharmacometrician scrutiny — implementation-critical findings

A second, adversarial read of the paper with the engine code open. Findings S1–S10, ordered
by impact on implementation.

**S1 — the ω² convention is genuinely ambiguous (and materially so).**
See the corrected table in §A. CV = √ω²·100 vs exact log-normal CV differ negligibly for
CL/Q/V1/tlag but 2–7× for ka and V2. Pick the √ω² convention (era- and group-standard),
document it, query the authors. Benign for AUC (S3).

**S2 — steady-state depth must rise from 10 to ≈30 doses.**
With V2 = 518 L and Q = 22 L/h, k21 = Q/V2 = 0.042/h and the terminal half-life is ≈ 40 h
(λβ ≈ 0.017/h; distribution is deep and slow). At q12h, λβ·τ ≈ 0.21, so 10 back-simulated
maintenance doses reach only ≈ 88% of true SS by the single-dose-tail argument. **Measured
during implementation (V12): the AUC deficit is 7.6% at 10 doses and 6.2% at 11 (audit F15 corrected the 4.4% first recorded here)** (not 12% — the slow phase
carries only ~60% of the AUC), still far outside the ±2% golden tolerance; at n=30 the
deficit is within tolerance. `ssNDoses = 30` shipped; the golden tests police it forever.

**S3 — AUC₁₂ is structurally robust to the entire absorption machinery.**
At true steady state, mass balance fixes the AUC over any full dosing interval at
F·Dose/CL — independent of ka, tlag and the mixture. The trimodal tlag matters for the
fitted curve shape, early LSS samples, and the trough — not for the headline AUC. Three
consequences: the ω² ambiguity (S1) is AUC-benign; weak mixture identifiability (S4) is
AUC-benign; and the golden anchors are robust (they test dose conversion + CL + SS depth,
the three things that can silently break).

**S4 — mixture membership will be weakly identified with sparse data.**
With a trough or 2–3 samples, P(membership | data) ≈ prior (51/32/17). That is honest and
AUC-benign, but the fit-diagnostics modal should display the posterior membership
probabilities so the clinician understands the fitted absorption curve.

**S5 — the eta layout is formulation- and time-of-day-specific, and the engine's current
eta map is hard-coded.** Disposition etas (CL, Q, V1, V2) and the ka eta are shared; tlag
etas are per class: one for MMF, one for EC-MPS morning (plus the discrete subgroup), one
for EC-MPS evening. The current `indivParams()` hard-codes e[0]→CL, e[1]→V1, applies **no
etas to Q, V2 or ka, and has no tlag** — so C2 must generalize the eta→parameter map to be
spec-driven (ETA names exist in the spec already). Also: every patient in the source data
was on ONE formulation; mixed MMF→EC-MPS histories were never modeled — support per-dose
formulation with shared subject etas, and document (or block) mixed histories.

**S6 — scope: maintenance-phase patients only.**
The model was built on patients 4–257 **months** post-transplant — stable maintenance. Early
post-transplant (the first weeks, where TDM matters most and where the 30–60 evidence is
strongest) is an extrapolation. The model card and About must say this explicitly; the
consensus already notes targets are time-dependent in year 1.

**S7 — the morning/evening boundary is our arbitrary choice.**
The paper never defines the clock-hour split (daytime profiles only; evening tlag inferred
indirectly from pre-absorption points). Implementation: 06:00–18:00 = morning dose, else
evening — documented, low sensitivity for typical BID schedules (08/20). Affects EC-MPS
only; MMF has no day/night difference.

**S8 — numerics: mild stiffness, one hot spot.**
Fastest constant ka = 4.1/h vs slowest k21 = 0.042/h (~100× spread) plus a 40-h terminal
phase. The adaptive RK at rtol 1e-6 handles this comfortably; the hot spot is the SS
reconstruction span (S2). Golden tests double as the numerical check.

**S9 — bioavailability is folded in, correctly.**
Parameters are CL/F, Q/F, V1/F, V2/F; dosing in MPA-equivalent mg with F fixed to 1 puts
AUCs on exactly the scale the 30–60 window was derived on. No separate F handling.

**S10 — error model and estimation provenance.**
σ = 0.39 additive on ln(C) (LTBS) maps exactly to the planned SIGMA.LOG mode, with M3
censoring as log Φ((ln LLOQ − ln pred)/σ). The paper used NONMEM's **first-order (FO)**
method (FOCE did not minimize) — for MAP-Bayesian individualization this is provenance,
stated in the model card, not a blocker. The 6-h VPC overprediction (unmodeled EHC tail)
is a known, documented limitation.

**S12 — EC-MPS absorption is 24h-periodic: morning- and evening-anchored AUC₀–12 differ
(discovered during implementation, by the golden anchors).**
MMF's lag is clock-independent, so its absorption pattern is 12h-periodic and every
12-hour window at SS carries exactly one dose (AUC = dose/CL per window — the clean
mass-balance anchor). EC-MPS is different: the evening dose's ~9 h lag lands its
absorption at clock ≈ 05:00, so the absorption pattern repeats with **24 h**, not 12 h.
Consequences, all measured at typical values (720 mg, subgroup 1, grid 96):
- morning-anchored AUC₀–12 ≈ **45.3** mg·h/L; evening-anchored ≈ **39.0**; the 24 h sum
  = **84.2 ≈ 2 × 674/16 = 84.25** (the exact invariant — closes to 0.06%);
- the therapeutic 30–60 target derives from **morning-dose 0–12 h profiles** (the source
  studies sampled daytime only), so an evening-anchored AUC₀–12 is not like-for-like;
- the app anchors at the most recent dose and **displays this caveat** (model card,
  EC-MPS sampling note). Auto-anchoring at the morning dose is a candidate v1.1 change —
  flagged for the verification team.

**S11 — the dose conversion (×0.739 MMF, ×0.936 EC-MPS) is exact stoichiometry, not a
modeling assumption — and it carries one expected surprise.**
The factors are molecular-weight ratios: MPA (C₁₇H₂₀O₆, 320.34 g/mol) / MMF (C₂₃H₃₁NO₇,
433.5 g/mol) = **0.7391**; MPA / mycophenolate sodium (C₁₇H₁₉NaO₆, 342.3 g/mol) = **0.9359**
— matching the paper's 0.739 and 0.936. Implications:
- The conversion is chemistry, not pharmacology: valid for any patient, population or
  assay; no uncertainty attaches to it.
- **The labeled "equivalent" regimens are NOT stoichiometrically equal, and the golden
  anchors must reflect that.** EC-MPS 720 mg → 674 mg MPA → AUC₁₂ ≈ 42.1, vs MMF 1000 mg →
  739 mg MPA → AUC₁₂ ≈ 46.2 — a ~10% gap at typical CL. The trials' "similar exposure"
  is an empirical equivalence within IIV noise, not mass equality. If a future test
  expects 46.2 for both formulations, it is the *test* that is wrong.
- Discipline (from the dose-unit boundary in §A): product mg in, one commented conversion
  at dose ingestion, MPA mg to the engine — full precision internally, both units recorded
  in session/report, no scattered multipliers anywhere in `src/` (same rule as hours).
- Display: dose tables and the explorer show the prescribed product dose with the
  MPA-equivalent as a sub-value, so the clinician never has to convert by hand and never
  sees an unexplained number.
