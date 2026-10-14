/* Step 2 of "Registrar (Main Campus) Student Gp Request Fall 26", as pasted
   from the live page: free-text Additional Information boxes and a run of
   "Choose one" Yes/No menus answered from data/answers.csv. */
const fs = require('fs');
const { JSDOM } = require('jsdom');

const TEXT = [
  ['orgName', 'Enter the full organization name as listed on Gator Connect (no acronyms)'],
  ['advisor', "Please provide the name of your student organization's advisor as well as their contact phone number and email."],
  ['desc', 'Please provide a brief description of your requested event.']
];

// [prompt, answer wanted]
const YES_NO = [
  ['I understand that Registrar classrooms are instructional space designed for lecture style instruction and thus, should be used accordingly within reason. Registrar classrooms are ideal spaces for general meetings and club interactions.', 'Yes'],
  ['Classrooms should not be used as recreational spaces (e.g., physical activities such as workouts), rehearsal spaces, or art studios involving materials that could damage the room (e.g., glue, clay, paint, etc). (Yes or No)', 'Yes'],
  ['Do you expect an attendance of 250 or more?', 'No'],
  ['Does your event feature a guest speaker (in person, online, etc.)? Guest speakers are any speaker who outside of your organization.', 'No'],
  ['Will you event discuss sensitive topics (e.g. political, religious, etc.) that may result in uninvited guests, press, protesters or community members?', 'No'],
  ['Are you administering your event in collaboration with another organization?', 'No'],
  ['Will any individual who is not enrolled at the University of Florida who is also under the age of 18 be attending this event? If so, you must contact the Office of Youth Compliance, https://youth.compliance.ufl.edu. Email: UF-Compliance@ufl.edu', 'No'],
  ['Will your event charge an admission fee, sell tickets, or involve any exchange of money?', 'No'],
  ['I understand that auditoria (generally rooms larger than 100 seats) may not be reserved week nights Periods E2-E3 (8:20 pm - 10:10 pm) in the Fall and Spring and Periods E1-E2 (7:00 pm - 9:45 pm) in the Summer semester due to the During Term Exam Policy.', 'Yes'],
  ['I acknowledge that food and drink are prohibited in all instructional spaces. Food may not be served, consumed, or disposed of in classrooms, and food waste must never be placed in classroom receptacles. Non-food waste must be disposed in receptacles.', 'Yes'],
  ['I acknowledge that all chairs, tables or other furniture that is moved must be returned to its original location by the end of the appointed reservation time.', 'Yes'],
  ['I acknowledge that any technology (computers, monitors, etc) used must be returned to its original state (chords and cables plugged in, devices returned to original places) by the end of the appointed reservation time.', 'Yes'],
  ['I acknowledge that playing music in or dancing in classrooms is prohibited with the exception of Sundays. On Sundays, events must be cognizant of the surroundings and must refrain from disrupting other events.', 'Yes'],
  ['I am aware that university classes and exams always take priority over events. If your reservation is bumped due to a newly scheduled class, you will receive an email and have the opportunity to reserve an alternate space.', 'Yes'],
  ["Propping open exterior building doors can result in misuse of room space. I understand that if an exterior building door is propped open for my event that the Registrar's Office may suspend use of classroom space in the future.", 'Yes'],
  ['The Registrar’s Office may decline room requests during peak periods when demand exceeds capacity and may reassign spaces as needed to ensure efficient use of facilities.', 'Yes']
];

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const html = '<form>' +
  '<div class="form-group"><label for="evName">Event Name</label><input id="evName" value="*Include Organization Name"></div>' +
  '<div class="form-group"><label for="groups">Groups *</label><select id="groups"><option value="0"></option>' +
  '<option value="9">Kho, Sam J</option><option value="12">RU-Citrus Growers &amp; Gardeners Club</option></select></div>' +
  // EMS fills these only after Groups changes, defaulting to the group's
  // first contact and that person's phone and email.
  '<div class="form-group"><label for="contact">1st Contact</label><select id="contact" disabled></select></div>' +
  '<div class="form-group"><label for="cPhone">1st Contact Phone *</label><input id="cPhone"></div>' +
  '<div class="form-group"><label for="cEmail">1st Contact Email Address *</label><input id="cEmail"></div>' +
  TEXT.map(([id, p]) => `<div class="form-group"><label for="${id}">${esc(p)}</label><textarea id="${id}"></textarea></div>`).join('') +
  YES_NO.map(([p], i) => `<div class="form-group"><label for="q${i}">${esc(p)}</label>
    <select id="q${i}"><option value="-1">Choose one</option><option value="1">Yes</option><option value="0">No</option></select></div>`).join('') +
  // Some acknowledgements offer only Yes.
  '<div class="form-group"><label for="ackOnly">I acknowledge the During Term Exam Policy.</label>' +
  '<select id="ackOnly"><option value="0"></option><option value="1">Yes, I understand</option></select></div>' +
  '</form>';

