// Account & sync panel — the UI for the account lifecycle:
//   local → anonymous → pending (email sent) → secured
// Rendering is a pure function of (accountState, uiState) so every
// transition stays predictable; all Supabase work lives in store.js.
import { sync, isDemo } from './store.js';
import { t } from './i18n.js';
import { showToast, escapeHtml } from './ui.js';

const ICO = {
  person: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="3.6"/><path d="M4.8 19.2c1.7-3.1 4.3-4.6 7.2-4.6s5.5 1.5 7.2 4.6"/></svg>',
  cloud: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 18h9.2a3.8 3.8 0 0 0 .7-7.54A5.6 5.6 0 0 0 6 8.7 4.3 4.3 0 0 0 7 18Z"/></svg>',
  cloudCheck: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 18h9.2a3.8 3.8 0 0 0 .7-7.54A5.6 5.6 0 0 0 6 8.7 4.3 4.3 0 0 0 7 18Z"/><path d="m9.2 13.4 1.9 1.9 3.7-3.9"/></svg>',
  mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5.5" width="17" height="13" rx="2"/><path d="m4.5 7.5 7.5 5.5 7.5-5.5"/></svg>',
  shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.2 18.8 6v5c0 4.3-2.9 7.3-6.8 8.8C8.1 18.3 5.2 15.3 5.2 11V6Z"/><path d="m9.3 11.6 1.9 1.9 3.5-3.7"/></svg>',
  logout: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M13.5 5H8a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h5.5"/><path d="m16.5 8.5 3.5 3.5-3.5 3.5"/><path d="M20 12h-9.5"/></svg>',
  refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6.5V11h-4.5"/><path d="M4 17.5V13h4.5"/><path d="M5.5 9.5a7 7 0 0 1 12.9-1.9M18.5 14.5a7 7 0 0 1-12.9 1.9"/></svg>',
};

let modal, btn;
let opened = false;
// Transient panel UI state (reset per open / per account-state change)
let ui = { mode: 'menu', busy: false, error: '', sent: '' };
let lastKind = null;

const emailField = (id, submitLabel, dataAction) => `
  <form class="acct-form" data-action="${dataAction}">
    <div class="acct-input-row">
      <span class="acct-input-ico">${ICO.mail}</span>
      <input id="${id}" type="email" required placeholder="${t('acct.emailPlaceholder')}" autocomplete="email" ${ui.busy ? 'disabled' : ''}>
    </div>
    <button class="btn btn-block" type="submit" ${ui.busy ? 'disabled' : ''}>${ui.busy ? t('acct.sending') : submitLabel}</button>
  </form>`;

const feedback = () => `
  ${ui.error ? `<p class="acct-error">${escapeHtml(ui.error)}</p>` : ''}
  ${ui.sent ? `<p class="acct-sent">${t('acct.linkSentTo', { email: escapeHtml(ui.sent) })}</p>` : ''}`;

