# Adversarial review — MPA TDM skeleton (v0.1.1)

**Scope.** `mpa-tdm/` as of 19 Sep 2026, pending PK model. Reviewed as if the model file
arrived tomorrow and `pending` were flipped to `false` without rewriting the engine.

**Method.** Line-level reading of `src/model.js`, `src/bayes.js`, `src/chart.js`,
`src/diagnostics.js`, `src/ui.js`, `index.html`, `app.css`, the test suite, and the live
preview. Compared against `plan.md`, `CLAUDE.md`, and the IATDMCT consensus (Bergan 2021).

**Overall.** The shell, pending-model gate, window metadata, and probability helpers are
sound. The **forecasting machinery is not ready to un-pend**. Several defects would
silently emit AUC = 0, a trough of 0, an empty chart, and an explorer that is not
steady-state. Do not complete the spec until the items in §1 are fixed and tested red→green.

**Time unit (non-negotiable for this app).** All time scales everywhere — engine
calculations, ODE rates, grids, OFV observation times, plots, form fields, session JSON,
and the printed report — **must be in hours**. Not days. This is a deliberate departure
from the complement app (`CLAUDE.md`: “Time is in days everywhere in the engine”). MPA
TDM is a 12-hour (sometimes 8- or 24-hour) problem: LSS times are 20 min / 1 h / 3 h,
AUC is mg·h/L, τ is hours. Mixing days and hours is how a 24× AUC error happens (it
already did once in `aucFromConc`). See **P0-8**.

Severity:
- **P0** — would produce a wrong clinical number, or a number that looks like a result
- **P1** — wrong enough to mislead a careful user, or a gate that blocks a real workflow
- **P2** — correctness/robustness debt that should be paid before first real use
- **P3** — usability / polish

---

## 1. Machinery (engine)

### P0-1. `simulate()` discards every concentration and always returns zeros

`src/model.js` walks the event list, integrates, then:

```js
if (e.kind === 'out') { y[0] / p.v1; }   // computed, discarded
…
for (i = 0; i < nOut; i++) res[i] = 0;
return { c: res, failed: false };
```

`failed` is also **always** `false`, even when `integrate()` returned `{ok:false}`.

When `pending` is cleared, every MAP, MCMC, AUC and trough will be identically 0 (or
NaN-then-zero). The pending gate currently hides this. There is **no test** that a
completed spec produces a non-zero concentration.

**Fix.** Port the working event-loop + output indexing from the complement app
(`src/model.js` `simulate`). Store `res[idx] = y[0] / p.v1` at each `out` event. Propagate
`failed`. Add a can-fail test: with a tiny completed oral spec, C(t>0) after a dose must be
> 0.

### P0-2. AUC grid is not the dosing interval (and is not in the same time origin as the data)

`runFit` builds

```js
outTimes[k] = k * (horizonHours / 24) / steps;   // 0 … ~0.5 days
```

Doses and observations are `datetime-local` → **days since 1970**. The simulator is then
asked for concentrations at t = 0…0.5 days of the Unix epoch, while the entered doses sit
around 20,000 days. Two independent bugs:

1. **The interval being integrated is not the interval after the last dose.**
2. **Observations never land on the grid**, so the chart cannot overlay samples on the
   curve, and the OFV is evaluating predictions at the sample times (absolute) against a
   model whose “AUC grid” is a different clock.

`doseScan` uses a *third* convention (`lastDose.t + k·Δt`). `aucFromConc` then assumes the
vector is a **uniform** grid spanning **exactly** `intervalHours`. If `horizonHours ≠
intervalHours` (it is `max(12, intervalHours)`), the trapezoid is scaled to the wrong
width.

**Fix.** Hours everywhere (P0-8). One function, used by `runFit` and `doseScan`:

```
t0 = lastDose.t          // hours
τ  = intervalHours       // hours
outTimes[k] = t0 + k * τ / n
```

Pass the same `outTimes` into `aucFromConc` *or* integrate against the actual `Δt` of the
grid in hours (do not assume `τ / (n-1)` unless that is how the grid was built). Add a
test: last dose at t = 100 h, interval 12 h → grid ∈ [100, 112], AUC of a constant
3 mg/L = 36 mg·h/L. No `/ 24` anywhere in this path.

