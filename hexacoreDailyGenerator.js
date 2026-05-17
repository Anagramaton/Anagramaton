import { GRID_RADIUS } from './constants.js';
import { getAllCoords, hexKey, ADJ_DIRS, isValidCoord } from './gridCoords.js';
import { findPath } from './pathfinding.js';
import wordList_4 from './wordList_4.js';
import wordList_5 from './wordList_5.js';
import wordList_6 from './wordList_6.js';
import wordList_7 from './wordList_7.js';
import wordList_8 from './wordList_8.js';
import wordList_9 from './wordList_9.js';
import wordList_10 from './wordList_10.js';
import wordList_11 from './wordList_11.js';
import wordList_12 from './wordList_12.js';
import wordList_13 from './wordList_13.js';
import wordList_14 from './wordList_14.js';
import wordList_15 from './wordList_15.js';
import wordList_16plus from './wordList_16plus.js';

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

// Edge-perimeter tiles on the upper/right side of the radius-4 hex grid used as portal entry fallbacks.
const DAILY_PORTAL_ENTRY_CORNERS = [
  { q:  0, r: -4 },
  { q:  1, r: -4 },
  { q:  2, r: -4 },
  { q:  3, r: -4 },
  { q:  4, r: -4 },
  { q: -1, r: -3 },
  { q:  4, r: -3 },
  { q: -2, r: -2 },
  { q:  4, r: -2 },
  { q: -3, r: -1 },
  { q:  4, r: -1 },
];

