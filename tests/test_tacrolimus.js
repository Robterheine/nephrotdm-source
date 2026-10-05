/* =========================================================================
 * NephroTDM — tacrolimus test suite (Størset 2014 model)
 * Run: node tests/test_tacrolimus.js   (part of `npm test`)
 *
 * Reference numbers are the plan's (docs/IMPLEMENTATION_PLAN_STORSET_2014.md §1),
 * computed by an independent script; the ODE oracle below shares no code with
 * the closed form. Every assertion can fail — see README rule 7b and the
 * sabotage record in docs/RELEASE_NOTES_V120.md.
 * ========================================================================= */
'use strict';
var fs = require('fs'), path = require('path');
var h = require('./harness.js');
var t = h.t, eq = h.eq, near = h.near, assert = h.assert, throws = h.throws, rejects = h.rejects, truthy = h.truthy, falsy = h.falsy;

['version', 'model', 'tacrolimus', 'bayes', 'parallel'].forEach(function (f) { require('../src/' + f + '.js'); });
var ECU = globalThis.ECU, M = ECU.model, B = ECU.bayes;
var S = M.spec('tac'), T = S.custom, K = T.constants;

// A patient whose fat-free mass is exactly the model's standard 60 kg (so typical parameters apply unscaled).
var EX60 = { _norm: true, sex: 'm', ht: 175, wt: 80, ffm: 60, expr: false, cyp3a5: 'nonexpresser', pred: 20, hct: 0.33, assay: 'lcms', nOcc: 0, occDays: [] };
function P(eta, ex) { return M.indivParams(80, null, null, ex || EX60, eta || [0, 0, 0], 'tac'); }
function grid(t0, tau, perHour) { var g = [], n = tau * (perHour || 4); for (var i = 0; i <= n; i++) g.push(t0 + i * tau / n); return g; }
function trapz(xs, ys) { var a = 0; for (var i = 1; i < xs.length; i++) a += (ys[i - 1] + ys[i]) * 0.5 * (xs[i] - xs[i - 1]); return a; }

// Independent oracle: classical RK4 on the plasma ODE (depot, central, peripheral), explicit doses, per-dose F and ka.
function rk4Plasma(p, doses, times) {
  var out = [], y = [0, 0, 0], tcur = doses[0].t, k10 = p.cl / p.v1, k12 = p.q / p.v1, k21 = p.q / p.v2;
  var ev = doses.map(function (d) { return { t: d.t + 0.41, a: d.a, ka: d.ka }; }).sort(function (a, b) { return a.t - b.t; });
  // each dose has its own ka: track one depot per dose (linear, so superposition is exact and independent of the closed form)
  var depots = ev.map(function () { return 0; });
  function deriv(yy, dp) {
    var dC = -(k10 + k12) * yy[0] + k21 * yy[1], dP = k12 * yy[0] - k21 * yy[1], dD = [];
    for (var i = 0; i < dp.length; i++) { dD.push(-ev[i].ka * dp[i]); dC += ev[i].ka * dp[i] / p.v1 * p.v1; }
    return { c: dC, p: dP, d: dD };
  }
  var state = { c: 0, p: 0, d: depots.slice() }, ti = 0;
  var tEnd = Math.max.apply(null, times), dt = 0.002, t0 = Math.min(ev[0].t, times[0]);
  var order = times.map(function (tt, i) { return { t: tt, i: i }; }).sort(function (a, b) { return a.t - b.t; });
  var oi = 0, tt = t0, started = ev.map(function () { return false; });
  while (oi < order.length) {
    // dose entry (instantaneous into its depot) — an out time at an entry instant is evaluated BEFORE the dose
    while (oi < order.length && Math.abs(order[oi].t - tt) < dt / 2) { out[order[oi].i] = state.c / p.v1; oi++; }
    for (var i = 0; i < ev.length; i++) if (!started[i] && tt >= ev[i].t - dt / 2) { state.d[i] += ev[i].a; started[i] = true; }
    function f(s) {
      var dc = -(k10 + k12) * s.c + k21 * s.p, dp = k12 * s.c - k21 * s.p, dd = [];
      for (var j = 0; j < s.d.length; j++) { dd.push(-ev[j].ka * s.d[j]); dc += ev[j].ka * s.d[j]; }
      return { c: dc, p: dp, d: dd };
    }
    function add(s, k, h2) { return { c: s.c + h2 * k.c, p: s.p + h2 * k.p, d: s.d.map(function (v, j) { return v + h2 * k.d[j]; }) }; }
    var k1 = f(state), k2 = f(add(state, k1, dt / 2)), k3 = f(add(state, k2, dt / 2)), k4 = f(add(state, k3, dt));
    state = {
      c: state.c + dt / 6 * (k1.c + 2 * k2.c + 2 * k3.c + k4.c),
      p: state.p + dt / 6 * (k1.p + 2 * k2.p + 2 * k3.p + k4.p),
      d: state.d.map(function (v, j) { return v + dt / 6 * (k1.d[j] + 2 * k2.d[j] + 2 * k3.d[j] + k4.d[j]); })
    };
    tt += dt;
  }
  return out;
}

t('spec: tacrolimus is registered, ready, in µg/L and carries the citation', function () {
  eq(S.id, 'tac'); eq(S.pending, false);
  eq(S.units.conc, 'µg/L'); eq(S.units.auc, 'µg·h/L');
  truthy(/Størset/.test(S.article) && /Br J Clin Pharmacol 2014;78/.test(S.article));
  truthy(M.listDrugs().some(function (d) { return d.id === 'tac'; }));
});

t('V1: micro-constants and half-lives of the typical individual', function () {
  var p = P();
  near(p.cl, 811, 1e-9); near(p.v1, 6290, 1e-9); near(p.q, 1200, 1e-9); near(p.v2, 32100, 1e-9);
  near(p.k12, 0.190779, 1e-5, 'k12 = Q/V1'); near(p.k21, 0.0373832, 1e-6, 'k21 = Q/V2');
  near(M.terminalHalfLife(p), 49.33, 0.05, 'terminal t½ 49.3 h');
  near(Math.LN2 / p.ka, 0.686, 0.001, 'absorption t½');
  near(p.lagFixed, 0.41, 1e-12);
});

t('V2: the paper’s printed whole-blood parameters follow from the plasma ones (÷ 1 + 0.45·418/3.8 = 50.5)', function () {
  var ratio = 1 + 0.45 * K.BMAX / K.KD;
  near(ratio, 50.50, 0.01);
  near(811 / ratio, 16.1, 0.06, 'CLwb/F 16.1 L/h (Table 2)'); near(6290 / ratio, 125, 0.5, 'V1 125 L');
  near(1200 / ratio, 23.8, 0.1, 'Q 23.8 L/h'); near(32100 / ratio, 636, 1, 'V2 636 L');
  near(811 / (1 + 0.33 * K.BMAX / K.KD), 21.7, 0.1, 'CLwb at haematocrit 0.33 = 21.7 L/h (Discussion)');
});

t('V3: Figure S1 — a plasma concentration of 0.30 µg/L reads 14.06 / 10.39 / 6.42 µg/L in whole blood at haematocrit 0.45 / 0.33 / 0.20', function () {
  near(T.toObs(0.30, 0.45), 14.06, 0.01); near(T.toObs(0.30, 0.33), 10.39, 0.01); near(T.toObs(0.30, 0.20), 6.42, 0.01);
  near(T.toObs(0.30, 0.20) * 0.45 / 0.20, 14.44, 0.01, 'standardised to 0.45: the dashed line of Figure S1 (≈14)');
});

t('V4: fat-free mass (Janmahasatian), both sexes', function () {
  near(T.ffmOf(80, 175, true), 60.18, 0.02); near(T.ffmOf(70, 165, false), 43.12, 0.05);
  near(T.ffmOf(82, 173, true), 60.3, 0.1, 'the model cohort’s mean man');
});

t('V5: covariate effects — prednisolone Emax, CYP3A5 on CL and F; Equation S1 transcription', function () {
  near(T.predEffect(0), 1, 1e-12); near(T.predEffect(20), 1 - 0.67 * 20 / 55, 1e-12); near(T.predEffect(35), 1 - 0.335, 1e-12);
  var ex = Object.assign({}, EX60, { expr: true, cyp3a5: 'expresser' });
  near(P([0, 0, 0], ex).cl / P().cl, 1.30, 1e-9, 'CL ×1.30 in expressers');
  near(P([0, 0, 0], ex).fBase, 0.82, 1e-12, 'F ×0.82 in expressers');
  near(P().fBase, 1, 1e-12);
  // Appendix S1: CLwb,HCT45/F = 16.1 (FFM/60)^0.75 [1.30] / ([1 − 0.67 Pred/(35+Pred)] [0.82]) — against the model: CLp/F_rel / 50.5
  var ffm = 50;
  var exS = Object.assign({}, EX60, { ffm: ffm, expr: true, pred: 10 });
  var p = P([0, 0, 0], exS);
  var cl_over_f = p.cl / (T.predEffect(10) * p.fBase) / (1 + 0.45 * K.BMAX / K.KD);
  var eqS1 = 16.1 * Math.pow(ffm / 60, 0.75) * 1.30 / ((1 - 0.67 * 10 / 45) * 0.82);
  near(cl_over_f / eqS1, 1, 0.005, 'the app’s apparent clearance equals Equation S1 (rounding of 16.1)');
});

t('V6: plasma steady-state AUC = F·Dose/CL exactly, whatever ka, the lag or an occasion effect on ka', function () {
  var D = 3000, F = T.predEffect(20), tEnd = 100;
  [[0, 0], [0.7, 0], [0, -1.5], [0, 1.2]].forEach(function (c) {
    var ex = Object.assign({}, EX60, { nOcc: 1, occDays: [4] });
    var p = M.indivParams(80, null, null, ex, [0, 0, 0, 0, c[1]], 'tac');
    var g = grid(tEnd, 12, 200), s = M.simulate([], g, p, { ss: { amt: D, every: 12, tEnd: tEnd, pred: 20 } });
    near(trapz(g, s.c), F * D / p.cl, F * D / p.cl * 2e-4, 'AUC12 = F·D/CL (ka effect ' + c[1] + ')');
  });
  // occasion effect on F scales the delta dose only: with κF the AUC of an explicit dose scales by e^κF
  var ex1 = Object.assign({}, EX60, { nOcc: 1, occDays: [0] });
  var pk = M.indivParams(80, null, null, ex1, [0, 0, 0, Math.log(1.5), 0], 'tac');
  var gs = grid(0, 1500, 4), single = M.simulate([{ t: 0, amt: 1000, pred: 20, occIdx: 0 }], gs, pk, {});
  near(trapz(gs, single.c), 1.5 * T.predEffect(20) * 1000 / pk.cl, 1.5 * T.predEffect(20) * 1000 / pk.cl * 1e-3, 'AUC(0–∞) of one dose = e^κF·F·D/CL');
});