### P0-3. “Trough” is min(curve), not C(τ)

```js
for each point: if c[i] < cmin: cmin = c[i]
troughs[d] = cmin
```

For a single oral dose from zero this is **C(0) = 0**. For a curve with enterohepatic
recirculation the minimum is not necessarily pre-dose. Consensus (Bergan 2021) treats
trough as **pre-dose C0**.

**Fix.** Trough = concentration at `t0 + intervalHours/24` (last grid point of a
dose-to-dose grid), optionally also report C at `t0` if a dose is instantaneous. Test:
monotonic decay from 10 → 2 over 12 h → trough = 2, not 2-or-less of the interior.

### P0-4. Dose explorer does not evaluate a new *maintenance* dose

`runExplorer` passes

```js
doses: [{ t: lastDose.t, amt: candidate, route }]
```

i.e. **one isolated dose from zero**. Even `doseScan`’s own “replace last dose only”
path would leave the previous 9 SS doses at the old amount, so the candidate AUC is
neither SS at the new dose nor a single-dose AUC the user asked for.

This is the feature the app exists to provide.

**Fix.** Build a candidate *regimen*: same interval, candidate amount, N SS doses ending
at the anchor (reuse `ssToDoses` with the new amount), simulate the last interval.
Never a single-dose-from-zero. Test: doubling every SS dose roughly doubles SS AUC for a
linear model.

### P0-5. OFV has no prior — this is MLE, not MAP

`makeOfv` returns only the residual sum (`d² + log v`, plus M3). There is no
`η′ Ω⁻¹ η` term. `runMCMC` uses the same OFV, so the chain is a likelihood sampler,
not a posterior. Laplace covariance is computed and **ignored** (proposal is
`x + 0.2·N(0,1)` regardless).

Consequences once un-pended: sparse MPA samples (the intended use) will overfit, etas
will walk off to ±∞, AUC intervals will be either huge or overconfident, acceptance
will be arbitrary.

**Fix.** Port the complement app’s OFV (likelihood + prior) and the adaptive RW
Metropolis that uses the Laplace (or empirical) covariance. Keep the pending gate until
a sabotage test shows MAP recovers a planted η on a 3-point LSS.

### P0-6. Chart bands and IPRED are never filled

```js
chartBand: { p5: null, median: null, p95: null }
obsData: obs.map(o => ({ …, ipred: NaN }))
```

After a “successful” fit the chart is empty (no series, no band) and diagnostics GOF
has nothing to plot. The HTML still claims “red points = measurements · dashed amber =
therapeutic window”.

**Fix.** After `simulateDraws`, compute per-time-point p5/median/p95 into `chartBand`.
IPRED = simulation at MAP (or posterior median η) at each observation time. Test: with
a stub simulator that returns `c[i] = 1+i`, `chartBand.median` is not null.

### P0-8. Time unit is days in the engine and mixed in the UI — it must be hours everywhere

Complement-app convention (`CLAUDE.md`) is days in the engine. This MPA app copied that
and then papered hours on top:

| Place | Unit today |
|---|---|
| `simulate` / `integrate` / `rhs` rates (`KA_D`, `CL/V`) | specified as 1/day |
| `runFit` grid | days (`horizonHours / 24`) |
| `doseScan` grid | days (`lastDose.t + k * (intervalHours/24) / steps`) |
| `aucFromConc` | hours (after the 24× fix) |
| SS interval field | hours |
| `datetime-local` → `dtLocalToDays` | days since 1970 |
| Chart x-axis | days (0–0.5 for a 12 h curve) |
| Recency | days (`ageDays / 365`) |
| Session JSON `doses[].t` / `obs[].t` | days |

That mixture is a defect, not a compromise. A clinician entering “+3 h after the 08:00
dose” should see 3, store 3, integrate 3, plot 3. Converting to days for the ODE and back
to hours for AUC is how P0-2 and the original 24× `aucFromConc` bug happen.

**Requirement.** Hours is the single time unit in this app:

