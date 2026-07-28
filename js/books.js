// Books view — a bookshelf that fills as you read, with Open Library
// autocomplete (title/author + cover) on add, and a per-book detail
// drill-down for tracking pages and capturing quotes & notes.
import { store } from './store.js';
import { t, getLang, locale } from './i18n.js';
import { escapeHtml } from './ui.js';

let container;
let selectedId = null;    // null = shelf/list, otherwise book detail
let entryKind = 'quote';  // quick-add type in detail view
let viewMode = 'shelf';   // 'shelf' | 'list' (persisted in settings)

// Autocomplete state
let suggestions = [];
let highlighted = -1;
let pendingCover = null;  // {url} chosen from a suggestion
let searchSeq = 0;
let debounceTimer = null;

export function curly(text) {
  return getLang() === 'de' ? `„${text}“` : `“${text}”`;
}
function shortDate(ts) {
  return new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'short' }).format(new Date(ts));
}
function pct(book) {
  if (!book.totalPages) return null;
  return Math.min(100, Math.round(((book.currentPage || 0) / book.totalPages) * 100));
}

/* ── Open Library autocomplete ─────────────────────────────── */

async function fetchSuggestions(query) {
  const seq = ++searchSeq;
  try {
    const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}`
      + `&limit=6&fields=title,author_name,cover_i,first_publish_year&lang=${getLang()}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    if (seq !== searchSeq) return; // a newer search superseded this one
    suggestions = (data.docs || []).filter(d => d.title).slice(0, 6);
    highlighted = -1;
    renderSuggestions();
  } catch {
    if (seq === searchSeq) { suggestions = []; renderSuggestions(); }
  }
}

function renderSuggestions() {
  const box = container.querySelector('#title-suggestions');
  if (!box) return;
  if (!suggestions.length) { box.classList.add('hidden'); box.innerHTML = ''; return; }
  box.innerHTML = suggestions.map((s, i) => `
    <button type="button" class="suggestion ${i === highlighted ? 'highlight' : ''}" data-sugg="${i}">
      ${s.cover_i
        ? `<img class="sugg-cover" src="https://covers.openlibrary.org/b/id/${s.cover_i}-S.jpg" alt="" loading="lazy" onerror="this.remove()">`
        : '<span class="sugg-cover sugg-cover-empty">📖</span>'}
      <span class="sugg-text">
        <span class="sugg-title">${escapeHtml(s.title)}</span>
        <span class="sugg-meta">${escapeHtml(s.author_name?.[0] || '')}${s.first_publish_year ? ` · ${s.first_publish_year}` : ''}</span>
      </span>
    </button>`).join('');
  box.classList.remove('hidden');
}

function closeSuggestions() {
  suggestions = [];
  highlighted = -1;
  const box = container.querySelector('#title-suggestions');
  if (box) { box.classList.add('hidden'); box.innerHTML = ''; }
}

function pickSuggestion(i) {
  const s = suggestions[i];
  if (!s) return;
  container.querySelector('#book-title').value = s.title;
  const authorInput = container.querySelector('#book-author');
  if (authorInput && s.author_name?.length) authorInput.value = s.author_name[0];
  pendingCover = s.cover_i ? { url: `https://covers.openlibrary.org/b/id/${s.cover_i}-M.jpg` } : null;
  closeSuggestions();
  renderPickedCover();
  container.querySelector('#book-pages')?.focus();
}

function renderPickedCover() {
  const slot = container.querySelector('#picked-cover');
  if (!slot) return;
  slot.innerHTML = pendingCover
    ? `<img src="${escapeHtml(pendingCover.url)}" alt="" onerror="this.remove()">
       <button type="button" class="icon-btn subtle" data-clear-cover aria-label="✕">✕</button>`
    : '';
}

/* ── shelf rendering ───────────────────────────────────────── */

