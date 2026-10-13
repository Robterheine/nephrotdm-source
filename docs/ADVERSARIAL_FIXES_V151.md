# Adversarial review of 13 October 2026: what was done (NephroTDM 1.5.1)

Each finding of `ADVERSARIAL_REVIEW_V150.md`, the outcome, and the evidence. "Test" means a case in `tests/test_audit150.js` unless another file is named. Rule 7b was applied
literally: the new suite was run against the 1.5.0 tree first (a copy with only the exports the tests need added) and 16 of its 22 cases failed there. The other six either state
something that was already true (a regular history raises nothing; the screen already refused inverted bounds; a session round trip already held; a smooth MAP problem converges)
or are the harness and day/hour tests, which are shown red below.

## Fixed

| Finding | Outcome |
|---|---|
| **C1** mistimed dose gives a 6-fold AUC | Fixed (`inputProblems`): MPA interval 4 to 48 h, and the last gap within 25 % of the earlier ones; one message per cause. Four tests. Seen in the real page with the audit's own case (20 twice-daily doses plus one 2 h later). |
| **C2** report shows doses that were never fitted | Fixed: the view is built before the fit starts, and an edit during the run raises the stale banner even on a first run. Test: a dose added mid-run is absent from the stored view and the banner is up (13 doses on screen, 12 in the view; it was 13 and 13 on 1.5.0). |
| **H1** wrong haematocrit with samples out of order | Fixed in `tacrolimus.js` and `everolimus.js` (latest by time, as `tacped.js` did); the session import sorts doses and samples. Three tests (0.45 expected, 0.30 on 1.5.0). |
| **H2** convergence gate passes on NaN | Fixed: any non-finite R-hat or ESS gives `ok: false` and NaN. A MAP search that breaks on a NaN gradient no longer returns `converged: true`. Two tests. |
| **H3** harness: no timeout, a leaked rejection can exit 0 | Fixed in `tests/harness.js`: 300 s per test (`TEST_TIMEOUT_MS`), `unhandledRejection` recorded and failed, an event-loop turn after each test so it is seen before a suite's `process.exit`; all suites end with the same tail. Two tests run a child process: on the 1.5.0 harness the leak exited 0 and the hang had to be killed after 20 s. |
| **H4** accessibility and destructive actions | `#runHint` is an assertive live region; "clear all" and "Discard" ask first; a deleted row puts focus on the next remove button; Ctrl/Cmd+P builds the report through `beforeprint` (checked in the page by firing the event); tiles use `minmax(min(300px, 100%), 1fr)`. Not done: a confirmation or undo on a single-row delete (see below). |
| **H5** golden rule 3 is false | README rule 3 rewritten to the three real uses; test H5 holds the list. Red check: replacing `86400000` by `1000 * 60 * 60 * 24` in `ui.js` fails it. |
| **H6** no session round trip, window branches untested, engine accepts inverted bounds | Round-trip test added (second round trip changes nothing); validation test added; `runFit` refuses inverted or empty AUC and trough windows before sampling. |
| **M** window provenance forgery on import | The label is kept only if the set exists for the drug and the bounds on screen equal its own. Test with bounds 5 to 500 (kept as "ped-0-6w" on 1.5.0). |
| **M** golden tolerances of 2 % | The EC-MPS values are the exact S2/S3 anchors; V4/V15 use 1 % for the grid-based windows, 0.5 % for the MMF and 24 h-sum balances. Red check: the audit's evening lag 9.04 to 9.4 now fails V4 and V15 (it passed before). The grid-based helpers are 0.2 to 0.3 % below the exact values, which is why they are not held to 5e-4. |
| **M** explorer races | One scan at a time; a result that completes after the fit changed is replaced by the neutral note. Test for the guard. |
| **M** import robustness | Autosave after import, confirmation before replacing a case, the drug is restored when an import fails, an unknown drug is named. Tests. |
| **M** MAP overclaims convergence | Fixed (see H2). |
| **M** print robustness | `break-inside: avoid` on the report blocks; the zoom is measured at the printed width (210 mm), not the screen width. |
| **M** SS mode and old samples | The behaviour is unchanged and correct for its model; the note under the steady-state fields now says how far back a sample may be (30 doses for MPA and tacrolimus, 10 for everolimus). |
| **M** docs staleness | `version.js` no longer names a test that does not exist; the 1.5.0 notes no longer say the page is unpublished. See "Where the review is wrong". |
| **L** three `esc()` that disagree, double escape of window notes | One escape set (`& < > " '`) in `ui.js`, `report.js`, `chart.js`, `diagnostics.js`; the window note is escaped where it is made and no longer again in the tile. |
| **L** import does not sort; `iv-amt` overwritten | Sorted on import. The explorer's dose is prefilled from the last dose but a value the user typed is never overwritten. |
| **L** duplicate `chartTitle`, schedule radios not grouped, popovers off-screen, buttons default to submit, touch targets, report date, quantile method, MC indicator for pediatric tacrolimus, CMIA assumption, regression records self-referential, 64th test registered in a loop, stale `mpa-tdm.html`, font licence | All done: unique ids (`chartTitle1`...), `role="radiogroup"` on the schedule switch, popover clamped to 8 px from the left and linked with `aria-describedby`, `type="button"` on every button that is not a submit, 32 px minimum for the text buttons on phones, year-month-day report date, interpolated quantiles in the diagnostics panel, the pediatric tacrolimus indicator judged on the corrected value, the CMIA error stated in the tacrolimus assumptions, the README says what the regression records are, a comment in `test_pediatric.js`, `mpa-tdm.html` deleted, `LICENSE-fonts.txt` plus the text inside the built page. |

