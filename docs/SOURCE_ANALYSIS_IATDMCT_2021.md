# MPA TDM — Source analysis: IATDMCT consensus report (Bergan 2021)

**Attachment analyzed:** `personalized-therapy-for-mycophenolate-consensus-report-by.pdf`
**Source:** Bergan S, Brunet M, Hesselink DA, et al. Personalized Therapy for Mycophenolate:
Consensus Report by the International Association of Therapeutic Drug Monitoring and Clinical
Toxicology. *Ther Drug Monit.* 2021;43(2):150–197.

**Verdict: highly useful.** The report is the natural evidence source for several open
decisions in `plan.md`, and it independently validates the app's architecture. It is **not**
a PK model — it contains no population parameters (THETA/OMEGA/SIGMA); the model file is
still required before forecasting can be enabled.

---

## 1. What it directly provides

### 1.1 Therapeutic window (fills the largest open item)

Recommended target **AUC0–12h = 30–60 mg·h/L** (grade B, II) — a window with an explicit
lower **and** upper bound, matching the app's two-bound design:

| Population / context | Target | Notes |
|---|---|---|
| Adult KTR, MMF + CNI ± steroids | AUC0–12h 30–60 mg·h/L | B, II — primary default |
| Pediatric KTR | AUC0–12h 30–60 mg·h/L | B, II |
| Liver transplantation | 30–60 mg·h/L | legitimated by Saliba RCT |
| Heart transplantation | AUC0–12h > 36 mg·h/L or C0 > 2.0 mg/L | C, III — different bound structure |
| Lung transplantation | none | no evidence-based target |
| HSCT (adult allo-BMT) | **AUC0–24h** > 30 mg·h/L | different metric/interval |
| Pediatric HSCT | Css 1.7–3.3 mg/L (≈ AUC0–8h 14–26 for Q8h) | single study, C, III |

Consequences for the app:
- Set `windowDefaultLo = 30`, `windowDefaultHi = 60`, `windowHint` citing Bergan 2021 (B, II).
- Contexts beyond kidney/liver must not silently reuse 30–60: heart uses a one-sided target;
  HSCT uses AUC0–24h; lung has none. The **editable** window with a visible source line is the
  right mechanism; the interval label is already dynamic.
- Targets apply to the **first posttransplant year**; thresholds are time-dependent
  (≈35 → 41 mg·h/L over time; APOMYGRE used a single 40 mg·h/L target). A context note is needed.

### 1.2 Trough has no target (validates a core design decision)

Consensus: "no evidence in favor of using MPA C0 to dose adjust MMF or EC-MPS"; C0 correlates
poorly with AUC (enterohepatic-rebound secondary peaks). The app's trough-informational-only
framing is consensus-endorsed. No change needed.

### 1.3 MAP-Bayesian estimation preferred (validates the engine approach)

Consensus reasons for preferring MAP-BE over multilinear regression, mapped to the app:
1. flexible with respect to sample timing → app accepts arbitrary sample times;
2. not restricted to a 12-hour dosing interval → `intervalHours` is configurable;
3. allows visual inspection of the fitted profile superimposed on data → chart;
4. yields a CI for the AUC → posterior-derived 5–95% interval.

### 1.4 Limited-sampling guidance (for UI hints and docs)

- MMF: ≥2 concentrations minimum; most common 3-point LSS ≈ 20 min – 1 h – 3 h post-dose.
- EC-MPS: 3–4 or more samples; ≈ 1.5 h – 2 h – 4 h (± 6 h).
- Trough-only discouraged; 4-point LSS failed in >30% of EC-MPS patients when C0 was the
  highest sample.
- Validation requirement: any LSS/MAP-BE must be validated in a population separate from the
  training set, per indication and patient category.

→ "Getting started" text, sampling hints, and the validation document should reflect this.

### 1.5 Analytical method matters (exposed gap)

- Immunoassays overestimate MPA vs LC-MS/MS: EMIT +15% to +37.7%, PETINIA +6.3% to +33.5%,
  CEDIA +36.3%.
- Models and estimators are **assay-specific**; consensus advises using an estimator only with
  the analytical technique it was developed for.
- The app has an *error multiplier* but no *method* field. Suggested small change: an
  assay-method dropdown (LC-MS/MS, HPLC, EMIT, PETINIA, CEDIA, IMPDH assay), stored in the
  session, printed in the report, and compared against the assay the model declares.

### 1.6 Expected covariates (informs the model-ingestion checklist)

Recurring covariates in the MPA literature per the consensus: **albumin** (hypoalbuminemia →
higher free fraction and clearance), **serum creatinine / renal function**, **CNI
co-medication type** (cyclosporine vs tacrolimus markedly changes exposure),
**posttransplant period**, **weight** (pediatric dosing mg/kg or mg/m²); exploratory:
UGT1A8/1A9, ABCC2, ABCB1, SLCO1B3 pharmacogenetics; race/sex effects inconsistent.
→ The model-driven covariate UI already anticipates an arbitrary list; when the model file
arrives, the covariate review can check against this expected set.

## 2. Architecture items it confirms (no code change needed)

- Editable therapeutic window with lower and upper bound and a source line.
- AUC0–12h as primary metric with posterior uncertainty interval.
- Trough informational only.
- Model-driven covariate contract.
- No dose recommendation by the app (consensus leaves dosing to the clinician; note that
  APOMYGRE-style "dose to reach 40 mg·h/L" interventions are *trials*, not app behavior).
- Configurable interval (12 h default; HSCT uses 24 h or 8 h contexts).

## 3. Suggested small follow-ups (model-independent)

1. Populate `windowDefaultLo/Hi` (30/60) + `windowHint` citation in the MPA spec — even while
   `pending: true`, the window metadata can be prepared.
2. Assay-method dropdown + session/report fields (see 1.5).
3. Sampling-hint text per formulation (MMF vs EC-MPS; see 1.4).
4. Getting-started: note that trough-only sampling is discouraged.
5. Validation document framing: app-layer validation separate from model-layer validation
   (which inherits from the model's origin population/assay/indication).

## 4. Caveats

- **Not a substitute for the model file**: no parameters, no structural model.
- Copyright Wolters Kluwer: cite; quote only short recommendation statements.
- 30–60 mg·h/L is transplant / MMF / CNI-specific; non-transplant autoimmune use lacks
  evidence — keep the window editable and sourced.
- RCT evidence for routine AUC-guided dosing is mixed (meta-analysis: not routine for all
  KTR; consider high-risk patients) — the report disclaimer should not overclaim benefit.
