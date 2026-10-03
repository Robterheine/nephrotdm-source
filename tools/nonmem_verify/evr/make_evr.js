/* Builds the NONMEM structural check data for everolimus Model 3 and the app-side predictions (closed form of tools/evr_prototype).
 *   A  steady state (SS=1, II=12), constant haematocrit        B  explicit 7-day history with dose changes, constant haematocrit
 *   C  explicit history with the haematocrit changing between records (NONMEM uses the record's HT for the PK):
 *      compares NONMEM with (i) the app's one-haematocrit-for-the-PK approximation and (ii) exact piecewise propagation under two conventions.
 *   node tools/nonmem_verify/evr/make_evr.js <workdir> */
const fs = require('fs'), path = require('path');
const P = require('../../evr_prototype/evr_proto.js'), C = require('../../evr_prototype/evr_closed.js');
const work = process.argv[2] || 'work'; fs.mkdirSync(work, { recursive: true });
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function gauss(r) { let s, u, v; do { u = r() * 2 - 1; v = r() * 2 - 1; s = u * u + v * v; } while (s === 0 || s >= 1); return u * Math.sqrt(-2 * Math.log(s) / s); }
const SD = [Math.sqrt(0.118), Math.sqrt(0.401), Math.sqrt(0.0009)];
const f = x => (+x).toPrecision(10);
const rows = ['ID,TIME,AMT,EVID,MDV,SS,II,HT,STUDY,E1,E2,E3,DV'], app = [];
const r = rng(11); let id = 0;
const blood = (cp, ht) => P.toBlood(cp, ht) * 1000;       // µg/L from mg/L
// ---------- A. steady state
const TA = [0.1, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 6, 8, 10, 11.9];
for (let i = 0; i < 24; i++) {
  id++; const ht = 0.22 + 0.3 * r(), hp = i % 2, dose = 0.75 + 0.25 * (i % 8);
  const eta = i === 0 ? [0, 0, 0] : (i < 7 ? [0, 0, 0].map((_, k) => (k === (i - 1) % 3 ? (i < 4 ? 1.5 : -1.5) * SD[k] : 0)) : SD.map(s => s * gauss(r)));
  rows.push([id, 0, dose, 1, 1, 1, 12, f(ht), hp ? 4 : 1, ...eta.map(f), 0].join(','));
  TA.forEach(t => rows.push([id, t, 0, 0, 0, 0, 0, f(ht), hp ? 4 : 1, ...eta.map(f), 1].join(',')));
  const p = P.params(ht, eta, !!hp), pl = C.poles(p);
  app.push({ id, scen: 'ss', times: TA, cb: TA.map(t => blood(C.cpSS(pl, p.k, 12, t) * dose, ht)), cp: TA.map(t => C.cpSS(pl, p.k, 12, t) * dose * 1000) });
}
// ---------- B. history, constant Ht
const TB = [1, 2, 4, 6, 11.9, 12.5, 24.1, 36, 47.9, 60, 70, 71, 72, 73, 75, 80, 83.9];
const histDoses = () => { const d = []; for (let k = 0; k < 14; k++) d.push({ t: 12 * k, amt: k < 6 ? 1.0 : 1.5 }); return d; };
function simHist(pl, k, doses, t) { let s = 0; for (const d of doses) if (d.t < t) s += d.amt * C.cpSingle(pl, k, t - d.t); return s; }
for (let i = 0; i < 16; i++) {
  id++; const ht = 0.25 + 0.25 * r(), hp = i % 3 === 0, eta = SD.map(s => s * gauss(r)), doses = histDoses();
  const recs = []; doses.forEach(d => recs.push({ t: d.t, o: 0, l: [id, f(d.t), d.amt, 1, 1, 0, 0, f(ht), hp ? 4 : 1, ...eta.map(f), 0].join(',') }));
  TB.forEach(t => recs.push({ t, o: 1, l: [id, f(t), 0, 0, 0, 0, 0, f(ht), hp ? 4 : 1, ...eta.map(f), 1].join(',') }));
  recs.sort((a, b) => a.t - b.t || a.o - b.o).forEach(x => rows.push(x.l));
  const p = P.params(ht, eta, hp), pl = C.poles(p);
  app.push({ id, scen: 'hist', times: TB, cb: TB.map(t => blood(simHist(pl, p.k, doses, t), ht)), cp: TB.map(t => simHist(pl, p.k, doses, t) * 1000) });
}
// ---------- C. history, Ht changing between records
const TC = [6, 11.9, 24.1, 36, 47.9, 59.9, 72.1, 84, 95.9]; const htAt = (t, h0, h1) => t < 36 ? h0 : (t < 72 ? (h0 + h1) / 2 : h1);
const cscen = [];
for (let i = 0; i < 12; i++) {
  id++; const h0 = [0.28, 0.30, 0.33, 0.36, 0.44, 0.40][i % 6], h1 = [0.38, 0.40, 0.36, 0.44, 0.33, 0.30][i % 6] + 0.02 * (i >= 6 ? 1 : 0), hp = i % 4 === 0, eta = SD.map(s => s * gauss(r));
  const doses = []; for (let k = 0; k < 16; k++) doses.push({ t: 12 * k, amt: 1.25 });
  const recs = []; doses.forEach(d => recs.push({ t: d.t, o: 0, ht: htAt(d.t, h0, h1), amt: d.amt }));
  TC.forEach(t => recs.push({ t, o: 1, ht: htAt(t, h0, h1), amt: 0 }));
  recs.sort((a, b) => a.t - b.t || a.o - b.o);
  recs.forEach(x => rows.push([id, f(x.t), x.amt, x.o ? 0 : 1, x.o ? 0 : 1, 0, 0, f(x.ht), hp ? 4 : 1, ...eta.map(f), x.o ? 1 : 0].join(',')));
  // app approximation: PK at the latest sample's Ht, each sample's own Ht for the blood transform
  const htPK = htAt(TC[TC.length - 1], h0, h1), pA = P.params(htPK, eta, hp), plA = C.poles(pA);
  // exact piecewise propagation under two conventions for which record's Ht governs an interval
  function piece(conv) {
    let x = new Array(8).fill(0), tNow = 0; const out = {};
    for (let q = 0; q < recs.length; q++) {
      const rc = recs[q], nx = recs[q + 1];
      if (rc.o === 0) x[0] += rc.amt;
      if (rc.o === 1) out[rc.t] = x[6] / P.params(rc.ht, eta, hp).V3;
      if (nx) { const htUse = conv === 'start' ? rc.ht : nx.ht, E = P.expm(P.matrix(P.params(htUse, eta, hp)), nx.t - rc.t); x = E.map(row => row.reduce((s, v, j) => s + v * x[j], 0)); }
    }
    return out;
  }
  const ps = piece('start'), pe = piece('end');
  cscen.push({ id, h0, h1, times: TC, htObs: TC.map(t => htAt(t, h0, h1)),
    cbApprox: TC.map(t => blood(simHist(plA, pA.k, doses, t), htAt(t, h0, h1))),
    cbStart: TC.map(t => P.toBlood(ps[t], htAt(t, h0, h1)) * 1000), cbEnd: TC.map(t => P.toBlood(pe[t], htAt(t, h0, h1)) * 1000) });
}
fs.writeFileSync(path.join(work, 'struct_evr.csv'), rows.join('\n') + '\n');
fs.writeFileSync(path.join(work, 'struct_evr_app.json'), JSON.stringify({ app, cscen, firstC: app.length + 1 }));
console.log('subjects', id, 'records', rows.length - 1);
