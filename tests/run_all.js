/* =========================================================================
 * MPA TDM — test suite
 *
 * Run with: node tests/run_all.js   (or npm test)
 * Guards, in the pending-model skeleton:
 *   - the pending spec refuses to forecast (model ingestion gate),
 *   - the covariate contract is model-driven,
 *   - AUC0–tau units/derivation (mg·h/L) and window probabilities,
 *   - the dose-explorer result contract (AUC CI, trough, 3 probabilities),
 *   - version single-source-of-truth.
 * Every assertion here can fail by construction; see harness.js.
 * ========================================================================= */
'use strict';

var path = require('path');
var h = require('./harness.js');
var t = h.t, eq = h.eq, near = h.near, assert = h.assert, throws = h.throws, rejects = h.rejects, truthy = h.truthy, falsy = h.falsy;

// ---- load engine modules into globalThis (same order as the build) ---------
require('../src/version.js');
require('../src/model.js');
require('../src/bayes.js');

var ECU = globalThis.ECU;
var M = ECU.model, B = ECU.bayes;

// ---------------------------------------------------------------------------
// 1. Model gate: de Winter 2008 integrated; pending machinery still guarded
// ---------------------------------------------------------------------------
t('integrated spec: de Winter 2008 is complete and ready', function () {
  var s = M.spec('mpa');
  truthy(s, 'mpa spec must exist');
  eq(s.id, 'mpa');
  eq(s.pending, false, 'the model file is integrated (v1.0.0)');
  eq(s.THETA.CL, 16); eq(s.THETA.Q, 22); eq(s.THETA.V1, 40); eq(s.THETA.V2, 518);
  truthy(s.FORMS && s.FORMS.mmf && s.FORMS.ecmps, 'both formulations declared');
  truthy(s.SIGMA.LOG > 0, 'log-scale residual error declared');
  truthy(/de Winter/.test(s.article) && /Clin Pharmacokinet/.test(s.article), 'citation');
});

t('pending gate: requireReady still refuses while a spec is pending', function () {
  var s = M.spec('mpa');
  var prev = s.pending;
  s.pending = true;
  try {
    throws(function () { M.requireReady('mpa'); }, 'pending');
  } finally { s.pending = prev; }
});

t('pending gate: runFit refuses while a spec is pending', async function () {
  var s = M.spec('mpa');
  var prev = s.pending;
  s.pending = true;
  try {
    var input = {
      drug: 'mpa', wt: 70,
      doses: [{ t: 0, amt: 1000, route: 'oral' }],
      obs: [{ t: 0.5, c: 2 }]
    };
    await rejects(B.runFit(input, null), 'pending');
  } finally { s.pending = prev; }
});

t('pending gate: doseScan returns [] while a spec is pending', async function () {
  var s = M.spec('mpa');
  var prev = s.pending;
  s.pending = true;
  try {
    var out = await B.doseScan({
      draws: [[0, 0]],
      drug: 'mpa',
      doses: [{ t: 0, amt: 1000, route: 'oral' }],
      amounts: [500, 1000]
    });
    assert(Array.isArray(out) && out.length === 0, 'doseScan must return [] while pending');
  } finally { s.pending = prev; }
});

t('engine: eta layout is spec-driven and formulation-specific (S5)', function () {
  eq(M.etaDim('mpa', 'mmf'), 6, 'MMF: CL,Q,V1,V2,KA,TLAG');
  eq(M.etaDim('mpa', 'ecmps'), 7, 'EC-MPS: +TLAG_EVE (morning rides the mixture)');
  var nm = M.etaNamesFor('mpa', 'mmf');
  eq(nm.join(','), 'CL,Q,V1,V2,KA,TLAG');
  var ov = M.omegaVars('mpa', 'ecmps');
  eq(ov.length, 7);
  near(ov[3], 24.01, 1e-6, 'ω²(V2) under the √ω² convention (S1)');
  near(M.omegaVars('mpa', 'mmf')[4], 3.4969, 1e-4, 'ω²(ka) = 1.87²');
});

t('V1: micro-constants and terminal half-life from the published typical values', function () {
  var p = M.indivParams(70, null, null, null, null, 'mpa', 'mmf');
  near(p.cl, 16, 1e-9, 'CL/F 16 L/h');
  near(p.v1, 40, 1e-9, 'V1/F 40 L');
  near(p.q, 22, 1e-9, 'Q/F 22 L/h');
  near(p.v2, 518, 1e-9, 'V2/F 518 L');
  near(p.k12, 0.55, 1e-6, 'k12 = Q/V1');
  near(p.k21, 22 / 518, 1e-6, 'k21 = Q/V2');
  var k10 = 16 / 40;
  var sum = k10 + 0.55 + 22 / 518;
  var lbeta = 0.5 * (sum - Math.sqrt(sum * sum - 4 * k10 * (22 / 518)));
  near(Math.log(2) / lbeta, 39.8, 0.5, 'terminal t½ ≈ 39.8 h — the S2 driver');
  var p2 = M.indivParams(120, null, null, null, null, 'mpa', 'mmf');
  near(p2.cl, 16, 1e-9, 'no allometry: weight does not move CL');
});

t('V2: absorption rates per formulation match the paper (t½ 0.17 / 0.23 h)', function () {
  var pm = M.indivParams(70, null, null, null, null, 'mpa', 'mmf');
  var pe = M.indivParams(70, null, null, null, null, 'mpa', 'ecmps');
  near(pm.ka, 4.1, 1e-9, 'ka MMF 4.1/h');
  near(pe.ka, 3.0, 1e-9, 'ka EC-MPS 3.0/h');
  near(Math.log(2) / pm.ka, 0.169, 0.002, 'absorption t½ MMF ≈ paper’s 0.17 h');
  near(Math.log(2) / pe.ka, 0.231, 0.002, 'absorption t½ EC-MPS ≈ paper’s 0.23 h');
});

function ssAnchor(form, amtMpa, mixIdx, nDoses, kaEta) {
  var n = nDoses || 31;
  var doses = M.ssHistory({ amt: amtMpa, intervalHours: 12, tEnd: 368, n: n, route: 'oral' });
  var eta = [0, 0, 0, 0, kaEta || 0, 0, 0];
  var p = M.indivParams(70, null, null, null, eta, 'mpa', form, mixIdx || 0);
  var times = M.intervalGrid(368, 12, 48);
  var sim = M.simulate(doses, times, p, { id: 'mpa' });
  return M.aucFromConc(sim.c, 12, times);
}

var GOLDEN = JSON.parse(require('fs').readFileSync(path.join(__dirname, 'golden.json'), 'utf8'));

function winAUC(form, amt, t0, mixIdx) {
  var doses = M.ssHistory({ amt: amt, intervalHours: 12, tEnd: 380, n: 32, route: 'oral' });
  var p = M.indivParams(70, null, null, null, [0, 0, 0, 0, 0, 0, 0], 'mpa', form, mixIdx || 0);
  var times = M.intervalGrid(t0, 12, 48);
  var sim = M.simulate(doses, times, p, { id: 'mpa' });
  return M.aucFromConc(sim.c, 12, times);
}

t('V4: SS golden anchors — MMF per-window mass balance; EC-MPS 24h balance', function () {
  // MMF absorption is 12h-periodic → every 12h window carries exactly one dose:
  near(ssAnchor('mmf', 739), GOLDEN.mmf1000AUC12.auc, GOLDEN.mmf1000AUC12.auc * 0.02,
    'MMF 1000 mg → 739 mg MPA → AUC12 = 739/16 ≈ 46.19 within ±2%');
  // EC-MPS absorption is 24h-periodic (evening dose absorbs at clock ~05) →
  // the exact invariant is the 24h sum; single windows are golden-recorded.
  var eve = winAUC('ecmps', 674, 356);
  var mor = winAUC('ecmps', 674, 368);
  near(mor, GOLDEN.ecmps720MorningAUC12.auc, GOLDEN.ecmps720MorningAUC12.auc * 0.02,
    'EC-MPS morning-anchored window matches the golden record');
  near(eve, GOLDEN.ecmps720EveningAUC12.auc, GOLDEN.ecmps720EveningAUC12.auc * 0.02,
    'EC-MPS evening-anchored window matches the golden record');
  near(eve + mor, GOLDEN.ecmps24hBalance.sum, GOLDEN.ecmps24hBalance.sum * 0.02,
    '24h mass balance: morning + evening = 2 × 674/16 = 84.25 (the exact invariant)');
});

t('V5: S3 invariant — for 12h-periodic absorption (MMF), AUC12 ignores ka', function () {
  var base = ssAnchor('mmf', 739);
  var kaHalf = ssAnchor('mmf', 739, 0, 31, Math.log(0.5));
  near(kaHalf, base, base * 0.01, 'ka ÷ 2 leaves MMF SS AUC12 within 1%');
  var kaFast = ssAnchor('mmf', 739, 0, 31, Math.log(1.5));
  near(kaFast, base, base * 0.01, 'ka × 1.5 leaves MMF SS AUC12 within 1% (mass balance, grid-resolved)');
  // subgroup invariance holds on the 24h sum for EC-MPS (the periodic invariant)
  var s1 = winAUC('ecmps', 674, 356, 0) + winAUC('ecmps', 674, 368, 0);
  var s3 = winAUC('ecmps', 674, 356, 2) + winAUC('ecmps', 674, 368, 2);
  near(s3, s1, s1 * 0.01, 'mixture subgroup does not move the 24h exposure within 1%');
});

t('V6: tlag mechanics — nothing in the central compartment before t + lag', function () {
  // EC-MPS evening dose (clock 20 → evening, lag 9.04): rise at ~29 h
  var pe = M.indivParams(70, null, null, null, null, 'mpa', 'ecmps');
  var simE = M.simulate([{ t: 20, amt: 674, route: 'oral' }], [20, 28.5, 31], pe, { id: 'mpa' });
  truthy(simE.c[1] < 1e-6, 'C(8.5 h after evening dose) ≈ 0 — lag holds');
  truthy(simE.c[2] > 0, 'C(11 h after evening dose) > 0 — absorption started');
  // EC-MPS morning subgroup 3 (lag 4.83): dose at clock 8
  var p3 = M.indivParams(70, null, null, null, null, 'mpa', 'ecmps', 2);
  var sim3 = M.simulate([{ t: 8, amt: 674, route: 'oral' }], [8, 12.5, 14], p3, { id: 'mpa' });
  truthy(sim3.c[1] < 1e-6, 'C(4.5 h after dose) ≈ 0 for subgroup 3');
  truthy(sim3.c[2] > 0, 'C(6 h after dose) > 0');
  // MMF (lag 0.30): rise at 8.3
  var pm = M.indivParams(70, null, null, null, null, 'mpa', 'mmf');
  var simM = M.simulate([{ t: 8, amt: 739, route: 'oral' }], [8, 8.2, 8.6], pm, { id: 'mpa' });
  truthy(simM.c[1] < 1e-6, 'C(0.2 h after MMF dose) ≈ 0');
  truthy(simM.c[2] > 0, 'C(0.6 h after MMF dose) > 0');
  // IV bolus: no lag at all
  var simI = M.simulate([{ t: 0, amt: 100, route: 'bolus' }], [0.01], pm, { id: 'mpa' });
  truthy(simI.c[0] > 1, 'IV bolus is central immediately (no lag)');
});

t('V3: IV bolus matches the analytic bi-exponential; AUC0–∞ = dose/CL', function () {
  var p = M.indivParams(70, null, null, null, null, 'mpa', 'mmf');
  // closed form for a 2-cmt bolus with the published typical values
  var k10 = 16 / 40, k12 = 22 / 40, k21 = 22 / 518;
  var sum = k10 + k12 + k21;
  var al = 0.5 * (sum + Math.sqrt(sum * sum - 4 * k10 * k21));
  var be = 0.5 * (sum - Math.sqrt(sum * sum - 4 * k10 * k21));
  var A = (100 / 40) * (al - k21) / (al - be);
  var Bc = (100 / 40) * (k21 - be) / (al - be);
  [0.5, 2, 12, 48, 240].forEach(function (t2) {
    var sim = M.simulate([{ t: 0, amt: 100, route: 'bolus' }], [t2], p, { id: 'mpa' });
    var ana = A * Math.exp(-al * t2) + Bc * Math.exp(-be * t2);
    near(sim.c[0], ana, ana * 0.002, 'C(' + t2 + ' h) matches the analytic solution within 0.2%');
  });
  // AUC from 0.05 h (dense grid) + terminal tail, against the analytic partial
  // integral A/α·e^(−0.05α) + B/β·e^(−0.05β) — the [0, 0.05] slice is excluded
  // by design (out-times at the dose instant read pre-dose).
  var times = [];
  for (var tt = 0.05; tt <= 480; tt += (tt < 8 ? 0.2 : 2)) times.push(tt);
  var sim2 = M.simulate([{ t: 0, amt: 100, route: 'bolus' }], times, p, { id: 'mpa' });
  var auc = M.aucFromConc(sim2.c, 480, times) + sim2.c[sim2.c.length - 1] / be;
  var analyticPartial = A / al * Math.exp(-al * 0.05) + Bc / be * Math.exp(-be * 0.05);
  near(auc, analyticPartial, analyticPartial * 0.01, 'AUC(0.05→∞) matches the analytic partial integral within 1%');
  near(auc, 100 / 16, 0.15, 'and sits within 2.4% of the full dose/CL = 6.25');
});

t('V7: dose conversion is exact stoichiometry (×0.739 / ×0.936)', function () {
  near(M.toMpaMg(1000, 'mmf'), 739, 1e-9, '1000 mg MMF → 739 mg MPA');
  near(M.toMpaMg(720, 'ecmps'), 720 * 0.936, 1e-9, '720 mg EC-MPS → 673.92 mg MPA');
  near(M.toMpaMg(500, null), 500, 1e-9, 'no formulation → no conversion');
});

