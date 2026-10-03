/* =========================================================================
 * NONMEM cross-check of the tacrolimus model (V15).
 *   A  STRUCTURAL: every subject carries its etas as data; NONMEM's IPRED (whole blood) must equal the app's.
 *      Scenarios: steady state (SS=1) and an explicit history with per-dose prednisolone and per-day κ on F,
 *      constant κ on ka, CYP3A5 expressers, fat-free-mass scaling, haematocrit transform.
 *   B  POSTHOC: simulated patients (trough + 1 h + 3 h, explicit 30-day history, κ on two sampled days) →
 *      NONMEM's empirical Bayes estimates (MAXEVAL=0, POSTHOC, INTERACTION) vs the app's MAP (BFGS).
 *   node tools/nonmem_verify/tac/make_tac.mjs <workdir>
 * ========================================================================= */
import { writeFileSync, mkdirSync } from 'fs';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
['version', 'model', 'tacrolimus', 'bayes'].forEach(f => require(resolve(here, '../../../src/' + f + '.js')));
const { model: M, bayes: B } = globalThis.ECU, T = M.spec('tac').custom, K = T.constants;
const work = process.argv[2] || 'work'; mkdirSync(work, { recursive: true });

function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function gauss(r) { let s, u, v; do { u = r() * 2 - 1; v = r() * 2 - 1; s = u * u + v * v; } while (s === 0 || s >= 1); return u * Math.sqrt(-2 * Math.log(s) / s); }
const om3 = M.omegaFull('tac', null, { nOcc: 0 }).cov;                 // the app's 3×3 block
const chol3 = (() => { const L = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]; for (let i = 0; i < 3; i++) for (let j = 0; j <= i; j++) { let s = om3[i][j]; for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k]; L[i][j] = i === j ? Math.sqrt(s) : s / L[j][j]; } return L; })();
function drawBSV(r) { const z = [gauss(r), gauss(r), gauss(r)]; return [0, 1, 2].map(i => chol3[i][0] * z[0] + (i > 0 ? chol3[i][1] * z[1] : 0) + (i > 1 ? chol3[i][2] * z[2] : 0)); }
const ex = (sex, ht, pred, hct, cyp) => T.normExtra({ sex, ht, pred, hct, assay: 'lcms', cyp3a5: cyp }, 70);
function ffmOf(sex, wt, ht) { return T.ffmOf(wt, ht, sex === 'm'); }

