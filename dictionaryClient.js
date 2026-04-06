// dictionaryClient.js — singleton client that wraps dictionaryWorker.js.
// Spawns a single module worker and exposes promise-based APIs.

const _worker = new Worker(new URL('./dictionaryWorker.js', import.meta.url), { type: 'module' });

// Pending requests keyed by incrementing ID.
const _pending = new Map();
let _nextId = 0;

// Resolves when the worker has finished building the Set.
export const workerReady = new Promise((resolve, reject) => {
  _pending.set('__ready__', { resolve, reject });
});

_worker.onmessage = function (e) {
  const { type, id } = e.data;

  if (type === 'ready') {
    const p = _pending.get('__ready__');
    if (p) {
      _pending.delete('__ready__');
      p.resolve();
    }
    return;
  }

  const pending = _pending.get(id);
  if (!pending) return;
  _pending.delete(id);

  if (type === 'result') {
    pending.resolve(e.data.result);
  } else if (type === 'resultMany') {
    pending.resolve(e.data.results);
  } else if (type === 'allWords') {
    pending.resolve(e.data.words);
  }
};

_worker.onerror = function (err) {
  // Reject all pending requests on worker error.
  for (const [key, p] of _pending) {
    p.reject(err);
  }
  _pending.clear();
  console.error('[dictionaryClient] Worker error:', err);
};

/**
 * Returns a Promise<boolean> indicating whether `word` is in the dictionary.
 */
export function isValidWordAsync(word) {
  return new Promise((resolve, reject) => {
    const id = _nextId++;
    _pending.set(id, { resolve, reject });
    _worker.postMessage({ type: 'has', word, id });
  });
}

/**
 * Returns a Promise<string[]> containing only those words from `words`
 * that exist in the dictionary.
 */
export function filterValidWordsAsync(words) {
  return new Promise((resolve, reject) => {
    const id = _nextId++;
    _pending.set(id, {
      resolve: (results) => resolve(words.filter((_, i) => results[i])),
      reject,
    });
    _worker.postMessage({ type: 'hasMany', words, id });
  });
}

/**
 * Returns a Promise<string[]> with every word in the dictionary (uppercase).
 * Used by gridLogic to build the candidates list without importing wordList.js.
 */
export function getAllWordsAsync() {
  return new Promise((resolve, reject) => {
    const id = _nextId++;
    _pending.set(id, { resolve, reject });
    _worker.postMessage({ type: 'getAll', id });
  });
}
