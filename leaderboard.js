// leaderboard.js — frontend module for score submission and leaderboard display

import {
  getPlayerProfile,
  setPlayerScreenName,
  signUpWithEmailPassword,
  signInWithEmailPassword,
  signOut,
  submitScore as sbSubmitScore,
  fetchLeaderboard as sbFetchLeaderboard,
} from './supabase.js';

/* ── Random name generator ─────────────────────────────────── */

const ADJECTIVES = ['SWIFT','BOLD','LUNAR','COSMIC','NEON','SONIC','JADE','IRON','STORM','BLAZE','PIXEL','TURBO','HYPER','ULTRA','OMEGA'];
const NOUNS      = ['FOX','WOLF','HAWK','LYNX','BEAR','ROOK','SAGE','VOLT','WREN','APEX','ECHO','FLUX','GLYPH','NODE','ZEAL'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LAST_EMAIL_KEY = 'anagramaton_last_auth_email';

function generateRandomName() {
  const adj  = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const num  = Math.floor(Math.random() * 900) + 100; // 100–999
  return adj + noun + num;
}

/* ── Player Name helpers (now async via Supabase) ───────────────── */

export async function getPlayerName() {
  return await getPlayerProfile();
}

export async function setPlayerName(name) {
  if (typeof name !== 'string') return null;
  const trimmed = name.trim();
  if (trimmed.length < 5 || trimmed.length > 15) return null;
  try {
    return await setPlayerScreenName(trimmed);
  } catch (err) {
    // Duplicate name error from Supabase (unique constraint)
    if (err?.code === '23505' || (err?.message && err.message.includes('unique'))) {
      return 'DUPLICATE';
    }
    console.warn('[leaderboard] setPlayerName failed:', err);
    return null;
  }
}

export async function clearPlayerName() {
  await signOut();
}

/* ── Name prompt modal ───────────────────────────────────────── */

function injectModalStyles() {
  if (document.getElementById('lb-modal-styles')) return;
  const style = document.createElement('style');
  style.id = 'lb-modal-styles';
  style.textContent = [
    '#lb-name-modal {',
    '  position: fixed;',
    '  inset: 0;',
    '  z-index: 99999;',
    '  display: flex;',
    '  align-items: center;',
    '  justify-content: center;',
    '  background: rgba(0, 0, 0, 0.7);',
    '}',
    '#lb-name-modal.lb-hidden { display: none; }',
    '#lb-name-box {',
    '  position: relative;',
    '  min-width: 280px;',
    '  max-width: 360px;',
    '  width: 90%;',
    '  padding: 2rem 1.75rem 1.5rem;',
    '  border-radius: 12px;',
    '  background: linear-gradient(135deg, var(--alert-box-grad-1, rgba(20,20,35,0.96)), var(--alert-box-grad-2, rgba(35,10,45,0.96)));',
    '  border: 2px solid var(--alert-box-border, rgba(76,201,240,0.7));',
    '  box-shadow:',
    '    0 0 0 1px var(--alert-box-shadow-1, rgba(255,255,255,0.06)),',
    '    0 12px 30px var(--alert-box-shadow-2, rgba(0,0,0,0.7)),',
    '    0 0 25px var(--alert-box-shadow-3, rgba(76,201,240,0.55));',
    '  color: var(--rom-ink, #f1f5f9);',
    "  font-family: 'Turret Road', 'Orbitron', monospace;",
    '  text-align: center;',
    '}',
    '#lb-name-box p {',
    '  margin: 0 0 1rem;',
    '  font-size: 0.95rem;',
    '  letter-spacing: 0.05em;',
    '}',
    '.lb-auth-input {',
    '  width: 100%;',
    '  box-sizing: border-box;',
    '  padding: 0.5rem 0.75rem;',
    '  border-radius: 6px;',
    '  border: 1px solid var(--alert-box-border, rgba(76,201,240,0.7));',
    '  background: rgba(255,255,255,0.07);',
    '  color: var(--rom-ink, #f1f5f9);',
    '  font-family: inherit;',
    '  font-size: 1rem;',
    '  text-align: center;',
    '  margin-bottom: 0.5rem;',
    '  outline: none;',
    '}',
    '.lb-auth-input:focus {',
    '  border-color: var(--rom-you, #f59e0b);',
    '}',
    '#lb-name-subtitle {',
    '  font-size: 0.8rem;',
    '  opacity: 0.7;',
    '  margin-bottom: 0.75rem;',
    '}',
    '.lb-hidden-field { display: none; }',
    '#lb-name-error {',
    '  min-height: 1.2em;',
    '  font-size: 0.8rem;',
    '  color: #ef4444;',
    '  margin-bottom: 0.75rem;',
    '  letter-spacing: 0.03em;',
    '}',
    '.lb-name-btns {',
    '  display: flex;',
    '  gap: 0.75rem;',
    '  justify-content: center;',
    '}',
    '.lb-name-btns button {',
    '  padding: 0.45rem 1.2rem;',
    '  border-radius: 6px;',
    '  border: 1px solid var(--alert-box-border, rgba(76,201,240,0.7));',
    '  background: rgba(76,201,240,0.1);',
    '  color: var(--rom-ink, #f1f5f9);',
    '  font-family: inherit;',
    '  font-size: 0.85rem;',
    '  letter-spacing: 0.06em;',
    '  cursor: pointer;',
    '  transition: background 0.15s;',
    '}',
    '.lb-name-btns button:hover {',
    '  background: rgba(76,201,240,0.25);',
    '}',
    '.lb-name-btns button#lb-name-ok {',
    '  border-color: var(--rom-you, #f59e0b);',
    '  background: rgba(245,158,11,0.15);',
    '  color: var(--rom-you, #f59e0b);',
    '}',
    '.lb-name-btns button#lb-name-ok:hover {',
    '  background: rgba(245,158,11,0.3);',
    '}',
    '.lb-name-btns button:disabled {',
    '  opacity: 0.5;',
    '  cursor: not-allowed;',
    '}',
    '#lb-auth-toggle {',
    '  margin-top: 0.8rem;',
    '  border: 0;',
    '  background: transparent;',
    '  color: var(--alert-box-border, rgba(76,201,240,0.9));',
    '  text-decoration: underline;',
    '  font: inherit;',
    '  font-size: 0.8rem;',
    '  cursor: pointer;',
    '}',
    '#lb-auth-toggle:hover {',
    '  color: var(--rom-you, #f59e0b);',
    '}',
  ].join('\n');
  document.head.appendChild(style);
}

function ensureNameModal() {
  let modal = document.getElementById('lb-name-modal');
  if (modal) return modal;

  injectModalStyles();

  modal = document.createElement('div');
  modal.id = 'lb-name-modal';
  modal.className = 'lb-hidden';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-labelledby', 'lb-name-title');
  modal.innerHTML = [
    '<div id="lb-name-box">',
    '  <p id="lb-name-title">👤 CREATE ACCOUNT</p>',
    '  <p id="lb-name-subtitle">Use email + password, then choose a gamer tag.</p>',
    '  <input id="lb-email-input" class="lb-auth-input" type="email" placeholder="Email" autocomplete="email" />',
    '  <input id="lb-password-input" class="lb-auth-input" type="password" minlength="6" placeholder="Password (min 6 chars)" autocomplete="current-password" />',
    '  <input id="lb-name-input" class="lb-auth-input" type="text" maxlength="15" placeholder="Your gamer tag (5-15 chars)…" autocomplete="off" />',
    '  <p id="lb-name-error"></p>',
    '  <div class="lb-name-btns">',
    '    <button type="button" id="lb-name-cancel">PICK FOR ME</button>',
    '    <button type="button" id="lb-name-ok">SIGN UP</button>',
    '  </div>',
    '  <button type="button" id="lb-auth-toggle">Already have an account? SIGN IN</button>',
    '</div>',
  ].join('\n');
  document.body.appendChild(modal);
  return modal;
}

export function promptPlayerName() {
  return new Promise((resolve) => {
    const modal = ensureNameModal();
    const emailInput = document.getElementById('lb-email-input');
    const passwordInput = document.getElementById('lb-password-input');
    const nameInput = document.getElementById('lb-name-input');
    const titleEl = document.getElementById('lb-name-title');
    const subtitleEl = document.getElementById('lb-name-subtitle');
    const okBtn = document.getElementById('lb-name-ok');
    const cancelBtn = document.getElementById('lb-name-cancel');
    const errorEl = document.getElementById('lb-name-error');
    const toggleBtn = document.getElementById('lb-auth-toggle');

    let mode = 'signup'; // signup | signin | profile

    emailInput.value = localStorage.getItem(LAST_EMAIL_KEY) || '';
    passwordInput.value = '';
    nameInput.value = '';
    errorEl.textContent = '';
    modal.classList.remove('lb-hidden');
    setTimeout(() => (emailInput.value ? passwordInput : emailInput).focus(), 50);

    const ac = new AbortController();
    const { signal } = ac;

    function setError(msg) {
      errorEl.textContent = msg || '';
    }

    function finish(value) {
      modal.classList.add('lb-hidden');
      ac.abort();
      resolve(value);
    }

    function validateName(raw) {
      if (raw.length < 5) {
        setError('Name must be at least 5 characters.');
        return false;
      }
      if (raw.length > 15) {
        setError('Name must be 15 characters or fewer.');
        return false;
      }
      return true;
    }

    function validateEmail(raw) {
      if (!raw) {
        setError('Email is required.');
        return false;
      }
      if (!EMAIL_RE.test(raw)) {
        setError('Enter a valid email address.');
        return false;
      }
      return true;
    }

    function validatePassword(raw) {
      if (!raw) {
        setError('Password is required.');
        return false;
      }
      if (raw.length < 6) {
        setError('Password must be at least 6 characters.');
        return false;
      }
      return true;
    }

    function setMode(nextMode) {
      mode = nextMode;
      const inSignIn = mode === 'signin';
      const inProfile = mode === 'profile';

      titleEl.textContent = inSignIn ? '👤 SIGN IN' : (inProfile ? '👤 CHOOSE GAMER TAG' : '👤 CREATE ACCOUNT');
      subtitleEl.textContent = inSignIn
        ? 'Sign in with your existing email account.'
        : (inProfile
          ? 'Signed in! Choose your gamer tag to finish setup.'
          : 'Use email + password, then choose a gamer tag.');

      nameInput.classList.toggle('lb-hidden-field', inSignIn);
      cancelBtn.classList.toggle('lb-hidden-field', inSignIn);
      toggleBtn.classList.toggle('lb-hidden-field', inProfile);

      okBtn.textContent = inSignIn ? 'SIGN IN' : (inProfile ? 'SAVE TAG' : 'SIGN UP');
      toggleBtn.textContent = inSignIn
        ? "Don't have an account? SIGN UP"
        : 'Already have an account? SIGN IN';

      passwordInput.autocomplete = inSignIn ? 'current-password' : 'new-password';
      setError('');
    }

    function mapAuthError(err, currentMode) {
      const message = String(err?.message || '').toLowerCase();
      if (currentMode === 'signup' && (message.includes('already registered') || message.includes('already exists'))) {
        return 'Email already exists. Try SIGN IN instead.';
      }
      if (currentMode === 'signin' && (message.includes('invalid login credentials') || message.includes('invalid credentials'))) {
        return 'Invalid email or password.';
      }
      if (message.includes('failed to fetch') || message.includes('network')) {
        return 'Network error. Please check your connection and try again.';
      }
      return err?.message || 'Authentication failed. Please try again.';
    }

    async function saveGamerTag(rawName) {
      const result = await setPlayerName(rawName);
      if (result === 'DUPLICATE') {
        setError('That name is taken. Try another!');
        nameInput.focus();
        return null;
      }
      if (!result) {
        setError('Could not save name. Try again.');
        nameInput.focus();
        return null;
      }
      return result;
    }

    async function handleSignUp() {
      const email = emailInput.value.trim().toLowerCase();
      const password = passwordInput.value;
      const rawName = nameInput.value.trim();
      if (!validateEmail(email) || !validatePassword(password) || !validateName(rawName)) return;

      localStorage.setItem(LAST_EMAIL_KEY, email);
      try {
        const data = await signUpWithEmailPassword(email, password);
        if (!data?.session) {
          await signInWithEmailPassword(email, password);
        }
      } catch (err) {
        setError(mapAuthError(err, 'signup'));
        return;
      }
      const savedName = await saveGamerTag(rawName);
      if (savedName) finish(savedName);
    }

    async function handleSignIn() {
      const email = emailInput.value.trim().toLowerCase();
      const password = passwordInput.value;
      if (!validateEmail(email) || !validatePassword(password)) return;

      localStorage.setItem(LAST_EMAIL_KEY, email);
      try {
        await signInWithEmailPassword(email, password);
      } catch (err) {
        setError(mapAuthError(err, 'signin'));
        return;
      }

      const existingName = await getPlayerName();
      if (existingName) {
        finish(existingName);
        return;
      }
      setMode('profile');
      nameInput.focus();
    }

    async function handleProfile() {
      const rawName = nameInput.value.trim();
      if (!validateName(rawName)) return;
      const savedName = await saveGamerTag(rawName);
      if (savedName) finish(savedName);
    }

    async function handleOk() {
      setError('');
      okBtn.disabled = true;
      cancelBtn.disabled = true;
      toggleBtn.disabled = true;
      okBtn.textContent = mode === 'signin' ? 'SIGNING IN…' : (mode === 'profile' ? 'SAVING…' : 'SIGNING UP…');

      if (mode === 'signin') await handleSignIn();
      else if (mode === 'profile') await handleProfile();
      else await handleSignUp();

      okBtn.disabled = false;
      cancelBtn.disabled = false;
      toggleBtn.disabled = false;
      okBtn.textContent = mode === 'signin' ? 'SIGN IN' : (mode === 'profile' ? 'SAVE TAG' : 'SIGN UP');
    }

    function handlePickForMe() {
      nameInput.value = generateRandomName().slice(0, 15);
      setError('');
      nameInput.focus();
    }

    function handleToggleMode() {
      setMode(mode === 'signin' ? 'signup' : 'signin');
      if (mode === 'signin') {
        passwordInput.focus();
      } else {
        nameInput.focus();
      }
    }

    setMode('signup');
    okBtn.addEventListener('click', handleOk, { signal });
    cancelBtn.addEventListener('click', handlePickForMe, { signal });
    toggleBtn.addEventListener('click', handleToggleMode, { signal });
    modal.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleOk();
      // No Escape — name is required
    }, { signal });
  });
}

