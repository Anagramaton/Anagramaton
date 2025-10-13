import { recomputeAllWordScores } from './scoreLogic.js';

// ============================================================================
// SECTION 1: Board Entry Construction
// ----------------------------------------------------------------------------
// - buildBoardEntries: converts placed words (with cell paths) into
//   scorer-friendly entries while ensuring SHARED tile objects for overlaps.
// ============================================================================

/**
 * Build scorer-friendly entries with SHARED tile objects.
 * Ensures overlapping letters share the same tile object.
 *
 * @param {Array<{word:string, path:Array<{key:string,q:number,r:number}>}>} placedWords
 * @returns {Array<{word:string, tiles:Array<{key:string,q:number,r:number,letter:string}>>}
 */
export function buildBoardEntries(placedWords = []) {
  const tileRegistry = new Map(); // key -> shared tile object

  function getSharedTile(cell, letter) {
    const k = cell.key;
    let t = tileRegistry.get(k);
    if (!t) {
      t = { key: k, q: cell.q, r: cell.r, letter };
      tileRegistry.set(k, t);
    } else {
      // Keep consistent if multiple words share the letter
      t.letter = letter;
    }
    return t;
  }

  return placedWords.map((p) => {
    const upper = String(p.word || '').toUpperCase();
    return {
      word: upper,
      tiles: (p.path || []).map((cell, i) => getSharedTile(cell, upper.charAt(i))),
    };
  });
}

// ============================================================================
// SECTION 2: Candidate Pool Building
// ----------------------------------------------------------------------------
// - buildPool: ranks entries by solo score and prepares POOL/CANDIDATES/OPT.
//   Does NOT mutate inputs.
// ============================================================================

/**
 * Rank candidates by solo score and build the POOL.
 * Does NOT mutate inputs.
 *
 * @param {Array<{word:string, tiles:Array}>} boardEntries
 * @param {number} poolSize
 * @returns {{ POOL:Array, CANDIDATES:Array, soloScores:Array, OPT:Array }}
 */
export function buildPool(boardEntries, poolSize = 250) {
  const rawScores = recomputeAllWordScores(boardEntries) || [];
  const soloScores = rawScores.map((s, i) => ({
    idx: i,
    word: boardEntries[i].word,
    tiles: boardEntries[i].tiles,
    solo: Number(s || 0),
  }));

  const POOL = [...soloScores].sort((a, b) => b.solo - a.solo).slice(0, poolSize);

  // Optional back-compat: if other code still reads CANDIDATES
  const CANDIDATES = POOL;

  // Precompute an optimistic (admissible) upper bound for pruning
  const OPT = POOL.map((x) => ({
    idx: x.idx,
    word: x.word,
    tiles: x.tiles,
    solo: x.solo,
    optimistic: x.solo * 4, // safe overestimate for reuse
  }));

  return { POOL, CANDIDATES, soloScores, OPT };
}

// ============================================================================
// SECTION 3: Private Helpers (Exact Scoring)
// ----------------------------------------------------------------------------
// - scoreSetExact: recomputes full interaction scores for a set of indices.
// ============================================================================

/**
 * Exact score for a set of indices, recomputing with full interaction.
 * @param {Array} boardEntries
 * @param {Array<number>} idxList
 * @returns {{total:number, perWord:number[]}}
 */
function scoreSetExact(boardEntries, idxList) {
  const picks = idxList.map((i) => boardEntries[i]);
  const perWord = recomputeAllWordScores(picks) || [];
  let total = 0;
  for (let i = 0; i < perWord.length; i++) total += Number(perWord[i] || 0);
  return { total, perWord };
}

// ============================================================================
// SECTION 4: Exact Solver (Cooperative / Non-Blocking)
// ----------------------------------------------------------------------------
// - solveExactNonBlocking: DFS + branch-and-bound with periodic yields to keep
//   the UI responsive. Uses optimistic bounds from solo scores.
// ============================================================================

/**
 * Cooperative DFS/branch-and-bound exact solver.
 * Yields periodically so the UI stays responsive.
 *
 * @param {Object} args
 * @param {Array} args.POOL               // from buildPool(...)
 * @param {Array} args.boardEntries       // from buildBoardEntries(...)
 * @param {number} [args.TARGET=10]
 * @param {number} [args.timeBudgetMs=800]
 * @param {number} [args.sliceMs=12]
 * @param {number} [args.hardNodeCap=200_000]
 * @returns {Promise<{best10:Array<{word:string,score:number}>, finalTotal:number, explored:number, timedOut:boolean}>}
 */
