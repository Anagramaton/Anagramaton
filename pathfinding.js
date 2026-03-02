import { isValidCoord, hexKey, ADJ_DIRS } from './gridCoords.js';
import { shuffledArray } from './utils.js';


// ===== Helper: Edge Depth ====================================================
function edgeDepth(q, r, radius) {
  // axial coords; tiles inside a hex of given radius satisfy:
  //   max(|q|, |r|, |q + r|) <= radius
  // depth 0 = on the wall; higher = deeper inside
  return radius - Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r));
}


function findPath(
  grid,
  word,
  q,
  r,
  idx,
  visited,
  radius,
  opts = {
    allowZigZag: true,
    preferOverlap: true,
    maxStraight: 2,
    wallBuffer: 1,
    maxEdgeRun: 1
  },
  prevDirIdx = null,
  straightRun = 0,
  edgeRun = 0
) {

  const {
    allowZigZag = true,
    preferOverlap = true,
    maxStraight = 2,
    wallBuffer = 1,
    maxEdgeRun = 1
  } = opts;

  if (!isValidCoord(q, r, radius)) return null;

  const key = hexKey(q, r);
  if (visited.has(key)) return null;

  const existing = grid[key];
  const letter = word[idx];
  if (existing && existing !== letter) return null;

  visited.add(key);

  if (idx === word.length - 1) {
    return [{ q, r, key }];
  }

  const hereDepth = edgeDepth(q, r, radius);
  const isNearWallHere = hereDepth <= wallBuffer;
  const nextEdgeRunBase = isNearWallHere ? edgeRun + 1 : 0;

  // ── Build and prune neighbour candidates before recursing ──────────────────
  const rawNeighbors = [];
  for (let i = 0; i < ADJ_DIRS.length; i++) {
    const [dq, dr] = ADJ_DIRS[i];
    const nq = q + dq;
    const nr = r + dr;

    // Skip coords outside the board early
    if (!isValidCoord(nq, nr, radius)) continue;

    const nKey = hexKey(nq, nr);

    // Skip already-visited tiles early
    if (visited.has(nKey)) continue;

    // Skip tiles whose existing letter doesn't match
    const nextLetter = word[idx + 1];
    const cell = grid[nKey];
    if (cell && cell !== nextLetter) continue;

    const isStraight = prevDirIdx !== null && i === prevDirIdx;

    // Skip over-straight runs early
    if (allowZigZag && isStraight && straightRun >= maxStraight) continue;

    const nDepth = edgeDepth(nq, nr, radius);
    const goesDeeper = nDepth > hereDepth;
    const staysNearWall = nDepth <= wallBuffer;

    // Skip wall-hugging runs early
    if (nextEdgeRunBase >= maxEdgeRun && staysNearWall && !goesDeeper) continue;

    rawNeighbors.push({
      nq, nr, nKey, dirIdx: i, isStraight,
      overlapsHere: cell != null && cell === nextLetter,
      nDepth,
      goesDeeper,
      staysNearWall,
    });
  }

  // Shuffle only the pruned (much smaller) list
  const neighbors = shuffledArray(rawNeighbors);

  // Sort: prefer deeper / non-straight / overlapping tiles
  neighbors.sort((a, b) => {
    if (nextEdgeRunBase >= maxEdgeRun) {
      if (a.goesDeeper !== b.goesDeeper) return a.goesDeeper ? -1 : 1;
      if (a.nDepth !== b.nDepth) return b.nDepth - a.nDepth;
    }
    if (allowZigZag && a.isStraight !== b.isStraight) {
      return a.isStraight ? 1 : -1;
    }
    if (preferOverlap && a.overlapsHere !== b.overlapsHere) {
      return a.overlapsHere ? -1 : 1;
    }
    return 0;
  });

  // Recurse into each surviving candidate
  for (const nb of neighbors) {
    const path = findPath(
      grid,
      word,
      nb.nq,
      nb.nr,
      idx + 1,
      visited,
      radius,
      opts,
      nb.dirIdx,
      nb.isStraight ? straightRun + 1 : 0,
      nb.nDepth <= wallBuffer ? nextEdgeRunBase + 1 : 0
    );

    if (path) {
      return [{ q, r, key }, ...path];
    }
  }

  // Backtrack
  visited.delete(key);
  return null;
}


export { findPath };