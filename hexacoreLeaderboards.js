// hexacoreLeaderboards.js — Multi-tab leaderboard modal for Hexacore

import { fetchLeaderboard, getPlayerName } from './leaderboard.js';
import { getXPData } from './hexacoreXP.js';
import { formatPlayerNameWithTitle } from './hexacoreBadges.js';

const HEXACORE_PARTITION_ID = 'hexacore';
const HEXACORE_MODE = 'hexacore';

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
    <div style="text-align:center;padding:1rem 0">
      <div style="font-size:2rem;font-weight:bold;color:#a855f7">${level}</div>
      <div style="opacity:0.6;font-size:0.8rem;margin-bottom:0.5rem">PLAYER LEVEL</div>
      <div style="color:#c4b5fd;font-size:1.1rem">${xp.toLocaleString()} XP</div>
      ${currentPlayer ? `<div style="margin-top:0.75rem;opacity:0.6;font-size:0.8rem">${escapeHtml(formatPlayerNameWithTitle(currentPlayer))}</div>` : ''}
    </div>
    <div style="opacity:0.45;font-size:0.72rem;text-align:center;padding-bottom:0.5rem">
      XP ranking is tracked locally on this device.
    </div>
  `;
}

/* ── Leaderboard table renderer ─────────────────────────────────── */

function renderTable(entries, currentPlayer) {
  if (!entries || entries.length === 0) {
    return '<div style="opacity:0.5;text-align:center;padding:1rem;font-size:0.85rem">No entries yet.</div>';
  }

  const rows = entries.slice(0, 20).map((e, i) => {
    const isYou = currentPlayer && e.player_name === currentPlayer;
    const style = isYou ? 'color:#f59e0b;font-weight:bold' : '';
    return `<tr class="hx-lb-row" style="${style}">
      <td style="padding:0.35rem 0.5rem;opacity:0.5;width:2rem">${i + 1}</td>
      <td class="hx-lb-player-name" style="padding:0.35rem 0.5rem">${escapeHtml(formatPlayerNameWithTitle(e.player_name || 'Anonymous'))}${isYou ? ' 👈' : ''}</td>
      <td style="padding:0.35rem 0.5rem;color:${isYou ? '#f59e0b' : '#4cc9f0'};font-weight:700;text-align:right">${(e.score || 0).toLocaleString()}</td>
    </tr>`;
  }).join('');

  return `
    <table style="width:100%;border-collapse:collapse">
      <thead>
        <tr style="opacity:0.5;text-transform:uppercase;border-bottom:1px solid rgba(255,255,255,0.14)">
          <th style="padding:0.35rem 0.5rem;text-align:left;font-weight:normal">#</th>
          <th style="padding:0.35rem 0.5rem;text-align:left;font-weight:normal">Player</th>
          <th style="padding:0.35rem 0.5rem;text-align:right;font-weight:normal">Score</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

/* ── Tab rendering ───────────────────────────────────────────────── */

async function loadTab(tabId, contentEl) {
  const currentPlayer = getPlayerName();
  contentEl.innerHTML = '<div style="text-align:center;opacity:0.5;padding:1rem">Loading…</div>';

  try {
    if (tabId === 'xp') {
      contentEl.innerHTML = buildXPRankingTable(currentPlayer);
      return;
    }

    const result = await fetchLeaderboard(HEXACORE_PARTITION_ID, HEXACORE_MODE);
    if (!result.configured) {
      contentEl.innerHTML = '<div style="opacity:0.5;text-align:center;padding:1rem;font-size:0.8rem">Leaderboard not configured.</div>';
      return;
    }
    const unifiedMsg = (tabId === 'daily' || tabId === 'weekly')
      ? '<div style="opacity:0.45;text-align:center;padding:0.3rem 0 0.7rem;font-size:0.72rem">Hexacore currently uses one global leaderboard pool.</div>'
      : '';
    contentEl.innerHTML = unifiedMsg + renderTable(result.entries, currentPlayer);
  } catch (err) {
    contentEl.innerHTML = '<div style="opacity:0.5;text-align:center;padding:1rem;font-size:0.8rem">Failed to load.</div>';
  }
}

/* ── Public: open modal ─────────────────────────────────────────── */

export function openLeaderboardsModal() {
  document.getElementById('hx-leaderboards-modal')?.remove();

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
    <span id="hx-leaderboards-title">🏅 LEADERBOARDS</span>
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
