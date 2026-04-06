// dictionaryClient.js — singleton client that wraps dictionaryWorker.js.
// Spawns a single module worker and exposes promise-based APIs.

const _worker = new Worker(new URL('./dictionaryWorker.js', import.meta.url), { type: 'module' });

// Pending requests keyed by incrementing ID.
const _pending = new Map();
let _nextId = 0;
let _workerDead = false;

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
  _workerDead = true;
  // Reject all pending requests (including the __ready__ sentinel) on worker error.
  for (const [, p] of _pending) {
    p.reject(err);
  }
  _pending.clear();
  console.error('[dictionaryClient] Worker error:', err);
};

/** Throws if the worker has crashed so callers get an immediate rejection. */
function _assertAlive() {
  if (_workerDead) throw new Error('[dictionaryClient] Worker has crashed and cannot process requests.');
}

/**
 * Returns a Promise<boolean> indicating whether `word` is in the dictionary.
 */
export function isValidWordAsync(word) {
  _assertAlive();
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
  _assertAlive();
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
  _assertAlive();
  return new Promise((resolve, reject) => {
    const id = _nextId++;
    _pending.set(id, { resolve, reject });
    _worker.postMessage({ type: 'getAll', id });
  });
}
