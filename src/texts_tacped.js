/* =========================================================================
 * NephroTDM: pediatric tacrolimus texts (background, getting started, About, results, report)
 *
 * Registered as ECU.drugTexts.tacped; ui.js and diagnostics.js ask the registry, no shared string names a drug.
 * Rules for this file (README rule 6, docs/HANDOFF_PEDIATRIC.md section 10):
 *  - no sentence reads as a dose or interval recommendation (the starting-dose table of the MPA paper and any dose advice of the
 *    2026 paper are not used);
 *  - every number traces to Heida 2026 (Tables 2, 4, 5, 7 and ESM S1), Schijvens 2019 and 2020, or is computed from the model;
 *  - no sentence says that a corrected value or a target is "not validated"; claims are no stronger than the evidence;
 *  - the estimate describes the sampled day, and the text says so;
 *  - no em-dashes.
 * Status: first draft by the coder; clinical pharmacologist and owner review (gate G6) still to come.
 * ========================================================================= */
(function (root) {
  'use strict';
  var ECU = root.ECU = root.ECU || {};
  ECU.drugTexts = ECU.drugTexts || {};

  function spec() { return ECU.model.spec('tacped'); }
  function ref() { return spec().custom.constants.HCT_REF; }

  var SCOPE = 'Children with a kidney transplant on twice-daily tacrolimus as capsule or suspension. Built on children aged 1–17 years, weight 9–78 kg, sampled at a median of 11 days after transplantation; LC-MS/MS whole-blood concentrations only; haematocrit needed.';
  var SAMPLED_DAY = 'The estimate describes this patient on the day of the samples. Exposure changes from day to day and over months. In a small prospective evaluation (29 children enrolled), the AUC predicted from one occasion did not match the AUC measured about three months later. The authors conclude that repeated monitoring is needed.';

  function winLine(w) {
    return (w.trough ? 'Trough <b>' + w.trough[0] + '–' + w.trough[1] + '</b> µg/L' : 'AUC<sub>0–12h</sub> <b>' + w.auc[0] + '–' + w.auc[1] + '</b> µg·h/L');
  }

  function windowTable() {
    var sp = spec(), out = '';
    sp.windowSets.forEach(function (w) {
      out += '<div class="winset">' +
        '<div class="winset-head"><b>' + w.label + '</b></div>' +
        '<div class="winset-nums">' + winLine(w) + '</div>' +
        '<div class="src">' + w.basis + '</div>' +
        '<button type="button" class="secondary" data-winset="' + w.id + '" title="Put this window in card 1">Use this window</button></div>';
    });
    return out;
  }

  function background() {
    var H = ref();
    return '<p>' + SCOPE + ' Tacrolimus exposure differs a lot between children and changes with weight, haematocrit and formulation. The model-based <b>AUC<sub>0–12h</sub></b> and trough are estimated from the samples you enter, with an interval, as measured (actual whole blood) and corrected to a haematocrit of ' + H + '.</p>' +
      '<h3>Windows</h3>' +
      '<p>No window is preselected: the AUC target depends on the time since transplantation, which the app does not ask for. Pick the set that fits the patient, type your own bounds in card 1, or clear the window to get intervals without probabilities. The probabilities are only as meaningful as the window you set.</p>' +
      windowTable() +
      '<p>The AUC sets are the local guideline and Wallemacq 2009, as used in Heida 2026 (Table 2). The trough sets are the consensus values for children as cited in Heida 2026. The AUC sets change at 6 weeks and the trough sets at 2 months; they come from different sources and do not line up. The targets are whole-blood values. Following Heida 2026 and Schijvens 2019, they are taken to refer to a haematocrit of ' + H + ', so <b>the corrected value is the one to compare with them</b>; the actual value is shown beside it.</p>' +
      '<h3>Haematocrit and the corrected value</h3>' +
      '<p>Tacrolimus binds to red cells, and the binding saturates. At the same plasma concentration, whole blood reads higher the higher the haematocrit, and children soon after a transplant often have a low one (in a cohort of 36 children sampled at a median of 12 days after transplantation, 92% were below ' + H + '). The app reports the <b>actual</b> whole-blood value and the value <b>corrected to a haematocrit of ' + H + '</b>: the concentration this patient would show, for the same plasma concentration, at ' + H + ', computed with the red-cell binding relation of the model.</p>' +
      '<p>The red-cell binding constants (Bmax 418 µg/L, Kd 3.8 µg/L) come from a study in adult liver transplant recipients, as used by Schijvens 2019, who note that they should ideally be determined in children.</p>' +
      '<p>Illustration of the correction, not a dose guide: for a typical 25 kg child on 3 mg of capsule twice daily, the model gives an AUC of 194 µg·h/L at a haematocrit of 0.30 and 257 µg·h/L at 0.40. Corrected to ' + H + ', both read about 225 µg·h/L. Without the correction the same exposure sits in a different place relative to a window.</p>' +
      '<h3>Capsule and suspension</h3>' +
      '<p>The formulation is chosen per dose. In the model the suspension is absorbed faster (rate 18 against 2.83 per hour) and has 0.46 times the bioavailability of the capsule. Another product or preparation than the one in the model’s development data may behave differently. A switch is entered on the dose row where it happened; for a stable regimen choose the formulation of the regimen.</p>' +
      '<h3>Assay</h3>' +
      '<p>Concentrations must come from an LC-MS/MS assay in whole blood (the assay of the model’s development data). Results from other assays cannot be used and have no conversion.</p>' +
      '<h3>Sampling</h3>' +
      '<table class="data about-tbl"><thead><tr><th>Samples</th><th>What the authors’ evaluation showed</th></tr></thead><tbody>' +
      '<tr><td>0, 1 and 2 hours after the dose</td><td>Within the authors’ limit of 25% for bias and imprecision: mean prediction error 0.2%, normalised root mean squared error (a typical individual error) 7.8%.</td></tr>' +
      '<tr><td>Trough only</td><td>Less accurate, still inside the limit: 3.7% and 22.0%.</td></tr>' +
      '</tbody></table>' +
      '<p>The reference was the AUC from the full profile estimated with the same model, in the children the model was built on (23 profiles).</p>' +
      '<p>Enter the exact times of dose and sample and the haematocrit of the same day. Results below the limit of quantification cannot be used: leave them out.</p>' +
      '<h3>What the estimate means</h3>' +
      '<p>' + SAMPLED_DAY + '</p>' +
      '<p class="src">Schijvens AM, de Wildt SN, Cornelissen EAM, et al. Low bioavailability of oral tacrolimus suspension in pediatric kidney transplant recipients. <i>Clin Pharmacokinet</i> 2020;59:1483–1491.</p>' +
      '<p class="src">Heida A, Cornelissen EAM, Aarnoutse RE, et al. Structured evaluation of model-informed precision dosing of mycophenolic acid and tacrolimus in pediatric patients with kidney disease. <i>Clin Pharmacokinet</i> 2026. doi:10.1007/s40262-026-01708-3.</p>' +
      '<p class="src">Schijvens AM, et al. The potential impact of hematocrit correction on evaluation of tacrolimus target exposure in pediatric kidney transplant patients. <i>Pediatr Nephrol</i> 2019;34:507–515.</p>';
  }

  function gettingStarted() {
    var H = ref();
    return '<p>For one child with a kidney transplant on twice-daily tacrolimus, this tool estimates the <b>steady-state AUC<sub>0–12h</sub> and trough</b> with 5–95% intervals, from the covariates and the concentrations you enter. Both are shown as measured (actual whole blood) and corrected to a haematocrit of ' + H + '. Nothing you type leaves this device. Work through the cards in order.</p>' +
      '<ol class="gs-steps">' +
      '<li><b>Patient &amp; covariates.</b> Choose tacrolimus (pediatric kidney). Enter the weight in kg and the haematocrit in L/L (0.30, not 30). Concentrations must come from an LC-MS/MS assay. No window is preselected; pick one in the background dialog, or leave it empty.</li>' +
      '<li><b>Dosing schedule &amp; measured concentrations.</b> Choose <b>Full schedule</b> to enter the actual doses, or <b>Steady state</b> for a stable regimen (dose, interval, time of the latest dose). Doses are in mg of tacrolimus per administration, and each dose has its formulation, capsule or suspension. Add the samples with their exact times and haematocrit. A sample is optional: without one you get the model’s typical child for these covariates, with a wide interval.</li>' +
      '<li><b>Estimate.</b> Press <b>Run forecast</b> (the button has this name for every drug). You get the steady-state AUC<sub>0–12h</sub> and trough of the current regimen, each with a 5–95% interval, as measured and corrected. With a window set, you also get the probability that the exposure lies inside, above or below it. These are estimates for the day of the samples, not predictions of later exposure and not recommendations.</li>' +
      '<li><b>Dose explorer</b> (optional). After a forecast, this card shows the exposure the model gives for a different dose, at the same 12-hour interval, at steady state, using the fit you already have. It assumes the state of the sampled day continues and says nothing about later days. It does not select or recommend a dose.</li>' +
      '</ol>' +
      '<p><b>When you are done:</b> <b>Print report</b> builds a one-page summary and <b>Export session</b> saves the case as a file. If you close the tab by accident, reopening the app offers to restore your work.</p>' +
      '<p class="src">The windows and sampling are explained in the background dialog. The model and its limits are in <b>About</b>.</p>';
  }

  function aboutSections() {
    return '<h3>What this app estimates for tacrolimus in children</h3>' +
      '<p>' + SCOPE + ' The steady-state whole-blood AUC<sub>0–12h</sub> and trough of the current regimen, each as a median with a 5–95% interval, as measured (actual) and corrected to a haematocrit of ' + ref() + '. If you set windows, you also get the probability of lying inside, above or below each.</p>' +
      '<h3>How well did the model do</h3>' +
      '<p>The model authors evaluated this model in children with kidney disease (Heida 2026). With samples at 0, 1 and 2 hours after the dose, the AUC of the same day was estimated with a mean prediction error of 0.2% and a normalised root mean squared error of 7.8%; with a trough only, 3.7% and 22.0%. Both are within the authors’ limit of 25%. The reference was the AUC from the full profile estimated with the same model, in the children the model was built on.</p>' +
      '<p>Predicting the AUC at the next occasion, about three months later, did not work: the mean prediction error was 64.2% and the normalised root mean squared error 210%, both above the authors’ limit of 25%. The authors attribute this to substantial between-occasion variability. <b>' + SAMPLED_DAY + '</b> The intervals in this app describe the uncertainty about the patient on the sampled day; they do not include day-to-day variability, which this model does not have.</p>' +
      '<h3>What it does not cover</h3>' +
      '<ul class="about-list">' +
      '<li>Adults, prolonged-release products and other organs.</li>' +
      '<li>Children outside weight 9–78 kg (a warning is shown) and outside 3–200 kg (refused).</li>' +
      '<li>Height and age. The model was refitted without height; weight and haematocrit are its only covariates.</li>' +
      '<li>Interactions with CYP3A inhibitors and inducers, CYP3A5 genotype, liver function, food, adherence and the time since transplantation. None of these is in the model.</li>' +
      '<li>Immunoassay results. Only LC-MS/MS values can be used.</li>' +
      '<li>Results below the limit of quantification. A result reported as “&lt; LLOQ” cannot be used, so omit it.</li>' +
      '</ul>' + referenceSections();
  }

  function referenceSections() {
    var sp = spec(), H = ref(), rows = '';
    sp.windowSets.forEach(function (w) {
      rows += '<tr><td>' + w.label + '</td><td>' + (w.trough ? w.trough[0] + '–' + w.trough[1] : 'none given') + '</td><td>' + (w.auc ? w.auc[0] + '–' + w.auc[1] : 'none given') + '</td><td>' + w.grade + '</td></tr>';
    });
    return '<h3>Reference values for tacrolimus (children with a kidney transplant, twice-daily)</h3>' +
      '<p>As used in Heida 2026 (Table 2). The windows are starting points that you can change or clear; the Tacrolimus background dialog has the same sets with a “Use this window” button each. The targets are taken to refer to whole blood at a haematocrit of ' + H + '. µg/L is the same as ng/mL.</p>' +
      '<div class="winmatrix-wrap"><table class="data about-tbl"><thead><tr><th>Setting</th><th>Trough (µg/L)</th><th>AUC<sub>0–12h</sub> (µg·h/L)</th><th>Source</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
      '<h3>Why model-based estimation</h3>' +
      '<p>A model-based estimate works with the sample times you actually have, takes the haematocrit and the formulation into account, and gives the trough and the AUC with an interval from one fit.</p>' +
      '<p class="src">Heida A, et al. <i>Clin Pharmacokinet</i> 2026, doi:10.1007/s40262-026-01708-3. Schijvens AM, et al. <i>Clin Pharmacokinet</i> 2020;59:1483–1491.</p>';
  }

  function modelTable(sp) {
    var C = sp.custom.constants;
    var cv = function (v) { return v + ' (CV ' + (Math.sqrt(Math.exp(v) - 1) * 100).toFixed(1) + '%)'; };
    var rows = [
      ['Absorption rate KA (per hour)', C.KA_CAP + ' capsule, ' + C.KA_SUS + ' suspension (three equal stages)', cv(C.OM_KA)],
      ['Relative bioavailability of the suspension', C.F_SUS + ' (capsule = 1)', '–'],
      ['CLint (L/h at 70 kg)', C.CLINT, cv(C.OM_CLINT)],
      ['V3, central plasma volume (L at 70 kg)', C.V3, cv(C.OM_V3)],
      ['Q (L/h at 70 kg) and V4 (L at 70 kg)', C.Q + ' and ' + C.V4, '–'],
      ['Hepatic blood flow (L/h at 70 kg), liver volume (L)', C.QH + ' (plasma flow × (1 − haematocrit)), 0.0437 × weight^0.9', '–'],
      ['Weight scaling', 'clearances and Q × (weight/70)^0.75, volumes × (weight/70)', '–'],
      ['Red-cell binding', 'Bmax ' + C.BMAX + ' µg/L erythrocytes, Kd ' + C.KD + ' µg/L plasma', '–'],
      ['Residual error (proportional)', 'variance ' + C.SIGMA_PROP, '–']
    ];
    var esc = function (s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); };
    return '<table class="about-tbl"><thead><tr><th>Parameter</th><th>Typical value</th><th>IIV (variance)</th></tr></thead><tbody>' +
      rows.map(function (r) { return '<tr><td>' + esc(r[0]) + '</td><td>' + esc(r[1]) + '</td><td>' + esc(r[2]) + '</td></tr>'; }).join('') + '</tbody></table>';
  }

  var HELP = {
    wt: 'Body weight in kg. Clearances scale to weight to the power 0.75, volumes in proportion, and the liver volume to weight to the power 0.9. The model was built on children of 9–78 kg; outside that range a warning is shown.',
    window: 'Lower and upper bound of an AUC0–12h window (µg·h/L). No window is preselected for children: the target depends on the time since transplantation. The sets are in “Tacrolimus background”. The targets are taken to refer to whole blood at haematocrit 0.35, so the corrected value is the one to compare. Leave a window empty and that exposure is shown with its interval but without probabilities.',
    ivexplore: 'Show the exposure the model gives for a dose you enter, at steady state, every 12 h, using this patient’s fitted posterior: the AUC0–12h and trough, actual and corrected to haematocrit 0.35, with the probabilities against your windows if you set them. It is a what-if for the day of the samples; exposure three months later could not be predicted in the authors’ evaluation. Whole-blood exposure is slightly less than proportional to the dose.'
  };

  ECU.drugTexts.tacped = {
    background: background, gettingStarted: gettingStarted, aboutSections: aboutSections, modelTable: modelTable,
    modelNote: 'Disposition parameters refer to plasma concentrations and scale to weight. Whole-blood concentrations follow from the haematocrit through the red-cell binding relation. Refitted without height (Heida 2026); estimated with NONMEM FOCE-I.',
    doseNote: 'Twice-daily tacrolimus in children with a kidney transplant, capsule or suspension, chosen per dose. Prolonged-release products and adults are not covered by this model.',
    chartNote: 'Individual = this patient’s measured levels · red points = measurements. The curve is whole blood at the haematocrit of the latest sample, on the current regimen; the reported steady-state values are for the regimen at steady state. The windows are shown in the results grid, not on this plot. Time axis in hours after the last dose.',
    howto: '<li><b>Steady-state AUC₀–12h and trough:</b> the model’s estimate for the current regimen, with a 5–95% interval. The interval covers the uncertainty in this patient’s parameters on the sampled day; a later measurement scatters more than that.</li>' +
      '<li><b>Corrected to haematocrit 0.35:</b> the whole-blood value this patient would show, for the same plasma concentration, at a haematocrit of 0.35. It removes the effect of a low or high haematocrit on the reading.</li>' +
      '<li><b>Probability in window:</b> shown only if you set a window; the chance that the exposure lies between your lower and upper bound.</li>' +
      '<li><b>Band (5–95%):</b> 90% plausible range for the true concentration curve. It does not include assay error, so a future measured value may fall outside it.</li>',
    help: HELP,
    shrinkNote: '<p class="legend-note"><b>Note:</b> the samples barely moved this patient’s clearance estimate, so the interval largely reflects population variability. Samples at 0, 1 and 2 hours after the dose add information.</p>',
    resultNote: function (fit, h) {
      return '<div class="legend-note">Steady-state values for the current regimen, at the haematocrit of the latest sample (' + h.esc(h.fmtC(fit.hctReport)) +
        ' L/L). ' + SAMPLED_DAY + ' The corrected lines refer to haematocrit ' + h.esc(fit.hctRef) + '.</div>';
    },
    explorerSub: function (last, fit, h) {
      return 'every 12 h, at steady state, ' + (last && last.form === 'suspension' ? 'suspension' : 'capsule');
    },
    explorerNote: 'This is a what-if for the day of the samples: the exposure the model gives for the dose you enter, at steady state. In the authors’ evaluation, exposure three months later could not be predicted. Whole-blood concentrations rise a little less than in proportion to the dose because binding to red cells saturates. It does not select or recommend a dose.',
    reportPatient: function (c) {
      var ex = c.ex;
      return '<h2>Patient</h2><table class="data">' +
        '<tr><th>ID</th><td>' + c.esc(c.pid) + '</td><th>Haematocrit (patient card)</th><td>' + c.esc(ex.hct || '–') + ' L/L</td></tr>' +
        '<tr><th>Weight</th><td>' + c.esc(c.wt || ex.wt || '–') + ' kg</td><th>Assay</th><td>LC-MS/MS</td></tr></table>';
    },
    reportNote: function (fit, h) {
      return 'Steady state of the current regimen, at the haematocrit of the latest sample (' + h.esc(h.fmtC(fit.hctReport)) + ' L/L). ' + SAMPLED_DAY + ' The corrected values refer to haematocrit ' + h.esc(fit.hctRef) + '.';
    },
    diagNote: 'The volume (V3) is expected to be poorly informed by troughs; the AUC depends on clearance, not on the volume.'
  };
})(typeof window !== 'undefined' ? window : globalThis);
