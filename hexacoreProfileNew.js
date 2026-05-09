// hexacoreProfileNew.js — tabbed Hexacore profile modal

import { getProfile } from './hexacoreProfile.js';
import { getXPData } from './hexacoreXP.js';
import { getAchievements, claimAchievement, createAchievementConfetti } from './hexacoreAchievements.js';
import { getBadgesWithState, getAvailableTitles, getSelectedTitle, setSelectedTitle, getSelectedDisplayTitle } from './hexacoreBadges.js';
import { getStatsSummary, getChartData, getSessionHistory } from './hexacoreStats.js';

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function sparkline(series, stroke = '#4cc9f0') {
  if (!series.length) return '<svg viewBox="0 0 100 24" class="hx-mini-chart"><text x="4" y="14">No data</text></svg>';
  const max = Math.max(...series.map(p => p.y), 1);
  const points = series.map((p, i) => `${(i / Math.max(series.length - 1, 1)) * 100},${24 - (p.y / max) * 20 - 2}`).join(' ');
  return `<svg viewBox="0 0 100 24" class="hx-mini-chart" aria-hidden="true"><polyline fill="none" stroke="${stroke}" stroke-width="2" points="${points}" /></svg>`;
}

function donut(entries) {
  const total = entries.reduce((s, e) => s + e.value, 0);
  if (!total) return '<div class="hx-chart-empty">No data</div>';
  let acc = 0;
  const segs = entries.slice(0, 6).map((e, i) => {
    const pct = e.value / total;
    const a0 = acc * Math.PI * 2;
    const a1 = (acc + pct) * Math.PI * 2;
    acc += pct;
    const x0 = 50 + 34 * Math.cos(a0);
    const y0 = 50 + 34 * Math.sin(a0);
    const x1 = 50 + 34 * Math.cos(a1);
    const y1 = 50 + 34 * Math.sin(a1);
    const large = pct > 0.5 ? 1 : 0;
    const colors = ['#4cc9f0', '#a78bfa', '#ff8c42', '#22c55e', '#fbbf24', '#ef4444'];
    return `<path d="M 50 50 L ${x0} ${y0} A 34 34 0 ${large} 1 ${x1} ${y1} Z" fill="${colors[i % colors.length]}" opacity="0.85" />`;
  }).join('');
  return `<svg viewBox="0 0 100 100" class="hx-donut-chart" aria-hidden="true">${segs}<circle cx="50" cy="50" r="16" fill="rgba(8,16,26,0.92)"/></svg>`;
}

function profileHeader(playerName, xpData) {
  const title = getSelectedDisplayTitle();
  return `
    <div class="hx-profile-new-header-top">
      <div>
        <div class="hx-profile-new-player">${escapeHtml(playerName)}</div>
        <div class="hx-profile-new-title">${escapeHtml(title || 'No title selected')}</div>
      </div>
      <div class="hx-profile-new-level">LV ${xpData.level}</div>
    </div>
  `;
}

function renderStatsTab() {
  const profile = getProfile();
  const stats = getStatsSummary();
  const chart = getChartData();

  return `
    <div class="hx-profile-cards hx-stagger-cards">
      <div class="hx-stat-card"><span>Games</span><strong>${stats.totalGames || profile.totalGames}</strong></div>
      <div class="hx-stat-card"><span>Total Words</span><strong>${(stats.totalWords || profile.totalWords).toLocaleString()}</strong></div>
      <div class="hx-stat-card"><span>Average Score</span><strong>${(stats.averageScore || 0).toLocaleString()}</strong></div>
      <div class="hx-stat-card"><span>Best Combo</span><strong>${(stats.bestWordScore || 0).toLocaleString()}</strong></div>
    </div>
    <div class="hx-profile-grid-2">
      <section class="hx-profile-panel">
        <h4>XP Progress</h4>
        <div class="hx-progress-ring-wrap">
          <svg viewBox="0 0 120 120" class="hx-progress-ring" aria-hidden="true">
            <circle cx="60" cy="60" r="46" class="hx-progress-track" />
            <circle cx="60" cy="60" r="46" class="hx-progress-value" style="stroke-dasharray:${2 * Math.PI * 46};stroke-dashoffset:${(1 - (chart.xpProgress.pct || 0) / 100) * 2 * Math.PI * 46}" />
          </svg>
          <div class="hx-progress-ring-label">${Math.round(chart.xpProgress.pct || 0)}%</div>
        </div>
      </section>
      <section class="hx-profile-panel">
        <h4>Tile Usage</h4>
        <div class="hx-bars">${chart.tileUsageBars.map(item => `<div class="hx-bar-row"><span>${escapeHtml(item.label)}</span><div><i style="width:${Math.max(4, item.value)}%"></i></div></div>`).join('') || '<div class="hx-chart-empty">No data</div>'}</div>
      </section>
      <section class="hx-profile-panel">
        <h4>Score Trend</h4>
        ${sparkline(chart.scoreSparkline, '#4cc9f0')}
      </section>
      <section class="hx-profile-panel">
        <h4>Gem Distribution</h4>
        ${donut(chart.gemDistribution)}
      </section>
    </div>
  `;
}