- Engine: `t` in hours; rates in 1/hour (`ka`, `k12`, `k21`, `CL/V`); infusion duration
  in hours; `ssIntervalDefault` already hours — keep it; drop every `/ 24` and `* 24`.
- When the model file is transcribed, convert published 1/day rates to 1/hour **once**,
  at ingestion, and document the factor in the spec.
- Grids, OFV observation times, posterior draws’ simulated times: hours.
- Plots: x-axis in hours (post-dose or clock-hours-from-anchor), labelled “Time (h)”.
- Fields: interval in hours; LSS offsets in hours (and minutes only as `0.33 h`); do not
  convert `datetime-local` through days-since-epoch. Prefer hours-from-anchor internally,
  with civil clock time as a display/entry convenience that round-trips via hours.
- Session JSON and the printed report: hours.
- Tests: a planted 12 h interval must never be stored as `0.5`.

Do **not** keep days internal and convert at the UI boundary (the previous P1-10 suggestion).
That split is exactly the bug surface this finding forbids.

**Fix.** Pick hours as the unit in `model.js` / `bayes.js` / `ui.js` in one pass with P0-2.
Ban `/ 24` and `* 24` in the MPA tree except a single, commented conversion at model-file
ingestion. Test: `ss-interval = 12` → `input.intervalHours === 12` → grid span === 12 →
chart `xMax === 12` → report says AUC0–12h with a 12 h axis.

### P0-7. Log-y is a lie

`chart.js` computes `logTicks` when `cfg.logY` is set, but `sy(y)` is still linear in y.
Checking “Log scale” relabels ticks and leaves the geometry linear (or puts ticks in
the wrong place).

**Fix.** `sy = y0 + ph - (log(y)−log(yMin))/(log(yMax)−log(yMin))*ph` when `logY`, with
`yMin > 0`. Test: point at yMax maps to the top in both modes.

### P1-1. SS interval typed by the user is ignored by the engine

UI: SS mode has “Interval (hours)”. `buildRunInput` always sends
`intervalHours: M.drug().ssIntervalDefault || 12`. Q8h / Q24h (HSCT, some centres) is
silently treated as Q12h. AUC0–τ is then the wrong τ.

**Fix.** `intervalHours` = SS field if mode is `ss`, else last-dose Δt if ≥2 doses, else
spec default. Surface the value in the results header (“AUC0–8h” must mean 8).

### P1-2. Recency presets are decorative

```js
var mx = preset && preset !== 'off' ? 1.5 : 1;
```

Low / medium / high are identical (×1.5). Complement app uses 1.5 / 2 / 3.

**Fix.** Map `off/low/medium/high` → 1 / 1.5 / 2 / 3, or remove the control until it
does something.

### P1-3. `statsOfChain` does not drop NaNs

`probBetween` correctly skips non-finites. `statsOfChain` sorts the raw array (NaN
sort is implementation-defined in JS) and reports p5/median/p95 that can be NaN or
shifted. A few failed draws then silently poison the headline AUC.

**Fix.** Filter `isFinite` first, as the probability helpers do. If n = 0, return NaNs
and let the UI say so.

### P1-4. Dual covariate contract, and generated rows are unread

`covariateFields()` honours boolean flags (`covariateWeight` …) and **ignores**
`spec.covariates[]`. Generated `#cov-*` inputs are never read by `readCovariates()`.
`renderDrugAndCovariates()` appends without de-duplicating; toggling the window fold
re-runs it → duplicate rows for any non-static covariate.

**Fix.** Single source: `spec.covariates` (or flags derived from it). Read all declared
ids. Idempotent render (clear host before fill). Test: a spec with `{id:'albumin'}`
shows one row and `buildRunInput()` carries the value.

### P1-5. MCMC / Laplace are stubs relative to the complement engine

- 2-eta hard-coded (`eta[0], eta[1]`, proposal `[x[0]+…, x[1]+…]`). An MPA model with
  ka/F/EHR etas will silently drop them.
- No adaptation, no ESS, no R̂. Acceptance is shown; it is not diagnostic of mixing.
- Laplace is diagonal-only and unused.

