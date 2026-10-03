/* =========================================================================
 * MPA TDM — model-ingestion gate (node tools/verify_model.mjs)
 *
 * Verifies that the MPA spec in src/model.js is complete enough to run:
 * THETA, EXPO, ETA, SIGMA, absorption, covariates and the therapeutic window
 * must all be present and internally consistent. While the spec is pending
 * this tool exits with a clear failure — that is the point: it makes
 * "the model file has been integrated" a checkable claim, not a hope.
 *
 * Usage:
 *   node tools/verify_model.mjs            → strict: fails while pending
 *   node tools/verify_model.mjs --pending  → passes only while pending
 * ========================================================================= */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const root = dirname(fileURLToPath(import.meta.url));

require('../src/version.js');
require('../src/model.js');
require('../src/tacrolimus.js');
require('../src/everolimus.js');

const ECU = globalThis.ECU;
const spec = ECU.model.spec('mpa');

const allowPending = process.argv.includes('--pending');
const problems = [];
const notes = [];

if (spec.pending) {
  notes.push('MPA spec is PENDING: model file not yet integrated.');
  if (!allowPending) {
    problems.push('Spec is pending. Run with --pending to accept the pending state, or integrate the model file and complete the spec.');
  }
} else {
  // ---- completeness checks for a completed spec ---------------------------
  const need = (cond, msg) => { if (!cond) problems.push(msg); };

  // de Winter 2008 shape: THETA disposition + FORMS absorption + ETA by name.
  // Legacy stub shape (ETA.vars / KA_D / SIGMA.ADD+PROP) remains accepted.
  const legacy = spec.ETA && Array.isArray(spec.ETA.vars);
  need(spec.THETA && typeof spec.THETA === 'object' &&
    [legacy ? 'CL' : 'CL', 'V1'].every(k => spec.THETA[k] != null && spec.THETA[k] > 0),
    'THETA must declare positive CL and V1 (plus Q/V2 for a 2-compartment model).');
  need(spec.EXPO && typeof spec.EXPO === 'object',
    'EXPO must declare allometric exponents (zeros: the published model is not weight-scaled).');
  if (legacy) {
    need(spec.ETA.vars.every(v => v >= 0), 'ETA.vars must be non-negative.');
  } else {
    need(Array.isArray(spec.ETA.shared) && spec.ETA.shared.length >= 2,
      'ETA.shared must name the shared etas (CL, Q, V1, V2, KA…).');
    need(spec.ETA.iiv && Object.keys(spec.ETA.iiv).length >= spec.ETA.shared.length &&
      Object.keys(spec.ETA.iiv).every(k => spec.ETA.iiv[k] > 0),
      'ETA.iiv must carry a positive ω² for every eta name.');
    need(spec.ETA.forms && Object.keys(spec.ETA.forms).length > 0,
      'ETA.forms must declare the per-formulation eta extension.');
  }
  const hasLogSigma = spec.SIGMA && spec.SIGMA.LOG != null && spec.SIGMA.LOG > 0;
  const hasNatSigma = spec.SIGMA && isFinite(spec.SIGMA.ADD) && spec.SIGMA.ADD >= 0;
  need(hasLogSigma || hasNatSigma,
    'SIGMA must declare a log-scale error (LOG) or a natural-scale ADD/PROP error.');
  if (spec.FORMS) {
    need(spec.formDefault && spec.FORMS[spec.formDefault],
      'formDefault must name a declared formulation.');
    for (const fk of Object.keys(spec.FORMS)) {
      const f = spec.FORMS[fk];
      need(isFinite(f.ka) && f.ka > 0, 'FORMS.' + fk + '.ka must be a positive rate (1/hour).');
      need(isFinite(f.conv) && f.conv > 0 && f.conv <= 1,
        'FORMS.' + fk + '.conv must be a positive fraction (product mg → MPA mg).');
      const t = f.tlag;
      need(t && (t.type === 'fixed' ? isFinite(t.value) && t.value >= 0 :
        (t.type === 'mixed' && Array.isArray(t.morning) && t.morning.length >= 2 &&
          t.morning.every(m => isFinite(m.v) && m.v >= 0 && isFinite(m.p) && m.p > 0) &&
          Math.abs(t.morning.reduce((s, m) => s + m.p, 0) - 1) < 1e-6 &&
          isFinite(t.evening) && t.evening >= 0)),
        'FORMS.' + fk + '.tlag must be a fixed value or a mixture (probabilities summing to 1).');
    }
    // the formulation covariate must be exposed to the interface
    need(Array.isArray(spec.covariates) && spec.covariates.some(c => c.id === 'form' && c.type === 'select'),
      'covariates must expose the formulation select (the model’s covariate).');
  }
  need(Array.isArray(spec.covariates),
    'covariates must be an array (possibly empty) — the covariate UI is model-driven.');
  need(spec.windowDefaultLo != null && spec.windowDefaultHi != null &&
    spec.windowDefaultHi > spec.windowDefaultLo,
    'windowDefaultLo/Hi must define a non-empty therapeutic window.');
  need(spec.windowHint && spec.windowHint.length > 5,
    'windowHint must cite the source of the therapeutic window.');
  need(Array.isArray(spec.assumptions) && spec.assumptions.length > 0,
    'assumptions must list at least one documented assumption/limitation.');
  need(spec.ssNDoses >= 20,
    'ssNDoses must be ≥ 20 for this model’s ~40 h terminal half-life (scrutiny S2).');

  // smoke-test the ODE path with a tiny oral dose in the default formulation
  try {
    const form = spec.formDefault || null;
    const dim = ECU.model.etaDim('mpa', form);
    const zeros = new Array(dim).fill(0);
    const p = ECU.model.indivParams(70, 45, null, null, zeros, 'mpa', form, 0);
    const times = [0, 0.2, 1, 2, 4];
    const sim = ECU.model.simulate([{ t: 0, amt: 1000, route: 'oral' }], times.slice(), p, {});
    const finite = sim && sim.c && sim.c.every(v => isFinite(v) && v >= 0);
    need(finite, 'simulate() must return finite, non-negative concentrations for a small oral dose.');
    if (spec.FORMS && spec.FORMS[form] && spec.FORMS[form].tlag) {
      need(sim.c[1] < 1e-9, 'with a lag-time declared, the 0.2 h sample must precede absorption (min lag 0.30 h).');
    }
  } catch (e) {
    problems.push('simulate() smoke test failed: ' + (e && e.message ? e.message : e));
  }
}

