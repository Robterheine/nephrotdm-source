/* =========================================================================
 * V10 calibration study — de Winter 2008 implementation (ST1/ST2 protocol)
 *
 * Simulation–recovery: generate synthetic patients with KNOWN etas, mixture
 * membership and log-scale residual noise from the implemented model, fit
 * them with the production runFit, and measure:
 *   - AUC12 5–95% coverage of the true value (accept 85–95% per cell)
 *   - interval width and AUC error
 *   - mixture membership recovery (EC-MPS): posterior mode vs truth,
 *     mean posterior probability of the true subgroup
 *   - membership switch rate on the kept chain (mixing diagnostic, ST3)
 *   - acceptance and ESS(CL)
 *
 * Robustness arms (ST2 — measured, not assumed):
 *   A  truth drawn with the EXACT log-normal ω² = ln(1+CV²), fitted with the
 *      app's √ω² convention  → quantifies scrutiny finding S1
 *   B  truth drawn with correlated etas (ρ(CL,V1)=0.5), fitted with the
 *      diagonal Ω the app actually uses → quantifies the diagonal-Ω
 *      approximation
 *
 * Usage: node tools/calibrate_dewinter.mjs [--quick]   (quick = smoke, n=6)
 * Writes docs/CALIBRATION_RESULTS.md and prints the tables.
 * ========================================================================= */
import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const root = dirname(fileURLToPath(import.meta.url));
require('../src/version.js');
require('../src/model.js');
require('../src/bayes.js');
const ECU = globalThis.ECU;
const M = ECU.model, B = ECU.bayes;

const QUICK = process.argv.includes('--quick');
// Cell selection (--cells a,b) for parallel job execution; each job writes its
// own JSONL and skips the final assembly (done once, from all JSONLs).
const cellArg = (process.argv.find(a => a.startsWith('--cells=')) || '').replace('--cells=', '');
const ONLY = cellArg ? cellArg.split(',') : null;
const TAG = (process.argv.find(a => a.startsWith('--tag=')) || '--tag=main').replace('--tag=', '');
// Experiment knobs (v1.0.1 sampler study): --chains=, --iters=, --n= override the
// fit configuration or cell size for diagnostic runs; defaults keep the
// production configuration (engine default chains, mcmcIters 2000, per-cell N).
const CHAINS = parseInt((process.argv.find(a => a.startsWith('--chains=')) || '--chains=').replace('--chains=', ''), 10) || null;
const ITERS = parseInt((process.argv.find(a => a.startsWith('--iters=')) || '--iters=').replace('--iters=', ''), 10) || null;
// --fits: also write one JSON line per fit (convergence detail, coverage) to /tmp/calib_fits_<tag>.jsonl
const FITS = process.argv.includes('--fits');
const NOVR = parseInt((process.argv.find(a => a.startsWith('--n=')) || '--n=').replace('--n=', ''), 10) || null;
// Cell sizes: production fidelity (full MAP/MCMC budgets) with parallel jobs.
// Coverage SE ≈ 8% at n=40, ≈ 11% at n=20 — reported with binomial CIs; the
// verification team's R2 charter explicitly weighs whether cells must re-run
// larger (ST1 asked n=100; that remains the v1.0.1 option).
const N = QUICK ? 6 : { 'ec-lss': 40, 'ec-trough': 40, 'mmf-lss': 20, 'mmf-trough': 20, 'ec-lss-armA': 20, 'mmf-lss-armA': 20, 'ec-lss-armB': 20, 'mmf-lss-armB': 20 };

// ---- variance structures -------------------------------------------------
const CV = { CL: 0.39, Q: 0.78, V1: 1.00, V2: 4.90, KA: 1.87, TLAG: 0.11, TLAG_MORN: 0.08, TLAG_EVE: 0.40 };
const SQ = {};   // √ω² convention (the app's spec)
const EX = {};   // exact log-normal (arm A truth)
for (const k of Object.keys(CV)) { SQ[k] = CV[k] * CV[k]; EX[k] = Math.log(1 + CV[k] * CV[k]); }

