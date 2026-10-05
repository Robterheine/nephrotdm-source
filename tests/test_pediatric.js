/* =========================================================================
 * NephroTDM: pediatric test suite (tacrolimus, children with a kidney transplant; MPA is added with its engine)
 * Run: node tests/test_pediatric.js   (part of `npm test`)
 *
 * The oracle is tools/nonmem_verify/ped/ped_oracle.mjs: a general matrix exponential written from the NONMEM streams. It shares no code
 * with src/tacped.js. Its reference numbers were reproduced against the hand-off table (tools/nonmem_verify/ped/ref_ped.mjs) and the
 * streams themselves against NONMEM 7.6 (docs/NONMEM_CROSSCHECK_PEDIATRIC.md). Every assertion can fail (README rule 7b); the sabotage
 * record is in docs/VERIFICATION_PEDIATRIC.md.
 * ========================================================================= */
'use strict';
var h = require('./harness.js');
var t = h.t, eq = h.eq, near = h.near, throws = h.throws, truthy = h.truthy, falsy = h.falsy;

['version', 'model', 'tacrolimus', 'everolimus', 'tacped', 'mpaped', 'texts_tacped', 'texts_mpaped', 'bayes', 'parallel', 'chart', 'diagnostics', 'texts_tac', 'texts_evr', 'author_photo', 'report', 'ui'].forEach(function (f) { require('../src/' + f + '.js'); });
var ECU = globalThis.ECU, M = ECU.model, B = ECU.bayes;
var S = M.spec('tacped'), T = S.custom, K = T.constants;
var SM = M.spec('mpaped'), TM = SM.custom, KM = TM.constants;

var O = null;   // the oracle (an ES module), loaded once
async function oracle() { return O || (O = await import('../tools/nonmem_verify/ped/ped_oracle.mjs')); }

function ex(hct, wt) { return { _norm: true, wt: wt || 25, hct: hct, assay: 'lcms', nOcc: 0, occDays: [] }; }
function P(wt, hct, eta) { return M.indivParams(wt, null, null, ex(hct, wt), eta || [0, 0, 0], 'tacped'); }
function rel(a, b) { return Math.abs(a - b) / Math.abs(b); }
function grid(t0, tau, perHour) { var g = [], n = tau * perHour; for (var i = 0; i <= n; i++) g.push(t0 + i * tau / n); return g; }
var G12 = grid(0, 12, 4);

// ---------------------------------------------------------------------------
// spec
// ---------------------------------------------------------------------------
t('spec: pediatric tacrolimus is registered, ready, µg/L, proportional error, per-dose formulation, citations of both papers', function () {
  eq(S.id, 'tacped'); eq(S.pending, false);
  eq(S.units.conc, 'µg/L'); eq(S.units.auc, 'µg·h/L'); eq(S.units.dose, 'mg');
  near(S.SIGMA.PROP, 0.0374, 1e-12); eq(S.SIGMA.ADD, 0); truthy(!(S.SIGMA.LOG > 0), 'proportional, not log-scale');
  truthy(/Schijvens/.test(S.article) && /Heida/.test(S.article) && /2026/.test(S.article));
  truthy(M.listDrugs().some(function (d) { return d.id === 'tacped'; }));
  eq(S.card.name, 'Tacrolimus (pediatric kidney)');
  eq(K.HCT_REF, 0.35); eq(K.NSTAGE, 3);
  eq(T.etaNames({}).join(','), 'KA,CLINT,V3');
  var om = T.omega({});
  near(om.vars[0], 0.644, 1e-12); near(om.vars[1], 0.456, 1e-12); near(om.vars[2], 0.692, 1e-12);
  eq(S.requiresWt, true); eq(S.wtMin, 3); eq(S.wtMax, 200);
  eq(S.windowOptional, true); eq(S.windowDefaultLo, null); eq(S.troughDefaultLo, null); eq(S.windowStandard, null);
});

t('spec: window sets are the four AUC sets and the two trough sets of the hand-off, none preselected', function () {
  var w = {}; S.windowSets.forEach(function (x) { w[x.id] = x; truthy(x.label && x.basis && x.grade, x.id + ' has label, basis, grade'); });
  eq(Object.keys(w).join(','), 'ped-0-6w,ped-6w-6m,ped-6-12m,ped-12m+,ped-trough-early,ped-trough-late');
  eq(w['ped-0-6w'].auc.join('-'), '180-270'); eq(w['ped-6w-6m'].auc.join('-'), '100-250'); eq(w['ped-6-12m'].auc.join('-'), '100-190'); eq(w['ped-12m+'].auc.join('-'), '80-150');
  eq(w['ped-trough-early'].trough.join('-'), '10-20'); eq(w['ped-trough-late'].trough.join('-'), '5-10');
  S.windowSets.forEach(function (x) { truthy(/0\.35/.test(x.basis), x.id + ' says the target is defined at haematocrit 0.35'); });
});

// ---------------------------------------------------------------------------
// parameters
// ---------------------------------------------------------------------------
t('T1: parameters of the typical child follow the stream (weight scaling, QHP with Ht, liver volume, etas)', async function () {
  var o = await oracle(), p = P(25, 0.30), q = o.tacParams(25, 0.30, 'capsule');
  near(p.kCap, 2.83, 1e-12); near(p.kSus, 18, 1e-12, 'suspension absorption rate');
  near(p.QHP, q.QHP, 1e-12); near(p.CLINT, q.CLINT, 1e-12); near(p.EH, q.EH, 1e-12); near(p.CLH, q.CLH, 1e-12);
  near(p.VL, 0.0437 * Math.pow(25, 0.9), 1e-12, 'liver volume'); near(p.V3, 508 * 25 / 70, 1e-9); near(p.V4, 487 * 25 / 70, 1e-9);
  near(p.Q, 112 * Math.pow(25 / 70, 0.75), 1e-9);
  near(P(25, 0.30, [0.3, 0, 0]).kCap / p.kCap, Math.exp(0.3), 1e-12, 'eta 1 acts on KA');
  near(P(25, 0.30, [0.3, 0, 0]).kSus / p.kSus, Math.exp(0.3), 1e-12, 'eta 1 acts on both formulations');
  near(P(25, 0.30, [0, 0.3, 0]).CLINT / p.CLINT, Math.exp(0.3), 1e-12, 'eta 2 acts on CLINT');
  near(P(25, 0.30, [0, 0, 0.3]).V3 / p.V3, Math.exp(0.3), 1e-12, 'eta 3 acts on V3');
  near(P(25, 0.40).QHP / p.QHP, 0.60 / 0.70, 1e-12, 'hepatic plasma flow is proportional to (1 - Ht)');
});

// ---------------------------------------------------------------------------
// closed form against the oracle
// ---------------------------------------------------------------------------
async function ssCurveEngine(wt, ht, form, eta, dose, times) {
  var p = P(wt, ht, eta);
  return M.simulate([], times, p, { id: 'tacped', ss: { amt: dose, every: 12, tEnd: 0, form: form } }).c;
}

t('E1: steady state against the matrix-exponential oracle, typical and ±1.5 SD etas, both formulations, weights 10-75 kg (≤ 1e-9)', async function () {
  var o = await oracle(), worst = 0, n = 0;
  var sd = [Math.sqrt(0.644), Math.sqrt(0.456), Math.sqrt(0.692)];
  var etas = [[0, 0, 0], [1.5 * sd[0], 0, 0], [-1.5 * sd[0], 0, 0], [0, 1.5 * sd[1], 0], [0, -1.5 * sd[1], 0], [0, 0, 1.5 * sd[2]], [0, 0, -1.5 * sd[2]], [0.7 * sd[0], -0.9 * sd[1], 1.1 * sd[2]]];
  [[10, 0.25], [25, 0.30], [40, 0.45], [75, 0.35]].forEach(function (wh) {
    ['capsule', 'suspension'].forEach(function (form) {
      etas.forEach(function (eta) {
        var times = [0.25, 0.5, 1, 1.5, 2, 3, 4, 6, 8, 10, 11.75, 12], dose = 2500;
        var c = M.simulate([], times, M.indivParams(wh[0], null, null, ex(wh[1], wh[0]), eta, 'tacped'), { id: 'tacped', ss: { amt: dose, every: 12, tEnd: 0, form: form } }).c;
        var q = o.tacParams(wh[0], wh[1], form, { ka: eta[0], clint: eta[1], v3: eta[2] }), cur = o.steadyCurve(q, dose, 12, 0.25);
        times.forEach(function (tt, i) { var e = rel(c[i], cur.c[Math.round(tt / 0.25)]); worst = Math.max(worst, e); n++; });
      });
    });
  });
  truthy(worst <= 1e-9, 'max relative difference ' + worst + ' over ' + n + ' predictions');
});

t('E2: an explicit history with a capsule-to-suspension switch against the oracle (every dose keeps its own KA and F)', async function () {
  var o = await oracle(), worst = 0;
  [[18, 0.30, [0.4, -0.3, 0.2]], [60, 0.40, [-0.6, 0.5, -0.4]], [12, 0.22, [0, 0, 0]]].forEach(function (c0) {
    var wt = c0[0], ht = c0[1], eta = c0[2], doses = [];
    for (var k = 0; k < 10; k++) doses.push({ t: 12 * k, amt: k < 5 ? 2000 : 3000, form: k < 5 ? 'capsule' : 'suspension' });
    doses.push({ t: 120, amt: 2500, form: 'capsule' });
    var times = [1, 2, 4, 11.9, 12.5, 30, 59.9, 60.5, 61, 62, 66, 71.9, 100, 119.9, 120.5, 122, 130];
    var sim = M.simulate(doses, times, M.indivParams(wt, null, null, ex(ht, wt), eta, 'tacped'), { id: 'tacped' }).c;
    var e = { ka: eta[0], clint: eta[1], v3: eta[2] };
    times.forEach(function (tt, i) {
      var ref = 0;
      doses.forEach(function (d) {
        if (!(d.t < tt)) return;
        var q = o.tacParams(wt, ht, d.form, e), x = new Array(6).fill(0); x[0] = d.amt * q.F;
        ref += o.mv(o.expm(q.A, tt - d.t), x)[q.cmt] / q.V;
      });
      worst = Math.max(worst, rel(sim[i], ref));
    });
  });
  truthy(worst <= 1e-9, 'max relative difference ' + worst);
});

t('E3: KA at, within 1e-6 of, and around a disposition pole (the closed form divides by k − λ there): steady state and single dose agree with the oracle', async function () {
  var o = await oracle(), worst = 0, tested = 0;
  var base = P(25, 0.30), pl = T.poles(base);
  truthy(pl && pl.length === 3, 'three real poles');
  pl.forEach(function (z) {
    [0, 1e-6, -1e-6, 1e-4, -1e-3, 0.02, -0.04, 0.049, 0.051, 0.2].forEach(function (d) {
      var eta1 = Math.log(z.lam * (1 + d) / 2.83), eta = [eta1, 0, 0];
      var p = M.indivParams(25, null, null, ex(0.30, 25), eta, 'tacped');
      var q = o.tacParams(25, 0.30, 'capsule', { ka: eta1 });
      var times = [0.2, 1, 3, 6, 11.9, 12], c = M.simulate([], times, p, { id: 'tacped', ss: { amt: 3000, every: 12, tEnd: 0, form: 'capsule' } }).c;
      var cur = o.steadyCurve(q, 3000, 12, 0.1);
      times.forEach(function (tt, i) { worst = Math.max(worst, rel(c[i], cur.c[Math.round(tt / 0.1)])); tested++; });
      // single dose, small and large times
      var one = M.simulate([{ t: 0, amt: 3000, form: 'capsule' }], [0.05, 0.5, 4, 30], p, { id: 'tacped' }).c, x0 = new Array(6).fill(0); x0[0] = 3000;
      [0.05, 0.5, 4, 30].forEach(function (tt, i) { worst = Math.max(worst, rel(one[i], o.mv(o.expm(q.A, tt), x0)[q.cmt] / q.V)); tested++; });
    });
  });
  truthy(worst <= 1e-8, 'max relative difference ' + worst + ' over ' + tested + ' predictions');
});

