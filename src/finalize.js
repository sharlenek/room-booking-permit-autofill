/* Writes the Finalized Information cell from what EMS actually booked: read
   off a reservation's summary page, or out of the .ics file EMS hands out
   with "Add to My Calendar". One Booking per line, in the shape bookings.js
   reads back:

     10/06/2026, 6:00pm - 8:00pm, Leigh Hall 0207 */
var UFRA_FINALIZE = (function (B) {

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function fmtDate(d) { return pad(d.m) + '/' + pad(d.d) + '/' + d.y; }
  function fmtTime(t) {
    var h = t.h % 12 || 12;
    return h + ':' + pad(t.min) + (t.h < 12 ? 'am' : 'pm');
  }

  /* data/buildings.csv, already split into cells: a header row, then
     "building name, abbreviation" per line. */
  function buildingsFrom(rows) {
    return (rows || []).slice(1)
      .map(function (r) { return { name: String(r[0] || '').trim(), code: String(r[1] || '').trim() }; })
      .filter(function (b) { return b.name && b.code; })
      // "McCarty Hall A" before a plain "McCarty Hall".
      .sort(function (a, b) { return b.name.length - a.name.length; });
  }

  function lower(s) { return String(s).toLowerCase(); }

  /* "Turlington Hall - Turlington Hall L005" -> "TURL L005" with an
     abbreviation for the building, else "Turlington Hall L005": EMS names
     the building, then the room, which repeats the building. */
  function shortRoom(s, buildings) {
    var text = String(s || '').replace(/\s+/g, ' ').trim().replace(/\s+-$/, '');
    var m = text.match(/^(.+?)\s+-\s+(.+)$/);
    var building = m ? m[1] : '';
    var room = m ? m[2] : text;

    var known = (buildings || []).find(function (b) {
      return lower(building || room).indexOf(lower(b.name)) !== -1;
    });
    if (known) {
      // The room number is what follows the building's name, wherever EMS
      // put it: "Turlington Hall L005", or "E221" on its own.
      var at = lower(room).indexOf(lower(known.name));
      var number = at === -1 ? room : room.slice(at + known.name.length);
      return (known.code + ' ' + number.replace(/^[\s,-]+/, '')).trim();
    }
    if (!m) return text;
    return lower(room).indexOf(lower(building)) === 0 ? room : building + ' ' + room;
  }

  /* bookings: [{date: {y,m,d}, start: {h,min}, end: {h,min}, room}] */
  function format(bookings, buildings) {
    return bookings
      .slice()
      .sort(function (a, b) {
        return (a.date.y - b.date.y) || (a.date.m - b.date.m) || (a.date.d - b.date.d) ||
          ((a.start ? a.start.h * 60 + a.start.min : 0) - (b.start ? b.start.h * 60 + b.start.min : 0));
      })
      .map(function (b) {
        return [fmtDate(b.date), b.start && b.end ? fmtTime(b.start) + ' - ' + fmtTime(b.end) : '', shortRoom(b.room, buildings)]
          .filter(Boolean).join(', ');
      })
      .join('\n');
  }

  /* ---------- the reservation summary page ---------- */

  var CLOCK = /(\d{1,2}):(\d{2})\s*([ap])\.?\s*m\.?/gi;

  function clockTimes(text) {
    var out = [];
    var m;
    CLOCK.lastIndex = 0;
    while ((m = CLOCK.exec(text))) {
      var h = +m[1] % 12 + (m[3].toLowerCase() === 'p' ? 12 : 0);
      out.push({ h: h, min: +m[2] });
    }
    return out;
  }

  function dateIn(text) {
    var b = B.parse(text).bookings.find(function (x) { return x.date; });
    if (!b) return null;
    var p = b.date.split('/');
    return { y: +p[2], m: +p[0], d: +p[1] };
  }

  /* One booking row's text and its room link's text. A row EMS marks
     cancelled is no Booking. */
  function fromRow(text, room) {
    if (/\bcancel+ed\b/i.test(text)) return null;
    var date = dateIn(text.replace(room, ' '));
    if (!date) return null;
    var times = clockTimes(text);
    return { date: date, start: times[0] || null, end: times[1] || null, room: room };
  }

  /* An element's text with a space between every piece, so neighbouring
     cells never run together ("10/13/2026" + "6:00 PM"). */
  function textWithGaps(el) {
    var parts = [];
    var walk = el.ownerDocument.createTreeWalker(el, 4 /* NodeFilter.SHOW_TEXT */);
    while (walk.nextNode()) parts.push(walk.currentNode.nodeValue);
    return parts.join(' ').replace(/\s+/g, ' ').trim();
  }

  /* A room link reads "Building - Room"; its row is the nearest ancestor
     that also carries a date. */
  function readPage(doc) {
    var seen = [];
    var out = [];
    Array.prototype.forEach.call(doc.querySelectorAll('a'), function (a) {
      var room = (a.textContent || '').replace(/\s+/g, ' ').trim();
      if (!/\S\s+-(\s+\S|$)/.test(room)) return;
      for (var row = a.parentElement, depth = 0; row && depth < 6; row = row.parentElement, depth++) {
        var text = textWithGaps(row);
        if (dateIn(text.replace(room, ' '))) {
          if (seen.indexOf(row) !== -1) return;
          seen.push(row);
          var b = fromRow(text, room);
          if (b) out.push(b);
          return;
        }
      }
    });
    return out;
  }

  /* ---------- .ics ---------- */

  function unescapeIcs(s) {
    return String(s).replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1');
  }

  /* 20261006T180000 (local), or ...Z (UTC, shown in this computer's zone). */
  function icsMoment(v) {
    var m = String(v).match(/(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?/);
    if (!m) return null;
    if (m[7]) {
      var d = new Date(Date.UTC(+m[1], m[2] - 1, +m[3], +m[4], +m[5]));
      return { date: { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate() },
               time: { h: d.getHours(), min: d.getMinutes() } };
    }
    return { date: { y: +m[1], m: +m[2], d: +m[3] },
             time: m[4] ? { h: +m[4], min: +m[5] } : null };
  }

  function fromIcs(text) {
    // Long lines are folded onto continuation lines that start with a space.
    var lines = String(text || '').replace(/\r\n?/g, '\n').replace(/\n[ \t]/g, '').split('\n');
    var out = [];
    var ev = null;
    lines.forEach(function (line) {
      if (/^BEGIN:VEVENT/i.test(line)) { ev = {}; return; }
      if (/^END:VEVENT/i.test(line)) {
        if (ev && ev.start && !/cancel/i.test(ev.status || '')) {
          out.push({ date: ev.start.date, start: ev.start.time, end: ev.end && ev.end.time, room: ev.location || '' });
        }
        ev = null;
        return;
      }
      if (!ev) return;
      var m = line.match(/^([A-Z-]+)(?:;[^:]*)?:(.*)$/i);
      if (!m) return;
      var key = m[1].toUpperCase();
      if (key === 'DTSTART') ev.start = icsMoment(m[2]);
      else if (key === 'DTEND') ev.end = icsMoment(m[2]);
      else if (key === 'LOCATION') ev.location = unescapeIcs(m[2]);
      else if (key === 'STATUS') ev.status = m[2];
    });
    return out;
  }

  return { format: format, shortRoom: shortRoom, buildingsFrom: buildingsFrom, fromRow: fromRow, readPage: readPage, fromIcs: fromIcs };
})(typeof UFRA_BOOKINGS !== 'undefined' ? UFRA_BOOKINGS : require('./bookings.js'));

if (typeof module !== 'undefined') module.exports = UFRA_FINALIZE;
