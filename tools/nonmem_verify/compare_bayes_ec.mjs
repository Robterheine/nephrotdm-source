/* =========================================================================
 * NONMEM cross-check, part C for EC-MPS — Bayesian posterior with the morning-lag subgroup handled
 * OUTSIDE $MIX (run_bayes_ec.sh), because NONMEM's BAYES + $MIX output is not a plain list of posterior
 * samples (four rows per subject-iteration: SUBPOP 0..3 with PMIX; see docs/NONMEM_CROSSCHECK.md).
 *
 *   within-subgroup posterior   NONMEM BAYES, subgroup fixed per run        (iph: eta samples)
 *   subgroup probability        NONMEM IMP, EONLY, subgroup fixed per run   (phi: OBJ_m = -2 ln marginal likelihood)
 *                                P(m | data) = p_m exp(-OBJ_m/2) / sum_k p_k exp(-OBJ_k/2)
 *   mixture posterior           the three sample sets pooled with weights P(m | data)
 *
 * compared with the app's reported outcomes (posterior median AUC12 and Ctrough, interval ends, P(window),
 * subgroup probabilities) for the 50 EC-MPS 3-sample subjects.
 *   node tools/nonmem_verify/compare_bayes_ec.mjs <workdir>
 * ========================================================================= */
import { readFileSync, createReadStream } from 'fs';
import { createInterface } from 'readline';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
for (const f of ['version', 'model', 'bayes']) require(resolve(here, `../../src/${f}.js`));
const M = globalThis.ECU.model;

const work = process.argv[2] || 'work';
const meta = JSON.parse(readFileSync(`${work}/post_app.json`, 'utf8'));
const TEND = meta.tEnd, WLO = 30, WHI = 60, PRIOR = [0.51, 0.32, 0.17];
const app = JSON.parse(readFileSync(`${work}/bayes_compare.json`, 'utf8')).filter(r => r.design === 'ec-lss');
const naive = (() => { try { return JSON.parse(readFileSync(`${work}/nm_pmix.json`, 'utf8')); } catch (e) { return null; } })();

async function table(file) {                               // NONMEM table -> rows keyed by header, last TABLE block for .phi
  const rl = createInterface({ input: createReadStream(file), crlfDelay: Infinity });
  let header = null, col = null, rows = [];
  for await (const line of rl) {
    if (line.startsWith('TABLE')) { header = null; col = null; rows = []; continue; }
    const f = line.trim().split(/\s+/);
    if (!header) { header = f; col = {}; f.forEach((h, i) => col[h] = i); continue; }
    rows.push(f);
  }
  return { col, rows };
}
function wq(vals, w, p) {                                   // weighted quantile
  const idx = vals.map((_, i) => i).sort((a, b) => vals[a] - vals[b]);
  const tot = w.reduce((a, b) => a + b, 0); let acc = 0;
  for (const i of idx) { acc += w[i]; if (acc >= p * tot) return vals[i]; }
  return vals[idx[idx.length - 1]];
}
const q = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(p * (s.length - 1))]; };

// ---- NONMEM: exact subgroup probabilities and within-subgroup samples --------------------------------
const obj = { 1: {}, 2: {}, 3: {} }, samples = { 1: {}, 2: {}, 3: {} };
for (const m of [1, 2, 3]) {
  const phi = await table(`${work}/fixedm/imp_m${m}/imp_m${m}.phi`);
  for (const r of phi.rows) obj[m][+r[phi.col.ID]] = +r[phi.col.OBJ];
  const it = await table(`${work}/fixedm/bayes_m${m}/bayes_m${m}.iph`);
  const nEta = 7, ss = { amt: 674, every: 12, tEnd: TEND };
  for (const r of it.rows) {
    if (+r[it.col.ITERATION] <= 0) continue;
    const id = +r[it.col.ID];
    const eta = []; for (let k = 1; k <= nEta; k++) eta.push(+r[it.col[`ETA(${k})`]]);
    const p = M.indivParams(70, null, null, null, eta, 'mpa', 'ecmps', m - 1);
    const s = M.simulate([], [TEND + 12], p, { id: 'mpa', ss, aucWindow: [TEND, TEND + 12] });
    (samples[m][id] = samples[m][id] || { auc: [], tr: [] }).auc.push(s.auc), samples[m][id].tr.push(s.c[0]);
  }
  console.log(`subgroup ${m}: ${Object.keys(samples[m]).length} subjects, ${Object.values(samples[m])[0].auc.length} samples each; IMP objective for ${Object.keys(obj[m]).length} subjects`);
}

