/* =========================================================================
 * NephroTDM: everolimus test suite (Zwart 2021, Model 3)
 * Run: node tests/test_everolimus.js   (part of `npm test`)
 *
 * Oracles live in tools/evr_prototype/evr_proto.js (8-state matrix exponential and RK4) and share no code with the
 * closed form in src/everolimus.js. Reference numbers are docs/HANDOFF_EVEROLIMUS_M3.md §3.5. Every assertion can
 * fail (README rule 7b); the sabotage record is kept with the release notes.
 * ========================================================================= */
'use strict';
var fs = require('fs'), path = require('path');
var h = require('./harness.js');
var t = h.t, eq = h.eq, near = h.near, assert = h.assert, throws = h.throws, truthy = h.truthy, falsy = h.falsy;
var O = require('../tools/evr_prototype/evr_proto.js');

['version', 'model', 'tacrolimus', 'everolimus', 'bayes', 'parallel'].forEach(function (f) { require('../src/' + f + '.js'); });
var ECU = globalThis.ECU, M = ECU.model, B = ECU.bayes;
var S = M.spec('evr'), T = S.custom, K = T.constants;

function ex(hct, pred) { return { _norm: true, hct: hct, predHigh: pred || 'low', predFlag: pred === 'high', assay: 'lcms', nOcc: 0, occDays: [] }; }
function P(eta, hct, pred) { return M.indivParams(70, null, null, ex(hct == null ? 0.38 : hct, pred), eta || [0, 0, 0], 'evr'); }
function grid(t0, tau, perHour) { var g = [], n = tau * perHour; for (var i = 0; i <= n; i++) g.push(t0 + i * tau / n); return g; }
function rel(a, b) { return Math.abs(a - b) / Math.abs(b); }
var G12 = grid(0, 12, 4);   // the engine's grid: 49 points

t('spec: everolimus is registered, ready, in µg/L, log-scale error, no hidden window, citation', function () {
  eq(S.id, 'evr'); eq(S.pending, false);
  eq(S.units.conc, 'µg/L'); eq(S.units.auc, 'µg·h/L'); eq(S.units.dose, 'mg');
  truthy(S.SIGMA.LOG > 0 && !(S.SIGMA.PROP > 0), 'residual error is on the log scale');
  near(S.SIGMA.LOG, Math.sqrt(0.0957), 1e-9);
  truthy(/Zwart/.test(S.article) && /Clin Pharmacokinet 2021;60/.test(S.article));
  truthy(M.listDrugs().some(function (d) { return d.id === 'evr'; }));
  eq(S.windowOptional, true); eq(S.windowDefaultLo, null); eq(S.troughDefaultLo, null);
  eq(S.requiresWt, false); eq(S.covariateWeight, false);
  eq(K.HCT_REF, 0.38);
  eq(T.etaNames({}).join(','), 'CLINT,V3,FU');
  var om = T.omega({});
  near(om.vars[0], 0.118, 1e-12); near(om.vars[1], 0.401, 1e-12); near(om.vars[2], 0.0009, 1e-12);
});

t('spec: window sets are the consensus trough sets only, no AUC window, default is the reduced-CNI set', function () {
  eq(S.windowStandard, 'evr-cni');
  var ids = S.windowSets.map(function (w) { return w.id; }).join(',');
  eq(ids, 'evr-cni,evr-nocni');
  var a = S.windowSets[0], b = S.windowSets[1];
  eq(a.trough.join('-'), '3-8'); eq(b.trough.join('-'), '6-10');
  S.windowSets.forEach(function (w) { eq(w.auc, null); truthy(w.label && w.basis && w.grade); });
});

t('M1: parameters of the typical individual (Table of §3.1) and the hepatic extraction at Ht 0.38', function () {
  var p = P();
  near(p.k, 5 / 0.549, 1e-12, 'KA = 5/MAT, five equal stages');
  near(p.V3, 266, 1e-9);
  near(p.QHP, 90 * (1 - 0.38), 1e-9, 'plasma flow = QH (1 - Ht)');
  var o = O.params(0.38);
  near(p.EH, o.EH, 1e-12); near(p.K20, o.K20, 1e-12); near(p.K23, o.K23, 1e-12); near(p.K32, o.K32, 1e-12); near(p.K34, o.K34, 1e-12); near(p.K43, o.K43, 1e-12);
  near(P([0, 0, 0], 0.38, 'high').CLINT / P().CLINT, 1.44, 1e-12, 'prednisolone 20 mg/day or more multiplies CLINT by 1.44');
  near(P([0.3, 0, 0]).CLINT / P().CLINT, Math.exp(0.3), 1e-12, 'eta 1 acts on CLINT');
  near(P([0, 0.3, 0]).V3 / P().V3, Math.exp(0.3), 1e-12, 'eta 2 acts on V3');
  near(P([0, 0, 0.1]).FU / P().FU, Math.exp(0.1), 1e-12, 'eta 3 acts on FU');
});

t('M2: closed form equals the matrix exponential for one dose (Ht, etas, prednisolone), including t = 0.005 h and t = 200 h', function () {
  var worst = 0;
  [0.25, 0.38, 0.5].forEach(function (hct) {
    [[0, 0, 0], [0.4, -0.6, 0.03], [-0.5, 0.9, -0.03], [1.2, 1.0, 0.09]].forEach(function (eta) {
      [false, true].forEach(function (hp) {
        var p = P(eta, hct, hp ? 'high' : 'low'), o = O.params(hct, eta, hp), E = null;
        var times = [0.005, 0.05, 0.2, 0.5, 1, 2, 4, 8, 12, 24, 48, 200];
        var c = M.simulate([{ t: 0, amt: 1000 }], times, p, { id: 'evr' });
        eq(c.failed, false);
        times.forEach(function (tt, i) {
          E = O.expm(O.matrix(o), tt);
          var ref = E[6][0] / o.V3 * 1000;   // µg/L for 1 mg
          if (ref > 1e-7) { var e = rel(c.c[i], ref); if (e > worst) worst = e; }
        });
      });
    });
  });
  truthy(worst < 1e-8, 'worst relative error ' + worst);
});

t('M3: the three-real-roots guard — impossible disposition parameters make the closed form refuse, not return a number', function () {
  eq(T.poles({ K20: -60, K23: 50, K32: 50, K34: 0.1, K43: 0.1, V3: 266 }), null);
  var ok = T.poles(P());
  eq(ok.length, 3);
  ok.forEach(function (q) { truthy(q.lam > 0); });
  truthy(ok[0].lam !== ok[1].lam && ok[1].lam !== ok[2].lam);
});

t('M4: plasma AUC over a steady-state interval = Dose / (CLINT·FU), whatever V3 or Ht', function () {
  [[[0, 0, 0], 0.38, 'low'], [[0.3, 1.0, -0.05], 0.27, 'high'], [[-0.4, -1.0, 0.08], 0.5, 'low']].forEach(function (c) {
    var p = P(c[0], c[1], c[2]), g = grid(0, 12, 200);
    var s = M.simulate([], g, p, { id: 'evr', ss: { amt: 1500, every: 12, tEnd: 0 } });
    var a = 0; for (var i = 1; i < g.length; i++) a += (s.c[i - 1] + s.c[i]) * 0.5 * (g[i] - g[i - 1]);
    near(a, 1500 / (p.CLINT * p.FU), 1500 / (p.CLINT * p.FU) * 1e-5, 'AUC ' + JSON.stringify(c));
  });
});

