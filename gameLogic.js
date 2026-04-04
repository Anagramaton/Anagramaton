// No static import of wordList — loaded async via preloadDictionary()

let _dictionarySet = null;
let _loadPromise = null;

/**
 * Start loading the dictionary in the background.
 * Safe to call multiple times — returns the same Promise.
 * Resolves when the Set is ready.
 */
export function preloadDictionary() {
  if (_loadPromise) return _loadPromise;
  _loadPromise = fetch('./wordList.json')
    .then(r => {
      if (!r.ok) throw new Error(`Failed to load wordList.json: ${r.status}`);
      return r.json();
    })
    .then(words => {
      _dictionarySet = new Set(words.map(w => w.toUpperCase()));
    });
  return _loadPromise;
}

export function getDictionarySet() {
  return _dictionarySet; // may be null before preloadDictionary() resolves
}

export const dictionarySet = new Proxy({}, {
  has(_, key) {
    return _dictionarySet ? _dictionarySet.has(key) : false;
  }
});

export function isValidWord(word) {
  return _dictionarySet ? _dictionarySet.has(word.toUpperCase()) : false;
}