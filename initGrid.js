import { generateSeededBoard } from './gridLogic.js';
import { renderGrid } from './gridRenderer.js';
import { gameState } from './gameState.js';
import { GRID_RADIUS } from './constants.js';
import { areAxialNeighbors } from './utils.js';
import { isValidWord } from './gameLogic.js';
import { playSound } from './gameAudio.js';


export const DOM = {
  svg: document.getElementById('hex-grid'),
  wordList: document.getElementById('word-list'),
};
export let tileElements = [];
export let grid;





// swipe / drag state
let isDragging = false;
let lastHoverTile = null;

function getTileFromEventTarget(target) {
  if (!target) return null;
  const g = target.closest?.('.tile');
  if (!g) return null;
  const tile = tileElements.find(t => t && t.element === g) || null;
  return tile;
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

  if (!word) {
    if (wordPreviewElement) wordPreviewElement.classList.remove('valid-word');
    return;
  }

  const isValid = upper.length >= 4 && isValidWord(upper);

  if (isValid) {
    if (wordPreviewElement) wordPreviewElement.classList.add('valid-word');
    selectedTiles.forEach((tile, idx) => {
      const poly = tile.element.querySelector('polygon');
      if (poly) {
        poly.classList.add('valid-shimmer');
        poly.style.setProperty('--shimmer-delay', `${idx * 0.18}s`);
      }
    });
  } else {
    if (wordPreviewElement) wordPreviewElement.classList.remove('valid-word');
  }
}

// Clear word builder state
export function clearCurrentSelection() {
  const selectedTiles = gameState.selectedTiles || [];
  selectedTiles.forEach(tile => {
    if (tile?.element) {
      const poly = tile.element.querySelector('polygon');
      if (poly) {
        poly.classList.remove('selected', 'valid-shimmer');
        poly.style.removeProperty('--shimmer-delay');
      }
    }
  });

  gameState.selectedTiles = [];
  updateWordPreview();

  document.querySelectorAll('polygon.valid-shimmer').forEach(poly => {
    poly.classList.remove('valid-shimmer');
    poly.style.removeProperty('--shimmer-delay');
  });
}

// ============================================================================
// Event Handlers
// ============================================================================

function handleSwipeTileStep(tile) {
  if (!isDragging) return;
  if (!tile || !tile.element) return;

  const selectedTiles = gameState.selectedTiles || [];
  const idx = selectedTiles.indexOf(tile);
  const isAlreadySelected = idx !== -1;

  if (isAlreadySelected) {
  const isLast = idx === selectedTiles.length - 1;

  if (isLast) {
    // Dragging back over the last tile again: deselect it
    const removed = selectedTiles.pop();
    const poly = removed.element.querySelector('polygon');
    if (poly) poly.classList.remove('selected');
    updateWordPreview();
    // Play sound for new length after removing one tile
    const index = Math.min(selectedTiles.length, 14);
    if (index > 0) {
      requestAnimationFrame(() => {
  playSound(`swipe${index}`);
});

    }
    return;
  }


  // Backtracking: drag onto an earlier tile in the path
  for (let i = selectedTiles.length - 1; i > idx; i--) {
    const t = selectedTiles[i];
    const poly = t.element.querySelector('polygon');
    if (poly) poly.classList.remove('selected');
    selectedTiles.pop();
  }
  updateWordPreview();
  // Play sound for the new length after backtracking
  const index = Math.min(selectedTiles.length, 14);
  requestAnimationFrame(() => {
    playSound(`swipe${index}`);
  });

  return;
}



 // New tile: enforce adjacency, then select and extend the path
if (selectedTiles.length === 0 || areAxialNeighbors(selectedTiles[selectedTiles.length - 1], tile)) {
  const poly = tile.element.querySelector('polygon');
  if (poly) poly.classList.add('selected');
  selectedTiles.push(tile);
  updateWordPreview();
     // Play sound for new length after removing one tile
    const index = Math.min(selectedTiles.length, 14);
    if (index > 0) {
      requestAnimationFrame(() => {
        playSound(`swipe${index}`);
      });
    }

}


}



function handlePointerDown(e) {
  e.preventDefault();
    const tile = getTileFromEventTarget(e.target);
  if (!tile) {
    return;
  }
  isDragging = true;
  lastHoverTile = null;
  clearCurrentSelection();
}


function handlePointerMove(e) {
  if (!isDragging) return;

  const hitElement = document.elementFromPoint(e.clientX, e.clientY);
  const tile = getTileFromEventTarget(hitElement);

  if (tile && tile !== lastHoverTile) {
    handleSwipeTileStep(tile);
    lastHoverTile = tile;
  }
}





function handlePointerUp(e) {
    isDragging = false;
    lastHoverTile = null;
  updateWordPreview();
}

// ============================================================================
// Initialization
// ============================================================================

export function initializeGrid() {
  gameState.totalScore = 0;
  tileElements.length = 0;

  grid = generateSeededBoard(GRID_RADIUS, gameState);
  gameState.grid = grid;

  renderGrid(grid, DOM.svg, tileElements, GRID_RADIUS);

  gameState.allTiles = tileElements;


  if (!DOM.svg.dataset.swipeListeners) {
    DOM.svg.addEventListener('pointerdown', handlePointerDown, { passive: false });
    DOM.svg.addEventListener('pointermove', handlePointerMove, { passive: false });
    window.addEventListener('pointerup', handlePointerUp);

    DOM.svg.dataset.swipeListeners = 'true';
  }

  const clearButton = document.getElementById('clear-word');
  if (clearButton && !clearButton.dataset.listener) {
    clearButton.addEventListener('click', clearCurrentSelection);
    clearButton.dataset.listener = 'true';
  }
}