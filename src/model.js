/* =========================================================================
 * MPA TDM — population PK model core
 *
 * Time unit: HOURS everywhere (rates 1/h, grids, doses, observations).
 * Amount: mg (MPA-equivalent inside the engine). Concentration: mg/L.
 * AUC: mg·h/L.
 *
 * MODEL: de Winter BCM et al., Clin Pharmacokinet 2008;47(12):827–838.
 * Two-compartment, first-order absorption with lag time, first-order
 * elimination. Parameters are CL/F, Q/F, V1/F, V2/F (F folded in — doses
 * are converted to MPA content at ingestion, ×0.739 MMF / ×0.936 EC-MPS;
 * see toMpaMg — the ONLY conversion point, per docs/IMPLEMENTATION_PLAN §E4).
 * No covariates except formulation (categorical: MMF / EC-MPS) and a
 * per-dose time-of-day attribute (EC-MPS evening tlag). No allometry —
 * the model as published; weight is not a covariate.
 *
 * Engine generalizations (IMPLEMENTATION_PLAN E1–E4):
 *   - spec-driven eta map: names per formulation, applied by NAME not index
 *   - per-dose lag time in the event loop (fixed or 3-subgroup mixture)
 *   - the mixture is a discrete Bayesian parameter (MAP over subgroups with
 *     the −2·ln p prior term; MCMC samples membership — see bayes.js)
 *
 * Tests may call installStubSpec() to unlock a tiny 1-compartment oral
 * model (legacy ETA shape) so engine tests stay fast and isolated.
 * ========================================================================= */
