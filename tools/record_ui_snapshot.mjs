/* Records the drug-specific UI strings of MPA and tacrolimus to tests/ui_text_snapshot.json, the baseline that proves the
 * per-drug generalisation of ui.js left both drugs' text byte-identical (the everolimus model card is left out of About).
 *   node tools/record_ui_snapshot.mjs > tests/ui_text_snapshot.json     (record BEFORE the change, never after) */
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
['version','model','tacrolimus','everolimus','bayes','parallel','chart','diagnostics','texts_tac','ui'].forEach(f => require(resolve(here, '../src/' + f + '.js')));
const { model: M, bayes: B, ui: UI, diagnostics: DG } = globalThis.ECU;
const evr = M.drugs.evr; delete M.drugs.evr;
const out = {};
const tEnd = 24 * 40 + 8;
const fitTac = await B.runFit({ drug: 'tac', wt: 80, extra: { sex: 'm', ht: '175', pred: '10', hct: '0.33', assay: 'lcms' }, doses: M.ssHistory({ amt: 3000, intervalHours: 12, tEnd, n: 30 }), steadyState: true,
  obs: [{ t: tEnd, c: 4.1, hct: 0.33 }, { t: tEnd + 2, c: 9.8, hct: 0.33 }], intervalHours: 12, winLo: 80, winHi: 150, troughLo: 4, troughHi: 8, seed: 1, mcmcIters: 40000 }, null);
const fitMpa = await B.runFit({ drug: 'mpa', form: 'mmf', wt: 70, doses: M.ssHistory({ amt: 739, intervalHours: 12, tEnd: 368, n: 30, route: 'oral' }), steadyState: true,
  obs: [{ t: 368.33, c: 9.5 }, { t: 369, c: 12.1 }, { t: 371, c: 4.4 }], intervalHours: 12, winLo: 30, winHi: 60, seed: 1, mcmcIters: 40000 }, null);
for (const id of ['mpa', 'tac']) {
  M.select(id);
  out[id] = { about: UI.aboutHtml(), background: UI.backgroundHtml(), gettingStarted: UI.gettingStartedBodyHtml(), chartNote: UI.drugText('chartNote'), howto: UI.drugText('howto') };
}
out.tacSummary = DG.summaryHint(fitTac); out.tacPanel = DG.panelHtml(fitTac, M.spec('tac'));
out.mpaSummary = DG.summaryHint(fitMpa); out.mpaPanel = DG.panelHtml(fitMpa, M.spec('mpa'));
M.drugs.evr = evr;
console.log(JSON.stringify(out));
