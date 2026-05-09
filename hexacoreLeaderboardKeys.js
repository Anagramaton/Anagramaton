// hexacoreLeaderboardKeys.js — Hexacore leaderboard partition helpers

export const HX_LEADERBOARD_RESET_VERSION = '2026_05';
const HX_RESET_MARKER_KEY = `hexacore_leaderboard_reset_marker_${HX_LEADERBOARD_RESET_VERSION}`;

export const HX_ALL_TIME_LEADERBOARD_ID = `hexacore_${HX_LEADERBOARD_RESET_VERSION}`;
export const HX_DAILY_LEADERBOARD_PREFIX = `hexacore_daily_${HX_LEADERBOARD_RESET_VERSION}_`;
export const HX_WEEKLY_LEADERBOARD_PREFIX = `hexacore_weekly_${HX_LEADERBOARD_RESET_VERSION}_`;

export function getHexacoreAllTimeLeaderboardId() {
  return HX_ALL_TIME_LEADERBOARD_ID;
}

export function getHexacoreDailyLeaderboardId(todayString) {
  return `${HX_DAILY_LEADERBOARD_PREFIX}${String(todayString || '').trim()}`;
}

export function getHexacoreWeeklyLeaderboardId(weekString) {
  return `${HX_WEEKLY_LEADERBOARD_PREFIX}${String(weekString || '').trim()}`;
}

export function normalizeHexacoreLeaderboardId(rawLeaderboardId) {
  const id = String(rawLeaderboardId || '').trim();

  if (!id || id === 'hexacore') return HX_ALL_TIME_LEADERBOARD_ID;
  if (id === HX_ALL_TIME_LEADERBOARD_ID) return id;

  if (id.startsWith(HX_DAILY_LEADERBOARD_PREFIX)) {
    return id.length > HX_DAILY_LEADERBOARD_PREFIX.length ? id : HX_ALL_TIME_LEADERBOARD_ID;
  }
  if (id.startsWith(HX_WEEKLY_LEADERBOARD_PREFIX)) {
    return id.length > HX_WEEKLY_LEADERBOARD_PREFIX.length ? id : HX_ALL_TIME_LEADERBOARD_ID;
  }

  return HX_ALL_TIME_LEADERBOARD_ID;
}

export function getHexacoreRankBadgeLabel(rankIndex) {
  if (rankIndex === 0) return '🥇';
  if (rankIndex === 1) return '🥈';
  if (rankIndex === 2) return '🥉';
  return String(rankIndex + 1);
}

export function resetHexacoreLeaderboardStorage() {
  try {
    if (typeof localStorage === 'undefined') return false;

    // Marker means reset already ran for this version; nothing else to do.
    if (localStorage.getItem(HX_RESET_MARKER_KEY)) return false;

    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (key === 'hexacore' || key.startsWith('hexacore_daily_') || key.startsWith('hexacore_weekly_')) {
        if (
          key !== HX_ALL_TIME_LEADERBOARD_ID &&
          !key.startsWith(HX_DAILY_LEADERBOARD_PREFIX) &&
          !key.startsWith(HX_WEEKLY_LEADERBOARD_PREFIX)
        ) {
          keysToRemove.push(key);
        }
      }
    }

    keysToRemove.forEach((key) => localStorage.removeItem(key));
    localStorage.setItem(HX_RESET_MARKER_KEY, '1');
    return keysToRemove.length > 0;
  } catch (_) {
    return false;
  }
}
