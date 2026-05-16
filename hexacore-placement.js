import { ADJ_DIRS, getAllCoords, hexKey, isValidCoord } from './gridCoords.js';
import { findPath } from './pathfinding.js';

const LETTER_POOL = [
  ...Array(12).fill('E'), ...Array(9).fill('A'), ...Array(8).fill('I'), ...Array(8).fill('O'), ...Array(4).fill('U'),
  ...Array(7).fill('R'), ...Array(7).fill('S'), ...Array(7).fill('T'), ...Array(6).fill('L'), ...Array(6).fill('N'),
  ...Array(4).fill('D'), ...Array(4).fill('H'), ...Array(4).fill('G'), ...Array(4).fill('Y'),
  ...Array(3).fill('C'), ...Array(3).fill('M'), ...Array(3).fill('P'), ...Array(2).fill('B'), ...Array(2).fill('F'), ...Array(2).fill('V'), ...Array(2).fill('W'),
  'K', 'J', 'Q', 'X', 'Z',
];

const RARE = new Set(['Q', 'Z', 'X', 'J']);
const COMMON_BIGRAMS = ['TH', 'HE', 'IN', 'ER', 'AN', 'RE', 'ON', 'AT', 'EN', 'ND', 'ED', 'ES', 'NG', 'ST', 'LE', 'TE', 'OR', 'TI'];

