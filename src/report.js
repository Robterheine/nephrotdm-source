/* =========================================================================
 * NephroTDM: the one-page A4 report (all drugs)
 *
 * A pure function of a context built by ui.js from the run snapshot: ECU.report.build(ctx) returns the page as an HTML string.
 * Designed to be read in seconds and to print in greyscale: the answer comes first (a strip with the patient and regimen, then the
 * results with a range bar against the window and a plain-language probability), then the chart, the samples, the notes, and the
 * advice and signature block. Neutral greys only, nothing under 12 px, rules of at least 1 px. Per-drug facts (which tile leads,
 * the source of the windows, the reading notes) come from spec.report; the citation of the model is spec.article.
 * No sentence here may read as a dose or interval recommendation.
 * ========================================================================= */
(function (root) {
  'use strict';
  var ECU = root.ECU = root.ECU || {};

  var INK = '#111111', MUT = '#4a4a4a', RULE = '#8c8c8c', FAINT = '#f2f2f2';
  var MONO = "var(--mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace)";
  var JOURNALS = ['Clin Pharmacokinet', 'Ther Drug Monit', 'Br J Clin Pharmacol'];

  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function fmtC(v) {
    if (!isFinite(v)) return '–';
    if (Math.abs(v) >= 100) return v.toFixed(0);
    if (Math.abs(v) >= 10) return v.toFixed(1);
    return v.toFixed(2);
  }
  function pct(p) { return isFinite(p) ? Math.round(p * 100) : null; }
  function cite(text) {
    var out = esc(text);
    JOURNALS.forEach(function (j) { out = out.replace(j, '<i>' + j + '</i>'); });
    return out;
  }
  /* ticks 0..max in 1-2-5 steps; the last tick is at or above max */
  function niceScale(maxv, n) {
    if (!(maxv > 0)) maxv = 1;
    var step0 = maxv / (n || 5), mag = Math.pow(10, Math.floor(Math.log(step0) / Math.LN10)), norm = step0 / mag;
    var step = mag * (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10), ticks = [0], v = 0;
    while (v < maxv - 1e-9) { v += step; ticks.push(+v.toFixed(10)); }
    return { max: ticks[ticks.length - 1], ticks: ticks };
  }
  function rangeTicks(lo, hi, n) {
    var step0 = (hi - lo) / (n || 6), mag = Math.pow(10, Math.floor(Math.log(step0) / Math.LN10)), norm = step0 / mag;
    var step = mag * (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10), out = [];
    for (var v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(10));
    return out;
  }
  function P(v, lo, hi) { return (v - lo) / (hi - lo) * 100; }

  /* ---- range bar: measured interval (solid), corrected interval (outlined), median ticks, the window hatched ---------------- */
  function bar(stats, corr, win, scaleMax) {
    var sc = niceScale(scaleMax * 1.06, 4), lo = 0, hi = sc.max, html = '';
    if (win) {
      var wl = P(win.lo, lo, hi), ww = P(win.hi, lo, hi) - wl;
      html += '<div style="position:absolute;left:' + wl.toFixed(2) + '%;width:' + ww.toFixed(2) + '%;top:0;bottom:0;background:repeating-linear-gradient(45deg,#e2e2e2 0 4px,#f5f5f5 4px 8px);border-left:1.5px dashed ' + INK + ';border-right:1.5px dashed ' + INK + ';box-sizing:border-box"></div>';
    }
    var a = P(stats.p5, lo, hi), b = P(stats.p95, lo, hi), m = P(stats.median, lo, hi);
    html += '<div style="position:absolute;left:' + a.toFixed(2) + '%;width:' + Math.max(0.6, b - a).toFixed(2) + '%;top:8px;height:10px;background:' + INK + ';border-radius:2px"></div>' +
      '<div style="position:absolute;left:' + m.toFixed(2) + '%;top:4px;width:3px;height:17px;margin-left:-1.5px;background:#ffffff;border:1.5px solid ' + INK + ';box-sizing:border-box"></div>';
    if (corr) {
      var ca = P(corr.p5, lo, hi), cb = P(corr.p95, lo, hi), cm = P(corr.median, lo, hi);
      html += '<div style="position:absolute;left:' + ca.toFixed(2) + '%;width:' + Math.max(0.6, cb - ca).toFixed(2) + '%;top:28px;height:10px;border:2px solid ' + INK + ';box-sizing:border-box;background:#ffffff;border-radius:2px"></div>' +
        '<div style="position:absolute;left:' + cm.toFixed(2) + '%;top:25px;width:3px;height:16px;margin-left:-1.5px;background:' + INK + '"></div>';
    }
    var ticks = sc.ticks.map(function (t) {
      return '<span style="position:absolute;left:' + P(t, lo, hi).toFixed(2) + '%;transform:translateX(-50%);font:500 12px ' + MONO + ';color:' + MUT + '">' + t + '</span>';
    }).join('');
    return '<div style="display:flex;flex-direction:column;gap:2px"><div role="img" aria-label="Interval bar" style="position:relative;height:' + (corr ? 46 : 28) + 'px;background:' + FAINT + ';border:1px solid ' + RULE + ';border-radius:4px;overflow:hidden">' + html + '</div>' +
      '<div style="position:relative;height:16px">' + ticks + '</div></div>';
  }

  /* the plain-language probability sentence, shared by the screen tiles and the printed report */
  function probLine(m, fit, spec) {
    var s = m.stats, c = m.corr, H = fit.hctRef;
    if (m.informational) return 'Predicted concentration just before the next dose. Informational: the app has no trough target.';
    if (m.win) {
      var pin = pct(s.pInWindow), pab = pct(s.pAboveLower), pbe = pct(s.pBelowUpper), pc = c ? pct(c.pInWindow) : null;
      return '<b>' + pin + '% chance</b> the ' + m.what + ' is within the window ' + fmtC(m.win.lo) + ' to ' + fmtC(m.win.hi) + ' ' + esc(m.unit) +
        (pc != null && c && !(Math.abs((fit.hctReport || 0) - H) < 0.005) ? ' (corrected: ' + pc + '%)' : '') + '. Chance above ' + fmtC(m.win.lo) + ': ' + pab + '%. Chance below ' + fmtC(m.win.hi) + ': ' + pbe + '%.';
    }
    return 'No ' + m.what + ' window is set, so no probabilities are shown.' + esc(((spec.report && spec.report.noWindow) || {})[m.key] || '');
  }

  /* ---- one result tile ---------------------------------------------------------------------------------------------------- */
  function tile(m) {
    var s = m.stats, c = m.corr, ctx = m.ctx, H = ctx.fit.hctRef;
    var scaleMax = Math.max(s.p95, c ? c.p95 : 0, m.win ? m.win.hi : 0, 1e-9);
    var corrLine = '';
    if (c) {
      var same = Math.abs((ctx.fit.hctReport || 0) - H) < 0.005;
      corrLine = '<div style="font-size:13px;color:' + INK + '">Corrected to haematocrit ' + esc(H) + ': ' + (same ? 'same as measured' :
        '<b style="font-family:' + MONO + '">' + fmtC(c.median) + '</b> <span style="font-family:' + MONO + ';color:' + MUT + '">(' + fmtC(c.p5) + ' to ' + fmtC(c.p95) + ')</span>') + '</div>';
    }
    var line = probLine(m, ctx.fit, ctx.spec);
    var note = m.note ? '<div style="font-size:12px;color:' + MUT + '">' + m.note + '</div>' : '';
    return '<div style="flex:1 1 0;min-width:0;border:1px solid ' + RULE + ';border-radius:6px;padding:8px 12px;display:flex;flex-direction:column;gap:4px">' +
      '<div style="font-size:13px;font-weight:600;color:' + INK + '">' + m.title + '</div>' +
      '<div style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap"><span style="font:600 30px/1 ' + MONO + ';letter-spacing:-.5px">' + fmtC(s.median) + '</span><span style="font-size:13px;color:' + MUT + '">' + esc(m.unit) + '</span>' +
      '<span style="font:500 13px ' + MONO + ';color:' + MUT + '">' + fmtC(s.p5) + ' to ' + fmtC(s.p95) + '</span></div>' +
      corrLine + bar(s, c, m.win, scaleMax) + note +
      '<div style="font-size:13px;line-height:1.4;color:' + INK + ';border-top:1px solid #c8c8c8;padding-top:5px">' + line + '</div></div>';
  }

  /* ---- the chart: median, 5-95 % band, the concentration window (hatched) and the samples --------------------------------- */
  function chart(ctx) {
    var fit = ctx.fit, grid = fit.chartGrid || fit.grid, band = fit.chartBand;
    if (!grid || !band || !band.median) return '<div style="font-size:13px;color:' + MUT + '">No forecast curve is available.</div>';
    var t0 = fit.aucT0 != null ? fit.aucT0 : fit.lastDoseT, W = 714, Hh = 160, L = 52, Rr = 12, T = 10, B = 42;
    var xs = grid.map(function (t) { return t - t0; });
    var obs = (fit.obsData || []).map(function (o) { return { x: o.t - t0, y: o.c }; }).filter(function (p) { return isFinite(p.x) && isFinite(p.y); });
    var win = fit.troughWin && fit.troughWin.set ? { lo: fit.troughWin.lo, hi: fit.troughWin.hi } : null;
    var xMin = Math.min(0, xs[0], obs.length ? Math.min.apply(null, obs.map(function (p) { return p.x; })) : 0);
    var xMax = Math.max(xs[xs.length - 1], fit.intervalHours || 12, obs.length ? Math.max.apply(null, obs.map(function (p) { return p.x; })) : 0);
    var yTop = 0; band.p95.forEach(function (v) { if (isFinite(v) && v > yTop) yTop = v; }); obs.forEach(function (p) { if (p.y > yTop) yTop = p.y; }); if (win && win.hi > yTop) yTop = win.hi;
    var ys = niceScale(yTop * 1.06, 5), X = function (t) { return L + (t - xMin) / (xMax - xMin) * (W - L - Rr); }, Y = function (v) { return T + (Hh - T - B) * (1 - v / ys.max); };
    var pts = function (arr) { var o = []; for (var i = 0; i < xs.length; i++) if (isFinite(arr[i])) o.push(X(xs[i]).toFixed(1) + ',' + Y(arr[i]).toFixed(1)); return o.join(' '); };
    var polyBand = pts(band.p95) + ' ' + (function () { var o = []; for (var i = xs.length - 1; i >= 0; i--) if (isFinite(band.p5[i])) o.push(X(xs[i]).toFixed(1) + ',' + Y(band.p5[i]).toFixed(1)); return o.join(' '); })();
    var g = '<defs><pattern id="rphatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="7" stroke="' + RULE + '" stroke-width="1.4"/></pattern></defs>';
    if (win) {
      g += '<rect x="' + L + '" y="' + Y(win.hi).toFixed(1) + '" width="' + (W - L - Rr) + '" height="' + (Y(win.lo) - Y(win.hi)).toFixed(1) + '" fill="url(#rphatch)" opacity=".45"/>' +
        '<line x1="' + L + '" x2="' + (W - Rr) + '" y1="' + Y(win.hi).toFixed(1) + '" y2="' + Y(win.hi).toFixed(1) + '" stroke="' + INK + '" stroke-width="1.2" stroke-dasharray="6 4"/>' +
        '<line x1="' + L + '" x2="' + (W - Rr) + '" y1="' + Y(win.lo).toFixed(1) + '" y2="' + Y(win.lo).toFixed(1) + '" stroke="' + INK + '" stroke-width="1.2" stroke-dasharray="6 4"/>';
    }
    ys.ticks.forEach(function (v) {
      g += '<line x1="' + L + '" x2="' + (W - Rr) + '" y1="' + Y(v).toFixed(1) + '" y2="' + Y(v).toFixed(1) + '" stroke="#d0d0d0" stroke-width="1"/><text x="' + (L - 8) + '" y="' + (Y(v) + 4).toFixed(1) + '" text-anchor="end" font-family="monospace" font-size="12" fill="' + MUT + '">' + v + '</text>';
    });
    rangeTicks(xMin, xMax, 7).forEach(function (v) {
      g += '<text x="' + X(v).toFixed(1) + '" y="' + (Hh - B + 16) + '" text-anchor="middle" font-family="monospace" font-size="12" fill="' + MUT + '">' + v + '</text>';
    });
    g += '<polygon points="' + polyBand + '" fill="#b9b9b9" opacity=".55"/><polyline points="' + pts(band.median) + '" fill="none" stroke="' + INK + '" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"/>';
    obs.forEach(function (p) {
      g += '<circle cx="' + X(p.x).toFixed(1) + '" cy="' + Y(p.y).toFixed(1) + '" r="6" fill="#ffffff" stroke="' + INK + '" stroke-width="2.4"/><circle cx="' + X(p.x).toFixed(1) + '" cy="' + Y(p.y).toFixed(1) + '" r="2.4" fill="' + INK + '"/>' +
        '<text x="' + (X(p.x) + 11).toFixed(1) + '" y="' + (Y(p.y) - 8).toFixed(1) + '" font-family="monospace" font-size="12" font-weight="600" fill="' + INK + '">' + (+p.y.toPrecision(3)) + '</text>';
    });
    if (win) g += '<text x="' + (W - Rr - 4) + '" y="' + (Y(win.hi) - 6).toFixed(1) + '" text-anchor="end" font-family="sans-serif" font-size="12" fill="' + INK + '">Trough window ' + fmtC(win.lo) + ' to ' + fmtC(win.hi) + '</text>';
    g += '<text x="' + ((L + W - Rr) / 2).toFixed(1) + '" y="' + (Hh - 6) + '" text-anchor="middle" font-family="sans-serif" font-size="12" fill="' + MUT + '">Time (h after ' + (fit.aucAnchorShifted ? 'the morning dose' : 'the last dose') + ')</text>' +
      '<text transform="translate(12 ' + ((T + Hh - B) / 2).toFixed(1) + ') rotate(-90)" text-anchor="middle" font-family="sans-serif" font-size="12" fill="' + MUT + '">Concentration (' + esc(ctx.units.conc) + ')</text>';
    var desc = 'Concentration-time forecast: median curve with the 5 to 95 percent band' + (win ? ', the trough window ' + fmtC(win.lo) + ' to ' + fmtC(win.hi) : '') + (obs.length ? ' and ' + obs.length + ' measurement' + (obs.length === 1 ? '' : 's') : '');
    return '<svg viewBox="0 0 ' + W + ' ' + Hh + '" width="100%" role="img" aria-label="' + esc(desc) + '" style="display:block;height:auto">' + g + '</svg>';
  }
  function legend(ctx) {
    var win = ctx.fit.troughWin && ctx.fit.troughWin.set;
    var sw = function (st) { return '<span style="display:inline-block;' + st + '"></span>'; };
    var it = function (s, tx) { return '<span style="display:inline-flex;align-items:center;gap:6px;font-size:12px;color:' + MUT + '">' + s + tx + '</span>'; };
    return '<div style="display:flex;flex-wrap:wrap;gap:4px 16px">' + it(sw('width:20px;height:3px;background:' + INK + ';border-radius:2px'), 'Individual median') + it(sw('width:20px;height:10px;background:#b9b9b9;border-radius:2px'), '5 to 95% band') +
      it(sw('width:10px;height:10px;border:2.4px solid ' + INK + ';border-radius:6px;box-sizing:border-box;background:#fff'), 'Measurement') + (win ? it(sw('width:20px;height:11px;background:repeating-linear-gradient(45deg,#e2e2e2 0 3px,#f5f5f5 3px 6px);border:1.5px dashed ' + INK + ';box-sizing:border-box'), 'Trough window') : '') + '</div>';
  }
  function barKey(corr, win) {
    var it = function (s, tx) { return '<span style="display:inline-flex;align-items:center;gap:6px;font-size:12px;color:' + MUT + '">' + s + tx + '</span>'; };
    return '<div style="display:flex;flex-wrap:wrap;gap:4px 18px">' + it('<span style="display:inline-block;width:20px;height:9px;background:' + INK + ';border-radius:2px"></span>', 'measured, 5 to 95%') +
      (corr ? it('<span style="display:inline-block;width:20px;height:9px;border:2px solid ' + INK + ';box-sizing:border-box;border-radius:2px"></span>', 'corrected, 5 to 95%') : '') +
      (win ? it('<span style="display:inline-block;width:20px;height:11px;background:repeating-linear-gradient(45deg,#e2e2e2 0 3px,#f5f5f5 3px 6px);border:1.5px dashed ' + INK + ';box-sizing:border-box"></span>', 'window') : '') + '</div>';
  }

  /* ---- patient strip ------------------------------------------------------------------------------------------------------ */
  function cell(k, v, grow) {
    var val = esc(v).replace(/(\d{4}-\d{2}-\d{2} \d{2}:\d{2})/g, '<span style="white-space:nowrap">$1</span>');
    return '<div style="display:flex;flex-direction:column;gap:1px;flex:' + (grow || 1) + ' 1 ' + (grow ? 200 : 84) + 'px;min-width:0"><span style="font-size:12px;color:' + MUT + '">' + esc(k) + '</span><span style="font:600 13px ' + MONO + ';color:' + INK + ';overflow-wrap:anywhere">' + val + '</span></div>';
  }
  function patientCells(ctx) {
    var cells = [['Patient', ctx.patientId || '[not entered]']], M = ECU.model;
    var fields = M && M.covariateFields ? M.covariateFields(ctx.spec.id) : [];
    fields.forEach(function (c) {
      if (c.id === 'age' || c.id === 'renal' || c.id === 'extracov') return;
      if (c.id === 'wt') { if (ctx.usesWeight) cells.push(['Weight', (ctx.weight !== '' && ctx.weight != null ? ctx.weight : '–') + ' kg']); return; }
      if (c.id === 'form') { if (ctx.formLabel) cells.push(['Formulation', ctx.formLabel.replace(/\s*\(.*$/, '')]); return; }
      var v = (ctx.extra || {})[c.id], txt = '–';
      if (v !== undefined && v !== null && v !== '') {
        if (c.options) { var o = c.options.filter(function (x) { return String(x.value) === String(v); })[0]; txt = o ? o.label.replace(/\s*\(.*\)\s*$/, '') : String(v); }
        else txt = String(v) + (c.units ? ' ' + c.units : '');
      }
      cells.push([c.name, txt]);
    });
    var d = ctx.doses || [], last = d[d.length - 1], iv = ctx.fit.intervalHours, noun = (ctx.spec.ui && ctx.spec.ui.noun) || (ctx.formLabel ? ctx.formLabel.replace(/\s*\(.*$/, '') : '');
    if (last) {
      var mpa = ECU.model && ctx.form && !ctx.spec.custom && ECU.model.toMpaMg ? ' (= ' + fmtC(ECU.model.toMpaMg(last.amt, ctx.form)) + ' mg MPA)' : '';
      cells.push(['Regimen, latest dose', last.amt + ' mg ' + noun + mpa + (ctx.ssMode ? ' every ' + iv + ' h' : ' (latest of ' + d.length + ' doses)') + ', ' + ctx.fmtClock(last.t), 2]);
    } else cells.push(['Regimen', '–']);
    return cells.map(function (c) { return cell(c[0], c[1], c[2]); }).join('');
  }

  function samplesTable(ctx) {
    var obs = ctx.obs || [], custom = !!ctx.spec.custom;
    if (!obs.length) return '<div style="font-size:13px;color:' + MUT + '">None entered.</div>';
    var th = function (t, right) { return '<th style="padding:4px 6px;border-bottom:1.5px solid ' + INK + ';font-weight:600;text-align:' + (right ? 'right' : 'left') + '">' + t + '</th>'; };
    var td = function (t, right) { return '<td style="padding:3px 6px;border-bottom:1px solid #b5b5b5;font-family:' + MONO + ';text-align:' + (right ? 'right' : 'left') + '">' + esc(t) + '</td>'; };
    var rows = obs.slice(0, 6).map(function (o) { return '<tr>' + td(ctx.fmtClock(o.t)) + td(o.c, true) + (custom ? td((function (h) { var n = parseFloat(h); return isFinite(n) ? n.toFixed(2) : '–'; })(o.hct != null ? o.hct : (ctx.extra || {}).hct), true) : '') + '</tr>'; }).join('');
    var more = obs.length > 6 ? '<div style="font-size:12px;color:' + MUT + ';padding-top:4px">and ' + (obs.length - 6) + ' more samples, all used in the fit.</div>' : '';
    return '<table style="border-collapse:collapse;width:100%;font-size:13px"><thead><tr style="font-size:12px;color:' + MUT + '">' + th('When') + th('Result (' + esc(ctx.units.conc) + ')', true) + (custom ? th('Haematocrit', true) : '') + '</tr></thead><tbody>' + rows + '</tbody></table>' + more;
  }

  function build(ctx) {
    var fit = ctx.fit, spec = ctx.spec, rp = spec.report || {}, custom = !!spec.custom, noun = (spec.ui && spec.ui.noun) || spec.label.toLowerCase();
    var aucWin = (fit.windowSet && fit.winLo != null && fit.winHi != null) ? { lo: fit.winLo, hi: fit.winHi } : null;
    var trWin = fit.troughWin && fit.troughWin.set ? { lo: fit.troughWin.lo, hi: fit.troughWin.hi } : null;
    var aucNote = (!custom && fit.intervalHours !== 12 && fit.aucRaw) ? 'As the 12-hour equivalent of the AUC over ' + esc(fit.intervalHours) + ' h (' + fmtC(fit.aucRaw.median) + ' ' + esc(ctx.units.auc) + ' as simulated).' : '';
    var tAuc = { key: 'auc', what: 'AUC', title: 'AUC₀–₁₂ₕ', unit: ctx.units.auc, stats: fit.auc, corr: custom ? fit.aucCorr : null, win: aucWin, ctx: ctx, note: aucNote };
    var tTr = { key: 'trough', what: 'trough', title: custom ? 'Trough' : 'Predicted trough', unit: ctx.units.conc, stats: fit.trough, corr: custom ? fit.troughCorr : null, win: custom ? trWin : null, informational: !custom, ctx: ctx };
    var tiles = (rp.lead === 'trough' ? [tTr, tAuc] : [tAuc, tTr]);
    var anyCorr = custom, anyWin = !!(aucWin || (custom && trWin));
    var H = fit.hctRef;
    var reading = (rp.reading || []).map(function (s) { return '<li>' + esc(s.replace('@H', H != null ? H : '')) + '</li>'; }).join('');
    var notes = [ctx.notes && ctx.notes.convergence, ctx.notes && ctx.notes.shortHistory, ctx.notes && ctx.notes.shrink, ctx.notes && ctx.notes.anchor].filter(Boolean);
    var noteBox = notes.length ? '<div class="rp-notes" style="border:1.5px solid ' + INK + ';border-radius:6px;padding:8px 12px;font-size:13px;line-height:1.45"><b>Notes</b><ul style="margin:4px 0 0;padding-left:18px">' + notes.map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('') + '</ul></div>' : '';
    var stamp = ctx.inputsChanged ? '<div style="border:2px solid ' + INK + ';border-radius:6px;padding:8px 12px;font-size:13px;line-height:1.45"><b>Inputs changed on screen since this forecast.</b> This report shows the inputs the forecast was run with; re-run before signing if the changes matter.</div>' : '';
    var citeTxt = esc(rp.scope || '') + '. <b style="color:' + INK + ';font-weight:600">Model:</b> ' + cite(rp.modelCite || spec.article || '') + (rp.windowSource ? ' <b style="color:' + INK + ';font-weight:600">Windows:</b> ' + cite(rp.windowSource) : '');
    var logo = '<svg width="34" height="34" viewBox="0 0 34 34" aria-hidden="true"><rect width="34" height="34" rx="9" fill="' + INK + '"/><path d="M5 25 C 10 25, 11 9, 16 9 S 22 25, 29 25" fill="none" stroke="#ffffff" stroke-width="2.6" stroke-linecap="round"/><circle cx="16" cy="9" r="2.6" fill="#ffffff"/></svg>';
    var popTag = fit.hasObs ? '' : '<span style="font-size:12px;font-weight:600;border:1.5px solid ' + INK + ';border-radius:999px;padding:2px 10px">Population forecast, no measurements entered</span>';

    return '<div class="rp-page" style="font-size:13px;line-height:1.45;color:' + INK + '">' +
      stamp +
      '<div style="border-bottom:2px solid ' + INK + ';padding-bottom:6px;display:flex;flex-direction:column;gap:4px"><div style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px">' +
      '<div style="display:flex;align-items:center;gap:12px">' + logo + '<div><h1 style="margin:0;font-size:20px;font-weight:600;letter-spacing:-.3px">NephroTDM report: ' + esc(noun) + '</h1></div></div>' +
      '<div style="text-align:right;font-size:12px;color:' + MUT + ';line-height:1.45">Generated ' + esc(ctx.now) + '<br>NephroTDM v' + esc(ctx.version) + '</div></div>' +
      '<p class="rp-cite" style="margin:0;font-size:12px;line-height:1.4;color:' + MUT + '">' + citeTxt + '</p></div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:5px 12px;border:1px solid ' + RULE + ';border-radius:6px;padding:8px 12px;background:#f7f7f7">' + patientCells(ctx) + '</div>' +
      '<div style="display:flex;flex-direction:column;gap:7px"><div style="display:flex;align-items:baseline;justify-content:space-between;gap:10px;flex-wrap:wrap"><h2 style="margin:0;font-size:15px;font-weight:600">Result at a glance</h2>' + popTag +
      '<span style="font-size:12px;color:' + MUT + '">steady state of the current regimen, median and 5 to 95% interval</span></div>' +
      '<div style="display:flex;gap:12px">' + tiles.map(tile).join('') + '</div>' + barKey(anyCorr, anyWin) + '</div>' +
      noteBox +
      '<div style="display:flex;flex-direction:column;gap:5px"><h2 style="margin:0;font-size:15px;font-weight:600">Concentration over one dosing interval</h2>' +
      '<div style="border:1px solid ' + RULE + ';border-radius:6px;padding:8px 10px 6px;display:flex;flex-direction:column;gap:6px">' + chart(ctx) + legend(ctx) + '</div>' +
      '</div>' +
      '<div style="display:flex;gap:16px;align-items:flex-start"><div style="flex:1.25 1 0;min-width:0"><h2 style="margin:0 0 5px;font-size:15px;font-weight:600">Samples</h2>' + samplesTable(ctx) + '<div style="font-size:12px;color:' + MUT + ';padding-top:6px">Fitting settings: ' + esc((ctx.settings || '–').replace(/\s*\(all samples weighted equally\)/, '')) + '</div></div>' +
      '<div style="flex:1.2 1 0;min-width:0"><h2 style="margin:0 0 5px;font-size:15px;font-weight:600">How to read this</h2><ul style="margin:0;padding-left:18px;font-size:12px;line-height:1.5;display:flex;flex-direction:column;gap:3px">' + reading + '</ul></div></div>' +
            '<div style="display:flex;gap:16px"><div style="flex:1.6 1 0;border:1px solid ' + RULE + ';border-radius:6px;padding:6px 12px;min-height:58px"><div style="font-size:12px;font-weight:600;color:' + MUT + '">Advice</div><div style="margin-top:4px;font-size:13px;white-space:pre-wrap;overflow-wrap:anywhere">' + esc(ctx.advice) + '</div></div>' +
      '<div style="flex:1 1 0;display:flex;flex-direction:column;justify-content:flex-end;gap:8px;font-size:12px;color:' + MUT + '"><div>Prepared by: <span style="color:' + INK + '">' + esc(ctx.prepared) + '</span></div><div style="border-bottom:1px solid ' + INK + ';height:16px"></div><div>Signature</div></div></div>' +
      '<div style="margin-top:auto;border-top:1px solid ' + RULE + ';padding-top:7px;font-size:12px;color:' + MUT + '">' + esc(ctx.patientId || '[not entered]') + ' · NephroTDM v' + esc(ctx.version) + ' · research use only · this app does not recommend or optimize doses; clinical judgement and verification required</div>' +
      '</div>';
  }

  ECU.report = { build: build, niceScale: niceScale, probLine: probLine };
})(typeof window !== 'undefined' ? window : globalThis);
