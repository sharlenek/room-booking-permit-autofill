const fs = require('fs');
const { JSDOM } = require('jsdom');

const dom = new JSDOM(fs.readFileSync(__dirname + '/form.html', 'utf8'), { pretendToBeVisual: true });
global.window = dom.window;
global.document = dom.window.document;
global.getComputedStyle = dom.window.getComputedStyle;
global.Event = dom.window.Event;
global.CSS = dom.window.CSS;
// jsdom reports no layout boxes; treat every element as on-screen.
dom.window.Element.prototype.getClientRects = function () { return [{ width: 10, height: 10 }]; };

const CSV = require('../src/csv.js');
const SCHEMA = require('../src/schema.js');
const MATCH = require('../src/matcher.js');
global.UFRA_SCHEMA = SCHEMA;
global.UFRA_MATCH = MATCH;
const FILL = require('../src/fill.js');

const annotate = (fields) => fields.map((f) => {
  const hit = MATCH.headerToCanon(f.label);
  return { label: f.label, value: f.value, canon: hit ? hit.canon : null };
});

const org = annotate(CSV.parseRecord([
  'Field,Value',
  'Organization Name,Citrus Growers Club',
  'Contact Email,sharlene@ufl.edu',
  'Phone Number,352-555-0142',
  'Faculty Advisor,Dr. Elena Reyes',
  'Faculty Advisor Email,reyes@ufl.edu'
].join('\n')));

const events = CSV.parseTable([
  'Event Name,Date,Start Time,End Time,Expected Attendance,Location,Event Type,Description,Food Served',
  'Grove Day Social,9/12/2026,3:00 PM,5:00 PM,75,Reitz Union 2365,Social Event,Annual member social with citrus tasting.,Yes'
].join('\n')).records.map(annotate);

let submitted = false;
document.getElementById('ems').addEventListener('submit', () => { submitted = true; });

(async () => {
const report = await FILL.run([...events[0], ...org], [], { settleWait: 300 });

console.log('filled=%d review=%d prefilled=%d skipped=%d', report.filled, report.review, report.prefilled, report.skipped);
console.log('---');
for (const d of report.details) {
  if (d.status === 'skipped' && !d.note) continue;
  console.log(String(d.status).padEnd(8), String(d.label).slice(0, 34).padEnd(36), d.value ?? d.note ?? '');
}
console.log('--- resulting DOM values ---');
for (const el of document.querySelectorAll('input:not([type=hidden]), select, textarea')) {
  const key = el.id || el.name;
  const v = el.type === 'radio' ? (el.checked ? 'CHECKED ' + el.value : '') : el.value;
  console.log((key + (el.type === 'radio' ? ':' + el.value : '')).padEnd(14), JSON.stringify(v),
    el.classList.contains('ufra-review') ? '  [review]' : '');
}
console.log('--- invariants ---');
console.log('form submitted:', submitted);
console.log('phone preserved:', document.getElementById('phone').value === '352-000-0000');
})();
