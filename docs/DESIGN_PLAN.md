# MPA TDM — design modernization plan
**Designer audit (looks only) + HTML-coder implementation plan · drafted against v0.2.5**

Scope rule: **nothing in this plan changes functionality, copy, or clinical behavior.**
It is a visual layer over the existing DOM. The app stays a single-file, dependency-free,
offline HTML artifact.

---

## Part 1 — Designer's audit (what reads "unfinished" today)

The current language is *utilitarian flat*: white cards, uniform 1px borders, no
elevation, one transition, system defaults wherever CSS doesn't intervene. It is clean
and honest — and it reads like a prototype. Ten findings, most severe first.

### D1. No elevation system — everything sits at the same depth
Cards (`.card`), modals (`.modal`), and notes all share flat white + 1px `#d1d5db`.
The only shadow in the whole app is on the help popover. Without a depth hierarchy the
interface reads as a wireframe.
**Fix:** a 4-step shadow scale (`--shadow-xs … --shadow-lg`), cards at `xs`, sticky
elements at `sm`, modals at `lg` + dimmed/blurred backdrop; structural borders lightened
(`#d1d5db → #e3e7ec`) so shadows, not lines, do the separating.

### D2. The hero number doesn't lead
The steady-state AUC estimate — the single number the whole app exists to produce —
renders at 22px inside a bordered cell identical to its neighbors (`.res-cell`).
**Fix:** a hero treatment in the Forecast card: 28–32px, strong ink or accent, unboxed
(or a soft tinted panel), with the 5–95% interval directly beneath; supporting metrics
(trough, probabilities) stay compact cells. The dose explorer keeps the grid but with
one emphasized AUC column.

### D3. Buttons feel dated
`button.primary` is a solid accent fill with a same-color 1px border, radius 6, no
hover, no focus style of our own; `:disabled { opacity: .5 }` is the only state. There
is no secondary button — every non-primary action is an underlined gray `.linklike`.
**Fix:** a three-tier system — primary (accent fill), secondary (white, accent border +
accent text), ghost (transparent, muted → ink on hover) — each with hover shift, active
press, and a `:focus-visible` ring. One radius token for all of them.

### D4. Typography sprawl — eleven sizes, weak hierarchy
In use today: 11, 12, 12.5, 13, 14, 15, 16, 18, 20, 22, 24px. Body 15px, muted labels
12px everywhere, headings only 16px. The good pattern that already exists — modal `h3`
small-caps with letter-spacing — is confined to modals.
**Fix:** a 6-step scale (12 / 13 / 15 / 18 / 24 / 32); small-caps section labels promoted
to card headers and field groups; keep `font-variant-numeric: tabular-nums` everywhere
it already is (that part is right). Headings gain weight contrast (card `h2` 15px/650).

### D5. Forms don't announce interactivity
Inputs are browser-default; focus is the UA outline or nothing; the dosing-mode picker
is bare radios; the `< LLOQ` checkbox is default chrome.
**Fix (CSS-only):** unified field treatment (border, radius, 7px 10px padding), hover
border shift, accent focus ring (2px + 2px offset) via `:focus-visible`; the dosing
mode becomes a true segmented control (pill track, selected segment filled); LLOQ
checkbox gets a styled check.

### D6. Spacing has no rhythm
Margins/paddings in the stylesheet: 2, 3, 4, 6, 8, 10, 12, 14, 16, 18, 20px — ad hoc.
Cards pad 14/16px; the main column gap is 14px; density is uneven between cards.
**Fix:** a 4px-based scale (`--sp-1…--sp-6` = 4/8/12/16/20/28), card padding 20px,
consistent inter-card gap (20px), field groups tightened to 8px. More air, calmer scan.

### D7. Accent color is over-committed
Teal `#0e7490` currently means: primary action, informational links, stepper circles,
selected fold values, help focus. When everything is accent, nothing is.
**Fix:** accent reserved for primary action + focus + the hero value; informational
affordances move to a lighter derived tint (e.g. `#0e7490` at 80% or a slate link tone);
semantic ok/warn/bad pills stay exactly as they are (they're good).

### D8. Overlays appear without transition
`.modal-backdrop` and `.toast` switch from `display:none` instantly.
**Fix:** 160ms modal fade + slight scale (0.98 → 1), backdrop `backdrop-filter: blur(3px)`
with a solid-color fallback, toast slide-up 180ms — all guarded by
`@media (prefers-reduced-motion: reduce)`.

### D9. Folds and stepper lack affordance
`details` folds open with no indicator (a bold value + "Edit" text); stepper circles
are not connected.
**Fix:** chevron glyph in every fold summary rotating 90° on open (CSS `details[open]`);
stepper steps joined by a 2px line, current step emphasized.

### D10. Chart styling is functional but plain
(Visual attributes only — the SVG engine in `chart.js` is untouched except attribute
values/CSS hooks.) Hard gridlines, uniform strokes, plain legend text.
**Fix:** gridlines to a 6% ink tone, IPRED stroke 2.25px with round caps, uncertainty
band at 12–16% fill, observed points with white 1.5px halo, axis/legend typography on
the 12px small-caps pattern, legend as color swatches inline.

### D11. The window hint is an essay on the main screen (added after v0.2.5)
The inclusive `windowHint` under the therapeutic-window fold runs ~700 characters —
every indication, every bound, every caveat — violating golden rule 9 (keep the main
screen light). The full reference table already lives behind the **MPA TDM background**
button, where it belongs.
**Fix:** compress the on-screen hint to a pointer — *"See 'MPA TDM background' for
reference values and best practices for TDM"* — and move the inclusivity guarantees
(heart >36, lupus ≈50, nephrotic >45–50, lung, HSCT, liver) into the background-dialog
test, which is where the full table is asserted. The printed report keeps printing the
actual bounds (it already does, from `windowBounds()`), so the audit trail loses nothing.

**Explicitly not changing:** the ok/warn/bad semantic *system*, badge pill shapes,
tabular numerals, the print stylesheet's structure, any behavior. (Text-token shades of
the semantic colors may deepen where the contrast audit demands AA — the hues stay.)

