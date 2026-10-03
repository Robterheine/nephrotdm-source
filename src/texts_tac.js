/* =========================================================================
 * NephroTDM: tacrolimus texts (background, getting started, About sections)
 *
 * Kept apart from ui.js so the MPA copy stays untouched. Rules for this file:
 *  - no sentence may read as a dose or interval recommendation (README rule 6);
 *  - no therapeutic window is quoted as a default (the consensus text was not
 *    available when this was written, docs/IMPLEMENTATION_PLAN_STORSET_2014.md D6),
 *    so only what the model paper and the abstracts themselves state;
 *  - every number below is traced to the cited paper or computed from its model;
 *  - claims are no stronger than the evidence (the paper is a model-building and
 *    trough-evaluation study, not a trial).
 * Privacy and research-use text is shared by all drugs and lives in ui.js.
 * ========================================================================= */
(function (root) {
  'use strict';
  var ECU = root.ECU = root.ECU || {};

  function windowTable() {
    var sp = ECU.model.spec('tac'), out = '';
    sp.windowSets.filter(function (w) { return !w.matched; }).forEach(function (w) {
      var std = w.id === sp.windowStandard;
      out += '<div class="winset' + (std ? ' std' : '') + '">' +
        '<div class="winset-head"><b>' + w.label + '</b>' + (std ? ' <span class="badge info">standard</span>' : '') + '</div>' +
        '<div class="winset-nums">Trough <b>' + w.trough[0] + '–' + w.trough[1] + '</b> µg/L &nbsp;·&nbsp; AUC<sub>0–12h</sub> <b>' + (w.auc ? w.auc[0] + '–' + w.auc[1] + '</b> µg·h/L' : 'none given</b>') +
        ' &nbsp;·&nbsp; grade: ' + w.grade + '</div>' +
        '<div class="src">' + w.basis + '</div>' +
        '<button type="button" class="secondary" data-winset="' + w.id + '" title="Put this window in card 1">Use this window</button></div>';
    });
    // trough-matched AUC ranges: one row per trough range, one button per period (Saint-Marcoux 2013, Table 2)
    var cols = ['all', 'early', 'mid', 'late'], names = { early: '0–3 mo', mid: '3–12 mo', late: '&gt;12 mo', all: 'all periods' };
    var rows = {};
    sp.windowSets.filter(function (w) { return w.matched; }).forEach(function (w) { (rows[w.matched.row] = rows[w.matched.row] || { trough: w.trough, cells: {} }).cells[w.matched.col] = w; });
    var grid = '<div class="winmatrix-wrap"><table class="data about-tbl winmatrix"><thead><tr><th>Trough (µg/L)</th>' + cols.map(function (c) { return '<th>' + names[c] + '</th>'; }).join('') + '</tr></thead><tbody>';
    Object.keys(rows).forEach(function (k) {
      var r = rows[k];
      grid += '<tr><td><b>' + r.trough[0] + '–' + r.trough[1] + '</b></td>' + cols.map(function (c) {
        var w = r.cells[c];
        return '<td>' + (w ? '<button type="button" class="secondary" data-winset="' + w.id + '" title="Trough ' + r.trough[0] + '–' + r.trough[1] + ' µg/L with AUC ' + w.auc[0] + '–' + w.auc[1] + ' µg·h/L (' + names[c].replace('&gt;', 'after ') + ')">' + w.auc[0] + '–' + w.auc[1] + '</button>' : '–') + '</td>';
      }).join('') + '</tr>';
    });
    grid += '</tbody></table></div>';
    return out + '<h3>AUC ranges matched to a trough range</h3>' +
      '<p>Pick a trough range and the period after transplantation; the button shows the AUC<sub>0–12h</sub> range (µg·h/L) that goes with it and fills both windows. These are derived by regression of AUC on trough in 2030 routine profiles from 1000 adult kidney recipients on twice-daily tacrolimus, with the AUC itself estimated by Bayesian models (Saint-Marcoux 2013). They are not ranges tested against outcomes. “All periods” is the combination the consensus quotes. A dash means the paper gives no range for that cell.</p>' + grid;
  }

  function background() {
    var CM = ECU.model.spec('tac').custom.assays.cmia;   // the one place the conversion constants live
    return '<p>Tacrolimus has a narrow therapeutic index, and exposure differs a lot between patients and from day to day in the same patient. Whole-blood trough concentrations are the routine measure. The area under the curve over a dosing interval (<b>AUC<sub>0–12h</sub></b>) describes exposure more completely. The IATDMCT consensus report proposes AUC as the best TDM option early after transplantation, when immunosuppression is being minimised, in special populations and in specific clinical situations, and it grades trough targets (C<sub>0</sub>) per patient group.</p>' +
      '<h3>Therapeutic windows</h3>' +
      '<p>The app starts with the <b>standard window for adult kidney recipients</b> (trough 4–12 µg/L, AUC<sub>0–12h</sub> 150–210 µg·h/L; first set below). It is a starting point: change either bound in card 1, pick another set here, or clear a window to get intervals without probabilities. The probabilities are only as meaningful as the window you set.</p>' +
      windowTable() +
      '<p>The standard set’s trough range is a graded consensus recommendation. The AUC lower bound is the consensus’s minimal threshold, a weaker recommendation based on two small studies. The AUC upper bound is the app’s own choice (see its note). The matched AUC ranges above are the consensus’s, calculated from trough ranges and not tested against outcomes.</p>' +
      '<p>For patients at higher immunological risk the consensus says targets may be higher but gives no numbers; enter your protocol’s values. Targets also depend on the co-medication and local practice. For orientation, the centres behind the source model aimed at troughs of 3–7 µg/L (standard risk) and 8–12 µg/L (high risk) in Oslo, and 7–8 µg/L in Brisbane during the first three months. The windows apply to the actual and to the haematocrit-corrected values alike.</p>' +
      '<h3>Haematocrit and the corrected value</h3>' +
      '<p>Tacrolimus is bound to red blood cells. At the same unbound (active) concentration, whole blood reads higher the higher the haematocrit, and haematocrit changes a lot after kidney transplantation (in the source cohort it rose from about 0.30 to about 0.37 over the first weeks). The app reports both the <b>actual</b> whole-blood value and the value <b>corrected to a haematocrit of 0.35</b>: the concentration this patient would show, for the same plasma concentration, at 0.35.</p>' +
      '<p>Example: a patient with a trough of 4.2 µg/L at a haematocrit of 0.25 reads about 5.8 µg/L corrected. The same plasma exposure at 0.40 reads about 6.6 µg/L as measured, and again 5.8 corrected. The correction uses the red-cell binding equation of the model. The simple proportional formula (value × 0.35 / haematocrit) differs from it by 2% or less between 0.20 and 0.50.</p>' +
      '<h3>Assay</h3>' +
      '<p>The model was built on LC-MS/MS concentrations. Abbott CMIA (Architect) values are converted with the model authors’ own equation (LC-MS/MS = ' + CM.m.toFixed(2) + ' × CMIA + ' + CM.b.toFixed(2) + ' µg/L, from one laboratory, 43 sample pairs, 3.6–14.4 µg/L CMIA), and all results are shown back on the scale you choose. Other immunoassays have no conversion in the source and cannot be used. Immunoassays read higher than LC-MS/MS because they cross-react with tacrolimus metabolites.</p>' +
      '<h3>Sampling</h3>' +
      '<table class="data about-tbl"><thead><tr><th>Samples</th><th>What they give the model</th></tr></thead><tbody>' +
      '<tr><td>Predose trough only</td><td>Little beyond the population: the estimate shrinks towards the typical patient.</td></tr>' +
      '<tr><td>Trough plus one sample 1–3 h after the dose</td><td>The absorption phase and the peak, which tells the model far more about the AUC than troughs alone.</td></tr>' +
      '<tr><td>Troughs on several days</td><td>Day-to-day variability can be separated from the patient’s own clearance.</td></tr>' +
      '</tbody></table>' +
      '<p>Enter the exact times of dose and sample and a haematocrit with each sample. Avoid the first 45 minutes after a dose: the model has a 25-minute lag with no variability. A trough drawn 10.5 or 13 h after the dose is fine, because the model predicts the 12-hour value.</p>' +
      '<p><b>One sampling day has a limit.</b> Bioavailability varies about 23% from one day to the next in the same patient. From a single day the model cannot tell how much of a deviation belongs to the patient and how much to that day, so the steady-state AUC is known no better than about ×/÷ 1.4 (5–95%), however many samples that day holds. Two days give about ×/÷ 1.3 and three about ×/÷ 1.2. The intervals in the app show this.</p>' +
      '<p class="src">Størset E, Holford N, Hennig S, et al. Improved prediction of tacrolimus concentrations early after kidney transplantation using theory-based pharmacokinetic modelling. <i>Br J Clin Pharmacol</i> 2014;78(3):509–523. doi:10.1111/bcp.12361.</p>' +
      '<p class="src">Størset E, Holford N, Midtvedt K, et al. Importance of hematocrit for a tacrolimus target concentration strategy. <i>Eur J Clin Pharmacol</i> 2014;70(1):65–77. doi:10.1007/s00228-013-1584-7.</p>' +
      '<p class="src">Brunet M, van Gelder T, Åsberg A, et al. Therapeutic drug monitoring of tacrolimus-personalized therapy: second consensus report. <i>Ther Drug Monit</i> 2019;41(3):261–307. doi:10.1097/FTD.0000000000000640.</p>' +
      '<p class="src">Saint-Marcoux F, Woillard JB, Jurado C, Marquet P. Lessons from routine dose adjustment of tacrolimus in renal transplant patients based on global exposure. <i>Ther Drug Monit</i> 2013;35(3):322–327.</p>' +
      '<p class="src">Størset E, Åsberg A, Skauby M, et al. Improved tacrolimus target concentration achievement using computerized dosing in renal transplant recipients: a prospective, randomized study. <i>Transplantation</i> 2015;99(10):2158–2166. doi:10.1097/TP.0000000000000708.</p>';
  }

  function gettingStarted() {
    return '<p>For one adult kidney transplant recipient on immediate-release tacrolimus twice daily, this tool estimates the <b>steady-state AUC<sub>0–12h</sub> and trough</b> with 5–95% intervals, from the covariates and the concentrations you enter. Both are shown as measured (actual whole blood) and corrected to a haematocrit of 0.35. Nothing you type leaves this device. Work through the four cards in order.</p>' +
      '<ol class="gs-steps">' +
      '<li><b>Patient &amp; covariates.</b> Choose tacrolimus. Enter weight, height and sex (they give the fat-free mass the model scales to), the prednisolone dose in mg/day (0 if none), the haematocrit in L/L (0.33, not 33), and the assay the concentrations come from. CYP3A5 genotype is optional: if it is unknown, the app assumes a non-expresser. The two therapeutic windows start at the standard for adult kidney recipients; change or clear them as you need (without a window the app gives intervals but no probabilities).</li>' +
      '<li><b>Dosing schedule &amp; measured concentrations.</b> Choose <b>Full schedule</b> to enter the actual doses, or <b>Steady state</b> for a stable regimen (dose, interval, time of the latest dose). Doses are in mg of tacrolimus. Add the samples with their exact times and haematocrit. A trough plus one sample 1–3 h after the dose tells the model much more than troughs alone. The app is meant for use some days after transplantation: the model leaves out the extra absorption of the first day, so a result from the first week or two is biased upward.</li>' +
      '<li><b>Forecast.</b> Press <b>Run forecast</b>. You get the steady-state AUC<sub>0–12h</sub> and trough of the current regimen on a typical day (a single day varies around that by about 23%), each with a 5–95% interval, as measured and corrected. With windows set, you also get the probability that the exposure lies inside, above or below them. These are predictions, not recommendations.</li>' +
      '<li><b>Dose explorer</b> (optional). After a forecast, this card shows what a different dose, at the same 12-hour interval, would do for this patient at steady state, using the fit you already have. It does not select or recommend a dose.</li>' +
      '</ol>' +
      '<p><b>When you are done:</b> <b>Print report</b> builds a one-page summary and <b>Export session</b> saves the case as a file. If you close the tab by accident, reopening the app offers to restore your work.</p>' +
      '<p class="src">Sampling guidance and the windows are explained in the background dialog. The model and its limits are in <b>About</b>.</p>';
  }

  function aboutSections() {
    return '<h3>What this app estimates for tacrolimus</h3>' +
      '<p>For an adult kidney transplant recipient on immediate-release tacrolimus twice daily: the steady-state whole-blood AUC<sub>0–12h</sub> and trough of the current regimen on a typical day. They come from a population PK model and the samples entered, each as a median with a 5–95% interval, as measured (actual) and corrected to a haematocrit of 0.35. If you set windows, you also get the probability of lying inside, above or below each. In the source study the AUC was not evaluated externally: its external evaluation used troughs in the first three weeks after transplantation.</p>' +
      '<h3>What it does not cover</h3>' +
      '<ul class="about-list">' +
      '<li>Prolonged-release tacrolimus (once daily), children, and recipients of other organs.</li>' +
      '<li>The first days after transplantation. The model’s first-day bioavailability effect is left out, so on day 4 the real trough of a typical patient is about 20–50% higher than the model expects and the steady-state AUC is overestimated. On day 7 the gap is about 5–15%, and after two weeks 1% or less.</li>' +
      '<li>Renal and liver function, age, interacting drugs (CYP3A and P-glycoprotein inhibitors and inducers), food and adherence. None of these is in the model. A stable interaction is absorbed by the patient’s own clearance; one that starts or stops inside the entered history is not.</li>' +
      '<li>Results below the limit of quantification. A result reported as “&lt; LLOQ” cannot be used, so omit it.</li>' +
      '</ul>' + referenceSections();
  }

  /* About: reference values and practical background, built from the spec so the numbers are the ones the app uses. */
  function referenceSections() {
    var sp = ECU.model.spec('tac'), H = sp.custom.constants.HCT_REF, CM = sp.custom.assays.cmia, rows = '', mrows = '';
    sp.windowSets.filter(function (w) { return !w.matched; }).forEach(function (w) {
      rows += '<tr><td>' + w.label + (w.id === sp.windowStandard ? ' (the app starts here)' : '') + '</td><td>' + w.trough[0] + '–' + w.trough[1] + '</td><td>' + (w.auc ? w.auc[0] + '–' + w.auc[1] : 'none given') + '</td><td>' + w.grade + '</td></tr>';
    });
    sp.windowSets.filter(function (w) { return w.matched && w.matched.col === 'all'; }).forEach(function (w) {
      mrows += '<tr><td>' + w.trough[0] + '–' + w.trough[1] + '</td><td>' + w.auc[0] + '–' + w.auc[1] + '</td></tr>';
    });
    return '<h3>Reference values for tacrolimus (adult kidney recipients, twice-daily immediate-release)</h3>' +
      '<p>From the IATDMCT second consensus report (Brunet 2019). The windows are starting points that you can change or clear; the Tacrolimus background dialog has the same sets with a “Use this window” button each. µg/L is the same as ng/mL.</p>' +
      '<div class="winmatrix-wrap"><table class="data about-tbl"><thead><tr><th>Setting</th><th>Trough (µg/L)</th><th>AUC<sub>0–12h</sub> (µg·h/L)</th><th>Grade</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
      '<ul class="about-list">' +
      '<li><b>Standard immunological risk:</b> the trough range 4–12 is a graded consensus recommendation, and the report prefers troughs above 7. The AUC lower bound of 150 is the report’s minimal threshold, a weaker recommendation that rests on two small studies. The upper bound of 210 is the app’s own choice, the top of the AUC range the report pairs with a trough of 8–12.</li>' +
      '<li><b>Higher immunological risk:</b> the report says targets may be higher but gives no numbers. Enter your protocol’s values.</li>' +
      '<li><b>With everolimus:</b> reduced-exposure tacrolimus, trough 4–7 in months 0–2 and 2–4 afterwards. The report gives no AUC range for this combination.</li>' +
      '<li><b>Trough-matched AUC ranges</b> (derived, not tested against outcomes): regression of the Bayesian-estimated AUC on the trough in 2030 routine profiles from 1000 adult kidney recipients (Saint-Marcoux 2013), combined over the three periods after transplantation as the report quotes them. The per-period ranges are in the background dialog.</li>' +
      '</ul>' +
      '<div class="winmatrix-wrap"><table class="data about-tbl"><thead><tr><th>Trough (µg/L)</th><th>AUC<sub>0–12h</sub> (µg·h/L), all periods</th></tr></thead><tbody>' + mrows + '</tbody></table></div>' +
      '<h3>Haematocrit, assay and sampling</h3>' +
      '<ul class="about-list">' +
      '<li><b>Haematocrit:</b> tacrolimus sits in red cells, so whole blood reads higher at a higher haematocrit for the same plasma concentration, and haematocrit changes after transplantation (in the source cohort from about 0.30 to about 0.37 over the first weeks). The app reports the measured value and the value corrected to ' + H + '. The same windows apply to both.</li>' +
      '<li><b>Assay:</b> LC-MS/MS, or Abbott CMIA converted with the model authors’ equation (LC-MS/MS = ' + CM.m.toFixed(2) + ' × CMIA + ' + CM.b.toFixed(2) + ' µg/L, one laboratory, 43 pairs, 3.6–14.4 µg/L CMIA). Other immunoassays cannot be used.</li>' +
      '<li><b>Sampling:</b> a predose trough plus one sample 1–3 h after the dose tells the model much more about the AUC than troughs alone. Enter exact times and a haematocrit with each sample, and avoid the first 45 minutes after a dose (the model has a 25-minute lag). One sampling day cannot fix the steady-state AUC better than about ×/÷ 1.4; two days give about ×/÷ 1.3.</li>' +
      '</ul>' +
      '<h3>Why model-based estimation</h3>' +
      '<p>The consensus proposes AUC as the best TDM option early after transplantation, when immunosuppression is being minimised, in special populations and in specific clinical situations. Estimating it from a population model plus the samples you enter lets you use the sample times you actually have, not a fixed schedule, handles the haematocrit, and returns an interval rather than a single number.</p>' +
      '<p class="src">Brunet M, van Gelder T, Åsberg A, et al. <i>Ther Drug Monit</i> 2019;41(3):261–307. Saint-Marcoux F, Woillard JB, Jurado C, Marquet P. <i>Ther Drug Monit</i> 2013;35(3):322–327. Størset E, Holford N, Hennig S, et al. <i>Br J Clin Pharmacol</i> 2014;78(3):509–523.</p>';
  }

  /* Extra rows for the model card (About → Models), straight from the spec constants. */
  function cardRows(sp) {
    var C = sp.custom.constants;
    function cv(x) { return Math.round(x * 100) + '%'; }
    return [
      ['ka (1/h)', C.KA, 'BOV ' + cv(C.CV_KKA)],
      ['tlag (h)', C.TLAG, '–'],
      ['F: prednisolone', 'Emax ' + Math.round(C.PRED_EMAX * 100) + '%, half-maximal at ' + C.PRED_50 + ' mg/day', 'BOV ' + cv(C.CV_KF)],
      ['CYP3A5 expresser', 'CL ×' + C.CYP_CL + ', F ×' + C.CYP_F, '–'],
      ['Red-cell binding', 'Bmax ' + C.BMAX + ' µg/L erythrocytes, KD ' + C.KD + ' µg/L plasma', '–'],
      ['Residual error (proportional)', cv(Math.sqrt(C.PROP)), '–']
    ];
  }

  ECU.tacText = { background: background, gettingStarted: gettingStarted, aboutSections: aboutSections, cardRows: cardRows };
  (ECU.drugTexts = ECU.drugTexts || {}).tac = ECU.tacText;
})(typeof window !== 'undefined' ? window : globalThis);
