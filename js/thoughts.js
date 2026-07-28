// Thoughts view — free-form notes, split out of the former Notes tab.
import { store } from './store.js';
import { t, locale } from './i18n.js';
import { escapeHtml } from './ui.js';

let container;

function shortDate(ts) {
  return new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'short' }).format(new Date(ts));
}

export function init(el) {
  container = el;

  container.addEventListener('click', async e => {
    const del = e.target.closest('[data-del-item]');
    if (del) { await store.deleteItem(del.dataset.delItem); render(); }
  });

  container.addEventListener('submit', async e => {
    if (e.target.id !== 'thought-form') return;
    e.preventDefault();
    const input = container.querySelector('#thought-text');
    const text = input.value.trim();
    if (!text) return;
    await store.addItem({ text, kind: 'thought' });
    input.value = '';
    render(true);
  });
}

export async function render(focusInput = false) {
  const thoughts = (await store.listItems()).filter(i => i.kind === 'thought');

  container.innerHTML = `
    <div class="card">
      <form id="thought-form" class="form-row">
        <input id="thought-text" type="text" maxlength="300" autocomplete="off"
          placeholder="${t('todo.placeholderThought')}">
        <button class="btn" type="submit">${t('todo.add')}</button>
      </form>
    </div>
    <div class="card">
      ${thoughts.length
        ? thoughts.map(it => `
            <div class="thought-card">
              <p class="thought-text">${escapeHtml(it.text)}</p>
              <div class="thought-meta">
                <span>${shortDate(it.createdAt)}</span>
                <button class="icon-btn subtle" data-del-item="${it.id}" aria-label="✕">✕</button>
              </div>
            </div>`).join('')
        : `<p class="empty">${t('todo.emptyThoughts')}</p>`}
    </div>`;
  if (focusInput) container.querySelector('#thought-text')?.focus();
}
