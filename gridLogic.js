import { GRID_RADIUS as DEFAULT_RADIUS, letterFrequencies, letterPoints, lengthMultipliers, anagramMultiplier, reuseMultipliers } from './constants.js';
import wordList from './wordList.js';
import suffixList from './suffixList.js';
import phraseHints from './phraseHints.js';
import { gameState } from './gameState.js';
import { ADJ_DIRS, hexKey, getAllCoords, isValidCoord } from './gridCoords.js';
import { seedPhrasePair } from './seedPhrases.js';
import { findPath } from './pathfinding.js';
import { findPhrasePath, placePhrase } from './seedPhrases.js';
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
  const DEBUG = true; 

const isDaily = gameState.mode === 'daily';
let placedSuffixes = []; // always defined for debug printing


  const grid = {};
  placedWords.length = 0;

  const coords = getAllCoords(gridRadius);
  const maxTiles = coords.length;
  const MIN_WORD_OVERLAP = 2; 
  const PATH_TRIES = Math.max(1200, (typeof MAX_ATTEMPTS === 'number' ? MAX_ATTEMPTS : 300));

// ─────────────────────────────────────────────────────────────────────────────
// STEP 1) Seed phrase pair — DAILY ONLY (unchanged behavior, deterministic pick)
// ─────────────────────────────────────────────────────────────────────────────

// tiny deterministic RNG so "daily" is reproducible without new deps
function mkSeededRng(seed) {
  // LCG constants (Numerical Recipes)
  let s = (seed >>> 0) || 1;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 0x100000000;
}

// stable daily id like 2025_10_11; replace if you already have one
function getDailyId() {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  return `${y}_${String(m).padStart(2, "0")}_${String(day).padStart(2, "0")}`;
}

// pure: attempt to place a phrase pair exactly like "before", but using a seeded RNG
function placeDailyPhrasePair(grid, gridRadius, rng, maxTries = 100) {
  const coords = getAllCoords(gridRadius);
  const maxTiles = coords.length;

  // helper: pick a random index with the seeded rng
  const pick = (n) => Math.floor(rng() * n);

  for (let i = 0; i < maxTries; i++) {
    const selected = phraseHints[pick(phraseHints.length)];
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
    if (!pathB) {
      // rollback A if B fails (match original semantics of “both or neither”)
      for (let k = 0; k < pathA.length; k++) {
        const key = pathA[k].key;
        // only clear if it still matches A[k]; be conservative about collisions
        if (grid[key] === A[k]) delete grid[key];
      }
      continue;
    }
    placePhrase(grid, pathB, B);

    // mirror the "before" state shape & values
    gameState.seedPhrase = `${rawA} / ${rawB}`;
    gameState.seedPaths = { phraseA: pathA, phraseB: pathB };
    gameState.seedHints = hints;

    return true; // success
  }
  return false; // couldn’t place a pair
}

