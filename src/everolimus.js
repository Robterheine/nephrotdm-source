/* =========================================================================
 * NephroTDM: everolimus (adult kidney transplant) population PK model
 *
 * MODEL: Zwart TC, Moes DJAR, van der Boog PJM, van Erp NP, de Fijter JW, Guchelaar HJ, Keizer RJ, ter Heine R.
 * Model-informed precision dosing of everolimus: external validation in adult renal transplant recipients.
 * Clin Pharmacokinet 2021;60:191-203 — Model 3 (the ESM NONMEM code). docs/HANDOFF_EVEROLIMUS_M3.md records every
 * decision taken here; tools/evr_prototype holds the matrix-exponential and RK4 oracles this file is tested against,
 * tools/nonmem_verify/evr the NONMEM 7.6 cross-check (closed form vs NONMEM: 5e-9).
 *
 * Units: HOURS, litres, µg (engine); concentrations µg/L; AUC µg·h/L. Doses are entered in mg and converted ONCE
 * at ingestion (doseToEngine). The NONMEM code works in mg and mg/L; the binding constants below are its values ×1000.
 *
 * Structure (all linear): dose → five equal absorption stages (Erlang-5, rate KA = 5/MAT) → liver ⇄ central plasma ⇄
 * peripheral; elimination from the liver only. Hepatic plasma flow QHP = QH (1 − Ht), so Ht is a PK covariate.
 *   EH = CLINT·FU / (QHP + CLINT·FU)   CLH = EH·QHP   K20 = CLH/VL   K23 = QHP (1 − EH)/VL   K32 = QHP/V3
 *   Cp = A3/V3.  Whole blood: Cwb = Ht (Bmax Cp/(Kd + Cp) + Kns Cp) + (1 − Ht) Cp  (Eqs. 1-2).
 * Corrected value (Eq. 3, owner decision D2): the same plasma curve read at Ht 0.38.
 * Random effects: CLINT, V3, FU (diagonal). No occasion layer. Residual error: additive on ln(C), variance 0.0957.
 * Covariates: haematocrit; prednisolone at 20 mg/day or more (a binary choice, CLINT ×1.44).
 *
 * Closed form (verified to 5e-11 against the matrix exponential): the disposition has three real negative poles
 * (cubic, trigonometric solution); the Erlang-5 input turns each pole into h(λ,t), see hconv(). One steady-state
 * concentration costs about 0.4 µs. Haematocrit is held at ONE value for the PK path (the latest sample's); NONMEM
 * applies the Ht of each record. Measured cost in the predicted earlier samples: mean 1.0 %, max 6.2 % (handoff §9).
 * ========================================================================= */
