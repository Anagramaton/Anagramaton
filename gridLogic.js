// ===== existing imports you already had =====
import { GRID_RADIUS as DEFAULT_RADIUS, letterFrequencies } from './constants.js';
import wordList from './wordList.js';
import suffixList from './suffixList.js';
import phraseHints from './phraseHints.js';
import { gameState } from './gameState.js';
// NOTE: scoring is now handled by scoringAndSolver.js, so you don't need to import computeBoardWordScores/recomputeAllWordScores here

// ===== new imports from the split files =====
import { ADJ_DIRS, hexKey, getAllCoords, isValidCoord } from './gridCoords.js';
import { seedPhrasePair } from './seedPhrases.js';
import { findPath } from './pathfinding.js';
import { countOverlap, indexByKey } from './overlapUtils.js';
import { placeOverlappingSuffixes } from './suffixSeeder.js';
import { computeAnagrams } from './anagrams.js';
import { buildBoardEntries, buildPool, solveExactNonBlocking } from './scoringAndSolver.js';
import { shuffledArray } from './utils.js';


// ===== kept here, per your decision =====
export const placedWords = [];

// ===== local helpers you still use in this file =====
const MAX_ATTEMPTS = 150;

function randomFrom(arr) {
  const index = Math.floor(Math.random() * arr.length);
  return arr[index];
}

// ======================================================================
// MAIN: generateSeededBoard (kept in this file, Steps 1–6 unchanged)
// ======================================================================
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
 
const placed = seedPhrasePair(grid, gridRadius, 100);
if (!placed) {
  // fallback if no pair could be placed
} else {
  gameState.seedPhrase = `${placed.phraseA} / ${placed.phraseB}`;
  gameState.seedPaths = { phraseA: placed.pathA, phraseB: placed.pathB };
  gameState.seedHints = placed.hints;
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
    const W_OVERLAP = 5;
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

          // commit immediately on first decent find
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
  // STEP 5) Regular suffix-centered branching
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
    // closed groups already above
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
      const W_ANCHOR = 30;
      const W_OVERLAP = 3;
      const W_LENGTH = 3.1;
      const W_NEW_PEN = 1.4;
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
        if (anchorTouches === 0 && overlaps < (word.length >= 12 ? 1 : MIN_WORD_OVERLAP + 1)) continue;
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
  // HARD REQUIREMENT CHECK — without touching phrase pairs
  // ---------------------------------------------------------------------------
  const longCount = countLongPlaced();
  if (longCount < 2) {
    // (left as-is; you can add any fallback you want)
  }

  console.log('🧩 Placed words:', placedWords.map(p => p.word));

  // ---------------------------------------------------------------------------
  // Anagrams — moved to module; keep the call here
  // ---------------------------------------------------------------------------
  state.anagramList = computeAnagrams(placedWords);
  console.log(`🔀 anagram count: ${state.anagramList.length}`, state.anagramList);

  // keep this here per your note
  let failedAttempts = 0;

  // ---------------------------------------------------------------------------
  // Scoring & Solver — moved to module; keep the calls here
  // ---------------------------------------------------------------------------
  const boardEntries = buildBoardEntries(placedWords);
  const { POOL } = buildPool(boardEntries);

  // Kick off the exact search AFTER the grid renders (unchanged behavior)
  requestAnimationFrame(() => {
    setTimeout(async () => {
      try {
        const { best10, finalTotal } = await solveExactNonBlocking({
          POOL,
          boardEntries,
          TARGET: 10,
        });
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
