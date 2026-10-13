/* =========================================================================
 * NephroTDM: tests for the findings of docs/ADVERSARIAL_REVIEW_V150.md (13 October 2026).
 * Run: node tests/test_audit150.js   (part of `npm test`)
 * Every assertion here was run against the 1.5.0 tree first and failed there (docs/ADVERSARIAL_FIXES_V151.md has the record).
 * ========================================================================= */
'use strict';
var fs = require('fs'), path = require('path'), cp = require('child_process');
var h = require('./harness.js');
var t = h.t, eq = h.eq, truthy = h.truthy, falsy = h.falsy, throws = h.throws, rejects = h.rejects;

['version', 'model', 'tacrolimus', 'everolimus', 'tacped', 'mpaped', 'texts_tacped', 'texts_mpaped', 'bayes', 'parallel', 'chart', 'diagnostics', 'texts_tac', 'texts_evr', 'author_photo', 'report', 'ui']
  .forEach(function (f) { require('../src/' + f + '.js'); });
var ECU = globalThis.ECU, M = ECU.model, B = ECU.bayes, U = ECU.ui;
var ROOT = path.join(__dirname, '..');

/* a DOM stub that remembers what the code wrote: every element keeps its value, text, classes and focus */
function stubDom(initial) {
  var els = {};
  function el(id) {
    if (els[id]) return els[id];
    var cls = {};
    var e = els[id] = { id: id, value: '', innerHTML: '', textContent: '', hidden: false, disabled: false, checked: false, style: {}, options: [], focused: false,
      classList: { add: function (c) { cls[c] = true; }, remove: function (c) { delete cls[c]; }, contains: function (c) { return !!cls[c]; } },
      focus: function () { e.focused = true; }, closest: function () { return null; }, querySelector: function () { return null; }, querySelectorAll: function () { return []; }, addEventListener: function () {}, setAttribute: function () {}, getAttribute: function () { return null; }, removeAttribute: function () {}, appendChild: function () {} };
    return e;
  }
  Object.keys(initial || {}).forEach(function (k) { Object.keys(initial[k]).forEach(function (f) { el(k)[f] = initial[k][f]; }); });
  globalThis.document = { getElementById: el, querySelector: function () { return null; }, querySelectorAll: function () { return []; }, title: '', createElement: function () { return el('x' + Math.random()); } };
  globalThis.print = function () {};
  return els;
}
function dropDom() { delete globalThis.document; delete globalThis.print; delete globalThis.confirm; }

// ---------------------------------------------------------------------------
// C1: a mistimed dose must not become an AUC
// ---------------------------------------------------------------------------
function bidHistory(n, lastExtra) {
  var d = [];
  for (var i = 0; i < n; i++) d.push({ t: 1000 + i * 12, amt: 1000, route: 'oral' });
  if (lastExtra != null) d.push({ t: d[d.length - 1].t + lastExtra, amt: 1000, route: 'oral' });
  return d;
}
t('C1: MPA, a dose entered 2 h after the previous one is refused with the interval named (it was a silent 6-fold AUC)', function () {
  var S = M.spec('mpa'), doses = bidHistory(20, 2);
  var msgs = U.inputProblems(S, { intervalHours: 2, doses: doses, obs: [] }, [1000], false);
  truthy(msgs.some(function (m) { return /dosing interval is 2 h/.test(m) && /4 to 48 h/.test(m); }), 'the absurd interval is named: ' + JSON.stringify(msgs));
  eq(msgs.length, 1, 'one message for one cause');
});
t('C1: a regular twice-daily history, and a 10 h gap inside the tolerance, raise nothing', function () {
  var S = M.spec('mpa');
  eq(U.inputProblems(S, { intervalHours: 12, doses: bidHistory(20), obs: [] }, [1000], false).length, 0, 'regular');
  eq(U.inputProblems(S, { intervalHours: 10, doses: bidHistory(20, 10), obs: [] }, [1000], false).length, 0, 'a late dose (10 h against 12 h) is within the 25 % tolerance');
});
t('C1: a skipped dose (24 h gap after a 12 h history) is refused, as is an irregular last gap of 8 h', function () {
  var S = M.spec('mpa');
  truthy(U.inputProblems(S, { intervalHours: 24, doses: bidHistory(20, 24), obs: [] }, [1000], false).some(function (m) { return /about 12 h apart/.test(m); }), 'skipped');
  truthy(U.inputProblems(S, { intervalHours: 8, doses: bidHistory(20, 8), obs: [] }, [1000], false).some(function (m) { return /8 h apart/.test(m); }), '8 h');
});
t('C1: in steady-state mode the typed interval is bounded for MPA too, and a normal one passes', function () {
  var S = M.spec('mpa');
  truthy(U.inputProblems(S, { intervalHours: 2, doses: bidHistory(10), obs: [] }, [1000], true).some(function (m) { return /dosing interval is 2 h\. Intervals outside/.test(m); }));
  eq(U.inputProblems(S, { intervalHours: 12, doses: bidHistory(10), obs: [] }, [1000], true).length, 0);
});

