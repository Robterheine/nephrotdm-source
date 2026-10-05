/* =========================================================================
 * L4 / L4b calibration of the pediatric models (hand-off section 7), statistician's seat.
 * Simulation-recovery with the SHIPPED sampler (B.runFit at spec.mcmcIters, 8 chains, chain seeds per chain; run in-process, one cell per process;
 * the same draws as on the worker pool by construction, see src/bayes.js chainSeed). Truth and data come from tools/calibrate_ped_sim.mjs, which is
 * independent of the code under test (tools/calibrate_ped_selfcheck.mjs shows the two agree).
 *
 * Truth (per patient): the steady-state AUC0-12 and trough of the LAST regimen on a typical day (occasion effects 0): MPA plasma mg·h/L and mg/L;
 * tacrolimus whole blood at the last haematocrit (actual) and at 0.35 (corrected). L4b: the AUC of the sampled day, i.e. the numerical integral over the
 * 12 h that carries the sample (MPA, occasion effect of that day included; a trough-only design samples the interval that ENDS at the trough, so the
 * interval before it; every other design the interval that starts at the sampled dose). Tacrolimus has no occasion layer: sampled day = typical day.
 * The data-generating process is harder than the fitted model in the same way as the earlier calibrations: every calendar day carries its own occasion
 * effect (MPA), while the fit gives one only to days that carry a sample.
 *
 * Usage:  node tools/calibrate_ped.mjs --drug=mpaped|tacped --cell=ID [--n=100] [--tag=main] [--sab=none|sig4|om3|cl1.3] [--iters=N] [--list]
 * Output: /tmp/claude-501/calibration_ped/L4_<tag>_<drug>_<cell>.jsonl   (one JSON line per simulated patient)
 * ========================================================================= */
import { appendFileSync, writeFileSync, mkdirSync } from 'fs';
import { createRequire } from 'module';
import * as S from './calibrate_ped_sim.mjs';
const require = createRequire(import.meta.url);
['version', 'model', 'tacped', 'mpaped', 'bayes'].forEach(f => require('../src/' + f + '.js'));
const { model: M, bayes: B } = globalThis.ECU;