const dom = new JSDOM(html, { pretendToBeVisual: true, url: 'https://ufl.emscloudservice.com/web/ReservationDetails.aspx' });
Object.assign(global, { window: dom.window, document: dom.window.document, location: dom.window.location,
  getComputedStyle: dom.window.getComputedStyle, Event: dom.window.Event, CSS: dom.window.CSS });
dom.window.Element.prototype.getClientRects = function () { return [{ width: 10, height: 10 }]; };

const CSV = require('../src/csv.js');
const MATCH = require('../src/matcher.js');
const FILL = require('../src/fill.js');
const annotate = (fields) => fields.map((f) => {
  const hit = MATCH.headerToCanon(f.label);
  return { label: f.label, value: f.value, canon: hit ? hit.canon : null };
});

// Shaped like data/org.csv, including an unquoted comma in the address.
const org = annotate(CSV.parseRecord([
  'Field,Value',
  'Organization Name,Citrus Growers and Gardeners Club',
  'Organization Address,PO Box 1, Gainesville, FL 32611',
  'Contact Name,Sam Lee',
  'Contact Email,sam@ufl.edu',
  'Phone Number,352-555-0100',
  'Faculty Advisor,Dr. Reyes',
  'Faculty Advisor Email,reyes@ufl.edu',
  'Faculty Advisor Phone,352-555-0199'
].join('\n')));
const ANSWERS = require('../src/answers.js');
const answers = ANSWERS.fromCsvRows(CSV.parse(fs.readFileSync(__dirname + '/../data/answers.csv', 'utf8')));

const $ = (id) => document.getElementById(id);
$('groups').addEventListener('change', () => setTimeout(() => {
  $('contact').innerHTML = '<option value="7">Gregory Peiris</option><option value="8">Sam Lee</option>';
  $('contact').disabled = false;
  $('cPhone').value = '904.252.1099';
  $('cEmail').value = 'gregory@ufl.edu';
}, 50));
// Switching contact loads that person's record, which here is blank.
$('contact').addEventListener('change', () => setTimeout(() => {
  $('cPhone').value = '';
  $('cEmail').value = '';
}, 50));

// jsdom's selectedOptions goes stale after selectedIndex changes.
const chosen = (id) => { const s = document.getElementById(id); return s.options[s.selectedIndex].text; };

let failures = 0;
function check(name, got, want) {
  const ok = got === want;
  if (!ok) failures++;
  console.log((ok ? 'ok    ' : 'FAIL  ') + name.slice(0, 60).padEnd(62) + JSON.stringify(got) +
    (ok ? '' : `  (wanted ${JSON.stringify(want)})`));
}

function fillWith(event) {
  $('contact').innerHTML = '';
  $('contact').disabled = true;
  document.querySelectorAll('select').forEach((s) => { s.selectedIndex = 0; });
  document.querySelectorAll('input, textarea').forEach((t) => { t.value = t.defaultValue; });
  return FILL.run([...annotate(event), ...org], answers, { settleWait: 300 });
}

(async () => {
const report = await fillWith([
  { label: 'Event name', value: 'SASE Culture Night' },
  { label: 'Estimated attendance', value: '120' },
  { label: 'Please provide a detailed description and the purpose of your event (1-2 sentences).', value: 'Cultural showcase.' }
]);
check('address kept whole', org.find((f) => f.canon === 'orgAddress').value, 'PO Box 1, Gainesville, FL 32611');
check('Event Name', document.getElementById('evName').value, 'SASE Culture Night');
check(TEXT[0][1], document.getElementById('orgName').value, 'Citrus Growers and Gardeners Club');
check('Groups', chosen('groups'), 'RU-Citrus Growers & Gardeners Club');
check(TEXT[1][1], document.getElementById('advisor').value, 'Dr. Reyes, reyes@ufl.edu, 352-555-0199');
check(TEXT[2][1], document.getElementById('desc').value, 'Cultural showcase.');
YES_NO.forEach(([p, want], i) => {
  check(p, chosen('q' + i), want);
});
check('1st Contact switched from the default', chosen('contact'), 'Sam Lee');
check('1st Contact Phone', $('cPhone').value, '352-555-0100');
check('1st Contact Email Address', $('cEmail').value, 'sam@ufl.edu');
check('Yes-only acknowledgement', chosen('ackOnly'), 'Yes, I understand');
check('no Yes/No answer flagged for review',
  report.details.filter((d) => d.status === 'review' && /^answers|acknowledgement/.test(d.from)).length, 0);

// A big event: the headcount answers the 250 question, not the standing No.
await fillWith([{ label: 'Estimated attendance', value: '300' }]);
check('300 attending -> 250 or more', chosen('q2'), 'Yes');

// Already-answered menus are left alone.
document.getElementById('q3').selectedIndex = 1;
await FILL.run(org, answers, { settleWait: 300 });
check('pre-set answer untouched', chosen('q3'), 'Yes');

console.log(failures ? `\n${failures} failure(s)` : '\nall standing answers pass');
process.exitCode = failures ? 1 : 0;
})();
