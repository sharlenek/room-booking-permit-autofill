const $ = (id) => document.getElementById(id);

function eventTitle(ev, i) {
  const named = ev.fields.find((f) => f.canon === 'eventName' && f.value);
  const dated = ev.fields.find((f) => f.canon === 'eventDate' && f.value);
  const base = named ? named.value : (ev.fields.find((f) => f.value)?.value || `Event ${i + 1}`);
  return dated ? `${base} — ${dated.value}` : base;
}

async function load() {
  const { org = [], events = [], importedAt, selectedIndex = 0 } =
    await chrome.storage.local.get(['org', 'events', 'importedAt', 'selectedIndex']);

  if (!events.length && !org.length) {
    $('empty').hidden = false;
    return { org, events };
  }

  $('ready').hidden = false;
  const select = $('event');
  if (events.length) {
    events.forEach((ev, i) => {
      const opt = document.createElement('option');
      opt.value = String(i);
      opt.textContent = eventTitle(ev, i);
      select.appendChild(opt);
    });
    select.value = String(Math.min(selectedIndex, events.length - 1));
  } else {
    const opt = document.createElement('option');
    opt.textContent = 'Organization details only';
    select.appendChild(opt);
    select.disabled = true;
  }

  if (importedAt) {
    $('stamp').textContent = ` · imported ${new Date(importedAt).toLocaleDateString()}`;
  }
  return { org, events };
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
  const { org, events } = await load();

  $('event').addEventListener('change', (e) => {
    chrome.storage.local.set({ selectedIndex: Number(e.target.value) });
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
      const fields = [...(events[idx]?.fields || []), ...org];
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

  for (const id of ['toOptions1', 'toOptions2']) {
    $(id)?.addEventListener('click', (e) => {
      e.preventDefault();
      chrome.runtime.openOptionsPage();
    });
  }
}

main();
