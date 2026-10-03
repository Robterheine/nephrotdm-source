> **Superseded** by the F11 re-run in `docs/CALIBRATION_RESULTS.md` (converged engine, exact steady-state truth). Kept because it is the record that accompanied the v1.0.1 release.

# V10 calibration results — de Winter 2008 implementation (v1.0.1 record)

Simulation–recovery per docs/IMPLEMENTATION_PLAN_DEWINTER_2008.md (ST1/ST2), run at
**production fidelity** (full MAP + MCMC budgets, seeded) in parallel launchd jobs;
synthetic patients drawn from the implemented model (known etas, membership,
log-residual σ=0.39). **v1.0.1 configuration:** 8 pooled chains (1 MAP-start + 7
disperse prior starts; paired trough-cell study: mmf-trough 80% → 90% at unchanged
budget class — see docs/CALIBRATION_V101_SAMPLER_STUDY.md) and S12 morning
auto-anchoring (no effect on these morning-ending schedules by construction).

**n = 100 per cell** (coverage SE ≈ 3%) — the size ST1 asked for; this removes the
v1.0.0 cell-size compromise and answers the verification team’s R2 question 2
(is acceptance at n=40/20 statistically honest?) by re-running at full size.

**What changed since the v1.0.0 record.** Both v1.0.0 CHECK baseline cells now pass
at full size (ec-trough 75%±6.8 → 85%±3.6; mmf-trough 80%±8.9 → 86%±3.5) — the paired
sampler study (docs/CALIBRATION_V101_SAMPLER_STUDY.md) raised the pooled-chain default
4 → 8. mmf-lss-armA, ambiguous at n=20 (75%±9.7), lands at 92%±2.7. The two remaining
CHECK cells are the **arm-B pair** — truth generated with ρ(CL,V1)=0.5 and fitted with
the diagonal Ω the app ships: the approximation costs ~3–5 coverage points against
correlated truth (84%/83% vs 86–88% baselines). That is a measured, documented
approximation (model card; the author query in docs/AUTHOR_QUERY.md asks for the
published Ω), not a sampler defect. Membership accuracy on EC-LSS is 75–76% vs the 51%
prior-mode baseline; on EC-trough it is 57% — trough-only data cannot identify the
absorption subgroup, which is precisely the sampling caution the app displays for
EC-MPS.

| Cell | n | fails | AUC12 5–95% coverage (±SE) | mean width (mg·h/L) | mean |ΔAUC| | membership hit / P̄(true) | switch rate | accept | ESS(CL) |
|---|---|---|---|---|---|---|---|---|---|---|
| ec-lss | 100 | 0 | 86.0% ± 3.5 **pass** | 47.7 | 11.6 | 75% / P̄(true)=0.69 | 1.7% | 20% | 45 |
| ec-trough | 100 | 0 | 85.0% ± 3.6 **pass** | 63.7 | 14.9 | 57% / P̄(true)=0.47 | 7.1% | 14% | 40 |
| mmf-lss | 100 | 0 | 88.0% ± 3.2 **pass** | 39.1 | 9.0 | – | – | 23% | 49 |
| mmf-trough | 100 | 0 | 86.0% ± 3.5 **pass** | 48.8 | 12.2 | – | – | 17% | 47 |
| ec-lss-armA | 100 | 0 | 92.0% ± 2.7 **pass** | 47.7 | 10.6 | 76% / P̄(true)=0.71 | 1.7% | 20% | 48 |
| mmf-lss-armA | 100 | 0 | 92.0% ± 2.7 **pass** | 43.4 | 9.6 | – | – | 22% | 52 |
| ec-lss-armB | 100 | 0 | 84.0% ± 3.7 **CHECK** | 47.6 | 13.8 | 81% / P̄(true)=0.69 | 1.6% | 20% | 45 |
| mmf-lss-armB | 100 | 0 | 83.0% ± 3.8 **CHECK** | 40.2 | 9.5 | – | – | 21% | 50 |

**Acceptance (ST1):** coverage 85–95% per baseline cell; membership accuracy ≥ 51%
(the prior-mode baseline) on EC-LSS; switch rate > 0; trough-only cells are expected
to show WIDER intervals (more prior) with coverage holding.

**Robustness arms (ST2):** arm A = truth under the exact-log-normal ω², fitted with
the app's √ω² convention (S1 sensitivity). arm B = truth with ρ(CL,V1)=0.5, fitted
with the diagonal Ω the app uses (approximation check). If coverage in the arms
matches baseline, both documented choices are AUC-benign measured, not assumed.

**Arm verdicts at n=100:** arm A (ω² convention) is AUC-benign — 92% in both cells,
within noise of (above) baseline. arm B (diagonal Ω vs correlated truth) costs
~3–5 coverage points — measured, documented in the model card, and the subject of
the author query (docs/AUTHOR_QUERY.md).

All 8 cells present — calibration of record complete.
