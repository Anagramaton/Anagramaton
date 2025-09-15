const DEBUG = false;   // <— one flag at the top

// Silence plain console logs
console.log = () => {};
console.info = () => {};
console.group = () => {};
console.groupCollapsed = () => {};
console.groupEnd = () => {};

import { letterFrequencies } from './constants.js';
import wordList from './wordList.js';
import suffixList from './suffixList.js'; 
import { GRID_RADIUS as DEFAULT_RADIUS } from './constants.js';
import phraseHints from './phraseHints.js'; 
import { gameState } from './gameState.js';
import { computeBoardWordScores, recomputeAllWordScores } from './scoreLogic.js';





export const placedWords = [];

const ADJ_DIRS = [
  [1, 0], [0, 1], [-1, 1],
  [-1, 0], [0, -1], [1, -1]
];

const MAX_ATTEMPTS = 150;

const hexKey = (q, r) => `${q},${r}`;

function randomFrom(arr) {
  const index = Math.floor(Math.random() * arr.length);
  return arr[index];
}

function shuffledArray(arr = []) {
  const copy = arr.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function getAllCoords(radius) {
  const coords = [];
  for (let q = -radius; q <= radius; q++) {
    const rMin = Math.max(-radius, -q - radius);
    const rMax = Math.min(radius, -q + radius);
    for (let r = rMin; r <= rMax; r++) {
      coords.push({ q, r });
    }
  }
  return coords;
}

function isValidCoord(q, r, radius) {
  return (
    Math.abs(q) <= radius &&
    Math.abs(r) <= radius &&
    Math.abs(q + r) <= radius
  );
}

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

function countOverlap(grid, path, word) {
  let hits = 0;
  for (let i = 0; i < path.length; i++) {
    const { key } = path[i];
    if (grid[key] && grid[key] === word[i]) hits++;
  }
  return hits;
}

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

function indexByKey(path) {
  const m = new Map();
  path.forEach((p, i) => m.set(p.key, i));
  return m;
}




export function generateSeededBoard(gridRadius = DEFAULT_RADIUS, state = gameState) {
  const DEBUG = true; // flip to false to quiet logs

  const grid = {};
  placedWords.length = 0;

  const coords = getAllCoords(gridRadius);
  const maxTiles = coords.length; // radius 4 ≈ 62
  const MIN_WORD_OVERLAP = 2; // used by general fill
  const PATH_TRIES = Math.max(1200, (typeof MAX_ATTEMPTS === 'number' ? MAX_ATTEMPTS : 300));

  // ---------------------------------------------------------------------------
  // STEP 1) Seed phrase pair — UNCHANGED CORE BEHAVIOR
  // ---------------------------------------------------------------------------
  let placed = false;
  for (let i = 0; i < 100 && !placed; i++) {
    const selected = phraseHints[Math.floor(Math.random() * phraseHints.length)];
    const [rawA, rawB] = selected.phrases;
    const { hints } = selected;

    const A = rawA.toUpperCase().replace(/[^A-Z]/g, "");
    const B = rawB.toUpperCase().replace(/[^A-Z]/g, "");

    if (A.length === 0 || B.length === 0) continue;
    if (A.length !== B.length) continue;
    if (A.length > maxTiles) continue;

    const pathA = findPhrasePath(grid, A, gridRadius);
    if (!pathA) continue;
    placePhrase(grid, pathA, A);

    const pathB = findPhrasePath(grid, B, gridRadius);
    if (!pathB) continue;
    placePhrase(grid, pathB, B);

    gameState.seedPhrase = `${rawA} / ${rawB}`;
    gameState.seedPaths = { phraseA: pathA, phraseB: pathB };
    gameState.seedHints = hints;

    placed = true;
  }

  DEBUG && console.info(`🌟 Seed phrase pair: ${gameState.seedPhrase}`);
  DEBUG && console.info(`✅ Loaded hints:`, gameState.seedHints);

  // ---------------------------------------------------------------------------
  // Candidate prep (same filters as you had, pulled up once so all stages share)
  // ---------------------------------------------------------------------------
  const MAX_FRIENDLY_LEN = Math.min(14, Math.floor(3.5 * gridRadius + 1));
  const MIN_FRIENDLY_LEN = 4;
  const TECHY_RE = /(ENCEPHAL|NEURO|EAE|DAE|SULF|PHEN|CHEM|BLASTU|PHYL|CYTE|PHAGE|INASE|AMIDE|IMIDE)/i;
  function isFriendlyWord(w) {
    if (w.length < MIN_FRIENDLY_LEN || w.length > MAX_FRIENDLY_LEN) return false;
    if (!/^[A-Za-z]+$/.test(w)) return false;
    if (TECHY_RE.test(w)) return false;
    const rare = (w.match(/[JQXZ]/gi) || []).length;
    if (rare >= 3) return false;
    return true;
  }
  const candidates = shuffledArray(
    wordList.map((w) => w.toUpperCase()).filter(isFriendlyWord)
  ).sort((a, b) => b.length - a.length);

  const LONG_MIN = 12;
  const LONG_MAX = 14;
  const isLong = (w) => w.length >= LONG_MIN && w.length <= LONG_MAX;
  const longCandidates = candidates.filter(isLong);
  const usedWords = new Set();

  const countLongPlaced = () => placedWords.reduce((n, p) => n + (p.word && isLong(p.word) ? 1 : 0), 0);

  // Small utilities shared by stages (do NOT touch phrase logic)
  const hasConflict = (path, word) => {
    for (let i = 0; i < path.length; i++) {
      const { key } = path[i];
      const ch = word[i];
      const existing = grid[key];
      if (existing && existing !== ch) return true;
    }
    return false;
  };
  const countOverlapLocal = (path, word) => {
    let overlaps = 0;
    for (let i = 0; i < path.length; i++) {
      const { key } = path[i];
      if (grid[key] === word[i]) overlaps++;
    }
    return overlaps;
  };
  const placementScore = (word, overlaps, pathLen) => {
    const newLetters = pathLen - overlaps;
    const W_OVERLAP = 8;
    const W_LENGTH = 3.5; // strong length bias
    const W_NEW_PEN = 1.2;
    return W_OVERLAP * overlaps + W_LENGTH * word.length - W_NEW_PEN * newLetters;
  };

  // ---------------------------------------------------------------------------
  // STEP 2) Overlapping suffix seeds — unchanged helper
  // ---------------------------------------------------------------------------
  const placedSuffixes = placeOverlappingSuffixes(grid, suffixList, gridRadius);

  if (DEBUG) {
    console.group("🧷 Overlapping suffixes (placed)");
    for (const p of placedSuffixes) {
      const overlapCount = p.path.reduce(
        (n, step, i) => n + (grid[step.key] === p.chunk[i] ? 1 : 0),
        0
      );
      console.log({
        chunk: p.chunk,
        pathLen: p.path.length,
        overlapCount,
        pathKeys: p.path.map((s) => s.key),
      });
    }
    console.groupEnd();
  }

  // ---------------------------------------------------------------------------
  // STEP 3) GUARANTEED LONG WORDS via SUFFIX BRANCHING (priority pass)
  // ---------------------------------------------------------------------------
  // We try to place long words (12–14) *first* from suffix hubs, without touching phrases.
  let neededLong = Math.max(0, 2 - countLongPlaced());

  if (neededLong > 0) {
    const MIN_OVERLAP_WITH_ANCHOR = 1; // allow light anchor touch to land long words
    for (const anchor of placedSuffixes) {
      if (neededLong <= 0) break;
      const keySet = new Set(anchor.path.map((p) => p.key));
      const pool = longCandidates.filter((w) => !usedWords.has(w) && w.endsWith(anchor.chunk));

      for (const word of shuffledArray(pool)) {
        // broaden search to help long words land
        for (const { q, r } of shuffledArray(coords).slice(0, PATH_TRIES)) {
          const path = findPath(grid, word, q, r, 0, new Set(), gridRadius);
          if (!path) continue;

          // require minimal contact with the suffix hub
          let anchorHits = 0;
          for (let i = 0; i < path.length; i++) {
            const key = path[i].key;
            if (keySet.has(key) && grid[key] === word[i]) anchorHits++;
          }
          if (anchorHits < MIN_OVERLAP_WITH_ANCHOR) continue;

          const overlaps = countOverlapLocal(path, word);
          if (hasConflict(path, word)) continue;

          // score for best option from this anchor; commit immediately on first decent find
          // (we're prioritizing GUARANTEE over global optimality here)
          path.forEach(({ key }, i) => (grid[key] = word[i]));
          placedWords.push({ word, path, viaSuffix: anchor.chunk, branched: true, mandatoryLong: true });
          usedWords.add(word);
          neededLong--;
          break; // go to next long word / anchor
        }
        if (neededLong <= 0) break;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // STEP 4) If still short, run a LONG-WORD PASS in General Fill (anchor-biased)
  // ---------------------------------------------------------------------------
  if (neededLong > 0) {
    const anchorKeySets = (placedSuffixes || []).map((s) => new Set((s.path || []).map((p) => p.key)));
    const touchesAnyAnchor = (path, word) => {
      if (!anchorKeySets.length) return 0;
      let touchCount = 0;
      for (let i = 0; i < path.length; i++) {
        const k = path[i].key;
        const ch = word[i];
        for (const ks of anchorKeySets) {
          if (ks.has(k) && grid[k] === ch) { touchCount++; break; }
        }
      }
      return touchCount;
    };

    for (const word of longCandidates) {
      if (neededLong <= 0) break;
      if (usedWords.has(word)) continue;

      let best = null; // {score, path}
      for (const { q, r } of shuffledArray(coords).slice(0, PATH_TRIES)) {
        const path = findPath(grid, word, q, r, 0, new Set(), gridRadius);
        if (!path) continue;
        const overlaps = countOverlapLocal(path, word);
        const anchorTouches = touchesAnyAnchor(path, word);
        // require *some* overlap to avoid floating snakes, but be lenient for long words
        if (overlaps < 1 && anchorTouches === 0) continue;
        if (hasConflict(path, word)) continue;
        const score = placementScore(word, overlaps, path.length) + 40 * anchorTouches; // strong anchor bias
        if (!best || score > best.score) best = { score, path };
      }

      if (best) {
        best.path.forEach(({ key }, i) => (grid[key] = word[i]));
        placedWords.push({ word, path: best.path, mandatoryLong: true });
        usedWords.add(word);
        neededLong--;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // STEP 5) Regular suffix-centered branching (your existing idea), now honoring usedWords
  // ---------------------------------------------------------------------------
  const BRANCHES_PER_SUFFIX = 4;
  const MIN_OVERLAP_WITH_ANCHOR = 2;
  const branchSummary = new Map();
  const bump = (suf, field) => {
    const cur = branchSummary.get(suf) || { placed: 0, failed: 0 };
    cur[field]++; branchSummary.set(suf, cur);
  };

  for (const anchor of placedSuffixes) {
    let placedCount = 0;
    const keySet = new Set(anchor.path.map((p) => p.key));

    const pool = candidates.filter((w) => !usedWords.has(w) && w.endsWith(anchor.chunk));

    if (DEBUG) console.groupCollapsed(`→ Branching from '${anchor.chunk}' (pool=${pool.length})`);

    for (const word of shuffledArray(pool)) {
      if (placedCount >= BRANCHES_PER_SUFFIX) break;
      for (const { q, r } of shuffledArray(coords).slice(0, PATH_TRIES)) {
        const path = findPath(grid, word, q, r, 0, new Set(), gridRadius);
        if (!path) continue;

        let anchorHits = 0;
        for (let i = 0; i < path.length; i++) {
          const key = path[i].key;
          if (keySet.has(key) && grid[key] === word[i]) anchorHits++;
        }
        if (anchorHits < MIN_OVERLAP_WITH_ANCHOR) continue;

        let totalHits = 0;
        for (let i = 0; i < path.length; i++) {
          const key = path[i].key;
          if (grid[key] === word[i]) totalHits++;
        }
        if (totalHits < 2) continue;

        if (hasConflict(path, word)) continue;

        for (let i = 0; i < path.length; i++) {
          const { key } = path[i];
          grid[key] = word[i];
        }
        placedWords.push({ word, path, viaSuffix: anchor.chunk, branched: true });
        usedWords.add(word);
        placedCount++;
        bump(anchor.chunk, 'placed');
        break; // next candidate
      }
    }

    if (placedCount === 0) bump(anchor.chunk, 'failed');
    if (DEBUG) console.groupEnd();
  }

  if (DEBUG) {

    console.groupEnd();
  }

  // ---------------------------------------------------------------------------
  // STEP 6) General fill (score-aware, anchor-biased). Slight length bias kept.
  // ---------------------------------------------------------------------------
  {
    const anchorKeySets = (placedSuffixes || []).map((s) => new Set((s.path || []).map((p) => p.key)));
    const touchesAnyAnchor = (path, word) => {
      if (!anchorKeySets.length) return 0;
      let touchCount = 0;
      for (let i = 0; i < path.length; i++) {
        const k = path[i].key;
        const ch = word[i];
        for (const ks of anchorKeySets) {
          if (ks.has(k) && grid[k] === ch) { touchCount++; break; }
        }
      }
      return touchCount;
    };

    const placementScore2 = (word, overlaps, anchorTouches, pathLen) => {
      const newLetters = pathLen - overlaps;
      const W_ANCHOR = 40;
      const W_OVERLAP = 6;
      const W_LENGTH = 2.2; // mild length preference
      const W_NEW_PEN = 1.5;
      return (
        W_ANCHOR * anchorTouches +
        W_OVERLAP * overlaps +
        W_LENGTH * word.length -
        W_NEW_PEN * newLetters
      );
    };

    for (const word of candidates) {
      if (usedWords.has(word)) continue;
      const attempts = shuffledArray(coords).slice(0, PATH_TRIES);
      let best = null; // {score, path}
      for (const { q, r } of attempts) {
        const path = findPath(grid, word, q, r, 0, new Set(), gridRadius);
        if (!path) continue;
        const overlaps = countOverlapLocal(path, word);
        if (overlaps < MIN_WORD_OVERLAP) continue;
        if (hasConflict(path, word)) continue;
        const anchorTouches = touchesAnyAnchor(path, word);
        // light bias: if no touches, require slightly more overlap
        if (anchorTouches === 0 && overlaps < MIN_WORD_OVERLAP + 1) continue;
        const score = placementScore2(word, overlaps, anchorTouches, path.length);
        if (!best || score > best.score) best = { score, path };
      }
      if (best) {
        best.path.forEach(({ key }, i) => { grid[key] = word[i]; });
        placedWords.push({ word, path: best.path });
        usedWords.add(word);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // STEP 7) Laxer fallback fill (your existing idea)
  // ---------------------------------------------------------------------------
  {
    const anchorKeySets = (placedSuffixes || []).map((s) => new Set((s.path || []).map((p) => p.key)));
    const touchesAnyAnchor = (path, word) => {
      if (!anchorKeySets.length) return 0;
      let touchCount = 0;
      for (let i = 0; i < path.length; i++) {
        const k = path[i].key;
        const ch = word[i];
        for (const ks of anchorKeySets) {
          if (ks.has(k) && grid[k] === ch) { touchCount++; break; }
        }
      }
      return touchCount;
    };

    const placementScore3 = (word, overlaps, anchorTouches, pathLen) => {
      const newLetters = pathLen - overlaps;
      const W_ANCHOR = 30;
      const W_OVERLAP = 5;
      const W_LENGTH = 1.8;
      const W_NEW_PEN = 1.0;
      return (
        W_ANCHOR * anchorTouches +
        W_OVERLAP * overlaps +
        W_LENGTH * word.length -
        W_NEW_PEN * newLetters
      );
    };

    for (const word of candidates) {
      if (usedWords.has(word)) continue;
      const attempts = shuffledArray(coords).slice(0, PATH_TRIES);
      let best = null;
      for (const { q, r } of attempts) {
        const path = findPath(grid, word, q, r, 0, new Set(), gridRadius);
        if (!path) continue;
        const overlaps = countOverlapLocal(path, word);
        if (overlaps < MIN_WORD_OVERLAP) continue;
        if (hasConflict(path, word)) continue;
        const anchorTouches = touchesAnyAnchor(path, word);
        const score = placementScore3(word, overlaps, anchorTouches, path.length);
        if (!best || score > best.score) best = { score, path };
      }
      if (best) {
        best.path.forEach(({ key }, i) => { grid[key] = word[i]; });
        placedWords.push({ word, path: best.path });
        usedWords.add(word);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // HARD REQUIREMENT CHECK — without touching phrase pairs
  // ---------------------------------------------------------------------------
  const longCount = countLongPlaced();
  if (longCount < 2) {
    // Refuse to produce a board that violates spec.
    throw new Error(`Hard requirement failed: only ${longCount} long words (12–14) were placed.`);
  }

  console.log('🧩 Placed words:', placedWords.map(p => p.word));



  const buckets = new Map();
  for (const { word } of placedWords) {
    const k = word.split('').sort().join('');
    (buckets.get(k) || buckets.set(k, []).get(k)).push(word);
  }

  const anagrams = [];
  for (const group of buckets.values()) {
    if (group.length > 1) anagrams.push(...group);
  }

  state.anagramList = anagrams;
  console.log(`🔀 anagram count: ${anagrams.length}`, anagrams);




let failedAttempts = 0;

// ---------- Build scorer-friendly entries with SHARED tile objects ----------
const tileRegistry = new Map(); // key -> shared tile object
function getSharedTile(cell, letter) {
  const k = cell.key;
  let t = tileRegistry.get(k);
  if (!t) {
    t = { key: k, q: cell.q, r: cell.r, letter };
    tileRegistry.set(k, t);
  } else {
    t.letter = letter; // keep consistent
  }
  return t;
}

const boardEntries = (placedWords || []).map(p => {
  const upper = String(p.word || '').toUpperCase();
  return {
    word: upper,
    tiles: (p.path || []).map((cell, i) => getSharedTile(cell, upper.charAt(i)))
  };
});

// ---------- Rank candidates by SOLO score (fast) ----------
const soloScores = (recomputeAllWordScores(boardEntries) || []).map((s, i) => ({
  idx: i,
  word: boardEntries[i].word,
  tiles: boardEntries[i].tiles,
  solo: Number(s || 0)
}));

// ======= After boardEntries and soloScores are computed, where the beam used to prep its pool =======

// Build the pool WITHOUT mutating soloScores (beam-compatible placement)
const POOL_SIZE = 120;
const POOL = [...soloScores]                       // copy to avoid in-place sort
  .sort((a, b) => b.solo - a.solo)
  .slice(0, POOL_SIZE);

// Optional back-compat: if other code still reads CANDIDATES
const CANDIDATES = POOL;

// ---------- Helpers shared by both beam/exact ----------
function scoreSetExact(idxList) {
  const picks = idxList.map(i => boardEntries[i]);
  const perWord = recomputeAllWordScores(picks) || [];
  let total = 0;
  for (let i = 0; i < perWord.length; i++) total += Number(perWord[i] || 0);
  return { total, perWord };
}

// Precompute an optimistic upper bound (admissible)
const OPT = POOL.map(x => ({
  idx: x.idx,
  word: x.word,
  tiles: x.tiles,
  solo: x.solo,
  optimistic: x.solo * 4, // safe overestimate for reuse
}));

// ======= Exact solver (cooperative, won’t block UI) =======
async function solveExactNonBlocking({
  TARGET = 10,
  timeBudgetMs = 800, // stop searching after ~0.8s; keep UI snappy
  sliceMs = 12,       // yield roughly once per frame
  hardNodeCap = 200_000
} = {}) {
  let bestSet = [];
  let bestTotal = -Infinity;

  // Small cache for partial prefix scores
  const partialCache = new Map();
  const keyOf = (idxs) => idxs.join(',');
  const partialScore = (idxs) => {
    const k = keyOf(idxs);
    if (partialCache.has(k)) return partialCache.get(k);
    const { total } = scoreSetExact(idxs);
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
      await Promise.resolve();      // yield
      lastSlice = performance.now();
      if (lastSlice - start > timeBudgetMs || explored > hardNodeCap) break;
    }

    const state = stack.pop();
    const { pos, chosenIdxs, chosenSet, curTotal } = state;
    explored++;

    const have = chosenIdxs.length;
    if (have === 10 /* TARGET */) {
      const { total } = scoreSetExact(chosenIdxs);
      if (total > bestTotal) {
        bestTotal = total;
        bestSet = chosenIdxs.slice();
      }
      continue;
    }

    const left = 10 /* TARGET */ - have;
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

      stack.push({ pos: p + 1, chosenIdxs: nextIdxs, chosenSet: nextSet, curTotal: partialTotal });
    }
  }

  const { total: finalTotal, perWord: finalPerWord } = scoreSetExact(bestSet);
  const best10 = bestSet.map((idx, j) => ({
    word: boardEntries[idx].word,
    score: Number(finalPerWord?.[j] || 0)
  })).sort((a, b) => b.score - a.score);

  return { best10, finalTotal, explored, timedOut: (performance.now() - start) > timeBudgetMs };
}

// ======= Kick off the exact search AFTER the grid renders =======
requestAnimationFrame(() => {
  setTimeout(async () => {
    try {
      const { best10, finalTotal } = await solveExactNonBlocking({ TARGET: 10 });
      if (!best10?.length) {
        console.warn('Exact solver returned no result; consider falling back to beam.');
        return;
      }
      gameState.boardTop10 = best10;
      gameState.boardTop10Total = Number(finalTotal) || 0;
      gameState.boardTop10Paths = best10.map(x => {
        const be = boardEntries.find(b => b.word === x.word);
        return be ? be.tiles.map(t => t.key) : [];
      });

      const checkSum = best10.reduce((s, x) => s + x.score, 0);
      console.log('🏆 Board Top 10 (set-aware, EXACT - non-blocking):');
      best10.forEach((x, i) => console.log(`${i + 1}. ${x.word.toUpperCase()} — ${Math.round(x.score)} pts`));
      console.log('🏅 Board Highest Score:', Math.round(finalTotal));
      console.log('🔎 per-word sum:', Math.round(checkSum), '== highest?', Math.round(checkSum) === Math.round(finalTotal));
    } catch (e) {
      console.error('Exact solver error:', e);
    }
  }, 0);
});



return grid;
}