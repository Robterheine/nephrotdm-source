/* =========================================================================
 * Independent reference posterior for the de Winter 2008 MMF model
 * (docs/METHODS_AUDIT_V101.md F1, Appendix B2).
 *
 * Deliberately shares NO code with src/: its own parameter table (typed from
 * the paper's values), its own closed-form steady-state concentration, its own
 * RNG, Metropolis sampler and convergence statistics. It exists so the app's
 * sampler can be compared with something that is not the app.
 *
 * Scope: steady-state MMF, one dose per 12 h (so AUC0–12 = dose_MPA / CL
 * exactly, no PK solve needed for the AUC), samples at given hours AFTER the
 * last dose, log-normal residual error.
 *
 *   node tools/reference_posterior.mjs            # prints the pinned patient
 * ========================================================================= */

// ---- model (de Winter 2008, sqrt-omega^2 convention as shipped) -------------
const TH = { CL: 16, Q: 22, V1: 40, V2: 518, KA: 4.1, TLAG: 0.3 };
const OM2 = { CL: 0.1521, Q: 0.6084, V1: 1.0, V2: 24.01, KA: 3.4969, TLAG: 0.0121 };
const NAMES = ['CL', 'Q', 'V1', 'V2', 'KA', 'TLAG'];
const SIGMA = 0.39;
const TAU = 12;

// ---- RNG (sfc32) + Box–Muller ------------------------------------------------
function sfc32(a, b, c, d) {
  return function () {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    let t = (a + b) | 0; a = b ^ (b >>> 9); b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11); d = (d + 1) | 0; t = (t + d) | 0; c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}
function makeRng(seed) {
  const r = sfc32(0x9E3779B9, 0x243F6A88, 0xB7E15162, seed | 0);
  for (let i = 0; i < 20; i++) r();
  let spare = null;
  const u = () => r();
  const normal = () => {
    if (spare !== null) { const v = spare; spare = null; return v; }
    let x, y, s;
    do { x = 2 * u() - 1; y = 2 * u() - 1; s = x * x + y * y; } while (s === 0 || s >= 1);
    const f = Math.sqrt(-2 * Math.log(s) / s);
    spare = y * f;
    return x * f;
  };
  return { u, normal };
}

// ---- closed-form steady-state concentration ----------------------------------
// One 12-hourly dose, absorbed after a lag; tau hours after the last dose.
export function cSS(eta, amtMpa, tau) {
  const CL = TH.CL * Math.exp(eta[0]), Q = TH.Q * Math.exp(eta[1]);
  const V1 = TH.V1 * Math.exp(eta[2]), V2 = TH.V2 * Math.exp(eta[3]);
  const ka = TH.KA * Math.exp(eta[4]), lag = TH.TLAG * Math.exp(eta[5]);
  const k10 = CL / V1, k12 = Q / V1, k21 = Q / V2;
  const b = k10 + k12 + k21, c = k10 * k21;
  const al = (b + Math.sqrt(b * b - 4 * c)) / 2, be = c / al;
  let d = (tau - lag) % TAU; if (d <= 0) d += TAU;                 // time since latest absorption entry, in (0, 12]
  const w = [
    (k21 - ka) / ((al - ka) * (be - ka)),
    (k21 - al) / ((ka - al) * (be - al)),
    (k21 - be) / ((ka - be) * (al - be))
  ];
  const r = [ka, al, be];
  let s = 0;
  for (let i = 0; i < 3; i++) s += w[i] * Math.exp(-r[i] * d) / (1 - Math.exp(-r[i] * TAU));
  return amtMpa * ka / V1 * s;
}

function logPost(eta, amtMpa, obs) {
  let s = 0;
  for (let i = 0; i < 6; i++) s += eta[i] * eta[i] / OM2[NAMES[i]];
  for (const o of obs) {
    const p = cSS(eta, amtMpa, o.tau);
    if (!(p > 0) || !isFinite(p)) return -Infinity;
    const z = (Math.log(o.c) - Math.log(p)) / SIGMA;
    s += z * z;
  }
  return -0.5 * s;
}

// ---- convergence statistics (split-R̂, Geyer-truncated ESS) ------------------
export function convergence(chains) {
  const split = [];
  for (const c of chains) {
    const h = Math.floor(c.length / 2);
    split.push(c.slice(0, h), c.slice(h, 2 * h));
  }
  const m = split.length, n = split[0].length;
  const means = split.map(c => c.reduce((a, b) => a + b, 0) / n);
  const vars = split.map((c, i) => c.reduce((a, b) => a + (b - means[i]) ** 2, 0) / (n - 1));
  const grand = means.reduce((a, b) => a + b, 0) / m;
  const B = n * means.reduce((a, b) => a + (b - grand) ** 2, 0) / (m - 1);
  const W = vars.reduce((a, b) => a + b, 0) / m;
  const varPlus = (n - 1) / n * W + B / n;
  const rhat = Math.sqrt(varPlus / W);
  const acov = (c, mu, lag) => { let s = 0; for (let i = 0; i + lag < n; i++) s += (c[i] - mu) * (c[i + lag] - mu); return s / n; };
  const rho = [1];
  let pairSum = 0;
  for (let t = 1; t < n - 1; t++) {
    let a = 0;
    for (let j = 0; j < m; j++) a += acov(split[j], means[j], t);
    rho.push(1 - (W - a / m) / varPlus);
    if (t % 2 === 1) {
      const p = rho[t - 1] + rho[t];
      if (p < 0) break;
      pairSum += p;
    }
  }
  const tau = -1 + 2 * pairSum;
  return { rhat, ess: m * n / Math.max(tau, 1 / Math.log10(m * n)) };
}