t('V12: SS depth — 30 doses within 2%, 10 doses materially low (documents S2)', function () {
  eq(M.spec('mpa').ssNDoses, 30, 'spec default is 30 doses (S2)');
  var target = 739 / 16;   // MMF: 12h-periodic → clean per-window mass balance
  var a31 = ssAnchor('mmf', 739, 0, 31);
  near(a31, target, target * 0.02, 'n=31: within the golden ±2%');
  var a11 = ssAnchor('mmf', 739, 0, 11);
  truthy(a11 < target * 0.97,
    'n=11 (10 intervals) is materially below the ±2% band — the terminal t½ ≈ 40 h accumulation S2 warns about (got ' +
    (a11 / target).toFixed(3) + ' of SS)');
});

t('V8: mixture prior — a population EC-MPS fit carries 51/32/17 membership', async function () {
  var doses = M.ssHistory({ amt: 674, intervalHours: 12, tEnd: 368, n: 31, route: 'oral' });
  var fit = await B.runFit({
    drug: 'mpa', form: 'ecmps', wt: 70,
    doses: doses, obs: [], intervalHours: 12,
    priorDraws: 2000, seed: 42
  }, { progress: function () {} });
  truthy(fit.mixChain && fit.mixChain.length === fit.draws.length, 'mixChain parallel to draws');
  var f0 = fit.mixPost[0], f1 = fit.mixPost[1], f2 = fit.mixPost[2];
  truthy(f0 > 0.46 && f0 < 0.56, 'subgroup 1 ≈ 51% (got ' + f0.toFixed(3) + ')');
  truthy(f1 > 0.27 && f1 < 0.37, 'subgroup 2 ≈ 32% (got ' + f1.toFixed(3) + ')');
  truthy(f2 > 0.12 && f2 < 0.22, 'subgroup 3 ≈ 17% (got ' + f2.toFixed(3) + ')');
});

t('V9: log-residual likelihood prefers truth over perturbations (E3+E5 jointly)', async function () {
  var doses = M.ssHistory({ amt: 674, intervalHours: 12, tEnd: 368, n: 31, route: 'oral' });
  // truth: moderate CL eta, subgroup 2 (1.88 h morning lag)
  var truthEta = [-0.2, 0, 0.1, 0, 0, 0, 0];
  var pTrue = M.indivParams(70, null, null, null, truthEta, 'mpa', 'ecmps', 1);
  var obsT = [368.5, 369.5, 370, 372, 375, 380];  // early + late: discriminates subgroup and CL
  var simT = M.simulate(doses, obsT, pTrue, { id: 'mpa' });
  var obs = obsT.map(function (t, i) { return { t: t, c: simT.c[i] }; });
  var ctx = {
    drug: 'mpa', form: 'ecmps', mixPrior: M.mixPriorOf('mpa', 'ecmps'),
    doses: doses, obs: obs, wt: 70,
    omega: { vars: M.omegaVars('mpa', 'ecmps') },
    lloq: 0, errMult: 1, recency: 'off'
  };
  var ofv = B.makeOfv(ctx);
  var fTrue = ofv(truthEta, 1);
  var fWrongMix = ofv(truthEta, 0);
  var fPerturbed = ofv([-1.4, 0, 0.1, 0, 0, 0, 0], 1);
  truthy(isFinite(fTrue), 'truth OFV finite');
  truthy(fTrue < fWrongMix, 'truth membership (subgroup 2) beats subgroup 1 given early samples');
  truthy(fTrue < fPerturbed, 'truth eta beats a perturbed CL');
});

// ---------------------------------------------------------------------------
// 2. Model-driven covariate contract
// ---------------------------------------------------------------------------
t('covariate contract: fields come from the spec, not hardcoded UI', function () {
  var s = M.spec('mpa');
  var covs = M.covariateFields('mpa');
  assert(Array.isArray(covs), 'covariateFields must return an array');
  // de Winter 2008: the ONLY covariate is formulation; weight is not a covariate
  eq(covs.length, 1, 'exactly one covariate (formulation)');
  eq(covs[0].id, 'form');
  eq(covs[0].type, 'select');
  eq(covs[0].options.length, 2, 'MMF and EC-MPS options');
  falsy(s.covariateWeight, 'weight is NOT a covariate of this model — hidden from the panel');
  eq(s.requiresWt, false, 'runFit must not demand weight for this model');
});

t('covariate contract: every field has units/help/required defined', function () {
  var covs = M.covariateFields('mpa');
  covs.forEach(function (c) {
    truthy(c.id, 'covariate must have an id');
    truthy(c.name, 'covariate must have a name');
    truthy(typeof c.required === 'boolean', 'covariate must declare required');
    truthy(c.help && c.help.length > 5, 'covariate must carry help text');
  });
});

// ---------------------------------------------------------------------------
// 3. AUC0–tau derivation (units + integration)
// ---------------------------------------------------------------------------
t('aucFromConc: constant concentration over 12 h gives C×12 mg·h/L', function () {
  var c = [3, 3, 3, 3, 3, 3, 3];
  var auc = M.aucFromConc(c, 12);
  near(auc, 36, 1e-9, 'constant 3 mg/L over 12 h must be 36 mg·h/L');
});

t('aucFromConc: trapezoid of a linear rise matches the analytic value', function () {
  // 0 → 2 mg/L linearly over 12 h: AUC = ½ × 2 × 12 = 12 mg·h/L
  var c = [0, 0.5, 1, 1.5, 2];
  var auc = M.aucFromConc(c, 12);
  near(auc, 12, 1e-9, 'linear 0→2 over 12 h must be 12 mg·h/L');
});

t('aucFromConc: rejects degenerate input', function () {
  assert(isNaN(M.aucFromConc([1], 12)), 'single point must give NaN');
  assert(isNaN(M.aucFromConc([1, 2], 0)), 'zero interval must give NaN');
  assert(isNaN(M.aucFromConc([1, NaN], 12)), 'non-finite concentration must give NaN');
});

t('aucOfCurve delegates to aucFromConc with the interval in hours', function () {
  var c = [1, 1, 1, 1];
  near(B.aucOfCurve(c, 12), 12, 1e-9, '1 mg/L constant over 12 h = 12 mg·h/L');
});

// ---------------------------------------------------------------------------
// 4. Therapeutic-window probabilities
// ---------------------------------------------------------------------------
t('probabilities: P(within), P(above lower), P(below upper) are exact on small chains', function () {
  var aucs = [5, 12, 18, 20]; // window 10–15, only 12 is strictly inside
  near(B.probBetween(aucs, 10, 15), 0.25, 1e-12, '1 of 4 inside (10,15)');
  near(B.probAbove(aucs, 10), 0.75, 1e-12, '3 of 4 above 10');
  near(B.probBelow(aucs, 15), 0.5, 1e-12, '2 of 4 below 15');
});

t('probabilities: non-finite values are excluded from the denominator', function () {
  var aucs = [5, NaN, 20, 20];
  // window (0, 100): 2 finite values, both inside → 1.0
  near(B.probBetween(aucs, 0, 100), 1.0, 1e-12, 'NaN excluded from the denominator');
  assert(isNaN(B.probBetween([], 0, 1)), 'empty chain gives NaN, not 0');
});

t('probabilities: strict window semantics (bounds excluded)', function () {
  var aucs = [10, 15]; // exactly on the bounds
  eq(B.probBetween(aucs, 10, 15), 0, 'bounds are excluded from P(within)');
});

// ---------------------------------------------------------------------------
// 5. Dose-explorer result contract (shape, not values — model is pending)
// ---------------------------------------------------------------------------
t('doseScan is exported and callable', function () {
  truthy(typeof B.doseScan === 'function', 'doseScan must be exported');
});

t('runFit input contract: window bounds default to the spec, not to hidden constants', function () {
  var s = M.spec('mpa');
  truthy('windowDefaultLo' in s && 'windowDefaultHi' in s,
    'spec must declare windowDefaultLo/Hi');
  truthy(s.windowRange && s.windowRange.min != null && s.windowRange.max != null,
    'spec must declare the windowRange fallback');
});

// ---------------------------------------------------------------------------
// 7. Consensus clinical metadata (independent of the pending PK parameters)
// ---------------------------------------------------------------------------
t('window defaults: 30–60 mg·h/L; on-screen hint is a short pointer (golden rule 9)', function () {
  var s = M.spec('mpa');
  eq(s.pending, false, 'model integrated');
  eq(s.windowDefaultLo, 30);
  eq(s.windowDefaultHi, 60);
  assert(s.windowDefaultHi > s.windowDefaultLo, 'window must be a non-empty interval');
  // The on-screen hint is deliberately SHORT: it points to the background dialog,
  // which carries the full per-indication reference table (asserted in the
  // background test). The long inclusive text was removed from the main screen
  // by design (DESIGN_PLAN.md D11) — do not move it back.
  truthy(s.windowHint && /MPA TDM background/i.test(s.windowHint), 'windowHint must point to the background dialog');
  truthy(/reference values/i.test(s.windowHint) && /best practices/i.test(s.windowHint), 'windowHint must name what the dialog holds');
  assert(s.windowHint.length <= 120, 'windowHint must stay short (≤120 chars) — found ' + (s.windowHint || '').length);
});

t('sampling hint: MMF and EC-MPS limited-sampling guidance, trough-only discouraged', function () {
  var s = M.spec('mpa');
  truthy(s.samplePeak && s.samplePeak.length > 20, 'samplePeak must carry sampling guidance');
  truthy(/MMF/.test(s.samplePeak), 'samplePeak must mention MMF');
  truthy(/EC-MPS/.test(s.samplePeak), 'samplePeak must mention EC-MPS');
  truthy(/trough/i.test(s.samplePeak), 'samplePeak must mention trough-only sampling');
  truthy(/discouraged/.test(s.samplePeak), 'samplePeak must discourage trough-only sampling');
});

// ---------------------------------------------------------------------------
// 6. Version single source of truth
// ---------------------------------------------------------------------------
t('version: src/version.js matches package.json', function () {
  var pkg = require('../package.json');
  eq(ECU.VERSION, pkg.version);
});

// ---------------------------------------------------------------------------
// 8. P0 engine tests — stub spec so these can go red without a model file
// ---------------------------------------------------------------------------
function withStub(fn) {
  M.installStubSpec();
  try { return fn(); }
  finally { M.restorePendingSpec(); }
}
async function withStubAsync(fn) {
  M.installStubSpec();
  try { return await fn(); }
  finally { M.restorePendingSpec(); }
}

t('P0-1: simulate() returns non-zero concentrations after an oral dose', function () {
  withStub(function () {
    var p = M.indivParams(70, 45, null, null, [0, 0], 'mpa');
    var times = [0, 0.5, 1, 2, 4, 8, 12];
    var sim = M.simulate([{ t: 0, amt: 1000, route: 'oral' }], times, p, {});
    falsy(sim.failed, 'simulate must not report failed');
    truthy(sim.c.some(function (v) { return v > 0.01; }), 'at least one C(t>0) must be > 0');
    near(sim.c[0], 0, 1e-6, 'C(0) before the oral dose is applied is a trough of 0');
  });
});

t('P0-2/P0-8: intervalGrid is in hours, last dose at 100 h + 12 h tau', function () {
  var g = M.intervalGrid(100, 12, 24);
  eq(g[0], 100);
  near(g[g.length - 1], 112, 1e-9);
  var span = g[g.length - 1] - g[0];
  near(span, 12, 1e-9, 'grid span must be 12 hours, never 0.5 days');
});

t('P0-2: AUC of constant 3 mg/L over a 12 h hour-grid is 36 mg·h/L', function () {
  var g = M.intervalGrid(100, 12, 24);
  var c = g.map(function () { return 3; });
  near(M.aucFromConc(c, 12, g), 36, 1e-6);
});

t('P0-3: trough is C(tau), not min(curve)', function () {
  withStub(function () {
    var p = M.indivParams(70, 45, null, null, [0, 0], 'mpa');
    var hist = M.ssHistory({ amt: 1000, intervalHours: 12, tEnd: 120, n: 10, route: 'oral' });
    var g = M.intervalGrid(120, 12, 24);
    var sim = M.simulate(hist, g, p, {});
    falsy(sim.failed);
    var trough = sim.c[sim.c.length - 1];
    var minC = Math.min.apply(null, sim.c.filter(isFinite));
    truthy(trough > 0.01, 'SS trough C(tau) must be > 0');
    // min(curve) on a dose-to-dose grid with oral ka is typically an interior
    // point or C just after dose-before-absorption; C(tau) is the last point.
    eq(trough, sim.c[sim.c.length - 1]);
    truthy(isFinite(minC));
  });
});

t('P0-5: OFV includes a prior term (eta=0 is cheaper than a huge eta)', function () {
  withStub(function () {
    var doses = M.ssHistory({ amt: 1000, intervalHours: 12, tEnd: 120, n: 8, route: 'oral' });
    var ofv = B.makeOfv({
      wt: 70, age: 45, renal: null, extra: null, drug: 'mpa',
      doses: doses,
      obs: [{ t: 121, c: 1.5, lloq: false }],
      omega: { vars: [0.09, 0.09] }, recency: 'off', errMult: 1, lloq: 0
    });
    var f0 = ofv([0, 0]);
    var fBig = ofv([5, 5]);
    truthy(isFinite(f0) && isFinite(fBig), 'OFV must be finite');
    assert(fBig > f0 + 10, 'huge eta must be penalised by the prior (fBig=' + fBig + ' f0=' + f0 + ')');
  });
});

t('P1-2: recency low/medium/high are distinct', function () {
  near(B.recencyMaxMult('off'), 1, 1e-12);
  near(B.recencyMaxMult('low'), 1.5, 1e-12);
  near(B.recencyMaxMult('medium'), 2, 1e-12);
  near(B.recencyMaxMult('high'), 3, 1e-12);
});

t('P1-3: statsOfChain drops NaNs', function () {
  var s = B.statsOfChain([10, NaN, 20]);
  near(s.median, 15, 1e-12);
});

