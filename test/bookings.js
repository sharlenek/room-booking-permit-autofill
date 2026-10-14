/* Cells from the club's real Finalized Information column. */
const B = require('../src/bookings.js');
const REF = { y: 2026, m: 10, d: 14 };

const CASES = [
  ['01/17/2027,\n9:00am - 8:00 pm ', ['1/17/2027 9:00am-8:00pm']],
  ['<-', []],
  ['8/25/26: Reitz Room 3310\n9/1/26: Reitz Room G325\n11/24/26: holiday\n12/1/26: Reitz Room 3305\n',
    ['8/25/2026 Reitz Room 3310', '9/1/2026 Reitz Room G325', '12/1/2026 Reitz Room 3305']],
  ['LIT0121, 5-8pm', ['5:00pm-8:00pm LIT0121']],
  ['8/30/26\n9:00am-7pm\nReitz G320', ['8/30/2026 9:00am-7:00pm Reitz G320']],
  ['9.5.26 from 5PM-8PM at SWRC Pickleball Courts 9 A&B & 10 A&B (4 courts in total).',
    ['9/5/2026 5:00pm-8:00pm SWRC Pickleball Courts 9 A&B & 10 A&B (4 courts in total)']],
  ['9/10/2026, CSE222', ['9/10/2026 CSE222']],
  ['LIT0125, 9/24, 6:30-8:30PM', ['9/24/2026 6:30pm-8:30pm LIT0125 ?']],
  ['• 09/21/2026: MCCA A G186 5:30-8\n• 09/21/2026: NPB1002 8-10pm',
    ['9/21/2026 5:30pm-8:00pm MCCA A G186 ?', '9/21/2026 8:00pm-10:00pm NPB1002']],
  ['NPB1001 4:30 to 8pm', ['4:30pm-8:00pm NPB1001']],
  ['Reitz Auditorium\nMatthews Suite\n2315, 2320, G330', ['Reitz Auditorium, Matthews Suite, 2315, 2320, G330']],
  ['Reitz 2365 on 10/19\nReitz 3315 on 11/9', ['10/19/2026 Reitz 2365 ?', '11/9/2026 Reitz 3315 ?']],
  ['Full Grand Ballroom, 4:30-8:30pm on February 9th', ['2/9/2027 4:30pm-8:30pm Full Grand Ballroom ?']],
  ['• 10/16/2026, Little Hall 0221, 4:00–8:00 PM & Little Hall 0205, 6:00–8:00 PM',
    ['10/16/2026 4:00pm-8:00pm Little Hall 0221', '10/16/2026 6:00pm-8:00pm Little Hall 0205']],
  ['• 10/06/2026, 6:15 PM–8:30 PM, Matherly Hall 0114', ['10/6/2026 6:15pm-8:30pm Matherly Hall 0114']],
  ['7:30-9:30 turl 2319', ['7:30pm-9:30pm turl 2319 ?']],
  ['11/11/2026, holiday', []]
];

let failures = 0;
for (const [cell, want] of CASES) {
  const got = B.parse(cell, REF).bookings.map((b) =>
    [b.date, b.start && b.start + '-' + b.end, b.place, b.guessed && '?'].filter(Boolean).join(' '));
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures++;
  console.log((ok ? 'ok    ' : 'FAIL  ') + JSON.stringify(cell).slice(0, 50).padEnd(52) +
    (ok ? got.length + ' booking(s)' : `\n      got  ${JSON.stringify(got)}\n      want ${JSON.stringify(want)}`));
}
const c = B.parse('cancelled', REF);
const ok = c.cancelled && !c.bookings.length;
if (!ok) failures++;
console.log((ok ? 'ok    ' : 'FAIL  ') + '"cancelled" marks the event cancelled');

console.log(failures ? `\n${failures} failure(s)` : '\nall bookings parse');
process.exitCode = failures ? 1 : 0;