// ── Dispatcher (insert this where Step 1 lives inside generateSeededBoard) ──
{
  const DEBUG = true;

  if (gameState.mode === "daily") {
    const dailyId = getDailyId();
    const rng = mkSeededRng(
      // turn the id into a simple numeric seed
      Array.from(dailyId).reduce((h, c) => ((h * 131) ^ c.charCodeAt(0)) >>> 0, 2166136261)
    );

    const placed = placeDailyPhrasePair(grid, gridRadius, rng, /*maxTries=*/100);

    if (!placed) {
      // if nothing could be placed today, keep the fields undefined (match “before” failure path)
      gameState.seedPhrase = undefined;
      gameState.seedPaths = undefined;
      gameState.seedHints = undefined;
      DEBUG && console.info(`🌟 Daily (${dailyId}): no seed phrase placed`);
    } else {
      DEBUG && console.info(`🌟 Daily (${dailyId}) seed phrase: ${gameState.seedPhrase}`);
      DEBUG && console.info(`✅ Loaded hints:`, gameState.seedHints);
    }
  } else {
    // UNLIMITED: no phrase pair seeding in Step 1
    gameState.seedPhrase = undefined;
    gameState.seedPaths = undefined;
    gameState.seedHints = undefined;
    // (grid remains empty at this point; later steps handle their own seeding)
    DEBUG && console.info(`(Unlimited) Step 1: phrase pair seeding skipped`);
  }
}


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

    return true;
  }
  const candidates = shuffledArray(
    wordList.map((w) => w.toUpperCase()).filter(isFriendlyWord)
  ).sort((a, b) => b.length - a.length);

  const LONG_MIN = 9;
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

  // ─────────────────────────────────────────────────────────────────────────────
  // Minimal scoring access integration (NEW small patch)
  // ─────────────────────────────────────────────────────────────────────────────

  // Scoring helpers — minimal integration
  function isAnagramLocal(word) {
    return word.length > 1 && word === word.split('').reverse().join('');
  }

  function soloWordMultiplier(word) {
    let mult = 1;
    if (word.length >= 5) {
      mult *= lengthMultipliers[Math.min(word.length, 10)] || 1;
    }
    if (isAnagramLocal(word)) {
      mult *= anagramMultiplier;
    }
    return mult;
  }

  // Estimate expected score contribution for placing `word` on `path`,
  // reusing letter face values and approximating reuse multiplier gains.
  function estimatePlacementScore(word, path) {
    let baseFaceSum = 0;
    let overlapBoost = 0;

    for (let i = 0; i < path.length; i++) {
      const { key } = path[i];
      const letter = word[i];
      const face = letterPoints[letter] || 1;
      const existing = grid[key];

      if (existing === letter) {
        // approximate how many words already use this tile
        let uses = 0;
        for (const pw of placedWords) {
          if (!pw.path) continue;
          for (const step of pw.path) {
            if (step.key === key) { uses++; break; }
          }
        }
        const nextUses = uses + 1;
        const nextMult = nextUses >= 3 ? reuseMultipliers[3] : (reuseMultipliers[nextUses] || 1);
        const priorMult = uses >= 3 ? reuseMultipliers[3] : (reuseMultipliers[uses] || 1) || 1;
        overlapBoost += face * (nextMult - priorMult);
      } else {
        baseFaceSum += face;
      }
    }

    return (baseFaceSum + overlapBoost) * soloWordMultiplier(word);
  }

  // Replace local placement scoring with estimator integration
  const placementScore = (word, overlaps, pathLen, path) => {
    const estimated = estimatePlacementScore(word, path);
    const newLetters = pathLen - overlaps;
    const W_OVERLAP = 2.0;
    const W_NEW_PEN = 0.4;
    return estimated + W_OVERLAP * overlaps - W_NEW_PEN * newLetters;
  };

  const placementScore2 = (word, overlaps, anchorTouches, pathLen, path) => {
    const estimated = estimatePlacementScore(word, path);
    const newLetters = pathLen - overlaps;
    const W_ANCHOR = 30;
    const W_OVERLAP = 3;
    const W_NEW_PEN = 1.4;
    return (
      estimated +
      W_ANCHOR * anchorTouches +
      W_OVERLAP * overlaps -
      W_NEW_PEN * newLetters
    );
  };

  const preLetters = Object.keys(grid).length;
DEBUG && console.info(`[diag] pre-Step2 letters=${preLetters}, mode=${gameState.mode}`);
DEBUG && preLetters === 0 && console.info('[diag] grid is empty before suffix placement');

  
// ---------------------------------------------------------------------------
// STEP 2) Overlapping suffix seeds
// ---------------------------------------------------------------------------

// keep the same variable shape no matter the mode
 placedSuffixes = [];

if (gameState.mode === 'daily') {
  placedSuffixes = placeOverlappingSuffixes(grid, suffixList, gridRadius);

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
} else {
  DEBUG && console.info("(Unlimited) Step 2 skipped: no prior anchors to overlap");
}


// ---------------------------------------------------------------------------
// STEP 3) GUARANTEED LONG WORDS
//  - Daily: unchanged suffix-branching off placedSuffixes
//  - Unlimited: if grid is empty, bootstrap 2–3 long-word anchors with varied,
//               center-biased, anti-wall paths (reduces repetition and wall hugging)
// ---------------------------------------------------------------------------
const postLetters = Object.keys(grid).length;
DEBUG && console.info(`[diag] post-Step2 letters=${postLetters}, suffixesPlaced=${placedSuffixes.length}`);

function coordKey(q, r) { return `${q},${r}`; }

// True axial hex distance from center (for better center bias)
function hexDistance(q, r) {
  return (Math.abs(q) + Math.abs(r) + Math.abs(q + r)) / 2;
}

// Lightweight RNG (seeded per run to diversify bootstrap)
function makeRng(seed = Date.now()) {
  let s = (seed >>> 0) || 1;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 0x100000000;
}

// Weighted pick helper for randomized template
function pickWeighted(list, rng = Math.random) {
  const sum = list.reduce((s, x) => s + x.w, 0);
  if (sum <= 0) return list[0];
  let t = rng() * sum;
  for (const item of list) {
    t -= item.w;
    if (t <= 0) return item;
  }
  return list[list.length - 1];
}

// Random centerish start: pick among the k-most-central cells
function getRandomCenterishStart(coords, rng, k = 5) {
  const sorted = [...coords].sort(
    (a, b) => hexDistance(a.q, a.r) - hexDistance(b.q, b.r)
  );
  const top = sorted.slice(0, Math.min(k, sorted.length));
  return top[Math.floor(rng() * top.length)];
}