const SPINE_PALETTE = [
  ['#5d8069', '#f4f1e8'], ['#a8674f', '#f7efe6'], ['#b5975a', '#2e2a20'],
  ['#68788a', '#eef1f4'], ['#8a6b80', '#f5eef3'], ['#7d6b52', '#f2ece1'],
  ['#465b52', '#e9efe9'], ['#9c5c5c', '#f7ecec'],
];
function hashStr(s) {
  let h = 7;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

function shelfItem(b) {
  const h = hashStr(b.title + (b.author || ''));
  const [bg, ink] = SPINE_PALETTE[h % SPINE_PALETTE.length];
  const width = 34 + (h % 15);          // 34–48 px
  const height = 118 + ((h >> 4) % 34); // 118–151 px
  const p = pct(b);
  const finished = p === 100;
  const readLine = p != null && p > 0 && !finished
    ? `<span class="read-line" style="width:${p}%"></span>` : '';
  const finBadge = finished ? '<span class="fin">✓</span>' : '';
  const label = `${b.title}${b.author ? ' – ' + b.author : ''}`;
  return `
    <span class="book-slot">
      <button class="book-item ${b.coverUrl ? 'has-cover' : 'no-cover'}"
        style="--sw:${width}px;--sh:${height}px;--sbg:${bg};--sink:${ink}"
        data-open-book="${b.id}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">
        ${b.coverUrl
          ? `<img src="${escapeHtml(b.coverUrl)}" alt="" loading="lazy"
               onerror="this.closest('.book-item').classList.remove('has-cover');this.closest('.book-item').classList.add('no-cover');this.remove()">`
          : ''}
        <span class="spine-body"><span class="spine-title">${escapeHtml(b.title)}</span></span>
        ${readLine}${finBadge}
      </button>
    </span>`;
}

/* ── view init / events ────────────────────────────────────── */

export function init(el) {
  container = el;

  container.addEventListener('click', async e => {
    const open = e.target.closest('[data-open-book]');
    if (open) { selectedId = open.dataset.openBook; render(); return; }
    if (e.target.closest('[data-back]')) { selectedId = null; render(); return; }

    const viewBtn = e.target.closest('[data-books-view]');
    if (viewBtn) {
      viewMode = viewBtn.dataset.booksView;
      await store.patchSettings({ booksView: viewMode });
      render();
      return;
    }

    const sugg = e.target.closest('[data-sugg]');
    if (sugg) { pickSuggestion(Number(sugg.dataset.sugg)); return; }
    if (e.target.closest('[data-clear-cover]')) { pendingCover = null; renderPickedCover(); return; }

    const kindBtn = e.target.closest('[data-ekind]');
    if (kindBtn) { entryKind = kindBtn.dataset.ekind; render(true); return; }

    const delEntry = e.target.closest('[data-del-entry]');
    if (delEntry) { await store.deleteBookEntry(delEntry.dataset.delEntry); render(); return; }

    if (e.target.closest('[data-remove-cover]')) {
      await store.updateBook(selectedId, { coverUrl: null });
      render();
      return;
    }

    const delBook = e.target.closest('[data-del-book]');
    if (delBook) {
      const book = (await store.listBooks()).find(b => b.id === delBook.dataset.delBook);
      if (book && confirm(t('book.deleteConfirm', { title: book.title }))) {
        await store.deleteBook(book.id);
        selectedId = null;
        render();
      }
    }
  });

  // Autocomplete wiring (delegated so it survives re-renders)
  container.addEventListener('input', e => {
    if (e.target.id !== 'book-title') return;
    const q = e.target.value.trim();
    clearTimeout(debounceTimer);
    if (q.length < 3) { closeSuggestions(); return; }
    debounceTimer = setTimeout(() => fetchSuggestions(q), 350);
  });

  container.addEventListener('keydown', e => {
    if (e.target.id !== 'book-title' || !suggestions.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); highlighted = (highlighted + 1) % suggestions.length; renderSuggestions(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); highlighted = (highlighted - 1 + suggestions.length) % suggestions.length; renderSuggestions(); }
    else if (e.key === 'Enter' && highlighted >= 0) { e.preventDefault(); pickSuggestion(highlighted); }
    else if (e.key === 'Escape') closeSuggestions();
  });

  document.addEventListener('click', e => {
    if (!e.target.closest('.autocomplete-wrap')) closeSuggestions();
  });

  container.addEventListener('submit', async e => {
    if (e.target.id === 'book-form') {
      e.preventDefault();
      const title = container.querySelector('#book-title').value.trim();
      if (!title) return;
      const author = container.querySelector('#book-author').value.trim();
      const totalPages = parseInt(container.querySelector('#book-pages').value, 10) || null;
      await store.addBook({ title, author, totalPages, coverUrl: pendingCover?.url || null });
      pendingCover = null;
      closeSuggestions();
      e.target.reset();
      render();
    }
    if (e.target.id === 'entry-form') {
      e.preventDefault();
      const input = container.querySelector('#entry-text');
      const text = input.value.trim();
      if (!text) return;
      const page = parseInt(container.querySelector('#entry-page').value, 10) || null;
      await store.addBookEntry({ bookId: selectedId, kind: entryKind, text, page });
      input.value = '';
      container.querySelector('#entry-page').value = '';
      render(true);
    }
  });

  container.addEventListener('change', async e => {
    if (e.target.id !== 'cur-page' && e.target.id !== 'tot-pages') return;
    const cur = Math.max(0, parseInt(container.querySelector('#cur-page').value, 10) || 0);
    const tot = parseInt(container.querySelector('#tot-pages').value, 10) || null;
    await store.updateBook(selectedId, {
      currentPage: tot ? Math.min(cur, tot) : cur,
      totalPages: tot,
    });
    render();
  });
}

