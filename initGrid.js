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
      // Remove selection from parent <g>, polygon, and text elements
      tile.element.classList.remove('selected');
      
      const poly = tile.element.querySelector('polygon');
      if (poly) {
        poly.classList.remove('selected');
        poly.classList.remove('valid-shimmer');
        poly.style.removeProperty('--shimmer-delay');
      }
      
      const letter = tile.element.querySelector('.tile-letter');
      if (letter) letter.classList.remove('selected');
      
      const point = tile.element.querySelector('.tile-point');
      if (point) point.classList.remove('selected');
    }
  });

  gameState.selectedTiles = [];
  updateWordPreview();
  
  // Dispatch selection:changed event
  window.dispatchEvent(new CustomEvent('selection:changed'));

  // extra safety: remove any leftover shimmer (polygons only)
  document.querySelectorAll('polygon.valid-shimmer').forEach(poly => {
    poly.classList.remove('valid-shimmer');
    poly.style.removeProperty('--shimmer-delay');
  });
}


// ============================================================================
// Event Handlers
// ============================================================================

// Helper to select a tile visually (apply classes to all elements)
function selectTile(tile) {
  if (!tile || !tile.element) return;
  
  // Add selection to parent <g>
  tile.element.classList.add('selected');
  
  // Add selection to polygon
  const poly = tile.element.querySelector('polygon');
  if (poly) poly.classList.add('selected');
  
  // Add selection to letter and point text
  const letter = tile.element.querySelector('.tile-letter');
  if (letter) letter.classList.add('selected');
  
  const point = tile.element.querySelector('.tile-point');
  if (point) point.classList.add('selected');
}

// Helper to unselect a tile visually (remove classes from all elements)
function unselectTile(tile) {
  if (!tile || !tile.element) return;
  
  // Remove selection from parent <g>
  tile.element.classList.remove('selected');
  
  // Remove selection from polygon
  const poly = tile.element.querySelector('polygon');
  if (poly) poly.classList.remove('selected');
  
  // Remove selection from letter and point text
  const letter = tile.element.querySelector('.tile-letter');
  if (letter) letter.classList.remove('selected');
  
  const point = tile.element.querySelector('.tile-point');
  if (point) point.classList.remove('selected');
}

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

    // Swiping back over the last tile → undo last step (backtrack)
    if (isLast && selectedTiles.length > 1) {
      selectedTiles.pop();
      unselectTile(tile);
      updateWordPreview();
      window.dispatchEvent(new CustomEvent('selection:changed'));
    }

    // Older tiles in the chain are ignored (path stays as-is)
    return;
  }

  // ------------------------------------------------------------
  // Case 2: First tile in this swipe
  // ------------------------------------------------------------
  if (selectedTiles.length === 0) {
    selectTile(tile);
    selectedTiles.push(tile);
    updateWordPreview();
    window.dispatchEvent(new CustomEvent('selection:changed'));
    return;
  }

  // ------------------------------------------------------------
  // Case 3: Must be adjacent to extend path
  // ------------------------------------------------------------
  const lastTile = selectedTiles[selectedTiles.length - 1];

  if (!areAxialNeighbors(lastTile, tile)) {
    return;
  }

  selectTile(tile);
  selectedTiles.push(tile);
  updateWordPreview();
  window.dispatchEvent(new CustomEvent('selection:changed'));
}



// ============================================================================
// Initialization
// ============================================================================

let __initCount = 0;
let activePointerId = null;

function handlePointerDown(e) {
  e.preventDefault(); // Prevents default touch behaviors (scroll, zoom)
  
  const tile = getTileFromEventTarget(e.target);
  if (!tile) return;

  // Start dragging and capture pointer
  isDragging = true;
  lastHoverTile = tile;
  activePointerId = e.pointerId;

  // Attempt pointer capture for smooth drag
  try {
    e.target.setPointerCapture?.(e.pointerId);
  } catch (err) {
    // Pointer capture may fail on some elements, that's okay
  }

  // Clear any existing selection and start fresh
  clearCurrentSelection();
  if (!Array.isArray(gameState.selectedTiles)) {
    gameState.selectedTiles = [];
  }

  // IMMEDIATELY select the first tile (no need to wait for pointermove)
  selectTile(tile);
  gameState.selectedTiles.push(tile);
  updateWordPreview();
  window.dispatchEvent(new CustomEvent('selection:changed'));
}


function handlePointerMove(e) {
  if (!isDragging) return;

  const tile = getTileFromEventTarget(e.target);
  if (!tile || tile === lastHoverTile) return;

  handleSwipeTileStep(tile);
  lastHoverTile = tile;
}


function handlePointerUp(e) {
  if (!isDragging) return;

  isDragging = false;
  lastHoverTile = null;

  // Release pointer capture if held
  if (activePointerId !== null) {
    try {
      e.target.releasePointerCapture?.(activePointerId);
    } catch (err) {
      // Ignore errors on release
    }
    activePointerId = null;
  }

  // Path persists after lifting finger (no auto-clear)
  // Just update preview one final time
  updateWordPreview();
  window.dispatchEvent(new CustomEvent('selection:changed'));
}



export function initializeGrid() {
  __initCount++;

  gameState.totalScore = 0;
  tileElements.length = 0;

  grid = generateSeededBoard(GRID_RADIUS, gameState);
  gameState.grid = grid;

  renderGrid(grid, DOM.svg, tileElements, GRID_RADIUS);

  gameState.allTiles = tileElements;

  // Attach pointer event listeners once (ONLY pointer events, no duplicate touch listeners)
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
  
  // Dispatch initial selection:changed event for UI sync
  window.dispatchEvent(new CustomEvent('selection:changed'));
}
