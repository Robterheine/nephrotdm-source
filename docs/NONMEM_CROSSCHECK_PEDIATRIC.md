# NONMEM cross-check: pediatric mycophenolic acid and pediatric tacrolimus

Status: **steps 1, 3, 4 and 6 of `HANDOFF_PEDIATRIC.md` §11 (5 October 2026).** The reference side (oracle and NONMEM) exists for both drugs; both app
engines exist (`src/tacped.js`, `src/mpaped.js`; sections "App engine against NONMEM" below).

## What was built (all in `tools/nonmem_verify/ped/`)

| File | Purpose |
|---|---|
| `ped_oracle.mjs` | Independent reference: general n-state linear system, matrix exponential, written from the two NONMEM streams (not from app code). Also an RK4 integrator. |
| `ref_ped.mjs` | Reproduces the hand-calculated table of hand-off §4.4 with the oracle. |
| `struct_mpaped.mod`, `struct_tacped.mod` | NONMEM 7.6 verification streams, etas as data, parameters frozen. MPA: run-57 structure with the article's values. Tacrolimus: Heida 2026 ESM S1, compartments renamed, AUC compartment dropped. |
| `make_ped.mjs`, `compare_ped.mjs`, `run_ped.sh` | Data and oracle predictions; comparison; one-command run (`tools/nonmem_verify/ped/run_ped.sh`). |

## Results (NONMEM 7.6, `ADVAN5` for MPA, `ADVAN6 TOL=9` for tacrolimus)

| Set | Subjects | Predictions | Max relative difference, NONMEM vs oracle | Verdict (limit 1e-6) |
|---|---|---|---|---|
| MPA, steady state (`SS=1`, II 12; weights 13-75 kg, albumin 24-41 g/L; etas 0, ±1.5 SD, random; occasion eta) | 24 | 312 | 4.4e-9 | OK |
| MPA, 7-day history, dose change, one occasion eta per calendar day | 12 | 204 | 4.1e-9 | OK |
| Tacrolimus, steady state as an explicit 80-dose train (both formulations, Ht 0.22-0.45, weights 10-75 kg), whole blood and plasma | 24 | 624 | 4.6e-9 | OK |
| Tacrolimus, 7-day history, constant Ht and formulation | 16 | 544 | 4.4e-9 | OK |

Sabotage (hand-off rule 7b), run on scratch copies of the streams: albumin exponent −2.49 → −2.5 turns the MPA rows red (4.2e-3 and 3.1e-3);
hepatic plasma flow without the (1 − Ht) factor turns the tacrolimus rows red (0.61 and 0.41). The unmodified streams are green.

## Reference numbers of hand-off §4.4

All reproduced with the oracle (`node tools/nonmem_verify/ped/ref_ped.mjs`, exit 0): CL, AUC (also as dose/CL), trough, plasma AUC (also as
F·dose/CLINT), whole-blood AUC and trough, actual and corrected, to the printed precision. RK4 over 250 doses against the matrix-exponential
steady state: 3e-11 (MPA) and 6e-14 (tacrolimus).

**Findings**

1. **Peak values of the §4.4 MPA table.** Cmax and tmax in the hand table are rounded from a coarse grid. The refined oracle (0.01 h grid with a
   parabola through the maximum) gives 1.043 h (table 1.05) for the 38.5 kg rows, 0.984 h (0.99) and Cmax 9.825 (9.83) for the albumin 28 row.
   Differences are at most 0.006 in Cmax and 0.007 h in tmax; `ref_ped.mjs` accepts 0.01 for these two columns only. The hand-off table is
   left as written; the app's engine tests should use the oracle values.
2. **NONMEM's own steady-state iteration (`SS=1`, `ADVAN6`) is inaccurate for very fast absorption.** A suspension patient with eta(KA) = +1.5 SD
   (KA about 60 /h) differs by 4.1 % from the oracle with `SS=1`, but by 2.7e-9 as an explicit 60-dose train. The oracle is right; the
   `SS=1` row is kept in the output as informational ("ss1") and the judged steady-state set uses explicit trains. MPA `SS=1` (ADVAN5, analytic)
   is unaffected. Consequence for G1/G2: do not use `SS=1` as the tacrolimus reference.
3. **Per-dose formulation (decision D5) versus NONMEM.** NONMEM applies the KA of the current record to the whole system, including doses still in
   transit; the app design gives each dose its own KA. With a capsule-to-suspension switch and 12-hourly doses (10 subjects, 340 predictions) the
   two differ by at most 1.3e-3 (mean 1e-5). Informational, because neither is "the" truth for a mid-history switch; the cost is negligible at
   12-hourly dosing and would grow only for doses given within a few hours of each other.

