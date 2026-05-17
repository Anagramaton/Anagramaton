import { GRID_RADIUS } from './constants.js';
import { getAllCoords, hexKey, ADJ_DIRS, isValidCoord } from './gridCoords.js';
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

function generateLetterGrid(rng, radius = GRID_RADIUS) {
  const coords = shuffled(getAllCoordsWithKeys(radius), rng);
  const grid = {};
  for (const c of coords) {
    grid[c.key] = LETTER_POOL[Math.floor(rng() * LETTER_POOL.length)];
  }

  const vowels = ['A', 'E', 'I', 'O', 'U'];
  const consonants = ['R', 'S', 'T', 'L', 'N', 'D', 'H', 'G', 'Y', 'C', 'M', 'P'];
  const isVowel = letter => vowels.includes(letter);
  const minVowels = Math.floor(coords.length * 0.30);
  const maxVowels = Math.ceil(coords.length * 0.44);

  const adjustVowelBalance = () => {
    let vowelCount = coords.reduce((sum, c) => sum + (isVowel(grid[c.key]) ? 1 : 0), 0);
    if (vowelCount < minVowels) {
      const toConvert = shuffled(coords.filter(c => !isVowel(grid[c.key])), rng);
      while (vowelCount < minVowels && toConvert.length > 0) {
        const c = toConvert.pop();
        grid[c.key] = vowels[Math.floor(rng() * vowels.length)];
        vowelCount += 1;
      }
    } else if (vowelCount > maxVowels) {
      const toConvert = shuffled(coords.filter(c => isVowel(grid[c.key])), rng);
      while (vowelCount > maxVowels && toConvert.length > 0) {
        const c = toConvert.pop();
        grid[c.key] = consonants[Math.floor(rng() * consonants.length)];
        vowelCount -= 1;
      }
    }
  };

  adjustVowelBalance();

  for (const c of coords) {
    const near = neighbors(c.q, c.r, radius);
    const nearLetters = near.map(n => grid[n.key]).filter(Boolean);
    const nearVowels = nearLetters.filter(isVowel).length;
    if (nearVowels === 0 && !isVowel(grid[c.key]) && rng() < 0.35) {
      grid[c.key] = vowels[Math.floor(rng() * vowels.length)];
    }
  }
  adjustVowelBalance();
  return grid;
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

function placeSpecialTiles(grid, rng, radius = GRID_RADIUS, date = '') {
  const specials = [];
  const taken = new Set();
  const allCoords = getAllCoordsWithKeys(radius);
  const dateSeed = fnv1a32(String(date || ''));
  const isVowel = ch => 'AEIOU'.includes(ch || '');
  const ringDepth = c => Math.max(Math.abs(c.q), Math.abs(c.r), Math.abs(c.q + c.r));

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

  const localDensity = new Map();
  const localVowels = new Map();
  const nearHighValue = new Map();
  for (const c of allCoords) {
    const n = neighbors(c.q, c.r, radius);
    const around = [c, ...n];
    const vowelCount = around.reduce((sum, cell) => sum + (isVowel(grid[cell.key]) ? 1 : 0), 0);
    const highCount = around.reduce((sum, cell) => sum + (HIGH_VALUE_LETTERS.has(grid[cell.key]) ? 1 : 0), 0);
    localVowels.set(c.key, vowelCount);
    nearHighValue.set(c.key, highCount);
    localDensity.set(c.key, around.length + (radius - ringDepth(c)));
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

  // ── 1 · PRISM — central/high-connectivity anchor ──────────────────
  const prismCandidates = allCoords
    .map(c => {
      const ring = ringDepth(c);
      if (ring > radius - 1) return null;
      return {
        ...c,
        weight: ((radius - ring) * 10) + (localDensity.get(c.key) || 0) + (localVowels.get(c.key) || 0),
      };
    })
    .filter(Boolean);
  placeType('prism', prismCandidates, 1);

  // ── Rotating rune candidate pool: near high-value letters ────────
  const runeCandidates = allCoords
    .map(c => {
      const highNear = nearHighValue.get(c.key) || 0;
      if (highNear <= 0) return null;
      return { ...c, weight: (highNear * 20) + (localDensity.get(c.key) || 0) };
    })
    .filter(Boolean);
  // ── Rotating gem candidate pool ───────────────────────────────────
  const vowelRichness = coord => getCoordsWithinRadius(coord, 2, radius)
    .reduce((sum, cell) => sum + (isVowel(grid[cell.key]) ? 1 : 0), 0);

  const gemCandidates = allCoords.map(c => {
    const key = c.key;
    const ring = ringDepth(c);
    return {
      ...c,
      vowels: vowelRichness(c),
      density: localDensity.get(key) || 0,
      ring,
      highNear: nearHighValue.get(key) || 0,
    };
  });

  // ── ROTATE 1 EMERALD OR 1 GOLD ────────────────────────────────────
  const chosenGem = DAILY_ROTATING_GEM_TYPES[dateSeed % DAILY_ROTATING_GEM_TYPES.length];
  const chosenGemMultiplier = GEM_MULTIPLIERS[chosenGem] || 1;
  const gemPlacementCandidates = gemCandidates
    .map(c => ({
      ...c,
      weight: (c.density * chosenGemMultiplier) + c.vowels + ((radius - c.ring) * 5) + c.highNear,
    }));
  placeType(chosenGem, gemPlacementCandidates, 1);

  // ── ROTATE 1 RUNE OR 1 AMETHYST ───────────────────────────────────
  const chosenRotatingSpecial = DAILY_ROTATING_RUNE_TYPES[(dateSeed >>> 1) % DAILY_ROTATING_RUNE_TYPES.length];
  const denseCandidates = allCoords.map(c => ({ ...c, weight: localDensity.get(c.key) || 0 }));
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
    weight: (localDensity.get(c.key) || 0) + (isVowel(grid[c.key]) ? 0 : 3) + ((radius - ringDepth(c)) * 2),
  }));
  const strategicDigraphSlots = digraphCandidates.filter(c => c.weight > 2).length;
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

