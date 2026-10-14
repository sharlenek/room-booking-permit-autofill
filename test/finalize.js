/* Finalized Information written from an EMS reservation summary page and
   from an .ics file, and read back the same way a pasted row is. */
const { JSDOM } = require('jsdom');
const F = require('../src/finalize.js');
const B = require('../src/bookings.js');

let failures = 0;
function check(name, got, want) {
  const ok = got === want;
  if (!ok) failures++;
  console.log((ok ? 'ok    ' : 'FAIL  ') + name.padEnd(36) +
    (ok ? JSON.stringify(got).slice(0, 70) : `\n      got  ${JSON.stringify(got)}\n      want ${JSON.stringify(want)}`));
}

// The bookings list on ReservationSummary.aspx: one row per booking, the
// room as a "Building - Room" link, plus the page's own navigation links.
const row = (date, start, end, building, room, status) => `<tr>
  <td>${date}</td><td>${start}</td><td>${end}</td>
  <td><a href="#">${building} - ${room}</a></td><td>${status}</td></tr>`;
const doc = new JSDOM(`<nav><a href="#">LAW-Courtyard Diagram</a><a href="#">Reitz Union Event Services</a></nav>
  <table>
    <tr><th>Date</th><th>Start</th><th>End</th><th>Location</th><th>Status</th></tr>
    ${row('Tue 10/13/2026', '6:00 PM', '7:00 PM', 'Turlington Hall', 'Turlington Hall L005', 'Confirmed')}
    ${row('Tue 10/06/2026', '6:00 PM', '8:00 PM', 'Leigh Hall', 'Leigh Hall 0207', 'Confirmed')}
    ${row('Tue 10/20/2026', '6:00 PM', '7:00 PM', 'Turlington Hall', 'Turlington Hall L011', 'Cancelled')}
    ${row('Fri 10/30/2026', '6:30 PM', '8:00 PM', 'Computer Sciences Engineering Building', 'E221', 'Confirmed')}
  </table>`).window.document;

const fromPage = F.format(F.readPage(doc));
check('from the summary page', fromPage, [
  '10/06/2026, 6:00pm - 8:00pm, Leigh Hall 0207',
  '10/13/2026, 6:00pm - 7:00pm, Turlington Hall L005',
  '10/30/2026, 6:30pm - 8:00pm, Computer Sciences Engineering Building E221'
].join('\n'));

const ICS = [
  'BEGIN:VCALENDAR', 'VERSION:2.0',
  'BEGIN:VEVENT', 'DTSTART;TZID=America/New_York:20261006T180000', 'DTEND;TZID=America/New_York:20261006T200000',
  'LOCATION:Leigh Hall - Leigh Hall 0207', 'SUMMARY:GBM', 'END:VEVENT',
  'BEGIN:VEVENT', 'DTSTART:20261013T180000', 'DTEND:20261013T190000',
  'LOCATION:Turlington Hall - Turlington Hall L0', ' 05', 'END:VEVENT',
  'BEGIN:VEVENT', 'DTSTART:20261020T180000', 'DTEND:20261020T190000', 'STATUS:CANCELLED',
  'LOCATION:Turlington Hall - Turlington Hall L011', 'END:VEVENT',
  'END:VCALENDAR'
].join('\r\n');
const fromIcs = F.format(F.fromIcs(ICS));
check('from an .ics file', fromIcs, [
  '10/06/2026, 6:00pm - 8:00pm, Leigh Hall 0207',
  '10/13/2026, 6:00pm - 7:00pm, Turlington Hall L005'
].join('\n'));

// What we write must read back as the same Bookings.
const back = B.parse(fromPage).bookings.map((b) => `${b.date} ${b.start}-${b.end} ${b.place}`);
check('reads back as Bookings', back.join(' | '),
  '10/6/2026 6:00pm-8:00pm Leigh Hall 0207 | 10/13/2026 6:00pm-7:00pm Turlington Hall L005 | ' +
  '10/30/2026 6:30pm-8:00pm Computer Sciences Engineering Building E221');

check('room: building repeated', F.shortRoom('Turlington Hall - Turlington Hall L005'), 'Turlington Hall L005');
check('room: building not repeated', F.shortRoom('Reitz Union - 2365'), 'Reitz Union 2365');

// Building abbreviations from data/buildings.csv.
const CSV = require('../src/csv.js');
const BLD = F.buildingsFrom(CSV.parse(require('fs').readFileSync(__dirname + '/../data/buildings.csv', 'utf8')));
for (const [room, want] of [
  ['Turlington Hall - Turlington Hall L005', 'TURL L005'],
  ['McCarty Hall A - McCarty Hall A G186', 'MCCA G186'],
  ['McCarty Hall B - McCarty Hall B 1142', 'MCCB 1142'],
  ['Computer Sciences Engineering Building - E221', 'CSE E221'],
  ['Little Hall 0125', 'LIT 0125'],
  ['J. Wayne Reitz Union - Reitz Union 2365', 'Reitz 2365'],
  ['Florida Gymnasium - Florida Gymnasium 0230', 'Florida Gymnasium 0230']
]) check('abbreviate: ' + room.slice(0, 26), F.shortRoom(room, BLD), want);
check('abbreviated page output', F.format(F.readPage(doc), BLD), [
  '10/06/2026, 6:00pm - 8:00pm, LEIGH 0207',
  '10/13/2026, 6:00pm - 7:00pm, TURL L005',
  '10/30/2026, 6:30pm - 8:00pm, CSE E221'
].join('\n'));

console.log(failures ? `\n${failures} failure(s)` : '\nall finalize checks pass');
process.exitCode = failures ? 1 : 0;
