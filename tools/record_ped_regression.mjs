/* Records fixed-seed pediatric fits to tests/mpaped_regression.json and tests/tacped_regression.json (the bit-identity baselines for later changes).
 *   node tools/record_ped_regression.mjs mpaped > tests/mpaped_regression.json
 *   node tools/record_ped_regression.mjs tacped > tests/tacped_regression.json
 * Re-record only for an intended change to the numbers, and say why in the release notes. */
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { pedCases } from './ped_regression_cases.mjs';
const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
['version', 'model', 'tacped', 'mpaped', 'bayes', 'parallel'].forEach(f => require(resolve(here, '../src/' + f + '.js')));
const { model: M, bayes: B } = globalThis.ECU, drug = process.argv[2];
if (drug !== 'mpaped' && drug !== 'tacped') { console.error('usage: record_ped_regression.mjs mpaped|tacped'); process.exit(2); }
const C = pedCases(M), cases = C[drug], blood = drug === 'tacped', out = {};
for (const k of Object.keys(cases)) {
  const f = await B.runFit(cases[k], null);
  out[k] = { auc: [f.auc.p5, f.auc.median, f.auc.p95, f.auc.pInWindow], tr: [f.trough.p5, f.trough.median, f.trough.p95, f.trough.pInWindow],
    aucC: blood ? [f.aucCorr.p5, f.aucCorr.median, f.aucCorr.p95, f.aucCorr.pInWindow] : null, trC: blood ? [f.troughCorr.p5, f.troughCorr.median, f.troughCorr.p95, f.troughCorr.pInWindow] : null,
    acc: f.acceptance, nDraws: f.nDraws, nOcc: f.nOccasions, mapEta: f.map ? f.map.eta : null, mapOfv: f.map ? f.map.ofv : null, conv: f.convergence ? [f.convergence.rhat, f.convergence.essMin] : null };
  if (k === 'ss_trough_peak') {
    const last = cases[k].doses[cases[k].doses.length - 1];
    const amts = drug === 'mpaped' ? [450, 600, 750] : [2000, 3000, 4000];
    const sc = await B.doseScan({ draws: f.draws, drug, wt: f.wt, extra: f.extra, tEnd: last.t, amounts: amts, intervalHours: 12, winLo: cases[k].winLo, winHi: cases[k].winHi, troughLo: cases[k].troughLo, troughHi: cases[k].troughHi, form: last.form });
    out.scan = sc.map(r => [r.amt, r.auc.median, r.auc.p5, r.trough.median, r.trough.pInWindow, blood ? r.aucCorr.median : null]);
  }
}
console.log(JSON.stringify(out));
