import { recomputeAllWordScores } from './scoreLogic.js';

// ============================================================================
// SECTION 1: Board Entry Construction (unchanged)
// ============================================================================

export function buildBoardEntries(placedWords = []) {
  const tileRegistry = new Map(); // key -> shared tile object

  function getSharedTile(cell, letter) {
    const k = cell.key;
    let t = tileRegistry.get(k);
    if (!t) {
      t = { key: k, q: cell.q, r: cell.r, letter };
      tileRegistry.set(k, t);
    } else {
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
// SECTION 2: Candidate Pool Building (minor enhancement: preserve uniqueTileCount)
// ============================================================================

export function buildPool(boardEntries, poolSize = 250) {
  const rawScores = recomputeAllWordScores(boardEntries) || [];
  const soloScores = rawScores.map((s, i) => ({
    idx: i,
    word: boardEntries[i].word,
    tiles: boardEntries[i].tiles,
    solo: Number(s || 0),
  }));

  // Precompute unique tile count (used for ordering)
  for (const x of soloScores) {
    const uniq = new Set(x.tiles);
    x.uniqueTileCount = uniq.size;
    x.density = x.solo / Math.max(1, x.uniqueTileCount);
  }

  // Order by a mix: solo first, then density
  const POOL = [...soloScores]
    .sort((a, b) => {
      if (b.solo !== a.solo) return b.solo - a.solo;
      return b.density - a.density;
    })
    .slice(0, poolSize);

  // Optional back-compat
  const CANDIDATES = POOL;

  // Optimistic bound will be computed per-branch now, but keep a simple upper cap as fallback
  const OPT = POOL.map((x) => ({
    idx: x.idx,
    word: x.word,
    tiles: x.tiles,
    solo: x.solo,
    optimistic: x.solo * 3, // tightened static cap, but per-branch bound below is used instead
    uniqueTileCount: x.uniqueTileCount,
    density: x.density,
  }));

  return { POOL, CANDIDATES, soloScores, OPT };
}

// ============================================================================
// SECTION 3: Private Helpers (Exact Scoring) — unchanged
// ============================================================================

function scoreSetExact(boardEntries, idxList) {
  const picks = idxList.map((i) => boardEntries[i]);
  const perWord = recomputeAllWordScores(picks) || [];
  let total = 0;
  for (let i = 0; i < perWord.length; i++) total += Number(perWord[i] || 0);
  return { total, perWord };
}

// ============================================================================
// SECTION 4: Exact Solver (Deeper Optimization)
// ----------------------------------------------------------------------------
// Key additions:
// - Precompute per-word tile faces and tileKeys for faster overlap checks.
// - Maintain a light-weight per-branch tile reuse count map for tighter optimistic bounds.
// - Compute bound that accounts for how reuse multipliers can increase for existing tiles.
// ============================================================================

export async function solveExactNonBlocking({
  POOL,
  boardEntries,
  TARGET = 10,
  timeBudgetMs = 800,
  sliceMs = 12,
  hardNodeCap = 200_000,
  onProgress,
  earlyAcceptRatio = 1.0,
}) {
  // Precompute per-word data used for bounds and ordering
  const letterPoints = getLetterPoints(); // pulled from constants indirectly; re-map for speed
  const reuseMult = { 1: 1, 2: 2, 3: 4 }; // 3+ => 4

  // Build fast per-word tile fingerprints
  const WORD = POOL.map((x) => {
    const tiles = x.tiles || [];
    const keys = tiles.map((t) => t.key);
    // precompute face values per tile
    const faces = tiles.map((t) => letterPoints[String(t.letter || '').toUpperCase()] || 1);
    const uniqueTileKeys = Array.from(new Set(keys));
    return {
      idx: x.idx,
      word: x.word,
      tiles,
      solo: x.solo,
      uniqueTileKeys,
      keys,
      faces,
      uniqueTileCount: x.uniqueTileCount,
      density: x.density,
    };
  });

  // Ordered indices by a blend of solo and density (already sorted in buildPool; keep reference)
  const OPT = WORD
    .map((w, i) => ({
      pos: i, // the position in POOL order
      idx: w.idx,
      solo: w.solo,
      density: w.density,
    }))
    .sort((a, b) => {
      if (b.solo !== a.solo) return b.solo - a.solo;
      return b.density - a.density;
    });

  // Fast letterPoints map builder
  function getLetterPoints() {
    // inline cache to avoid importing constants here (we rely on recomputeAllWordScores for exact totals).
    const lp = {
      A: 1, B: 3, C: 3, D: 2, E: 1,
      F: 4, G: 2, H: 4, I: 1, J: 8,
      K: 5, L: 1, M: 3, N: 1, O: 1,
      P: 3, Q: 10, R: 1, S: 1, T: 1,
      U: 1, V: 4, W: 4, X: 8, Y: 4, Z: 10,
    };
    return lp;
  }

  // Per-branch optimistic bound leveraging current tile reuse counts:
  // For remaining picks, we assume:
  // - A new word's tiles that are already used by 1 chosen word will get ×2.
  // - Tiles already used by 2+ chosen words will get ×4.
  // - Completely new tiles will get ×1.
  // - We then apply the word-level length/anagram multipliers by approximating with solo's ratio:
  //   Use (candidate.solo / soloBase1x) to scale the bound for multipliers conservatively.
  function makeBranchBounder(tileUseCountMap, pickedSet) {
    // Build quick lookup for "tile key -> uses"
    // tileUseCountMap: Map<string,int>
    return function optimisticBoundFromPos(startPos, slots) {
      if (slots <= 0) return 0;

      // Track top-k optimistic contributions without full sort
      const top = [];

      for (let p = startPos; p < WORD.length; p++) {
        const cand = WORD[p];
        if (pickedSet.has(cand.idx)) continue;

        // Estimate base 1x sum for this word
        let base1x = 0;
        for (let i = 0; i < cand.faces.length; i++) {
          base1x += cand.faces[i];
        }

        // Estimate reuse-aware multiplier for tiles given current branch state
        let reuseBoosted = 0;
        for (let i = 0; i < cand.keys.length; i++) {
          const k = cand.keys[i];
          const face = cand.faces[i];
          const uses = tileUseCountMap.get(k) || 0;
          // If uses==0 => this word adds first use => ×1
          // uses==1 => adding second use => ×2
          // uses>=2 => adding third+ => ×4
          const mult = uses >= 2 ? reuseMult[3] : reuseMult[uses + 1];
          reuseBoosted += face * mult;
        }

        // Scale for word-level multipliers conservatively relative to solo:
        // solo ≈ base1x * wordMultipliersAvg; bound ≤ reuseBoosted * (solo/base1x)
        const scale = base1x > 0 ? Math.max(1, cand.solo / base1x) : 1;
        const optimistic = reuseBoosted * scale;

        if (top.length < slots) {
          top.push(optimistic);
          if (top.length === slots) top.sort((a, b) => a - b);
        } else if (optimistic > top[0]) {
          top[0] = optimistic;
          top.sort((a, b) => a - b);
        }
      }

      let s = 0;
      for (let i = 0; i < top.length; i++) s += top[i];
      return s;
    };
  }

  // Partial prefix cache; use a compact key to reduce overhead
  const partialCache = new Map();
  const keyOf = (idxs) => {
    // Using a simple join is fine but costs string alloc; optimize by fixed-width base36
    // Given POOL size ≤ 250, idx < 250 → encode as bytes-like string
    // Keep simple for readability:
    return idxs.join(',');
  };
  const partialScore = (idxs) => {
    const k = keyOf(idxs);
    if (partialCache.has(k)) return partialCache.get(k);
    const { total } = scoreSetExact(boardEntries, idxs);
    partialCache.set(k, total);
    return total;
  };

  // Initialize DFS stack state with per-branch tile-use counts
  const stack = [{
    pos: 0,
    chosenIdxs: [],
    chosenSet: new Set(),
    curTotal: 0,
    tileUseCountMap: new Map(), // key -> uses in current branch
  }];

  let explored = 0;
  const start = performance.now();
  let lastSlice = start;
  let bestSet = [];
  let bestTotal = -Infinity;
  let completedSearch = false;

  while (stack.length) {
    const now = performance.now();
    if (now - lastSlice >= sliceMs) {
      await Promise.resolve();
      lastSlice = performance.now();
      if (lastSlice - start > timeBudgetMs || explored > hardNodeCap) break;
    }

    const state = stack.pop();
    const { pos, chosenIdxs, chosenSet, curTotal, tileUseCountMap } = state;
    explored++;

    if (onProgress && explored % 2500 === 0) {
      onProgress({ explored, bestTotal, depth: chosenIdxs.length });
    }

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
    if (WORD.length - pos < left) continue;

    // Tighter optimistic bound based on current tile reuse counts
    const bounder = makeBranchBounder(tileUseCountMap, chosenSet);
    const optimistic = bounder(pos, left);

    if (curTotal + optimistic <= bestTotal) continue;

    // Early acceptance: if the global optimistic cannot exceed bestTotal * ratio
    if (pos === 0 && optimistic <= bestTotal * earlyAcceptRatio && bestSet.length === TARGET) {
      completedSearch = true;
      break;
    }

    // Branch in reverse so stronger candidates pop first
    for (let p = WORD.length - 1; p >= pos; p--) {
      const cand = WORD[p];
      const candIdx = cand.idx;
      if (chosenSet.has(candIdx)) continue;

      const nextIdxs = chosenIdxs.concat(candIdx);
      const nextSet = new Set(chosenSet);
      nextSet.add(candIdx);

      // Update tile-use counts for the next state (copy-on-write Map)
      const nextTileUse = new Map(tileUseCountMap);
      for (let i = 0; i < cand.keys.length; i++) {
        const k = cand.keys[i];
        nextTileUse.set(k, (nextTileUse.get(k) || 0) + 1);
      }

      const partialTotal = partialScore(nextIdxs);
      const nextBounder = makeBranchBounder(nextTileUse, nextSet);
      const optimisticRest = nextBounder(p + 1, left - 1);

      if (partialTotal + optimisticRest <= bestTotal) continue;

      stack.push({
        pos: p + 1,
        chosenIdxs: nextIdxs,
        chosenSet: nextSet,
        curTotal: partialTotal,
        tileUseCountMap: nextTileUse,
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

  const elapsed = performance.now() - start;
  const timedOut = elapsed > timeBudgetMs;

  if (timedOut && !completedSearch) {
    console.warn("[EXACT SOLVER DIAG] EXITED: TIME LIMIT EXCEEDED (", timeBudgetMs, "ms )");
  } else if (explored > hardNodeCap && !completedSearch) {
    console.warn("[EXACT SOLVER DIAG] EXITED: NODE LIMIT EXCEEDED (", hardNodeCap, "nodes )");
  } else if (!timedOut && !completedSearch) {
    console.info("[EXACT SOLVER DIAG] SEARCH ENDED: stack emptied; optimality achieved or pruned.");
  } else if (completedSearch) {
    console.info("[EXACT SOLVER DIAG] EARLY ACCEPT: global optimistic bound ≤ bestTotal *", earlyAcceptRatio);
  }

  return { best10, finalTotal, explored, timedOut: timedOut && !completedSearch };
}