## Not done, with the reason

- **Multi-start MAP** (a "known open item" in the review). It touches the shared MAP path and needs its own bit-identity check across the existing drugs, as in the 1.5.0 notes.
  The convergence flag no longer overclaims, so a fit that ends in a worse mode now says "not converged" instead of "converged".
- **Confirmation or undo on a single-row delete.** One row is quick to type again; "clear all" and "Discard", which lose many rows or the only saved copy, now ask. Focus is kept.
  Say if you want an undo toast as well.
- **About 50 source-text tests.** They freeze wording and CSS; they are cheap and have caught real regressions, and rewriting them as behaviour tests is a project of its own.
  New tests in this release test behaviour; the few that read source (for the print event, the confirm text, `minmax`) say so.
- **The no-dose-advice copy bans are blacklists.** True and unavoidable for text; the human review of wording is the control.
- **A window lower bound of 0** is still accepted, and the window inputs have no `fieldset`. Neither changes a result; the first is a valid choice for a trough window.
- **The unused `desc` path of the chart** and **`installStubSpec` in the product** (known and accepted) are left.

## Where the review is wrong or overstated

- **C3, "no version control".** The working folder is not a git repository, but the two publish clones are, and every release is in them. The changes of 6 October are commits
  `27eed6e` and `0c65fe2`. The part that is right: they were published without a version bump and without a release-note entry. Addendum in `RELEASE_NOTES_V151.md`.
- **"The live page is still 1.4.0."** Wrong. 1.5.0 has been live since 5 October. The 1.5.0 release notes did say "not published", which was true when written; they are corrected.
- **"RELEASE_NOTES_V150 says 16 refresh tests."** No such statement exists. The 601 KB is the size at the time (it is now about 625 KB; the README says so).
- **"Import errors are replaced by the generic message."** `applySession` has its own handler that shows "Import failed: <reason>"; the generic text is only for a file that is not JSON.
- **H5, "six `/ 24`".** Right in count, but the rule was about conversions of model-file units, which has no violation; the six are the legitimate uses, and the rule is now worded to match.

## Evidence

- `npm test`: 111, 60, 39, 64, 9, 17 and 22 tests, all green; `node tools/verify_model.mjs` OK; the fixed-seed regression records unchanged.
- Red runs on 1.5.0 (copy with exports only): 16 of 22 failed (C1 x3, H1 x3, H2 x2, H6 engine, window provenance, unknown drug, import confirm and autosave, C2, explorer guard, report
  sheet, accessibility wiring). Harness tests: on the old harness the leaking test exited 0 and the hanging test had to be killed. H5: the `* 24` mutation fails it.
- In the real page (Chrome pane): the C1 case shows the message; `beforeprint` builds the sheet with a year-month-day stamp and `afterprint` hides it; no console errors; one
  `chartTitle1` id. Not checked: Safari's own print dialog and VoiceOver, which I cannot run.