// ---------------------------------------------------------------------------
// H1: the haematocrit of the latest sample, not the last-entered one
// ---------------------------------------------------------------------------
t('H1: adult tacrolimus, samples entered out of order: the report haematocrit is the latest-in-time sample’s', function () {
  var P = M.spec('tac').custom.prepare({ wt: 80, extra: { sex: 'm', ht: '175', pred: '10', hct: '0.33', assay: 'lcms', cyp3a5: 'unknown' }, steadyState: false,
    doses: [{ t: 0, amt: 3, route: 'oral' }, { t: 12, amt: 3, route: 'oral' }], obs: [{ t: 14, c: 9.8, hct: 0.45 }, { t: 12, c: 4.1, hct: 0.30 }] });
  eq(P.hctReport, 0.45, 'the sample at 14 h is the latest, whatever its position in the list');
});
t('H1: everolimus, samples entered out of order: the latest sample’s haematocrit is reported AND drives the fit', function () {
  var P = M.spec('evr').custom.prepare({ extra: { hct: '0.30', predHigh: 'low' }, doses: [{ t: 0, amt: 1.5, route: 'oral' }, { t: 12, amt: 1.5, route: 'oral' }],
    obs: [{ t: 14, c: 10.5, hct: 0.45 }, { t: 12, c: 3.2, hct: 0.30 }] });
  eq(P.hctReport, 0.45); eq(P.extra.hct, 0.45, 'the PK path (QHP = 90(1-Ht)) gets the same value');
});
t('H1: a session file is sorted on import, so every reader of "the latest" sees time order', function () {
  var els = stubDom({ 'pt-drug': { value: 'mpa' } });
  try {
    U.state.doses = []; U.state.obs = [];
    U.applySession({ app: 'mpa-tdm', drug: 'mpa', mode: 'full', doses: [{ t: 24, amt: 1000 }, { t: 0, amt: 1000 }, { t: 12, amt: 1000 }], obs: [{ t: 14, c: 9 }, { t: 12.5, c: 5 }], patient: { wt: '70' } });
    eq(els.toast.textContent, 'Session imported.', 'the import itself succeeded');
    eq(U.state.doses.map(function (d) { return d.t; }).join(), '0,12,24', 'doses');
    eq(U.state.obs.map(function (o) { return o.t; }).join(), '12.5,14', 'samples');
  } finally { dropDom(); U.state.doses = []; U.state.obs = []; M.select('mpa'); }
});

