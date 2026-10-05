/* =========================================================================
 * MPA TDM — application shell
 *
 * Time unit: HOURS everywhere (engine, plots, fields, session, report).
 * Civil clock times are timezone-naive: datetime-local is converted via UTC
 * civil components so a session round-trips without a TZ shift.
 * ========================================================================= */
(function (root) {
  'use strict';
  var ECU = root.ECU = root.ECU || {};
  var M = ECU.model, B = ECU.bayes, CH = ECU.chart, DG = ECU.diagnostics;

  var $ = function (id) { return document.getElementById(id); };
  var VERSION = ECU.VERSION || '0.0.0';
  var AUTOSAVE_KEY = 'mpa-tdm-autosave';

  /* Drug-dependent presentation: the spec declares its units; a spec with `custom` is the tacrolimus-type
   * model (haematocrit, assay, two windows, steady-state AUC and trough as the reported pair). */
  var MPA_UNITS = { conc: 'mg/L', auc: 'mg·h/L', dose: 'mg' };
  function isCustom() { var s = M.drug(); return !!(s && s.custom); }
  /* Per-drug presentation flags live on the spec (spec.ui: noun, weight, predDose, badge, chartTitle, shrinkEta, modelLine) and the drug's
   * texts in the registry ECU.drugTexts[id] (texts_tac.js, texts_evr.js). MPA has neither. */
  /* Does this drug's model take body weight? The weight field is hidden for drugs that do not, but keeps whatever was typed for another drug, so nothing may read it blindly. */
  function usesWeight(sp) { sp = sp || M.drug(); return M.covariateFields(sp.id).some(function (c) { return c.id === 'wt'; }); }
  function uiVal(k, sp) { sp = sp || M.drug(); return (sp && sp.ui && sp.ui[k]) || null; }
  function uiFlag(k, sp) { return !!uiVal(k, sp); }
  function TX(id) { return (ECU.drugTexts || {})[id || (M.drug() || {}).id] || null; }
  function UN() { var s = M.drug(); return (s && s.units) || MPA_UNITS; }
  function unitsOf(fit) { var sp = fit && fit.drug ? M.spec(fit.drug) : M.drug(); return (sp && sp.units) || MPA_UNITS; }
  function concUnit(fit) { var u = unitsOf(fit).conc; return (fit && fit.assay === 'cmia') ? u + ', CMIA scale' : u; }
  function aucUnit(fit) { var u = unitsOf(fit).auc; return (fit && fit.assay === 'cmia') ? u + ', CMIA scale' : u; }
  function resetWindows() {
    ['pt-winlo', 'pt-winhi', 'pt-tlo', 'pt-thi'].forEach(function (id) { if ($(id)) $(id).value = ''; });
  }
  /* Fill the four window fields from one of the drug's window sets (null bound = empty field). Used when the drug is chosen and by the Use buttons. */
  function applyWindowSet(id) {
    var sp = M.drug(), w = (sp.windowSets || []).filter(function (x) { return x.id === id; })[0];
    if (!w) return false;
    [['pt-winlo', w.auc && w.auc[0]], ['pt-winhi', w.auc && w.auc[1]], ['pt-tlo', w.trough && w.trough[0]], ['pt-thi', w.trough && w.trough[1]]].forEach(function (f) {
      var el = $(f[0]);
      if (!el) return;
      el.value = f[1] == null ? '' : f[1];
      el.dispatchEvent(new Event('input', { bubbles: true }));   // fold labels, stale mark and autosave follow
    });
    return true;
  }
  function troughBounds() {
    var lo = parseFloat($('pt-tlo').value), hi = parseFloat($('pt-thi').value);
    return { lo: lo >= 0 ? lo : null, hi: hi > 0 ? hi : null };
  }
  function covEl(id) { return $('cov-' + id); }
  function covNum(id) { var el = covEl(id); var v = el ? parseFloat(el.value) : NaN; return isFinite(v) ? v : NaN; }

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function fmtC(v, d) {
    if (!isFinite(v)) return '–';
    var dd = (d == null ? 2 : d);
    if (Math.abs(v) >= 100) return v.toFixed(0);
    if (Math.abs(v) >= 10) return v.toFixed(1);
    return v.toFixed(dd);
  }
  function fmtP(p) { return isFinite(p) ? Math.round(p * 100) + '%' : '–'; }

  /* Timezone-naive civil time ↔ hours since 1970-01-01 00:00 (UTC components). */
  function dtLocalToHours(v) {
    if (!v) return NaN;
    var m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(v);
    if (!m) return NaN;
    return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) / 3600000;
  }
  function hoursToDtLocal(hours) {
    if (!isFinite(hours)) return '';
    var d = new Date(Math.round(hours * 3600000));
    var p2 = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getUTCFullYear() + '-' + p2(d.getUTCMonth() + 1) + '-' + p2(d.getUTCDate()) +
      'T' + p2(d.getUTCHours()) + ':' + p2(d.getUTCMinutes());
  }
  function fmtHoursClock(hours) {
    var s = hoursToDtLocal(hours);
    return s ? s.replace('T', ' ') : '–';
  }

  function toast(msg) {
    var t = $('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast._h);
    toast._h = setTimeout(function () { t.classList.remove('show'); }, 2600);
  }

  var state = {
    doses: [],
    obs: [],
    lastRun: null,
    lastRunInputs: null,
    lastRunView: null,   // what the report shows about the run: taken at the same moment as lastRun (F4)
    running: false
  };

  function modelPending() {
    var s = M.drug();
    return !!(s && s.pending);
  }
  function pendingNotice() {
    var el = $('pendingNotice');
    if (!el) return;
    if (modelPending()) {
      el.hidden = false;
      el.innerHTML = '<b>Model pending.</b> Forecasting, AUC estimation and the dose explorer ' +
        'are disabled until the model file for this drug is complete. ' +
        'The interface is fully usable for entering data and exploring the layout.';
    } else {
      el.hidden = true;
      el.innerHTML = '';
    }
  }
  function runDisabledReason() {
    if (modelPending()) return 'Waiting for the model file.';
    if (state.running) return 'Running…';
    if (!effectiveDoses().length) return 'Enter at least one dose (or a steady-state dose + interval + latest-dose time).';
    var s = M.drug();
    if (s.requiresWt !== false) {
      var wt = parseFloat($('pt-wt').value);
      var lo = s.wtMin != null ? s.wtMin : 3, hi = s.wtMax != null ? s.wtMax : 300;
      if (!(wt >= lo && wt <= hi)) return 'Body weight (' + lo + '–' + hi + ' kg) is required.';
    }
    var miss = missingCovariates();
    if (miss) return miss;
    return '';
  }
  function missingCovariates() {
    var s = M.drug();
    if (!s.custom) return '';
    var names = [], own = [];
    M.covariateFields(s.id).forEach(function (c) {
      if (!c.required || c.id === 'wt') return;
      if (c.id === 'assay' && !state.obs.length) return;     // the assay only matters once samples are entered
      var el = covEl(c.id);
      if (el && el.value === '') { if (c.missing) own.push(c.missing); else names.push(c.name.toLowerCase()); }
    });
    return (names.length ? ['Enter ' + names.join(', ') + '.'] : []).concat(own).join(' ');
  }
  function updateRunButtons() {
    var why = runDisabledReason();
    $('btnRun').disabled = !!why;
    $('iv-run').disabled = modelPending() || !state.lastRun;
    var hint = $('runHint');
    if (!state.lastRun && why) {
      hint.className = 'run-hint show';
      hint.textContent = why;
    } else if (!why && !state.lastRun) {
      hint.className = 'run-hint ready';
      hint.textContent = modelPending() ? '' : 'Ready to run.';
    }
    $('iv-status').textContent = modelPending()
      ? 'Waiting for the model file.'
      : (state.lastRun ? '' : 'Run a forecast first.');
  }

  function applyWeightBounds() {
    var s = M.drug();
    var lo = s.wtMin != null ? s.wtMin : 3, hi = s.wtMax != null ? s.wtMax : 300;
    var el = $('pt-wt');
    el.min = lo; el.max = hi;
    el.title = 'Body weight in kg (' + lo + '–' + hi + ')';
  }

  function updateWindowFoldVal() {
    var wv = $('windowFoldVal');
    if (!wv) return;
    var lo = $('pt-winlo').value, hi = $('pt-winhi').value;
    wv.textContent = (lo !== '' && hi !== '') ? (lo + ' – ' + hi + ' ' + UN().auc) : 'not set';
    var tv = $('troughFoldVal');
    if (tv) {
      var tlo = $('pt-tlo').value, thi = $('pt-thi').value;
      tv.textContent = (tlo !== '' && thi !== '') ? (tlo + ' – ' + thi + ' ' + UN().conc) : 'not set';
    }
  }
  function currentForm() {
    var v = $('pt-form').value;
    var s = M.drug();
    if (v && s.FORMS && s.FORMS[v]) return v;
    return s.formDefault || null;
  }
  function formLabel(form) {
    var s = M.drug();
    var f = s.FORMS && s.FORMS[form || currentForm()];
    return f ? f.label : '';
  }
  function updateFormLabels() {
    var s = M.drug();
    if (!s.FORMS) {
      var lbl0 = 'Dose (' + UN().dose + (uiVal('noun') ? ' ' + uiVal('noun') : '') + ')';
      ['doseAmtLbl', 'ssDoseLbl', 'ivAmtLbl'].forEach(function (id) { if ($(id)) $(id).textContent = lbl0; });
      if ($('ecmpsSampleNote')) $('ecmpsSampleNote').hidden = true;
      if ($('tacDoseNote')) {
        var dn = drugText('doseNote');
        if (dn && isCustom()) $('tacDoseNote').textContent = dn;
        $('tacDoseNote').hidden = !isCustom();
      }
      return;
    }
    if ($('tacDoseNote')) $('tacDoseNote').hidden = true;
    var lbl = 'Dose (mg ' + formLabel() + ')';
    if ($('doseAmtLbl')) $('doseAmtLbl').textContent = lbl;
    if ($('ssDoseLbl')) $('ssDoseLbl').textContent = lbl;
    if ($('ivAmtLbl')) $('ivAmtLbl').textContent = lbl;
    var note = $('ecmpsSampleNote');
    if (note) note.hidden = currentForm() !== 'ecmps';
  }

  /* The three drug cards. The hidden select #pt-drug stays the single source of truth: a card press sets it and fires its own change handler
   * (confirmation before clearing, window reset, switch), then the cards are redrawn from whatever drug is selected afterwards. */
  function drugCardsHtml(currentId) {
    return M.listDrugs().map(function (d) {
      var c = M.spec(d.id).card || { name: d.label, sub: '' }, on = d.id === currentId;
      return '<button type="button" class="drug-card" data-drug="' + esc(d.id) + '" aria-pressed="' + (on ? 'true' : 'false') + '"><span class="dc-name">' + esc(c.name) + '</span><span class="dc-sub">' + esc(c.sub) + '</span></button>';
    }).join('');
  }
  function renderDrugCards() {
    var host = $('drugCards');
    if (!host) return;
    host.innerHTML = drugCardsHtml(M.drug().id);
    if (!host._bound) {
      host._bound = true;
      host.addEventListener('click', function (ev) {
        var b = ev.target.closest ? ev.target.closest('button[data-drug]') : null;
        if (!b || b.getAttribute('aria-pressed') === 'true') return;
        var sel = $('pt-drug');
        sel.value = b.getAttribute('data-drug');
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        renderDrugCards();   // a cancelled switch puts the select back; the cards follow it
        var again = host.querySelector('button[aria-pressed="true"]'); if (again && again.focus) again.focus();
      });
    }
  }

  function renderDrugAndCovariates() {
    var s = M.drug();
    renderDrugCards();
    var hint = $('drugHint');
    if (hint) {
      // Do not dump the pending-model paragraph onto the main screen.
      // Operational pending state lives in #pendingNotice; clinical background
      // lives behind the "Mycophenolic acid background" button.
      hint.textContent = s.pending ? '' : (s.info || '');
    }
    var wh = $('windowHint');
    if (wh) wh.textContent = s.windowHint || '';
    if ($('pt-winlo').value === '' && s.windowDefaultLo != null) $('pt-winlo').value = s.windowDefaultLo;
    if ($('pt-winhi').value === '' && s.windowDefaultHi != null) $('pt-winhi').value = s.windowDefaultHi;
    if ($('pt-tlo') && $('pt-tlo').value === '' && s.troughDefaultLo != null) $('pt-tlo').value = s.troughDefaultLo;
    if ($('pt-thi') && $('pt-thi').value === '' && s.troughDefaultHi != null) $('pt-thi').value = s.troughDefaultHi;
    applyChrome();
    var sh = $('sampleHint');
    if (sh) sh.textContent = s.samplePeak || '';
    updateWindowFoldVal();
    updateFormLabels();
    applyWeightBounds();

    var host = $('generatedCovariates');
    if (host) host.innerHTML = '';

    var covs = M.covariateFields(s.id);
    var declared = {};
    covs.forEach(function (c) { declared[c.id] = true; });
    // Static rows show exactly what the model declares — nothing more.
    // de Winter 2008: weight is NOT a covariate → the weight row hides.
    var wtField = $('pt-wt') ? $('pt-wt').closest('.sess-field') : null;
    if (wtField) wtField.style.display = declared.wt ? '' : 'none';
    var formRow = $('formRow');
    if (formRow) formRow.style.display = declared.form ? '' : 'none';
    ['age', 'renal', 'extracov'].forEach(function (id) {
      var row = { age: 'ageRow', renal: 'renalRow', extracov: 'extraCovRow' }[id];
      var el = $(row);
      if (el) el.style.display = declared[id] ? '' : 'none';
    });
    var staticRows = { wt: 1, form: 1, age: 1, renal: 1, extracov: 1 };
    if (uiFlag('weight') && wtField) {   // the weight field is a covariate of this model: required, not a hidden default
      var wl = wtField.querySelector('label'); if (wl) wl.textContent = 'Weight (kg)';
    }
    covs.forEach(function (c) {
      if (Object.prototype.hasOwnProperty.call(staticRows, c.id)) return;
      if (!host) return;
      var wrap = document.createElement('div');
      wrap.className = 'sess-field ' + (c.type === 'select' ? 'sf-wide' : 'sf-num');
      wrap.id = 'covrow-' + c.id;
      if (c.type === 'select' && c.options) {
        wrap.innerHTML =
          '<div class="lbl-help"><label class="f" for="cov-' + esc(c.id) + '">' + esc(c.name) + '</label></div>' +
          '<select id="cov-' + esc(c.id) + '" title="' + esc(c.help || '') + '">' +
          c.options.map(function (o) { return '<option value="' + esc(o.value) + '">' + esc(o.label) + '</option>'; }).join('') +
          '</select>';
      } else {
        wrap.innerHTML =
          '<div class="lbl-help"><label class="f" for="cov-' + esc(c.id) + '">' + esc(c.name) +
          (c.units ? ' (' + esc(c.units) + ')' : '') + '</label>' +
          '<button type="button" class="info" data-help="cov-' + esc(c.id) + '" aria-label="' +
          esc(c.name) + '" aria-expanded="false" title="' + esc(c.help || '') + '">ⓘ</button></div>' +
          '<input type="' + (c.units && /text|as declared/i.test(c.units) ? 'text' : 'number') +
          '" inputmode="decimal" id="cov-' + esc(c.id) + '" title="' + esc(c.help || '') + '"' +
          (c.min != null ? ' min="' + c.min + '"' : '') + (c.max != null ? ' max="' + c.max + '"' : '') +
          (c.step != null ? ' step="' + c.step + '"' : '') + '>';
      }
      host.appendChild(wrap);
    });
    if (host && !host._bound) {   // generated fields need the same stale/run-state updates as the static ones
      host._bound = true;
      host.addEventListener('input', markStale);
      host.addEventListener('change', markStale);
    }
    renderDoseTable(); renderObsTable();
  }
  /* Texts that differ per drug live here, keyed by the spec id; a drug without an entry gets the neutral GENERIC text.
   * (Adding a drug means adding its entry, its spec and its model; nothing else on the page names a drug.) */
  var GENERIC_TEXT = {
    chartNote: 'Individual = this patient’s measured levels · red points = measurements. The therapeutic window is shown in the results grid, not on this plot. Time axis in hours after the last dose.',
    doseNote: '',
    howto: '<li><b>Steady-state exposure:</b> the model’s estimate for the current regimen, with a 5–95% interval.</li>' +
      '<li><b>Probability in window:</b> the chance that the exposure lies between your lower and upper bound.</li>' +
      '<li><b>Band (5–95%):</b> 90% plausible range for the true concentration curve. It does not include assay error, so a future measured value may fall outside it.</li>'
  };
  var DRUG_TEXT = {
    mpa: {
      chartNote: 'Individual = this patient’s measured levels · Population = model only · red points = measurements. The therapeutic window is an AUC range (mg·h/L), shown in the results grid; it is not a concentration band on this plot. Time axis in hours after the last dose.',
      howto: '<li><b>AUC0–12h:</b> the model’s estimate of steady-state mycophenolic acid exposure over one 12-hour dosing interval, with a 5–95% interval.</li>' +
        '<li><b>Probability in window:</b> the chance that the true AUC0–12h falls between your chosen lower and upper bound.</li>' +
        '<li><b>Predicted trough:</b> the model’s estimate of the concentration just before the next dose. There is no trough target in this app; it is shown for context only.</li>' +
        '<li><b>Band (5–95%):</b> 90% plausible range for the true concentration curve. It does not include assay error, so a future measured value may fall outside it.</li>'
    },
    tac: {
      doseNote: 'Immediate-release tacrolimus, twice daily (Prograf-type capsules). Prolonged-release products (once daily) are not covered by this model.',
      chartNote: 'Individual = this patient’s measured levels · red points = measurements. The curve is whole blood at the haematocrit of the latest sample, on the current regimen including the day-to-day effect of each sampled day; the reported steady-state values are for a typical day. The windows are shown in the results grid, not on this plot. Time axis in hours after the last dose.',
      howto: '<li><b>Steady-state AUC₀–12h and trough:</b> the model’s estimate for the current regimen on a typical day, with a 5–95% interval. One sampling day cannot fix the steady-state AUC more tightly than about ×/÷ 1.4; two days give about ×/÷ 1.3.</li>' +
        '<li><b>Corrected to haematocrit 0.35:</b> the whole-blood value this patient would show, for the same plasma concentration, at a haematocrit of 0.35. It removes the effect of anaemia or a high haematocrit on the reading.</li>' +
        '<li><b>Probability in window:</b> shown only if you set a window; the chance that the exposure lies between your lower and upper bound.</li>' +
        '<li><b>Band (5–95%):</b> 90% plausible range for the true concentration curve. It does not include assay error, so a future measured value may fall outside it.</li>'
    }
  };
  function drugText(key) {
    var t = DRUG_TEXT[(M.drug() || {}).id] || TX();
    return (t && t[key]) || GENERIC_TEXT[key];
  }
  /* Page chrome that depends on the selected drug: title, subtitle, drug-only controls, units on the forms. */
  function applyChrome() {
    var s = M.drug(), tac = isCustom(), u = UN();
    var set = function (id, txt) { if ($(id)) $(id).textContent = txt; };
    set('btnBackground', s.backgroundLabel || 'Background');
    set('backgroundTitle', s.backgroundLabel || 'Background');
    if (typeof document !== 'undefined') document.title = 'NephroTDM v' + VERSION;
    if ($('chartNote')) $('chartNote').innerHTML = drugText('chartNote');
    if ($('howtoList')) $('howtoList').innerHTML = drugText('howto');
    var show = function (id, on) { if ($(id)) $(id).style.display = on ? '' : 'none'; };
    show('troughTargetRow', tac); show('dosePredWrap', uiFlag('predDose')); show('obsHctWrap', tac);
    var lbl = $('obsValLbl'); if (lbl) lbl.textContent = 'Concentration (' + u.conc + (u.concAlt ? ', = ' + u.concAlt : '') + ')';
    var fl = document.querySelector('#windowFold .fold-lbl'); if (fl) fl.textContent = 'Therapeutic window: AUC₀–12h';
    var lo = document.querySelector('label[for="pt-winlo"]'); if (lo) lo.textContent = 'Lower bound AUC₀–12h (' + u.auc + ')';
    var hi = document.querySelector('label[for="pt-winhi"]'); if (hi) hi.textContent = 'Upper bound AUC₀–12h (' + u.auc + ')';
    var tl = document.querySelector('label[for="pt-tlo"]'); if (tl) tl.textContent = 'Lower bound trough (' + u.conc + ')';
    var th = document.querySelector('label[for="pt-thi"]'); if (th) th.textContent = 'Upper bound trough (' + u.conc + ')';
    var wlo = $('pt-winlo'), whi = $('pt-winhi');
    if (wlo) wlo.title = 'Lower bound of the therapeutic AUC0–12h window (' + u.auc + ')';
    if (whi) whi.title = 'Upper bound of the therapeutic AUC0–12h window (' + u.auc + ')';
    var tlo = $('pt-tlo'), thi = $('pt-thi');
    if (tlo) tlo.title = 'Lower bound of the therapeutic trough window (' + u.conc + ')';
    if (thi) thi.title = 'Upper bound of the therapeutic trough window (' + u.conc + ')';
    var ov = $('obs-val'); if (ov) ov.title = 'Measured concentration (' + u.conc + '). A result reported below the assay\'s limit of quantification cannot be used: omit it.';
    var ivi = $('iv-interval'); if (ivi) { if (tac) ivi.value = '12'; ivi.disabled = tac; }
    var doseTitle = 'Dose in ' + u.dose + ' as prescribed' + (s.FORMS ? ' (product mg; converted to MPA content internally)' : '');
    var dosePh = 'e.g. ' + (s.dose && s.dose.default != null ? s.dose.default : '');
    ['dose-amt', 'ss-dose'].forEach(function (id) {
      var el = $(id); if (!el) return;
      el.placeholder = dosePh;
      if (s.dose) { el.min = s.dose.min; el.max = s.dose.max; }   // the page carried the MPA limits for every drug
      el.title = (id === 'ss-dose' ? 'Maintenance dose per administration, as prescribed' + (s.FORMS ? ' (product mg; converted to MPA content internally)' : '') : doseTitle);
    });
    var ssi = $('ss-interval'); if (ssi) { ssi.min = s.intervalRange ? s.intervalRange.min : 1; ssi.max = s.intervalRange ? s.intervalRange.max : 48; }
    updateWindowFoldVal();
  }
  function extraCovariates() {
    var extra = {};
    var s = M.drug();
    M.covariateFields(s.id).forEach(function (c) {
      if (c.id === 'wt' || c.id === 'age' || c.id === 'renal' || c.id === 'extracov') return;
      var el = $('cov-' + c.id);
      if (el) extra[c.id] = el.value;
    });
    var text = $('pt-extracov').value;
    if (text) extra.note = text;
    return extra;
  }
  function readCovariates() {
    return {
      wt: parseFloat($('pt-wt').value),
      age: parseFloat($('pt-age').value),
      renal: $('pt-renal').value || null,
      extra: extraCovariates()
    };
  }

  function renderDoseTable() {
    var tbl = $('doseTable');
    if (!tbl) return;
    var tac = uiFlag('predDose');   // the prednisolone column belongs to drugs that take a per-dose prednisolone value
    var rows = ['<tr><th>#</th><th>Date &amp; time</th><th class="num">Dose (' + esc(UN().dose) + ')</th>' + (tac ? '<th class="num">Prednisolone (mg/day)</th>' : '') + '<th>Route</th><th></th></tr>'];
    if (!state.doses.length) {
      rows.push('<tr><td colspan="' + (tac ? 6 : 5) + '" class="note" style="border:none">No doses entered yet.</td></tr>');
    } else {
      state.doses.forEach(function (d, i) {
        rows.push('<tr><td>' + (i + 1) + '</td><td>' + esc(fmtHoursClock(d.t)) +
          '</td><td class="num">' + esc(d.amt) + '</td>' + (tac ? '<td class="num">' + (d.pred != null ? esc(d.pred) : '<span class="hint">patient</span>') + '</td>' : '') + '<td>' + esc(d.route) +
          '</td><td><button class="linklike no-print" data-del-dose="' + i + '" title="Remove this dose">remove</button></td></tr>');
      });
    }
    tbl.innerHTML = rows.join('');
  }
  function renderObsTable() {
    var tbl = $('obsTable');
    if (!tbl) return;
    var tac = isCustom();
    var rows = ['<tr><th>#</th><th>Date &amp; time</th><th class="num">Concentration (' + esc(UN().conc) + ')</th>' + (tac ? '<th class="num">Haematocrit (L/L)</th>' : '') + '<th></th></tr>'];
    if (!state.obs.length) {
      rows.push('<tr><td colspan="' + (tac ? 5 : 4) + '" class="note" style="border:none">No measurements entered yet.</td></tr>');
    } else {
      state.obs.forEach(function (o, i) {
        rows.push('<tr><td>' + (i + 1) + '</td><td>' + esc(fmtHoursClock(o.t)) +
          '</td><td class="num">' + esc(o.c) + (tac ? '</td><td class="num">' + (o.hct != null ? esc(o.hct) : '–') : '') +
          '</td><td><button class="linklike no-print" data-del-obs="' + i + '" title="Remove this measurement">remove</button></td></tr>');
      });
    }
    tbl.innerHTML = rows.join('');
  }
  function markStale() {
    if (state.lastRun) $('staleBanner').classList.add('show');
    updateRunButtons();
    scheduleAutosave();
  }
  function clearStale() { $('staleBanner').classList.remove('show'); }

  function currentMode() {
    var r = document.querySelector('input[name="schedMode"]:checked');
    return r ? r.value : 'full';
  }
  function applyMode() {
    var mode = currentMode();
    $('fullDoseUI').style.display = mode === 'full' ? '' : 'none';
    $('ssDoseUI').style.display = mode === 'ss' ? '' : 'none';
    markStale();
  }
  function ssToDoses() {
    var amt = parseFloat($('ss-dose').value);
    var iv = parseFloat($('ss-interval').value);
    var anchor = dtLocalToHours($('ss-anchor').value);
    var n = M.drug().ssNDoses;   // every spec declares it; ssHistory defaults to 10 if one ever does not
    return M.ssHistory({ amt: amt, intervalHours: iv, tEnd: anchor, n: n, route: 'oral' });
  }
  function effectiveDoses() {
    return currentMode() === 'ss' ? ssToDoses() : state.doses.slice().sort(function (a, b) { return a.t - b.t; });
  }
  function intervalHoursOf(doses) {
    if (currentMode() === 'ss') {
      var iv = parseFloat($('ss-interval').value);
      if (iv > 0) return iv;
    }
    if (doses && doses.length >= 2) {
      var dt = doses[doses.length - 1].t - doses[doses.length - 2].t;
      if (dt > 0) return dt;
    }
    return M.drug().ssIntervalDefault || 12;
  }

  function windowBounds() {
    var lo = parseFloat($('pt-winlo').value);
    var hi = parseFloat($('pt-winhi').value);
    if (!(lo >= 0)) lo = null;
    if (!(hi > 0)) hi = null;
    return { lo: lo, hi: hi };
  }
  function buildRunInput() {
    var cov = readCovariates();
    var win = windowBounds();
    var form = currentForm();
    var doses = effectiveDoses();
    return {
      drug: $('pt-drug').value,
      form: form,
      wt: cov.wt,
      age: isFinite(cov.age) ? cov.age : null,
      renal: cov.renal,
      extra: cov.extra,
      formulation: $('pt-form').value || 'mmf',
      // Dose-unit boundary (S11): product mg in → MPA mg to the engine, one
      // conversion at ingestion (×0.739 MMF, ×0.936 EC-MPS).
      doses: doses.map(function (d) {
        var o = { t: d.t, amt: M.toEngineAmt($('pt-drug').value, d.amt, form), route: d.route || 'oral' };
        if (d.pred != null) o.pred = d.pred;
        return o;
      }),
      steadyState: currentMode() === 'ss',   // the doses above are the expansion of an endless regimen
      obs: state.obs.map(function (o) { return o.hct != null ? { t: o.t, c: o.c, hct: o.hct } : { t: o.t, c: o.c }; }),
      recency: $('pt-recency').value || 'off',
      intervalHours: intervalHoursOf(doses),
      winLo: win.lo, winHi: win.hi,
      troughLo: troughBounds().lo, troughHi: troughBounds().hi,
      seed: 20250907
    };
  }
  /* What the model can sensibly be asked, with plain messages. Pure (no DOM) so it can be tested.
   * userDoses: the doses as typed, in the drug's dose unit; ssMode: steady-state input (the regimen ends at the latest dose). */
  function inputProblems(spec, input, userDoses, ssMode) {
    var out = [], u = spec.units || MPA_UNITS, i;
    var oLo = spec.obsValMin != null ? spec.obsValMin : 0, oHi = spec.obsValMax != null ? spec.obsValMax : Infinity;
    (input.obs || []).forEach(function (o, k) {
      if (!(o.c > 0) || o.c < oLo || o.c > oHi) {
        out.push('Concentration ' + (k + 1) + ' (' + o.c + ' ' + u.conc + ') is outside what this model can use (' + oLo + ' to ' + oHi + ' ' + u.conc +
          '). It must be above 0; a result below the quantification limit cannot be used, so leave it out.');
      }
    });
    if (spec.dose) {
      var seen = {};
      (userDoses || []).forEach(function (a) {
        if (seen[a]) return; seen[a] = true;
        if (!(a >= spec.dose.min && a <= spec.dose.max)) {
          out.push('Dose ' + a + ' ' + u.dose + ' is outside the range this model covers (' + spec.dose.min + ' to ' + spec.dose.max + ' ' + u.dose + ' per dose). Check the unit: doses are entered in ' + u.dose + '.');
        }
      });
    }
    if (spec.intervalRange && input.intervalHours > 0 && !(input.intervalHours >= spec.intervalRange.min && input.intervalHours <= spec.intervalRange.max)) {
      out.push('The dosing interval is ' + input.intervalHours + ' h. This model covers ' + spec.intervalRange.text + '; other schedules (once-daily prolonged-release products, for example) behave differently, so the result would mislead.');
    }
    var extra = input.extra || {};
    (M.covariateFields ? M.covariateFields(spec.id) : []).forEach(function (c) {
      if (c.type !== 'number' || c.id === 'wt' || c.min == null || c.max == null) return;
      var v = parseFloat(extra[c.id]);
      if (isFinite(v) && (v < c.min || v > c.max)) {
        out.push(c.name + ' ' + v + ' ' + c.units + ' is outside ' + c.min + ' to ' + c.max + ' ' + c.units + '.' + (c.units === 'L/L' && v > 1 ? ' Enter it as a fraction (0.33), not a percentage.' : ''));
      }
    });
    var ds = (input.doses || []).map(function (d) { return d.t; }).filter(isFinite).sort(function (a, b) { return a - b; });
    if (ds.length) {
      var first = ds[0], last = ds[ds.length - 1], iv = input.intervalHours > 0 ? input.intervalHours : (spec.ssIntervalDefault || 12);
      (input.obs || []).forEach(function (o, k) {
        if (o.t < first - 1e-6) {
          out.push('Sample ' + (k + 1) + ' (' + fmtHoursClock(o.t) + ') is before the first dose (' + fmtHoursClock(first) + '). Check the date, or add the earlier doses.');
        } else if (ssMode && o.t > last + iv * 1.1 + 0.25) {
          out.push('Sample ' + (k + 1) + ' (' + fmtHoursClock(o.t) + ') is ' + Math.round(o.t - last) + ' h after the latest dose, more than one dosing interval. Steady-state mode assumes no further doses after the latest dose. Enter the later doses in “Full schedule”, or set “Latest dose on” to the dose before this sample.');
        }
      });
    }
    return out;
  }

  function validateRun(input) {
    var errs = [];
    var s = M.drug();
    if (s.requiresWt !== false) {
      var lo = s.wtMin != null ? s.wtMin : 3, hi = s.wtMax != null ? s.wtMax : 300;
      if (!(input.wt >= lo && input.wt <= hi)) errs.push('Body weight (' + lo + '–' + hi + ' kg) is required.');
    }
    if (!input.doses.length) errs.push('At least one dose is required.');
    errs = errs.concat(inputProblems(s, input, effectiveDoses().map(function (d) { return d.amt; }), currentMode() === 'ss'));
    if (s.windowOptional) {   // tacrolimus: each window is set as a pair or left out (intervals without probabilities)
      if ((input.winLo == null) !== (input.winHi == null)) errs.push('Set both AUC window bounds, or leave both empty.');
      if ((input.troughLo == null) !== (input.troughHi == null)) errs.push('Set both trough window bounds, or leave both empty.');
      if (input.troughLo != null && input.troughHi != null && input.troughLo >= input.troughHi) errs.push('The lower trough bound must be below the upper bound.');
    } else if (input.winLo == null || input.winHi == null) errs.push('Set both therapeutic-window bounds (lower and upper).');
    if (input.winLo != null && input.winHi != null && input.winLo >= input.winHi) errs.push('The lower window bound must be below the upper bound.');
    if (input.doses.length === 1 && input.intervalHours > 0 && currentMode() === 'full') {
      errs.push(s.custom
        ? 'Only one dose entered in the full schedule: the fit would describe a single dose from zero, not a patient on a stable regimen. Add the dosing history or use “Steady state” mode.'
        : 'Only one dose entered in the full schedule: the AUC0–τ estimate will describe a single dose from zero, not steady state. Add the dosing history (or use “Steady state” mode).');
    }
    return errs;
  }

  /* A dose-explorer result belongs to the fit it was computed from. renderResults runs for every new forecast and with null on a drug
   * switch, an import and a cleared session, so resetting here keeps one patient's candidate-dose result from sitting under another fit. */
  function resetExplorer(fit) {
    if ($('iv-out')) $('iv-out').innerHTML = fit
      ? '<div class="note">Enter a dose and press Explore to see it at steady state, using this forecast’s fit.</div>'
      : '<div class="note">Run a forecast in card 3 first. This explorer reuses that fit’s own parameters.</div>';
    if ($('iv-status')) $('iv-status').textContent = '';
  }
  function renderResults(fit) {
    resetExplorer(fit);
    var btnDiag = $('btnDiag');
    if (!fit) {
      $('aucBlock').innerHTML = '';
      $('troughBlock').innerHTML = '';
      $('fitStatus').innerHTML = '';
      $('advisoryBlock').innerHTML = '';
      if (btnDiag) btnDiag.disabled = true;
      return;
    }
    if (btnDiag) btnDiag.disabled = false;
    if (M.spec(fit.drug).custom) { renderResultsTac(fit); return; }
    var auc = fit.auc, tr = fit.trough, spec0 = M.spec(fit.drug);
    var fitNorm = fit.intervalHours !== 12;
    var normNote = (fitNorm && fit.aucRaw ? 'As the 12-hour equivalent of the AUC over ' + esc(fit.intervalHours) + ' h (' + fmtC(fit.aucRaw.median) + ' mg·h/L as simulated, × 12/' + esc(fit.intervalHours) + ').' : '') +
      (fit.aucAnchorShifted ? (fitNorm && fit.aucRaw ? ' ' : '') + 'Window anchored at the most recent morning dose.' : '');
    $('aucBlock').innerHTML = resultTileHtml({ key: 'auc', what: 'AUC', title: fitNorm ? 'AUC₀–12h equivalent' : 'AUC₀–12h', unit: 'mg·h/L', stats: auc, corr: null,
      win: (fit.windowSet && fit.winLo != null && fit.winHi != null) ? { lo: fit.winLo, hi: fit.winHi } : null, fit: fit, spec: spec0, note: normNote });
    $('troughBlock').innerHTML = resultTileHtml({ key: 'trough', what: 'trough', title: 'Predicted trough C(τ)', unit: 'mg/L', stats: tr, corr: null, win: null, informational: true, fit: fit, spec: spec0 });
    orderTiles(spec0);
    var statusBadge = fit.hasObs
      ? '<span class="badge info" title="' + esc(fit.nDraws) + ' posterior draws, MCMC acceptance ' + (fit.acceptance * 100).toFixed(0) + '%">Fitted to this patient’s ' +
        esc(fit.obsData ? fit.obsData.length : 0) + ' sample' + (fit.obsData && fit.obsData.length === 1 ? '' : 's') + '</span>'
      : '<span class="badge info">Population forecast, no measurements entered</span>';
    // UX1: every result is attributable to its model variant
    var spec = M.spec(fit.drug);
    if (spec && spec.article && /de Winter/.test(spec.article)) {
      statusBadge += ' <span class="badge info" title="' + esc(spec.article) + '">de Winter 2008 · ' +
        esc(formLabel(fit.form)) + '</span>';
    }
    if (fit.warnSingleDose) {
      statusBadge += ' <span class="badge warn" title="Only one dose in the entered history: the AUC describes a single dose from zero, not steady state">not steady state</span>';
    } else if (DG.shortHistoryNote(fit)) {
      statusBadge += ' <span class="badge warn" title="' + esc(DG.shortHistoryNote(fit)) + '">not steady state</span>';
    }
    if (DG.convergenceNote(fit)) {
      statusBadge += ' <span class="badge warn" title="' + esc(DG.convergenceNote(fit)) + '">sampling not converged</span>';
    }
    $('fitStatus').innerHTML = statusBadge +
      (fit.runtimeMs ? ' <span class="hint">' + (fit.runtimeMs / 1000).toFixed(1) + ' s</span>' : '');
    // ST4/UX4: the honesty note fires only when CL shrinkage > 80% (see DG.shrinkageNote).
    var shrinkNote = DG.shrinkageNote(fit) ? '<p class="legend-note"><b>Note:</b> ' + esc(DG.shrinkageNote(fit)) + '</p>' : '';
    // S12: state when the AUC window moved off the last (evening) dose
    var anchorNote = '';
    if (fit.aucAnchorShifted) {
      anchorNote = '<p class="legend-note"><b>Note:</b> for EC-MPS the therapeutic target refers to morning-dose profiles; this AUC window is anchored at the most recent morning dose. An evening-dose-anchored window would read lower (see the model card in About).</p>';
    }
    $('advisoryBlock').innerHTML = '<div class="legend-note">' + esc(DG.summaryHint(fit)) + '</div>' + shrinkNote + anchorNote;
  }

  /* ---- tacrolimus results: two rows (AUC, trough), each with the actual value, a quieter corrected line, and the probabilities
   * against the user's window. Steady state on a typical day; the corrected value is a companion, never a second headline. */
  /* ---- result tiles (every drug): large median and interval, the corrected value beside it, a range bar against the window, and the plain-language
   * sentence the printed report uses. Measured = solid bar, corrected = outlined bar, window = dashed band; shape, not colour alone. ---- */
  function rangeBarHtml(stats, corr, win, scaleMax) {
    var sc = ECU.report.niceScale(scaleMax * 1.06, 4), top = sc.max, P = function (v) { return (v / top * 100).toFixed(2); }, h = '';
    if (win) h += '<div class="rb-win" style="left:' + P(win.lo) + '%;width:' + (P(win.hi) - P(win.lo)).toFixed(2) + '%"></div>';
    h += '<div class="rb-int" style="left:' + P(stats.p5) + '%;width:' + Math.max(0.6, P(stats.p95) - P(stats.p5)).toFixed(2) + '%"></div><div class="rb-med" style="left:' + P(stats.median) + '%"></div>';
    if (corr) h += '<div class="rb-cint" style="left:' + P(corr.p5) + '%;width:' + Math.max(0.6, P(corr.p95) - P(corr.p5)).toFixed(2) + '%"></div><div class="rb-cmed" style="left:' + P(corr.median) + '%"></div>';
    var ticks = sc.ticks.map(function (t) { return '<span style="left:' + P(t) + '%">' + t + '</span>'; }).join('');
    return '<div class="rb"><div class="rb-track" style="height:' + (corr ? 46 : 28) + 'px" role="img" aria-label="Interval bar">' + h + '</div><div class="rb-ticks">' + ticks + '</div></div>';
  }
  function resultTileHtml(m) {
    var s = m.stats, c = m.corr, fit = m.fit, H = fit.hctRef;
    var corrLine = '';
    if (c) {
      var same = Math.abs((fit.hctReport || 0) - H) < 0.005;
      corrLine = '<div class="tile-c"><span class="tile-cmark" aria-hidden="true"></span>Corrected to haematocrit ' + esc(H) + ': ' + (same ? 'same as measured' : '<b>' + fmtC(c.median) + '</b> <span class="tile-cr">(' + fmtC(c.p5) + ' to ' + fmtC(c.p95) + ')</span>') + '</div>';
    }
    var chips = '';
    if (!m.informational && m.win && isFinite(s.pInWindow)) {
      var chip = function (l, v, sub) { return '<div class="chip-p"><div class="chip-l">' + l + '</div><div class="chip-v">' + fmtP(v) + '</div><div class="chip-s">' + sub + '</div></div>'; };
      chips = '<div class="chips">' + chip('In the window', s.pInWindow, fmtC(m.win.lo) + ' to ' + fmtC(m.win.hi) + ' ' + esc(m.unit)) + chip('Above the lower bound', s.pAboveLower, 'above ' + fmtC(m.win.lo)) + chip('Below the upper bound', s.pBelowUpper, 'below ' + fmtC(m.win.hi)) + '</div>';
    }
    var scaleMax = Math.max(s.p95, c ? c.p95 : 0, m.win ? m.win.hi : 0, 1e-9);
    return '<div class="tile"><div class="tile-h"><span class="tile-name">' + m.title + '</span><span class="tile-sub">median and 5 to 95% interval</span></div>' +
      '<div class="tile-v"><span class="num">' + fmtC(s.median) + '</span><span class="unit">' + esc(m.unit) + '</span><span class="rng">' + fmtC(s.p5) + ' to ' + fmtC(s.p95) + '</span></div>' +
      corrLine + rangeBarHtml(s, c, m.win, scaleMax) + '<p class="tile-line">' + ECU.report.probLine(m, fit, m.spec) + '</p>' + chips + (m.note ? '<div class="tile-note">' + m.note + '</div>' : '') + '</div>';
  }
  /* kept as the entry point of the explorer and the screen results: label, stats, corrected stats, window, whether it is set, unit */
  function exposureRows(label, stats, corr, win, winSet, unit, fit, subExtra) {
    var isAuc = /AUC/.test(label);
    return resultTileHtml({ key: isAuc ? 'auc' : 'trough', what: isAuc ? 'AUC' : 'trough', title: esc(label), unit: unit, stats: stats, corr: corr,
      win: (winSet && win && win.lo != null && win.hi != null) ? { lo: win.lo, hi: win.hi } : null, fit: fit, spec: M.spec(fit.drug), note: subExtra ? esc(subExtra.replace(/^ · /, '')) : '' });
  }
  /* the lead tile is the one the drug's consensus works from (spec.report.lead), shown first */
  function orderTiles(spec) {
    var lead = spec && spec.report && spec.report.lead === 'trough';
    if ($('aucBlock')) $('aucBlock').style.order = lead ? 2 : 1;
    if ($('troughBlock')) $('troughBlock').style.order = lead ? 1 : 2;
  }
  function renderResultsTac(fit) {
    var uA = aucUnit(fit), uC = concUnit(fit);
    $('aucBlock').innerHTML = exposureRows('Steady-state AUC₀–12h', fit.auc, fit.aucCorr, { lo: fit.winLo, hi: fit.winHi }, fit.windowSet, uA, fit,
      fit.intervalHours !== 12 && fit.aucRaw ? ' · from AUC₀–' + esc(fit.intervalHours) + 'h ' + fmtC(fit.aucRaw.median) + ' × 12/' + esc(fit.intervalHours) : '');
    $('troughBlock').innerHTML = exposureRows('Steady-state trough', fit.trough, fit.troughCorr, fit.troughWin, fit.troughWin && fit.troughWin.set, uC, fit, '');
    orderTiles(M.spec(fit.drug));
    var badge = fit.hasObs
      ? '<span class="badge info" title="' + esc(fit.nDraws) + ' posterior draws, MCMC acceptance ' + (fit.acceptance * 100).toFixed(0) + '%">Fitted to this patient’s ' +
        esc(fit.obsData ? fit.obsData.length : 0) + ' sample' + (fit.obsData && fit.obsData.length === 1 ? '' : 's') + (uiFlag('occasions', M.spec(fit.drug)) ? ' on ' + esc(fit.nOccasions) + ' day' + (fit.nOccasions === 1 ? '' : 's') : '') + '</span>'
      : '<span class="badge info">Population forecast, no measurements entered</span>';
    var spec = M.spec(fit.drug);
    badge += ' <span class="badge info" title="' + esc(spec.article) + '">' + esc(uiVal('badge', spec) || spec.label) + '</span>';
    if (DG.convergenceNote(fit)) badge += ' <span class="badge warn" title="' + esc(DG.convergenceNote(fit)) + '">sampling not converged</span>';
    $('fitStatus').innerHTML = badge + (fit.runtimeMs ? ' <span class="hint">' + (fit.runtimeMs / 1000).toFixed(1) + ' s' + (fit.parallel && fit.parallel !== 'in-process' ? ' on ' + esc(fit.parallel) : '') + '</span>' : '');
    var shrinkNote = '';
    var ci = fit.etaNames ? fit.etaNames.indexOf(uiVal('shrinkEta', spec) || 'CL') : -1;
    var txr = TX(fit.drug);
    // fit.shrink[i] is Var(posterior)/ω²; 1 − that is the information gained: the share of the prior variance the
    // samples removed (0 = the estimate is the population prior). Few samples → low information → say so.
    if (ci >= 0 && fit.shrink && isFinite(fit.shrink[ci]) && 1 - fit.shrink[ci] < 0.3) {
      shrinkNote = (txr && txr.shrinkNote) || '<p class="legend-note"><b>Note:</b> the samples barely moved this patient’s clearance estimate, so the interval largely reflects population variability. Add a sample 1–3 h after a dose, or samples on more than one day, to individualize the estimate.</p>';
    }
    var cn = fit.assay === 'cmia' ? ' Concentrations are on the Abbott CMIA scale (converted with the model authors’ equation; see the background dialog).' : '';
    var capNote = fit.nSampledDays > fit.nOccasions
      ? '<p class="legend-note"><b>Note:</b> samples were entered on ' + esc(fit.nSampledDays) + ' days. The ' + esc(fit.nOccasions) + ' most recent days have their own day-to-day effect; the ' +
        esc(fit.nSampledDays - fit.nOccasions) + ' older ones are treated as typical days, and their samples are still used.</p>' : '';
    var resNote = (txr && txr.resultNote)
      ? txr.resultNote(fit, { esc: esc, fmtC: fmtC }).replace(/<\/div>$/, esc(cn) + '</div>')
      : '<div class="legend-note">Steady-state values for the current regimen on a typical day, at the haematocrit of the latest sample (' +
        esc(fmtC(fit.hctReport)) + ' L/L); a single day varies around them by about 23%. The corrected lines refer to haematocrit ' + esc(fit.hctRef) +
        '.' + esc(cn) + '</div>';
    $('advisoryBlock').innerHTML = capNote + resNote + shrinkNote +
      '<div class="legend-note">' + esc(DG.summaryHint(fit)) + '</div>';
  }

  /* One definition of "narrow" (matches the ≤ 640 px CSS block): charts switch to their compact, phone-sized layout,
   * otherwise a 960 px SVG is scaled to a third and its axis text becomes unreadable. */
  function isNarrow() { return !!(root.matchMedia && root.matchMedia('(max-width: 640px)').matches); }

  function renderChart(fit) {
    var box = $('chart');
    if (!box) return;
    if (!fit) {
      box.innerHTML = '<div class="note">Enter a dosing schedule and press “Run forecast”. ' +
        (modelPending() ? 'Forecasting is disabled while the model is pending.' : '') + '</div>';
      return;
    }
    // S12: the chart follows the reported AUC window (morning-anchored when shifted)
    var t0 = fit.aucT0 != null ? fit.aucT0 : fit.lastDoseT;
    var gridAbs = fit.chartGrid || fit.grid || [];
    var grid = gridAbs.map(function (t) { return t - t0; });
    var band = fit.chartBand || {};
    var logY = $('logY').checked;
    var yVals = [];
    (band.p5 || []).forEach(function (v) { if (isFinite(v)) yVals.push(v); });
    (band.p95 || []).forEach(function (v) { if (isFinite(v)) yVals.push(v); });
    (fit.obsData || []).forEach(function (o) { if (isFinite(o.c)) yVals.push(o.c); });
    var yMax = yVals.length ? Math.max.apply(null, yVals) * 1.25 : 10;
    var yMin = logY && yVals.length ? Math.max(1e-4, Math.min.apply(null, yVals.filter(isFinite)) / 2) : 0;
    var pts = (fit.obsData || []).map(function (o) {
      return { x: o.t - t0, y: o.c, color: '#dc2626' };
    }).filter(function (p) { return isFinite(p.x) && isFinite(p.y); });
    var xr = CH.xRange(grid, pts.map(function (p) { return p.x; }));
    CH.render(box, {
      compact: isNarrow(),
      title: (M.spec(fit.drug).custom ? (uiVal('chartTitle', M.spec(fit.drug)) || 'Whole-blood concentration–time forecast') : 'MPA concentration–time forecast'),
      xLabel: fit.aucAnchorShifted ? 'Time (h after morning dose)' : 'Time (h after last dose)',
      yLabel: 'Concentration (' + concUnit(fit) + ')',
      logY: logY,
      xMin: Math.min(0, xr.xMin),
      xMax: grid.length ? xr.xMax : fit.intervalHours,
      yMin: yMin, yMax: yMax,
      series: band.median ? [{ x: grid, y: band.median, color: '#0e7490', width: 2 }] : [],
      bands: (band.p5 && band.p95) ? [{ x: grid, lo: band.p5, hi: band.p95, fill: 'rgba(14,116,144,0.16)' }] : [],
      points: pts,
      legend: [
        { label: 'individual median', color: '#0e7490', swatch: 'line' },
        { label: '5–95% band', color: 'rgba(14,116,144,0.16)', swatch: 'band' },
        { label: 'measurement', color: '#dc2626', swatch: 'dot' }
      ]
    });
  }

  function setProgress(f, msg) {
    var wrap = $('progress'), bar = $('progressBar'), m = $('progressMsg');
    if (!wrap) return;
    if (f == null) { wrap.style.display = 'none'; return; }
    wrap.style.display = '';
    wrap.classList.add('show');
    bar.style.width = Math.round(f * 100) + '%';
    m.textContent = msg || '';
  }
  async function runForecast() {
    if (modelPending()) {
      toast('Forecasting is disabled: the model file for this drug is not complete.');
      return;
    }
    if (state.running) return;
    var input = buildRunInput();
    var errs = validateRun(input);
    if (errs.length) {
      $('runHint').className = 'run-hint show';
      $('runHint').textContent = errs.join(' ');
      return;
    }
    state.running = true;
    state.cancel = false;
    $('btnCancelRun').disabled = false;
    updateRunButtons();
    $('runHint').className = 'run-hint';
    $('runHint').textContent = '';
    setProgress(0.02, 'Starting…');
    var t0 = (root.performance && performance.now) ? performance.now() : Date.now();
    try {
      var fit = await B.runFit(input, { progress: function (f, msg) { setProgress(f, msg); }, cancelled: function () { return state.cancel; } });
      fit.runtimeMs = ((root.performance && performance.now) ? performance.now() : Date.now()) - t0;
      state.lastRun = fit;
      state.lastRunInputs = input;
      state.lastRunView = {
        patientId: $('pt-code').value, weight: usesWeight() ? $('pt-wt').value : '',
        form: currentForm(), win: windowBounds(), troughWin: troughBounds(), drug: $('pt-drug').value, extra: extraCovariates(),
        doses: effectiveDoses().map(function (d) { return d.pred != null ? { t: d.t, amt: d.amt, route: d.route, pred: d.pred } : { t: d.t, amt: d.amt, route: d.route }; }),
        obs: state.obs.map(function (o) { return o.hct != null ? { t: o.t, c: o.c, hct: o.hct } : { t: o.t, c: o.c }; })
      };
      clearStale();
      renderResults(fit);
      renderChart(fit);
      var d = effectiveDoses();
      $('iv-amt').value = d.length ? d[d.length - 1].amt : $('iv-amt').value;
      updateRunButtons();
      toast('Forecast complete.');
    } catch (e) {
      $('runHint').className = 'run-hint show';
      $('runHint').textContent = e && e.message ? e.message : String(e);
      toast(e && e.cancelled ? 'Forecast cancelled.' : 'Forecast failed.');
    } finally {
      state.running = false;
      setProgress(null);
      updateRunButtons();
      if ($('runHint').textContent === 'Running…') { $('runHint').textContent = ''; $('runHint').className = 'run-hint'; }   // the "Running…" shown while inputs were edited mid-fit
    }
  }

  async function runExplorer() {
    if (modelPending() || !state.lastRun) return;
    var amt = parseFloat($('iv-amt').value);
    if (!(amt > 0)) { $('iv-status').textContent = 'Enter a dose to explore.'; return; }
    var ivInterval = parseFloat($('iv-interval').value);
    if (!(ivInterval === 12 || ivInterval === 24)) ivInterval = 12;  // offered intervals
    var fit = state.lastRun;
    var input = state.lastRunInputs;
    var last = input.doses[input.doses.length - 1];
    if (M.spec(fit.drug).custom) { await runExplorerTac(fit, input, amt); return; }
    var form = fit.form || currentForm();
    var amtMpa = M.toMpaMg(amt, form);   // product mg in → MPA mg to the engine
    $('iv-status').textContent = 'Exploring…';
    try {
      var rows = await B.doseScan({
        draws: fit.draws || [],
        mixChain: fit.mixChain || null,
        drug: fit.drug,
        form: form,
        wt: fit.wt, age: fit.age, renal: fit.renal, extra: fit.extra,
        tEnd: last.t,
        route: last.route || 'oral',
        amounts: [amtMpa],
        intervalHours: ivInterval,
        winLo: fit.winLo, winHi: fit.winHi
      });
      var r = rows && rows[0];
      if (!r) { $('iv-status').textContent = 'Exploration failed.'; return; }
      var win = { lo: fit.winLo, hi: fit.winHi };
      var normalized = ivInterval !== 12;
      var aucLbl = normalized
        ? 'Expected AUC₀–12h equivalent (median, 5–95%)'
        : 'Expected AUC₀–12h (median, 5–95%)';
      var anchorShifted = !!r.anchorShifted;
      var aucSub = fmtC(r.auc.p5) + ' – ' + fmtC(r.auc.p95) + ' mg·h/L' +
        (normalized
          ? ' · from AUC₀–' + ivInterval + 'h ' + fmtC(r.aucRaw.median) + ' mg·h/L × 12/' + ivInterval
          : '') +
        (anchorShifted ? ' · window anchored at the most recent morning dose' : '');
      $('iv-out').innerHTML =
        '<div class="res-grid">' +
        '<div class="res-cell"><div class="res-lbl">Candidate maintenance dose</div><div class="res-val">' + esc(amt) + ' mg ' + esc(formLabel(form)) + '</div>' +
        '<div class="res-sub">= ' + fmtC(amtMpa) + ' mg MPA · same route, every ' + ivInterval + ' h, at steady state</div></div>' +
        '<div class="res-cell res-hero"><div class="res-lbl">' + aucLbl + '</div>' +
        '<div class="res-val">' + fmtC(r.auc.median) + ' <span class="res-unit">mg·h/L</span></div>' +
        '<div class="res-sub">' + aucSub + '</div></div>' +
        '<div class="res-cell"><div class="res-lbl">P(within window)</div><div class="res-val">' + fmtP(r.auc.pInWindow) + '</div>' +
        '<div class="res-sub">window ' + fmtC(win.lo) + ' – ' + fmtC(win.hi) + ' mg·h/L</div></div>' +
        '<div class="res-cell"><div class="res-lbl">P(above lower)</div><div class="res-val">' + fmtP(r.auc.pAboveLower) + '</div>' +
        '<div class="res-sub">&gt; ' + fmtC(win.lo) + '</div></div>' +
        '<div class="res-cell"><div class="res-lbl">P(below upper)</div><div class="res-val">' + fmtP(r.auc.pBelowUpper) + '</div>' +
        '<div class="res-sub">&lt; ' + fmtC(win.hi) + '</div></div>' +
        '<div class="res-cell"><div class="res-lbl">Predicted trough C(' + ivInterval + ' h)</div>' +
        '<div class="res-val">' + fmtC(r.trough.median) + ' <span class="res-unit">mg/L</span></div>' +
        '<div class="res-sub">' + fmtC(r.trough.p5) + ' – ' + fmtC(r.trough.p95) + ' mg/L, no trough target</div></div>' +
        '</div>' +
        '<div class="legend-note">The explorer reuses this patient’s fitted posterior and simulates a full maintenance regimen at the candidate dose and chosen interval until steady state. ' +
        (normalized
          ? 'AUCs are normalized to a 12-hour equivalent (AUC₁₂ = AUC₀–' + ivInterval + 'h × 12/' + ivInterval + '), applied per posterior draw, so the interval and the 5–95% range transform exactly and the AUC₀–12h window stays comparable across regimens. The trough is a concentration at the chosen interval and is not normalized. '
          : '') +
        (anchorShifted
          ? 'The AUC window is anchored at the most recent morning dose: EC-MPS targets refer to morning-dose profiles. '
          : '') +
        'It does not select or recommend a dose.</div>';
      $('iv-status').textContent = '';
    } catch (e) {
      $('iv-status').textContent = e && e.message ? e.message : String(e);
    }
  }

  async function runExplorerTac(fit, input, amt) {
    var last = input.doses[input.doses.length - 1];
    var cu = M.spec(fit.drug).custom;
    $('iv-status').textContent = 'Exploring…';
    try {
      var rows = await B.doseScan({
        draws: fit.draws || [], drug: fit.drug, wt: fit.wt, extra: fit.extra,
        tEnd: last.t, amounts: [cu.doseToEngine(amt)], intervalHours: 12,
        winLo: fit.winLo, winHi: fit.winHi, troughLo: fit.troughWin.lo, troughHi: fit.troughWin.hi,
        pred: last.pred != null ? last.pred : fit.extra.pred, hct: fit.hctReport, assay: fit.assay
      });
      var r = rows && rows[0];
      if (!r) { $('iv-status').textContent = 'Exploration failed.'; return; }
      var uA = aucUnit(fit), uC = concUnit(fit), txe = TX(fit.drug);
      $('iv-out').innerHTML =
        '<div class="res-grid"><div class="res-cell"><div class="res-lbl">Candidate maintenance dose</div><div class="res-val">' + esc(amt) + ' mg ' + esc(uiVal('noun', M.spec(fit.drug)) || '') + '</div>' +
        '<div class="res-sub">' + (txe && txe.explorerSub ? esc(txe.explorerSub(last, fit)) : 'every 12 h, at steady state, prednisolone ' + esc(last.pred != null ? last.pred : fit.extra.pred) + ' mg/day') + '</div></div></div>' +
        '<div class="tiles">' + exposureRows('Steady-state AUC₀–12h', r.auc, r.aucCorr, { lo: fit.winLo, hi: fit.winHi }, r.windowSet, uA, fit, '') +
        exposureRows('Steady-state trough', r.trough, r.troughCorr, fit.troughWin, r.troughWinSet, uC, fit, '') + '</div>' +
        '<div class="legend-note">' + ((txe && txe.explorerNote) || 'The explorer reuses this patient’s fitted posterior and simulates the candidate dose to steady state on a typical day. Whole-blood concentrations rise a little less than in proportion to the dose because binding to red cells saturates, so doubling a dose gives somewhat less than double the exposure. It does not select or recommend a dose.') + '</div>';
      $('iv-status').textContent = '';
    } catch (e) {
      $('iv-status').textContent = e && e.message ? e.message : String(e);
    }
  }

  var _lastFocus = null;
  function openModal(id) {
    var m = $(id);
    if (!m) return;
    _lastFocus = document.activeElement;
    m.hidden = false;
    var d = m.querySelector('.modal');
    if (d) { d.setAttribute('tabindex', '-1'); d.focus(); }   // keyboard and screen-reader users land in the dialog, not on the page behind it
  }
  function giveFocusBack() {
    if (_lastFocus && _lastFocus.focus) { try { _lastFocus.focus(); } catch (e) {} }
    _lastFocus = null;
  }
  function closeModal(id) {
    var m = $(id);
    if (m) m.hidden = true;
    if (_lastFocus) { _lastFocus.focus(); _lastFocus = null; }   // back to the button that opened it
  }
  function closeHelp() {
    var p = $('helpPop');
    if (p) { p.hidden = true; p.textContent = ''; }
    document.querySelectorAll('button.info[aria-expanded="true"]').forEach(function (b) {
      b.setAttribute('aria-expanded', 'false');
    });
  }

  var HELP = {
    wt: 'Body weight in kg. The model uses it only if it is one of that model’s covariates; the allowed range comes from the model.',
    age: 'Age in years, if the model uses it as a covariate.',
    renal: 'Renal function, if the model uses it as a covariate.',
    extracov: 'Other model covariates, if any.',
    form: 'The formulation is this model’s covariate (de Winter 2008): it switches the absorption rate (ka 4.1 vs 3.0 /h), the lag-time structure (MMF 0.3 h at any time; EC-MPS trimodal morning lag 0.95/1.88/4.83 h plus a ~9 h evening lag), and the dose conversion to MPA content (×0.739 MMF, ×0.936 EC-MPS). Doses are entered as prescribed, in product mg.',
    window: 'Lower and upper bound of the therapeutic AUC0–12h (mg·h/L), the AUC over a 12-hour dosing interval at steady state. Dosing at another interval is compared as its 12-hour equivalent (AUC₁₂ = AUC₀–ₓ × 12/ₓ). The default 30–60 is the kidney-transplant window (Bergan 2021, grade B, II; liver transplant uses the same range). Other indications differ: heart transplant >36, proliferative lupus nephritis ≈50 (prefer 45–60), childhood nephrotic syndrome >45–50, lung none established, HSCT AUC0–24h >30. See “Mycophenolic acid background” for the table with citations. Both bounds are used for the therapeutic probabilities; the window is a clinical input you control.',
    recency: 'Optionally gives older measurements a larger residual error so recent samples dominate the fit. Off = ×1, low ×1.5, medium ×2, high ×3. Off by default.',
    ivexplore: 'Evaluate a candidate maintenance dose at steady state using this patient’s fitted posterior. Choose the dosing interval (12 h default, or 24 h). Expected AUC is always shown as a 12-hour equivalent (for other intervals AUC₁₂ = AUC₀–x × 12/x, applied per posterior draw, so the 5–95% interval transforms exactly), together with the probability within the therapeutic window and the predicted trough C(x) at the chosen interval (no target). For EC-MPS, the AUC window is anchored at the most recent morning dose (the target refers to morning-dose profiles).'
  };
  var HELP_TAC = {
    wt: 'Body weight in kg. With sex and height it gives the fat-free mass that clearances and volumes are scaled to. The model was built on adults; the patients in the source study had a fat-free mass of about 35 to 71 kg.',
    window: 'Lower and upper bound of the therapeutic steady-state AUC0–12h (µg·h/L). The app starts with the standard for adult kidney recipients from the IATDMCT consensus (Brunet 2019); other sets are in “Tacrolimus background”, and every bound can be changed. The trough window is set separately. Leave a window empty and that exposure is shown with its interval but without probabilities. Both bounds are used for the probabilities, and the window is a clinical input you control.',
    ivexplore: 'Evaluate a candidate maintenance dose at steady state, every 12 h, using this patient’s fitted posterior: the steady-state AUC0–12h and trough on a typical day, actual and corrected to haematocrit 0.35, with the probabilities against your windows if you set them. Whole-blood exposure is slightly less than proportional to the dose.'
  };
  function bindHelp() {
    document.addEventListener('click', function (ev) {
      var b = ev.target.closest ? ev.target.closest('button.info') : null;
      if (!b) {
        if (!ev.target.closest || !ev.target.closest('#helpPop')) closeHelp();
        return;
      }
      ev.preventDefault();
      var key = b.getAttribute('data-help');
      var pop = $('helpPop');
      var text = ((M.drug().id === 'tac' ? HELP_TAC : ((TX() || {}).help || {}))[key]) || HELP[key] || b.getAttribute('title') || '';
      if (!pop || !text) return;
      var expanded = b.getAttribute('aria-expanded') === 'true';
      closeHelp();
      if (expanded) return;
      b.setAttribute('aria-expanded', 'true');
      pop.textContent = text;
      pop.hidden = false;
      var r = b.getBoundingClientRect();
      pop.style.left = Math.min(r.left, root.innerWidth - 340) + 'px';
      pop.style.top = (r.bottom + 6 + root.scrollY) + 'px';
    });
  }

  function backgroundHtml() { return isCustom() ? TX().background() : backgroundHtmlMpa(); }
  function backgroundHtmlMpa() {
    return '<p>Mycophenolic acid (MPA) exposure varies several-fold between patients on the same dose. Under-exposure is associated with acute rejection; over-exposure with toxicity. The IATDMCT consensus therefore recommends measuring <b>AUC<sub>0–12h</sub></b>, not trough, to personalize mycophenolate in the first posttransplant year. Routine AUC-guided dosing for every kidney recipient is not mandated (consider it especially in high-risk patients), but when TDM is used, AUC is the metric.</p>' +
      '<h3>Reference values</h3>' +
      '<p>Default in this app: <b>30–60 mg·h/L</b> (kidney transplant, MMF + CNI, grade B, II). Edit the window if your indication differs, lupus nephritis and nephrotic syndrome both need a higher floor than the transplant lower bound of 30.</p>' +
      '<table class="data about-tbl">' +
      '<thead><tr><th>Setting</th><th>Target</th><th>Note</th></tr></thead>' +
      '<tbody>' +
      '<tr><td>Kidney transplant (adult &amp; pediatric), MMF + CNI</td><td>AUC<sub>0–12h</sub> 30–60 mg·h/L</td><td>B, II, this app’s default</td></tr>' +
      '<tr><td>Liver transplant</td><td>AUC<sub>0–12h</sub> 30–60 mg·h/L</td><td>supported by RCT</td></tr>' +
      '<tr><td>Heart transplant</td><td>AUC<sub>0–12h</sub> &gt; 36 mg·h/L</td><td>C, III, one-sided</td></tr>' +
      '<tr><td>Lung transplant</td><td>none established</td><td>do not reuse 30–60 silently</td></tr>' +
      '<tr><td>Adult HSCT</td><td>AUC<sub>0–24h</sub> &gt; 30 mg·h/L</td><td>different interval</td></tr>' +
      '<tr><td>Lupus nephritis (proliferative)</td><td>AUC<sub>0–12h</sub> around <b>50</b> mg·h/L (prefer 45–60, not 30)</td><td>responders 51 vs non-responders 30; 40–60 ≈ 70–80% remission</td></tr>' +
      '<tr><td>Nephrotic syndrome (pediatric FRNS/SDNS)</td><td>AUC<sub>0–12h</sub> &gt; <b>45–50</b> mg·h/L</td><td>higher than the pediatric transplant range of 30–60; needed to prevent relapses</td></tr>' +
      '</tbody></table>' +
      '<p>In lupus nephritis, a 2024 meta-analysis found renal responders at mean AUC 51 mg·h/L versus 30 in non-responders. Most included studies targeted above 30 or 45; meta-regression linked 40–60 mg·h/L with a 70–80% remission rate. <b>Do not leave the kidney-transplant lower bound of 30 in place for LN</b>, prefer a window centred near 50 (e.g. 45–60). There are no RCTs of concentration-controlled versus fixed-dose MPA in LN yet.</p>' +
      '<p>In childhood frequently relapsing or steroid-dependent nephrotic syndrome, MMF dose correlates poorly with MPA exposure. Relapses were more common when estimated AUC was &lt; 50 mg·h/L; a higher target than in pediatric kidney transplantation (<b>AUC<sub>0–12h</sub> &gt; 45–50 mg·h/L</b>) is essential to preserve remission. Guide therapy with TDM rather than a fixed mg/m² dose.</p>' +
      '<p class="src">Transplant targets apply mainly to the first posttransplant year and are not validated for EC-MPS. Immunoassays overestimate MPA versus LC-MS/MS; use a model with the assay it was built on.</p>' +
      '<h3>Why model-based (MAP-Bayesian) TDM</h3>' +
      '<p>The consensus prefers MAP-Bayesian estimation over a regression equation because it:</p>' +
      '<ul class="about-list">' +
      '<li>accepts samples at the times they were actually drawn, not a fixed schedule;</li>' +
      '<li>is not locked to a 12-hour dosing interval;</li>' +
      '<li>lets you inspect the fitted concentration–time curve against the data;</li>' +
      '<li>returns an interval on AUC, not only a point estimate.</li>' +
      '</ul>' +
      '<p>That is what this app does: individualize from a population model plus the samples you enter, then report AUC with uncertainty.</p>' +
      '<h3>Limited sampling versus trough</h3>' +
      '<p>There is <b>no evidence for adjusting MMF or EC-MPS from C<sub>0</sub></b>. Trough correlates poorly with AUC because of enterohepatic recirculation (a secondary peak). A short limited-sampling strategy with MAP-Bayesian estimation is the recommended alternative:</p>' +
      '<table class="data about-tbl">' +
      '<thead><tr><th>Formulation</th><th>Minimum</th><th>Typical times after dose</th></tr></thead>' +
      '<tbody>' +
      '<tr><td>MMF</td><td>≥ 2 samples</td><td>~20 min, 1 h, 3 h</td></tr>' +
      '<tr><td>EC-MPS</td><td>3–4 samples</td><td>~1.5 h, 2 h, 4 h (± 6 h)</td></tr>' +
      '</tbody></table>' +
      '<p class="src">Bergan S, Brunet M, Hesselink DA, et al. Personalized therapy for mycophenolate: consensus report by the International Association of Therapeutic Drug Monitoring and Clinical Toxicology. <i>Ther Drug Monit</i> 2021;43(2):150–197.</p>' +
      '<p class="src">Wuttiputhanun T, Naiyarakseree N, Udomkarnjananun S, et al. Therapeutic drug monitoring of mycophenolic acid and clinical outcomes of lupus nephritis: a systematic review and meta-analysis. <i>Lupus Sci Med</i> 2024;11:e001093. doi:10.1136/lupus-2023-001093.</p>' +
      '<p class="src">Querfeld U, Weber LT. Mycophenolate mofetil for sustained remission in nephrotic syndrome. <i>Pediatr Nephrol</i> 2018;33(12):2253–2265. doi:10.1007/s00467-018-3970-y.</p>';
  }

  function gettingStartedBodyHtml() { return isCustom() ? TX().gettingStarted() : gettingStartedBodyHtmlMpa(); }
  function gettingStartedBodyHtmlMpa() {
    return '<p>This tool estimates steady-state mycophenolic acid AUC<sub>0–12h</sub> for one specific patient (the AUC over a 12-hour dosing interval at steady state), using their covariates and any measured concentrations you enter. Nothing you type leaves this device. There is no server involved. Keep this window open and work through the four cards on the main screen in order.</p>' +
      '<ol class="gs-steps">' +
      '<li><b>Patient &amp; covariates.</b> This model (de Winter 2008) uses exactly one covariate: the <b>formulation</b> (MMF or EC-MPS), which switches absorption behaviour and the dose conversion. Doses are entered as prescribed, in product mg; the app converts to MPA content internally (×0.739 MMF, ×0.936 EC-MPS). The therapeutic AUC<sub>0–12h</sub> window defaults to 30–60 mg·h/L, the kidney-transplant value (Bergan 2021; liver transplant uses the same range). Other indications need different bounds: heart transplant >36, proliferative lupus nephritis ≈50 (prefer 45–60), childhood nephrotic syndrome >45–50, so set the bounds for <em>your</em> indication before reading the probabilities (“Mycophenolic acid background” lists them all with citations).</li>' +
      '<li><b>Dosing schedule &amp; measured concentrations.</b> Choose <b>Full schedule</b> if you know the actual dates and doses this patient has received, or <b>Steady state</b> if they are already on a stable maintenance regimen and you just want to enter the dose and interval (hours). Add measured concentrations. For MMF use at least two post-dose samples (typical limited-sampling times 20 min, 1 h, 3 h); for EC-MPS three to four (1.5 h, 2 h, 4 h ± 6 h), and note the source model’s own warning that sparse sampling is expected to be unreliable for EC-MPS, so prefer more samples across the interval there. Trough-only sampling is discouraged. A measured level is what lets the app personalize the estimate instead of just showing the population average.</li>' +
      '<li><b>Forecast.</b> Press <b>Run forecast</b>. The result is a predicted steady-state AUC<sub>0–12h</sub> with a 5–95% interval. If the regimen’s interval is not 12 h, the AUC is reported as its 12-hour equivalent (AUC₁₂ = AUC<sub>0–ₓ</sub> × 12/ₓ), so it always targets the therapeutic window. You also get the probability that AUC sits inside that window, and a predicted trough C(τ) with <em>no trough target</em>. This is a prediction, not a recommendation. The app never suggests a dose or interval; that decision stays yours. Time is in hours everywhere.</li>' +
      '<li><b>Dose explorer</b> (optional). Once you have run a forecast, this card shows what a different <em>maintenance</em> dose would do for this same patient, using the fit you already have. You can also choose the interval (12 h or 24 h); whatever you pick, the AUC is reported as a 12-hour equivalent (AUC₁₂ = AUC₀–x × 12/x) so it stays comparable with the window, alongside the three window probabilities and the predicted trough. Skip it if you only need the estimate for the regimen already planned.</li>' +
      '</ol>' +
      '<p><b>When you are done:</b> <b>Print report</b> asks for your name and advice, then builds a one-page printable summary. <b>Export session</b> saves the case as a file you can reopen later or hand to a colleague. If you close the tab by accident, reopening the app offers to restore what you were working on.</p>' +
      '<p>Curious about the model behind the numbers, the therapeutic window, or the research-use disclaimer? See <b>About</b>, top right.</p>' +
      '<p class="src">Sampling guidance and the default window come from the IATDMCT consensus (Bergan 2021).</p>';
  }

  /* Privacy and research use are the same for every drug, so they are written once. */
  function aboutSharedHtml() {
    return '<h3>Privacy</h3>' +
      '<p>The page runs locally in your browser. Nothing you enter is sent to a server or processed online. The app keeps one autosaved copy of the current session in this browser’s local storage, only so it can offer to restore it after an accidental close; it is dropped after 24 hours, and “Clear session” at the top of the page (or “Discard” in the restore bar) removes it at once. Exported session files stay wherever you save them.</p>' +
      '<h3>Research use only</h3>' +
      '<p><b>For research purposes only, not for routine clinical use.</b> NephroTDM is not a certified medical device, and none of its models has been clinically validated by this project. Validate against prospective data before routine use. Interpretation needs clinical judgement and local protocols.</p>' +
      '<p>The app never recommends, selects or optimizes a dose. It estimates exposure with its uncertainty and lets you explore what a candidate maintenance dose would do. That decision stays yours.</p>';
  }

  function aboutHtml() {
    var s = M.drug();
    var h = '';
    h += aboutSharedHtml();
    if (isCustom()) { h += TX().aboutSections(); } else {
    h += '<h3>What this app estimates for mycophenolic acid</h3>' +
      '<p>Steady-state mycophenolic acid AUC<sub>0–12h</sub>, the AUC over a 12-hour dosing interval at steady state (regimens with another interval are reported as their 12-hour equivalent, AUC₁₂ = AUC<sub>0–ₓ</sub> × 12/ₓ). It comes from a population PK model and limited sampling and is reported as a median with a 5–95% interval. Alongside it: the probability that AUC lies inside the therapeutic window, P(AUC &gt; lower bound), P(AUC &lt; upper bound), and a predicted trough C(τ). Trough is informational only: there is no trough target.</p>';
    h += '<h3>Therapeutic window (AUC<sub>0–12h</sub>)</h3>' +
      '<p>The default window is prefilled from the source below and can be overridden per patient. ' +
      'The window is the only pair of numbers that turns a PK estimate into a clinical judgement, so its provenance is stated explicitly.</p>' +
      '<ul class="about-list">' +
      '<li><b>Kidney transplant, MMF + CNI (adult and pediatric):</b> 30–60 mg·h/L. ' +
      'Bergan S et al. Personalized therapy for mycophenolate: consensus report by the International Association of Therapeutic Drug Monitoring and Clinical Toxicology. ' +
      '<i>Ther Drug Monit</i> 2021;43(2):150–197 (grade B, II).</li>' +
      '<li><b>Heart transplantation:</b> AUC<sub>0–12h</sub> &gt; 36 mg·h/L is cited; edit the window if that is your practice.</li>' +
      '<li><b>Lupus nephritis (proliferative):</b> aim near 50 mg·h/L (prefer 45–60, not the transplant lower bound of 30). ' +
      'Wuttiputhanun T et al. <i>Lupus Sci Med</i> 2024;11:e001093.</li>' +
      '<li><b>Lung, HSCT, EC-MPS, beyond the first posttransplant year:</b> evidence-based windows differ or are lacking, do not leave the kidney-transplant default in place without considering this.</li>' +
      '</ul>' +
      '<p class="src">Both bounds are used: therapeutic probability is P(lower &lt; AUC &lt; upper). The window is a clinical input you control, not a hidden model assumption.</p>';
    h += '<h3>Limited sampling</h3>' +
      '<p>The IATDMCT consensus recommends MAP-Bayesian estimation from a limited sampling strategy rather than a trough alone, and rather than a regression equation. Typical schemes:</p>' +
      '<ul class="about-list">' +
      '<li><b>MMF:</b> at least two concentrations; typical three-point LSS at ~20 min, 1 h and 3 h post-dose.</li>' +
      '<li><b>EC-MPS:</b> three to four samples; typical ~1.5 h, 2 h, 4 h (± 6 h).</li>' +
      '<li><b>Trough-only</b> is discouraged: C<sub>0</sub> correlates poorly with AUC because of enterohepatic recirculation, and the consensus recommends against C<sub>0</sub>-guided dose adjustment.</li>' +
      '<li><b>Below the limit of quantification:</b> a result reported as “&lt; LLOQ” cannot be used, omit that sample. Do not enter zero or the LLOQ as a concentration; either biases the AUC (a zero by about −27%).</li>' +
      '</ul>' +
      '<p class="src">Immunoassays (EMIT, PETINIA, CEDIA) overestimate MPA versus LC-MS/MS; a model should be used with the analytical technique it was developed on, and this app cannot correct for the assay.</p>';
    }
    h += '<h3>Weighting of older samples (optional, off by default)</h3>' +
      '<p>Under advanced fitting options, older measurements can be given a larger residual error ' +
      'so that they influence the individual fit less than recent ones. A concentration describes the ' +
      'patient as they were on the day it was drawn; the further back that is, the less well it describes ' +
      'them now.</p>' +
      '<p>Each sample’s residual standard deviation is multiplied by a factor that grows with age from the newest sample and saturates at a preset M: low ×1.5, medium ×2, high ×3. The newest sample is never inflated, and an old sample is <b>down-weighted but never discarded</b>. Neither M nor the time constant is estimated from the patient’s data, they are a clinical judgement about how much to trust older measurements, made explicit and printed in the report.</p>' +
      '<p><b>Two cautions.</b> Widening the residual error widens the reported intervals, so a forecast made with this option on is less certain, not more. And age is not the same thing as relevance: to set aside a sample you believe is unrepresentative, exclude it explicitly rather than relying on its date.</p>';
    h += '<h3>Models</h3>';
    h += '<p class="src">For each model, assumptions and simplifications relative to its source are listed. Read them before clinical interpretation. Time is in hours everywhere in this app (engine, plots, fields, session and report).</p>';
    (M.listDrugs ? M.listDrugs() : [{ id: 'mpa', label: s.label }]).forEach(function (d) {
      var sp = M.spec ? M.spec(d.id) : s;
      h += '<div class="about-model"><b>' + esc(sp.label) + '</b>' +
        (sp.pending ? ' <span class="badge info" title="This drug is prepared but its population PK parameters are not yet available">parameters pending</span>' : '') +
        '<p class="src">' + esc(sp.article || '') + '</p>' +
        '<p>' + esc((sp.info || '').replace('; see the model card in About for scope and caveats.', '.')) + '</p>';
      if (sp.pending) {
        h += '<p class="src">Parameters pending. Forecasting, AUC estimation and the dose explorer are disabled until the model file for this drug is complete.</p>';
      } else {
        // UX5: parameter table with IIV (√ω² convention) — straight from the spec
        var txm = sp.custom ? TX(sp.id) : null;
        if (txm && txm.modelTable) {
          h += txm.modelTable(sp);
        } else if (sp.THETA && sp.THETA.CL != null) {
          var iivOf = function (n) {
            var v = sp.ETA && sp.ETA.iiv ? sp.ETA.iiv[n] : null;
            return v != null ? (Math.sqrt(v) * 100).toFixed(0) + '%' : '–';
          };
          h += '<table class="about-tbl"><thead><tr><th>Parameter</th><th>Typical value</th><th>IIV (CV%)</th></tr></thead><tbody>';
          [['CL/F (L/h)', sp.THETA.CL, 'CL'], ['Q/F (L/h)', sp.THETA.Q, 'Q'],
           ['V1/F (L)', sp.THETA.V1, 'V1'], ['V2/F (L)', sp.THETA.V2, 'V2']].forEach(function (r2) {
            if (r2[1] != null) h += '<tr><td>' + r2[0] + '</td><td>' + esc(r2[1]) + '</td><td>' + iivOf(r2[2]) + '</td></tr>';
          });
          if (sp.FORMS) Object.keys(sp.FORMS).forEach(function (fk) {
            var f = sp.FORMS[fk];
            h += '<tr><td>ka ' + esc(f.label) + ' (1/h)</td><td>' + esc(f.ka) + '</td><td>' + iivOf('KA') + '</td></tr>';
            if (f.tlag && f.tlag.type === 'fixed') {
              h += '<tr><td>tlag ' + esc(f.label) + ' (h)</td><td>' + esc(f.tlag.value) + '</td><td>' + iivOf('TLAG') + '</td></tr>';
            } else if (f.tlag && f.tlag.type === 'mixed') {
              f.tlag.morning.forEach(function (mx, k) {
                h += '<tr><td>tlag ' + esc(f.label) + ' morning, group ' + (k + 1) + ' (h)</td><td>' + esc(mx.v) +
                  ' (' + Math.round(mx.p * 100) + '% of patients)</td><td>' + iivOf('TLAG_MORN') + '</td></tr>';
              });
              h += '<tr><td>tlag ' + esc(f.label) + ' evening (h)</td><td>' + esc(f.tlag.evening) + '</td><td>' + iivOf('TLAG_EVE') + '</td></tr>';
            }
          });
          if (sp.custom && ECU.tacText && sp.id === 'tac') ECU.tacText.cardRows(sp).forEach(function (r3) {
            h += '<tr><td>' + esc(r3[0]) + '</td><td>' + esc(r3[1]) + '</td><td>' + esc(r3[2]) + '</td></tr>';
          });
          if (sp.SIGMA && sp.SIGMA.LOG) {
            h += '<tr><td>Residual error (log scale)</td><td>σ = ' + esc(sp.SIGMA.LOG) + '</td><td>–</td></tr>';
          }
          h += '</tbody></table>';
        }
        if (sp.custom) h += '<p class="src">' + ((txm && txm.modelNote) || 'Disposition parameters refer to plasma concentrations at a fat-free mass of 60 kg in a CYP3A5 non-expresser; they are scaled by fat-free mass (clearances ^0.75, volumes ^1) and whole-blood concentrations follow from the haematocrit.') + '</p>';
        if (sp.assumptions && sp.assumptions.length) {
          h += '<ul class="src">' + sp.assumptions.map(function (a) { return '<li>' + esc(a) + '</li>'; }).join('') + '</ul>';
        }
        if (sp.windowHint) h += '<p class="src">' + (sp.custom ? 'Windows: ' : 'AUC window: ') + esc(sp.windowHint) + '</p>';
      }
      h += '</div>';
    });
    h += '<h3>Version</h3><p>v' + esc(VERSION) + '</p>';
    h += '<h3>Contact</h3>' +
      '<p>Developed by <b>Rob ter Heine</b> · Radboudumc, Nijmegen, the Netherlands. For questions or collaboration: <a href="mailto:r.terheine@radboudumc.nl">r.terheine@radboudumc.nl</a></p>' +
      '<p>Research group: <a href="https://www.radboudumc.nl/en/research/research-groups/applied-pharmacometrics" target="_blank" rel="noopener">Radboud Applied Pharmacometrics</a>, Radboudumc, Nijmegen.</p>' +
      '<p>Source code and latest version: <a href="https://github.com/Robterheine/nephrotdm-source" target="_blank" rel="noopener">github.com/Robterheine/nephrotdm-source</a>.</p>';
    if (ECU.authorPhoto) {
      h += '<div class="about-photo"><img src="' + ECU.authorPhoto.uri + '" alt="' + esc(ECU.authorPhoto.alt) + '" width="56" height="56"><span>' + esc(ECU.authorPhoto.caption) + '</span></div>';
    }
    return h;
  }

  function fillStaticModals() {
    var gs = $('gettingStartedBody');
    if (gs) gs.innerHTML = gettingStartedBodyHtml();
    var ab = $('aboutBody');
    if (ab) ab.innerHTML = aboutHtml();
  }

  function sessionObj() {
    return {
      app: 'mpa-tdm', appName: 'NephroTDM', version: VERSION, timeUnit: 'hours',   // 'mpa-tdm' is kept so existing session files keep importing
      drug: $('pt-drug').value,
      patient: { code: $('pt-code').value, wt: usesWeight() ? $('pt-wt').value : '', age: $('pt-age').value, renal: $('pt-renal').value, extra: $('pt-extracov').value },
      window: { lo: $('pt-winlo').value, hi: $('pt-winhi').value },
      troughWindow: { lo: $('pt-tlo').value, hi: $('pt-thi').value },
      formulation: $('pt-form').value, recency: $('pt-recency').value,
      mode: currentMode(),
      ss: { dose: $('ss-dose').value, interval: $('ss-interval').value, anchor: $('ss-anchor').value },
      doses: state.doses, obs: state.obs,
      extras: extraCovariates(),
      report: { prepared: $('rp-prepared').value, advice: $('rp-advice').value }
    };
  }
  function applySession(o) {
    if (state.running) { toast('A forecast is running. Wait for it to finish before importing a session.'); return; }
    try {
      if (!o || o.app !== 'mpa-tdm') throw new Error('Not a NephroTDM session file.');   // the file's app key stays 'mpa-tdm' so older sessions keep importing
      M.select(o.drug || 'mpa');
      $('pt-drug').value = o.drug || 'mpa';
      var p = o.patient || {};
      $('pt-code').value = p.code || '';
      $('pt-wt').value = p.wt != null ? p.wt : '';
      $('pt-age').value = p.age != null ? p.age : '';
      $('pt-renal').value = p.renal || '';
      $('pt-extracov').value = p.extra || '';
      var w = o.window || {};
      $('pt-winlo').value = w.lo != null ? w.lo : '';
      $('pt-winhi').value = w.hi != null ? w.hi : '';
      var tw = o.troughWindow || {};
      $('pt-tlo').value = tw.lo != null ? tw.lo : '';
      $('pt-thi').value = tw.hi != null ? tw.hi : '';
      $('pt-form').value = o.formulation || 'mmf';
      $('pt-recency').value = o.recency || 'off';
      if (o.ss) {
        $('ss-dose').value = o.ss.dose != null ? o.ss.dose : '';
        $('ss-interval').value = o.ss.interval != null ? o.ss.interval : '';
        $('ss-anchor').value = o.ss.anchor || '';
      }
      var mode = o.mode === 'ss' ? 'ss' : 'full';
      var r = document.querySelector('input[name="schedMode"][value="' + mode + '"]');
      if (r) r.checked = true;
      // R2: older sessions may carry route 'iv'; the oral-only model must not fit those as IV.
      state.doses = Array.isArray(o.doses) ? o.doses.filter(function (d) { return isFinite(d.t) && d.amt > 0; })
        .map(function (d) { return d.pred != null && isFinite(d.pred) ? { t: d.t, amt: d.amt, route: 'oral', pred: d.pred } : { t: d.t, amt: d.amt, route: 'oral' }; }) : [];
      // R4: censoring is no longer supported. An old file's “< LLOQ” samples cannot be fitted, and dropping them
      // silently would change the result, so they are left out AND the user is told how many.
      var allObs = Array.isArray(o.obs) ? o.obs : [];
      var censoredDropped = allObs.filter(function (x) { return x.lloq; }).length;
      state.obs = allObs.filter(function (x) { return !x.lloq && isFinite(x.t) && isFinite(x.c); })
        .map(function (x) { return x.hct != null && isFinite(x.hct) ? { t: x.t, c: x.c, hct: x.hct } : { t: x.t, c: x.c }; });
      var rp = o.report || {};
      $('rp-prepared').value = rp.prepared || '';
      $('rp-advice').value = rp.advice || '';
      renderDoseTable(); renderObsTable(); renderDrugAndCovariates(); applyMode();
      if (o.extras) {
        Object.keys(o.extras).forEach(function (k) {
          var el = $('cov-' + k);
          if (!el) return;
          // a value that is not one of a select's options would blank it (CYP3A5 would read "unknown" no more); keep the default instead
          if (el.tagName === 'SELECT' && !Array.prototype.some.call(el.options, function (op) { return op.value === String(o.extras[k]); })) return;
          el.value = o.extras[k];
        });
      }
      state.lastRun = null; state.lastRunInputs = null; state.lastRunView = null;
      renderResults(null); renderChart(null);
      updateRunButtons();
      toast(censoredDropped
        ? 'Session imported: ' + censoredDropped + ' below-LLOQ sample' + (censoredDropped > 1 ? 's were' : ' was') + ' not imported (censored samples are no longer supported).'
        : 'Session imported.');
    } catch (e) {
      toast('Import failed: ' + (e && e.message ? e.message : e));
    }
  }
  function download(name, text) {
    var blob = new Blob([text], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  }

  var _saveT = null;
  var AUTOSAVE_MAX_AGE_MS = 86400000;   // 24 h: a saved session is for an accidental close, not for next week
  function autosaveExpired(o, now) {
    var t = o && o.savedAt;
    return !(t > 0) || t > now || now - t > AUTOSAVE_MAX_AGE_MS;
  }
  function scheduleAutosave() {
    clearTimeout(_saveT);
    _saveT = setTimeout(function () {
      try { var o = sessionObj(); o.savedAt = Date.now(); localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(o)); } catch (e) {}
    }, 400);
  }
  function maybeRestore() {
    var raw;
    try { raw = localStorage.getItem(AUTOSAVE_KEY); } catch (e) { return; }
    if (!raw) return;
    var o;
    try { o = JSON.parse(raw); } catch (e) { return; }
    if (!o || o.app !== 'mpa-tdm') return;
    if (autosaveExpired(o, Date.now())) { try { localStorage.removeItem(AUTOSAVE_KEY); } catch (e) {} return; }
    var bar = $('restoreBar');
    if (!bar) return;
    $('restoreText').textContent = 'An autosaved session is available.';
    bar.hidden = false;
    $('restoreYes').onclick = function () { applySession(o); bar.hidden = true; };
    $('restoreNo').onclick = function () {
      try { localStorage.removeItem(AUTOSAVE_KEY); } catch (e) {}
      bar.hidden = true;
    };
  }

  /* F10: the settings that change the likelihood, so every number on the page is reproducible from the page. */
  function fittingSettingsText(inp) {
    if (!inp) return '';
    var opt = $('pt-recency').querySelector('option[value="' + (inp.recency || 'off') + '"]');
    return 'Dosing input: ' + (inp.steadyState ? 'steady state' : 'full schedule') +
      ' · recency weighting: ' + (opt ? opt.textContent : (inp.recency || 'off'));
  }

  /* The printed report: one A4 page for every drug (src/report.js). Everything it shows is read from the run snapshot (state.lastRunView),
   * the inputs the forecast was produced from; the live fields are only the fallback when no forecast has been run. */
  function renderReport() {
    var fit = state.lastRun;
    var view = fit ? state.lastRunView : null;
    var spec = M.spec(fit ? fit.drug : M.drug().id);
    var inputsChanged = !!(fit && $('staleBanner').classList.contains('show'));
    var form = view ? view.form : currentForm();
    var ctx = {
      fit: fit, spec: spec, inputsChanged: inputsChanged, version: VERSION, now: new Date().toLocaleString(),
      patientId: view ? view.patientId : $('pt-code').value,
      weight: view ? view.weight : $('pt-wt').value,
      usesWeight: usesWeight(spec), form: form, formLabel: spec.FORMS ? formLabel(form) : '',
      extra: view ? view.extra : extraCovariates(),
      doses: view ? view.doses : effectiveDoses(),
      obs: view ? view.obs : state.obs,
      win: view ? view.win : windowBounds(),
      troughWin: view ? view.troughWin : troughBounds(),
      ssMode: !!(fit && state.lastRunInputs && state.lastRunInputs.steadyState),
      units: { auc: fit ? aucUnit(fit) : UN().auc, conc: fit ? concUnit(fit) : UN().conc },
      settings: fit ? fittingSettingsText(state.lastRunInputs) : '',
      advice: $('rp-advice').value, prepared: $('rp-prepared').value, fmtClock: fmtHoursClock,
      notes: fit ? reportNotes(fit, spec) : {}
    };
    var sheet = $('reportSheet');
    sheet.innerHTML = fit ? ECU.report.build(ctx) : '<div class="rp-page"><h1 style="margin:0;font-size:20px">NephroTDM report</h1><p>No forecast has been run in this session. Run a forecast first, then print the report.</p></div>';
    sheet.hidden = false;
    root.print();
    setTimeout(function () { sheet.hidden = true; }, 400);
  }
  /* the cautions that must travel with the numbers: sampling convergence, a short or single-dose history, weak information, EC-MPS anchoring */
  function reportNotes(fit, spec) {
    var cap = function (x) { return x ? x.charAt(0).toUpperCase() + x.slice(1) : ''; };
    return {
      convergence: DG.convergenceNote(fit),
      shortHistory: fit.warnSingleDose ? 'Only one dose was entered, so this AUC describes a single dose from zero, not steady state.' : DG.shortHistoryNote(fit),
      shrink: spec.custom ? '' : cap(DG.shrinkageNote(fit)),
      anchor: fit.aucAnchorShifted ? 'The AUC window is anchored at the most recent morning dose (EC-MPS targets refer to morning-dose profiles); an evening-anchored window would read lower.' : ''
    };
  }

  function bind() {
    var menu = document.querySelector('header details.menu');   // the Session menu closes after a choice, on an outside click and on Escape
    if (menu) {
      menu.addEventListener('click', function (ev) { if (ev.target.closest && ev.target.closest('.menu-pop button')) menu.removeAttribute('open'); });
      document.addEventListener('click', function (ev) { if (menu.open && !menu.contains(ev.target)) menu.removeAttribute('open'); });
      menu.addEventListener('keydown', function (ev) { if (ev.key === 'Escape') { menu.removeAttribute('open'); var sm = menu.querySelector('summary'); if (sm) sm.focus(); } });
    }
    var dismiss = $('stepperDismiss');
    if (dismiss) dismiss.addEventListener('click', function () { $('stepper').style.display = 'none'; });

    $('btnGettingStarted').addEventListener('click', function () {
      var gs = $('gettingStartedBody');
      if (gs) gs.innerHTML = gettingStartedBodyHtml();
      openModal('gettingStartedModal');
    });
    $('backgroundBody').addEventListener('click', function (ev) {   // the "Use" buttons of the window table
      var b = ev.target.closest ? ev.target.closest('button[data-winset]') : null;
      if (!b) return;
      var w = (M.drug().windowSets || []).filter(function (x) { return x.id === b.getAttribute('data-winset'); })[0];
      if (w && applyWindowSet(w.id)) { closeModal('backgroundModal'); toast('Window set: ' + w.label + '.'); }
    });
    $('btnBackground').addEventListener('click', function () {
      var bb = $('backgroundBody');
      if (bb) bb.innerHTML = backgroundHtml();
      openModal('backgroundModal');
    });
    $('btnAbout').addEventListener('click', function () {
      var ab = $('aboutBody');
      if (ab) ab.innerHTML = aboutHtml();
      openModal('aboutModal');
    });
    $('btnCancelRun').addEventListener('click', function () { state.cancel = true; this.disabled = true; $('progressMsg').textContent = 'Cancelling…'; });
    $('btnClearSession').addEventListener('click', function () {
      if (!root.confirm('Delete the autosaved copy kept in this browser and empty this page?\n\nExported session files are not affected.')) return;
      clearTimeout(_saveT);   // a save queued by the last keystroke must not bring the data back
      try { localStorage.removeItem(AUTOSAVE_KEY); } catch (e) {}
      root.location.reload();
    });
    $('btnPrint').addEventListener('click', function () { openModal('reportModal'); });
    $('btnDiag').addEventListener('click', function () {
      var fit = state.lastRun;
      var s = M.drug();
      var body = $('diagModalBody');
      body.innerHTML = DG.panelHtml(fit, s);
      openModal('diagModal');
      // The observed-vs-predicted SVG needs a live element, so it renders
      // after the panel HTML is in the DOM.
      var host = $('diag-gof');
      if (host) {
        var cfg = DG.gofChart(fit, s);
        if (cfg) { cfg.compact = isNarrow(); CH.render(host, cfg); }
      }
    });
    $('btnExport').addEventListener('click', function () {
      download('nephrotdm-session.json', JSON.stringify(sessionObj(), null, 2));
    });
    $('btnImport').addEventListener('click', function () { $('importFile').click(); });
    $('importFile').addEventListener('change', function (ev) {
      var f = ev.target.files && ev.target.files[0];
      if (!f) return;
      var fr = new FileReader();
      fr.onload = function () {
        try { applySession(JSON.parse(fr.result)); }
        catch (e) { toast('Not a valid session file.'); }
      };
      fr.readAsText(f);
      ev.target.value = '';
    });

    ['gettingStartedClose', 'backgroundClose', 'aboutClose', 'reportClose', 'diagClose'].forEach(function (id) {
      var el = $(id);
      if (el) el.addEventListener('click', function () { closeModal(el.id.replace('Close', 'Modal')); });
    });
    document.querySelectorAll('.modal-backdrop').forEach(function (bd) {
      bd.addEventListener('click', function (ev) { if (ev.target === bd) { bd.hidden = true; giveFocusBack(); } });
    });
    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Tab') {   // keep Tab inside an open dialog
        var dlg = document.querySelector('.modal-backdrop:not([hidden]) .modal');
        if (dlg) {
          var f = Array.prototype.filter.call(dlg.querySelectorAll('button, input, select, textarea, a[href], summary'), function (e) { return !e.disabled && e.offsetParent !== null; });
          if (!f.length) { ev.preventDefault(); return; }
          var first = f[0], last = f[f.length - 1], act = document.activeElement;
          if (ev.shiftKey && (act === first || act === dlg)) { ev.preventDefault(); last.focus(); }
          else if (!ev.shiftKey && act === last) { ev.preventDefault(); first.focus(); }
          else if (!dlg.contains(act)) { ev.preventDefault(); first.focus(); }
        }
        return;
      }
      if (ev.key !== 'Escape') return;
      closeHelp();
      var any = false;
      document.querySelectorAll('.modal-backdrop:not([hidden])').forEach(function (bd) { bd.hidden = true; any = true; });
      if (any) giveFocusBack();
    });

    $('pt-drug').addEventListener('change', function () {
      if (state.running) {   // a fit would finish under the other drug's screen
        toast('A forecast is running. Wait for it to finish before changing the drug.');
        this.value = M.drug().id;
        return;
      }
      if ((state.doses.length || state.obs.length) && !root.confirm('Switching drug clears the doses and samples entered for the current one. Continue?')) {
        this.value = M.drug().id;
        return;
      }
      state.doses = []; state.obs = [];
      state.lastRun = null; state.lastRunInputs = null; state.lastRunView = null;
      resetWindows();   // a window belongs to one drug and one scale: never carry 30–60 mg·h/L (MPA) over to tacrolimus
      renderResults(null); renderChart(null);
      M.select(this.value);
      renderDrugAndCovariates();
      if (M.drug().windowStandard) applyWindowSet(M.drug().windowStandard);
      pendingNotice();
      updateRunButtons();
      markStale();
    });
    ['pt-wt', 'pt-age', 'pt-renal', 'pt-extracov', 'pt-winlo', 'pt-winhi', 'pt-tlo', 'pt-thi', 'pt-recency', 'pt-code', 'pt-form'].forEach(function (id) {
      var el = $(id);
      if (el) el.addEventListener('input', markStale);
    });
    $('pt-winlo').addEventListener('input', updateWindowFoldVal);
    $('pt-winhi').addEventListener('input', updateWindowFoldVal);
    $('pt-tlo').addEventListener('input', updateWindowFoldVal);
    $('pt-thi').addEventListener('input', updateWindowFoldVal);
    // The formulation covariate drives labels, the EC-MPS sampling caution and
    // the dose conversion — refresh the form when it changes.
    $('pt-form').addEventListener('change', function () {
      updateFormLabels();
      markStale();
    });

    document.querySelectorAll('input[name="schedMode"]').forEach(function (r) {
      r.addEventListener('change', applyMode);
    });

    $('doseForm').addEventListener('submit', function (ev) {
      ev.preventDefault();
      var t = dtLocalToHours($('dose-dt').value);
      var amt = parseFloat($('dose-amt').value);
      var route = 'oral';   // the model's CL/F, V/F parameters are oral-only (R2)
      if (!isFinite(t) || !(amt > 0)) { toast('Enter a valid date/time and dose.'); return; }
      var dr = M.drug().dose;
      if (dr && !(amt >= dr.min && amt <= dr.max)) { toast('A dose of ' + amt + ' ' + UN().dose + ' is outside the range this model covers (' + dr.min + ' to ' + dr.max + ' ' + UN().dose + '). Check the unit.'); return; }
      var dose = { t: t, amt: amt, route: route };
      if (uiFlag('predDose') && $('dose-pred') && $('dose-pred').value !== '') {
        var pr = parseFloat($('dose-pred').value);
        if (!(pr >= 0)) { toast('Enter the prednisolone dose in mg/day (0 or more), or leave it empty.'); return; }
        dose.pred = pr;
      }
      state.doses.push(dose);
      state.doses.sort(function (a, b) { return a.t - b.t; });
      renderDoseTable();
      markStale();
    });
    $('obsForm').addEventListener('submit', function (ev) {
      ev.preventDefault();
      var t = dtLocalToHours($('obs-dt').value);
      var c = parseFloat($('obs-val').value);
      if (!isFinite(t)) { toast('Enter a valid sample date/time, or pick hours after last dose.'); return; }
      if (!isFinite(c)) { toast('Enter a concentration.'); return; }
      var sp0 = M.drug(), lo0 = sp0.obsValMin != null ? sp0.obsValMin : 0, hi0 = sp0.obsValMax != null ? sp0.obsValMax : Infinity;
      if (!(c > 0) || c < lo0 || c > hi0) {
        toast('A concentration of ' + c + ' ' + UN().conc + ' cannot be used (allowed ' + lo0 + ' to ' + hi0 + '). It must be above 0; leave out results below the quantification limit.');
        return;
      }
      var ob = { t: t, c: c };
      if (isCustom()) {
        var hv = $('obs-hct').value !== '' ? parseFloat($('obs-hct').value) : covNum('hct');
        if (hv > 1 && hv <= 100) { toast('Haematocrit is entered in L/L (for example 0.33), not as a percentage.'); return; }
        if (!(hv >= 0.10 && hv <= 0.65)) { toast('Enter the haematocrit of this sample in L/L (0.10–0.65), or fill in the patient card value.'); return; }
        ob.hct = hv;
      }
      state.obs.push(ob);
      state.obs.sort(function (a, b) { return a.t - b.t; });
      renderObsTable();
      markStale();
    });
    var off = $('obs-offset');
    if (off) off.addEventListener('change', function () {
      var h = parseFloat(this.value);
      if (!isFinite(h)) return;
      var d = effectiveDoses();
      if (!d.length) { toast('Enter a dose first so the offset has an anchor.'); return; }
      $('obs-dt').value = hoursToDtLocal(d[d.length - 1].t + h);
    });
    document.addEventListener('click', function (ev) {
      var delD = ev.target.closest ? ev.target.closest('[data-del-dose]') : null;
      if (delD) {
        state.doses.splice(parseInt(delD.getAttribute('data-del-dose'), 10), 1);
        renderDoseTable(); markStale(); return;
      }
      var delO = ev.target.closest ? ev.target.closest('[data-del-obs]') : null;
      if (delO) {
        state.obs.splice(parseInt(delO.getAttribute('data-del-obs'), 10), 1);
        renderObsTable(); markStale(); return;
      }
    });
    $('tplClear').addEventListener('click', function () {
      state.doses = []; state.obs = [];
      renderDoseTable(); renderObsTable(); markStale();
    });
    ['ss-dose', 'ss-interval', 'ss-anchor'].forEach(function (id) {
      $(id).addEventListener('input', markStale);
    });

    $('btnRun').addEventListener('click', function () { runForecast(); });
    $('iv-run').addEventListener('click', runExplorer);
    $('logY').addEventListener('change', function () { if (state.lastRun) renderChart(state.lastRun); });
    var wasNarrow = isNarrow();
    root.addEventListener('resize', function () {          // rotating a phone crosses the breakpoint: redraw the chart once
      var n = isNarrow();
      if (n !== wasNarrow) { wasNarrow = n; if (state.lastRun) renderChart(state.lastRun); }
    });
    $('rp-generate').addEventListener('click', function () { closeModal('reportModal'); renderReport(); });
    $('rp-cancel').addEventListener('click', function () { closeModal('reportModal'); });
  }

  function init() {
    document.title = 'NephroTDM v' + VERSION;
    $('titleVersion').textContent = 'v' + VERSION;
    $('footerVersion').textContent = VERSION;
    bindHelp();
    fillStaticModals();
    renderDrugAndCovariates();
    pendingNotice();
    renderDoseTable();
    renderObsTable();
    renderChart(null);
    renderResults(null);
    updateRunButtons();
    bind();
    maybeRestore();
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  }

  ECU.ui = {
    autosaveExpired: autosaveExpired,
    state: state,
    effectiveDoses: effectiveDoses,
    buildRunInput: buildRunInput,
    validateRun: validateRun,
    windowBounds: windowBounds,
    troughBounds: troughBounds,
    modelPending: modelPending,
    dtLocalToHours: dtLocalToHours,
    hoursToDtLocal: hoursToDtLocal,
    intervalHoursOf: intervalHoursOf,
    inputProblems: inputProblems,
    renderResults: renderResults,
    renderReport: renderReport,
    sessionObj: sessionObj,
    applySession: applySession,
    aboutHtml: aboutHtml,
    drugText: drugText,
    drugCardsHtml: drugCardsHtml,
    resultTileHtml: resultTileHtml,
    backgroundHtml: backgroundHtml,
    gettingStartedBodyHtml: gettingStartedBodyHtml
  };
})(typeof window !== 'undefined' ? window : globalThis);
