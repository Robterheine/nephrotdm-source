# Release notes: NephroTDM 1.4.0 (3 October 2026)

**1.4.0 adds everolimus** (Model 3 of Zwart et al., Clin Pharmacokinet 2021;60:191–203) as the third drug. MPA and tacrolimus numbers and texts are
unchanged (bit-identity records V16 and V16b, and a recorded snapshot of both drugs' UI text, all green). Not published: the repository and the live
page still carry 1.1.1. Research use only, as before. Plan and decisions: `HANDOFF_EVEROLIMUS_M3.md`; sources: `SOURCE_ANALYSIS_EVR_CONSENSUS_ZWART.md`;
evidence: `CALIBRATION_RESULTS_EVR.md`.

## What changes for the person using it

**A third drug: everolimus for adult kidney transplant recipients on twice-daily dosing.**
- Choose it in card 1. The patient card asks for two things only: the **haematocrit** (L/L) and the **prednisolone group** ("less than 20 mg/day, or none" or
  "20 mg/day or more", no preselected option). No weight, height, sex, age, genotype or assay choice; one fixed line says concentrations must come from LC-MS/MS.
- It reports the **steady-state AUC₀–₁₂ₕ and trough** of the current regimen, each with a 5–95 % interval, **as measured and corrected to a haematocrit of 0.38**
  (the whole-blood value the same plasma concentration would show at 0.38, Eq. 3 of the model paper).
- **Windows.** The trough window starts at 3–8 µg/L (consensus, with a reduced-exposure calcineurin inhibitor); the background dialog also offers 6–10 µg/L
  (without a CNI), each with a "Use this window" button. The consensus gives **no AUC target**, so the AUC window stays empty. A cleared window gives intervals
  without probabilities.
- A run **without a sample** is allowed and is labelled a population forecast; About states how much less accurate it is (AUC over-predicted by about 43 % on average).
- Scope stated in the app: adult kidney recipients, twice-daily everolimus (10–14 h interval), doses 0.25–5 mg, concentrations 0.5–60 µg/L. Cancer indications,
  children, other organs and once-daily dosing are not covered. Ciclosporin and other CYP3A/P-glycoprotein interactions, liver function, food, adherence and time
  since transplantation are not in the model; the About text says so.
- The dose explorer (12-hour interval) shows the steady state of a candidate dose, actual and corrected. It never recommends a dose.
- Report, session export/import and the diagnostics dialog work for everolimus as for tacrolimus (the report, import and explorer were exercised in the browser pane, the diagnostics dialog by tests; the autosave uses the same session object but could not be exercised there, because the pane disables local storage).

## The model, in short

Five equal absorption stages (Erlang-5, mean absorption time 0.549 h), a liver compartment with flow-limited extraction (plasma flow QH·(1 − Ht)), a two-compartment plasma
disposition, saturable red-cell binding. Random effects on intrinsic clearance, central volume and unbound fraction. Residual error additive on ln(C), SD 0.309. The
prednisolone effect multiplies intrinsic clearance by 1.44. Everything in µg and µg/L inside the engine (the NONMEM code's mg/L binding constants ×1000), time in hours.

**Closed form.** The disposition has three real negative poles (a cubic, solved trigonometrically); the Erlang-5 input turns each pole into a closed expression, and
steady state sums geometrically. One steady-state concentration costs about 0.4 µs. A fit takes about 0.4 s in the browser on a worker pool.

## Evidence

| Check | Result |
|---|---|
| Closed form vs 8-state matrix exponential vs RK4 (`tests/test_everolimus.js`) | ≤ 1e-8 relative; plasma AUC = Dose/(CLINT·FU) to 1e-5 |
| NONMEM 7.6 structural check (steady state, histories; 584 predictions) | ≤ 4.8e-9 relative; also run as a test from the stored fixtures |
| NONMEM 7.6 POSTHOC vs the app's MAP (30 patients, trough only and trough + 2 h) | largest eta difference 1.2e-6; the objective is identical |
| Time-varying haematocrit (12 subjects) | NONMEM applies the Ht of the record at the *end* of each interval; the app's one-Ht approximation costs mean 1.0 %, max 6.2 % in earlier-sample predictions (the reported steady-state values are exact at the latest Ht) |
| Simulation–recovery calibration (12 cells × 100 patients) | coverage 87–91 % in all 48 figures; 1200/1200 fits converged (worst R̂ 1.0009, smallest ESS 15 264); AUC coverage 87–89 %, slightly under the nominal 90 % in every cell (`CALIBRATION_RESULTS_EVR.md`) |
| Regression record | `tests/evr_regression.json` (fixed-seed fits, exact equality) |

**Finding about the published control stream:** `COMP=(TRAN)` is declared four times with the same name in the supplement; NMTRAN 7.6 refuses it (error 52). The check renames them TRAN1 to TRAN4.

## What changed in shared code

- `ui.js`: `isTac()` (which meant "has custom hooks") is replaced by `isCustom()` plus per-drug flags on the spec (`spec.ui`: noun, weight, predDose, occasions, badge, chartTitle,
  shrinkEta, modelLine) and a text registry `ECU.drugTexts[id]` (`texts_tac.js`, `texts_evr.js`). The tacrolimus strings stay as the fallback inside `ui.js`; the new snapshot test
  holds both existing drugs' About, background, getting-started, chart note, how-to, summary and diagnostics text byte for byte.
- `model.js`: `covariateFields` carries an optional per-covariate `missing` message; `ui.js` uses it for "Choose the prednisolone dose group." Tacrolimus messages are unchanged.
- `diagnostics.js`: the note under the information-gained bars comes from the drug's texts when it has one.
- `ui.js`: a dose-explorer result is reset whenever the fit it was computed from is replaced (new forecast, drug switch, session import, cleared session); it used to stay on screen under the next patient's fit, for all three drugs. Decided by the roles of clinical pharmacologist (a candidate-dose result is meaningful only against its own fit) and interface designer (reset silently to the neutral note, no extra banner; an input edit alone keeps it, the existing "inputs changed" banner covers that). Test: `explorer: a dose-explorer result never outlives the fit ...`, red when the reset is removed.
- `parallel.js`, `build.mjs`, `index.html`: the new files; a test fails if a list loses `src/everolimus.js` (workers would silently fall back to one thread).

## Publication (3 October 2026)

The app is published at https://robterheine.github.io/nephrotdm/ (repo `Robterheine/nephrotdm`, only `index.html`) and the source at `Robterheine/nephrotdm-source` (MIT), the same two-repo layout as `complementtdm`. The earlier MPA-only page and repository (`mpatdm`, 1.1.1) were deleted the same day; its URL no longer resolves. About carries a link to the source repository. The author-query drafts (`docs/AUTHOR_QUERY*.md`) are not part of the published source. Verified on the live page: an everolimus fit on a worker pool, the About link, and autosave with the restore offer (possible over https, not in the local file view).

## Beginner test and its fixes (3 October 2026)

A beginner walkthrough of the built page (all three drugs, all dialogs, typical mistakes, phone width) found two bugs and five smaller inconsistencies; all are fixed, each with a test that failed first and goes red when the fix is undone.
1. A drug without a weight covariate (MPA) printed "Weight 80 kg" in its report and carried `wt` in the session file, from the hidden field's leftover value of another drug. Now `usesWeight()` decides; the MPA patient block shows the ID only.
2. After a forecast the explorer card said "Run a forecast in card 3 first". It now says "Enter a dose and press Explore to see it at steady state, using this forecast's fit." (the old wording stays when there is no forecast).
3. A wrong-file import said "Not an mpa-tdm session file"; it now says NephroTDM (the file's app key stays `mpa-tdm` so older sessions import).
4. "Weight of older samples" is now "Down-weight older samples". 5. The step guide says "3 Forecast" (as the card does); the "Full schedule" tooltip no longer says "planned dose".
6. The MPA model card in About no longer ends "see the model card in About" (the main-page hint keeps it). This is a deliberate text change: `tests/ui_text_snapshot.json` was re-recorded after checking that this clause was the only difference (MPA's card, shown in both drugs' About).
7. On phones the number inputs are `box-sizing: border-box`, so they stay inside the card.
Not changed (taste): "Print report" is styled as the primary button before a forecast exists.

## Red-first record

Each guard was made to fail before it was trusted. Sabotages run against `src/everolimus.js` (each turned the suite red on real assertions): wrong reference haematocrit,
plasma flow without (1 − Ht), prednisolone factor, KA = 1/MAT or (n−1)/MAT, missing FU eta or a wrong scale on it, missing geometric term of the steady state, no non-specific binding
term in the blood transform, a changed residual variance (regression record), a low-prednisolone factor of 1.0001 (NONMEM fixtures). For the texts: an em-dash, a stray 0.35, a "not validated"
sentence and a registry lookup removed (each failed the copy or registry test); the weight flag; `src/parallel.js` without the new file; `verify_model` with a wrong `HCT_REF`.

## Known limits and things not done

- The page is 359.4 KB, above the roughly 350 KB budget set in the hand-off (owner accepted this on 3 October).
- The calibration shows that the sampler is far past convergence (smallest effective sample size above 15 000 against a bar of 400); `mcmcIters` could be lowered if speed ever matters.
- The human review of the whole app (`VERIFICATION_TEAM.md`) is still open; an everolimus addendum is listed there.
