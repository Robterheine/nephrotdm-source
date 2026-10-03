// Prototype for the everolimus M3 hand-off (docs/HANDOFF_EVEROLIMUS_M3.md). Matrix-exponential reference model + RK4 oracle. Not shipped; run: node tools/evr_prototype/evr_proto.js

// Prototype of Zwart 2021 / ter Heine Model 3 (ESM NONMEM code). Units: mg, L, h; concentrations returned in ug/L.
const TH = { MAT: 0.549, CLINT: 322, V3: 266, Q: 79.5, V4: 519, PRED: 1.44 };
const BMAX = 0.96425, KD = 0.09195, KNS = 0.15336; // mg/L (KNS dimensionless)
const FU = 0.27, QH = 90, VL = 1.55;
function params(HT, eta = [0, 0, 0], highPred = false) {
  const k = 5 / TH.MAT;
  const QHP = QH * (1 - HT);
  const CLINT = TH.CLINT * (highPred ? TH.PRED : 1) * Math.exp(eta[0]);
  const V3 = TH.V3 * Math.exp(eta[1]);
  const FUi = FU * Math.exp(eta[2]);
  const EH = CLINT * FUi / (QHP + CLINT * FUi), CLH = EH * QHP;
  return { k, K20: CLH / VL, K23: QHP * (1 - EH) / VL, K32: QHP / V3, K34: TH.Q / V3, K43: TH.Q / TH.V4, V3, CLH, EH, QHP };
}
function matrix(p) { // x = [A1,A5,A6,A7,A8,A2,A3,A4]
  const k = p.k, M = Array.from({ length: 8 }, () => new Array(8).fill(0));
  for (let i = 0; i < 5; i++) { M[i][i] = -k; if (i > 0) M[i][i - 1] = k; }
  M[5][4] = k; M[5][5] = -(p.K20 + p.K23); M[5][6] = p.K32;
  M[6][5] = p.K23; M[6][6] = -(p.K32 + p.K34); M[6][7] = p.K43;
  M[7][6] = p.K34; M[7][7] = -p.K43;
  return M;
}
const mm = (A, B) => A.map((r, i) => B[0].map((_, j) => r.reduce((s, v, l) => s + v * B[l][j], 0)));
const I8 = () => Array.from({ length: 8 }, (_, i) => Array.from({ length: 8 }, (_, j) => (i === j ? 1 : 0)));
function expm(A, t) { // scaling and squaring + Taylor(18)
  let n = A.length, norm = Math.max(...A.map(r => r.reduce((s, v) => s + Math.abs(v), 0))) * t;
  let sq = Math.max(0, Math.ceil(Math.log2(Math.max(norm, 1e-12))) + 1), h = t / Math.pow(2, sq);
  let X = A.map(r => r.map(v => v * h)), E = I8(), T = I8();
  for (let q = 1; q <= 18; q++) { T = mm(T, X).map(r => r.map(v => v / q)); E = E.map((r, i) => r.map((v, j) => v + T[i][j])); }
  for (let s = 0; s < sq; s++) E = mm(E, E);
  return E;
}
function solve(A, b) { // gaussian elimination
  const n = A.length, M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) { let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r; [M[c], M[p]] = [M[p], M[c]];
    for (let r = c + 1; r < n; r++) { const f = M[r][c] / M[c][c]; for (let j = c; j <= n; j++) M[r][j] -= f * M[c][j]; } }
  const x = new Array(n); for (let i = n - 1; i >= 0; i--) { let s = M[i][n]; for (let j = i + 1; j < n; j++) s -= M[i][j] * x[j]; x[i] = s / M[i][i]; } return x;
}
const toBlood = (cp, HT) => { const crb = BMAX * cp / (KD + cp) + KNS * cp; return HT * crb + (1 - HT) * cp; }; // mg/L
function steady(p, dose, tau, HTblood, HTref, dt = 0.05) {
  const A = matrix(p), Phi = expm(A, tau), step = expm(A, dt);
  const IM = I8().map((r, i) => r.map((v, j) => v - Phi[i][j]));
  const b = new Array(8).fill(0); b[0] = dose;
  let x = solve(IM, b); // post-dose state at steady state
  const n = Math.round(tau / dt); let aucA = 0, aucR = 0, aucP = 0, prevC = x[6] / p.V3, cmax = 0;
  let c0 = prevC; const curve = [[0, prevC]];
  for (let i = 1; i <= n; i++) {
    x = step.map(r => r.reduce((s, v, j) => s + v * x[j], 0)); const cp = x[6] / p.V3;
    aucP += (prevC + cp) / 2 * dt; aucA += (toBlood(prevC, HTblood) + toBlood(cp, HTblood)) / 2 * dt; aucR += (toBlood(prevC, HTref) + toBlood(cp, HTref)) / 2 * dt;
    prevC = cp; if (i % 20 === 0) curve.push([i * dt, cp * 1000]); cmax = Math.max(cmax, cp);
  }
  return { troughPlasma: prevC * 1000, troughActual: toBlood(prevC, HTblood) * 1000, troughRef: toBlood(prevC, HTref) * 1000, aucPlasma: aucP * 1000, aucActual: aucA * 1000, aucRef: aucR * 1000, cmaxPlasma: cmax * 1000, curve };
}
// RK4 oracle: plain ODE, many doses
function rk4(p, dose, tau, ndoses, h = 0.002) {
  const A = matrix(p); const f = x => A.map(r => r.reduce((s, v, j) => s + v * x[j], 0));
  let x = new Array(8).fill(0), t = 0; const out = [];
  for (let d = 0; d < ndoses; d++) { x[0] += dose; const n = Math.round(tau / h);
    for (let i = 0; i < n; i++) { const k1 = f(x), k2 = f(x.map((v, j) => v + h / 2 * k1[j])), k3 = f(x.map((v, j) => v + h / 2 * k2[j])), k4 = f(x.map((v, j) => v + h * k3[j]));
      x = x.map((v, j) => v + h / 6 * (k1[j] + 2 * k2[j] + 2 * k3[j] + k4[j])); } }
  return x[6] / p.V3 * 1000;
}
module.exports = { params, steady, rk4, matrix, expm, toBlood, BMAX, KD, KNS };
if (require.main === module) {
  for (const HT of [0.30, 0.38, 0.45]) {
    const p = params(HT); const r = steady(p, 1.5, 12, HT, 0.38);
    console.log('HT', HT, 'CLH', p.CLH.toFixed(2), 'EH', p.EH.toFixed(3), JSON.stringify(Object.fromEntries(Object.entries(r).filter(([k]) => k !== 'curve').map(([k, v]) => [k, +v.toFixed(3)]))));
  }
  const p = params(0.38); const t0 = Date.now(); const r = steady(p, 1.5, 12, 0.38, 0.38);
  console.log('RK4 plasma trough after 40 doses', rk4(p, 1.5, 12, 40).toFixed(4), 'matrix-exp steady trough', r.troughPlasma.toFixed(4));
  // ratios corrected/actual
  for (const HT of [0.25, 0.30, 0.38, 0.45]) { const q = params(HT), s = steady(q, 1.5, 12, HT, 0.38); console.log('HT', HT, 'corrected/actual trough', (s.troughRef / s.troughActual).toFixed(3), 'AUC', (s.aucRef / s.aucActual).toFixed(3), 'blood:plasma at trough', (s.troughActual / s.troughPlasma).toFixed(2)); }
  // timing: expm cost
  let t1 = process.hrtime.bigint(); for (let i = 0; i < 2000; i++) expm(matrix(params(0.38, [0.01 * (i % 5), 0, 0])), 12); let t2 = process.hrtime.bigint();
  console.log('expm(8x8, t=12) per call µs:', Number(t2 - t1) / 2000 / 1000);
}