t('E4: slow absorbers (eta on KA at -2.5 SD): the polynomial part of the earlier doses stays in the steady-state sum', async function () {
  var o = await oracle(), worst = 0;
  [-2.5, -2, -3].forEach(function (z) {
    var eta1 = z * Math.sqrt(0.644), p = M.indivParams(25, null, null, ex(0.30, 25), [eta1, 0, 0], 'tacped'), q = o.tacParams(25, 0.30, 'capsule', { ka: eta1 });
    var times = [0.5, 2, 6, 12], c = M.simulate([], times, p, { id: 'tacped', ss: { amt: 3000, every: 12, tEnd: 0, form: 'capsule' } }).c, cur = o.steadyCurve(q, 3000, 12, 0.1);
    times.forEach(function (tt, i) { worst = Math.max(worst, rel(c[i], cur.c[Math.round(tt / 0.1)])); });
  });
  truthy(worst <= 1e-9, 'max relative difference ' + worst);
});

// ---------------------------------------------------------------------------
// identities and the reference numbers of the hand-off (§4.4)
// ---------------------------------------------------------------------------
function expo(wt, ht, form, dose, hctAct, eta) {
  var ctx = { wt: wt, extra: ex(ht, wt), ss: { amt: dose, every: 12, tEnd: 0, form: form }, grid: G12, hctAct: hctAct == null ? ht : hctAct, hctRef: K.HCT_REF };
  return T.exposure([eta || [0, 0, 0]], ctx);
}

t('I1: plasma AUC over a steady-state interval = F · dose / CLINT (hepatic flow cancels), for any Ht, weight, eta and formulation', function () {
  var cases = [[25, 0.30, 'capsule', [0, 0, 0]], [25, 0.30, 'suspension', [0, 0, 0]], [25, 0.40, 'capsule', [0, 0, 0]], [60, 0.35, 'capsule', [0, 0, 0]],
    [15, 0.22, 'suspension', [0.5, 0.4, -0.3]], [40, 0.45, 'capsule', [-0.9, -0.5, 0.6]]];
  cases.forEach(function (c) {
    var p = P(c[0], c[1], c[3]), g = grid(0, 12, 50), sim = M.simulate([], g, p, { id: 'tacped', ss: { amt: 2000, every: 12, tEnd: 0, form: c[2] } }).c, a = 0;
    for (var i = 1; i < g.length; i++) a += (sim[i - 1] + sim[i]) * 0.5 * (g[i] - g[i - 1]);
    var want = 2000 * (c[2] === 'suspension' ? 0.46 : 1) / p.CLINT;
    truthy(rel(a, want) < 2e-5, 'case ' + JSON.stringify(c) + ': ' + a + ' vs ' + want);
  });
});

t('I2: the §4.4 reference numbers (whole-blood AUC and trough, actual and corrected) are reproduced', function () {
  // [WT, Ht, form, dose µg, AUC actual, corrected, trough actual, corrected]; the hand table's printed precision
  [[25, 0.30, 'capsule', 3000, 194.1, 225.4, 10.37, 12.04], [25, 0.30, 'suspension', 3000, 95.8, 111.3, 4.69, 5.45],
    [25, 0.40, 'capsule', 3000, 257.3, 226.0, 14.60, 12.82], [60, 0.35, 'capsule', 6000, 233.6, 233.6, 13.73, 13.73]].forEach(function (r) {
    var e = expo(r[0], r[1], r[2], r[3]);
    near(e.aucA[0], r[4], 0.06, 'AUC actual ' + r.join(',')); near(e.aucR[0], r[5], 0.06, 'AUC corrected ' + r.join(','));
    near(e.trA[0], r[6], 0.006, 'trough actual ' + r.join(',')); near(e.trR[0], r[7], 0.006, 'trough corrected ' + r.join(','));
  });
});

t('I3: at haematocrit 0.35 actual = corrected; the corrected AUC hardly depends on the patient’s Ht while the actual one does', function () {
  var e = expo(60, 0.35, 'capsule', 6000);
  eq(e.aucA[0], e.aucR[0]); eq(e.trA[0], e.trR[0]);
  var lo = expo(25, 0.30, 'capsule', 3000), hi = expo(25, 0.40, 'capsule', 3000);
  truthy(rel(lo.aucR[0], hi.aucR[0]) < 0.005, 'corrected AUC 0.30 vs 0.40: ' + lo.aucR[0] + ' vs ' + hi.aucR[0]);
  truthy(rel(hi.aucA[0], lo.aucA[0]) > 0.3, 'actual AUC differs by a third: ' + lo.aucA[0] + ' vs ' + hi.aucA[0]);
});

t('I4: the unit boundary — mg in the UI, µg in the engine, converted once; the reference dose of the table is 3 mg', function () {
  eq(M.toEngineAmt('tacped', 1.5), 1500); eq(M.toEngineAmt('tacped', 3), 3000);
  eq(T.fromModel(4.2, 'lcms'), 4.2); eq(T.toModel(4.2, 'lcms'), 4.2); eq(T.fromModelAuc(79, 12, 'lcms'), 79);
});

t('I5: formulation changes the answer the way the model says — suspension has 0.46 of the plasma AUC (same patient, same dose)', function () {
  var p = P(25, 0.30), g = grid(0, 12, 50), a = [];
  ['capsule', 'suspension'].forEach(function (f, j) {
    var sim = M.simulate([], g, p, { id: 'tacped', ss: { amt: 3000, every: 12, tEnd: 0, form: f } }).c; a[j] = 0;
    for (var i = 1; i < g.length; i++) a[j] += (sim[i - 1] + sim[i]) * 0.5 * 0.02;
  });
  near(a[1] / a[0], 0.46, 1e-4);
});

t('G1: the integration grid — whole-blood AUC within 0.02 % of a 0.005 h reference for slow, typical and very fast absorbers (suspension KA up to 130 /h)', async function () {
  var o = await oracle(), worst = 0;
  var sd = Math.sqrt(0.644);
  ['capsule', 'suspension'].forEach(function (form) {
    [-2, 0, 1, 2, 2.5].forEach(function (z) {
      var q = o.tacParams(25, 0.30, form, { ka: z * sd }), ref = o.summarise(o.steadyCurve(q, 3000, 12, 0.005), 0.30);
      var e = expo(25, 0.30, form, 3000, 0.30, [z * sd, 0, 0]);
      worst = Math.max(worst, rel(e.aucA[0], ref.aucAct), rel(e.aucR[0], ref.aucCor), rel(e.trA[0], ref.trAct));
    });
  });
  truthy(worst < 2e-4, 'max relative difference ' + worst);
});

// ---------------------------------------------------------------------------
// the app engine against NONMEM 7.6 (gate G1). Fixtures: tools/nonmem_verify/ped/export_golden_ped.mjs
// ---------------------------------------------------------------------------
var fs = require('fs'), path = require('path');
function readFixture(short) {
  var dir = __dirname, lines = fs.readFileSync(path.join(dir, 'nonmem_ped_' + short + '_struct.csv'), 'utf8').split('\n').filter(function (l) { return l.trim(); });
  var head = lines[0].split(','), rows = lines.slice(1).map(function (l) { var v = l.split(',').map(Number), o = {}; head.forEach(function (n, i) { o[n] = v[i]; }); return o; });
  var tab = fs.readFileSync(path.join(dir, 'nonmem_ped_' + short + '_struct.tab'), 'utf8').split('\n').filter(function (l) { return l.trim(); }).slice(2).map(function (l) { return l.trim().split(/\s+/).map(Number); });
  var scen = JSON.parse(fs.readFileSync(path.join(dir, 'nonmem_ped_' + short + '_struct.json'), 'utf8')).scen;
  if (rows.length !== tab.length) throw new Error('fixture rows and table rows differ');
  return { rows: rows, tab: tab, scen: scen };
}

t('G1-NONMEM: the closed-form engine reproduces NONMEM 7.6 (struct_tacped): steady-state trains and histories ≤ 1e-6, whole blood and plasma; the formulation-switch histories ≤ 3e-3', function () {
  var fx = readFixture('tac'), byId = {}, worst = { ss: 0, hist: 0, switch: 0 }, n = 0;
  fx.rows.forEach(function (r, i) { (byId[r.ID] = byId[r.ID] || []).push({ r: r, nm: fx.tab[i] }); });
  Object.keys(byId).forEach(function (id) {
    var recs = byId[id], scen = fx.scen[id], first = recs[0].r;
    var doses = recs.filter(function (x) { return x.r.EVID === 1; }).map(function (x) { return { t: x.r.TIME, amt: x.r.AMT, form: x.r.FORM === 1 ? 'suspension' : 'capsule' }; });
    var obs = recs.filter(function (x) { return x.r.EVID === 0; });
    var p = M.indivParams(first.WT, null, null, ex(first.HT, first.WT), [first.E1, first.E2, first.E3], 'tacped');
    var c = M.simulate(doses, obs.map(function (x) { return x.r.TIME; }), p, { id: 'tacped' }).c;
    var peak = Math.max.apply(null, obs.map(function (x) { return x.nm[2]; }));
    obs.forEach(function (x, j) {
      var wb = T.toObs(c[j], first.HT), e1 = Math.abs(wb - x.nm[2]) / Math.max(x.nm[2], 1e-3 * peak), e2 = Math.abs(c[j] - x.nm[3]) / Math.max(x.nm[3], 1e-3 * peak * 0.05);
      worst[scen] = Math.max(worst[scen], e1, e2); n++;
    });
  });
  truthy(n === 754, 'predictions compared: ' + n);
  truthy(worst.ss <= 1e-6, 'steady-state trains: max relative difference ' + worst.ss);
  truthy(worst.hist <= 1e-6, 'histories: max relative difference ' + worst.hist);
  truthy(worst.switch <= 3e-3, 'formulation switch: max relative difference ' + worst.switch + ' (NONMEM applies the current KA to doses in transit; the app gives each dose its own)');
});

// ---------------------------------------------------------------------------
// scope, refusals, ingestion
// ---------------------------------------------------------------------------
t('S1: haematocrit and weight are required, in range, and a percentage is refused with the L/L message', function () {
  throws(function () { T.normExtra({}, 25); }, 'haematocrit');
  throws(function () { T.normExtra({ hct: '30' }, 25); }, 'not as a percentage');
  throws(function () { T.normExtra({ hct: '38' }, 25); }, 'not as a percentage');
  throws(function () { T.normExtra({ hct: '0.05' }, 25); }, 'between 0.10 and 0.70');
  throws(function () { T.normExtra({ hct: '0.75' }, 25); }, 'between 0.10 and 0.70');
  near(T.normExtra({ hct: '0.68' }, 25).hct, 0.68, 1e-12, 'wider than the adult 0.65');
  near(T.normExtra({ hct: '0.10' }, 25).hct, 0.10, 1e-12);
  throws(function () { T.normExtra({ hct: '0.30' }, 2.9); }, 'between 3 and 200 kg');
  throws(function () { T.normExtra({ hct: '0.30' }, 201); }, 'between 3 and 200 kg');
  throws(function () { T.normExtra({ hct: '0.30' }, 0); }, 'Weight is required');
  near(T.normExtra({ hct: '0.30' }, 3).wt, 3, 1e-12); near(T.normExtra({ hct: '0.30' }, 200).wt, 200, 1e-12);
});

t('S2: outside the range the model was built on (weight 9.1-78 kg) is a visible warning, not a refusal', function () {
  eq(T.scopeWarnings(25, { hct: 0.3 }).length, 0);
  eq(T.scopeWarnings(9.1, {}).length, 0); eq(T.scopeWarnings(78, {}).length, 0);
  truthy(/outside the range/.test(T.scopeWarnings(8, {})[0]) && /9\.1/.test(T.scopeWarnings(8, {})[0]));
  eq(T.scopeWarnings(90, {}).length, 1);
  T.normExtra({ hct: '0.30' }, 8); T.normExtra({ hct: '0.30' }, 90);   // neither throws
});

