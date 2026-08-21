/* Labels that must NOT be confidently autofilled. */
const SCHEMA = require('../src/schema.js');
const MATCH = require('../src/matcher.js');

const fields = [
  { label: 'Contact Email', canon: 'contactEmail', value: 'me@ufl.edu' },
  { label: 'Location', canon: 'location', value: 'Reitz Union 2365' },
  { label: 'Organization Name', canon: 'orgName', value: 'Citrus Growers Club' },
  { label: 'Start Time', canon: 'startTime', value: '3:00 PM' },
  { label: 'Expected Attendance', canon: 'attendance', value: '75' }
];

const cases = [
  ['Emergency Contact Email',   'not-confident'],
  ['Alternate Location',        'not-confident'],
  ['Rain Location',             'not-confident'],
  ['Setup Start Time',          'not-confident'],
  ['Confirm Email Address',     'not-confident'],
  ['Vendor Organization Name',  'not-confident'],
  ['Parking Pass Number',       'none'],
  ['Credit Card Number',        'none'],
  ['Email Address',             'confident'],
  ['Expected Attendance',       'confident']
];

let failures = 0;
for (const [label, expect] of cases) {
  const m = MATCH.findValue(label, fields);
  const got = !m ? 'none' : (m.confidence === 'confident' ? 'confident' : 'not-confident');
  const ok = got === expect || (expect === 'not-confident' && got === 'none');
  if (!ok) failures++;
  console.log((ok ? 'ok  ' : 'FAIL') + '  ' + label.padEnd(26) +
    got.padEnd(15) + (m ? m.score.toFixed(2) + ' <- ' + m.label : ''));
}
console.log(failures ? `\n${failures} failure(s)` : '\nall edge cases pass');
process.exit(failures ? 1 : 0);
