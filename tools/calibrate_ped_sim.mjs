/* =========================================================================
 * Pediatric calibration, simulator (statistician's seat). INDEPENDENT of src/mpaped.js and src/tacped.js: the two models are written here
 * as linear state-space systems straight from the NONMEM streams (tools/nonmem_verify/ped/mpa_ped_run57.ctl, tac_ped_published.ctl) and solved
 * with a matrix exponential (scaling and squaring). The truth in every calibration cell comes from this file, not from the code under test.
 *   - MPA   states [DOSE, TRAN, CENTRAL, PERIPH];  K14 = K42 = KTR, K23 = Q/V2, K32 = Q/V3, K20 = CL/V2;  Cp = A_central / V2
 *   - TAC   states [capsule chain 3, suspension chain 3, LIVER, CENTRAL, PERI]; each dose enters the chain of ITS formulation (rate KA_form e^eta,
 *           amount F_form * dose), the three equal stages feed the liver; liver model with QHP = 90 (1 - Ht)(WT/70)^0.75; Cp = A_central / V3
 * Time in hours, amounts in mg (MPA) or ug (tacrolimus), concentrations in mg/L or ug/L.
 * ========================================================================= */

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export function gauss(rng) { let u = 0; while (u === 0) u = rng(); const v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

/* ---- small dense linear algebra ---- */
const zeros = (n) => Array.from({ length: n }, () => new Float64Array(n));
function matmul(A, B) { const n = A.length, C = zeros(n); for (let i = 0; i < n; i++) for (let k = 0; k < n; k++) { const a = A[i][k]; if (a !== 0) for (let j = 0; j < n; j++) C[i][j] += a * B[k][j]; } return C; }
function matvec(M, x) { const n = M.length, y = new Float64Array(n); for (let i = 0; i < n; i++) { let s = 0; for (let j = 0; j < n; j++) s += M[i][j] * x[j]; y[i] = s; } return y; }
export function expm(A, t) {
  const n = A.length; let nrm = 0;
  for (let i = 0; i < n; i++) { let s = 0; for (let j = 0; j < n; j++) s += Math.abs(A[i][j]); nrm = Math.max(nrm, s * t); }
  const sq = Math.max(0, Math.ceil(Math.log2(Math.max(nrm, 1e-300))) + 2), f = t / Math.pow(2, sq);
  const B = zeros(n); for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) B[i][j] = A[i][j] * f;
  let E = zeros(n), term = zeros(n);
  for (let i = 0; i < n; i++) { E[i][i] = 1; term[i][i] = 1; }
  for (let k = 1; k <= 20; k++) { term = matmul(term, B); for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { term[i][j] /= k; E[i][j] += term[i][j]; } }
  for (let s = 0; s < sq; s++) E = matmul(E, E);
  return E;
}
function solve(M, b) {            // Gaussian elimination with partial pivoting
  const n = M.length, A = M.map((r, i) => Array.from(r).concat([b[i]]));
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]];
    for (let r = c + 1; r < n; r++) { const f = A[r][c] / A[c][c]; for (let k = c; k <= n; k++) A[r][k] -= f * A[c][k]; }
  }
  const x = new Float64Array(n);
  for (let r = n - 1; r >= 0; r--) { let s = A[r][n]; for (let k = r + 1; k < n; k++) s -= A[r][k] * x[k]; x[r] = s / A[r][r]; }
  return x;
}