t('S3: prepare — every dose needs a formulation (the message names the dose), each sample keeps its Ht, the report Ht is the latest sample’s', function () {
  var base = { extra: { hct: '0.40' }, wt: 25, steadyState: false };
  var ok = T.prepare(Object.assign({ doses: [{ t: 0, amt: 3000, form: 'capsule' }, { t: 12, amt: 3000, form: 'suspension' }], obs: [{ t: 12, c: 4.1, hct: 0.33 }, { t: 14, c: 7, hct: 0.31 }] }, base));
  eq(ok.doses[1].form, 'suspension'); eq(ok.obs[0].hct, 0.33); near(ok.hctReport, 0.31, 1e-12); eq(ok.extra.nOcc, 0); eq(ok.assay, 'lcms');
  throws(function () { T.prepare(Object.assign({ doses: [{ t: 0, amt: 3000, form: 'capsule' }, { t: 12, amt: 3000 }], obs: [] }, base)); }, 'formulation (capsule or suspension) for dose 2');
  throws(function () { T.prepare(Object.assign({ doses: [{ t: 0, amt: 3000, form: 'syrup' }], obs: [] }, base)); }, 'for dose 1');
  throws(function () { T.prepare(Object.assign({ doses: [{ t: 0, amt: 3000, form: 'capsule' }], obs: [{ t: 12, c: 4, hct: 31 }] }, base)); }, 'not as a percentage');
  throws(function () { T.prepare(Object.assign({ doses: [{ t: 0, amt: 3000, form: 'capsule' }], obs: [{ t: 12, c: 4, hct: 0.75 }] }, base)); }, 'between 0.10 and 0.70');
  near(T.prepare(Object.assign({ doses: [{ t: 0, amt: 3000, form: 'capsule' }], obs: [] }, base)).hctReport, 0.40, 1e-12, 'no sample: the patient field');
  var unsorted = T.prepare(Object.assign({ doses: [{ t: 12, amt: 3000, form: 'suspension' }, { t: 0, amt: 3000, form: 'capsule' }], obs: [] }, base));
  eq(unsorted.doses[0].form, 'capsule', 'doses are put in time order before the formulation is checked');
});

t('S4: ssHistory carries the regimen’s formulation to every dose, and leaves other drugs’ doses untouched', function () {
  var a = M.ssHistory({ amt: 1500, intervalHours: 12, tEnd: 100, n: 3, route: 'oral', form: 'suspension' });
  eq(a.length, 3); a.forEach(function (d) { eq(d.form, 'suspension'); });
  var b = M.ssHistory({ amt: 1500, intervalHours: 12, tEnd: 100, n: 3, route: 'oral' });
  b.forEach(function (d) { eq(Object.keys(d).join(','), 't,amt,route'); });
});

// ---------------------------------------------------------------------------
// the fit
// ---------------------------------------------------------------------------
var TEND = 24 * 20 + 8;
function simObs(wt, hct, eta, times, form) {
  var p = M.indivParams(wt, null, null, ex(hct, wt), eta, 'tacped');
  var c = M.simulate([], times, p, { id: 'tacped', ss: { amt: 3000, every: 12, tEnd: TEND, form: form || 'capsule' } }).c;
  return times.map(function (tt, i) { return { t: tt, c: T.toObs(c[i], hct), hct: hct }; });
}
function pedInput(over) {
  over = over || {};
  var wt = over.wt || 25, hct = over.hct != null ? over.hct : 0.30, form = over.form || 'capsule', eta = over.eta || [0.2, -0.3, 0.1];
  var inp = Object.assign({ drug: 'tacped', wt: wt, doses: M.ssHistory({ amt: 3000, intervalHours: 12, tEnd: TEND, n: 30, route: 'oral', form: form }), steadyState: true,
    extra: { hct: String(hct) }, obs: simObs(wt, hct, eta, [TEND, TEND + 1, TEND + 2], form), intervalHours: 12, winLo: null, winHi: null, seed: 1, mcmcIters: 40000 }, over);
  delete inp.hct; delete inp.eta; delete inp.form;
  return inp;
}

t('F1: a steady-state fit runs and reports AUC and trough, actual and corrected, with a reference haematocrit of 0.35', async function () {
  var f = await B.runFit(pedInput(), null);
  truthy(isFinite(f.auc.median) && f.auc.median > 0 && isFinite(f.trough.median));
  truthy(isFinite(f.aucCorr.median) && isFinite(f.troughCorr.median));
  eq(f.hctRef, 0.35); eq(f.nOccasions, 0); eq(f.etaNames.join(','), 'KA,CLINT,V3');
  eq(f.windowSet, false); truthy(isNaN(f.auc.pInWindow), 'no window: no probabilities');
  truthy(f.convergence.ok, 'sampler converged');
});

t('F2: the fit recovers the truth — the AUC of the generating patient (actual and corrected) lies in the 90 % interval; samples narrow it', async function () {
  var eta = [0.2, -0.3, 0.1];
  var truth = T.exposure([eta], { wt: 25, extra: ex(0.30, 25), ss: { amt: 3000, every: 12, tEnd: 0, form: 'capsule' }, grid: G12, hctAct: 0.30, hctRef: 0.35 });
  var f = await B.runFit(pedInput({ mcmcIters: 80000 }), null);
  truthy(truth.aucA[0] >= f.auc.p5 && truth.aucA[0] <= f.auc.p95, 'actual truth ' + truth.aucA[0] + ' in [' + f.auc.p5 + ', ' + f.auc.p95 + ']');
  truthy(truth.aucR[0] >= f.aucCorr.p5 && truth.aucR[0] <= f.aucCorr.p95, 'corrected truth ' + truth.aucR[0] + ' in [' + f.aucCorr.p5 + ', ' + f.aucCorr.p95 + ']');
  var pop = await B.runFit(pedInput({ obs: [] }), null);
  truthy((f.aucCorr.p95 - f.aucCorr.p5) < 0.7 * (pop.aucCorr.p95 - pop.aucCorr.p5), 'samples narrow the interval');
});

t('F3: the formulation reaches the engine through the steady-state regimen — a population forecast under a suspension regimen has about 0.46 of the capsule AUC', async function () {
  var cap = await B.runFit(pedInput({ obs: [] }), null), sus = await B.runFit(pedInput({ obs: [], form: 'suspension' }), null);
  var r = sus.aucCorr.median / cap.aucCorr.median;
  truthy(r > 0.44 && r < 0.54, 'suspension/capsule corrected AUC ' + r + ' (plasma 0.46; whole blood is slightly less than proportional)');
});

t('F4: a population forecast (no samples) centres on F · dose / CLINT in plasma, read through the blood relation', async function () {
  var f = await B.runFit(pedInput({ obs: [] }), null);
  eq(f.hasObs, false);
  var want = expo(25, 0.30, 'capsule', 3000);
  truthy(rel(f.aucCorr.median, want.aucR[0]) < 0.12, 'median ' + f.aucCorr.median + ' vs typical ' + want.aucR[0]);
});

t('F5: a dose without a formulation is refused by the fit with the dose named', async function () {
  var inp = pedInput(); inp.doses = inp.doses.map(function (d) { return { t: d.t, amt: d.amt, route: d.route }; });
  await h.rejects(B.runFit(inp, null), 'formulation (capsule or suspension) for dose 1');
});

// ---------------------------------------------------------------------------
// texts
// ---------------------------------------------------------------------------
function allTacpedText() {
  var X = ECU.drugTexts.tacped, parts = [X.background(), X.gettingStarted(), X.aboutSections(), X.modelTable(S), X.modelNote, X.doseNote, X.chartNote, X.howto, X.shrinkNote,
    X.explorerNote, X.explorerSub({ form: 'suspension' }, {}), X.diagNote, X.help.window, X.help.ivexplore,
    X.resultNote({ hctReport: 0.3, hctRef: 0.35 }, { esc: String, fmtC: String }), X.reportNote({ hctReport: 0.3, hctRef: 0.35 }, { esc: String, fmtC: String }),
    S.info, S.windowHint, S.samplePeak, S.assumptions.join(' '), S.report.reading.join(' '), S.report.scope];
  S.windowSets.forEach(function (w) { parts.push(w.label, w.basis, w.grade); });
  return parts.join('\n');
}

t('X1: the worked example in the Background text is what the model computes (25 kg, 3 mg capsule, Ht 0.30 and 0.40)', function () {
  var lo = expo(25, 0.30, 'capsule', 3000), hi = expo(25, 0.40, 'capsule', 3000), bg = ECU.drugTexts.tacped.background();
  [lo.aucA[0], hi.aucA[0], lo.aucR[0]].forEach(function (v) { truthy(bg.indexOf(String(Math.round(v))) >= 0, 'the text names ' + Math.round(v)); });
  truthy(Math.abs(Math.round(hi.aucR[0]) - Math.round(lo.aucR[0])) <= 1 && /both read about 225/.test(bg), 'the corrected values of the two cases agree within 1 and the text says so');
  truthy(/not a dose guide/.test(bg), 'the example is labelled an illustration, not a dose guide');
  truthy(/92%/.test(bg) && /0\.35/.test(bg));
});

t('X2: the evaluation numbers in the text are the ones of the 2026 paper (Tables 4, 5 and 7), and the scope sentences are present', function () {
  var tx = ECU.drugTexts.tacped, a = tx.aboutSections(), bg = tx.background();
  ['0.2%', '7.8%', '3.7%', '22.0%', '64.2%', '210%'].forEach(function (n) { truthy(a.indexOf(n) >= 0, 'About names ' + n); });
  ['0.2%', '7.8%', '3.7%', '22.0%'].forEach(function (n) { truthy(bg.indexOf(n) >= 0, 'Background names ' + n); });
  var scope = 'Children with a kidney transplant on twice-daily tacrolimus as capsule or suspension. Built on children aged 1–17 years, weight 9–78 kg, sampled at a median of 11 days after transplantation; LC-MS/MS whole-blood concentrations only; haematocrit needed.';
  truthy(a.indexOf(scope) >= 0 && bg.indexOf(scope) >= 0, 'scope sentence');
  var day = 'The estimate describes this patient on the day of the samples. Exposure changes from day to day and over months. In a small prospective evaluation (29 children enrolled), the AUC predicted from one occasion did not match the AUC measured about three months later. The authors conclude that repeated monitoring is needed.';
  [a, bg, tx.resultNote({ hctReport: 0.3, hctRef: 0.35 }, { esc: String, fmtC: String }), tx.reportNote({ hctReport: 0.3, hctRef: 0.35 }, { esc: String, fmtC: String })].forEach(function (x) { truthy(x.indexOf(day) >= 0, 'sampled-day sentence'); });
  truthy(/Children with a kidney transplant\. Describes the sampled day\./.test(S.report.scope), 'report scope line');
});

t('X3: guard text — no em-dashes, no "not validated", no dose-scheme or dose-advice wording, no starting-dose table, both papers cited', function () {
  var all = allTacpedText();
  falsy(/\u2014/.test(all), 'no em-dash');
  falsy(/not validated/i.test(all), 'no "not validated"');
  falsy(/mg\/m|per m²|body surface/i.test(all), 'no mg/m² guidance');
  falsy(/\b(should be given|should receive|increase the dose|decrease the dose|reduce the dose|raise the dose|start with|starting dose|initial dose|optimal dose|optimi[sz]e)/i.test(all), 'no dose advice');
  falsy(/Table 3/.test(all), 'no starting-dose table');
  falsy(/recommend/i.test(all.replace(/does not select or recommend a dose/g, '').replace(/not recommendations/g, '')), 'recommend appears only in the two negations');
  truthy(/Schijvens/.test(all) && /Heida/.test(all) && /refitted without height/i.test(all));
});

t('X4: the window text says the sets are defined at haematocrit 0.35 and that the corrected value is compared; none is preselected', function () {
  var bg = ECU.drugTexts.tacped.background();
  truthy(/corrected value is the one to compare/.test(bg) && /No window is preselected/.test(bg));
  S.windowSets.forEach(function (w) { truthy(bg.indexOf('data-winset="' + w.id + '"') >= 0, w.id + ' has a Use button'); });
});

// ===========================================================================
// MPA, children with a kidney transplant (mpaped)
// ===========================================================================
function exm(wt, alb) { return { _norm: true, wt: wt, albumin: alb, assay: 'emit', nOcc: 0, occDays: [] }; }
function exmO(wt, alb, nOcc) { var e = exm(wt, alb); e.nOcc = nOcc; return e; }
function PM(wt, alb, eta, nOcc) { return M.indivParams(wt, null, null, exmO(wt, alb, nOcc || 0), eta || [0, 0, 0], 'mpaped'); }
var SDM = [Math.sqrt(0.139), Math.sqrt(2.42), Math.sqrt(0.337)];