t('M5: steady state equals a long explicit history (RK4 oracle) and the matrix steady state', function () {
  var o = O.params(0.33, [0.2, -0.3, 0.02], true), p = P([0.2, -0.3, 0.02], 0.33, 'high');
  var ref = O.rk4(o, 1.5, 12, 40);   // plasma trough after 40 doses, µg/L
  var s = M.simulate([], [0], p, { id: 'evr', ss: { amt: 1500, every: 12, tEnd: 0 } }).c[0];
  near(s / ref, 1, 2e-6, 'RK4 trough');
  var m = O.steady(o, 1.5, 12, 0.33, 0.38, 0.05);
  near(s / m.troughPlasma, 1, 1e-8, 'matrix steady-state trough');
  // explicit history in the engine agrees with the periodic solution
  var doses = []; for (var k = 0; k < 40; k++) doses.push({ t: -12 * k, amt: 1500 });
  near(M.simulate(doses, [0], p, { id: 'evr' }).c[0] / s, 1, 1e-7, 'finite history of 40 doses vs steady state, both at the trough');
});

t('M6: exposure (actual and corrected) reproduces the §3.5 reference table', function () {
  var rows = [ // Ht, pred, trough actual, trough at 0.38, AUC actual, AUC at 0.38
    [0.25, 'low', 3.1253, 4.2702, 58.050, 79.264], [0.33, 'low', 3.9313, 4.3833, 71.118, 79.279], [0.38, 'low', 4.4620, 4.4620, 79.289, 79.289],
    [0.45, 'low', 5.2465, 4.5847, 90.733, 79.303], [0.50, 'low', 5.8412, 4.6826, 98.911, 79.313], [0.38, 'high', 2.9540, 2.9540, 55.292, 55.292]];
  rows.forEach(function (r) {
    var e = T.exposure([[0, 0, 0]], { wt: 70, extra: ex(r[0], r[1]), ss: { amt: 1500, every: 12, tEnd: 0 }, grid: G12, hctAct: r[0], hctRef: 0.38 });
    near(e.trA[0], r[2], 6e-4, 'trough actual ' + r); near(e.trR[0], r[3], 6e-4, 'trough corrected ' + r);
    near(e.aucA[0], r[4], 6e-3, 'AUC actual ' + r); near(e.aucR[0], r[5], 6e-3, 'AUC corrected ' + r);
  });
  // the 0.25 h grid costs 1.6e-5 against the matrix-exponential oracle
  var o = O.params(0.3, [0.2, 0.1, 0], false), m = O.steady(o, 1.5, 12, 0.3, 0.38, 0.05);
  var e2 = T.exposure([[0.2, 0.1, 0]], { wt: 70, extra: ex(0.3), ss: { amt: 1500, every: 12, tEnd: 0 }, grid: G12, hctAct: 0.3, hctRef: 0.38 });
  near(e2.aucA[0] / m.aucActual, 1, 1e-4); near(e2.aucR[0] / m.aucRef, 1, 1e-4); near(e2.trA[0] / m.troughActual, 1, 1e-8);
});

t('M7: Equation 3 — the corrected value is the same plasma curve read at Ht 0.38; the corrected AUC is nearly Ht-invariant', function () {
  var p = P(), c = M.simulate([], [0], p, { id: 'evr', ss: { amt: 1500, every: 12, tEnd: 0 } }).c[0] / 1000;   // mg/L
  [0.25, 0.38, 0.5].forEach(function (hct) {
    near(T.toObs(c * 1000, hct) / 1000, O.toBlood(c, hct), 1e-12, 'blood transform at ' + hct);
  });
  near(T.toObs(1, 0.38), 0.38 * (964.25 * 1 / (91.95 + 1) + 0.15336 * 1) + 0.62 * 1, 1e-12, 'Cwb = Ht (Bmax Cp/(Kd + Cp) + Kns Cp) + (1 - Ht) Cp, in µg/L');
  var aucs = [0.30, 0.38, 0.45].map(function (hct) {
    return T.exposure([[0, 0, 0]], { wt: 70, extra: ex(hct), ss: { amt: 1500, every: 12, tEnd: 0 }, grid: G12, hctAct: hct, hctRef: 0.38 }).aucR[0];
  });
  truthy(Math.max.apply(null, aucs) / Math.min.apply(null, aucs) < 1.001, 'corrected AUC across Ht: ' + aucs);
  var e25 = T.exposure([[0, 0, 0]], { wt: 70, extra: ex(0.25), ss: { amt: 1500, every: 12, tEnd: 0 }, grid: G12, hctAct: 0.25, hctRef: 0.38 });
  near(e25.trR[0] / e25.trA[0], 1.3663, 5e-4, 'corrected/actual trough at Ht 0.25');
});

t('M8: prednisolone — "high" multiplies CLINT by 1.44 and the exposure falls by that factor; the choice is required', function () {
  var lo = T.exposure([[0, 0, 0]], { wt: 70, extra: ex(0.38, 'low'), ss: { amt: 1500, every: 12, tEnd: 0 }, grid: G12, hctAct: 0.38, hctRef: 0.38 });
  var hi = T.exposure([[0, 0, 0]], { wt: 70, extra: ex(0.38, 'high'), ss: { amt: 1500, every: 12, tEnd: 0 }, grid: G12, hctAct: 0.38, hctRef: 0.38 });
  near(lo.aucR[0] / hi.aucR[0], 1.44, 0.03, 'AUC ratio (plasma ratio is exactly 1.44, blood binding is weakly non-linear)');
  var eRaw = { hct: '0.38' };
  throws(function () { T.normExtra(eRaw, 70); }, 'Choose the prednisolone dose group.');
  throws(function () { T.normExtra({ hct: '0.38', predHigh: 'maybe' }, 70); }, 'Choose the prednisolone dose group.');
  eq(T.normExtra({ hct: '0.38', predHigh: 'high' }, 70).predFlag, true);
  eq(T.normExtra({ hct: '0.38', predHigh: 'low' }, 70).predFlag, false);
});

t('M9: haematocrit is required, in L/L and between 0.10 and 0.65', function () {
  throws(function () { T.normExtra({ predHigh: 'low' }, 70); }, 'haematocrit');
  throws(function () { T.normExtra({ hct: '38', predHigh: 'low' }, 70); }, 'not as a percentage');
  throws(function () { T.normExtra({ hct: '0.05', predHigh: 'low' }, 70); }, 'between 0.10 and 0.65');
  near(T.normExtra({ hct: '0.38', predHigh: 'low' }, 70).hct, 0.38, 1e-12);
  eq(T.normExtra({ hct: '0.38', predHigh: 'low' }, 70).assay, 'lcms');
});

