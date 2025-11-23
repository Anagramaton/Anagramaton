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

// swipe / drag state
let isDragging = false;
let lastHoverTile = null;

// map a pointer event target back to a tile object
function getTileFromEventTarget(target) {
  if (!target) return null;
  const g = target.closest?.('.tile');
  if (!g) return null;
  return tileElements.find(t => t && t.element === g) || null;
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

export function clearCurrentSelection() {
  const selectedTiles = gameState.selectedTiles || [];
  selectedTiles.forEach(tile => {
    if (tile?.element) {
      const poly = tile.element.querySelector('polygon');
      if (poly) {
        poly.classList.remove('selected');
        poly.classList.remove('valid-shimmer');
        poly.style.removeProperty('--shimmer-delay');
      }
    }
  });

  gameState.selectedTiles = [];
  updateWordPreview();

  // extra safety: remove any leftover shimmer (polygons only)
  document.querySelectorAll('polygon.valid-shimmer').forEach(poly => {
    poly.classList.remove('valid-shimmer');
    poly.style.removeProperty('--shimmer-delay');
  });
}


// ============================================================================
// Event Handlers
// ============================================================================

function handleSwipeTileStep(tile) {
  // Swipe-only: ignore anything that happens outside a drag
  if (!isDragging) return;
  if (!tile || !tile.element) return;

  if (!Array.isArray(gameState.selectedTiles)) {
    gameState.selectedTiles = [];
  }
  const selectedTiles = gameState.selectedTiles;

  const isAlreadySelected = selectedTiles.includes(tile);
  const poly = tile.element.querySelector('polygon');

  // ------------------------------------------------------------
  // Case 1: Tile already in current path
  // ------------------------------------------------------------
  if (isAlreadySelected) {
    const isLast = tile === selectedTiles[selectedTiles.length - 1];

    // Swiping back over the last tile → undo last step
    if (isLast) {
      selectedTiles.pop();
      if (poly) {
        poly.classList.remove('selected');
      }
      updateWordPreview();
    }

    // Older tiles in the chain are ignored (path stays as-is)
    return;
  }

  // ------------------------------------------------------------
  // Case 2: First tile in this swipe
  // ------------------------------------------------------------
  if (selectedTiles.length === 0) {
    if (poly) {
      poly.classList.add('selected');
    }
    selectedTiles.push(tile);
    updateWordPreview();
    return;
  }

  // ------------------------------------------------------------
  // Case 3: Must be adjacent to extend path
  // ------------------------------------------------------------
  const lastTile = selectedTiles[selectedTiles.length - 1];

  if (!areAxialNeighbors(lastTile, tile)) {
    return;
  }

  if (poly) {
    poly.classList.add('selected');
  }
  selectedTiles.push(tile);
  updateWordPreview();
}



// ============================================================================
// Initialization
// ============================================================================

let __initCount = 0;

function handlePointerDown(e) {
    e.preventDefault(); // Prevents default touch behaviors (scroll, zoom)
    console.log('Pointer/Touch Down Event:', e.type, 'Target:', e.target); // DEBUG
    const tile = getTileFromEventTarget(e.target);
    console.log('Tile from Event Target:', tile); // DEBUG
  if (!tile) return;

  isDragging = true;
  lastHoverTile = null;


  // optional: clear any existing word when starting a new drag
  clearCurrentSelection();
  if (!Array.isArray(gameState.selectedTiles)) {
    gameState.selectedTiles = [];
  }
}


function handlePointerMove(e) {
  console.log('Pointer/Touch Move Event:', e.type, 'Target:', e.target); // DEBUG
  if (!isDragging) return;

  const tile = getTileFromEventTarget(e.target);
  console.log('Tile Hovered:', tile); // DEBUG
  if (!tile || tile === lastHoverTile) return;

  handleSwipeTileStep(tile);
  lastHoverTile = tile;
}


function handlePointerUp(e) {
  console.log('Pointer/Touch Up Event:', e.type); // DEBUG
  isDragging = false;
  lastHoverTile = null;

  // No tiles selected during this swipe → nothing to lock in
  if (!Array.isArray(gameState.selectedTiles) || gameState.selectedTiles.length === 0) {
    return;
  }

  
  updateWordPreview();
}



export function initializeGrid() {
  __initCount++;

  gameState.totalScore = 0;
  tileElements.length = 0;

  grid = generateSeededBoard(GRID_RADIUS, gameState);
  gameState.grid = grid;

  renderGrid(grid, DOM.svg, tileElements, GRID_RADIUS);

  gameState.allTiles = tileElements;

  // attach swipe listeners once
  if (DOM.svg && !DOM.svg.dataset.swipeListeners) {
// Pointer and Touch Event Setup
DOM.svg.addEventListener('pointerdown', handlePointerDown, { passive: false });
DOM.svg.addEventListener('pointermove', handlePointerMove, { passive: false });
window.addEventListener('pointerup', handlePointerUp);

DOM.svg.addEventListener('touchstart', handlePointerDown, { passive: false }); // Fallback for touch events
DOM.svg.addEventListener('touchmove', handlePointerMove, { passive: false });
window.addEventListener('touchend', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
    DOM.svg.dataset.swipeListeners = 'true';
  }

  const clearButton = document.getElementById('clear-word');
  if (clearButton && !clearButton.dataset.listener) {
    clearButton.addEventListener('click', clearCurrentSelection);
    clearButton.dataset.listener = 'true';
  }
}
