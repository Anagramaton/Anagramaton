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

  // hide drag indicator if present
  clearDragIndicator();
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
      // update visual trail if needed
      updateDragIndicator();
    } else {
      console.warn('Tried to deselect non-last tile');
      alert('❌ You can only deselect the most recently selected tile.');
      tile.element.classList.add('selected');
    }
    return;
  }

  // --- If this is the first selection
  if (selectedTiles.length === 0) {
    console.log('Selecting first tile');
    tile.element.classList.add('selected');
    selectedTiles.push(tile);
    updateWordPreview();
    updateDragIndicator();
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
  updateDragIndicator();
}

// ============================================================================
// Touch/Swipe drag-selection implementation + drag indicator
// ============================================================================

let __isPointerDragging = false;
let __dragPointerId = null;
let __lastHoveredTileEl = null;
let __dragIndicatorPath = null;

/**
 * Convert screen (client) coordinates to SVG coordinates for this svg.
 */
function screenToSvgPoint(svg, clientX, clientY) {
  try {
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: clientX, y: clientY };
    const inv = ctm.inverse();
    const sp = pt.matrixTransform(inv);
    return { x: sp.x, y: sp.y };
  } catch (e) {
    // fallback: return client coords
    return { x: clientX, y: clientY };
  }
}

/**
 * Ensure a single SVG path element exists for the drag indicator.
 * Styles inline to match CSS .selected .hex-tile fill color (#4cc9f0)
 */
function createDragIndicator(svg) {
  if (!svg) return null;
  if (__dragIndicatorPath) return __dragIndicatorPath;
  const svgns = 'http://www.w3.org/2000/svg';
  const path = document.createElementNS(svgns, 'path');
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', '#4cc9f0'); // matches .selected fill
  path.setAttribute('stroke-width', '8');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  path.setAttribute('opacity', '0.28');
  path.setAttribute('pointer-events', 'none');
  path.classList.add('drag-indicator');
  // put the indicator under tiles (append first)
  svg.insertBefore(path, svg.firstChild);
  __dragIndicatorPath = path;
  return path;
}

/**
 * Build/update the indicator path d attribute based on selected tile centers
 * and optional current pointer position (for a live tail).
 */
function updateDragIndicator(pointerPos) {
  const svg = DOM.svg;
  if (!svg) return;
  const path = createDragIndicator(svg);
  const selected = Array.isArray(gameState.selectedTiles) ? gameState.selectedTiles : [];

  // compute center points of selected tiles (in svg coords)
  const points = [];
  selected.forEach(t => {
    if (!t?.element) return;
    try {
      const bbox = t.element.getBBox();
      const cx = bbox.x + bbox.width / 2;
      const cy = bbox.y + bbox.height / 2;
      points.push({ x: cx, y: cy });
    } catch (e) {
      // ignore elements without bbox
    }
  });

  // include pointer tail if provided (converted to SVG coords)
  let tail = null;
  if (pointerPos && typeof pointerPos.x === 'number' && typeof pointerPos.y === 'number') {
    tail = screenToSvgPoint(svg, pointerPos.x, pointerPos.y);
  }

  // Build path: move to first, line through centers, then to tail
  let d = '';
  if (points.length > 0) {
    d = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      d += ` L ${points[i].x} ${points[i].y}`;
    }
    if (tail) d += ` L ${tail.x} ${tail.y}`;
  } else if (tail) {
    // no selected tiles yet, draw a small dot/short line at pointer
    d = `M ${tail.x} ${tail.y} L ${tail.x} ${tail.y}`;
  }

  if (!d) {
    path.setAttribute('d', '');
    path.style.display = 'none';
  } else {
    path.setAttribute('d', d);
    path.style.display = 'block';
  }
}

function clearDragIndicator() {
  if (!__dragIndicatorPath) return;
  __dragIndicatorPath.setAttribute('d', '');
  __dragIndicatorPath.style.display = 'none';
}

/**
 * Map a DOM element (or any ancestor) to a tile object in tileElements.
 * We ensure during initialization that each tile.element has class 'hex-tile'
 * and dataset.tileIndex so this lookup is fast.
 */
function elementToTile(el) {
  if (!el) return null;
  const tileEl = el.closest?.('.hex-tile') || null;
  if (!tileEl) return null;
  const idx = tileEl.dataset?.tileIndex;
  if (typeof idx === 'undefined') return null;
  const i = Number(idx);
  return Number.isFinite(i) ? tileElements[i] : null;
}

/**
 * Select logic used while dragging. Mirrors the rules in handleTileClick but
 * avoids alert() for non-last deselect attempts (we just ignore those).
 *
 * Behavior:
 * - first tile starts a fresh selection (we clear previous)
 * - selecting adjacent tiles appends to selection
 * - if user backtracks to the last tile, it pops
 * - non-adjacent tiles are ignored
 */
