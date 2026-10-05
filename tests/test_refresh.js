/* =========================================================================
 * NephroTDM: the visual refresh (header, drug cards, fonts, tap size, one primary action, results tiles, layout).
 * Run: node tests/test_refresh.js   (part of `npm test`)
 * The page is built from index.html + src/*.css + src/*.js; these tests read those sources, and exercise the pure functions of ui.js.
 * ========================================================================= */
'use strict';
var fs = require('fs'), path = require('path');
var h = require('./harness.js');
var t = h.t, eq = h.eq, truthy = h.truthy, falsy = h.falsy;

var root = path.join(__dirname, '..');
var read = function (p) { return fs.readFileSync(path.join(root, p), 'utf8'); };
var html = read('index.html'), css = read('src/app.css'), fonts = read('src/fonts.css'), ui = read('src/ui.js'), build = read('build.mjs');

['version', 'model', 'tacrolimus', 'everolimus', 'tacped', 'mpaped', 'bayes', 'parallel', 'chart', 'diagnostics', 'texts_tac', 'texts_evr', 'texts_tacped', 'texts_mpaped', 'author_photo', 'report', 'ui'].forEach(function (f) { require('../src/' + f + '.js'); });
var ECU = globalThis.ECU, M = ECU.model;

t('fonts: IBM Plex is embedded (no network), Sans as one variable file and Mono in two weights, loaded before the app styles, and named in the font stacks', function () {
  truthy(/font-family: 'IBM Plex Sans'[^}]*font-weight: 400 600[^}]*url\(data:font\/woff2;base64,[A-Za-z0-9+\/=]{20000,}\)/.test(fonts), 'Sans: variable weights 400 to 600, inline');
  truthy(/font-family: 'IBM Plex Mono'[^}]*font-weight: 500/.test(fonts) && /font-family: 'IBM Plex Mono'[^}]*font-weight: 600/.test(fonts), 'Mono 500 and 600');
  falsy(/url\(\s*['"]?https?:/.test(fonts + css) || /fonts\.googleapis|fonts\.gstatic/.test(html + css + fonts + ui), 'no font or other network request anywhere');
  truthy(html.indexOf('src/fonts.css') > 0 && html.indexOf('src/fonts.css') < html.indexOf('src/app.css'), 'fonts.css before app.css in the page');
  truthy(/'fonts', 'app'/.test(build) || /sheet of \['fonts', 'app'\]/.test(build), 'the build inlines both stylesheets');
  truthy(/--font-sans: 'IBM Plex Sans'/.test(css) && /--mono: 'IBM Plex Mono'/.test(css) && /font-family: var\(--font-sans\)/.test(css), 'stacks use Plex first, system fonts as fallback');
  truthy(/OFL|SIL Open Font License/.test(fonts), 'the font licence is named');
});

t('tap size and type: controls are at least 44 px tall, base text 16 px, small text 12.5 px, a visible 3 px focus ring', function () {
  truthy(/--tap:\s*44px/.test(css), 'the tap size token');
  truthy(/select, textarea \{[^}]*min-height: var\(--tap\)/.test(css), 'fields');
  truthy(/button\.primary \{[^}]*min-height: var\(--tap\)/.test(css) && /button\.secondary \{[^}]*min-height: var\(--tap\)/.test(css) && /header \.actions button:not\(\.primary\), \.restore-bar button:not\(\.primary\) \{[^}]*min-height: var\(--tap\)/.test(css), 'buttons');
  truthy(/--text-md:\s*16px/.test(css) && /--text-xs:\s*12\.5px/.test(css) && /--text-sm:\s*14px/.test(css), 'type scale');
  truthy(/:focus-visible \{ outline: 3px solid var\(--accent\)/.test(css), 'focus ring');
});

t('header: brand mark, help links, a Session menu (export, import, clear) and a secondary Print report; every id the code binds is kept', function () {
  var head = html.slice(html.indexOf('<header'), html.indexOf('</header>'));
  truthy(/class="brand"[\s\S]*<svg[^>]*aria-hidden="true"/.test(head) && /id="appName"/.test(head) && /id="titleVersion"/.test(head), 'brand with logo, name and version');
  truthy(/<nav[^>]*aria-label="Help"[\s\S]*btnGettingStarted[\s\S]*btnBackground[\s\S]*btnAbout[\s\S]*<\/nav>/.test(head), 'help links in a nav');
  var menu = head.match(/<details class="menu"[\s\S]*?<\/details>/);
  truthy(menu && /<summary[^>]*>Session/.test(menu[0]) && /id="btnExport"/.test(menu[0]) && /id="btnImport"/.test(menu[0]) && /id="btnClearSession"/.test(menu[0]), 'Export, Import and Clear sit in the Session menu');
  truthy(/id="btnClearSession"[^>]*class="[^"]*danger/.test(menu[0]) || /class="[^"]*danger[^"]*"[^>]*id="btnClearSession"/.test(menu[0]), 'Clear session is marked as the destructive item');
  falsy(/id="btnPrint"[^>]*class="primary"|class="primary"[^>]*id="btnPrint"/.test(head), 'Print report is not the primary button');
  truthy(/id="importFile"/.test(head) && /id="appSub"/.test(html), 'the file input and the subtitle remain');
  truthy(/menu[\s\S]{0,400}removeAttribute\('open'\)|removeAttribute\('open'\)[\s\S]{0,400}menu/.test(ui), 'ui.js closes the menu after a choice');
});

t('one primary action: in the workspace only Run forecast is filled (adding a dose or sample and Explore are secondary)', function () {
  var main = html.slice(html.indexOf('<main'), html.indexOf('</main>')).replace(/<div class="restore-bar[\s\S]*?<\/div>\s*<\/div>/, '');
  var primaries = (main.match(/<button[^>]*class="primary"[^>]*>/g) || []).map(function (b) { return (b.match(/id="([^"]+)"/) || [])[1]; });
  eq(primaries.join(','), 'btnRun', 'primary buttons in the workspace: ' + primaries.join(','));
  ['doseAdd', 'obsAdd', 'iv-run'].forEach(function (id) { truthy(new RegExp('<button[^>]*id="' + id + '"[^>]*class="secondary"|<button[^>]*class="secondary"[^>]*id="' + id + '"').test(main), id + ' is secondary'); });
});

t('drug cards: five cards from the specs in the owner’s order (name, analyte and model), the select stays as the hidden source of truth with the same five options, and the active card is pressed', function () {
  var IDS = ['mpa', 'mpaped', 'tac', 'tacped', 'evr'];
  IDS.forEach(function (id) { var c = M.spec(id).card; truthy(c && c.name && c.sub, id + ' has card texts'); });
  eq((html.match(/<select id="pt-drug"[\s\S]*?<\/select>/)[0].match(/<option value="([a-z]+)"/g) || []).map(function (o) { return o.replace(/<option value="|"/g, ''); }).join(','), IDS.join(','), 'the hidden select has the five options in the cards’ order');
  var sel = html.match(/<select id="pt-drug"[^>]*>/)[0];
  truthy(/class="sr-only"/.test(sel) && /aria-hidden="true"/.test(sel) && /tabindex="-1"/.test(sel), 'the select is hidden from sight and from assistive technology');
  truthy(/id="drugCards"/.test(html) && /role="group"/.test(html.match(/<div[^>]*id="drugCards"[^>]*>/)[0]), 'the cards container is a labelled group');
  var U = ECU.ui;
  var out = U.drugCardsHtml('evr');
  eq((out.match(/<button/g) || []).length, 5, 'five cards');
  eq((out.match(/data-drug="([a-z]+)"/g) || []).map(function (o) { return o.replace(/data-drug="|"/g, ''); }).join(','), IDS.join(','), 'the cards come in the owner’s order');
  truthy(/data-drug="evr"[^>]*aria-pressed="true"/.test(out) && IDS.filter(function (i) { return i !== 'evr'; }).every(function (i) { return new RegExp('data-drug="' + i + '"[^>]*aria-pressed="false"').test(out); }), 'only the selected drug is pressed');
  IDS.forEach(function (id) { truthy(out.indexOf(M.spec(id).card.name) >= 0 && out.indexOf(M.spec(id).card.sub.replace(/&/g, '&amp;')) >= 0, id + ' text in the card'); });
  truthy(/\.drug-card\[aria-pressed="true"\]/.test(css) && /\.sr-only \{/.test(css), 'styles for the pressed card and the hidden select');
  truthy(/drugCards[\s\S]{0,600}dispatchEvent\(new Event\('change'/.test(ui), 'a card press goes through the select’s own change handler (confirm, reset, switch)');
});

t('result tiles: every drug shows large median and interval, the corrected value beside it, a range bar and plain-wording probabilities (the same sentence as the report)', function () {
  var U = ECU.ui, R = ECU.report;
  truthy(typeof U.resultTileHtml === 'function' && typeof R.probLine === 'function', 'the tile builder and the shared sentence exist');
  var fit = { hctReport: 0.30, hctRef: 0.38 };
  var spec = M.spec('evr');
  var stats = { median: 3.66, p5: 2.54, p95: 5.27, pInWindow: 0.8143, pAboveLower: 0.81, pBelowUpper: 1 }, corr = { median: 4.38, p5: 3.04, p95: 6.31, pInWindow: 0.95 };
  var m = { key: 'trough', what: 'trough', title: 'Steady-state trough', unit: 'µg/L', stats: stats, corr: corr, win: { lo: 3, hi: 8 }, fit: fit, spec: spec };
  var line = R.probLine(m, fit, spec);
  truthy(/<b>81% chance<\/b> the trough is within the window 3\.00 to 8\.00 µg\/L \(corrected: 95%\)\. Chance above 3\.00: 81%\. Chance below 8\.00: 100%\./.test(line), 'sentence: ' + line);
  var tile = U.resultTileHtml(m);
  truthy(/class="tile"/.test(tile) && />3\.66</.test(tile) && /2\.54 to 5\.27/.test(tile), 'median and interval');
  truthy(/Corrected to haematocrit 0\.38/.test(tile) && />4\.38</.test(tile) && /3\.04 to 6\.31/.test(tile), 'corrected beside the measured value');
  truthy(/class="rb-track"/.test(tile) && /class="rb-win"/.test(tile) && /class="rb-int"/.test(tile) && /class="rb-cint"/.test(tile), 'range bar with the window and both intervals');
  truthy(/In the window[\s\S]*81%[\s\S]*Above the lower bound[\s\S]*Below the upper bound/.test(tile), 'plain labels for the three probabilities');
  falsy(/P\(within window\)|P\(above lower\)|P\(below upper\)/.test(tile), 'no P(...) symbols');
  var noWin = U.resultTileHtml(Object.assign({}, m, { key: 'auc', what: 'AUC', win: null, unit: 'µg·h/L' }));
  truthy(/No AUC window is set, so no probabilities are shown\. The consensus gives no AUC target for everolimus\./.test(noWin) && !/class="rb-win"/.test(noWin) && !/In the window/.test(noWin), 'no window: said plainly, no probabilities');
  var mpa = U.resultTileHtml({ key: 'trough', what: 'trough', title: 'Predicted trough', unit: 'mg/L', stats: stats, corr: null, win: null, informational: true, fit: { hctReport: null, hctRef: null }, spec: M.spec('mpa') });
  truthy(/Informational: the app has no trough target/.test(mpa) && !/Corrected to/.test(mpa) && !/class="rb-cint"/.test(mpa), 'MPA trough: informational, no corrected value');
  var same = U.resultTileHtml(Object.assign({}, m, { fit: { hctReport: 0.38, hctRef: 0.38 } }));
  truthy(/Corrected to haematocrit 0\.38: same as measured/.test(same), 'same haematocrit: said once');
});

t('results card: answer first — actions, status, tiles and notes come before the chart; the lead tile follows the drug', function () {
  var card = html.slice(html.indexOf('id="forecastCard"') > 0 ? html.indexOf('id="forecastCard"') : html.indexOf('3 · FORECAST'), html.indexOf('4 · DOSE EXPLORER'));
  var order = ['id="btnRun"', 'id="fitStatus"', 'class="tiles"', 'id="advisoryBlock"', 'id="chartBox"'].map(function (k) { var i = card.indexOf(k); truthy(i >= 0, 'missing ' + k); return i; });
  for (var i = 1; i < order.length; i++) truthy(order[i] > order[i - 1], 'order at ' + i);
  truthy(/class="tiles"[\s\S]*id="aucBlock"[\s\S]*id="troughBlock"/.test(card), 'both result blocks sit in the tiles container');
  truthy(/\.tiles \{[^}]*display: grid/.test(css) && /\.tile \{/.test(css) && /\.rb-track \{/.test(css), 'tile styles');
  truthy(/report\.lead === 'trough'|rp\.lead === 'trough'|\.lead === 'trough'/.test(ui) && /style\.order/.test(ui), 'ui.js orders the tiles by spec.report.lead');
});

t('workspace: on wide screens the inputs (cards 1 and 2) sit left and the results (cards 3 and 4) right in a 1200 px column shared with the header; on narrow screens everything stacks in the original order', function () {
  var main = html.slice(html.indexOf('<main'), html.indexOf('</main>'));
  var order = ['class="workspace"', 'class="col-in"', 'id="patientCard"', '2 · DOSING', 'class="col-out"', 'id="resultsCard"', 'id="regimenCard"'].map(function (k) { var i = main.indexOf(k); truthy(i >= 0, 'missing ' + k); return i; });
  for (var i = 1; i < order.length; i++) truthy(order[i] > order[i - 1], 'DOM order at ' + i + ' (cards stay in 1, 2, 3, 4 order for keyboard and screen-reader users)');
  eq((main.match(/<div class="workspace">/g) || []).length, 1);
  truthy(/--col:\s*1200px/.test(css), 'one column width for header, content and footer');
  truthy(/\.workspace \{[^}]*display: grid/.test(css) && /@media \(min-width: 1100px\) \{[^}]*\.workspace \{[^}]*grid-template-columns: minmax\(0, 440px\) minmax\(0, 1fr\)/.test(css.replace(/\n/g, ' ')), 'two columns from 1100 px, one below');
  truthy(/\.col-out \{[^}]*min-width: 0/.test(css), 'the results column may shrink (no horizontal overflow)');
});

t('stepper: the four steps are links to their cards (a guide you can press), every target exists, and the page scrolls smoothly unless the user asks for less motion', function () {
  var st = html.slice(html.indexOf('id="stepper"'), html.indexOf('id="stepperDismiss"'));
  var links = st.match(/<a class="step" href="#([A-Za-z]+)"[^>]*>/g) || [];
  eq(links.length, 4, 'four step links');
  links.forEach(function (l) { var id = l.match(/href="#([A-Za-z]+)"/)[1]; truthy(html.indexOf('id="' + id + '"') > 0, 'target #' + id + ' exists'); });
  eq(links.map(function (l) { return l.match(/href="#([A-Za-z]+)"/)[1]; }).join(','), 'patientCard,chartCard,resultsCard,regimenCard', 'steps 1 to 4 go to cards 1 to 4');
  truthy(/scroll-behavior:\s*smooth/.test(css) && /prefers-reduced-motion[\s\S]{0,200}scroll-behavior:\s*auto/.test(css), 'smooth scroll, off for reduced motion');
});

t('phone: numeric fields open the decimal keypad, and the Run bar stays at the bottom of the screen inside the safe area', function () {
  var nums = html.match(/<input[^>]*type="number"[^>]*>/g) || [];
  truthy(nums.length >= 10, 'number inputs found: ' + nums.length);
  nums.forEach(function (n) { truthy(/inputmode="decimal"/.test(n), 'inputmode on ' + (n.match(/id="([^"]+)"/) || [])[1]); });
  truthy(/'<input type="' \+ \(c\.units[\s\S]{0,400}inputmode="decimal"/.test(ui) || /inputmode=\\?"decimal\\?"/.test(ui), 'generated covariate fields carry it too');
  truthy(/id="runBar"/.test(html), 'the run row has an id');
  var mob = css.slice(css.indexOf('/* ---------- phone')).replace(/\n/g, ' ');
  truthy(/#runBar \{[^}]*position: sticky[^}]*bottom: 0/.test(mob) && /env\(safe-area-inset-bottom/.test(mob), 'sticky run bar with the safe-area inset');
});

t('hidden select: the sr-only utility beats the field and phone width rules, so the select can never widen the page', function () {
  var m = css.match(/\.sr-only \{([^}]*)\}/);
  truthy(m, 'rule exists');
  ['width: 1px', 'height: 1px', 'min-height: 0', 'max-width: 1px', 'padding: 0', 'position: absolute'].forEach(function (d) {
    truthy(new RegExp('(^|[\\s;])' + d.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*!important').test(m[1]), d + ' is !important');
  });
});

t('no "new in this version" banner at the top of the page', function () {
  falsy(/modelIntegratedNote|nephrotdm-note-v/.test(html + ui), 'the banner and its storage key are gone');
});

t('phone header: the help links share one compact row', function () {
  var mob = css.slice(css.indexOf('/* ---------- phone header')).replace(/\n/g, ' ');
  truthy(/\.app \.nav button \{[^}]*padding: 0 8px/.test(mob) && /\.app \.nav button \{[^}]*font-size: 13\.5px/.test(mob) && /\.app \.nav \{[^}]*flex-wrap: nowrap/.test(mob), 'compact nav on phones');
});

t('fields fit their text: inputs and selects fill their container (no fixed 140/160 px widths), containers are wide enough for the longest value, date fields get room for date, time and the calendar button', function () {
  var flat = css.replace(/\n/g, ' ');
  truthy(/\.sessionbar input, \.sessionbar select \{[^}]*width: 100%/.test(flat) && !/\.sessionbar input, \.sessionbar select \{[^}]*width: 160px/.test(flat), 'patient card fields fill their container');
  truthy(/\.row3 input, \.row3 select \{[^}]*width: 100%/.test(flat) && !/\.row3 input \{ width: 140px/.test(flat), 'dosing rows too');
  var basis = function (re) { var m = flat.match(re); truthy(m, 'rule ' + re); return +m[1]; };
  truthy(basis(/\.sessionbar \.sess-field \{[^}]*flex: 1 1 (\d+)px/) >= 270, 'patient card selects: wide enough for the longest option (258 px measured)');
  truthy(basis(/\.sessionbar \.sess-field\.sf-num \{[^}]*flex: 1 1 (\d+)px/) >= 130, 'numeric fields stay compact');
  truthy(basis(/\.row3 > div\.f-dt \{[^}]*flex: 1 1 (\d+)px/) >= 230, 'date-time fields: date, time and calendar button (192 px measured)');
  truthy(basis(/\.row3 > div \{[^}]*flex: 1 1 (\d+)px/) >= 150, 'other dosing fields');
  truthy(/#iv-interval \{[^}]*min-width: (1[9]\d|2\d\d)px/.test(flat), 'the interval select');
  truthy(basis(/\.row3 > div\.f-sel \{[^}]*flex: 1 1 (\d+)px/) >= 220, 'the sample-offset select (longest option measured at 204 px)');
  truthy(/<div class="f-sel"><label class="f" for="obs-offset"/.test(html), 'obs-offset sits in an f-sel container');
  var rec = html.match(/<select id="pt-recency"[\s\S]*?<\/select>/)[0].match(/<option[^>]*>([^<]*)<\/option>/g).map(function (o) { return o.replace(/<[^>]+>/g, '').length; });
  truthy(Math.max.apply(null, rec) <= 36, 'the recency options are short enough for the narrow column: ' + rec.join(','));
  ['dose-dt', 'ss-anchor', 'obs-dt'].forEach(function (id) { truthy(new RegExp('<div class="f-dt"><label class="f" for="' + id + '"').test(html), id + ' sits in an f-dt container'); });
  truthy(/class="sess-field sf-num"/.test(html) && /sf-wide/.test(ui) && /sf-num/.test(ui), 'numeric fields are marked, generated ones too');
  truthy(fs.existsSync(path.join(root, 'tools', 'audit_fields.js')) && /audit_fields/.test(read('README.md')), 'the field-fit audit tool exists and is documented');
});

t('select labels: a select cannot wrap, so every option label (in the page and in the specs) is at most 28 characters, which fits the 270 px a 320 px phone leaves', function () {
  var long = [];
  (html.match(/<select[\s\S]*?<\/select>/g) || []).forEach(function (sel) {
    (sel.match(/<option[^>]*>([^<]*)<\/option>/g) || []).forEach(function (o) { var t = o.replace(/<[^>]+>/g, ''); if (t.length > 28) long.push(t); });
  });
  ['mpa', 'mpaped', 'tac', 'tacped', 'evr'].forEach(function (id) {
    M.covariateFields(id).forEach(function (c) { (c.options || []).forEach(function (o) { if (o.label.length > 28) long.push(id + ':' + o.label); }); });
    (M.spec(id).doseForms || []).forEach(function (o) { if (o.label.length > 28) long.push(id + ':' + o.label); });   // the per-dose formulation select
  });
  eq(long.join(' | '), '', 'option labels over 28 characters');
  truthy(/value="ecmps">EC-MPS \(enteric-coated\)</.test(html) && /value="off">Off \(all samples equal\)</.test(html), 'the shortened labels');
  truthy(/Off \\\(\[\^\)\]\*\\\)/.test(read('src/report.js')), 'the report still prints "Off" without the parenthesis, whatever it says');
});

t('pediatric drugs: scripts, texts and workers are wired, the formulation selects and the warning line exist, and nothing else in the page names a drug', function () {
  ['src/tacped.js', 'src/mpaped.js', 'src/texts_tacped.js', 'src/texts_mpaped.js'].forEach(function (f) {
    truthy(html.indexOf('<script src="' + f + '"></script>') > 0, f + ' is in the page');
    truthy(build.indexOf("'" + f + "'") > 0, f + ' is in the build');
  });
  var order = ['src/model.js', 'src/tacrolimus.js', 'src/everolimus.js', 'src/tacped.js', 'src/mpaped.js', 'src/bayes.js', 'src/parallel.js', 'src/texts_evr.js', 'src/texts_tacped.js', 'src/texts_mpaped.js', 'src/ui.js'].map(function (f) { return html.indexOf('<script src="' + f + '"></script>'); });
  truthy(order.every(function (v, i) { return v > 0 && (i === 0 || v > order[i - 1]); }), 'the specs load before bayes.js and the texts before ui.js');
  var par = read('src/parallel.js').match(/var SOURCES = \[([^\]]*)\]/)[1];
  truthy(/tacped\.js/.test(par) && /mpaped\.js/.test(par) && par.indexOf('tacped.js') < par.indexOf('bayes.js'), 'the worker pool loads both new engines before bayes.js');
  ['doseFormWrap', 'dose-form', 'ssFormWrap', 'ss-form', 'scopeWarn'].forEach(function (id) { truthy(new RegExp('id="' + id + '"').test(html), id + ' exists'); });
  truthy(/id="scopeWarn"[^>]*role="status"/.test(html), 'the warning line is announced politely');
  truthy(/<div id="doseFormWrap" style="display:none">/.test(html) && /<div id="ssFormWrap" style="display:none">/.test(html), 'the formulation selects are hidden for every other drug');
  falsy(/'tacped'|'mpaped'|"tacped"|"mpaped"/.test(ui), 'ui.js names no drug id: everything comes from the specs');
  falsy(/tacped|mpaped/.test(read('src/report.js') + read('src/diagnostics.js') + read('src/chart.js')), 'neither do the report, the diagnostics or the chart');
});

t('clear all: the link sits in the heading row, right-aligned, and wraps below the hint instead of floating over the next box', function () {
  var h2 = html.match(/<h2 class="sub-h"[^>]*>Measured concentrations[\s\S]*?<\/h2>|<h2 class="sub-h"[^>]*><span>Measured concentrations[\s\S]*?<\/h2>/)[0];
  truthy(/display:flex;flex-wrap:wrap/.test(h2) && /id="tplClear"[^>]*margin-left:auto/.test(h2), 'a wrapping flex row with the link pushed right');
  falsy(/float:\s*right/.test(h2), 'no float: a float drops under a long hint and the next box wraps around it');
  truthy(/id="sampleHint"/.test(h2) && /id="tplClear"/.test(h2), 'the ids the code binds are kept');
});

h.runAll().then(function (ok) { if (!ok) process.exit(1); }).catch(function (e) { console.error(e); process.exit(1); });
