import { GRID_RADIUS } from './constants.js';
import { getAllCoords, hexKey, ADJ_DIRS, isValidCoord } from './gridCoords.js';
import wordList_4 from './wordList_4.js';
import wordList_5 from './wordList_5.js';
import wordList_6 from './wordList_6.js';
import wordList_7 from './wordList_7.js';
import wordList_8 from './wordList_8.js';
import wordList_9 from './wordList_9.js';
import wordList_10 from './wordList_10.js';
import wordList_11 from './wordList_11.js';
import wordList_12 from './wordList_12.js';
import wordList_13 from './wordList_13.js';
import wordList_14 from './wordList_14.js';
import wordList_15 from './wordList_15.js';
import wordList_16plus from './wordList_16plus.js';
import { writeFileSync } from 'fs';
import { resolve } from 'path';

const DIFFICULTY_PROFILES = {
  easy: { targetComplexity: 50, tolerance: 20, minWords: 4, maxWords: 8, minWordLength: 4, maxWordLength: 9, targetTiles: 45, preferCommonWords: 0.7, complexityScale: 1.0 },
  medium: { targetComplexity: 90, tolerance: 25, minWords: 5, maxWords: 10, minWordLength: 5, maxWordLength: 11, targetTiles: 55, preferCommonWords: 0.3, complexityScale: 1.4 },
  hard: { targetComplexity: 130, tolerance: 30, minWords: 6, maxWords: 12, minWordLength: 6, maxWordLength: 13, targetTiles: 61, preferCommonWords: 0.1, complexityScale: 1.6 },
  expert: { targetComplexity: 180, tolerance: 35, minWords: 7, maxWords: 13, minWordLength: 7, maxWordLength: 13, targetTiles: 61, preferCommonWords: 0.0, complexityScale: 1.8 },
};

const COMMON_WORDS = new Set([
  'ABOUT', 'AFTER', 'ALWAYS', 'BEFORE', 'BETTER', 'CHANGE', 'COULD', 'DIFFERENT',
  'FIRST', 'FOUND', 'GREAT', 'GROUP', 'HOUSE', 'LARGE', 'LITTLE', 'MONEY',
  'OTHER', 'PEOPLE', 'PLACE', 'POINT', 'RIGHT', 'SMALL', 'STATE', 'STILL',
  'THERE', 'THINK', 'THROUGH', 'UNDER', 'WATER', 'WHILE', 'WORLD',
]);

const LETTER_RARITY = {
  E: 0.8, A: 0.8, I: 0.9, O: 0.9,
  N: 1.0, R: 1.0, T: 1.0, L: 1.1, S: 1.1, U: 1.2,
  D: 1.5, G: 1.5, M: 1.6, H: 1.6, Y: 1.8,
  B: 2.0, C: 2.0, F: 2.1, P: 2.1, K: 2.4, V: 2.6, W: 2.6,
  J: 4.0, X: 4.2, Z: 4.3, Q: 4.5,
};

const RARE_LETTERS = new Set(['Q', 'X', 'Z', 'J', 'K', 'V']);

const ALL_WORDS = [
  ...wordList_4, ...wordList_5, ...wordList_6, ...wordList_7,
  ...wordList_8, ...wordList_9, ...wordList_10, ...wordList_11,
  ...wordList_12, ...wordList_13, ...wordList_14, ...wordList_15,
  ...wordList_16plus,
].map(w => String(w || '').toUpperCase()).filter(w => /^[A-Z]+$/.test(w));

const WORDS_BY_LENGTH = new Map();
const WORD_COMPLEXITY = new Map();
for (const word of ALL_WORDS) {
  if (!WORDS_BY_LENGTH.has(word.length)) WORDS_BY_LENGTH.set(word.length, []);
  WORDS_BY_LENGTH.get(word.length).push(word);
}

function mkSeededRng(seed) {
  let s = (seed >>> 0) || 1;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 0x100000000;
}

function shuffle(list, rng) {
  const arr = list.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function edgeDepth(q, r, radius) {
  return radius - Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r));
}

