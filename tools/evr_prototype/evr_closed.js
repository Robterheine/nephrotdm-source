// Closed-form M3 (Erlang-5 absorption into a 3-compartment linear disposition). Verified against evr_proto.js. Run: node tools/evr_prototype/evr_closed.js

const P = require('./evr_proto.js');
// closed form: Erlang-5 absorption (rate k) into a 3-compartment linear disposition (liver, central, periph)
function poles(p) {
  const a = p.K20 + p.K23, b = p.K32 + p.K34, c = p.K43;
  // D(s) = (s+a)((s+b)(s+c) - K43*K34) - K32*K23*(s+c) = s^3 + c2 s^2 + c1 s + c0
  const c2 = a + b + c, c1 = a * b + a * c + b * c - p.K43 * p.K34 - p.K32 * p.K23, c0 = a * (b * c - p.K43 * p.K34) - p.K32 * p.K23 * c;
  // three real roots (trigonometric method) of s^3 + c2 s^2 + c1 s + c0
  const q = (3 * c1 - c2 * c2) / 9, r = (9 * c2 * c1 - 27 * c0 - 2 * c2 ** 3) / 54;
  const th = Math.acos(Math.max(-1, Math.min(1, r / Math.sqrt(-q * q * q)))), m = 2 * Math.sqrt(-q);
  const roots = [0, 1, 2].map(j => m * Math.cos((th + 2 * Math.PI * j) / 3) - c2 / 3);
  const Dp = s => 3 * s * s + 2 * c2 * s + c1;
  return roots.map(pi => ({ lam: -pi, r: p.K23 * (pi + c) / Dp(pi) / p.V3 }));   // Cp (mg/L per mg) = sum r_i e^{-lam_i t}
}
// h(lam,k,t) = (k/(k-lam))^5 * [ e^{-lam t} - e^{-k t} * sum_{j<5} x^j/j! ],  x=(k-lam)t.  For |x| < 1.5 the bracket cancels, so use
// the equivalent tail form  e^{-k t} * sum_{j>=5} x^j/j!  (no cancellation, no overflow). Valid for x of either sign.
function hconv(lam, k, t) {
  const d = k - lam, x = d * t, f = Math.pow(k / d, 5);
  if (Math.abs(x) < 1.5) { let s = 0, term = Math.pow(x, 5) / 120; for (let j = 5; j < 40; j++) { s += term; term *= x / (j + 1); } return f * Math.exp(-k * t) * s; }
  let s = 0, tm = 1; for (let j = 0; j < 5; j++) { s += tm; tm *= x / (j + 1); }
  return f * (Math.exp(-lam * t) - Math.exp(-k * t) * s);
}
function cpSingle(poleList, k, t) { let s = 0; for (const q of poleList) s += q.r * hconv(q.lam, k, t); return s; }   // mg/L per mg
// steady state, dose every tau: sum of single-dose responses over all earlier doses (geometric for the exponential part)
function cpSS(poleList, k, tau, t) { // t in [0,tau) after a dose; exponentials summed exactly, Erlang tail added for the last 3 doses
  let s = 0;
  for (const q of poleList) {
    const d = k - q.lam, f = Math.pow(k / d, 5);
    s += q.r * f * Math.exp(-q.lam * t) / (1 - Math.exp(-q.lam * tau));
    // minus the e^{-kt} polynomial part for the dose at t and the preceding ones (negligible beyond one dose since e^{-k tau} ~ 1e-48)
    let tt = t, sm = 0, tm = 1; for (let j = 0; j < 5; j++) { sm += tm; tm *= d * tt / (j + 1); }
    s -= q.r * f * Math.exp(-k * t) * sm;
  }
  return s;
}
module.exports = { poles, cpSingle, cpSS, hconv };
if (require.main === module) {
  let worst = 0;
  for (const HT of [0.25, 0.38, 0.5]) for (const eta of [[0, 0, 0], [0.4, -0.6, 0.03], [-0.5, 0.9, -0.03]]) for (const hp of [false, true]) {
    const p = P.params(HT, eta, hp), pl = poles(p), k = p.k;
    // compare single dose vs matrix exponential on a grid
    const A = P.matrix(p); const b = new Array(8).fill(0); b[0] = 1;
    for (const t of [0.01, 0.05, 0.2, 0.5, 1, 2, 4, 8, 12, 24, 48]) {
      const E = P.expm(A, t), ref = E.reduce((s, r, i) => s + r[0] * 1, 0) && E[6][0] / p.V3;
      const got = cpSingle(pl, k, t); const err = Math.abs(got - ref) / Math.max(ref, 1e-12); if (ref > 1e-9) worst = Math.max(worst, err);
    }
    // steady state vs matrix steady state
    const ss = P.steady(p, 1, 12, HT, 0.38, 0.05);
    const tr = cpSS(pl, k, 12, 12 - 1e-9) * 1000;   // trough just before next dose, ug/L per mg
    const e2 = Math.abs(tr - ss.troughPlasma) / ss.troughPlasma; worst = Math.max(worst, e2);
    // plasma AUC closed form: dose / (CLINT*FU)
    const aucCF = 1 / (322 * (hp ? 1.44 : 1) * Math.exp(eta[0]) * 0.27 * Math.exp(eta[2])) * 1000;
    const e3 = Math.abs(aucCF - ss.aucPlasma) / ss.aucPlasma; worst = Math.max(worst, e3);
  }
  console.log('worst relative error closed form vs matrix exponential:', worst.toExponential(2));
  const p = P.params(0.38); const pl = poles(p); console.log('poles (1/h) and residues', pl.map(q => [+q.lam.toFixed(4), +(q.r*1000).toExponential(3)]));
  let t1 = process.hrtime.bigint(); let acc = 0; for (let i = 0; i < 200000; i++) acc += cpSS(poles(P.params(0.38, [0.001 * (i % 7), 0, 0])), 9.1, 12, 3 + (i % 5)); let t2 = process.hrtime.bigint();
  console.log('closed form incl. param build + poles: µs per steady-state concentration', (Number(t2 - t1) / 200000 / 1000).toFixed(2), acc > 0);
}
