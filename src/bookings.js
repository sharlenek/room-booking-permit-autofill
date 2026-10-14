/* Reads the Bookings out of a free-text cell -- the club's Finalized
   Information column above all, which is written by hand:

     "8/30/26 / 9:00am-7pm / Reitz G320"      one Booking over three lines
     "9/17/2026: WEIL 0273" ...               one Booking per line
     "LIT0125, 9/24, 6:30-8:30PM"             no year, no am/pm on the start
     "11/24/26: holiday", "cancelled"         Bookings that are not happening

   Dates come back as "M/D/YYYY" and times as "h:mmam", or null. */
var UFRA_BOOKINGS = (function () {

  var MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

  // 9/24, 8/25/26, 9.5.26, 01/17/2027 -- never part of a room number.
  var NUM_DATE = '(?<![\\w/.])(\\d{1,2})[/.](\\d{1,2})(?:[/.](\\d{4}|\\d{2}))?(?![\\d/])';
  // February 9th, Feb 9, 2027
  var NAME_DATE = '\\b(' + MONTHS.join('|') + ')[a-z]*\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b';
  // 6:00 PM, 5pm, 5:30 -- never the tail of a room number like LIT0121.
  var T = '(?<![\\w:/.])(\\d{1,2})(?::(\\d{2}))?\\s*(?:([ap])\\.?\\s*m\\.?)?';
  var RANGE = T + '\\s*(?:-|–|—|to)\\s*' + T.replace('(?<![\\w:/.])', '') + '(?![\\d/])';

  var DATE_RE = new RegExp(NUM_DATE + '|' + NAME_DATE, 'gi');
  var RANGE_RE = new RegExp(RANGE, 'gi');
  var NOT_HAPPENING = /\b(holiday|cancel+ed|cancel)\b/i;

  function fmtTime(h, min, ap) {
    return h + ':' + (min < 10 ? '0' : '') + min + ap + 'm';
  }

  /* One time range, with am/pm settled. A side without am/pm takes the
     other's, unless that would put the end before the start ("11-1pm").
     With neither side marked, a start of 1-9 o'clock is taken as pm -- club
     events are afternoons and evenings -- and flagged as a guess. */
  function readRange(m) {
    var h1 = +m[1], min1 = +(m[2] || 0), a1 = m[3] && m[3].toLowerCase();
    var h2 = +m[4], min2 = +(m[5] || 0), a2 = m[6] && m[6].toLowerCase();
    if (h1 > 12 || h2 > 12 || min1 > 59 || min2 > 59 || !h1 || !h2) return null;
    var guessed = !a1 && !a2;
    if (guessed) a1 = h1 >= 1 && h1 <= 9 ? 'p' : 'a';
    if (!a1) a1 = (h1 > h2 && h1 !== 12 && a2 === 'p') ? 'a' : a2;
    if (!a2) a2 = (h2 < h1 && h1 !== 12 || h2 === 12) && a1 === 'a' ? 'p' : a1;
    return { start: fmtTime(h1, min1, a1), end: fmtTime(h2, min2, a2), guessed: guessed };
  }

  /* A date written without a year takes whichever year puts it nearest
     the reference date: "February 9th" in an autumn sheet is next February. */
  function nearestYear(mo, d, ref) {
    var refT = Date.UTC(ref.y, ref.m - 1, ref.d);
    return [ref.y - 1, ref.y, ref.y + 1].reduce(function (best, y) {
      return Math.abs(Date.UTC(y, mo - 1, d) - refT) < Math.abs(Date.UTC(best, mo - 1, d) - refT) ? y : best;
    });
  }

  function readDate(m, ref) {
    var mo, d, y;
    if (m[1]) { mo = +m[1]; d = +m[2]; y = m[3]; }
    else { mo = MONTHS.indexOf(m[4].slice(0, 3).toLowerCase()) + 1; d = +m[5]; y = m[6]; }
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    y = y ? (y.length === 2 ? 2000 + +y : +y) : nearestYear(mo, d, ref);
    return { date: mo + '/' + d + '/' + y, yearGuessed: !m[3] && !m[6] };
  }

  /* "Little Hall 0221, 4:00–8:00 PM & Little Hall 0205, 6:00–8:00 PM" is
     two Bookings; "Courts 9 A&B & 10 A&B" is one. */
  function splitLines(text) {
    var out = [];
    String(text || '').split(/\n|;/).forEach(function (line) {
      var parts = line.split(/\s+&\s+/);
      var timed = parts.filter(function (p) { RANGE_RE.lastIndex = 0; return RANGE_RE.test(p); });
      if (parts.length > 1 && timed.length === parts.length) out.push.apply(out, parts);
      else out.push(line);
    });
    return out;
  }

  function placeIn(line) {
    return line
      .replace(DATE_RE, ' ').replace(RANGE_RE, ' ')
      .replace(/^[\s•*\-–]+/, '')
      .replace(/\b(on|from|at)\b/gi, ' ')
      .replace(/<-/g, ' ')
      .replace(/\s*[,:]\s*(?=[,:]|$)/g, '')
      .replace(/^[\s,:.\-–]+|[\s,:.\-–]+$/g, '')
      .replace(/\s{2,}/g, ' ');
  }

  /* ref ({y, m, d}, default today) places dates written without a year. */
  function parse(text, ref) {
    if (!ref) {
      var now = new Date();
      ref = { y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() };
    }
    var bookings = [];
    var cur = null;
    splitLines(text).forEach(function (line) {
      DATE_RE.lastIndex = 0;
      RANGE_RE.lastIndex = 0;
      var dm = DATE_RE.exec(line);
      var rm = RANGE_RE.exec(line);
      var date = dm && readDate(dm, ref);
      var range = rm && readRange(rm);
      var place = placeIn(line);
      if (!date && !range && !place) return;

      // A date starts a new Booking once the current one has a date or a
      // time; a second time range starts one on the same date.
      var fresh = !cur || (date && (cur.date || cur.start)) || (!date && range && cur.start);
      if (fresh) {
        cur = { date: date ? null : (range && cur ? cur.date : null), start: null, end: null,
                place: '', guessed: false, skip: false };
        bookings.push(cur);
      }
      if (date) { cur.date = date.date; cur.guessed = cur.guessed || date.yearGuessed; }
      if (range) { cur.start = range.start; cur.end = range.end; cur.guessed = cur.guessed || range.guessed; }
      if (NOT_HAPPENING.test(place)) { cur.skip = true; place = ''; }
      if (place) cur.place = cur.place ? cur.place + ', ' + place : place;
    });

    var happening = bookings.filter(function (b) { return !b.skip; });
    return {
      bookings: happening,
      cancelled: !happening.length && bookings.some(function (b) { return b.skip; })
    };
  }

  return { parse: parse };
})();

if (typeof module !== 'undefined') module.exports = UFRA_BOOKINGS;
