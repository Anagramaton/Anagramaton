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

const wordList = [...wordList_4, ...wordList_5, ...wordList_6, ...wordList_7,
  ...wordList_8, ...wordList_9, ...wordList_10, ...wordList_11, ...wordList_12,
  ...wordList_13, ...wordList_14, ...wordList_15, ...wordList_16plus];

// Lazy-init: only build the Set when first needed, not at module load time
let _dictionarySet = null;

export function getDictionarySet() {
  if (!_dictionarySet) {
    _dictionarySet = new Set(wordList.map(word => word.toUpperCase()));
  }
  return _dictionarySet;
}

export const dictionarySet = new Proxy({}, {
  has(_, key) { return getDictionarySet().has(key); }
});

export function isValidWord(word) {
  return getDictionarySet().has(word.toUpperCase());
}