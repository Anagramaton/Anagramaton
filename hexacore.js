// hexacore.js — Hexacore endless word game mode for Anagramaton

import {
  GRID_RADIUS,
  HEX_RADIUS,
  letterPoints,
  lengthMultipliers,
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

/* ── Gem tile type set (module-level for shared use) ───────────── */
const HX_GEM_TYPES = new Set([
  'gemEmerald', 'gemGold', 'gemSapphire',
  'gemPearl', 'gemTanzanite', 'gemRuby', 'gemDiamond',
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
  const pts = (letterPoints[dg[0]] || 1) + (letterPoints[dg[1]] || 1);
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
  amethystTiles:   [],
  seleniteTiles:   [],
  amethystCount:   0,
  seleniteCount:   0,
  gameOver:        false,
  active:          false,

  // Portal system
  wordsSubmitted: 0,      // total words successfully submitted this session
  portalOpen:     false,  // whether a portal pair is currently active
  portalUsed:     false,  // whether the portal was traversed (closed on next word)
  portalEntry:    null,   // { q, r, s } coordinate of the entry portal tile
  portalExit:     null,   // { q, r, s } coordinate of the exit portal tile
  portalWordsRemaining: 0, // words left before portal auto-closes (3 when opened)
};

let hxSelected          = [];   // tiles in current selection chain
let hxPointerDown       = false;
let hxLayout            = null;
let hxSvg               = null;
let hxWordCount         = 0;
let hxTileMap           = new Map(); // `q,r` → tile object
/** Keyed by `q,r` — letters preferred for that position due to an adjacent digraph placed earlier */
let pendingDigraphComplements = new Map();
let hxPointerCleanup    = null;
let hxUpdateViewForBoard = null;
let hxCompletedReqs     = new Set(); // IDs of completed requirements (persists across games)

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
  return HX_LETTER_POOL[Math.floor(Math.random() * HX_LETTER_POOL.length)];
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
  icon.setAttribute('fill', '#e040fb');
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
  hxState.portalWordsRemaining = 3;
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
function addTypeIcon(tile, glyph, fontSize, fill) {
  const cx = parseFloat(tile.textLetter.getAttribute('x'));
  const cy = parseFloat(tile.textLetter.getAttribute('y'));
  const icon = document.createElementNS(SVG_NS, 'text');
  icon.setAttribute('x', cx - HEX_RADIUS * 0.5);
  icon.setAttribute('y', cy - HEX_RADIUS * 0.45);
  icon.setAttribute('font-size', String(fontSize));
  icon.setAttribute('pointer-events', 'none');
  icon.setAttribute('class', 'hx-type-icon');
  if (fill) icon.setAttribute('fill', fill);
  icon.textContent = glyph;
  tile.element.appendChild(icon);
}

function applyTileType(tile) {
  const poly = tile.element.querySelector('polygon');
  poly.classList.remove(
    'hx-ember', 'hx-prism', 'hx-rune', 'hx-digraph',
    'hx-gem-emerald', 'hx-gem-gold', 'hx-gem-sapphire',
    'hx-gem-pearl', 'hx-gem-tanzanite', 'hx-gem-ruby', 'hx-gem-diamond',
    'hx-amethyst', 'hx-selenite',
  );
  tile.element.querySelector('.hx-type-icon')?.remove();
  // Reset letter font size (may have been reduced for digraph)
  tile.textLetter.setAttribute('font-size', '28');

  if (tile.tileType === 'digraph') {
    poly.classList.add('hx-digraph');
    tile.textLetter.textContent = tile.letter;
    tile.textPoint.textContent  = String(tile.point);
    tile.textLetter.setAttribute('font-size', '21');
    addTypeIcon(tile, '❋', 11, '#2dd4bf');
  } else if (tile.tileType === 'ember') {
    poly.classList.add('hx-ember');
    addTypeIcon(tile, '🔥', 14, null);
  } else if (tile.tileType === 'prism') {
    poly.classList.add('hx-prism');
    addTypeIcon(tile, '✦', 12, '#ffd700');
  } else if (tile.tileType === 'rune') {
    poly.classList.add('hx-rune');
    tile.textLetter.textContent = '?';
    tile.textPoint.textContent  = '?';
    addTypeIcon(tile, '✦', 12, '#ffffff');
  } else if (tile.tileType === 'gemEmerald') {
    poly.classList.add('hx-gem-emerald');
    addTypeIcon(tile, '◆', 12, '#22c55e');
  } else if (tile.tileType === 'gemGold') {
    poly.classList.add('hx-gem-gold');
    addTypeIcon(tile, '◆', 12, '#f59e0b');
  } else if (tile.tileType === 'gemSapphire') {
    poly.classList.add('hx-gem-sapphire');
    addTypeIcon(tile, '◆', 12, '#60a5fa');
  } else if (tile.tileType === 'gemPearl') {
    poly.classList.add('hx-gem-pearl');
    addTypeIcon(tile, '◆', 12, '#f5f0e8');
  } else if (tile.tileType === 'gemTanzanite') {
    poly.classList.add('hx-gem-tanzanite');
    addTypeIcon(tile, '◆', 12, '#7c3aed');
  } else if (tile.tileType === 'gemRuby') {
    poly.classList.add('hx-gem-ruby');
    addTypeIcon(tile, '◆', 12, '#ef4444');
  } else if (tile.tileType === 'gemDiamond') {
    poly.classList.add('hx-gem-diamond');
    addTypeIcon(tile, '◆', 12, '#e0f2fe');
  } else if (tile.tileType === 'amethyst') {
    poly.classList.add('hx-amethyst');
    addTypeIcon(tile, '◈', 13, '#e879f9');
  } else if (tile.tileType === 'selenite') {
    poly.classList.add('hx-selenite');
    addTypeIcon(tile, '⇌', 13, '#caf0f8');
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
    emberGrad.setAttribute('x1', '0%'); emberGrad.setAttribute('y1', '100%');
    emberGrad.setAttribute('x2', '0%'); emberGrad.setAttribute('y2', '0%');
    [
      ['0%',   '#1a0000'],  // deep black-red at base
      ['25%',  '#cc1100'],  // dark crimson
      ['55%',  '#ff4500'],  // vivid red-orange
      ['80%',  '#ff9900'],  // bright amber
      ['100%', '#ffee00'],  // blazing yellow tip
    ].forEach(([offset, color]) => {
      const s = document.createElementNS(SVG_NS, 'stop');
      s.setAttribute('offset', offset);
      s.setAttribute('stop-color', color);
      emberGrad.appendChild(s);
    });
    defs.appendChild(emberGrad);
  }
  ensureLinearGradient('hx-prism-gradient',    '#a855f7', '#06b6d4');
  ensureLinearGradient('hx-digraph-gradient',  '#0d9488', '#2dd4bf');
  ensureLinearGradient('hx-portal-gradient',   '#7b2ff7', '#e040fb');
  ensureLinearGradient('hx-gem-emerald-gradient',   '#16a34a', '#4ade80');
  ensureLinearGradient('hx-gem-gold-gradient',       '#d97706', '#fcd34d');
  ensureLinearGradient('hx-gem-sapphire-gradient',   '#1d4ed8', '#93c5fd');
  ensureLinearGradient('hx-gem-pearl-gradient',      '#d4c5a9', '#ffffff');
  ensureLinearGradient('hx-gem-tanzanite-gradient',  '#1e0a5e', '#7c3aed');
  ensureLinearGradient('hx-gem-ruby-gradient',       '#7f1d1d', '#ef4444');
  ensureLinearGradient('hx-gem-diamond-gradient',    '#a5f3fc', '#ffffff');

  // Amethyst — deep purple to violet gradient
  if (!document.getElementById('hx-amethyst-gradient')) {
    const amethystGrad = document.createElementNS(SVG_NS, 'linearGradient');
    amethystGrad.setAttribute('id', 'hx-amethyst-gradient');
    amethystGrad.setAttribute('x1', '0%'); amethystGrad.setAttribute('y1', '100%');
    amethystGrad.setAttribute('x2', '100%'); amethystGrad.setAttribute('y2', '0%');
    [
      ['0%',   '#4c0070'],
      ['50%',  '#a855f7'],
      ['100%', '#e879f9'],
    ].forEach(([offset, color]) => {
      const s = document.createElementNS(SVG_NS, 'stop');
      s.setAttribute('offset', offset);
      s.setAttribute('stop-color', color);
      amethystGrad.appendChild(s);
    });
    defs.appendChild(amethystGrad);
  }

  // Selenite — dark navy to brilliant white-blue moonstone gradient
  if (!document.getElementById('hx-selenite-gradient')) {
    const seleniteGrad = document.createElementNS(SVG_NS, 'linearGradient');
    seleniteGrad.setAttribute('id', 'hx-selenite-gradient');
    seleniteGrad.setAttribute('x1', '0%'); seleniteGrad.setAttribute('y1', '100%');
    seleniteGrad.setAttribute('x2', '0%'); seleniteGrad.setAttribute('y2', '0%');
    [
      ['0%',   '#0a0a1a'],
      ['25%',  '#1a3a6e'],
      ['60%',  '#8ecae6'],
      ['85%',  '#caf0f8'],
      ['100%', '#ffffff'],
    ].forEach(([offset, color]) => {
      const s = document.createElementNS(SVG_NS, 'stop');
      s.setAttribute('offset', offset);
      s.setAttribute('stop-color', color);
      seleniteGrad.appendChild(s);
    });
    defs.appendChild(seleniteGrad);
  }
}

/* ── Grid construction ─────────────────────────────────────────── */
function buildGrid(onReady) {
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

  // Pre-designate vowel slots (density-based, ring-aware):
  //   • Ring 0 (centre): always a vowel
  //   • Ring 1: 2 of 6 tiles are vowels
  //   • Rings 2–4: random fill until VOWEL_DENSITY reached
  const vowelTargets = new Set();
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

  // Reset complement hints for fresh board
  pendingDigraphComplements = new Map();

  // ── Phase 2: place tiles ring-by-ring (0 → 4) ───────────────────
  // Processing ring by ring ensures each tile sees already-placed neighbors.

  const spiralCoords = [...byRing[0], ...byRing[1], ...byRing[2], ...byRing[3], ...byRing[4]];

  for (const { q, r } of spiralCoords) {
    const key = hxKey(q, r);
    const s   = -q - r;
    const isVowelSlot = vowelTargets.has(key);

    let result;
    if (isVowelSlot) {
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
      pointValue: result.isDigraph ? result.points  : (letterPoints[result.letter] || 1),
    });

    if (result.isDigraph) {
      tile.tileType = 'digraph';
      tile.point    = result.points;
      hxState.digraphTiles.push(tile);
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
  if (el) el.textContent = String(hxState.score);
}

function updateHud() {
  const hud = document.getElementById('hx-score-hud');
  if (hud) hud.textContent = `${hxState.score} PTS`;
}

/* ── Animate the HUD score counting up from oldScore → newScore ── */
let _scoreRafId = 0; // cancel any in-flight count-up before starting a new one
function animateScoreHud(oldScore, newScore) {
  const hud = document.getElementById('hx-score-hud');
  if (!hud) return;

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
    hud.textContent = `${current} PTS`;
    if (progress < 1) { _scoreRafId = requestAnimationFrame(frame); }
    else { _scoreRafId = 0; }
  }
  _scoreRafId = requestAnimationFrame(frame);
}

function updateLevelHud() {
  const el = document.getElementById('hx-level-hud');
  if (!el) return;
  el.textContent = `LVL ${hxState.level}`;
  el.title = 'View Challenges';
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
    <div class="hx-levelup-ring"></div>
    <div class="hx-levelup-backdrop">
      <span class="hx-levelup-title">LEVEL UP!</span>
      <span class="hx-levelup-num">${level}</span>
      <span class="hx-levelup-sub">${getLevelUpMessage(level)}</span>
    </div>
  `;
  document.body.appendChild(banner);

  // Auto-remove after animation completes (~3s)
  banner.addEventListener('animationend', () => banner.remove(), { once: true });
  setTimeout(() => banner.remove(), 3200);
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

function ensureHud() {
  if (document.getElementById('hx-score-hud')) return;
  const hud = document.createElement('div');
  hud.id = 'hx-score-hud';
  hud.textContent = '0 PTS';
  document.body.appendChild(hud);

  const liveWordEl = document.createElement('div');
  liveWordEl.id = 'hx-live-word';
  document.body.appendChild(liveWordEl);

  const wordHud = document.createElement('div');
  wordHud.id = 'hx-word-score-hud';
  document.body.appendChild(wordHud);

  const levelHud = document.createElement('div');
  levelHud.id = 'hx-level-hud';
  levelHud.textContent = 'LVL 1';
  levelHud.title = 'View Challenges';
  levelHud.setAttribute('role', 'button');
  levelHud.setAttribute('tabindex', '0');
  levelHud.addEventListener('click', openChallengesModal);
  levelHud.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openChallengesModal(); }
  });
  document.body.appendChild(levelHud);

  const powerUpBarLeft = document.createElement('div');
  powerUpBarLeft.id = 'hx-powerup-bar-left';
  document.body.appendChild(powerUpBarLeft);

  const powerUpBarRight = document.createElement('div');
  powerUpBarRight.id = 'hx-powerup-bar-right';
  document.body.appendChild(powerUpBarRight);
}

function removeHud() {
  document.getElementById('hx-score-hud')?.remove();
  document.getElementById('hx-word-score-hud')?.remove();
  document.getElementById('hx-live-word')?.remove();
  document.getElementById('hx-level-hud')?.remove();
  document.getElementById('hx-powerup-bar-left')?.remove();
  document.getElementById('hx-powerup-bar-right')?.remove();
  document.getElementById('hx-powerup-toast')?.remove();
  document.getElementById('hx-powerup-indicator')?.remove();
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
    // Refresh modal if it's open
    if (document.getElementById('hx-challenges-modal')) {
      renderChallengesModal();
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

  // Close on button or backdrop click
  document.getElementById('hx-challenges-close')
    ?.addEventListener('click', () => modal.remove());
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
}

function renderChallengesModal() {
  const body = document.getElementById('hx-challenges-body');
  if (!body) return;

  const completed = hxCompletedReqs.size;
  const total     = HX_LEVEL_REQUIREMENTS.length;

  // Update progress in header
  const progress = document.querySelector('#hx-challenges-header .hx-challenges-progress');
  if (progress) progress.textContent = `${completed} / ${total} COMPLETE`;

  // Group requirements by section
  const sections = new Map();
  for (const req of HX_LEVEL_REQUIREMENTS) {
    if (!sections.has(req.section)) sections.set(req.section, []);
    sections.get(req.section).push(req);
  }

  body.innerHTML = '';
  for (const [sectionName, reqs] of sections) {
    const section = document.createElement('div');
    section.className = 'hx-challenges-section';

    const sectionTitle = document.createElement('div');
    sectionTitle.className = 'hx-challenges-section-title';
    const doneCount = reqs.filter(r => hxCompletedReqs.has(r.id)).length;
    sectionTitle.innerHTML = `${sectionName.toUpperCase()} <span class="hx-challenges-section-count">${doneCount}/${reqs.length}</span>`;
    section.appendChild(sectionTitle);

    for (const req of reqs) {
      const isDone = hxCompletedReqs.has(req.id);
      const row = document.createElement('div');
      row.className = 'hx-challenge-row' + (isDone ? ' hx-challenge-done' : '');
      row.innerHTML = `<span class="hx-challenge-check">${isDone ? '✓' : '☐'}</span><span class="hx-challenge-desc">${escapeHtml(req.description)}</span>`;
      section.appendChild(row);
    }

    body.appendChild(section);
  }
}

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
  gemEmerald:   2,
  gemGold:      3,
  gemSapphire:  4,
  gemPearl:     5,
  gemTanzanite: 6,
  gemRuby:      7,
};
// Tanzanite, Ruby, and Diamond use exponential count bonus (value^count);
// all other gems use linear count bonus (count × value).
const OPTION_B_GEMS = new Set(['gemTanzanite', 'gemRuby', 'gemDiamond']);

/* ── Level requirements checklist ─────────────────────────────── */
/**
 * Each entry: { id, section, wordLength, description, check(word, tiles, state, score) }
 * `word`  — the fully resolved word string (length === assembled letter count)
 * `tiles` — the array of tile objects that were selected
 * `state` — hxState (portal info, board gem/digraph arrays, etc.)
 * `score` — the final wordScore for this submission
 */
const HX_LEVEL_REQUIREMENTS = [
  // ── 5 Letters ────────────────────────────────────────────────
  {
    id: '5L_gem1', section: '5 Letters', wordLength: 5,
    description: 'INCLUDES AT LEAST 1 GEM TILE',
    check(word, tiles) {
      return word.length === 5 && tiles.some(t => HX_GEM_TYPES.has(t.tileType));
    },
  },
  {
    id: '5L_plain', section: '5 Letters', wordLength: 5,
    description: 'NO GEM TILES AND NO DIGRAPH TILES',
    check(word, tiles) {
      return word.length === 5 &&
        !tiles.some(t => HX_GEM_TYPES.has(t.tileType) || t.tileType === 'digraph');
    },
  },
  {
    id: '5L_ember1', section: '5 Letters', wordLength: 5,
    description: 'INCLUDES 1 FIRE (EMBER) TILE',
    check(word, tiles) {
      return word.length === 5 && tiles.some(t => t.tileType === 'ember');
    },
  },
  {
    id: '5L_score500', section: '5 Letters', wordLength: 5,
    description: 'WORTH AT LEAST 500 POINTS',
    check(word, tiles, state, score) {
      return word.length === 5 && score >= 500;
    },
  },

  // ── 6 Letters ────────────────────────────────────────────────
  {
    id: '6L_gem2', section: '6 Letters', wordLength: 6,
    description: 'INCLUDES AT LEAST 2 GEM TILES',
    check(word, tiles) {
      return word.length === 6 && tiles.filter(t => HX_GEM_TYPES.has(t.tileType)).length >= 2;
    },
  },
  {
    id: '6L_digraph1', section: '6 Letters', wordLength: 6,
    description: 'INCLUDES 1 DIGRAPH TILE',
    check(word, tiles) {
      return word.length === 6 && tiles.some(t => t.tileType === 'digraph');
    },
  },
  {
    id: '6L_plain', section: '6 Letters', wordLength: 6,
    description: 'NO GEM TILES AND NO DIGRAPH TILES',
    check(word, tiles) {
      return word.length === 6 &&
        !tiles.some(t => HX_GEM_TYPES.has(t.tileType) || t.tileType === 'digraph');
    },
  },
  {
    id: '6L_score1500', section: '6 Letters', wordLength: 6,
    description: 'WORTH AT LEAST 1,500 POINTS',
    check(word, tiles, state, score) {
      return word.length === 6 && score >= 1500;
    },
  },

  // ── 7 Letters ────────────────────────────────────────────────
  {
    id: '7L_gem3', section: '7 Letters', wordLength: 7,
    description: 'INCLUDES AT LEAST 3 GEM TILES',
    check(word, tiles) {
      return word.length === 7 && tiles.filter(t => HX_GEM_TYPES.has(t.tileType)).length >= 3;
    },
  },
  {
    id: '7L_ember1_digraph2', section: '7 Letters', wordLength: 7,
    description: 'INCLUDES 1 FIRE TILE AND 2 DIGRAPH TILES',
    check(word, tiles) {
      return word.length === 7 &&
        tiles.some(t => t.tileType === 'ember') &&
        tiles.filter(t => t.tileType === 'digraph').length >= 2;
    },
  },
  {
    id: '7L_allGems', section: '7 Letters', wordLength: 7,
    description: 'USES ALL GEM TILES ON THE BOARD',
    check(word, tiles, state) {
      if (word.length !== 7) return false;
      const boardGems = [
        ...state.gemEmeraldTiles, ...state.gemGoldTiles, ...state.gemSapphireTiles,
        ...state.gemPearlTiles,   ...state.gemTanzaniteTiles, ...state.gemRubyTiles,
        ...state.gemDiamondTiles,
      ];
      if (boardGems.length === 0) return false;
      const selKeys = new Set(tiles.map(t => hxKey(t.q, t.r)));
      return boardGems.every(g => selKeys.has(hxKey(g.q, g.r)));
    },
  },
  {
    id: '7L_score10k', section: '7 Letters', wordLength: 7,
    description: 'WORTH AT LEAST 10,000 POINTS',
    check(word, tiles, state, score) {
      return word.length === 7 && score >= 10000;
    },
  },
  {
    id: '7L_3gemTypes', section: '7 Letters', wordLength: 7,
    description: 'USES 3 DIFFERENT GEM TILE TYPES',
    check(word, tiles) {
      return word.length === 7 &&
        new Set(tiles.filter(t => HX_GEM_TYPES.has(t.tileType)).map(t => t.tileType)).size >= 3;
    },
  },

  // ── 8 Letters ────────────────────────────────────────────────
  {
    id: '8L_plain', section: '8 Letters', wordLength: 8,
    description: 'NO GEM TILES AND NO DIGRAPH TILES',
    check(word, tiles) {
      return word.length === 8 &&
        !tiles.some(t => HX_GEM_TYPES.has(t.tileType) || t.tileType === 'digraph');
    },
  },
  {
    id: '8L_allDigraphs', section: '8 Letters', wordLength: 8,
    description: 'USES ALL DIGRAPH TILES ON THE BOARD',
    check(word, tiles, state) {
      if (word.length !== 8) return false;
      if (state.digraphTiles.length === 0) return false;
      const selKeys = new Set(tiles.map(t => hxKey(t.q, t.r)));
      return state.digraphTiles.every(d => selKeys.has(hxKey(d.q, d.r)));
    },
  },
  {
    id: '8L_ember1_gem2', section: '8 Letters', wordLength: 8,
    description: 'INCLUDES A FIRE TILE AND 2 GEM TILES',
    check(word, tiles) {
      return word.length === 8 &&
        tiles.some(t => t.tileType === 'ember') &&
        tiles.filter(t => HX_GEM_TYPES.has(t.tileType)).length >= 2;
    },
  },
  {
    id: '8L_ember2', section: '8 Letters', wordLength: 8,
    description: '2 FIRE TILES',
    check(word, tiles) {
      return word.length === 8 && tiles.filter(t => t.tileType === 'ember').length >= 2;
    },
  },
  {
    id: '8L_score25k', section: '8 Letters', wordLength: 8,
    description: 'WORTH AT LEAST 25,000 POINTS',
    check(word, tiles, state, score) {
      return word.length === 8 && score >= 25000;
    },
  },

  // ── 9 Letters ────────────────────────────────────────────────
  {
    id: '9L_diamond_portal', section: '9 Letters', wordLength: 9,
    description: 'USES A DIAMOND TILE AND THE PORTAL',
    check(word, tiles, state) {
      if (word.length !== 9) return false;
      if (!tiles.some(t => t.tileType === 'gemDiamond')) return false;
      if (!state.portalOpen || !state.portalEntry || !state.portalExit) return false;
      const selKeys = new Set(tiles.map(t => hxKey(t.q, t.r)));
      return selKeys.has(hxKey(state.portalEntry.q, state.portalEntry.r)) &&
             selKeys.has(hxKey(state.portalExit.q,  state.portalExit.r));
    },
  },
  {
    id: '9L_ember2', section: '9 Letters', wordLength: 9,
    description: '2 FIRE TILES',
    check(word, tiles) {
      return word.length === 9 && tiles.filter(t => t.tileType === 'ember').length >= 2;
    },
  },
  {
    id: '9L_3gemTypes', section: '9 Letters', wordLength: 9,
    description: 'USES 3 DIFFERENT GEM TILE TYPES',
    check(word, tiles) {
      return word.length === 9 &&
        new Set(tiles.filter(t => HX_GEM_TYPES.has(t.tileType)).map(t => t.tileType)).size >= 3;
    },
  },
  {
    id: '9L_score50k', section: '9 Letters', wordLength: 9,
    description: 'WORTH AT LEAST 50,000 POINTS',
    check(word, tiles, state, score) {
      return word.length === 9 && score >= 50000;
    },
  },
  {
    id: '9L_portal_ember1_gem2', section: '9 Letters', wordLength: 9,
    description: 'INCLUDES A PORTAL, A FIRE TILE, AND 2 GEM TILES',
    check(word, tiles, state) {
      if (word.length !== 9) return false;
      if (!state.portalOpen || !state.portalEntry || !state.portalExit) return false;
      const selKeys = new Set(tiles.map(t => hxKey(t.q, t.r)));
      return selKeys.has(hxKey(state.portalEntry.q, state.portalEntry.r)) &&
             selKeys.has(hxKey(state.portalExit.q,  state.portalExit.r)) &&
             tiles.some(t => t.tileType === 'ember') &&
             tiles.filter(t => HX_GEM_TYPES.has(t.tileType)).length >= 2;
    },
  },

  // ── 10 Letters ───────────────────────────────────────────────
  {
    id: '10L_diamond_portal', section: '10 Letters', wordLength: 10,
    description: 'USES A DIAMOND TILE AND THE PORTAL',
    check(word, tiles, state) {
      if (word.length !== 10) return false;
      if (!tiles.some(t => t.tileType === 'gemDiamond')) return false;
      if (!state.portalOpen || !state.portalEntry || !state.portalExit) return false;
      const selKeys = new Set(tiles.map(t => hxKey(t.q, t.r)));
      return selKeys.has(hxKey(state.portalEntry.q, state.portalEntry.r)) &&
             selKeys.has(hxKey(state.portalExit.q,  state.portalExit.r));
    },
  },
  {
    id: '10L_allDigraphs', section: '10 Letters', wordLength: 10,
    description: 'USES ALL DIGRAPH TILES ON THE BOARD',
    check(word, tiles, state) {
      if (word.length !== 10) return false;
      if (state.digraphTiles.length === 0) return false;
      const selKeys = new Set(tiles.map(t => hxKey(t.q, t.r)));
      return state.digraphTiles.every(d => selKeys.has(hxKey(d.q, d.r)));
    },
  },
  {
    id: '10L_score100k', section: '10 Letters', wordLength: 10,
    description: 'WORTH AT LEAST 100,000 POINTS',
    check(word, tiles, state, score) {
      return word.length === 10 && score >= 100000;
    },
  },
  {
    id: '10L_ember2_gem3', section: '10 Letters', wordLength: 10,
    description: '2 FIRE TILES AND AT LEAST 3 GEM TILES',
    check(word, tiles) {
      return word.length === 10 &&
        tiles.filter(t => t.tileType === 'ember').length >= 2 &&
        tiles.filter(t => HX_GEM_TYPES.has(t.tileType)).length >= 3;
    },
  },
  {
    id: '10L_5gemTypes', section: '10 Letters', wordLength: 10,
    description: 'USES 5 DIFFERENT GEM TILE TYPES',
    check(word, tiles) {
      return word.length === 10 &&
        new Set(tiles.filter(t => HX_GEM_TYPES.has(t.tileType)).map(t => t.tileType)).size >= 5;
    },
  },
];

/**
 * Calculates the count bonus multiplier for the given selected tiles.
 * For each gem type present, counts how many were used and applies:
 *   - Option A (linear):      count × gemValue  — for Emerald, Gold, Sapphire, Pearl
 *     e.g. 3 Emeralds → 3 × 2 = ×6
 *   - Option B (exponential): gemValue ^ count  — for Tanzanite, Ruby, Diamond
 *     e.g. 3 Rubies → 7³ = ×343; 2 Diamonds on a 6-letter word → 6² = ×36
 * Diamond's "value" is wordLength (not a fixed number), so it is excluded from
 * GEM_MULTIPLIERS above and handled as a special case inside this function.
 * @param {Array} selectedTiles - array of tile objects from hxSelected
 * @param {number} wordLength   - assembled letter count (used as Diamond's value)
 * @returns {number} combined count bonus multiplier (≥1)
 */
function calcGemCountBonus(selectedTiles, wordLength) {
  const gemCounts = {};
  selectedTiles.forEach(t => {
    if (GEM_MULTIPLIERS[t.tileType] || t.tileType === 'gemDiamond') {
      gemCounts[t.tileType] = (gemCounts[t.tileType] || 0) + 1;
    }
  });
  let countBonus = 1;
  for (const [gemType, count] of Object.entries(gemCounts)) {
    const value = gemType === 'gemDiamond' ? wordLength : GEM_MULTIPLIERS[gemType];
    countBonus *= OPTION_B_GEMS.has(gemType) ? value ** count : count * value;
  }
  return countBonus;
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
    if (l) { for (const ch of l) base += letterPoints[ch] || 1; }
    else base += 1;
  });
  const lenMult = lengthMultipliers[wordLength] || 1;

  const hasPrism = hxSelected.some(t => t.tileType === 'prism');
  let gemMult = 1;
  hxSelected.forEach(t => {
    if (GEM_MULTIPLIERS[t.tileType]) gemMult *= GEM_MULTIPLIERS[t.tileType];
    else if (t.tileType === 'gemDiamond') gemMult *= wordLength;
  });

  const countBonus = calcGemCountBonus(hxSelected, wordLength);

  const preview = base * lenMult * (hasPrism ? 2 : 1) * gemMult * countBonus;
  const runeNote = runeCount > 0 ? '~' : '';
  el.textContent = `${runeNote}+${preview}`;
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
      tile.textPoint.textContent  = letterPoints[letter] || 1;
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
function updatePowerUpBar() {
  const barLeft  = document.getElementById('hx-powerup-bar-left');
  const barRight = document.getElementById('hx-powerup-bar-right');
  if (!barLeft || !barRight) return;
  barLeft.innerHTML  = '';
  barRight.innerHTML = '';

  for (let i = 0; i < hxState.amethystCount; i++) {
    const btn = document.createElement('button');
    btn.className = 'hx-powerup-btn hx-powerup-btn--amethyst';
    btn.textContent = '🔮 AMETHYST';
    btn.title = 'Transmute: change any tile\'s letter';
    btn.addEventListener('click', () => activateAmethyst());
    barLeft.appendChild(btn);
  }

  for (let i = 0; i < hxState.seleniteCount; i++) {
    const btn = document.createElement('button');
    btn.className = 'hx-powerup-btn hx-powerup-btn--selenite';
    btn.textContent = '🌙 SELENITE';
    btn.title = 'Phase Swap: swap any two tiles';
    btn.addEventListener('click', () => activateSelenite());
    barRight.appendChild(btn);
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
  } else {
    toast.innerHTML = '<span class="hx-powerup-toast-title">✨ SELENITE COLLECTED</span><span class="hx-powerup-toast-desc">Tap to swap two tiles!</span>';
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
  } else {
    toast.innerHTML = '<span class="hx-powerup-toast-title">🌙 SELENITE USED</span>';
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
      tile.updateLetter(letter, letterPoints[letter] || 1);
      applyTileType(tile);
      // Remove from amethyst tiles list if it was an amethyst
      removeFrom(hxState.amethystTiles, tile);
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

  hxState.seleniteCount--;
  updatePowerUpBar();
  showPowerUpUsedToast('selenite');
  return true;
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
  resolved.forEach(l => { for (const ch of l) base += letterPoints[ch] || 1; });
  const lenMult = lengthMultipliers[word.length] || 1;

  // Gem multipliers stack multiplicatively
  let gemMult = 1;
  hxSelected.forEach(t => {
    if (GEM_MULTIPLIERS[t.tileType]) gemMult *= GEM_MULTIPLIERS[t.tileType];
    else if (t.tileType === 'gemDiamond') gemMult *= word.length;
  });

  const countBonus = calcGemCountBonus(hxSelected, word.length);

  const wordScore = base * lenMult * (hasPrism ? 2 : 1) * gemMult * countBonus;

  hxWordCount++;
  hxState.wordsSubmitted++;
  const oldScore = hxState.score;
  hxState.score += wordScore;
  hxState.words.push({ word, score: wordScore });

  updateScoreDisplay();
  animateScoreHud(oldScore, hxState.score);

  // Check requirements before the selection is cleared and portal state changes
  checkHexacoreRequirements(word, [...hxSelected], wordScore);

  const consumed = [...hxSelected];

  // Detect amethyst/selenite power-up collection (5+ letter word)
  if (assembledLength >= 5) {
    const hasAmethystTile  = consumed.some(t => t.tileType === 'amethyst');
    const hasSelenieTile   = consumed.some(t => t.tileType === 'selenite');
    if (hasAmethystTile) {
      hxState.amethystCount++;
      updatePowerUpBar();
      showPowerUpCollectToast('amethyst');
    }
    if (hasSelenieTile) {
      hxState.seleniteCount++;
      updatePowerUpBar();
      showPowerUpCollectToast('selenite');
    }
  }

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
  // Consume tiles → gravity → ember advance → refill → special spawns
  await consumeAndRefill(consumed);
  stopSound('sfxFunk');

  if (!hxState.gameOver) {
    checkLevelUp(oldScore, hxState.score);
    playSound('sfxGemCollect');
    // Spawn gem reward based on word length
    spawnGemRewardForWord(word.length);
    // Fire bonus mirrors word reward
    if (hasEmber) spawnGemRewardForWord(word.length);
    spawnSpecialTiles();

    // Portal milestone: open a new portal after every 10th word submitted
    if (hxState.wordsSubmitted > 0 && hxState.wordsSubmitted % 10 === 0) {
      closePortal(); // close any existing portal first
      openPortal();
    }

    saveHexacoreProgress();
  }
}

/* ── Consume tiles → gravity → ember → refill ─────────────────── */
async function consumeAndRefill(tilesToRemove) {
  // 1. Animate tiles out with a tile-by-tile stagger (first selected → last)
  tilesToRemove.forEach((tile, idx) => {
    tile.element.style.setProperty('--tile-idx', String(idx));
    const type = tile.tileType;
    if (type === 'ember' || type === 'prism' || type === 'rune' || type === 'amethyst' || type === 'selenite') {
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
    removeFrom(hxState.tiles,              tile);
    removeFrom(hxState.emberTiles,         tile);
    removeFrom(hxState.prismTiles,         tile);
    removeFrom(hxState.runeTiles,          tile);
    removeFrom(hxState.digraphTiles,       tile);
    removeFrom(hxState.gemEmeraldTiles,    tile);
    removeFrom(hxState.gemGoldTiles,       tile);
    removeFrom(hxState.gemSapphireTiles,   tile);
    removeFrom(hxState.gemPearlTiles,      tile);
    removeFrom(hxState.gemTanzaniteTiles,  tile);
    removeFrom(hxState.gemRubyTiles,       tile);
    removeFrom(hxState.gemDiamondTiles,    tile);
    removeFrom(hxState.amethystTiles,      tile);
    removeFrom(hxState.seleniteTiles,      tile);
    hxTileMap.delete(hxKey(tile.q, tile.r));
  });

  // 2. Gravity
  await applyGravity();
  if (hxState.gameOver) return;

  // 3. Advance ember tiles
  await advanceEmberTiles();
  if (hxState.gameOver) return;

  // 4. Refill empty columns
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
    // Process bottom rows first so lower tiles move before upper ones
    const sorted = [...hxState.tiles].sort((a, b) => b.r - a.r);
    const moves  = []; // { tile, fromQ, fromR, toQ, toR }

    for (const tile of sorted) {
      if (isPortalTile(tile)) continue; // portal tiles never fall
      const se = { q: tile.q,     r: tile.r + 1 };
      const sw = { q: tile.q - 1, r: tile.r + 1 };

      const seOk = inBounds(se) &&
        !hxTileMap.has(hxKey(se.q, se.r)) &&
        !moves.some(m => m.toQ === se.q && m.toR === se.r);
      const swOk = inBounds(sw) &&
        !hxTileMap.has(hxKey(sw.q, sw.r)) &&
        !moves.some(m => m.toQ === sw.q && m.toR === sw.r);

      if (seOk) {
        moves.push({ tile, fromQ: tile.q, fromR: tile.r, toQ: se.q, toR: se.r });
        anyMoved = true;
      } else if (swOk) {
        moves.push({ tile, fromQ: tile.q, fromR: tile.r, toQ: sw.q, toR: sw.r });
        anyMoved = true;
      }
    }

    if (moves.length === 0) break;

    // Stagger tiles so each falls individually in a ripple/cascade effect,
    // rather than all tiles in a gravity wave dropping in lock-step unison.
    await animateTileMovesStaggered(moves);
  }
}

/* ── Ember advancement: each ember moves to a random lower hex neighbour ── */
async function advanceEmberTiles() {
  if (hxState.gameOver) return;

  const embers     = [...hxState.emberTiles];
  const emberMoves = [];

  for (const tile of embers) {
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
      triggerGameOver();
      return;
    }

    const target = candidates[Math.floor(Math.random() * candidates.length)];

    // Displace any normal tile at the target before moving
    const displaced = hxTileMap.get(hxKey(target.q, target.r));
    if (displaced && displaced !== tile) {
      // If the displaced tile is a portal tile, close the portal first
      if (isPortalTile(displaced)) closePortal();
      displaced.element.remove();
      removeFrom(hxState.tiles,             displaced);
      removeFrom(hxState.emberTiles,        displaced);
      removeFrom(hxState.prismTiles,        displaced);
      removeFrom(hxState.runeTiles,         displaced);
      removeFrom(hxState.digraphTiles,      displaced);
      removeFrom(hxState.gemEmeraldTiles,   displaced);
      removeFrom(hxState.gemGoldTiles,      displaced);
      removeFrom(hxState.gemSapphireTiles,  displaced);
      removeFrom(hxState.gemPearlTiles,     displaced);
      removeFrom(hxState.gemTanzaniteTiles, displaced);
      removeFrom(hxState.gemRubyTiles,      displaced);
      removeFrom(hxState.gemDiamondTiles,   displaced);
      removeFrom(hxState.amethystTiles,     displaced);
      removeFrom(hxState.seleniteTiles,     displaced);
      hxTileMap.delete(hxKey(target.q, target.r));
    }

    emberMoves.push({ tile, fromQ: tile.q, fromR: tile.r, toQ: target.q, toR: target.r });
  }

  if (emberMoves.length > 0 && !hxState.gameOver) {
    await animateTileMoves(emberMoves);
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
        pointValue: result.isDigraph ? result.points : (letterPoints[result.letter] || 1),
      });
      if (result.isDigraph) {
        tile.tileType = 'digraph';
        tile.point    = result.points;
        hxState.digraphTiles.push(tile);
        applyTileType(tile);
      } else {
        tile.tileType = 'normal';
      }
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
  gemEmerald:   'gemEmeraldTiles',
  gemGold:      'gemGoldTiles',
  gemSapphire:  'gemSapphireTiles',
  gemPearl:     'gemPearlTiles',
  gemTanzanite: 'gemTanzaniteTiles',
  gemRuby:      'gemRubyTiles',
  gemDiamond:   'gemDiamondTiles',
};

/** The gem-type → spawn CSS class mapping. */
const GEM_SPAWN_CLASS = {
  gemEmerald:   'hx-gem-emerald-spawn',
  gemGold:      'hx-gem-gold-spawn',
  gemSapphire:  'hx-gem-sapphire-spawn',
  gemPearl:     'hx-gem-pearl-spawn',
  gemTanzanite: 'hx-gem-tanzanite-spawn',
  gemRuby:      'hx-gem-ruby-spawn',
  gemDiamond:   'hx-gem-diamond-spawn',
};

/**
 * Transforms an existing normal tile in-place into the given gem type.
 * Updates state, applies styling, and plays the spawn animation.
 */
function transformTileToGem(tile, gemType) {
  if (!tile || (tile.tileType !== 'normal' && tile.tileType !== 'digraph')) return;
  if (tile.tileType === 'digraph') removeFrom(hxState.digraphTiles, tile);
  tile.tileType = gemType;
  hxState[GEM_STATE_KEY[gemType]].push(tile);
  applyTileType(tile);
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
 *  5 letters: 2 emerald
 *  6 letters: 3 emerald, 1 gold
 *  7 letters: 3 emerald, 2 gold, 1 sapphire
 *  8 letters: 4 emerald, 3 gold, 2 sapphire, 1 pearl
 *  9 letters: 5 emerald, 4 gold, 3 sapphire, 2 pearl, 1 tanzanite
 * 10+ letters: 6 emerald, 5 gold, 4 sapphire, 3 pearl, 2 tanzanite, 1 ruby
 */
function spawnGemRewardForWord(wordLength) {
  const plan = [];
  if (wordLength >= 10) {
    plan.push(...Array(6).fill('gemEmerald'));
    plan.push(...Array(5).fill('gemGold'));
    plan.push(...Array(4).fill('gemSapphire'));
    plan.push(...Array(3).fill('gemPearl'));
    plan.push(...Array(2).fill('gemTanzanite'));
    plan.push('gemRuby');
  } else if (wordLength === 9) {
    plan.push(...Array(5).fill('gemEmerald'));
    plan.push(...Array(4).fill('gemGold'));
    plan.push(...Array(3).fill('gemSapphire'));
    plan.push(...Array(2).fill('gemPearl'));
    plan.push('gemTanzanite');
  } else if (wordLength === 8) {
    plan.push(...Array(4).fill('gemEmerald'));
    plan.push(...Array(3).fill('gemGold'));
    plan.push(...Array(2).fill('gemSapphire'));
    plan.push('gemPearl');
  } else if (wordLength === 7) {
    plan.push(...Array(3).fill('gemEmerald'));
    plan.push(...Array(2).fill('gemGold'));
    plan.push('gemSapphire');
  } else if (wordLength === 6) {
    plan.push(...Array(3).fill('gemEmerald'));
    plan.push('gemGold');
  } else if (wordLength === 5) {
    plan.push(...Array(2).fill('gemEmerald'));
  } else if (wordLength === 4) {
    plan.push('gemEmerald');
  } else {
    return; // < 4 letters — no gem reward
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
  // Every 5 words → 1 new prism in top 3 rows
  if (hxWordCount % 5 === 0) {
    spawnSpecialInRows('prism', [-GRID_RADIUS, -GRID_RADIUS + 1, -GRID_RADIUS + 2]);
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

function spawnSpecialInRows(type, rows) {
  const eligible = hxState.tiles.filter(
    t => (t.tileType === 'normal' || t.tileType === 'digraph') && rows.includes(t.r) && !isPortalTile(t),
  );
  if (eligible.length === 0) return;
  const target = eligible[Math.floor(Math.random() * eligible.length)];

  // If overwriting a digraph tile, remove it from the digraph state array first
  if (target.tileType === 'digraph') removeFrom(hxState.digraphTiles, target);

  target.tileType = type;
  if (type === 'ember') hxState.emberTiles.push(target);
  else if (type === 'prism') hxState.prismTiles.push(target);
  else if (type === 'rune')  hxState.runeTiles.push(target);
  else if (type === 'amethyst') hxState.amethystTiles.push(target);
  else if (type === 'selenite') hxState.seleniteTiles.push(target);
  else if (type === 'digraph') {
    const { digraph, points } = randomDigraph();
    target.letter = digraph;
    target.point  = points;
    hxState.digraphTiles.push(target);
  }
  applyTileType(target);

  // Dramatic entrance animation for the newly spawned special tile
  const spawnClass = `hx-${type}-spawn`;
  target.element.classList.add(spawnClass);
  target.element.addEventListener('animationend', () => {
    target.element.classList.remove(spawnClass);
  }, { once: true });
}

/* ── Game over ─────────────────────────────────────────────────── */
function triggerGameOver() {
  if (hxState.gameOver) return;
  hxState.gameOver = true;
  hxState.active   = false;

  window.removeEventListener('beforeunload', saveHexacoreProgress);
  clearHexacoreSave();
  if (hxPointerCleanup) { hxPointerCleanup(); hxPointerCleanup = null; }
  cancelAmethystTargeting();
  cancelSeleniteTargeting();
  clearSelection();
  document.body.classList.remove('hx-active');

  // Restore game title
  const titleEl = document.getElementById('game-title');
  if (titleEl) titleEl.textContent = 'ANAGRAMATON';

  // Restore SUBMIT/CLEAR buttons for when the player returns to main mode
  const submitBtn = document.getElementById('submit-word');
  const clearBtn  = document.getElementById('clear-word');
  if (submitBtn) submitBtn.style.display = '';
  if (clearBtn)  clearBtn.style.display  = '';

  removeHud();
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
    startHexacore();
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
  const result = await submitScore('hexacore', hxState.score, hxState.words.map(w => w.word), 0, 'hexacore');
  btn.textContent = '✓ SUBMITTED';

  await loadLeaderboard(result);
}

async function loadLeaderboard(submitResult) {
  const area = document.getElementById('hx-lb-area');
  if (!area) return;
  area.textContent = 'Loading…';

  // dailyId = 'hexacore' partitions this leaderboard from daily/unlimited
  const result = await fetchLeaderboard('hexacore', 'hexacore');

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
    <tr style="${rowStyle}">
      <td style="padding:0.15rem 0.5rem;opacity:0.5">${i + 1}</td>
      <td style="padding:0.15rem 0.5rem">${escapeHtml(e.player_name || 'Anonymous')}</td>
      <td style="padding:0.15rem 0.5rem;color:${isCurrentPlayer ? '#f59e0b' : '#4cc9f0'};font-weight:700">${e.score}</td>
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
        <tr style="font-size:0.72rem;opacity:0.5;text-transform:uppercase">
          <th style="padding:0.15rem 0.5rem">#</th>
          <th style="padding:0.15rem 0.5rem">Player</th>
          <th style="padding:0.15rem 0.5rem">Score</th>
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

/* ── Progress persistence ──────────────────────────────────────── */
function saveHexacoreProgress() {
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
  };

  try { localStorage.setItem(HX_SAVE_KEY, JSON.stringify(save)); } catch (_) { /* quota / private */ }
}

function loadHexacoreProgress() {
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
export function startHexacore() {
  // Load persisted requirements (persist across sessions and new games)
  hxCompletedReqs = new Set(loadHexacoreRequirements());

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
    gemDiamondTiles:   [],
    amethystTiles:   [],
    seleniteTiles:   [],
    amethystCount:   0,
    seleniteCount:   0,
    gameOver:        false,
    active:          false, // set to true after intro animation completes
    // Portal system reset
    wordsSubmitted: 0,
    portalOpen:     false,
    portalUsed:     false,
    portalEntry:    null,
    portalExit:     null,
    portalWordsRemaining: 0,
  });
  hxSelected           = [];
  hxPointerDown        = false;
  hxWordCount          = 0;
  hxTileMap            = new Map();
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
        gemRuby:      hxState.gemRubyTiles,
        gemDiamond:   hxState.gemDiamondTiles,
        amethyst:     hxState.amethystTiles,
        selenite:     hxState.seleniteTiles,
      };

      (save.tiles ?? []).forEach(saved => {
        const tile = hxTileMap.get(hxKey(saved.q, saved.r));
        if (!tile) return;

        // Remove from all type arrays before re-assigning
        Object.values(tileTypeArrays).forEach(arr => removeFrom(arr, tile));

        tile.letter   = saved.letter;
        tile.point    = saved.point;
        tile.tileType = saved.tileType;

        // Add to the appropriate type array
        tileTypeArrays[saved.tileType]?.push(tile);

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
      hxState.amethystCount = save.amethystCount ?? 0;
      hxState.seleniteCount = save.seleniteCount ?? 0;

      // Sync HUD to restored values
      updateHud();
      updateLevelHud();
      updateScoreDisplay();
      updatePowerUpBar();

      showRestoredBanner(hxState.level, hxState.score);
    }
  });
  // Ember tiles do NOT spawn at game start — only after milestone words

  document.body.classList.add('hx-active');

  // Clear the shared word display so no stale main-board letters show
  const currentWordEl = document.getElementById('current-word');
  if (currentWordEl) currentWordEl.textContent = '';

  // Change title to reflect Hexacore mode
  const titleEl = document.getElementById('game-title');
  if (titleEl) titleEl.textContent = 'HEXACORE';

  // Hide SUBMIT/CLEAR — Hexacore auto-submits on drag release
  const submitBtn = document.getElementById('submit-word');
  const clearBtn  = document.getElementById('clear-word');
  if (submitBtn) submitBtn.style.display = 'none';
  if (clearBtn)  clearBtn.style.display  = 'none';

  ensureHud();
  updateHud();
  updateLevelHud();
  updateScoreDisplay();
  updatePowerUpBar();

  setupPointerEvents();
  playSound('sfxUnlock');
  window.addEventListener('beforeunload', saveHexacoreProgress);
}

export function getHexacoreScore() {
  return hxState.score;
}

export function stopHexacore() {
  hxState.gameOver = true;
  hxState.active   = false;

  window.removeEventListener('beforeunload', saveHexacoreProgress);
  if (hxPointerCleanup) { hxPointerCleanup(); hxPointerCleanup = null; }

  cancelAmethystTargeting();
  cancelSeleniteTargeting();

  document.getElementById('hx-gameover-overlay')?.remove();
  document.getElementById('hx-challenges-modal')?.remove();
  document.getElementById('hx-req-toast')?.remove();
  removeHud();

  document.body.classList.remove('hx-active');

  const titleEl = document.getElementById('game-title');
  if (titleEl) titleEl.textContent = 'ANAGRAMATON';

  const submitBtn = document.getElementById('submit-word');
  const clearBtn  = document.getElementById('clear-word');
  if (submitBtn) submitBtn.style.removeProperty('display');
  if (clearBtn)  clearBtn.style.removeProperty('display');
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
        color:#f1f5f9;font-family:'Turret Road','Orbitron',monospace;text-align:center;
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

    const result = await fetchLeaderboard('hexacore', 'hexacore');
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
        <tr style="${rowStyle}">
          <td style="padding:0.15rem 0.5rem;opacity:0.5">${i + 1}</td>
          <td style="padding:0.15rem 0.5rem">${escapeHtml(e.player_name || 'Anonymous')}</td>
          <td style="padding:0.15rem 0.5rem;color:${isCurrentPlayer ? '#f59e0b' : '#4cc9f0'};font-weight:700">${e.score}</td>
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
          <tr style="font-size:0.72rem;opacity:0.5;text-transform:uppercase">
            <th style="padding:0.15rem 0.5rem">#</th>
            <th style="padding:0.15rem 0.5rem">Player</th>
            <th style="padding:0.15rem 0.5rem">Score</th>
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

    if (loadHexacoreProgress()) {
      if (confirm('Continue your saved Hexacore session?')) {
        startHexacore();
      } else {
        clearHexacoreSave();
        startHexacore();
      }
    } else {
      startHexacore();
    }
  });
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
