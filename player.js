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

  root.innerHTML = `
    <div class="player-name-row">
      <span class="player-avatar">👤</span>
      <h1 class="player-name">${escHtml(playerName)}</h1>
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
      ${renderRecentGamesList([...(daily.recentGames || []), ...(unlimited.recentGames || [])].sort((a, b) => {
        const da = a.date ? new Date(a.date).getTime() : -Infinity;
        const db = b.date ? new Date(b.date).getTime() : -Infinity;
        return db - da;
      }).slice(0, 20))}
    </section>
  `;

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
        : renderStatGrid(stats)
      }
    </section>`;
}

function renderStatGrid(stats) {
  return `
    <div class="player-stat-grid">
      ${statCard('Games Played', stats.gamesPlayed)}
      ${statCard('Highest Score', stats.highestScore, true)}
      ${statCard('Longest Word', stats.longestWord || '—', false, true)}
      ${topWordCard(stats.topWord)}
      ${statCard('Total Hints Used', stats.totalHintsUsed)}
    </div>`;
}

function statCard(label, value, highlight = false, isWord = false) {
  const valueClass = isWord ? 'stat-card__value stat-card__value--word' : 'stat-card__value';
  return `
    <div class="stat-card${highlight ? ' stat-card--highlight' : ''}">
      <span class="stat-card__label">${escHtml(label)}</span>
      <span class="${valueClass}">${escHtml(String(value))}</span>
    </div>`;
}

function topWordCard(topWord) {
  return `
    <div class="stat-card">
      <span class="stat-card__label">Top Word</span>
      ${topWord
        ? `<span class="stat-card__value stat-card__value--word">${escHtml(topWord.word)}</span>
           <span class="stat-card__word-score">${escHtml(String(topWord.score))} pts</span>`
        : `<span class="stat-card__value">—</span>`
      }
    </div>`;
}

function renderRecentGamesList(games) {
  if (!games || games.length === 0) {
    return `<p class="player-empty">No recent games recorded.</p>`;
  }

  return games.map(game => {
    const dateStr = formatDate(game.dailyId, game.date, game.mode);
    const modePill = game.mode === 'unlimited'
      ? `<span class="mode-pill mode-pill--unlimited">UNLIMITED</span>`
      : `<span class="mode-pill mode-pill--daily">DAILY</span>`;

    const wordRows = Array.isArray(game.wordsWithScores) && game.wordsWithScores.length > 0
      ? game.wordsWithScores.map(ws => `
          <tr>
            <td>${escHtml(ws.word)}</td>
            <td class="score-cell">${escHtml(String(ws.score))}</td>
          </tr>`).join('')
      : `<tr><td colspan="2" class="player-empty">No words recorded.</td></tr>`;

    return `
      <div class="recent-game-entry">
        <div class="recent-game-header">
          <span class="selected-game-date">${escHtml(dateStr)}</span>
          ${modePill}
          <span class="recent-game-score-chip">${escHtml(String(game.score))}</span>
          ${game.hintsUsed > 0 ? `<span class="recent-game-hints">${escHtml(String(game.hintsUsed))} hint${game.hintsUsed !== 1 ? 's' : ''}</span>` : ''}
        </div>
        <div class="player-table-wrap recent-game-words">
          <table class="player-table">
            <thead>
              <tr><th>Word</th><th>Score</th></tr>
            </thead>
            <tbody>${wordRows}</tbody>
          </table>
        </div>
      </div>`;
  }).join('');
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
