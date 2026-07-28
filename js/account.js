// Account & sync panel — two-state model:
//   LOCAL   → data lives in this browser only (privacy default)
//   SECURED → name + email + password account; sign in once per device,
//             the session persists and refreshes itself.
// Plus transient flows: pending email confirmation and password recovery.
// Rendering is a pure function of (accountState, uiState); all Supabase
// work lives in store.js.
import { sync, isDemo } from './store.js';
import { t } from './i18n.js';
import { showToast, escapeHtml } from './ui.js';

const ICO = {
  person: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="3.6"/><path d="M4.8 19.2c1.7-3.1 4.3-4.6 7.2-4.6s5.5 1.5 7.2 4.6"/></svg>',
  mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5.5" width="17" height="13" rx="2"/><path d="m4.5 7.5 7.5 5.5 7.5-5.5"/></svg>',
  lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="10.5" width="14" height="9" rx="2"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/></svg>',
  shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.2 18.8 6v5c0 4.3-2.9 7.3-6.8 8.8C8.1 18.3 5.2 15.3 5.2 11V6Z"/><path d="m9.3 11.6 1.9 1.9 3.5-3.7"/></svg>',
  logout: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M13.5 5H8a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h5.5"/><path d="m16.5 8.5 3.5 3.5-3.5 3.5"/><path d="M20 12h-9.5"/></svg>',
};

let modal, btn;
let opened = false;
// Transient panel state; mode: 'signup' | 'signin' | 'forgot' | 'newpass' | 'confirm-signout' | null
let ui = { mode: 'signup', busy: false, error: '', sent: '' };
let lastKind = null;

const input = (id, type, placeholder, ico, autocomplete = '') => `
  <div class="acct-input-row">
    <span class="acct-input-ico">${ico}</span>
    <input id="${id}" type="${type}" required placeholder="${placeholder}"
      ${autocomplete ? `autocomplete="${autocomplete}"` : ''} ${ui.busy ? 'disabled' : ''}>
  </div>`;

const feedback = () => `
  ${ui.error ? `<p class="acct-error">${escapeHtml(ui.error)}</p>` : ''}
  ${ui.sent ? `<p class="acct-sent">${ui.sent}</p>` : ''}`;

const head = () => `
  <div class="acct-head">
    <h2>${t('acct.title')}</h2>
    <button class="icon-btn" data-close aria-label="✕">✕</button>
  </div>`;

// Test hook: lets harnesses render panelHtml under any transient ui state.
export function __setUiForQa(next) { ui = next; }

