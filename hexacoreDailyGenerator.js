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
  gemEmerald:  2,
  gemGold:     3,
  gemSapphire: 4,
  gemPearl:    5,
  gemTanzanite: 6,
  gemRuby:     7,
  gemDiamond:  8,
};

const DAILY_ROTATING_GEM_TYPES = ['gemEmerald', 'gemGold'];
const DAILY_ROTATING_RUNE_TYPES = ['rune', 'amethyst'];


const DAILY_PORTAL_ENTRY_CORNERS = [
  { q:  0, r: -4 },
  { q:  1, r: -4 },
  { q:  2, r: -4 },
  { q:  3, r: -4 },
  { q:  4, r: -4 },
  { q: -1, r: -3 },
  { q:  4, r: -3 },
  { q: -2, r: -2 },
  { q:  4, r: -2 },
  { q: -3, r: -1 },
  { q:  4, r: -1 },
];


const DAILY_PORTAL_EXIT_CORNERS = [
  { q: -4, r:  1 },
  { q:  3, r:  1 },
  { q: -4, r:  2 },
  { q:  2, r:  2 },
  { q: -4, r:  3 },
  { q:  1, r:  3 },
  { q: -4, r:  4 },
  { q: -3, r:  4 },
  { q: -2, r:  4 },
  { q: -1, r:  4 },
  { q:  0, r:  4 },
];


const DAILY_DIGRAPH_OPTIONS = [
  'TH', 'HE', 'IN', 'ER', 'RE', 'ST', 'AN', 'ON', 'EA',
  'IO', 'LL', 'QU', 'CK', 'CH', 'EN', 'CO', 'LY', 'AL',
  'LE', 'ED', 'ES', 'UN', 'GH', 'CR', 'WH', 'NT', 'NG', 'TY',
];

const LETTER_POOL = [
  ...Array(12).fill('E'), ...Array(9).fill('A'), ...Array(8).fill('I'), ...Array(8).fill('O'), ...Array(4).fill('U'),
  ...Array(7).fill('R'), ...Array(7).fill('S'), ...Array(7).fill('T'), ...Array(6).fill('L'), ...Array(6).fill('N'),
  ...Array(4).fill('D'), ...Array(4).fill('H'), ...Array(4).fill('G'), ...Array(4).fill('Y'),
  ...Array(3).fill('C'), ...Array(3).fill('M'), ...Array(3).fill('P'), ...Array(2).fill('B'), ...Array(2).fill('F'), ...Array(2).fill('V'), ...Array(2).fill('W'),
  'K', 'J', 'Q', 'X', 'Z',
];


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

const ANAGRAMATON_DICTIONARY = [
  ...wordList_4, ...wordList_5, ...wordList_6, ...wordList_7,
  ...wordList_8, ...wordList_9, ...wordList_10, ...wordList_11,
  ...wordList_12, ...wordList_13, ...wordList_14, ...wordList_15,
  ...wordList_16plus,
].map(w => String(w || '').toUpperCase());

