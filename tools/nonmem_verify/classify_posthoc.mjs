/* =========================================================================
 * NONMEM cross-check, part B (continued): WHY do the app's MAP and NONMEM's EBE differ?
 *
 * Both minimise the same individual objective, so a difference has to be one of:
 *   - the same optimum                                    (agree),
 *   - one solution sits in a local minimum               (multimodal objective, sparse data),
 *   - a different mixture subgroup, each at its own optimum (different subgroup criterion).
 *
 * For every subject this finds the best optimum per subgroup by multi-start (zero, both solutions,
 * 25 prior-scaled random starts, polished with the app's own optimiser), then classifies each
 * solution by how far its objective is above the best optimum of ITS subgroup. For EC-MPS it also
 * computes the Laplace-approximate marginal probability of each subgroup,
 *   -2 ln P(m|data) ≈ f*_m + ln det(∇²f at f*_m) + const        (f already carries -2 ln p_m),
 * which is the criterion a marginal (rather than joint-mode) assignment uses.
 *
 *   node tools/nonmem_verify/classify_posthoc.mjs <workdir>
 * ========================================================================= */
import { readFileSync } from 'fs';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
for (const f of ['version', 'model', 'bayes']) require(resolve(here, `../../src/${f}.js`));
const M = globalThis.ECU.model, B = globalThis.ECU.bayes;

const work = process.argv[2] || 'work';
const meta = JSON.parse(readFileSync(`${work}/post_app.json`, 'utf8'));
const TEND = meta.tEnd;
const TOL = 1e-3;                     // objective units: "at the optimum"

function readTab(f) {
  const L = readFileSync(f, 'utf8').split('\n').filter(l => l.trim());
  const h = L[1].trim().split(/\s+/);
  return L.slice(2).map(l => { const v = l.trim().split(/\s+/).map(Number); const o = {}; h.forEach((k, i) => o[k] = v[i]); return o; });
}
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function gauss(r) { let s, u, v; do { u = r() * 2 - 1; v = r() * 2 - 1; s = u * u + v * v; } while (s === 0 || s >= 1); return u * Math.sqrt(-2 * Math.log(s) / s); }

// log det of the numerical Hessian of f at x (Cholesky); the prior term makes it positive definite
function logDetHessian(f, x) {
  const n = x.length, H = [];
  const h = x.map(v => 1e-3 * Math.max(1, Math.abs(v)));
  const f0 = f(x);
  for (let i = 0; i < n; i++) { H[i] = new Array(n).fill(0); }
  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      const pp = x.slice(), pm = x.slice(), mp = x.slice(), mm = x.slice();
      pp[i] += h[i]; pp[j] += h[j]; pm[i] += h[i]; pm[j] -= h[j]; mp[i] -= h[i]; mp[j] += h[j]; mm[i] -= h[i]; mm[j] -= h[j];
      H[i][j] = H[j][i] = i === j ? (f(pp) - 2 * f0 + f(mm)) / (h[i] * h[i]) * 1 : (f(pp) - f(pm) - f(mp) + f(mm)) / (4 * h[i] * h[j]);
    }
  }
  // (diagonal: f(pp) with both incs = +2h step would be wrong; recompute properly)
  for (let i = 0; i < n; i++) { const a = x.slice(), b = x.slice(); a[i] += h[i]; b[i] -= h[i]; H[i][i] = (f(a) - 2 * f0 + f(b)) / (h[i] * h[i]); }
  const L = H.map(r => r.slice()); let ld = 0;
  for (let k = 0; k < n; k++) {
    for (let j = 0; j < k; j++) L[k][k] -= L[k][j] * L[k][j];
    if (!(L[k][k] > 0)) return NaN;
    L[k][k] = Math.sqrt(L[k][k]); ld += 2 * Math.log(L[k][k]);
    for (let i = k + 1; i < n; i++) { for (let j = 0; j < k; j++) L[i][k] -= L[i][j] * L[k][j]; L[i][k] /= L[k][k]; }
  }
  return ld;
}

