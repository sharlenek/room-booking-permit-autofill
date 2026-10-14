/* A row copied straight out of the club's events sheet: tab-separated, a
   quoted multi-line cell, tracking columns and unlabelled trailing columns. */
const CSV = require('../src/csv.js');
const MATCH = require('../src/matcher.js');
const ROW = require('../src/row.js');

const T = '\t';
const HEADER = [
  'Name', 'Event name', 'Estimated attendance', 'Reservation Date',
  'Reservation date and time (e.g. 09/16/2024, 6:00pm - 8:00pm)', 'Room preference',
  'Please provide a detailed description and the purpose of your event (1-2 sentences).',
  "If you are collaborating with other organizations or non-UF groups, please list each group's name, description, and contact info.",
  'Is your event one of the following?',
  "If you are advertising an event, list the event's name, date, and location.",
  'Preferred room setup',
  'If requesting a space at Reitz, how many tables and chairs are needed?',
  'Please list any additional setup needs or requests for your event.',
  'Finalized Information', 'Room Confirmation', 'room request submitted', 'permit submitted',
  'room approved', 'permit approved', 'notes', 'price (if applicable)', 'paid?',
  '', '', '', '', '', 'priority', '', '', ''
].join(T);

const ROW1 = [
  'Alex Rivera', 'SERC 2027', '300', '1/17/2027', '01/17/2027, 7:00am - 8:00 pm ',
  'Grand Ballroom, Rion Ballroom', 'Host research symposium, career fair, and opening/closing ceremony',
  '', 'Room booking in Reitz Union', '', 'Banquet', 'chairs: 300, rectangle tables: 35',
  'Microphones, speakers, presentation resources (projection), stage',
  '"01/17/2027,\n9:00am - 8:00 pm "', 'Request Received.pdf', 'TRUE', 'TRUE', 'TRUE', 'TRUE',
  '"$430 for room bookings\nmust be cancelled 6 weeks before"', '$430', 'FALSE',
  '', '', '', '', '', 'shar', 'board meeting', '27', '8/24/2026'
].join(T);

let failures = 0;
function check(name, ok, detail) {
  if (!ok) failures++;
  console.log((ok ? 'ok    ' : 'FAIL  ') + name + (detail ? '  ' + detail : ''));
}

// Header pasted once in settings, then just the row.
const headers = CSV.parse(HEADER)[0];
const pasted = ROW.readPaste(ROW1, headers);
check('one row read with saved headers', !pasted.error && pasted.rows.length === 1, pasted.error);
check('quoted multi-line cell stays one cell',
  pasted.rows[0][13] === '01/17/2027,\n9:00am - 8:00 pm' && pasted.rows[0][14] === 'Request Received.pdf');

// Header and row pasted together, no saved headers.
const both = ROW.readPaste(HEADER + '\n' + ROW1, []);
check('header + row read together', !both.error && both.headerIncluded && both.rows.length === 1);
check('lone row without headers is refused', !!ROW.readPaste(ROW1, []).error);

const fields = ROW.toFields(pasted.headers, pasted.rows[0], {});
const labels = fields.map((f) => f.label);
for (const off of ['Name', 'notes', 'price (if applicable)', 'paid?', 'priority',
  'room request submitted', 'Finalized Information', 'Room Confirmation']) {
  check('tracking column off: ' + off, !labels.includes(off));
}
check('unlabelled columns dropped', !fields.some((f) => !f.label || f.value === 'shar'));

const want = {
  'Event Name': 'SERC 2027',
  'Event Date': '1/17/2027',
  'Start Time': '7:00am',
  'End Time': '8:00pm',
  'Indicate how many people you expect to attend.': '300',
  'Location': 'Grand Ballroom, Rion Ballroom',
  'Provide a detailed description of and the purpose for the meeting or event.':
    'Host research symposium, career fair, and opening/closing ceremony',
  'Indicate the preferred room setup type.': 'Banquet',
  'Indicate any additional setup needs or requests for your event.':
    'Microphones, speakers, presentation resources (projection), stage'
};
for (const [label, value] of Object.entries(want)) {
  const m = MATCH.findValue(label, fields);
  check(label.slice(0, 50), m && m.value === value,
    m ? `<- ${m.label} = ${m.value} (${m.confidence})` : 'BLANK');
}

for (const label of ['Additional notes', 'Comments', 'Contact Name', 'Organization Name']) {
  const m = MATCH.findValue(label, fields);
  check('left blank: ' + label, !m, m ? `<- ${m.label} = ${m.value}` : '');
}

const split = (v) => JSON.stringify(ROW.splitDateTimeRange(v));
check('range with lone meridiem', split('6 - 8pm') === '{"date":null,"start":"6pm","end":"8pm"}', split('6 - 8pm'));
check('plain text is not a range', ROW.splitDateTimeRange('Grand Ballroom') === null);

console.log(failures ? `\n${failures} failure(s)` : '\nall paste checks pass');
process.exitCode = failures ? 1 : 0;
