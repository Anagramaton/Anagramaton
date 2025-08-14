// gameLogic.js
import wordList from './wordList.js';

export const dictionarySet = new Set(wordList.map(word => word.toUpperCase()));

export function isValidWord(word) {
  return dictionarySet.has(word.toUpperCase());
}
