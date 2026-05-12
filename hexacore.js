// hexacore.js — Hexacore endless word game mode for Anagramaton

/**
 * BREAKPOINT RULE — ALWAYS REQUIRED FOR EVERY PR
 * Any JS that injects or manipulates DOM elements, modals, overlays,
 * toasts, HUD components, or tile visuals MUST be paired with CSS
 * breakpoint rules covering ≤900 px, ≤640 px, ≤430 px (and ≤375 px
 * where needed).  Use clamp() for font sizes and spacing.
 * Always test at 375 px, 430 px, 640 px, and 900 px viewport widths.
 */

import {
  GRID_RADIUS,
  HEX_RADIUS,
  SVG_NS,
} from './constants.js';
import { isValidWord } from './gameLogic.js';
import { createTile }  from './tileFactory.js';
import {
  submitScore,
  fetchLeaderboard,
  getPlayerName,
  promptPlayerName,
} from './leaderboard.js';
import { Hex, Layout, Point } from './gridLayout.js';
import { OrientationPointy }  from './gridOrientation.js';
import { initSvg }            from './svgKit.js';
import { unlockAudioContext, preloadBuffers, playSound, stopSound } from './audioEngine.js';
import { getXPData, addXP, calcWordXP, getXPForLevel, updateXPBar as updateXPBarFn, HX_MAX_LEVEL } from './hexacoreXP.js';
import { getDailyQuests, getWeeklyQuest, updateQuestProgress, openQuestsModal, initQuests, showQuestCompleteToast } from './hexacoreQuests.js';
import { openLeaderboardsModal } from './hexacoreLeaderboards.js';
import { getCampaignProgress, openCampaignModal, startCampaignLevel, updateCampaignProgress } from './hexacoreCampaign.js';
import { getProfile, updateProfile, openProfileModal } from './hexacoreProfile.js';
import { updateAchievementProgress } from './hexacoreAchievements.js';
import { updateStatTracking, saveSessionHistory, updateStats } from './hexacoreStats.js';
import { openModeSelectModal } from './hexacoreModeSelect.js';

const HX_LEADERBOARD_ID = 'hexacore';

/* ── Hexacore-specific letter point values ─────────────────────── */
const HX_LETTER_POINTS = {
  A: 2, E: 2, I: 2, O: 2,
  U: 3, R: 3, S: 3, T: 3, L: 3, N: 3,
  D: 4, H: 4, Y: 4, G: 4,
  C: 5, M: 5, P: 5,
  K: 6,
  B: 7, F: 7,
  V: 8,
  W: 9, J: 9,
  Q: 10, X: 10, Z: 10,
};

/* ── Hexacore-specific word length multipliers ──────────────────── */
const HX_LENGTH_MULTIPLIERS = {
  4: 2, 5: 5, 6: 6, 7: 7, 8: 8, 9: 9,
  10: 10, 11: 11, 12: 12, 13: 13, 14: 14, 15: 15,
};

/* ── Audio state ───────────────────────────────────────────────── */
let _hxAudioReady = false;

/* ── Layout constants ──────────────────────────────────────────── */
const TILE_SPACING             = 1.25;
const INTRO_ARC_OFFSET         = 60;   // px: horizontal fan spread during pour-in arc
const REFILL_STAGGER_MS        = 40;   // ms between each column's spawn delay

/* ── Level thresholds ──────────────────────────────────────────── */
const HX_LEVEL_THRESHOLDS = [0, 1000, 5000, 15000, 35000, 70000, 120000, 180000, 250000, 330000, 420000];

/* ── localStorage save keys ────────────────────────────────────── */
const HX_SAVE_KEY = 'hexacore_save';
const HX_REQ_SAVE_KEY = 'hexacore_requirements';
const HX_TUTORIAL_SAVE_KEY = 'hexacore_tutorial_v1';

/* ── Game mode flag (set by startHexacore) ─────────────────────── */
let hxGameMode = null; // 'endless' | 'daily' | 'campaign'
const HX_VALID_MODES = ['endless', 'daily', 'campaign'];
const HX_DAILY_MODE_ID = 'hexacore_daily';
let _hxSavedTheme = null;  // stores the user's theme before Hexacore forces dark

/* ── Gem tile type set (module-level for shared use) ───────────── */
const HX_GEM_TYPES = new Set([
  'gemEmerald', 'gemGold', 'gemSapphire',
  'gemPearl', 'gemTanzanite', 'gemRuby', 'gemDiamond',
  'gemAquamarine', 'gemTopaz', 'gemOpal', 'gemImperialJade', 'gemAlexandrite',
]);
// Level 1 starts at 0, Level 2 at 1,000, Level 3 at 5,000, etc.
// Beyond index 10 (Level 11), each additional level requires +100,000 pts from the previous threshold.

function hxLevelThreshold(level) {
  if (level <= HX_LEVEL_THRESHOLDS.length) return HX_LEVEL_THRESHOLDS[level - 1];
  // Beyond defined thresholds: extrapolate +100000 per level
  return HX_LEVEL_THRESHOLDS[HX_LEVEL_THRESHOLDS.length - 1] + (level - HX_LEVEL_THRESHOLDS.length) * 100000;
}

/* ── Animation timing constants (easy to tune) ─────────────────── */
const WORD_TILE_STAGGER_MS      = 55;  // ms stagger between each consumed tile pop-out
const REFILL_COL_TILE_STAGGER_MS = 40; // ms stagger between tiles within a refill column
const SCORE_TICK_MS             = 700; // ms duration for score count-up animation
const HX_TITLE_TEXT             = 'HEXACORE';
const HX_TITLE_ELEMENT_IDS      = ['game-title', 'game-title-mirror'];
let hxTitlePatternHistory   = []; // last 3 pattern IDs — prevents repeating a recent pattern

/* ── Achievement tile unlock thresholds ────────────────────────── */
const ORACLE_UNLOCK_WORD_LENGTH    = 9;      // 9-letter word → Oracle spawns
const BEACON_UNLOCK_SCORE          = 10000;  // 10,000+ pts single word → Beacon spawns
const ECLIPSE_UNLOCK_PORTAL_WORDS  = 3;      // portal used in 3+ words → Eclipse spawns
const LODESTONE_UNLOCK_GEM_TYPES   = 5;      // 5 different gem types in one word → Lodestone spawns
const LEXICON_UNLOCK_WORDS         = 100;    // 100 total words submitted → Lexicon spawns

const HX_ACHIEVEMENT_TILE_ORDER = ['oracle', 'beacon', 'eclipse', 'lodestone', 'lexicon'];
const HX_ACHIEVEMENT_TILE_META = {
  oracle: {
    label: 'Oracle',
    letter: 'O',
    intro: 'Achievement tile "O": use it in a 5+ letter word to gain Oracle Sight.',
  },
  beacon: {
    label: 'Beacon',
    letter: 'B',
    intro: 'Achievement tile "B": use it in a 5+ letter word to gain Beacon Burst.',
  },
  eclipse: {
    label: 'Eclipse',
    letter: 'E',
    intro: 'Achievement tile "E": use it in a 5+ letter word to invert letter values once.',
  },
  lodestone: {
    label: 'Lodestone',
    letter: 'L',
    intro: 'Achievement tile "L": use it in a 5+ letter word to boost your next gem bonus.',
  },
  lexicon: {
    label: 'Lexicon',
    letter: 'X',
    intro: 'Achievement tile "X": use it in a 5+ letter word to reveal top scoring words.',
  },
};

/* ── Achievement power-up timing constants ─────────────────────── */
const ORACLE_HIGHLIGHT_DURATION_MS   = 5000;  // ms tiles stay highlighted by Oracle
const BEACON_TOAST_DURATION_MS       = 5000;  // ms Beacon toast remains visible
const LEXICON_MODAL_AUTO_DISMISS_MS  = 12000; // ms before Lexicon modal auto-closes
const ACHIEVEMENT_TOAST_STAGGER_MS   = 2000;  // ms stagger between achievement toasts

/* ── Board analysis constants ───────────────────────────────────── */
const HX_MAX_LETTER_POINTS          = 10;   // highest point value in HX_LETTER_POINTS
const MAX_WORD_PATH_DEPTH           = 9;    // max tiles per path in board DFS
const ORACLE_MAX_RESULTS            = 50;
const ORACLE_TIME_LIMIT_MS          = 1200;
const BEACON_MAX_RESULTS            = 50;
const BEACON_TIME_LIMIT_MS          = 1200;
const LEXICON_MAX_RESULTS           = 200;
const LEXICON_TIME_LIMIT_MS         = 1500;
const DAILY_ENDCHECK_MAX_RESULTS    = 1;
const DAILY_ENDCHECK_TIME_LIMIT_MS  = 300;

/* ── Letter pool — mirrors Scrabble tile distribution for maximum playability ──
 * Counts sourced from: https://norvig.com/scrabble-letter-scores.html
 * High-frequency vowels + consonants ensure dense playable word coverage.
 * Digraph slots (~15%) are drawn from DIGRAPH_POOL at tile-creation time.      */
const HX_LETTER_POOL = [
  // Vowels (~29 total, reduced from 42 to accommodate digraph slots)
  ...Array(8).fill('E'),   //  8
  ...Array(6).fill('A'),   //  6
  ...Array(6).fill('I'),   //  6
  ...Array(6).fill('O'),   //  6
  ...Array(3).fill('U'),   //  3

  // High-frequency consonants (~48 total, reduced from 56)
  ...Array(5).fill('N'),   //  5
  ...Array(5).fill('R'),   //  5
  ...Array(5).fill('T'),   //  5
  ...Array(3).fill('L'),   //  3
  ...Array(3).fill('S'),   //  3
  ...Array(3).fill('D'),   //  3

  // Mid-frequency consonants
  ...Array(3).fill('G'),   //  3
  ...Array(3).fill('B'),   //  3
  ...Array(3).fill('C'),   //  3
  ...Array(3).fill('F'),   //  3
  ...Array(3).fill('H'),   //  3
  ...Array(3).fill('M'),   //  3
  ...Array(2).fill('P'),   //  2
  ...Array(2).fill('V'),   //  2
  ...Array(2).fill('W'),   //  2
  'Y',                     //  1

  // Rare letters — 1 each (still possible, not dominant)
  'J', 'K', 'Q', 'X', 'Z',

  // Digraph slots — sentinel value; resolved to a random digraph at draw time
  ...Array(15).fill('__DIGRAPH__'),  // 15
];

/* ── Digraph pool — double-letter bonus tiles ───────────────────── */
const DIGRAPH_POOL = [
  'TH', 'HE', 'IN', 'ER', 'RE', 'ST', 'AN', 'ON', 'EA', 'TT',
  'SS', 'IO', 'LL', 'QU', 'CK', 'CH', 'EN', 'AN', 'AS', 'CO',
  'LY', 'AL', 'LE', 'ED', 'ES', 'UN', 'GH', 'CR', 'WH', 'NT', 'NC',
  'NG', 'TY', 'RY',
];

/** Preferred neighbor letters for each digraph — tuned for common 6–10 letter
 *  English suffixes: -ING, -TION, -NESS, -MENT, -LESS, -ABLE, -STER, -ATED */
const DIGRAPH_COMPLEMENT = {
  TH: ['E','R','A','I','O','N','S','G'],
  HE: ['R','S','N','D','L','A','T'],
  IN: ['G','S','T','K','D','E','L'],
  ER: ['S','T','N','D','G','L','A','M'],
  RE: ['S','T','N','D','A','L','C','M'],
  ST: ['A','E','I','O','R','L','N','S'],
  AN: ['S','T','D','G','E','C','I','L'],
  ON: ['S','E','T','G','L','D','C'],
  EA: ['R','S','T','D','N','L','M'],
  TT: ['E','A','I','O','R','L','N'],
  SS: ['E','I','A','O','N','T','L'],
  IO: ['N','S','T','R','L'],
  LL: ['E','A','I','O','S','Y','N'],
  QU: ['I','E','A','O','T','R','N'],
  CK: ['E','I','A','S','L','N'],
  CH: ['E','A','I','O','R','S','N'],
  EN: ['S','T','D','G','C','L','E'],
  AS: ['T','S','E','H','K','P'],
  CO: ['N','M','R','L','S','T','D'],
  ES: ['T','L','N','D','S'],
  UN: ['D','S','T','E','I','A','G'],
  LY: ['I','E','N','S','T','B','F','H'],
  AL: ['L','S','T','E','I','D'],
  LE: ['S','T','D','N','A','R'],
  ED: ['S','T','L','N','G','A','I'],
  GH: ['T','S','E','A','O'],
  CR: ['A','E','I','O','S','T'],
  WH: ['A','E','I','O','N','T'],
  NT: ['S','E','I','A','O','L','R'],
  NC: ['E','I','A','H','L'],
  NG: ['S','T','E','I','A','L','R'],
  TY: ['P','S','R','L','E','A'],
  RY: ['S','T','E','I','A','L'],
};

function randomDigraph() {
  const dg  = DIGRAPH_POOL[Math.floor(Math.random() * DIGRAPH_POOL.length)];
  const pts = (HX_LETTER_POINTS[dg[0]] || 1) + (HX_LETTER_POINTS[dg[1]] || 1);
  return { digraph: dg, points: pts };
}

/* ── Portal system ─────────────────────────────────────────────── */
/** The 6 corner tiles of the radius-4 hex grid that may become portals. */
const HX_PORTAL_CORNERS = [
  { q: -2, r:  4 },
  { q:  2, r:  4 },
  { q:  4, r:  0 },
  { q:  2, r: -4 },
  { q: -2, r: -4 },
  { q: -4, r:  0 },
];

/* ── Module-level state ────────────────────────────────────────── */
const hxState = {
  score:           0,
  level:           1,
  words:           [],
  tiles:           [],
  emberTiles:      [],
  prismTiles:      [],
  runeTiles:       [],
  digraphTiles:    [],
  gemEmeraldTiles:   [],
  gemGoldTiles:      [],
  gemSapphireTiles:  [],
  gemPearlTiles:     [],
  gemTanzaniteTiles: [],
  gemRubyTiles:      [],
  gemDiamondTiles:   [],
  gemAquamarineTiles:   [],
  gemTopazTiles:        [],
  gemOpalTiles:         [],
  gemImperialJadeTiles: [],
  gemAlexandriteTiles:  [],
  amethystTiles:   [],
  seleniteTiles:   [],
  oracleTiles:     [],
  beaconTiles:     [],
  eclipseTiles:    [],
  lodestoneTiles:  [],
  lexiconTiles:    [],
  amethystCount:   0,
  seleniteCount:   0,
  oracleCount:     0,
  beaconCount:     0,
  eclipseCount:    0,
  lodestoneCount:  0,
  lexiconCount:    0,
  gameOver:        false,
  active:          false,

  // Active power-up effect flags
  eclipseActive:   false,  // next word uses inverted letter values
  lodestoneActive: false,  // next word grants +1 reuse multiplier bonus

  // Achievement tracking (per session)
  achievements: {
    portalWordsUsed:    0,   // number of words submitted using the portal
    oracleAwarded:      false,
    beaconAwarded:      false,
    eclipseAwarded:     false,
    lodestoneAwarded:   false,
    lexiconAwarded:     false,
  },

  // Portal system
  wordsSubmitted: 0,      // total words successfully submitted this session
  portalOpen:     false,  // whether a portal pair is currently active
  portalUsed:     false,  // whether the portal was traversed (closed on next word)
  portalEntry:    null,   // { q, r, s } coordinate of the entry portal tile
  portalExit:     null,   // { q, r, s } coordinate of the exit portal tile
  portalWordsRemaining: 0, // words left before portal auto-closes (3 when opened)
  dailyBoardDate: null,
  dailyMetadata: null,
  dailyStartMs: 0,
  dailySubmitted: false,
  dailyFinalScore: 0,
  dailyPenalty: 0,
  dailyTilesUsed: 0,
};

// Maps each tile object → the hxState type-array it belongs to (single O(1) lookup on removal)
const _hxTileTypeRegistry = new Map();

function _hxRegisterTile(tile, typeArray) {
  typeArray.push(tile);
  _hxTileTypeRegistry.set(tile, typeArray);
}

/**
 * Removes a tile's type registration without touching hxState.tiles or hxTileMap.
 * Used when converting a tile to a different type (it stays on the board).
 * All tiles that carry a type are guaranteed to be in the registry (registered
 * via _hxRegisterTile at creation time), so no fallback is needed.
 */
function _hxClearTileType(tile) {
  const typeArr = _hxTileTypeRegistry.get(tile);
  if (typeArr) {
    const idx = typeArr.indexOf(tile);
    if (idx !== -1) typeArr.splice(idx, 1);
    _hxTileTypeRegistry.delete(tile);
  }
}

function _hxUnregisterTile(tile) {
  // Remove from the master tiles list
  const tilesIdx = hxState.tiles.indexOf(tile);
  if (tilesIdx !== -1) hxState.tiles.splice(tilesIdx, 1);
  // Remove from its specific type array (one lookup instead of 20 scans)
  const typeArr = _hxTileTypeRegistry.get(tile);
  if (typeArr) {
    const idx = typeArr.indexOf(tile);
    if (idx !== -1) typeArr.splice(idx, 1);
    _hxTileTypeRegistry.delete(tile);
  }
  hxTileMap.delete(hxKey(tile.q, tile.r));
}

let hxSelected          = [];   // tiles in current selection chain
let hxPointerDown       = false;
let hxLayout            = null;
let hxSvg               = null;
let hxWordCount         = 0;
let hxNextPrismSpawn    = Math.floor(Math.random() * 3) + 4; // random 4–6
let hxTileMap           = new Map(); // `q,r` → tile object
/** Keyed by `q,r` — letters preferred for that position due to an adjacent digraph placed earlier */
let pendingDigraphComplements = new Map();
let hxPointerCleanup    = null;
let hxUpdateViewForBoard = null;
let hxCompletedReqs     = new Set(); // IDs of completed requirements (persists across games)
let hxIntroducedTileTypes = new Set();
let hxQueuedTileIntros    = new Set();
let hxPendingTutorialModals = [];
let hxTutorialQueueRunning = false;
let hxTutorialModalOpen    = false;
let hxAchievementLettersCollected = new Set();

// Power-up targeting mode state
let hxAmethystTargeting  = false; // true when waiting for tile tap to transmute
let hxSeleniteTargeting  = false; // true when waiting for 2 tile taps to swap
let hxSeleniteFirstTile  = null;  // first tile selected in selenite swap

/* ── Pure helpers ──────────────────────────────────────────────── */
function hxKey(q, r) { return `${q},${r}`; }

function makeLayout() {
  return new Layout(
    OrientationPointy,
    new Point(HEX_RADIUS * TILE_SPACING, HEX_RADIUS * TILE_SPACING),
    new Point(500, 500),
  );
}

function getColumnRange(q) {
  return {
    r_min: Math.max(-GRID_RADIUS, -GRID_RADIUS - q),
    r_max: Math.min(GRID_RADIUS,   GRID_RADIUS - q),
  };
}

function randomLetter() {
  const drawn = HX_LETTER_POOL[Math.floor(Math.random() * HX_LETTER_POOL.length)];
  if (drawn === '__DIGRAPH__') {
    return randomDigraph().digraph;
  }
  return drawn;
}

const HX_VOWELS = new Set(['A','E','I','O','U']);
const HX_VOWEL_POOL = ['E','E','E','A','A','I','I','O','O','O','U'];

/** Returns vowel weight of a letter string.
 *  Plain vowel = 1.0, plain consonant = 0.0.
 *  Digraph = 0.5 per vowel character (e.g. ER→0.5, EA→1.0, TH→0.0). */
function vowelWeightOf(letter) {
  const v = [...letter].filter(ch => HX_VOWELS.has(ch)).length;
  return letter.length > 1 ? v * 0.5 : v;
}

/** High-utility consonants for forcing when vowel-heavy neighborhood detected */
const HX_UTILITY_CONSONANTS = [
  'S','S','S','T','T','T','R','R','R','N','N','N',
  'L','L','D','D','H','C','M','G','B','F','P','W',
];

/**
 * Picks a letter/digraph for position (q, r) with full neighbor awareness:
 *  1. Vowel-heavy neighbors (score ≥ 1.5) → 70% chance force high-utility consonant
 *  2. All-consonant neighbors (score = 0, count ≥ 2) → 75% chance force vowel
 *  3. Has digraph neighbors → 60% chance draw from merged complement pool
 *  4. Has a pending digraph complement hint → 60% chance draw from hint pool
 *  5. Otherwise draw from HX_LETTER_POOL normally (digraphs fully eligible)
 */
function randomLetterOrDigraphForPos(q, r) {
  const neighborKeys = [
    hxKey(q + 1, r),   hxKey(q - 1, r),
    hxKey(q,     r + 1), hxKey(q,     r - 1),
    hxKey(q + 1, r - 1), hxKey(q - 1, r + 1),
  ];

  const neighbors = neighborKeys.map(k => hxTileMap.get(k)).filter(Boolean);
  const neighborCount = neighbors.length;

  // ── Vowel score ────────────────────────────────────────────────
  const neighborVowelScore = neighbors.reduce((sum, t) => sum + vowelWeightOf(t.letter), 0);

  // ── 1. Vowel-heavy → force consonant ───────────────────────────
  if (neighborCount >= 2 && neighborVowelScore >= 1.5 && Math.random() < 0.70) {
    const letter = HX_UTILITY_CONSONANTS[Math.floor(Math.random() * HX_UTILITY_CONSONANTS.length)];
    return { isDigraph: false, letter };
  }

  // ── 2. All-consonant → force vowel ─────────────────────────────
  if (neighborCount >= 2 && neighborVowelScore === 0 && Math.random() < 0.75) {
    return { isDigraph: false, letter: HX_VOWEL_POOL[Math.floor(Math.random() * HX_VOWEL_POOL.length)] };
  }

  // ── 3. Digraph neighbor complement ─────────────────────────────
  const digraphNeighbors = neighbors.filter(t => t.tileType === 'digraph');
  if (digraphNeighbors.length > 0 && Math.random() < 0.60) {
    const merged = digraphNeighbors.flatMap(t => DIGRAPH_COMPLEMENT[t.letter] || []);
    if (merged.length > 0) {
      const letter = merged[Math.floor(Math.random() * merged.length)];
      return { isDigraph: false, letter };
    }
  }

  // ── 4. Pending digraph complement hint (set during buildGrid) ───
  const hint = pendingDigraphComplements.get(hxKey(q, r));
  if (hint && hint.length > 0 && Math.random() < 0.60) {
    const letter = hint[Math.floor(Math.random() * hint.length)];
    return { isDigraph: false, letter };
  }

  // ── 5. Normal pool draw ─────────────────────────────────────────
  const drawn = HX_LETTER_POOL[Math.floor(Math.random() * HX_LETTER_POOL.length)];
  if (drawn === '__DIGRAPH__') {
    const { digraph, points } = randomDigraph();
    return { isDigraph: true, digraph, points };
  }
  return { isDigraph: false, letter: drawn };
}

function areNeighbors(a, b) {
  if ((Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs(a.s - b.s)) === 2) return true;
  // Portal adjacency override: treat entry and exit as neighbors when portal is open
  if (hxState.portalOpen && !hxState.portalUsed && hxState.portalEntry && hxState.portalExit) {
    const aKey     = hxKey(a.q, a.r);
    const bKey     = hxKey(b.q, b.r);
    const entryKey = hxKey(hxState.portalEntry.q, hxState.portalEntry.r);
    const exitKey  = hxKey(hxState.portalExit.q,  hxState.portalExit.r);
    if ((aKey === entryKey && bKey === exitKey) || (aKey === exitKey && bKey === entryKey)) return true;
  }
  return false;
}

function removeFrom(arr, item) {
  const i = arr.indexOf(item);
  if (i !== -1) arr.splice(i, 1);
}

/* ── Portal helpers ────────────────────────────────────────────── */

/** Returns true when `tile` is one of the active portal tiles. */
function isPortalTile(tile) {
  if (!hxState.portalOpen || !hxState.portalEntry || !hxState.portalExit) return false;
  const key = hxKey(tile.q, tile.r);
  return key === hxKey(hxState.portalEntry.q, hxState.portalEntry.r) ||
         key === hxKey(hxState.portalExit.q,  hxState.portalExit.r);
}

/** Applies portal CSS classes and icons to the two portal tiles. */
function applyPortalVisuals() {
  if (!hxState.portalEntry || !hxState.portalExit) return;
  const entryTile = hxTileMap.get(hxKey(hxState.portalEntry.q, hxState.portalEntry.r));
  const exitTile  = hxTileMap.get(hxKey(hxState.portalExit.q,  hxState.portalExit.r));
  if (entryTile) {
    entryTile.element.querySelector('polygon')?.classList.add('hx-portal');
    _addPortalIcon(entryTile, '◈');
  }
  if (exitTile) {
    exitTile.element.querySelector('polygon')?.classList.add('hx-portal');
    _addPortalIcon(exitTile, '◉');
  }
}

function _addPortalIcon(tile, glyph) {
  tile.element.querySelector('.hx-portal-icon')?.remove();
  const cx   = parseFloat(tile.textLetter.getAttribute('x'));
  const cy   = parseFloat(tile.textLetter.getAttribute('y'));
  const icon = document.createElementNS(SVG_NS, 'text');
  icon.setAttribute('x', cx - HEX_RADIUS * 0.5);
  icon.setAttribute('y', cy - HEX_RADIUS * 0.45);
  icon.setAttribute('font-size', '11');
  icon.setAttribute('pointer-events', 'none');
  icon.setAttribute('class', 'hx-portal-icon');
  icon.setAttribute('fill', '#e5e7eb');
  icon.textContent = glyph;
  tile.element.appendChild(icon);
}

/** Removes portal CSS classes and icons from the two portal tiles. */
function clearPortalVisuals() {
  [hxState.portalEntry, hxState.portalExit].forEach(pos => {
    if (!pos) return;
    const tile = hxTileMap.get(hxKey(pos.q, pos.r));
    if (!tile) return;
    tile.element.querySelector('polygon')?.classList.remove('hx-portal', 'hx-portal-active');
    tile.element.querySelector('.hx-portal-icon')?.remove();
  });
}

/**
 * Highlights both portal tiles when they are both present in the current
 * selection (i.e., the portal is actively being traversed in this drag).
 */
function updatePortalActiveState() {
  if (!hxState.portalOpen || !hxState.portalEntry || !hxState.portalExit) return;
  const entryKey = hxKey(hxState.portalEntry.q, hxState.portalEntry.r);
  const exitKey  = hxKey(hxState.portalExit.q,  hxState.portalExit.r);
  const keys     = new Set(hxSelected.map(t => hxKey(t.q, t.r)));
  const bothActive = keys.has(entryKey) && keys.has(exitKey);

  [hxState.portalEntry, hxState.portalExit].forEach(pos => {
    const tile = hxTileMap.get(hxKey(pos.q, pos.r));
    if (!tile) return;
    const poly = tile.element.querySelector('polygon');
    if (!poly) return;
    poly.classList.toggle('hx-portal-active', bothActive);
  });
}

/**
 * Randomly selects 2 of the 6 corner tiles and opens them as a portal pair.
 * Does nothing if fewer than 2 corner tiles exist on the board.
 */
function openPortal() {
  if (hxState.gameOver) return;
  const available = HX_PORTAL_CORNERS.filter(pos => hxTileMap.has(hxKey(pos.q, pos.r)));
  if (available.length < 2) return;
  const shuffled = [...available].sort(() => Math.random() - 0.5);
  const [ep, xp]  = shuffled;
  hxState.portalOpen  = true;
  hxState.portalUsed  = false;
  hxState.portalEntry = { q: ep.q, r: ep.r, s: -ep.q - ep.r };
  hxState.portalExit  = { q: xp.q, r: xp.r, s: -xp.q - xp.r };
  hxState.portalWordsRemaining = 5;
  applyPortalVisuals();

  // Play spawn flash on both portal tiles
  [hxState.portalEntry, hxState.portalExit].forEach(pos => {
    const tile = hxTileMap.get(hxKey(pos.q, pos.r));
    if (!tile) return;
    tile.element.classList.add('hx-portal-spawn');
    tile.element.addEventListener('animationend', () => {
      tile.element.classList.remove('hx-portal-spawn');
    }, { once: true });
  });
}

/** Closes the portal: removes visuals and resets state. */
function closePortal() {
  if (!hxState.portalOpen) return;
  clearPortalVisuals();
  hxState.portalOpen  = false;
  hxState.portalUsed  = false;
  hxState.portalEntry = null;
  hxState.portalExit  = null;
  hxState.portalWordsRemaining = 0;
}

/**
 * After gravity runs, removes portal visuals from any tile that has moved away
 * from a portal coordinate, then reapplies visuals to whatever tile now occupies
 * each portal coordinate.  Portal coordinates (hxState.portalEntry/portalExit)
 * are fixed location markers and are never changed here.
 * Accepts the tile object references captured before gravity ran.
 */
