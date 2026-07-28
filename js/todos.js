// To-dos view — checkable tasks (thoughts live in their own view now).
import { store } from './store.js';
import { t } from './i18n.js';
import { escapeHtml } from './ui.js';
import { updateBadges } from './sidebar.js';

let container;

export function init(el) {
  container = el;

  container.addEventListener('click', async e => {
    const toggle = e.target.closest('[data-toggle-item]');
    if (toggle) { await store.toggleItem(toggle.dataset.toggleItem); render(); return; }
    const del = e.target.closest('[data-del-item]');
    if (del) { await store.deleteItem(del.dataset.delItem); render(); return; }
    if (e.target.closest('#clear-done')) { await store.clearDoneItems(); render(); }
  });

  container.addEventListener('submit', async e => {
    if (e.target.id !== 'todo-form') return;
    e.preventDefault();
    const input = container.querySelector('#todo-text');
    const text = input.value.trim();
    if (!text) return;
    await store.addItem({ text, kind: 'todo' });
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

  container.innerHTML = `
    <div class="card">
      <form id="todo-form" class="form-row">
        <input id="todo-text" type="text" maxlength="300" autocomplete="off"
          placeholder="${t('todo.placeholderTodo')}">
        <button class="btn" type="submit">${t('todo.add')}</button>
      </form>
    </div>
    <div class="card">
      <h3 class="card-title">☑︎ ${t('todo.open')}</h3>
      ${todosOpen.length ? todosOpen.map(todoRow).join('') : `<p class="empty">${t('todo.emptyTodos')}</p>`}
      ${todosDone.length ? `
        <details class="done-details">
          <summary>${t('todo.done')} (${todosDone.length})</summary>
          ${todosDone.map(todoRow).join('')}
          <button id="clear-done" class="btn-ghost small">${t('todo.clearDone')}</button>
        </details>` : ''}
    </div>`;
  if (focusInput) container.querySelector('#todo-text')?.focus();
  updateBadges();
}