t('M10: prepare — LC-MS/MS values pass unchanged, each sample keeps its own Ht, the report Ht is the latest sample’s, no occasions', function () {
  var pr = T.prepare({ extra: { hct: '0.40', predHigh: 'low' }, wt: 70, doses: [{ t: 0, amt: 1500 }, { t: 12, amt: 1500 }], obs: [{ t: 12, c: 4.1, hct: 0.33 }, { t: 14, c: 7, hct: 0.31 }], steadyState: false });
  eq(pr.extra.nOcc, 0); eq(pr.assay, 'lcms');
  eq(pr.obs.length, 2); eq(pr.obs[0].c, 4.1); eq(pr.obs[1].hct, 0.31);
  near(pr.hctReport, 0.31, 1e-12);
  var none = T.prepare({ extra: { hct: '0.40', predHigh: 'low' }, wt: 70, doses: [{ t: 0, amt: 1500 }], obs: [], steadyState: true });
  near(none.hctReport, 0.40, 1e-12, 'no sample: the patient field');
  var noHt = T.prepare({ extra: { hct: '0.40', predHigh: 'low' }, wt: 70, doses: [{ t: 0, amt: 1500 }], obs: [{ t: 12, c: 4 }], steadyState: false });
  near(noHt.obs[0].hct, 0.40, 1e-12, 'a sample without its own Ht takes the patient field');
  throws(function () { T.prepare({ extra: { hct: '0.40', predHigh: 'low' }, wt: 70, doses: [{ t: 0, amt: 1500 }], obs: [{ t: 12, c: 4, hct: 33 }], steadyState: false }); }, 'not as a percentage');
});

t('M11: dose unit boundary — mg in the UI, µg in the engine, converted once', function () {
  eq(M.toEngineAmt('evr', 1.5), 1500);
  eq(T.fromModel(4.2, 'lcms'), 4.2); eq(T.toModel(4.2, 'lcms'), 4.2); eq(T.fromModelAuc(79, 12, 'lcms'), 79);
});

// ---------------------------------------------------------------------------
// engine: fits
// ---------------------------------------------------------------------------
var TEND = 24 * 20 + 8;
function simObs(eta, hct, times, pred) {
  var p = M.indivParams(70, null, null, T.normExtra({ hct: String(hct), predHigh: pred || 'low' }, 70), eta, 'evr');
  var c = M.simulate([], times, p, { id: 'evr', ss: { amt: 1500, every: 12, tEnd: TEND } }).c;
  return times.map(function (tt, i) { return { t: tt, c: T.toObs(c[i], hct), hct: hct }; });
}
function evrInput(over) {
  var hct = over && over.hct != null ? over.hct : 0.38;
  var obs = simObs([0.3, -0.2, 0.05], hct, [TEND, TEND + 2]);
  var inp = Object.assign({ drug: 'evr', doses: M.ssHistory({ amt: 1500, intervalHours: 12, tEnd: TEND, n: 30, route: 'oral' }), steadyState: true,
    extra: { hct: String(hct), predHigh: 'low' }, obs: obs, intervalHours: 12, winLo: null, winHi: null, seed: 1, mcmcIters: 40000 }, over || {});
  delete inp.hct;
  return inp;
}

t('engine: a steady-state fit runs, reports AUC and trough actual and corrected, no window means no probabilities', async function () {
  var f = await B.runFit(evrInput(), null);
  truthy(isFinite(f.auc.median) && f.auc.median > 0 && isFinite(f.trough.median));
  truthy(isFinite(f.aucCorr.median) && isFinite(f.troughCorr.median));
  eq(f.hctRef, 0.38); eq(f.nOccasions, 0);
  eq(f.windowSet, false); truthy(isNaN(f.auc.pInWindow) && isNaN(f.trough.pInWindow), 'no window: no probabilities');
  eq(f.troughWin.set, false); eq(f.etaNames.join(','), 'CLINT,V3,FU');
  truthy(f.convergence.ok, 'sampler converged (R-hat < 1.01, ESS >= 400)');
});

t('engine: with a window set, probabilities appear for both the actual and the corrected value', async function () {
  var f = await B.runFit(evrInput({ troughLo: 3, troughHi: 8 }), null);
  truthy(f.trough.pInWindow >= 0 && f.trough.pInWindow <= 1);
  truthy(f.troughCorr.pInWindow >= 0 && f.troughCorr.pInWindow <= 1);
});

t('engine: the app also works without a sample — population forecast from the prior (D5)', async function () {
  var f = await B.runFit(evrInput({ obs: [] }), null);
  truthy(isFinite(f.auc.median) && f.auc.median > 0);
  eq(f.hasObs, false);
  // the prior median of the AUC is Dose / (CLINT FU) at the typical individual: 1500 / (322 * 0.27) = 17.25 plasma, 79.3 corrected
  near(f.aucCorr.median, 79.29, 4, 'population AUC at Ht 0.38');
});

t('engine: fits are deterministic with a seed', async function () {
  var a = await B.runFit(evrInput(), null), b = await B.runFit(evrInput(), null);
  eq(a.auc.median, b.auc.median); eq(a.trough.p95, b.trough.p95); eq(a.acceptance, b.acceptance);
});

t('engine: the fit recovers the truth — corrected AUC of the generating patient lies in the 90 % interval', async function () {
  var truth = T.exposure([[0.3, -0.2, 0.05]], { wt: 70, extra: ex(0.38), ss: { amt: 1500, every: 12, tEnd: 0 }, grid: G12, hctAct: 0.38, hctRef: 0.38 });
  var f = await B.runFit(evrInput({ mcmcIters: 80000 }), null);
  truthy(truth.aucR[0] >= f.aucCorr.p5 && truth.aucR[0] <= f.aucCorr.p95, 'truth ' + truth.aucR[0] + ' in [' + f.aucCorr.p5 + ', ' + f.aucCorr.p95 + ']');
  // the AUC is informed (CLINT·FU), V3 is not: the interval for the AUC is far narrower than the prior's
  var pop = await B.runFit(evrInput({ obs: [] }), null);
  truthy((f.aucCorr.p95 - f.aucCorr.p5) < 0.7 * (pop.aucCorr.p95 - pop.aucCorr.p5), 'samples narrow the AUC interval');
});

t('engine: Ht invariance end to end — the same plasma curve read at Ht 0.25 and 0.45 gives the same corrected exposure', async function () {
  // samples are built from ONE plasma curve; the Ht of the sample differs. The PK path uses the latest Ht, so the plasma
  // truth differs slightly; the corrected AUC must agree within the uncertainty (and far better than the actual one).
  var lo = await B.runFit(evrInput({ hct: 0.25, mcmcIters: 60000 }), null), hi = await B.runFit(evrInput({ hct: 0.45, mcmcIters: 60000 }), null);
  var dCorr = Math.abs(lo.aucCorr.median / hi.aucCorr.median - 1), dAct = Math.abs(lo.auc.median / hi.auc.median - 1);
  truthy(dAct > 0.25, 'actual AUC differs strongly with Ht: ' + dAct);
  truthy(dCorr < 0.1, 'corrected AUC agrees: ' + dCorr);
});

