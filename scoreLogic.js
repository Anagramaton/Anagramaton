import { isValidWord } from './gameLogic.js';
import { gameState } from './gameState.js';
import { letterPoints, reuseMultipliers, anagramMultiplier, lengthMultipliers } from './constants.js';
import { playAlert } from './main.js';

// Track previous reuse counts so we only touch DOM when something changed
const _prevReuseCount = new WeakMap();

// — Check for anagram —
function isAnagram(word) {
  return word.length > 1 && word === word.split('').reverse().join('');
}

// — Main scoring function —
export async function submitCurrentWord(tiles) {
  const word = tiles.map(t => t.letter).join('');

  if (word.length < 4) {
    await playAlert('❌ Word must be at least 4 letters long.');
    return null;
  }

  if (!isValidWord(word)) {
    await playAlert(`❌ "${word}" is not a valid word.`);
    return null;
  }

  // Step 1: Base Score
  let baseScore = 0;
  for (const tile of tiles) {
    const letter = String(tile.letter || '').toUpperCase();
    const face = letterPoints[letter] || 1;
    baseScore += face;
  }

  // Step 2: Multipliers
  let multiplier = 1;
  if (word.length >= 5) {
    const lengthKey = Math.min(word.length, 10);
    multiplier *= lengthMultipliers[lengthKey] || 1;
  }
  if (isAnagram(word)) {
    multiplier *= anagramMultiplier;
  }

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

  // Only restyle tiles whose reuse count has actually changed
  if (Array.isArray(gameState.allTiles)) {
    for (const tile of gameState.allTiles) {
      const uses = totalUseByTile.get(tile) ?? 0;
      const preReuse = gameState.preReuseKeys?.has(tile.key) ? 1 : 0;
      const effective = uses + preReuse;
      if (_prevReuseCount.get(tile) !== effective) {
        styleTileByReuse(tile, effective);
        _prevReuseCount.set(tile, effective);
      }
    }
  }

  function styleTileByReuse(tile, uses) {
    if (!tile || !tile.element) return;

    const poly = tile.shape || tile.element.querySelector('polygon.hex-tile');
    if (!poly) return;

    // Reset only reuse classes — preserve phrase-text and other persistent classes
    poly.classList.remove('reuse-1', 'reuse-2', 'reuse-3');
    tile.textLetter?.classList.remove('reuse-1', 'reuse-2', 'reuse-3');
    tile.textPoint?.classList.remove('reuse-1', 'reuse-2', 'reuse-3');

    const multiplier = uses === 0 ? 1
                     : uses === 1 ? reuseMultipliers[2]
                     : reuseMultipliers[3];

    if (tile.textPoint && typeof tile.point === 'number') {
      tile.textPoint.textContent = String(tile.point * multiplier);
    }

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
      tile.textLetter?.classList.add('reuse-3');
      tile.textPoint?.classList.add('reuse-3');

      const g = tile.element;
      const parent = g?.parentNode;
      if (parent && parent.lastChild !== g) {
        parent.appendChild(g);
      }
    }
  }

  // Score each word with reuse-aware tile multipliers
  return wordEntries.map(entry => {
    const letters = (entry.tiles || []).map(t => String(t.letter || '').toUpperCase());
    let base = 0;

    for (const tile of entry.tiles || []) {
      const letter = String(tile.letter || '').toUpperCase();
      const face = letterPoints[letter] || 1;
      const uses = totalUseByTile.get(tile) || 0;
      const preReuse = gameState.preReuseKeys?.has(tile.key) ? 1 : 0;
      const effectiveUses = uses + preReuse;
      const tileMult = reuseMultipliers[effectiveUses] || (effectiveUses >= 3 ? reuseMultipliers[3] : 1);
      base += face * tileMult;
    }

    let mult = 1;
    const len = letters.length;
    if (len >= 5) mult *= (lengthMultipliers[Math.min(len, 10)] || 1);
    if (isAnagram(letters.join(''))) mult *= anagramMultiplier;

    return base * mult;
  });
}

export function computeBoardWordScores(wordsLike) {
  const entries = (wordsLike || []).map(w =>
    typeof w === 'string'
      ? { word: String(w).toUpperCase(), tiles: [] }
      : { word: String(w?.word || '').toUpperCase(), tiles: w?.tiles || [] }
  );

  const scores = recomputeAllWordScores(entries) || [];

  return entries
    .map((entry, i) => ({
      word: entry.word,
      score: Number(scores[i]?.score ?? scores[i] ?? 0),
    }))
    .filter(x => x.word)
    .sort((a, b) => b.score - a.score);
}

export function resetSelectionState() {
  const selectedTiles = gameState.selectedTiles || [];
  selectedTiles.forEach(tile => {
    if (tile.element) {
      const poly = tile.element.querySelector('polygon');
      if (poly) poly.classList.remove('selected');
      tile.textLetter?.classList.remove('selected');
      tile.textPoint?.classList.remove('selected');
    }
  });
  gameState.selectedTiles = [];

  const preview = document.getElementById('current-word');
}