export function validateDailyBoard({ grid, specialTiles, radius = GRID_RADIUS }) {
  const allCoords = getAllCoordsWithKeys(radius);
  for (const c of allCoords) {
    const letter = grid[c.key];
    if (!/^[A-Z]$/.test(letter || '')) {
      return { valid: false, reason: `invalid or missing tile letter at ${c.key}` };
    }
  }

  if (Object.keys(grid).length !== allCoords.length) {
    return { valid: false, reason: `expected ${allCoords.length} filled tiles, got ${Object.keys(grid).length}` };
  }

  const occupiedSpecialKeys = new Set();
  for (const s of specialTiles) {
    if (!isValidCoord(s.q, s.r, radius)) return { valid: false, reason: `special tile out of bounds: ${s.type}` };
    const key = hexKey(s.q, s.r);
    if (!grid[key]) return { valid: false, reason: `special tile on empty coordinate: ${s.type}` };
    if (occupiedSpecialKeys.has(key)) return { valid: false, reason: `multiple specials on same tile: ${key}` };
    occupiedSpecialKeys.add(key);
  }

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

  return {
    valid: true,
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

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const effectiveAttempt = attempt + (Number(attemptSeedOffset) || 0);
    const rng = mkSeededRng((seed + effectiveAttempt * 9973) >>> 0);

    const grid = generateLetterGrid(rng, radius);
    const specialTiles = placeSpecialTiles(grid, rng, radius, date);

    const validation = validateDailyBoard({ grid, specialTiles, radius });
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

    const maxPossibleScore = simData?.maxScore ?? 0;
    const difficulty = classifyDifficulty(maxPossibleScore);

    const board = {
      date,
      grid,
      specialTiles,
      metadata: {
        maxPossibleScore,
        difficulty,
        optimalMoves: simData?.optimalMoves ?? null,
        averageWordLength: simData?.averageWordLength ?? null,
        gemDensity: simData?.gemDensity ?? null,
        tilesCleared: simData?.tilesCleared ?? null,
        tilesRemaining: simData?.tilesRemaining ?? null,
        tileClearancePercent: simData?.clearancePercent ?? null,
        fullClear: simData?.fullyCleared ?? null,
        solutionPath: simData?.solutionPath ?? null,
        generatedAt: new Date().toISOString(),
      },
    };
    if (includePlacements) board.placements = [];

    const attemptClearance = simData?.clearancePercent ?? 0;
    const attemptScore = maxPossibleScore;
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
