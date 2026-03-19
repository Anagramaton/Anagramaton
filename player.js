// player.js — Player Profile Page

(async function () {
  const params = new URLSearchParams(location.search);
  const rawName = (params.get('name') || '').trim();

  const root = document.getElementById('player-root');
  if (!root) return;

  if (!rawName) {
    showError(root, 'No player name specified.');
    return;
  }

  // Set page title
  document.title = `${rawName} — Anagramaton`;

  showLoading(root);

  let data;
  try {
    const res = await fetch(`/api/player?name=${encodeURIComponent(rawName)}`);
    if (res.status === 503) {
      root.innerHTML = `<div class="player-loading">Leaderboard not available.</div>`;
      return;
    }
    if (res.status === 404) {
      showError(root, 'Player not found.');
      return;
    }
    data = await res.json();
    if (!res.ok || data.error) {
      showError(root, data.error || 'Failed to load player data.');
      return;
    }
  } catch (err) {
    showError(root, 'Failed to load player data.');
    return;
  }

  renderProfile(root, data);
})();

// ── Helpers ───────────────────────────────────────────────────────

function showLoading(root) {
  root.innerHTML = `<div class="player-loading">Loading...</div>`;
}

function showError(root, msg) {
  root.innerHTML = `
    <div class="player-error">
      <p class="player-error__msg">${escHtml(msg)}</p>
      <a class="player-error__link" href="/" onclick="if(history.length>1){history.back();return false;}">← Back to Game</a>
    </div>`;
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Render ────────────────────────────────────────────────────────

function renderProfile(root, data) {
  const { playerName, daily, unlimited } = data;

  // Truncate display name to 15 chars for layout; keep full name for title/API
  const displayName = playerName.length > 15 ? playerName.slice(0, 15) + '…' : playerName;

  // Combine recent games from both modes, sort newest first, take top 20
  const allRecent = [
    ...(daily.recentGames || []),
    ...(unlimited.recentGames || []),
  ].sort((a, b) => {
    const da = a.date ? new Date(a.date).getTime() : -Infinity;
    const db = b.date ? new Date(b.date).getTime() : -Infinity;
    return db - da;
  }).slice(0, 20);

  root.innerHTML = `
    <div class="player-name-row">
      <span class="player-avatar">👤</span>
      <h1 class="player-name">${escHtml(displayName)}</h1>
    </div>

    <div class="mode-tabs" role="tablist" aria-label="Stats mode">
      <button class="mode-tab mode-tab--active" data-mode="daily" role="tab" aria-selected="true" aria-controls="mode-panel-daily">📅 DAILY</button>
      <button class="mode-tab" data-mode="unlimited" role="tab" aria-selected="false" aria-controls="mode-panel-unlimited">♾️ UNLIMITED</button>
    </div>

    <div id="mode-panel-daily" role="tabpanel">
      ${renderModePanelContent('daily', daily)}
    </div>
    <div id="mode-panel-unlimited" class="mode-panel--hidden" role="tabpanel">
      ${renderModePanelContent('unlimited', unlimited)}
    </div>

    <section class="player-section">
      <div class="player-section-header">
        <span class="player-section-title">🏆 ACHIEVEMENTS</span>
        <div class="player-section-line"></div>
      </div>
      <div class="achievements-placeholder">
        <span class="achievements-placeholder__icon">🔒</span>
        <p class="achievements-placeholder__text">Achievements are coming soon. Keep playing to unlock your legacy.</p>
      </div>
    </section>

    <section class="player-section">
      <div class="player-section-header">
        <span class="player-section-title">RECENT GAMES</span>
        <div class="player-section-line"></div>
      </div>
      <div id="recent-games-filter-bar" class="recent-games-filter-bar" style="display:none"></div>
      <div id="recent-games-body">
        ${renderRecentGames(allRecent)}
      </div>
    </section>
  `;

  const statsMap = { daily, unlimited };

  // Updates the Recent Games section; pass label=null to show all games
  function showGames(games, label) {
    const filterBar = root.querySelector('#recent-games-filter-bar');
    const body = root.querySelector('#recent-games-body');
    if (!filterBar || !body) return;

    if (label) {
      filterBar.style.display = '';
      filterBar.innerHTML = `<span class="recent-games-filter-label">Showing: ${escHtml(label)}</span><button class="recent-games-show-all">× Show All</button>`;
      filterBar.querySelector('.recent-games-show-all').addEventListener('click', () => {
        root.querySelectorAll('.stat-card--active').forEach(c => c.classList.remove('stat-card--active'));
        showGames(allRecent, null);
      });
    } else {
      filterBar.style.display = 'none';
      filterBar.innerHTML = '';
    }
    body.innerHTML = renderRecentGames(games);
  }

  // Attach stat card click handlers
  root.querySelectorAll('.stat-card[data-stat]').forEach(card => {
    card.addEventListener('click', () => {
      const statKey = card.dataset.stat;
      const modeKey = card.dataset.mode;
      const isActive = card.classList.contains('stat-card--active');

      root.querySelectorAll('.stat-card--active').forEach(c => c.classList.remove('stat-card--active'));

      // 'Games Played' and 'Total Hints Used' always reset to full list
      if (isActive || statKey === 'gamesPlayed' || statKey === 'totalHintsUsed') {
        showGames(allRecent, null);
        return;
      }

      card.classList.add('stat-card--active');

      const modeStats = statsMap[modeKey];
      let game = null;
      let label = '';

      if (statKey === 'highestScore') {
        game = modeStats?.highestScoreGame || null;
        label = 'Highest Score game';
      } else if (statKey === 'longestWord') {
        game = modeStats?.longestWordGame || null;
        label = 'Longest Word game';
      } else if (statKey === 'topWord') {
        game = modeStats?.topWordGame || null;
        label = 'Top Word game';
      }

      showGames(game ? [game] : allRecent, game ? label : null);
    });
  });

  // Wire up tab switching
  root.querySelectorAll('.mode-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const mode = tab.dataset.mode;
      root.querySelectorAll('.mode-tab').forEach(t => {
        const active = t === tab;
        t.classList.toggle('mode-tab--active', active);
        t.setAttribute('aria-selected', String(active));
      });
      document.getElementById('mode-panel-daily').classList.toggle('mode-panel--hidden', mode !== 'daily');
      document.getElementById('mode-panel-unlimited').classList.toggle('mode-panel--hidden', mode !== 'unlimited');
    });
  });
}

