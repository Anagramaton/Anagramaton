// anagrams.js

// Named export to match: `import { computeAnagrams } from './anagrams.js'`
export function computeAnagrams(placedWords, state) {
  const buckets = new Map();

  for (const { word } of placedWords) {
    const key = word.split('').sort().join('');
    const group = buckets.get(key) ?? buckets.set(key, []).get(key);
    group.push(word);
  }

  const anagrams = [];
  for (const group of buckets.values()) {
    if (group.length > 1) anagrams.push(...group);
  }

  // Update state if provided (keeps old behavior), and also return the list.
  if (state && typeof state === 'object') {
    state.anagramList = anagrams;
  }

  console.log(`🔀 anagram count: ${anagrams.length}`, anagrams);
  return anagrams;
}