t('P0-6: runFit fills chartBand and IPRED', async function () {
  await withStubAsync(async function () {
    var doses = M.ssHistory({ amt: 1000, intervalHours: 12, tEnd: 120, n: 8, route: 'oral' });
    var fit = await B.runFit({
      drug: 'mpa', wt: 70, age: 45,
      doses: doses,
      obs: [{ t: 121, c: 2, lloq: false }],
      intervalHours: 12, winLo: 30, winHi: 60,
      mcmcIters: 400, priorDraws: 80, seed: 1
    }, { progress: function () {} });
    truthy(fit.chartBand && fit.chartBand.median, 'chartBand.median must be filled');
    truthy(fit.chartBand.median.some(function (v) { return isFinite(v) && v > 0; }), 'chartBand has positive concentrations');
    eq(fit.obsData.length, 1);
    truthy(isFinite(fit.obsData[0].ipred), 'IPRED must be finite');
    truthy(isFinite(fit.auc.median) && fit.auc.median > 0, 'AUC median > 0');
    truthy(isFinite(fit.trough.median) && fit.trough.median > 0, 'trough C(tau) > 0');
    near(fit.grid[0], 120, 1e-9, 'grid starts at last dose (hours)');
    near(fit.grid[fit.grid.length - 1] - fit.grid[0], 12, 1e-6, 'grid spans 12 h');
  });
});

t('P0-4: doseScan SS doubling increases AUC', async function () {
  await withStubAsync(async function () {
    var draws = [[0, 0], [0.1, -0.1], [-0.1, 0.1]];
    var rows = await B.doseScan({
      draws: draws, drug: 'mpa', wt: 70, age: 45,
      tEnd: 120, route: 'oral', intervalHours: 12,
      amounts: [500, 1000], winLo: 30, winHi: 60
    });
    eq(rows.length, 2);
    truthy(rows[1].auc.median > rows[0].auc.median * 1.3,
      'doubling maintenance dose should substantially increase SS AUC (' +
      rows[0].auc.median + ' vs ' + rows[1].auc.median + ')');
    truthy(rows[0].trough.median > 0 && rows[1].trough.median > 0, 'SS troughs > 0');
  });
});

t('R4: a censored (“< LLOQ”) sample is refused outright — never dropped, never fitted as zero, even when an LLOQ is supplied', async function () {
  await withStubAsync(async function () {
    var doses = M.ssHistory({ amt: 1000, intervalHours: 12, tEnd: 120, n: 8, route: 'oral' });
    var cens = [{ t: 120.33, c: 2.5 }, { t: 132, c: null, lloq: true }];
    await rejects(B.runFit({ drug: 'mpa', wt: 70, doses: doses, obs: cens, intervalHours: 12, winLo: 30, winHi: 60 }, { progress: function () {} }), 'not supported');
    await rejects(B.runFit({ drug: 'mpa', wt: 70, doses: doses, obs: cens, lloq: 1.0, intervalHours: 12, winLo: 30, winHi: 60 }, { progress: function () {} }), 'not supported');
  });
});

t('AUDIT: runFit flags a single-dose history as not steady state', async function () {
  await withStubAsync(async function () {
    var fit = await B.runFit({
      drug: 'mpa', wt: 70,
      doses: [{ t: 0, amt: 1000, route: 'oral' }],
      obs: [{ t: 1, c: 2, lloq: false }],
      intervalHours: 12, winLo: 30, winHi: 60,
      mcmcIters: 400, priorDraws: 100, seed: 1
    }, { progress: function () {} });
    truthy(fit.warnSingleDose === true, 'single-dose run must be flagged warnSingleDose');
    // And a multi-dose run must NOT be flagged
    var fit2 = await B.runFit({
      drug: 'mpa', wt: 70,
      doses: M.ssHistory({ amt: 1000, intervalHours: 12, tEnd: 120, n: 8, route: 'oral' }),
      obs: [{ t: 121, c: 2, lloq: false }],
      intervalHours: 12, winLo: 30, winHi: 60,
      mcmcIters: 400, priorDraws: 100, seed: 1
    }, { progress: function () {} });
    truthy(fit2.warnSingleDose === false, 'multi-dose run must not be flagged');
  });
});

require('../src/chart.js');
require('../src/diagnostics.js');
require('../src/ui.js');

t('About: sectioned copy matches the complement-app voice', function () {
  var html = ECU.ui.aboutHtml();
  truthy(/<h3>Privacy<\/h3>/.test(html), 'Privacy section');
  truthy(/<h3>Research use only<\/h3>/.test(html), 'Research-use section');
  truthy(/Nothing you enter is sent to a server or processed online/.test(html), 'privacy wording: nothing leaves the device');
  truthy(/autosaved copy[^.]*local storage/.test(html), 'privacy wording: the local autosave is disclosed (it holds patient data on this device)');
  truthy(/For research purposes only, not for routine clinical use/.test(html), 'research-use wording');
  truthy(/never recommends/.test(html), 'no-dose-recommendation');
  truthy(/30–60 mg·h\/L/.test(html), 'default window');
  truthy(/Bergan/.test(html), 'window source');
  truthy(/Trough-only/.test(html) || /trough-only/.test(html) || /Trough-only/.test(html), 'trough-only discouraged');
  truthy(/no trough target/.test(html), 'no trough target');
  truthy(/de Winter/.test(html) && /Clin Pharmacokinet/.test(html), 'model card cites de Winter 2008');
  truthy(/maintenance/.test(html), 'model card states the maintenance-phase scope');
  truthy(/r\.terheine@radboudumc\.nl/.test(html), 'contact email');
  truthy(/Rob ter Heine/.test(html), 'author');
  truthy(html.indexOf('v' + ECU.VERSION) >= 0, 'About must show the current version');
  falsy(/eculizumab|ravulizumab|crovalimab/i.test(html), 'must not copy complement-drug names');
});

t('Getting started: walkthrough mentions AUC window, LSS and no recommendation', function () {
  var html = ECU.ui.gettingStartedBodyHtml();
  truthy(/Nothing you type leaves this device/.test(html), 'privacy in walkthrough');
  truthy(/30–60/.test(html), 'window in walkthrough');
  truthy(/never suggests a dose/.test(html), 'no recommendation');
  truthy(/Trough-only sampling is discouraged/.test(html), 'LSS not trough-only');
});

t('Background: IATDMCT consensus distilled with tables and citation', function () {
  var html = ECU.ui.backgroundHtml();
  truthy(/Why model-based/.test(html), 'MAP-Bayesian section');
  truthy(/Limited sampling versus trough/.test(html), 'LSS vs trough section');
  truthy(/no evidence for adjusting/.test(html), 'no C0-guided adjustment');
  truthy(/30–60 mg·h\/L/.test(html), 'default window');
  truthy(/about-tbl/.test(html), 'uses a table');
  truthy(/Bergan S/.test(html) && /Ther Drug Monit/.test(html), 'citation');
  truthy(/20 min/.test(html) && /EC-MPS/.test(html), 'LSS times');
  truthy(/Lupus nephritis/.test(html) && /around/.test(html) && /50/.test(html), 'LN target near 50');
  truthy(/Wuttiputhanun/.test(html) && /Lupus Sci Med/.test(html), 'LN citation');
  truthy(/Nephrotic syndrome/.test(html) && /45–50/.test(html), 'NS target >45–50');
  truthy(/Querfeld/.test(html) && /Pediatr Nephrol/.test(html), 'NS citation');
  // Inclusivity guarantees that used to live in windowHint (D11): the background
  // dialog is now the single place that must cover every MPA indication.
  truthy(/Heart transplant/.test(html) && /36/.test(html), 'background must cover heart transplant (>36)');
  truthy(/Lung transplant/.test(html) && /none established/.test(html), 'background must cover lung (none established)');
  truthy(/HSCT/.test(html) && /0–24h/.test(html), 'background must cover HSCT (AUC0–24h)');
  truthy(/Liver transplant/.test(html) && /30–60/.test(html), 'background must cover liver (30–60)');
  truthy(/kidney transplant/i.test(html) && /Bergan/.test(html), 'background must cover kidney transplant with Bergan citation');
  falsy(/structural model, parameters, variability/.test(html), 'must not dump pending-model paragraph');
});

t('P0-7: log-y maps yMax to the top of the plot', function () {
  var el = { innerHTML: '' };
  ECU.chart.render(el, {
    width: 400, height: 300, logY: true,
    xMin: 0, xMax: 12, yMin: 0.1, yMax: 100,
    points: [{ x: 6, y: 100, color: '#000' }]
  });
  truthy(/<circle/.test(el.innerHTML), 'point rendered');
  var cy = /cy="([0-9.]+)"/.exec(el.innerHTML);
  truthy(cy, 'circle has cy');
  var y = parseFloat(cy[1]);
  // top of plot is m.t = 40; a point at yMax must sit near there, not at mid-plot
  assert(y < 50, 'log-y point at yMax should be near the top (cy=' + y + ')');
});

t('P2-4: SVG attributes do not contain a doubled quote before />', function () {
  var el = { innerHTML: '' };
  ECU.chart.render(el, {
    width: 400, height: 300, xMin: 0, xMax: 12, yMin: 0, yMax: 10,
    series: [{ x: [0, 12], y: [1, 2], color: '#0e7490', dash: '4 4' }]
  });
  falsy(/""\/>/.test(el.innerHTML) || /"" \/>/.test(el.innerHTML),
    'no doubled quote before />');
});

// ---------------------------------------------------------------------------
// Fit diagnostics modal (was fully coded but unreachable — audit finding)
// ---------------------------------------------------------------------------
var fs = require('fs');
var DGX = ECU.diagnostics;

t('wiring: the Fit diagnostics button exists, starts disabled, and opens the modal', function () {
  var html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  var ui = fs.readFileSync(path.join(__dirname, '..', 'src', 'ui.js'), 'utf8');
  var btn = html.match(/<button[^>]*id="btnDiag"[^>]*>/);
  truthy(!!btn, 'index.html must contain the Fit diagnostics button (id=btnDiag)');
  truthy(btn && /disabled/.test(btn[0]), 'the button must start disabled (no fit yet)');
  truthy(/btnDiag/.test(ui) && /diagModal/.test(ui), 'ui.js must bind the button to the diagnostics modal');
  truthy(/diag-gof/.test(ui), 'ui.js must render the observed-vs-predicted chart into the modal');
  truthy(/btnDiag.{0,12}\.disabled\s*=/.test(ui), 'the button enable state must track whether a fit exists');
});

t('diagnostics panel: full modal body from a real stub fit, and a guard without one', async function () {
  await withStubAsync(async function () {
    var doses = M.ssHistory({ amt: 1000, intervalHours: 12, tEnd: 120, n: 8, route: 'oral' });
    var fit = await B.runFit({
      drug: 'mpa', wt: 70, age: 45,
      doses: doses,
      obs: [{ t: 120.5, c: 8, lloq: false }, { t: 121, c: 12, lloq: false }, { t: 123, c: 4, lloq: false }],
      intervalHours: 12, winLo: 30, winHi: 60,
      mcmcIters: 400, priorDraws: 80, seed: 2
    }, { progress: function () {} });
    var spec = M.spec('mpa');
    var html = DGX.panelHtml(fit, spec);
    truthy(html && html.length > 300, 'panel must render substantial content');
    truthy(/diag-gof/.test(html), 'observed-vs-predicted chart placeholder present');
    truthy(/Individual predicted/.test(html), 'residual table with individual predictions');
    truthy(/shrink/i.test(html), 'shrinkage bars present');
    truthy(/acceptance/i.test(html), 'MCMC quality shown');
    truthy(!/undefined/.test(html), 'no undefined leaks into the panel');
    var cfg = DGX.gofChart(fit, spec);
    truthy(cfg && cfg.points.length === 3, 'gofChart config carries all 3 quantified samples');
    var el = { innerHTML: '' };
    ECU.chart.render(el, cfg);
    truthy(el.innerHTML.indexOf('<svg') === 0, 'gof config renders to valid SVG');
    // guard: no fit yet → honest placeholder, no tables
    var none = DGX.panelHtml(null, spec);
    truthy(/forecast/i.test(none), 'guard message mentions the forecast');
    falsy(/<table/.test(none), 'guard must not render tables without a fit');
  });
});

// ---------------------------------------------------------------------------
// Explore-dose: interval choice + AUC12 normalization (AUC12 = AUCx/x * 12)
// ---------------------------------------------------------------------------
t('wiring: explorer exposes the interval (12 h default, 24 h) and passes it to doseScan', function () {
  var html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  var ui = fs.readFileSync(path.join(__dirname, '..', 'src', 'ui.js'), 'utf8');
  var sel = html.match(/<select[^>]*id="iv-interval"[^>]*>[\s\S]*?<\/select>/);
  truthy(!!sel, 'index.html must contain the interval select (id=iv-interval)');
  truthy(sel && /value="12"[^>]*(selected|>)/.test(sel[0]) && /selected/.test(sel[0]), '12 h must be the default selection');
  truthy(sel && /value="24"/.test(sel[0]), '24 h must be offered');
  truthy(/iv-interval/.test(ui), 'ui.js must read the chosen interval');
  truthy(/intervalHours:\s*ivInterval/.test(ui), 'the chosen interval must reach doseScan (intervalHours: ivInterval)');
  truthy(/AUC₁₂|AUC12/i.test(ui), 'explorer output must name the AUC12 normalization');
});

