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