---

## Part 2 — HTML coder's constraints (what the plan must respect)

1. **Single-file, offline, dependency-free — absolute.** No webfonts (the system font
   stack stays), no icon libraries (any icons are inline SVG or unicode already in use),
   no CSS frameworks, no `backdrop-filter` dependency without a fallback.
2. **All work happens in `src/app.css`** plus minimal, additive class hooks in
   `index.html` where CSS needs a handle (e.g. segmented control wrapper, chevron span).
   Two precisely-scoped exceptions, both purely presentational: (a) `renderResults()` in
   `src/ui.js` may gain a `res-hero` class on the AUC cell (D2 needs a handle in
   JS-generated markup); (b) color/width *constants* in `src/chart.js` may be adjusted
   (D10 — they are the CSS-equivalent for generated SVG). No logic, no copy, no behavior.
   `mpa-tdm.html` is generated — rebuild after every change, never hand-edit.
3. **Accessibility is part of "looks":** WCAG AA contrast (muted text stays ≥ 4.5:1 on
   white), `:focus-visible` rings on every interactive element, `prefers-reduced-motion`
   respected. The app is used by clinicians under time pressure — states must be
   visible, not subtle.
4. **The print report must not regress.** `#reportSheet` + the `@media print` block stay
   structurally intact; every phase ends with a print-preview check.
5. **Tests stay green (35).** The UI tests lock copy strings, not styles, so a pure
   CSS/marker phase should not touch them; if a test breaks, the phase is wrong.
6. **Version bumps per phase** (`src/version.js` + `package.json` together).
7. **Every phase is independently shippable and git-revertable** — one commit per phase.

---

## Part 3 — The plan (4 phases)

### Phase 0 — Design tokens (foundation, zero visual risk)
Add to `:root` in `app.css`: spacing scale (`--sp-1…-6`), type scale (`--text-xs…-3xl`),
radius scale (`--radius-sm/md/lg/pill`), shadow scale (`--shadow-xs/sm/md/lg`),
`--focus-ring`, `--dur-fast/base`, refined palette values (lighter structural border,
accent-tint, keep semantic colors). Nothing consumes them yet.
*Verify:* build + tests + pixel-identical screenshot.

### Phase 1 — Chrome: header, cards, buttons, inputs
Cards: lighter border + `--shadow-xs` + 20px padding; header brand treatment (accent
keyline or mark, version as a quiet chip); three-tier buttons with hover/active/focus;
unified input styling with focus ring; notes/badges unified on tokens; footer tidied.
*Verify:* build, tests, before/after screenshots, keyboard tab-through shows rings,
print check.

### Phase 2 — Data surfaces: hero result, tables, controls, chart, window hint
Hero AUC treatment in the Forecast card (D2); dose-explorer grid with emphasized AUC
column; tables (`.data`) with row hover + softer header; dosing-mode segmented control;
LLOQ styled checkbox; folds with rotating chevrons; stepper connector line; chart
visual pass per D10 (attribute values only); **window hint compressed to the pointer
(D11)** — a `src/model.js` spec-text change with its tests updated red-first, the only
content change in the program.
*Verify:* build, tests (hint test red against the long text first), screenshots of every
card, chart log-y + linear, print check.

### Phase 3 — Overlays, motion, final polish
Modal entrance (fade + scale) and blurred backdrop with fallback; toast slide-up; help
popover refinement; `prefers-reduced-motion` guard over everything added; final pass —
contrast audit of every text/background pair, spacing audit on the 4px scale, dead rules
removed, screenshot tour of all states (pending, post-run, explorer, modals, report).
*Verify:* full suite, print report, version bump to **0.3.0**, register preview.

**Total estimate:** the CSS work is bounded — `app.css` is currently 176 lines; the
finished sheet lands around 300–360 lines, still one file, still no dependencies.

**Rollback:** each phase is one commit touching only `app.css` (+ additive markers in
`index.html`); `git revert` restores the previous look with no functional risk.
