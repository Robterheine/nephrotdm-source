/* =========================================================================
 * Single source of truth for the NephroTDM application version.
 *
 * Bump the string below whenever the app changes. It is consumed by
 * src/ui.js (browser title, header, footer, About dialog, session export)
 * and checked against package.json by build.mjs (and by the version test in tests/run_all.js),
 * so the two can never silently drift apart.
 * ========================================================================= */
(function (root) {
  'use strict';
  var ECU = root.ECU = root.ECU || {};
  ECU.VERSION = '1.5.2';
})(typeof window !== 'undefined' ? window : globalThis);