function transferPortalIfMoved(preGravityEntryTile, preGravityExitTile) {
  if (!hxState.portalOpen) return;

  function cleanupVisuals(preGravityTile, portalCoord) {
    if (!preGravityTile || !portalCoord) return;
    // If the tile moved away from the portal position, remove its portal visuals
    if (preGravityTile.q !== portalCoord.q || preGravityTile.r !== portalCoord.r) {
      preGravityTile.element.querySelector('polygon')
        ?.classList.remove('hx-portal', 'hx-portal-active');
      preGravityTile.element.querySelector('.hx-portal-icon')?.remove();
    }
  }

  cleanupVisuals(preGravityEntryTile, hxState.portalEntry);
  cleanupVisuals(preGravityExitTile, hxState.portalExit);

  // Reapply visuals to whatever tiles are now at the fixed portal coordinates
  applyPortalVisuals();
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ── Tile geometry repositioning ───────────────────────────────── */
function repositionTileGeometry(tile) {
  const hex    = new Hex(tile.q, tile.r);
  const center = hxLayout.hexToPixel(hex);

  const poly = tile.element.querySelector('polygon');
  if (poly) {
    const pts = hxLayout.polygonCorners(hex, HEX_RADIUS).map(p => `${p.x},${p.y}`).join(' ');
    poly.setAttribute('points', pts);
  }

  const outline = tile.element.querySelector('path');
  if (outline) {
    const outer = hxLayout.polygonCorners(hex, HEX_RADIUS + 5);
    const inner = hxLayout.polygonCorners(hex, HEX_RADIUS);
    const d = [
      'M', outer[0].x, outer[0].y,
      ...outer.slice(1).map(p => `L ${p.x} ${p.y}`),
      'Z',
      'M', inner[0].x, inner[0].y,
      ...inner.slice(1).map(p => `L ${p.x} ${p.y}`),
      'Z',
    ].join(' ');
    outline.setAttribute('d', d);
  }

  tile.textLetter.setAttribute('x', center.x);
  tile.textLetter.setAttribute('y', center.y);
  tile.textPoint.setAttribute('x', center.x);
  tile.textPoint.setAttribute('y', center.y + HEX_RADIUS * 0.6);

  const spark = tile.element.querySelector('.spark');
  if (spark) {
    spark.setAttribute('cx', center.x + HEX_RADIUS * 0.4);
    spark.setAttribute('cy', center.y - HEX_RADIUS * 0.4);
  }

  tile.element.removeAttribute('transform');
  tile.element.style.transform = '';
}

/* ── Animate a batch of tile moves simultaneously (arc paths) ───── */
async function animateTileMoves(moves) {
  const promises = moves.map(({ tile, fromQ, fromR, toQ, toR }) =>
    new Promise(resolve => {
      const start = hxLayout.hexToPixel(new Hex(fromQ, fromR));
      const end   = hxLayout.hexToPixel(new Hex(toQ,   toR));
      // Path offsets are relative to the tile's baked (drawn) polygon position.
      // For existing tiles tile.q/tile.r == fromQ/fromR (pre-move position).
      // For new refill tiles tile.q/tile.r == toQ/toR (spawned at destination).
      // In both cases tile.q/tile.r gives the correct SVG geometry reference.
      const bakedPixel = hxLayout.hexToPixel(new Hex(tile.q, tile.r));

      const sx = start.x - bakedPixel.x;
      const sy = start.y - bakedPixel.y;
      const ex = end.x   - bakedPixel.x;
      const ey = end.y   - bakedPixel.y;

      // Quadratic Bézier control point: 0.25 pulls the arc toward the start row,
      // creating the "shoulder-slide" where tiles appear to roll off each other
      const cpx = (sx + ex) / 2;
      const cpy = sy + (ey - sy) * 0.25;

      const anim = document.createElementNS(SVG_NS, 'animateMotion');
      anim.setAttribute('path', `M ${sx},${sy} Q ${cpx},${cpy} ${ex},${ey}`);
      anim.setAttribute('dur', '0.22s');
      anim.setAttribute('fill', 'freeze');

      // settled flag prevents double-resolution if both endEvent and the
      // fallback timer fire (e.g. very fast browser or already-removed element)
      let settled = false;
      let fallbackTimer;
      function finalize() {
        if (settled) return;
        settled = true;
        clearTimeout(fallbackTimer);
        hxTileMap.delete(hxKey(fromQ, fromR));
        tile.q = toQ;
        tile.r = toR;
        tile.s = -toQ - toR;
        hxTileMap.set(hxKey(toQ, toR), tile);
        anim.remove();
        repositionTileGeometry(tile);
        tile.element.classList.remove('hx-tile-landing');
        // Re-adding the same class only re-triggers the animation after a reflow
        // forces the browser to flush the style change between remove and add.
        void tile.element.getBoundingClientRect();
        tile.element.classList.add('hx-tile-landing');
        resolve();
      }

      anim.addEventListener('endEvent', finalize, { once: true });

      // Fallback: SVG endEvent is not 100% reliable across all browsers.
      // If it never fires (e.g. element removed from DOM mid-animation) the
      // promise would hang forever, stalling the gravity/refill chain.
      // 300 ms gives the 220 ms animation generous time to fire naturally.
      fallbackTimer = setTimeout(finalize, 300);

      tile.element.appendChild(anim);
      anim.beginElement();
    })
  );

  await Promise.all(promises);
}

/* ── Animate tile moves with a chain-reaction drop ─────────────── */
// Each tile waits for the tile directly below it (in the same wave)
// to finish landing before it starts falling, creating organic
// chain-reaction gravity instead of a metronomic fixed stagger.
async function animateTileMovesStaggered(moves) {
  if (moves.length === 0) return;

  // Build a map from destination key → promise that resolves when that tile lands.
  // A tile can only start falling once the slot it's heading into is clear —
  // i.e. once the tile that was previously occupying that slot has itself landed.
  const landedPromises = new Map(); // `toQ,toR` → Promise<void>
  const resolvers      = new Map(); // `toQ,toR` → resolve fn

  for (const move of moves) {
    const key = hxKey(move.toQ, move.toR);
    let res;
    landedPromises.set(key, new Promise(r => { res = r; }));
    resolvers.set(key, res);
  }

  const allDone = moves.map(move => {
    const fromKey = hxKey(move.fromQ, move.fromR);
    // Wait for whatever tile was previously falling INTO our fromQ,fromR to land first
    const waitFor = landedPromises.get(fromKey);
    return new Promise(resolve => {
      const launch = () => {
        animateTileMoves([move]).then(() => {
          // Signal that our destination slot is now occupied (tile has landed)
          resolvers.get(hxKey(move.toQ, move.toR))?.();
          resolve();
        });
      };
      if (waitFor) {
        waitFor.then(launch);
      } else {
        launch(); // nothing below us — fall immediately
      }
    });
  });

  await Promise.all(allDone);
}


/* ── Tile type styling ─────────────────────────────────────────── */
function applyTileType(tile) {
  const poly = tile.element.querySelector('polygon');
  poly.classList.remove(
    'hx-ember', 'hx-prism', 'hx-rune', 'hx-digraph',
    'hx-gem-emerald', 'hx-gem-gold', 'hx-gem-sapphire',
    'hx-gem-pearl', 'hx-gem-tanzanite', 'hx-gem-ruby', 'hx-gem-diamond',
    'hx-gem-aquamarine', 'hx-gem-topaz', 'hx-gem-opal',
    'hx-gem-imperialjade', 'hx-gem-alexandrite',
    'hx-amethyst', 'hx-selenite',
    'hx-oracle', 'hx-beacon', 'hx-eclipse', 'hx-lodestone', 'hx-lexicon',
  );
  tile.element.querySelector('.hx-type-icon')?.remove();
  // Reset letter font size (may have been reduced for digraph)
  tile.textLetter.setAttribute('font-size', '28');
  tile.textLetter.classList.remove(
    'hx-achievement-tile-letter',
    'hx-sparkle-amethyst', 'hx-sparkle-selenite', 'hx-sparkle-rune',
  );

  if (tile.tileType === 'digraph') {
    poly.classList.add('hx-digraph');
    tile.textLetter.textContent = tile.letter;
    tile.textPoint.textContent  = String(tile.point);
    tile.textLetter.setAttribute('font-size', '21');
  } else if (tile.tileType === 'ember') {
    poly.classList.add('hx-ember');
  } else if (tile.tileType === 'prism') {
    poly.classList.add('hx-prism');
  } else if (tile.tileType === 'rune') {
    poly.classList.add('hx-rune');
    tile.textLetter.textContent = '?';
    tile.textPoint.textContent  = '?';
    // Sparkle fallback for browsers without :has() support
    tile.textLetter.classList.add('hx-sparkle-rune');
  } else if (tile.tileType === 'gemEmerald') {
    poly.classList.add('hx-gem-emerald');
  } else if (tile.tileType === 'gemGold') {
    poly.classList.add('hx-gem-gold');
  } else if (tile.tileType === 'gemSapphire') {
    poly.classList.add('hx-gem-sapphire');
  } else if (tile.tileType === 'gemPearl') {
    poly.classList.add('hx-gem-pearl');
  } else if (tile.tileType === 'gemTanzanite') {
    poly.classList.add('hx-gem-tanzanite');
  } else if (tile.tileType === 'gemRuby') {
    poly.classList.add('hx-gem-ruby');
  } else if (tile.tileType === 'gemDiamond') {
    poly.classList.add('hx-gem-diamond');
  } else if (tile.tileType === 'gemAquamarine') {
    poly.classList.add('hx-gem-aquamarine');
  } else if (tile.tileType === 'gemTopaz') {
    poly.classList.add('hx-gem-topaz');
  } else if (tile.tileType === 'gemOpal') {
    poly.classList.add('hx-gem-opal');
  } else if (tile.tileType === 'gemImperialJade') {
    poly.classList.add('hx-gem-imperialjade');
  } else if (tile.tileType === 'gemAlexandrite') {
    poly.classList.add('hx-gem-alexandrite');
  } else if (tile.tileType === 'amethyst') {
    poly.classList.add('hx-amethyst');
    // Sparkle fallback for browsers without :has() support
    tile.textLetter.classList.add('hx-sparkle-amethyst');
  } else if (tile.tileType === 'selenite') {
    poly.classList.add('hx-selenite');
    // Sparkle fallback for browsers without :has() support
    tile.textLetter.classList.add('hx-sparkle-selenite');
  } else if (tile.tileType === 'oracle') {
    poly.classList.add('hx-oracle');
    tile.textLetter.classList.add('hx-achievement-tile-letter');
    tile.textPoint.textContent  = '';
  } else if (tile.tileType === 'beacon') {
    poly.classList.add('hx-beacon');
    tile.textLetter.classList.add('hx-achievement-tile-letter');
    tile.textPoint.textContent  = '';
  } else if (tile.tileType === 'eclipse') {
    poly.classList.add('hx-eclipse');
    tile.textLetter.classList.add('hx-achievement-tile-letter');
    tile.textPoint.textContent  = '';
  } else if (tile.tileType === 'lodestone') {
    poly.classList.add('hx-lodestone');
    tile.textLetter.classList.add('hx-achievement-tile-letter');
    tile.textPoint.textContent  = '';
  } else if (tile.tileType === 'lexicon') {
    poly.classList.add('hx-lexicon');
    tile.textLetter.classList.add('hx-achievement-tile-letter');
    tile.textPoint.textContent  = '';
  }
}

/* ── SVG gradient defs ─────────────────────────────────────────── */
function injectSvgDefs(svg) {
  let defs = svg.querySelector('defs');
  if (!defs) {
    defs = document.createElementNS(SVG_NS, 'defs');
    svg.insertBefore(defs, svg.firstChild);
  }

  function ensureFilter(id) {
    if (defs.querySelector(`#${id}`)) return;
    const filter = document.createElementNS(SVG_NS, 'filter');
    filter.setAttribute('id', id);
    filter.setAttribute('filterUnits', 'objectBoundingBox');
    filter.setAttribute('x', '-30%'); filter.setAttribute('y', '-30%');
    filter.setAttribute('width', '160%'); filter.setAttribute('height', '160%');
    const blur = document.createElementNS(SVG_NS, 'feGaussianBlur');
    blur.setAttribute('in', 'SourceGraphic');
    blur.setAttribute('stdDeviation', '3');
    blur.setAttribute('result', 'blur');
    const merge = document.createElementNS(SVG_NS, 'feMerge');
    const m1 = document.createElementNS(SVG_NS, 'feMergeNode'); m1.setAttribute('in', 'blur');
    const m2 = document.createElementNS(SVG_NS, 'feMergeNode'); m2.setAttribute('in', 'SourceGraphic');
    merge.append(m1, m2);
    filter.append(blur, merge);
    defs.appendChild(filter);
  }

  function ensureLinearGradient(id, c1, c2) {
    if (document.getElementById(id)) return;
    const grad = document.createElementNS(SVG_NS, 'linearGradient');
    grad.setAttribute('id', id);
    grad.setAttribute('x1', '0%'); grad.setAttribute('y1', '0%');
    grad.setAttribute('x2', '100%'); grad.setAttribute('y2', '100%');
    const s1 = document.createElementNS(SVG_NS, 'stop');
    s1.setAttribute('offset', '0%'); s1.setAttribute('stop-color', c1);
    const s2 = document.createElementNS(SVG_NS, 'stop');
    s2.setAttribute('offset', '100%'); s2.setAttribute('stop-color', c2);
    grad.append(s1, s2);
    defs.appendChild(grad);
  }

  ensureFilter('hoverGlow');
  if (!document.getElementById('hx-ember-gradient')) {
    const emberGrad = document.createElementNS(SVG_NS, 'linearGradient');
    emberGrad.setAttribute('id', 'hx-ember-gradient');
    emberGrad.setAttribute('x1', '20%'); emberGrad.setAttribute('y1', '100%');
    emberGrad.setAttribute('x2', '80%'); emberGrad.setAttribute('y2', '0%');
    [
      ['0%',   '#260000'],
      ['30%',  '#b91c1c'],
      ['60%',  '#f97316'],
      ['85%',  '#fbbf24'],
      ['100%', '#fef3c7'],
    ].forEach(([offset, color]) => {
      const s = document.createElementNS(SVG_NS, 'stop');
      s.setAttribute('offset', offset);
      s.setAttribute('stop-color', color);
      emberGrad.appendChild(s);
    });
    defs.appendChild(emberGrad);
  }
  // Prism: deep violet → electric rose
  ensureLinearGradient('hx-prism-gradient',    '#1a0040', '#db2777');
  // Digraph: deep teal → emerald
  ensureLinearGradient('hx-digraph-gradient',  '#022c22', '#34d399');
  // Portal: midnight → vivid violet → magenta
  ensureLinearGradient('hx-portal-gradient',   '#1a003f', '#7c3aed');
  // Rune: midnight blue → electric violet (gradient instead of flat fill)
  if (!document.getElementById('hx-rune-gradient')) {
    const runeGrad = document.createElementNS(SVG_NS, 'linearGradient');
    runeGrad.setAttribute('id', 'hx-rune-gradient');
    runeGrad.setAttribute('x1', '50%'); runeGrad.setAttribute('y1', '100%');
    runeGrad.setAttribute('x2', '50%'); runeGrad.setAttribute('y2', '0%');
    [
      ['0%',   '#020617'],
      ['50%',  '#312e81'],
      ['100%', '#6d28d9'],
    ].forEach(([offset, color]) => {
      const s = document.createElementNS(SVG_NS, 'stop');
      s.setAttribute('offset', offset);
      s.setAttribute('stop-color', color);
      runeGrad.appendChild(s);
    });
    defs.appendChild(runeGrad);
  }
  ensureLinearGradient('hx-gem-emerald-gradient',   '#16a34a', '#4ade80');

  // Gold — bright lemon yellow (separated from Topaz and Ember which are orange)
  if (!document.getElementById('hx-gem-gold-gradient')) {
    const goldGrad = document.createElementNS(SVG_NS, 'linearGradient');
    goldGrad.setAttribute('id', 'hx-gem-gold-gradient');
    goldGrad.setAttribute('x1', '0%'); goldGrad.setAttribute('y1', '0%');
    goldGrad.setAttribute('x2', '100%'); goldGrad.setAttribute('y2', '100%');
    [['0%', '#92400e'], ['50%', '#eab308'], ['100%', '#fef08a']].forEach(([offset, color]) => {
      const s = document.createElementNS(SVG_NS, 'stop');
      s.setAttribute('offset', offset); s.setAttribute('stop-color', color);
      goldGrad.appendChild(s);
    });
    defs.appendChild(goldGrad);
  }

  ensureLinearGradient('hx-gem-sapphire-gradient',   '#1d4ed8', '#93c5fd');
  ensureLinearGradient('hx-gem-pearl-gradient',      '#d4c5a9', '#ffffff');

  // Tanzanite — deep navy blue (separated from Rune and Amethyst purples)
  if (!document.getElementById('hx-gem-tanzanite-gradient')) {
    const tanzaniteGrad = document.createElementNS(SVG_NS, 'linearGradient');
    tanzaniteGrad.setAttribute('id', 'hx-gem-tanzanite-gradient');
    tanzaniteGrad.setAttribute('x1', '0%'); tanzaniteGrad.setAttribute('y1', '0%');
    tanzaniteGrad.setAttribute('x2', '100%'); tanzaniteGrad.setAttribute('y2', '100%');
    [['0%', '#020617'], ['50%', '#1e3a8a'], ['100%', '#60a5fa']].forEach(([offset, color]) => {
      const s = document.createElementNS(SVG_NS, 'stop');
      s.setAttribute('offset', offset); s.setAttribute('stop-color', color);
      tanzaniteGrad.appendChild(s);
    });
    defs.appendChild(tanzaniteGrad);
  }

  ensureLinearGradient('hx-gem-ruby-gradient',       '#7f1d1d', '#ef4444');

  // Diamond — steel silver (separated from Selenite moonstone blue-white)
  if (!document.getElementById('hx-gem-diamond-gradient')) {
    const diamondGrad = document.createElementNS(SVG_NS, 'linearGradient');
    diamondGrad.setAttribute('id', 'hx-gem-diamond-gradient');
    diamondGrad.setAttribute('x1', '0%'); diamondGrad.setAttribute('y1', '0%');
    diamondGrad.setAttribute('x2', '100%'); diamondGrad.setAttribute('y2', '100%');
    [['0%', '#334155'], ['50%', '#94a3b8'], ['100%', '#f1f5f9']].forEach(([offset, color]) => {
      const s = document.createElementNS(SVG_NS, 'stop');
      s.setAttribute('offset', offset); s.setAttribute('stop-color', color);
      diamondGrad.appendChild(s);
    });
    defs.appendChild(diamondGrad);
  }

  ensureLinearGradient('hx-gem-aquamarine-gradient',  '#0891b2', '#67e8f9');

  // Topaz — warm orange (clearly orange, Gold is clearly yellow)
  if (!document.getElementById('hx-gem-topaz-gradient')) {
    const topazGrad = document.createElementNS(SVG_NS, 'linearGradient');
    topazGrad.setAttribute('id', 'hx-gem-topaz-gradient');
    topazGrad.setAttribute('x1', '0%'); topazGrad.setAttribute('y1', '0%');
    topazGrad.setAttribute('x2', '100%'); topazGrad.setAttribute('y2', '100%');
    [['0%', '#7c2d12'], ['50%', '#ea580c'], ['100%', '#fdba74']].forEach(([offset, color]) => {
      const s = document.createElementNS(SVG_NS, 'stop');
      s.setAttribute('offset', offset); s.setAttribute('stop-color', color);
      topazGrad.appendChild(s);
    });
    defs.appendChild(topazGrad);
  }

  ensureLinearGradient('hx-gem-opal-gradient',        '#c4b5fd', '#ffffff');
  ensureLinearGradient('hx-gem-imperialjade-gradient','#064e3b', '#34d399');

  // Alexandrite — vivid fuchsia (removed green overlap with Imperial Jade)
  if (!document.getElementById('hx-gem-alexandrite-gradient')) {
    const alexGrad = document.createElementNS(SVG_NS, 'linearGradient');
    alexGrad.setAttribute('id', 'hx-gem-alexandrite-gradient');
    alexGrad.setAttribute('x1', '0%'); alexGrad.setAttribute('y1', '0%');
    alexGrad.setAttribute('x2', '100%'); alexGrad.setAttribute('y2', '100%');
    [['0%', '#4a044e'], ['33%', '#a21caf'], ['67%', '#e879f9'], ['100%', '#fce7f3']].forEach(([offset, color]) => {
      const s = document.createElementNS(SVG_NS, 'stop');
      s.setAttribute('offset', offset); s.setAttribute('stop-color', color);
      alexGrad.appendChild(s);
    });
    defs.appendChild(alexGrad);
  }

  // Amethyst — obsidian → royal purple → electric fuchsia
  if (!document.getElementById('hx-amethyst-gradient')) {
    const amethystGrad = document.createElementNS(SVG_NS, 'linearGradient');
    amethystGrad.setAttribute('id', 'hx-amethyst-gradient');
    amethystGrad.setAttribute('x1', '100%'); amethystGrad.setAttribute('y1', '100%');
    amethystGrad.setAttribute('x2', '0%');   amethystGrad.setAttribute('y2', '0%');
    [
      ['0%',   '#1a0028'],
      ['50%',  '#7e22ce'],
      ['100%', '#d946ef'],
    ].forEach(([offset, color]) => {
      const s = document.createElementNS(SVG_NS, 'stop');
      s.setAttribute('offset', offset);
      s.setAttribute('stop-color', color);
      amethystGrad.appendChild(s);
    });
    defs.appendChild(amethystGrad);
  }

  // Selenite — deep ocean → arctic teal → crystal ice
  if (!document.getElementById('hx-selenite-gradient')) {
    const seleniteGrad = document.createElementNS(SVG_NS, 'linearGradient');
    seleniteGrad.setAttribute('id', 'hx-selenite-gradient');
    seleniteGrad.setAttribute('x1', '0%'); seleniteGrad.setAttribute('y1', '100%');
    seleniteGrad.setAttribute('x2', '0%'); seleniteGrad.setAttribute('y2', '0%');
    [
      ['0%',   '#030712'],
      ['35%',  '#0c4a6e'],
      ['70%',  '#0ea5e9'],
      ['100%', '#e0f2fe'],
    ].forEach(([offset, color]) => {
      const s = document.createElementNS(SVG_NS, 'stop');
      s.setAttribute('offset', offset);
      s.setAttribute('stop-color', color);
      seleniteGrad.appendChild(s);
    });
    defs.appendChild(seleniteGrad);
  }

  // Oracle — moonstone silver → opal shimmer → luminous white
  if (!document.getElementById('hx-oracle-gradient')) {
    const oracleGrad = document.createElementNS(SVG_NS, 'linearGradient');
    oracleGrad.setAttribute('id', 'hx-oracle-gradient');
    oracleGrad.setAttribute('x1', '0%'); oracleGrad.setAttribute('y1', '100%');
    oracleGrad.setAttribute('x2', '100%'); oracleGrad.setAttribute('y2', '0%');
    [
      ['0%',   '#1e293b'],
      ['45%',  '#64748b'],
      ['80%',  '#cbd5e1'],
      ['100%', '#f8fafc'],
    ].forEach(([offset, color]) => {
      const s = document.createElementNS(SVG_NS, 'stop');
      s.setAttribute('offset', offset);
      s.setAttribute('stop-color', color);
      oracleGrad.appendChild(s);
    });
    defs.appendChild(oracleGrad);
  }

  // Beacon — deep amber → gold → sunburst yellow
  if (!document.getElementById('hx-beacon-gradient')) {
    const beaconGrad = document.createElementNS(SVG_NS, 'linearGradient');
    beaconGrad.setAttribute('id', 'hx-beacon-gradient');
    beaconGrad.setAttribute('x1', '0%'); beaconGrad.setAttribute('y1', '100%');
    beaconGrad.setAttribute('x2', '100%'); beaconGrad.setAttribute('y2', '0%');
    [
      ['0%',   '#451a03'],
      ['40%',  '#b45309'],
      ['75%',  '#f59e0b'],
      ['100%', '#fef08a'],
    ].forEach(([offset, color]) => {
      const s = document.createElementNS(SVG_NS, 'stop');
      s.setAttribute('offset', offset);
      s.setAttribute('stop-color', color);
      beaconGrad.appendChild(s);
    });
    defs.appendChild(beaconGrad);
  }

  // Eclipse — obsidian → deep charcoal → shadow violet
  if (!document.getElementById('hx-eclipse-gradient')) {
    const eclipseGrad = document.createElementNS(SVG_NS, 'linearGradient');
    eclipseGrad.setAttribute('id', 'hx-eclipse-gradient');
    eclipseGrad.setAttribute('x1', '50%'); eclipseGrad.setAttribute('y1', '100%');
    eclipseGrad.setAttribute('x2', '50%'); eclipseGrad.setAttribute('y2', '0%');
    [
      ['0%',   '#020617'],
      ['45%',  '#1c1917'],
      ['80%',  '#292524'],
      ['100%', '#4c1d95'],
    ].forEach(([offset, color]) => {
      const s = document.createElementNS(SVG_NS, 'stop');
      s.setAttribute('offset', offset);
      s.setAttribute('stop-color', color);
      eclipseGrad.appendChild(s);
    });
    defs.appendChild(eclipseGrad);
  }

  // Lodestone — iron dark → steel mid → chrome highlight
  if (!document.getElementById('hx-lodestone-gradient')) {
    const lodestoneGrad = document.createElementNS(SVG_NS, 'linearGradient');
    lodestoneGrad.setAttribute('id', 'hx-lodestone-gradient');
    lodestoneGrad.setAttribute('x1', '0%'); lodestoneGrad.setAttribute('y1', '100%');
    lodestoneGrad.setAttribute('x2', '100%'); lodestoneGrad.setAttribute('y2', '0%');
    [
      ['0%',   '#18181b'],
      ['40%',  '#3f3f46'],
      ['75%',  '#a1a1aa'],
      ['100%', '#e4e4e7'],
    ].forEach(([offset, color]) => {
      const s = document.createElementNS(SVG_NS, 'stop');
      s.setAttribute('offset', offset);
      s.setAttribute('stop-color', color);
      lodestoneGrad.appendChild(s);
    });
    defs.appendChild(lodestoneGrad);
  }

  // Lexicon — rainbow prismatic 6-stop spectrum
  if (!document.getElementById('hx-lexicon-gradient')) {
    const lexiconGrad = document.createElementNS(SVG_NS, 'linearGradient');
    lexiconGrad.setAttribute('id', 'hx-lexicon-gradient');
    lexiconGrad.setAttribute('x1', '0%'); lexiconGrad.setAttribute('y1', '0%');
    lexiconGrad.setAttribute('x2', '100%'); lexiconGrad.setAttribute('y2', '100%');
    [
      ['0%',    '#dc2626'],
      ['20%',   '#ea580c'],
      ['40%',   '#16a34a'],
      ['60%',   '#2563eb'],
      ['80%',   '#7c3aed'],
      ['100%',  '#db2777'],
    ].forEach(([offset, color]) => {
      const s = document.createElementNS(SVG_NS, 'stop');
      s.setAttribute('offset', offset);
      s.setAttribute('stop-color', color);
      lexiconGrad.appendChild(s);
    });
    defs.appendChild(lexiconGrad);
  }
}

function hxIsoDateLocal(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Returns the current date string in Eastern Time (America/New_York), yyyy-mm-dd.
 *  Daily boards reset at midnight ET so all players worldwide see the same puzzle. */
function hxEasternDateStr() {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/New_York',
      year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(new Date());
    const get = type => parts.find(p => p.type === type)?.value ?? '';
    return `${get('year')}-${get('month')}-${get('day')}`;
  } catch (_) {
    return hxIsoDateLocal();
  }
}

const HX_DAILY_COMPLETED_KEY = 'hxDailyCompleted';
const HX_DAILY_BOARD_CACHE_PREFIX = 'hxDailyBoardCache_';

/** Persist that the player has finished today's daily (ET date). */
function hxMarkDailyCompleted() {
  try { localStorage.setItem(HX_DAILY_COMPLETED_KEY, hxEasternDateStr()); } catch (_) {}
}

async function loadDailyChallengeBoard(dateStr) {
  const targetDate = dateStr || hxEasternDateStr();
  const cacheKey = HX_DAILY_BOARD_CACHE_PREFIX + targetDate;

  // Return the cached board for this date so every click yields the same puzzle.
  try {
    const cached = localStorage.getItem(cacheKey);
    if (cached) return JSON.parse(cached);
  } catch (_) {}

  let data;
  const res = await fetch(`/boards/hexacoreDaily/${targetDate}.json`);
  if (res.ok) {
    data = await res.json();
  } else {
    // Dev fallback when no prebuilt file exists
    const { generateDailyHexacoreBoard } = await import('./hexacoreDailyGenerator.js');
    data = generateDailyHexacoreBoard({ date: targetDate });
  }

  // Cache so subsequent clicks (or page reloads) re-use the same board today.
  try { localStorage.setItem(cacheKey, JSON.stringify(data)); } catch (_) {}
  return data;
}

function getDailyWordTotal() {
  return hxState.words.reduce((sum, w) => sum + (Number(w.score) || 0), 0);
}

function getDailyUnusedPenalty() {
  return hxState.tiles.reduce((sum, tile) => {
    if (tile.tileType && tile.tileType !== 'normal') return sum;
    return sum + (Number(tile.point) || 0);
  }, 0);
}

function updateDailyHud() {
  if (hxGameMode !== 'daily') return;
  const root = document.getElementById('hx-daily-hud');
  if (!root) return;

  const tilesLeft = hxState.tiles.length;
  const wordTotal = getDailyWordTotal();
  const penalty = getDailyUnusedPenalty();
  const preview = Math.max(0, wordTotal - penalty);

  document.getElementById('hx-daily-tiles-left')?.replaceChildren(document.createTextNode(String(tilesLeft)));
  document.getElementById('hx-daily-word-total')?.replaceChildren(document.createTextNode(wordTotal.toLocaleString()));
  document.getElementById('hx-daily-penalty')?.replaceChildren(document.createTextNode(penalty.toLocaleString()));
  document.getElementById('hx-daily-preview')?.replaceChildren(document.createTextNode(preview.toLocaleString()));
}

function hasAnyDailyWordLeft() {
  return analyzeBoard(DAILY_ENDCHECK_MAX_RESULTS, DAILY_ENDCHECK_TIME_LIMIT_MS).length > 0;
}

/* ── Grid construction ─────────────────────────────────────────── */
function buildGrid(onReady, boardData = null) {
  const board = document.createElementNS(SVG_NS, 'g');
  board.setAttribute('id', 'board');

  const { updateViewForBoard } = initSvg(hxSvg, {
    preserveAspectRatio: 'xMidYMid meet',
    defaultViewBox: '0 0 1000 1000',
    mobileBreakpoint: 768,
    pad: 12,
  });
  hxUpdateViewForBoard = updateViewForBoard;

  // ── Phase 1: collect coords grouped by ring ─────────────────────
  const allCoords = [];
  for (let q = -GRID_RADIUS; q <= GRID_RADIUS; q++) {
    for (let r = -GRID_RADIUS; r <= GRID_RADIUS; r++) {
      if (Math.abs(-q - r) <= GRID_RADIUS) allCoords.push({ q, r });
    }
  }

  const byRing = [[], [], [], [], []];
  allCoords.forEach(({ q, r }) => {
    const ring = Math.max(Math.abs(q), Math.abs(r), Math.abs(-q - r));
    if (ring <= 4) byRing[ring].push({ q, r });
  });

  // Reset complement hints for fresh board
  pendingDigraphComplements = new Map();

  // ── Phase 2: place tiles ring-by-ring (0 → 4) ───────────────────
  // Processing ring by ring ensures each tile sees already-placed neighbors.
  const spiralCoords = [...byRing[0], ...byRing[1], ...byRing[2], ...byRing[3], ...byRing[4]];

  // Endless/Campaign keep procedural generation. Daily uses prebuilt fixed letters.
  const isDaily = hxGameMode === 'daily';
  const dailyGrid = (isDaily && boardData?.grid) ? boardData.grid : null;

  // Pre-designate vowel slots for endless/campaign generation
  const vowelTargets = new Set();
  if (!dailyGrid) {
    const VOWEL_DENSITY = 0.28;
    byRing[0].forEach(c => vowelTargets.add(hxKey(c.q, c.r)));
    byRing[1]
      .slice().sort(() => Math.random() - 0.5)
      .slice(0, 2)
      .forEach(c => vowelTargets.add(hxKey(c.q, c.r)));
    const outerCoords = [...byRing[2], ...byRing[3], ...byRing[4]]
      .slice().sort(() => Math.random() - 0.5);
    const totalVowels = Math.round(allCoords.length * VOWEL_DENSITY);
    outerCoords
      .slice(0, Math.max(0, totalVowels - vowelTargets.size))
      .forEach(c => vowelTargets.add(hxKey(c.q, c.r)));
  }

  for (const { q, r } of spiralCoords) {
    const key = hxKey(q, r);
    const s   = -q - r;

    let result;
    const forcedLetter = dailyGrid?.[key];
    if (forcedLetter) {
      result = { isDigraph: false, letter: String(forcedLetter).toUpperCase() };
    } else if (vowelTargets.has(key)) {
      result = {
        isDigraph: false,
        letter: HX_VOWEL_POOL[Math.floor(Math.random() * HX_VOWEL_POOL.length)],
      };
    } else {
      result = randomLetterOrDigraphForPos(q, r);
    }

    const tile = createTile({
      hex:        new Hex(q, r),
      layout:     hxLayout,
      key,
      letter:     result.isDigraph ? result.digraph : result.letter,
      pointValue: result.isDigraph ? result.points  : (HX_LETTER_POINTS[result.letter] || 1),
    });

    if (result.isDigraph) {
      tile.tileType = 'digraph';
      tile.point    = result.points;
      _hxRegisterTile(tile, hxState.digraphTiles);
      applyTileType(tile);
      // Post-placement: mark unplaced neighbors with complement hints
      const nKeys = [
        hxKey(q + 1, r),   hxKey(q - 1, r),
        hxKey(q,     r + 1), hxKey(q,     r - 1),
        hxKey(q + 1, r - 1), hxKey(q - 1, r + 1),
      ];
      const complement = DIGRAPH_COMPLEMENT[result.digraph] || [];
      nKeys.forEach(nk => {
        if (!hxTileMap.has(nk) && complement.length > 0) {
          const existing = pendingDigraphComplements.get(nk) || [];
          pendingDigraphComplements.set(nk, [...existing, ...complement]);
        }
      });
    } else {
      tile.tileType = 'normal';
    }

    hxTileMap.set(key, tile);
    tile.q = q; tile.r = r; tile.s = s;
    hxState.tiles.push(tile);
    board.appendChild(tile.element);

    // Hide until intro animation reveals the tile
    tile.element.style.opacity = '0';
  }

  if (isDaily && Array.isArray(boardData?.specialTiles)) {
    for (const spec of boardData.specialTiles) {
      const key = hxKey(spec.q, spec.r);
      const tile = hxTileMap.get(key);
      if (!tile) continue;
      convertTile(tile, spec.type);
    }
  }

  hxSvg.appendChild(board);

  // Tighten viewBox to board bounds on mobile FIRST,
  // then pre-position tiles and kick off the intro animation —
  // all in one rAF so the viewBox is settled before we
  // convert screen → SVG coordinates.
  requestAnimationFrame(() => {
    if (hxUpdateViewForBoard) hxUpdateViewForBoard(board);

    // Pre-position all tiles at the title element so the pour-in starts there
    const titleEl = document.getElementById('game-title');
    const ctm     = hxSvg.getScreenCTM()?.inverse();
    if (titleEl && ctm) {
      const rect  = titleEl.getBoundingClientRect();
      const svgPt = hxSvg.createSVGPoint();
      svgPt.x     = rect.left + rect.width  / 2;
      svgPt.y     = rect.top  + rect.height / 2;
      const origin = svgPt.matrixTransform(ctm);

      hxState.tiles.forEach(tile => {
        const center = hxLayout.hexToPixel(new Hex(tile.q, tile.r));
        tile.element.setAttribute(
          'transform',
          `translate(${origin.x - center.x},${origin.y - center.y})`,
        );
      });
    }

    // Start the cascade intro (sets hxState.active = true when done)
    animateGridIntro().then(() => { if (onReady) onReady(); });
  });
}

/* ── Intro cascade: tiles pour from the title into their positions ─ */
async function animateGridIntro() {
  const titleEl = document.getElementById('game-title');
  const ctm     = hxSvg.getScreenCTM()?.inverse();

  if (!titleEl || !ctm) {
    // Fallback: no animation — just show everything immediately
    hxState.tiles.forEach(t => { t.element.style.opacity = '1'; t.element.removeAttribute('transform'); });
    hxState.active = true;
    return;
  }

  const rect  = titleEl.getBoundingClientRect();
  const svgPt = hxSvg.createSVGPoint();
  svgPt.x     = rect.left + rect.width  / 2;
  svgPt.y     = rect.top  + rect.height / 2;
  const origin = svgPt.matrixTransform(ctm);

  // Process rows top-to-bottom
  const rValues = [...new Set(hxState.tiles.map(t => t.r))].sort((a, b) => a - b);

  for (const r of rValues) {
    const rowTiles = hxState.tiles
      .filter(t => t.r === r)
      .sort((a, b) => a.q - b.q); // left → right

    const wavePromises = rowTiles.map((tile, idx) =>
      new Promise(resolve => {
        setTimeout(() => {
          const center = hxLayout.hexToPixel(new Hex(tile.q, tile.r));
          // SVG transform is already translate(origin-center); animateMotion
          // path M 0,0 → M -(origin-center) cancels it, landing at (0,0)
          const dx = center.x - origin.x; // = -(origin-center).x
          const dy = center.y - origin.y;

          // Arc control: left tiles fan SW (-x), right tiles fan SE (+x)
          const arcDir = tile.q < 0 ? -1 : 1;
          const cpX    = dx / 2 + arcDir * INTRO_ARC_OFFSET;
          const cpY    = dy / 2;

          tile.element.style.opacity = '1';

          const anim = document.createElementNS(SVG_NS, 'animateMotion');
          anim.setAttribute('path', `M 0,0 Q ${cpX},${cpY} ${dx},${dy}`);
          anim.setAttribute('dur', '0.5s');
          anim.setAttribute('fill', 'freeze');

          anim.addEventListener('endEvent', () => {
            anim.remove();
            tile.element.removeAttribute('transform');
            tile.element.classList.add('hx-tile-intro-landing');
            resolve();
          }, { once: true });

          tile.element.appendChild(anim);
          anim.beginElement();
        }, idx * 30);
      })
    );

    await Promise.all(wavePromises);
  }

  hxState.active = true;
}


/* ── Rune wildcard resolution ──────────────────────────────────── */
function updateScoreDisplay() {
  const el = document.getElementById('score-display');
  if (!el) return;
  const n = hxState.score;
  el.innerHTML = `<span class="score-num">${n}</span><span class="score-pts"> pts</span>`;
}

function updateHud() {
  const numEl = document.getElementById('hx-score-num');
  if (numEl) numEl.textContent = hxState.score;
  updateXPBarFn();
  updateDailyHud();
}

/* ── Animate the HUD score counting up from oldScore → newScore ── */
let _scoreRafId = 0; // cancel any in-flight count-up before starting a new one
function animateScoreHud(oldScore, newScore) {
  const hud    = document.getElementById('hx-score-hud');
  const numEl  = document.getElementById('hx-score-num');
  if (!hud || !numEl) return;

  // Cancel any in-progress count-up animation
  if (_scoreRafId) { cancelAnimationFrame(_scoreRafId); _scoreRafId = 0; }

  // Restart pop animation (force reflow so the animation restarts if already running)
  hud.classList.remove('hx-score-popping');
  void hud.getBoundingClientRect();
  hud.classList.add('hx-score-popping');
  hud.addEventListener('animationend', () => {
    hud.classList.remove('hx-score-popping');
  }, { once: true });

  // Ease-out count-up via requestAnimationFrame
  const startTime = performance.now();
  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }
  function frame(now) {
    const elapsed  = now - startTime;
    const progress = Math.min(elapsed / SCORE_TICK_MS, 1);
    const current  = Math.round(oldScore + (newScore - oldScore) * easeOut(progress));
    numEl.textContent = current;
    if (progress < 1) { _scoreRafId = requestAnimationFrame(frame); }
    else { _scoreRafId = 0; }
  }
  _scoreRafId = requestAnimationFrame(frame);
}