// ---------------- A. structural ----------------
const rows = ['ID,TIME,AMT,EVID,MDV,SS,II,FFM,EXPR,PDN,HCT,E1,E2,E3,E4,E5,DV'];
const app = [];
const r = rng(5);
const TIMES_SS = [0.1, 0.25, 0.41, 0.5, 0.75, 1, 1.5, 2, 3, 4, 6, 8, 10, 11.9];
let id = 0;
// A1: steady state
for (let i = 0; i < 24; i++) {
  id++;
  const male = i % 2 === 0, wt = 50 + 40 * r(), ht = male ? 168 + 15 * r() : 155 + 15 * r();
  const ffm = ffmOf(male ? 'm' : 'f', wt, ht), expr = i % 3 === 0 ? 1 : 0, pred = [0, 5, 10, 20, 40][i % 5], hct = 0.25 + 0.2 * r();
  const eta = i === 0 ? [0, 0, 0] : (i < 7 ? [0, 0, 0].map((_, k) => (k === (i - 1) % 3 ? (i < 4 ? 1.5 : -1.5) * Math.sqrt(om3[k][k]) : 0)) : drawBSV(r));
  const kF = 0, kKa = 0;   // κ on part of an endless train is tested by V11 (delta = explicit history); NONMEM would apply a constant κ to the whole train
  rows.push([id, 0, 3000, 1, 1, 1, 12, ffm, expr, pred, hct, eta[0], eta[1], eta[2], kF, kKa, 0].join(','));
  TIMES_SS.forEach(t => rows.push([id, t, 0, 0, 0, 0, 0, ffm, expr, pred, hct, eta[0], eta[1], eta[2], kF, kKa, 1].join(',')));
  const exn = Object.assign({}, ex(male ? 'm' : 'f', ht, pred, hct, expr ? 'expresser' : 'nonexpresser'), { wt: wt, ffm: ffm, nOcc: 1, occDays: [0] });
  const p = M.indivParams(wt, null, null, exn, eta.concat([kF, kKa]), 'tac');
  // steady state, last dose at 1000: out times after the dose (dose at TIME 0 in NONMEM with SS=1 ⇒ same periodic profile)
  const delta = [{ t: 1000 - 12 * 0, amt: 3000, pred, occIdx: 0, delta: true }];
  const sim = M.simulate(delta, TIMES_SS.map(t => 1000 + t), p, { ss: { amt: 3000, every: 12, tEnd: 1000, pred } });
  app.push({ id, scen: 'ss', times: TIMES_SS, ipred: sim.c.map(c => T.toObs(c, hct)) });
}
// A2: explicit history, 12 doses over 6 days, per-dose prednisolone, per-day κF, constant κka
const TIMES_H = [3, 6, 9, 20, 30, 40, 50, 60, 70, 71, 72, 73, 75, 80];
for (let i = 0; i < 16; i++) {
  id++;
  const male = i % 2 === 1, wt = 50 + 40 * r(), ht = male ? 168 + 15 * r() : 155 + 15 * r();
  const ffm = ffmOf(male ? 'm' : 'f', wt, ht), expr = i % 4 === 1 ? 1 : 0, hct = 0.25 + 0.2 * r();
  const eta = drawBSV(r), kKa = (r() - 0.5) * 1.6;
  const nDays = 4, kF = []; for (let d = 0; d < nDays; d++) kF.push((r() - 0.5) * 0.8);
  const doses = [];
  for (let k = 0; k < 8; k++) { const day = Math.floor(k / 2); doses.push({ t: 12 * k, amt: 2500 + 500 * (k % 3), pred: [20, 20, 15, 15, 10, 10, 7.5, 7.5][k], occIdx: day }); }
  const recs = [];   // one subject's records in time order (a dose before an observation at the same time)
  doses.forEach(d => recs.push({ t: d.t, o: 0, line: [id, d.t, d.amt, 1, 1, 0, 0, ffm, expr, d.pred, hct, eta[0], eta[1], eta[2], kF[d.occIdx], kKa, 0].join(',') }));
  TIMES_H.forEach(t => {
    let last = doses[0]; doses.forEach(d => { if (d.t <= t) last = d; });   // covariates carried forward from the latest dose
    recs.push({ t: t, o: 1, line: [id, t, 0, 0, 0, 0, 0, ffm, expr, last.pred, hct, eta[0], eta[1], eta[2], kF[last.occIdx], kKa, 1].join(',') });
  });
  recs.sort((a, b) => a.t - b.t || a.o - b.o).forEach(x => rows.push(x.line));
  const etaAll = eta.slice(); for (let d = 0; d < nDays; d++) etaAll.push(kF[d], kKa);
  const exn = Object.assign({}, ex(male ? 'm' : 'f', ht, 10, hct, expr ? 'expresser' : 'nonexpresser'), { wt: wt, ffm: ffm, nOcc: nDays, occDays: [0, 1, 2, 3] });
  const p = M.indivParams(wt, null, null, exn, etaAll, 'tac');
  const sim = M.simulate(doses, TIMES_H, p, {});
  app.push({ id, scen: 'hist', times: TIMES_H, ipred: sim.c.map(c => T.toObs(c, hct)) });
}
writeFileSync(`${work}/struct_tac.csv`, rows.join('\n') + '\n');
writeFileSync(`${work}/struct_tac_app.json`, JSON.stringify(app));

