/* Browser audit: does the text shown in every visible field fit its box?   Paste into the console of the built page, or run through the browser tool.
 *   window.auditFields()  ->  [{ id, kind, text, need, have }]  (empty list = every field shows all of its text)
 * Fields are measured with a value in them (datetime-local gets a full date and time), the way a user sees them. Selects are measured on the
 * longest option's text plus the arrow; inputs on their value, or their placeholder when empty. A field that is too narrow clips its text
 * (the "Latest dose on" time was cut off before this audit existed). Run it at several widths and for every drug and schedule mode. */
(function () {
  'use strict';
  var cv = document.createElement('canvas').getContext('2d');
  function measure(el, text) {
    var cs = getComputedStyle(el);
    cv.font = cs.fontStyle + ' ' + cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
    return cv.measureText(text).width;
  }
  window.auditFields = function () {
    var bad = [], els = document.querySelectorAll('input, select, textarea');
    Array.prototype.forEach.call(els, function (el) {
      var type = (el.getAttribute('type') || el.tagName).toLowerCase();
      if (['hidden', 'checkbox', 'radio', 'file', 'button', 'submit'].indexOf(type) >= 0) return;
      if (el.classList.contains('sr-only') || el.offsetParent === null) return;
      var r = el.getBoundingClientRect(); if (r.width === 0) return;
      var cs = getComputedStyle(el), pad = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight) + parseFloat(cs.borderLeftWidth) + parseFloat(cs.borderRightWidth);
      var text, extra = 0;
      if (el.tagName === 'SELECT') {   // the longest option, because the user can choose any of them
        text = ''; Array.prototype.forEach.call(el.options, function (o) { if (measure(el, o.text) > measure(el, text)) text = o.text; }); extra = 20;   // the arrow
      }
      else if (type === 'datetime-local') { text = '30-12-2026, 12:30 PM'; extra = 34; }   // widest rendering (12-hour locale): date, time, AM/PM and the calendar button
      else if (type === 'date') { text = '30-12-2026'; extra = 34; }
      else if (type === 'time') { text = '12:30 PM'; extra = 34; }
      else if (type === 'number') { text = el.value || el.placeholder || ''; extra = 24; }   // the spinner
      else text = el.value || el.placeholder || '';
      if (!text) return;
      var need = Math.ceil(measure(el, text) + pad + extra), have = Math.floor(r.width);
      if (need > have + 2) bad.push({ id: el.id || el.name || el.className, kind: type, text: text, need: need, have: have });
      else if (r.height < 36) bad.push({ id: el.id || el.name || el.className, kind: type, text: 'too short to tap', need: 36, have: Math.floor(r.height) });
    });
    if (document.documentElement.scrollWidth > window.innerWidth + 1) bad.push({ id: 'page', kind: 'layout', text: 'horizontal scroll', need: document.documentElement.scrollWidth, have: window.innerWidth });
    return bad;
  };
})();
