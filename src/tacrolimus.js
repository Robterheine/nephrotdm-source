/* =========================================================================
 * NephroTDM: tacrolimus (adult kidney transplant) population PK model
 *
 * MODEL: Størset E, Holford N, Hennig S, et al. Improved prediction of
 * tacrolimus concentrations early after kidney transplantation using
 * theory-based pharmacokinetic modelling. Br J Clin Pharmacol 2014;78(3):509–523
 * (Table 2, Equation 3, Appendix S1). docs/IMPLEMENTATION_PLAN_STORSET_2014.md
 * records every decision taken here.
 *
 * Units: HOURS, litres, µg (engine); concentrations µg/L; AUC µg·h/L.
 *   Doses are entered in mg and converted ONCE, at ingestion (doseToEngine).
 *
 * Structure: two-compartment, first-order absorption with lag, linear. All
 * disposition parameters refer to PLASMA (Cp); whole blood (Cwb) is a pointwise
 * transform of Cp that depends on the haematocrit (toObs, Equation 3).
 *   CL/F = 811 (FFM/60)^0.75 [×1.30 CYP3A5 expresser]    V1/F = 6290 FFM/60
 *   Q/F  = 1200 (FFM/60)^0.75                            V2/F = 32100 FFM/60
 *   ka 1.01 /h, tlag 0.41 h
 *   F    = [1 − 0.67·Pred/(35+Pred)] × [0.82 expresser]     (relative, per dose)
 *   Cwb  = Cp·(1 + Hct·418/(Cp+3.8))
 * Random effects: BSV on CL, V1, Q (correlated block); BOV (one κ per sampled
 * occasion) on F and ka. Residual error proportional, 14.9 %.
 *
 * NOT in the model (owner decisions D2, D4): the first-day bioavailability
 * effect (×2.68) and any genotype mixture. Unknown CYP3A5 = non-expresser.
 *
 * Whole blood is expressed on the LC-MS/MS scale. Abbott CMIA values are
 * converted at ingestion with the paper's own equation (Eq. 1, Oslo
 * laboratory): LC = 0.80·CMIA + 0.19 µg/L, and results are converted back.
 * ========================================================================= */
