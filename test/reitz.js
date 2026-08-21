/* Real labels from the UF Reitz Union "Room Request for Student
   Organizations" step 2 (Reservation Details). */
const CSV = require('../src/csv.js');
const MATCH = require('../src/matcher.js');

const LABELS = [
  'Event Name',
  'Event Type',
  'Groups',
  '1st Contact',
  'Provide a detailed description of and the purpose for the meeting or event.',
  'Who is the intended audience for the event? (select all that apply)',
  'Will this event involve the exchange of money such as a ticket, registration, conference, admission, vendor or similar fee or donation?',
  'Are you collaborating on this event with another organization or are any non-University groups involved in the event?',
  'Will there be any high profile individuals, UF administrators, government officials, etc. invited to attend, speak or perform at the event?',
  'Does your meeting/event feature a guest speaker (in person, online, etc.)?',
  'Indicate any aspects of this request that may be flexible so we may make alternate recommendations when applicable.',
  'Indicate how many people you expect to attend.',
  'Indicate the preferred room setup type.',
  'Indicate any additional setup needs or requests for your event.',
  'Are you planning to serve food and/or beverages?',
  'Provide the registered student organization name as it appears on Gator Connect (no acronyms).',
  'Indicate the method of payment for this specific event in case there are fees associated with this reservation.',
  'Is your organization registered with the State of Florida as sales tax exempt?'
];

const annotate = (fields) => fields.map((f) => {
  const hit = MATCH.headerToCanon(f.label);
  return { label: f.label, value: f.value, canon: hit ? hit.canon : null };
});

const org = annotate(CSV.parseRecord([
  'Field,Value',
  'Organization Name,Citrus Growers Club',
  'Contact Email,sharlene@ufl.edu',
  'Payment Method,Departmental Transfer',
  'Sales Tax Exempt,No'
].join('\n')));

const event = annotate(CSV.parseTable([
  'Event Name,Event Type,Expected Attendance,Description,Intended Audience,Room Setup,Setup Notes,Food Served,Admission Fee,Co-Sponsors,Guest Speaker',
  'Grove Day Social,Social Event,75,Annual member social with citrus tasting.,Students,Rounds of 8,Need 4 extra trash bins,Yes,No,No,No'
].join('\n')).records.map(annotate)[0]);

const fields = [...event, ...org];
let matched = 0;
for (const label of LABELS) {
  const m = MATCH.findValue(label, fields);
  if (m) matched++;
  const status = m ? (m.confidence === 'confident' ? 'FILL  ' : 'review') : 'BLANK ';
  const score = m ? m.score.toFixed(2).padStart(5) : '     ';
  console.log(status + score + '  ' + label.slice(0, 60).padEnd(62) +
    (m ? '<- ' + m.label + ' = ' + String(m.value).slice(0, 22) : ''));
}
console.log(`\n${matched}/${LABELS.length} labels matched`);
