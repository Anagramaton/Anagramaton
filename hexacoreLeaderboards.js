// hexacoreLeaderboards.js — Multi-tab leaderboard modal for Hexacore

import { fetchLeaderboard, getPlayerName } from './leaderboard.js';
import { getXPData } from './hexacoreXP.js';
import { getTodayString, getWeekString } from './hexacoreQuests.js';
import {
  getHexacoreAllTimeLeaderboardId,
  getHexacoreDailyLeaderboardId,
  getHexacoreRankBadgeLabel,
  getHexacoreWeeklyLeaderboardId,
  resetHexacoreLeaderboardStorage,
} from './hexacoreLeaderboardKeys.js';

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/* ── XP Ranking (local localStorage scan) ──────────────────────── */

function buildXPRankingTable(currentPlayer) {
  // XP ranking is local-only — just show the current player's data
  const { xp, level } = getXPData();
  return `
    <div class="hx-lb-xp-card">
      <div class="hx-lb-xp-level">${level}</div>
      <div class="hx-lb-xp-label">PLAYER LEVEL</div>
      <div class="hx-lb-xp-total">${xp.toLocaleString()} XP</div>
      ${currentPlayer ? `<div class="hx-lb-xp-player">${escapeHtml(currentPlayer)}</div>` : ''}
    </div>
    <div class="hx-lb-note">
      XP ranking is tracked locally on this device.
    </div>
  `;
}

/* ── Leaderboard table renderer ─────────────────────────────────── */

function renderTable(entries, currentPlayer) {
  if (!entries || entries.length === 0) {
    return '<div class="hx-lb-empty">No entries yet.</div>';
  }

  const rows = entries.slice(0, 20).map((e, i) => {
    const isYou = currentPlayer && e.player_name === currentPlayer;
    const rankBadge = getHexacoreRankBadgeLabel(i);
    const rowClass = [
      i < 3 ? 'is-top-rank' : '',
      isYou ? 'is-current-player' : '',
    ].filter(Boolean).join(' ');

    return `<tr class="${rowClass}">
      <td><span class="hx-rank-badge">${rankBadge}</span></td>
      <td>${escapeHtml(e.player_name || 'Anonymous')}${isYou ? ' <span class="hx-you-tag">YOU</span>' : ''}</td>
      <td class="hx-score-col">${(e.score || 0).toLocaleString()}</td>
    </tr>`;
  }).join('');

  return `
    <table class="hx-lb-table">
      <thead>
        <tr>
          <th>#</th>
          <th>Player</th>
          <th>Score</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

/* ── Tab rendering ───────────────────────────────────────────────── */

async function loadTab(tabId, contentEl) {
  const currentPlayer = getPlayerName();
  contentEl.innerHTML = '<div class="hx-lb-loading">Loading…</div>';

  try {
    if (tabId === 'xp') {
      contentEl.innerHTML = buildXPRankingTable(currentPlayer);
      return;
    }

    let gameId, dailyId;
    if (tabId === 'alltime') {
      gameId  = 'hexacore';
      dailyId = getHexacoreAllTimeLeaderboardId();
    } else if (tabId === 'daily') {
      gameId  = 'hexacore';
      dailyId = getHexacoreDailyLeaderboardId(getTodayString());
    } else if (tabId === 'weekly') {
      gameId  = 'hexacore';
      dailyId = getHexacoreWeeklyLeaderboardId(getWeekString());
    }

    const result = await fetchLeaderboard(dailyId, gameId);
    if (!result.configured) {
      contentEl.innerHTML = '<div class="hx-lb-empty">Leaderboard not configured.</div>';
      return;
    }
    contentEl.innerHTML = renderTable(result.entries, currentPlayer);
  } catch (err) {
    contentEl.innerHTML = '<div class="hx-lb-empty">Failed to load.</div>';
  }
}

/* ── Public: open modal ─────────────────────────────────────────── */

export function openLeaderboardsModal() {
  document.getElementById('hx-leaderboards-modal')?.remove();
  resetHexacoreLeaderboardStorage();

  const TABS = [
    { id: 'alltime', label: '🏆 All-Time' },
    { id: 'daily',   label: '📅 Daily' },
    { id: 'weekly',  label: '🗓 Weekly' },
    { id: 'xp',      label: '✨ XP Rank' },
  ];

  const modal = document.createElement('div');
  modal.id = 'hx-leaderboards-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');

  const box = document.createElement('div');
  box.id = 'hx-leaderboards-box';

  // Header
  const header = document.createElement('div');
  header.id = 'hx-leaderboards-header';
  header.innerHTML = `
    <div id="hx-leaderboards-title-wrap">
      <span id="hx-leaderboards-title">🏅 LEADERBOARDS</span>
      <span id="hx-leaderboards-subtitle">Hexacore Rankings</span>
    </div>
    <button id="hx-leaderboards-close" aria-label="Close leaderboards">✕</button>
  `;

  // Tab bar
  const tabBar = document.createElement('div');
  tabBar.className = 'hx-lb-tabs';

  TABS.forEach(t => {
    const btn = document.createElement('button');
    btn.className = 'hx-lb-tab';
    btn.dataset.tab = t.id;
    btn.textContent = t.label;
    tabBar.appendChild(btn);
  });

  // Content area
  const content = document.createElement('div');
  content.id = 'hx-leaderboards-content';

  box.appendChild(header);
  box.appendChild(tabBar);
  box.appendChild(content);
  modal.appendChild(box);
  document.body.appendChild(modal);

  // Tab switching
  let activeTab = null;
  function selectTab(tabId) {
    if (activeTab === tabId) return;
    activeTab = tabId;
    tabBar.querySelectorAll('.hx-lb-tab').forEach(btn => {
      btn.classList.toggle('hx-lb-tab-active', btn.dataset.tab === tabId);
    });
    loadTab(tabId, content);
  }

  tabBar.addEventListener('click', e => {
    const btn = e.target.closest('.hx-lb-tab');
    if (btn) selectTab(btn.dataset.tab);
  });

  // Open first tab
  selectTab('alltime');

  document.getElementById('hx-leaderboards-close')?.addEventListener('click', () => modal.remove());
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
}