function shuffled(list, rng) {
  const arr = list.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function getQuadrant(q, r) {
  if (q >= 2 && r <= -2) return 'upper-right';
  if (q >= 2 && r >= 2) return 'lower-right';
  if (q <= -2 && r <= -2) return 'upper-left';
  if (q <= -2 && r >= 2) return 'lower-left';
  if (r <= -2) return 'top';
  if (r >= 2) return 'bottom';
  return 'center';
}

function pathOverlap(path, grid, word) {
  let overlap = 0;
  path.forEach((cell, i) => {
    const existing = grid[cell.key];
    if (existing && existing === word[i]) overlap += 1;
  });
  return overlap;
}

function respectsQuadrantConstraint(path, avoidQuadrants = null) {
  if (!avoidQuadrants || avoidQuadrants.size === 0) return true;
  return path.every(c => !avoidQuadrants.has(getQuadrant(c.q, c.r)));
}

export function tryPlaceWordVertical(word, rng, grid, radius, placements, constraints = {}) {
  const avoidQuadrants = constraints.avoidQuadrants;
  const starts = shuffled(getAllCoords(radius), rng);

  for (const start of starts.slice(0, 200)) {
    const path = [];
    let valid = true;
    for (let i = 0; i < word.length; i++) {
      const r = start.r + i;
      if (!isValidCoord(start.q, r, radius)) {
        valid = false;
        break;
      }
      const key = hexKey(start.q, r);
      const existing = grid[key];
      if (existing && existing !== word[i]) {
        valid = false;
        break;
      }
      path.push({ q: start.q, r, key });
    }
    if (!valid) continue;
    if (!respectsQuadrantConstraint(path, avoidQuadrants)) continue;

    path.forEach((cell, i) => {
      grid[cell.key] = word[i];
    });
    placements.push({ word, path, orientation: 'vertical' });
    return true;
  }

  return false;
}

export function placeWords(words, rng, radius, constraints = {}) {
  const coords = getAllCoords(radius);
  const grid = {};
  const placements = [];
  const minVerticalWords = Math.max(0, Number(constraints.minVerticalWords) || 0);
  const avoidQuadrants = constraints.avoidQuadrants;

  const tryPlaceWord = (word, sampleSize = 220) => {
    let best = null;
    let bestMetric = -Infinity;

    const starts = shuffled(coords, rng).slice(0, sampleSize);
    for (const start of starts) {
      const path = findPath(
        grid,
        word,
        start.q,
        start.r,
        0,
        new Set(),
        radius,
        { allowZigZag: true, preferOverlap: false, maxStraight: 3, wallBuffer: 0, maxEdgeRun: 2 },
      );
      if (!path) continue;

      const normalizedPath = path.map(c => ({ ...c, key: c.key || hexKey(c.q, c.r) }));
      if (!respectsQuadrantConstraint(normalizedPath, avoidQuadrants)) continue;

      const overlap = pathOverlap(normalizedPath, grid, word);
      const newTiles = normalizedPath.length - overlap;
      const ringDepths = normalizedPath.map(c => Math.max(Math.abs(c.q), Math.abs(c.r), Math.abs(c.q + c.r)));
      const avgRing = ringDepths.reduce((sum, v) => sum + v, 0) / Math.max(1, ringDepths.length);
      const metric = (newTiles * 25) + (avgRing * 9) - (overlap * 7);

      if (metric > bestMetric) {
        bestMetric = metric;
        best = normalizedPath;
      }
    }

    if (!best) return false;

    best.forEach((cell, i) => {
      grid[cell.key] = word[i];
    });
    placements.push({ word, path: best, orientation: 'general' });
    return true;
  };

  const sortedWords = words.slice().sort((a, b) => b.length - a.length);
  let verticalPlaced = 0;

  for (const word of sortedWords) {
    if (verticalPlaced < minVerticalWords && tryPlaceWordVertical(word, rng, grid, radius, placements, constraints)) {
      verticalPlaced += 1;
      continue;
    }
    tryPlaceWord(word, 260);
  }

  return { grid, placements };
}

function neighbors(q, r, radius) {
  const out = [];
  for (const [dq, dr] of ADJ_DIRS) {
    const nq = q + dq;
    const nr = r + dr;
    if (!isValidCoord(nq, nr, radius)) continue;
    out.push({ q: nq, r: nr, key: hexKey(nq, nr) });
  }
  return out;
}

function pickNonRareLetter(rng) {
  let letter = LETTER_POOL[Math.floor(rng() * LETTER_POOL.length)];
  while (RARE.has(letter)) {
    letter = LETTER_POOL[Math.floor(rng() * LETTER_POOL.length)];
  }
  return letter;
}

export function fillEmptyTiles(grid, rng, radius, constraints = {}) {
  const coords = getAllCoords(radius).map(c => ({ ...c, key: hexKey(c.q, c.r) }));
  const emptyCoords = coords.filter(c => !grid[c.key]);

  const requireBigramDensity = Number.isFinite(constraints.requireBigramDensity)
    ? constraints.requireBigramDensity
    : 0.4;
  const targetBigramCount = Math.ceil(emptyCoords.length * requireBigramDensity);
  const maxRareLetters = Number.isFinite(constraints.maxRareLetters)
    ? constraints.maxRareLetters
    : 4;

  let rareLetterCount = Object.values(grid).filter(ch => RARE.has(ch)).length;
  let bigramCount = 0;

  for (const c of shuffled(emptyCoords, rng)) {
    let placed = false;

    if (bigramCount < targetBigramCount) {
      const below = grid[hexKey(c.q, c.r + 1)];
      const right = grid[hexKey(c.q + 1, c.r)];
      const options = [];

      if (below) {
        COMMON_BIGRAMS.forEach(bg => {
          if (bg[1] === below) options.push(bg[0]);
        });
      }
      if (right) {
        COMMON_BIGRAMS.forEach(bg => {
          if (bg[1] === right) options.push(bg[0]);
        });
      }

      if (options.length > 0) {
        const ch = options[Math.floor(rng() * options.length)];
        if (!RARE.has(ch) || rareLetterCount < maxRareLetters) {
          grid[c.key] = ch;
          if (RARE.has(ch)) rareLetterCount += 1;
          bigramCount += 1;
          placed = true;
        }
      }
    }

    if (placed) continue;

    const near = neighbors(c.q, c.r, radius);
    const nearLetters = near.map(n => grid[n.key]).filter(Boolean);
    const nearVowels = nearLetters.filter(ch => 'AEIOU'.includes(ch)).length;

    let letter = LETTER_POOL[Math.floor(rng() * LETTER_POOL.length)];
    if (nearVowels === 0 && rng() < 0.75) {
      letter = ['A', 'E', 'I', 'O', 'U'][Math.floor(rng() * 5)];
    }

    if (RARE.has(letter) && rareLetterCount >= maxRareLetters) {
      letter = pickNonRareLetter(rng);
    }

    if (RARE.has(letter)) rareLetterCount += 1;
    grid[c.key] = letter;
  }

  return {
    targetBigramCount,
    achievedBigramCount: bigramCount,
    maxRareLetters,
    finalRareLetters: rareLetterCount,
  };
}
