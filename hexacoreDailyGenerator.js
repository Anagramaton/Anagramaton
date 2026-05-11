import { GRID_RADIUS } from './constants.js';
import { getAllCoords, hexKey, ADJ_DIRS, isValidCoord } from './gridCoords.js';
import { findPath } from './pathfinding.js';
import wordList_5 from './wordList_5.js';
import wordList_6 from './wordList_6.js';
import wordList_7 from './wordList_7.js';
import wordList_8 from './wordList_8.js';
import wordList_9 from './wordList_9.js';
import wordList_10 from './wordList_10.js';
import wordList_11 from './wordList_11.js';
import wordList_12 from './wordList_12.js';
import wordList_13 from './wordList_13.js';

const LETTER_POINTS = {
  A: 2, E: 2, I: 2, O: 2,
  U: 3, R: 3, S: 3, T: 3, L: 3, N: 3,
  D: 4, H: 4, Y: 4, G: 4,
  C: 5, M: 5, P: 5,
  K: 6,
  B: 7, F: 7,
  V: 8,
  W: 9, J: 9,
  Q: 10, X: 10, Z: 10,
};

const GEM_MULTIPLIERS = {
  gemEmerald: 2,
  gemGold: 3,
  gemSapphire: 3,
  gemRuby: 4,
  gemDiamond: 9,
  gemAlexandrite: 13,
  gemAquamarine: 6,
  gemTopaz: 5,
  gemOpal: 7,
};

const DAILY_SPECIAL_COUNTS = {
  prism: 2,
  rune: 2,
  gems: {
    gemAlexandrite: 1,
    gemDiamond: 1,
    gemRuby: 2,
    gemGold: 2,
    gemSapphire: 2,
    gemEmerald: 3,
  },
  powerups: {
    oracle: 1,
    beacon: 1,
    lodestone: 1,
    amethyst: 1,
    selenite: 1,
  },
};

const LETTER_POOL = [
  ...Array(12).fill('E'), ...Array(9).fill('A'), ...Array(8).fill('I'), ...Array(8).fill('O'), ...Array(4).fill('U'),
  ...Array(7).fill('R'), ...Array(7).fill('S'), ...Array(7).fill('T'), ...Array(6).fill('L'), ...Array(6).fill('N'),
  ...Array(4).fill('D'), ...Array(4).fill('H'), ...Array(4).fill('G'), ...Array(4).fill('Y'),
  ...Array(3).fill('C'), ...Array(3).fill('M'), ...Array(3).fill('P'), ...Array(2).fill('B'), ...Array(2).fill('F'), ...Array(2).fill('V'), ...Array(2).fill('W'),
  'K', 'J', 'Q', 'X', 'Z',
];

const HIGH_VALUE_LETTERS = new Set(['Q', 'Z', 'X', 'J']);
const MAX_SCORE_ESTIMATE_MULTIPLIER = 2.5;
const MIN_SCORE_ESTIMATE_MULTIPLIER = 2.0;

