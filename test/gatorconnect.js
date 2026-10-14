/* GatorConnect "Create Event", page 1, built from the page report of the
   live form: default dates of today, a "Location" button (beside "Online
   Location" and "Clear Location") that reveals the location boxes, an
   "add ADD ANOTHER DATE" button, and a rich-text Description. */
const { JSDOM } = require('jsdom');
const FORMS = require('../src/forms.js');

const now = new Date();
const TODAY = FORMS.gcDate({ y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() });

function instance(k) {
  const p = `Instances[${k}]`;
  return `<div class="instance">
    <label for="${p}_StartDate">Start Date</label><input id="${p}_StartDate" name="${p}.StartDate" value="${TODAY}">
    <label for="${p}_StartTime">Start Time</label><input id="${p}_StartTime" name="${p}.StartTime" value="12:00 PM">
    <label for="${p}_EndDate">End Date</label><input id="${p}_EndDate" name="${p}.EndDate" value="${TODAY}">
    <label for="${p}_EndTime">End Time</label><input id="${p}_EndTime" name="${p}.EndTime" value="01:00 PM">
    <div><input type="button" class="in-person" value="Location"><input type="button" value="Online Location"><input type="button" value="Clear Location"></div>
    <div class="where" style="display:none">
      <label for="${p}.ExternalLocation">Location Name</label><input id="${p}.ExternalLocation" name="${p}.ExternalLocation">
      <label for="${p}.Address">Address</label><input id="${p}.Address" name="${p}.Address1">
      <label for="city_${k}">City</label><input id="city_${k}" name="${p}.City">
      <a href="#" class="yes-map">YES I want to add a helpful Map</a><a href="#" class="no-map">NO I'd prefer to not show a Map</a>
      <button type="button" class="save">SAVE</button><button type="button">CANCEL</button>
    </div>
  </div>`;
}

const PAGE = `<form>
  <label for="Name">Event Title</label><input id="Name" name="Name" placeholder="Enter Event Title">
  <label for="Theme">Theme</label><select id="Theme" name="Theme"><option value="">Not Selected</option><option value="Cultural">Cultural</option></select>
  <div class="form-group"><label for="Description">Description</label>
    <textarea id="Description" name="Description" style="display:none"></textarea><iframe id="Description_ifr"></iframe></div>
  <label for="GroupName">Additional organizations co-hosting this event</label><input id="GroupName" placeholder="Type here to search for organizations">
  <div id="instances">${instance(0)}</div>
  <button type="button" id="addDate"><i class="material-icons">add</i>ADD ANOTHER DATE</button>
  <label for="EventTypeId">Show To</label><select id="EventTypeId" name="EventTypeId"><option value="16724" selected>The Public</option><option value="16726">Organization Members</option></select>
  <label><input type="checkbox" id="AllowSelfReporting" name="AllowSelfReporting">Allow anyone to self-report attendance</label>
</form>`;

let clicks = [];
function page() {
  clicks = [];
  const dom = new JSDOM(PAGE, { pretendToBeVisual: true,
    url: 'https://gatorconnect.ufl.edu/submitter/organization/ufsase/eventsubmission/create' });
  const w = dom.window;
  Object.assign(global, { window: w, document: w.document, getComputedStyle: w.getComputedStyle,
    Event: w.Event, CSS: w.CSS });
  // jsdom has no layout: a control is on screen unless it or an ancestor is display:none.
  w.Element.prototype.getClientRects = function () {
    for (let n = this; n && n.style; n = n.parentElement) if (n.style.display === 'none') return [];
    return [{ width: 10, height: 10 }];
  };
  w.document.getElementById('Description_ifr').contentDocument.body.setAttribute('contenteditable', 'true');
  w.document.addEventListener('click', (e) => {
    if (e.target.classList.contains('in-person')) {
      setTimeout(() => { e.target.parentElement.nextElementSibling.style.display = ''; }, 50);
    }
    // Answering the map question redraws the pop-up, clearing the room.
    if (e.target.classList.contains('no-map')) {
      e.preventDefault();
      clicks.push('no-map');
      e.target.closest('.where').querySelector('[name$=".ExternalLocation"]').value = '';
    }
    if (e.target.classList.contains('save')) {
      clicks.push('save');
      setTimeout(() => { e.target.closest('.where').style.display = 'none'; }, 50);
    }
    if (e.target.closest('#addDate')) {
      e.preventDefault();
      const k = w.document.querySelectorAll('.instance').length;
      setTimeout(() => w.document.getElementById('instances').insertAdjacentHTML('beforeend', instance(k)), 50);
    }
  });
  return w.document;
}