function updateLevelHud() {
  const el = document.getElementById('hx-level-hud');
  if (!el) return;
  el.textContent = 'MENU';
  el.title = 'Open Hexacore settings';
}

function checkLevelUp(oldScore, newScore) {
  let leveled = false;
  while (newScore >= hxLevelThreshold(hxState.level + 1)) {
    hxState.level++;
    leveled = true;
  }
  if (leveled) {
    updateLevelHud();
    showLevelUpBanner(hxState.level);
  }
}

function getLevelUpMessage(level) {
  const msgs = [
    'KEEP GOING!',
    'WORD WIZARD!',
    'ON FIRE!',
    'UNSTOPPABLE!',
    'LEGEND!',
    'BEYOND LIMITS!',
    'HEXACORE MASTER!',
  ];
  return msgs[Math.max(0, Math.min(level - 2, msgs.length - 1))] ?? 'INCREDIBLE!';
}

function showLevelUpBanner(level) {
  // Remove any existing banner first
  document.getElementById('hx-levelup-banner')?.remove();

  const banner = document.createElement('div');
  banner.id = 'hx-levelup-banner';
  banner.innerHTML = `
    <div class="hx-levelup-ring hx-levelup-ring--1"></div>
    <div class="hx-levelup-ring hx-levelup-ring--2"></div>
    <div class="hx-levelup-ring hx-levelup-ring--3"></div>
    <div class="hx-levelup-backdrop">
      <div class="hx-levelup-stars" aria-hidden="true">
        <span class="hx-levelup-star" style="--star-i:0">★</span>
        <span class="hx-levelup-star" style="--star-i:1">★</span>
        <span class="hx-levelup-star" style="--star-i:2">★</span>
        <span class="hx-levelup-star" style="--star-i:3">★</span>
        <span class="hx-levelup-star" style="--star-i:4">★</span>
      </div>
      <span class="hx-levelup-label">HEXACORE</span>
      <span class="hx-levelup-title">LEVEL UP!</span>
      <div class="hx-levelup-divider"></div>
      <span class="hx-levelup-num">${level}</span>
      <span class="hx-levelup-sub">${getLevelUpMessage(level)}</span>
      <button class="hx-levelup-ok-btn" type="button" aria-label="Dismiss level-up banner">OK</button>
    </div>
  `;
  document.body.appendChild(banner);

  banner.querySelector('.hx-levelup-ok-btn').addEventListener('click', () => {
    banner.remove();
    applyLevelUpRewards();
  });
}

/**
 * Fires after the player dismisses the Level-Up banner (every level).
 * Converts up to 2 basic/Emerald tiles → Prism, 1 → Rune,
 * 1 → Lodestone, 1 → Amethyst, and opens a Portal if one isn't active.
 */
function applyLevelUpRewards() {
  const DELAY = 1200; // ms between each reward step (stagger so each is visible)

  function showRewardToast(msg, icon) {
    document.getElementById('hx-lv2-reward-toast')?.remove();
    const toast = document.createElement('div');
    toast.id = 'hx-lv2-reward-toast';
    toast.style.cssText = [
      'position:fixed', 'bottom:22%', 'left:50%',
      'transform:translateX(-50%) translateY(12px)',
      'background:rgba(15,10,35,0.93)',
      'color:#e0d4ff',
      'border:1px solid rgba(139,92,246,0.6)',
      'border-radius:12px',
      'padding:10px 22px',
      'font-size:14px',
      'font-family:inherit',
      'text-align:center',
      'z-index:2200',
      'opacity:0',
      'transition:opacity 0.3s ease, transform 0.3s ease',
      'pointer-events:none',
      'max-width:320px',
    ].join(';');
    toast.innerHTML = `<strong>${icon}</strong> ${escapeHtml(msg)}`;
    document.body.appendChild(toast);
    requestAnimationFrame(() => {
      toast.style.opacity = '1';
      toast.style.transform = 'translateX(-50%) translateY(0)';
    });
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(-50%) translateY(-10px)';
      toast.addEventListener('transitionend', () => toast.remove(), { once: true });
      setTimeout(() => toast.remove(), 400);
    }, DELAY - 300);
  }

  // Eligible tiles: normal or Emerald gem, not a portal tile
  const converted = [];
  function pickEligibleTile() {
    const eligible = hxState.tiles.filter(
      t => (t.tileType === 'normal' || t.tileType === 'gemEmerald')
        && !isPortalTile(t)
        && !converted.includes(t),
    );
    if (eligible.length === 0) return null;
    return eligible[Math.floor(Math.random() * eligible.length)];
  }

  function convertTile(tile, targetType) {
    if (!tile) return;
    _hxClearTileType(tile);
    tile.tileType = targetType;
    if (targetType === 'prism')     _hxRegisterTile(tile, hxState.prismTiles);
    else if (targetType === 'rune') _hxRegisterTile(tile, hxState.runeTiles);
    else if (targetType === 'lodestone') _hxRegisterTile(tile, hxState.lodestoneTiles);
    else if (targetType === 'amethyst')  _hxRegisterTile(tile, hxState.amethystTiles);
    applyTileType(tile);
    enqueueTileIntroduction(tile);
    tile.element.classList.add(`hx-${targetType}-spawn`);
    tile.element.addEventListener('animationend', () => {
      tile.element.classList.remove(`hx-${targetType}-spawn`);
    }, { once: true });
    converted.push(tile);
  }

  // Step 1 — Prism #1
  setTimeout(() => {
    const t = pickEligibleTile();
    convertTile(t, 'prism');
    showRewardToast('Prism Tile: doubles the score of any word it joins!', '🔷');
  }, 0);

  // Step 2 — Prism #2
  setTimeout(() => {
    const t = pickEligibleTile();
    convertTile(t, 'prism');
    showRewardToast('Another Prism Tile added!', '🔷');
  }, DELAY);

  // Step 3 — Rune
  setTimeout(() => {
    const t = pickEligibleTile();
    convertTile(t, 'rune');
    showRewardToast('Rune Tile: a wildcard — any letter you need.', '🔮');
  }, DELAY * 2);

  // Step 4 — Portal (skip if already open)
  setTimeout(() => {
    if (!hxState.portalOpen) {
      openPortal();
      showRewardToast('Portal: trace through one corner tile to link to the other!', '🌀');
    }
  }, DELAY * 3);

  // Step 5 — Lodestone
  setTimeout(() => {
    const t = pickEligibleTile();
    convertTile(t, 'lodestone');
    showRewardToast('Lodestone: boosts gem scoring for your next word!', '⬡');
  }, DELAY * 4);

  // Step 6 — Amethyst
  setTimeout(() => {
    const t = pickEligibleTile();
    convertTile(t, 'amethyst');
    showRewardToast("Amethyst: transmute any tile's letter into one of your choice!", '💜');
  }, DELAY * 5);
}

function showRestoredBanner(level, score) {
  document.getElementById('hx-restored-banner')?.remove();

  const banner = document.createElement('div');
  banner.id = 'hx-restored-banner';
  banner.style.cssText = [
    'position:fixed', 'top:50%', 'left:50%',
    'transform:translate(-50%,-50%)',
    'z-index:1100',
    'display:flex', 'flex-direction:column', 'align-items:center', 'gap:4px',
    'animation:hx-levelup-pop 2s cubic-bezier(0.22,1,0.36,1) forwards',
    'pointer-events:none',
  ].join(';');
  banner.innerHTML = `<span class="hx-levelup-title" style="color:#4cc9f0">GAME RESTORED</span><span class="hx-levelup-num">LEVEL ${level} &middot; SCORE ${score}</span>`;
  document.body.appendChild(banner);

  banner.addEventListener('animationend', () => banner.remove(), { once: true });
  setTimeout(() => banner.remove(), 2500);
}

/* ── XP toast and player level-up banner ───────────────────────── */
function showXPGainToast(xp) {
  const toast = document.createElement('div');
  toast.className = 'hx-xp-toast';
  toast.textContent = `+${xp} XP`;
  document.body.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add('hx-xp-toast-visible'));
  setTimeout(() => {
    toast.classList.remove('hx-xp-toast-visible');
    toast.addEventListener('transitionend', () => toast.remove(), { once: true });
    setTimeout(() => toast.remove(), 600);
  }, 1200);
}

function showPlayerLevelUpBanner(newLevel) {
  document.getElementById('hx-player-levelup-banner')?.remove();

  const isMax = newLevel >= HX_MAX_LEVEL;
  const banner = document.createElement('div');
  banner.id = 'hx-player-levelup-banner';
  banner.innerHTML = `
    <div class="hx-levelup-ring hx-levelup-ring--1 hx-levelup-ring--xp"></div>
    <div class="hx-levelup-ring hx-levelup-ring--2 hx-levelup-ring--xp"></div>
    <div class="hx-levelup-ring hx-levelup-ring--3 hx-levelup-ring--xp"></div>
    <div class="hx-levelup-backdrop hx-levelup-backdrop--xp">
      <div class="hx-levelup-stars hx-levelup-stars--xp" aria-hidden="true">
        <span class="hx-levelup-star hx-levelup-star--xp" style="--star-i:0">✦</span>
        <span class="hx-levelup-star hx-levelup-star--xp" style="--star-i:1">✦</span>
        <span class="hx-levelup-star hx-levelup-star--xp" style="--star-i:2">✦</span>
      </div>
      <span class="hx-levelup-label hx-levelup-label--xp">PLAYER</span>
      <span class="hx-levelup-title hx-levelup-title--xp">${isMax ? 'MAX LEVEL!' : 'LEVEL UP!'}</span>
      <div class="hx-levelup-divider hx-levelup-divider--xp"></div>
      <span class="hx-levelup-num hx-levelup-num--xp">${newLevel}</span>
      <span class="hx-levelup-sub hx-levelup-sub--xp">${isMax ? 'LEGEND RANK ACHIEVED' : 'RANK INCREASED'}</span>
      <button class="hx-levelup-ok-btn hx-levelup-ok-btn--xp" type="button" aria-label="Dismiss level-up banner">OK</button>
    </div>
  `;
  document.body.appendChild(banner);

  banner.querySelector('.hx-levelup-ok-btn').addEventListener('click', () => banner.remove());

  // LVL button badge-pop + XP bar glow sweep
  const lvlBtn = document.getElementById('hx-level-hud');
  const xpContainer = document.getElementById('hx-xp-bar-container');
  if (lvlBtn) {
    lvlBtn.classList.remove('hx-levelup-badge-pop');
    requestAnimationFrame(() => lvlBtn.classList.add('hx-levelup-badge-pop'));
    setTimeout(() => lvlBtn.classList.remove('hx-levelup-badge-pop'), 900);
  }
  if (xpContainer) {
    xpContainer.classList.remove('hx-xp-bar-flash');
    requestAnimationFrame(() => xpContainer.classList.add('hx-xp-bar-flash'));
    setTimeout(() => xpContainer.classList.remove('hx-xp-bar-flash'), 1000);
  }
}

function ensureHud() {
  if (document.getElementById('hx-score-hud')) return;

  // Mode colors matching the mode-select screen
  const HX_MODE_COLORS = { endless: '#f97316', daily: '#4cc9f0', campaign: '#a855f7' };

  // Score HUD — split into number + label spans, with a small mode color dot
  const hud = document.createElement('div');
  hud.id = 'hx-score-hud';
  hud.setAttribute('data-mode', hxGameMode);
  hud.style.setProperty('--hx-mode-color', HX_MODE_COLORS[hxGameMode] ?? '#a78bfa');
  hud.innerHTML = '<span id="hx-mode-dot" aria-hidden="true"></span><span id="hx-score-num">0</span><span id="hx-score-label"> PTS</span>';
  document.body.appendChild(hud);

  const liveWordEl = document.createElement('div');
  liveWordEl.id = 'hx-live-word';
  document.body.appendChild(liveWordEl);

  const wordHud = document.createElement('div');
  wordHud.id = 'hx-word-score-hud';
  document.body.appendChild(wordHud);

  if (hxGameMode === 'daily') {
    const dailyHud = document.createElement('div');
    dailyHud.id = 'hx-daily-hud';
    dailyHud.innerHTML = `
      <div class="hx-daily-hud-row"><span>Tiles Left</span><strong id="hx-daily-tiles-left">61</strong></div>
      <div class="hx-daily-hud-row"><span>Word Total</span><strong id="hx-daily-word-total">0</strong></div>
      <div class="hx-daily-hud-row"><span>Penalty</span><strong id="hx-daily-penalty">0</strong></div>
      <div class="hx-daily-hud-row"><span>Final Preview</span><strong id="hx-daily-preview">0</strong></div>
      <button id="hx-daily-submit-btn" type="button">SUBMIT DAILY CHALLENGE</button>
      <button id="hx-daily-reset-btn" type="button">RESET BOARD</button>
    `;
    document.body.appendChild(dailyHud);
    dailyHud.querySelector('#hx-daily-submit-btn')?.addEventListener('click', () => completeDailyChallenge());
    dailyHud.querySelector('#hx-daily-reset-btn')?.addEventListener('click', () => {
      if (confirm('Reset the daily board? Your current progress will be lost.')) {
        startHexacore('daily');
      }
    });
  }

  // Top bar: centered Hexacore menu button with XP bar below it
  const hxTopBar = document.createElement('div');
  hxTopBar.id = 'hx-top-bar';

  // Row: [Amethyst pill] [MENU button capsule] [Selenite pill]
  const topMenuRow = document.createElement('div');
  topMenuRow.id = 'hx-top-menu-row';

  const powerUpBarLeft = document.createElement('div');
  powerUpBarLeft.id = 'hx-powerup-bar-left';

  // Center rail — unified MENU button with XP bar beneath it
  const levelWrap = document.createElement('div');
  levelWrap.id = 'hx-level-wrap';

  const levelHud = document.createElement('button');
  levelHud.id = 'hx-level-hud';
  levelHud.type = 'button';
  levelHud.textContent = 'MENU';
  levelHud.title = 'Open Hexacore settings';
  levelHud.setAttribute('aria-haspopup', 'dialog');
  levelHud.setAttribute('aria-label', 'Open Hexacore settings');
  levelHud.addEventListener('click', () => document.getElementById('settings-btn')?.click());

  const xpBar = document.createElement('div');
  xpBar.id = 'hx-xp-bar-container';
  xpBar.setAttribute('role', 'progressbar');
  xpBar.setAttribute('aria-valuemin', '0');
  xpBar.setAttribute('aria-valuemax', '100');
  xpBar.setAttribute('aria-valuenow', '0');
  xpBar.setAttribute('aria-label', 'Player XP progress');
  xpBar.setAttribute('tabindex', '0');
  xpBar.innerHTML = '<div id="hx-xp-bar-fill"></div><span id="hx-xp-label" aria-hidden="true">LV 1 · 0/80 XP</span>';

  const powerUpBarRight = document.createElement('div');
  powerUpBarRight.id = 'hx-powerup-bar-right';

  levelWrap.appendChild(levelHud);

  topMenuRow.appendChild(powerUpBarLeft);
  topMenuRow.appendChild(levelWrap);
  topMenuRow.appendChild(powerUpBarRight);

  hxTopBar.appendChild(topMenuRow);
  // XP bar is shown for endless/campaign only — daily mode has no XP
  if (hxGameMode !== 'daily') {
    hxTopBar.appendChild(xpBar);
  }
  document.body.appendChild(hxTopBar);

  if (hxGameMode !== 'daily') {
    updateXPBarFn();
  }
}

function removeHud() {
  document.getElementById('hx-score-hud')?.remove();
  document.getElementById('hx-xp-bar-container')?.remove();
  document.getElementById('hx-word-score-hud')?.remove();
  document.getElementById('hx-live-word')?.remove();
  document.getElementById('hx-daily-hud')?.remove();
  document.getElementById('hx-top-bar')?.remove();
  document.getElementById('hx-powerup-toast')?.remove();
  document.getElementById('hx-powerup-indicator')?.remove();
  document.getElementById('hx-daily-no-words-overlay')?.remove();
}

/* ── Requirements persistence ──────────────────────────────────── */
function saveHexacoreRequirements() {
  try {
    localStorage.setItem(HX_REQ_SAVE_KEY, JSON.stringify([...hxCompletedReqs]));
  } catch (_) { /* quota / private */ }
}

function loadHexacoreRequirements() {
  try {
    const json = localStorage.getItem(HX_REQ_SAVE_KEY);
    if (!json) return [];
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) { return []; }
}

/* ── Auto-check requirements after word submission ─────────────── */
function checkHexacoreRequirements(word, tiles, score) {
  const newlyCompleted = [];
  for (const req of HX_LEVEL_REQUIREMENTS) {
    if (hxCompletedReqs.has(req.id)) continue;
    try {
      if (req.check(word, tiles, hxState, score)) {
        hxCompletedReqs.add(req.id);
        newlyCompleted.push(req.description);
      }
    } catch (_) { /* skip malformed checks */ }
  }
  if (newlyCompleted.length > 0) {
    saveHexacoreRequirements();
    newlyCompleted.forEach((desc, i) => {
      setTimeout(() => showRequirementToast(desc), i * 700);
    });
    // Refresh standalone challenges modal if it's open
    if (document.getElementById('hx-challenges-modal')) {
      renderChallengesModal();
    }
    // Refresh challenges section inside quests modal if it's open
    const questsChallengesBody = document.getElementById('hx-quests-challenges-body');
    if (questsChallengesBody) {
      window._hxRenderChallengesInto?.(questsChallengesBody);
    }
  }
}

/* ── Requirement completion toast ──────────────────────────────── */
function showRequirementToast(description) {
  document.getElementById('hx-req-toast')?.remove();
  const toast = document.createElement('div');
  toast.id = 'hx-req-toast';
  toast.innerHTML = `<span class="hx-req-toast-title">✓ CHALLENGE COMPLETE</span><span class="hx-req-toast-desc">${escapeHtml(description)}</span>`;
  document.body.appendChild(toast);
  // Trigger enter animation after paint
  requestAnimationFrame(() => toast.classList.add('hx-req-toast-visible'));
  setTimeout(() => {
    toast.classList.remove('hx-req-toast-visible');
    // Remove once the fade-out transition ends, with a max-wait fallback
    let removed = false;
    const doRemove = () => { if (!removed) { removed = true; toast.remove(); } };
    toast.addEventListener('transitionend', doRemove, { once: true });
    setTimeout(doRemove, 600);
  }, 2500);
}

/* ── Challenges modal ──────────────────────────────────────────── */

const HX_TIER_CONFIG = {
  spark:   { label: '⚡ SPARK',     color: '#fbbf24', className: 'hx-tier-spark' },
  blaze:   { label: '🔥 BLAZE',     color: '#f97316', className: 'hx-tier-blaze' },
  inferno: { label: '💎 INFERNO',   color: '#ef4444', className: 'hx-tier-inferno' },
  ascend:  { label: '🌟 ASCENDANT', color: '#a855f7', className: 'hx-tier-ascendant' },
};

function getTierFromId(id) {
  for (const key of Object.keys(HX_TIER_CONFIG)) {
    if (id.startsWith(key + '_') || id === key) return key;
  }
  return 'spark';
}

function openChallengesModal() {
  document.getElementById('hx-challenges-modal')?.remove();

  const modal = document.createElement('div');
  modal.id = 'hx-challenges-modal';

  const box = document.createElement('div');
  box.id = 'hx-challenges-box';
  modal.appendChild(box);

  // Header
  const header = document.createElement('div');
  header.id = 'hx-challenges-header';
  const completed = hxCompletedReqs.size;
  const total     = HX_LEVEL_REQUIREMENTS.length;
  header.innerHTML = `
    <span class="hx-challenges-title">📋 CHALLENGES</span>
    <span class="hx-challenges-progress">${completed} / ${total} COMPLETE</span>
    <button id="hx-challenges-close" aria-label="Close challenges">✕</button>
  `;
  box.appendChild(header);

  // Body
  const body = document.createElement('div');
  body.id = 'hx-challenges-body';
  box.appendChild(body);

  modal.appendChild(box);
  document.body.appendChild(modal);

  renderChallengesModal();

  document.getElementById('hx-challenges-close')
    ?.addEventListener('click', () => modal.remove());
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
}

