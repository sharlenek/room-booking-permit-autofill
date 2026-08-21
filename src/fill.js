/* Content script. Scans the page, matches fields against the selected event
   and the organization record, and fills only the empty ones.
   It never clicks a button and never submits a form. */
var UFRA_FILL = (function (S, M) {

  var HIGHLIGHT_CLASS = 'ufra-review';
  var STYLE_ID = 'ufra-style';

  var SKIP_INPUT_TYPES = ['hidden', 'submit', 'button', 'reset', 'image',
    'file', 'password', 'search'];

  /* ---------- label discovery ---------- */

  function textOf(node) {
    if (!node) return '';
    return (node.innerText || node.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function labelCandidates(el) {
    var out = [];
    var doc = el.ownerDocument;

    var labelledBy = el.getAttribute('aria-labelledby');
    if (labelledBy) {
      labelledBy.split(/\s+/).forEach(function (id) {
        out.push(textOf(doc.getElementById(id)));
      });
    }

    out.push(el.getAttribute('aria-label'));

    if (el.id) {
      Array.prototype.forEach.call(
        doc.querySelectorAll('label[for="' + cssEscape(el.id) + '"]'),
        function (l) { out.push(textOf(l)); }
      );
    }

    var wrapping = el.closest('label');
    if (wrapping) out.push(textOf(wrapping));

    // EMS Cloud and most form kits wrap each control in a labelled group.
    var group = el.closest('.form-group, .field, .form-field, .control-group, fieldset, li, tr, .row');
    if (group) {
      var own = group.querySelector('label, legend, .control-label, .field-label, th');
      if (own && !own.contains(el)) out.push(textOf(own));
    }

    // A bare text node or heading immediately before the control.
    var prev = el.previousElementSibling;
    if (prev && !prev.querySelector('input, select, textarea')) out.push(textOf(prev));

    out.push(el.getAttribute('placeholder'));
    out.push(humanize(el.getAttribute('name')));
    out.push(humanize(el.id));

    return out
      .map(function (t) { return (t || '').replace(/\s+/g, ' ').trim(); })
      .filter(function (t) { return t && t.length < 120; });
  }

  function cssEscape(v) {
    if (window.CSS && CSS.escape) return CSS.escape(v);
    return String(v).replace(/["\\]/g, '\\$&');
  }

  function radiosNamed(doc, name) {
    return Array.prototype.slice.call(
      doc.querySelectorAll('input[type="radio"][name="' + cssEscape(name) + '"]')
    );
  }

  function humanize(s) {
    if (!s) return '';
    return String(s)
      .replace(/[_\-.]+/g, ' ')
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /* ---------- eligibility ---------- */

  function isVisible(el) {
    if (!el.getClientRects().length) return false;
    var cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none';
  }

  function isFillable(el) {
    if (el.disabled || el.readOnly) return false;
    if (el.tagName === 'INPUT' && SKIP_INPUT_TYPES.indexOf(el.type) !== -1) return false;
    if (el.closest('[aria-hidden="true"]')) return false;
    return isVisible(el);
  }

  function isEmpty(el) {
    if (el.tagName === 'SELECT') {
      var opt = el.selectedOptions && el.selectedOptions[0];
      if (!opt) return true;
      // A "-- Select --" style first option counts as empty.
      return !opt.value || opt.index === 0 && /select|choose|none|^-+$/i.test(opt.text);
    }
    if (el.type === 'checkbox' || el.type === 'radio') return !el.checked;
    return !String(el.value || '').trim();
  }

  /* ---------- value coercion ---------- */

  var MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july',
    'august', 'september', 'october', 'november', 'december'];

  function parseDate(v) {
    var s = String(v).trim();
    var m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (m) return { y: +m[1], m: +m[2], d: +m[3] };

    m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
    if (m) {
      var y = +m[3];
      if (y < 100) y += 2000;
      return { y: y, m: +m[1], d: +m[2] };   // US ordering, as UF sheets use
    }

    m = s.match(/^([a-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})$/i);
    if (m) {
      var idx = MONTHS.findIndex(function (name) {
        return name.indexOf(m[1].toLowerCase()) === 0;
      });
      if (idx >= 0) return { y: +m[3], m: idx + 1, d: +m[2] };
    }
    return null;
  }

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function toISODate(v) {
    var d = parseDate(v);
    return d ? d.y + '-' + pad(d.m) + '-' + pad(d.d) : null;
  }

  function parseTime(v) {
    var s = String(v).trim().toLowerCase().replace(/\./g, '');
    var m = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
    if (!m) return null;
    var h = +m[1];
    var min = m[2] ? +m[2] : 0;
    if (h > 23 || min > 59) return null;
    if (m[3] === 'pm' && h < 12) h += 12;
    if (m[3] === 'am' && h === 12) h = 0;
    return { h: h, min: min };
  }

  function to24h(v) {
    var t = parseTime(v);
    return t ? pad(t.h) + ':' + pad(t.min) : null;
  }

  function coerce(el, value) {
    var v = String(value).trim();
    if (el.tagName === 'INPUT') {
      if (el.type === 'date') return toISODate(v);
      if (el.type === 'time') return to24h(v);
      if (el.type === 'number') {
        var num = v.replace(/[^0-9.\-]/g, '');
        return num === '' ? null : num;
      }
      if (el.type === 'email' && v.indexOf('@') === -1) return null;
    }
    if (el.maxLength > 0 && v.length > el.maxLength) v = v.slice(0, el.maxLength);
    return v;
  }

  var AFFIRMATIVE = /^(y|yes|true|1|x|checked|required|needed)$/i;
  var NEGATIVE = /^(n|no|false|0|none|n\/a|not needed)$/i;

  /* ---------- writing ---------- */

  function setNativeValue(el, value) {
    var proto = el.tagName === 'TEXTAREA'
      ? window.HTMLTextAreaElement.prototype
      : (el.tagName === 'SELECT' ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype);
    var desc = Object.getOwnPropertyDescriptor(proto, 'value');
    if (desc && desc.set) desc.set.call(el, value);
    else el.value = value;
  }

  function notify(el) {
    ['input', 'change', 'blur'].forEach(function (type) {
      el.dispatchEvent(new Event(type, { bubbles: true }));
    });
  }

  function fillSelect(el, value) {
    var opts = Array.prototype.slice.call(el.options);
    var best = null;
    var bestScore = 0;
    opts.forEach(function (o, i) {
      if (i === 0 && !o.value) return;
      var s = Math.max(
        M.scorePhrase(value, o.text),
        o.value ? M.scorePhrase(value, o.value) : 0
      );
      if (s > bestScore) { bestScore = s; best = o; }
    });
    if (!best || bestScore < M.UNCERTAIN) return null;
    setNativeValue(el, best.value);
    notify(el);
    return { written: best.text, exact: bestScore >= M.CONFIDENT };
  }

  function fillCheckbox(el, value) {
    // Only ever tick a box, never untick one, and only on a clear yes.
    if (!AFFIRMATIVE.test(String(value).trim())) return null;
    el.checked = true;
    notify(el);
    return { written: 'checked', exact: false };
  }

  function fillRadioGroup(el, value) {
    var name = el.name;
    if (!name) return null;
    var group = radiosNamed(el.ownerDocument, name).filter(isFillable);
    if (!group.length) return null;

    var best = null;
    var bestScore = 0;
    group.forEach(function (r) {
      var texts = labelCandidates(r).concat([r.value]);
      texts.forEach(function (t) {
        var s = M.scorePhrase(value, t);
        if (s > bestScore) { bestScore = s; best = r; }
      });
    });
    if (!best || bestScore < M.UNCERTAIN) return null;
    best.checked = true;
    notify(best);
    return { written: textOf(best.closest('label')) || best.value, exact: bestScore >= M.CONFIDENT, element: best };
  }

  /* ---------- highlighting ---------- */

  function ensureStyle(doc) {
    if (doc.getElementById(STYLE_ID)) return;
    var style = doc.createElement('style');
    style.id = STYLE_ID;
    style.textContent =
      '.' + HIGHLIGHT_CLASS + '{outline:2px solid #FA4616 !important;' +
      'outline-offset:1px;background-color:rgba(250,70,22,.07) !important;}';
    (doc.head || doc.documentElement).appendChild(style);
  }

  function highlight(el, note) {
    ensureStyle(el.ownerDocument);
    el.classList.add(HIGHLIGHT_CLASS);
    el.title = 'UF Autofill — please review: ' + note;
  }

  function clearHighlights() {
    Array.prototype.forEach.call(
      document.querySelectorAll('.' + HIGHLIGHT_CLASS),
      function (el) { el.classList.remove(HIGHLIGHT_CLASS); el.removeAttribute('title'); }
    );
  }

  /* ---------- main pass ---------- */

  function run(fields) {
    clearHighlights();

    var controls = Array.prototype.slice.call(
      document.querySelectorAll('input, select, textarea')
    );

    var report = { filled: 0, review: 0, skipped: 0, prefilled: 0, details: [] };
    var handledRadioGroups = {};

    controls.forEach(function (el) {
      if (!isFillable(el)) return;

      if (el.type === 'radio') {
        if (handledRadioGroups[el.name]) return;
      }

      if (!isEmpty(el) && el.type !== 'radio') { report.prefilled++; return; }
      if (el.type === 'radio') {
        var anyChecked = radiosNamed(document, el.name || '').some(function (r) { return r.checked; });
        if (anyChecked) { report.prefilled++; handledRadioGroups[el.name] = true; return; }
      }

      var candidates = labelCandidates(el);
      var match = null;
      for (var i = 0; i < candidates.length && !match; i++) {
        match = M.findValue(candidates[i], fields);
      }
      var labelUsed = candidates[0] || '(unlabelled)';

      if (!match) {
        report.skipped++;
        report.details.push({ label: labelUsed, status: 'skipped' });
        return;
      }

      var result;
      if (el.tagName === 'SELECT') {
        result = fillSelect(el, match.value);
      } else if (el.type === 'checkbox') {
        result = fillCheckbox(el, match.value);
      } else if (el.type === 'radio') {
        handledRadioGroups[el.name] = true;
        result = fillRadioGroup(el, match.value);
        if (result && result.element) el = result.element;
      } else {
        var v = coerce(el, match.value);
        if (v === null || v === '') {
          result = null;
        } else {
          setNativeValue(el, v);
          notify(el);
          result = { written: v, exact: true };
        }
      }

      if (!result) {
        report.skipped++;
        report.details.push({
          label: labelUsed, status: 'skipped',
          note: 'no usable value from "' + match.label + '"'
        });
        return;
      }

      var needsReview = match.confidence === 'uncertain' || !result.exact;
      if (needsReview) {
        var note = 'matched sheet column "' + match.label + '"' +
          (match.alternative ? ' (could also be "' + match.alternative + '")' : '');
        highlight(el, note);
        report.review++;
        report.details.push({ label: labelUsed, status: 'review', from: match.label, value: result.written });
      } else {
        report.filled++;
        report.details.push({ label: labelUsed, status: 'filled', from: match.label, value: result.written });
      }
    });

    return report;
  }

  return { run: run, clearHighlights: clearHighlights, labelCandidates: labelCandidates,
           toISODate: toISODate, to24h: to24h, parseDate: parseDate };
})(typeof UFRA_SCHEMA !== 'undefined' ? UFRA_SCHEMA : require('./schema.js'),
   typeof UFRA_MATCH !== 'undefined' ? UFRA_MATCH : require('./matcher.js'));

if (typeof module !== 'undefined') module.exports = UFRA_FILL;