// Fresh modules per page, since fill.js reads the page's globals.
function load() {
  for (const k of Object.keys(require.cache)) if (k.includes('/src/')) delete require.cache[k];
  return { FILL: require('../src/fill.js'), ROW: require('../src/row.js'), MATCH: require('../src/matcher.js') };
}

const HEADERS = ['Event name', 'Estimated attendance', 'Reservation date and time (e.g. 09/16/2024, 6:00pm - 8:00pm)',
  'Room preference', 'Please provide a detailed description and the purpose of your event (1-2 sentences).',
  'Finalized Information'];

let failures = 0;
function check(name, got, want) {
  const ok = got === want;
  if (!ok) failures++;
  console.log((ok ? 'ok    ' : 'FAIL  ') + name.padEnd(44) + JSON.stringify(got) + (ok ? '' : `  (wanted ${JSON.stringify(want)})`));
}

async function fill(doc, values, before) {
  const { FILL, ROW, MATCH } = load();
  if (before) before(doc);
  const fields = ROW.toFields(HEADERS, values, {}).concat([
    { label: 'Organization Name', value: 'Citrus Growers Club', canon: 'orgName' },
    { label: 'Organization Address', value: 'PO Box 1, Gainesville, FL', canon: 'orgAddress' }
  ]);
  return FILL.run(fields, [], { schedule: ROW.schedule(HEADERS, values), settleWait: 400 });
}
const val = (doc, name) => doc.querySelector(`[name="${name}"]`).value;