t('AUC12 normalization: quantile-exact per draw; probabilities on the normalized chain', async function () {
  await withStubAsync(async function () {
    var draws = [[0, 0], [0.2, -0.1], [-0.2, 0.1], [0.05, 0.05], [-0.05, -0.05]];
    var base = { draws: draws, drug: 'mpa', wt: 70, age: 45, tEnd: 120, route: 'oral', amounts: [1000] };
    var r12 = (await B.doseScan(Object.assign({}, base, { intervalHours: 12, winLo: 30, winHi: 60 })))[0];
    var r24 = (await B.doseScan(Object.assign({}, base, { intervalHours: 24, winLo: 30, winHi: 60 })))[0];
    // exact: a positive-linear transform maps quantiles exactly
    near(r24.auc.median, r24.aucRaw.median * 12 / 24, 1e-6, 'median AUC12 = AUC24 x 12/24 exactly');
    near(r24.auc.p5, r24.aucRaw.p5 * 0.5, 1e-6, 'p5 transforms exactly');
    near(r24.auc.p95, r24.aucRaw.p95 * 0.5, 1e-6, 'p95 transforms exactly');
    // identity at x = 12
    near(r12.auc.median, r12.aucRaw.median, 1e-9, 'x=12: normalized equals raw');
    // linear PK at steady state: exposure per 12 h is interval-invariant at the
    // SAME DAILY DOSE (1000 mg q12h = 2000 mg q24h), not at the same single dose
    var r24d = (await B.doseScan(Object.assign({}, base, { intervalHours: 24, amounts: [2000], winLo: 30, winHi: 60 })))[0];
    near(r24d.auc.median, r12.auc.median, r12.auc.median * 0.08,
      '2000 mg q24h normalized matches 1000 mg q12h AUC12 within 8% (same daily dose, linear PK at SS)');
    // and at the same single dose the q24h AUC12 is ~half (half the daily dose)
    near(r24.auc.median, r12.auc.median * 0.5, r12.auc.median * 0.08,
      '1000 mg q24h normalized is ~half the 1000 mg q12h AUC12 (half the daily dose)');
    // probabilities live on the normalized chain: the identity doseScan relies on
    // is P(bounds on AUC12) == P(bounds x/12 on AUC0-x). Verified on the exported
    // probability primitives with a hand-made chain.
    var chain = [50, 70, 90, 110, 130];
    var normCh = chain.map(function (a) { return (a / 24) * 12; });
    near(B.probBetween(normCh, 30, 60), B.probBetween(chain, 60, 120), 1e-9,
      'P(30<AUC12<60) == P(60<AUC24<120): scaled-bounds identity');
    near(B.probAbove(normCh, 30), B.probAbove(chain, 60), 1e-9, 'P(AUC12>30) == P(AUC24>60)');
    near(B.probBelow(normCh, 60), B.probBelow(chain, 120), 1e-9, 'P(AUC12<60) == P(AUC24<120)');
    // guard that only passes if the scan itself uses the normalized chain: the
    // raw AUC0-24 values sit near ~100, so P(30<AUC24<60) would be 0, while the
    // normalized chain (median ~50) puts most draws inside 30-60.
    truthy(r24.auc.pInWindow >= 0.5,
      'P(within 30-60) must be computed on the AUC12 chain, not the raw AUC0-24 chain');
    // trough is a concentration at the chosen interval — NOT normalized
    truthy(r24.trough.median < r12.trough.median, 'trough C(24h) decays below C(12h)');
    eq(r24.intervalHours, 24, 'row reports the simulated interval');
  });
});

// ---------------------------------------------------------------------------
// App-wide AUC12 target: the MAIN forecast also reports 12-h equivalents,
// and card 1 states the AUC0-12h steady-state definition
// ---------------------------------------------------------------------------
t('runFit AUC12 normalization: forecast AUCs are 12-h equivalents at any interval', async function () {
  await withStubAsync(async function () {
    var base = { drug: 'mpa', wt: 70, age: 45, obs: [], winLo: 30, winHi: 60,
      mcmcIters: 300, priorDraws: 60, seed: 3 };
    var fit24 = await B.runFit(Object.assign({}, base, {
      intervalHours: 24,
      doses: M.ssHistory({ amt: 2000, intervalHours: 24, tEnd: 120, n: 8, route: 'oral' })
    }), { progress: function () {} });
    // exact: positive-linear transform maps quantiles exactly
    near(fit24.auc.median, fit24.aucRaw.median * 12 / 24, 1e-6, 'fit AUC12 = AUC0-24 x 12/24 exactly');
    near(fit24.auc.p5, fit24.aucRaw.p5 * 0.5, 1e-6, 'p5 transforms exactly');
    // probabilities are computed on the normalized chain (verify via the exported raw chain)
    var normChain = fit24.aucChain.map(function (a) { return isFinite(a) ? (a / 24) * 12 : NaN; });
    near(fit24.auc.pInWindow, B.probBetween(normChain, 30, 60), 1e-9,
      'forecast pInWindow is computed on the AUC12 chain');
    // identity at 12 h, and equal daily dose matches across intervals (linear PK)
    var fit12 = await B.runFit(Object.assign({}, base, {
      intervalHours: 12,
      doses: M.ssHistory({ amt: 1000, intervalHours: 12, tEnd: 120, n: 8, route: 'oral' })
    }), { progress: function () {} });
    near(fit12.auc.median, fit12.aucRaw.median, 1e-9, 'x=12: normalized equals raw');
    near(fit24.auc.median, fit12.auc.median, fit12.auc.median * 0.08,
      '2000 mg q24h matches 1000 mg q12h in AUC12 (same daily dose)');
  });
});

t('card 1 states the AUC0-12h steady-state target; forecast/report use equivalent wording', function () {
  var html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  var ui = fs.readFileSync(path.join(__dirname, '..', 'src', 'ui.js'), 'utf8');
  var fold = html.match(/id="windowFold"[\s\S]*?<\/details>/);
  truthy(!!fold, 'window fold must exist');
  truthy(fold && /12-hour dosing interval/.test(fold[0]), 'fold states the 12-hour dosing interval');
  truthy(fold && /steady state/i.test(fold[0]), 'fold states steady state');
  truthy(fold && /AUC₀–12h/.test(fold[0]), 'bound labels carry AUC0-12h');
  truthy((ui.match(/AUC₀–12h equivalent/g) || []).length >= 2,
    'forecast hero AND explorer both carry the 12-h-equivalent wording');
  truthy(/aucRaw/.test(ui), 'forecast output shows the raw AUC alongside');
  truthy(/data-help="window"/.test(html) && /12-hour dosing interval|12-hour equivalent/.test(ui),
    'window help explains the AUC12 basis');
});

t('summaryHint names the normalization when the fitted interval is not 12 h', function () {
  var fake = { hasObs: true, intervalHours: 24,
    auc: { median: 39.3, p5: 19.9, p95: 56.1, pInWindow: 0.72 },
    aucRaw: { median: 78.6, p5: 39.8, p95: 112.2 },
    trough: { median: 1.2, p5: 0.6, p95: 2.2 }, acceptance: 0.58 };
  var txt = DGX.summaryHint(fake);
  truthy(/AUC0–12h/.test(txt) && /equivalent/i.test(txt), 'names the AUC0-12h equivalent');
  truthy(/78\.6/.test(txt), 'carries the raw AUC0-24h');
  var t12 = DGX.summaryHint(Object.assign({}, fake, { intervalHours: 12 }));
  falsy(/equivalent/i.test(t12), 'no normalization wording at 12 h');
});

// ---------------------------------------------------------------------------
// Multi-chain pooling (V10 finding: single MAP-started chain → ESS ≈ 35,
// 65–75% coverage; 4 disperse-start chains at the SAME budget → 85%+)
// ---------------------------------------------------------------------------
t('engine: posterior draws come from pooled multi-chain sampling', async function () {
  await withStubAsync(async function () {
    var doses = M.ssHistory({ amt: 1000, intervalHours: 12, tEnd: 120, n: 8, route: 'oral' });
    var fit = await B.runFit({
      drug: 'mpa', wt: 70, age: 45,
      doses: doses, obs: [{ t: 121, c: 2, lloq: false }],
      intervalHours: 12, winLo: 30, winHi: 60,
      mcmcIters: 800, priorDraws: 60, seed: 7
    }, { progress: function () {} });
    eq(fit.nChains, 8, 'default is 8 pooled chains (1 MAP-start + 7 disperse; v1.0.1 trough-cell study: mmf-trough 80%→90%)');
    truthy(fit.draws.length >= 200, 'pooled draws present');
    var fit1 = await B.runFit({
      drug: 'mpa', wt: 70, age: 45,
      doses: doses, obs: [{ t: 121, c: 2, lloq: false }],
      intervalHours: 12, winLo: 30, winHi: 60,
      mcmcIters: 800, priorDraws: 60, seed: 7, chains: 1
    }, { progress: function () {} });
    eq(fit1.nChains, 1, 'chains=1 keeps the single-chain path');
  });
});

// ---------------------------------------------------------------------------
t('V15: S12 auto-anchor — evening-ending EC-MPS schedules report the morning window', async function () {
  // anchor-helper unit behavior
  var eve = M.ssHistory({ amt: 674, intervalHours: 12, tEnd: 380, n: 32, route: 'oral' }); // ends clock 20 = evening
  var aE = M.aucAnchor(eve, 'mpa', 'ecmps');
  eq(aE.shifted, true, 'evening-ending q12h EC-MPS history shifts');
  near(aE.t, 368, 1e-9, 'anchored at the previous (morning, clock 8) dose');
  var mor = M.ssHistory({ amt: 674, intervalHours: 12, tEnd: 368, n: 32, route: 'oral' });
  eq(M.aucAnchor(mor, 'mpa', 'ecmps').shifted, false, 'morning-ending schedule is unchanged');
  eq(M.aucAnchor(eve, 'mpa', 'mmf').shifted, false, 'MMF never shifts (fixed lag, 12h-periodic)');
  var q24 = M.ssHistory({ amt: 674, intervalHours: 24, tEnd: 380, n: 10, route: 'oral' });
  eq(M.aucAnchor(q24, 'mpa', 'ecmps').shifted, false, 'all-evening q24h EC-MPS falls back to the last dose');
  // scan level: an evening-ending scan reports the MORNING golden value, not ~38.95
  var rows = await B.doseScan({
    draws: [[0, 0, 0, 0, 0, 0, 0]],   // one draw at typical parameters (etas 0)
    drug: 'mpa', form: 'ecmps', wt: 70,
    tEnd: 380, amounts: [674], intervalHours: 12,
    winLo: 30, winHi: 60
  });
  var r = rows && rows[0];
  truthy(r, 'scan returned a row');
  truthy(r.anchorShifted, 'scan row carries the shift flag');
  near(r.aucT0, 368, 1e-9, 'scan window anchored at the morning dose');
  near(r.auc.median, GOLDEN.ecmps720MorningAUC12.auc, GOLDEN.ecmps720MorningAUC12.auc * 0.02,
    'evening-ending scan reports the morning-anchored golden (~45.26), not the evening window (~38.95)');
});

t('V16: S12 runFit window contract — grid starts at the anchor; MMF unchanged', async function () {
  var dosesE = M.ssHistory({ amt: 674, intervalHours: 12, tEnd: 380, n: 30, route: 'oral' });
  var fitE = await B.runFit({
    drug: 'mpa', wt: 70, age: 45, form: 'ecmps',
    doses: dosesE, obs: [{ t: 381, c: 1.5, lloq: false }],
    intervalHours: 12, winLo: 30, winHi: 60,
    mcmcIters: 200, priorDraws: 40, seed: 11, chains: 1
  }, { progress: function () {} });
  truthy(fitE.aucAnchorShifted, 'evening-ending EC fit reports the shift');
  near(fitE.aucT0, 368, 1e-9, 'AUC window starts at the morning dose');
  near(fitE.grid[0], fitE.aucT0, 1e-9, 'the simulated grid IS the anchored window');
  eq(fitE.lastDoseT, 380, 'lastDoseT stays the true last (evening) dose');
  var dosesM = M.ssHistory({ amt: 739, intervalHours: 12, tEnd: 380, n: 30, route: 'oral' });
  var fitM = await B.runFit({
    drug: 'mpa', wt: 70, age: 45, form: 'mmf',
    doses: dosesM, obs: [{ t: 381, c: 3, lloq: false }],
    intervalHours: 12, winLo: 30, winHi: 60,
    mcmcIters: 200, priorDraws: 40, seed: 11, chains: 1
  }, { progress: function () {} });
  eq(fitM.aucAnchorShifted, false, 'MMF is never shifted');
  near(fitM.aucT0, 380, 1e-9, 'MMF window stays at the last dose');
});
// ---------------------------------------------------------------------------
// F9/S1 (docs/METHODS_AUDIT_V101.md): closed-form propagation vs the RK45 oracle.
// The model is linear, so simulate() propagates analytically when it can and falls
// back to the ODE otherwise. The ODE stays as the permanent cross-check oracle.
// ---------------------------------------------------------------------------
var TIGHT = { method: 'ode', rtol: 1e-10, atol: 1e-13, id: 'mpa' };   // the oracle

function cfMax(closed, ode) {
  var peak = 0, i, worst = 0;
  for (i = 0; i < ode.length; i++) peak = Math.max(peak, ode[i]);
  for (i = 0; i < ode.length; i++) {
    var scale = Math.max(Math.abs(ode[i]), 1e-3 * peak);   // relative, floored in the tail
    worst = Math.max(worst, Math.abs(closed[i] - ode[i]) / scale);
  }
  return worst;
}
// disposition eigenvalues (α > β) of the 2-cmt model, for the degeneracy cases
function cfAlphaBeta(p) {
  var k10 = p.cl / p.v1, b = k10 + p.k12 + p.k21, c = k10 * p.k21;
  var d = Math.sqrt(b * b - 4 * c);
  return { alpha: (b + d) / 2, beta: (b - d) / 2 };
}
var CF_OUT = [-1, 0, 0.1, 0.25, 0.5, 1, 1.5, 2, 3, 4, 6, 8, 12, 12.3, 12.31, 20, 24, 30, 48];