/* ---- the two systems. A system is { A, dose(form) -> {idx, fac}, cp(x), n } ---- */
export const MPA = { CL: 16.0, V2: 24.9, V3: 1590, Q: 36.2, KTR: 1.48, ALB: -2.49, OM: [0.139, 2.42, 0.337], OMOCC: 0.19, SIG2: 0.223 };
export function mpaSys(wt, alb, eta, P = MPA) {
  const al = Math.pow(wt / 70, 0.75), v = wt / 70, ok = Math.pow(wt / 70, -0.25);
  const cl = P.CL * al * Math.pow(alb / 34, P.ALB) * Math.exp(eta[0]), v2 = P.V2 * v * Math.exp(eta[1]), v3 = P.V3 * v, q = P.Q * al * Math.exp(eta[2]), ktr = P.KTR * ok;
  const k20 = cl / v2, k23 = q / v2, k32 = q / v3, A = zeros(4);
  A[0][0] = -ktr; A[1][0] = ktr; A[1][1] = -ktr; A[2][1] = ktr; A[2][2] = -(k20 + k23); A[2][3] = k32; A[3][2] = k23; A[3][3] = -k32;
  return { A, n: 4, cl, v2, dose: () => ({ idx: 0, fac: 1 }), cp: (x) => x[2] / v2 };
}

export const TAC = { KA_C: 2.83, KA_S: 18, CLINT: 987, V3: 508, V4: 487, Q: 112, F_S: 0.46, OM: [0.644, 0.456, 0.692], SIG2: 0.0374, BMAX: 418, KD: 3.8 };
export function tacSys(wt, ht, eta, P = TAC) {
  const al = Math.pow(wt / 70, 0.75), v = wt / 70, vl = 0.0437 * Math.pow(wt, 0.9), ek = Math.exp(eta[0]);
  const qhp = 90 * (1 - ht) * al, clint = P.CLINT * al * Math.exp(eta[1]), v3 = P.V3 * v * Math.exp(eta[2]), v4 = P.V4 * v, q = P.Q * al;
  const eh = clint / (qhp + clint), clh = eh * qhp;
  const k20 = clh / vl, k23 = qhp * (1 - eh) / vl, k32 = qhp / v3, k34 = q / v3, k43 = q / v4;
  const kc = P.KA_C * ek, ks = P.KA_S * ek, A = zeros(9);
  // chains: 0,1,2 capsule; 3,4,5 suspension; 6 liver; 7 central; 8 peripheral
  A[0][0] = -kc; A[1][0] = kc; A[1][1] = -kc; A[2][1] = kc; A[2][2] = -kc; A[6][2] = kc;
  A[3][3] = -ks; A[4][3] = ks; A[4][4] = -ks; A[5][4] = ks; A[5][5] = -ks; A[6][5] = ks;
  A[6][6] = -(k20 + k23); A[6][7] = k32; A[7][6] = k23; A[7][7] = -(k32 + k34); A[7][8] = k43; A[8][7] = k34; A[8][8] = -k43;
  return { A, n: 9, clint, v3, dose: (form) => form === 'suspension' ? { idx: 3, fac: P.F_S } : { idx: 0, fac: 1 }, cp: (x) => x[7] / v3 };
}
export const wholeBlood = (cp, ht, P = TAC) => cp * (1 + P.BMAX * ht / (cp + P.KD));

/* ---- simulation of an explicit dose history. segs = [{ t0, sys }] (parameters piecewise constant in time; t0 ascending, first = -Infinity).
 * doses = [{ t, amt, form?, fac? }] (fac multiplies the amount: occasion effect). Observations at the time of a dose are taken BEFORE the dose. ---- */
