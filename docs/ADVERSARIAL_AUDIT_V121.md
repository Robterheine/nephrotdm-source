# Adversarial audit: NephroTDM 1.2.1 (3 October 2026)

Three reviewers, each trying to break the app from their own side: a **UX designer** (ease of use, true statements, no filler text),
an **HTML/JS coder** (mistakes, effective code) and a **clinical pharmacologist** (would this help at the bedside?).
Method: hostile inputs through the engine and the built page, an injection test, a race test, structure and contrast checks,
a read of every string. Every defect that was clear-cut got a test that failed on the old code first (11 tests, `audit/…` in
`tests/test_tacrolimus.js`), then a fix. Judgement calls are listed in §4 and were not changed.

Result after the fixes: 111 + 50 tests pass, `tools/verify_model.mjs` OK, and the browser run of the rebuilt `nephrotdm.html` shows each fix working.
No fitted number changes: the MPA regression record (V16) and the tacrolimus record (V16b) are untouched.

## 1. Findings that were fixed

| # | Seen by | Severity | What was wrong (evidence) | Fix |
|---|---|---|---|---|
| 1 | Clinical | **High** | Impossible values were accepted: concentrations of −4, 0 and 99 999 µg/L; a 3000 mg tacrolimus dose ("Ready to run"); a 20 cm patient; prednisolone 500 mg/day. They produced a result. | `inputProblems()` (pure, in `ui.js`) checks concentration, dose, height, prednisolone and haematocrit against the spec's ranges, with a message that names the unit. The add-dose and add-sample forms refuse the value at once. |
| 2 | Clinical | **High** | Steady-state mode with a sample three weeks (or two months) after the latest dose gave an AUC of 357, no warning. A sample before any dose was also silent. | `inputProblems()` refuses a sample before the first dose and, in steady-state mode, a sample more than one interval after the latest dose, and says what to do instead. |
| 3 | Clinical | **High** | A 24 h (or 48 h) interval was accepted for a model of twice-daily immediate-release tacrolimus. Once-daily prolonged-release use is a real trap. | `spec.intervalRange` (10–14 h) for tacrolimus; other intervals are refused with the reason. |
| 4 | UX | **High** | `text-transform: uppercase` on table headers turned **µg/L into ΜG/L** (a capital Greek Mu, which reads as MG/L, a 1000-fold error) and η into Η, in the sample table and the diagnostics. | Removed from `.data th` and the About tables. |
| 5 | Coder | **High** | Race: changing the drug while a fit ran left tacrolimus results under an MPA screen, with the explorer enabled and labelled "Dose (mg MMF)" and a stuck "Running…". Import and clear were unguarded too. | `state.running` guards on drug change and session import (with a message; the select snaps back), "Running…" hint cleaned up when the fit ends. |
| 6 | Coder | Medium | The engine itself accepted c ≤ 0 and an all-zero dose list. MPA failed with "MAP estimation failed. Please check inputs." | `runFit` throws a plain message for both. |
| 7 | UX / a11y | Medium | Dialogs did not take focus on open (`activeElement` stayed on the page behind), had no Tab trap, and did not give focus back. | Focus moves into the dialog, Tab stays inside, Escape, backdrop click and the close buttons return focus to the opener. |
| 8 | UX | Medium | The main status badge read "Individual fit: 32 000 posterior draws, MCMC acceptance 30 %". | Now "Fitted to this patient's 3 samples on 1 day". The sampler detail is in the badge tooltip and the diagnostics dialog. |
| 9 | Coder | Medium | Static HTML carried the MPA limits for every drug (dose 10–3000 mg, interval up to 48 h). | `applyChrome` sets dose and interval limits from the drug's spec. |
| 10 | UX | Low | The ⓘ buttons were 18 px tall on touch screens. | 32 px minimum under `(pointer: coarse)`. |
| 11 | Docs | Medium | README: republish instructions named the superseded `mpa-tdm.html`; the `--pending` command now fails; `golden.json` said to be empty; "six src modules"; open items "as of v1.1.1"; test counts. | Corrected (guarded by `audit/docs`). |

