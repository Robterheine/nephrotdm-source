/* =========================================================================
 * NONMEM cross-check, part C — the app's REPORTED outcomes against NONMEM's Bayesian posterior.
 *
 * NONMEM: $EST METHOD=BAYES BIONLY=1 BAYES_PHI_STORE=1 (population parameters frozen, individual
 * etas sampled; every iteration's etas and mixture subgroup written to root.iph). Each retained sample's
 * AUC0-12 and Ctrough are computed with the app's model code — legitimate because part A showed that code
 * reproduces NONMEM's predictions to 5e-9 — and summarised per patient.
 * The app: the shipped runFit at its default budget (posterior median, 5-95 %, P(window)).
 *
 * Primary criterion (fixed before looking at the results): share of patients whose posterior-median
 * AUC12 and Ctrough agree within ±5 % (app vs NONMEM).
 *
 *   node tools/nonmem_verify/compare_bayes.mjs <workdir>      (MMF; expects <workdir>/bayes/bayes_mmf.iph)
 *
 * EC-MPS is NOT handled here: NONMEM's BAYES with $MIX writes four rows per subject-iteration (SUBPOP 0..3,
 * PMIX) that are not plain posterior samples, and its mean PMIX is not the marginal subgroup probability
 * (it differed from the exact importance-sampling value by a median of 23 pp). Use run_bayes_ec.sh and
 * compare_bayes_ec.mjs, which run each subgroup separately.
 * ========================================================================= */
import { readFileSync, createReadStream } from 'fs';
import { createInterface } from 'readline';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
for (const f of ['version', 'model', 'bayes']) require(resolve(here, `../../src/${f}.js`));
const M = globalThis.ECU.model, B = globalThis.ECU.bayes;

const work = process.argv[2] || 'work';
const FORMS = ['mmf'];
const meta = JSON.parse(readFileSync(`${work}/post_app.json`, 'utf8'));
const TEND = meta.tEnd, WLO = 30, WHI = 60;
const q = (a, p) => { const s = a.slice().sort((x, y) => x - y); const pos = (s.length - 1) * p, lo = Math.floor(pos), hi = Math.ceil(pos); return s[lo] + (s[hi] - s[lo]) * (pos - lo); };

async function nonmemSamples(file, form) {
  const nEta = M.etaNamesFor('mpa', form).length;
  const out = new Map();                                    // ID -> {auc:[], tr:[], sub:[]}
  const rl = createInterface({ input: createReadStream(file), crlfDelay: Infinity });
  let header = null, col = null, kept = 0;
  const amt = form === 'mmf' ? 739 : 674, ss = { amt, every: 12, tEnd: TEND };
  for await (const line of rl) {
    if (line.startsWith('TABLE')) { header = null; continue; }
    const f = line.trim().split(/\s+/);
    if (!header) { header = f; col = {}; f.forEach((h, i) => col[h] = i); continue; }
    const it = +f[col.ITERATION];
    if (it <= 0) continue;                                  // burn-in iterations are negative / zero
    const id = +f[col.ID], sub = +f[col.SUBPOP];
    const eta = []; for (let k = 1; k <= nEta; k++) eta.push(+f[col[`ETA(${k})`]]);
    const mix = form === 'ecmps' ? sub - 1 : 0;
    const p = M.indivParams(70, null, null, null, eta, 'mpa', form, mix);
    const r = M.simulate([], [TEND + 12], p, { id: 'mpa', ss, aucWindow: [TEND, TEND + 12] });
    if (!out.has(id)) out.set(id, { auc: [], tr: [], sub: [] });
    const o = out.get(id); o.auc.push(r.auc); o.tr.push(r.c[0]); o.sub.push(sub); kept++;
  }
  return { out, kept };
}

const files = { mmf: `${work}/bayes/bayes_mmf.iph` };
const rows = [];
for (const form of FORMS) {
  const { out, kept } = await nonmemSamples(files[form], form);
  console.log(`${form}: ${kept} NONMEM posterior samples read (${(kept / out.size).toFixed(0)} per subject)`);
  const doses = M.ssHistory({ amt: form === 'mmf' ? 739 : 674, intervalHours: 12, tEnd: TEND, n: 30, route: 'oral' });
  for (const s of meta.subjects[form]) {
    const nm = out.get(s.id);
    const conv = B.convergenceOf([nm.auc.map(Math.log)]);
    const fit = await B.runFit({ drug: 'mpa', wt: 70, form, doses, steadyState: true, obs: s.obs.map(o => ({ t: TEND + o.tau, c: o.c })), intervalHours: 12, winLo: WLO, winHi: WHI, seed: 20250907 }, { progress: () => {} });
    const inWin = nm.auc.filter(a => a > WLO && a < WHI).length / nm.auc.length;
    rows.push({
      design: s.design, id: s.id,
      nm: { auc: q(nm.auc, .5), aucLo: q(nm.auc, .05), aucHi: q(nm.auc, .95), tr: q(nm.tr, .5), trLo: q(nm.tr, .05), trHi: q(nm.tr, .95), pIn: inWin, ess: conv.ess, rhat: conv.rhat,
        mix: form === 'ecmps' ? [1, 2, 3].map(k => nm.sub.filter(x => x === k).length / nm.sub.length) : null },
      app: { auc: fit.auc.median, aucLo: fit.auc.p5, aucHi: fit.auc.p95, tr: fit.trough.median, trLo: fit.trough.p5, trHi: fit.trough.p95, pIn: fit.auc.pInWindow, mix: fit.mixPost, ok: fit.convergence && fit.convergence.ok }
    });
  }
}

