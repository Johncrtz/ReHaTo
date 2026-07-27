// Books view — reading list with progress, plus a per-book detail
// drill-down for tracking pages and capturing quotes & notes.
import { store } from './store.js';
import { t, getLang, locale } from './i18n.js';
import { escapeHtml } from './ui.js';

let container;
let selectedId = null;   // null = list, otherwise book detail
let entryKind = 'quote'; // quick-add type in detail view

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

export function init(el) {
  container = el;

  container.addEventListener('click', async e => {
    const open = e.target.closest('[data-open-book]');
    if (open) { selectedId = open.dataset.openBook; render(); return; }
    if (e.target.closest('[data-back]')) { selectedId = null; render(); return; }

    const kindBtn = e.target.closest('[data-ekind]');
    if (kindBtn) { entryKind = kindBtn.dataset.ekind; render(true); return; }

    const delEntry = e.target.closest('[data-del-entry]');
    if (delEntry) { await store.deleteBookEntry(delEntry.dataset.delEntry); render(); return; }

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

  container.addEventListener('submit', async e => {
    if (e.target.id === 'book-form') {
      e.preventDefault();
      const title = container.querySelector('#book-title').value.trim();
      if (!title) return;
      const author = container.querySelector('#book-author').value.trim();
      const totalPages = parseInt(container.querySelector('#book-pages').value, 10) || null;
      await store.addBook({ title, author, totalPages });
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

function progressBar(book) {
  const p = pct(book);
  if (p == null) return '';
  return `<div class="book-progress"><div class="book-progress-fill" style="width:${p}%"></div></div>`;
}

async function renderList() {
  const [books, entries] = await Promise.all([store.listBooks(), store.listBookEntries()]);

  const rows = books.map(b => {
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

  container.innerHTML = `
    <div class="card">
      <form id="book-form" class="book-form">
        <div class="form-row">
          <input id="book-title" type="text" maxlength="120" placeholder="${t('book.add.title')}" autocomplete="off">
        </div>
        <div class="form-row">
          <input id="book-author" type="text" maxlength="80" placeholder="${t('book.add.author')}" autocomplete="off">
          <input id="book-pages" type="number" min="1" max="20000" inputmode="numeric" placeholder="${t('book.add.pages')}" class="num-input">
          <button class="btn" type="submit">${t('book.add.btn')}</button>
        </div>
      </form>
    </div>
    <div class="card">
      ${books.length ? `<div class="book-list">${rows}</div>` : `<p class="empty">${t('book.empty')}</p>`}
    </div>`;
}

async function renderDetail(focusInput = false) {
  const [books, entries] = await Promise.all([store.listBooks(), store.listBookEntries()]);
  const book = books.find(b => b.id === selectedId);
  if (!book) { selectedId = null; return renderList(); }

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
  return renderList();
}