(function (root) {
  'use strict';
  var ECU = root.ECU = root.ECU || {};
  var M = ECU.model;

  var C = {
    CL: 811, V1: 6290, Q: 1200, V2: 32100,    // plasma, FFM 60 kg, non-expresser (L/h, L)
    KA: 1.01, TLAG: 0.41,
    FFM_STD: 60,
    BMAX: 418, KD: 3.8,                        // µg/L erythrocytes, µg/L plasma (Jusko 1995)
    CYP_CL: 1.30, CYP_F: 0.82,                 // CYP3A5 expresser vs non-expresser
    PRED_EMAX: 0.67, PRED_50: 35,              // mg/day
    HCT_REF: 0.35,                             // reference for the corrected value (owner decision D7)
    PROP: 0.149 * 0.149,
    // BSV CV% → ω² by the √ω² convention (ω = CV), as for the MPA model (D9)
    CV_CL: 0.40, CV_V1: 0.54, CV_Q: 0.63,
    CORR_CL_V1: 0.43, CORR_CL_Q: 0.62, CORR_V1_Q: 0.43 * 0.62,   // V1–Q unpublished: product (D10)
    CV_KF: 0.23, CV_KKA: 1.20,                 // BOV
    MAX_OCC: 12                                // most recent sampled occasions that get their own κ
  };
  var ASSAY = {
    lcms: { label: 'LC-MS/MS', m: 1, b: 0 },
    cmia: { label: 'Abbott CMIA (Architect)', m: 0.80, b: 0.19 }   // LC = m·CMIA + b (Størset 2014, Eq. 1)
  };

  /* Janmahasatian 2005: fat-free mass from weight (kg), height (cm), sex. */
  function ffmOf(wt, ht, male) {
    var bmi = wt / ((ht / 100) * (ht / 100));
    return male ? 9270 * wt / (6680 + 216 * bmi) : 9270 * wt / (8780 + 244 * bmi);
  }

  function num(v) { var x = typeof v === 'number' ? v : parseFloat(v); return isFinite(x) ? x : NaN; }

  /* Normalize the raw covariates (strings from the page, numbers from tests). Idempotent. */
  function normExtra(extra, wt) {
    extra = extra || {};
    if (extra._norm) return extra;
    var sex = (extra.sex === 'f' || extra.sex === 'female') ? 'f' : ((extra.sex === 'm' || extra.sex === 'male') ? 'm' : null);
    var ht = num(extra.ht), w = wt > 0 ? wt : num(extra.wt);
    if (!sex || !(ht > 0) || !(w > 0)) {
      throw new Error('Tacrolimus: sex, weight and height are required, because they give the fat-free mass the model scales to.');
    }
    var pred = num(extra.pred);
    if (!(pred >= 0)) throw new Error('Tacrolimus: enter the prednisolone dose in mg/day (0 if none).');
    var hct = num(extra.hct);
    if (isFinite(hct) && hct > 1 && hct <= 100) {
      throw new Error('Haematocrit is entered in L/L (for example 0.33), not as a percentage.');
    }
    if (isFinite(hct) && (hct < 0.10 || hct > 0.65)) throw new Error('Haematocrit must be between 0.10 and 0.65 L/L.');
    return {
      _norm: true, sex: sex, ht: ht, wt: w, ffm: ffmOf(w, ht, sex === 'm'),
      expr: extra.cyp3a5 === 'expresser',
      cyp3a5: extra.cyp3a5 === 'expresser' ? 'expresser' : (extra.cyp3a5 === 'nonexpresser' ? 'nonexpresser' : 'unknown'),
      pred: pred, hct: hct,
      assay: ASSAY[extra.assay] ? extra.assay : null,
      nOcc: 0, occDays: []
    };
  }

  /* η layout: CL, V1, Q, then per sampled day j a κ on F and a κ on ka.
   * Tried and reverted: giving κka only to days with a sample within 4 h after a dose (a 12-h trough looks
   * insensitive to ka). It made the five-day-trough fits converge but narrowed every interval by ~5 % and
   * lowered coverage 2–5 points in all nine calibration cells (trough coverage 79–82 % in the five-day
   * designs, against 87–93 %): for slow absorbers a 12-h trough still senses the tail of absorption, and
   * κka has a 120 % CV. Convergence is bought with iterations instead (spec.mcmcIters). */
  function etaNames(ex) {
    var out = ['CL', 'V1', 'Q'];
    for (var j = 0; j < ((ex && ex.nOcc) || 0); j++) out.push('KF' + j, 'KKA' + j);
    return out;
  }

  /* Ω: a correlated 3×3 block for (CL, V1, Q) plus a diagonal for the κ's. */
  function omega(ex) {
    var names = etaNames(ex), n = names.length, i, j;
    var vCL = C.CV_CL * C.CV_CL, vV1 = C.CV_V1 * C.CV_V1, vQ = C.CV_Q * C.CV_Q;
    var cov = [];
    for (i = 0; i < n; i++) { cov.push(new Array(n).fill(0)); }
    cov[0][0] = vCL; cov[1][1] = vV1; cov[2][2] = vQ;
    cov[0][1] = cov[1][0] = C.CORR_CL_V1 * C.CV_CL * C.CV_V1;
    cov[0][2] = cov[2][0] = C.CORR_CL_Q * C.CV_CL * C.CV_Q;
    cov[1][2] = cov[2][1] = C.CORR_V1_Q * C.CV_V1 * C.CV_Q;
    for (i = 3; i < n; i++) cov[i][i] = (names[i].indexOf('KF') === 0) ? C.CV_KF * C.CV_KF : C.CV_KKA * C.CV_KKA;
    var vars = [];
    for (j = 0; j < n; j++) vars.push(cov[j][j]);
    return { vars: vars, cov: cov };
  }

  function predEffect(pred) { return 1 - C.PRED_EMAX * pred / (C.PRED_50 + pred); }

  /* Whole blood from plasma at haematocrit hct (Equation 3). */
  function toObs(cp, hct) { return cp * (1 + hct * C.BMAX / (cp + C.KD)); }

  var NAMES_CACHE = [];   // the η name list depends only on the number of sampled days
  function namesFor(nOcc) { return NAMES_CACHE[nOcc] || (NAMES_CACHE[nOcc] = etaNames({ nOcc: nOcc })); }

  /* Called once per likelihood evaluation (hundreds of thousands of times per fit), so it works on the η vector by position
   * (CL, V1, Q, then κF_j at 3 + 2j and κka_j at 4 + 2j: the layout etaNames() declares) instead of building a name lookup. */
  function indivParams(wt, age, renal, extra, eta, id, form, mixIdx) {
    var ex = normExtra(extra, wt);
    var n = ex.nOcc, names = namesFor(n), m = names.length, i;
    eta = eta || [];
    var e = new Array(m);
    for (i = 0; i < m; i++) e[i] = eta[i] || 0;
    var w = ex.ffm / C.FFM_STD;
    var cl = C.CL * Math.pow(w, 0.75) * (ex.expr ? C.CYP_CL : 1) * Math.exp(e[0]);
    var v1 = C.V1 * w * Math.exp(e[1]);
    var q = C.Q * Math.pow(w, 0.75) * Math.exp(e[2]);
    var v2 = C.V2 * w;
    var kF = new Array(n), kKa = new Array(n);
    for (i = 0; i < n; i++) { kF[i] = e[3 + 2 * i]; kKa[i] = e[4 + 2 * i]; }
    return {
      wt: ex.wt, age: null, renal: null, extra: ex,
      eta: e, etaNames: names,
      cl: cl, v1: v1, v2: v2, q: q, k12: q / v1, k21: q / v2,
      ka: C.KA, form: null, mixIdx: 0,
      lagKind: 'fixed', lagFixed: C.TLAG, lagMorning: 0, lagEvening: 0, lagWin: null,
      fSc: 1, fBase: ex.expr ? C.CYP_F : 1, kF: kF, kKa: kKa,
      vmax: 0, km: 1, drugId: 'tac'
    };
  }

  /* Closed-form, per-dose F and ka (superposition stays exact: every dose is an
   * independent linear response). doses: [{t, amt (µg), pred?, occIdx?, delta?}].
   * A `delta` dose contributes only its deviation from κ = 0 (steady-state mode,
   * where the endless train at κ = 0 already contains it).
   * opts.ss = { amt, every, tEnd, pred }: endless train, last dose at tEnd, κ = 0. */
  function simulate(doses, outTimes, p, opts) {
    opts = opts || {};
    var kas = [], mods = [];   // one closed-form model per distinct absorption rate (few: one per sampled day)
    function mdl(ka) {
      for (var q = 0; q < kas.length; q++) if (kas[q] === ka) return mods[q];
      var m = M._cfModelRaw(p.cl, p.v1, p.k12, p.k21, ka);
      kas.push(ka); mods.push(m);
      return m;
    }
    var base = mdl(p.ka);
    if (!base) return { c: outTimes.map(function () { return 0; }), failed: true, method: 'closed' };
    var terms = [], i, d, occ, pe, fb, kf, ka;
    for (i = 0; i < doses.length; i++) {
      d = doses[i];
      if (!(d.amt > 0)) continue;
      occ = d.occIdx != null ? d.occIdx : -1;
      kf = occ >= 0 ? Math.exp(p.kF[occ] || 0) : 1;
      ka = p.ka * (occ >= 0 ? Math.exp(p.kKa[occ] || 0) : 1);
      pe = predEffect(d.pred != null ? d.pred : p.extra.pred);
      fb = d.amt * p.fBase * pe;
      var m = mdl(ka);
      if (!m) return { c: outTimes.map(function () { return 0; }), failed: true, method: 'closed' };
      terms.push({ ts: d.t + p.lagFixed, a: fb * kf, m: m });
      if (d.delta) terms.push({ ts: d.t + p.lagFixed, a: -fb, m: base });
    }
    var ss = opts.ss || null, T = 0, ssA = 0, ssTs = 0, den = null;
    if (ss) {
      T = ss.every;
      ssA = ss.amt * p.fBase * predEffect(ss.pred != null ? ss.pred : p.extra.pred);
      ssTs = ss.tEnd + p.lagFixed;
      den = [-Math.expm1(-base.R[0] * T), -Math.expm1(-base.R[1] * T), -Math.expm1(-base.R[2] * T)];
    }
    var res = new Array(outTimes.length), j, k, tt, sum, dt, R, W;
    for (j = 0; j < outTimes.length; j++) {
      tt = outTimes[j]; sum = 0;
      for (k = 0; k < terms.length; k++) {
        dt = tt - terms[k].ts;
        if (dt > 0) {
          R = terms[k].m.R; W = terms[k].m.W;
          sum += terms[k].a * (W[0] * Math.exp(-R[0] * dt) + W[1] * Math.exp(-R[1] * dt) + W[2] * Math.exp(-R[2] * dt));
        }
      }
      if (ss) {
        dt = tt - ssTs;
        if (!(dt > 0)) dt += T * (Math.floor(-dt / T) + 1);
        R = base.R; W = base.W;
        sum += ssA * (W[0] * Math.exp(-R[0] * dt) / den[0] + W[1] * Math.exp(-R[1] * dt) / den[1] + W[2] * Math.exp(-R[2] * dt) / den[2]);
      }
      res[j] = sum;
    }
    return { c: res, failed: false, method: 'closed' };
  }

  /* ---- ingestion: occasions, assay, haematocrit ---------------------------
   * An occasion is a calendar day. A dose belongs to the day it is given on; a
   * sample belongs to the day of the most recent dose BEFORE it (a pre-dose
   * trough is the tail of the previous dose). Each sampled occasion gets its own
   * κ on F and on ka; the C.MAX_OCC most recent ones. Everything else: κ = 0. */
  function prepare(inp) {
    var ex0 = normExtra(inp.extra, inp.wt);
    var doses = (inp.doses || []).map(function (d) {
      return { t: d.t, amt: d.amt, route: d.route, pred: d.pred != null ? d.pred : ex0.pred };
    });
    doses.sort(function (a, b) { return a.t - b.t; });
    var obsIn = inp.obs || [];
    if (obsIn.length && !ex0.assay) throw new Error('Choose the assay the concentrations were measured with (LC-MS/MS or Abbott CMIA).');
    var am = ASSAY[ex0.assay || 'lcms'];
    var days = {}, obs = [];
    obsIn.forEach(function (o) {
      var hct = isFinite(o.hct) ? o.hct : ex0.hct;
      if (isFinite(hct) && hct > 1 && hct <= 100) throw new Error('Haematocrit is entered in L/L (for example 0.33), not as a percentage.');
      if (!(hct >= 0.10 && hct <= 0.65)) throw new Error('Every sample needs a haematocrit between 0.10 and 0.65 L/L.');
      var day = null;
      for (var i = doses.length - 1; i >= 0; i--) { if (doses[i].t < o.t) { day = Math.floor(doses[i].t / 24); break; } }
      if (day != null) days[day] = (days[day] || 0) + 1;
      obs.push({ t: o.t, c: am.m * o.c + am.b, cDisp: o.c, hct: hct });
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
    // the haematocrit the reported (actual) value refers to: the latest sample's, else the patient field
    var hctReport = obs.length ? obs[obs.length - 1].hct : (isFinite(ex0.hct) ? ex0.hct : 0.33);
    return { extra: ex, doses: doses, obs: obs, assay: ex0.assay || 'lcms', hctReport: hctReport };
  }

  /* The reported quantities live in the κ-free layout: steady state on the typical day. */
  function reportExtra(ex) { return Object.assign({}, normExtra(ex), { nOcc: 0, occDays: [] }); }

  /* Steady-state exposure per draw: whole-blood AUC over the interval and the
   * trough, at the patient's haematocrit and at the reference one (model scale).
   * ctx = { wt, extra, ss:{amt,every,tEnd,pred}, grid, hctAct, hctRef }. */
  function exposure(draws, ctx) {
    var ex0 = reportExtra(ctx.extra), n = draws.length, grid = ctx.grid, ng = grid.length;
    var aucA = new Array(n), trA = new Array(n), aucR = new Array(n), trR = new Array(n);
    for (var d = 0; d < n; d++) {
      var p = indivParams(ctx.wt, null, null, ex0, draws[d].slice(0, 3), 'tac', null, 0);
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

  /* model (LC-MS/MS) scale → the assay scale the user works in */
  function fromModel(v, assay) { var a = ASSAY[assay || 'lcms']; return (v - a.b) / a.m; }
  function fromModelAuc(v, tau, assay) { var a = ASSAY[assay || 'lcms']; return (v - a.b * tau) / a.m; }
  function toModel(v, assay) { var a = ASSAY[assay || 'lcms']; return a.m * v + a.b; }

  /* AUC ranges derived from trough ranges: Saint-Marcoux 2013, Table 2 (regression of Bayesian-estimated AUC on C0 in 2030 profiles of 1000 adult kidney
   * recipients on twice-daily tacrolimus), per time after transplantation. The consensus (Brunet 2019, p. 271) quotes the combination of the three periods
   * (lowest lower bound, highest upper bound), which is computed here and not typed. null = the paper has no range for that cell. */
  var MATCHED = [
    { c0: [3, 7],   early: [75, 140],  mid: [80, 140],  late: [75, 130] },
    { c0: [5, 10],  early: [110, 190], mid: [110, 180], late: [100, 170] },
    { c0: [8, 12],  early: null,       mid: [150, 210], late: [140, 200] },
    { c0: [10, 15], early: [190, 270], mid: [180, 250], late: null }
  ];
  var MATCHED_COLS = { early: '0–3 months', mid: '3–12 months', late: 'after 12 months', all: 'all periods' };
  function matchedSets() {
    var out = [];
    MATCHED.forEach(function (r, ri) {
      var parts = [r.early, r.mid, r.late].filter(Boolean);
      var all = [Math.min.apply(null, parts.map(function (a) { return a[0]; })), Math.max.apply(null, parts.map(function (a) { return a[1]; }))];
      [['all', all], ['early', r.early], ['mid', r.mid], ['late', r.late]].forEach(function (cell) {
        if (!cell[1]) return;
        out.push({ id: 'c0-' + r.c0[0] + '-' + r.c0[1] + (cell[0] === 'all' ? '' : '-' + cell[0]),
          label: 'Trough ' + r.c0[0] + '–' + r.c0[1] + ', AUC for ' + MATCHED_COLS[cell[0]], trough: r.c0.slice(), auc: cell[1].slice(), grade: 'Derived',
          basis: cell[0] === 'all' ? 'The combination of the three periods, as quoted by the consensus.' : 'Regression of AUC on trough, ' + MATCHED_COLS[cell[0]] + ' after transplantation.',
          matched: { row: ri, col: cell[0] } });
      });
    });
    return out;
  }

  var SPEC = {
    id: 'tac',
    label: 'Tacrolimus',
    article: 'Størset E, Holford N, Hennig S, Bergmann TK, Bergan S, Bremer S, Åsberg A, Midtvedt K, Staatz CE. Improved prediction of tacrolimus concentrations early after kidney transplantation using theory-based pharmacokinetic modelling. Br J Clin Pharmacol 2014;78(3):509–523.',
    backgroundLabel: 'Tacrolimus background',
    card: { name: 'Tacrolimus (adult kidney)', sub: 'AUC and trough · Størset 2014' },
    info: 'Two-compartment model with first-order absorption and lag time for immediate-release tacrolimus (twice daily) in adult kidney transplant recipients (242 patients, 3100 whole-blood concentrations, mostly the first three months). Disposition is modelled on plasma concentrations and scaled to fat-free mass; whole-blood concentrations follow from the haematocrit. CYP3A5 genotype and prednisolone dose are covariates. Reported: steady-state AUC0–12h and trough, as measured (actual) and corrected to haematocrit 0.35.',
    pending: false,
    // the one-page report (src/report.js)
    report: {
      lead: 'auc',
      modelCite: 'Størset E, Holford N, Hennig S, et al. Improved prediction of tacrolimus concentrations early after kidney transplantation using theory-based pharmacokinetic modelling. Br J Clin Pharmacol 2014;78(3):509–523.',
      scope: 'Størset 2014 · adult kidney transplant, immediate-release twice-daily · research use only',
      windowSource: 'Brunet M, van Gelder T, Åsberg A, et al. Therapeutic drug monitoring of tacrolimus-personalized therapy: second consensus report. Ther Drug Monit 2019;41(3):261–307.',
      noWindow: {},
      reading: ['Corrected: the same plasma concentration read at haematocrit @H.',
        'One sampling day fixes the AUC no better than about ×/÷ 1.4. The first weeks read high.',
        'Not in the model: renal and liver function, age, interactions, food, adherence. Unknown CYP3A5 is taken as non-expresser.']
    },
    // presentation flags read by ui.js (texts are in ECU.drugTexts.tac)
    ui: { noun: 'tacrolimus', weight: true, predDose: true, occasions: true, badge: 'Størset 2014 · tacrolimus', chartTitle: 'Tacrolimus whole-blood concentration–time forecast', shrinkEta: 'CL', modelLine: 'Størset 2014 (adult kidney transplant, immediate-release tacrolimus)' },
    units: { conc: 'µg/L', auc: 'µg·h/L', dose: 'mg', concAlt: 'ng/mL' },   // same numbers; shown as a hint
    windowOptional: true,

    THETA: { CL: C.CL, Q: C.Q, V1: C.V1, V2: C.V2 },
    EXPO: { CLQ: 0.75, V: 1 },
    WT_REF: 70,
    requiresWt: true,
    ETA: { shared: ['CL', 'V1', 'Q'], iiv: { CL: C.CV_CL * C.CV_CL, V1: C.CV_V1 * C.CV_V1, Q: C.CV_Q * C.CV_Q } },
    FORMS: null,
    formDefault: null,
    SIGMA: { ADD: 0, PROP: C.PROP },
    KA_D: C.KA,
    BIOAVAIL_SC: 1,
    INFUSION_D: 0.5,
    adminRoutes: ['oral'],

    covariates: [
      { id: 'wt', name: 'Weight', type: 'number', required: true, units: 'kg', min: 30, max: 250, step: 'any',
        help: 'Body weight in kg. With sex and height it gives the fat-free mass that clearance and volumes are scaled to.' },
      { id: 'sex', name: 'Sex', type: 'select', required: true,
        options: [{ value: '', label: 'choose…' }, { value: 'm', label: 'male' }, { value: 'f', label: 'female' }],
        help: 'Used only to compute fat-free mass (Janmahasatian 2005).' },
      { id: 'ht', name: 'Height', type: 'number', required: true, units: 'cm', min: 120, max: 220, step: 'any',
        help: 'Height in cm, used to compute fat-free mass.' },
      { id: 'cyp3a5', name: 'CYP3A5 genotype', type: 'select', required: false,
        options: [{ value: 'unknown', label: 'unknown (non-expresser)' },
                  { value: 'nonexpresser', label: 'non-expresser (*3/*3)' },
                  { value: 'expresser', label: 'expresser (*1/*1 or *1/*3)' }],
        default: 'unknown',
        help: 'Expressers have 30 % higher clearance and 18 % lower bioavailability in this model. If the genotype is unknown the app assumes a non-expresser (about 85–95 % of people of European ancestry); the proportion is much higher in other ancestries.' },
      { id: 'pred', name: 'Prednisolone', type: 'number', required: true, units: 'mg/day', min: 0, max: 100, step: 'any',
        help: 'Oral prednisolone-equivalent dose per day (prednisone mg for mg). Corticosteroids lower tacrolimus bioavailability in this model (Emax 67 %, half-maximal at 35 mg/day). Enter 0 if none. A dose that differs for a particular administration can be entered with that dose.' },
      { id: 'hct', name: 'Haematocrit', type: 'number', required: true, units: 'L/L', min: 0.1, max: 0.65, step: 'any',
        help: 'Haematocrit as a fraction (0.33, not 33 %). Tacrolimus is bound to red cells, so whole-blood concentrations rise with haematocrit at an unchanged unbound concentration. Used for the forecast without samples and as the default for sample rows; each sample can carry its own value.' },
      { id: 'assay', name: 'Assay', type: 'select', required: true,
        options: [{ value: '', label: 'choose…' }, { value: 'lcms', label: 'LC-MS/MS' }, { value: 'cmia', label: 'Abbott CMIA (Architect)' }],
        help: 'The assay the concentrations were measured with. LC-MS/MS is what the model was built on; Abbott CMIA values are converted with the model authors’ own equation (LC-MS/MS = 0.80 × CMIA + 0.19 µg/L, one laboratory, 43 sample pairs, 3.6–14.4 µg/L CMIA). Other immunoassays have no conversion and cannot be used.' }
    ],
    covariateWeight: true, covariateAge: false, covariateRenal: false, covariateExtra: false,

    dose: { min: 0.1, max: 30, step: 'any', default: 3 },
    wtMin: 30, wtMax: 250,
    ssIntervalDefault: 12,
    intervalRange: { min: 10, max: 14, text: 'twice-daily immediate-release tacrolimus (about 12 h between doses)' },
    ssNDoses: 30,
    obsValMin: 0.1, obsValMax: 100,
    windowRange: { min: 0.1, max: 5000 },
    // The engine applies no window of its own: a cleared window means intervals without probabilities. The windows below are what the
    // page offers (and, for windowStandard, fills in when tacrolimus is chosen). Source: Brunet 2019 (IATDMCT second consensus), adult
    // kidney, twice-daily immediate-release: C0 targets p. 263 and 270-271; AUC minimum and the C0-matched AUC ranges p. 270-271.
    windowDefaultLo: null, windowDefaultHi: null,
    troughDefaultLo: null, troughDefaultHi: null,
    windowStandard: 'kidney-standard',
    windowSets: [
      { id: 'kidney-standard', label: 'Adult kidney, standard immunological risk', trough: [4, 12], auc: [150, 210], grade: 'Trough A, I; AUC lower bound B, II',
        basis: 'Tacrolimus with mycophenolate and steroids after IL-2R blocker induction; the report prefers troughs above 7. AUC 150 is the report’s minimal threshold; 210 is the app’s choice, the upper end of the AUC range the report pairs with a trough of 8–12.' },
      { id: 'kidney-evero-early', label: 'Kidney, with everolimus, months 0–2', trough: [4, 7], auc: null, grade: 'B, II',
        basis: 'Reduced-exposure tacrolimus plus everolimus. The report gives no AUC range for this combination.' },
      { id: 'kidney-evero-late', label: 'Kidney, with everolimus, after month 2', trough: [2, 4], auc: null, grade: 'B, II',
        basis: 'As above, later period. No AUC range in the report.' }
    ].concat(matchedSets()),
    windowHint: 'The windows start at the standard for adult kidney recipients. Change or clear them to suit your patient or protocol; the Tacrolimus background dialog lists the consensus sets. µg/L is the same as ng/mL, and µg·h/L the same as ng·h/mL.',
    samplePeak: 'A predose trough plus one sample 1–3 h after the dose tells the model far more about the AUC than troughs alone. Enter the exact times and a haematocrit with each sample.',
    perChainSeeds: true,   // chains are independent tasks with their own seeds (they can run in parallel; see bayes.js chainSeed)
    mcmcScale: function (dim) { return Math.min(1, 2.38 / Math.sqrt(dim)); },
    // iterations by dimension: 800 000 reach R̂ < 1.01 in all fits of up to 7 etas; with 13 (five sampled days) 800 000 just
    // missed in 16 % of fits; with 27 (twelve sampled days) 1 600 000 gave R̂ 1.016 / ESS 285 and 3 200 000 gave R̂ 1.003 / ESS 693
    // with the same answer (AUC median 97.0 vs 97.5). A lower cap on sampled days (8) did not converge at 1 600 000 either.
    mcmcIters: function (dim) { return dim <= 7 ? 800000 : (dim <= 15 ? 1600000 : 3200000); },
    yMaxCap: null,
    assay: 'LC-MS/MS equivalents; Abbott CMIA converted (Størset 2014 Eq. 1)',
    assumptions: [
      'Adult kidney-transplant recipients, immediate-release tacrolimus twice daily (Prograf). Prolonged-release products, children and other organs are not covered. The model was built on Norwegian and Australian cohorts, 23–71 years, haematocrit about 0.25–0.43, prednisolone 5–36 mg/day',
      'Intended for use some days after transplantation. The model’s first-day bioavailability effect (×2.68) is left out, so a result computed in the first week or two is biased upward. For a typical patient the real trough is about 20–50 % higher than the model expects on day 4, about 5–15 % on day 7, and 1 % or less after two weeks',
      'Reported values are steady state on a typical day (occasion effects at zero), at the haematocrit of the most recent sample. A single day varies around them by about 23 % (between-occasion variability of bioavailability). One sampling day cannot fix the steady-state AUC more tightly than about ×/÷ 1.4 (5–95 %); two days give ×/÷ 1.3',
      'Corrected to haematocrit 0.35 means the whole-blood concentration this patient would show with the same plasma concentration at a haematocrit of 0.35, computed with the model’s red-cell binding equation',
      'CYP3A5 genotype unknown is treated as a non-expresser (no mixture). Expression changes clearance by +30 % and bioavailability by −18 %',
      'Variability from the paper’s Table 2 (CVs, read as ω = CV; correlations CL–V1 0.43 and CL–Q 0.62). The V1–Q correlation is not published and is taken as the product of the other two (0.27)',
      'Occasion = calendar day. Each sampled day (up to the 12 most recent) gets its own effect on bioavailability and on the absorption rate; days without a sample are taken at zero',
      'Assay: LC-MS/MS, or Abbott CMIA via the model authors’ conversion (one laboratory, 43 pairs); other immunoassays cannot be used. The immunoassay line is valid for 3.6–14.4 µg/L',
      'Not in the model: renal and liver function, age (bioavailability rises 1.4 %/year above 45 in the data but the effect was left out as empirical), CYP3A inhibitors and inducers, food, adherence. The AUC was never evaluated externally in the source study (its external evaluation used troughs in the first three weeks)',
      'Estimated with NONMEM FOCE-I'
    ],
    custom: null   // filled below
  };

  SPEC.custom = {
    constants: C, assays: ASSAY,
    etaNames: etaNames, omega: omega,
    indivParams: indivParams, simulate: simulate,
    prepare: prepare, exposure: exposure, reportExtra: reportExtra, normExtra: normExtra,
    toObs: toObs, predEffect: predEffect, ffmOf: ffmOf,
    fromModel: fromModel, fromModelAuc: fromModelAuc, toModel: toModel,
    doseToEngine: function (mg) { return mg * 1000; }
  };

  M.drugs.tac = SPEC;
})(typeof window !== 'undefined' ? window : globalThis);