function toIsoDate(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function fnv1a32(input) {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mkSeededRng(seed) {
  let s = (seed >>> 0) || 1;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 0x100000000;
}

function wordScore(word) {
  let score = 0;
  for (const ch of word) score += LETTER_POINTS[ch] || 1;
  return score * Math.max(4, word.length);
}

function makeRanked(words, minLen, maxLen) {
  const uniq = new Set();
  const out = [];
  for (const raw of words) {
    const w = String(raw || '').toUpperCase();
    if (w.length < minLen || w.length > maxLen) continue;
    if (!/^[A-Z]+$/.test(w)) continue;
    if (uniq.has(w)) continue;
    uniq.add(w);
    out.push({ word: w, score: wordScore(w) });
  }
  out.sort((a, b) => b.score - a.score);
  return out;
}

const SHORT_RANKED = makeRanked([...wordList_5, ...wordList_6], 5, 6);
const MEDIUM_RANKED = makeRanked([...wordList_7, ...wordList_8], 7, 8);
const LONG_RANKED = makeRanked([...wordList_9, ...wordList_10, ...wordList_11, ...wordList_12, ...wordList_13], 9, 13);

function pickWordGroup(rng, ranked, count, window = 600) {
  const result = [];
  const used = new Set();
  const maxIdx = Math.min(window, ranked.length);
  while (result.length < count && used.size < maxIdx) {
    const idx = Math.floor(rng() * maxIdx);
    if (used.has(idx)) continue;
    used.add(idx);
    result.push(ranked[idx].word);
  }
  return result;
}

function chooseTargetWords(rng) {
  const shortCount = 3 + Math.floor(rng() * 3);
  const words = [
    ...pickWordGroup(rng, LONG_RANKED, 1, 700),
    ...pickWordGroup(rng, MEDIUM_RANKED, 2, 900),
    ...pickWordGroup(rng, SHORT_RANKED, shortCount, 1200),
  ];
  return words.slice(0, 8);
}

function shuffled(list, rng) {
  const arr = list.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function pathOverlap(path, grid, word) {
  let overlap = 0;
  path.forEach((cell, i) => {
    const existing = grid[cell.key];
    if (existing && existing === word[i]) overlap += 1;
  });
  return overlap;
}

function placeWords(words, rng, radius) {
  const coords = getAllCoords(radius);
  const grid = {};
  const placements = [];

  const tryPlaceWord = (word, sampleSize = 180) => {
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
        { allowZigZag: true, preferOverlap: true, maxStraight: 2, wallBuffer: 1, maxEdgeRun: 1 },
      );
      if (!path) continue;

      const overlap = pathOverlap(path, grid, word);
      const centerBias = path.reduce((sum, c) => sum - Math.max(Math.abs(c.q), Math.abs(c.r), Math.abs(c.q + c.r)), 0);
      const metric = overlap * 16 + centerBias;
      if (metric > bestMetric) {
        bestMetric = metric;
        best = path;
      }
    }

    if (!best) return false;

    best.forEach((cell, i) => {
      grid[cell.key] = word[i];
    });
    placements.push({ word, path: best, score: wordScore(word) });
    return true;
  };

  const sortedWords = words.slice().sort((a, b) => b.length - a.length || wordScore(b) - wordScore(a));
  for (const word of sortedWords) {
    tryPlaceWord(word, 220);
  }

  if (placements.length < 6) {
    const fallback = shuffled(
      [
        ...SHORT_RANKED.slice(0, 500).map(x => x.word),
        ...MEDIUM_RANKED.slice(0, 300).map(x => x.word),
      ],
      rng,
    );
    for (const word of fallback) {
      if (placements.length >= 6) break;
      if (placements.some(p => p.word === word)) continue;
      tryPlaceWord(word, 120);
    }
  }

  return { grid, placements };
}

function neighbors(q, r, radius) {
  const result = [];
  for (const [dq, dr] of ADJ_DIRS) {
    const nq = q + dq;
    const nr = r + dr;
    if (!isValidCoord(nq, nr, radius)) continue;
    result.push({ q: nq, r: nr, key: hexKey(nq, nr) });
  }
  return result;
}

function buildCoordStats(placements) {
  const coordToWords = new Map();
  const longMiddle = new Set();

  placements.forEach((p, idx) => {
    p.path.forEach((c, i) => {
      const key = c.key;
      if (!coordToWords.has(key)) coordToWords.set(key, new Set());
      coordToWords.get(key).add(idx);
      if (p.word.length >= 9 && i >= 2 && i <= p.path.length - 3) longMiddle.add(key);
    });
  });

  return { coordToWords, longMiddle };
}

function getCoordsWithinRadius(center, radius, boardRadius) {
  const out = [];
  for (let dq = -radius; dq <= radius; dq++) {
    for (let dr = -radius; dr <= radius; dr++) {
      const q = center.q + dq;
      const r = center.r + dr;
      if (!isValidCoord(q, r, boardRadius)) continue;
      if (Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr)) <= radius) out.push({ q, r, key: hexKey(q, r) });
    }
  }
  return out;
}

