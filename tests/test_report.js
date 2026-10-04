/* =========================================================================
 * NephroTDM: the one-page A4 report (src/report.js), all three drugs.
 * Run: node tests/test_report.js   (part of `npm test`)
 * The report is a pure function of a context (fit + the run snapshot), so it is tested here without a DOM.
 * ========================================================================= */
'use strict';
var fs = require('fs'), path = require('path');
var h = require('./harness.js');
var t = h.t, eq = h.eq, truthy = h.truthy, falsy = h.falsy;

['version', 'model', 'tacrolimus', 'everolimus', 'bayes', 'parallel', 'report'].forEach(function (f) { require('../src/' + f + '.js'); });
var ECU = globalThis.ECU, M = ECU.model, B = ECU.bayes, R = ECU.report;

function fmtC(v) { if (!isFinite(v)) return '–'; if (Math.abs(v) >= 100) return v.toFixed(0); if (Math.abs(v) >= 10) return v.toFixed(1); return v.toFixed(2); }
var TEND = 24 * 20 + 8;
function clock(hours) { var d = new Date(hours * 3600000); return d.toISOString().slice(0, 16).replace('T', ' '); }

async function fitFor(drug) {
  var base = { intervalHours: 12, seed: 1, mcmcIters: 40000 };
  if (drug === 'evr') return B.runFit(Object.assign({ drug: 'evr', extra: { hct: '0.30', predHigh: 'low' }, doses: M.ssHistory({ amt: 1500, intervalHours: 12, tEnd: TEND, n: 30 }), steadyState: true, troughLo: 3, troughHi: 8,
    obs: [{ t: TEND, c: 3.2, hct: 0.3 }, { t: TEND + 2, c: 10.5, hct: 0.3 }] }, base), null);
  if (drug === 'tac') return B.runFit(Object.assign({ drug: 'tac', wt: 80, extra: { sex: 'm', ht: '175', pred: '10', hct: '0.33', assay: 'lcms', cyp3a5: 'unknown' }, doses: M.ssHistory({ amt: 3000, intervalHours: 12, tEnd: TEND, n: 30 }), steadyState: true, winLo: 150, winHi: 210, troughLo: 4, troughHi: 12,
    obs: [{ t: TEND, c: 4.1, hct: 0.33 }, { t: TEND + 2, c: 9.8, hct: 0.33 }] }, base), null);
  return B.runFit(Object.assign({ drug: 'mpa', form: 'mmf', wt: 70, doses: M.ssHistory({ amt: 739, intervalHours: 12, tEnd: TEND, n: 30, route: 'oral' }), steadyState: true, winLo: 30, winHi: 60,
    obs: [{ t: TEND + 0.33, c: 9.5 }, { t: TEND + 1, c: 12.1 }, { t: TEND + 3, c: 4.4 }] }, base), null);
}
function ctxFor(drug, fit, over) {
  var spec = M.spec(drug), ss = { evr: { amt: 1.5 }, tac: { amt: 3 }, mpa: { amt: 1000 } }[drug];
  var extra = { evr: { hct: '0.30', predHigh: 'low' }, tac: { sex: 'm', ht: '175', pred: '10', hct: '0.33', assay: 'lcms', cyp3a5: 'unknown' }, mpa: {} }[drug];
  var dose = { t: TEND, amt: ss.amt, route: 'oral' };
  var obs = (drug === 'evr' ? [{ t: TEND, c: 3.2, hct: 0.3 }, { t: TEND + 2, c: 10.5, hct: 0.3 }] : (drug === 'tac' ? [{ t: TEND, c: 4.1, hct: 0.33 }, { t: TEND + 2, c: 9.8, hct: 0.33 }] : [{ t: TEND + 0.33, c: 9.5 }, { t: TEND + 1, c: 12.1 }, { t: TEND + 3, c: 4.4 }]));
  return Object.assign({
    fit: fit, spec: spec, drugId: drug, inputsChanged: false, patientId: 'ID-042', weight: drug === 'tac' ? '80' : '80', usesWeight: drug === 'tac',
    form: drug === 'mpa' ? 'mmf' : null, formLabel: drug === 'mpa' ? 'MMF (mycophenolate mofetil)' : '', extra: extra, doses: [dose], obs: obs, ssMode: true,
    win: { lo: fit.winLo, hi: fit.winHi }, troughWin: { lo: fit.troughWin ? fit.troughWin.lo : null, hi: fit.troughWin ? fit.troughWin.hi : null },
    settings: 'Dosing input: steady state · recency weighting: Off (all samples weighted equally)', advice: 'Advice typed by the clinician.', prepared: 'Dr Example',
    now: '2026-10-04 09:30', version: '1.4.0', units: { auc: (spec.units || { auc: 'mg·h/L' }).auc, conc: (spec.units || { conc: 'mg/L' }).conc },
    notes: { convergence: '', shortHistory: '', shrink: '', anchor: '' }, fmtClock: clock, fmtC: fmtC
  }, over || {});
}
var FITS = {};
async function get(drug) { return FITS[drug] || (FITS[drug] = await fitFor(drug)); }
function strip(html) { return html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' '); }
function pos(html, needle) { var i = html.indexOf(needle); truthy(i >= 0, 'missing: ' + needle); return i; }

