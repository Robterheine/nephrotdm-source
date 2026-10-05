/* =========================================================================
 * NONMEM cross-check of the pediatric models, part B (gate G2): POSTHOC.
 *   Simulated patients (explicit histories, truth etas from the prior, PROPORTIONAL noise at the published sigma) -> NONMEM's empirical
 *   Bayes estimates (MAXEVAL=0, POSTHOC, FOCE-I) vs the app's MAP (mapBFGS, the path runFit takes for these specs).
 *   MPA: sampled calendar days are occasions (one eta on F each, the app's own prepare() assigns doses to occasions); tacrolimus: capsule
 *   and suspension patients, constant haematocrit. Dose and concentration units as in the structural streams.
 *   node tools/nonmem_verify/ped/make_posthoc_ped.mjs <workdir> [patients per drug]
 * ========================================================================= */
import { writeFileSync, mkdirSync } from 'fs';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
['version', 'model', 'tacped', 'mpaped', 'bayes'].forEach(f => require(resolve(here, '../../../src/' + f + '.js')));
const { model: M, bayes: B } = globalThis.ECU;
const work = process.argv[2] || 'work', N = +(process.argv[3] || 30); mkdirSync(work, { recursive: true });
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const r = rng(4242);
const gauss = () => { let s, u, v; do { u = r() * 2 - 1; v = r() * 2 - 1; s = u * u + v * v; } while (s === 0 || s >= 1); return u * Math.sqrt(-2 * Math.log(s) / s); };
const uni = (a, b) => a + (b - a) * r();
const f12 = x => (+x).toPrecision(12);
/* NONMEM BAYES with the population parameters frozen (BIONLY=1): every iteration's individual etas go to <root>.iph (BAYES_PHI_STORE=1) */
const toBayes = m => m.replace(/\$ESTIMATION[^\n]*\n/, '$ESTIMATION METHOD=BAYES BIONLY=1 BAYES_PHI_STORE=1 NBURN=2000 NITER=6000 PRINT=2000 SEED=20261005 NOABORT\n').replace(/\$TABLE[^\n]*\n/, '').replace(/^(\$(?:OMEGA|SIGMA)[^\n]*?) FIX$/gm, '$1');   // BIONLY=1 holds the population parameters; FIX on everything would mean no estimation step
const noisy = (pred, sigma) => Math.max(0.05, 1 + sigma * gauss()) * pred;     // proportional error; never non-positive