t('F9/S1: closed form agrees with the tight-tolerance RK45 oracle to 1e-6 (sweep)', function () {
  var etaSets = {
    typical:   [0, 0, 0, 0, 0],
    extreme:   [0.8, -0.9, 1.0, 3.0, 1.5],
    slowV2:    [0, 0, 0, 5.0, 0],          // F20's pathological draw
    kaNearAlp: [0, 0, 0, 0, -1.4],         // ka ≈ α (audit F9 guard note)
    fastKa:    [0, 0, 0, 0, 3.0]
  };
  var forms = { mmf: [0.1], ecmps: [0.05, -0.2] };   // per-form lag etas
  var histories = {
    ss31: M.ssHistory({ amt: 739, intervalHours: 12, tEnd: 380, n: 31, route: 'oral' }),
    irregular: [{ t: 0, amt: 500, route: 'oral' }, { t: 5, amt: 250, route: 'oral' },
                { t: 17, amt: 739, route: 'oral' }, { t: 30.5, amt: 739, route: 'oral' }]
  };
  var worst = 0, n = 0;
  Object.keys(forms).forEach(function (form) {
    Object.keys(etaSets).forEach(function (en) {
      Object.keys(histories).forEach(function (hn) {
        var eta = etaSets[en].concat(forms[form]);
        var p = M.indivParams(70, null, null, null, eta, 'mpa', form, 1);
        var times = hn === 'ss31' ? CF_OUT.map(function (x) { return 368 + x; }) : CF_OUT;
        var a = M.simulate(histories[hn], times, p, { method: 'closed', id: 'mpa' });
        var o = M.simulate(histories[hn], times, p, TIGHT);
        eq(a.method, 'closed', form + '/' + en + '/' + hn + ': took the closed-form path');
        eq(a.failed, false, form + '/' + en + '/' + hn + ': no failure');
        var d = cfMax(a.c, o.c);
        truthy(d < 1e-6, form + '/' + en + '/' + hn + ': closed vs ODE max rel diff ' + d);
        worst = Math.max(worst, d); n++;
      });
    });
  });
  truthy(n === 20, 'the sweep covered all 20 combinations');
});

t('F9/S1: degenerate rates (ka = α, ka = β exactly) stay finite and correct', function () {
  var p0 = M.indivParams(70, null, null, null, [0, 0, 0, 0, 0, 0], 'mpa', 'mmf', 0);
  var ab = cfAlphaBeta(p0);
  var doses = [{ t: 0, amt: 739, route: 'oral' }, { t: 12, amt: 739, route: 'oral' }];
  [['ka = α', ab.alpha], ['ka = β', ab.beta]].forEach(function (c) {
    var p = M.indivParams(70, null, null, null, [0, 0, 0, 0, 0, 0], 'mpa', 'mmf', 0);
    p.ka = c[1];
    var a = M.simulate(doses, CF_OUT, p, { method: 'closed', id: 'mpa' });
    var o = M.simulate(doses, CF_OUT, p, TIGHT);
    eq(a.method, 'closed', c[0] + ': closed-form path');
    a.c.forEach(function (v) { truthy(isFinite(v), c[0] + ': finite concentration, got ' + v); });
    truthy(cfMax(a.c, o.c) < 1e-6, c[0] + ': matches the oracle (' + cfMax(a.c, o.c) + ')');
  });
});

t('F9/S1: routing — closed form only where it is exact; everything else keeps the ODE', function () {
  var p = M.indivParams(70, null, null, null, [0, 0, 0, 0, 0, 0], 'mpa', 'mmf', 0);
  var oral = [{ t: 0, amt: 739, route: 'oral' }];
  eq(M.simulate(oral, [1, 2], p, { id: 'mpa' }).method, 'closed', 'default engine is closed form for oral doses');
  eq(M.simulate(oral, [1, 2], p, { method: 'ode', id: 'mpa' }).method, 'ode', 'method:"ode" forces the oracle');
  eq(M.simulate([{ t: 0, amt: 100, route: 'iv' }], [1, 2], p, { id: 'mpa' }).method, 'ode', 'IV doses fall back to the ODE');
  var nl = M.indivParams(70, null, null, null, [0, 0, 0, 0, 0, 0], 'mpa', 'mmf', 0);
  nl.vmax = 5;
  eq(M.simulate(oral, [1, 2], nl, { id: 'mpa' }).method, 'ode', 'non-linear elimination falls back to the ODE');
  var prev = M.setMethod('ode');
  try {
    eq(M.simulate(oral, [1, 2], p, { id: 'mpa' }).method, 'ode', 'setMethod("ode") flips the whole engine to the oracle');
    throws(function () { M.setMethod('bogus'); }, 'Unknown simulation method');
  } finally { M.setMethod(prev); }
  eq(prev, 'closed', 'the shipped default is the closed form');
});

t('F21: closed form has no integration failure at high ka (ODE gives up at ka ≈ 600 /h)', function () {
  var doses = [{ t: 0, amt: 739, route: 'oral' }];
  var hi = M.indivParams(70, null, null, null, [0, 0, 0, 0, 5.0, 0], 'mpa', 'mmf', 0);   // ka ≈ 608 /h
  var mid = M.indivParams(70, null, null, null, [0, 0, 0, 0, 4.0, 0], 'mpa', 'mmf', 0);  // ka ≈ 224 /h
  var a = M.simulate(doses, [24], hi, { id: 'mpa' });
  var b = M.simulate(doses, [24], mid, { id: 'mpa' });
  eq(a.failed, false, 'η_KA = 5 no longer fails');
  truthy(a.c[0] > 0 && isFinite(a.c[0]), 'concentration is positive and finite (got ' + a.c[0] + ')');
  near(a.c[0] / b.c[0], 1, 0.01, 'post-absorption profile is insensitive to ka once ka ≫ α');
});

// ---------------------------------------------------------------------------
// F9/S2+S3 (docs/METHODS_AUDIT_V101.md): exact steady state and analytic AUC.
// opts.ss = { amt, every, tEnd } is an endless regimen whose last dose is at tEnd;
// opts.aucWindow = [a, b] asks simulate() for the exact ∫C dt (mg·h/L) alongside c.
// ---------------------------------------------------------------------------
function ssP(form, eta, mix) { return M.indivParams(70, null, null, null, eta, 'mpa', form, mix || 0); }
var MMF_ETA0 = [0, 0, 0, 0, 0, 0], EC_ETA0 = [0, 0, 0, 0, 0, 0, 0];
function ssAuc(form, amt, t0, eta, mix) {
  var r = M.simulate([], [t0], ssP(form, eta, mix), { id: 'mpa', ss: { amt: amt, every: 12, tEnd: 380 }, aucWindow: [t0, t0 + 12] });
  return r.auc;
}

t('S2/S3: exact steady-state AUC hits the golden anchors to 4 decimals', function () {
  near(ssAuc('mmf', 739, 380, MMF_ETA0), 46.1875, 1e-6, 'MMF 739 mg MPA q12h = dose/CL exactly');
  var mor = ssAuc('ecmps', 674, 368, EC_ETA0), eve = ssAuc('ecmps', 674, 356, EC_ETA0);
  near(mor, 45.2683, 5e-4, 'EC-MPS morning window');
  near(eve, 38.9817, 5e-4, 'EC-MPS evening window');
  near(mor + eve, 84.25, 1e-6, 'EC-MPS 24 h sum = 2 × 674/16 exactly');
});

t('S2/S3: exact SS equals a converged deep superposition (concentrations and AUC), incl. F20’s slow-V2 draw', function () {
  var sets = { typical: [0, 0, 0, 0, 0], slowV2: [0, 0, 0, 5.0, 0], extreme: [0.8, -0.9, 1.0, 3.0, 1.5] };
  var forms = { mmf: [0.1], ecmps: [0.05, -0.2] };
  var out = [368, 369, 370.5, 374, 379.9, 380, 380.4, 383, 388, 391.5, 392];
  var grid = M.intervalGrid(368, 12, 4800);
  Object.keys(forms).forEach(function (form) {
    Object.keys(sets).forEach(function (sn) {
      var p = ssP(form, sets[sn].concat(forms[form]), 1);
      // reference depth: 30 terminal half-lives, so the finite history has provably reached steady state
      var n = Math.max(200, Math.ceil(30 * Math.LN2 / cfAlphaBeta(p).beta / 12));
      var hist = M.ssHistory({ amt: 700, intervalHours: 12, tEnd: 380, n: n, route: 'oral' });
      var ref = M.simulate(hist, out, p, { id: 'mpa' });
      var ex = M.simulate([], out, p, { id: 'mpa', ss: { amt: 700, every: 12, tEnd: 380 }, aucWindow: [368, 380] });
      eq(ex.method, 'closed', form + '/' + sn + ': closed-form SS path');
      truthy(cfMax(ex.c, ref.c) < 1e-6, form + '/' + sn + ': SS concentrations vs ' + n + '-dose superposition, ' + cfMax(ex.c, ref.c));
      // AUC: analytic vs a very fine trapezoid on the same deep reference
      var fine = M.simulate(hist, grid, p, { id: 'mpa' });
      var num = M.aucFromConc(fine.c, 12, grid);
      near(ex.auc / num, 1, 2e-5, form + '/' + sn + ': analytic AUC vs 4800-interval trapezoid');
    });
  });
});

t('S3: analytic AUC of an explicit dose list equals a fine trapezoid (window straddles dose entry)', function () {
  var p = ssP('mmf', [0.2, 0, 0, 0, 0, 0]);
  var doses = [{ t: 0, amt: 500, route: 'oral' }, { t: 12, amt: 739, route: 'oral' }, { t: 24, amt: 739, route: 'oral' }];
  var grid = M.intervalGrid(10, 20, 8000);   // [10, 30] contains the entries at 12.3 and 24.3
  var r = M.simulate(doses, [10], p, { id: 'mpa', aucWindow: [10, 30] });
  var f = M.simulate(doses, grid, p, { id: 'mpa' });
  near(r.auc / M.aucFromConc(f.c, 20, grid), 1, 2e-5, 'analytic vs trapezoid');
});

t('S2: an interval the 24 h lag pattern cannot tile falls back to a finite history (unchanged behaviour)', function () {
  var p = ssP('ecmps', EC_ETA0, 0);
  var a = M.simulate([], [400, 405, 410], p, { id: 'mpa', ss: { amt: 674, every: 7.3, tEnd: 380 } });
  var b = M.simulate(M.ssHistory({ amt: 674, intervalHours: 7.3, tEnd: 380, n: M.spec('mpa').ssNDoses, route: 'oral' }), [400, 405, 410], p, { id: 'mpa' });
  a.c.forEach(function (v, i) { near(v, b.c[i], 1e-12, 'fallback == the spec-depth history'); });
});

t('F20: population forecast in steady-state mode centres on dose/CL (was −20 %)', async function () {
  var doses = M.ssHistory({ amt: 739, intervalHours: 12, tEnd: 380, n: 30, route: 'oral' });
  var fit = await B.runFit({
    drug: 'mpa', wt: 70, form: 'mmf', doses: doses, steadyState: true, obs: [],
    intervalHours: 12, winLo: 30, winHi: 60, priorDraws: 4000, seed: 5
  }, { progress: function () {} });
  near(fit.auc.median / 46.1875, 1, 0.025, 'median AUC12 within 2.5% of the typical value 46.19, got ' + fit.auc.median);
  var old = await B.runFit({
    drug: 'mpa', wt: 70, form: 'mmf', doses: doses, obs: [],
    intervalHours: 12, winLo: 30, winHi: 60, priorDraws: 4000, seed: 5
  }, { progress: function () {} });
  truthy(old.auc.median < 46.1875 * 0.9, 'without the flag the finite history is unchanged (documents F20, got ' + old.auc.median + ')');
});

t('S2: doseScan evaluates exact steady state (typical draw reads dose/CL, not the 30-dose reconstruction)', async function () {
  var rows = await B.doseScan({
    draws: [MMF_ETA0], drug: 'mpa', wt: 70, form: 'mmf',
    tEnd: 380, route: 'oral', intervalHours: 12, amounts: [739], winLo: 30, winHi: 60
  });
  near(rows[0].auc.median, 46.1875, 1e-6, 'exact SS AUC12');
});

// ---------------------------------------------------------------------------
// F7 (docs/METHODS_AUDIT_V101.md): split-R̂ and bulk ESS from per-chain draws.
// The pooled lag-1 essOf() cannot see between-chain disagreement.
// ---------------------------------------------------------------------------
function mkChains(nCh, n, gen) {
  var out = [];
  for (var c = 0; c < nCh; c++) { var a = []; for (var i = 0; i < n; i++) a.push(gen(c, i, a)); out.push(a); }
  return out;
}

t('F7: convergenceOf — iid chains: R̂ ≈ 1 and ESS ≈ N', function () {
  var g = B.gaussFactory(B.mulberry32(1));
  var r = B.convergenceOf(mkChains(4, 2000, function () { return g(); }));
  truthy(r.rhat > 0.995 && r.rhat < 1.01, 'R̂ ' + r.rhat);
  truthy(r.ess > 0.6 * 8000, 'ESS ' + r.ess + ' of 8000');
});

t('F7: convergenceOf — AR(1) φ=0.9 has ESS ≈ N(1−φ)/(1+φ)', function () {
  var g = B.gaussFactory(B.mulberry32(2));
  var r = B.convergenceOf(mkChains(4, 5000, function (c, i, a) { return i ? 0.9 * a[i - 1] + Math.sqrt(1 - 0.81) * g() : g(); }));
  var target = 20000 * 0.1 / 1.9;
  truthy(r.ess > 0.7 * target && r.ess < 1.4 * target, 'ESS ' + r.ess + ' vs theory ' + target.toFixed(0));
  truthy(r.rhat < 1.02, 'stationary chains, R̂ ' + r.rhat);
});

t('F7: convergenceOf — chains sitting in different places give a large R̂', function () {
  var g = B.gaussFactory(B.mulberry32(3));
  var r = B.convergenceOf(mkChains(4, 1000, function (c) { return (c < 2 ? 0 : 3) + g(); }));
  truthy(r.rhat > 1.5, 'R̂ ' + r.rhat);
});

t('F7: convergenceOf — a drifting chain is caught by the split (all chains drift alike)', function () {
  var g = B.gaussFactory(B.mulberry32(4));
  var r = B.convergenceOf(mkChains(4, 1000, function (c, i) { return i / 250 + 0.3 * g(); }));
  truthy(r.rhat > 1.1, 'R̂ ' + r.rhat);
});

t('F7: convergenceOf — one chain is split in two; constant chains are not an error', function () {
  var g = B.gaussFactory(B.mulberry32(5));
  var one = B.convergenceOf(mkChains(1, 4000, function () { return g(); }));
  truthy(one.rhat < 1.02 && isFinite(one.ess), 'single chain R̂ ' + one.rhat + ' ESS ' + one.ess);
  var k = B.convergenceOf(mkChains(4, 500, function () { return 1; }));
  eq(k.rhat, 1, 'a constant quantity has nothing left to disagree about');
  eq(k.ess, 2000, 'and is fully "effective"');
});

