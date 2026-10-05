// Reproduces the hand-calculated reference numbers of docs/HANDOFF_PEDIATRIC.md section 4.4 with the independent oracle.
// Run: node tools/nonmem_verify/ped/ref_ped.mjs   (exit 1 if a number differs from the hand-off table beyond its printed precision)
import { mpaParams, tacParams, steadyCurve, summarise, rk4Trough } from './ped_oracle.mjs';

// [WT, ALB, dose, CL, AUC, trough, cmax, tmax] from section 4.4
const MPA_ROWS = [[38.5, 34, 600, 10.22, 58.72, 3.28, 12.59, 1.05], [38.5, 34, 750, 10.22, 73.40, 4.11, 15.74, 1.05],
  [20, 34, 250, 6.25, 39.98, 2.22, 9.68, 0.89], [70, 34, 1000, 16.00, 62.50, 3.52, 12.04, 1.21], [38.5, 28, 600, 16.57, 36.21, 1.68, 9.83, 0.99]];
// [WT, HT, form, dose ug, plasma AUC, WB AUC act, corr, WB trough act, corr]
const TAC_ROWS = [[25, 0.30, 'capsule', 3000, 6.579, 194.1, 225.4, 10.37, 12.04], [25, 0.30, 'suspension', 3000, 3.026, 95.8, 111.3, 4.69, 5.45],
  [25, 0.40, 'capsule', 3000, 6.579, 257.3, 226.0, 14.60, 12.82], [60, 0.35, 'capsule', 6000, 6.824, 233.6, 233.6, 13.73, 13.73]];

let bad = 0;
// Peak values (Cmax, tmax) of the hand table are rounded from a coarse grid: the refined oracle differs by up to 0.006 (Cmax) and
// 0.007 h (tmax); those two are accepted to 0.01. Everything else is checked to the printed precision.
const chk = (what, got, want, dec, tol) => {
  const ok = Math.abs(got - want) <= (tol !== undefined ? tol : 0.5 * Math.pow(10, -dec) * 1.0001) + 1e-12;
  if (!ok) bad++;
  console.log(`  ${ok ? 'ok  ' : 'DIFF'} ${what}: oracle ${got.toFixed(dec + 2)}  hand ${want.toFixed(dec)}`);
};

console.log('MPA pediatric (mg MMF q12h, typical, eta = 0)');
for (const [wt, alb, dose, cl, auc, tr, cmax, tmax] of MPA_ROWS) {
  const p = mpaParams(wt, alb), s = summarise(steadyCurve(p, dose));
  console.log(` WT ${wt} ALB ${alb} dose ${dose}`);
  chk('CL', p.CL, cl, 2); chk('AUC', s.auc, auc, 2); chk('AUC = dose/CL', dose / p.CL, auc, 2); chk('trough', s.trough, tr, 2); chk('Cmax', s.cmax, cmax, 2, 0.01); chk('tmax', s.tmax, tmax, 2, 0.01);
}
console.log('Tacrolimus pediatric (ug q12h, typical, eta = 0)');
for (const [wt, ht, form, dose, pa, wa, wc, ta, tc] of TAC_ROWS) {
  const p = tacParams(wt, ht, form), s = summarise(steadyCurve(p, dose), ht);
  console.log(` WT ${wt} Ht ${ht} ${form} dose ${dose}`);
  chk('plasma AUC', s.auc, pa, 3); chk('plasma AUC = F*dose/CLINT', dose * p.plasmaAuc, pa, 3);
  chk('WB AUC actual', s.aucAct, wa, 1); chk('WB AUC corrected', s.aucCor, wc, 1); chk('WB trough actual', s.trAct, ta, 2); chk('WB trough corrected', s.trCor, tc, 2);
}
// second oracle: RK4 over many doses against the matrix-exponential steady state
const pm = mpaParams(38.5, 34), pt = tacParams(25, 0.30, 'capsule');
const rm = rk4Trough(pm, 600, 12, 250, 0.005), sm = summarise(steadyCurve(pm, 600)).trough;
const rt = rk4Trough(pt, 3000, 12, 250, 0.005), st = summarise(steadyCurve(pt, 3000)).trough;
const rel = (a, b) => Math.abs(a - b) / b;
console.log(`RK4 vs matrix exponential, trough after 250 doses (125 days): MPA ${rel(rm, sm).toExponential(2)}, tacrolimus ${rel(rt, st).toExponential(2)}`);
if (rel(rm, sm) > 1e-6 || rel(rt, st) > 1e-6) bad++;
console.log(bad ? `${bad} difference(s)` : 'all hand-off reference numbers reproduced');
process.exit(bad ? 1 : 0);
