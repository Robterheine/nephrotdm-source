/* =========================================================================
 * NephroTDM: pediatric mycophenolic acid texts (background, getting started, About, results, report)
 *
 * Registered as ECU.drugTexts.mpaped; ui.js and diagnostics.js ask the registry, no shared string names a drug.
 * Rules for this file (README rule 6, docs/HANDOFF_PEDIATRIC.md section 10):
 *  - no sentence reads as a dose or interval recommendation (the improved starting-dose table of Heida 2024, Table 3, is not used);
 *  - every number traces to Heida 2024 (Table 2), Heida 2026 (Tables 2, 4, 5 and 7), the IATDMCT consensus (Bergan 2021), or is computed from the model;
 *  - the estimate describes the sampled day, and the text says so;
 *  - no em-dashes.
 * Status: first draft by the coder; clinical pharmacologist and owner review (gate G6) still to come.
 * ========================================================================= */
(function (root) {
  'use strict';
  var ECU = root.ECU = root.ECU || {};
  ECU.drugTexts = ECU.drugTexts || {};

  function spec() { return ECU.model.spec('mpaped'); }

  var SCOPE = 'Children with a kidney transplant on mycophenolate mofetil (CellCept) together with tacrolimus or everolimus. Not for ciclosporin co-medication, for EC-MPS or for other indications. Built on children aged 4–18 years, weight 13–80 kg and albumin 24–42 g/L, with a median of 9.5 days after transplantation. Enter the MMF dose as mg of MMF.';
  var SAMPLED_DAY = 'The reported AUC is for a typical day on this regimen, estimated from the samples. The AUC of a single day can differ from it by a factor of about 1.2 to 1.3 (one standard deviation). Exposure changes from day to day and over months. In a small prospective evaluation (29 children enrolled), the AUC predicted from one occasion did not match the AUC measured about three months later. The authors conclude that repeated monitoring is needed.';

  function background() {
    return '<p>' + SCOPE + ' Mycophenolic acid (MPA) exposure differs a lot between children and changes with weight and with serum albumin. The model-based <b>AUC<sub>0–12h</sub></b> is estimated from the samples you enter, with an interval; the trough is shown for information.</p>' +
      '<h3>Reference values</h3>' +
      '<div class="winset std"><div class="winset-head"><b>Kidney transplantation, AUC<sub>0–12h</sub></b> <span class="badge info">standard</span></div>' +
      '<div class="winset-nums">AUC<sub>0–12h</sub> <b>30–60</b> mg·h/L</div>' +
      '<div class="src">' + spec().windowSets[0].basis + '</div>' +
      '<button type="button" class="secondary" data-winset="kidney-ped" title="Put this window in card 1">Use this window</button></div>' +
      '<p>The app starts with this window; change either bound in card 1 or clear it. For nephrotic syndrome, Heida 2026 (Table 2) lists an AUC above 50 mg·h/L. The model was built on children with a kidney transplant, not with nephrotic syndrome, and these children usually have a low albumin (the model was built on 24 to 42 g/L), where the estimate is least reliable. The app takes a lower and an upper bound: type 50 as the lower bound and read the chance of exceeding it from “Above the lower bound”; the upper bound can be any value. The probabilities are only as meaningful as the window you set. The app has no trough target; the predicted trough is informational.</p>' +
      '<h3>Albumin</h3>' +
      '<p>In this model clearance rises steeply when albumin is low (clearance is proportional to albumin to the power −2.49, around 34 g/L). Illustration of the albumin effect, not a dose guide: for a typical 38.5 kg child on 600 mg of MMF twice daily, the model gives an AUC of 59 mg·h/L at albumin 34 g/L and 36 mg·h/L at 28 g/L. Enter the albumin in g/L (34, not 3.4 g/dL). Outside 24–42 g/L, the range of the development data, the estimate is less reliable and a warning is shown.</p>' +
      '<h3>Dose and concentration units</h3>' +
      '<p>Doses are mg of mycophenolate mofetil (MMF) per administration and concentrations are mg/L of mycophenolic acid. The model already contains the conversion from MMF to MPA, so the app applies none. Enteric-coated mycophenolate sodium (EC-MPS) was not in the data and is not covered.</p>' +
      '<h3>Assay</h3>' +
      '<p>The model was built on concentrations measured with an EMIT immunoassay (Cobas) in plasma. Use the same assay. EMIT reads higher than chromatographic methods because it also detects the acyl glucuronide metabolite, so an AUC on the EMIT scale is not directly comparable with an AUC measured by LC-MS/MS. The app has no assay field and no conversion.</p>' +
      '<h3>Sampling</h3>' +
      '<table class="data about-tbl"><thead><tr><th>Samples</th><th>What the authors’ evaluation showed</th></tr></thead><tbody>' +
      '<tr><td>0, 1 and 2 hours after the dose</td><td>Within the authors’ limit of 25% for bias and imprecision: mean prediction error 0.1%, normalised root mean squared error (a typical individual error) 21.0%; 84% of the estimates were within 30% of the reference.</td></tr>' +
      '<tr><td>Trough only</td><td>Less accurate and above the limit: 6.6% and 32.5%.</td></tr>' +
      '</tbody></table>' +
      '<p>The reference was the AUC from the full profile estimated with the same model, in the same children the model was built on (20 profiles).</p>' +
      '<p>Enter the exact times of dose and samples. Results below the limit of quantification cannot be used: leave them out.</p>' +
      '<h3>What the estimate means</h3>' +
      '<p>' + SAMPLED_DAY + ' Each day with a sample gets its own bioavailability effect in the model, so samples from different days are not forced to agree.</p>' +
      '<p class="src">Heida A, Jager NGL, Aarnoutse RE, et al. Model-informed dose optimization of mycophenolic acid in pediatric kidney transplant patients. <i>Eur J Clin Pharmacol</i> 2024;80:1761–1771. doi:10.1007/s00228-024-03743-0.</p>' +
      '<p class="src">Heida A, Cornelissen EAM, Aarnoutse RE, et al. Structured evaluation of model-informed precision dosing of mycophenolic acid and tacrolimus in pediatric patients with kidney disease. <i>Clin Pharmacokinet</i> 2026. doi:10.1007/s40262-026-01708-3.</p>' +
      '<p class="src">Bergan S, Brunet M, Hesselink DA, et al. Personalized therapy for mycophenolate: consensus report by the International Association of Therapeutic Drug Monitoring and Clinical Toxicology. <i>Ther Drug Monit</i> 2021;43(2):150–197.</p>';
  }

  function gettingStarted() {
    return '<p>For one child with a kidney transplant on twice-daily mycophenolate mofetil, this tool estimates the <b>steady-state AUC<sub>0–12h</sub></b> with a 5–95% interval, from the covariates and the concentrations you enter, and shows the trough for information. Nothing you type leaves this device. Work through the cards in order.</p>' +
      '<ol class="gs-steps">' +
      '<li><b>Patient &amp; covariates.</b> Choose mycophenolic acid (pediatric kidney). Enter the weight in kg and the serum albumin in g/L (34, not 3.4). The AUC window starts at 30–60 mg·h/L, the kidney-transplant range.</li>' +
      '<li><b>Dosing schedule &amp; measured concentrations.</b> Choose <b>Full schedule</b> to enter the actual doses, or <b>Steady state</b> for a stable regimen (dose, interval, time of the latest dose). Doses are in mg of MMF per administration. Add the samples with their exact times. A sample is optional: without one you get the model’s typical child for these covariates, with a wide interval.</li>' +
      '<li><b>Estimate.</b> Press <b>Run forecast</b> (the button has this name for every drug). You get the steady-state AUC<sub>0–12h</sub> of the current regimen with a 5–95% interval and, against the window, the probability that it lies inside, above or below. These are estimates from the samples of one occasion, not predictions of later exposure and not recommendations.</li>' +
      '<li><b>Dose explorer</b> (optional). After a forecast, this card shows the exposure the model gives for a different dose, at the same 12-hour interval, at steady state, using the fit you already have. It assumes the state of the sampled day continues and says nothing about later days. It does not select or recommend a dose.</li>' +
      '</ol>' +
      '<p><b>When you are done:</b> <b>Print report</b> builds a one-page summary and <b>Export session</b> saves the case as a file. If you close the tab by accident, reopening the app offers to restore your work.</p>' +
      '<p class="src">The window and sampling are explained in the background dialog. The model and its limits are in <b>About</b>.</p>';
  }

  function aboutSections() {
    return '<h3>What this app estimates for mycophenolic acid in children</h3>' +
      '<p>' + SCOPE + ' The steady-state AUC<sub>0–12h</sub> of the current regimen, as a median with a 5–95% interval, with the probability of lying inside, above or below your window, and the predicted trough for information.</p>' +
      '<h3>How well did the model do</h3>' +
      '<p>The model authors evaluated this model in children with kidney disease (Heida 2026). With samples at 0, 1 and 2 hours after the dose, the AUC of the same day was estimated with a mean prediction error of 0.1% and a normalised root mean squared error of 21.0%; with a trough only, 6.6% and 32.5%. The first is within the authors’ limit of 25%, the second is not. The reference was the AUC from the full profile estimated with the same model, in the same children the model was built on.</p>' +
      '<p>Predicting the AUC at the next occasion, about three months later, was not precise enough: the mean prediction error was 15.4% and the normalised root mean squared error 48.6%, above the authors’ limit of 25%. <b>' + SAMPLED_DAY + '</b> The intervals describe the uncertainty about this patient on the days sampled. The day-to-day effect of the model is included for those days only.</p>' +
      '<p>In simulations with the model itself, the AUC of a single day differed from the typical-day value by a factor of about 1.2 to 1.3 (one standard deviation; about 1.3 to 1.6 for the middle 90%), and on average lay 0 to 7% above it.</p>' +
      '<h3>What it does not cover</h3>' +
      '<ul class="about-list">' +
      '<li>Ciclosporin co-medication (the authors state the model might not be extrapolated to it), EC-MPS and other indications.</li>' +
      '<li>Children outside weight 13–80 kg or albumin 24–42 g/L (a warning is shown), and weight outside 3–200 kg or albumin outside 5–50 g/L (refused). The albumin effect is steep: for the same dose the typical AUC is about eight times lower at 15 g/L than at 34 g/L.</li>' +
      '<li>Nephrotic syndrome, which was not in the development data.</li>' +
      '<li>Enterohepatic recirculation, which is not modelled; the authors note that secondary peaks may be fitted poorly.</li>' +
      '<li>Results below the limit of quantification. A result reported as “&lt; LLOQ” cannot be used, so omit it.</li>' +
      '</ul>' + referenceSections();
  }

  function referenceSections() {
    return '<h3>Reference values for mycophenolic acid (kidney transplantation)</h3>' +
      '<div class="winmatrix-wrap"><table class="data about-tbl"><thead><tr><th>Setting</th><th>AUC<sub>0–12h</sub> (mg·h/L)</th><th>Source</th></tr></thead><tbody>' +
      '<tr><td>Kidney transplantation (the app starts here)</td><td>30–60</td><td>' + spec().windowSets[0].grade + '</td></tr>' +
      '</tbody></table></div>' +
      '<h3>Why model-based estimation</h3>' +
      '<p>A model-based estimate works with the sample times you actually have, takes weight and albumin into account, and gives the AUC with an interval from one fit.</p>' +
      '<p class="src">Heida A, et al. <i>Eur J Clin Pharmacol</i> 2024;80:1761–1771. Heida A, et al. <i>Clin Pharmacokinet</i> 2026, doi:10.1007/s40262-026-01708-3. Bergan S, et al. <i>Ther Drug Monit</i> 2021;43(2):150–197.</p>';
  }

  function modelTable(sp) {
    var C = sp.custom.constants;
    var cv = function (v) { return v + ' (CV ' + (Math.sqrt(Math.exp(v) - 1) * 100).toFixed(1) + '%)'; };
    var rows = [
      ['CL/F (L/h at 70 kg, albumin 34 g/L)', C.CL + '; × (albumin/34)^' + C.ALB_EXP, cv(C.OM_CL)],
      ['Vc/F, central volume (L at 70 kg)', C.VC, cv(C.OM_VC) + ' (large, poorly identified)'],
      ['Vp/F, peripheral volume (L at 70 kg)', C.VP, '–'],
      ['Q/F (L/h at 70 kg)', C.Q, cv(C.OM_Q)],
      ['Transfer rate KTR (per hour at 70 kg)', C.KTR + ' (two equal first-order steps; the paper counts one transit compartment); × (weight/70)^−0.25', '–'],
      ['Between-occasion variability of bioavailability', 'one effect per sampled day, up to ' + C.MAX_OCC, cv(C.OM_OCC)],
      ['Weight scaling', 'clearances and Q × (weight/70)^0.75, volumes × (weight/70)', '–'],
      ['Residual error (proportional)', 'variance ' + C.SIGMA_PROP, '–']
    ];
    var esc = function (s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); };
    return '<table class="about-tbl"><thead><tr><th>Parameter</th><th>Typical value</th><th>Variance</th></tr></thead><tbody>' +
      rows.map(function (r) { return '<tr><td>' + esc(r[0]) + '</td><td>' + esc(r[1]) + '</td><td>' + esc(r[2]) + '</td></tr>'; }).join('') + '</tbody></table>';
  }

  var HELP = {
    wt: 'Body weight in kg. Clearance and the transfer rates scale with weight, volumes in proportion. The model was built on children of 12.9–79.9 kg; outside that range a warning is shown.',
    window: 'Lower and upper bound of the AUC0–12h window (mg·h/L), the AUC over a 12-hour dosing interval at steady state. It starts at the kidney-transplant range 30–60. Dosing at another interval is compared as its 12-hour equivalent. Clear the window to see the interval without probabilities.',
    ivexplore: 'Show the exposure the model gives for a dose of MMF you enter, at steady state, every 12 h, using this patient’s fitted posterior: the AUC0–12h and trough, with the probabilities against your window. It is a what-if for the day of the samples; exposure three months later could not be predicted in the authors’ evaluation.'
  };

  ECU.drugTexts.mpaped = {
    background: background, gettingStarted: gettingStarted, aboutSections: aboutSections, modelTable: modelTable,
    modelNote: 'Doses are MMF in mg, concentrations are mycophenolic acid in mg/L; the conversion is part of the model. Structure as in the authors’ run 57 with the values of the article; estimated with NONMEM FOCE-I.',
    doseNote: 'Twice-daily mycophenolate mofetil (CellCept) in children with a kidney transplant, with tacrolimus or everolimus. Dose in mg of MMF, not mg of mycophenolic acid. Not for ciclosporin co-medication or EC-MPS.',
    chartNote: 'Individual = this patient’s measured levels · red points = measurements. The curve is plasma MPA on the current regimen; the reported steady-state values are for the regimen at steady state. The window is shown in the results grid, not on this plot. Time axis in hours after the last dose.',
    howto: '<li><b>Steady-state AUC₀–12h:</b> the model’s estimate for the current regimen, with a 5–95% interval. The interval covers the uncertainty in this patient’s parameters on the sampled days; a later measurement scatters more than that.</li>' +
      '<li><b>Probability in window:</b> the chance that the AUC lies between your lower and upper bound.</li>' +
      '<li><b>Trough:</b> predicted for information; the app has no trough target.</li>' +
      '<li><b>Band (5–95%):</b> 90% plausible range for the true concentration curve. It does not include assay error, so a future measured value may fall outside it.</li>',
    help: HELP,
    shrinkNote: '<p class="legend-note"><b>Note:</b> the samples barely moved this patient’s clearance estimate, so the interval largely reflects population variability. Samples at 0, 1 and 2 hours after the dose add information.</p>',
    resultNote: function (fit, h) {
      return '<div class="legend-note">Steady-state values for the current regimen on a typical day. ' + SAMPLED_DAY + '</div>';
    },
    explorerSub: function () { return 'every 12 h, at steady state'; },
    explorerNote: 'This is a what-if for the day of the samples: the exposure the model gives for the dose you enter, at steady state. In the authors’ evaluation, exposure three months later could not be predicted. It does not select or recommend a dose.',
    reportPatient: function (c) {
      var ex = c.ex;
      return '<h2>Patient</h2><table class="data">' +
        '<tr><th>ID</th><td>' + c.esc(c.pid) + '</td><th>Weight</th><td>' + c.esc(c.wt || ex.wt || '–') + ' kg</td></tr>' +
        '<tr><th>Albumin</th><td>' + c.esc(ex.albumin || '–') + ' g/L</td><th>Assay</th><td>EMIT (model basis)</td></tr></table>';
    },
    reportNote: function (fit, h) {
      return 'Steady state of the current regimen on a typical day. ' + SAMPLED_DAY;
    },
    diagNote: 'The central volume (Vc) is expected to be poorly informed; the AUC depends on clearance, not on the volumes.'
  };
})(typeof window !== 'undefined' ? window : globalThis);