t('V7: whole-blood steady-state anchors (3 mg q12h, prednisolone 20, haematocrit 0.33, typical patient)', function () {
  var p = P(), g = grid(0, 12, 4);
  var s = M.simulate([], g, p, { ss: { amt: 3000, every: 12, tEnd: 0, pred: 20 } });
  var wb = s.c.map(function (c) { return T.toObs(c, 0.33); });
  near(trapz(g, wb), 98.0, 0.5, 'AUC 98.0 µg·h/L'); near(wb[wb.length - 1], 5.45, 0.03, 'trough 5.45 µg/L');
  near(Math.max.apply(null, wb), 12.2, 0.15, 'Cmax 12.2');
  // prednisolone 5 mg, haematocrit 0.40, expresser: 91.5 / 4.51
  var ex = Object.assign({}, EX60, { expr: true, pred: 5 });
  var p2 = P([0, 0, 0], ex), s2 = M.simulate([], g, p2, { ss: { amt: 3000, every: 12, tEnd: 0, pred: 5 } });
  var wb2 = s2.c.map(function (c) { return T.toObs(c, 0.40); });
  near(trapz(g, wb2), 91.5, 0.5); near(wb2[wb2.length - 1], 4.51, 0.03);
  // the linearised model would be 6.5 % higher — the non-linear binding is real
  near(98.0 / 104.4, 0.939, 0.002);
});

t('V8: the 4-points-per-hour grid integrates the whole-blood AUC to better than 0.1 %', function () {
  var p = P(), ss = { ss: { amt: 3000, every: 12, tEnd: 0, pred: 20 } };
  function auc(pph) { var g = grid(0, 12, pph), s = M.simulate([], g, p, ss); return trapz(g, s.c.map(function (c) { return T.toObs(c, 0.33); })); }
  near(auc(4) / auc(400), 1, 0.001, 'coarse vs very fine grid');
});

t('V9: the closed form equals an independent RK4 solution — per-dose F, per-dose ka, lag, occasions', function () {
  var ex = Object.assign({}, EX60, { nOcc: 2, occDays: [0, 1] });
  var eta = [0.2, -0.1, 0.15, 0.3, -0.8, -0.2, 0.9];
  var p = M.indivParams(80, null, null, ex, eta, 'tac');
  var doses = [], rk = [];
  for (var k = 0; k < 8; k++) {
    var tt = k * 12, occ = k < 2 ? 0 : (k < 4 ? 1 : -1), pred = k < 5 ? 20 : 10;
    doses.push({ t: tt, amt: 3000, pred: pred, occIdx: occ });
    var kf = occ >= 0 ? Math.exp(eta[3 + 2 * occ]) : 1, kk = occ >= 0 ? Math.exp(eta[4 + 2 * occ]) : 1;
    rk.push({ t: tt, a: 3000 * T.predEffect(pred) * kf, ka: p.ka * kk });
  }
  var times = [0, 0.3, 0.41, 1, 2.5, 6, 11.9, 12, 13, 25, 40, 70, 95];
  var cf = M.simulate(doses, times, p, {}).c, ode = rk4Plasma(p, rk, times);
  for (var i = 0; i < times.length; i++) near(cf[i], ode[i], Math.max(1e-6, Math.abs(ode[i]) * 2e-4), 'plasma C at t = ' + times[i]);
});

t('V10: prior draws reproduce the published correlations (CL–V1 0.43, CL–Q 0.62) and the CVs', function () {
  var om = M.omegaFull('tac', null, EX60);
  var d = B.priorDraws(60000, { vars: om.vars, cov: om.cov, dims: 3 }, B.mulberry32(7));
  function col(i) { return d.map(function (v) { return v[i]; }); }
  function mean(a) { return a.reduce(function (s, x) { return s + x; }, 0) / a.length; }
  function cor(a, b) { var ma = mean(a), mb = mean(b), sab = 0, saa = 0, sbb = 0; for (var i = 0; i < a.length; i++) { sab += (a[i] - ma) * (b[i] - mb); saa += (a[i] - ma) * (a[i] - ma); sbb += (b[i] - mb) * (b[i] - mb); } return sab / Math.sqrt(saa * sbb); }
  near(cor(col(0), col(1)), 0.43, 0.02); near(cor(col(0), col(2)), 0.62, 0.02); near(cor(col(1), col(2)), 0.43 * 0.62, 0.02);
  near(Math.sqrt(om.vars[0]), 0.40, 1e-12, 'CL CV 40 %'); near(Math.sqrt(om.vars[1]), 0.54, 1e-12); near(Math.sqrt(om.vars[2]), 0.63, 1e-12);
  var ex2 = Object.assign({}, EX60, { nOcc: 2, occDays: [0, 1] });
  var v2 = M.omegaVars('tac', null, ex2);
  eq(v2.length, 7); near(v2[3], 0.0529, 1e-9, 'BOV F 23 %'); near(v2[4], 1.44, 1e-9, 'BOV ka 120 %');
  // the quadratic form uses the full matrix: a correlated direction is cheaper than an anti-correlated one
  var om2 = { vars: om.vars, cov: om.cov };
  truthy(B.omegaQuadVec(om2, [0.4, 0.54, 0]) < B.omegaQuadVec(om2, [0.4, -0.54, 0]), 'positive CL–V1 correlation: moving together costs less');
});

t('V11: occasions — a pre-dose sample belongs to the previous dose; κ is per sampled day; the steady-state delta equals an explicit history', function () {
  var base = { extra: { sex: 'm', ht: 175, pred: '10', hct: '0.33', assay: 'lcms' }, wt: 80 };
  var d0 = 24 * 10 + 8;   // 08:00, day 10
  var doses = [{ t: d0 - 12, amt: 3000 }, { t: d0, amt: 3000 }, { t: d0 + 12, amt: 3000 }];
  var pr = T.prepare({ extra: base.extra, wt: 80, doses: doses, obs: [{ t: d0, c: 4, hct: 0.33 }, { t: d0 + 2, c: 9, hct: 0.33 }], steadyState: false });
  eq(pr.extra.nOcc, 2, 'the trough at the dose instant → previous dose (day 9); the 2-h sample → day 10');
  eq(pr.extra.occDays.join(','), '9,10');
  eq(pr.doses.map(function (d) { return d.occIdx; }).join(','), '0,1,1', 'doses: day 9 → κ0; both day-10 doses (08:00, 20:00) → κ1');
  eq(T.prepare({ extra: base.extra, wt: 80, doses: doses, obs: [{ t: d0 + 2, c: 9, hct: 0.33 }], steadyState: false }).doses.map(function (d) { return d.occIdx; }).join(','), '-1,0,0');
  // steady-state delta: train(κ=0) + delta == explicit long history carrying κ on the sampled day
  var ex = Object.assign({}, EX60, { nOcc: 1, occDays: [10] });
  var p = M.indivParams(80, null, null, ex, [0.1, 0.0, 0.1, 0.4, -0.5], 'tac');
  var tEnd = 24 * 10 + 20, hist = [], deltas = [];
  for (var k = 59; k >= 0; k--) {
    var tt = tEnd - 12 * k, occ = Math.floor(tt / 24) === 10 ? 0 : -1;
    hist.push({ t: tt, amt: 3000, pred: 20, occIdx: occ });
    if (occ >= 0) deltas.push({ t: tt, amt: 3000, pred: 20, occIdx: 0, delta: true });
  }
  var times = [tEnd + 1, tEnd + 3, tEnd + 11];
  var a = M.simulate(hist, times, p, {}).c;
  var b = M.simulate(deltas, times, p, { ss: { amt: 3000, every: 12, tEnd: tEnd, pred: 20 } }).c;
  for (var i = 0; i < times.length; i++) near(b[i], a[i], a[i] * 2e-3, 'delta route reproduces the explicit history (sample ' + i + ')');
});

t('V11b: prepare() flags exactly the doses of sampled days as steady-state deltas — and only in steady-state mode', function () {
  var ex = { sex: 'm', ht: 175, pred: '10', hct: '0.33', assay: 'lcms' }, tEnd = 24 * 30 + 8;
  var hist = M.ssHistory({ amt: 3000, intervalHours: 12, tEnd: tEnd, n: 30, route: 'oral' });
  var obs = [{ t: tEnd + 1, c: 9, hct: 0.33 }];
  var ss = T.prepare({ extra: ex, wt: 80, doses: hist, obs: obs, steadyState: true });
  var flagged = ss.doses.filter(function (d) { return d.delta; });
  truthy(flagged.length >= 1, 'the sampled day’s doses are deltas');
  eq(flagged.length, ss.doses.filter(function (d) { return d.occIdx >= 0; }).length, 'deltas = doses that carry a κ');
  truthy(flagged.every(function (d) { return Math.floor(d.t / 24) === 30; }), 'only the sampled day');
  truthy(ss.doses.length - flagged.length >= 25, 'all other doses are left to the endless train');
  var full = T.prepare({ extra: ex, wt: 80, doses: hist, obs: obs, steadyState: false });
  eq(full.doses.filter(function (d) { return d.delta; }).length, 0, 'a typed history is explicit: no deltas');
});

t('layout: every sampled day gets κF and κka (a 12-h trough still senses the tail of absorption — calibration record); at most 12 days; iterations scale with dimension', function () {
  var ex = { sex: 'm', ht: 175, pred: '10', hct: '0.33', assay: 'lcms' }, d0 = 24 * 30 + 8, doses = [];
  for (var k = 0; k < 40; k++) doses.push({ t: d0 - 24 * 15 + 12 * k, amt: 3000 });
  var pr = function (obs) { return T.prepare({ extra: ex, wt: 80, doses: doses, obs: obs, steadyState: false }); };
  var tr = pr([{ t: d0 - 24 * 3 + 12.0, c: 4, hct: 0.33 }]);    // a trough, 12 h after a dose
  eq(M.etaNamesFor('tac', null, tr.extra).join(','), 'CL,V1,Q,KF0,KKA0', 'a trough-only day carries κka too');
  var many = []; for (var j = 0; j < 14; j++) many.push({ t: d0 - 24 * j - 24 + 12, c: 5, hct: 0.33 });
  var pm = pr(many);
  eq(pm.extra.nOcc, 12, 'capped at the 12 most recent days');
  eq(M.etaNamesFor('tac', null, pm.extra).length, 3 + 2 * 12);
  eq(M.omegaVars('tac', null, tr.extra).length, 5, 'Ω follows the layout (CL, V1, Q, κF, κka)');
  eq(S.mcmcIters(5), 800000); eq(S.mcmcIters(7), 800000); truthy(S.mcmcIters(13) > S.mcmcIters(7) && S.mcmcIters(27) > S.mcmcIters(13), 'more iterations for higher-dimensional fits');
});

