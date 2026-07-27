// Quotes view — a quiet, read-only wall of every quote across all books,
// set in italics with proper quotation marks and book attribution.
import { store } from './store.js';
import { t } from './i18n.js';
import { escapeHtml } from './ui.js';
import { curly } from './books.js';

let container;

export function init(el) { container = el; }

export async function render() {
  const [books, entries] = await Promise.all([store.listBooks(), store.listBookEntries()]);
  const byId = Object.fromEntries(books.map(b => [b.id, b]));
  const quotes = entries
    .filter(e => e.kind === 'quote')
    .sort((a, b) => b.createdAt - a.createdAt);

  if (!quotes.length) {
    container.innerHTML = `<div class="card"><p class="empty">${t('quotes.empty')}</p></div>`;
    return;
  }

  container.innerHTML = `<div class="card quote-wall">` + quotes.map(q => {
    const book = byId[q.bookId];
    const source = book
      ? `— ${escapeHtml(book.title)}${book.author ? `, <span class="quote-author">${escapeHtml(book.author)}</span>` : ''}${q.page ? ` · ${t('book.pageShort')} ${q.page}` : ''}`
      : '';
    return `<figure class="quote-big">
        <blockquote>${curly(escapeHtml(q.text))}</blockquote>
        ${source ? `<figcaption>${source}</figcaption>` : ''}
      </figure>`;
  }).join('') + `</div>`;
}