const arg = (k, d) => { const a = process.argv.find(x => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const DRUG = arg('drug', 'mpaped'), CELL = arg('cell', ''), N = parseInt(arg('n', '100'), 10), TAG = arg('tag', 'main'), SAB = arg('sab', 'none');
const ITERS = parseInt(arg('iters', '0'), 10) || undefined;
const SIG2 = parseFloat(arg('sig2', '0')) || null, KAPMODE = arg('kapmode', 'all');   // DIAGNOSTICS only: sig2 sets the residual variance of BOTH the simulation and the fit (the spec object is changed in this process, not in src); kapmode=sampled puts occasion effects only on the sampled days
if (SIG2) globalThis.ECU.model.spec(DRUG).SIGMA.PROP = SIG2;
const SIM0 = 5550000, FIT0 = 9100000;           // simulation and fit seeds are different families on purpose

const SCHED = { trough: [0], s012: [0, 1, 2], s0052: [0, 0.5, 2], rich: [0, 0.5, 1, 1.5, 2, 4, 6, 8], s0124: [0, 1, 2, 4] };
// MPA cells: wt, albumin, schedule, number of sampled occasions (the second is 7 days before the first), mode (hist = 21-day history typed; ss = steady-state mode)
const MPA_CELLS = {
  M01: { wt: 38, alb: 34, sched: 'trough', nocc: 1, mode: 'hist' }, M02: { wt: 38, alb: 34, sched: 's012', nocc: 1, mode: 'hist' },
  M03: { wt: 38, alb: 34, sched: 's0052', nocc: 1, mode: 'hist' }, M04: { wt: 38, alb: 34, sched: 'rich', nocc: 1, mode: 'hist' },
  M05: { wt: 38, alb: 34, sched: 'trough', nocc: 2, mode: 'hist' }, M06: { wt: 38, alb: 34, sched: 's012', nocc: 2, mode: 'hist' },
  M07: { wt: 38, alb: 34, sched: 'rich', nocc: 2, mode: 'hist' },
  M08: { wt: 13, alb: 34, sched: 's012', nocc: 1, mode: 'hist' }, M09: { wt: 75, alb: 34, sched: 's012', nocc: 1, mode: 'hist' },
  M10: { wt: 38, alb: 25, sched: 's012', nocc: 1, mode: 'hist' }, M11: { wt: 38, alb: 41, sched: 's012', nocc: 1, mode: 'hist' },
  M12: { wt: 13, alb: 25, sched: 'trough', nocc: 1, mode: 'hist' }, M13: { wt: 75, alb: 41, sched: 's0052', nocc: 1, mode: 'hist' },
  M14: { wt: 13, alb: 41, sched: 'rich', nocc: 2, mode: 'hist' }, M15: { wt: 75, alb: 25, sched: 's012', nocc: 2, mode: 'hist' },
  M16: { wt: 13, alb: 34, sched: 'trough', nocc: 2, mode: 'hist' },
  M17: { wt: 38, alb: 34, sched: 's012', nocc: 1, mode: 'ss' }, M18: { wt: 38, alb: 34, sched: 's012', nocc: 2, mode: 'ss' }
};
// Tacrolimus cells: form = cap | sus | c2s (capsule then suspension) | s2c; ht = haematocrit (constant) or [Ht before the change, Ht after] with samples on two days
const TAC_CELLS = {
  T01: { wt: 25, ht: 0.30, form: 'cap', sched: 'trough', days: 1, mode: 'hist' }, T02: { wt: 25, ht: 0.30, form: 'cap', sched: 's012', days: 1, mode: 'hist' },
  T03: { wt: 25, ht: 0.30, form: 'cap', sched: 's0124', days: 1, mode: 'hist' },
  T04: { wt: 25, ht: 0.22, form: 'cap', sched: 's012', days: 1, mode: 'hist' }, T05: { wt: 25, ht: 0.45, form: 'cap', sched: 's012', days: 1, mode: 'hist' },
  T06: { wt: 25, ht: 0.30, form: 'sus', sched: 's012', days: 1, mode: 'hist' }, T07: { wt: 25, ht: 0.30, form: 'c2s', sched: 's012', days: 1, mode: 'hist' },
  T08: { wt: 12, ht: 0.30, form: 'cap', sched: 's012', days: 1, mode: 'hist' }, T09: { wt: 60, ht: 0.30, form: 'cap', sched: 's012', days: 1, mode: 'hist' },
  T10: { wt: 12, ht: 0.22, form: 'sus', sched: 'trough', days: 1, mode: 'hist' }, T11: { wt: 60, ht: 0.45, form: 'cap', sched: 's0124', days: 1, mode: 'hist' },
  T12: { wt: 12, ht: 0.45, form: 's2c', sched: 's0124', days: 1, mode: 'hist' }, T13: { wt: 60, ht: 0.22, form: 'sus', sched: 's0124', days: 1, mode: 'hist' },
  T14: { wt: 25, ht: 0.30, form: 'sus', sched: 'trough', days: 1, mode: 'hist' }, T15: { wt: 25, ht: 0.30, form: 'c2s', sched: 'trough', days: 1, mode: 'hist' },
  T16: { wt: 25, ht: 0.30, form: 'cap', sched: 's012', days: 1, mode: 'ss' }, T17: { wt: 25, ht: 0.30, form: 'sus', sched: 's012', days: 1, mode: 'ss' },
  // haematocrit cells: samples on two days (D-7 and D), Ht constant (control) or changing 5 days before the last sample day (step, the worst case)
  H00: { wt: 25, ht: 0.33, form: 'cap', sched: 's012', days: 2, mode: 'hist' }, H01: { wt: 25, ht: [0.42, 0.26], form: 'cap', sched: 's012', days: 2, mode: 'hist' },
  H02: { wt: 25, ht: [0.24, 0.40], form: 'cap', sched: 's012', days: 2, mode: 'hist' }, H03: { wt: 25, ht: [0.42, 0.26], form: 'sus', sched: 'trough', days: 2, mode: 'hist' },
  H04: { wt: 25, ht: [0.24, 0.40], form: 'cap', sched: 'trough', days: 2, mode: 'hist' }
};
const CELLS = DRUG === 'mpaped' ? MPA_CELLS : TAC_CELLS;
if (process.argv.includes('--list')) { console.log(Object.keys(CELLS).join(' ')); process.exit(0); }
const C = CELLS[CELL];
if (!C) { console.error('unknown cell ' + CELL + ' for ' + DRUG); process.exit(2); }
const OUTDIR = '/tmp/claude-501/calibration_ped'; mkdirSync(OUTDIR, { recursive: true });
const OUT = `${OUTDIR}/L4_${TAG}_${DRUG}_${CELL}.jsonl`; writeFileSync(OUT, '');
// the Ht-triplet cells share patients (same seeds) so that they are paired; every other cell has its own family of seeds
const cellIdx = Object.keys(CELLS).indexOf(CELL), seedGroup = /^H/.test(CELL) ? 900 : cellIdx;

const NOISE_SD = Math.sqrt((SIG2 || (DRUG === 'mpaped' ? S.MPA.SIG2 : S.TAC.SIG2)) * (SAB === 'sig4' ? 4 : 1));
const OMF = SAB === 'om3' ? 3 : 1;
function noisy(rng, c) { let e; do { e = NOISE_SD * S.gauss(rng); } while (1 + e < 0.05); return c * (1 + e); }   // keeps the concentration positive (MPA: truncation at -95 %, 1.7 % of draws)
const rankOf = (draws, k, v) => { let n = 0; for (let i = 0; i < draws.length; i++) if (draws[i][k] < v) n++; return n / draws.length; };
const qs = (a, ps) => { const s = a.slice().sort((x, y) => x - y); return ps.map(p => s[Math.min(s.length - 1, Math.max(0, Math.floor(p * s.length)))]); };
const cover = (st, v) => v >= st.p5 && v <= st.p95;

function genMPA(i) {
  const rng = S.mulberry32(SIM0 + seedGroup * 100003 + i * 7919);
  const eta = S.MPA.OM.map(v => Math.sqrt(v * OMF) * S.gauss(rng));
  if (SAB === 'cl1.3') eta[0] += Math.log(1.3);
  if (SAB === 'cl2') eta[0] += Math.log(2);
  const nDays = C.mode === 'ss' ? 40 : 21, times = S.doseTimes(nDays), days = []; for (let d = S.dayOf(times[0]); d <= S.DAY_D; d++) days.push(d);
  const kap = days.map(() => Math.sqrt(S.MPA.OMOCC) * S.gauss(rng));
  if (KAPMODE === 'sampled') { const keep = new Set([S.DAY_D, S.DAY_D - 1].concat(C.nocc === 2 ? [S.DAY_D - 7, S.DAY_D - 8] : [])); days.forEach((d, j) => { if (!keep.has(d)) kap[j] = 0; }); }
  const amt = Math.max(100, Math.round(15 * C.wt / 50) * 50);         // simulation design only: about 15 mg of MMF per kg per dose
  const docs = times.map(t => ({ t, amt, fac: Math.exp(kap[days.indexOf(S.dayOf(t))]) }));
  const sys = S.mpaSys(C.wt, C.alb, eta), segs = [{ t0: -Infinity, sys }];
  const offs = C.nocc === 2 ? [-168, 0] : [0], sampleT = [];
  offs.forEach(o => SCHED[C.sched].forEach(h => sampleT.push(S.TEND + o + h)));
  const clean = S.simConc(segs, docs, sampleT);
  const obs = sampleT.map((t, j) => ({ t, c: noisy(rng, clean[j]) }));
  const ss = S.ssExposure(sys, amt, null, 12, { id: c => c });
  const kD = kap[days.indexOf(S.DAY_D)], kP = kap[days.indexOf(S.dayOf(S.TEND - 1))];
  const aucDay = S.integrate(sys, S.stateAfter(segs, docs, S.TEND), 12, c => c).auc;
  const aucPrev = S.integrate(sys, S.stateAfter(segs, docs, S.TEND - 12), 12, c => c).auc;
  const given = C.mode === 'ss' ? M.ssHistory({ amt, intervalHours: 12, tEnd: S.TEND, n: 30, route: 'oral' }) : times.map(t => ({ t, amt, route: 'oral' }));
  return {
    input: { drug: 'mpaped', wt: C.wt, extra: { albumin: C.alb }, doses: given, steadyState: C.mode === 'ss', obs, intervalHours: 12 },
    truth: { auc: ss.id.auc, tr: ss.id.trough, aucDay, aucPrev, aucSampled: C.sched === 'trough' ? aucPrev : aucDay, aucIdent: amt * 1 / sys.cl, kD, kP, eta, kap, days },
    sampledOcc: C.sched === 'trough' ? S.dayOf(S.TEND - 1) : S.DAY_D
  };
}

function genTAC(i) {
  const rng = S.mulberry32(SIM0 + seedGroup * 100003 + i * 7919);
  const eta = S.TAC.OM.map(v => Math.sqrt(v * OMF) * S.gauss(rng));
  if (SAB === 'cl1.3') eta[1] += Math.log(1.3);
  if (SAB === 'cl2') eta[1] += Math.log(2);
  const nDays = C.mode === 'ss' ? 40 : 21, times = S.doseTimes(nDays), nD = times.length;
  const formOf = (k) => C.form === 'cap' ? 'capsule' : C.form === 'sus' ? 'suspension'
    : C.form === 'c2s' ? (k < nD - 18 ? 'capsule' : 'suspension') : (k < nD - 18 ? 'suspension' : 'capsule');       // a switch 9 days before the last dose
  const lastForm = formOf(nD - 1), amt = Math.max(100, Math.round(200 * C.wt / 100) * 100);       // simulation design only: about 0.2 mg/kg per dose
  const docs = times.map((t, k) => ({ t, amt, form: formOf(k) }));
  const htB = Array.isArray(C.ht) ? C.ht[1] : C.ht, htA = Array.isArray(C.ht) ? C.ht[0] : C.ht, tSw = S.TEND - 5 * 24;
  const segs = Array.isArray(C.ht) ? [{ t0: -Infinity, sys: S.tacSys(C.wt, htA, eta) }, { t0: tSw, sys: S.tacSys(C.wt, htB, eta) }] : [{ t0: -Infinity, sys: S.tacSys(C.wt, htB, eta) }];
  const htAt = (t) => (Array.isArray(C.ht) && t < tSw) ? htA : htB;
  const offs = C.days === 2 ? [-168, 0] : [0], sampleT = [];
  offs.forEach(o => SCHED[C.sched].forEach(h => sampleT.push(S.TEND + o + h)));
  const clean = S.simConc(segs, docs, sampleT);
  const obs = sampleT.map((t, j) => { const h = htAt(t); return { t, c: noisy(rng, S.wholeBlood(clean[j], h)), hct: h }; });
  const ssx = S.ssExposure(segs[segs.length - 1].sys, amt, lastForm, 12, { act: c => S.wholeBlood(c, htB), ref: c => S.wholeBlood(c, 0.35) });
  const given = C.mode === 'ss' ? M.ssHistory({ amt, intervalHours: 12, tEnd: S.TEND, n: 30, route: 'oral', form: lastForm }) : docs.map(d => ({ t: d.t, amt, route: 'oral', form: d.form }));
  return {
    input: { drug: 'tacped', wt: C.wt, extra: { hct: htB }, doses: given, steadyState: C.mode === 'ss', obs, intervalHours: 12 },
    truth: { auc: ssx.act.auc, tr: ssx.act.trough, aucR: ssx.ref.auc, trR: ssx.ref.trough, eta, lastForm }
  };
}

const MPA_ETA = ['CL', 'VC', 'Q'], TAC_ETA = ['KA', 'CLINT', 'V3'];
for (let i = 0; i < N; i++) {
  const sp = DRUG === 'mpaped' ? genMPA(i) : genTAC(i), t0 = Date.now();
  let rec;
  try {
    const fit = await B.runFit(Object.assign({ seed: FIT0 + i * 31, mcmcIters: ITERS }, sp.input), null);
    const cv = fit.convergence, T = sp.truth, dr = fit.draws, nE = 3;
    rec = {
      i, ok: true, ms: Date.now() - t0, conv: cv ? cv.ok : null, rhat: cv && cv.rhat, ess: cv && cv.essMin, rhatEta: cv && cv.rhatEta, essEta: cv && cv.essEta,
      rhatAuc: cv && cv.rhatAuc, essAuc: cv && cv.essAuc, acc: fit.acceptance, nOcc: fit.nOccasions, dim: dr[0].length, shrink: fit.shrink.slice(0, nE), nObs: sp.input.obs.length,
      truth: { auc: T.auc, tr: T.tr }, auc: [fit.auc.p5, fit.auc.median, fit.auc.p95], tr: [fit.trough.p5, fit.trough.median, fit.trough.p95],
      cov: { auc: cover(fit.auc, T.auc), tr: cover(fit.trough, T.tr) },
      eta: T.eta.slice(0, nE), rank: [0, 1, 2].map(k => rankOf(dr, k, T.eta[k])), q: [0, 1, 2].map(k => qs(dr.map(d => d[k]), [0.01, 0.05, 0.5, 0.95, 0.99]))
    };
    if (DRUG === 'tacped') {
      Object.assign(rec.truth, { aucR: T.aucR, trR: T.trR });
      rec.aucR = [fit.aucCorr.p5, fit.aucCorr.median, fit.aucCorr.p95]; rec.trR = [fit.troughCorr.p5, fit.troughCorr.median, fit.troughCorr.p95];
      Object.assign(rec.cov, { aucR: cover(fit.aucCorr, T.aucR), trR: cover(fit.troughCorr, T.trR) });
    } else {
      // L4b: sampled-day AUC. truth = numerical integral over the sampled interval. The "line" = the posterior of amt·e^(kappa of the sampled occasion)/CL per draw
      const j = fit.extra.occDays.indexOf(sp.sampledOcc), ch = fit.auc12Chain, kd = dr.map(d => d[3 + j]);
      const line = ch.map((a, d) => a * Math.exp(kd[d])), lq = qs(line, [0.05, 0.5, 0.95]);
      Object.assign(rec.truth, { aucDay: T.aucDay, aucPrev: T.aucPrev, aucSampled: T.aucSampled, aucIdent: T.aucIdent, kD: T.kD, kP: T.kP });
      rec.line = lq; rec.covDay = fit.auc.p5 <= T.aucSampled && T.aucSampled <= fit.auc.p95; rec.covLine = lq[0] <= T.aucSampled && T.aucSampled <= lq[2];
      rec.sampledIdx = j; rec.kappaRank = j >= 0 ? rankOf(dr, 3 + j, T.kap[T.days.indexOf(sp.sampledOcc)]) : null;
      rec.occDays = fit.extra.occDays.map(d => d - S.DAY_D);
    }
  } catch (e) { rec = { i, ok: false, err: String(e && e.message || e), ms: Date.now() - t0 }; }
  appendFileSync(OUT, JSON.stringify(rec) + '\n');
}
console.log('done', DRUG, CELL, OUT);
