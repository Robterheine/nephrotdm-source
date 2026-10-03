# v1.0.1 sampler study — the trough-cell fix (paired, seeded)

**Question.** The v1.0.0 calibration of record had both trough-only cells as **CHECK**
(ec-trough 75%±6.8 at n=40, mmf-trough 80%±8.9 at n=20): intervals were correctly
*wider* than LSS, but 5–95% coverage still fell short of the 85–95% band.

**Mechanism.** With one observation the posterior is prior-dominated in the weakly
identified directions (V2, KA, TLAG). The 4-chain pool (1 MAP-start + 3 disperse prior
starts) under-represents the prior tails — exactly where trough-only truths live.

**Method.** Paired comparison on identical seeded patients (the tool's patients 0–19,
fits seeded per patient), n=20 per arm, production fidelity, on the v1.0.1 engine.
Configs: baseline (default 4 chains), `--chains=8` (same budget class: 8 × 300 = 2400
iterations via the per-chain floor), `--iters=4000` (doubled MCMC budget).

| Cell (n=20, paired) | config | coverage | mean width | membership hit | wall |
|---|---|---|---|---|---|
| ec-trough | 4 chains (baseline) | 85% | 55.4 | 70% | 19.0 min |
| ec-trough | 8 chains | 85% | 68.4 | 70% | 23.9 min |
| ec-trough | 4 chains, iters 4000 | 85% | 56.3 | 70% | 27.5 min |
| mmf-trough | 4 chains (v1.0.0 record, same patients) | 80% | 40.3 | – | – |
| mmf-trough | 8 chains | **90%** | 47.1 | – | 19.1 min |
| mmf-trough | 4 chains, iters 4000 | **90%** | 42.7 | – | 14.9 min |

**Decision.** **Default pooled chains 4 → 8.** It recovers mmf-trough into the band at
unchanged budget class; EC-trough coverage is unchanged (85% on the paired 20) with a
wider, more honest interval for a prior-dominated fit. `iters=4000` also recovers but
doubles the MCMC cost — rejected. Locked by the updated multi-chain test
(`default is 8 pooled chains`).

**A heterogeneity observation, honestly recorded.** The v1.0.0 ec-trough cell read
75% over n=40; its first 20 patients (the paired baseline above) cover 85%, implying
patients 20–39 covered ~65%. Cell-level coverage at small n is noisy and
patient-mix-sensitive — one more reason the v1.0.1 record runs at n=100.

**Scope note.** These runs use morning-ending schedules, so S12 auto-anchoring is
inactive by construction; the study isolates the sampler change. The full 8-cell
n=100 record on the shipped v1.0.1 engine is in `docs/CALIBRATION_RESULTS.md`.

*(Per-run JSONLs: `/tmp/calib_diagnosis_v101/` — volatile; this document is the
durable record.)*
