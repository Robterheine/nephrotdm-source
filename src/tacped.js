/* =========================================================================
 * NephroTDM: tacrolimus (pediatric kidney transplant) population PK model
 *
 * MODEL: Schijvens AM, de Wildt SN, Cornelissen EAM, van Hesteren FHS, Schreuder MF, ter Heine R. Low bioavailability of oral
 * tacrolimus suspension in pediatric kidney transplant recipients. Clin Pharmacokinet 2020;59:1483-1491, as REFITTED with weight and
 * haematocrit as the only covariates in Heida A, Cornelissen EAM, Aarnoutse RE, de Winter BCM, Keizer RJ, ter Heine R, Jager NGL.
 * Clin Pharmacokinet 2026 (doi 10.1007/s40262-026-01708-3), ESM S1 (the NONMEM code). docs/HANDOFF_PEDIATRIC.md records every decision;
 * tools/nonmem_verify/ped holds the independent matrix-exponential oracle and the NONMEM 7.6 cross-check this file is held to.
 *
 * Units: HOURS, litres, µg (engine); concentrations µg/L; AUC µg·h/L. Doses are entered in mg and converted ONCE at ingestion
 * (doseToEngine), as for the other tacrolimus models.
 *
 * Structure (all linear): dose → three equal absorption stages (Erlang-3, rate KA) → liver ⇄ central plasma ⇄ peripheral; elimination
 * from the liver only (well-stirred). Everything scales to weight: clearances and Q by (WT/70)^0.75, volumes by WT/70, liver volume
 * VL = 0.0437 WT^0.9. Hepatic plasma flow QHP = 90 (1 − Ht) (WT/70)^0.75, so Ht is a PK covariate.
 *   EH = CLINT/(QHP + CLINT)   CLH = EH·QHP   K20 = CLH/VL   K23 = QHP (1 − EH)/VL   K32 = QHP/V3   K34 = Q/V3   K43 = Q/V4
 *   Cp = A3/V3.  Whole blood: Cwb = Cp (1 + Bmax Ht/(Cp + Kd)), Bmax 418 µg/L, Kd 3.8 µg/L (the stream's own relation).
 * Formulation (capsule or suspension) belongs to the DOSE: KA 2.83 or 18 /h, relative bioavailability of the suspension 0.46.
 * Corrected value: the same plasma curve read through the relation at Ht 0.35 (HCT_REF).
 * Random effects (variances): KA 0.644, CLINT 0.456, V3 0.692, diagonal; none on F; no occasion layer. Residual error proportional,
 * σ² 0.0374 (the natural-scale proportional path of bayes.js is the Gaussian proportional likelihood of FOCE-I).
 *
 * Closed form: three real negative poles (cubic, as in everolimus.js); the Erlang-3 input turns each pole into h(λ,k,t) (hconv).
 * Because KA varies per draw (η on KA, per dose formulation) the steady-state sum over earlier doses is done exactly, polynomial part
 * included (ssh), and by direct summation when KA lies within 5 % of a pole (where the closed form divides by k − λ).
 * Haematocrit is held at ONE value for the PK path (the latest sample's); each sample keeps its own for the blood transform.
 * ========================================================================= */
