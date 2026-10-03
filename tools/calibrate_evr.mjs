/* =========================================================================
 * Calibration of the everolimus (Zwart 2021 Model 3) implementation: simulation-recovery.
 *
 * Synthetic patients with KNOWN random effects (CLINT, V3, FU drawn from the prior), a random prednisolone group, a log-normal
 * residual (SD 0.309, whole blood) are fitted with the production runFit. Truth = the patient's steady-state AUC0-12 and trough of
 * the current regimen, actual (the patient's haematocrit) and corrected to 0.38. The 5-95 % interval should cover it 85-95 % of
 * the time (n = 100 per cell, SE about 3 %). M3 has no occasion effect, so this checks the engine, the sampler and the exposure
 * summary, not the model's real-world accuracy (that is the paper's Table 2, quoted in About).
 *
 * Cells: {ss, hist} × {trough1, profile2} × {Ht normal / low / high}
 *   ss        steady-state mode            hist     a typed 21-day history (42 doses)
 *   trough1   one predose trough           profile2 predose + a sample 2 h after the dose
 *   Ht        normal ~ N(0.36, 0.05), low = 0.26, high = 0.46 (all clipped to 0.20-0.55)
 * Usage: node tools/calibrate_evr.mjs --cell=ss-trough1 [--ht=normal|low|high] [--n=100] [--iters=N] [--tag=x]
 *        results appended to /tmp/calib_evr_<tag>_<cell>-<ht>.jsonl
 * ========================================================================= */
import { appendFileSync, writeFileSync } from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
require('../src/version.js'); require('../src/model.js'); require('../src/everolimus.js'); require('../src/bayes.js');
const { model: M, bayes: B } = globalThis.ECU;
const T = M.spec('evr').custom, K = T.constants;

const arg = (k, d) => { const a = process.argv.find(x => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const CELL = arg('cell', 'ss-trough1'), HTC = arg('ht', 'normal'), N = parseInt(arg('n', '100'), 10), TAG = arg('tag', 'main');
const ITERS = parseInt(arg('iters', '0'), 10) || null, SEED0 = parseInt(arg('seed', '1000'), 10);
const OUT = `/tmp/calib_evr_${TAG}_${CELL}-${HTC}.jsonl`;
writeFileSync(OUT, '');
const [MODE0, DESIGN0] = CELL.split('-');

function lcg(seed) { let a = seed >>> 0; return () => { a = (Math.imul(a, 1664525) + 1013904223) >>> 0; return a / 4294967296; }; }
function gauss(rng) { let u = 0, v = 0; while (u === 0) u = rng(); v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
const SIGMA = Math.sqrt(K.SIGMA_LOG2), OM = [K.OM_CLINT, K.OM_V3, K.OM_FU].map(Math.sqrt);

function simulatePatient(i) {
  const rng = lcg(SEED0 + i * 7919);
  const hct = Math.min(0.55, Math.max(0.20, HTC === 'low' ? 0.26 + 0.01 * gauss(rng) : (HTC === 'high' ? 0.46 + 0.01 * gauss(rng) : 0.36 + 0.05 * gauss(rng))));
  const high = rng() < 0.5, doseMg = [1, 1.5, 2][Math.floor(rng() * 3)], eta = OM.map(s => s * gauss(rng));
  const rawEx = { hct: String(hct), predHigh: high ? 'high' : 'low' };
  const ex = T.normExtra(rawEx, 70), tEnd = 100 * 24 + 8 + 21 * 24, amt = doseMg * 1000;
  const p = M.indivParams(70, null, null, ex, eta, 'evr');
  const gridT = []; for (let k = 0; k <= 48; k++) gridT.push(tEnd + k * 0.25);
  const tr = T.exposure([eta], { wt: 70, extra: ex, ss: { amt: amt, every: 12, tEnd: tEnd }, grid: gridT, hctAct: hct, hctRef: K.HCT_REF });
  const truth = { auc: tr.aucA[0], tr: tr.trA[0], aucR: tr.aucR[0], trR: tr.trR[0] };
  const sampleTimes = DESIGN0 === 'trough1' ? [tEnd] : [tEnd, tEnd + 2];
  const hist = []; for (let k = 0; k < 42; k++) hist.push({ t: tEnd - 12 * k, amt: amt });
  hist.sort((a, b) => a.t - b.t);
  const sim = MODE0 === 'ss' ? M.simulate([], sampleTimes, p, { id: 'evr', ss: { amt: amt, every: 12, tEnd: tEnd } }) : M.simulate(hist, sampleTimes, p, { id: 'evr' });
  const obs = sampleTimes.map((t, j) => ({ t: t, c: T.toObs(sim.c[j], hct) * Math.exp(SIGMA * gauss(rng)), hct: hct }));
  const given = MODE0 === 'ss' ? M.ssHistory({ amt: amt, intervalHours: 12, tEnd: tEnd, n: 30, route: 'oral' }) : hist.map(d => ({ t: d.t, amt: d.amt, route: 'oral' }));
  return { hct, rawEx, truth, obs, given };
}

const cover = (st, v) => v >= st.p5 && v <= st.p95;
for (let i = 0; i < N; i++) {
  const sp = simulatePatient(i), t0 = Date.now();
  let rec;
  try {
    const fit = await B.runFit({ drug: 'evr', extra: sp.rawEx, doses: sp.given, steadyState: MODE0 === 'ss', obs: sp.obs, intervalHours: 12, seed: 20250907 + i, mcmcIters: ITERS || undefined }, null);
    rec = {
      i, ok: true, ms: Date.now() - t0, conv: fit.convergence ? fit.convergence.ok : null, rhat: fit.convergence && fit.convergence.rhat, ess: fit.convergence && fit.convergence.essMin,
      acc: fit.acceptance, truth: sp.truth, hct: sp.hct,
      auc: [fit.auc.p5, fit.auc.median, fit.auc.p95], tr: [fit.trough.p5, fit.trough.median, fit.trough.p95],
      aucR: [fit.aucCorr.p5, fit.aucCorr.median, fit.aucCorr.p95], trR: [fit.troughCorr.p5, fit.troughCorr.median, fit.troughCorr.p95],
      cov: { auc: cover(fit.auc, sp.truth.auc), tr: cover(fit.trough, sp.truth.tr), aucR: cover(fit.aucCorr, sp.truth.aucR), trR: cover(fit.troughCorr, sp.truth.trR) }
    };
  } catch (e) { rec = { i, ok: false, err: String(e && e.message || e), ms: Date.now() - t0 }; }
  appendFileSync(OUT, JSON.stringify(rec) + '\n');
}
console.log('done', CELL, HTC, OUT);