function wordComplexity(word) {
  if (WORD_COMPLEXITY.has(word)) return WORD_COMPLEXITY.get(word);

  let score = 0;
  for (let i = 0; i < word.length; i++) {
    const ch = word[i];
    score += LETTER_RARITY[ch] ?? 1.8;
    if (i > 0 && RARE_LETTERS.has(ch) && RARE_LETTERS.has(word[i - 1])) score += 0.9;
  }

  score += Math.max(0, word.length - 4) * 0.9;
  if (COMMON_WORDS.has(word)) score *= 0.72;

  const out = Number(score.toFixed(1));
  WORD_COMPLEXITY.set(word, out);
  return out;
}

function weightedChoice(items, weightFn, rng) {
  const weighted = items.map(item => ({ item, weight: Math.max(0.0001, Number(weightFn(item)) || 0.0001) }));
  const total = weighted.reduce((sum, w) => sum + w.weight, 0);
  let roll = rng() * total;
  for (const w of weighted) {
    roll -= w.weight;
    if (roll <= 0) return w.item;
  }
  return weighted[weighted.length - 1].item;
}

function generateLengthRecipe(profile, rng) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const wordCount = profile.minWords + Math.floor(rng() * (profile.maxWords - profile.minWords + 1));
    const lengths = Array(wordCount).fill(profile.minWordLength);

    let remaining = profile.targetTiles - wordCount * profile.minWordLength;
    const capacity = wordCount * (profile.maxWordLength - profile.minWordLength);
    if (remaining < 0 || remaining > capacity) continue;

    while (remaining > 0) {
      const idx = Math.floor(rng() * lengths.length);
      const room = profile.maxWordLength - lengths[idx];
      if (room <= 0) continue;
      const add = Math.max(1, Math.min(room, remaining, Math.floor(rng() * 3) + 1));
      lengths[idx] += add;
      remaining -= add;
    }

    if (new Set(lengths).size < Math.min(3, lengths.length)) continue;
    return shuffle(lengths, rng);
  }
  return null;
}

function pickWordsForLengths(lengths, profile, rng) {
  const words = [];
  const used = new Set();
  const targetPerWord = (profile.targetComplexity * profile.complexityScale) / lengths.length;

  for (const len of lengths) {
    const candidates = (WORDS_BY_LENGTH.get(len) || []).filter(w => !used.has(w));
    if (candidates.length === 0) return null;

    const picked = weightedChoice(candidates, (w) => {
      const complexity = wordComplexity(w);
      const complexityMatch = 1 / (1 + Math.abs(complexity - targetPerWord) * 0.35);
      const commonness = COMMON_WORDS.has(w)
        ? 0.8 + profile.preferCommonWords * 1.8
        : 0.8 + (1 - profile.preferCommonWords) * 1.2;
      return complexityMatch * commonness;
    }, rng);

    words.push(picked);
    used.add(picked);
  }

  const rawComplexity = words.reduce((sum, w) => sum + wordComplexity(w), 0);
  const complexity = Number((rawComplexity * profile.complexityScale).toFixed(1));
  return { words, complexity };
}

function reverseGravity(simGrid, radius, stage) {
  const occupied = new Set(Object.keys(simGrid));
  const out = [];

  for (let q = -radius; q <= radius; q++) {
    const rMin = Math.max(-radius, -q - radius);
    const rMax = Math.min(radius, -q + radius);

    for (let r = rMin; r <= rMax; r++) {
      const key = hexKey(q, r);
      if (occupied.has(key)) continue;
      if (r === radius) continue;

      const seBlocked = !isValidCoord(q, r + 1, radius) || occupied.has(hexKey(q, r + 1));
      const swBlocked = !isValidCoord(q - 1, r + 1, radius) || occupied.has(hexKey(q - 1, r + 1));
      const stable = seBlocked && swBlocked;

      const depth = edgeDepth(q, r, radius);
      const height = radius - r;

      if (stage === 0 && depth < 1) continue;

      const score = stage === 0
        ? depth * 5 + height * 0.6 - Math.abs(r - 1)
        : height * 1.8 + depth * 1.4 + (r < radius - 1 ? 1.2 : -1.0) + (stable ? 2.2 : 0);

      out.push({ q, r, key, score });
    }
  }

  return out.sort((a, b) => b.score - a.score);
}