Acceptable as a skeleton **only if** the un-pend checklist requires porting the
complement  N-eta sampler. Write that down in `tools/verify_model.mjs` as a hard fail
until `indivParams` / OFV / MCMC share an eta dimension.

### P2-1. `aucFromConc` trusts the caller’s interval, not the grid

Already noted under P0-2. Even after the grid is fixed, prefer
`Δt_i = (t_i − t_{i−1}) * 24` so a non-uniform LSS-shaped grid cannot silently
mis-scale.

### P2-2. No assay, no formulation

Bergan 2021: estimators are **assay-specific**; MMF vs EC-MPS have different
absorption and LSS. The app has an error multiplier and no method/formulation field.
A future model for LC-MS/MS MMF will be applied to EMIT EC-MPS numbers with no
warning.

**Fix.** Dropdowns (LC-MS/MS / HPLC / EMIT / PETINIA / CEDIA; MMF / EC-MPS), stored in
the session, printed in the report, checked against `spec.assay` / `spec.formulation`
when those exist.

### P2-3. Pediatric patients are rejected

`wt >= 25 && wt <= 300` in both UI and `runFit`. Consensus explicitly covers pediatric
KTR. Many children are < 25 kg.

**Fix.** Range must come from the spec (`covariateFields[].min`). Do not hardcode 25.

### P2-4. Malformed SVG attributes

Series/legend paths close with `'" />` — an extra quote (`stroke-dasharray="4 4""`).
Browsers forgive it; it is still invalid SVG and a trap for a future XML serializer.

### P2-5. Tests do not protect the P0s

Current suite (18 tests) covers pending-gate, window metadata, `aucFromConc` on a
hand-built vector, and probability arithmetic. It cannot go red for P0-1…P0-6.
That violates golden rule 7b for the machinery that will actually be used.

**Fix.** Before un-pending: a stub completed spec + tests for non-zero C(t), grid
origin, trough = C(τ), explorer SS doubling, OFV prior term, filled `chartBand`.

---

## 2. User interface

### P1-6. Run is disabled in the mode users will actually use

```js
var canRun = !pending && !state.running && state.doses.length > 0;
```

Steady-state mode never writes `state.doses` (`ssToDoses()` is computed at run time).
After the model arrives, a user who fills Dose + Interval + Anchor will stare at a
disabled **Run forecast** with no explanation.

**Fix.** `canRun` uses `effectiveDoses().length`, and the hint says *why* it is
disabled (pending / no dose / no weight).

### P1-7. Stale banner on a blank form

`markStale()` fires on every `input` of weight, window, SS fields, even when
`lastRun === null`. First keystroke produces “Inputs changed. Press Run forecast to
update.” Nothing has been run.

**Fix.** Only show stale if `state.lastRun` is set.

### P1-8. Help is a 2.6 s toast

ⓘ buttons dump 200–400 characters into `#toast` and vanish. The window citation and
LSS guidance are unreadable this way. Complement app uses anchored popovers with
Escape-to-close.

**Fix.** Reuse the popover pattern (or a `<dialog>`). Keep toast for short status only.

### P1-9. Chart legend promises a therapeutic-window line that must not be drawn

HTML: “dashed amber line = therapeutic window”. The window is **AUC 30–60 mg·h/L**.
The y-axis is **mg/L**. Drawing 30 and 60 as concentrations would look like a
therapeutic *level* of 30–60 mg/L (an order of magnitude above typical MPA C).
`renderChart` currently does not pass `cfg.window` (good), but `chart.js` still
implements AUC bounds as concentration hlines, and the legend text is already wrong.

**Fix.** Delete concentration-window drawing. If a visual is wanted, a separate small
AUC bar (median + 5–95% against 30–60) beside the results grid — never on the C–t
chart. Fix the legend sentence.

### P1-10. Time axis in days for a 12-hour curve — subsumed by P0-8

A 12 h interval currently plots as 0–0.5 “days”. That is not a display preference; it is
the engine unit leaking into the chart (P0-2, P0-8). **Do not** “plot hours and keep days
internal”. Hours is the unit in calculations, plots, **and** fields.

**Fix.** Same as P0-8: x-axis in hours, labelled “Time (h)”; fields and session in hours.