// Pure renderer — also used by QA harnesses to preview every state.
export function panelHtml(state) {
  const head = `
    <div class="acct-head">
      <h2>${t('acct.title')}</h2>
      <button class="icon-btn" data-close aria-label="✕">✕</button>
    </div>`;

  if (state.kind === 'local') {
    const signin = ui.mode === 'signin'
      ? `${emailField('acct-email', t('acct.sendLoginLink'), 'signin')}
         <p class="hint small">${t('acct.openOnDevice')}</p>`
      : `<button class="btn-ghost btn-block" data-action="show-signin">${t('acct.signinShow')}</button>`;
    return `${head}
      <div class="acct-status"><span class="acct-status-ico muted-ico">${ICO.person}</span>${t('acct.localBody')}</div>
      <button class="btn btn-block" data-action="enable" ${ui.busy ? 'disabled' : ''}>
        ${ui.busy ? t('acct.working') : `${t('acct.enableBtn')} <span class="btn-sub">${t('acct.enableSub')}</span>`}
      </button>
      ${feedback()}
      <div class="acct-divider"><span>${t('acct.or')}</span></div>
      <p class="acct-mini-label">${t('acct.haveAccount')}</p>
      ${signin}`;
  }

  if (state.kind === 'anonymous') {
    return `${head}
      <div class="acct-status on"><span class="acct-status-ico">${ICO.cloudCheck}</span>${t('acct.anonStatus')}</div>
      <div class="acct-card">
        <span class="acct-card-ico">${ICO.shield}</span>
        <p>${t('acct.anonWarn')}</p>
      </div>
      <p class="acct-mini-label">${t('acct.secureTitle')}</p>
      ${emailField('acct-email', t('acct.sendConfirmLink'), 'link')}
      ${feedback()}
      <div class="acct-foot">
        <button class="btn-ghost" data-action="pause">${t('acct.pause')}</button>
      </div>`;
  }

  if (state.kind === 'pending') {
    return `${head}
      <div class="acct-status on"><span class="acct-status-ico">${ICO.mail}</span>${t('acct.pendingTitle')}</div>
      <p class="acct-sent">${t('acct.linkSentTo', { email: escapeHtml(state.email) })}</p>
      <p class="hint">${t('acct.pendingBody')}</p>
      ${feedback()}
      <div class="acct-actions">
        <button class="btn-ghost" data-action="recheck" ${ui.busy ? 'disabled' : ''}>${ICO.refresh}<span>${t('acct.checkNow')}</span></button>
        <button class="btn-ghost" data-action="resend" ${ui.busy ? 'disabled' : ''}>${t('acct.resend')}</button>
        <button class="btn-ghost" data-action="change-email">${t('acct.changeEmail')}</button>
      </div>
      ${ui.mode === 'changemail' ? emailField('acct-email', t('acct.sendConfirmLink'), 'link') : ''}
      <div class="acct-foot">
        <button class="btn-ghost" data-action="pause">${t('acct.pause')}</button>
      </div>`;
  }

  if (state.kind === 'secured') {
    const initial = (state.email || '?')[0].toUpperCase();
    return `${head}
      <div class="acct-id">
        <span class="acct-avatar">${escapeHtml(initial)}</span>
        <div class="acct-id-text">
          <span class="acct-email">${escapeHtml(state.email)}</span>
          <span class="acct-badge-line">${ICO.shield} ${t('acct.securedBadge')}</span>
        </div>
      </div>
      <p class="hint">${t('acct.securedBody')}</p>
      ${feedback()}
      <div class="acct-foot">
        <button class="btn-ghost" data-action="pause">${t('acct.pause')}</button>
        ${ui.mode === 'confirm-signout'
          ? `<button class="btn-ghost danger" data-action="signout">${t('acct.signOutConfirm')}</button>`
          : `<button class="btn-ghost danger" data-action="ask-signout">${ICO.logout}<span>${t('acct.signOut')}</span></button>`}
      </div>
      ${ui.mode === 'confirm-signout' ? `<p class="hint small">${t('acct.signOutNote')}</p>` : ''}`;
  }

  return head;
}

function renderButton(state) {
  if (!btn) return;
  btn.classList.toggle('hidden', state.kind === 'unavailable');
  const badge = btn.querySelector('.acct-btn-badge');
  const ico = btn.querySelector('.acct-btn-ico');
  const avatar = btn.querySelector('.acct-btn-avatar');
  avatar.classList.add('hidden');
  ico.classList.remove('hidden');
  badge.classList.add('hidden');
  btn.classList.toggle('acct-on', state.kind === 'anonymous' || state.kind === 'pending' || state.kind === 'secured');
  if (state.kind === 'secured') {
    ico.classList.add('hidden');
    avatar.classList.remove('hidden');
    avatar.textContent = (state.email || '?')[0].toUpperCase();
  } else if (state.kind === 'pending') {
    ico.innerHTML = ICO.mail;
    badge.classList.remove('hidden');
  } else if (state.kind === 'anonymous') {
    ico.innerHTML = ICO.cloudCheck;
  } else {
    ico.innerHTML = ICO.person;
  }
  btn.title = t('acct.label');
  btn.setAttribute('aria-label', t('acct.label'));
}

function renderFooter(state) {
  const el = document.getElementById('footer-status');
  if (!el) return;
  if (state.kind === 'secured') el.textContent = t('footer.securedAs', { email: state.email });
  else if (state.kind === 'anonymous' || state.kind === 'pending') el.textContent = t('footer.synced');
  else el.textContent = t('footer.local');
}

