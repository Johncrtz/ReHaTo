// ReHaTo entry point — boot, navigation, theme + language, sync, service worker.
import { CONFIG } from './config.js';
import * as i18n from './i18n.js';
import { store, sync, isDemo, dateKey } from './store.js';
import { showToast } from './ui.js';
import * as calendar from './calendar.js';
import * as habits from './habits.js';
import * as todos from './todos.js';
import * as books from './books.js';
import * as quotes from './quotes.js';
import * as reminders from './reminders.js';

const views = { calendar, habits, todos, books, quotes };
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

function renderSyncUi() {
  const btn = document.getElementById('sync-toggle');
  const on = sync.status === 'on';
  btn.classList.toggle('hidden', !sync.available);
  btn.classList.toggle('sync-on', on);
  btn.classList.toggle('sync-busy', sync.status === 'connecting');
  btn.setAttribute('aria-pressed', String(on));
  btn.title = i18n.t(on ? 'sync.on' : 'sync.off');
  btn.setAttribute('aria-label', btn.title);
  document.getElementById('footer-status').textContent =
    i18n.t(on ? 'footer.synced' : 'footer.local');
}

async function toggleSync() {
  if (sync.status === 'connecting') return;
  if (sync.status === 'on') {
    if (!confirm(i18n.t('sync.confirmDisable'))) return;
    await sync.disable();
    showToast(i18n.t('sync.disabledToast'));
  } else {
    if (!confirm(i18n.t('sync.confirmEnable'))) return;
    renderSyncUi();
    const ok = await sync.enable();
    showToast(i18n.t(ok ? 'sync.enabledToast' : 'sync.error'));
  }
  renderSyncUi();
  await views[active].render();
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

  // Reconnect cloud sync if the user had it on (before first render).
  await sync.init();
  if (sync.status === 'error') showToast(i18n.t('sync.error'));
  renderSyncUi();

  // Views
  calendar.init(document.getElementById('view-calendar'));
  habits.init(document.getElementById('view-habits'));
  todos.init(document.getElementById('view-todos'));
  books.init(document.getElementById('view-books'));
  quotes.init(document.getElementById('view-quotes'));

  addEventListener('hashchange', () => switchView(viewFromHash()));
  await switchView(viewFromHash());

  // Deep link: ?open=today | ?open=YYYY-MM-DD opens that day's note.
  const openParam = new URLSearchParams(location.search).get('open');
  if (openParam && active === 'calendar') {
    calendar.open(openParam === 'today' ? dateKey(new Date()) : openParam);
  }

  // Header controls
  document.getElementById('sync-toggle').addEventListener('click', toggleSync);

  document.getElementById('lang-toggle').addEventListener('click', async () => {
    const next = i18n.getLang() === 'de' ? 'en' : 'de';
    await store.patchSettings({ lang: next });
    i18n.setLang(next);
    i18n.applyStatic();
    document.getElementById('lang-toggle').textContent = next === 'de' ? 'EN' : 'DE';
    renderSyncUi();
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