// ---- tacrolimus (a spec with `custom` hooks) ---------------------------------
{
  const tac = ECU.model.spec('tac');
  const need = (cond, msg) => { if (!cond) problems.push('tac: ' + msg); };
  need(tac && !tac.pending, 'spec must exist and not be pending.');
  if (tac) {
    const c = tac.custom;
    need(c && ['etaNames', 'omega', 'indivParams', 'simulate', 'prepare', 'exposure', 'toObs', 'fromModel', 'fromModelAuc', 'toModel', 'doseToEngine']
      .every(k => typeof c[k] === 'function'), 'custom hooks incomplete.');
    need(tac.units && tac.units.conc && tac.units.auc && tac.units.dose, 'units (conc, auc, dose) must be declared.');
    need(['CL', 'Q', 'V1', 'V2'].every(k => tac.THETA[k] > 0), 'THETA CL, Q, V1, V2 must be positive.');
    need(tac.SIGMA && tac.SIGMA.PROP > 0 && !(tac.SIGMA.ADD > 0), 'residual error is proportional (PROP > 0, no ADD).');
    need(Array.isArray(tac.covariates) && ['wt', 'sex', 'ht', 'cyp3a5', 'pred', 'hct', 'assay'].every(id => tac.covariates.some(x => x.id === id)),
      'covariate list must expose weight, sex, height, CYP3A5, prednisolone, haematocrit and assay.');
    need(tac.windowOptional === true && tac.windowDefaultLo == null && tac.troughDefaultLo == null,
      'the engine must apply no window of its own (a cleared window means no probabilities); standard windows live in windowSets.');
    need(Array.isArray(tac.windowSets) && tac.windowSets.some(w => w.id === tac.windowStandard) &&
      tac.windowSets.every(w => w.label && w.basis && w.grade && w.trough && w.trough[0] > 0 && w.trough[1] > w.trough[0] && (!w.auc || (w.auc[0] > 0 && w.auc[1] > w.auc[0]))),
      'windowSets must be well-formed (label, basis, grade, ordered pairs) and windowStandard must name one of them; each set cites its basis (Brunet 2019).');
    need(Array.isArray(tac.assumptions) && tac.assumptions.length > 0, 'assumptions must list the documented limitations.');
    need(tac.article && /Størset/.test(tac.article) && /2014/.test(tac.article), 'article must cite Størset 2014.');
    if (c) {
      try {
        const om = ECU.model.omegaFull('tac', null, { nOcc: 0 });
        need(om.cov && om.cov.length === 3, 'Ω must be a 3×3 correlated block for (CL, V1, Q).');
        const ex = { sex: 'm', ht: 175, pred: 10, hct: 0.33, cyp3a5: 'unknown', assay: 'lcms' };
        const p = ECU.model.indivParams(80, null, null, ex, [0, 0, 0], 'tac');
        const sim = ECU.model.simulate([{ t: 0, amt: 3000, pred: 10 }], [0, 0.2, 1, 2, 4, 12], p, {});
        need(sim.c.every(v => isFinite(v) && v >= 0), 'simulate() must return finite, non-negative concentrations.');
        need(sim.c[1] === 0, 'the 0.2 h sample must precede absorption (lag 0.41 h).');
        need(sim.c[2] > 0 && sim.c[3] > sim.c[1], 'concentrations rise after the lag.');
      } catch (e) { problems.push('tac: smoke test failed: ' + (e && e.message ? e.message : e)); }
    }
  }
}