(function (root) {
  'use strict';
  var ECU = root.ECU = root.ECU || {};
  var M = ECU.model;

  var C = {
    MAT: 0.549, CLINT: 322, V3: 266, Q: 79.5, V4: 519,
    PRED: 1.44,                                   // CLINT multiplier at prednisolone 20 mg/day or more
    FU: 0.27, QH: 90, VL: 1.55,
    BMAX: 964.25, KD: 91.95, KNS: 0.15336,        // µg/L erythrocytes, µg/L plasma, dimensionless (ESM mg/L values ×1000)
    HCT_REF: 0.38,                                // Eq. 3 reference haematocrit (owner decision D1)
    SIGMA_LOG2: 0.0957,
    OM_CLINT: 0.118, OM_V3: 0.401, OM_FU: 0.0009,
    NSTAGE: 5
  };
  C.KA = C.NSTAGE / C.MAT;

  function num(v) { var x = typeof v === 'number' ? v : parseFloat(v); return isFinite(x) ? x : NaN; }

  function pctCheck(hct) {
    if (isFinite(hct) && hct > 1 && hct <= 100) throw new Error('Haematocrit is entered in L/L (for example 0.38), not as a percentage.');
  }

  /* Normalize the raw covariates (strings from the page, numbers from tests). Idempotent. */
  function normExtra(extra) {
    extra = extra || {};
    if (extra._norm) return extra;
    var hct = num(extra.hct);
    pctCheck(hct);
    if (!isFinite(hct)) throw new Error('Enter the patient’s haematocrit in L/L (for example 0.38).');
    if (hct < 0.10 || hct > 0.65) throw new Error('Haematocrit must be between 0.10 and 0.65 L/L.');
    if (extra.predHigh !== 'low' && extra.predHigh !== 'high') throw new Error('Choose the prednisolone dose group.');
    return { _norm: true, hct: hct, predHigh: extra.predHigh, predFlag: extra.predHigh === 'high', assay: 'lcms', nOcc: 0, occDays: [] };
  }

  var NAMES = ['CLINT', 'V3', 'FU'];
  function etaNames() { return NAMES; }
  function omega() { return { vars: [C.OM_CLINT, C.OM_V3, C.OM_FU], cov: null }; }

  /* Whole blood from plasma at haematocrit hct (µg/L both). */
  function toObs(cp, hct) { return hct * (C.BMAX * cp / (C.KD + cp) + C.KNS * cp) + (1 - hct) * cp; }

  /* Called once per likelihood evaluation: positional etas (CLINT, V3, FU), no allocation beyond the result. */
  function indivParams(wt, age, renal, extra, eta) {
    var ex = normExtra(extra);
    eta = eta || [];
    var clint = C.CLINT * (ex.predFlag ? C.PRED : 1) * Math.exp(eta[0] || 0);
    var v3 = C.V3 * Math.exp(eta[1] || 0);
    var fu = C.FU * Math.exp(eta[2] || 0);
    var qhp = C.QH * (1 - ex.hct);
    var eh = clint * fu / (qhp + clint * fu), clh = eh * qhp;
    var k34 = C.Q / v3, k43 = C.Q / C.V4;
    return {
      wt: wt, age: null, renal: null, extra: ex, eta: eta, etaNames: NAMES,
      k: C.KA, CLINT: clint, V3: v3, FU: fu, QHP: qhp, EH: eh, CLH: clh,
      K20: clh / C.VL, K23: qhp * (1 - eh) / C.VL, K32: qhp / v3, K34: k34, K43: k43,
      // aliases the shared code reads (terminal half-life warning only)
      cl: clh, v1: v3, k12: k34, k21: k43, ka: C.KA, form: null, mixIdx: 0, drugId: 'evr', _poles: undefined
    };
  }

  /* The three disposition poles (liver, central, peripheral after a unit amount enters the liver) and the residues of the plasma
   * concentration, Cp(t) = Σ r_i e^(−λ_i t) per unit amount. The characteristic polynomial is
   * D(s) = (s+a)((s+b)(s+c) − K43 K34) − K32 K23 (s+c), a = K20+K23, b = K32+K34, c = K43. Its roots are real, negative and distinct
   * for any compartmental system; null (the caller refuses) if they are not, or if anything is not finite. */
  function poles(p) {
    var a = p.K20 + p.K23, b = p.K32 + p.K34, c = p.K43;
    var c2 = a + b + c, c1 = a * b + a * c + b * c - p.K43 * p.K34 - p.K32 * p.K23, c0 = a * (b * c - p.K43 * p.K34) - p.K32 * p.K23 * c;
    var q = (3 * c1 - c2 * c2) / 9, r = (9 * c2 * c1 - 27 * c0 - 2 * c2 * c2 * c2) / 54;
    if (!(q < 0)) return null;
    var ratio = r / Math.sqrt(-q * q * q);
    if (!(Math.abs(ratio) < 1)) return null;           // |ratio| ≥ 1: a repeated or a complex root
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

  /* Erlang-5 input convolved with e^(−λt): h = (k/(k−λ))^5 [e^(−λt) − e^(−kt) Σ_{j<5} x^j/j!], x = (k−λ)t.
   * The bracket cancels when |x| is small and overflows when λ > k (the liver pole, about 36 /h, against k = 9.1 /h), so both ranges
   * use the tail form  h = (kt)^5 e^(−kt) Σ_{m≥0} x^m / (m+5)!  (no cancellation, no division by k − λ, valid for x of either sign). */
  function hconv(lam, k, t) {
    var d = k - lam, x = d * t;
    if (Math.abs(x) < 1.5) {
      var s = 0, term = 1 / 120, kt = k * t;
      for (var m = 0; m < 24; m++) { s += term; term *= x / (m + 6); }
      return kt * kt * kt * kt * kt * Math.exp(-kt) * s;
    }
    var f = Math.pow(k / d, 5), sp = 0, tm = 1;
    for (var j = 0; j < 5; j++) { sp += tm; tm *= x / (j + 1); }
    return f * (Math.exp(-lam * t) - Math.exp(-k * t) * sp);
  }

  /* doses: [{t, amt (µg)}]; opts.ss = {amt, every, tEnd}: endless train, last dose at tEnd. Exact steady state: the exponential
   * parts of all earlier doses sum geometrically; their Erlang polynomial parts (e^(−kt) with k·τ ≈ 109) are zero to 1e-40. */
  function simulate(doses, outTimes, p, opts) {
    opts = opts || {};
    var fail = function () { return { c: outTimes.map(function () { return 0; }), failed: true, method: 'closed' }; };
    var pl = p._poles !== undefined ? p._poles : (p._poles = poles(p));
    if (!pl) return fail();
    var k = p.k, n = outTimes.length, res = new Array(n), i, j, q, dt, sum, d;
    var ss = opts.ss || null, T = 0, ssA = 0, ssTs = 0, geo = null;
    if (ss) {
      T = ss.every; ssA = ss.amt; ssTs = ss.tEnd;
      geo = pl.map(function (z) { return Math.pow(k / (k - z.lam), 5) * Math.exp(-z.lam * T) / (-Math.expm1(-z.lam * T)); });
    }
    for (i = 0; i < n; i++) {
      var tt = outTimes[i]; sum = 0;
      for (j = 0; j < doses.length; j++) {
        d = doses[j];
        if (!(d.amt > 0)) continue;
        dt = tt - d.t;
        if (dt > 0) { var s1 = 0; for (q = 0; q < 3; q++) s1 += pl[q].r * hconv(pl[q].lam, k, dt); sum += d.amt * s1; }
      }
      if (ss) {
        dt = tt - ssTs;
        if (!(dt > 0)) dt += T * (Math.floor(-dt / T) + 1);
        var s2 = 0;
        for (q = 0; q < 3; q++) s2 += pl[q].r * (hconv(pl[q].lam, k, dt) + geo[q] * Math.exp(-pl[q].lam * dt));
        sum += ssA * s2;
      }
      if (!isFinite(sum)) return fail();
      res[i] = sum;
    }
    return { c: res, failed: false, method: 'closed' };
  }

  /* ---- ingestion: assay is fixed (LC-MS/MS), every sample carries a haematocrit -------------------------- */
  function prepare(inp) {
    var ex0 = normExtra(inp.extra);
    var doses = (inp.doses || []).map(function (d) { return { t: d.t, amt: d.amt, route: d.route }; });
    doses.sort(function (a, b) { return a.t - b.t; });
    var obs = [];
    (inp.obs || []).forEach(function (o) {
      var hct = isFinite(o.hct) ? o.hct : ex0.hct;
      pctCheck(hct);
      if (!(hct >= 0.10 && hct <= 0.65)) throw new Error('Every sample needs a haematocrit between 0.10 and 0.65 L/L.');
      obs.push({ t: o.t, c: o.c, cDisp: o.c, hct: hct });
    });
    // the haematocrit the reported (actual) value refers to, and the one the PK path uses: the latest sample's, else the patient field
    var hctReport = obs.length ? obs[obs.length - 1].hct : ex0.hct;
    var ex = Object.assign({}, ex0, { hct: hctReport, nOcc: 0, nSampled: 0, occDays: [] });
    return { extra: ex, doses: doses, obs: obs, assay: 'lcms', hctReport: hctReport };
  }

  function reportExtra(ex) { return normExtra(ex); }

  /* Steady-state exposure per draw: whole-blood AUC over the interval and the trough, at the patient's haematocrit and at the
   * reference one (Eq. 3). ctx = { extra, ss:{amt,every,tEnd}, grid, hctAct, hctRef }. Trapezoid on the grid (0.25 h: 1.6e-5). */
  function exposure(draws, ctx) {
    var ex0 = reportExtra(ctx.extra), n = draws.length, grid = ctx.grid, ng = grid.length;
    var aucA = new Array(n), trA = new Array(n), aucR = new Array(n), trR = new Array(n);
    for (var d = 0; d < n; d++) {
      var p = indivParams(ctx.wt, null, null, ex0, draws[d]);
      var sim = simulate([], grid, p, { ss: ctx.ss });
      if (sim.failed) { aucA[d] = trA[d] = aucR[d] = trR[d] = NaN; continue; }
      var sa = 0, sr = 0, pa = toObs(sim.c[0], ctx.hctAct), pr = toObs(sim.c[0], ctx.hctRef);
      for (var k = 1; k < ng; k++) {
        var na = toObs(sim.c[k], ctx.hctAct), nr = toObs(sim.c[k], ctx.hctRef), dt = grid[k] - grid[k - 1];
        sa += (pa + na) * 0.5 * dt; sr += (pr + nr) * 0.5 * dt;
        pa = na; pr = nr;
      }
      aucA[d] = sa; aucR[d] = sr; trA[d] = pa; trR[d] = pr;
    }
    return { aucA: aucA, trA: trA, aucR: aucR, trR: trR };
  }

  // LC-MS/MS only: model scale = reported scale
  function fromModel(v) { return v; }
  function fromModelAuc(v) { return v; }
  function toModel(v) { return v; }

  var SPEC = {
    id: 'evr',
    label: 'Everolimus',
    article: 'Zwart TC, Moes DJAR, van der Boog PJM, van Erp NP, de Fijter JW, Guchelaar HJ, Keizer RJ, ter Heine R. Model-informed precision dosing of everolimus: external validation in adult renal transplant recipients. Clin Pharmacokinet 2021;60:191–203 (Model 3).',
    backgroundLabel: 'Everolimus background',
    info: 'Semi-mechanistic model for twice-daily everolimus in adult kidney transplant recipients: five equal absorption stages, a liver compartment with flow-limited extraction, and a two-compartment plasma disposition. Whole-blood concentrations follow from the haematocrit through saturable red-cell binding. Prednisolone at 20 mg/day or more is the one drug covariate. Reported: steady-state AUC0–12h and trough, as measured (actual) and corrected to haematocrit 0.38.',
    pending: false,
    // presentation flags read by ui.js (texts are in ECU.drugTexts.evr)
    ui: { noun: 'everolimus', weight: false, predDose: false, badge: 'Zwart 2021 · everolimus (Model 3)', chartTitle: 'Everolimus whole-blood concentration–time forecast', shrinkEta: 'CLINT', modelLine: 'Zwart 2021, Model 3 (adult kidney transplant, twice-daily everolimus)' },
    units: { conc: 'µg/L', auc: 'µg·h/L', dose: 'mg', concAlt: 'ng/mL' },
    windowOptional: true,

    THETA: { CLINT: C.CLINT, V3: C.V3, Q: C.Q, V4: C.V4 },
    EXPO: { CLQ: 1, V: 1 },
    WT_REF: 70,
    requiresWt: false,
    ETA: { shared: NAMES.slice(), iiv: { CLINT: C.OM_CLINT, V3: C.OM_V3, FU: C.OM_FU } },
    FORMS: null,
    formDefault: null,
    SIGMA: { ADD: 0, PROP: 0, LOG: Math.sqrt(C.SIGMA_LOG2) },
    KA_D: C.KA,
    BIOAVAIL_SC: 1,
    INFUSION_D: 0.5,
    adminRoutes: ['oral'],

    covariates: [
      { id: 'hct', name: 'Haematocrit', type: 'number', required: true, units: 'L/L', min: 0.1, max: 0.65, step: 'any',
        help: 'Haematocrit as a fraction (0.38, not 38 %). Everolimus is bound to red cells, so whole-blood concentrations rise with haematocrit at an unchanged plasma concentration. Used for the forecast without samples and as the default for sample rows; each sample can carry its own value.' },
      { id: 'predHigh', name: 'Prednisolone', type: 'select', required: true, missing: 'Choose the prednisolone dose group.',
        options: [{ value: '', label: 'choose…' }, { value: 'low', label: 'Less than 20 mg/day, or none' }, { value: 'high', label: '20 mg/day or more' }],
        help: 'At 20 mg/day or more this model assumes about 30 % lower exposure for the same dose (clearance 1.44 times higher). Below 20 mg/day it assumes no effect.' }
    ],
    covariateWeight: false, covariateAge: false, covariateRenal: false, covariateExtra: false,

    dose: { min: 0.25, max: 5, step: 'any', default: 1.5 },
    ssIntervalDefault: 12,
    intervalRange: { min: 10, max: 14, text: 'twice-daily everolimus (about 12 h between doses)' },
    obsValMin: 0.5, obsValMax: 60,
    windowRange: { min: 0.1, max: 5000 },
    // The engine applies no window of its own: a cleared window means intervals without probabilities. Source: IATDMCT second
    // consensus (Masuda 2025), kidney: trough 3-8 µg/L with a reduced-exposure CNI, 6-10 without a CNI; no AUC target is given.
    windowDefaultLo: null, windowDefaultHi: null,
    troughDefaultLo: null, troughDefaultHi: null,
    windowStandard: 'evr-cni',
    windowSets: [
      { id: 'evr-cni', label: 'Adult kidney, with reduced-exposure CNI', trough: [3, 8], auc: null, grade: 'Consensus recommendation',
        basis: 'Everolimus with a reduced-exposure calcineurin inhibitor (IATDMCT second consensus, kidney recommendation and Table 1). The consensus gives no AUC target.' },
      { id: 'evr-nocni', label: 'Adult kidney, without CNI', trough: [6, 10], auc: null, grade: 'Consensus Table 1',
        basis: 'Everolimus without a calcineurin inhibitor (IATDMCT second consensus, Table 1). The consensus gives no AUC target.' }
    ],
    windowHint: 'The trough window starts at 3–8 µg/L (with a reduced-exposure CNI). Pick the set that matches the patient’s co-medication, or clear it. The consensus gives no AUC target; add one if your protocol has it. µg/L is the same as ng/mL.',
    samplePeak: 'A predose trough, with or without one sample 1–3 h after the dose, is what the model was evaluated on. Enter the exact times and the haematocrit of the same day.',
    perChainSeeds: true,
    mcmcScale: function (dim) { return Math.min(1, 2.38 / Math.sqrt(dim)); },
    mcmcIters: function () { return 400000; },
    yMaxCap: null,
    assay: 'LC-MS/MS',
    assumptions: [
      'Adult kidney-transplant recipients on twice-daily everolimus. Cancer indications, children, other organs and once-daily dosing are not covered',
      'Concentrations must come from an LC-MS/MS assay; immunoassay results are not interchangeable and have no conversion',
      'Reported values are the patient’s typical steady-state level at the haematocrit of the most recent sample. The model has no day-to-day effect; its residual error (SD 0.31 on the log scale) covers everything else, assay and day-to-day variability included',
      'Corrected to haematocrit 0.38 means the whole-blood concentration this patient would show with the same plasma concentration at a haematocrit of 0.38 (Eq. 3 of the model paper)',
      'Prednisolone at 20 mg/day or more lowers exposure by about 30 % in this model; below 20 mg/day there is no effect',
      'Haematocrit is held at one value for the pharmacokinetics, that of the latest sample; each sample keeps its own haematocrit for the blood reading',
      'Not in the model: ciclosporin and other CYP3A or P-gp inhibitors and inducers, liver function, food, adherence, time since transplantation'
    ],
    custom: null   // filled below
  };

  SPEC.custom = {
    constants: C, assays: { lcms: { label: 'LC-MS/MS', m: 1, b: 0 } },
    etaNames: etaNames, omega: omega,
    indivParams: indivParams, simulate: simulate, poles: poles,
    prepare: prepare, exposure: exposure, reportExtra: reportExtra, normExtra: normExtra,
    toObs: toObs,
    fromModel: fromModel, fromModelAuc: fromModelAuc, toModel: toModel,
    doseToEngine: function (mg) { return mg * 1000; }
  };

  M.drugs.evr = SPEC;
})(typeof window !== 'undefined' ? window : globalThis);