t('M-spec: pediatric MPA is registered, ready, mg/L, proportional error, MMF mg unconverted, windows 30-60 default', function () {
  eq(SM.id, 'mpaped'); eq(SM.pending, false);
  eq(SM.units.conc, 'mg/L'); eq(SM.units.auc, 'mg·h/L'); eq(SM.units.dose, 'mg');
  near(SM.SIGMA.PROP, 0.223, 1e-12); eq(SM.SIGMA.ADD, 0); truthy(!(SM.SIGMA.LOG > 0));
  truthy(/Heida/.test(SM.article) && /2024/.test(SM.article) && /80:1761/.test(SM.article));
  eq(SM.card.name, 'Mycophenolic acid (pediatric kidney)');
  eq(KM.NSTAGE, 2); eq(KM.MAX_OCC, 10);
  eq(TM.etaNames({}).join(','), 'CL,VC,Q'); eq(TM.etaNames({ nOcc: 2 }).join(','), 'CL,VC,Q,KF0,KF1');
  var om = TM.omega({ nOcc: 2 });
  eq(om.vars.join(','), '0.139,2.42,0.337,0.19,0.19');
  eq(SM.windowDefaultLo, 30); eq(SM.windowDefaultHi, 60); eq(SM.windowStandard, 'kidney-ped');
  eq(SM.windowSets.length, 1); eq(SM.windowSets[0].auc.join('-'), '30-60'); eq(SM.windowSets[0].trough, null);
  eq(SM.ui.bloodCorrection, false); eq(SM.requiresWt, true); eq(SM.wtMin, 3); eq(SM.wtMax, 200);
  eq(M.toEngineAmt('mpaped', 600), 600, 'MMF mg stay mg');
});

t('M1: parameters of the typical child follow the stream (allometry, albumin power, transit rate, etas, no eta on Vp and KTR)', async function () {
  var o = await oracle(), p = PM(38.5, 34), q = o.mpaParams(38.5, 34);
  near(p.CL, q.CL, 1e-12); near(p.CL, 10.2186, 1e-3); near(p.VC, q.V2, 1e-12); near(p.VP, q.V3, 1e-12); near(p.Q, q.Q, 1e-12); near(p.KTR, q.KTR, 1e-12);
  near(PM(70, 34).CL, 16.0, 1e-12, 'CL at 70 kg and albumin 34 is theta 1');
  near(PM(38.5, 28).CL / PM(38.5, 34).CL, Math.pow(28 / 34, -2.49), 1e-12, 'albumin power -2.49 around 34');
  near(PM(70, 34).KTR, 1.48, 1e-12); near(PM(20, 34).KTR, 1.48 * Math.pow(20 / 70, -0.25), 1e-12, 'KTR scales with weight^-0.25');
  near(PM(38.5, 34, [0.3, 0, 0]).CL / p.CL, Math.exp(0.3), 1e-12); near(PM(38.5, 34, [0, 0.3, 0]).VC / p.VC, Math.exp(0.3), 1e-12);
  near(PM(38.5, 34, [0, 0, 0.3]).Q / p.Q, Math.exp(0.3), 1e-12);
  near(PM(38.5, 34, [0, 0.9, 0.9]).VP / p.VP, 1, 1e-12, 'no eta on Vp'); near(PM(38.5, 34, [0.9, 0.9, 0.9]).KTR / p.KTR, 1, 1e-12, 'no eta on KTR');
});

t('ME1: steady state against the matrix-exponential oracle — typical, ±1.5 SD etas on CL, Vc and Q, occasion effect on the last dose, weights 13-75 kg', async function () {
  var o = await oracle(), worst = 0, n = 0;
  var etas = [[0, 0, 0], [1.5 * SDM[0], 0, 0], [-1.5 * SDM[0], 0, 0], [0, 1.5 * SDM[1], 0], [0, -1.5 * SDM[1], 0], [0, 0, 1.5 * SDM[2]], [0, 0, -1.5 * SDM[2]], [0.6 * SDM[0], -0.8 * SDM[1], 1.1 * SDM[2]]];
  [[13, 34], [20, 34], [38.5, 28], [70, 34], [75, 41]].forEach(function (wa) {
    etas.forEach(function (eta) {
      var times = [0.25, 0.5, 1, 1.5, 2, 3, 4, 6, 8, 10, 11.75, 12], dose = 600;
      var c = M.simulate([], times, PM(wa[0], wa[1], eta), { id: 'mpaped', ss: { amt: dose, every: 12, tEnd: 0 } }).c;
      var q = o.mpaParams(wa[0], wa[1], { cl: eta[0], vc: eta[1], q: eta[2] }), cur = o.steadyCurve(q, dose, 12, 0.25);
      times.forEach(function (tt, i) { worst = Math.max(worst, rel(c[i], cur.c[Math.round(tt / 0.25)])); n++; });
    });
  });
  truthy(worst <= 1e-9, 'max relative difference ' + worst + ' over ' + n + ' predictions');
});

t('ME2: an explicit history with an occasion effect on each dose’s F, against the oracle (kappa multiplies the dose)', async function () {
  var o = await oracle(), worst = 0;
  [[20, 30, [0.3, -0.4, 0.2]], [60, 40, [-0.5, 0.6, -0.3]], [38.5, 34, [0, 0, 0]]].forEach(function (c0) {
    var wt = c0[0], alb = c0[1], eta = c0[2], kap = [0.5, -0.7, 0.2], doses = [];
    for (var k = 0; k < 10; k++) doses.push({ t: 12 * k, amt: k < 5 ? 500 : 750, occIdx: Math.min(2, Math.floor(k / 4)) });
    var times = [1, 2, 4, 11.9, 12.5, 30, 47.9, 48.5, 49, 50, 60, 71.9, 100, 119.9, 125, 130];
    var sim = M.simulate(doses, times, PM(wt, alb, eta.concat(kap), 3), { id: 'mpaped' }).c;
    var q = o.mpaParams(wt, alb, { cl: eta[0], vc: eta[1], q: eta[2] });
    times.forEach(function (tt, i) {
      var ref = 0;
      doses.forEach(function (d) {
        if (!(d.t < tt)) return;
        var x = new Array(4).fill(0); x[0] = d.amt * Math.exp(kap[d.occIdx]);
        ref += o.mv(o.expm(q.A, tt - d.t), x)[q.cmt] / q.V;
      });
      worst = Math.max(worst, rel(sim[i], ref));
    });
  });
  truthy(worst <= 1e-9, 'max relative difference ' + worst);
});

t('ME3: steady state plus "delta" doses for the sampled days equals an explicit long history with the occasion effect on those days', async function () {
  var o = await oracle(), eta = [0.2, -0.3, 0.4], kap = [0.6, -0.5], wt = 30, alb = 33, worst = 0;
  var tEnd = 12 * 400, doses = [];
  for (var k = 0; k <= 400; k++) doses.push({ t: 12 * k, amt: 500, occIdx: (12 * k >= tEnd - 36 && 12 * k < tEnd - 12) ? 0 : (12 * k >= tEnd - 12 ? 1 : -1) });
  var times = [tEnd - 30, tEnd - 12 + 1, tEnd + 0.5, tEnd + 2, tEnd + 11];
  var p = PM(wt, alb, eta.concat(kap), 2);
  var full = M.simulate(doses, times, p, { id: 'mpaped' }).c;
  var ssd = doses.filter(function (d) { return d.occIdx >= 0; }).map(function (d) { return { t: d.t, amt: d.amt, occIdx: d.occIdx, delta: true }; });
  var ss = M.simulate(ssd, times, p, { id: 'mpaped', ss: { amt: 500, every: 12, tEnd: tEnd } }).c;
  times.forEach(function (tt, i) { worst = Math.max(worst, rel(ss[i], full[i])); });
  truthy(worst <= 1e-8, 'max relative difference ' + worst + ' (an explicit 401-dose history, long enough for the slow peripheral phase; the earliest doses carry kappa 0, as the endless train does)');
});

t('ME4: a disposition pole at, within 1e-6 of, and around the transit rate KTR (the closed form divides by k − λ there): steady state and single dose agree with the oracle', async function () {
  var o = await oracle(), worst = 0, tested = 0, wt = 38.5, alb = 34;
  var k = PM(wt, alb).KTR;
  function lam2(etaVc) { return TM.poles(PM(wt, alb, [0, etaVc, 0]))[1].lam; }
  function etaFor(target) { var lo = -4, hi = 4; for (var i = 0; i < 200; i++) { var mid = (lo + hi) / 2; if (lam2(mid) > target) lo = mid; else hi = mid; } return (lo + hi) / 2; }   // lam2 falls as Vc grows
  truthy(lam2(-4) > k && lam2(4) < k, 'the fast pole crosses KTR within the eta range');
  [0, 1e-6, -1e-6, 1e-4, -1e-3, 0.02, -0.04, 0.049, 0.051, 0.2, -0.3].forEach(function (d) {
    var ev = etaFor(k * (1 + d)), p = PM(wt, alb, [0, ev, 0]), q = o.mpaParams(wt, alb, { vc: ev });
    var times = [0.2, 1, 3, 6, 11.9, 12], c = M.simulate([], times, p, { id: 'mpaped', ss: { amt: 600, every: 12, tEnd: 0 } }).c, cur = o.steadyCurve(q, 600, 12, 0.1);
    times.forEach(function (tt, i) { worst = Math.max(worst, rel(c[i], cur.c[Math.round(tt / 0.1)])); tested++; });
    var one = M.simulate([{ t: 0, amt: 600 }], [0.05, 0.5, 4, 30], p, { id: 'mpaped' }).c, x0 = [600, 0, 0, 0];
    [0.05, 0.5, 4, 30].forEach(function (tt, i) { worst = Math.max(worst, rel(one[i], o.mv(o.expm(q.A, tt), x0)[q.cmt] / q.V)); tested++; });
  });
  truthy(worst <= 1e-8, 'max relative difference ' + worst + ' over ' + tested + ' predictions');
});

t('MI1: AUC over a steady-state interval = dose · exp(kappa) / CL, independent of Vc, Vp, Q and KTR; exposure() returns dose/CL', function () {
  [[38.5, 34, [0, 0, 0]], [38.5, 34, [0, 1.2, -0.8]], [38.5, 34, [0, -1.5, 1.0]], [15, 27, [0.4, 0.7, 0.3]], [70, 41, [-0.5, -0.9, -0.2]]].forEach(function (c) {
    var p = PM(c[0], c[1], c[2]), g = grid(0, 12, 50), sim = M.simulate([], g, p, { id: 'mpaped', ss: { amt: 500, every: 12, tEnd: 0 } }).c, a = 0;
    for (var i = 1; i < g.length; i++) a += (sim[i - 1] + sim[i]) * 0.5 * (g[i] - g[i - 1]);
    truthy(rel(a, 500 / p.CL) < 2e-5, JSON.stringify(c) + ': ' + a + ' vs ' + 500 / p.CL);
    var e = SM.custom.exposure([c[2]], { wt: c[0], extra: exm(c[0], c[1]), ss: { amt: 500, every: 12, tEnd: 0 }, grid: G12 });
    near(e.aucA[0], 500 / p.CL, 1e-9); eq(e.aucA[0], e.aucR[0], 'no blood correction: reference = actual');
    near(e.trA[0], sim[sim.length - 1], 1e-9 * Math.max(1, sim[sim.length - 1]), 'trough is the concentration one interval after the dose');
  });
  var p0 = PM(38.5, 34), a24 = 0, g24 = grid(0, 24, 50), s24 = M.simulate([], g24, p0, { id: 'mpaped', ss: { amt: 1000, every: 24, tEnd: 0 } }).c;
  for (var j = 1; j < g24.length; j++) a24 += (s24[j - 1] + s24[j]) * 0.5 * (g24[j] - g24[j - 1]);
  truthy(rel(a24, 1000 / p0.CL) < 2e-5, 'AUC0-24 for a 24-hour interval is dose/CL as well');
});

