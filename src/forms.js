/* Which Form the page is, and what that Form needs beyond matching Prompts
   to Columns: buttons to press, Bookings to add, controls to leave alone. */
var UFRA_FORMS = (function () {

  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function pad(n) { return (n < 10 ? '0' : '') + n; }

  /* ---------- GatorConnect event submission ---------- */

  // Decided per event by the user, or a search box whose results the
  // extension cannot safely pick from (a wrong co-host is listed publicly).
  var GC_LEAVE = /^(GroupName|Theme|EventTypeId|AllowSelfReporting|EventCategoryIds|Benefits|bsmSelect)|Instances\[\d+\]\.(Address|City|State|Zip|Postal|Country|OnlineLocation)/i;

  function byName(doc, name) {
    return doc.querySelector('[name="' + name + '"]');
  }

  // GatorConnect writes "14 Oct 2026" and "01:00 PM".
  function gcDate(d) { return pad(d.d) + ' ' + MONTHS[d.m - 1] + ' ' + d.y; }
  function gcTime(t) {
    var h = t.h % 12 || 12;
    return pad(h) + ':' + pad(t.min) + ' ' + (t.h < 12 ? 'AM' : 'PM');
  }

  /* Several rooms, ranked or listed one per line: "(1) TUR-L005\n(2) ...". */
  function isRoomList(v) {
    var text = String(v || '').trim();
    return /\n/.test(text) || /(^|\s)\(?[1-9][).]\s/.test(text) || /\(2\)/.test(text);
  }

  function sameDay(a, b) { return a && b && a.y === b.y && a.m === b.m && a.d === b.d; }

  /* Visible controls whose own text matches, within root, in page order.
     A button input's text is its value, not whatever label sits nearby. */
  function findClickables(ctx, root, re) {
    var els = root.querySelectorAll('button, a, label, [role="button"], [role="radio"], [role="tab"], ' +
      'input[type="button"], input[type="radio"]');
    return Array.prototype.filter.call(els, function (el) {
      if (!ctx.isVisible(el)) return false;
      var text = el.tagName !== 'INPUT' ? ctx.textOf(el)
        : (el.type === 'button' || el.type === 'submit' ? el.value : ctx.labelOf(el));
      return re.test(String(text || '').replace(/\s+/g, ' ').trim());
    });
  }

  function findClickable(ctx, root, re) {
    return findClickables(ctx, root, re)[0] || null;
  }

  /* The button for one Booking: inside a block holding only that Booking,
     otherwise the first one after the Booking's start date -- never another
     Booking's button. */
  function clickableFor(ctx, start, loc, re) {
    var block = commonBlock(start, loc);
    var ownBlock = block.querySelectorAll('[name$=".StartDate"]').length === 1;
    var own = ownBlock && findClickable(ctx, block, re);
    if (own) return own;
    return findClickables(ctx, start.ownerDocument, re).find(function (el) {
      return start.compareDocumentPosition(el) & 4;   // DOCUMENT_POSITION_FOLLOWING
    }) || null;
  }

  /* The pop-up holding a field: its nearest ancestor with a SAVE button. */
  function dialogAround(ctx, el) {
    for (var n = el.parentElement; n && n !== el.ownerDocument.body; n = n.parentElement) {
      if (findClickable(ctx, n, /^save$/i)) return n;
    }
    return null;
  }

  /* The smallest ancestor of a that also holds b: one Booking's block. */
  function commonBlock(a, b) {
    for (var n = a && a.parentElement; n; n = n.parentElement) {
      if (n.contains(b)) return n;
    }
    return a ? a.ownerDocument.body : null;
  }

  /* The rich-text editor GatorConnect draws over the hidden Description
     textarea: an iframe whose body is editable, or an editable div. */
  function editorFor(textarea) {
    for (var n = textarea.parentElement, depth = 0; n && depth < 5; n = n.parentElement, depth++) {
      var frames = n.querySelectorAll('iframe');
      for (var i = 0; i < frames.length; i++) {
        var body = frames[i].contentDocument && frames[i].contentDocument.body;
        if (body && (body.isContentEditable || body.getAttribute('contenteditable') === 'true')) return body;
      }
      var div = n.querySelector('[contenteditable="true"]');
      if (div) return div;
    }
    return null;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  async function gcPrepare(ctx) {
    var doc = ctx.document;
    var out = [];
    var schedule = ctx.schedule;
    if (schedule && schedule.cancelled) {
      out.push({ el: doc.body, status: 'skipped', label: 'Dates',
                 note: schedule.source + ' says this event is cancelled' });
      schedule = null;
    }
    var sessions = ((schedule && schedule.sessions) || []).filter(function (s) {
      return s.date && s.start && s.end && ctx.parseDate(s.date) && ctx.parseTime(s.start) && ctx.parseTime(s.end);
    });
    var today = new Date();
    today = { y: today.getFullYear(), m: today.getMonth() + 1, d: today.getDate() };
    var room = ctx.fields.find(function (f) { return f.canon === 'location' && f.value; });

    // Dates and places live on the first page only.
    var basics = !!byName(doc, 'Instances[0].StartDate');

    // With no usable date the first Booking still gets its room.
    var noDates = !sessions.length;
    if (noDates) sessions = [{ place: '' }];

    for (var k = 0; basics && k < sessions.length; k++) {
      var s = sessions[k];
      var nth = sessions.length > 1 ? ' (date ' + (k + 1) + ')' : '';
      var prefix = 'Instances[' + k + '].';

      // 1. One Booking per date, adding Bookings with "+ add another date".
      var created = false;
      if (!byName(doc, prefix + 'StartDate')) {
        // "add ADD ANOTHER DATE": a Material icon named "add", then the text.
        var add = findClickable(ctx, doc, /add another date$/i);
        if (!add) {
          out.push({ el: doc.body, status: 'skipped', label: 'Date ' + (k + 1) + ' of ' + sessions.length,
                     note: 'could not find "+ add another date"' });
          break;
        }
        add.click();
        if (!(await ctx.waitFor(function () { return byName(doc, prefix + 'StartDate'); }))) break;
        created = true;
      }

      var els = noDates ? [] : ['StartDate', 'StartTime', 'EndDate', 'EndTime'].map(function (f) { return byName(doc, prefix + f); });
      // GatorConnect starts every Booking on today's date. Anything else was
      // set by the user and stays.
      var untouched = created || (els[0] && els[2] &&
        sameDay(ctx.parseDate(els[0].value), today) && sameDay(ctx.parseDate(els[2].value), today));
      var values = noDates ? [] : [gcDate(ctx.parseDate(s.date)), gcTime(ctx.parseTime(s.start)),
                                   gcDate(ctx.parseDate(s.date)), gcTime(ctx.parseTime(s.end))];
      ['Start Date', 'Start Time', 'End Date', 'End Time'].forEach(function (name, i) {
        var el = els[i];
        if (!el) return;
        if (!untouched) { out.push({ el: el, status: 'prefilled', label: name + nth }); return; }
        ctx.setValue(el, values[i]);
        // A year or am/pm the sheet left out was guessed; say so.
        if (s.guessed) ctx.highlight(el, 'year or am/pm guessed from "' + schedule.source + '"');
        out.push({ el: el, status: s.guessed ? 'review' : 'filled', label: name + nth,
                   from: schedule.source, value: values[i] });
      });

      // 2. Its place: press "In-Person" so the location boxes appear, then
      //    name the room. Finalized Information is hand-written and a room
      //    preference is only what was asked for, so it is always checked.
      // A room preference naming several rooms ("(1) TUR-L005 (2) TUR-L011")
      // is a wish list, not where the event is; that is left to the user.
      var preferred = room && !isRoomList(room.value) ? room.value : '';
      var place = s.place || preferred;
      var placeFrom = s.place ? schedule.source : (room && room.label);
      if (!place && room && k === 0) {
        out.push({ el: doc.body, status: 'skipped', label: 'Location Name',
                   note: '"' + room.label + '" lists several rooms; fill in the one you got' });
      }
      var start = byName(doc, prefix + 'StartDate');
      var loc = byName(doc, prefix + 'ExternalLocation');
      if (!place || !start || !loc) continue;
      if (!ctx.isVisible(loc)) {
        // GatorConnect's in-person choice is the "Location" button, beside
        // "Online Location" and "Clear Location".
        var btn = clickableFor(ctx, start, loc, /^(location|in[\s-]?person)$/i);
        if (btn) {
          btn.click();
          await ctx.waitFor(function () { return ctx.isVisible(loc); });
        }
      }
      if (!ctx.isVisible(loc)) {
        out.push({ el: loc, status: 'skipped', label: 'Location Name' + nth, note: 'could not find the "Location" button' });
        continue;
      }
      // The Location pop-up, in the order a person would go: say no to the
      // map first (it can redraw the pop-up), type the room, then SAVE.
      var dialog = dialogAround(ctx, loc);
      var noMap = dialog && findClickable(ctx, dialog, /^no\b.*\bmap\b/i);
      if (noMap) {
        noMap.click();
        await ctx.waitFor(function () { return ctx.isVisible(loc); });
      }

      // A date this fill added may arrive with the previous date's room
      // copied in; only a room on a date that was already there is the user's.
      if (String(loc.value).trim() && !created) {
        out.push({ el: loc, status: 'prefilled', label: 'Location Name' + nth });
      } else {
        ctx.setValue(loc, place);
        ctx.highlight(loc, 'from "' + placeFrom + '" — check it is the room you got');
        out.push({ el: loc, status: 'review', label: 'Location Name' + nth, from: placeFrom, value: place });
      }

      var save = dialog && findClickable(ctx, dialog, /^save$/i);
      if (save) {
        save.click();
        await ctx.waitFor(function () { return !ctx.isVisible(save); });
      } else if (dialog) {
        out.push({ el: doc.body, status: 'skipped', label: 'Location' + nth, note: 'could not find SAVE in the Location pop-up' });
      }
    }

    // 3. Description, typed into the rich-text editor.
    var textarea = byName(doc, 'Description');
    var desc = ctx.findValue('Description');
    if (textarea && desc) {
      var editor = editorFor(textarea);
      var current = editor ? editor.textContent : textarea.value;
      if (String(current).trim()) {
        out.push({ el: textarea, status: 'prefilled', label: 'Description' });
      } else {
        var html = String(desc.value).split(/\n+/).map(function (p) { return '<p>' + escapeHtml(p) + '</p>'; }).join('');
        if (editor) {
          editor.innerHTML = html;
          editor.dispatchEvent(new (editor.ownerDocument.defaultView || window).Event('input', { bubbles: true }));
        }
        ctx.setValue(textarea, html);
        out.push({ el: textarea, status: editor ? 'filled' : 'review', label: 'Description',
                   from: desc.label, value: desc.value });
      }
    }

    return out;
  }

  /* ---------- EMS "1 Rooms": date and times of a new booking ---------- */

  // Written the way the box already writes them, whatever that is:
  // "Wed 11/04/2026", "11/4/2026", "Thursday, October 15, 2026",
  // "Oct 15, 2026", "2026-11-04".
  var WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var WEEKDAYS_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var MONTHS_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
    'September', 'October', 'November', 'December'];
  function emsDate(d, sample) {
    var smp = String(sample || '').trim();
    var wd = new Date(d.y, d.m - 1, d.d).getDay();
    var lead = smp.match(/^([a-z]+)(,?)\s+/i);
    var named = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/i.exec(smp);
    if (lead && named && lead[1].toLowerCase() === named[0].toLowerCase()) lead = null;
    var weekday = lead ? (lead[1].length > 3 ? WEEKDAYS_FULL[wd] : WEEKDAYS[wd]) + lead[2] + ' ' : '';
    if (named) {
      var month = named[0].length > 3 && !/^sept$/i.test(named[0]) ? MONTHS_FULL[d.m - 1] : MONTHS[d.m - 1];
      var day = /\b0\d\b/.test(smp) ? pad(d.d) : String(d.d);
      if (/\d{1,2}\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(smp)) {   // "15 Oct 2026"
        return weekday + day + ' ' + month + ' ' + d.y;
      }
      return weekday + month + ' ' + day + (/\d,\s*\d{4}/.test(smp) ? ', ' : ' ') + d.y;
    }
    if (/\d{4}-\d{2}-\d{2}/.test(smp)) return weekday + d.y + '-' + pad(d.m) + '-' + pad(d.d);
    var sep = (smp.match(/\d([\/.-])\d/) || [0, '/'])[1];
    // Unpadded only if the box shows a one-digit month or day ("1/5/2026").
    var padded = !/(^|\D)\d[\/.-]|[\/.-]\d(\D|$)/.test(smp);
    var m = padded ? pad(d.m) : String(d.m);
    var dd = padded ? pad(d.d) : String(d.d);
    return weekday + m + sep + dd + sep + d.y;
  }
  function emsTime(t, sample) {
    var h = t.h % 12 || 12;
    var lead = /^0\d/.test(String(sample || '').trim()) ? pad(h) : String(h);
    return lead + ':' + pad(t.min) + ' ' + (t.h < 12 ? 'AM' : 'PM');
  }

  /* ---------- EMS "2 Reservation Details": Add/Remove pop-ups ---------- */

  // EMS keeps a checkbox question's real boxes in a pop-up behind its
  // "Add/Remove" link; the boxes on the page are a hidden summary.
  function visibleCheckboxes(ctx, doc) {
    return Array.prototype.filter.call(doc.querySelectorAll('input[type="checkbox"]'), function (c) {
      return ctx.isFillable(c);
    });
  }

  function cssOf(el) {
    return (el.ownerDocument.defaultView || window).getComputedStyle(el);
  }

  /* The pop-up holding the boxes. EMS marks it neither dialog nor modal, so
     go by how it looks: the outermost box floating over the page (fixed or
     absolutely placed) that holds them all; else a dialog/modal by name;
     else their smallest common block. */
  function dialogOf(boxes) {
    var first = boxes[0];
    var body = first.ownerDocument.body;
    var floating = null;
    var named = null;
    for (var n = first.parentElement; n && n !== body; n = n.parentElement) {
      if (!boxes.every(function (b) { return n.contains(b); })) continue;
      var pos = cssOf(n).position;
      if (pos === 'fixed' || pos === 'absolute') floating = n;
      if (n.matches('[role="dialog"], .modal, .ui-dialog, [class*="dialog"], [class*="modal"], [class*="popup"], [class*="popover"]')) named = n;
    }
    if (floating || named) return floating || named;
    for (var m = first.parentElement; m; m = m.parentElement) {
      if (boxes.every(function (b) { return m.contains(b); })) return m;
    }
    return body;
  }

  /* Ways to close a pop-up, best first: a confirming button, an X by its
     wording or markup, then any small clickable thing with little or no
     text, nearest the top-right corner -- where EMS draws its X. */
  function closersIn(ctx, dialog, boxes) {
    var ICON_X = '[data-dismiss], [data-bs-dismiss], [class*="close"], [class*="times"], [class*="fa-x"], [class*="icon-x"]';
    var all = Array.prototype.filter.call(dialog.querySelectorAll('*'), function (el) {
      if (!ctx.isVisible(el) || /^(INPUT|LABEL|SELECT|TEXTAREA|OPTION)$/.test(el.tagName)) return false;
      return !boxes.some(function (b) { return el.contains(b) || (b.closest('label') && b.closest('label').contains(el)); });
    });
    function text(el) { return (el.tagName === 'INPUT' ? el.value : ctx.textOf(el)).replace(/\s+/g, ' ').trim(); }
    var confirm = all.filter(function (el) { return /^(ok|done|save|apply|update|select)$/i.test(text(el)); });
    var named = all.filter(function (el) {
      return /^(close|x|×|✕|✖)$/i.test(text(el)) || /close/i.test(el.getAttribute('aria-label') || '') ||
        /close/i.test(el.getAttribute('title') || '') || el.matches(ICON_X);
    });
    var box = dialog.getBoundingClientRect();
    var small = all.filter(function (el) {
      var r = el.getBoundingClientRect();
      return cssOf(el).cursor === 'pointer' && text(el).length <= 2 && r.width > 0 && r.width < 60 && r.height < 60;
    }).sort(function (a, b) {
      var ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
      return ((box.right - ra.right) + (ra.top - box.top)) - ((box.right - rb.right) + (rb.top - box.top));
    });
    return confirm.concat(named, small)
      .map(function (el) { return el.closest('button, a, [role="button"]') || el; })
      .filter(function (el, i, list) { return list.indexOf(el) === i; });
  }

  async function closeDialog(ctx, dialog, boxes) {
    var gone = function () { return boxes.every(function (b) { return !ctx.isVisible(b); }); };
    var closers = closersIn(ctx, dialog, boxes).slice(0, 3);
    for (var i = 0; i < closers.length; i++) {
      closers[i].click();
      if (await ctx.waitFor(gone)) return true;
    }
    var esc = { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true };
    var KE = (dialog.ownerDocument.defaultView || window).KeyboardEvent;
    ['keydown', 'keyup'].forEach(function (type) {
      dialog.dispatchEvent(new KE(type, esc));
      dialog.ownerDocument.dispatchEvent(new KE(type, esc));
    });
    return !!(await ctx.waitFor(gone));
  }

  async function emsAddRemove(ctx) {
    var doc = ctx.document;
    var out = [];
    var links = findClickables(ctx, doc, /^add\s*\/\s*remove$/i);
    for (var i = 0; i < links.length; i++) {
      var before = visibleCheckboxes(ctx, doc);
      links[i].click();
      var appeared = await ctx.waitFor(function () {
        var now = visibleCheckboxes(ctx, doc).filter(function (c) { return before.indexOf(c) === -1; });
        return now.length ? now : null;
      });
      if (!appeared) continue;

      var question = '';
      appeared.forEach(function (box) {
        var label = ctx.optionLabel(box);
        var answer = ctx.answerCheckbox(box);
        if (!answer || !/^(y|yes)$/i.test(answer.value)) return;
        if (!box.checked) ctx.tick(box);
        out.push({ el: box, status: 'filled', label: label, from: answer.label, value: 'checked' });
      });
      var dialog = dialogOf(appeared);
      if (!(await closeDialog(ctx, dialog, appeared))) {
        out.push({ el: doc.body, status: 'skipped', label: 'Add/Remove pop-up',
                   note: 'ticked, but could not close the pop-up; close it yourself' });
      }
    }
    return out;
  }

  async function emsPrepare(ctx) {
    var doc = ctx.document;
    var dateEl = doc.getElementById('booking-date-input');
    var startEl = doc.getElementById('start-time-input');
    var endEl = doc.getElementById('end-time-input');
    // Step 1 and step 2 are tabs of one page. Step 1 has Add/Remove links
    // of its own -- building and room filters -- which are not questions,
    // so the Add/Remove pop-ups are only worked on step 2.
    var onRooms = !!dateEl && ctx.isVisible(dateEl);
    if (!onRooms) return emsAddRemove(ctx);
    var out = [];
    if (!startEl || !endEl) return out;

    // A room is booked for what was asked for: the request, not Finalized.
    var asked = ((ctx.schedule && ctx.schedule.requested) || []).filter(function (s) {
      return s.date && s.start && s.end && ctx.parseDate(s.date) && ctx.parseTime(s.start) && ctx.parseTime(s.end);
    });
    if (!asked.length) return out;
    var s = asked[0];
    var source = ctx.schedule.requestedLabel || 'requested date and time';

    // EMS opens on today's date; any other date was chosen by the user.
    var now = new Date();
    var shown = ctx.parseDate(dateEl.value);
    var untouched = !String(dateEl.value).trim() ||
      (shown && shown.y === now.getFullYear() && shown.m === now.getMonth() + 1 && shown.d === now.getDate());
    var values = [emsDate(ctx.parseDate(s.date), dateEl.value),
                  emsTime(ctx.parseTime(s.start), startEl.value),
                  emsTime(ctx.parseTime(s.end), endEl.value)];
    if (!untouched) {
      out.push({ el: doc.body, status: 'skipped', label: 'Date and times',
                 note: 'left alone: the date was already changed from today' + (shown ? '' : ' (or reads as "' +
                   String(dateEl.value).replace(/[0-9]/g, '9') + '", which the extension cannot read)') });
    }
    [[dateEl, 'Date'], [startEl, 'Start Time'], [endEl, 'End Time']].forEach(function (pair, i) {
      if (!untouched) { out.push({ el: pair[0], status: 'prefilled', label: pair[1] }); return; }
      ctx.setValue(pair[0], values[i]);
      out.push({ el: pair[0], status: s.guessed ? 'review' : 'filled', label: pair[1], from: source, value: values[i] });
      if (s.guessed) ctx.highlight(pair[0], 'year or am/pm guessed from "' + source + '"');
    });
    if (untouched && asked.length > 1) {
      out = out.concat(await emsRecurrence(ctx, asked, source));
    }
    return out;
  }

  /* ---------- EMS Recurrence pop-up: several requested dates ---------- */

  function dayNumber(d) { return Math.round(Date.UTC(d.y, d.m - 1, d.d) / 86400000); }

  /* Weekly when every date falls on one weekday the same number of weeks
     apart at the same times; Random (the exact dates) otherwise -- so a
     weekly series with a holiday left out never books the holiday. */
  function recurrencePattern(ctx, sessions) {
    var days = sessions.map(function (s) { return dayNumber(ctx.parseDate(s.date)); });
    var gap = days[1] - days[0];
    var sameTimes = sessions.every(function (s) { return s.start === sessions[0].start && s.end === sessions[0].end; });
    var even = gap > 0 && gap % 7 === 0 && gap <= 28 && days.every(function (d, i) { return !i || d - days[i - 1] === gap; });
    return { weekly: even && sameTimes, every: gap / 7, sameTimes: sameTimes };
  }

  var MONTH_RE = new RegExp('^(' + MONTHS_FULL.join('|') + ')\\s+(\\d{4})$', 'i');

  /* Click one date in the Random calendar: page to its month with the
     chevrons, then click its day unless it is already chosen. */
  async function pickCalendarDay(ctx, dialog, d) {
    for (var tries = 0; tries < 30; tries++) {
      var header = Array.prototype.find.call(dialog.querySelectorAll('*'), function (el) {
        return ctx.isVisible(el) && !el.children.length && MONTH_RE.test(ctx.textOf(el).trim());
      });
      if (!header) return false;
      var hm = ctx.textOf(header).trim().match(MONTH_RE);
      var shown = +hm[2] * 12 + MONTHS_FULL.map(function (n) { return n.toLowerCase(); }).indexOf(hm[1].toLowerCase());
      var want = d.y * 12 + d.m - 1;
      if (shown !== want) {
        var dir = want > shown ? 'right' : 'left';
        var chevron = dialog.querySelector('.glyphicon-chevron-' + dir + ', .fa-chevron-' + dir + ', [class*="' + (dir === 'right' ? 'next' : 'prev') + '"]');
        if (!chevron) return false;
        (chevron.closest('button, a, th, td, [role="button"]') || chevron).click();
        await ctx.waitFor(function () { return ctx.textOf(header).trim() !== hm[0] || !header.isConnected; });
        continue;
      }
      var cells = Array.prototype.filter.call(dialog.querySelectorAll('td, button, a, span, div'), function (el) {
        if (!ctx.isVisible(el)) return false;
        var data = el.getAttribute('data-day') || el.getAttribute('data-date');
        if (data) { var p = ctx.parseDate(data); return !!p && p.y === d.y && p.m === d.m && p.d === d.d; }
        return !el.querySelector('td, button, a, span, div') && ctx.textOf(el).trim() === String(d.d) &&
          !/\b(old|new|other|disabled|muted|outside)\b/i.test(el.className || '');
      });
      var cell = cells[0];
      if (!cell) return false;
      if (!/\b(active|selected)\b/i.test(cell.className || '')) cell.click();
      return true;
    }
    return false;
  }

  async function emsRecurrence(ctx, sessions, source) {
    var doc = ctx.document;
    var out = [];
    var note = function (text) { out.push({ el: doc.body, status: 'skipped', label: 'Recurrence', note: text }); };
    var btn = findClickable(ctx, doc, /^recurrence$/i);
    if (!btn) { note(sessions.length + ' dates requested; could not find the Recurrence button'); return out; }
    btn.click();
    var pattern = await ctx.waitFor(function () {
      var e = doc.getElementById('recurrence-pattern-dropdown');
      return e && ctx.isVisible(e) ? e : null;
    });
    if (!pattern) { note('the Recurrence pop-up did not open'); return out; }
    var dialog = pattern.closest('.modal, [role="dialog"]') || doc.body;
    var plan = recurrencePattern(ctx, sessions);
    var first = sessions[0];
    var last = sessions[sessions.length - 1];

    ctx.setValue(pattern, plan.weekly ? 'weekly' : 'random');
    // Wait for the chosen pattern's own controls: Weekly's count box, or
    // Random's calendar, shown by its month heading.
    await ctx.waitFor(function () {
      if (plan.weekly) {
        var e = doc.getElementById('weekly-count');
        return e && ctx.isVisible(e);
      }
      return Array.prototype.some.call(dialog.querySelectorAll('*'), function (el) {
        return !el.children.length && ctx.isVisible(el) && MONTH_RE.test(ctx.textOf(el).trim());
      });
    });

    var put = function (id, value) {
      var e = doc.getElementById(id);
      if (e) ctx.setValue(e, value);
    };
    var startEl = doc.getElementById('recurrence-start-time');
    var endEl = doc.getElementById('recurrence-end-time');
    if (startEl) put('recurrence-start-time', emsTime(ctx.parseTime(first.start), startEl.value));
    if (endEl) put('recurrence-end-time', emsTime(ctx.parseTime(first.end), endEl.value));

    if (plan.weekly) {
      put('weekly-count', String(plan.every));
      var weekday = WEEKDAYS_FULL[new Date(ctx.parseDate(first.date).y, ctx.parseDate(first.date).m - 1,
                                            ctx.parseDate(first.date).d).getDay()];
      // Toggle buttons: "Monday Not Selected" / "Monday Selected".
      Array.prototype.forEach.call(dialog.querySelectorAll('button[aria-label]'), function (b) {
        var m = b.getAttribute('aria-label').match(/^(\w+day)\s+(not\s+)?selected$/i);
        if (!m) return;
        var on = !m[2];
        if ((m[1].toLowerCase() === weekday.toLowerCase()) !== on) b.click();
      });
      var startDate = doc.getElementById('recurrence-date');
      if (startDate) put('recurrence-date', emsDate(ctx.parseDate(first.date), startDate.value));
      var endRadio = doc.getElementById('end-date');
      if (endRadio && !endRadio.checked) endRadio.click();
      var endDate = doc.getElementById('enddate');
      if (endDate) put('enddate', emsDate(ctx.parseDate(last.date), endDate.value));
      out.push({ el: pattern, status: 'filled', label: 'Recurrence', from: source,
                 value: 'Weekly on ' + weekday + (plan.every > 1 ? ', every ' + plan.every + ' weeks' : '') +
                   ', ' + first.date + ' to ' + last.date });
    } else {
      var missed = [];
      for (var i = 0; i < sessions.length; i++) {
        if (!(await pickCalendarDay(ctx, dialog, ctx.parseDate(sessions[i].date)))) missed.push(sessions[i].date);
      }
      out.push({ el: pattern, status: missed.length ? 'review' : 'filled', label: 'Recurrence', from: source,
                 value: 'Random: ' + (sessions.length - missed.length) + ' of ' + sessions.length + ' dates' });
      if (missed.length) note('could not pick ' + missed.join(', ') + ' in the calendar; pick them yourself');
      if (!plan.sameTimes) note('the dates have different times; EMS takes one time for all, so ' +
                                first.start + '-' + first.end + ' was used');
    }

    var apply = findClickable(ctx, dialog, /^apply recurrence$/i);
    if (!apply) { note('could not find Apply Recurrence; apply it yourself'); return out; }
    apply.click();
    await ctx.waitFor(function () { return !ctx.isVisible(pattern); });
    return out;
  }

  var FORMS = {
    gatorconnect: { id: 'gatorconnect', name: 'GatorConnect event',
      skip: function (el) { return GC_LEAVE.test(el.name || '') || GC_LEAVE.test(el.id || ''); },
      prepare: gcPrepare },
    ems: { id: 'ems', name: 'EMS room request', prepare: emsPrepare },
    other: { id: 'other', name: 'this page' }
  };

  function detect(loc) {
    var host = String((loc && loc.hostname) || '').toLowerCase();
    var path = String((loc && loc.pathname) || '');
    if (host === 'gatorconnect.ufl.edu') return FORMS.gatorconnect;
    // UF's EMS lives at ufl.emscloudservice.com; rooms.ufl.edu links to it.
    if (/(^|\.)emscloudservice\.com$/.test(host) || host === 'rooms.ufl.edu' || /emswebapp/i.test(path)) {
      return FORMS.ems;
    }
    return FORMS.other;
  }

  return { dialogOf: dialogOf, closersIn: closersIn, detect: detect, gcDate: gcDate, gcTime: gcTime, emsDate: emsDate, emsTime: emsTime };
})();

if (typeof module !== 'undefined') module.exports = UFRA_FORMS;
