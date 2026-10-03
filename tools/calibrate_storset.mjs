/* =========================================================================
 * V14 calibration — tacrolimus (Størset 2014) implementation
 *
 * Simulation–recovery: synthetic patients with KNOWN random effects, a fresh
 * day-to-day effect (κ on F and ka) on EVERY day, and 14.9 % proportional noise
 * are fitted with the production runFit; the fit only gives κ to sampled days.
 * Truth = the patient's steady-state AUC0–12 and trough on a typical day
 * (κ = 0), actual (haematocrit 0.33) and corrected to 0.35. The 5–95 % interval
 * should cover it 85–95 % of the time (n = 100 per cell → SE ≈ 3 %).
 *
 * Cells:  {ss, hist} × {trough1, troughs5, profile3}
 *   ss    steady-state mode, samples on the last day(s)
 *   hist  a typed 21-day history, samples on the last day(s)
 *   trough1  one predose trough · troughs5  predose troughs on 5 consecutive days
 *   profile3 predose + 1 h + 3 h on one day
 * Arms (on ss-profile3): A exact log-normal ω² truth · B ρ(V1,Q) = 0 truth ·
 *   C 15 % CYP3A5 expressers in truth, fitted as "unknown" (non-expresser)
 *
 * Usage: node tools/calibrate_storset.mjs --cell=ss-profile3 [--n=100] [--iters=N] [--tag=x]
 *        (one process per cell; results appended to /tmp/calib_tac_<tag>_<cell>.jsonl)
 * ========================================================================= */
import { appendFileSync, writeFileSync } from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
require('../src/version.js'); require('../src/model.js'); require('../src/tacrolimus.js'); require('../src/bayes.js');
const { model: M, bayes: B } = globalThis.ECU;
const T = M.spec('tac').custom, K = T.constants;

