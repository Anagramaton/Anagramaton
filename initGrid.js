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
    // Dispatch selection:changed event
    window.dispatchEvent(new Event('selection:changed'));
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

  // Dispatch selection:changed event
  window.dispatchEvent(new Event('selection:changed'));
}

export function clearCurrentSelection() {
  const selectedTiles = gameState.selectedTiles || [];
  selectedTiles.forEach(tile => {
    if (tile?.setSelected) {
      tile.setSelected(false);
    } else if (tile?.element) {
      // Fallback: manually remove classes
      const g = tile.element;
      const poly = g.querySelector('polygon');
      const letter = g.querySelector('.tile-letter');
      const point = g.querySelector('.tile-point');
      
      g.classList.remove('selected');
      if (poly) {
        poly.classList.remove('selected');
        poly.classList.remove('valid-shimmer');
        poly.style.removeProperty('--shimmer-delay');
      }
      if (letter) letter.classList.remove('selected');
      if (point) point.classList.remove('selected');
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
// Helper functions for tile selection
// ============================================================================

function markTileSelected(tile) {
  if (!tile) return;
  if (tile.setSelected) {
    tile.setSelected(true);
  } else if (tile.element) {
    // Fallback: manually add classes
    const g = tile.element;
    const poly = g.querySelector('polygon');
    const letter = g.querySelector('.tile-letter');
    const point = g.querySelector('.tile-point');
    
    g.classList.add('selected');
    if (poly) poly.classList.add('selected');
    if (letter) letter.classList.add('selected');
    if (point) point.classList.add('selected');
  }
}

function unselectLastTile() {
  const selectedTiles = gameState.selectedTiles || [];
  if (selectedTiles.length === 0) return null;
  
  const tile = selectedTiles.pop();
  if (tile?.setSelected) {
    tile.setSelected(false);
  } else if (tile?.element) {
    // Fallback: manually remove classes
    const g = tile.element;
    const poly = g.querySelector('polygon');
    const letter = g.querySelector('.tile-letter');
    const point = g.querySelector('.tile-point');
    
    g.classList.remove('selected');
    if (poly) {
      poly.classList.remove('selected');
      poly.classList.remove('valid-shimmer');
      poly.style.removeProperty('--shimmer-delay');
    }
    if (letter) letter.classList.remove('selected');
    if (point) point.classList.remove('selected');
  }
  return tile;
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

  // ------------------------------------------------------------
  // Case 1: Tile already in current path
  // ------------------------------------------------------------
  if (isAlreadySelected) {
    const isLast = tile === selectedTiles[selectedTiles.length - 1];

    // Swiping back over the last tile → undo last step (backtracking)
    if (isLast) {
      unselectLastTile();
      updateWordPreview();
    }

    // Older tiles in the chain are ignored (path stays as-is)
    return;
  }

  // ------------------------------------------------------------
  // Case 2: First tile in this swipe
  // ------------------------------------------------------------
  if (selectedTiles.length === 0) {
    markTileSelected(tile);
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

  markTileSelected(tile);
  selectedTiles.push(tile);
  updateWordPreview();
}



// ============================================================================
// Initialization
// ============================================================================

let __initCount = 0;

function handlePointerDown(e) {
  e.preventDefault(); // Prevents default touch behaviors (scroll, zoom)
  
  const tile = getTileFromEventTarget(e.target);
  if (!tile) {
    isDragging = false;
    return;
  }

  // Clear previous selection and start fresh
  clearCurrentSelection();
  gameState.selectedTiles = [];
  
  isDragging = true;
  lastHoverTile = tile;

  // Immediately select the first tile
  markTileSelected(tile);
  gameState.selectedTiles.push(tile);
  updateWordPreview();

  // Attempt pointer capture for smoother touch drags
  if (e.pointerId !== undefined && e.target.setPointerCapture) {
    try {
      e.target.setPointerCapture(e.pointerId);
    } catch (err) {
      // Pointer capture not supported or failed, continue without it
    }
  }
}


function handlePointerMove(e) {
  if (!isDragging) return;

  const tile = getTileFromEventTarget(e.target);
  if (!tile || tile === lastHoverTile) return;

  handleSwipeTileStep(tile);
  lastHoverTile = tile;
}


function handlePointerUp(e) {
  // Release pointer capture if it was set
  if (e.pointerId !== undefined && e.target.releasePointerCapture) {
    try {
      e.target.releasePointerCapture(e.pointerId);
    } catch (err) {
      // Pointer capture wasn't set or release failed
    }
  }

  isDragging = false;
  lastHoverTile = null;

  // No tiles selected during this swipe → nothing to lock in
  if (!Array.isArray(gameState.selectedTiles) || gameState.selectedTiles.length === 0) {
    return;
  }

  // Finalize the preview
  updateWordPreview();
}



export function initializeGrid() {
  __initCount++;

  gameState.totalScore = 0;
  gameState.selectedTiles = [];
  tileElements.length = 0;

  grid = generateSeededBoard(GRID_RADIUS, gameState);
  gameState.grid = grid;

  renderGrid(grid, DOM.svg, tileElements, GRID_RADIUS);

  gameState.allTiles = tileElements;

  // attach swipe listeners once (only pointer events, no duplicate touch listeners)
  if (DOM.svg && !DOM.svg.dataset.swipeListeners) {
    DOM.svg.addEventListener('pointerdown', handlePointerDown, { passive: false });
    DOM.svg.addEventListener('pointermove', handlePointerMove, { passive: false });
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
    DOM.svg.dataset.swipeListeners = 'true';
  }

  const clearButton = document.getElementById('clear-word');
  if (clearButton && !clearButton.dataset.listener) {
    clearButton.addEventListener('click', clearCurrentSelection);
    clearButton.dataset.listener = 'true';
  }
}
