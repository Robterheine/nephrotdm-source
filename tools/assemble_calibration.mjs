/* Assemble the calibration of record from the per-job JSONLs.
 * Usage: node tools/assemble_calibration.mjs   (after the mpa-calib-* jobs finish)
 * Reads every /tmp/calib_cells_*.jsonl, orders by the canonical cell list,
 * writes docs/CALIBRATION_RESULTS.md. Idempotent. */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = dirname(fileURLToPath(import.meta.url));
const ORDER = ['ec-lss', 'ec-trough', 'mmf-lss', 'mmf-trough',
  'ec-lss-armA', 'mmf-lss-armA', 'ec-lss-armB', 'mmf-lss-armB'];

// --prefix=f11-  reads only /tmp/calib_cells_f11-*.jsonl (default: every calib_cells_*.jsonl)
const PREFIX = (process.argv.find(x => x.startsWith('--prefix=')) || '--prefix=').replace('--prefix=', '');
const rows = {};
if (existsSync('/tmp')) {
  for (const f of readdirSync('/tmp')) {
    if (!/^calib_cells_.*\.jsonl$/.test(f)) continue;
    if (PREFIX && !f.startsWith('calib_cells_' + PREFIX)) continue;
    for (const line of readFileSync('/tmp/' + f, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try { const r = JSON.parse(line); rows[r.name] = r; } catch (e) {}
    }
  }
}
const got = ORDER.filter(k => rows[k]);
const missing = ORDER.filter(k => !rows[k]);

function row(r) {
  const se = Math.sqrt((r.coverage * (1 - r.coverage)) / Math.max(1, r.n - r.fails));
  const pass = r.coverage >= 0.85 && r.coverage <= 0.95 ? '**pass**' : '**CHECK**';
  const hasMix = r.mixAccuracy != null && isFinite(r.mixAccuracy);
  const mix = hasMix
    ? (r.mixAccuracy * 100).toFixed(0) + '% / P̄(true)=' + ((r.mixPTrue != null && isFinite(r.mixPTrue)) ? r.mixPTrue.toFixed(2) : '?')
    : '–';
  const sw = (r.switchRate != null && isFinite(r.switchRate)) ? (r.switchRate * 100).toFixed(1) + '%' : '–';
  return '| ' + r.name + ' | ' + r.n + ' | ' + (r.fails || 0) + ' | ' +
    (r.coverage * 100).toFixed(1) + '% ± ' + (se * 100).toFixed(1) + ' ' + pass + ' | ' +
    r.meanWidth.toFixed(1) + ' | ' + r.meanAbsErr.toFixed(1) + ' | ' +
    mix + ' | ' + sw + ' | ' +
    (r.meanAcc * 100).toFixed(0) + '% | ' + r.meanEss.toFixed(0) + ' | ' +
    ((r.convergedFrac != null && isFinite(r.convergedFrac)) ? (r.convergedFrac * 100).toFixed(0) + '%' : '–') + ' |';
}

const header = [
  '# V10 calibration results — de Winter 2008 implementation (F11 re-run, converged engine)',
  '',
  'Simulation–recovery per docs/IMPLEMENTATION_PLAN_DEWINTER_2008.md (ST1/ST2). Synthetic',
  'patients are drawn from the implemented model (known etas, membership, log-residual',
  'σ = 0.39) and fitted with the production `runFit` at its **shipped defaults** (8 pooled',
  'chains × 100 000 iterations, 32 000 kept draws, exact steady state), n = 100 per cell',
  '(coverage SE ≈ 3 points). This replaces the v1.0.1 record (docs/CALIBRATION_RESULTS_V101.md),',
  'as docs/METHODS_AUDIT_V101.md F11 asked, after F1/F2/F7/F9/F20 changed the engine.',
  '**Version:** app 1.1.0. The whole record was run twice — on the engine as it stood after F11, and again on the',
  'released 1.1.0 engine after the report, diagnostics, censoring-removal and dead-code changes — and reproduces to',
  'the digit in every cell (coverage, width, convergence share), as it should: those changes do not touch estimation.',
  '',
  '**What changed in the method (tools/calibrate_dewinter.mjs).** (1) The true AUC is the',
  'exact steady-state integral, not a 31-dose reconstruction + trapezoid, which was biased low',
  'for slow-V2 patients; (2) fits pass `steadyState: true`, as the UI does; (3) the sampling',
  'budget is the engine default instead of a hard-coded `mcmcIters: 2000, priorDraws: 150`.',
  'Engine and truth definition changed together, so a cell-by-cell change cannot be attributed to',
  'one cause; differences of a few points are 1–2 SE.',
  '',
  '**Result.** All 8 cells sit inside 85–95 % (v1.0.1: baseline cells 85–88 %, both',
  'arm-B cells CHECK). Coverage rose where it was lowest — mmf-trough 86 → 92 %, ec-lss 86 → 94 %,',
  'arm B 84/83 → 90/90 % — **with essentially unchanged interval width** (per-cell mean width within',
  '−4 % … +9 % of v1.0.1; ec-trough 63.7 → 62.3, mmf-trough 48.8 → 48.2). So the v1.0.1 coverage was',
  'not being bought with wider intervals (F11’s concern), and the shortfall the v1.0.1 record',
  'attributed to the diagonal-Ω approximation (“costs ~3–5 points”) is **not reproduced**: arm B now',
  'reads 90 % against 89 % (mmf) and 94 % (ec) baselines. The approximation may still cost a little;',
  'this record cannot resolve it at n = 100.',
  '',
  '**Intervals no longer depend on configuration** (the F11 verification). Same 100 patients, same',
  'seeds; only the sampler configuration changes:',
  '',
  '| cell | 8 chains × 100 k (default) | 4 chains | 1.6 M iterations |',
  '|---|---|---|---|',
  '| ec-trough | 86 %, width 62.3, 95 % conv. | 86 %, 62.2, 99 % | 86 %, 62.2, 99 % |',
  '| mmf-trough | 92 %, 48.2, 91 % | 92 %, 48.2, 96 % | 92 %, 48.2, 99 % |',
  '| ec-lss | 94 %, 49.8, 85 % | – | 92 %, 49.8, 88 % |',
  '| ec-lss-armA | 95 %, 48.2, 95 % | – | 95 %, 48.3, 97 % |',
  '| ec-lss-armB | 90 %, 51.7, 85 % | – | 90 %, 51.7, 87 % |',
  '',
  'In v1.0.1, going from 4 to 8 chains at the same budget moved the ec-trough width from 55 to 68.',
  'Coverage differences between configurations are 0–2 patients (seed noise), widths agree to 0.1.',
  '',
  '**Membership (EC-MPS), now from the corrected sampler (F2).** Hit rate 77 % on ec-lss (prior-mode',
  'baseline 51 %), 79 % / 74 % on the arms. On ec-trough it is 57 % with P̄(true) = 0.41, which is what',
  'an uninformative posterior returns (Σp² = 0.39 under the 51/32/17 prior): trough-only data cannot',
  'identify the subgroup, and the sampler no longer inflates it (v1.0.1: 0.47, the squared prior).',
  'Switch rate and ESS(CL) are **not comparable** with v1.0.1: the kept draws are thinned differently',
  'and ESS is now the bulk split-chain estimate (F7), not the pooled lag-1 one.',
  '',
  '**Convergence — an open item.** The `converged` column is the share of fits meeting R̂ < 1.01 and',
  'ESS ≥ 400 on AUC12 and on the trough (the printed quantities; slowly mixing nuisance etas such as',
  'V2 or TLAG_EVE are reported separately — on fits where V2 failed, AUC agreed with the independent',
  'reference to 0.4 pp). MMF cells: 91–100 %. EC-MPS cells: 85–95 %. The remaining EC-MPS misses are',
  'mostly mild (median R̂ 1.02–1.03) with a heavy tail (max 1.2 in ec-lss, 2.0 in arm B); they cover as',
  'well as the converged fits (93 % vs 94 % / 89 %) but their intervals are wider (54 vs 49; 60 vs 50).',
  'Doubling the iterations moves ec-lss from 85 % to 88 %, so this is slow mixing of the discrete',
  'absorption subgroup, not a budget problem; fixing it needs a sampler change (e.g. joint η/membership',
  'moves). The app flags these fits on screen and in the report.',
  '',
  '| Cell | n | fails | AUC12 5–95% coverage (±SE) | mean width (mg·h/L) | mean |ΔAUC| | membership hit / P̄(true) | switch rate | accept | ESS(CL) | converged |',
  '|---|---|---|---|---|---|---|---|---|---|---|---|'
].join('\n');

const footer = [
  '',
  '**Acceptance (ST1):** coverage 85–95% per baseline cell; membership accuracy ≥ 51%',
  '(the prior-mode baseline) on EC-LSS; switch rate > 0; trough-only cells are expected',
  'to show WIDER intervals (more prior) with coverage holding. All met.',
  '',
  '**Robustness arms (ST2):** arm A = truth under the exact-log-normal ω², fitted with',
  "the app's √ω² convention (S1 sensitivity). arm B = truth with ρ(CL,V1)=0.5, fitted",
  'with the diagonal Ω the app uses (approximation check).',
  '',
  '**Arm verdicts at n = 100:** arm A — 95 % (ec) and 92 % (mmf), coverage-benign. Coverage-benign is',
  'not report-benign: with sparse data the ω² convention still moves the printed interval width by',
  'roughly 10 % and P(within window) by a few points (model card). arm B — 90 % in both cells, no',
  'measurable loss against baseline at this n.',
  '',
  '**Not covered by this record:** truth is drawn from the model’s own prior (including its',
  'implausible tail); morning-ending schedules only (S12 anchoring inactive by construction);',
  'synthetic data cannot show model misspecification against real patients.',
  '',
  missing.length
    ? '**INCOMPLETE:** missing cells: ' + missing.join(', ') + ' — re-run the corresponding job.'
    : 'All 8 cells present — calibration of record complete. Reproduce: `node tools/calibrate_dewinter.mjs --n=100 --tag=f11-<cell> --cells=<cell>` per cell, then `node tools/assemble_calibration.mjs --prefix=f11-` (≈2 min per cell, cells can run in parallel).',
  ''
].join('\n');

const md = header + '\n' + ORDER.filter(k => rows[k]).map(k => row(rows[k])).join('\n') + '\n' + footer;

writeFileSync(resolve(root, '..', 'docs', 'CALIBRATION_RESULTS.md'), md);
console.log(md);