/* ── list / shelf overview ─────────────────────────────────── */

function progressBar(book) {
  const p = pct(book);
  if (p == null) return '';
  return `<div class="book-progress"><div class="book-progress-fill" style="width:${p}%"></div></div>`;
}

function listRows(books, entries) {
  return books.map(b => {
    const quotes = entries.filter(e => e.bookId === b.id && e.kind === 'quote').length;
    const notes = entries.filter(e => e.bookId === b.id && e.kind === 'note').length;
    const p = pct(b);
    const finished = p === 100;
    const meta = [
      finished ? t('book.finished')
        : b.totalPages ? t('book.progress', { current: b.currentPage || 0, total: b.totalPages })
        : (b.currentPage ? `${t('book.pageShort')} ${b.currentPage}` : ''),
      quotes ? t('book.countQuotes', { n: quotes }) : '',
      notes ? t('book.countNotes', { n: notes }) : '',
    ].filter(Boolean).join(' · ');
    return `<button class="book-row" data-open-book="${b.id}">
        <span class="book-line">
          <span class="book-title">${escapeHtml(b.title)}</span>
          ${b.author ? `<span class="book-author">${escapeHtml(b.author)}</span>` : ''}
          ${p != null ? `<span class="book-pct">${p} %</span>` : ''}
        </span>
        ${progressBar(b)}
        ${meta ? `<span class="book-meta">${meta}</span>` : ''}
      </button>`;
  }).join('');
}

async function renderOverview() {
  const [books, entries, settings] = await Promise.all([
    store.listBooks(), store.listBookEntries(), store.getSettings(),
  ]);
  viewMode = settings.booksView || 'shelf';

  const addForm = `
    <div class="card">
      <form id="book-form" class="book-form">
        <div class="form-row autocomplete-wrap">
          <input id="book-title" type="text" maxlength="120" placeholder="${t('book.add.title')}" autocomplete="off">
          <div id="title-suggestions" class="suggestions hidden"></div>
        </div>
        <div class="form-row">
          <input id="book-author" type="text" maxlength="80" placeholder="${t('book.add.author')}" autocomplete="off">
          <input id="book-pages" type="number" min="1" max="20000" inputmode="numeric" placeholder="${t('book.add.pages')}" class="num-input">
          <span id="picked-cover" class="picked-cover"></span>
          <button class="btn" type="submit">${t('book.add.btn')}</button>
        </div>
      </form>
    </div>`;

  const toggle = `
    <div class="books-head">
      <span class="card-title">${t('nav.books')}${books.length ? ` (${books.length})` : ''}</span>
      <div class="view-toggle">
        <button class="icon-btn ${viewMode === 'shelf' ? 'active' : ''}" data-books-view="shelf" title="${t('book.viewShelf')}" aria-label="${t('book.viewShelf')}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 19h16"/><path d="M6 19V9m4 10V6m4 13v-9m4 9V8"/></svg>
        </button>
        <button class="icon-btn ${viewMode === 'list' ? 'active' : ''}" data-books-view="list" title="${t('book.viewList')}" aria-label="${t('book.viewList')}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M8 6.5h12M8 12h12M8 17.5h12"/><path d="M4 6.5h.01M4 12h.01M4 17.5h.01"/></svg>
        </button>
      </div>
    </div>`;

  let body;
  if (!books.length) {
    body = `<div class="shelf shelf-minimal empty"><span class="shelf-empty-text">${t('book.shelfEmpty')}</span></div>`;
  } else if (viewMode === 'shelf') {
    body = `<div class="shelf shelf-minimal">${books.map(shelfItem).join('')}</div>`;
  } else {
    body = `<div class="book-list">${listRows(books, entries)}</div>`;
  }

  container.innerHTML = addForm + `<div class="card">${toggle}${body}</div>`;
  renderPickedCover();
}

