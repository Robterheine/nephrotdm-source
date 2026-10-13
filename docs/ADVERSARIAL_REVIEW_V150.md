# Adversarial review: NephroTDM 1.5.0 (13 October 2026)

Five independent passes over the whole tree: the engine and all five drug models (deep read plus five empirical
Node experiments against the real code), a security/XSS audit, a UI/UX/accessibility audit, a test-suite audit with
mutation testing, and a docs-vs-code drift audit. `npm test` (300/300 green), `tools/verify_model.mjs` (OK) and a
byte-identical rebuild of `nephrotdm.html` were run. Every finding carries file:line evidence; every item marked
"(demonstrated)" was reproduced against the real code, not inferred.

Prior audits (`ADVERSARIAL_REVIEW.md`, `ADVERSARIAL_AUDIT_V121.md`) were read first; their findings and their fixed
items are not re-reported here.

## Verdict

The engine is excellent — probably better-validated than most hospital precision-dosing systems — and the security and
copy discipline are real. But the product is not as airtight as the README implies. There is one clinical-numbers defect
with no guard at all (C1), one report-integrity race (C2), a vacuous convergence check (H2), a wrong-haematocrit bug in
two of five models (H1), a golden rule that is factually false (H5), and a documentation set that describes a tree that
no longer exists — in a folder with no version control, so the drift is unrecoverable (C3).

## Critical

### C1 — A mistimed dose silently turns into a 6× AUC with no warning (demonstrated)

