/* Reitz Union "Reservation Details" (RoomRequest.aspx, step 2), from the
   page report of the live form: an "I agree"-only menu, the Terms and
   Conditions checkbox, and styled checkboxes whose real box is hidden. */
const { JSDOM } = require('jsdom');

const html = `<form>
  <div class="form-group"><label for="122">I am an authorized representative of this organization. I am aware that we may be charged for damages.</label>
    <select id="122" name="ko_unique_12"><option value="">Choose one</option><option value="307">I agree</option></select></div>
  <div class="form-group"><label for="125">Are you planning to serve food and/or beverages?</label>
    <select id="125" name="ko_unique_10"><option value="">Choose one</option><option value="195">No</option><option value="196">Yes</option></select></div>
  <p>Who is the intended audience for the event? (select all that apply)</p>
  <div class="summary" style="display:none">
    <input type="checkbox" id="611"><label for="611">Student Organization Officers/Exec Team</label>
    <input type="checkbox" id="605"><label for="605">Student Organization Members</label>
    <input type="checkbox" id="606"><label for="606">Public</label>
  </div>
  <a href="#" class="add-remove" data-for="aud">Add/Remove</a>
  <div class="modal" id="aud" role="dialog" style="display:none">
    <div class="modal-header"><span class="ems-x" data-dismiss="modal"></span></div>
    <div class="modal-body">
      <p>Who is the intended audience for the event? (select all that apply)</p>
      <label><input type="checkbox" id="m611">Student Organization Officers/Exec Team</label>
      <label><input type="checkbox" id="m605">Student Organization Members</label>
      <label><input type="checkbox" id="m606">Public</label>
    </div>
  </div>
  <div class="form-group"><label for="154">Indicate the method of payment for this specific event in case there are fees associated with it.</label>
    <select id="154" name="ko_unique_13"><option value="">Choose one</option><option value="209">Organization Funds</option>
      <option value="210">SAR (SG funded events only, contact SG Finance)</option><option value="211">UF Department Funded (USSO orgs only)</option></select></div>
  <div class="form-group"><label for="332">Some activities require an approved event permit. Has an event permit been submitted through GatorConnect?</label>
    <select id="332" name="ko_unique_6"><option value="">Choose one</option><option value="601">No</option><option value="602">Yes</option></select></div>
  <a href="#" class="add-remove" data-for="flex">Add/Remove</a>
  <div class="ems-flyout" id="flex" style="display:none; position:absolute">
    <div class="hdr"><span class="title">Flexibility</span><span class="ems-x" style="cursor:pointer"></span></div>
    <label><input type="checkbox" id="609">Event date is flexible</label>
    <label><input type="checkbox" id="610">Event time is flexible</label>
    <label><input type="checkbox" id="623">Neither the date or time is flexible</label>
  </div>
  <div id="cf" style="display:none"><label for="cfin">Provide the 15 digit chartfield information which includes Dept ID #, Fund #, and Program code for the funding source.</label><input id="cfin"></div>
  <input type="checkbox" id="terms-and-conditions"><label for="terms-and-conditions">I have read and agree to the Terms and Conditions</label>
</form>`;

const dom = new JSDOM(html, { pretendToBeVisual: true, url: 'https://ufl.emscloudservice.com/web/RoomRequest.aspx' });
const w = dom.window;
Object.assign(global, { window: w, document: w.document, getComputedStyle: w.getComputedStyle, Event: w.Event, CSS: w.CSS });
// No layout in jsdom: give every element a small box, as a browser would.
w.Element.prototype.getBoundingClientRect = () => ({ top: 0, left: 0, right: 20, bottom: 20, width: 20, height: 20 });
w.Element.prototype.getClientRects = function () {
  for (let n = this; n && n.style; n = n.parentElement) if (n.style.display === 'none') return [];
  return [{ width: 10, height: 10 }];
};
// Knockout-style binding: the page's model only learns of a tick by its click.
const model = {};
w.document.querySelectorAll('input[type=checkbox]').forEach((cb) =>
  cb.addEventListener('click', () => { model[cb.id] = cb.checked; }));
// Add/Remove opens a pop-up after a moment; its X closes it.
w.document.addEventListener('click', (e) => {
  const link = e.target.closest('.add-remove');
  if (link) { e.preventDefault(); setTimeout(() => { w.document.getElementById(link.dataset.for).style.display = ''; }, 50); }
  const x = e.target.closest('[data-dismiss], .ems-x');
  if (x) setTimeout(() => { x.closest('.modal, .ems-flyout').style.display = 'none'; }, 50);
});
// Choosing UF Department Funded asks for the chartfield.
w.document.getElementById('154').addEventListener('change', (e) => {
  w.document.getElementById('cf').style.display = e.target.value === '211' ? '' : 'none';
});

