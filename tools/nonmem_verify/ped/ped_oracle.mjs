// Independent reference model for the pediatric MPA and tacrolimus models (docs/HANDOFF_PEDIATRIC.md section 4).
// Written from the NONMEM streams (mpa_ped_run57.ctl, tac_ped_published.ctl), NOT from any app code: a general n-state linear system,
// matrix exponential by scaling and squaring + Taylor(18). Not shipped. Units: hours, litres; MPA mg and mg/L; tacrolimus ug and ug/L.
// Used by ref_ped.mjs (the section 4.4 numbers), by make_ped.mjs / compare_ped.mjs (NONMEM) and, later, by tests/test_pediatric.js.

export const MPA = { CL: 16.0, VC: 24.9, VP: 1590, Q: 36.2, KTR: 1.48, ALBX: -2.49, ALB_REF: 34, OM_OCC: 0.19, SIGMA2: 0.223,
  OM: { CL: 0.139, VC: 2.42, Q: 0.337 } };
export const TAC = { KA_CAP: 2.83, KA_SUS: 18, CLINT: 987, V3: 508, V4: 487, Q: 112, FSUS: 0.46, BMAX: 418, KD: 3.8, QH: 90, HT_REF: 0.35,
  SIGMA2: 0.0374, OM: { KA: 0.644, CLINT: 0.456, V3: 0.692 } };

const eye = n => Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
const mm = (A, B) => A.map(r => B[0].map((_, j) => r.reduce((s, v, l) => s + v * B[l][j], 0)));
export const mv = (A, x) => A.map(r => r.reduce((s, v, j) => s + v * x[j], 0));

export function expm(A, t) {
  const n = A.length, norm = Math.max(...A.map(r => r.reduce((s, v) => s + Math.abs(v), 0))) * t;
  const sq = Math.max(0, Math.ceil(Math.log2(Math.max(norm, 1e-12))) + 1), h = t / Math.pow(2, sq);
  const X = A.map(r => r.map(v => v * h));
  let E = eye(n), T = eye(n);
  for (let q = 1; q <= 18; q++) { T = mm(T, X).map(r => r.map(v => v / q)); E = E.map((r, i) => r.map((v, j) => v + T[i][j])); }
  for (let s = 0; s < sq; s++) E = mm(E, E);
  return E;
}

function solve(A, b) {
  const n = A.length, M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = c + 1; r < n; r++) { const f = M[r][c] / M[c][c]; for (let j = c; j <= n; j++) M[r][j] -= f * M[c][j]; }
  }
  const x = new Array(n);
  for (let i = n - 1; i >= 0; i--) { let s = M[i][n]; for (let j = i + 1; j < n; j++) s -= M[i][j] * x[j]; x[i] = s / M[i][i]; }
  return x;
}

/* ---- MPA pediatric. States [DOSE, TRAN, CENTRAL, PERIPHERAL]; dose into DOSE with F1 = exp(eta_occ); Cp = A_central / Vc ---- */
export function mpaParams(WT, ALB, eta = {}) {
  const allocl = Math.pow(WT / 70, 0.75), allov = WT / 70, allok = Math.pow(WT / 70, -0.25);
  const CL = MPA.CL * allocl * Math.pow(ALB / MPA.ALB_REF, MPA.ALBX) * Math.exp(eta.cl || 0);
  const V2 = MPA.VC * allov * Math.exp(eta.vc || 0), V3 = MPA.VP * allov, Q = MPA.Q * allocl * Math.exp(eta.q || 0), KTR = MPA.KTR * allok;
  const k20 = CL / V2, k23 = Q / V2, k32 = Q / V3;
  const A = [[-KTR, 0, 0, 0], [KTR, -KTR, 0, 0], [0, KTR, -(k20 + k23), k32], [0, 0, k23, -k32]];
  return { CL, V2, V3, Q, KTR, A, V: V2, cmt: 2, f: Math.exp(eta.occ || 0), blood: null };
}