t('MI2: the §4.4 reference numbers (CL, AUC, trough, Cmax) are reproduced; the 600 mg row sits inside 30-60, the 750 mg row above it', async function () {
  var o = await oracle();
  [[38.5, 34, 600, 10.22, 58.72, 3.28, 12.59], [38.5, 34, 750, 10.22, 73.40, 4.11, 15.74], [20, 34, 250, 6.25, 39.98, 2.22, 9.68], [70, 34, 1000, 16.00, 62.50, 3.52, 12.04], [38.5, 28, 600, 16.57, 36.21, 1.68, 9.83]].forEach(function (r) {
    var p = PM(r[0], r[1]), g = grid(0, 12, 100), c = M.simulate([], g, p, { id: 'mpaped', ss: { amt: r[2], every: 12, tEnd: 0 } }).c, auc = 0, cmax = 0;
    for (var i = 1; i < g.length; i++) { auc += (c[i - 1] + c[i]) * 0.5 * 0.01; cmax = Math.max(cmax, c[i]); }
    near(p.CL, r[3], 0.006, 'CL ' + r.join(',')); near(r[2] / p.CL, r[4], 0.006, 'AUC ' + r.join(',')); near(auc, r[4], 0.01, 'integrated AUC ' + r.join(','));
    near(c[c.length - 1], r[5], 0.006, 'trough ' + r.join(',')); near(cmax, r[6], 0.011, 'Cmax ' + r.join(','));
    var q = o.mpaParams(r[0], r[1]), s = o.summarise(o.steadyCurve(q, r[2], 12, 0.01));
    near(cmax, s.cmax, 0.002, 'Cmax against the oracle');
  });
  var w = SM.windowSets[0].auc;
  truthy(600 / PM(38.5, 34).CL >= w[0] && 600 / PM(38.5, 34).CL <= w[1], '600 mg: inside'); truthy(750 / PM(38.5, 34).CL > w[1], '750 mg: above');
});

t('MI3: the unit trap — an MMF dose of 600 mg gives AUC 58.7 at 38.5 kg and albumin 34, not 43.4 (no 0.739 conversion)', function () {
  var e = TM.exposure([[0, 0, 0]], { wt: 38.5, extra: exm(38.5, 34), ss: { amt: M.toEngineAmt('mpaped', 600), every: 12, tEnd: 0 }, grid: G12 });
  near(e.aucA[0], 58.72, 0.01); truthy(Math.abs(e.aucA[0] - 43.4) > 10, 'the converted value 43.4 is not what the model gives');
});

t('MG-NONMEM: the closed-form engine reproduces NONMEM 7.6 (struct_mpaped, run-57 structure with the article’s values): steady-state doses and 7-day histories with occasion effects, ≤ 1e-6', function () {
  var fx = readFixture('mpa'), byId = {}, worst = { ss: 0, hist: 0 }, n = 0;
  fx.rows.forEach(function (r, i) { (byId[r.ID] = byId[r.ID] || []).push({ r: r, nm: fx.tab[i] }); });
  Object.keys(byId).forEach(function (id) {
    var recs = byId[id], scen = fx.scen[id], first = recs[0].r;
    var p = M.indivParams(first.WT, null, null, exm(first.WT, first.ALB), [first.E1, first.E2, first.E4], 'mpaped');
    var doses = recs.filter(function (x) { return x.r.EVID === 1; }), obs = recs.filter(function (x) { return x.r.EVID === 0; });
    var opts = { id: 'mpaped' }, list = [];
    doses.forEach(function (x) {                       // NONMEM: F1 = exp(EO) of the dose record multiplies that dose
      var amt = x.r.AMT * Math.exp(x.r.EO);
      if (x.r.SS === 1) opts.ss = { amt: amt, every: x.r.II, tEnd: x.r.TIME }; else list.push({ t: x.r.TIME, amt: amt });
    });
    var c = M.simulate(list, obs.map(function (x) { return x.r.TIME; }), p, opts).c;
    var peak = Math.max.apply(null, obs.map(function (x) { return x.nm[2]; }));
    obs.forEach(function (x, j) { worst[scen] = Math.max(worst[scen], Math.abs(c[j] - x.nm[2]) / Math.max(x.nm[2], 1e-3 * peak)); n++; });
  });
  eq(n, 516, 'predictions compared (312 steady-state, 204 history)');
  truthy(worst.ss <= 1e-6, 'steady state: max relative difference ' + worst.ss);
  truthy(worst.hist <= 1e-6, 'histories: max relative difference ' + worst.hist);
});

t('G2-NONMEM: the app’s MAP equals NONMEM 7.6 POSTHOC empirical Bayes estimates for 30 MPA patients (occasion effects, 1-4 sampled days) and 30 tacrolimus patients (both formulations): median max|d eta| ≤ 1e-3, worst ≤ 1e-3, reported AUC within 0.5 %, and the app’s objective never above NONMEM’s', function () {
  var fx = JSON.parse(fs.readFileSync(path.join(__dirname, 'nonmem_ped_posthoc.json'), 'utf8')), grid12 = []; for (var g = 0; g <= 48; g++) grid12.push(g * 0.25);
  [['mpaped', SM], ['tacped', S]].forEach(function (pair) {
    var drug = pair[0], spec = pair[1], TT = spec.custom, diffs = [], worstAuc = 0, worstObj = -Infinity, nOccSeen = {};
    eq(fx[drug].length, 30, drug + ' fixture size');
    fx[drug].forEach(function (a) {
      var doses = []; for (var k = 0; k < a.hist.n; k++) { var d = { t: a.hist.t0 + k * a.hist.every, amt: a.hist.amt, route: 'oral' }; if (a.hist.form) d.form = a.hist.form; doses.push(d); }
      var prep = TT.prepare({ extra: a.rawEx, wt: a.wt, doses: doses.map(function (d) { return Object.assign({}, d); }), obs: a.obs, steadyState: false });
      var om = TT.omega(prep.extra), n = om.vars.length; nOccSeen[prep.extra.nOcc] = true;
      eq(n, a.etaNM.length, drug + ' patient ' + a.id + ': the same number of etas as NONMEM');
      var ofv = B.makeOfv({ wt: a.wt, drug: drug, doses: prep.doses, ss: null, obs: prep.obs, omega: { vars: om.vars, cov: drug === 'mpaped' ? om.cov : null, dims: n }, extra: prep.extra, form: null });
      var map = B.mapBFGS(ofv, om.vars), mx = 0;
      map.x.forEach(function (v, i) { mx = Math.max(mx, Math.abs(v - a.etaNM[i])); }); diffs.push(mx);
      worstObj = Math.max(worstObj, ofv(map.x) - ofv(a.etaNM));       // the app's objective minus NONMEM's: never above
      var last = doses[doses.length - 1], ctx = { wt: a.wt, extra: prep.extra, ss: { amt: last.amt, every: 12, tEnd: last.t, form: last.form }, grid: grid12.map(function (x) { return x + last.t; }), hctAct: prep.hctReport, hctRef: TT.constants.HCT_REF };
      var A1 = TT.exposure([map.x.slice(0, 3)], ctx), A2 = TT.exposure([a.etaNM.slice(0, 3)], ctx);
      worstAuc = Math.max(worstAuc, Math.abs(A1.aucA[0] / A2.aucA[0] - 1), Math.abs(A1.aucR[0] / A2.aucR[0] - 1));
    });
    diffs.sort(function (x, y) { return x - y; });
    truthy(diffs[15] <= 1e-3, drug + ': median max|d eta| ' + diffs[15]);
    truthy(diffs[29] <= 1e-3, drug + ': worst max|d eta| ' + diffs[29]);
    truthy(worstAuc <= 0.005, drug + ': worst AUC difference ' + worstAuc);
    truthy(worstObj <= 1e-6, drug + ': the app’s objective above NONMEM’s by ' + worstObj);
    if (drug === 'mpaped') truthy([1, 2, 4].every(function (c) { return nOccSeen[c]; }), 'the fixture covers 1, 2 and 4 sampled occasions: ' + Object.keys(nOccSeen).join(','));
  });
});

t('MS1: weight and albumin are required and in range; albumin in g/dL is refused with the unit named; the warnings are not refusals', function () {
  throws(function () { TM.normExtra({}, 25); }, 'albumin in g/L');
  throws(function () { TM.normExtra({ albumin: '3.4' }, 25); }, 'between 5 and 50 g/L');
  throws(function () { TM.normExtra({ albumin: '55' }, 25); }, 'between 5 and 50 g/L');
  throws(function () { TM.normExtra({ albumin: '34' }, 2.9); }, 'between 3 and 200 kg');
  throws(function () { TM.normExtra({ albumin: '34' }, 201); }, 'between 3 and 200 kg');
  throws(function () { TM.normExtra({ albumin: '34' }, 0); }, 'Weight is required');
  near(TM.normExtra({ albumin: '5' }, 25).albumin, 5, 1e-12); near(TM.normExtra({ albumin: '50' }, 25).albumin, 50, 1e-12);
  eq(TM.scopeWarnings(30, { albumin: 34 }).length, 0); eq(TM.scopeWarnings(12.9, { albumin: 24 }).length, 0); eq(TM.scopeWarnings(79.9, { albumin: 42 }).length, 0);
  eq(TM.scopeWarnings(10, { albumin: 34 }).length, 1); eq(TM.scopeWarnings(30, { albumin: 20 }).length, 1); eq(TM.scopeWarnings(90, { albumin: 45 }).length, 2);
  truthy(/albumin/i.test(TM.scopeWarnings(30, { albumin: 20 })[0]) && /24/.test(TM.scopeWarnings(30, { albumin: 20 })[0]));
  TM.normExtra({ albumin: '20' }, 10); TM.normExtra({ albumin: '45' }, 90);   // neither throws
});

t('MS1b: the input check says what is wrong with an albumin in g/dL, and passes a normal case', function () {
  var base = mpaInput({ obs: [] }), bad = Object.assign({}, base, { extra: { albumin: '3.4' } });
  eq(ECU.ui.inputProblems(SM, base, [600], true).length, 0, 'a normal case raises nothing');
  var msg = ECU.ui.inputProblems(SM, bad, [600], true).filter(function (m) { return /^Albumin/.test(m); });
  eq(msg.length, 1); truthy(/outside 5 to 50 g\/L/.test(msg[0]) && /not 3\.4 g\/dL/.test(msg[0]), msg[0]);
  truthy(ECU.ui.inputProblems(SM, Object.assign({}, base, { extra: { albumin: '60' } }), [600], true).some(function (m) { return /Albumin 60 g\/L is outside/.test(m) && !/g\/dL/.test(m); }), 'a high value gets no g/dL hint');
  truthy(ECU.ui.inputProblems(SM, base, [5000], true).some(function (m) { return /Dose 5000 mg/.test(m); }), 'dose in the wrong unit');
  truthy(ECU.ui.inputProblems(SM, Object.assign({}, base, { intervalHours: 24 }), [600], true).some(function (m) { return /twice-daily mycophenolate mofetil/.test(m); }), 'once daily');
});

t('MS2: prepare — EC-MPS is refused with the reason, MMF accepted, no haematocrit, EMIT scale unchanged', function () {
  var base = { extra: { albumin: '34' }, wt: 25, steadyState: false };
  throws(function () { TM.prepare(Object.assign({ doses: [{ t: 0, amt: 360, form: 'ecmps' }], obs: [] }, base)); }, 'EC-MPS');
  var ok = TM.prepare(Object.assign({ doses: [{ t: 0, amt: 500, form: 'mmf' }, { t: 12, amt: 500 }], obs: [{ t: 13, c: 7.2 }] }, base));
  eq(ok.assay, 'emit'); eq(ok.obs[0].c, 7.2); eq(ok.hctReport, null); eq(ok.obs[0].hct, null);
  eq(TM.fromModel(5.5), 5.5); eq(TM.toObs(5.5, 0.3), 5.5, 'no blood transform for MPA');
});