4. **Haematocrit that changes between records (tacrolimus, informational).** NONMEM applies each record's Ht to the PK; the app holds the
   latest sample's Ht for the PK path and uses each sample's own Ht for the blood transform (hand-off §4.2, as accepted for everolimus). Same
   Ht pattern as the everolimus check (0.28-0.44 swings over four days), 12 subjects, 216 earlier-sample predictions: **mean error 2.2 %, max
   12.5 %** (everolimus: 1.0 % and 6.2 %). The hand-off expected the same order; it is about twice. The reported exposure uses the latest Ht,
   so the cost sits in how earlier samples inform the fit. **Open for the owner and the statistician** (L4 will show whether it moves coverage);
   the alternative is a piecewise-in-time PK path, which needs an engine change.

## App engine against NONMEM (gate G1, tacrolimus)

`tests/test_pediatric.js`, test "G1-NONMEM", compares `src/tacped.js` with the NONMEM tables stored in `tests/nonmem_ped_tac_struct.*`
(754 observation records, whole blood and plasma; fixtures from `tools/nonmem_verify/ped/export_golden_ped.mjs`, which drops the informational
`SS=1` and haematocrit-change subjects). Pass limit 1e-6 for steady-state trains and histories, 3e-3 for the formulation switches. Also in that
file: the engine against the oracle (E1-E4: typical and ±1.5 SD etas, both formulations, KA at and around each disposition pole to 1e-6,
slow absorbers, an explicit switch history), the §4.4 numbers (I2), the plasma-AUC identity (I1) and the integration grid (G1).

**Result of record:** all pass; the engine agrees with the oracle to 1e-9 and with NONMEM to 1e-6 or better (NONMEM vs oracle 4.6e-9).
Sabotage: a 0.3 % change of CLINT (987 to 990), QH 90 to 91, the suspension F 0.46 to 0.5 and the Erlang exponent 3 to 4 each turn the
NONMEM test red.

**Two engine decisions that came out of the checks**
- The steady-state sum over earlier doses is exact, polynomial part included (`ssh` in `src/tacped.js`), because eta on KA lets a slow
  absorber (KA about 0.4 /h at -2.5 SD) keep a non-negligible Erlang tail from the earlier doses (the everolimus code could drop it: fixed KA).
  Within 5 % of a disposition pole the closed form divides by (k - lambda)^3, so the sum is taken dose by dose there.
- The AUC integration uses its own composite Simpson rule (0.0125 h, 0.05 h, 0.25 h panels) instead of the app's 0.25 h trapezoid: for the
  suspension the trapezoid read the whole-blood AUC up to 1 % low in the fast-absorber tail of the prior (KA 90-130 /h) and 0.055 % for the typical
  suspension patient. A grid whose step changes needs Simpson, not trapezoid (the trapezoid error cancels only on a uniform periodic grid).
  The same measure for MPA is not needed (slow absorption).

## App engine against NONMEM (gate G1, MPA)

`tests/test_pediatric.js`, test "MG-NONMEM", compares `src/mpaped.js` with `tests/nonmem_ped_mpa_struct.*` (516 observation records: 24 steady-state
doses and 12 seven-day histories with one occasion effect per calendar day; F1 = exp(EO) of the dose record multiplies that dose). Pass limit 1e-6;
the engine agrees with the oracle to 1e-9 (ME1-ME4) and with NONMEM to 1e-6 or better (NONMEM vs oracle 4.4e-9). Other tests in that file: the
§4.4 numbers (MI2; Cmax to the oracle's refined value), the identity AUC = dose·exp(κ)/CL independent of Vc, Vp, Q, KTR (MI1), the unit trap
(MI3: 600 mg MMF gives 58.7, not 43.4), the occasion mechanics (MS3) and the "delta" mechanism: an endless train plus explicit deviations for the
sampled days equals an explicit 401-dose history with κ on those days (ME3).

Two engine notes: the fast disposition pole can lie close to the transit rate KTR for draws in the wide Vc distribution (variance 2.42), so the
steady-state sum has the same near-pole fallback as tacrolimus (ME4 scans the pole across KTR at 1e-6, 1e-4, ±2 %, ±4.9 %, ±5.1 %, 20-30 %);
and, unlike the tacrolimus engine, the AUC needs no integration grid: it is dose/CL exactly.

## B. MAP against NONMEM POSTHOC (gate G2, hand-off L2)

`tools/nonmem_verify/ped/make_posthoc_ped.mjs` simulates 30 patients per drug (truth etas from the prior, **proportional** noise at the published
sigma), writes NONMEM streams that estimate the etas (FOCE-I with interaction, `MAXEVAL=0`, `POSTHOC`) and records the app's MAP (`mapBFGS`, the
path `runFit` takes for these specs). MPA: weights 13-75 kg, albumin 25-41 g/L, three sampling designs (trough; 0, 1, 2 h; the same on two days),
1, 2 and 4 sampled calendar days, so 4, 5 and 7 etas (the occasion etas on F are estimated by NONMEM with `OCC`). Tacrolimus: weights 10-70 kg, Ht
0.22-0.45, both formulations, trough only or 0, 1, 2 h.