t('report: the answer comes first — header, patient strip, result at a glance, chart, samples, advice and signature, in that order, for every drug', async function () {
  for (var d of ['evr', 'tac', 'mpa']) {
    var html = R.build(ctxFor(d, await get(d)));
    var order = ['NephroTDM report:', 'Result at a glance', 'Concentration over one dosing interval', '>Samples</h2>', '>Advice<', '>Signature<'].map(function (s) { return pos(html, s); });
    for (var i = 1; i < order.length; i++) truthy(order[i] > order[i - 1], d + ': section order at ' + i);
    truthy(/<h1[^>]*>NephroTDM report: (everolimus|tacrolimus|mycophenolic acid)<\/h1>/.test(html), d + ': title names the drug');
    truthy(html.indexOf('ID-042') > 0, d + ': patient id');
    truthy(/<svg[^>]*role="img"/.test(html), d + ': the chart is an svg with a text alternative');
  }
});

t('report: the header cites the model paper and the source of the windows, in small type', async function () {
  var cases = { evr: [/Zwart TC/, /Clin Pharmacokinet<\/i> 2021;60:191/, /Masuda S/, /Ther Drug Monit<\/i> 2025;47\(1\):4/], tac: [/Størset E/, /Br J Clin Pharmacol<\/i> 2014;78\(3\):509/, /Brunet M/, /Ther Drug Monit<\/i> 2019;41\(3\):261/],
    mpa: [/de Winter BCM/, /Clin Pharmacokinet<\/i> 2008;47\(12\):827/, /Bergan S/, /Ther Drug Monit<\/i> 2021;43\(2\):150/] };
  for (var d of Object.keys(cases)) {
    var html = R.build(ctxFor(d, await get(d))), head = html.slice(0, pos(html, 'Result at a glance'));
    cases[d].forEach(function (re) { truthy(re.test(head), d + ': ' + re); });
    var p = head.match(/<p[^>]*class="rp-cite"[^>]*style="[^"]*font-size:(\d+(?:\.\d+)?)px/);
    truthy(p && +p[1] >= 12 && +p[1] <= 12.5, d + ': the citation is small but at least 12 px');
  }
});

