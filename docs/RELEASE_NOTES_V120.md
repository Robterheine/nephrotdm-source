# Release notes — NephroTDM 1.2.x and 1.3.0 (2–3 October 2026)

**1.3.0 (3 October 2026)** is the version of record for everything below: tacrolimus (1.2.0), the shrinkage fix (1.2.1) and, added after it, the speed work, the adversarial-audit fixes and the tacrolimus window sets. Nothing was published under 1.2.0 or 1.2.1.

**1.2.0** adds tacrolimus and renames the app (MPA TDM → **NephroTDM**). **1.2.1** (same day, a separate task) corrects the
"shrinkage" diagnostic of the MPA model. Not published at the time: the repository `Robterheine/mpatdm` and its URL still carried 1.1.1 (since retired; see `RELEASE_NOTES_V140.md`).
Research use only, as before. Plan and execution log: `IMPLEMENTATION_PLAN_STORSET_2014.md`.

## What changes for the person using it

**A second drug: tacrolimus for adult kidney transplant recipients** (Størset et al., Br J Clin Pharmacol 2014;78:509–523).
- Choose it in card 1. The patient card then asks for sex, weight, height (they give the fat-free mass the model scales to),
  CYP3A5 genotype (optional — unknown is treated as a non-expresser), prednisolone mg/day, haematocrit in L/L, and the assay.
- It reports the **steady-state AUC₀–₁₂ₕ and the steady-state trough** of the current regimen on a typical day, each with a 5–95 %
  interval, **as measured and corrected to a haematocrit of 0.35** (the whole-blood value the same plasma concentration would show at 0.35).
- **Assay:** LC-MS/MS or Abbott CMIA (converted with the model authors' own equation, LC = 0.80 × CMIA + 0.19 µg/L, and shown back
  on the scale you chose). Other immunoassays have no conversion in the source and cannot be used.
- Haematocrit goes with each sample (and defaults to the patient card), prednisolone can differ per dose, doses are in mg.
- The dose explorer (12-hour interval) shows the steady state of a candidate dose, actual and corrected; whole-blood exposure rises
  slightly less than in proportion to the dose because binding to red cells saturates.
- **Therapeutic windows (added 3 October after the consensus text was read).** Choosing tacrolimus fills in the standard for adult kidney recipients
  (trough 4–12 µg/L, AUC0–12h 150–210 µg·h/L; source and what is derived: `SOURCE_ANALYSIS_BRUNET_2019.md`). Every bound can be edited or cleared (a cleared
  window gives intervals without probabilities). The Tacrolimus background dialog lists seven sets (standard, two everolimus, four trough-matched AUC ranges)
  with grade and basis, each with a "Use this window" button. The AUC upper bound of 210 is the app's own choice; the report gives no AUC range for the 4–12 trough group.
- One sampling day cannot fix the steady-state AUC better than about ×/÷ 1.4 (5–95 %), however many samples it contains; two days about
  ×/÷ 1.3. This is a property of the model (day-to-day bioavailability variability, CV 23 %) and is why intervals look wide.
- **Scope limits stated in the app:** adults, kidney, immediate-release twice-daily tacrolimus only; intended for use some days after
  transplantation (the model's first-day bioavailability effect is left out, so a result in the first week or two is biased upward —
  about +20–50 % on a trough on day 4, 1 % or less after two weeks); renal and liver function, age and interacting drugs are not in the model.

**MPA is unchanged**: fixed-seed fits are bit-identical to 1.1.1 (a regression test holds the recorded numbers). Session files from 1.1.1
import (tested), including the legacy IV and below-LLOQ handling. The output file is now `nephrotdm.html`.

**1.2.1 — the MPA diagnostics dialog and the sparse-data note read "shrinkage" backwards.** Found while choosing a tacrolimus threshold:
the quantity held *information gained* (0 for a population forecast, 0.85 for six samples). Fixed in `shrinkageOf`; details and the
red-first tests are in the ST4 addendum of `METHODS_AUDIT_V101.md`.