const allRows = [];
for (const form of ['mmf', 'ecmps']) {
  const tab = readTab(`${work}/post_${form}.tab`);
  const names = M.etaNamesFor('mpa', form), nEta = names.length;
  const mixPrior = M.mixPriorOf('mpa', form), K = mixPrior ? mixPrior.length : 1;
  const vars = M.omegaVars('mpa', form);
  const step = vars.map(v => Math.min(0.9, Math.max(0.15, 0.8 * Math.sqrt(v))));
  for (const s of meta.subjects[form]) {
    const mine = tab.filter(r => r.ID === s.id);
    const nmEta = []; for (let k = 1; k <= nEta; k++) nmEta.push(mine[0]['ETA' + k]);
    const nmMix = form === 'ecmps' ? mine[0].MEST - 1 : 0;
    const ofv = B.makeOfv({ wt: 70, drug: 'mpa', form, doses: [], ss: { amt: s.amt, every: 12, tEnd: TEND },
      obs: s.obs.map(o => ({ t: TEND + o.tau, c: o.c })), omega: { vars, dims: nEta }, mixPrior, recency: 'off', rtol: 1e-6 });
    const fApp = ofv(s.app.eta, s.app.mix), fNm = ofv(nmEta, nmMix);
    const dEta = Math.max(...s.app.eta.map((v, k) => Math.abs(v - nmEta[k])));
    const r = rng(5000 + s.id), best = [];
    for (let m = 0; m < K; m++) {
      let bm = { f: Infinity, x: null };
      const starts = [new Array(nEta).fill(0), nmEta, s.app.eta];
      for (let i = 0; i < 25; i++) starts.push(vars.map(v => gauss(r) * Math.sqrt(v) * 0.7));
      for (const x0 of starts) {
        if (!isFinite(ofv(x0, m))) continue;
        const res = B.mapEstimate(x => ofv(x0.map((c, i) => c + x[i]), m), step);
        if (res.ok && res.f < bm.f) bm = { f: res.f, x: x0.map((c, i) => c + res.x[i]) };
      }
      best.push(bm);
    }
    const gap = (f, m) => f - best[m].f;
    const row = { form, design: s.design, id: s.id, dEta, sameMix: s.app.mix === nmMix,
      appGap: gap(fApp, s.app.mix), nmGap: gap(fNm, nmMix), mixApp: s.app.mix, mixNm: nmMix };
    if (K > 1) {
      const g = best.map((b, m) => b.f + logDetHessian(x => ofv(x, m), b.x));      // Laplace marginal criterion per subgroup
      row.mixLaplace = g.indexOf(Math.min(...g));
      row.mixJoint = best.map(b => b.f).indexOf(Math.min(...best.map(b => b.f)));
    }
    allRows.push(row);
  }
}

// ---------------------------------------------------------------------------- report
const pct = (a, n) => `${a}/${n} (${(100 * a / n).toFixed(0)}%)`;
for (const design of [...new Set(allRows.map(r => r.design))]) {
  const R = allRows.filter(r => r.design === design), n = R.length;
  const same = R.filter(r => r.dEta < 0.01 && r.sameMix);
  const diff = R.filter(r => !(r.dEta < 0.01 && r.sameMix));
  const sub = R.filter(r => !r.sameMix);
  const sameSubDiff = diff.filter(r => r.sameMix);
  const nmLocal = sameSubDiff.filter(r => r.nmGap > TOL && r.appGap <= TOL);
  const appLocal = sameSubDiff.filter(r => r.appGap > TOL && r.nmGap <= TOL);
  const bothLocal = sameSubDiff.filter(r => r.appGap > TOL && r.nmGap > TOL);
  const twoOptima = sameSubDiff.filter(r => r.appGap <= TOL && r.nmGap <= TOL);
  console.log(`\n${design}  (n=${n})`);
  console.log(`  same solution (max|Δη| < 0.01, same subgroup)          ${pct(same.length, n)}`);
  console.log(`  differ                                                 ${pct(diff.length, n)}`);
  console.log(`     same subgroup, NONMEM in a local minimum only       ${nmLocal.length}`);
  console.log(`     same subgroup, APP in a local minimum only          ${appLocal.length}`);
  console.log(`     same subgroup, both above the best optimum          ${bothLocal.length}`);
  console.log(`     same subgroup, both at (different) optima           ${twoOptima.length}`);
  if (R[0].mixLaplace !== undefined) {
    console.log(`     different subgroup                                  ${sub.length}`);
    console.log(`  subgroup choice vs the Laplace-marginal criterion:  NONMEM agrees ${pct(R.filter(r => r.mixNm === r.mixLaplace).length, n)}   app (joint mode) agrees ${pct(R.filter(r => r.mixApp === r.mixLaplace).length, n)}`);
    console.log(`  app's joint-mode subgroup = argmin of the joint objective (by construction): ${pct(R.filter(r => r.mixApp === r.mixJoint).length, n)}`);
  }
  const worstApp = R.map(r => r.appGap).sort((a, b) => b - a)[0], worstNm = R.map(r => r.nmGap).sort((a, b) => b - a)[0];
  console.log(`  distance above the best optimum of the solution's own subgroup:  app median ${R.map(r => r.appGap).sort((a, b) => a - b)[Math.floor(n / 2)].toExponential(1)}, max ${worstApp.toFixed(2)}   NONMEM median ${R.map(r => r.nmGap).sort((a, b) => a - b)[Math.floor(n / 2)].toExponential(1)}, max ${worstNm.toFixed(2)}`);
  console.log(`  subjects where the app is > ${TOL} above its optimum: ${R.filter(r => r.appGap > TOL).length};  NONMEM: ${R.filter(r => r.nmGap > TOL).length}`);
}