function achievementCard(a) {
  const progressPct = Math.min(100, Math.round(((a.progress || 0) / (a.condition?.target || 1)) * 100));
  const isUnlocked = a.state === 'unlocked';
  const isClaimed = a.state === 'claimed';

  return `
    <article class="hx-ach-card hx-ach-${a.state}" data-achievement-id="${a.id}">
      <header><span class="hx-ach-icon">${a.icon}</span><span class="hx-ach-rarity">${a.rarity}</span></header>
      <h4 title="${escapeHtml(a.desc)}">${escapeHtml(a.name)}</h4>
      <p>${escapeHtml(a.desc)}</p>
      ${isClaimed
        ? '<div class="hx-ach-claimed">✅ Claimed</div>'
        : isUnlocked
          ? `<button class="hx-ach-claim-btn" data-achievement-claim="${a.id}" aria-label="Claim ${escapeHtml(a.name)}">Claim +${a.reward} XP</button>`
          : `<div class="hx-ach-progress"><div class="hx-ach-progress-fill" style="width:${progressPct}%"></div></div><small>${a.progress || 0} / ${a.condition.target}</small>`}
    </article>
  `;
}

function renderAchievementsTab() {
  const achievements = getAchievements();
  return `<div class="hx-ach-grid">${achievements.map(achievementCard).join('')}</div>`;
}

function renderBadgesTab() {
  const badges = getBadgesWithState();
  const titles = getAvailableTitles();
  const selected = getSelectedTitle();

  return `
    <section class="hx-profile-panel">
      <label for="hx-title-select">Displayed title</label>
      <select id="hx-title-select" aria-label="Select profile title">
        <option value="">No title</option>
        ${titles.map(t => `<option value="${t.id}" ${selected === t.id ? 'selected' : ''}>${escapeHtml(t.displayTitle)}</option>`).join('')}
      </select>
    </section>
    <div class="hx-badge-grid">
      ${badges.map(b => `
        <article class="hx-badge-card hx-rarity-${b.rarity} ${b.unlocked ? 'is-unlocked' : 'is-locked'}">
          <div class="hx-badge-icon">${b.icon || '🏅'}</div>
          <h4>${escapeHtml(b.name)}</h4>
          <p>${escapeHtml(b.desc)}</p>
          <small>${escapeHtml(b.rarity)}</small>
        </article>
      `).join('')}
    </div>
  `;
}

function historyCard(session, idx) {
  const scoreClass = session.score >= 50000 ? 'hx-history-gold' : session.score >= 10000 ? 'hx-history-good' : '';
  return `
    <article class="hx-history-card ${scoreClass}">
      <button class="hx-history-toggle" data-history-idx="${idx}" aria-label="Toggle session details">
        <span>${new Date(session.date).toLocaleDateString()}</span>
        <strong>${session.score.toLocaleString()}</strong>
      </button>
      <div class="hx-history-main">
        <span>Words: ${session.words}</span>
        <span>Level: ${session.level}</span>
        <span>Mode: ${escapeHtml(session.mode || 'endless')}</span>
      </div>
      <div class="hx-history-details" hidden>
        <pre>${escapeHtml(JSON.stringify(session.tileUsage || {}, null, 2))}</pre>
      </div>
    </article>
  `;
}

