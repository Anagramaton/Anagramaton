import wordList from './wordList.js';

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