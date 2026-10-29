/* EMS step 1 with several requested dates: the Recurrence pop-up, built
   from page reports of the live form -- Weekly's weekday toggle buttons
   ("Monday Not Selected") and Random's month calendar. */
const { JSDOM } = require('jsdom');

const now = new Date();
const pad = (n) => String(n).padStart(2, '0');
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const today = `${WD[now.getDay()]} ${pad(now.getMonth() + 1)}/${pad(now.getDate())}/${now.getFullYear()}`;

function page() {
  const dom = new JSDOM(`<form>
    <label for="booking-date-input">Date Required.</label><input id="booking-date-input" value="${today}">
    <label for="start-time-input">StartTime Required.</label><input id="start-time-input" value="12:00 PM">
    <label for="end-time-input">EndTime Required.</label><input id="end-time-input" value="1:00 PM">
    <button type="button" id="open-rec">Recurrence</button>
  </form>
  <div class="modal fade" style="display:none">
    <button type="button" class="close" aria-label="Close"><span>×</span></button>
    <select id="recurrence-pattern-dropdown"><option value="daily">Daily</option><option value="weekly">Weekly</option>
      <option value="monthly">Monthly</option><option value="random">Random</option></select>
    <div id="weekly" style="display:none">
      <input id="weekly-count" value="1">
      ${FULL.map((d, i) => `<button type="button" class="btn" aria-label="${d} ${i === 4 ? 'Selected' : 'Not Selected'}">${WD[i]}</button>`).join('')}
      <input id="recurrence-date" value="${today}">
      <input type="radio" name="end-date" id="end-date"><input id="enddate" value="${today}">
    </div>
    <div id="random" style="display:none">
      <table><tr><th class="prev"><span class="glyphicon glyphicon-chevron-left"></span></th>
        <th><span class="month"></span></th>
        <th class="next"><span class="glyphicon glyphicon-chevron-right"></span></th></tr>
        <tbody class="days"></tbody></table>
    </div>
    <input id="recurrence-start-time" value="12:00 PM"><input id="recurrence-end-time" value="1:00 PM">
    <button type="button" class="btn btn-primary" id="apply">Apply Recurrence</button>
  </div>`, { pretendToBeVisual: true, url: 'https://ufl.emscloudservice.com/web/RoomRequest.aspx' });
  const w = dom.window;
  const d = w.document;
  Object.assign(global, { window: w, document: d, getComputedStyle: w.getComputedStyle, Event: w.Event, CSS: w.CSS });
  w.Element.prototype.getClientRects = function () {
    for (let n = this; n && n.style; n = n.parentElement) if (n.style.display === 'none') return [];
    return [{ width: 10, height: 10 }];
  };
  w.Element.prototype.getBoundingClientRect = () => ({ top: 0, left: 0, right: 20, bottom: 20, width: 20, height: 20 });

  const state = { picked: new Set(), applied: null };
  let shown = { y: now.getFullYear(), m: now.getMonth() };
  const render = () => {
    d.querySelector('.month').textContent = `${MONTHS[shown.m]} ${shown.y}`;
    const days = new Date(shown.y, shown.m + 1, 0).getDate();
    d.querySelector('.days').innerHTML = '<tr>' + Array.from({ length: days }, (_, i) => {
      const key = `${pad(shown.m + 1)}/${pad(i + 1)}/${shown.y}`;
      return `<td class="day${state.picked.has(key) ? ' active' : ''}" data-day="${key}">${i + 1}</td>`;
    }).join('') + '</tr>';
  };
  render();
  d.getElementById('open-rec').addEventListener('click', () => setTimeout(() => { d.querySelector('.modal').style.display = ''; }, 30));
  d.getElementById('recurrence-pattern-dropdown').addEventListener('change', (e) => setTimeout(() => {
    d.getElementById('weekly').style.display = e.target.value === 'weekly' ? '' : 'none';
    d.getElementById('random').style.display = e.target.value === 'random' ? '' : 'none';
  }, 30));
  d.addEventListener('click', (e) => {
    const b = e.target.closest('button[aria-label$="Selected"]');
    if (b) b.setAttribute('aria-label', b.getAttribute('aria-label').replace(/(Not )?Selected$/, (m) => (m.startsWith('Not') ? 'Selected' : 'Not Selected')));
    const th = e.target.closest('th.prev, th.next');
    if (th) { shown.m += th.classList.contains('next') ? 1 : -1; if (shown.m > 11) { shown.m = 0; shown.y++; } if (shown.m < 0) { shown.m = 11; shown.y--; } setTimeout(render, 20); }
    const td = e.target.closest('td.day');
    if (td) { state.picked.has(td.dataset.day) ? state.picked.delete(td.dataset.day) : state.picked.add(td.dataset.day); render(); }
  });
  d.getElementById('apply').addEventListener('click', () => {
    state.applied = {
      pattern: d.getElementById('recurrence-pattern-dropdown').value,
      every: d.getElementById('weekly-count').value,
      days: [...d.querySelectorAll('button[aria-label$=" Selected"]')].filter((b) => !/Not Selected$/.test(b.getAttribute('aria-label'))).map((b) => b.textContent),
      start: d.getElementById('recurrence-date').value, end: d.getElementById('enddate').value,
      endByDate: d.getElementById('end-date').checked,
      times: d.getElementById('recurrence-start-time').value + '-' + d.getElementById('recurrence-end-time').value,
      picked: [...state.picked].sort()
    };
    setTimeout(() => { d.querySelector('.modal').style.display = 'none'; }, 30);
  });
  return state;
}