// ---- sampler -------------------------------------------------------------------
function chol(A) {
  const n = A.length, L = A.map(() => new Array(n).fill(0));
  for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) {
    let s = A[i][j]; for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k];
    L[i][j] = i === j ? Math.sqrt(Math.max(s, 1e-12)) : s / L[j][j];
  }
  return L;
}

/* referencePosterior({ amtMpa, obs:[{tau,c}], winLo, winHi, iters, chains, seed })
 * → { median, p5, p95, pIn, pAbove, pBelow, rhat, ess, essIn } on AUC12. */
export function referencePosterior(o) {
  const amt = o.amtMpa, obs = o.obs, iters = o.iters || 200000, nCh = o.chains || 4;
  const rng = makeRng(o.seed || 1);
  const prior = () => NAMES.map(n => Math.sqrt(OM2[n]) * rng.normal());
  // warm-up: adaptive Metropolis from the prior mean to learn the posterior covariance
  let x = new Array(6).fill(0), lp = logPost(x, amt, obs);
  let cov = NAMES.map((n, i) => NAMES.map((_, j) => i === j ? 0.05 * OM2[n] : 0));
  let L = chol(cov);
  const trace = [];
  const step = (scale) => {
    const z = NAMES.map(() => rng.normal());
    const p = x.map((v, i) => { let s = v; for (let j = 0; j <= i; j++) s += scale * L[i][j] * z[j]; return s; });
    const lq = logPost(p, amt, obs);
    if (Math.log(rng.u() + 1e-300) < lq - lp) { x = p; lp = lq; }
  };
  const d = 6, sc = 2.38 / Math.sqrt(d);
  for (let round = 0; round < 6; round++) {
    trace.length = 0;
    for (let i = 0; i < 20000; i++) { step(round === 0 ? 1 : sc); if (i >= 5000) trace.push(x.slice()); }
    const mu = NAMES.map((_, i) => trace.reduce((a, t) => a + t[i], 0) / trace.length);
    cov = NAMES.map((_, i) => NAMES.map((__, j) => trace.reduce((a, t) => a + (t[i] - mu[i]) * (t[j] - mu[j]), 0) / (trace.length - 1)));
    L = chol(cov);
  }
  // production: fixed covariance, disperse starts, 20 % burn-in
  const chainAuc = [], chainInd = [], all = [];
  for (let c = 0; c < nCh; c++) {
    x = prior(); lp = logPost(x, amt, obs);
    let guard = 0; while (!isFinite(lp) && guard++ < 1000) { x = prior(); lp = logPost(x, amt, obs); }
    const burn = Math.floor(iters * 0.2), thin = Math.max(1, Math.floor((iters - burn) / 20000));
    const a = [], ind = [];
    for (let i = 0; i < iters; i++) {
      step(sc);
      if (i >= burn && (i - burn) % thin === 0) {
        const auc = amt / (TH.CL * Math.exp(x[0]));          // AUC0–12 = dose/CL exactly (12-hourly, one dose per period)
        a.push(auc); ind.push(auc >= o.winLo && auc <= o.winHi ? 1 : 0);
      }
    }
    chainAuc.push(a); chainInd.push(ind);
    for (const v of a) all.push(v);
  }
  all.sort((p, q) => p - q);
  const q = (f) => { const pos = (all.length - 1) * f, lo = Math.floor(pos), hi = Math.ceil(pos); return all[lo] + (all[hi] - all[lo]) * (pos - lo); };
  const frac = (fn) => all.filter(fn).length / all.length;
  const conv = convergence(chainAuc.map(c => c.map(Math.log)));
  const convIn = convergence(chainInd);
  return {
    median: q(0.5), p5: q(0.05), p95: q(0.95),
    pIn: frac(v => v >= o.winLo && v <= o.winHi), pAbove: frac(v => v > o.winLo), pBelow: frac(v => v < o.winHi),
    rhat: conv.rhat, ess: conv.ess, essIn: convIn.ess
  };
}

/* Synthetic patient: truth from the prior, 3-point LSS 0.33/1/3 h after the dose. */
export function syntheticPatient(seed, times = [0.33, 1, 3], amtMpa = 739) {
  const rng = makeRng(seed);
  const eta = NAMES.map(n => Math.sqrt(OM2[n]) * rng.normal());
  const obs = times.map(tau => ({ tau, c: cSS(eta, amtMpa, tau) * Math.exp(SIGMA * rng.normal()) }));
  return { eta, obs, trueAuc: amtMpa / (TH.CL * Math.exp(eta[0])), amtMpa };
}

// ---- CLI ------------------------------------------------------------------------
import { fileURLToPath } from 'url';
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const seeds = process.argv.slice(2).map(Number);
  for (const s of (seeds.length ? seeds : [1, 2, 3, 4, 5, 6, 7, 8])) {
    const pt = syntheticPatient(s);
    const t0 = Date.now();
    const r = referencePosterior({ amtMpa: pt.amtMpa, obs: pt.obs, winLo: 30, winHi: 60, iters: 500000, chains: 4, seed: 100 + s });
    console.log(`patient ${s}: true AUC ${pt.trueAuc.toFixed(1)}  ref median ${r.median.toFixed(1)} [${r.p5.toFixed(1)}, ${r.p95.toFixed(1)}]  P(in) ${(100 * r.pIn).toFixed(1)}%  Rhat ${r.rhat.toFixed(4)}  ESS ${Math.round(r.ess)}  ESS(in) ${Math.round(r.essIn)}  ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  }
}
