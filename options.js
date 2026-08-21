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

function renderPreview(org, events) {
  const box = $('preview');
  if (!org.length && !events.length) { box.innerHTML = ''; return; }

  const columns = [...org, ...(events[0]?.fields || [])];
  const seen = new Set();
  const rows = columns
    .filter((f) => !seen.has(f.label) && seen.add(f.label))
    .map((f) => `<tr>
        <td>${escapeHtml(f.label)}</td>
        <td>${f.canon
            ? `<span class="pill">${escapeHtml(f.canon)}</span>`
            : '<span class="muted">matched by column name only</span>'}</td>
      </tr>`)
    .join('');

  box.innerHTML = `
    <h2>Recognised columns</h2>
    <p class="small muted">${org.length} organization field(s), ${events.length} event(s).
      Columns without a recognised field still match if a form label matches the column name.</p>
    <table><thead><tr><th>Your column</th><th>Recognised as</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function hookFile(inputId, textareaId) {
  $(inputId).addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (file) $(textareaId).value = await file.text();
  });
}

async function restore() {
  const { org = [], events = [], rawOrgCsv = '', rawEventsCsv = '', importedAt } =
    await chrome.storage.local.get(['org', 'events', 'rawOrgCsv', 'rawEventsCsv', 'importedAt']);
  $('orgCsv').value = rawOrgCsv;
  $('eventsCsv').value = rawEventsCsv;
  if (importedAt) $('status').textContent = `Last imported ${new Date(importedAt).toLocaleString()}`;
  renderPreview(org, events);
}

$('save').addEventListener('click', async () => {
  const rawOrgCsv = $('orgCsv').value.trim();
  const rawEventsCsv = $('eventsCsv').value.trim();

  let org = [];
  let events = [];
  try {
    if (rawOrgCsv) org = annotate(UFRA_CSV.parseRecord(rawOrgCsv));
    if (rawEventsCsv) {
      events = UFRA_CSV.parseTable(rawEventsCsv).records
        .map((fields) => ({ fields: annotate(fields) }));
    }
  } catch (err) {
    $('status').textContent = `Could not read that CSV: ${err.message}`;
    return;
  }

  if (!org.length && !events.length) {
    $('status').textContent = 'Nothing to import — both boxes are empty.';
    return;
  }

  const importedAt = new Date().toISOString();
  await chrome.storage.local.set({ org, events, rawOrgCsv, rawEventsCsv, importedAt, selectedIndex: 0 });
  $('status').textContent = `Imported ${events.length} event(s) and ${org.length} organization field(s).`;
  renderPreview(org, events);
});

$('erase').addEventListener('click', async () => {
  if (!confirm('Erase all imported organization and event data?')) return;
  await chrome.storage.local.clear();
  $('orgCsv').value = '';
  $('eventsCsv').value = '';
  $('status').textContent = 'All data erased.';
  renderPreview([], []);
});

hookFile('orgFile', 'orgCsv');
hookFile('eventsFile', 'eventsCsv');
restore();