function findWordPath(word, start, allowedPositions, rng) {
  const allowed = new Map(allowedPositions.map(p => [p.key, p]));
  const path = [{ ...start, letter: word[0] }];
  const visited = new Set([start.key]);

  const dfs = (current, index) => {
    if (index === word.length - 1) return true;

    const neighbors = [];
    for (const [dq, dr] of ADJ_DIRS) {
      const key = hexKey(current.q + dq, current.r + dr);
      if (!allowed.has(key) || visited.has(key)) continue;
      neighbors.push(allowed.get(key));
    }

    for (const next of shuffle(neighbors, rng)) {
      visited.add(next.key);
      path.push({ ...next, letter: word[index + 1] });
      if (dfs(next, index + 1)) return true;
      path.pop();
      visited.delete(next.key);
    }
    return false;
  };

  return dfs(start, 0) ? path : null;
}

function findBackwardPlacement(simGrid, word, radius, rng, stage) {
  const stablePositions = reverseGravity(simGrid, radius, stage);
  if (stablePositions.length < word.length) return null;

  const starts = shuffle(stablePositions.slice(0, Math.min(stablePositions.length, 50)), rng);
  for (const start of starts) {
    const path = findWordPath(word, start, stablePositions, rng);
    if (path && path.length === word.length) return path;
  }

  return null;
}

function applyGravity(simGrid, radius = GRID_RADIUS) {
  let anyMoved = true;
  let movedAtLeastOnce = false;

  while (anyMoved) {
    anyMoved = false;
    const entries = Object.keys(simGrid)
      .map(key => {
        const [q, r] = key.split(',').map(Number);
        return { q, r, key };
      })
      .sort((a, b) => b.r - a.r);

    const moves = [];
    const plannedDests = new Set();

    for (const { q, r, key } of entries) {
      const seKey = hexKey(q, r + 1);
      const swKey = hexKey(q - 1, r + 1);
      const seOk = isValidCoord(q, r + 1, radius) && !simGrid[seKey] && !plannedDests.has(seKey);
      const swOk = isValidCoord(q - 1, r + 1, radius) && !simGrid[swKey] && !plannedDests.has(swKey);

      if (seOk) {
        moves.push({ from: key, to: seKey, value: simGrid[key] });
        plannedDests.add(seKey);
        anyMoved = true;
        movedAtLeastOnce = true;
      } else if (swOk) {
        moves.push({ from: key, to: swKey, value: simGrid[key] });
        plannedDests.add(swKey);
        anyMoved = true;
        movedAtLeastOnce = true;
      }
    }

    for (const { from, to, value } of moves) {
      delete simGrid[from];
      simGrid[to] = value;
    }
  }

  return movedAtLeastOnce;
}

function findWordPathInGrid(grid, word, radius) {
  const cells = Object.keys(grid).map(key => {
    const [q, r] = key.split(',').map(Number);
    return { q, r, key };
  });

  const byKey = new Map(cells.map(c => [c.key, c]));
  const starts = cells.filter(c => grid[c.key] === word[0]);

  for (const start of starts) {
    const path = [start.key];
    const visited = new Set([start.key]);
    let budget = 20000;

    const dfs = (cell, idx) => {
      budget--;
      if (budget <= 0) return false;
      if (idx === word.length - 1) return true;

      const target = word[idx + 1];
      for (const [dq, dr] of ADJ_DIRS) {
        const q = cell.q + dq;
        const r = cell.r + dr;
        const key = hexKey(q, r);
        if (!isValidCoord(q, r, radius)) continue;
        if (!byKey.has(key) || visited.has(key) || grid[key] !== target) continue;

        visited.add(key);
        path.push(key);
        if (dfs(byKey.get(key), idx + 1)) return true;
        path.pop();
        visited.delete(key);
      }
      return false;
    };

    if (dfs(start, 0)) return path;
  }

  return null;
}

