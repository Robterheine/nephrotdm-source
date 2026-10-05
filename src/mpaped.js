/* =========================================================================
 * NephroTDM: mycophenolic acid (pediatric kidney transplant) population PK model
 *
 * MODEL: Heida A, Jager NGL, Aarnoutse RE, de Winter BCM, de Jong H, Keizer RJ, Cornelissen EAM, ter Heine R. Model-informed dose optimization
 * of mycophenolic acid in pediatric kidney transplant patients. Eur J Clin Pharmacol 2024;80:1761-1771. The structure is that of the authors' run 57
 * (NONMEM listing mmfrun57.lst; the ESM text is a partial rename of it), the parameter VALUES are the article's (Table 2), by owner decision.
 * docs/HANDOFF_PEDIATRIC.md records every decision; tools/nonmem_verify/ped holds the independent oracle and the NONMEM 7.6 cross-check.
 *
 * Units: HOURS, litres; dose in mg of MMF, concentration in mg/L of MPA (the model's CL/F absorbs the MMF-to-MPA factor, so NO 0.739-type
 * conversion is applied here); AUC mg·h/L.
 *
 * Structure (all linear): dose → one transit compartment → central ⇄ peripheral, both transfer steps with the same rate KTR (an Erlang-2
 * input); first-order elimination from the central compartment. Cp = A_central / Vc.
 *   CL/F = 16.0 (WT/70)^0.75 (ALB/34)^−2.49   Vc/F = 24.9 WT/70   Vp/F = 1590 WT/70   Q/F = 36.2 (WT/70)^0.75   KTR = 1.48 (WT/70)^−0.25
 * Random effects (variances): CL 0.139, Vc 2.42, Q 0.337 (diagonal; none on Vp and KTR); inter-occasion variability on the relative bioavailability F,
 * ω² 0.19, one variance for up to 10 occasions (an occasion is a calendar day). Residual error proportional, σ² 0.223 (the natural-scale
 * proportional path of bayes.js is the Gaussian proportional likelihood of FOCE-I).
 *
 * Exact identity used for the reported AUC: steady-state AUC0-τ = dose / CL (typical day, κ = 0), independent of Vc, Vp, Q and KTR.
 * Closed form: two real negative poles (quadratic); the Erlang-2 input turns each pole into h(λ,k,t) (hconv). KTR is fixed per patient, but the
 * disposition poles vary per draw and can lie close to KTR, so the steady-state sum over earlier doses (ssh) is exact and falls back to
 * direct summation within 5 % of a pole.
 * ========================================================================= */
