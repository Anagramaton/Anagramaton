
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
}

// ============================================================================
// Event Handlers
// ============================================================================

export function handleTileClick(tile) {
  if (!Array.isArray(gameState.selectedTiles)) {
    gameState.selectedTiles = [];
  }
  const selectedTiles = gameState.selectedTiles;

  // --- If tile already selected...
  if (selectedTiles.includes(tile)) {
    // ...allow deselect only if it's the last selected (stack pop)
    if (tile === selectedTiles[selectedTiles.length - 1]) {
      selectedTiles.pop();
      tile.element.classList.remove('selected');
      updateWordPreview();
    } else {
      // Alert only for tap/click misuse, not drag
      // console.warn('Tried to deselect non-last tile');
      // alert('❌ You can only deselect the most recently selected tile.');
      tile.element.classList.add('selected');
    }
    return;
  }

  // --- If this is the first selection
  if (selectedTiles.length === 0) {
    tile.element.classList.add('selected');
    selectedTiles.push(tile);
    updateWordPreview();
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
}

// ============================================================================
// Touch Drag Selection (MOBILE)
// ============================================================================

let isTouchSelecting = false;      // If user is dragging/touching
let lastDragTile = null;           // Last tile on drag path

function getTileFromTouch(touch) {
  // Use elementFromPoint & .hex-tile, but allow nested elements by using closest()
  const el = document.elementFromPoint(touch.clientX, touch.clientY);
  if (!el) return null;

  // Prefer an element that has an identifying dataset.key or id, or the tile group/class.
  const tileEl = el.closest('[data-key], .hex-tile, .tile');
  if (!tileEl) return null;

  const key = tileEl.dataset?.key || tileEl.id;
  if (!key) return null;

  return tileElements.find(t => t.key === key);
}

// Backtrack: Allows user to drag back to previous tile to undo
function tryBacktrack(newTile) {
  const sel = gameState.selectedTiles || [];
  if (sel.length > 1 && sel[sel.length - 2] === newTile) {
    // Remove last tile
    const last = sel.pop();
    last.element.classList.remove('selected');
    lastDragTile = sel[sel.length - 1];
    updateWordPreview();
    return true;
  }
  return false;
}

function handleDragTouch(touch) {
  if (gameState.listLocked) return; // No selection if locked

  const tileObj = getTileFromTouch(touch);
  if (!tileObj) return;

  // Start selection
  if (!isTouchSelecting) {
    isTouchSelecting = true;
    clearCurrentSelection();
    lastDragTile = tileObj;
    handleTileClick(tileObj);
    return;
  }

  const sel = gameState.selectedTiles || [];
  if (sel.includes(tileObj)) {
    // If dragging back (undo/backtrack)
    if (tryBacktrack(tileObj)) return;
    // Else, do not allow skip or loop
    return;
  }

  // Should only add if it's adjacent to last
  if (lastDragTile && !areAxialNeighbors(lastDragTile, tileObj)) return;

  // Select this tile
  handleTileClick(tileObj);
  lastDragTile = tileObj;
}

// --- Touch event listeners ---
function onTouchStart(e) {
  if (e.touches.length !== 1) return; // Only single-finger!
  isTouchSelecting = false;
  lastDragTile = null;
  clearCurrentSelection();
  handleDragTouch(e.touches[0]);
  // preventDefault to stop scrolling/pinch; event listener added with passive:false
  try { e.preventDefault(); } catch (err) { /* ignore */ }
}
function onTouchMove(e) {
  if (e.touches.length !== 1) return;
  handleDragTouch(e.touches[0]);
  try { e.preventDefault(); } catch (err) { /* ignore */ }
}
function onTouchEnd(e) {
  isTouchSelecting = false;
  lastDragTile = null;

  // Submit word if length >= 4 & valid
  const sel = gameState.selectedTiles || [];
  const word = sel.map(t => t.letter).join('').toUpperCase();
  if (word.length >= 4 && isValidWord(word)) {
    window.dispatchEvent(new Event('drag:word:ready'));
    // (You can call handleSubmitWordClick() here if you want instant submit)
  }
}
function onTouchCancel(e) {
  isTouchSelecting = false;
  lastDragTile = null;
  clearCurrentSelection();
}

// --- Pointer event listeners (better coverage & unified handling) ---
function onPointerDown(e) {
  // only handle primary pointers (avoid multi-touch) — treat touch/pointer similarly
  if (e.isPrimary === false) return;
  isTouchSelecting = false;
  lastDragTile = null;
  clearCurrentSelection();
  handleDragTouch(e);
  try { e.preventDefault(); } catch (err) { /* ignore */ }
  // capture pointer so move/up stay targeted to svg
  try { e.target.setPointerCapture?.(e.pointerId); } catch (err) { /* ignore */ }
}
function onPointerMove(e) {
  if (e.isPrimary === false) return;
  handleDragTouch(e);
  try { e.preventDefault(); } catch (err) { /* ignore */ }
}
function onPointerUp(e) {
  if (e.isPrimary === false) return;
  isTouchSelecting = false;
  lastDragTile = null;
  const sel = gameState.selectedTiles || [];
  const word = sel.map(t => t.letter).join('').toUpperCase();
  if (word.length >= 4 && isValidWord(word)) {
    window.dispatchEvent(new Event('drag:word:ready'));
  }
  try { e.target.releasePointerCapture?.(e.pointerId); } catch (err) { /* ignore */ }
}
function onPointerCancel(e) {
  isTouchSelecting = false;
  lastDragTile = null;
  clearCurrentSelection();
  try { e.target.releasePointerCapture?.(e.pointerId); } catch (err) { /* ignore */ }
}

// ============================================================================
// Initialization
// ============================================================================

let __initCount = 0;

export function initializeGrid() {
  __initCount++;

  gameState.totalScore = 0;
  tileElements.length = 0;

  grid = generateSeededBoard(GRID_RADIUS, gameState);
  gameState.grid = grid;

  renderGrid(grid, DOM.svg, tileElements, handleTileClick, GRID_RADIUS);

  gameState.allTiles = tileElements;

  const clearButton = document.getElementById('clear-word');
  if (clearButton && !clearButton.dataset.listener) {
    clearButton.addEventListener('click', clearCurrentSelection);
    clearButton.dataset.listener = 'true';
  }

  // Attach drag event listeners for mobile (idempotent)
  DOM.svg.removeEventListener('touchstart', onTouchStart);
  DOM.svg.removeEventListener('touchmove', onTouchMove);
  DOM.svg.removeEventListener('touchend', onTouchEnd);
  DOM.svg.removeEventListener('touchcancel', onTouchCancel);

  DOM.svg.addEventListener('touchstart', onTouchStart, { passive: false });
  DOM.svg.addEventListener('touchmove', onTouchMove, { passive: false });
  DOM.svg.addEventListener('touchend', onTouchEnd, { passive: false });
  DOM.svg.addEventListener('touchcancel', onTouchCancel, { passive: false });

  // Add pointer event listeners for broader support (pointer events unify mouse/touch)
  DOM.svg.removeEventListener('pointerdown', onPointerDown);
  DOM.svg.removeEventListener('pointermove', onPointerMove);
  DOM.svg.removeEventListener('pointerup', onPointerUp);
  DOM.svg.removeEventListener('pointercancel', onPointerCancel);

  DOM.svg.addEventListener('pointerdown', onPointerDown, { passive: false });
  DOM.svg.addEventListener('pointermove', onPointerMove, { passive: false });
  DOM.svg.addEventListener('pointerup', onPointerUp, { passive: false });
  DOM.svg.addEventListener('pointercancel', onPointerCancel, { passive: false });
}