t('V12/V18: haematocrit correction — one plasma curve, two haematocrits; corrected = actual at 0.35; within 2.5 % of the proportional formula', function () {
  var p = P(), g = grid(0, 12, 4), s = M.simulate([], g, p, { ss: { amt: 3000, every: 12, tEnd: 0, pred: 20 } });
  function auc(hct) { return trapz(g, s.c.map(function (c) { return T.toObs(c, hct); })); }
  near(auc(0.35), 103.8, 0.3, 'AUC at the reference haematocrit');
  near(T.toObs(s.c[48], 0.35), 5.77, 0.02);
  [0.20, 0.25, 0.33, 0.40, 0.45, 0.50].forEach(function (hct) {
    var prop = auc(hct) * 0.35 / hct;
    near(prop / auc(0.35), 1, 0.025, 'proportional formula within 2.5 % at haematocrit ' + hct);
  });
  near(auc(0.25), 75.0, 0.4, 'worked example: actual AUC at 0.25'); near(auc(0.40), 118.2, 0.5);
  truthy(auc(0.25) < auc(0.33) && auc(0.33) < auc(0.40), 'actual whole-blood AUC rises with haematocrit');
});

t('V20: assay — CMIA 10 → 8.19; the conversion is one affine map and its inverse; LC-MS/MS is the identity', function () {
  near(T.toModel(10, 'cmia'), 8.19, 1e-12); near(T.fromModel(T.toModel(7.3, 'cmia'), 'cmia'), 7.3, 1e-12);
  near(T.toModel(7.3, 'lcms'), 7.3, 0); near(T.fromModel(7.3, 'lcms'), 7.3, 0);
  near(T.fromModelAuc(T.toModel(10, 'cmia') * 12, 12, 'cmia'), 120, 1e-9, 'a constant CMIA level of 10 over 12 h has AUC 120');
  truthy(T.assays.cmia && !T.assays.meia && !T.assays.emit, 'only the assays the source gives a conversion for');
});

t('ingestion: percentages, missing assay, sex, height and prednisolone are refused — nothing is guessed', function () {
  var ok = { sex: 'm', ht: 175, pred: 10, hct: 0.33, assay: 'lcms' };
  throws(function () { T.normExtra(Object.assign({}, ok, { hct: 33 }), 80); }, 'L/L', 'haematocrit 33 is a percentage');
  throws(function () { T.normExtra(Object.assign({}, ok, { hct: 0.05 }), 80); }, 'between 0.10 and 0.65');
  throws(function () { T.normExtra(Object.assign({}, ok, { sex: '' }), 80); }, 'sex, weight and height');
  throws(function () { T.normExtra(Object.assign({}, ok, { ht: '' }), 80); }, 'sex, weight and height');
  throws(function () { T.normExtra(Object.assign({}, ok, { pred: '' }), 80); }, 'prednisolone');
  throws(function () { T.prepare({ extra: Object.assign({}, ok, { assay: '' }), wt: 80, doses: [{ t: 0, amt: 3000 }], obs: [{ t: 1, c: 5, hct: 0.33 }] }); }, 'Choose the assay');
  throws(function () { T.prepare({ extra: ok, wt: 80, doses: [{ t: 0, amt: 3000 }], obs: [{ t: 1, c: 5, hct: 33 }] }); }, 'L/L');
  eq(T.normExtra(Object.assign({}, ok, { cyp3a5: 'unknown' }), 80).expr, false, 'unknown genotype = non-expresser (owner decision D4)');
  eq(T.normExtra(Object.assign({}, ok, { cyp3a5: '' }), 80).expr, false);
  eq(T.normExtra(Object.assign({}, ok, { cyp3a5: 'expresser' }), 80).expr, true);
  near(M.toEngineAmt('tac', 3), 3000, 0, 'mg → µg at the single conversion point');
});

