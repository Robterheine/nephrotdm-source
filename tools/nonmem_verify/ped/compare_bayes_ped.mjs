/* =========================================================================
 * NONMEM cross-check of the pediatric models, part C (L3): the app's REPORTED outcomes against NONMEM's Bayesian posterior.
 * NONMEM: $EST METHOD=BAYES BIONLY=1 BAYES_PHI_STORE=1 (population parameters frozen, individual etas sampled, 6000 retained iterations
 * per patient, root.iph). Each retained sample's steady-state AUC0-12 and trough (typical day; actual and, for tacrolimus, corrected) are computed with
 * the app's model code (legitimate: part A shows that code reproduces NONMEM's predictions to 1e-9) and summarised per patient.
 * The app: the shipped runFit at its default budget, 8 chains on a pool of worker threads.
 * Primary criterion, fixed before any result was seen (hand-off L3, the adult criterion of docs/NONMEM_CROSSCHECK.md): the share of patients whose posterior
 * medians of AUC12 and trough agree within +-5 % is at least 95 %.
 *   node tools/nonmem_verify/ped/compare_bayes_ped.mjs <workdir>      (expects <workdir>/bayes_*.iph and posthoc_*_app.json)
 * ========================================================================= */
import { readFileSync, createReadStream } from 'fs';
import { createInterface } from 'readline';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { Worker } from 'worker_threads';
const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url)), src = f => resolve(here, '../../../src/' + f + '.js');
['version', 'model', 'tacped', 'mpaped', 'bayes', 'parallel'].forEach(f => require(src(f)));
const { model: M, bayes: B, parallel: P } = globalThis.ECU;
const work = process.argv[2] || 'work', DRUGS = (process.argv[3] || 'mpaped,tacped').split(',');
const q = (a, p) => { const s = a.slice().sort((x, y) => x - y), pos = (s.length - 1) * p, lo = Math.floor(pos), hi = Math.ceil(pos); return s[lo] + (s[hi] - s[lo]) * (pos - lo); };
const grid12 = []; for (let i = 0; i <= 48; i++) grid12.push(i * 0.25);

// the app's own worker pool, as in tests/test_everolimus.js
const wsrc = P.workerSource(['version', 'model', 'tacped', 'mpaped', 'bayes'].map(f => readFileSync(src(f), 'utf8')));
P.use({ start: () => { const w = new Worker(wsrc, { eval: true }); return { postMessage: m => w.postMessage(m), onMessage: fn => w.on('message', fn), onError: fn => w.on('error', fn), terminate: () => w.terminate() }; } }, { workers: 8 });

async function nonmemSummaries(drug, papp) {
  const T = M.spec(drug).custom, byId = new Map(papp.map(a => [a.id, a])), out = new Map(), ctxOf = new Map();
  papp.forEach(a => {
    const doses = a.doses, last = doses[doses.length - 1];
    const prep = T.prepare({ extra: a.rawEx, wt: a.wt, doses: doses.map(d => Object.assign({}, d)), obs: a.obs, steadyState: false });
    ctxOf.set(a.id, { wt: a.wt, extra: prep.extra, ss: { amt: last.amt, every: 12, tEnd: last.t, form: last.form }, grid: grid12.map(x => x + last.t), hctAct: prep.hctReport, hctRef: T.constants.HCT_REF });
  });
  const rl = createInterface({ input: createReadStream(`${work}/bayes_${drug}.iph`), crlfDelay: Infinity });
  let col = null, header = null, kept = 0;
  for await (const line of rl) {
    if (line.startsWith('TABLE')) { header = null; continue; }
    const f = line.trim().split(/\s+/);
    if (!header) { header = f; col = {}; f.forEach((h, i) => col[h] = i); continue; }
    if (+f[col.ITERATION] <= 0) continue;
    const id = +f[col.ID], eta = [1, 2, 3].map(k => +f[col[`ETA(${k})`]]);      // typical-day exposure: the occasion etas are not part of it
    const e = T.exposure([eta], ctxOf.get(id));
    if (!out.has(id)) out.set(id, { auc: [], tr: [], aucC: [], trC: [] });
    const o = out.get(id); o.auc.push(e.aucA[0]); o.tr.push(e.trA[0]); o.aucC.push(e.aucR[0]); o.trC.push(e.trR[0]); kept++;
  }
  console.log(`${drug}: ${kept} NONMEM posterior samples read (${(kept / out.size).toFixed(0)} per patient)`);
  return out;
}