function load() {
  for (const k of Object.keys(require.cache)) if (k.includes('/src/')) delete require.cache[k];
  return { FILL: require('../src/fill.js'), ROW: require('../src/row.js') };
}

const H = ['Event name', 'Reservation date and time (e.g. 09/16/2024, 6:00pm - 8:00pm)'];
let failures = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures++;
  console.log((ok ? 'ok    ' : 'FAIL  ') + name.padEnd(40) + JSON.stringify(got) + (ok ? '' : `  (wanted ${JSON.stringify(want)})`));
}

(async () => {
  // Every Tuesday for three weeks.
  let state = page();
  let { FILL, ROW } = load();
  let V = ['GBM', '11/03/2026, 6:00pm - 8:00pm\n11/10/2026, 6:00pm - 8:00pm\n11/17/2026, 6:00pm - 8:00pm'];
  await FILL.run(ROW.toFields(H, V, {}), [], { schedule: ROW.schedule(H, V), settleWait: 200 });
  check('step 1 date is the first', document.getElementById('booking-date-input').value, 'Tue 11/03/2026');
  check('weekly: applied', state.applied && state.applied.pattern, 'weekly');
  check('weekly: Tuesday only', state.applied.days, ['Tue']);
  check('weekly: every 1 week', state.applied.every, '1');
  check('weekly: first to last', [state.applied.start, state.applied.end, state.applied.endByDate],
    ['Tue 11/03/2026', 'Tue 11/17/2026', true]);
  check('weekly: times', state.applied.times, '6:00 PM-8:00 PM');
  check('pop-up closed', document.querySelector('.modal').style.display, 'none');

  // Weekly with the holiday left out, into the next month: Random.
  state = page();
  ({ FILL, ROW } = load());
  V = ['GBM', '11/17/2026, 6:00pm - 8:00pm\n12/01/2026, 6:00pm - 8:00pm\n12/08/2026, 6:00pm - 8:00pm'];
  await FILL.run(ROW.toFields(H, V, {}), [], { schedule: ROW.schedule(H, V), settleWait: 200 });
  check('random: applied', state.applied && state.applied.pattern, 'random');
  check('random: exact dates, no holiday', state.applied.picked, ['11/17/2026', '12/01/2026', '12/08/2026']);
  check('random: times', state.applied.times, '6:00 PM-8:00 PM');

  console.log(failures ? `\n${failures} failure(s)` : '\nall recurrence checks pass');
  process.exitCode = failures ? 1 : 0;
})();
