// Habit reminders via the Notification API.
// Honest scope for phase 1: fires while ReHaTo is open in a tab or
// installed as a PWA. Cross-device push (app closed) needs the backend
// (phase 3: Supabase Edge Function + Web Push) — see backend/README.md.
import { store, dateKey } from './store.js';
import { t } from './i18n.js';
import { showToast } from './ui.js';

const supported = 'Notification' in window;

export function permissionState() {
  if (!supported) return 'unsupported';
  return Notification.permission; // 'default' | 'granted' | 'denied'
}

export async function enable() {
  if (!supported) return 'unsupported';
  const perm = await Notification.requestPermission();
  if (perm === 'granted') {
    await store.patchSettings({ remindersEnabled: true });
    notify(t('notif.title'), t('notif.enabled'));
  }
  return perm;
}

function notify(title, body) {
  const options = { body, icon: 'icons/icon.svg', badge: 'icons/icon.svg', tag: 'rehato-reminder' };
  // Prefer the service-worker path (required on installed PWAs / Android).
  if (navigator.serviceWorker) {
    navigator.serviceWorker.ready
      .then(reg => reg.showNotification(title, options))
      .catch(() => { try { new Notification(title, options); } catch { /* noop */ } });
  } else {
    try { new Notification(title, options); } catch { /* noop */ }
  }
}

async function openHabitsToday() {
  const [habits, logs] = await Promise.all([store.listHabits(), store.getLogs()]);
  const today = dateKey(new Date());
  const open = habits.filter(h => !logs[h.id]?.[today]).length;
  return { open, total: habits.length };
}

async function tick() {
  const s = await store.getSettings();
  if (!s.remindersEnabled || permissionState() !== 'granted') return;

  const today = dateKey(new Date());
  if (s.lastReminderDate === today) return; // already reminded today

  const now = new Date();
  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  if (hhmm < s.reminderTime) return;

  const { open, total } = await openHabitsToday();
  if (total === 0) return;

  const body = open > 0 ? t('notif.open', { n: open }) : t('notif.allDone');
  notify(t('notif.title'), body);
  if (document.visibilityState === 'visible') showToast(body);
  await store.patchSettings({ lastReminderDate: today });
}

export function init() {
  tick();
  setInterval(tick, 30_000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') tick();
  });
}
