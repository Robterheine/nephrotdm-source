/* Statistician's self-check: the independent simulator (calibrate_ped_sim.mjs) against the app's engines (src/mpaped.js, src/tacped.js), so that the
 * truth used in the calibration is known to be the model the app implements. Also: AUC identities, SS vs long history.  node tools/calibrate_ped_selfcheck.mjs */
import { createRequire } from 'module';
import * as S from './calibrate_ped_sim.mjs';
const require = createRequire(import.meta.url);
['version', 'model', 'tacped', 'mpaped', 'bayes'].forEach(f => require('../src/' + f + '.js'));
const { model: M } = globalThis.ECU;
const rng = S.mulberry32(424242);
let worst = { mpa: 0, tac: 0, mpaSS: 0, tacSS: 0, idMpa: 0, idTac: 0 };
const rel = (a, b) => Math.abs(a - b) / Math.max(Math.abs(b), 1e-12);
// ---- MPA ----
const TM = M.spec('mpaped').custom;
for (let it = 0; it < 40; it++) {
  const wt = 12 + 68 * rng(), alb = 24 + 18 * rng(), eta = S.MPA.OM.map(v => Math.sqrt(v) * S.gauss(rng) * 0.8);
  const nD = 6, days = []; for (let d = S.dayOf(S.doseTimes(nD)[0]); d <= S.DAY_D; d++) days.push(d);
  const kap = days.map(() => Math.sqrt(0.19) * S.gauss(rng));
  const times = S.doseTimes(nD), amt = 300 + 600 * rng();
  const docs = times.map(t => ({ t, amt, fac: Math.exp(kap[days.indexOf(S.dayOf(t))]) }));
  const obsT = [S.TEND - 11.5, S.TEND - 3, S.TEND, S.TEND + 0.5, S.TEND + 1, S.TEND + 2, S.TEND + 6, S.TEND + 11.9];
  const o = S.simConc([{ t0: -Infinity, sys: S.mpaSys(wt, alb, eta) }], docs, obsT);
  const ex = Object.assign({}, TM.normExtra({ albumin: alb }, wt), { nOcc: days.length, occDays: days });
  const p = TM.indivParams(wt, null, null, ex, eta.concat(kap));
  const a = TM.simulate(times.map(t => ({ t, amt, occIdx: days.indexOf(S.dayOf(t)) })), obsT, p);
  o.forEach((v, i) => worst.mpa = Math.max(worst.mpa, rel(a.c[i], v)));
  // steady state, typical day
  const sys = S.mpaSys(wt, alb, eta), ss = S.ssExposure(sys, amt, null, 12, { id: c => c });
  const p0 = TM.indivParams(wt, null, null, TM.normExtra({ albumin: alb }, wt), eta);
  const e = TM.exposure([eta], { wt, extra: TM.normExtra({ albumin: alb }, wt), ss: { amt, every: 12, tEnd: S.TEND }, grid: Array.from({ length: 49 }, (_, k) => S.TEND + k * 0.25) });
  worst.mpaSS = Math.max(worst.mpaSS, rel(e.trA[0], ss.id.trough));
  worst.idMpa = Math.max(worst.idMpa, rel(ss.id.auc, amt / p0.CL), rel(e.aucA[0], ss.id.auc));
}
// ---- tacrolimus (formulation per dose, switch, constant Ht) ----
const TT = M.spec('tacped').custom;
for (let it = 0; it < 40; it++) {
  const wt = 9 + 60 * rng(), ht = 0.2 + 0.28 * rng(), eta = S.TAC.OM.map(v => Math.sqrt(v) * S.gauss(rng) * 0.8);
  const times = S.doseTimes(8), amt = 1000 + 5000 * rng();
  const forms = times.map((t, i) => i < 7 ? 'capsule' : (i < 12 ? 'suspension' : (rng() < 0.5 ? 'capsule' : 'suspension')));
  const docs = times.map((t, i) => ({ t, amt, form: forms[i] }));
  const obsT = [S.TEND - 30, S.TEND - 5, S.TEND, S.TEND + 0.4, S.TEND + 1, S.TEND + 3, S.TEND + 9];
  const sys = S.tacSys(wt, ht, eta), o = S.simConc([{ t0: -Infinity, sys }], docs, obsT);
  const p = TT.indivParams(wt, null, null, TT.normExtra({ hct: ht }, wt), eta);
  const a = TT.simulate(times.map((t, i) => ({ t, amt, form: forms[i] })), obsT, p);
  o.forEach((v, i) => worst.tac = Math.max(worst.tac, rel(a.c[i], v)));
  const form = rng() < 0.5 ? 'capsule' : 'suspension', wb = c => S.wholeBlood(c, ht), wbr = c => S.wholeBlood(c, 0.35);
  const ss = S.ssExposure(sys, amt, form, 12, { act: wb, ref: wbr, pl: c => c });
  const e = TT.exposure([eta], { wt, extra: TT.normExtra({ hct: ht }, wt), ss: { amt, every: 12, tEnd: S.TEND, form }, grid: Array.from({ length: 49 }, (_, k) => S.TEND + k * 0.25), hctAct: ht, hctRef: 0.35 });
  worst.tacSS = Math.max(worst.tacSS, rel(e.aucA[0], ss.act.auc), rel(e.trA[0], ss.act.trough), rel(e.aucR[0], ss.ref.auc), rel(e.trR[0], ss.ref.trough));
  const idp = amt * (form === 'suspension' ? 0.46 : 1) / sys.clint;
  worst.idTac = Math.max(worst.idTac, rel(ss.pl.auc, idp));
}
console.log('max relative differences, simulator vs app engine:');
console.log('  MPA  explicit history with kappa per day, predictions   ', worst.mpa.toExponential(2));
console.log('  MPA  steady-state trough                                  ', worst.mpaSS.toExponential(2));
console.log('  MPA  AUC identity dose/CL (simulator and app)           ', worst.idMpa.toExponential(2));
console.log('  TAC  history with per-dose formulation, predictions       ', worst.tac.toExponential(2));
console.log('  TAC  steady-state AUC/trough actual+corrected (app vs sim)', worst.tacSS.toExponential(2), '(app uses a 0.0125-0.25 h Simpson grid)');
console.log('  TAC  plasma AUC identity F*dose/CLINT (simulator)         ', worst.idTac.toExponential(2));
