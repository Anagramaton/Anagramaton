// hexacoreBadges.js — Hexacore badge + title system

const HX_BADGES_KEY = 'hexacore_badges_v1';
const HX_SELECTED_TITLE_KEY = 'hexacore_selected_title';

export const BADGE_DEFINITIONS = [
  { id: 'badge_top10', name: 'Top 10', desc: 'Reached top 10 on leaderboard', icon: '🏆', rarity: 'epic', type: 'leaderboard' },
  { id: 'badge_level25', name: 'Level 25', desc: 'Reached player level 25', icon: '⭐', rarity: 'rare', type: 'milestone', condition: { type: 'level', target: 25 } },
  { id: 'badge_level10', name: 'Level 10', desc: 'Reached player level 10', icon: '✨', rarity: 'common', type: 'milestone', condition: { type: 'level', target: 10 } },
  { id: 'title_ember_hunter', name: 'Ember Hunter', displayTitle: '🔥 Ember Hunter', desc: 'Used 100 Ember tiles', icon: '🔥', rarity: 'common', type: 'title', condition: { type: 'tileUsage:ember', target: 100 } },
  { id: 'title_lexicon_sage', name: 'Lexicon Sage', displayTitle: '🎓 Lexicon Sage', desc: 'Submit 500 words', icon: '🎓', rarity: 'rare', type: 'title', condition: { type: 'totalWords', target: 500 } },
];

function defaults() {
  return Object.fromEntries(BADGE_DEFINITIONS.map(b => [b.id, { unlocked: false, unlockedAt: null }]));
}

function loadState() {
  try {
    const raw = localStorage.getItem(HX_BADGES_KEY);
    if (!raw) return defaults();
    return { ...defaults(), ...JSON.parse(raw) };
  } catch (_) {
    return defaults();
  }
}

function saveState(state) {
  try { localStorage.setItem(HX_BADGES_KEY, JSON.stringify(state)); } catch (_) {}
}

function unlockBadge(id) {
  const state = loadState();
  if (!state[id] || state[id].unlocked) return false;
  state[id].unlocked = true;
  state[id].unlockedAt = new Date().toISOString();
  saveState(state);
  return true;
}

export function getBadgeDefinitions() {
  return BADGE_DEFINITIONS.slice();
}

export function getBadgesWithState() {
  const state = loadState();
  return BADGE_DEFINITIONS.map(b => ({ ...b, ...state[b.id] }));
}

export function checkMilestoneBadges(newLevel) {
  BADGE_DEFINITIONS
    .filter(b => b.condition?.type === 'level' && newLevel >= b.condition.target)
    .forEach(b => unlockBadge(b.id));
}

export function updateBadgeProgress(metrics = {}) {
  BADGE_DEFINITIONS.forEach(badge => {
    const cond = badge.condition;
    if (!cond) return;
    if (cond.type === 'totalWords' && (metrics.totalWords || 0) >= cond.target) unlockBadge(badge.id);
    if (cond.type === 'tileUsage:ember' && (metrics.tileUsage?.ember || 0) >= cond.target) unlockBadge(badge.id);
  });
}

export function getSelectedTitle() {
  try {
    return localStorage.getItem(HX_SELECTED_TITLE_KEY) || '';
  } catch (_) {
    return '';
  }
}

export function getAvailableTitles() {
  return getBadgesWithState()
    .filter(b => b.type === 'title' && b.unlocked)
    .map(b => ({ id: b.id, name: b.name, displayTitle: b.displayTitle || b.name }));
}

export function setSelectedTitle(titleId) {
  const titles = getAvailableTitles();
  const selected = titles.find(t => t.id === titleId);
  if (!selected && titleId) return false;
  try {
    localStorage.setItem(HX_SELECTED_TITLE_KEY, titleId || '');
  } catch (_) {
    return false;
  }
  document.dispatchEvent(new CustomEvent('hx:title-changed', { detail: { titleId: titleId || '' } }));
  return true;
}

export function getSelectedDisplayTitle() {
  const selected = getSelectedTitle();
  if (!selected) return '';
  const title = getAvailableTitles().find(t => t.id === selected);
  return title?.displayTitle || '';
}

export function formatPlayerNameWithTitle(name) {
  const title = getSelectedDisplayTitle();
  if (!title) return name;
  return `${title} ${name}`;
}
