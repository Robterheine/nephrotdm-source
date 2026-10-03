/* =========================================================================
 * MPA TDM — Bayesian engine (MAP + MCMC posterior + AUC summary)
 *
 * Time unit: HOURS everywhere.
 *
 * OFV(eta) = eta' Omega^-1 eta + Gaussian residual (with log-variance).
 * Posterior: random-walk Metropolis started at MAP, proposal from Laplace cov.
 * AUC0-tau: integrate each posterior curve over [t_last, t_last+tau] in hours.
 * Trough: C(t_last + tau), not min(curve).
 * ========================================================================= */
(function (root) {
  'use strict';
  var ECU = root.ECU = root.ECU || {};
  var M = ECU.model;

  /* Yield to the event loop at most every ~50 ms. `await Promise.resolve()` only yields to microtasks, so the page never repainted
   * during a fit (progress bar frozen, tab unresponsive); a macrotask yield lets it. Throttled so tests and fast fits pay nothing. */
  var _lastYield = 0, _mc = null, _waiting = [];
  function macroYield() {
    return new Promise(function (resolve) {
      // Browsers: a MessageChannel message is a task with no timer clamping (setTimeout(0) is held to ~4 ms once chained).
      // Node: no page to repaint; setTimeout, because an idle message port would let the process exit with a promise pending.
      if (typeof MessageChannel !== 'undefined' && typeof window !== 'undefined') {
        if (!_mc) { _mc = new MessageChannel(); _mc.port1.onmessage = function () { var f = _waiting.shift(); if (f) f(); }; }
        _waiting.push(resolve);
        _mc.port2.postMessage(0);
      } else setTimeout(resolve, 0);
    });
  }
  function yieldDue() {
    // A hidden page has nothing to repaint, and browsers throttle timers and tasks there: do not yield, just compute.
    if (typeof document !== 'undefined' && document.hidden) return null;
    var now = Date.now();
    if (now - _lastYield < 50) return null;
    _lastYield = now;
    return macroYield();
  }

  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function gaussFactory(rng) {
    var spare = null;
    return function () {
      if (spare !== null) { var v = spare; spare = null; return v; }
      var u, vv, s;
      do { u = rng() * 2 - 1; vv = rng() * 2 - 1; s = u * u + vv * vv; }
      while (s === 0 || s >= 1);
      var f = Math.sqrt(-2 * Math.log(s) / s);
      spare = vv * f;
      return u * f;
    };
  }

  /* Inverse of a symmetric positive-definite matrix (Cholesky); null if it is not positive definite. */
  function invertSPD(A) {
    var n = A.length, L = choleskyDecomp(A), i, j, k;
    if (!L) return null;
    var inv = [];
    for (i = 0; i < n; i++) inv.push(new Array(n).fill(0));
    for (var c = 0; c < n; c++) {
      var y = new Array(n).fill(0), x = new Array(n).fill(0);
      for (i = 0; i < n; i++) { var t = (i === c ? 1 : 0); for (k = 0; k < i; k++) t -= L[i][k] * y[k]; y[i] = t / L[i][i]; }
      for (i = n - 1; i >= 0; i--) { var u = y[i]; for (k = i + 1; k < n; k++) u -= L[k][i] * x[k]; x[i] = u / L[i][i]; }
      for (j = 0; j < n; j++) inv[j][c] = x[j];
    }
    return inv;
  }
  function omegaQuadVec(om, eta) {
    if (om.cov) {   // correlated prior: η'Ω⁻¹η with the precision matrix cached on the object
      if (!om.P) om.P = invertSPD(om.cov);
      if (om.P) {
        var P = om.P, m = eta.length, q = 0, a, b;
        for (a = 0; a < m; a++) { var ra = P[a], ea = eta[a]; if (ea === 0) continue; for (b = 0; b < m; b++) q += ea * ra[b] * eta[b]; }
        return q;
      }
    }
    var vars = om.vars || [0.1, 0.1];
    var n = eta.length, s = 0, i;
    for (i = 0; i < n; i++) {
      var v = vars[i] != null ? vars[i] : 1;
      if (!(v > 0)) v = 1e-9;
      s += eta[i] * eta[i] / v;
    }
    return s;
  }

  /* Sampling budget (F1) and the convergence bar (F7). The kernel is cheap once
   * the likelihood is closed-form (~1 µs/iteration), so the budget is set by
   * what the printed probabilities need: R̂ < 1.01 and ESS > 400 on every eta and
   * on log AUC12 (docs/METHODS_AUDIT_V101.md §6). */
  var MCMC_ITERS = 800000;     // total across chains (8 × 100 000): R̂ < 1.01 on 16/16 study fits
  var KEEP_TOTAL = 32000;      // pooled posterior draws kept: seed-to-seed P(window) within 1 pp
  var PICTURE_DRAWS = 500;     // draws behind the chart band; the numbers use every kept draw
  var RHAT_MAX = 1.01;
  var ESS_MIN = 400;

  var RECENCY_TAU_H = 365 * 24;
  var RECENCY_MAX = { off: 1, low: 1.5, medium: 2, high: 3 };
  function recencyMaxMult(preset) {
    var v = RECENCY_MAX[preset];
    return typeof v === 'number' && isFinite(v) && v >= 1 ? v : 1;
  }
  function recencyMult(preset, ageHours) {
    var mx = recencyMaxMult(preset);
    if (mx <= 1 || !(ageHours > 0)) return 1;
    return 1 + (mx - 1) * (1 - Math.exp(-ageHours / RECENCY_TAU_H));
  }

  /* makeOfv(ctx): −2ln posterior kernel as ofv(eta, mixIdx).
   * ctx.form / ctx.mixPrior enable the formulation covariate and the tlag
   * mixture (the −2·ln p_m prior term is included so joint MAP over (η, m)
   * and membership Metropolis moves are correctly Bayes).
   * SIGMA.LOG (de Winter): additive error on ln(C) — (ln obs − ln pred)²/σ² +
   * ln σᵢ². Every sample is a quantified concentration; censored (“< LLOQ”)
   * samples are not supported and runFit refuses them.
   * Legacy SIGMA.ADD/PROP (natural scale) is unchanged for the stub. */
  function makeOfv(ctx) {
    var obs = ctx.obs.slice().sort(function (a, b) { return a.t - b.t; });
    var times = obs.map(function (o) { return o.t; });
    var sig = (ctx.drug ? M.spec(ctx.drug) : M.drug()).SIGMA;
    var rtol = ctx.rtol != null ? ctx.rtol : 1e-6;
    var tNewest = times.length ? times[times.length - 1] : 0;
    var multI = obs.map(function (o) {
      return recencyMult(ctx.recency, tNewest - o.t);
    });
    var useLog = sig && sig.LOG != null && sig.LOG > 0;
    var logSd = useLog ? sig.LOG : 0;
    var toObs = (ctx.drug ? M.spec(ctx.drug) : M.drug()).custom && (ctx.drug ? M.spec(ctx.drug) : M.drug()).custom.toObs;   // plasma → whole blood (tacrolimus)
    var mixPrior = ctx.mixPrior || null;
    var mixPen = mixPrior ? mixPrior.map(function (p) { return -2 * Math.log(Math.max(p, 1e-12)); }) : null;
    function ofv(eta, mixIdx) {
      var m = mixIdx || 0;
      var p = M.indivParams(ctx.wt, ctx.age, ctx.renal, ctx.extra, eta, ctx.drug, ctx.form || null, m);
      var sim = M.simulate(ctx.doses, times, p, { rtol: rtol, id: ctx.drug, ss: ctx.ss });
      if (sim.failed) return Infinity;
      var s = omegaQuadVec(ctx.omega, eta);
      if (mixPen) s += mixPen[m] || 0;
      for (var i = 0; i < obs.length; i++) {
        var o = obs[i], pred = toObs ? toObs(sim.c[i], o.hct) : sim.c[i];
        if (useLog) {
          if (!(pred > 0)) return Infinity;
          var sdL = logSd * multI[i];
          if (!(o.c > 0)) return Infinity;
          var dL = (Math.log(o.c) - Math.log(pred)) / sdL;
          s += dL * dL + Math.log(sdL * sdL);
        } else {
          var v = Math.max(sig.ADD + sig.PROP * pred * pred, 1e-6) * multI[i] * multI[i];
          var sd = Math.sqrt(v);
          var d = (o.c - pred) / sd;
          s += d * d + Math.log(v);
        }
      }
      return s;
    }
    return ofv;
  }

  function nelderMead(f, x0, step, maxIter) {
    var n = x0.length;
    var pts = [{ x: x0.slice(), f: f(x0) }];
    if (!isFinite(pts[0].f)) return { x: x0.slice(), f: pts[0].f, ok: false };
    var i, j;
    for (i = 0; i < n; i++) {
      var xs = x0.slice(); xs[i] += step[i];
      pts.push({ x: xs, f: f(xs) });
    }
    var iter = 0;
    for (; iter < maxIter; iter++) {
      pts.sort(function (a, b) { return a.f - b.f; });
      var spread = Math.abs(pts[n].f - pts[0].f);
      var xspread = 0;
      for (i = 1; i <= n; i++) {
        for (j = 0; j < n; j++) xspread = Math.max(xspread, Math.abs(pts[i].x[j] - pts[0].x[j]));
      }
      if (spread < 1e-10 && xspread < 1e-7) break;
      var cen = new Array(n).fill(0);
      for (i = 0; i < n; i++) for (j = 0; j < n; j++) cen[j] += pts[i].x[j] / n;
      var worst = pts[n];
      var xr = cen.map(function (c, jj) { return c + (c - worst.x[jj]); });
      var fr = f(xr);
      var nw;
      if (isFinite(fr) && fr < pts[0].f) {
        var xe = cen.map(function (c, jj) { return c + 2 * (c - worst.x[jj]); });
        var fe = f(xe);
        nw = (isFinite(fe) && fe < fr) ? { x: xe, f: fe } : { x: xr, f: fr };
      } else if (isFinite(fr) && fr < pts[n - 1].f) {
        nw = { x: xr, f: fr };
      } else {
        var xc = cen.map(function (c, jj) { return c + 0.5 * (worst.x[jj] - c); });
        var fc = f(xc);
        if (isFinite(fc) && fc < worst.f) {
          nw = { x: xc, f: fc };
        } else {
          for (i = 1; i <= n; i++) {
            var xs2 = pts[0].x.map(function (c, jj) { return (c + pts[i].x[jj]) / 2; });
            pts[i] = { x: xs2, f: f(xs2) };
          }
          continue;
        }
      }
      pts[n] = nw;
    }
    pts.sort(function (a, b) { return a.f - b.f; });
    return { x: pts[0].x, f: pts[0].f, iters: iter, ok: true, converged: iter < maxIter };
  }

  function stepForOmega(omega) {
    var vars = omega && omega.vars ? omega.vars : [0.1, 0.1];
    var s = new Array(vars.length);
    for (var i = 0; i < vars.length; i++) {
      var sd = Math.sqrt(Math.max(vars[i], 1e-9));
      s[i] = Math.min(0.9, Math.max(0.15, 0.8 * sd));
    }
    return s;
  }

  function mapEstimate(ofv, step) {
    var n = step.length;
    var x0 = new Array(n);
    for (var i = 0; i < n; i++) x0[i] = 0;
    var best = nelderMead(ofv, x0, step, n <= 2 ? 300 : 500);
    if (!best.ok) return best;
    var small = step.map(function (s) { return Math.max(0.02, s * 0.2); });
    var r2 = nelderMead(ofv, best.x, small, 200);
    if (r2.ok && r2.f < best.f) best = r2;
    var tiny = step.map(function (s) { return Math.max(0.005, s * 0.05); });
    var r3 = nelderMead(ofv, best.x, tiny, 150);
    if (r3.ok && r3.f < best.f) best = r3;
    return best;
  }

  /* Quasi-Newton MAP for higher-dimensional posteriors (tacrolimus with one κ pair per sampled
   * occasion): BFGS with central-difference gradients and an Armijo line search, started at η = 0
   * with the prior covariance as the initial inverse Hessian. Nelder–Mead does not converge
   * reliably beyond ~8 dimensions. */
  function mapBFGS(ofv, vars) {
    var n = vars.length, i, j;
    var x = new Array(n).fill(0), fx = ofv(x);
    if (!isFinite(fx)) return { x: x, f: fx, ok: false };
    function grad(xx) {
      var g = new Array(n), h = 1e-5;
      for (var k = 0; k < n; k++) {
        var xp = xx.slice(), xm = xx.slice(); xp[k] += h; xm[k] -= h;
        var fp = ofv(xp), fm = ofv(xm);
        g[k] = (isFinite(fp) && isFinite(fm)) ? (fp - fm) / (2 * h) : NaN;
      }
      return g;
    }
    var H = [];
    for (i = 0; i < n; i++) { H.push(new Array(n).fill(0)); H[i][i] = 0.5 * Math.max(vars[i], 1e-6); }
    var g = grad(x), iter, converged = false;
    for (iter = 0; iter < 400; iter++) {
      if (g.some(function (v) { return !isFinite(v); })) break;
      var gn = 0; for (i = 0; i < n; i++) gn = Math.max(gn, Math.abs(g[i]));
      if (gn < 1e-6) { converged = true; break; }
      var d = new Array(n).fill(0);
      for (i = 0; i < n; i++) for (j = 0; j < n; j++) d[i] -= H[i][j] * g[j];
      var slope = 0; for (i = 0; i < n; i++) slope += d[i] * g[i];
      if (!(slope < 0)) { for (i = 0; i < n; i++) { for (j = 0; j < n; j++) H[i][j] = i === j ? 0.5 * Math.max(vars[i], 1e-6) : 0; } for (i = 0; i < n; i++) d[i] = -H[i][i] * g[i]; slope = 0; for (i = 0; i < n; i++) slope += d[i] * g[i]; }
      var step = 1, xn, fn, ok = false;
      for (var ls = 0; ls < 40; ls++) {
        xn = x.map(function (v, k) { return v + step * d[k]; });
        fn = ofv(xn);
        if (isFinite(fn) && fn <= fx + 1e-4 * step * slope) { ok = true; break; }
        step *= 0.5;
      }
      if (!ok) { converged = gn < 1e-3; break; }
      var gnew = grad(xn);
      if (gnew.some(function (v) { return !isFinite(v); })) { x = xn; fx = fn; break; }
      var sv = new Array(n), yv = new Array(n), sy = 0;
      for (i = 0; i < n; i++) { sv[i] = xn[i] - x[i]; yv[i] = gnew[i] - g[i]; sy += sv[i] * yv[i]; }
      var dec = fx - fn;
      x = xn; fx = fn; g = gnew;
      if (sy > 1e-12) {
        var Hy = new Array(n).fill(0), yHy = 0;
        for (i = 0; i < n; i++) for (j = 0; j < n; j++) Hy[i] += H[i][j] * yv[j];
        for (i = 0; i < n; i++) yHy += yv[i] * Hy[i];
        for (i = 0; i < n; i++) for (j = 0; j < n; j++) {
          H[i][j] += (1 + yHy / sy) * sv[i] * sv[j] / sy - (Hy[i] * sv[j] + sv[i] * Hy[j]) / sy;
        }
      }
      if (dec < 1e-12 && gn < 1e-3) { converged = true; break; }
    }
    return { x: x, f: fx, ok: true, iters: iter, converged: converged || iter < 400 };
  }

  function choleskyDecomp(A) {
    var n = A.length, L = new Array(n);
    for (var i = 0; i < n; i++) { L[i] = new Array(n).fill(0); }
    for (var k = 0; k < n; k++) {
      var s = 0; for (var j = 0; j < k; j++) s += L[k][j] * L[k][j];
      var d = A[k][k] - s;
      if (!(d > 1e-12)) return null;
      L[k][k] = Math.sqrt(d);
      for (var ii = k + 1; ii < n; ii++) {
        var s2 = 0; for (var jj = 0; jj < k; jj++) s2 += L[ii][jj] * L[k][jj];
        L[ii][k] = (A[ii][k] - s2) / L[k][k];
      }
    }
    return L;
  }

  function priorDraws(n, omega, rng) {
    var g = gaussFactory(rng);
    var vars = omega && omega.vars ? omega.vars : [0.1, 0.1];
    var dim = vars.length;
    var A = [];
    var i, j;
    for (i = 0; i < dim; i++) {
      A[i] = [];
      for (j = 0; j < dim; j++) A[i][j] = (omega && omega.cov) ? omega.cov[i][j] : (i === j ? Math.max(vars[i], 1e-9) : 0);
    }
    var L = choleskyDecomp(A);
    if (!L) {
      L = [];
      for (i = 0; i < dim; i++) {
        L[i] = new Array(dim).fill(0);
        L[i][i] = Math.sqrt(Math.max(1e-9, vars[i]));
      }
    }
    var out = [];
    for (var d = 0; d < n; d++) {
      var z = new Array(dim);
      for (i = 0; i < dim; i++) z[i] = g();
      var v = new Array(dim).fill(0);
      for (i = 0; i < dim; i++) for (j = 0; j <= i; j++) v[i] += L[i][j] * z[j];
      out.push(v);
    }
    return out;
  }

  function subsample(arr, n) {
    if (arr.length <= n) return arr.slice();
    var step = arr.length / n, out = [];
    for (var i = 0; i < n; i++) out.push(arr[Math.floor(i * step)]);
    return out;
  }

  /* simOpts = { ss, aucWindow } (both optional, see M.simulate). With an
   * aucWindow the returned matrix also carries `.auc`: the exact window AUC per
   * draw where the closed form applies, NaN where it does not (use aucOfDraw). */
  async function simulateDraws(draws, mixes, doses, times, wt, age, renal, extra, drugId, form, onProgress, chunk, simOpts) {
    var mat = new Array(draws.length);
    var aucs = simOpts && simOpts.aucWindow ? new Array(draws.length) : null;
    for (var d = 0; d < draws.length; d++) {
      var p = M.indivParams(wt, age, renal, extra, draws[d], drugId, form || null, mixes ? (mixes[d] || 0) : 0);
      var sim = M.simulate(doses, times, p, { rtol: 1e-6, id: drugId, ss: simOpts && simOpts.ss, aucWindow: simOpts && simOpts.aucWindow });
      mat[d] = sim.failed ? null : (simOpts && simOpts.post ? simOpts.post(sim.c) : sim.c);
      if (aucs) aucs[d] = sim.failed || sim.auc === undefined ? NaN : sim.auc;
      if (onProgress && d % (chunk || 64) === 0) {
        if (onProgress(d / draws.length)) { var yd = yieldDue(); if (yd) await yd; }
      }
    }
    if (aucs) mat.auc = aucs;
    return mat;
  }

  function drawMixIdx(prior, rng) {
    var u = rng(), acc = 0;
    for (var k = 0; k < prior.length; k++) { acc += prior[k]; if (u < acc) return k; }
    return prior.length - 1;
  }

  function varOf(chain) {
    var n = chain.length;
    if (n < 2) return NaN;
    var m = 0;
    for (var i = 0; i < n; i++) if (isFinite(chain[i])) m += chain[i];
    m /= n;
    var v = 0, c = 0;
    for (var j = 0; j < n; j++) if (isFinite(chain[j])) { v += (chain[j] - m) * (chain[j] - m); c++; }
    return c > 1 ? v / (c - 1) : NaN;
  }

  /* ESS from the lag-1 autocorrelation: N(1−ρ)/(1+ρ) (ST3). */
  function essOf(chain) {
    var n = chain.length;
    if (n < 10) return n;
    var m = 0;
    for (var i = 0; i < n; i++) m += chain[i];
    m /= n;
    var v = 0, c = 0;
    for (i = 0; i < n; i++) { v += (chain[i] - m) * (chain[i] - m); c++; }
    if (!(v > 0)) return n;
    var cv = 0;
    for (i = 0; i < n - 1; i++) cv += (chain[i] - m) * (chain[i + 1] - m);
    var rho = (cv / (n - 1)) / (v / n);
    if (!(rho > -0.99 && rho < 0.99)) return 1;
    return Math.max(1, Math.min(n, n * (1 - rho) / (1 + rho)));
  }

  /* Split-R̂ and bulk ESS of one quantity from its per-chain draws (F7).
   * Each chain is cut in two so within-chain drift shows up as disagreement;
   * R̂ is the Gelman–Rubin ratio of the pooled to the within-chain variance,
   * ESS is m·n / (1 + 2Σρ) with the multi-chain autocorrelation ρ summed in
   * Geyer pairs until a pair turns negative. A constant quantity (nothing left
   * to disagree about) returns R̂ = 1 and ESS = total draws. */
  function convergenceOf(chains) {
    var split = [], c, i, j, h;
    for (c = 0; c < chains.length; c++) {
      h = Math.floor(chains[c].length / 2);
      if (h < 2) continue;
      split.push(chains[c].slice(0, h), chains[c].slice(h, 2 * h));
    }
    var m = split.length;
    if (m < 2) return { rhat: NaN, ess: NaN };
    var n = split[0].length;
    var mean = new Array(m), varW = 0, grand = 0;
    for (j = 0; j < m; j++) {
      var s = 0;
      for (i = 0; i < n; i++) s += split[j][i];
      mean[j] = s / n;
      var ss = 0;
      for (i = 0; i < n; i++) ss += (split[j][i] - mean[j]) * (split[j][i] - mean[j]);
      varW += ss / (n - 1) / m;
      grand += mean[j] / m;
    }
    var B_ = 0;
    for (j = 0; j < m; j++) B_ += (mean[j] - grand) * (mean[j] - grand);
    B_ *= n / (m - 1);
    if (!(varW > 0)) return { rhat: 1, ess: m * n };
    var varPlus = (n - 1) / n * varW + B_ / n;
    var rho = [1], pairSum = 0, t;
    for (t = 1; t < n - 1; t++) {
      var a = 0;
      for (j = 0; j < m; j++) {
        var cv = 0, x = split[j];
        for (i = 0; i + t < n; i++) cv += (x[i] - mean[j]) * (x[i + t] - mean[j]);
        a += cv / n;
      }
      rho.push(1 - (varW - a / m) / varPlus);
      if (t % 2 === 1) {
        var pair = rho[t - 1] + rho[t];
        if (pair < 0) break;
        pairSum += pair;
      }
    }
    var tau = Math.max(-1 + 2 * pairSum, 1 / Math.log10(m * n));
    return { rhat: Math.sqrt(varPlus / varW), ess: m * n / tau };
  }

  /* Convergence of a fit from its pooled draws, which are stored chain after
   * chain (chainLens[c] draws each). `ok` is the audit's bar — R̂ < 1.01 and
   * ESS ≥ 400 — applied to the quantities the app PRINTS: log AUC12 and log
   * trough. The window indicator's ESS gives the Monte Carlo error of the printed
   * probability, and every eta's R̂/ESS is reported, but a slowly mixing nuisance
   * eta (V2, TLAG_EVE) does not fail the bar: the calibration study found those
   * failing in up to half the fits while the AUC matched the independent reference
   * to 0.4 pp. Chains are trimmed to the shortest so the split is even. */
  function fitConvergence(draws, chainLens, auc12, troughs, winLo, winHi, nEta, etaNames) {
    if (!chainLens || !chainLens.length) return null;
    var starts = [], acc = 0, lens = [];
    chainLens.forEach(function (l) { starts.push(acc); acc += l; if (l >= 4) lens.push(l); });
    if (!lens.length) return null;
    var n = Math.min.apply(null, lens);
    function stat(get) {
      var chains = [], finite = true;
      chainLens.forEach(function (l, c) {
        if (l < 4) return;   // a chain whose start failed left one draw
        var a = [];
        for (var i = 0; i < n; i++) { var v = get(starts[c] + i); if (!isFinite(v)) finite = false; a.push(v); }
        chains.push(a);
      });
      return finite ? convergenceOf(chains) : { rhat: NaN, ess: NaN };
    }
    var rhatEta = [], essEta = [], etaSlow = [], e, r;
    for (e = 0; e < nEta; e++) {
      r = stat(function (i) { return draws[i][e]; });
      rhatEta.push(r.rhat); essEta.push(r.ess);
      if (!(r.rhat < RHAT_MAX && r.ess >= ESS_MIN) && etaNames) etaSlow.push(etaNames[e]);
    }
    var la = stat(function (i) { return Math.log(auc12[i]); });
    var lt = stat(function (i) { return Math.log(troughs[i]); });
    var ind = stat(function (i) { return auc12[i] > winLo && auc12[i] < winHi ? 1 : 0; });
    var rhat = Math.max.apply(null, [la.rhat, lt.rhat].filter(isFinite));
    var essMin = Math.min.apply(null, [la.ess, lt.ess].filter(isFinite));
    return {
      rhat: rhat, essMin: essMin, essIn: ind.ess,
      rhatEta: rhatEta, essEta: essEta, etaSlow: etaSlow,
      rhatAuc: la.rhat, essAuc: la.ess, rhatTrough: lt.rhat, essTrough: lt.ess,
      ok: rhat < RHAT_MAX && essMin >= ESS_MIN
    };
  }

  /* Posterior shrinkage per eta (ST4): Var(η_post)/ω² — 1 = the samples left the population variance in place (the
   * estimate is the prior), 0 = they pinned the parameter down. Information gained is 1 − shrinkage. Until v1.1.1 this
   * returned 1 − Var/ω² under the name "shrinkage", which read backwards everywhere it was shown or thresholded. */
  function shrinkageOf(draws, omegaVars) {
    var out = new Array(omegaVars.length);
    for (var i = 0; i < omegaVars.length; i++) {
      var col = draws.map(function (d) { return d[i]; }).filter(isFinite);
      var v = varOf(col);
      out[i] = (isFinite(v) && omegaVars[i] > 0) ? Math.max(0, Math.min(1, v / omegaVars[i])) : NaN;
    }
    return out;
  }

  /* MCMC over (η, m): η random-walk from the Laplace proposal plus a
   * membership Metropolis move proposed from the mixture prior. The target
   * carries that prior too (the −2ln p_m term sits inside ofv), so the Hastings
   * ratio q(m)/q(m′) = p_m/p_m′ is NOT 1 and must be applied (F2). Switches are counted as the discrete-move mixing
   * diagnostic (ST3/ST6). */
  async function runMCMCMix(ofv, mixPrior, x0, mix0, cov, opts, rng, onProgress) {
    opts = opts || {};
    var n = x0.length, K = mixPrior.length;
    var iters = opts.iters || 4000;
    var maxKeep = opts.maxKeep || 1000;
    var burn = Math.floor(iters * 0.4);
    var keepEvery = Math.max(1, Math.floor((iters - burn) / maxKeep));
    var x = x0.slice(), m = mix0 || 0;
    var fx = ofv(x, m);
    if (!isFinite(fx)) return { draws: [x.slice()], mixChain: [m], acceptance: 0, switches: 0 };
    var L = null;
    if (cov && cov.length === n) L = choleskyDecomp(cov);
    if (!L) {
      L = [];
      for (var ii = 0; ii < n; ii++) {
        L[ii] = new Array(n).fill(0);
        L[ii][ii] = 0.2;
      }
    }
    var g = gaussFactory(rng);
    var draws = [], mixChain = [], acc = 0, tot = 0, switches = 0;
    var i, j, k;
    for (i = 0; i < iters; i++) {
      var z = new Array(n);
      for (k = 0; k < n; k++) z[k] = g();
      var prop = new Array(n);
      for (k = 0; k < n; k++) {
        prop[k] = x[k];
        for (j = 0; j <= k; j++) prop[k] += L[k][j] * z[j];
      }
      var fprop = ofv(prop, m);
      var accepted = false;
      if (isFinite(fprop)) {
        var logr = -0.5 * (fprop - fx);
        if (Math.log(rng() + 1e-300) < logr) { x = prop.slice(); fx = fprop; accepted = true; }
      }
      if (accepted) acc++;
      tot++;
      // membership move every 5 iterations (proposed from the prior)
      if (K > 1 && i % 5 === 0) {
        var m2 = drawMixIdx(mixPrior, rng);
        if (m2 !== m) {
          var f2 = ofv(x, m2);
          var logr = -0.5 * (f2 - fx) + Math.log(mixPrior[m]) - Math.log(mixPrior[m2]);   // Hastings: q(m)/q(m′) = p_m/p_m′
          if (isFinite(f2) && Math.log(rng() + 1e-300) < logr) {
            m = m2; fx = f2; switches++;
          }
        }
      }
      if (i >= burn && ((i - burn) % keepEvery === 0)) { draws.push(x.slice()); mixChain.push(m); }
      if (onProgress && i % 200 === 0) {
        if (onProgress((i + 1) / iters)) { var yi = yieldDue(); if (yi) await yi; }
      }
    }
    return { draws: draws, mixChain: mixChain, acceptance: tot ? acc / tot : 0, switches: switches };
  }

  function quantileSorted(sorted, q) {
    if (!sorted.length) return NaN;
    var pos = (sorted.length - 1) * q;
    var lo = Math.floor(pos), hi = Math.ceil(pos);
    if (lo === hi) return sorted[lo];
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
  }
  function statsOfChain(values) {
    var a = [];
    for (var i = 0; i < values.length; i++) if (isFinite(values[i])) a.push(values[i]);
    a.sort(function (p, q) { return p - q; });
    if (!a.length) return { p5: NaN, median: NaN, p95: NaN };
    return { p5: quantileSorted(a, 0.05), median: quantileSorted(a, 0.5), p95: quantileSorted(a, 0.95) };
  }
  function bandOfMatrix(mat, nTimes) {
    var p5 = new Array(nTimes), med = new Array(nTimes), p95 = new Array(nTimes);
    for (var t = 0; t < nTimes; t++) {
      var col = [];
      for (var d = 0; d < mat.length; d++) {
        if (mat[d] && isFinite(mat[d][t])) col.push(mat[d][t]);
      }
      var st = statsOfChain(col);
      p5[t] = st.p5; med[t] = st.median; p95[t] = st.p95;
    }
    return { p5: p5, median: med, p95: p95 };
  }

  function aucOfCurve(c, intervalHours, times) {
    return M.aucFromConc(c, intervalHours, times);
  }

  // Window AUC of draw d: the exact value from simulateDraws when it has one, else the trapezoid.
  function aucOfDraw(mat, d, intervalHours, times) {
    return mat.auc && isFinite(mat.auc[d]) ? mat.auc[d] : aucOfCurve(mat[d], intervalHours, times);
  }

  function probAbove(values, threshold) {
    var ok = 0, n = 0;
    for (var i = 0; i < values.length; i++) {
      if (isFinite(values[i])) { n++; if (values[i] > threshold) ok++; }
    }
    return n ? ok / n : NaN;
  }
  function probBelow(values, threshold) {
    var ok = 0, n = 0;
    for (var i = 0; i < values.length; i++) {
      if (isFinite(values[i])) { n++; if (values[i] < threshold) ok++; }
    }
    return n ? ok / n : NaN;
  }
  function probBetween(values, lo, hi) {
    var ok = 0, n = 0;
    for (var i = 0; i < values.length; i++) {
      if (isFinite(values[i])) {
        n++;
        if (values[i] > lo && values[i] < hi) ok++;
      }
    }
    return n ? ok / n : NaN;
  }

  function laplaceCov(ofv, x) {
    var n = x.length;
    var h = 0.12;
    var H = new Array(n);
    var i, j;
    for (i = 0; i < n; i++) {
      H[i] = new Array(n).fill(0);
      var xp = x.slice(); xp[i] += h;
      var xm = x.slice(); xm[i] -= h;
      var fp = ofv(xp), fm = ofv(xm), f0 = ofv(x);
      if (!isFinite(fp) || !isFinite(fm) || !isFinite(f0)) return { cov: null, fallback: true };
      H[i][i] = (fp - 2 * f0 + fm) / (h * h);
    }
    for (i = 0; i < n; i++) {
      for (j = i + 1; j < n; j++) {
        var xpp = x.slice(); xpp[i] += h; xpp[j] += h;
        var xmm = x.slice(); xmm[i] -= h; xmm[j] -= h;
        var xpm = x.slice(); xpm[i] += h; xpm[j] -= h;
        var xmp = x.slice(); xmp[i] -= h; xmp[j] += h;
        var hij = (ofv(xpp) - ofv(xpm) - ofv(xmp) + ofv(xmm)) / (4 * h * h);
        H[i][j] = H[j][i] = hij;
      }
    }
    // Invert the FULL Hessian via Cholesky: cov ≈ 2·H⁻¹ for −2 ln p. The
    // diagonal-only version (kept as fallback) under-explored the correlated
    // posterior directions — V10 measured MMF coverage 65–75% with it; the
    // full-covariance proposal mixes along the correlations.
    var Lfull = choleskyDecomp(H);
    if (Lfull) {
      // H⁻¹ = (L⁻¹)ᵀ·L⁻¹; compute columns of L⁻¹ by forward substitution.
      var Mcol = [];   // Mcol[c][r] = (L⁻¹)[r][c]
      for (var c2 = 0; c2 < n; c2++) {
        var e2 = new Array(n).fill(0); e2[c2] = 1;
        var y2 = new Array(n);
        for (var r2 = 0; r2 < n; r2++) {
          var s2 = e2[r2];
          for (var k2 = 0; k2 < r2; k2++) s2 -= Lfull[r2][k2] * y2[k2];
          y2[r2] = s2 / Lfull[r2][r2];
        }
        Mcol.push(y2);
      }
      var covF = new Array(n);
      for (i = 0; i < n; i++) {
        covF[i] = new Array(n).fill(0);
        for (j = 0; j < n; j++) {
          var s3 = 0;
          for (var r3 = 0; r3 < n; r3++) s3 += Mcol[i][r3] * Mcol[j][r3];  // (MᵀM)[i][j]
          covF[i][j] = 2 * s3;
        }
      }
      // sanity: positive variances and finite entries
      var ok = true;
      for (i = 0; i < n && ok; i++) {
        if (!(covF[i][i] > 0) || !isFinite(covF[i][i])) ok = false;
        for (j = 0; j < n; j++) if (!isFinite(covF[i][j])) { ok = false; break; }
      }
      if (ok) return { cov: covF, fallback: false, full: true };
    }
    // Fallback: diagonal-only (as before)
    var cov = new Array(n);
    for (i = 0; i < n; i++) {
      cov[i] = new Array(n).fill(0);
      if (!(H[i][i] > 0)) return { cov: null, fallback: true };
      cov[i][i] = 2 / H[i][i];
    }
    return { cov: cov, fallback: false, full: false };
  }

  async function runMCMC(ofv, x0, cov, opts, rng, onProgress) {
    opts = opts || {};
    var n = x0.length;
    var iters = opts.iters || 4000;
    var maxKeep = opts.maxKeep || 1000;
    var burn = Math.floor(iters * 0.4);
    var keepEvery = Math.max(1, Math.floor((iters - burn) / maxKeep));
    var x = x0.slice();
    var fx = ofv(x);
    if (!isFinite(fx)) return { draws: [x.slice()], acceptance: 0, drawsAll: [] };
    var L = null;
    if (cov && cov.length === n) L = choleskyDecomp(cov);
    if (!L) {
      L = [];
      for (var ii = 0; ii < n; ii++) {
        L[ii] = new Array(n).fill(0);
        L[ii][ii] = 0.2;
      }
    }
    var g = gaussFactory(rng);
    var draws = [], acc = 0, tot = 0;
    var i, j, k;
    var sc = opts.scale != null ? opts.scale : 1;   // random-walk step scale (1 keeps the validated MPA sampler unchanged)
    var z = new Array(n), prop = new Array(n), swap;   // reused every iteration: ofv never keeps the vector it is given
    for (i = 0; i < iters; i++) {
      for (k = 0; k < n; k++) z[k] = g();
      for (k = 0; k < n; k++) {
        prop[k] = x[k];
        for (j = 0; j <= k; j++) prop[k] += sc * L[k][j] * z[j];
      }
      var fprop = ofv(prop);
      var accepted = false;
      if (isFinite(fprop)) {
        var logr = -0.5 * (fprop - fx);
        if (Math.log(rng() + 1e-300) < logr) { swap = x; x = prop; prop = swap; fx = fprop; accepted = true; }
      }
      if (accepted) acc++;
      tot++;
      if (i >= burn && ((i - burn) % keepEvery === 0)) draws.push(x.slice());
      if (onProgress && i % 200 === 0) {
        if (onProgress((i + 1) / iters)) { var yi = yieldDue(); if (yi) await yi; }
      }
    }
    return { draws: draws, acceptance: tot ? acc / tot : 0, drawsAll: draws };
  }

  function zeros(n) {
    var a = new Array(n);
    for (var i = 0; i < n; i++) a[i] = 0;
    return a;
  }

  /* F23: the grid the CHART is drawn on. It equals the AUC window grid unless a sample falls outside it,
   * in which case it is extended at the same spacing to cover every sample. The AUC, the trough and
   * fit.grid never see it (the window grid is what they integrate over). */
  function chartGridFor(outTimes, obsTimes) {
    var n = outTimes.length, first = outTimes[0], last = outTimes[n - 1], dt = (last - first) / (n - 1);
    var lo = first, hi = last;
    obsTimes.forEach(function (t) { if (isFinite(t)) { lo = Math.min(lo, t); hi = Math.max(hi, t); } });
    if (lo >= first && hi <= last) return outTimes;
    var kMin = Math.floor((lo - first) / dt), kMax = Math.ceil((hi - first) / dt);
    kMin = Math.max(kMin, -2000); kMax = Math.min(kMax, n - 1 + 2000);   // a mistyped date must not build a huge grid
    var g = [];
    for (var k = kMin; k <= kMax; k++) g.push(first + k * dt);
    return g;
  }

  /* ---- independent chains ------------------------------------------------------------------------------------------------
   * A chain is a pure function of plain data: the likelihood context, a start, a proposal covariance, a budget and a SEED.
   * Because the seed belongs to the chain (not to the order in which chains happen to run), the same fit gives the same draws
   * whether the chains run one after another in this thread or at the same time on a pool of Web Workers (src/parallel.js).
   * Used for drugs that declare `perChainSeeds` (tacrolimus); MPA keeps its validated single-stream sampler. */
  function chainSeed(base, c) {
    return ((((base >>> 0) ^ 0x9E3779B9) >>> 0) + Math.imul(c + 1, 0x85EBCA6B)) >>> 0;
  }
  async function runChainTask(task, onProgress) {
    var ofv = makeOfv(task.ctx);
    var r = await runMCMC(ofv, task.x0, task.cov, { iters: task.iters, maxKeep: task.maxKeep, scale: task.scale }, mulberry32(task.seed),
      onProgress ? function (f) { onProgress(f); return true; } : null);
    return { draws: r.draws, acceptance: r.acceptance };
  }
  /* executor(tasks, onProgress(taskIndex, fraction)) → Promise of the results, in task order */
  async function sequentialExecutor(tasks, onProgress) {
    var out = [];
    for (var c = 0; c < tasks.length; c++) {
      out.push(await runChainTask(tasks[c], onProgress ? (function (ci) { return function (f) { onProgress(ci, f); }; })(c) : null));
    }
    return out;
  }

  async function runFit(input, cb) {
    // Censored (“< LLOQ”) samples are not supported. Refuse them loudly: dropping one would silently
    // change the fit, and fitting it as a value (0, or the LLOQ) biases the AUC (measured −27 % for a zero).
    if ((input.obs || []).some(function (o) { return o.lloq; })) {
      throw new Error('Samples reported below the limit of quantification (“< LLOQ”) are not supported. Omit them; do not enter zero or the LLOQ as a concentration.');
    }
    var prog0 = cb && cb.progress ? cb.progress : function () {};
    // cb.cancelled() is polled at every progress report (every ~200 MCMC iterations); a true answer ends the fit with a cancellation error.
    var prog = function (f, msg) {
      if (cb && cb.cancelled && cb.cancelled()) { var ce = new Error('Forecast cancelled.'); ce.cancelled = true; throw ce; }
      prog0(f, msg);
    };
    var drug = input.drug || M.drug().id;
    if (!M.drugs[drug]) throw new Error('Unknown drug: ' + drug);
    M.select(drug);
    var s = M.drug();
    if (s.pending) {
      throw new Error(s.label + ' is prepared but its population PK parameters are not yet available (model file pending). Forecasting and AUC estimation are disabled.');
    }
    if (!s.THETA) throw new Error(s.label + ' has no THETA. The model file must complete the spec before forecasting can run.');
    if (!s.SIGMA) throw new Error(s.label + ' has no SIGMA. The model file must complete the residual error before forecasting can run.');

    var form = input.form || s.formDefault || null;
    var wt = input.wt;
    if (s.requiresWt === false && !(wt > 0)) wt = s.WT_REF || 70;  // weight is not a covariate here
    var age = input.age > 0 ? input.age : null;
    var renal = input.renal || null;
    var extra = input.extra || null;
    var custom = s.custom || null;

    var doses = input.doses.slice().sort(function (a, b) { return a.t - b.t; });
    var obs = (input.obs || [])
      .filter(function (o) { return isFinite(o.t) && isFinite(o.c); })
      .map(function (o) { return { t: o.t, c: o.c, hct: o.hct }; });
    // Drug-specific ingestion (tacrolimus): occasions, assay → model scale, haematocrit per sample.
    var prep = null;
    if (custom && custom.prepare) {
      prep = custom.prepare({ extra: extra, wt: wt, doses: doses, obs: obs, steadyState: !!input.steadyState });
      extra = prep.extra; doses = prep.doses; obs = prep.obs;
    }
    var dim = M.etaDim(drug, form, extra);
    var omegaF = M.omegaFull(drug, form, extra);
    var omega = { vars: omegaF.vars, cov: omegaF.cov, dims: dim };
    var etaNames = M.etaNamesFor(drug, form, extra);
    var mixPrior = M.mixPriorOf(drug, form);

    if (!doses.length) throw new Error('At least one dose is required to run a forecast.');
    if (!doses.some(function (d) { return d.amt > 0; })) throw new Error('At least one dose above 0 is required to run a forecast.');
    if (obs.some(function (o) { return !(o.c > 0); })) throw new Error('Concentrations must be above 0. A result below the limit of quantification cannot be used, so leave it out; do not enter 0.');
    var wtMin = s.wtMin != null ? s.wtMin : 3;
    var wtMax = s.wtMax != null ? s.wtMax : 300;
    if (s.requiresWt !== false && !(wt >= wtMin && wt <= wtMax)) {
      throw new Error('Body weight is required (' + wtMin + '–' + wtMax + ' kg).');
    }

    var rng = mulberry32(input.seed != null ? input.seed : 20250907);
    var intervalHours = input.intervalHours || s.ssIntervalDefault || 12;
    var lastDoseT = doses[doses.length - 1].t;
    // input.steadyState: the doses are the expanded history of an endless regimen
    // (UI "Steady state" mode). The exact periodic solution replaces the finite
    // history in every simulation; `doses` still drives the anchor and the report.
    var ssSpec = input.steadyState
      ? { amt: doses[doses.length - 1].amt, every: intervalHours, tEnd: lastDoseT, route: doses[doses.length - 1].route || 'oral', pred: doses[doses.length - 1].pred }
      : null;
    // Tacrolimus: the doses of sampled occasions stay explicit (their κ shifts the train); the rest is the exact train.
    var simDoses = ssSpec ? (custom ? doses.filter(function (d) { return d.delta; }) : []) : doses;
    // What the numbers refer to: for tacrolimus always the steady state of the LAST regimen on a typical day,
    // also when a finite history was entered (the history informs the fit, not the reported value).
    var repSS = custom ? { amt: doses[doses.length - 1].amt, every: intervalHours, tEnd: lastDoseT, route: 'oral', pred: doses[doses.length - 1].pred } : null;
    // F3: an entered history shorter than 5 terminal half-lives (typical patient) is not steady state.
    var historySpanH = lastDoseT - doses[0].t;
    var historyNeedH = 5 * M.terminalHalfLife(M.indivParams(wt, age, renal, extra, zeros(dim), drug, form || null, 0));
    var hctReport = prep ? prep.hctReport : null;
    var assayKey = prep ? prep.assay : null;
    var chartPost = custom ? function (cp) {
      return cp.map(function (v) { return custom.fromModel(custom.toObs(v, hctReport), assayKey); });
    } : null;
    // S12 auto-anchor (v1.0.1): for evening-ending mixed-lag schedules the
    // AUC window follows the most recent morning dose (the target refers to
    // morning-dose profiles). The OFV and observation predictions are
    // untouched — they use absolute times.
    var anchorInfo = M.aucAnchor(doses, drug, form);
    var aucT0 = isFinite(anchorInfo.t) ? anchorInfo.t : lastDoseT;
    // 4 points/hour: the sharp EC-MPS absorption onset needs ~48 points per
    // 12 h window to hold the trapezoid error ≲0.2% (V4 error budget).
    var outTimes = M.intervalGrid(aucT0, intervalHours, Math.max(24, Math.ceil(intervalHours * 4)));
    var chartTimes = chartGridFor(outTimes, obs.map(function (o) { return o.t; }));

    prog(0.02, 'Prior predictive simulation…');
    var priorEta = priorDraws(Math.max(400, input.priorDraws || 1000), omega, rng);
    var priorMix = mixPrior ? priorEta.map(function () { return drawMixIdx(mixPrior, rng); }) : null;
    var aucWin = [aucT0, aucT0 + intervalHours];
    var priorMat = await simulateDraws(priorEta, priorMix, simDoses, chartTimes, wt, age, renal, extra, drug, form, function (f) {
      prog(0.02 + 0.18 * f, 'Prior predictive simulation…');
      return true;
    }, 64, { ss: ssSpec, post: chartPost });

    var mapRes = null, covInfo = null, draws = null, acceptance = 0;
    var chainLens = null;   // draws per chain, in chain order — set only when MCMC ran
    var mixChain = null, mapMix = 0;
    if (obs.length) {
      var ctx = {
        wt: wt, age: age, renal: renal, extra: extra,
        drug: drug, doses: simDoses, ss: ssSpec, obs: obs,
        omega: omega, rtol: 1e-6,
        recency: input.recency || 'off',
        form: form, mixPrior: mixPrior
      };
      var ofv = makeOfv(ctx);
      prog(0.22, 'MAP estimation…');
      { var ym = yieldDue(); if (ym) await ym; }   // let the progress message paint before the (synchronous) MAP search
      if (mixPrior) {
        // Joint MAP over (η, m): the −2·ln p_m prior term sits inside ofv, so
        // each subgroup's converged OFV is directly comparable (E3).
        var bestMap = null;
        for (var mi = 0; mi < mixPrior.length; mi++) {
          var ofvM = (function (mm) { return function (eta) { return ofv(eta, mm); }; })(mi);
          var cand = mapEstimate(ofvM, stepForOmega(omega));
          if (cand.ok && isFinite(cand.f) && (!bestMap || cand.f < bestMap.f)) {
            bestMap = cand; mapMix = mi;
          }
        }
        mapRes = bestMap;
      } else if (custom) {
        mapRes = mapBFGS(ofv, omega.vars);
      } else {
        mapRes = mapEstimate(ofv, stepForOmega(omega));
      }
      if (!mapRes || !mapRes.ok || !isFinite(mapRes.f)) {
        throw new Error('MAP estimation failed. Please check inputs.');
      }
      var ofvAtMap = mixPrior ? function (eta) { return ofv(eta, mapMix); } : ofv;
      covInfo = laplaceCov(ofvAtMap, mapRes.x);
      // Multi-chain pooling (V10 finding): one chain starts at the MAP, the
      // others at disperse prior draws (random mixture membership). Same total
      // iteration budget — but the pooled draws cover the posterior support
      // from the start. A single MAP-started chain measured ESS ≈ 35 and
      // 65–75% AUC coverage (the sticky-chain tails were never visited);
      // disperse starts restore them.
      // v1.0.1: default raised 4 → 8 after the paired trough-cell study
      // (mmf-trough 80% → 90% at unchanged budget class; ec-trough unchanged;
      // per-chain floor 300 keeps the total at 8×300 = 2400 iterations).
      var nChains = input.chains != null ? Math.max(1, input.chains) : 8;
      var totalIters = input.mcmcIters || (typeof s.mcmcIters === 'function' ? s.mcmcIters(dim) : s.mcmcIters) || MCMC_ITERS;
      var perChain = Math.max(300, Math.floor(totalIters / nChains));
      var accSum = 0, accN = 0;
      draws = [];
      mixChain = mixPrior ? [] : null;
      chainLens = [];
      var seqChains = !(s.perChainSeeds && !mixPrior);
      if (!seqChains) {
        var baseSeed = input.seed != null ? input.seed : 20250907, tasks = [];
        for (var tc = 0; tc < nChains; tc++) {
          tasks.push({
            ctx: ctx, x0: tc === 0 ? mapRes.x.slice() : priorEta[(tc * 7919) % priorEta.length].slice(), cov: covInfo.cov,
            iters: perChain, maxKeep: Math.ceil(KEEP_TOTAL / nChains), scale: s.mcmcScale ? s.mcmcScale(dim) : 1, seed: chainSeed(baseSeed, tc)
          });
        }
        var frac = new Array(nChains).fill(0);
        var results = await ECU.bayes.chainExecutor(tasks, function (ci, f) {
          frac[ci] = f;
          var tot = 0; for (var q = 0; q < nChains; q++) tot += frac[q];
          prog(0.3 + 0.45 * (tot / nChains), 'MCMC posterior sampling…');
        });
        results.forEach(function (r) { draws = draws.concat(r.draws); chainLens.push(r.draws.length); accSum += r.acceptance; accN++; });
      }
      for (var ch = 0; seqChains && ch < nChains; ch++) {
        var x0c, m0c = mapMix;
        if (ch === 0) {
          x0c = mapRes.x.slice();
        } else {
          x0c = priorEta[(ch * 7919) % priorEta.length].slice();
          if (mixPrior) m0c = drawMixIdx(mixPrior, rng);
        }
        var mcmc;
        if (mixPrior) {
          mcmc = await runMCMCMix(ofv, mixPrior, x0c, m0c, covInfo.cov, {
            iters: perChain,
            maxKeep: Math.ceil(KEEP_TOTAL / nChains)
          }, rng, (function (chI) { return function (f) {
            prog(0.3 + 0.45 * ((chI + f) / nChains), 'MCMC posterior sampling…');
            return true;
          }; })(ch));
          draws = draws.concat(mcmc.draws);
          mixChain = mixChain.concat(mcmc.mixChain);
          chainLens.push(mcmc.draws.length);
        } else {
          mcmc = await runMCMC(ofv, x0c, covInfo.cov, {
            iters: perChain,
            maxKeep: Math.ceil(KEEP_TOTAL / nChains),
            scale: s.mcmcScale ? s.mcmcScale(dim) : 1
          }, rng, (function (chI) { return function (f) {
            prog(0.3 + 0.45 * ((chI + f) / nChains), 'MCMC posterior sampling…');
            return true;
          }; })(ch));
          draws = draws.concat(mcmc.draws);
          chainLens.push(mcmc.draws.length);
        }
        accSum += mcmc.acceptance; accN++;
      }
      acceptance = accN ? accSum / accN : 0;
      if (!draws.length) { draws = [mapRes.x.slice()]; if (mixPrior) mixChain = [mapMix]; }
    } else {
      // Population forecast: the prior IS the answer, so by default it gets as many draws as a posterior
      // (an explicit priorDraws still wins — engine tests with the slow ODE stub rely on it).
      draws = priorDraws(input.priorDraws ? Math.max(400, input.priorDraws) : KEEP_TOTAL, omega, rng);
      if (mixPrior) mixChain = draws.map(function () { return drawMixIdx(mixPrior, rng); });
    }

    prog(0.8, 'Posterior predictive simulation…');
    // The numbers (AUC, trough) use every kept draw and need one time point; the
    // chart band needs only a few hundred full curves. Where the closed form does
    // not apply there is no exact AUC, so every draw gets its full curve instead.
    var lastIdx = outTimes.length - 1;
    var aucs = new Array(draws.length);
    var troughs = new Array(draws.length);
    var expo = null, aucsCorr = null, troughsCorr = null;
    if (custom) {
      // Tacrolimus: whole-blood AUC and trough at steady state on a typical day (κ = 0), at the patient's
      // haematocrit and at the reference one, converted back to the assay scale the user works in.
      expo = custom.exposure(draws, { wt: wt, extra: extra, ss: repSS, grid: outTimes, hctAct: hctReport, hctRef: custom.constants.HCT_REF });
      var fa = function (a) { return isFinite(a) ? custom.fromModelAuc(a, intervalHours, assayKey) : NaN; };
      var fc = function (v) { return isFinite(v) ? custom.fromModel(v, assayKey) : NaN; };
      aucs = expo.aucA.map(fa); troughs = expo.trA.map(fc);
      aucsCorr = expo.aucR.map(fa); troughsCorr = expo.trR.map(fc);
      prog(0.92, 'Posterior predictive simulation…');
    } else {
      var numMat = await simulateDraws(draws, mixChain, simDoses, [outTimes[lastIdx]], wt, age, renal, extra, drug, form, function (f) {
        prog(0.8 + 0.12 * f, 'Posterior predictive simulation…');
        return true;
      }, 64, { ss: ssSpec, aucWindow: aucWin });
      var needCurves = numMat.some(function (c, d) { return c && !isFinite(numMat.auc[d]); });
      var postMat = needCurves
        ? await simulateDraws(draws, mixChain, simDoses, outTimes, wt, age, renal, extra, drug, form, function (f) {
          prog(0.92 + 0.03 * f, 'Posterior predictive simulation…');
          return true;
        }, 64, { ss: ssSpec, aucWindow: aucWin })
        : null;
      for (var d = 0; d < draws.length; d++) {
        if (!numMat[d]) {
          aucs[d] = NaN;
          troughs[d] = NaN;
        } else if (needCurves) {
          aucs[d] = aucOfDraw(postMat, d, intervalHours, outTimes);
          troughs[d] = postMat[d][lastIdx];
        } else {
          aucs[d] = numMat.auc[d];
          troughs[d] = numMat[d][0];
        }
      }
    }
    var picMat = await simulateDraws(subsample(draws, PICTURE_DRAWS), mixChain ? subsample(mixChain, PICTURE_DRAWS) : null,
      simDoses, chartTimes, wt, age, renal, extra, drug, form, null, 64, { ss: ssSpec, post: chartPost });

    var aucStats = statsOfChain(aucs);
    var troughStats = statsOfChain(troughs);
    // AUC12 normalization (app-wide clinical contract, identical to doseScan):
    // AUC12 = (AUC0-x / x) * 12 per posterior draw, so the forecast targets the
    // AUC0-12h therapeutic window whatever dosing interval the patient uses.
    // Positive-linear transform: quantiles map exactly and window probabilities
    // on the normalized chain equal the raw chain tested against bounds x 12/x.
    // aucRaw/aucChain keep the as-simulated AUC0-x; the trough stays C(x).
    var NORM_H = 12;
    var auc12 = aucs.map(function (a) { return isFinite(a) ? (a / intervalHours) * NORM_H : NaN; });
    var auc12Stats = statsOfChain(auc12);
    var chartBand = bandOfMatrix(picMat, chartTimes.length);
    var priorBand = bandOfMatrix(priorMat, chartTimes.length);

    var winLo = input.winLo;
    var winHi = input.winHi;
    if (winLo == null) winLo = s.windowDefaultLo;
    if (winHi == null) winHi = s.windowDefaultHi;
    var windowSet = !(winLo == null || winHi == null);
    if (!windowSet) {
      if (s.windowOptional) { winLo = null; winHi = null; }   // no window: intervals only, no probabilities
      else { winLo = s.windowRange.min; winHi = s.windowRange.max; }
    }
    var cLo = windowSet ? winLo : 0, cHi = windowSet ? winHi : Infinity;   // convergence indicator needs finite bounds
    var convergence = fitConvergence(draws, chainLens, auc12, troughs, cLo, cHi, dim, etaNames);

    var mapEta = mapRes ? mapRes.x : zeros(dim);
    var params = M.indivParams(wt, age, renal, extra, mapEta, drug, form, mapMix);
    var ipredSim = M.simulate(simDoses, obs.map(function (o) { return o.t; }), params, { id: drug, ss: ssSpec });
    var obsData = obs.map(function (o, i) {
      var ip = ipredSim.failed ? NaN : ipredSim.c[i];
      if (custom && isFinite(ip)) ip = custom.fromModel(custom.toObs(ip, o.hct), assayKey);
      return { t: o.t, c: o.cDisp != null ? o.cDisp : o.c, ipred: ip, hct: o.hct };
    });
    // Tacrolimus: second window (trough), probabilities for the actual and the corrected values
    var tLo = input.troughLo, tHi = input.troughHi;
    if (tLo == null) tLo = s.troughDefaultLo;
    if (tHi == null) tHi = s.troughDefaultHi;
    var troughWinSet = !!custom && tLo != null && tHi != null;
    function windowStats(chain, lo, hi, set) {
      var st = statsOfChain(chain);
      st.pInWindow = set ? probBetween(chain, lo, hi) : NaN;
      st.pAboveLower = set ? probAbove(chain, lo) : NaN;
      st.pBelowUpper = set ? probBelow(chain, hi) : NaN;
      return st;
    }

    return {
      hasObs: !!obs.length,
      drug: drug,
      wt: wt,
      age: age,
      renal: renal,
      extra: extra,
      intervalHours: intervalHours,
      lastDoseT: lastDoseT,
      aucT0: aucT0,               // S12: where the reported AUC window starts
      aucAnchorShifted: !!anchorInfo.shifted,
      winLo: winLo,
      winHi: winHi,
      map: mapRes ? {
        eta: mapRes.x.slice(),
        etaCL: mapRes.x[0],
        etaV1: mapRes.x[1],
        etaNames: etaNames,
        mixIdx: mapMix,
        ofv: mapRes.f,
        converged: mapRes.converged,
        params: params
      } : null,
      draws: draws,
      acceptance: acceptance,
      nDraws: draws.length,
      auc: {
        median: auc12Stats.median,
        p5: auc12Stats.p5,
        p95: auc12Stats.p95,
        pInWindow: (windowSet || !s.windowOptional) ? probBetween(auc12, winLo, winHi) : NaN,
        pAboveLower: (windowSet || !s.windowOptional) ? probAbove(auc12, winLo) : NaN,
        pBelowUpper: (windowSet || !s.windowOptional) ? probBelow(auc12, winHi) : NaN
      },
      windowSet: windowSet || !s.windowOptional,
      // tacrolimus only (null for MPA): trough window, the haematocrit-corrected companions, what they refer to
      troughWin: custom ? { lo: tLo, hi: tHi, set: troughWinSet } : null,
      aucCorr: custom ? windowStats(aucsCorr.map(function (a) { return isFinite(a) ? (a / intervalHours) * NORM_H : NaN; }), winLo, winHi, windowSet) : null,
      troughCorr: custom ? windowStats(troughsCorr, tLo, tHi, troughWinSet) : null,
      hctReport: hctReport,
      hctRef: custom ? custom.constants.HCT_REF : null,
      assay: assayKey,
      nOccasions: custom ? extra.nOcc : null,
      nSampledDays: custom ? extra.nSampled : null,
      aucRaw: { median: aucStats.median, p5: aucStats.p5, p95: aucStats.p95 },  // AUC0-x as simulated
      aucChain: aucs,
      auc12Chain: auc12,
      form: form,
      mixChain: mixChain,
      mixPost: (mixChain && mixPrior) ? mixPrior.map(function (p, k) {
        return mixChain.filter(function (m) { return m === k; }).length / mixChain.length;
      }) : null,
      nChains: obs.length ? (input.chains != null ? Math.max(1, input.chains) : 8) : 1,
      shrink: shrinkageOf(draws, omega.vars),
      convergence: convergence,   // null when the draws did not come from MCMC
      chainLens: chainLens,
      ess: convergence ? convergence.essEta : etaNames.map(function (nm, ei) {
        return essOf(draws.map(function (d) { return d[ei]; }).filter(isFinite));
      }),
      etaNames: etaNames,
      trough: custom ? windowStats(troughs, tLo, tHi, troughWinSet) : {
        median: troughStats.median,
        p5: troughStats.p5,
        p95: troughStats.p95
      },
      troughChain: troughs,
      grid: outTimes,
      chartGrid: chartTimes,      // the chart's x grid (= grid unless a sample lies outside the AUC window)
      chartBand: chartBand,
      priorBand: priorBand,
      chartPriorBand: priorBand,
      obsData: obsData,
      target: null,
      loadingPhase: false,
      isPopulationForecast: !obs.length,
      warnSingleDose: doses.length === 1,
      warnShortHistory: !custom && !ssSpec && doses.length > 1 && historySpanH < historyNeedH,   // tacrolimus reports the steady state of the last regimen, so a short history does not bias it
      historySpanH: historySpanH,
      historyNeedH: historyNeedH,
      samplesDuringInfusion: [],
      runtimeMs: 0,
      parallel: (ECU.parallel && ECU.parallel.status) ? ECU.parallel.status() : 'in-process'
    };
  }

  async function doseScan(opts) {
    var draws = opts.draws || [];
    if (!draws.length) return [];
    var drug = opts.drug || M.drug().id;
    var spec = M.spec(drug);
    if (spec.pending) return [];
    var wt = opts.wt, age = opts.age, renal = opts.renal, extra = opts.extra;
    var intervalHours = opts.intervalHours || spec.ssIntervalDefault || 12;
    var winLo = opts.winLo != null ? opts.winLo : spec.windowDefaultLo;
    var winHi = opts.winHi != null ? opts.winHi : spec.windowDefaultHi;
    if (winLo == null && !spec.windowOptional) winLo = spec.windowRange.min;
    if (winHi == null && !spec.windowOptional) winHi = spec.windowRange.max;
    var tEnd = opts.tEnd;
    if (!(isFinite(tEnd))) {
      var hist = (opts.doses || []).slice().sort(function (a, b) { return a.t - b.t; });
      if (!hist.length) return [];
      tEnd = hist[hist.length - 1].t;
    }
    var route = opts.route || 'oral';
    var form = opts.form || spec.formDefault || null;
    if (spec.custom && spec.custom.exposure) {
      // Tacrolimus: steady state of the candidate dose on a typical day (κ = 0) for each posterior draw.
      var cu = spec.custom, sub0 = opts.draws, maxT = opts.maxDraws || 2000;
      if (sub0.length > maxT) { var stT = sub0.length / maxT; sub0 = []; for (var sj = 0; sj < maxT; sj++) sub0.push(opts.draws[Math.floor(sj * stT)]); }
      var exT = cu.normExtra(opts.extra, opts.wt);
      var gridT = M.intervalGrid(tEnd, intervalHours, Math.max(24, Math.ceil(intervalHours * 4)));
      var tLoS = opts.troughLo != null ? opts.troughLo : spec.troughDefaultLo;
      var tHiS = opts.troughHi != null ? opts.troughHi : spec.troughDefaultHi;
      var winSetS = opts.winLo != null && opts.winHi != null;
      var tSetS = tLoS != null && tHiS != null;
      var hctS = opts.hct != null ? opts.hct : (isFinite(exT.hct) ? exT.hct : 0.33);
      var assayS = opts.assay || exT.assay || 'lcms';
      var outT = [], amountsT = opts.amounts || [];
      for (var ia = 0; ia < amountsT.length; ia++) {
        var exo = cu.exposure(sub0, { wt: opts.wt, extra: exT, ss: { amt: amountsT[ia], every: intervalHours, tEnd: tEnd, pred: opts.pred != null ? opts.pred : exT.pred },
          grid: gridT, hctAct: hctS, hctRef: cu.constants.HCT_REF });
        var fa2 = function (a) { return isFinite(a) ? cu.fromModelAuc(a, intervalHours, assayS) : NaN; };
        var fc2 = function (v) { return isFinite(v) ? cu.fromModel(v, assayS) : NaN; };
        var raw = exo.aucA.map(fa2), rawC = exo.aucR.map(fa2);
        var n12 = function (a) { return isFinite(a) ? (a / intervalHours) * 12 : NaN; };
        var a12 = raw.map(n12), a12c = rawC.map(n12), trs = exo.trA.map(fc2), trc = exo.trR.map(fc2);
        var pack = function (chain, lo, hi, set) {
          var st = statsOfChain(chain);
          st.pInWindow = set ? probBetween(chain, lo, hi) : NaN;
          st.pAboveLower = set ? probAbove(chain, lo) : NaN;
          st.pBelowUpper = set ? probBelow(chain, hi) : NaN;
          return st;
        };
        outT.push({
          amt: amountsT[ia], intervalHours: intervalHours,
          auc: pack(a12, winLo, winHi, winSetS), aucCorr: pack(a12c, winLo, winHi, winSetS),
          aucRaw: statsOfChain(raw),
          trough: pack(trs, tLoS, tHiS, tSetS), troughCorr: pack(trc, tLoS, tHiS, tSetS),
          aucT0: tEnd, anchorShifted: false, windowSet: winSetS, troughWinSet: tSetS
        });
        if (opts.onProgress) opts.onProgress((ia + 1) / amountsT.length);
      }
      return outT;
    }
    var mixes = opts.mixChain || null;
    var nSS = spec.ssNDoses || 10;
    var amounts = opts.amounts || [];
    // S12: anchor the scan window exactly as runFit does — the most recent
    // morning dose for evening-ending mixed-lag schedules. The decision is
    // amount-independent (the schedule clock structure does not change), so
    // one representative history decides for the whole scan.
    var repDoses = amounts.length
      ? M.ssHistory({ amt: amounts[0], intervalHours: intervalHours, tEnd: tEnd, n: nSS, route: route })
      : [];
    var anchorInfo = M.aucAnchor(repDoses, drug, form);
    var scanT0 = (repDoses.length && isFinite(anchorInfo.t)) ? anchorInfo.t : tEnd;
    var outTimes = M.intervalGrid(scanT0, intervalHours, Math.max(24, Math.ceil(intervalHours * 4)));
    var lastIdx = outTimes.length - 1;
    // subsample draws AND the parallel mixture chain with the same indices
    var maxD = opts.maxDraws || 500;
    var sub, subMix;
    if (draws.length > maxD) {
      var stp = draws.length / maxD;
      var idxs = [];
      for (var si = 0; si < maxD; si++) idxs.push(Math.floor(si * stp));
      sub = idxs.map(function (k) { return draws[k]; });
      subMix = mixes ? idxs.map(function (k) { return mixes[k] || 0; }) : null;
    } else {
      sub = draws.slice();
      subMix = mixes ? mixes.slice() : null;
    }
    var out = [];
    for (var i = 0; i < amounts.length; i++) {
      var amt = amounts[i];
      var mat = await simulateDraws(sub, subMix, [], outTimes, wt, age, renal, extra, drug, form, null, 64, {
        ss: { amt: amt, every: intervalHours, tEnd: tEnd, route: route },
        aucWindow: [scanT0, scanT0 + intervalHours]
      });
      var aucs = new Array(mat.length);
      var troughs = new Array(mat.length);
      for (var d = 0; d < mat.length; d++) {
        if (!mat[d]) { aucs[d] = NaN; troughs[d] = NaN; }
        else {
          aucs[d] = aucOfDraw(mat, d, intervalHours, outTimes);
          troughs[d] = mat[d][lastIdx];
        }
      }
      // AUC12 normalization (clinical contract): AUC12 = (AUC0-x / x) * 12,
      // applied PER POSTERIOR DRAW before any summarizing. The transform is
      // positive-linear, so posterior quantiles map exactly (median/p5/p95 of
      // AUC12 = the raw quantiles x 12/x) and window probabilities computed on
      // the normalized chain are identical to testing the raw AUC0-x chain
      // against bounds scaled by x/12. This keeps any dosing interval
      // comparable with the AUC0-12h-based therapeutic window. Trough is a
      // concentration at the chosen interval and is never normalized.
      var NORM_H = 12;
      var auc12 = aucs.map(function (a) { return isFinite(a) ? (a / intervalHours) * NORM_H : NaN; });
      var aucS = statsOfChain(auc12);
      var rawS = statsOfChain(aucs);
      var trS = statsOfChain(troughs);
      out.push({
        amt: amt,
        intervalHours: intervalHours,
        auc: {  // AUC0-12h-normalized (equals raw AUC0-x when x = 12)
          median: aucS.median,
          p5: aucS.p5,
          p95: aucS.p95,
          pInWindow: probBetween(auc12, winLo, winHi),
          pAboveLower: probAbove(auc12, winLo),
          pBelowUpper: probBelow(auc12, winHi)
        },
        aucRaw: { median: rawS.median, p5: rawS.p5, p95: rawS.p95 },  // AUC0-x as simulated
        trough: { median: trS.median, p5: trS.p5, p95: trS.p95 },     // C(x), not normalized
        aucT0: scanT0,                                               // S12 anchor of the scan window
        anchorShifted: !!anchorInfo.shifted
      });
      if (opts.onProgress) opts.onProgress((i + 1) / amounts.length);
    }
    return out;
  }

  ECU.bayes = {
    mulberry32: mulberry32,
    gaussFactory: gaussFactory,
    makeOfv: makeOfv,
    mapEstimate: mapEstimate,
    mapBFGS: mapBFGS,
    invertSPD: invertSPD,
    laplaceCov: laplaceCov,
    runMCMC: runMCMC,
    runMCMCMix: runMCMCMix,
    drawMixIdx: drawMixIdx,
    essOf: essOf,
    convergenceOf: convergenceOf,
    fitConvergence: fitConvergence,
    shrinkageOf: shrinkageOf,
    priorDraws: priorDraws,
    subsample: subsample,
    simulateDraws: simulateDraws,
    aucOfCurve: aucOfCurve,
    recencyMult: recencyMult,
    recencyMaxMult: recencyMaxMult,
    omegaQuadVec: omegaQuadVec,
    statsOfChain: statsOfChain,
    probAbove: probAbove,
    probBelow: probBelow,
    probBetween: probBetween,
    doseScan: doseScan,
    chainSeed: chainSeed,
    runChainTask: runChainTask,
    sequentialExecutor: sequentialExecutor,
    chainExecutor: sequentialExecutor,   // src/parallel.js replaces this with the Web Worker pool where the browser allows it
    runFit: runFit
  };

})(typeof window !== 'undefined' ? window : globalThis);