// ---------------------------------------------------------------------------
// input checks (UI layer, pure)
// ---------------------------------------------------------------------------
var UI = null;
function ui() { if (!UI) { require('../src/chart.js'); require('../src/diagnostics.js'); require('../src/texts_tac.js'); require('../src/texts_evr.js'); require('../src/author_photo.js'); require('../src/ui.js'); UI = ECU.ui; } return UI; }
t('input: dose, concentration, interval and haematocrit checks (inputProblems)', function () {
  var base = evrInput();
  eq(ui().inputProblems(S, base, [1.5], true).length, 0, 'a normal case raises nothing');
  truthy(ui().inputProblems(S, base, [150], true).some(function (m) { return /Dose 150 mg/.test(m); }), 'dose in the wrong unit');
  truthy(ui().inputProblems(S, base, [0.1], true).some(function (m) { return /Dose 0.1 mg/.test(m); }), 'below the smallest tablet');
  var lo = evrInput({ obs: [{ t: TEND, c: 0.2, hct: 0.38 }] }), hi = evrInput({ obs: [{ t: TEND, c: 90, hct: 0.38 }] });
  truthy(ui().inputProblems(S, lo, [1.5], true).some(function (m) { return /^Concentration 1/.test(m); }), 'below the quantification limit');
  truthy(ui().inputProblems(S, hi, [1.5], true).some(function (m) { return /^Concentration 1/.test(m); }), 'above the range');
  var q24 = evrInput({ intervalHours: 24 });
  truthy(ui().inputProblems(S, q24, [1.5], true).some(function (m) { return /twice-daily everolimus/.test(m); }), 'once daily');
  truthy(ui().inputProblems(S, evrInput({ extra: { hct: '38', predHigh: 'low' } }), [1.5], true).some(function (m) { return /Haematocrit 38 L\/L/.test(m) && /percentage/.test(m); }), 'Ht as a percentage');
});

// ---------------------------------------------------------------------------
// worker pool, wiring, regression record
// ---------------------------------------------------------------------------
function nodeWorkerSpawn() {
  var WT = require('worker_threads');
  var src = ECU.parallel.workerSource(['version', 'model', 'everolimus', 'bayes'].map(function (f) { return fs.readFileSync(path.join(__dirname, '..', 'src', f + '.js'), 'utf8'); }));
  return { start: function () {
    var w = new WT.Worker(src, { eval: true });
    return { postMessage: function (m) { w.postMessage(m); }, onMessage: function (fn) { w.on('message', fn); }, onError: function (fn) { w.on('error', fn); }, terminate: function () { w.terminate(); } };
  } };
}
t('parallel: eight chains on a pool of workers give exactly the draws of the in-process run for everolimus; the workers really run', async function () {
  ECU.parallel.use(null);
  var seq = await B.runFit(evrInput({ mcmcIters: 32000 }), null);
  eq(ECU.parallel.status(), 'in-process');
  var par;
  try {
    ECU.parallel.use(nodeWorkerSpawn(), { workers: 4 });
    par = await B.runFit(evrInput({ mcmcIters: 32000 }), null);
    eq(ECU.parallel.status(), '4 workers', 'the pool was used, not the fallback');
  } finally { ECU.parallel.use(null); }
  eq(par.nDraws, seq.nDraws); eq(par.acceptance, seq.acceptance);
  for (var i = 0; i < seq.draws.length; i += 97) for (var j = 0; j < seq.draws[i].length; j++) eq(par.draws[i][j], seq.draws[i][j], 'draw ' + i + ',' + j);
  eq(par.auc.median, seq.auc.median); eq(par.aucCorr.median, seq.aucCorr.median); eq(par.trough.p95, seq.trough.p95);
});

t('wiring: the page build and the worker source list both carry src/everolimus.js (a missing entry silently drops the workers to one thread)', function () {
  var root = path.join(__dirname, '..');
  var par = fs.readFileSync(path.join(root, 'src', 'parallel.js'), 'utf8'), bld = fs.readFileSync(path.join(root, 'build.mjs'), 'utf8'), idx = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  var srcList = par.match(/var SOURCES = \[([^\]]*)\]/)[1];
  truthy(/src\/everolimus\.js/.test(srcList), 'parallel.js SOURCES');
  truthy(srcList.indexOf('src/model.js') < srcList.indexOf('src/everolimus.js') && srcList.indexOf('src/everolimus.js') < srcList.indexOf('src/bayes.js'), 'order: model.js, drug files, bayes.js');
  truthy(/'src\/everolimus\.js'/.test(bld.match(/const FILES = \[([^\]]*)\]/)[1]), 'build.mjs FILES');
  truthy(/<script src="src\/everolimus\.js"><\/script>/.test(idx), 'index.html script tag');
});

t('V16c (regression): fixed-seed everolimus fits equal the recorded baseline exactly', async function () {
  var rec = JSON.parse(fs.readFileSync(path.join(__dirname, 'evr_regression.json'), 'utf8'));
  var tEnd = 24 * 20 + 8, ss = function () { return M.ssHistory({ amt: 1500, intervalHours: 12, tEnd: tEnd, n: 30 }); };
  var d3 = []; for (var k = 0; k < 30; k++) d3.push({ t: tEnd - 12 * (29 - k), amt: 1000 + 500 * (k > 14), route: 'oral' });
  var cases = {
    ss_trough_peak: { drug: 'evr', extra: { hct: '0.33', predHigh: 'low' }, doses: ss(), steadyState: true, obs: [{ t: tEnd, c: 3.6, hct: 0.33 }, { t: tEnd + 2, c: 11.2, hct: 0.31 }], intervalHours: 12, troughLo: 3, troughHi: 8, seed: 11, mcmcIters: 160000 },
    hist_troughs3: { drug: 'evr', extra: { hct: '0.40', predHigh: 'high' }, doses: d3, steadyState: false, obs: [2, 1, 0].map(function (k, i) { return { t: tEnd - 24 * k, c: 3 + 0.5 * i, hct: 0.38 + 0.01 * i }; }), intervalHours: 12, seed: 5, mcmcIters: 160000 },
    population: { drug: 'evr', extra: { hct: '0.38', predHigh: 'low' }, doses: ss(), steadyState: true, obs: [], intervalHours: 12, seed: 3, priorDraws: 3000 }
  };
  var f1 = null;
  for (var key of Object.keys(cases)) {
    var f = await B.runFit(cases[key], null), r = rec[key];
    eq(JSON.stringify([f.auc.p5, f.auc.median, f.auc.p95, f.auc.pInWindow]), JSON.stringify(r.auc), key + ' AUC');
    eq(JSON.stringify([f.trough.p5, f.trough.median, f.trough.p95, f.trough.pInWindow]), JSON.stringify(r.tr), key + ' trough');
    eq(JSON.stringify([f.aucCorr.p5, f.aucCorr.median, f.aucCorr.p95]), JSON.stringify(r.aucC), key + ' corrected AUC');
    eq(JSON.stringify([f.troughCorr.p5, f.troughCorr.median, f.troughCorr.p95]), JSON.stringify(r.trC), key + ' corrected trough');
    eq(f.acceptance, r.acc, key + ' acceptance'); eq(f.nDraws, r.nDraws);
    if (r.mapEta) { eq(JSON.stringify(f.map.eta), JSON.stringify(r.mapEta), key + ' MAP'); eq(f.map.ofv, r.mapOfv); }
    if (key === 'ss_trough_peak') f1 = f;
  }
  var sc = await B.doseScan({ draws: f1.draws, drug: 'evr', extra: f1.extra, tEnd: tEnd, amounts: [1000, 1500, 2000], intervalHours: 12, troughLo: 3, troughHi: 8 });
  sc.forEach(function (x, i) { eq(JSON.stringify([x.amt, x.auc.median, x.auc.p5, x.trough.median, x.trough.pInWindow, x.aucCorr.median]), JSON.stringify(rec.scan[i]), 'scan ' + i); });
});

