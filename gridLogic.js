import { GRID_RADIUS as DEFAULT_RADIUS, letterFrequencies, letterPoints, lengthMultipliers, anagramMultiplier, reuseMultipliers } from './constants.js';
import wordList from './wordList.js';
import suffixList from './suffixList.js';
import phraseHints from './phraseHints.js';
import { gameState } from './gameState.js';
import { ADJ_DIRS, hexKey, getAllCoords, isValidCoord } from './gridCoords.js';
import { findPath } from './pathfinding.js';
import { findPhrasePath, placePhrase } from './seedPhrases.js';
import { placeOverlappingSuffixes } from './suffixSeeder.js';
import { computeAnagrams } from './anagrams.js';
import { buildBoardEntries, buildPool, solveExactNonBlocking } from './scoringAndSolver.js';
import { shuffledArray } from './utils.js';
import bootstrapWords from './bootstrapWords.js';

export const placedWords = [];

const MAX_ATTEMPTS = 150;

// ─── Moved outside so both generateSeededBoard and _generateBoard can use them ───

function mkSeededRng(seed) {
  let s = (seed >>> 0) || 1;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 0x100000000;
}

function getDailyId() {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  return `${y}_${String(m).padStart(2, "0")}_${String(day).padStart(2, "0")}`;
}

function placeDailyPhrasePair(grid, gridRadius, rng, maxTries = 100) {
  const coords = getAllCoords(gridRadius);
  const maxTiles = coords.length;
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
      for (let k = 0; k < pathA.length; k++) {
        const key = pathA[k].key;
        if (grid[key] === A[k]) delete grid[key];
      }
      continue;
    }
    placePhrase(grid, pathB, B);

    gameState.seedPhrase = `${rawA} / ${rawB}`;
    gameState.seedPaths = { phraseA: pathA, phraseB: pathB };
    gameState.seedHints = hints;

    return true;
  }
  return false;
}

