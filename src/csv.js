/* Minimal RFC-4180 CSV parser. Handles quoted fields, embedded commas,
   newlines and doubled quotes. Returns an array of string arrays. */
var UFRA_CSV = (function () {
  function parse(text) {
    var rows = [];
    var row = [];
    var field = '';
    var inQuotes = false;
    var i = 0;

    // Strip a UTF-8 BOM and normalise line endings.
    text = String(text || '').replace(/^﻿/, '').replace(/\r\n?/g, '\n');

    while (i < text.length) {
      var c = text[i];

      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
          inQuotes = false; i++; continue;
        }
        field += c; i++; continue;
      }

      if (c === '"') { inQuotes = true; i++; continue; }
      if (c === ',') { row.push(field); field = ''; i++; continue; }
      if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
      field += c; i++;
    }

    row.push(field);
    rows.push(row);

    // Drop trailing rows that are entirely blank.
    while (rows.length && rows[rows.length - 1].every(isBlank)) rows.pop();
    return rows.map(function (r) { return r.map(function (v) { return v.trim(); }); });
  }

  function isBlank(v) { return !v || !String(v).trim(); }

  /* An events sheet: first row is headers, each later row is one event. */
  function parseTable(text) {
    var rows = parse(text);
    if (!rows.length) return { headers: [], records: [] };
    var headers = rows[0];
    var records = rows.slice(1)
      .filter(function (r) { return r.some(function (v) { return !isBlank(v); }); })
      .map(function (r) {
        return headers.map(function (h, idx) {
          return { label: h, value: r[idx] === undefined ? '' : r[idx] };
        }).filter(function (f) { return !isBlank(f.label); });
      });
    return { headers: headers, records: records };
  }

  /* An org sheet, in either shape:
       key/value  -> two columns, one setting per row
       wide       -> header row + a single data row
     Returns one flat record: [{label, value}, ...] */
  function parseRecord(text) {
    var rows = parse(text).filter(function (r) {
      return r.some(function (v) { return !isBlank(v); });
    });
    if (!rows.length) return [];

    var widths = rows.map(function (r) { return r.filter(function (v) { return !isBlank(v); }).length; });
    var maxWidth = Math.max.apply(null, widths);

    // Two columns is ambiguous: it reads as either key/value or header+row.
    // Three or more rows can only be key/value; with exactly two rows we need
    // an explicit "Field,Value"-style header to choose it over header+row.
    var kvHeader = /^(field|key|item|name|property)$/i.test(rows[0][0] || '');
    if (maxWidth <= 2 && (rows.length > 2 || kvHeader)) {
      var start = kvHeader ? 1 : 0;
      return rows.slice(start)
        .filter(function (r) { return !isBlank(r[0]); })
        .map(function (r) { return { label: r[0], value: r[1] || '' }; });
    }

    var headers = rows[0];
    var data = rows[1] || [];
    return headers.map(function (h, idx) {
      return { label: h, value: data[idx] === undefined ? '' : data[idx] };
    }).filter(function (f) { return !isBlank(f.label); });
  }

  return { parse: parse, parseTable: parseTable, parseRecord: parseRecord };
})();

if (typeof module !== 'undefined') module.exports = UFRA_CSV;
