// hexacoreXP.js — XP & Player Level system for Hexacore

const HX_XP_KEY = 'hexacore_player_xp';

// Base XP per word length
const XP_BY_LENGTH = { 4: 10, 5: 20, 6: 35, 7: 55, 8: 80, 9: 110 };

/**
 * Maximum player level.
 */
export const HX_MAX_LEVEL = 25;

/**
 * Cumulative XP required to *reach* each level (index = level - 1).
 *
 * Built with an exponential curve: each level requires ×1.25 more XP
 * than the previous one, starting at 80 XP for the first level-up.
 *
 *   LV  2 :     80 XP total  (needs    80)
 *   LV  5 :    461 XP total  (needs   156)
 *   LV 10 :  2 063 XP total  (needs   477)
 *   LV 15 :  6 952 XP total  (needs 1 454)
 *   LV 20 : 21 873 XP total  (needs 4 439)
 *   LV 25 : 67 406 XP total  (needs 13 545)
 */
const HX_XP_THRESHOLDS = [
      0,   //  LV  1
     80,   //  LV  2
    180,   //  LV  3
    305,   //  LV  4
    461,   //  LV  5
    656,   //  LV  6
    900,   //  LV  7
  1_205,   //  LV  8
  1_586,   //  LV  9
  2_063,   //  LV 10
  2_659,   //  LV 11
  3_404,   //  LV 12
  4_335,   //  LV 13
  5_498,   //  LV 14
  6_952,   //  LV 15
  8_770,   //  LV 16
 11_042,   //  LV 17
 13_883,   //  LV 18
 17_434,   //  LV 19
 21_873,   //  LV 20
 27_421,   //  LV 21
 34_356,   //  LV 22
 43_025,   //  LV 23
 53_861,   //  LV 24
 67_406,   //  LV 25
];

/**
 * Cumulative XP required to reach the given level (1-indexed).
 * Levels beyond HX_MAX_LEVEL return the max threshold (player is capped).
 */
export function getXPForLevel(level) {
  if (level <= 1) return 0;
  if (level > HX_MAX_LEVEL) return HX_XP_THRESHOLDS[HX_MAX_LEVEL - 1];
  return HX_XP_THRESHOLDS[level - 1];
}

/** Derive the player level from a raw XP total (capped at HX_MAX_LEVEL). */
export function getLevelForXP(xp) {
  let level = 1;
  while (level < HX_MAX_LEVEL && HX_XP_THRESHOLDS[level] <= xp) level++;
  return level;
}

export function loadXPData() {
  try {
    const json = localStorage.getItem(HX_XP_KEY);
    if (!json) return { xp: 0, level: 1 };
    const data = JSON.parse(json);
    return { xp: data.xp ?? 0, level: data.level ?? 1 };
  } catch (_) {
    return { xp: 0, level: 1 };
  }
}

export function saveXPData(xp, level) {
  try {
    localStorage.setItem(HX_XP_KEY, JSON.stringify({ xp, level }));
  } catch (_) { /* quota / private */ }
}

export function getXPData() {
  return loadXPData();
}

/**
 * Calculate the XP earned for a submitted word.
 * @param {string} word - resolved word string
 * @param {Array}  tiles - array of tile objects used
 */
export function calcWordXP(word, tiles) {
  const len = word.length;
  let base = XP_BY_LENGTH[Math.min(len, 9)] ?? 110;
  if (len >= 10) base = 150 + (len - 10) * 20;

  tiles.forEach(t => {
    switch (t.tileType) {
      case 'prism':   base += 5; break;
      case 'rune':    base += 8; break;
      case 'ember':   base += 5; break;
      case 'digraph': base += 3; break;
      default:
        if (t.tileType && t.tileType.startsWith('gem')) base += 2;
    }
  });

  return base;
}

/**
 * Add XP to the player's total. Returns {newXp, newLevel, leveledUp}.
 * Level is capped at HX_MAX_LEVEL — XP continues to accumulate.
 * @param {number} amount
 */
export function addXP(amount) {
  const data = loadXPData();
  const newXp = data.xp + amount;
  const newLevel = getLevelForXP(newXp);
  const leveledUp = newLevel > data.level;
  saveXPData(newXp, newLevel);
  return { newXp, newLevel, leveledUp };
}

/**
 * Update the XP bar element in the HUD.
 * Called after every XP gain or on HUD init.
 */
export function updateXPBar() {
  const wrap      = document.getElementById('hx-level-wrap');
  const container = document.getElementById('hx-xp-bar-container');
  const fill      = document.getElementById('hx-xp-bar-fill');
  const label     = document.getElementById('hx-xp-label');
  if (!container || !fill || !label) return;

  const { xp, level } = loadXPData();
  const atMax = level >= HX_MAX_LEVEL;

  const currThresh = getXPForLevel(level);
  const nextThresh = atMax ? currThresh : getXPForLevel(level + 1);
  const pct = atMax
    ? 100
    : (nextThresh > currThresh
        ? Math.min(100, ((xp - currThresh) / (nextThresh - currThresh)) * 100)
        : 100);

  // Animate fill via scaleX so the full-width gradient naturally reveals color
  fill.style.transform = `scaleX(${pct / 100})`;

  if (atMax) {
    label.textContent = `LV ${HX_MAX_LEVEL} · MAX`;
  } else {
    const xpInLevel = xp - currThresh;
    const xpNeeded  = nextThresh - currThresh;
    label.textContent = `LV ${level} · ${xpInLevel}/${xpNeeded} XP`;
  }

  // Keep the Hexacore HUD button in its menu state
  const lvlBtn = document.getElementById('hx-level-hud');
  if (lvlBtn) {
    lvlBtn.textContent = 'MENU';
    lvlBtn.title = 'Open Hexacore settings';
    lvlBtn.setAttribute('aria-label', 'Open Hexacore settings');
  }

  // Accessibility
  container.setAttribute('aria-valuenow', Math.round(pct));
  if (atMax) {
    container.setAttribute('aria-label', `Player level ${HX_MAX_LEVEL} — MAX LEVEL`);
    if (wrap) wrap.title = `LV ${HX_MAX_LEVEL} — MAX LEVEL`;
  } else {
    const xpInLevel = xp - currThresh;
    const xpNeeded  = nextThresh - currThresh;
    container.setAttribute('aria-label', `Player level ${level} — ${xpInLevel} of ${xpNeeded} XP`);
    if (wrap) wrap.title = `LV ${level} — ${xpInLevel} / ${xpNeeded} XP to next level`;
  }

  // Dynamic glow intensity on the level wrap based on fill percentage
  if (wrap) {
    wrap.classList.remove('hx-xp-glow-mid', 'hx-xp-glow-high', 'hx-xp-glow-full');
    if (pct >= 90)      wrap.classList.add('hx-xp-glow-full');
    else if (pct >= 60) wrap.classList.add('hx-xp-glow-high');
    else if (pct >= 30) wrap.classList.add('hx-xp-glow-mid');
  }
}

