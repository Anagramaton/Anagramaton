import { getAllCoords } from './gridCoords.js';
import { shuffledArray } from './utils.js';
import { findPath } from './pathfinding.js';

// ============================================================================
// placeOverlappingSuffixes
//
// Changes from original:
//   - Accepts optional fourth parameter `preferAdjacentKeys` (Set of hex keys).
//     When provided, starting coordinates that are in or adjacent to the phrase
//     cluster are sorted to the front of the candidate list, so suffix seeds
//     preferentially grow out of the phrase boundary rather than landing
//     arbitrarily elsewhere on the board.
//   - All existing logic (edge skip, conflict check, overlap requirement,
//     PLACE_SUFFIX_MAX) is unchanged.
// ============================================================================

function placeOverlappingSuffixes(grid, chunks, gridRadius, preferAdjacentKeys = new Set()) {
  const PLACE_SUFFIX_MAX = 3;
  const results  = [];
  const coords   = getAllCoords(gridRadius);
  let totalPlaced = 0;

  for (const rawChunk of shuffledArray(chunks)) {
    if (totalPlaced >= PLACE_SUFFIX_MAX) break;

    const chunk = String(rawChunk).toUpperCase().replace(/[^A-Z]/g, '');
    if (!chunk) continue;

    // Build the candidate start list:
    // 1. Shuffle all coords for randomness within each priority tier.
    // 2. Sort so preferred-adjacent coords come first.
    //    Coords IN preferAdjacentKeys → tier 0 (highest priority)
    //    All others                   → tier 1
    const shuffled = shuffledArray(coords);
    const starts = preferAdjacentKeys.size > 0
      ? shuffled.slice().sort((a, b) => {
          const aKey = `${a.q},${a.r}`;
          const bKey = `${b.q},${b.r}`;
          const aPref = preferAdjacentKeys.has(aKey) ? 0 : 1;
          const bPref = preferAdjacentKeys.has(bKey) ? 0 : 1;
          return aPref - bPref;
        })
      : shuffled;

    for (const { q, r } of starts) {
      if (totalPlaced >= PLACE_SUFFIX_MAX) break;

      // Skip edge tiles
      if (
        Math.abs(q) === gridRadius ||
        Math.abs(r) === gridRadius ||
        Math.abs(q + r) === gridRadius
      ) {
        continue;
      }

      const path = findPath(grid, chunk, q, r, 0, new Set(), gridRadius);
      if (!path) continue;

      // Must not conflict anywhere
      let conflict = false;
      for (let i = 0; i < path.length; i++) {
        const { key } = path[i];
        const existing = grid[key];
        if (existing && existing !== chunk[i]) { conflict = true; break; }
      }
      if (conflict) continue;

      // Must overlap at least once with same letter
      const hasOverlap = path.some(({ key }, i) => grid[key] && grid[key] === chunk[i]);
      if (!hasOverlap) continue;

      // Commit
      path.forEach(({ key }, i) => { grid[key] = chunk[i]; });
      results.push({ chunk, path });
      totalPlaced++;
      break;
    }
  }

  return results;
}

export { placeOverlappingSuffixes };