t('MS3: occasions — a calendar day is an occasion, a pre-dose trough belongs to the previous dose’s day, samples on one day share one kappa, the cap is the 10 most recent days, delta flags only in steady-state mode', function () {
  var doses = []; for (var d = 0; d < 14; d++) { doses.push({ t: 24 * d + 8, amt: 500 }); doses.push({ t: 24 * d + 20, amt: 500 }); }
  // t = 32 is the 08:00 dose of day 1: a sample at that time is the trough of day 0's evening dose (day 0); 33 and 34 follow the day 1 morning dose; 79.5 follows day 2's evening dose
  var obs = [{ t: 32, c: 4 }, { t: 33, c: 9 }, { t: 34, c: 8 }, { t: 79.5, c: 3 }];
  var pr = TM.prepare({ extra: { albumin: '34' }, wt: 25, doses: doses, obs: obs, steadyState: false });
  eq(pr.extra.occDays.join(','), '0,1,2'); eq(pr.extra.nOcc, 3); eq(pr.extra.nSampled, 3); eq(TM.etaNames(pr.extra).join(','), 'CL,VC,Q,KF0,KF1,KF2');
  var byDay = {}; pr.doses.forEach(function (x) { byDay[Math.floor(x.t / 24)] = x.occIdx; });
  eq(byDay[0], 0); eq(byDay[1], 1); eq(byDay[2], 2); eq(byDay[3], -1, 'a day without a sample takes kappa 0');
  eq(pr.doses.filter(function (x) { return x.occIdx === 1; }).length, 2, 'both doses of day 1 share one kappa');
  var many = []; for (var j = 0; j < 14; j++) many.push({ t: 24 * j + 9, c: 5 });
  var pm = TM.prepare({ extra: { albumin: '34' }, wt: 25, doses: doses, obs: many, steadyState: true });
  eq(pm.extra.nSampled, 14); eq(pm.extra.nOcc, 10, 'cap'); eq(pm.extra.occDays.join(','), '4,5,6,7,8,9,10,11,12,13', 'the 10 most recent days'); eq(TM.etaNames(pm.extra).length, 13);
  pm.doses.forEach(function (x) { var day = Math.floor(x.t / 24); eq(x.occIdx >= 0, day >= 4); eq(x.delta, day >= 4, 'steady state: the sampled days are explicit delta doses'); });
  var pn = TM.prepare({ extra: { albumin: '34' }, wt: 25, doses: doses, obs: many, steadyState: false });
  falsy(pn.doses.some(function (x) { return x.delta; }), 'full schedule: no delta');
});

// ---------------------------------------------------------------------------
// the fit
// ---------------------------------------------------------------------------
function mpaSimObs(wt, alb, eta, kap, times, dose, tEnd, dayOfObs) {
  var p = PM(wt, alb, eta.concat(kap || []), (kap || []).length), ssd = [];
  // the sampled day is the day of the last doses: put its kappa on the doses given on that day (delta doses)
  if (kap && kap.length) for (var k = 0; k < 2; k++) ssd.push({ t: tEnd - 12 * k, amt: dose, occIdx: 0, delta: true });
  return times.map(function (tt, i) { return { t: tt, c: M.simulate(ssd, [tt], p, { id: 'mpaped', ss: { amt: dose, every: 12, tEnd: tEnd } }).c[0] }; });
}
var MTEND = 24 * 20 + 20;
function mpaInput(over) {
  over = over || {};
  var wt = over.wt || 38.5, alb = over.alb || 34, dose = 600, eta = over.eta || [0.2, 0.1, -0.1];
  var inp = Object.assign({ drug: 'mpaped', wt: wt, doses: M.ssHistory({ amt: dose, intervalHours: 12, tEnd: MTEND, n: 30, route: 'oral' }), steadyState: true,
    extra: { albumin: String(alb) }, obs: mpaSimObs(wt, alb, eta, over.kap || [0.3], [MTEND, MTEND + 1, MTEND + 2], dose, MTEND), intervalHours: 12, winLo: null, winHi: null, seed: 1, mcmcIters: 40000 }, over);
  delete inp.alb; delete inp.eta; delete inp.kap;
  return inp;
}

t('MF1: a steady-state fit runs, reports AUC and an informational trough, with the 30-60 window as default and one occasion effect', async function () {
  var f = await B.runFit(mpaInput(), null);
  truthy(isFinite(f.auc.median) && f.auc.median > 0 && isFinite(f.trough.median));
  eq(f.etaNames.join(','), 'CL,VC,Q,KF0'); eq(f.nOccasions, 1);
  eq(f.winLo, 30); eq(f.winHi, 60); truthy(f.auc.pInWindow >= 0 && f.auc.pInWindow <= 1, 'default window gives probabilities');
  truthy(f.convergence.ok, 'sampler converged');
});

t('MF2: the fit recovers the truth — dose/CL of the generating patient lies in the 90 % interval; samples narrow it', async function () {
  var eta = [0.2, 0.1, -0.1], truth = 600 / PM(38.5, 34, eta).CL;
  var f = await B.runFit(mpaInput({ mcmcIters: 80000 }), null);
  truthy(truth >= f.auc.p5 && truth <= f.auc.p95, 'truth ' + truth + ' in [' + f.auc.p5 + ', ' + f.auc.p95 + ']');
  var pop = await B.runFit(mpaInput({ obs: [] }), null);
  truthy((f.auc.p95 - f.auc.p5) < 0.8 * (pop.auc.p95 - pop.auc.p5), 'samples narrow the interval');
});

t('MF3: a population forecast (no samples) centres on dose/CL at the typical child, and says so', async function () {
  var f = await B.runFit(mpaInput({ obs: [] }), null);
  eq(f.hasObs, false);
  truthy(rel(f.auc.median, 600 / PM(38.5, 34).CL) < 0.06, 'median ' + f.auc.median + ' vs typical ' + 600 / PM(38.5, 34).CL);
});

t('MF4: albumin changes the answer — the same samples at albumin 28 instead of 34 give a lower AUC estimate only through the prior, and the population forecast follows (28/34)^2.49', async function () {
  var a = await B.runFit(mpaInput({ obs: [] }), null), b = await B.runFit(mpaInput({ obs: [], alb: 28 }), null);
  near(b.auc.median / a.auc.median, Math.pow(28 / 34, 2.49), 0.02);
});

t('MF5: an EC-MPS dose and a missing albumin are refused by the fit', async function () {
  var inp = mpaInput(); inp.doses = inp.doses.map(function (d) { return { t: d.t, amt: d.amt, route: d.route, form: 'ecmps' }; });
  await h.rejects(B.runFit(inp, null), 'EC-MPS');
  await h.rejects(B.runFit(mpaInput({ extra: {} }), null), 'albumin in g/L');
});

function allMpaText() {
  var X = ECU.drugTexts.mpaped, fit = { hctReport: null, hctRef: null }, hh = { esc: String, fmtC: String };
  var parts = [X.background(), X.gettingStarted(), X.aboutSections(), X.modelTable(SM), X.modelNote, X.doseNote, X.chartNote, X.howto, X.shrinkNote, X.explorerNote, X.explorerSub(),
    X.diagNote, X.help.window, X.help.ivexplore, X.resultNote(fit, hh), X.reportNote(fit, hh), SM.info, SM.windowHint, SM.samplePeak, SM.assumptions.join(' '),
    SM.report.reading.join(' '), SM.report.scope, SM.windowSets[0].label, SM.windowSets[0].basis, SM.windowSets[0].grade];
  return parts.join('\n');
}

t('XM1: the worked example in the MPA Background text is what the model computes (38.5 kg, 600 mg MMF, albumin 34 and 28)', function () {
  var a = 600 / PM(38.5, 34).CL, b = 600 / PM(38.5, 28).CL, bg = ECU.drugTexts.mpaped.background();
  truthy(bg.indexOf(String(Math.round(a))) >= 0 && bg.indexOf(String(Math.round(b))) >= 0, 'the text names ' + Math.round(a) + ' and ' + Math.round(b));
  truthy(/−2\.49/.test(bg) && /34 g\/L/.test(bg) && /24–42 g\/L/.test(bg));
});

t('XM2: the evaluation numbers are those of the 2026 paper (Tables 4, 5, 7), the scope sentence and the sampled-day sentence are present, the unit rule is stated', function () {
  var tx = ECU.drugTexts.mpaped, a = tx.aboutSections(), bg = tx.background();
  ['0.1%', '21.0%', '6.6%', '32.5%', '15.4%', '48.6%'].forEach(function (n) { truthy(a.indexOf(n) >= 0, 'About names ' + n); });
  ['0.1%', '21.0%', '6.6%', '32.5%'].forEach(function (n) { truthy(bg.indexOf(n) >= 0, 'Background names ' + n); });
  var scope = 'Children with a kidney transplant on mycophenolate mofetil (CellCept) together with tacrolimus or everolimus. Not for ciclosporin co-medication, for EC-MPS or for other indications. Built on children aged 4–18 years, weight 13–80 kg and albumin 24–42 g/L, with a median of 9.5 days after transplantation. Enter the MMF dose as mg of MMF.';
  truthy(a.indexOf(scope) >= 0 && bg.indexOf(scope) >= 0, 'scope sentence');
  var day = 'The reported AUC is for a typical day on this regimen, estimated from the samples. The AUC of a single day can differ from it by a factor of about 1.2 to 1.3 (one standard deviation).';
  [a, bg, tx.resultNote({}, { esc: String, fmtC: String }), tx.reportNote({}, { esc: String, fmtC: String })].forEach(function (x) { truthy(x.indexOf(day) >= 0, 'typical-day sentence'); });
  truthy(/Children with a kidney transplant\. Typical-day estimate from the samples\./.test(SM.report.scope), 'MPA report scope says typical day, not the sampled day');
  truthy(/applies none/.test(bg) && /EMIT/.test(bg) && /Use the same assay/.test(bg) && /nephrotic/i.test(bg));
  truthy(/In simulations with the model itself, the AUC of a single day differed from the typical-day value by a factor of about 1\.2 to 1\.3 \(one standard deviation; about 1\.3 to 1\.6 for the middle 90%\), and on average lay 0 to 7% above it/.test(a), 'the typical-day caveat of the calibration study (docs/CALIBRATION_RESULTS_PEDIATRIC.md, L4b), with the 90% range');
});

t('XM3: guard text — no em-dashes, no dose-scheme or dose-advice wording, no starting-dose table, no mg/m², the three papers cited, 30-60 window source named', function () {
  var all = allMpaText();
  falsy(/—/.test(all), 'no em-dash'); falsy(/not validated/i.test(all), 'no "not validated"');
  falsy(/mg\/m|per m²|body surface/i.test(all), 'no mg/m² guidance');
  falsy(/\b(should be given|should receive|increase the dose|decrease the dose|reduce the dose|raise the dose|start with|starting dose|initial dose|optimal dose|optimi[sz]e)/i.test(all), 'no dose advice');
  falsy(/Table 3/.test(all), 'no starting-dose table');
  falsy(/recommend/i.test(all.replace(/does not select or recommend a dose/g, '').replace(/not recommendations/g, '')), 'recommend appears only in the two negations');
  truthy(/Heida/.test(all) && /2024/.test(all) && /2026/.test(all) && /Bergan/.test(all));
  truthy(SM.windowSets[0].basis.indexOf('Bergan 2021') >= 0 && /50 mg·h\/L/.test(SM.windowSets[0].basis));
});

// ===========================================================================
// the screen and the report (step 5): which value a window is judged on, and what a plasma-assay drug does not show
// ===========================================================================
function pct0(p) { return Math.round(p * 100) + '%'; }

