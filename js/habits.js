// Habits view — daily check-ins on a 7-day strip, streaks, reminder settings.
import { store, dateKey } from './store.js';
import { t, locale } from './i18n.js';
import { escapeHtml } from './ui.js';
import * as reminders from './reminders.js';

let container;
const ICONS = ['🌱', '🏃', '📖', '💧', '🧘', '💤', '🥗', '✍️', '🎵', '🦷'];

function lastNDays(n) {
  const days = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d);
  }
  return days;
}

function streak(logMap = {}) {
  let count = 0;
  const d = new Date();
  if (!logMap[dateKey(d)]) d.setDate(d.getDate() - 1); // today still open ≠ broken
  while (logMap[dateKey(d)]) { count++; d.setDate(d.getDate() - 1); }
  return count;
}

export function init(el) {
  container = el;

  container.addEventListener('click', async e => {
    const dot = e.target.closest('[data-log]');
    if (dot) {
      await store.toggleLog(dot.dataset.log, dot.dataset.date);
      render();
      return;
    }
    const del = e.target.closest('[data-del-habit]');
    if (del) {
      const habits = await store.listHabits();
      const habit = habits.find(h => h.id === del.dataset.delHabit);
      if (habit && confirm(t('hab.deleteConfirm', { name: habit.name }))) {
        await store.deleteHabit(habit.id);
        render();
      }
      return;
    }
    if (e.target.closest('#rem-enable')) {
      await reminders.enable();
      render();
    }
  });

  container.addEventListener('submit', async e => {
    if (e.target.id !== 'habit-form') return;
    e.preventDefault();
    const input = container.querySelector('#habit-name');
    const name = input.value.trim();
    if (!name) return;
    const icon = container.querySelector('input[name="habit-icon"]:checked')?.value || '🌱';
    await store.addHabit({ name, icon });
    input.value = '';
    render();
  });

  container.addEventListener('change', async e => {
    if (e.target.id === 'rem-time') {
      await store.patchSettings({ reminderTime: e.target.value, lastReminderDate: null });
    }
  });
}

export async function render() {
  const [habits, logs, settings] = await Promise.all([
    store.listHabits(), store.getLogs(), store.getSettings(),
  ]);
  const todayKey = dateKey(new Date());
  const days = lastNDays(7);
  const doneToday = habits.filter(h => logs[h.id]?.[todayKey]).length;
  const pct = habits.length ? Math.round((doneToday / habits.length) * 100) : 0;

  const summary = habits.length
    ? `<div class="card">
        <div class="progress-label">
          <span>${t('hab.progress', { done: doneToday, total: habits.length })}</span>
          <span>${doneToday === habits.length ? '🎉' : '💪'}</span>
        </div>
        <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
      </div>`
    : `<div class="card"><p class="empty">${t('hab.empty')}</p></div>`;

  const cards = habits.map(h => {
    const logMap = logs[h.id] || {};
    const dots = days.map(d => {
      const key = dateKey(d);
      const dow = new Intl.DateTimeFormat(locale(), { weekday: 'short' }).format(d).replace('.', '').slice(0, 2);
      return `<span class="dot-wrap">
          <button class="dot ${logMap[key] ? 'done' : ''} ${key === todayKey ? 'is-today' : ''}"
            data-log="${h.id}" data-date="${key}" aria-label="${h.name} ${key}" aria-pressed="${!!logMap[key]}">
            ${logMap[key] ? '✓' : ''}
          </button>
          <span class="dow">${dow}</span>
        </span>`;
    }).join('');
    const s = streak(logMap);
    return `<div class="card habit-card">
        <div class="habit-head">
          <span class="habit-icon">${h.icon || '🌱'}</span>
          <span class="habit-name">${escapeHtml(h.name)}</span>
          ${s > 0 ? `<span class="streak-chip">🔥 ${t('hab.streak', { n: s })}</span>` : ''}
          <button class="icon-btn subtle" data-del-habit="${h.id}" data-i18n-title="hab.delete" title="${t('hab.delete')}" aria-label="${t('hab.delete')}">✕</button>
        </div>
        <div class="dots-row">${dots}</div>
      </div>`;
  }).join('');

  const addForm = `<div class="card">
      <form id="habit-form" class="habit-form">
        <div class="icon-picker">
          ${ICONS.map((ic, i) => `<label class="icon-choice">
              <input type="radio" name="habit-icon" value="${ic}" ${i === 0 ? 'checked' : ''}>
              <span>${ic}</span>
            </label>`).join('')}
        </div>
        <div class="form-row">
          <input id="habit-name" type="text" maxlength="60" placeholder="${t('hab.add.placeholder')}" autocomplete="off">
          <button class="btn" type="submit">${t('hab.add.btn')}</button>
        </div>
      </form>
    </div>`;

  const remStatus = reminders.permissionState();
  let remBody;
  if (remStatus === 'unsupported') {
    remBody = `<p class="hint">${t('hab.rem.unsupported')}</p>`;
  } else if (remStatus === 'denied') {
    remBody = `<p class="hint">${t('hab.rem.denied')}</p>`;
  } else if (remStatus === 'granted' && settings.remindersEnabled) {
    remBody = `<div class="form-row rem-row">
        <span class="rem-on">✓ ${t('hab.rem.on')}</span>
        <label class="rem-time-label">${t('hab.rem.time')}
          <input id="rem-time" type="time" value="${settings.reminderTime}">
        </label>
      </div>`;
  } else {
    remBody = `<button id="rem-enable" class="btn">${t('hab.rem.enable')}</button>`;
  }

  const remCard = `<div class="card">
      <h3 class="card-title">🔔 ${t('hab.rem.title')}</h3>
      ${remBody}
      <p class="hint small">${t('hab.rem.note')}</p>
    </div>`;

  container.innerHTML = summary + cards + addForm + remCard;
}