function seededShuffle(arr) {
  if (gameState.mode !== 'daily' || !gameState.dailyRng) {
    return shuffledArray(arr);
  }
  const copy = Array.isArray(arr) ? arr.slice() : Array.from(arr);
  const r = gameState.dailyRng;
  for (let i = copy.length - 1; i > 0; i--) {
    const j = (r() * (i + 1)) | 0;
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// ======================================================================
// PUBLIC ENTRY POINT — thin wrapper that installs the seeded RNG for
// daily mode so that EVERY call inside (findPath, shuffledArray, etc.)
// is deterministic. Math.random is always restored in the finally block.
// ======================================================================
export function generateSeededBoard(gridRadius = DEFAULT_RADIUS, state = gameState) {
  if (gameState.mode === 'daily') {
    const dailyId = getDailyId();
    gameState.dailyId = dailyId;

    const seedNum = Array.from(dailyId)
      .reduce((h, c) => ((h * 131) ^ c.charCodeAt(0)) >>> 0, 2166136261);

    const rng = mkSeededRng(seedNum);
    gameState.dailyRng = rng;

    const originalRandom = Math.random;
    Math.random = rng;

    // Reset solver promise for this new board
    gameState.boardSolverReady = new Promise((resolve) => {
      gameState._resolveBoardSolver = resolve;
    });

    try {
      return _generateBoard(gridRadius, state);
    } finally {
      Math.random = originalRandom;
    }
  }

  // Unlimited — clear daily state and generate normally
  gameState.seedPhrase = undefined;
  gameState.seedPaths = undefined;
  gameState.seedHints = undefined;
  gameState.dailyRng = undefined;

  // Reset solver promise for this new board
  gameState.boardSolverReady = new Promise((resolve) => {
    gameState._resolveBoardSolver = resolve;
  });

  return _generateBoard(gridRadius, state);
}
// ======================================================================
// INTERNAL: all existing generation logic, unchanged
// ======================================================================
function _generateBoard(gridRadius = DEFAULT_RADIUS, state = gameState) {
  const DEBUG = true;

  const isDaily = gameState.mode === 'daily';
  let placedSuffixes = [];

  const grid = {};
  placedWords.length = 0;

  const coords = getAllCoords(gridRadius);
  const maxTiles = coords.length;
  const MIN_WORD_OVERLAP = 2;
  const PATH_TRIES = Math.max(61, (typeof MAX_ATTEMPTS === 'number' ? MAX_ATTEMPTS : 61));

  // ─────────────────────────────────────────────────────────────────────────────
  // STEP 1) Seed phrase pair — DAILY ONLY
  // ─────────────────────────────────────────────────────────────────────────────
  {
    const DEBUG = true;

    if (gameState.mode === "daily") {
      // dailyId and dailyRng are already set by generateSeededBoard wrapper
      const dailyId = gameState.dailyId;
      const rng = gameState.dailyRng;

      const placed = placeDailyPhrasePair(grid, gridRadius, rng, 100);

      if (!placed) {
        gameState.seedPhrase = undefined;
        gameState.seedPaths = undefined;
        gameState.seedHints = undefined;
        DEBUG && console.info(`🌟 Daily (${dailyId}): no seed phrase placed`);
      } else {
        DEBUG && console.info(`🌟 Daily (${dailyId}) seed phrase: ${gameState.seedPhrase}`);
        DEBUG && console.info(`✅ Loaded hints:`, gameState.seedHints);
      }
    } else {
      gameState.seedPhrase = undefined;
      gameState.seedPaths = undefined;
      gameState.seedHints = undefined;
      DEBUG && console.info(`(Unlimited) Step 1: phrase pair seeding skipped`);
    }
  }

  // ---------------------------------------------------------------------------
  // Candidate prep
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
  const candidates = seededShuffle(
    wordList.map((w) => w.toUpperCase()).filter(isFriendlyWord)
  ).sort((a, b) => b.length - a.length);

  const LONG_MIN = 9;
  const LONG_MAX = 14;
  const isLong = (w) => w.length >= LONG_MIN && w.length <= LONG_MAX;
  const longCandidates = candidates.filter(isLong);
  const usedWords = new Set();

  const countLongPlaced = () => placedWords.reduce((n, p) => n + (p.word && isLong(p.word) ? 1 : 0), 0);

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
  // Scoring helpers
  // ─────────────────────────────────────────────────────────────────────────────
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

  function estimatePlacementScore(word, path) {
    let baseFaceSum = 0;
    let overlapBoost = 0;

    for (let i = 0; i < path.length; i++) {
      const { key } = path[i];
      const letter = word[i];
      const face = letterPoints[letter] || 1;
      const existing = grid[key];

      if (existing === letter) {
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

  // ---------------------------------------------------------------------------
  // STEP 2) Overlapping suffix seeds
  // ---------------------------------------------------------------------------
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
  }

  const postLetters = Object.keys(grid).length;
  DEBUG && console.info(`[diag] post-Step2 letters=${postLetters}, suffixesPlaced=${placedSuffixes.length}`);

  function coordKey(q, r) { return `${q},${r}`; }

  function hexDistance(q, r) {
    return (Math.abs(q) + Math.abs(r) + Math.abs(q + r)) / 2;
  }

  function makeRng(seed = Date.now()) {
    let s = (seed >>> 0) || 1;
    return () => (s = (s * 1664525 + 1013904223) >>> 0) / 0x100000000;
  }

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

  function getRandomCenterishStart(coords, rng, k = 5) {
    const sorted = [...coords].sort(
      (a, b) => hexDistance(a.q, a.r) - hexDistance(b.q, b.r)
    );
    const top = sorted.slice(0, Math.min(k, sorted.length));
    return top[Math.floor(rng() * top.length)];
  }

  function buildVariedAnchorPath(coords, gridRadius, targetLen, avoidKeys = new Set(), rng = Math.random) {
    const coordMap = new Map(coords.map(c => [coordKey(c.q, c.r), c]));
    const visited = new Set([...avoidKeys]);
    const path = [];

    let cur = getRandomCenterishStart(coords, rng);
    if (!cur) return null;

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

        const centerBias = (gridRadius - centerDist);
        const sameDir = prevDir && prevDir.dq === d.dq && prevDir.dr === d.dr;
        const straightPenalty = sameDir ? -0.5 : 0.35;
        const outwardPenalty = outward ? -0.7 : 0;
        const jitter = (rng() - 0.5) * 0.8;

        const score = 1.2 * centerBias + straightPenalty + outwardPenalty + jitter;
        candidates.push({ nq, nr, key: nKey, dir: d, score });
      }

      if (!candidates.length) return null;

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

  function tryStandardPlacementOrTemplate(word, coords, gridRadius, occupiedKeys = new Set(), rng = Math.random) {
    const starts = seededShuffle(coords).slice(0, Math.min(coords.length, 40));
    for (const { q, r } of starts) {
      const path = findPath(
        grid, word, q, r, 0, new Set(), gridRadius,
        {
          allowZigZag: true,
          preferOverlap: false,
          wallBuffer: 0,
          maxEdgeRun: 999,
          maxStraight: 5
        }
      );
      if (path) return { path, viaTemplate: false };
    }

    const template =
      buildVariedAnchorPath(coords, gridRadius, word.length, occupiedKeys, rng) ||
      buildVariedAnchorPath(coords, gridRadius, word.length, occupiedKeys, rng);

    if (template) return { path: template, viaTemplate: true };
    return null;
  }

    // Step 2b — Bootstrap anchor (unlimited only, when grid is empty)
  if (postLetters === 0 && gameState.mode !== 'daily') {
    const rng = makeRng(Date.now());
    const occupied = new Set();

    // ── Suffix rotation deck ─────────────────────────────────────────────────
    // Build the eligible suffix list (must have 2+ matching bootstrap words)
    const eligibleSuffixes = suffixList
      .map(suffix => {
        const upper = suffix.toUpperCase();
        const pool = bootstrapWords.filter(w => !usedWords.has(w) && w.endsWith(upper));
        return { suffix: upper, pool };
      })
      .filter(s => s.pool.length >= 2);

    // If the deck is empty or exhausted, reshuffle all eligible suffixes into it
    if (!gameState.suffixDeck || gameState.suffixDeck.length === 0) {
      gameState.suffixDeck = seededShuffle(eligibleSuffixes.map(s => s.suffix));
      DEBUG && console.info(`🔀 Suffix deck reshuffled — ${gameState.suffixDeck.length} suffixes in rotation`);
    }

    // Draw the next suffix from the top of the deck
    const selectedSuffix = gameState.suffixDeck.pop();
    const selectedEntry = eligibleSuffixes.find(s => s.suffix === selectedSuffix);
    let suffixPool = selectedEntry ? seededShuffle(selectedEntry.pool) : [];

    DEBUG && console.info(`🎯 Bootstrap suffix: "${selectedSuffix}" — pool: ${suffixPool.length} words — ${gameState.suffixDeck.length} remaining in deck`);

    // ── Fallback — no suffix with 2+ matches ────────────────────────────────
    if (!selectedSuffix || suffixPool.length < 2) {
      DEBUG && console.info(`⚠️ No suffix with 2+ matches — placing single anchor from full pool`);
      const fallbackPool = seededShuffle(bootstrapWords).filter(w => !usedWords.has(w));
      for (const word of fallbackPool) {
        const result = tryStandardPlacementOrTemplate(word, coords, gridRadius, occupied, rng);
        if (!result) continue;
        const { path, viaTemplate } = result;
        placeWordOnPath(grid, word, path);
        if (viaTemplate) for (const step of path) occupied.add(step.key);
        placedWords.push({ word, path, bootstrapAnchor: true, viaTemplate, mandatoryLong: true });
        usedWords.add(word);
        break;
      }
      DEBUG && console.info(`✅ Bootstrap anchors placed: ${[...placedWords.filter(p => p.bootstrapAnchor).map(p => p.word)].join(', ')}`);
      return;
    }

    // ── Place first anchor word ──────────────────────────────────────────────
    let firstPath = null;
    let firstWord = null;
    let suffixTileKeys = null;

    for (const word of suffixPool) {
      const result = tryStandardPlacementOrTemplate(word, coords, gridRadius, occupied, rng);
      if (!result) continue;

      firstWord = word;
      firstPath = result.path;

      const suffixStart = word.length - selectedSuffix.length;
      suffixTileKeys = new Set(firstPath.slice(suffixStart).map(t => t.key));

      placeWordOnPath(grid, word, firstPath);
      if (result.viaTemplate) for (const step of firstPath) occupied.add(step.key);

      placedWords.push({
        word,
        path: firstPath,
        bootstrapAnchor: true,
        viaTemplate: result.viaTemplate,
        mandatoryLong: true,
      });
      usedWords.add(word);
      DEBUG && console.info(`🔵 Bootstrap anchor 1: "${word}" — suffix "${selectedSuffix}"`);
      break;
    }

    if (!firstWord || !suffixTileKeys) {
      DEBUG && console.info(`⚠️ Could not place first bootstrap anchor`);
      return;
    }

    // ── Place second anchor word — must reuse the suffix tiles ───────────────
    const remainingPool = suffixPool.filter(w => w !== firstWord && !usedWords.has(w));
    let secondPlaced = false;

    // ATTEMPT 1 — suffix portion lands on the exact same tiles
    for (const word of remainingPool) {
      for (const { q, r } of seededShuffle(coords).slice(0, PATH_TRIES)) {
        const path = findPath(grid, word, q, r, 0, new Set(), gridRadius, {
          allowZigZag: true,
          preferOverlap: true,
          wallBuffer: 0,
          maxEdgeRun: 999,
          maxStraight: 5,
        });
        if (!path) continue;
        if (hasConflict(path, word)) continue;

        const suffixStart = word.length - selectedSuffix.length;
        const thisSuffixKeys = new Set(path.slice(suffixStart).map(t => t.key));
        const sharedSuffixTiles = [...thisSuffixKeys].filter(k => suffixTileKeys.has(k));
        if (sharedSuffixTiles.length < selectedSuffix.length) continue;

        placeWordOnPath(grid, word, path);
        for (const step of path) occupied.add(step.key);
        placedWords.push({ word, path, bootstrapAnchor: true, viaTemplate: false, mandatoryLong: true });
        usedWords.add(word);
        secondPlaced = true;
        DEBUG && console.info(`🔵 Bootstrap anchor 2: "${word}" — shares suffix tiles with "${firstWord}"`);
        break;
      }
      if (secondPlaced) break;
    }

    // ATTEMPT 2 — fallback: any bootstrap word containing the suffix string
    // anywhere in the word, landing on the same suffix tiles
    if (!secondPlaced) {
      DEBUG && console.info(`⚠️ Attempt 1 failed — trying words containing "${selectedSuffix}" anywhere`);

      const containsPool = seededShuffle(bootstrapWords).filter(w =>
        !usedWords.has(w) &&
        w.includes(selectedSuffix) &&
        !suffixPool.includes(w)
      );

      for (const word of containsPool) {
        const matchPositions = [];
        let searchFrom = 0;
        while (true) {
          const pos = word.indexOf(selectedSuffix, searchFrom);
          if (pos === -1) break;
          matchPositions.push(pos);
          searchFrom = pos + 1;
        }

        let placed = false;
        for (const { q, r } of seededShuffle(coords).slice(0, PATH_TRIES)) {
          const path = findPath(grid, word, q, r, 0, new Set(), gridRadius, {
            allowZigZag: true,
            preferOverlap: true,
            wallBuffer: 0,
            maxEdgeRun: 999,
            maxStraight: 5,
          });
          if (!path) continue;
          if (hasConflict(path, word)) continue;

          let suffixOverlapFound = false;
          for (const pos of matchPositions) {
            const thisSuffixKeys = new Set(
              path.slice(pos, pos + selectedSuffix.length).map(t => t.key)
            );
            const shared = [...thisSuffixKeys].filter(k => suffixTileKeys.has(k));
            if (shared.length === selectedSuffix.length) {
              suffixOverlapFound = true;
              break;
            }
          }
          if (!suffixOverlapFound) continue;

          placeWordOnPath(grid, word, path);
          for (const step of path) occupied.add(step.key);
          placedWords.push({ word, path, bootstrapAnchor: true, viaTemplate: false, mandatoryLong: true });
          usedWords.add(word);
          secondPlaced = true;
          DEBUG && console.info(`🔵 Bootstrap anchor 2 (fallback): "${word}" — contains "${selectedSuffix}" landing on shared tiles`);
          placed = true;
          break;
        }
        if (placed) break;
      }
    }

    if (!secondPlaced) {
      DEBUG && console.info(`⚠️ Could not place second anchor — board continues with 1 anchor`);
    }

    DEBUG && console.info(`✅ Bootstrap anchors placed: ${[...placedWords.filter(p => p.bootstrapAnchor).map(p => p.word)].join(', ')}`);
  }
  // ---------------------------------------------------------------------------
  // STEP 3) Long words via suffix anchors
  // ---------------------------------------------------------------------------
  let neededLong = Math.max(0, 2 - countLongPlaced());

  if (neededLong > 0 && placedSuffixes.length > 0) {
    const MIN_OVERLAP_WITH_ANCHOR = 1;
    for (const anchor of placedSuffixes) {
      if (neededLong <= 0) break;
      const keySet = new Set(anchor.path.map((p) => p.key));
      const pool = longCandidates.filter((w) => !usedWords.has(w) && w.endsWith(anchor.chunk));

      for (const word of seededShuffle(pool)) {
        for (const { q, r } of seededShuffle(coords).slice(0, PATH_TRIES)) {
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
  // STEP 4) Long word pass (anchor-biased)
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

      let best = null;
      for (const { q, r } of seededShuffle(coords).slice(0, PATH_TRIES)) {
        const path = findPath(grid, word, q, r, 0, new Set(), gridRadius);
        if (!path) continue;
        const overlaps = countOverlapLocal(path, word);
        const anchorTouches = touchesAnyAnchor(path, word);
        if (overlaps < 1 && anchorTouches === 0) continue;
        if (hasConflict(path, word)) continue;
        const score = placementScore(word, overlaps, path.length, path) + 40 * anchorTouches;
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
  const MIN_OVERLAP_WITH_ANCHOR = 1;
  const branchSummary = new Map();
  const bump = (suf, field) => {
    const cur = branchSummary.get(suf) || { placed: 0, failed: 0 };
    cur[field]++; branchSummary.set(suf, cur);
  };

  for (const anchor of placedSuffixes) {
    let placedCount = 0;
    const keySet = new Set(anchor.path.map((p) => p.key));

    const pool = candidates
      .filter((w) => !usedWords.has(w) && w.endsWith(anchor.chunk))
      .slice(0, 120);

    for (const word of pool.sort((a, b) => b.length - a.length)) {
      if (placedCount >= BRANCHES_PER_SUFFIX) break;
      for (const { q, r } of seededShuffle(coords).slice(0, PATH_TRIES)) {
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

        const overlaps = countOverlapLocal(path, word);
        const heuristicScore = placementScore(word, overlaps, path.length, path);

        placedWords.push({ word, path, viaSuffix: anchor.chunk, branched: true, heuristicScore });
        usedWords.add(word);
        placedCount++;
        bump(anchor.chunk, 'placed');
        console.log(`🧷 Step 5 | suffix "${anchor.chunk}" → placed "${word}" (${word.length} letters, ${overlaps} overlaps, score ${Math.round(heuristicScore)})`);
        break;
      }
    }

    if (placedCount === 0) bump(anchor.chunk, 'failed');
  }
console.group('📊 Step 5 — all placed words');
  console.table(
    placedWords
      .filter(p => p.branched && !p.mandatoryLong)
      .map(p => ({
        word:        p.word,
        suffix:      p.viaSuffix,
        length:      p.word.length,
        overlaps:    p.heuristicScore ? '(see score)' : '?',
        score:       Math.round(p.heuristicScore ?? 0),
      }))
  );
  console.groupEnd();

  // ---------------------------------------------------------------------------
  // STEP 6) General fill + leftover tiles
  // ---------------------------------------------------------------------------
  {
    const anchorKeySets = (placedSuffixes || []).map((s) =>
      new Set((s.path || []).map((p) => p.key))
    );

    const touchesAnyAnchor = (path, word) => {
      if (!anchorKeySets.length) return 0;
      let touchCount = 0;
      for (let i = 0; i < path.length; i++) {
        const k = path[i].key;
        if (grid[k] === word[i]) {
          for (const ks of anchorKeySets) {
            if (ks.has(k)) {
              touchCount++;
              break;
            }
          }
        }
      }
      return touchCount;
    };

    for (const word of candidates) {
      if (usedWords.has(word)) continue;

      const attempts = seededShuffle(coords).slice(0, PATH_TRIES);
      let best = null;

      for (const { q, r } of attempts) {
        const path = findPath(grid, word, q, r, 0, new Set(), gridRadius);
        if (!path) continue;

        const overlaps = countOverlapLocal(path, word);
        if (overlaps < MIN_WORD_OVERLAP) continue;
        if (hasConflict(path, word)) continue;

        const anchorTouches = touchesAnyAnchor(path, word);

        if (anchorTouches === 0 && overlaps < (word.length >= 12 ? 1 : MIN_WORD_OVERLAP + 1)) {
          continue;
        }

        const score = placementScore2(word, overlaps, anchorTouches, path.length, path);
        if (!best || score > best.score) best = { score, path };
      }

      if (best) {
        best.path.forEach(({ key }, i) => {
          grid[key] = word[i];
        });
        placedWords.push({ word, path: best.path });
        usedWords.add(word);
      }
    }

    // Fill empty tiles with random letters
    for (const { q, r } of coords) {
      const key = hexKey(q, r);
      if (!grid[key]) {
        grid[key] = letterFrequencies[Math.floor(Math.random() * letterFrequencies.length)];
      }
    }
  }

  // ---------------------------------------------------------------------------
  // HARD REQUIREMENT CHECK
  // ---------------------------------------------------------------------------
  const longCount = countLongPlaced();
  if (longCount < 2) {
    // (no-op currently — logged for diagnosis)
  }

  // ---------------------------------------------------------------------------
  // Scan board for any additional legal words
  // ---------------------------------------------------------------------------
  {
    const existing = new Set(placedWords.map(p => p.word));
    for (const word of candidates) {
      if (existing.has(word)) continue;
      if (word.length < 4) continue;

      let found = false;
      for (const { q, r } of coords) {
        const startKey = hexKey(q, r);
        if (grid[startKey] !== word[0]) continue;
        const path = findPath(grid, word, q, r, 0, new Set(), gridRadius, {
          allowZigZag: true,
          preferOverlap: true,
          maxStraight: 5,
          wallBuffer: 0,
          maxEdgeRun: 999,
        });
        if (path) {
          placedWords.push({ word, path, autoFound: true });
          existing.add(word);
          found = true;
          break;
        }
      }
      if (found) continue;
    }
  }

  console.log('🧩 Placed words:', placedWords.map(p => p.word));

  // ---------------------------------------------------------------------------
  // Anagrams
  // ---------------------------------------------------------------------------
  state.anagramList = computeAnagrams(placedWords);
  console.log(`🔀 anagram count: ${state.anagramList.length}`, state.anagramList);

  // ---------------------------------------------------------------------------
  // Scoring & Solver
  // ---------------------------------------------------------------------------
  const boardEntries = buildBoardEntries(placedWords);
  const { POOL } = buildPool(boardEntries);

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
      } finally {
        // Always resolve so handleSubmitList is never permanently blocked
        gameState._resolveBoardSolver?.();
      }
    }, 0);
  });

  const allCoordsForPreReuse = getAllCoords(gridRadius);
  const shuffledForPreReuse = seededShuffle(allCoordsForPreReuse);
  gameState.preReuseKeys = new Set(
    shuffledForPreReuse.slice(0, 3).map(c => hexKey(c.q, c.r))
  );
  
  return grid;
}