// ============================================================================
// seedPhrases.js
// Phrase pathfinding + placement + (optional) seed-pair selection/placement
// ============================================================================

// ===== Imports =====
import { ADJ_DIRS, hexKey, getAllCoords, isValidCoord } from './gridCoords.js';
import { shuffledArray } from './utils.js';
import phraseHints from './phraseHints.js';

// ===== Public constants =====
export const DEFAULT_SEED_TRIES = 100;

// ============================================================================
// SECTION 1: Utilities
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
// SECTION 2: Centre-biased pathfinding for a single phrase
//
// Changes from original:
//   - Starting positions sorted by hex distance from origin (closest first),
//     only the nearest 40 are tried rather than all coords in random order.
//   - Inside the DFS, neighbours are scored before recursing:
//       + centrality bonus   (prefers tiles closer to board centre)
//       + preferKeys bonus   (prefers tiles already in partner phrase's path)
//       + rim penalty        (discourages outer-ring tiles)
//       + small jitter       (prevents identical geometry every game)
//   - Top BEAM_WIDTH neighbours are explored in score order (beam search).
//   - Optional preferKeys parameter (default empty Set) — safe for all
//     existing callers that don't pass it.
// ============================================================================

const BEAM_WIDTH = 6;

function hexDist(q, r) {
  return Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r));
}

function findPhrasePath(grid, phrase, radius, preferKeys = new Set()) {
  const coords = getAllCoords(radius);
  const letters = sanitizePhrase(phrase).split('');
  const len = letters.length;
  if (len === 0) return null;

  // Sort starting positions: closest to centre first, take nearest 40
  const starts = coords
    .slice()
    .sort((a, b) => hexDist(a.q, a.r) - hexDist(b.q, b.r))
    .slice(0, 40);

  function dfs(q, r, idx, path, visited) {
    if (!isValidCoord(q, r, radius)) return null;

    const key = hexKey(q, r);
    if (visited.has(key)) return null;

    const existing = grid[key];
    const expected = letters[idx];
    if (existing && existing !== expected) return null;

    visited.add(key);
    path.push({ q, r, key });

    if (idx === len - 1) return [...path];

    // Score and sort neighbours before recursing
    const scored = [];
    for (const [dq, dr] of ADJ_DIRS) {
      const nq = q + dq;
      const nr = r + dr;
      if (!isValidCoord(nq, nr, radius)) continue;

      const nKey = hexKey(nq, nr);
      if (visited.has(nKey)) continue;

      const nCell = grid[nKey];
      if (nCell && nCell !== letters[idx + 1]) continue;

      const dist        = hexDist(nq, nr);
      const centrality  = radius - dist;                          // 0..radius, higher = more central
      const overlapBonus = (nCell && nCell === letters[idx + 1]) ? 3 : 0;
      const preferBonus  = preferKeys.has(nKey) ? 5 : 0;
      const rimPenalty   = dist === radius ? -4 : 0;
      const jitter       = (Math.random() - 0.5) * 1.2;          // seeded rng in daily mode

      scored.push({
        nq, nr,
        score: centrality * 1.5 + overlapBonus + preferBonus + rimPenalty + jitter
      });
    }

    // Keep top BEAM_WIDTH candidates, best score first
    scored.sort((a, b) => b.score - a.score);
    const beam = scored.slice(0, BEAM_WIDTH);

    for (const nb of beam) {
      const result = dfs(nb.nq, nb.nr, idx + 1, [...path], new Set(visited));
      if (result) return result;
    }

    visited.delete(key);
    return null;
  }

  for (const { q, r } of starts) {
    const result = dfs(q, r, 0, [], new Set());
    if (result) return result;
  }

  return null;
}

// ============================================================================
// SECTION 3: Place a phrase onto the grid
// ============================================================================
function placePhrase(grid, path, phrase) {
  const letters = sanitizePhrase(phrase).split('');
  for (let i = 0; i < path.length; i++) {
    const { key } = path[i];
    const letter = letters[i];
    if (!grid[key] || grid[key] === letter) {
      grid[key] = letter;
    } else {
      throw new Error(
        `Letter conflict at ${key}: grid has '${grid[key]}', trying to place '${letter}'`
      );
    }
  }
}

// ============================================================================
// SECTION 4: Try placing one phrase pair (used by seedPhrasePair)
//
// Fix from original: rollback now uses snapshot/restore instead of the
// conditional-delete approach, which was unreliable when A and B shared tiles.
// ============================================================================
export function tryPlaceSeedPairOnce(grid, radius, pairEntry) {
  if (!pairEntry || !Array.isArray(pairEntry.phrases)) return null;

  const [rawA, rawB] = pairEntry.phrases;
  const hints = pairEntry.hints;

  const A = sanitizePhrase(rawA);
  const B = sanitizePhrase(rawB);
  if (!phrasesSameLength(A, B)) return null;

  // Snapshot before touching the grid — safe restore on any failure
  const snapshot = { ...grid };

  const pathA = findPhrasePath(grid, A, radius);
  if (!pathA) {
    // Nothing written yet — no restore needed
    return null;
  }

  // Tentatively place A so B's pathfinding can see its letters
  placePhrase(grid, pathA, A);

  const pathB = findPhrasePath(grid, B, radius);
  if (!pathB) {
    // Restore grid to pre-A state
    Object.keys(grid).forEach(k => delete grid[k]);
    Object.assign(grid, snapshot);
    return null;
  }

  // Commit B (A already written)
  placePhrase(grid, pathB, B);

  return {
    phrases:      [rawA, rawB],
    cleanPhrases: [A, B],
    hints,
    pathA,
    pathB,
  };
}

// ============================================================================
// SECTION 5: Seed a phrase pair (public helper used outside daily flow)
// ============================================================================
export function seedPhrasePair(grid, radius, maxTries = DEFAULT_SEED_TRIES) {
  if (!grid) throw new Error('seedPhrasePair: grid is required');

  const pool = shuffledArray(phraseHints.slice());
  let placed = null;

  for (let i = 0; i < Math.min(maxTries, pool.length); i++) {
    const entry    = pool[i % pool.length];
    const snapshot = { ...grid };

    const result = tryPlaceSeedPairOnce(grid, radius, entry);
    if (result) {
      placed = result;
      break;
    } else {
      Object.keys(grid).forEach(k => delete grid[k]);
      Object.assign(grid, snapshot);
    }
  }

  if (!placed) return null;

  return {
    phraseA: placed.phrases[0],
    phraseB: placed.phrases[1],
    cleanA:  placed.cleanPhrases[0],
    cleanB:  placed.cleanPhrases[1],
    pathA:   placed.pathA,
    pathB:   placed.pathB,
    hints:   placed.hints,
  };
}

// ============================================================================
// SECTION 6: Exports
// ============================================================================
export { findPhrasePath, placePhrase };