function placeSpecialTiles(grid, placements, rng, radius = GRID_RADIUS) {
  const specials = [];
  const taken = new Set();
  const { coordToWords, longMiddle } = buildCoordStats(placements);

  const allCoords = getAllCoords(radius);
  const pathDensity = new Map();
  for (const c of allCoords) {
    const n = neighbors(c.q, c.r, radius);
    let density = (coordToWords.get(c.key)?.size || 0);
    n.forEach(nn => { density += (coordToWords.get(nn.key)?.size || 0); });
    pathDensity.set(c.key, density);
  }

  const placeType = (type, candidates, count) => {
    const ordered = candidates
      .filter(c => !taken.has(c.key) && !!grid[c.key])
      .sort((a, b) => (b.weight || 0) - (a.weight || 0));
    const picks = shuffled(ordered, rng);
    for (const c of picks) {
      if (count <= 0) break;
      if (taken.has(c.key) || !grid[c.key]) continue;
      specials.push({ type, q: c.q, r: c.r });
      taken.add(c.key);
      count -= 1;
    }
  };

  const prismCandidates = allCoords
    .map(c => {
      const wordCount = coordToWords.get(c.key)?.size || 0;
      const n = neighbors(c.q, c.r, radius);
      const nearHigh = n.some(nn => HIGH_VALUE_LETTERS.has(grid[nn.key]));
      const strategic = nearHigh || longMiddle.has(c.key);
      if (wordCount < 2 || !strategic) return null;
      return { ...c, weight: wordCount * 10 + (nearHigh ? 5 : 0) + (longMiddle.has(c.key) ? 4 : 0) };
    })
    .filter(Boolean);
  placeType('prism', prismCandidates, DAILY_SPECIAL_COUNTS.prism);

  const runeCandidates = allCoords
    .map(c => {
      const n = neighbors(c.q, c.r, radius);
      const nearProblem = n.some(nn => HIGH_VALUE_LETTERS.has(grid[nn.key]));
      const options = n.reduce((acc, nn) => acc + (coordToWords.get(nn.key)?.size || 0), 0);
      if (!nearProblem || options < 4) return null;
      return { ...c, weight: options + 10 };
    })
    .filter(Boolean);
  placeType('rune', runeCandidates, DAILY_SPECIAL_COUNTS.rune);

  const longPathCoords = new Set();
  const mediumPathCoords = new Set();
  placements.forEach(p => {
    if (p.word.length >= 7) p.path.forEach(c => longPathCoords.add(c.key));
    if (p.word.length >= 6) p.path.forEach(c => mediumPathCoords.add(c.key));
  });

  const vowelRichness = (coord) => {
    const around = getCoordsWithinRadius(coord, 2, radius);
    let vowels = 0;
    around.forEach(c => { if ('AEIOU'.includes(grid[c.key] || '')) vowels += 1; });
    return vowels;
  };

  const gemCandidates = allCoords.map(c => {
    const key = c.key;
    const wc7 = placements.filter(p => p.word.length >= 7 && p.path.some(pc => pc.key === key)).length;
    const wc6 = placements.filter(p => p.word.length >= 6 && p.path.some(pc => pc.key === key)).length;
    return {
      ...c,
      wc7,
      wc6,
      vowels: vowelRichness(c),
      density: pathDensity.get(key) || 0,
      inLong: longPathCoords.has(key),
      inMedium: mediumPathCoords.has(key),
    };
  });

  placeType('gemAlexandrite', gemCandidates.filter(c => c.wc7 >= 2 && c.vowels >= 3).map(c => ({ ...c, weight: c.wc7 * 10 + c.vowels })), DAILY_SPECIAL_COUNTS.gems.gemAlexandrite);
  placeType('gemDiamond', gemCandidates.filter(c => c.wc7 >= 2 && c.vowels >= 3).map(c => ({ ...c, weight: c.wc7 * 9 + c.vowels })), DAILY_SPECIAL_COUNTS.gems.gemDiamond);
  placeType('gemRuby', gemCandidates.filter(c => c.wc6 >= 1 && c.vowels >= 2).map(c => ({ ...c, weight: c.wc6 * 6 + c.vowels })), DAILY_SPECIAL_COUNTS.gems.gemRuby);
  placeType('gemGold', gemCandidates.filter(c => c.inMedium).map(c => ({ ...c, weight: c.density + c.vowels })), DAILY_SPECIAL_COUNTS.gems.gemGold);
  placeType('gemSapphire', gemCandidates.filter(c => c.inMedium).map(c => ({ ...c, weight: c.density + c.vowels })), DAILY_SPECIAL_COUNTS.gems.gemSapphire);
  placeType('gemEmerald', gemCandidates.map(c => ({ ...c, weight: c.density })), DAILY_SPECIAL_COUNTS.gems.gemEmerald);

  const denseCandidates = allCoords.map(c => ({ ...c, weight: pathDensity.get(c.key) || 0 }));
  placeType('oracle', denseCandidates, DAILY_SPECIAL_COUNTS.powerups.oracle);
  placeType('beacon', denseCandidates, DAILY_SPECIAL_COUNTS.powerups.beacon);

  const lodestoneCandidates = allCoords
    .map(c => {
      const adj = neighbors(c.q, c.r, radius);
      const gemsNearby = adj.filter(n => specials.some(s => s.q === n.q && s.r === n.r && s.type.startsWith('gem'))).length;
      if (gemsNearby === 0) return null;
      return { ...c, weight: gemsNearby * 10 + (pathDensity.get(c.key) || 0) };
    })
    .filter(Boolean);
  placeType('lodestone', lodestoneCandidates, DAILY_SPECIAL_COUNTS.powerups.lodestone);

  placeType('amethyst', denseCandidates, DAILY_SPECIAL_COUNTS.powerups.amethyst);
  placeType('selenite', denseCandidates, DAILY_SPECIAL_COUNTS.powerups.selenite);

  return specials;
}

