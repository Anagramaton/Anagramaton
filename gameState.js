export const gameState = {
  // ==========================
  // Core Game State
  // ==========================
  selectedTiles: [],
  seedPhrase: null,              // "PHRASE A / PHRASE B"
  seedPaths: { phraseA: [], phraseB: [] },
  anagramList: [],

  // ==========================
  // Phrase Finder Panel State
  // ==========================
  seedHints: {                   // 2 hints each
    phrase1: [],
    phrase2: []
  },
  hintUsage: {
    phrase1: { hint1: false, hint2: false },
    phrase2: { hint1: false, hint2: false },
    wordCount: false
  },
  phraseRevealed: {
    phrase1: false,
    phrase2: false
  },

  // ==========================
  // Multiplier logic
  // ==========================
  multiplier: 10,                // x10 → x0 as hintsUsed increases
  hintsUsed: 0,                  // 0..5

  // ==========================
  // Scoring / Bonus
  // ==========================
  score: 0,                      // running score
  anagramBonusPaid: false        // award once per round
};
