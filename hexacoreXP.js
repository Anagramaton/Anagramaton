// hexacoreXP.js — XP & Player Level system for Hexacore

const HX_XP_KEY = 'hexacore_player_xp';

// Base XP per word length
const XP_BY_LENGTH = { 4: 10, 5: 20, 6: 35, 7: 55, 8: 80, 9: 110 };

/**
 * XP required to reach a given level.
 * Formula: threshold(n) = n * (n-1) * 40
 * Level 1 = 0, Level 2 = 80, Level 3 = 240, Level 4 = 480, Level 5 = 800 …
 */
export function getXPForLevel(level) {
  if (level <= 1) return 0;
  return level * (level - 1) * 40;
}

/** Derive the player level from a raw XP total. */
export function getLevelForXP(xp) {
  let level = 1;
  while (getXPForLevel(level + 1) <= xp) level++;
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
  const currThresh = getXPForLevel(level);
  const nextThresh = getXPForLevel(level + 1);
  const pct = nextThresh > currThresh
    ? Math.min(100, ((xp - currThresh) / (nextThresh - currThresh)) * 100)
    : 100;

  // Animate fill via scaleX so the full-width gradient naturally reveals color
  fill.style.transform = `scaleX(${pct / 100})`;

  const xpInLevel  = xp - currThresh;
  const xpNeeded   = nextThresh - currThresh;
  label.textContent = `LV ${level} · ${xpInLevel}/${xpNeeded} XP`;

  // Accessibility
  container.setAttribute('aria-valuenow', Math.round(pct));
  container.setAttribute('aria-label', `Player level ${level} — ${xpInLevel} of ${xpNeeded} XP`);
  if (wrap) wrap.title = `LV ${level} — ${xpInLevel} / ${xpNeeded} XP to next level`;

  // Dynamic glow intensity on the level wrap based on fill percentage
  if (wrap) {
    wrap.classList.remove('hx-xp-glow-mid', 'hx-xp-glow-high', 'hx-xp-glow-full');
    if (pct >= 90)      wrap.classList.add('hx-xp-glow-full');
    else if (pct >= 60) wrap.classList.add('hx-xp-glow-high');
    else if (pct >= 30) wrap.classList.add('hx-xp-glow-mid');
  }
}