/* ---- Tacrolimus pediatric. States [DEPOT, TRAN, TRAN2, LIVER, CENTRAL, PERI]; Cp = A_central / V3; whole blood by the binding relation ---- */
export function tacParams(WT, HT, form, eta = {}) {
  const clwt = Math.pow(WT / 70, 0.75), vwt = WT / 70, VL = 0.0437 * Math.pow(WT, 0.9);
  const KA = (form === 'suspension' ? TAC.KA_SUS : TAC.KA_CAP) * Math.exp(eta.ka || 0), F = form === 'suspension' ? TAC.FSUS : 1;
  const QHP = TAC.QH * (1 - HT) * clwt, CLINT = TAC.CLINT * clwt * Math.exp(eta.clint || 0);
  const EH = CLINT / (QHP + CLINT), CLH = EH * QHP;
  const V3 = TAC.V3 * vwt * Math.exp(eta.v3 || 0), V4 = TAC.V4 * vwt, Q = TAC.Q * clwt;
  const k20 = CLH / VL, k23 = QHP * (1 - EH) / VL, k32 = QHP / V3, k34 = Q / V3, k43 = Q / V4;
  const A = [[-KA, 0, 0, 0, 0, 0], [KA, -KA, 0, 0, 0, 0], [0, KA, -KA, 0, 0, 0], [0, 0, KA, -(k20 + k23), k32, 0],
    [0, 0, 0, k23, -(k32 + k34), k43], [0, 0, 0, 0, k34, -k43]];
  return { KA, F, QHP, CLINT, EH, CLH, VL, V3, V4, Q, A, V: V3, cmt: 4, f: F, HT, plasmaAuc: F / CLINT };
}
export const toBlood = (cp, HT) => cp * (1 + TAC.BMAX * HT / (cp + TAC.KD));

/* Steady state, 12-hourly (any tau), dose amt into state 0. Returns plasma curve on a dt grid over one interval, 0..tau. */
export function steadyCurve(p, amt, tau = 12, dt = 0.01) {
  const n = Math.round(tau / dt), Phi = expm(p.A, tau), step = expm(p.A, dt), N = p.A.length;
  const IM = eye(N).map((r, i) => r.map((v, j) => v - Phi[i][j]));
  const b = new Array(N).fill(0); b[0] = amt * p.f;
  let x = solve(IM, b);                       // state just after a dose, at steady state
  const t = [0], c = [x[p.cmt] / p.V];
  for (let i = 1; i <= n; i++) { x = mv(step, x); t.push(i * dt); c.push(x[p.cmt] / p.V); }
  return { t, c };
}

export function summarise(curve, HT) {           // HT given: also whole-blood actual and corrected (tacrolimus)
  const { t, c } = curve, n = t.length - 1, dt = t[1] - t[0];
  const trap = f => { let s = 0; for (let i = 1; i <= n; i++) s += (f(c[i - 1]) + f(c[i])) * 0.5 * dt; return s; };
  let cmax = -1, tmax = 0, im = 0; for (let i = 0; i <= n; i++) if (c[i] > cmax) { cmax = c[i]; tmax = t[i]; im = i; }
  if (im > 0 && im < n) {                          // parabola through the three points around the grid maximum
    const y0 = c[im - 1], y1 = c[im], y2 = c[im + 1], den = y0 - 2 * y1 + y2;
    if (den < 0) { const d = 0.5 * (y0 - y2) / den; tmax = t[im] + d * dt; cmax = y1 - 0.25 * (y0 - y2) * d; }
  }
  const out = { auc: trap(v => v), trough: c[n], cmax, tmax };
  if (HT !== undefined) {
    out.aucAct = trap(v => toBlood(v, HT)); out.aucCor = trap(v => toBlood(v, TAC.HT_REF));
    out.trAct = toBlood(c[n], HT); out.trCor = toBlood(c[n], TAC.HT_REF);
  }
  return out;
}

/* Deterministic RK4 of the same system (second oracle): amt per dose, ndoses at interval tau, returns plasma conc just before the next dose. */
export function rk4Trough(p, amt, tau, ndoses, h = 0.002) {
  const f = x => mv(p.A, x);
  let x = new Array(p.A.length).fill(0);
  for (let d = 0; d < ndoses; d++) {
    x[0] += amt * p.f;
    for (let i = 0, n = Math.round(tau / h); i < n; i++) {
      const k1 = f(x), k2 = f(x.map((v, j) => v + h / 2 * k1[j])), k3 = f(x.map((v, j) => v + h / 2 * k2[j])), k4 = f(x.map((v, j) => v + h * k3[j]));
      x = x.map((v, j) => v + h / 6 * (k1[j] + 2 * k2[j] + 2 * k3[j] + k4[j]));
    }
  }
  return x[p.cmt] / p.V;
}