**Checked and found sound:** no XSS (payloads in every typed field and in an imported session stay inert text), no duplicate ids,
labels and roles present, text contrast at least 5.4:1, all form buttons typed, no debug leftovers.

## 2. Reported, not changed (small, each with the reason)

*Update, 3 October: the em-dashes, the repeated no-advice sentence, the silent 12-day cap, the blank CYP3A5 select, the truncated drug select and the ng/mL hint were fixed in 1.3.0 (`RELEASE_NOTES_V120.md`). Still open from this list: the `installStubSpec` test code in `model.js`.*

- **Test stub shipped in the product.** `installStubSpec` lives in `model.js`; harmless, but ~1 % dead weight. Removing it touches the MPA test suite.
- **More than 12 sampled days** are capped silently by the engine. The cost grows with sampled days (27 parameters at 12), so the cap is deliberate; a visible note would be better.
- **A CYP3A5 select can be left blank** by an invalid imported value; the app then treats it as "unknown", which is the safe default. The import should keep the default instead.
- **41 em-dashes** remain in the older MPA body text (the new texts have none). "Never recommends a dose" appears 13 times and "research use only" 5 times; two or three mentions would do. Left because the wording is shared with the MPA release and the README rule asks for the disclaimer to stay.
- **Dense `spec.info` paragraph** and **"P(above lower) / P(below upper)"** labels are still terse; they need clinician wording, not a code change.
- **Drug select text is truncated** on narrow phones; the window fold shows its two bounds as separate chips that wrap.

## 3. What a clinical pharmacologist would still ask for

These are product questions, not defects, so they are listed for the owner.

1. **No transplant-date field.** The first-week bias of the model (20–50 % on a day-4 trough) is stated in the text but cannot be detected. A date field with a warning under day 7 (or 14) is the obvious answer; it is the owner's open decision D2 (3 or 14 days).
2. **No default windows** (resolved the same day): the consensus was read and the app now starts with the standard kidney window, editable, with seven sets in the background dialog (`SOURCE_ANALYSIS_BRUNET_2019.md`).
3. **Dose explorer evaluates one dose per click.** A table of three or four candidate doses in one pass would be easier to read next to each other (it must still never pick one).
4. **Interaction prompt.** CYP3A inhibitors and inducers matter more than anything else the model leaves out; a short check ("any new interacting drug since the first sample?") would add safety, not advice.
5. **Autosave keeps patient data in the browser** with no visible "forget" control. The privacy text says so; a link to clear it would match.
6. **Once-daily tacrolimus** is now refused, not modelled. If the clinic uses it, that needs its own model.
7. **ng/mL users:** the app works in µg/L (same numbers as ng/mL); a one-line hint beside the unit would stop doubts.
8. **MMF default formulation** is silent (MMF selected unless EC-MPS is chosen).

## 4. Judgement items for the owner

- Transplant-date field and cut-off day (items 1 above; was D2).
- Whether 210 µg·h/L is the AUC upper bound you want in the standard window (the report gives only a minimum of 150).
- Multi-dose what-if table, interaction prompt, forget-autosave link: wanted or not.
- Delete the stale `mpa-tdm.html` (1.1.1) from the folder; nothing here depends on it.
- Publishing: the repository and the page still carry 1.1.1. Not done without your go-ahead.

## 5. Evidence

| | |
|---|---|
| New tests | 11 red-first audit tests; all failed on the unfixed code (11 of 50), all pass now |
| Suites | `npm test`: 111 (MPA/engine) + 50 (tacrolimus) pass; `tools/verify_model.mjs` OK for both models |
| Numbers untouched | V16 (MPA, v1.1.1 record) and V16b (tacrolimus record) equal their recorded values exactly |
| Browser (built file, visible pane) | −4 µg/L refused at the form; 24 h interval refused with the reason; sample 504 h after the latest dose refused with the remedy; a 12 h steady-state fit runs and reads "Fitted to this patient's 1 sample on 1 day"; drug change during a fit refused and the select snaps back; dialog focus enters, Escape returns it to the opener; table headers not upper-cased; dose max 30 and interval max 14 set for tacrolimus |
