/* =========================================================================
 * MPA TDM — individual fit diagnostics
 *
 * Reuses the same “pure functions over the runFit result” pattern as the
 * complement app. MPA specifics:
 *   - residual bands come from the drug’s residual error model,
 *   - concentration units are mg/L throughout,
 *   - the summary hint is about AUC uncertainty and therapeutic-window
 *     informativeness, not about trough attainment.
 * ========================================================================= */
(function (root) {
  'use strict';
  var ECU = root.ECU = root.ECU || {};

  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function fmtC(v) {
    if (!isFinite(v)) return '–';
    if (v >= 100) return String(Math.round(v));
    if (v >= 10) return v.toFixed(1);
    return v.toFixed(2);
  }
  function relLevel(r) { var a = Math.abs(r); return a <= 0.3 ? 'ok' : (a <= 0.6 ? 'warn' : 'bad'); }

  /* F18: for the log-error model the residual is judged in units of σ (green ≤ 1.5σ, amber ≤ 2.5σ,
   * red beyond) so the colour means what the legend says: about 1 ordinary sample in 100 is red.
   * Legacy natural-scale error models keep the fixed 30 % / 60 % rule. */
  var Z_AMBER = 1.5, Z_RED = 2.5;
  function unitsOfFit(fit) {
    var m = root.ECU && root.ECU.model, sp = (m && fit && fit.drug) ? m.spec(fit.drug) : null;
    var u = (sp && sp.units) || { conc: 'mg/L', auc: 'mg·h/L' };
    var cm = fit && fit.assay === 'cmia' ? ', CMIA scale' : '';
    return { conc: u.conc + cm, auc: u.auc + cm, tac: !!(sp && sp.custom) };
  }
  function diagNoteOf(fit) {
    var tx = root.ECU && root.ECU.drugTexts && fit && fit.drug ? root.ECU.drugTexts[fit.drug] : null;
    return tx && tx.diagNote ? tx.diagNote : '';
  }
  function proportionalCv(fit) {
    var m = root.ECU && root.ECU.model, sp = (m && fit && fit.drug) ? m.spec(fit.drug) : null;
    return (sp && sp.SIGMA && !(sp.SIGMA.LOG > 0) && sp.SIGMA.PROP > 0) ? Math.sqrt(sp.SIGMA.PROP) : 0;
  }
  function sigmaLogOf(fit) {
    var m = root.ECU && root.ECU.model, sp = (m && fit && fit.drug) ? m.spec(fit.drug) : null;
    return (sp && sp.SIGMA && sp.SIGMA.LOG > 0) ? sp.SIGMA.LOG : 0;
  }
  function zLevel(z) { var a = Math.abs(z); return a <= Z_AMBER ? 'ok' : (a <= Z_RED ? 'warn' : 'bad'); }
  function residualLegend(fit) {
    var sg = sigmaLogOf(fit), pc = proportionalCv(fit);
    if (!sg && pc) {
      return '<span class="sk-ok">Green ≤ ' + Z_AMBER + ' SD</span> (within ±' + Math.round(Z_AMBER * pc * 100) + '% of the prediction) · ' +
        '<span class="sk-warn">amber ' + Z_AMBER + '–' + Z_RED + ' SD</span> · <span class="sk-bad">red &gt; ' + Z_RED + ' SD (beyond ±' + Math.round(Z_RED * pc * 100) +
        '%)</span>, proportional error ' + (pc * 100).toFixed(1) + '%';
    }
    if (!sg) {
      return '<span class="sk-ok">Green ≤ 30%</span> (within assay + model noise) · ' +
        '<span class="sk-warn">amber 30–60%</span> · <span class="sk-bad">red &gt; 60%</span>';
    }
    return '<span class="sk-ok">Green ≤ ' + Z_AMBER + ' σ</span> (within ×/÷ ' + Math.exp(Z_AMBER * sg).toFixed(1) + ' of the prediction) · ' +
      '<span class="sk-warn">amber ' + Z_AMBER + '–' + Z_RED + ' σ</span> · <span class="sk-bad">red &gt; ' + Z_RED + ' σ (beyond ×/÷ ' +
      Math.exp(Z_RED * sg).toFixed(1) + ')</span>, σ = ' + sg + ' on the log scale';
  }

  function residualRows(fit) {
    if (!fit || !fit.obsData) return [];
    var sg = sigmaLogOf(fit);
    return fit.obsData.map(function (o, i) {
      var row = { i: i, t: o.t, c: o.c, ipred: NaN, rel: NaN, level: '' };
      var ip = o.ipred;
      if (!isFinite(ip) || ip <= 0) { row.level = 'bad'; return row; }
      row.ipred = ip;
      row.rel = (o.c - ip) / ip;
      var pcv = proportionalCv(fit);
      row.level = sg ? (o.c > 0 ? zLevel(Math.log(o.c / ip) / sg) : 'bad') : (pcv ? zLevel(row.rel / pcv) : relLevel(row.rel));
      return row;
    });
  }

  function gofChart(fit, spec) {
    var obs = (fit.obsData || [])
      .map(function (o, i) { return Object.assign({}, o, { i: i }); })
      .filter(function (o) { return isFinite(o.ipred) && o.ipred > 0; });
    if (!obs.length) return null;
    var pts = obs.map(function (o) { return { x: o.ipred, y: o.c }; });
    var xs = pts.map(function (p) { return p.x; }).concat(pts.map(function (p) { return p.y; }));
    var hi = Math.max.apply(null, xs);
    var lo = Math.min.apply(null, xs);
    var pad = (hi - lo) * 0.08 + hi * 0.04;
    var top = hi + pad;
    var SIG = spec.SIGMA;
    var bx = [], bLo = [], bHi = [];
    for (var k = 0; k <= 20; k++) {
      var v = lo + (top - lo) * k / 20;
      bx.push(v);
      if (!(SIG.LOG > 0) && SIG.PROP > 0 && !(SIG.ADD > 0)) {   // purely proportional error (tacrolimus): ±2 SD = ±2·CV
        var cvp = Math.sqrt(SIG.PROP);
        bLo.push(Math.max(0, v * (1 - 2 * cvp))); bHi.push(v * (1 + 2 * cvp));
      } else if (SIG.LOG > 0) {   // F5: additive error on ln C → a multiplicative, visibly asymmetric ±2 SD envelope
        bLo.push(v * Math.exp(-2 * SIG.LOG)); bHi.push(v * Math.exp(2 * SIG.LOG));
      } else {
        var sd = Math.sqrt(SIG.ADD + SIG.PROP * v * v);
        bLo.push(Math.max(0, v - 2 * sd)); bHi.push(v + 2 * sd);
      }
    }
    return {
      title: 'Observed vs individual predicted concentration',
      xMax: top, yMax: top,
      xLabel: 'Individual predicted concentration (' + unitsOfFit(fit).conc + ')',
      yLabel: 'Observed concentration (' + unitsOfFit(fit).conc + ')',
      bands: [{
        x: bx, lo: bLo, hi: bHi,
        fill: 'rgba(14,116,144,0.10)'
      }],
      series: [{ x: [0, top], y: [0, top], color: '#0e7490', width: 2 }],
      points: obs.map(function (o) {
        return { x: o.ipred, y: o.c, color: '#155e75' };
      }),
      legend: [
        { label: 'measurement', color: '#155e75', swatch: 'dot' },
        { label: 'identity', color: '#0e7490', swatch: 'line' },
        { label: '±2 SD', color: 'rgba(14,116,144,0.10)', swatch: 'band' }
      ]
    };
  }

  function summaryHintTac(fit) {
    var u = unitsOfFit(fit), parts = [];
    var a = fit.auc, t = fit.trough;
    parts.push('Steady-state AUC0–12h ' + fmtC(a.median) + ' ' + u.auc + ' (5–95% ' + fmtC(a.p5) + ' to ' + fmtC(a.p95) + '); corrected to haematocrit ' + fit.hctRef + ': ' + fmtC(fit.aucCorr.median) + ' (' + fmtC(fit.aucCorr.p5) + ' to ' + fmtC(fit.aucCorr.p95) + ').');
    parts.push('Steady-state trough ' + fmtC(t.median) + ' ' + u.conc + ' (5–95% ' + fmtC(t.p5) + ' to ' + fmtC(t.p95) + '); corrected: ' + fmtC(fit.troughCorr.median) + ' (' + fmtC(fit.troughCorr.p5) + ' to ' + fmtC(fit.troughCorr.p95) + ').');
    if (fit.windowSet && isFinite(a.pInWindow)) parts.push('Probability of the AUC within its window: ' + Math.round(a.pInWindow * 100) + '%.');
    if (fit.troughWin && fit.troughWin.set && isFinite(t.pInWindow)) parts.push('Probability of the trough within its window: ' + Math.round(t.pInWindow * 100) + '%.');
    if (!fit.hasObs) parts.push('No measurements entered: this is the population forecast for the covariates given.');
    if (fit.acceptance != null && isFinite(fit.acceptance)) parts.push('MCMC acceptance ' + (fit.acceptance * 100).toFixed(0) + '%.');
    return parts.join(' ');
  }
  function summaryHint(fit) {
    if (fit && unitsOfFit(fit).tac) return summaryHintTac(fit);
    if (!fit || !fit.hasObs) return 'No measurements fitted yet. The result is a population forecast until samples are added.';
    var auc = fit.auc;
    var parts = [];
    if (!isFinite(auc.median)) {
      parts.push('The AUC0–12h could not be summarized from the posterior.');
    } else {
      var tau = (fit.intervalHours != null ? fit.intervalHours : 12);
      if (tau === 12) {
        parts.push('Estimated AUC0–12h ' + fmtC(auc.median) + ' mg·h/L, 5–95% interval ' +
          fmtC(auc.p5) + ' to ' + fmtC(auc.p95) + ' mg·h/L.');
      } else {
        parts.push('Estimated AUC0–12h equivalent ' + fmtC(auc.median) + ' mg·h/L, 5–95% interval ' +
          fmtC(auc.p5) + ' to ' + fmtC(auc.p95) + ' mg·h/L' +
          (fit.aucRaw && isFinite(fit.aucRaw.median)
            ? ' (as-simulated AUC0–' + tau + 'h ' + fmtC(fit.aucRaw.median) + ' mg·h/L, × 12/' + tau + ')'
            : ' (normalized from the AUC0–' + tau + 'h dosing interval)') + '.');
      }
      if (isFinite(auc.pInWindow)) {
        parts.push('Probability within the chosen therapeutic window: ' + Math.round(auc.pInWindow * 100) + '%.');
      }
      if (fit.aucAnchorShifted) {
        parts.push('The AUC window is anchored at the most recent morning dose (EC-MPS targets refer to morning-dose profiles); an evening-anchored window would read lower.');
      }
    }
    if (!isFinite(fit.trough.median)) {
      parts.push('Predicted trough could not be summarized.');
    } else {
      parts.push('Predicted trough ' + fmtC(fit.trough.median) + ' mg/L, 5–95% interval ' +
        fmtC(fit.trough.p5) + ' to ' + fmtC(fit.trough.p95) + ' mg/L. There is no trough target in this app; it is shown for context only.');
    }
    if (fit.acceptance != null && isFinite(fit.acceptance)) {
      parts.push('MCMC acceptance ' + (fit.acceptance * 100).toFixed(0) + '%.');
    }
    return parts.join(' ');
  }

  /* F3: a typed dosing history shorter than 5 terminal half-lives is not steady state. */
  function shortHistoryNote(fit) {
    if (!fit || !fit.warnShortHistory) return '';
    return 'The entered dosing history spans ' + Math.round(fit.historySpanH) + ' h; steady state needs about ' +
      Math.round(fit.historyNeedH) + ' h (5 terminal half-lives). This AUC describes the entered doses from zero and can read ' +
      'materially low (typical patient: about −26 % after 2 days, −8 % after 5). Add the earlier doses or use “Steady state” mode.';
  }

  /* F7: one shared sentence for the badge, the panel and the printed report. */
  function convergenceNote(fit) {
    var c = fit && fit.convergence;
    if (!c || c.ok) return '';
    function f(v, d) { return isFinite(v) ? v.toFixed(d) : '–'; }
    return 'Sampling has not converged (R̂ ' + f(c.rhat, 2) + ', smallest effective sample size ' + f(c.essMin, 0) +
      '; the bar is R̂ < 1.01 and ESS ≥ 400). The interval and the probabilities are approximate.';
  }

  /* ST4/UX4: one sentence, shown under the MPA results only when the CL shrinkage is > 80%, i.e. the samples left more
   * than 80% of the population variance in place — then the AUC interval is mostly the prior, not this patient. */
  function shrinkageNote(fit) {
    var ci = fit && fit.shrink && fit.etaNames ? fit.etaNames.indexOf('CL') : -1;
    if (ci < 0 || !isFinite(fit.shrink[ci]) || !(fit.shrink[ci] > 0.8)) return '';
    return 'the AUC interval largely reflects population variability, not this patient’s samples, add samples across the dosing interval to individualize the estimate.';
  }

  function fmtEta(v) { return isFinite(v) ? (v >= 0 ? '+' : '') + v.toFixed(2) : '–'; }
  function varianceOf(a) {
    var n = a.length; if (n < 2) return NaN;
    var m = 0; for (var i = 0; i < n; i++) m += a[i]; m /= n;
    var v = 0; for (var j = 0; j < n; j++) v += (a[j] - m) * (a[j] - m);
    return v / (n - 1);
  }
  function quantileOf(sorted, q) {
    if (!sorted.length) return NaN;
    return sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))))];
  }

  /* Full modal body for the “Fit diagnostics” dialog. Pure string builder —
   * the caller (ui.js) renders the observed-vs-predicted SVG into #diag-gof
   * after inserting this HTML, because chart rendering needs a live element. */
  function panelHtml(fit, spec) {
    if (!fit) {
      return '<p>Run a forecast first, these diagnostics describe how well that fit explains this patient’s samples.</p>';
    }
    spec = spec || (root.ECU.model && root.ECU.model.spec(fit.drug)) || {};
    var h = '';

    h += '<h3>Summary</h3><p>' + esc(summaryHint(fit)) + '</p>';

    var gof = gofChart(fit, spec);
    if (gof) {
      h += '<h3>Observed vs individual prediction</h3><div id="diag-gof"></div>' +
        '<div class="legend-note">Each point is one measured concentration against the model’s individual prediction at the same time. Points on the diagonal line = the model reproduces the sample. The shaded band is the ±2 SD measurement-noise range implied by the assay error model.</div>';
    } else if (fit.hasObs) {
      h += '<h3>Observed vs individual prediction</h3><p class="src">Needs at least one measured sample to plot.</p>';
    } else {
      h += '<h3>Observed vs individual prediction</h3><p class="src">No measurements were entered, this was a population forecast, so there is nothing to compare the model against.</p>';
    }

    if (fit.hasObs) {
      var rows = residualRows(fit);
      h += '<h3>Sample-by-sample residuals</h3>' +
        '<table class="data"><thead><tr><th>#</th><th>Hours after last dose</th><th>Observed (' + esc(unitsOfFit(fit).conc) + ')</th><th>Individual predicted (' + esc(unitsOfFit(fit).conc) + ')</th><th>Relative deviation</th></tr></thead><tbody>';
      rows.forEach(function (r) {
        var dev;
        if (!isFinite(r.rel)) dev = '<span class="badge bad">no prediction</span>';
        else dev = '<span class="badge ' + (r.level || 'bad') + '">' +
          (r.rel >= 0 ? '+' : '') + Math.round(r.rel * 100) + '%</span>';
        h += '<tr><td>' + (r.i + 1) + '</td><td class="num">' + (r.t - fit.lastDoseT).toFixed(2) +
          '</td><td class="num">' + fmtC(r.c) +
          '</td><td class="num">' + (isFinite(r.ipred) ? fmtC(r.ipred) : '–') + '</td><td>' + dev + '</td></tr>';
      });
      h += '</tbody></table>' +
        '<div class="legend-note">Relative deviation = (observed − predicted) / predicted. ' + residualLegend(fit) + '. ' +
        'A red residual flags a sample the model does not explain; check the dose history or sampling time first.</div>';
    }

    var names = (fit.map && fit.map.etaNames) || (spec.ETA && spec.ETA.names) || [];
    var mapEta = (fit.map && fit.map.eta) || [];
    var draws = fit.draws || [];
    var ov = (root.ECU.model ? root.ECU.model.omegaVars(fit.drug, fit.form, fit.extra) : null) || [];
    if (names.length) {
      var cols = names.map(function (nm, i) {
        return draws.map(function (d) { return d[i]; })
          .filter(function (v) { return isFinite(v); })
          .sort(function (a, b) { return a - b; });
      });
      h += '<h3>Individual parameters (posterior)</h3>' +
        '<table class="data"><thead><tr><th>Parameter</th><th>MAP η</th><th>Posterior median η (5–95%)</th></tr></thead><tbody>';
      names.forEach(function (nm, i) {
        var med = quantileOf(cols[i], 0.5);
        var p5 = quantileOf(cols[i], 0.05);
        var p95 = quantileOf(cols[i], 0.95);
        h += '<tr><td>η-' + esc(nm) + '</td><td class="num">' + fmtEta(mapEta[i]) + '</td><td class="num">' +
          (isFinite(med) ? fmtEta(med) + ' (' + fmtEta(p5) + ' to ' + fmtEta(p95) + ')' : '–') + '</td></tr>';
      });
      var tacInfo = unitsOfFit(fit).tac;
      h += '</tbody></table>' + (tacInfo ? '<p class="src">Information gained from the samples, per parameter (the share of the population prior variance they removed; 0 % = the estimate is the population value).</p>' : '') + '<div class="shrink-bars">';
      names.forEach(function (nm, i) {
        var post = varianceOf(cols[i]);
        var pri = ov[i];
        var sh = (isFinite(post) && pri > 0) ? Math.max(0, Math.min(1, 1 - post / pri)) : NaN;   // information gained (tacrolimus shows this)
        if (!tacInfo && isFinite(sh)) sh = 1 - sh;                                              // MPA shows shrinkage = Var(posterior)/ω², as fit.shrink
        var lvl = !isFinite(sh) ? '' : (sh >= 0.6 ? ' weak' : (sh >= 0.3 ? ' warn' : ''));
        if (tacInfo) lvl = !isFinite(sh) ? '' : (sh < 0.3 ? ' weak' : (sh < 0.5 ? ' warn' : ''));   // information gained: low is the weak case
        h += '<div class="shrink-row"><span class="shrink-name">η-' + esc(nm) + '</span>' +
          '<div class="shrink-track"><div class="shrink-fill' + lvl + '" style="width:' +
          (isFinite(sh) ? Math.round(sh * 100) : 0) + '%"></div></div>' +
          '<span class="shrink-pct">' + (isFinite(sh) ? Math.round(sh * 100) + '%' : '–') + '</span></div>';
      });
      h += '</div>' + (tacInfo
        ? '<div class="legend-note">Low values (red, &lt; 30%) mean the samples did not inform that parameter, its interval reflects the prior, not this patient. ' + (diagNoteOf(fit) || 'The day-to-day effects (KF, KKA) are expected to be poorly informed by a single trough.') + '</div>'
        : '') + (tacInfo ? '' : '<div class="legend-note">Shrinkage = how little the samples moved this parameter’s posterior relative to the population prior. High shrinkage (&gt; 60%, red) means the data did not inform that parameter, its interval reflects the prior, not this patient.</div>');
    }

    // Mixture membership posterior (UX3/ST5): probabilities, never a classification
    if (fit.mixPost && fit.mixPost.length) {
      h += '<h3>Absorption-delay group (EC-MPS)</h3>' +
        '<p class="src">Posterior probabilities of the morning lag-time subgroup, probabilities, not a classification. Sparse data leave them near the population prior (51/32/17%).</p><div class="shrink-bars">';
      fit.mixPost.forEach(function (p, k) {
        h += '<div class="shrink-row"><span class="shrink-name">group ' + (k + 1) + '</span>' +
          '<div class="shrink-track"><div class="shrink-fill" style="width:' + Math.round(p * 100) + '%"></div></div>' +
          '<span class="shrink-pct">' + Math.round(p * 100) + '%</span></div>';
      });
      h += '</div>';
    }

    h += '<h3>MCMC quality</h3><p>' + (fit.nDraws || 0) + ' posterior draws';
    if (isFinite(fit.acceptance)) h += ', acceptance ' + Math.round(fit.acceptance * 100) + '% (healthy range roughly 25–70%)';
    var cv = fit.convergence;
    if (cv) {
      h += ', R̂ ' + cv.rhat.toFixed(3) + ' (worst of AUC and trough, the printed quantities; should be below 1.01)' +
        ', effective sample size ' + Math.round(cv.essMin) + ' (smallest of the same; should be at least 400)';
      var pIn = fit.auc && fit.auc.pInWindow;
      if (isFinite(pIn) && cv.essIn > 0) {
        h += '. P(within window) Monte Carlo error ±' + (100 * Math.sqrt(pIn * (1 - pIn) / cv.essIn)).toFixed(1) + ' percentage points';
      }
    } else if (fit.ess && fit.etaNames && fit.etaNames.indexOf('CL') >= 0 && isFinite(fit.ess[fit.etaNames.indexOf('CL')])) {
      h += ', effective sample size (CL) ' + Math.round(fit.ess[fit.etaNames.indexOf('CL')]);
    }
    if (fit.map) h += ', MAP ' + (fit.map.converged ? 'converged' : 'not converged');
    if (fit.runtimeMs) h += ', ' + (fit.runtimeMs / 1000).toFixed(1) + ' s runtime';
    h += '.</p>';
    if (cv && cv.etaSlow && cv.etaSlow.length) {
      h += '<p class="src">Slowly mixing parameters: ' + esc(cv.etaSlow.join(', ')) +
        ' (weakly identified by these data; they do not change the reported AUC or trough).</p>';
    }
    if (convergenceNote(fit)) h += '<p class="legend-note"><b>Not converged.</b> ' + esc(convergenceNote(fit)) + '</p>';

    return h;
  }

  ECU.diagnostics = {
    residualRows: residualRows,
    gofChart: gofChart,
    summaryHint: summaryHint,
    residualLegend: residualLegend,
    convergenceNote: convergenceNote,
    shortHistoryNote: shortHistoryNote,
    shrinkageNote: shrinkageNote,
    panelHtml: panelHtml
  };

})(typeof window !== 'undefined' ? window : globalThis);