// runFit reports convergence from per-chain draws, and the shipped budget meets the bar
var F1_DOSES = M.ssHistory({ amt: 739, intervalHours: 12, tEnd: 380, n: 30, route: 'oral' });
function f1Input(obsAfter, extra) {
  return Object.assign({
    drug: 'mpa', wt: 70, form: 'mmf', doses: F1_DOSES, steadyState: true,
    obs: obsAfter.map(function (o) { return { t: 380 + o[0], c: o[1], lloq: false }; }),
    intervalHours: 12, winLo: 30, winHi: 60, seed: 20250907
  }, extra || {});
}

t('F7: runFit reports split-R̂ / ESS per eta, on log AUC12 and on the window indicator', async function () {
  var fit = await B.runFit(f1Input([[0.33, 9.1], [1, 12.4], [3, 6.0]], { mcmcIters: 8000, chains: 4 }), { progress: function () {} });
  var c = fit.convergence;
  truthy(c, 'fit.convergence present when MCMC ran');
  eq(c.rhatEta.length, fit.etaNames.length, 'one R̂ per eta');
  eq(c.essEta.length, fit.etaNames.length, 'one ESS per eta');
  truthy(isFinite(c.rhat) && c.rhat >= 0.99, 'R̂ finite: ' + c.rhat);
  truthy(isFinite(c.essMin) && c.essMin > 0, 'ESS finite: ' + c.essMin);
  truthy(isFinite(c.essIn) && c.essIn > 0, 'window-indicator ESS finite: ' + c.essIn);
  eq(c.ok, c.rhat < 1.01 && c.essMin >= 400, 'ok is exactly the R̂ < 1.01 and ESS ≥ 400 bar');
  eq(fit.ess.length, fit.etaNames.length, 'fit.ess (diagnostics modal) keeps its shape');
  eq(fit.chainLens.length, 4, 'per-chain draw counts are exposed');
  eq(fit.chainLens.reduce(function (a, b) { return a + b; }, 0), fit.nDraws, 'and add up to the pooled draws');
});

t('F7: a starved sampler is flagged not-ok (this is the shipped v1.0.1 budget, 8 × 300)', async function () {
  var fit = await B.runFit(f1Input([[0.33, 9.1], [1, 12.4], [3, 6.0]], { mcmcIters: 2400, chains: 8 }), { progress: function () {} });
  falsy(fit.convergence.ok, 'R̂ ' + fit.convergence.rhat.toFixed(3) + ', min ESS ' + Math.round(fit.convergence.essMin));
});

t('F1: the default budget converges (R̂ < 1.01, ESS > 400) and two seeds agree on P(within window) to 1 pp', async function () {
  var obs = [[0.33, 9.1], [1, 12.4], [3, 6.0]];
  var a = await B.runFit(f1Input(obs, { seed: 1 }), { progress: function () {} });
  var b = await B.runFit(f1Input(obs, { seed: 2 }), { progress: function () {} });
  [a, b].forEach(function (f, i) {
    truthy(f.convergence.ok, 'seed ' + (i + 1) + ': R̂ ' + f.convergence.rhat.toFixed(4) + ', min ESS ' + Math.round(f.convergence.essMin));
  });
  near(a.auc.pInWindow, b.auc.pInWindow, 0.01, 'P(within window) across seeds: ' + a.auc.pInWindow + ' vs ' + b.auc.pInWindow);
  near(a.auc.median, b.auc.median, 0.02 * a.auc.median, 'median across seeds');
});

t('R3 guard: reported trough and AUC are exactly C(t0+τ) and ∫C of the fit\u2019s own draws (numbers ≠ picture)', async function () {
  // oracle: the independent closed-form steady state in tools/reference_posterior.mjs (shares no code with src/)
  var ref = await import('../tools/reference_posterior.mjs');
  var fit = await B.runFit(f1Input([[0.33, 9.1], [1, 12.4], [3, 6.0]], { mcmcIters: 4000, chains: 4 }), { progress: function () {} });
  var trs = fit.draws.map(function (eta) { return ref.cSS(eta, 739, 12); });
  var aucs = fit.draws.map(function (eta) { return 739 / (16 * Math.exp(eta[0])); });   // MMF q12h: AUC0–12 = dose / CL exactly
  var st = B.statsOfChain(trs);
  near(fit.trough.median / st.median, 1, 1e-6, 'trough median vs the independent closed form on the same draws');
  near(fit.trough.p5 / st.p5, 1, 1e-6, 'trough p5');
  near(fit.trough.p95 / st.p95, 1, 1e-6, 'trough p95');
  fit.aucChain.forEach(function (a, d) { near(a / aucs[d], 1, 1e-9, 'draw ' + d + ': AUC = dose/CL'); });
  near(fit.auc.pInWindow, B.probBetween(aucs, 30, 60), 1e-9, 'P(within window) over the same draws');
});

t('F1 pin: the app\u2019s posterior matches an independent long reference chain (patients 6 and 8, worst under v1.0.1)', async function () {
  // tools/reference_posterior.mjs shares no code with src/. Under the v1.0.1 budget these two synthetic
  // patients were 16 and 13 pp off in P(within window); this test is what stops that returning.
  var ref = await import('../tools/reference_posterior.mjs');
  for (var s = 6; s <= 8; s += 2) {
    var pt = ref.syntheticPatient(s);
    var rp = ref.referencePosterior({ amtMpa: pt.amtMpa, obs: pt.obs, winLo: 30, winHi: 60, iters: 300000, chains: 4, seed: 100 + s });
    var fit = await B.runFit(f1Input(pt.obs.map(function (o) { return [o.tau, o.c]; })), { progress: function () {} });
    var tag = 'patient ' + s + ': ';
    near(fit.auc.pInWindow, rp.pIn, 0.015, tag + 'P(within window) ' + fit.auc.pInWindow + ' vs reference ' + rp.pIn);
    near(fit.auc.pAboveLower, rp.pAbove, 0.015, tag + 'P(above lower)');
    near(fit.auc.median / rp.median, 1, 0.02, tag + 'median ' + fit.auc.median + ' vs ' + rp.median);
    near(fit.auc.p5 / rp.p5, 1, 0.04, tag + 'p5 ' + fit.auc.p5 + ' vs ' + rp.p5);
    near(fit.auc.p95 / rp.p95, 1, 0.04, tag + 'p95 ' + fit.auc.p95 + ' vs ' + rp.p95);
  }
});

t('F7: convergenceNote is silent when converged and states R̂, ESS and the bar when not', function () {
  var DG = ECU.diagnostics || (require('../src/diagnostics.js'), ECU.diagnostics);
  eq(DG.convergenceNote(null), '', 'no MCMC (population forecast) → nothing to say');
  eq(DG.convergenceNote({ convergence: { ok: true, rhat: 1.002, essMin: 1500 } }), '', 'converged → silent');
  var msg = DG.convergenceNote({ convergence: { ok: false, rhat: 1.684, essMin: 13.2 } });
  truthy(/not converged/i.test(msg), 'says so: ' + msg);
  truthy(/1\.68/.test(msg) && /13/.test(msg), 'states the measured R̂ and ESS');
  truthy(/1\.01/.test(msg) && /400/.test(msg), 'states the bar');
  truthy(/approximate/i.test(msg), 'tells the reader the probabilities are approximate');
});

t('F7: the fit-diagnostics panel shows R̂, ESS and the probability\u2019s Monte Carlo error (and only warns when not converged)', async function () {
  var DG = ECU.diagnostics;
  var good = await B.runFit(f1Input([[0.33, 9.1], [1, 12.4], [3, 6.0]]), { progress: function () {} });
  var html = DG.panelHtml(good, M.spec('mpa'));
  truthy(/R̂/.test(html), 'R̂ shown');
  truthy(/effective sample size/i.test(html), 'ESS shown');
  truthy(/Monte Carlo error/i.test(html), 'MC error of P(within window) shown');
  falsy(/not converged/i.test(html), 'converged fit carries no warning');
  truthy(!/undefined|NaN/.test(html), 'no undefined/NaN leaks');
  var bad = await B.runFit(f1Input([[0.33, 9.1], [1, 12.4], [3, 6.0]], { mcmcIters: 2400 }), { progress: function () {} });
  truthy(/not converged/i.test(DG.panelHtml(bad, M.spec('mpa'))), 'starved fit is flagged in the panel');
});

t('F7: the result screen and the printed report both carry the convergence warning (ui.js wiring)', function () {
  var ui = fs.readFileSync(path.join(__dirname, '..', 'src', 'ui.js'), 'utf8');
  truthy((ui.match(/convergenceNote/g) || []).length >= 2, 'ui.js uses convergenceNote for the badge and the report');
});

t('F1: the population forecast (no samples) uses as many draws as an individual fit, so its P(window) is not sampling noise', async function () {
  var a = await B.runFit(f1Input([], { seed: 1 }), { progress: function () {} });
  var b = await B.runFit(f1Input([], { seed: 2 }), { progress: function () {} });
  truthy(a.nDraws >= 20000, 'population forecast draws: ' + a.nDraws);
  near(a.auc.pInWindow, b.auc.pInWindow, 0.01, 'P(within window) across seeds: ' + a.auc.pInWindow + ' vs ' + b.auc.pInWindow);
  near(a.auc.median / 46.1875, 1, 0.015, 'median still centres on dose/CL (F20 stays fixed): ' + a.auc.median);
});

// ---------------------------------------------------------------------------
// F2 (docs/METHODS_AUDIT_V101.md): the membership move proposes from the prior, and ofv already carries
// the −2 ln p_m prior term, so the Hastings ratio q(m)/q(m′) = p_m/p_m′ must be applied. Without it the
// chain targets p_m² · L_m. Both cases have an exactly known answer: the η part is m-independent, so
// P(m | data) ∝ p_m · exp(−lik_m / 2).
// ---------------------------------------------------------------------------
async function membershipFreq(prior, lik, seed) {
  var pen = prior.map(function (p, k) { return -2 * Math.log(p) + lik[k]; });
  var r = await B.runMCMCMix(function (x, m) { return x[0] * x[0] + pen[m || 0]; }, prior, [0], 0, [[1]],
    { iters: 400000, maxKeep: 400000 }, B.mulberry32(seed), null);
  var c = prior.map(function () { return 0; });
  r.mixChain.forEach(function (m) { c[m]++; });
  return c.map(function (x) { return x / r.mixChain.length; });
}

t('F2: with a likelihood that ignores membership, the sampled membership recovers the prior (probe B1)', async function () {
  var prior = [0.51, 0.32, 0.17];
  var f = await membershipFreq(prior, [0, 0, 0], 12345);
  prior.forEach(function (p, k) { near(f[k], p, 0.01, 'P(m=' + k + ') ' + f[k].toFixed(4) + ' vs prior ' + p); });
});

t('F2: with an informative likelihood the sampled membership equals prior × exp(−lik/2), renormalised', async function () {
  var prior = [0.51, 0.32, 0.17], lik = [3.0, 0.0, -1.5];
  var w = prior.map(function (p, k) { return p * Math.exp(-lik[k] / 2); });
  var z = w[0] + w[1] + w[2];
  var f = await membershipFreq(prior, lik, 777);
  w.forEach(function (x, k) { near(f[k], x / z, 0.01, 'P(m=' + k + ') ' + f[k].toFixed(4) + ' vs exact ' + (x / z).toFixed(4)); });
});

// F11: the convergence bar covers what the app PRINTS (AUC12, trough); a nuisance eta that mixes slowly is
// reported, not alarmed on — the calibration study found V2 / TLAG_EVE failing the all-eta bar in up to
// half the fits while the AUC agreed with the independent reference to 0.4 pp.
function convFixture(offsets) {
  // 4 chains × 400 draws of 2 etas; offsets = per-chain shift of [eta0, eta1, auc, trough]
  var g = B.gaussFactory(B.mulberry32(9)), draws = [], auc = [], tr = [], lens = [];
  for (var c = 0; c < 4; c++) {
    lens.push(400);
    for (var i = 0; i < 400; i++) {
      draws.push([offsets[0][c] + g(), offsets[1][c] + g()]);
      auc.push(Math.exp(3.5 + offsets[2][c] + 0.2 * g()));
      tr.push(Math.exp(0.5 + offsets[3][c] + 0.3 * g()));
    }
  }
  return B.fitConvergence(draws, lens, auc, tr, 30, 60, 2, ['CL', 'V2']);
}
var FLAT = [0, 0, 0, 0], DRIFT = [0, 2, 0, 3];

t('F11: a slowly-mixing nuisance eta is reported but does not fail the bar when AUC12 and trough have converged', function () {
  var c = convFixture([FLAT, DRIFT, FLAT, FLAT]);
  truthy(c.rhatEta[1] > 1.5, 'the nuisance eta really is unconverged: R̂ ' + c.rhatEta[1]);
  truthy(c.ok, 'bar is on the printed quantities: R̂ ' + c.rhat + ', ESS ' + c.essMin);
  eq(c.etaSlow.join(','), 'V2', 'and the slow parameter is named');
});

t('F11: a non-converged trough or AUC12 still fails the bar', function () {
  falsy(convFixture([FLAT, FLAT, FLAT, DRIFT]).ok, 'trough chains disagree');
  falsy(convFixture([FLAT, FLAT, DRIFT, FLAT]).ok, 'AUC12 chains disagree');
});

// ---------------------------------------------------------------------------
// F3 (docs/METHODS_AUDIT_V101.md): a short typed history in "Full schedule" mode is not steady state.
// The single-dose guard generalises: warn whenever the entered span is under 5 terminal half-lives.
// ---------------------------------------------------------------------------
t('F3: terminalHalfLife is ln2/β — the typical patient reads the golden 39.8 h', function () {
  near(M.terminalHalfLife(M.indivParams(70, null, null, null, [0, 0, 0, 0, 0, 0], 'mpa', 'mmf', 0)), GOLDEN.terminalHalfLifeH, 0.3, 'typical terminal half-life');
});

