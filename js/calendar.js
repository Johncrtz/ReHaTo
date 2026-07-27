// Calendar view — month grid; clicking a day opens the reflection editor.
import { store, dateKey } from './store.js';
import { t, locale } from './i18n.js';
import { escapeHtml, MOODS } from './ui.js';

let container, modal;
let current = startOfMonth(new Date()); // first day of displayed month
let notes = {};
let openKey = null;      // dateKey currently edited in the modal
let saveTimer = null;    // debounce handle
let savedChipTimer = null;

function startOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }

function monthLabel(d) {
  return new Intl.DateTimeFormat(locale(), { month: 'long', year: 'numeric' }).format(d);
}
function weekdayShort(i) {
  // 2024-01-01 was a Monday; grid is Monday-first.
  const d = new Date(2024, 0, 1 + i);
  return new Intl.DateTimeFormat(locale(), { weekday: 'short' }).format(d).replace('.', '');
}
function longDate(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Intl.DateTimeFormat(locale(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    .format(new Date(y, m - 1, d));
}
function shortDate(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'short' }).format(new Date(y, m - 1, d));
}

export function init(el) {
  container = el;
  modal = document.getElementById('modal');

  container.addEventListener('click', async e => {
    const nav = e.target.closest('[data-nav]');
    if (nav) {
      if (nav.dataset.nav === 'prev') current = new Date(current.getFullYear(), current.getMonth() - 1, 1);
      if (nav.dataset.nav === 'next') current = new Date(current.getFullYear(), current.getMonth() + 1, 1);
      if (nav.dataset.nav === 'today') current = startOfMonth(new Date());
      render();
      return;
    }
    const day = e.target.closest('[data-date]');
    if (day) open(day.dataset.date);
  });

  // Modal interactions (single static shell in index.html)
  modal.addEventListener('click', async e => {
    if (e.target.dataset.close !== undefined || e.target === modal) { close(); return; }
    const mood = e.target.closest('[data-mood]');
    if (mood) {
      const value = Number(mood.dataset.mood);
      const text = modal.querySelector('#note-text').value;
      const existing = await store.getNote(openKey);
      const next = existing?.mood === value ? null : value; // tap again to unset
      await store.saveNote(openKey, { text, mood: next });
      renderMoodRow(next);
      flashSaved();
      return;
    }
    if (e.target.closest('[data-delete-note]')) {
      if (confirm(t('modal.deleteConfirm'))) {
        await store.deleteNote(openKey);
        close();
      }
    }
  });

  modal.addEventListener('input', e => {
    if (e.target.id !== 'note-text') return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => persistText(), 600);
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !modal.classList.contains('hidden')) close();
  });
}

async function persistText() {
  if (!openKey) return;
  clearTimeout(saveTimer);
  saveTimer = null;
  const text = modal.querySelector('#note-text').value;
  const existing = await store.getNote(openKey);
  await store.saveNote(openKey, { text, mood: existing?.mood ?? null });
  flashSaved();
}

function flashSaved() {
  const chip = modal.querySelector('.saved-chip');
  chip.classList.add('show');
  clearTimeout(savedChipTimer);
  savedChipTimer = setTimeout(() => chip.classList.remove('show'), 1600);
}

function renderMoodRow(selected) {
  const row = modal.querySelector('.mood-row');
  row.innerHTML = MOODS.map((m, i) =>
    `<button class="mood ${selected === i ? 'selected' : ''}" data-mood="${i}" aria-label="${t('modal.mood')} ${i + 1}/5">${m}</button>`
  ).join('');
}

export async function open(key) {
  openKey = key;
  const note = await store.getNote(key);
  modal.querySelector('.modal-date').textContent = longDate(key);
  modal.querySelector('#note-text').value = note?.text || '';
  modal.querySelector('[data-delete-note]').classList.toggle('hidden', !note);
  renderMoodRow(note?.mood ?? null);
  modal.querySelector('.saved-chip').classList.remove('show');
  modal.classList.remove('hidden');
  document.body.classList.add('modal-open');
  modal.querySelector('#note-text').focus();
}

async function close() {
  if (saveTimer) await persistText(); // flush pending edits
  openKey = null;
  modal.classList.add('hidden');
  document.body.classList.remove('modal-open');
  render(); // refresh day markers + recent list
}

export async function render() {
  notes = await store.listNotes();
  const y = current.getFullYear(), m = current.getMonth();
  const todayKey = dateKey(new Date());

  const firstDow = (new Date(y, m, 1).getDay() + 6) % 7; // Monday = 0
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const cells = [];
  const totalCells = Math.ceil((firstDow + daysInMonth) / 7) * 7;
  for (let i = 0; i < totalCells; i++) {
    const dayNum = i - firstDow + 1;
    const d = new Date(y, m, dayNum);
    const key = dateKey(d);
    const inMonth = dayNum >= 1 && dayNum <= daysInMonth;
    const note = notes[key];
    const marker = note
      ? (note.mood != null ? `<span class="day-mood">${MOODS[note.mood]}</span>` : '<span class="day-dot"></span>')
      : '';
    cells.push(
      `<button class="day ${inMonth ? '' : 'other'} ${key === todayKey ? 'today' : ''} ${note ? 'has-note' : ''}"
        data-date="${key}" aria-label="${longDate(key)}">
        <span class="num">${d.getDate()}</span>${marker}
      </button>`
    );
  }

  const recentKeys = Object.keys(notes).sort().reverse().slice(0, 5);
  const recent = recentKeys.length
    ? recentKeys.map(k => {
        const n = notes[k];
        const preview = escapeHtml((n.text || '').replace(/\s+/g, ' ').slice(0, 90));
        return `<button class="recent-item" data-date="${k}">
            <span class="recent-date">${shortDate(k)}</span>
            <span class="recent-mood">${n.mood != null ? MOODS[n.mood] : '·'}</span>
            <span class="recent-text">${preview || '—'}</span>
          </button>`;
      }).join('')
    : `<p class="empty">${t('cal.empty')}</p>`;

  container.innerHTML = `
    <div class="card">
      <div class="cal-toolbar">
        <button class="icon-btn" data-nav="prev" aria-label="${t('cal.prev')}">‹</button>
        <h2 class="cal-title">${monthLabel(current)}</h2>
        <button class="icon-btn" data-nav="next" aria-label="${t('cal.next')}">›</button>
        <button class="btn-ghost cal-today-btn" data-nav="today">${t('cal.today')}</button>
      </div>
      <div class="cal-grid cal-head">${Array.from({ length: 7 }, (_, i) => `<span class="dow">${weekdayShort(i)}</span>`).join('')}</div>
      <div class="cal-grid">${cells.join('')}</div>
    </div>
    <div class="card">
      <h3 class="card-title">${t('cal.recent')}</h3>
      <div class="recent-list">${recent}</div>
    </div>`;
}
