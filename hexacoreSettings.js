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

  /* ── Section renderers ────────────────────────────────────────── */

  function renderModeSection(panel) {
    const MODES = [
      { id: 'endless',  icon: '🔥', title: 'ENDLESS',  color: '#f97316',
        desc: 'Survive the ember. Score as high as you can with no limits.' },
      { id: 'zen',      icon: '🌿', title: 'ZEN MODE', color: '#22c55e',
        desc: 'No ember tiles. Relax and build words at your own pace.' },
      { id: 'daily',    icon: '📅', title: 'DAILY',    color: '#4cc9f0',
        desc: 'A fresh challenge every day. Compete for the daily top score.' },
      { id: 'campaign', icon: '⚔️', title: 'CAMPAIGN', color: '#a855f7',
        desc: '50 structured levels with unique objectives and star ratings.' },
    ];

    panel.innerHTML = `
      <h3 class="hx-cfg-section-title">🎮 MODE SELECTORS</h3>
      <p class="hx-cfg-section-desc">Choose your Hexacore experience. Each mode has unique rules and goals.</p>
      <div class="hx-cfg-mode-grid"></div>
    `;

    const grid = panel.querySelector('.hx-cfg-mode-grid');
    MODES.forEach(m => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'hx-cfg-mode-card';
      card.style.setProperty('--hx-mode-color', m.color);
      card.innerHTML = `
        <span class="hx-cfg-mode-icon">${m.icon}</span>
        <div class="hx-cfg-mode-info">
          <span class="hx-cfg-mode-title">${m.title}</span>
          <span class="hx-cfg-mode-desc">${m.desc}</span>
        </div>
        <span class="hx-cfg-mode-arrow">›</span>
      `;
      card.addEventListener('click', () => {
        $('hx-settings-modal')?.remove();
        // Dispatch event — hexacore.js handles mode start
        document.dispatchEvent(new CustomEvent('hx:start-mode', { detail: { mode: m.id } }));
      });
      grid.appendChild(card);
    });
  }

  function renderQuestsSection(panel) {
    panel.innerHTML = `
      <h3 class="hx-cfg-section-title">📋 QUESTS &amp; CHALLENGES</h3>
      <p class="hx-cfg-section-desc">Complete daily quests, the weekly login streak, and tier challenges to earn XP bonuses.</p>
      <button class="hx-cfg-launch-btn" id="hx-cfg-quests-open">
        <span>📋</span> Open Quests &amp; Challenges
      </button>
      <div class="hx-cfg-quest-preview">
        <p class="hx-cfg-preview-note">Quests and challenges are combined in one panel. Daily quests refresh at midnight UTC. The weekly quest rewards logging in every day for 7 days.</p>
        <ul class="hx-cfg-quest-tips">
          <li>🔥 Use <strong>Ember</strong> tiles to earn bonus gems</li>
          <li>✦ Form <strong>long words</strong> (7+ letters) for rare gems</li>
          <li>📅 Log in every day to complete the weekly login quest</li>
          <li>🗓 Weekly login quest awards <strong>1,000 XP</strong></li>
          <li>📋 Challenges unlock permanent achievements across all sessions</li>
        </ul>
      </div>
    `;
    panel.querySelector('#hx-cfg-quests-open')?.addEventListener('click', () => {
      $('hx-settings-modal')?.remove();
      openQuestsModal();
    });
  }

  function renderLeaderboardsSection(panel) {
    panel.innerHTML = `
      <h3 class="hx-cfg-section-title">🏅 LEADERBOARDS</h3>
      <p class="hx-cfg-section-desc">Compete globally — all-time, daily, weekly, and XP rankings.</p>
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
      <h3 class="hx-cfg-section-title">👤 PROFILE</h3>
      <p class="hx-cfg-section-desc">Your Hexacore career stats and player identity.</p>
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

  function renderHowtoSection(panel) {
    panel.innerHTML = `
      <h3 class="hx-cfg-section-title">❓ HOW TO PLAY</h3>
      <p class="hx-cfg-section-desc">Learn Hexacore mechanics — special tiles, gems, scoring, and quests.</p>
      <button class="hx-cfg-launch-btn" id="hx-cfg-howto-open">
        <span>🎮</span> Open Full How-To Guide
      </button>
      <div class="hx-cfg-howto-highlights">
        <div class="hx-cfg-howto-card">
          <span class="hx-cfg-howto-card-icon">🔥</span>
          <div>
            <strong>Ember Tiles</strong>
            <p>Advance every turn. Reach the bottom = game over. Use them in words to destroy them and earn bonus gems.</p>
          </div>
        </div>
        <div class="hx-cfg-howto-card">
          <span class="hx-cfg-howto-card-icon">◆</span>
          <div>
            <strong>Gem Tiles</strong>
            <p>Longer words spawn gems (Emerald×2 → Alexandrite×13). Multiple gems of the same type multiply together.</p>
          </div>
        </div>
        <div class="hx-cfg-howto-card">
          <span class="hx-cfg-howto-card-icon">✨</span>
          <div>
            <strong>XP &amp; Levels</strong>
            <p>Every word earns XP. Level up to unlock Tier Challenges. Check your level in the top bar.</p>
          </div>
        </div>
        <div class="hx-cfg-howto-card">
          <span class="hx-cfg-howto-card-icon">◈</span>
          <div>
            <strong>Portals</strong>
            <p>After every 10 words, corner tiles become a portal pair. Chain through Entry + Exit to link non-adjacent tiles.</p>
          </div>
        </div>
      </div>
    `;
    panel.querySelector('#hx-cfg-howto-open')?.addEventListener('click', () => {
      $('hx-settings-modal')?.remove();
      window.hxHowto?.open();
    });
  }

  function renderTilesSection(panel) {
    const SPECIAL_TILES = [
      {
        swatch: 'linear-gradient(135deg,#0a0a0a,#a3a3a3)',
        border: '#737373',
        icon: '🔥',
        name: 'EMBER',
        badge: 'DANGER',
        badgeColor: '#ef4444',
        desc: 'Advances one row every turn. If it reaches the bottom row, the game ends immediately. Include it in any word to destroy it and earn a bonus gem.',
      },
      {
        swatch: 'linear-gradient(135deg,#111111,#d4d4d4)',
        border: '#a3a3a3',
        icon: '✦',
        name: 'PRISM',
        badge: 'MULTIPLIER',
        badgeColor: '#94a3b8',
        desc: 'Boosts your gem tier when used in a word. The longer the word, the rarer the gem — Prism pushes you to the next tier without needing extra letters.',
      },
      {
        swatch: '#2f2f2f',
        border: '#6b7280',
        icon: 'ᚱ',
        name: 'RUNE',
        badge: 'WILD',
        badgeColor: '#94a3b8',
        desc: 'Include it in any word to open the Rune Picker. Choose any letter to replace it — perfect for breaking up dead-letter clusters.',
      },
      {
        swatch: 'linear-gradient(135deg,#3b2a1f,#8b6b4b)',
        border: '#8b6b4b',
        icon: '⟨TH⟩',
        name: 'DIGRAPH',
        badge: 'PAIR',
        badgeColor: '#d97706',
        desc: 'A pre-joined letter pair (TH, QU, CH, NG…). Both letters count toward word length and scoring. Unlocks word paths that single letters alone cannot reach.',
      },
      {
        swatch: 'linear-gradient(135deg,#111827,#d1d5db)',
        border: '#9ca3af',
        icon: '◈',
        name: 'AMETHYST',
        badge: 'POWER-UP',
        badgeColor: '#9ca3af',
        desc: 'Earned by using it in a 5+ letter word. Spend it (◈ button) to change any tile on the board to any letter. Also advances downward each turn, but converts to a normal tile instead of ending the game.',
      },
      {
        swatch: 'linear-gradient(135deg,#1c1917,#e7e5e4)',
        border: '#a8a29e',
        icon: '⇌',
        name: 'SELENITE',
        badge: 'POWER-UP',
        badgeColor: '#9ca3af',
        desc: 'Earned by using it in a 5+ letter word. Spend it (⇌ button) to swap any two tiles on the board. Also advances downward each turn, but converts to a normal tile instead of ending the game.',
      },
      {
        swatch: 'linear-gradient(135deg,#0a0a0a,#6b7280)',
        border: '#6b7280',
        icon: '◈◉',
        name: 'PORTAL',
        badge: 'LINK',
        badgeColor: '#9ca3af',
        desc: 'After every 10 words, two corner tiles become a portal pair — Entry (◈) and Exit (◉). Chain through both in the same word to connect non-adjacent tiles and build longer paths.',
      },
    ];

    const GEM_TIERS = [
      { name: 'Emerald',    color: '#4ade80', letters: '2' },
      { name: 'Gold',       color: '#facc15', letters: '3' },
      { name: 'Sapphire',   color: '#60a5fa', letters: '4' },
      { name: 'Pearl',      color: '#f1f5f9', letters: '5' },
      { name: 'Tanzanite',  color: '#818cf8', letters: '6' },
      { name: 'Ruby',       color: '#f87171', letters: '7' },
      { name: 'Diamond',    color: '#e2e8f0', letters: '8' },
      { name: 'Aquamarine', color: '#22d3ee', letters: '9' },
      { name: 'Topaz',      color: '#fb923c', letters: '10' },
      { name: 'Opal',       color: '#e879f9', letters: '11' },
      { name: 'Imp. Jade',  color: '#34d399', letters: '12' },
      { name: 'Alexandrite',color: '#f472b6', letters: '13+' },
    ];

    panel.innerHTML = `
      <h3 class="hx-cfg-section-title">◆ SPECIAL TILES</h3>
      <p class="hx-cfg-section-desc">Special tiles have unique mechanics that stand apart from gem tiles. Learn what each one does so you can play around them.</p>
      <div class="hx-cfg-tile-list" id="hx-cfg-tile-list"></div>

      <h3 class="hx-cfg-section-title hx-cfg-gems-title">💎 GEM TIERS</h3>
      <p class="hx-cfg-section-desc">Gems appear when you destroy normal or special tiles. Longer words yield rarer gems. Multiple gems of the same type multiply each other.</p>
      <div class="hx-cfg-gem-grid" id="hx-cfg-gem-grid"></div>
    `;

    const tileList = panel.querySelector('#hx-cfg-tile-list');
    SPECIAL_TILES.forEach(t => {
      const row = document.createElement('div');
      row.className = 'hx-cfg-tile-row';
      row.innerHTML = `
        <div class="hx-cfg-tile-swatch" style="background:${t.swatch};border-color:${t.border}" aria-hidden="true">
          <span class="hx-cfg-tile-swatch-icon">${t.icon}</span>
        </div>
        <div class="hx-cfg-tile-info">
          <div class="hx-cfg-tile-name-row">
            <span class="hx-cfg-tile-name">${t.name}</span>
            <span class="hx-cfg-tile-badge" style="color:${t.badgeColor};border-color:${t.badgeColor}">${t.badge}</span>
          </div>
          <p class="hx-cfg-tile-desc">${t.desc}</p>
        </div>
      `;
      tileList.appendChild(row);
    });

    const gemGrid = panel.querySelector('#hx-cfg-gem-grid');
    GEM_TIERS.forEach(g => {
      const cell = document.createElement('div');
      cell.className = 'hx-cfg-gem-cell';
      cell.innerHTML = `
        <span class="hx-cfg-gem-dot" style="background:${g.color};box-shadow:0 0 6px ${g.color}88"></span>
        <span class="hx-cfg-gem-name">${g.name}</span>
        <span class="hx-cfg-gem-letters">${g.letters}L</span>
      `;
      gemGrid.appendChild(cell);
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

    const TABS = [
      { id: 'mode',         icon: '🎮', label: 'MODES'   },
      { id: 'tiles',        icon: '◆',  label: 'TILES'   },
      { id: 'quests',       icon: '📋', label: 'QUESTS'  },
      { id: 'leaderboards', icon: '🏅', label: 'BOARDS'  },
      { id: 'profile',      icon: '👤', label: 'PROFILE' },
      { id: 'howto',        icon: '❓', label: 'HOW TO'  },
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
          <button id="hx-settings-close" type="button" aria-label="Close Hexacore settings">✕</button>
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

        <div id="hx-settings-footer">
          <button class="hx-cfg-footer-btn" id="hx-cfg-home-btn"  type="button">🏠 HOME</button>
          <button class="hx-cfg-footer-btn" id="hx-cfg-theme-btn" type="button">🌙 THEME</button>
          <button class="hx-cfg-footer-btn" id="hx-cfg-cb-btn"    type="button">🌓 A11Y</button>
        </div>
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
        case 'tiles':        renderTilesSection(panel);        break;
        case 'quests':       renderQuestsSection(panel);       break;
        case 'leaderboards': renderLeaderboardsSection(panel); break;
        case 'profile':      renderProfileSection(panel);      break;
        case 'howto':        renderHowtoSection(panel);        break;
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

    // Footer buttons delegate to the existing Anagramaton controls
    $('hx-cfg-home-btn')?.addEventListener('click', () => { close(); $('home-btn')?.click(); });
    $('hx-cfg-theme-btn')?.addEventListener('click', () => {
      $('toggle-theme')?.click();
      const theme = document.body.getAttribute('data-theme') || 'light';
      const btn   = $('hx-cfg-theme-btn');
      if (btn) btn.textContent = theme === 'dark' ? '☀️ THEME' : '🌙 THEME';
    });
    $('hx-cfg-cb-btn')?.addEventListener('click', () => { $('toggle-access')?.click(); });

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