t('F3: the deficit the warning is about is real (typical MMF 1000 mg BID: ≈ −26 % at 2 days, ≈ −8 % at 5 days)', function () {
  var p = M.indivParams(70, null, null, null, [0, 0, 0, 0, 0, 0], 'mpa', 'mmf', 0);
  function auc(n) {
    var d = M.ssHistory({ amt: 739, intervalHours: 12, tEnd: 380, n: n, route: 'oral' });
    return M.simulate(d, [380], p, { id: 'mpa', aucWindow: [380, 392] }).auc / (739 / 16) - 1;
  }
  near(auc(4), -0.264, 0.02, '4 doses (2 days)');
  near(auc(10), -0.076, 0.02, '10 doses (5 days)');
  near(auc(11), -0.062, 0.01, '11 doses (10 intervals — the case V12 tests)');
});

t('F3: runFit warns on a short history (2 days) and not on a long one, a single dose keeps its own flag, steady-state mode is silent', async function () {
  function run(n, extra) {
    return B.runFit(Object.assign({ drug: 'mpa', wt: 70, form: 'mmf', obs: [], intervalHours: 12, winLo: 30, winHi: 60, priorDraws: 400, seed: 3,
      doses: M.ssHistory({ amt: 739, intervalHours: 12, tEnd: 380, n: n, route: 'oral' }) }, extra || {}), { progress: function () {} });
  }
  var two = await run(4);
  truthy(two.warnShortHistory, '2-day history flagged');
  falsy(two.warnSingleDose, 'and is not the single-dose case');
  near(two.historySpanH, 36, 1e-9, 'span reported in hours');
  truthy(two.historyNeedH > 190 && two.historyNeedH < 210, 'need ≈ 5 × 39.8 h: ' + two.historyNeedH);
  falsy((await run(30)).warnShortHistory, '30 doses (14.5 days) is long enough');
  var one = await run(1);
  truthy(one.warnSingleDose, 'single dose keeps warnSingleDose');
  falsy(one.warnShortHistory, 'and is reported once, not twice');
  falsy((await run(4, { steadyState: true })).warnShortHistory, 'steady-state mode: the history is an expansion, not what was typed');
});

t('F3: shortHistoryNote states the span, the need and the remedy; silent otherwise', function () {
  var DG = ECU.diagnostics;
  eq(DG.shortHistoryNote({ warnShortHistory: false }), '', 'silent');
  var msg = DG.shortHistoryNote({ warnShortHistory: true, historySpanH: 36, historyNeedH: 199 });
  truthy(/36 h/.test(msg) && /199 h/.test(msg), 'span and need: ' + msg);
  truthy(/Steady state/.test(msg), 'names the remedy');
});

// F4/F10 — the report is built from DOM code Node cannot run, so guard its structure (verified in a browser too):
// every live read inside renderReport must be the fallback branch of `view ? … : live`, and the fitting settings print.
function reportSource() {
  var ui = fs.readFileSync(path.join(__dirname, '..', 'src', 'ui.js'), 'utf8');
  var a = ui.indexOf('function renderReport()'), b = ui.indexOf('function bind()');
  return ui.slice(a, b);
}
t('F4: renderReport reads the run snapshot, and every live-field read is the no-forecast fallback', function () {
  var src = reportSource();
  truthy(/state\.lastRunView/.test(src), 'uses the snapshot taken when the forecast was produced');
  var live = /effectiveDoses\(\)|windowBounds\(\)|state\.obs\b|currentForm\(\)|\$\('pt-code'\)|\$\('pt-wt'\)/;
  src.split('\n').forEach(function (line) {
    if (live.test(line)) truthy(/view \?/.test(line), 'live read outside the fallback: ' + line.trim());
  });
  truthy(/Inputs changed on screen since this forecast/.test(src), 'stamps a report whose inputs changed after the fit');
});

