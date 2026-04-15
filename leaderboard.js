// leaderboard.js — frontend module for score submission and leaderboard display

const PLAYER_NAME_KEY = 'anagramaton_player_name';

/* ── Random name generator ─────────────────────────────────────── */

const ADJECTIVES = ['SWIFT','BOLD','LUNAR','COSMIC','NEON','SONIC','JADE','IRON','STORM','BLAZE','PIXEL','TURBO','HYPER','ULTRA','OMEGA'];
const NOUNS      = ['FOX','WOLF','HAWK','LYNX','BEAR','ROOK','SAGE','VOLT','WREN','APEX','ECHO','FLUX','GLYPH','NODE','ZEAL'];

function generateRandomName() {
  const adj  = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const num  = Math.floor(Math.random() * 900) + 100; // 100–999
  return `${adj}${noun}${num}`;
}

/* ── Player Name helpers ───────────────────────────────────────── */

export function getPlayerName() {
  return localStorage.getItem(PLAYER_NAME_KEY) || null;
}

export function setPlayerName(name) {
  if (typeof name !== 'string') return null;
  const trimmed = name.trim();
  if (trimmed.length === 0 || trimmed.length > 30) return null;
  localStorage.setItem(PLAYER_NAME_KEY, trimmed);
  return trimmed;
}

export function clearPlayerName() {
  localStorage.removeItem(PLAYER_NAME_KEY);
}

/* ── Name prompt modal ─────────────────────────────────────────── */