let allOk = true;
for (const drug of DRUGS) {
  const papp = JSON.parse(readFileSync(`${work}/posthoc_${drug}_app.json`, 'utf8')), nm = await nonmemSummaries(drug, papp), T = M.spec(drug).custom, blood = drug === 'tacped';
  const rows = [], t0 = Date.now();
  for (const a of papp) {
    const fit = await B.runFit({ drug, wt: a.wt, extra: a.rawEx, doses: a.doses, steadyState: false, obs: a.obs, intervalHours: 12, winLo: null, winHi: null, seed: 20250907 }, { progress: () => {} });
    const n = nm.get(a.id);
    rows.push({ id: a.id, nObs: a.obs.length, ok: fit.convergence && fit.convergence.ok,
      auc: [fit.auc.median / q(n.auc, .5) - 1, fit.auc.p5 / q(n.auc, .05) - 1, fit.auc.p95 / q(n.auc, .95) - 1],
      tr: [fit.trough.median / q(n.tr, .5) - 1, fit.trough.p5 / q(n.tr, .05) - 1, fit.trough.p95 / q(n.tr, .95) - 1],
      aucC: blood ? [fit.aucCorr.median / q(n.aucC, .5) - 1] : null, trC: blood ? [fit.troughCorr.median / q(n.trC, .5) - 1] : null,
      nmAuc: q(n.auc, .5), appAuc: fit.auc.median });
  }
  const share = (sel) => rows.filter(r => Math.abs(sel(r)) <= 0.05).length / rows.length, med = (sel) => q(rows.map(r => Math.abs(sel(r))), .5), worst = (sel) => Math.max(...rows.map(r => Math.abs(sel(r))));
  console.log(`\n${drug}: ${rows.length} patients, app fits ${((Date.now() - t0) / 1000).toFixed(0)} s, sampler converged in ${rows.filter(r => r.ok).length}/${rows.length}`);
  const lines = [['AUC12 median', r => r.auc[0]], ['trough median', r => r.tr[0]], ['AUC12 5th pct', r => r.auc[1]], ['AUC12 95th pct', r => r.auc[2]]].concat(blood ? [['corrected AUC12 median', r => r.aucC[0]], ['corrected trough median', r => r.trC[0]]] : []);
  lines.forEach(([name, sel]) => console.log(`   ${name.padEnd(24)} within +-5 %: ${(share(sel) * 100).toFixed(0).padStart(3)} %   median |diff| ${(med(sel) * 100).toFixed(2)} %   worst ${(worst(sel) * 100).toFixed(1)} %`));
  const bad = rows.filter(r => Math.abs(r.auc[0]) > 0.05 || Math.abs(r.tr[0]) > 0.05).sort((x, y) => Math.max(Math.abs(y.auc[0]), Math.abs(y.tr[0])) - Math.max(Math.abs(x.auc[0]), Math.abs(x.tr[0])));
  if (bad.length) console.log('   outside +-5 % (AUC, trough):', bad.slice(0, 6).map(r => `ID ${r.id} (${r.nObs} samples) ${(r.auc[0] * 100).toFixed(1)}/${(r.tr[0] * 100).toFixed(1)} %`).join('; '));
  const ok = share(r => r.auc[0]) >= 0.95 && share(r => r.tr[0]) >= 0.95 && (!blood || (share(r => r.aucC[0]) >= 0.95 && share(r => r.trC[0]) >= 0.95));
  console.log(`   ${ok ? 'OK  ' : 'CHECK'} criterion: at least 95 % of patients within +-5 % for AUC12 and trough medians${blood ? ' (actual and corrected)' : ''}`);
  allOk = allOk && ok;
}
P.use(null);
console.log(allOk ? '\nPEDIATRIC BAYES: app and NONMEM agree.' : '\nPEDIATRIC BAYES: see CHECK lines.');
process.exit(allOk ? 0 : 1);
