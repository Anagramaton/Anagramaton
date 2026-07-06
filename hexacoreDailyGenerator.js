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

const DAILY_DIGRAPH_OPTIONS = [
  'TH', 'HE', 'IN', 'ER', 'RE', 'ST', 'AN', 'ON', 'EA',
  'IO', 'LL', 'QU', 'CK', 'CH', 'EN', 'CO', 'LY', 'AL',
  'LE', 'ED', 'ES', 'UN', 'GH', 'CR', 'WH', 'NT', 'NG', 'TY',
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

  const pickRandom = (type, count, extra = {}) => {
    const pool = shuffled(allCoords.filter(c => !taken.has(c.key) && !!grid[c.key]), rng);
    for (let i = 0; i < count && i < pool.length; i++) {
      specials.push({ type, q: pool[i].q, r: pool[i].r, ...extra });
      taken.add(pool[i].key);
    }
  };

  pickRandom('prism', 1);
  pickRandom(shuffled(DAILY_ROTATING_GEM_TYPES, rng)[0], 1);
  pickRandom(shuffled(DAILY_ROTATING_RUNE_TYPES, rng)[0], 1);

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

// ═══════════════════════════════════════════════════════════════════════════
// INTEGER PARTITION GENERATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate a random partition of `total` into integers within [minVal, maxVal].
 * @param {number} total - The sum to partition (61)
 * @param {number} minVal - Minimum partition value (5)
 * @param {number} maxVal - Maximum partition value (13)
 * @param {Function} rng - Seeded random number generator
 * @returns {number[]} Array of integers summing to total
 */
function generateRandomPartition(total, minVal, maxVal, rng) {
  const result = [];
  let remaining = total;

  while (remaining > 0) {
    // Calculate max we can take while ensuring we can still partition the rest
    const maxPossible = Math.min(maxVal, remaining);
    
    // Minimum we must take (ensure we don't leave an impossible remainder)
    const minRequired = Math.max(minVal, remaining - (maxVal * 100)); // upper bound on pieces
    
    if (minRequired > maxPossible) {
      // Backtrack: this shouldn't happen with valid parameters, but handle it
      if (result.length === 0) {
        throw new Error(`Cannot partition ${total} with min=${minVal}, max=${maxVal}`);
      }
      // Try adjusting the last element
      const last = result.pop();
      remaining += last;
      continue;
    }
    
    // Choose a random value in valid range
    const range = maxPossible - minRequired;
    const value = minRequired + Math.floor(rng() * (range + 1));
    
    result.push(value);
    remaining -= value;
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════════════════
// BACKWARD BOARD RECONSTRUCTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Compute the inverse of gravity: given a board state, place tiles for a word
 * such that after word removal and gravity, we arrive at the current state.
 * 
 * This is the core of the backward generation algorithm.
 */
function reverseGravity(simGrid, radius) {
  // Build a map of which positions have tiles
  const occupied = new Set(Object.keys(simGrid));
  
  // For each empty position, check if a tile could have fallen from above
  const reversePositions = [];
  
  for (let q = -radius; q <= radius; q++) {
    const rMin = Math.max(-radius, -q - radius);
    const rMax = Math.min(radius, -q + radius);
    for (let r = rMin; r <= rMax; r++) {
      const key = hexKey(q, r);
      if (occupied.has(key)) continue; // Position has a tile
      
      // Check if a tile at this position would have fallen due to gravity
      // A tile stays in place if BOTH SE and SW are blocked
      const seKey = hexKey(q, r + 1);
      const swKey = hexKey(q - 1, r + 1);
      
      const seBlocked = !isValidCoord(q, r + 1, radius) || occupied.has(seKey);
      const swBlocked = !isValidCoord(q - 1, r + 1, radius) || occupied.has(swKey);
      
      // This position is stable (tile wouldn't fall) if both are blocked
      if (seBlocked && swBlocked) {
        reversePositions.push({ q, r, key });
      }
    }
  }
  
  return reversePositions;
}

/**
 * Find a connected path through empty stable positions where we can place a word.
 * The word must form a valid hex path (adjacent cells).
 */
function findBackwardPlacement(simGrid, word, radius, rng) {
  const stablePositions = reverseGravity(simGrid, radius);
  
  if (stablePositions.length === 0) {
    return null;
  }
  
  // Try starting from random stable positions
  const shuffledStarts = shuffled(stablePositions, rng);
  
  for (const start of shuffledStarts.slice(0, Math.min(20, shuffledStarts.length))) {
    const path = findWordPath(simGrid, word, start, stablePositions, radius, rng);
    if (path && path.length === word.length) {
      return path;
    }
  }
  
  return null;
}

/**
 * Build a path for `word` starting at `start`, using only positions from `allowedPositions`.
 */
function findWordPath(simGrid, word, start, allowedPositions, radius, rng) {
  const allowedKeys = new Set(allowedPositions.map(p => p.key));
  const path = [{ q: start.q, r: start.r, key: start.key, letter: word[0] }];
  const visited = new Set([start.key]);
  
  let current = start;
  
  for (let i = 1; i < word.length; i++) {
    const neighbors = [];
    
    for (const [dq, dr] of ADJ_DIRS) {
      const nq = current.q + dq;
      const nr = current.r + dr;
      const nkey = hexKey(nq, nr);
      
      if (visited.has(nkey)) continue;
      if (!allowedKeys.has(nkey)) continue;
      
      neighbors.push({ q: nq, r: nr, key: nkey });
    }
    
    if (neighbors.length === 0) {
      return null; // Dead end
    }
    
    // Pick random neighbor to continue path
    const next = neighbors[Math.floor(rng() * neighbors.length)];
    path.push({ ...next, letter: word[i] });
    visited.add(next.key);
    current = next;
  }
  
  return path;
}

/**
 * Apply forward gravity to see where tiles fall after word removal.
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
 * Generate a board by backward reconstruction.
 * Start from empty board (solved), place words backward, reconstruct predecessor states.
 */
function generateBackwardBoard(wordRecipe, radius, rng) {
  const simGrid = {}; // Start with empty board (fully solved state)
  const placedWords = [];
  
  // Work through words in reverse order (last word removed first)
  for (let i = wordRecipe.length - 1; i >= 0; i--) {
    const word = wordRecipe[i];
    
    // Find a valid backward placement
    let placement = null;
    let attempts = 0;
    const maxAttempts = 50;
    
    while (!placement && attempts < maxAttempts) {
      placement = findBackwardPlacement(simGrid, word, radius, rng);
      attempts++;
      
      if (!placement) {
        // If we can't place, try a different word of same length
        const alternates = ANAGRAMATON_DICTIONARY.filter(w => 
          w.length === word.length && w !== word && /^[A-Z]+$/.test(w)
        );
        if (alternates.length > 0) {
          wordRecipe[i] = alternates[Math.floor(rng() * alternates.length)];
        }
      }
    }
    
    if (!placement) {
      // Failed to place this word - this attempt failed
      return null;
    }
    
    // Place the word tiles
    for (const tile of placement) {
      simGrid[tile.key] = { letter: tile.letter };
    }
    
    placedWords.unshift({ word, path: placement });
  }
  
  return { grid: simGrid, placedWords };
}

// ═══════════════════════════════════════════════════════════════════════════
// SCORING SIMULATION (for metadata only - not for validation)
// ═══════════════════════════════════════════════════════════════════════════

function calculateWordScore(word) {
  let base = 0;
  for (const ch of word) {
    base += LETTER_POINTS[ch] || 2;
  }
  // Simple length multiplier
  const lengthMult = Math.max(word.length, 5);
  return base * lengthMult;
}

function estimateBoardScore(placedWords) {
  return placedWords.reduce((sum, pw) => sum + calculateWordScore(pw.word), 0);
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN GENERATOR
// ═══════════════════════════════════════════════════════════════════════════

export function generateDailyHexacoreBoard({
  date = toIsoDate(),
  maxAttempts = 10,
  radius = GRID_RADIUS,
  attemptSeedOffset = 0,
  runSimulation = false, // Not needed - solvability guaranteed by construction
} = {}) {
  const seed = fnv1a32(String(date));
  const allCoords = getAllCoordsWithKeys(radius);
  const totalTiles = allCoords.length;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const effectiveAttempt = attempt + (Number(attemptSeedOffset) || 0);
    const rng = mkSeededRng((seed + effectiveAttempt * 9973) >>> 0);

    // Generate word recipe: partition 61 into word lengths [5, 13]
    const partition = generateRandomPartition(totalTiles, 5, 13, rng);
    const shuffledPartition = shuffled(partition, rng);
    
    // Map each length to a random dictionary word
    const wordRecipe = shuffledPartition.map(len => {
      const candidates = ANAGRAMATON_DICTIONARY.filter(w => 
        w.length === len && /^[A-Z]+$/.test(w)
      );
      if (candidates.length === 0) {
        throw new Error(`No dictionary words of length ${len}`);
      }
      return candidates[Math.floor(rng() * candidates.length)];
    });

    // Generate board using backward reconstruction
    const result = generateBackwardBoard(wordRecipe, radius, rng);
    
    if (!result) {
      continue; // Try next attempt
    }

    const { grid, placedWords } = result;

    // Extract final grid (just letters)
    const finalGrid = {};
    for (const [key, value] of Object.entries(grid)) {
      finalGrid[key] = value.letter;
    }

    // Place special tiles
    const specialTiles = placeSpecialTiles(finalGrid, rng, radius);

    // Compute metadata
    const estimatedScore = estimateBoardScore(placedWords);
    const difficulty = estimatedScore < 15000 ? 'easy' 
      : estimatedScore < 30000 ? 'medium'
      : estimatedScore < 50000 ? 'hard' 
      : 'expert';

    const board = {
      date,
      grid: finalGrid,
      specialTiles,
      metadata: {
        maxPossibleScore: estimatedScore,
        difficulty,
        optimalMoves: placedWords.length,
        averageWordLength: placedWords.reduce((s, w) => s + w.word.length, 0) / placedWords.length,
        tilesCleared: totalTiles,
        tilesRemaining: 0,
        tileClearancePercent: 100,
        fullClear: true,
        solutionPath: placedWords.map(pw => pw.word),
        generatedAt: new Date().toISOString(),
        generationMethod: 'backward-reconstruction',
        wordRecipe: wordRecipe,
      },
    };

    return board;
  }

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