t('report: everolimus — trough tile first, the plain-wording probability, corrected value beside the measured one, no-AUC-window sentence', async function () {
  var fit = await get('evr'), html = R.build(ctxFor('evr', fit)), text = strip(html);
  truthy(html.indexOf('>Trough<') < html.indexOf('>AUC₀–₁₂ₕ<'), 'trough leads for everolimus');
  var p = Math.round(fit.trough.pInWindow * 100);
  truthy(text.indexOf(p + '% chance') >= 0 && /the trough is within the window 3\.00 to 8\.00 µg\/L/.test(text) || new RegExp(p + '% chance the trough is within the window 3(\\.0+)? to 8(\\.0+)? µg/L').test(text), 'probability sentence: ' + p + '%');
  truthy(text.indexOf('Corrected to haematocrit 0.38') >= 0 && text.indexOf(fmtC(fit.troughCorr.median)) >= 0, 'corrected value');
  truthy(text.indexOf(fmtC(fit.trough.median)) >= 0 && text.indexOf(fmtC(fit.trough.p5) + ' to ' + fmtC(fit.trough.p95)) >= 0, 'median and interval');
  truthy(/No AUC window is set, so no probabilities are shown\. The consensus gives no AUC target for everolimus\./.test(text), 'AUC without window');
  falsy(/P\(within window\)|P\(> lower\)/.test(text), 'no P(…) symbols');
});

t('report: tacrolimus — AUC tile first with both windows, assay and weight in the patient strip, corrected to 0.35; MPA — AUC and an informational trough, no corrected value, no weight', async function () {
  var tac = R.build(ctxFor('tac', await get('tac'))), tt = strip(tac);
  truthy(tac.indexOf('>AUC₀–₁₂ₕ<') < tac.indexOf('>Trough<'), 'AUC leads for tacrolimus');
  truthy(/Corrected to haematocrit 0\.35/.test(tt) && /within the window 150 to 210 µg·h\/L/.test(tt) && /within the window 4\.00 to 12\.0 µg\/L/.test(tt), 'windows and corrected');
  truthy(/Weight[^A-Za-z]*80 kg/.test(tt) && /LC-MS\/MS/.test(tt) && /Sex/.test(tt), 'patient strip');
  var mpa = R.build(ctxFor('mpa', await get('mpa'))), mt = strip(mpa);
  truthy(mpa.indexOf('>AUC₀–₁₂ₕ<') < mpa.indexOf('>Predicted trough<'), 'MPA: AUC, then the predicted trough');
  falsy(/Corrected to/.test(mt), 'MPA has no corrected value'); falsy(/Weight/.test(mt), 'MPA has no weight');
  truthy(/within the window 30\.0 to 60\.0 mg·h\/L/.test(mt) && /Informational: the app has no trough target/.test(mt) && /MMF/.test(mt), 'MPA window, informational trough, formulation');
});

t('report: CMIA values are labelled with their scale, and a population forecast says so', async function () {
  var fit = await get('tac'), c = ctxFor('tac', Object.assign({}, fit, { assay: 'cmia' }), { units: { auc: 'µg·h/L, CMIA scale', conc: 'µg/L, CMIA scale' }, extra: { sex: 'm', ht: '175', pred: '10', hct: '0.33', assay: 'cmia', cyp3a5: 'unknown' } });
  var html = R.build(c);
  truthy(/µg\/L, CMIA scale/.test(html) && /Abbott CMIA/.test(html), 'CMIA scale in the units and the patient strip');
  var pop = R.build(ctxFor('evr', Object.assign({}, await get('evr'), { hasObs: false, obsData: [] }), { obs: [] }));
  truthy(/Population forecast, no measurements entered/.test(pop) && /None entered/.test(pop), 'population forecast wording');
});

t('report: user text is escaped (patient id, advice, name)', async function () {
  var html = R.build(ctxFor('evr', await get('evr'), { patientId: '<img src=x onerror=alert(1)>', advice: '<script>alert(2)</script>', prepared: '"><b>x</b>' }));
  falsy(/<img src=x|<script>alert|<b>x<\/b>/.test(html), 'no raw markup from user text');
  truthy(/&lt;img src=x/.test(html) && /&lt;script&gt;alert\(2\)/.test(html), 'escaped copies are present');
});

