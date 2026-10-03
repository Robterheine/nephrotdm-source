/* =========================================================================
 * NONMEM cross-check of everolimus Model 3, part B: POSTHOC.
 *   Simulated patients (explicit 60-dose history, constant haematocrit, prednisolone group on and off, trough only or trough + 2 h,
 *   truth etas from the prior, log-normal noise) → NONMEM's empirical Bayes estimates (MAXEVAL=0, POSTHOC) vs the app's MAP (BFGS).
 *   The control stream is model3.ctl with the same structure as struct_evr.mod, the etas estimated (CLINT, V3, FU), dose in mg and
 *   concentrations in mg/L, DV = ln(concentration) (the app works in µg and µg/L; the log-scale error makes the unit shift cancel).
 *   node tools/nonmem_verify/evr/make_posthoc_evr.mjs <workdir>
 * ========================================================================= */
import { writeFileSync, mkdirSync } from 'fs';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
['version', 'model', 'everolimus', 'bayes'].forEach(f => require(resolve(here, '../../../src/' + f + '.js')));
const { model: M, bayes: B } = globalThis.ECU, T = M.spec('evr').custom, K = T.constants;
const work = process.argv[2] || 'work'; mkdirSync(work, { recursive: true });

function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function gauss(r) { let s, u, v; do { u = r() * 2 - 1; v = r() * 2 - 1; s = u * u + v * v; } while (s === 0 || s >= 1); return u * Math.sqrt(-2 * Math.log(s) / s); }
const SD = [Math.sqrt(K.OM_CLINT), Math.sqrt(K.OM_V3), Math.sqrt(K.OM_FU)], SIG = Math.sqrt(K.SIGMA_LOG2);
const N = 30, rows = ['ID,TIME,AMT,EVID,MDV,HT,STUDY,DV'], papp = [], r = rng(123);
for (let i = 0; i < N; i++) {
  const id = i + 1, hct = 0.27 + 0.18 * r(), high = i % 3 === 1, amt = [1.0, 1.5, 2.0][i % 3];
  const tEnd = 24 * 20 + 8, t0 = tEnd - 12 * 59;
  const rawEx = { hct: String(hct.toFixed(3)), predHigh: high ? 'high' : 'low' };
  const hctN = +hct.toFixed(3);
  const doses = []; for (let k = 59; k >= 0; k--) doses.push({ t: tEnd - 12 * k, amt: amt * 1000, route: 'oral' });
  const obsT = i % 3 === 0 ? [tEnd] : [tEnd, tEnd + 2];
  const eta = SD.map(s => s * gauss(r));
  const pr = M.indivParams(70, null, null, T.normExtra(rawEx, 70), eta, 'evr');
  const sim = M.simulate(doses, obsT, pr, { id: 'evr' });
  const obs = obsT.map((t, j) => ({ t, c: T.toObs(sim.c[j], hctN) * Math.exp(SIG * gauss(r)), hct: hctN }));
  const prep = T.prepare({ extra: rawEx, wt: 70, doses: doses, obs: obs, steadyState: false });
  const ofv = B.makeOfv({ wt: 70, drug: 'evr', doses: prep.doses, ss: null, obs: prep.obs, omega: { vars: T.omega().vars, cov: null, dims: 3 }, extra: prep.extra, form: null });
  const map = B.mapBFGS(ofv, T.omega().vars);
  papp.push({ id, eta: map.x, f: map.f, rawEx, doses, obs, truth: eta });
  const recs = [];
  doses.forEach(d => recs.push({ t: d.t, o: 1, l: [id, (d.t - t0), d.amt / 1000, 1, 1, hctN, high ? 4 : 1, 0].join(',') }));
  obs.forEach(o => recs.push({ t: o.t, o: 0, l: [id, (o.t - t0), 0, 0, 0, hctN, high ? 4 : 1, Math.log(o.c / 1000).toPrecision(12)].join(',') }));   // DV is ln(mg/L): the model's error is on the log scale; a pre-dose observation goes BEFORE the dose at the same time
  recs.sort((a, b) => a.t - b.t || a.o - b.o).forEach(x => rows.push(x.l));
}
writeFileSync(`${work}/posthoc_evr.csv`, rows.join('\n') + '\n');
writeFileSync(`${work}/posthoc_evr_app.json`, JSON.stringify(papp));
const f = x => x.toPrecision(12);
const mod = `$PROBLEM Everolimus Model 3 (Zwart 2021 ESM) POSTHOC: empirical Bayes estimates at the published parameter values
; Derived from model3.ctl: ETA(1) CLINT, ETA(2) V3, ETA(3) FU (ETA(5) of the supplement); IOV on MAT is zero in Model 3 and left out;
; compartments TRAN1..TRAN4 (NMTRAN 7.6 refuses four equal names); the virtual AUC compartments are dropped.
$INPUT ID TIME AMT EVID MDV HT STUDY DV
$DATA posthoc_evr.csv IGNORE=@
$SUBROUTINES ADVAN6 TOL=9
$MODEL
 COMP=(DOSE)
 COMP=(LIVER)
 COMP=(CENTRAL)
 COMP=(PERIPH)
 COMP=(TRAN1)
 COMP=(TRAN2)
 COMP=(TRAN3)
 COMP=(TRAN4)
$PK
 VL=1.55
 FLA4=0
 IF (STUDY.EQ.4) FLA4=1
 F1=1
 MAT=0.549
 KA=5/MAT
 FU=0.27*EXP(ETA(3))
 QH=90
 QHP=QH*(1-HT)
 TVCLINT=322*(1.44**FLA4)
 CLINT=TVCLINT*EXP(ETA(1))
 V3=266*EXP(ETA(2))
 Q=79.5
 V4=519
 S3=V3
 EH=(CLINT*FU)/(QHP+(CLINT*FU))
 CLH=EH*QHP
 K15=KA
 K56=K15
 K67=K56
 K78=K67
 K82=K78
 K20=CLH/VL
 K23=(QHP*(1-EH))/VL
 K32=QHP/V3
 K34=Q/V3
 K43=Q/V4
$DES
 DADT(1)=-K15*A(1)
 DADT(2)=-K20*A(2)-K23*A(2)+K82*A(8)+K32*A(3)
 DADT(3)=-K32*A(3)-K34*A(3)+K23*A(2)+K43*A(4)
 DADT(4)=-K43*A(4)+K34*A(3)
 DADT(5)=-K56*A(5)+K15*A(1)
 DADT(6)=-K67*A(6)+K56*A(5)
 DADT(7)=-K78*A(7)+K67*A(6)
 DADT(8)=-K82*A(8)+K78*A(7)
$ERROR
 CPL=F
 BMAX=0.96425
 KD=0.09195
 KNS=0.15336
 CRB=((BMAX*CPL)/(KD+CPL))+(KNS*CPL)
 CBL=(CRB*HT)+(CPL*(1-HT))
 IPRED=LOG(CBL+1E-16)
 Y=IPRED+EPS(1)
$THETA (0 FIX)
$OMEGA ${f(K.OM_CLINT)} FIX
$OMEGA ${f(K.OM_V3)} FIX
$OMEGA ${f(K.OM_FU)} FIX
$SIGMA ${f(K.SIGMA_LOG2)} FIX
$ESTIMATION METHOD=COND INTER MAXEVAL=0 POSTHOC NOABORT
$TABLE ID ETA1 ETA2 ETA3 FIRSTONLY NOAPPEND NOPRINT ONEHEADER FORMAT=s1PE15.8 FILE=post_evr.tab
`;
writeFileSync(`${work}/posthoc_evr.mod`, mod);
console.log('wrote', work, 'posthoc patients:', papp.length);