t('UI text of MPA and tacrolimus is byte-identical to the recorded baseline (the per-drug generalisation of ui.js changed nothing for them)', async function () {
  var rec = JSON.parse(fs.readFileSync(path.join(__dirname, 'ui_text_snapshot.json'), 'utf8'));
  var U = ui(), DG = ECU.diagnostics, evr = M.drugs.evr, tEnd = 24 * 40 + 8;
  delete M.drugs.evr;   // the About model list would otherwise gain the everolimus card
  try {
    var fitTac = await B.runFit({ drug: 'tac', wt: 80, extra: { sex: 'm', ht: '175', pred: '10', hct: '0.33', assay: 'lcms' }, doses: M.ssHistory({ amt: 3000, intervalHours: 12, tEnd: tEnd, n: 30 }), steadyState: true,
      obs: [{ t: tEnd, c: 4.1, hct: 0.33 }, { t: tEnd + 2, c: 9.8, hct: 0.33 }], intervalHours: 12, winLo: 80, winHi: 150, troughLo: 4, troughHi: 8, seed: 1, mcmcIters: 40000 }, null);
    var fitMpa = await B.runFit({ drug: 'mpa', form: 'mmf', wt: 70, doses: M.ssHistory({ amt: 739, intervalHours: 12, tEnd: 368, n: 30, route: 'oral' }), steadyState: true,
      obs: [{ t: 368.33, c: 9.5 }, { t: 369, c: 12.1 }, { t: 371, c: 4.4 }], intervalHours: 12, winLo: 30, winHi: 60, seed: 1, mcmcIters: 40000 }, null);
    ['mpa', 'tac'].forEach(function (id) {
      M.select(id);
      var noVer = function (h) { return h.replace(/<h3>Version<\/h3><p>v[^<]*<\/p>/, '<h3>Version</h3>').replace(/<div class="about-photo">[\s\S]*?<\/div>/, ''); };   // a version bump alone must not break this guard
      eq(noVer(U.aboutHtml()), noVer(rec[id].about), id + ' About'); eq(U.backgroundHtml(), rec[id].background, id + ' background');
      eq(U.gettingStartedBodyHtml(), rec[id].gettingStarted, id + ' getting started');
      eq(U.drugText('chartNote'), rec[id].chartNote, id + ' chart note'); eq(U.drugText('howto'), rec[id].howto, id + ' how-to');
    });
    eq(DG.summaryHint(fitTac), rec.tacSummary); eq(DG.panelHtml(fitTac, M.spec('tac')), rec.tacPanel);
    eq(DG.summaryHint(fitMpa), rec.mpaSummary); eq(DG.panelHtml(fitMpa, M.spec('mpa')), rec.mpaPanel);
  } finally { M.drugs.evr = evr; M.select('mpa'); }
});

t('copy: everolimus texts name the right drug, carry no tacrolimus/MPA wording, no dose advice, no "not validated", no em-dash, and name haematocrit 0.38 wherever a value is corrected', function () {
  var U = ui(), TXT = ECU.drugTexts.evr, texts = [];
  M.select('evr');
  try {
    ['background', 'gettingStartedBodyHtml', 'aboutHtml'].forEach(function (k) { texts.push(U[k === 'background' ? 'backgroundHtml' : k]()); });
    ['chartNote', 'howto', 'doseNote'].forEach(function (k) { texts.push(U.drugText(k)); eq(U.drugText(k), ECU.drugTexts.evr[k], 'drugText(' + k + ') comes from the everolimus registry entry'); });
  } finally { M.select('mpa'); }
  var about = texts[2]; texts[2] = TXT.aboutSections();   // the whole About also lists the other drugs' cards
  texts.push(TXT.modelTable(S), TXT.modelNote, TXT.help.window, TXT.help.ivexplore, TXT.shrinkNote, TXT.explorerNote,
    TXT.resultNote({ hctReport: 0.33, hctRef: 0.38 }, { esc: String, fmtC: String }), TXT.reportNote({ hctReport: 0.33, hctRef: 0.38 }, { esc: String, fmtC: String }),
    TXT.explorerSub({}, { extra: { predFlag: true } }), TXT.diagNote, S.info, S.windowHint, S.samplePeak, S.assumptions.join(' '), S.windowSets.map(function (w) { return w.label + ' ' + w.basis; }).join(' '),
    S.covariates.map(function (c) { return c.name + ' ' + c.help; }).join(' '));
  var all = texts.join('\n');
  falsy(/—/.test(all), 'no em-dash');
  falsy(/tacrolimus|mycophenol|\bMPA\b|CYP3A5|Størset|de Winter|fat-free/i.test(all.replace('the tacrolimus concentration does not change everolimus exposure', '')), 'no other drug named (the consensus interaction statement is the one allowed mention)');
  falsy(/not validated|unvalidated|has not been validated/i.test(all), 'no validation caveat on a corrected value or a target');
  falsy(/\b(you should|we recommend|recommended dose|increase the dose|reduce the dose|raise the dose|lower the dose|adjust the dose|switch to)\b/i.test(all), 'no dose advice');
  falsy(/0\.35/.test(all), 'the tacrolimus reference haematocrit does not leak in');
  falsy(/corrected to (?:a )?haematocrit(?! of 0\.38| 0\.38)/i.test(all), 'every "corrected to haematocrit" names 0.38');
  truthy(/corrected to a haematocrit of 0\.38/i.test(all) && /Everolimus/.test(texts[0] + texts[1]) || /everolimus/i.test(texts[0]), 'the background names the drug');
  truthy(/LC-MS\/MS/.test(texts[0]) && /no AUC target|no AUC target/i.test(texts[0]), 'assay and the absence of an AUC target are stated');
  truthy(/43%/.test(texts[2]) && /13\.5%/.test(texts[2]), 'About carries the paper’s accuracy numbers, including the a priori AUC over-prediction');
  truthy(/Everolimus/.test(about) && /Residual error \(log scale\)/.test(about) && /Mean absolute|Zwart/.test(about), 'the About model list carries the everolimus card');
  var bg = texts[0];
  truthy(/data-winset="evr-cni"/.test(bg) && /data-winset="evr-nocni"/.test(bg), 'both window sets have a Use button');
  truthy(/Pick the set that matches the patient’s co-medication/.test(bg), 'the background tells the user to choose by co-medication');
});

