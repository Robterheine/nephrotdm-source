# Performance audit — NephroTDM 1.2.1 (3 October 2026)

**Question.** Fitting feels slow. Audit for optimisation from four angles (HTML, JavaScript, pharmacometrics, statistics) **without
changing what the app computes or how precisely**. The measurements below were taken on a ten-core Mac, in Node and in the built single
file in the browser pane; "before" is the code at the start of the audit, rebuilt in a temporary copy and shown to reproduce the recorded
numbers bit for bit; before and after were timed alternately on the same quiet machine (the twelve-day "before" ran while tests were also
running, so it is if anything flattering to the old code).

## 1. Where the time went

| Phase (typical fit) | share |
|---|---|
| MCMC sampling | 85–98 % in every design |
| posterior predictive (32 000 draws → AUC, trough) | 3–12 % |
| prior-predictive band, MAP, Laplace covariance | < 5 % together |

MPA costs about 1 µs per MCMC iteration; tacrolimus cost 9 µs at the same dimension. That 9× gap was the first clue.
The function profile of a steady-state tacrolimus fit was unambiguous: **71 % of all time in one line**, the helper that builds the closed-form
model for each dose's absorption rate (`Object.assign({}, p, {ka})` copied the whole parameter object, hundreds of thousands of times per fit).

## 2. What was changed (every item bit-identical unless stated)

| # | Perspective | Change | Effect |
|---|---|---|---|
| 1 | JavaScript | `model.js` gets `cfModelRaw(cl, v1, k12, k21, ka)` (and `cfModel` delegates to it: same arithmetic). The tacrolimus simulator builds one model per distinct absorption rate without copying the parameter object or using a string key. | steady-state tacrolimus fit ≈ 4× faster; 5-day ≈ 3× |
| 2–3 | JavaScript | tacrolimus `indivParams` works on the η vector by position instead of building a name lookup (and caches the name list); the sampler loop reuses two buffers instead of allocating a proposal and a copy per iteration. | together ≈ 15–20 % more; less garbage |
| 4 | HTML | `await Promise.resolve()` only yields to microtasks: **the page never repainted during a fit** (frozen progress bar, tab looked hung for the whole fit, 10+ s on a long history). Now a macrotask yield at most every 50 ms (MessageChannel in browsers: 40 yields cost 1 ms, against 170 ms for `setTimeout(0)`, which browsers clamp to ~4 ms; `setTimeout` in Node), so progress paints and the page responds. **No yield at all while the page is hidden** (nothing to repaint; see §3). | perceived speed; no cost |
| 5 | JavaScript / statistics | **The eight MCMC chains are independent tasks with their own seeds** (`chainSeed`); `src/parallel.js` runs them on a pool of Web Workers built from the page's own inlined scripts (single offline file, no network, no extra file). Falls back to the in-process run, with identical draws, if a worker cannot start, fails, or is silent for 10 s. **Tacrolimus only.** | ≈ 2–3× on top of 1–3 for the longer designs; see §3 |
| 6 | Test discipline | the test harness exited with code 0 and no summary when a test's promise never settled (found while testing the worker fallback). It now fails the run with a message. | npm test cannot pass by hanging |

**Not touched, on purpose:** the MPA sampling path (one shared random-number stream, chains in sequence). It takes 0.6–0.9 s, and giving
it per-chain seeds would change its numbers and require re-validating its calibration for no visible benefit.

## 3. Measured effect (same machine, same moment, quiet)

| Design | before | after, one thread | after, worker pool (browser, 10 cores → 8 workers) |
|---|---|---|---|
| MPA, MMF, 3-point LSS | 0.58 s | 0.60 s (noise) | not used |
| MPA, EC-MPS, 4 samples | 0.84 s | 0.88 s (noise) | not used |
| Tacrolimus, steady state, 3 samples | 4.4 s | 0.7–0.8 s | 0.32 s |
| Tacrolimus, 21-day history, 5 sampled days (13 etas) | 22 s | 6.0–6.2 s | 2.0 s |
| Tacrolimus, 12 sampled days (27 etas, the cap) | 96 s | 25.8 s | 8.0 s |

Node and the browser agree for the one-thread numbers (tacrolimus 3 samples 0.78 s in Node, 0.70 s in the browser; 5 days 6.0 s in both; 12 days 26 s in
both), so the engine is not slower in a browser. Worker times are from the built single file with the pane on screen; every run was checked for
visibility changes and none occurred. The worker speed-up is about 2–3×, not 8×: the eight chains share ten cores with the page, the
posterior-predictive step (32 000 draws) and the MAP/Laplace steps are serial, and a worker needs ~0.1–0.2 s to start and parse the scripts, which is why
the three-sample fit gains only 2×.

