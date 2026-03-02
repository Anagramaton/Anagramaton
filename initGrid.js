import { generateSeededBoard } from './gridLogic.js';
import { renderGrid } from './gridRenderer.js';
import { gameState } from './gameState.js';
import { GRID_RADIUS } from './constants.js';
import { areAxialNeighbors } from './utils.js';
import { isValidWord } from './gameLogic.js';
import { recomputeAllWordScores } from './scoreLogic.js';


export const DOM = {
  svg: document.getElementById('hex-grid'),
  wordList: document.getElementById('word-list'),
};
export let tileElements = [];
export let grid;

// O(1) tile lookup map — rebuilt each time initializeGrid runs
let tileElementMap = new Map();


function playSound(id) {
  const el = document.getElementById(id);
  if (!el) return;
  try {
    el.currentTime = 0;
    el.play().catch(err => console.warn(`[audio] ${id} blocked:`, err));
  } catch (e) {
    console.warn(`[audio] ${id} error:`, e);
  }
}


// swipe / drag state
let isDragging = false;
let lastHoverTile = null;

// O(1) lookup instead of O(n) find
function getTileFromEventTarget(target) {
  if (!target) return null;
  const g = target.closest?.('.tile');
  if (!g) return null;
  return tileElementMap.get(g) || null;
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
      tile.setSelected(false);
      const poly = tile.element.querySelector('polygon');
      if (poly) {
        poly.classList.remove('valid-shimmer');
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
    // Deselect all tiles after the tapped one (backtrack)
    for (let i = selectedTiles.length - 1; i > idx; i--) {
      const t = selectedTiles[i];
      t.setSelected(false);
      selectedTiles.pop();
    }

    updateWordPreview();

    const index = Math.min(selectedTiles.length, 25);
    if (index > 0) {
      playSound(`sfxSwipe${index}`); // ← immediate, no requestAnimationFrame
    }

    return;
  }

  // New tile: enforce adjacency, then select and extend the path
  if (selectedTiles.length === 0 || areAxialNeighbors(selectedTiles[selectedTiles.length - 1], tile)) {
    tile.setSelected(true);
    selectedTiles.push(tile);
    updateWordPreview();

    const index = Math.min(selectedTiles.length, 25);
    if (index > 0) {
      playSound(`sfxSwipe${index}`); // ← immediate, no requestAnimationFrame
    }
  }
}

function handlePointerDown(e) {
  e.preventDefault();
  const tile = getTileFromEventTarget(e.target);
  if (!tile) return;

  isDragging = true;
  lastHoverTile = tile;

  clearCurrentSelection();
  handleSwipeTileStep(tile);
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
  gameState.boardSolverReady = null;  // reset so new game gets a fresh promise
  tileElements.length = 0;

  grid = generateSeededBoard(GRID_RADIUS, gameState);
  gameState.grid = grid;

  renderGrid(grid, DOM.svg, tileElements, GRID_RADIUS);

  gameState.allTiles = tileElements;

  // Rebuild O(1) lookup map
  tileElementMap.clear();
  for (const tile of tileElements) {
    if (tile?.element) tileElementMap.set(tile.element, tile);
  }

  // Trigger initial styling so pre-reuse tiles show stage-1 value on load
  recomputeAllWordScores([]);

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