In full-schedule mode the dosing interval is inferred from the **last two doses only** (`ui.js:524-528`), MPA declares no
`intervalRange` (unlike tac/evr/ped, which refuse other intervals via `ui.js:588`), and the AUC₁₂ = AUC₀₋ₓ × 12/x contract
then extrapolates whatever gap exists. Experiment: a 10-day BID history plus one dose mistimed **2 h** after the previous
one → interval inferred = 2 h → **AUC₁₂ = 213 mg·h/L (133–370), P(window) = 0 %, `warnSingleDose` and `warnShortHistory`
both false.** Total silence; the same patient read normally without the typo. A clinician reads "massively overexposed"
from a data-entry error. Fix: sanity-check the inferred interval (and the history's uniformity) before normalizing;
refuse or warn on absurd intervals for MPA too.

### C2 — The printed report can show doses that were never fitted, with no stamp

`state.lastRunView` is built from the **live form after the fit completes** (`ui.js:861-866`), while the fit used the input
frozen at start (`ui.js:841`). The stale banner only appears if `state.lastRun` already exists (`ui.js:492-493`) — never
during a first fit — and `clearStale()` (`ui.js:867`) unconditionally wipes any banner raised mid-run. Add a dose, flip
Full↔Steady-state, or edit a window while a fit runs → the report pairs the *old* fit with the *new* regimen and prints
`inputsChanged: false`. This is the bug class the 1.2.1 audit (fix #5) believed closed; it guarded drug-switch and import
but not these. Fix: snapshot the view before the `await`, or force the banner on any mid-run change.

### C3 — The tree has moved past its own evidence records, and there is no git history

All docs were finalized 5 October; `src/app.css` (6 Oct 17:33) and `src/ui.js` (17:37) were then modified and
`nephrotdm.html` rebuilt (17:37) — no version bump (golden rule 4), no release-note entry, and the folder is not a git
repo, so what changed is unrecoverable. The V16 bit-identity and UI-snapshot records still pass (all suites green), so
the engine is untouched — but the "the docs match the tree" contract is broken. Put the project under version control
and write a dated addendum recording the 6 October change.

## High

### H1 — Wrong haematocrit in adult tacrolimus and everolimus when samples arrive unsorted (demonstrated)

`tacrolimus.js:246` and `everolimus.js:172` take `obs[obs.length-1]` — the last-*entered* sample — as "the most recent
sample" for `hctReport`. `tacped.js:219-221` fixed exactly this ("the input order is not trusted"); the adult files never
got the fix. The UI sorts on manual add (`ui.js:1580`) but **session import does not** (`ui.js:1266-1273`). Experiment:
samples entered out of order, latest-in-time haematocrit 0.45 → the app reports **0.30**. For everolimus it is worse: the
PK path (`QHP = 90(1−Ht)`, hence clearance) uses that value, so the **fit itself** is biased, not just the display. Fix:
tacped's latest-in-time pattern in both adult files, plus a sort in `applySession`.

### H2 — The convergence gate passes vacuously on NaN (demonstrated)

`fitConvergence` (`bayes.js:482-483`) takes `Math.max/min` over `[la.rhat, lt.rhat].filter(isFinite)`; if both quantities
are all-NaN, the filter empties, R̂ becomes −∞ and ESS +∞ → **`ok: true`** while every result prints "–". With only one
quantity NaN, its R̂ is silently dropped and the gate judges partial information. Handle the empty case explicitly.

### H3 — Harness: no timeout; the pediatric suite tail can hide crashes (demonstrated)

The never-settle guard (`harness.js:54-61`) only fires when the event loop drains — a hung test holding a live handle
(stuck worker, `setInterval`) stalls CI forever (verified: silent after 12 s). Separately, `test_pediatric.js:915` ends with
`process.exit(ok ? 0 : 1)`, which beats Node's unhandled-rejection detection — a leaked rejection there exits **0**
(verified). Add a per-test timeout and an `unhandledRejection` handler; make all six suite tails uniform.

### H4 — Accessibility and destructive-action gaps

- Run/validation errors go to `#runHint` with **no `aria-live` anywhere in src/**; the failure toast says only
  "Forecast failed." — the reason is withheld from the user who cannot see it.
- Row delete, "clear all" and restore-"Discard" (which deletes the only autosaved copy) are one-tap, no-confirm,
  no-undo, and table re-renders drop focus to `<body>` on every delete.
- **Ctrl/Cmd+P prints a blank page** (`app.css:388` hides everything; `#reportSheet` stays `hidden` outside the flow).
- Result tiles (`minmax(300px, 1fr)`, `app.css:451`) force horizontal scroll on the AUC card at 320 px.

### H5 — Golden rule 3 is false as written, and nothing can catch it

"There must be no `/ 24` or `* 24` anywhere else in `src/`" — there are **six**, all legitimate (occasion calendar-day
indexing in `tacrolimus.js:230,240` and `mpaped.js:189,199`; the EC-MPS 24-h tiling check `model.js:548`;
`RECENCY_TAU_H = 365*24` `bayes.js:104`). The "one commented block" the rule permits does not exist, and no test enforces
the rule — an unenforceable golden rule undermines the whole list. Rewrite it to say what it means (engine time in hours;
calendar-day indexing for occasions is allowed; day→hour constants in a named allowlist), or add the missing guard test.

### H6 — No session round-trip test; window-bound branches untested; the engine accepts inverted bounds silently (demonstrated)

Export→import→export is asserted nowhere, and the validation branches at `ui.js:623-627` have no test. The engine itself
accepts **inverted bounds** (`winLo: 60, winHi: 30` → `pInWindow: 0`, no error — verified); swapped bounds on screen read
as a dire clinical result, not an input error. `probBetween` edge cases (lo == hi, inverted, negative) are untested.

## Medium

- **Window provenance forgery on import.** `state.winSet` is trusted from the file (`ui.js:1254`): a hand-edited session
  can print "Window: Adult kidney, standard immunological risk, judged on the corrected value" next to bounds of 5–500
  in a signed report. Validate the id and the carried bounds against the spec on import.
- **±2 % golden tolerances are theater beside their exact neighbors (demonstrated).** A 9.04→9.4 h evening-lag mutation
  (~4 %, the classic transcription-bug class) **stays green** on V4/V15; only the exact anchors (S2/S3 at 5e-4, NONMEM at
  1e-6, the V16 bit-exact records) catch it. `golden.json` also records 38.95 where S2/S3 pins 38.9817. Tighten or demote.
- **~50 of 300 tests are source-regex change-detectors**, not behavior tests (the tacrolimus shrinkage convention is
  "tested" by finding a literal string in `ui.js`; nearly all of `test_refresh.js` is a CSS text freeze). They satisfy
  rule 7b's letter but own none of the claims their names advertise.
- **Dose explorer races:** no running guard (`ui.js:886`) — a double-click runs two scans and the slower wins; a
  drug switch mid-explore is overwritten by the stale completion. Same class as the 1.2.1 race fix, one screen down.
- **Import robustness:** an imported session is not autosaved (close the tab → the *previous* session is offered); the
  specific, well-written import errors are replaced by the generic "Not a valid session file." (`ui.js:1463`); no
  confirmation before overwriting the current case; `M.select` mutates the live drug before the rest is validated, with
  no rollback.
- **MAP diagnostics can overclaim convergence:** `mapBFGS` returns `converged: true` on an early break with a NaN
  gradient (`bayes.js:276,291`); single-start MAP is a known open item (1.5.1 candidate).
- **Print robustness:** no `break-inside: avoid` anywhere in the print CSS (long advice or four notes can split a tile
  across the A4 page); the zoom heuristic measures on-screen height where `.rp-page` is `width:100 %` below 820 px.
- **SS-mode tension with recency weighting:** samples older than 29 × interval before the anchor are refused
  ("before the first dose", `ui.js:603-604`) because the expanded 30-dose history is treated as the whole dosing life,
  while the recency feature invites older samples. Unstated in the UI.
- **Docs staleness:** `RELEASE_NOTES_V150.md` says 16 refresh tests (actual 17) and 601 KB (now 613 KB); the live page is
  still 1.4.0 per the release notes while the README presents 1.5.0 as current without saying it is unpublished;
  `version.js:6` names a nonexistent `tests/test_version.js`.

## Low (condensed)

- Three `esc()` implementations disagree: `chart.js`/`diagnostics.js` escape no quotes (`diagnostics.js:15` not even
  `"`); `windowNoteOf` output is double-escaped on screen tiles (`ui.js:728` against `ui.js:62`) — latent `&amp;`
  mangling of a clinical label. Consolidate on one shared escaper covering `& < > " '`.
- `applySession` does not sort imported doses/obs (H1's trigger); `iv-amt` is silently overwritten with the last dose
  after every forecast (`ui.js:871`).
- Duplicate `id="chartTitle"` when the diagnostics modal is open (`chart.js:104`); no `fieldset/legend` for the
  schedule-mode radios or the window inputs; help popovers clip off-screen below ~360 px (`ui.js:1042`) and are not
  `aria-describedby`-linked; the chart's `desc` code path is never used (`ui.js:806-823`); the report date is
  locale-ambiguous (`toLocaleString`, `ui.js:1360`); a window lower bound of 0 is accepted; buttons outside forms default
  to `type=submit` (latent); destructive links have sub-minimum touch targets under 640 px (`app.css:358`).
- CMIA-converted observations are fitted with the LC-scale 14.9 % proportional error (one lab, 43 pairs) — acceptable,
  but it belongs in the model's assumptions list.
- Quantile method differs between results (`statsOfChain`, interpolated) and the diagnostics panel (`quantileOf`,
  nearest-rank).
- `fitConvergence`'s window Monte-Carlo-error indicator uses the actual chain while pediatric tacrolimus judges the
  corrected one (`bayes.js:481`).
- Regression records are self-referential by design (re-recorded from the current code); a sampler-only defect present at
  recording time would be pinned as "correct" forever — the residual risk should be stated in the README.
- The pediatric 64th test is registered in a loop (`test_pediatric.js:776`): a static grep says 63. A comment would save
  future audits a false mismatch.
- `mpa-tdm.html` v1.1.1 still sits in the root (flagged for deletion in the 1.2.1 audit, still not deleted) — a trap for
  anyone opening the wrong file. `installStubSpec` ships in the product (known, accepted).
- The no-dose-advice copy bans are blacklists, not guarantees: a newly written "consider 500 mg" passes every ban.
- Fonts carry the SIL OFL notice as a CSS comment; the full license text does not accompany the artifact.

## What survived the attack (verified, not assumed)

- **XSS: airtight.** All 35 user-data sinks traced; every value escapes or is engine-produced numeric; import assigns DOM
  properties only; no eval/new Function/string-setTimeout; the worker source is built only from the page's own inlined
  scripts; no DOM-clobbering or prototype-pollution paths. The 1.2.1 "no XSS" claim holds under a line-by-line attempt
  to break it.
- **The engine is genuinely hard to break.** All four sabotage mutations died: a disposition swap (15+ tests red), a 1 %
  AUC-normalization bias (5 tests), inclusive-bound semantics (1 test), a 4 % lag transcription (caught by the exact
  anchors only). NONMEM 7.6 cross-validation at 1e-6 across all five models, independent RK4/matrix-exponential oracles
  sharing no code, exact analytic invariants, a clever hung-test exit guard, and 100 % of `throws()` calls checking the
  message.
- **The claims culture is honest:** every README test count is real (runtime-verified 111/60/39/64/9/17), the repo map is
  accurate, it is truly offline (zero network calls), licensing is consistent, the timezone-naive datetime handling
  avoids the classic trap, contrast is AA+, the greyscale report claim holds, modal focus management works as documented,
  and no sentence in the app recommends a dose.

## Priority order

1. **C1** — guard the inferred/normalized interval (clinical numbers, zero warning today).
2. **C2** — snapshot the run view before the fit (report integrity).
3. **C3 + H5** — put the folder under version control; fix or enforce golden rule 3.
4. **H1** — the latest-in-time haematocrit fix in `tacrolimus.js`/`everolimus.js`, plus a sort in `applySession`.
5. **H2** — handle the empty/NaN case in `fitConvergence`.
6. **H3 / H6** — harness timeout, uniform tails, `unhandledRejection` handler; session round-trip and
   window-validation tests.
7. **H4** — aria-live on validation, the Ctrl+P fix, confirm/undo on destructive actions.
8. The Medium items as a batch.

The blunt summary: the math is world-class; the edges of the product — the parts a tired clinician touches at 17:00 on a
Friday — are where it can hurt someone. C1, C2 and H1 are small, cheap fixes; do them before the next release, and put
the folder under git before touching anything at all.
