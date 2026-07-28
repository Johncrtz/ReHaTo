// Quotes view — a quiet, read-only wall of every quote across all books,
// filterable by book, author, and free-text search.
import { store } from './store.js';
import { t } from './i18n.js';
import { escapeHtml } from './ui.js';
import { curly } from './books.js';

let container;
let filterBook = null;   // book id or null
let filterAuthor = null; // author name or null
let search = '';

export function init(el) {
  container = el;

  container.addEventListener('click', e => {
    const chip = e.target.closest('[data-filter-book], [data-filter-author]');
    if (!chip) return;
    if (chip.dataset.filterBook !== undefined) {
      filterBook = chip.dataset.filterBook || null;
    } else {
      filterAuthor = chip.dataset.filterAuthor || null;
    }
    render();
  });

  container.addEventListener('input', e => {
    if (e.target.id !== 'quote-search') return;
    search = e.target.value.trim().toLowerCase();
    renderList();
  });
}

function chipRow(labelKey, entries, active, dataAttr) {
  if (entries.length < 2) return '';
  const chips = [
    `<button class="chip-filter ${active == null ? 'active' : ''}" ${dataAttr}="">${t('quotes.filterAll')}</button>`,
    ...entries.map(([value, label]) =>
      `<button class="chip-filter ${active === value ? 'active' : ''}" ${dataAttr}="${escapeHtml(value)}">${escapeHtml(label)}</button>`),
  ].join('');
  return `<div class="filter-row"><span class="filter-label">${t(labelKey)}</span><div class="filter-chips">${chips}</div></div>`;
}

let cachedBooks = [], cachedQuotes = [];

function matching() {
  return cachedQuotes.filter(q => {
    if (filterBook && q.bookId !== filterBook) return false;
    if (filterAuthor) {
      const book = cachedBooks.find(b => b.id === q.bookId);
      if ((book?.author || '') !== filterAuthor) return false;
    }
    if (search && !q.text.toLowerCase().includes(search)) return false;
    return true;
  });
}

function renderList() {
  const listEl = container.querySelector('.quote-wall');
  if (!listEl) return;
  const byId = Object.fromEntries(cachedBooks.map(b => [b.id, b]));
  const quotes = matching();
  listEl.innerHTML = quotes.length
    ? quotes.map(q => {
        const book = byId[q.bookId];
        const source = book
          ? `— ${escapeHtml(book.title)}${book.author ? `, <span class="quote-author">${escapeHtml(book.author)}</span>` : ''}${q.page ? ` · ${t('book.pageShort')} ${q.page}` : ''}`
          : '';
        return `<figure class="quote-big">
            <blockquote>${curly(escapeHtml(q.text))}</blockquote>
            ${source ? `<figcaption>${source}</figcaption>` : ''}
          </figure>`;
      }).join('')
    : `<p class="empty">${t('quotes.noMatch')}</p>`;
}

export async function render() {
  const [books, entries] = await Promise.all([store.listBooks(), store.listBookEntries()]);
  cachedBooks = books;
  cachedQuotes = entries.filter(e => e.kind === 'quote').sort((a, b) => b.createdAt - a.createdAt);

  if (!cachedQuotes.length) {
    container.innerHTML = `<div class="card"><p class="empty">${t('quotes.empty')}</p></div>`;
    return;
  }

  // Drop stale filters (e.g. after a book was deleted).
  if (filterBook && !books.some(b => b.id === filterBook)) filterBook = null;
  const authors = [...new Set(books.map(b => b.author).filter(Boolean))];
  if (filterAuthor && !authors.includes(filterAuthor)) filterAuthor = null;

  const bookEntries2 = books
    .filter(b => cachedQuotes.some(q => q.bookId === b.id))
    .map(b => [b.id, b.title]);

  container.innerHTML = `
    <div class="card quote-filters">
      <div class="form-row">
        <input id="quote-search" type="text" placeholder="${t('quotes.search')}" value="${escapeHtml(search)}" autocomplete="off">
      </div>
      ${chipRow('quotes.filterBook', bookEntries2, filterBook, 'data-filter-book')}
      ${chipRow('quotes.filterAuthor', authors.map(a => [a, a]), filterAuthor, 'data-filter-author')}
    </div>
    <div class="card quote-wall"></div>`;
  renderList();
}