t('single conversion points: mg→µg and the immunoassay constants live in src/tacrolimus.js only', function () {
  ['model.js', 'bayes.js', 'ui.js', 'diagnostics.js', 'chart.js', 'texts_tac.js'].forEach(function (f) {
    var src = fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8');
    falsy(/\*\s*1000\b(?!\d)/.test(src.replace(/3600000/g, '')), f + ' must not convert mg to µg');
    falsy(/\b0\.80\b|\b0\.19\b/.test(src.replace(/\/\*[\s\S]*?\*\//g, '')), f + ' must not carry the immunoassay conversion constants');
  });
});

async function fitCase(over) {
  var tEnd = 24 * 40 + 8;
  var ex = { sex: 'm', ht: 175, pred: '20', hct: '0.33', assay: 'lcms', cyp3a5: 'unknown' };
  var hist = M.ssHistory({ amt: 3000, intervalHours: 12, tEnd: tEnd, n: 30, route: 'oral' });
  var p = M.indivParams(80, null, null, T.normExtra(ex, 80), [0.3, -0.2, 0.1], 'tac');
  var s1 = M.simulate([], [tEnd], p, { ss: { amt: 3000, every: 12, tEnd: tEnd, pred: 20 } }).c[0];
  var s2 = M.simulate([], [tEnd + 1, tEnd + 3], p, { ss: { amt: 3000, every: 12, tEnd: tEnd, pred: 20 } }).c;
  var hct = over && over.hct != null ? over.hct : 0.33;
  var wb = function (c) { return T.toObs(c, hct); };
  var obs = [{ t: tEnd, c: wb(s1), hct: hct }, { t: tEnd + 1, c: wb(s2[0]), hct: hct }, { t: tEnd + 3, c: wb(s2[1]), hct: hct }];
  var input = Object.assign({ drug: 'tac', wt: 80, extra: ex, doses: hist, steadyState: true, obs: obs, intervalHours: 12, winLo: null, winHi: null, seed: 1, mcmcIters: 80000 }, over || {});
  if (over && over.hct != null) delete input.hct;
  return { fit: await B.runFit(input, null), input: input, tEnd: tEnd, truthP: p };
}

t('engine: a steady-state fit runs, converges, reports AUC and trough both actual and corrected, and no window means no probabilities', async function () {
  var r = await fitCase();
  var f = r.fit;
  truthy(f.convergence.ok, 'sampler converged (R̂ < 1.01, ESS ≥ 400)');
  truthy(f.auc.median > 40 && f.auc.median < 150, 'AUC in a physiological range: ' + f.auc.median);
  truthy(f.auc.p5 < f.auc.median && f.auc.median < f.auc.p95);
  truthy(isFinite(f.aucCorr.median) && isFinite(f.troughCorr.median), 'corrected companions exist');
  near(f.aucCorr.median / f.auc.median, (1 + 0.35 * 418 / 3.8) / (1 + 0.33 * 418 / 3.8), 0.06, 'corrected/actual ≈ the haematocrit ratio');
  eq(f.windowSet, false); truthy(isNaN(f.auc.pInWindow) && isNaN(f.auc.pAboveLower) && isNaN(f.auc.pBelowUpper), 'no window: no probabilities');
  eq(f.troughWin.set, false); truthy(isNaN(f.trough.pInWindow));
  eq(f.hctRef, 0.35); near(f.hctReport, 0.33, 1e-12);
  eq(f.nOccasions, 2); eq(f.etaNames.join(','), 'CL,V1,Q,KF0,KKA0,KF1,KKA1');
  eq(f.warnShortHistory, false, 'the reported value is steady state by construction');
});

t('engine: windows — both set gives three probabilities that sum correctly, for AUC and for trough, actual and corrected', async function () {
  var r = await fitCase({ winLo: 60, winHi: 110, troughLo: 3, troughHi: 7 });
  var f = r.fit;
  eq(f.windowSet, true); eq(f.troughWin.set, true);
  [f.auc, f.aucCorr, f.trough, f.troughCorr].forEach(function (x, i) {
    truthy(isFinite(x.pInWindow) && x.pInWindow >= 0 && x.pInWindow <= 1, 'pInWindow #' + i);
    near(x.pAboveLower + x.pBelowUpper - 1, x.pInWindow, 0.002, 'P(>lo) + P(<hi) − 1 = P(in) #' + i);
  });
});

t('engine: reproducible — the same seed gives the same posterior', async function () {
  var a = (await fitCase({ mcmcIters: 20000 })).fit, b = (await fitCase({ mcmcIters: 20000 })).fit;
  eq(a.auc.median, b.auc.median); eq(a.trough.p95, b.trough.p95);
});

t('V19: haematocrit invariance end to end — samples generated from one plasma curve at 0.25 and at 0.40: the corrected exposure agrees, the actual one differs', async function () {
  var lo = (await fitCase({ hct: 0.25, extra: { sex: 'm', ht: 175, pred: '20', hct: '0.25', assay: 'lcms', cyp3a5: 'unknown' } })).fit;
  var hi = (await fitCase({ hct: 0.40, extra: { sex: 'm', ht: 175, pred: '20', hct: '0.40', assay: 'lcms', cyp3a5: 'unknown' } })).fit;
  near(lo.aucCorr.median / hi.aucCorr.median, 1, 0.03, 'corrected AUC (0.35) agrees');
  near(lo.troughCorr.median / hi.troughCorr.median, 1, 0.03, 'corrected trough agrees');
  near(hi.auc.median / lo.auc.median, 1.58, 0.1, 'actual AUC at 0.40 vs 0.25 differs by the red-cell binding ratio');
});

t('V20: assay end to end — the same blood entered as CMIA values gives the same result, converted back to the CMIA scale', async function () {
  var lc = (await fitCase({ mcmcIters: 40000 }));
  var cm = await B.runFit(Object.assign({}, lc.input, {
    extra: Object.assign({}, lc.input.extra, { assay: 'cmia' }),
    obs: lc.input.obs.map(function (o) { return { t: o.t, c: (o.c - 0.19) / 0.80, hct: o.hct }; })
  }), null);
  near(cm.auc.median, (lc.fit.auc.median - 0.19 * 12) / 0.80, 1e-6, 'AUC on the CMIA scale');
  near(cm.trough.median, (lc.fit.trough.median - 0.19) / 0.80, 1e-6, 'trough on the CMIA scale');
  near(cm.obsData[1].c, (lc.input.obs[1].c - 0.19) / 0.80, 1e-9, 'samples are shown as entered');
  eq(cm.assay, 'cmia');
});

t('windows: a window is judged on the assay scale the user works in (CMIA window on CMIA values), for AUC and trough, actual and corrected', async function () {
  var lc = await fitCase({ mcmcIters: 40000 });
  var base = Object.assign({}, lc.input, {
    extra: Object.assign({}, lc.input.extra, { assay: 'cmia' }),
    obs: lc.input.obs.map(function (o) { return { t: o.t, c: (o.c - 0.19) / 0.80, hct: o.hct }; })
  });
  var first = await B.runFit(base, null);                       // same seed → the same draws on the second run
  var second = await B.runFit(Object.assign({}, base, {
    winLo: first.auc.median, winHi: first.auc.median * 100, troughLo: first.trough.median, troughHi: first.trough.median * 100
  }), null);
  near(second.auc.pAboveLower, 0.5, 0.01, 'P(AUC above its own displayed median) is one half: the window is on the displayed (CMIA) scale');
  near(second.trough.pAboveLower, 0.5, 0.01, 'same for the trough');
  var third = await B.runFit(Object.assign({}, base, {
    winLo: first.aucCorr.median, winHi: first.aucCorr.median * 100, troughLo: first.troughCorr.median, troughHi: first.troughCorr.median * 100
  }), null);
  near(third.aucCorr.pAboveLower, 0.5, 0.01, 'corrected AUC: same window logic');
  near(third.troughCorr.pAboveLower, 0.5, 0.01, 'corrected trough: same window logic');
});

t('engine: steady-state mode and an explicit long history give the same reported exposure', async function () {
  var a = await fitCase({ mcmcIters: 80000 });
  var hist = []; for (var k = 59; k >= 0; k--) hist.push({ t: a.tEnd - 12 * k, amt: 3000, route: 'oral' });
  var b = await B.runFit(Object.assign({}, a.input, { doses: hist, steadyState: false }), null);
  near(b.auc.median / a.fit.auc.median, 1, 0.03, 'AUC');
  near(b.trough.median / a.fit.trough.median, 1, 0.03, 'trough');
});

t('engine: a population forecast (no samples) works and carries only the typical-patient parameters', async function () {
  var ex = { sex: 'f', ht: 165, pred: '10', hct: '0.30', assay: 'lcms', cyp3a5: 'unknown' };
  var f = await B.runFit({ drug: 'tac', wt: 70, extra: ex, doses: M.ssHistory({ amt: 3000, intervalHours: 12, tEnd: 1000, n: 30, route: 'oral' }), steadyState: true, obs: [], intervalHours: 12, seed: 3, priorDraws: 4000 }, null);
  eq(f.isPopulationForecast, true); eq(f.etaNames.join(','), 'CL,V1,Q'); eq(f.hasObs, false);
  truthy(f.auc.p5 < f.auc.median && f.auc.median < f.auc.p95);
});

t('CYP3A5: an expresser has a lower exposure at the same dose; unknown behaves exactly as a non-expresser', async function () {
  async function run(g) {
    var ex = { sex: 'm', ht: 175, pred: '10', hct: '0.33', assay: 'lcms', cyp3a5: g };
    return B.runFit({ drug: 'tac', wt: 80, extra: ex, doses: M.ssHistory({ amt: 3000, intervalHours: 12, tEnd: 1000, n: 30, route: 'oral' }), steadyState: true, obs: [], intervalHours: 12, seed: 3, priorDraws: 8000 }, null);
  }
  var u = await run('unknown'), n = await run('nonexpresser'), e = await run('expresser');
  eq(u.auc.median, n.auc.median, 'unknown ≡ non-expresser (D4)');
  near(e.auc.median / n.auc.median, 0.82 / 1.30, 0.04, 'expresser AUC ≈ F/CL ratio 0.63');
});

t('explorer: tacrolimus — steady state of a candidate dose; whole blood is less than proportional; no dose advice in the result', async function () {
  var a = await fitCase({ mcmcIters: 40000 });
  var rows = await B.doseScan({ draws: a.fit.draws, drug: 'tac', wt: 80, extra: a.fit.extra, tEnd: a.tEnd, amounts: [3000, 6000], intervalHours: 12, pred: 20, hct: 0.33, assay: 'lcms', winLo: 80, winHi: 160, troughLo: 4, troughHi: 8 });
  eq(rows.length, 2);
  var r = rows[1].auc.median / rows[0].auc.median;
  truthy(r > 1.5 && r < 1.98, 'doubling the dose gives less than double the whole-blood AUC (saturable red-cell binding): ' + r.toFixed(3));
  near(rows[0].auc.median, a.fit.auc.median, a.fit.auc.median * 0.03, 'the candidate equal to the current dose reproduces the fitted exposure');
  truthy(isFinite(rows[0].aucCorr.median) && isFinite(rows[0].troughCorr.median) && isFinite(rows[0].auc.pInWindow) && isFinite(rows[0].trough.pInWindow));
  falsy(Object.keys(rows[0]).some(function (k) { return /recommend|suggest|optimal|target dose/i.test(k); }), 'no advisory fields');
});

t('MAP: BFGS and Nelder–Mead agree on the same tacrolimus posterior mode', function () {
  var tEnd = 1000, ex = { sex: 'm', ht: 175, pred: '20', hct: '0.33', assay: 'lcms', cyp3a5: 'unknown' };
  var pr = T.prepare({ extra: ex, wt: 80, doses: M.ssHistory({ amt: 3000, intervalHours: 12, tEnd: tEnd, n: 30 }), obs: [{ t: tEnd, c: 3.4, hct: 0.33 }, { t: tEnd + 2, c: 10.5, hct: 0.33 }], steadyState: true });
  var om = M.omegaFull('tac', null, pr.extra);
  var ofv = B.makeOfv({ wt: 80, drug: 'tac', doses: pr.doses.filter(function (d) { return d.delta; }), ss: { amt: 3000, every: 12, tEnd: tEnd, pred: 20 }, obs: pr.obs, omega: { vars: om.vars, cov: om.cov, dims: om.vars.length }, extra: pr.extra, form: null });
  var a = B.mapBFGS(ofv, om.vars);
  var step = om.vars.map(function (v) { return Math.min(0.9, Math.max(0.15, 0.8 * Math.sqrt(v))); });
  var b = B.mapEstimate(ofv, step);
  near(a.f, b.f, 0.02, 'same optimum value (BFGS ' + a.f.toFixed(4) + ', NM ' + b.f.toFixed(4) + ')');
  truthy(a.f <= b.f + 1e-6, 'BFGS is at least as good');
});

t('drug switch: the therapeutic windows are reset (an MPA window must never carry over to tacrolimus) — guarded structurally; exercised in the browser run', function () {
  var ui = fs.readFileSync(path.join(__dirname, '..', 'src', 'ui.js'), 'utf8');
  var m = ui.match(/\$\('pt-drug'\)\.addEventListener\('change', function \(\) \{([\s\S]*?)\n    \}\);/);
  truthy(m, 'drug change handler found');
  truthy(/resetWindows\(\)/.test(m[1]), 'the handler clears the windows');
  truthy(m[1].indexOf('resetWindows()') < m[1].indexOf('M.select('), 'before the new drug’s defaults are filled in');
  truthy(/function resetWindows\(\) \{[^}]*pt-winlo[^}]*pt-winhi[^}]*pt-tlo[^}]*pt-thi/.test(ui), 'all four window fields');
});

t('NONMEM: the tacrolimus structural model reproduces NONMEM’s whole-blood predictions (steady state and histories; FFM, CYP3A5, per-dose prednisolone, κ on F and ka, haematocrit)', function () {
  var rows = fs.readFileSync(path.join(__dirname, 'nonmem_tac_struct.csv'), 'utf8').trim().split('\n').slice(1).map(function (l) { return l.split(',').map(Number); });
  var tab = fs.readFileSync(path.join(__dirname, 'nonmem_tac_struct.tab'), 'utf8').trim().split('\n').slice(2).map(function (l) { return l.trim().split(/\s+/).map(Number); });
  var ids = {}; rows.forEach(function (r) { (ids[r[0]] = ids[r[0]] || []).push(r); });
  var n = 0, worst = 0, nSS = 0, nHist = 0;
  Object.keys(ids).forEach(function (id) {
    var rs = ids[id], doses = rs.filter(function (r) { return r[3] === 1; }), obs = rs.filter(function (r) { return r[3] === 0; });
    var f = rs[0], ffm = f[7], expr = f[8], hct = f[10], eta = [f[11], f[12], f[13]], kKa = f[15];
    var isSS = doses.length === 1 && doses[0][5] === 1, nOcc = isSS ? 1 : 4, etaAll = eta.slice(), k;
    for (k = 0; k < nOcc; k++) etaAll.push(isSS ? 0 : doses[2 * k][14], kKa);
    var ex = Object.assign({}, T.normExtra({ sex: 'm', ht: 175, pred: 10, hct: hct, assay: 'lcms', cyp3a5: expr ? 'expresser' : 'nonexpresser' }, 70), { wt: 70, ffm: ffm, nOcc: nOcc, occDays: isSS ? [0] : [0, 1, 2, 3] });
    var p = M.indivParams(70, null, null, ex, etaAll, 'tac');
    var times = obs.map(function (o) { return o[1]; }), c;
    if (isSS) {
      nSS++;
      c = M.simulate([], times.map(function (t) { return 1000 + t; }), p, { ss: { amt: doses[0][2], every: 12, tEnd: 1000, pred: doses[0][9] } }).c;
    } else {
      nHist++;
      c = M.simulate(doses.map(function (d, i) { return { t: d[1], amt: d[2], pred: d[9], occIdx: Math.floor(i / 2) }; }), times, p, {}).c;
    }
    var peak = Math.max.apply(null, c.map(function (v) { return T.toObs(v, hct); }));
    times.forEach(function (t, i) {
      var row = tab.find(function (r) { return r[0] === +id && Math.abs(r[1] - t) < 1e-9; });
      truthy(row, 'NONMEM row for ID ' + id + ' t=' + t);
      var a = T.toObs(c[i], hct), rel = Math.abs(a - row[2]) / Math.max(Math.abs(row[2]), 1e-3 * peak);
      n++; if (rel > worst) worst = rel;
    });
  });
  truthy(nSS >= 20 && nHist >= 12 && n >= 500, 'scenario coverage: ' + nSS + ' steady-state, ' + nHist + ' history subjects, ' + n + ' predictions');
  truthy(worst < 1e-6, 'max relative difference to NONMEM ' + worst.toExponential(2));
});