export async function solveExactNonBlocking({
  POOL,
  boardEntries,
  TARGET = 10,
  timeBudgetMs = 800,
  sliceMs = 12,
  hardNodeCap = 200_000,
}) {
  // Build OPT locally from POOL (keeps function pure)
  const OPT = POOL.map((x) => ({
    idx: x.idx,
    word: x.word,
    tiles: x.tiles,
    solo: x.solo,
    optimistic: x.solo * 4,
  }));

  let bestSet = [];
  let bestTotal = -Infinity;

  // Small cache for partial prefix scores
  const partialCache = new Map();
  const keyOf = (idxs) => idxs.join(',');
  const partialScore = (idxs) => {
    const k = keyOf(idxs);
    if (partialCache.has(k)) return partialCache.get(k);
    const { total } = scoreSetExact(boardEntries, idxs);
    partialCache.set(k, total);
    return total;
  };

  // Fast top-k optimistic fill (no full sort each time)
  function optimisticFillBound(startPos, chosenSet, remainingSlots) {
    if (remainingSlots <= 0) return 0;

    const top = [];
    for (let p = startPos; p < OPT.length; p++) {
      const candIdx = OPT[p].idx;
      if (chosenSet.has(candIdx)) continue;

      const v = OPT[p].optimistic;
      if (top.length < remainingSlots) {
        top.push(v);
        if (top.length === remainingSlots) top.sort((a, b) => a - b);
      } else if (v > top[0]) {
        top[0] = v;
        top.sort((a, b) => a - b);
      }
    }

    let s = 0;
    for (let i = 0; i < top.length; i++) s += top[i];
    return s;
  }

  // Iterative DFS so we can yield to the event loop
  const stack = [{ pos: 0, chosenIdxs: [], chosenSet: new Set(), curTotal: 0 }];
  let explored = 0;
  const start = performance.now();
  let lastSlice = start;

  while (stack.length) {
    const now = performance.now();

    if (now - lastSlice >= sliceMs) {
      // Yield control
      await Promise.resolve();
      lastSlice = performance.now();
      if (lastSlice - start > timeBudgetMs || explored > hardNodeCap) break;
    }

    const state = stack.pop();
    const { pos, chosenIdxs, chosenSet, curTotal } = state;
    explored++;

    const have = chosenIdxs.length;
    if (have === TARGET) {
      const { total } = scoreSetExact(boardEntries, chosenIdxs);
      if (total > bestTotal) {
        bestTotal = total;
        bestSet = chosenIdxs.slice();
      }
      continue;
    }

    const left = TARGET - have;
    if (OPT.length - pos < left) continue;

    const optimistic = optimisticFillBound(pos, chosenSet, left);
    if (curTotal + optimistic <= bestTotal) continue;

    // Branch in reverse so higher-priority nodes pop first
    for (let p = OPT.length - 1; p >= pos; p--) {
      const cand = OPT[p];
      const candIdx = cand.idx;
      if (chosenSet.has(candIdx)) continue;

      const nextIdxs = chosenIdxs.concat(candIdx);
      const nextSet = new Set(chosenSet);
      nextSet.add(candIdx);

      const partialTotal = partialScore(nextIdxs);
      const optimisticRest = optimisticFillBound(p + 1, nextSet, left - 1);
      if (partialTotal + optimisticRest <= bestTotal) continue;

      stack.push({
        pos: p + 1,
        chosenIdxs: nextIdxs,
        chosenSet: nextSet,
        curTotal: partialTotal,
      });
    }
  }

  const { total: finalTotal, perWord: finalPerWord } = scoreSetExact(boardEntries, bestSet);

  const best10 = bestSet
    .map((idx, j) => ({
      word: boardEntries[idx].word,
      score: Number(finalPerWord?.[j] || 0),
    }))
    .sort((a, b) => b.score - a.score);

  return {
    best10,
    finalTotal,
    explored,
    timedOut: performance.now() - start > timeBudgetMs,
  };
}
