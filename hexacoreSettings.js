// hexacoreSettings.js — Dedicated Hexacore Settings Menu

import { openQuestsModal }       from './hexacoreQuests.js';
import { openLeaderboardsModal } from './hexacoreLeaderboards.js';
import { openProfileModal }      from './hexacoreProfile.js';
import { getPlayerName }         from './leaderboard.js';
import { getXPData }             from './hexacoreXP.js';

/* ──────────────────────────────────────────────────────────────────
   Intercept the Anagramaton settings-btn click when hx-active.
   This listener runs after main.js registers its own listener, so
   we just close the Anagramaton dropdown and open the Hexacore one.
   ────────────────────────────────────────────────────────────────── */
(function () {
  const $ = id => document.getElementById(id);

  function onSettingsBtnClick() {
    if (!document.body.classList.contains('hx-active')) return;

    // Close the Anagramaton dropdown that main.js just opened
    const menu = $('settings-menu');
    const wrap = $('settings-wrap');
    if (menu) menu.hidden = true;
    if (wrap) wrap.classList.remove('menu-open');

    openHexacoreSettingsModal();
  }

  // Register after DOM is ready so #settings-btn exists.
  // Using capture:false → runs in bubble order, after main.js's handler.
  document.addEventListener('DOMContentLoaded', () => {
    const btn = $('settings-btn');
    if (btn) btn.addEventListener('click', onSettingsBtnClick);
  });

  /* ── Daily-completion helpers ─────────────────────────────────── */

  function easternDateStr() {
    try {
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/New_York',
        year: 'numeric', month: '2-digit', day: '2-digit',
      }).formatToParts(new Date());
      const get = type => parts.find(p => p.type === type)?.value ?? '';
      return `${get('year')}-${get('month')}-${get('day')}`;
    } catch (_) {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    }
  }

  function isDailyCompleted() {
    try {
      return localStorage.getItem('hxDailyCompleted') === easternDateStr();
    } catch (_) { return false; }
  }

  /** Milliseconds until midnight America/New_York. */
  function msUntilMidnightEastern() {
    try {
      const nowET = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
      const nextMidnight = new Date(nowET);
      nextMidnight.setHours(24, 0, 0, 0);
      return Math.max(0, nextMidnight - nowET);
    } catch (_) {
      // Fallback: midnight local
      const now = new Date();
      const next = new Date(now); next.setHours(24, 0, 0, 0);
      return Math.max(0, next - now);
    }
  }

  function formatCountdown(ms) {
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return `${h}h ${m}m`;
  }

  /* ── Section renderers ────────────────────────────────────────── */

  function renderModeSection(panel) {
    const completed = isDailyCompleted();
    const countdown = completed ? formatCountdown(msUntilMidnightEastern()) : null;

    // Order: DAILY → DAILY UNLIMITED → ENDLESS → CAMPAIGN → QUESTS
    const MODES = [
      { id: 'hexacoreDaily', icon: '📅', title: 'DAILY',      color: '#4cc9f0',
        desc: 'Fixed daily board with no refills. Submit for the best final score.' },
      { id: 'hexacoreDailyUnlimited', icon: '♾️', title: 'DAILY UNLIMITED', color: '#22c55e',
        desc: 'Play today\'s daily board freely. No submission limit — practice as much as you like.' },
      { id: 'endless',  icon: '🔥', title: 'ENDLESS',         color: '#f97316',
        desc: 'Survive the ember. Score as high as you can with no limits.' },
      { id: 'campaign', icon: '⚔️', title: 'CAMPAIGN',        color: '#a855f7',
        desc: '50 structured levels with unique objectives and star ratings.' },
      { id: 'quests',   icon: '📋', title: 'QUESTS',          color: '#fbbf24',
        desc: 'Complete daily quests and tier challenges to earn XP bonuses.' },
    ];

    panel.innerHTML = '<div class="hx-cfg-mode-grid"></div>';
    const grid = panel.querySelector('.hx-cfg-mode-grid');

    MODES.forEach(m => {
      const isDisabledDaily = m.id === 'hexacoreDaily' && completed;

      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'hx-cfg-mode-card'
        + (m.id === 'hexacoreDailyUnlimited' ? ' hx-cfg-mode-card--daily-unlimited' : '')
        + (isDisabledDaily ? ' hx-cfg-mode-card--disabled' : '');
      card.style.setProperty('--hx-mode-color', m.color);
      if (isDisabledDaily) card.disabled = true;

      const subtitleHtml = isDisabledDaily
        ? `<span class="hx-cfg-mode-desc hx-cfg-mode-completed">✓ Completed · Next in ${countdown}</span>`
        : `<span class="hx-cfg-mode-desc">${m.desc}</span>`;

      card.innerHTML = `
        <span class="hx-cfg-mode-icon">${m.icon}</span>
        <div class="hx-cfg-mode-info">
          <span class="hx-cfg-mode-title">${m.title}</span>
          ${subtitleHtml}
        </div>
        ${isDisabledDaily ? '' : '<span class="hx-cfg-mode-arrow">›</span>'}
      `;

      if (!isDisabledDaily) {
        card.addEventListener('click', () => {
          if (m.id === 'quests') {
            $('hx-settings-modal')?.remove();
            openQuestsModal();
            return;
          }
          $('hx-settings-modal')?.remove();
          document.dispatchEvent(new CustomEvent('hx:start-mode', { detail: { mode: m.id } }));
        });
      }
      grid.appendChild(card);
    });
  }

  function renderLeaderboardsSection(panel) {
    panel.innerHTML = `
      <button class="hx-cfg-launch-btn" id="hx-cfg-lb-open">
        <span>🏅</span> Open Full Leaderboards
      </button>
      <div class="hx-cfg-lb-preview">
        <div class="hx-cfg-lb-tabs-info">
          <div class="hx-cfg-lb-tab-item"><span>🏆</span><span>All-Time</span></div>
          <div class="hx-cfg-lb-tab-item"><span>📅</span><span>Daily</span></div>
          <div class="hx-cfg-lb-tab-item"><span>🗓</span><span>Weekly</span></div>
          <div class="hx-cfg-lb-tab-item"><span>✨</span><span>XP Rank</span></div>
        </div>
        <p class="hx-cfg-preview-note">Submit your score at the end of each session to appear on global leaderboards. Set a name from Settings → Set Name to track your scores.</p>
      </div>
    `;
    panel.querySelector('#hx-cfg-lb-open')?.addEventListener('click', () => {
      $('hx-settings-modal')?.remove();
      openLeaderboardsModal();
    });
  }

  function renderProfileSection(panel) {
    const playerName = (() => {
      try { return getPlayerName() || ''; } catch (_) { return ''; }
    })();
    const xpData = (() => {
      try { return getXPData(); } catch (_) { return { xp: 0, level: 1 }; }
    })();
    const displayName = playerName || 'Anonymous';

    panel.innerHTML = `
      <div class="hx-cfg-profile-quick">
        <div class="hx-cfg-profile-avatar">👤</div>
        <div class="hx-cfg-profile-info">
          <div class="hx-cfg-profile-name">${escapeHtml(displayName)}</div>
          <div class="hx-cfg-profile-level">Level ${xpData.level} · ${(xpData.xp || 0).toLocaleString()} XP</div>
        </div>
      </div>
      <button class="hx-cfg-launch-btn" id="hx-cfg-profile-open">
        <span>👤</span> View Full Profile & Stats
      </button>
      <button class="hx-cfg-secondary-btn" id="hx-cfg-name-btn">
        <span>✏️</span> Change Player Name
      </button>
    `;
    panel.querySelector('#hx-cfg-profile-open')?.addEventListener('click', () => {
      $('hx-settings-modal')?.remove();
      openProfileModal();
    });
    panel.querySelector('#hx-cfg-name-btn')?.addEventListener('click', () => {
      $('hx-settings-modal')?.remove();
      $('set-name-btn')?.click();
    });
  }

  /* ── Main modal builder ─────────────────────────────────────────── */

  function openHexacoreSettingsModal() {
    $('hx-settings-modal')?.remove();

    const modal = document.createElement('div');
    modal.id = 'hx-settings-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'hx-settings-title');

    // Three tabs only: MODES · LEADERBOARDS · PROFILE
    const TABS = [
      { id: 'mode',         icon: '🎮', label: 'MODES'        },
      { id: 'leaderboards', icon: '🏅', label: 'LEADERBOARDS' },
      { id: 'profile',      icon: '👤', label: 'PROFILE'      },
    ];

    modal.innerHTML = `
      <div id="hx-settings-box">
        <div id="hx-settings-header">
          <div id="hx-settings-brand">
            <span id="hx-settings-hex-icon">⬡</span>
            <div>
              <span id="hx-settings-title">HEXACORE</span>
              <span id="hx-settings-subtitle">SETTINGS</span>
            </div>
          </div>
          <div id="hx-settings-header-actions">
            <button class="hx-cfg-header-btn" id="hx-cfg-home-btn"  type="button">🏠 HOME</button>
            <button class="hx-cfg-header-btn" id="hx-cfg-theme-btn" type="button">🌙 THEME</button>
            <button class="hx-cfg-header-btn" id="hx-cfg-howto-btn" type="button">❓ HOW TO</button>
            <button id="hx-settings-close" type="button" aria-label="Close Hexacore settings">✕</button>
          </div>
        </div>

        <nav id="hx-settings-tabs" role="tablist" aria-label="Hexacore settings sections">
          ${TABS.map(t => `
            <button
              class="hx-settings-tab"
              data-tab="${t.id}"
              role="tab"
              aria-selected="false"
              aria-controls="hx-settings-panel-${t.id}"
              id="hx-settings-tab-${t.id}"
              type="button"
            >
              <span class="hx-settings-tab-icon" aria-hidden="true">${t.icon}</span>
              <span class="hx-settings-tab-label">${t.label}</span>
            </button>
          `).join('')}
        </nav>

        <div id="hx-settings-content" role="tabpanel"></div>
      </div>
    `;

    document.body.appendChild(modal);

    const content  = $('hx-settings-content');
    const tabs     = modal.querySelectorAll('.hx-settings-tab');
    let   activeId = null;

    if (content) {
      content.style.overflowY = 'auto';
      content.style.webkitOverflowScrolling = 'touch';
    }

    function activateTab(tabId) {
      if (activeId === tabId) return;
      activeId = tabId;
      tabs.forEach(t => {
        const active = t.dataset.tab === tabId;
        t.classList.toggle('hx-settings-tab--active', active);
        t.setAttribute('aria-selected', String(active));
      });
      const panel = document.createElement('div');
      panel.className = 'hx-cfg-panel';
      panel.id = `hx-settings-panel-${tabId}`;
      panel.setAttribute('role', 'tabpanel');
      panel.setAttribute('aria-labelledby', `hx-settings-tab-${tabId}`);

      switch (tabId) {
        case 'mode':         renderModeSection(panel);         break;
        case 'leaderboards': renderLeaderboardsSection(panel); break;
        case 'profile':      renderProfileSection(panel);      break;
      }

      content.innerHTML = '';
      content.appendChild(panel);
      content.scrollTop = 0;
    }

    tabs.forEach(tab => tab.addEventListener('click', () => activateTab(tab.dataset.tab)));

    // Close handlers
    function close() { modal.remove(); }
    $('hx-settings-close').addEventListener('click', close);
    modal.addEventListener('click', e => { if (e.target === modal) close(); });

    const escHandler = e => { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', escHandler); } };
    document.addEventListener('keydown', escHandler);

    // Header action buttons
    $('hx-cfg-home-btn')?.addEventListener('click', () => { close(); $('home-btn')?.click(); });
    $('hx-cfg-theme-btn')?.addEventListener('click', () => {
      $('toggle-theme')?.click();
      const theme = document.body.getAttribute('data-theme') || 'light';
      const btn   = $('hx-cfg-theme-btn');
      if (btn) btn.textContent = theme === 'dark' ? '☀️ THEME' : '🌙 THEME';
    });
    $('hx-cfg-howto-btn')?.addEventListener('click', () => { close(); window.hxHowto?.open(); });

    // Show first tab
    activateTab('mode');
    $('hx-settings-close')?.focus();
  }

  /* ── Utility ────────────────────────────────────────────────────── */

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
})();