**A hidden page is slow.** The same fits took 5–6× longer when the browser pane happened to be hidden (twelve days: 142 s instead of 26 s, three samples 6 s
instead of 0.7 s), because browsers throttle timers and tasks in hidden pages and my first yield (50 ms) then waited on throttled timers. The yield is
therefore skipped while `document.hidden`; the operating system may still deprioritise a hidden window, which no code can undo, and which is a reason
for the worker pool (the compute then runs off the throttled main thread).

**Identity.** The worker pool and the in-process run give the same draws (checked in Node with `worker_threads` running the same worker
code, and in the browser: the AUC median agrees to all 17 digits). The one-thread optimisations (#1–3) reproduce the pre-audit tacrolimus
record exactly. Switching to per-chain seeds (#5) changes the tacrolimus numbers only by Monte Carlo noise (the three recorded fits moved
by 0.01–0.2 % in AUC median, e.g. 79.555 → 79.562); the new numbers are the regression record (`tests/tac_v121_regression.json`,
`tools/record_tac_regression.mjs`), and **the full calibration was repeated on the final engine**: 9 cells × 100 patients, all 36 coverage
figures inside 85–95 % (86–92 %), 100 % of fits converged (`CALIBRATION_RESULTS_STORSET.md`). That study now runs in about half an hour.

## 4. Findings by perspective, including what was not done

**Experienced HTML coder**
- *Done:* the frozen page (#4). Autosave is debounced (400 ms), tables re-render only their own `innerHTML`, the chart redraws on resize only
  when the phone breakpoint is crossed: nothing to change.
- *Done later (1.3.0):* a Cancel link stops a running forecast (the pool is terminated, the in-process run stops at its next progress report).
  A service worker or code splitting would not help a single 300 KB file that loads in milliseconds.

**JavaScript expert**
- *Done:* #1–3. The profile after #1 was already flat: simulator 28 %, parameter builder 24 %, sampler loop 10 %, random numbers 6 % (#2–3 then took about 15–20 % off the first two).
- *Not done:* the MPA parameter builder (22 % of an MPA fit) builds name lists on every call; caching them would be safe only with
  invalidation for the test stub specs, and an MPA fit is already under a second. The prior-predictive band (1 000 draws) is computed on every fit
  and shown nowhere (a test checks its length): about 3 % on long histories.
- *Considered and rejected:* evaluating the sum over past doses as exp(R·tₛ)·exp(−R·t) to save exponentials. It overflows for fast absorption
  over a three-week history (e^(7.5·500)) and would need re-centring per segment; not worth the numerical risk.

**Pharmacometrician**
- The likelihood costs O(samples × doses) in history mode and O(sampled-day doses) in steady-state mode (the endless regimen is a closed-form
  geometric series), which is why steady state is the fast path and why the cost grows with sampled days (each adds two parameters and its doses).
- *Not done:* grouping unchanged dose blocks, or limiting how far back doses are summed. Dropping old doses changes the answer at about the 10⁻³
  level for a half-life of 49 h, which is the kind of change this audit was told not to make.
- Parameter-space cost is the real driver: 7 etas for the usual designs, 13 for five sampled days, 27 for twelve. The 12-day cap exists for this reason.

**Statistician**
- The sampler is already efficient for a random walk: acceptance 25–29 % (optimum ≈ 23 %), step scaled by 2.38/√d, Laplace proposal covariance.
- *Precision versus budget, measured* (typical 3-sample design, 7 etas, 14 seeds per row): at the current budget (800 000 iterations) the
  seed-to-seed SD of P(in window) is **0.23 percentage points** and of the AUC median 0.17 %, ESS 13 600. At 400 000 iterations: 0.37 pp, 0.15 %, ESS 7 300;
  at 200 000: 0.47 pp, 0.25 %, ESS 3 600; at 100 000: 0.84 pp, 0.33 %, ESS 1 700. So the budget is conservative: halving it would still give ≤ 0.4 pp.
  But about 0.3 s of every fit is fixed cost (posterior predictive, prior band, start-up), so halving saves 0.3 s of 0.7 s. **Left as is**: it is a validated
  precision setting and the saving no longer matters.
- *Burn-in:* each chain discards 40 % of its iterations. Measured at the same budget, a 10 % burn-in raises the effective sample size about 1.4× (13 600 → 19 000)
  and changes nothing else. Left as is for MPA (validated). An option for tacrolimus if its budget is ever cut.
- *Convergence bar* (R̂ < 1.01, ESS ≥ 400 on the printed quantities) is unchanged; all calibration fits pass it.

## 5. Recommendations, in order of value for effort

1. Nothing further is needed for typical use: a three-sample fit is under a second and a five-day history takes 2–6 s.
2. If twelve-day designs matter, the worker pool already brings them to a few seconds on a multi-core machine; a Cancel button would round that off.
3. Only if the budget ever has to shrink: a 10 % burn-in for tacrolimus first (free precision), then 400 000 iterations for ≤ 7 etas (≤ 0.4 pp), each with a calibration run (30 minutes now).
