/* =========================================================================
 * L5 benchmark replication of Heida 2026 (hand-off section 7 and 1.3), statistician's seat. PLAUSIBILITY, not equivalence.
 * The paper's tables are not at hand: weights, albumin and haematocrit are drawn from distributions chosen to match the ranges in the hand-off
 * (MPA: weight 12.9-79.9 kg, albumin 24-42 g/L; tacrolimus: weight median 24.7 (9.1-78) kg, Ht median 0.29 (0.26-0.31, the 2019 set; widened here)).
 * One COHORT = 20 MPA or 23 tacrolimus simulated children with a full profile on a 21-day history (doses 08:00 and 20:00); several independent cohorts
 * are run because one cohort of 20 has an NRMSE that moves by several points from seed to seed. Every schedule subsets the SAME noisy profile.
 *   reference 1 (primary): the true model AUC0-12 of the sampled day (numerical integral; MPA with that day's occasion effect; tacrolimus whole blood at the Ht)
 *   reference 2: the trapezoid AUC0-12 of the noisy 11-point profile (0,0.5,1,1.5,2,3,4,6,8,10,12 h), closer to how a paper computes "observed" AUC
 * estimates: the app's reported (typical-day) AUC median; for MPA also the sampled-day line (typical AUC x exp(kappa of that day), from the same draws).
 *   node tools/calibrate_ped_l5.mjs --drug=mpaped|tacped --cohort=K [--tag=main] [--n=20|23]
 * Output /tmp/claude-501/calibration_ped/L5_<tag>_<drug>_c<K>.jsonl (one line per patient x schedule)
 * ========================================================================= */