export async function refresh() {
  const state = await sync.accountState();
  if (state.kind !== lastKind) { ui = { mode: 'menu', busy: false, error: '', sent: '' }; lastKind = state.kind; }
  renderButton(state);
  renderFooter(state);
  if (opened) modal.querySelector('#account-body').innerHTML = panelHtml(state);
  return state;
}

function refreshViews() { window.dispatchEvent(new CustomEvent('rehato:refresh-view')); }

async function handleAction(action, form) {
  const getEmail = () => {
    const input = modal.querySelector('#acct-email');
    if (!input || !input.checkValidity() || !input.value.includes('@')) {
      ui.error = t('acct.emailInvalid');
      return null;
    }
    return input.value.trim();
  };

  ui.error = '';
  try {
    switch (action) {
      case 'enable': {
        ui.busy = true; await refresh();
        const ok = await sync.enable();
        ui.busy = false;
        showToast(t(ok ? 'sync.enabledToast' : 'sync.error'));
        refreshViews();
        break;
      }
      case 'show-signin': ui.mode = 'signin'; break;
      case 'signin': {
        const email = getEmail(); if (!email) break;
        ui.busy = true; await refresh();
        await sync.signInWithEmail(email);
        ui.busy = false; ui.sent = email;
        break;
      }
      case 'link': {
        const email = getEmail(); if (!email) break;
        ui.busy = true; await refresh();
        await sync.linkEmail(email);
        ui.busy = false; ui.mode = 'menu'; ui.sent = '';
        break;
      }
      case 'resend': {
        const state = await sync.accountState();
        if (state.email) {
          ui.busy = true; await refresh();
          await sync.linkEmail(state.email);
          ui.busy = false; ui.sent = state.email;
        }
        break;
      }
      case 'change-email': ui.mode = 'changemail'; break;
      case 'recheck': {
        ui.busy = true; await refresh();
        const state = await sync.recheck();
        ui.busy = false;
        if (state.kind === 'secured') { showToast(t('acct.secured')); refreshViews(); }
        else ui.error = t('acct.stillPending');
        break;
      }
      case 'pause': {
        await sync.disable();
        showToast(t('sync.disabledToast'));
        close();
        refreshViews();
        break;
      }
      case 'ask-signout': ui.mode = 'confirm-signout'; break;
      case 'signout': {
        ui.busy = true; await refresh();
        await sync.signOut();
        ui.busy = false;
        showToast(t('acct.signedOut'));
        close();
        refreshViews();
        break;
      }
    }
  } catch (e) {
    ui.busy = false;
    ui.error = e?.message || String(e);
    console.error('[ReHaTo] account action failed', action, e);
  }
  await refresh();
}

export function open() {
  opened = true;
  ui = { mode: 'menu', busy: false, error: '', sent: '' };
  modal.classList.remove('hidden');
  document.body.classList.add('modal-open');
  refresh();
}

function close() {
  opened = false;
  modal.classList.add('hidden');
  document.body.classList.remove('modal-open');
}

export function init() {
  btn = document.getElementById('account-btn');
  modal = document.getElementById('account-modal');
  if (isDemo || !sync.available) { btn.classList.add('hidden'); renderFooter({ kind: 'local' }); return; }

  btn.addEventListener('click', open);

  modal.addEventListener('click', e => {
    if (e.target === modal || e.target.closest('[data-close]')) { close(); return; }
    const el = e.target.closest('[data-action]');
    if (el && el.tagName !== 'FORM') {
      e.preventDefault();
      handleAction(el.dataset.action, null);
    }
  });
  modal.addEventListener('submit', e => {
    e.preventDefault();
    const form = e.target.closest('[data-action]');
    if (form) handleAction(form.dataset.action, form);
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && opened) close();
  });

  sync.onChange(() => refresh());

  // Surface expired/invalid email links once, then clean the hash.
  if (sync.linkErrored) {
    showToast(t('acct.linkError'));
    history.replaceState(null, '', location.pathname + location.search);
  }
  refresh();
}
