// Notes view — quick capture of to-dos (checkable) and free thoughts.
import { store } from './store.js';
import { t, locale } from './i18n.js';
import { escapeHtml } from './ui.js';

let container;
let kind = 'todo'; // current quick-add type

function shortDate(ts) {
  return new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'short' }).format(new Date(ts));
}

export function init(el) {
  container = el;

  container.addEventListener('click', async e => {
    const seg = e.target.closest('[data-kind]');
    if (seg) {
      kind = seg.dataset.kind;
      render(true);
      return;
    }
    const toggle = e.target.closest('[data-toggle-item]');
    if (toggle) { await store.toggleItem(toggle.dataset.toggleItem); render(); return; }
    const del = e.target.closest('[data-del-item]');
    if (del) { await store.deleteItem(del.dataset.delItem); render(); return; }
    if (e.target.closest('#clear-done')) { await store.clearDoneItems(); render(); }
  });

  container.addEventListener('submit', async e => {
    if (e.target.id !== 'item-form') return;
    e.preventDefault();
    const input = container.querySelector('#item-text');
    const text = input.value.trim();
    if (!text) return;
    await store.addItem({ text, kind });
    input.value = '';
    render(true);
  });
}

const todoRow = it => `
  <div class="item-row ${it.done ? 'done' : ''}">
    <button class="checkbox" data-toggle-item="${it.id}" role="checkbox" aria-checked="${it.done}"></button>
    <span class="item-text">${escapeHtml(it.text)}</span>
    <button class="icon-btn subtle" data-del-item="${it.id}" aria-label="✕">✕</button>
  </div>`;

export async function render(focusInput = false) {
  const items = await store.listItems();
  const todosOpen = items.filter(i => i.kind === 'todo' && !i.done);
  const todosDone = items.filter(i => i.kind === 'todo' && i.done);
  const thoughts = items.filter(i => i.kind === 'thought');

  const addCard = `<div class="card">
      <form id="item-form">
        <div class="seg" role="tablist">
          <button type="button" class="seg-btn ${kind === 'todo' ? 'active' : ''}" data-kind="todo">☑︎ ${t('todo.typeTodo')}</button>
          <button type="button" class="seg-btn ${kind === 'thought' ? 'active' : ''}" data-kind="thought">💭 ${t('todo.typeThought')}</button>
        </div>
        <div class="form-row">
          <input id="item-text" type="text" maxlength="300" autocomplete="off"
            placeholder="${kind === 'todo' ? t('todo.placeholderTodo') : t('todo.placeholderThought')}">
          <button class="btn" type="submit">${t('todo.add')}</button>
        </div>
      </form>
    </div>`;

  const openCard = `<div class="card">
      <h3 class="card-title">☑︎ ${t('todo.open')}</h3>
      ${todosOpen.length ? todosOpen.map(todoRow).join('') : `<p class="empty">${t('todo.emptyTodos')}</p>`}
      ${todosDone.length ? `
        <details class="done-details">
          <summary>${t('todo.done')} (${todosDone.length})</summary>
          ${todosDone.map(todoRow).join('')}
          <button id="clear-done" class="btn-ghost small">${t('todo.clearDone')}</button>
        </details>` : ''}
    </div>`;

  const thoughtsCard = `<div class="card">
      <h3 class="card-title">💭 ${t('todo.thoughts')}</h3>
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

  container.innerHTML = addCard + openCard + thoughtsCard;
  if (focusInput) container.querySelector('#item-text')?.focus();
}
