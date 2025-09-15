import { isValidWord } from './gameLogic.js';
import { gameState } from './gameState.js';
import { letterPoints, reuseMultipliers, palindromeMultiplier, lengthMultipliers } from './constants.js';

// — Check for palindrome —
function isPalindrome(word) {
  return word.length > 1 && word === word.split('').reverse().join('');
}

// — Main scoring function —
export function submitCurrentWord(tiles) {
  const word = tiles.map(t => t.letter).join('');

  // Validate word length
  if (word.length < 4) {
    alert('❌ Word must be at least 4 letters long.');
    return null;
  }

  // Validate dictionary
  if (!isValidWord(word)) {
    alert(`❌ "${word}" is not a valid word.`);
    return null;
  }

  // Step 1: Calculate Base Score (NO lifetime reuse here)
  let baseScore = 0;
  for (const tile of tiles) {
  const letter = String(tile.letter || '').toUpperCase();
  const face = letterPoints[letter] || 1;
  baseScore += face;
  }


  // Step 2: Calculate Bonus Multipliers
  let multiplier = 1;

  // Length bonuses (5+ letters only)
  if (word.length >= 5) {
    const lengthKey = Math.min(word.length, 10); // cap at 10+
    multiplier *= lengthMultipliers[lengthKey] || 1;
  }

  // Palindrome bonus
  if (isPalindrome(word)) {
    multiplier *= palindromeMultiplier;
  }

  // Step 3: Calculate Final Score
  return baseScore * multiplier;
}

export function recomputeAllWordScores(wordEntries) {
  // Count how many words use each physical tile (by object identity)
  const totalUseByTile = new WeakMap();
  for (const entry of wordEntries) {
    const seen = new Set();
    for (const tile of entry.tiles || []) {
      if (seen.has(tile)) continue;
      seen.add(tile);
      totalUseByTile.set(tile, (totalUseByTile.get(tile) || 0) + 1);
    }
  }

// 🎨 Apply styling to tiles based on reuse count (idempotent)
if (Array.isArray(gameState.allTiles)) {
  for (const tile of gameState.allTiles) {
    const uses = totalUseByTile.get(tile) ?? 0;
    styleTileByReuse(tile, uses);
  }
}



function styleTileByReuse(tile, uses) {
  if (!tile || !tile.element) return;

  const poly = tile.shape || tile.element.querySelector('polygon.hex-tile');
  if (!poly) return;

  // --- Reset classes ---
  poly.setAttribute('class', 'hex-tile');
  tile.textLetter?.setAttribute('class', 'tile-letter');
  tile.textPoint?.setAttribute('class', 'tile-point');

  // --- Compute multiplier ---
  const multiplier = uses >= 3 ? reuseMultipliers[3] : (reuseMultipliers[uses] ?? 1);

  // Update displayed point value
  if (tile.textPoint && typeof tile.point === 'number') {
    tile.textPoint.textContent = String(tile.point * multiplier);
  }

// --- Apply reuse classes ---
if (uses === 1) {
  poly.classList.add('reuse-1');
    tile.textLetter?.classList.add('reuse-1');
  tile.textPoint?.classList.add('reuse-1');
} else if (uses === 2) {
  poly.classList.add('reuse-2');
  tile.textLetter?.classList.add('reuse-2');
  tile.textPoint?.classList.add('reuse-2');
} else if (uses >= 3) {
  poly.classList.add('reuse-3');
  tile.textLetter?.classList.add('reuse-3'); // add these
  tile.textPoint?.classList.add('reuse-3');  // add these
}

}


  // Score each word using the SAME tile multiplier for every word that uses that tile:
  // 1 word → ×1, 2 words → ×2, 3+ words → ×4
  return wordEntries.map(entry => {
    const letters = (entry.tiles || []).map(t => String(t.letter || '').toUpperCase());
    let base = 0;

    for (const tile of entry.tiles || []) {
      const letter = String(tile.letter || '').toUpperCase();
      const face = letterPoints[letter] || 1;

      const uses = totalUseByTile.get(tile) || 0;
    let tileMult = reuseMultipliers[uses] || (uses >= 3 ? reuseMultipliers[3] : 1);

      base += face * tileMult;
    }

    // word-level multipliers
    let mult = 1;
    const len = letters.length;
    if (len >= 5) mult *= (lengthMultipliers[Math.min(len, 10)] || 1);
    if (isPalindrome(letters.join(''))) mult *= palindromeMultiplier;

    return base * mult;
  });
}

// ------------------------------------------------------------
// Board scoring helper
// ------------------------------------------------------------

// Compute scores for words placed on the board.
// Accepts either ["WORD", ...] or [{ word, tiles, ...}, ...]
export function computeBoardWordScores(wordsLike) {
  // Normalize to entries with word + tiles
  const entries = (wordsLike || []).map(w =>
    typeof w === 'string'
      ? { word: w, tiles: [] }
      : { word: w.word, tiles: w.tiles || [] }
  );

  // Reuse the existing logic so scoring rules are identical
  const scored = recomputeAllWordScores(entries) || [];

  // Normalize to a simple shape and sort high-to-low
  return scored
    .map(s => ({
      word: s.word || (s?.entry?.word) || '',
      score: Number(s.score) || Number(s) || 0
    }))
    .filter(x => x.word) // drop any empties
    .sort((a, b) => b.score - a.score);
}


export function resetSelectionState() {
  const selectedTiles = gameState.selectedTiles || [];
  selectedTiles.forEach(tile => {
    if (tile.element) {
      
      tile.element.classList.remove('selected');
    }
  });
  gameState.selectedTiles = [];

  // 👇 Add this line so CURRENT WORD clears after submit/reset
  const preview = document.getElementById('current-word');
  if (preview) preview.textContent = '';
}
