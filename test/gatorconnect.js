/* GatorConnect "Create Event", page 1, built from the page report of the
   live form: default dates of today, an In-Person button that reveals the
   location boxes, "+ add another date", and a rich-text Description. */
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
    <div><button type="button" class="in-person">In-Person</button><button type="button">Online</button></div>
    <div class="where" style="display:none">
      <label for="${p}.ExternalLocation">Location Name</label><input id="${p}.ExternalLocation" name="${p}.ExternalLocation">
      <label for="${p}.Address">Address</label><input id="${p}.Address" name="${p}.Address1">
      <label for="city_${k}">City</label><input id="city_${k}" name="${p}.City">
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
  <a href="#" id="addDate">+ add another date</a>
  <label for="EventTypeId">Show To</label><select id="EventTypeId" name="EventTypeId"><option value="16724" selected>The Public</option><option value="16726">Organization Members</option></select>
  <label><input type="checkbox" id="AllowSelfReporting" name="AllowSelfReporting">Allow anyone to self-report attendance</label>
</form>`;

function page() {
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
      setTimeout(() => { e.target.closest('.instance').querySelector('.where').style.display = ''; }, 50);
    }
    if (e.target.id === 'addDate') {
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

  console.log(failures ? `\n${failures} failure(s)` : '\nall GatorConnect checks pass');
  process.exitCode = failures ? 1 : 0;
})();