(function (root) {
  'use strict';
  var ECU = root.ECU = root.ECU || {};
  var M = ECU.model;

  var C = {
    CL: 16.0, VC: 24.9, VP: 1590, Q: 36.2, KTR: 1.48, ALB_EXP: -2.49, ALB_REF: 34, WT_STD: 70,
    SIGMA_PROP: 0.223,
    OM_CL: 0.139, OM_VC: 2.42, OM_Q: 0.337, OM_OCC: 0.19,
    NSTAGE: 2, MAX_OCC: 10,
    WT_MIN: 3, WT_MAX: 200, ALB_MIN: 5, ALB_MAX: 50,        // refusal limits (owner decision D9)
    WT_DATA: [12.9, 79.9], ALB_DATA: [24, 42],               // range of the development data (warning outside)
    HCT_REF: null                                            // no blood correction for MPA (plasma assay)
  };

  function num(v) { var x = typeof v === 'number' ? v : parseFloat(v); return isFinite(x) ? x : NaN; }

  /* Normalize the raw covariates (strings from the page, numbers from tests). Idempotent. */
  function normExtra(extra, wt) {
    extra = extra || {};
    if (extra._norm) return extra;
    var w = wt > 0 ? wt : num(extra.wt);
    if (!(w >= C.WT_MIN && w <= C.WT_MAX)) throw new Error('Weight is required, between ' + C.WT_MIN + ' and ' + C.WT_MAX + ' kg.');
    var alb = num(extra.albumin);
    if (!isFinite(alb)) throw new Error('Enter the patient’s albumin in g/L (for example 34). The model needs it.');
    if (!(alb >= C.ALB_MIN && alb <= C.ALB_MAX)) throw new Error('Albumin must be between ' + C.ALB_MIN + ' and ' + C.ALB_MAX + ' g/L (entered in g/L, not g/dL).');
    return { _norm: true, wt: w, albumin: alb, assay: 'emit', nOcc: 0, occDays: [] };
  }

  /* Outside the range the model was built on (not a refusal): the page shows these next to the result. */
  function scopeWarnings(wt, extra) {
    var out = [], w = wt > 0 ? wt : num((extra || {}).wt), a = num((extra || {}).albumin);
    // beyond the refusal limits the run is refused with its own message, so no warning is added there
    if (isFinite(w) && w >= C.WT_MIN && w <= C.WT_MAX && (w < C.WT_DATA[0] || w > C.WT_DATA[1])) out.push('Weight ' + w + ' kg is outside the range the model was built on (' + C.WT_DATA[0] + '–' + C.WT_DATA[1] + ' kg). The model has no data outside this range; treat the estimate as unreliable.');
    if (isFinite(a) && a >= C.ALB_MIN && a <= C.ALB_MAX && (a < C.ALB_DATA[0] || a > C.ALB_DATA[1])) out.push('Albumin ' + a + ' g/L is outside the range the model was built on (' + C.ALB_DATA[0] + '–' + C.ALB_DATA[1] + ' g/L). The model extrapolates a steep albumin effect here, so the estimate can be far off.');
    return out;
  }

  /* η layout: CL, Vc, Q, then one κ on F per sampled occasion (calendar day). */
  function etaNames(ex) {
    var out = ['CL', 'VC', 'Q'];
    for (var j = 0; j < ((ex && ex.nOcc) || 0); j++) out.push('KF' + j);
    return out;
  }
  function omega(ex) {
    var n = ((ex && ex.nOcc) || 0), vars = [C.OM_CL, C.OM_VC, C.OM_Q], i, j;
    for (i = 0; i < n; i++) vars.push(C.OM_OCC);
    var cov = [];
    for (i = 0; i < vars.length; i++) { cov.push(new Array(vars.length).fill(0)); cov[i][i] = vars[i]; }
    return { vars: vars, cov: cov };
  }

  var NAMES_CACHE = [];
  function namesFor(nOcc) { return NAMES_CACHE[nOcc] || (NAMES_CACHE[nOcc] = etaNames({ nOcc: nOcc })); }

  /* Called once per likelihood evaluation: positional etas (CL, Vc, Q, κF_j at 3 + j). */
  function indivParams(wt, age, renal, extra, eta) {
    var ex = normExtra(extra, wt), n = ex.nOcc, names = namesFor(n), m = names.length, i;
    eta = eta || [];
    var e = new Array(m);
    for (i = 0; i < m; i++) e[i] = eta[i] || 0;
    var w = ex.wt, clw = Math.pow(w / C.WT_STD, 0.75), vw = w / C.WT_STD;
    var cl = C.CL * clw * Math.pow(ex.albumin / C.ALB_REF, C.ALB_EXP) * Math.exp(e[0]);
    var vc = C.VC * vw * Math.exp(e[1]), vp = C.VP * vw, q = C.Q * clw * Math.exp(e[2]);
    var kF = new Array(n);
    for (i = 0; i < n; i++) kF[i] = e[3 + i];
    return {
      wt: w, age: null, renal: null, extra: ex, eta: e, etaNames: names,
      CL: cl, VC: vc, VP: vp, Q: q, KTR: C.KTR * Math.pow(w / C.WT_STD, -0.25), kF: kF,
      k10: cl / vc, k12: q / vc, k21: q / vp,
      // aliases the shared code reads (terminal half-life warning only)
      cl: cl, v1: vc, ka: C.KTR, form: null, mixIdx: 0, drugId: 'mpaped', _poles: undefined
    };
  }

  /* The two disposition poles and the residues of the plasma concentration, Cp(t) = Σ r_i e^(−λ_i t) per unit amount entering the central
   * compartment: λ roots of s² − (k10+k12+k21)s + k10 k21 = 0 (positive rates), A_central = [(k21−λ1)e^(−λ1 t) + (λ2−k21)e^(−λ2 t)]/(λ2−λ1). */
  function poles(p) {
    var b = p.k10 + p.k12 + p.k21, c = p.k10 * p.k21, disc = b * b - 4 * c;
    if (!(disc > 0) || !(c > 0)) return null;
    var l2 = (b + Math.sqrt(disc)) / 2, l1 = c / l2;
    if (!(l2 - l1 > 1e-9 * l2)) return null;
    return [{ lam: l1, r: (p.k21 - l1) / (l2 - l1) / p.VC }, { lam: l2, r: (l2 - p.k21) / (l2 - l1) / p.VC }];
  }

  /* Erlang-2 input convolved with e^(−λt): h = (k/(k−λ))² [e^(−λt) − e^(−kt)(1 + x)], x = (k−λ)t. For |x| < 1.5 the tail form
   * h = (kt)² e^(−kt) Σ_{m≥0} x^m/(m+2)! (no cancellation, no division by k − λ, valid for x of either sign). */
  function hconv(lam, k, t) {
    var d = k - lam, x = d * t;
    if (Math.abs(x) < 1.5) {
      var s = 0, term = 0.5, kt = k * t;
      for (var m = 0; m < 24; m++) { s += term; term *= x / (m + 3); }
      return kt * kt * Math.exp(-kt) * s;
    }
    return Math.pow(k / d, 2) * (Math.exp(-lam * t) - Math.exp(-k * t) * (1 + x));
  }

  /* Σ_{m≥0} h(λ, k, dt + m T), dt in (0, T]. Exact (with u = e^(−kT): Σ u^m = S0, Σ m u^m = S1); within 5 % of the pole the closed form divides by
   * (k − λ)², so the sum is taken term by term (capped at 5000 doses). */
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
    var u = Math.exp(-k * T), om = 1 - u, S0 = 1 / om, S1 = u / (om * om);
    return Math.pow(k / d, 2) * (Math.exp(-lam * dt) / (-Math.expm1(-lam * T)) - Math.exp(-k * dt) * (S0 * (1 + d * dt) + S1 * d * T));
  }

  /* doses: [{t, amt (mg MMF), occIdx?, delta?}]. A `delta` dose contributes only its deviation from κ = 0 (steady-state mode, where the endless
   * train at κ = 0 already contains it). opts.ss = { amt, every, tEnd }: endless train, last dose at tEnd, κ = 0. */
  function simulate(doses, outTimes, p, opts) {
    opts = opts || {};
    var fail = function () { return { c: outTimes.map(function () { return 0; }), failed: true, method: 'closed' }; };
    var pl = p._poles !== undefined ? p._poles : (p._poles = poles(p));
    if (!pl) return fail();
    var k = p.KTR, n = outTimes.length, res = new Array(n), i, j, q, dt, sum, d;
    var terms = [];
    for (j = 0; j < doses.length; j++) {
      d = doses[j];
      if (!(d.amt > 0)) continue;
      var kf = d.occIdx != null && d.occIdx >= 0 ? Math.exp(p.kF[d.occIdx] || 0) : 1;
      terms.push({ t: d.t, a: d.amt * (d.delta ? kf - 1 : kf) });
    }
    var ss = opts.ss || null, T = 0, ssA = 0, ssTs = 0;
    if (ss) { T = ss.every; ssA = ss.amt; ssTs = ss.tEnd; }
    for (i = 0; i < n; i++) {
      var tt = outTimes[i]; sum = 0;
      for (j = 0; j < terms.length; j++) {
        dt = tt - terms[j].t;
        if (dt > 0) { var s1 = 0; for (q = 0; q < 2; q++) s1 += pl[q].r * hconv(pl[q].lam, k, dt); sum += terms[j].a * s1; }
      }
      if (ss) {
        dt = tt - ssTs;
        if (!(dt > 0)) dt += T * (Math.floor(-dt / T) + 1);
        var s2 = 0;
        for (q = 0; q < 2; q++) s2 += pl[q].r * ssh(pl[q].lam, k, dt, T);
        sum += ssA * s2;
      }
      if (!isFinite(sum)) return fail();
      res[i] = sum;
    }
    return { c: res, failed: false, method: 'closed' };
  }

  /* ---- ingestion: occasions, MMF only --------------------------------------------------------------------------------
   * An occasion is a calendar day. A dose belongs to the day it is given on; a sample belongs to the day of the most recent dose BEFORE it (a
   * pre-dose trough is the tail of the previous dose). Each sampled occasion gets its own κ on F; the C.MAX_OCC most recent ones. Everything
   * else: κ = 0. */
  function prepare(inp) {
    var ex0 = normExtra(inp.extra, inp.wt);
    var doses = (inp.doses || []).map(function (d) {
      if (d.form != null && d.form !== 'mmf') throw new Error('This model covers mycophenolate mofetil (MMF) only. Enteric-coated mycophenolate sodium (EC-MPS) was not in the data and is not covered.');
      return { t: d.t, amt: d.amt, route: d.route };
    });
    doses.sort(function (a, b) { return a.t - b.t; });
    var days = {}, obs = [];
    (inp.obs || []).forEach(function (o) {
      var day = null;
      for (var i = doses.length - 1; i >= 0; i--) { if (doses[i].t < o.t) { day = Math.floor(doses[i].t / 24); break; } }
      if (day != null) days[day] = (days[day] || 0) + 1;
      obs.push({ t: o.t, c: o.c, cDisp: o.c, hct: null });
    });
    var occDays = Object.keys(days).map(Number).sort(function (a, b) { return a - b; });
    var nSampled = occDays.length;   // before the cap below
    if (occDays.length > C.MAX_OCC) occDays = occDays.slice(occDays.length - C.MAX_OCC);
    var idx = {};
    occDays.forEach(function (dd, j) { idx[dd] = j; });
    doses.forEach(function (d) {
      var j = idx[Math.floor(d.t / 24)];
      d.occIdx = j != null ? j : -1;
      d.delta = !!(inp.steadyState && d.occIdx >= 0);
    });
    var ex = Object.assign({}, ex0, { nOcc: occDays.length, nSampled: nSampled, occDays: occDays });
    return { extra: ex, doses: doses, obs: obs, assay: 'emit', hctReport: null };
  }

  /* The reported quantities live in the κ-free layout: steady state on the typical day. */
  function reportExtra(ex) { return Object.assign({}, normExtra(ex), { nOcc: 0, occDays: [] }); }

  /* Steady-state exposure per draw: the AUC over the interval is dose/CL exactly (typical day); the trough is the concentration one interval after
   * the last dose. ctx = { wt, extra, ss:{amt,every,tEnd}, grid }. No blood correction exists for MPA: the "reference" results repeat the actual ones. */
  function exposure(draws, ctx) {
    var ex0 = reportExtra(ctx.extra), n = draws.length, tEnd = ctx.grid[ctx.grid.length - 1];
    var auc = new Array(n), tr = new Array(n);
    for (var d = 0; d < n; d++) {
      var p = indivParams(ctx.wt, null, null, ex0, draws[d]);
      var sim = simulate([], [tEnd], p, { ss: ctx.ss });
      if (sim.failed) { auc[d] = tr[d] = NaN; continue; }
      auc[d] = ctx.ss.amt / p.CL; tr[d] = sim.c[0];
    }
    return { aucA: auc, trA: tr, aucR: auc, trR: tr };
  }

  // plasma assay: model scale = reported scale, no blood transform
  function identity(v) { return v; }

  var SPEC = {
    id: 'mpaped',
    label: 'Mycophenolic acid (pediatric kidney)',
    article: 'Heida A, Jager NGL, Aarnoutse RE, de Winter BCM, de Jong H, Keizer RJ, Cornelissen EAM, ter Heine R. Model-informed dose optimization of mycophenolic acid in pediatric kidney transplant patients. Eur J Clin Pharmacol 2024;80:1761–1771.',
    backgroundLabel: 'Mycophenolic acid background',
    card: { name: 'Mycophenolic acid (pediatric kidney)', sub: 'AUC₀–₁₂ₕ · Heida 2024' },
    info: 'Two-compartment model with two equal absorption stages for mycophenolate mofetil (MMF) in children with a kidney transplant (30 children, 266 concentrations), scaled to weight, with an albumin effect on clearance and inter-occasion variability in bioavailability. Doses are MMF in mg, concentrations are mycophenolic acid in mg/L. Reported: steady-state AUC0–12h and trough. For research use only; not a medical device.',
    pending: false,
    report: {
      lead: 'auc',
      modelCite: 'Heida A, Jager NGL, Aarnoutse RE, et al. Model-informed dose optimization of mycophenolic acid in pediatric kidney transplant patients. Eur J Clin Pharmacol 2024;80:1761–1771. doi:10.1007/s00228-024-03743-0.',
      scope: 'Children with a kidney transplant. Typical-day estimate from the samples. · mycophenolate mofetil · research use only',
      windowSource: 'Bergan S, Brunet M, Hesselink DA, et al. Personalized therapy for mycophenolate: consensus report by IATDMCT. Ther Drug Monit 2021;43(2):150–197.',
      noWindow: {},
      reading: ['AUC₀–₁₂ₕ is the exposure over one 12-hour interval at steady state; other intervals are shown as their 12-hour equivalent.',
        'The AUC is for a typical day on this regimen; a single day can differ by a factor of about 1.2 to 1.3 (one SD). In a small prospective evaluation (29 children), the AUC predicted from one occasion did not match the AUC measured about three months later.',
        'The window 30 to 60 mg·h/L is the kidney-transplant range. The predicted trough is informational: the app has no trough target.']
    },
    // bloodCorrection false: plasma assay, no haematocrit, no corrected rows (read by ui.js and report.js)
    ui: { noun: 'mycophenolic acid', reportNoun: 'mycophenolic acid (pediatric kidney)', doseNoun: 'MMF', wtPlaceholder: 'e.g. 38', weight: true, predDose: false, occasions: true, bloodCorrection: false, badge: 'Heida 2024 · MPA (children)', chartTitle: 'Mycophenolic acid plasma concentration–time forecast', shrinkEta: 'CL', modelLine: 'Heida 2024 (children with a kidney transplant, mycophenolate mofetil)' },
    units: { conc: 'mg/L', auc: 'mg·h/L', dose: 'mg', concAlt: 'µg/mL' },

    THETA: { CL: C.CL, V1: C.VC, V2: C.VP, Q: C.Q },
    EXPO: { CLQ: 0.75, V: 1 },
    WT_REF: 70,
    requiresWt: true,
    ETA: { shared: ['CL', 'VC', 'Q'], iiv: { CL: C.OM_CL, VC: C.OM_VC, Q: C.OM_Q } },
    FORMS: null,
    formDefault: null,
    SIGMA: { ADD: 0, PROP: C.SIGMA_PROP },
    KA_D: C.KTR,
    BIOAVAIL_SC: 1,
    INFUSION_D: 0.5,
    adminRoutes: ['oral'],

    covariates: [
      { id: 'wt', name: 'Weight', type: 'number', required: true, units: 'kg', min: C.WT_MIN, max: C.WT_MAX, step: 'any',
        help: 'Body weight in kg. Clearance and the transfer rates scale with weight, volumes in proportion. The model was built on children of 12.9–79.9 kg.' },
      { id: 'albumin', name: 'Albumin', type: 'number', required: true, units: 'g/L', min: C.ALB_MIN, max: C.ALB_MAX, step: 'any', placeholder: 'e.g. 34',
        help: 'Serum albumin in g/L (34, not 3.4 g/dL). Low albumin raises clearance steeply in this model (clearance ∝ albumin to the power −2.49). The model was built on 24–42 g/L.' }
    ],
    covariateWeight: true, covariateAge: false, covariateRenal: false, covariateExtra: false,

    dose: { min: 50, max: 3000, step: 'any', default: 600 },   // mg of MMF per administration
    wtMin: C.WT_MIN, wtMax: C.WT_MAX, wtStep: 0.1,
    scope: { wt: C.WT_DATA, albumin: C.ALB_DATA },
    ssIntervalDefault: 12,
    ssNDoses: 30,
    intervalRange: { min: 10, max: 14, text: 'twice-daily mycophenolate mofetil (about 12 h between doses)' },
    obsValMin: 0.01, obsValMax: 200,
    windowRange: { min: 0.1, max: 500 },
    windowDefaultLo: 30, windowDefaultHi: 60,
    troughDefaultLo: null, troughDefaultHi: null,
    windowStandard: 'kidney-ped',
    windowSets: [
      { id: 'kidney-ped', label: 'Kidney transplant, AUC0–12h', trough: null, auc: [30, 60], grade: 'Consensus, grade B, II',
        basis: 'IATDMCT consensus (Bergan 2021), kidney transplantation. For nephrotic syndrome Heida 2026 lists above 50 mg·h/L (a lower bound only); see the Background before using it.' }
    ],
    windowHint: 'See “Mycophenolic acid background” for reference values. The window starts at the kidney-transplant range 30–60 mg·h/L.',
    samplePeak: 'In the model authors’ evaluation, samples at 0, 1 and 2 hours after the dose gave AUC estimates within their 25% limit. Enter the exact times of dose and samples.',
    perChainSeeds: true,
    mcmcScale: function (dim) { return Math.min(1, 2.38 / Math.sqrt(dim)); },
    mcmcIters: function (dim) { return dim <= 7 ? 800000 : (dim <= 15 ? 1600000 : 3200000); },
    yMaxCap: null,
    assay: 'EMIT (the assay of the development data)',
    assumptions: [
      'Children with a kidney transplant on mycophenolate mofetil (CellCept) together with tacrolimus or everolimus. Built on children aged 4–18 years, weight 12.9–79.9 kg and albumin 24–42 g/L, with a median of 9.5 days after transplantation. Not for ciclosporin co-medication, for EC-MPS or for other indications',
      'Doses are mg of MMF and concentrations mg/L of mycophenolic acid; the model absorbs the conversion, so none is applied',
      'Concentrations should come from the assay the model was built on (EMIT). An immunoassay overestimates against LC-MS because of the acyl glucuronide metabolite; there is no assay field and no conversion',
      'Reported values are the patient’s steady state on a typical day (occasion effects at zero). They are estimated from the samples; the AUC of a single day scatters around them',
      'Occasion = calendar day. Each sampled day (up to the 10 most recent) gets its own effect on bioavailability, one shared variance (0.19); days without a sample are taken at zero',
      'The variability of the central volume (variance 2.42) is large and poorly identified; the AUC does not depend on it, concentrations early after a dose do',
      'No enterohepatic recirculation compartment (the authors note that secondary peaks may be fitted poorly). Nephrotic syndrome was not in the data',
      'Estimated with NONMEM FOCE-I'
    ],
    custom: null
  };

  SPEC.custom = {
    constants: C, assays: { emit: { label: 'EMIT', m: 1, b: 0 } },
    etaNames: etaNames, omega: omega,
    indivParams: indivParams, simulate: simulate, poles: poles, hconv: hconv, ssh: ssh,
    prepare: prepare, exposure: exposure, reportExtra: reportExtra, normExtra: normExtra, scopeWarnings: scopeWarnings,
    toObs: identity, fromModel: identity, fromModelAuc: identity, toModel: identity,
    doseToEngine: function (mg) { return mg; }
  };

  M.drugs.mpaped = SPEC;
})(typeof window !== 'undefined' ? window : globalThis);
