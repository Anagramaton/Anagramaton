export const gameState = {
  mode: 'unlimited',      // "daily" | "unlimited" (default)
  seedPhrase: null,       // daily-only
  seedPaths: null,        // daily-only
  seedHints: null,        // daily-only
  dailyId: null,          // daily-only

  // Phrase pair tracking (daily-only)
  phrasesFound: { phrase1: false, phrase2: false },
  phraseCleanLetters: { phrase1: '', phrase2: '' },

  // Phrase tile footprint — populated after Step 1 placement (daily-only)
  phraseOccupiedKeys: null,   // Set of hex keys written by phrase A or phrase B
  phraseAdjacentKeys: null,   // Set of hex keys directly neighbouring the phrase cluster

  hintUsage: {
    wordCount: false,          // fixed: was 'wordcount' (lowercase c), mismatched phrasePanel.js
    phraseRevealed: {
      phrase1: false,
      phrase2: false
    },
    hintOrder: [],
  },

  multiplier: 10,
  hintsUsed: 0,

  score: 0,
  anagramBonusPaid: false,

  words: [],
  boardTop10: [],
  boardTop10Total: 0,
  gridReady: false
};