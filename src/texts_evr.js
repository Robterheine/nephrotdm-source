/* =========================================================================
 * NephroTDM: everolimus texts (background, getting started, About, results, report)
 *
 * Registered as ECU.drugTexts.evr; ui.js and diagnostics.js ask the registry, no shared string names a drug.
 * Rules for this file (README rule 6 and the owner's decisions of 3 October 2026):
 *  - no sentence reads as a dose or interval recommendation;
 *  - every number traces to the model paper (Zwart 2021, Table 2) or the IATDMCT consensus (Masuda 2025, Table 1, p. 9 and 16),
 *    or is computed from the model (handoff section 3.5);
 *  - no sentence says that a corrected value or a target is "not validated"; claims are no stronger than the evidence;
 *  - no em-dashes.
 * ========================================================================= */
(function (root) {
  'use strict';
  var ECU = root.ECU = root.ECU || {};
  ECU.drugTexts = ECU.drugTexts || {};

  function spec() { return ECU.model.spec('evr'); }
  function ref() { return spec().custom.constants.HCT_REF; }

  function windowTable() {
    var sp = spec(), out = '';
    sp.windowSets.forEach(function (w) {
      var std = w.id === sp.windowStandard;
      out += '<div class="winset' + (std ? ' std' : '') + '">' +
        '<div class="winset-head"><b>' + w.label + '</b>' + (std ? ' <span class="badge info">standard</span>' : '') + '</div>' +
        '<div class="winset-nums">Trough <b>' + w.trough[0] + '–' + w.trough[1] + '</b> µg/L &nbsp;·&nbsp; AUC<sub>0–12h</sub> <b>none given</b></div>' +
        '<div class="src">' + w.basis + '</div>' +
        '<button type="button" class="secondary" data-winset="' + w.id + '" title="Put this window in card 1">Use this window</button></div>';
    });
    return out;
  }

  function background() {
    var H = ref();
    return '<p>Everolimus is an mTOR inhibitor used after kidney transplantation, usually together with a reduced dose of a calcineurin inhibitor (CNI). Exposure differs a lot between patients. The whole-blood trough concentration (C<sub>0</sub>) is the routine measure. The IATDMCT consensus report notes that the pharmacokinetics are linear and that the trough follows the AUC well, so the trough is the metric it uses for targets. The app also reports the model-based <b>AUC<sub>0–12h</sub></b>, which can help when the haematocrit is far from usual or a trough looks out of line.</p>' +
      '<h3>Trough windows</h3>' +
      '<p>Pick the set that matches the patient’s co-medication; the app does not know it. The first set is the starting point. Change either bound in card 1, or clear the window to get intervals without probabilities. The probabilities are only as meaningful as the window you set.</p>' +
      windowTable() +
      '<p>Both sets come from the consensus report for adult kidney recipients (trough with a reduced-exposure CNI, and without a CNI). <b>The consensus gives no AUC target</b>, so the AUC window stays empty; add one if your protocol has it. The same windows apply to the actual and to the haematocrit-corrected values. Targets for cancer indications and for other organs are different and are not covered here.</p>' +
      '<h3>Haematocrit and the corrected value</h3>' +
      '<p>About three quarters of everolimus in blood sits in red cells at therapeutic concentrations, and the binding saturates. At the same plasma concentration, whole blood reads higher the higher the haematocrit. The app reports the <b>actual</b> whole-blood value and the value <b>corrected to a haematocrit of ' + H + '</b>: the concentration this patient would show, for the same plasma concentration, at ' + H + ' (Eq. 3 of the model paper).</p>' +
      '<p>Example: a typical patient on a stable regimen who reads a trough of 3.1 µg/L at a haematocrit of 0.25 has a corrected trough of 4.3 µg/L. At a haematocrit of 0.50 the reading is 5.8 µg/L and the corrected trough 4.7 µg/L. In the paper the corrected trough or AUC differed from the measured one by more than 20% in about one occasion in seven.</p>' +
      '<h3>Assay</h3>' +
      '<p>Concentrations must come from an LC-MS/MS assay. The consensus states that LC-MS/MS, QMS, ECLIA and ACMIA results are not interchangeable and gives no conversion, so results from other assays cannot be used.</p>' +
      '<h3>Sampling</h3>' +
      '<table class="data about-tbl"><thead><tr><th>Samples</th><th>What they give the model</th></tr></thead><tbody>' +
      '<tr><td>Predose trough only</td><td>The individual clearance (and so the AUC) is informed; the volume is not. The interval stays wider than with an extra sample.</td></tr>' +
      '<tr><td>Trough plus one sample 1–3 h after the dose</td><td>The absorption phase and the peak, which adds information on the volume and on the shape of the curve.</td></tr>' +
      '</tbody></table>' +
      '<p>Enter the exact times of dose and sample and the haematocrit of the same day. Results below the limit of quantification (0.5 µg/L in the source study) cannot be used: leave them out.</p>' +
      '<p class="src">Zwart TC, Moes DJAR, van der Boog PJM, et al. Model-informed precision dosing of everolimus: external validation in adult renal transplant recipients. <i>Clin Pharmacokinet</i> 2021;60:191–203. doi:10.1007/s40262-020-00925-8.</p>' +
      '<p class="src">Masuda S, Lemaitre F, Barten MJ, et al. Everolimus personalized therapy: second consensus report by the International Association of Therapeutic Drug Monitoring and Clinical Toxicology. <i>Ther Drug Monit</i> 2025;47(1):4–31.</p>';
  }

  function gettingStarted() {
    var H = ref();
    return '<p>For one adult kidney transplant recipient on twice-daily everolimus, this tool estimates the <b>steady-state AUC<sub>0–12h</sub> and trough</b> with 5–95% intervals, from the covariates and the concentrations you enter. Both are shown as measured (actual whole blood) and corrected to a haematocrit of ' + H + '. Nothing you type leaves this device. Work through the cards in order.</p>' +
      '<ol class="gs-steps">' +
      '<li><b>Patient &amp; covariates.</b> Choose everolimus. Enter the haematocrit in L/L (0.38, not 38) and choose the prednisolone group: less than 20 mg/day (or none), or 20 mg/day or more. Concentrations must come from an LC-MS/MS assay. The trough window starts at 3–8 µg/L, the consensus range with a reduced-exposure CNI; pick the other set in the background dialog if the patient has no CNI, or clear the window.</li>' +
      '<li><b>Dosing schedule &amp; measured concentrations.</b> Choose <b>Full schedule</b> to enter the actual doses, or <b>Steady state</b> for a stable regimen (dose, interval, time of the latest dose). Doses are in mg of everolimus per administration. Add the samples with their exact times and haematocrit. A sample is optional: without one you get the population forecast, which is much less accurate.</li>' +
      '<li><b>Forecast.</b> Press <b>Run forecast</b>. You get the steady-state AUC<sub>0–12h</sub> and trough of the current regimen, each with a 5–95% interval, as measured and corrected. With a window set, you also get the probability that the exposure lies inside, above or below it. These are predictions, not recommendations.</li>' +
      '<li><b>Dose explorer</b> (optional). After a forecast, this card shows what a different dose, at the same 12-hour interval, would do for this patient at steady state, using the fit you already have. It does not select or recommend a dose.</li>' +
      '</ol>' +
      '<p><b>When you are done:</b> <b>Print report</b> builds a one-page summary and <b>Export session</b> saves the case as a file. If you close the tab by accident, reopening the app offers to restore your work.</p>' +
      '<p class="src">The windows and sampling are explained in the background dialog. The model and its limits are in <b>About</b>.</p>';
  }

  function aboutSections() {
    return '<h3>What this app estimates for everolimus</h3>' +
      '<p>For an adult kidney transplant recipient on twice-daily everolimus: the steady-state whole-blood AUC<sub>0–12h</sub> and trough of the current regimen. They come from a population PK model (Model 3 of Zwart 2021) and the samples entered, each as a median with a 5–95% interval, as measured (actual) and corrected to a haematocrit of ' + ref() + '. If you set windows, you also get the probability of lying inside, above or below each.</p>' +
      '<h3>How accurate is it</h3>' +
      '<p>In an external cohort of 173 adult kidney recipients (4123 concentrations), the model predicted a future value from a previous sample as follows. Trough: bias +13.5% and imprecision (mean absolute error) 30% in the first 6 months, +6.3% and 26% later; about two thirds of troughs fell within ±30% of the measured value. AUC<sub>0–12h</sub>: bias −6.8% and imprecision 11% in the first 6 months, +0.1% and 12% later.</p>' +
      '<p>Without any sample the forecast is much less accurate: the trough had an imprecision of about 32% and the AUC was over-predicted by about 43% on average. That is why a run without a sample is labelled as a population forecast. The model has no day-to-day effect, so a single future measurement scatters around the reported value by more than the interval shows.</p>' +
      '<h3>What it does not cover</h3>' +
      '<ul class="about-list">' +
      '<li>Cancer indications, children, recipients of other organs and once-daily dosing.</li>' +
      '<li>Ciclosporin, which lowers everolimus metabolism by about half, and other CYP3A and P-glycoprotein inhibitors or inducers. A stable interaction is absorbed by the patient’s own clearance; one that starts or stops inside the entered history is not.</li>' +
      '<li>Liver function, food, adherence and the time since transplantation. None of these is in the model.</li>' +
      '<li>Immunoassay results. Only LC-MS/MS values can be used.</li>' +
      '<li>Results below the limit of quantification. A result reported as “&lt; LLOQ” cannot be used, so omit it.</li>' +
      '</ul>';
  }

  function modelTable(sp) {
    var C = sp.custom.constants;
    function cv(v) { return Math.round(Math.sqrt(v) * 100) + '%'; }
    var rows = [
      ['Mean absorption time (h)', C.MAT + ' (five equal stages, ka ' + C.KA.toFixed(2) + ' /h)', '–'],
      ['CLint (L/h)', C.CLINT + '; ×' + C.PRED + ' with prednisolone 20 mg/day or more', cv(C.OM_CLINT)],
      ['V3, central plasma volume (L)', C.V3, cv(C.OM_V3)],
      ['Q (L/h) and V4 (L)', C.Q + ' and ' + C.V4, '–'],
      ['Unbound fraction FU', C.FU, cv(C.OM_FU)],
      ['Hepatic blood flow (L/h), liver volume (L)', C.QH + ' (plasma flow × (1 − haematocrit)), ' + C.VL, '–'],
      ['Red-cell binding', 'Bmax ' + C.BMAX + ' µg/L erythrocytes, Kd ' + C.KD + ' µg/L plasma, Kns ' + C.KNS, '–'],
      ['Residual error (log scale)', 'σ = ' + Math.sqrt(C.SIGMA_LOG2).toFixed(3), '–']
    ];
    var esc = function (s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); };
    return '<table class="about-tbl"><thead><tr><th>Parameter</th><th>Typical value</th><th>IIV (CV%)</th></tr></thead><tbody>' +
      rows.map(function (r) { return '<tr><td>' + esc(r[0]) + '</td><td>' + esc(r[1]) + '</td><td>' + esc(r[2]) + '</td></tr>'; }).join('') + '</tbody></table>';
  }

  var HELP = {
    window: 'Lower and upper bound of an AUC0–12h window (µg·h/L). The IATDMCT consensus gives no AUC target for everolimus, so this starts empty; add one if your protocol has it. The trough window is set separately and starts at the consensus range with a reduced-exposure CNI; other sets are in “Everolimus background”. Leave a window empty and that exposure is shown with its interval but without probabilities.',
    ivexplore: 'Evaluate a candidate maintenance dose at steady state, every 12 h, using this patient’s fitted posterior: the steady-state AUC0–12h and trough, actual and corrected to haematocrit ' + '0.38' + ', with the probabilities against your windows if you set them. Whole-blood exposure is slightly less than proportional to the dose.'
  };

  ECU.drugTexts.evr = {
    background: background, gettingStarted: gettingStarted, aboutSections: aboutSections, modelTable: modelTable,
    modelNote: 'Disposition parameters refer to plasma concentrations; no body-size covariate is used. Whole-blood concentrations follow from the haematocrit through the red-cell binding equation.',
    doseNote: 'Twice-daily everolimus in adult kidney transplant recipients. Once-daily dosing and cancer indications are not covered by this model.',
    chartNote: 'Individual = this patient’s measured levels · red points = measurements. The curve is whole blood at the haematocrit of the latest sample, on the current regimen; the reported steady-state values are for the regimen at steady state. The windows are shown in the results grid, not on this plot. Time axis in hours after the last dose.',
    howto: '<li><b>Steady-state AUC₀–12h and trough:</b> the model’s estimate for the current regimen, with a 5–95% interval. The interval covers the uncertainty in this patient’s parameters; a single future measurement scatters more than that.</li>' +
      '<li><b>Corrected to haematocrit 0.38:</b> the whole-blood value this patient would show, for the same plasma concentration, at a haematocrit of 0.38. It removes the effect of anaemia or a high haematocrit on the reading.</li>' +
      '<li><b>Probability in window:</b> shown only if you set a window; the chance that the exposure lies between your lower and upper bound.</li>' +
      '<li><b>Band (5–95%):</b> 90% plausible range for the true concentration curve. It does not include assay error, so a future measured value may fall outside it.</li>',
    help: HELP,
    shrinkNote: '<p class="legend-note"><b>Note:</b> the samples barely moved this patient’s clearance estimate, so the interval largely reflects population variability. A sample 1–3 h after a dose adds information.</p>',
    resultNote: function (fit, h) {
      return '<div class="legend-note">Steady-state values for the current regimen, at the haematocrit of the latest sample (' + h.esc(h.fmtC(fit.hctReport)) +
        ' L/L). The model has no day-to-day effect: a future single measurement scatters around these values by more than the interval shows (in the model paper, trough about 26–30% and AUC about 11–13% mean absolute error). The corrected lines refer to haematocrit ' + h.esc(fit.hctRef) + '.</div>';
    },
    explorerSub: function (last, fit, h) {
      return 'every 12 h, at steady state, prednisolone ' + (fit.extra && fit.extra.predFlag ? '20 mg/day or more' : 'less than 20 mg/day, or none');
    },
    explorerNote: 'The explorer reuses this patient’s fitted posterior and simulates the candidate dose to steady state. Whole-blood concentrations rise a little less than in proportion to the dose because binding to red cells saturates, so doubling a dose gives somewhat less than double the exposure. It does not select or recommend a dose.',
    reportPatient: function (c) {
      var ex = c.ex, g = ex.predHigh === 'high' ? '20 mg/day or more' : (ex.predHigh === 'low' ? 'less than 20 mg/day, or none' : '–');
      return '<h2>Patient</h2><table class="data">' +
        '<tr><th>ID</th><td>' + c.esc(c.pid) + '</td><th>Haematocrit (patient card)</th><td>' + c.esc(ex.hct || '–') + ' L/L</td></tr>' +
        '<tr><th>Prednisolone</th><td>' + c.esc(g) + '</td><th>Assay</th><td>LC-MS/MS</td></tr></table>';
    },
    reportNote: function (fit, h) {
      return 'Steady state of the current regimen, at the haematocrit of the latest sample (' + h.esc(h.fmtC(fit.hctReport)) + ' L/L). The model has no day-to-day effect; a future single measurement scatters around these values by more than the interval shows. The corrected values refer to haematocrit ' + h.esc(fit.hctRef) + '.';
    },
    diagNote: 'The volume (V3) is expected to be poorly informed by troughs; the AUC depends on clearance and unbound fraction, not on the volume.'
  };
})(typeof window !== 'undefined' ? window : globalThis);
