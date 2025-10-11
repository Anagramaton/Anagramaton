
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
    maxStraight: 0,
    wallBuffer: 0,     
    maxEdgeRun: 1      
  },
  prevDirIdx = null,
  straightRun = 0,
  edgeRun = 0
) {
  
  const {
    allowZigZag = true,
    preferOverlap = true,
    maxStraight = 0,
    wallBuffer = 0,
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


  let neighbors = ADJ_DIRS.map(([dq, dr], dirIdx) => {
    const nq = q + dq;
    const nr = r + dr;
    const nKey = hexKey(nq, nr);
    const isStraight = prevDirIdx !== null && dirIdx === prevDirIdx;
    const nextLetter = word[idx + 1];
    const cell = grid[nKey];
    const overlapsHere = cell != null && cell === nextLetter;

    const nDepth = edgeDepth(nq, nr, radius);
    const goesDeeper = nDepth > hereDepth;
    const staysNearWall = nDepth <= wallBuffer;

    return {
      nq, nr, dirIdx, isStraight, overlapsHere,
      nDepth, goesDeeper, staysNearWall
    };
  });

  
  neighbors = shuffledArray(neighbors);

  
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

 
  for (const nb of neighbors) {
    if (!isValidCoord(nb.nq, nb.nr, radius)) continue;
    if (allowZigZag && nb.isStraight && straightRun >= maxStraight) continue;

    const nKey = hexKey(nb.nq, nb.nr);
    if (visited.has(nKey)) continue;

    const nextExisting = grid[nKey];
    const nextLetter = word[idx + 1];
    if (nextExisting && nextExisting !== nextLetter) continue;

    
    if (nextEdgeRunBase >= maxEdgeRun && nb.staysNearWall && !nb.goesDeeper) {
    }

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

  
  visited.delete(key);
  return null;
}


export { findPath };

