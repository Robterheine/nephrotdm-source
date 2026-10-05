// Builds the NONMEM structural-check data for the pediatric MPA and tacrolimus models and the oracle predictions (ped_oracle.mjs).
//   MPA: A steady state (SS=1, II=12)  B 7-day history with a dose change and one occasion eta per calendar day
//   TAC: A steady state, both formulations (explicit 80-dose train, judged; SS=1 records informational) B history, constant haematocrit and formulation
//        C history with a capsule -> suspension switch (doses 12 h apart): NONMEM applies the record's KA to the whole system, the app
//          design (hand-off D5) gives each dose its own KA; compared INFORMATIONALLY, the difference is the cost of that design.
// node tools/nonmem_verify/ped/make_ped.mjs <workdir>
import fs from 'fs';
import path from 'path';
import { expm, mv, mpaParams, tacParams, toBlood, steadyCurve, MPA, TAC } from './ped_oracle.mjs';

const work = process.argv[2] || 'work'; fs.mkdirSync(work, { recursive: true });
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const r = rng(2026);
const gauss = () => { let s, u, v; do { u = r() * 2 - 1; v = r() * 2 - 1; s = u * u + v * v; } while (s === 0 || s >= 1); return u * Math.sqrt(-2 * Math.log(s) / s); };
const f = x => (+x).toPrecision(10);
const uni = (a, b) => a + (b - a) * r();

// plasma concentration at time t after the single dose (amt already multiplied by its F) given at td, system matrix A
const single = (p, amt, dt) => { const x = new Array(p.A.length).fill(0); x[0] = amt; return mv(expm(p.A, dt), x)[p.cmt] / p.V; };

/* ================= MPA ================= */
{
  const rows = ['ID,TIME,AMT,EVID,CMT,MDV,SS,II,WT,ALB,E1,E2,E4,EO,DV'], pred = [];
  const sd = { cl: Math.sqrt(MPA.OM.CL), vc: Math.sqrt(MPA.OM.VC), q: Math.sqrt(MPA.OM.Q), occ: Math.sqrt(MPA.OM_OCC) };
  const TA = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 6, 8, 10, 11.9, 12];
  let id = 0;
  for (let i = 0; i < 24; i++) {
    id++;
    const wt = [13, 20, 38.5, 70, 75, 25][i % 6] + (i >= 6 ? uni(-3, 3) : 0), alb = [34, 34, 34, 34, 28, 41][i % 6] + (i >= 6 ? uni(-3, 3) : 0), dose = [250, 500, 600, 750, 1000][i % 5];
    const eta = i === 0 ? {} : i < 7 ? { [['cl', 'vc', 'q', 'occ'][(i - 1) % 4]]: (i < 4 ? 1.5 : -1.5) * sd[['cl', 'vc', 'q', 'occ'][(i - 1) % 4]] }
      : { cl: sd.cl * gauss(), vc: sd.vc * gauss(), q: sd.q * gauss(), occ: sd.occ * gauss() };
    const E = [eta.cl || 0, eta.vc || 0, eta.q || 0, eta.occ || 0].map(f);
    rows.push([id, 0, dose, 1, 1, 1, 1, 12, f(wt), f(alb), ...E, 0].join(','));
    TA.forEach(t => rows.push([id, t, 0, 0, 2, 0, 0, 0, f(wt), f(alb), ...E, 1].join(',')));
    const p = mpaParams(wt, alb, eta), cur = steadyCurve(p, dose, 12, 0.05);
    pred.push({ id, scen: 'ss', times: TA, c: TA.map(t => cur.c[Math.round(t / 0.05)]) });
  }
  const TB = [1, 2, 4, 6, 11.9, 12.5, 24.1, 36, 47.9, 60, 70, 71, 72, 73, 75, 80, 83.9];
  for (let i = 0; i < 12; i++) {
    id++;
    const wt = uni(13, 75), alb = uni(25, 41), eta = { cl: sd.cl * gauss(), vc: sd.vc * gauss(), q: sd.q * gauss() };
    const occEta = [1, 2, 3, 4].map(() => sd.occ * gauss()), occ = t => Math.min(4, Math.floor(t / 24) + 1);
    const doses = []; for (let k = 0; k < 14; k++) doses.push({ t: 12 * k, amt: k < 6 ? 500 : 750 });
    const E = t => [eta.cl, eta.vc, eta.q, occEta[occ(t) - 1]].map(f);
    const recs = []; doses.forEach(d => recs.push({ t: d.t, o: 0, l: [id, f(d.t), d.amt, 1, 1, 1, 0, 0, f(wt), f(alb), ...E(d.t), 0].join(',') }));
    TB.forEach(t => recs.push({ t, o: 1, l: [id, f(t), 0, 0, 2, 0, 0, 0, f(wt), f(alb), ...E(t), 1].join(',') }));
    recs.sort((a, b) => a.t - b.t || a.o - b.o).forEach(x => rows.push(x.l));
    const p0 = mpaParams(wt, alb, eta);
    pred.push({ id, scen: 'hist', times: TB, c: TB.map(t => doses.reduce((s, d) => d.t < t ? s + single(p0, d.amt * Math.exp(occEta[occ(d.t) - 1]), t - d.t) : s, 0)) });
  }
  fs.writeFileSync(path.join(work, 'struct_mpaped.csv'), rows.join('\n') + '\n');
  fs.writeFileSync(path.join(work, 'struct_mpaped_ref.json'), JSON.stringify(pred));
  console.log('MPA   subjects', id, 'records', rows.length - 1);
}

