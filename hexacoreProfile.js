// hexacoreProfile.js — Player profile & career stats for Hexacore

import { updateAchievementProgress } from './hexacoreAchievements.js';
import { updateBadgeProgress } from './hexacoreBadges.js';
import { getStatsSummary } from './hexacoreStats.js';

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

  const nineLetterWord = words.find(w => {
    const wStr = typeof w === 'string' ? w : w.word || '';
    return wStr.length >= 9;
  });
  if (nineLetterWord) {
    const wordValue = typeof nineLetterWord === 'string' ? nineLetterWord : nineLetterWord.word || '';
    updateAchievementProgress('wordSubmitted', { word: wordValue, score: 0 });
  }
  if (level >= 10 && level % 10 === 0) {
    updateAchievementProgress('levelUp', { level });
  }
  updateBadgeProgress(getStatsSummary());

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
  import('./hexacoreProfileNew.js')
    .then(mod => mod.openProfileModalNew())
    .catch(() => {
      // Minimal fallback to avoid a dead button if dynamic import fails
      document.getElementById('hx-profile-new-modal')?.remove();
      const modal = document.createElement('div');
      modal.id = 'hx-profile-new-modal';
      modal.style.cssText = 'position:fixed;inset:0;display:grid;place-items:center;background:rgba(0,0,0,.7);z-index:5600;';
      modal.innerHTML = '<div style="background:#111827;color:#fff;padding:1rem;border-radius:12px">Profile unavailable.</div>';
      modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
      document.body.appendChild(modal);
    });
}
