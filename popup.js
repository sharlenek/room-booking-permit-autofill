const $ = (id) => document.getElementById(id);

function eventTitle(fields, i) {
  const named = fields.find((f) => f.canon === 'eventName' && f.value);
  const dated = fields.find((f) => f.canon === 'eventDate' && f.value);
  const base = named ? named.value : (fields.find((f) => f.value)?.value || `Row ${i + 1}`);
  return dated ? `${base} — ${dated.value}` : base;
}

function annotate(fields) {
  return fields.map((f) => {
    const hit = UFRA_MATCH.headerToCanon(f.label);
    return { label: f.label, value: f.value, canon: hit ? hit.canon : null };
  });
}

let state = { org: [], headers: [], columnUse: {}, rows: [], answers: [] };

function showSetup() {
  const missing = [];
  if (!state.headers.length) {
    missing.push('save your sheet’s header row once, so you only need to paste the event row ' +
      '(until then, copy the header row together with it)');
  }
  if (!state.org.length) missing.push('add your organization details (name, email, phone, advisor)');
  $('setup').hidden = !missing.length;
  $('setup').innerHTML = missing.length
    ? `<a href="#" class="toOptions">Settings</a>: ${missing.map(escapeHtml).join('; and ')}.`
    : '';
}

/* Re-read the paste box into rows of fields, and show what was understood. */
function readPaste(selectedIndex) {
  const text = $('paste').value;
  const select = $('event');
  select.innerHTML = '';
  $('pickRow').hidden = true;
  state.rows = [];

  if (!text.trim()) {
    $('parsed').textContent = '';
    $('fill').disabled = !state.org.length;
    return;
  }

  const read = UFRA_ROW.readPaste(text, state.headers);
  if (read.error) {
    $('parsed').textContent = read.error;
    $('fill').disabled = true;
    return;
  }

  state.rows = read.rows.map((r) => ({
    fields: UFRA_ROW.toFields(read.headers, r, state.columnUse),
    schedule: UFRA_ROW.schedule(read.headers, r)
  }));
  state.rows.forEach(({ fields }, i) => {
    const opt = document.createElement('option');
    opt.value = String(i);
    opt.textContent = eventTitle(fields, i);
    select.appendChild(opt);
  });
  select.value = String(Math.min(selectedIndex || 0, state.rows.length - 1));
  $('pickRow').hidden = state.rows.length < 2;
  updateParsed();
  $('fill').disabled = false;
}

function updateParsed() {
  const i = Number($('event').value) || 0;
  const { fields = [], schedule } = state.rows[i] || {};
  let when = '';
  if (schedule && schedule.cancelled) when = ' · cancelled';
  else if (schedule && schedule.sessions.length > 1) when = ` · ${schedule.sessions.length} dates`;
  $('parsed').textContent = `${eventTitle(fields, i)} · ${fields.length} value(s) to use${when}`;
}

async function load() {
  const { org = [], headers = [], columnUse = {}, pasted = '', selectedIndex = 0, importedAt } =
    await chrome.storage.local.get(['org', 'headers', 'columnUse', 'pasted', 'selectedIndex', 'importedAt']);
  state = { org, headers, columnUse, rows: [], answers: [] };

  const files = await UFRA_DATAFILES.load();
  if (files.orgText) state.org = annotate(UFRA_CSV.parseRecord(files.orgText));
  if (files.headerText) state.headers = UFRA_CSV.parse(files.headerText)[0] || [];
  state.answers = files.answersText ? UFRA_ANSWERS.fromCsvRows(UFRA_CSV.parse(files.answersText)) : [];
  state.buildings = files.buildingsText ? UFRA_FINALIZE.buildingsFrom(UFRA_CSV.parse(files.buildingsText)) : [];

  // Which Form this tab is, so a wrong guess is visible before filling.
  try {
    const tab = await activeTab();
    const form = UFRA_FORMS.detect(new URL(tab.url));
    $('detected').textContent = form.id === 'other'
      ? 'Not a recognised form — matching by field names only.'
      : `Detected: ${form.name}`;
  } catch (e) { /* no URL access: leave the line empty */ }
  showSetup();
  $('paste').value = pasted;
  readPaste(selectedIndex);
  if (importedAt) {
    $('stamp').textContent = ` · saved ${new Date(importedAt).toLocaleDateString()}`;
  }
}