t('U1: pediatric tacrolimus judges its window on the corrected value (defined at haematocrit 0.35); adult tacrolimus keeps judging the measured one', async function () {
  var fit = await B.runFit(pedInput({ winLo: 100, winHi: 250 }), null), W = { lo: 100, hi: 250 };
  truthy(pct0(fit.auc.pInWindow) !== pct0(fit.aucCorr.pInWindow), 'precondition: the two probabilities differ (' + pct0(fit.auc.pInWindow) + ' vs ' + pct0(fit.aucCorr.pInWindow) + ')');
  var rows = ECU.ui.exposureRows('Steady-state AUC₀–12h', fit.auc, fit.aucCorr, W, fit.windowSet, 'µg·h/L', fit, '');
  var chips = rows.match(/chip-v">(\d+%)</g).map(function (x) { return x.replace(/chip-v">|</g, ''); });
  eq(chips[0], pct0(fit.aucCorr.pInWindow), 'the first chip is the corrected value');
  eq(chips[1], pct0(fit.aucCorr.pAboveLower)); eq(chips[2], pct0(fit.aucCorr.pBelowUpper));
  truthy(/chance<\/b> the corrected AUC is within the window 100 to 250/.test(rows), 'the sentence says it is the corrected AUC');
  falsy(/\(corrected: \d+%\)/.test(rows), 'no second percentage in brackets');
  truthy(/Corrected to haematocrit 0\.35/.test(rows), 'the corrected line is still shown beside it');
  // the same probabilities reach the printed report and the summary hint
  var tile = ECU.report.probLine({ what: 'AUC', unit: 'µg·h/L', stats: fit.auc, corr: fit.aucCorr, win: W, judge: 'corrected' }, fit, SM);
  truthy(tile.indexOf(pct0(fit.aucCorr.pInWindow) + ' chance') >= 0 && /corrected AUC/.test(tile));
  truthy(ECU.diagnostics.summaryHint(fit).indexOf('Probability of the corrected AUC within its window: ' + Math.round(fit.aucCorr.pInWindow * 100) + '%') >= 0);
  // adult tacrolimus: unchanged (measured value judged, the corrected percentage in brackets)
  var tEnd = 24 * 40 + 8, ft = await B.runFit({ drug: 'tac', wt: 80, extra: { sex: 'm', ht: '175', pred: '10', hct: '0.25', assay: 'lcms' }, doses: M.ssHistory({ amt: 3000, intervalHours: 12, tEnd: tEnd, n: 30 }), steadyState: true,
    obs: [{ t: tEnd, c: 4.1, hct: 0.25 }, { t: tEnd + 2, c: 9.8, hct: 0.25 }], intervalHours: 12, winLo: 80, winHi: 150, seed: 1, mcmcIters: 40000 }, null);
  var ra = ECU.ui.exposureRows('Steady-state AUC₀–12h', ft.auc, ft.aucCorr, { lo: 80, hi: 150 }, ft.windowSet, 'µg·h/L', ft, '');
  eq(ra.match(/chip-v">(\d+%)</)[1], pct0(ft.auc.pInWindow), 'adult: the first chip is the measured value');
  truthy(/chance<\/b> the AUC is within the window/.test(ra) && /\(corrected: \d+%\)/.test(ra), 'adult: the sentence as before');
});

t('U2: pediatric MPA shows no corrected rows, no haematocrit and no trough window; its trough is informational', async function () {
  var fit = await B.runFit(mpaInput(), null);
  eq(fit.hctRef, null);
  var auc = ECU.ui.exposureRows('Steady-state AUC₀–12h', fit.auc, null, { lo: fit.winLo, hi: fit.winHi }, fit.windowSet, 'mg·h/L', fit, '');
  var tr = ECU.ui.exposureRows('Predicted trough, steady state', fit.trough, null, fit.troughWin, false, 'mg/L', fit, '');
  falsy(/Corrected to haematocrit/.test(auc + tr), 'no corrected line');
  truthy(/chance<\/b> the AUC is within the window 30\.0 to 60\.0/.test(auc), 'the AUC is judged against 30-60, measured value');
  truthy(/Informational: the app has no trough target/.test(tr) && !/chip-v/.test(tr), 'the trough is informational');
  var hint = ECU.diagnostics.summaryHint(fit);
  falsy(/corrected|haematocrit/i.test(hint), 'the summary hint mentions neither');
  truthy(ECU.ui.hasBlood(M.spec('tacped')) && ECU.ui.hasBlood(M.spec('tac')) && ECU.ui.hasBlood(M.spec('evr')) && !ECU.ui.hasBlood(M.spec('mpaped')) && !ECU.ui.hasBlood(M.spec('mpa')), 'blood correction: tacrolimus (both), everolimus; not MPA (either)');
  truthy(ECU.ui.hasDoseForm(M.spec('tacped')) && !ECU.ui.hasDoseForm(M.spec('tac')) && !ECU.ui.hasDoseForm(M.spec('mpaped')), 'a per-dose formulation only for pediatric tacrolimus');
});

t('U3: the picker order is the owner’s: MPA adult, MPA pediatric, tacrolimus adult, tacrolimus pediatric, everolimus; an unknown drug goes last', function () {
  eq(M.listDrugs().map(function (d) { return d.id; }).join(','), 'mpa,mpaped,tac,tacped,evr');
  M.drugs.zzz = Object.assign({}, SM, { id: 'zzz' });
  try { eq(M.listDrugs().map(function (d) { return d.id; }).join(','), 'mpa,mpaped,tac,tacped,evr,zzz'); } finally { delete M.drugs.zzz; }
  var cards = ECU.ui.drugCardsHtml('tacped');
  eq(cards.match(/data-drug="([a-z]+)"/g).join(','), 'data-drug="mpa",data-drug="mpaped",data-drug="tac",data-drug="tacped",data-drug="evr"');
  truthy(/data-drug="tacped" aria-pressed="true"/.test(cards));
  M.listDrugs().forEach(function (d) { var c = M.spec(d.id).card; truthy(c && c.name && c.sub, d.id + ' has card texts'); });
});

t('U4: scope warnings reach the screen and the report through the spec — weight and albumin outside the data, none inside, none for the other drugs', function () {
  eq(ECU.ui.scopeWarningsLive.length, 0);   // a function of no arguments: it reads the page, so only its existence is checked here
  var notes = ECU.ui.sessionObj ? true : false; truthy(notes);
  eq(SM.custom.scopeWarnings(30, { albumin: 34 }).length, 0); eq(SM.custom.scopeWarnings(30, { albumin: 20 }).length, 1);
  eq(S.custom.scopeWarnings(25, { hct: 0.3 }).length, 0); eq(S.custom.scopeWarnings(90, { hct: 0.3 }).length, 1);
  eq(M.spec('tac').custom.scopeWarnings, undefined); eq(M.spec('evr').custom.scopeWarnings, undefined);
});

// ---------------------------------------------------------------------------
// regression records (bit-identity): fixed-seed fits equal the recorded baselines exactly. Cases: tools/ped_regression_cases.mjs; recorder:
// tools/record_ped_regression.mjs. Re-record only for an intended change to the numbers, and say why in the release notes.
// ---------------------------------------------------------------------------
['mpaped', 'tacped'].forEach(function (drug) {
  t('V16-' + drug + ' (regression): fixed-seed ' + drug + ' fits and the dose scan equal the recorded baseline exactly', async function () {
    var rec = JSON.parse(fs.readFileSync(path.join(__dirname, drug + '_regression.json'), 'utf8')), C = (await import('../tools/ped_regression_cases.mjs')).pedCases(M), cases = C[drug], blood = drug === 'tacped', f1 = null;
    eq(Object.keys(cases).join(','), 'ss_trough_peak,' + (blood ? 'hist_switch' : 'hist_two_days') + ',population');
    for (var key of Object.keys(cases)) {
      var f = await B.runFit(cases[key], null), r = rec[key];
      eq(JSON.stringify([f.auc.p5, f.auc.median, f.auc.p95, f.auc.pInWindow]), JSON.stringify(r.auc), key + ' AUC');
      eq(JSON.stringify([f.trough.p5, f.trough.median, f.trough.p95, f.trough.pInWindow]), JSON.stringify(r.tr), key + ' trough');
      if (blood) {
        eq(JSON.stringify([f.aucCorr.p5, f.aucCorr.median, f.aucCorr.p95, f.aucCorr.pInWindow]), JSON.stringify(r.aucC), key + ' corrected AUC');
        eq(JSON.stringify([f.troughCorr.p5, f.troughCorr.median, f.troughCorr.p95, f.troughCorr.pInWindow]), JSON.stringify(r.trC), key + ' corrected trough');
      }
      eq(f.acceptance, r.acc, key + ' acceptance'); eq(f.nDraws, r.nDraws); eq(f.nOccasions, r.nOcc);
      if (r.mapEta) { eq(JSON.stringify(f.map.eta), JSON.stringify(r.mapEta), key + ' MAP'); eq(f.map.ofv, r.mapOfv); }
      if (key === 'ss_trough_peak') f1 = f;
    }
    var cs = cases.ss_trough_peak, last = cs.doses[cs.doses.length - 1];
    var sc = await B.doseScan({ draws: f1.draws, drug: drug, wt: f1.wt, extra: f1.extra, tEnd: last.t, amounts: blood ? [2000, 3000, 4000] : [450, 600, 750], intervalHours: 12, winLo: cs.winLo, winHi: cs.winHi, troughLo: cs.troughLo, troughHi: cs.troughHi, form: last.form });
    sc.forEach(function (x, i) { eq(JSON.stringify([x.amt, x.auc.median, x.auc.p5, x.trough.median, x.trough.pInWindow, blood ? x.aucCorr.median : null]), JSON.stringify(rec.scan[i]), 'scan ' + i); });
  });
});

// ---------------------------------------------------------------------------
// the review pass (5 October 2026): claims the sources do not support stay out, qualifiers and scope stay in, warnings follow the owner's ranges
// ---------------------------------------------------------------------------
function pedTexts(drug) {
  var X = ECU.drugTexts[drug], sp = M.spec(drug), h = { esc: String, fmtC: String };
  return [X.background(), X.aboutSections(), X.help.window, X.help.ivexplore, X.explorerNote, X.doseNote, X.gettingStarted(), sp.info, sp.windowHint, sp.samplePeak, sp.assumptions.join(' '), sp.report.reading.join(' '), sp.report.windowSource,
    sp.windowSets.map(function (w) { return w.label + ' ' + w.basis; }).join(' ')].join('\n');
}

t('R1: claims the sources do not support are gone — no "defined at haematocrit 0.35", no institution name for the local guideline, no "6 h" over-prediction, no "accurately" without the limit', function () {
  var all = pedTexts('tacped') + pedTexts('mpaped');
  falsy(/defined for whole blood at (a )?haematocrit/i.test(all) && !/taken to refer/.test(all), 'the 0.35 claim is worded as taken to refer');
  falsy(/Defined for whole blood/.test(all), 'no "Defined for whole blood"');
  falsy(/Radboudumc/.test(all), 'no institution named for the local guideline');
  falsy(/over-prediction (at|about) 6/.test(all), 'no unsupported 6 h claim');
  falsy(/estimated accurately|estimated the AUC accurately/.test(all), '"accurately" is not used without the limit');
  truthy(/taken to refer to (a )?haematocrit|taken to refer to whole blood/.test(pedTexts('tacped')), 'tacrolimus: the targets are taken to refer to 0.35');
  truthy(S.windowSets.every(function (w) { return /Schijvens 2019|Heida 2026/.test(w.basis) && /corrected value/.test(w.basis); }), 'every window set names its sources and the corrected value');
  truthy(S.windowSets.every(function (w) { return /after transplant/.test(w.label); }), 'every tacrolimus window label carries the time reference');
});

t('R2: accuracy sentences carry their qualifiers (the 25 % limit, the same-model full-profile reference), scope carries age and timing, research-use and ciclosporin are on the screen', function () {
  ['tacped', 'mpaped'].forEach(function (d) {
    var bg = ECU.drugTexts[d].background(), ab = ECU.drugTexts[d].aboutSections();
    truthy(/limit of 25%/.test(bg) && /same model/.test(bg) && /children the model was built on/.test(bg), d + ': Background qualifiers');
    truthy(/limit of 25%/.test(ab) && /same model/.test(ab), d + ': About qualifiers');
    truthy(/For research use only; not a medical device\./.test(M.spec(d).info), d + ': research use only under the cards');
    truthy(/CYP3A5|ciclosporin/.test(ECU.drugTexts[d].doseNote + ab), d + ': the exclusion is stated');
  });
  truthy(/Not for ciclosporin co-medication or EC-MPS/.test(ECU.drugTexts.mpaped.doseNote) && /not mg of mycophenolic acid/.test(ECU.drugTexts.mpaped.doseNote), 'MPA dose note: ciclosporin and the unit at the point of use');
  truthy(/aged 4–18 years/.test(ECU.drugTexts.mpaped.background()) && /aged 1–17 years/.test(ECU.drugTexts.tacped.background()), 'ages in the scope sentences');
  truthy(/CYP3A5 genotype/.test(ECU.drugTexts.tacped.aboutSections() + S.assumptions.join(' ')), 'CYP3A5 genotype is named as not in the model');
  truthy(/84% of the estimates were within 30%/.test(ECU.drugTexts.mpaped.background()) && /above the limit: 6\.6% and 32\.5%/.test(ECU.drugTexts.mpaped.background()), 'MPA P30 and the trough above the limit');
  truthy(/lists an AUC above 50|lists above 50/.test(ECU.drugTexts.mpaped.background() + SM.windowSets[0].basis) && /not with nephrotic syndrome/.test(ECU.drugTexts.mpaped.background()) && /Above the lower bound/.test(ECU.drugTexts.mpaped.background()), 'nephrotic: source wording, the model limit and the mechanism');
  falsy(/Table 3/.test(pedTexts('mpaped') + pedTexts('tacped')), 'no starting-dose table');
});