function chol2(rho, v1, v2) { // 2x2 correlation → Cholesky
  return [[Math.sqrt(v1), 0], [rho * Math.sqrt(v2), Math.sqrt(v2 * (1 - rho * rho))]];
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gauss(rng) {
  let s = 0, u = 0, v = 0;
  do { u = rng() * 2 - 1; v = rng() * 2 - 1; s = u * u + v * v; } while (s === 0 || s >= 1);
  return u * Math.sqrt(-2 * Math.log(s) / s);
}

// ---- one synthetic patient ------------------------------------------------
// form: 'mmf' | 'ecmps'; arm: 'base' | 'exact' | 'corr'; design: 'lss' | 'trough'
function makePatient(i, form, arm, design) {
  const rng = mulberry32(90210 + i * 77);
  const names = M.etaNamesFor('mpa', form);
  const vars = names.map(n => SQ[n]);
  const eta = new Array(names.length);
  if (arm === 'corr') {
    // correlated CL–V1 (ρ = 0.5), rest independent
    const L = chol2(0.5, SQ.CL, SQ.V1);
    const z0 = gauss(rng), z1 = gauss(rng);
    const c0 = L[0][0] * z0, c1 = L[1][0] * z0 + L[1][1] * z1;
    names.forEach((n, k) => {
      const idx = names.indexOf(n);
      eta[k] = n === 'CL' ? c0 : (n === 'V1' ? c1 : gauss(rng) * Math.sqrt(SQ[n]));
    });
  } else {
    const v = arm === 'exact' ? names.map(n => EX[n]) : vars;
    names.forEach((n, k) => { eta[k] = gauss(rng) * Math.sqrt(v[k]); });
  }
  const mixPrior = M.mixPriorOf('mpa', form);
  let mix = 0;
  if (mixPrior) { const u = rng(); let acc = 0; for (let k = 0; k < mixPrior.length; k++) { acc += mixPrior[k]; if (u < acc) { mix = k; break; } } }
  // labeled regimens, MPA mg: MMF 1000 → 739, EC-MPS 720 → 674, BID ending on a morning dose
  const amt = form === 'mmf' ? 739 : 674;
  const doses = M.ssHistory({ amt, intervalHours: 12, tEnd: 368, n: 31, route: 'oral' });
  const p = M.indivParams(70, null, null, null, eta, 'mpa', form, mix);
  // true AUC12 over the production window [368, 380]: the EXACT steady-state integral (F11 — the
  // v1.0.1 record used a 31-dose reconstruction + trapezoid, which is biased for slow-V2 patients)
  const ss = { amt, every: 12, tEnd: 368 };
  const trueAuc = M.simulate([], [368], p, { id: 'mpa', ss, aucWindow: [368, 380] }).auc;
  // observations with log-scale residual noise (σ = 0.39)
  const sigma = 0.39;
  const obsT = design === 'trough' ? [380] : (form === 'mmf' ? [368.33, 369, 371] : [369.5, 370, 372]);
  const simO = M.simulate([], obsT, p, { id: 'mpa', ss });
  const obs = obsT.map((t, k) => {
    const cTrue = simO.c[k];
    const cObs = cTrue > 0 ? cTrue * Math.exp(gauss(rng) * sigma) : 0.01;
    return { t, c: Math.max(cObs, 0.01) };
  });
  return { eta, mix, mixPrior, form, doses, trueAuc, obs, seed: 4000 + i };
}

async function fitPatient(pt) {
  const input = {
    drug: 'mpa', form: pt.form, wt: 70,
    doses: pt.doses, steadyState: true, obs: pt.obs, intervalHours: 12,
    winLo: 30, winHi: 60, seed: pt.seed       // sampling budget = the engine default, as shipped
  };
  if (ITERS) input.mcmcIters = ITERS;
  if (CHAINS) input.chains = CHAINS;
  return B.runFit(input, { progress: () => {} });
}

function mixSwitchRate(chain) {
  if (!chain || chain.length < 2) return 0;
  let sw = 0;
  for (let i = 1; i < chain.length; i++) if (chain[i] !== chain[i - 1]) sw++;
  return sw / (chain.length - 1);
}

async function runCell(name, form, arm, design, n) {
  const res = { name, n, cover: 0, widthSum: 0, errSum: 0, accSum: 0, essSum: 0,
    mixHit: 0, mixN: 0, mixPTrueSum: 0, swSum: 0, swN: 0, fails: 0, convN: 0, convOk: 0, rhatMax: 0, t0: Date.now() };
  for (let i = 0; i < n; i++) {
    const pt = makePatient(i, form, arm, design);
    let fit;
    try { fit = await fitPatient(pt); }
    catch (e) { res.fails++; continue; }
    if (!fit || !isFinite(fit.auc.median)) { res.fails++; continue; }
    const covered = fit.auc.p5 <= pt.trueAuc && pt.trueAuc <= fit.auc.p95;
    if (covered) res.cover++;
    if (FITS && fit.convergence) {
      const c = fit.convergence;
      try { writeFileSync('/tmp/calib_fits_' + TAG + '.jsonl', JSON.stringify({ cell: name, i, covered, ok: c.ok, rhat: c.rhat, essMin: c.essMin, rhatAuc: c.rhatAuc, essAuc: c.essAuc, essIn: c.essIn,
        rhatEta: c.rhatEta, essEta: c.essEta, etaNames: fit.etaNames, truthEta: pt.eta, trueAuc: pt.trueAuc, obs: pt.obs, median: fit.auc.median, p5: fit.auc.p5, p95: fit.auc.p95, pIn: fit.auc.pInWindow }) + '\n', { flag: 'a' }); } catch (e) {}
    }
    res.widthSum += (fit.auc.p95 - fit.auc.p5);
    res.errSum += Math.abs(fit.auc.median - pt.trueAuc);
    res.accSum += fit.acceptance;
    res.essSum += fit.ess[0];
    if (fit.convergence) { res.convN++; if (fit.convergence.ok) res.convOk++; res.rhatMax = Math.max(res.rhatMax, fit.convergence.rhat); }
    if (pt.mixPrior && fit.mixPost) {
      res.mixN++;
      if (fit.mixPost.indexOf(Math.max(...fit.mixPost)) === pt.mix) res.mixHit++;
      res.mixPTrueSum += fit.mixPost[pt.mix];
      res.swSum += mixSwitchRate(fit.mixChain);
      res.swN++;
    }
  }
  const k = n - res.fails;
  res.coverage = k ? res.cover / k : NaN;
  res.meanWidth = k ? res.widthSum / k : NaN;
  res.meanAbsErr = k ? res.errSum / k : NaN;
  res.meanAcc = k ? res.accSum / k : NaN;
  res.meanEss = k ? res.essSum / k : NaN;
  res.mixAccuracy = res.mixN ? res.mixHit / res.mixN : NaN;
  res.mixPTrue = res.mixN ? res.mixPTrueSum / res.mixN : NaN;
  res.switchRate = res.swN ? res.swSum / res.swN : NaN;
  res.convergedFrac = res.convN ? res.convOk / res.convN : NaN;
  res.seconds = (Date.now() - res.t0) / 1000;
  return res;
}

const CELLS = [
  ['ec-lss', 'ecmps', 'base', 'lss'],
  ['ec-trough', 'ecmps', 'base', 'trough'],
  ['mmf-lss', 'mmf', 'base', 'lss'],
  ['mmf-trough', 'mmf', 'base', 'trough'],
  ['ec-lss-armA', 'ecmps', 'exact', 'lss'],   // S1: exact-log-normal truth, √ω² fit
  ['mmf-lss-armA', 'mmf', 'exact', 'lss'],
  ['ec-lss-armB', 'ecmps', 'corr', 'lss'],    // diagonal-Ω approximation
  ['mmf-lss-armB', 'mmf', 'corr', 'lss']
];

const out = [];
const CELL_LOG = '/tmp/calib_cells_' + TAG + '.jsonl';
for (const [name, form, arm, design] of CELLS) {
  if (ONLY && !ONLY.includes(name)) continue;
  const n = NOVR || (QUICK ? 6 : N[name]);
  process.stderr.write('cell ' + name + ' (n=' + n + ')… ' + new Date().toISOString() + '\n');
  const r = await runCell(name, form, arm, design, n);
  r.config = (CHAINS ? 'chains=' + CHAINS + ' ' : '') + (ITERS ? 'iters=' + ITERS + ' ' : '') +
    (NOVR ? 'n=' + NOVR + ' ' : '');
  out.push(r);
  // incremental persistence: every completed cell is durable immediately
  try { writeFileSync(CELL_LOG, JSON.stringify(r) + '\n', { flag: 'a' }); } catch (e) {}
  process.stderr.write('  coverage=' + r.coverage.toFixed(2) + ' width=' + r.meanWidth.toFixed(1) +
    ' mixAcc=' + (isNaN(r.mixAccuracy) ? '–' : r.mixAccuracy.toFixed(2)) +
    ' converged=' + (isNaN(r.convergedFrac) ? '–' : (r.convergedFrac * 100).toFixed(0) + '%') + ' maxR̂=' + r.rhatMax.toFixed(3) +
    ' (' + r.seconds.toFixed(0) + 's)\n');
}
if (ONLY) {
  console.log('jsonl-only run (' + TAG + '): ' + out.length + ' cell(s) written to ' + CELL_LOG);
  process.exit(0);
}

function row(r) {
  const pass = r.coverage >= 0.85 && r.coverage <= 0.95 ? '**pass**' : '**CHECK**';
  return '| ' + r.name + ' | ' + r.n + ' | ' + (r.fails || 0) + ' | ' +
    (r.coverage * 100).toFixed(1) + '% ' + pass + ' | ' + r.meanWidth.toFixed(1) + ' | ' +
    r.meanAbsErr.toFixed(1) + ' | ' +
    (isNaN(r.mixAccuracy) ? '–' : (r.mixAccuracy * 100).toFixed(0) + '% / P̄(true)=' + r.mixPTrue.toFixed(2)) + ' | ' +
    (isNaN(r.switchRate) ? '–' : (r.switchRate * 100).toFixed(1) + '%') + ' | ' +
    (r.meanAcc * 100).toFixed(0) + '% | ' + r.meanEss.toFixed(0) + ' |';
}

const header = [
  '# V10 calibration results — de Winter 2008 implementation',
  '',
  'Simulation–recovery per docs/IMPLEMENTATION_PLAN_DEWINTER_2008.md (ST1/ST2).',
  'Synthetic patients drawn from the implemented model (known etas, membership,',
  'log-residual σ=0.39), fitted with the production runFit (mcmcIters 2000, seeded).',
  QUICK ? '**QUICK SMOKE RUN (n=6 per cell) — not the calibration of record.**' : 'Calibration of record.',
  '',
  '| Cell | n | fails | AUC12 5–95% coverage | mean width | mean |err| | membership hit / P(true) | switch rate | accept | ESS(CL) |',
  '|---|---|---|---|---|---|---|---|---|---|---|'
].join('\n');

const footer = [
  '',
  '**Acceptance (ST1):** coverage 85–95% per baseline cell; membership accuracy ≥ 51%',
  '(prior-mode baseline) on EC-LSS; switch rate > 0; trough-only cells are expected',
  'to show WIDER intervals (more prior) with coverage holding.',
  '',
  '**Robustness arms (ST2):** arm A = truth under the exact-log-normal ω², fitted',
  "with the app's √ω² convention (S1 sensitivity). arm B = truth with ρ(CL,V1)=0.5,",
  'fitted with the diagonal Ω the app uses (approximation check). If coverage in the',
  'arms matches baseline, both documented choices are AUC-benign measured, not assumed.',
  ''
].join('\n');

const md = header + '\n' + out.map(row).join('\n') + '\n' + footer;

writeFileSync(resolve(root, '..', 'docs', 'CALIBRATION_RESULTS.md'), md);
console.log(md);