(async () => {
  // Three weekly meetings, each in its own room, one a holiday.
  let doc = page();
  let report = await fill(doc, ['Culture Night', '80', '09/22/2026, 6:00pm - 8:00pm', 'Reitz 2365',
    'Cultural showcase.\nOpen to all.',
    '09/22/2026, LEIGH 0104\n09/29/2026, MAT 0002\n10/06/2026, holiday\n10/13/2026, 7-9pm, Little Hall 0205']);
  check('form detected', report.form, 'GatorConnect event');
  check('Event Title', doc.getElementById('Name').value, 'Culture Night');
  check('Bookings on the page', doc.querySelectorAll('.instance').length, 3);
  check('date 1 start', val(doc, 'Instances[0].StartDate') + ' ' + val(doc, 'Instances[0].StartTime'), '22 Sep 2026 06:00 PM');
  check('date 1 end', val(doc, 'Instances[0].EndDate') + ' ' + val(doc, 'Instances[0].EndTime'), '22 Sep 2026 08:00 PM');
  check('date 2 (time borrowed from request)', val(doc, 'Instances[1].StartDate') + ' ' + val(doc, 'Instances[1].StartTime'), '29 Sep 2026 06:00 PM');
  check('date 3 (holiday skipped, own time)', val(doc, 'Instances[2].StartDate') + ' ' + val(doc, 'Instances[2].EndTime'), '13 Oct 2026 09:00 PM');
  check('pop-up: no map, then SAVE, per date', clicks.join(' '), 'no-map save no-map save no-map save');
  check('pop-ups closed', [...doc.querySelectorAll('.where')].every((w) => w.style.display === 'none'), true);
  check('date 1 room', val(doc, 'Instances[0].ExternalLocation'), 'LEIGH 0104');
  check('date 2 room', val(doc, 'Instances[1].ExternalLocation'), 'MAT 0002');
  check('date 3 room', val(doc, 'Instances[2].ExternalLocation'), 'Little Hall 0205');
  check('Description editor', doc.getElementById('Description_ifr').contentDocument.body.innerHTML,
    '<p>Cultural showcase.</p><p>Open to all.</p>');
  check('Description textarea', doc.getElementById('Description').value, '<p>Cultural showcase.</p><p>Open to all.</p>');
  check('Theme left alone', doc.getElementById('Theme').value, '');
  check('co-host search left alone', doc.getElementById('GroupName').value, '');
  check('Show To left alone', doc.getElementById('EventTypeId').value, '16724');
  check('self-report left alone', doc.getElementById('AllowSelfReporting').checked, false);
  check('Address left alone', val(doc, 'Instances[0].Address1'), '');
  check('City left alone', val(doc, 'Instances[0].City'), '');

  // Finalized says "<-": the requested date, time and room preference.
  doc = page();
  await fill(doc, ['Board Meeting', '20', '01/17/2027, 7:00am - 8:00 pm', 'Grand Ballroom', 'Planning.', '<-']);
  check('"<-": requested date', val(doc, 'Instances[0].StartDate') + ' ' + val(doc, 'Instances[0].StartTime'), '17 Jan 2027 07:00 AM');
  check('"<-": room preference, for review', doc.querySelector('[name="Instances[0].ExternalLocation"]').classList.contains('ufra-review'), true);

  // A description mentioning a date and time is never the schedule or a room.
  doc = page();
  await fill(doc, ['Social', '30', 'TBD', 'Reitz 2365', 'Join us on 9/24 from 6-8pm for games.', '']);
  check('description is not a room', val(doc, 'Instances[0].ExternalLocation'), 'Reitz 2365');

  // A date the user already set is theirs.
  doc = page();
  await fill(doc, ['Board Meeting', '20', '01/17/2027, 7:00am - 8:00 pm', 'Grand Ballroom', 'Planning.', ''],
    (d) => { d.querySelector('[name="Instances[0].StartDate"]').value = '20 Jan 2027'; d.querySelector('[name="Instances[0].EndDate"]').value = '20 Jan 2027'; });
  check('user-set date untouched', val(doc, 'Instances[0].StartDate'), '20 Jan 2027');

  // Cancelled: no dates written, and the report says why.
  doc = page();
  report = await fill(doc, ['Mixer', '40', '10/01/2026, 6pm - 8pm', 'Reitz 2365', 'Mixer.', 'cancelled']);
  check('cancelled: defaults left', val(doc, 'Instances[0].StartDate'), TODAY);
  check('cancelled: reported', report.details.some((d) => /cancelled/.test(d.note || '')), true);

  // No per-date wrapper: each date's own "Location" button still gets used.
  doc = page();
  doc.querySelectorAll('.instance').forEach((b) => b.replaceWith(...b.childNodes));
  report = await fill(doc, ['Culture Night', '80', '09/22/2026, 6:00pm - 8:00pm', 'Reitz 2365', 'Showcase.', ''] );
  check('flat page: room filled', val(doc, 'Instances[0].ExternalLocation'), 'Reitz 2365');

  // Page 2, "additional info": a Yes/No question whose text sits outside
  // the radios, an unlabelled checkbox, and a required attendance box.
  const page2 = new JSDOM(`<form>
    <div class="bare"><label><input type="radio" id="q2y" name="pageResponse.Responses[rb2].AnswerId" value="1">Yes</label>
      <label><input type="radio" id="q2n" name="pageResponse.Responses[rb2].AnswerId" value="2">No</label></div>
    <div class="question"><p>Will this event be held off campus?</p>
      <div><label><input type="radio" id="50123533" name="pageResponse.Responses[rb14893447].AnswerId" value="50123533">Yes</label>
           <label><input type="radio" id="50123534" name="pageResponse.Responses[rb14893447].AnswerId" value="50123534">No</label></div></div>
    <input type="checkbox" id="50123535" name="pageResponse.Responses[cb50123535].AnswerId">
    <label for="answerTextBox-50335735-free">What is your expected GBM attendance?</label>
    <input type="text" id="answerTextBox-50335735-free" name="pageResponse.Responses[fta50335735].FreeText">
    <a href="#">keyboard_arrow_leftPREVIOUS</a><button type="button">NEXT keyboard_arrow_right</button>
  </form>`, { pretendToBeVisual: true,
    url: 'https://gatorconnect.ufl.edu/submitter/organization/ufsase/eventsubmission/additionalinfo/14638817' });
  Object.assign(global, { window: page2.window, document: page2.window.document,
    getComputedStyle: page2.window.getComputedStyle, Event: page2.window.Event, CSS: page2.window.CSS });
  page2.window.Element.prototype.getClientRects = () => [{ width: 10, height: 10 }];
  doc = page2.window.document;
  {
    const { FILL, ROW } = load();
    const ANSWERS = require('../src/answers.js');
    const CSV = require('../src/csv.js');
    const answers = ANSWERS.fromCsvRows(CSV.parse(require('fs').readFileSync(__dirname + '/../data/answers.csv', 'utf8')));
    const values = ['GBM', '80', '09/22/2026, 6:00pm - 8:00pm', 'Reitz 2365', 'Meeting.', ''];
    report = await FILL.run(ROW.toFields(HEADERS, values, {}), answers,
      { schedule: ROW.schedule(HEADERS, values), settleWait: 300 });
  }
  check('page 2: Yes/No defaults to No', doc.getElementById('50123534').checked, true);
  check('page 2: question text not found -> No', doc.getElementById('q2n').checked, true);
  check('page 2: Yes left unticked', doc.getElementById('50123533').checked, false);
  check('page 2: attendance', doc.getElementById('answerTextBox-50335735-free').value, '80');
  check('page 2: GBM agreement ticked', doc.getElementById('50123535').checked, true);
  check('page 2: agreement outlined for review', doc.getElementById('50123535').classList.contains('ufra-review'), true);
  check('page 2: no page-1 notes', report.details.filter((d) => d.note).length, 0);

  // Page 3: required Yes/No questions, the target audience and co-sponsor
  // checkboxes (each option's label sits beside the next option), and the
  // expected number of attendees.
  const radio = (id, q) => `<div><p>${q} required</p>
    <label><input type="radio" id="${id}y" name="r${id}" value="${id}1">Yes</label>
    <label><input type="radio" id="${id}n" name="r${id}" value="${id}2">No</label></div>`;
  const box = (id, text) => `<input type="checkbox" id="${id}" name="cb${id}"><label for="${id}">${text}</label>`;
  const page3 = new JSDOM(`<form>
    ${radio('tabling', 'Is this a student organization tabling permit?')}
    ${radio('fund', 'Is this a fundraiser?')}
    ${radio('space', 'Do you have a space reservation confirmation? (If a walk/run, the route)')}
    ${radio('big', 'Will this event have 250 or more attendees?')}
    ${radio('sound', 'Will this event include outdoor amplified sound?')}
    <div>${box('aud1', 'Organization members')}${box('aud2', 'UF Students')}${box('aud3', 'Public')}</div>
    <div>${box('co1', 'No')}${box('co2', 'Registered Student Organization(s)')}${box('co3', 'External Group(s)')}</div>
    <label for="n">Provide the expected number of attendees</label><input type="text" id="n" name="free">
  </form>`, { pretendToBeVisual: true,
    url: 'https://gatorconnect.ufl.edu/submitter/organization/ufsase/eventsubmission/additionalinfo/14638817' });
  Object.assign(global, { window: page3.window, document: page3.window.document,
    getComputedStyle: page3.window.getComputedStyle, Event: page3.window.Event, CSS: page3.window.CSS });
  page3.window.Element.prototype.getClientRects = () => [{ width: 10, height: 10 }];
  doc = page3.window.document;
  const fill3 = async (attendance) => {
    doc.querySelectorAll('input').forEach((i) => { i.checked = false; if (i.type === 'text') i.value = ''; });
    const { FILL, ROW } = load();
    const ANSWERS = require('../src/answers.js');
    const CSV = require('../src/csv.js');
    const answers = ANSWERS.fromCsvRows(CSV.parse(require('fs').readFileSync(__dirname + '/../data/answers.csv', 'utf8')));
    const values = ['GBM', attendance, '09/22/2026, 6:00pm - 8:00pm', 'Reitz 2365', 'Meeting.', ''];
    return FILL.run(ROW.toFields(HEADERS, values, {}), answers, { schedule: ROW.schedule(HEADERS, values), settleWait: 300 });
  };
  await fill3('80');
  const ticked = (id) => doc.getElementById(id).checked;
  check('page 3: tabling -> No', ticked('tablingn'), true);
  check('page 3: fundraiser -> No', ticked('fundn'), true);
  check('page 3: space reservation -> Yes', ticked('spacey'), true);
  check('page 3: 80 attending, 250+ -> No', ticked('bign'), true);
  check('page 3: amplified sound -> No', ticked('soundn'), true);
  check('page 3: audience: Organization members', ticked('aud1'), true);
  check('page 3: audience: UF Students left', ticked('aud2'), false);
  check('page 3: audience: Public left', ticked('aud3'), false);
  check('page 3: co-sponsor "No" ticked', ticked('co1'), true);
  check('page 3: co-sponsor RSO left', ticked('co2'), false);
  check('page 3: expected number of attendees', doc.getElementById('n').value, '80');
  await fill3('300');
  check('page 3: 300 attending, 250+ -> Yes', ticked('bigy'), true);

  console.log(failures ? `\n${failures} failure(s)` : '\nall GatorConnect checks pass');
  process.exitCode = failures ? 1 : 0;
})();