const FILL = require('../src/fill.js');
const CSV = require('../src/csv.js');
const ANSWERS = require('../src/answers.js');
const rules = ANSWERS.fromCsvRows(CSV.parse(require('fs').readFileSync(__dirname + '/../data/answers.csv', 'utf8')));
// Shaped like data/org.csv: its Payment Method matches no Reitz option.
const MATCH = require('../src/matcher.js');
const org = [['Payment Method', 'Chartfield'], ['Chartfield Number', '19010300-171-4600-F001681-1901STUACT']]
  .map(([label, value]) => ({ label, value, canon: (MATCH.headerToCanon(label) || {}).canon || null }));

let failures = 0;
function check(name, got, want) {
  const ok = got === want;
  if (!ok) failures++;
  console.log((ok ? 'ok    ' : 'FAIL  ') + name.padEnd(46) + JSON.stringify(got) + (ok ? '' : `  (wanted ${JSON.stringify(want)})`));
}

(async () => {
  await FILL.run(org, rules, { settleWait: 200 });
  const $ = (id) => w.document.getElementById(id);
  check('"I agree" menu', $('122').options[$('122').selectedIndex].text, 'I agree');
  check('food -> No (standing answer)', $('125').options[$('125').selectedIndex].text, 'No');
  check('Terms and Conditions ticked', $('terms-and-conditions').checked, true);
  check('audience: Members ticked in pop-up', $('m605').checked, true);
  check('page saw the click', model['m605'], true);
  check('audience: others left', $('m611').checked || $('m606').checked, false);
  check('pop-ups closed with the X', $('aud').style.display + $('flex').style.display, 'nonenone');
  check('chartfield entered', $('cfin').value, '19010300-171-4600-F001681-1901STUACT');
  check('payment: UF Department Funded', $('154').options[$('154').selectedIndex].text, 'UF Department Funded (USSO orgs only)');
  check('permit submitted -> No', $('332').options[$('332').selectedIndex].text, 'No');
  check('flexibility: neither', $('623').checked, true);
  check('flexibility: date/time left', $('609').checked || $('610').checked, false);
  // Step 1, "1 Rooms": EMS opens on today with default times.
  const now = new Date();
  const today = `${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][now.getDay()]} ${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')}/${now.getFullYear()}`;
  const step1 = new JSDOM(`<form>
    <label for="booking-date-input">Date Required.</label><input id="booking-date-input" value="${today}">
    <label for="start-time-input">StartTime Required.</label><input id="start-time-input" value="12:00 PM">
    <label for="end-time-input">EndTime Required.</label><input id="end-time-input" value="1:00 PM">
    <a href="#" id="bldg-filter">Add/Remove</a>
  </form>`, { pretendToBeVisual: true, url: 'https://ufl.emscloudservice.com/web/RoomRequest.aspx' });
  Object.assign(global, { window: step1.window, document: step1.window.document,
    getComputedStyle: step1.window.getComputedStyle, Event: step1.window.Event, CSS: step1.window.CSS });
  step1.window.Element.prototype.getClientRects = () => [{ width: 10, height: 10 }];
  for (const k of Object.keys(require.cache)) if (k.includes('/src/')) delete require.cache[k];
  const ROW = require('../src/row.js');
  const FILL1 = require('../src/fill.js');
  const H = ['Event name', 'Reservation Date', 'Reservation date and time (e.g. 09/16/2024, 6:00pm - 8:00pm)', 'Finalized Information'];
  const V = ['Culture Night', '11/4/2026', '5:30pm - 8:30pm', '7:30-9:30 turl 2319'];
  const d1 = step1.window.document;
  let filterClicked = false;
  d1.getElementById('bldg-filter').addEventListener('click', () => { filterClicked = true; });
  await FILL1.run(ROW.toFields(H, V, {}), rules, { schedule: ROW.schedule(H, V), settleWait: 200 });
  check('step 1: building filter Add/Remove left alone', filterClicked, false);
  check('step 1: requested date', d1.getElementById('booking-date-input').value, 'Wed 11/04/2026');
  check('step 1: requested start (not Finalized)', d1.getElementById('start-time-input').value, '5:30 PM');
  check('step 1: requested end', d1.getElementById('end-time-input').value, '8:30 PM');

  console.log(failures ? `\n${failures} failure(s)` : '\nall Reitz form checks pass');
  process.exitCode = failures ? 1 : 0;
})();