const rel = (a, b) => (a - b) / b;
const designs = ['mmf-lss', 'mmf-trough', 'ec-lss', 'ec-trough'].filter(d => rows.some(r => r.design === d));
console.log('\nrelative difference app vs NONMEM-BAYES (posterior medians); "within 5 %" = share of patients');
console.log('design       | AUC12: within 5 %  median|Δ|  p90   max     | Ctrough: within 5 %  median|Δ|  p90   max');
const P = x => (100 * x).toFixed(1).padStart(5) + '%';
for (const d of designs) {
  const R = rows.filter(r => r.design === d), n = R.length;
  const a = R.map(r => Math.abs(rel(r.app.auc, r.nm.auc))), t = R.map(r => Math.abs(rel(r.app.tr, r.nm.tr)));
  console.log(`${d.padEnd(12)} |   ${String(a.filter(x => x <= .05).length).padStart(2)}/${n}          ${P(q(a, .5))} ${P(q(a, .9))} ${P(Math.max(...a))}   |   ${String(t.filter(x => x <= .05).length).padStart(2)}/${n}            ${P(q(t, .5))} ${P(q(t, .9))} ${P(Math.max(...t))}`);
}
console.log('\nsecondary: interval ends (5th / 95th percentile of AUC12) and P(within 30-60), app vs NONMEM');
for (const d of designs) {
  const R = rows.filter(r => r.design === d), n = R.length;
  const lo = R.map(r => Math.abs(rel(r.app.aucLo, r.nm.aucLo))), hi = R.map(r => Math.abs(rel(r.app.aucHi, r.nm.aucHi))), pp = R.map(r => Math.abs(r.app.pIn - r.nm.pIn) * 100);
  const trlo = R.map(r => Math.abs(rel(r.app.trLo, r.nm.trLo))), trhi = R.map(r => Math.abs(rel(r.app.trHi, r.nm.trHi)));
  console.log(`${d.padEnd(12)} AUC p5 within 5 %: ${lo.filter(x => x <= .05).length}/${n}   AUC p95 within 5 %: ${hi.filter(x => x <= .05).length}/${n}   P(window) |Δ| median ${q(pp, .5).toFixed(1)} pp, p90 ${q(pp, .9).toFixed(1)} pp, max ${Math.max(...pp).toFixed(1)} pp   Ctrough p5/p95 within 5 %: ${trlo.filter(x => x <= .05).length}/${n} , ${trhi.filter(x => x <= .05).length}/${n}`);
}
const ess = rows.map(r => r.nm.ess), rh = rows.map(r => r.nm.rhat);
console.log(`\nNONMEM sampling quality (AUC12 chain, one chain split in two): ESS median ${q(ess, .5).toFixed(0)}, min ${Math.min(...ess).toFixed(0)}; R-hat max ${Math.max(...rh).toFixed(3)}; patients with ESS < 400: ${ess.filter(x => x < 400).length}`);
const ecRows = rows.filter(r => r.nm.mix);
if (ecRows.length) {
const mixAgree = ecRows.filter(r => r.app.mix.indexOf(Math.max(...r.app.mix)) === r.nm.mix.indexOf(Math.max(...r.nm.mix))).length;
const mixDiff = ecRows.map(r => Math.max(...r.app.mix.map((p, k) => Math.abs(p - r.nm.mix[k]))));
console.log(`EC-MPS subgroup probabilities: modal subgroup agrees ${mixAgree}/${ecRows.length}; largest per-patient difference in any subgroup probability: median ${(100 * q(mixDiff, .5)).toFixed(1)} pp, p90 ${(100 * q(mixDiff, .9)).toFixed(1)} pp, max ${(100 * Math.max(...mixDiff)).toFixed(1)} pp`);
}
import('fs').then(fs => fs.writeFileSync(`${work}/bayes_compare.json`, JSON.stringify(rows)));
