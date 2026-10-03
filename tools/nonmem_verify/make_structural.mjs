/* =========================================================================
 * NONMEM cross-check, part A — the STRUCTURAL model.
 *
 * Writes NONMEM datasets in which every subject carries its own etas as data
 * (columns E1..E7), plus the app's predictions for exactly the same subjects
 * and times. NONMEM's $PK then applies those etas (no estimation), so any
 * difference is a difference in the PK model itself: two-compartment disposition,
 * first-order absorption, lag time, steady state, the EC-MPS 24 h pattern.
 *
 *   node tools/nonmem_verify/make_structural.mjs <workdir>
 * ========================================================================= */
import { writeFileSync, mkdirSync } from 'fs';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
require(resolve(here, '../../src/version.js'));
require(resolve(here, '../../src/model.js'));
const M = globalThis.ECU.model;

const work = process.argv[2] || 'work';
mkdirSync(work, { recursive: true });

// ---- deterministic subjects ---------------------------------------------------
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function gauss(r) { let s, u, v; do { u = r() * 2 - 1; v = r() * 2 - 1; s = u * u + v * v; } while (s === 0 || s >= 1); return u * Math.sqrt(-2 * Math.log(s) / s); }

const OM = { CL: 0.39, Q: 0.78, V1: 1.0, V2: 4.9, KA: 1.87, TLAG: 0.11, TLAG_MORN: 0.08, TLAG_EVE: 0.40 };   // ω (√ω² convention, as shipped)

function subjects(form, n) {
  const names = M.etaNamesFor('mpa', form);          // MMF: CL Q V1 V2 KA TLAG ; EC: … TLAG_MORN TLAG_EVE
  const out = [];
  const zero = names.map(() => 0);
  out.push(zero);
  // one-at-a-time excursions, including the extremes the audit worried about (V2 +5, ka −1.4 ≈ α, ka +4)
  names.forEach((nm, k) => { [-1.5, 1.5].forEach(d => { const e = zero.slice(); e[k] = d * OM[nm]; out.push(e); }); });
  const v2 = zero.slice(); v2[names.indexOf('V2')] = 5.0; out.push(v2);
  const ka1 = zero.slice(); ka1[names.indexOf('KA')] = -1.4; out.push(ka1);
  const ka2 = zero.slice(); ka2[names.indexOf('KA')] = 4.0; out.push(ka2);
  const r = rng(form === 'mmf' ? 11 : 22);
  while (out.length < n) out.push(names.map(nm => gauss(r) * OM[nm]));
  return out;
}

// ---- MMF: one dose per 12 h; times after the last dose ------------------------
const T_MMF = [0.05, 0.1, 0.2, 0.33, 0.5, 0.75, 1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10, 12];
// ---- EC-MPS: morning dose at clock 08:00, evening dose 20:00; times after the morning dose, out to 24 h
const T_EC = [0.25, 0.5, 1, 1.5, 2, 3, 4, 5, 6, 8, 10, 12, 13, 14, 16, 18, 20, 22, 24];

const app = { mmf: [], ecmps: [] };

function build(form, amt, times, n) {
  const etas = subjects(form, n);
  const rows = ['ID,TIME,AMT,EVID,MDV,SS,II,CLK,MX,E1,E2,E3,E4,E5,E6,E7,DV'];
  const nEta = M.etaNamesFor('mpa', form).length;
  etas.forEach((eta, i) => {
    const id = i + 1;
    const mx = form === 'ecmps' ? (i % 3) + 1 : 1;        // morning-lag subgroup (1..3), given, not estimated
    const e = eta.concat(new Array(7 - nEta).fill(0)).map(v => v.toPrecision(12));
    if (form === 'mmf') {
      rows.push([id, 0, amt, 1, 1, 1, 12, 8, mx, ...e, 0].join(','));
      times.forEach(t => rows.push([id, t, 0, 0, 0, 0, 0, 8, mx, ...e, 1].join(',')));
    } else {
      // evening dose first (TIME 0, clock 20, SS with II 24), then the morning dose (TIME 12, clock 8, SS=2 superposes)
      rows.push([id, 0, amt, 1, 1, 1, 24, 20, mx, ...e, 0].join(','));
      rows.push([id, 12, amt, 1, 1, 2, 24, 8, mx, ...e, 0].join(','));
      times.forEach(t => rows.push([id, 12 + t, 0, 0, 0, 0, 0, 8, mx, ...e, 1].join(',')));
    }
    // the app, same subject, same clock: last dose at 368 h = clock 08:00
    const p = M.indivParams(70, null, null, null, eta, 'mpa', form, mx - 1);
    const r = M.simulate([], times.map(t => 368 + t), p, { id: 'mpa', ss: { amt, every: 12, tEnd: 368 } });
    app[form].push({ id, mx, eta, times, ipred: r.c, method: r.method });
  });
  writeFileSync(`${work}/struct_${form}.csv`, rows.join('\n') + '\n');
}

build('mmf', 739, T_MMF, 60);
build('ecmps', 674, T_EC, 60);
writeFileSync(`${work}/struct_app.json`, JSON.stringify(app));
console.log(`structural datasets written to ${work}: mmf ${app.mmf.length} subjects, ecmps ${app.ecmps.length} subjects`);