(function (root) {
  'use strict';
  var ECU = root.ECU = root.ECU || {};

  /* ---- de Winter 2008, final model 4 (bootstrap medians where different) --
   * IIV reported as CV% in the paper; ω² uses the √ω² convention
   * (ω = CV; docs/MODEL_ANALYSIS §S1 — exact-log-normal column also documented).
   */
  var DEWINTER = {
    id: 'mpa',
    label: 'Mycophenolic acid',
    article: 'de Winter BCM, van Gelder T, Glander P, et al. Population Pharmacokinetics of Mycophenolic Acid: A Comparison between Enteric-Coated Mycophenolate Sodium and Mycophenolate Mofetil in Renal Transplant Recipients. Clin Pharmacokinet 2008;47(12):827–838.',
    backgroundLabel: 'Mycophenolic acid background',
    card: { name: 'Mycophenolic acid (adult kidney)', sub: 'AUC₀–₁₂ₕ · de Winter 2008' },
    // the one-page report (src/report.js)
    report: {
      lead: 'auc',
      scope: 'de Winter 2008 · kidney transplant, MMF or EC-MPS · research use only',
      windowSource: 'Bergan S, Brunet M, Hesselink DA, et al. Personalized therapy for mycophenolate: consensus report by IATDMCT. Ther Drug Monit 2021;43(2):150–197.',
      noWindow: {},
      reading: ['AUC₀–₁₂ₕ is the exposure over one 12-hour interval at steady state; other intervals are shown as their 12-hour equivalent.',
        'The window 30 to 60 mg·h/L is the kidney-transplant range; other indications differ.',
        'The predicted trough is informational: the app has no trough target.']
    },
    info: 'Two-compartment model with first-order absorption and lag time, fitted to 3764 concentrations from 259 maintenance renal-transplant recipients (4–257 months post-transplant). Formulation is a covariate on absorption: EC-MPS is absorbed later and more variably than MMF (trimodal morning lag-time). No patient covariates besides formulation; dosing is absolute mg (no allometric weight scaling). Validated internally (1000 bootstraps + visual predictive check) on pooled data; see the model card in About for scope and caveats.',
    pending: false,

    // Disposition (shared across formulations). CL/F, Q/F, V1/F, V2/F — L/h, L/h, L, L.
    THETA: { CL: 16, Q: 22, V1: 40, V2: 518 },
    // NO allometry: the published model is not weight-scaled. EXPO all zero.
    EXPO: { CLQ: 0, V: 0 },
    WT_REF: 70,
    requiresWt: false,          // weight is not a covariate of this model

    // Eta structure (E1): shared names + per-formulation extras, IIV by name.
    // ω² (√ω² convention): CL 0.39², Q 0.78², V1 1.00², V2 4.90², ka 1.87²,
    // tlag-MMF 0.11², tlag-EC-morning 0.08², tlag-EC-evening 0.40².
    ETA: {
      shared: ['CL', 'Q', 'V1', 'V2', 'KA'],
      forms: {
        mmf: { extra: ['TLAG'] },
        ecmps: { extra: ['TLAG_MORN', 'TLAG_EVE'] }
      },
      iiv: {
        CL: 0.1521, Q: 0.6084, V1: 1.0, V2: 24.01, KA: 3.4969,
        TLAG: 0.0121, TLAG_MORN: 0.0064, TLAG_EVE: 0.16
      }
    },

    // Formulation covariate (E4 / S11): absorption parameters + dose conversion.
    FORMS: {
      mmf: {
        label: 'MMF', full: 'mycophenolate mofetil',
        conv: 0.739,                       // MPA / MMF molecular-weight ratio (S11)
        ka: 4.1,                            // 1/h
        tlag: { type: 'fixed', value: 0.30 } // h (no morning/evening difference found)
      },
      ecmps: {
        label: 'EC-MPS', full: 'enteric-coated mycophenolate sodium',
        conv: 0.936,
        ka: 3.0,
        tlag: {
          type: 'mixed',
          morning: [                        // 3-subgroup mixture (MAP/MCMC membership)
            { v: 0.95, p: 0.51 },
            { v: 1.88, p: 0.32 },
            { v: 4.83, p: 0.17 }
          ],
          evening: 9.04,                   // h — estimated indirectly (S7 note)
          morningStart: 6, eveningStart: 18 // clock-hour window (documented choice)
        }
      }
    },
    formDefault: 'mmf',

    // Residual error: log-transformed concentrations, additive on ln(C) (E5).
    SIGMA: { LOG: 0.39 },

    INFUSION_D: 0.5,
    infusionMinutes: 30,
    KA_D: null,                  // legacy field; ka comes from FORMS per formulation
    BIOAVAIL_SC: 1,              // F folded into CL/F etc. (S9)
    adminRoutes: ['oral'],

    covariates: [
      { id: 'form', name: 'Formulation', type: 'select', required: true,
        options: [
          { value: 'mmf', label: 'MMF (mycophenolate mofetil)' },
          { value: 'ecmps', label: 'EC-MPS (enteric-coated)' }
        ],
        default: 'mmf',
        help: 'The formulation is this model’s covariate: it switches the absorption rate, the lag-time structure and the dose conversion (×0.739 MMF, ×0.936 EC-MPS to MPA mg). Doses are entered as prescribed, in product mg.' }
    ],
    covariateWeight: false,      // no weight covariate — the panel hides weight
    covariateAge: false,
    covariateRenal: false,
    covariateExtra: false,

    AGE_REF: null,
    AGE_EXPO_KA: null,

    dose: { min: 10, max: 3000, step: 1, default: 1000 },   // product mg
    wtMin: 3,
    wtMax: 300,
    ssIntervalDefault: 12,
    ssNDoses: 30,                // S2: terminal t½ ≈ 40 h; 30 doses ≈ 99.8% of SS

    obsValMin: 0.001,
    obsValMax: 1000,

    windowRange: { min: 0.1, max: 500 },
    windowDefaultLo: 30,
    windowDefaultHi: 60,
    // Short on purpose (golden rule 9 / DESIGN_PLAN.md D11): the full per-indication
    // reference table lives behind the “Mycophenolic acid background” dialog, not on the main screen.
    windowHint: 'See “Mycophenolic acid background” for reference values and best practices for TDM.',
    samplePeak: 'MMF: ≥2 samples (typical LSS 20 min, 1 h, 3 h post-dose). EC-MPS: 3–4 samples (typical 1.5 h, 2 h, 4 h ± 6 h). Trough-only is discouraged.',

    assay: 'pooled source studies, mixed assay basis (not stated per study)',
    formulation: null,
    yMaxCap: null,
    assumptions: [
      'Maintenance-phase renal-transplant recipients (4–257 months post-transplant); early post-transplant is an extrapolation',
      'Diagonal Ω (the paper reports marginal IIV only; off-diagonal correlations unpublished)',
      'ω² from the √ω² convention (CV → ω = CV): the paper (Table III) reports IIV only as percentages and does not state the conversion from the variance ω² of its Eq. 1; for V2 (490 %) and ka (187 %) an exact log-normal reading would differ 2–7×. With rich sampling the choice is negligible; with sparse data (e.g. trough only) it moves the interval width by roughly 10 % and P(within window) by a few percentage points. The paper’s own bootstrap puts the V2 IIV at 171–293 500 % (95 % range), i.e. essentially unidentified, so the wide V2 prior is the paper’s',
      'Evening-dose tlag estimated indirectly from pre-absorption points (no post-evening profiles)',
      'EC-MPS absorption is 24-hour-periodic: morning- and evening-anchored AUC0–12 differ (~45 vs ~39 mg·h/L at typical values on 720 mg); the 30–60 target derives from morning-dose profiles, the app anchors the AUC window at the most recent morning dose automatically (schedules with no morning dose, e.g. once-daily evening, fall back to the last dose, where this difference applies directly)',
      'Ciclosporin: 100 % of the MMF patients and 72 % of the EC-MPS patients in the source data were on it (tacrolimus only in EC-MPS, 23 %; Table II). The authors tested ciclosporin as a clearance covariate and found no significant effect, but no MMF patient was ciclosporin-free, so the model cannot show MMF exposure without it (e.g. on tacrolimus); the 30–60 mg·h/L window itself comes from ciclosporin-treated recipients',
      'One formulation per history: a patient switched between MMF and EC-MPS is not modelled, every dose is converted and absorbed as the selected formulation, so enter only the doses since the switch',
      'No enterohepatic recirculation compartment (tested, not retained); slight 6-h overprediction in the VPC',
      'Estimated with NONMEM first-order (FO) method'
    ]
  };

  var DRUGS = { mpa: DEWINTER };

  var current = 'mpa';
  var _savedMpa = null;

  function specOf(id) { return id ? DRUGS[id] : DRUGS[current]; }
  function requireReady(id) {
    var s = specOf(id);
    if (s.pending) {
      throw new Error(s.label + ' is prepared but its population PK parameters are not yet available (model file pending). Forecasting and AUC estimation are disabled for this drug.');
    }
    return s;
  }
  function setDrug(id) {
    if (!DRUGS[id]) throw new Error('Unknown drug: ' + id);
    current = id;
    return DRUGS[id];
  }
  function drug() { return DRUGS[current]; }
  /* The picker's order (owner decision D1): adult and pediatric versions side by side, everolimus last; an unknown id goes after these. */
  var DRUG_ORDER = ['mpa', 'mpaped', 'tac', 'tacped', 'evr'];
  function listDrugs() {
    var rank = function (k) { var i = DRUG_ORDER.indexOf(k); return i < 0 ? DRUG_ORDER.length : i; };
    return Object.keys(DRUGS).sort(function (a, b) { return rank(a) - rank(b); }).map(function (k) {
      return { id: k, label: DRUGS[k].label };
    });
  }

  /* ---- eta layout (E1): spec-driven, applied by NAME ------------------ */
  function etaNamesFor(s, form, extra) {
    if (s.custom && s.custom.etaNames) return s.custom.etaNames(extra);   // drug-specific layout (tacrolimus: κ per sampled occasion)
    if (s.ETA && s.ETA.shared) {
      var fd = form && s.ETA.forms && s.ETA.forms[form];
      return s.ETA.shared.concat((fd && fd.extra) || []);
    }
    if (s.ETA && s.ETA.names) return s.ETA.names.slice();
    return ['CL', 'V1'];
  }
  function etaDim(id, form, extra) {
    return etaNamesFor(specOf(id), form, extra).length;
  }
  /* Full prior covariance, or null when Ω is diagonal (every drug but tacrolimus). */
  function omegaFull(id, form, extra) {
    var s = specOf(id);
    if (s.custom && s.custom.omega) return s.custom.omega(extra);
    return { vars: omegaVars(id, form, extra), cov: null };
  }
  function omegaVars(id, form, extra) {
    var s = specOf(id);
    if (s.custom && s.custom.omega) return s.custom.omega(extra).vars;
    var names = etaNamesFor(s, form);
    if (s.ETA && s.ETA.iiv) {
      return names.map(function (n) {
        var v = s.ETA.iiv[n];
        return v != null ? v : 0.1;
      });
    }
    if (s.ETA && s.ETA.vars) {
      return names.map(function (n, i) { return s.ETA.vars[i] != null ? s.ETA.vars[i] : 0.1; });
    }
    return names.map(function () { return 0.1; });
  }
  function mixPriorOf(id, form) {
    var s = specOf(id);
    var f = form && s.FORMS && s.FORMS[form];
    if (f && f.tlag && f.tlag.type === 'mixed') {
      return f.tlag.morning.map(function (m) { return m.p; });
    }
    return null;   // no mixture for this formulation
  }

  /* Terminal half-life (h) of an individual: ln2/β, β the slow eigenvalue of the disposition.
   * One-compartment individuals (no peripheral exchange) reduce to ln2·V1/CL. */
  function terminalHalfLife(p) {
    var k10 = p.cl / p.v1;
    if (!(p.k12 > 0) || !(p.k21 > 0)) return Math.LN2 / k10;
    var b = k10 + p.k12 + p.k21, c = k10 * p.k21;
    return Math.LN2 / (c / ((b + Math.sqrt(b * b - 4 * c)) / 2));
  }

  /* ---- dose-unit boundary (E4/S11): the ONLY conversion point ---------- */
  function toMpaMg(amt, form) {
    var s = DRUGS.mpa;
    var f = form && s.FORMS && s.FORMS[form];
    // Molecular-weight ratios: MPA/MMF = 320.34/433.5 = 0.739;
    // MPA/mycophenolate sodium = 320.34/342.3 = 0.936. Exact stoichiometry.
    return amt * (f ? f.conv : 1);
  }

  /* Dose → engine amount for any drug: MPA via toMpaMg, others via their own single conversion. */
  function toEngineAmt(id, amt, form) {
    var s = specOf(id);
    if (s.custom && s.custom.doseToEngine) return s.custom.doseToEngine(amt);
    return toMpaMg(amt, form);
  }

  /* ---- covariate contract: spec.covariates is the single source --------- */
  function covariateFields(id) {
    var s = specOf(id);
    if (s.covariates && s.covariates.length) {
      return s.covariates.map(function (c) {
        return {
          id: c.id,
          name: c.name,
          type: c.type || 'number',
          options: c.options || null,
          required: !!c.required,
          units: c.units || '',
          min: c.min != null ? c.min : null,
          max: c.max != null ? c.max : null,
          step: c.step != null ? c.step : null,
          default: c.default != null ? c.default : null,
          missing: c.missing || null,
          placeholder: c.placeholder || null,
          help: c.help || (c.name + (c.units ? ' (' + c.units + ')' : ''))
        };
      });
    }
    var out = [];
    if (s.covariateWeight) {
      out.push({
        id: 'wt', name: 'Weight', required: true, units: 'kg',
        min: s.wtMin != null ? s.wtMin : 3, max: s.wtMax != null ? s.wtMax : 300,
        step: 0.5, default: null,
        help: 'Body weight in kg, used as a covariate if the model declares it.'
      });
    }
    if (s.covariateAge) {
      out.push({
        id: 'age', name: 'Age', required: false, units: 'years',
        min: 1, max: 100, step: 1, default: null,
        help: 'Age in years, if the model uses it as a covariate.'
      });
    }
    if (s.covariateRenal) {
      out.push({
        id: 'renal', name: 'Renal function', required: false,
        units: 'as declared by model', min: null, max: null, step: null, default: null,
        help: 'Renal function, if the model uses it as a covariate.'
      });
    }
    if (s.covariateExtra) {
      out.push({
        id: 'extracov', name: 'Other covariate', required: false,
        units: 'as declared by model', min: null, max: null, step: null, default: null,
        help: 'Other model covariates, if any.'
      });
    }
    return out;
  }

  /* ---- individual parameters (eta applied BY NAME; E1) ------------------
   * Legacy specs (stub): ETA.names positional, ka from KA_D, no lag.
   * de Winter: shared + per-form etas; ka/tlag from FORMS; mixture index m
   * selects the morning tlag subgroup for EC-MPS.
   */
  function indivParams(wt, age, renal, extra, eta, id, form, mixIdx) {
    var s = requireReady(id);
    if (s.custom && s.custom.indivParams) return s.custom.indivParams(wt, age, renal, extra, eta, id, form, mixIdx);
    eta = eta || [];
    form = form || (s.formDefault || null);
    var names = etaNamesFor(s, form);
    var byName = {};
    var i;
    for (i = 0; i < names.length; i++) byName[names[i]] = eta[i] || 0;

    var w = wt / (s.WT_REF || 70);
    var expoCL = (s.EXPO && s.EXPO.CLQ != null) ? s.EXPO.CLQ : 0.75;
    var expoV = (s.EXPO && s.EXPO.V != null) ? s.EXPO.V : 1;
    var th = s.THETA || {};
    var cl = (th.CL != null ? th.CL : 10) * Math.pow(w, expoCL) * Math.exp(byName.CL || 0);
    var v1 = (th.V1 != null ? th.V1 : 50) * Math.pow(w, expoV) * Math.exp(byName.V1 || 0);
    var q = th.Q ? th.Q * Math.pow(w, expoCL) * Math.exp(byName.Q || 0) : 0;
    var v2 = th.V2 ? th.V2 * Math.pow(w, expoV) * Math.exp(byName.V2 || 0) : 0;

    var formSpec = (form && s.FORMS && s.FORMS[form]) || null;
    var ka = formSpec
      ? formSpec.ka * Math.exp(byName.KA || 0)
      : (s.KA_D || 0);

    // Lag-time structure per formulation class (E2). Returned as kind + values;
    // simulate() classifies each dose's clock hour for 'mixed'.
    var lagKind = 'none', lagFixed = 0, lagMorning = 0, lagEvening = 0, lagWin = null;
    if (formSpec && formSpec.tlag) {
      var t = formSpec.tlag;
      if (t.type === 'fixed') {
        lagKind = 'fixed';
        lagFixed = t.value * Math.exp(byName.TLAG || 0);
      } else if (t.type === 'mixed') {
        lagKind = 'mixed';
        var mix = t.morning[mixIdx || 0] || t.morning[0];
        lagMorning = mix.v * Math.exp(byName.TLAG_MORN || 0);
        lagEvening = t.evening * Math.exp(byName.TLAG_EVE || 0);
        lagWin = [t.morningStart != null ? t.morningStart : 6,
                  t.eveningStart != null ? t.eveningStart : 18];
      }
    }

    return {
      wt: wt,
      age: age > 0 ? age : null,
      renal: renal,
      extra: extra,
      eta: names.map(function (n) { return byName[n] || 0; }),
      etaNames: names,
      cl: cl,
      v1: v1,
      v2: v2,
      q: q,
      k12: (q > 0 && v1 > 0) ? q / v1 : 0,
      k21: (q > 0 && v2 > 0) ? q / v2 : 0,
      ka: ka,
      form: formSpec ? form : null,
      mixIdx: mixIdx || 0,
      lagKind: lagKind,
      lagFixed: lagFixed,
      lagMorning: lagMorning,
      lagEvening: lagEvening,
      lagWin: lagWin,
      fSc: s.BIOAVAIL_SC != null ? s.BIOAVAIL_SC : 1,
      vmax: th.VMAX || 0,
      km: th.KM || 1,
      drugId: s.id
    };
  }

  /* Per-dose lag (E2): classify by clock hour for mixed formulations.
   * Dose times are absolute hours; hour-of-day = ((t % 24) + 24) % 24. */
  function oralLag(d, p) {
    if (p.lagKind === 'fixed') return p.lagFixed;
    if (p.lagKind === 'mixed') {
      var h = ((d.t % 24) + 24) % 24;
      var win = p.lagWin || [6, 18];
      return (h >= win[0] && h < win[1]) ? p.lagMorning : p.lagEvening;
    }
    return 0;
  }

  // ---- ODE (hours) ----------------------------------------------------------
  function rhs(y, p, rin) {
    var c = y[0] / p.v1;
    var inAbs = p.ka > 0 ? y[2] * p.ka : 0;
    var elim = p.cl * c;
    if (p.vmax > 0 && p.km > 0) elim += (p.vmax * c) / (p.km + c);
    var dC = -elim - p.k12 * y[0] + p.k21 * y[1] + rin + inAbs;
    var dP = -p.k21 * y[1] + p.k12 * y[0];
    var deps = [];
    if (p.ka > 0) deps.push(-inAbs);
    return [dC, dP].concat(deps);
  }

  var DP_A = [
    null,
    [1 / 5],
    [3 / 40, 9 / 40],
    [44 / 45, -56 / 15, 32 / 9],
    [19372 / 6561, -25360 / 2187, 64448 / 6561, -212 / 729],
    [9017 / 3168, -355 / 33, 46732 / 5247, 49 / 176, -5103 / 18656]
  ];
  var DP_C = [0, 1 / 5, 3 / 10, 4 / 5, 8 / 9, 1];
  var DP_B  = [35 / 384, 0, 500 / 1113, 125 / 192, -2187 / 6784, 11 / 84, 0];
  var DP_BH = [5179 / 57600, 0, 7571 / 16695, 393 / 640, -92097 / 339200, 187 / 2100, 1 / 40];

  function dopriStep(f, t, y, h, rtol, atol) {
    var n = y.length;
    var k = new Array(7);
    var s, j, m, acc, yy;
    k[0] = f(t, y);
    for (s = 1; s <= 5; s++) {
      var a = DP_A[s];
      yy = new Array(n);
      for (j = 0; j < n; j++) {
        acc = 0;
        for (m = 0; m < a.length; m++) acc += a[m] * k[m][j];
        yy[j] = y[j] + h * acc;
      }
      k[s] = f(t + DP_C[s] * h, yy);
    }
    var y5 = new Array(n);
    for (j = 0; j < n; j++) {
      acc = 0;
      for (m = 0; m < 6; m++) acc += DP_B[m] * k[m][j];
      y5[j] = y[j] + h * acc;
    }
    k[6] = f(t + h, y5);
    var err2 = 0;
    for (j = 0; j < n; j++) {
      var e = 0;
      for (m = 0; m < 7; m++) e += (DP_B[m] - DP_BH[m]) * k[m][j];
      e *= h;
      var sc = atol + rtol * Math.max(Math.abs(y[j]), Math.abs(y5[j]));
      err2 += (e / sc) * (e / sc);
    }
    var err = Math.sqrt(err2 / n);
    var bad = !isFinite(err);
    for (j = 0; j < n; j++) {
      if (!isFinite(y5[j]) || Math.abs(y5[j]) > 1e12) { bad = true; break; }
    }
    if (bad) return { failed: true };
    return { y5: y5, err: err };
  }

  function integrate(y0, t0, tEnd, rin, p, rtol, atol) {
    var t = t0, y = y0.slice();
    var span = tEnd - t0;
    if (span <= 0) return { ok: true, y: y };
    var h = Math.min(0.25, span); // hours
    var guard = 0;
    while (t < tEnd - 1e-13) {
      if (++guard > 5e6) return { ok: false };
      if (h > tEnd - t) h = tEnd - t;
      var r = dopriStep(function (tt, yy) { return rhs(yy, p, rin); }, t, y, h, rtol, atol);
      if (r.failed) return { ok: false };
      if (r.err <= 1) {
        t += h;
        y = r.y5;
        h = r.err > 0
          ? h * Math.min(5, Math.max(0.2, 0.9 * Math.pow(r.err, -0.2)))
          : h * 5;
      } else {
        h *= Math.max(0.1, Math.min(0.9, 0.9 * Math.pow(r.err, -0.2)));
        if (h < 1e-14) return { ok: false };
      }
      if (h > 2) h = 2;
    }
    return { ok: true, y: y };
  }

  /* ---- Closed-form propagation (F9/S1, docs/METHODS_AUDIT_V101.md) --------
   * The oral 2-compartment model with first-order absorption and linear
   * elimination is linear, so the single-dose solution can be superposed
   * exactly over the dose history (Laplace residues at −ka, −α, −β):
   *   C(t) = Σ_doses (A·ka/V1)·[cA·e^(−ka·Δ) + cB·e^(−α·Δ) + cC·e^(−β·Δ)],
   *   Δ = t − (t_dose + lag).
   * Returns null when it does not apply (IV/bolus doses, non-linear
   * elimination, no peripheral compartment, unknown route), so simulate()
   * falls back to the RK45 path, which remains the cross-check oracle. */
  var CF_EPS = 1e-7;   // relative gap below which ka is nudged off α or β (0/0 in cA, cB, cC)
  var defaultMethod = 'closed';

  /* Rates R = [ka, α, β] and per-mg amplitudes W: one oral dose of A mg gives
   * C(Δ) = A·Σ_r W[r]·e^(−R[r]·Δ). Null when the closed form does not apply. */
  function cfModel(p) {
    if (p.vmax > 0) return null;
    return cfModelRaw(p.cl, p.v1, p.k12, p.k21, p.ka);
  }
  /* The same model from the bare rates (no parameter object to copy): tacrolimus builds one per dose absorption rate,
   * hundreds of thousands of times per fit. */
  function cfModelRaw(cl, v1, k12, k21, ka0) {
    if (!(ka0 > 0) || !(k12 > 0) || !(k21 > 0)) return null;
    var k10 = cl / v1;
    var b = k10 + k12 + k21, c = k10 * k21;
    var alpha = (b + Math.sqrt(b * b - 4 * c)) / 2;
    var beta = c / alpha;
    var ka = ka0;
    if (Math.abs(ka - alpha) < CF_EPS * alpha) ka = alpha * (1 + CF_EPS);
    if (Math.abs(ka - beta) < CF_EPS * beta) ka = beta * (1 + CF_EPS);
    var scale = ka / v1;
    return {
      R: [ka, alpha, beta],
      W: [scale * (k21 - ka) / ((alpha - ka) * (beta - ka)),
          scale * (k21 - alpha) / ((ka - alpha) * (beta - alpha)),
          scale * (k21 - beta) / ((ka - beta) * (alpha - beta))]
    };
  }

  /* ∫₀ˣ of the unit-dose curve (mg·h/L per mg). */
  function cfCum(m, x) {
    if (!(x > 0)) return 0;
    var s = 0;
    for (var r = 0; r < 3; r++) s += m.W[r] * (-Math.expm1(-m.R[r] * x)) / m.R[r];
    return s;
  }

  /* opts.ss = { amt, every, tEnd, route }: an endless regimen of `amt` every
   * `every` hours whose LAST dose is at tEnd (no dose lies beyond it). For a
   * fixed lag the pattern repeats every `every`; for a clock-dependent lag
   * (EC-MPS) it repeats every m doses, m·every being a whole number of days.
   * Returns { T, ts, amt }: the period and the absorption-entry time of the
   * latest occurrence of each dose class in it — or null when the interval
   * cannot tile 24 h (the caller then falls back to a finite history). */
  function ssTrain(ss, p) {
    if (ss.route && ss.route !== 'oral' && ss.route !== 'sc') return null;
    if (!(ss.amt > 0) || !(ss.every > 0) || !isFinite(ss.tEnd)) return null;
    var m = 1, k;
    if (p.lagKind === 'mixed') {
      m = 0;
      for (k = 1; k <= 24 && !m; k++) {
        var x = k * ss.every / 24;
        if (Math.round(x) >= 1 && Math.abs(x - Math.round(x)) < 1e-9) m = k;
      }
      if (!m) return null;
    }
    var ts = [];
    for (k = 0; k < m; k++) {
      var td = ss.tEnd - k * ss.every;
      ts.push(td + oralLag({ t: td }, p));
    }
    return { T: m * ss.every, ts: ts, amt: ss.amt * (p.fSc != null ? p.fSc : 1) };
  }

  /* The endless train is a geometric series per rate r: an occurrence Δ after
   * the latest one contributes e^(−r·Δ)/(1 − e^(−r·T)), so steady state needs
   * no dose history and is exact whatever the half-life (F20). */
  function simulateClosed(doses, outTimes, p, ss, win) {
    var m = cfModel(p);
    if (!m) return null;
    var ts = [], amt = [], i, j, k, r, d;
    for (i = 0; i < doses.length; i++) {
      d = doses[i];
      if (!(d.amt > 0)) continue;
      if (d.route !== 'oral' && d.route !== 'sc') return null;
      ts.push(d.t + oralLag(d, p));
      amt.push(d.amt * (p.fSc != null ? p.fSc : 1));
    }
    var tr = null, den = null;
    if (ss) {
      tr = ssTrain(ss, p);
      if (!tr) return null;
      den = [-Math.expm1(-m.R[0] * tr.T), -Math.expm1(-m.R[1] * tr.T), -Math.expm1(-m.R[2] * tr.T)];
    }
    var R = m.R, W = m.W;
    var nd = ts.length, nOut = outTimes.length;
    var res = new Array(nOut);
    for (j = 0; j < nOut; j++) {
      var tt = outTimes[j], sum = 0;
      for (i = 0; i < nd; i++) {
        var dt = tt - ts[i];   // an out time at the entry instant is BEFORE the dose (trough)
        if (dt > 0) sum += amt[i] * (W[0] * Math.exp(-R[0] * dt) + W[1] * Math.exp(-R[1] * dt) + W[2] * Math.exp(-R[2] * dt));
      }
      if (tr) {
        for (k = 0; k < tr.ts.length; k++) {
          var dd = tt - tr.ts[k];
          if (!(dd > 0)) dd += tr.T * (Math.floor(-dd / tr.T) + 1);   // latest occurrence already entered, strictly before tt
          sum += tr.amt * (W[0] * Math.exp(-R[0] * dd) / den[0] + W[1] * Math.exp(-R[1] * dd) / den[1] + W[2] * Math.exp(-R[2] * dd) / den[2]);
        }
      }
      res[j] = sum;
    }
    var out = { c: res, failed: false, method: 'closed' };
    if (win) {
      var a = win[0], b = win[1], auc = 0;
      for (i = 0; i < nd; i++) auc += amt[i] * (cfCum(m, b - ts[i]) - cfCum(m, a - ts[i]));
      if (tr) {
        for (k = 0; k < tr.ts.length; k++) {
          var t0 = tr.ts[k];
          // occurrences entering inside (a, b) are integrated one by one; those at or before a as a series
          var kb = t0 < b ? 0 : Math.floor((t0 - b) / tr.T) + 1;
          var ka = t0 <= a ? 0 : Math.ceil((t0 - a) / tr.T);
          for (j = kb; j < ka; j++) auc += tr.amt * cfCum(m, b - (t0 - j * tr.T));
          var xa = a - (t0 - ka * tr.T);
          for (r = 0; r < 3; r++) auc += tr.amt * (W[r] / R[r]) * Math.exp(-R[r] * xa) * (-Math.expm1(-R[r] * (b - a))) / den[r];
        }
      }
      out.auc = auc;
    }
    return out;
  }

  /* Engine switch: 'closed' (default; ODE fallback where not applicable) or
   * 'ode' (always RK45). Returns the previous setting. */
  function setMethod(m) {
    if (m !== 'closed' && m !== 'ode') throw new Error('Unknown simulation method: ' + m);
    var prev = defaultMethod;
    defaultMethod = m;
    return prev;
  }

  /* simulate(doses, outTimes, p, opts)
   *   times in HOURS; amounts in MPA mg (conversion happened at ingestion).
   *   Out times at a dose instant are evaluated BEFORE the dose is applied
   *   (trough). Oral doses enter the depot at t + lag (E2).
   *   opts.method: 'closed' | 'ode' (default: setMethod's value).
   *   opts.ss = { amt, every, tEnd, route }: an endless steady-state regimen
   *     (last dose at tEnd) in addition to `doses`. Exact in closed form;
   *     otherwise expanded to the spec's finite ssNDoses history for the ODE.
   *   opts.aucWindow = [a, b]: on the closed-form path the result also carries
   *     `auc`, the exact ∫C dt over [a, b] (mg·h/L). Absent on the ODE path. */
  function simulate(doses, outTimes, p, opts) {
    opts = opts || {};
    var id = opts.id || p.drugId;
    var s = requireReady(id);
    if (s.custom && s.custom.simulate) return s.custom.simulate(doses, outTimes, p, opts);
    var closed = (opts.method || defaultMethod) === 'closed';
    var cf;
    if (closed) {
      cf = simulateClosed(doses, outTimes, p, opts.ss || null, opts.aucWindow || null);
      if (cf) return cf;
    }
    if (opts.ss) {   // no exact train: the spec's finite history, still closed-form where possible
      doses = ssHistory({ amt: opts.ss.amt, intervalHours: opts.ss.every, tEnd: opts.ss.tEnd,
        n: s.ssNDoses || 10, route: opts.ss.route || 'oral' }).concat(doses);
      if (closed) {
        cf = simulateClosed(doses, outTimes, p, null, opts.aucWindow || null);
        if (cf) return cf;
      }
    }
    var rtol = opts.rtol != null ? opts.rtol : 1e-6;
    var atol = opts.atol != null ? opts.atol : 1e-8;
    var dur = opts.dur != null ? opts.dur : (s.INFUSION_D != null ? s.INFUSION_D : 0.5);

    var ev = [];
    var i, d;
    for (i = 0; i < doses.length; i++) {
      d = doses[i];
      if (!(d.amt > 0)) continue;
      if (d.route === 'oral' || d.route === 'sc') {
        if (!(p.ka > 0)) {
          throw new Error('Oral dose given but the selected model has no oral absorption rate (ka).');
        }
        ev.push({ t: d.t + oralLag(d, p), rank: 2, kind: 'oral', amt: d.amt * (p.fSc != null ? p.fSc : 1) });
      } else if (d.route === 'iv' || d.route === 'bolus') {
        if (d.bolus || d.route === 'bolus') {
          ev.push({ t: d.t, rank: 2, kind: 'bolus', amt: d.amt });
        } else {
          var dd = d.dur != null ? d.dur : dur;
          if (!(dd > 0)) dd = 0.5;
          var rate = d.amt / dd;
          ev.push({ t: d.t, rank: 1, kind: 'rate', dr: rate });
          ev.push({ t: d.t + dd, rank: 1, kind: 'rate', dr: -rate });
        }
      } else {
        throw new Error('Unknown dose route: ' + (d.route || 'none'));
      }
    }
    var nOut = outTimes.length;
    var res = new Array(nOut);
    for (i = 0; i < nOut; i++) {
      ev.push({ t: outTimes[i], rank: 0, kind: 'out', idx: i });
    }
    ev.sort(function (a, b) { return a.t - b.t || a.rank - b.rank; });

    var hasDepot = p.ka > 0;
    var y = hasDepot ? [0, 0, 0] : [0, 0];
    var rin = 0, t = ev.length ? ev[0].t : 0, failed = false;
    i = 0;
    while (i < ev.length) {
      var tEv = ev[i].t;
      if (tEv > t) {
        var r = integrate(y, t, tEv, rin, p, rtol, atol);
        if (!r.ok) { failed = true; break; }
        y = r.y;
      }
      t = tEv;
      while (i < ev.length && ev[i].t === tEv) {
        var e = ev[i++];
        if (e.kind === 'out') res[e.idx] = y[0] / p.v1;
        else if (e.kind === 'rate') rin += e.dr;
        else if (e.kind === 'bolus') y[0] += e.amt;
        else if (e.kind === 'oral') y[2] += e.amt;
      }
    }
    for (i = 0; i < nOut; i++) if (res[i] === undefined) res[i] = 0;
    return { c: res, failed: failed, method: 'ode' };
  }

  /* Trapezoidal AUC. If `times` (hours) is provided, use actual Δt;
   * otherwise assume a uniform grid spanning intervalHours. Result mg·h/L. */
  function aucFromConc(conc, intervalHours, times) {
    var n = conc.length;
    if (n < 2) return NaN;
    var s = 0, i, dt;
    if (times && times.length === n) {
      for (i = 1; i < n; i++) {
        if (!isFinite(conc[i - 1]) || !isFinite(conc[i]) || !isFinite(times[i]) || !isFinite(times[i - 1])) return NaN;
        dt = times[i] - times[i - 1];
        if (!(dt > 0)) return NaN;
        s += (conc[i - 1] + conc[i]) * 0.5 * dt;
      }
      return s;
    }
    if (!(intervalHours > 0)) return NaN;
    dt = intervalHours / (n - 1);
    for (i = 1; i < n; i++) {
      var c0 = conc[i - 1], c1 = conc[i];
      if (!isFinite(c0) || !isFinite(c1)) return NaN;
      s += (c0 + c1) * 0.5 * dt;
    }
    return s;
  }

  function intervalGrid(t0, tau, nSteps) {
    var n = Math.max(2, nSteps || 24);
    var out = [];
    for (var k = 0; k <= n; k++) out.push(t0 + k * tau / n);
    return out;
  }

  /* S12 auto-anchoring (v1.0.1): the AUC0–12 target refers to morning-dose
   * profiles. For mixed-lag formulations (EC-MPS), when the schedule ends on
   * an evening dose the reported window is anchored at the most recent
   * morning-clock dose instead. Returns { t, shifted }. Non-mixed
   * formulations (MMF) and morning-ending schedules are never shifted; an
   * all-evening schedule (e.g. once-daily evening EC-MPS) falls back to the
   * last dose. The fit itself is unaffected — only the derived AUC window
   * moves (observations enter the OFV at absolute times). */
  function aucAnchor(doses, drugId, form) {
    var ds = (doses || []).slice().sort(function (a, b) { return a.t - b.t; });
    if (!ds.length) return { t: NaN, shifted: false };
    var last = ds[ds.length - 1].t;
    var sp = specOf(drugId);
    var f = sp && sp.FORMS ? sp.FORMS[form] : null;
    var lag = f && f.tlag;
    if (!lag || lag.type !== 'mixed') return { t: last, shifted: false };
    var lo = lag.morningStart != null ? lag.morningStart : 6;
    var hi = lag.eveningStart != null ? lag.eveningStart : 18;
    function isMorning(tt) { var h = ((tt % 24) + 24) % 24; return h >= lo && h < hi; }
    if (isMorning(last)) return { t: last, shifted: false };
    for (var i = ds.length - 1; i >= 0; i--) {
      if (isMorning(ds[i].t)) return { t: ds[i].t, shifted: true };
    }
    return { t: last, shifted: false };
  }

  function ssHistory(opts) {
    var amt = opts.amt, tau = opts.intervalHours, tEnd = opts.tEnd;
    var n = opts.n != null ? opts.n : 10;
    var route = opts.route || 'oral';
    if (!(amt > 0) || !(tau > 0) || !isFinite(tEnd)) return [];
    var out = [];
    for (var k = n - 1; k >= 0; k--) {
      var dose = { t: tEnd - k * tau, amt: amt, route: route };
      if (opts.form) dose.form = opts.form;   // per-dose formulation (pediatric tacrolimus)
      out.push(dose);
    }
    return out;
  }

  /* Test-only: unlock a tiny 1-cmt oral MPA spec (hours, legacy ETA shape). */
  function installStubSpec() {
    var s = DRUGS.mpa;
    if (!_savedMpa) _savedMpa = JSON.parse(JSON.stringify({
      pending: s.pending, THETA: s.THETA, EXPO: s.EXPO, ETA: s.ETA, SIGMA: s.SIGMA,
      FORMS: s.FORMS, formDefault: s.formDefault, requiresWt: s.requiresWt,
      KA_D: s.KA_D, BIOAVAIL_SC: s.BIOAVAIL_SC, INFUSION_D: s.INFUSION_D,
      info: s.info, covariates: s.covariates, covariateWeight: s.covariateWeight,
      ssNDoses: s.ssNDoses
    }));
    s.pending = false;
    s.THETA = { CL: 10, V1: 50 };       // L/h, L  (70 kg)
    s.EXPO = { CLQ: 0.75, V: 1 };
    s.WT_REF = 70;
    s.ETA = { vars: [0.09, 0.09], names: ['CL', 'V1'] };
    s.SIGMA = { ADD: 0.01, PROP: 0.04 };
    s.KA_D = 1.0;                       // 1/h
    s.FORMS = null;
    s.formDefault = null;
    s.requiresWt = true;
    s.covariates = [{ id: 'wt', name: 'Weight', required: true, units: 'kg', min: 3, max: 300, step: 0.5, default: null,
      help: 'Body weight in kg, used as a covariate if the model declares it.' }];
    s.covariateWeight = true;
    s.ssNDoses = 10;
    s.BIOAVAIL_SC = 1;
    s.INFUSION_D = 0.5;
    s.info = 'STUB spec for engine tests only, not for clinical use.';
    return s;
  }
  function restorePendingSpec() {
    var s = DRUGS.mpa;
    if (!_savedMpa) return s;
    s.pending = _savedMpa.pending;
    s.THETA = _savedMpa.THETA;
    s.EXPO = _savedMpa.EXPO;
    s.ETA = _savedMpa.ETA;
    s.SIGMA = _savedMpa.SIGMA;
    s.FORMS = _savedMpa.FORMS;
    s.formDefault = _savedMpa.formDefault;
    s.requiresWt = _savedMpa.requiresWt;
    s.KA_D = _savedMpa.KA_D;
    s.BIOAVAIL_SC = _savedMpa.BIOAVAIL_SC;
    s.INFUSION_D = _savedMpa.INFUSION_D;
    s.info = _savedMpa.info;
    s.covariates = _savedMpa.covariates;
    s.covariateWeight = _savedMpa.covariateWeight;
    s.ssNDoses = _savedMpa.ssNDoses;
    return s;
  }

  ECU.model = {
    drugs: DRUGS,
    listDrugs: listDrugs,
    select: setDrug,
    requireReady: requireReady,
    drug: drug,
    spec: specOf,
    covariateFields: covariateFields,
    etaNamesFor: function (id, form, extra) { return etaNamesFor(specOf(id), form, extra); },
    etaDim: etaDim,
    omegaVars: omegaVars,
    omegaFull: omegaFull,
    toEngineAmt: toEngineAmt,
    _cfModel: cfModel,
    _cfModelRaw: cfModelRaw,
    mixPriorOf: mixPriorOf,
    toMpaMg: toMpaMg,
    indivParams: indivParams,
    terminalHalfLife: terminalHalfLife,
    simulate: simulate,
    setMethod: setMethod,
    aucFromConc: aucFromConc,
    intervalGrid: intervalGrid,
    aucAnchor: aucAnchor,
    ssHistory: ssHistory,
    installStubSpec: installStubSpec,
    restorePendingSpec: restorePendingSpec
  };

})(typeof window !== 'undefined' ? window : globalThis);