function renderChallengesModal() {
  const body = document.getElementById('hx-challenges-body');
  if (!body) return;

  const completed = hxCompletedReqs.size;
  const total     = HX_LEVEL_REQUIREMENTS.length;

  const progressEl = document.querySelector('#hx-challenges-header .hx-challenges-progress');
  if (progressEl) progressEl.textContent = `${completed} / ${total} COMPLETE`;

  // Group requirements by tier prefix
  const tierMap = new Map([
    ['spark',   []],
    ['blaze',   []],
    ['inferno', []],
    ['ascend',  []],
  ]);

  for (const req of HX_LEVEL_REQUIREMENTS) {
    const tier = getTierFromId(req.id);
    if (!tierMap.has(tier)) tierMap.set(tier, []);
    tierMap.get(tier).push(req);
  }

  body.innerHTML = '';

  for (const [tierKey, reqs] of tierMap) {
    if (reqs.length === 0) continue;
    const cfg        = HX_TIER_CONFIG[tierKey] ?? HX_TIER_CONFIG.spark;
    const doneCount  = reqs.filter(r => hxCompletedReqs.has(r.id)).length;
    const pct        = Math.round((doneCount / reqs.length) * 100);

    const section = document.createElement('div');
    section.className = `hx-challenges-section ${cfg.className}`;

    section.innerHTML = `
      <div class="hx-challenges-tier-header">
        <span class="hx-challenges-tier-label">${cfg.label}</span>
        <span class="hx-challenges-section-count">${doneCount}/${reqs.length}</span>
      </div>
      <div class="hx-challenges-tier-bar">
        <div class="hx-challenges-tier-bar-fill" style="width:${pct}%;background:${cfg.color}"></div>
      </div>
    `;

    for (const req of reqs) {
      const isDone = hxCompletedReqs.has(req.id);
      const item = document.createElement('div');
      item.className = 'hx-challenge-item' + (isDone ? ' hx-challenge-done' : '');
      item.innerHTML = `
        <div class="hx-challenge-row">
          <span class="hx-challenge-check">${isDone ? '✓' : '☐'}</span>
          <span class="hx-challenge-desc">${escapeHtml(req.description)}</span>
        </div>`;
      section.appendChild(item);
    }

    body.appendChild(section);
  }
}

/**
 * Register a global callback used by hexacoreQuests.js to render challenges
 * inline inside the quests modal (avoiding a circular import).
 */
window._hxRenderChallengesInto = function(container) {
  if (!container) return;

  const tierMap = new Map([
    ['spark',   []],
    ['blaze',   []],
    ['inferno', []],
    ['ascend',  []],
  ]);

  for (const req of HX_LEVEL_REQUIREMENTS) {
    const tier = getTierFromId(req.id);
    if (!tierMap.has(tier)) tierMap.set(tier, []);
    tierMap.get(tier).push(req);
  }

  container.innerHTML = '';

  for (const [tierKey, reqs] of tierMap) {
    if (reqs.length === 0) continue;
    const cfg       = HX_TIER_CONFIG[tierKey] ?? HX_TIER_CONFIG.spark;
    const doneCount = reqs.filter(r => hxCompletedReqs.has(r.id)).length;
    const pct       = Math.round((doneCount / reqs.length) * 100);

    const section = document.createElement('div');
    section.className = `hx-challenges-section ${cfg.className}`;

    section.innerHTML = `
      <div class="hx-challenges-tier-header">
        <span class="hx-challenges-tier-label">${cfg.label}</span>
        <span class="hx-challenges-section-count">${doneCount}/${reqs.length}</span>
      </div>
      <div class="hx-challenges-tier-bar">
        <div class="hx-challenges-tier-bar-fill" style="width:${pct}%;background:${cfg.color}"></div>
      </div>
    `;

    for (const req of reqs) {
      const isDone = hxCompletedReqs.has(req.id);
      const item = document.createElement('div');
      item.className = 'hx-challenge-item' + (isDone ? ' hx-challenge-done' : '');
      item.innerHTML = `
        <div class="hx-challenge-row">
          <span class="hx-challenge-check">${isDone ? '✓' : '☐'}</span>
          <span class="hx-challenge-desc">${escapeHtml(req.description)}</span>
        </div>`;
      section.appendChild(item);
    }

    container.appendChild(section);
  }
};

/* ── Word display / selection ──────────────────────────────────── */
function updateWordDisplay() {
  const el = document.getElementById('current-word');
  if (el) {
    el.textContent = hxSelected
      .map(t => t.tileType === 'rune' ? '?' : t.letter)
      .join('');
  }
  const liveEl = document.getElementById('hx-live-word');
  if (liveEl) {
    liveEl.textContent = hxSelected.map(t => t.tileType === 'rune' ? '?' : t.letter).join('');
  }
  updateWordScorePreview();
}

/* ── Gem scoring constants ─────────────────────────────────────── */
const GEM_MULTIPLIERS = {
  gemEmerald:      2,
  gemGold:         3,
  gemSapphire:     4,
  gemPearl:        5,
  gemTanzanite:    6,
  gemRuby:         7,
  gemDiamond:      8,
  gemAquamarine:   9,
  gemTopaz:        10,
  gemOpal:         11,
  gemImperialJade: 12,
  gemAlexandrite:  13,
};
// Count bonus = number of unique gem types used (diversity bonus).
// e.g. 3 Emeralds → 1 unique type → count bonus = 1

/* ── Level requirements checklist ─────────────────────────────── */
/**
 * Each entry: { id, section, description, check(word, tiles, state, score) }
 * `word`  — the fully resolved word string (digraph contributes 2 chars)
 * `tiles` — array of tile objects selected
 * `state` — hxState snapshot
 * `score` — final word score for this submission
 */
const HX_LEVEL_REQUIREMENTS = [

  // ── ⚡ SPARK: Entry-level ─────────────────────────────────────
  {
    id: 'spark_4letter',
    section: 'CHALLENGES',
    description: 'SUBMIT A WORD OF 4 OR MORE LETTERS',
    check(word) { return word.length >= 4; },
  },
  {
    id: 'spark_prism',
    section: 'CHALLENGES',
    description: 'USE A PRISM TILE IN ANY WORD',
    check(word, tiles) { return tiles.some(t => t.tileType === 'prism'); },
  },
  {
    id: 'spark_rune',
    section: 'CHALLENGES',
    description: 'USE A RUNE WILDCARD TILE IN ANY WORD',
    check(word, tiles) { return tiles.some(t => t.tileType === 'rune'); },
  },
  {
    id: 'spark_digraph',
    section: 'CHALLENGES',
    description: 'USE A DIGRAPH TILE IN ANY WORD',
    check(word, tiles) { return tiles.some(t => t.tileType === 'digraph'); },
  },
  {
    id: 'spark_ember',
    section: 'CHALLENGES',
    description: 'USE A FIRE TILE IN ANY WORD',
    check(word, tiles) { return tiles.some(t => t.tileType === 'ember'); },
  },
  {
    id: 'spark_gem_emerald',
    section: 'CHALLENGES',
    description: 'USE AN EMERALD GEM IN ANY WORD',
    check(word, tiles) { return tiles.some(t => t.tileType === 'gemEmerald'); },
  },
  {
    id: 'spark_gem_gold',
    section: 'CHALLENGES',
    description: 'USE A GOLD GEM IN ANY WORD',
    check(word, tiles) { return tiles.some(t => t.tileType === 'gemGold'); },
  },
  {
    id: 'spark_gem_sapphire',
    section: 'CHALLENGES',
    description: 'USE A SAPPHIRE GEM IN ANY WORD',
    check(word, tiles) { return tiles.some(t => t.tileType === 'gemSapphire'); },
  },
  {
    id: 'spark_gem_pearl',
    section: 'CHALLENGES',
    description: 'USE A PEARL GEM IN ANY WORD',
    check(word, tiles) { return tiles.some(t => t.tileType === 'gemPearl'); },
  },
  {
    id: 'spark_5clean',
    section: 'CHALLENGES',
    description: 'FORM A 5-LETTER WORD WITH NO GEMS OR DIGRAPHS',
    check(word, tiles) {
      return word.length === 5 &&
        !tiles.some(t => HX_GEM_TYPES.has(t.tileType) || t.tileType === 'digraph');
    },
  },
  {
    id: 'spark_5digraph',
    section: 'CHALLENGES',
    description: 'FORM A 5-LETTER WORD USING A DIGRAPH TILE',
    check(word, tiles) {
      return word.length === 5 && tiles.some(t => t.tileType === 'digraph');
    },
  },
  {
    id: 'spark_5ember',
    section: 'CHALLENGES',
    description: 'FORM A 5-LETTER WORD WITH A FIRE TILE',
    check(word, tiles) {
      return word.length === 5 && tiles.some(t => t.tileType === 'ember');
    },
  },
  {
    id: 'spark_5gem',
    section: 'CHALLENGES',
    description: 'FORM A 5-LETTER WORD WITH ANY GEM TILE',
    check(word, tiles) {
      return word.length === 5 && tiles.some(t => HX_GEM_TYPES.has(t.tileType));
    },
  },
  {
    id: 'spark_two_digraphs',
    section: 'CHALLENGES',
    description: 'USE 2 DIGRAPH TILES IN THE SAME WORD',
    check(word, tiles) {
      return tiles.filter(t => t.tileType === 'digraph').length >= 2;
    },
  },
  {
    id: 'spark_5score500',
    section: 'CHALLENGES',
    description: 'SCORE 500+ POINTS ON A SINGLE 5-LETTER WORD',
    check(word, tiles, state, score) {
      return word.length === 5 && score >= 500;
    },
  },

  // ── 🔥 BLAZE: Intermediate ────────────────────────────────────
  {
    id: 'blaze_6clean',
    section: 'CHALLENGES',
    description: 'FORM A 6-LETTER WORD WITH NO GEMS OR DIGRAPHS',
    check(word, tiles) {
      return word.length === 6 &&
        !tiles.some(t => HX_GEM_TYPES.has(t.tileType) || t.tileType === 'digraph');
    },
  },
  {
    id: 'blaze_6digraph_gem',
    section: 'CHALLENGES',
    description: 'FORM A 6-LETTER WORD WITH A DIGRAPH AND A GEM',
    check(word, tiles) {
      return word.length === 6 &&
        tiles.some(t => t.tileType === 'digraph') &&
        tiles.some(t => HX_GEM_TYPES.has(t.tileType));
    },
  },
  {
    id: 'blaze_6ember_gem',
    section: 'CHALLENGES',
    description: 'FORM A 6-LETTER WORD WITH A FIRE TILE AND A GEM',
    check(word, tiles) {
      return word.length === 6 &&
        tiles.some(t => t.tileType === 'ember') &&
        tiles.some(t => HX_GEM_TYPES.has(t.tileType));
    },
  },
  {
    id: 'blaze_6prism',
    section: 'CHALLENGES',
    description: 'FORM A 6-LETTER WORD USING A PRISM TILE',
    check(word, tiles) {
      return word.length === 6 && tiles.some(t => t.tileType === 'prism');
    },
  },
  {
    id: 'blaze_6score2k',
    section: 'CHALLENGES',
    description: 'SCORE 2,000+ POINTS ON A SINGLE 6-LETTER WORD',
    check(word, tiles, state, score) {
      return word.length === 6 && score >= 2000;
    },
  },
  {
    id: 'blaze_gem_tanzanite',
    section: 'CHALLENGES',
    description: 'USE A TANZANITE GEM IN ANY WORD',
    check(word, tiles) { return tiles.some(t => t.tileType === 'gemTanzanite'); },
  },
  {
    id: 'blaze_gem_ruby',
    section: 'CHALLENGES',
    description: 'USE A RUBY GEM IN ANY WORD',
    check(word, tiles) { return tiles.some(t => t.tileType === 'gemRuby'); },
  },
  {
    id: 'blaze_ember_prism',
    section: 'CHALLENGES',
    description: 'USE A FIRE TILE AND A PRISM TILE IN THE SAME WORD',
    check(word, tiles) {
      return tiles.some(t => t.tileType === 'ember') &&
             tiles.some(t => t.tileType === 'prism');
    },
  },
  {
    id: 'blaze_prism_rune',
    section: 'CHALLENGES',
    description: 'USE A PRISM TILE AND A RUNE TILE IN THE SAME WORD',
    check(word, tiles) {
      return tiles.some(t => t.tileType === 'prism') &&
             tiles.some(t => t.tileType === 'rune');
    },
  },
  {
    id: 'blaze_7clean',
    section: 'CHALLENGES',
    description: 'FORM A 7-LETTER WORD WITH NO GEMS OR DIGRAPHS',
    check(word, tiles) {
      return word.length === 7 &&
        !tiles.some(t => HX_GEM_TYPES.has(t.tileType) || t.tileType === 'digraph');
    },
  },
  {
    id: 'blaze_7gem2types',
    section: 'CHALLENGES',
    description: 'FORM A 7-LETTER WORD WITH 2 DIFFERENT GEM TYPES',
    check(word, tiles) {
      return word.length === 7 &&
        new Set(tiles.filter(t => HX_GEM_TYPES.has(t.tileType)).map(t => t.tileType)).size >= 2;
    },
  },
  {
    id: 'blaze_7ember_digraph',
    section: 'CHALLENGES',
    description: 'FORM A 7-LETTER WORD WITH A FIRE TILE AND A DIGRAPH',
    check(word, tiles) {
      return word.length === 7 &&
        tiles.some(t => t.tileType === 'ember') &&
        tiles.some(t => t.tileType === 'digraph');
    },
  },
  {
    id: 'blaze_7portal',
    section: 'CHALLENGES',
    description: 'FORM A 7-LETTER WORD THAT TRAVERSES THE PORTAL',
    check(word, tiles, state) {
      if (word.length !== 7) return false;
      if (!state.portalOpen || !state.portalEntry || !state.portalExit) return false;
      const selKeys = new Set(tiles.map(t => hxKey(t.q, t.r)));
      return selKeys.has(hxKey(state.portalEntry.q, state.portalEntry.r)) &&
             selKeys.has(hxKey(state.portalExit.q,  state.portalExit.r));
    },
  },
  {
    id: 'blaze_gem_aquamarine',
    section: 'CHALLENGES',
    description: 'USE AN AQUAMARINE GEM IN ANY WORD',
    check(word, tiles) { return tiles.some(t => t.tileType === 'gemAquamarine'); },
  },
  {
    id: 'blaze_gem_topaz',
    section: 'CHALLENGES',
    description: 'USE A TOPAZ GEM IN ANY WORD',
    check(word, tiles) { return tiles.some(t => t.tileType === 'gemTopaz'); },
  },
  {
    id: 'blaze_7score5k',
    section: 'CHALLENGES',
    description: 'SCORE 5,000+ POINTS ON A SINGLE 7-LETTER WORD',
    check(word, tiles, state, score) {
      return word.length === 7 && score >= 5000;
    },
  },
  {
    id: 'blaze_7allGems',
    section: 'CHALLENGES',
    description: 'FORM A 7-LETTER WORD THAT CLEARS ALL GEM TILES FROM THE BOARD',
    check(word, tiles, state) {
      if (word.length !== 7) return false;
      const boardGems = [
        ...state.gemEmeraldTiles,   ...state.gemGoldTiles,         ...state.gemSapphireTiles,
        ...state.gemPearlTiles,     ...state.gemTanzaniteTiles,    ...state.gemRubyTiles,
        ...state.gemDiamondTiles,   ...state.gemAquamarineTiles,   ...state.gemTopazTiles,
        ...state.gemOpalTiles,      ...state.gemImperialJadeTiles, ...state.gemAlexandriteTiles,
      ];
      if (boardGems.length === 0) return false;
      const selKeys = new Set(tiles.map(t => hxKey(t.q, t.r)));
      return boardGems.every(g => selKeys.has(hxKey(g.q, g.r)));
    },
  },

  // ── 💎 INFERNO: Advanced ──────────────────────────────────────
  {
    id: 'inferno_8clean',
    section: 'CHALLENGES',
    description: 'FORM AN 8-LETTER WORD WITH NO GEMS OR DIGRAPHS',
    check(word, tiles) {
      return word.length === 8 &&
        !tiles.some(t => HX_GEM_TYPES.has(t.tileType) || t.tileType === 'digraph');
    },
  },
  {
    id: 'inferno_8ember_2gems',
    section: 'CHALLENGES',
    description: 'FORM AN 8-LETTER WORD WITH A FIRE TILE AND 2+ GEMS',
    check(word, tiles) {
      return word.length === 8 &&
        tiles.some(t => t.tileType === 'ember') &&
        tiles.filter(t => HX_GEM_TYPES.has(t.tileType)).length >= 2;
    },
  },
  {
    id: 'inferno_8portal_gem',
    section: 'CHALLENGES',
    description: 'TRAVERSE THE PORTAL IN AN 8-LETTER WORD CONTAINING A GEM',
    check(word, tiles, state) {
      if (word.length !== 8) return false;
      if (!state.portalOpen || !state.portalEntry || !state.portalExit) return false;
      const selKeys = new Set(tiles.map(t => hxKey(t.q, t.r)));
      return selKeys.has(hxKey(state.portalEntry.q, state.portalEntry.r)) &&
             selKeys.has(hxKey(state.portalExit.q,  state.portalExit.r)) &&
             tiles.some(t => HX_GEM_TYPES.has(t.tileType));
    },
  },
  {
    id: 'inferno_8_3gemtypes',
    section: 'CHALLENGES',
    description: 'FORM AN 8-LETTER WORD WITH 3 DIFFERENT GEM TYPES',
    check(word, tiles) {
      return word.length === 8 &&
        new Set(tiles.filter(t => HX_GEM_TYPES.has(t.tileType)).map(t => t.tileType)).size >= 3;
    },
  },
  {
    id: 'inferno_8alldigs',
    section: 'CHALLENGES',
    description: 'FORM AN 8-LETTER WORD THAT CLEARS EVERY DIGRAPH TILE FROM THE BOARD',
    check(word, tiles, state) {
      if (word.length !== 8) return false;
      if (state.digraphTiles.length === 0) return false;
      const selKeys = new Set(tiles.map(t => hxKey(t.q, t.r)));
      return state.digraphTiles.every(d => selKeys.has(hxKey(d.q, d.r)));
    },
  },
  {
    id: 'inferno_gem_diamond',
    section: 'CHALLENGES',
    description: 'USE A DIAMOND GEM IN ANY WORD',
    check(word, tiles) { return tiles.some(t => t.tileType === 'gemDiamond'); },
  },
  {
    id: 'inferno_8score10k',
    section: 'CHALLENGES',
    description: 'SCORE 10,000+ POINTS ON A SINGLE 8-LETTER WORD',
    check(word, tiles, state, score) {
      return word.length === 8 && score >= 10000;
    },
  },
  {
    id: 'inferno_gem_opal',
    section: 'CHALLENGES',
    description: 'USE AN OPAL GEM IN ANY WORD',
    check(word, tiles) { return tiles.some(t => t.tileType === 'gemOpal'); },
  },
  {
    id: 'inferno_9word',
    section: 'CHALLENGES',
    description: 'FORM A 9-LETTER WORD',
    check(word) { return word.length === 9; },
  },
  {
    id: 'inferno_9portal_ember',
    section: 'CHALLENGES',
    description: 'FORM A 9-LETTER PORTAL WORD WITH A FIRE TILE',
    check(word, tiles, state) {
      if (word.length !== 9) return false;
      if (!state.portalOpen || !state.portalEntry || !state.portalExit) return false;
      const selKeys = new Set(tiles.map(t => hxKey(t.q, t.r)));
      return selKeys.has(hxKey(state.portalEntry.q, state.portalEntry.r)) &&
             selKeys.has(hxKey(state.portalExit.q,  state.portalExit.r)) &&
             tiles.some(t => t.tileType === 'ember');
    },
  },
  {
    id: 'inferno_9_2gems',
    section: 'CHALLENGES',
    description: 'FORM A 9-LETTER WORD WITH 2+ GEM TILES',
    check(word, tiles) {
      return word.length === 9 &&
        tiles.filter(t => HX_GEM_TYPES.has(t.tileType)).length >= 2;
    },
  },
  {
    id: 'inferno_9_3gemtypes',
    section: 'CHALLENGES',
    description: 'FORM A 9-LETTER WORD WITH 3 DIFFERENT GEM TYPES',
    check(word, tiles) {
      return word.length === 9 &&
        new Set(tiles.filter(t => HX_GEM_TYPES.has(t.tileType)).map(t => t.tileType)).size >= 3;
    },
  },
  {
    id: 'inferno_9score25k',
    section: 'CHALLENGES',
    description: 'SCORE 25,000+ POINTS ON A SINGLE 9-LETTER WORD',
    check(word, tiles, state, score) {
      return word.length === 9 && score >= 25000;
    },
  },
  {
    id: 'inferno_gem_ijade',
    section: 'CHALLENGES',
    description: 'USE AN IMPERIAL JADE GEM IN ANY WORD',
    check(word, tiles) { return tiles.some(t => t.tileType === 'gemImperialJade'); },
  },
  {
    id: 'inferno_gem_alexandrite',
    section: 'CHALLENGES',
    description: 'USE AN ALEXANDRITE GEM IN ANY WORD',
    check(word, tiles) { return tiles.some(t => t.tileType === 'gemAlexandrite'); },
  },
  {
    id: 'inferno_ember_prism_portal',
    section: 'CHALLENGES',
    description: 'USE A FIRE TILE, PRISM TILE, AND THE PORTAL IN ONE WORD (7+ LETTERS)',
    check(word, tiles, state) {
      if (word.length < 7) return false;
      if (!state.portalOpen || !state.portalEntry || !state.portalExit) return false;
      const selKeys = new Set(tiles.map(t => hxKey(t.q, t.r)));
      return selKeys.has(hxKey(state.portalEntry.q, state.portalEntry.r)) &&
             selKeys.has(hxKey(state.portalExit.q,  state.portalExit.r)) &&
             tiles.some(t => t.tileType === 'ember') &&
             tiles.some(t => t.tileType === 'prism');
    },
  },

  // ── 🌟 ASCENDANT: Legendary ───────────────────────────────────
  {
    id: 'ascend_10word',
    section: 'CHALLENGES',
    description: 'FORM A 10-LETTER WORD',
    check(word) { return word.length === 10; },
  },
  {
    id: 'ascend_9_4gemtypes',
    section: 'CHALLENGES',
    description: 'FORM A 9-LETTER WORD WITH 4 DIFFERENT GEM TYPES',
    check(word, tiles) {
      return word.length === 9 &&
        new Set(tiles.filter(t => HX_GEM_TYPES.has(t.tileType)).map(t => t.tileType)).size >= 4;
    },
  },
  {
    id: 'ascend_10portal_diamond',
    section: 'CHALLENGES',
    description: 'FORM A 10-LETTER PORTAL WORD WITH A DIAMOND GEM',
    check(word, tiles, state) {
      if (word.length !== 10) return false;
      if (!state.portalOpen || !state.portalEntry || !state.portalExit) return false;
      if (!tiles.some(t => t.tileType === 'gemDiamond')) return false;
      const selKeys = new Set(tiles.map(t => hxKey(t.q, t.r)));
      return selKeys.has(hxKey(state.portalEntry.q, state.portalEntry.r)) &&
             selKeys.has(hxKey(state.portalExit.q,  state.portalExit.r));
    },
  },
  {
    id: 'ascend_10score100k',
    section: 'CHALLENGES',
    description: 'SCORE 100,000+ POINTS ON A SINGLE 10-LETTER WORD',
    check(word, tiles, state, score) {
      return word.length === 10 && score >= 100000;
    },
  },
  {
    id: 'ascend_10_5gemtypes',
    section: 'CHALLENGES',
    description: 'FORM A 10-LETTER WORD WITH 5 DIFFERENT GEM TYPES',
    check(word, tiles) {
      return word.length === 10 &&
        new Set(tiles.filter(t => HX_GEM_TYPES.has(t.tileType)).map(t => t.tileType)).size >= 5;
    },
  },
  {
    id: 'ascend_10ember2_gem3',
    section: 'CHALLENGES',
    description: 'FORM A 10-LETTER WORD WITH 2 FIRE TILES AND 3+ GEMS',
    check(word, tiles) {
      return word.length === 10 &&
        tiles.filter(t => t.tileType === 'ember').length >= 2 &&
        tiles.filter(t => HX_GEM_TYPES.has(t.tileType)).length >= 3;
    },
  },
  {
    id: 'ascend_10alldigs',
    section: 'CHALLENGES',
    description: 'FORM A 10-LETTER WORD THAT CLEARS EVERY DIGRAPH TILE FROM THE BOARD',
    check(word, tiles, state) {
      if (word.length !== 10) return false;
      if (state.digraphTiles.length === 0) return false;
      const selKeys = new Set(tiles.map(t => hxKey(t.q, t.r)));
      return state.digraphTiles.every(d => selKeys.has(hxKey(d.q, d.r)));
    },
  },
  {
    id: 'ascend_rune_gem_portal',
    section: 'CHALLENGES',
    description: 'USE A RUNE TILE, ANY GEM, AND THE PORTAL IN ONE WORD',
    check(word, tiles, state) {
      if (!state.portalOpen || !state.portalEntry || !state.portalExit) return false;
      if (!tiles.some(t => t.tileType === 'rune')) return false;
      if (!tiles.some(t => HX_GEM_TYPES.has(t.tileType))) return false;
      const selKeys = new Set(tiles.map(t => hxKey(t.q, t.r)));
      return selKeys.has(hxKey(state.portalEntry.q, state.portalEntry.r)) &&
             selKeys.has(hxKey(state.portalExit.q,  state.portalExit.r));
    },
  },
  {
    id: 'ascend_allgems',
    section: 'CHALLENGES',
    description: 'USE EVERY GEM TILE ON THE BOARD IN A SINGLE WORD',
    check(word, tiles, state) {
      const boardGems = [
        ...state.gemEmeraldTiles,   ...state.gemGoldTiles,         ...state.gemSapphireTiles,
        ...state.gemPearlTiles,     ...state.gemTanzaniteTiles,    ...state.gemRubyTiles,
        ...state.gemDiamondTiles,   ...state.gemAquamarineTiles,   ...state.gemTopazTiles,
        ...state.gemOpalTiles,      ...state.gemImperialJadeTiles, ...state.gemAlexandriteTiles,
      ];
      if (boardGems.length === 0) return false;
      const selKeys = new Set(tiles.map(t => hxKey(t.q, t.r)));
      return boardGems.every(g => selKeys.has(hxKey(g.q, g.r)));
    },
  },
];

/**
 * Calculates the count bonus for the given selected tiles.
 * Count bonus = number of unique gem types used (diversity bonus), minimum 1.
 * e.g. no gems → count bonus = 1
 *      3 Emeralds → 1 unique type → count bonus = 1
 *      2 Emeralds + 1 Gold → 2 unique types → count bonus = 2
 * @param {Array} selectedTiles - array of tile objects from hxSelected
 * @returns {number} number of unique gem types present (≥1)
 */
function calcGemCountBonus(selectedTiles) {
  const uniqueGemTypes = new Set();
  selectedTiles.forEach(t => {
    if (GEM_MULTIPLIERS[t.tileType]) {
      uniqueGemTypes.add(t.tileType);
    }
  });
  return Math.max(1, uniqueGemTypes.size);
}

/**
 * Calculates and shows a live score preview for the current selection.
 * Uses the same formula as submitHexacoreWord so the player always sees
 * exactly what the word is worth before committing.
 */
function updateWordScorePreview() {
  const el = document.getElementById('hx-word-score-hud');
  if (!el) return;

  // Compute assembled letter count (digraph tiles contribute 2 letters, runes contribute 1)
  const letterCount = hxSelected.reduce((sum, t) => sum + (t.tileType === 'rune' ? 1 : t.letter.length), 0);

  if (letterCount < 4) {
    el.textContent = '';
    return;
  }

  const resolved = resolveLetters(hxSelected);
  if (!resolved || !isValidWord(resolved.join(''))) {
    el.textContent = '';
    return;
  }

  // Resolve rune wildcards optimistically (use '?' placeholder for display
  // if they haven't been resolved yet — we mirror resolveLetters' alphabet
  // scan but only need the letters we know for a rough score estimate).
  const knownLetters = hxSelected.map(t => (t.tileType === 'rune' ? null : t.letter));
  const runeCount = knownLetters.filter(l => l === null).length;

  // For a meaningful preview even with runes, estimate using known letters
  // and count rune placeholders as 1 pt each (minimum).
  // For multi-char letters (digraphs), sum each character's point value.
  const wordLength = letterCount;
  let base = 0;
  knownLetters.forEach(l => {
    if (l) { for (const ch of l) base += HX_LETTER_POINTS[ch] || 1; }
    else base += 1;
  });
  const lenMult = HX_LENGTH_MULTIPLIERS[wordLength] || wordLength;

  const hasPrism = hxSelected.some(t => t.tileType === 'prism');
  let gemMult = 1;
  hxSelected.forEach(t => {
    if (GEM_MULTIPLIERS[t.tileType]) gemMult *= GEM_MULTIPLIERS[t.tileType];
  });

  const countBonus = calcGemCountBonus(hxSelected);
  const lodestoneBoostPreview = hxState.lodestoneActive ? 1 : 0;

  let previewBase = base;
  if (hxState.eclipseActive) {
    // Recalculate with inverted letter values for preview
    previewBase = 0;
    knownLetters.forEach(l => {
      if (l) { for (const ch of l) previewBase += Math.max(1, (HX_MAX_LETTER_POINTS + 1) - (HX_LETTER_POINTS[ch] || 1)); }
      else previewBase += 5; // average inverted value for unknown rune
    });
  }

  const preview = previewBase * lenMult * (hasPrism ? 2 : 1) * gemMult * (countBonus + lodestoneBoostPreview);
  const runeNote = runeCount > 0 ? '~' : '';
  const effectNote = (hxState.eclipseActive || hxState.lodestoneActive) ? '★' : '';
  el.textContent = `${effectNote}${runeNote}+${preview}`;
}

function clearSelection() {
  hxSelected.forEach(t => t.setSelected(false));
  hxSelected = [];
  updateWordDisplay();
}