function injectModalStyles() {
  if (document.getElementById('lb-modal-styles')) return;
  const style = document.createElement('style');
  style.id = 'lb-modal-styles';
  style.textContent = `
    #lb-name-modal {
      position: fixed;
      inset: 0;
      z-index: 99999;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(0, 0, 0, 0.7);
    }
    #lb-name-modal.lb-hidden { display: none; }
    #lb-name-box {
      position: relative;
      min-width: 280px;
      max-width: 360px;
      width: 90%;
      padding: 2rem 1.75rem 1.5rem;
      border-radius: 12px;
      background: linear-gradient(135deg, var(--alert-box-grad-1, rgba(20,20,35,0.96)), var(--alert-box-grad-2, rgba(35,10,45,0.96)));
      border: 2px solid var(--alert-box-border, rgba(76,201,240,0.7));
      box-shadow:
        0 0 0 1px var(--alert-box-shadow-1, rgba(255,255,255,0.06)),
        0 12px 30px var(--alert-box-shadow-2, rgba(0,0,0,0.7)),
        0 0 25px var(--alert-box-shadow-3, rgba(76,201,240,0.55));
      color: var(--rom-ink, #f1f5f9);
      font-family: 'Turret Road', 'Orbitron', monospace;
      text-align: center;
    }
    #lb-name-box p {
      margin: 0 0 1rem;
      font-size: 0.95rem;
      letter-spacing: 0.05em;
    }
    #lb-name-input {
      width: 100%;
      box-sizing: border-box;
      padding: 0.5rem 0.75rem;
      border-radius: 6px;
      border: 1px solid var(--alert-box-border, rgba(76,201,240,0.7));
      background: rgba(255,255,255,0.07);
      color: var(--rom-ink, #f1f5f9);
      font-family: inherit;
      font-size: 1rem;
      text-align: center;
      margin-bottom: 1rem;
      outline: none;
    }
    #lb-name-input:focus {
      border-color: var(--rom-you, #f59e0b);
    }
    .lb-name-btns {
      display: flex;
      gap: 0.75rem;
      justify-content: center;
    }
    .lb-name-btns button {
      padding: 0.45rem 1.2rem;
      border-radius: 6px;
      border: 1px solid var(--alert-box-border, rgba(76,201,240,0.7));
      background: rgba(76,201,240,0.1);
      color: var(--rom-ink, #f1f5f9);
      font-family: inherit;
      font-size: 0.85rem;
      letter-spacing: 0.06em;
      cursor: pointer;
      transition: background 0.15s;
    }
    .lb-name-btns button:hover {
      background: rgba(76,201,240,0.25);
    }
    .lb-name-btns button#lb-name-ok {
      border-color: var(--rom-you, #f59e0b);
      background: rgba(245,158,11,0.15);
      color: var(--rom-you, #f59e0b);
    }
    .lb-name-btns button#lb-name-ok:hover {
      background: rgba(245,158,11,0.3);
    }
  `;
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
  modal.innerHTML = `
    <div id="lb-name-box">
      <p id="lb-name-title">👤 SET DISPLAY NAME</p>
      <p style="font-size:0.8rem;opacity:0.7;margin-bottom:0.75rem;">Enter your name or tap PICK FOR ME — we'll choose one for you!</p>
      <input id="lb-name-input" type="text" maxlength="30" placeholder="Enter your name…" autocomplete="off" />
      <div class="lb-name-btns">
        <button type="button" id="lb-name-cancel">PICK FOR ME</button>
        <button type="button" id="lb-name-ok">SAVE</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  return modal;
}

export function promptPlayerName() {
  return new Promise((resolve) => {
    const modal = ensureNameModal();
    const input = document.getElementById('lb-name-input');
    const okBtn = document.getElementById('lb-name-ok');
    const cancelBtn = document.getElementById('lb-name-cancel');

    // Pre-fill with existing name
    input.value = getPlayerName() || '';
    modal.classList.remove('lb-hidden');
    setTimeout(() => input.focus(), 50);

    const ac = new AbortController();
    const { signal } = ac;

    function finish(value) {
      modal.classList.add('lb-hidden');
      ac.abort();
      resolve(value);
    }

    function handleOk() {
      const raw = input.value.trim();
      const saved = raw.length > 0 ? setPlayerName(raw) : null;
      finish(saved);
    }

    function handleCancel() {
      let name = getPlayerName();
      if (!name) {
        name = generateRandomName();
        setPlayerName(name);
      }
      finish(name);
    }

    okBtn.addEventListener('click', handleOk, { signal });
    cancelBtn.addEventListener('click', handleCancel, { signal });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleOk();
      if (e.key === 'Escape') handleCancel();
    }, { signal });
  });
}

/* ── Sign-out prompt ───────────────────────────────────────────── */

export function promptSignOut() {
  return new Promise((resolve) => {
    const currentName = getPlayerName();
    const modal = ensureNameModal();
    const box = document.getElementById('lb-name-box');
    const savedHTML = box.innerHTML;

    box.innerHTML = `
      <p id="lb-name-title">👤 ${String(currentName || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</p>
      <p style="font-size:0.8rem;opacity:0.7;margin-bottom:1.25rem;">Your name &amp; stats are saved on this device.<br>Sign out to remove your name from this device.</p>
      <div class="lb-name-btns">
        <button type="button" id="lb-name-cancel">CANCEL</button>
        <button type="button" id="lb-name-ok" style="border-color:#ef4444;background:rgba(239,68,68,0.15);color:#ef4444;">SIGN OUT</button>
      </div>
    `;

    modal.classList.remove('lb-hidden');

    const ac = new AbortController();
    const { signal } = ac;

    function finish(signedOut) {
      modal.classList.add('lb-hidden');
      box.innerHTML = savedHTML;
      ac.abort();
      resolve(signedOut);
    }

    document.getElementById('lb-name-ok').addEventListener('click', () => {
      clearPlayerName();
      finish(true);
    }, { signal });
    document.getElementById('lb-name-cancel').addEventListener('click', () => finish(false), { signal });
    modal.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') finish(false);
    }, { signal });
  });
}

/* ── Score submission ──────────────────────────────────────────── */

export async function submitScore(dailyId, score, words, hintsUsed, mode = 'daily') {
  const playerName = getPlayerName();
  if (!playerName) return null;
  try {
    const res = await fetch('/api/scores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dailyId, playerName, score, words, hintsUsed, mode }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    // Silently fail — offline or server error should not affect gameplay
    console.warn('[leaderboard] submitScore failed:', err);
    return null;
  }
}

/* ── Leaderboard fetch ─────────────────────────────────────────── */

export async function fetchLeaderboard(dailyId, mode = 'daily') {
  try {
    const url = dailyId
      ? `/api/leaderboard?dailyId=${encodeURIComponent(dailyId)}&mode=${encodeURIComponent(mode)}`
      : `/api/leaderboard?mode=${encodeURIComponent(mode)}`;
    const res = await fetch(url);
    if (!res.ok) return { configured: true, entries: [] };
    const data = await res.json();
    return {
      configured: data.configured !== false,
      entries: Array.isArray(data.leaderboard) ? data.leaderboard : [],
    };
  } catch (err) {
    console.warn('[leaderboard] fetchLeaderboard failed:', err);
    return { configured: true, entries: [] };
  }
}