**Text review (same day).** The page text assumed one drug. Now: the subtitle, footer, "new" note, background button title and the
Privacy and Research-use sections of About are drug-neutral and written once; each drug supplies its own background label, chart note and
how-to (a drug without an entry gets neutral text, so a third drug such as everolimus needs an entry, a spec and a model, nothing else on the page).
Corrected as wrong or stale: the steady-state helper said earlier cycles were "simulated back over a fixed number of intervals" (steady state has
been exact since 1.1.0); "the PK model file is still pending" and "MPA model file" in drug-neutral messages; "Developed for the MPA TDM project" in the
footer; the single-dose warning (its wording was untrue for tacrolimus); the weight help ("pediatric patients are accepted"); unit tooltips on the
window fields; dose placeholder and hint per drug; the MPA report title and export file name (now NephroTDM / `nephrotdm-session.json`). The privacy text
now says what is true: nothing is sent online, and an autosave of the session (patient data included) is kept in this browser until discarded. The
tacrolimus day-4 sentence now says what the number means (the real trough is 20–50 % above what the model expects, so the AUC is overestimated) and
the claim about randomised trials is dated to the source paper. New and shared copy was edited with the humanizer rules (no em-dashes, no filler,
no claim stronger than the evidence); the older MPA body text was only corrected, not restyled.

