/* =========================================================================
 * MPA TDM — lightweight dependency-free SVG chart
 *
 * Reuses the same cfg-in/SVG-out pattern as the complement app. The MPA
 * differences are:
 *   - y-axis in mg/L,
 *   - an optional logarithmic y-axis,
 *   - a therapeutic-window dashed hline,
 *   - legend items suited to MPA.
 * ========================================================================= */
(function (root) {
  'use strict';
  var ECU = root.ECU = root.ECU || {};

  function niceTicks(min, max, n) {
    var span = max - min;
    if (span <= 0) return [min];
    var step0 = span / Math.max(1, n);
    var mag = Math.pow(10, Math.floor(Math.log(step0) / Math.LN10));
    var norm = step0 / mag;
    var step = mag * (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10);
    var t0 = Math.ceil(min / step) * step;
    var out = [];
    for (var t = t0; t <= max + 1e-9; t += step) out.push(+t.toFixed(10));
    return out;
  }
  function logTicks(lo, hi) {
    var out = [];
    if (!(hi > 0)) return out;
    if (!(lo > 0)) lo = hi / 1000;
    var e0 = Math.floor(Math.log10(lo)) - 1, e1 = Math.ceil(Math.log10(hi)) + 1;
    for (var e = e0; e <= e1; e++) {
      var base = Math.pow(10, e);
      [1, 2, 5].forEach(function (mult) {
        var v = base * mult;
        if (v >= lo * (1 - 1e-9) && v <= hi * (1 + 1e-9)) out.push(+v.toPrecision(12));
      });
    }
    out.sort(function (a, b) { return a - b; });
    return out;
  }
  function fmt(v) {
    if (!isFinite(v)) return '–';
    if (Math.abs(v) >= 1000) return String(Math.round(v));
    if (Math.abs(v) >= 100) return v.toFixed(0);
    if (Math.abs(v) >= 10) return v.toFixed(1);
    return v.toFixed(2);
  }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function render(el, cfg) {
    var compact = !!cfg.compact;
    var W = cfg.width || (compact ? 340 : 960);
    var fs = {
      tick: compact ? 15 : 12,
      axisLabel: compact ? 15 : 12.5,
      legend: compact ? 14 : 11.5,
      hline: compact ? 13.5 : 11.5
    };
    var m;
    if (compact) {
      m = { l: 54, r: 10, t: 30, b: 0 };
      var compactIw = W - m.l - m.r;
      var legRows = 1;
      var plotH = cfg.plotHeight || 210;
      var tickBand = 20, axisLabelBand = 14 + fs.axisLabel, legendGap = 12, rowH = fs.legend + 10, pad = 10;
      m.b = tickBand + axisLabelBand + legendGap + legRows * rowH + pad;
    } else {
      m = { l: 62, r: 18, t: 40, b: 46 };
    }
    var H = cfg.height || (compact ? 440 : 440);
    var iw = W - m.l - m.r, ih = H - m.t - m.b;

    var xMin = cfg.xMin || 0, xMax = cfg.xMax || 1;
    var yMin = cfg.yMin != null ? cfg.yMin : 0;
    var yMax = cfg.yMax || 100;
    if (yMax <= yMin) yMax = yMin + 10;

    var x0 = m.l, y0 = m.t;
    var pw = iw, ph = ih;
    var logY = !!cfg.logY;
    if (logY) {
      if (!(yMin > 0)) yMin = Math.max(1e-4, yMax / 1000);
      if (!(yMax > yMin)) yMax = yMin * 10;
    }
    var xs = niceTicks(xMin, xMax, 8);
    var ys = logY ? logTicks(yMin, yMax) : niceTicks(yMin, yMax, 6);

    var sx = function (x) { return x0 + (x - xMin) / (xMax - xMin) * pw; };
    var sy = function (y) {
      if (logY) {
        var ly = Math.log(Math.max(y, yMin));
        var l0 = Math.log(yMin), l1 = Math.log(yMax);
        return y0 + ph - (ly - l0) / (l1 - l0) * ph;
      }
      return y0 + ph - (y - yMin) / (yMax - yMin) * ph;
    };

    var parts = [];

    // background
    parts.push('<svg xmlns="http://www.w3.org/2000/svg" width="100%" viewBox="0 0 ' + W + ' ' + H + '" style="overflow:visible" role="img" aria-labelledby="' + (cfg.titleId || 'chartTitle') + '">');
    parts.push('<title id="' + (cfg.titleId || 'chartTitle') + '">' + esc(cfg.title || '') + '</title>');
    if (cfg.desc) parts.push('<desc>' + esc(cfg.desc) + '</desc>');

    // grid lines
    xs.forEach(function (x) {
      if (x < xMin || x > xMax) return;
      parts.push('<line x1="' + sx(x) + '" y1="' + y0 + '" x2="' + sx(x) + '" y2="' + (y0 + ph) + '" stroke="#edf1f5" stroke-width="1"/>');
    });
    ys.forEach(function (y) {
      if (y < yMin || y > yMax) return;
      parts.push('<line x1="' + x0 + '" y1="' + sy(y) + '" x2="' + (x0 + pw) + '" y2="' + sy(y) + '" stroke="#edf1f5" stroke-width="1"/>');
    });

    // axes
    parts.push('<line x1="' + x0 + '" y1="' + (y0 + ph) + '" x2="' + (x0 + pw) + '" y2="' + (y0 + ph) + '" stroke="#c9d2dc" stroke-width="1"/>');
    parts.push('<line x1="' + x0 + '" y1="' + y0 + '" x2="' + x0 + '" y2="' + (y0 + ph) + '" stroke="#c9d2dc" stroke-width="1"/>');

    // x ticks
    xs.forEach(function (x) {
      if (x < xMin || x > xMax) return;
      parts.push('<line x1="' + sx(x) + '" y1="' + (y0 + ph) + '" x2="' + sx(x) + '" y2="' + (y0 + ph + 5) + '" stroke="#b9c4cf" stroke-width="1"/>');
      parts.push('<text x="' + sx(x) + '" y="' + (y0 + ph + 16) + '" text-anchor="middle" font-size="' + fs.tick + '" fill="#5b6572">' + fmt(x) + '</text>');
    });

    // y ticks
    ys.forEach(function (y) {
      if (y < yMin || y > yMax) return;
      parts.push('<line x1="' + (x0 - 5) + '" y1="' + sy(y) + '" x2="' + x0 + '" y2="' + sy(y) + '" stroke="#b9c4cf" stroke-width="1"/>');
      parts.push('<text x="' + (x0 - 8) + '" y="' + (sy(y) + 4) + '" text-anchor="end" font-size="' + fs.tick + '" fill="#5b6572">' + fmt(y) + '</text>');
    });

    // axis labels
    parts.push('<text x="' + (x0 + pw / 2) + '" y="' + (H - 8) + '" text-anchor="middle" font-size="' + fs.axisLabel + '" fill="#5b6572">' + esc(cfg.xLabel || '') + '</text>');
    parts.push('<text x="14" y="' + (y0 + ph / 2) + '" text-anchor="middle" font-size="' + fs.axisLabel + '" fill="#5b6572" transform="rotate(-90 14 ' + (y0 + ph / 2) + ')">' + esc(cfg.yLabel || '') + '</text>');

    // therapeutic window
    if (cfg.window && isFinite(cfg.window.lo) && isFinite(cfg.window.hi)) {
      parts.push('<rect x="' + x0 + '" y="' + sy(Math.max(yMin, cfg.window.lo)) + '" width="' + pw + '" height="' + Math.max(0, sy(Math.min(yMax, cfg.window.hi)) - sy(Math.max(yMin, cfg.window.lo))) + '" fill="rgba(217,119,6,0.08)"/>');
      parts.push('<line x1="' + x0 + '" y1="' + sy(cfg.window.lo) + '" x2="' + (x0 + pw) + '" y2="' + sy(cfg.window.lo) + '" stroke="#d97706" stroke-width="1.5" stroke-dasharray="4 4"/>');
      parts.push('<line x1="' + x0 + '" y1="' + sy(cfg.window.hi) + '" x2="' + (x0 + pw) + '" y2="' + sy(cfg.window.hi) + '" stroke="#d97706" stroke-width="1.5" stroke-dasharray="4 4"/>');
    }

    // bands
    if (cfg.bands) {
      cfg.bands.forEach(function (b) {
        if (!b.x || !b.lo || !b.hi) return;
        var len = Math.min(b.x.length, b.lo.length, b.hi.length);
        if (len < 2) return;
        var d = [];
        var started = false;
        for (var i = 0; i < len; i++) {
          var x = b.x[i], lo = b.lo[i], hi = b.hi[i];
          if (!isFinite(x) || !isFinite(lo) || !isFinite(hi)) continue;
          d.push((started ? 'L ' : 'M ') + sx(x) + ' ' + sy(lo));
          started = true;
        }
        for (var i = len - 1; i >= 0; i--) {
          var x = b.x[i], hi = b.hi[i];
          if (!isFinite(x) || !isFinite(hi)) continue;
          d.push((started ? 'L ' : 'M ') + sx(x) + ' ' + sy(hi));
          started = true;
        }
        if (!started) return;   // never emit an empty/Z-only path
        d.push('Z');
        parts.push('<path d="' + d.join(' ') + '" fill="' + (b.fill || 'rgba(14,116,144,0.14)') + '" stroke="none"/>');
      });
    }

    // series
    if (cfg.series) {
      cfg.series.forEach(function (s) {
        if (!s.x || !s.y) return;
        var len = Math.min(s.x.length, s.y.length);
        if (len < 2) return;
        var d = [];
        var started = false;
        for (var i = 0; i < len; i++) {
          var x = s.x[i], y = s.y[i];
          if (!isFinite(x) || !isFinite(y)) continue;
          d.push((started ? 'L ' : 'M ') + sx(x) + ' ' + sy(y));
          started = true;
        }
        if (!started) return;   // never emit an empty path
        parts.push('<path d="' + d.join(' ') + '" fill="none" stroke="' + (s.color || '#0e7490') + '" stroke-width="' + (s.width || 2.25) + '" stroke-linecap="round" stroke-linejoin="round"' + (s.dash ? ' stroke-dasharray="' + s.dash + '"' : '') + '/>');
      });
    }

    // points
    if (cfg.points) {
      cfg.points.forEach(function (p) {
        if (!isFinite(p.x) || !isFinite(p.y)) return;
        parts.push('<circle cx="' + sx(p.x) + '" cy="' + sy(p.y) + '" r="4" fill="' + (p.color || '#dc2626') + '"' + (p.hollow ? ' stroke="white" stroke-width="2"' : '') + '/>');
      });
    }

    // vertical lines
    if (cfg.vlines) {
      cfg.vlines.forEach(function (v) {
        if (!isFinite(v.x)) return;
        var style = 'stroke:' + (v.color || '#94a3b8') + ';stroke-width:' + (v.width || 1) + ';';
        if (v.dash) style += 'stroke-dasharray:' + v.dash + ';';
        parts.push('<line x1="' + sx(v.x) + '" y1="' + y0 + '" x2="' + sx(v.x) + '" y2="' + (y0 + ph) + '" style="' + style + '"/>');
      });
    }

    // horizontal lines
    if (cfg.hlines) {
      cfg.hlines.forEach(function (h) {
        if (!isFinite(h.y)) return;
        var style = 'stroke:' + (h.color || '#d97706') + ';stroke-width:' + (h.width || 1.5) + ';';
        if (h.dash) style += 'stroke-dasharray:' + h.dash + ';';
        parts.push('<line x1="' + x0 + '" y1="' + sy(h.y) + '" x2="' + (x0 + pw) + '" y2="' + sy(h.y) + '" style="' + style + '"/>');
      });
    }

    // legend
    if (cfg.legend && cfg.legend.length) {
      var lgX = x0 + 8, lgY = y0 + 8;
      var iw2 = pw - 16;
      cfg.legend.forEach(function (it) {
        var labelW = Math.min(iw2, it.label.length * (fs.legend * 0.56) + 24);
        var sw = 14;
        if (it.swatch === 'dot') {
          parts.push('<circle cx="' + (lgX + sw / 2) + '" cy="' + (lgY + sw / 2) + '" r="3" fill="' + (it.color || '#5b6572') + '"/>');
        } else if (it.swatch === 'line') {
          parts.push('<line x1="' + lgX + '" y1="' + (lgY + sw / 2) + '" x2="' + (lgX + sw) + '" y2="' + (lgY + sw / 2) + '" stroke="' + (it.color || '#5b6572') + '" stroke-width="2"' + (it.dash ? ' stroke-dasharray="' + it.dash + '"' : '') + '/>');
        } else if (it.swatch === 'band') {
          parts.push('<rect x="' + lgX + '" y="' + (lgY + 2) + '" width="' + sw + '" height="6" fill="' + (it.color || 'rgba(14,116,144,0.4)') + '"/>');
        }
        parts.push('<text x="' + (lgX + sw + 5) + '" y="' + (lgY + sw / 2 + 4) + '" font-size="' + fs.legend + '" fill="#5b6572">' + esc(it.label) + '</text>');
        lgX += labelW + 8;
        if (lgX > x0 + pw - 8) {
          lgX = x0 + 8; lgY += fs.legend + 14;
        }
      });
    }

    parts.push('</svg>');
    el.innerHTML = parts.join('');
  }

  /* F23: the x-range must cover the whole curve AND every plotted point, never less than the curve
   * itself. (render() skips anything outside [xMin, xMax], so a narrower range silently hides samples.) */
  function xRange(gridX, pointXs) {
    var all = gridX.concat(pointXs || []).filter(isFinite);
    if (!all.length) return { xMin: 0, xMax: 1 };
    return { xMin: Math.min.apply(null, all), xMax: Math.max.apply(null, all) };
  }

  ECU.chart = {
    render: render,
    xRange: xRange,
    niceTicks: niceTicks,
    logTicks: logTicks
  };

})(typeof window !== 'undefined' ? window : globalThis);
