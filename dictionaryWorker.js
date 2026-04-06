// dictionaryWorker.js — module worker that owns the word list and Set construction.
// Runs entirely off the main thread to prevent "Page Unresponsive" hangs.
import wordList from './wordList.js';

let _dictionarySet = null;

// Build the Set immediately on worker load (off the main thread).
_dictionarySet = new Set(wordList.map(w => w.toUpperCase()));

// Notify the main thread that the worker is ready.
self.postMessage({ type: 'ready' });

self.onmessage = function (e) {
  const { type, id } = e.data;

  if (type === 'has') {
    const result = _dictionarySet.has(e.data.word.toUpperCase());
    self.postMessage({ type: 'result', id, result });

  } else if (type === 'hasMany') {
    const results = e.data.words.map(w => _dictionarySet.has(w.toUpperCase()));
    self.postMessage({ type: 'resultMany', id, results });

  } else if (type === 'getAll') {
    // Return all words as an uppercase array for use by gridLogic candidates.
    const words = Array.from(_dictionarySet);
    self.postMessage({ type: 'allWords', id, words });
  }
};