### P1-11. Autosave chrome is dead

`#restoreBar`, Restore/Discard exist in the HTML and are never bound. No
`localStorage`. Users who refresh lose the session unless they remembered Export.

**Fix.** Port the complement autosave, or remove the bar so it does not look broken.

### P1-12. Report omits SS regimen and the chart

Print report reads `state.doses` (empty in SS mode) and does not render the SVG.
A printed SS work-up would show “None entered” for dosing.

**Fix.** Print `effectiveDoses()` or the SS triple (dose/interval/anchor). Optionally
inline the chart SVG (it is already a string).

### P2-6. Placeholder identity

Footer: `you@example.com`, “MPA TDM project”. Fine for a skeleton; must not ship.

### P2-7. Modals have no focus trap / Esc / backdrop-click

Getting started, About, Report, Diagnostics. Keyboard users tab into the page behind.
Backdrop click does nothing.

### P2-8. `datetime-local` without seconds, timezone-undefined

`new Date(v).getTime()/86400000` depends on the browser’s local zone. A session
exported in CET and imported in UTC shifts every sample by 1 h — enough to break an
LSS that cares about 20 min vs 1 h.

**Fix.** Store civil time as a string plus explicit offset, or treat times as naive
hours-from-anchor and never convert through `Date`.

### P2-9. Header `float: right` on `.actions`

The clearfix stopped `main` collapsing; the button row still floats and fights the
title on narrow widths. Flex on `header.app` is simpler.

### P3-1. Window fold value does not live-update while typing

Fold label updates only when `renderDrugAndCovariates` runs (init, drug change, fold
toggle). Typing 40 / 70 leaves the summary on “30 – 60” until blur/toggle.

### P3-2. Dose/obs tables have no edit, only remove

Changing a mistyped 10000 mg means remove + re-add, losing the timestamp convenience.

### P3-3. No relative-time helper

LSS wants “+20 min, +1 h, +3 h from last dose”. Users must compute clock times.

### P3-4. `Mycophenolic acid` truncation / field widths

`sess-field` inputs are 140 px; the drug `<select>` clipped in the first preview
pass. Not wrong, just cramped next to the window fold.

---

## 3. User-friendliness / clinical workflow

What a TDM pharmacist actually does: open the page, enter weight + SS dose 1000 mg
q12h, three timed levels, run, read AUC vs 30–60, try 750 mg, print.

Against that path:

| Step | What happens today (after un-pend, if P0s unfixed) |
|---|---|
| Open | Pending banner is clear. Good. |
| Weight | Required, 25 kg minimum — children bounce. |
| Window | Prefills 30–60 with a real citation. Good. |
| SS dose + interval | Run stays disabled (P1-6). |
| Samples | Hint is correct (MMF 20 min/1 h/3 h). No +offset helper. Trough-only not blocked, only discouraged. |
| Run | If forced: AUC 0, trough 0, empty chart (P0-1, P0-6). |
| Explorer | One isolated dose, not SS (P0-4). |
| Print | SS dosing missing (P1-12). |
| Help | Toasts vanish (P1-8). |

The *information architecture* (4 cards, window with two bounds, trough without a
target, explorer does not recommend a dose) matches the plan and the consensus.
The *execution* of that architecture does not.

Clinical language that is already right and should be kept:

- “The app does not recommend a dose.”
- Trough labelled informational.
- Window sourced and editable.
- Research-use disclaimer.

Clinical language that is currently wrong or missing:

- Chart legend implying an AUC window on a concentration axis.
- “Previous cycles are simulated back to steady state” stated as fact for a fixed
  10 doses, independent of half-life.
- No assay, no formulation, no post-transplant day, no CNI co-medication — the
  covariates Bergan treats as first-class. The model-driven contract is the right
  place; the UI must actually read it (P1-4).

---

## 4. What is already in good shape

Do not “fix” these:

- Pending gate (`requireReady`, `runFit` throw, `doseScan` → `[]`, Run disabled).
- Window defaults 30–60 + Bergan citation, independent of PK parameters.
- Strict P(lo < AUC < hi) with NaNs excluded from the denominator.
- `aucFromConc` units (mg·h/L) on a *correct* uniform **hour** grid — the helper is right
  once callers stop passing a day-scaled span.