/* ── detail ────────────────────────────────────────────────── */

async function renderDetail(focusInput = false) {
  const [books, entries] = await Promise.all([store.listBooks(), store.listBookEntries()]);
  const book = books.find(b => b.id === selectedId);
  if (!book) { selectedId = null; return renderOverview(); }

  const quotes = entries.filter(e => e.bookId === book.id && e.kind === 'quote');
  const notes = entries.filter(e => e.bookId === book.id && e.kind === 'note');
  const p = pct(book);

  const quoteRows = quotes.length
    ? quotes.map(q => `
        <figure class="quote-card">
          <blockquote>${curly(escapeHtml(q.text))}</blockquote>
          <figcaption>
            <span>${q.page ? `${t('book.pageShort')} ${q.page} · ` : ''}${shortDate(q.createdAt)}</span>
            <button class="icon-btn subtle" data-del-entry="${q.id}" aria-label="✕">✕</button>
          </figcaption>
        </figure>`).join('')
    : `<p class="empty">${t('book.emptyQuotes')}</p>`;

  const noteRows = notes.length
    ? notes.map(n => `
        <div class="item-row">
          <span class="item-text">${escapeHtml(n.text)}</span>
          <span class="entry-meta">${n.page ? `${t('book.pageShort')} ${n.page} · ` : ''}${shortDate(n.createdAt)}</span>
          <button class="icon-btn subtle" data-del-entry="${n.id}" aria-label="✕">✕</button>
        </div>`).join('')
    : `<p class="empty">${t('book.emptyNotes')}</p>`;

  container.innerHTML = `
    <div class="card">
      <button class="btn-ghost back-btn" data-back>← ${t('book.back')}</button>
      <div class="detail-head">
        ${book.coverUrl ? `
          <span class="detail-cover-wrap">
            <img class="detail-cover" src="${escapeHtml(book.coverUrl)}" alt="" onerror="this.parentElement.remove()">
            <button class="icon-btn subtle" data-remove-cover title="${t('book.coverRemove')}" aria-label="${t('book.coverRemove')}">✕</button>
          </span>` : ''}
        <div class="detail-title">
          <h2>${escapeHtml(book.title)}</h2>
          ${book.author ? `<span class="book-author">${escapeHtml(book.author)}</span>` : ''}
        </div>
        <button class="icon-btn subtle" data-del-book="${book.id}" title="${t('book.delete')}" aria-label="${t('book.delete')}">✕</button>
      </div>
      <div class="progress-edit">
        <label>${t('book.currentPage')}
          <input id="cur-page" type="number" min="0" max="20000" inputmode="numeric" value="${book.currentPage || 0}" class="num-input">
        </label>
        <label>${t('book.totalPages')}
          <input id="tot-pages" type="number" min="1" max="20000" inputmode="numeric" value="${book.totalPages ?? ''}" class="num-input">
        </label>
        <span class="book-pct-big">${p != null ? (p === 100 ? t('book.finished') : `${p} %`) : ''}</span>
      </div>
      ${progressBar(book)}
    </div>
    <div class="card">
      <form id="entry-form">
        <div class="seg">
          <button type="button" class="seg-btn ${entryKind === 'quote' ? 'active' : ''}" data-ekind="quote">❝ ${t('book.kindQuote')}</button>
          <button type="button" class="seg-btn ${entryKind === 'note' ? 'active' : ''}" data-ekind="note">💭 ${t('book.kindNote')}</button>
        </div>
        <div class="form-row">
          <input id="entry-text" type="text" maxlength="600" autocomplete="off"
            placeholder="${entryKind === 'quote' ? t('book.quotePlaceholder') : t('book.notePlaceholder')}">
          <input id="entry-page" type="number" min="1" max="20000" inputmode="numeric" placeholder="${t('book.page')}" class="num-input num-small">
          <button class="btn" type="submit">${t('todo.add')}</button>
        </div>
      </form>
    </div>
    <div class="card">
      <h3 class="card-title">❝ ${t('book.quotes')}</h3>
      ${quoteRows}
    </div>
    <div class="card">
      <h3 class="card-title">💭 ${t('book.notes')}</h3>
      ${noteRows}
    </div>`;
  if (focusInput) container.querySelector('#entry-text')?.focus();
}

export async function render(focusInput = false) {
  if (selectedId) return renderDetail(focusInput);
  return renderOverview();
}