t('report: safety notes travel with the numbers — convergence, short history, and inputs changed since the forecast', async function () {
  var fit = await get('mpa');
  var html = R.build(ctxFor('mpa', fit, { inputsChanged: true, notes: { convergence: 'Sampling has not converged (R̂ 1.05).', shortHistory: 'The entered dosing history spans 60 h.', shrink: '', anchor: '' } }));
  truthy(/Inputs changed on screen since this forecast/.test(html.slice(0, html.indexOf('Result at a glance'))), 'the stamp sits above the results');
  truthy(/Sampling has not converged \(R̂ 1\.05\)\./.test(html) && /spans 60 h/.test(html), 'both notes printed');
  var clean = R.build(ctxFor('mpa', fit));
  falsy(/Inputs changed on screen/.test(clean) && /class="rp-notes"/.test(clean), 'no stamp and no notes box when there is nothing to say');
  truthy(/Dosing input: steady state/.test(clean), 'fitting settings are printed');
});

t('report: prints in greyscale at a readable size — neutral greys only, no type under 12 px, rules of at least 1 px, no em-dash, no dose advice', async function () {
  for (var d of ['evr', 'tac', 'mpa']) {
    var html = R.build(ctxFor(d, await get(d))), bad = [];
    (html.match(/#[0-9a-fA-F]{6}\b/g) || []).forEach(function (c) { var r = c.slice(1, 3), g = c.slice(3, 5), b = c.slice(5, 7); if (r.toLowerCase() !== g.toLowerCase() || g.toLowerCase() !== b.toLowerCase()) bad.push(c); });
    eq(bad.join(','), '', d + ': colour that is not a neutral grey');
    falsy(/rgba?\(|hsl\(/.test(html.replace(/rgba\(0,\s*0,\s*0,[^)]*\)/g, '')), d + ': no coloured rgb()');
    var small = []; (html.match(/font(?:-size)?\s*[:=]\s*"?[^;"]*?(\d+(?:\.\d+)?)px/g) || []).forEach(function (m) { var n = +m.match(/(\d+(?:\.\d+)?)px/)[1]; if (n < 12) small.push(m); });
    eq(small.join(' | '), '', d + ': type under 12 px');
    var thin = []; (html.match(/border[a-z-]*:\s*(\d*\.?\d+)px/g) || []).forEach(function (m) { if (+m.match(/(\d*\.?\d+)px/)[1] < 1) thin.push(m); }); eq(thin.join(','), '', d + ': hairlines');
    var tx = strip(html);
    falsy(/—/.test(tx), d + ': no em-dash');
    falsy(/\b(you should|we recommend|recommended dose|increase the dose|reduce the dose|raise the dose|lower the dose|adjust the dose|switch to)\b/i.test(tx), d + ': no dose advice');
    truthy(/does not recommend or optimi[sz]e doses/.test(tx), d + ': the footer says what the app does not do');
    falsy(/not validated|unvalidated/i.test(tx), d + ': no validation caveat');
  }
});

t('report: print setup — A4 page, backgrounds kept, the app hidden, and ui.js builds the report through ECU.report', function () {
  var css = fs.readFileSync(path.join(__dirname, '..', 'src', 'app.css'), 'utf8'), ui = fs.readFileSync(path.join(__dirname, '..', 'src', 'ui.js'), 'utf8');
  truthy(/@page\s*\{[^}]*size:\s*A4/.test(css) && /@page\s*\{[^}]*margin:\s*0/.test(css), '@page A4 with no browser margin');
  truthy(/print-color-adjust:\s*exact/.test(css), 'backgrounds print');
  truthy(/\.rp-page\s*\{[^}]*width:\s*210mm/.test(css) && /\.rp-page\s*\{[^}]*min-height:\s*297mm/.test(css), 'the sheet is an A4 page');
  truthy(/ECU\.report\.build\(/.test(ui), 'ui.js builds the report with ECU.report');
  falsy(/function renderReportTac/.test(ui), 'the old two report builders are gone');
});

h.runAll().then(function (ok) { if (!ok) process.exit(1); }).catch(function (e) { console.error(e); process.exit(1); });