// Varied, center-biased, anti-wall template (fallback when findPath fails)
function buildVariedAnchorPath(coords, gridRadius, targetLen, avoidKeys = new Set(), rng = Math.random) {
  const coordMap = new Map(coords.map(c => [coordKey(c.q, c.r), c]));
  const visited = new Set([...avoidKeys]);
  const path = [];

  let cur = getRandomCenterishStart(coords, rng);
  if (!cur) return null;

  // Directions in axial basis; we’ll shuffle each step
  const DIRS = [
    { dq: +1, dr:  0 }, { dq: +1, dr: -1 }, { dq:  0, dr: -1 },
    { dq: -1, dr:  0 }, { dq: -1, dr: +1 }, { dq:  0, dr: +1 },
  ];
  let prevDir = null;

  for (let i = 0; i < targetLen; i++) {
    const key = coordKey(cur.q, cur.r);
    if (visited.has(key)) return null;
    visited.add(key);
    path.push({ q: cur.q, r: cur.r, key });

    if (path.length === targetLen) break;

    // Shuffle directions to avoid determinism
    for (let j = DIRS.length - 1; j > 0; j--) {
      const k = Math.floor(rng() * (j + 1));
      [DIRS[j], DIRS[k]] = [DIRS[k], DIRS[j]];
    }

    const hereCenter = hexDistance(cur.q, cur.r);
    const candidates = [];
    for (const d of DIRS) {
      const nq = cur.q + d.dq, nr = cur.r + d.dr;
      const nKey = coordKey(nq, nr);
      if (!coordMap.has(nKey)) continue;
      if (visited.has(nKey)) continue;

      const centerDist = hexDistance(nq, nr);
      const outward = centerDist > hereCenter;

      // Score:
      //  - prefer staying central (radius - centerDist)
      //  - mild penalty for moving outward
      //  - gentle encouragement to turn (avoid long straight runs)
      //  - small randomness to break ties
      const centerBias = (gridRadius - centerDist);
      const sameDir = prevDir && prevDir.dq === d.dq && prevDir.dr === d.dr;
      const straightPenalty = sameDir ? -0.5 : 0.35; // prefer occasional turns
      const outwardPenalty = outward ? -0.7 : 0;
      const jitter = (rng() - 0.5) * 0.8;

      const score = 1.2 * centerBias + straightPenalty + outwardPenalty + jitter;
      candidates.push({ nq, nr, key: nKey, dir: d, score });
    }

    if (!candidates.length) return null;

    // Normalize scores into positive weights
    const minScore = candidates.reduce((m, c) => Math.min(m, c.score), Infinity);
    const shift = minScore < 0 ? -minScore + 0.0001 : 0.0001;
    for (const c of candidates) c.w = c.score + shift;

    const chosen = pickWeighted(candidates, rng);
    cur = { q: chosen.nq, r: chosen.nr };
    prevDir = chosen.dir;
  }

  return path.length === targetLen ? path : null;
}

function placeWordOnPath(grid, word, path) {
  for (let i = 0; i < path.length; i++) grid[path[i].key] = word[i];
}

// Try standard pathfinder from multiple random starts; fallback to varied template
function tryStandardPlacementOrTemplate(word, coords, gridRadius, occupiedKeys = new Set(), rng = Math.random) {
  // Multiple random starts for better success rate on empty boards
  const starts = shuffledArray(coords).slice(0, Math.min(coords.length, 40));
  for (const { q, r } of starts) {
    const path = findPath(
      grid, word, q, r, 0, new Set(), gridRadius,
      {
        allowZigZag: true,
        preferOverlap: false,  // critical: nothing to overlap at bootstrap
        wallBuffer: 0,         // relax near-wall checks initially
        maxEdgeRun: 999,       // disable wall-run caps at bootstrap
        maxStraight: 5         // allow longer straight runs for long anchors
      }
    );
    if (path) return { path, viaTemplate: false };
  }

  // Fallback: center-biased varied template (not deterministic)
  const template =
    buildVariedAnchorPath(coords, gridRadius, word.length, occupiedKeys, rng) ||
    buildVariedAnchorPath(coords, gridRadius, word.length, occupiedKeys, rng);

  if (template) return { path: template, viaTemplate: true };
  return null;
}

