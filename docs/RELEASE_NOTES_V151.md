# NephroTDM 1.5.1 (13 October 2026)

The answer to the adversarial review of 13 October (`ADVERSARIAL_REVIEW_V150.md`). The pharmacokinetic models and their numbers are unchanged: the fixed-seed
regression records (V16, V16b, the everolimus and pediatric records) are bit-identical, and so is the NONMEM cross-check. What changed is the edges of the product:
what the app accepts, what it warns about, what the report is tied to, and how the tests run. Every finding is listed with its outcome in `ADVERSARIAL_FIXES_V151.md`.
Research use only, as before.

## What a user will notice

- **A mistimed dose is refused.** Without this, a dose typed 2 h after the previous one read as an interval of 2 h and gave a 6-fold AUC with no warning. The interval from
  the last two doses must now be 4 to 48 h for MPA (the other drugs already had their own ranges), and the last gap must be within 25 % of the earlier ones. The message says
  which doses to check, or to use "Steady state" mode.
- **The report belongs to its run.** A dose added or a mode flipped while a forecast ran is no longer printed next to a fit that never saw it, and the stale banner now appears
  on a first run as well.
- **Ctrl/Cmd+P prints the report.** It used to print a blank page. The report also fits one page on A4 and on Letter (a tall one is scaled down).
- **Session import is stricter.** It sorts doses and samples by time, keeps a window label only if it matches the bounds, names an unknown drug, leaves the current drug alone
  when it fails, asks before replacing a case on screen, and autosaves what it imported. "Clear all" and "Discard" ask first, and a deleted row returns keyboard focus to the table.
- **Smaller things.** Validation errors are announced to screen readers; the result tiles no longer force a sideways scroll at 320 px; the report date is year-month-day;
  the dose explorer runs one scan at a time and ignores a result that arrives after the fit changed; the steady-state note says how far back a sample may be.

## What changed in the numbers' safeguards

- **H1.** Adult tacrolimus and everolimus took the haematocrit of the last-entered sample as "the latest". With samples out of order (an unsorted session file) the report showed
  the wrong value, and for everolimus the fit used it. Both now take the latest by time, as the pediatric tacrolimus code already did.
- **H2.** The convergence gate passed when its quantities were NaN (R-hat became minus infinity). No statistic now means no convergence claim. A MAP search that ends on a NaN
  gradient no longer reports "converged". Both can only turn a "converged" into "not converged"; no regression record moved.
- The engine refuses inverted window bounds before sampling (the screen already did).
- The convergence indicator of pediatric tacrolimus uses the corrected value its probability is judged on; the diagnostics panel uses the same interpolated quantile as the results.

## Tests and tooling

- New suite `tests/test_audit150.js` (22 tests). Each was run against the 1.5.0 tree first: 16 of 22 failed there, and the harness and day/hour tests were shown red against the
  old harness and by a mutation (record in `ADVERSARIAL_FIXES_V151.md`).
- `tests/harness.js` now times out a test (300 s) and fails the run on an unhandled promise rejection; all seven suites end the same way.
- The two EC-MPS golden values are now the exact anchors of S2/S3 (45.2683 and 38.9817), and V4/V15 hold the grid-based values to 1 % (they were 2 %). A 4 % error in the evening lag
  constant, which passed before, now fails V4 and V15.
- README golden rule 3 now says what it means and a test holds it. The README also says what the regression records can and cannot show.

## Housekeeping

- The superseded `mpa-tdm.html` (v1.1.1) is deleted. `LICENSE-fonts.txt` carries the SIL Open Font License text for the embedded IBM Plex fonts, and the same text is in the built page.
- **Addendum for 6 October.** After the 1.5.0 documents were closed on 5 October, three changes were made and published without a version bump, on the owner's request after iPad
  screenshots: the form layout fix for Safari date/time inputs (`src/app.css`), the one-page print fix for Letter paper (`src/app.css`, `src/ui.js`), and the "clear all" layout.
  They are in the git history of `Robterheine/nephrotdm-source` (commits `27eed6e` and `0c65fe2`) and are folded into this release.
- The review's C3 said the tree had no history. The working folder is not a git repository, but the publish clones are, and they hold every release.

## Not done

See `ADVERSARIAL_FIXES_V151.md`: the multi-start MAP, a confirmation on single-row delete, and the source-text tests are left as they were, with the reasons.