import { appendFileSync, writeFileSync, mkdirSync } from 'fs';
import { createRequire } from 'module';
import * as S from './calibrate_ped_sim.mjs';
const require = createRequire(import.meta.url);
['version', 'model', 'tacped', 'mpaped', 'bayes'].forEach(f => require('../src/' + f + '.js'));
const { bayes: B } = globalThis.ECU;
const arg = (k, d) => { const a = process.argv.find(x => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const DRUG = arg('drug', 'mpaped'), K = parseInt(arg('cohort', '0'), 10), TAG = arg('tag', 'main'), N = parseInt(arg('n', DRUG === 'mpaped' ? '20' : '23'), 10);
const TSHIFT = parseFloat(arg('tshift', '0'));   // DIAGNOSTIC: the pre-dose sample is entered this many hours AFTER the dose time, so that the app assigns it to the day of the dose
const OUTDIR = '/tmp/claude-501/calibration_ped'; mkdirSync(OUTDIR, { recursive: true });
const OUT = `${OUTDIR}/L5_${TAG}_${DRUG}_c${K}.jsonl`; writeFileSync(OUT, '');
const FULL = [0, 0.5, 1, 1.5, 2, 3, 4, 6, 8, 10, 12];
const SCHEDS = { 'C0': [0], '0,1,2': [0, 1, 2], '0,0.5,2': [0, 0.5, 2], '0,1,3': [0, 1, 3], '0,0.5,1,2': [0, 0.5, 1, 2], '0,1,2,4': [0, 1, 2, 4], '0,2,4,8': [0, 2, 4, 8], '0-6 h (8)': [0, 0.5, 1, 1.5, 2, 3, 4, 6] };
const clip = (v, a, b) => Math.min(b, Math.max(a, v));
const SD = Math.sqrt(DRUG === 'mpaped' ? S.MPA.SIG2 : S.TAC.SIG2);
const noisy = (rng, c) => { let e; do { e = SD * S.gauss(rng); } while (1 + e < 0.05); return c * (1 + e); };
const trap = (t, y) => { let s = 0; for (let i = 1; i < t.length; i++) s += (t[i] - t[i - 1]) * (y[i] + y[i - 1]) / 2; return s; };
const qs = (a, ps) => { const s = a.slice().sort((x, y) => x - y); return ps.map(p => s[Math.min(s.length - 1, Math.max(0, Math.floor(p * s.length)))]); };

for (let p = 0; p < N; p++) {
  const rng = S.mulberry32(7700000 + K * 1000003 + p * 7919);
  const times = S.doseTimes(21), nD = times.length, days = []; for (let d = S.dayOf(times[0]); d <= S.DAY_D; d++) days.push(d);
  let sys, docs, refSys, truthDay, input, eta, kap = null, ht = null, wt;
  if (DRUG === 'mpaped') {
    wt = clip(38 + 17 * S.gauss(rng), 13, 78); const alb = clip(34 + 4.5 * S.gauss(rng), 24, 42);
    eta = S.MPA.OM.map(v => Math.sqrt(v) * S.gauss(rng)); kap = days.map(() => Math.sqrt(S.MPA.OMOCC) * S.gauss(rng));
    const amt = Math.max(100, Math.round(15 * wt / 50) * 50);
    docs = times.map(t => ({ t, amt, fac: Math.exp(kap[days.indexOf(S.dayOf(t))]) })); sys = S.mpaSys(wt, alb, eta);
    input = { drug: 'mpaped', wt, extra: { albumin: alb }, doses: times.map(t => ({ t, amt, route: 'oral' })), steadyState: false, intervalHours: 12 };
    truthDay = S.integrate(sys, S.stateAfter([{ t0: -Infinity, sys }], docs, S.TEND), 12, c => c).auc;
  } else {
    wt = clip(Math.exp(Math.log(24.7) + 0.55 * S.gauss(rng)), 9.1, 78); ht = clip(0.30 + 0.04 * S.gauss(rng), 0.22, 0.42);
    eta = S.TAC.OM.map(v => Math.sqrt(v) * S.gauss(rng));
    const sus = wt < 20 && rng() < 0.5, form = sus ? 'suspension' : 'capsule', amt = Math.max(100, Math.round(200 * wt / 100) * 100);
    docs = times.map(t => ({ t, amt, form })); sys = S.tacSys(wt, ht, eta);
    input = { drug: 'tacped', wt, extra: { hct: ht }, doses: docs.map(d => ({ t: d.t, amt, route: 'oral', form })), steadyState: false, intervalHours: 12 };
    truthDay = S.integrate(sys, S.stateAfter([{ t0: -Infinity, sys }], docs, S.TEND), 12, c => S.wholeBlood(c, ht)).auc;
  }
  const segs = [{ t0: -Infinity, sys }], clean = S.simConc(segs, docs, FULL.map(h => S.TEND + h));
  const y = clean.map(c => noisy(rng, DRUG === 'tacped' ? S.wholeBlood(c, ht) : c));
  const refTrap = trap(FULL, y);
  for (const [name, hs] of Object.entries(SCHEDS)) {
    const obs = hs.map(h => { const j = FULL.indexOf(h); const tt = S.TEND + h + (h === 0 ? TSHIFT : 0); return DRUG === 'tacped' ? { t: tt, c: y[j], hct: ht } : { t: tt, c: y[j] }; });
    const t0 = Date.now(); let rec;
    try {
      const fit = await B.runFit(Object.assign({ obs, seed: 9300000 + K * 100000 + p * 31 }, input), null);
      const cv = fit.convergence; let line = fit.auc.median;
      if (DRUG === 'mpaped') {
        const j = fit.extra.occDays.indexOf(S.DAY_D);
        if (j >= 0) line = qs(fit.auc12Chain.map((a, d) => a * Math.exp(fit.draws[d][3 + j])), [0.5])[0];
      }
      rec = { p, sched: name, ok: true, wt, ht, truthDay, refTrap, est: fit.auc.median, line, p5: fit.auc.p5, p95: fit.auc.p95, conv: cv ? cv.ok : null, ms: Date.now() - t0 };
    } catch (e) { rec = { p, sched: name, ok: false, err: String(e && e.message || e) }; }
    appendFileSync(OUT, JSON.stringify(rec) + '\n');
  }
}
console.log('done', DRUG, 'cohort', K, OUT);