**Speed (3 October).** Fits are faster and the page no longer freezes while one runs (`PERFORMANCE_AUDIT_V121.md`). Tacrolimus steady state with three
samples 4.4 s → 0.7 s (0.3 s on the browser's worker pool); five sampled days 22 s → 6 s (2 s on workers); twelve sampled days about 26 s in one thread,
8 s on workers. MPA was already under a second and is unchanged. What changed: a parameter-object copy that was 71 % of tacrolimus fit time; the sampler's
per-iteration allocations; progress that actually repaints (the old yield never let the browser draw); and the tacrolimus chains as independent seeded tasks
on Web Workers (the same draws as the in-process run, with a fallback if workers are unavailable or silent). Results: the one-thread optimisations are
bit-identical; per-chain seeds move the tacrolimus numbers only by Monte Carlo noise, and the full calibration was repeated on the final engine (all 36
coverage figures 86–92 %, 100 % of fits converged). A test run that never finishes now fails instead of passing quietly.

**Adversarial audit (3 October).** A UX, a coding and a clinical-pharmacology review (`ADVERSARIAL_AUDIT_V121.md`). Fixed: impossible values are now refused
with a message that names the unit (concentrations outside 0.1–100 µg/L, doses outside the model's range, height, prednisolone, haematocrit); steady-state
samples after the regimen ended or before the first dose; a 24 h interval for twice-daily immediate-release tacrolimus; unit headers that turned µg/L into ΜG/L;
switching drug or importing during a fit; dialog focus; the status line wording; MPA's "check inputs" failure message; README statements that had gone stale.
No fitted number changed.

**Autosave (3 October, owner decision).** The autosaved copy now expires after 24 hours (an older one, or one from before this version, is deleted on the next
page load instead of being offered), and a quiet **Clear session** button at the end of the header's button row deletes the autosave and empties the page (after
a confirm; exported files are not affected). The patient-code field is still autosaved. The privacy text says all this.

**Assay scale and windows (3 October, checked).** A window is judged on the scale the user works in: with CMIA chosen, the CMIA values the card shows are what the
window is compared with (the probabilities and the displayed medians come from the same converted chain, in the fit and in the dose explorer). Owner decision: keep it so, no extra text.

**Cancel and the audit leftovers (3 October).** A **Cancel** link under the progress bar stops a running forecast (in-process and on the worker pool; no result is
produced and the next fit is unaffected; the MPA numbers are untouched). More than 12 sampled days: the result now says that the older days are treated as typical
days (it used to be silent). An imported select value that is not one of its options keeps the default instead of blanking the select (CYP3A5). All em-dashes are gone
from the page text (MPA text included; only reworded, no content changed); the "does not recommend a dose" sentence is kept where it matters (explorer result, report,
About, getting started) and dropped from the help tooltips. The drug select shows short names (the model citations are in the results and About), and tacrolimus
concentration and window texts say µg/L = ng/mL. The MPA formulation was not silent after all: it is shown in the result header, the dose label and the report.

**Time-adjusted AUC ranges (3 October).** With Saint-Marcoux 2013 (reference 69 of the consensus) the background dialog now has a grid of trough-matched AUC ranges:
four trough ranges (3–7, 5–10, 8–12, 10–15 µg/L) by 0–3 months, 3–12 months, after 12 months and all periods (the consensus's combined range, computed from the three).
One button per cell fills both windows. Details and the paper's own AUC targets: `SOURCE_ANALYSIS_BRUNET_2019.md`. The standard window is unchanged.

## Evidence

| | |
|---|---|
| Tests | 111 (MPA/engine) + 60 (tacrolimus, incl. 11 audit, 5 window, 1 autosave, 1 cancel and 2 leftover tests) pass; `tools/verify_model.mjs` OK for both models |
| Structure vs NONMEM 7.6 | 40 subjects, 560 whole-blood predictions agree to 4.7·10⁻⁹ — steady state and histories, per-dose prednisolone, per-day κ on F, κ on ka, CYP3A5, fat-free mass, haematocrit transform |
| Estimation vs NONMEM | 30 patients: the app's MAP has the lower-or-equal objective in 30/30; NONMEM's EBE is above it by at most 0.029 (−2LL); median \|Δη\| 0.008 |
| Independent oracle | closed form = RK4 (per-dose F and ka, lag, occasions) to 2·10⁻⁴; plasma AUC = F·D/CL exactly |
| Published numbers | paper's whole-blood parameters (16.1 / 125 / 23.8 / 636 L/h, L), Figure S1 (14.06 / 10.39 / 6.42 µg/L), Equation S1 reproduced |
| Calibration | `CALIBRATION_RESULTS_STORSET.md`: 9 cells × 100 simulated patients; coverage of the true steady-state AUC and trough (actual and corrected): all 36 figures inside 85–95 % (86–92 %), 100 % of fits converged (repeated on the final, optimised engine) |
| Sabotage | 16 deliberate faults (constants, the delta flag, the correlation, the copy rules, the window reset…) each turned the suite red; the proportional-error constant is caught only by the NONMEM check |
| Browser | full tacrolimus session (steady state, CMIA, windows, explorer, report, export/import), MPA session, phone widths 375 and 320 px |

## Known issues and open items

- **Windows:** the standard set, two everolimus sets and the 14 trough-matched AUC ranges ship (see above). Not in the app: higher-risk targets (the consensus gives no numbers).
- **Cut-off after transplantation:** the owner's ">3 days" is shorter than the measured wash-out of the first-day effect; the text says
  "some days… biased in the first week or two"; there is no transplant-date field. 3 or 14 days is the owner's decision.
- **Large designs take longer.** Measured on a quiet ten-core machine (see `PERFORMANCE_AUDIT_V121.md`): up to three sampled days under 1 s;
  five sampled days about 6 s in one thread and about 2 s on the browser's worker pool; twelve sampled days (27 parameters, the cap,
  3.2 M iterations) about 26 s in one thread. A progress bar runs throughout and the page stays responsive. Fits that miss the
  R̂ < 1.01 / ESS ≥ 400 bar show the "sampling not converged" badge.
- **Not independently reviewed** by a named person (`VERIFICATION_TEAM.md`, tacrolimus addendum). Author queries are drafted, not sent.
- **Assumptions to be confirmed with the authors:** the V1–Q correlation (0.27), the √ω² reading of the CVs, a calendar day as an occasion
  (arms A and B and the occasion question: `AUTHOR_QUERY_STORSET.md`; arms A and B of the calibration are in band).
- **The AUC was not externally evaluated in the source study**, and the NONMEM and simulation checks test the implementation, not the model's
  validity in a given patient.
- `mpa-tdm.html` (1.1.1) is superseded and still in the folder; nothing was published.