function fillEmptyTiles(grid, rng, radius = GRID_RADIUS) {
  const coords = getAllCoords(radius);
  const pool = LETTER_POOL;

  for (const c of coords) {
    const key = c.key;
    if (grid[key]) continue;

    const near = neighbors(c.q, c.r, radius);
    const nearLetters = near.map(n => grid[n.key]).filter(Boolean);
    const nearVowels = nearLetters.filter(ch => 'AEIOU'.includes(ch)).length;

    let letter = pool[Math.floor(rng() * pool.length)];
    if (nearVowels === 0 && rng() < 0.75) {
      letter = ['A', 'E', 'I', 'O', 'U'][Math.floor(rng() * 5)];
    }
    grid[key] = letter;
  }
}

function estimatePathScore(word, path, specialsByKey) {
  let base = 0;
  for (const ch of word) base += LETTER_POINTS[ch] || 1;
  const lenMult = Math.max(4, word.length);

  let gemMult = 1;
  let hasPrism = false;
  const usedGems = new Set();

  path.forEach(c => {
    const type = specialsByKey.get(c.key);
    if (type === 'prism') hasPrism = true;
    if (type && GEM_MULTIPLIERS[type]) {
      gemMult *= GEM_MULTIPLIERS[type];
      usedGems.add(type);
    }
  });

  return base * lenMult * (hasPrism ? 2 : 1) * gemMult * Math.max(1, usedGems.size);
}

function computeStrategies(placements, specialsByKey, grid) {
  const scored = placements.map(p => ({ ...p, estimatedScore: estimatePathScore(p.word, p.path, specialsByKey) }));

  const strategies = [];
  const strategyOrders = [
    scored.slice().sort((a, b) => b.estimatedScore - a.estimatedScore),
    scored.slice().sort((a, b) => (b.estimatedScore / b.word.length) - (a.estimatedScore / a.word.length)),
    scored.slice().sort((a, b) => b.word.length - a.word.length || b.estimatedScore - a.estimatedScore),
  ];

  for (const order of strategyOrders) {
    const picked = [];
    const used = new Set();
    for (const p of order) {
      if (picked.length >= 6) break;
      const overlap = p.path.some(c => used.has(c.key));
      if (overlap && picked.length >= 4) continue;
      picked.push(p);
      p.path.forEach(c => used.add(c.key));
    }

    const wordTotal = picked.reduce((sum, p) => sum + p.estimatedScore, 0);
    let penalty = 0;
    Object.entries(grid).forEach(([key, letter]) => {
      if (used.has(key)) return;
      if (!/^[A-Z]$/.test(letter)) return;
      penalty += LETTER_POINTS[letter] || 1;
    });

    const finalScore = Math.max(0, Math.round(wordTotal - penalty));
    strategies.push({
      words: picked.map(p => p.word),
      wordTotal: Math.round(wordTotal),
      penalty,
      finalScore,
    });
  }

  strategies.sort((a, b) => b.finalScore - a.finalScore);
  return strategies.slice(0, 3);
}

