// Sidebar — primary navigation, to-do badge, open/close behavior.
// Desktop: pinned open by default (state remembered). Mobile: slide-in
// drawer with backdrop; tapping a link closes it.
import { store } from './store.js';
import { t } from './i18n.js';

const DESKTOP = matchMedia('(min-width: 920px)');
let sidebar, backdrop;

function isOpen() { return document.body.classList.contains('sb-open'); }

function setOpen(open, persist = true) {
  document.body.classList.toggle('sb-open', open);
  backdrop.classList.toggle('hidden', !(open && !DESKTOP.matches));
  document.getElementById('sb-toggle').setAttribute('aria-expanded', String(open));
  if (persist && DESKTOP.matches) store.patchSettings({ sidebarOpen: open });
}

export function toggle() { setOpen(!isOpen()); }

export async function updateBadges() {
  const items = await store.listItems();
  const open = items.filter(i => i.kind === 'todo' && !i.done).length;
  const badge = document.getElementById('todo-badge');
  if (!badge) return;
  badge.textContent = open > 99 ? '99+' : String(open);
  badge.classList.toggle('hidden', open === 0);
}

export async function init() {
  sidebar = document.getElementById('sidebar');
  backdrop = document.getElementById('backdrop');

  const settings = await store.getSettings();
  // Desktop starts open unless the user closed it; mobile starts closed.
  setOpen(DESKTOP.matches && settings.sidebarOpen !== false, false);
  requestAnimationFrame(() => requestAnimationFrame(() =>
    document.body.classList.add('sb-anim')));

  document.getElementById('sb-toggle').addEventListener('click', toggle);
  backdrop.addEventListener('click', () => setOpen(false, false));

  sidebar.addEventListener('click', e => {
    if (e.target.closest('a.nav-item') && !DESKTOP.matches) setOpen(false, false);
  });

  DESKTOP.addEventListener?.('change', () => {
    // Re-evaluate backdrop + margin behavior when crossing the breakpoint.
    setOpen(DESKTOP.matches ? isOpen() : false, false);
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && isOpen() && !DESKTOP.matches) setOpen(false, false);
  });

  updateBadges();
}