function validateSolutionPath(grid, solutionPath, radius) {
  const sim = { ...grid };
  let hadCascade = false;

  for (let i = 0; i < solutionPath.length; i++) {
    const current = solutionPath[i];
    const next = solutionPath[i + 1];

    const currentPath = findWordPathInGrid(sim, current, radius);
    if (!currentPath) return false;

    for (const key of currentPath) delete sim[key];
    const moved = applyGravity(sim, radius);
    hadCascade = hadCascade || moved;

    if (next) {
      const nextAfter = findWordPathInGrid(sim, next, radius);
      if (!nextAfter) return false;
    }
  }

  return Object.keys(sim).length === 0 && hadCascade;
}

function generateBackwardBoard(wordRecipe, radius, rng) {
  const simGrid = {};

  for (let i = wordRecipe.length - 1; i >= 0; i--) {
    let word = wordRecipe[i];
    const stage = wordRecipe.length - 1 - i;

    let placement = null;
    for (let attempts = 0; attempts < 120; attempts++) {
      placement = findBackwardPlacement(simGrid, word, radius, rng, stage);
      if (placement) break;

      const alternates = (WORDS_BY_LENGTH.get(word.length) || []).filter(w => w !== word);
      if (alternates.length > 0) word = alternates[Math.floor(rng() * alternates.length)];
    }

    if (!placement) return null;
    wordRecipe[i] = word;
    for (const tile of placement) simGrid[tile.key] = tile.letter;
  }

  return simGrid;
}

function generateHeuristicBoard(wordRecipe, radius, rng) {
  const allCoords = getAllCoords(radius);

  const findPath = (simGrid, word, stage) => {
    const empty = allCoords
      .map(c => ({ ...c, key: hexKey(c.q, c.r) }))
      .filter(c => !simGrid[c.key])
      .map(c => {
        const depth = edgeDepth(c.q, c.r, radius);
        const height = radius - c.r;
        const score = stage * 0.3 + height * 1.7 + depth * 1.2 - Math.abs(c.r - (stage < 2 ? 1 : 0));
        return { ...c, score };
      })
      .sort((a, b) => b.score - a.score);

    const byKey = new Map(empty.map(c => [c.key, c]));
    const starts = shuffle(empty.slice(0, Math.min(50, empty.length)), rng);
    for (const start of starts) {
      const path = [{ ...start, letter: word[0] }];
      const visited = new Set([start.key]);

      const dfs = (cell, idx) => {
        if (idx === word.length - 1) return true;
        const neighbors = [];
        for (const [dq, dr] of ADJ_DIRS) {
          const key = hexKey(cell.q + dq, cell.r + dr);
          if (!byKey.has(key) || visited.has(key)) continue;
          neighbors.push(byKey.get(key));
        }
        for (const next of shuffle(neighbors, rng)) {
          visited.add(next.key);
          path.push({ ...next, letter: word[idx + 1] });
          if (dfs(next, idx + 1)) return true;
          path.pop();
          visited.delete(next.key);
        }
        return false;
      };

      if (dfs(start, 0)) return path;
    }
    return null;
  };

  for (let boardTry = 0; boardTry < 60; boardTry++) {
    const simGrid = {};
    let ok = true;
    for (let i = wordRecipe.length - 1; i >= 0; i--) {
      const word = wordRecipe[i];
      const stage = wordRecipe.length - 1 - i;
      const path = findPath(simGrid, word, stage);
      if (!path) {
        ok = false;
        break;
      }
      for (const tile of path) simGrid[tile.key] = tile.letter;
    }
    if (ok) return simGrid;
  }

  return null;
}