const arg = (k, d) => { const a = process.argv.find(x => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const CELL = arg('cell', 'ss-profile3'), N = parseInt(arg('n', '100'), 10), TAG = arg('tag', 'main');
const ITERS = parseInt(arg('iters', '0'), 10) || null, SEED0 = parseInt(arg('seed', '1000'), 10);
const OUT = `/tmp/calib_tac_${TAG}_${CELL}.jsonl`;
writeFileSync(OUT, '');

const [MODE0, DESIGN0] = CELL.replace(/-arm[ABC]$/, '').split('-');
const ARM = (CELL.match(/-arm([ABC])$/) || [])[1] || '';

function lcg(seed) { let a = seed >>> 0; return () => { a = (Math.imul(a, 1664525) + 1013904223) >>> 0; return a / 4294967296; }; }
function gauss(rng) { let u = 0, v = 0; while (u === 0) u = rng(); v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

// truth variance structure
const cvs = { CL: K.CV_CL, V1: K.CV_V1, Q: K.CV_Q, KF: K.CV_KF, KKA: K.CV_KKA };
const w2 = cv => ARM === 'A' ? Math.log(1 + cv * cv) : cv * cv;     // arm A: exact log-normal ω²
const rhoV1Q = ARM === 'B' ? 0 : K.CORR_V1_Q;
function drawBSV(rng) {
  const s = [Math.sqrt(w2(cvs.CL)), Math.sqrt(w2(cvs.V1)), Math.sqrt(w2(cvs.Q))];
  const R = [[1, K.CORR_CL_V1, K.CORR_CL_Q], [K.CORR_CL_V1, 1, rhoV1Q], [K.CORR_CL_Q, rhoV1Q, 1]];
  // Cholesky of the correlation matrix
  const L = [[1, 0, 0], [R[1][0], 0, 0], [R[2][0], 0, 0]];
  L[1][1] = Math.sqrt(1 - L[1][0] ** 2); L[2][1] = (R[2][1] - L[2][0] * L[1][0]) / L[1][1];
  L[2][2] = Math.sqrt(1 - L[2][0] ** 2 - L[2][1] ** 2);
  const z = [gauss(rng), gauss(rng), gauss(rng)];
  return [0, 1, 2].map(i => s[i] * (L[i][0] * z[0] + L[i][1] * z[1] + L[i][2] * z[2]));
}

function patient(i) {
  const rng = lcg(SEED0 + i * 7919);
  const male = rng() < 0.6;
  const wt = Math.max(45, Math.min(130, (male ? 82 : 68) + 14 * gauss(rng)));
  const ht = Math.max(145, Math.min(200, (male ? 178 : 165) + 7 * gauss(rng)));
  const pred = [5, 7.5, 10, 15, 20][Math.floor(rng() * 5)];
  const hct = Math.max(0.22, Math.min(0.48, 0.34 + 0.05 * gauss(rng)));
  const expr = ARM === 'C' ? rng() < 0.15 : false;
  return { rng, sex: male ? 'm' : 'f', wt, ht, pred, hct, expr, eta: drawBSV(rng) };
}

const DOSE_MG = 3;
function simulatePatient(i) {
  const pt = patient(i), rng = pt.rng;
  const day0 = 100, tEnd = day0 * 24 + 8 + 21 * 24;         // 08:00, 21 days after the first dose
  const lastDay = Math.floor(tEnd / 24);
  const nDays = MODE0 === 'ss' ? 12 : 22;                      // days that carry an occasion effect
  const days = []; for (let d = lastDay - nDays + 1; d <= lastDay; d++) days.push(d);
  const rawEx = { sex: pt.sex, ht: pt.ht, pred: String(pt.pred), hct: String(pt.hct), assay: 'lcms', cyp3a5: pt.expr ? 'expresser' : 'unknown' };
  const truthEx = T.normExtra(Object.assign({}, rawEx, { cyp3a5: pt.expr ? 'expresser' : 'nonexpresser' }), pt.wt);
  const exK = Object.assign({}, truthEx, { nOcc: nDays, occDays: days });
  const etaK = pt.eta.slice();
  const kapF = [], kapA = [];
  for (let d = 0; d < nDays; d++) { kapF.push(Math.sqrt(w2(cvs.KF)) * gauss(rng)); kapA.push(Math.sqrt(w2(cvs.KKA)) * gauss(rng)); etaK.push(kapF[d], kapA[d]); }
  const pK = M.indivParams(pt.wt, null, null, exK, etaK, 'tac');
  // the typical-day truth: κ = 0
  const ex0 = Object.assign({}, truthEx, { nOcc: 0, occDays: [] });
  const gridT = []; for (let k = 0; k <= 48; k++) gridT.push(tEnd + k * 0.25);
  const tr = T.exposure([pt.eta], { wt: pt.wt, extra: ex0, ss: { amt: DOSE_MG * 1000, every: 12, tEnd: tEnd, pred: pt.pred }, grid: gridT, hctAct: pt.hct, hctRef: K.HCT_REF });
  const truth = { auc: tr.aucA[0], tr: tr.trA[0], aucR: tr.aucR[0], trR: tr.trR[0] };
  // samples (times relative to the last dose at tEnd; a predose trough is at the dose instant)
  const sampleTimes = [];
  const lastDayStart = tEnd;                                    // dose 08:00 on the last day
  if (DESIGN0 === 'trough1') sampleTimes.push(tEnd);
  else if (DESIGN0 === 'troughs5') for (let k = 4; k >= 0; k--) sampleTimes.push(tEnd - 24 * k);
  else sampleTimes.push(tEnd, tEnd + 1, tEnd + 3);              // profile3
  // doses: the full history is generated for the truth; what the app is GIVEN depends on the mode
  const fullDoses = [];
  for (let k = 0; k < 2 * (MODE0 === 'ss' ? 30 : 42); k++) {
    const t = tEnd - 12 * k; if (MODE0 !== 'ss' && k >= 42) break;
    const occ = days.indexOf(Math.floor(t / 24));
    fullDoses.push({ t: t, amt: DOSE_MG * 1000, pred: pt.pred, occIdx: occ });
  }
  fullDoses.sort((a, b) => a.t - b.t);
  let simDoses = fullDoses, ss = null;
  if (MODE0 === 'ss') { simDoses = fullDoses.filter(d => d.occIdx >= 0).map(d => Object.assign({}, d, { delta: true })); ss = { amt: DOSE_MG * 1000, every: 12, tEnd: tEnd, pred: pt.pred }; }
  const sim = M.simulate(simDoses, sampleTimes, pK, ss ? { ss } : {});
  const obs = sampleTimes.map((t, j) => {
    const wb = T.toObs(sim.c[j], pt.hct);
    return { t: t, c: Math.max(0.2, wb * (1 + 0.149 * gauss(rng))), hct: pt.hct };
  });
  const given = MODE0 === 'ss'
    ? M.ssHistory({ amt: DOSE_MG * 1000, intervalHours: 12, tEnd: tEnd, n: 30, route: 'oral' }).map(d => ({ t: d.t, amt: d.amt, route: 'oral', pred: pt.pred }))
    : fullDoses.map(d => ({ t: d.t, amt: d.amt, route: 'oral', pred: pt.pred }));
  return { pt, rawEx, truth, obs, given, tEnd };
}

const cover = (st, v) => v >= st.p5 && v <= st.p95;
for (let i = 0; i < N; i++) {
  const sp = simulatePatient(i);
  const t0 = Date.now();
  let rec;
  try {
    const fit = await B.runFit({
      drug: 'tac', wt: sp.pt.wt, extra: sp.rawEx, doses: sp.given, steadyState: MODE0 === 'ss', obs: sp.obs,
      intervalHours: 12, seed: 20250907 + i, mcmcIters: ITERS || undefined
    }, null);
    rec = {
      i, ok: true, ms: Date.now() - t0, conv: fit.convergence ? fit.convergence.ok : null, rhat: fit.convergence && fit.convergence.rhat, ess: fit.convergence && fit.convergence.essMin,
      acc: fit.acceptance, nOcc: fit.nOccasions, truth: sp.truth,
      auc: [fit.auc.p5, fit.auc.median, fit.auc.p95], tr: [fit.trough.p5, fit.trough.median, fit.trough.p95],
      aucR: [fit.aucCorr.p5, fit.aucCorr.median, fit.aucCorr.p95], trR: [fit.troughCorr.p5, fit.troughCorr.median, fit.troughCorr.p95],
      cov: { auc: cover(fit.auc, sp.truth.auc), tr: cover(fit.trough, sp.truth.tr), aucR: cover(fit.aucCorr, sp.truth.aucR), trR: cover(fit.troughCorr, sp.truth.trR) }
    };
  } catch (e) { rec = { i, ok: false, err: String(e && e.message || e), ms: Date.now() - t0 }; }
  appendFileSync(OUT, JSON.stringify(rec) + '\n');
}
console.log('done', CELL, OUT);
