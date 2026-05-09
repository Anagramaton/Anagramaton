// hexacoreStats.js — Hexacore stats tracking + chart data helpers

import { getXPData, getXPForLevel, HX_MAX_LEVEL } from './hexacoreXP.js';

const HX_STATS_KEY = 'hexacore_stats_v1';
const MAX_HISTORY = 100;

const DEFAULT_STATS = {
  totalGames: 0,
  totalWords: 0,
  totalScore: 0,
  totalBestCombos: 0,
  bestWordScore: 0,
  longestWordLength: 0,
  bestLevel: 1,
  totalAchievementClaims: 0,
  tileUsage: {},
  gemsByType: {},
  sessions: [],
};

function safeNumber(v, fallback = 0) {
  return Number.isFinite(v) ? v : fallback;
}

export function getStats() {
  try {
    const raw = localStorage.getItem(HX_STATS_KEY);
    if (!raw) return structuredClone(DEFAULT_STATS);
    const parsed = JSON.parse(raw);
    return {
      ...structuredClone(DEFAULT_STATS),
      ...parsed,
      tileUsage: { ...DEFAULT_STATS.tileUsage, ...(parsed?.tileUsage || {}) },
      gemsByType: { ...DEFAULT_STATS.gemsByType, ...(parsed?.gemsByType || {}) },
      sessions: Array.isArray(parsed?.sessions) ? parsed.sessions.slice(-MAX_HISTORY) : [],
    };
  } catch (_) {
    return structuredClone(DEFAULT_STATS);
  }
}

function saveStats(stats) {
  try { localStorage.setItem(HX_STATS_KEY, JSON.stringify(stats)); } catch (_) {}
}

export function saveSessionHistory(session) {
  const stats = getStats();
  const entry = {
    date: session?.date || new Date().toISOString(),
    score: safeNumber(session?.score),
    words: safeNumber(session?.words),
    level: Math.max(1, safeNumber(session?.level, 1)),
    mode: session?.mode || 'endless',
    tileUsage: session?.tileUsage || {},
    expanded: false,
  };
  stats.sessions.push(entry);
  if (stats.sessions.length > MAX_HISTORY) stats.sessions = stats.sessions.slice(-MAX_HISTORY);
  saveStats(stats);
  return entry;
}

export function updateStats({ sessionScore = 0, sessionWords = 0 } = {}) {
  const stats = getStats();
  // Legacy hook kept for compatibility with existing integration points.
  // Word/score/game counters are updated by updateStatTracking events.
  void sessionScore;
  void sessionWords;
  saveStats(stats);
  return stats;
}

function trackTiles(stats, tiles = []) {
  tiles.forEach(tile => {
    const type = tile?.tileType || 'normal';
    stats.tileUsage[type] = safeNumber(stats.tileUsage[type]) + 1;
    if (String(type).startsWith('gem')) {
      stats.gemsByType[type] = safeNumber(stats.gemsByType[type]) + 1;
    }
  });
}

export function updateStatTracking(eventType, data = {}) {
  const stats = getStats();

  if (eventType === 'wordSubmitted') {
    const wordLen = (data?.word || '').length;
    stats.totalWords += 1;
    stats.longestWordLength = Math.max(stats.longestWordLength, wordLen);
    stats.bestWordScore = Math.max(stats.bestWordScore, safeNumber(data?.score));
    stats.bestLevel = Math.max(stats.bestLevel, safeNumber(data?.gameLevel, 1));
    if (data?.portalUsed) {
      stats.tileUsage.portal = safeNumber(stats.tileUsage.portal) + 1;
    }
    trackTiles(stats, data?.tiles || []);
  }

  if (eventType === 'gameOver') {
    stats.totalGames += 1;
    stats.totalScore += safeNumber(data?.score);
    stats.bestLevel = Math.max(stats.bestLevel, safeNumber(data?.level, 1));
  }

  if (eventType === 'achievementClaimed') {
    stats.totalAchievementClaims += 1;
  }

  saveStats(stats);
  return stats;
}

export function getSessionHistory() {
  return getStats().sessions.slice().reverse();
}

export function getStatsSummary() {
  const stats = getStats();
  const avgScore = stats.totalGames > 0 ? Math.round(stats.totalScore / stats.totalGames) : 0;
  return {
    ...stats,
    averageScore: avgScore,
  };
}

function toEntries(obj) {
  return Object.entries(obj || {}).map(([label, value]) => ({ label, value: safeNumber(value) }));
}

export function getChartData() {
  const stats = getStatsSummary();
  const { xp, level } = getXPData();
  const curr = getXPForLevel(level);
  const next = level >= HX_MAX_LEVEL ? curr : getXPForLevel(level + 1);
  const pct = next > curr ? Math.max(0, Math.min(100, ((xp - curr) / (next - curr)) * 100)) : 100;

  const sortedTileUsage = toEntries(stats.tileUsage)
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  const sessionsChrono = stats.sessions.slice(-20);
  const scoreSeries = sessionsChrono.map((s, i) => ({ x: i + 1, y: safeNumber(s.score) }));
  const wordsSeries = sessionsChrono.map((s, i) => ({ x: i + 1, y: safeNumber(s.words) }));
  const gemSeries = toEntries(stats.gemsByType).sort((a, b) => b.value - a.value);

  return {
    xpProgress: {
      level,
      xp,
      pct,
      currentLevelXP: Math.max(0, xp - curr),
      nextLevelXP: Math.max(0, next - curr),
    },
    tileUsageBars: sortedTileUsage,
    scoreSparkline: scoreSeries,
    wordsPerSession: wordsSeries,
    gemDistribution: gemSeries,
  };
}