function renderModePanelContent(modeKey, stats) {
  const isEmpty = stats.gamesPlayed === 0;
  const emptyMsg = modeKey === 'daily'
    ? 'No daily games recorded yet.'
    : 'No unlimited games recorded yet.';
  const title = modeKey === 'daily' ? '📅 DAILY MODE' : '♾️ UNLIMITED MODE';

  return `
    <section class="player-section">
      <div class="player-section-header">
        <span class="player-section-title">${title}</span>
        <div class="player-section-line"></div>
      </div>
      ${isEmpty
        ? `<p class="player-empty">${emptyMsg}</p>`
        : renderStatGrid(modeKey, stats)
      }
    </section>`;
}

function renderStatGrid(modeKey, stats) {
  return `
    <div class="player-stat-grid">
      ${statCard('Games Played', stats.gamesPlayed, false, 'gamesPlayed', modeKey)}
      ${statCard('Highest Score', stats.highestScore, true, 'highestScore', modeKey)}
      ${statCard('Longest Word', stats.longestWord || '—', false, 'longestWord', modeKey)}
      ${statCard('Top Word', stats.topWord || '—', false, 'topWord', modeKey)}
      ${statCard('Total Hints Used', stats.totalHintsUsed, false, 'totalHintsUsed', modeKey)}
    </div>`;
}

function statCard(label, value, highlight = false, statKey = '', modeKey = '') {
  const dataAttrs = statKey ? ` data-stat="${escHtml(statKey)}" data-mode="${escHtml(modeKey)}"` : '';
  return `
    <div class="stat-card${highlight ? ' stat-card--highlight' : ''}"${dataAttrs}>
      <span class="stat-card__label">${escHtml(label)}</span>
      <span class="stat-card__value">${escHtml(String(value))}</span>
    </div>`;
}

function renderRecentGames(games) {
  if (!games || games.length === 0) {
    return `<p class="player-empty">No recent games recorded.</p>`;
  }

  const rows = games.map(g => {
    const dateStr = formatDate(g.dailyId, g.date, g.mode);
    const modePill = g.mode === 'unlimited'
      ? `<span class="mode-pill mode-pill--unlimited">UNLIMITED</span>`
      : `<span class="mode-pill mode-pill--daily">DAILY</span>`;
    const wordsStr = Array.isArray(g.words) ? g.words.join(', ') : '';
    return `
      <tr>
        <td>${escHtml(dateStr)}</td>
        <td>${modePill}</td>
        <td>${escHtml(String(g.score))}</td>
        <td class="words-cell" title="${escHtml(wordsStr)}">${escHtml(wordsStr)}</td>
        <td>${escHtml(String(g.hintsUsed))}</td>
      </tr>`;
  }).join('');

  return `
    <div class="player-table-wrap">
      <table class="player-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Mode</th>
            <th>Score</th>
            <th>Words Played</th>
            <th>Hints Used</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

// ── Date formatting ───────────────────────────────────────────────

function formatDate(dailyId, createdAt, mode) {
  // For unlimited, prefer created_at if available
  if (mode === 'unlimited' && createdAt) {
    const d = new Date(createdAt);
    if (!isNaN(d.getTime())) return formatDateObj(d);
  }

  // Try to parse daily_id like "2026_03_10"
  if (dailyId && dailyId !== 'unlimited') {
    const parts = dailyId.split('_');
    if (parts.length === 3) {
      const [y, m, d] = parts.map(Number);
      const date = new Date(Date.UTC(y, m - 1, d));
      if (!isNaN(date.getTime())) return formatDateObj(date);
    }
  }

  // Fall back to created_at
  if (createdAt) {
    const d = new Date(createdAt);
    if (!isNaN(d.getTime())) return formatDateObj(d);
  }

  return dailyId || '—';
}

function formatDateObj(d) {
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