/* ── Tile lookup from DOM element ──────────────────────────────── */
function tileFromElement(el) {
  let node = el;
  while (node && node !== hxSvg) {
    if (node.classList?.contains('tile')) {
      return hxState.tiles.find(t => t.element === node) || null;
    }
    node = node.parentElement;
  }
  return null;
}

/* ── Rune letter picker modal ──────────────────────────────────── */
function showRuneLetterPicker(tile) {
  const overlay = document.createElement('div');
  overlay.id = 'hx-rune-picker';

  const box = document.createElement('div');
  box.id = 'hx-rune-picker-box';

  const title = document.createElement('div');
  title.id = 'hx-rune-picker-title';
  title.textContent = '✦ CHOOSE A LETTER';

  const grid = document.createElement('div');
  grid.id = 'hx-rune-picker-grid';

  function closeModal() {
    overlay.remove();
    document.removeEventListener('keydown', onKeyDown);
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') closeModal();
  }
  document.addEventListener('keydown', onKeyDown);

  'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').forEach(letter => {
    const btn = document.createElement('button');
    btn.textContent = letter;
    btn.addEventListener('click', () => {
      tile.chosenRuneLetter = letter;
      tile.letter           = letter;
      tile.tileType         = 'normal';
      tile.textLetter.textContent = letter;
      tile.textPoint.textContent  = HX_LETTER_POINTS[letter] || 1;
      applyTileType(tile);
      tile.element.classList.add('hx-rune-flip');
      tile.element.addEventListener('animationend', () => {
        tile.element.classList.remove('hx-rune-flip');
      }, { once: true });
      removeFrom(hxState.runeTiles, tile);
      closeModal();
    });
    grid.appendChild(btn);
  });

  box.appendChild(title);
  box.appendChild(grid);
  overlay.appendChild(box);
  document.body.appendChild(overlay);

  // Clicking the backdrop (outside the box) dismisses without choosing
  overlay.addEventListener('click', e => {
    if (e.target === overlay) closeModal();
  });
}

/* ── Power-up: HUD bar ─────────────────────────────────────────── */

/** Build the SVG hex icon for a power-up button.
 *  Uses inline <defs> so the gradient works outside the main game SVG. */
function makePowerUpHexSVG(type) {
  const gradId  = `hx-pu-${type}-grad`;
  const shineId = gradId + '-shine';
  const shineDef = `<linearGradient id="${shineId}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#ffffff" stop-opacity="0.42"/><stop offset="100%" stop-color="#ffffff" stop-opacity="0"/></linearGradient>`;

  if (type === 'amethyst') {
    return `<svg viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <linearGradient id="${gradId}" x1="1" y1="1" x2="0" y2="0">
          <stop offset="0%"   stop-color="#1a0028"/>
          <stop offset="50%"  stop-color="#7e22ce"/>
          <stop offset="100%" stop-color="#d946ef"/>
        </linearGradient>${shineDef}
      </defs>
      <polygon points="30,4 52,17 52,43 30,56 8,43 8,17" fill="url(#${gradId})" stroke="#e879f9" stroke-width="2"/>
      <polygon points="30,7 49,18 49,41 30,53 11,41 11,18" fill="none" stroke="rgba(255,255,255,0.28)" stroke-width="1"/>
      <polygon points="30,5 51,17 51,32 9,32 9,17" fill="url(#${shineId})"/>
      <text x="30" y="37" text-anchor="middle" font-size="20" fill="#f0abfc" font-weight="bold">◈</text>
    </svg>`;
  } else if (type === 'selenite') {
    return `<svg viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <linearGradient id="${gradId}" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%"   stop-color="#030712"/>
          <stop offset="35%"  stop-color="#0c4a6e"/>
          <stop offset="70%"  stop-color="#0ea5e9"/>
          <stop offset="100%" stop-color="#e0f2fe"/>
        </linearGradient>${shineDef}
      </defs>
      <polygon points="30,4 52,17 52,43 30,56 8,43 8,17" fill="url(#${gradId})" stroke="#7dd3fc" stroke-width="2"/>
      <polygon points="30,7 49,18 49,41 30,53 11,41 11,18" fill="none" stroke="rgba(255,255,255,0.38)" stroke-width="1"/>
      <polygon points="30,5 51,17 51,32 9,32 9,17" fill="url(#${shineId})"/>
      <text x="30" y="37" text-anchor="middle" font-size="18" fill="#e0f2fe" font-weight="bold">⇌</text>
    </svg>`;
  } else if (type === 'oracle') {
    return `<svg viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <linearGradient id="${gradId}" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%"   stop-color="#1e293b"/>
          <stop offset="50%"  stop-color="#64748b"/>
          <stop offset="100%" stop-color="#f8fafc"/>
        </linearGradient>${shineDef}
      </defs>
      <polygon points="30,4 52,17 52,43 30,56 8,43 8,17" fill="url(#${gradId})" stroke="#cbd5e1" stroke-width="2"/>
      <polygon points="30,7 49,18 49,41 30,53 11,41 11,18" fill="none" stroke="rgba(255,255,255,0.38)" stroke-width="1"/>
      <polygon points="30,5 51,17 51,32 9,32 9,17" fill="url(#${shineId})"/>
      <text x="30" y="37" text-anchor="middle" font-size="18" fill="#f8fafc" font-weight="bold">⊙</text>
    </svg>`;
  } else if (type === 'beacon') {
    return `<svg viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <linearGradient id="${gradId}" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%"   stop-color="#451a03"/>
          <stop offset="50%"  stop-color="#b45309"/>
          <stop offset="100%" stop-color="#fef08a"/>
        </linearGradient>${shineDef}
      </defs>
      <polygon points="30,4 52,17 52,43 30,56 8,43 8,17" fill="url(#${gradId})" stroke="#f59e0b" stroke-width="2"/>
      <polygon points="30,7 49,18 49,41 30,53 11,41 11,18" fill="none" stroke="rgba(255,255,255,0.32)" stroke-width="1"/>
      <polygon points="30,5 51,17 51,32 9,32 9,17" fill="url(#${shineId})"/>
      <text x="30" y="37" text-anchor="middle" font-size="18" fill="#fef08a" font-weight="bold">◆</text>
    </svg>`;
  } else if (type === 'eclipse') {
    return `<svg viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <linearGradient id="${gradId}" x1="0.5" y1="1" x2="0.5" y2="0">
          <stop offset="0%"   stop-color="#020617"/>
          <stop offset="60%"  stop-color="#1c1917"/>
          <stop offset="100%" stop-color="#4c1d95"/>
        </linearGradient>${shineDef}
      </defs>
      <polygon points="30,4 52,17 52,43 30,56 8,43 8,17" fill="url(#${gradId})" stroke="#7c3aed" stroke-width="2"/>
      <polygon points="30,7 49,18 49,41 30,53 11,41 11,18" fill="none" stroke="rgba(255,255,255,0.20)" stroke-width="1"/>
      <polygon points="30,5 51,17 51,32 9,32 9,17" fill="url(#${shineId})"/>
      <text x="30" y="37" text-anchor="middle" font-size="20" fill="#c4b5fd" font-weight="bold">☽</text>
    </svg>`;
  } else if (type === 'lodestone') {
    return `<svg viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <linearGradient id="${gradId}" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%"   stop-color="#18181b"/>
          <stop offset="50%"  stop-color="#52525b"/>
          <stop offset="100%" stop-color="#e4e4e7"/>
        </linearGradient>${shineDef}
      </defs>
      <polygon points="30,4 52,17 52,43 30,56 8,43 8,17" fill="url(#${gradId})" stroke="#a1a1aa" stroke-width="2"/>
      <polygon points="30,7 49,18 49,41 30,53 11,41 11,18" fill="none" stroke="rgba(255,255,255,0.32)" stroke-width="1"/>
      <polygon points="30,5 51,17 51,32 9,32 9,17" fill="url(#${shineId})"/>
      <text x="30" y="37" text-anchor="middle" font-size="18" fill="#e4e4e7" font-weight="bold">⬡</text>
    </svg>`;
  } else { // lexicon
    return `<svg viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <linearGradient id="${gradId}" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%"   stop-color="#dc2626"/>
          <stop offset="33%"  stop-color="#16a34a"/>
          <stop offset="67%"  stop-color="#2563eb"/>
          <stop offset="100%" stop-color="#db2777"/>
        </linearGradient>${shineDef}
      </defs>
      <polygon points="30,4 52,17 52,43 30,56 8,43 8,17" fill="url(#${gradId})" stroke="#f9fafb" stroke-width="2"/>
      <polygon points="30,7 49,18 49,41 30,53 11,41 11,18" fill="none" stroke="rgba(255,255,255,0.40)" stroke-width="1"/>
      <polygon points="30,5 51,17 51,32 9,32 9,17" fill="url(#${shineId})"/>
      <text x="30" y="37" text-anchor="middle" font-size="20" fill="#ffffff" font-weight="bold">∞</text>
    </svg>`;
  }
}

function _makePowerUpBtn(type, title, ariaLabel, count, activateFn) {
  const btn = document.createElement('button');
  btn.className = `hx-powerup-icon-btn hx-powerup-icon-btn--${type}`;
  btn.title = title;
  btn.setAttribute('aria-label', `${ariaLabel}${count > 1 ? ` ×${count}` : ''}`);
  btn.innerHTML = makePowerUpHexSVG(type);
  if (count > 1) {
    const badge = document.createElement('span');
    badge.className = 'hx-powerup-icon-count';
    badge.textContent = count;
    btn.appendChild(badge);
  }
  btn.addEventListener('click', activateFn);
  return btn;
}

function updatePowerUpBar() {
  const barLeft  = document.getElementById('hx-powerup-bar-left');
  const barRight = document.getElementById('hx-powerup-bar-right');
  if (!barLeft || !barRight) return;
  barLeft.innerHTML  = '';
  barRight.innerHTML = '';

  if (hxState.amethystCount > 0) {
    barLeft.appendChild(_makePowerUpBtn('amethyst', 'Transmute: change any tile\'s letter', 'Amethyst power-up', hxState.amethystCount, () => activateAmethyst()));
  }
  if (hxState.oracleCount > 0) {
    barLeft.appendChild(_makePowerUpBtn('oracle', 'Oracle: highlight longest word path', 'Oracle power-up', hxState.oracleCount, () => activateOracle()));
  }
  if (hxState.beaconCount > 0) {
    barLeft.appendChild(_makePowerUpBtn('beacon', 'Beacon: reveal highest-scoring word', 'Beacon power-up', hxState.beaconCount, () => activateBeacon()));
  }
  if (hxState.eclipseCount > 0) {
    barLeft.appendChild(_makePowerUpBtn('eclipse', 'Eclipse: invert letter values for next word', 'Eclipse power-up', hxState.eclipseCount, () => activateEclipse()));
  }

  if (hxState.seleniteCount > 0) {
    barRight.appendChild(_makePowerUpBtn('selenite', 'Phase Swap: swap any two tiles', 'Selenite power-up', hxState.seleniteCount, () => activateSelenite()));
  }
  if (hxState.lodestoneCount > 0) {
    barRight.appendChild(_makePowerUpBtn('lodestone', 'Lodestone: +1 score multiplier for next word', 'Lodestone power-up', hxState.lodestoneCount, () => activateLodestone()));
  }
  if (hxState.lexiconCount > 0) {
    barRight.appendChild(_makePowerUpBtn('lexicon', 'Lexicon: reveal top 5 words on board (one-time)', 'Lexicon power-up', hxState.lexiconCount, () => activateLexicon()));
  }
}

/* ── Power-up toast notification ──────────────────────────────── */
function showPowerUpCollectToast(type) {
  const existing = document.getElementById('hx-powerup-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'hx-powerup-toast';
  toast.className = `hx-powerup-toast hx-powerup-toast--${type}`;

  if (type === 'amethyst') {
    toast.innerHTML = '<span class="hx-powerup-toast-title">✨ AMETHYST COLLECTED</span><span class="hx-powerup-toast-desc">Tap to change a tile\'s letter!</span>';
  } else if (type === 'selenite') {
    toast.innerHTML = '<span class="hx-powerup-toast-title">✨ SELENITE COLLECTED</span><span class="hx-powerup-toast-desc">Tap to swap two tiles!</span>';
  } else if (type === 'oracle') {
    toast.innerHTML = '<span class="hx-powerup-toast-title">⊙ ORACLE COLLECTED</span><span class="hx-powerup-toast-desc">Tap to highlight the longest possible word!</span>';
  } else if (type === 'beacon') {
    toast.innerHTML = '<span class="hx-powerup-toast-title">◆ BEACON COLLECTED</span><span class="hx-powerup-toast-desc">Tap to reveal the highest-scoring word!</span>';
  } else if (type === 'eclipse') {
    toast.innerHTML = '<span class="hx-powerup-toast-title">☽ ECLIPSE COLLECTED</span><span class="hx-powerup-toast-desc">Tap to invert letter values for your next word!</span>';
  } else if (type === 'lodestone') {
    toast.innerHTML = '<span class="hx-powerup-toast-title">⬡ LODESTONE COLLECTED</span><span class="hx-powerup-toast-desc">Tap to boost your next word\'s multiplier!</span>';
  } else if (type === 'lexicon') {
    toast.innerHTML = '<span class="hx-powerup-toast-title">∞ LEXICON COLLECTED</span><span class="hx-powerup-toast-desc">Tap to reveal the top 5 words on the board!</span>';
  }

  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

function showPowerUpUsedToast(type) {
  const existing = document.getElementById('hx-powerup-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'hx-powerup-toast';
  toast.className = `hx-powerup-toast hx-powerup-toast--${type}`;

  if (type === 'amethyst') {
    toast.innerHTML = '<span class="hx-powerup-toast-title">🔮 AMETHYST USED</span>';
  } else if (type === 'selenite') {
    toast.innerHTML = '<span class="hx-powerup-toast-title">🌙 SELENITE USED</span>';
  } else if (type === 'oracle') {
    toast.innerHTML = '<span class="hx-powerup-toast-title">⊙ ORACLE ACTIVATED</span>';
  } else if (type === 'beacon') {
    toast.innerHTML = '<span class="hx-powerup-toast-title">◆ BEACON ACTIVATED</span>';
  } else if (type === 'eclipse') {
    toast.innerHTML = '<span class="hx-powerup-toast-title">☽ ECLIPSE ACTIVE — Next word uses inverted values!</span>';
  } else if (type === 'lodestone') {
    toast.innerHTML = '<span class="hx-powerup-toast-title">⬡ LODESTONE ACTIVE — Next word gets +1 multiplier!</span>';
  } else if (type === 'lexicon') {
    toast.innerHTML = '<span class="hx-powerup-toast-title">∞ LEXICON USED</span>';
  }

  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2000);
}

/* ── Power-up: Amethyst (Transmute) ───────────────────────────── */
function activateAmethyst() {
  if (hxState.amethystCount <= 0 || !hxState.active || hxState.gameOver) return;
  // Cancel selenite targeting if active
  cancelSeleniteTargeting();

  hxAmethystTargeting = true;
  document.body.classList.add('hx-amethyst-targeting');

  const indicator = document.createElement('div');
  indicator.id = 'hx-powerup-indicator';
  indicator.className = 'hx-powerup-indicator hx-powerup-indicator--amethyst';
  indicator.textContent = '🔮 TAP A TILE TO CHANGE ITS LETTER';
  document.body.appendChild(indicator);
}

function cancelAmethystTargeting() {
  hxAmethystTargeting = false;
  document.body.classList.remove('hx-amethyst-targeting');
  document.getElementById('hx-powerup-indicator')?.remove();
}

function handleAmethystTileTap(tile) {
  if (!hxAmethystTargeting) return false;
  cancelAmethystTargeting();
  showAmethystLetterPicker(tile);
  return true;
}

function showAmethystLetterPicker(tile) {
  const overlay = document.createElement('div');
  overlay.id = 'hx-rune-picker';

  const box = document.createElement('div');
  box.id = 'hx-rune-picker-box';
  box.classList.add('hx-amethyst-picker');

  const title = document.createElement('div');
  title.id = 'hx-rune-picker-title';
  title.textContent = '◈ CHOOSE A NEW LETTER';

  const grid = document.createElement('div');
  grid.id = 'hx-rune-picker-grid';

  function closeModal() {
    overlay.remove();
    document.removeEventListener('keydown', onKeyDown);
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') {
      closeModal();
    }
  }
  document.addEventListener('keydown', onKeyDown);

  'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').forEach(letter => {
    const btn = document.createElement('button');
    btn.textContent = letter;
    btn.addEventListener('click', () => {
      // Apply the new letter to the tile
      tile.letter   = letter;
      tile.tileType = 'normal';
      tile.updateLetter(letter, HX_LETTER_POINTS[letter] || 1);
      applyTileType(tile);
      // Remove the tile from its type array via the registry so it no longer
      // has any lingering properties (e.g. ember advancement, game-over triggers)
      _hxClearTileType(tile);
      hxState.amethystCount--;
      updatePowerUpBar();
      showPowerUpUsedToast('amethyst');
      closeModal();
    });
    grid.appendChild(btn);
  });

  box.appendChild(title);
  box.appendChild(grid);
  overlay.appendChild(box);
  document.body.appendChild(overlay);

  overlay.addEventListener('click', e => {
    if (e.target === overlay) closeModal();
  });
}

/* ── Power-up: Selenite (Phase Swap) ──────────────────────────── */
function activateSelenite() {
  if (hxState.seleniteCount <= 0 || !hxState.active || hxState.gameOver) return;
  // Cancel amethyst targeting if active
  cancelAmethystTargeting();

  hxSeleniteTargeting = true;
  hxSeleniteFirstTile = null;
  document.body.classList.add('hx-selenite-targeting');

  const indicator = document.createElement('div');
  indicator.id = 'hx-powerup-indicator';
  indicator.className = 'hx-powerup-indicator hx-powerup-indicator--selenite';
  indicator.textContent = '🌙 SWAP MODE — TAP FIRST TILE';
  document.body.appendChild(indicator);
}

function cancelSeleniteTargeting() {
  if (hxSeleniteFirstTile) {
    hxSeleniteFirstTile.element.classList.remove('hx-swap-mode-highlight');
  }
  hxSeleniteTargeting = false;
  hxSeleniteFirstTile = null;
  document.body.classList.remove('hx-selenite-targeting');
  document.getElementById('hx-powerup-indicator')?.remove();
}

function handleSeleniteTileTap(tile) {
  if (!hxSeleniteTargeting) return false;

  // Portal tiles cannot be swapped
  if (isPortalTile(tile)) return true;

  if (!hxSeleniteFirstTile) {
    // First tile selected
    hxSeleniteFirstTile = tile;
    tile.element.classList.add('hx-swap-mode-highlight');
    const indicator = document.getElementById('hx-powerup-indicator');
    if (indicator) indicator.textContent = '🌙 SWAP MODE — TAP SECOND TILE';
    return true;
  }

  // Second tile selected
  const tileA = hxSeleniteFirstTile;
  const tileB = tile;

  // Cannot swap a tile with itself
  if (tileA === tileB) {
    cancelSeleniteTargeting();
    return true;
  }

  // Perform the swap
  tileA.element.classList.remove('hx-swap-mode-highlight');
  cancelSeleniteTargeting();

  // Swap q, r, s, key coordinates and hxTileMap entries
  const aQ = tileA.q, aR = tileA.r, aS = tileA.s;
  const bQ = tileB.q, bR = tileB.r, bS = tileB.s;

  tileA.q = bQ; tileA.r = bR; tileA.s = bS;
  tileB.q = aQ; tileB.r = aR; tileB.s = aS;

  hxTileMap.set(hxKey(tileA.q, tileA.r), tileA);
  hxTileMap.set(hxKey(tileB.q, tileB.r), tileB);

  // Animate both tiles gliding to their new positions
  animateTileMoves([
    { tile: tileA, fromQ: aQ, fromR: aR, toQ: bQ, toR: bR },
    { tile: tileB, fromQ: bQ, fromR: bR, toQ: aQ, toR: aR },
  ]);

  if (hxState.portalOpen) applyPortalVisuals();

  hxState.seleniteCount--;
  updatePowerUpBar();
  showPowerUpUsedToast('selenite');
  return true;
}

/* ── Achievement-based tile: Oracle (Longest Word Hunter) ──────── */
function activateOracle() {
  if (hxState.oracleCount <= 0 || !hxState.active || hxState.gameOver) return;
  hxState.oracleCount--;
  updatePowerUpBar();
  showPowerUpUsedToast('oracle');

  const result = findLongestWordOnBoard();
  if (!result) {
    const el = document.createElement('div');
    el.id = 'hx-powerup-toast';
    el.className = 'hx-powerup-toast hx-powerup-toast--oracle';
    el.innerHTML = '<span class="hx-powerup-toast-title">⊙ ORACLE</span><span class="hx-powerup-toast-desc">No long words found on the current board.</span>';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3000);
    return;
  }

  // Highlight path tiles for 5 seconds
  result.path.forEach(tile => tile.element.classList.add('hx-oracle-highlight'));
  const label = document.createElement('div');
  label.id = 'hx-powerup-toast';
  label.className = 'hx-powerup-toast hx-powerup-toast--oracle';
  label.innerHTML = `<span class="hx-powerup-toast-title">⊙ ORACLE: "${result.word}"</span><span class="hx-powerup-toast-desc">${result.word.length}-letter word highlighted for 5s</span>`;
  document.body.appendChild(label);
  setTimeout(() => {
    result.path.forEach(tile => tile.element.classList.remove('hx-oracle-highlight'));
    label.remove();
  }, ORACLE_HIGHLIGHT_DURATION_MS);
}

/* ── Achievement-based tile: Beacon (Highest Scoring) ──────────── */
function activateBeacon() {
  if (hxState.beaconCount <= 0 || !hxState.active || hxState.gameOver) return;
  hxState.beaconCount--;
  updatePowerUpBar();
  showPowerUpUsedToast('beacon');

  const result = findHighestScoringWordOnBoard();
  if (!result) {
    const el = document.createElement('div');
    el.id = 'hx-powerup-toast';
    el.className = 'hx-powerup-toast hx-powerup-toast--beacon';
    el.innerHTML = '<span class="hx-powerup-toast-title">◆ BEACON</span><span class="hx-powerup-toast-desc">No scoreable words found on the current board.</span>';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3000);
    return;
  }

  const el = document.createElement('div');
  el.id = 'hx-powerup-toast';
  el.className = 'hx-powerup-toast hx-powerup-toast--beacon';
  el.innerHTML = `<span class="hx-powerup-toast-title">◆ BEACON: "${result.word}"</span><span class="hx-powerup-toast-desc">Best word: +${result.score.toLocaleString()} pts</span>`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), BEACON_TOAST_DURATION_MS);
}

/* ── Achievement-based tile: Eclipse (Invert Letter Values) ────── */
function activateEclipse() {
  if (hxState.eclipseCount <= 0 || !hxState.active || hxState.gameOver) return;
  hxState.eclipseCount--;
  hxState.eclipseActive = true;
  updatePowerUpBar();
  showPowerUpUsedToast('eclipse');
}

/* ── Achievement-based tile: Lodestone (Reuse Boost) ───────────── */
function activateLodestone() {
  if (hxState.lodestoneCount <= 0 || !hxState.active || hxState.gameOver) return;
  hxState.lodestoneCount--;
  hxState.lodestoneActive = true;
  updatePowerUpBar();
  showPowerUpUsedToast('lodestone');
}

/* ── Achievement-based tile: Lexicon (Top 5 Words Modal) ────────── */
function activateLexicon() {
  if (hxState.lexiconCount <= 0 || !hxState.active || hxState.gameOver) return;
  hxState.lexiconCount--;
  updatePowerUpBar();
  showPowerUpUsedToast('lexicon');

  const top5 = findTopWordsOnBoard(5);
  showLexiconModal(top5);
}

function showLexiconModal(words) {
  const existing = document.getElementById('hx-lexicon-modal');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'hx-lexicon-modal';
  overlay.className = 'hx-lexicon-modal-overlay';

  const box = document.createElement('div');
  box.className = 'hx-lexicon-modal-box';

  const title = document.createElement('div');
  title.className = 'hx-lexicon-modal-title';
  title.innerHTML = '∞ LEXICON — TOP WORDS ON BOARD';

  const list = document.createElement('ol');
  list.className = 'hx-lexicon-word-list';

  if (words.length === 0) {
    const li = document.createElement('li');
    li.textContent = 'No words found on the current board.';
    list.appendChild(li);
  } else {
    words.forEach(({ word, score }) => {
      const li = document.createElement('li');
      li.innerHTML = `<span class="hx-lexicon-word">${word}</span><span class="hx-lexicon-score">+${score.toLocaleString()}</span>`;
      list.appendChild(li);
    });
  }

  const closeBtn = document.createElement('button');
  closeBtn.className = 'hx-lexicon-modal-close';
  closeBtn.textContent = 'CLOSE';

  box.appendChild(title);
  box.appendChild(list);
  box.appendChild(closeBtn);
  overlay.appendChild(box);
  document.body.appendChild(overlay);

  // Auto-dismiss after configured duration
  const autoDismissTimer = setTimeout(() => overlay.remove(), LEXICON_MODAL_AUTO_DISMISS_MS);

  // Click outside or close button to dismiss (clear auto-dismiss timer)
  const dismiss = () => {
    clearTimeout(autoDismissTimer);
    overlay.remove();
  };

  closeBtn.addEventListener('click', dismiss);
  overlay.addEventListener('click', e => {
    if (e.target === overlay) dismiss();
  });
}

/* ── Board analysis for Oracle / Beacon / Lexicon ──────────────── */

/**
 * Performs a time-limited DFS over all tiles to find valid words.
 * Returns an array of { word, score, path } sorted by score descending.
 * @param {number} maxResults - maximum results to collect
 * @param {number} timeLimitMs - time budget in milliseconds
 */
function analyzeBoard(maxResults = ORACLE_MAX_RESULTS, timeLimitMs = ORACLE_TIME_LIMIT_MS) {
  const results = [];
  const seen = new Set();
  const deadline = performance.now() + timeLimitMs;

  function scoreWord(path) {
    let base = 0;
    path.forEach(t => {
      const letters = t.tileType === 'rune' ? [t.chosenRuneLetter || 'E'] : [...t.letter];
      letters.forEach(ch => { base += HX_LETTER_POINTS[ch] || 1; });
    });
    const wordStr = path.map(t => t.tileType === 'rune' ? (t.chosenRuneLetter || 'E') : t.letter).join('');
    const lenMult = HX_LENGTH_MULTIPLIERS[wordStr.length] || wordStr.length;
    const hasPrism = path.some(t => t.tileType === 'prism');
    let gemMult = 1;
    path.forEach(t => { if (GEM_MULTIPLIERS[t.tileType]) gemMult *= GEM_MULTIPLIERS[t.tileType]; });
    const uniqueGems = new Set(path.filter(t => GEM_MULTIPLIERS[t.tileType]).map(t => t.tileType));
    const countBonus = Math.max(1, uniqueGems.size);
    return base * lenMult * (hasPrism ? 2 : 1) * gemMult * countBonus;
  }

  function dfs(path, visitedKeys) {
    if (performance.now() >= deadline) return;

    // Build the word from the current path
    const letters = path.map(t => t.tileType === 'rune' ? (t.chosenRuneLetter || 'E') : t.letter);
    const wordStr = letters.join('');

    if (wordStr.length >= 4 && isValidWord(wordStr) && !seen.has(wordStr)) {
      seen.add(wordStr);
      results.push({ word: wordStr, score: scoreWord(path), path: [...path] });
    }

    if (path.length >= MAX_WORD_PATH_DEPTH) return; // limit depth
    if (performance.now() >= deadline) return;

    const last = path[path.length - 1];
    const neighbors = hxState.tiles.filter(t => {
      if (visitedKeys.has(hxKey(t.q, t.r))) return false;
      return areNeighbors(last, t);
    });

    for (const neighbor of neighbors) {
      const key = hxKey(neighbor.q, neighbor.r);
      visitedKeys.add(key);
      path.push(neighbor);
      dfs(path, visitedKeys);
      path.pop();
      visitedKeys.delete(key);
      if (performance.now() >= deadline) return;
    }
  }

  for (const startTile of hxState.tiles) {
    if (performance.now() >= deadline) break;
    const visitedKeys = new Set([hxKey(startTile.q, startTile.r)]);
    dfs([startTile], visitedKeys);
  }

  return results;
}

function findLongestWordOnBoard() {
  const results = analyzeBoard(ORACLE_MAX_RESULTS, ORACLE_TIME_LIMIT_MS);
  if (results.length === 0) return null;
  return results.reduce((best, r) => r.word.length > best.word.length ? r : best, results[0]);
}

function findHighestScoringWordOnBoard() {
  const results = analyzeBoard(BEACON_MAX_RESULTS, BEACON_TIME_LIMIT_MS);
  if (results.length === 0) return null;
  return results.reduce((best, r) => r.score > best.score ? r : best, results[0]);
}

function findTopWordsOnBoard(n) {
  const results = analyzeBoard(LEXICON_MAX_RESULTS, LEXICON_TIME_LIMIT_MS);
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, n);
}

/* ── Achievement reward spawner ─────────────────────────────────── */

/**
 * Checks if any achievement has been unlocked by the current word.
 * An achievement tile spawns whenever its condition is met, as long as
 * a tile of that type is NOT already on the board (no stacking).
 * Returns array of { tileName, description } for spawned tiles.
 */
