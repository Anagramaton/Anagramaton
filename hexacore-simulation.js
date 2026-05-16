import { ADJ_DIRS, getAllCoords, hexKey, isValidCoord } from './gridCoords.js';
import wordList_5 from './wordList_5.js';
import wordList_6 from './wordList_6.js';
import wordList_7 from './wordList_7.js';
import wordList_8 from './wordList_8.js';
import wordList_9 from './wordList_9.js';
import wordList_10 from './wordList_10.js';
import wordList_11 from './wordList_11.js';

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
  gemSapphire: 4,
  gemPearl: 5,
  gemTanzanite: 6,
  gemRuby: 7,
  gemDiamond: 8,
};

const LENGTH_MULT_TABLE = { 4: 2, 5: 5, 6: 6, 7: 7, 8: 8, 9: 9, 10: 10, 11: 11, 12: 12, 13: 13 };

const SIM_MIN_LEN = 5;
const SIM_MAX_LEN = 11;
const MAX_SIMULATION_PATHS = 300;
const MAX_SIMULATION_ROUNDS = 25;

let _simTrie = null;

function getSimTrie() {
  if (_simTrie) return _simTrie;
  const trie = Object.create(null);
  const lists = [wordList_5, wordList_6, wordList_7, wordList_8, wordList_9, wordList_10, wordList_11];

  for (const list of lists) {
    for (const rawWord of list) {
      const word = String(rawWord || '').toUpperCase();
      if (word.length < SIM_MIN_LEN || word.length > SIM_MAX_LEN) continue;
      if (!/^[A-Z]+$/.test(word)) continue;
      let node = trie;
      for (const ch of word) {
        if (!node[ch]) node[ch] = Object.create(null);
        node = node[ch];
      }
      node.$ = word;
    }
  }

  _simTrie = trie;
  return trie;
}

function cloneSimGrid(simGrid) {
  const out = {};
  for (const [k, v] of Object.entries(simGrid)) {
    out[k] = { letter: v.letter, special: v.special || null };
  }
  return out;
}

function applyGravity(simGrid, radius) {
  for (let q = -radius; q <= radius; q++) {
    const rMin = Math.max(-radius, -q - radius);
    const rMax = Math.min(radius, -q + radius);

    const positions = [];
    for (let r = rMin; r <= rMax; r++) positions.push({ r, key: hexKey(q, r) });

    const tiles = positions.filter(p => simGrid[p.key]).map(p => simGrid[p.key]);
    if (tiles.length === positions.length) continue;

    positions.forEach(p => delete simGrid[p.key]);
    const offset = positions.length - tiles.length;
    tiles.forEach((tile, idx) => {
      simGrid[positions[offset + idx].key] = tile;
    });
  }
}

function calculatePathScore(word, path, simGrid) {
  let base = 0;
  for (const ch of word) base += LETTER_POINTS[ch] || 1;
  const lenMult = LENGTH_MULT_TABLE[word.length] ?? word.length;

  let hasPrism = false;
  let gemMult = 1;
  const usedGems = new Set();

  for (const cell of path) {
    const special = simGrid[cell.key]?.special;
    if (!special) continue;
    if (special === 'prism') {
      hasPrism = true;
      continue;
    }
    if (GEM_MULTIPLIERS[special]) {
      gemMult *= GEM_MULTIPLIERS[special];
      usedGems.add(special);
    }
  }

  return Math.round(base * lenMult * (hasPrism ? 2 : 1) * gemMult * Math.max(1, usedGems.size));
}

function findAllValidPaths(simGrid, radius, maxResults = MAX_SIMULATION_PATHS) {
  const trie = getSimTrie();
  const foundWords = new Set();
  const results = [];

  function dfs(q, r, trieNode, word, path, visited) {
    if (results.length >= maxResults) return;

    if (trieNode.$ && word.length >= SIM_MIN_LEN && !foundWords.has(trieNode.$)) {
      const fullWord = trieNode.$;
      foundWords.add(fullWord);
      results.push({ word: fullWord, path: path.slice(), score: calculatePathScore(fullWord, path, simGrid) });
    }

    if (word.length >= SIM_MAX_LEN) return;

    for (const [dq, dr] of ADJ_DIRS) {
      const nq = q + dq;
      const nr = r + dr;
      if (!isValidCoord(nq, nr, radius)) continue;
      const key = hexKey(nq, nr);
      if (visited.has(key)) continue;

      const cell = simGrid[key];
      if (!cell) continue;
      const letter = cell.letter.toUpperCase();
      const next = trieNode[letter];
      if (!next) continue;

      visited.add(key);
      path.push({ q: nq, r: nr, key });
      dfs(nq, nr, next, word + letter, path, visited);
      path.pop();
      visited.delete(key);
    }
  }

  for (const [key, cell] of Object.entries(simGrid)) {
    if (results.length >= maxResults) break;
    if (!cell) continue;

    const letter = cell.letter.toUpperCase();
    const root = trie[letter];
    if (!root) continue;

    const [q, r] = key.split(',').map(Number);
    const visited = new Set([key]);
    dfs(q, r, root, letter, [{ q, r, key }], visited);
  }

  return results;
}

function pickBestPathWithLookahead(paths, simGrid, radius) {
  const candidates = paths
    .slice()
    .sort((a, b) => b.score - a.score)
    .slice(0, 12);

  let best = null;
  let bestTotal = -Infinity;

  for (const pathData of candidates) {
    const snapshot = cloneSimGrid(simGrid);
    pathData.path.forEach(cell => delete snapshot[cell.key]);
    applyGravity(snapshot, radius);

    const nextPaths = findAllValidPaths(snapshot, radius, 120)
      .sort((a, b) => b.score - a.score);
    const bestNext = nextPaths[0]?.score || 0;
    const total = pathData.score + bestNext;

    if (total > bestTotal) {
      bestTotal = total;
      best = pathData;
    }
  }

  return best || candidates[0] || null;
}

export function simulateMaxScoreWithLookahead(grid, specialTiles = [], radius = 4, maxRounds = MAX_SIMULATION_ROUNDS) {
  const totalTiles = getAllCoords(radius).length;

  const simGrid = {};
  for (const [key, letter] of Object.entries(grid || {})) {
    simGrid[key] = { letter, special: null };
  }
  for (const s of specialTiles || []) {
    const key = hexKey(s.q, s.r);
    if (simGrid[key]) simGrid[key].special = s.type;
  }

  let totalScore = 0;
  const solutionPath = [];
  let round = 0;

  while (round < maxRounds) {
    round += 1;
    const paths = findAllValidPaths(simGrid, radius);
    if (paths.length === 0) break;

    const best = pickBestPathWithLookahead(paths, simGrid, radius);
    if (!best) break;

    totalScore += best.score;
    solutionPath.push(best.word);
    best.path.forEach(cell => delete simGrid[cell.key]);
    applyGravity(simGrid, radius);
  }

  const remainingTiles = Object.entries(simGrid).map(([key, value]) => {
    const [q, r] = key.split(',').map(Number);
    return { key, q, r, letter: value.letter, special: value.special || null };
  });

  const tilesRemaining = remainingTiles.length;
  const tilesCleared = Math.max(0, totalTiles - tilesRemaining);
  const clearancePercent = totalTiles > 0 ? Math.round((tilesCleared / totalTiles) * 1000) / 10 : 0;

  return {
    maxScore: totalScore,
    optimalMoves: solutionPath.length,
    solutionPath,
    tilesRemaining,
    tilesCleared,
    clearancePercent,
    fullyCleared: tilesRemaining === 0,
    remainingTiles,
  };
}