| | Patients | Median max abs d eta | Worst | Reported AUC from the two eta vectors | Objective of the app's model |
|---|---|---|---|---|---|
| MPA | 30 | 3.7e-8 | 9.7e-7 | within 3e-5 % | the app's MAP is the lower or equal one in 30/30; NONMEM's EBE above it by at most 5e-6 |
| Tacrolimus | 30 | 4.0e-8 | 5.7e-7 | within 1e-5 % | same, 30/30 |

Pass limits (hand-off L2, fixed beforehand): median max abs d eta <= 1e-3 and the reported AUC within 0.5 % for every patient. **Both are met with
margin of five orders of magnitude.** This also settles hand-off §5.2 item 3: the natural-scale proportional path of `bayes.js` is the
Gaussian proportional likelihood of FOCE-I (`(y-f)^2/(f^2 sigma^2) + ln(f^2 sigma^2)`), so no residual code was added. In the repo:
`tests/test_pediatric.js`, test "G2-NONMEM", with the fixture `tests/nonmem_ped_posthoc.json` (60 patients, NONMEM's etas), runs without NONMEM.

Sabotage of the NONMEM streams (scratch copies; the comparison goes red every time): MPA sigma^2 0.223 to 0.3 (median d eta 4.4e-2), the fourth
occasion eta removed (median unchanged at 1e-7, but 10 patients off by up to 1.0: the AUC and objective checks catch what the median cannot),
omega CL 0.139 to 0.3 (5.3e-2); tacrolimus sigma^2 0.0374 to 0.06 (2.5e-2), suspension F 0.46 to 0.5 (6.7e-2). Sabotage of the app (constants of
`src/mpaped.js` and `src/tacped.js` against the fixture): sigma^2, occasion variance, albumin exponent, omega V3 and F each turn "G2-NONMEM" red.

A finding from writing it: the first version of the MPA stream knew three occasion etas but the two-day design produces four sampled occasions; NONMEM
treated occasion 4 as having no effect. Caught by counting occasions per patient (10/10/0/10 for 1/2/3/4), fixed, and kept as a sabotage case above.

## C. Posterior against NONMEM BAYES (hand-off L3)

`compare_bayes_ped.mjs`: NONMEM `METHOD=BAYES BIONLY=1` (population frozen, 2000 burn-in and 6000 retained iterations per patient, 30 patients per
drug, the same patients as part B); the steady-state AUC0-12 and trough of every retained sample are computed with the app's model code (typical day;
actual and corrected for tacrolimus) and summarised; the app is `runFit` at its default budget on a pool of 8 worker threads. **Criterion, fixed
beforehand (the adult criterion of `NONMEM_CROSSCHECK.md`): at least 95 % of patients within +-5 % for the posterior medians of AUC12 and trough.**

| | AUC12 median | Trough median | AUC12 5th / 95th percentile | Corrected AUC12 / trough median | Sampler converged |
|---|---|---|---|---|---|
| MPA (30 patients) | 100 % within 5 %, median diff 0.30 %, worst 1.5 % | 100 %, 0.30 %, worst 3.1 % | 100 %, 0.45 % / 0.69 %, worst 2.0 % | not applicable | 30/30 |
| Tacrolimus (30 patients) | 100 %, 0.27 %, worst 1.2 % | 100 %, 0.15 %, worst 0.7 % | 100 %, 0.42 % / 0.30 %, worst 1.8 % | 100 %, 0.27 % / 0.15 % | 30/30 |

Sabotage (NONMEM's frozen population parameters changed in scratch copies, the comparison re-run): MPA Vc variance 2.42 to 1.0 turns the trough
share to 90 % (worst 7.7 %), while the AUC medians stay within 2.1 %, as they should (the AUC does not depend on Vc); tacrolimus CLINT variance
0.456 to 0.3 turns the AUC share to 90 % (worst 8.4 %) and the 5th percentile share to 83 %. Both end in CHECK, so the comparison can fail.

Criterion met for both drugs. NONMEM's BAYES for MPA with 4-7 etas per patient (the occasion effects) agrees with the app's posterior as closely as for
tacrolimus. `run_ped.sh` runs all of it (`POSTHOC=1`, `BAYES=1`).

## Open for later gates

- Calibration by simulation-recovery (L4, L4b) and the benchmark replication of the 2026 paper (L5), which the hand-off gives to the statistician seat.