t('NONMEM: the app’s MAP is never worse than NONMEM’s POSTHOC EBE in the same objective, and the estimates agree (30 patients, trough + 1 h + 3 h, κ on two days)', function () {
  var fx = JSON.parse(fs.readFileSync(path.join(__dirname, 'nonmem_tac_posthoc.json'), 'utf8'));
  var maxGap = 0, maxEta = 0;
  fx.patients.forEach(function (a) {
    var prep = T.prepare({ extra: a.rawEx, wt: a.wt, doses: a.doses.map(function (d) { return Object.assign({}, d); }), obs: a.obs, steadyState: false });
    var om = M.omegaFull('tac', null, prep.extra);
    var ofv = B.makeOfv({ wt: a.wt, drug: 'tac', doses: prep.doses, ss: null, obs: prep.obs, omega: { vars: om.vars, cov: om.cov, dims: om.vars.length }, extra: prep.extra, form: null });
    var map = B.mapBFGS(ofv, om.vars);
    var gap = map.f - ofv(a.etaNM);                 // > 0 would mean the app is worse than NONMEM
    if (gap > maxGap) maxGap = gap;
    map.x.forEach(function (v, k) { maxEta = Math.max(maxEta, Math.abs(v - a.etaNM[k])); });
  });
  truthy(maxGap < 0.05, 'the app is above NONMEM’s objective by at most ' + maxGap.toExponential(2));
  truthy(maxEta < 0.05, 'largest |η(app) − η(NONMEM)| ' + maxEta.toFixed(3));
});

t('copy: with tacrolimus selected the texts are tacrolimus texts, carry no MPA window and give no dose advice; MPA copy is unchanged', function () {
  require('../src/chart.js'); require('../src/diagnostics.js'); require('../src/texts_tac.js'); require('../src/ui.js');
  var UI = ECU.ui;
  try {
    M.select('tac');
    var texts = { background: UI.backgroundHtml(), start: UI.gettingStartedBodyHtml(), about: UI.aboutHtml() };
    Object.keys(texts).forEach(function (k) {
      var body = k === 'about' ? texts[k].replace(/<h3>Models<\/h3>[\s\S]*?<h3>Version<\/h3>/, '') : texts[k];   // About lists every model's card, MPA's included
      var plain = body.replace(/<[^>]+>/g, ' ');
      falsy(/30\s*[–-]\s*60/.test(plain), k + ': the MPA window 30–60 must not appear in tacrolimus copy');
      falsy(/\b(?:you|clinicians?)\s+(?:should|must)\s+(?:increase|decrease|reduce|raise|give|take|switch)\b/i.test(plain), k + ': no dose instruction');
      falsy(/\b(?:increase|decrease|reduce|raise|lower)\s+the\s+dose\b/i.test(plain), k + ': no dose advice');
      falsy(/mycophenol|MMF|EC-MPS/i.test(plain.replace(/\bwith mycophenolate\b/gi, '')), k + ': no MPA wording outside the model list (mycophenolate as a co-medication, “with mycophenolate”, is allowed)');
    });
    truthy(/haematocrit/i.test(texts.background) && /standard/i.test(texts.background), 'background explains haematocrit and the standard window');
    truthy(/Prolonged-release/.test(texts.about) && /not covered|does not cover/i.test(texts.about), 'About states what is not covered');
    truthy(/Størset/.test(texts.about) && /Emax 67%/.test(texts.about) && /Bmax 418/.test(texts.about), 'the model card carries the parameters from the spec');
    truthy(/does not select or recommend|never recommends/.test(texts.start + texts.about), 'the no-advice statement is present');
  } finally { M.select('mpa'); }
  var mpa = UI.backgroundHtml();
  truthy(/30–60 mg·h\/L/.test(mpa) && /Mycophenolic acid \(MPA\) exposure/.test(mpa), 'MPA background unchanged');
});

t('copy: text shared by all drugs names no drug, is not stale, and a drug without its own text gets neutral text (the next drug, e.g. everolimus)', function () {
  var html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  function el(id, tag) { var m = html.match(new RegExp('<' + tag + '[^>]*id="' + id + '"[^>]*>([\\s\\S]*?)</' + tag + '>')); return m ? m[1].replace(/<[^>]+>/g, ' ') : null; }
  var drugWords = /mycophenol|\bMPA\b|\bMMF\b|EC-MPS|tacrolimus|everolimus/i;
  ['appSub', 'footer'].forEach(function (id) {
    var t = id === 'footer' ? html.match(/<footer class="app">([\s\S]*?)<\/footer>/)[1].replace(/<[^>]+>/g, ' ') : el(id, 'div');
    truthy(t && t.length > 40, id + ' exists');
    falsy(drugWords.test(t), id + ' must not name a drug: ' + t.slice(0, 80));
  });
  var btn = html.match(/<button id="btnBackground" title="([^"]*)">([^<]*)<\/button>/);
  falsy(drugWords.test(btn[1] + btn[2]), 'the background button is neutral until the drug sets its label');
  falsy(/simulated back over a fixed number of intervals/.test(html), 'steady state is exact since 1.1.0; the old sentence is false');
  truthy(/Everything runs locally/.test(html) && /autosave/.test(html), 'the subtitle states where the data stay, including the autosave');
  eq(M.spec('mpa').backgroundLabel, 'Mycophenolic acid background'); eq(S.backgroundLabel, 'Tacrolimus background');
  // a drug that has not been given its own texts must not inherit another drug's
  M.drugs.zzz = Object.assign({}, S, { id: 'zzz', label: 'Test drug', backgroundLabel: undefined });
  try {
    M.select('zzz');
    var how = ECU.ui.drugText('howto'), note = ECU.ui.drugText('chartNote');
    falsy(drugWords.test(how + note), 'generic texts name no drug');
    truthy(/Steady-state exposure/.test(how), 'generic how-to is used');
  } finally { M.select('mpa'); delete M.drugs.zzz; }
  truthy(/Mycophenolic acid|mycophenolic acid/.test(ECU.ui.drugText('howto')) && !/tacrolimus/i.test(ECU.ui.drugText('howto')), 'MPA keeps its own how-to');
});

function nodeWorkerSpawn() {
  var WT = require('worker_threads');
  var src = ECU.parallel.workerSource(['version', 'model', 'tacrolimus', 'bayes'].map(function (f) { return fs.readFileSync(path.join(__dirname, '..', 'src', f + '.js'), 'utf8'); }));
  return { start: function () {
    var w = new WT.Worker(src, { eval: true });
    return { postMessage: function (m) { w.postMessage(m); }, onMessage: function (fn) { w.on('message', fn); }, onError: function (fn) { w.on('error', fn); }, terminate: function () { w.terminate(); } };
  } };
}
async function fitForParallel() {
  var tEnd = 24 * 40 + 8, ex = { sex: 'f', ht: 166, pred: '12', hct: '0.31', assay: 'lcms', cyp3a5: 'unknown' };
  var d = []; for (var k = 0; k < 24; k++) d.push({ t: tEnd - 12 * (23 - k), amt: 3000, route: 'oral' });
  return B.runFit({ drug: 'tac', wt: 66, extra: ex, doses: d, steadyState: false, obs: [{ t: tEnd - 24, c: 5.5, hct: 0.31 }, { t: tEnd, c: 5.0, hct: 0.31 }, { t: tEnd + 2, c: 11, hct: 0.31 }], intervalHours: 12, seed: 9, mcmcIters: 32000 }, null);
}

t('parallel: eight chains on a pool of workers give exactly the draws of the in-process run (the seed belongs to the chain); the workers really run', async function () {
  ECU.parallel.use(null);
  var seq = await fitForParallel();
  eq(ECU.parallel.status(), 'in-process');
  try {
    ECU.parallel.use(nodeWorkerSpawn(), { workers: 4 });
    var par = await fitForParallel();
    eq(ECU.parallel.status(), '4 workers', 'the pool was used, not the fallback');
  } finally { ECU.parallel.use(null); }
  eq(par.nDraws, seq.nDraws); eq(par.acceptance, seq.acceptance);
  eq(par.draws.length, seq.draws.length);
  for (var i = 0; i < seq.draws.length; i += 97) for (var j = 0; j < seq.draws[i].length; j++) eq(par.draws[i][j], seq.draws[i][j], 'draw ' + i + ',' + j);
  eq(par.auc.median, seq.auc.median); eq(par.auc.p5, seq.auc.p5); eq(par.trough.p95, seq.trough.p95); eq(par.aucCorr.median, seq.aucCorr.median);
  eq(par.chainLens.join(','), seq.chainLens.join(','));
});

t('parallel: a worker that cannot start, or one that fails, falls back to the in-process run with the same result', async function () {
  ECU.parallel.use(null);
  var seq = await fitForParallel();
  try {
    ECU.parallel.use({ start: function () { throw new Error('no workers here'); } }, { workers: 4 });
    var a = await fitForParallel();
    eq(ECU.parallel.status(), 'in-process');
    // a worker that starts and then reports an error mid-task
    ECU.parallel.use({ start: function () {
      var cb = {};
      return { postMessage: function (m) { setTimeout(function () { cb.msg({ type: 'error', id: m.id, message: 'boom' }); }, 1); },
        onMessage: function (fn) { cb.msg = fn; }, onError: function () {}, terminate: function () {} };
    } }, { workers: 3 });
    var b = await fitForParallel();
    eq(ECU.parallel.status(), 'in-process');
  } finally { ECU.parallel.use(null); }
  eq(a.auc.median, seq.auc.median); eq(b.auc.median, seq.auc.median); eq(b.trough.p5, seq.trough.p5);
});