- Version single-sourcing + build inlining + `file://` delivery.
- Escape of user text in tables/report.
- No dose recommendation copy.

---

## 5. Suggested order of work

Before the model file is allowed to un-pend:

1. **P0-1** real `simulate` + failed-flag (without this, nothing else is testable).
2. **P0-2 / P0-3 / P0-8** hours as the single time unit; dose-relative grid in hours;
   AUC trapezoid on that grid; trough = C(τ). Ban `/ 24` except at model-file ingestion.
3. **P0-5** prior term + N-eta MCMC (port from complement, do not re-invent).
4. **P0-6 / P0-7** chartBand, IPRED, real log-y. Chart x-axis in hours.
5. **P0-4 / P1-1 / P1-6** explorer = SS regimen; interval from the UI (hours); Run enabled
   from `effectiveDoses()`.
6. Tests that can go red for each of the above (golden rule 7b).
7. Then **P1** UI (stale banner, help popovers, legend, report SS, autosave).
8. Assay/formulation/pediatric range (**P2**) can wait for the model file, but the
   *fields* should exist so ingestion does not require another UI pass.

Estimated: items 1–6 are a real engine port, not a polish pass. Treat the current
`bayes.js`/`model.js` simulate/OFV/MCMC as **scaffolding to replace**, not to
incrementally patch, except `aucFromConc` / `prob*` / the pending gate.

---

## 6. Finding index

| ID | Sev | Area | One-line |
|---|---|---|---|
| P0-1 | P0 | engine | `simulate()` always returns zeros, `failed` always false |
| P0-2 | P0 | engine | AUC grid origin ≠ dose/obs clock; τ scaling can be wrong |
| P0-3 | P0 | engine | Trough = min(curve), often 0 |
| P0-4 | P0 | engine | Explorer = one isolated dose, not SS at the new amount |
| P0-5 | P0 | engine | OFV/MCMC have no prior; Laplace unused; 2-eta hard-coded |
| P0-6 | P0 | engine | `chartBand` and IPRED never filled |
| P0-7 | P0 | engine | Log-y ticks without log geometry |
| P0-8 | P0 | engine/UI | Time must be hours everywhere (calc, plots, fields); days are forbidden |
| P1-1 | P1 | engine | User SS interval ignored (always 12 h) |
| P1-2 | P1 | engine | Recency low/medium/high identical |
| P1-3 | P1 | engine | Quantiles include NaNs |
| P1-4 | P1 | engine/UI | Covariate contract split; generated fields unread; fold re-duplicates |
| P1-5 | P1 | engine | Sampler not N-eta; no ESS/R̂ |
| P1-6 | P1 | UI | Run disabled in SS mode |
| P1-7 | P1 | UI | Stale banner before any run |
| P1-8 | P1 | UI | Help is a vanishing toast |
| P1-9 | P1 | UI | Legend/chart confuse AUC window with concentration |
| P1-10 | P1 | UI | Axis in days — subsumed by P0-8 (hours everywhere) |
| P1-11 | P1 | UI | Restore bar / autosave dead |
| P1-12 | P1 | UI | Report misses SS doses and chart |
| P2-1 | P2 | engine | Trapezoid should use actual Δt |
| P2-2 | P2 | UI | No assay, no formulation |
| P2-3 | P2 | UI | Weight min 25 kg blocks children |
| P2-4 | P2 | UI | Extra quote in SVG attributes |
| P2-5 | P2 | tests | Suite cannot catch P0s |
| P2-6 | P2 | UI | Placeholder contact |
| P2-7 | P2 | UI | Modals not accessible |
| P2-8 | P2 | UI | Timezone-unsafe `datetime-local` |
| P2-9 | P2 | UI | Floated header actions |
| P3-1 | P3 | UI | Window summary stale while typing |
| P3-2 | P3 | UI | Tables are delete-only |
| P3-3 | P3 | UI | No +20 min / +1 h / +3 h helper |
| P3-4 | P3 | UI | Cramped patient row |
