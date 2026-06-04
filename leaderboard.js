// leaderboard.js — frontend module for score submission and leaderboard display

import {
  getPlayerProfile,
  setPlayerScreenName,
  signOut,
  submitScore as sbSubmitScore,
  fetchLeaderboard as sbFetchLeaderboard,
} from './supabase.js';

/* ── Random name generator ─────────────────────────────────── */

const ADJECTIVES = ['SWIFT','BOLD','LUNAR','COSMIC','NEON','SONIC','JADE','IRON','STORM','BLAZE','PIXEL','TURBO','HYPER','ULTRA','OMEGA'];
const NOUNS      = ['FOX','WOLF','HAWK','LYNX','BEAR','ROOK','SAGE','VOLT','WREN','APEX','ECHO','FLUX','GLYPH','NODE','ZEAL'];

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
    '#lb-name-input {',
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
    '#lb-name-input:focus {',
    '  border-color: var(--rom-you, #f59e0b);',
    '}',
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
    '  <p id="lb-name-title">👤 SET GAMER TAG</p>',
    '  <p style="font-size:0.8rem;opacity:0.7;margin-bottom:0.75rem;">Choose a unique name (5–15 characters) or tap PICK FOR ME!</p>',
    '  <input id="lb-name-input" type="text" maxlength="15" placeholder="Your gamer tag (5-15 chars)…" autocomplete="off" />',
    '  <p id="lb-name-error"></p>',
    '  <div class="lb-name-btns">',
    '    <button type="button" id="lb-name-cancel">PICK FOR ME</button>',
    '    <button type="button" id="lb-name-ok">CONTINUE</button>',
    '  </div>',
    '</div>',
  ].join('\n');
  document.body.appendChild(modal);
  return modal;
}

export function promptPlayerName() {
  return new Promise((resolve) => {
    const modal   = ensureNameModal();
    const input   = document.getElementById('lb-name-input');
    const okBtn   = document.getElementById('lb-name-ok');
    const cancelBtn = document.getElementById('lb-name-cancel');
    const errorEl = document.getElementById('lb-name-error');

    input.value = '';
    errorEl.textContent = '';
    modal.classList.remove('lb-hidden');
    setTimeout(() => input.focus(), 50);

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

    async function handleOk() {
      const raw = input.value.trim();
      if (raw.length < 5) {
        setError('Name must be at least 5 characters.');
        return;
      }
      if (raw.length > 15) {
        setError('Name must be 15 characters or fewer.');
        return;
      }
      setError('');
      okBtn.disabled = true;
      cancelBtn.disabled = true;
      okBtn.textContent = 'SAVING…';

      const result = await setPlayerName(raw);
      okBtn.disabled = false;
      cancelBtn.disabled = false;
      okBtn.textContent = 'CONTINUE';

      if (result === 'DUPLICATE') {
        setError('That name is taken. Try another!');
        input.focus();
        return;
      }
      if (!result) {
        setError('Could not save name. Try again.');
        input.focus();
        return;
      }
      finish(result);
    }

    async function handlePickForMe() {
      let name = null;
      cancelBtn.disabled = true;
      okBtn.disabled = true;
      cancelBtn.textContent = 'PICKING…';

      // Try up to 5 random names until one is unique
      for (let attempt = 0; attempt < 5; attempt++) {
        const candidate = generateRandomName();
        const result = await setPlayerName(candidate);
        if (result && result !== 'DUPLICATE') {
          name = result;
          break;
        }
      }

      cancelBtn.disabled = false;
      okBtn.disabled = false;
      cancelBtn.textContent = 'PICK FOR ME';

      if (!name) {
        setError('Could not pick a name. Please type one.');
        input.focus();
        return;
      }
      finish(name);
    }

    okBtn.addEventListener('click', handleOk, { signal });
    cancelBtn.addEventListener('click', handlePickForMe, { signal });
    input.addEventListener('keydown', (e) => {
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
