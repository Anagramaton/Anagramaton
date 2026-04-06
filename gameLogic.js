import { getAllWordsAsync } from './dictionaryClient.js';

// In-memory Set populated asynchronously via the dictionary worker.
// null until warmDictionary() resolves.
let _dictionarySet = null;
let _warmPromise = null;

/**
 * Triggers the dictionary worker to load and returns a Promise that resolves
 * once the in-memory Set is ready for synchronous lookups.
 * Safe to call multiple times — only one load is ever initiated.
 */
export function warmDictionary() {
  if (!_warmPromise) {
    _warmPromise = getAllWordsAsync().then(words => {
      _dictionarySet = new Set(words);
    });
  }
  return _warmPromise;
}

/**
 * Returns the Set once warmed (for callers that need the raw Set).
 * @deprecated Prefer isValidWord() or isValidWordAsync().
 */
export function getDictionarySet() {
  return _dictionarySet;
}

export const dictionarySet = new Proxy({}, {
  has(_, key) { return isValidWord(key); }
});

/**
 * Synchronous word lookup backed by the pre-warmed in-memory Set.
 * Returns false (with a console warning) if the Set is not yet ready.
 */
export function isValidWord(word) {
  if (!_dictionarySet) {
    console.warn('[dict] Dictionary not warmed yet — returning false for:', word);
    return false;
  }
  return _dictionarySet.has(word.toUpperCase());
}

/**
 * Async word lookup that waits for the dictionary to be warm before checking.
 */
export async function isValidWordAsync(word) {
  await warmDictionary();
  return _dictionarySet.has(word.toUpperCase());
}