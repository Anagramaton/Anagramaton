export const gameState = {
  mode: 'unlimited',      // "daily" | "unlimited" (default)
  seedPhrase: null,       // daily-only
  seedPaths: null,        // daily-only
  seedHints: null,        // daily-only
  dailyId: null,          // daily-only

  // Phrase pair tracking (daily-only)
  phrasesFound: { phrase1: false, phrase2: false },
  phraseCleanLetters: { phrase1: '', phrase2: '' },

  hintUsage: {
    wordcount: false,
    phraseRevealed: {
      phrase1: false,
      phrase2: false
    }
  },

  multiplier: 10,           
  hintsUsed: 0,             


  score: 0,                 
  anagramBonusPaid: false,  


  words: [], 
  boardTop10: [],         
  boardTop10Total: 0,     // ← added comma here
  gridReady: false        // ← ADD THIS
};
