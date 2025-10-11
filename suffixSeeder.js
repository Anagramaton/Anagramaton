import { getAllCoords } from './gridCoords.js';
import { shuffledArray } from './utils.js';
import { findPath } from './pathfinding.js';


function placeOverlappingSuffixes(grid, chunks, gridRadius) {
  const PLACE_SUFFIX_MAX = 3; // how many suffix tails to seed, total
  const results = [];
  const coords = getAllCoords(gridRadius);
  let totalPlaced = 0;

  for (const rawChunk of shuffledArray(chunks)) {
    if (totalPlaced >= PLACE_SUFFIX_MAX) break;

    const chunk = String(rawChunk).toUpperCase().replace(/[^A-Z]/g, '');
    if (!chunk) continue;

    let attempts = 0;
    const starts = shuffledArray(coords);

    for (const { q, r } of starts) {
  if (totalPlaced >= PLACE_SUFFIX_MAX) break;
  attempts++;

  // 🧱 Skip if this starting coordinate is on the edge of the grid
  if (
    Math.abs(q) === gridRadius ||
    Math.abs(r) === gridRadius ||
    Math.abs(q + r) === gridRadius
  ) {
    continue; // edge tile — don’t start here
  }

  const path = findPath(grid, chunk, q, r, 0, new Set(), gridRadius);
  if (!path) continue;


      // must not conflict anywhere
      let conflict = false;
      for (let i = 0; i < path.length; i++) {
        const { key } = path[i];
        const existing = grid[key];
        const ch = chunk[i];
        if (existing && existing !== ch) { conflict = true; break; }
      }
      if (conflict) continue;

      // must overlap at least once with same letter
      const hasOverlap = path.some(({ key }, i) => grid[key] && grid[key] === chunk[i]);
      if (!hasOverlap) continue;

      // commit
      path.forEach(({ key }, i) => { grid[key] = chunk[i]; });
      results.push({ chunk, path });
      totalPlaced++;
      break;
    }
  }

  return results;
}

export { placeOverlappingSuffixes };