/* ---------------- MPA ---------------- */
{
  const T = M.spec('mpaped').custom, K = T.constants, SD = [Math.sqrt(K.OM_CL), Math.sqrt(K.OM_VC), Math.sqrt(K.OM_Q)], SIG = Math.sqrt(K.SIGMA_PROP), OCC_SD = Math.sqrt(K.OM_OCC);
  const rows = ['ID,TIME,AMT,EVID,CMT,MDV,OCC,WT,ALB,DV'], papp = [];
  for (let i = 0; i < N; i++) {
    const id = i + 1, wt = uni(13, 75), alb = uni(25, 41), amt = [250, 500, 600, 750, 1000][i % 5];
    const rawEx = { albumin: String(+alb.toFixed(1)) }, albN = +alb.toFixed(1);
    const doses = []; for (let d = 0; d < 40; d++) { doses.push({ t: 24 * d + 8, amt, route: 'oral' }); doses.push({ t: 24 * d + 20, amt, route: 'oral' }); }
    const lastDay = 39, design = i % 3;                      // 0 trough only, 1 trough + 1 h + 2 h, 2 same on two days
    const day = (dd) => design === 0 ? [24 * dd + 8] : [24 * dd + 8, 24 * dd + 9, 24 * dd + 10];
    const obsT = design === 2 ? day(lastDay - 3).concat(day(lastDay)) : day(lastDay);
    const eta = SD.map(s => s * gauss());
    // pass 1: which occasions exist (the app's own assignment), then simulate the truth with kappa on those occasions
    const prep0 = T.prepare({ extra: rawEx, wt, doses: doses.map(d => Object.assign({}, d)), obs: obsT.map(t => ({ t, c: 1 })), steadyState: false });
    const nOcc = prep0.extra.nOcc, kap = Array.from({ length: nOcc }, () => OCC_SD * gauss());
    const p = M.indivParams(wt, null, null, prep0.extra, eta.concat(kap), 'mpaped');
    const sim = M.simulate(prep0.doses, obsT, p, { id: 'mpaped' });
    const obs = obsT.map((t, j) => ({ t, c: noisy(sim.c[j], SIG) }));
    const prep = T.prepare({ extra: rawEx, wt, doses: doses.map(d => Object.assign({}, d)), obs, steadyState: false });
    const om = T.omega(prep.extra);
    const ofv = B.makeOfv({ wt, drug: 'mpaped', doses: prep.doses, ss: null, obs: prep.obs, omega: { vars: om.vars, cov: om.cov, dims: om.vars.length }, extra: prep.extra, form: null });
    const map = B.mapBFGS(ofv, om.vars);
    papp.push({ id, wt, rawEx, doses, obs, nOcc, occDays: prep.extra.occDays, eta: map.x, f: map.f, truth: eta.concat(kap), amt });
    const recs = [];
    prep.doses.forEach(d => recs.push({ t: d.t, o: 1, l: [id, d.t, d.amt, 1, 1, 1, d.occIdx + 1, f12(wt), albN, 0].join(',') }));   // OCC 0 = no sampled occasion: kappa 0
    prep.obs.forEach(o => recs.push({ t: o.t, o: 0, l: [id, o.t, 0, 0, 2, 0, 0, f12(wt), albN, f12(o.c)].join(',') }));              // a pre-dose observation goes BEFORE the dose at the same time
    recs.sort((a, b) => a.t - b.t || a.o - b.o).forEach(x => rows.push(x.l));
  }
  writeFileSync(`${work}/posthoc_mpaped.csv`, rows.join('\n') + '\n');
  writeFileSync(`${work}/posthoc_mpaped_app.json`, JSON.stringify(papp));
  const mod = `$PROBLEM Pediatric MPA POSTHOC: empirical Bayes estimates at the article's values (run-57 structure), proportional error, occasion etas on F
; ETA(1) CL, ETA(2) V2, ETA(3) Q, ETA(4..7) the first four sampled calendar days (OCC 1-4); OCC 0 = a day without a sample (kappa 0)
$INPUT ID TIME AMT EVID CMT MDV OCC WT ALB DV
$DATA posthoc_mpaped.csv IGNORE=@
$SUBROUTINE ADVAN5
$MODEL COMP=(DOSE) COMP=(CENTRAL) COMP=(PERIPHERAL) COMP=(TRAN)
$PK
IOV=0
IF (OCC.EQ.1) IOV=ETA(4)
IF (OCC.EQ.2) IOV=ETA(5)
IF (OCC.EQ.3) IOV=ETA(6)
IF (OCC.EQ.4) IOV=ETA(7)
ALLOCL=(WT/70)**0.75
ALLOV=(WT/70)
ALLOK=(WT/70)**(-0.25)
COVALB=(ALB/34)**(-2.49)
CL=16.0*ALLOCL*COVALB*EXP(ETA(1))
V2=24.9*ALLOV*EXP(ETA(2))
V3=1590*ALLOV
Q=36.2*ALLOCL*EXP(ETA(3))
KTR=1.48*ALLOK
F1=1*EXP(IOV)
S2=V2
K14=KTR
K42=KTR
K23=Q/V2
K32=Q/V3
K20=CL/V2
$ERROR
IPRED=F
Y=IPRED+IPRED*EPS(1)
$THETA (0 FIX)
$OMEGA ${f12(K.OM_CL)} FIX
$OMEGA ${f12(K.OM_VC)} FIX
$OMEGA ${f12(K.OM_Q)} FIX
$OMEGA BLOCK(1) ${f12(K.OM_OCC)} FIX
$OMEGA BLOCK(1) SAME
$OMEGA BLOCK(1) SAME
$OMEGA BLOCK(1) SAME
$SIGMA ${f12(K.SIGMA_PROP)} FIX
$ESTIMATION METHOD=COND INTER MAXEVAL=0 POSTHOC NOABORT
$TABLE ID ETA1 ETA2 ETA3 ETA4 ETA5 ETA6 ETA7 FIRSTONLY NOAPPEND NOPRINT ONEHEADER FORMAT=s1PE15.8 FILE=post_mpaped.tab
`;
  writeFileSync(`${work}/posthoc_mpaped.mod`, mod);
  writeFileSync(`${work}/bayes_mpaped.mod`, toBayes(mod).replace('$PROBLEM Pediatric MPA POSTHOC', '$PROBLEM Pediatric MPA BAYES (population frozen)'));
  console.log('MPA   posthoc patients:', papp.length, 'occasion counts', [1, 2, 3, 4].map(k => papp.filter(a => a.nOcc === k).length).join('/'));
}