function checkAchievementRewards(word, consumed, wordScore, portalUsed) {
  const spawned = [];

  // 1. Oracle — 9-letter word; re-spawns once the previous one is collected
  if (hxState.oracleTiles.length === 0 && word.length >= ORACLE_UNLOCK_WORD_LENGTH) {
    spawnSpecialInRows('oracle', [-GRID_RADIUS, -GRID_RADIUS + 1, -GRID_RADIUS + 2]);
    spawned.push({ tileName: 'ORACLE O', description: 'Longest Word Hunter! Use it in a 5+ letter word to collect.' });
  }

  // 2. Beacon — 10,000+ point single word; re-spawns once the previous one is collected
  if (hxState.beaconTiles.length === 0 && wordScore >= BEACON_UNLOCK_SCORE) {
    spawnSpecialInRows('beacon', [-GRID_RADIUS, -GRID_RADIUS + 1, -GRID_RADIUS + 2]);
    spawned.push({ tileName: 'BEACON B', description: 'Score Master! Use it in a 5+ letter word to collect.' });
  }

  // 3. Eclipse — portal used in 3 different words; re-spawns once the previous one is collected
  if (hxState.eclipseTiles.length === 0 && portalUsed && hxState.achievements.portalWordsUsed >= ECLIPSE_UNLOCK_PORTAL_WORDS) {
    spawnSpecialInRows('eclipse', [-GRID_RADIUS, -GRID_RADIUS + 1, -GRID_RADIUS + 2]);
    spawned.push({ tileName: 'ECLIPSE E', description: 'Portal Traveler! Use it in a 5+ letter word to collect.' });
  }

  // 4. Lodestone — 5 different gem types in one word; re-spawns once the previous one is collected
  if (hxState.lodestoneTiles.length === 0) {
    const uniqueGemTypes = new Set(consumed.filter(t => HX_GEM_TYPES.has(t.tileType)).map(t => t.tileType));
    if (uniqueGemTypes.size >= LODESTONE_UNLOCK_GEM_TYPES) {
      spawnSpecialInRows('lodestone', [-GRID_RADIUS, -GRID_RADIUS + 1, -GRID_RADIUS + 2]);
      spawned.push({ tileName: 'LODESTONE L', description: 'Gem Collector! Use it in a 5+ letter word to collect.' });
    }
  }

  // 5. Lexicon — 100 total words submitted; re-spawns once the previous one is collected
  if (hxState.lexiconTiles.length === 0 && hxState.wordsSubmitted >= LEXICON_UNLOCK_WORDS) {
    spawnSpecialInRows('lexicon', [-GRID_RADIUS, -GRID_RADIUS + 1, -GRID_RADIUS + 2]);
    spawned.push({ tileName: 'LEXICON X', description: 'Endurance Master! Use it in a 5+ letter word to collect.' });
  }

  return spawned;
}