t('F10: the printed report carries the dosing-input mode and the recency preset', function () {
  var ui = fs.readFileSync(path.join(__dirname, '..', 'src', 'ui.js'), 'utf8');
  var a = ui.indexOf('function fittingSettingsText'), b = ui.indexOf('function renderReport()');
  var fn = ui.slice(a, b);
  truthy(/Dosing input/.test(fn) && /recency/i.test(fn), 'settings text names both');
  truthy(/fittingSettingsText\(/.test(reportSource()), 'renderReport prints it');
});

// ---------------------------------------------------------------------------
// F5 / F6 / F18 — diagnostics panels against the SHIPPED spec (the old tests ran the stub spec, whose error
// model and eta layout differ, so they could not go red for the bugs below).
// ---------------------------------------------------------------------------
async function realFit(form, obs) {
  return B.runFit({ drug: 'mpa', wt: 70, form: form, steadyState: true,
    doses: M.ssHistory({ amt: form === 'mmf' ? 739 : 674, intervalHours: 12, tEnd: 380, n: 30, route: 'oral' }),
    obs: obs.map(function (o) { return { t: 380 + o[0], c: o[1], lloq: false }; }),
    intervalHours: 12, winLo: 30, winHi: 60, mcmcIters: 8000, chains: 4, seed: 5 }, { progress: function () {} });
}

t('F5: the goodness-of-fit ±2 SD band is finite and multiplicative for the log error model', async function () {
  var DG = ECU.diagnostics, spec = M.spec('mpa');
  var fit = await realFit('mmf', [[0.33, 9.1], [1, 12.4], [3, 6.0]]);
  var band = DG.gofChart(fit, spec).bands[0];
  truthy(band.lo.length === 21 && band.hi.length === 21, 'band drawn on 21 points');
  band.lo.forEach(function (v, k) {
    truthy(isFinite(v) && isFinite(band.hi[k]), 'point ' + k + ' finite');
    near(v, band.x[k] * Math.exp(-2 * 0.39), 1e-9, 'lower edge = v·e^(−2σ)');
    near(band.hi[k], band.x[k] * Math.exp(2 * 0.39), 1e-9, 'upper edge = v·e^(+2σ)');
  });
});

t('F6: shrinkage bars show a value for every eta, lag-time etas included, for both formulations', async function () {
  var DG = ECU.diagnostics, spec = M.spec('mpa');
  var cases = [['mmf', [[0.33, 9.1], [1, 12.4], [3, 6.0]]], ['ecmps', [[1.5, 9.5], [2, 12], [4, 6]]]];
  for (var i = 0; i < cases.length; i++) {
    var fit = await realFit(cases[i][0], cases[i][1]);
    var html = DG.panelHtml(fit, spec);
    var pcts = (html.match(/<span class="shrink-pct">[^<]*<\/span>/g) || []).slice(0, fit.etaNames.length);
    eq(pcts.length, fit.etaNames.length, cases[i][0] + ': one bar per eta');
    pcts.forEach(function (x, k) { truthy(/\d+%/.test(x), cases[i][0] + ': η-' + fit.etaNames[k] + ' reads a percentage, got ' + x); });
  }
});

t('F18: residual colours are in units of σ on the log scale (green ≤ 1.5σ, amber ≤ 2.5σ, red beyond), not fixed 30 % / 60 %', function () {
  var DG = ECU.diagnostics;
  function lvl(ratio) {
    return DG.residualRows({ drug: 'mpa', obsData: [{ t: 1, c: ratio, ipred: 1, lloq: false }] })[0].level;
  }
  eq(lvl(1.5), 'ok', '×1.5 is 1.0σ — an ordinary sample (was amber under the 30 % rule)');
  eq(lvl(2), 'warn', '×2 is 1.8σ');
  eq(lvl(0.5), 'warn', '÷2 is 1.8σ');
  eq(lvl(3.5), 'bad', '×3.5 is 3.2σ');
  eq(lvl(0.2), 'bad', '÷5 is 4.1σ');
  truthy(/1\.5 ?σ/.test(DG.panelHtml(null, M.spec('mpa')) + DG.residualLegend({ drug: 'mpa' })), 'the legend states the σ thresholds');
});

t('F8: the model card states the ciclosporin context accurately (tested and not significant, but no MMF patient was ciclosporin-free)', function () {
  var a = M.spec('mpa').assumptions.filter(function (x) { return /ciclosporin/i.test(x); });
  eq(a.length, 1, 'one entry');
  truthy(/100 ?%/.test(a[0]) && /72 ?%/.test(a[0]), 'co-medication rates from Table II');
  truthy(/not significant|no significant/i.test(a[0]), 'the authors\u2019 covariate test result');
  truthy(/tacrolimus/i.test(a[0]) && /30.60/.test(a[0]), 'what it does not cover: tacrolimus, and the window\u2019s own evidence base');
});

// ---------------------------------------------------------------------------
// F23 / R3 (docs/METHODS_AUDIT_V101.md): samples outside [0, τ] after the AUC anchor were silently not drawn
// (for an evening-ending EC-MPS schedule ALL of them). The picture gets its own grid; the numbers keep theirs.
// ---------------------------------------------------------------------------
t('F23: chart x-range widens to cover every sample and the whole curve, never narrows below [0, τ]', function () {
  var CH = ECU.chart;
  var a = CH.xRange([0, 3, 12], [13.5, 14, 16]);
  eq(a.xMin, 0); eq(a.xMax, 16);
  var b = CH.xRange([0, 3, 12], [-2, 5]);
  eq(b.xMin, -2); eq(b.xMax, 12);
  var c = CH.xRange([0, 3, 12], []);
  eq(c.xMin, 0); eq(c.xMax, 12);
  var d = CH.xRange([-4, 0, 12, 18], [1]);
  eq(d.xMin, -4, 'a curve already extended to the left keeps its extent'); eq(d.xMax, 18);
});

t('F23: runFit draws the curve and band over samples outside the AUC window — and the numbers do not move', async function () {
  var ref = await import('../tools/reference_posterior.mjs');
  var inside = f1Input([[0.33, 9.1], [1, 12.4], [3, 6.0]]);
  var outside = f1Input([[0.33, 9.1], [1, 12.4], [3, 6.0], [-1.5, 3.2], [13.5, 8.0]]);   // one before the anchor, one after τ
  var a = await B.runFit(inside, { progress: function () {} });
  var b = await B.runFit(outside, { progress: function () {} });
  // window grid untouched: it is what the AUC and trough integrate over
  near(b.grid[0], b.aucT0, 1e-9, 'fit.grid still starts at the anchor');
  near(b.grid[b.grid.length - 1] - b.grid[0], 12, 1e-9, 'and still spans exactly τ');
  // the chart grid covers the samples
  truthy(b.chartGrid[0] <= b.aucT0 - 1.5 + 1e-9, 'chart starts at or before the earliest sample: ' + (b.chartGrid[0] - b.aucT0));
  truthy(b.chartGrid[b.chartGrid.length - 1] >= b.aucT0 + 13.5 - 1e-9, 'chart ends at or after the latest sample');
  eq(b.chartBand.median.length, b.chartGrid.length, 'band lives on the chart grid');
  eq(b.priorBand.median.length, b.chartGrid.length, 'so does the prior band');
  eq(a.chartGrid.length, a.grid.length, 'with all samples inside the window the two grids coincide');
  // trough and AUC of the fit with the outside samples are still exactly C(t0+τ) and dose/CL of ITS draws
  var trs = b.draws.map(function (eta) { return ref.cSS(eta, 739, 12); });
  var aucs = b.draws.map(function (eta) { return 739 / (16 * Math.exp(eta[0])); });
  near(b.trough.median / B.statsOfChain(trs).median, 1, 1e-6, 'trough median = C(t0+τ)');
  near(b.auc.median / B.statsOfChain(aucs).median, 1, 1e-6, 'AUC median = dose/CL');
});

// R2: the de Winter parameters are CL/F, V/F …, so an IV dose through them is wrong; the route selector goes,
// the explorer's iv-* ids ("intervention", not intravenous) stay, and legacy sessions are coerced to oral.
t('R2: no route selector on the dosing card; explorer controls untouched; imported IV doses become oral', function () {
  var html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  var ui = fs.readFileSync(path.join(__dirname, '..', 'src', 'ui.js'), 'utf8');
  falsy(/id="dose-route"/.test(html), 'the <select> is gone');
  falsy(/dose-route/.test(ui), 'and nothing reads it');
  ['iv-amt', 'iv-interval', 'iv-run', 'iv-out', 'iv-status'].forEach(function (id) {
    truthy(html.indexOf('id="' + id + '"') >= 0, 'explorer control ' + id + ' is still there');
  });
  var a = ui.indexOf('function applySession'), b = ui.indexOf('renderDoseTable(); renderObsTable(); renderDrugAndCovariates(); applyMode();');
  truthy(/state\.doses = [\s\S]*route: 'oral'/.test(ui.slice(a, b)), 'applySession coerces every imported dose to oral');
  eq(M.spec('mpa').adminRoutes.join(','), 'oral', 'the spec itself declares oral only');
});

t('F12 (golden rule 7c): the therapeutic-window bounds carry no step grid', function () {
  var html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  ['pt-winlo', 'pt-winhi'].forEach(function (id) {
    var m = html.match(new RegExp('<input[^>]*id="' + id + '"[^>]*>'));
    truthy(m, id + ' exists');
    truthy(/step="any"/.test(m[0]), id + ' must use step="any": ' + m[0].replace(/title="[^"]*"/, ''));
  });
});

t('F13: the README and the app cite the lupus nephritis meta-analysis identically (Lupus Sci Med 2024;11:e001093, Crossref-verified)', function () {
  var readme = fs.readFileSync(path.join(__dirname, '..', 'README.md'), 'utf8');
  var ui = fs.readFileSync(path.join(__dirname, '..', 'src', 'ui.js'), 'utf8');
  falsy(/Ther Adv Drug Saf/.test(readme), 'README no longer names the wrong journal');
  truthy(/Lupus Sci Med\*? 2024;11:e001093/.test(readme), 'README: Lupus Sci Med 2024;11:e001093');
  truthy(/Lupus Sci Med<\/i> 2024;11:e001093/.test(ui), 'app: the same');
});

t('F15: the recorded steady-state deficit is the measured one (no leftover 4.4 % claim about n = 10)', function () {
  ['docs/IMPLEMENTATION_PLAN_DEWINTER_2008.md', 'docs/VERIFICATION_TEAM.md', 'docs/MODEL_ANALYSIS_DEWINTER_2008.md'].forEach(function (f) {
    var txt = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
    falsy(/4\.4 ?% (SS )?deficit|deficit (at n=10 )?is 4\.4/.test(txt), f + ' still records 4.4 %');
  });
});

t('F17: the model card says a history is one formulation — a switch MMF↔EC-MPS is not modelled', function () {
  var a = M.spec('mpa').assumptions.filter(function (x) { return /switch/i.test(x); });
  eq(a.length, 1, 'one entry');
  truthy(/one formulation/i.test(a[0]) && /converted/i.test(a[0]) && /since the switch/i.test(a[0]), 'states what happens and what to do: ' + a[0]);
});

// R1 + R4 (owner decisions): the assay field, the LLOQ / error-multiplier settings and the per-sample “< LLOQ”
// box are gone (censoring is not supported); legacy sessions must still import.
t('R1/R4: none of the removed controls or copy survive in the page, the UI code, the report or the engine', function () {
  var html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  var ui = fs.readFileSync(path.join(__dirname, '..', 'src', 'ui.js'), 'utf8');
  var eng = fs.readFileSync(path.join(__dirname, '..', 'src', 'bayes.js'), 'utf8');
  ['pt-assay', 'pt-lloq', 'pt-errmult', 'obs-lloq', 'assayOptions'].forEach(function (id) {
    falsy(html.indexOf(id) >= 0, 'index.html still has ' + id);
    falsy(ui.indexOf(id) >= 0, 'ui.js still references ' + id);
  });
  falsy(/data-help="(lloq|lloqbox|errmult)"/.test(html), 'no help buttons for the removed controls');
  falsy(/\b(lloq|lloqbox|errmult):/.test(ui), 'no help text for them either');
  falsy(/Record the assay method/.test(ui), 'no copy telling the user to record an assay that has no field');
  falsy(/<th>Assay<\/th>/.test(reportSource()), 'the report has no Assay row');
  falsy(/logPhi|M3/.test(eng.replace(/\/\*[\s\S]*?\*\//g, '')), 'the M3 censored likelihood is gone from the engine code');
});

t('R1/R4: legacy sessions import — old assay / LLOQ / multiplier keys are ignored, censored samples are dropped with a message', function () {
  var ui = fs.readFileSync(path.join(__dirname, '..', 'src', 'ui.js'), 'utf8');
  var a = ui.indexOf('function applySession'), b = ui.indexOf('function renderReport()');
  var fn = ui.slice(a, b);
  truthy(/lloq/.test(fn) && /below-LLOQ|censor/i.test(fn), 'applySession recognises censored samples in an old file');
  truthy(/toast\([^)]*(below-LLOQ|censor)/i.test(fn) || /below-LLOQ[\s\S]{0,200}toast|toast[\s\S]{0,200}below-LLOQ/i.test(fn), 'and tells the user how many were not imported');
});

// ---------------------------------------------------------------------------
// NONMEM cross-check (tools/nonmem_verify/, docs/NONMEM_CROSSCHECK.md): reference numbers computed by NONMEM 7.6.0.
// ---------------------------------------------------------------------------
var NMG = JSON.parse(fs.readFileSync(path.join(__dirname, 'nonmem_golden.json'), 'utf8'));

t('NONMEM: the structural model reproduces NONMEM\u2019s predictions (both formulations, steady state, lag, extreme etas)', function () {
  truthy(NMG.structural.length >= 20, 'reference cases present: ' + NMG.structural.length);
  var worst = 0;
  NMG.structural.forEach(function (c, i) {
    var p = M.indivParams(70, null, null, null, c.eta, 'mpa', c.form, c.mix);
    var r = M.simulate([], c.taus.map(function (t) { return 368 + t; }), p, { id: 'mpa', ss: { amt: c.amt, every: 12, tEnd: 368 } });
    var peak = Math.max.apply(null, c.nonmem);
    c.nonmem.forEach(function (nm, k) {
      var rel = Math.abs(r.c[k] - nm) / Math.max(nm, 1e-3 * peak);
      worst = Math.max(worst, rel);
      truthy(rel < 1e-6, c.form + ' case ' + i + ' t=' + c.taus[k] + ' h: app ' + r.c[k] + ' vs NONMEM ' + nm + ' (rel ' + rel + ')');
    });
  });
  truthy(worst < 1e-6, 'worst relative difference ' + worst);
});

t('NONMEM: the app\u2019s MAP equals NONMEM\u2019s POSTHOC EBE where the solution is unique (etas and mixture subgroup)', async function () {
  truthy(NMG.posthoc.length >= 10, 'reference cases present: ' + NMG.posthoc.length);
  for (var i = 0; i < NMG.posthoc.length; i++) {
    var c = NMG.posthoc[i];
    var fit = await B.runFit({
      drug: 'mpa', wt: 70, form: c.form, steadyState: true,
      doses: M.ssHistory({ amt: c.amt, intervalHours: 12, tEnd: 368, n: 30, route: 'oral' }),
      obs: c.obs.map(function (o) { return { t: 368 + o.tau, c: o.c }; }),
      intervalHours: 12, winLo: 30, winHi: 60, mcmcIters: 300, chains: 1, priorDraws: 400, seed: 7
    }, { progress: function () {} });
    eq(fit.map.mixIdx, c.mix, c.design + ' #' + i + ': same mixture subgroup');
    c.eta.forEach(function (nm, k) {
      near(fit.map.eta[k], nm, 1e-3, c.design + ' #' + i + ' η-' + fit.map.etaNames[k] + ': app ' + fit.map.eta[k] + ' vs NONMEM ' + nm);
    });
  }
});

// ---------------------------------------------------------------------------
// Phone layout (a real iPhone screenshot showed the page wider than the screen). Node cannot measure layout, so
// these guard the rules that fixed it; the measurement itself is done in an emulated phone viewport.
// ---------------------------------------------------------------------------
t('mobile: the stepper may wrap, a phone breakpoint exists, and inputs are 16 px there (iOS zooms into smaller ones)', function () {
  var css = fs.readFileSync(path.join(__dirname, '..', 'src', 'app.css'), 'utf8');
  var stepper = css.match(/\.stepper \{[^}]*\}/);
  truthy(stepper && /flex-wrap:\s*wrap/.test(stepper[0]), 'the four-step strip must be allowed to wrap (its unwrapped width, ≈515 px, forced the page wider than a phone)');
  var mq = css.match(/@media \(max-width: (\d+)px\) \{([\s\S]*?)\n\}/);
  truthy(mq && +mq[1] >= 480 && +mq[1] <= 700, 'a phone breakpoint block exists');
  truthy(/input, select, textarea \{[^}]*font-size:\s*16px/.test(mq[2]), 'form fields are 16 px on phones');
  truthy(/\.sessionbar input, \.sessionbar select \{[^}]*width:\s*100%/.test(mq[2]), 'patient-card fields fill the card instead of a fixed 160 px');
  truthy(/-webkit-text-size-adjust/.test(css), 'iOS text inflation is switched off');
  truthy(/\nselect \{[^}]*max-width:\s*100%/.test(css), 'selects cannot outgrow their container (the recency menu was 389 px wide)');
});

t('mobile: the charts use the compact (phone) layout on a narrow screen instead of a 960 px SVG scaled to a third', function () {
  var ui = fs.readFileSync(path.join(__dirname, '..', 'src', 'ui.js'), 'utf8');
  truthy(/function isNarrow\(\)/.test(ui), 'one place decides what "narrow" means');
  truthy((ui.match(/compact:\s*isNarrow\(\)|\.compact = isNarrow\(\)/g) || []).length >= 2, 'both the forecast chart and the goodness-of-fit chart use it');
  truthy(/addEventListener\('resize'/.test(ui), 'rotating the phone redraws the chart');
});

// ---------------------------------------------------------------------------
// ST4 (v1.2.1): shrinkage is Var(posterior)/ω² — HIGH when the samples did not move the estimate. Until v1.1.1 the
// engine returned 1 − Var/ω² (information gained), so well-informed fits showed red bars and the "interval is mostly
// population variability" note fired for data-rich fits and never for sparse ones. Measured values: docs/METHODS_AUDIT_V101.md.
// ---------------------------------------------------------------------------
t('ST4: shrinkageOf is Var(posterior)/ω² — 0 for a posterior collapsed on a point, 1 for the prior, 0.25 for a quarter of it', function () {
  function draws(variance, n) {            // symmetric two-point sample with the requested (n−1) sample variance
    var c = Math.sqrt(variance * (n - 1) / n), out = [];
    for (var i = 0; i < n; i++) out.push([i % 2 ? c : -c]);
    return out;
  }
  near(B.shrinkageOf(draws(0.09, 100), [0.09])[0], 1, 1e-9, 'posterior as wide as the prior → shrinkage 1');
  near(B.shrinkageOf(draws(0.0225, 100), [0.09])[0], 0.25, 1e-9, 'a quarter of the prior variance left → 0.25');
  near(B.shrinkageOf(draws(0, 100), [0.09])[0], 0, 1e-9, 'collapsed posterior → 0');
  eq(B.shrinkageOf(draws(0.5, 100), [0.09])[0], 1, 'wider than the prior is clamped to 1');
  truthy(isNaN(B.shrinkageOf(draws(0.09, 100), [0])[0]), 'no prior variance → no shrinkage (NaN, shown as –)');
});

t('ST4: population forecast raises the CL-shrinkage note; a 6-sample fit does not (the note was inverted)', async function () {
  var DG = ECU.diagnostics;
  var pop = await realFit('mmf', []);
  var rich = await realFit('mmf', [[0.33, 9.1], [0.67, 14], [1, 12.4], [2, 8], [3, 6], [6, 4]]);
  var ci = pop.etaNames.indexOf('CL');
  truthy(pop.shrink[ci] > 0.9, 'population forecast: CL shrinkage ≈ 1, got ' + pop.shrink[ci]);
  truthy(rich.shrink[ci] < 0.4, '6 samples: CL shrinkage is low, got ' + rich.shrink[ci]);
  truthy(/population variability/.test(DG.shrinkageNote(pop)), 'no samples → the note appears');
  eq(DG.shrinkageNote(rich), '', 'six samples across the interval → no note');
});

t('ST4: a 3-point LSS keeps 0.5–0.8 of the CL variance (below the trigger — no note); a trough-only fit is far from the population forecast', async function () {
  var DG = ECU.diagnostics;
  var pop = await realFit('mmf', []);
  var lss = await realFit('mmf', [[0.33, 9.1], [1, 12.4], [3, 6.0]]);
  var tr = await realFit('mmf', [[12, 3.0]]);
  var ci = lss.etaNames.indexOf('CL');
  truthy(lss.shrink[ci] > 0.5 && lss.shrink[ci] < 0.8, '3-point LSS: CL shrinkage in (0.5, 0.8), got ' + lss.shrink[ci]);
  truthy(tr.shrink[ci] < pop.shrink[ci] - 0.3, 'trough only: well below the population forecast (' + tr.shrink[ci] + ' vs ' + pop.shrink[ci] + ')');
  eq(DG.shrinkageNote(lss), '', '3-point LSS: no note');
  eq(DG.shrinkageNote(tr), '', 'trough only: no note (CL shrinkage 0.4–0.6, under the 0.8 trigger)');
});

t('ST4: the diagnostics bars show shrinkage — a well-informed CL is green, a poorly informed Q is red — and equal fit.shrink', async function () {
  var DG = ECU.diagnostics, spec = M.spec('mpa');
  var rich = await realFit('mmf', [[0.33, 9.1], [0.67, 14], [1, 12.4], [2, 8], [3, 6], [6, 4]]);
  var html = DG.panelHtml(rich, spec);
  var rows = html.match(/<div class="shrink-row">[\s\S]*?<\/span><\/div>/g).slice(0, rich.etaNames.length);
  function bar(nm) {
    var k = rich.etaNames.indexOf(nm);
    return { cls: (rows[k].match(/shrink-fill( \w+)?"/)[1] || '').trim(), pct: +rows[k].match(/shrink-pct">(\d+)%/)[1], k: k };
  }
  var cl = bar('CL'), q = bar('Q');
  eq(cl.pct, Math.round(100 * rich.shrink[cl.k]), 'CL: the bar equals fit.shrink');
  eq(q.pct, Math.round(100 * rich.shrink[q.k]), 'Q: the bar equals fit.shrink');
  eq(cl.cls, '', 'six samples: the CL bar (shrinkage ' + cl.pct + '%) is not red');
  eq(q.cls, 'weak', 'Q is hardly informed by the samples: its bar (' + q.pct + '%) is red');
  truthy(/High shrinkage \(&gt; 60%, red\) means the data did not inform/.test(html), 'legend wording matches the quantity');
});

t('ST4: tacrolimus keeps its own convention — its note tests INFORMATION (1 − fit.shrink) < 0.3, its bars show information', function () {
  var ui = fs.readFileSync(path.join(__dirname, '..', 'src', 'ui.js'), 'utf8');
  var fn = ui.slice(ui.indexOf('function renderResultsTac'), ui.indexOf('One definition of "narrow"'));
  truthy(/1 - fit\.shrink\[ci\] < 0\.3/.test(fn), 'the tacrolimus note fires on low information, i.e. on shrinkage above 0.7');
  var dg = fs.readFileSync(path.join(__dirname, '..', 'src', 'diagnostics.js'), 'utf8');
  truthy(/if \(!tacInfo && isFinite\(sh\)\) sh = 1 - sh;/.test(dg), 'only the non-tacrolimus (MPA) bars are flipped to shrinkage');
});

// ---------------------------------------------------------------------------
h.runAll().then(function (ok) {
  if (!ok) process.exit(1);
}).catch(function (e) {
  console.error(e);
  process.exit(1);
});