function generateBoardForSeed({ difficulty, seed, radius = GRID_RADIUS }) {
  const profile = DIFFICULTY_PROFILES[difficulty];
  let reason = 'no attempts';

  for (let attempt = 1; attempt <= 120; attempt++) {
    const rng = mkSeededRng((seed + Math.imul(attempt, 9973)) >>> 0);

    const lengths = generateLengthRecipe(profile, rng);
    if (!lengths) {
      reason = 'length recipe';
      continue;
    }

    let selection = null;
    let closest = null;
    for (let i = 0; i < 30; i++) {
      const candidate = pickWordsForLengths(lengths, profile, rng);
      if (!candidate) continue;
      const min = profile.targetComplexity - profile.tolerance;
      const max = profile.targetComplexity + profile.tolerance;
      if (!closest || Math.abs(candidate.complexity - profile.targetComplexity) < Math.abs(closest.complexity - profile.targetComplexity)) {
        closest = candidate;
      }
      if (candidate.complexity >= min && candidate.complexity <= max) {
        selection = candidate;
        break;
      }
    }
    if (!selection) selection = closest;
    if (!selection) {
      reason = 'word complexity selection';
      continue;
    }

    const words = selection.words.slice();
    const grid = generateBackwardBoard(words, radius, rng) || generateHeuristicBoard(words, radius, rng);
    if (!grid) {
      reason = 'backward placement';
      continue;
    }

    const allWordsFormable = words.every(w => !!findWordPathInGrid(grid, w, radius));
    if (!allWordsFormable) {
      reason = 'initial word path check';
      continue;
    }

    return {
      seed,
      difficulty,
      grid,
      specialTiles: [],
      metadata: {
        wordCount: words.length,
        complexity: selection.complexity,
        solutionPath: words,
        wordLengths: words.map(w => w.length),
        averageWordLength: Number((words.reduce((sum, w) => sum + w.length, 0) / words.length).toFixed(1)),
        generatedAt: new Date(seed * 1000).toISOString(),
        generationAttempt: attempt,
      },
    };
  }

  throw new Error(`Unable to generate ${difficulty} board for seed ${seed} (${reason})`);
}

export function generateHexacoreBatch({ difficulty, count, startSeed, radius = GRID_RADIUS }) {
  const boards = [];
  for (let i = 0; i < count; i++) {
    boards.push(generateBoardForSeed({ difficulty, seed: startSeed + i, radius }));
  }
  return boards;
}

function summarizeBatch(boards) {
  const complexities = boards.map(b => b.metadata.complexity);
  const wordCounts = boards.map(b => b.metadata.wordCount);
  const allLengths = boards.flatMap(b => b.metadata.wordLengths);

  const avg = arr => Number((arr.reduce((sum, n) => sum + n, 0) / arr.length).toFixed(2));
  const wordLengthDistribution = allLengths.reduce((acc, len) => {
    acc[len] = (acc[len] || 0) + 1;
    return acc;
  }, {});

  return {
    boardCount: boards.length,
    complexity: {
      min: Math.min(...complexities),
      max: Math.max(...complexities),
      average: avg(complexities),
    },
    wordCount: {
      min: Math.min(...wordCounts),
      max: Math.max(...wordCounts),
      average: avg(wordCounts),
    },
    wordLengthDistribution,
  };
}

function runCli() {
  const [, , difficultyArg, countArg, startSeedArg] = process.argv;
  const difficulty = String(difficultyArg || '').toLowerCase();
  const count = Number(countArg);
  const startSeed = Number(startSeedArg);

  if (!DIFFICULTY_PROFILES[difficulty] || !Number.isInteger(count) || count <= 0 || !Number.isInteger(startSeed)) {
    console.error('Usage: node hexacoreBatchGenerator.js <difficulty> <count> <startSeed>');
    console.error(`difficulty: ${Object.keys(DIFFICULTY_PROFILES).join('|')}`);
    process.exit(1);
  }

  const boards = generateHexacoreBatch({ difficulty, count, startSeed });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outputFile = resolve(process.cwd(), `test-boards-${difficulty}-${timestamp}.json`);
  writeFileSync(outputFile, JSON.stringify(boards, null, 2), 'utf8');

  console.log(`Generated ${boards.length} board(s) to ${outputFile}`);
  console.log(JSON.stringify(summarizeBatch(boards), null, 2));
}

if (process.argv[1]?.endsWith('hexacoreBatchGenerator.js')) runCli();
