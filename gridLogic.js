import { letterFrequencies } from './constants.js';
import wordList from './wordList.js';
import suffixList from './suffixList.js'; // ⬅️ NEW
import { GRID_RADIUS as DEFAULT_RADIUS } from './constants.js';
import phraseHints from './phraseHints.js'; // ✅ Now the single source for phrases + hints
import { gameState } from './gameState.js';

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

function findPath(grid, word, q, r, idx, visited, radius) {
  if (!isValidCoord(q, r, radius)) return null;

  const key = hexKey(q, r);
  if (visited.has(key)) return null;

  const existing = grid[key];
  const letter = word[idx];
  if (existing && existing !== letter) return null;

  visited.add(key);
  if (idx === word.length - 1) return [{ q, r, key }];

  for (const [dq, dr] of shuffledArray(ADJ_DIRS)) {
    const path = findPath(grid, word, q + dq, r + dr, idx + 1, visited, radius);
    if (path) return [{ q, r, key }, ...path];
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


// Place only 2 suffix chunks total, and only if they overlap with existing letters.
function placeOverlappingSuffixes(grid, chunks, gridRadius) {
  const results = [];
  const coords = getAllCoords(gridRadius);
  let totalPlaced = 0; // ✅ Count total suffixes placed

  // Shuffle suffix list so we get a random two each time
  const shuffledChunks = shuffledArray(chunks);

  for (const rawChunk of shuffledChunks) {
    if (totalPlaced >= 3) break; // 

    const chunk = rawChunk.toUpperCase().replace(/[^A-Z]/g, '');
    if (!chunk) continue;

    const starts = shuffledArray(coords);
    let attempts = 0;

    for (const { q, r } of starts) {
      if (totalPlaced >= 3) break;
      if (attempts >= MAX_ATTEMPTS) break;
      attempts++;

      const path = findPath(grid, chunk, q, r, 0, new Set(), gridRadius);
      if (!path) continue;

      const overlapsExisting = path.some(({ key }, i) => grid[key] && grid[key] === chunk[i]);
      if (!overlapsExisting) continue;

      // Commit letters
      path.forEach(({ key }, i) => { grid[key] = chunk[i]; });
      results.push({ chunk, path });
      totalPlaced++; // ✅ Increase total placed count
      break; // ✅ Move to next suffix
    }
  }

  return results;
}

// Build quick lookup: key -> index within a placed suffix path
function indexByKey(path) {
  const m = new Map();
  path.forEach((p, i) => m.set(p.key, i));
  return m;
}

// DFS that places the STEM so it ends exactly on suffixHead (first tile of the suffix path).
// stem is given LEFT→RIGHT; we walk it REVERSED so the last stem letter touches the suffix head.
function findStemPath(grid, stem, q, r, idx, visited, radius, forbiddenKeys) {
  if (!isValidCoord(q, r, radius)) return null;
  const key = hexKey(q, r);

  if (visited.has(key) || forbiddenKeys.has(key)) return null;

  const want = stem[idx];
  const has = grid[key];
  if (has && has !== want) return null;

  visited.add(key);

  // when idx == 0, we've placed the first stem letter; done.
  if (idx === 0) return [{ q, r, key }];

  // expand to neighbors
  for (const [dq, dr] of shuffledArray(ADJ_DIRS)) {
    const next = findStemPath(grid, stem, q + dq, r + dr, idx - 1, visited, radius, forbiddenKeys);
    if (next) return [...next, { q, r, key }];
  }

  visited.delete(key);
  return null;
}

function attachWordToSuffix(grid, word, suffixObj, radius) {
  const chunk = suffixObj.chunk;        // e.g., "ING"
  const tailPath = suffixObj.path;      // [{q,r,key} for I, N, G ...]
  const k = chunk.length;

  if (!word.endsWith(chunk) || word.length <= k) return null;

  // Make sure the existing tail matches the suffix letters
  for (let i = 0; i < k; i++) {
    const letter = chunk[i];
    const key = tailPath[i].key;
    if (grid[key] && grid[key] !== letter) return null;
  }

  const stem = word.slice(0, word.length - k).toUpperCase();
  if (!stem.length) return null;

  const suffixHead = tailPath[0];                       // first tile of the suffix
  const forbidden = new Set(tailPath.map(p => p.key));  // forbid ALL suffix tiles for the stem

  // Try each neighbor of the suffix head as the FINAL stem cell.
  for (const [dq, dr] of shuffledArray(ADJ_DIRS)) {
    const endQ = suffixHead.q + dq;
    const endR = suffixHead.r + dr;

    const stemPath = findStemPath(
      grid,
      stem,
      endQ, endR,
      stem.length - 1,        // start from the last stem letter
      new Set(),
      radius,
      forbidden
    );

    if (stemPath) {
      // Combined path is [stem ... neighbor] then [suffix head ... tail]
      return { path: [...stemPath, ...tailPath] };
    }
  }

  return null;
}



// ✅ Updated to use only phraseHints.js
export function generateSeededBoard(gridRadius = DEFAULT_RADIUS, state = gameState) {
  const grid = {};
  placedWords.length = 0;
  const coords = getAllCoords(gridRadius);
  const maxTiles = coords.length;
  const MIN_WORD_OVERLAP = 2; // require at least 2 shared letters for non-suffix words



  let placed = false;

  // ✅ Try to find a valid phrase pair from phraseHints
  for (let i = 0; i < 100 && !placed; i++) {
    const selected = phraseHints[Math.floor(Math.random() * phraseHints.length)];
    const [rawA, rawB] = selected.phrases;
    const { hints } = selected;

    const A = rawA.toUpperCase().replace(/[^A-Z]/g, '');
    const B = rawB.toUpperCase().replace(/[^A-Z]/g, '');

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

  console.log(`🌟 Seed phrase pair: ${gameState.seedPhrase}`);
  console.log(`✅ Loaded hints:`, gameState.seedHints);
  const placedSuffixes = placeOverlappingSuffixes(grid, suffixList, gridRadius);
  console.log('🧷 Overlapping suffixes:', placedSuffixes.map(p => p.chunk));

  // 3) Friendlier cap + filter helpers
const MAX_FRIENDLY_LEN = Math.min(14, Math.floor(3.5 * gridRadius + 1));
const MIN_FRIENDLY_LEN = 4;
const TECHY_RE = /(ENCEPHAL|NEURO|EAE|SULF|PHEN|CHEM|BLASTU|PHYL|CYTE|PHAGE|INASE|AMIDE|IMIDE|IDES$|ATES$|ITES$)/i;

function isFriendlyWord(w) {
  if (w.length < MIN_FRIENDLY_LEN || w.length > MAX_FRIENDLY_LEN) return false;
  if (!/^[A-Za-z]+$/.test(w)) return false;
  if (TECHY_RE.test(w)) return false;
  const rare = (w.match(/[JQXZ]/gi) || []).length;
  if (rare >= 3) return false;
  return true;
}

// 4) Build candidates (must be before we use them)
const candidates = shuffledArray(
  wordList
    .map(w => w.toUpperCase())
    .filter(isFriendlyWord)
).sort((a, b) => b.length - a.length);

  // ✅ declare this BEFORE Pass 1
  const usedWords = new Set(); // <-- add this line

// 6) NEW: Pass 1 — attach LONG roots to each placed suffix
const MIN_ROOT_LEN = 8; // adjust if you want

const claimedSuffixes = new Set(); // optional: one root per suffix
for (const suf of placedSuffixes) {
  if (claimedSuffixes.has(suf.path[0].key)) continue;

  for (const word of candidates) {
    if (usedWords.has(word)) continue;
    if (word.length < MIN_ROOT_LEN) break; // candidates are sorted long→short
    if (!word.endsWith(suf.chunk)) continue;

    const res = attachWordToSuffix(grid, word, suf, gridRadius);
    if (res && res.path) {
      res.path.forEach(({ key }, i) => { grid[key] = word[i]; });
      placedWords.push({ word, path: res.path, viaSuffix: suf.chunk });
      usedWords.add(word);
      claimedSuffixes.add(suf.path[0].key);
      break;
    }
  }
}

// 7) Existing general fill pass
for (const word of candidates) {
  if (usedWords.has(word)) continue;

  const attempts = shuffledArray(coords).slice(0, MAX_ATTEMPTS);
  for (const { q, r } of attempts) {
    const path = findPath(grid, word, q, r, 0, new Set(), gridRadius);
    if (!path) continue;
    const overlaps = countOverlap(grid, path, word);
    if (overlaps < MIN_WORD_OVERLAP) continue;

    path.forEach(({ key }, i) => { grid[key] = word[i]; });
    placedWords.push({ word, path });
    break;
  }
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

return grid;
}
