import { isValidCoord, hexKey, ADJ_DIRS } from './gridCoords.js';
import { shuffledArray } from './utils.js';


function findPath(
  grid,
  word,
  q,
  r,
  idx,
  visited,
  radius,
  opts = { allowZigZag: true, preferOverlap: true, maxStraight: 0 },
  prevDirIdx = null,
  straightRun = 0
) {
  const { allowZigZag = true, preferOverlap = true, maxStraight = 0 } = opts;

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

  let neighbors = ADJ_DIRS.map(([dq, dr], dirIdx) => {
    const nq = q + dq;
    const nr = r + dr;
    const nKey = hexKey(nq, nr);
    const isStraight = prevDirIdx !== null && dirIdx === prevDirIdx;
    const nextLetter = word[idx + 1];
    const cell = grid[nKey];
    const overlapsHere = cell != null && cell === nextLetter;
    return { nq, nr, dirIdx, isStraight, overlapsHere };
  });

  neighbors = shuffledArray(neighbors);

  neighbors.sort((a, b) => {
    if (allowZigZag && a.isStraight !== b.isStraight) {
      return a.isStraight ? 1 : -1;
    }
    if (preferOverlap && a.overlapsHere !== b.overlapsHere) {
      return a.overlapsHere ? -1 : 1;
    }
    return 0;
  });

  for (const nb of neighbors) {
    if (!isValidCoord(nb.nq, nb.nr, radius)) continue;
    if (allowZigZag && nb.isStraight && straightRun >= maxStraight) continue;

    const nKey = hexKey(nb.nq, nb.nr);
    if (visited.has(nKey)) continue;

    const nextExisting = grid[nKey];
    const nextLetter = word[idx + 1];
    if (nextExisting && nextExisting !== nextLetter) continue;

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
      nb.isStraight ? straightRun + 1 : 0
    );

    if (path) {
      return [{ q, r, key }, ...path];
    }
  }

  visited.delete(key);
  return null;
}

export { findPath };