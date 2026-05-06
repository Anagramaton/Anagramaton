// hexacoreProfile.js — Player profile & career stats for Hexacore

const HX_PROFILE_KEY = 'hexacore_player_profile';

const DEFAULT_PROFILE = {
  totalGames:   0,
  totalWords:   0,
  longestWord:  '',
  highestScore: 0,
  totalXP:      0,
  gamesWon:     0,    // games that ended without triggering game-over (future use)
  bestLevel:    1,
  created:      null,
};

export function getProfile() {
  try {
    const json = localStorage.getItem(HX_PROFILE_KEY);
    if (!json) return { ...DEFAULT_PROFILE };
    return { ...DEFAULT_PROFILE, ...JSON.parse(json) };
  } catch (_) {
    return { ...DEFAULT_PROFILE };
  }
}

function saveProfile(data) {
  try { localStorage.setItem(HX_PROFILE_KEY, JSON.stringify(data)); } catch (_) {}
}

/**
 * Update profile stats after a game session ends.
 * @param {Object} sessionData - { words, score, xpEarned, level }
 */
export function updateProfile(sessionData) {
  const { words = [], score = 0, xpEarned = 0, level = 1 } = sessionData;
  const profile = getProfile();

  if (!profile.created) profile.created = new Date().toISOString();

  profile.totalGames++;
  profile.totalWords += words.length;
  profile.totalXP    += xpEarned;
  profile.bestLevel   = Math.max(profile.bestLevel, level);

  if (score > profile.highestScore) profile.highestScore = score;

  const longest = words.reduce((best, w) => {
    const wStr = typeof w === 'string' ? w : w.word || '';
    return wStr.length > best.length ? wStr : best;
  }, profile.longestWord || '');
  profile.longestWord = longest;

  saveProfile(profile);
  return profile;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function openProfileModal() {
  document.getElementById('hx-profile-modal')?.remove();

  const profile = getProfile();
  let xpData = { xp: 0, level: 1 };
  try {
    const raw = localStorage.getItem('hexacore_player_xp');
    if (raw) xpData = JSON.parse(raw);
  } catch (_) {}

  const modal = document.createElement('div');
  modal.id = 'hx-profile-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-labelledby', 'hx-profile-title');

  const box = document.createElement('div');
  box.id = 'hx-profile-box';

  const playerName = (() => {
    try { return localStorage.getItem('anagramaton_player_name') || 'Anonymous'; } catch (_) { return 'Anonymous'; }
  })();

  box.innerHTML = `
    <div id="hx-profile-header">
      <span id="hx-profile-title">👤 PROFILE</span>
      <button id="hx-profile-close" aria-label="Close profile">✕</button>
    </div>
    <div id="hx-profile-body">
      <div id="hx-profile-name">${escapeHtml(playerName)}</div>
      <div id="hx-profile-rank">
        <span class="hx-profile-rank-label">PLAYER LEVEL</span>
        <span class="hx-profile-rank-num">${xpData.level}</span>
        <span class="hx-profile-xp-total">${(xpData.xp || 0).toLocaleString()} XP</span>
      </div>
      <div id="hx-profile-stats">
        <div class="hx-stat-row">
          <span class="hx-stat-label">🎮 Games Played</span>
          <span class="hx-stat-value">${profile.totalGames}</span>
        </div>
        <div class="hx-stat-row">
          <span class="hx-stat-label">📝 Total Words</span>
          <span class="hx-stat-value">${profile.totalWords.toLocaleString()}</span>
        </div>
        <div class="hx-stat-row">
          <span class="hx-stat-label">🏆 High Score</span>
          <span class="hx-stat-value">${profile.highestScore.toLocaleString()}</span>
        </div>
        <div class="hx-stat-row">
          <span class="hx-stat-label">🔤 Longest Word</span>
          <span class="hx-stat-value">${escapeHtml(profile.longestWord || '—')}</span>
        </div>
        <div class="hx-stat-row">
          <span class="hx-stat-label">⚡ Best Level</span>
          <span class="hx-stat-value">${profile.bestLevel}</span>
        </div>
        <div class="hx-stat-row">
          <span class="hx-stat-label">✨ Total XP</span>
          <span class="hx-stat-value">${(profile.totalXP || 0).toLocaleString()}</span>
        </div>
      </div>
    </div>
  `;

  modal.appendChild(box);
  document.body.appendChild(modal);

  document.getElementById('hx-profile-close')?.addEventListener('click', () => modal.remove());
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
}