// ---------------- B. POSTHOC ----------------
const N_POST = 30, prow = ['ID,TIME,AMT,EVID,MDV,SS,II,FFM,EXPR,PDN,HCT,OCC,DV'], papp = [];
const r2 = rng(99);
for (let i = 0; i < N_POST; i++) {
  const id2 = i + 1, male = i % 2 === 0, wt = 52 + 40 * r2(), ht = male ? 168 + 15 * r2() : 155 + 15 * r2();
  const expr = i % 5 === 0 ? 1 : 0, pred = [5, 10, 15, 20][i % 4], hct = 0.27 + 0.15 * r2();
  const tEnd = 24 * 40 + 8, t0 = tEnd - 12 * 59;
  const rawEx = { sex: male ? 'm' : 'f', ht: ht, pred: String(pred), hct: String(hct), assay: 'lcms', cyp3a5: expr ? 'expresser' : 'unknown' };
  const doses = []; for (let k = 59; k >= 0; k--) doses.push({ t: tEnd - 12 * k, amt: 3000, route: 'oral' });
  // truth: draw etas (BSV + κF day D−1, κF day D, κka day D), simulate noisy samples
  const eta = drawBSV(r2).concat([0.23 * gauss(r2), 0.6 * gauss(r2), 0.23 * gauss(r2), 0.6 * gauss(r2)]);   // κF, κka for day D−1 and for day D
  const obsT = [tEnd, tEnd + 1, tEnd + 3];
  const probe = T.prepare({ extra: rawEx, wt: wt, doses: doses, obs: obsT.map(t => ({ t, c: 5, hct })), steadyState: false });
  const pr = M.indivParams(wt, null, null, probe.extra, eta, 'tac');
  const sim = M.simulate(probe.doses, obsT, pr, {});
  const obs = obsT.map((t, j) => ({ t, c: Math.max(0.3, T.toObs(sim.c[j], hct) * (1 + 0.149 * gauss(r2))), hct }));
  // the app's MAP on exactly these data
  const prep = T.prepare({ extra: rawEx, wt: wt, doses: doses, obs: obs, steadyState: false });
  const omg = M.omegaFull('tac', null, prep.extra);
  const ofv = B.makeOfv({ wt: wt, drug: 'tac', doses: prep.doses, ss: null, obs: prep.obs, omega: { vars: omg.vars, cov: omg.cov, dims: omg.vars.length }, extra: prep.extra, form: null });
  const map = B.mapBFGS(ofv, omg.vars);
  papp.push({ id: id2, eta: map.x, f: map.f, wt: wt, rawEx: rawEx, doses: doses, obs: obs });
  const ffm = prep.extra.ffm, occOf = d => { const day = Math.floor(d.t / 24); return day === Math.floor((tEnd - 12) / 24) ? 1 : (day === Math.floor(tEnd / 24) ? 2 : 0); };
  // records in time order; at equal times the pre-dose observation comes BEFORE the dose (as in practice), so that the
  // record after each lagged dose belongs to the same occasion as the dose (NONMEM takes F1 of a lagged dose from the next record)
  const prec = [];
  prep.doses.forEach(d => prec.push({ t: d.t, o: 1, line: [id2, d.t - t0, d.amt, 1, 1, 0, 0, ffm, expr, pred, hct, occOf(d), 0].join(',') }));
  prep.obs.forEach((o, j) => {
    let last = null; prep.doses.forEach(d => { if (d.t < o.t) last = d; });
    prec.push({ t: o.t, o: 0, line: [id2, o.t - t0, 0, 0, 0, 0, 0, ffm, expr, pred, hct, occOf(last), obs[j].c].join(',') });
  });
  prec.sort((a, b) => a.t - b.t || a.o - b.o).forEach(x => prow.push(x.line));
}
writeFileSync(`${work}/posthoc_tac.csv`, prow.join('\n') + '\n');
writeFileSync(`${work}/posthoc_tac_app.json`, JSON.stringify(papp));
const f = x => x.toPrecision(12);
const mod = `$PROBLEM Tacrolimus (Storset 2014) POSTHOC: EBEs at the published parameter values
$INPUT ID TIME AMT EVID MDV SS II FFM EXPR PDN HCT OCC DV
$DATA posthoc_tac.csv IGNORE=@
$SUBROUTINES ADVAN4 TRANS4
$PK
 W = FFM/60
 KF = 0
 KKA = 0
 IF (OCC.EQ.1) KF = ETA(4)
 IF (OCC.EQ.1) KKA = ETA(5)
 IF (OCC.EQ.2) KF = ETA(6)
 IF (OCC.EQ.2) KKA = ETA(7)
 CL = ${K.CL}*(W**0.75)*(1+${K.CYP_CL - 1}*EXPR)*EXP(ETA(1))
 V2 = ${K.V1}*W*EXP(ETA(2))
 Q  = ${K.Q}*(W**0.75)*EXP(ETA(3))
 V3 = ${K.V2}*W
 KA = ${K.KA}*EXP(KKA)
 ALAG1 = ${K.TLAG}
 F1 = (1-${K.PRED_EMAX}*PDN/(${K.PRED_50}+PDN))*(1-${1 - K.CYP_F}*EXPR)*EXP(KF)
 S2 = V2
$ERROR
 CP = F
 IPRED = CP*(1+HCT*${K.BMAX}/(CP+${K.KD}))
 Y = IPRED*(1+EPS(1))
$THETA (0 FIX)
$OMEGA BLOCK(3) FIX
 ${f(om3[0][0])}
 ${f(om3[1][0])} ${f(om3[1][1])}
 ${f(om3[2][0])} ${f(om3[2][1])} ${f(om3[2][2])}
$OMEGA ${f(K.CV_KF ** 2)} FIX
$OMEGA ${f(K.CV_KKA ** 2)} FIX
$OMEGA ${f(K.CV_KF ** 2)} FIX
$OMEGA ${f(K.CV_KKA ** 2)} FIX
$SIGMA ${f(K.PROP)} FIX
$ESTIMATION METHOD=COND INTER MAXEVAL=0 POSTHOC NOABORT
$TABLE ID ETA1 ETA2 ETA3 ETA4 ETA5 ETA6 ETA7 FIRSTONLY NOAPPEND NOPRINT ONEHEADER FORMAT=s1PE15.8 FILE=post_tac.tab
`;
writeFileSync(`${work}/posthoc_tac.mod`, mod);
console.log('wrote', work, 'structural subjects:', app.length, 'posthoc patients:', papp.length);