function shuffled(list, rng) {
  const arr = list.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function coordKey(cell) {
  if (cell?.key) return cell.key;
  return hexKey(cell.q, cell.r);
}

function getAllCoordsWithKeys(radius) {
  return getAllCoords(radius).map(c => ({ ...c, key: coordKey(c) }));
}

function placeSpecialTiles(grid, rng, radius = GRID_RADIUS) {
  const specials = [];
  const taken = new Set();
  const allCoords = getAllCoordsWithKeys(radius);


  const entryPool = shuffled(DAILY_PORTAL_ENTRY_CORNERS.filter(c => !!grid[hexKey(c.q, c.r)]), rng);
  const exitPool  = shuffled(DAILY_PORTAL_EXIT_CORNERS.filter(c => !!grid[hexKey(c.q, c.r)]), rng);
  const chosenEntry = entryPool[0];
  const chosenExit  = exitPool[0];
  if (chosenEntry) {
    specials.push({ type: 'portal', role: 'entry', q: chosenEntry.q, r: chosenEntry.r });
    taken.add(hexKey(chosenEntry.q, chosenEntry.r));
  }
  if (chosenExit) {
    specials.push({ type: 'portal', role: 'exit', q: chosenExit.q, r: chosenExit.r });
    taken.add(hexKey(chosenExit.q, chosenExit.r));
  }

  // Helper: pick count random unoccupied tiles and push specials of a given type.
  const pickRandom = (type, count, extra = {}) => {
    const pool = shuffled(allCoords.filter(c => !taken.has(c.key) && !!grid[c.key]), rng);
    for (let i = 0; i < count && i < pool.length; i++) {
      specials.push({ type, q: pool[i].q, r: pool[i].r, ...extra });
      taken.add(pool[i].key);
    }
  };

  
  pickRandom('prism', 1);

 
  pickRandom(shuffled(DAILY_ROTATING_GEM_TYPES, rng)[0], 1);

 
  pickRandom(shuffled(DAILY_ROTATING_RUNE_TYPES, rng)[0], 1);

 
  const DAILY_MIN_DIGRAPHS = 3;
  const DAILY_MAX_DIGRAPHS = 5;
  const digraphCount = DAILY_MIN_DIGRAPHS + Math.floor(rng() * (DAILY_MAX_DIGRAPHS - DAILY_MIN_DIGRAPHS + 1));
  const shuffledDigraphs = shuffled(DAILY_DIGRAPH_OPTIONS, rng);
  const digraphPool = shuffled(allCoords.filter(c => !taken.has(c.key) && !!grid[c.key]), rng);
  const actualDigraphCount = Math.min(digraphCount, shuffledDigraphs.length, digraphPool.length);
  for (let i = 0; i < actualDigraphCount; i++) {
    specials.push({ type: 'digraph', q: digraphPool[i].q, r: digraphPool[i].r, digraph: shuffledDigraphs[i] });
    taken.add(digraphPool[i].key);
  }

  return specials;
}


let _simTrie = null;
const SIM_MIN_LEN = 5;
const SIM_MAX_LEN = 13;


const MAX_SIMULATION_PATHS = 300;


const MAX_SIMULATION_ROUNDS = 25;


const DIFFICULTY_EASY_THRESHOLD   = 15_000;
const DIFFICULTY_MEDIUM_THRESHOLD = 30_000;
const DIFFICULTY_HARD_THRESHOLD   = 50_000;

function getSimTrie() {
  if (_simTrie) return _simTrie;
  const trie = Object.create(null);
  for (const rawWord of ANAGRAMATON_DICTIONARY) {
    const word = String(rawWord).toUpperCase();
    if (word.length < SIM_MIN_LEN || word.length > SIM_MAX_LEN) continue;
    if (!/^[A-Z]+$/.test(word)) continue;
    let node = trie;
    for (const ch of word) {
      if (!node[ch]) node[ch] = Object.create(null);
      node = node[ch];
    }
    node.$ = word;
  }
  _simTrie = trie;
  return trie;
}


function applyGravity(simGrid, radius = GRID_RADIUS) {
  let anyMoved = true;
  while (anyMoved) {
    anyMoved = false;
    const entries = Object.keys(simGrid)
      .map(key => { const [q, r] = key.split(',').map(Number); return { q, r, key }; })
      .sort((a, b) => b.r - a.r);

    const moves = [];
    const plannedDests = new Set();

    for (const { q, r, key } of entries) {
      const seKey = hexKey(q,     r + 1);
      const swKey = hexKey(q - 1, r + 1);
      const seOk  = isValidCoord(q,     r + 1, radius) && !simGrid[seKey] && !plannedDests.has(seKey);
      const swOk  = isValidCoord(q - 1, r + 1, radius) && !simGrid[swKey] && !plannedDests.has(swKey);

      if (seOk) {
        moves.push({ from: key, to: seKey, value: simGrid[key] });
        plannedDests.add(seKey);
        anyMoved = true;
      } else if (swOk) {
        moves.push({ from: key, to: swKey, value: simGrid[key] });
        plannedDests.add(swKey);
        anyMoved = true;
      }
    }
    for (const { from, to, value } of moves) {
      delete simGrid[from];
      simGrid[to] = value;
    }
  }
}


const LENGTH_MULT_TABLE = { 4: 2, 5: 5, 6: 6, 7: 7, 8: 8, 9: 9, 10: 10, 11: 11, 12: 12, 13: 13 };

function calculatePathScore(word, path, simGrid, portalEntryKey = null, portalExitKey = null) {
  let base = 0;
  for (const ch of word) base += LETTER_POINTS[ch] || 1;

 
  const actualLenMult = LENGTH_MULT_TABLE[word.length] ?? word.length;

  let hasPrism = false;
  let gemMult = 1;
  const uniqueGems = new Set();

  for (const cell of path) {
    const special = simGrid[cell.key]?.special;
    if (!special) continue;
    if (special === 'prism') { hasPrism = true; continue; }
    if (GEM_MULTIPLIERS[special]) {
      gemMult *= GEM_MULTIPLIERS[special];
      uniqueGems.add(special);
    }
  }

  const countBonus = Math.max(1, uniqueGems.size);

  let portalMult = 1;
  if (portalEntryKey && portalExitKey) {
    const pathKeys = new Set(path.map(c => c.key));
    if (pathKeys.has(portalEntryKey) && pathKeys.has(portalExitKey)) {
      portalMult = Math.max(1, word.length - 2);
    }
  }

  return Math.round(base * actualLenMult * (hasPrism ? 2 : 1) * gemMult * countBonus * portalMult);
}


 */
function findAllValidPaths(simGrid, radius = GRID_RADIUS, maxResults = MAX_SIMULATION_PATHS, portalEntryKey = null, portalExitKey = null) {
  const trie = getSimTrie();

  const foundWords = new Set();
  const results = [];

 
  function dfs(q, r, trieNode, word, path, visited) {
    if (results.length >= maxResults) return;

    
    if (trieNode.$ && word.length >= SIM_MIN_LEN && !foundWords.has(trieNode.$)) {
      const completedWord = trieNode.$;
      foundWords.add(completedWord);
      results.push({ word: completedWord, path: path.slice(), score: calculatePathScore(completedWord, path, simGrid, portalEntryKey, portalExitKey) });
    }

    if (word.length >= SIM_MAX_LEN) return;

   
    for (const [dq, dr] of ADJ_DIRS) {
      const nq = q + dq;
      const nr = r + dr;
      const nkey = hexKey(nq, nr);
      if (visited.has(nkey)) continue;

      const ncell = simGrid[nkey];
      if (!ncell) continue;

      const letter = ncell.letter.toUpperCase();
      const isRune = ncell.special === 'rune';

      if (isRune) {
        
        visited.add(nkey);
        path.push({ key: nkey, q: nq, r: nr });
        for (const ch of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
          const nextNode = trieNode[ch];
          if (!nextNode) continue;
          dfs(nq, nr, nextNode, word + ch, path, visited);
          if (results.length >= maxResults) break;
        }
        path.pop();
        visited.delete(nkey);
        if (results.length >= maxResults) return;
      } else {
   
        let nextNode;
        if (letter.length === 2) {
          if (word.length + 2 > SIM_MAX_LEN) continue;
          const mid = trieNode[letter[0]];
          if (!mid) continue;
          nextNode = mid[letter[1]];
          if (!nextNode) continue;
        } else {
          nextNode = trieNode[letter];
          if (!nextNode) continue; 
        }

        visited.add(nkey);
        path.push({ key: nkey, q: nq, r: nr });
        dfs(nq, nr, nextNode, word + letter, path, visited);
        path.pop();
        visited.delete(nkey);
      }
    }
  }

  for (const [key, cell] of Object.entries(simGrid)) {
    if (results.length >= maxResults) break;
    if (!cell) continue;
    const letter = cell.letter.toUpperCase();

    const [q, r] = key.split(',').map(Number);

    if (cell.special === 'rune') {
     
      for (const ch of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
        if (results.length >= maxResults) break;
        const trieRoot = trie[ch];
        if (!trieRoot) continue;
        const visited = new Set([key]);
        dfs(q, r, trieRoot, ch, [{ key, q, r }], visited);
      }
    } else {
      let trieRoot;
      if (letter.length === 2) {
        
        const mid = trie[letter[0]];
        if (!mid) continue;
        trieRoot = mid[letter[1]];
        if (!trieRoot) continue;
      } else {
        trieRoot = trie[letter];
        if (!trieRoot) continue;
      }

      const visited = new Set([key]);
      dfs(q, r, trieRoot, letter, [{ key, q, r }], visited);
    }
  }

  return results;
}


function cloneSimGrid(simGrid) {
  const copy = {};
  for (const [k, v] of Object.entries(simGrid)) copy[k] = { ...v };
  return copy;
}

export function simulateMaxScore(grid, specialTiles, radius = GRID_RADIUS, maxRounds = MAX_SIMULATION_ROUNDS) {
  
  const baseSimGrid = {};
  for (const [key, letter] of Object.entries(grid)) {
    baseSimGrid[key] = { letter, special: null };
  }
  for (const s of specialTiles) {
    const key = hexKey(s.q, s.r);
    if (baseSimGrid[key]) {
      baseSimGrid[key].special = s.type;
     
      if (s.type === 'digraph' && s.digraph) {
        baseSimGrid[key].letter = String(s.digraph).toUpperCase();
      }
    }
  }


  const portalEntry = specialTiles.find(s => s.type === 'portal' && s.role === 'entry');
  const portalExit  = specialTiles.find(s => s.type === 'portal' && s.role === 'exit');
  const portalEntryKey = portalEntry ? hexKey(portalEntry.q, portalEntry.r) : null;
  const portalExitKey  = portalExit  ? hexKey(portalExit.q,  portalExit.r)  : null;

  const gemCount = specialTiles.filter(s => GEM_MULTIPLIERS[s.type]).length;
  const totalTiles = getAllCoords(radius).length;

  
  function computeExactPenalty(simGrid) {
    return Object.values(simGrid).reduce((sum, cell) => {
      const letter = (cell.letter || '').toUpperCase();
      if (letter.length === 2) return sum + (LETTER_POINTS[letter[0]] || 1) + (LETTER_POINTS[letter[1]] || 1);
      return sum + (LETTER_POINTS[letter] || 1);
    }, 0);
  }


  function runPass(sortFn) {
    const simGrid = cloneSimGrid(baseSimGrid);
    let totalScore = 0;
    const solutionPath = [];
    const solutionDetail = [];
    let round = 0;

    while (round < maxRounds) {
      round++;
      const paths = findAllValidPaths(simGrid, radius, MAX_SIMULATION_PATHS, portalEntryKey, portalExitKey);
      if (paths.length === 0) break;

      paths.sort(sortFn);
      const best = paths[0];

      totalScore += best.score;
      solutionPath.push(best.word);
      solutionDetail.push({ word: best.word, score: best.score, tilesUsed: best.path.length });

      for (const cell of best.path) {
        delete simGrid[cell.key];
      }

      applyGravity(simGrid, radius);
    }

    return { simGrid, totalScore, solutionPath, solutionDetail };
  }

  
  const pass1 = runPass((a, b) => b.score - a.score);

 
  const pass2 = runPass((a, b) => (b.score / b.path.length) - (a.score / a.path.length));

 
  const pass3 = runPass((a, b) => b.path.length - a.path.length);

  
  const pass4 = runPass((a, b) => {
    const aHasSpecial = a.path.some(c => baseSimGrid[c.key]?.special);
    const bHasSpecial = b.path.some(c => baseSimGrid[c.key]?.special);
    if (aHasSpecial !== bHasSpecial) return aHasSpecial ? -1 : 1;
    return b.score - a.score;
  });

 
  function computeFinalScore(pass) {
    const penalty = computeExactPenalty(pass.simGrid);
    return Math.max(0, pass.totalScore - penalty);
  }

  const passes = [pass1, pass2, pass3, pass4];
  let bestPass = passes[0];
  let bestFinalScore = computeFinalScore(passes[0]);
  for (let i = 1; i < passes.length; i++) {
    const fs = computeFinalScore(passes[i]);
    if (fs > bestFinalScore) {
      bestFinalScore = fs;
      bestPass = passes[i];
    }
  }

  const { simGrid: finalSimGrid, totalScore, solutionPath, solutionDetail } = bestPass;
  const exactPenalty = computeExactPenalty(finalSimGrid);
  const totalWordLen = solutionPath.reduce((s, w) => s + w.length, 0);
  const tilesRemaining = Object.keys(finalSimGrid).length;
  const tilesCleared = Math.max(0, totalTiles - tilesRemaining);
  const clearancePercent = totalTiles > 0 ? Math.round((tilesCleared / totalTiles) * 1000) / 10 : 0;
  return {
    maxScore: totalScore,
    exactPenalty,
    optimalMoves: solutionPath.length,
    averageWordLength: solutionPath.length > 0 ? Math.round((totalWordLen / solutionPath.length) * 10) / 10 : 0,
    gemDensity: totalTiles > 0 ? Math.round((gemCount / totalTiles) * 1000) / 1000 : 0,
    tilesCleared,
    tilesRemaining,
    clearancePercent,
    fullyCleared: tilesRemaining === 0,
    solutionPath,
    solutionDetail,
  };
}


function classifyDifficulty(maxScore) {
  if (maxScore < DIFFICULTY_EASY_THRESHOLD)   return 'easy';
  if (maxScore < DIFFICULTY_MEDIUM_THRESHOLD) return 'medium';
  if (maxScore < DIFFICULTY_HARD_THRESHOLD)   return 'hard';
  return 'expert';
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

function formatSpecialName(type) {
  if (!type) return '';
  if (type === 'prism') return 'purple prism';
  if (type === 'portal') return 'portal';
  if (type === 'rune') return 'rune';
  if (type === 'amethyst') return 'amethyst';
  if (type === 'digraph') return 'digraph';
  if (type.startsWith('gem')) return type.replace(/^gem/, '').replace(/([A-Z])/g, ' $1').trim().toLowerCase();
  return type.toLowerCase();
}

function generatePositionalClue(word, path, grid, specialTiles) {
  if (!Array.isArray(path) || path.length === 0) return '';
  const specialsByKey = new Map((specialTiles || []).map(s => [hexKey(s.q, s.r), s]));
  const hitSpecials = path.map(c => specialsByKey.get(c.key)).filter(Boolean);

  const digraphTile = hitSpecials.find(s => s.type === 'digraph' && s.digraph);
  if (digraphTile) {
    return `A ${word.length}-letter word uses the ${String(digraphTile.digraph).toUpperCase()} digraph tile`;
  }

  if (hitSpecials.some(s => s.type === 'prism')) {
    return `A ${word.length}-letter word routes through the purple prism`;
  }

  const gemTile = hitSpecials.find(s => s.type && s.type.startsWith('gem'));
  if (gemTile) {
    return `A ${word.length}-letter word passes through the ${formatSpecialName(gemTile.type)} gem`;
  }

  const start = path[0];
  const end = path[path.length - 1];
  const startQuadrant = getQuadrant(start.q, start.r);
  const endQuadrant = getQuadrant(end.q, end.r);
  if (startQuadrant === endQuadrant) {
    return `A ${word.length}-letter word sits in the ${startQuadrant} quadrant`;
  }
  return `A ${word.length}-letter word runs from ${startQuadrant} toward ${endQuadrant}`;
}

const VOWELS = new Set(['A', 'E', 'I', 'O', 'U']);

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function computeForensicInteresting(style, value, len, context = {}) {
  if (!Number.isFinite(len) || len <= 0) return 0;
  switch (style) {
    case 'isPalindrome':
    case 'startsEndsMatch':
      return value ? 1 : 0;
    case 'vowelCount':
    case 'consonantCount':
      return clamp01(Math.abs((value / len) - 0.5) * 2);
    case 'uniqueLetterCount':
      return clamp01(1 - (value / len));
    case 'uniqueRepeatedLetters':
      return value === 0 ? 0.7 : clamp01(value / Math.max(1, len / 2));
    case 'mostFrequentLetterCount':
      return clamp01((value - 1) / Math.max(1, len - 1));
    case 'repeatedBigrams':
    case 'vvBigrams':
    case 'ccBigrams':
      return clamp01(value / Math.max(1, len - 1));
    case 'longestVowelRun':
    case 'longestConsonantRun':
      return clamp01((value - 1) / Math.max(1, len - 1));
    case 'vowelRunCount':
      return clamp01(Math.abs((value / len) - 0.35) * 2);
    case 'highValueLetterCount':
    case 'lowValueLetterCount':
      return clamp01(value / len);
    case 'pointRange':
      return clamp01(value / 10);
    case 'maxPointValue':
      return clamp01((value - 2) / 8);
    case 'totalPoints':
      return clamp01(value / Math.max(1, len * 10));
    case 'startsWithVowel':
    case 'endsWithVowel':
      return 0.25;
    case 'vowelSpread':
      return context.hasVowels ? clamp01(value / Math.max(1, len - 1)) : 0;
    case 'firstHalfCount':
      return clamp01(Math.abs((value / len) - 0.5) * 2);
    case 'repeatedTrigrams':
      return value > 0 ? 1 : 0.45;
    case 'uniqueBigramRatio':
      return clamp01(value / Math.max(1, context.bigramCount || (len - 1)));
    default:
      return 0.3;
  }
}

function computeCandidates(word) {
  const upper = String(word || '').toUpperCase();
  const chars = [...upper];
  const len = chars.length;
  if (!len) return [];

  const charCounts = new Map();
  for (const ch of chars) {
    charCounts.set(ch, (charCounts.get(ch) || 0) + 1);
  }

  const vowelCount = chars.filter(c => VOWELS.has(c)).length;
  const consonantCount = len - vowelCount;
  const uniqueLetterCount = charCounts.size;
  const repeatedLetterCount = chars.filter(c => (charCounts.get(c) || 0) > 1).length;
  const uniqueRepeatedLetters = [...charCounts.values()].filter(count => count > 1).length;
  const mostFrequentLetterCount = Math.max(...charCounts.values());

  const bigrams = chars.slice(0, -1).map((c, i) => c + chars[i + 1]);
  const uniqueBigrams = new Set(bigrams).size;
  const repeatedBigrams = bigrams.length - uniqueBigrams;
  const vvBigrams = bigrams.filter(b => VOWELS.has(b[0]) && VOWELS.has(b[1])).length;
  const ccBigrams = bigrams.filter(b => !VOWELS.has(b[0]) && !VOWELS.has(b[1])).length;

  const runs = [];
  let cur = VOWELS.has(chars[0]) ? 'V' : 'C';
  let runLen = 1;
  for (let i = 1; i < len; i++) {
    const t = VOWELS.has(chars[i]) ? 'V' : 'C';
    if (t === cur) runLen++;
    else {
      runs.push({ type: cur, len: runLen });
      cur = t;
      runLen = 1;
    }
  }
  runs.push({ type: cur, len: runLen });
  const longestVowelRun = Math.max(...runs.filter(r => r.type === 'V').map(r => r.len), 0);
  const longestConsonantRun = Math.max(...runs.filter(r => r.type === 'C').map(r => r.len), 0);
  const vowelRunCount = runs.filter(r => r.type === 'V').length;
  const consonantRunCount = runs.filter(r => r.type === 'C').length;

  const pointValues = chars.map(c => LETTER_POINTS[c] || 1);
  const totalPoints = pointValues.reduce((sum, value) => sum + value, 0);
  const maxPointValue = Math.max(...pointValues);
  const minPointValue = Math.min(...pointValues);
  const pointRange = maxPointValue - minPointValue;
  const highValueLetterCount = pointValues.filter(value => value >= 6).length;
  const lowValueLetterCount = pointValues.filter(value => value <= 2).length;

  const startsWithVowel = VOWELS.has(chars[0]);
  const endsWithVowel = VOWELS.has(chars[len - 1]);
  const firstVowelIndex = chars.findIndex(c => VOWELS.has(c));
  const reversedVowelIndex = [...chars].reverse().findIndex(c => VOWELS.has(c));
  const lastVowelIndex = reversedVowelIndex === -1 ? -1 : len - 1 - reversedVowelIndex;
  const vowelSpread = (firstVowelIndex === -1 || lastVowelIndex === -1) ? -1 : lastVowelIndex - firstVowelIndex;

  const isPalindrome = upper === [...upper].reverse().join('');
  const startsEndsMatch = chars[0] === chars[len - 1];

  const firstHalfCount = chars.filter(c => c <= 'M').length;
  const secondHalfCount = chars.filter(c => c > 'M').length;

  const trigrams = chars.slice(0, -2).map((c, i) => c + chars[i + 1] + chars[i + 2]);
  const uniqueTrigrams = new Set(trigrams).size;
  const repeatedTrigrams = trigrams.length - uniqueTrigrams;

  const context = {
    hasVowels: firstVowelIndex !== -1,
    repeatedLetterCount,
    consonantRunCount,
    minPointValue,
    secondHalfCount,
    uniqueTrigrams,
    bigramCount: bigrams.length,
  };

  const candidates = [
    { style: 'vowelCount', value: vowelCount, text: vowelCount === 1 ? 'Contains just one vowel' : `Contains exactly ${vowelCount} vowels` },
    { style: 'consonantCount', value: consonantCount, text: `Built from ${consonantCount} consonants` },
    {
      style: 'uniqueLetterCount',
      value: uniqueLetterCount,
      text: uniqueLetterCount === len ? 'Every letter in this word is different'
        : uniqueLetterCount <= 3 ? `Uses only ${uniqueLetterCount} distinct letters across all its tiles`
          : `Draws from ${uniqueLetterCount} different letters`,
    },
    {
      style: 'uniqueRepeatedLetters',
      value: uniqueRepeatedLetters,
      text: uniqueRepeatedLetters === 0 ? 'No letter appears more than once'
        : uniqueRepeatedLetters === 1 ? 'Exactly one letter appears more than once'
          : `${uniqueRepeatedLetters} different letters each appear more than once`,
    },
    { style: 'mostFrequentLetterCount', value: mostFrequentLetterCount, text: `One letter appears ${mostFrequentLetterCount} times` },
    {
      style: 'repeatedBigrams',
      value: repeatedBigrams,
      text: repeatedBigrams === 0 ? 'Every pair of adjacent letters is unique' : 'The same two-letter pair appears more than once',
    },
    {
      style: 'vvBigrams',
      value: vvBigrams,
      text: vvBigrams === 0 ? 'No two vowels appear side by side'
        : vvBigrams === 1 ? 'Two vowels sit directly next to each other once'
          : `Vowels cluster together ${vvBigrams} times`,
    },
    {
      style: 'ccBigrams',
      value: ccBigrams,
      text: ccBigrams === 0 ? 'No two consonants appear side by side' : `Consonants pair up ${ccBigrams} times`,
    },
    {
      style: 'longestVowelRun',
      value: longestVowelRun,
      text: longestVowelRun >= 3 ? 'Three or more vowels run together with no consonant between them'
        : longestVowelRun === 2 ? 'Two vowels appear consecutively somewhere inside'
          : 'Vowels never appear together — always separated by consonants',
    },
    {
      style: 'longestConsonantRun',
      value: longestConsonantRun,
      text: longestConsonantRun >= 4 ? 'Four or more consonants stack up with no vowel between them'
        : longestConsonantRun === 3 ? 'Three consonants appear in a row somewhere'
          : longestConsonantRun === 2 ? 'Some consonants cluster in pairs'
            : 'Every consonant is separated by at least one vowel',
    },
    {
      style: 'vowelRunCount',
      value: vowelRunCount,
      text: `Vowels form ${vowelRunCount} separate group${vowelRunCount === 1 ? '' : 's'} within the word`,
    },
    {
      style: 'highValueLetterCount',
      value: highValueLetterCount,
      text: highValueLetterCount === 0 ? 'Every letter scores 5 points or fewer'
        : highValueLetterCount === 1 ? 'Contains exactly one high-value letter worth 6 or more'
          : `Contains ${highValueLetterCount} high-value letters worth 6 or more each`,
    },
    {
      style: 'lowValueLetterCount',
      value: lowValueLetterCount,
      text: lowValueLetterCount === len ? 'Every letter is a low-value tile' : `${lowValueLetterCount} of its letters are worth just 2 points`,
    },
    {
      style: 'pointRange',
      value: pointRange,
      text: pointRange === 0 ? 'All its letters are worth exactly the same'
        : pointRange <= 2 ? 'Letter values are tightly clustered — little variation'
          : pointRange >= 7 ? 'A wide spread between its cheapest and most expensive letter'
            : 'Moderate spread between its lowest and highest letter values',
    },
    { style: 'maxPointValue', value: maxPointValue, text: `Its most valuable letter is worth ${maxPointValue} points` },
    { style: 'totalPoints', value: totalPoints, text: `All letter values sum to ${totalPoints}` },
    { style: 'startsWithVowel', value: startsWithVowel ? 1 : 0, text: startsWithVowel ? 'Begins with a vowel' : 'Begins with a consonant' },
    { style: 'endsWithVowel', value: endsWithVowel ? 1 : 0, text: endsWithVowel ? 'Ends with a vowel' : 'Ends with a consonant' },
    { style: 'startsEndsMatch', value: startsEndsMatch ? 1 : 0, text: 'Starts and ends with the same letter' },
    { style: 'isPalindrome', value: isPalindrome ? 1 : 0, text: 'Reads the same forwards and backwards' },
    {
      style: 'vowelSpread',
      value: vowelSpread,
      text: vowelSpread === 0 ? 'Its only vowel sits at the very start'
        : vowelSpread >= len - 2 ? 'Vowels are spread across almost the entire length'
          : 'Vowels are concentrated in the middle section',
    },
    {
      style: 'firstHalfCount',
      value: firstHalfCount,
      text: firstHalfCount === len ? 'Every letter comes from the first half of the alphabet'
        : firstHalfCount === 0 ? 'Every letter comes from the second half of the alphabet'
          : firstHalfCount > len / 2 ? 'More letters from the first half of the alphabet than the second'
            : 'More letters from the second half of the alphabet',
    },
    {
      style: 'repeatedTrigrams',
      value: repeatedTrigrams,
      text: repeatedTrigrams > 0 ? 'The same three-letter sequence appears more than once' : 'No three-letter sequence repeats',
    },
    {
      style: 'uniqueBigramRatio',
      value: uniqueBigrams,
      text: uniqueBigrams === bigrams.length ? 'Every adjacent letter pair is unique' : 'Some adjacent letter pairs repeat',
    },
  ];

  const filtered = candidates.filter(candidate => {
    if (candidate.style === 'isPalindrome' && !isPalindrome) return false;
    if (candidate.style === 'startsEndsMatch' && !startsEndsMatch) return false;
    if (candidate.style === 'vowelSpread' && firstVowelIndex === -1) return false;
    if ((candidate.style === 'repeatedTrigrams') && trigrams.length === 0) return false;
    if (candidate.style === 'uniqueBigramRatio' && bigrams.length === 0) return false;
    return true;
  });

  return filtered.map(candidate => ({
    ...candidate,
    interesting: computeForensicInteresting(candidate.style, candidate.value, len, context),
  }));
}

function generateForensicClue(word, allWords, usedStyles = new Set()) {
  const upper = String(word || '').toUpperCase();
  const chars = [...upper];
  const len = chars.length;
  const vowelCount = chars.filter(c => VOWELS.has(c)).length;
  const boardWords = Array.isArray(allWords) ? allWords : [word];
  const myCandidates = computeCandidates(word);
  const otherWordCandidates = boardWords
    .filter(w => w !== word)
    .map(w => computeCandidates(w));

  const available = myCandidates.filter(candidate => !usedStyles.has(candidate.style));
  const scored = available.map(candidate => {
    const sharedCount = otherWordCandidates.filter(otherCandidates =>
      otherCandidates.some(other => other.style === candidate.style && other.value === candidate.value),
    ).length;
    return { ...candidate, sharedCount };
  });

  scored.sort((a, b) => a.sharedCount - b.sharedCount || b.interesting - a.interesting);
  const chosen = scored[0];
  if (chosen) {
    usedStyles.add(chosen.style);
    return chosen.text;
  }

  return `${len} letters, ${vowelCount} vowel${vowelCount === 1 ? '' : 's'}`;
}

function generateFeatureHints(path, specialTiles) {
  const specialsByKey = new Map((specialTiles || []).map(s => [hexKey(s.q, s.r), s]));
  const hitSpecials = (path || []).map(c => specialsByKey.get(c.key)).filter(Boolean);
  if (hitSpecials.length === 0) return [];

  const out = [];
  const gemHits = hitSpecials.filter(s => s.type && s.type.startsWith('gem'));
  const uniqueGems = [...new Set(gemHits.map(s => s.type))];
  const digraphHits = hitSpecials.filter(s => s.type === 'digraph');
  const portalHits = hitSpecials.filter(s => s.type === 'portal').length;

  if (hitSpecials.some(s => s.type === 'prism')) out.push('Uses prism for 2× multiplier');
  if (uniqueGems.length >= 2) out.push('Chains multiple gems');
  else if (uniqueGems.length === 1) out.push(`Uses ${formatSpecialName(uniqueGems[0])} gem`);
  if (digraphHits.length > 0) out.push(`Uses ${digraphHits.length} digraph tile${digraphHits.length === 1 ? '' : 's'}`);
  if (portalHits >= 2) out.push('Traverses both portal tiles');
  else if (portalHits === 1) out.push('Uses a portal tile');

  return out;
}

export function generateOptimalPathClues(optimalSolutions, grid, specialTiles) {
  const bestStrategy = Array.isArray(optimalSolutions) ? optimalSolutions[0] : null;
  if (!bestStrategy || !Array.isArray(bestStrategy.words)) return null;
  const usedStyles = new Set();
  const allWords = bestStrategy.words;

  const clues = bestStrategy.words.map((word, idx) => ({
    wordIndex: idx + 1,
    length: word.length,
    estimatedPoints: 0,
    positional: generatePositionalClue(word, [], grid, specialTiles),
    category: '',
    hints: [
      { level: 1, text: generateForensicClue(word, allWords, usedStyles) },
    ],
    features: [],
  }));

  return {
    strategy: 'optimal',
    targetScore: bestStrategy.finalScore,
    wordCount: bestStrategy.words.length,
    clues,
  };
}



function buildSimulationStrategies(simData, grid, totalTiles) {
  if (!simData?.solutionDetail?.length) return null;

 
  const penalty = Number.isFinite(simData.exactPenalty) ? simData.exactPenalty : Math.round((totalTiles - simData.solutionDetail.reduce((s, d) => s + d.tilesUsed, 0)) * 2);

  const wordTotal = simData.solutionDetail.reduce((s, d) => s + d.score, 0);
  const finalScore = Math.max(0, wordTotal - penalty);

  const scoreTiers = {
    good:   Math.round(finalScore * 0.40),
    great:  Math.round(finalScore * 0.65),
    superb: Math.round(finalScore * 0.85),
  };

  return [{
    words: simData.solutionDetail.map(d => d.word),
    wordTotal,
    penalty,
    finalScore,
    scoreTiers,
  }];
}

export function generateDailyHexacoreBoard({
  date = toIsoDate(),
  maxAttempts = 10,
  radius = GRID_RADIUS,
  attemptSeedOffset = 0,
  runSimulation = true,
} = {}) {
  const seed = fnv1a32(String(date));
  const allCoords = getAllCoordsWithKeys(radius);
  const totalTiles = allCoords.length;
  let bestBoard = null;
  let bestBoardMeta = null; 

 
  const isBetterBoard = (candidateMeta) => {
    if (!bestBoardMeta) return true;
    
    if (candidateMeta.clearance !== bestBoardMeta.clearance) return candidateMeta.clearance > bestBoardMeta.clearance;
  
    return candidateMeta.score > bestBoardMeta.score;
  };

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const effectiveAttempt = attempt + (Number(attemptSeedOffset) || 0);
    const rng = mkSeededRng((seed + effectiveAttempt * 9973) >>> 0);

    // ── Fill all tiles with randomly drawn letters from LETTER_POOL ─────────────
    const letters = shuffled(LETTER_POOL, rng).slice(0, totalTiles);
    const grid = {};
    allCoords.forEach((c, i) => { grid[c.key] = letters[i]; });

    const specialTiles = placeSpecialTiles(grid, rng, radius);

   
    let simData = null;
    if (runSimulation) {
      try {
        simData = simulateMaxScore(grid, specialTiles, radius);
      } catch (err) {
        console.warn('[hexacoreGenerator] simulateMaxScore failed:', err?.message ?? err);
        simData = null;
      }
    }

    const maxPossibleScore = simData?.maxScore ?? 0;
    const difficulty = classifyDifficulty(maxPossibleScore);

    const optimalSolutions = buildSimulationStrategies(simData, grid, totalTiles);
    const optimalPathClues = generateOptimalPathClues(optimalSolutions, grid, specialTiles);

    const board = {
      date,
      grid,
      specialTiles,
      metadata: {
        maxPossibleScore,
        optimalSolutions,
        optimalPathClues,
        difficulty,
        scoreTiers: optimalSolutions?.[0]?.scoreTiers ?? null,
        optimalMoves: simData?.optimalMoves ?? null,
        averageWordLength: simData?.averageWordLength ?? null,
        gemDensity: simData?.gemDensity ?? null,
        tilesCleared: simData?.tilesCleared ?? null,
        tilesRemaining: simData?.tilesRemaining ?? null,
        tileClearancePercent: simData?.clearancePercent ?? null,
        fullClear: simData?.fullyCleared ?? null,
        solutionPath: simData?.solutionPath ?? null,
        generatedAt: new Date().toISOString(),
      },
    };

    const attemptMeta = {
      clearance: simData?.clearancePercent ?? 0,
      score: maxPossibleScore,
    };

    if (isBetterBoard(attemptMeta)) {
      bestBoard = board;
      bestBoardMeta = attemptMeta;
    }
  }

  if (bestBoard) return bestBoard;
  throw new Error(`Unable to generate a valid daily board for ${date} after ${maxAttempts} attempts`);
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
