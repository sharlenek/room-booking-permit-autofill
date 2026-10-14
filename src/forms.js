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

  function sameDay(a, b) { return a && b && a.y === b.y && a.m === b.m && a.d === b.d; }

  /* The first visible control whose text matches, within root. */
  function findClickable(ctx, root, re) {
    var els = root.querySelectorAll('button, a, label, [role="button"], [role="radio"], [role="tab"], ' +
      'input[type="button"], input[type="radio"]');
    return Array.prototype.find.call(els, function (el) {
      if (!ctx.isVisible(el)) return false;
      var text = el.tagName === 'INPUT' ? (ctx.labelOf(el) || el.value) : ctx.textOf(el);
      return re.test(String(text || '').trim());
    }) || null;
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

    for (var k = 0; k < sessions.length; k++) {
      var s = sessions[k];
      var nth = sessions.length > 1 ? ' (date ' + (k + 1) + ')' : '';
      var prefix = 'Instances[' + k + '].';

      // 1. One Booking per date, adding Bookings with "+ add another date".
      var created = false;
      if (!byName(doc, prefix + 'StartDate')) {
        var add = findClickable(ctx, doc, /^\+?\s*add another date$/i);
        if (!add) {
          out.push({ el: doc.body, status: 'skipped', label: 'Date ' + (k + 1) + ' of ' + sessions.length,
                     note: 'could not find "+ add another date"' });
          break;
        }
        add.click();
        if (!(await ctx.waitFor(function () { return byName(doc, prefix + 'StartDate'); }))) break;
        created = true;
      }

      var els = ['StartDate', 'StartTime', 'EndDate', 'EndTime'].map(function (f) { return byName(doc, prefix + f); });
      // GatorConnect starts every Booking on today's date. Anything else was
      // set by the user and stays.
      var untouched = created || (els[0] && els[2] &&
        sameDay(ctx.parseDate(els[0].value), today) && sameDay(ctx.parseDate(els[2].value), today));
      var values = [gcDate(ctx.parseDate(s.date)), gcTime(ctx.parseTime(s.start)),
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
      var place = s.place || (room && room.value) || '';
      var placeFrom = s.place ? schedule.source : (room && room.label);
      var start = byName(doc, prefix + 'StartDate');
      var loc = byName(doc, prefix + 'ExternalLocation');
      if (!place || !start || !loc) continue;
      if (!ctx.isVisible(loc)) {
        var btn = findClickable(ctx, commonBlock(start, loc), /^in[\s-]?person$/i);
        if (btn) {
          btn.click();
          await ctx.waitFor(function () { return ctx.isVisible(loc); });
        }
      }
      if (!ctx.isVisible(loc)) {
        out.push({ el: loc, status: 'skipped', label: 'Location Name' + nth, note: 'could not find the In-Person button' });
        continue;
      }
      if (String(loc.value).trim()) { out.push({ el: loc, status: 'prefilled', label: 'Location Name' + nth }); continue; }
      ctx.setValue(loc, place);
      ctx.highlight(loc, 'from "' + placeFrom + '" — check it is the room you got');
      out.push({ el: loc, status: 'review', label: 'Location Name' + nth, from: placeFrom, value: place });
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

  var FORMS = {
    gatorconnect: { id: 'gatorconnect', name: 'GatorConnect event',
      skip: function (el) { return GC_LEAVE.test(el.name || '') || GC_LEAVE.test(el.id || ''); },
      prepare: gcPrepare },
    ems: { id: 'ems', name: 'EMS room request' },
    other: { id: 'other', name: 'this page' }
  };

  function detect(loc) {
    var host = String((loc && loc.hostname) || '').toLowerCase();
    var path = String((loc && loc.pathname) || '');
    if (host === 'gatorconnect.ufl.edu') return FORMS.gatorconnect;
    if (host === 'rooms.ufl.edu' || /emswebapp/i.test(path)) return FORMS.ems;
    return FORMS.other;
  }

  return { detect: detect, gcDate: gcDate, gcTime: gcTime };
})();

if (typeof module !== 'undefined') module.exports = UFRA_FORMS;
