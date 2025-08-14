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

  // Step 1: Calculate Base Score with reuse bonuses
  let baseScore = 0;
  for (const tile of tiles) {
    tile.usageCount = (tile.usageCount || 0) + 1;

    let tileValue = letterPoints[tile.letter] || 1;
    if (tile.usageCount === 2) {
      tileValue *= reuseMultipliers[2];   // x2 for 2nd use
    } else if (tile.usageCount >= 3) {
      tileValue *= reuseMultipliers[3];   // x4 for 3rd+ use
    }
    baseScore += tileValue;
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

export function resetSelectionState() {
  const selectedTiles = gameState.selectedTiles || [];
  selectedTiles.forEach(tile => {
    if (tile.element) {
      // Only remove the "selected" state; keep any solved/celebrate classes
      tile.element.classList.remove('selected');
    }
  });
  gameState.selectedTiles = [];
}