function renderReport(report) {
  const box = $('report');
  box.hidden = false;
  const rows = report.details
    .filter((d) => d.status !== 'skipped' || d.note)
    .map((d) => `<li><span class="dot ${d.status}"></span><span>
        ${escapeHtml(d.label)}
        <span class="muted small">${d.status === 'skipped' ? escapeHtml(d.note) : '← ' + escapeHtml(d.from || '')}</span>
      </span></li>`)
    .join('');

  box.innerHTML = `
    <div class="tally">
      <div><b>${report.filled}</b><span class="small muted">filled</span></div>
      <div><b>${report.review}</b><span class="small muted">to review</span></div>
      <div><b>${report.prefilled}</b><span class="small muted">already set</span></div>
      <div><b>${report.skipped}</b><span class="small muted">left blank</span></div>
    </div>
    ${rows ? `<ul class="details">${rows}</ul>`
           : '<p class="small muted">No fields on this page matched your sheet data.</p>'}
    ${report.review ? '<p class="small muted">Orange-outlined fields are uncertain — check them before submitting.</p>' : ''}`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function injectInto(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    files: ['src/schema.js', 'src/matcher.js', 'src/answers.js', 'src/forms.js', 'src/fill.js']
  });
}

function mergeReports(results) {
  const total = { filled: 0, review: 0, skipped: 0, prefilled: 0, details: [] };
  for (const r of results) {
    if (!r || !r.result) continue;
    total.filled += r.result.filled;
    total.review += r.result.review;
    total.skipped += r.result.skipped;
    total.prefilled += r.result.prefilled;
    total.details.push(...r.result.details);
  }
  return total;
}

function showFinalized(text, count, error) {
  $('finalizedOut').hidden = !text;
  $('copyFinalized').hidden = !text;
  $('finalizedOut').value = text;
  $('finalizedNote').textContent = error ||
    (count ? `${count} booking(s), cancelled ones left out.` : 'No bookings found on this page.');
}

async function main() {
  await load();

  // The popup closes whenever the page is clicked, so keep the paste around
  // for the next step of the reservation wizard.
  $('paste').addEventListener('input', () => {
    chrome.storage.local.set({ pasted: $('paste').value, selectedIndex: 0 });
    readPaste(0);
  });

  $('event').addEventListener('change', (e) => {
    chrome.storage.local.set({ selectedIndex: Number(e.target.value) });
    updateParsed();
  });

  $('fill').addEventListener('click', async () => {
    const btn = $('fill');
    btn.disabled = true;
    btn.textContent = 'Filling…';
    try {
      const tab = await activeTab();
      await injectInto(tab.id);
      const idx = Number($('event').value) || 0;
      // Event details take precedence over organization defaults on a tie.
      const row = state.rows[idx] || { fields: [], schedule: null };
      const fields = [...row.fields, ...state.org];
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        func: (f, a, s) => UFRA_FILL.run(f, a, { schedule: s }),
        args: [fields, state.answers, row.schedule]
      });
      renderReport(mergeReports(results));
    } catch (err) {
      $('report').hidden = false;
      $('report').innerHTML =
        `<p class="small">Couldn't run on this page: ${escapeHtml(err.message)}</p>`;
    } finally {
      btn.disabled = false;
      btn.textContent = 'Fill Form';
    }
  });

  $('clear').addEventListener('click', async () => {
    const tab = await activeTab();
    await injectInto(tab.id);
    await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      func: () => UFRA_FILL.clearHighlights()
    });
  });

  // For bug reports: what the extension sees on this page, on the clipboard.
  $('diagnose').addEventListener('click', async (e) => {
    e.preventDefault();
    try {
      const tab = await activeTab();
      await injectInto(tab.id);
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        func: () => UFRA_FILL.diagnose()
      });
      await navigator.clipboard.writeText(results.map((r) => r.result).filter(Boolean).join('\n\n'));
      e.target.textContent = 'Copied — paste it to Claude';
    } catch (err) {
      e.target.textContent = `Couldn't copy: ${err.message}`;
    }
  });

  $('readBookings').addEventListener('click', async () => {
    try {
      const tab = await activeTab();
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        files: ['src/bookings.js', 'src/finalize.js']
      }).then(() => chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        func: () => UFRA_FINALIZE.readPage(document)
      }));
      const bookings = results.flatMap((r) => r.result || []);
      showFinalized(UFRA_FINALIZE.format(bookings, state.buildings), bookings.length);
    } catch (err) {
      showFinalized('', 0, `Couldn't read this page: ${err.message}`);
    }
  });

  $('copyFinalized').addEventListener('click', async () => {
    await navigator.clipboard.writeText($('finalizedOut').value);
    $('finalizedNote').textContent = 'Copied — paste it into the Finalized Information cell.';
  });

  document.addEventListener('click', (e) => {
    if (e.target.closest('.toIcs')) {
      e.preventDefault();
      chrome.tabs.create({ url: chrome.runtime.getURL('options.html#ics') });
      return;
    }
    if (!e.target.closest('#toOptions2, .toOptions')) return;
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });
}

main();