// ---- Unlimited Bootstrap (only when no letters exist yet) ----
if (postLetters === 0 && gameState.mode !== 'daily') {
  const rng = makeRng(Date.now());
  DEBUG && console.info('🚀 Unlimited bootstrap: placing long-word anchors (varied)');

  const anchorsMax = 3;      // place 2–3 anchors
  let anchorsPlaced = 0;

  const occupied = new Set();
  const chosen = [];

  // Preselect a pool of diverse long words
  for (const w of longCandidates) {
    if (usedWords.has(w)) continue;
    chosen.push(w);
    if (chosen.length >= 400) break;
  }

  for (const word of chosen) {
    if (anchorsPlaced >= anchorsMax) break;

    const result = tryStandardPlacementOrTemplate(word, coords, gridRadius, occupied, rng);
    if (!result) continue;

    const { path, viaTemplate } = result;
    placeWordOnPath(grid, word, path);

    // Mark occupancy so subsequent template attempts don’t reuse cells
    if (viaTemplate) for (const step of path) occupied.add(step.key);

    placedWords.push({
      word,
      path,
      bootstrapAnchor: true,
      viaTemplate,
      mandatoryLong: true,
    });
    usedWords.add(word);
    anchorsPlaced++;
  }

  DEBUG && console.info(`✅ Bootstrap anchors placed: ${[...placedWords.filter(p => p.bootstrapAnchor).map(p => p.word)].join(', ')}`);
}

// ---- Daily suffix-branch branching (unchanged) ----
let neededLong = Math.max(0, 2 - countLongPlaced());

if (neededLong > 0 && placedSuffixes.length > 0) {
  const MIN_OVERLAP_WITH_ANCHOR = 1;
  for (const anchor of placedSuffixes) {
    if (neededLong <= 0) break;
    const keySet = new Set(anchor.path.map((p) => p.key));
    const pool = longCandidates.filter((w) => !usedWords.has(w) && w.endsWith(anchor.chunk));

    for (const word of shuffledArray(pool)) {
      for (const { q, r } of shuffledArray(coords).slice(0, PATH_TRIES)) {
        const path = findPath(grid, word, q, r, 0, new Set(), gridRadius);
        if (!path) continue;

        let anchorHits = 0;
        for (let i = 0; i < path.length; i++) {
          const key = path[i].key;
          if (keySet.has(key) && grid[key] === word[i]) anchorHits++;
        }
        if (anchorHits < MIN_OVERLAP_WITH_ANCHOR) continue;

        const overlaps = countOverlapLocal(path, word);
        if (hasConflict(path, word)) continue;

        path.forEach(({ key }, i) => (grid[key] = word[i]));
        placedWords.push({ word, path, viaSuffix: anchor.chunk, branched: true, mandatoryLong: true });
        usedWords.add(word);
        neededLong--;
        break;
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
        const score = placementScore(word, overlaps, path.length, path) + 40 * anchorTouches; // strong anchor bias
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

    for (const word of pool.sort((a, b) => b.length - a.length)) {
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
        // Optional: compute heuristic score for debugging
        const overlaps = countOverlapLocal(path, word);
        const heuristicScore = placementScore(word, overlaps, path.length, path);

        placedWords.push({ word, path, viaSuffix: anchor.chunk, branched: true, heuristicScore });
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

    const placementScore2 = (word, overlaps, anchorTouches, pathLen, path) => {
      const estimated = estimatePlacementScore(word, path);
      const newLetters = pathLen - overlaps;
      const W_ANCHOR = 30;
      const W_OVERLAP = 3;
      const W_NEW_PEN = 1.4;
      return (
        estimated +
        W_ANCHOR * anchorTouches +
        W_OVERLAP * overlaps -
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
        const score = placementScore2(word, overlaps, anchorTouches, path.length, path);
        if (!best || score > best.score) best = { score, path };
      }
      if (best) {
        best.path.forEach(({ key }, i) => { grid[key] = word[i]; });
        placedWords.push({ word, path: best.path });
        usedWords.add(word);
      }
    }
  }

  // Count 4- and 5-letter word tiles from Step 6 only
{
  const step6StartIndex = placedWords.findIndex(p => !p.mandatoryLong && !p.branched && !p.bootstrapAnchor);
  const step6Placed = placedWords.slice(step6StartIndex);
  const tilesUsed = new Set();
  
  for (const { word, path } of step6Placed) {
    if (word.length === 4 || word.length === 5) {
      path.forEach(({ key }) => tilesUsed.add(key));
    }
  }

  console.log(`🎯 Step 6 — unique tiles used in 4- and 5-letter words: ${tilesUsed.size}`);
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
    const { best10, finalTotal, timedOut, explored } = await solveExactNonBlocking({
    POOL,
    boardEntries,
    TARGET: 10,
    timeBudgetMs: 2500,
    sliceMs: 16,
    hardNodeCap: 600_000,
    earlyAcceptRatio: 1.01,
    onProgress: ({ explored, bestTotal, depth }) => {
    if (explored % 5000 === 0) {
      console.log(`[solver-progress] explored=${explored} depth=${depth} best=${bestTotal}`);
    }
  }
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