t('ui flags: everolimus shows no weight and no per-dose prednisolone; tacrolimus keeps both; MPA has neither flag', function () {
  eq(M.spec('evr').ui.weight, false); eq(M.spec('evr').ui.predDose, false); eq(M.spec('evr').ui.noun, 'everolimus');
  eq(M.spec('tac').ui.weight, true); eq(M.spec('tac').ui.predDose, true); eq(M.spec('tac').ui.noun, 'tacrolimus');
  eq(M.spec('mpa').ui, undefined);
  eq(M.covariateFields('evr').map(function (c) { return c.id; }).join(','), 'hct,predHigh');
  eq(M.covariateFields('evr')[1].missing, 'Choose the prednisolone dose group.', 'the run button names what is missing in plain words');
  eq(M.covariateFields('tac').some(function (c) { return c.missing; }), false, 'tacrolimus messages are unchanged');
  var sel = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8').match(/<select id="pt-drug"[\s\S]*?<\/select>/)[0];
  truthy(/<option value="evr">Everolimus \(adult kidney\)<\/option>/.test(sel), 'the drug select offers everolimus');
});

t('NONMEM: the everolimus structural model reproduces NONMEM 7.6 whole-blood and plasma predictions (steady state and histories, to 1e-6); with a changing haematocrit the one-Ht approximation stays within the measured bound', function () {
  var rows = fs.readFileSync(path.join(__dirname, 'nonmem_evr_struct.csv'), 'utf8').trim().split('\n').slice(1).map(function (l) { return l.split(',').map(Number); });
  var tab = fs.readFileSync(path.join(__dirname, 'nonmem_evr_struct.tab'), 'utf8').trim().split('\n').slice(2).map(function (l) { return l.trim().split(/\s+/).map(Number); });
  var ids = {}; rows.forEach(function (r) { (ids[r[0]] = ids[r[0]] || []).push(r); });
  var nSS = 0, nHist = 0, nCh = 0, worst = 0, worstCh = 0, sumCh = 0, nObsCh = 0;
  Object.keys(ids).forEach(function (id) {
    var rs = ids[id], doses = rs.filter(function (r) { return r[3] === 1; }), obs = rs.filter(function (r) { return r[3] === 0; });
    var f = rs[0], eta = [f[9], f[10], f[11]], high = f[8] === 4;
    var hts = rs.map(function (r) { return r[7]; }), changing = Math.max.apply(null, hts) - Math.min.apply(null, hts) > 1e-9;
    var htPK = changing ? obs[obs.length - 1][7] : f[7];   // the app: the latest sample's Ht for the PK path
    var p = M.indivParams(70, null, null, T.normExtra({ hct: htPK, predHigh: high ? 'high' : 'low' }, 70), eta, 'evr');
    var times = obs.map(function (o) { return o[1]; }), isSS = doses.length === 1 && doses[0][5] === 1, c;
    if (isSS) { nSS++; c = M.simulate([], times, p, { id: 'evr', ss: { amt: doses[0][2] * 1000, every: 12, tEnd: 0 } }).c; }
    else { if (changing) nCh++; else nHist++; c = M.simulate(doses.map(function (d) { return { t: d[1], amt: d[2] * 1000 }; }), times, p, { id: 'evr' }).c; }
    var peak = Math.max.apply(null, c.map(function (v, i) { return T.toObs(v, obs[i][7]); }));
    obs.forEach(function (o, i) {
      var row = tab.find(function (r) { return r[0] === +id && Math.abs(r[1] - o[1]) < 1e-9; });
      truthy(row, 'NONMEM row for ID ' + id + ' t=' + o[1]);
      var wb = T.toObs(c[i], o[7]), rel = Math.abs(wb - row[2] * 1000) / Math.max(Math.abs(row[2] * 1000), 1e-3 * peak);
      if (changing) { worstCh = Math.max(worstCh, rel); sumCh += rel; nObsCh++; }
      else { worst = Math.max(worst, rel, Math.abs(c[i] - row[3] * 1000) / Math.max(Math.abs(row[3] * 1000), 1e-3 * peak)); }
    });
  });
  eq(nSS, 24); eq(nHist, 16); eq(nCh, 12);
  truthy(worst < 1e-6, 'constant Ht: worst relative difference ' + worst.toExponential(2));
  truthy(worstCh < 0.07 && sumCh / nObsCh < 0.02, 'changing Ht: max ' + (worstCh * 100).toFixed(2) + ' %, mean ' + (sumCh / nObsCh * 100).toFixed(2) + ' %');
  truthy(worstCh > 1e-4, 'the approximation is real (a change in Ht does move the prediction); the test is not vacuous');
});

t('NONMEM: the app’s MAP equals NONMEM’s POSTHOC empirical Bayes estimate in the same objective (30 patients, trough only and trough + 2 h, prednisolone on and off)', function () {
  var fx = JSON.parse(fs.readFileSync(path.join(__dirname, 'nonmem_evr_posthoc.json'), 'utf8'));
  eq(fx.patients.length, 30);
  var maxGap = 0, maxEta = 0;
  fx.patients.forEach(function (a) {
    var prep = T.prepare({ extra: a.rawEx, wt: 70, doses: a.doses.map(function (d) { return Object.assign({}, d); }), obs: a.obs, steadyState: false });
    var ofv = B.makeOfv({ wt: 70, drug: 'evr', doses: prep.doses, ss: null, obs: prep.obs, omega: { vars: T.omega().vars, cov: null, dims: 3 }, extra: prep.extra, form: null });
    var map = B.mapBFGS(ofv, T.omega().vars);
    maxGap = Math.max(maxGap, map.f - ofv(a.etaNM));   // > 0 would mean the app is worse than NONMEM
    map.x.forEach(function (v, k) { maxEta = Math.max(maxEta, Math.abs(v - a.etaNM[k])); });
  });
  truthy(maxGap < 0.05, 'the app is above NONMEM’s objective by at most ' + maxGap.toExponential(2));
  truthy(maxEta < 0.05, 'largest |eta(app) - eta(NONMEM)| ' + maxEta.toFixed(4));
  truthy(Math.max.apply(null, fx.patients.map(function (a) { return Math.abs(a.etaNM[0]); })) > 0.1, 'the patients are not all at the prior (the check is not vacuous)');
});