(function (root) {
  'use strict';
  var ECU = root.ECU = root.ECU || {};
  var M = ECU.model;

  var C = {
    KA_CAP: 2.83, KA_SUS: 18, CLINT: 987, V3: 508, V4: 487, Q: 112, F_SUS: 0.46,
    QH: 90, VL_COEF: 0.0437, VL_EXP: 0.9, FU: 1,
    BMAX: 418, KD: 3.8,                          // µg/L (red cells, plasma)
    HCT_REF: 0.35,                               // reference haematocrit of the corrected value (Schijvens 2019)
    WT_STD: 70,
    SIGMA_PROP: 0.0374,
    OM_KA: 0.644, OM_CLINT: 0.456, OM_V3: 0.692,
    NSTAGE: 3,
    WT_MIN: 3, WT_MAX: 200,                      // refusal limits (owner decision D9)
    HCT_MIN: 0.10, HCT_MAX: 0.70,
    HCT_WARN: [0.15, 0.60],                      // outside this range a warning is shown (owner decision, 5 October 2026)
    WT_DATA: [9.1, 78]                           // range of the development data (warning outside)
  };
  var FORMS = ['capsule', 'suspension'];

  function num(v) { var x = typeof v === 'number' ? v : parseFloat(v); return isFinite(x) ? x : NaN; }

  function pctCheck(hct) {
    if (isFinite(hct) && hct > 1 && hct <= 100) throw new Error('Haematocrit is entered in L/L (for example 0.30), not as a percentage.');
  }
  function hctRange(hct, what) {
    if (!(hct >= C.HCT_MIN && hct <= C.HCT_MAX)) throw new Error(what + ' must be between ' + C.HCT_MIN.toFixed(2) + ' and ' + C.HCT_MAX.toFixed(2) + ' L/L.');
  }

  /* Normalize the raw covariates (strings from the page, numbers from tests). Idempotent. */
  function normExtra(extra, wt) {
    extra = extra || {};
    if (extra._norm) return extra;
    var w = wt > 0 ? wt : num(extra.wt);
    if (!(w >= C.WT_MIN && w <= C.WT_MAX)) throw new Error('Weight is required, between ' + C.WT_MIN + ' and ' + C.WT_MAX + ' kg.');
    var hct = num(extra.hct);
    pctCheck(hct);
    if (!isFinite(hct)) throw new Error('Enter the patient’s haematocrit in L/L (for example 0.30).');
    hctRange(hct, 'Haematocrit');
    return { _norm: true, wt: w, hct: hct, assay: 'lcms', nOcc: 0, occDays: [] };
  }

  /* Outside the range the model was built on (not a refusal): the page shows these next to the result. */
  function scopeWarnings(wt, extra) {
    var out = [], w = wt > 0 ? wt : num((extra || {}).wt), h = num((extra || {}).hct);
    // beyond the refusal limits the run is refused with its own message, so no warning is added there
    if (isFinite(w) && w >= C.WT_MIN && w <= C.WT_MAX && (w < C.WT_DATA[0] || w > C.WT_DATA[1])) out.push('Weight ' + w + ' kg is outside the range the model was built on (' + C.WT_DATA[0] + '–' + C.WT_DATA[1] + ' kg). The model has no data outside this range; treat the estimate as unreliable.');
    if (isFinite(h) && h >= C.HCT_MIN && h <= C.HCT_MAX && (h < C.HCT_WARN[0] || h > C.HCT_WARN[1])) out.push('Haematocrit ' + h + ' L/L is outside ' + C.HCT_WARN[0].toFixed(2) + ' to ' + C.HCT_WARN[1].toFixed(2) + ', which is unusual for this model. The whole-blood correction and the hepatic blood flow depend on it.');
    return out;
  }

  var NAMES = ['KA', 'CLINT', 'V3'];
  function etaNames() { return NAMES; }
  function omega() { return { vars: [C.OM_KA, C.OM_CLINT, C.OM_V3], cov: null }; }

  /* Whole blood from plasma at haematocrit hct (µg/L both). */
  function toObs(cp, hct) { return cp * (1 + C.BMAX * hct / (cp + C.KD)); }

  /* Called once per likelihood evaluation: positional etas (KA, CLINT, V3). */
  function indivParams(wt, age, renal, extra, eta) {
    var ex = normExtra(extra, wt);
    eta = eta || [];
    var w = ex.wt, clwt = Math.pow(w / C.WT_STD, 0.75), vwt = w / C.WT_STD;
    var vl = C.VL_COEF * Math.pow(w, C.VL_EXP);
    var ek = Math.exp(eta[0] || 0);
    var clint = C.CLINT * clwt * Math.exp(eta[1] || 0);
    var v3 = C.V3 * vwt * Math.exp(eta[2] || 0), v4 = C.V4 * vwt, q = C.Q * clwt;
    var qhp = C.QH * (1 - ex.hct) * clwt;
    var eh = clint * C.FU / (qhp + clint * C.FU), clh = eh * qhp;
    var k34 = q / v3, k43 = q / v4;
    return {
      wt: w, age: null, renal: null, extra: ex, eta: eta, etaNames: NAMES,
      kCap: C.KA_CAP * ek, kSus: C.KA_SUS * ek, CLINT: clint, V3: v3, V4: v4, Q: q, VL: vl, QHP: qhp, EH: eh, CLH: clh,
      K20: clh / vl, K23: qhp * (1 - eh) / vl, K32: qhp / v3, K34: k34, K43: k43,
      // aliases the shared code reads (terminal half-life warning only)
      cl: clh, v1: v3, k12: k34, k21: k43, ka: C.KA_CAP * ek, form: null, mixIdx: 0, drugId: 'tacped', _poles: undefined
    };
  }

  /* The three disposition poles and the residues of the plasma concentration, Cp(t) = Σ r_i e^(−λ_i t) per unit amount entering the
   * liver (as in everolimus.js; the characteristic polynomial is D(s) = (s+a)((s+b)(s+c) − K43 K34) − K32 K23 (s+c)). */
  function poles(p) {
    var a = p.K20 + p.K23, b = p.K32 + p.K34, c = p.K43;
    var c2 = a + b + c, c1 = a * b + a * c + b * c - p.K43 * p.K34 - p.K32 * p.K23, c0 = a * (b * c - p.K43 * p.K34) - p.K32 * p.K23 * c;
    var q = (3 * c1 - c2 * c2) / 9, r = (9 * c2 * c1 - 27 * c0 - 2 * c2 * c2 * c2) / 54;
    if (!(q < 0)) return null;
    var ratio = r / Math.sqrt(-q * q * q);
    if (!(Math.abs(ratio) < 1)) return null;
    var th = Math.acos(ratio), m = 2 * Math.sqrt(-q), out = [], j;
    for (j = 0; j < 3; j++) {
      var s = m * Math.cos((th + 2 * Math.PI * j) / 3) - c2 / 3;
      var dp = 3 * s * s + 2 * c2 * s + c1;
      if (!(s < 0) || !isFinite(dp) || dp === 0) return null;
      out.push({ lam: -s, r: p.K23 * (s + c) / dp / p.V3 });
    }
    out.sort(function (x, y) { return x.lam - y.lam; });
    if (!(out[1].lam - out[0].lam > 1e-9 * out[0].lam) || !(out[2].lam - out[1].lam > 1e-9 * out[1].lam)) return null;
    return out;
  }

  /* Erlang-3 input convolved with e^(−λt): h = (k/(k−λ))^3 [e^(−λt) − e^(−kt) Σ_{j<3} x^j/j!], x = (k−λ)t. The bracket cancels when |x| is
   * small and overflows when λ > k, so |x| < 1.5 uses the tail form h = (kt)^3 e^(−kt) Σ_{m≥0} x^m/(m+3)! (no cancellation, no division
   * by k − λ, valid for x of either sign). Verified for KA within 1e-6 (relative) of a pole in tests/test_pediatric.js. */
  function hconv(lam, k, t) {
    var d = k - lam, x = d * t;
    if (Math.abs(x) < 1.5) {
      var s = 0, term = 1 / 6, kt = k * t;
      for (var m = 0; m < 24; m++) { s += term; term *= x / (m + 4); }
      return kt * kt * kt * Math.exp(-kt) * s;
    }
    var f = Math.pow(k / d, 3), sp = 1 + x + x * x / 2;
    return f * (Math.exp(-lam * t) - Math.exp(-k * t) * sp);
  }

  /* Σ_{m≥0} h(λ, k, dt + m T): one pole of the steady-state response, dt in (0, T]. Exact, polynomial part included (with u = e^(−kT):
   * Σ u^m = S0, Σ m u^m = S1, Σ m² u^m = S2). Within 5 % of the pole the closed form divides by (k − λ)^3, so the sum is taken term by
   * term instead (the terms fall as e^(−λ T m), at least a factor e^(−λ T) per dose; capped at 5000). */
  function ssh(lam, k, dt, T) {
    var d = k - lam;
    if (Math.abs(d) < 0.05 * k) {
      var s = 0, prev = Infinity;
      for (var m = 0; m < 5000; m++) {
        var h = hconv(lam, k, dt + m * T);
        s += h;
        if (m > 2 && Math.abs(h) < 1e-17 * Math.abs(s) && Math.abs(h) <= Math.abs(prev)) break;
        prev = h;
      }
      return s;
    }
    var u = Math.exp(-k * T), om = 1 - u, S0 = 1 / om, S1 = u / (om * om), S2 = u * (1 + u) / (om * om * om);
    var poly = S0 * (1 + d * dt + d * d * dt * dt / 2) + S1 * (d * T + d * d * dt * T) + S2 * (d * d * T * T / 2);
    return Math.pow(k / d, 3) * (Math.exp(-lam * dt) / (-Math.expm1(-lam * T)) - Math.exp(-k * dt) * poly);
  }

  /* doses: [{t, amt (µg), form}]; opts.ss = {amt, every, tEnd, form}: endless train, last dose at tEnd. Each dose carries its own absorption
   * rate and relative F (a superposition of independent linear responses, exact). */
  function simulate(doses, outTimes, p, opts) {
    opts = opts || {};
    var fail = function () { return { c: outTimes.map(function () { return 0; }), failed: true, method: 'closed' }; };
    var pl = p._poles !== undefined ? p._poles : (p._poles = poles(p));
    if (!pl) return fail();
    var n = outTimes.length, res = new Array(n), i, j, q, dt, sum, d, kd, ad;
    var ss = opts.ss || null, T = 0, ssA = 0, ssTs = 0, ssK = 0;
    if (ss) {
      T = ss.every; ssTs = ss.tEnd;
      var sus = ss.form === 'suspension';
      ssK = sus ? p.kSus : p.kCap; ssA = ss.amt * (sus ? C.F_SUS : 1);
    }
    for (i = 0; i < n; i++) {
      var tt = outTimes[i]; sum = 0;
      for (j = 0; j < doses.length; j++) {
        d = doses[j];
        if (!(d.amt > 0)) continue;
        dt = tt - d.t;
        if (dt > 0) {
          var isSus = d.form === 'suspension';
          kd = isSus ? p.kSus : p.kCap; ad = d.amt * (isSus ? C.F_SUS : 1);
          var s1 = 0; for (q = 0; q < 3; q++) s1 += pl[q].r * hconv(pl[q].lam, kd, dt);
          sum += ad * s1;
        }
      }
      if (ss) {
        dt = tt - ssTs;
        if (!(dt > 0)) dt += T * (Math.floor(-dt / T) + 1);
        var s2 = 0;
        for (q = 0; q < 3; q++) s2 += pl[q].r * ssh(pl[q].lam, ssK, dt, T);
        sum += ssA * s2;
      }
      if (!isFinite(sum)) return fail();
      res[i] = sum;
    }
    return { c: res, failed: false, method: 'closed' };
  }

  /* ---- ingestion: assay is fixed (LC-MS/MS), every sample carries a haematocrit, every dose carries its formulation ------------ */
  function prepare(inp) {
    var ex0 = normExtra(inp.extra, inp.wt);
    var doses = (inp.doses || []).map(function (d) { return { t: d.t, amt: d.amt, route: d.route, form: d.form }; });
    doses.sort(function (a, b) { return a.t - b.t; });
    doses.forEach(function (d, i) {
      if (FORMS.indexOf(d.form) < 0) throw new Error('Choose the formulation (capsule or suspension) for dose ' + (i + 1) + '.');
    });
    var obs = [];
    (inp.obs || []).forEach(function (o) {
      var hct = isFinite(o.hct) ? o.hct : ex0.hct;
      pctCheck(hct);
      hctRange(hct, 'Every sample needs a haematocrit, and it');
      obs.push({ t: o.t, c: o.c, cDisp: o.c, hct: hct });
    });
    // the haematocrit the reported (actual) value refers to, and the one the PK path uses: the latest sample's, else the patient field
    var latest = null;                               // the latest sample by time (the input order is not trusted)
    obs.forEach(function (o) { if (!latest || o.t >= latest.t) latest = o; });
    var hctReport = latest ? latest.hct : ex0.hct;
    var ex = Object.assign({}, ex0, { hct: hctReport, nOcc: 0, nSampled: 0, occDays: [] });
    return { extra: ex, doses: doses, obs: obs, assay: 'lcms', hctReport: hctReport };
  }

  function reportExtra(ex) { return normExtra(ex); }

  /* The suspension is absorbed within minutes (KA 18 /h, up to 130 /h in the prior's tail): on the app's uniform 0.25 h grid the trapezoid read the
   * AUC up to 1 % low there (measured against a 0.005 h reference). The integration therefore uses its own composite Simpson rule over the same
   * interval, in three panels: 0.0125 h steps in the first quarter hour, about 0.05 h to one hour, 0.25 h after (Simpson, not trapezoid, because a
   * trapezoid on a grid whose step changes loses the cancellation a uniform periodic grid enjoys). Same start, same end (the trough). */
  function simpsonGrid(g) {
    var t0 = g[0], T = g[g.length - 1] - t0, t = [], w = [], i;
    function panel(a, b, n) {                       // n even
      var h = (b - a) / n;
      for (i = 0; i <= n; i++) {
        var wt = (i === 0 || i === n) ? 1 : (i % 2 ? 4 : 2) , x = a + i * h;
        if (i === 0 && t.length) { w[w.length - 1] += h / 3; continue; }   // shared end point of the previous panel
        t.push(x); w.push(wt * h / 3);
      }
    }
    if (!(T > 1)) {                                  // a very short interval: trapezoid on the given grid
      for (i = 0; i < g.length; i++) { t.push(g[i]); w.push(((i === 0 ? 0 : g[i] - g[i - 1]) + (i === g.length - 1 ? 0 : g[i + 1] - g[i])) / 2); }
      return { t: t, w: w };
    }
    panel(t0, t0 + 0.25, 20); panel(t0 + 0.25, t0 + 1, 15 + 1); panel(t0 + 1, t0 + T, 2 * Math.ceil((T - 1) / 0.5));
    return { t: t, w: w };
  }

  /* Steady-state exposure per draw: whole-blood AUC over the interval and the trough, at the patient's haematocrit and at the reference
   * one. ctx = { wt, extra, ss:{amt,every,tEnd,form}, grid, hctAct, hctRef }. */
  function exposure(draws, ctx) {
    var ex0 = reportExtra(ctx.extra), n = draws.length, sg = simpsonGrid(ctx.grid), grid = sg.t, ng = grid.length;
    var aucA = new Array(n), trA = new Array(n), aucR = new Array(n), trR = new Array(n);
    for (var d = 0; d < n; d++) {
      var p = indivParams(ctx.wt, null, null, ex0, draws[d]);
      var sim = simulate([], grid, p, { ss: ctx.ss });
      if (sim.failed) { aucA[d] = trA[d] = aucR[d] = trR[d] = NaN; continue; }
      var sa = 0, sr = 0;
      for (var k = 0; k < ng; k++) { sa += sg.w[k] * toObs(sim.c[k], ctx.hctAct); sr += sg.w[k] * toObs(sim.c[k], ctx.hctRef); }
      aucA[d] = sa; aucR[d] = sr; trA[d] = toObs(sim.c[ng - 1], ctx.hctAct); trR[d] = toObs(sim.c[ng - 1], ctx.hctRef);
    }
    return { aucA: aucA, trA: trA, aucR: aucR, trR: trR };
  }

  // LC-MS/MS only: model scale = reported scale
  function fromModel(v) { return v; }
  function fromModelAuc(v) { return v; }
  function toModel(v) { return v; }

  var WIN_SRC_AUC = 'Local guideline and Wallemacq 2009, as used in Heida 2026 (Table 2). The authors normalised AUCs to haematocrit 0.35 before comparing, following Schijvens 2019; this app does the same, so the corrected value is the one compared with the window.';
  var WIN_SRC_TR = 'Brunet 2019 (IATDMCT second consensus) for children, as cited in Heida 2026. These are whole-blood values; Schijvens 2019 takes published targets to refer to haematocrit 0.35, and this app compares the corrected value with them.';

  var SPEC = {
    id: 'tacped',
    label: 'Tacrolimus (pediatric kidney)',
    article: 'Schijvens AM, de Wildt SN, Cornelissen EAM, van Hesteren FHS, Schreuder MF, ter Heine R. Low bioavailability of oral tacrolimus suspension in pediatric kidney transplant recipients. Clin Pharmacokinet 2020;59:1483–1491; refitted with weight and haematocrit as the only covariates in Heida A, Cornelissen EAM, Aarnoutse RE, de Winter BCM, Keizer RJ, ter Heine R, Jager NGL. Clin Pharmacokinet 2026 (doi 10.1007/s40262-026-01708-3).',
    backgroundLabel: 'Tacrolimus background',
    card: { name: 'Tacrolimus (pediatric kidney)', sub: 'AUC and trough · Schijvens 2020' },
    info: 'Semi-mechanistic model for twice-daily tacrolimus in children with a kidney transplant: three equal absorption stages, a liver compartment with flow-limited extraction, and a two-compartment plasma disposition, scaled to weight. Capsule and suspension differ in absorption rate and bioavailability and are chosen per dose. Whole-blood concentrations follow from the haematocrit through saturable red-cell binding. Reported: steady-state AUC0–12h and trough, as measured (actual) and corrected to haematocrit 0.35. For research use only; not a medical device.',
    pending: false,
    report: {
      lead: 'auc',
      modelCite: 'Schijvens AM, et al. Clin Pharmacokinet 2020;59:1483–1491; refit: Heida A, et al. Clin Pharmacokinet 2026.',
      scope: 'Children with a kidney transplant. Describes the sampled day. · twice-daily tacrolimus · research use only',
      windowSource: 'Local guideline, Wallemacq 2009 (AUC); Brunet 2019 (trough), via Heida 2026.',
      noWindow: { auc: ' Pick one in the background dialog.', trough: ' Pick one in the background dialog.' },
      reading: ['Corrected: the same plasma concentration read at haematocrit @H.',
        'The estimate describes the day of the samples, and its interval has no day-to-day variability. In a small prospective evaluation (29 children), the AUC predicted from one occasion did not match the AUC measured about three months later.',
        'Not in the model: height, age, interactions, liver function, food.']
    },
    ui: { noun: 'tacrolimus', reportNoun: 'tacrolimus (pediatric kidney)', windowOn: 'corrected', wtPlaceholder: 'e.g. 25', weight: true, predDose: false, doseForm: true, badge: 'Schijvens 2020 · tacrolimus (children)', chartTitle: 'Tacrolimus whole-blood concentration–time forecast', shrinkEta: 'CLINT', modelLine: 'Schijvens 2020, refit 2026 (children with a kidney transplant, twice-daily tacrolimus)' },
    units: { conc: 'µg/L', auc: 'µg·h/L', dose: 'mg', concAlt: 'ng/mL' },
    windowOptional: true,

    THETA: { CLINT: C.CLINT, V3: C.V3, Q: C.Q, V4: C.V4 },
    EXPO: { CLQ: 0.75, V: 1 },
    WT_REF: 70,
    requiresWt: true,
    ETA: { shared: NAMES.slice(), iiv: { KA: C.OM_KA, CLINT: C.OM_CLINT, V3: C.OM_V3 } },
    FORMS: null,
    formDefault: null,
    doseForms: [{ value: 'capsule', label: 'Capsule' }, { value: 'suspension', label: 'Suspension' }],
    SIGMA: { ADD: 0, PROP: C.SIGMA_PROP },
    KA_D: C.KA_CAP,
    BIOAVAIL_SC: 1,
    INFUSION_D: 0.5,
    adminRoutes: ['oral'],

    covariates: [
      { id: 'wt', name: 'Weight', type: 'number', required: true, units: 'kg', min: C.WT_MIN, max: C.WT_MAX, step: 'any',
        help: 'Body weight in kg. Clearances scale to weight to the power 0.75, volumes in proportion. The model was built on children of 9–78 kg.' },
      { id: 'hct', name: 'Haematocrit', type: 'number', required: true, units: 'L/L', min: C.HCT_MIN, max: C.HCT_MAX, step: 'any', placeholder: 'e.g. 0.33',
        help: 'Haematocrit as a fraction (0.30, not 30 %). Tacrolimus is bound to red cells, so whole-blood concentrations rise with haematocrit at an unchanged plasma concentration, and hepatic blood flow follows it. Used for the forecast without samples and as the default for sample rows; each sample can carry its own value.' }
    ],
    covariateWeight: true, covariateAge: false, covariateRenal: false, covariateExtra: false,

    dose: { min: 0.05, max: 30, step: 'any', default: 1.5 },
    wtMin: C.WT_MIN, wtMax: C.WT_MAX, wtStep: 0.1,
    scope: { wt: C.WT_DATA },
    ssIntervalDefault: 12,
    ssNDoses: 30,
    intervalRange: { min: 10, max: 14, text: 'twice-daily tacrolimus (about 12 h between doses)' },
    obsValMin: 0.5, obsValMax: 100,
    windowRange: { min: 0.1, max: 5000 },
    // No set is preselected: time after transplantation is not an input, so the user picks the set (the Background dialog's "Use" buttons).
    windowDefaultLo: null, windowDefaultHi: null,
    troughDefaultLo: null, troughDefaultHi: null,
    windowStandard: null,
    windowSets: [
      { id: 'ped-0-6w', label: 'AUC, 0–6 weeks after transplant', trough: null, auc: [180, 270], grade: 'Local guideline', basis: WIN_SRC_AUC },
      { id: 'ped-6w-6m', label: 'AUC, 6 weeks–6 months after transplant', trough: null, auc: [100, 250], grade: 'Local guideline', basis: WIN_SRC_AUC },
      { id: 'ped-6-12m', label: 'AUC, 6–12 months after transplant', trough: null, auc: [100, 190], grade: 'Local guideline', basis: WIN_SRC_AUC },
      { id: 'ped-12m+', label: 'AUC, more than 12 months after transplant', trough: null, auc: [80, 150], grade: 'Local guideline', basis: WIN_SRC_AUC },
      { id: 'ped-trough-early', label: 'Trough, first 2 months after transplant', trough: [10, 20], auc: null, grade: 'Consensus, as cited in Heida 2026', basis: WIN_SRC_TR },
      { id: 'ped-trough-late', label: 'Trough, from 2 months after transplant', trough: [5, 10], auc: null, grade: 'Consensus, as cited in Heida 2026', basis: WIN_SRC_TR }
    ],
    windowHint: 'No window is preselected: the target depends on the time since transplantation. Pick a set in the Tacrolimus background dialog, or type your own. The targets are taken to refer to whole blood at haematocrit 0.35. µg/L is the same as ng/mL.',
    samplePeak: 'In the model authors’ evaluation, samples at 0, 1 and 2 hours after the dose gave AUC estimates within their 25% limit. Enter the exact times and the haematocrit of the same day.',
    perChainSeeds: true,
    mcmcScale: function (dim) { return Math.min(1, 2.38 / Math.sqrt(dim)); },
    mcmcIters: function () { return 400000; },
    yMaxCap: null,
    assay: 'LC-MS/MS',
    assumptions: [
      'Children with a kidney transplant on twice-daily tacrolimus as capsule or suspension. Built on children aged 1–17 years, weight 9–78 kg, sampled at a median of 11 days after transplantation. Adults, prolonged-release products and other organs are not covered',
      'Concentrations must come from an LC-MS/MS assay in whole blood; immunoassay results are not interchangeable and have no conversion',
      'Reported values are the patient’s typical steady-state level at the haematocrit of the most recent sample. The model has no day-to-day effect: the estimate describes this patient on the day of the samples, and a later measurement scatters more than the interval shows',
      'Corrected to haematocrit 0.35 means the whole-blood concentration this patient would show with the same plasma concentration at a haematocrit of 0.35, computed with the model’s red-cell binding relation',
      'The formulation is chosen per dose: the suspension is absorbed faster (18 against 2.83 per hour) and has 0.46 times the bioavailability of the capsule',
      'Haematocrit is held at one value for the pharmacokinetics, that of the latest sample; each sample keeps its own haematocrit for the blood reading. When the haematocrit differs by more than about 0.05 between samples, earlier samples are fitted less well (by a few per cent on average, by up to about 20% for some)',
      'Refitted without height (weight and haematocrit are the only covariates). Estimated with NONMEM FOCE-I; no inter-occasion variability',
      'Not in the model: height, age, interactions with CYP3A inhibitors and inducers, CYP3A5 genotype, liver function, food, adherence, time since transplantation'
    ],
    custom: null
  };

  SPEC.custom = {
    constants: C, assays: { lcms: { label: 'LC-MS/MS', m: 1, b: 0 } },
    etaNames: etaNames, omega: omega,
    indivParams: indivParams, simulate: simulate, poles: poles, hconv: hconv, ssh: ssh,
    prepare: prepare, exposure: exposure, reportExtra: reportExtra, normExtra: normExtra, scopeWarnings: scopeWarnings,
    toObs: toObs,
    fromModel: fromModel, fromModelAuc: fromModelAuc, toModel: toModel,
    doseToEngine: function (mg) { return mg * 1000; }
  };

  M.drugs.tacped = SPEC;
})(typeof window !== 'undefined' ? window : globalThis);