/* ── Sign-out prompt ───────────────────────────────────────────── */

export async function promptSignOut() {
  const currentName = await getPlayerName();
  return new Promise((resolve) => {
    const modal = ensureNameModal();
    const box   = document.getElementById('lb-name-box');
    const savedHTML = box.innerHTML;

    const safeName = String(currentName || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    box.innerHTML = [
      '<p id="lb-name-title">👤 ' + safeName + '</p>',
      '<p style="font-size:0.8rem;opacity:0.7;margin-bottom:1.25rem;">Sign out to remove your name from this device.<br>You will need to create a new gamer tag to play again.</p>',
      '<div class="lb-name-btns">',
      '  <button type="button" id="lb-name-cancel">CANCEL</button>',
      '  <button type="button" id="lb-name-ok" style="border-color:#ef4444;background:rgba(239,68,68,0.15);color:#ef4444;">SIGN OUT</button>',
      '</div>',
    ].join('\n');

    modal.classList.remove('lb-hidden');

    const ac = new AbortController();
    const { signal } = ac;

    function finish(signedOut) {
      modal.classList.add('lb-hidden');
      box.innerHTML = savedHTML;
      ac.abort();
      resolve(signedOut);
    }

    document.getElementById('lb-name-ok').addEventListener('click', async () => {
      await clearPlayerName();
      finish(true);
    }, { signal });
    document.getElementById('lb-name-cancel').addEventListener('click', () => finish(false), { signal });
    modal.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') finish(false);
    }, { signal });
  });
}

/* ── Score submission ─────────────────────────────────────────────── */

export async function submitScore(dailyId, score, words, hintsUsed, mode = 'daily', metadata = null) {
  const playerName = await getPlayerName();
  if (!playerName) return null;
  try {
    return await sbSubmitScore(dailyId, score, words, hintsUsed, mode, metadata);
  } catch (err) {
    console.warn('[leaderboard] submitScore failed:', err);
    return null;
  }
}

/* ── Leaderboard fetch ────────────────────────────────────────────── */

export async function fetchLeaderboard(dailyId, mode = 'daily') {
  return sbFetchLeaderboard(dailyId, mode);
}