t('diagnostics: the fit dialog works for everolimus (three etas, information gained, the V3 note) and for a run without a sample', async function () {
  ui();
  var DG = ECU.diagnostics, f = await B.runFit(evrInput({ troughLo: 3, troughHi: 8 }), null);
  var html = DG.panelHtml(f, S);
  eq((html.match(/η-/g) || []).length, 6, 'three etas, each in the table and in the bars');
  truthy(/η-CLINT/.test(html) && /η-V3/.test(html) && /η-FU/.test(html));
  truthy(/volume \(V3\) is expected to be poorly informed by troughs/.test(html), 'the everolimus note, not the tacrolimus day-to-day sentence');
  falsy(/KF, KKA/.test(html), 'no tacrolimus wording');
  truthy(/corrected to haematocrit 0\.38/.test(DG.summaryHint(f)), 'the summary names the reference haematocrit');
  truthy(DG.gofChart(f, S) && DG.gofChart(f, S).points.length === 2, 'observed vs predicted for two samples');
  var pop = await B.runFit(evrInput({ obs: [] }), null);
  truthy(/No measurements were entered/.test(DG.panelHtml(pop, S)) || /population forecast/i.test(DG.panelHtml(pop, S)));
  truthy(/population forecast/i.test(DG.summaryHint(pop)) || /No measurements/.test(DG.summaryHint(pop)));
});

t('explorer: a dose-explorer result never outlives the fit it was computed from (new forecast, drug switch, import and clearing all reset it)', async function () {
  var U = ui(), els = {};
  var NEUTRAL = '<div class="note">Run a forecast in card 3 first. This explorer reuses that fit’s own parameters.</div>';
  var NEXT = '<div class="note">Enter a dose and press Explore to see it at steady state, using this forecast’s fit.</div>';
  globalThis.document = { getElementById: function (id) { return els[id] || (els[id] = { innerHTML: '', textContent: '', hidden: false, disabled: false, style: {}, value: '' }); } };
  try {
    var f = await B.runFit(evrInput(), null);
    els['iv-out'] = { innerHTML: '<div class="res-grid">2 mg everolimus from the PREVIOUS patient</div>' }; els['iv-status'] = { textContent: 'Exploring…' };
    U.renderResults(f);
    eq(els['iv-out'].innerHTML, NEXT, 'a new forecast replaces the explorer result with the "press Explore" note');
    eq(els['iv-status'].textContent, '', 'and its status line');
    truthy(els['aucBlock'].innerHTML.length > 50, 'the results themselves still render');
    els['iv-out'].innerHTML = 'old result';
    U.renderResults(null);
    eq(els['iv-out'].innerHTML, NEUTRAL, 'clearing the results (drug switch, import) resets it too');
  } finally { delete globalThis.document; }
});

// ---------------------------------------------------------------------------
// beginner-test fixes (3 October 2026): each was seen in the real page and is held by a test that failed first
// ---------------------------------------------------------------------------
function stubDom(initial) {
  var els = {};
  function el(id) { return els[id] || (els[id] = { value: '', innerHTML: '', textContent: '', hidden: false, disabled: false, style: {}, checked: false, options: [], classList: { add: function () {}, remove: function () {}, contains: function () { return false; } }, querySelector: function () { return null; }, closest: function () { return null; }, dispatchEvent: function () {}, setAttribute: function () {}, getAttribute: function () { return null; } }); }
  Object.keys(initial || {}).forEach(function (k) { Object.keys(initial[k]).forEach(function (f) { el(k)[f] = initial[k][f]; }); });
  globalThis.document = { getElementById: el, querySelector: function () { return null; }, querySelectorAll: function () { return []; }, title: '' };
  globalThis.print = function () { globalThis.__printed = true; };
  return els;
}
function dropDom() { delete globalThis.document; delete globalThis.print; }

t('fix 1: a drug without a weight covariate puts no weight in its report or session file, whatever a hidden field still holds from another drug', function () {
  var U = ui();
  var els = stubDom({ 'pt-wt': { value: '80' }, 'pt-drug': { value: 'mpa' }, 'pt-form': { value: 'mmf' } });
  try {
    M.select('mpa');
    U.renderReport();
    falsy(/Weight/.test(els.reportSheet.innerHTML), 'no forecast yet: the report page says so and carries no stale weight (the MPA report with a fit is checked in test_report.js)');
    truthy(/No forecast has been run in this session/.test(els.reportSheet.innerHTML), 'a report without a forecast is an explanation, not an empty form');
    eq(U.sessionObj().patient.wt, '', 'MPA session: no stale weight');
    M.select('tac'); els['pt-drug'].value = 'tac';
    eq(U.sessionObj().patient.wt, '80', 'tacrolimus keeps its weight in the session');
  } finally { dropDom(); M.select('mpa'); }
});

t('fix 2: the explorer note after a forecast no longer says "run a forecast first"', function () {
  var U = ui();
  var els = stubDom({});
  return B.runFit(evrInput(), null).then(function (f) {
    try {
      U.renderResults(null);
      truthy(/Run a forecast in card 3 first/.test(els['iv-out'].innerHTML), 'without a forecast the note says so');
      U.renderResults(f);
      falsy(/Run a forecast/.test(els['iv-out'].innerHTML), 'with a forecast on screen it must not');
      truthy(/press Explore/i.test(els['iv-out'].innerHTML), 'it says what to do next');
    } finally { dropDom(); }
  });
});

t('fix 3: importing a file from another app names NephroTDM, not the old app name', function () {
  var U = ui(), els = stubDom({});
  try {
    U.applySession({ app: 'something-else' });
    truthy(/Not a NephroTDM session file/.test(els.toast.textContent), els.toast.textContent);
    falsy(/mpa-tdm/.test(els.toast.textContent), 'no old name in the message');
  } finally { dropDom(); }
});

t('fix 4 to 6: page wording — older-sample weighting is not "Weight", the step guide matches the card title, no "planned dose", About does not point to itself', function () {
  var html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  falsy(/Weight of older samples/.test(html), 'the advanced option is not called Weight');
  truthy(/<label class="f" for="pt-recency">Down-weight older samples<\/label>/.test(html));
  truthy(/<span class="step" data-step="run"><i>3<\/i> Forecast<\/span>/.test(html), 'step 3 reads Forecast');
  falsy(/<i>3<\/i> Run forecast/.test(html), 'step 3 is not "Run forecast" (the card is titled Forecast)');
  falsy(/planned dose/.test(html), 'no "planned dose"');
  var U = ui(); M.select('mpa');
  var about = U.aboutHtml().replace(/<h3>Version<\/h3>[\s\S]*$/, '');
  falsy(/see the model card in About/.test(about), 'About does not send the reader to About');
  truthy(/see the model card in About/.test(M.spec('mpa').info), 'the main-page hint keeps its pointer');
});

