
import { generateSeededBoard } from './gridLogic.js';
import { renderGrid } from './gridRenderer.js';
import { gameState } from './gameState.js';
import { GRID_RADIUS } from './constants.js';
import { areAxialNeighbors } from './utils.js';
import { isValidWord } from './gameLogic.js';



export const DOM = {
  svg: document.getElementById('hex-grid'),
  wordList: document.getElementById('word-list'),
};


export let tileElements = [];
export let grid;

let currentSoundIndex = 0;

const tileSounds = [
  new Audio('sounds/note1.mp3'),
  new Audio('sounds/note2.mp3'),
  new Audio('sounds/note3.mp3'),
  new Audio('sounds/note4.mp3'),
  new Audio('sounds/note5.mp3'),
  new Audio('sounds/note6.mp3'),
  new Audio('sounds/note7.mp3'),
  new Audio('sounds/note8.mp3'),
  new Audio('sounds/note9.mp3')
];

window.tileSounds = tileSounds;

const isMobile = window.matchMedia('(max-width: 768px)').matches;

function playNextTileSound() {
  if (!isMobile) return;               // only play sounds on mobile

  const sound = tileSounds[currentSoundIndex];
  if (!sound) return;

  try {
    sound.currentTime = 0;
  } catch (_) {}

  sound.play().catch(() => {});

  if (currentSoundIndex < tileSounds.length - 1) {
    // Advance through the sequence normally
    currentSoundIndex++;
  } else {
    // Last sound (note9.mp3) has just played; move index past the end
    // so further calls in this swipe are silent until resetTileSoundSequence()
    currentSoundIndex = tileSounds.length;
  }
}



function resetTileSoundSequence() {
  if (!isMobile) return;               // only reset sequence on mobile
  currentSoundIndex = 0;
}





// ============================================================================
// UI Helpers
// ============================================================================

function updateWordPreview() {
  const selectedTiles = gameState.selectedTiles || [];
  const word = selectedTiles.map(t => t.letter).join('');
  const upper = word.toUpperCase();
  const wordPreviewElement = document.getElementById('current-word');

  if (wordPreviewElement) wordPreviewElement.textContent = upper;

  // Clear shimmer from ALL tiles before applying new ones
  document.querySelectorAll('.valid-shimmer').forEach(el => {
    el.classList.remove('valid-shimmer');
    el.style.removeProperty('--shimmer-delay');
  });

  // nothing selected → no effects
  if (!word) {
    if (wordPreviewElement) wordPreviewElement.classList.remove('valid-word');
    return;
  }

  const isValid = upper.length >= 4 && isValidWord(upper);

  if (isValid) {
    if (wordPreviewElement) wordPreviewElement.classList.add('valid-word');
    // add shimmer to each selected tile
    selectedTiles.forEach((tile, idx) => {
      if (tile?.element) {
        tile.element.classList.add('valid-shimmer');
        tile.element.style.setProperty('--shimmer-delay', `${idx * 0.18}s`);
      }
    });
  } else {
    if (wordPreviewElement) wordPreviewElement.classList.remove('valid-word');
  }
}






export function clearCurrentSelection() {
  const selectedTiles = gameState.selectedTiles || [];
  selectedTiles.forEach(tile => {
    if (tile?.element) {
      tile.element.classList.remove('selected');
      tile.element.classList.remove('valid-shimmer');
    }
  });
  gameState.selectedTiles = [];
  updateWordPreview();

  // extra safety: remove any leftover shimmer
  document.querySelectorAll('.valid-shimmer').forEach(el => {
    el.classList.remove('valid-shimmer');
  });

  resetTileSoundSequence(); // <-- Add this line here
}



// ============================================================================
// Event Handlers
// ============================================================================


export function handleTileClick(tile) {
  if (!Array.isArray(gameState.selectedTiles)) {
    gameState.selectedTiles = [];
  }
  const selectedTiles = gameState.selectedTiles;

  // --- If tile already selected.
  if (selectedTiles.includes(tile)) {
    // allow deselect only if it's the last selected (stack pop)
    if (tile === selectedTiles[selectedTiles.length - 1]) {
      selectedTiles.pop();
      tile.element.classList.remove('selected');
      updateWordPreview();

      // keep sound index matched to selection length on mobile
      if (isMobile) {
        if (selectedTiles.length === 0) {
          resetTileSoundSequence();
        } else if (currentSoundIndex > 0) {
          currentSoundIndex--;
        }
      }
    } else {
      console.warn("Tried to deselect non-last tile");
      playAlertSound();
      alert('❌ You can only deselect the most recently selected tile.');
      tile.element.classList.add('selected');
    }
    return;
  }


  // --- If this is the first selection
  if (selectedTiles.length === 0) {
    console.log("Selecting first tile");
    tile.element.classList.add('selected');
    selectedTiles.push(tile);
    updateWordPreview();
    resetTileSoundSequence();   // start sequence for this swipe
    playNextTileSound();
    return;
  }

  // --- Otherwise enforce adjacency to the last selected tile
  const lastTile = selectedTiles[selectedTiles.length - 1];

  // If not adjacent, force this tile to be visually unselected and bail.
  if (!areAxialNeighbors(lastTile, tile)) {
    tile.element.classList.remove('selected');
    return;
  }

  // Adjacent: select it normally
  tile.element.classList.add('selected');
  selectedTiles.push(tile);
  updateWordPreview();
  playNextTileSound();
}



// ============================================================================
// Initialization
// ============================================================================


let __initCount = 0;

export function initializeGrid() {
  __initCount++;
  console.log(`[initializeGrid] call #${__initCount} — starting`);

  gameState.totalScore = 0;
  tileElements.length = 0;

  console.log('[initializeGrid] before generateSeededBoard');
  grid = generateSeededBoard(GRID_RADIUS, gameState);
  console.log('[initializeGrid] after generateSeededBoard');

  gameState.grid = grid;

  console.log('[initializeGrid] before renderGrid');
  renderGrid(grid, DOM.svg, tileElements, handleTileClick, GRID_RADIUS);
  console.log('[initializeGrid] after renderGrid');
  console.log('[initializeGrid] tiles=', tileElements.length, 'svg size=', DOM.svg?.clientWidth, 'x', DOM.svg?.clientHeight);


  gameState.allTiles = tileElements;

  const clearButton = document.getElementById('clear-word');
  if (clearButton && !clearButton.dataset.listener) {
    clearButton.addEventListener('click', clearCurrentSelection);
    clearButton.dataset.listener = 'true';
  }

  console.log(`[initializeGrid] call #${__initCount} — finished`);
}
