/* =========================================================================
 * NONMEM cross-check, part B — POSTHOC (empirical Bayes) estimates.
 *
 * Simulates patients from the de Winter model (truth drawn from the prior, log-normal
 * residual σ = 0.39), writes the NONMEM datasets, and runs the SAME patients through
 * the app's own pipeline (runFit → fit.map = the MAP the app reports). NONMEM is then run
 * with every parameter FIXED (MAXEVAL=0) so it only performs the POSTHOC step; see
 * compare_posthoc.mjs for the comparison.
 *
 * Designs (50 subjects each): mmf-lss (0.33/1/3 h), mmf-trough (12 h),
 *                             ec-lss (1.5/2/4 h),  ec-trough (12 h)
 *
 *   node tools/nonmem_verify/make_posthoc.mjs <workdir> [nPerDesign]
 * ========================================================================= */
import { writeFileSync, mkdirSync } from 'fs';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
for (const f of ['version', 'model', 'bayes']) require(resolve(here, `../../src/${f}.js`));
const M = globalThis.ECU.model, B = globalThis.ECU.bayes;

const work = process.argv[2] || 'work';
const NPER = parseInt(process.argv[3] || '50', 10);
mkdirSync(work, { recursive: true });

function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function gauss(r) { let s, u, v; do { u = r() * 2 - 1; v = r() * 2 - 1; s = u * u + v * v; } while (s === 0 || s >= 1); return u * Math.sqrt(-2 * Math.log(s) / s); }

const SIGMA = 0.39;
const DESIGNS = [
  { name: 'mmf-lss', form: 'mmf', amt: 739, taus: [0.33, 1, 3], seed: 101 },
  { name: 'mmf-trough', form: 'mmf', amt: 739, taus: [12], seed: 102 },
  { name: 'ec-lss', form: 'ecmps', amt: 674, taus: [1.5, 2, 4], seed: 103 },
  { name: 'ec-trough', form: 'ecmps', amt: 674, taus: [12], seed: 104 }
];
const GRID = []; for (let k = 0; k <= 240; k++) GRID.push(+(k * 0.05).toFixed(2));   // 0..12 h after the morning / last dose, 0.05 h

const subjects = { mmf: [], ecmps: [] };
const csv = { mmf: ['ID,TIME,AMT,EVID,MDV,SS,II,CLK,DV'], ecmps: ['ID,TIME,AMT,EVID,MDV,SS,II,CLK,DV'] };
const TEND = 368;   // last dose at 368 h = clock 08:00 (the app's clock)

for (const d of DESIGNS) {
  const r = rng(d.seed);
  const names = M.etaNamesFor('mpa', d.form);
  const om = names.map(n => ({ CL: 0.39, Q: 0.78, V1: 1.0, V2: 4.9, KA: 1.87, TLAG: 0.11, TLAG_MORN: 0.08, TLAG_EVE: 0.40 })[n]);
  const mixPrior = M.mixPriorOf('mpa', d.form);
  for (let i = 0; i < NPER; i++) {
    const id = subjects[d.form].length + 1;
    const eta = om.map(w => gauss(r) * w);
    let mix = 0;
    if (mixPrior) { const u = r(); let acc = 0; for (let k = 0; k < mixPrior.length; k++) { acc += mixPrior[k]; if (u < acc) { mix = k; break; } } }
    const p = M.indivParams(70, null, null, null, eta, 'mpa', d.form, mix);
    const ss = { amt: d.amt, every: 12, tEnd: TEND };
    const truth = M.simulate([], d.taus.map(t => TEND + t), p, { id: 'mpa', ss }).c;
    const obs = d.taus.map((tau, k) => ({ tau, c: Math.max(truth[k] * Math.exp(SIGMA * gauss(r)), 0.01) }));

    // ---- the app: the shipped pipeline, MAP as reported ---------------------------------------
    const doses = M.ssHistory({ amt: d.amt, intervalHours: 12, tEnd: TEND, n: 30, route: 'oral' });
    // (runFit is async; collected below)
    subjects[d.form].push({ id, design: d.name, form: d.form, amt: d.amt, obs, truthEta: eta, truthMix: mix, _doses: doses });

    // ---- NONMEM dataset rows ------------------------------------------------------------------
    const rows = [];
    const off = d.form === 'mmf' ? 0 : 12;
    if (d.form === 'mmf') rows.push({ t: 0, line: [id, 0, d.amt, 1, 1, 1, 12, 8, 0], order: 0 });
    else {
      rows.push({ t: 0, line: [id, 0, d.amt, 1, 1, 1, 24, 20, 0], order: 0 });      // evening dose first (SS=1, II=24)
      rows.push({ t: 12, line: [id, 12, d.amt, 1, 1, 2, 24, 8, 0], order: 0 });      // morning dose (SS=2 superposes)
    }
    obs.forEach(o => rows.push({ t: off + o.tau, line: [id, off + o.tau, 0, 0, 0, 0, 0, 8, Math.log(o.c).toPrecision(12)], order: 1 }));
    GRID.forEach(g => rows.push({ t: off + g, line: [id, off + g, 0, 2, 1, 0, 0, 8, 0], order: 2 }));   // dummy rows: predictions for the AUC
    rows.sort((a, b) => a.t - b.t || a.order - b.order);
    rows.forEach(x => csv[d.form].push(x.line.join(',')));
  }
}

// ---- run the app on every subject ----------------------------------------------------------------
const t0 = Date.now();
for (const form of ['mmf', 'ecmps']) {
  for (const s of subjects[form]) {
    const fit = await B.runFit({
      drug: 'mpa', wt: 70, form, doses: s._doses, steadyState: true,
      obs: s.obs.map(o => ({ t: TEND + o.tau, c: o.c })), intervalHours: 12, winLo: 30, winHi: 60,
      mcmcIters: 300, chains: 1, priorDraws: 400, seed: 7
    }, { progress: () => {} });
    s.app = { eta: fit.map.eta, mix: fit.map.mixIdx, etaNames: fit.map.etaNames, ipred: fit.obsData.map(o => o.ipred) };
    delete s._doses;
  }
  writeFileSync(`${work}/post_${form}.csv`, csv[form].join('\n') + '\n');
}
writeFileSync(`${work}/post_app.json`, JSON.stringify({ tEnd: TEND, sigma: SIGMA, grid: GRID, subjects }));
console.log(`posthoc datasets written to ${work}: mmf ${subjects.mmf.length}, ecmps ${subjects.ecmps.length} subjects (app pipeline ${((Date.now() - t0) / 1000).toFixed(0)} s)`);