t('fix 7: on phones number inputs are border-box, so they cannot run past the card edge', function () {
  var css = fs.readFileSync(path.join(__dirname, '..', 'src', 'app.css'), 'utf8');
  var mob = css.slice(css.indexOf('@media (max-width: 640px)'));
  truthy(/\.sessionbar input, \.sessionbar select \{[^}]*box-sizing: border-box/.test(mob), 'sessionbar inputs: box-sizing border-box');
  truthy(/\.row3 input[^{]*\{[^}]*box-sizing: border-box/.test(mob), 'row3 inputs: box-sizing border-box');
});

t('About links to the source repository (nephrotdm-source) for every drug, in a new tab with rel=noopener', function () {
  var U = ui();
  ['mpa', 'tac', 'evr'].forEach(function (id) {
    M.select(id);
    var about = U.aboutHtml();
    truthy(/<a href="https:\/\/github\.com\/Robterheine\/nephrotdm-source" target="_blank" rel="noopener">/.test(about), id + ': link to the source repository');
    truthy(/Source code/.test(about.slice(about.indexOf('<h3>Contact</h3>'))), id + ': the link sits in the Contact section');
  });
  M.select('mpa');
  falsy(/Robterheine\/mpatdm|github\.io\/mpatdm/.test(fs.readFileSync(path.join(__dirname, '..', 'src', 'ui.js'), 'utf8')), 'no reference to the retired mpatdm repository in the code');
});

t('About: tacrolimus and everolimus each get reference values (from the spec, with grade and basis), assay/haematocrit/sampling and a model-based rationale, as MPA does', function () {
  var U = ui();
  function section(id, name) {
    M.select(id);
    try { var a = U.aboutHtml(); var i = a.indexOf('<h3>Reference values for ' + name); return i < 0 ? '' : a.slice(i, a.indexOf('<h3>Models</h3>')); } finally { M.select('mpa'); }
  }
  var tac = section('tac', 'tacrolimus'), evr = section('evr', 'everolimus');
  truthy(tac, 'a tacrolimus reference-values section'); truthy(evr, 'an everolimus reference-values section');
  M.spec('tac').windowSets.filter(function (w) { return !w.matched; }).forEach(function (w) {
    truthy(tac.indexOf(w.label) >= 0 && tac.indexOf(w.trough[0] + '–' + w.trough[1]) >= 0, 'tacrolimus table row: ' + w.label);
    if (w.auc) truthy(tac.indexOf(w.auc[0] + '–' + w.auc[1]) >= 0, 'AUC of ' + w.label);
  });
  M.spec('tac').windowSets.filter(function (w) { return w.matched && w.matched.col === 'all'; }).forEach(function (w) {
    truthy(tac.indexOf(w.trough[0] + '–' + w.trough[1]) >= 0 && tac.indexOf(w.auc[0] + '–' + w.auc[1]) >= 0, 'matched AUC range for trough ' + w.trough);
  });
  M.spec('evr').windowSets.forEach(function (w) { truthy(evr.indexOf(w.label) >= 0 && evr.indexOf(w.trough[0] + '–' + w.trough[1]) >= 0, 'everolimus table row: ' + w.label); });
  truthy(/Saint-Marcoux/.test(tac) && /Brunet/.test(tac), 'tacrolimus sources named'); truthy(/Masuda/.test(evr) && /Zwart/.test(evr), 'everolimus sources named');
  truthy(/<h3>Haematocrit, assay and sampling<\/h3>/.test(tac) && /<h3>Assay, haematocrit and sampling<\/h3>/.test(evr), 'assay, haematocrit and sampling sections');
  truthy(/<h3>Why model-based/.test(tac) && /<h3>Why model-based/.test(evr), 'rationale sections');
  truthy(/no AUC target/i.test(evr) && /12–20/.test(evr) && /ciclosporin/i.test(evr) && /LC-MS\/MS/.test(evr), 'everolimus: no AUC target, the cancer range as out of scope, ciclosporin, assay');
  truthy(/0\.35/.test(tac) && !/0\.38/.test(tac), 'tacrolimus names 0.35 only'); truthy(/0\.38/.test(evr) && !/0\.35/.test(evr), 'everolimus names 0.38 only');
  [tac, evr].forEach(function (x) {
    falsy(/—/.test(x), 'no em-dash'); falsy(/not validated|unvalidated/i.test(x), 'no validation caveat');
    falsy(/\b(you should|we recommend|recommended dose|increase the dose|reduce the dose|raise the dose|lower the dose|adjust the dose|switch to)\b/i.test(x), 'no dose advice');
  });
  falsy(/tacrolimus|Størset/i.test(evr.replace(/tacrolimus concentration does not/i, '')), 'everolimus section does not name tacrolimus except the consensus interaction statement');
  falsy(/everolimus/i.test(tac.replace(/with everolimus|plus everolimus|everolimus sets/gi, '')), 'tacrolimus section names everolimus only for the combination windows');
});

t('About: the author photo sits at the bottom for every drug, offline (data URI), with alt text and the same caption as complementtdm', function () {
  var U = ui();
  ['mpa', 'tac', 'evr'].forEach(function (id) {
    M.select(id);
    var a = U.aboutHtml(), i = a.indexOf('<div class="about-photo">');
    truthy(i > a.indexOf('<h3>Contact</h3>'), id + ': photo block after the contact section');
    truthy(/<img src="data:image\/webp;base64,UklGR[A-Za-z0-9+\/=]{20000,}" alt="Photo of Rob ter Heine" width="56" height="56">/.test(a), id + ': inline webp, alt text, 56 px');
    truthy(/Dept\. of Pharmacy, Pharmacology &amp; Toxicology, Radboudumc &amp; Radboud Applied Pharmacometrics research group/.test(a), id + ': caption');
  });
  M.select('mpa');
  var css = fs.readFileSync(path.join(__dirname, '..', 'src', 'app.css'), 'utf8');
  truthy(/\.modal \.about-photo img \{[^}]*border-radius: 50%/.test(css), 'circular photo style');
  var root = path.join(__dirname, '..');
  truthy(/'src\/author_photo\.js'/.test(fs.readFileSync(path.join(root, 'build.mjs'), 'utf8')) && /<script src="src\/author_photo\.js"><\/script>/.test(fs.readFileSync(path.join(root, 'index.html'), 'utf8')), 'the photo file is in the build and the dev page');
  truthy(fs.statSync(path.join(root, 'src', 'author_photo.js')).size < 60000, 'the photo stays small (about 38 KB of base64)');
});

t('layout: header, content and footer share one centred column on wide screens (the header text sat at the left edge while the cards were centred)', function () {
  var css = fs.readFileSync(path.join(__dirname, '..', 'src', 'app.css'), 'utf8');
  truthy(/--col:\s*980px/.test(css), 'one column-width variable');
  truthy(/main\.layout \{[^}]*max-width: var\(--col\)/.test(css), 'main uses it');
  truthy(/\n\.app \{[^}]*padding: var\(--sp-4\) max\(var\(--sp-5\), calc\(\(100% - var\(--col\)\) \/ 2\)\)/.test(css), 'header band: content aligned to the column');
  truthy(/footer\.app \{[^}]*padding: var\(--sp-3\) max\(var\(--sp-5\), calc\(\(100% - var\(--col\)\) \/ 2\)\)/.test(css), 'footer: content aligned to the column');
  var mob = css.slice(css.indexOf('@media (max-width: 640px)'));
  truthy(/\.app \{ padding: var\(--sp-3\); \}/.test(mob) && /footer\.app \{ padding: var\(--sp-3\); \}/.test(mob), 'phones keep their small padding');
});

h.runAll().then(function (ok) { if (!ok) process.exit(1); }).catch(function (e) { console.error(e); process.exit(1); });