/* ── Achievement toast ──────────────────────────────────────────── */
function showAchievementToast(tileName, description) {
  const existing = document.getElementById('hx-achievement-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'hx-achievement-toast';
  toast.className = 'hx-achievement-toast';

  toast.innerHTML = `
    <span class="hx-achievement-icon">🏆</span>
    <div class="hx-achievement-body">
      <span class="hx-achievement-title">ACHIEVEMENT UNLOCKED</span>
      <span class="hx-achievement-name">${tileName}</span>
      <span class="hx-achievement-desc">${description}</span>
    </div>`;

  document.body.appendChild(toast);
  // Trigger entrance animation
  requestAnimationFrame(() => toast.classList.add('hx-achievement-toast--visible'));
  setTimeout(() => {
    toast.classList.remove('hx-achievement-toast--visible');
    setTimeout(() => toast.remove(), 600);
  }, 4000);
}

/* ── Pointer events ────────────────────────────────────────────── */
function setupPointerEvents() {
  const svg = hxSvg;

  function onPointerDown(e) {
    unlockAudioContext();
    if (!_hxAudioReady) {
      _hxAudioReady = true;
      preloadBuffers();
    }
    if (!hxState.active || hxState.gameOver) return;
    const tile = tileFromElement(document.elementFromPoint(e.clientX, e.clientY));
    if (!tile) return;
    e.preventDefault();

    // Handle power-up targeting modes first
    if (hxAmethystTargeting) {
      handleAmethystTileTap(tile);
      return;
    }
    if (hxSeleniteTargeting) {
      handleSeleniteTileTap(tile);
      return;
    }

    if (tile.tileType === 'rune') {
      showRuneLetterPicker(tile);
      return;
    }
    hxPointerDown = true;
    svg.setPointerCapture(e.pointerId);
    clearSelection();
    hxSelected = [tile];
    tile.setSelected(true);
    updateWordDisplay();
  }

  function onPointerMove(e) {
    if (!hxState.active || hxState.gameOver || !hxPointerDown) return;
    e.preventDefault();
    const tile = tileFromElement(document.elementFromPoint(e.clientX, e.clientY));
    if (!tile) return;

    // Allow backtracking to the previous tile
    if (hxSelected.length >= 2 && tile === hxSelected[hxSelected.length - 2]) {
      const removed = hxSelected.pop();
      removed.setSelected(false);
      updateWordDisplay();
      updatePortalActiveState();
      return;
    }

    // Don't re-add already selected tile
    if (hxSelected.includes(tile)) return;

    // Must be adjacent to the last tile
    const last = hxSelected[hxSelected.length - 1];
    if (!last || !areNeighbors(last, tile)) return;

    hxSelected.push(tile);
    tile.setSelected(true);
    const swipeIndex = Math.max(1, Math.min(25, hxSelected.length));
    playSound('sfxSwipe' + swipeIndex);
    updateWordDisplay();
    updatePortalActiveState();
  }

  function onPointerUp(e) {
    if (!hxPointerDown) return;
    hxPointerDown = false;
    // Auto-submit the word when the drag ends
    if (hxState.active && !hxState.gameOver && hxSelected.length > 0) {
      submitHexacoreWord();
    }
  }

  function onPointerCancel() {
    hxPointerDown = false;
    clearSelection();
  }

  svg.addEventListener('pointerdown',   onPointerDown);
  svg.addEventListener('pointermove',   onPointerMove);
  svg.addEventListener('pointerup',     onPointerUp);
  svg.addEventListener('pointercancel', onPointerCancel);

  hxPointerCleanup = () => {
    svg.removeEventListener('pointerdown',   onPointerDown);
    svg.removeEventListener('pointermove',   onPointerMove);
    svg.removeEventListener('pointerup',     onPointerUp);
    svg.removeEventListener('pointercancel', onPointerCancel);
  };
}

/* ── Rune wildcard resolution ──────────────────────────────────── */
function resolveLetters(selectedTiles) {
  const letters = selectedTiles.map(t => (t.tileType === 'rune' ? null : t.letter));
  const runeIdxs = letters.map((l, i) => l === null ? i : -1).filter(i => i !== -1);
  if (runeIdxs.length === 0) return letters;

  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

  if (runeIdxs.length === 1) {
    for (const ch of alphabet) {
      letters[runeIdxs[0]] = ch;
      if (isValidWord(letters.join(''))) return letters;
    }
    return null;
  }

  if (runeIdxs.length === 2) {
    const [i1, i2] = runeIdxs;
    for (const c1 of alphabet) {
      for (const c2 of alphabet) {
        letters[i1] = c1; letters[i2] = c2;
        if (isValidWord(letters.join(''))) return letters;
      }
    }
    return null;
  }

  // More than 2 runes: brute-force is too slow; fall back to null
  return null;
}

function setHexacoreTitle(title = HX_TITLE_TEXT) {
  const titleEls = HX_TITLE_ELEMENT_IDS
    .map(id => document.getElementById(id))
    .filter(Boolean);
  if (!titleEls.length) return;

  titleEls.forEach((titleEl, titleGroupIdx) => {
    titleEl.textContent = '';
    [...title].forEach((letter, idx) => {
      const span = document.createElement('span');
      span.className = 'hx-title-letter';
      span.textContent = letter;
      span.style.setProperty('--letter-idx', String(idx));
      span.style.setProperty('--title-group', String(titleGroupIdx));
      titleEl.appendChild(span);
    });
  });
}

function restoreDefaultTitle() {
  HX_TITLE_ELEMENT_IDS.forEach(id => {
    const titleEl = document.getElementById(id);
    if (titleEl) titleEl.textContent = 'ANAGRAMATON';
  });
}

function restoreUserTheme() {
  if (_hxSavedTheme !== null) {
    document.body.setAttribute('data-theme', _hxSavedTheme);
    localStorage.setItem('theme', _hxSavedTheme);
    _hxSavedTheme = null;
  }
}

function triggerHexacoreTitleFlash() {
  const titleEls = HX_TITLE_ELEMENT_IDS
    .map(id => document.getElementById(id))
    .filter(Boolean);
  if (!titleEls.length) return;

  const letterGroups = titleEls.map(titleEl => [...titleEl.querySelectorAll('.hx-title-letter')]);
  if (letterGroups.some(letters => letters.length !== HX_TITLE_TEXT.length)) return;

  letterGroups.forEach((group, titleGroupIdx) => {
    group.forEach(letter => {
      letter.style.setProperty('--title-group', String(titleGroupIdx));
      letter.classList.remove('hx-title-letter--lit');
    });
  });
  void titleEls[0].offsetWidth;
  const letters = letterGroups[0];
  const n       = letters.length; // 8 for HEXACORE
  const center  = Math.floor(n / 2);

  const idxs     = letters.map((_, idx) => idx);
  const selected = idxs.slice();

  // ── Randomise the inter-letter stagger so every trigger feels different ──
  const staggerChoices = [60, 80, 100, 120, 140, 160, 200];
  const staggerMs = staggerChoices[Math.floor(Math.random() * staggerChoices.length)];
  titleEls.forEach(el => el.style.setProperty('--hx-title-stagger', `${staggerMs}ms`));

  // ── Pick a random pattern (1–14), skipping the last 3 used ──────────────
  const TOTAL_PATTERNS = 14;
  const HISTORY_SIZE   = 3;
  let pattern;
  // Cap retries at TOTAL_PATTERNS * 3 to guarantee termination even if
  // HISTORY_SIZE were ever raised close to TOTAL_PATTERNS.
  const MAX_TRIES = TOTAL_PATTERNS * 3;
  let tries = 0;
  do {
    pattern = Math.floor(Math.random() * TOTAL_PATTERNS) + 1;
    tries++;
  } while (hxTitlePatternHistory.includes(pattern) && tries < MAX_TRIES);
  hxTitlePatternHistory.push(pattern);
  if (hxTitlePatternHistory.length > HISTORY_SIZE) hxTitlePatternHistory.shift();

  // Compute animation orders for both titles in opposite / complementary directions
  let orderForTitle1 = [];
  let orderForTitle2 = [];

  /* Helper: Fisher-Yates shuffle in-place. Mutates and returns the input array. */
  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  /* Helper: cyclic stride — step through indices [0..n-1] in steps of `stride` */
  function strideOrder(stride, start = 0) {
    const out = [];
    let cur = start;
    const len = n;
    for (let i = 0; i < len; i++) {
      out.push(cur);
      cur = (cur + stride) % len;
    }
    return out;
  }

  switch (pattern) {
    case 1: // LEFT-TO-RIGHT vs RIGHT-TO-LEFT
      orderForTitle1 = selected.slice().sort((a, b) => a - b);
      orderForTitle2 = selected.slice().sort((a, b) => b - a);
      break;

    case 2: // RIGHT-TO-LEFT vs LEFT-TO-RIGHT
      orderForTitle1 = selected.slice().sort((a, b) => b - a);
      orderForTitle2 = selected.slice().sort((a, b) => a - b);
      break;

    case 3: // CENTER-OUT EXPLOSION vs OUTSIDE-IN IMPLOSION
      orderForTitle1 = selected.slice().sort((a, b) => Math.abs(a - center) - Math.abs(b - center));
      orderForTitle2 = selected.slice().sort((a, b) => Math.abs(b - center) - Math.abs(a - center));
      break;

    case 4: // OUTSIDE-IN IMPLOSION vs CENTER-OUT EXPLOSION
      orderForTitle1 = selected.slice().sort((a, b) => Math.abs(b - center) - Math.abs(a - center));
      orderForTitle2 = selected.slice().sort((a, b) => Math.abs(a - center) - Math.abs(b - center));
      break;

    case 5: // EVENS FIRST vs ODDS FIRST
      orderForTitle1 = selected.slice().sort((a, b) => {
        const aIsEven = a % 2 === 0;
        const bIsEven = b % 2 === 0;
        if (aIsEven !== bIsEven) return aIsEven ? -1 : 1;
        return a - b;
      });
      orderForTitle2 = selected.slice().sort((a, b) => {
        const aIsOdd = a % 2 !== 0;
        const bIsOdd = b % 2 !== 0;
        if (aIsOdd !== bIsOdd) return aIsOdd ? -1 : 1;
        return a - b;
      });
      break;

    case 6: // SINE WAVE ASCENDING vs DESCENDING
      orderForTitle1 = selected.slice().sort((a, b) => Math.sin(a * 0.5) - Math.sin(b * 0.5));
      orderForTitle2 = selected.slice().sort((a, b) => Math.sin(b * 0.5) - Math.sin(a * 0.5));
      break;

    case 7: // RANDOM SPARKLE — two independent Fisher-Yates shuffles
      orderForTitle1 = shuffle(selected.slice());
      orderForTitle2 = shuffle(selected.slice());
      break;

    case 8: // HALF-SWAP — right half LTR then left half LTR (vs left RTL then right RTL)
      orderForTitle1 = [
        ...selected.filter(i => i >= n / 2).sort((a, b) => a - b),
        ...selected.filter(i => i < n / 2).sort((a, b) => a - b),
      ];
      orderForTitle2 = [
        ...selected.filter(i => i < n / 2).sort((a, b) => b - a),
        ...selected.filter(i => i >= n / 2).sort((a, b) => b - a),
      ];
      break;

    case 9: // STRIDE-3 — step every 3 positions cyclically
      orderForTitle1 = strideOrder(3, 0);
      orderForTitle2 = strideOrder(3, 0).slice().reverse();
      break;

    case 10: // SNAKE — first half forward then second half backward
      orderForTitle1 = [
        ...selected.filter(i => i < n / 2).sort((a, b) => a - b),
        ...selected.filter(i => i >= n / 2).sort((a, b) => b - a),
      ];
      orderForTitle2 = [
        ...selected.filter(i => i >= n / 2).sort((a, b) => a - b),
        ...selected.filter(i => i < n / 2).sort((a, b) => b - a),
      ];
      break;

    case 11: // PHASE-SHIFTED WAVE — sort by sin at a different frequency / phase
      orderForTitle1 = selected.slice().sort((a, b) => Math.sin(a * 0.8 + 0.5) - Math.sin(b * 0.8 + 0.5));
      orderForTitle2 = selected.slice().sort((a, b) => Math.sin(b * 0.8 + 0.5) - Math.sin(a * 0.8 + 0.5));
      break;

    case 12: // STRIDE-5 — step every 5 positions cyclically (coprime with 8)
      orderForTitle1 = strideOrder(5, 0);
      orderForTitle2 = strideOrder(5, 0).slice().reverse();
      break;

    case 13: // BIT-REVERSAL — 3-bit index reversal (FFT butterfly order)
      // Reverses the 3-bit binary representation of each index:
      //   bit0↔bit2, bit1 unchanged → 0→0, 1→4, 2→2, 3→6, 4→1, 5→5, 6→3, 7→7
      // Result: letters fire at every-other interval, then fill the gaps.
      orderForTitle1 = selected.slice().sort((a, b) => {
        const rev = x => ((x & 1) << 2) | (x & 2) | ((x >> 2) & 1);
        return rev(a) - rev(b);
      });
      orderForTitle2 = orderForTitle1.slice().reverse();
      break;

    case 14: // DUAL-CONVERGE — alternate from both ends toward center
      {
        const left  = selected.filter(i => i < n / 2).sort((a, b) => b - a); // 3,2,1,0
        const right = selected.filter(i => i >= n / 2).sort((a, b) => a - b); // 4,5,6,7
        // Interleave: right-end, left-end, right-end-1, left-end-1, …
        const r = right.slice().reverse(); // 7,6,5,4
        const l = left.slice();            // 3,2,1,0
        const t1 = [], t2 = [];
        for (let i = 0; i < Math.max(r.length, l.length); i++) {
          if (i < r.length) t1.push(r[i]);
          if (i < l.length) t1.push(l[i]);
        }
        orderForTitle1 = t1; // fires 7,3,6,2,5,1,4,0
        orderForTitle2 = t1.slice().reverse();
        break;
      }
  }

  // Apply animation order and light up Title 1
  orderForTitle1.forEach((idx, animOrder) => {
    const letter = letterGroups[0][idx];
    if (letter) {
      letter.style.setProperty('--anim-order', String(animOrder));
      letter.classList.add('hx-title-letter--lit');
    }
  });

  // Apply animation order and light up Title 2 (complementary direction)
  if (letterGroups[1]) {
    orderForTitle2.forEach((idx, animOrder) => {
      const letter = letterGroups[1][idx];
      if (letter) {
        letter.style.setProperty('--anim-order', String(animOrder));
        letter.classList.add('hx-title-letter--lit');
      }
    });
  }
}

/* ── Word submission ───────────────────────────────────────────── */
async function submitHexacoreWord() {
  // Too few letters — silently cancel (accidental drag).
  // Use assembled letter count so digraph tiles (2 letters each) are counted correctly.
  const assembledLength = hxSelected.reduce((sum, t) => sum + (t.tileType === 'rune' ? 1 : t.letter.length), 0);
  if (assembledLength < 4) {
    clearSelection();
    return;
  }

  const resolved = resolveLetters(hxSelected);
  if (!resolved || !isValidWord(resolved.join(''))) {
    clearSelection();
    return;
  }

  // Score
  const word     = resolved.join('');
  const hasPrism = hxSelected.some(t => t.tileType === 'prism');
  const hasEmber = hxSelected.some(t => t.tileType === 'ember');
  let base = 0;
  // Each element in resolved may be a multi-char string (digraph) or single char;
  // iterate over individual characters so each letter contributes its own point value.
  // Eclipse power-up: invert letter point values (common→rare, rare→common)
  if (hxState.eclipseActive) {
    resolved.forEach(l => {
      for (const ch of l) base += Math.max(1, (HX_MAX_LETTER_POINTS + 1) - (HX_LETTER_POINTS[ch] || 1));
    });
    hxState.eclipseActive = false;
  } else {
    resolved.forEach(l => { for (const ch of l) base += HX_LETTER_POINTS[ch] || 1; });
  }
  const lenMult = HX_LENGTH_MULTIPLIERS[word.length] || word.length;

  // Gem multipliers stack multiplicatively
  let gemMult = 1;
  hxSelected.forEach(t => {
    if (GEM_MULTIPLIERS[t.tileType]) gemMult *= GEM_MULTIPLIERS[t.tileType];
  });

  const countBonus = calcGemCountBonus(hxSelected);
  // Lodestone power-up: +1 to the gem-count bonus for this word
  const lodestoneBoost = hxState.lodestoneActive ? 1 : 0;
  if (hxState.lodestoneActive) hxState.lodestoneActive = false;

  const wordScore = base * lenMult * (hasPrism ? 2 : 1) * gemMult * (countBonus + lodestoneBoost);

  hxWordCount++;
  hxState.wordsSubmitted++;
  const oldScore = hxState.score;
  hxState.score += wordScore;
  hxState.words.push({ word, score: wordScore });

  updateScoreDisplay();
  animateScoreHud(oldScore, hxState.score);

  // XP gain — compute the values now but defer the UI until after refill
  // (Daily mode does not award XP or track quests)
  let xpGain = 0;
  let leveledUp = false;
  let newLevel = null;
  if (hxGameMode !== 'daily') {
    xpGain = calcWordXP(word, [...hxSelected]);
    ({ newLevel, leveledUp } = addXP(xpGain));
  }

  // Quest/portal tracking
  const gemsUsedInWord   = hxSelected.filter(t => t.tileType && t.tileType.startsWith('gem')).length;
  const portalUsedInWord = hxState.portalOpen && hxState.portalEntry && hxState.portalExit &&
    hxSelected.some(t => hxKey(t.q, t.r) === hxKey(hxState.portalEntry.q, hxState.portalEntry.r) ||
                         hxKey(t.q, t.r) === hxKey(hxState.portalExit.q,  hxState.portalExit.r));

  // Track portal usage for Eclipse achievement
  if (portalUsedInWord) {
    hxState.achievements.portalWordsUsed++;
  }

  if (hxGameMode !== 'daily') {
    updateQuestProgress('wordSubmitted', {
      word,
      tiles:               [...hxSelected],
      score:               hxState.score,
      gemsUsed:            gemsUsedInWord,
      portalUsed:          portalUsedInWord,
      gameLevel:           hxState.level,
      amethystCollected:   false,
      seleniteCollected:   false,
    });
  }
  updateAchievementProgress('wordSubmitted', {
    word,
    tiles: [...hxSelected],
    score: wordScore,
    portalUsed: portalUsedInWord,
  });
  updateStatTracking('wordSubmitted', {
    word,
    tiles: [...hxSelected],
    score: wordScore,
    portalUsed: portalUsedInWord,
    gameLevel: hxState.level,
  });

  // Campaign progress tracking
  if (hxGameMode === 'campaign') {
    updateCampaignProgress(word, [...hxSelected], wordScore, hxState);
  }

  const consumed = [...hxSelected];

  // Detect power-up collection (5+ letter word): amethyst, selenite + 5 new achievement tiles.
  // Update state immediately; queue the toast to show after the refill settles.
  const pendingPowerUpToasts = [];
  if (assembledLength >= 5) {
    const hasAmethystTile  = consumed.some(t => t.tileType === 'amethyst');
    const hasSelenieTile   = consumed.some(t => t.tileType === 'selenite');
    const hasOracleTile    = consumed.some(t => t.tileType === 'oracle');
    const hasBeaconTile    = consumed.some(t => t.tileType === 'beacon');
    const hasEclipseTile   = consumed.some(t => t.tileType === 'eclipse');
    const hasLodestoneTile = consumed.some(t => t.tileType === 'lodestone');
    const hasLexiconTile   = consumed.some(t => t.tileType === 'lexicon');
    if (hasAmethystTile) {
      hxState.amethystCount++;
      updatePowerUpBar();
      pendingPowerUpToasts.push('amethyst');
    }
    if (hasSelenieTile) {
      hxState.seleniteCount++;
      updatePowerUpBar();
      pendingPowerUpToasts.push('selenite');
    }
    if (hasOracleTile) {
      hxState.oracleCount++;
      updatePowerUpBar();
      pendingPowerUpToasts.push('oracle');
    }
    if (hasBeaconTile) {
      hxState.beaconCount++;
      updatePowerUpBar();
      pendingPowerUpToasts.push('beacon');
    }
    if (hasEclipseTile) {
      hxState.eclipseCount++;
      updatePowerUpBar();
      pendingPowerUpToasts.push('eclipse');
    }
    if (hasLodestoneTile) {
      hxState.lodestoneCount++;
      updatePowerUpBar();
      pendingPowerUpToasts.push('lodestone');
    }
    if (hasLexiconTile) {
      hxState.lexiconCount++;
      updatePowerUpBar();
      pendingPowerUpToasts.push('lexicon');
    }
    enqueueCollectedTileModals(consumed);
  }

  // Check achievement rewards (spawns new achievement tiles)
  const pendingAchievementSpawns = checkAchievementRewards(word, consumed, wordScore, portalUsedInWord);

  // If any portal tile is in the consumed set, close the portal now (before
  // tile animations start) so the glowing style doesn't play during pop-out.
  if (hxState.portalOpen && hxState.portalEntry && hxState.portalExit) {
    const entryKey = hxKey(hxState.portalEntry.q, hxState.portalEntry.r);
    const exitKey  = hxKey(hxState.portalExit.q,  hxState.portalExit.r);
    if (consumed.some(t => hxKey(t.q, t.r) === entryKey || hxKey(t.q, t.r) === exitKey)) {
      closePortal();
    }
  }

  // Decrement portal countdown; auto-close if it reaches 0 (and portal wasn't
  // already closed above because a portal tile was consumed this word).
  if (hxState.portalOpen) {
    hxState.portalWordsRemaining--;
    if (hxState.portalWordsRemaining <= 0) {
      closePortal();
    }
  }

  clearSelection();

  playSound('sfxSuccess');
  playSound('sfxFunk');
  triggerHexacoreTitleFlash(wordScore);
  // Consume tiles; in Daily mode this removes tiles permanently (no refill).
  await consumeAndRefill(consumed);
  stopSound('sfxFunk');

  if (!hxState.gameOver) {
    // Show all post-word UI feedback only after board settle
    checkHexacoreRequirements(word, consumed, wordScore);
    if (hxGameMode !== 'daily') {
      showXPGainToast(xpGain);
      if (leveledUp) showPlayerLevelUpBanner(newLevel);
      updateXPBarFn();
    }
    pendingPowerUpToasts.forEach(type => showPowerUpCollectToast(type));
    // Show achievement toasts for newly spawned achievement tiles (staggered)
    pendingAchievementSpawns.forEach((spawn, i) => {
      setTimeout(() => showAchievementToast(spawn.tileName, spawn.description), i * ACHIEVEMENT_TOAST_STAGGER_MS);
    });

    if (hxGameMode !== 'daily') {
      checkLevelUp(oldScore, hxState.score);
      playSound('sfxGemCollect');
      // Spawn gem reward based on word length
      spawnGemRewardForWord(word.length);
      // Fire bonus mirrors word reward
      if (hasEmber) spawnGemRewardForWord(word.length);
      spawnSpecialTiles();
      // Also spawn an ember on any 6+ letter word
      if (word.length >= 6) {
        spawnSpecialInRows('ember', [-GRID_RADIUS]);
      }

      // Portal milestone: open a new portal after every 10th word submitted
      if (hxState.wordsSubmitted > 0 && hxState.wordsSubmitted % 10 === 0) {
        closePortal(); // close any existing portal first
        openPortal();
      }
    } else {
      updateDailyHud();
      if (!hasAnyDailyWordLeft()) {
        showDailyNoWordsPrompt();
        return;
      }
    }

    await maybeRunTutorialModalQueue();
    saveHexacoreProgress();
  }
}

/* ── Consume tiles → gravity → ember → refill ─────────────────── */
async function consumeAndRefill(tilesToRemove) {
  // 1. Animate tiles out with a tile-by-tile stagger (first selected → last)
  tilesToRemove.forEach((tile, idx) => {
    tile.element.style.setProperty('--tile-idx', String(idx));
    const type = tile.tileType;
    if (type === 'ember' || type === 'prism' || type === 'rune' || type === 'amethyst' || type === 'selenite'
        || type === 'oracle' || type === 'beacon' || type === 'eclipse' || type === 'lodestone' || type === 'lexicon') {
      // Consumed-special class replaces hx-tile-removing with combined animation
      tile.element.classList.add(`hx-consumed-${type}`);
    } else if (HX_GEM_TYPES.has(type)) {
      tile.element.classList.add(`hx-consumed-${type}`);
    } else {
      tile.element.classList.add('hx-tile-removing');
    }
    tile.element.style.pointerEvents = 'none';
  });
  // Wait for all tiles to finish: pop-out duration + stagger * tile count
  await delay(270 + WORD_TILE_STAGGER_MS * tilesToRemove.length);

  tilesToRemove.forEach(tile => {
    tile.element.remove();
    _hxUnregisterTile(tile);
  });

  if (hxGameMode === 'daily') {
    await applyGravity();
    updateDailyHud();
    return;
  }

  // 2. Capture portal tile references before gravity so we can detect movement
  const preGravityEntryTile = hxState.portalOpen && hxState.portalEntry
    ? hxTileMap.get(hxKey(hxState.portalEntry.q, hxState.portalEntry.r))
    : null;
  const preGravityExitTile = hxState.portalOpen && hxState.portalExit
    ? hxTileMap.get(hxKey(hxState.portalExit.q, hxState.portalExit.r))
    : null;

  // 3. Gravity
  await applyGravity();
  if (hxState.gameOver) return;

  // If the portal is open and one of the portal tiles has moved (fallen),
  // transfer the portal identity to whatever tile now occupies the old portal position.
  if (hxState.portalOpen) {
    transferPortalIfMoved(preGravityEntryTile, preGravityExitTile);
  }

  // 4. Advance ember tiles
  await advanceFireTiles();
  if (hxState.gameOver) return;

  // 4b. Gravity after ember advancement: tiles above vacated ember slots
  //     should cascade down naturally before the refill runs.
  await applyGravity();
  if (hxState.gameOver) return;

  // 5. Refill empty columns (only the truly-topmost slots remain empty now)
  await refillGrid();
}

/* ── Gravity: Battle Balls-style SE/SW cascade ─────────────────── */
async function applyGravity() {
  function inBounds(pos) {
    const s = -pos.q - pos.r;
    return (
      Math.abs(pos.q) <= GRID_RADIUS &&
      Math.abs(pos.r) <= GRID_RADIUS &&
      Math.abs(s)     <= GRID_RADIUS
    );
  }

  let anyMoved = true;
  while (anyMoved) {
    anyMoved = false;
    const sorted       = [...hxState.tiles].sort((a, b) => b.r - a.r);
    const moves        = [];
    const plannedDests = new Set(); // O(1) lookup replaces moves.some() O(n) scan

    for (const tile of sorted) {
      const seKey = hxKey(tile.q,     tile.r + 1);
      const swKey = hxKey(tile.q - 1, tile.r + 1);
      const se    = { q: tile.q,     r: tile.r + 1 };
      const sw    = { q: tile.q - 1, r: tile.r + 1 };

      const seOk = inBounds(se) && !hxTileMap.has(seKey) && !plannedDests.has(seKey);
      const swOk = inBounds(sw) && !hxTileMap.has(swKey) && !plannedDests.has(swKey);

      if (seOk) {
        moves.push({ tile, fromQ: tile.q, fromR: tile.r, toQ: se.q, toR: se.r });
        plannedDests.add(seKey);
        anyMoved = true;
      } else if (swOk) {
        moves.push({ tile, fromQ: tile.q, fromR: tile.r, toQ: sw.q, toR: sw.r });
        plannedDests.add(swKey);
        anyMoved = true;
      }
    }

    if (moves.length === 0) break;
    await animateTileMoves(moves);
  }
}

/* ── Fire tile advancement: only ember tiles advance downward ── */
async function advanceFireTiles() {
  if (hxState.gameOver) return;

  const allFireTiles = [
    ...hxState.emberTiles.map(t => ({ tile: t, type: 'ember' })),
  ];

  const allMoves = [];
  const claimedDests = new Set(); // destinations already claimed by a planned ember move

  for (const { tile, type } of allFireTiles) {
    if (hxState.gameOver) break;

    // In a pointy-top grid the two lower neighbours of (q,r) are
    //   (q, r+1)   — lower-right (SE)
    //   (q-1, r+1) — lower-left  (SW)
    const candidates = [
      { q: tile.q,     r: tile.r + 1 },
      { q: tile.q - 1, r: tile.r + 1 },
    ].filter(pos => {
      const s = -pos.q - pos.r;
      return (
        Math.abs(pos.q) <= GRID_RADIUS &&
        Math.abs(pos.r) <= GRID_RADIUS &&
        Math.abs(s)     <= GRID_RADIUS
      );
    });

    if (candidates.length === 0) {
      if (type === 'ember') {
        triggerGameOver();
        return;
      }
    }

    // For ember tiles, exclude positions occupied by protected tile types
    // and positions already claimed by another ember this same turn.
    let validCandidates = candidates;
    if (type === 'ember') {
      const EMBER_BLOCKED_TYPES = ['ember', 'amethyst', 'selenite', 'oracle', 'beacon', 'eclipse', 'lodestone', 'lexicon'];
      validCandidates = candidates.filter(pos => {
        const key = hxKey(pos.q, pos.r);
        if (claimedDests.has(key)) return false; // another ember already heading here
        const occupant = hxTileMap.get(key);
        return !occupant
          || (!EMBER_BLOCKED_TYPES.includes(occupant.tileType) && !isPortalTile(occupant));
      });
      if (validCandidates.length === 0) continue; // blocked — ember stays put this turn
    }

    if (validCandidates.length === 0) continue;
    const target = validCandidates[Math.floor(Math.random() * validCandidates.length)];
    claimedDests.add(hxKey(target.q, target.r));

    // Displace any tile at the target before moving
    const displaced = hxTileMap.get(hxKey(target.q, target.r));
    if (displaced && displaced !== tile) {
      // If the displaced tile is a portal tile, close the portal first
      if (isPortalTile(displaced)) closePortal();
      displaced.element.remove();
      _hxUnregisterTile(displaced);
    }

    allMoves.push({ tile, fromQ: tile.q, fromR: tile.r, toQ: target.q, toR: target.r });
  }

  if (allMoves.length > 0 && !hxState.gameOver) {
    for (const move of allMoves) {
      if (hxState.gameOver) break;
      await animateTileMoves([move]);
    }
  }
}

/* ── Refill: spawn new tiles from above the column's top boundary ── */
async function refillGrid() {
  const board = hxSvg.querySelector('#board');
  if (!board) return;

  const allPromises = [];

  for (let q = -GRID_RADIUS; q <= GRID_RADIUS; q++) {
    const { r_min, r_max } = getColumnRange(q);
    const colIdx  = q + GRID_RADIUS;
    const colMoves = [];

    for (let r = r_min; r <= r_max; r++) {
      if (hxTileMap.has(hxKey(q, r))) continue;

      const result = randomLetterOrDigraphForPos(q, r);
      const tile   = createTile({
        hex:        new Hex(q, r),
        layout:     hxLayout,
        key:        hxKey(q, r),
        letter:     result.isDigraph ? result.digraph : result.letter,
        pointValue: result.isDigraph ? result.points : (HX_LETTER_POINTS[result.letter] || 1),
      });
      if (result.isDigraph) {
        tile.tileType = 'digraph';
        tile.point    = result.points;
        _hxRegisterTile(tile, hxState.digraphTiles);
        applyTileType(tile);
      } else {
        tile.tileType = 'normal';
      }
      enqueueTileIntroduction(tile);
      tile.s        = -q - r;

      hxState.tiles.push(tile);
      hxTileMap.set(hxKey(q, r), tile);
      board.appendChild(tile.element);

      // Hide until the column's stagger delay fires
      tile.element.style.opacity = '0';

      // Spawn from one hex-step above the column's topmost slot
      colMoves.push({ tile, fromQ: q, fromR: r_min - 1, toQ: q, toR: r });
    }

    if (colMoves.length > 0) {
      allPromises.push(
        new Promise(resolve => {
          setTimeout(async () => {
            colMoves.forEach(m => { m.tile.element.style.opacity = '1'; });
            // Stagger tiles within the column top-to-bottom (colMoves is already r_min→r_max)
            await animateTileMovesStaggered(colMoves, REFILL_COL_TILE_STAGGER_MS);
            resolve();
          }, colIdx * REFILL_STAGGER_MS);
        }),
      );
    }
  }

  if (allPromises.length > 0) await Promise.all(allPromises);
}

/* ── Gem tile helpers ──────────────────────────────────────────── */

/** Returns a random normal tile from anywhere on the board (not ember/prism/rune/gem/portal). */
function getRandomNormalTile() {
  const eligible = hxState.tiles.filter(t => (t.tileType === 'normal' || t.tileType === 'digraph') && !isPortalTile(t));
  if (eligible.length === 0) return null;
  return eligible[Math.floor(Math.random() * eligible.length)];
}

/** Returns multiple distinct random normal tiles (up to `count`). */
function getRandomNormalTiles(count) {
  const eligible = hxState.tiles.filter(t => (t.tileType === 'normal' || t.tileType === 'digraph') && !isPortalTile(t));
  const result = [];
  const used = new Set();
  while (result.length < count && result.length < eligible.length) {
    const idx = Math.floor(Math.random() * eligible.length);
    if (!used.has(idx)) { used.add(idx); result.push(eligible[idx]); }
  }
  return result;
}

/** The gem-type → state-array mapping. */
const GEM_STATE_KEY = {
  gemEmerald:      'gemEmeraldTiles',
  gemGold:         'gemGoldTiles',
  gemSapphire:     'gemSapphireTiles',
  gemPearl:        'gemPearlTiles',
  gemTanzanite:    'gemTanzaniteTiles',
  gemRuby:         'gemRubyTiles',
  gemDiamond:      'gemDiamondTiles',
  gemAquamarine:   'gemAquamarineTiles',
  gemTopaz:        'gemTopazTiles',
  gemOpal:         'gemOpalTiles',
  gemImperialJade: 'gemImperialJadeTiles',
  gemAlexandrite:  'gemAlexandriteTiles',
};

/** The gem-type → spawn CSS class mapping. */
const GEM_SPAWN_CLASS = {
  gemEmerald:      'hx-gem-emerald-spawn',
  gemGold:         'hx-gem-gold-spawn',
  gemSapphire:     'hx-gem-sapphire-spawn',
  gemPearl:        'hx-gem-pearl-spawn',
  gemTanzanite:    'hx-gem-tanzanite-spawn',
  gemRuby:         'hx-gem-ruby-spawn',
  gemDiamond:      'hx-gem-diamond-spawn',
  gemAquamarine:   'hx-gem-aquamarine-spawn',
  gemTopaz:        'hx-gem-topaz-spawn',
  gemOpal:         'hx-gem-opal-spawn',
  gemImperialJade: 'hx-gem-imperialjade-spawn',
  gemAlexandrite:  'hx-gem-alexandrite-spawn',
};

/**
 * Transforms an existing normal tile in-place into the given gem type.
 * Updates state, applies styling, and plays the spawn animation.
 */
function transformTileToGem(tile, gemType) {
  if (!tile || (tile.tileType !== 'normal' && tile.tileType !== 'digraph')) return;
  if (tile.tileType === 'digraph') _hxClearTileType(tile);
  tile.tileType = gemType;
  _hxRegisterTile(tile, hxState[GEM_STATE_KEY[gemType]]);
  applyTileType(tile);
  enqueueTileIntroduction(tile);
  const spawnClass = GEM_SPAWN_CLASS[gemType];
  tile.element.classList.add(spawnClass);
  tile.element.addEventListener('animationend', () => {
    tile.element.classList.remove(spawnClass);
  }, { once: true });
}

/**
 * Gem spawn table — spawns are applied to random normal tiles AFTER
 * consumeAndRefill has fully resolved (gravity + ember + refill all done).
 *
 *  4 letters: 1 emerald
 *  5 letters: 2 emerald, 1 gold
 *  6 letters: 3 emerald, 2 gold, 1 sapphire
 *  7 letters: 4 emerald, 3 gold, 2 sapphire, 1 pearl
 *  8 letters: 5 emerald, 4 gold, 3 sapphire, 2 pearl, 1 tanzanite
 *  9 letters: 6 emerald, 5 gold, 4 sapphire, 3 pearl, 2 tanzanite, 1 ruby
 * 10 letters: base (23 gems) — includes 1 diamond
 * 11 letters: base + 1 aquamarine
 * 12 letters: base + 1 aquamarine + 1 topaz
 * 13 letters: base + ... + 1 opal
 * 14 letters: base + ... + 1 imperialJade
 * 15+ letters: base + ... + 1 alexandrite
 */
function spawnGemRewardForWord(wordLength) {
  const plan = [];

  if (wordLength < 4) return; // < 4 letters — no gem reward

  // Tiers 4–9: each tier is a fixed pyramid (no 10-letter base)
  const LOW_TIER_PLANS = {
    4: [['gemEmerald', 1]],
    5: [['gemEmerald', 2], ['gemGold', 1]],
    6: [['gemEmerald', 3], ['gemGold', 2], ['gemSapphire', 1]],
    7: [['gemEmerald', 4], ['gemGold', 3], ['gemSapphire', 2], ['gemPearl', 1]],
    8: [['gemEmerald', 5], ['gemGold', 4], ['gemSapphire', 3], ['gemPearl', 2], ['gemTanzanite', 1]],
    9: [['gemEmerald', 6], ['gemGold', 5], ['gemSapphire', 4], ['gemPearl', 3], ['gemTanzanite', 2], ['gemRuby', 1]],
  };

  if (wordLength <= 9) {
    for (const [gem, count] of LOW_TIER_PLANS[wordLength]) {
      plan.push(...Array(count).fill(gem));
    }
  } else {
    // Base 10-letter tier — Diamond first appears here
    plan.push(...Array(6).fill('gemEmerald'));
    plan.push(...Array(5).fill('gemGold'));
    plan.push(...Array(4).fill('gemSapphire'));
    plan.push(...Array(3).fill('gemPearl'));
    plan.push(...Array(2).fill('gemTanzanite'));
    plan.push(...Array(2).fill('gemRuby'));
    plan.push('gemDiamond');

    // Each letter beyond 10 adds one more ultra-tier gem
    const HIGH_TIER_EXTRAS = [
      'gemAquamarine', 'gemTopaz', 'gemOpal',
      'gemImperialJade', 'gemAlexandrite',
    ];
    const extraCount = Math.min(wordLength - 10, HIGH_TIER_EXTRAS.length);
    for (let i = 0; i < extraCount; i++) {
      plan.push(HIGH_TIER_EXTRAS[i]);
    }
  }

  // Spawn each gem on a distinct random normal tile
  for (const gemType of plan) {
    const target = getRandomNormalTile();
    if (target) transformTileToGem(target, gemType);
  }
}

/* ── Special tile spawning ─────────────────────────────────────── */
function spawnSpecialTiles() {
  // Every 3 words → 1 new ember in top row
  if (hxWordCount % 3 === 0) {
    spawnSpecialInRows('ember', [-GRID_RADIUS]);
  }
  // Random interval (4–6 words) → 1 new prism in top 3 rows
  if (hxWordCount >= hxNextPrismSpawn) {
    spawnSpecialInRows('prism', [-GRID_RADIUS, -GRID_RADIUS + 1, -GRID_RADIUS + 2]);
    hxNextPrismSpawn = hxWordCount + Math.floor(Math.random() * 3) + 4;
  }
  // Every 7 words → 1 new rune in top 3 rows
  if (hxWordCount % 7 === 0) {
    spawnSpecialInRows('rune', [-GRID_RADIUS, -GRID_RADIUS + 1, -GRID_RADIUS + 2]);
  }
  // Every 12 words → 1 new amethyst in top 3 rows
  if (hxWordCount % 12 === 0) {
    spawnSpecialInRows('amethyst', [-GRID_RADIUS, -GRID_RADIUS + 1, -GRID_RADIUS + 2]);
  }
  // Every 15 words → 1 new selenite in top 3 rows
  if (hxWordCount % 15 === 0) {
    spawnSpecialInRows('selenite', [-GRID_RADIUS, -GRID_RADIUS + 1, -GRID_RADIUS + 2]);
  }
}

function convertTile(target, type) {
  if (!target) return;
  if (target.tileType === 'digraph') _hxClearTileType(target);
  if (target.tileType && target.tileType !== 'normal' && target.tileType !== 'digraph') _hxClearTileType(target);

  target.tileType = type;
  if (type === 'ember') _hxRegisterTile(target, hxState.emberTiles);
  else if (type === 'prism') _hxRegisterTile(target, hxState.prismTiles);
  else if (type === 'rune')  _hxRegisterTile(target, hxState.runeTiles);
  else if (type === 'amethyst') _hxRegisterTile(target, hxState.amethystTiles);
  else if (type === 'selenite') _hxRegisterTile(target, hxState.seleniteTiles);
  else if (type === 'oracle')   _hxRegisterTile(target, hxState.oracleTiles);
  else if (type === 'beacon')   _hxRegisterTile(target, hxState.beaconTiles);
  else if (type === 'eclipse')  _hxRegisterTile(target, hxState.eclipseTiles);
  else if (type === 'lodestone') _hxRegisterTile(target, hxState.lodestoneTiles);
  else if (type === 'lexicon')  _hxRegisterTile(target, hxState.lexiconTiles);
  else if (type === 'gemEmerald') _hxRegisterTile(target, hxState.gemEmeraldTiles);
  else if (type === 'gemGold') _hxRegisterTile(target, hxState.gemGoldTiles);
  else if (type === 'gemSapphire') _hxRegisterTile(target, hxState.gemSapphireTiles);
  else if (type === 'gemPearl') _hxRegisterTile(target, hxState.gemPearlTiles);
  else if (type === 'gemTanzanite') _hxRegisterTile(target, hxState.gemTanzaniteTiles);
  else if (type === 'gemRuby') _hxRegisterTile(target, hxState.gemRubyTiles);
  else if (type === 'gemDiamond') _hxRegisterTile(target, hxState.gemDiamondTiles);
  else if (type === 'gemAquamarine') _hxRegisterTile(target, hxState.gemAquamarineTiles);
  else if (type === 'gemTopaz') _hxRegisterTile(target, hxState.gemTopazTiles);
  else if (type === 'gemOpal') _hxRegisterTile(target, hxState.gemOpalTiles);
  else if (type === 'gemImperialJade') _hxRegisterTile(target, hxState.gemImperialJadeTiles);
  else if (type === 'gemAlexandrite') _hxRegisterTile(target, hxState.gemAlexandriteTiles);
  else if (type === 'digraph') {
    const { digraph, points } = randomDigraph();
    target.letter = digraph;
    target.point  = points;
    _hxRegisterTile(target, hxState.digraphTiles);
  }

  applyTileType(target);
  enqueueTileIntroduction(target);

  const spawnClass = `hx-${type}-spawn`;
  target.element.classList.add(spawnClass);
  target.element.addEventListener('animationend', () => {
    target.element.classList.remove(spawnClass);
  }, { once: true });
}

function spawnSpecialInRows(type, rows) {
  const eligible = hxState.tiles.filter(
    t => (t.tileType === 'normal' || t.tileType === 'digraph') && rows.includes(t.r) && !isPortalTile(t),
  );
  if (eligible.length === 0) return;
  const target = eligible[Math.floor(Math.random() * eligible.length)];

  convertTile(target, type);
}

function showDailyNoWordsPrompt() {
  document.getElementById('hx-daily-no-words-overlay')?.remove();
  const overlay = document.createElement('div');
  overlay.id = 'hx-daily-no-words-overlay';
  overlay.innerHTML = `
    <div id="hx-daily-no-words-box">
      <h2>NO MORE VALID WORDS</h2>
      <p>Are you satisfied with your board?</p>
      <button id="hx-daily-nw-submit-btn" class="hx-btn-primary" type="button">SUBMIT</button>
      <button id="hx-daily-nw-better-btn" type="button">I CAN DO BETTER</button>
    </div>
  `;
  document.body.appendChild(overlay);
  document.getElementById('hx-daily-nw-submit-btn')?.addEventListener('click', async () => {
    overlay.remove();
    await completeDailyChallenge();
  });
  document.getElementById('hx-daily-nw-better-btn')?.addEventListener('click', () => {
    overlay.remove();
  });
}

async function completeDailyChallenge() {
  if (hxGameMode !== 'daily' || hxState.dailySubmitted) return;
  document.getElementById('hx-daily-no-words-overlay')?.remove();
  hxState.dailySubmitted = true;
  hxState.active = false;
  clearSelection();

  const wordTotal = getDailyWordTotal();
  const penalty = getDailyUnusedPenalty();
  const finalScore = Math.max(0, wordTotal - penalty);
  const tilesUsed = 61 - hxState.tiles.length;
  const solveTimeSeconds = Math.max(0, Math.round((Date.now() - (hxState.dailyStartMs || Date.now())) / 1000));
  const words = hxState.words.map(w => w.word);

  hxState.dailyFinalScore = finalScore;
  hxState.dailyPenalty = penalty;
  hxState.dailyTilesUsed = tilesUsed;
  const submissionDate = hxState.dailyBoardDate || null;

  let name = getPlayerName();
  if (!name) {
    name = await promptPlayerName();
  }
  if (name && submissionDate) {
    await submitScore(
      submissionDate,
      finalScore,
      words,
      0,
      HX_DAILY_MODE_ID,
      { tilesUsed, penalty, solveTimeSeconds },
    );
  } else if (!submissionDate) {
    console.warn('[hexacore] daily score submission skipped: missing daily board date');
  }

  // Persist completion so the Daily card is disabled until midnight ET.
  hxMarkDailyCompleted();

  showDailyChallengeResults({
    finalScore,
    wordTotal,
    penalty,
    tilesUsed,
    tilesTotal: 61,
    words,
  });
}

function showDailyChallengeResults({ finalScore, wordTotal, penalty, tilesUsed, tilesTotal, words }) {
  document.getElementById('hx-daily-result-overlay')?.remove();
  const overlay = document.createElement('div');
  overlay.id = 'hx-daily-result-overlay';
  overlay.innerHTML = `
    <div id="hx-daily-result-box">
      <h2>DAILY CHALLENGE COMPLETE</h2>
      <div class="hx-final-score">${finalScore.toLocaleString()}</div>
      <div class="hx-stats">
        Submission complete<br>
        Words Submitted: ${words.length}<br>
        Total Word Score: ${wordTotal.toLocaleString()}<br>
        Tiles Used: ${tilesUsed} / ${tilesTotal}<br>
        Penalty: -${penalty.toLocaleString()}
      </div>
      <div id="hx-daily-opt-wrap" style="margin-bottom:1rem;font-size:0.74rem;min-height:2rem;color:#cbd5e1;"></div>
      <button id="hx-daily-opt-btn" class="hx-btn-primary" type="button">VIEW OPTIMAL SOLUTIONS</button>
      <button id="hx-daily-leaderboard-btn" type="button">LEADERBOARD</button>
      <button id="hx-daily-again-btn" type="button">PLAY AGAIN</button>
      <button id="hx-daily-menu-btn" type="button">MAIN MENU</button>
    </div>
  `;
  document.body.appendChild(overlay);

  document.getElementById('hx-daily-opt-btn')?.addEventListener('click', () => {
    const wrap = document.getElementById('hx-daily-opt-wrap');
    if (!wrap) return;
    const strategies = (hxState.dailyMetadata?.optimalSolutions || []).slice(0, 3);
    if (strategies.length === 0) {
      wrap.textContent = 'No strategy data available.';
      return;
    }
    wrap.innerHTML = strategies.map((s, i) =>
      `<div style="text-align:left;margin:0.4rem 0;"><strong>#${i + 1}</strong> · ${(s.finalScore || 0).toLocaleString()} pts · ${(s.words || []).join(', ')}</div>`
    ).join('');
  });
  document.getElementById('hx-daily-leaderboard-btn')?.addEventListener('click', () => openLeaderboardsModal('daily'));
  document.getElementById('hx-daily-again-btn')?.addEventListener('click', () => {
    overlay.remove();
    startHexacore('daily');
  });
  document.getElementById('hx-daily-menu-btn')?.addEventListener('click', () => window.location.reload());
}

/* ── Game over ─────────────────────────────────────────────────── */
function triggerGameOver() {
  if (hxState.gameOver) return;
  hxState.gameOver = true;
  hxState.active   = false;

  window.removeEventListener('beforeunload', saveHexacoreProgress);
  window.removeEventListener('pagehide',     saveHexacoreProgress);
  clearHexacoreSave();
  if (hxPointerCleanup) { hxPointerCleanup(); hxPointerCleanup = null; }
  cancelAmethystTargeting();
  cancelSeleniteTargeting();
  clearSelection();
  document.body.classList.remove('hx-active');

  // Restore the user's original theme preference
  restoreUserTheme();

  // Restore game title
  restoreDefaultTitle();

  removeHud();

  // Update player profile stats
  const { xp: xpNow } = getXPData();
  updateProfile({
    words:     hxState.words,
    score:     hxState.score,
    xpEarned:  0, // XP was already added incrementally
    level:     hxState.level,
  });
  updateAchievementProgress('gameOver', {
    score: hxState.score,
    words: hxState.words.length,
    level: hxState.level,
  });
  updateStatTracking('gameOver', { score: hxState.score, level: hxState.level });
  saveSessionHistory({
    score: hxState.score,
    words: hxState.words.length,
    level: hxState.level,
    mode: hxGameMode,
    date: new Date().toISOString(),
  });
  updateStats({ sessionScore: hxState.score, sessionWords: hxState.words.length });

  showGameOver();
}

async function showGameOver() {
  document.getElementById('hx-gameover-overlay')?.remove();

  const best = hxState.words.length > 0
    ? hxState.words.reduce((b, w) => w.score > b.score ? w : b)
    : null;

  const overlay = document.createElement('div');
  overlay.id = 'hx-gameover-overlay';
  overlay.innerHTML = `
    <div id="hx-gameover-box">
      <h2>HEXACORE OVER</h2>
      <div class="hx-final-score">${hxState.score}</div>
      <div class="hx-stats">
        LEVEL ${hxState.level} &nbsp;&middot;&nbsp;
        ${hxState.words.length} WORD${hxState.words.length !== 1 ? 'S' : ''} FOUND
        ${best ? `&nbsp;&middot;&nbsp; BEST: ${escapeHtml(best.word)} (${best.score} pts)` : ''}
      </div>
      <div id="hx-lb-area" style="margin-bottom:1rem;font-size:0.8rem;min-height:2rem;color:#94a3b8;">
        Loading leaderboard&hellip;
      </div>
      <button id="hx-btn-submit" class="hx-btn-primary" type="button">
        🏆 SUBMIT SCORE &amp; VIEW LEADERBOARD
      </button>
      <button id="hx-btn-again" type="button">🔄 PLAY AGAIN</button>
      <button id="hx-btn-menu"  type="button">🏠 MAIN MENU</button>
    </div>
  `;
  document.body.appendChild(overlay);

  document.getElementById('hx-btn-submit')?.addEventListener('click', handleSubmitScore);
  document.getElementById('hx-btn-again')?.addEventListener('click', () => {
    overlay.remove();
    clearHexacoreSave();
    startHexacoreMode(hxGameMode);
  });
  document.getElementById('hx-btn-menu')?.addEventListener('click', () => {
    window.location.reload();
  });

  // Auto-submit if player already has a name, otherwise load leaderboard in background
  if (getPlayerName()) {
    handleSubmitScore();
  } else {
    loadLeaderboard();
  }
}

async function handleSubmitScore() {
  const btn = document.getElementById('hx-btn-submit');
  if (!btn || btn.disabled) return;
  btn.disabled    = true;
  btn.textContent = '⏳ Submitting…';

  let name = getPlayerName();
  if (!name) name = await promptPlayerName();
  if (!name) {
    btn.disabled    = false;
    btn.textContent = '🏆 SUBMIT SCORE & VIEW LEADERBOARD';
    return;
  }

  // dailyId = 'hexacore' is how the API key-partitions the hexacore leaderboard
  const result = await submitScore(HX_LEADERBOARD_ID, hxState.score, hxState.words.map(w => w.word), 0, 'hexacore');
  btn.textContent = '✓ SUBMITTED';

  await loadLeaderboard(result);
}

async function loadLeaderboard(submitResult) {
  const area = document.getElementById('hx-lb-area');
  if (!area) return;
  area.textContent = 'Loading…';

  // dailyId = 'hexacore' partitions this leaderboard from daily/unlimited
  const result = await fetchLeaderboard(HX_LEADERBOARD_ID, 'hexacore');

  if (!result.configured || result.entries.length === 0) {
    area.textContent = 'No leaderboard entries yet.';
    return;
  }

  const currentPlayer = getPlayerName();
  const entries = result.entries.slice(0, 20);
  let playerRank = -1;

  const rows = entries.map((e, i) => {
    const isCurrentPlayer = currentPlayer && e.player_name === currentPlayer;
    if (isCurrentPlayer) playerRank = i + 1;
    const rowStyle = isCurrentPlayer
      ? 'color:#f59e0b;font-weight:bold'
      : '';
    return `
    <tr class="hx-lb-row" style="${rowStyle}">
      <td style="padding:0.35rem 0.5rem;opacity:0.5;width:2rem">${i + 1}</td>
      <td class="hx-lb-player-name" style="padding:0.35rem 0.5rem">${escapeHtml(e.player_name || 'Anonymous')}</td>
      <td style="padding:0.35rem 0.5rem;color:${isCurrentPlayer ? '#f59e0b' : '#4cc9f0'};font-weight:700;text-align:right">${e.score.toLocaleString()}</td>
    </tr>`;
  }).join('');

  // New-best feedback (shown after leaderboard so it persists)
  let newBestMsg = '';
  if (submitResult) {
    newBestMsg = submitResult.newBest === false
      ? `<div style="margin-top:0.5rem;font-size:0.78rem;color:#94a3b8">Not a new high score — your best stands.</div>`
      : `<div style="margin-top:0.5rem;font-size:0.78rem;color:#f59e0b;font-weight:bold">🏆 New personal best!</div>`;
  }

  const rankMsg = currentPlayer
    ? (playerRank > 0
        ? `<div style="margin-top:0.5rem;font-size:0.78rem;color:#f59e0b;font-weight:bold">You are ranked #${playerRank} all-time</div>`
        : `<div style="margin-top:0.5rem;font-size:0.78rem;color:#94a3b8">Keep playing to reach the top 20!</div>`)
    : '';

  area.innerHTML = `
    <table style="width:100%;border-collapse:collapse;margin-top:0.4rem">
      <thead>
        <tr style="opacity:0.5;text-transform:uppercase;border-bottom:1px solid rgba(255,255,255,0.14)">
          <th style="padding:0.35rem 0.5rem;text-align:left;font-weight:normal">#</th>
          <th style="padding:0.35rem 0.5rem;text-align:left;font-weight:normal">Player</th>
          <th style="padding:0.35rem 0.5rem;text-align:right;font-weight:normal">Score</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>${newBestMsg}${rankMsg}`;
}

/* ── Alert helper (reuse existing modal) ───────────────────────── */
function showAlert(msg) {
  const modal = document.getElementById('alert-modal');
  const text  = document.getElementById('alert-text');
  const ok    = document.getElementById('alert-ok');
  if (!modal || !text || !ok) return;
  text.textContent = msg;
  modal.classList.remove('hidden');
  const close = () => { modal.classList.add('hidden'); ok.removeEventListener('click', close); };
  ok.addEventListener('click', close);
}

/* ── Misc ──────────────────────────────────────────────────────── */
function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

function loadHexacoreTutorialState() {
  try {
    const json = localStorage.getItem(HX_TUTORIAL_SAVE_KEY);
    if (!json) return [];
    const parsed = JSON.parse(json);
    if (Array.isArray(parsed)) return parsed;
    return Array.isArray(parsed.introduced) ? parsed.introduced : [];
  } catch (_) {
    return [];
  }
}

function saveHexacoreTutorialState() {
  try {
    localStorage.setItem(HX_TUTORIAL_SAVE_KEY, JSON.stringify({
      introduced: [...hxIntroducedTileTypes],
    }));
  } catch (_) {
    /* ignore storage errors */
  }
}

function getTileTypeDisplayName(tileType) {
  if (tileType === 'normal') return 'Letter Tile';
  if (tileType === 'digraph') return 'Digraph Tile';
  if (tileType === 'ember') return 'Ember Tile';
  if (tileType === 'prism') return 'Prism Tile';
  if (tileType === 'rune') return 'Rune Tile';
  if (tileType === 'amethyst') return 'Amethyst Tile';
  if (tileType === 'selenite') return 'Selenite Tile';
  if (HX_ACHIEVEMENT_TILE_META[tileType]) {
    const meta = HX_ACHIEVEMENT_TILE_META[tileType];
    return `${meta.label} Achievement Tile`;
  }
  if (tileType?.startsWith('gem')) {
    const base = tileType.replace(/^gem/, '').replace(/([A-Z])/g, ' $1').trim();
    return `${base} Gem Tile`;
  }
  return `${tileType} Tile`;
}

function getTileIntroDescription(tileType) {
  if (tileType === 'normal') return 'Letter tiles are the core of every word you build.';
  if (tileType === 'digraph') return 'Digraph tiles count as both letters on the same tile.';
  if (tileType === 'ember') return 'Ember tiles advance downward each turn and can end your run.';
  if (tileType === 'prism') return 'Prism tiles double the final score of the word they are in.';
  if (tileType === 'rune') return 'Rune tiles are wildcards and let you choose any letter.';
  if (tileType === 'amethyst') return 'Match Amethyst in a 5+ letter word to gain Transmute.';
  if (tileType === 'selenite') return 'Match Selenite in a 5+ letter word to gain Phase Swap.';
  if (HX_ACHIEVEMENT_TILE_META[tileType]) return HX_ACHIEVEMENT_TILE_META[tileType].intro;
  if (tileType?.startsWith('gem')) {
    const mult = GEM_MULTIPLIERS[tileType];
    return `Gem tiles multiply score${mult ? ` (${mult}x for this gem)` : ''}.`;
  }
  return 'Special tiles grant unique effects when used in words.';
}

function getAchievementCollectionProgress() {
  return HX_ACHIEVEMENT_TILE_ORDER
    .map(type => hxAchievementLettersCollected.has(type) ? HX_ACHIEVEMENT_TILE_META[type].letter : '_')
    .join('');
}

function findTileByType(tileType) {
  return hxState.tiles.find(t => t.tileType === tileType) || null;
}

function hasTransientBoardAnimations() {
  if (!hxSvg) return false;
  if (typeof Element.prototype.getAnimations === 'function') {
    const animated = [...hxSvg.querySelectorAll('.tile, .tile *')];
    if (animated.some(el => el.getAnimations().some(anim => {
      const timing = anim.effect?.getTiming?.();
      return anim.playState === 'running' && timing?.iterations !== Infinity;
    }))) {
      return true;
    }
  }
  return !!hxSvg.querySelector('.hx-tile-removing, [class*="-spawn"], [class*="hx-consumed-"]');
}

async function waitForBoardToSettle(maxMs = 2000) {
  const start = performance.now();
  while (hasTransientBoardAnimations() && performance.now() - start < maxMs) {
    await delay(80);
  }
}

function enqueueTutorialModal(item) {
  hxPendingTutorialModals.push(item);
  void maybeRunTutorialModalQueue();
}

function enqueueTileIntroduction(tile) {
  if (!tile) return;
  const type = tile.tileType || 'normal';
  // Skip basic letter/digraph tiles — no intro modal needed for them
  if (type === 'normal' || type === 'digraph') return;
  if (hxIntroducedTileTypes.has(type) || hxQueuedTileIntros.has(type)) return;
  hxQueuedTileIntros.add(type);
  enqueueTutorialModal({ kind: 'intro', tileType: type, tile });
}

function enqueueCollectedTileModals(consumedTiles) {
  if (!Array.isArray(consumedTiles) || consumedTiles.length === 0) return;

  if (consumedTiles.some(t => t.tileType === 'amethyst')) {
    enqueueTutorialModal({
      kind: 'collection',
      title: 'Amethyst Collected',
      description: "You've collected an Amethyst tile and gained 1 Transmute charge.",
      tileType: 'amethyst',
    });
  }

  if (consumedTiles.some(t => t.tileType === 'selenite')) {
    enqueueTutorialModal({
      kind: 'collection',
      title: 'Selenite Collected',
      description: "You've collected a Selenite tile and gained 1 Phase Swap charge.",
      tileType: 'selenite',
    });
  }

  HX_ACHIEVEMENT_TILE_ORDER.forEach(type => {
    if (!consumedTiles.some(t => t.tileType === type)) return;
    hxAchievementLettersCollected.add(type);
    const letter = HX_ACHIEVEMENT_TILE_META[type].letter;
    const collected = hxAchievementLettersCollected.size;
    enqueueTutorialModal({
      kind: 'collection',
      title: `${HX_ACHIEVEMENT_TILE_META[type].label} Collected`,
      description: `You've collected "${letter}"! Progress: ${getAchievementCollectionProgress()} (${collected}/${HX_ACHIEVEMENT_TILE_ORDER.length})`,
      tileType: type,
    });
  });
}

function queueBoardTileIntroductions() {
  hxState.tiles.forEach(tile => enqueueTileIntroduction(tile));
}

function hasBlockingHexacoreModal() {
  return !!(
    document.getElementById('hx-rune-picker')
    || document.getElementById('hx-lexicon-modal')
    || document.getElementById('hx-challenges-modal')
    || document.getElementById('hx-gameover-overlay')
  );
}

function closeTutorialModal(resolve, overlay, arrowSvg, wasActive, restoreFocusEl) {
  overlay.remove();
  arrowSvg?.remove();
  if (restoreFocusEl?.isConnected) restoreFocusEl.focus();
  hxTutorialModalOpen = false;
  if (!hxState.gameOver) hxState.active = wasActive;
  resolve();
}

function showTutorialModal(item, tile) {
  return new Promise(resolve => {
    const wasActive = hxState.active;
    hxState.active = false;
    hxTutorialModalOpen = true;

    // Full-screen click-blocker — transparent so the board stays fully visible
    const overlay = document.createElement('div');
    overlay.id = 'hx-tutorial-modal';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'hx-tutorial-modal-title');
    overlay.setAttribute('aria-describedby', 'hx-tutorial-modal-desc');

    const box = document.createElement('div');
    box.className = 'hx-tutorial-modal-box';

    const title = document.createElement('h3');
    title.id = 'hx-tutorial-modal-title';
    title.className = 'hx-tutorial-modal-title';
    title.textContent = item.kind === 'intro'
      ? `${getTileTypeDisplayName(item.tileType)} Found`
      : (item.title || 'Tile Collected');

    const desc = document.createElement('p');
    desc.id = 'hx-tutorial-modal-desc';
    desc.className = 'hx-tutorial-modal-desc';
    desc.textContent = item.kind === 'intro'
      ? getTileIntroDescription(item.tileType)
      : item.description;

    const ok = document.createElement('button');
    ok.type = 'button';
    ok.className = 'hx-tutorial-modal-ok';
    ok.textContent = 'OK';

    // The tile is NOT highlighted or modified — it appears exactly as the player sees it.
    let arrowSvg = null;

    const restoreFocusEl = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    ok.addEventListener('click', () => closeTutorialModal(resolve, overlay, arrowSvg, wasActive, restoreFocusEl), { once: true });

    box.append(title, desc, ok);
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    // After layout: draw a dashed connector from the modal's top-centre to the tile centre.
    requestAnimationFrame(() => {
      ok.focus();
      if (tile?.element) {
        const tileRect = tile.element.getBoundingClientRect();
        const boxRect  = box.getBoundingClientRect();
        if (tileRect.width > 0 && boxRect.width > 0) {
          const tx = tileRect.left + tileRect.width  / 2;
          const ty = tileRect.top  + tileRect.height / 2;
          const bx = boxRect.left  + boxRect.width   / 2;
          const by = boxRect.top;

          arrowSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
          arrowSvg.setAttribute('class', 'hx-tutorial-arrow-svg');
          arrowSvg.setAttribute('aria-hidden', 'true');

          const defs   = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
          const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
          marker.setAttribute('id',          'hx-tut-tip');
          marker.setAttribute('markerWidth',  '7');
          marker.setAttribute('markerHeight', '7');
          marker.setAttribute('refX',         '3.5');
          marker.setAttribute('refY',         '3.5');
          marker.setAttribute('orient',       'auto-start-reverse');
          const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
          dot.setAttribute('cx', '3.5');
          dot.setAttribute('cy', '3.5');
          dot.setAttribute('r',  '3');
          dot.setAttribute('fill', 'rgba(76,201,240,0.9)');
          marker.appendChild(dot);
          defs.appendChild(marker);
          arrowSvg.appendChild(defs);

          const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
          line.setAttribute('x1', String(bx));
          line.setAttribute('y1', String(by));
          line.setAttribute('x2', String(tx));
          line.setAttribute('y2', String(ty));
          line.setAttribute('stroke',           'rgba(76,201,240,0.65)');
          line.setAttribute('stroke-width',     '1.5');
          line.setAttribute('stroke-dasharray', '5,4');
          line.setAttribute('marker-end',       'url(#hx-tut-tip)');
          arrowSvg.appendChild(line);

          document.body.appendChild(arrowSvg);
        }
      }
    });
  });
}

