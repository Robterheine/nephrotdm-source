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

## About enriched (3 October 2026, after publication)

- **Tacrolimus and everolimus now have reference-value sections in About**, as MPA always had: a table of the windows the app uses (built from the spec, with grade and basis, so it cannot drift from the app), what the consensus does and does not give (tacrolimus: standard risk, higher risk without numbers, with everolimus, the trough-matched AUC ranges; everolimus: no AUC target, descriptive values that are not targets, other indications not covered), then haematocrit, assay and sampling, and a short "why model-based" part with the sources.
- **Author photo** at the bottom of About, the same 170 px circular WebP as in the complementtdm app, inline (no network): `src/author_photo.js`.
- Page size 407.5 KB (about 39 KB of it is the photo).
- Tests: `About: tacrolimus and everolimus each get reference values ...` and `About: the author photo sits at the bottom ...` (both red before, and red again when undone), plus the em-dash, dose-advice and validation-caveat rules on the new text. The MPA/tacrolimus text snapshot was re-recorded after checking that the only differences were the new tacrolimus sections and the table wrappers.

## Visual refresh (4 October 2026)

Agreed with the owner after the design canvas and an Apple-style UX review; no dark mode, page-size growth accepted, fonts embedded.
- **Fonts:** IBM Plex Sans (one variable file, weights 400 to 600) and IBM Plex Mono (500, 600), Latin subset, embedded in `src/fonts.css` (82 KB) so the offline page looks the same everywhere; no network request (a test forbids any). Licence: SIL OFL 1.1, named in the file. Glyphs outside Latin-1 (subscript digits, inequality signs) fall back to the system font.
- **Tokens:** base text 16 px, small text 12.5 px and 14 px, rounder radii, one accent (#0b6e85), every control at least 44 px tall (`--tap`), a 3 px focus ring.
- **Header:** brand mark and version chip, the help links, a **Session menu** (Export, Import, Clear; Clear is marked destructive; it closes after a choice, on an outside click and on Escape), and **Print report as a secondary button**. All ids the code binds are unchanged.
- **One primary action:** in the workspace only Run forecast is filled; Add dose, Add sample and Explore are secondary.
- **Drug cards** replace the select: name, analyte and model per drug (`spec.card`), the active one pressed. The select stays in the page, hidden from sight and from assistive technology, as the single source of truth; a card press goes through its own change handler (confirmation, window reset), so nothing about switching drugs changed.
- **Results as tiles for every drug:** large median and interval, the haematocrit-corrected value beside it, a range bar (measured interval solid, corrected outlined, the window a dashed band, one scale), and the same plain sentence as the report ("81% chance the trough is within the window 3.00 to 8.00 µg/L…") with three plain chips (In the window, Above the lower bound, Below the upper bound) instead of P(...) symbols. The lead tile follows the drug (trough for everolimus). The dose explorer uses the same tiles.
- **Card 3 answers first:** Run and status, then the tiles and the notes, then the chart.
- **Two-column workspace** from 1100 px (inputs left, results right) in a 1200 px column shared with the header and footer; one column below, in the original order. The inputs column is sticky.
- **Stepper** is now four links to the cards (smooth scroll, off for reduced motion).
- **Phone:** numeric fields open the decimal keypad, the Run bar stays at the bottom inside the safe area, the help links share one compact row, and a hidden-select overflow that widened the page to 399 px was fixed (the utility class now wins over the field and phone rules).
- **First-visit notice** now announces everolimus and the one-page report (new storage key, so people who dismissed the old notice see it once).
- Tests: `tests/test_refresh.js` (13 tests). Each piece was made to fail before it was trusted: tap size, base type, focus ring, a primary Print button or Explore button, the tiles container, a dead stepper link, missing decimal keypad, the notice key, a card press that bypasses the change event, a non-sticky Run bar, the column width, and the hidden-select rule. One of my own checks was too loose (`width` also matched `max-width`) and was tightened after a sabotage stayed green.
- Page size is now 518.8 KB (fonts 82 KB, photo 39 KB).

## One-page A4 report for all three drugs (4 October 2026)

The printed report was rebuilt (`src/report.js`, replacing the two old report builders in `ui.js`) after a review that found it complete but slow to read: the result was the seventh of ten blocks, the findings were a dense table, and the chart came last with no window drawn. The design was agreed on the canvas first.
- **Answer first:** a header with the title and a small citation line (model paper and the source of the windows), a patient and regimen strip, then **Result at a glance**: a tile per metric with the large median, the 5 to 95% interval, the haematocrit-corrected value beside it, a range bar against the window, and a plain sentence ("81% chance the trough is within the window 3.00 to 8.00 µg/L (corrected: 95%). Chance above 3.00: 81%. Chance below 8.00: 100%."). With no window set it says so (everolimus: "The consensus gives no AUC target"). Which tile leads is per drug (`spec.report.lead`): trough for everolimus, AUC for tacrolimus and MPA; MPA's trough is labelled informational and has no corrected value.
- **Then** the concentration chart (median, band, the trough window hatched, the samples labelled), the samples table (at most 6 rows, then "and N more"), three short reading notes per drug, the fitting settings, the advice box, prepared-by and signature lines, and a footer with the patient ID and "this app does not recommend or optimize doses".
- **Safety notes travel with the numbers**: the "inputs changed on screen since this forecast" stamp above the results, and a Notes box for sampling that has not converged, a short or single-dose history, weak information on clearance and EC-MPS anchoring. They appear only when there is something to say.
- **Printable in greyscale**: neutral greys only (solid bar = measured, outlined bar = corrected, hatch = window), nothing under 12 px, rules of at least 1 px; `@page` A4 with no browser margin, backgrounds kept (`print-color-adjust: exact`). Measured at true print size the normal case needs 1033 px (everolimus), 1015 px (MPA) and 1103 px (tacrolimus, the fullest) of the 1123 px sheet; a long advice text flows to a second page instead of being cut.
- **Differences from the canvas design:** the author lists of the model paper are cut to the first three plus "et al." (full citations stay in About); the scope line shares the citation paragraph; no "Page 1 of 1" (browsers cannot give a reliable page count; the footer with the patient ID is on the sheet); the fitting settings sit under the samples table.
- Tests: `tests/test_report.js` (9 tests: section order, citations in small type, per-drug tiles and wording, CMIA scale labelling, population forecast, escaping of user text, the safety notes, greyscale and minimum type size, print setup). Red-first: ten ways of breaking the report each turn it red. Older tests that read the report code were updated, keeping their intent.

## Layout: header and footer aligned to the content column (3 October 2026)

On wide screens the white header band and the footer kept their text at a fixed 20 px from the left edge while the cards sat in a centred 980 px column, so the top of the page looked off-centre (at 1280 px the title started at 20 px and the cards at 143 px). One variable, `--col`, now defines the column; the header band and the footer pad their content to it (`max(20px, (100% - col) / 2)`), the bands stay full width, and phones keep their small padding. Measured title, buttons, cards and footer text on one left edge at 1920, 1280, 1000 and 375 px, no horizontal overflow. Test: `layout: header, content and footer share one centred column ...`.

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

## Fields fit their text
The "Latest dose on" date-and-time field cut off its time. An audit of every field (`tools/audit_fields.js`, run at 320, 375, 768, 1100, 1280 and 1920 px for all drugs and schedule modes) found more of the same. Fields now fill their container instead of using fixed widths, long option labels are shortened to 28 characters or fewer, and the stepper no longer overlaps its connector lines. The audit shows no clipped field at any width. Two tests in `tests/test_refresh.js` guard this.
