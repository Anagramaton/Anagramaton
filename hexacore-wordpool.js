import wordList_5 from './wordList_5.js';
import wordList_6 from './wordList_6.js';
import wordList_7 from './wordList_7.js';
import wordList_8 from './wordList_8.js';
import wordList_9 from './wordList_9.js';
import wordList_10 from './wordList_10.js';
import wordList_11 from './wordList_11.js';
import wordList_12 from './wordList_12.js';
import wordList_13 from './wordList_13.js';

const RARE = new Set(['Q', 'Z', 'X', 'J']);

function scoreWord(word) {
  const upper = String(word || '').toUpperCase();
  if (!/^[A-Z]+$/.test(upper)) return -Infinity;
  const unique = new Set(upper);
  const vowels = [...upper].filter(ch => 'AEIOU'.includes(ch)).length;
  const rareCount = [...upper].filter(ch => RARE.has(ch)).length;
  const vowelBalance = vowels >= 2 && vowels <= Math.ceil(upper.length / 2) ? 7 : 0;
  return (upper.length * 12) + (unique.size * 5) + vowelBalance - (rareCount * 9);
}

function normalizeWords(list, minLen = 5, maxLen = 13) {
  const seen = new Set();
  return list
    .map(w => String(w || '').toUpperCase())
    .filter(w => w.length >= minLen && w.length <= maxLen)
    .filter(w => /^[A-Z]+$/.test(w))
    .filter((w) => {
      if (seen.has(w)) return false;
      seen.add(w);
      return true;
    });
}

const ALL_WORDS = normalizeWords([
  ...wordList_5,
  ...wordList_6,
  ...wordList_7,
  ...wordList_8,
  ...wordList_9,
  ...wordList_10,
  ...wordList_11,
  ...wordList_12,
  ...wordList_13,
]);

const WORDS_BY_LENGTH = new Map();
for (const w of ALL_WORDS) {
  const len = w.length;
  if (!WORDS_BY_LENGTH.has(len)) WORDS_BY_LENGTH.set(len, []);
  WORDS_BY_LENGTH.get(len).push(w);
}

for (const list of WORDS_BY_LENGTH.values()) {
  list.sort((a, b) => scoreWord(b) - scoreWord(a));
}

export function chooseClearanceRankedWords(rng, constraints = {}, count = 8) {
  const maxRareLetters = Number.isFinite(constraints.maxRareLetters)
    ? constraints.maxRareLetters
    : 4;

  const ranked = ALL_WORDS
    .map(word => ({ word, rank: scoreWord(word) }))
    .sort((a, b) => b.rank - a.rank);

  const limit = Math.min(ranked.length, 3200);
  const candidates = ranked.slice(0, limit);
  const selected = [];
  const used = new Set();
  let rareTotal = 0;

  while (selected.length < count && used.size < candidates.length) {
    const idx = Math.floor(rng() * candidates.length);
    if (used.has(idx)) continue;
    used.add(idx);

    const word = candidates[idx].word;
    const rareInWord = [...word].filter(ch => RARE.has(ch)).length;
    if (rareTotal + rareInWord > maxRareLetters) continue;

    selected.push(word);
    rareTotal += rareInWord;
  }

  return selected;
}

export function pickDeterministicLengthWord(length, rng, constraints = {}) {
  const list = WORDS_BY_LENGTH.get(length) || [];
  if (list.length === 0) return null;

  const maxRareLetters = Number.isFinite(constraints.maxRareLetters)
    ? constraints.maxRareLetters
    : 4;

  const filtered = list.filter(word => [...word].filter(ch => RARE.has(ch)).length <= maxRareLetters);
  const source = filtered.length > 0 ? filtered : list;
  const idx = Math.floor(rng() * Math.min(source.length, 300));
  return source[idx];
}
