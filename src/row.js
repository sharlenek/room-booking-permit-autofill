/* Turns a row copied out of the events sheet into the fields the matcher
   scores, using the header row saved once on the options page. */
var UFRA_ROW = (function (CSV, M, B) {

  /* Columns that track the request rather than describe the event. They are
     off by default so "notes" or "price" never land in a form prompt; the
     options page can switch any column back on. A bare "Name" is too generic
     to trust -- it would match Organization Name, Event Name, Contact Name. */
  var TRACKING = /\b(submitted|approved|confirmation|finalized|paid|price|priority|notes?)\b/i;

  function defaultUse(header) {
    var h = String(header || '').trim();
    if (!h) return false;
    if (/^name$/i.test(h)) return false;
    return !TRACKING.test(h);
  }

  function isUsed(header, overrides) {
    if (overrides && Object.prototype.hasOwnProperty.call(overrides, header)) {
      return !!overrides[header];
    }
    return defaultUse(header);
  }

  function annotate(label, value, canon) {
    if (canon === undefined) {
      var hit = M.headerToCanon(label);
      canon = hit ? hit.canon : null;
    }
    return { label: label, value: value, canon: canon };
  }

  var TIME = '(\\d{1,2}(?::\\d{2})?\\s*(?:[ap]\\.?m\\.?)?)';
  var DATE = '(\\d{1,2}/\\d{1,2}/\\d{2,4})';
  var DATE_TIME_RANGE = new RegExp(
    '^(?:' + DATE + '\\s*,?\\s*)?' + TIME + '\\s*(?:-|–|—|to)\\s*' + TIME + '$', 'i');

  function meridiem(t) {
    var m = t.match(/([ap])\.?m\.?$/i);
    return m ? m[1].toLowerCase() + 'm' : '';
  }

  /* "01/17/2027, 7:00am - 8:00 pm" -> date, start time and end time. The
     date is unpadded so it agrees with a separate "Reservation Date" column
     written as 1/17/2027 rather than reading as a second, different date. */
  function splitDateTimeRange(value) {
    var m = String(value || '').replace(/\s+/g, ' ').trim().match(DATE_TIME_RANGE);
    if (!m) return null;
    var start = m[2].replace(/\s+/g, '');
    var end = m[3].replace(/\s+/g, '');
    // "6 - 8pm" means 6pm.
    if (!meridiem(start) && meridiem(end)) start += meridiem(end);
    var date = m[1] ? m[1].split('/').map(function (n) { return String(+n); }).join('/') : null;
    return { date: date, start: start, end: end };
  }

  function refOf(date) {
    var p = String(date || '').split('/');
    return p.length === 3 ? { y: +p[2], m: +p[0], d: +p[1] } : null;
  }

  /* The Bookings an event actually has. Finalized Information wins for
     whatever it states -- a date, a time, a room -- and anything it leaves
     out comes from the requested date-and-time column: "LIT0121, 5-8pm"
     keeps the requested date, "9/10/2026, CSE222" the requested time.
     Returns {source, cancelled, sessions: [{date, start, end, place,
     guessed}], requested: the request's own sessions, for booking a room},
     or null when the row has no schedule at all. */
  function schedule(headers, values) {
    var finalized = null;
    var requested = null;   // a column with dates and times together
    var datesOnly = null;   // "Reservation Date": 11/4/2026
    var timesOnly = null;   // "Reservation date and time": 5:30pm - 8:30pm
    headers.forEach(function (header, i) {
      var h = String(header || '');
      if (/finali[sz]ed/i.test(h)) { finalized = { label: h, value: values[i] }; return; }
      // Only a date or time column is ever the request; a description that
      // mentions "on 9/24 from 6-8pm" is not, and its prose is not a room.
      if (!/date|time/i.test(h)) return;
      var read = B.parse(values[i]);
      var dated = read.bookings.filter(function (b) { return b.date; });
      var timed = read.bookings.filter(function (b) { return b.start; });
      if (dated.some(function (b) { return b.start; })) {
        // A column headed with "time" beats one that merely mentions a time
        // range in passing.
        if (!requested || (/time/i.test(h) && !/time/i.test(requested.label))) {
          requested = { label: h, read: read };
        }
      } else if (dated.length && !datesOnly) {
        datesOnly = { label: h, bookings: dated };
      } else if (timed.length && !timesOnly) {
        timesOnly = { label: h, bookings: timed };
      }
    });

    // The date in one column and the time in another: each requested date
    // takes the requested time.
    if (!requested && datesOnly && timesOnly) {
      var t = timesOnly.bookings[0];
      requested = { label: datesOnly.label + ' + ' + timesOnly.label, read: { bookings:
        datesOnly.bookings.map(function (d) {
          return { date: d.date, start: t.start, end: t.end, place: '', guessed: d.guessed || t.guessed };
        }) } };
    }

    // The request says when, never where: the room comes from Finalized
    // Information or the room preference column.
    var req = requested ? requested.read.bookings.map(function (b) {
      return { date: b.date, start: b.start, end: b.end, place: '', guessed: b.guessed };
    }) : [];
    var fin = finalized ? B.parse(finalized.value, req.length ? refOf(req[0].date) : null)
                        : { bookings: [], cancelled: false };
    if (fin.cancelled) return { source: finalized.label, cancelled: true, sessions: [], requested: req, requestedLabel: requested ? requested.label : '' };
    if (!fin.bookings.length) {
      return requested ? { source: requested.label, cancelled: false, sessions: req, requested: req, requestedLabel: requested ? requested.label : '' } : null;
    }

    function merge(f, r) {
      r = r || {};
      return {
        date: f.date || r.date || null,
        start: f.start || r.start || null,
        end: f.start ? f.end : (r.end || null),
        place: f.place || '',
        guessed: f.guessed
      };
    }
    var sessions;
    if (fin.bookings.length === 1 && !fin.bookings[0].date && req.length) {
      // One undated line ("Reitz 2355") applies to every requested date.
      sessions = req.map(function (r) { return merge(fin.bookings[0], r); });
    } else {
      sessions = fin.bookings.map(function (f) {
        return merge(f, req.find(function (r) { return r.date === f.date; }) || req[0]);
      });
    }
    return { source: finalized.label, cancelled: false, sessions: sessions, requested: req, requestedLabel: requested ? requested.label : '' };
  }

  /* headers: the saved header row. values: one data row, same order. */
  function toFields(headers, values, overrides) {
    var out = [];
    headers.forEach(function (header, i) {
      var label = String(header || '').trim();
      var value = String(values[i] == null ? '' : values[i]).trim();
      if (!isUsed(label, overrides) || !value) return;

      var range = splitDateTimeRange(value);
      if (range) {
        // The combined text only matches a prompt worded like its column.
        out.push(annotate(label, value, null));
        if (range.date) out.push(annotate(label + ' › date', range.date, 'eventDate'));
        out.push(annotate(label + ' › start', range.start, 'startTime'));
        out.push(annotate(label + ' › end', range.end, 'endTime'));
        return;
      }
      out.push(annotate(label, value));
    });
    return out;
  }

  function sameHeaders(row, headers) {
    var a = row.map(norm).filter(Boolean);
    var b = headers.map(norm).filter(Boolean);
    if (!a.length || !b.length) return false;
    var hits = a.filter(function (h) { return b.indexOf(h) !== -1; }).length;
    return hits / a.length >= 0.6;
  }

  function norm(s) { return String(s || '').trim().toLowerCase(); }

  /* Reads whatever was pasted: one or more data rows, optionally with the
     header row on top. Returns {headers, rows, headerIncluded} or {error}. */
  function readPaste(text, savedHeaders) {
    var rows = CSV.parse(text).filter(function (r) {
      return r.some(function (v) { return v && v.trim(); });
    });
    if (!rows.length) return { error: 'Nothing pasted.' };

    var saved = savedHeaders || [];
    if (saved.length && sameHeaders(rows[0], saved)) {
      return rows.length > 1
        ? { headers: rows[0], rows: rows.slice(1), headerIncluded: true }
        : { error: 'That is the header row. Paste an event row below it.' };
    }
    if (saved.length) return { headers: saved, rows: rows, headerIncluded: false };
    if (rows.length > 1) return { headers: rows[0], rows: rows.slice(1), headerIncluded: true };
    return { error: 'Save your sheet’s header row in settings first, or paste the header row together with the event row.' };
  }

  return {
    defaultUse: defaultUse,
    isUsed: isUsed,
    splitDateTimeRange: splitDateTimeRange,
    schedule: schedule,
    toFields: toFields,
    readPaste: readPaste
  };
})(typeof UFRA_CSV !== 'undefined' ? UFRA_CSV : require('./csv.js'),
   typeof UFRA_MATCH !== 'undefined' ? UFRA_MATCH : require('./matcher.js'),
   typeof UFRA_BOOKINGS !== 'undefined' ? UFRA_BOOKINGS : require('./bookings.js'));

if (typeof module !== 'undefined') module.exports = UFRA_ROW;