function dragSelectTile(tile) {
  if (!tile) return;
  if (!Array.isArray(gameState.selectedTiles)) gameState.selectedTiles = [];
  const selectedTiles = gameState.selectedTiles;

  // Already selected
  if (selectedTiles.includes(tile)) {
    // allow deselect only if it's the last selected (backtracking)
    if (tile === selectedTiles[selectedTiles.length - 1]) {
      selectedTiles.pop();
      tile.element.classList.remove('selected');
      updateWordPreview();
      updateDragIndicator();
    }
    // otherwise ignore (no alert during drag)
    return;
  }

  // If first selection, start fresh
  if (selectedTiles.length === 0) {
    clearCurrentSelection();
    tile.element.classList.add('selected');
    selectedTiles.push(tile);
    updateWordPreview();
    updateDragIndicator();
    return;
  }

  const lastTile = selectedTiles[selectedTiles.length - 1];
  if (!areAxialNeighbors(lastTile, tile)) {
    // ignore non-adjacent tiles during drag
    return;
  }

  // adjacent: select
  tile.element.classList.add('selected');
  selectedTiles.push(tile);
  updateWordPreview();
  updateDragIndicator();
}

/**
 * Attach pointer handlers to the SVG for touch drag-selection.
 * Only attaches once per SVG; safe to call each init.
 */
function attachSwipeHandlers(svg) {
  if (!svg || svg.dataset?.swipeListener === 'true') return;

  // pointerdown: start drag if touching a tile
  svg.addEventListener('pointerdown', (evt) => {
    // only enable swipe selection for touch input
    if (evt.pointerType !== 'touch') return;

    const tile = elementToTile(evt.target);
    if (!tile) return;

    // start new drag selection
    __isPointerDragging = true;
    __dragPointerId = evt.pointerId;
    __lastHoveredTileEl = tile.element;

    // prevent default behavior (scroll/pan) while dragging
    evt.preventDefault();

    // capture pointer on the svg so we keep receiving move/up
    try { evt.target.setPointerCapture(evt.pointerId); } catch (_) {}

    // clear previous selection and select initial tile
    clearCurrentSelection();
    dragSelectTile(tile);

    // show initial drag indicator (with pointer tail)
    updateDragIndicator({ x: evt.clientX, y: evt.clientY });
  }, { passive: false });

  // pointermove: detect tiles under pointer and select them
  svg.addEventListener('pointermove', (evt) => {
    if (!__isPointerDragging) return;
    if (evt.pointerId !== __dragPointerId) return;
    if (evt.pointerType !== 'touch') return;

    // find element under the pointer coordinates (works better if touch moved fast)
    const el = document.elementFromPoint(evt.clientX, evt.clientY);
    if (!el) {
      // still update the tail even if not over an element
      updateDragIndicator({ x: evt.clientX, y: evt.clientY });
      return;
    }

    const tile = elementToTile(el);
    if (!tile) {
      updateDragIndicator({ x: evt.clientX, y: evt.clientY });
      return;
    }

    // ignore repeated events on the same tile element
    if (tile.element === __lastHoveredTileEl) {
      updateDragIndicator({ x: evt.clientX, y: evt.clientY });
      return;
    }
    __lastHoveredTileEl = tile.element;

    // prevent default to stop page from scrolling
    evt.preventDefault();

    // process selection for this tile
    dragSelectTile(tile);

    // update indicator including pointer tail
    updateDragIndicator({ x: evt.clientX, y: evt.clientY });
  }, { passive: false });

  // pointerup / pointercancel: end drag
  const endDrag = (evt) => {
    if (!__isPointerDragging) return;
    if (evt.pointerId !== __dragPointerId) return;
    __isPointerDragging = false;
    __dragPointerId = null;
    __lastHoveredTileEl = null;

    try { evt.target.releasePointerCapture?.(evt.pointerId); } catch (_) {}

    // hide tail but keep indicator showing the final path briefly (or clear immediately)
    // Clear immediately for a clean stop:
    clearDragIndicator();
  };

  svg.addEventListener('pointerup', endDrag);
  svg.addEventListener('pointercancel', endDrag);

  svg.dataset.swipeListener = 'true';
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

  // Ensure each tileElement DOM node is annotated for quick lookup by swipe code.
  // This also makes the tile nodes selectable via .closest('.hex-tile').
  if (Array.isArray(tileElements)) {
    tileElements.forEach((tile, idx) => {
      if (tile?.element) {
        tile.element.classList.add('hex-tile');
        // assign a stable index for mapping
        tile.element.dataset.tileIndex = String(idx);
      }
    });
  }

  gameState.allTiles = tileElements;

  // attach swipe handlers (touch drag across tiles)
  attachSwipeHandlers(DOM.svg);

  // ensure drag indicator exists but is hidden until used
  createDragIndicator(DOM.svg);
  clearDragIndicator();

  const clearButton = document.getElementById('clear-word');
  if (clearButton && !clearButton.dataset.listener) {
    clearButton.addEventListener('click', clearCurrentSelection);
    clearButton.dataset.listener = 'true';
  }


}