async function maybeRunTutorialModalQueue() {
  if (hxTutorialQueueRunning || hxTutorialModalOpen || hxState.gameOver || !hxSvg) return;
  if (hxPendingTutorialModals.length === 0) return;

  hxTutorialQueueRunning = true;
  try {
    while (hxPendingTutorialModals.length > 0 && !hxState.gameOver) {
      if (hasBlockingHexacoreModal()) {
        await delay(120);
        continue;
      }
      await waitForBoardToSettle();
      if (hxTutorialModalOpen || hxState.gameOver) break;

      const item = hxPendingTutorialModals.shift();
      if (!item) break;

      if (item.kind === 'intro') {
        const target = hxState.tiles.includes(item.tile) ? item.tile : findTileByType(item.tileType);
        hxQueuedTileIntros.delete(item.tileType);
        if (!target || hxIntroducedTileTypes.has(item.tileType)) continue;
        await showTutorialModal(item, target);
        hxIntroducedTileTypes.add(item.tileType);
        saveHexacoreTutorialState();
      } else {
        const target = item.tileType ? findTileByType(item.tileType) : null;
        await showTutorialModal(item, target);
      }
    }
  } finally {
    hxTutorialQueueRunning = false;
  }
}

/* ── Progress persistence ──────────────────────────────────────── */
function saveHexacoreProgress() {
  if (hxGameMode === 'daily') return;
  const tiles = [];
  hxTileMap.forEach(tile => {
    tiles.push({
      q: tile.q, r: tile.r, s: tile.s,
      letter: tile.letter, point: tile.point, tileType: tile.tileType,
    });
  });

  const save = {
    score:               hxState.score,
    level:               hxState.level,
    words:               hxState.words,
    wordsSubmitted:      hxState.wordsSubmitted,
    wordCount:           hxWordCount,
    tiles,
    portalOpen:          hxState.portalOpen,
    portalUsed:          hxState.portalUsed,
    portalEntry:         hxState.portalEntry,
    portalExit:          hxState.portalExit,
    portalWordsRemaining: hxState.portalWordsRemaining,
    amethystCount:       hxState.amethystCount,
    seleniteCount:       hxState.seleniteCount,
    oracleCount:         hxState.oracleCount,
    beaconCount:         hxState.beaconCount,
    eclipseCount:        hxState.eclipseCount,
    lodestoneCount:      hxState.lodestoneCount,
    lexiconCount:        hxState.lexiconCount,
    achievementLettersCollected: [...hxAchievementLettersCollected],
    eclipseActive:       hxState.eclipseActive,
    lodestoneActive:     hxState.lodestoneActive,
    achievements:        { ...hxState.achievements },
  };

  try { localStorage.setItem(HX_SAVE_KEY, JSON.stringify(save)); } catch (_) { /* quota / private */ }
}

function loadHexacoreProgress() {
  if (hxGameMode === 'daily') return null;
  try {
    const json = localStorage.getItem(HX_SAVE_KEY);
    if (!json) return null;
    return JSON.parse(json);
  } catch (_) { return null; }
}

function clearHexacoreSave() {
  try { localStorage.removeItem(HX_SAVE_KEY); } catch (_) { /* ignore */ }
}

/* ── Public entry point ────────────────────────────────────────── */
export function startHexacore(mode) {
  if (!HX_VALID_MODES.includes(mode)) {
    console.error(`startHexacore: invalid mode "${mode}"`);
    return;
  }
  hxGameMode = mode;

  // Load persisted requirements (persist across sessions and new games)
  hxCompletedReqs = new Set(loadHexacoreRequirements());
  hxIntroducedTileTypes = new Set(loadHexacoreTutorialState());
  hxQueuedTileIntros = new Set();
  hxPendingTutorialModals = [];
  hxTutorialQueueRunning = false;
  hxTutorialModalOpen = false;
  hxAchievementLettersCollected = new Set();

  // Initialise quest system
  initQuests();

  // Reset state
  Object.assign(hxState, {
    score:           0,
    level:           1,
    words:           [],
    tiles:           [],
    emberTiles:      [],
    prismTiles:      [],
    runeTiles:       [],
    digraphTiles:    [],
    gemEmeraldTiles:   [],
    gemGoldTiles:      [],
    gemSapphireTiles:  [],
    gemPearlTiles:     [],
    gemTanzaniteTiles: [],
    gemRubyTiles:      [],
    gemDiamondTiles:      [],
    gemAquamarineTiles:   [],
    gemTopazTiles:        [],
    gemOpalTiles:         [],
    gemImperialJadeTiles: [],
    gemAlexandriteTiles:  [],
    amethystTiles:   [],
    seleniteTiles:   [],
    oracleTiles:     [],
    beaconTiles:     [],
    eclipseTiles:    [],
    lodestoneTiles:  [],
    lexiconTiles:    [],
    amethystCount:   0,
    seleniteCount:   0,
    oracleCount:     0,
    beaconCount:     0,
    eclipseCount:    0,
    lodestoneCount:  0,
    lexiconCount:    0,
    eclipseActive:   false,
    lodestoneActive: false,
    achievements: {
      portalWordsUsed:    0,
      oracleAwarded:      false,
      beaconAwarded:      false,
      eclipseAwarded:     false,
      lodestoneAwarded:   false,
      lexiconAwarded:     false,
    },
    gameOver:        false,
    active:          false, // set to true after intro animation completes
    // Portal system reset
    wordsSubmitted: 0,
    portalOpen:     false,
    portalUsed:     false,
    portalEntry:    null,
    portalExit:     null,
    portalWordsRemaining: 0,
    dailyBoardDate: null,
    dailyMetadata: null,
    dailyStartMs: 0,
    dailySubmitted: false,
    dailyFinalScore: 0,
    dailyPenalty: 0,
    dailyTilesUsed: 0,
  });
  hxSelected           = [];
  hxPointerDown        = false;
  hxWordCount          = 0;
  hxNextPrismSpawn     = Math.floor(Math.random() * 3) + 4;
  hxTileMap            = new Map();
  _hxTileTypeRegistry.clear();
  pendingDigraphComplements = new Map();
  hxUpdateViewForBoard = null;
  hxAmethystTargeting  = false;
  hxSeleniteTargeting  = false;
  hxSeleniteFirstTile  = null;

  // Clean up previous pointer listeners
  if (hxPointerCleanup) { hxPointerCleanup(); hxPointerCleanup = null; }

  // Remove any leftover overlay
  document.getElementById('hx-gameover-overlay')?.remove();

  hxSvg = document.getElementById('hex-grid');
  if (!hxSvg) return;

  // Wipe the SVG
  hxSvg.innerHTML = '';
  hxLayout = makeLayout();

  injectSvgDefs(hxSvg);

  const initBoard = async () => {
    let boardData = null;
    if (hxGameMode === 'daily') {
      try {
        boardData = await loadDailyChallengeBoard(hxEasternDateStr());
        hxState.dailyBoardDate = boardData?.date || hxEasternDateStr();
        hxState.dailyMetadata = boardData?.metadata || null;
      } catch (err) {
        console.warn('[hexacore] daily board load failed, falling back to procedural board:', err);
      }
      hxState.dailyStartMs = Date.now();
    }

    buildGrid(() => {
    // Restore a saved session (if any) after the intro animation completes
    const save = loadHexacoreProgress();
    if (save) {
      hxState.score          = save.score          ?? 0;
      hxState.level          = save.level          ?? 1;
      hxState.words          = save.words          ?? [];
      hxState.wordsSubmitted = save.wordsSubmitted ?? 0;
      hxWordCount            = save.wordCount      ?? 0;

      // Rebuild tile board from saved tile list
      // Map of tileType → corresponding hxState array (covers all special tile types)
      const tileTypeArrays = {
        ember:        hxState.emberTiles,
        prism:        hxState.prismTiles,
        rune:         hxState.runeTiles,
        digraph:      hxState.digraphTiles,
        gemEmerald:   hxState.gemEmeraldTiles,
        gemGold:      hxState.gemGoldTiles,
        gemSapphire:  hxState.gemSapphireTiles,
        gemPearl:     hxState.gemPearlTiles,
        gemTanzanite: hxState.gemTanzaniteTiles,
        gemRuby:         hxState.gemRubyTiles,
        gemDiamond:      hxState.gemDiamondTiles,
        gemAquamarine:   hxState.gemAquamarineTiles,
        gemTopaz:        hxState.gemTopazTiles,
        gemOpal:         hxState.gemOpalTiles,
        gemImperialJade: hxState.gemImperialJadeTiles,
        gemAlexandrite:  hxState.gemAlexandriteTiles,
        amethyst:     hxState.amethystTiles,
        selenite:     hxState.seleniteTiles,
        oracle:       hxState.oracleTiles,
        beacon:       hxState.beaconTiles,
        eclipse:      hxState.eclipseTiles,
        lodestone:    hxState.lodestoneTiles,
        lexicon:      hxState.lexiconTiles,
      };

      (save.tiles ?? []).forEach(saved => {
        const tile = hxTileMap.get(hxKey(saved.q, saved.r));
        if (!tile) return;

        // Remove from all type arrays before re-assigning
        Object.values(tileTypeArrays).forEach(arr => removeFrom(arr, tile));

        tile.letter   = saved.letter;
        tile.point    = saved.point;
        tile.tileType = saved.tileType;

        // Add to the appropriate type array AND register in the O(1) registry
        const typeArr = tileTypeArrays[saved.tileType];
        if (typeArr) _hxRegisterTile(tile, typeArr);

        // Sync SVG letter/point text for all tile types
        // (applyTileType only handles special types; normal tiles need explicit sync)
        tile.updateLetter(saved.letter, saved.point);

        applyTileType(tile);
      });

      // Restore portal state
      hxState.portalOpen           = save.portalOpen           ?? false;
      hxState.portalUsed           = save.portalUsed           ?? false;
      hxState.portalEntry          = save.portalEntry          ?? null;
      hxState.portalExit           = save.portalExit           ?? null;
      hxState.portalWordsRemaining = save.portalWordsRemaining ?? 0;
      if (hxState.portalOpen) applyPortalVisuals();

      // Restore power-up counts
      hxState.amethystCount   = save.amethystCount   ?? 0;
      hxState.seleniteCount   = save.seleniteCount   ?? 0;
      hxState.oracleCount     = save.oracleCount     ?? 0;
      hxState.beaconCount     = save.beaconCount     ?? 0;
      hxState.eclipseCount    = save.eclipseCount    ?? 0;
      hxState.lodestoneCount  = save.lodestoneCount  ?? 0;
      hxState.lexiconCount    = save.lexiconCount    ?? 0;
      hxState.eclipseActive   = save.eclipseActive   ?? false;
      hxState.lodestoneActive = save.lodestoneActive ?? false;
      hxAchievementLettersCollected = new Set(
        Array.isArray(save.achievementLettersCollected) ? save.achievementLettersCollected : [],
      );
      if (save.achievements) {
        Object.assign(hxState.achievements, save.achievements);
      }

      // Sync HUD to restored values
      updateHud();
      updateLevelHud();
      updateScoreDisplay();
      updatePowerUpBar();

      showRestoredBanner(hxState.level, hxState.score);
    }
    queueBoardTileIntroductions();
    void maybeRunTutorialModalQueue();
    updateDailyHud();
  }, boardData);
  };
  void initBoard();
  // Ember tiles do NOT spawn at game start — only after milestone words

  // Save the user's current theme and force dark theme for Hexacore
  _hxSavedTheme = document.body.getAttribute('data-theme') || 'light';
  document.body.setAttribute('data-theme', 'dark');
  localStorage.setItem('theme', 'dark');

  document.body.classList.add('hx-active');

  // Clear the shared word display so no stale main-board letters show
  const currentWordEl = document.getElementById('current-word');
  if (currentWordEl) currentWordEl.textContent = '';

  // Change title to reflect Hexacore mode
  setHexacoreTitle();

  ensureHud();
  updateHud();
  updateLevelHud();
  updateScoreDisplay();
  updatePowerUpBar();

  setupPointerEvents();
  playSound('sfxUnlock');
  window.addEventListener('beforeunload', saveHexacoreProgress);
  window.addEventListener('pagehide',     saveHexacoreProgress);
}

export function getHexacoreScore() {
  return hxState.score;
}

export function stopHexacore() {
  // Persist the current board before any state is torn down so that returning
  // players face the same board they left — prevents the leave-to-reset exploit.
  if (!hxState.gameOver) saveHexacoreProgress();

  hxState.gameOver = true;
  hxState.active   = false;

  window.removeEventListener('beforeunload', saveHexacoreProgress);
  window.removeEventListener('pagehide',     saveHexacoreProgress);
  if (hxPointerCleanup) { hxPointerCleanup(); hxPointerCleanup = null; }

  cancelAmethystTargeting();
  cancelSeleniteTargeting();

  document.getElementById('hx-gameover-overlay')?.remove();
  document.getElementById('hx-challenges-modal')?.remove();
  document.getElementById('hx-tutorial-modal')?.remove();
  document.querySelector('.hx-tutorial-arrow-svg')?.remove();
  document.getElementById('hx-req-toast')?.remove();
  removeHud();
  const gridSvg = document.getElementById('hex-grid');
  if (gridSvg) gridSvg.innerHTML = '';
  hxSvg = null;
  hxTileMap = new Map();
  hxUpdateViewForBoard = null;

  document.body.classList.remove('hx-active');

  // Restore the user's original theme preference
  restoreUserTheme();

  restoreDefaultTitle();
}

/* ── Standalone Hexacore Leaderboard Modal (window.hxLbModal) ───── */
(function () {
  let modal = null;

  function buildModal() {
    modal = document.createElement('div');
    modal.id = 'hx-lb-standalone-modal';
    modal.style.cssText = `
      position:fixed;inset:0;z-index:9998;display:flex;align-items:center;
      justify-content:center;background:rgba(0,0,0,0.75);
    `;
    modal.innerHTML = `
      <div id="hx-lb-standalone-box" style="
        position:relative;min-width:280px;max-width:400px;width:90%;max-height:80vh;
        overflow-y:auto;padding:1.75rem 1.5rem 1.5rem;border-radius:14px;
        background:linear-gradient(135deg,rgba(10,10,25,0.97),rgba(20,5,35,0.97));
        border:2px solid rgba(76,201,240,0.6);
        box-shadow:0 0 30px rgba(76,201,240,0.4),0 12px 30px rgba(0,0,0,0.7);
        color:#f1f5f9;font-family:'Black Han Sans',sans-serif;font-size:clamp(0.75rem,1.4vw,1rem);
        font-weight:400;letter-spacing:0.15em;text-transform:uppercase;text-align:center;
      ">
        <button id="hx-lb-standalone-close" style="
          position:absolute;top:0.6rem;right:0.75rem;background:none;border:none;
          color:#94a3b8;font-size:1.2rem;cursor:pointer;line-height:1;
        " aria-label="Close">✕</button>
        <p style="margin:0 0 0.25rem;font-size:1rem;letter-spacing:0.08em;color:#4cc9f0;">
          🏆 HEXACORE LEADERBOARD
        </p>
        <div id="hx-lb-standalone-area" style="margin-top:0.75rem;font-size:0.85rem;">Loading…</div>
        <p style="margin:0.75rem 0 0;font-size:0.6rem;opacity:0.4;letter-spacing:0.05em;">
          CLICK OUTSIDE OR ✕ TO CLOSE
        </p>
      </div>
    `;
    document.body.appendChild(modal);

    document.getElementById('hx-lb-standalone-close').addEventListener('click', close);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) close();
    });
  }

  // Register Escape handler once, not inside buildModal
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal && modal.style.display !== 'none') close();
  });

  async function open() {
    if (!modal) buildModal();
    modal.style.display = 'flex';
    document.getElementById('hx-lb-standalone-area').textContent = 'Loading…';

    const result = await fetchLeaderboard(HX_LEADERBOARD_ID, 'hexacore');
    const area = document.getElementById('hx-lb-standalone-area');
    if (!area) return;

    if (!result.configured || result.entries.length === 0) {
      area.textContent = 'No leaderboard entries yet.';
      return;
    }

    const currentPlayer = getPlayerName();
    const entries = result.entries.slice(0, 20);
    let playerRank = -1;

    const rows = entries.map((e, i) => {
      const isCurrentPlayer = currentPlayer && e.player_name === currentPlayer;
      if (isCurrentPlayer) playerRank = i + 1;
      const rowStyle = isCurrentPlayer ? 'color:#f59e0b;font-weight:bold' : '';
      return `
        <tr class="hx-lb-row" style="${rowStyle}">
          <td style="padding:0.35rem 0.5rem;opacity:0.5;width:2rem">${i + 1}</td>
          <td class="hx-lb-player-name" style="padding:0.35rem 0.5rem">${escapeHtml(e.player_name || 'Anonymous')}</td>
          <td style="padding:0.35rem 0.5rem;color:${isCurrentPlayer ? '#f59e0b' : '#4cc9f0'};font-weight:700;text-align:right">${e.score.toLocaleString()}</td>
        </tr>`;
    }).join('');

    const rankMsg = currentPlayer
      ? (playerRank > 0
          ? `<div style="margin-top:0.5rem;font-size:0.78rem;color:#f59e0b;font-weight:bold">You are ranked #${playerRank} all-time</div>`
          : `<div style="margin-top:0.5rem;font-size:0.78rem;color:#94a3b8">Keep playing to reach the top 20!</div>`)
      : '';

    area.innerHTML = `
      <table style="width:100%;border-collapse:collapse;margin-top:0.4rem">
        <thead>
          <tr style="opacity:0.5;text-transform:uppercase;border-bottom:1px solid rgba(255,255,255,0.14)">
            <th style="padding:0.35rem 0.5rem;text-align:left;font-weight:normal">#</th>
            <th style="padding:0.35rem 0.5rem;text-align:left;font-weight:normal">Player</th>
            <th style="padding:0.35rem 0.5rem;text-align:right;font-weight:normal">Score</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>${rankMsg}`;
  }

  function close() {
    if (modal) modal.style.display = 'none';
  }

  window.hxLbModal = { open, close };
})();

/* ── Splash screen wiring (on module load) ─────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('splash-hexacore-play-btn')?.addEventListener('click', () => {
    document.getElementById('splash-hexacore-btn')?.click();
  });

  document.getElementById('splash-hexacore-btn')?.addEventListener('click', async () => {
    document.getElementById('splash-screen')?.classList.add('hidden');

    // Require sign-up before playing
    if (!getPlayerName()) {
      await promptPlayerName();
      const saved = getPlayerName();
      const nameBtn = document.getElementById('set-name-btn');
      if (nameBtn) {
        const label = nameBtn.querySelector('.setting-label');
        if (label) label.textContent = saved ? saved.toUpperCase() : 'SET NAME';
      }
      const splashSignupBtn = document.getElementById('splash-signup-btn');
      if (splashSignupBtn) {
        if (saved) {
          splashSignupBtn.disabled = true;
          splashSignupBtn.textContent = `✓ SIGNED IN AS ${saved.toUpperCase()}`;
        }
      }
    }

    openModeSelectModal(
      mode => startHexacoreMode(mode),
      () => document.getElementById('splash-screen')?.classList.remove('hidden'),
    );
  });

  // Expose helpers for campaign overlay buttons
  window._hxStartCampaignLevel = (levelId) => {
    startCampaignLevel(levelId, null);
    startHexacore('campaign');
  };
  window._hxOpenCampaignModal = () => {
    openCampaignModal(levelId => {
      startCampaignLevel(levelId, null);
      startHexacore('campaign');
    });
  };
  // Allow quest system to add XP via claim
  window._hxAddXP = (amount) => {
    const xpAmount = Number(amount);
    if (!Number.isFinite(xpAmount) || xpAmount <= 0) return null;
    const result = addXP(xpAmount);
    updateXPBarFn();
    return result;
  };
});

function startHexacoreMode(mode) {
  if (mode === 'campaign') {
    openCampaignModal(levelId => {
      startCampaignLevel(levelId, null);
      startHexacore('campaign');
    });
  } else {
    startHexacore(mode);
  }
}

/* ── hx:start-mode custom event (dispatched by hexacoreSettings.js) */
document.addEventListener('hx:start-mode', e => {
  const mode = e.detail?.mode;
  if (mode == null) return;
  // If the player is already actively playing this mode (game not over), just
  // resume — don't regenerate the board (fixes daily board being reset via settings).
  if (mode === hxGameMode && hxState.active && !hxState.gameOver) return;
  startHexacoreMode(mode);
});

/* ── TODO: Hexacore events still missing a dedicated sound ─────────
 *
 * The following game events have no audio feedback yet. New audio
 * assets will need to be recorded or sourced and wired in.
 *
 * Event                          | Notes                                                        | Recommended length
 * -------------------------------|--------------------------------------------------------------|--------------------
 * Tile deselected / backtrack    | Player drags back to deselect last tile in chain             | ~0.05 s (very short tick/click)
 * Tile consumed / pop-out        | Each tile popping out during word consumption                | ~0.1 s per tile (light pop or burst; could stagger with --tile-idx)
 * Ember tile advancing           | Ember moves toward the bottom — danger cue                   | ~0.3 s (low rumble or crackle)
 * Ember tile spawning            | Ember has its own CSS spawn animation                        | ~0.4 s (fire whoosh)
 * Prism tile spawning            | Could be a distinct sparkle                                  | ~0.4 s (crystal chime)
 * Rune tile spawning             | Could be a distinct mystical hum                             | ~0.4 s (arcane hum)
 * Gravity cascade                | Tiles falling after words are consumed                       | ~0.2 s (soft cascade whoosh)
 * Refill tiles dropping in       | New tiles appearing per-column from above                    | ~0.15 s (light tile-drop thud)
 * Game over                      | triggerGameOver() / showGameOver() called                    | ~1.5–2 s (dramatic sting or thud)
 * Score milestone / high word    | Optional feedback for scoring above a threshold             | ~0.5 s (ascending chime)
 * Leaderboard score submitted    | handleSubmitScore() success path                             | ~0.5 s (fanfare or confirmation chime)
 * Intro animation completes      | End of animateGridIntro() when hxState.active = true         | ~0.3 s (soft ready ding)
 *
 * ───────────────────────────────────────────────────────────────── */
