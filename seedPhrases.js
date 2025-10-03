import { getAllCoords, isValidCoord, hexKey, ADJ_DIRS } from './gridCoords.js';
import { shuffledArray } from './utils.js';


function findPhrasePath(grid, phrase, radius) {
  const coords = getAllCoords(radius);
  const visited = new Set();
  const upperPhrase = phrase.toUpperCase().replace(/[^A-Z]/g, '');
  const letters = upperPhrase.split('');

  function dfs(q, r, idx, path) {
    const key = hexKey(q, r);
    if (!isValidCoord(q, r, radius)) return null;
    if (visited.has(key)) return null;

    const existing = grid[key];
    const expected = letters[idx];

    if (existing && existing !== expected) return null;

    visited.add(key);
    path.push({ q, r, key });

    if (idx === letters.length - 1) {
      return [...path];
    }

    for (const [dq, dr] of shuffledArray(ADJ_DIRS)) {
      const result = dfs(q + dq, r + dr, idx + 1, [...path]);
      if (result) return result;
    }

    visited.delete(key);
    return null;
  }

  for (const { q, r } of shuffledArray(coords)) {
    visited.clear();
    const path = dfs(q, r, 0, []);
    if (path) return path;
  }

  return null;
}

function placePhrase(grid, path, phrase) {
  const letters = phrase.toUpperCase().replace(/[^A-Z]/g, '').split('');

  for (let i = 0; i < path.length; i++) {
    const { key } = path[i];
    const letter = letters[i];

    if (!grid[key] || grid[key] === letter) {
      grid[key] = letter;
    } else {
      throw new Error(`Letter conflict at ${key}: grid has '${grid[key]}', trying to place '${letter}'`);
    }
  }
}

export { findPhrasePath, placePhrase };