/* ================= TACROLIMUS ================= */
{
  const rows = ['ID,TIME,AMT,EVID,CMT,MDV,SS,II,WT,HT,FORM,E1,E2,E3,DV'], pred = [];
  const sd = { ka: Math.sqrt(TAC.OM.KA), clint: Math.sqrt(TAC.OM.CLINT), v3: Math.sqrt(TAC.OM.V3) };
  const TA = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 6, 8, 10, 11.9, 12];
  const ETAKEYS = ['ka', 'clint', 'v3'];
  let id = 0;
  for (let i = 0; i < 24; i++) {
    id++;
    const wt = [12, 25, 25, 60, 40, 18][i % 6] + (i >= 6 ? uni(-3, 3) : 0), ht = [0.30, 0.30, 0.40, 0.35, 0.22, 0.45][i % 6] + (i >= 6 ? uni(-0.03, 0.03) : 0);
    const form = i % 2 ? 'suspension' : 'capsule', dose = 1000 + 500 * (i % 7);
    const eta = i === 0 ? {} : i < 7 ? { [ETAKEYS[(i - 1) % 3]]: (i < 4 ? 1.5 : -1.5) * sd[ETAKEYS[(i - 1) % 3]] } : { ka: sd.ka * gauss(), clint: sd.clint * gauss(), v3: sd.v3 * gauss() };
    const E = [eta.ka || 0, eta.clint || 0, eta.v3 || 0].map(f), FORM = form === 'suspension' ? 1 : 0;
    rows.push([id, 0, dose, 1, 1, 1, 1, 12, f(wt), f(ht), FORM, ...E, 0].join(','));
    TA.forEach(t => rows.push([id, t, 0, 0, 3, 0, 0, 0, f(wt), f(ht), FORM, ...E, 1].join(',')));
    const p = tacParams(wt, ht, form, eta), cur = steadyCurve(p, dose, 12, 0.05), cp = TA.map(t => cur.c[Math.round(t / 0.05)]);
    pred.push({ id, scen: 'ss1', times: TA, cp, cb: cp.map(c => toBlood(c, ht)) });
    // the same patient as an explicit 80-dose train (judged): NONMEM's own SS=1 iteration in ADVAN6 is inaccurate for fast absorption
    // (suspension with KA about 60 /h gave 4 % against a 2.7e-9 agreement of the explicit train), so SS=1 is informational only
    id++;
    const T0 = 12 * 79;
    for (let k = 0; k < 80; k++) rows.push([id, 12 * k, dose, 1, 1, 1, 0, 0, f(wt), f(ht), FORM, ...E, 0].join(','));
    TA.forEach(t => rows.push([id, T0 + t, 0, 0, 3, 0, 0, 0, f(wt), f(ht), FORM, ...E, 1].join(',')));
    pred.push({ id, scen: 'ss', times: TA.map(t => T0 + t), cp, cb: cp.map(c => toBlood(c, ht)) });
  }
  const TB = [1, 2, 4, 6, 11.9, 12.5, 24.1, 36, 47.9, 60, 70, 71, 72, 73, 75, 80, 83.9];
  const histDoses = (nSwitch) => { const d = []; for (let k = 0; k < 14; k++) d.push({ t: 12 * k, amt: k < 6 ? 2000 : 3000, form: k < nSwitch ? 'capsule' : 'suspension' }); return d; };
  for (let i = 0; i < 16 + 10; i++) {
    id++;
    const sw = i >= 16, wt = uni(10, 75), ht = uni(0.22, 0.45), eta = { ka: sd.ka * gauss(), clint: sd.clint * gauss(), v3: sd.v3 * gauss() };
    const form0 = i % 2 ? 'suspension' : 'capsule', doses = sw ? histDoses(6) : histDoses(i % 2 ? 0 : 99);
    const FORMof = d => (d.form === 'suspension' ? 1 : 0), E = [eta.ka, eta.clint, eta.v3].map(f);
    const recs = []; doses.forEach(d => recs.push({ t: d.t, o: 0, l: [id, f(d.t), d.amt, 1, 1, 1, 0, 0, f(wt), f(ht), FORMof(d), ...E, 0].join(',') }));
    // the observation record carries the formulation of the dose most recently given (what the record's KA is in NONMEM)
    const formAt = t => { let fm = doses[0].form; for (const d of doses) if (d.t <= t) fm = d.form; return fm; };
    TB.forEach(t => recs.push({ t, o: 1, l: [id, f(t), 0, 0, 3, 0, 0, 0, f(wt), f(ht), formAt(t) === 'suspension' ? 1 : 0, ...E, 1].join(',') }));
    recs.sort((a, b) => a.t - b.t || a.o - b.o).forEach(x => rows.push(x.l));
    // oracle: every dose keeps its own absorption rate and relative F (the app design)
    const cpAt = t => doses.reduce((s, d) => { if (!(d.t < t)) return s; const p = tacParams(wt, ht, d.form, eta); return s + single(p, d.amt * p.F, t - d.t); }, 0);
    const cp = TB.map(cpAt);
    pred.push({ id, scen: sw ? 'switch' : 'hist', times: TB, cp, cb: cp.map(c => toBlood(c, ht)) });
  }
  // ---- D. haematocrit changing between records (informational). NONMEM applies the record's Ht to the PK; the app holds the latest
  //      sample's Ht for the PK path and uses each sample's own Ht for the blood transform. 'cp'/'cb' below are the APP approximation.
  const TD = [6, 11.9, 24.1, 36, 47.9, 59.9, 72.1, 84, 95.9], htAt = (t, h0, h1) => (t < 36 ? h0 : (t < 72 ? (h0 + h1) / 2 : h1));
  for (let i = 0; i < 12; i++) {
    id++;
    const wt = uni(10, 70), h0 = [0.28, 0.30, 0.33, 0.36, 0.44, 0.40][i % 6], h1 = [0.38, 0.40, 0.36, 0.44, 0.33, 0.30][i % 6] + 0.02 * (i >= 6 ? 1 : 0);
    const eta = { ka: sd.ka * gauss(), clint: sd.clint * gauss(), v3: sd.v3 * gauss() }, form = i % 3 === 0 ? 'suspension' : 'capsule', FORM = form === 'suspension' ? 1 : 0;
    const E = [eta.ka, eta.clint, eta.v3].map(f), doses = [];
    for (let k = 0; k < 16; k++) doses.push({ t: 12 * k, amt: 2500 });
    const recs = []; doses.forEach(d => recs.push({ t: d.t, o: 0, l: [id, f(d.t), d.amt, 1, 1, 1, 0, 0, f(wt), f(htAt(d.t, h0, h1)), FORM, ...E, 0].join(',') }));
    TD.forEach(t => recs.push({ t, o: 1, l: [id, f(t), 0, 0, 3, 0, 0, 0, f(wt), f(htAt(t, h0, h1)), FORM, ...E, 1].join(',') }));
    recs.sort((a, b) => a.t - b.t || a.o - b.o).forEach(x => rows.push(x.l));
    const q = tacParams(wt, htAt(TD[TD.length - 1], h0, h1), form, eta);   // PK path at the latest sample's Ht
    const cp = TD.map(t => doses.reduce((sum, d) => d.t < t ? sum + single(q, d.amt * q.F, t - d.t) : sum, 0));
    pred.push({ id, scen: 'htvar', times: TD, cp, cb: cp.map((c, j) => toBlood(c, htAt(TD[j], h0, h1))) });
  }
  fs.writeFileSync(path.join(work, 'struct_tacped.csv'), rows.join('\n') + '\n');
  fs.writeFileSync(path.join(work, 'struct_tacped_ref.json'), JSON.stringify(pred));
  console.log('TAC   subjects', id, 'records', rows.length - 1);
}