// ---- everolimus (a spec with `custom` hooks, log-scale error, trough windows only) -----------------
{
  const evr = ECU.model.spec('evr');
  const need = (cond, msg) => { if (!cond) problems.push('evr: ' + msg); };
  need(evr && !evr.pending, 'spec must exist and not be pending.');
  if (evr) {
    const c = evr.custom;
    need(c && ['etaNames', 'omega', 'indivParams', 'simulate', 'prepare', 'exposure', 'toObs', 'fromModel', 'fromModelAuc', 'toModel', 'doseToEngine']
      .every(k => typeof c[k] === 'function'), 'custom hooks incomplete.');
    need(evr.units && evr.units.conc && evr.units.auc && evr.units.dose, 'units (conc, auc, dose) must be declared.');
    need(evr.SIGMA && evr.SIGMA.LOG > 0 && !(evr.SIGMA.PROP > 0) && !(evr.SIGMA.ADD > 0), 'residual error is on the log scale (LOG > 0, no PROP or ADD).');
    need(Array.isArray(evr.covariates) && ['hct', 'predHigh'].every(id => evr.covariates.some(x => x.id === id)) && evr.covariates.every(x => !x.required || ['hct', 'predHigh'].includes(x.id)),
      'covariates are haematocrit and the prednisolone choice, both required, nothing else.');
    need(evr.windowOptional === true && evr.windowDefaultLo == null && evr.troughDefaultLo == null,
      'the engine must apply no window of its own; standard windows live in windowSets.');
    need(Array.isArray(evr.windowSets) && evr.windowSets.some(w => w.id === evr.windowStandard) &&
      evr.windowSets.every(w => w.label && w.basis && w.grade && w.trough && w.trough[0] > 0 && w.trough[1] > w.trough[0] && w.auc == null),
      'windowSets must be well-formed trough sets without an AUC window (the consensus gives none).');
    need(Array.isArray(evr.assumptions) && evr.assumptions.length > 0, 'assumptions must list the documented limitations.');
    need(evr.article && /Zwart/.test(evr.article) && /2021/.test(evr.article), 'article must cite Zwart 2021.');
    if (c) {
      need(c.constants.HCT_REF === 0.38, 'HCT_REF is 0.38.');
      try {
        need(c.etaNames({}).length === 3, 'three etas (CLINT, V3, FU).');
        const ex = { hct: 0.38, predHigh: 'low' };
        const p = ECU.model.indivParams(70, null, null, ex, [0, 0, 0], 'evr');
        const sim = ECU.model.simulate([{ t: 0, amt: 1500 }], [0, 0.2, 1, 2, 4, 12], p, { id: 'evr' });
        need(sim.c.every(v => isFinite(v) && v >= 0), 'simulate() must return finite, non-negative concentrations.');
        need(sim.c[0] === 0 && sim.c[2] > sim.c[1] && sim.c[1] > 0, 'concentrations rise from zero with no lag.');
      } catch (e) { problems.push('evr: smoke test failed: ' + (e && e.message ? e.message : e)); }
    }
  }
}

// ---- report ----------------------------------------------------------------
for (const n of notes) console.log('note: ' + n);
if (problems.length) {
  for (const p of problems) console.error('FAIL: ' + p);
  console.error('verify_model: ' + problems.length + ' problem(s).');
  process.exit(1);
}
console.log('verify_model: OK' + (spec.pending ? ' (pending state accepted via --pending)' : ' (spec complete)'));