const R = [];
for (const a of app) {
  const id = a.id;
  const o = [1, 2, 3].map(m => obj[m][id]), min = Math.min(...o);
  const w = o.map((v, k) => PRIOR[k] * Math.exp(-(v - min) / 2)), z = w.reduce((x, y) => x + y, 0), P = w.map(v => v / z);
  const vals = { auc: [], tr: [], w: [] };
  [1, 2, 3].forEach((m, k) => { const s = samples[m][id]; const n = s.auc.length; s.auc.forEach((v, i) => { vals.auc.push(v); vals.tr.push(s.tr[i]); vals.w.push(P[k] / n); }); });
  const pin = vals.auc.reduce((acc, v, i) => acc + (v > WLO && v < WHI ? vals.w[i] : 0), 0) / vals.w.reduce((x, y) => x + y, 0);
  R.push({ id, P, app: a.app, nm: { auc: wq(vals.auc, vals.w, .5), aucLo: wq(vals.auc, vals.w, .05), aucHi: wq(vals.auc, vals.w, .95), tr: wq(vals.tr, vals.w, .5), pIn: pin } });
}

const rel = (a, b) => Math.abs((a - b) / b), n = R.length, pc = x => (100 * x).toFixed(1) + '%';
const a = R.map(r => rel(r.app.auc, r.nm.auc)), t = R.map(r => rel(r.app.tr, r.nm.tr));
console.log(`\nEC-MPS 3-sample (n=${n}): app vs NONMEM posterior (exact subgroup weights)`);
console.log(`  AUC12 posterior median   within 5 %: ${a.filter(x => x <= .05).length}/${n}   median|Δ| ${pc(q(a, .5))}  p90 ${pc(q(a, .9))}  max ${pc(Math.max(...a))}`);
console.log(`  Ctrough posterior median within 5 %: ${t.filter(x => x <= .05).length}/${n}   median|Δ| ${pc(q(t, .5))}  p90 ${pc(q(t, .9))}  max ${pc(Math.max(...t))}`);
const lo = R.map(r => rel(r.app.aucLo, r.nm.aucLo)), hi = R.map(r => rel(r.app.aucHi, r.nm.aucHi)), pp = R.map(r => Math.abs(r.app.pIn - r.nm.pIn) * 100);
console.log(`  AUC12 p5 within 5 %: ${lo.filter(x => x <= .05).length}/${n}   p95 within 5 %: ${hi.filter(x => x <= .05).length}/${n}   P(window) |Δ| median ${q(pp, .5).toFixed(1)} pp, p90 ${q(pp, .9).toFixed(1)} pp, max ${Math.max(...pp).toFixed(1)} pp`);
const dm = R.map(r => Math.max(...r.app.mix.map((p, k) => Math.abs(p - r.P[k]))));
const modal = R.filter(r => r.app.mix.indexOf(Math.max(...r.app.mix)) === r.P.indexOf(Math.max(...r.P))).length;
console.log(`  subgroup probabilities, app vs exact (IMP): modal agrees ${modal}/${n}; largest difference in any subgroup: median ${(100 * q(dm, .5)).toFixed(1)} pp, p90 ${(100 * q(dm, .9)).toFixed(1)} pp, max ${(100 * Math.max(...dm)).toFixed(1)} pp`);
if (naive) {
  const dn = R.map(r => Math.max(...naive[r.id].map((p, k) => Math.abs(p - r.P[k]))));
  console.log(`  NONMEM's own mean PMIX (BAYES+$MIX) vs exact (IMP): largest difference: median ${(100 * q(dn, .5)).toFixed(1)} pp, p90 ${(100 * q(dn, .9)).toFixed(1)} pp, max ${(100 * Math.max(...dn)).toFixed(1)} pp`);
}
import('fs').then(fs => fs.writeFileSync(`${work}/bayes_ec_compare.json`, JSON.stringify(R)));
