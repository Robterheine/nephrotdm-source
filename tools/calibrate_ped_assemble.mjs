/* Assemble the tables of docs/CALIBRATION_RESULTS_PEDIATRIC.md from the per-patient JSONL records.
 *   node tools/calibrate_ped_assemble.mjs [--tag=main] [--sabtag=sab]      writes /tmp/claude-501/calibration_ped/tables_<part>.md and prints them */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { mulberry32 } from './calibrate_ped_sim.mjs';
const arg = (k, d) => { const a = process.argv.find(x => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const TAG = arg('tag', 'main'), DIR = '/tmp/claude-501/calibration_ped';
const rd = f => existsSync(f) ? readFileSync(f, 'utf8').split('\n').filter(x => x.trim()).map(JSON.parse) : null;
const med = a => { const s = a.slice().sort((x, y) => x - y); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : NaN; };
const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
const pc = (x, d = 0) => (100 * x).toFixed(d) + '%';
const bootMed = (a, B = 600) => { const r = mulberry32(99), m = []; for (let b = 0; b < B; b++) { const s = []; for (let i = 0; i < a.length; i++) s.push(a[Math.floor(r() * a.length)]); m.push(med(s)); } m.sort((x, y) => x - y); return [m[Math.floor(.025 * B)], m[Math.floor(.975 * B)]]; };
const se = (p, n) => 1.96 * Math.sqrt(Math.max(p * (1 - p), 1e-9) / n);
const flag = (p, n) => (p >= 0.85 && p <= 0.95) ? '' : (p + se(p, n) >= 0.85 && p - se(p, n) <= 0.95 ? '†' : '*');
const cf = (p, n) => pc(p) + flag(p, n);
const out = {};

const MPA_LAB = { M01: '38 kg, alb 34, trough, 1 occ', M02: '38, 34, 0/1/2 h, 1 occ', M03: '38, 34, 0/0.5/2 h, 1 occ', M04: '38, 34, rich (8), 1 occ', M05: '38, 34, trough, 2 occ', M06: '38, 34, 0/1/2 h, 2 occ', M07: '38, 34, rich (8), 2 occ',
  M08: '13 kg, 34, 0/1/2 h, 1 occ', M09: '75 kg, 34, 0/1/2 h, 1 occ', M10: '38, alb 25, 0/1/2 h, 1 occ', M11: '38, alb 41, 0/1/2 h, 1 occ', M12: '13, 25, trough, 1 occ', M13: '75, 41, 0/0.5/2 h, 1 occ',
  M14: '13, 41, rich (8), 2 occ', M15: '75, 25, 0/1/2 h, 2 occ', M16: '13, 34, trough, 2 occ', M17: '38, 34, 0/1/2 h, 1 occ, steady-state mode', M18: '38, 34, 0/1/2 h, 2 occ, steady-state mode' };
const TAC_LAB = { T01: '25 kg, Ht 0.30, capsule, trough', T02: '25, 0.30, capsule, 0/1/2 h', T03: '25, 0.30, capsule, 0/1/2/4 h', T04: '25, Ht 0.22, capsule, 0/1/2 h', T05: '25, Ht 0.45, capsule, 0/1/2 h', T06: '25, 0.30, suspension, 0/1/2 h',
  T07: '25, 0.30, capsule→suspension, 0/1/2 h', T08: '12 kg, 0.30, capsule, 0/1/2 h', T09: '60 kg, 0.30, capsule, 0/1/2 h', T10: '12, 0.22, suspension, trough', T11: '60, 0.45, capsule, 0/1/2/4 h', T12: '12, 0.45, suspension→capsule, 0/1/2/4 h',
  T13: '60, 0.22, suspension, 0/1/2/4 h', T14: '25, 0.30, suspension, trough', T15: '25, 0.30, capsule→suspension, trough', T16: '25, 0.30, capsule, 0/1/2 h, steady-state mode', T17: '25, 0.30, suspension, 0/1/2 h, steady-state mode',
  H00: '25, Ht 0.33 constant, capsule, 0/1/2 h on 2 days', H01: '25, Ht 0.42→0.26, capsule, 0/1/2 h on 2 days', H02: '25, Ht 0.24→0.40, capsule, 0/1/2 h on 2 days', H03: '25, Ht 0.42→0.26, suspension, trough on 2 days', H04: '25, Ht 0.24→0.40, capsule, trough on 2 days' };

function cells(drug, labs, tag) {
  const res = [];
  for (const id of Object.keys(labs)) {
    const L = rd(`${DIR}/L4_${tag}_${drug}_${id}.jsonl`); if (!L) continue;
    const ok = L.filter(r => r.ok), n = ok.length; if (!n) continue;
    res.push({ id, lab: labs[id], L, ok, n, err: L.length - n });
  }
  return res;
}
function l4table(drug, labs, tag, title) {
  const R = cells(drug, labs, tag), tac = drug === 'tacped';
  let md = `| cell | design | n | AUC cov. | trough cov. |${tac ? ' AUC corr. cov. | trough corr. cov. |' : ''} bias AUC (median, 95% CI) | bias trough | converged | R̂ max | ESS min (AUC) | interval ×/÷ (AUC) | s/fit |\n|---|---|---|${'---|'.repeat(tac ? 12 : 10)}\n`;
  const flags = { cov: 0, covBad: 0, biasBad: 0, convBad: 0 };
  for (const c of R) {
    const ok = c.ok, n = c.n, cv = k => ok.filter(r => r.cov[k]).length / n;
    const ba = ok.map(r => r.auc[1] / r.truth.auc - 1), bt = ok.map(r => r.tr[1] / r.truth.tr - 1), ci = bootMed(ba);
    const conv = ok.filter(r => r.conv).length / n;
    const ks = tac ? ['auc', 'tr', 'aucR', 'trR'] : ['auc', 'tr'];
    ks.forEach(k => { flags.cov++; const f = flag(cv(k), n); if (f === '*') flags.covBad++; });
    const mb = med(ba), mt = med(bt); if (Math.abs(mb) > 0.05 || Math.abs(mt) > 0.05) flags.biasBad++; if (conv < 0.98) flags.convBad++;
    const bf = (m, ci0) => (m * 100).toFixed(1) + '%' + (Math.abs(m) > 0.05 ? (ci0 && (ci0[0] > 0.05 || ci0[1] < -0.05 || ci0[0] > 0.05) ? '*' : '†') : '');
    md += `| ${c.id} | ${c.lab} | ${n}${c.err ? ' (+' + c.err + ' failed)' : ''} | ${ks.map(k => cf(cv(k), n)).join(' | ')} | ${(mb * 100).toFixed(1)}% (${(ci[0] * 100).toFixed(1)} to ${(ci[1] * 100).toFixed(1)})${Math.abs(mb) > 0.05 ? '†' : ''} | ${(mt * 100).toFixed(1)}%${Math.abs(mt) > 0.05 ? '†' : ''} | ${pc(conv, 0)}${conv < 0.98 ? '†' : ''} | ${Math.max(...ok.map(r => r.rhat)).toFixed(4)} | ${Math.min(...ok.map(r => r.ess)).toFixed(0)} | ${med(ok.map(r => r.auc[2] / r.auc[0])).toFixed(2)} | ${(med(ok.map(r => r.ms)) / 1000).toFixed(1)} |\n`;
  }
  md += `\n\`*\` = the 95% interval of the coverage (±1.96·√(p(1−p)/n)) lies wholly outside 85–95%; \`†\` = the point estimate is outside the criterion but its interval reaches it. Bias = median over patients of (posterior median / truth − 1). `;
  md += `Cells: ${R.length}; coverage figures ${flags.cov}, clearly outside the band ${flags.covBad}; cells with a point-estimate bias above 5% (AUC or trough) ${flags.biasBad}; cells with convergence below 98% ${flags.convBad}.\n`;
  out['L4_' + drug] = md; return R;
}

function l4b(R) {
  let md = `| cell | design | typical-day interval covers the sampled-day AUC | sampled-day “line” covers it | typical interval width (p95−p5) / sampled-day AUC (median) | line width / sampled-day AUC (median) | median of sampled/typical AUC (true) | SD of log(sampled/typical) (true) | bias of the typical-day median vs sampled day | bias of the line median vs sampled day |\n|---|---|---|---|---|---|---|---|---|---|\n`;
  const all = [];
  for (const c of R) {
    const ok = c.ok, n = c.n, ts = ok.map(r => r.truth.aucSampled);
    const lr = ok.map(r => Math.log(r.truth.aucSampled / r.truth.auc));
    const sd = Math.sqrt(mean(lr.map(x => (x - mean(lr)) ** 2)));
    const ct = ok.filter(r => r.covDay).length / n, cl = ok.filter(r => r.covLine).length / n;
    md += `| ${c.id} | ${c.lab} | ${cf(ct, n)} | ${cf(cl, n)} | ${med(ok.map(r => (r.auc[2] - r.auc[0]) / r.truth.aucSampled)).toFixed(2)} | ${med(ok.map(r => (r.line[2] - r.line[0]) / r.truth.aucSampled)).toFixed(2)} | ${med(ok.map(r => r.truth.aucSampled / r.truth.auc)).toFixed(2)} | ${sd.toFixed(2)} | ${(med(ok.map(r => r.auc[1] / r.truth.aucSampled - 1)) * 100).toFixed(1)}% | ${(med(ok.map(r => r.line[1] / r.truth.aucSampled - 1)) * 100).toFixed(1)}% |\n`;
    ok.forEach(r => all.push({ id: c.id, r }));
  }
  const tot = all.length, f = (g) => all.filter(g).length / tot;
  md += `\nPooled over ${tot} patients: typical-day interval covers the sampled-day AUC in ${pc(f(a => a.r.covDay), 1)}; sampled-day line in ${pc(f(a => a.r.covLine), 1)}; the typical-day interval covers the TYPICAL-day truth in ${pc(f(a => a.r.cov.auc), 1)}.\n`;
  md += `Occasion effect of the sampled day: the line quantity is the posterior of (typical AUC × e^κ) with κ the effect of the occasion that carries the sample (the day of the dose for profiles; the previous evening's dose for a pre-dose trough alone, because the app assigns a sample to the day of the most recent dose before it).\n`;
  out.L4b = md;
}

function sampler(Rm, Rt) {
  let md = '';
  const rows = [['MPA pediatric', Rm, 'VC', 1, 2.42], ['Tacrolimus pediatric', Rt, 'V3', 2, 0.692]];
  md += `| drug | fits | AUC & trough chains converged (app flag) | η-chains all R̂<1.01 and ESS≥400 | volume η (${'Vc / V3'}) R̂≥1.01 or ESS<400 | …of those, AUC flag still ok | worst R̂ of the volume η | min ESS of the volume η | worst R̂ of log AUC | min ESS of log AUC | acceptance (median) |\n|---|---|---|---|---|---|---|---|---|---|---|\n`;
  for (const [nm, R, v, k, om] of rows) {
    const all = R.flatMap(c => c.ok), n = all.length;
    const etaOk = r => r.rhatEta.slice(0, 3).every((x, i) => x < 1.01 && r.essEta[i] >= 400), vSlow = all.filter(r => !(r.rhatEta[k] < 1.01 && r.essEta[k] >= 400));
    md += `| ${nm} | ${n} | ${pc(all.filter(r => r.conv).length / n, 2)} | ${pc(all.filter(etaOk).length / n, 2)} | ${vSlow.length} (${pc(vSlow.length / n, 2)}) | ${vSlow.length ? vSlow.filter(r => r.conv).length + ' of ' + vSlow.length : 'n/a'} | ${Math.max(...all.map(r => r.rhatEta[k])).toFixed(4)} | ${Math.min(...all.map(r => r.essEta[k])).toFixed(0)} | ${Math.max(...all.map(r => r.rhatAuc)).toFixed(4)} | ${Math.min(...all.map(r => r.essAuc)).toFixed(0)} | ${med(all.map(r => r.acc)).toFixed(2)} |\n`;
  }
  // rank statistics (truth drawn from the prior -> uniform ranks if the posterior is exact)
  md += `\n**Rank test of the posterior (truth etas are drawn from the prior, so the rank u of the true value among the posterior draws must be uniform if the sampler and the likelihood are right).** u pooled over all cells and patients; tails are the share with u<0.01 and u>0.99 (expected 1% each), and 5/95% (expected 5% each); KS = max distance of the empirical distribution from uniform (5% critical value 1.36/√n).\n\n| drug | η | n | u<0.01 | u>0.99 | u<0.05 | u>0.95 | decile counts (expected n/10) | KS | KS 5% crit. |\n|---|---|---|---|---|---|---|---|---|---|\n`;
  const ranks = [];
  for (const [nm, R, names] of [['MPA', Rm, ['CL', 'Vc', 'Q']], ['Tacrolimus', Rt, ['KA', 'CLINT', 'V3']]]) {
    const all = R.flatMap(c => c.ok);
    for (let k = 0; k < 3; k++) {
      const u = all.map(r => r.rank[k]).sort((a, b) => a - b), n = u.length;
      let ks = 0; u.forEach((x, i) => { ks = Math.max(ks, Math.abs((i + 1) / n - x), Math.abs(i / n - x)); });
      const dec = new Array(10).fill(0); u.forEach(x => dec[Math.min(9, Math.floor(x * 10))]++);
      const f = (g) => u.filter(g).length / n;
      md += `| ${nm} | ${names[k]} | ${n} | ${pc(f(x => x < 0.01), 2)} | ${pc(f(x => x > 0.99), 2)} | ${pc(f(x => x < 0.05), 1)} | ${pc(f(x => x > 0.95), 1)} | ${dec.join(' ')} | ${ks.toFixed(3)} | ${(1.36 / Math.sqrt(n)).toFixed(3)} |\n`;
      ranks.push([nm, names[k], n, ks]);
    }
    // volume tail in the cells where the data tell nothing about it (shrinkage > 0.9)
    const k = nm === 'MPA' ? 1 : 2, un = all.filter(r => r.shrink[k] > 0.9), n2 = un.length;
    if (n2 >= 50) {
      const u = un.map(r => r.rank[k]); const f = (g) => u.filter(g).length / n2;
      md += `| ${nm} | ${names[k]}, only fits with posterior variance > 0.9 ω² | ${n2} | ${pc(f(x => x < 0.01), 2)} | ${pc(f(x => x > 0.99), 2)} | ${pc(f(x => x < 0.05), 1)} | ${pc(f(x => x > 0.95), 1)} | | | |\n`;
    }
    const kap = all.filter(r => r.kappaRank != null);
    if (nm === 'MPA' && kap.length) { const u = kap.map(r => r.kappaRank).sort((a, b) => a - b), n3 = u.length; let ks = 0; u.forEach((x, i) => { ks = Math.max(ks, Math.abs((i + 1) / n3 - x), Math.abs(i / n3 - x)); }); const f = g => u.filter(g).length / n3;
      md += `| MPA | κ of the sampled occasion (truth: that day's own draw; the other days' κ are in the data but not in the fit) | ${n3} | ${pc(f(x => x < 0.01), 2)} | ${pc(f(x => x > 0.99), 2)} | ${pc(f(x => x < 0.05), 1)} | ${pc(f(x => x > 0.95), 1)} | | ${ks.toFixed(3)} | ${(1.36 / Math.sqrt(n3)).toFixed(3)} |\n`; }
  }
  out.sampler = md;
}

function l5(drug, pub) {
  const files = readdirSync(DIR).filter(f => f.startsWith(`L5_${TAG}_${drug}_c`) && f.endsWith('.jsonl')).sort();
  if (!files.length) return;
  const rows = files.flatMap((f, ci) => rd(DIR + '/' + f).map(r => Object.assign({ c: ci }, r))), okr = rows.filter(r => r.ok);
  const scheds = [...new Set(rows.map(r => r.sched))];
  const metric = (est, ref) => {
    const e = est.map((x, i) => (x - ref[i]) / ref[i]), n = e.length, rm = Math.sqrt(mean(est.map((x, i) => (x - ref[i]) ** 2)));
    return { n, mpe: 100 * mean(e), nrmse: 100 * rm / mean(ref), rrmse: 100 * Math.sqrt(mean(e.map(x => x * x))), p10: 100 * e.filter(x => Math.abs(x) <= .1).length / n, p20: 100 * e.filter(x => Math.abs(x) <= .2).length / n, p30: 100 * e.filter(x => Math.abs(x) <= .3).length / n };
  };
  const rng = mulberry32(7);
  const boot = (pairs, key, B = 500) => { const v = []; for (let b = 0; b < B; b++) { const s = []; for (let i = 0; i < pairs.length; i++) s.push(pairs[Math.floor(rng() * pairs.length)]); v.push(metric(s.map(p => p.e), s.map(p => p.r))[key]); } v.sort((a, b) => a - b); return [v[Math.floor(.025 * B)], v[Math.floor(.975 * B)]]; };
  const nC = new Set(rows.map(r => r.c)).size;
  let md = `Cohorts: ${nC} independent cohorts of ${drug === 'mpaped' ? 20 : 23} simulated children (${okr.length / scheds.length} patients pooled per schedule). Definitions used (the paper's formulas are not at hand): MPE = mean of (estimate − reference)/reference; NRMSE = RMSE / mean(reference); rRMSE = root mean square of the relative errors; P10/20/30 = share within ±10/20/30% of the reference.\n\n`;
  const variants = drug === 'mpaped'
    ? [['app headline (typical-day AUC) vs true sampled-day AUC', r => r.est, r => r.truthDay], ['sampled-day line (typical AUC × e^κ of that day) vs true sampled-day AUC', r => r.line, r => r.truthDay], ['app headline vs trapezoid of the noisy 11-point profile', r => r.est, r => r.refTrap]]
    : [['app (actual, whole blood) vs true sampled-day AUC', r => r.est, r => r.truthDay], ['app vs trapezoid of the noisy 11-point profile', r => r.est, r => r.refTrap]];
  for (const [title, fe, fr] of variants) {
    md += `**${title}**\n\n| schedule | n | MPE % (95% CI) | NRMSE % (95% CI) | rRMSE % | P10 | P20 | P30 | NRMSE by cohort (min–max) | converged |\n|---|---|---|---|---|---|---|---|---|---|\n`;
    for (const s of scheds) {
      const R = okr.filter(r => r.sched === s), pairs = R.map(r => ({ e: fe(r), r: fr(r) })), m = metric(pairs.map(p => p.e), pairs.map(p => p.r));
      const bm = boot(pairs, 'mpe'), bn = boot(pairs, 'nrmse'), per = [...new Set(R.map(r => r.c))].map(c => { const P = R.filter(r => r.c === c); return metric(P.map(fe), P.map(fr)).nrmse; });
      md += `| ${s} | ${m.n} | ${m.mpe.toFixed(1)} (${bm[0].toFixed(1)} to ${bm[1].toFixed(1)}) | ${m.nrmse.toFixed(1)} (${bn[0].toFixed(1)} to ${bn[1].toFixed(1)}) | ${m.rrmse.toFixed(1)} | ${m.p10.toFixed(0)}% | ${m.p20.toFixed(0)}% | ${m.p30.toFixed(0)}% | ${Math.min(...per).toFixed(1)}–${Math.max(...per).toFixed(1)} | ${pc(R.filter(r => r.conv).length / R.length, 1)} |\n`;
    }
    md += '\n';
  }
  md += `Published (Heida 2026, the hand-off section 1.3): ${pub}\n`;
  out['L5_' + drug] = md;
}

const Rm = cells('mpaped', MPA_LAB, TAG), Rt = cells('tacped', TAC_LAB, TAG);
if (Rm.length) { l4table('mpaped', MPA_LAB, TAG); l4b(Rm); }
if (Rt.length) l4table('tacped', TAC_LAB, TAG);
if (Rm.length && Rt.length) sampler(Rm, Rt);
l5('mpaped', '3-point (0,1,2 h) MPE 0.1% (−0.3 to 0.6), NRMSE 21.0% (7.1–34.8); trough only MPE 6.6%, NRMSE 32.5%; threshold 25%.');
l5('tacped', '3-point (0,1,2 h) MPE 0.2% (0.03 to 0.4), NRMSE 7.8% (3.0–12.6); trough only MPE 3.7%, NRMSE 22.0%; threshold 25%.');

// Ht-change paired comparison (cells H00 constant, H01/H02 changing, H03/H04 trough versions): same patients, same noise, only the haematocrit path differs
{
  const g = id => { const L = rd(`${DIR}/L4_${TAG}_tacped_${id}.jsonl`); return L ? L.filter(r => r.ok) : null; };
  const H0 = g('H00'); let md = '';
  if (H0) {
    md += `| cell | Ht path | covers AUC / trough (actual) | covers AUC / trough (corrected) | median relative error AUC / trough (actual) | median relative error AUC / trough (corrected) | median |paired difference in relative error| vs H00 (AUC actual) | 90th percentile of that difference |\n|---|---|---|---|---|---|---|---|\n`;
    for (const [id, lab] of [['H00', '0.33 constant'], ['H01', '0.42 to 0.26'], ['H02', '0.24 to 0.40']]) {
      const L = g(id); if (!L) continue; const n = L.length, c = k => L.filter(r => r.cov[k]).length / n, e = (r, a, t) => r[a][1] / r.truth[t] - 1;
      const d = L.map((r, i) => Math.abs(e(r, 'auc', 'auc') - e(H0[i], 'auc', 'auc'))).sort((a, b) => a - b);
      md += `| ${id} | ${lab} | ${pc(c('auc'))} / ${pc(c('tr'))} | ${pc(c('aucR'))} / ${pc(c('trR'))} | ${(100 * med(L.map(r => e(r, 'auc', 'auc')))).toFixed(1)}% / ${(100 * med(L.map(r => e(r, 'tr', 'tr')))).toFixed(1)}% | ${(100 * med(L.map(r => e(r, 'aucR', 'aucR')))).toFixed(1)}% / ${(100 * med(L.map(r => e(r, 'trR', 'trR')))).toFixed(1)}% | ${(100 * med(d)).toFixed(1)}% | ${(100 * d[Math.floor(.9 * n)]).toFixed(1)}% |\n`;
    }
    md += `\nTrough-only versions (two trough days): `;
    for (const id of ['H03', 'H04']) { const L = g(id); if (L) md += `${id}: AUC cov ${pc(L.filter(r => r.cov.auc).length / L.length)}, trough cov ${pc(L.filter(r => r.cov.tr).length / L.length)}, bias AUC ${(100 * med(L.map(r => r.auc[1] / r.truth.auc - 1))).toFixed(1)}%; `; }
    out.ht = md + '\n';
  }
}
// diagnostics of the MPA bias (tags diaga..diagd)
{
  const rows = [];
  for (const [tag, lab] of [['main', 'as in the table (kappa on every day, sigma² 0.223)'], ['diagb', 'kappa only on the sampled days and the day before (sigma² 0.223)'], ['diagd', 'kappa on every day, sigma² 0.05 (fit and simulation)'], ['diagc', 'kappa only on sampled days, sigma² 0.05 (fully model-consistent)']]) {
    for (const cell of ['M01', 'M02']) {
      const L = rd(`${DIR}/L4_${tag}_mpaped_${cell}.jsonl`); if (!L) continue; const ok = L.filter(r => r.ok), n = ok.length; if (n < 50) continue;
      const u = ok.map(r => r.rank[0]);
      rows.push(`| ${lab} | ${cell} | ${n} | ${cf(ok.filter(r => r.cov.auc).length / n, n)} | ${cf(ok.filter(r => r.cov.tr).length / n, n)} | ${(100 * med(ok.map(r => r.auc[1] / r.truth.auc - 1))).toFixed(1)}% | ${(100 * med(ok.map(r => r.tr[1] / r.truth.tr - 1))).toFixed(1)}% | ${mean(u).toFixed(3)} |`);
    }
  }
  if (rows.length) out.diag = `| data-generating process | cell | n | AUC cov. | trough cov. | bias AUC | bias trough | mean rank of the true CL eta (0.5 expected) |\n|---|---|---|---|---|---|---|---|\n` + rows.join('\n') + '\n';
}
// sabotage (red-first) tables
const sab = [];
for (const f of existsSync(DIR) ? readdirSync(DIR).filter(f => /^L4_sab/.test(f)).sort() : []) {
  const m = f.match(/^L4_(sab[^_]*)_(mpaped|tacped)_(\w+)\.jsonl$/); if (!m) continue;
  const L = rd(DIR + '/' + f).filter(r => r.ok), n = L.length; if (!n) continue;
  const cv = k => L.filter(r => r.cov[k]).length / n;
  sab.push(`| ${m[1]} | ${m[2]} | ${m[3]} | ${n} | ${cf(cv('auc'), n)} | ${cf(cv('tr'), n)} | ${(med(L.map(r => r.auc[1] / r.truth.auc - 1)) * 100).toFixed(1)}% | ${(med(L.map(r => r.tr[1] / r.truth.tr - 1)) * 100).toFixed(1)}% | ${pc(L.filter(r => r.conv).length / n)} |`);
}
if (sab.length) out.sab = `| sabotage | drug | cell | n | AUC cov. | trough cov. | bias AUC | bias trough | converged |\n|---|---|---|---|---|---|---|---|---|\n` + sab.join('\n') + '\n';
for (const [k, v] of Object.entries(out)) { writeFileSync(`${DIR}/tables_${k}.md`, v); console.log(`\n===== ${k} =====\n${v}`); }
