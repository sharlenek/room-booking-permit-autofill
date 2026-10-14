/* Real labels from "Registrar (Main Campus) Student Gp Request Fall 26",
   step 2. Marked with whether EMS had already filled the control, since the
   extension only ever writes to empty ones. */
const CSV = require('../src/csv.js');
const MATCH = require('../src/matcher.js');

const EMPTY = [
  'Event Name',
  '1st Contact Fax',
  '2nd Contact',
  '2nd Contact Phone',
  '2nd Contact Email Address',
  'Please provide a brief description of your requested event.',
  'Do you expect an attendance of 250 or more?',
  'Does your event feature a guest speaker (in person, online, etc.)? Guest speakers are any speaker who outside of your organization.',
  'Are you administering your event in collaboration with another organization?'
];

/* Statements of terms the user must accept. All already answered Yes here. */
const ACKNOWLEDGEMENTS = [
  'I understand that Registrar classrooms are instructional space designed for lecture style instruction and thus, should be used accordingly within reason.',
  'I acknowledge that food and drink are prohibited in all instructional spaces.',
  'I acknowledge that all chairs, tables or other furniture that is moved must be returned to its original location by the end of the appointed reservation time.',
  'I am aware that university classes and exams always take priority over events.',
  'Propping open exterior building doors can result in misuse of room space.',
  'The Registrar’s Office may decline room requests during peak periods when demand exceeds capacity and may reassign spaces as needed to ensure efficient use of facilities.'
];

const annotate = (fields) => fields.map((f) => {
  const hit = MATCH.headerToCanon(f.label);
  return { label: f.label, value: f.value, canon: hit ? hit.canon : null };
});

const org = annotate(CSV.parseRecord([
  'Field,Value',
  'Organization Name,Society of Asian Scientists and Engineers',
  'Contact Name,Sharlene Kho',
  'Contact Phone,8134827254',
  'Contact Email,ufsase.secretary@gmail.com',
  'Faculty Advisor,Malisa Sarntinoranont',
  'Faculty Advisor Email,msarnt@ufl.edu'
].join('\n')));

const event = annotate(CSV.parseTable([
  'Event Name,Event Type,Expected Attendance,Description,Guest Speaker,Co-Sponsors',
  'Fall General Body Meeting,Student Group Meeting,40,Monthly chapter meeting and officer updates.,No,No'
].join('\n')).records.map(annotate)[0]);

const fields = [...event, ...org];

function show(label) {
  const m = MATCH.findValue(label, fields);
  const status = m ? (m.confidence === 'confident' ? 'FILL  ' : 'review') : 'BLANK ';
  console.log(status + (m ? m.score.toFixed(2).padStart(5) : '     ') + '  ' +
    label.slice(0, 58).padEnd(60) + (m ? '<- ' + m.label + ' = ' + String(m.value).slice(0, 24) : ''));
}

console.log('=== controls EMS left empty ===');
EMPTY.forEach(show);
console.log('\n=== acknowledgements (never answered from sheet data; see test/answers.js) ===');
ACKNOWLEDGEMENTS.forEach(show);
