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

const LETTER_POOL = [
  ...Array(12).fill('E'), ...Array(9).fill('A'), ...Array(8).fill('I'), ...Array(8).fill('O'), ...Array(4).fill('U'),
  ...Array(7).fill('R'), ...Array(7).fill('S'), ...Array(7).fill('T'), ...Array(6).fill('L'), ...Array(6).fill('N'),
  ...Array(4).fill('D'), ...Array(4).fill('H'), ...Array(4).fill('G'), ...Array(4).fill('Y'),
  ...Array(3).fill('C'), ...Array(3).fill('M'), ...Array(3).fill('P'), ...Array(2).fill('B'), ...Array(2).fill('F'), ...Array(2).fill('V'), ...Array(2).fill('W'),
  'K', 'J', 'Q', 'X', 'Z',
];


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

function placeSpecialTiles(grid, rng, radius = GRID_RADIUS) {
  const specials = [];
  const taken = new Set();
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

  // Helper: pick count random unoccupied tiles and push specials of a given type.
  const pickRandom = (type, count, extra = {}) => {
    const pool = shuffled(allCoords.filter(c => !taken.has(c.key) && !!grid[c.key]), rng);
    for (let i = 0; i < count && i < pool.length; i++) {
      specials.push({ type, q: pool[i].q, r: pool[i].r, ...extra });
      taken.add(pool[i].key);
    }
  };

  // ── PRISM ─────────────────────────────────────────────────────────
  pickRandom('prism', 1);

  // ── ROTATE 1 EMERALD OR 1 GOLD ────────────────────────────────────
  pickRandom(shuffled(DAILY_ROTATING_GEM_TYPES, rng)[0], 1);

  // ── ROTATE 1 RUNE OR 1 AMETHYST ───────────────────────────────────
  pickRandom(shuffled(DAILY_ROTATING_RUNE_TYPES, rng)[0], 1);

  // ── DIGRAPHS: 3–5 random unoccupied tiles, unique digraph strings ─
  const DAILY_MIN_DIGRAPHS = 3;
  const DAILY_MAX_DIGRAPHS = 5;
  const digraphCount = DAILY_MIN_DIGRAPHS + Math.floor(rng() * (DAILY_MAX_DIGRAPHS - DAILY_MIN_DIGRAPHS + 1));
  const shuffledDigraphs = shuffled(DAILY_DIGRAPH_OPTIONS, rng);
  const digraphPool = shuffled(allCoords.filter(c => !taken.has(c.key) && !!grid[c.key]), rng);
  const actualDigraphCount = Math.min(digraphCount, shuffledDigraphs.length, digraphPool.length);
  for (let i = 0; i < actualDigraphCount; i++) {
    specials.push({ type: 'digraph', q: digraphPool[i].q, r: digraphPool[i].r, digraph: shuffledDigraphs[i] });
    taken.add(digraphPool[i].key);
  }

  return specials;
}

// ─── Maximum Score Simulation ────────────────────────────────────────────────

/**
 * Lazily-built trie for fast DFS word search during simulation.
 * Only populated on first call to simulateMaxScore (not at module load time).
 * Words of length 5-11 from the combined word lists.
 */