// ---------------------------------------------------------------------------
// H2: no statistic means no convergence claim
// ---------------------------------------------------------------------------
t('H2: fitConvergence — NaN quantities fail the gate (they used to pass it with R-hat −∞)', function () {
  var n = 400, draws = [], good = [], bad = [], i;
  for (i = 0; i < n; i++) { draws.push([Math.sin(i)]); good.push(10 + Math.sin(i * 7.1)); bad.push(NaN); }
  var lens = [n / 2, n / 2];
  var allBad = B.fitConvergence(draws, lens, bad, bad, 1, 100, 1, ['E']);
  eq(allBad.ok, false, 'both quantities NaN');
  truthy(!isFinite(allBad.rhat), 'and the R-hat is not a made-up −Infinity: ' + allBad.rhat);
  eq(B.fitConvergence(draws, lens, good, bad, 1, 100, 1, ['E']).ok, false, 'one quantity NaN: the other is not judged alone');
  eq(B.fitConvergence(draws, lens, bad, good, 1, 100, 1, ['E']).ok, false, 'the other way round');
});
t('H2: a MAP search that ends on a NaN gradient does not claim to have converged', function () {
  var calls = 0;
  var r = B.mapBFGS(function (x) { calls++; return calls > 6 ? NaN : (x[0] - 3) * (x[0] - 3) + (x[1] + 1) * (x[1] + 1) * 5; }, [1, 1]);
  eq(r.converged, false, 'early break on a non-finite value');
  var ok = B.mapBFGS(function (x) { return (x[0] - 3) * (x[0] - 3) + (x[1] + 1) * (x[1] + 1) * 5; }, [1, 1]);
  eq(ok.converged, true, 'a smooth problem still converges');
});

// ---------------------------------------------------------------------------
// H6: inverted window bounds are an input error in the engine too
// ---------------------------------------------------------------------------
t('H6: runFit refuses an inverted AUC window and an inverted trough window before sampling', async function () {
  var base = { drug: 'mpa', form: 'mmf', wt: 70, doses: M.ssHistory({ amt: 739, intervalHours: 12, tEnd: 488, n: 10, route: 'oral' }), steadyState: true, obs: [{ t: 489, c: 12, }], intervalHours: 12, seed: 1, mcmcIters: 200 };
  await rejects(B.runFit(Object.assign({}, base, { winLo: 60, winHi: 30 }), null), 'lower AUC window bound must be below the upper', 'inverted AUC window');
  await rejects(B.runFit(Object.assign({}, base, { winLo: 30, winHi: 30 }), null), 'lower AUC window bound', 'empty window');
  await rejects(B.runFit(Object.assign({}, base, { drug: 'tac', wt: 80, extra: { sex: 'm', ht: '175', pred: '10', hct: '0.33', assay: 'lcms', cyp3a5: 'unknown' }, doses: M.ssHistory({ amt: 3000, intervalHours: 12, tEnd: 488, n: 10, route: 'oral' }), obs: [{ t: 488, c: 5, hct: 0.33 }], winLo: 100, winHi: 200, troughLo: 12, troughHi: 8 }), null), 'trough window', 'inverted trough window');
});
t('H6: the UI validation of window bounds names the problem (validateRun)', function () {
  stubDom({});
  try {
    M.select('mpa');
    var msgs = U.validateRun({ wt: 70, doses: [{ t: 0, amt: 1000 }, { t: 12, amt: 1000 }], obs: [], intervalHours: 12, winLo: 60, winHi: 30, extra: {} });
    truthy(msgs.some(function (m) { return /lower window bound must be below the upper/.test(m); }), JSON.stringify(msgs));
    falsy(U.validateRun({ wt: 70, doses: [{ t: 0, amt: 1000 }, { t: 12, amt: 1000 }], obs: [], intervalHours: 12, winLo: 30, winHi: 60, extra: {} }).some(function (m) { return /window bound/.test(m); }), 'a good window raises nothing');
  } finally { dropDom(); }
});