t('parallel: workers that start but never answer are abandoned after the watchdog interval and the fit completes in-process with the same result', async function () {
  ECU.parallel.use(null);
  var seq = await fitForParallel();
  try {
    ECU.parallel.use({ start: function () { return { postMessage: function () {}, onMessage: function () {}, onError: function () {}, terminate: function () {} }; } }, { workers: 4, watchdogMs: 150 });
    var t0 = Date.now(), r = await fitForParallel(), ms = Date.now() - t0;
    eq(ECU.parallel.status(), 'in-process');
  } finally { ECU.parallel.use(null); }
  eq(r.auc.median, seq.auc.median); eq(r.trough.median, seq.trough.median);
  truthy(ms < 60000, 'it did not hang');
});

t('chains: the seed belongs to the chain: results do not depend on the order chains run in, and different chains differ', async function () {
  var fit = await fitForParallel();
  var tEnd = 24 * 40 + 8;
  var ctxTask = function (c) { return { ctx: { wt: 66, age: null, renal: null, extra: fit.extra, drug: 'tac', doses: [], ss: null, obs: [], omega: { vars: [0.16, 0.29, 0.4], cov: null, dims: 3 }, rtol: 1e-6, recency: 'off', form: null, mixPrior: null }, x0: [0, 0, 0], cov: [[0.1, 0, 0], [0, 0.1, 0], [0, 0, 0.1]], iters: 400, maxKeep: 20, scale: 1, seed: B.chainSeed(7, c) }; };
  var tasks = [0, 1, 2].map(ctxTask);
  var fwd = await B.sequentialExecutor(tasks);
  var rev = await B.sequentialExecutor(tasks.slice().reverse());
  eq(JSON.stringify(fwd[0].draws), JSON.stringify(rev[2].draws), 'chain 0 is the same whether first or last');
  eq(JSON.stringify(fwd[2].draws), JSON.stringify(rev[0].draws));
  truthy(JSON.stringify(fwd[0].draws) !== JSON.stringify(fwd[1].draws), 'chains are not copies of each other');
  eq(JSON.stringify(await B.sequentialExecutor([JSON.parse(JSON.stringify(tasks[1]))])), JSON.stringify([fwd[1]]), 'a task survives the structured-clone boundary of a worker');
  truthy(B.chainSeed(7, 0) !== B.chainSeed(7, 1) && B.chainSeed(7, 0) !== B.chainSeed(8, 0), 'seeds differ per chain and per fit seed');
});

t('V16b (regression): fixed-seed tacrolimus fits and a dose scan equal the recorded numbers exactly (an optimisation must not move them)', async function () {
  var rec = JSON.parse(fs.readFileSync(path.join(__dirname, 'tac_v121_regression.json'), 'utf8'));
  var ex = { sex: 'm', ht: 175, pred: '10', hct: '0.33', assay: 'lcms', cyp3a5: 'unknown' }, tEnd = 24 * 40 + 8;
  var ss = function () { return M.ssHistory({ amt: 3000, intervalHours: 12, tEnd: tEnd, n: 30 }); };
  var cases = {
    ss_profile3: { drug: 'tac', wt: 80, extra: ex, doses: ss(), steadyState: true, obs: [{ t: tEnd, c: 3.9, hct: 0.33 }, { t: tEnd + 1, c: 9.6, hct: 0.33 }, { t: tEnd + 3, c: 10.4, hct: 0.31 }], intervalHours: 12, winLo: 80, winHi: 150, troughLo: 4, troughHi: 8, seed: 11, mcmcIters: 160000 },
    hist_troughs3: { drug: 'tac', wt: 66, extra: Object.assign({}, ex, { sex: 'f', ht: 164, assay: 'cmia', cyp3a5: 'expresser' }), doses: (function () { var d = []; for (var k = 0; k < 30; k++) d.push({ t: tEnd - 12 * (29 - k), amt: 2500 + 500 * (k % 3 === 0), route: 'oral', pred: k < 10 ? 20 : 10 }); return d; })(), steadyState: false, obs: [2, 1, 0].map(function (k, i) { return { t: tEnd - 24 * k, c: 6 + 0.8 * i, hct: 0.30 + 0.01 * i }; }), intervalHours: 12, seed: 5, mcmcIters: 160000 },
    population: { drug: 'tac', wt: 70, extra: Object.assign({}, ex, { sex: 'f', ht: 165 }), doses: ss(), steadyState: true, obs: [], intervalHours: 12, seed: 3, priorDraws: 3000 }
  };
  var f1 = null;
  for (var k of Object.keys(cases)) {
    var f = await B.runFit(cases[k], null), r = rec[k];
    eq(JSON.stringify([f.auc.p5, f.auc.median, f.auc.p95, f.auc.pInWindow]), JSON.stringify(r.auc), k + ' AUC');
    eq(JSON.stringify([f.trough.p5, f.trough.median, f.trough.p95, f.trough.pInWindow]), JSON.stringify(r.tr), k + ' trough');
    eq(JSON.stringify([f.aucCorr.p5, f.aucCorr.median, f.aucCorr.p95]), JSON.stringify(r.aucC), k + ' corrected AUC');
    eq(f.acceptance, r.acc, k + ' acceptance'); eq(f.nDraws, r.nDraws);
    if (r.mapEta) { eq(JSON.stringify(f.map.eta), JSON.stringify(r.mapEta), k + ' MAP'); eq(f.map.ofv, r.mapOfv); }
    if (k === 'ss_profile3') f1 = f;
  }
  var sc = await B.doseScan({ draws: f1.draws, drug: 'tac', wt: 80, extra: f1.extra, tEnd: tEnd, amounts: [2000, 3000, 4000], intervalHours: 12, pred: 10, hct: 0.31, assay: 'lcms', winLo: 80, winHi: 150, troughLo: 4, troughHi: 8 });
  sc.forEach(function (x, i) { eq(JSON.stringify([x.amt, x.auc.median, x.auc.p5, x.auc.pInWindow, x.trough.median, x.aucCorr.median]), JSON.stringify(rec.scan[i]), 'scan ' + i); });
});

// ---------------------------------------------------------------------------
// Adversarial audit (3 Oct 2026): defects found by hostile input. Each test below failed against the code of the audit start.
// ---------------------------------------------------------------------------
var UI = null;
function ui() { if (!UI) { require('../src/chart.js'); require('../src/diagnostics.js'); require('../src/texts_tac.js'); require('../src/ui.js'); UI = ECU.ui; } return UI; }
function tacInput(over) {
  var tEnd = 24 * 40 + 8;
  return Object.assign({ drug: 'tac', wt: 80, extra: { sex: 'm', ht: '175', pred: '10', hct: '0.33', assay: 'lcms' },
    doses: M.ssHistory({ amt: 3000, intervalHours: 12, tEnd: tEnd, n: 30 }), steadyState: true,
    obs: [{ t: tEnd, c: 4, hct: 0.33 }, { t: tEnd + 2, c: 10, hct: 0.33 }], intervalHours: 12 }, over || {});
}

t('audit/input: concentrations must be above 0 and within the model’s range (−4, 0 and 99 999 µg/L were accepted silently)', function () {
  var tEnd = 24 * 40 + 8;
  [[-4, 'Concentration'], [0, 'Concentration'], [99999, 'Concentration'], [0.01, 'Concentration']].forEach(function (c) {
    var pr = ui().inputProblems(S, tacInput({ obs: [{ t: tEnd, c: c[0], hct: 0.33 }] }), [3], true);
    truthy(pr.some(function (m) { return m.indexOf(c[1]) === 0; }), 'concentration ' + c[0] + ' is refused: ' + JSON.stringify(pr));
  });
  eq(ui().inputProblems(S, tacInput(), [3], true).length, 0, 'a normal case raises nothing');
  var mpa = M.spec('mpa');
  truthy(ui().inputProblems(mpa, { drug: 'mpa', obs: [{ t: 368, c: -1 }], doses: M.ssHistory({ amt: 739, intervalHours: 12, tEnd: 368, n: 30 }), intervalHours: 12, extra: {} }, [1000], true).length > 0, 'MPA too');
});

t('audit/input: a dose outside the model’s range is refused with the unit named (3000 mg tacrolimus passed as "Ready to run")', function () {
  var pr = ui().inputProblems(S, tacInput(), [3000], true);
  truthy(pr.some(function (m) { return /Dose 3000 mg/.test(m) && /mg/.test(m); }), JSON.stringify(pr));
  truthy(ui().inputProblems(S, tacInput(), [0], true).some(function (m) { return /Dose 0 mg/.test(m); }), 'zero dose');
  eq(ui().inputProblems(S, tacInput(), [3, 2.5, 4], true).length, 0);
});

t('audit/input: tacrolimus is twice-daily immediate-release only — a 24 h interval is refused, 11–13 h is fine', function () {
  var tEnd = 24 * 40 + 8;
  var q24 = tacInput({ intervalHours: 24, doses: M.ssHistory({ amt: 3000, intervalHours: 24, tEnd: tEnd, n: 30 }), obs: [{ t: tEnd, c: 4, hct: 0.33 }] });
  var pr = ui().inputProblems(S, q24, [3], true);
  truthy(pr.some(function (m) { return /twice-daily/.test(m) && /24 h/.test(m); }), JSON.stringify(pr));
  [11, 12, 13].forEach(function (h) { eq(ui().inputProblems(S, tacInput({ intervalHours: h, obs: [{ t: 24 * 40 + 8, c: 4, hct: 0.33 }] }), [3], true).length, 0, h + ' h'); });
  eq(M.spec('mpa').intervalRange, undefined, 'MPA has no such restriction (its explorer offers 12 and 24 h)');
});

t('audit/input: height and prednisolone outside the model’s range are refused (a 20 cm patient gave a result)', function () {
  var pr = ui().inputProblems(S, tacInput({ extra: { sex: 'm', ht: '20', pred: '500', hct: '0.33', assay: 'lcms' } }), [3], true);
  truthy(pr.some(function (m) { return /Height 20 cm/.test(m); }), JSON.stringify(pr));
  truthy(pr.some(function (m) { return /Prednisolone 500 mg\/day/.test(m); }), JSON.stringify(pr));
});