// Edge-perimeter tiles on the lower/left side of the radius-4 hex grid used as portal exit fallbacks.
const DAILY_PORTAL_EXIT_CORNERS = [
  { q: -4, r:  1 },
  { q:  3, r:  1 },
  { q: -4, r:  2 },
  { q:  2, r:  2 },
  { q: -4, r:  3 },
  { q:  1, r:  3 },
  { q: -4, r:  4 },
  { q: -3, r:  4 },
  { q: -2, r:  4 },
  { q: -1, r:  4 },
  { q:  0, r:  4 },
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

const ANAGRAMATON_DICTIONARY = [
  ...wordList_4, ...wordList_5, ...wordList_6, ...wordList_7,
  ...wordList_8, ...wordList_9, ...wordList_10, ...wordList_11,
  ...wordList_12, ...wordList_13, ...wordList_14, ...wordList_15,
  ...wordList_16plus,
].map(w => String(w || '').toUpperCase());

function wordScore(word) {
  let score = 0;
  for (const ch of word) score += LETTER_POINTS[ch] || 1;
  return score * Math.max(4, word.length);
}

function chooseTargetWords(rng) {
  const candidates = ANAGRAMATON_DICTIONARY.filter(w => {
    const len = w.length;
    return len >= 5 && len <= 14 && /^[A-Z]+$/.test(w);
  });
  const shuffledCandidates = shuffled(candidates, rng);
  const shortCount = 2 + Math.floor(rng() * 2);
  return shuffledCandidates.slice(0, 7 + shortCount);
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
        { allowZigZag: true, preferOverlap: false, maxStraight: 3, wallBuffer: 0, maxEdgeRun: 2 },
      );
      if (!path) continue;
      const normalizedPath = path.map(c => ({ ...c, key: coordKey(c) }));

      const overlap = pathOverlap(normalizedPath, grid, word);
      const newTiles = normalizedPath.length - overlap;
      const ringDepths = normalizedPath.map(c => Math.max(Math.abs(c.q), Math.abs(c.r), Math.abs(c.q + c.r)));
      const maxRing = ringDepths.reduce((m, v) => Math.max(m, v), 0);
      const minRing = ringDepths.reduce((m, v) => Math.min(m, v), Infinity);
      const avgRing = ringDepths.reduce((sum, v) => sum + v, 0) / Math.max(1, ringDepths.length);
      const ringSpread = maxRing - minRing;
      const metric = (newTiles * 28) + (avgRing * 10) + (ringSpread * 14) - (overlap * 8);
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
      ANAGRAMATON_DICTIONARY.filter(w => w.length >= 5 && w.length <= 8 && /^[A-Z]+$/.test(w)),
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

/**
 * DFS to check if `word` can be traced as a connected adjacent path in simGrid,
 * with no tile reused. simGrid values are { letter, ... } objects.
 *
 * @param {string} word
 * @param {Object} simGrid - { [hexKey]: { letter, ... } }
 * @param {number} radius
 * @returns {boolean}
 */
function wordExistsInGrid(word, simGrid, radius) {
  function dfs(idx, q, r, visited) {
    if (idx === word.length) return true;
    const key = hexKey(q, r);
    if (visited.has(key)) return false;
    const entry = simGrid[key];
    if (!entry || entry.letter !== word[idx]) return false;
    visited.add(key);
    for (const [dq, dr] of ADJ_DIRS) {
      if (dfs(idx + 1, q + dq, r + dr, visited)) return true;
    }
    visited.delete(key);
    return false;
  }
  for (const key of Object.keys(simGrid)) {
    if (simGrid[key]?.letter !== word[0]) continue;
    const [q, r] = key.split(',').map(Number);
    if (dfs(0, q, r, new Set())) return true;
  }
  return false;
}

/**
 * DFS to find `word` as a connected adjacent path in simGrid.
 * On success, deletes the matched tiles from simGrid and returns true.
 * simGrid values are { letter, ... } objects.
 *
 * @param {string} word
 * @param {Object} simGrid - { [hexKey]: { letter, ... } } — modified in place on success
 * @param {number} radius
 * @returns {boolean}
 */
function removeWordFromGrid(word, simGrid, radius) {
  function dfs(idx, q, r, visited, path) {
    if (idx === word.length) return path.slice();
    const key = hexKey(q, r);
    if (visited.has(key)) return null;
    const entry = simGrid[key];
    if (!entry || entry.letter !== word[idx]) return null;
    visited.add(key);
    path.push(key);
    for (const [dq, dr] of ADJ_DIRS) {
      const result = dfs(idx + 1, q + dq, r + dr, visited, path);
      if (result) return result;
    }
    path.pop();
    visited.delete(key);
    return null;
  }
  for (const key of Object.keys(simGrid)) {
    if (simGrid[key]?.letter !== word[0]) continue;
    const [q, r] = key.split(',').map(Number);
    const path = dfs(0, q, r, new Set(), []);
    if (path) {
      for (const k of path) delete simGrid[k];
      return true;
    }
  }
  return false;
}

/**
 * Validates that all words in `placements` can be found and removed in sequence
 * on the word-only grid after applying correct SE/SW gravity after each removal.
 *
 * @param {Array}  placements - Array of { word } objects (the target words)
 * @param {Object} startGrid  - Plain { [hexKey]: letter } word grid (before fillEmptyTiles)
 * @param {number} radius
 * @returns {string[]|null} Ordered word sequence if all words are reachable, or null
 */
function findGravityPlaySequence(placements, startGrid, radius = GRID_RADIUS) {
  // Convert plain { [key]: letter } to { [key]: { letter } } for gravity/DFS helpers
  const simGrid = {};
  for (const [key, letter] of Object.entries(startGrid)) {
    simGrid[key] = { letter };
  }

  const remaining = placements.map(p => p.word);
  const sequence = [];
  const maxRounds = placements.length * 3;
  let rounds = 0;

  while (remaining.length > 0 && rounds < maxRounds) {
    rounds++;
    let found = false;
    for (let i = 0; i < remaining.length; i++) {
      const word = remaining[i];
      if (wordExistsInGrid(word, simGrid, radius)) {
        removeWordFromGrid(word, simGrid, radius);
        applyGravity(simGrid, radius);
        sequence.push(word);
        remaining.splice(i, 1);
        found = true;
        break;
      }
    }
    if (!found) return null;
  }

  if (remaining.length > 0) return null;
  return sequence;
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

  // ── PORTALS: placed FIRST so no other tile type can occupy these positions ──
  // Pick one entry and one exit at random from the fixed perimeter pools.
  const entryPool = shuffled(DAILY_PORTAL_ENTRY_CORNERS.filter(c => !!grid[hexKey(c.q, c.r)]), rng);
  const exitPool  = shuffled(DAILY_PORTAL_EXIT_CORNERS.filter(c => !!grid[hexKey(c.q, c.r)]), rng);
  const chosenEntry = entryPool[0];
  const chosenExit  = exitPool[0];
  if (chosenEntry) {
    specials.push({ type: 'portal', role: 'entry', q: chosenEntry.q, r: chosenEntry.r });
    taken.add(hexKey(chosenEntry.q, chosenEntry.r));
  }
  if (chosenExit) {
    specials.push({ type: 'portal', role: 'exit', q: chosenExit.q, r: chosenExit.r });
    taken.add(hexKey(chosenExit.q, chosenExit.r));
  }

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

  // ── DIGRAPHS: unique strings, capped at 5 tiles maximum ──────────
  const DAILY_MAX_DIGRAPHS = 5;
  const shuffledDigraphs = shuffled(DAILY_DIGRAPH_OPTIONS, rng);
  const digraphCandidates = allCoords.map(c => ({
    ...c,
    weight: (longPathCoords.has(c.key) ? 14 : 0) + (pathDensity.get(c.key) || 0),
  }));
  const strategicDigraphSlots = digraphCandidates.filter(c => c.weight > 0).length;
  const maxDigraphCount = Math.min(DAILY_MAX_DIGRAPHS, shuffledDigraphs.length, Math.max(0, strategicDigraphSlots));
  const minDigraphCount = Math.min(3, maxDigraphCount);
  const digraphCount = maxDigraphCount > 0
    ? minDigraphCount + Math.floor(rng() * (maxDigraphCount - minDigraphCount + 1))
    : 0;
  const chosenDigraphs = shuffledDigraphs.slice(0, digraphCount);
  for (const dg of chosenDigraphs) {
    placeType('digraph', digraphCandidates, 1, { digraph: dg });
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
  for (const rawWord of ANAGRAMATON_DICTIONARY) {
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
  _simTrie = trie;
  return trie;
}

/**
 * Applies gravity to the simulation grid using the same SE/SW diagonal cascade
 * as the actual game in hexacore.js:
 *   - Each pass sorts all occupied tiles by descending r (bottom-first)
 *   - Each tile tries SE (q, r+1) first, then SW (q-1, r+1)
 *   - All moves per pass are collected atomically then applied
 *   - Repeats until no tile can move
 *
 * @param {Object} simGrid - { [hexKey]: any } — modified in place
 * @param {number} radius  - board radius (default GRID_RADIUS)
 */
function applyGravity(simGrid, radius = GRID_RADIUS) {
  let anyMoved = true;
  while (anyMoved) {
    anyMoved = false;
    const entries = Object.keys(simGrid)
      .map(key => { const [q, r] = key.split(',').map(Number); return { q, r, key }; })
      .sort((a, b) => b.r - a.r);

    const moves = [];
    const plannedDests = new Set();

    for (const { q, r, key } of entries) {
      const seKey = hexKey(q,     r + 1);
      const swKey = hexKey(q - 1, r + 1);
      const seOk  = isValidCoord(q,     r + 1, radius) && !simGrid[seKey] && !plannedDests.has(seKey);
      const swOk  = isValidCoord(q - 1, r + 1, radius) && !simGrid[swKey] && !plannedDests.has(swKey);

      if (seOk) {
        moves.push({ from: key, to: seKey, value: simGrid[key] });
        plannedDests.add(seKey);
        anyMoved = true;
      } else if (swOk) {
        moves.push({ from: key, to: swKey, value: simGrid[key] });
        plannedDests.add(swKey);
        anyMoved = true;
      }
    }
    for (const { from, to, value } of moves) {
      delete simGrid[from];
      simGrid[to] = value;
    }
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
 * @returns {{ maxScore, optimalMoves, averageWordLength, gemDensity, solutionPath, tilesCleared, tilesRemaining, clearancePercent, fullyCleared }}
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
  const totalTiles = getAllCoords(radius).length;

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
  const tilesRemaining = Object.keys(simGrid).length;
  const tilesCleared = Math.max(0, totalTiles - tilesRemaining);
  const clearancePercent = totalTiles > 0 ? Math.round((tilesCleared / totalTiles) * 1000) / 10 : 0;
  return {
    maxScore: totalScore,
    optimalMoves: solutionPath.length,
    averageWordLength: solutionPath.length > 0 ? Math.round((totalWordLen / solutionPath.length) * 10) / 10 : 0,
    gemDensity: totalTiles > 0 ? Math.round((gemCount / totalTiles) * 1000) / 1000 : 0,
    tilesCleared,
    tilesRemaining,
    clearancePercent,
    fullyCleared: tilesRemaining === 0,
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

function isCommonWord(word) {
  const upper = String(word || '').toUpperCase();
  if (!upper) return false;

  const rareCount = [...upper].filter(ch => ['Q', 'Z', 'X'].includes(ch)).length;
  if (rareCount > 2) return false;

  const archaic = ['ETH', 'EST'];
  if (archaic.some(suffix => upper.endsWith(suffix) && upper.length > 6)) return false;

  const technical = ['LEUKO', 'HEMATO', 'CARDIO', 'NEPHRO', 'OSTEO', 'CYTO'];
  if (technical.some(prefix => upper.startsWith(prefix))) return false;

  return true;
}

function getQuadrant(q, r) {
  if (q >= 2 && r <= -2) return 'upper-right';
  if (q >= 2 && r >= 2) return 'lower-right';
  if (q <= -2 && r <= -2) return 'upper-left';
  if (q <= -2 && r >= 2) return 'lower-left';
  if (r <= -2) return 'top';
  if (r >= 2) return 'bottom';
  return 'center';
}

function formatSpecialName(type) {
  if (!type) return '';
  if (type === 'prism') return 'purple prism';
  if (type === 'portal') return 'portal';
  if (type === 'rune') return 'rune';
  if (type === 'amethyst') return 'amethyst';
  if (type === 'digraph') return 'digraph';
  if (type.startsWith('gem')) return type.replace(/^gem/, '').replace(/([A-Z])/g, ' $1').trim().toLowerCase();
  return type.toLowerCase();
}

function generatePositionalClue(word, path, grid, specialTiles) {
  if (!Array.isArray(path) || path.length === 0) return `${word.length}-letter word near the center lanes`;
  const specialsByKey = new Map((specialTiles || []).map(s => [hexKey(s.q, s.r), s]));
  const hitSpecials = path.map(c => specialsByKey.get(c.key)).filter(Boolean);

  const digraphTile = hitSpecials.find(s => s.type === 'digraph' && s.digraph);
  if (digraphTile) {
    return `A ${word.length}-letter word uses the ${String(digraphTile.digraph).toUpperCase()} digraph tile`;
  }

  if (hitSpecials.some(s => s.type === 'prism')) {
    return `A ${word.length}-letter word routes through the purple prism`;
  }

  const gemTile = hitSpecials.find(s => s.type && s.type.startsWith('gem'));
  if (gemTile) {
    return `A ${word.length}-letter word passes through the ${formatSpecialName(gemTile.type)} gem`;
  }

  const start = path[0];
  const end = path[path.length - 1];
  const startQuadrant = getQuadrant(start.q, start.r);
  const endQuadrant = getQuadrant(end.q, end.r);
  if (startQuadrant === endQuadrant) {
    return `A ${word.length}-letter word sits in the ${startQuadrant} quadrant`;
  }
  return `A ${word.length}-letter word runs from ${startQuadrant} toward ${endQuadrant}`;
}

function detectCompound(word) {
  const starts = ['BACK', 'OVER', 'UNDER', 'OUT', 'UP', 'DOWN', 'AFTER', 'FORE', 'SIDE', 'HAND', 'HOME', 'WORK'];
  const ends = ['ING', 'ED', 'ER', 'LY', 'SHIP', 'TIME', 'WORK', 'BOARD', 'LINE', 'WARD', 'HOUSE', 'LIKE'];
  const upper = String(word || '').toUpperCase();
  if (upper.length < 8) return false;
  return starts.some(start => upper.startsWith(start)) || ends.some(end => upper.endsWith(end));
}

function generateCategoryClue(word) {
  const upper = String(word || '').toUpperCase();
  if (detectCompound(upper)) return `A compound-style word — ${upper.length} letters`;
  if (/(ING|ED|IFY|IZE|ISE)$/.test(upper)) return `An action verb form — ${upper.length} letters`;
  if (/(OUS|FUL|LESS|ABLE|IBLE|AL|IVE|IC|ARY)$/.test(upper)) return `A descriptive adjective — ${upper.length} letters`;
  if (/(TION|SION|MENT|NESS|ITY|ISM|SHIP)$/.test(upper)) return `An abstract noun — ${upper.length} letters`;
  if (/(ER|OR|IST|IAN)$/.test(upper)) return `A role/profession-style word — ${upper.length} letters`;
  return `A familiar everyday word — ${upper.length} letters`;
}

function generateDefinitionClue(word) {
  const upper = String(word || '').toUpperCase();
  if (upper.startsWith('UN')) return `Something described as "not" or reversed (${upper.length} letters)`;
  if (upper.startsWith('RE')) return `A word related to doing something again (${upper.length} letters)`;
  if (upper.endsWith('ING')) return `A present-participle action word ending in -ING`;
  if (upper.endsWith('NESS')) return `A quality/state noun ending in -NESS`;
  if (upper.endsWith('TION') || upper.endsWith('SION')) return `A concept noun ending in -TION/-SION`;
  if (upper.endsWith('LY')) return `A modifier/adverb style word ending in -LY`;
  if (upper.endsWith('MENT')) return `A result/state noun ending in -MENT`;
  const vowels = [...upper].filter(ch => 'AEIOU'.includes(ch)).length;
  return `Pattern hint: ${upper.length} letters with ${vowels} vowel${vowels === 1 ? '' : 's'}`;
}

function generateProgressiveReveal(word, revealLevel) {
  const upper = String(word || '').toUpperCase();
  const len = upper.length;
  if (!len) return '';
  if (len <= 2) return upper;

  if (revealLevel === 0) {
    return `${upper[0]}${'_'.repeat(Math.max(0, len - 2))}${upper[len - 1]}`;
  }
  if (revealLevel === 1) {
    if (len <= 4) return upper;
    return `${upper.slice(0, 2)}${'_'.repeat(Math.max(0, len - 4))}${upper.slice(-2)}`;
  }
  if (revealLevel === 2) {
    return [...upper].map(ch => ('AEIOU'.includes(ch) ? ch : '_')).join('');
  }
  if (revealLevel === 3) {
    return [...upper].map((ch, i) => (i % 2 === 0 ? ch : '_')).join('');
  }
  if (revealLevel === 4) {
    return `${upper.slice(0, -1)}_`;
  }
  return upper;
}

function generateFeatureHints(path, specialTiles) {
  const specialsByKey = new Map((specialTiles || []).map(s => [hexKey(s.q, s.r), s]));
  const hitSpecials = (path || []).map(c => specialsByKey.get(c.key)).filter(Boolean);
  if (hitSpecials.length === 0) return [];

  const out = [];
  const gemHits = hitSpecials.filter(s => s.type && s.type.startsWith('gem'));
  const uniqueGems = [...new Set(gemHits.map(s => s.type))];
  const digraphHits = hitSpecials.filter(s => s.type === 'digraph');
  const portalHits = hitSpecials.filter(s => s.type === 'portal').length;

  if (hitSpecials.some(s => s.type === 'prism')) out.push('Uses prism for 2× multiplier');
  if (uniqueGems.length >= 2) out.push('Chains multiple gems');
  else if (uniqueGems.length === 1) out.push(`Uses ${formatSpecialName(uniqueGems[0])} gem`);
  if (digraphHits.length > 0) out.push(`Uses ${digraphHits.length} digraph tile${digraphHits.length === 1 ? '' : 's'}`);
  if (portalHits >= 2) out.push('Traverses both portal tiles');
  else if (portalHits === 1) out.push('Uses a portal tile');

  return out;
}

function generateOptimalPathClues(optimalSolutions, placements, grid, specialTiles) {
  const bestStrategy = Array.isArray(optimalSolutions) ? optimalSolutions[0] : null;
  if (!bestStrategy || !Array.isArray(bestStrategy.words)) return null;
  const specialsByKey = new Map((specialTiles || []).map(s => [hexKey(s.q, s.r), s.type]));

  const clues = bestStrategy.words.map((word, idx) => {
    const placement = placements.find(p => p.word === word);
    if (!placement) return null;
    const estimatedPoints = Math.round(
      placement.estimatedScore
      || estimatePathScore(placement.word, placement.path, specialsByKey)
      || 0,
    );

    return {
      wordIndex: idx + 1,
      length: word.length,
      estimatedPoints,
      positional: generatePositionalClue(word, placement.path, grid, specialTiles),
      category: generateCategoryClue(word),
      hints: [
        { level: 1, text: generateDefinitionClue(word) },
        { level: 2, text: generateProgressiveReveal(word, 0) },
        { level: 3, text: generateProgressiveReveal(word, 1) },
        { level: 4, text: generateProgressiveReveal(word, 2) },
        { level: 5, text: generateProgressiveReveal(word, 4) },
      ],
      features: generateFeatureHints(placement.path, specialTiles),
    };
  }).filter(Boolean);

  return {
    strategy: 'optimal',
    targetScore: bestStrategy.finalScore,
    wordCount: bestStrategy.words.length,
    clues,
  };
}

function computeStrategies(placements, specialsByKey, grid) {
  const commonPlacements = placements.filter(p => isCommonWord(p.word));
  const workingSet = commonPlacements.length >= 6 ? commonPlacements : placements;
  const scored = workingSet.map(p => ({ ...p, estimatedScore: estimatePathScore(p.word, p.path, specialsByKey) }));

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

  const rotatingGemCount = DAILY_ROTATING_GEM_TYPES.reduce((sum, type) => sum + (typeCounts.get(type) || 0), 0);
  if (rotatingGemCount !== 1) return { valid: false, reason: 'expected exactly 1 rotating gem (emerald or gold)' };

  const rotatingSpecialCount = DAILY_ROTATING_RUNE_TYPES.reduce((sum, type) => sum + (typeCounts.get(type) || 0), 0);
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
  let bestBoard = null;
  let bestClearance = -1;
  let bestScore = -1;
  let bestValidatedBoard = null;   // board with a confirmed gravity play sequence
  let bestValidatedClearance = -1;
  let bestValidatedScore = -1;

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

    // Validate that all designed words can be cleared in sequence using correct SE/SW gravity.
    // Boards that pass this check are strongly preferred; others are kept as fallbacks.
    const gravitySequence = findGravityPlaySequence(placements, grid, radius);
    if (!gravitySequence) {
      lastFailure = 'no valid gravity-aware play sequence';
    }

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
        optimalPathClues: generateOptimalPathClues(validation.strategies, placements, grid, specialTiles),
        difficulty,
        optimalMoves: simData?.optimalMoves ?? null,
        averageWordLength: simData?.averageWordLength ?? null,
        gemDensity: simData?.gemDensity ?? null,
        tilesCleared: simData?.tilesCleared ?? null,
        tilesRemaining: simData?.tilesRemaining ?? null,
        tileClearancePercent: simData?.clearancePercent ?? null,
        fullClear: simData?.fullyCleared ?? null,
        solutionPath: simData?.solutionPath ?? null,
        gravitySequence,
        generatedAt: new Date().toISOString(),
      },
    };
    if (includePlacements) board.placements = placements;

    const attemptClearance = simData?.clearancePercent ?? 0;
    const attemptScore = maxPossibleScore;

    if (gravitySequence) {
      // Prefer boards with confirmed gravity play sequences
      if (
        !bestValidatedBoard
        || attemptClearance > bestValidatedClearance
        || (attemptClearance === bestValidatedClearance && attemptScore > bestValidatedScore)
      ) {
        bestValidatedBoard = board;
        bestValidatedClearance = attemptClearance;
        bestValidatedScore = attemptScore;
      }
    }

    if (
      !bestBoard
      || attemptClearance > bestClearance
      || (attemptClearance === bestClearance && attemptScore > bestScore)
    ) {
      bestBoard = board;
      bestClearance = attemptClearance;
      bestScore = attemptScore;
    }
  }

  // Return a gravity-validated board if one was found; otherwise fall back to best available
  if (bestValidatedBoard) return bestValidatedBoard;
  if (bestBoard) return bestBoard;
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
