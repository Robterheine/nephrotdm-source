/* =========================================================================
 * NephroTDM visit counter: one page view, counted as a 1-pixel image request to GoatCounter (cookie-free, no script from a third party runs
 * in this page). It fires only on the published site (https://robterheine.github.io); a downloaded copy opened from disk, on localhost or
 * on any other host sends nothing and shows nothing. What is sent: the page ("/") and the site the visitor came from (origin only).
 * Never sent: anything typed into the app, the URL's query or hash, cookies. Do Not Track and Global Privacy Control switch it off.
 * ========================================================================= */
(function (root) {
  'use strict';
  var ECU = root.ECU = root.ECU || {};
  var COUNTER = 'https://nephrotdm.goatcounter.com/count', HOST = 'robterheine.github.io';

  function url(loc, nav, doc) {
    if (!loc || loc.protocol !== 'https:' || loc.hostname !== HOST) return null;
    if (nav && (nav.doNotTrack === '1' || nav.globalPrivacyControl === true)) return null;
    var ref = '';
    try { if (doc && doc.referrer) ref = new URL(doc.referrer).origin; } catch (e) { ref = ''; }
    return COUNTER + '?p=' + encodeURIComponent('/') + (ref && ref !== 'null' ? '&r=' + encodeURIComponent(ref) : '');
  }

  function ping(win) {
    try {
      var u = url(win.location, win.navigator, win.document);
      if (!u || typeof win.Image !== 'function') return false;
      var img = new win.Image();
      img.onerror = function () {};   // blocked by an ad blocker or offline: nothing to show
      img.src = u;
      return true;
    } catch (e) { return false; }
  }

  ECU.visits = { url: url, ping: ping };
})(typeof window !== 'undefined' ? window : globalThis);