// ---------------------------------------------------------------------------
// session round trip, window provenance, rollback, confirmation
// ---------------------------------------------------------------------------
function loadedSession() {
  return { app: 'mpa-tdm', appName: 'NephroTDM', version: '1.5.1', timeUnit: 'hours', drug: 'tacped', patient: { code: 'ID-7', wt: '25', age: '', renal: '', extra: '' },
    window: { lo: '180', hi: '270' }, troughWindow: { lo: '', hi: '' }, windowSet: 'ped-0-6w', formulation: 'mmf', recency: 'off', mode: 'full',
    ss: { dose: '', interval: '', anchor: '', form: '' }, doses: [{ t: 0, amt: 3, route: 'oral', form: 'capsule' }, { t: 12, amt: 3, route: 'oral', form: 'capsule' }],
    obs: [{ t: 14, c: 7.5, hct: 0.31 }], extras: { hct: '0.31' }, report: { prepared: 'Dr X', advice: 'None' } };
}
t('H6: export → import → export is a fixed point (session round trip)', function () {
  stubDom({});
  try {
    var first = loadedSession();
    U.applySession(first);
    eq(document.getElementById('toast').textContent, 'Session imported.', 'the first import succeeded');
    var a = JSON.parse(JSON.stringify(U.sessionObj()));
    U.applySession(a);
    eq(document.getElementById('toast').textContent, 'Session imported.', 'and the second');
    var b = JSON.parse(JSON.stringify(U.sessionObj()));
    eq(JSON.stringify(b), JSON.stringify(a), 'a second round trip changes nothing');
    eq(a.drug, 'tacped', 'the drug survives'); eq(a.doses.length, 2, 'doses'); eq(a.obs.length, 1, 'samples'); eq(a.obs[0].hct, 0.31, 'the sample’s haematocrit'); eq(a.windowSet, 'ped-0-6w', 'the window set');
    eq(a.report.advice, 'None', 'the report text'); eq(a.patient.code, 'ID-7', 'the patient code');
  } finally { dropDom(); U.state.doses = []; U.state.obs = []; M.select('mpa'); }
});
t('M1: a window-set label is trusted only if the set exists and the bounds on screen are its own (a hand-edited file printed forged provenance)', function () {
  stubDom({});
  try {
    var o = loadedSession(); o.window = { lo: '5', hi: '500' };
    U.applySession(o);
    eq(U.state.winSet, null, 'bounds of 5 to 500 are not the 0–6 week set’s 180 to 270');
    o = loadedSession(); o.windowSet = 'no-such-set';
    U.applySession(o);
    eq(U.state.winSet, null, 'an unknown id');
    o = loadedSession();
    U.applySession(o);
    eq(document.getElementById('toast').textContent, 'Session imported.');
    eq(U.state.winSet, 'ped-0-6w', 'the genuine set and bounds are kept');
  } finally { dropDom(); U.state.doses = []; U.state.obs = []; U.state.winSet = null; M.select('mpa'); }
});
t('M2: a session file for an unknown drug is refused by name and the drug on screen is not changed', function () {
  stubDom({});
  try {
    M.select('tac');
    var els = document.getElementById('toast');
    U.applySession({ app: 'mpa-tdm', drug: 'nonesuch', doses: [], obs: [] });
    eq(M.drug().id, 'tac', 'no half-applied import');
    truthy(/Import failed: .*does not have .*nonesuch/.test(els.textContent), 'the toast names the drug: ' + els.textContent);
  } finally { dropDom(); M.select('mpa'); }
});
t('M2: an import over a case on screen asks first, and a "no" changes nothing; an import is autosaved', function () {
  stubDom({});
  var saved = 0;
  try {
    U.state.doses = [{ t: 0, amt: 500, route: 'oral' }]; U.state.obs = [];
    globalThis.confirm = function () { return false; };
    U.applySession(loadedSession());
    eq(U.state.doses.length, 1, 'declined: the case on screen is untouched'); eq(U.state.doses[0].amt, 500);
    globalThis.confirm = function () { return true; };
    var store = {}; globalThis.localStorage = { setItem: function (k, v) { saved++; store[k] = v; }, getItem: function (k) { return store[k] || null; }, removeItem: function () {} };
    var realSet = globalThis.setTimeout; globalThis.setTimeout = function (fn) { fn(); return 0; };
    try { U.applySession(loadedSession()); } finally { globalThis.setTimeout = realSet; }
    eq(U.state.doses.length, 2, 'accepted: the file replaced it');
    truthy(saved > 0, 'the imported case was autosaved, so closing the tab offers it back');
  } finally { delete globalThis.localStorage; dropDom(); U.state.doses = []; U.state.obs = []; M.select('mpa'); }
});

