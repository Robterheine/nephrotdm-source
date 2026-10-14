/* =========================================================================
 * NephroTDM: the visit counter (src/visits.js). Run: node tests/test_visits.js (part of `npm test`)
 * One page view is counted, as a 1-pixel image request, only on the published site. Nothing the user enters, no URL query or hash and no
 * cookie is ever part of it, and a downloaded copy (file://, localhost, any other host) sends nothing and shows no error.
 * ========================================================================= */
'use strict';
var fs = require('fs'), path = require('path');
var h = require('./harness.js');
var t = h.t, eq = h.eq, truthy = h.truthy, falsy = h.falsy;
require('../src/version.js');
var V = (function () { try { require('../src/visits.js'); } catch (e) { return null; } return globalThis.ECU.visits; })();
var LIVE = { protocol: 'https:', hostname: 'robterheine.github.io', pathname: '/nephrotdm/', search: '?case=patient-1234', hash: '#note=secret' };

t('visits: the module exists and exposes url() and ping()', function () {
  truthy(V && typeof V.url === 'function' && typeof V.ping === 'function', 'src/visits.js missing or incomplete');
});
t('visits: on the published site the request goes to the counter and carries only the page and the referring site', function () {
  var u = V.url(LIVE, {}, { referrer: 'https://www.example.org/some/page?q=1' });
  truthy(/^https:\/\/nephrotdm\.goatcounter\.com\/count\?p=%2F&r=https%3A%2F%2Fwww\.example\.org$/.test(u), 'got ' + u);
  falsy(/patient|secret|1234/.test(u), 'the URL query and hash are never sent');
  eq(V.url(LIVE, {}, { referrer: '' }), 'https://nephrotdm.goatcounter.com/count?p=%2F', 'no referrer, no r');
});
t('visits: a downloaded copy or any other host sends nothing (file, http, localhost, another domain, the source repo)', function () {
  [{ protocol: 'file:', hostname: '' }, { protocol: 'http:', hostname: 'robterheine.github.io' }, { protocol: 'http:', hostname: 'localhost' },
   { protocol: 'https:', hostname: 'example.org' }, { protocol: 'https:', hostname: 'github.com' }, { protocol: 'https:', hostname: 'robterheine.github.io.evil.example' }]
    .forEach(function (l) { eq(V.url(l, {}, { referrer: '' }), null, JSON.stringify(l)); });
  eq(V.url(null, {}, {}), null, 'no location at all');
});
t('visits: Do Not Track and Global Privacy Control are respected', function () {
  eq(V.url(LIVE, { doNotTrack: '1' }, { referrer: '' }), null, 'DNT');
  eq(V.url(LIVE, { globalPrivacyControl: true }, { referrer: '' }), null, 'GPC');
});
t('visits: ping() makes one image request on the live site, none elsewhere, and never throws (blocked, no Image, broken referrer)', function () {
  var made = [];
  function Img() { made.push(this); }
  var live = { location: LIVE, navigator: {}, document: { referrer: '' }, Image: Img };
  eq(V.ping(live), true, 'live site'); eq(made.length, 1, 'one request'); truthy(/goatcounter\.com\/count/.test(made[0].src), 'to the counter');
  made[0].onerror();   // an ad blocker: the error handler does nothing, visibly or otherwise
  eq(V.ping({ location: { protocol: 'file:', hostname: '' }, navigator: {}, document: {}, Image: Img }), false, 'offline copy'); eq(made.length, 1, 'no request offline');
  eq(V.ping({ location: LIVE, navigator: {}, document: { referrer: 'not a url' } , Image: Img }), true, 'a broken referrer is dropped, not an error');
  eq(V.ping({ location: LIVE, navigator: {}, document: {} }), false, 'no Image constructor');
  eq(V.ping({ get location() { throw new Error('boom'); } }), false, 'a throwing environment');
});
t('visits: the module is built into the page, started once at init, and sets no cookie or storage', function () {
  var build = fs.readFileSync(path.join(__dirname, '..', 'build.mjs'), 'utf8'), html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  var ui = fs.readFileSync(path.join(__dirname, '..', 'src', 'ui.js'), 'utf8'), src = fs.readFileSync(path.join(__dirname, '..', 'src', 'visits.js'), 'utf8');
  truthy(/src\/visits\.js/.test(build) && /src="src\/visits\.js"/.test(html), 'registered in build.mjs and index.html');
  truthy(/ECU\.visits\.ping\(root\)/.test(ui), 'init starts it');
  falsy(/cookie|localStorage|sessionStorage|fetch\(|XMLHttpRequest|sendBeacon|createElement\('script'\)/.test(src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')), 'a page-view image and nothing else');
});
h.runAll().then(function (ok) { if (!ok) process.exit(1); }).catch(function (e) { console.error(e); process.exit(1); });
