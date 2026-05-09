// hexacoreAchievements.js — Hexacore achievements + rewards

import { addXP, getXPData, showXPGainNotification } from './hexacoreXP.js';
import { getStatsSummary, updateStatTracking } from './hexacoreStats.js';
import { updateAchievementQuestProgress } from './hexacoreQuests.js';

const HX_ACHIEVEMENTS_KEY = 'hexacore_achievements_v1';

export const ACHIEVEMENTS = [
  {
    id: 'ach_first_word',
    name: 'First Steps',
    desc: 'Submit your first word',
    icon: '📝',
    reward: 50,
    condition: { type: 'totalWords', target: 1 },
    rarity: 'common',
  },
  {
    id: 'ach_word_master',
    name: 'Word Master',
    desc: 'Submit 1,000 words',
    icon: '📚',
    reward: 500,
    condition: { type: 'totalWords', target: 1000 },
    rarity: 'epic',
  },
  {
    id: 'ach_nine_letter',
    name: 'Lexicon Scholar',
    desc: 'Form a 9-letter word',
    icon: '🎓',
    reward: 300,
    condition: { type: 'longestWord', target: 9 },
    rarity: 'rare',
  },
  {
    id: 'ach_high_score',
    name: 'Score Legend',
    desc: 'Score 50,000+ points in one word',
    icon: '⚡',
    reward: 1000,
    condition: { type: 'bestWordScore', target: 50000 },
    rarity: 'legendary',
  },
  {
    id: 'ach_portal_10',
    name: 'Portal Walker',
    desc: 'Use portal 10 times',
    icon: '🌀',
    reward: 250,
    condition: { type: 'portalUses', target: 10 },
    rarity: 'rare',
  },
  {
    id: 'ach_claim_5',
    name: 'Collector',
    desc: 'Claim 5 achievements',
    icon: '🎁',
    reward: 400,
    condition: { type: 'achievementClaims', target: 5 },
    rarity: 'epic',
  },
];

function defaultState() {
  const entries = ACHIEVEMENTS.map(a => [a.id, { progress: 0, state: 'locked', unlockedAt: null, claimedAt: null }]);
  return Object.fromEntries(entries);
}

function loadState() {
  try {
    const raw = localStorage.getItem(HX_ACHIEVEMENTS_KEY);
    if (!raw) return defaultState();
    return { ...defaultState(), ...JSON.parse(raw) };
  } catch (_) {
    return defaultState();
  }
}

function saveState(state) {
  try { localStorage.setItem(HX_ACHIEVEMENTS_KEY, JSON.stringify(state)); } catch (_) {}
}

function announceUnlock(text) {
  const toast = document.createElement('div');
  toast.className = 'hx-achievement-toast';
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.textContent = text;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('hx-achievement-toast--show'));
  setTimeout(() => {
    toast.classList.remove('hx-achievement-toast--show');
    setTimeout(() => toast.remove(), 500);
  }, 2600);
}

function getMetricValue(type, ctx = {}) {
  const summary = getStatsSummary();
  const wordStr = typeof ctx.word === 'string'
    ? ctx.word
    : (typeof ctx.word?.word === 'string' ? ctx.word.word : '');
  switch (type) {
    case 'totalWords': return summary.totalWords || 0;
    case 'longestWord': return Math.max(summary.longestWordLength || 0, wordStr.length);
    case 'bestWordScore': return Math.max(summary.bestWordScore || 0, Number(ctx.score) || 0);
    case 'portalUses': return Number(summary.tileUsage?.portal || 0);
    case 'achievementClaims': return summary.totalAchievementClaims || 0;
    case 'bestLevel': return summary.bestLevel || 1;
    default: return 0;
  }
}

export function getAchievements() {
  const state = loadState();
  return ACHIEVEMENTS.map(a => ({ ...a, ...(state[a.id] || {}) }));
}

export function getAchievementSummary() {
  const list = getAchievements();
  return {
    total: list.length,
    unlocked: list.filter(a => a.state !== 'locked').length,
    claimed: list.filter(a => a.state === 'claimed').length,
    pendingClaim: list.filter(a => a.state === 'unlocked').length,
  };
}

export function updateAchievementProgress(eventType, data = {}) {
  const state = loadState();
  let changed = false;

  if (eventType === 'achievementClaimed') {
    updateStatTracking('achievementClaimed', data);
  }

  ACHIEVEMENTS.forEach(achievement => {
    const item = state[achievement.id];
    if (!item || item.state === 'claimed') return;

    const current = getMetricValue(achievement.condition.type, data);
    const progress = Math.min(achievement.condition.target, Math.max(item.progress || 0, current));
    if (progress !== item.progress) {
      item.progress = progress;
      changed = true;
    }

    if (item.state === 'locked' && progress >= achievement.condition.target) {
      item.state = 'unlocked';
      item.unlockedAt = new Date().toISOString();
      changed = true;
      announceUnlock(`Achievement unlocked: ${achievement.name}`);
    }
  });

  if (changed) saveState(state);
  return getAchievements();
}

export function claimAchievement(achievementId) {
  const state = loadState();
  const achievement = ACHIEVEMENTS.find(a => a.id === achievementId);
  const item = state[achievementId];
  if (!achievement || !item || item.state !== 'unlocked') return { ok: false, reward: 0 };

  item.state = 'claimed';
  item.claimedAt = new Date().toISOString();
  saveState(state);

  const reward = achievement.reward || 0;
  if (reward > 0) {
    addXP(reward);
    showXPGainNotification(reward, 'Achievement Reward');
  }

  updateAchievementProgress('achievementClaimed', { id: achievementId });
  const claimed = getAchievementSummary().claimed;
  updateAchievementQuestProgress(claimed);

  document.dispatchEvent(new CustomEvent('hx:achievement-claimed', {
    detail: { id: achievementId, reward, totalClaimed: claimed },
  }));

  return { ok: true, reward, xp: getXPData() };
}

export function createAchievementConfetti(rootEl) {
  if (!rootEl) return;
  rootEl.classList.remove('hx-achievement-burst');
  void rootEl.offsetWidth;
  rootEl.classList.add('hx-achievement-burst');
}
