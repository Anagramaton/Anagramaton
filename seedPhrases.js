// ============================================================================
// seedPhrases.js
// Phrase pathfinding + placement + (optional) seed-pair selection/placement
// ============================================================================

// ===== Imports =====
import { ADJ_DIRS, hexKey, getAllCoords, isValidCoord } from './gridCoords.js';
import { shuffledArray } from './utils.js';
import phraseHints from './phraseHints.js'; // list of { phrases: [A, B], hints }

// ===== Public constants (light config) =====
export const DEFAULT_SEED_TRIES = 100;

// ============================================================================
// SECTION 1: Utilities (phrase sanitization / basic checks)
// ============================================================================
export function sanitizePhrase(raw) {
  return String(raw || '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '');
}

export function phrasesSameLength(A, B) {
  return A.length > 0 && B.length > 0 && A.length === B.length;
}

// ============================================================================
// SECTION 2: Pathfinding for a single phrase (DFS on hex grid)
// (ORIGINAL FUNCTION — kept verbatim, only wrapped with headers)
// ============================================================================
function findPhrasePath(grid, phrase, radius) {
  const coords = getAllCoords(radius);
  const visited = new Set();
  const upperPhrase = phrase.toUpperCase().replace(/[^A-Z]/g, '');
  const letters = upperPhrase.split('');

  function dfs(q, r, idx, path) {
    const key = hexKey(q, r);
    if (!isValidCoord(q, r, radius)) return null;
    if (visited.has(key)) return null;

    const existing = grid[key];
    const expected = letters[idx];

    if (existing && existing !== expected) return null;

    visited.add(key);
    path.push({ q, r, key });

    if (idx === letters.length - 1) {
      return [...path];
    }

    for (const [dq, dr] of shuffledArray(ADJ_DIRS)) {
      const result = dfs(q + dq, r + dr, idx + 1, [...path]);
      if (result) return result;
    }

    visited.delete(key);
    return null;
  }

  for (const { q, r } of shuffledArray(coords)) {
    visited.clear();
    const path = dfs(q, r, 0, []);
    if (path) return path;
  }

  return null;
}

// ============================================================================
function placePhrase(grid, path, phrase) {
  const letters = phrase.toUpperCase().replace(/[^A-Z]/g, '').split('');

  for (let i = 0; i < path.length; i++) {
    const { key } = path[i];
    const letter = letters[i];

    if (!grid[key] || grid[key] === letter) {
      grid[key] = letter;
    } else {
      throw new Error(`Letter conflict at ${key}: grid has '${grid[key]}', trying to place '${letter}'`);
    }
  }
}

// ============================================================================
export function tryPlaceSeedPairOnce(grid, radius, pairEntry) {
  if (!pairEntry || !Array.isArray(pairEntry.phrases)) return null;

  const [rawA, rawB] = pairEntry.phrases;
  const hints = pairEntry.hints;

  const A = sanitizePhrase(rawA);
  const B = sanitizePhrase(rawB);
  if (!phrasesSameLength(A, B)) return null;

  // Find paths independently (non-blocking)
  const pathA = findPhrasePath(grid, A, radius);
  if (!pathA) return null;

  // Tentatively place A to influence B's path
  placePhrase(grid, pathA, A);

  const pathB = findPhrasePath(grid, B, radius);
  if (!pathB) {
    // roll back A if B fails (simple rollback)
    for (const { key } of pathA) {

    }
    // Rebuild rollback robustly:
    const lettersA = A.split('');
    pathA.forEach(({ key }, i) => {
      if (grid[key] === lettersA[i]) delete grid[key];
    });
    return null;
  }

  // Commit B (A already written)
  placePhrase(grid, pathB, B);

  return {
    phrases: [rawA, rawB],
    cleanPhrases: [A, B],
    hints: hints,
    pathA,
    pathB
  };
}

export function seedPhrasePair(grid, radius, maxTries = DEFAULT_SEED_TRIES) {
  if (!grid) throw new Error('seedPhrasePair: grid is required');

  // Work over a shuffled copy so attempts vary
  const pool = shuffledArray(phraseHints.slice());

  let placed = null;
  for (let i = 0; i < Math.min(maxTries, pool.length); i++) {
    const entry = pool[i % pool.length];
    const snapshot = { ...grid }; // shallow snapshot of letters

    const result = tryPlaceSeedPairOnce(grid, radius, entry);
    if (result) {
      placed = result;
      break;
    } else {
      // restore grid on failure
      Object.keys(grid).forEach(k => delete grid[k]);
      Object.assign(grid, snapshot);
    }
  }

  if (!placed) return null;

  return {
    phraseA: placed.phrases[0],
    phraseB: placed.phrases[1],
    cleanA: placed.cleanPhrases[0],
    cleanB: placed.cleanPhrases[1],
    pathA: placed.pathA,
    pathB: placed.pathB,
    hints: placed.hints
  };
}

// ============================================================================
// SECTION 5: Exports
// ============================================================================
export { findPhrasePath, placePhrase };
