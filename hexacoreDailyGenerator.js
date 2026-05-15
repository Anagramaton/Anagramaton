import { GRID_RADIUS } from './constants.js';
import { getAllCoords, hexKey, ADJ_DIRS, isValidCoord } from './gridCoords.js';
import { findPath } from './pathfinding.js';
import wordList_5 from './wordList_5.js';
import wordList_6 from './wordList_6.js';
import wordList_7 from './wordList_7.js';
import wordList_8 from './wordList_8.js';
import wordList_9 from './wordList_9.js';
import wordList_10 from './wordList_10.js';
import wordList_11 from './wordList_11.js';
import wordList_12 from './wordList_12.js';
import wordList_13 from './wordList_13.js';

const LETTER_POINTS = {
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

const GEM_MULTIPLIERS = {
  gemEmerald:  2,
  gemGold:     3,
  gemSapphire: 4,
  gemPearl:    5,
  gemTanzanite: 6,
  gemRuby:     7,
  gemDiamond:  8,
};

const DAILY_ROTATING_GEM_TYPES = ['gemEmerald', 'gemGold'];
const DAILY_ROTATING_RUNE_TYPES = ['rune', 'amethyst'];
const MAX_PORTAL_CANDIDATE_POOL = 12;

// The 6 outer-edge mid-point tiles of the radius-4 hex grid that may become portals.
// All positions satisfy |q|≤4, |r|≤4, |s|≤4 (s = -q-r) so they exist on the board.
const DAILY_PORTAL_CORNERS = [
  { q: -2, r:  4 },  // lower-left  edge midpoint (s=-2)
  { q:  2, r:  2 },  // lower-right edge midpoint (s=-4)  ← was (2,4) which is off-grid (s=-6)
  { q:  4, r:  0 },  // right corner               (s=-4)
  { q:  2, r: -4 },  // upper-right edge midpoint (s=2)
  { q: -2, r: -2 },  // upper-left  edge midpoint (s=4)   ← was (-2,-4) which is off-grid (s=6)
  { q: -4, r:  0 },  // left corner                (s=4)
];

// Digraph combos eligible for daily board placement
const DAILY_DIGRAPH_OPTIONS = [
  'TH', 'HE', 'IN', 'ER', 'RE', 'ST', 'AN', 'ON', 'EA',
  'IO', 'LL', 'QU', 'CK', 'CH', 'EN', 'CO', 'LY', 'AL',
  'LE', 'ED', 'ES', 'UN', 'GH', 'CR', 'WH', 'NT', 'NG', 'TY',
];

// Minimum gem multiplier threshold to consider a gem "high-tier" for validation
const HIGH_TIER_GEM_MULTIPLIER = 6;
// Derived from GEM_MULTIPLIERS so the list stays in sync automatically
const HIGH_TIER_GEMS = new Set(
  Object.entries(GEM_MULTIPLIERS)
    .filter(([, mult]) => mult >= HIGH_TIER_GEM_MULTIPLIER)
    .map(([type]) => type),
);

const LETTER_POOL = [
  ...Array(12).fill('E'), ...Array(9).fill('A'), ...Array(8).fill('I'), ...Array(8).fill('O'), ...Array(4).fill('U'),
  ...Array(7).fill('R'), ...Array(7).fill('S'), ...Array(7).fill('T'), ...Array(6).fill('L'), ...Array(6).fill('N'),
  ...Array(4).fill('D'), ...Array(4).fill('H'), ...Array(4).fill('G'), ...Array(4).fill('Y'),
  ...Array(3).fill('C'), ...Array(3).fill('M'), ...Array(3).fill('P'), ...Array(2).fill('B'), ...Array(2).fill('F'), ...Array(2).fill('V'), ...Array(2).fill('W'),
  'K', 'J', 'Q', 'X', 'Z',
];

const HIGH_VALUE_LETTERS = new Set(['Q', 'Z', 'X', 'J']);
const MAX_SCORE_ESTIMATE_MULTIPLIER = 2.5;
const MIN_SCORE_ESTIMATE_MULTIPLIER = 2.0;

function toIsoDate(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function fnv1a32(input) {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mkSeededRng(seed) {
  let s = (seed >>> 0) || 1;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 0x100000000;
}

function wordScore(word) {
  let score = 0;
  for (const ch of word) score += LETTER_POINTS[ch] || 1;
  return score * Math.max(4, word.length);
}

function makeRanked(words, minLen, maxLen) {
  const uniq = new Set();
  const out = [];
  for (const raw of words) {
    const w = String(raw || '').toUpperCase();
    if (w.length < minLen || w.length > maxLen) continue;
    if (!/^[A-Z]+$/.test(w)) continue;
    if (uniq.has(w)) continue;
    uniq.add(w);
    out.push({ word: w, score: wordScore(w) });
  }
  out.sort((a, b) => b.score - a.score);
  return out;
}

const SHORT_RANKED = makeRanked([...wordList_5, ...wordList_6], 5, 6);
const MEDIUM_RANKED = makeRanked([...wordList_7, ...wordList_8], 7, 8);
const LONG_RANKED = makeRanked([...wordList_9, ...wordList_10, ...wordList_11, ...wordList_12, ...wordList_13], 9, 13);

function pickWordGroup(rng, ranked, count, window = 600) {
  const result = [];
  const used = new Set();
  const maxIdx = Math.min(window, ranked.length);
  while (result.length < count && used.size < maxIdx) {
    const idx = Math.floor(rng() * maxIdx);
    if (used.has(idx)) continue;
    used.add(idx);
    result.push(ranked[idx].word);
  }
  return result;
}

function chooseTargetWords(rng) {
  const shortCount = 3 + Math.floor(rng() * 3);
  const words = [
    ...pickWordGroup(rng, LONG_RANKED, 1, 700),
    ...pickWordGroup(rng, MEDIUM_RANKED, 2, 900),
    ...pickWordGroup(rng, SHORT_RANKED, shortCount, 1200),
  ];
  return words.slice(0, 8);
}

function shuffled(list, rng) {
  const arr = list.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function coordKey(cell) {
  if (cell?.key) return cell.key;
  return hexKey(cell.q, cell.r);
}

function getAllCoordsWithKeys(radius) {
  return getAllCoords(radius).map(c => ({ ...c, key: coordKey(c) }));
}

function pathOverlap(path, grid, word) {
  let overlap = 0;
  path.forEach((cell, i) => {
    const existing = grid[coordKey(cell)];
    if (existing && existing === word[i]) overlap += 1;
  });
  return overlap;
}

function placeWords(words, rng, radius) {
  const coords = getAllCoords(radius);
  const grid = {};
  const placements = [];

  const tryPlaceWord = (word, sampleSize = 180) => {
    let best = null;
    let bestMetric = -Infinity;

    const starts = shuffled(coords, rng).slice(0, sampleSize);
    for (const start of starts) {
      const path = findPath(
        grid,
        word,
        start.q,
        start.r,
        0,
        new Set(),
        radius,
        { allowZigZag: true, preferOverlap: true, maxStraight: 2, wallBuffer: 1, maxEdgeRun: 1 },
      );
      if (!path) continue;
      const normalizedPath = path.map(c => ({ ...c, key: coordKey(c) }));

      const overlap = pathOverlap(normalizedPath, grid, word);
      const centerBias = normalizedPath.reduce((sum, c) => sum - Math.max(Math.abs(c.q), Math.abs(c.r), Math.abs(c.q + c.r)), 0);
      const metric = overlap * 16 + centerBias;
      if (metric > bestMetric) {
        bestMetric = metric;
        best = normalizedPath;
      }
    }

    if (!best) return false;

    best.forEach((cell, i) => {
      grid[coordKey(cell)] = word[i];
    });
    placements.push({ word, path: best, score: wordScore(word) });
    return true;
  };

  const sortedWords = words.slice().sort((a, b) => b.length - a.length || wordScore(b) - wordScore(a));
  for (const word of sortedWords) {
    tryPlaceWord(word, 220);
  }

  if (placements.length < 6) {
    const fallback = shuffled(
      [
        ...SHORT_RANKED.slice(0, 500).map(x => x.word),
        ...MEDIUM_RANKED.slice(0, 300).map(x => x.word),
      ],
      rng,
    );
    for (const word of fallback) {
      if (placements.length >= 6) break;
      if (placements.some(p => p.word === word)) continue;
      tryPlaceWord(word, 120);
    }
  }

  return { grid, placements };
}

function neighbors(q, r, radius) {
  const result = [];
  for (const [dq, dr] of ADJ_DIRS) {
    const nq = q + dq;
    const nr = r + dr;
    if (!isValidCoord(nq, nr, radius)) continue;
    result.push({ q: nq, r: nr, key: hexKey(nq, nr) });
  }
  return result;
}

function buildCoordStats(placements) {
  const coordToWords = new Map();
  const longMiddle = new Set();

  placements.forEach((p, idx) => {
    p.path.forEach((c, i) => {
      const key = c.key;
      if (!coordToWords.has(key)) coordToWords.set(key, new Set());
      coordToWords.get(key).add(idx);
      if (p.word.length >= 9 && i >= 2 && i <= p.path.length - 3) longMiddle.add(key);
    });
  });

  return { coordToWords, longMiddle };
}

function getCoordsWithinRadius(center, radius, boardRadius) {
  const out = [];
  for (let dq = -radius; dq <= radius; dq++) {
    for (let dr = -radius; dr <= radius; dr++) {
      const q = center.q + dq;
      const r = center.r + dr;
      if (!isValidCoord(q, r, boardRadius)) continue;
      if (Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr)) <= radius) out.push({ q, r, key: hexKey(q, r) });
    }
  }
  return out;
}

function placeSpecialTiles(grid, placements, rng, radius = GRID_RADIUS, date = '') {
  const specials = [];
  const taken = new Set();
  const { coordToWords, longMiddle } = buildCoordStats(placements);

  const allCoords = getAllCoordsWithKeys(radius);
  const pathDensity = new Map();
  for (const c of allCoords) {
    const n = neighbors(c.q, c.r, radius);
    let density = (coordToWords.get(c.key)?.size || 0);
    n.forEach(nn => { density += (coordToWords.get(nn.key)?.size || 0); });
    pathDensity.set(c.key, density);
  }

  const placeType = (type, candidates, count, extra = {}) => {
    const placed = [];
    const ordered = candidates
      .filter(c => !taken.has(c.key) && !!grid[c.key])
      .sort((a, b) => (b.weight || 0) - (a.weight || 0));
    const picks = shuffled(ordered, rng);
    for (const c of picks) {
      if (count <= 0) break;
      if (taken.has(c.key) || !grid[c.key]) continue;
      const placedTile = { type, q: c.q, r: c.r, ...extra };
      specials.push(placedTile);
      placed.push(placedTile);
      taken.add(c.key);
      count -= 1;
    }
    return placed;
  };

  // ── 1 · PRISM — highest strategic overlap ────────────────────────
  const prismCandidates = allCoords
    .map(c => {
      const wordCount = coordToWords.get(c.key)?.size || 0;
      const n = neighbors(c.q, c.r, radius);
      const nearHigh = n.some(nn => HIGH_VALUE_LETTERS.has(grid[nn.key]));
      const strategic = nearHigh || longMiddle.has(c.key);
      if (wordCount < 2 || !strategic) return null;
      return { ...c, weight: wordCount * 10 + (nearHigh ? 5 : 0) + (longMiddle.has(c.key) ? 4 : 0) };
    })
    .filter(Boolean);
  placeType('prism', prismCandidates, 1);

  // ── Rotating rune candidate pool: near high-value letters ────────
  const runeCandidates = allCoords
    .map(c => {
      const n = neighbors(c.q, c.r, radius);
      const nearProblem = n.some(nn => HIGH_VALUE_LETTERS.has(grid[nn.key]));
      const options = n.reduce((acc, nn) => acc + (coordToWords.get(nn.key)?.size || 0), 0);
      if (!nearProblem || options < 4) return null;
      return { ...c, weight: options + 10 };
    })
    .filter(Boolean);
  // ── Rotating gem candidate pool ───────────────────────────────────
  const vowelRichness = (coord) => {
    const around = getCoordsWithinRadius(coord, 2, radius);
    let vowels = 0;
    around.forEach(c => { if ('AEIOU'.includes(grid[c.key] || '')) vowels += 1; });
    return vowels;
  };

  const longPathCoords = new Set();
  const mediumPathCoords = new Set();
  placements.forEach(p => {
    if (p.word.length >= 7) p.path.forEach(c => longPathCoords.add(c.key));
    if (p.word.length >= 6) p.path.forEach(c => mediumPathCoords.add(c.key));
  });

  const gemCandidates = allCoords.map(c => {
    const key = c.key;
    const wc7 = placements.filter(p => p.word.length >= 7 && p.path.some(pc => pc.key === key)).length;
    const wc6 = placements.filter(p => p.word.length >= 6 && p.path.some(pc => pc.key === key)).length;
    return {
      ...c,
      wc7,
      wc6,
      vowels: vowelRichness(c),
      density: pathDensity.get(key) || 0,
      inLong: longPathCoords.has(key),
      inMedium: mediumPathCoords.has(key),
    };
  });

  // ── ROTATE 1 EMERALD OR 1 GOLD ────────────────────────────────────
  const chosenGem = shuffled(DAILY_ROTATING_GEM_TYPES, rng)[0];
  const chosenGemMultiplier = GEM_MULTIPLIERS[chosenGem] || 1;
  const gemPlacementCandidates = gemCandidates
    .map(c => ({ ...c, weight: c.density * chosenGemMultiplier + c.vowels + (c.inLong ? 8 : 0) + (c.inMedium ? 4 : 0) }));
  placeType(chosenGem, gemPlacementCandidates, 1);

  // ── ROTATE 1 RUNE OR 1 AMETHYST ───────────────────────────────────
  const chosenRotatingSpecial = shuffled(DAILY_ROTATING_RUNE_TYPES, rng)[0];
  const denseCandidates = allCoords.map(c => ({ ...c, weight: pathDensity.get(c.key) || 0 }));
  if (chosenRotatingSpecial === 'rune') {
    placeType('rune', runeCandidates.length >= 1 ? runeCandidates : denseCandidates, 1);
  } else {
    placeType('amethyst', denseCandidates, 1);
  }

  // ── DIGRAPHS: unique strings, variable count (no fixed cap) ──────
  const shuffledDigraphs = shuffled(DAILY_DIGRAPH_OPTIONS, rng);
  const digraphCandidates = allCoords.map(c => ({
    ...c,
    weight: (longPathCoords.has(c.key) ? 14 : 0) + (pathDensity.get(c.key) || 0),
  }));
  const strategicDigraphSlots = digraphCandidates.filter(c => c.weight > 0).length;
  const maxDigraphCount = Math.min(shuffledDigraphs.length, Math.max(0, strategicDigraphSlots));
  const minDigraphCount = Math.min(3, maxDigraphCount);
  const digraphCount = maxDigraphCount > 0
    ? minDigraphCount + Math.floor(rng() * (maxDigraphCount - minDigraphCount + 1))
    : 0;
  const chosenDigraphs = shuffledDigraphs.slice(0, digraphCount);
  for (const dg of chosenDigraphs) {
    placeType('digraph', digraphCandidates, 1, { digraph: dg });
  }

  // ── 1 portal entry + 1 portal exit, weighted for strategic use ────
  const portalHexDistance = (a, b) => Math.max(
    Math.abs(a.q - b.q),
    Math.abs(a.r - b.r),
    Math.abs((a.q + a.r) - (b.q + b.r)),
  );
  // Portals must appear on the outer two rings so they are never placed in
  // the middle of the board (ring >= radius - 1, i.e. rings 3 and 4 for the
  // default radius-4 board).
  const portalCandidates = allCoords
    .filter(c => Math.max(Math.abs(c.q), Math.abs(c.r), Math.abs(-c.q - c.r)) >= radius - 1)
    .map(c => {
      const wordCount = coordToWords.get(c.key)?.size || 0;
      if (wordCount < 1) return null;
      return {
        ...c,
        weight: wordCount * 12 + (pathDensity.get(c.key) || 0) + (longPathCoords.has(c.key) ? 10 : 0),
      };
    })
    .filter(Boolean)
    .sort((a, b) => (b.weight || 0) - (a.weight || 0));

  const firstPortal = shuffled(
    portalCandidates.slice(0, Math.min(MAX_PORTAL_CANDIDATE_POOL, portalCandidates.length)),
    rng,
  )[0];
  if (firstPortal) {
    specials.push({ type: 'portal', role: 'entry', q: firstPortal.q, r: firstPortal.r });
    taken.add(firstPortal.key);

    const secondPortalCandidates = portalCandidates
      .filter(c => c.key !== firstPortal.key)
      .map(c => ({ ...c, weight: (c.weight || 0) + portalHexDistance(firstPortal, c) * 3 }))
      .sort((a, b) => (b.weight || 0) - (a.weight || 0));
    const secondPortal = shuffled(
      secondPortalCandidates.slice(0, Math.min(MAX_PORTAL_CANDIDATE_POOL, secondPortalCandidates.length)),
      rng,
    )[0];
    if (secondPortal) {
      specials.push({ type: 'portal', role: 'exit', q: secondPortal.q, r: secondPortal.r });
      taken.add(secondPortal.key);
    }
  }

  // Fallback to corners if strategic placement failed to produce a pair.
  if (specials.filter(s => s.type === 'portal').length < 2) {
    const availableCorners = shuffled(DAILY_PORTAL_CORNERS, rng).filter(c => !taken.has(hexKey(c.q, c.r)));
    for (const corner of availableCorners.slice(0, 2)) {
      const role = specials.some(s => s.type === 'portal') ? 'exit' : 'entry';
      const key = hexKey(corner.q, corner.r);
      specials.push({ type: 'portal', role, q: corner.q, r: corner.r });
      taken.add(key);
    }
  }

  return specials;
}

function fillEmptyTiles(grid, rng, radius = GRID_RADIUS) {
  const coords = getAllCoordsWithKeys(radius);
  const pool = LETTER_POOL;

  for (const c of coords) {
    const key = c.key;
    if (grid[key]) continue;

    const near = neighbors(c.q, c.r, radius);
    const nearLetters = near.map(n => grid[n.key]).filter(Boolean);
    const nearVowels = nearLetters.filter(ch => 'AEIOU'.includes(ch)).length;

    let letter = pool[Math.floor(rng() * pool.length)];
    if (nearVowels === 0 && rng() < 0.75) {
      letter = ['A', 'E', 'I', 'O', 'U'][Math.floor(rng() * 5)];
    }
    grid[key] = letter;
  }
}

// ─── Maximum Score Simulation ────────────────────────────────────────────────

/**
 * Lazily-built trie for fast DFS word search during simulation.
 * Only populated on first call to simulateMaxScore (not at module load time).
 * Words of length 5-11 from the combined word lists.
 */
let _simTrie = null;
const SIM_MIN_LEN = 5;
const SIM_MAX_LEN = 11;

/** Cap on how many valid word paths findAllValidPaths may return per round. */
const MAX_SIMULATION_PATHS = 300;

/** Maximum greedy-play rounds in simulateMaxScore (safety cap). */
const MAX_SIMULATION_ROUNDS = 25;

/** Score thresholds for difficulty classification. */
const DIFFICULTY_EASY_THRESHOLD   = 15_000;
const DIFFICULTY_MEDIUM_THRESHOLD = 30_000;
const DIFFICULTY_HARD_THRESHOLD   = 50_000;

function getSimTrie() {
  if (_simTrie) return _simTrie;
  const trie = Object.create(null);
  const LISTS = [wordList_5, wordList_6, wordList_7, wordList_8, wordList_9, wordList_10, wordList_11];
  for (const list of LISTS) {
    for (const rawWord of list) {
      const word = String(rawWord).toUpperCase();
      if (word.length < SIM_MIN_LEN || word.length > SIM_MAX_LEN) continue;
      if (!/^[A-Z]+$/.test(word)) continue;
      let node = trie;
      for (const ch of word) {
        if (!node[ch]) node[ch] = Object.create(null);
        node = node[ch];
      }
      node.$ = word;
    }
  }
  _simTrie = trie;
  return trie;
}

/**
 * Applies gravity to the simulation grid: tiles fall "downward" (increasing r)
 *
 * @param {Object} simGrid - { [hexKey]: { letter, special } } — modified in place
 * @param {number} radius  - board radius (default GRID_RADIUS)
 */
function applyGravity(simGrid, radius = GRID_RADIUS) {
  for (let q = -radius; q <= radius; q++) {
    const rMin = Math.max(-radius, -q - radius);
    const rMax = Math.min(radius, -q + radius);

    // Collect all tile positions in this column, sorted ascending by r (top first)
    const colPositions = [];
    for (let r = rMin; r <= rMax; r++) {
      colPositions.push({ r, key: hexKey(q, r) });
    }

    // Gather occupied tiles top-to-bottom
    const tiles = colPositions
      .filter(p => simGrid[p.key])
      .map(p => simGrid[p.key]);

    if (tiles.length === colPositions.length) continue; // nothing to do

    // Clear the column
    colPositions.forEach(p => delete simGrid[p.key]);

    // Re-place tiles starting from the bottom of the column (largest r)
    const offset = colPositions.length - tiles.length;
    tiles.forEach((tile, i) => {
      simGrid[colPositions[offset + i].key] = tile;
    });
  }
}

/**
 * Calculates the score for a word path using the actual Hexacore scoring formula:
 *   score = base × lenMult × (prism ? 2 : 1) × gemMult × uniqueGemTypes
 *
 * Length multipliers mirror HX_LENGTH_MULTIPLIERS in hexacore.js.
 *
 * @param {string} word    - The word (uppercase)
 * @param {Array}  path    - Array of { key } objects
 * @param {Object} simGrid - { [hexKey]: { letter, special } }
 * @returns {number} Integer score
 */

// Mirrors HX_LENGTH_MULTIPLIERS in hexacore.js — single source of truth for simulation scoring.
const LENGTH_MULT_TABLE = { 4: 2, 5: 5, 6: 6, 7: 7, 8: 8, 9: 9, 10: 10, 11: 11, 12: 12, 13: 13 };

function calculatePathScore(word, path, simGrid) {
  let base = 0;
  for (const ch of word) base += LETTER_POINTS[ch] || 1;

  // Use the length-multiplier table; fall back to word.length for lengths > 13
  const actualLenMult = LENGTH_MULT_TABLE[word.length] ?? word.length;

  let hasPrism = false;
  let gemMult = 1;
  const uniqueGems = new Set();

  for (const cell of path) {
    const special = simGrid[cell.key]?.special;
    if (!special) continue;
    if (special === 'prism') { hasPrism = true; continue; }
    if (GEM_MULTIPLIERS[special]) {
      gemMult *= GEM_MULTIPLIERS[special];
      uniqueGems.add(special);
    }
  }

  const countBonus = Math.max(1, uniqueGems.size);
  return Math.round(base * actualLenMult * (hasPrism ? 2 : 1) * gemMult * countBonus);
}

/**
 * Finds valid word paths in the current simGrid state by:
 * 1. Scanning words with a fast frequency pre-filter
 * 2. Step-sampling through frequency-matching candidates for pathfinding
 *
 * Focuses on 5-10 letter words for a good speed/coverage tradeoff.
 *
 * @param {Object} simGrid       - { [hexKey]: { letter, special } }
 * @param {number} radius        - Grid radius
 * @param {number} maxPathfinds  - Maximum pathfinding attempts (performance cap)
 */
function findAllValidPaths(simGrid, radius = GRID_RADIUS, maxResults = MAX_SIMULATION_PATHS) {
  const trie = getSimTrie();

  const foundWords = new Set();
  const results = [];

  /** DFS through the board following trie branches for O(board × trie) time. */
  function dfs(q, r, trieNode, word, path, visited) {
    if (results.length >= maxResults) return;

    // Mark complete words
    if (trieNode.$ && word.length >= SIM_MIN_LEN && !foundWords.has(trieNode.$)) {
      const completedWord = trieNode.$;
      foundWords.add(completedWord);
      results.push({ word: completedWord, path: path.slice(), score: calculatePathScore(completedWord, path, simGrid) });
    }

    if (word.length >= SIM_MAX_LEN) return;

    // Explore hex neighbours
    for (const [dq, dr] of ADJ_DIRS) {
      const nq = q + dq;
      const nr = r + dr;
      const nkey = hexKey(nq, nr);
      if (visited.has(nkey)) continue;

      const ncell = simGrid[nkey];
      if (!ncell) continue;

      const letter = ncell.letter.toUpperCase();
      const next = trieNode[letter];
      if (!next) continue; // Trie pruning — no words down this branch

      visited.add(nkey);
      path.push({ key: nkey, q: nq, r: nr });
      dfs(nq, nr, next, word + letter, path, visited);
      path.pop();
      visited.delete(nkey);
    }
  }

  for (const [key, cell] of Object.entries(simGrid)) {
    if (results.length >= maxResults) break;
    if (!cell) continue;
    const letter = cell.letter.toUpperCase();
    const trieRoot = trie[letter];
    if (!trieRoot) continue;

    const [q, r] = key.split(',').map(Number);
    const visited = new Set([key]);
    dfs(q, r, trieRoot, letter, [{ key, q, r }], visited);
  }

  return results;
}

/**
 * Simulates a full greedy play-through: on each turn, plays the highest-scoring
 * available word, removes its tiles, applies gravity, then repeats.
 *
 * @param {Object} grid        - Plain letter grid { [hexKey]: letter }
 * @param {Array}  specialTiles - Array of { type, q, r } from the board
 * @param {number} radius      - Board radius
 * @param {number} maxRounds   - Safety cap on simulation iterations
 * @returns {{ maxScore, optimalMoves, averageWordLength, gemDensity, solutionPath }}
 */
export function simulateMaxScore(grid, specialTiles, radius = GRID_RADIUS, maxRounds = MAX_SIMULATION_ROUNDS) {
  // Build a combined simulation grid: { [key]: { letter, special } }
  const simGrid = {};
  for (const [key, letter] of Object.entries(grid)) {
    simGrid[key] = { letter, special: null };
  }
  for (const s of specialTiles) {
    const key = hexKey(s.q, s.r);
    if (simGrid[key]) simGrid[key].special = s.type;
  }

  const gemCount = specialTiles.filter(s => GEM_MULTIPLIERS[s.type]).length;
  const totalTiles = Object.keys(simGrid).length;

  let totalScore = 0;
  const solutionPath = [];
  let round = 0;

  while (round < maxRounds) {
    round++;
    const paths = findAllValidPaths(simGrid, radius);
    if (paths.length === 0) break;

    // Pick the highest-scoring path
    paths.sort((a, b) => b.score - a.score);
    const best = paths[0];

    totalScore += best.score;
    solutionPath.push(best.word);

    // Remove the used tiles from simGrid
    for (const cell of best.path) {
      delete simGrid[cell.key];
    }

    // Apply gravity so remaining tiles fall down
    applyGravity(simGrid, radius);
  }

  const totalWordLen = solutionPath.reduce((s, w) => s + w.length, 0);
  return {
    maxScore: totalScore,
    optimalMoves: solutionPath.length,
    averageWordLength: solutionPath.length > 0 ? Math.round((totalWordLen / solutionPath.length) * 10) / 10 : 0,
    gemDensity: totalTiles > 0 ? Math.round((gemCount / totalTiles) * 1000) / 1000 : 0,
    solutionPath,
  };
}

/**
 * Classifies difficulty based on maximum achievable score.
 */
function classifyDifficulty(maxScore) {
  if (maxScore < DIFFICULTY_EASY_THRESHOLD)   return 'easy';
  if (maxScore < DIFFICULTY_MEDIUM_THRESHOLD) return 'medium';
  if (maxScore < DIFFICULTY_HARD_THRESHOLD)   return 'hard';
  return 'expert';
}

function estimatePathScore(word, path, specialsByKey) {
  let base = 0;
  for (const ch of word) base += LETTER_POINTS[ch] || 1;
  const lenMult = Math.max(4, word.length);

  let gemMult = 1;
  let hasPrism = false;
  const usedGems = new Set();

  path.forEach(c => {
    const type = specialsByKey.get(c.key);
    if (type === 'prism') hasPrism = true;
    if (type && GEM_MULTIPLIERS[type]) {
      gemMult *= GEM_MULTIPLIERS[type];
      usedGems.add(type);
    }
  });

  return base * lenMult * (hasPrism ? 2 : 1) * gemMult * Math.max(1, usedGems.size);
}

function computeStrategies(placements, specialsByKey, grid) {
  const scored = placements.map(p => ({ ...p, estimatedScore: estimatePathScore(p.word, p.path, specialsByKey) }));

  const strategies = [];
  const strategyOrders = [
    scored.slice().sort((a, b) => b.estimatedScore - a.estimatedScore),
    scored.slice().sort((a, b) => (b.estimatedScore / b.word.length) - (a.estimatedScore / a.word.length)),
    scored.slice().sort((a, b) => b.word.length - a.word.length || b.estimatedScore - a.estimatedScore),
  ];

  for (const order of strategyOrders) {
    const picked = [];
    const used = new Set();
    for (const p of order) {
      if (picked.length >= 6) break;
      const overlap = p.path.some(c => used.has(c.key));
      if (overlap && picked.length >= 4) continue;
      picked.push(p);
      p.path.forEach(c => used.add(c.key));
    }

    const wordTotal = picked.reduce((sum, p) => sum + p.estimatedScore, 0);
    let penalty = 0;
    Object.entries(grid).forEach(([key, letter]) => {
      if (used.has(key)) return;
      if (!/^[A-Z]$/.test(letter)) return;
      penalty += LETTER_POINTS[letter] || 1;
    });

    const finalScore = Math.max(0, Math.round(wordTotal - penalty));
    strategies.push({
      words: picked.map(p => p.word),
      wordTotal: Math.round(wordTotal),
      penalty,
      finalScore,
    });
  }

  strategies.sort((a, b) => b.finalScore - a.finalScore);
  return strategies.slice(0, 3);
}

export function validateDailyBoard({ grid, placements, specialTiles }) {
  const specialsByKey = new Map(specialTiles.map(s => [hexKey(s.q, s.r), s.type]));
  const typeCounts = new Map();
  specialTiles.forEach(s => typeCounts.set(s.type, (typeCounts.get(s.type) || 0) + 1));

  const prismCount = typeCounts.get('prism') || 0;
  if (prismCount !== 1) return { valid: false, reason: `expected exactly 1 prism, got ${prismCount}` };

  const rotatingGemCount = (typeCounts.get('gemEmerald') || 0) + (typeCounts.get('gemGold') || 0);
  if (rotatingGemCount !== 1) return { valid: false, reason: 'expected exactly 1 rotating gem (emerald or gold)' };

  const rotatingSpecialCount = (typeCounts.get('rune') || 0) + (typeCounts.get('amethyst') || 0);
  if (rotatingSpecialCount !== 1) return { valid: false, reason: 'expected exactly 1 rotating special (rune or amethyst)' };

  const portalTiles = specialTiles.filter(s => s.type === 'portal');
  if (portalTiles.length !== 2) return { valid: false, reason: `expected exactly 2 portal tiles, got ${portalTiles.length}` };

  const digraphTiles = specialTiles.filter(s => s.type === 'digraph');
  const normalizedDigraphs = digraphTiles.map(s => String(s.digraph || '').toUpperCase());
  if (normalizedDigraphs.some(dg => !dg || dg.length !== 2)) {
    return { valid: false, reason: 'digraph tile missing valid digraph text' };
  }
  if (new Set(normalizedDigraphs).size !== normalizedDigraphs.length) {
    return { valid: false, reason: 'duplicate digraph on board' };
  }

  const scored = placements.map(p => ({ ...p, estimatedScore: estimatePathScore(p.word, p.path, specialsByKey) }));
  scored.sort((a, b) => b.estimatedScore - a.estimatedScore);
  if (scored.length < 3) return { valid: false, reason: 'not enough placed strategic words' };

  const medianIdx = Math.floor(scored.length / 2);
  const highValueCut = scored[medianIdx]?.estimatedScore || 0;
  const highValueWords = scored.filter(s => s.word.length >= 7 || s.estimatedScore >= highValueCut);

  for (const s of specialTiles.filter(x => x.type === 'prism' || x.type === 'rune')) {
    const key = hexKey(s.q, s.r);
    const uses = highValueWords.filter(w => w.path.some(c => c.key === key)).length;
    const broadUses = scored.filter(w => w.path.some(c => c.key === key)).length;
    const minUses = s.type === 'rune' ? 1 : 2;
    if (uses < minUses && broadUses < minUses) return { valid: false, reason: `${s.type} lacks multi-word strategic use` };
  }

  for (const portal of portalTiles) {
    const key = hexKey(portal.q, portal.r);
    const uses = scored.filter(w => w.path.some(c => c.key === key)).length;
    if (uses < 1) return { valid: false, reason: 'portal lacks strategic path coverage' };
  }

  const maxScore = Math.round(scored.slice(0, 3).reduce((sum, p) => sum + p.estimatedScore, 0) * MAX_SCORE_ESTIMATE_MULTIPLIER);
  const minScore = Math.round(scored.slice(0, 1).reduce((sum, p) => sum + p.estimatedScore, 0) * MIN_SCORE_ESTIMATE_MULTIPLIER);

  const nearOptimal = Math.max(3, scored.filter(s => s.estimatedScore >= scored[0].estimatedScore * 0.65).length);

  const highTier = specialTiles.filter(s => HIGH_TIER_GEMS.has(s.type));
  for (const gem of highTier) {
    const key = hexKey(gem.q, gem.r);
    const reachable = placements.some(p => p.word.length >= 7 && p.path.some(c => c.key === key));
    if (!reachable) return { valid: false, reason: `${gem.type} unreachable by 7+ path` };
  }

  const strategies = computeStrategies(placements, specialsByKey, grid);

  return {
    valid: true,
    strategicPaths: nearOptimal,
    maxScore,
    minScore,
    strategies,
  };
}

export function generateDailyHexacoreBoard({
  date = toIsoDate(),
  maxAttempts = 10,
  radius = GRID_RADIUS,
  attemptSeedOffset = 0,
  includePlacements = false,
  runSimulation = true,
} = {}) {
  const seed = fnv1a32(String(date));
  let lastFailure = 'unknown';

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const effectiveAttempt = attempt + (Number(attemptSeedOffset) || 0);
    const rng = mkSeededRng((seed + effectiveAttempt * 9973) >>> 0);

    const words = chooseTargetWords(rng);
    const { grid, placements } = placeWords(words, rng, radius);
    if (placements.length < 6) {
      lastFailure = 'insufficient placed words';
      continue;
    }

    fillEmptyTiles(grid, rng, radius);
    const specialTiles = placeSpecialTiles(grid, placements, rng, radius, date);

    const validation = validateDailyBoard({ grid, placements, specialTiles });
    if (!validation.valid) {
      lastFailure = validation.reason || 'validation failed';
      continue;
    }

    // Run gravity simulation to calculate the true maximum achievable score
    let simData = null;
    if (runSimulation) {
      try {
        simData = simulateMaxScore(grid, specialTiles, radius);
      } catch (err) {
        // Simulation failure is non-fatal — fall back to estimate
        console.warn('[hexacoreGenerator] simulateMaxScore failed:', err?.message ?? err);
        simData = null;
      }
    }

    const maxPossibleScore = simData?.maxScore ?? validation.maxScore;
    const difficulty = classifyDifficulty(maxPossibleScore);

    const board = {
      date,
      grid,
      specialTiles,
      metadata: {
        maxPossibleScore,
        minAchievableScore: validation.minScore,
        strategicPathCount: validation.strategicPaths,
        optimalSolutions: validation.strategies,
        difficulty,
        optimalMoves: simData?.optimalMoves ?? null,
        averageWordLength: simData?.averageWordLength ?? null,
        gemDensity: simData?.gemDensity ?? null,
        solutionPath: simData?.solutionPath ?? null,
        generatedAt: new Date().toISOString(),
      },
    };
    if (includePlacements) board.placements = placements;
    return board;
  }

  throw new Error(`Unable to generate a valid daily board for ${date} after ${maxAttempts} attempts (last failure: ${lastFailure})`);
}

export function generateDailyHexacoreBatch({ startDate = toIsoDate(), count = 1, includePlacements = false } = {}) {
  const out = [];
  const d = new Date(`${startDate}T00:00:00`);
  for (let i = 0; i < count; i++) {
    const date = toIsoDate(d);
    out.push(generateDailyHexacoreBoard({ date, includePlacements }));
    d.setDate(d.getDate() + 1);
  }
  return out;
}