t('audit/input: sample timing — a sample after the regimen ended (steady state) or before the first dose is refused', function () {
  var tEnd = 24 * 40 + 8;
  var late = ui().inputProblems(S, tacInput({ obs: [{ t: tEnd + 24 * 21, c: 4, hct: 0.33 }] }), [3], true);
  truthy(late.some(function (m) { return /after the latest dose/.test(m) && /no further doses/.test(m); }), 'steady state: ' + JSON.stringify(late));
  eq(ui().inputProblems(S, tacInput({ obs: [{ t: tEnd + 12.1, c: 4, hct: 0.33 }] }), [3], true).length, 0, 'a trough one interval after the latest dose is the normal case');
  var early = ui().inputProblems(S, tacInput({ steadyState: false, doses: [{ t: tEnd - 24, amt: 3000 }, { t: tEnd - 12, amt: 3000 }], obs: [{ t: tEnd - 1000, c: 4, hct: 0.33 }] }), [3, 3], false);
  truthy(early.some(function (m) { return /before the first dose/.test(m); }), 'full schedule: ' + JSON.stringify(early));
  eq(ui().inputProblems(S, tacInput({ steadyState: false, obs: [{ t: tEnd + 24 * 3, c: 4, hct: 0.33 }] }), [3], false).filter(function (m) { return /latest dose/.test(m); }).length, 0, 'full schedule: a later sample is allowed (the doses are entered explicitly)');
});

t('audit/engine: the engine itself refuses concentrations ≤ 0 and an all-zero dose list with a plain message, for both drugs', async function () {
  var tEnd = 24 * 40 + 8;
  await rejects(B.runFit(Object.assign(tacInput(), { mcmcIters: 2000, obs: [{ t: tEnd, c: -2, hct: 0.33 }] }), null), 'above 0');
  await rejects(B.runFit(Object.assign(tacInput(), { mcmcIters: 2000, obs: [{ t: tEnd, c: 0, hct: 0.33 }] }), null), 'above 0');
  await rejects(B.runFit({ drug: 'mpa', form: 'mmf', wt: 70, doses: M.ssHistory({ amt: 739, intervalHours: 12, tEnd: 368, n: 30 }), steadyState: true, obs: [{ t: 368.5, c: 0 }], intervalHours: 12, winLo: 30, winHi: 60, mcmcIters: 2000 }, null), 'above 0');
  await rejects(B.runFit(Object.assign(tacInput(), { mcmcIters: 2000, doses: M.ssHistory({ amt: 0, intervalHours: 12, tEnd: tEnd, n: 30 }) }), null), 'dose');
});

t('audit/ui: unit headers are not upper-cased (µg/L became ΜG/L, which reads as MG/L; η became Η)', function () {
  var css = fs.readFileSync(path.join(__dirname, '..', 'src', 'app.css'), 'utf8');
  var rules = css.match(/[^{}]*\{[^}]*text-transform:\s*uppercase[^}]*\}/g) || [];
  rules.forEach(function (r) { falsy(/\bth\b/.test(r.split('{')[0]), 'a table-header rule upper-cases text: ' + r.split('{')[0].trim()); });
  // and it is the table headers that carry units and Greek letters
  var src = fs.readFileSync(path.join(__dirname, '..', 'src', 'ui.js'), 'utf8') + fs.readFileSync(path.join(__dirname, '..', 'src', 'diagnostics.js'), 'utf8');
  truthy(/<th[^>]*>[^<]*\(' \+ esc\(UN\(\)\.conc\)|Observed \(' \+ esc\(unitsOfFit/.test(src), 'headers do carry units (so the rule matters)');
});