function renderHistoryTab() {
  const history = getSessionHistory();
  const chart = getChartData();
  return `
    <div class="hx-profile-grid-2">
      <section class="hx-profile-panel">
        <h4>Score Progression</h4>
        ${sparkline(chart.scoreSparkline, '#fbbf24')}
      </section>
      <section class="hx-profile-panel">
        <h4>Words per Session</h4>
        ${sparkline(chart.wordsPerSession, '#22c55e')}
      </section>
    </div>
    <div class="hx-history-timeline">${history.map(historyCard).join('') || '<div class="hx-chart-empty">No sessions yet</div>'}</div>
  `;
}

function renderTabContent(tab) {
  switch (tab) {
    case 'stats': return renderStatsTab();
    case 'achievements': return renderAchievementsTab();
    case 'badges': return renderBadgesTab();
    case 'history': return renderHistoryTab();
    default: return renderStatsTab();
  }
}

export function openProfileModalNew() {
  document.getElementById('hx-profile-new-modal')?.remove();

  const xpData = getXPData();
  const playerName = (() => {
    try { return localStorage.getItem('anagramaton_player_name') || 'Anonymous'; } catch (_) { return 'Anonymous'; }
  })();

  const modal = document.createElement('div');
  modal.id = 'hx-profile-new-modal';
  modal.className = 'hx-profile-new-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-labelledby', 'hx-profile-new-title');

  let activeTab = 'stats';
  const tabs = [
    { id: 'stats', label: 'Stats' },
    { id: 'achievements', label: 'Achievements' },
    { id: 'badges', label: 'Badges' },
    { id: 'history', label: 'History' },
  ];

  modal.innerHTML = `
    <div class="hx-profile-new-box">
      <header class="hx-profile-new-header">
        <h2 id="hx-profile-new-title">👤 Profile</h2>
        <button id="hx-profile-new-close" aria-label="Close profile">✕</button>
      </header>
      ${profileHeader(playerName, xpData)}
      <nav class="hx-profile-tabs" role="tablist">
        ${tabs.map(t => `<button class="hx-profile-tab ${t.id === activeTab ? 'is-active' : ''}" role="tab" data-tab="${t.id}" aria-selected="${t.id === activeTab}">${t.label}</button>`).join('')}
      </nav>
      <section id="hx-profile-tab-content" class="hx-tab-slide-in">${renderTabContent(activeTab)}</section>
    </div>
  `;

  function reRender(nextTab = activeTab) {
    activeTab = nextTab;
    modal.querySelectorAll('.hx-profile-tab').forEach(btn => {
      const active = btn.dataset.tab === activeTab;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-selected', String(active));
    });
    const content = modal.querySelector('#hx-profile-tab-content');
    if (content) {
      content.classList.remove('hx-tab-slide-in');
      content.innerHTML = renderTabContent(activeTab);
      requestAnimationFrame(() => content.classList.add('hx-tab-slide-in'));
    }
  }

  modal.addEventListener('click', e => {
    const tabBtn = e.target.closest('.hx-profile-tab');
    if (tabBtn) {
      reRender(tabBtn.dataset.tab);
      return;
    }

    const claimBtn = e.target.closest('[data-achievement-claim]');
    if (claimBtn) {
      const result = claimAchievement(claimBtn.dataset.achievementClaim);
      if (result.ok) {
        createAchievementConfetti(claimBtn.closest('.hx-ach-card'));
      }
      reRender('achievements');
      return;
    }

    const historyBtn = e.target.closest('[data-history-idx]');
    if (historyBtn) {
      const details = historyBtn.closest('.hx-history-card')?.querySelector('.hx-history-details');
      if (details) details.hidden = !details.hidden;
      return;
    }

    if (e.target.id === 'hx-profile-new-close' || e.target === modal) {
      modal.remove();
    }
  });

  modal.addEventListener('change', e => {
    if (e.target.id === 'hx-title-select') {
      setSelectedTitle(e.target.value);
      reRender('badges');
    }
  });

  document.addEventListener('keydown', function onKeydown(ev) {
    if (ev.key === 'Escape') {
      modal.remove();
      document.removeEventListener('keydown', onKeydown);
    }
  });

  document.body.appendChild(modal);
}