t('R3: warnings follow the owner’s ranges — haematocrit outside 0.15-0.60 warns (no refusal), weight and albumin warn only inside the refusal limits and say what it means', function () {
  eq(T.scopeWarnings(25, { hct: 0.30 }).length, 0); eq(T.scopeWarnings(25, { hct: 0.15 }).length, 0); eq(T.scopeWarnings(25, { hct: 0.60 }).length, 0);
  eq(T.scopeWarnings(25, { hct: 0.14 }).length, 1); eq(T.scopeWarnings(25, { hct: 0.65 }).length, 1);
  truthy(/outside 0\.15 to 0\.60/.test(T.scopeWarnings(25, { hct: 0.65 })[0]), T.scopeWarnings(25, { hct: 0.65 })[0]);
  eq(T.scopeWarnings(25, { hct: 0.05 }).length, 0, 'below the refusal limit the refusal speaks, not a warning'); eq(T.scopeWarnings(25, { hct: 0.75 }).length, 0);
  T.normExtra({ hct: '0.65' }, 25);   // warned, not refused
  truthy(/treat the estimate as unreliable/.test(T.scopeWarnings(7, { hct: 0.3 })[0]), 'weight warning says what it means');
  eq(T.scopeWarnings(2, { hct: 0.3 }).length, 0, 'weight 2 kg: refused, no extra warning'); eq(T.scopeWarnings(250, { hct: 0.3 }).length, 0);
  eq(TM.scopeWarnings(30, { albumin: 3.4 }).length, 0, 'albumin 3.4: refused, no warning'); eq(TM.scopeWarnings(30, { albumin: 55 }).length, 0); eq(TM.scopeWarnings(2, { albumin: 34 }).length, 0);
  truthy(/can be far off/.test(TM.scopeWarnings(30, { albumin: 15 })[0]) && /treat the estimate as unreliable/.test(TM.scopeWarnings(8, { albumin: 34 })[0]), 'albumin and weight warnings say what it means');
  eq(TM.scopeWarnings(30, { albumin: 5 }).length, 1); eq(TM.scopeWarnings(30, { albumin: 50 }).length, 1);
});

t('R4: the latest sample is the latest by time, whatever the input order', function () {
  var base = { extra: { hct: '0.40' }, wt: 25, steadyState: false, doses: [{ t: 0, amt: 3000, form: 'capsule' }, { t: 12, amt: 3000, form: 'capsule' }] };
  var a = T.prepare(Object.assign({ obs: [{ t: 14, c: 7, hct: 0.31 }, { t: 12, c: 4.1, hct: 0.33 }] }, base)), b = T.prepare(Object.assign({ obs: [{ t: 12, c: 4.1, hct: 0.33 }, { t: 14, c: 7, hct: 0.31 }] }, base));
  near(a.hctReport, 0.31, 1e-12); near(b.hctReport, 0.31, 1e-12); near(a.extra.hct, 0.31, 1e-12);
});

function strip(html) { return html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' '); }
function pedCtx(spec, fit, over) {
  return Object.assign({ fit: fit, spec: spec, inputsChanged: false, patientId: 'ID-1', weight: '25', usesWeight: true, form: null, formLabel: '', extra: {}, doses: [{ t: 100, amt: spec.id === 'tacped' ? 3 : 600, route: 'oral', form: spec.id === 'tacped' ? 'capsule' : undefined }], obs: [],
    ssMode: true, win: { lo: fit.winLo, hi: fit.winHi }, troughWin: { lo: null, hi: null }, settings: 'Dosing input: steady state', advice: '', prepared: '', now: '2026-10-05 12:00', version: '1.5.0',
    units: spec.units, notes: { convergence: '', shortHistory: '', shrink: '', anchor: '', scope: '' }, fmtClock: function (x) { return String(x); } }, over || {});
}

t('U5: the tile says the large number is the measured value and that the window is compared with the corrected one; adult tiles are untouched', async function () {
  var fit = await B.runFit(pedInput({ winLo: 100, winHi: 250 }), null), W = { lo: 100, hi: 250 };
  var html = ECU.ui.exposureRows('Steady-state AUC₀–12h', fit.auc, fit.aucCorr, W, fit.windowSet, 'µg·h/L', fit, ''), txt = strip(html);
  truthy(/as measured \(haematocrit 0\.30\), median and 5 to 95% interval/.test(txt), 'subtitle names the measured value and its haematocrit');
  truthy(/Corrected to haematocrit 0\.35: .*compared with the window/.test(txt), 'the corrected line says it is the compared value');
  var tEnd = 24 * 40 + 8, ft = await B.runFit({ drug: 'tac', wt: 80, extra: { sex: 'm', ht: '175', pred: '10', hct: '0.25', assay: 'lcms' }, doses: M.ssHistory({ amt: 3000, intervalHours: 12, tEnd: tEnd, n: 30 }), steadyState: true,
    obs: [{ t: tEnd, c: 4.1, hct: 0.25 }, { t: tEnd + 2, c: 9.8, hct: 0.25 }], intervalHours: 12, winLo: 80, winHi: 150, seed: 1, mcmcIters: 40000 }, null);
  var ta = strip(ECU.ui.exposureRows('Steady-state AUC₀–12h', ft.auc, ft.aucCorr, { lo: 80, hi: 150 }, ft.windowSet, 'µg·h/L', ft, ''));
  truthy(/median and 5 to 95% interval/.test(ta) && !/as measured \(haematocrit/.test(ta) && !/compared with the window/.test(ta), 'adult tacrolimus: the subtitle and the corrected line are as before');
});

t('U6: the window a result was judged against is named — set label for a set, "your own bounds" for typed ones, nothing for drugs without the flag', function () {
  var w = ECU.ui.windowNoteOf;
  eq(w('auc', S, 'ped-6w-6m'), 'Window: AUC, 6 weeks–6 months after transplant, judged on the corrected value.');
  eq(w('auc', S, 'ped-6w-6m', true), 'Window: AUC, 6 weeks–6 months after transplant.');
  eq(w('trough', S, 'ped-trough-early'), 'Window: Trough, first 2 months after transplant, judged on the corrected value.');
  eq(w('trough', S, 'ped-6w-6m'), 'Window: your own bounds, judged on the corrected value.', 'an AUC set does not describe a typed trough window');
  eq(w('auc', S, null), 'Window: your own bounds, judged on the corrected value.'); eq(w('auc', S, 'no-such-set'), 'Window: your own bounds, judged on the corrected value.');
  var src = fs.readFileSync(path.join(__dirname, '..', 'src', 'ui.js'), 'utf8');   // the DOM call sites cannot run here: they are checked in the browser pass; this stops them being removed unnoticed
  truthy(/windowNoteOf\('auc', spec1, wsId\)/.test(src) && /windowNoteOf\('trough', spec1, wsId\)/.test(src), 'the result tiles pass the window note');
  truthy(/windowNoteOf\('auc', M\.spec\(fit\.drug\), state\.lastRunView/.test(src) && /windowNoteOf\('trough', M\.spec\(fit\.drug\), state\.lastRunView/.test(src), 'the explorer tiles pass it too');
  truthy(/winSet: state\.winSet, drug: \$\('pt-drug'\)\.value/.test(src) && /windowSet: state\.winSet,/.test(src) && /state\.winSet = w\.id;/.test(src), 'the run snapshot, the session and the Use button carry the set id');
  truthy(/winNotes: view \? \{ auc: windowNoteOf\('auc', spec, view\.winSet, true\)/.test(src), 'the report context carries the short notes');
  eq(w('auc', SM, 'kidney-ped'), '', 'pediatric MPA: no note'); eq(w('auc', M.spec('tac'), 'kidney-standard'), '', 'adult tacrolimus: no note'); eq(w('trough', M.spec('evr'), 'evr-cni'), '', 'everolimus: no note');
});

t('U7: the report names the window set and the value it was judged on, and the title names the pediatric drug; adult report titles are unchanged', async function () {
  var fit = await B.runFit(pedInput({ winLo: 100, winHi: 250 }), null);
  var withSet = strip(R_build(pedCtx(S, fit, { winNotes: { auc: ECU.ui.windowNoteOf('auc', S, 'ped-6w-6m', true), trough: '' } })));
  truthy(/NephroTDM report: tacrolimus \(pediatric kidney\)/.test(withSet), 'title');
  truthy(/Window: AUC, 6 weeks–6 months after transplant\./.test(withSet), 'the window note names the set');
  truthy(/Corrected to haematocrit 0\.35: [^·]*· vs window/.test(withSet) && /chance the corrected AUC is within the window/.test(withSet), 'the corrected line is marked and the sentence names the corrected value');
  var own = strip(R_build(pedCtx(S, fit, { winNotes: { auc: ECU.ui.windowNoteOf('auc', S, null, true), trough: '' } })));
  truthy(/Window: your own bounds\./.test(own));
  var fm = await B.runFit(mpaInput(), null), mrep = strip(R_build(pedCtx(SM, fm, { winNotes: null, usesWeight: true })));
  truthy(/NephroTDM report: mycophenolic acid \(pediatric kidney\)/.test(mrep) && /Typical-day estimate from the samples/.test(mrep), 'MPA title and scope line');
  falsy(/Window: /.test(mrep), 'no window note for MPA');
  var tEnd = 24 * 40 + 8, fa = await B.runFit({ drug: 'tac', wt: 80, extra: { sex: 'm', ht: '175', pred: '10', hct: '0.33', assay: 'lcms' }, doses: M.ssHistory({ amt: 3000, intervalHours: 12, tEnd: tEnd, n: 30 }), steadyState: true, obs: [{ t: tEnd, c: 4.1, hct: 0.33 }], intervalHours: 12, winLo: 80, winHi: 150, seed: 1, mcmcIters: 40000 }, null);
  var adult = strip(R_build(pedCtx(M.spec('tac'), fa, { winNotes: null })));
  truthy(/NephroTDM report: tacrolimus Generated/.test(adult), 'adult title unchanged'); falsy(/pediatric/.test(adult), 'no pediatric wording in the adult report');
});
function R_build(ctx) { return ECU.report.build(ctx); }

t('U8: placeholders and the weight step come from the specs only (covariate fields carry them; the adult fields have none)', function () {
  eq(M.covariateFields('tacped').filter(function (c) { return c.id === 'hct'; })[0].placeholder, 'e.g. 0.33');
  eq(M.covariateFields('mpaped').filter(function (c) { return c.id === 'albumin'; })[0].placeholder, 'e.g. 34');
  ['mpa', 'tac', 'evr'].forEach(function (id) { M.covariateFields(id).forEach(function (c) { eq(c.placeholder, null, id + ':' + c.id); }); });
  eq(S.wtStep, 0.1); eq(SM.wtStep, 0.1); eq(M.spec('tac').wtStep, undefined); eq(M.spec('mpa').wtStep, undefined);
  var src = fs.readFileSync(path.join(__dirname, '..', 'src', 'ui.js'), 'utf8');
  truthy(/el\.step = s\.wtStep != null \? s\.wtStep : '0\.5'/.test(src), 'ui.js resets the step to 0.5 for drugs without wtStep');
  truthy(/<div class="note warn no-print" id="scopeWarn"[^>]*style="flex:1 1 100%"/.test(fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8')), 'the warning line sits in the covariate row, full width');
});

if (require.main === module) {
  h.runAll().then(function (ok) { process.exit(ok ? 0 : 1); });
}