// ---------------------------------------------------------------------------
// C2: the report's view is the one the fit was run on
// ---------------------------------------------------------------------------
t('C2: a dose added while a fit runs is not in the report’s view of that fit, and the stale banner shows even on a first run', async function () {
  var els = stubDom({ 'pt-drug': { value: 'mpa' }, 'pt-wt': { value: '70' }, 'pt-winlo': { value: '30' }, 'pt-winhi': { value: '60' }, 'pt-form': { value: 'mmf' }, 'pt-recency': { value: 'off' } });
  try {
    M.select('mpa');
    U.state.lastRun = null; U.state.lastRunView = null; U.state.running = false;
    var base = 1000, i;
    U.state.doses = []; for (i = 0; i < 12; i++) U.state.doses.push({ t: base + i * 12, amt: 1000, route: 'oral' });
    U.state.obs = [{ t: base + 11 * 12 + 1, c: 12.1 }, { t: base + 11 * 12 + 3, c: 5.2 }];
    var p = U.runForecast();
    U.state.doses.push({ t: base + 12 * 12, amt: 1000, route: 'oral' });   // the user adds a dose while the fit runs...
    U.markStale();                                                          // ...which the app registers as an edit
    await p;
    truthy(U.state.lastRunView, 'the fit finished and a view was stored: ' + els.runHint.textContent);
    eq(U.state.lastRunView.doses.length, 12, 'the view holds the 12 doses the fit saw, not the 13 on screen now');
    eq(U.state.lastRunInputs.doses.length, 12, 'the same as the fit’s own input');
    truthy(els.staleBanner.classList.contains('show'), 'the banner is up although no earlier run existed');
  } finally { dropDom(); U.state.doses = []; U.state.obs = []; U.state.lastRun = null; U.state.lastRunView = null; U.state.lastRunInputs = null; U.state.running = false; M.select('mpa'); }
});

// ---------------------------------------------------------------------------
// medium: the dose explorer runs one scan at a time
// ---------------------------------------------------------------------------
t('M3: the dose explorer ignores a second click while a scan runs (it ran two scans and the slower won)', async function () {
  var els = stubDom({ 'iv-status': { textContent: 'unchanged' } });
  try {
    U.state.lastRun = { drug: 'mpa' }; U.state.exploring = true;
    await U.runExplorer();
    eq(els['iv-status'].textContent, 'unchanged', 'the second call returned without starting a scan');
    U.state.exploring = false;
  } finally { dropDom(); U.state.lastRun = null; U.state.exploring = false; }
});

