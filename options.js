const $ = (id) => document.getElementById(id);

/* Tag each column with the canonical field it maps onto, so the matcher can
   use the full synonym list rather than only the sheet's own wording. */
function annotate(fields) {
  return fields.map((f) => {
    const hit = UFRA_MATCH.headerToCanon(f.label);
    return { label: f.label, value: f.value, canon: hit ? hit.canon : null };
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function canonCell(label) {
  const hit = UFRA_MATCH.headerToCanon(label);
  return hit
    ? `<span class="pill">${escapeHtml(hit.canon)}</span>`
    : '<span class="muted">matched by column name only</span>';
}

function renderPreview(org, headers, columnUse) {
  const box = $('preview');
  const named = headers.filter((h) => h.trim());
  if (!org.length && !named.length) { box.innerHTML = ''; return; }

  const orgRows = org.map((f) => `<tr>
      <td></td><td>${escapeHtml(f.label)}</td><td>${canonCell(f.label)}</td></tr>`).join('');

  const seen = new Set();
  const eventRows = named
    .filter((h) => !seen.has(h) && seen.add(h))
    .map((h, i) => `<tr>
      <td><input type="checkbox" data-header="${escapeHtml(h)}" id="use${i}"
        ${UFRA_ROW.isUsed(h, columnUse) ? 'checked' : ''}></td>
      <td><label for="use${i}">${escapeHtml(h)}</label></td>
      <td>${canonCell(h)}</td></tr>`).join('');

  box.innerHTML = `
    ${named.length ? `
      <h2>Events sheet columns</h2>
      <p class="small muted">Unticked columns are never put into a form. Tracking columns
        (submitted, approved, notes, price, …) start unticked. A value like
        <code>09/16/2024, 6:00pm - 8:00pm</code> is split into date, start time and end time.</p>
      <table><thead><tr><th>Use</th><th>Your column</th><th>Recognised as</th></tr></thead>
        <tbody>${eventRows}</tbody></table>` : ''}
    ${org.length ? `
      <h2 style="margin-top:22px">Organization details</h2>
      <table><thead><tr><th></th><th>Your field</th><th>Recognised as</th></tr></thead>
        <tbody>${orgRows}</tbody></table>` : ''}`;

  box.querySelectorAll('input[data-header]').forEach((cb) => {
    cb.addEventListener('change', async () => {
      const { columnUse = {} } = await chrome.storage.local.get('columnUse');
      columnUse[cb.dataset.header] = cb.checked;
      await chrome.storage.local.set({ columnUse });
    });
  });
}

function hookFile(inputId, textareaId) {
  $(inputId).addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (file) $(textareaId).value = await file.text();
  });
}

async function restore() {
  let { org = [], headers = [], rawOrgCsv = '', rawHeaders = '', columnUse = {}, importedAt } =
    await chrome.storage.local.get(['org', 'headers', 'rawOrgCsv', 'rawHeaders', 'columnUse', 'importedAt']);
  $('orgCsv').value = rawOrgCsv;
  $('headerRow').value = rawHeaders;
  if (importedAt) $('status').textContent = `Last saved ${new Date(importedAt).toLocaleString()}`;

  // A file in data/ wins over whatever was saved here.
  const files = await UFRA_DATAFILES.load();
  if (files.orgText) {
    org = annotate(UFRA_CSV.parseRecord(files.orgText));
    lockToFile('orgCsv', files.orgText, 'data/org.csv');
  }
  if (files.headerText) {
    headers = UFRA_CSV.parse(files.headerText)[0] || [];
    lockToFile('headerRow', files.headerText, 'data/sheet-header.txt');
  }
  renderPreview(org, headers, columnUse);
}

function lockToFile(textareaId, text, path) {
  const box = $(textareaId);
  box.value = text;
  box.readOnly = true;
  const note = document.createElement('p');
  note.className = 'small muted';
  note.innerHTML = `Read from <code>${path}</code> in the extension folder. Edit that file to change it.`;
  box.after(note);
  box.closest('section').querySelector('input[type="file"]')?.closest('label').remove();
}

$('save').addEventListener('click', async () => {
  // A box read from a data/ file still saves, so its copy here is a fallback
  // if the file is ever removed; while the file exists it wins on load.
  const rawOrgCsv = $('orgCsv').value.trim();
  const rawHeaders = $('headerRow').value.trim();

  let org = [];
  let headers = [];
  try {
    if (rawOrgCsv) org = annotate(UFRA_CSV.parseRecord(rawOrgCsv));
    // Only the first row counts, in case a data row came along with it.
    if (rawHeaders) headers = UFRA_CSV.parse(rawHeaders)[0] || [];
  } catch (err) {
    $('status').textContent = `Could not read that: ${err.message}`;
    return;
  }

  if (!org.length && !headers.length) {
    $('status').textContent = 'Nothing to save — both boxes are empty.';
    return;
  }

  const importedAt = new Date().toISOString();
  const { columnUse = {} } = await chrome.storage.local.get('columnUse');
  await chrome.storage.local.set({ org, headers, rawOrgCsv, rawHeaders, importedAt });
  const columns = headers.filter((h) => h.trim()).length;
  $('status').textContent = `Saved ${org.length} organization field(s) and ${columns} sheet column(s).`;
  renderPreview(org, headers, columnUse);
});

$('erase').addEventListener('click', async () => {
  if (!confirm('Erase all saved organization details, sheet columns and pasted rows?')) return;
  await chrome.storage.local.clear();
  $('orgCsv').value = '';
  $('headerRow').value = '';
  $('status').textContent = 'All data erased.';
  renderPreview([], [], {});
});

$('icsFile').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const bookings = UFRA_FINALIZE.fromIcs(await file.text());
  const { buildingsText } = await UFRA_DATAFILES.load();
  const buildings = buildingsText ? UFRA_FINALIZE.buildingsFrom(UFRA_CSV.parse(buildingsText)) : [];
  $('icsOut').value = UFRA_FINALIZE.format(bookings, buildings);
  $('icsNote').textContent = bookings.length
    ? `${bookings.length} booking(s) from ${file.name}.`
    : `No bookings found in ${file.name}.`;
});

$('copyIcs').addEventListener('click', async () => {
  await navigator.clipboard.writeText($('icsOut').value);
  $('icsNote').textContent = 'Copied — paste it into the Finalized Information cell.';
});

hookFile('orgFile', 'orgCsv');
restore();
