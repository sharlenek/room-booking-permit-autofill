/* Content script. Scans the page, matches fields against the selected event
   and the organization record, and fills only the empty ones.
   It never clicks a button and never submits a form. */
var UFRA_FILL = (function (S, M, A, F) {

  var HIGHLIGHT_CLASS = 'ufra-review';
  var STYLE_ID = 'ufra-style';

  var SKIP_INPUT_TYPES = ['hidden', 'submit', 'button', 'reset', 'image',
    'file', 'password', 'search'];

  /* ---------- label discovery ---------- */

  function textOf(node) {
    if (!node) return '';
    return (node.innerText || node.textContent || '').replace(/\s+/g, ' ').trim();
  }

  /* A radio button's own label is its option ("Yes"); the question is the
     text around the whole group: just before it, or inside it once the
     options' own labels are taken out. */
  function radioGroupPrompt(el) {
    var group = radiosNamed(el.ownerDocument, el.name || '');
    if (group.length < 2) return '';
    var box = group[0].parentElement;
    while (box && !group.every(function (r) { return box.contains(r); })) box = box.parentElement;
    if (!box) return '';
    var own = textOf(box);
    group.forEach(function (r) {
      var l = r.closest('label') || (r.id && r.ownerDocument.querySelector('label[for="' + cssEscape(r.id) + '"]'));
      if (l) own = own.replace(textOf(l), ' ');
    });
    own = own.replace(/\s+/g, ' ').trim();
    if (own) return own;
    for (var n = box; n && n !== n.ownerDocument.body; n = n.parentElement) {
      var prev = n.previousElementSibling;
      if (prev && !prev.querySelector('input, select, textarea')) return textOf(prev);
      if (prev) break;
    }
    return '';
  }

  /* Text that could be the question a control asks: its label candidates
     without a radio option's own label or the name/id machinery. */
  function promptsFor(el) {
    var own = el.type === 'radio' ? optionLabel(el) : '';
    var machinery = [humanize(el.getAttribute('name')), humanize(el.id)];
    return labelCandidates(el).filter(function (t) {
      return t !== own && machinery.indexOf(t) === -1 && !/^(yes|no)$/i.test(t);
    });
  }

  function optionLabelEl(r) {
    return r.closest('label') || (r.id && r.ownerDocument.querySelector('label[for="' + cssEscape(r.id) + '"]')) || null;
  }

  function optionLabel(r) {
    var l = optionLabelEl(r);
    return l ? textOf(l).replace(/\s+/g, ' ').trim() : '';
  }

  function labelCandidates(el) {
    var out = [];
    var doc = el.ownerDocument;

    if (el.type === 'radio') out.push(radioGroupPrompt(el));

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
      // EMS prompts run to a few sentences; only a whole container's text
      // is longer than this.
      .filter(function (t) { return t && t.length < 600; });
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
    return !unfillableBecause(el);
  }

  /* Why a control cannot be filled, or '' when it can. */
  function unfillableBecause(el) {
    if (el.disabled) return 'disabled';
    if (el.readOnly) return 'read-only';
    if (el.tagName === 'INPUT' && SKIP_INPUT_TYPES.indexOf(el.type) !== -1) return 'skipped type';
    // A styled checkbox hides the real box -- off screen, behind
    // aria-hidden, or under a drawn one -- and shows its label or a drawn
    // box instead. Clicking the real box still works.
    if ((el.type === 'checkbox' || el.type === 'radio') && !isVisible(el)) {
      var l = optionLabelEl(el);
      if (l && isVisible(l)) return '';
      if (el.parentElement && isVisible(el.parentElement)) return '';
      return 'hidden, and so is its label';
    }
    if (el.closest('[aria-hidden="true"]')) return 'inside aria-hidden';
    return isVisible(el) ? '' : 'hidden';
  }

  // A "-- Select --" or "Choose one" first option counts as empty.
  // So does a blank first option, whatever value EMS gives it ("0", "-1").
  function isPlaceholder(opt) {
    return !opt.value ||
      opt.index === 0 && (!opt.text.trim() || /select|choose|none|^-+$/i.test(opt.text));
  }

  function isEmpty(el) {
    if (el.tagName === 'SELECT') {
      var opt = el.options[el.selectedIndex];
      return !opt || isPlaceholder(opt);
    }
    if (el.type === 'checkbox' || el.type === 'radio') return !el.checked;
    // EMS puts instructions in the box itself ("*Include Organization Name");
    // that text is meant to be replaced, not kept.
    return !String(el.value || '').trim() || /^\s*\*/.test(el.value);
  }

  // An option that says yes, including an agreement menu's only choice,
  // "I agree" (EMS: "I am an authorized representative of this organization").
  var YES_OPTION = /^(yes|i agree|agree|i understand|i acknowledge|i accept)\b/;

  /* A select or radio group whose only real choices are Yes and/or No,
     however worded ("Yes, I understand"). An acknowledgement may offer Yes
     alone. */
  function isYesNo(el) {
    var texts;
    if (el.tagName === 'SELECT') {
      texts = Array.prototype.slice.call(el.options)
        .filter(function (o) { return !isPlaceholder(o); })
        .map(function (o) { return o.text; });
    } else if (el.type === 'radio' && el.name) {
      texts = radiosNamed(el.ownerDocument, el.name).map(function (r) {
        return optionLabel(r) || r.value;
      });
    } else {
      return false;
    }
    var norm = texts.map(function (t) { return S.normalize(t); }).filter(Boolean);
    return norm.some(function (t) { return YES_OPTION.test(t); }) &&
      norm.every(function (t) { return YES_OPTION.test(t) || /^(no|n a|not applicable)\b/.test(t); });
  }

  /* ---------- value coercion ---------- */

  var MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july',
    'august', 'september', 'october', 'november', 'december'];

  function parseDate(v) {
    // EMS writes a weekday first: "Wed 11/04/2026".
    var s = String(v).trim().replace(/^(mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?,?\s+/i, '');
    var m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (m) return { y: +m[1], m: +m[2], d: +m[3] };

    m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
    if (m) {
      var y = +m[3];
      if (y < 100) y += 2000;
      return { y: y, m: +m[1], d: +m[2] };   // US ordering, as UF sheets use
    }

    // GatorConnect's "14 Oct 2026".
    m = s.match(/^(\d{1,2})\s+([a-z]+)\.?,?\s+(\d{4})$/i);
    if (m) {
      var mi = MONTHS.findIndex(function (name) { return name.indexOf(m[2].toLowerCase()) === 0; });
      if (mi >= 0) return { y: +m[3], m: mi + 1, d: +m[1] };
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
      // Score both ways round: an option may carry more words than the
      // value ("RU-Society of Asian Scientists & Engineers").
      var s = Math.max(
        M.scorePhrase(value, o.text),
        M.scorePhrase(o.text, value),
        o.value ? M.scorePhrase(value, o.value) : 0
      );
      if (s > bestScore) { bestScore = s; best = o; }
    });
    if (!best || bestScore < M.UNCERTAIN) return null;
    setNativeValue(el, best.value);
    notify(el);
    return { written: best.text, exact: bestScore >= M.CONFIDENT };
  }

  /* A Yes/No menu takes the option that starts with the answer, however it
     goes on ("Yes, I understand"). */
  function fillYesNoSelect(el, value) {
    var want = AFFIRMATIVE.test(String(value).trim()) ? 'yes'
      : (NEGATIVE.test(String(value).trim()) ? 'no' : null);
    if (!want) return null;
    var opt = Array.prototype.slice.call(el.options).find(function (o) {
      var t = S.normalize(o.text);
      return !isPlaceholder(o) && (want === 'yes' ? YES_OPTION.test(t) : /^no\b/.test(t));
    });
    if (!opt) return null;
    setNativeValue(el, opt.value);
    notify(el);
    return { written: opt.text, exact: true };
  }

  /* Tick a box the way a person does, so the page's own scripts (EMS uses
     Knockout, which watches clicks) see it; fall back to setting it. */
  function tick(el) {
    if (el.checked) return;
    el.click();
    if (!el.checked) { el.checked = true; notify(el); }
  }

  function fillCheckbox(el, value) {
    // Only ever tick a box, never untick one, and only on a clear yes.
    if (!AFFIRMATIVE.test(String(value).trim())) return null;
    tick(el);
    return el.checked ? { written: 'checked', exact: false } : null;
  }

  function fillRadioGroup(el, value) {
    var name = el.name;
    if (!name) return null;
    var group = radiosNamed(el.ownerDocument, name).filter(isFillable);
    if (!group.length) return null;

    var best = null;
    var bestScore = 0;
    group.forEach(function (r) {
      // The option's own label, never the group's question.
      var texts = [optionLabel(r), r.value];
      texts.forEach(function (t) {
        var s = M.scorePhrase(value, t);
        if (s > bestScore) { bestScore = s; best = r; }
      });
    });
    if (!best || bestScore < M.UNCERTAIN) return null;
    tick(best);
    return { written: optionLabel(best) || best.value, exact: bestScore >= M.CONFIDENT, element: best };
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

  /* ---------- diagnostics ---------- */

  /* What the extension sees on the page, for a bug report. Labels and option
     texts only -- never the values typed into the boxes. */
  function diagnose() {
    var lines = [location.host + location.pathname];
    Array.prototype.forEach.call(document.querySelectorAll('input, select, textarea'), function (el) {
      if (el.tagName === 'INPUT' && SKIP_INPUT_TYPES.indexOf(el.type) !== -1) return;
      var flags = [
        el.tagName.toLowerCase() + (el.type && el.tagName === 'INPUT' ? ':' + el.type : ''),
        el.id ? '#' + el.id : '',
        el.name ? 'name=' + el.name : '',
        unfillableBecause(el) ? 'NOT-FILLABLE(' + unfillableBecause(el) + ')' : '',
        isEmpty(el) ? 'empty' : 'has-value',
        // The shape of a dated or timed value, never the value itself:
        // "Aaa 99/99/9999".
        !isEmpty(el) && el.tagName === 'INPUT' && /^(text|date|time)$/.test(el.type) && /\d/.test(el.value)
          ? 'shape="' + el.value.replace(/[0-9]/g, '9').replace(/[A-Z]/g, 'A').replace(/[a-z]/g, 'a') + '"' : '',
        isYesNo(el) ? 'yes/no' : ''
      ].filter(Boolean).join(' ');
      lines.push('- ' + flags);
      if (el.tagName === 'SELECT') {
        lines.push('    options: ' + Array.prototype.slice.call(el.options, 0, 8).map(function (o) {
          return JSON.stringify(o.text.trim()) + '=' + JSON.stringify(o.value);
        }).join(', '));
      }
      labelCandidates(el).filter(function (t, i, all) { return all.indexOf(t) === i; })
        .forEach(function (t) { lines.push('    label: ' + t.slice(0, 90)); });
    });
    // Buttons and links too: GatorConnect's In-Person and "+ add another
    // date" are found by their text.
    var clickables = Array.prototype.filter.call(
      document.querySelectorAll('button, a, [role="button"], [role="radio"], [role="tab"], input[type="button"]'),
      function (el) { return isVisible(el); })
      .map(function (el) {
        var t = (el.tagName === 'INPUT' ? el.value : textOf(el)).slice(0, 40);
        return t ? el.tagName.toLowerCase() + (el.getAttribute('role') ? '[' + el.getAttribute('role') + ']' : '') +
          ' ' + JSON.stringify(t) : '';
      })
      .filter(Boolean);
    if (clickables.length) lines.push('buttons and links:', '    ' + clickables.join(', '));

    // Around visible checkboxes (EMS's Add/Remove pop-up): the pop-up the
    // extension settles on, and everything in it that might close it.
    var shownBoxes = Array.prototype.filter.call(document.querySelectorAll('input[type="checkbox"]'),
      function (c) { return isFillable(c); });
    if (shownBoxes.length && F.dialogOf) {
      var dlg = F.dialogOf(shownBoxes.slice(0, 1));
      var chain = [];
      for (var a = shownBoxes[0].parentElement; a && a !== document.body && chain.length < 8; a = a.parentElement) {
        chain.push(a.tagName.toLowerCase() + (a.id ? '#' + a.id : '') +
          (a.getAttribute('class') ? '.' + a.getAttribute('class').trim().split(/\s+/).slice(0, 2).join('.') : '') +
          '(' + getComputedStyle(a).position + ')' + (a === dlg ? '*' : ''));
      }
      lines.push('around the visible checkboxes (* = taken as the pop-up):', '    ' + chain.join(' < '));
      var near = Array.prototype.filter.call(dlg.querySelectorAll('*'), function (el) {
        return isVisible(el) && !/^(INPUT|LABEL|OPTION)$/.test(el.tagName) && textOf(el).length <= 20 &&
          (getComputedStyle(el).cursor === 'pointer' || el.matches('button, a, svg, i, img, [onclick], [role]'));
      }).slice(0, 20).map(function (el) {
        return el.tagName.toLowerCase() + (el.getAttribute('class') ? '.' + el.getAttribute('class').trim().split(/\s+/).slice(0, 3).join('.') : '') +
          (el.getAttribute('aria-label') ? '[' + el.getAttribute('aria-label') + ']' : '') +
          (el.getAttribute('title') ? '{' + el.getAttribute('title') + '}' : '') + ' ' + JSON.stringify(textOf(el));
      });
      lines.push('clickable things in it:', '    ' + (near.join(', ') || '(none)'));
    }

    // Inside an open pop-up, everything that might close it, icons too.
    var dialogs = Array.prototype.filter.call(
      document.querySelectorAll('[role="dialog"], .modal, .ui-dialog, [class*="dialog"], [class*="modal"]'),
      function (d) {
        // Bootstrap marks the page itself "modal-open" while a pop-up shows;
        // that is not a pop-up, and neither is one inside another.
        if (d === document.body || d === document.documentElement || !isVisible(d)) return false;
        for (var up = d.parentElement; up && up !== document.body; up = up.parentElement) {
          if (up.matches('[role="dialog"], .modal, .ui-dialog, [class*="dialog"], [class*="modal"]')) return false;
        }
        return true;
      });
    dialogs.forEach(function (d) {
      var bits = Array.prototype.filter.call(
        d.querySelectorAll('button, a, span, i, svg, img, td, [onclick], [data-dismiss], [data-bs-dismiss], [role="button"], [data-day], [data-date]'),
        function (el) { return isVisible(el); })
        .slice(0, 50)
        .map(function (el) {
          var cls = String(el.getAttribute('class') || '').trim().split(/\s+/).slice(0, 3).join('.');
          var t = textOf(el).slice(0, 20);
          var day = el.getAttribute('data-day') || el.getAttribute('data-date');
          return el.tagName.toLowerCase() + (cls ? '.' + cls : '') +
            (el.getAttribute('aria-label') ? '[' + el.getAttribute('aria-label') + ']' : '') +
            (day ? '{data-day=' + day + '}' : '') + (t ? ' ' + JSON.stringify(t) : '');
        });
      var dcls = String(d.getAttribute('class') || '').trim().split(/\s+/).slice(0, 3).join('.');
      lines.push('open pop-up ' + d.tagName.toLowerCase() + (dcls ? '.' + dcls : '') + ':', '    ' + bits.join(', '));
    });
    return lines.join('\n');
  }

  /* ---------- main pass ---------- */

  function valueOf(el) {
    return (el.type === 'checkbox' || el.type === 'radio') ? String(el.checked) : String(el.value);
  }

  /* Fill one control. Returns its outcome {status, label, from, value}. */
  function fillOne(el, fields, rules) {
    var candidates = labelCandidates(el);
    var match = null;
    var yesNo = isYesNo(el);
    if (yesNo) match = A.answer(promptsFor(el), rules, fields);
    var standing = !!match;
    if (el.tagName === 'SELECT' && !yesNo) {
      // "method of payment,Organization Funds" -- a standing answer beats a
      // loose match on the sheet's own Payment Method.
      match = A.forMenu(promptsFor(el), rules);
      standing = !!match;
    }
    if (el.type === 'checkbox') {
      // A checkbox is judged by its own label only: GatorConnect puts the
      // first option's text beside every other option.
      match = A.checkbox(optionLabel(el), rules);
      standing = !!match;
    }
    for (var i = 0; i < candidates.length && !match; i++) {
      match = M.findValue(candidates[i], fields);
      // A Yes/No question only takes a yes or no from the sheet.
      if (match && yesNo && !S.isPolarValue(match.value)) match = null;
    }
    var labelUsed = candidates[0] || '(unlabelled)';
    if (!match) return { el: el, status: 'skipped', label: labelUsed };

    var result;
    if (el.tagName === 'SELECT') {
      result = yesNo ? fillYesNoSelect(el, match.value) : fillSelect(el, match.value);
    } else if (el.type === 'checkbox') {
      result = fillCheckbox(el, match.value);
      // A standing answer is a decision, not a loose match.
      if (result && standing) result.exact = true;
    } else if (el.type === 'radio') {
      result = fillRadioGroup(el, match.value);
      if (result && result.element) el = result.element;
    } else {
      var v = coerce(el, match.value);
      if (v === null || v === '') {
        result = null;
      } else {
        if (el.value !== v) {
          setNativeValue(el, v);
          notify(el);
        }
        result = { written: v, exact: true };
      }
    }

    if (!result) {
      return { el: el, status: 'skipped', label: labelUsed,
               note: 'no usable value from "' + match.label + '"' };
    }

    el.classList.remove(HIGHLIGHT_CLASS);
    var needsReview = match.confidence === 'uncertain' || !result.exact;
    if (needsReview) {
      highlight(el, 'matched sheet column "' + match.label + '"' +
        (match.alternative ? ' (could also be "' + match.alternative + '")' : ''));
    }
    return { el: el, status: needsReview ? 'review' : 'filled', label: labelUsed,
             from: match.label, value: result.written };
  }

  /* A fingerprint of every control's value, options and state, to tell when
     the page has reacted to a fill. */
  function pageState() {
    return Array.prototype.map.call(document.querySelectorAll('input, select, textarea'), function (el) {
      return valueOf(el) + '|' + (el.options ? el.options.length : '') + '|' +
        (el.disabled ? 'd' : '') + (isVisible(el) ? 'v' : '');
    }).join('\n');
  }

  var SETTLE_WAIT = 2500;   // how long to wait for the page to react at all
  var SETTLE_QUIET = 500;   // and for it to stop changing once it has
  var MAX_PASSES = 6;

  /* Resolves true once the page has changed and then held still, or false
     if nothing changed in SETTLE_WAIT. EMS loads the 1st Contact list, and
     then that contact's phone and email, only after the menu above changes. */
  function settle(wait) {
    var start = Date.now();
    var last = pageState();
    var changedAt = 0;
    return new Promise(function (resolve) {
      var timer = setInterval(function () {
        var now = Date.now();
        var state = pageState();
        if (state !== last) { last = state; changedAt = now; }
        if (changedAt && now - changedAt >= SETTLE_QUIET) { clearInterval(timer); resolve(true); }
        else if (!changedAt && now - start >= wait) { clearInterval(timer); resolve(false); }
      }, 100);
    });
  }

  /* Fill the page, then keep filling what the page reveals in response.
     Never overwrites a value that was there before the fill began; a value
     the page itself sets during the fill (EMS defaulting the 1st Contact to
     whoever is first in the group) is not the user's and may be replaced. */
  function waitFor(test, ms) {
    var start = Date.now();
    return new Promise(function (resolve) {
      (function poll() {
        var hit = test();
        if (hit || Date.now() - start >= ms) return resolve(hit || null);
        setTimeout(poll, 100);
      })();
    });
  }

  async function run(fields, answerRows, opts) {
    opts = opts || {};
    var wait = opts.settleWait || SETTLE_WAIT;
    var form = F.detect(document.location);
    var rules = A.rulesFrom(answerRows, form.id);
    clearHighlights();

    var before = new Map();
    Array.prototype.forEach.call(document.querySelectorAll('input, select, textarea'), function (el) {
      before.set(el, valueOf(el));
    });
    var outcomes = new Map();   // element -> outcome
    var written = new Map();    // element -> value we left in it
    var pageNotes = [];         // outcomes not tied to one control

    // The Form's own steps first: GatorConnect's extra dates, In-Person
    // button and rich-text Description.
    if (form.prepare) {
      var prepared = await form.prepare({
        document: document, fields: fields, schedule: opts.schedule,
        isVisible: isVisible, textOf: textOf, parseDate: parseDate, parseTime: parseTime,
        labelOf: function (el) { return labelCandidates(el)[0] || ''; },
        setValue: function (el, v) { setNativeValue(el, v); notify(el); },
        highlight: highlight,
        isFillable: isFillable,
        optionLabel: optionLabel,
        tick: tick,
        answerCheckbox: function (el) { return A.checkbox(optionLabel(el), rules); },
        findValue: function (prompt) { return M.findValue(prompt, fields); },
        waitFor: function (test) { return waitFor(test, wait); }
      });
      prepared.forEach(function (o) {
        if (o.el === document.body) { pageNotes.push(o); return; }
        outcomes.set(o.el, o);
        if (o.status === 'filled' || o.status === 'review') written.set(o.el, valueOf(o.el));
      });
    }

    function pass() {
      var wrote = false;
      var radioGroups = {};
      Array.prototype.forEach.call(document.querySelectorAll('input, select, textarea'), function (el) {
        if (!isFillable(el)) return;
        if (form.skip && form.skip(el)) return;
        if (el.type === 'radio') {
          if (radioGroups[el.name]) return;
          radioGroups[el.name] = true;
        }

        var prev = outcomes.get(el);
        // Ours, and nothing has changed it since.
        if (written.has(el) && written.get(el) === valueOf(el)) return;

        var setByPage = before.has(el) ? valueOf(el) !== before.get(el) : true;
        var empty = el.type === 'radio'
          ? !radiosNamed(document, el.name || '').some(function (r) { return r.checked; })
          : isEmpty(el);
        if (!empty && !setByPage) { outcomes.set(el, { el: el, status: 'prefilled' }); return; }

        var out = fillOne(el, fields, rules);
        // Leave the page's own value in place rather than report a skip.
        if (out.status === 'skipped' && !empty) {
          if (!prev) outcomes.set(el, { el: el, status: 'prefilled' });
          return;
        }
        outcomes.set(out.el, out);
        if (out.status !== 'skipped') {
          if (valueOf(out.el) !== written.get(out.el)) wrote = true;
          written.set(out.el, valueOf(out.el));
        }
      });
      return wrote;
    }

    var wrote = pass();
    for (var n = 1; n < MAX_PASSES && wrote; n++) {
      if (!(await settle(wait))) break;
      wrote = pass();
    }

    var report = { form: form.name, filled: 0, review: 0, skipped: 0, prefilled: 0, details: [] };
    var order = pageNotes.concat(Array.prototype.map.call(
      document.querySelectorAll('input, select, textarea'), function (el) { return outcomes.get(el); }));
    order.forEach(function (o) {
      if (!o) return;
      report[o.status]++;
      if (o.status !== 'prefilled') {
        report.details.push({ label: o.label, status: o.status, from: o.from, value: o.value, note: o.note });
      }
    });
    return report;
  }

  return { run: run, diagnose: diagnose, clearHighlights: clearHighlights, labelCandidates: labelCandidates, isYesNo: isYesNo,
           toISODate: toISODate, to24h: to24h, parseDate: parseDate };
})(typeof UFRA_SCHEMA !== 'undefined' ? UFRA_SCHEMA : require('./schema.js'),
   typeof UFRA_MATCH !== 'undefined' ? UFRA_MATCH : require('./matcher.js'),
   typeof UFRA_ANSWERS !== 'undefined' ? UFRA_ANSWERS : require('./answers.js'),
   typeof UFRA_FORMS !== 'undefined' ? UFRA_FORMS : require('./forms.js'));

if (typeof module !== 'undefined') module.exports = UFRA_FILL;
