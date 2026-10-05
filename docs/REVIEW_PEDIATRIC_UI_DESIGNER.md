# Review of NephroTDM 1.5.0 (pediatric MPA and pediatric tacrolimus): UI designer seat, gate G5

Reviewer: UI designer seat (did not write the code). Date: 5 October 2026.
Method: the built page `nephrotdm.html` (1.5.0) and the published 1.4.0 page were served on localhost and driven in the built-in browser, side by side in same-origin iframes so that the same state could be set in both and every element compared by position, size and computed style. Real clicks, typing and Tab/Enter presses were used for the main flows; `applySession` was used to set cases up. `docs/VERIFICATION_PEDIATRIC.md` and `docs/RELEASE_NOTES_V150.md` were read only after the findings below were written. No dose recommendation appears here. Invented patients only. Console: no errors on any page (the only messages were the browser's suppression of the native "Switching drug..." confirm, which is expected in the test browser).

## Verdict G5: PASS WITH COMMENTS

Nothing already shipped changed. The new drugs reuse the existing components and tokens, nothing clips at any of six widths, no horizontal scroll at 320 px. Two small text/label changes are required before release (R1, R2) because they bear on how a clinician reads a result or an error; neither changes layout.

## Required changes before release

| # | Change (described, not coded) | Why |
|---|---|---|
| R1 | Say on screen and in the report which row the window judges for pediatric tacrolimus. Smallest fix: add the words "(compared with the window)" to the corrected row, or put "corrected" in the three chip captions ("In the window (corrected)", etc.). Keep the sentence as it is. | With 0.24 L/L haematocrit the headline is 85.9 µg·h/L, visibly below a 100 to 250 window, while the chips say "In the window 95%". The corrected value (124) is what is judged, but only the sentence says so. See Q4. |
| R2 | Do not show the amber "built on" line for a value that is about to be refused, or add the refusal's unit hint to it. Albumin 3.4 g/L and weight 2 kg currently get an amber "outside the range the model was built on ... estimate is less reliable" and then, on Run, a refusal. | Two different messages for one value; the amber one implies the value is usable. See Q3. |

Recommended, not blocking: R3 (albumin and haematocrit placeholders), R4 (put the scope line under the weight/albumin row), R5 (refusal hint styling), R6 (tacrolimus report headroom), R7 (weight step 0.1). Details in Q3, Q4 and the defect list.

## Q1. Fidelity to the design system (1.5.0 against 1.4.0)

Evidence:
- Source diff of the built pages up to the first script: the whole stylesheet is byte-identical. The only markup differences are two extra `<option>`s in the hidden select, `#scopeWarn`, the two formulation wrappers (hidden unless the drug takes a per-dose formulation), the version/build comment, and the two report-dialog placeholders.
- Element-by-element comparison (position, size, 13 computed style properties) for mpa, tac and evr, in history and steady-state modes, at 1280, 768, 375 and 320 px (24 states): zero differences except the container heights that grow by the card list (+157 px at 1280/768/375, +178 px at 320) and the shift of everything below by that amount. Everything below the picker is identical in size, colour, font and spacing.
- After running a forecast for mpa, tac and evr (same seeded session in both pages): the results area, tiles, chart SVG, notes, explorer card and footer compare identical apart from the timing text and the version number.
- The A4 report HTML for mpa, tac and evr (after date and version are masked) is byte-identical between 1.4.0 and 1.5.0 (16984, 18861 and 17271 characters).
- Dialogs: Background (all three drugs), Getting started and the report dialog are identical in size, position and style; their text is identical (the report dialog differs only in the two placeholders). About differs only by the two new model sections and the version (it grows from 5760 to 7861 px of scroll, +36 %).
- Header, intro text, stepper and footer: identical apart from the version string.

Visible differences in the existing drugs, complete list: (1) two extra cards; (2) every input below the picker is 157 px lower (178 px at 320 px) because of them; (3) the two report-dialog placeholders are shorter ("e.g. J. Researcher, pharmacologist"; "e.g. Repeat the AUC after a change."); (4) the version number; (5) About has two extra model sections. No defects found in this question. One layout side effect worth knowing: between 768 and 1099 px the Weight/Haematocrit fields sit to the right of the last card (as they did beside the third card in 1.4.0); with five cards the white space to the right of the first four cards is now about 300 px tall. Same pattern as before, so not a defect, but see the D1 recommendation.

## Q2. The five-card picker (D1)

Measured (cards from the same `drugCardsHtml`, class `.drug-card`):

| Width | Card height | Names on two lines | List height 1.4.0 / 1.5.0 |
|---|---|---|---|
| 1920 / 1280 / 1100 | 67 px, width 398 | none | 224 / 381 px |
| 768 | 67 px, width 405 | none | 224 / 381 px |
| 375 | 67 px, width 325 | none | 224 / 381 px |
| 320 | 88 px for the two MPA cards, 67 for the others, width 270 | adult MPA (already in 1.4.0) and pediatric MPA | 223 / 379 + 21 px |

First weight input (top/bottom, page y): 1280 tacrolimus 603/647 in 1.4.0, 760/804 in 1.5.0 (all three weight-taking drugs 760). At 1280 x 800 the field's bottom edge is 4 px below the fold; real laptop windows (about 650 to 720 px of viewport) now hide it, where 1.4.0 showed it with 150 px to spare. 768: 573 to 730. 375: 793 to 950. 320: 881 to 1059. The builder's numbers are confirmed (603 to 760; two-line MPA names at 320).

Judgement:
- Order (MPA adult, MPA pediatric, tacrolimus adult, tacrolimus pediatric, everolimus): good; pairs are adjacent and the "(adult kidney)/(pediatric kidney)" suffix makes the pairing readable. Each card has name plus a one-line source (contrast 6.7:1 on white, 6.4:1 on the selected tint).
- Selected state: 2 px accent border (contrast 5.9:1) plus a faint tint, against a 1 px grey border on the others. It does not rely on colour alone (border weight changes) and `aria-pressed` carries it for assistive technology. The unselected border is 1.7:1, the same as in 1.4.0.
- Tap targets: 67 px minimum, above the 44 px token.
- Keyboard: native buttons. Tab visits all five (five stops instead of three, no roving focus; acceptable, a roving group would be a new component). Enter on a focused card selected it, `aria-pressed` moved, and focus came back to the newly selected card after the redraw. The 3 px focus ring is clearly visible on cards. Space works as for any button.
- Screen reader: container is `role="group"` labelled by "Drug / PK model"; each card is a button with `aria-pressed`; the hidden select is `aria-hidden` and `tabindex=-1`. The card's accessible name is name plus source line ("... AUC0-12h . Heida 2024"), as in 1.4.0. Minor: after a switch nothing announces that the fields below changed.
- Confirmation: with data entered a card press raises the existing native confirm "Switching drug clears the doses and samples entered for the current one. Continue?". Cancelling leaves the select and the pressed card on the old drug (verified). Accepting clears doses and samples; the weight stays (a weight typed for one patient carries into the next drug), the albumin and haematocrit are blanked. The message names only doses and samples. Minor.
- The hidden select's option labels do not match the card names ("Mycophenolic acid", "MPA (pediatric kidney)", "Tacrolimus (pediatric)" against "... (adult kidney)" and "... (pediatric kidney)"). It is `aria-hidden`, so nobody meets it; cosmetic inconsistency.

Recommendation on each option:
- Leave as is: **recommended** for all widths. Five 67 px cards are legible, tappable and keep every name on one line down to 375 px.
- Two-column grid: **not recommended at 1100 px and above**. The left column is 398 to 440 px, so two cards would be about 190 px each and the names would wrap to three lines, which is worse than the 157 px saved. The grid exists already (`repeat(auto-fit, minmax(210px, 1fr))`) but the card field is only 270 to 405 px wide in the 768 to 1099 band. If the owner wants the space back there, the one change is to let the card field take the full row between 768 and 1099 px so the existing auto-fit grid forms two or three columns and Weight/Haematocrit drop to their own row. That changes the look of the existing drugs at tablet width, so it is the owner's call; I do not require it.
- Shorter card names: **not needed**. At 320 px the two MPA names wrap to two lines (88 px cards), nothing clips, and the adult MPA card already did in 1.4.0. A shorter name ("MPA, pediatric kidney") would lose the spelled-out analyte for no gain on a size few phones have. The hand-off guard "names at most one line at 320 px" cannot hold; I propose rewording the guard to 375 px.
- Collapse (disclosure or Adult/Child switch): **no**. It is a new component, the owner chose flat cards, and hiding the drug list costs a tap on every visit.
- Page size: the built page is 617,671 bytes (603 KiB) against 532,429 (520 KiB), +85 KB (+16 %), about 81 KB by the builder's count. The pages are single self-contained files read from disk or a static host, readable (not minified), no network round trips; on any phone connection this is a fraction of a second more. I see no interface reason to act. It is the owner's decision whether to minify; a minifier would help, but this project ships readable source on purpose.

## Q3. The new inputs

Pediatric MPA (`mpaped`): Weight (kg), placeholder "e.g. 38", min 3, max 200 (hard limits), tooltip "Body weight in kg (3-200)"; Albumin (g/L), no placeholder, min 5, max 50. No haematocrit, no formulation row, no age. Both labels carry units, sentence case, with the existing info buttons. Help texts are clear: weight help says the model was built on 12.9 to 79.9 kg and that a warning shows outside it; albumin help says "34, not 3.4 g/dL" and states the steep albumin effect.

Pediatric tacrolimus (`tacped`): Weight (kg), placeholder "e.g. 25"; Haematocrit (L/L), no placeholder (as in adult tacrolimus and everolimus), min 0.1, max 0.7. Dose table has a "Formulation" column ("choose" in muted text for an empty row is not reachable because the add-dose form refuses it); the add-dose form has a "Formulation" select defaulting to "choose..." (options Capsule, Suspension; the longest is 10 characters, well under the 28 rule); steady-state mode has the same select ("Formulation", beside "Latest dose on"). All four numeric entry points are `inputmode="decimal"`.

Messages measured (typed values, then Run):

| Entry | Where | Wording | Judgement |
|---|---|---|---|
| albumin 3.4 | amber line in patient card (live) | "Albumin 3.4 g/L is outside the range the model was built on (24-42 g/L); the albumin effect is steep, so the estimate is less reliable." | Contradicts the refusal below (R2) |
| albumin 3.4 | under Run (on Run) | "Albumin 3.4 g/L is outside 5 to 50 g/L. Enter it in g/L (34, not 3.4 g/dL)." | Clear, specific |
| albumin blank | under Run | "Enter albumin." | Clear |
| haematocrit 30 | under Run | "Haematocrit 30 L/L is outside 0.1 to 0.7 L/L. Enter it as a fraction (0.33), not a percentage." | Clear |
| haematocrit blank | under Run | "Enter haematocrit." | Clear |
| weight 8 kg (tacrolimus) | amber line, live, and in results and report | "Weight 8 kg is outside the range the model was built on (9.1-78 kg)." Run proceeds. | Good: warning, not refusal |
| weight 2 kg | amber line and under Run | amber "...built on (9.1-78 kg)"; refusal "Body weight (3-200 kg) is required." | Wrong word: "required" for a typed value (same pre-existing wording as adult tacrolimus, "Body weight (30-250 kg) is required" for 5 kg), and the two lines disagree (R2) |
| dose without formulation, add-dose | toast | "Choose the formulation of this dose (capsule or suspension)." | Clear |
| history with a dose lacking formulation, Run | under Run | "Choose the formulation (capsule or suspension) for dose 1." | Clear, names the dose |
| steady-state regimen without formulation, Run | under Run | "Choose the formulation of the regimen (capsule or suspension)." | Clear |

Findings:
- The "choose..." default does not look like an error (normal select, normal text), and the requirement is stated in plain words when missed. Good.
- Discoverability of the formulation choice: good. Label is visible in both modes. In steady-state mode the label is just "Formulation" (the tooltip says "of the regimen"); acceptable.
- Visible scope-warning line: amber `.note.warn` (existing style, contrast 6.7:1, 14 px). It sits after the model description paragraph, below the window rows, not under the weight/albumin row: about 130 px below the fields at 1280 and roughly 450 px below at 375 (off screen while typing). It is repeated in the results (as a bold "Outside the model's range." lead in the muted 12.5 px note under the tiles, which is easy to miss) and in the report Notes. Recommend R4: move `#scopeWarn` directly under the covariate row, so the cause and the message are on the same screen; and, optionally, a warn badge ("Outside the model's range") in the status chip row of the results using the existing `.badge.warn`.
- Errors under Run (12.5 px, dark text, no border or icon) look like ordinary helper text; at 320 px the refusal sits below the sticky bar directly above the "Log scale" checkbox, while the amber stale banner above it ("Inputs changed...") is more conspicuous than the refusal. This is the existing pattern for all drugs, so it is not a regression, but errors on albumin and haematocrit are the likeliest new mistakes. R5: give the refusal hint the existing `.note.bad` look (a design decision that also touches the existing drugs, so owner's call).
- R3: add placeholders "e.g. 34" (albumin) and "e.g. 0.33" (haematocrit, pediatric tacrolimus). A placeholder is the cheapest prevention for the 3.4 and 30 mistakes, and the weight field already has one.
- Weight: `step="0.5"` is inherited, so 12.3 kg is natively "invalid" (`:invalid` is not styled and there is no form, so nothing shows) and the spinner moves in 0.5 kg steps. For children a step of 0.1 is the natural one (R7, minor).
- Info buttons are 19 x 23 px (14 x 21 at 375), well under 44 px; pre-existing for every drug, but these buttons now carry the most useful guidance (g/dL against g/L). The albumin button's accessible name is just "Albumin" while weight's is "What is the weight field for?" (pre-existing pattern, e.g. haematocrit).
- Input and select boxes are 40 px tall (existing; the "44 px" token applies to buttons).

## Q4. Results and report

Pediatric tacrolimus on screen (and in the report): two rows per tile, measured (large) and corrected (small, outlined bar), and the window is judged on the corrected value: "97% chance the corrected AUC is within the window 100 to 250 µg·h/L". Pediatric MPA: one AUC tile (window 30 to 60) and "Predicted trough, steady state", labelled informational ("Predicted concentration just before the next dose. Informational: the app has no trough target."), no corrected row and no haematocrit anywhere.

Which value does the probability refer to?
- Sentence: stated ("corrected"), in plain type inside the sentence only.
- Chips and range bar: not stated. In the test case (haematocrit 0.24, window 100 to 250) the headline is 85.9 and its dark bar lies to the left of the dashed lower window edge, the chips read "In the window 95%", and the corrected value 124 (99.8 to 161) is in a smaller row. A hurried reader sees a result outside the window labelled 95 % inside it. R1 closes this. The same holds in the printed report (same builder). The window rows themselves ("Therapeutic window: AUC0-12h 100 to 250") say nothing about corrected values either.
- Everything else about the tiles is clear and consistent with adult tacrolimus.

"The estimate describes the sampled day": shown as the second sentence of the muted note under the tiles ("Steady-state values for the current regimen ... The estimate describes this patient on the day of the samples. Exposure changes from day to day and over months; in a prospective evaluation, predicting the AUC about three months later was not accurate. Repeat measurements.") and in the report's "How to read this". Visible on first view at 1280 x 800 (just inside the viewport), after the tiles on a phone; plain, muted, one place, not repeated on every tile: not nagging, and adequate. The scope line "Children with a kidney transplant. Describes the sampled day." is in the report header; there is no scope line under the screen tile title (the hand-off's section 6.3 asked for one; the three Background/About texts and the note carry the same content, so I do not require it). The note ends with the terse "Repeat measurements."; wording is the clinical pharmacologist's call.

Printed A4 report (`ECU.ui.renderReport()` with `window.print` stubbed, `.rp-page` `min-height` removed, 794 px wide):

| Drug | Mode | Window | Samples | Content height |
|---|---|---|---|---|
| tacped | steady state and history (identical) | yes | yes | 1073 |
| tacped | both | yes | no | **1103** |
| tacped | both | no | yes | 1036 |
| tacped | both | no | no | 1066 |
| mpaped | both | yes / no | yes | 1031 |
| mpaped | both | yes / no | no | 1061 |
| (existing, for reference) tac 1094, evr 1000, mpa 977 | | | | |

Limit 1103 of 1123. Pediatric tacrolimus with a window and no samples reaches exactly 1103: it passes with no margin (the builder reported 1097 as the largest; the difference is my advice text, 115 characters). Any longer free text (a three-line advice, a two-line patient identifier, a long "prepared by") pushes it to a second page: with a 380-character advice, 60 characters of "prepared by" and a 37-character identifier I measured 1256 (tacped) and 1197 (mpaped); nothing is clipped (no overflow in any element), the sheet simply grows. The adult tacrolimus report is already at 1094 and has the same property, so this is a pre-existing limit; the new header (a 3-line model citation) uses the room. R6: shorten the tacped citation line or the "Windows:" source line by one line to restore 20 to 30 px of headroom. Not blocking.

Legibility and greyscale: judged from screenshots of both new reports. Black and mid-grey only; the measured interval is a solid bar, the corrected interval an outlined bar, the window a hatched band with dashed edges, medians are ticks, so every distinction survives greyscale by shape and fill. Text is at least 12 px; the three-column table, "How to read this" and the signature block are unchanged in structure. Both reports read cleanly. Detail: the report title says "NephroTDM report: tacrolimus" (or "mycophenolic acid") without "pediatric"; the scope line directly below says "Children with a kidney transplant", so no ambiguity, but the title could carry it. In the pediatric tacrolimus report the legend names "measured", "corrected" and "window" but not which one the window judges (part of R1).

Explorer (card 4): works for tacped; the output says "every 12 h, at steady state, capsule" (the last dose's formulation); there is no formulation control in the explorer, so the assumption is shown only after running. Minor.

## Q4b. Field-fit audit

`tools/audit_fields.js` (negative control confirmed: forcing the dose-form select to 60 px makes it report). `auditFields()` run for mpa, mpaped, tac, tacped and evr, in history and steady-state modes, on the page and with the report dialog open, at 320, 375, 480, 640, 768, 1100, 1280 and 1920 px (480 and 640 added to approximate 300 % and 200 % zoom): **zero offenders**; no horizontal page scroll at any of them (`scrollWidth` equals `innerWidth`, 320 px included). `node tests/test_refresh.js`: 16 passed.

Side observations at 320 px: the pediatric tacrolimus dose table (6 columns) has a 43 to 45 px "Date & time" column, so dates wrap onto three or four lines, exactly as the adult tacrolimus table does with its prednisolone column; a 12.55 mg dose makes the table 2 px wider than its scroll wrapper (`.tbl-wrap`, `overflow:auto`), invisible in practice.

## Q5. Accessibility and phone

- Focus order: header links, session controls, restore bar, stepper links, the five cards, then the fields in document order; the 3 px accent ring (offset 2 px) is visible on cards and fields.
- Sticky run bar: `position: sticky; bottom: 0; z-index: 20`, 69 px, 44 px button; identical to 1.4.0. Refusal messages appear below the bar, not in it.
- Keypad: every numeric field, new ones included, is `inputmode="decimal"`; date fields are native.
- Select labels: Capsule, Suspension, "choose...", "Formulation" (all well under 28 characters); the hidden select is out of reach.
- Contrast (computed): warning line 6.7:1 (rgb 146,64,14 on 255,248,236, 14 px); card sub line 6.7:1; muted hint text 6.7:1; selected border 5.9:1. No new badges were added.
- Reduced motion and dark mode: the stylesheet is byte-identical to 1.4.0, so the existing `prefers-reduced-motion` guards are untouched and there is still no dark-mode query; nothing new animates.
- 200 % zoom (640 px wide) and 300 % (480 px): no offenders, no clipping.
- Autosave round trip for pediatric tacrolimus (per-dose formulations, regimen formulation, haematocrit, window): restores exactly.

## Defects and comments (with reproduction)

| # | Severity | Finding | Reproduce | Suggested fix |
|---|---|---|---|---|
| D-1 | Should fix (R1) | The window is judged on the corrected value, but the headline value and chips do not say so | Pediatric tacrolimus, weight 25, haematocrit 0.24, steady state capsule 1.6 mg every 12 h, trough sample 5.0 (haematocrit 0.24), window 100 to 250; Run. Headline 85.9, "In the window 95%" | Mark the corrected row or the chip captions as the judged value, on screen and in the report legend |
| D-2 | Should fix (R2) | Amber "estimate is less reliable" shown for values that Run will refuse | Pediatric MPA, albumin 3.4 or weight 2 (steady state, a dose, Run) | Suppress the amber line beyond the hard limits or add "enter g/L (34)" |
| D-3 | Minor (R4) | Scope warning far from the field that causes it | Pediatric MPA at 375 px, weight 8: warning is about 450 px below the weight field | Place it directly under the covariate row |
| D-4 | Minor (R5, existing) | Refusals are plain 12.5 px text; amber stale banner is louder | Any drug; albumin 3.4, Run | `.note.bad` look for the refusal hint (owner's call; touches existing drugs) |
| D-5 | Minor (R3) | No placeholder on albumin and haematocrit | Pediatric drugs | "e.g. 34", "e.g. 0.33" |
| D-6 | Minor (R6) | Pediatric tacrolimus report with window and no samples is exactly at the 1103 px limit | `renderReport()`, tacped, window set, no samples | Shorten the header citation by a line |
| D-7 | Minor (R7) | Weight step 0.5 for children | Weight 12.3 is natively invalid; spinner in 0.5 kg steps | step 0.1 for the pediatric specs |
| D-8 | Minor | "Body weight (3-200 kg) is required." for a typed out-of-range weight (pre-existing wording) | Weight 2, Run | "Body weight 2 kg is outside 3 to 200 kg." |
| D-9 | Minor | Out-of-range note in the results is a muted bold-lead sentence below the tiles | Pediatric MPA, weight 10, albumin 20 | Optional `.badge.warn` chip in the status row |
| D-10 | Cosmetic | Hidden select option labels differ from card names | Read `#pt-drug` | Use the spec labels |
| D-11 | Cosmetic | Report title lacks "pediatric" | Any pediatric report | Add "(pediatric kidney)" |
| D-12 | Info (pre-existing) | Info buttons below tap size; dose table crowded at 320 | | none for this release |

No blocker.

## Reproduction notes

Harness files (throwaway, not part of the repository): `/tmp/claude-501/review_ui/` (copies of both pages, the audit script and the comparison helpers). The temporary `.claude/launch.json` and `.claude` directory were deleted, the three static servers stopped, tabs closed and the viewport reset to desktop.