export function validateDailyBoard({ grid, placements, specialTiles }) {
  const specialsByKey = new Map(specialTiles.map(s => [hexKey(s.q, s.r), s.type]));
  const scored = placements.map(p => ({ ...p, estimatedScore: estimatePathScore(p.word, p.path, specialsByKey) }));
  scored.sort((a, b) => b.estimatedScore - a.estimatedScore);
  if (scored.length < 3) return { valid: false, reason: 'not enough placed strategic words' };

  const medianIdx = Math.floor(scored.length / 2);
  const highValueCut = scored[medianIdx]?.estimatedScore || 0;
  const highValueWords = scored.filter(s => s.word.length >= 7 || s.estimatedScore >= highValueCut);

  for (const s of specialTiles.filter(x => x.type === 'prism' || x.type === 'rune')) {
    const key = hexKey(s.q, s.r);
    const uses = highValueWords.filter(w => w.path.some(c => c.key === key)).length;
    const broadUses = scored.filter(w => w.path.some(c => c.key === key)).length;
    const minUses = s.type === 'rune' ? 1 : 2;
    if (uses < minUses && broadUses < minUses) return { valid: false, reason: `${s.type} lacks multi-word strategic use` };
  }

  const maxScore = Math.round(scored.slice(0, 3).reduce((sum, p) => sum + p.estimatedScore, 0) * MAX_SCORE_ESTIMATE_MULTIPLIER);
  const minScore = Math.round(scored.slice(0, 1).reduce((sum, p) => sum + p.estimatedScore, 0) * MIN_SCORE_ESTIMATE_MULTIPLIER);

  const nearOptimal = Math.max(3, scored.filter(s => s.estimatedScore >= scored[0].estimatedScore * 0.65).length);

  const highTier = specialTiles.filter(s => s.type === 'gemAlexandrite' || s.type === 'gemDiamond' || s.type === 'gemOpal');
  for (const gem of highTier) {
    const key = hexKey(gem.q, gem.r);
    const reachable = placements.some(p => p.word.length >= 7 && p.path.some(c => c.key === key));
    if (!reachable) return { valid: false, reason: `${gem.type} unreachable by 7+ path` };
  }

  const strategies = computeStrategies(placements, specialsByKey, grid);

  return {
    valid: true,
    strategicPaths: nearOptimal,
    maxScore,
    minScore,
    strategies,
  };
}

export function generateDailyHexacoreBoard({ date = toIsoDate(), maxAttempts = 10, radius = GRID_RADIUS } = {}) {
  const seed = fnv1a32(String(date));
  let lastFailure = 'unknown';

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const rng = mkSeededRng((seed + attempt * 9973) >>> 0);
    const originalRandom = Math.random;
    Math.random = rng;
    try {
      const words = chooseTargetWords(rng);
      const { grid, placements } = placeWords(words, rng, radius);
      if (placements.length < 6) {
        lastFailure = 'insufficient placed words';
        continue;
      }

      fillEmptyTiles(grid, rng, radius);
      const specialTiles = placeSpecialTiles(grid, placements, rng, radius);

      const validation = validateDailyBoard({ grid, placements, specialTiles });
      if (!validation.valid) {
        lastFailure = validation.reason || 'validation failed';
        continue;
      }

      return {
        date,
        grid,
        specialTiles,
        metadata: {
          maxPossibleScore: validation.maxScore,
          minAchievableScore: validation.minScore,
          strategicPathCount: validation.strategicPaths,
          optimalSolutions: validation.strategies,
          generatedAt: new Date().toISOString(),
        },
      };
    } finally {
      Math.random = originalRandom;
    }
  }

  throw new Error(`Unable to generate a valid daily board for ${date} after ${maxAttempts} attempts (last failure: ${lastFailure})`);
}

export function generateDailyHexacoreBatch({ startDate = toIsoDate(), count = 1 } = {}) {
  const out = [];
  const d = new Date(`${startDate}T00:00:00`);
  for (let i = 0; i < count; i++) {
    const date = toIsoDate(d);
    out.push(generateDailyHexacoreBoard({ date }));
    d.setDate(d.getDate() + 1);
  }
  return out;
}
