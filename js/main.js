// ReHaTo entry point — boot, navigation, theme + language, service worker.
import { CONFIG } from './config.js';
import * as i18n from './i18n.js';
import { store, isDemo, dateKey } from './store.js';
import * as calendar from './calendar.js';
import * as habits from './habits.js';
import * as todos from './todos.js';
import * as reminders from './reminders.js';

const views = { calendar, habits, todos };
let active = 'calendar';

function viewFromHash() {
  const name = location.hash.replace('#', '');
  return views[name] ? name : 'calendar';
}

async function switchView(name) {
  active = name;
  document.querySelectorAll('.tab').forEach(tab => {
    const on = tab.dataset.view === name;
    tab.classList.toggle('active', on);
    tab.setAttribute('aria-current', on ? 'page' : 'false');
  });
  document.querySelectorAll('.view').forEach(sec => {
    sec.classList.toggle('hidden', sec.id !== `view-${name}`);
  });
  await views[name].render();
}

function resolvedTheme() {
  const attr = document.documentElement.dataset.theme;
  if (attr) return attr;
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme) {
  if (theme === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
  document.getElementById('theme-toggle').textContent = resolvedTheme() === 'dark' ? '☀️' : '🌙';
}

async function boot() {
  const settings = await store.getSettings();

  // Language: stored choice, else browser language.
  const lang = settings.lang || (navigator.language?.toLowerCase().startsWith('de') ? 'de' : 'en');
  i18n.setLang(lang);
  applyTheme(settings.theme || 'auto');
  i18n.applyStatic();
  document.getElementById('lang-toggle').textContent = lang === 'de' ? 'EN' : 'DE';
  document.getElementById('version').textContent = `v${CONFIG.version}`;

  if (isDemo) document.getElementById('demo-banner').classList.remove('hidden');

  // Views
  calendar.init(document.getElementById('view-calendar'));
  habits.init(document.getElementById('view-habits'));
  todos.init(document.getElementById('view-todos'));

  addEventListener('hashchange', () => switchView(viewFromHash()));
  await switchView(viewFromHash());

  // Deep link: ?open=today | ?open=YYYY-MM-DD opens that day's note.
  const openParam = new URLSearchParams(location.search).get('open');
  if (openParam && active === 'calendar') {
    calendar.open(openParam === 'today' ? dateKey(new Date()) : openParam);
  }

  // Header controls
  document.getElementById('lang-toggle').addEventListener('click', async () => {
    const next = i18n.getLang() === 'de' ? 'en' : 'de';
    await store.patchSettings({ lang: next });
    i18n.setLang(next);
    i18n.applyStatic();
    document.getElementById('lang-toggle').textContent = next === 'de' ? 'EN' : 'DE';
    await views[active].render();
  });

  document.getElementById('theme-toggle').addEventListener('click', async () => {
    const next = resolvedTheme() === 'dark' ? 'light' : 'dark';
    await store.patchSettings({ theme: next });
    applyTheme(next);
  });

  reminders.init();

  // Service worker: offline cache + notification host. Relative path keeps
  // the scope correct under GitHub Pages project URLs (/ReHaTo/).
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    try { await navigator.serviceWorker.register('./sw.js'); } catch { /* non-fatal */ }
  }
}

boot();