// ---------------------------------------------------------------------------
// H4: printing and screen-reader and destructive-action gaps
// ---------------------------------------------------------------------------
t('H4: Ctrl/Cmd+P builds the sheet when the report button was not used (it printed a blank page)', function () {
  var els = stubDom({ reportSheet: { hidden: true } });
  try {
    M.select('mpa'); U.state.lastRun = null;
    U.buildReportSheet();
    eq(els.reportSheet.hidden, false, 'the sheet is shown for print');
    truthy(/No forecast has been run in this session/.test(els.reportSheet.innerHTML), 'with no forecast it explains itself instead of printing nothing');
  } finally { dropDom(); }
  var src = fs.readFileSync(path.join(ROOT, 'src/ui.js'), 'utf8');
  truthy(/addEventListener\('beforeprint'/.test(src) && /addEventListener\('afterprint'/.test(src), 'the browser print event builds it, and afterprint puts it away');
});
t('H4: the run/validation message is a live region, the result tiles shrink below 300 px, and destructive actions ask', function () {
  var html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'), css = fs.readFileSync(path.join(ROOT, 'src/app.css'), 'utf8'), ui = fs.readFileSync(path.join(ROOT, 'src/ui.js'), 'utf8');
  truthy(/id="runHint"[^>]*aria-live="assertive"/.test(html), 'runHint announces itself');
  truthy(/minmax\(min\(300px, 100%\), 1fr\)/.test(css), 'tiles never force horizontal scroll at 320 px');
  truthy(/confirm\('Remove all doses and measurements\?'\)/.test(ui) && /confirm\('Discard the autosaved session\?/.test(ui), 'clear all and Discard ask');
  truthy(/focusAfterDelete\('data-del-dose'/.test(ui) && /focusAfterDelete\('data-del-obs'/.test(ui), 'a delete keeps keyboard focus in the table');
});

// ---------------------------------------------------------------------------
// H3: the harness itself
// ---------------------------------------------------------------------------
function runChild(code, env) {
  return cp.spawnSync(process.execPath, ['-e', code], { cwd: __dirname, encoding: 'utf8', timeout: 20000, env: Object.assign({}, process.env, env || {}) });
}
t('H3: a test that leaks a rejection fails the suite, even when the suite ends with process.exit', function () {
  var r = runChild("var h=require('./harness.js'); h.t('leaky',function(){ Promise.reject(new Error('leaked-rejection')); }); h.runAll().then(function(ok){process.exit(ok?0:1);});");
  eq(r.status, 1, 'exit code: ' + r.stdout + r.stderr);
  truthy(/leaked-rejection/.test(r.stdout + r.stderr), 'the rejection is named');
});
t('H3: a test that never settles but keeps the loop alive fails on a timeout instead of stalling CI', function () {
  var t0 = Date.now();
  var r = runChild("var h=require('./harness.js'); h.t('hangs',function(){ return new Promise(function(){ setInterval(function(){},1000); }); }); h.runAll().then(function(ok){process.exit(ok?0:1);});", { TEST_TIMEOUT_MS: '400' });
  eq(r.status, 1, 'exit code: ' + r.stdout + r.stderr);
  truthy(/timed out after 400 ms/.test(r.stdout + r.stderr), 'the timeout is reported');
  truthy(Date.now() - t0 < 15000, 'and it did not wait for the loop');
});

// ---------------------------------------------------------------------------
// H5: golden rule 3, enforced
// ---------------------------------------------------------------------------
t('H5: day↔hour constants in src/ are exactly the documented ones (README rule 3)', function () {
  // allowlist below; recency tau (365 days), calendar-day indexing of occasions (4), the EC-MPS 24 h tiling check
  var re = /[\/*]\s*24\b|\b24\s*[\/*]/g, found = {};
  fs.readdirSync(path.join(ROOT, 'src')).filter(function (f) { return /\.js$/.test(f) && !/^(texts|author_photo)/.test(f); }).forEach(function (f) {
    var n = 0;
    fs.readFileSync(path.join(ROOT, 'src', f), 'utf8').split('\n').forEach(function (line) { var code = line.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, ''); n += (code.match(re) || []).length; });
    if (n) found[f] = n;
  });
  var sorted = {}; Object.keys(found).sort().forEach(function (k) { sorted[k] = found[k]; });
  eq(JSON.stringify(sorted), JSON.stringify({ 'bayes.js': 1, 'model.js': 1, 'mpaped.js': 2, 'tacrolimus.js': 2 }), 'a new "/ 24" or "* 24" in src/ must be added to this allowlist deliberately, with its reason');
});

h.runAll().then(function (ok) { if (!ok) process.exit(1); }).catch(function (e) { console.error(e); process.exit(1); });