let _simTrie = null;
const SIM_MIN_LEN = 5;
const SIM_MAX_LEN = 13;

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

      // Digraph tiles contribute two characters but occupy a single tile.
      // Traverse two trie steps for one tile so the simulation finds words that
      // are actually playable on the board.
      let nextNode;
      if (letter.length === 2) {
        if (word.length + 2 > SIM_MAX_LEN) continue;
        const mid = trieNode[letter[0]];
        if (!mid) continue;
        nextNode = mid[letter[1]];
        if (!nextNode) continue;
      } else {
        nextNode = trieNode[letter];
        if (!nextNode) continue; // Trie pruning — no words down this branch
      }

      visited.add(nkey);
      path.push({ key: nkey, q: nq, r: nr });
      dfs(nq, nr, nextNode, word + letter, path, visited);
      path.pop();
      visited.delete(nkey);
    }
  }

  for (const [key, cell] of Object.entries(simGrid)) {
    if (results.length >= maxResults) break;
    if (!cell) continue;
    const letter = cell.letter.toUpperCase();

    let trieRoot;
    if (letter.length === 2) {
      // Digraph starting tile: advance through both characters to find the trie entry point
      const mid = trie[letter[0]];
      if (!mid) continue;
      trieRoot = mid[letter[1]];
      if (!trieRoot) continue;
    } else {
      trieRoot = trie[letter];
      if (!trieRoot) continue;
    }

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
 * @returns {{ maxScore, optimalMoves, averageWordLength, gemDensity, solutionPath, solutionDetail, tilesCleared, tilesRemaining, clearancePercent, fullyCleared }}
 */
function cloneSimGrid(simGrid) {
  const copy = {};
  for (const [k, v] of Object.entries(simGrid)) copy[k] = { ...v };
  return copy;
}

export function simulateMaxScore(grid, specialTiles, radius = GRID_RADIUS, maxRounds = MAX_SIMULATION_ROUNDS) {
  // Build a combined simulation grid: { [key]: { letter, special } }
  const baseSimGrid = {};
  for (const [key, letter] of Object.entries(grid)) {
    baseSimGrid[key] = { letter, special: null };
  }
  for (const s of specialTiles) {
    const key = hexKey(s.q, s.r);
    if (baseSimGrid[key]) {
      baseSimGrid[key].special = s.type;
      // Use the actual digraph string so the simulation finds words that are
      // genuinely playable on the board (digraph tiles replace the single letter
      // that the raw grid stores at that position).
      if (s.type === 'digraph' && s.digraph) {
        baseSimGrid[key].letter = String(s.digraph).toUpperCase();
      }
    }
  }

  const gemCount = specialTiles.filter(s => GEM_MULTIPLIERS[s.type]).length;
  const totalTiles = getAllCoords(radius).length;

  /**
   * Runs one greedy pass with the given sort function applied to paths each round.
   * @param {Function} sortFn - Comparator for paths array before picking paths[0]
   */
  function runPass(sortFn) {
    const simGrid = cloneSimGrid(baseSimGrid);
    let totalScore = 0;
    const solutionPath = [];
    const solutionDetail = [];
    let round = 0;

    while (round < maxRounds) {
      round++;
      const paths = findAllValidPaths(simGrid, radius);
      if (paths.length === 0) break;

      paths.sort(sortFn);
      const best = paths[0];

      totalScore += best.score;
      solutionPath.push(best.word);
      solutionDetail.push({ word: best.word, score: best.score, tilesUsed: best.path.length });

      for (const cell of best.path) {
        delete simGrid[cell.key];
      }

      applyGravity(simGrid, radius);
    }

    return { simGrid, totalScore, solutionPath, solutionDetail };
  }

  // Pass 1: highest raw score first (original behaviour)
  const pass1 = runPass((a, b) => b.score - a.score);

  // Pass 2: efficiency-first — highest score-per-tile
  const pass2 = runPass((a, b) => (b.score / b.path.length) - (a.score / a.path.length));

  // Pass 3: longest word first — maximises gravity disruption
  const pass3 = runPass((a, b) => b.path.length - a.path.length);

  // Pass 4: prioritise words that touch a special tile, then by score
  const pass4 = runPass((a, b) => {
    const aHasSpecial = a.path.some(c => baseSimGrid[c.key]?.special);
    const bHasSpecial = b.path.some(c => baseSimGrid[c.key]?.special);
    if (aHasSpecial !== bHasSpecial) return aHasSpecial ? -1 : 1;
    return b.score - a.score;
  });

  // Compute finalScore (word total minus estimated penalty) for each pass and pick the best
  const allLetterPointsBase = Object.values(grid).filter(l => /^[A-Z]$/.test(l)).map(l => LETTER_POINTS[l] || 1);
  const avgPointBase = allLetterPointsBase.length > 0
    ? allLetterPointsBase.reduce((s, v) => s + v, 0) / allLetterPointsBase.length
    : 2;

  function computeFinalScore(pass) {
    const tilesUncovered = Object.keys(pass.simGrid).length;
    const allLetterPoints = Object.values(pass.simGrid).map(c => LETTER_POINTS[c.letter] || 1);
    const avgPoint = allLetterPoints.length > 0
      ? allLetterPoints.reduce((s, v) => s + v, 0) / allLetterPoints.length
      : avgPointBase;
    const penalty = Math.round(tilesUncovered * avgPoint);
    return Math.max(0, pass.totalScore - penalty);
  }

  const passes = [pass1, pass2, pass3, pass4];
  let bestPass = passes[0];
  let bestFinalScore = computeFinalScore(passes[0]);
  for (let i = 1; i < passes.length; i++) {
    const fs = computeFinalScore(passes[i]);
    if (fs > bestFinalScore) {
      bestFinalScore = fs;
      bestPass = passes[i];
    }
  }

  const { simGrid: finalSimGrid, totalScore, solutionPath, solutionDetail } = bestPass;
  const totalWordLen = solutionPath.reduce((s, w) => s + w.length, 0);
  const tilesRemaining = Object.keys(finalSimGrid).length;
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
    solutionDetail,
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

export function generateOptimalPathClues(optimalSolutions, grid, specialTiles) {
  const bestStrategy = Array.isArray(optimalSolutions) ? optimalSolutions[0] : null;
  if (!bestStrategy || !Array.isArray(bestStrategy.words)) return null;

  const clues = bestStrategy.words.map((word, idx) => ({
    wordIndex: idx + 1,
    length: word.length,
    estimatedPoints: 0,
    positional: generatePositionalClue(word, [], grid, specialTiles),
    category: generateCategoryClue(word),
    hints: [
      { level: 1, text: generateDefinitionClue(word) },
      { level: 2, text: generateProgressiveReveal(word, 0) },
      { level: 3, text: generateProgressiveReveal(word, 1) },
      { level: 4, text: generateProgressiveReveal(word, 2) },
      { level: 5, text: generateProgressiveReveal(word, 4) },
    ],
    features: [],
  }));

  return {
    strategy: 'optimal',
    targetScore: bestStrategy.finalScore,
    wordCount: bestStrategy.words.length,
    clues,
  };
}

/**
 * Builds an `optimalSolutions`-shaped array from the gravity simulation result.
 *
 * @param {Object} simData    - Result of simulateMaxScore (must have solutionDetail)
 * @param {Object} grid       - Plain { [hexKey]: letter } board grid
 * @param {number} totalTiles - Total tiles on the board (e.g. 61)
 * @returns {Array|null}
 */
function buildSimulationStrategies(simData, grid, totalTiles) {
  if (!simData?.solutionDetail?.length) return null;

  const tilesUsedCount = simData.solutionDetail.reduce((s, d) => s + d.tilesUsed, 0);
  const tilesUncovered = totalTiles - tilesUsedCount;

  // Estimate penalty: sum of letter points for tiles not cleared by simulation.
  const allLetterPoints = Object.values(grid).filter(l => /^[A-Z]$/.test(l)).map(l => LETTER_POINTS[l] || 1);
  const avgPoint = allLetterPoints.length > 0
    ? allLetterPoints.reduce((s, v) => s + v, 0) / allLetterPoints.length
    : 2;
  const penalty = Math.round(tilesUncovered * avgPoint);

  const wordTotal = simData.solutionDetail.reduce((s, d) => s + d.score, 0);
  const finalScore = Math.max(0, wordTotal - penalty);

  const scoreTiers = {
    good:   Math.round(finalScore * 0.40),
    great:  Math.round(finalScore * 0.65),
    superb: Math.round(finalScore * 0.85),
  };

  return [{
    words: simData.solutionDetail.map(d => d.word),
    wordTotal,
    penalty,
    finalScore,
    scoreTiers,
  }];
}

export function generateDailyHexacoreBoard({
  date = toIsoDate(),
  maxAttempts = 10,
  radius = GRID_RADIUS,
  attemptSeedOffset = 0,
  runSimulation = true,
} = {}) {
  const seed = fnv1a32(String(date));
  const allCoords = getAllCoordsWithKeys(radius);
  const totalTiles = allCoords.length;
  let bestBoard = null;
  let bestBoardMeta = null; // { clearance, score }

  /** Returns true if candidate metrics are strictly better than current best. */
  const isBetterBoard = (candidateMeta) => {
    if (!bestBoardMeta) return true;
    // Priority 1: simulation clearance %
    if (candidateMeta.clearance !== bestBoardMeta.clearance) return candidateMeta.clearance > bestBoardMeta.clearance;
    // Priority 2: estimated max score
    return candidateMeta.score > bestBoardMeta.score;
  };

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const effectiveAttempt = attempt + (Number(attemptSeedOffset) || 0);
    const rng = mkSeededRng((seed + effectiveAttempt * 9973) >>> 0);

    // ── Fill all tiles with randomly drawn letters from LETTER_POOL ─────────────
    const letters = shuffled(LETTER_POOL, rng).slice(0, totalTiles);
    const grid = {};
    allCoords.forEach((c, i) => { grid[c.key] = letters[i]; });

    const specialTiles = placeSpecialTiles(grid, rng, radius);

    // Run gravity simulation to find the optimal play sequence and max score
    let simData = null;
    if (runSimulation) {
      try {
        simData = simulateMaxScore(grid, specialTiles, radius);
      } catch (err) {
        console.warn('[hexacoreGenerator] simulateMaxScore failed:', err?.message ?? err);
        simData = null;
      }
    }

    const maxPossibleScore = simData?.maxScore ?? 0;
    const difficulty = classifyDifficulty(maxPossibleScore);

    const optimalSolutions = buildSimulationStrategies(simData, grid, totalTiles);
    const optimalPathClues = generateOptimalPathClues(optimalSolutions, grid, specialTiles);

    const board = {
      date,
      grid,
      specialTiles,
      metadata: {
        maxPossibleScore,
        optimalSolutions,
        optimalPathClues,
        difficulty,
        scoreTiers: optimalSolutions?.[0]?.scoreTiers ?? null,
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

    const attemptMeta = {
      clearance: simData?.clearancePercent ?? 0,
      score: maxPossibleScore,
    };

    if (isBetterBoard(attemptMeta)) {
      bestBoard = board;
      bestBoardMeta = attemptMeta;
    }
  }

  if (bestBoard) return bestBoard;
  throw new Error(`Unable to generate a valid daily board for ${date} after ${maxAttempts} attempts`);
}

export function generateDailyHexacoreBatch({ startDate = toIsoDate(), count = 1 } = {}) {
  const out = [];
  const d = new Date(`${startDate}T00:00:00`);
  for (let i = 0; i < count; i++) {
    const date = toIsoDate(d);
    out.push(generateDailyHexacoreBoard({ date }));
    d.setDate(d.getDate() + 1);
  }
  return out;
}
