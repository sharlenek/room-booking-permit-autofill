const $ = (id) => document.getElementById(id);

function eventTitle(fields, i) {
  const named = fields.find((f) => f.canon === 'eventName' && f.value);
  const dated = fields.find((f) => f.canon === 'eventDate' && f.value);
  const base = named ? named.value : (fields.find((f) => f.value)?.value || `Row ${i + 1}`);
  return dated ? `${base} — ${dated.value}` : base;
}

let state = { org: [], headers: [], columnUse: {}, rows: [] };

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

  state.rows = read.rows.map((r) => UFRA_ROW.toFields(read.headers, r, state.columnUse));
  state.rows.forEach((fields, i) => {
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
  const fields = state.rows[i] || [];
  $('parsed').textContent = `${eventTitle(fields, i)} · ${fields.length} value(s) to use`;
}

async function load() {
  const { org = [], headers = [], columnUse = {}, pasted = '', selectedIndex = 0, importedAt } =
    await chrome.storage.local.get(['org', 'headers', 'columnUse', 'pasted', 'selectedIndex', 'importedAt']);
  state = { org, headers, columnUse, rows: [] };
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
    .filter((d) => d.status !== 'skipped')
    .map((d) => `<li><span class="dot ${d.status}"></span><span>
        ${escapeHtml(d.label)}
        <span class="muted small">← ${escapeHtml(d.from || '')}</span>
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
    files: ['src/schema.js', 'src/matcher.js', 'src/fill.js']
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
      const fields = [...(state.rows[idx] || []), ...state.org];
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        func: (f) => UFRA_FILL.run(f),
        args: [fields]
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

  document.addEventListener('click', (e) => {
    if (!e.target.closest('#toOptions2, .toOptions')) return;
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });
}

main();