/* ---------------- Tacrolimus ---------------- */
{
  const T = M.spec('tacped').custom, K = T.constants, SD = [Math.sqrt(K.OM_KA), Math.sqrt(K.OM_CLINT), Math.sqrt(K.OM_V3)], SIG = Math.sqrt(K.SIGMA_PROP);
  const rows = ['ID,TIME,AMT,EVID,CMT,MDV,WT,HT,FORM,DV'], papp = [];
  for (let i = 0; i < N; i++) {
    const id = i + 1, wt = uni(10, 70), ht = +uni(0.22, 0.45).toFixed(3), form = i % 2 ? 'suspension' : 'capsule', amt = [1500, 2000, 3000, 4000][i % 4];
    const rawEx = { hct: String(ht) }, tEnd = 12 * 59;
    const doses = []; for (let k = 0; k < 60; k++) doses.push({ t: 12 * k, amt, route: 'oral', form });
    const obsT = i % 3 === 0 ? [tEnd + 12] : [tEnd + 12, tEnd + 13, tEnd + 14];
    const eta = SD.map(s => s * gauss());
    const prep0 = T.prepare({ extra: rawEx, wt, doses: doses.map(d => Object.assign({}, d)), obs: obsT.map(t => ({ t, c: 1, hct: ht })), steadyState: false });
    const p = M.indivParams(wt, null, null, prep0.extra, eta, 'tacped');
    const sim = M.simulate(prep0.doses, obsT, p, { id: 'tacped' });
    const obs = obsT.map((t, j) => ({ t, c: noisy(T.toObs(sim.c[j], ht), SIG), hct: ht }));
    const prep = T.prepare({ extra: rawEx, wt, doses: doses.map(d => Object.assign({}, d)), obs, steadyState: false });
    const om = T.omega(prep.extra);
    const ofv = B.makeOfv({ wt, drug: 'tacped', doses: prep.doses, ss: null, obs: prep.obs, omega: { vars: om.vars, cov: null, dims: 3 }, extra: prep.extra, form: null });
    const map = B.mapBFGS(ofv, om.vars);
    papp.push({ id, wt, ht, form, rawEx, doses, obs, amt, eta: map.x, f: map.f, truth: eta });
    const FORM = form === 'suspension' ? 1 : 0, recs = [];
    prep.doses.forEach(d => recs.push({ t: d.t, o: 1, l: [id, d.t, d.amt, 1, 1, 1, f12(wt), ht, FORM, 0].join(',') }));
    prep.obs.forEach(o => recs.push({ t: o.t, o: 0, l: [id, o.t, 0, 0, 3, 0, f12(wt), ht, FORM, f12(o.c)].join(',') }));
    recs.sort((a, b) => a.t - b.t || a.o - b.o).forEach(x => rows.push(x.l));
  }
  writeFileSync(`${work}/posthoc_tacped.csv`, rows.join('\n') + '\n');
  writeFileSync(`${work}/posthoc_tacped_app.json`, JSON.stringify(papp));
  const mod = `$PROBLEM Pediatric tacrolimus POSTHOC: empirical Bayes estimates at the published values (Heida 2026 ESM S1), proportional error
; ETA(1) KA, ETA(2) CLINT, ETA(3) V3 (ETA(1) of the stream, the IIV on F, is fixed to 0 and absent); dose ug, concentration ug/L whole blood
$INPUT ID TIME AMT EVID CMT MDV WT HT FORM DV
$DATA posthoc_tacped.csv IGNORE=@
$SUBROUTINES ADVAN6 TOL=9
$MODEL
COMP=(DEPOT)
COMP=(LIVER)
COMP=(CENTRAL)
COMP=(PERI)
COMP=(TRAN)
COMP=(TRAN2)
$PK
CLWT=(WT/70)**0.75
VWT=(WT/70)
VL=0.0437*(WT**0.9)
F1=1*(0.46**FORM)
IF (FORM.EQ.0) KA=2.83*EXP(ETA(1))
IF (FORM.EQ.1) KA=18*EXP(ETA(1))
QHP=90*(1-HT)*CLWT
FU=1
CLINT=987*CLWT*EXP(ETA(2))
EH=(CLINT*FU)/(QHP+(CLINT*FU))
CLH=EH*QHP
V3=508*VWT*EXP(ETA(3))
V4=487*VWT
Q=112*CLWT
S3=V3
K15=KA
K56=KA
K62=KA
K20=CLH/VL
K23=(QHP*(1-EH))/VL
K32=QHP/V3
K34=Q/V3
K43=Q/V4
$DES
DADT(1)=-K15*A(1)
DADT(5)=-K56*A(5)+K15*A(1)
DADT(6)=-K62*A(6)+K56*A(5)
DADT(2)=-K20*A(2)-K23*A(2)+K62*A(6)+K32*A(3)
DADT(3)=-K32*A(3)-K34*A(3)+K23*A(2)+K43*A(4)
DADT(4)=-K43*A(4)+K34*A(3)
$ERROR
CPL=F
BMAX=418
KD=3.8
CWB=CPL*(1+((BMAX*HT)/(CPL+KD)))
IPRED=CWB
Y=IPRED+IPRED*EPS(1)
$THETA (0 FIX)
$OMEGA ${f12(K.OM_KA)} FIX
$OMEGA ${f12(K.OM_CLINT)} FIX
$OMEGA ${f12(K.OM_V3)} FIX
$SIGMA ${f12(K.SIGMA_PROP)} FIX
$ESTIMATION METHOD=COND INTER MAXEVAL=0 POSTHOC NOABORT
$TABLE ID ETA1 ETA2 ETA3 FIRSTONLY NOAPPEND NOPRINT ONEHEADER FORMAT=s1PE15.8 FILE=post_tacped.tab
`;
  writeFileSync(`${work}/posthoc_tacped.mod`, mod);
  // BAYES: the same model as ADVAN5 (exact matrix exponential, the K parameters of the stream) so that 8000 samples per patient stay fast
  writeFileSync(`${work}/bayes_tacped.mod`, toBayes(mod.replace('$SUBROUTINES ADVAN6 TOL=9', '$SUBROUTINES ADVAN5').replace(/\$DES[\s\S]*?(?=\$ERROR)/, '')).replace('$PROBLEM Pediatric tacrolimus POSTHOC', '$PROBLEM Pediatric tacrolimus BAYES (population frozen)'));
  console.log('TAC   posthoc patients:', papp.length);
}