// Pure renderer — also used by QA harnesses to preview every state.
export function panelHtml(state) {
  // Password recovery takes over regardless of account state.
  if (ui.mode === 'newpass') {
    return `${head()}
      <div class="acct-status on"><span class="acct-status-ico">${ICO.lock}</span>${t('acct.newPassTitle')}</div>
      <form class="acct-form" data-action="newpass">
        ${input('acct-pw1', 'password', t('acct.newPassPlaceholder'), ICO.lock, 'new-password')}
        ${input('acct-pw2', 'password', t('acct.newPassRepeat'), ICO.lock, 'new-password')}
        <button class="btn btn-block" type="submit" ${ui.busy ? 'disabled' : ''}>${ui.busy ? t('acct.working') : t('acct.newPassBtn')}</button>
      </form>
      ${feedback()}`;
  }

  if (state.kind === 'pending') {
    return `${head()}
      <div class="acct-status on"><span class="acct-status-ico">${ICO.mail}</span>${t('acct.confirmTitle')}</div>
      <p class="acct-sent">${t('acct.confirmSent', { email: escapeHtml(state.email) })}</p>
      ${feedback()}
      <div class="acct-actions">
        <button class="btn-ghost" data-action="resend" ${ui.busy ? 'disabled' : ''}>${t('acct.resend')}</button>
        <button class="btn-ghost" data-action="other-email">${t('acct.otherEmail')}</button>
        <button class="btn-ghost" data-action="goto-signin">${t('acct.tabSignin')}</button>
      </div>`;
  }

  if (state.kind === 'secured') {
    const display = state.name || state.email || '?';
    return `${head()}
      <div class="acct-id">
        <span class="acct-avatar">${escapeHtml(display[0].toUpperCase())}</span>
        <div class="acct-id-text">
          ${state.name ? `<span class="acct-name">${escapeHtml(state.name)}</span>` : ''}
          <span class="acct-email">${escapeHtml(state.email)}</span>
          <span class="acct-badge-line">${ICO.shield} ${t('acct.signedInAs')}</span>
        </div>
      </div>
      <p class="hint">${t('acct.stayNote')}</p>
      ${feedback()}
      <div class="acct-foot">
        <span></span>
        ${ui.mode === 'confirm-signout'
          ? `<button class="btn-ghost danger" data-action="signout" ${ui.busy ? 'disabled' : ''}>${t('acct.signOutConfirm')}</button>`
          : `<button class="btn-ghost danger" data-action="ask-signout">${ICO.logout}<span>${t('acct.signOut')}</span></button>`}
      </div>
      ${ui.mode === 'confirm-signout' ? `<p class="hint small">${t('acct.signOutNote')}</p>` : ''}`;
  }

  // LOCAL — signup / signin / forgot
  const seg = `
    <div class="seg acct-seg">
      <button type="button" class="seg-btn ${ui.mode === 'signup' ? 'active' : ''}" data-action="tab-signup">${t('acct.tabSignup')}</button>
      <button type="button" class="seg-btn ${ui.mode === 'signin' || ui.mode === 'forgot' ? 'active' : ''}" data-action="tab-signin">${t('acct.tabSignin')}</button>
    </div>`;

  let form;
  if (ui.mode === 'forgot') {
    form = `
      <form class="acct-form" data-action="forgot">
        ${input('acct-email', 'email', t('acct.emailPlaceholder'), ICO.mail, 'email')}
        <button class="btn btn-block" type="submit" ${ui.busy ? 'disabled' : ''}>${ui.busy ? t('acct.sending') : t('acct.resetBtn')}</button>
      </form>
      <button class="btn-ghost btn-block acct-linkish" data-action="tab-signin">${t('acct.backToLogin')}</button>`;
  } else if (ui.mode === 'signin') {
    form = `
      <form class="acct-form" data-action="signin">
        ${input('acct-email', 'email', t('acct.emailPlaceholder'), ICO.mail, 'email')}
        ${input('acct-pw', 'password', t('acct.pwPlaceholderLogin'), ICO.lock, 'current-password')}
        <button class="btn btn-block" type="submit" ${ui.busy ? 'disabled' : ''}>${ui.busy ? t('acct.working') : t('acct.signinBtn')}</button>
      </form>
      <button class="btn-ghost btn-block acct-linkish" data-action="show-forgot">${t('acct.forgot')}</button>
      <p class="hint small">${t('acct.stayNote')}</p>`;
  } else {
    form = `
      <form class="acct-form" data-action="signup">
        ${input('acct-name', 'text', t('acct.namePlaceholder'), ICO.person, 'name')}
        ${input('acct-email', 'email', t('acct.emailPlaceholder'), ICO.mail, 'email')}
        ${input('acct-pw', 'password', t('acct.pwPlaceholder'), ICO.lock, 'new-password')}
        <button class="btn btn-block" type="submit" ${ui.busy ? 'disabled' : ''}>${ui.busy ? t('acct.working') : t('acct.signupBtn')}</button>
      </form>
      <p class="hint small">${t('acct.syncNote')} ${t('acct.stayNote')}</p>`;
  }

  return `${head()}
    <div class="acct-status"><span class="acct-status-ico muted-ico">${ICO.person}</span>
      <span>${t('acct.localBody')} <span class="acct-privacy">${t('acct.privacyNote')}</span></span>
    </div>
    ${seg}
    ${form}
    ${feedback()}`;
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
  btn.classList.toggle('acct-on', state.kind === 'secured');
  if (state.kind === 'secured') {
    ico.classList.add('hidden');
    avatar.classList.remove('hidden');
    avatar.textContent = ((state.name || state.email || '?')[0]).toUpperCase();
  } else if (state.kind === 'pending') {
    ico.innerHTML = ICO.mail;
    badge.classList.remove('hidden');
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
  else el.textContent = t('footer.local');
}

export async function refresh() {
  const state = await sync.accountState();
  if (state.kind !== lastKind) {
    const keepMode = ui.mode === 'newpass' ? 'newpass' : (state.kind === 'local' ? 'signup' : null);
    ui = { mode: keepMode, busy: false, error: '', sent: '' };
    lastKind = state.kind;
  }
  renderButton(state);
  renderFooter(state);
  if (opened) modal.querySelector('#account-body').innerHTML = panelHtml(state);
  return state;
}

function refreshViews() { window.dispatchEvent(new CustomEvent('rehato:refresh-view')); }

function mapAuthError(e) {
  const msg = e?.message || String(e);
  if (e?.code === 'user_exists' || /already registered/i.test(msg)) return t('acct.errExists');
  if (/invalid login credentials/i.test(msg)) return t('acct.errBadLogin');
  if (/email not confirmed/i.test(msg)) return t('acct.errUnconfirmed');
  if (/password should be/i.test(msg)) return t('acct.pwShort');
  return msg;
}

async function handleAction(action) {
  const val = id => modal.querySelector(`#${id}`)?.value?.trim() || '';
  const validEmail = () => {
    const email = val('acct-email');
    if (!email || !email.includes('@') || !modal.querySelector('#acct-email').checkValidity()) {
      ui.error = t('acct.emailInvalid');
      return null;
    }
    return email;
  };

  ui.error = ''; ui.sent = '';
  try {
    switch (action) {
      case 'tab-signup': ui.mode = 'signup'; break;
      case 'tab-signin': case 'goto-signin': ui.mode = 'signin'; break;
      case 'show-forgot': ui.mode = 'forgot'; break;

      case 'signup': {
        const name = val('acct-name');
        if (!name) { ui.error = t('acct.nameMissing'); break; }
        const email = validEmail(); if (!email) break;
        const password = val('acct-pw');
        if (password.length < 8) { ui.error = t('acct.pwShort'); break; }
        ui.busy = true; await refresh();
        const result = await sync.signUp({ name, email, password });
        ui.busy = false;
        if (result === 'signed-in') { showToast(t('acct.signedIn')); close(); refreshViews(); }
        break;
      }
      case 'signin': {
        const email = validEmail(); if (!email) break;
        const password = val('acct-pw');
        if (!password) { ui.error = t('acct.errBadLogin'); break; }
        ui.busy = true; await refresh();
        await sync.signInPassword(email, password);
        ui.busy = false;
        showToast(t('acct.signedIn'));
        close();
        refreshViews();
        break;
      }
      case 'forgot': {
        const email = validEmail(); if (!email) break;
        ui.busy = true; await refresh();
        await sync.resetPassword(email);
        ui.busy = false;
        ui.sent = t('acct.resetSent', { email: escapeHtml(email) });
        break;
      }
      case 'newpass': {
        const p1 = val('acct-pw1'), p2 = val('acct-pw2');
        if (p1.length < 8) { ui.error = t('acct.pwShort'); break; }
        if (p1 !== p2) { ui.error = t('acct.newPassMismatch'); break; }
        ui.busy = true; await refresh();
        await sync.setNewPassword(p1);
        ui.busy = false; ui.mode = null;
        showToast(t('acct.newPassDone'));
        close();
        refreshViews();
        break;
      }
      case 'resend': {
        const state = await sync.accountState();
        if (state.email) {
          ui.busy = true; await refresh();
          await sync.resendConfirm(state.email);
          ui.busy = false;
          ui.sent = t('acct.confirmSent', { email: escapeHtml(state.email) });
        }
        break;
      }
      case 'other-email': {
        await sync.clearPendingEmail();
        ui.mode = 'signup';
        break;
      }
      case 'ask-signout': ui.mode = 'confirm-signout'; break;
      case 'signout': {
        ui.busy = true; await refresh();
        await sync.signOut();
        ui.busy = false; ui.mode = null;
        showToast(t('acct.signedOut'));
        close();
        refreshViews();
        break;
      }
    }
  } catch (e) {
    ui.busy = false;
    ui.error = mapAuthError(e);
    console.error('[ReHaTo] account action failed', action, e);
  }
  await refresh();
}

export function open(mode) {
  opened = true;
  ui = { mode: mode || (lastKind === 'local' || lastKind === null ? 'signup' : null), busy: false, error: '', sent: '' };
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

  btn.addEventListener('click', () => open());

  modal.addEventListener('click', e => {
    if (e.target === modal || e.target.closest('[data-close]')) { close(); return; }
    const el = e.target.closest('[data-action]');
    if (el && el.tagName !== 'FORM') {
      e.preventDefault();
      handleAction(el.dataset.action);
    }
  });
  modal.addEventListener('submit', e => {
    e.preventDefault();
    const form = e.target.closest('[data-action]');
    if (form) handleAction(form.dataset.action);
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && opened) close();
  });

  sync.onChange(() => refresh());

  if (sync.linkErrored) {
    showToast(t('acct.linkError'));
    history.replaceState(null, '', location.pathname + location.search);
  }
  if (sync.sessionLost) showToast(t('acct.sessionLost'));

  refresh().then(() => {
    // Arrived via a password-reset link: open the panel in new-password mode.
    if (sync.recoveryPending) open('newpass');
  });
}
