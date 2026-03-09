import { fetchLeaderboard, getPlayerName } from './leaderboard.js';
import { gameState } from './gameState.js';

(function () {
  let modal = null;
  let lastFocused = null;
  let focusHandler = null;

  const cache = {}; // { daily: { data, timestamp }, unlimited: { data, timestamp } }
  const CACHE_TTL = 60_000; // 60 seconds

  /* ── Build & inject modal on first open ──────────────────── */
  function buildModal() {
    if (document.getElementById('lb-scores-modal')) {
      modal = document.getElementById('lb-scores-modal');
      return;
    }

    const el = document.createElement('div');
    el.id = 'lb-scores-modal';
    el.className = 'rom rom--hidden';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-labelledby', 'lb-scores-title');
    el.innerHTML = `
      <div class="rom__backdrop"></div>
      <div class="rom__dialog" tabindex="-1">
        <div class="lb-modal__header">
          <h2 id="lb-scores-title" class="lb-modal__title">🏆 LEADERBOARD</h2>
          <div class="rom__tablist" role="tablist" aria-label="Leaderboard tabs">
            <button type="button" class="rom__tab rom__tab--active" data-tab="daily"
              role="tab" aria-selected="true" aria-controls="lb-panel-daily">TODAY</button>
            <button type="button" class="rom__tab" data-tab="unlimited"
              role="tab" aria-selected="false" aria-controls="lb-panel-unlimited">ALL TIME</button>
          </div>
        </div>
        <div class="lb-modal__panels">
          <div id="lb-panel-daily"     class="rom__panel rom__panel--active" data-tabpanel="daily"     role="tabpanel"></div>
          <div id="lb-panel-unlimited" class="rom__panel"                    data-tabpanel="unlimited" role="tabpanel"></div>
        </div>
        <p class="rom__dismiss-hint">CLICK OUTSIDE TO CLOSE</p>
      </div>
    `;
    document.body.appendChild(el);
    modal = el;

    /* Tab switching */
    modal.querySelector('.rom__tablist').addEventListener('click', (e) => {
      const btn = e.target.closest('.rom__tab');
      if (!btn) return;
      switchTab(btn.dataset.tab);
    });

    /* Backdrop click */
    modal.querySelector('.rom__backdrop').addEventListener('click', close);
  }

  /* ── Tab switching ───────────────────────────────────────── */
  function switchTab(tabName) {
    modal.querySelectorAll('.rom__tab').forEach(t => {
      const active = t.dataset.tab === tabName;
      t.classList.toggle('rom__tab--active', active);
      t.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    modal.querySelectorAll('.rom__panel').forEach(p => {
      p.classList.toggle('rom__panel--active', p.dataset.tabpanel === tabName);
    });
    loadTab(tabName);
  }

  /* ── Data loading with 60s cache ────────────────────────── */
  async function loadTab(tabName) {
    const panel = document.getElementById(`lb-panel-${tabName}`);
    if (!panel) return;

    /* Daily tab: hide with a message when not in daily mode */
    if (tabName === 'daily' && (gameState.mode !== 'daily' || !gameState.dailyId)) {
      panel.innerHTML = '<p class="lb-modal__note">Play daily mode to see today\'s board.</p>';
      return;
    }

    /* Serve from cache if fresh */
    const cached = cache[tabName];
    if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
      renderPanel(panel, cached.data, tabName);
      return;
    }

    panel.innerHTML = '<p class="lb-modal__note">Loading…</p>';

    let result;
    if (tabName === 'daily') {
      result = await fetchLeaderboard(gameState.dailyId, 'daily');
    } else {
      result = await fetchLeaderboard(null, 'unlimited');
    }

    cache[tabName] = { data: result, timestamp: Date.now() };
    renderPanel(panel, result, tabName);
  }

  /* ── Render a leaderboard panel ─────────────────────────── */
  function renderPanel(panel, { configured, entries }, tabName) {
    if (!configured) {
      panel.innerHTML = `
        <p style="color:var(--rom-muted)">🔧 <strong>Leaderboard not connected yet.</strong></p>
        <p style="font-size:0.85em;color:var(--rom-muted)">
          To enable global scores, add these environment variables in your
          <a href="https://vercel.com/docs/environment-variables" target="_blank"
             rel="noopener noreferrer" style="color:inherit;text-decoration:underline">Vercel project settings</a>:
        </p>
        <ul style="font-size:0.82em;color:var(--rom-muted);padding-left:1.2em;line-height:1.8">
          <li><code>SUPABASE_URL</code></li>
          <li><code>SUPABASE_ANON_KEY</code></li>
          <li><code>SUPABASE_SERVICE_KEY</code></li>
        </ul>
        <p style="font-size:0.8em;color:var(--rom-muted)">See the <strong>README</strong> for full setup instructions.</p>
      `;
      return;
    }
    if (!entries || entries.length === 0) {
      const msg = tabName === 'daily'
        ? 'No scores yet for today. Be the first! 🏆'
        : 'No scores yet. Be the first on the all-time board! 🏆';
      panel.innerHTML = `<p class="lb-modal__note">${msg}</p>`;
      return;
    }
    const playerName = getPlayerName();
    panel.innerHTML = entries.map((entry, idx) => {
      const isYou = playerName && entry.player_name === playerName;
      return `
        <div class="rom__row${isYou ? ' rom__row--you' : ''}">
          <span class="rom__word">${idx + 1}. ${String(entry.player_name || 'Anonymous')}</span>
          <span class="rom__score-chip">${Number(entry.score) || 0}</span>
        </div>`;
    }).join('');
  }

  /* ── Focus trap ─────────────────────────────────────────── */
  function trapFocus(enable) {
    const dialog = modal?.querySelector('.rom__dialog');
    if (enable && !focusHandler) {
      focusHandler = () => {
        if (dialog && !dialog.contains(document.activeElement)) dialog.focus();
      };
      document.addEventListener('focusin', focusHandler);
    } else if (!enable && focusHandler) {
      document.removeEventListener('focusin', focusHandler);
      focusHandler = null;
    }
  }

  /* ── Open ───────────────────────────────────────────────── */
  function open() {
    buildModal();
    lastFocused = document.activeElement;
    modal.classList.remove('rom--hidden');
    document.body.classList.add('lb-modal-open');

    /* Start on daily tab when in daily mode, otherwise all-time */
    const initialTab = (gameState.mode === 'daily' && gameState.dailyId) ? 'daily' : 'unlimited';
    switchTab(initialTab);

    const dialog = modal.querySelector('.rom__dialog');
    dialog.scrollTop = 0;
    dialog.focus();
    trapFocus(true);
  }

  /* ── Close ──────────────────────────────────────────────── */
  function close() {
    if (!modal) return;
    modal.classList.add('rom--hidden');
    document.body.classList.remove('lb-modal-open');
    trapFocus(false);
    if (lastFocused && typeof lastFocused.focus === 'function') lastFocused.focus();
  }

  /* ── Keyboard: Escape to close ──────────────────────────── */
  document.addEventListener('keydown', (e) => {
    if (modal && !modal.classList.contains('rom--hidden') && e.key === 'Escape') {
      close();
    }
  });

  /* ── Public API ─────────────────────────────────────────── */
  window.lbModal = { open, close };
})();