function makeStepper(segs) {
  const cache = new Map();
  const E = (k, dt) => { const key = k + '|' + dt.toFixed(9); let e = cache.get(key); if (!e) { e = expm(segs[k].sys.A, dt); cache.set(key, e); } return e; };
  const segAt = (t) => { let k = 0; for (let i = 0; i < segs.length; i++) if (segs[i].t0 <= t) k = i; return k; };
  function advance(x, ta, tb) {
    while (tb - ta > 1e-12) {
      const k = segAt(ta + 1e-12), end = k + 1 < segs.length ? segs[k + 1].t0 : Infinity, tt = Math.min(tb, end);
      x = matvec(E(k, tt - ta), x); ta = tt;
    }
    return x;
  }
  return { advance, E, segAt };
}
export function simConc(segs, doses, times) {
  const st = makeStepper(segs), n = segs[0].sys.n;
  const ev = doses.map(d => ({ t: d.t, k: 1, d })).concat(times.map((t, i) => ({ t, k: 0, i })));
  ev.sort((a, b) => a.t - b.t || a.k - b.k);
  let x = new Float64Array(n), tc = ev.length ? ev[0].t : 0; const out = new Array(times.length);
  for (const e of ev) {
    x = st.advance(x, tc, e.t); tc = e.t;
    const sys = segs[st.segAt(e.t)].sys;
    if (e.k === 1) { const dd = sys.dose(e.d.form); x[dd.idx] += e.d.amt * dd.fac * (e.d.fac == null ? 1 : e.d.fac); }
    else out[e.i] = sys.cp(x);
  }
  return out;
}
/* state just after all doses with t <= tq (plain advance to tq) */
export function stateAfter(segs, doses, tq) {
  const st = makeStepper(segs), ds = doses.filter(d => d.t <= tq).sort((a, b) => a.t - b.t);
  let x = new Float64Array(segs[0].sys.n), tc = ds.length ? ds[0].t : tq;
  for (const d of ds) { x = st.advance(x, tc, d.t); tc = d.t; const sys = segs[st.segAt(d.t)].sys, dd = sys.dose(d.form); x[dd.idx] += d.amt * dd.fac * (d.fac == null ? 1 : d.fac); }
  return st.advance(x, tc, tq);
}
/* Simpson integral of f(cp(x(t))) over [0, T] from state x0 under system sys (no further doses); N even. */
export function integrate(sys, x0, T, f, N = 2400) {
  const h = T / N, Eh = expm(sys.A, h); let x = x0, s = f(sys.cp(x)), ctrough = null;
  for (let k = 1; k <= N; k++) { x = matvec(Eh, x); const fv = f(sys.cp(x)); s += (k === N ? 1 : (k % 2 ? 4 : 2)) * fv; if (k === N) ctrough = sys.cp(x); }
  return { auc: s * h / 3 + 0 * ctrough, endCp: ctrough, end: x };
}
/* steady state of an endless regimen (amount amt of formulation form every T hours): state just after a dose, then AUC over the interval and the
 * trough (concentration at the end of the interval), for a list of value transforms { name: f(cp) }. */
export function ssExposure(sys, amt, form, T, transforms) {
  const E = expm(sys.A, T), n = sys.n, M = zeros(n), dd = sys.dose(form);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) M[i][j] = (i === j ? 1 : 0) - E[i][j];
  const b = new Float64Array(n); b[dd.idx] = amt * dd.fac;
  const x0 = solve(M, b), out = {}, h = T / 2400, Eh = expm(sys.A, h);
  for (const k of Object.keys(transforms)) {
    const f = transforms[k]; let x = x0, s = f(sys.cp(x)), tr = 0;
    for (let i = 1; i <= 2400; i++) { x = matvec(Eh, x); s += (i === 2400 ? 1 : (i % 2 ? 4 : 2)) * f(sys.cp(x)); if (i === 2400) tr = f(sys.cp(x)); }
    out[k] = { auc: s * h / 3, trough: tr };
  }
  return out;
}

/* ---- dose clock: doses at 08:00 and 20:00, the last one (08:00 of day DAY0 + 21) at tEnd. ---- */
export const DAY_D = 120, TEND = DAY_D * 24 + 8;
export function doseTimes(nDays) { const out = []; for (let k = 2 * nDays - 1; k >= 0; k--) out.push(TEND - 12 * k); return out; }   // ascending, last = TEND - 12*0... see below
// note: doseTimes(n) ends at TEND + 12*(−0): the last element is TEND - 12*0 = TEND only if k runs to 0, which it does.
export const dayOf = (t) => Math.floor(t / 24);