t('audit/ui: changing drug, importing a session or clearing is refused while a fit is running (it left tacrolimus results under an MPA screen)', function () {
  var src = fs.readFileSync(path.join(__dirname, '..', 'src', 'ui.js'), 'utf8');
  var drug = src.match(/\$\('pt-drug'\)\.addEventListener\('change', function \(\) \{([\s\S]*?)\n    \}\);/)[1];
  truthy(/state\.running/.test(drug) && drug.indexOf('state.running') < drug.indexOf('M.select('), 'drug change checks state.running before doing anything');
  var imp = src.match(/function applySession\(o\) \{([\s\S]{0,400})/)[1];
  truthy(/state\.running/.test(imp), 'import checks state.running');
});

t('audit/ui: dialogs take keyboard focus when they open, keep it inside, and give it back when they close', function () {
  var src = fs.readFileSync(path.join(__dirname, '..', 'src', 'ui.js'), 'utf8');
  var open = src.match(/function openModal\(id\) \{([\s\S]*?)\n  \}/)[1], close = src.match(/function closeModal\(id\) \{([\s\S]*?)\n  \}/)[1];
  truthy(/focus\(\)/.test(open) && /_lastFocus|lastFocus/.test(open), 'openModal remembers the opener and focuses the dialog');
  truthy(/focus\(\)/.test(close), 'closeModal restores focus');
  truthy(/key === 'Tab'/.test(src), 'Tab is kept inside an open dialog');
});

t('audit/ui: the main status line speaks to a clinician (no "posterior draws" / "MCMC acceptance" outside tooltips and the diagnostics dialog)', function () {
  var src = fs.readFileSync(path.join(__dirname, '..', 'src', 'ui.js'), 'utf8');
  var re = /posterior draws|MCMC acceptance/g, m, bad = [];
  while ((m = re.exec(src))) { if (src.slice(Math.max(0, m.index - 220), m.index).indexOf('title="') < 0) bad.push(src.slice(Math.max(0, m.index - 60), m.index + 30).replace(/\s+/g, ' ')); }
  eq(bad.length, 0, 'jargon outside a tooltip: ' + JSON.stringify(bad));
});

t('audit/docs: the README tells the truth about what to publish and which commands pass', function () {
  var rd = fs.readFileSync(path.join(__dirname, '..', 'README.md'), 'utf8');
  falsy(/copy `mpa-tdm\.html` to `index\.html`/.test(rd), 'republish instructions must name nephrotdm.html (mpa-tdm.html is the superseded 1.1.1 file)');
  falsy(/verify_model\.mjs --pending\s+# model-ingestion gate: passes ONLY while pending/.test(rd), 'the --pending line describes a command that now fails');
  falsy(/Currently `\{\}`/.test(rd), 'golden.json is not empty');
  falsy(/## 11\. Current open items \(as of v1\.1\.1\)/.test(rd), 'the open-items list is not 1.1.1’s');
});

t('windows: the standard kidney window and the consensus sets are in the spec, well-formed, and the engine still never applies a window on its own', function () {
  var sets = S.windowSets;
  truthy(Array.isArray(sets) && sets.length >= 6, 'windowSets lists the standard set, the everolimus sets and the C0-matched sets');
  var std = sets.filter(function (x) { return x.id === S.windowStandard; })[0];
  truthy(std, 'windowStandard names one of the sets');
  eq(std.trough[0], 4); eq(std.trough[1], 12);           // Brunet 2019, kidney, low immunological risk (A I)
  eq(std.auc[0], 150); eq(std.auc[1], 210);              // 150 = consensus minimum; 210 = the AUC range paired with a trough of 12
  var ids = {};
  sets.forEach(function (x) {
    falsy(ids[x.id], 'unique id ' + x.id); ids[x.id] = true;
    truthy(x.label && x.basis && x.grade, x.id + ': label, basis and grade are given');
    truthy(x.trough && x.trough[0] > 0 && x.trough[1] > x.trough[0], x.id + ': trough pair is ordered');
    if (x.auc) { truthy(x.auc[0] > 0 && x.auc[1] > x.auc[0], x.id + ': AUC pair is ordered'); truthy(x.auc[1] <= S.windowRange.max, x.id + ': AUC inside windowRange'); }
  });
  // the four C0-matched ranges exactly as the report lists them (twice-daily)
  [[3, 7, 75, 140], [5, 10, 100, 190], [8, 12, 140, 210], [10, 15, 180, 270]].forEach(function (r) {
    truthy(sets.some(function (x) { return x.trough[0] === r[0] && x.trough[1] === r[1] && x.auc && x.auc[0] === r[2] && x.auc[1] === r[3]; }), 'C0 ' + r[0] + '–' + r[1] + ' ↔ AUC ' + r[2] + '–' + r[3]);
  });
  // everolimus combinations carry a trough window and no AUC window (the report gives none)
  truthy(sets.some(function (x) { return x.trough[0] === 4 && x.trough[1] === 7 && x.auc == null; }), 'everolimus months 0–2: trough 4–7, no AUC');
  truthy(sets.some(function (x) { return x.trough[0] === 2 && x.trough[1] === 4 && x.auc == null; }), 'everolimus later: trough 2–4, no AUC');
  eq(S.windowDefaultLo, null, 'the engine falls back to nothing: a cleared window means no probabilities, never a hidden default');
  eq(S.troughDefaultLo, null);
});

t('windows: the trough-matched AUC ranges equal Saint-Marcoux 2013 Table 2 cell by cell, and the all-periods range is the consensus’s (Brunet 2019 p. 271)', function () {
  // typed independently from the two papers: [C0 lo, C0 hi, 0–3 mo, 3–12 mo, >12 mo, consensus]
  var T2 = [[3, 7, [75, 140], [80, 140], [75, 130], [75, 140]], [5, 10, [110, 190], [110, 180], [100, 170], [100, 190]],
    [8, 12, null, [150, 210], [140, 200], [140, 210]], [10, 15, [190, 270], [180, 250], null, [180, 270]]];
  var by = {};
  S.windowSets.forEach(function (w) { if (w.matched) by[w.trough.join('-') + ':' + w.matched.col] = w.auc; });
  var n = 0;
  T2.forEach(function (r) {
    [['early', r[2]], ['mid', r[3]], ['late', r[4]], ['all', r[5]]].forEach(function (c) {
      var got = by[r[0] + '-' + r[1] + ':' + c[0]];
      if (c[1] == null) { eq(got, undefined, r[0] + '–' + r[1] + ' ' + c[0] + ': the paper has no range'); return; }
      eq(got && got.join('–'), c[1].join('–'), 'C0 ' + r[0] + '–' + r[1] + ', ' + c[0]); n++;
    });
  });
  eq(n, 14, 'fourteen matched ranges');
  eq(S.windowSets.filter(function (w) { return w.matched; }).length, 14);
});

t('windows: the background dialog lists every set with its numbers, grade and a Use button, and says what is derived', function () {
  require('../src/chart.js'); require('../src/diagnostics.js'); require('../src/texts_tac.js'); require('../src/ui.js');
  try {
    M.select('tac');
    var html = ECU.ui.backgroundHtml(), plain = html.replace(/<[^>]+>/g, ' ');
    S.windowSets.forEach(function (x) {
      truthy(html.indexOf('data-winset="' + x.id + '"') >= 0, x.id + ': has a Use button');
      truthy(plain.indexOf(x.trough[0] + '–' + x.trough[1]) >= 0, x.id + ': trough shown');
      if (x.auc) truthy(plain.indexOf(x.auc[0] + '–' + x.auc[1]) >= 0, x.id + ': AUC shown');
    });
    falsy(/ships no default window/i.test(plain), 'the old "no default" statement is gone');
    truthy(/standard/i.test(plain) && /derived/i.test(plain) && /Brunet/.test(plain), 'standard set, derived values and the source are named');
    truthy(/higher/i.test(plain) && /immunological risk/i.test(plain), 'higher-risk patients: no numbers in the report, enter your protocol');
  } finally { M.select('mpa'); }
});

t('windows: the UI applies the standard set when tacrolimus is chosen, wires the Use buttons, and a cleared window stays cleared', function () {
  var src = fs.readFileSync(path.join(__dirname, '..', 'src', 'ui.js'), 'utf8');
  truthy(/function applyWindowSet\(/.test(src), 'applyWindowSet exists');
  var drug = src.match(/\$\('pt-drug'\)\.addEventListener\('change', function \(\) \{([\s\S]*?)\n    \}\);/)[1];
  truthy(/applyWindowSet\(/.test(drug) && drug.indexOf('resetWindows()') < drug.indexOf('applyWindowSet('), 'drug change: windows are reset first, then the standard set of the new drug is applied');
  truthy(/data-winset/.test(src) && /backgroundBody/.test(src), 'Use buttons are handled');
  var rd = src.match(/function renderDrugAndCovariates\(\) \{([\s\S]*?)applyChrome\(\);/)[1];
  falsy(/windowStandard|applyWindowSet/.test(rd), 'rendering never refills a window the user cleared');
});

t('windows: the same window is applied to the actual and the corrected values, and the app carries no caveat text about validating a corrected target (owner decision)', function () {
  var srcs = ['ui.js', 'texts_tac.js', 'tacrolimus.js'].map(function (f) { return fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8'); }).join('\n');
  falsy(/no target has been validated|not been validated for a (?:haematocrit-)?corrected|read its probability as a comparison only/i.test(srcs), 'no “not validated” caveat about the corrected value');
  var b = fs.readFileSync(path.join(__dirname, '..', 'src', 'bayes.js'), 'utf8');
  truthy(/windowStats\(aucCorr/.test(b) || /aucCorr[\s\S]{0,400}windowStats/.test(b) || /windowStats\([^)]*Corr/.test(b), 'the corrected values get window probabilities');
});

t('privacy: an autosave older than 24 h (or without a time stamp) is never offered, and the header has a Clear session button that removes the autosave', function () {
  require('../src/chart.js'); require('../src/diagnostics.js'); require('../src/texts_tac.js'); require('../src/ui.js');
  var X = ECU.ui.autosaveExpired, H = 3600 * 1000, now = 1.8e12;
  truthy(typeof X === 'function', 'ui exports autosaveExpired');
  falsy(X({ savedAt: now - 23 * H }, now), '23 h old: still offered');
  truthy(X({ savedAt: now - 25 * H }, now), '25 h old: expired');
  truthy(X({}, now), 'no time stamp (an autosave from before this version): expired');
  truthy(X({ savedAt: now + 5 * H }, now), 'a time stamp in the future (clock change): expired');
  var html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  var hdr = html.match(/<header class="app[\s\S]*?<\/header>/)[0];
  truthy(/id="btnClearSession"/.test(hdr), 'Clear session button sits in the header actions at the top of the app');
  var src = fs.readFileSync(path.join(__dirname, '..', 'src', 'ui.js'), 'utf8');
  var h = src.match(/\$\('btnClearSession'\)\.addEventListener\('click', function \(\) \{([\s\S]*?)\n    \}\);/);
  truthy(h, 'the button is wired');
  truthy(/confirm\(/.test(h[1]) && /removeItem\(AUTOSAVE_KEY\)/.test(h[1]) && /clearTimeout\(_saveT\)/.test(h[1]) && /reload\(\)/.test(h[1]), 'asks first, cancels a pending save, removes the autosave, then empties the page');
  truthy(/savedAt/.test(src.match(/function scheduleAutosave\(\) \{([\s\S]*?)\n  \}/)[1]), 'every autosave carries its time stamp');
});

t('leftover: more sampled days than the model gives their own effect is reported, not silent', function () {
  var ok = { sex: 'm', ht: 175, pred: 10, hct: 0.33, assay: 'lcms' }, doses = [], obs = [];
  for (var d = 0; d < 14; d++) { doses.push({ t: d * 24 + 8, amt: 3000 }); obs.push({ t: d * 24 + 8 + 12 - 0.1, c: 6, hct: 0.33 }); }
  var pr = T.prepare({ extra: ok, wt: 75, doses: doses, obs: obs, steadyState: false });
  eq(pr.extra.nOcc, 12, 'the 12 most recent days get their own effect');
  eq(pr.extra.nSampled, 14, 'the number of days that were sampled is kept');
  var src = fs.readFileSync(path.join(__dirname, '..', 'src', 'ui.js'), 'utf8'), b = fs.readFileSync(path.join(__dirname, '..', 'src', 'bayes.js'), 'utf8');
  truthy(/nSampledDays:\s*custom/.test(b), 'the fit result carries nSampledDays');
  truthy(/nSampledDays\s*>\s*fit\.nOccasions/.test(src) && /treated as typical days/.test(src), 'the results say which older days were treated as typical days');
});

t('leftover: an imported select value that is not one of its options leaves the select at its default instead of blank', function () {
  var src = fs.readFileSync(path.join(__dirname, '..', 'src', 'ui.js'), 'utf8');
  var ap = src.match(/function applySession\(o\) \{([\s\S]*?)\n  \}\n/)[1];
  var blk = ap.slice(ap.indexOf("o.extras"));
  truthy(/SELECT/.test(blk) && /options/.test(blk), 'applySession checks a select’s options before setting the value from the file');
});

t('cancel: a running forecast can be cancelled (in-process, on the worker pool, and the MPA path); the next fit is unaffected', async function () {
  var tacIn = (await fitCase({ mcmcIters: 40000 })).input;
  var cancelAt = function (limit) {
    var st = { stop: false, last: 0 };
    return { st: st, cb: { progress: function (f) { st.last = f; if (f > limit) st.stop = true; }, cancelled: function () { return st.stop; } } };
  };
  async function expectCancel(input, limit, label) {
    var c = cancelAt(limit), err = null;
    try { await B.runFit(input, c.cb); } catch (e) { err = e; }
    truthy(err && err.cancelled === true, label + ': rejected with a cancellation, got ' + (err && err.message));
    truthy(/cancel/i.test(err.message), label + ': plain message');
    truthy(c.st.last < 0.9, label + ': it stopped early, at ' + c.st.last.toFixed(2));
  }
  ECU.parallel.use(null);
  await expectCancel(tacIn, 0.4, 'tacrolimus in-process');
  try {
    ECU.parallel.use(nodeWorkerSpawn(), { workers: 4 });
    await expectCancel(tacIn, 0.4, 'tacrolimus on workers');
  } finally { ECU.parallel.use(null); }
  var mpaIn = { drug: 'mpa', form: 'mmf', wt: 70, doses: M.ssHistory({ amt: 739, intervalHours: 12, tEnd: 368, n: 30, route: 'oral' }), steadyState: true,
    obs: [{ t: 368.33, c: 9.5 }, { t: 369, c: 12.1 }, { t: 371, c: 4.4 }], intervalHours: 12, winLo: 30, winHi: 60, seed: 20250907, mcmcIters: 60000 };
  await expectCancel(mpaIn, 0.4, 'MPA');
  var again = await B.runFit(tacIn, null);
  truthy(isFinite(again.auc.median), 'a fit after a cancelled one runs normally');
  // the UI
  var html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8'), src = fs.readFileSync(path.join(__dirname, '..', 'src', 'ui.js'), 'utf8');
  truthy(/id="btnCancelRun"/.test(html), 'a Cancel button sits with the progress bar');
  truthy(/btnCancelRun/.test(src) && /cancelled:\s*function/.test(src) && /\.cancelled/.test(src), 'the UI wires the button, passes cancelled() and handles the cancellation');
});

t('V16 (regression): the shared engine changes did not move any MPA number — fixed-seed fits equal the v1.1.1 record exactly', async function () {
  var rec = JSON.parse(fs.readFileSync(path.join(__dirname, 'mpa_v111_regression.json'), 'utf8'));
  var mk = function (form, amt, obs) { return { drug: 'mpa', form: form, wt: 70, doses: M.ssHistory({ amt: amt * (form === 'mmf' ? 0.739 : 0.936), intervalHours: 12, tEnd: 368, n: 30, route: 'oral' }), steadyState: true, obs: obs, intervalHours: 12, winLo: 30, winHi: 60, seed: 20250907, mcmcIters: 60000 }; };
  var cases = {
    mmf_lss: mk('mmf', 1000, [{ t: 368.33, c: 9.5 }, { t: 369, c: 12.1 }, { t: 371, c: 4.4 }]),
    ecmps_lss: mk('ecmps', 720, [{ t: 369.5, c: 6.2 }, { t: 370, c: 9.0 }, { t: 372, c: 7.1 }]),
    mmf_pop: mk('mmf', 1000, [])
  };
  for (var k of Object.keys(cases)) {
    var f = await B.runFit(cases[k], null), r = rec[k];
    eq(f.auc.median, r.aucMedian, k + ' AUC median'); eq(f.auc.p5, r.aucP5, k + ' p5'); eq(f.auc.p95, r.aucP95, k + ' p95');
    eq(f.auc.pInWindow, r.pIn, k + ' P(in)'); eq(f.trough.median, r.troughMedian, k + ' trough'); eq(f.acceptance, r.acc, k + ' acceptance');
    eq(f.nDraws, r.nDraws); if (r.mapOfv != null) eq(f.map.ofv, r.mapOfv, k + ' MAP OFV');
  }
  var scan = await B.doseScan({ draws: (await B.runFit(cases.mmf_lss, null)).draws, drug: 'mpa', form: 'mmf', wt: 70, tEnd: 368, amounts: [739, 369], intervalHours: 12, winLo: 30, winHi: 60 });
  scan.forEach(function (x, i) { eq(x.auc.median, rec.scan[i].median, 'scan ' + i); eq(x.auc.pInWindow, rec.scan[i].pIn); });
});

h.runAll().then(function (ok) { if (!ok) process.exit(1); }).catch(function (e) { console.error(e); process.exit(1); });
